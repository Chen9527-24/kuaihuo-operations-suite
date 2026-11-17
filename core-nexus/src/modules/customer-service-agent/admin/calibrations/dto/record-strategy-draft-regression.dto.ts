import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class RecordCustomerServiceStrategyDraftRegressionDto {
  @ApiProperty({ enum: ['PASSED', 'FAILED'] })
  @IsIn(['PASSED', 'FAILED'])
  status!: 'PASSED' | 'FAILED';

  @ApiProperty()
  @IsString()
  strategyVersionId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalCases!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  passedCases!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  limitedCases!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  failedCases!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  failedCaseKeys?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
