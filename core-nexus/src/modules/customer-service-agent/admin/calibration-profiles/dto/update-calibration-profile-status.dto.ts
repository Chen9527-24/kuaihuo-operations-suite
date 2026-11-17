import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CUSTOMER_SERVICE_CALIBRATION_PROFILE_STATUSES } from './calibration-profile-query.dto';

export class UpdateCustomerServiceCalibrationProfileStatusDto {
  @ApiProperty({ enum: CUSTOMER_SERVICE_CALIBRATION_PROFILE_STATUSES })
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_PROFILE_STATUSES)
  status!: string;
}
