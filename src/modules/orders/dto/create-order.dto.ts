import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsIn, ValidateNested, ArrayMinSize, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../orders.constants';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Catalog product id; must be active and in stock at order time' })
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1, example: 2, description: 'Units of this SKU' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Saved address id; must belong to the authenticated customer' })
  @IsString()
  addressId: string;

  @ApiPropertyOptional({
    example: '2026-10-15 10:00-11:00',
    description:
      'Delivery window. Prefer `YYYY-MM-DD HH:mm-HH:mm` (India). Slot-only `HH:mm-HH:mm` is today in Asia/Kolkata. If that window has already started, the API rolls to the next bookable slot (after 9pm this is next-day 10:00-11:00).',
  })
  @IsOptional()
  @IsString()
  timeSlot?: string;

  @ApiProperty({
    enum: PAYMENT_METHODS,
    description: 'Payment channel for this order',
  })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: string;

  @ApiProperty({
    type: [CreateOrderItemDto],
    description: 'Non-empty cart; duplicate product lines should be merged client-side or rejected by validation',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({
    required: false,
    example: false,
    description: 'Whether customer has empty cans to return in this order flow',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ifCanRefund?: boolean;

  @ApiProperty({
    required: false,
    minimum: 0,
    example: 1,
    description: 'Number of old cans returned/exchanged in this order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  returnedCanCount?: number;
}
