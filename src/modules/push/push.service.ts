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
    // FCM `data` values must be strings.
    const data: Record<string, string> = Object.fromEntries(
      Object.entries(msg.data).map(([k, v]) => [k, String(v)]),
    );

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });

    const byPlatform = tokens.reduce(
      (acc, t) => {
        const platform =
          t.platform === 'android' || t.platform === 'ios' || t.platform === 'web'
            ? (t.platform as 'android' | 'ios' | 'web')
            : 'web';
        (acc[platform] ??= []).push(t.token);
        return acc;
      },
      {} as Record<'android' | 'ios' | 'web', string[]>,
    );

    const results = await Promise.all([
      this.fcm.sendToTokens({
        tokens: byPlatform.android ?? [],
        title: msg.title,
        body: msg.body,
        data,
        platform: 'android',
      }),
      this.fcm.sendToTokens({
        tokens: byPlatform.ios ?? [],
        title: msg.title,
        body: msg.body,
        data,
        platform: 'ios',
      }),
      this.fcm.sendToTokens({
        tokens: byPlatform.web ?? [],
        title: msg.title,
        body: msg.body,
        data,
        platform: 'web',
      }),
    ]);

    const res = {
      successCount: results.reduce((n, r) => n + r.successCount, 0),
      failureCount: results.reduce((n, r) => n + r.failureCount, 0),
      invalidTokens: results.flatMap((r) => r.invalidTokens),
    };

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

