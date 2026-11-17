import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CUSTOMER_SERVICE_ASSET_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class UpdateCustomerServiceAssetDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ASSET_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ASSET_STATUSES)
  status?: string;
}
