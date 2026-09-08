import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { OwnerModule } from './modules/owner/owner.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { DeliveryPartnersModule } from './modules/delivery-partners/delivery-partners.module';
import { PushModule } from './modules/push/push.module';
import { DeliveryZonesModule } from './modules/delivery-zones/delivery-zones.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { BannersModule } from './modules/banners/banners.module';
import { R2StorageModule } from './modules/storage/r2-storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RedisModule,
    R2StorageModule,
    HealthModule,
    AuthModule,
    ProductsModule,
    OwnerModule,
    AddressesModule,
    OrdersModule,
    CustomersModule,
    DepositsModule,
    DeliveryPartnersModule,
    PushModule,
    DeliveryZonesModule,
    PurchasesModule,
    BannersModule,
  ],
})
export class AppModule {}
