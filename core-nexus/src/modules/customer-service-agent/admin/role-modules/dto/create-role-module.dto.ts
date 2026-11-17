import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import {
  CUSTOMER_SERVICE_ROLE_MODULE_MERGE_MODES,
  CUSTOMER_SERVICE_ROLE_MODULE_STATUSES,
} from '../../../shared/constants/customer-service-role-module.constant';

export class CreateCustomerServiceRoleModuleDto {
  @ApiProperty()
  @IsString()
  definitionId!: string;

  @ApiProperty({ example: 'after-sale-posture' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  key!: string;

  @ApiProperty({ example: '售后服务姿态' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ROLE_MODULE_MERGE_MODES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ROLE_MODULE_MERGE_MODES)
  mergeMode?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 2000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  priority?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ROLE_MODULE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ROLE_MODULE_STATUSES)
  status?: string;
}
