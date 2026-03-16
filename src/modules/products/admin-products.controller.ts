import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Admin – Products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all products including inactive and zero-stock (owner or admin)' })
  @ApiResponse({ status: 200, description: 'All products with full status (isActive, stock, etc.)' })
  findAll() {
    return this.productsService.findAllAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one product by id including inactive (owner or admin)' })
  @ApiResponse({ status: 200, description: 'Product with full status' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOneAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add new water product (owner or admin)' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 403, description: 'Owner or admin required' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product – price, stock, hide/show (owner or admin)' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Owner or admin required' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }
}
