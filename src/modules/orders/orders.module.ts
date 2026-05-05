import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DepositsModule } from '../deposits/deposits.module';
import { PushModule } from '../push/push.module';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';

@Module({
  imports: [AuthModule, DepositsModule, PushModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService],
})
export class OrdersModule {}
