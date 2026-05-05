import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

@ApiTags('Admin – Delivery zones')
@Controller('admin/delivery-zones')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminDeliveryZonesController {
  constructor(private readonly zones: DeliveryZonesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create delivery zone', description: 'Center lat/lng + radiusKm service area.' })
  create(@Body() dto: CreateDeliveryZoneDto) {
    return this.zones.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List delivery zones' })
  findAll() {
    return this.zones.findAllAdmin();
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'DeliveryZone id' })
  @ApiOperation({ summary: 'Get delivery zone' })
  findOne(@Param('id') id: string) {
    return this.zones.findOneAdmin(id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'DeliveryZone id' })
  @ApiOperation({ summary: 'Update delivery zone' })
  @ApiOkResponse({ description: 'Updated zone.' })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryZoneDto) {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'DeliveryZone id' })
  @ApiOperation({ summary: 'Delete delivery zone' })
  remove(@Param('id') id: string) {
    return this.zones.remove(id);
  }
}

