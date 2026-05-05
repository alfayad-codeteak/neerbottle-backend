import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateDeliveryZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng: number;

  @IsNumber()
  @Min(0.1)
  radiusKm: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

