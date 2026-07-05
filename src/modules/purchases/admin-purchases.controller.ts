import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ApiErrorResponseDto } from '../../common/swagger/swagger-response.dto';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseEntryDto } from './dto/create-purchase-entry.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Admin – Purchase entries')
@Controller('admin/purchase-entries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminPurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @ApiOperation({
    summary: 'Record a purchase entry (stock in)',
    description: [
      'Records inventory purchased from a supplier.',
      'Each line item increments the product `stock` by `quantity`.',
      '`totalAmount` is computed as sum(quantity × unitCost).',
    ].join('\n'),
  })
  @ApiCreatedResponse({ description: 'Created purchase entry with line items and updated stock.' })
  @ApiResponse({ status: 400, description: 'Invalid products or items.', type: ApiErrorResponseDto })
  create(@Req() req: RequestWithUser, @Body() dto: CreatePurchaseEntryDto) {
    return this.purchasesService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List purchase entries',
    description: 'Newest `purchasedAt` first. Optional filters for date range, supplier, and reference.',
  })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-07-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-07-31' })
  @ApiQuery({ name: 'supplierName', required: false, description: 'Partial match on supplier name' })
  @ApiQuery({ name: 'referenceNo', required: false, description: 'Partial match on invoice/reference' })
  @ApiOkResponse({ description: 'Purchase entries with line items.', isArray: true })
  findAll(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('supplierName') supplierName?: string,
    @Query('referenceNo') referenceNo?: string,
  ) {
    return this.purchasesService.findAllAdmin({ dateFrom, dateTo, supplierName, referenceNo });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get purchase entry by id' })
  @ApiParam({ name: 'id', description: 'Purchase entry UUID' })
  @ApiOkResponse({ description: 'Purchase entry with line items.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  findOne(@Param('id') id: string) {
    return this.purchasesService.findOneAdmin(id);
  }
}
