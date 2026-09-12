import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressesService } from '../addresses/addresses.service';
import { CreateAddressDto } from '../addresses/dto/create-address.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';

const SALT_ROUNDS = 8;
const SHOPPER_ROLES = ['customer', 'admin', 'owner'] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addressesService: AddressesService,
  ) {}

  private async ensureShopper(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: { in: [...SHOPPER_ROLES] } },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }
    return user;
  }

  private toCustomerRow(user: {
    id: string;
    phone: string;
    name: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { orders: number; addresses: number };
  }) {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      orderCount: user._count.orders,
      addressCount: user._count.addresses,
    };
  }

  async createAdmin(dto: CreateCustomerDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true, addresses: true } },
      },
    });

    if (existing && !SHOPPER_ROLES.includes(existing.role as (typeof SHOPPER_ROLES)[number])) {
      throw new ConflictException('Phone already registered');
    }

    let user = existing
      ? {
          id: existing.id,
          phone: existing.phone,
          name: existing.name,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          _count: existing._count,
        }
      : null;

    if (!user) {
      const passwordHash = dto.password ? await bcrypt.hash(dto.password, SALT_ROUNDS) : null;
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          name: dto.name ?? null,
          passwordHash,
          role: 'customer',
        },
        select: {
          id: true,
          phone: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true, addresses: true } },
        },
      });
    } else if (dto.name?.trim() && !user.name?.trim()) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { name: dto.name.trim() },
        select: {
          id: true,
          phone: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true, addresses: true } },
        },
      });
      user = updated;
    }

    const customer = this.toCustomerRow(user);

    if (!dto.address) {
      return customer;
    }

    const createdFresh = !existing;
    try {
      const address = await this.addressesService.create(
        user.id,
        {
          ...dto.address,
          name: dto.address.name ?? dto.name ?? undefined,
          isDefault: dto.address.isDefault ?? true,
        },
        { requireMapPin: false },
      );
      return { ...customer, addressCount: customer.addressCount + 1, addresses: [address] };
    } catch (err) {
      if (createdFresh) {
        await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      }
      throw err;
    }
  }

  async createAddressAdmin(customerId: string, dto: CreateAddressDto) {
    await this.ensureShopper(customerId);
    return this.addressesService.create(customerId, dto, { requireMapPin: false });
  }

  async findAllAdmin(filters: { phone?: string; name?: string; page?: number; limit?: number }) {
    const where: Record<string, unknown> = filters.phone?.trim()
      ? { role: { in: [...SHOPPER_ROLES] } }
      : { role: 'customer' };
    if (filters.phone) {
      where.phone = { contains: filters.phone };
    }
    if (filters.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true, addresses: true } },
          depositWallet: { select: { balance: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const ids = customers.map((c) => c.id);
    const ledgers =
      ids.length === 0
        ? []
        : await this.prisma.depositTransaction.groupBy({
            by: ['userId', 'type'],
            where: { userId: { in: ids } },
            _sum: { amount: true },
          });
    const heldByUser = new Map<string, number>();
    for (const row of ledgers) {
      const amount = Number(row._sum.amount ?? 0);
      const sign = ['CHARGE', 'TOP_UP', 'ADMIN_CREDIT'].includes(row.type)
        ? 1
        : ['REFUND', 'ADMIN_DEBIT'].includes(row.type)
          ? -1
          : 0;
      heldByUser.set(row.userId, (heldByUser.get(row.userId) ?? 0) + sign * amount);
    }

    return {
      data: customers.map((c) => {
        const fromLedger = heldByUser.get(c.id);
        const fromWallet = Number(c.depositWallet?.balance ?? 0);
        const depositBalance = Math.max(
          0,
          fromLedger !== undefined ? fromLedger : fromWallet,
        );
        return {
          id: c.id,
          phone: c.phone,
          name: c.name,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          orderCount: c._count.orders,
          addressCount: c._count.addresses,
          depositBalance,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async findOneAdmin(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: { in: [...SHOPPER_ROLES] } },
      select: {
        id: true,
        phone: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          select: {
            id: true,
            label: true,
            line1: true,
            line2: true,
            city: true,
            state: true,
            pincode: true,
            phone: true,
            isDefault: true,
          },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            timeSlot: true,
            paymentMethod: true,
            createdAt: true,
          },
        },
        _count: { select: { orders: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      orderCount: user._count.orders,
      addresses: user.addresses,
      recentOrders: user.orders,
    };
  }
}
