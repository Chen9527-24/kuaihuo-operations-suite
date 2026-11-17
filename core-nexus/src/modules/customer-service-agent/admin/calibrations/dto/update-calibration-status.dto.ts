import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CUSTOMER_SERVICE_CALIBRATION_STATUSES } from '../../../shared/constants/customer-service-calibration.constant';

export class UpdateCustomerServiceCalibrationStatusDto {
  @ApiProperty({ enum: CUSTOMER_SERVICE_CALIBRATION_STATUSES })
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_STATUSES)
  status!: string;
}
