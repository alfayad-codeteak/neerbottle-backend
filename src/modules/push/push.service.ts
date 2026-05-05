import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from './fcm.service';

@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  async registerToken(userId: string, args: { token: string; platform: string; deviceId?: string }) {
    await this.prisma.pushToken.upsert({
      where: { token: args.token },
      update: {
        userId,
        platform: args.platform,
        deviceId: args.deviceId ?? null,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token: args.token,
        platform: args.platform,
        deviceId: args.deviceId ?? null,
        lastSeenAt: new Date(),
      },
    });
    return { success: true };
  }

  async unregisterToken(userId: string, token: string) {
    // deleteMany so we don't 404 if token doesn't exist
    await this.prisma.pushToken.deleteMany({
      where: { userId, token },
    });
    return { success: true };
  }

  private async sendToUser(userId: string, msg: { title: string; body: string; data: Record<string, string> }) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    const tokenStrings = tokens.map((t) => t.token);

    const res = await this.fcm.sendToTokens({
      tokens: tokenStrings,
      title: msg.title,
      body: msg.body,
      data: msg.data,
    });

    if (res.invalidTokens.length > 0) {
      await this.prisma.pushToken.deleteMany({
        where: { token: { in: res.invalidTokens } },
      });
    }
    return res;
  }

  async notifyOrderUpdated(args: {
    customerUserId: string;
    partnerUserId?: string;
    orderId: string;
    status: string;
    deliveryStatus?: string;
  }) {
    const baseData: Record<string, string> = {
      orderId: args.orderId,
      status: args.status,
    };
    if (args.deliveryStatus) baseData.deliveryStatus = args.deliveryStatus;

    // Customer notification
    await this.sendToUser(args.customerUserId, {
      title: 'Order update',
      body: `Your order status is now ${args.status}`,
      data: { type: 'order.updated', ...baseData },
    });

    // Delivery partner notification (when assigned / delivery flow updates)
    if (args.partnerUserId && args.partnerUserId !== args.customerUserId) {
      const type =
        args.deliveryStatus === 'ASSIGNED' ? 'order.assigned' : 'order.updated';
      const title = args.deliveryStatus === 'ASSIGNED' ? 'New order assigned' : 'Order update';
      const body =
        args.deliveryStatus === 'ASSIGNED'
          ? 'A new order has been assigned to you.'
          : `Order status is now ${args.status}`;

      await this.sendToUser(args.partnerUserId, {
        title,
        body,
        data: { type, audience: 'deliveryPartner', ...baseData },
      });
    }
  }
}

