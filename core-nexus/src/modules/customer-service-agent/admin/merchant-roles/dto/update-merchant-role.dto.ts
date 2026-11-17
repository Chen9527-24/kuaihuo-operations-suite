import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CUSTOMER_SERVICE_ROLE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class UpdateCustomerServiceMerchantRoleDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prototypeId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  industryNodeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicIdentity?: string;

  @ApiPropertyOptional({ description: '客户可见的显式业务关系，例如：售后客服、技术支持、销售顾问。HVE 不自行猜测。' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  publicRelation?: string;

  @ApiPropertyOptional({ description: '角色级模型生成 Prompt。只描述该角色如何自然表达/参与，不应写业务事实、权限或输出协议。' })
  @IsOptional()
  @IsString()
  @Length(1, 12000)
  generationPrompt?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ROLE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ROLE_STATUSES)
  status?: string;
}
