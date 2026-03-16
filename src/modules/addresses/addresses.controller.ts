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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

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
  @ApiOperation({ summary: 'List my saved addresses' })
  @ApiResponse({ status: 200, description: 'List of addresses' })
  findAll(@Req() req: RequestWithUser) {
    return this.addressesService.findAll(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Add address – save delivery location (home, office, shop…)' })
  @ApiResponse({ status: 201, description: 'Address created' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update address – edit delivery location' })
  @ApiResponse({ status: 200, description: 'Address updated' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(req.user.id, id, dto);
  }
}