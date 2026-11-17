import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CUSTOMER_SERVICE_INDUSTRY_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class CustomerServiceIndustryNodeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_INDUSTRY_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_INDUSTRY_STATUSES)
  status?: string;
}
