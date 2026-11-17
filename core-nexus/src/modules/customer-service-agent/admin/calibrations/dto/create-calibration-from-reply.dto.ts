import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  CUSTOMER_SERVICE_CALIBRATION_IMPROVEMENT_MODES,
  CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES,
} from '../../../shared/constants/customer-service-calibration.constant';

export class CreateCustomerServiceCalibrationFromReplyDto {
  @ApiProperty()
  @IsString()
  replyTraceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceRefId?: string;

  @ApiPropertyOptional({ type: [Number], description: '留空时以完整 reply attempt 为校准对象' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(20, { each: true })
  selectedSegmentIndexes?: number[];

  @ApiProperty({ enum: CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES, { each: true })
  problemTypes!: string[];

  @ApiProperty({ enum: CUSTOMER_SERVICE_CALIBRATION_IMPROVEMENT_MODES, default: 'AI_AUTO' })
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_IMPROVEMENT_MODES)
  improvementMode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  problemDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  userSuggestion?: string;
}
