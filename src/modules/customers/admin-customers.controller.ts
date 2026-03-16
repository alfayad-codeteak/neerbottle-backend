import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CustomersService } from './customers.service';

@ApiTags('Admin – Customers')
@Controller('admin/customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List all customers – filter by phone, name; paginated' })
  @ApiQuery({ name: 'phone', required: false, description: 'Partial match on phone' })
  @ApiQuery({ name: 'name', required: false, description: 'Partial match on name' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated list of customers with order/address counts' })
  findAll(
    @Query('phone') phone?: string,
    @Query('name') name?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.findAllAdmin({
      phone,
      name,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one customer by id – details, addresses, recent orders' })
  @ApiResponse({ status: 200, description: 'Customer with addresses and recent orders' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOneAdmin(id);
  }
}
