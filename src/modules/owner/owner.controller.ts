import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Patch,
  Param,
  UseGuards,
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
import { OwnerGuard } from '../../common/guards/owner.guard';
import { FEATURES } from '../../common/constants/features';
import { OwnerService } from './owner.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { ApiErrorResponseDto, FeaturesListResponseDto, AdminUserResponseDto, SuccessWithIdDto } from '../../common/swagger/swagger-response.dto';

@ApiTags('Owner')
@Controller('owner')
@UseGuards(JwtAuthGuard, OwnerGuard)
@ApiBearerAuth()
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Get('features')
  @ApiOperation({
    summary: 'List permission feature keys',
    description:
      'Stable keys you may assign to admins (e.g. products, orders). Use when building owner UI checkboxes.',
  })
  @ApiOkResponse({ type: FeaturesListResponseDto })
  getFeatures(): { features: string[] } {
    return { features: [...FEATURES] };
  }

  @Post('admins')
  @ApiOperation({
    summary: 'Create admin staff',
    description:
      'Creates `role: admin` user with hashed password. At least one valid permission from the features list is required.',
  })
  @ApiCreatedResponse({ description: 'New admin profile (no password returned).', type: AdminUserResponseDto })
  @ApiResponse({ status: 403, description: 'Caller is not owner.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Phone already registered.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 400, description: 'No valid permissions.', type: ApiErrorResponseDto })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.ownerService.createAdmin(dto);
  }

  @Get('admins')
  @ApiOperation({
    summary: 'List admins',
    description: 'All users with role admin, newest first.',
  })
  @ApiOkResponse({ type: AdminUserResponseDto, isArray: true })
  findAllAdmins() {
    return this.ownerService.findAllAdmins();
  }

  @Patch('admins/:id')
  @ApiOperation({
    summary: 'Update admin',
    description: 'Optional name, password, and/or permissions. Same permission validation as create.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiOkResponse({ type: AdminUserResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.ownerService.updateAdmin(id, dto);
  }

  @Delete('admins/:id')
  @ApiOperation({
    summary: 'Delete admin',
    description: 'Hard delete admin user row. Cannot delete owner or non-admin id.',
  })
  @ApiParam({ name: 'id', description: 'Admin user UUID' })
  @ApiOkResponse({ type: SuccessWithIdDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  removeAdmin(@Param('id') id: string) {
    return this.ownerService.removeAdmin(id);
  }
}
