import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { ApiErrorResponseDto, PublicOrderStatusDto } from '../../common/swagger/swagger-response.dto';
import { normalizePublicOrderNumber } from './order-number';

@ApiTags('Orders')
@Controller('orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('track-by-number')
  @ApiOperation({
    summary: 'Public order status by number',
    description: 'No login. Query `n` is the customer order number (digits). Leading zeros are preserved.',
  })
  @ApiQuery({ name: 'n', example: '08092026001', required: true })
  @ApiOkResponse({ type: PublicOrderStatusDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  publicStatusQuery(@Query('n') n: string) {
    return this.lookup(n);
  }

  @Get('public/:orderNumber')
  @ApiOperation({ summary: 'Public order status by number (path)' })
  @ApiParam({ name: 'orderNumber', example: '08092026001' })
  @ApiOkResponse({ type: PublicOrderStatusDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  publicStatusPath(@Param('orderNumber') orderNumber: string) {
    return this.lookup(orderNumber);
  }

  private lookup(raw: string | undefined) {
    const normalized = normalizePublicOrderNumber(raw ?? '');
    if (normalized.length < 4) {
      throw new NotFoundException('Order not found');
    }
    return this.ordersService.publicTrackByNumber(normalized);
  }
}
