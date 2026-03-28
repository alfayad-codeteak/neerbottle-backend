import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DepositsService } from './deposits.service';
import { UpdateDepositConfigDto } from './dto/update-deposit-config.dto';
import { TopUpDepositDto } from './dto/top-up-deposit.dto';
import { AdminAdjustDepositDto } from './dto/admin-adjust-deposit.dto';
import {
  ApiErrorResponseDto,
  DepositPublicConfigResponseDto,
  DepositConfigAdminResponseDto,
  WalletBalanceResponseDto,
} from '../../common/swagger/swagger-response.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Deposits')
@Controller()
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get('deposits/public-config')
  @ApiOperation({
    summary: 'Public deposit pricing',
    description:
      'Unauthenticated. Used by marketing site / checkout to show per-can deposit, whether deposits are enabled, and active promo window + tiers.',
  })
  @ApiOkResponse({ type: DepositPublicConfigResponseDto })
  getPublicConfig() {
    return this.depositsService.getPublicPricingConfig();
  }

  @Get('deposits/config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get deposit configuration (admin)',
    description: 'Full config including raw tier JSON and `updatedAt`. Owner or admin with access.',
  })
  @ApiOkResponse({ type: DepositConfigAdminResponseDto })
  getConfig() {
    return this.depositsService.getConfig();
  }

  @Patch('deposits/config')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update deposit configuration',
    description:
      'Partial update: `enabled`, `perCanAmount`, promo window, `tiers` (unique `minQty` per tier). Validates promo date order.',
  })
  @ApiOkResponse({ type: DepositConfigAdminResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid tiers or promo dates.', type: ApiErrorResponseDto })
  updateConfig(@Body() dto: UpdateDepositConfigDto) {
    return this.depositsService.updateConfig(dto);
  }

  @Get('deposits/wallet/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'My deposit wallet balance',
    description: 'Customer JWT. Returns `{ balance }` in currency units.',
  })
  @ApiOkResponse({ type: WalletBalanceResponseDto })
  getMyWallet(@Req() req: RequestWithUser) {
    return this.depositsService.getMyWallet(req.user.id);
  }

  @Post('deposits/wallet/me/top-up')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Self top-up wallet',
    description: 'Increments balance and appends a TOP_UP ledger entry (customer-initiated).',
  })
  @ApiOkResponse({ description: 'New balance after credit.', type: WalletBalanceResponseDto })
  topUp(@Req() req: RequestWithUser, @Body() dto: TopUpDepositDto) {
    return this.depositsService.topUpMyWallet(req.user.id, dto);
  }

  @Post('admin/deposits/wallet/:userId/add')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin credit customer wallet',
    description:
      'Target `userId` must be a **customer**. Creates ADMIN_CREDIT transaction with acting admin id for audit.',
  })
  @ApiParam({ name: 'userId', description: 'Customer user UUID' })
  @ApiOkResponse({ description: 'Customer balance after credit.', type: WalletBalanceResponseDto })
  @ApiResponse({ status: 404, description: 'User not found or not a customer.', type: ApiErrorResponseDto })
  addByAdmin(@Req() req: RequestWithUser, @Param('userId') userId: string, @Body() dto: AdminAdjustDepositDto) {
    return this.depositsService.adminAddToWallet(req.user.id, userId, dto);
  }
}
