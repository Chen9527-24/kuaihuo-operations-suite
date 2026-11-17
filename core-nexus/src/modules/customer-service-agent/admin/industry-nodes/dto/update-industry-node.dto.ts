import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CUSTOMER_SERVICE_INDUSTRY_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class UpdateCustomerServiceIndustryNodeDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_INDUSTRY_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_INDUSTRY_STATUSES)
  status?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;
}
