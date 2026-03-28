import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AssignOrderDto {
  @ApiProperty({ description: 'DeliveryPartner id (not user id)' })
  @IsString()
  deliveryPartnerId: string;
}
