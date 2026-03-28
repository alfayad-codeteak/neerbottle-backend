import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateDepositConfigDto } from './dto/update-deposit-config.dto';
import { AdminAdjustDepositDto } from './dto/admin-adjust-deposit.dto';
import { TopUpDepositDto } from './dto/top-up-deposit.dto';

@Injectable()
export class DepositsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.ensureConfig();
    return this.toConfigResponse(config);
  }

  async updateConfig(dto: UpdateDepositConfigDto) {
    if (dto.promoStartsAt && dto.promoEndsAt && new Date(dto.promoStartsAt) > new Date(dto.promoEndsAt)) {
      throw new BadRequestException('promoStartsAt must be before promoEndsAt');
    }
    if (dto.tiers && dto.tiers.length > 0) {
      const seen = new Set<number>();
      for (const t of dto.tiers) {
        if (seen.has(t.minQty)) {
          throw new BadRequestException('Tier minQty values must be unique');
        }
        seen.add(t.minQty);
      }
    }

    const existing = await this.ensureConfig();
    const updated = await this.prisma.depositConfig.update({
      where: { id: existing.id },
      data: {
        enabled: dto.enabled ?? existing.enabled,
        perCanAmount: dto.perCanAmount,
        promoActive: dto.promoActive ?? existing.promoActive,
        promoStartsAt: dto.promoStartsAt ? new Date(dto.promoStartsAt) : existing.promoStartsAt,
        promoEndsAt: dto.promoEndsAt ? new Date(dto.promoEndsAt) : existing.promoEndsAt,
        tiers: (dto.tiers ?? (Array.isArray(existing.tiers) ? existing.tiers : [])) as Prisma.InputJsonValue,
      },
    });
    return this.toConfigResponse(updated);
  }

  async getMyWallet(userId: string) {
    const wallet = await this.ensureWallet(userId);
    return this.toWalletResponse(wallet.balance);
  }

  async topUpMyWallet(userId: string, dto: TopUpDepositDto) {
    const [wallet] = await this.prisma.$transaction([
      this.prisma.userDepositWallet.upsert({
        where: { userId },
        update: { balance: { increment: dto.amount } },
        create: { userId, balance: dto.amount },
      }),
      this.prisma.depositTransaction.create({
        data: {
          userId,
          type: 'TOP_UP',
          amount: dto.amount,
          note: dto.note ?? 'User top-up',
        },
      }),
    ]);
    return this.toWalletResponse(wallet.balance);
  }

  async adminAddToWallet(adminUserId: string, userId: string, dto: AdminAdjustDepositDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'customer') {
      throw new NotFoundException('Customer not found');
    }

    const [wallet] = await this.prisma.$transaction([
      this.prisma.userDepositWallet.upsert({
        where: { userId },
        update: { balance: { increment: dto.amount } },
        create: { userId, balance: dto.amount },
      }),
      this.prisma.depositTransaction.create({
        data: {
          userId,
          type: 'ADMIN_CREDIT',
          amount: dto.amount,
          note: dto.note ?? 'Added by admin/owner',
          createdById: adminUserId,
        },
      }),
    ]);
    return this.toWalletResponse(wallet.balance);
  }

  async getRuntimeConfig() {
    const config = await this.ensureConfig();
    const tiers = (Array.isArray(config.tiers) ? config.tiers : []) as Array<{ minQty?: number; discountPercent?: number }>;
    return {
      enabled: config.enabled,
      perCanAmount: Number(config.perCanAmount),
      promoActive: config.promoActive,
      promoStartsAt: config.promoStartsAt,
      promoEndsAt: config.promoEndsAt,
      tiers: tiers
        .filter((t) => typeof t.minQty === 'number' && typeof t.discountPercent === 'number')
        .map((t) => ({ minQty: Number(t.minQty), discountPercent: Number(t.discountPercent) }))
        .sort((a, b) => a.minQty - b.minQty),
    };
  }

  async getPublicPricingConfig() {
    const config = await this.getRuntimeConfig();
    return {
      enabled: config.enabled,
      perCanAmount: config.perCanAmount,
      promoActive: this.isPromoWindowActive(config.promoActive, config.promoStartsAt, config.promoEndsAt),
      promoStartsAt: config.promoStartsAt?.toISOString() ?? null,
      promoEndsAt: config.promoEndsAt?.toISOString() ?? null,
      tiers: config.tiers,
    };
  }

  resolveDiscountPercentForQty(qty: number, config: { enabled: boolean; promoActive: boolean; promoStartsAt: Date | null; promoEndsAt: Date | null; tiers: Array<{ minQty: number; discountPercent: number }> }) {
    if (!config.enabled) return 0;
    if (!this.isPromoWindowActive(config.promoActive, config.promoStartsAt, config.promoEndsAt)) {
      return 0;
    }
    let best = 0;
    for (const tier of config.tiers) {
      if (qty >= tier.minQty) best = Math.max(best, tier.discountPercent);
    }
    return best;
  }

  async refundOrderDeposit(orderId: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.depositRefundedAt) {
      throw new BadRequestException('Deposit already refunded for this order');
    }
    const amount = Number(order.depositCharge);
    if (amount <= 0) {
      throw new BadRequestException('No deposit charged for this order');
    }

    await this.prisma.$transaction([
      this.prisma.userDepositWallet.upsert({
        where: { userId: order.userId },
        update: { balance: { increment: amount } },
        create: { userId: order.userId, balance: amount },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { depositRefundedAt: new Date() },
      }),
      this.prisma.depositTransaction.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: 'REFUND',
          amount,
          note: 'Can return refund',
          createdById: actorId,
        },
      }),
    ]);

    const wallet = await this.ensureWallet(order.userId);
    return {
      orderId: order.id,
      refundedAmount: amount,
      walletBalance: Number(wallet.balance),
    };
  }

  private async ensureConfig() {
    const existing = await this.prisma.depositConfig.findFirst();
    if (existing) return existing;
    return this.prisma.depositConfig.create({
      data: { enabled: true, perCanAmount: 0, promoActive: false, tiers: [] },
    });
  }

  private async ensureWallet(userId: string) {
    return this.prisma.userDepositWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
  }

  private toWalletResponse(balance: { toString(): string } | number) {
    return { balance: Number(balance) };
  }

  private isPromoWindowActive(promoActive: boolean, promoStartsAt: Date | null, promoEndsAt: Date | null) {
    if (!promoActive) return false;
    const now = new Date();
    if (promoStartsAt && now < promoStartsAt) return false;
    if (promoEndsAt && now > promoEndsAt) return false;
    return true;
  }

  private toConfigResponse(config: {
    id: string;
    enabled: boolean;
    perCanAmount: { toString(): string };
    promoActive: boolean;
    promoStartsAt: Date | null;
    promoEndsAt: Date | null;
    tiers: unknown;
    updatedAt: Date;
  }) {
    const tiers = Array.isArray(config.tiers) ? config.tiers : [];
    return {
      id: config.id,
      enabled: config.enabled,
      perCanAmount: Number(config.perCanAmount),
      promoActive: config.promoActive,
      promoStartsAt: config.promoStartsAt?.toISOString() ?? null,
      promoEndsAt: config.promoEndsAt?.toISOString() ?? null,
      tiers,
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
