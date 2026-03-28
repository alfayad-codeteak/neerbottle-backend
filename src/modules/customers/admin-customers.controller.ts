import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CustomersService } from './customers.service';
import {
  ApiErrorResponseDto,
  PaginatedCustomersResponseDto,
  CustomerDetailResponseDto,
} from '../../common/swagger/swagger-response.dto';

@ApiTags('Admin – Customers')
@Controller('admin/customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({
    summary: 'List customers',
    description:
      'Paginated directory (`page` default 1, `limit` default 20, max 100). Optional `phone` / `name` filters use partial, case-insensitive (name) matching.',
  })
  @ApiQuery({ name: 'phone', required: false, description: 'Substring match on phone digits' })
  @ApiQuery({ name: 'name', required: false, description: 'Case-insensitive substring on name' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: '1-based page index' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Page size (max 100)' })
  @ApiOkResponse({ type: PaginatedCustomersResponseDto })
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
  @ApiOperation({
    summary: 'Customer 360°',
    description:
      'Profile, all addresses, ten most recent orders (summary fields), and total historical order count.',
  })
  @ApiParam({ name: 'id', description: 'Customer user UUID' })
  @ApiOkResponse({ type: CustomerDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Not a customer id.', type: ApiErrorResponseDto })
  findOne(@Param('id') id: string) {
    return this.customersService.findOneAdmin(id);
  }
}
