import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CompileCustomerServiceSimulationDto } from './compile-simulation.dto';

export class ExecuteCustomerServiceSimulationDto extends CompileCustomerServiceSimulationDto {
  @ApiPropertyOptional({ default: true, description: '是否执行候选回复生成；仍不会发送客户消息' })
  @IsOptional()
  @IsBoolean()
  generateReply?: boolean;

  @ApiPropertyOptional({ deprecated: true, description: '历史兼容字段；Runtime 不再执行质量重写，此值被忽略' })
  @IsOptional()
  @IsBoolean()
  allowRewrite?: boolean;
}
