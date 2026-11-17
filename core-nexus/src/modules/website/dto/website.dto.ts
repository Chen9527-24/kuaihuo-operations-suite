import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateWebsiteDraftDto {
  @ApiProperty({ description: '固定布局下的官网内容配置。仅保存为草稿，不会直接影响公开站点。' })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '当前草稿版本，用于阻止多人编辑时静默覆盖。', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedRevision?: number;
}

export class PublishWebsiteDraftDto {
  @ApiProperty({ description: '要发布的草稿版本。版本已变化时必须重新加载确认。', example: 3 })
  @IsInt()
  @Min(0)
  expectedDraftRevision!: number;
}

export class RestorePublishedWebsiteDto {
  @ApiProperty({ description: '当前草稿版本，用于阻止恢复时覆盖其他人的新编辑。', example: 3 })
  @IsInt()
  @Min(0)
  expectedDraftRevision!: number;
}

export class SubmitWebsiteInquiryDto {
  @ApiProperty({ description: '客户端为本次提交生成的 UUID，用于防止双击或网络重试产生重复线索。' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ example: '杭州示例科技有限公司' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  companyName!: string;

  @ApiPropertyOptional({ example: '张女士' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string;

  @ApiProperty({ example: '微信 example / 13800000000 / demo@example.com' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  contactInfo!: string;

  @ApiProperty({ example: '车间降温方案，客户主要是制造业工厂负责人。' })
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  businessOverview!: string;

  @ApiPropertyOptional({ example: '抖音、视频号，目前由销售兼任运营。' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  operatingAccounts?: string;

  @ApiProperty({ example: '找不到潜在线索' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  challenge!: string;

  @ApiProperty({ description: '必须明确同意按照隐私政策处理本次联系信息。', example: true })
  @IsBoolean()
  @Equals(true)
  privacyAccepted!: boolean;

  @ApiPropertyOptional({ description: '打开表单的时间，用于辅助识别瞬时机器提交。' })
  @IsOptional()
  @IsDateString()
  formStartedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  referrer?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmMedium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmCampaign?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmTerm?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmContent?: string;

  /** 蜜罐字段；正常页面对真人隐藏。非空时服务端静默接受但不创建线索。 */
  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyWebsite?: string;
}
