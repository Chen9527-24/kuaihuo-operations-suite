import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const AUTO_REPLY_MODULES = ['comment', 'dm'] as const;
export const COMMENT_REPLY_MODES = ['ALL_UNREPLIED', 'PUBLISHER_REPLY_THREAD_ONLY'] as const;
export const REPLY_STATUSES = ['not_required', 'pending', 'generated', 'sent_unconfirmed', 'sent', 'failed', 'manual'] as const;
export const INTENT_LEVELS = ['none', 'low', 'medium', 'high'] as const;
export const COMMENT_MATCH_TYPES = ['EXACT', 'CONTAINS', 'FUZZY'] as const;
export const AUTO_REPLY_WORKFLOW_MODES = ['DEFAULT', 'STRUCTURED', 'PLAIN_CHAT'] as const;
export const AUTO_REPLY_AI_PROVIDERS = ['COZE', 'DEEPSEEK'] as const;

export class AutoReplyPromptConfigQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'comment', enum: AUTO_REPLY_MODULES })
  @IsOptional()
  @IsIn(AUTO_REPLY_MODULES)
  module?: string;

  @ApiPropertyOptional({ example: '评论区提示词' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpsertAutoReplyPromptConfigDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'comment', enum: AUTO_REPLY_MODULES })
  @IsIn(AUTO_REPLY_MODULES)
  module!: string;

  @ApiProperty({ example: '抖音评论区默认提示词' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ example: '评论自动回复工作流使用的默认提示词配置。' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '评论回复要像真实评论区里懂行的人随口接一句。' })
  @IsOptional()
  @IsString()
  customSystemPrompt?: string;

  @ApiPropertyOptional({ example: '回复要短，自然，像真人评论区回复。' })
  @IsOptional()
  @IsString()
  customUserPrompt?: string;

  @ApiPropertyOptional({ example: '亲,您好,感谢咨询' })
  @IsOptional()
  @IsString()
  forbiddenWords?: string;

  @ApiPropertyOptional({ example: '账号阶段,行业,目标' })
  @IsOptional()
  @IsString()
  requiredWords?: string;

  @ApiPropertyOptional({ example: '自然、简短、像真实评论区互动' })
  @IsOptional()
  @IsString()
  replyStyle?: string;

  @ApiPropertyOptional({ example: '抖音评论区' })
  @IsOptional()
  @IsString()
  platformLabel?: string;

  @ApiPropertyOptional({ example: '一个懂内容运营和账号增长的实战型顾问' })
  @IsOptional()
  @IsString()
  accountPositioning?: string;

  @ApiPropertyOptional({ example: '主要提供账号定位、内容方向梳理、短视频账号优化和私信转化建议。' })
  @IsOptional()
  @IsString()
  businessProfile?: string;

  @ApiPropertyOptional({ example: '提升评论区互动质量' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: '评论区回复优先自然和轻松，不主动索要联系方式。' })
  @IsOptional()
  @IsString()
  policy?: string;

  @ApiPropertyOptional({ example: '不能承诺确定结果，不能夸大效果。' })
  @IsOptional()
  @IsString()
  safetyPolicy?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  replyLength?: number;

  @ApiPropertyOptional({ example: 3, description: '仅私信对话流使用。' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxMsgCount?: number;

  @ApiPropertyOptional({ example: { POST_CONTEXT: '作品上下文' }, description: '保留扩展参数，不会替代主字段。' })
  @IsOptional()
  @IsObject()
  extraParams?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'ENABLED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateAutoReplyPromptConfigDto {
  @ApiPropertyOptional({ example: '抖音评论区默认提示词' })
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
  customSystemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customUserPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forbiddenWords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requiredWords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platformLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountPositioning?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safetyPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  replyLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxMsgCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extraParams?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class ApplyPromptToRobotDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'comment', enum: AUTO_REPLY_MODULES })
  @IsIn(AUTO_REPLY_MODULES)
  module!: string;

  @ApiPropertyOptional({ example: true, description: '是否覆盖机器人当前提示词快照。' })
  @IsOptional()
  @IsBoolean()
  overwriteRobotSnapshot?: boolean;

  @ApiPropertyOptional({ description: '选中配置后，在机器人创建/编辑页临时改过的提示词覆盖项。' })
  @IsOptional()
  @IsObject()
  promptOverrides?: Record<string, unknown>;
}

export class SyncRobotPromptConfigDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'comment', enum: AUTO_REPLY_MODULES })
  @IsIn(AUTO_REPLY_MODULES)
  module!: string;

  @ApiPropertyOptional({ example: 'prompt_config_id', description: '不传时使用机器人设置里绑定的 promptConfigId。' })
  @IsOptional()
  @IsString()
  promptConfigId?: string;

  @ApiPropertyOptional({ description: '不传时使用机器人设置里的 promptSnapshot。' })
  @IsOptional()
  @IsObject()
  promptSnapshot?: Record<string, unknown>;
}

export class UpdateRobotAutoReplySettingDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'comment', enum: AUTO_REPLY_MODULES })
  @IsIn(AUTO_REPLY_MODULES)
  module!: string;

  @ApiPropertyOptional({ example: 'prompt_config_id' })
  @IsOptional()
  @IsString()
  promptConfigId?: string;

  @ApiPropertyOptional({ description: '机器人内保存的提示词快照。' })
  @IsOptional()
  @IsObject()
  promptSnapshot?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'ALL_UNREPLIED', enum: COMMENT_REPLY_MODES })
  @IsOptional()
  @IsIn(COMMENT_REPLY_MODES)
  commentReplyMode?: string;

  @ApiPropertyOptional({ example: 'reply_dataset_id' })
  @IsOptional()
  @IsString()
  replyDatasetId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enableFirstReply?: boolean;

  @ApiPropertyOptional({ example: ['你好，我这边主要看账号定位和内容转化这块。'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  firstReplyContents?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  useConversationContext?: boolean;

  @ApiPropertyOptional({ description: '其他 GUI 配置项。' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class CommentReplyDatasetQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: '默认' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CommentReplyDatasetRowDto {
  @ApiProperty({ example: '我账号发了很多，但一直没什么咨询。' })
  @IsString()
  @Length(1, 2000)
  commentContent!: string;

  @ApiProperty({ example: '内容发得多但没咨询，通常要看视频里有没有给用户明确的咨询理由。' })
  @IsString()
  @Length(1, 4000)
  replyContent!: string;

  @ApiPropertyOptional({ example: ['没咨询', '客户', '线索'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ example: 'EXACT', enum: COMMENT_MATCH_TYPES })
  @IsOptional()
  @IsIn(COMMENT_MATCH_TYPES)
  matchType?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ImportCommentReplyDatasetDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiProperty({ example: '评论回复优先匹配表' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ example: '从 Excel 导入后的评论-回复映射。' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'EXACT', enum: COMMENT_MATCH_TYPES, description: '缺省匹配方式；用于兼容旧前端或导入数据里未填写 matchType 的行。' })
  @IsOptional()
  @IsIn(COMMENT_MATCH_TYPES)
  defaultMatchType?: string;

  @ApiProperty({ type: [CommentReplyDatasetRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommentReplyDatasetRowDto)
  rows!: CommentReplyDatasetRowDto[];
}

export class UpdateCommentReplyDatasetDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: '评论回复优先匹配表' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ example: '从 Excel 导入后的评论-回复映射。' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'EXACT', enum: COMMENT_MATCH_TYPES, description: '缺省匹配方式；用于兼容旧前端或导入数据里未填写 matchType 的行。' })
  @IsOptional()
  @IsIn(COMMENT_MATCH_TYPES)
  defaultMatchType?: string;

  @ApiPropertyOptional({ type: [CommentReplyDatasetRowDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommentReplyDatasetRowDto)
  rows?: CommentReplyDatasetRowDto[];
}

export class MatchCommentReplyDatasetDto {
  @ApiProperty({ example: '我账号发了很多，但一直没什么咨询。' })
  @IsString()
  @Length(1, 2000)
  commentContent!: string;
}

export class CommentThreadContextItemDto {
  @ApiProperty({ example: 'user', enum: ['user', 'account'] })
  @IsIn(['user', 'account'])
  role!: string;

  @ApiPropertyOptional({ example: 'QXQ' })
  @IsOptional()
  @IsString()
  @Length(0, 128)
  author?: string;

  @ApiProperty({ example: '背景音乐可以柔和一点。' })
  @IsString()
  @Length(1, 1000)
  content!: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  level?: number;

  @ApiPropertyOptional({ example: 'cmt_xxx' })
  @IsOptional()
  @IsString()
  @Length(0, 256)
  messageId?: string;
}

export class CommentTestReplyDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'DEEPSEEK', enum: AUTO_REPLY_AI_PROVIDERS })
  @IsOptional()
  @IsIn(AUTO_REPLY_AI_PROVIDERS)
  aiProvider?: string;

  @ApiPropertyOptional({ example: 'account_profile_id' })
  @IsOptional()
  @IsString()
  accountProfileId?: string;

  @ApiPropertyOptional({ example: true, description: 'DeepSeek fails then explicitly use the legacy Coze path.' })
  @IsOptional()
  @IsBoolean()
  fallbackToCoze?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  assetIds?: string[];

  @ApiPropertyOptional({ example: 'prompt_config_id' })
  @IsOptional()
  @IsString()
  promptConfigId?: string;

  @ApiPropertyOptional({ example: 'DEFAULT', enum: AUTO_REPLY_WORKFLOW_MODES, description: 'DEFAULT=系统现有工作流，STRUCTURED=自定义结构化工作流，PLAIN_CHAT=纯文本聊天工作流。' })
  @IsOptional()
  @IsIn(AUTO_REPLY_WORKFLOW_MODES)
  workflowMode?: string;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID' })
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID', description: 'STRUCTURED 私信对话流可选。' })
  @IsOptional()
  @IsString()
  workflowBotId?: string;

  @ApiPropertyOptional({ example: 'input', description: 'PLAIN_CHAT 工作流的输入变量名。' })
  @IsOptional()
  @IsString()
  workflowInputKey?: string;

  @ApiPropertyOptional({ example: 'dataset_id' })
  @IsOptional()
  @IsString()
  datasetId?: string;

  @ApiProperty({ example: '我账号发了很多，但一直没什么咨询。' })
  @IsString()
  @Length(1, 2000)
  userInput!: string;

  @ApiPropertyOptional({ example: 'cmtroot_xxx', description: '同一作品下的根评论线程 ID。' })
  @IsOptional()
  @IsString()
  @Length(0, 256)
  commentThreadId?: string;

  @ApiPropertyOptional({ example: 'attempt_xxx', description: '客户端本次回复尝试 ID，用于真实记录与 Reply Trace 关联。' })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  replyAttemptId?: string;

  @ApiPropertyOptional({ example: 'comment_xxx', description: '本轮客户评论消息 ID。' })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  customerMessageId?: string;

  @ApiPropertyOptional({ example: 'reply_xxx', description: '平台回显后可补充的账号侧回复消息 ID。' })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  replyMessageId?: string;

  @ApiPropertyOptional({ example: 'local_sqlite' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  contextSource?: string;

  @ApiPropertyOptional({ type: [CommentThreadContextItemDto], description: '当前评论之前的同一根评论线程有效消息。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CommentThreadContextItemDto)
  threadContext?: CommentThreadContextItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customSystemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customUserPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forbiddenWords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requiredWords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyStyle?: string;

  @ApiPropertyOptional({ example: '抖音评论区' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountPositioning?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postContext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commentGoal?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  replyLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commentPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safetyPolicy?: string;
}

export class DmTestReplyDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'DEEPSEEK', enum: AUTO_REPLY_AI_PROVIDERS })
  @IsOptional()
  @IsIn(AUTO_REPLY_AI_PROVIDERS)
  aiProvider?: string;

  @ApiPropertyOptional({ example: 'account_profile_id' })
  @IsOptional()
  @IsString()
  accountProfileId?: string;

  @ApiPropertyOptional({ example: true, description: 'DeepSeek fails then explicitly use the legacy Coze path.' })
  @IsOptional()
  @IsBoolean()
  fallbackToCoze?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  assetIds?: string[];

  @ApiPropertyOptional({ example: 'prompt_config_id' })
  @IsOptional()
  @IsString()
  promptConfigId?: string;

  @ApiPropertyOptional({ example: 'DEFAULT', enum: AUTO_REPLY_WORKFLOW_MODES, description: 'DEFAULT=系统现有工作流，STRUCTURED=自定义结构化工作流，PLAIN_CHAT=纯文本聊天工作流。' })
  @IsOptional()
  @IsIn(AUTO_REPLY_WORKFLOW_MODES)
  workflowMode?: string;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID' })
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID', description: 'STRUCTURED 私信对话流可选。' })
  @IsOptional()
  @IsString()
  workflowBotId?: string;

  @ApiPropertyOptional({ example: 'input', description: 'PLAIN_CHAT 工作流的输入变量名。' })
  @IsOptional()
  @IsString()
  workflowInputKey?: string;

  @ApiProperty({ example: '你好，我想了解一下你们这个怎么做？' })
  @IsString()
  @Length(1, 2000)
  messageContent!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  useConversationContext?: boolean;

  @ApiPropertyOptional({ example: 'YOUR_COZE_ID' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: '自有服务器对话记录的统一会话 ID。' })
  @IsOptional()
  @IsString()
  dialogueConversationId?: string;

  @ApiPropertyOptional({ description: 'PC Robot Test 的服务器隔离测试会话 ID；仅 ROBOT_TEST_DM 使用，不得作为真实 canonical conversation ID。' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  testSessionId?: string;

  @ApiPropertyOptional({ description: 'PC Robot Test 本轮客户消息稳定 ID，用于测试会话消息幂等。' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  testClientMessageId?: string;

  @ApiPropertyOptional({ enum: ['HVE3_CANDIDATE'], description: '仅 PC Robot Test 隔离验收使用；正式运行由服务端固定 HVE_ACTIVE。' })
  @IsOptional()
  @IsIn(['HVE3_CANDIDATE'])
  hveExecutionLane?: 'HVE3_CANDIDATE';

  @ApiPropertyOptional({ type: [String], description: '本轮当前消息 ID，读取历史上下文时排除。' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  currentClientMessageIds?: string[];

  @ApiPropertyOptional({ example: 'attempt_xxx', description: '客户端本次回复尝试 ID，用于真实记录与 Reply Trace 关联。' })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  replyAttemptId?: string;

  @ApiPropertyOptional({ example: 'message_xxx', description: '本轮客户消息 ID；为空时使用 currentClientMessageIds 第一项。' })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  customerMessageId?: string;

  @ApiPropertyOptional({ example: 'reply_xxx', description: '平台回显后可补充的账号侧回复消息 ID。' })
  @IsOptional()
  @IsString()
  @Length(0, 512)
  replyMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customSystemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customUserPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forbiddenWords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requiredWords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyStyle?: string;

  @ApiPropertyOptional({ example: '抖音私信' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountPositioning?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conversionGoal?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  replyLength?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxMsgCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safetyPolicy?: string;
}

export class CommentRecordQueryDto extends PaginationDto {
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

  @ApiPropertyOptional({ example: '花生米' })
  @IsOptional()
  @IsString()
  botNickname?: string;


  @ApiPropertyOptional({ example: 'comment_123' })
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiPropertyOptional({ example: '评论用户' })
  @IsOptional()
  @IsString()
  userNickname?: string;

  @ApiPropertyOptional({ example: '评论内容' })
  @IsOptional()
  @IsString()
  commentContent?: string;

  @ApiPropertyOptional({ example: '做短视频账号不能一上来就盲目发内容' })
  @IsOptional()
  @IsString()
  postTitle?: string;

  @ApiPropertyOptional({ example: 'video_xxx' })
  @IsOptional()
  @IsString()
  videoId?: string;

  @ApiPropertyOptional({ example: 'cmtroot_xxx' })
  @IsOptional()
  @IsString()
  rootRecordId?: string;

  @ApiPropertyOptional({ example: 'user' })
  @IsOptional()
  @IsString()
  senderRole?: string;

  @ApiPropertyOptional({ example: 'complete_visible_thread' })
  @IsOptional()
  @IsString()
  collectionStatus?: string;

  @ApiPropertyOptional({ example: '多少钱' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-07-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 'sent', enum: REPLY_STATUSES })
  @IsOptional()
  @IsIn(REPLY_STATUSES)
  replyStatus?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  shouldReply?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  skipReply?: boolean;
}



export class CommentRecordLookupItemDto {
  @ApiPropertyOptional({ example: 'comment_123' })
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiPropertyOptional({ example: '用户昵称' })
  @IsOptional()
  @IsString()
  userNickname?: string;

  @ApiPropertyOptional({ example: '这条评论内容' })
  @IsOptional()
  @IsString()
  commentContent?: string;
}

export class LookupCommentRecordsDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'WECHAT_VIDEO' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({ type: [CommentRecordLookupItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommentRecordLookupItemDto)
  records!: CommentRecordLookupItemDto[];
}

export class CommentRecordItemDto {
  @ApiPropertyOptional({ example: 'cmt_001' })
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiPropertyOptional({ example: 'douyin_comment_identity' })
  @IsOptional()
  @IsString()
  externalCommentId?: string;

  @ApiPropertyOptional({ example: 'video_xxx' })
  @IsOptional()
  @IsString()
  videoId?: string;

  @ApiPropertyOptional({ example: '评论记录测试作品' })
  @IsOptional()
  @IsString()
  videoTitle?: string;

  @ApiPropertyOptional({ example: 'cmt_001' })
  @IsOptional()
  @IsString()
  rootRecordId?: string;

  @ApiPropertyOptional({ example: 'cmt_001' })
  @IsOptional()
  @IsString()
  parentRecordId?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  depth?: number;

  @ApiPropertyOptional({ example: 'user' })
  @IsOptional()
  @IsString()
  senderRole?: string;

  @ApiPropertyOptional({ example: 'platform_user' })
  @IsOptional()
  @IsString()
  actorSource?: string;

  @ApiPropertyOptional({ example: 'verified' })
  @IsOptional()
  @IsString()
  attributionConfidence?: string;

  @ApiPropertyOptional({ example: 'attempt_xxx' })
  @IsOptional()
  @IsString()
  replyAttemptId?: string;

  @ApiPropertyOptional({ example: 'trace_xxx' })
  @IsOptional()
  @IsString()
  replyTraceId?: string;

  @ApiPropertyOptional({ example: 'DEEPSEEK_RUNTIME' })
  @IsOptional()
  @IsString()
  generationSource?: string;

  @ApiProperty({ example: '枫' })
  @IsString()
  @Length(1, 100)
  userNickname!: string;

  @ApiProperty({ example: '说得挺对的，很多人就是一上来乱发。' })
  @IsString()
  @Length(1, 4000)
  commentContent!: string;

  @ApiPropertyOptional({ example: '2026-04-30 15:20:33' })
  @IsOptional()
  @IsString()
  commentTime?: string;

  @ApiPropertyOptional({ example: 'text' })
  @IsOptional()
  @IsString()
  messageType?: string;

  @ApiPropertyOptional({ example: '[图片]' })
  @IsOptional()
  @IsString()
  typePlaceholder?: string;

  @ApiPropertyOptional({ example: '刚刚' })
  @IsOptional()
  @IsString()
  sourceTimeRaw?: string;

  @ApiPropertyOptional({ example: '2026-07-16T12:00:00.000Z' })
  @IsOptional()
  @IsString()
  observedAt?: string;

  @ApiPropertyOptional({ example: 'relative_parsed' })
  @IsOptional()
  @IsString()
  timeAccuracy?: string;

  @ApiPropertyOptional({ example: 'complete_visible_thread' })
  @IsOptional()
  @IsString()
  collectionStatus?: string;

  @ApiPropertyOptional({ example: '全部评论' })
  @IsOptional()
  @IsString()
  currentFilter?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  repliesCollapsed?: boolean;

  @ApiPropertyOptional({ example: 'visible_complete' })
  @IsOptional()
  @IsString()
  threadCompleteness?: string;

  @ApiPropertyOptional({ example: 'ucp-client' })
  @IsOptional()
  @IsString()
  sourceClientId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  shouldReply?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  skipReply?: boolean;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  skipReason?: string;

  @ApiPropertyOptional({ example: 'question' })
  @IsOptional()
  @IsString()
  commentType?: string;

  @ApiPropertyOptional({ example: 'medium', enum: INTENT_LEVELS })
  @IsOptional()
  @IsIn(INTENT_LEVELS)
  intentLevel?: string;

  @ApiPropertyOptional({ example: '中意向' })
  @IsOptional()
  @IsString()
  intentLabel?: string;

  @ApiPropertyOptional({ example: '用户提出具体问题，有咨询方向。' })
  @IsOptional()
  @IsString()
  judgeReason?: string;

  @ApiPropertyOptional({ example: 'pending', enum: REPLY_STATUSES })
  @IsOptional()
  @IsIn(REPLY_STATUSES)
  replyStatus?: string;

  @ApiPropertyOptional({ example: '可以先从素材和目标人群拆一下。' })
  @IsOptional()
  @IsString()
  replyContent?: string;

  @ApiPropertyOptional({ example: '2026-04-30 15:20:40' })
  @IsOptional()
  @IsString()
  replyTime?: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  failReason?: string;

  @ApiPropertyOptional({ type: [Object], description: '允许 GUI 直接传树结构；后端会递归平铺。' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommentRecordItemDto)
  children?: CommentRecordItemDto[];
}

export class SyncCommentRecordsDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'comment' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiProperty({ example: '花生米' })
  @IsString()
  @Length(1, 100)
  botNickname!: string;

  @ApiPropertyOptional({ example: '做短视频账号不能一上来就盲目发内容' })
  @IsOptional()
  @IsString()
  postTitle?: string;

  @ApiProperty({ type: [CommentRecordItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommentRecordItemDto)
  comments!: CommentRecordItemDto[];
}

export class DmConversationQueryDto extends PaginationDto {
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

  @ApiPropertyOptional({ example: '花生米' })
  @IsOptional()
  @IsString()
  botNickname?: string;

  @ApiPropertyOptional({ example: '枫' })
  @IsOptional()
  @IsString()
  userNickname?: string;
}

export class DmTurnSyncDto {
  @ApiPropertyOptional({ example: 'turn_001' })
  @IsOptional()
  @IsString()
  turnId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortIndex?: number;

  @ApiProperty({ example: { content: '你好', send_time: '2026-04-30 15:00:00' } })
  @IsObject()
  userMessage!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  analysis?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  reply?: Record<string, unknown>;
}

export class DmConversationSyncDto {
  @ApiPropertyOptional({ example: 'dm_001' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ example: '枫' })
  @IsString()
  @Length(1, 100)
  userNickname!: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  manualTakeover?: boolean;

  @ApiProperty({ type: [DmTurnSyncDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DmTurnSyncDto)
  turns!: DmTurnSyncDto[];
}

export class SyncDmConversationsDto {
  @ApiPropertyOptional({ example: 'tenant_id' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'robot_id' })
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional({ example: 'dm' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiProperty({ example: '花生米' })
  @IsString()
  @Length(1, 100)
  botNickname!: string;

  @ApiProperty({ type: [DmConversationSyncDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DmConversationSyncDto)
  conversations!: DmConversationSyncDto[];
}
