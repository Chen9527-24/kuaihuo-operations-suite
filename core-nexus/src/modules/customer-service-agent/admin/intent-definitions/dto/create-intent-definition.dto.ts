import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { CUSTOMER_SERVICE_INTENT_STATUSES } from './intent-definition-query.dto';

export class CreateCustomerServiceIntentDefinitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'logistics-urge' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  key!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiProperty({ example: 'LOGISTICS' })
  @IsString()
  @Length(2, 48)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'LOGISTICS_DELAY' })
  @IsString()
  @Length(2, 64)
  scenario!: string;

  @ApiProperty({ example: 'REQUEST_ACTION' })
  @IsString()
  @Length(2, 64)
  primaryIntent!: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  defaultRiskLevel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  supportedIndustryCodes?: string[];

  @ApiProperty({ type: Object })
  @IsObject()
  recognitionConfig!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  @IsObject()
  strategyConfig!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  @IsObject()
  flowConfig!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  @IsObject()
  replyConfig!: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  examples?: Record<string, unknown>;

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

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_INTENT_STATUSES, default: 'ENABLED' })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_INTENT_STATUSES)
  status?: string;
}
