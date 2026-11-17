import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AcceptCustomerServiceTuningAnalysisDto {
  @ApiPropertyOptional({ description: '客户端看到的内容哈希；传入时用于防止接受过期候选' })
  @IsOptional()
  @IsString()
  expectedContentHash?: string;
}
