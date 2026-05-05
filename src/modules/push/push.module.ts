import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { FcmService } from './fcm.service';

@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [PushService, FcmService],
  exports: [PushService],
})
export class PushModule {}

