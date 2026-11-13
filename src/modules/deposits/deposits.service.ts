import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { UpdateDepositConfigDto } from './dto/update-deposit-config.dto';
import { AdminAdjustDepositDto } from './dto/admin-adjust-deposit.dto';
import { TopUpDepositDto } from './dto/top-up-deposit.dto';

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
  ) {}

  private runtimeConfigCache: {
    value: Awaited<ReturnType<DepositsService['loadRuntimeConfig']>>;
    expiresAt: number;
  } | null = null;

  private static readonly RUNTIME_CONFIG_TTL_MS = 30_000;

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
    this.runtimeConfigCache = null;
    return this.toConfigResponse(updated);
  }

  async getMyWallet(userId: string) {
    const balance = await this.getHeldDepositBalance(userId);
    await this.prisma.userDepositWallet.upsert({
      where: { userId },
      update: { balance },
      create: { userId, balance },
    });
    return this.toWalletResponse(balance);
  }

  /** Outstanding deposit: ledger plus order charges that never got a CHARGE row. */
  async getHeldDepositBalance(userId: string): Promise<number> {
    const map = await this.getHeldDepositBalances([userId]);
    return map.get(userId) ?? 0;
  }

  async getHeldDepositBalances(userIds: string[]): Promise<Map<string, number>> {
    const held = new Map<string, number>();
    if (userIds.length === 0) return held;

    const [txRows, orphanOrders, wallets] = await Promise.all([
      this.prisma.depositTransaction.groupBy({
        by: ['userId', 'type'],
        where: { userId: { in: userIds } },
        _sum: { amount: true },
      }),
      this.prisma.order.findMany({
        where: {
          userId: { in: userIds },
          depositRefundedAt: null,
          depositCharge: { gt: 0 },
          depositTransactions: { none: { type: 'CHARGE' } },
        },
        select: { userId: true, depositCharge: true },
      }),
      this.prisma.userDepositWallet.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, balance: true },
      }),
    ]);

    const netByUser = new Map<string, number>();
    const hasTx = new Set<string>();
    for (const row of txRows) {
      hasTx.add(row.userId);
      const amount = Number(String(row._sum.amount ?? 0));
      if (!Number.isFinite(amount)) continue;
      const sign = ['CHARGE', 'TOP_UP', 'ADMIN_CREDIT'].includes(row.type)
        ? 1
        : ['REFUND', 'ADMIN_DEBIT'].includes(row.type)
          ? -1
          : 0;
      netByUser.set(row.userId, (netByUser.get(row.userId) ?? 0) + sign * amount);
    }

    const orphanByUser = new Map<string, number>();
    for (const order of orphanOrders) {
      const amount = Number(String(order.depositCharge ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      orphanByUser.set(order.userId, (orphanByUser.get(order.userId) ?? 0) + amount);
    }

    const walletByUser = new Map(
      wallets.map((row) => [row.userId, Math.max(0, Number(row.balance))]),
    );

    for (const userId of userIds) {
      const net = netByUser.get(userId) ?? 0;
      const orphans = orphanByUser.get(userId) ?? 0;
      if (hasTx.has(userId) || orphans > 0) {
        held.set(userId, Math.max(0, net + orphans));
      } else {
        held.set(userId, walletByUser.get(userId) ?? 0);
      }
    }
    return held;
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
    await this.pushWallet(userId, Number(wallet.balance), {
      type: 'TOP_UP',
      amount: dto.amount,
    });
    return this.toWalletResponse(wallet.balance);
  }

  async listMyTransactions(userId: string) {
    const rows = await this.prisma.depositTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        amount: true,
        note: true,
        orderId: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      note: row.note,
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listAdminTransactions(opts?: { userId?: string; take?: number }) {
    const take = Math.min(Math.max(opts?.take ?? 200, 1), 500);
    const userId = opts?.userId?.trim();
    const rows = await this.prisma.depositTransaction.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        amount: true,
        note: true,
        orderId: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            name: true,
            phone: true,
            addresses: {
              select: { name: true },
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              take: 3,
            },
          },
        },
      },
    });
    return rows.map((row) => {
      const profileName = row.user.name?.trim() ?? '';
      const addressName =
        row.user.addresses.map((a) => a.name?.trim()).find(Boolean) ?? '';
      return {
        id: row.id,
        userId: row.userId,
        customerName: profileName || addressName || '',
        phone: row.user.phone,
        type: row.type,
        amount: Number(row.amount),
        note: row.note,
        orderId: row.orderId,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async listAdminWallets() {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['customer', 'admin', 'owner'] },
        OR: [
          { role: 'customer' },
          { depositTransactions: { some: {} } },
          { depositWallet: { is: { balance: { gt: 0 } } } },
          { orders: { some: { depositCharge: { gt: 0 } } } },
        ],
      },
      select: {
        id: true,
        phone: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true, addresses: true } },
        addresses: {
          select: { name: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          take: 3,
        },
      },
    });
    const heldByUser = await this.getHeldDepositBalances(users.map((u) => u.id));
    return users
      .map((u) => {
        const addressName = u.addresses.map((a) => a.name?.trim()).find(Boolean) ?? '';
        return {
          id: u.id,
          phone: u.phone,
          name: u.name?.trim() || addressName || '',
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
          orderCount: u._count.orders,
          addressCount: u._count.addresses,
          depositBalance: heldByUser.get(u.id) ?? 0,
        };
      })
      .sort((a, b) => b.depositBalance - a.depositBalance || a.name.localeCompare(b.name));
  }

  async adminAddToWallet(adminUserId: string, userId: string, dto: AdminAdjustDepositDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !['customer', 'admin', 'owner'].includes(user.role)) {
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
    await this.pushWallet(userId, Number(wallet.balance), {
      type: 'ADMIN_CREDIT',
      amount: dto.amount,
    });
    return this.toWalletResponse(wallet.balance);
  }

  /** Cash back at the counter: reduce held can-deposit. */
  async adminReturnFromWallet(adminUserId: string, userId: string, dto: AdminAdjustDepositDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !['customer', 'admin', 'owner'].includes(user.role)) {
      throw new NotFoundException('Customer not found');
    }

    const held = await this.getHeldDepositBalance(userId);
    if (held <= 0) {
      throw new BadRequestException('Customer has no deposit to return');
    }
    if (dto.amount > held) {
      throw new BadRequestException(
        `Cannot return more than the held deposit of ₹${held.toLocaleString('en-IN')}`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.userDepositWallet.upsert({
        where: { userId },
        update: {},
        create: { userId, balance: 0 },
      });
      const nextBalance = Math.max(0, Number(wallet.balance) - dto.amount);
      await tx.userDepositWallet.update({
        where: { userId },
        data: { balance: nextBalance },
      });
      return tx.depositTransaction.create({
        data: {
          userId,
          type: 'ADMIN_DEBIT',
          amount: dto.amount,
          note: dto.note ?? 'Deposit returned by admin',
          createdById: adminUserId,
        },
      });
    });

    const balance = await this.getHeldDepositBalance(userId);
    await this.prisma.userDepositWallet.update({
      where: { userId },
      data: { balance },
    });
    await this.pushWallet(userId, balance, {
      type: 'ADMIN_DEBIT',
      amount: dto.amount,
      note: created.note ?? undefined,
      transactionId: created.id,
    });
    return this.toWalletResponse(balance);
  }

  async getRuntimeConfig() {
    const now = Date.now();
    if (this.runtimeConfigCache && this.runtimeConfigCache.expiresAt > now) {
      return this.runtimeConfigCache.value;
    }
    const value = await this.loadRuntimeConfig();
    this.runtimeConfigCache = {
      value,
      expiresAt: now + DepositsService.RUNTIME_CONFIG_TTL_MS,
    };
    return value;
  }

  private async loadRuntimeConfig() {
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

    const created = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.userDepositWallet.upsert({
        where: { userId: order.userId },
        update: {},
        create: { userId: order.userId, balance: 0 },
      });
      const nextBalance = Math.max(0, Number(wallet.balance) - amount);
      await tx.userDepositWallet.update({
        where: { userId: order.userId },
        data: { balance: nextBalance },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { depositRefundedAt: new Date() },
      });
      return tx.depositTransaction.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: 'REFUND',
          amount,
          note: 'Can return refund',
          createdById: actorId,
        },
      });
    });

    const balance = await this.getHeldDepositBalance(order.userId);
    await this.prisma.userDepositWallet.update({
      where: { userId: order.userId },
      data: { balance },
    });
    await this.pushWallet(order.userId, balance, {
      type: 'REFUND',
      amount,
      note: created.note ?? undefined,
      transactionId: created.id,
    });
    return {
      orderId: order.id,
      refundedAmount: amount,
      walletBalance: balance,
    };
  }

  private async pushWallet(
    userId: string,
    balance: number,
    extra?: { type?: string; amount?: number; note?: string; transactionId?: string },
  ) {
    this.ordersGateway.emitWalletUpdate({
      userId,
      balance: Math.max(0, balance),
      ...extra,
    });
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
