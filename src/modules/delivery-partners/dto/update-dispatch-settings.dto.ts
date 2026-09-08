import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateDispatchSettingsDto {
  @ApiProperty({
    example: true,
    description: 'When true, online partners are notified of new orders and may accept them. When false, only admin assign.',
  })
  @IsBoolean()
  partnerSelfAssignEnabled: boolean;
}
