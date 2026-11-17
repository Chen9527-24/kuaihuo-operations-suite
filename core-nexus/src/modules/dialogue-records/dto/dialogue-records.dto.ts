import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const SENDER_ROLES = ['user', 'account', 'system'] as const;
const MESSAGE_TYPES = ['text', 'image', 'voice', 'video', 'file', 'emoji', 'link', 'card', 'system', 'unsupported', 'unknown'] as const;

export class DialogueWindowMessageDto {
  @ApiProperty({ enum: SENDER_ROLES })
  @IsIn(SENDER_ROLES)
  senderRole!: string;

  @ApiProperty({ enum: MESSAGE_TYPES })
  @IsIn(MESSAGE_TYPES)
  messageType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  typePlaceholder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attributionConfidence?: string;
}

export class DialogueMessageSyncDto extends DialogueWindowMessageDto {
  @ApiProperty({ example: 'msg_abc123' })
  @IsString()
  @Length(1, 256)
  clientMessageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceClientId?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  sequenceIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observedAtUtc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  historyKind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeAccuracy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payloadFingerprint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyAttemptId?: string;

  @ApiPropertyOptional({ description: 'Core Nexus 返回的回复追踪 ID。' })
  @IsOptional()
  @IsString()
  replyTraceId?: string;

  @ApiPropertyOptional({ description: 'deepseek_customer_service / coze_workflow / imported_dataset 等生成来源。' })
  @IsOptional()
  @IsString()
  generationSource?: string;
}

export class ResolveSyncDialogueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'robot_id' })
  @IsString()
  @Length(1, 128)
  robotId!: string;

  @ApiProperty({ example: 'DOUYIN' })
  @IsString()
  @Length(1, 32)
  platform!: string;

  @ApiPropertyOptional({ example: 'dm' })
  @IsOptional()
  @IsString()
  channelType?: string;

  @ApiPropertyOptional({
    example: 'friend_private',
    description: 'Identity partition: friend_private / stranger_private / group / private_all / private_unknown. Legacy private remains accepted.',
  })
  @IsOptional()
  @IsString()
  chatType?: string;

  @ApiProperty({ example: '抖音-测试' })
  @IsString()
  @Length(1, 100)
  botNickname!: string;

  @ApiProperty({ example: 'QXQ' })
  @IsString()
  @Length(1, 100)
  userNickname!: string;

  @ApiProperty({ example: 'ucp-1234-abcd' })
  @IsString()
  @Length(1, 128)
  sourceClientId!: string;

  @ApiProperty({ example: 'conv_local_abc' })
  @IsString()
  @Length(1, 128)
  localConversationId!: string;

  @ApiPropertyOptional({ type: [DialogueWindowMessageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DialogueWindowMessageDto)
  currentWindow?: DialogueWindowMessageDto[];

  @ApiProperty({ type: [DialogueMessageSyncDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DialogueMessageSyncDto)
  messages!: DialogueMessageSyncDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  currentClientMessageIds?: string[];

  @ApiPropertyOptional({ description: 'Stable hashed participant/session identity supplied by a trusted platform adapter' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  identityKey?: string;

  @ApiPropertyOptional({ example: 'platform_session_id' })
  @IsOptional()
  @IsString()
  identitySource?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  identityConfidence?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  contextLimit?: number;
}

export class DialogueConversationQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identityStatus?: string;
}

export class DialogueMessageQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class DialogueExportQueryDto extends DialogueConversationQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated representative canonical conversation IDs selected from the PC contact list' })
  @IsOptional()
  @IsString()
  conversationIds?: string;

  @ApiPropertyOptional({ enum: ['csv', 'json'] })
  @IsOptional()
  @IsIn(['csv', 'json'])
  format?: string;
}

export class DeleteDialogueConversationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  conversationIds!: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hardDelete?: boolean;
}

export class PurgeDialogueRecordsDto {
  @ApiProperty({ example: 'DELETE' })
  @IsString()
  confirm!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  robotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identityStatus?: string;
}

export class UpdateWorkflowConversationDto {
  @ApiProperty()
  @IsString()
  @Length(1, 256)
  workflowConversationId!: string;
}


export const CANONICAL_STATE_FIELD_KEYS = [
  'relationship', 'activeTopic', 'currentIntent', 'customerGoal', 'customerActions',
  'explicitFacts', 'preferences', 'assistantActions', 'pendingItems', 'resolvedItems', 'transientState',
] as const;

export class InvalidateCanonicalConversationStateDto {
  @ApiProperty({ enum: ['CANONICAL_FIELD', 'MEMORY'] })
  @IsIn(['CANONICAL_FIELD', 'MEMORY'])
  targetType!: 'CANONICAL_FIELD' | 'MEMORY';

  @ApiProperty({ description: 'canonical field key or memory id' })
  @IsString()
  @Length(1, 160)
  targetKey!: string;

  @ApiPropertyOptional({ description: 'operator reason; used for explainability, not as customer evidence' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
