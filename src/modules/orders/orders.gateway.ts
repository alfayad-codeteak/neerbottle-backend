import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { secretFromConfig } from '../../config/secret-from-env';
import { PrismaService } from '../../prisma/prisma.service';

const ADMIN_ROOM = 'admins';
const PARTNERS_ROOM = 'partners';

@WebSocketGateway({
  namespace: '/orders',
  cors: { origin: true, credentials: true },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const fromAuth =
      typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : '';
    const fromQuery =
      typeof client.handshake.query?.token === 'string'
        ? client.handshake.query.token
        : Array.isArray(client.handshake.query?.token)
          ? client.handshake.query.token[0]
          : '';
    const authHeader = client.handshake.headers.authorization;
    const fromHeader =
      typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const raw = fromAuth || fromQuery || fromHeader;
    if (!raw) {
      this.logger.warn('WS /orders: disconnected (no token)');
      client.disconnect();
      return;
    }
    try {
      const secret = secretFromConfig(this.config, 'JWT_ACCESS_SECRET', 'access-secret-change-me');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(raw, { secret });
      const userId = payload.sub;
      client.data.userId = userId;
      await client.join(`user:${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role === 'admin' || user?.role === 'owner') {
        client.data.role = user.role;
        await client.join(ADMIN_ROOM);
      }
      if (user?.role === 'deliveryPartner') {
        client.data.role = user.role;
        await client.join(PARTNERS_ROOM);
      }
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('order.join')
  async joinOrderRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'unauthorized' };
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (!orderId) return { ok: false, error: 'missing_orderId' };
    await client.join(`order:${orderId}`);
    return { ok: true };
  }

  @SubscribeMessage('order.leave')
  async leaveOrderRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return { ok: false, error: 'unauthorized' };
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (!orderId) return { ok: false, error: 'missing_orderId' };
    await client.leave(`order:${orderId}`);
    return { ok: true };
  }

  emitOrderUpdate(payload: Record<string, unknown>) {
    if (!this.server) return;
    const userId = payload.userId as string;
    const partnerUserId = payload.deliveryPartnerUserId as string | undefined;
    const orderId = payload.orderId as string;
    const deliveryStatus = payload.deliveryStatus as string | undefined;

    this.server.to(`user:${userId}`).emit('order.updated', payload);
    this.server.to(ADMIN_ROOM).emit('order.updated', payload);
    if (partnerUserId && partnerUserId !== userId) {
      this.server.to(`user:${partnerUserId}`).emit('order.updated', payload);
      if (deliveryStatus === 'ASSIGNED') {
        this.server.to(`user:${partnerUserId}`).emit('order.assigned', payload);
      }
    }
    if (orderId) {
      this.server.to(`order:${orderId}`).emit('order.updated', payload);
    }
  }

  /** Live ping for admin portals when a customer places an order. */
  emitOrderCreated(payload: Record<string, unknown>) {
    if (!this.server) return;
    this.server.to(ADMIN_ROOM).emit('order.created', payload);
  }

  /** Broadcast an unassigned order so online partners can accept it. */
  emitOrderOffered(payload: Record<string, unknown>) {
    if (!this.server) return;
    this.server.to(PARTNERS_ROOM).emit('order.offered', payload);
    this.server.to(ADMIN_ROOM).emit('order.offered', payload);
  }

  /** First partner accepted (or admin assigned) — others should drop the offer. */
  emitOrderOfferedTaken(payload: Record<string, unknown>) {
    if (!this.server) return;
    this.server.to(PARTNERS_ROOM).emit('order.offered.taken', payload);
    this.server.to(ADMIN_ROOM).emit('order.offered.taken', payload);
  }
}
