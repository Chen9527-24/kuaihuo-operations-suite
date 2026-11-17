import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES } from '../../../shared/calibration/customer-service-calibration-profile.util';

export const CUSTOMER_SERVICE_CALIBRATION_PROFILE_STATUSES = ['ACTIVE', 'DISABLED', 'ARCHIVED'] as const;

export class CustomerServiceCalibrationProfileQueryDto extends PaginationDto {
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
  merchantRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenario?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES)
  scopeType?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CALIBRATION_PROFILE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_PROFILE_STATUSES)
  status?: string;
}
