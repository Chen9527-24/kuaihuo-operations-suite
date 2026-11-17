import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class RobotQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '自动回复' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'COMMENT_REPLY' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'RUNNING' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class RobotDeviceQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '前台运营电脑' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'ONLINE' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class RobotAuthQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '花生牛奶' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'AUTHORIZED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class RobotOptionsQueryDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;
}


export class InterceptCaptureQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: '想了解' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'FAILED', description: '意向分析状态：PENDING / RUNNING / SUCCEEDED / PARTIAL_FAILED / FAILED / SKIPPED。' })
  @IsOptional()
  @IsString()
  analysisStatus?: string;

  @ApiPropertyOptional({ example: 'A', description: '意向等级：S / A / B / C / D。' })
  @IsOptional()
  @IsString()
  intentLevel?: string;
}



export class InterceptCaptureViewPresetQueryDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class InterceptIntentPromptConfigQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '默认意向分析提示词' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsString()
  isDefault?: string;
}

export class PrivateMessageRobotQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '主动私信机器人名称 / 编号 / 账号' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'AUTHORIZED' })
  @IsOptional()
  @IsString()
  authStatus?: string;

  @ApiPropertyOptional({ example: 'RUNNING' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'PAUSED' })
  @IsOptional()
  @IsString()
  executionStatus?: string;
}

export class PrivateMessageTaskQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '高意向用户昵称 / 评论内容 / 作品名称 / 任务编号' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'robot_lpm_001' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'PENDING' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  intentLevel?: string;

  @ApiPropertyOptional({ example: 'LOW' })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional({ example: '2026-05-20T00:00:00+08:00' })
  @IsOptional()
  @IsDateString()
  plannedStartAt?: string;

  @ApiPropertyOptional({ example: '2026-05-20T23:59:59+08:00' })
  @IsOptional()
  @IsDateString()
  plannedEndAt?: string;

  @ApiPropertyOptional({ example: '2026-05-20T00:00:00+08:00' })
  @IsOptional()
  @IsDateString()
  createdStartAt?: string;

  @ApiPropertyOptional({ example: '2026-05-20T23:59:59+08:00' })
  @IsOptional()
  @IsDateString()
  createdEndAt?: string;
}


export class InterceptIntentAnalysisBatchQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'FAILED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'true', description: '仅查看通过“提取失败重析”生成的待重试批次。' })
  @IsOptional()
  failedRetryOnly?: string | boolean;
}
