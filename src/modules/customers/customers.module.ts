import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersService } from './customers.service';
import { AdminCustomersController } from './admin-customers.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminCustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
