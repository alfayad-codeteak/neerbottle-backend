import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import { UpdateDeliveryPartnerDto } from './dto/update-delivery-partner.dto';
import { UpdateMyDeliveryPartnerDto } from './dto/update-my-delivery-partner.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class DeliveryPartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDeliveryPartnerDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        passwordHash,
        role: 'deliveryPartner',
      },
    });
    const partner = await this.prisma.deliveryPartner.create({
      data: {
        userId: user.id,
        name: dto.name,
        phone: dto.phone,
        vehicleType: dto.vehicleType ?? null,
        vehicleNumber: dto.vehicleNumber ?? null,
      },
    });
    return this.toResponse(partner);
  }

  async findAll() {
    const list = await this.prisma.deliveryPartner.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return list.map((p) => this.toResponse(p));
  }

  async findOne(id: string) {
    const p = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Delivery partner not found');
    return this.toResponse(p);
  }

  async update(id: string, dto: UpdateDeliveryPartnerDto) {
    const existing = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery partner not found');
    const partner = await this.prisma.deliveryPartner.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType || null }),
        ...(dto.vehicleNumber !== undefined && { vehicleNumber: dto.vehicleNumber || null }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.currentLat !== undefined && { currentLat: dto.currentLat }),
        ...(dto.currentLng !== undefined && { currentLng: dto.currentLng }),
      },
    });
    if (dto.name != null) {
      await this.prisma.user.update({
        where: { id: partner.userId },
        data: { name: dto.name },
      });
    }
    return this.toResponse(partner);
  }

  async remove(id: string) {
    const existing = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery partner not found');
    await this.prisma.user.delete({ where: { id: existing.userId } });
    return { success: true, id };
  }

  async getProfileByUserId(userId: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { userId },
    });
    if (!partner) throw new NotFoundException('Delivery partner profile not found');
    return this.toResponse(partner);
  }

  async updateMyProfile(userId: string, dto: UpdateMyDeliveryPartnerDto) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { userId },
    });
    if (!partner) throw new NotFoundException('Delivery partner profile not found');
    if (dto.isAvailable === false && partner.isAvailable) {
      const assigned = await this.prisma.order.count({
        where: {
          deliveryPartnerId: partner.id,
          deliveryStatus: { in: ['ASSIGNED', 'PICKED_UP', 'DELIVERED'] },
        },
      });
      if (assigned > 0) {
        throw new BadRequestException('Finish or hand off active deliveries before going offline');
      }
    }
    const updated = await this.prisma.deliveryPartner.update({
      where: { userId },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType || null }),
        ...(dto.vehicleNumber !== undefined && { vehicleNumber: dto.vehicleNumber || null }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.currentLat !== undefined && { currentLat: dto.currentLat }),
        ...(dto.currentLng !== undefined && { currentLng: dto.currentLng }),
      },
    });
    if (dto.name != null) {
      await this.prisma.user.update({ where: { id: userId }, data: { name: dto.name } });
    }
    return this.toResponse(updated);
  }

  async getDeliveryPartnerReport(opts?: {
    dateFrom?: string;
    dateTo?: string;
    partnerId?: string;
  }) {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const from =
      opts?.dateFrom && ymd.test(opts.dateFrom)
        ? new Date(`${opts.dateFrom}T00:00:00+05:30`)
        : undefined;
    const toExclusive =
      opts?.dateTo && ymd.test(opts.dateTo)
        ? new Date(new Date(`${opts.dateTo}T00:00:00+05:30`).getTime() + 86_400_000)
        : undefined;
    const partnerId = opts?.partnerId?.trim() || undefined;
    const createdAt =
      from || toExclusive
        ? {
            ...(from ? { gte: from } : {}),
            ...(toExclusive ? { lt: toExclusive } : {}),
          }
        : undefined;
    const dateWhere = createdAt ? { createdAt } : {};

    const [partners, assignedOrders, unassignedAgg] = await Promise.all([
      this.prisma.deliveryPartner.findMany({
        where: partnerId ? { id: partnerId } : undefined,
        orderBy: { name: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          ...dateWhere,
          deliveryPartnerId: partnerId ? partnerId : { not: null },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryStatus: true,
          paymentMethod: true,
          totalAmount: true,
          depositCharge: true,
          handlingTotal: true,
          returnedCanCount: true,
          actualReturnedCanCount: true,
          createdAt: true,
          assignedAt: true,
          timeSlot: true,
          deliveryPartnerId: true,
          items: { select: { quantity: true } },
          user: { select: { name: true, phone: true } },
          address: { select: { name: true } },
          deliveryPartner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      partnerId
        ? Promise.resolve({ _count: { _all: 0 }, _sum: { totalAmount: null } })
        : this.prisma.order.aggregate({
            where: {
              ...dateWhere,
              deliveryPartnerId: null,
              status: { notIn: ['CANCELLED', 'REJECTED'] },
            },
            _count: { _all: true },
            _sum: { totalAmount: true },
          }),
    ]);

    const money = (v: unknown) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    const isCod = (method: string) => method.toUpperCase() === 'COD';
    const isDelivered = (status: string) => status === 'DELIVERED';
    const isCancelled = (status: string) => status === 'CANCELLED' || status === 'REJECTED';

    const byPartner = new Map<string, typeof assignedOrders>();
    for (const order of assignedOrders) {
      const id = order.deliveryPartnerId;
      if (!id) continue;
      const list = byPartner.get(id) ?? [];
      list.push(order);
      byPartner.set(id, list);
    }

    const partnerRows = partners.map((partner) => {
      const rows = byPartner.get(partner.id) ?? [];
      let deliveredCount = 0;
      let cancelledCount = 0;
      let inProgressCount = 0;
      let assignedAmount = 0;
      let deliveredAmount = 0;
      let codAmount = 0;
      let codCollected = 0;
      let codOutstanding = 0;
      let handlingTotal = 0;
      let depositCharged = 0;
      let cansDelivered = 0;
      let emptyCansExpected = 0;
      let emptyCansCollected = 0;
      for (const order of rows) {
        const amount = money(order.totalAmount);
        const cans = order.items.reduce((sum, item) => sum + item.quantity, 0);
        assignedAmount += amount;
        handlingTotal += money(order.handlingTotal);
        depositCharged += money(order.depositCharge);
        cansDelivered += cans;
        emptyCansExpected += order.returnedCanCount ?? 0;
        emptyCansCollected += order.actualReturnedCanCount ?? 0;
        if (isCod(order.paymentMethod)) codAmount += amount;
        if (isDelivered(order.status)) {
          deliveredCount += 1;
          deliveredAmount += amount;
          if (isCod(order.paymentMethod)) codCollected += amount;
        } else if (isCancelled(order.status)) {
          cancelledCount += 1;
        } else {
          inProgressCount += 1;
          if (isCod(order.paymentMethod)) codOutstanding += amount;
        }
      }
      return {
        id: partner.id,
        name: partner.name,
        phone: partner.phone,
        vehicleType: partner.vehicleType,
        vehicleNumber: partner.vehicleNumber,
        isAvailable: partner.isAvailable,
        orderCount: rows.length,
        deliveredCount,
        inProgressCount,
        cancelledCount,
        assignedAmount,
        deliveredAmount,
        codAmount,
        codCollected,
        codOutstanding,
        handlingTotal,
        depositCharged,
        cansDelivered,
        emptyCansExpected,
        emptyCansCollected,
      };
    });
    partnerRows.sort((a, b) => b.deliveredAmount - a.deliveredAmount || a.name.localeCompare(b.name));

    const totals = {
      partnerCount: partnerRows.length,
      availableCount: partnerRows.filter((p) => p.isAvailable).length,
      orderCount: 0,
      deliveredCount: 0,
      inProgressCount: 0,
      cancelledCount: 0,
      assignedAmount: 0,
      deliveredAmount: 0,
      codAmount: 0,
      codCollected: 0,
      codOutstanding: 0,
      handlingTotal: 0,
      depositCharged: 0,
      cansDelivered: 0,
      emptyCansExpected: 0,
      emptyCansCollected: 0,
      unassignedCount:
        typeof unassignedAgg._count === "number"
          ? unassignedAgg._count
          : unassignedAgg._count._all,
      unassignedAmount: money(unassignedAgg._sum.totalAmount),
    };
    for (const row of partnerRows) {
      totals.orderCount += row.orderCount;
      totals.deliveredCount += row.deliveredCount;
      totals.inProgressCount += row.inProgressCount;
      totals.cancelledCount += row.cancelledCount;
      totals.assignedAmount += row.assignedAmount;
      totals.deliveredAmount += row.deliveredAmount;
      totals.codAmount += row.codAmount;
      totals.codCollected += row.codCollected;
      totals.codOutstanding += row.codOutstanding;
      totals.handlingTotal += row.handlingTotal;
      totals.depositCharged += row.depositCharged;
      totals.cansDelivered += row.cansDelivered;
      totals.emptyCansExpected += row.emptyCansExpected;
      totals.emptyCansCollected += row.emptyCansCollected;
    }

    const dailyMap = new Map<string, { date: string; orders: number; delivered: number; amount: number }>();
    for (const order of assignedOrders) {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(order.createdAt);
      const row = dailyMap.get(date) ?? { date, orders: 0, delivered: 0, amount: 0 };
      row.orders += 1;
      row.amount += money(order.totalAmount);
      if (isDelivered(order.status)) row.delivered += 1;
      dailyMap.set(date, row);
    }

    return {
      dateFrom: opts?.dateFrom ?? null,
      dateTo: opts?.dateTo ?? null,
      totals,
      partners: partnerRows,
      daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      orders: assignedOrders.slice(0, 400).map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        partnerId: order.deliveryPartnerId ?? '',
        partnerName: order.deliveryPartner?.name ?? '',
        customerName: (order.user.name?.trim() || order.address.name?.trim() || 'Customer'),
        phone: order.user.phone,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        paymentMethod: order.paymentMethod,
        totalAmount: money(order.totalAmount),
        depositCharge: money(order.depositCharge),
        handlingTotal: money(order.handlingTotal),
        canQty: order.items.reduce((sum, item) => sum + item.quantity, 0),
        returnedCanCount: order.returnedCanCount,
        actualReturnedCanCount: order.actualReturnedCanCount,
        createdAt: order.createdAt.toISOString(),
        assignedAt: order.assignedAt?.toISOString() ?? null,
        timeSlot: order.timeSlot,
      })),
    };
  }

  async getDispatchSettings() {
    const row = await this.ensureDispatchSettings();
    return {
      partnerSelfAssignEnabled: row.partnerSelfAssignEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateDispatchSettings(partnerSelfAssignEnabled: boolean) {
    await this.ensureDispatchSettings();
    const row = await this.prisma.dispatchSettings.update({
      where: { id: 'default' },
      data: { partnerSelfAssignEnabled },
    });
    return {
      partnerSelfAssignEnabled: row.partnerSelfAssignEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureDispatchSettings() {
    const existing = await this.prisma.dispatchSettings.findUnique({ where: { id: 'default' } });
    if (existing) return existing;
    return this.prisma.dispatchSettings.create({
      data: { id: 'default', partnerSelfAssignEnabled: true },
    });
  }

  private toResponse(p: {
    id: string;
    userId: string;
    name: string;
    phone: string;
    vehicleType: string | null;
    vehicleNumber: string | null;
    isAvailable: boolean;
    currentLat: { toString(): string } | null;
    currentLng: { toString(): string } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      phone: p.phone,
      vehicleType: p.vehicleType,
      vehicleNumber: p.vehicleNumber,
      isAvailable: p.isAvailable,
      currentLat: p.currentLat != null ? Number(p.currentLat) : null,
      currentLng: p.currentLng != null ? Number(p.currentLng) : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
