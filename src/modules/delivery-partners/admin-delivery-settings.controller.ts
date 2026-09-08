import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DeliveryPartnersService } from './delivery-partners.service';
import { UpdateDispatchSettingsDto } from './dto/update-dispatch-settings.dto';
import { DispatchSettingsResponseDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Admin – Delivery partners')
@Controller('admin/delivery-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminDeliverySettingsController {
  constructor(private readonly deliveryPartnersService: DeliveryPartnersService) {}

  @Get()
  @ApiOperation({
    summary: 'Dispatch settings',
    description:
      'Global flags for last-mile. `partnerSelfAssignEnabled` controls whether riders are offered new orders and may accept them.',
  })
  @ApiOkResponse({ type: DispatchSettingsResponseDto })
  get() {
    return this.deliveryPartnersService.getDispatchSettings();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update dispatch settings',
    description:
      'Turn partner self-assign on or off. Off: no `order.offered` / FCM offers, `POST .../accept` returns 400, admin assign still works.',
  })
  @ApiOkResponse({ type: DispatchSettingsResponseDto })
  update(@Body() dto: UpdateDispatchSettingsDto) {
    return this.deliveryPartnersService.updateDispatchSettings(dto.partnerSelfAssignEnabled);
  }
}
