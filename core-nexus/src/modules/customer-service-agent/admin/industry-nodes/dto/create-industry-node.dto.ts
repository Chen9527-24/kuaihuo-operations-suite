import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import {
  CUSTOMER_SERVICE_INDUSTRY_NODE_TYPES,
  CUSTOMER_SERVICE_INDUSTRY_STATUSES,
} from '../../../shared/constants/customer-service-foundation.constant';

export class CreateCustomerServiceIndustryNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ example: 'ecommerce' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  code!: string;

  @ApiProperty({ example: '电商' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ enum: CUSTOMER_SERVICE_INDUSTRY_NODE_TYPES })
  @IsIn(CUSTOMER_SERVICE_INDUSTRY_NODE_TYPES)
  nodeType!: string;

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
