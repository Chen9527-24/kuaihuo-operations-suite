import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { CUSTOMER_SERVICE_ASSET_TYPES } from '../../../shared/constants/customer-service-foundation.constant';

export class CreateCustomerServiceAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'after-sale-basic-policy' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  key!: string;

  @ApiProperty({ example: '基础售后策略' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ enum: CUSTOMER_SERVICE_ASSET_TYPES })
  @IsIn(CUSTOMER_SERVICE_ASSET_TYPES)
  assetType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
