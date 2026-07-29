import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdmin(dto: CreateCustomerDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, SALT_ROUNDS) : null;
    const user = await this.prisma.user.create({
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

  async findAllAdmin(filters: { phone?: string; name?: string; page?: number; limit?: number }) {
    const where: Record<string, unknown> = { role: 'customer' };
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
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: customers.map((c) => ({
        id: c.id,
        phone: c.phone,
        name: c.name,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        orderCount: c._count.orders,
        addressCount: c._count.addresses,
      })),
      total,
      page,
      limit,
    };
  }

  async findOneAdmin(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'customer' },
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
