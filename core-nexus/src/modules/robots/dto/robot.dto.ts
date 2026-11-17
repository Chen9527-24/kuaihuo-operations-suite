import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, Length, IsInt, Min, Max, ValidateNested } from 'class-validator';

const ROBOT_TYPES = ['PRIVATE_MESSAGE', 'COMMENT_REPLY', 'INTERCEPT', 'LEAD_PRIVATE_MESSAGE'] as const;
const ROBOT_DEVICE_STATUSES = ['OFFLINE', 'ONLINE', 'BUSY', 'DISABLED'] as const;
const ROBOT_AUTH_STATUSES = ['UNBOUND', 'WAIT_QR', 'SCANNING', 'AUTHORIZED', 'AUTH_EXPIRED', 'REVOKED', 'AUTH_FAILED'] as const;
const ROBOT_STOP_REASONS = ['MANUAL', 'EXPIRED', 'AUTH_LOST', 'DEVICE_OFFLINE', 'PLATFORM_LIMIT', 'SYSTEM_ERROR'] as const;
const ROBOT_RUNTIME_STATUSES = ['DRAFT', 'READY', 'RUNNING', 'STOPPING', 'STOPPED', 'DISABLED', 'ERROR', 'EXPIRED'] as const;

export class CreateRobotDto {
  @ApiPropertyOptional({ example: 'tenant_id', description: '可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: '抖音评论区自动回复机器人' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: 'COMMENT_REPLY', enum: ROBOT_TYPES })
  @IsIn(ROBOT_TYPES)
  type!: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(2, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'auth_id' })
  @IsOptional()
  @IsString()
  authId?: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiPropertyOptional({
    example: {
      keywords: ['怎么投流', '多少钱'],
      replyTemplate: '您好，已私信您方案，麻烦留意一下。',
    },
    description: '机器人个性化配置，按类型存储 JSON。',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ example: '用于抖音主账号晚间自动回复' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateRobotDto {
  @ApiPropertyOptional({ example: '抖音评论区自动回复机器人' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'COMMENT_REPLY', enum: ROBOT_TYPES })
  @IsOptional()
  @IsIn(ROBOT_TYPES)
  type?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'auth_id' })
  @IsOptional()
  @IsString()
  authId?: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiPropertyOptional({
    example: {
      keywords: ['咨询', '报价'],
      replyTemplate: '收到啦，我这边马上安排同事联系您。',
    },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ example: '更新备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}


export class UpdateRobotRuntimeStatusDto {
  @ApiProperty({ example: 'RUNNING', enum: ROBOT_RUNTIME_STATUSES, description: '由 PC/GUI 端同步的机器人运行状态。只更新状态展示，不触发远程启动/停止动作。' })
  @IsIn(ROBOT_RUNTIME_STATUSES)
  status!: string;

  @ApiPropertyOptional({ example: 'MANUAL', enum: ROBOT_STOP_REASONS })
  @IsOptional()
  @IsIn(ROBOT_STOP_REASONS)
  stopReason?: string;

  @ApiPropertyOptional({ example: '页面授权失败或自动化异常' })
  @IsOptional()
  @IsString()
  lastError?: string;
}
export class SyncRobotAuthStatusDto {
  @ApiProperty({ example: 'AUTHORIZED', enum: ROBOT_AUTH_STATUSES, description: 'GUI 按机器人同步扫码授权状态；机器人未绑定授权时后端会自动创建并绑定。' })
  @IsIn(ROBOT_AUTH_STATUSES)
  status!: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'douyin_uid_123' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountUid?: string;

  @ApiPropertyOptional({ example: '花生牛奶' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  accountAvatarUrl?: string;

  @ApiPropertyOptional({ example: 'encrypted-session-string' })
  @IsOptional()
  @IsString()
  sessionData?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  sessionExpiresAt?: string;

  @ApiPropertyOptional({ example: '2026-04-24T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  authorizedAt?: string;


  @ApiPropertyOptional({ example: 'GUI_PAGE_STATE', description: '状态来源，例如 GUI_PAGE_STATE / GUI_COOKIE_SIGNAL / MANUAL_LOGOUT / DEVICE_AGENT。' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'module_ready', description: '状态变更原因，例如 login_wait / module_ready / user_logout / cookie_confirmed。' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: true, description: '状态降级或撤销时是否清理可执行 session 数据。' })
  @IsOptional()
  @IsBoolean()
  clearSession?: boolean;

  @ApiPropertyOptional({ example: '由 UCP 桌面端扫码授权后自动回写。' })
  @IsOptional()
  @IsString()
  remark?: string;
}


export class InterceptCaptureItemDto {
  @ApiPropertyOptional({ example: '20260515_150001' })
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'my_douyin' })
  @IsOptional()
  @IsString()
  accountAlias?: string;

  @ApiPropertyOptional({ example: 'homepage', description: 'homepage / content / mixed 等来源类型。' })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ example: 'https://www.douyin.com/user/xxx' })
  @IsOptional()
  @IsString()
  targetUrl?: string;

  @ApiPropertyOptional({ example: 'https://www.douyin.com/user/xxx' })
  @IsOptional()
  @IsString()
  homepageUrl?: string;

  @ApiPropertyOptional({ example: 'https://www.douyin.com/video/123' })
  @IsOptional()
  @IsString()
  contentUrl?: string;

  @ApiPropertyOptional({ example: '7325123456789' })
  @IsOptional()
  @IsString()
  platformContentId?: string;

  @ApiPropertyOptional({ example: '作品标题或文案' })
  @IsOptional()
  @IsString()
  contentTitle?: string;

  @ApiPropertyOptional({ example: '2026-05-15T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  publishTimeIso?: string;

  @ApiPropertyOptional({ example: 'SUCCESS', description: 'Speech recognition status: SUCCESS / FAILED.' })
  @IsOptional()
  @IsString()
  speechStatus?: string;

  @ApiPropertyOptional({ example: 'This is the recognized spoken script.' })
  @IsOptional()
  @IsString()
  speechTranscript?: string;

  @ApiPropertyOptional({ example: 'ffmpeg is missing' })
  @IsOptional()
  @IsString()
  speechError?: string;

  @ApiPropertyOptional({ example: 'Video page description.' })
  @IsOptional()
  @IsString()
  videoDescription?: string;

  @ApiPropertyOptional({ type: [String], example: ['factory', 'quote'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videoTags?: string[];

  @ApiPropertyOptional({ example: 'SHOULD_RUN', description: 'SHOULD_RUN / SKIPPED / FAILED_CONTINUE.' })
  @IsOptional()
  @IsString()
  workDecisionStatus?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  workDecisionShouldRun?: boolean;

  @ApiPropertyOptional({ example: 'Workflow allowed comment capture.' })
  @IsOptional()
  @IsString()
  workDecisionReason?: string;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID' })
  @IsOptional()
  @IsString()
  workDecisionWorkflowId?: string;

  @ApiPropertyOptional({ example: 'trace_id', description: '作品前置判定对应的权威追踪 ID。' })
  @IsOptional()
  @IsString()
  workDecisionTraceId?: string;

  @ApiPropertyOptional({ example: 'DEEPSEEK' })
  @IsOptional()
  @IsString()
  workDecisionProvider?: string;

  @ApiPropertyOptional({ example: 'deepseek-chat' })
  @IsOptional()
  @IsString()
  workDecisionModel?: string;

  @ApiPropertyOptional({ example: 'sha256_hash' })
  @IsOptional()
  @IsString()
  workDecisionConfigurationHash?: string;

  @ApiPropertyOptional({ example: 'comment_123' })
  @IsOptional()
  @IsString()
  commentId?: string;

  @ApiPropertyOptional({ example: 'parent_comment_123' })
  @IsOptional()
  @IsString()
  parentCommentId?: string;

  @ApiPropertyOptional({ example: 'user_123' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: '小王' })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({ example: '想了解一下价格' })
  @IsOptional()
  @IsString()
  commentText?: string;

  @ApiPropertyOptional({ example: '2026-05-15T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  commentTimeIso?: string;

  @ApiPropertyOptional({ example: '安徽' })
  @IsOptional()
  @IsString()
  visibleRegion?: string;

  @ApiPropertyOptional({ description: '客户端原始记录快照。' })
  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}

export class InterceptCaptureViewPresetColumnDto {
  @ApiProperty({ example: 'contentTitle' })
  @IsString()
  @Length(1, 64)
  key!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  visible!: boolean;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(99)
  order!: number;
}

export class CreateInterceptCaptureViewPresetDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: '线索处理' })
  @IsString()
  @Length(1, 64)
  name!: string;

  @ApiProperty({ type: [InterceptCaptureViewPresetColumnDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterceptCaptureViewPresetColumnDto)
  columns!: InterceptCaptureViewPresetColumnDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateInterceptCaptureViewPresetDto {
  @ApiPropertyOptional({ example: '线索处理' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional({ type: [InterceptCaptureViewPresetColumnDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterceptCaptureViewPresetColumnDto)
  columns?: InterceptCaptureViewPresetColumnDto[];
}

export class CreateInterceptCaptureBatchDto {
  @ApiPropertyOptional({ example: '20260515_150001' })
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional({ type: [InterceptCaptureItemDto], description: '截流机器人本次捕获到的数据，建议按评论粒度上报。' })
  @IsOptional()
  @IsArray()
  items?: InterceptCaptureItemDto[];
}


export class UpsertInterceptIntentPromptConfigDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: '默认评论意向分析提示词' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ example: '截流评论意向分析工作流默认配置。' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID' })
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional({ example: 30, description: '每次请求扣子的评论条数，最大 20。' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  batchSize?: number;

  @ApiPropertyOptional({ example: '我们提供抖音竞品截流工具...' })
  @IsOptional()
  @IsString()
  biz?: string;

  @ApiPropertyOptional({ example: '有抖音获客需求的商家、私域运营团队...' })
  @IsOptional()
  @IsString()
  cust?: string;

  @ApiPropertyOptional({ example: '竞品账号' })
  @IsOptional()
  @IsString()
  acctType?: string;

  @ApiPropertyOptional({ example: '该账号主要发布抖音获客、评论截流相关内容...' })
  @IsOptional()
  @IsString()
  acctPos?: string;

  @ApiPropertyOptional({ example: '主动、自然、像陌生人冷启动私信...' })
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({ example: '监听指定账号,采集作品评论,识别潜在线索' })
  @IsOptional()
  @IsString()
  sellPts?: string;

  @ApiPropertyOptional({ example: '不能说看到你提到价格和试用,不能一上来报价' })
  @IsOptional()
  @IsString()
  banRules?: string;

  @ApiPropertyOptional({ example: '纯围观用户、玩梗用户、无业务需求用户' })
  @IsOptional()
  @IsString()
  nonCust?: string;

  @ApiPropertyOptional({ example: '这是主动私信触达场景。S/A 级优先引导看真实线索样例。' })
  @IsOptional()
  @IsString()
  dmRule?: string;

  @ApiPropertyOptional({ example: '工具方案切入,样例效果切入,问题诊断切入' })
  @IsOptional()
  @IsString()
  entryRules?: string;

  @ApiPropertyOptional({ example: '如何通过竞品评论区找到精准客户' })
  @IsOptional()
  @IsString()
  videoTitle?: string;

  @ApiPropertyOptional({ example: 'douyin' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: '老粥工业降温', description: '四节点链路：客户名称，会同步写入 extraParams。' })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional({ example: '工业车间降温设备', description: '四节点链路：主营业务，会同步写入 extraParams。' })
  @IsOptional()
  @IsString()
  mainBusiness?: string;

  @ApiPropertyOptional({ example: '蒸发冷省电空调,厂房降温方案', description: '四节点链路：主营产品，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  mainProducts?: string;

  @ApiPropertyOptional({ example: '夏季高温车间降温,大面积厂房降温', description: '四节点链路：目标场景，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  targetScenarios?: string;

  @ApiPropertyOptional({ example: '车间闷热,电费高', description: '四节点链路：客户痛点，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  customerPainPoints?: string;

  @ApiPropertyOptional({ example: '车间降温,厂房降温', description: '四节点链路：正向关键词，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  positiveKeywords?: string;

  @ApiPropertyOptional({ example: '家用空调,蛋糕,招聘', description: '四节点链路：排除关键词，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  negativeKeywords?: string;

  @ApiPropertyOptional({ example: '多少钱,报价,怎么联系', description: '四节点链路：高意向关键词，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  highIntentKeywords?: string;

  @ApiPropertyOptional({ example: '同行打卡,互粉,招聘,求职', description: '四节点链路：非线索信号，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  nonLeadSignals?: string;

  @ApiPropertyOptional({ example: '报价单,车间实拍视频,配置方案', description: '四节点链路：允许提供的资料/权益，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  allowedOffers?: string;

  @ApiPropertyOptional({ example: '源头工厂技术员', description: '四节点链路：主动触达时的人设。' })
  @IsOptional()
  @IsString()
  accountPersona?: string;

  @ApiPropertyOptional({ example: '绝对最低价,保证效果,百分百有效', description: '四节点链路：禁止承诺，逗号分隔或 JSON 数组。' })
  @IsOptional()
  @IsString()
  forbiddenClaims?: string;

  @ApiPropertyOptional({ example: '{"allow_wechat":false,"default_cta":"先在私信里发参考资料"}', description: '四节点链路：CTA 策略，可填 JSON 字符串或自然语言。' })
  @IsOptional()
  @IsString()
  ctaPolicy?: string;

  @ApiPropertyOptional({ example: '四节点严格链路', description: '提示词链路模式说明，会传给 Coze 作为 workflow_mode。' })
  @IsOptional()
  @IsString()
  workflowMode?: string;

  @ApiPropertyOptional({ example: '视频文案内容', description: '节点 0 使用的视频文案上下文。' })
  @IsOptional()
  @IsString()
  videoDesc?: string;

  @ApiPropertyOptional({ description: '节点 0 视频业务相关性分析补充规则。' })
  @IsOptional()
  @IsString()
  videoRelevanceRules?: string;

  @ApiPropertyOptional({ description: '节点 1 评论线索意向精算补充规则。' })
  @IsOptional()
  @IsString()
  commentScoringRules?: string;

  @ApiPropertyOptional({ description: '节点 2 风控路由与动作拦截补充规则。' })
  @IsOptional()
  @IsString()
  riskRoutingRules?: string;

  @ApiPropertyOptional({ description: '节点 3 按需话术生成补充规则。' })
  @IsOptional()
  @IsString()
  scriptGenerationRules?: string;

  @ApiPropertyOptional({ description: '完整 B 端业务基准档案，可填 JSON 字符串或结构化对象。' })
  @IsOptional()
  businessProfile?: unknown;

  @ApiPropertyOptional({ example: { customKey: 'customValue' } })
  @IsOptional()
  @IsObject()
  extraParams?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, description: '是否设为当前租户默认配置。' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateInterceptIntentPromptConfigDto {
  @ApiPropertyOptional({ example: '默认评论意向分析提示词' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  batchSize?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() biz?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cust?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() acctType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() acctPos?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sellPts?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() banRules?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nonCust?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dmRule?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entryRules?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() platform?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mainBusiness?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mainProducts?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetScenarios?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerPainPoints?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positiveKeywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() negativeKeywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() highIntentKeywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nonLeadSignals?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() allowedOffers?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountPersona?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() forbiddenClaims?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaPolicy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() workflowMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoDesc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoRelevanceRules?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() commentScoringRules?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() riskRoutingRules?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scriptGenerationRules?: string;
  @ApiPropertyOptional() @IsOptional() businessProfile?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extraParams?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}



export class InterceptIntentTestCommentDto {
  @ApiPropertyOptional({ example: 'test_001' })
  @IsOptional()
  @IsString()
  cid?: string;

  @ApiProperty({ example: '这个工具怎么试用？' })
  @IsString()
  text!: string;
}

export class TestInterceptIntentPromptConfigDto extends UpdateInterceptIntentPromptConfigDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'prompt_config_id', description: '可选；传入后以已保存配置为基础，再用请求体字段覆盖。' })
  @IsOptional()
  @IsString()
  promptConfigId?: string;

  @ApiPropertyOptional({ example: 'robot_id', description: '可选；用于读取机器人平台与配置作为辅助上下文，不会产生持久化分析记录。' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ type: [InterceptIntentTestCommentDto], description: '用于测试的评论列表，后端只调用 Coze，不会写入捕获数据。' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InterceptIntentTestCommentDto)
  comments?: InterceptIntentTestCommentDto[];

  @ApiPropertyOptional({ description: '兼容前端 textarea 直传：每行一条测试评论。' })
  @IsOptional()
  @IsString()
  commentsText?: string;

  @ApiPropertyOptional({ description: '兼容别名：每行一条测试评论。' })
  @IsOptional()
  @IsString()
  testComments?: string;
}



export class TestInterceptWorkDecisionDto {
  @ApiPropertyOptional({ example: 'YOUR_COZE_ID', description: '作品是否继续执行的 Coze 工作流 ID；不传时使用后端默认配置。' })
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional({ example: 'prompt_config_id', description: '可选；传入后后端会用该截流提示词配置生成 bp/acct 的默认值，请求体同名字段优先。' })
  @IsOptional()
  @IsString()
  promptConfigId?: string;

  @ApiPropertyOptional({ description: '业务范围配置，对应 Coze 开始节点 bp。' })
  @IsOptional()
  @IsObject()
  bp?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '监听账号信息，对应 Coze 开始节点 acct。' })
  @IsOptional()
  @IsObject()
  acct?: Record<string, unknown>;

  @ApiProperty({ description: '作品信息，对应 Coze 开始节点 video；script 为口播文案。' })
  @IsObject()
  video!: Record<string, unknown>;
}

export class RunInterceptWorkDecisionDto extends TestInterceptWorkDecisionDto {}

export class DeleteInterceptCaptureBatchDto {
  @ApiProperty({ type: [String], example: ['capture_id_1', 'capture_id_2'], description: '需要删除的截流捕获记录 ID 列表。' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class RetryInterceptIntentAnalysisBatchDto {
  @ApiPropertyOptional({ type: [Number], example: [1, 3], description: '可选；只重试指定批次序号。不传时重试失败或部分失败的子批次。' })
  @IsOptional()
  @IsArray()
  chunkIndexes?: number[];
}


export class RetryFailedInterceptCaptureAnalysisDto {
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

  @ApiPropertyOptional({ example: '评论内容 / 昵称 / 作品ID' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  intentLevel?: string;

  @ApiPropertyOptional({ example: 300, description: '最多提取多少条失败数据生成待重试批次。' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class MessageOverrideDto {
  @ApiProperty({ example: 'capture_id_1' })
  @IsString()
  captureId!: string;

  @ApiProperty({ example: '看到你提到评论筛选，我们这边可以先给你看一组真实线索样例。' })
  @IsString()
  messageFinal!: string;
}

export class DeletePrivateMessageTaskBatchDto {
  @ApiProperty({ type: [String], example: ['task_id_1', 'task_id_2'], description: '需要删除的主动私信任务 ID 列表。' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class UpdatePrivateMessageTaskMessageDto {
  @ApiProperty({ example: '看到你提到评论筛选，我们这边可以先给你看一组真实线索样例。' })
  @IsString()
  @Length(1, 1000)
  messageFinal!: string;
}


const PRIVATE_MESSAGE_EXECUTION_STATUSES = ['IDLE', 'CLAIMING', 'SENDING', 'SLEEPING', 'PAUSED', 'ERROR'] as const;
const PRIVATE_MESSAGE_TASK_STATUSES = ['PENDING', 'WAITING_WINDOW', 'CLAIMED', 'RUNNING', 'SENT', 'FAILED', 'SKIPPED', 'BLOCKED', 'CANCELED', 'EXPIRED'] as const;

export class PrivateMessageRobotConfigDto {
  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minSendIntervalSeconds?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSendIntervalSeconds?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  claimBatchSize?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  dailySendLimit?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  hourlySendLimit?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  userTouchIntervalDays?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxConsecutiveFailures?: number;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  workStartTime?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  workEndTime?: string;

  @ApiPropertyOptional({ example: '00:00' })
  @IsOptional()
  @IsString()
  sleepStartTime?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  sleepEndTime?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @ApiPropertyOptional({ example: '您好，看到您刚才的评论，想和您进一步沟通一下，方便的话可以回复我了解详情。' })
  @IsOptional()
  @IsString()
  defaultMessageTemplate?: string;
}

export class CreatePrivateMessageRobotDto extends PrivateMessageRobotConfigDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: '抖音主动私信机器人 A' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(2, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'auth_id', description: '绑定授权账号 ID；兼容 boundAccountId。' })
  @IsOptional()
  @IsString()
  authId?: string;

  @ApiPropertyOptional({ example: 'auth_id' })
  @IsOptional()
  @IsString()
  boundAccountId?: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiPropertyOptional({ example: '用于截流高意向评论用户的主动私信任务执行' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdatePrivateMessageRobotDto extends PrivateMessageRobotConfigDto {
  @ApiPropertyOptional({ example: '抖音主动私信机器人 A' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'auth_id' })
  @IsOptional()
  @IsString()
  authId?: string;

  @ApiPropertyOptional({ example: 'auth_id' })
  @IsOptional()
  @IsString()
  boundAccountId?: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiPropertyOptional({ example: '更新备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreatePrivateMessageTasksDto {
  @ApiProperty({ type: [String], example: ['capture_001', 'capture_002'] })
  @IsArray()
  @IsString({ each: true })
  captureIds!: string[];

  @ApiProperty({ type: [String], example: ['robot_lpm_001'] })
  @IsArray()
  @IsString({ each: true })
  robotIds!: string[];

  @ApiPropertyOptional({ type: [MessageOverrideDto], description: '按捕获数据覆盖主动私信内容。PC 创建任务时可人工编辑文案后传入。' })
  @IsOptional()
  @IsArray()
  messageOverrides?: MessageOverrideDto[];

  @ApiProperty({ example: '2026-05-20T14:00:00+08:00' })
  @IsDateString()
  plannedStartAt!: string;

  @ApiProperty({ example: '2026-05-20T18:00:00+08:00' })
  @IsDateString()
  plannedEndAt!: string;

  @ApiPropertyOptional({ example: 'MANUAL_CREATE' })
  @IsOptional()
  @IsString()
  sendMode?: string;

  @ApiPropertyOptional({ example: '运营手动勾选创建' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class ClaimPrivateMessageTaskDto {
  @ApiProperty({ example: 'robot_lpm_001' })
  @IsString()
  robotId!: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class ReportPrivateMessageTaskDto {
  @ApiProperty({ example: 'robot_lpm_001' })
  @IsString()
  robotId!: string;

  @ApiProperty({ example: 'task_001' })
  @IsString()
  taskId!: string;

  @ApiProperty({ example: 'SENT', enum: PRIVATE_MESSAGE_TASK_STATUSES })
  @IsIn(PRIVATE_MESSAGE_TASK_STATUSES)
  status!: string;

  @ApiPropertyOptional({ example: '用户主页无法打开或私信入口不可用' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ example: 'https://example.com/screenshot.png' })
  @IsOptional()
  @IsString()
  screenshotUrl?: string;

  @ApiPropertyOptional({ description: '客户端原始执行结果。' })
  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}


export class StopRobotDto {
  @ApiPropertyOptional({ example: 'MANUAL', enum: ROBOT_STOP_REASONS })
  @IsOptional()
  @IsIn(ROBOT_STOP_REASONS)
  stopReason?: string;
}

export class CreateRobotDeviceDto {
  @ApiPropertyOptional({ example: 'tenant_id', description: '可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: '前台运营电脑-01' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'GUI-DOUYIN-001', description: '设备唯一编码；不传时后端自动生成。' })
  @IsOptional()
  @IsString()
  @Length(4, 64)
  deviceCode?: string;

  @ApiPropertyOptional({ example: 'ONLINE', enum: ROBOT_DEVICE_STATUSES })
  @IsOptional()
  @IsIn(ROBOT_DEVICE_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  clientVersion?: string;

  @ApiPropertyOptional({ example: 'Windows 11' })
  @IsOptional()
  @IsString()
  osName?: string;

  @ApiPropertyOptional({ example: '办公室主机' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateRobotDeviceDto {
  @ApiPropertyOptional({ example: '前台运营电脑-01' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'ONLINE', enum: ROBOT_DEVICE_STATUSES })
  @IsOptional()
  @IsIn(ROBOT_DEVICE_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  clientVersion?: string;

  @ApiPropertyOptional({ example: 'Windows 11' })
  @IsOptional()
  @IsString()
  osName?: string;

  @ApiPropertyOptional({ example: '办公室主机' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateRobotDeviceStatusDto {
  @ApiProperty({ example: 'ONLINE', enum: ROBOT_DEVICE_STATUSES })
  @IsIn(ROBOT_DEVICE_STATUSES)
  status!: string;
}

export class RobotDeviceHeartbeatDto {
  @ApiPropertyOptional({ example: 'ONLINE', enum: ROBOT_DEVICE_STATUSES })
  @IsOptional()
  @IsIn(ROBOT_DEVICE_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  clientVersion?: string;

  @ApiPropertyOptional({ example: 'Windows 11' })
  @IsOptional()
  @IsString()
  osName?: string;

  @ApiPropertyOptional({ example: '127.0.0.1' })
  @IsOptional()
  @IsString()
  ip?: string;
}

export class CreateRobotAuthDto {
  @ApiPropertyOptional({ example: 'tenant_id', description: '可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(2, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'QR_SESSION' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  authType?: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'douyin_uid_123' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountUid?: string;

  @ApiPropertyOptional({ example: '花生牛奶' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  accountAvatarUrl?: string;

  @ApiPropertyOptional({ example: 'AUTHORIZED', enum: ROBOT_AUTH_STATUSES })
  @IsOptional()
  @IsIn(ROBOT_AUTH_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: 'encrypted-session-string', description: '建议由 GUI 加密后上传。' })
  @IsOptional()
  @IsString()
  sessionData?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  sessionExpiresAt?: string;

  @ApiPropertyOptional({ example: '2026-04-24T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  authorizedAt?: string;

  @ApiPropertyOptional({ example: '抖音主号扫码授权' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateRobotAuthDto {
  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 'QR_SESSION' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  authType?: string;

  @ApiPropertyOptional({ example: 'device_id' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'douyin_uid_123' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountUid?: string;

  @ApiPropertyOptional({ example: '花生牛奶' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  accountAvatarUrl?: string;

  @ApiPropertyOptional({ example: 'AUTHORIZED', enum: ROBOT_AUTH_STATUSES })
  @IsOptional()
  @IsIn(ROBOT_AUTH_STATUSES)
  status?: string;

  @ApiPropertyOptional({ example: 'encrypted-session-string' })
  @IsOptional()
  @IsString()
  sessionData?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  sessionExpiresAt?: string;

  @ApiPropertyOptional({ example: '2026-04-24T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  authorizedAt?: string;

  @ApiPropertyOptional({ example: '重新授权后更新' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateRobotAuthStatusDto {
  @ApiProperty({ example: 'AUTHORIZED', enum: ROBOT_AUTH_STATUSES })
  @IsIn(ROBOT_AUTH_STATUSES)
  status!: string;
}

export class CreateRobotPairSessionDto {
  @ApiPropertyOptional({ example: 'tenant_id', description: '可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'DOUYIN' })
  @IsOptional()
  @IsString()
  @Length(2, 32)
  platform?: string;

  @ApiPropertyOptional({ example: 600, description: '会话有效期，默认 10 分钟。' })
  @IsOptional()
  ttlSeconds?: number;
}

export class ConsumeRobotPairSessionDto {
  @ApiProperty({ example: 'AB12CD' })
  @IsString()
  @Length(4, 16)
  pairCode!: string;

  @ApiProperty({ example: 'GUI-DOUYIN-001' })
  @IsString()
  @Length(4, 64)
  deviceCode!: string;

  @ApiProperty({ example: 'device_secret' })
  @IsString()
  deviceSecret!: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  clientVersion?: string;

  @ApiPropertyOptional({ example: 'Windows 11' })
  @IsOptional()
  @IsString()
  osName?: string;

  @ApiPropertyOptional({ example: '127.0.0.1' })
  @IsOptional()
  @IsString()
  ip?: string;
}

export class CreateRobotAuthSessionDto {
  @ApiPropertyOptional({ example: 'tenant_id', description: '可选；不传时优先使用 `X-Tenant-Id` 请求头中的当前租户。' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'auth_id' })
  @IsString()
  authId!: string;

  @ApiProperty({ example: 'device_id' })
  @IsString()
  deviceId!: string;

  @ApiPropertyOptional({ example: 600, description: '授权会话有效期，默认 10 分钟。' })
  @IsOptional()
  ttlSeconds?: number;
}

export class ReportRobotAuthQrDto {
  @ApiProperty({ example: 'auth_session_id' })
  @IsString()
  sessionId!: string;

  @ApiProperty({ example: 'GUI-DOUYIN-001' })
  @IsString()
  @Length(4, 64)
  deviceCode!: string;

  @ApiProperty({ example: 'device_secret' })
  @IsString()
  deviceSecret!: string;

  @ApiPropertyOptional({ example: 'https://example.com/qr.png' })
  @IsOptional()
  @IsString()
  qrCodeUrl?: string;

  @ApiPropertyOptional({ example: 'qr_raw_content' })
  @IsOptional()
  @IsString()
  qrCodeContent?: string;
}

export class CompleteRobotAuthSessionDto {
  @ApiProperty({ example: 'auth_session_id' })
  @IsString()
  sessionId!: string;

  @ApiProperty({ example: 'GUI-DOUYIN-001' })
  @IsString()
  @Length(4, 64)
  deviceCode!: string;

  @ApiProperty({ example: 'device_secret' })
  @IsString()
  deviceSecret!: string;

  @ApiProperty({ example: 'douyin_uid_123' })
  @IsString()
  @Length(1, 100)
  accountUid!: string;

  @ApiPropertyOptional({ example: '花生牛奶' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  @IsOptional()
  @IsString()
  accountAvatarUrl?: string;

  @ApiPropertyOptional({ example: 'encrypted-session-string' })
  @IsOptional()
  @IsString()
  sessionData?: string;

  @ApiPropertyOptional({ example: '2026-05-01T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  sessionExpiresAt?: string;
}
