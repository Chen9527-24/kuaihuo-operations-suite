import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InitializeCustomerServiceFoundationDto {
  @ApiPropertyOptional({ description: '平台管理员可指定租户；普通租户账号忽略该字段。' })
  @IsOptional()
  @IsString()
  tenantId?: string;
}
