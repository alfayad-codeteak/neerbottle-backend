import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryPartnersService } from './delivery-partners.service';
import { DeliveryPartnersController } from './delivery-partners.controller';
import { AdminDeliveryPartnersController } from './admin-delivery-partners.controller';
import { AdminDeliverySettingsController } from './admin-delivery-settings.controller';
import { AdminDeliveryReportsController } from './admin-delivery-reports.controller';

@Module({
  imports: [OrdersModule],
  controllers: [
    DeliveryPartnersController,
    AdminDeliveryPartnersController,
    AdminDeliverySettingsController,
    AdminDeliveryReportsController,
  ],
  providers: [DeliveryPartnersService],
  exports: [DeliveryPartnersService],
})
export class DeliveryPartnersModule {}
