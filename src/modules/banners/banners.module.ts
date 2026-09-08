import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminBannersController } from './admin-banners.controller';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [AuthModule],
  controllers: [BannersController, AdminBannersController],
  providers: [BannersService],
})
export class BannersModule {}
