import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CustomerServiceEffectObservationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ description: '需要观察的账号资料 ID' })
  @IsString()
  accountProfileId!: string;

  @ApiPropertyOptional({ default: 30, minimum: 7, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;

  @ApiPropertyOptional({ default: 7, minimum: 1, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  compareDays?: number;

  @ApiPropertyOptional({ description: '需要观察发布前后效果的策略版本 ID' })
  @IsOptional()
  @IsString()
  strategyVersionId?: string;

  @ApiPropertyOptional({ description: '需要观察当前 revision 命中效果的知识条目 ID' })
  @IsOptional()
  @IsString()
  knowledgeEntryId?: string;
}
