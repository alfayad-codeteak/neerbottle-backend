import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

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
  @ApiOperation({ summary: 'Create new order (cart + address + time slot + payment)' })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({ status: 400, description: 'Invalid address, insufficient stock, or invalid items' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my own orders' })
  @ApiResponse({ status: 200, description: 'List of orders (date, items, status, amount)' })
  findMy(@Req() req: RequestWithUser) {
    return this.ordersService.findMyOrders(req.user.id);
  }

  @Get(':id/track')
  @ApiOperation({ summary: 'Track one order – current status' })
  @ApiResponse({ status: 200, description: 'Order with status (Received → Confirmed → Packed → Dispatched → Delivered)' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  track(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.ordersService.track(req.user.id, id);
  }
}
