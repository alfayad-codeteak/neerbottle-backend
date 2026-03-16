import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ORDER_STATUSES } from '../orders.constants';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] })
  @IsIn(['CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'])
  status: string;
}
