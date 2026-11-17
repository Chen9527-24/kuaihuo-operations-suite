import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class CustomerServiceResponseRuleQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES)
  status?: string;
}
