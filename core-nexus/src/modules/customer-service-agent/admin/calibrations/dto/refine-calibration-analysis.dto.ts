import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefineCustomerServiceCalibrationAnalysisDto {
  @ApiPropertyOptional({
    description: '管理员对上一版校准结果的继续调整意见；为空时仍会基于上一版诊断、指令和建议回复继续优化。',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  refinementInstruction?: string;
}
