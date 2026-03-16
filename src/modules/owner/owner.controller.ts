import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { FEATURES } from '../../common/constants/features';
import { OwnerService } from './owner.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@ApiTags('Owner')
@Controller('owner')
@UseGuards(JwtAuthGuard, OwnerGuard)
@ApiBearerAuth()
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Get('features')
  @ApiOperation({ summary: 'List assignable feature keys (owner only)' })
  getFeatures(): { features: string[] } {
    return { features: [...FEATURES] };
  }

  @Post('admins')
  @ApiOperation({ summary: 'Create admin and assign permissions (owner only)' })
  @ApiResponse({ status: 201, description: 'Admin created' })
  @ApiResponse({ status: 403, description: 'Owner access required' })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.ownerService.createAdmin(dto);
  }

  @Get('admins')
  @ApiOperation({ summary: 'List all admins (owner only)' })
  @ApiResponse({ status: 200, description: 'List of admins with permissions' })
  findAllAdmins() {
    return this.ownerService.findAllAdmins();
  }

  @Patch('admins/:id')
  @ApiOperation({ summary: 'Update admin name, password or permissions (owner only)' })
  @ApiResponse({ status: 200, description: 'Admin updated' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.ownerService.updateAdmin(id, dto);
  }
}
