import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApiErrorResponseDto, OrderResponseDto, OrderQuoteResponseDto } from '../../common/swagger/swagger-response.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Place order',
    description: [
      'Validates address ownership, stock, payment method, and deposit rules.',
      '`returnedCanCount` reduces chargeable cans for deposit calculation when deposits are enabled.',
      'Emits real-time `order.updated` to the customer (Socket.IO `/orders`).',
    ].join('\n'),
  })
  @ApiCreatedResponse({
    description: 'Persisted order with lines, address snapshot, amounts, and delivery fields.',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid address, stock, items, or business rule violation.',
    type: ApiErrorResponseDto,
  })
  create(@Req() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, dto);
  }

  @Post('quote')
  @ApiOperation({
    summary: 'Price quote (no persistence)',
    description:
      'Same body as create order. Returns subtotal, deposit breakdown, promo tier discount, and total — use for checkout UI before submit.',
  })
  @ApiOkResponse({ description: 'Computed totals only.', type: OrderQuoteResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid address, products, or quantities.', type: ApiErrorResponseDto })
  quote(@Req() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.quote(req.user.id, dto);
  }

  @Get('my')
  @ApiOperation({
    summary: 'My order history',
    description: 'Newest first. Same order shape as track, without admin-only `user` block.',
  })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true })
  findMy(@Req() req: RequestWithUser) {
    return this.ordersService.findMyOrders(req.user.id);
  }

  @Get(':id/track')
  @ApiOperation({
    summary: 'Track single order',
    description:
      'Warehouse `status` progresses RECEIVED → CONFIRMED → PACKED → DISPATCHED → DELIVERED (or CANCELLED). `deliveryStatus` reflects partner workflow when assigned.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found or not owned by caller.', type: ApiErrorResponseDto })
  track(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.ordersService.track(req.user.id, id);
  }
}
