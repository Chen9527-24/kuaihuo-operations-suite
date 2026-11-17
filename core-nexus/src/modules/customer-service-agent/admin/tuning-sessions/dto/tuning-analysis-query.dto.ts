import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export class CustomerServiceTuningAnalysisQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: '按客户最新消息或调优会话标题检索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: ['COMPILE', 'EXECUTE'] })
  @IsOptional()
  @IsIn(['COMPILE', 'EXECUTE'])
  runType?: 'COMPILE' | 'EXECUTE';
}
