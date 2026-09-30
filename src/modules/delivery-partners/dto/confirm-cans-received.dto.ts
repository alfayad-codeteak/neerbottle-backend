import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmCansReceivedDto {
  @ApiPropertyOptional({
    description:
      'Empty cans actually collected at the door. Omit to keep the promised checkout count (no deposit change).',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualReturnedCanCount?: number;

  @ApiPropertyOptional({
    description: 'Optional note saved as delivery notes while confirming can return',
    example: 'Customer returned 1 empty can at doorstep',
  })
  @IsOptional()
  @IsString()
  deliveryNotes?: string;
}
