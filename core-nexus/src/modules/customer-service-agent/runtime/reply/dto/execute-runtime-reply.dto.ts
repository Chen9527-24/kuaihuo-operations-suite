import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { ExecuteCustomerServiceSimulationDto } from '../../simulation/dto/execute-simulation.dto';

export class ExecuteCustomerServiceRuntimeReplyDto extends ExecuteCustomerServiceSimulationDto {
  @ApiProperty({ description: '同一客户消息的稳定幂等键；重复请求返回同一最终投递结果' })
  @IsString()
  @Length(1, 160)
  idempotencyKey!: string;

  @ApiPropertyOptional({ default: false, description: '是否返回受权限保护的调试摘要' })
  @IsOptional()
  @IsBoolean()
  includeDiagnostics?: boolean;
}
