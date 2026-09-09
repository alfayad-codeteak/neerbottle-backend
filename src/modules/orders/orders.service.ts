import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AdminCreateOrderDto } from './dto/admin-create-order.dto';
import { STATUS_FLOW, OrderStatus } from './orders.constants';
import { nextDeliveryStatus, warehouseStatusForDeliveryStep } from './delivery.constants';
import { DepositsService } from '../deposits/deposits.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { OrdersGateway } from './orders.gateway';
import { PushService } from '../push/push.service';
import { Prisma } from '../../generated/prisma';
import { formatPublicOrderNumber, publicOrderDatePrefix } from './order-number';

const orderFullInclude = {
  items: { include: { product: true } },
  address: true,
  user: { select: { id: true, phone: true, name: true } },
  deliveryPartner: { select: { id: true, userId: true, name: true, phone: true } },
} as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly depositsService: DepositsService,
    private readonly ordersGateway: OrdersGateway,
    private readonly pushService: PushService,
    private readonly deliveryZones: DeliveryZonesService,
  ) {}

  async create(userId: string, dto: CreateOrderDto, includeUser = false) {
    const timeSlot = (dto.timeSlot ?? '').trim() || '07:00-09:00';
    const quote = await this.buildQuote(userId, dto);
    const orderItems = quote.orderItems;
    const depositBase = quote.depositBase;
    const depositDiscount = quote.depositDiscount;
    const depositCharge = quote.depositCharge;
    const handlingTotal = quote.handlingTotal;
    const finalTotalAmount = quote.finalTotalAmount;

    let created;
    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          const orderNumber = await this.allocatePublicOrderNumber(tx);
          const createdOrder = await tx.order.create({
            data: {
              orderNumber,
              userId,
              addressId: quote.address.id,
              timeSlot,
              paymentMethod: dto.paymentMethod,
              status: 'RECEIVED',
              ifCanRefund: quote.ifCanRefund,
              returnedCanCount: quote.returnedCanCount,
              totalAmount: finalTotalAmount,
              handlingTotal,
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
            include: orderFullInclude,
          });

          await Promise.all(
            orderItems.map((item) =>
              tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } },
              }),
            ),
          );

          if (Number(depositCharge) > 0) {
            const charge = Number(depositCharge);
            await tx.userDepositWallet.upsert({
              where: { userId },
              update: { balance: { increment: charge } },
              create: { userId, balance: charge },
            });
            await tx.depositTransaction.create({
              data: {
                userId,
                orderId: createdOrder.id,
                type: 'CHARGE',
                amount: charge,
                note: 'Deposit charged for order',
              },
            });
          }

          return createdOrder;
        },
        { maxWait: 5_000, timeout: 15_000 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`POST /orders create failed: ${msg}`);
      throw err;
    }

    this.queueOrderNotify(created.id, { created: true });
    return this.toOrderResponse(created, includeUser);
  }

  async createForCustomer(dto: AdminCreateOrderDto) {
    await this.assertCustomerExists(dto.userId);
    const { userId, ...orderDto } = dto;
    return this.create(userId, orderDto, true);
  }

  async quoteForCustomer(dto: AdminCreateOrderDto) {
    await this.assertCustomerExists(dto.userId);
    const { userId, ...orderDto } = dto;
    return this.quote(userId, orderDto);
  }

  private async assertCustomerExists(userId: string) {
    const customer = await this.prisma.user.findFirst({
      where: { id: userId, role: 'customer' },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }

  async quote(userId: string, dto: CreateOrderDto) {
    const quote = await this.buildQuote(userId, dto);
    return {
      itemsSubtotal: Number(quote.itemsSubtotal),
      handlingTotal: Number(quote.handlingTotal),
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
    const productIds = dto.items.map((i) => i.productId);
    const [address, products, depositConfig] = await Promise.all([
      this.prisma.address.findFirst({ where: { id: dto.addressId, userId } }),
      this.prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true, stock: { gt: 0 } },
      }),
      this.depositsService.getRuntimeConfig(),
    ]);
    if (!address) {
      throw new BadRequestException('Address not found or does not belong to you');
    }
    await this.deliveryZones.assertLocationServed(
      address.lat == null ? null : Number(address.lat),
      address.lng == null ? null : Number(address.lng),
    );

    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems: { productId: string; quantity: number; unitPrice: Decimal }[] = [];
    let itemsSubtotal = new Decimal(0);
    let handlingTotal = new Decimal(0);
    let totalQty = 0;
    let depositEligibleQty = 0;

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
      const lineHandling = new Decimal(product.handlingFee ?? 0).mul(item.quantity);
      if (lineHandling.gt(0)) {
        handlingTotal = handlingTotal.add(lineHandling);
      }
      totalQty += item.quantity;
      if (product.hasDeposit !== false) {
        depositEligibleQty += item.quantity;
      }
    }

    const ifCanRefund = dto.ifCanRefund ?? false;
    const requestedReturned = ifCanRefund ? (dto.returnedCanCount ?? 0) : 0;
    const returnedCanCount = Math.max(0, Math.min(requestedReturned, totalQty));
    const returnedForDeposit = Math.max(0, Math.min(returnedCanCount, depositEligibleQty));
    const chargeableCanCount = Math.max(0, depositEligibleQty - returnedForDeposit);

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
    const finalTotalAmount = itemsSubtotal.add(handlingTotal).add(depositCharge);
    return {
      address,
      orderItems,
      itemsSubtotal,
      handlingTotal,
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

  /** Unauthenticated lookup by public order number (DDMMYYYY + daily seq). */
  async publicTrackByNumber(orderNumber: string) {
    const normalized = orderNumber.replace(/[^\d]/g, '');
    if (!normalized) {
      throw new NotFoundException('Order not found');
    }
    const stripped = normalized.replace(/^0+/, '') || '0';
    const candidates = [...new Set([normalized, stripped])];

    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: { in: candidates } },
          { id: normalized },
        ],
      },
      include: orderFullInclude,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: this.statusLabel(order.status),
      deliveryStatus: order.deliveryStatus ?? 'NONE',
      createdAt: order.createdAt.toISOString(),
      city: order.address?.city ?? null,
      pincode: order.address?.pincode ?? null,
      items: order.items.map((i) => ({
        name: i.product?.name ?? 'Item',
        quantity: i.quantity,
      })),
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
    const [order, partner] = await Promise.all([
      this.prisma.order.findUnique({ where: { id: orderId } }),
      this.prisma.deliveryPartner.findUnique({ where: { id: deliveryPartnerId } }),
    ]);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot assign a cancelled order');
    }
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
    this.queueOrderNotify(orderId);
    return this.toOrderResponse(updated, true);
  }

  async findOrdersForDeliveryPartner(userId: string) {
    const partner = await this.getPartnerByAuthUserId(userId);
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryPartnerId: partner.id,
        status: { not: 'CANCELLED' },
        deliveryStatus: { in: ['ASSIGNED', 'PICKED_UP'] },
      },
      include: orderFullInclude,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o, true));
  }

  /**
   * Past jobs for this rider. Finished last-mile (`DELIVERED` / `CANS_RETURNED`),
   * warehouse delivered, or cancelled — even if warehouse status is still RECEIVED.
   */
  async findDeliveryPartnerOrderHistory(userId: string) {
    const partner = await this.getPartnerByAuthUserId(userId);
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "Order"
      WHERE "deliveryPartnerId" = ${partner.id}
        AND (
          UPPER(BTRIM("deliveryStatus")) IN ('DELIVERED', 'CANS_RETURNED')
          OR UPPER(BTRIM(status)) IN ('DELIVERED', 'CANCELLED')
        )
      ORDER BY "updatedAt" DESC
    `);
    if (ids.length === 0) return [];
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: orderFullInclude,
    });
    const byId = new Map(orders.map((o) => [o.id, o]));
    return ids
      .map((r) => byId.get(r.id))
      .filter((o): o is NonNullable<typeof o> => o != null)
      .map((o) => this.toOrderResponse(o, true));
  }

  private async getPartnerByAuthUserId(userId: string) {
    const byUser = await this.prisma.deliveryPartner.findUnique({ where: { userId } });
    if (byUser) return byUser;
    const byRow = await this.prisma.deliveryPartner.findUnique({ where: { id: userId } });
    if (byRow) return byRow;
    throw new NotFoundException('Delivery partner not found');
  }

  async partnerUpdateDeliveryStatus(
    partnerUserId: string,
    orderId: string,
    nextStatus: string,
    deliveryNotes?: string,
  ) {
    const [partner, order] = await Promise.all([
      this.prisma.deliveryPartner.findUnique({ where: { userId: partnerUserId } }),
      this.prisma.order.findUnique({ where: { id: orderId } }),
    ]);
    if (!partner) throw new NotFoundException('Delivery partner not found');
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
    const warehouseStatus = warehouseStatusForDeliveryStep(order.status, nextStatus);
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: nextStatus,
        ...(warehouseStatus ? { status: warehouseStatus } : {}),
        ...(deliveryNotes !== undefined ? { deliveryNotes } : {}),
      },
      include: orderFullInclude,
    });
    this.queueOrderNotify(orderId);
    return this.toOrderResponse(updated, true);
  }

  async partnerConfirmCansReceived(
    partnerUserId: string,
    orderId: string,
    deliveryNotes?: string,
  ) {
    const [partner, order] = await Promise.all([
      this.prisma.deliveryPartner.findUnique({ where: { userId: partnerUserId } }),
      this.prisma.order.findUnique({ where: { id: orderId } }),
    ]);
    if (!partner) throw new NotFoundException('Delivery partner not found');
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
    const warehouseStatus = warehouseStatusForDeliveryStep(order.status, 'CANS_RETURNED');
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: 'CANS_RETURNED',
        ...(warehouseStatus ? { status: warehouseStatus } : {}),
        ...(deliveryNotes !== undefined ? { deliveryNotes } : {}),
      },
      include: orderFullInclude,
    });
    this.queueOrderNotify(orderId);
    return this.toOrderResponse(updated, true);
  }

  /** Unassigned jobs that an online partner may accept (first accept wins). */
  async findOpenOrdersForDeliveryPartner() {
    if (!(await this.isPartnerSelfAssignEnabled())) {
      return [];
    }
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryPartnerId: null,
        deliveryStatus: 'NONE',
        status: { not: 'CANCELLED' },
      },
      include: orderFullInclude,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.toOrderResponse(o, true));
  }

  async acceptOrderByPartner(partnerUserId: string, orderId: string) {
    if (!(await this.isPartnerSelfAssignEnabled())) {
      throw new BadRequestException('Partner self-assign is turned off. Wait for admin to assign the order.');
    }
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId: partnerUserId } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    if (!partner.isAvailable) {
      throw new BadRequestException('Go online before accepting orders');
    }

    const claimed = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        deliveryPartnerId: null,
        deliveryStatus: 'NONE',
        status: { not: 'CANCELLED' },
      },
      data: {
        deliveryPartnerId: partner.id,
        assignedAt: new Date(),
        deliveryStatus: 'ASSIGNED',
      },
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!existing) throw new NotFoundException('Order not found');
      throw new ConflictException('This order was already taken');
    }

    const updated = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderFullInclude,
    });
    this.queueOrderNotify(orderId);
    return this.toOrderResponse(updated!, true);
  }

  /** Sockets + FCM after the HTTP response so checkout/status PATCH stay fast. */
  private queueOrderNotify(orderId: string, opts?: { created?: boolean }) {
    void this.notifyOrderChanged(orderId, opts);
  }

  async notifyOrderChanged(orderId: string, opts?: { created?: boolean }) {
    try {
      await this.notifyOrderChangedUnsafe(orderId, opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`notifyOrderChanged(${orderId}) failed: ${msg}`);
    }
  }

  private async notifyOrderChangedUnsafe(orderId: string, opts?: { created?: boolean }) {
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
    if (opts?.created) {
      this.ordersGateway.emitOrderCreated(body as Record<string, unknown>);
      const balance = await this.depositsService.getHeldDepositBalance(order.userId);
      this.ordersGateway.emitWalletUpdate({ userId: order.userId, balance });
    }

    const isOpenOffer =
      !order.deliveryPartnerId &&
      (order.deliveryStatus ?? 'NONE') === 'NONE' &&
      order.status !== 'CANCELLED';
    if (opts?.created && isOpenOffer) {
      const selfAssignOn = await this.isPartnerSelfAssignEnabled();
      if (selfAssignOn) {
        this.ordersGateway.emitOrderOffered(body as Record<string, unknown>);
        await this.pushService.notifyOrderOffered({
          orderId: order.id,
          status: order.status,
        });
      }
    }
    if (!opts?.created && order.deliveryStatus === 'ASSIGNED' && order.deliveryPartnerId) {
      this.ordersGateway.emitOrderOfferedTaken({
        orderId: order.id,
        deliveryPartnerId: order.deliveryPartnerId,
        deliveryPartnerUserId: order.deliveryPartner?.userId ?? undefined,
      });
    }

    await this.pushService.notifyOrderUpdated({
      customerUserId: order.userId,
      partnerUserId: order.deliveryPartner?.userId ?? undefined,
      orderId: order.id,
      status: order.status,
      deliveryStatus: order.deliveryStatus ?? undefined,
    });
  }

  private async allocatePublicOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = publicOrderDatePrefix();
    const rows = await tx.$queryRaw<Array<{ orderNumber: string }>>(Prisma.sql`
      SELECT "orderNumber"::text AS "orderNumber"
      FROM "Order"
      WHERE "orderNumber"::text LIKE ${`${prefix}%`}
      ORDER BY "orderNumber"::text DESC
      LIMIT 1
    `);
    const last = rows[0]?.orderNumber ?? '';
    const prev = last.startsWith(prefix)
      ? Number.parseInt(last.slice(prefix.length), 10)
      : 0;
    const seq = (Number.isFinite(prev) ? prev : 0) + 1;
    return formatPublicOrderNumber(prefix, seq);
  }

  private async isPartnerSelfAssignEnabled() {
    try {
      const row = await this.prisma.dispatchSettings.findUnique({
        where: { id: 'default' },
        select: { partnerSelfAssignEnabled: true },
      });
      return row?.partnerSelfAssignEnabled ?? true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`DispatchSettings unavailable, defaulting self-assign on: ${msg}`);
      return true;
    }
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
      this.queueOrderNotify(orderId);
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
    this.queueOrderNotify(orderId);
    return this.toOrderResponse(updated, true);
  }

  async cancel(orderId: string) {
    return this.updateStatus(orderId, 'CANCELLED');
  }

  private async restoreStock(orderId: string) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId } });
    await Promise.all(
      items.map((item) =>
        this.prisma.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        }),
      ),
    );
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
      orderNumber?: string;
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
      returnedCanCount?: number;
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
        name?: string | null;
        label: string | null;
        line1: string;
        line2: string | null;
        city: string;
        state: string | null;
        pincode: string | null;
        phone?: string | null;
        lat?: { toString(): string } | number | null;
        lng?: { toString(): string } | number | null;
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
      orderNumber: order.orderNumber ?? null,
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
      returnedCanCount: order.returnedCanCount ?? 0,
      totalAmount: Number(order.totalAmount),
      handlingTotal: Number((order as { handlingTotal?: Decimal }).handlingTotal ?? 0),
      depositBase: Number((order as { depositBase?: Decimal }).depositBase ?? 0),
      depositDiscount: Number((order as { depositDiscount?: Decimal }).depositDiscount ?? 0),
      depositCharge: Number((order as { depositCharge?: Decimal }).depositCharge ?? 0),
      depositRefunded: !!(order as { depositRefundedAt?: Date | null }).depositRefundedAt,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      address: {
        id: order.address.id,
        name: order.address.name ?? null,
        label: order.address.label,
        line1: order.address.line1,
        line2: order.address.line2,
        city: order.address.city,
        state: order.address.state,
        pincode: order.address.pincode,
        phone: order.address.phone ?? null,
        lat: order.address.lat == null ? null : Number(order.address.lat),
        lng: order.address.lng == null ? null : Number(order.address.lng),
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
