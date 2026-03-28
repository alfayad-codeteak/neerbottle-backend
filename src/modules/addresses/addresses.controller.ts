import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
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
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { ApiErrorResponseDto, MyAddressResponseDto } from '../../common/swagger/swagger-response.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Addresses')
@Controller('addresses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({
    summary: 'List my addresses',
    description: 'Default address first, then newest. Scoped to the authenticated customer user id.',
  })
  @ApiOkResponse({
    description: 'Saved delivery locations with timestamps.',
    type: MyAddressResponseDto,
    isArray: true,
  })
  findAll(@Req() req: RequestWithUser) {
    return this.addressesService.findAll(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create address',
    description:
      'Optional `isDefault: true` clears default on other rows for this user. All string fields validated by class-validator.',
  })
  @ApiCreatedResponse({ description: 'New address row.', type: MyAddressResponseDto })
  create(@Req() req: RequestWithUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update address',
    description: 'Only addresses owned by the caller may be updated.',
  })
  @ApiParam({ name: 'id', description: 'Address UUID' })
  @ApiOkResponse({ type: MyAddressResponseDto })
  @ApiResponse({ status: 404, description: 'Address not found for this user.', type: ApiErrorResponseDto })
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(req.user.id, id, dto);
  }
}
