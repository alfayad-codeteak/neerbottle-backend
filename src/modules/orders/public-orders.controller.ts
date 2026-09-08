import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { ApiErrorResponseDto, PublicOrderStatusDto } from '../../common/swagger/swagger-response.dto';
import { normalizePublicOrderNumber } from './order-number';

@ApiTags('Orders')
@Controller('orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('public/:orderNumber')
  @ApiOperation({
    summary: 'Public order status by number',
    description:
      'No login. Number is DDMMYYYY + 3-digit daily sequence (IST), e.g. 08092026001 for the first order on 8 Sep 2026. Does not return phone, street address, or amounts.',
  })
  @ApiParam({
    name: 'orderNumber',
    example: '08092026001',
    description: 'Digits only. Keep leading zeros.',
  })
  @ApiOkResponse({ type: PublicOrderStatusDto })
  @ApiResponse({ status: 404, description: 'Unknown order number.', type: ApiErrorResponseDto })
  publicStatus(@Param('orderNumber') orderNumber: string) {
    const normalized = normalizePublicOrderNumber(orderNumber);
    if (normalized.length < 8) {
      throw new NotFoundException('Order not found');
    }
    return this.ordersService.publicTrackByNumber(normalized);
  }
}
