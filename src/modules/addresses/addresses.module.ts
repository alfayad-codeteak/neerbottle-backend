import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({
  imports: [AuthModule, DeliveryZonesModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
