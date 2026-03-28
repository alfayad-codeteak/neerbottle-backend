import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Patch,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkUpdateProductsDto } from './dto/bulk-update-products.dto';
import {
  ApiErrorResponseDto,
  ProductResponseDto,
  BulkProductsUpdateResponseDto,
  SuccessWithIdDto,
} from '../../common/swagger/swagger-response.dto';

@ApiTags('Admin – Products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all SKUs',
    description:
      'Includes inactive and zero-stock rows for back-office. Requires owner or admin with products permission.',
  })
  @ApiOkResponse({ description: 'Full product records.', type: ProductResponseDto, isArray: true })
  findAll() {
    return this.productsService.findAllAdmin();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get product by id (admin)',
    description: 'Returns inactive products as well; use for edit forms.',
  })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  findOne(@Param('id') id: string) {
    return this.productsService.findOneAdmin(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create product',
    description:
      'Supply `photoUrl` and/or `photoUrls`; legacy single image is synced from the first gallery URL when needed.',
  })
  @ApiCreatedResponse({ description: 'Created product.', type: ProductResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden — missing role or permission.', type: ApiErrorResponseDto })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk price and stock update',
    description: 'Atomic per-row updates in one request. Fails with 404 if any id is unknown.',
  })
  @ApiOkResponse({ description: 'Count and updated product payloads.', type: BulkProductsUpdateResponseDto })
  @ApiResponse({ status: 404, description: 'One or more product ids not found.', type: ApiErrorResponseDto })
  bulkUpdate(@Body() dto: BulkUpdateProductsDto) {
    return this.productsService.bulkUpdatePriceAndStock(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update product',
    description: 'Partial update: price, stock, gallery, category, `isActive` flag, etc.',
  })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete product',
    description:
      'Hard delete allowed only when the SKU has never appeared on an order (preserves order history).',
  })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiOkResponse({
    description: 'Deletion confirmed.',
    type: SuccessWithIdDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Not found, or product is referenced by existing orders.',
    type: ApiErrorResponseDto,
  })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
