import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AddressesModule } from '../addresses/addresses.module';
import { CustomersService } from './customers.service';
import { AdminCustomersController } from './admin-customers.controller';

@Module({
  imports: [AuthModule, AddressesModule],
  controllers: [AdminCustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
