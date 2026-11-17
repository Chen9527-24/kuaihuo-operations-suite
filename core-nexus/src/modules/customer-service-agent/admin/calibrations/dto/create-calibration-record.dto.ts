import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import {
  CUSTOMER_SERVICE_CALIBRATION_IMPROVEMENT_MODES,
  CUSTOMER_SERVICE_CALIBRATION_PROBLEM_TYPES,
} from '../../../shared/constants/customer-service-calibration.constant';

export class CreateCustomerServiceCalibrationRecordDto {
  @ApiProperty()
  @IsString()
  merchantRoleId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evaluationCaseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceAnalysisId?: string;

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

  @ApiProperty()
  @IsString()
  @Length(1, 4000)
  customerMessage!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 12000)
  originalReply!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  scenario?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  intent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  riskLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  generationModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  configurationHash?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  understanding?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  runtimeContract?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  qualityReport?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  sourceSnapshot?: Record<string, unknown>;
}
