import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES } from '../../../shared/calibration/customer-service-calibration-profile.util';

export class ApplyCustomerServiceCalibrationRecordDto {
  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES, description: '机器人测试/机器人回复来源默认 ROBOT_CONTEXT；仅账号身份来源默认 ACCOUNT_CONTEXT；无精确账号来源时默认 ROLE_CONTEXT' })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES)
  scopeType?: string;



  @ApiPropertyOptional({ description: '应用指定校准轮次；1 表示第 1 轮，省略时应用当前最新轮次' })
  @IsOptional()
  @IsInt()
  @Min(1)
  analysisIteration?: number;

  @ApiPropertyOptional({ description: '机器人/账号精确校准扩大到角色级共享范围时必须显式确认', default: false })
  @IsOptional()
  @IsBoolean()
  confirmExpandedScope?: boolean;
}
