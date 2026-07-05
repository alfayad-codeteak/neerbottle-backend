import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

export class AdminCreateOrderDto extends CreateOrderDto {
  @ApiProperty({
    description: 'Customer user id (`User.id`). Address must belong to this customer.',
    example: 'clxyz123',
  })
  @IsString()
  userId: string;
}
