import type { InterceptRobotConfig, RobotCategory, RobotManagementFormModel } from './types';
import { DEFAULT_RUNTIME_POLICY } from './runtimePolicy';

export const ROBOT_PLATFORM_OPTIONS = [
  { label: '抖音', value: 'DOUYIN' },
  { label: '快手', value: 'KUAISHOU' },
  { label: '小红书', value: 'XIAOHONGSHU' },
  { label: '微信', value: 'WECHAT' },
  { label: '微信视频号', value: 'WECHAT_VIDEO' }
];

export const ROBOT_AUTH_STATUS_OPTIONS = [
  { label: '未授权', value: 'UNAUTHORIZED', color: 'gray' },
  { label: '待扫码', value: 'PENDING_QR', color: 'orange' },
  { label: '已授权', value: 'AUTHORIZED', color: 'green' },
  { label: '授权失效', value: 'AUTH_EXPIRED', color: 'red' }
];

export const ROBOT_RUN_STATUS_OPTIONS = [
  { label: '运行中', value: 'RUNNING', color: 'green' },
  { label: '已停止', value: 'STOPPED', color: 'orange' },
  { label: '已禁用', value: 'DISABLED', color: 'red' }
];

export const ROBOT_CATEGORY_META: Record<RobotCategory, { title: string; description: string; scopeLabel: string; keywordLabel: string }> = {
  PRIVATE_MESSAGE: {
    title: '私信机器人',
    description: '用于私信自动回复、意向收集和售前引导，通常绑定操作者自己的账号扫码授权。',
    scopeLabel: '私信触发场景',
    keywordLabel: '回复关键词'
  },
  COMMENT: {
    title: '评论机器人',
    description: '用于评论区自动回复、互动控场和账号养护，支持按平台账号扫码授权。',
    scopeLabel: '评论触发场景',
    keywordLabel: '评论关键词'
  },
  INTERCEPT: {
    title: '截流机器人',
    description: '用于评论区、私信或主页入口承接线索，适合抖音、快手、小红书、微信等账号自动分流。',
    scopeLabel: '截流承接范围',
    keywordLabel: '线索关键词'
  }
};


export const DEFAULT_INTERCEPT_CONFIG: InterceptRobotConfig = {
  aiBinding: {
    provider: 'DEEPSEEK',
    accountProfileId: '',
    fallbackToCoze: true,
    assetIds: []
  },
  targetMode: 'homepage',
  homepageTargets: [],
  contentTargets: [],
  homepageLookbackDays: 10,
  schedule: {
    timezone: 'Asia/Shanghai',
    runEveryDays: 3,
    runWindows: [{ name: '默认运行时间', start: '19:00', end: '00:00', enabled: true }]
  },
  intentAnalysis: {
    promptConfigId: '',
    promptConfigName: '',
    workflowId: '',
    batchSize: undefined,
    useTenantDefault: false
  },
  workDecision: {
    enabled: true,
    workflowId: '',
    failStrategy: 'SKIP'
  },
  speech: {
    enabled: true,
    failStrategy: 'SKIP',
    emptyTranscriptStrategy: 'SKIP'
  },
  collect: {
    maxPosts: 0,
    maxCommentsPerPost: 0,
    captureSeconds: 8,
    triggerScrollRounds: 4,
    triggerPauseSec: 1.2,
    pacingProfile: 'balanced',
    saveDebugFiles: false,
    headless: false,
    maxTargetMinutes: 30,
    randomizeTargets: true,
    commentFetchMaxSeconds: 0,
    postCooldownMinSec: 6,
    postCooldownMaxSec: 20,
    accountCooldownMinSec: 12,
    accountCooldownMaxSec: 35,
    commentPagePauseMinSec: 1,
    commentPagePauseMaxSec: 2.2,
    maxPostDurationSeconds: 0
  }
};

export const ROBOT_DEFAULT_FORM: RobotManagementFormModel = {
  name: '',
  platform: 'DOUYIN',
  expiredAt: '',
  remark: '',
  promptConfigId: '',
  promptSnapshot: {},
  commentReplyMode: 'ALL_UNREPLIED',
  replyDatasetId: '',
  enableFirstReply: false,
  firstReplyContents: [],
  useConversationContext: true,
  aiBinding: {
    provider: 'DEEPSEEK',
    accountProfileId: '',
    fallbackToCoze: true,
    assetIds: []
  },
  autoReplySettingConfig: {},
  runtimePolicy: DEFAULT_RUNTIME_POLICY,
  interceptConfig: JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_CONFIG))
};
