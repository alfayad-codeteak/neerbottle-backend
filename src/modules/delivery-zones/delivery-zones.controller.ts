import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DeliveryZonesService } from './delivery-zones.service';

@ApiTags('Delivery zones')
@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly zones: DeliveryZonesService) {}

  @Get('check')
  @ApiOperation({
    summary: 'Check delivery availability for a location',
    description:
      'Public endpoint. Provide `lat` and `lng`. Returns availability based on active zones (circle radius in km).',
  })
  @ApiQuery({ name: 'lat', required: true, example: 23.0225 })
  @ApiQuery({ name: 'lng', required: true, example: 72.5714 })
  @ApiOkResponse({ description: 'Availability + nearest zone and matches.' })
  check(@Query('lat') latRaw: string, @Query('lng') lngRaw: string) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    return this.zones.checkAvailability(lat, lng);
  }
}

