import type { AutoReplyPromptSnapshot, CommentReplyMode } from '@/api/modules/autoReplies';
import type { RuntimePolicy } from './runtimePolicy';

export type RobotCategory = 'PRIVATE_MESSAGE' | 'COMMENT' | 'INTERCEPT';
export type RobotBackendType = 'PRIVATE_MESSAGE' | 'COMMENT_REPLY' | 'INTERCEPT';
export type RobotPlatform = 'DOUYIN' | 'KUAISHOU' | 'XIAOHONGSHU' | 'WECHAT' | 'WECHAT_VIDEO';
export type RobotAuthStatus = 'UNAUTHORIZED' | 'PENDING_QR' | 'AUTHORIZED' | 'AUTH_EXPIRED';
export type RobotRunStatus = 'RUNNING' | 'STOPPED' | 'DISABLED';
export type RobotAiProvider = 'COZE' | 'DEEPSEEK';

export interface RobotAiBinding {
  provider: RobotAiProvider;
  accountProfileId: string;
  fallbackToCoze: boolean;
  assetIds: string[];
}

export interface RobotManagementFilters {
  keyword: string;
  platform: string;
  authStatus: string;
  runStatus: string;
}


export type InterceptTargetMode = 'homepage' | 'content';

export interface InterceptTargetEntry {
  url: string;
  label?: string;
  accountName?: string;
  enabled: boolean;
}

export interface InterceptRunWindow {
  name?: string;
  start: string;
  end: string;
  enabled: boolean;
}

export interface InterceptCollectConfig {
  maxPosts: number;
  maxCommentsPerPost: number;
  captureSeconds: number;
  triggerScrollRounds: number;
  triggerPauseSec: number;
  pacingProfile: 'conservative' | 'balanced' | 'efficient';
  saveDebugFiles: boolean;
  headless: boolean;
  maxTargetMinutes: number;
  randomizeTargets: boolean;
  commentFetchMaxSeconds: number;
  postCooldownMinSec: number;
  postCooldownMaxSec: number;
  accountCooldownMinSec: number;
  accountCooldownMaxSec: number;
  commentPagePauseMinSec: number;
  commentPagePauseMaxSec: number;
  /** 单作品最长时长，单位秒；0 表示不限制。 */
  maxPostDurationSeconds: number;
}

export interface InterceptSpeechConfig {
  enabled: boolean;
  failStrategy: 'SKIP' | 'RUN';
  emptyTranscriptStrategy: 'SKIP' | 'RUN';
}

export interface InterceptIntentAnalysisConfig {
  promptConfigId?: string;
  promptConfigName?: string;
  workflowId?: string;
  batchSize?: number;
  useTenantDefault?: boolean;
}

export interface InterceptWorkDecisionConfig {
  enabled: boolean;
  workflowId?: string;
  failStrategy?: 'SKIP' | 'RUN';
}

export interface InterceptRobotConfig {
  aiBinding: RobotAiBinding;
  targetMode: InterceptTargetMode;
  homepageTargets: InterceptTargetEntry[];
  contentTargets: InterceptTargetEntry[];
  homepageLookbackDays: number;
  schedule: {
    timezone: string;
    runEveryDays: number;
    anchorDate?: string;
    runWindows: InterceptRunWindow[];
  };
  collect: InterceptCollectConfig;
  intentAnalysis: InterceptIntentAnalysisConfig;
  workDecision: InterceptWorkDecisionConfig;
  speech: InterceptSpeechConfig;
}

export interface RobotManagementItem {
  id: string;
  name: string;
  code: string;
  category: RobotCategory;
  backendType: RobotBackendType;
  platform: RobotPlatform;
  scope: string;
  authStatus: RobotAuthStatus;
  runStatus: RobotRunStatus;
  accountName: string;
  authId: string;
  deviceId: string;
  deviceName: string;
  expiredAt: string;
  authorizedAt?: string;
  lastActiveAt?: string;
  qrUpdatedAt?: string;
  autoStopReason?: string;
  replyKeyword?: string;
  remark?: string;
  promptConfigId?: string;
  promptSnapshot?: AutoReplyPromptSnapshot;
  commentReplyMode?: CommentReplyMode;
  replyDatasetId?: string;
  enableFirstReply?: boolean;
  firstReplyContents?: string[];
  useConversationContext?: boolean;
  aiBinding?: RobotAiBinding;
  autoReplySettingConfig?: Record<string, unknown>;
  runtimePolicy?: RuntimePolicy;
  interceptConfig?: InterceptRobotConfig;
  createdAt: string;
  updatedAt: string;
}

export interface RobotManagementFormModel {
  name: string;
  platform: RobotPlatform | '';
  expiredAt: string;
  remark: string;
  promptConfigId: string;
  promptSnapshot: AutoReplyPromptSnapshot;
  commentReplyMode: CommentReplyMode;
  replyDatasetId: string;
  enableFirstReply: boolean;
  firstReplyContents: string[];
  useConversationContext: boolean;
  aiBinding: RobotAiBinding;
  autoReplySettingConfig: Record<string, unknown>;
  runtimePolicy: RuntimePolicy;
  interceptConfig: InterceptRobotConfig;
}
