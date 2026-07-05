import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { AdminPurchasesController } from './admin-purchases.controller';

@Module({
  controllers: [AdminPurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
