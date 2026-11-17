import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { CUSTOMER_SERVICE_ROLE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class CreateCustomerServiceMerchantRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'xiaoman' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  code!: string;

  @ApiProperty({ example: '小满' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty()
  @IsString()
  prototypeId!: string;

  @ApiPropertyOptional()
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
