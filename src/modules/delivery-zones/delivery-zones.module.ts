import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryZonesService } from './delivery-zones.service';
import { AdminDeliveryZonesController } from './admin-delivery-zones.controller';
import { DeliveryZonesController } from './delivery-zones.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminDeliveryZonesController, DeliveryZonesController],
  providers: [DeliveryZonesService],
  exports: [DeliveryZonesService],
})
export class DeliveryZonesModule {}

