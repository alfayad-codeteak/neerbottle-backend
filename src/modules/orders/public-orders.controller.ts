import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { ApiErrorResponseDto, PublicOrderStatusDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Orders')
@Controller('orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('public/:orderNumber')
  @ApiOperation({
    summary: 'Public order status by number',
    description:
      'No login. Look up warehouse + delivery status using the sequential order number printed for the customer (e.g. 1001). Does not return phone, street address, or amounts.',
  })
  @ApiParam({ name: 'orderNumber', example: 1001, description: 'Public order number (digits only)' })
  @ApiOkResponse({ type: PublicOrderStatusDto })
  @ApiResponse({ status: 404, description: 'Unknown order number.', type: ApiErrorResponseDto })
  publicStatus(@Param('orderNumber', ParseIntPipe) orderNumber: number) {
    return this.ordersService.publicTrackByNumber(orderNumber);
  }
}
