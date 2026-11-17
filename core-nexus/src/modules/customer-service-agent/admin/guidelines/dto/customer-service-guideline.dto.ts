import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import {
  CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES,
} from '../../../runtime/guideline/customer-service-guideline.type';

export class CustomerServiceGuidelineQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() keyword?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() originType?: string;
}

export class CreateCustomerServiceGuidelineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiProperty() @IsString() @Length(2, 120) @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/) code!: string;
  @ApiProperty() @IsString() @Length(1, 160) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() originType?: string;
}

export class UpdateCustomerServiceGuidelineDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['DRAFT', 'ENABLED', 'DISABLED', 'ARCHIVED']) status?: string;
}

export class CreateCustomerServiceGuidelineVersionDto {
  @ApiProperty({ type: Object }) @IsObject() binding!: Record<string, unknown>;
  @ApiProperty({ type: Object }) @IsObject() condition!: Record<string, unknown>;
  @ApiProperty({ type: Array }) @IsArray() actions!: unknown[];
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) priority?: number;
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES }) @IsOptional() @IsIn(CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES) criticality?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() relationships?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() evidenceRefs?: string[];
  @ApiPropertyOptional({ enum: ['DRAFT', 'CANDIDATE'] }) @IsOptional() @IsIn(['DRAFT', 'CANDIDATE']) status?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() regressionResult?: Record<string, unknown>;
}

export class PublishCustomerServiceGuidelineVersionDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}

export class RollbackCustomerServiceGuidelineVersionDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) guidelineRevision!: number;
  @ApiProperty() @IsString() @Length(2, 500) reason!: string;
  @ApiProperty() @IsIn([true]) confirmRollback!: true;
}
