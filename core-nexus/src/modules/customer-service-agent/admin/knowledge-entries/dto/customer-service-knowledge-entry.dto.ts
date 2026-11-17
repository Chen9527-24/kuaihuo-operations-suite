import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export const CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES = ['STORE', 'ACCOUNT', 'COLLECTION'] as const;
export const CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES = ['FAQ', 'PRODUCT', 'SERVICE', 'SERVICE_POLICY', 'BRAND_FACT', 'ACTIVITY', 'DOCUMENT', 'REFERENCE', 'OTHER'] as const;
export const CUSTOMER_SERVICE_KNOWLEDGE_STATUSES = ['DRAFT', 'ENABLED', 'DISABLED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES = ['MANUAL', 'DOCUMENT', 'IMPORT', 'CALIBRATION_DRAFT'] as const;

export class CustomerServiceKnowledgeEntryQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() keyword?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES) scopeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scopeKey?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES) category?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_STATUSES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_STATUSES) status?: string;
}

export class CreateCustomerServiceKnowledgeEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiProperty({ enum: CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES }) @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES) scopeType!: string;
  @ApiProperty() @IsString() @Length(1, 500) scopeKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() collectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 40) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 240) entityKey?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() structuredData?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() references?: Array<Record<string, unknown>>;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 40) authorityLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) chunkIndex?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) sourceFileName?: string;
  @ApiProperty({ enum: CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES }) @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES) category!: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) question?: string;
  @ApiProperty() @IsString() @Length(1, 20000) content!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES) sourceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) sourceReference?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) freshnessPolicy?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_STATUSES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_STATUSES) status?: string;
}

export class UpdateCustomerServiceKnowledgeEntryDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES) scopeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) scopeKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() collectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 40) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 240) entityKey?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() structuredData?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() references?: Array<Record<string, unknown>>;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 40) authorityLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) chunkIndex?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) sourceFileName?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) question?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 20000) content?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES) sourceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) sourceReference?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() effectiveTo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) freshnessPolicy?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_STATUSES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_STATUSES) status?: string;
}

export class DeleteCustomerServiceKnowledgeEntryDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}


export const CUSTOMER_SERVICE_KNOWLEDGE_BINDING_TARGET_TYPES = ['ACCOUNT', 'STORE', 'ROLE'] as const;

export class CustomerServiceKnowledgeApplicabilityTargetDto {
  @ApiProperty({ enum: CUSTOMER_SERVICE_KNOWLEDGE_BINDING_TARGET_TYPES })
  @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_BINDING_TARGET_TYPES)
  targetType!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  targetKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({ enum: ['ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  status?: string;
}

export class CreateCustomerServiceKnowledgeCollectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) industryCode?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_STATUSES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_STATUSES) status?: string;
  @ApiPropertyOptional({ type: [CustomerServiceKnowledgeApplicabilityTargetDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomerServiceKnowledgeApplicabilityTargetDto)
  applicability?: CustomerServiceKnowledgeApplicabilityTargetDto[];
}

export class UpdateCustomerServiceKnowledgeCollectionDto {
  @ApiProperty() @IsInt() @Min(1) revision!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 80) industryCode?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_STATUSES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_STATUSES) status?: string;
  @ApiPropertyOptional({ type: [CustomerServiceKnowledgeApplicabilityTargetDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomerServiceKnowledgeApplicabilityTargetDto)
  applicability?: CustomerServiceKnowledgeApplicabilityTargetDto[];
}

export class UpsertCustomerServiceKnowledgeBindingDto {
  @ApiProperty({ enum: CUSTOMER_SERVICE_KNOWLEDGE_BINDING_TARGET_TYPES }) @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_BINDING_TARGET_TYPES) targetType!: string;
  @ApiProperty() @IsString() @Length(1, 500) targetKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) priority?: number;
  @ApiPropertyOptional({ enum: ['ENABLED', 'DISABLED'] }) @IsOptional() @IsIn(['ENABLED', 'DISABLED']) status?: string;
}

export class BatchImportCustomerServiceKnowledgeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiProperty() @IsString() collectionId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) sourceFileName?: string;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_KNOWLEDGE_STATUSES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_STATUSES) status?: string;
  @ApiProperty({ type: [Object] }) @IsArray() entries!: Array<Record<string, unknown>>;
}

export class PreviewCustomerServiceKnowledgeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountProfileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeProfileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchantRoleId?: string;
  @ApiProperty() @IsString() @Length(1, 4000) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scenario?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() intent?: string;
}

export class ResolveCustomerServiceFixedQaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountProfileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeProfileId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchantRoleId?: string;
  @ApiProperty() @IsString() @Length(1, 4000) message!: string;
}
