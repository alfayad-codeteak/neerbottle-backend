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

  async notifyOrderUpdated(args: { userId: string; orderId: string; status: string; deliveryStatus?: string }) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: args.userId },
      select: { token: true },
    });
    const tokenStrings = tokens.map((t) => t.token);

    const title = 'Order update';
    const body = `Your order status is now ${args.status}`;
    const data: Record<string, string> = {
      type: 'order.updated',
      orderId: args.orderId,
      status: args.status,
    };
    if (args.deliveryStatus) data.deliveryStatus = args.deliveryStatus;

    const res = await this.fcm.sendToTokens({
      tokens: tokenStrings,
      title,
      body,
      data,
    });

    if (res.invalidTokens.length > 0) {
      await this.prisma.pushToken.deleteMany({
        where: { token: { in: res.invalidTokens } },
      });
    }

    return res;
  }
}

