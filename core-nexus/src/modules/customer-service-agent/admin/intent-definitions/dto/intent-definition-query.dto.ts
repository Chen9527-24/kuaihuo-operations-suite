import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export const CUSTOMER_SERVICE_INTENT_STATUSES = ['DRAFT', 'ENABLED', 'DISABLED', 'ARCHIVED'] as const;

export class CustomerServiceIntentDefinitionQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenario?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_INTENT_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_INTENT_STATUSES)
  status?: string;
}
