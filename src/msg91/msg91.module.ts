import { Module } from '@nestjs/common';
import { Msg91Service } from './msg91.service';

@Module({
  providers: [Msg91Service],
  exports: [Msg91Service],
})
export class Msg91Module {}
