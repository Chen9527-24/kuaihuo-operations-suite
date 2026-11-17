import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export const CUSTOMER_SERVICE_CONTEXT_STATUSES = ['DRAFT', 'ENABLED', 'DISABLED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES = [
  'GLOBAL', 'STORE', 'ACCOUNT', 'ROLE', 'CHANNEL', 'SCENARIO', 'INTENT',
] as const;
export const CUSTOMER_SERVICE_ACCOUNT_CHANNELS = [
  'WECHAT', 'TAOBAO', 'DOUYIN', 'XIAOHONGSHU', 'WEB', 'AFTER_SALES', 'PRIVATE_DOMAIN', 'OTHER',
] as const;

export class CustomerServiceContextProfileQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}

export class CustomerServiceAccountProfileQueryDto extends CustomerServiceContextProfileQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeProfileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantRoleId?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ACCOUNT_CHANNELS })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ACCOUNT_CHANNELS)
  channel?: string;
}

export class CustomerServiceLanguagePolicyQueryDto extends CustomerServiceContextProfileQueryDto {
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES)
  scopeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeKey?: string;
}

export class CreateCustomerServiceStoreProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  profile!: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}

export class UpdateCustomerServiceStoreProfileDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}

export class CreateCustomerServiceAccountProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeProfileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryNodeId?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ACCOUNT_CHANNELS })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ACCOUNT_CHANNELS)
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  profile!: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}

export class UpdateCustomerServiceAccountProfileDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeProfileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryNodeId?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ACCOUNT_CHANNELS })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ACCOUNT_CHANNELS)
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}

export class CreateCustomerServiceLanguagePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  code!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @ApiProperty({ enum: CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES })
  @IsIn(CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES)
  scopeType!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  scopeKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiProperty({ type: [Object] })
  @Type(() => Object)
  @IsArray()
  @IsObject({ each: true })
  rules!: Record<string, unknown>[];

  @ApiPropertyOptional({
    type: Object,
    description: '兼容/管理字段：保留存储与读取；普通 HVE Generation 不再将其作为 Persona HOW。自然表达请配置 Role / Identity generationPrompt。',
  })
  @IsOptional()
  @IsObject()
  styleGuidance?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}

export class UpdateCustomerServiceLanguagePolicyDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_LANGUAGE_SCOPE_TYPES)
  scopeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  scopeKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @Type(() => Object)
  @IsArray()
  @IsObject({ each: true })
  rules?: Record<string, unknown>[];

  @ApiPropertyOptional({
    type: Object,
    description: '兼容/管理字段：保留存储与读取；普通 HVE Generation 不再将其作为 Persona HOW。自然表达请配置 Role / Identity generationPrompt。',
  })
  @IsOptional()
  @IsObject()
  styleGuidance?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CONTEXT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CONTEXT_STATUSES)
  status?: string;
}
