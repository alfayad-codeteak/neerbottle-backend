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
import { nextDeliveryStatus } from './delivery.constants';
import { DepositsService } from '../deposits/deposits.service';
import { OrdersGateway } from './orders.gateway';

const orderFullInclude = {
  items: { include: { product: true } },
  address: true,
  user: { select: { id: true, phone: true, name: true } },
  deliveryPartner: { select: { id: true, userId: true, name: true, phone: true } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly depositsService: DepositsService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const quote = await this.buildQuote(userId, dto);
    const orderItems = quote.orderItems;
    const depositBase = quote.depositBase;
    const depositDiscount = quote.depositDiscount;
    const depositCharge = quote.depositCharge;
    const finalTotalAmount = quote.finalTotalAmount;

    const created = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId,
          addressId: quote.address.id,
          timeSlot: dto.timeSlot,
          paymentMethod: dto.paymentMethod,
          status: 'RECEIVED',
          ifCanRefund: quote.ifCanRefund,
          totalAmount: finalTotalAmount,
          depositBase,
          depositDiscount,
          depositCharge,
          items: {
            create: orderItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
        include: { items: { include: { product: true } }, address: true },
      });

      for (const item of orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      if (Number(depositCharge) > 0) {
        await tx.depositTransaction.create({
          data: {
            userId,
            orderId: createdOrder.id,
            type: 'CHARGE',
            amount: Number(depositCharge),
            note: 'Deposit charged for order',
          },
        });
      }

      return createdOrder;
    });

    const full = await this.prisma.order.findUnique({
      where: { id: created.id },
      include: orderFullInclude,
    });
    await this.notifyOrderChanged(created.id);
    return this.toOrderResponse(full!);
  }

  async quote(userId: string, dto: CreateOrderDto) {
    const quote = await this.buildQuote(userId, dto);
    return {
      itemsSubtotal: Number(quote.itemsSubtotal),
      depositEnabled: quote.depositEnabled,
      ifCanRefund: quote.ifCanRefund,
      quantity: quote.totalQty,
      returnedCanCount: quote.returnedCanCount,
      chargeableCanCount: quote.chargeableCanCount,
      depositBase: Number(quote.depositBase),
      depositDiscount: Number(quote.depositDiscount),
      depositCharge: Number(quote.depositCharge),
      totalAmount: Number(quote.finalTotalAmount),
      discountPercent: quote.discountPercent,
    };
  }

  private async buildQuote(userId: string, dto: CreateOrderDto) {
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
    let itemsSubtotal = new Decimal(0);
    let totalQty = 0;

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
      itemsSubtotal = itemsSubtotal.add(new Decimal(product.price).mul(item.quantity));
      totalQty += item.quantity;
    }

    const ifCanRefund = dto.ifCanRefund ?? false;
    const requestedReturned = ifCanRefund ? (dto.returnedCanCount ?? 0) : 0;
    const returnedCanCount = Math.max(0, Math.min(requestedReturned, totalQty));
    const chargeableCanCount = Math.max(0, totalQty - returnedCanCount);

    const depositConfig = await this.depositsService.getRuntimeConfig();
    const depositEnabled = depositConfig.enabled;
    const depositBase = depositEnabled
      ? new Decimal(depositConfig.perCanAmount).mul(chargeableCanCount)
      : new Decimal(0);
    const discountPercent = depositEnabled
      ? this.depositsService.resolveDiscountPercentForQty(chargeableCanCount, depositConfig)
      : 0;
    const depositDiscount = depositEnabled
      ? depositBase.mul(new Decimal(discountPercent).div(100))
      : new Decimal(0);
    const depositCharge = depositEnabled
      ? Decimal.max(new Decimal(0), depositBase.sub(depositDiscount))
      : new Decimal(0);
    const finalTotalAmount = itemsSubtotal.add(depositCharge);
    return {
      address,
      orderItems,
      itemsSubtotal,
      depositEnabled,
      ifCanRefund,
      totalQty,
      returnedCanCount,
      chargeableCanCount,
      discountPercent,
      depositBase,
      depositDiscount,
      depositCharge,
      finalTotalAmount,
    };
  }

  async findMyOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: orderFullInclude,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o));
  }

  async track(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderFullInclude,
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
      include: orderFullInclude,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o, true));
  }

  async assignOrderToPartner(orderId: string, deliveryPartnerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot assign a cancelled order');
    }
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { id: deliveryPartnerId } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    if (!partner.isAvailable) {
      throw new BadRequestException('Delivery partner is not available');
    }
    if (order.deliveryStatus !== 'NONE' && order.deliveryStatus !== 'ASSIGNED') {
      throw new BadRequestException('Cannot reassign after pickup has started');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPartnerId,
        assignedAt: new Date(),
        deliveryStatus: 'ASSIGNED',
      },
      include: orderFullInclude,
    });
    await this.notifyOrderChanged(orderId);
    return this.toOrderResponse(updated, true);
  }

  async findOrdersForDeliveryPartner(userId: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    const orders = await this.prisma.order.findMany({
      where: { deliveryPartnerId: partner.id },
      include: orderFullInclude,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o, true));
  }

  async partnerUpdateDeliveryStatus(
    partnerUserId: string,
    orderId: string,
    nextStatus: string,
    deliveryNotes?: string,
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId: partnerUserId } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.deliveryPartnerId !== partner.id) {
      throw new ForbiddenException('This order is not assigned to you');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Order is cancelled');
    }
    if (!nextDeliveryStatus(order.deliveryStatus, nextStatus)) {
      throw new BadRequestException(
        `Invalid delivery status transition from ${order.deliveryStatus} to ${nextStatus}`,
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: nextStatus,
        ...(deliveryNotes !== undefined ? { deliveryNotes } : {}),
      },
      include: orderFullInclude,
    });
    await this.notifyOrderChanged(orderId);
    return this.toOrderResponse(updated, true);
  }

  async partnerConfirmCansReceived(
    partnerUserId: string,
    orderId: string,
    deliveryNotes?: string,
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId: partnerUserId } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.deliveryPartnerId !== partner.id) {
      throw new ForbiddenException('This order is not assigned to you');
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Order is cancelled');
    }
    if (order.deliveryStatus !== 'DELIVERED') {
      throw new BadRequestException(
        `Can receive confirmation is allowed only after delivery. Current delivery status: ${order.deliveryStatus}`,
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: 'CANS_RETURNED',
        ...(deliveryNotes !== undefined ? { deliveryNotes } : {}),
      },
      include: orderFullInclude,
    });
    await this.notifyOrderChanged(orderId);
    return this.toOrderResponse(updated, true);
  }

  async notifyOrderChanged(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderFullInclude,
    });
    if (!order) return;
    const body = {
      ...this.toOrderResponse(order, true),
      orderId: order.id,
      userId: order.userId,
      deliveryPartnerUserId: order.deliveryPartner?.userId ?? undefined,
    };
    this.ordersGateway.emitOrderUpdate(body as Record<string, unknown>);
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
        include: orderFullInclude,
      });
      await this.notifyOrderChanged(orderId);
      return this.toOrderResponse(updated, true);
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
      include: orderFullInclude,
    });
    await this.notifyOrderChanged(orderId);
    return this.toOrderResponse(updated, true);
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
      deliveryPartnerId?: string | null;
      assignedAt?: Date | null;
      deliveryStatus?: string;
      deliveryNotes?: string | null;
      timeSlot: string;
      paymentMethod: string;
      status: string;
      ifCanRefund?: boolean;
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
      deliveryPartner?: {
        id: string;
        userId: string;
        name: string;
        phone: string;
      } | null;
    },
    includeUser = false,
  ) {
    const deliveryPartner = order.deliveryPartner;
    const base = {
      id: order.id,
      addressId: order.addressId,
      deliveryPartnerId: order.deliveryPartnerId ?? null,
      assignedAt: order.assignedAt?.toISOString() ?? null,
      deliveryStatus: order.deliveryStatus ?? 'NONE',
      deliveryNotes: order.deliveryNotes ?? null,
      deliveryPartner: deliveryPartner
        ? {
            id: deliveryPartner.id,
            userId: deliveryPartner.userId,
            name: deliveryPartner.name,
            phone: deliveryPartner.phone,
          }
        : null,
      timeSlot: order.timeSlot,
      paymentMethod: order.paymentMethod,
      status: order.status,
      ifCanRefund: order.ifCanRefund ?? false,
      totalAmount: Number(order.totalAmount),
      depositBase: Number((order as { depositBase?: Decimal }).depositBase ?? 0),
      depositDiscount: Number((order as { depositDiscount?: Decimal }).depositDiscount ?? 0),
      depositCharge: Number((order as { depositCharge?: Decimal }).depositCharge ?? 0),
      depositRefunded: !!(order as { depositRefundedAt?: Date | null }).depositRefundedAt,
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
