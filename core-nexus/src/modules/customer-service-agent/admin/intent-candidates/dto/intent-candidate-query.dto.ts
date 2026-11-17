import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export const CUSTOMER_SERVICE_INTENT_CANDIDATE_STATUSES = ['PENDING', 'CONVERTED', 'IGNORED'] as const;

export class CustomerServiceIntentCandidateQueryDto extends PaginationDto {
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

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_INTENT_CANDIDATE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_INTENT_CANDIDATE_STATUSES)
  status?: string;
}
