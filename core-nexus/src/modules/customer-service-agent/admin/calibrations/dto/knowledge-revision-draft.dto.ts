import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import {
  CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES,
  CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES,
} from '../../knowledge-entries/dto/customer-service-knowledge-entry.dto';

export class CreateCustomerServiceKnowledgeRevisionDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetEntryId?: string;

  @ApiProperty({ enum: CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES })
  @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_SCOPE_TYPES)
  scopeType!: string;

  @ApiProperty({ enum: CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES })
  @IsIn(CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES)
  category!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  question?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 20000)
  content!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  sourceReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 120)
  freshnessPolicy?: string;
}

export class VerifyCustomerServiceKnowledgeRevisionDraftDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ description: '必须由人工明确确认事实已经核实' })
  @IsBoolean()
  confirmedFact!: boolean;

  @ApiProperty()
  @IsString()
  @Length(2, 2000)
  verificationNote!: string;
}

export class PublishCustomerServiceKnowledgeRevisionDraftDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ description: '人工确认将已核实草稿发布为正式启用知识' })
  @IsBoolean()
  confirmPublish!: boolean;
}
