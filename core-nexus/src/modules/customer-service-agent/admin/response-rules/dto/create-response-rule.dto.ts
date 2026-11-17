import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class CreateCustomerServiceResponseRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'logistics-delay-workflow' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  key!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  responseAssetId!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  conditions!: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  exclusions?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sort?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  exclusive?: boolean;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES, default: 'ENABLED' })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES)
  status?: string;
}
