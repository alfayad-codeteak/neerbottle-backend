import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const PARTNER_NEXT = ['PICKED_UP', 'DELIVERED', 'CANS_RETURNED'] as const;

export class UpdatePartnerDeliveryStatusDto {
  @ApiProperty({
    enum: PARTNER_NEXT,
    description: 'Next delivery step (must follow ASSIGNED → PICKED_UP → DELIVERED → CANS_RETURNED)',
  })
  @IsString()
  @IsIn([...PARTNER_NEXT])
  deliveryStatus: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryNotes?: string;
}
