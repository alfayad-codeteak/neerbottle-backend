import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsIn, ValidateNested, ArrayMinSize, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../orders.constants';

export class CreateOrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Delivery address ID (must belong to user)' })
  @IsString()
  addressId: string;

  @ApiProperty({ example: '10:00-12:00', description: 'Delivery time slot' })
  @IsString()
  timeSlot: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: string;

  @ApiProperty({ type: [CreateOrderItemDto], description: 'Cart items' })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
