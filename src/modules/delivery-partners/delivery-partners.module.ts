import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryPartnersService } from './delivery-partners.service';
import { DeliveryPartnersController } from './delivery-partners.controller';
import { AdminDeliveryPartnersController } from './admin-delivery-partners.controller';
import { AdminDeliverySettingsController } from './admin-delivery-settings.controller';

@Module({
  imports: [OrdersModule],
  controllers: [
    DeliveryPartnersController,
    AdminDeliveryPartnersController,
    AdminDeliverySettingsController,
  ],
  providers: [DeliveryPartnersService],
  exports: [DeliveryPartnersService],
})
export class DeliveryPartnersModule {}
