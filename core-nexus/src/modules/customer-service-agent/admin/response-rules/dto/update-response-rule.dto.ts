import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class UpdateCustomerServiceResponseRuleDto {
  @ApiProperty()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responseAssetId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  exclusions?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  exclusive?: boolean;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES)
  status?: string;
}
