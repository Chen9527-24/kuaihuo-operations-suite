import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_SERVICE_SIMULATION_RISK_LEVELS } from '../../../shared/constants/customer-service-role-module.constant';


export class CustomerServiceConversationMessageDto {
  @ApiProperty({ enum: ['CUSTOMER', 'ASSISTANT'] })
  @IsIn(['CUSTOMER', 'ASSISTANT'])
  role!: 'CUSTOMER' | 'ASSISTANT';

  @ApiProperty()
  @IsString()
  @Length(1, 4000)
  content!: string;
}

export class CompileCustomerServiceSimulationDto {
  @ApiProperty()
  @IsString()
  merchantRoleId!: string;

  @ApiPropertyOptional({ description: '店铺背景配置 ID；未传时可由账号背景自动带出' })
  @IsOptional()
  @IsString()
  storeProfileId?: string;

  @ApiPropertyOptional({ description: '账号背景/账号人设配置 ID' })
  @IsOptional()
  @IsString()
  accountProfileId?: string;

  @ApiProperty({ example: '物流怎么三天还没动？' })
  @IsString()
  @Length(1, 4000)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryNodeId?: string;


  @ApiPropertyOptional({ description: '持久化回复调优对话 ID；提供后将优先使用服务端保存的完整上下文' })
  @IsOptional()
  @IsString()
  tuningSessionId?: string;

  @ApiPropertyOptional({ description: '客户端本轮消息 ID，用于防止重复提交' })
  @IsOptional()
  @IsString()
  clientMessageId?: string;

  @ApiPropertyOptional({ description: '调优或真实会话的稳定会话标识，用于去重已识别意图样本' })
  @IsOptional()
  @IsString()
  recognitionSessionId?: string;

  @ApiPropertyOptional({ description: '服务端真实 canonical 对话 ID；仅真实渠道运行时使用，不由浏览器本地状态维护' })
  @IsOptional()
  @IsString()
  canonicalConversationId?: string;

  @ApiPropertyOptional({ description: 'canonical 对话所属机器人 ID；用于服务端运行时作用域校验' })
  @IsOptional()
  @IsString()
  canonicalRobotId?: string;

  @ApiPropertyOptional({ description: 'canonical 对话中当前客户消息的客户端消息 ID，用于解析权威 DialogueMessage 证据' })
  @IsOptional()
  @IsString()
  canonicalCustomerMessageClientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scenario?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_SIMULATION_RISK_LEVELS, default: 'LOW' })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_SIMULATION_RISK_LEVELS)
  riskLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceGoal?: string;


  @ApiPropertyOptional({ type: [CustomerServiceConversationMessageDto], description: '最近多轮对话，仅用于理解与调优，不会写入真实会话' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CustomerServiceConversationMessageDto)
  conversationHistory?: CustomerServiceConversationMessageDto[];

  @ApiPropertyOptional({ type: Object, description: '服务端维护的有界长对话状态；外部调用通常无需传入' })
  @IsOptional()
  @IsObject()
  conversationState?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '服务端会话状态修订号；用于并发写入保护' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stateRevision?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  customerState?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  assetIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: '仅用于模拟回归的策略草稿版本 ID；不会发布或修改正式生效版本。',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  strategyVersionIds?: string[];

  @ApiPropertyOptional({
    enum: ['HVE3_CANDIDATE', 'HVE_ACTIVE'],
    default: 'HVE_ACTIVE',
    description: '客户对话执行通道。正式渠道固定 HVE_ACTIVE；HVE3_CANDIDATE 仅用于 Simulation / Robot Test 隔离验收。',
  })
  @IsOptional()
  @IsIn(['HVE3_CANDIDATE', 'HVE_ACTIVE'])
  hveExecutionLane?: 'HVE3_CANDIDATE' | 'HVE_ACTIVE';

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object], description: '仅允许传入已经核验且允许用于客户回复的事实' })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  facts?: Record<string, unknown>[];
}
