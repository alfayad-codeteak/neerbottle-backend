import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
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
  DepositTransactionResponseDto,
  AdminDepositTransactionResponseDto,
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

  @Get('deposits/wallet/me/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'My deposit transaction history',
    description: 'Newest first. Includes charges, admin credits, and deposit returns.',
  })
  @ApiOkResponse({ type: [DepositTransactionResponseDto] })
  listMyTransactions(@Req() req: RequestWithUser) {
    return this.depositsService.listMyTransactions(req.user.id);
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

  @Get('admin/deposits/transactions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin deposit transaction history',
    description: 'Newest first. Optional `userId` filters to one customer.',
  })
  @ApiQuery({ name: 'userId', required: false, description: 'Customer user UUID' })
  @ApiOkResponse({ type: [AdminDepositTransactionResponseDto] })
  listAdminTransactions(@Query('userId') userId?: string) {
    return this.depositsService.listAdminTransactions({ userId });
  }

  @Get('admin/deposits/wallets')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin deposit wallets',
    description:
      'Customers plus any staff/test accounts that hold deposit or have deposit transactions. Highest held balance first.',
  })
  listAdminWallets() {
    return this.depositsService.listAdminWallets();
  }

  @Post('admin/deposits/wallet/:userId/add')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin credit customer wallet',
    description:
      'Credits held can-deposit for the given `userId`. Creates ADMIN_CREDIT with acting admin id for audit.',
  })
  @ApiParam({ name: 'userId', description: 'Customer user UUID' })
  @ApiOkResponse({ description: 'Customer balance after credit.', type: WalletBalanceResponseDto })
  @ApiResponse({ status: 404, description: 'User not found or not a customer.', type: ApiErrorResponseDto })
  addByAdmin(@Req() req: RequestWithUser, @Param('userId') userId: string, @Body() dto: AdminAdjustDepositDto) {
    return this.depositsService.adminAddToWallet(req.user.id, userId, dto);
  }

  @Post('admin/deposits/wallet/:userId/return')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin return deposit to customer',
    description:
      'Pays back held can-deposit (cash at counter). Amount cannot exceed outstanding held deposit. Writes ADMIN_DEBIT for audit.',
  })
  @ApiParam({ name: 'userId', description: 'Customer user UUID' })
  @ApiOkResponse({ description: 'Customer held deposit after return.', type: WalletBalanceResponseDto })
  @ApiResponse({ status: 400, description: 'No deposit held, or amount exceeds held balance.', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found or not a customer.', type: ApiErrorResponseDto })
  returnByAdmin(
    @Req() req: RequestWithUser,
    @Param('userId') userId: string,
    @Body() dto: AdminAdjustDepositDto,
  ) {
    return this.depositsService.adminReturnFromWallet(req.user.id, userId, dto);
  }
}
