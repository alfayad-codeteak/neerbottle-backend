import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DepositsModule } from '../deposits/deposits.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { PushModule } from '../push/push.module';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';

@Module({
  imports: [AuthModule, forwardRef(() => DepositsModule), PushModule, DeliveryZonesModule],
  controllers: [OrdersController, AdminOrdersController, PublicOrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
