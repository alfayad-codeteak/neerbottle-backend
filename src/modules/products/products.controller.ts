import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductResponseDto, ApiErrorResponseDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List purchasable products',
    description:
      'Returns active products with positive stock only, ordered by name. Each item includes `depositPerCan` and `orderValuePerCan` from global deposit settings (zero deposit when deposits are disabled).',
  })
  @ApiOkResponse({
    description: 'Array of catalog products.',
    type: ProductResponseDto,
    isArray: true,
  })
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one catalog product',
    description: '404 if inactive, missing, or out of stock — same visibility rules as the list endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Product UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiOkResponse({ description: 'Product detail.', type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Not available to customers.', type: ApiErrorResponseDto })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
