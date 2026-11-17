import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  CUSTOMER_LEAD_FOLLOW_UP_METHODS,
  CUSTOMER_LEAD_FOLLOW_UP_STATUSES,
  CUSTOMER_LEAD_FOLLOW_UP_VALUES,
  CUSTOMER_LEAD_SOURCES,
} from '../customer-leads.constants';

export class CreateCustomerLeadDto {
  @ApiProperty({ example: '杭州示例科技有限公司', description: '商机客户所属公司名称。' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  companyName!: string;

  @ApiPropertyOptional({ example: '张女士' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string | null;

  @ApiPropertyOptional({ example: '运营负责人 / 联合创始人', description: '关键联系人的职位或决策角色。' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactPosition?: string | null;

  @ApiPropertyOptional({ example: '13800000000 / 微信：example / zhang@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactInfo?: string | null;

  @ApiPropertyOptional({ example: 'INBOUND', enum: CUSTOMER_LEAD_SOURCES, description: '线索获取渠道。' })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_SOURCES)
  leadSource?: string;

  @ApiPropertyOptional({ example: '官网咨询表单 / 2026 夏季私域运营直播间', description: '来源的具体说明，便于复盘。' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  leadSourceDetail?: string | null;

  @ApiPropertyOptional({ example: '浙江省杭州市西湖区示例路 88 号' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string | null;

  @ApiPropertyOptional({ example: ['美妆护肤', '私域运营'], type: [String], description: '主营类目数组；PC 端由逗号分隔输入转换。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  primaryCategories?: string[];

  @ApiPropertyOptional({ example: '希望自动客服能够区分新客、老客和售后问题，并能人工无缝接管。' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requestedFeatures?: string | null;

  @ApiPropertyOptional({ example: '当前使用人工客服 + 某 SaaS 工具，售后分流能力不足；也在评估竞品。' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentSolution?: string | null;

  @ApiPropertyOptional({ example: '当前自动客服的拟人化程度和复杂售后场景覆盖尚未达到预期。' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notWonReason?: string | null;

  @ApiPropertyOptional({ example: 'PENDING_CONTACT', enum: CUSTOMER_LEAD_FOLLOW_UP_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_STATUSES)
  followUpStatus?: string;

  @ApiPropertyOptional({ example: 'PRODUCT_GAP', enum: CUSTOMER_LEAD_FOLLOW_UP_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_VALUES)
  followUpValue?: string;

  @ApiPropertyOptional({ example: '王小明', description: '当前阶段允许为空；暂以文本保存，后续可升级为系统账号关联。' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  followUpOwner?: string | null;

  @ApiPropertyOptional({ example: '2026-07-08T02:30:00.000Z', description: '首次实际跟进时间。填写后必须同时填写首次沟通结论，系统会自动创建第一条历史记录。' })
  @IsOptional()
  @IsDateString()
  firstFollowUpAt?: string | null;

  @ApiPropertyOptional({ example: 'WECHAT', enum: CUSTOMER_LEAD_FOLLOW_UP_METHODS, description: '首次实际沟通方式。' })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_METHODS)
  firstFollowUpMethod?: string | null;

  @ApiPropertyOptional({ example: '客户确认售后咨询分流是当前优先事项，愿意拿到演示环境后组织运营团队试用。', description: '首次实际沟通的内容与结论；与首次跟进时间一起保存为第一条历史。' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  firstFollowUpSummary?: string | null;

  @ApiPropertyOptional({ example: '2026-07-15T01:30:00.000Z', description: '当前待办的下次计划跟进时间；不是历史跟进时间，可为空。' })
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;

  @ApiPropertyOptional({ example: '发送演示环境并约下周三复盘。', description: '当前待办的下一步行动说明，可为空。' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nextFollowUpPlan?: string | null;

  @ApiPropertyOptional({ example: '其他补充信息' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remark?: string | null;
}

export class UpdateCustomerLeadDto {
  @ApiPropertyOptional({ example: '杭州示例科技有限公司' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  companyName?: string;

  @ApiPropertyOptional({ example: '张女士' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string | null;

  @ApiPropertyOptional({ example: '运营负责人 / 联合创始人' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactPosition?: string | null;

  @ApiPropertyOptional({ example: '13800000000 / 微信：example' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactInfo?: string | null;

  @ApiPropertyOptional({ example: 'INBOUND', enum: CUSTOMER_LEAD_SOURCES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_SOURCES)
  leadSource?: string;

  @ApiPropertyOptional({ example: '官网咨询表单 / 直播间' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  leadSourceDetail?: string | null;

  @ApiPropertyOptional({ example: '浙江省杭州市西湖区示例路 88 号' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string | null;

  @ApiPropertyOptional({ example: ['美妆护肤', '私域运营'], type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  primaryCategories?: string[];

  @ApiPropertyOptional({ example: '希望自动客服能够区分新客、老客和售后问题，并能人工无缝接管。' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requestedFeatures?: string | null;

  @ApiPropertyOptional({ example: '当前使用人工客服 + 某 SaaS 工具，也在评估竞品。' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentSolution?: string | null;

  @ApiPropertyOptional({ example: '当前自动客服的拟人化程度和复杂售后场景覆盖尚未达到预期。' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notWonReason?: string | null;

  @ApiPropertyOptional({ example: 'PENDING_CONTACT', enum: CUSTOMER_LEAD_FOLLOW_UP_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_STATUSES)
  followUpStatus?: string;

  @ApiPropertyOptional({ example: 'PRODUCT_GAP', enum: CUSTOMER_LEAD_FOLLOW_UP_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_VALUES)
  followUpValue?: string;

  @ApiPropertyOptional({ example: '王小明' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  followUpOwner?: string | null;

  @ApiPropertyOptional({ example: '2026-07-15T01:30:00.000Z', description: '当前待办的下次计划跟进时间；实际历史请使用“登记跟进”。' })
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;

  @ApiPropertyOptional({ example: '发送演示环境并约下周三复盘。', description: '当前待办的下一步行动说明。' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nextFollowUpPlan?: string | null;

  @ApiPropertyOptional({ example: '其他补充信息' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  remark?: string | null;
}
