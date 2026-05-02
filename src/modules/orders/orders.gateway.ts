import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { secretFromConfig } from '../../config/secret-from-env';

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
    } catch {
      client.disconnect();
    }
  }

  emitOrderUpdate(payload: Record<string, unknown>) {
    if (!this.server) return;
    const userId = payload.userId as string;
    const partnerUserId = payload.deliveryPartnerUserId as string | undefined;
    const orderId = payload.orderId as string;
    this.server.to(`user:${userId}`).emit('order.updated', payload);
    if (partnerUserId && partnerUserId !== userId) {
      this.server.to(`user:${partnerUserId}`).emit('order.updated', payload);
    }
    if (orderId) {
      this.server.to(`order:${orderId}`).emit('order.updated', payload);
    }
  }
}
