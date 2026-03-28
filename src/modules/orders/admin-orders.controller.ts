import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { AssignOrderDto } from './dto/assign-order.dto';
import { DepositsService } from '../deposits/deposits.service';
import { ApiErrorResponseDto, OrderResponseDto, DepositRefundResponseDto } from '../../common/swagger/swagger-response.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Admin – Orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly depositsService: DepositsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search and list orders',
    description:
      'Operations view with customer `user` on each row. Filters are optional query params; combine as needed. Dates are ISO date or datetime strings interpreted server-side.',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Inclusive lower bound on `createdAt`',
    example: '2026-03-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Inclusive upper bound on `createdAt`',
    example: '2026-03-31',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Warehouse status filter (e.g. RECEIVED, DISPATCHED)',
    example: 'PACKED',
  })
  @ApiQuery({
    name: 'phone',
    required: false,
    description: 'Partial match on customer phone',
    example: '98765',
  })
  @ApiQuery({
    name: 'timeSlot',
    required: false,
    description: 'Exact time slot string match',
    example: '10:00-12:00',
  })
  @ApiOkResponse({
    description: 'Each element includes nested `user` (customer).',
    type: OrderResponseDto,
    isArray: true,
  })
  findAll(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('phone') phone?: string,
    @Query('timeSlot') timeSlot?: string,
  ) {
    return this.ordersService.findAllAdmin({
      dateFrom,
      dateTo,
      status,
      phone,
      timeSlot,
    });
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign delivery partner',
    description: [
      'Body carries `deliveryPartnerId` (**DeliveryPartner** row id, not User id).',
      'Partner must be `isAvailable`. Cannot reassign after partner sets `PICKED_UP` or later.',
      'Sets `deliveryStatus` to ASSIGNED and notifies customer + partner over WebSocket.',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiOkResponse({ description: 'Updated order including `deliveryPartner` snippet.', type: OrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Partner offline, order cancelled, or invalid delivery state.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Order or partner not found.', type: ApiErrorResponseDto })
  assign(@Param('id') id: string, @Body() dto: AssignOrderDto) {
    return this.ordersService.assignOrderToPartner(id, dto.deliveryPartnerId);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Advance warehouse status',
    description:
      'Forward-only transitions along RECEIVED → CONFIRMED → PACKED → DISPATCHED → DELIVERED. Triggers `order.updated`.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Illegal transition.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel order',
    description: 'Allowed only before DISPATCHED. Sets status CANCELLED and notifies subscribers.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Already dispatched or delivered.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  cancel(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }

  @Post(':id/return-cans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refund order deposit (empty cans returned)',
    description:
      'Credits `depositCharge` back to the customer wallet, marks refund on the order, writes ledger row, then pushes `order.updated`.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiOkResponse({ description: 'Refund summary and new wallet balance.', type: DepositRefundResponseDto })
  @ApiResponse({
    status: 400,
    description: 'No deposit charged or already refunded.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async refundDeposit(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.depositsService.refundOrderDeposit(id, req.user.id);
    await this.ordersService.notifyOrderChanged(id);
    return result;
  }
}
