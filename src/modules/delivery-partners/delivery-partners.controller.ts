import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryPartnerGuard } from '../../common/guards/delivery-partner.guard';
import { DeliveryPartnersService } from './delivery-partners.service';
import { OrdersService } from '../orders/orders.service';
import { UpdateMyDeliveryPartnerDto } from './dto/update-my-delivery-partner.dto';
import { UpdatePartnerDeliveryStatusDto } from './dto/update-partner-delivery-status.dto';
import { ConfirmCansReceivedDto } from './dto/confirm-cans-received.dto';
import { ApiErrorResponseDto, DeliveryPartnerResponseDto, DispatchSettingsResponseDto, OrderResponseDto } from '../../common/swagger/swagger-response.dto';

interface RequestWithUser extends Request {
  user: { id: string; role: string };
}

@ApiTags('Delivery partners')
@Controller('delivery-partners')
export class DeliveryPartnersController {
  constructor(
    private readonly deliveryPartnersService: DeliveryPartnersService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Current partner profile',
    description: 'Requires JWT for `deliveryPartner` role.',
  })
  @ApiOkResponse({ type: DeliveryPartnerResponseDto })
  getMe(@Req() req: RequestWithUser) {
    return this.deliveryPartnersService.getProfileByUserId(req.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update profile / availability / location',
    description:
      'Cannot set `isAvailable: false` while holding active orders in ASSIGNED, PICKED_UP, or DELIVERED delivery states.',
  })
  @ApiOkResponse({ type: DeliveryPartnerResponseDto })
  @ApiResponse({ status: 400, description: 'Business rule violation.', type: ApiErrorResponseDto })
  updateMe(@Req() req: RequestWithUser, @Body() dto: UpdateMyDeliveryPartnerDto) {
    return this.deliveryPartnersService.updateMyProfile(req.user.id, dto);
  }

  @Get('self-assign')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Whether partner self-assign is enabled',
    description:
      'Admin-controlled. When false, hide Accept / available-orders UI; wait for admin assignment (`order.assigned`).',
  })
  @ApiOkResponse({ type: DispatchSettingsResponseDto })
  getSelfAssign() {
    return this.deliveryPartnersService.getDispatchSettings();
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Assigned orders',
    description:
      'Active jobs assigned to this partner (`ASSIGNED` / `PICKED_UP`). Delivered, cans-returned, and cancelled jobs are on `GET /delivery-partners/my-order-history`.',
  })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true })
  myOrders(@Req() req: RequestWithUser) {
    return this.ordersService.findOrdersForDeliveryPartner(req.user.id);
  }

  @Get('available-orders')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Open orders available to accept',
    description:
      'Unassigned orders (`deliveryStatus: NONE`). Partner must be online (`isAvailable`) to accept. First `POST .../accept` wins.',
  })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true })
  availableOrders() {
    return this.ordersService.findOpenOrdersForDeliveryPartner();
  }

  @Post('orders/:orderId/accept')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept (self-assign) an open order',
    description: [
      'Claims an unassigned order for this partner: `deliveryStatus` becomes `ASSIGNED`.',
      'Fails with 409 if another partner already took it, or admin assigned it.',
      'Requires `isAvailable: true`.',
    ].join('\n'),
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiOkResponse({ description: 'Assigned order snapshot.', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Partner is offline.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Order already taken.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  acceptOrder(@Req() req: RequestWithUser, @Param('orderId') orderId: string) {
    return this.ordersService.acceptOrderByPartner(req.user.id, orderId);
  }

  @Get('my-order-history')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Order history (past deliveries)',
    description:
      'JSON array of finished jobs for this rider. Includes last-mile `DELIVERED` (even if warehouse status is still RECEIVED), `CANS_RETURNED`, warehouse `DELIVERED`, and `CANCELLED`. Active `ASSIGNED` / `PICKED_UP` jobs stay on `GET /delivery-partners/my-orders`.',
  })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true })
  async myOrderHistory(@Req() req: RequestWithUser) {
    const rows = await this.ordersService.findDeliveryPartnerOrderHistory(req.user.id);
    return Array.isArray(rows) ? rows : [];
  }

  @Patch('orders/:orderId/delivery-status')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Advance delivery workflow',
    description: [
      'Single-step transitions only: ASSIGNED→PICKED_UP→DELIVERED→CANS_RETURNED.',
      'Request body `deliveryStatus` must be the **next** state (PICKED_UP, DELIVERED, or CANS_RETURNED).',
      '`PICKED_UP` sets warehouse `status` to `DISPATCHED` if it was still earlier. `DELIVERED` / `CANS_RETURNED` set warehouse `status` to `DELIVERED`.',
      'Optional `deliveryNotes` stored on the order.',
    ].join('\n'),
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiOkResponse({ description: 'Updated order snapshot.', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Wrong transition or not assignee.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  updateDeliveryStatus(
    @Req() req: RequestWithUser,
    @Param('orderId') orderId: string,
    @Body() dto: UpdatePartnerDeliveryStatusDto,
  ) {
    return this.ordersService.partnerUpdateDeliveryStatus(
      req.user.id,
      orderId,
      dto.deliveryStatus,
      dto.deliveryNotes,
    );
  }

  @Patch('orders/:orderId/confirm-cans-received')
  @UseGuards(JwtAuthGuard, DeliveryPartnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm cans received from customer',
    description:
      'Dedicated confirmation endpoint for partner app. Allowed only when current `deliveryStatus` is `DELIVERED`; sets `deliveryStatus` to `CANS_RETURNED`.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiOkResponse({ description: 'Updated order snapshot with `deliveryStatus: CANS_RETURNED`.', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Order not in DELIVERED step or not assignee.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  confirmCansReceived(
    @Req() req: RequestWithUser,
    @Param('orderId') orderId: string,
    @Body() dto: ConfirmCansReceivedDto,
  ) {
    return this.ordersService.partnerConfirmCansReceived(req.user.id, orderId, dto.deliveryNotes);
  }
}
