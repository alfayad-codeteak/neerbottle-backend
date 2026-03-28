import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryPartnersService } from './delivery-partners.service';
import { DeliveryPartnersController } from './delivery-partners.controller';
import { AdminDeliveryPartnersController } from './admin-delivery-partners.controller';

@Module({
  imports: [OrdersModule],
  controllers: [DeliveryPartnersController, AdminDeliveryPartnersController],
  providers: [DeliveryPartnersService],
  exports: [DeliveryPartnersService],
})
export class DeliveryPartnersModule {}
