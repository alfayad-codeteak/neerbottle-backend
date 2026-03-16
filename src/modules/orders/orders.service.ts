import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { STATUS_FLOW, OrderStatus } from './orders.constants';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    });
    if (!address) {
      throw new BadRequestException('Address not found or does not belong to you');
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, stock: { gt: 0 } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems: { productId: string; quantity: number; unitPrice: Decimal }[] = [];
    let totalAmount = new Decimal(0);

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product ${item.productId} not found or out of stock`);
      }
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${product.stock}`,
        );
      }
      orderItems.push({ productId: product.id, quantity: item.quantity, unitPrice: product.price });
      totalAmount = totalAmount.add(new Decimal(product.price).mul(item.quantity));
    }

    const [order] = await this.prisma.$transaction([
      this.prisma.order.create({
        data: {
          userId,
          addressId: address.id,
          timeSlot: dto.timeSlot,
          paymentMethod: dto.paymentMethod,
          status: 'RECEIVED',
          totalAmount,
          items: {
            create: orderItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
        include: { items: { include: { product: true } }, address: true },
      }),
      ...orderItems.map((i) =>
        this.prisma.product.update({
          where: { id: i.productId },
          data: { stock: { decrement: i.quantity } },
        }),
      ),
    ]);

    return this.toOrderResponse(order);
  }

  async findMyOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } }, address: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o));
  }

  async track(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: { include: { product: true } }, address: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return {
      ...this.toOrderResponse(order),
      status: order.status,
      statusLabel: this.statusLabel(order.status),
    };
  }

  async findAllAdmin(filters: { dateFrom?: string; dateTo?: string; status?: string; phone?: string; timeSlot?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.timeSlot) where.timeSlot = { contains: filters.timeSlot, mode: 'insensitive' };
    if (filters.phone) {
      where.user = { phone: { contains: filters.phone } };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const d = new Date(filters.dateTo);
        d.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, Date>).lte = d;
      }
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        address: true,
        user: { select: { id: true, phone: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o, true));
  }

  async updateStatus(orderId: string, status: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const newStatus = status as OrderStatus;
    const currentIndex = STATUS_FLOW.indexOf(order.status as OrderStatus);
    const newIndex = STATUS_FLOW.indexOf(newStatus);

    if (newStatus === 'CANCELLED') {
      if (order.status === 'DISPATCHED' || order.status === 'DELIVERED') {
        throw new BadRequestException('Cannot cancel order after dispatch');
      }
      await this.restoreStock(orderId);
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
        include: { items: { include: { product: true } }, address: true },
      });
      return this.toOrderResponse(updated);
    }

    if (newIndex <= currentIndex) {
      throw new BadRequestException(`Status can only move forward. Current: ${order.status}`);
    }
    if (newIndex !== currentIndex + 1) {
      throw new BadRequestException(`Next valid status is ${STATUS_FLOW[currentIndex + 1]}`);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: { items: { include: { product: true } }, address: true },
    });
    return this.toOrderResponse(updated);
  }

  async cancel(orderId: string) {
    return this.updateStatus(orderId, 'CANCELLED');
  }

  private async restoreStock(orderId: string) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  private statusLabel(s: string): string {
    const labels: Record<string, string> = {
      RECEIVED: 'Received',
      CONFIRMED: 'Confirmed',
      PACKED: 'Packed',
      DISPATCHED: 'On the way',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
    };
    return labels[s] ?? s;
  }

  private toOrderResponse(
    order: {
      id: string;
      userId: string;
      addressId: string;
      timeSlot: string;
      paymentMethod: string;
      status: string;
      totalAmount: Decimal;
      createdAt: Date;
      updatedAt: Date;
      items: Array<{
        id: string;
        productId: string;
        quantity: number;
        unitPrice: Decimal;
        product: { id: string; name: string };
      }>;
      address: {
        id: string;
        label: string | null;
        line1: string;
        line2: string | null;
        city: string;
        state: string | null;
        pincode: string | null;
      };
      user?: { id: string; phone: string; name: string | null };
    },
    includeUser = false,
  ) {
    const base = {
      id: order.id,
      addressId: order.addressId,
      timeSlot: order.timeSlot,
      paymentMethod: order.paymentMethod,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      address: {
        id: order.address.id,
        label: order.address.label,
        line1: order.address.line1,
        line2: order.address.line2,
        city: order.address.city,
        state: order.address.state,
        pincode: order.address.pincode,
      },
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.unitPrice) * i.quantity,
      })),
    };
    if (includeUser && order.user) {
      return { ...base, user: order.user };
    }
    return base;
  }
}
