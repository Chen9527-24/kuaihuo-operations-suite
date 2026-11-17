import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RunCustomerServiceDataGovernanceDto {
  @ApiProperty({ enum: ['DRY_RUN', 'ARCHIVE', 'COMPACT', 'PURGE', 'VERIFY'] })
  @IsIn(['DRY_RUN', 'ARCHIVE', 'COMPACT', 'PURGE', 'VERIFY'])
  mode!: 'DRY_RUN' | 'ARCHIVE' | 'COMPACT' | 'PURGE' | 'VERIFY';

  @ApiPropertyOptional({ minimum: 30, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  retentionDays?: number;

  @ApiPropertyOptional({ minimum: 10, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1000)
  batchSize?: number;

  @ApiPropertyOptional({ description: 'PURGE requires the exact value PURGE_COMPACTED_DATA.' })
  @IsOptional()
  @IsString()
  confirmation?: string;
}
