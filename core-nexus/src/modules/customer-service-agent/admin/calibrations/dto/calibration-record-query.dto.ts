import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import {
  CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES,
  CUSTOMER_SERVICE_CALIBRATION_STATUSES,
} from '../../../shared/constants/customer-service-calibration.constant';

export class CustomerServiceCalibrationRecordQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CALIBRATION_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_STATUSES)
  status?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES)
  problemType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenario?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountProfileId?: string;
}
