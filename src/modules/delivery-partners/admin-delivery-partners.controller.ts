import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { DeliveryPartnersService } from './delivery-partners.service';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto';
import { ApiErrorResponseDto, DeliveryPartnerResponseDto, SuccessWithIdDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Admin – Delivery partners')
@Controller('admin/delivery-partners')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminDeliveryPartnersController {
  constructor(private readonly deliveryPartnersService: DeliveryPartnersService) {}

  @Post()
  @ApiOperation({
    summary: 'Onboard delivery partner',
    description:
      'Creates a **User** (`role: deliveryPartner`) plus **DeliveryPartner** profile. Phone must be unique system-wide. Password min 6 characters.',
  })
  @ApiCreatedResponse({ description: 'Partner profile (no password echoed).', type: DeliveryPartnerResponseDto })
  @ApiResponse({ status: 409, description: 'Phone already registered.', type: ApiErrorResponseDto })
  create(@Body() dto: CreateDeliveryPartnerDto) {
    return this.deliveryPartnersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List partners',
    description: 'Newest first. Includes availability and last known GPS if set.',
  })
  @ApiOkResponse({ type: DeliveryPartnerResponseDto, isArray: true })
  findAll() {
    return this.deliveryPartnersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get partner by id' })
  @ApiParam({ name: 'id', description: 'DeliveryPartner UUID (also used in assign-order body)' })
  @ApiOkResponse({ type: DeliveryPartnerResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  findOne(@Param('id') id: string) {
    return this.deliveryPartnersService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update partner',
    description:
      'Adjust display name (syncs linked user name), vehicle, availability, or map coordinates from dispatch UI.',
  })
  @ApiParam({ name: 'id', description: 'DeliveryPartner UUID' })
  @ApiOkResponse({ type: DeliveryPartnerResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryPartnerDto) {
    return this.deliveryPartnersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove partner',
    description: 'Deletes the **User** account (cascade removes partner row). Partner cannot log in afterward.',
  })
  @ApiParam({ name: 'id', description: 'DeliveryPartner UUID' })
  @ApiOkResponse({ type: SuccessWithIdDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  remove(@Param('id') id: string) {
    return this.deliveryPartnersService.remove(id);
  }
}
