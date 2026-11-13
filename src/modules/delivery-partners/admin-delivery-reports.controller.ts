import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DeliveryPartnersService } from './delivery-partners.service';

@ApiTags('Admin – Reports')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminDeliveryReportsController {
  constructor(private readonly deliveryPartnersService: DeliveryPartnersService) {}

  @Get('delivery-partners')
  @ApiOperation({
    summary: 'Delivery partner order report',
    description:
      'Per-driver orders, delivered amount, COD, cans, and recent assigned orders. Dates are India calendar days (`YYYY-MM-DD`).',
  })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-11-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-11-13' })
  @ApiQuery({ name: 'partnerId', required: false, description: 'DeliveryPartner UUID' })
  @ApiOkResponse({ description: 'Partner totals, daily series, and recent orders.' })
  getDeliveryPartnerReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    return this.deliveryPartnersService.getDeliveryPartnerReport({
      dateFrom,
      dateTo,
      partnerId,
    });
  }
}
