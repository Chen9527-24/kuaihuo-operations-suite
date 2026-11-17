import { BadGatewayException, BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser, resolveRequiredTenantId, resolveTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CompleteRobotAuthSessionDto,
  ConsumeRobotPairSessionDto,
  CreateRobotAuthDto,
  CreateInterceptCaptureBatchDto,
  CreateInterceptCaptureViewPresetDto,
  UpdateInterceptCaptureViewPresetDto,
  DeleteInterceptCaptureBatchDto,
  DeletePrivateMessageTaskBatchDto,
  RetryInterceptIntentAnalysisBatchDto,
  RetryFailedInterceptCaptureAnalysisDto,
  RunInterceptWorkDecisionDto,
  TestInterceptIntentPromptConfigDto,
  TestInterceptWorkDecisionDto,
  UpsertInterceptIntentPromptConfigDto,
  UpdateInterceptIntentPromptConfigDto,
  UpdatePrivateMessageTaskMessageDto,
  CreatePrivateMessageRobotDto,
  CreatePrivateMessageTasksDto,
  ClaimPrivateMessageTaskDto,
  ReportPrivateMessageTaskDto,
  CreateRobotAuthSessionDto,
  CreateRobotDeviceDto,
  CreateRobotDto,
  CreateRobotPairSessionDto,
  ReportRobotAuthQrDto,
  RobotDeviceHeartbeatDto,
  StopRobotDto,
  SyncRobotAuthStatusDto,
  UpdatePrivateMessageRobotDto,
  UpdateRobotAuthDto,
  UpdateRobotAuthStatusDto,
  UpdateRobotDeviceDto,
  UpdateRobotDeviceStatusDto,
  UpdateRobotDto,
  UpdateRobotRuntimeStatusDto,
} from './dto/robot.dto';
import { InterceptCaptureQueryDto, InterceptCaptureViewPresetQueryDto, InterceptIntentAnalysisBatchQueryDto, InterceptIntentPromptConfigQueryDto, PrivateMessageRobotQueryDto, PrivateMessageTaskQueryDto, RobotAuthQueryDto, RobotDeviceQueryDto, RobotOptionsQueryDto, RobotQueryDto } from './dto/robot-query.dto';
import { withDefaultRuntimePolicy } from './runtime-policy.defaults';
import { DeepSeekService } from '../ai/deepseek.service';
import { CustomerServiceChannelReplyService } from '../customer-service-agent/runtime/channel/customer-service-channel-reply.service';
import { CustomerServiceReplyTracesService } from '../customer-service-agent/admin/reply-traces/customer-service-reply-traces.service';
import { CustomerServiceKnowledgeEntriesService } from '../customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service';
import { resolveCustomerServiceEffectiveBusinessScope } from '../customer-service-agent/shared/context/customer-service-business-scope.util';


type InterceptWorkDecisionEvidence = {
  traceId: string | null;
  provider: string | null;
  model: string | null;
  configurationHash: string | null;
};

class CozeWorkflowRequestError extends Error {
  constructor(message: string, public readonly debug: Record<string, unknown>) {
    super(message);
    this.name = 'CozeWorkflowRequestError';
  }
}

const robotInclude = {
  tenant: true,
  auth: {
    select: {
      id: true,
      platform: true,
      accountUid: true,
      accountName: true,
      accountAvatarUrl: true,
      status: true,
      sessionExpiresAt: true,
      authorizedAt: true,
      lastVerifiedAt: true,
    },
  },
  device: {
    select: {
      id: true,
      name: true,
      platform: true,
      deviceCode: true,
      status: true,
      clientVersion: true,
      osName: true,
      ip: true,
      lastHeartbeatAt: true,
    },
  },
  createdBy: { select: { id: true, username: true, displayName: true } },
  runs: {
    orderBy: [{ startedAt: 'desc' as const }],
    take: 1,
  },
} satisfies Prisma.RobotInclude;

const robotAuthInclude = {
  tenant: true,
  authorizedBy: { select: { id: true, username: true, displayName: true } },
  device: { select: { id: true, name: true, deviceCode: true, status: true, lastHeartbeatAt: true } },
} satisfies Prisma.RobotPlatformAuthInclude;

const robotDeviceInclude = {
  tenant: true,
} satisfies Prisma.RobotDeviceInclude;

const ACTIVE_ROBOT_STATUSES = ['DRAFT', 'READY', 'RUNNING', 'STOPPING', 'ERROR'];
const RUNNING_ROBOT_STATUSES = ['RUNNING', 'STOPPING'];
const ROBOT_PAIR_SESSION_PREFIX = 'robot:pair:session:';
const ROBOT_PAIR_CODE_PREFIX = 'robot:pair:code:';
const ROBOT_AUTH_SESSION_PREFIX = 'robot:auth:session:';

const PRIVATE_MESSAGE_TERMINAL_STATUSES = ['SENT', 'FAILED', 'SKIPPED', 'BLOCKED', 'CANCELED', 'EXPIRED'];
const PRIVATE_MESSAGE_ACTIVE_STATUSES = ['PENDING', 'WAITING_WINDOW', 'CLAIMED', 'RUNNING'];
const DEFAULT_INTERCEPT_INTENT_BATCH_SIZE = 20;
const MAX_INTERCEPT_INTENT_BATCH_SIZE = 20;
// 仅作用于“截流提示词效果测试”接口：不改变正式抓取/分析任务的原有 20 条批次逻辑。
const INTERCEPT_INTENT_PROMPT_TEST_BATCH_SIZE = 5;
const MAX_INTERCEPT_INTENT_PROMPT_TEST_COMMENTS = 25;
// 留出 Nginx 620 秒代理超时缓冲；测试接口按批串行执行，不允许无限等待。
const INTERCEPT_INTENT_PROMPT_TEST_TOTAL_TIMEOUT_MS = 570_000;
const INTERCEPT_INTENT_PROMPT_TEST_MIN_REMAINING_MS = 8_000;
const INTERCEPT_FAILED_RETRY_RUN_ID_PREFIX = 'failed_retry_manual';
const INTERCEPT_CAPTURE_VIEW_COLUMNS = [
  { key: 'capturedAt', visible: true },
  { key: 'platform', visible: true },
  { key: 'contentTitle', visible: true },
  { key: 'capturedCommentCount', visible: true },
  { key: 'nickname', visible: true },
  { key: 'commentText', visible: true },
  { key: 'analysisStatus', visible: true },
  { key: 'intentLevel', visible: true },
  { key: 'shouldPrivateMessage', visible: true },
  { key: 'robot', visible: false },
  { key: 'targetType', visible: false },
  { key: 'contentUrl', visible: false },
  { key: 'platformContentId', visible: false },
  { key: 'commentId', visible: false },
  { key: 'userId', visible: false },
  { key: 'intentScore', visible: false },
  { key: 'entryPoint', visible: false },
  { key: 'privateMessageDraft', visible: false },
  { key: 'visibleRegion', visible: false },
  { key: 'commentTime', visible: false },
] as const;
const INTERCEPT_CAPTURE_VIEW_COLUMN_KEYS = new Set<string>(INTERCEPT_CAPTURE_VIEW_COLUMNS.map((item) => item.key));

const INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT = {
  biz: '我们提供抖音竞品截流工具，支持监听指定账号、采集作品评论、识别潜在线索，并辅助生成自然切入回复，帮助运营人员从竞品或行业账号评论区发现潜在客户。',
  cust: '有抖音获客需求的商家、私域运营团队、本地生活商家、教育培训机构、招商加盟团队、短视频运营团队、销售获客团队。',
  acctType: '竞品账号',
  acctPos: '该账号主要发布抖音获客、评论截流、私域转化、短视频运营相关内容，评论区可能出现想找工具、想学方法、想提升获客效率、想解决线索筛选问题的用户。',
  tone: '主动、自然、像陌生人冷启动私信，有一点销售感但不油腻；先用真实样例和效果吸引，不急着问价格，不冒充作者，不夸大承诺。',
  sellPts: '监听指定账号,采集作品评论,识别潜在线索,生成自然切入回复,辅助运营跟进,减少人工筛选成本',
  banRules: '不能说看到你提到价格和试用,不能说你是想先了解价格还是看试用效果,不能一上来报价,不能冒充视频作者,不能冒充账号客服,不能说是在竞品下面看到的,不能承诺百分百转化,不能保证成交,不能说全网最低价,不能夸大收益,不能诱导违规操作',
  nonCust: '纯围观用户、玩梗用户、无业务需求用户、广告引流号、辱骂攻击用户、违规内容发布者、和抖音获客完全无关的评论用户。',
  dmRule: '这是主动私信触达场景。S/A 级优先引导看真实线索样例或实际筛选效果；不要一上来聊价格、报价、套餐；少问问题，先给用户一个愿意回复的理由；C/D 不主动触达。',
  entryRules: '工具方案切入,样例效果切入,问题诊断切入,成本效率切入,行业样例切入,不建议切入',
  videoTitle: '如何通过竞品评论区找到精准客户，并用工具提升线索筛选效率',
  platform: 'douyin',
};

const INTERCEPT_INTENT_EXTRA_PARAM_KEYS = [
  'clientName',
  'mainBusiness',
  'mainProducts',
  'targetScenarios',
  'customerPainPoints',
  'positiveKeywords',
  'negativeKeywords',
  'highIntentKeywords',
  'nonLeadSignals',
  'allowedOffers',
  'accountPersona',
  'forbiddenClaims',
  'ctaPolicy',
  'workflowMode',
  'videoDesc',
  'videoRelevanceRules',
  'commentScoringRules',
  'riskRoutingRules',
  'scriptGenerationRules',
  'businessProfile',
] as const;

const PRIVATE_MESSAGE_DEFAULT_CONFIG = {
  minSendIntervalSeconds: 30,
  maxSendIntervalSeconds: 90,
  claimBatchSize: 1,
  dailySendLimit: 50,
  hourlySendLimit: 10,
  userTouchIntervalDays: 7,
  maxConsecutiveFailures: 5,
  workStartTime: '09:00',
  workEndTime: '22:00',
  sleepStartTime: '',
  sleepEndTime: '',
  enabled: true,
  paused: false,
  defaultMessageTemplate: '您好，看到您刚才的评论，方便的话可以回复我了解详情。',
};

type PrivateMessageRobotConfig = typeof PRIVATE_MESSAGE_DEFAULT_CONFIG;
type PrivateMessageTaskRow = Record<string, any>;
type IntentAnalysisBatchRow = Record<string, any>;
type IntentAnalysisChunkRow = Record<string, any>;
type InterceptCaptureRow = Record<string, any>;
type InterceptIntentPromptConfigRow = Record<string, any>;
type InterceptUnifiedDraftInput = {
  capture: InterceptCaptureRow;
  normalized: {
    cid: string; text: string; level: string; reason: string; need: string; entry: string;
    reply: string; risk: string; should: boolean; tags: string[]; raw: Record<string, unknown>;
  };
  batch: IntentAnalysisBatchRow;
  user: CurrentUserPayload;
  analysisProvider: 'DEEPSEEK' | 'COZE';
  providerFallback: Record<string, unknown> | null;
  runtimeContext?: any;
  requestContext: Record<string, unknown>;
};

type RobotPairSessionPayload = {
  id: string;
  tenantId: string;
  platform?: string;
  pairCode: string;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED';
  deviceId?: string;
  deviceCode?: string;
  deviceName?: string;
  clientVersion?: string;
  osName?: string;
  ip?: string;
  confirmedAt?: string;
  createdById: string;
  createdAt: string;
  expiresAt: string;
};

type RobotAuthSessionPayload = {
  id: string;
  tenantId: string;
  authId: string;
  deviceId: string;
  deviceCode: string;
  platform: string;
  status: 'PENDING' | 'WAIT_QR' | 'SCANNING' | 'AUTHORIZED' | 'EXPIRED' | 'FAILED';
  qrCodeUrl?: string;
  qrCodeContent?: string;
  accountUid?: string;
  accountName?: string;
  accountAvatarUrl?: string;
  sessionExpiresAt?: string;
  requestedByUserId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

@Injectable()
export class RobotsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RobotsService.name);
  private expireTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly deepSeekService: DeepSeekService,
    private readonly customerServiceChannelReply: CustomerServiceChannelReplyService,
    private readonly replyTraces: CustomerServiceReplyTracesService,
    private readonly knowledgeEntries: CustomerServiceKnowledgeEntriesService,
  ) {}

  onModuleInit() {
    this.expireTimer = setInterval(() => {
      void this.syncExpiredRobots().catch((error: Error) => {
        this.logger.error(`syncExpiredRobots failed: ${error.message}`);
      });
    }, 15_000);
    this.expireTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.expireTimer) {
      clearInterval(this.expireTimer);
      this.expireTimer = undefined;
    }
  }

  async list(query: RobotQueryDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.RobotWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { remark: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.robot.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: robotInclude,
      }),
      this.prisma.robot.count({ where }),
    ]);
    return { items: items.map((item) => this.withRuntimePolicyDefaults(item)), page, pageSize, total };
  }



  async listInterceptIntentPromptConfigs(query: InterceptIntentPromptConfigQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    if (tenantId) {
      await this.ensureDefaultInterceptIntentPromptConfig(tenantId, user.id);
    }
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isDefault === 'true' ? { isDefault: true } : query.isDefault === 'false' ? { isDefault: false } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { description: { contains: query.keyword, mode: 'insensitive' } },
              { biz: { contains: query.keyword, mode: 'insensitive' } },
              { cust: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.interceptIntentPromptConfig.findMany({ where, skip, take, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] }),
      db.interceptIntentPromptConfig.count({ where }),
    ]);
    return { items: items.map((item: InterceptIntentPromptConfigRow) => this.normalizeInterceptIntentPromptConfigRow(item)), page, pageSize, total };
  }

  async detailInterceptIntentPromptConfig(id: string, user: CurrentUserPayload) {
    const config = await this.findInterceptIntentPromptConfigOrThrow(id, user);
    return this.normalizeInterceptIntentPromptConfigRow(config);
  }

  async createInterceptIntentPromptConfig(dto: UpsertInterceptIntentPromptConfigDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const data = this.buildInterceptIntentPromptConfigData(dto, tenantId, user.id);
    const shouldDefault = dto.isDefault === true;
    if (shouldDefault) {
      await db.interceptIntentPromptConfig.updateMany({ where: { tenantId, deletedAt: null }, data: { isDefault: false } });
    }
    const enabledCount = await db.interceptIntentPromptConfig.count({ where: { tenantId, deletedAt: null, status: 'ENABLED' } });
    const created = await db.interceptIntentPromptConfig.create({
      data: {
        ...data,
        isDefault: shouldDefault || enabledCount === 0,
      },
    });
    return this.normalizeInterceptIntentPromptConfigRow(created);
  }

  async updateInterceptIntentPromptConfig(id: string, dto: UpdateInterceptIntentPromptConfigDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findInterceptIntentPromptConfigOrThrow(id, user);
    if (dto.isDefault === true) {
      await db.interceptIntentPromptConfig.updateMany({ where: { tenantId: existing.tenantId, deletedAt: null, id: { not: existing.id } }, data: { isDefault: false } });
    }
    const data = this.buildInterceptIntentPromptConfigUpdateData(dto, existing);
    const nextIsDefault = dto.status && dto.status !== 'ENABLED' ? false : dto.isDefault;
    const updated = await db.interceptIntentPromptConfig.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(nextIsDefault !== undefined ? { isDefault: nextIsDefault } : {}),
      },
    });
    if (updated.status !== 'ENABLED' || updated.deletedAt || (existing.isDefault && nextIsDefault === false)) {
      await this.ensureDefaultInterceptIntentPromptConfig(String(updated.tenantId), user.id);
    }
    return this.normalizeInterceptIntentPromptConfigRow(updated);
  }

  async setDefaultInterceptIntentPromptConfig(id: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findInterceptIntentPromptConfigOrThrow(id, user);
    if (existing.status !== 'ENABLED') {
      throw new BadRequestException('只能将启用状态的提示词配置设为默认');
    }
    await db.interceptIntentPromptConfig.updateMany({ where: { tenantId: existing.tenantId, deletedAt: null }, data: { isDefault: false } });
    const updated = await db.interceptIntentPromptConfig.update({ where: { id: existing.id }, data: { isDefault: true } });
    return this.normalizeInterceptIntentPromptConfigRow(updated);
  }

  async removeInterceptIntentPromptConfig(id: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findInterceptIntentPromptConfigOrThrow(id, user);
    await db.interceptIntentPromptConfig.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: 'DISABLED', isDefault: false } });
    await this.ensureDefaultInterceptIntentPromptConfig(String(existing.tenantId), user.id);
    return { success: true };
  }

  async testInterceptIntentPromptConfig(dto: TestInterceptIntentPromptConfigDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, dto.tenantId);
    const comments = this.normalizeInterceptIntentTestComments(dto.comments?.length ? dto.comments : dto.commentsText || dto.testComments);
    if (!comments.length) {
      throw new BadRequestException('请输入至少一条测试评论');
    }
    if (comments.length > MAX_INTERCEPT_INTENT_PROMPT_TEST_COMMENTS) {
      throw new BadRequestException(`单次测试最多支持 ${MAX_INTERCEPT_INTENT_PROMPT_TEST_COMMENTS} 条评论，请分多次测试`);
    }

    const robot = dto.robotId ? await this.findRobotOrThrow(dto.robotId, user) : null;
    if (robot && tenantId && String((robot as any).tenantId || '') !== tenantId) {
      throw new BadRequestException('测试机器人不属于当前租户');
    }
    const baseConfig = dto.promptConfigId
      ? await this.findInterceptIntentPromptConfigOrThrow(dto.promptConfigId, user)
      : robot
        ? await this.resolveInterceptIntentPromptConfigForRobot(robot as any, user)
        : null;
    const promptSnapshot = this.buildInterceptIntentPromptTestSnapshot(dto, baseConfig || undefined);

    const workflowId = this.resolveInterceptIntentWorkflowId((robot || { platform: promptSnapshot.platform || 'DOUYIN', config: null }) as any, promptSnapshot);
    const context = this.buildInterceptIntentAnalysisContext((robot || { platform: String(promptSnapshot.platform || 'douyin'), config: null }) as any, [], promptSnapshot);
    const batchSize = INTERCEPT_INTENT_PROMPT_TEST_BATCH_SIZE;
    const batchCount = Math.ceil(comments.length / batchSize);
    const requestPayload = {
      workflow_id: workflowId,
      batching: {
        mode: 'SEQUENTIAL',
        batchSize,
        batchCount,
        maxComments: MAX_INTERCEPT_INTENT_PROMPT_TEST_COMMENTS,
        totalTimeoutMs: INTERCEPT_INTENT_PROMPT_TEST_TOTAL_TIMEOUT_MS,
      },
      parameters: { commentCount: comments.length, ...context },
    };

    const execution = await this.runInterceptIntentPromptTestBatches({
      workflowId,
      context,
      comments,
      batchSize,
    });

    const successCount = execution.results.filter((item) => item.success !== false).length;
    const failedCount = execution.results.length - successCount;
    const partial = successCount > 0 && failedCount > 0;
    const errMsg = failedCount > 0
      ? `共 ${comments.length} 条评论，成功 ${successCount} 条，失败 ${failedCount} 条。${execution.errorMessages.length ? `失败原因：${execution.errorMessages.slice(0, 3).join('；')}` : ''}`
      : '';

    return {
      ok: failedCount === 0,
      partial,
      errMsg,
      workflowId,
      executeId: execution.executeIds[execution.executeIds.length - 1] || '',
      logId: execution.logIds[execution.logIds.length - 1] || '',
      executeIds: execution.executeIds,
      logIds: execution.logIds,
      promptConfigSnapshot: promptSnapshot,
      requestPayload,
      results: execution.results,
      resultCount: execution.results.length,
      totalCount: comments.length,
      successCount,
      failedCount,
      batchSize,
      batchCount,
      completedBatchCount: execution.completedBatchCount,
      responseRaw: {
        batching: {
          mode: 'SEQUENTIAL',
          batchSize,
          batchCount,
          completedBatchCount: execution.completedBatchCount,
          totalTimeoutMs: INTERCEPT_INTENT_PROMPT_TEST_TOTAL_TIMEOUT_MS,
        },
        batches: execution.batchTraces,
      },
    };
  }

  /**
   * 仅供“截流提示词效果测试”使用：
   * - 不写数据库、不创建分析批次、不修改捕获数据；
   * - 固定每批最多 5 条，串行调用 Coze，避免大文本批量输入导致工作流 ok=false；
   * - 固定总时间预算，避免多批同步请求把浏览器/Nginx 长连接拖到超时；
   * - 单批失败只标记该批，不影响其他批次继续返回可用测试结果。
   */
  private async runInterceptIntentPromptTestBatches(input: {
    workflowId: string;
    context: Record<string, unknown>;
    comments: Array<{ cid: string; text: string }>;
    batchSize: number;
  }) {
    type TestResult = Record<string, unknown> & {
      cid: string;
      text: string;
      raw: Record<string, unknown>;
      success: boolean;
      errorMessage?: string;
      batchIndex: number;
    };

    const groups: Array<Array<{ cid: string; text: string }>> = [];
    for (let index = 0; index < input.comments.length; index += input.batchSize) {
      groups.push(input.comments.slice(index, index + input.batchSize));
    }

    const startedAt = Date.now();
    const deadlineAt = startedAt + INTERCEPT_INTENT_PROMPT_TEST_TOTAL_TIMEOUT_MS;
    const resultByCid = new Map<string, TestResult>();
    const errorMessages: string[] = [];
    const executeIds: string[] = [];
    const logIds: string[] = [];
    const batchTraces: Array<Record<string, unknown>> = [];
    let completedBatchCount = 0;

    const pushFailure = (group: Array<{ cid: string; text: string }>, batchIndex: number, message: string) => {
      const normalizedMessage = String(message || 'Coze 未返回有效意向分析结果').trim() || 'Coze 未返回有效意向分析结果';
      errorMessages.push(normalizedMessage);
      for (const comment of group) {
        const normalized = this.normalizeCozeIntentResult({}, comment);
        resultByCid.set(comment.cid, {
          ...normalized,
          cid: comment.cid,
          text: comment.text,
          raw: { errorMessage: normalizedMessage, batchIndex },
          success: false,
          errorMessage: normalizedMessage,
          batchIndex,
        });
      }
    };

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      const batchIndex = groupIndex + 1;
      const remainingBatchCount = groups.length - groupIndex;
      const remainingMs = deadlineAt - Date.now();

      if (remainingMs <= INTERCEPT_INTENT_PROMPT_TEST_MIN_REMAINING_MS) {
        const message = '测试整体处理时间已接近上限，剩余评论未继续调用 Coze；请减少测试评论后重试';
        pushFailure(group, batchIndex, message);
        batchTraces.push({ batchIndex, size: group.length, status: 'SKIPPED_TIME_BUDGET', errorMessage: message, captureIds: group.map((item) => item.cid) });
        continue;
      }

      // 将剩余时间均摊给未处理批次，避免前面的单批占满 10 分钟导致后面的评论没有机会处理。
      const timeoutMs = Math.max(
        INTERCEPT_INTENT_PROMPT_TEST_MIN_REMAINING_MS,
        Math.floor((remainingMs - INTERCEPT_INTENT_PROMPT_TEST_MIN_REMAINING_MS) / Math.max(1, remainingBatchCount)),
      );
      const batchStartedAt = Date.now();
      try {
        const response = await this.requestInterceptIntentWorkflow({ config: null }, input.workflowId, { comments: group, ...input.context }, timeoutMs);
        if (response.executeId) executeIds.push(response.executeId);
        if (response.logId) logIds.push(response.logId);

        const businessError = this.getCozeIntentBusinessError(response.raw, response.executeId, response.logId);
        const rawResults = businessError ? [] : this.extractCozeIntentResults(response.raw);
        if (businessError || !rawResults.length) {
          const message = businessError || 'Coze 未返回任何意向分析结果';
          pushFailure(group, batchIndex, message);
          batchTraces.push({
            batchIndex,
            size: group.length,
            status: businessError ? 'COZE_BUSINESS_FAILED' : 'EMPTY_RESULT',
            provider: response.provider,
            providerFallback: response.providerFallback,
            timeoutMs,
            elapsedMs: Date.now() - batchStartedAt,
            executeId: response.executeId || '',
            logId: response.logId || '',
            errorMessage: message,
            captureIds: group.map((item) => item.cid),
            response: this.normalizeCozeJson(response.raw),
          });
          completedBatchCount += 1;
          continue;
        }

        const rawByCid = new Map<string, Record<string, unknown>>();
        rawResults.forEach((item, index) => {
          const cid = this.pickFirstText(item.cid, item.id, item.captureId, item.recordId, item.commentId, item.comment_id);
          if (cid) {
            rawByCid.set(String(cid).trim(), item);
            return;
          }
          const fallback = group[index];
          if (fallback) rawByCid.set(fallback.cid, item);
        });

        const missing: Array<{ cid: string; text: string }> = [];
        for (const comment of group) {
          const rawResult = rawByCid.get(comment.cid);
          if (!rawResult) {
            missing.push(comment);
            continue;
          }
          const normalized = this.normalizeCozeIntentResult(rawResult, comment);
          resultByCid.set(comment.cid, {
            ...normalized,
            cid: comment.cid,
            text: normalized.text || comment.text,
            raw: rawResult,
            success: true,
            batchIndex,
          });
        }

        if (missing.length) {
          const message = `Coze 返回结果缺少 ${missing.length} 条评论`;
          pushFailure(missing, batchIndex, message);
          batchTraces.push({
            batchIndex,
            size: group.length,
            status: 'PARTIAL_RESULT',
            provider: response.provider,
            providerFallback: response.providerFallback,
            timeoutMs,
            elapsedMs: Date.now() - batchStartedAt,
            executeId: response.executeId || '',
            logId: response.logId || '',
            resultCount: rawResults.length,
            missingCaptureIds: missing.map((item) => item.cid),
            captureIds: group.map((item) => item.cid),
            response: this.normalizeCozeJson(response.raw),
          });
        } else {
          batchTraces.push({
            batchIndex,
            size: group.length,
            status: 'SUCCEEDED',
            provider: response.provider,
            providerFallback: response.providerFallback,
            timeoutMs,
            elapsedMs: Date.now() - batchStartedAt,
            executeId: response.executeId || '',
            logId: response.logId || '',
            resultCount: rawResults.length,
            captureIds: group.map((item) => item.cid),
            response: this.normalizeCozeJson(response.raw),
          });
        }
        completedBatchCount += 1;
      } catch (error) {
        const message = this.getErrorMessage(error, 'Coze 意向分析工作流调用失败');
        const debug = this.extractCozeErrorDebug(error);
        pushFailure(group, batchIndex, message);
        batchTraces.push({
          batchIndex,
          size: group.length,
          status: 'REQUEST_FAILED',
          timeoutMs,
          elapsedMs: Date.now() - batchStartedAt,
          captureIds: group.map((item) => item.cid),
          errorMessage: message,
          debug: debug || undefined,
        });
        completedBatchCount += 1;
      }
    }

    const results = input.comments.map((comment, index) => {
      const result = resultByCid.get(comment.cid);
      if (result) return result;
      const message = '该评论未获得测试结果';
      const normalized = this.normalizeCozeIntentResult({}, comment);
      return {
        ...normalized,
        cid: comment.cid,
        text: comment.text,
        raw: { errorMessage: message, index },
        success: false,
        errorMessage: message,
        batchIndex: Math.floor(index / input.batchSize) + 1,
      } as TestResult;
    });

    return {
      results,
      errorMessages: Array.from(new Set(errorMessages)),
      executeIds: Array.from(new Set(executeIds)),
      logIds: Array.from(new Set(logIds)),
      batchTraces,
      completedBatchCount,
    };
  }

  async testInterceptWorkDecision(dto: TestInterceptWorkDecisionDto, user: CurrentUserPayload) {
    const baseConfig = dto.promptConfigId ? await this.findInterceptIntentPromptConfigOrThrow(dto.promptConfigId, user) : null;
    const baseSnapshot = baseConfig ? this.interceptIntentPromptConfigToSnapshot(baseConfig) : null;
    const payload = this.buildInterceptWorkDecisionPayload(dto, { promptSnapshot: baseSnapshot || undefined, robot: null });
    const workflowId = this.pickFirstText(dto.workflowId, this.configService.get<string>('COZE_INTERCEPT_WORK_DECISION_WORKFLOW_ID'));
    const requestPayload = { workflow_id: workflowId, parameters: payload };
    const binding = this.resolveInterceptAiBinding(null);
    let deepSeekFailure = '';
    if (binding.provider === 'DEEPSEEK') {
      try {
        const decision = await this.requestDeepSeekWorkDecision(payload);
        return {
          ok: true,
          errMsg: '',
          provider: 'DEEPSEEK',
          workflowId: '',
          executeId: '',
          logId: '',
          shouldRun: decision.shouldRun,
          reason: decision.reason,
          requestPayload: { provider: 'DEEPSEEK', parameters: payload },
          responseRaw: decision.raw,
        };
      } catch (error) {
        deepSeekFailure = this.getErrorMessage(error, 'DeepSeek work decision failed');
        if (!binding.fallbackToCoze) {
          return { ok: false, errMsg: deepSeekFailure, provider: 'DEEPSEEK', workflowId: '', shouldRun: false, reason: '判定调用失败', requestPayload, responseRaw: null };
        }
      }
    }
    try {
      const response = await this.requestCozeWorkflow(workflowId, payload, 'Coze 作品执行判定工作流');
      const decision = this.extractCozeWorkDecision(response.raw);
      return {
        ok: true,
        errMsg: '',
        workflowId,
        provider: 'COZE',
        ...(deepSeekFailure ? { providerFallback: { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure } } : {}),
        executeId: response.executeId,
        logId: response.logId,
        ...decision,
        requestPayload,
        responseRaw: this.normalizeCozeJson(response.raw),
      };
    } catch (error) {
      const cozeDebug = this.extractCozeErrorDebug(error);
      return {
        ok: false,
        errMsg: this.getErrorMessage(error, 'Coze 作品执行判定工作流调用失败'),
        workflowId,
        shouldRun: false,
        reason: '判定调用失败',
        requestPayload,
        responseRaw: cozeDebug?.responseRaw || null,
        cozeDebug,
      };
    }
  }

  async runInterceptWorkDecision(id: string, dto: RunInterceptWorkDecisionDto, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(id, user);
    if (robot.type !== 'INTERCEPT') {
      throw new BadRequestException('只有截流机器人可以执行作品前置判定');
    }
    const promptConfig = dto.promptConfigId
      ? await this.findInterceptIntentPromptConfigOrThrow(dto.promptConfigId, user)
      : await this.resolveInterceptIntentPromptConfigForRobot(robot as any, user);
    const promptSnapshot = this.interceptIntentPromptConfigToSnapshot(promptConfig);
    const payload = this.buildInterceptWorkDecisionPayload(dto, { promptSnapshot, robot: robot as any });
    const workflowId = this.resolveInterceptWorkDecisionWorkflowId(robot as any, dto.workflowId);
    const binding = this.resolveInterceptAiBinding(robot as any);
    if (binding.provider === 'DEEPSEEK' && !binding.accountProfileId) {
      throw new BadRequestException('DeepSeek 截流机器人必须绑定一份已启用的账号资料');
    }
    const runtimeContext = binding.accountProfileId
      ? await this.buildInterceptUnifiedContext(robot as any, binding.accountProfileId, payload)
      : null;
    const modelPayload = runtimeContext?.parameters || payload;
    const sourceRefId = this.buildInterceptWorkDecisionSourceRef(robot.id, dto.video);
    let provider: 'DEEPSEEK' | 'COZE' = binding.provider;
    let model = '';
    let fallbackUsed = false;
    let providerFallback: Record<string, unknown> | null = null;
    let shouldRun = false;
    let reason = '';
    let executeId = '';
    let logId = '';
    let responseRaw: unknown = null;
    let deepSeekFailure = '';

    if (binding.provider === 'DEEPSEEK') {
      try {
        const decision = await this.requestDeepSeekWorkDecision(modelPayload);
        shouldRun = decision.shouldRun;
        reason = decision.reason;
        model = this.pickFirstText((decision.raw as any)?.model);
        responseRaw = decision.raw;
      } catch (error) {
        deepSeekFailure = this.getErrorMessage(error, 'DeepSeek work decision failed');
        if (!binding.fallbackToCoze) {
          return {
            ok: false,
            errMsg: deepSeekFailure,
            provider: 'DEEPSEEK',
            workflowId: '',
            shouldRun: false,
            reason: '判定调用失败',
            requestPayload: { provider: 'DEEPSEEK', parameters: modelPayload },
            responseRaw: null,
          };
        }
        fallbackUsed = true;
        provider = 'COZE';
        providerFallback = { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure };
      }
    }

    if (provider === 'COZE') {
      try {
        const response = await this.requestCozeWorkflow(workflowId, modelPayload, 'Coze 作品执行判定工作流');
        const decision = this.extractCozeWorkDecision(response.raw);
        shouldRun = decision.shouldRun;
        reason = decision.reason;
        executeId = response.executeId;
        logId = response.logId;
        responseRaw = this.normalizeCozeJson(response.raw);
      } catch (error) {
        const cozeDebug = this.extractCozeErrorDebug(error);
        return {
          ok: false,
          errMsg: this.getErrorMessage(error, 'Coze 作品执行判定工作流调用失败'),
          workflowId,
          provider: 'COZE',
          ...(providerFallback ? { providerFallback } : {}),
          shouldRun: false,
          reason: '判定调用失败',
          requestPayload: { workflow_id: workflowId, parameters: modelPayload },
          responseRaw: cozeDebug?.responseRaw || null,
          cozeDebug,
        };
      }
    }

    let decisionTraceId = '';
    try {
      const account = runtimeContext?.account;
      const trace = await this.replyTraces.createDecisionTrace({
        tenantId: robot.tenantId,
        createdById: user.id,
        context: {
          sourceType: 'INTERCEPT_WORK_DECISION',
          sourceRefId,
          robotId: robot.id,
          channel: 'COMMENT',
          platform: robot.platform,
          customerMessageId: this.pickFirstText((dto.video as any)?.vid, (dto.video as any)?.id),
          postContext: this.buildInterceptRuntimeSearchText(modelPayload),
        },
        customerMessage: this.buildInterceptRuntimeSearchText(modelPayload) || '截流作品前置判定',
        accountProfileId: account?.id,
        storeProfileId: account?.storeProfileId || undefined,
        merchantRoleId: account?.merchantRoleId || undefined,
        industryNodeId: account?.industryNodeId || undefined,
        action: shouldRun ? 'SEND' : 'SKIP',
        decision: {
          shouldRun,
          reason,
          provider,
          model: model || null,
          workflowId: provider === 'COZE' ? workflowId : null,
          executeId: executeId || null,
          logId: logId || null,
          providerFallback,
        },
        provider,
        model: model || undefined,
        generationSource: 'INTERCEPT_WORK_DECISION',
        fallbackUsed,
        configurationHash: runtimeContext?.configurationHash,
        sourceRevisions: runtimeContext?.sourceRevisions,
        knowledgeEntryIds: runtimeContext?.knowledgeEntries.map((item) => item.id) || [],
      });
      decisionTraceId = trace.id;
    } catch (traceError) {
      this.logger.error(`截流作品判定追踪保存失败，保留判定结果：${this.getErrorMessage(traceError, 'unknown error')}`);
    }

    return {
      ok: true,
      errMsg: '',
      provider,
      workflowId: provider === 'COZE' ? workflowId : '',
      executeId,
      logId,
      shouldRun,
      reason,
      decisionTraceId,
      model: model || '',
      configurationHash: runtimeContext?.configurationHash || '',
      knowledgeEntryIds: runtimeContext?.knowledgeEntries.map((item) => item.id) || [],
      fallbackUsed,
      ...(providerFallback ? { providerFallback } : {}),
      requestPayload: provider === 'COZE'
        ? { workflow_id: workflowId, parameters: modelPayload }
        : { provider: 'DEEPSEEK', parameters: modelPayload },
      responseRaw,
    };
  }

  private buildInterceptWorkDecisionSourceRef(robotId: string, video: Record<string, unknown>) {
    const stable = {
      robotId,
      id: this.pickFirstText(video.vid, video.id, video.videoId),
      url: this.pickFirstText(video.url, video.contentUrl),
      title: this.pickFirstText(video.title, video.caption),
      script: this.pickFirstText(video.script).slice(0, 2000),
    };
    return `intercept-work:${createHash('sha256').update(JSON.stringify(stable)).digest('hex')}`;
  }

  async listInterceptCaptures(query: InterceptCaptureQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const where = this.buildInterceptCaptureWhere(query, tenantId);

    const [items, total] = await Promise.all([
      this.prisma.interceptCaptureRecord.findMany({
        where,
        skip,
        take,
        orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          robot: { select: { id: true, name: true, platform: true, type: true } },
        },
      }),
      this.prisma.interceptCaptureRecord.count({ where }),
    ]);
    const capturedCommentCounts = await this.buildInterceptCaptureCommentCountMap(tenantId, items);

    return {
      items: items.map((item) => ({
        ...item,
        // This is the number of records already captured by this system for the same work,
        // not the platform's public total-comment count.
        capturedCommentCount: capturedCommentCounts.get(this.interceptCaptureWorkKey(item)) || 1,
      })),
      page,
      pageSize,
      total,
    };
  }

  async listInterceptCaptureViewPresets(query: InterceptCaptureViewPresetQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, query.tenantId);
    const db = this.prisma as any;
    const items = await db.interceptCaptureViewPreset.findMany({
      where: { tenantId, userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return { items: items.map((item: any) => this.normalizeInterceptCaptureViewPreset(item)) };
  }

  async createInterceptCaptureViewPreset(dto: CreateInterceptCaptureViewPresetDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const name = this.normalizeInterceptCaptureViewPresetName(dto.name);
    const columns = this.normalizeInterceptCaptureViewPresetColumns(dto.columns);
    this.assertInterceptCaptureViewPresetHasVisibleColumn(columns);
    const db = this.prisma as any;

    const existing = await db.interceptCaptureViewPreset.findFirst({ where: { tenantId, userId: user.id, name }, select: { id: true } });
    if (existing) throw new ConflictException('同名字段预设已存在');

    const created = await this.prisma.$transaction(async (tx: any) => {
      const hasDefault = await tx.interceptCaptureViewPreset.count({ where: { tenantId, userId: user.id, isDefault: true } });
      const makeDefault = dto.isDefault === true || hasDefault === 0;
      if (makeDefault) {
        await tx.interceptCaptureViewPreset.updateMany({ where: { tenantId, userId: user.id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.interceptCaptureViewPreset.create({ data: { tenantId, userId: user.id, name, columns: this.toPlainJsonValue(columns), isDefault: makeDefault } });
    });
    return this.normalizeInterceptCaptureViewPreset(created);
  }

  async updateInterceptCaptureViewPreset(id: string, dto: UpdateInterceptCaptureViewPresetDto, user: CurrentUserPayload) {
    const existing = await this.findInterceptCaptureViewPresetOrThrow(id, user);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = this.normalizeInterceptCaptureViewPresetName(dto.name);
      const duplicate = await (this.prisma as any).interceptCaptureViewPreset.findFirst({
        where: { tenantId: existing.tenantId, userId: user.id, name, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('同名字段预设已存在');
      data.name = name;
    }
    if (dto.columns !== undefined) {
      const columns = this.normalizeInterceptCaptureViewPresetColumns(dto.columns);
      this.assertInterceptCaptureViewPresetHasVisibleColumn(columns);
      data.columns = this.toPlainJsonValue(columns);
    }
    if (!Object.keys(data).length) return this.normalizeInterceptCaptureViewPreset(existing);
    const updated = await (this.prisma as any).interceptCaptureViewPreset.update({ where: { id }, data });
    return this.normalizeInterceptCaptureViewPreset(updated);
  }

  async setDefaultInterceptCaptureViewPreset(id: string, user: CurrentUserPayload) {
    const existing = await this.findInterceptCaptureViewPresetOrThrow(id, user);
    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.interceptCaptureViewPreset.updateMany({ where: { tenantId: existing.tenantId, userId: user.id, isDefault: true }, data: { isDefault: false } });
      return tx.interceptCaptureViewPreset.update({ where: { id }, data: { isDefault: true } });
    });
    return this.normalizeInterceptCaptureViewPreset(updated);
  }

  async removeInterceptCaptureViewPreset(id: string, user: CurrentUserPayload) {
    const existing = await this.findInterceptCaptureViewPresetOrThrow(id, user);
    const db = this.prisma as any;
    const count = await db.interceptCaptureViewPreset.count({ where: { tenantId: existing.tenantId, userId: user.id } });
    if (count <= 1) throw new BadRequestException('至少保留一个字段预设');

    await this.prisma.$transaction(async (tx: any) => {
      await tx.interceptCaptureViewPreset.delete({ where: { id } });
      if (existing.isDefault) {
        const fallback = await tx.interceptCaptureViewPreset.findFirst({
          where: { tenantId: existing.tenantId, userId: user.id },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (fallback) await tx.interceptCaptureViewPreset.update({ where: { id: fallback.id }, data: { isDefault: true } });
      }
    });
    return { success: true };
  }

  async createInterceptCaptures(id: string, dto: CreateInterceptCaptureBatchDto, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(id, user);
    if (robot.type !== 'INTERCEPT') {
      throw new BadRequestException('只有截流机器人可以上报截流捕获数据');
    }

    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) {
      return { received: 0, created: 0, updated: 0, skipped: 0, failed: 0, failedRows: [] };
    }

    const now = new Date();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const failedRows: Array<Record<string, unknown>> = [];
    const analysisCaptureIds: string[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      try {
        const workDecisionEvidence = await this.resolveInterceptWorkDecisionEvidence(robot, item);
        const data = this.buildInterceptCaptureCreateData(robot, item, dto.runId, now, workDecisionEvidence);
        if (!data.commentText && data.targetType !== 'content_precheck') {
          skipped += 1;
          continue;
        }

        const existing = await this.findExistingInterceptCapture(data);
        if (existing) {
          const updateData = this.buildMissingCaptureUpdate(existing, data);
          if (Object.keys(updateData).length) {
            await this.prisma.interceptCaptureRecord.update({
              where: { id: existing.id },
              data: updateData,
            });
            analysisCaptureIds.push(existing.id);
            updated += 1;
          } else {
            skipped += 1;
          }
          continue;
        }

        const createdRecord = await this.prisma.interceptCaptureRecord.create({ data });
        analysisCaptureIds.push(createdRecord.id);
        created += 1;
      } catch (error) {
        failed += 1;
        failedRows.push(this.buildInterceptCaptureFailedRow(index, item, error));
        this.logger.warn(
          `createInterceptCaptures row failed: robotId=${robot.id}, index=${index}, error=${this.getErrorMessage(error, 'unknown error')}`,
        );
      }
    }

    await this.prisma.robot.update({
      where: { id: robot.id },
      data: {
        lastHeartbeatAt: now,
        lastError: failed > 0 ? `截流捕获同步部分失败：${failed}/${items.length}` : null,
      },
    });

    // 只对本次新增/更新的捕获数据自动进入意向分析队列。
    // 历史失败数据不再自动混入这里，必须由 PC 端点击“提取失败数据”生成待重试批次后，再手动单批/全部重试。
    const intentAnalysis = this.enqueueInterceptIntentAnalysisForCaptures(robot as any, analysisCaptureIds, user, dto.runId || undefined);

    return {
      received: items.length,
      created,
      updated,
      skipped,
      failed,
      failedRows: failedRows.slice(0, 20),
      autoRetryFailedCount: 0,
      intentAnalysis,
    };
  }

  async deleteInterceptCapture(captureId: string, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, undefined);
    const result = await this.prisma.interceptCaptureRecord.deleteMany({
      where: { id: captureId, ...(tenantId ? { tenantId } : {}) },
    });
    return { deleted: result.count };
  }

  async deleteInterceptCaptureBatch(dto: DeleteInterceptCaptureBatchDto, user: CurrentUserPayload) {
    const ids = Array.from(new Set((Array.isArray(dto.ids) ? dto.ids : []).map((item) => item?.trim()).filter(Boolean)));
    if (!ids.length) {
      return { deleted: 0 };
    }
    const tenantId = resolveTenantId(user, undefined);
    const result = await this.prisma.interceptCaptureRecord.deleteMany({
      where: { id: { in: ids }, ...(tenantId ? { tenantId } : {}) },
    });
    return { deleted: result.count };
  }

  async clearInterceptCaptures(query: InterceptCaptureQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    const where = this.buildInterceptCaptureWhere(query, tenantId);
    const result = await this.prisma.interceptCaptureRecord.deleteMany({ where });
    return { deleted: result.count };
  }

  async listInterceptIntentAnalysisBatches(query: InterceptIntentAnalysisBatchQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const failedRetryOnly = String((query as any).failedRetryOnly || '').toLowerCase() === 'true' || (query as any).failedRetryOnly === true;
    const where: Prisma.InterceptIntentAnalysisBatchWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.robotId ? { robotId: query.robotId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(failedRetryOnly ? { runId: { startsWith: INTERCEPT_FAILED_RETRY_RUN_ID_PREFIX } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.interceptIntentAnalysisBatch.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
      }),
      this.prisma.interceptIntentAnalysisBatch.count({ where }),
    ]);
    return { items: items.map((item) => this.normalizeIntentAnalysisBatchRow(item as any)), page, pageSize, total };
  }

  async detailInterceptIntentAnalysisBatch(id: string, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, undefined);
    const batch = await this.prisma.interceptIntentAnalysisBatch.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('意向分析批次不存在');
    return this.normalizeIntentAnalysisBatchRow(batch as any);
  }

  async retryInterceptIntentAnalysisBatch(id: string, dto: RetryInterceptIntentAnalysisBatchDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, undefined);
    const batch = await this.prisma.interceptIntentAnalysisBatch.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('意向分析批次不存在');

    const chunkIndexSet = new Set((dto.chunkIndexes || []).map((item) => Number(item)).filter((item) => Number.isInteger(item)));
    const chunks = (batch.chunks || []).filter((chunk) => {
      if (chunkIndexSet.size) return chunkIndexSet.has(Number(chunk.chunkIndex));
      return ['PENDING', 'FAILED', 'PARTIAL_FAILED'].includes(String(chunk.status));
    });
    if (!chunks.length) {
      return { ...this.normalizeIntentAnalysisBatchRow(batch as any), queued: false, retriedChunkCount: 0, message: '当前批次没有可重试的子批次' };
    }

    const robot = await this.findRobotOrThrow((batch as any).robotId, user);
    const promptConfig = await this.resolveInterceptIntentPromptConfigForRobot(robot as any, user);
    const promptSnapshot = this.interceptIntentPromptConfigToSnapshot(promptConfig);
    const retryWorkflowId = this.resolveInterceptIntentWorkflowId(robot as any, promptSnapshot);
    const storedContext = this.ensureJsonRecord((batch as any).requestContext);
    const context = Object.keys(storedContext).length ? storedContext : this.buildInterceptIntentAnalysisContext(robot as any, [], promptSnapshot);

    await this.prisma.interceptIntentAnalysisBatch.update({
      where: { id: (batch as any).id },
      data: {
        workflowId: retryWorkflowId,
        promptConfigId: String(promptConfig.id || ''),
        promptConfigName: String(promptConfig.name || ''),
        promptConfigSnapshot: this.toPlainJsonValue(promptSnapshot),
        requestContext: this.toPlainJsonValue(context),
        status: 'RUNNING',
        successCount: 0,
        failedCount: 0,
        errorMessage: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });
    await this.prisma.interceptIntentAnalysisChunk.updateMany({
      where: { id: { in: chunks.map((item: any) => String(item.id)) } },
      data: { status: 'PENDING', successCount: 0, failedCount: 0, errorMessage: null, executeId: null, logId: null, requestPayload: Prisma.JsonNull, responseRaw: Prisma.JsonNull, completedAt: null, updatedAt: new Date() },
    });

    const chunkIds = chunks.map((item: any) => String(item.id));
    setImmediate(() => {
      void this.runInterceptIntentAnalysisBatchRetryAsync(String((batch as any).id), chunkIds, user).catch((error: Error) => {
        this.logger.error(`retryInterceptIntentAnalysisBatch async failed: batchId=${batch.id}, error=${error.message}`);
      });
    });

    const updated = await this.prisma.interceptIntentAnalysisBatch.findUnique({
      where: { id: String((batch as any).id) },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
    return {
      ...this.normalizeIntentAnalysisBatchRow((updated || batch) as any),
      queued: true,
      async: true,
      retriedChunkCount: chunks.length,
      message: `已提交 ${chunks.length} 个子批次到后台分析队列，接口不会等待 Coze 分析完成`,
    };
  }

  private async runInterceptIntentAnalysisBatchRetryAsync(batchId: string, chunkIds: string[], user: CurrentUserPayload) {
    const batch = await this.prisma.interceptIntentAnalysisBatch.findUnique({
      where: { id: batchId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
    if (!batch) return;
    const robot = await this.findRobotOrThrow((batch as any).robotId, user);
    const context = this.ensureJsonRecord((batch as any).requestContext);
    const chunkIdSet = new Set(chunkIds.filter(Boolean));
    const chunks = (batch.chunks || []).filter((chunk: any) => chunkIdSet.has(String(chunk.id)));
    for (const chunk of chunks as any[]) {
      const captureIds = this.normalizeStringArray(chunk.captureIds);
      if (!captureIds.length) continue;
      await this.prisma.interceptIntentAnalysisChunk.update({
        where: { id: chunk.id },
        data: { status: 'RUNNING', successCount: 0, failedCount: 0, errorMessage: null, retryCount: { increment: 1 }, updatedAt: new Date() },
      });
      await this.executeIntentAnalysisChunk(robot as any, batch as any, chunk as any, captureIds, context, user);
      await this.refreshIntentAnalysisBatchCounters(batchId);
    }
    await this.refreshIntentAnalysisBatchCounters(batchId);
  }


  async retryFailedInterceptCaptureAnalysis(dto: RetryFailedInterceptCaptureAnalysisDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, dto.tenantId);
    const limit = Math.max(1, Math.min(Number(dto.limit || 500), 1000));
    const query = {
      keyword: dto.keyword,
      robotId: dto.robotId,
      platform: dto.platform,
      intentLevel: dto.intentLevel,
      analysisStatus: 'FAILED',
    } as InterceptCaptureQueryDto;
    const where = this.buildInterceptCaptureWhere(query, tenantId);
    const runningRetryBatch = await this.prisma.interceptIntentAnalysisBatch.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        runId: { startsWith: INTERCEPT_FAILED_RETRY_RUN_ID_PREFIX },
        status: 'RUNNING',
      },
      select: { id: true, batchNo: true },
    });
    if (runningRetryBatch) {
      throw new BadRequestException(`已有失败数据重析批次正在执行（${runningRetryBatch.batchNo}），请等待完成后再重新提取`);
    }

    // “提取失败数据”是临时生成待重试批次，不保留历史；每次提取都先清空旧的失败重析批次，避免重复追加。
    const clearedRetryBatches = await this.prisma.interceptIntentAnalysisBatch.deleteMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        runId: { startsWith: INTERCEPT_FAILED_RETRY_RUN_ID_PREFIX },
      },
    });

    const rows = await this.prisma.interceptCaptureRecord.findMany({
      where,
      take: limit,
      orderBy: [{ capturedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, robotId: true },
    });

    if (!rows.length) {
      return {
        queued: false,
        staged: false,
        captureCount: 0,
        robotCount: 0,
        batchCount: 0,
        clearedBatchCount: clearedRetryBatches.count,
        message: clearedRetryBatches.count > 0 ? `已清空 ${clearedRetryBatches.count} 个旧待重试批次，当前筛选条件下没有分析失败的数据` : '当前筛选条件下没有分析失败的数据',
      };
    }

    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const ids = grouped.get(row.robotId) || [];
      ids.push(row.id);
      grouped.set(row.robotId, ids);
    }

    const batchSize = DEFAULT_INTERCEPT_INTENT_BATCH_SIZE;
    const batches: Array<{ id: string; batchNo: string; robotId: string; captureCount: number }> = [];
    const runSeed = `${INTERCEPT_FAILED_RETRY_RUN_ID_PREFIX}_${Date.now()}`;
    let sequence = 0;
    for (const [robotId, captureIds] of grouped.entries()) {
      const robot = await this.findRobotOrThrow(robotId, user);
      for (let i = 0; i < captureIds.length; i += batchSize) {
        sequence += 1;
        const batch = await this.createPendingFailedRetryIntentAnalysisBatch(robot as any, captureIds.slice(i, i + batchSize), user, `${runSeed}_${sequence}`);
        batches.push({ id: batch.id, batchNo: batch.batchNo, robotId, captureCount: batch.captureCount });
      }
    }

    return {
      queued: false,
      staged: true,
      async: false,
      captureCount: rows.length,
      robotCount: grouped.size,
      batchCount: batches.length,
      clearedBatchCount: clearedRetryBatches.count,
      batchSize,
      batches,
      message: `已清空 ${clearedRetryBatches.count} 个旧待重试批次，重新提取 ${rows.length} 条分析失败数据，按每批 ${batchSize} 条生成 ${batches.length} 个待重试批次，请在批次列表中手动重试`,
    };
  }

  private async createPendingFailedRetryIntentAnalysisBatch(
    robot: { id: string; tenantId: string; platform: string; config?: Prisma.JsonValue | null },
    captureIds: string[],
    user: CurrentUserPayload,
    runId: string,
  ) {
    const uniqueIds = Array.from(new Set((captureIds || []).filter(Boolean)));
    if (!uniqueIds.length) throw new BadRequestException('没有可提取的失败数据');
    const captures = await this.prisma.interceptCaptureRecord.findMany({
      where: { id: { in: uniqueIds }, tenantId: robot.tenantId, robotId: robot.id, commentText: { not: null } },
      orderBy: { capturedAt: 'asc' },
    });
    const analyzableIds = captures.filter((item) => String(item.commentText || '').trim()).map((item) => item.id);
    if (!analyzableIds.length) throw new BadRequestException('失败数据没有可分析评论文本');

    const promptConfig = await this.resolveInterceptIntentPromptConfigForRobot(robot as any, user);
    const promptSnapshot = this.interceptIntentPromptConfigToSnapshot(promptConfig);
    const workflowId = this.resolveInterceptIntentWorkflowId(robot, promptSnapshot);
    const context = this.buildInterceptIntentAnalysisContext(robot, captures as any[], promptSnapshot);
    const batchId = randomUUID();
    const batchNo = `IAB${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}${randomUUID().slice(0, 4).toUpperCase()}`;
    const chunkId = randomUUID();
    const now = new Date();

    await this.prisma.interceptIntentAnalysisBatch.create({
      data: {
        id: batchId,
        batchNo,
        tenantId: robot.tenantId,
        robotId: robot.id,
        runId,
        workflowId,
        promptConfigId: String(promptConfig.id || ''),
        promptConfigName: String(promptConfig.name || ''),
        promptConfigSnapshot: this.toPlainJsonValue(promptSnapshot),
        status: 'PENDING',
        totalCount: analyzableIds.length,
        successCount: 0,
        failedCount: 0,
        batchSize: DEFAULT_INTERCEPT_INTENT_BATCH_SIZE,
        requestContext: this.toPlainJsonValue({ ...context, failedRetryOnly: true }),
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        chunks: {
          create: {
            id: chunkId,
            chunkIndex: 1,
            status: 'PENDING',
            captureIds: this.toPlainJsonValue(analyzableIds),
            successCount: 0,
            failedCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    });
    return { id: batchId, batchNo, captureCount: analyzableIds.length };
  }


  private enqueueInterceptIntentAnalysisForCaptures(
    robot: { id: string; tenantId: string; platform: string; config?: Prisma.JsonValue | null },
    captureIds: string[],
    user: CurrentUserPayload,
    runId?: string,
  ) {
    const uniqueIds = Array.from(new Set((captureIds || []).filter(Boolean)));
    if (!uniqueIds.length) {
      return { queued: false, skipped: true, reason: '本次没有新增、更新或待重试的捕获数据' };
    }

    setImmediate(() => {
      void this.runInterceptIntentAnalysisForCaptures(robot, uniqueIds, user, runId).catch((error: Error) => {
        this.logger.error(`runInterceptIntentAnalysisForCaptures failed: robotId=${robot.id}, runId=${runId || ''}, captureCount=${uniqueIds.length}, error=${error.message}`);
      });
    });

    return {
      queued: true,
      async: true,
      captureCount: uniqueIds.length,
      message: '截流捕获数据已入库，评论意向分析已进入后端异步执行队列',
    };
  }

  private async collectFailedIntentAnalysisCaptureIdsForAutoRetry(
    robot: { id: string; tenantId: string },
    excludeIds: string[] = [],
  ) {
    const excluded = Array.from(new Set(excludeIds.filter(Boolean)));
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id"
       FROM "InterceptCaptureRecord"
       WHERE "tenantId" = $1
         AND "robotId" = $2
         AND "commentText" IS NOT NULL
         AND COALESCE("raw"->>'intentAnalysisStatus', '') = 'FAILED'
         AND (cardinality($3::text[]) = 0 OR NOT ("id" = ANY($3::text[])))
       ORDER BY "capturedAt" ASC, "createdAt" ASC
       LIMIT 300`,
      robot.tenantId,
      robot.id,
      excluded,
    );
    return rows.map((item) => String(item.id)).filter(Boolean);
  }

  private async runInterceptIntentAnalysisForCaptures(
    robot: { id: string; tenantId: string; platform: string; config?: Prisma.JsonValue | null },
    captureIds: string[],
    user: CurrentUserPayload,
    runId?: string,
  ) {
    const uniqueIds = Array.from(new Set((captureIds || []).filter(Boolean)));
    if (!uniqueIds.length) {
      return { skipped: true, reason: '本次没有新增或更新的捕获数据' };
    }

    const captures = await this.prisma.interceptCaptureRecord.findMany({
      where: { id: { in: uniqueIds }, tenantId: robot.tenantId, robotId: robot.id, commentText: { not: null } },
      orderBy: { capturedAt: 'asc' },
    });
    const analyzable = captures.filter((item) => String(item.commentText || '').trim());
    if (!analyzable.length) {
      return { skipped: true, reason: '本次捕获数据没有可分析的评论文本' };
    }

    const promptConfig = await this.resolveInterceptIntentPromptConfigForRobot(robot as any, user);
    const promptSnapshot = this.interceptIntentPromptConfigToSnapshot(promptConfig);
    const workflowId = this.resolveInterceptIntentWorkflowId(robot, promptSnapshot);
    const batchSize = this.resolveInterceptIntentBatchSize(robot, promptSnapshot);
    const context = this.buildInterceptIntentAnalysisContext(robot, analyzable as any[], promptSnapshot);
    const batchId = randomUUID();
    const batchNo = `IAB${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}${randomUUID().slice(0, 4).toUpperCase()}`;
    const now = new Date();

    await this.prisma.interceptIntentAnalysisBatch.create({
      data: {
        id: batchId,
        batchNo,
        tenantId: robot.tenantId,
        robotId: robot.id,
        runId: runId || null,
        workflowId,
        promptConfigId: String(promptConfig.id || ''),
        promptConfigName: String(promptConfig.name || ''),
        promptConfigSnapshot: this.toPlainJsonValue(promptSnapshot),
        status: 'RUNNING',
        totalCount: analyzable.length,
        successCount: 0,
        failedCount: 0,
        batchSize,
        requestContext: this.toPlainJsonValue(context),
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      },
    });

    let chunkIndex = 0;
    for (let i = 0; i < analyzable.length; i += batchSize) {
      chunkIndex += 1;
      const chunkCaptures = analyzable.slice(i, i + batchSize);
      const chunkId = randomUUID();
      await this.prisma.interceptIntentAnalysisChunk.create({
        data: {
          id: chunkId,
          analysisBatchId: batchId,
          chunkIndex,
          status: 'PENDING',
          captureIds: this.toPlainJsonValue(chunkCaptures.map((item) => item.id)),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const batch = await this.prisma.interceptIntentAnalysisBatch.findUnique({
      where: { id: batchId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('意向分析批次创建失败');

    for (const chunk of batch.chunks as any[]) {
      const chunkCaptureIds = this.normalizeStringArray(chunk.captureIds);
      await this.prisma.interceptIntentAnalysisChunk.update({ where: { id: chunk.id }, data: { status: 'RUNNING', updatedAt: new Date() } });
      await this.executeIntentAnalysisChunk(robot, batch as any, chunk as any, chunkCaptureIds, context, user);
    }

    const completed = await this.refreshIntentAnalysisBatchCounters(batchId);
    return this.normalizeIntentAnalysisBatchRow(completed as any);
  }

  private async executeIntentAnalysisChunk(
    robot: { id: string; tenantId: string; platform: string; config?: Prisma.JsonValue | null },
    batch: IntentAnalysisBatchRow,
    chunk: IntentAnalysisChunkRow,
    captureIds: string[],
    context: Record<string, unknown>,
    user: CurrentUserPayload,
  ) {
    const captures = await this.prisma.interceptCaptureRecord.findMany({
      where: { id: { in: captureIds }, tenantId: robot.tenantId, robotId: robot.id },
      orderBy: { capturedAt: 'asc' },
    });
    const analyzableCaptures = (captures as any[]).filter((item) => String(item.commentText || '').trim());
    const comments = analyzableCaptures.map((item) => ({ cid: item.id, text: String(item.commentText || '').trim() }));

    if (!comments.length) {
      await this.prisma.interceptIntentAnalysisChunk.update({
        where: { id: String(chunk.id) },
        data: { status: 'SKIPPED', failedCount: 0, successCount: 0, errorMessage: '子批次没有可分析评论', completedAt: new Date(), updatedAt: new Date() },
      });
      return { successCount: 0, failedCount: 0 };
    }

    const captureMap = new Map<string, InterceptCaptureRow>();
    for (const capture of analyzableCaptures as any[]) captureMap.set(String(capture.id), capture as any);

    const attempts: Array<Record<string, unknown>> = [];
    const failedMessages = new Map<string, string>();
    let successCount = 0;
    let failedCount = 0;

    const splitInto = <T>(items: T[], size: number) => {
      const groups: T[][] = [];
      for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
      return groups;
    };

    const nextRetrySize = (size: number) => {
      if (size > 10) return 10;
      if (size > 5) return 5;
      return 1;
    };

    const summarizeRaw = (raw: unknown) => {
      const record = this.ensureJsonRecord(raw);
      const normalizedData = this.normalizeCozeJson(record.data);
      return {
        code: record.code,
        msg: record.msg,
        execute_id: record.execute_id,
        debug_url: record.debug_url,
        logid: this.pickFirstText((record.detail as any)?.logid),
        data: normalizedData,
      };
    };

    const markFinalFailed = async (group: Array<{ cid: string; text: string }>, message: string, executeId?: string, logId?: string) => {
      for (const item of group) {
        const capture = captureMap.get(item.cid);
        if (!capture) continue;
        failedCount += 1;
        failedMessages.set(item.cid, message);
        await this.markCaptureIntentAnalysisFailed(capture, batch, chunk, message, executeId, logId);
      }
    };

    const analyzeGroup = async (group: Array<{ cid: string; text: string }>, depth = 0, reason = ''): Promise<void> => {
      if (!group.length) return;
      const parameters = { comments: group, ...context };
      const attemptBase: Record<string, unknown> = {
        depth,
        size: group.length,
        captureIds: group.map((item) => item.cid),
        fallbackReason: reason,
      };

      try {
        const response = await this.requestInterceptIntentWorkflow(robot, String(batch.workflowId), parameters);
        const businessError = this.getCozeIntentBusinessError(response.raw, response.executeId, response.logId);
        const results = businessError ? [] : this.extractCozeIntentResults(response.raw);
        attempts.push({
          ...attemptBase,
          status: businessError ? 'MODEL_BUSINESS_FAILED' : 'MODEL_RETURNED',
          provider: response.provider,
          providerFallback: response.providerFallback,
          executeId: response.executeId || '',
          logId: response.logId || '',
          resultCount: results.length,
          errorMessage: businessError || '',
          response: summarizeRaw(response.raw),
        });

        if (businessError || !results.length) {
          const message = businessError || 'Coze 未返回任何意向分析结果';
          if (group.length > 1) {
            const childSize = nextRetrySize(group.length);
            for (const child of splitInto(group, childSize)) await analyzeGroup(child, depth + 1, message);
            return;
          }
          await markFinalFailed(group, message, response.executeId, response.logId);
          return;
        }

        const resultMap = new Map<string, Record<string, unknown>>();
        results.forEach((result, index) => {
          const cid = this.pickFirstText(result.cid, result.id, result.captureId, result.recordId, result.commentId, result.comment_id);
          if (cid) {
            resultMap.set(String(cid).trim(), result);
            return;
          }
          const fallbackCid = group[index]?.cid;
          if (fallbackCid) resultMap.set(fallbackCid, result);
        });

        const missing: Array<{ cid: string; text: string }> = [];
        for (const item of group) {
          const capture = captureMap.get(item.cid);
          if (!capture) continue;
          const result = resultMap.get(item.cid);
          if (!result) {
            missing.push(item);
            continue;
          }
          await this.applyIntentAnalysisResultToCapture(capture, result, batch, chunk, user, {
            executeId: response.executeId,
            logId: response.logId,
            provider: response.provider,
            providerFallback: response.providerFallback,
            runtimeContext: response.runtimeContext,
            requestContext: context,
          });
          successCount += 1;
        }

        if (missing.length) {
          const message = `Coze 返回结果缺少 ${missing.length} 条评论`;
          if (missing.length < group.length && group.length > 1) {
            await analyzeGroup(missing, depth + 1, message);
            return;
          }
          if (missing.length > 1) {
            const childSize = nextRetrySize(missing.length);
            for (const child of splitInto(missing, childSize)) await analyzeGroup(child, depth + 1, message);
            return;
          }
          await markFinalFailed(missing, 'Coze 未返回该评论的分析结果', response.executeId, response.logId);
        }
      } catch (error) {
        const message = this.getErrorMessage(error, 'Coze 意向分析工作流调用失败');
        attempts.push({
          ...attemptBase,
          status: 'REQUEST_FAILED',
          errorMessage: message,
        });
        if (group.length > 1) {
          const childSize = nextRetrySize(group.length);
          for (const child of splitInto(group, childSize)) await analyzeGroup(child, depth + 1, message);
          return;
        }
        await markFinalFailed(group, message);
      }
    };

    await analyzeGroup(comments, 0);

    const status = failedCount > 0 ? (successCount > 0 ? 'PARTIAL_FAILED' : 'FAILED') : 'SUCCEEDED';
    const finalError = failedCount > 0 ? `有 ${failedCount} 条评论最终分析失败${failedMessages.size ? `：${Array.from(new Set(failedMessages.values())).slice(0, 3).join('；')}` : ''}` : null;
    await this.prisma.interceptIntentAnalysisChunk.update({
      where: { id: String(chunk.id) },
      data: {
        status,
        successCount,
        failedCount,
        executeId: this.pickFirstText([...attempts].reverse().find((item) => item.executeId)?.executeId) || null,
        logId: this.pickFirstText([...attempts].reverse().find((item) => item.logId)?.logId) || null,
        errorMessage: finalError,
        requestPayload: this.toPlainJsonValue({ workflow_id: batch.workflowId, parameters: { comments, ...context }, adaptiveSplit: true }),
        responseRaw: this.toPlainJsonValue({ adaptiveSplit: true, attemptCount: attempts.length, attempts }),
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return { successCount, failedCount };
  }

  private async requestCozeIntentWorkflow(workflowId: string, parameters: Record<string, unknown>, timeoutMs?: number) {
    return this.requestCozeWorkflow(workflowId, parameters, 'Coze 评论意向分析工作流', timeoutMs);
  }

  private resolveInterceptAiBinding(robot?: { config?: Prisma.JsonValue | null } | null) {
    const root = this.ensureJsonRecord(robot?.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const binding = this.ensureJsonRecord(intercept.aiBinding);
    const provider = String(binding.provider || 'DEEPSEEK').trim().toUpperCase() === 'COZE' ? 'COZE' : 'DEEPSEEK';
    return {
      provider: provider as 'COZE' | 'DEEPSEEK',
      accountProfileId: this.pickFirstText(binding.accountProfileId),
      fallbackToCoze: binding.fallbackToCoze !== false,
    };
  }

  private async requestInterceptIntentWorkflow(
    robot: { tenantId?: string; config?: Prisma.JsonValue | null },
    workflowId: string,
    parameters: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<{
    raw: Record<string, unknown>;
    executeId: string;
    logId: string;
    provider: 'DEEPSEEK' | 'COZE';
    providerFallback: Record<string, unknown> | null;
    runtimeContext: any;
  }> {
    const binding = this.resolveInterceptAiBinding(robot);
    if (binding.provider === 'DEEPSEEK' && !binding.accountProfileId) {
      throw new BadRequestException('DeepSeek 截流机器人必须绑定一份已启用的账号资料');
    }
    const runtimeContext = binding.accountProfileId
      ? await this.buildInterceptUnifiedContext(robot, binding.accountProfileId, parameters)
      : null;
    const modelParameters = runtimeContext?.parameters || parameters;
    if (binding.provider === 'DEEPSEEK') {
      try {
        const raw = await this.requestDeepSeekIntentAnalysis(modelParameters, timeoutMs);
        return { raw, executeId: '', logId: '', provider: 'DEEPSEEK', providerFallback: null, runtimeContext };
      } catch (error) {
        if (!binding.fallbackToCoze) throw error;
        const fallback = await this.requestCozeIntentWorkflow(workflowId, modelParameters, timeoutMs);
        return {
          ...fallback,
          provider: 'COZE',
          providerFallback: {
            from: 'DEEPSEEK',
            to: 'COZE',
            reason: this.getErrorMessage(error, 'DeepSeek intent analysis failed'),
          },
          runtimeContext,
        };
      }
    }
    return {
      ...(await this.requestCozeIntentWorkflow(workflowId, modelParameters, timeoutMs)),
      provider: 'COZE',
      providerFallback: null,
      runtimeContext,
    };
  }

  private async buildInterceptUnifiedContext(
    robot: { tenantId?: string },
    accountProfileId: string,
    parameters: Record<string, unknown>,
  ) {
    if (!robot.tenantId || !accountProfileId) throw new BadRequestException('截流机器人缺少账号资料作用域');
    const account = await this.prisma.customerServiceAccountProfile.findFirst({
      where: { id: accountProfileId, tenantId: robot.tenantId, status: 'ENABLED', deletedAt: null },
      include: { storeProfile: true, merchantRole: { include: { industryNode: true } }, industryNode: true },
    });
    if (!account) throw new BadRequestException('截流机器人绑定的账号资料不存在、已停用或不属于当前租户');
    if (!account.merchantRoleId || !account.merchantRole || account.merchantRole.status !== 'ENABLED') {
      throw new BadRequestException('截流机器人绑定的账号资料必须关联已启用的客服角色');
    }
    const resolvedIndustry = account.industryNode || account.merchantRole?.industryNode || null;
    const scopeResolution = resolveCustomerServiceEffectiveBusinessScope({
      tenantId: robot.tenantId,
      merchantRoleId: account.merchantRoleId,
      roleIndustryNodeId: account.merchantRole?.industryNodeId || null,
      accountProfileId: account.id,
      accountMerchantRoleId: account.merchantRoleId,
      accountStoreProfileId: account.storeProfileId || null,
      accountIndustryNodeId: account.industryNodeId || null,
      storeProfileId: account.storeProfileId || null,
      industryNodeId: resolvedIndustry?.id || null,
      industryCode: resolvedIndustry?.code || null,
    });
    if (scopeResolution.issueKeys.length) {
      throw new BadRequestException({
        code: 'BUSINESS_SCOPE_INVARIANT_FAILED',
        message: '截流机器人账号的角色、店铺或行业绑定不一致，请修正配置后重试',
        issueKeys: scopeResolution.issueKeys,
      });
    }
    const searchText = this.buildInterceptRuntimeSearchText(parameters);
    const knowledgeSelection = await this.knowledgeEntries.selectForRuntimeDetailed({
      tenantId: robot.tenantId,
      accountProfileId: account.id,
      storeProfileId: account.storeProfileId || undefined,
      merchantRoleId: account.merchantRoleId || undefined,
      message: searchText,
      scenario: 'INTERCEPT_OUTREACH',
      intent: 'LEAD_QUALIFICATION',
      topics: ['竞品截流', '主动私信', '线索识别'],
      businessScope: scopeResolution.scope,
    });
    const knowledgeEntries = knowledgeSelection.selected;
    const sourceRevisions = {
      interceptUnifiedRuntime: 2,
      businessScopeFingerprint: scopeResolution.scope.fingerprint,
      accountProfile: { id: account.id, revision: account.revision },
      storeProfile: account.storeProfile ? { id: account.storeProfile.id, revision: account.storeProfile.revision } : null,
      merchantRole: account.merchantRole ? { id: account.merchantRole.id, revision: account.merchantRole.revision } : null,
      industryNode: resolvedIndustry ? { id: resolvedIndustry.id, revision: resolvedIndustry.revision } : null,
      knowledgeEntries: knowledgeEntries.map((item) => ({ id: item.id, revision: item.revision })),
    };
    const configurationHash = createHash('sha256').update(JSON.stringify(sourceRevisions)).digest('hex');
    return {
      parameters: {
        ...parameters,
        accountKnowledge: {
          id: account.id,
          name: account.name,
          channel: account.channel,
          description: account.description,
          profile: account.profile,
          store: account.storeProfile ? { id: account.storeProfile.id, name: account.storeProfile.name, profile: account.storeProfile.profile } : null,
          role: account.merchantRole ? {
            id: account.merchantRole.id,
            code: account.merchantRole.code,
            name: account.merchantRole.name,
            description: account.merchantRole.description,
            publicIdentity: account.merchantRole.publicIdentity,
          } : null,
          industry: resolvedIndustry ? { id: resolvedIndustry.id, name: resolvedIndustry.name, path: resolvedIndustry.path } : null,
          businessScope: scopeResolution.scope,
          knowledgeSelection: {
            scopeRejected: knowledgeSelection.scopeRejected,
            budgetEvicted: knowledgeSelection.budgetEvicted,
          },
          knowledgeEntries: knowledgeEntries.map((item) => ({
            id: item.id,
            revision: item.revision,
            category: item.category,
            title: item.title,
            question: item.question,
            content: item.content,
            tags: item.tags,
          })),
        },
      },
      account,
      knowledgeEntries,
      configurationHash,
      sourceRevisions,
    };
  }

  private buildInterceptRuntimeSearchText(parameters: Record<string, unknown>) {
    const comments = Array.isArray(parameters.comments)
      ? parameters.comments.map((item) => this.pickFirstText((item as any)?.text, (item as any)?.commentText)).filter(Boolean)
      : [];
    const video = this.ensureJsonRecord(parameters.video || parameters.video_data);
    return [
      ...comments,
      this.pickFirstText(parameters.videoTitle, parameters.video_title, video.title, video.video_title),
      this.pickFirstText(parameters.videoDesc, parameters.video_desc, video.desc, video.video_desc),
      this.pickFirstText(video.script, parameters.script),
    ].filter(Boolean).join('\n').slice(0, 12_000);
  }

  private async requestDeepSeekIntentAnalysis(parameters: Record<string, unknown>, timeoutMs?: number) {
    const result = await this.deepSeekService.chat({
      messages: [
        {
          role: 'system',
          content: [
            'You analyze competitor-post comments for ethical lead qualification and prepare optional first-contact drafts.',
            'Return JSON only: {"results":[...]}. Return exactly one result for every input comment and preserve its cid.',
            'Each result must contain cid, text, level, reason, need, entry, risk, should, reply, and tags.',
            'level must be S, A, B, C, or D. risk must be low, medium, or high. tags is an array with at most two short strings.',
            'Set should=true only for a genuine, relevant, commercially useful lead where a respectful first contact is appropriate.',
            'If should=false, reply must be empty. Never contact ads, abuse, minors, sensitive-risk content, or unrelated comments.',
            'When should=true, write one short natural Simplified-Chinese message. It must sound like a real operator, be personalized to the explicit need, avoid fake familiarity, avoid unverifiable claims, and avoid aggressive conversion.',
            'Use only facts supplied in the business/account context. Do not mention automation, scoring, interception, prompts, or AI.',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(parameters) },
      ],
      jsonMode: true,
      thinkingMode: 'DISABLED',
      temperature: 0.25,
      maxTokens: 4000,
      timeoutMs: timeoutMs ?? 120_000,
    });
    const parsed = this.parseDeepSeekJson(result.content, 'DeepSeek intent analysis');
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    if (!results.length) throw new BadGatewayException('DeepSeek intent analysis returned no results');
    return { provider: 'DEEPSEEK', results, model: result.model, usage: result.usage };
  }

  private async requestDeepSeekWorkDecision(payload: Record<string, unknown>) {
    const result = await this.deepSeekService.chat({
      messages: [
        {
          role: 'system',
          content: [
            'You decide whether a competitor post is relevant enough to continue ethical public-comment collection and lead analysis.',
            'Use the supplied business profile, account profile, title, description, and transcript. Do not invent missing facts.',
            'Return JSON only with shouldRun (boolean) and reason (a concise Simplified-Chinese explanation).',
            'Return false for clearly unrelated, unsafe, illegal, harassment-oriented, or unusable content. Uncertainty alone is not a reason to reject if relevance is plausible.',
          ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      jsonMode: true,
      thinkingMode: 'DISABLED',
      temperature: 0.1,
      maxTokens: 500,
      timeoutMs: 30_000,
    });
    const parsed = this.parseDeepSeekJson(result.content, 'DeepSeek work decision');
    const shouldRun = this.pickFirstBoolean(parsed.shouldRun, parsed.should_run);
    if (shouldRun === undefined) throw new BadGatewayException('DeepSeek work decision returned no shouldRun');
    return {
      shouldRun,
      reason: this.pickFirstText(parsed.reason) || (shouldRun ? '作品与目标业务相关，建议继续' : '作品与目标业务无关，建议跳过'),
      raw: { provider: 'DEEPSEEK', ...parsed, model: result.model, usage: result.usage },
    };
  }

  private parseDeepSeekJson(content: string, label: string): Record<string, unknown> {
    const normalized = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      const parsed = JSON.parse(normalized);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      const start = normalized.indexOf('{');
      const end = normalized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(normalized.slice(start, end + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          // Use one stable error below.
        }
      }
    }
    throw new BadGatewayException(`${label} returned invalid JSON`);
  }

  private async requestCozeWorkflow(workflowId: string, parameters: Record<string, unknown>, label = 'Coze 工作流', timeoutMsOverride?: number) {
    const baseUrl = String(this.configService.get<string>('COZE_API_BASE_URL') || 'https://api.coze.cn').replace(/\/$/, '');
    const tokenInfo = this.resolveCozeAccessTokenWithMeta();
    const endpoint = `${baseUrl}/v1/workflow/run`;
    const baseDebug = {
      label,
      baseUrl,
      endpoint,
      workflowId,
      // 默认 10 分钟；提示词测试分批时可传入更小的单批预算，保证整次同步测试不被 Nginx 提前断开。
      timeoutMs: this.resolvePositiveInt(timeoutMsOverride, this.resolvePositiveInt(this.configService.get<string>('COZE_COMMENT_INTENT_TIMEOUT_MS'), 600_000)),
      tokenSource: tokenInfo.source,
      tokenFingerprint: tokenInfo.fingerprint,
      tokenLength: tokenInfo.length,
      configuredTokenSources: tokenInfo.configuredSources,
    };
    if (!tokenInfo.token) {
      throw new CozeWorkflowRequestError('Coze 令牌缺失，请配置 COZE_SERVICE_ACCESS_TOKEN、COZE_PERSONAL_ACCESS_TOKEN 或 COZE_API_PAT', {
        ...baseDebug,
        failureStage: 'resolve_token',
      });
    }
    if (!workflowId) {
      throw new CozeWorkflowRequestError(`${label} ID 缺失`, {
        ...baseDebug,
        failureStage: 'resolve_workflow_id',
      });
    }
    const timeoutMs = Number(baseDebug.timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenInfo.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, parameters }),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error && error.name === 'AbortError'
        ? `${label}调用超时（${timeoutMs}ms）`
        : this.getErrorMessage(error, `${label}请求失败`);
      throw new CozeWorkflowRequestError(message, {
        ...baseDebug,
        failureStage: error instanceof Error && error.name === 'AbortError' ? 'request_timeout' : 'request_failed',
        networkErrorName: error instanceof Error ? error.name : '',
        networkErrorMessage: this.getErrorMessage(error, ''),
      });
    } finally {
      clearTimeout(timer);
    }

    const responseText = await response.text().catch(() => '');
    let raw: Record<string, unknown> = {};
    try {
      raw = responseText ? JSON.parse(responseText) : {};
    } catch {
      raw = {};
    }
    const cozeCode = Number((raw as any)?.code ?? 0);
    const executeId = String((raw as any)?.execute_id || '');
    const logId = String((raw as any)?.detail?.logid || (raw as any)?.detail?.log_id || (raw as any)?.logid || '');
    const debug = {
      ...baseDebug,
      failureStage: response.ok && cozeCode === 0 ? 'none' : 'coze_response_failed',
      httpStatus: response.status,
      httpStatusText: response.statusText,
      cozeCode: (raw as any)?.code ?? null,
      cozeMsg: (raw as any)?.msg || (raw as any)?.message || '',
      executeId,
      logId,
      responseRaw: this.normalizeCozeJson(raw),
      responseTextPreview: responseText && Object.keys(raw).length === 0 ? responseText.slice(0, 1000) : '',
    };
    if (!response.ok || cozeCode !== 0) {
      const message = String((raw as any)?.msg || (raw as any)?.message || response.statusText || `${label}调用失败`);
      throw new CozeWorkflowRequestError(message, debug);
    }
    return {
      raw,
      executeId,
      logId,
      debug,
    };
  }

  private normalizeCozeJson(value: unknown, depth = 0): unknown {
    if (depth > 6) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return value;
      try {
        return this.normalizeCozeJson(JSON.parse(trimmed), depth + 1);
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) return value.map((item) => this.normalizeCozeJson(item, depth + 1));
    if (value && typeof value === 'object') {
      const next: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) next[key] = this.normalizeCozeJson(item, depth + 1);
      return next;
    }
    return value;
  }

  private getCozeIntentBusinessError(raw: unknown, executeId?: string, logId?: string): string {
    const normalized = this.normalizeCozeJson(raw);
    const outer = this.ensureJsonRecord(normalized);
    const candidates: Record<string, unknown>[] = [];
    const collectRecords = (value: unknown, depth = 0) => {
      if (depth > 8 || value == null) return;
      const current = this.normalizeCozeJson(value, depth + 1);
      if (Array.isArray(current)) {
        for (const item of current) collectRecords(item, depth + 1);
        return;
      }
      if (!current || typeof current !== 'object') return;
      const record = current as Record<string, unknown>;
      candidates.push(record);
      for (const key of ['data', 'output', 'outputs', 'result', 'results']) collectRecords(record[key], depth + 1);
    };
    collectRecords(normalized);
    const failed = candidates.find((item) => item.ok === false || String(item.ok ?? '').toLowerCase() === 'false');
    if (!failed) return '';
    const errMsg = this.pickFirstText(failed.errMsg, failed.errorMessage, failed.message, failed.msg, outer.msg, outer.message);
    const debugUrl = this.pickFirstText(outer.debug_url, (failed as any).debug_url);
    const resolvedExecuteId = this.pickFirstText(executeId, outer.execute_id, (failed as any).execute_id);
    const resolvedLogId = this.pickFirstText(logId, (outer.detail as any)?.logid, (failed as any).logid);
    const parts = ['Coze 工作流返回 ok=false，未返回有效意向分析结果'];
    if (errMsg) parts.push(`原因：${errMsg}`);
    if (resolvedExecuteId) parts.push(`execute_id=${resolvedExecuteId}`);
    if (resolvedLogId) parts.push(`logid=${resolvedLogId}`);
    if (debugUrl) parts.push(`debug_url=${debugUrl}`);
    return parts.join('；');
  }

  private extractCozeIntentResults(raw: unknown): Array<Record<string, unknown>> {
    const normalized = this.normalizeCozeJson(raw);
    const objectId = (item: Record<string, unknown>) => this.pickFirstText(item.cid, item.comment_id, item.commentId, item.id, item.recordId, item.captureId);
    const findStructuredNode = (value: unknown, depth = 0): Record<string, unknown> | null => {
      if (depth > 8 || value == null) return null;
      const current = this.normalizeCozeJson(value, depth + 1);
      if (Array.isArray(current)) {
        for (const item of current) {
          const found = findStructuredNode(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      if (!current || typeof current !== 'object') return null;
      const record = current as Record<string, unknown>;
      const hasStructuredArray = ['lead_results', 'leadResults', 'lead_analysis_results', 'comment_analysis_results', 'intent_results', 'routing_results', 'routingResults', 'script_results', 'scriptResults'].some((key) => Array.isArray(record[key]));
      if (hasStructuredArray) return record;
      for (const key of ['data', 'output', 'outputs', 'result', 'results']) {
        const found = findStructuredNode(record[key], depth + 1);
        if (found) return found;
      }
      return null;
    };
    const asObjectArray = (value: unknown): Array<Record<string, unknown>> => {
      const current = this.normalizeCozeJson(value);
      return Array.isArray(current)
        ? current.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
        : [];
    };
    const structured = findStructuredNode(normalized);
    if (structured) {
      const directResults = asObjectArray(structured.results);
      if (directResults.length && !asObjectArray(structured.lead_results).length && !asObjectArray(structured.leadResults).length) {
        return directResults;
      }
      const leadResults = [
        ...asObjectArray(structured.lead_results),
        ...asObjectArray(structured.leadResults),
        ...asObjectArray(structured.lead_analysis_results),
        ...asObjectArray(structured.comment_analysis_results),
        ...asObjectArray(structured.intent_results),
      ];
      const routingResults = [
        ...asObjectArray(structured.routing_results),
        ...asObjectArray(structured.routingResults),
        ...asObjectArray(structured.route_results),
      ];
      const scriptResults = [
        ...asObjectArray(structured.script_results),
        ...asObjectArray(structured.scriptResults),
        ...asObjectArray(structured.scripts),
      ];
      if (leadResults.length || routingResults.length || scriptResults.length) {
        const routingMap = new Map<string, Record<string, unknown>>();
        routingResults.forEach((item) => {
          const id = objectId(item);
          if (id) routingMap.set(id, item);
        });
        const scriptMap = new Map<string, Record<string, unknown>>();
        scriptResults.forEach((item) => {
          const id = objectId(item);
          if (id) scriptMap.set(id, item);
        });
        const base = leadResults.length ? leadResults : scriptResults.length ? scriptResults : routingResults;
        return base.map((item, index) => {
          const id = objectId(item) || objectId(routingResults[index] || {}) || objectId(scriptResults[index] || {});
          const routing = id ? routingMap.get(id) : routingResults[index];
          const script = id ? scriptMap.get(id) : scriptResults[index];
          return {
            ...item,
            ...(routing ? { routing_result: routing } : {}),
            ...(script ? { script_result: script } : {}),
            ...(id ? { cid: id, comment_id: id } : {}),
            lead_analysis_result: item,
          };
        });
      }
    }

    const collect = (value: unknown, depth = 0): Array<Record<string, unknown>> => {
      if (depth > 8 || value == null) return [];
      const current = this.normalizeCozeJson(value, depth + 1);
      if (Array.isArray(current)) {
        const objectItems = current.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
        if (objectItems.length) return objectItems;
        return current.flatMap((item) => collect(item, depth + 1));
      }
      if (!current || typeof current !== 'object') return [];
      const record = current as Record<string, unknown>;
      for (const key of ['results', 'result', 'items', 'list', 'records', 'comments', 'lead_results', 'intent_results', 'data', 'output', 'outputs']) {
        const child = collect(record[key], depth + 1);
        if (child.length) return child;
      }
      return [];
    };

    const results = collect(normalized);
    return results.filter((item) => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  }

  private async applyIntentAnalysisResultToCapture(
    capture: InterceptCaptureRow,
    result: Record<string, unknown>,
    batch: IntentAnalysisBatchRow,
    chunk: IntentAnalysisChunkRow,
    user: CurrentUserPayload,
    execution: {
      executeId?: string;
      logId?: string;
      provider: 'DEEPSEEK' | 'COZE';
      providerFallback?: Record<string, unknown> | null;
      runtimeContext?: any;
      requestContext: Record<string, unknown>;
    },
  ) {
    const raw = this.ensureJsonRecord(capture.raw);
    const normalized = this.normalizeCozeIntentResult(result, { cid: String(capture.id || ''), text: String(capture.commentText || '') });
    const level = normalized.level || 'C';
    const classificationShould = normalized.should === true;
    const generation = classificationShould
      ? await this.generateInterceptUnifiedPrivateMessageDraft({
          capture,
          normalized,
          batch,
          user,
          analysisProvider: execution.provider,
          providerFallback: execution.providerFallback || null,
          runtimeContext: execution.runtimeContext,
          requestContext: execution.requestContext,
        })
      : {
          should: false,
          reply: '',
          action: 'SKIP',
          replyTraceId: '',
          generationSource: 'NOT_GENERATED',
          generationProvider: execution.provider,
          generationModel: '',
          qualityStatus: 'NOT_RUN',
          safetyStatus: 'NOT_RUN',
          fallbackUsed: Boolean(execution.providerFallback),
          error: '',
        };
    const should = classificationShould && generation.should;
    const reply = should ? generation.reply : '';
    const entry = normalized.entry;
    const reason = generation.error || normalized.reason;
    const risk = normalized.risk || 'low';
    const need = normalized.need;
    const tags = Array.isArray(normalized.tags) ? normalized.tags.map((item) => String(item)).filter(Boolean) : [];
    const analyzedAt = new Date().toISOString();
    const nextRaw = {
      ...raw,
      intentAnalysisStatus: 'SUCCEEDED',
      intentAnalysisBatchId: String(batch.id || ''),
      intentAnalysisBatchNo: String(batch.batchNo || ''),
      intentAnalysisChunkId: String(chunk.id || ''),
      intentAnalysisChunkIndex: Number(chunk.chunkIndex || 0),
      intentAnalysisWorkflowId: String(batch.workflowId || ''),
      intentAnalysisPromptConfigId: String(batch.promptConfigId || ''),
      intentAnalysisPromptConfigName: String(batch.promptConfigName || ''),
      intentAnalysisExecuteId: execution.executeId || '',
      intentAnalysisLogId: execution.logId || '',
      intentAnalysisProvider: execution.provider,
      intentAnalysisProviderFallback: execution.providerFallback || null,
      intentAnalysisAt: analyzedAt,
      intentAnalysisError: '',
      intentAnalysis: {
        ...normalized,
        cid: normalized.cid || capture.id,
        level,
        classificationShould,
        should,
        action: generation.action,
        entry,
        reply,
        reason,
        risk,
        need,
        tags,
        text: normalized.text || this.pickFirstText(result.text, capture.commentText),
        raw: result,
        analyzedAt,
        workflowId: String(batch.workflowId || ''),
        promptConfigId: String(batch.promptConfigId || ''),
        promptConfigName: String(batch.promptConfigName || ''),
        batchId: String(batch.id || ''),
        batchNo: String(batch.batchNo || ''),
        chunkId: String(chunk.id || ''),
        executeId: execution.executeId || '',
        replyTraceId: generation.replyTraceId || '',
        generationSource: generation.generationSource,
        generationProvider: generation.generationProvider,
        generationModel: generation.generationModel,
        qualityStatus: generation.qualityStatus,
        safetyStatus: generation.safetyStatus,
        fallbackUsed: generation.fallbackUsed,
        generationError: generation.error || '',
      },
      intentLevel: level,
      aiIntentLevel: level,
      intentLabel: this.mapIntentLevelLabel(level),
      intentScore: this.mapIntentLevelScore(level),
      shouldPrivateMessage: should,
      shouldReply: should,
      entryPointSummary: entry,
      entryDecision: entry,
      intentReason: reason,
      judgeReason: reason,
      privateMessageDraft: reply,
      messageDraft: reply,
      messageFinal: reply,
      replyTraceId: generation.replyTraceId || '',
      generationSource: generation.generationSource,
      generationProvider: generation.generationProvider,
      generationModel: generation.generationModel,
      qualityStatus: generation.qualityStatus,
      safetyStatus: generation.safetyStatus,
      aiRiskLevel: risk,
      riskLevel: risk,
      aiRiskReason: risk === 'low' ? '' : reason,
      riskReason: risk === 'low' ? '' : reason,
      intentNeed: need,
      intentTags: tags,
    };
    await this.prisma.interceptCaptureRecord.update({
      where: { id: String(capture.id) },
      data: {
        raw: this.toPlainJsonValue(nextRaw),
        intentReplyTraceId: generation.replyTraceId || null,
        intentGenerationSource: generation.generationSource || null,
        intentGenerationProvider: generation.generationProvider || null,
        intentGenerationModel: generation.generationModel || null,
        intentQualityStatus: generation.qualityStatus || null,
        intentSafetyStatus: generation.safetyStatus || null,
      },
    });
  }

  private async generateInterceptUnifiedPrivateMessageDraft(input: {
    capture: InterceptCaptureRow;
    normalized: InterceptUnifiedDraftInput['normalized'];
    batch: IntentAnalysisBatchRow;
    user: CurrentUserPayload;
    analysisProvider: 'DEEPSEEK' | 'COZE';
    providerFallback: Record<string, unknown> | null;
    runtimeContext?: any;
    requestContext: Record<string, unknown>;
  }) {
    const binding = this.resolveInterceptAiBinding(await this.prisma.robot.findUnique({ where: { id: String(input.capture.robotId) }, select: { config: true } }) as any);
    const commentText = String(input.capture.commentText || input.normalized.text || '').trim();
    const postContext = [
      this.pickFirstText(input.capture.contentTitle),
      this.pickFirstText(input.capture.contentUrl),
      this.pickFirstText(input.capture.videoDescription),
      this.pickFirstText(input.capture.speechTranscript),
    ].filter(Boolean).join('\n').slice(0, 20_000);
    const replyAttemptId = `intercept-intent:${input.batch.id}:${input.capture.id}`;

    if (binding.provider === 'DEEPSEEK' && binding.accountProfileId) {
      try {
        const generated = await this.customerServiceChannelReply.execute({
          channel: 'DM',
          robotId: String(input.capture.robotId),
          accountProfileId: binding.accountProfileId,
          message: commentText,
          messageId: this.pickFirstText(input.capture.commentId, input.capture.id),
          platform: String(input.capture.platform || ''),
          postContext,
          serviceGoal: '基于用户公开评论中的明确需求，生成一条合规、自然、克制的陌生人首次私信；先提供有价值的信息，不冒充作者，不夸大承诺。',
          recognitionSessionId: `intercept:${input.capture.id}`,
          sourceType: 'INTERCEPT_INTENT_DRAFT',
          sourceRefId: String(input.capture.id),
          commentThreadId: this.pickFirstText(input.capture.platformContentId, input.capture.contentUrl),
          customerMessageId: this.pickFirstText(input.capture.commentId, input.capture.id),
          replyAttemptId,
          variables: {
            interceptIntent: {
              level: input.normalized.level,
              need: input.normalized.need,
              entry: input.normalized.entry,
              risk: input.normalized.risk,
              tags: input.normalized.tags,
              analysisProvider: input.analysisProvider,
              analysisProviderFallback: input.providerFallback,
            },
            channelMode: 'INTERCEPT_OUTREACH',
          },
        }, input.user);
        const reply = generated.segments.map((item) => item.content.trim()).filter(Boolean).join('\n');
        const should = generated.action === 'SEND' && Boolean(reply);
        return {
          should,
          reply: should ? reply : '',
          action: generated.action,
          replyTraceId: generated.replyTraceId || '',
          generationSource: generated.replySource,
          generationProvider: 'DEEPSEEK',
          generationModel: '',
          qualityStatus: generated.qualityStatus,
          safetyStatus: generated.safetyStatus,
          fallbackUsed: generated.fallbackUsed || Boolean(input.providerFallback),
          error: should ? '' : generated.skipReason || generated.judgeReason || '统一运行时判定不应主动私信',
        };
      } catch (error) {
        if (!binding.fallbackToCoze) {
          return {
            should: false,
            reply: '',
            action: 'SKIP',
            replyTraceId: '',
            generationSource: 'UNIFIED_RUNTIME_FAILED',
            generationProvider: 'DEEPSEEK',
            generationModel: '',
            qualityStatus: 'FAILED',
            safetyStatus: 'NOT_RUN',
            fallbackUsed: false,
            error: this.getErrorMessage(error, '统一主动私信运行时生成失败'),
          };
        }
        return this.generateInterceptCozeFallbackDraft(input, binding.accountProfileId, replyAttemptId, postContext, error);
      }
    }

    if (binding.provider === 'DEEPSEEK') {
      return {
        should: false,
        reply: '',
        action: 'SKIP',
        replyTraceId: '',
        generationSource: 'ACCOUNT_PROFILE_REQUIRED',
        generationProvider: 'DEEPSEEK',
        generationModel: '',
        qualityStatus: 'NOT_RUN',
        safetyStatus: 'NOT_RUN',
        fallbackUsed: false,
        error: 'DeepSeek 截流机器人缺少账号资料，未生成主动私信草稿',
      };
    }
    return this.persistInterceptLegacyDraftTrace(input, binding.accountProfileId || '', replyAttemptId, postContext, null);
  }

  private async generateInterceptCozeFallbackDraft(
    input: InterceptUnifiedDraftInput,
    accountProfileId: string,
    replyAttemptId: string,
    postContext: string,
    runtimeError: unknown,
  ) {
    let normalized = input.analysisProvider === 'COZE' ? input.normalized : null;
    if (!normalized || !normalized.reply) {
      try {
        const fallbackParameters = input.runtimeContext?.parameters || input.requestContext;
        const response = await this.requestCozeIntentWorkflow(String(input.batch.workflowId), {
          ...fallbackParameters,
          comments: [{ cid: String(input.capture.id), text: String(input.capture.commentText || '') }],
        });
        const result = this.extractCozeIntentResults(response.raw)[0];
        normalized = result ? this.normalizeCozeIntentResult(result, { cid: String(input.capture.id), text: String(input.capture.commentText || '') }) : null;
      } catch (fallbackError) {
        return {
          should: false,
          reply: '',
          action: 'SKIP',
          replyTraceId: '',
          generationSource: 'COZE_FALLBACK_FAILED',
          generationProvider: 'COZE',
          generationModel: '',
          qualityStatus: 'NOT_RUN',
          safetyStatus: 'NOT_RUN',
          fallbackUsed: true,
          error: `${this.getErrorMessage(runtimeError, '统一运行时失败')}；${this.getErrorMessage(fallbackError, '扣子回退失败')}`,
        };
      }
    }
    return this.persistInterceptLegacyDraftTrace(input, accountProfileId, replyAttemptId, postContext, runtimeError, normalized || undefined);
  }

  private async persistInterceptLegacyDraftTrace(
    input: InterceptUnifiedDraftInput,
    accountProfileId: string,
    replyAttemptId: string,
    postContext: string,
    runtimeError: unknown,
    fallbackNormalized = input.normalized,
  ) {
    const fallbackUsed = Boolean(runtimeError || input.providerFallback);
    const generationSource = fallbackUsed ? 'COZE_INTERCEPT_FALLBACK' : 'COZE_INTERCEPT';
    const reply = fallbackNormalized.should ? String(fallbackNormalized.reply || '').trim() : '';
    if (!reply) {
      return {
        should: false,
        reply: '',
        action: 'SKIP',
        replyTraceId: '',
        generationSource,
        generationProvider: 'COZE',
        generationModel: '',
        qualityStatus: 'NOT_RUN',
        safetyStatus: 'NOT_RUN',
        fallbackUsed,
        error: this.getErrorMessage(runtimeError, '扣子没有返回可发送的主动私信草稿'),
      };
    }
    let replyTraceId = '';
    try {
      const runtimeContext = input.runtimeContext;
      const trace = await this.replyTraces.createExternalTrace({
        tenantId: String(input.capture.tenantId),
        createdById: input.user.id,
        context: {
          sourceType: 'INTERCEPT_INTENT_DRAFT',
          sourceRefId: String(input.capture.id),
          robotId: String(input.capture.robotId),
          channel: 'DM',
          platform: String(input.capture.platform || ''),
          commentThreadId: this.pickFirstText(input.capture.platformContentId, input.capture.contentUrl),
          customerMessageId: this.pickFirstText(input.capture.commentId, input.capture.id),
          replyAttemptId,
          postContext,
        },
        customerMessage: String(input.capture.commentText || ''),
        replySegments: [{ index: 0, content: reply, delayBeforeMs: 0 }],
        provider: 'COZE',
        generationSource,
        accountProfileId: accountProfileId || runtimeContext?.account?.id,
        storeProfileId: runtimeContext?.account?.storeProfileId || undefined,
        merchantRoleId: runtimeContext?.account?.merchantRoleId || undefined,
        industryNodeId: runtimeContext?.account?.industryNodeId || undefined,
        qualityStatus: 'NOT_RUN',
        safetyStatus: 'NOT_RUN',
        fallbackUsed,
        configurationHash: runtimeContext?.configurationHash,
        sourceRevisions: runtimeContext?.sourceRevisions,
        knowledgeEntryIds: runtimeContext?.knowledgeEntries?.map((item: any) => item.id) || [],
        details: {
          mode: fallbackUsed ? 'legacy_coze_fallback' : 'legacy_coze_direct',
          runtimeError: runtimeError ? this.getErrorMessage(runtimeError, '统一运行时失败') : null,
          analysisProvider: input.analysisProvider,
          providerFallback: input.providerFallback,
        },
      });
      replyTraceId = trace.id;
    } catch (traceError) {
      this.logger.error(`截流扣子回退草稿追踪保存失败，保留草稿：${this.getErrorMessage(traceError, 'unknown error')}`);
    }
    return {
      should: true,
      reply,
      action: 'SEND',
      replyTraceId,
      generationSource,
      generationProvider: 'COZE',
      generationModel: '',
      qualityStatus: 'NOT_RUN',
      safetyStatus: 'NOT_RUN',
      fallbackUsed,
      error: '',
    };
  }

  private async markCaptureIntentAnalysisFailed(
    capture: InterceptCaptureRow,
    batch: IntentAnalysisBatchRow,
    chunk: IntentAnalysisChunkRow,
    message: string,
    executeId?: string,
    logId?: string,
  ) {
    const raw = this.ensureJsonRecord(capture.raw);
    await this.prisma.interceptCaptureRecord.update({
      where: { id: String(capture.id) },
      data: {
        raw: this.toPlainJsonValue({
          ...raw,
          intentAnalysisStatus: 'FAILED',
          intentAnalysisBatchId: String(batch.id || ''),
          intentAnalysisBatchNo: String(batch.batchNo || ''),
          intentAnalysisChunkId: String(chunk.id || ''),
          intentAnalysisChunkIndex: Number(chunk.chunkIndex || 0),
          intentAnalysisWorkflowId: String(batch.workflowId || ''),
          intentAnalysisPromptConfigId: String(batch.promptConfigId || ''),
          intentAnalysisPromptConfigName: String(batch.promptConfigName || ''),
          intentAnalysisExecuteId: executeId || '',
          intentAnalysisLogId: logId || '',
          intentAnalysisError: message,
          intentAnalysisAt: new Date().toISOString(),
        }),
      },
    });
  }

  private async refreshIntentAnalysisBatchCounters(batchId: string) {
    const batch = await this.prisma.interceptIntentAnalysisBatch.findUnique({
      where: { id: batchId },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('意向分析批次不存在');
    const chunks = batch.chunks || [];
    const successCount = chunks.reduce((sum, item) => sum + Number(item.successCount || 0), 0);
    const failedCount = chunks.reduce((sum, item) => sum + Number(item.failedCount || 0), 0);
    const hasRunning = chunks.some((item) => ['PENDING', 'RUNNING'].includes(String(item.status)));
    const hasFailed = chunks.some((item) => ['FAILED', 'PARTIAL_FAILED'].includes(String(item.status)));
    const status = hasRunning ? 'RUNNING' : hasFailed ? (successCount > 0 ? 'PARTIAL_FAILED' : 'FAILED') : 'SUCCEEDED';
    const chunkErrors = chunks.map((item) => String(item.errorMessage || '').trim()).filter(Boolean);
    return this.prisma.interceptIntentAnalysisBatch.update({
      where: { id: batchId },
      data: {
        successCount,
        failedCount,
        status,
        errorMessage: hasRunning ? null : chunkErrors.length ? Array.from(new Set(chunkErrors)).slice(0, 3).join('；') : null,
        completedAt: hasRunning ? null : new Date(),
        updatedAt: new Date(),
      },
      include: { chunks: { orderBy: { chunkIndex: 'asc' } } },
    });
  }

  private resolveInterceptWorkDecisionWorkflowId(robot: { config?: Prisma.JsonValue | null }, explicitWorkflowId?: string) {
    const root = this.ensureJsonRecord(robot.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const decision = this.ensureJsonRecord(intercept.workDecision || intercept.workScopeDecision || intercept.videoDecision);
    return this.pickFirstText(
      explicitWorkflowId,
      decision.workflowId,
      this.configService.get<string>('COZE_INTERCEPT_WORK_DECISION_WORKFLOW_ID'),
      String(this.configService.get<string>('COZE_INTERCEPT_WORK_DECISION_WORKFLOW_ID') || '').trim(),
    );
  }

  private buildInterceptWorkDecisionPayload(
    dto: TestInterceptWorkDecisionDto | RunInterceptWorkDecisionDto,
    options: { promptSnapshot?: Record<string, unknown>; robot?: { platform?: string; config?: Prisma.JsonValue | null; auth?: Record<string, unknown> | null } | null } = {},
  ) {
    const promptSnapshot = options.promptSnapshot || {};
    const root = this.ensureJsonRecord(options.robot?.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const targetProfile = this.resolveInterceptBusinessProfile({
      ...INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT,
      ...this.interceptIntentPromptSnapshotToContext(promptSnapshot),
    });
    const bp = {
      client: this.pickFirstText((dto.bp as any)?.client, targetProfile.client_name, promptSnapshot.name, '截流机器人项目'),
      biz: this.pickFirstText((dto.bp as any)?.biz, targetProfile.main_business, (promptSnapshot as any).biz, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.biz),
      products: this.pickFirstText((dto.bp as any)?.products, this.listToText(targetProfile.main_products), (promptSnapshot as any).sellPts),
      customers: this.pickFirstText((dto.bp as any)?.customers, this.listToText(targetProfile.target_customers), (promptSnapshot as any).cust),
      scenes: this.pickFirstText((dto.bp as any)?.scenes, this.listToText(targetProfile.target_scenarios), (promptSnapshot as any).acctPos),
      pains: this.pickFirstText((dto.bp as any)?.pains, this.listToText(targetProfile.customer_pain_points)),
      posKw: this.pickFirstText((dto.bp as any)?.posKw, this.listToText(targetProfile.positive_keywords)),
      negKw: this.pickFirstText((dto.bp as any)?.negKw, this.listToText(targetProfile.negative_keywords)),
      noLead: this.pickFirstText((dto.bp as any)?.noLead, this.listToText(targetProfile.non_lead_signals), (promptSnapshot as any).nonCust),
      forbid: this.pickFirstText((dto.bp as any)?.forbid, this.listToText(targetProfile.forbidden_claims), (promptSnapshot as any).banRules),
    };
    const auth = this.ensureJsonRecord((options.robot as any)?.auth);
    const acct = {
      type: this.pickFirstText((dto.acct as any)?.type, (promptSnapshot as any).acctType, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctType),
      pos: this.pickFirstText((dto.acct as any)?.pos, (promptSnapshot as any).acctPos, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctPos),
      platform: this.pickFirstText((dto.acct as any)?.platform, options.robot?.platform, (promptSnapshot as any).platform, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.platform),
      nickname: this.pickFirstText((dto.acct as any)?.nickname, auth.accountName, (intercept as any).accountName),
      profile: this.pickFirstText((dto.acct as any)?.profile, (intercept as any).accountProfile),
    };
    const video = this.ensureJsonRecord(dto.video);
    if (!this.pickFirstText(video.script, video.title, video.desc)) {
      throw new BadRequestException('请提供作品标题、文案或口播文案');
    }
    return {
      bp: this.compactTextRecord(bp),
      acct: this.compactTextRecord(acct),
      video: this.compactTextRecord({
        vid: this.pickFirstText(video.vid, video.videoId, video.id),
        url: this.pickFirstText(video.url, video.videoUrl, video.contentUrl),
        title: this.pickFirstText(video.title, video.videoTitle),
        desc: this.pickFirstText(video.desc, video.videoDesc, video.description),
        script: this.pickFirstText(video.script, video.asrText, video.voiceText, video.transcript),
        authorText: this.pickFirstText(video.authorText),
      }),
    };
  }

  private extractCozeWorkDecision(raw: unknown) {
    const normalized = this.normalizeCozeJson(raw);
    const candidates: Record<string, unknown>[] = [];
    const visit = (value: unknown, depth = 0) => {
      if (depth > 8 || value === undefined || value === null) return;
      const current = this.normalizeCozeJson(value);
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const record = current as Record<string, unknown>;
        if ('shouldRun' in record || 'should_run' in record || 'data' in record || 'output' in record) {
          candidates.push(record);
        }
        Object.values(record).forEach((item) => visit(item, depth + 1));
      } else if (Array.isArray(current)) {
        current.forEach((item) => visit(item, depth + 1));
      }
    };
    visit(normalized);
    for (const record of candidates) {
      const shouldRun = this.pickFirstBoolean(record.shouldRun, record.should_run, record.run, record.canRun, record.can_run);
      if (shouldRun !== undefined) {
        return {
          shouldRun,
          reason: this.pickFirstText(record.reason, record.errMsg, record.message) || (shouldRun ? '建议继续' : '建议跳过'),
        };
      }
    }
    throw new BadGatewayException('Coze 作品执行判定未返回 shouldRun');
  }

  private resolveInterceptIntentWorkflowId(robot: { config?: Prisma.JsonValue | null }, promptSnapshot?: Record<string, unknown>) {
    const root = this.ensureJsonRecord(robot.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const analysis = this.ensureJsonRecord(intercept.intentAnalysis);
    return this.pickFirstText(promptSnapshot?.workflowId, analysis.workflowId, this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID'));
  }

  private resolveInterceptIntentBatchSize(robot: { config?: Prisma.JsonValue | null }, promptSnapshot?: Record<string, unknown>) {
    const root = this.ensureJsonRecord(robot.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const analysis = this.ensureJsonRecord(intercept.intentAnalysis);
    return this.clampInterceptIntentBatchSize(promptSnapshot?.batchSize ?? analysis.batchSize ?? this.configService.get<string>('COZE_COMMENT_INTENT_BATCH_SIZE') ?? DEFAULT_INTERCEPT_INTENT_BATCH_SIZE);
  }

  private buildInterceptIntentAnalysisContext(robot: { platform: string; config?: Prisma.JsonValue | null }, captures: InterceptCaptureRow[], promptSnapshot?: Record<string, unknown>) {
    const root = this.ensureJsonRecord(robot.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const analysis = this.ensureJsonRecord(intercept.intentAnalysis);
    const context = { ...INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT, ...analysis, ...this.interceptIntentPromptSnapshotToContext(promptSnapshot || {}) } as Record<string, unknown>;
    delete context.workflowId;
    delete context.batchSize;
    const firstTitle = captures.map((item) => String(item.contentTitle || '').trim()).find(Boolean);
    context.videoTitle = this.pickFirstText(context.videoTitle, firstTitle, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.videoTitle);
    context.platform = String(context.platform || robot.platform || 'douyin').toLowerCase();
    return context;
  }

  private resolvePositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }

  private resolveCozeAccessToken() {
    return this.resolveCozeAccessTokenWithMeta().token;
  }

  private resolveCozeAccessTokenWithMeta() {
    const candidates = [
      { source: 'COZE_SERVICE_ACCESS_TOKEN', value: this.configService.get<string>('COZE_SERVICE_ACCESS_TOKEN') },
      { source: 'COZE_PERSONAL_ACCESS_TOKEN', value: this.configService.get<string>('COZE_PERSONAL_ACCESS_TOKEN') },
      { source: 'COZE_API_PAT', value: this.configService.get<string>('COZE_API_PAT') },
    ];
    const configuredSources = candidates.filter((item) => this.pickFirstText(item.value)).map((item) => item.source);
    const picked = candidates.find((item) => this.pickFirstText(item.value));
    const token = this.pickFirstText(picked?.value);
    return {
      token,
      source: picked?.source || '',
      configuredSources,
      fingerprint: this.maskSecretFingerprint(token),
      length: token.length,
    };
  }

  private maskSecretFingerprint(secret: string) {
    const text = this.pickFirstText(secret);
    if (!text) return '';
    return `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
  }

  private extractCozeErrorDebug(error: unknown) {
    if (error instanceof CozeWorkflowRequestError) return error.debug;
    return null;
  }

  private mapIntentLevelScore(level: string) {
    const normalized = String(level || '').trim().toUpperCase();
    if (normalized === 'S') return 95;
    if (normalized === 'A') return 85;
    if (normalized === 'B') return 65;
    if (normalized === 'C') return 30;
    if (normalized === 'D') return 10;
    return 0;
  }

  private mapIntentLevelLabel(level: string) {
    const normalized = String(level || '').trim().toUpperCase();
    if (normalized === 'S') return '强意向';
    if (normalized === 'A') return '中强意向';
    if (normalized === 'B') return '中等意向';
    if (normalized === 'C') return '低意向';
    if (normalized === 'D') return '无意向';
    return '未判断';
  }

  private normalizeIntentAnalysisBatchRow(row: IntentAnalysisBatchRow) {
    return {
      ...row,
      totalCount: Number(row.totalCount || 0),
      successCount: Number(row.successCount || 0),
      failedCount: Number(row.failedCount || 0),
      batchSize: Number(row.batchSize || 0),
      chunks: Array.isArray(row.chunks)
        ? row.chunks.map((chunk: IntentAnalysisChunkRow) => ({
            ...chunk,
            chunkIndex: Number(chunk.chunkIndex || 0),
            successCount: Number(chunk.successCount || 0),
            failedCount: Number(chunk.failedCount || 0),
            retryCount: Number(chunk.retryCount || 0),
            captureIds: this.normalizeStringArray(chunk.captureIds),
          }))
        : [],
    };
  }


  private normalizeInterceptIntentTestComments(value: unknown) {
    const source = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/\r?\n/)
        : [];
    return source
      .map((item, index) => {
        if (typeof item === 'string') {
          const text = item.trim();
          return text ? { cid: `TEST_${String(index + 1).padStart(3, '0')}`, text } : null;
        }
        const record = this.ensureJsonRecord(item);
        const text = this.pickFirstText(record.text, record.commentText, record.content, record.comment);
        if (!text) return null;
        return {
          cid: this.pickFirstText(record.cid, record.id, record.commentId, record.comment_id) || `TEST_${String(index + 1).padStart(3, '0')}`,
          text,
        };
      })
      .filter((item): item is { cid: string; text: string } => Boolean(item));
  }

  private buildInterceptIntentPromptTestSnapshot(dto: TestInterceptIntentPromptConfigDto, base?: InterceptIntentPromptConfigRow) {
    const baseSnapshot = base ? this.interceptIntentPromptConfigToSnapshot(base) : {
      id: '',
      name: '',
      workflowId: String(this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID') || '').trim(),
      batchSize: DEFAULT_INTERCEPT_INTENT_BATCH_SIZE,
      ...INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT,
      extraParams: {},
    };
    const extraParams = this.buildInterceptIntentExtraParams(dto, this.ensureJsonRecord((baseSnapshot as any).extraParams));
    return {
      ...baseSnapshot,
      name: this.pickFirstText(dto.name, (baseSnapshot as any).name, '临时测试配置'),
      workflowId: this.pickFirstText(dto.workflowId, (baseSnapshot as any).workflowId, String(this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID') || '').trim()),
      batchSize: this.clampInterceptIntentBatchSize(dto.batchSize ?? (baseSnapshot as any).batchSize),
      biz: this.pickFirstText(dto.biz, (baseSnapshot as any).biz, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.biz),
      cust: this.pickFirstText(dto.cust, (baseSnapshot as any).cust, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.cust),
      acctType: this.pickFirstText(dto.acctType, (baseSnapshot as any).acctType, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctType),
      acctPos: this.pickFirstText(dto.acctPos, (baseSnapshot as any).acctPos, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctPos),
      tone: this.pickFirstText(dto.tone, (baseSnapshot as any).tone, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.tone),
      sellPts: this.pickFirstText(dto.sellPts, (baseSnapshot as any).sellPts, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.sellPts),
      banRules: this.pickFirstText(dto.banRules, (baseSnapshot as any).banRules, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.banRules),
      nonCust: this.pickFirstText(dto.nonCust, (baseSnapshot as any).nonCust, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.nonCust),
      dmRule: this.pickFirstText(dto.dmRule, (baseSnapshot as any).dmRule, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.dmRule),
      entryRules: this.pickFirstText(dto.entryRules, (baseSnapshot as any).entryRules, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.entryRules),
      videoTitle: this.pickFirstText(dto.videoTitle, (baseSnapshot as any).videoTitle, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.videoTitle),
      platform: this.pickFirstText(dto.platform, (baseSnapshot as any).platform, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.platform),
      extraParams,
    } as Record<string, unknown>;
  }

  private alignInterceptIntentTestResults(comments: Array<{ cid: string; text: string }>, rawResults: Array<Record<string, unknown>>) {
    const byCid = new Map<string, Record<string, unknown>>();
    rawResults.forEach((item) => {
      const cid = this.pickFirstText(item.cid, item.id, item.captureId, item.recordId, item.commentId, item.comment_id);
      if (cid) byCid.set(String(cid).trim(), item);
    });
    return comments.map((comment, index) => {
      const result = byCid.get(comment.cid) || rawResults[index] || {};
      const normalized = this.normalizeCozeIntentResult(result, comment);
      return {
        ...normalized,
        cid: comment.cid,
        text: normalized.text || comment.text,
        raw: result,
      };
    });
  }

  private buildInterceptIntentPromptConfigData(dto: UpsertInterceptIntentPromptConfigDto, tenantId: string, createdById?: string) {
    const batchSize = this.clampInterceptIntentBatchSize(dto.batchSize ?? DEFAULT_INTERCEPT_INTENT_BATCH_SIZE);
    return {
      tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      workflowId: this.pickFirstText(dto.workflowId, String(this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID') || '').trim()),
      batchSize,
      biz: this.nullableTrim(dto.biz),
      cust: this.nullableTrim(dto.cust),
      acctType: this.nullableTrim(dto.acctType),
      acctPos: this.nullableTrim(dto.acctPos),
      tone: this.nullableTrim(dto.tone),
      sellPts: this.nullableTrim(dto.sellPts),
      banRules: this.nullableTrim(dto.banRules),
      nonCust: this.nullableTrim(dto.nonCust),
      dmRule: this.nullableTrim(dto.dmRule),
      entryRules: this.nullableTrim(dto.entryRules),
      videoTitle: this.nullableTrim(dto.videoTitle),
      platform: this.nullableTrim(dto.platform) || 'douyin',
      extraParams: this.toPlainJsonValue(this.buildInterceptIntentExtraParams(dto)),
      status: dto.status || 'ENABLED',
      createdById,
    };
  }

  private buildInterceptIntentPromptConfigUpdateData(dto: UpdateInterceptIntentPromptConfigDto, existing?: InterceptIntentPromptConfigRow) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.workflowId !== undefined) data.workflowId = this.pickFirstText(dto.workflowId, String(this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID') || '').trim());
    if (dto.batchSize !== undefined) data.batchSize = this.clampInterceptIntentBatchSize(dto.batchSize);
    for (const key of ['biz', 'cust', 'acctType', 'acctPos', 'tone', 'sellPts', 'banRules', 'nonCust', 'dmRule', 'entryRules', 'videoTitle', 'platform'] as const) {
      if (dto[key] !== undefined) data[key] = this.nullableTrim(dto[key]);
    }
    if (this.hasInterceptIntentExtraParamUpdate(dto)) data.extraParams = this.toPlainJsonValue(this.buildInterceptIntentExtraParams(dto, this.ensureJsonRecord(existing?.extraParams)));
    if (dto.status !== undefined) data.status = dto.status || 'ENABLED';
    return data;
  }

  private buildDefaultInterceptIntentPromptConfigData(tenantId: string, createdById?: string) {
    return {
      tenantId,
      name: '默认评论意向分析提示词',
      description: '系统内置默认配置，来源于“评论意向分析 - 扣子请求方式.md”的工作流参数。',
      workflowId: String(this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID') || '').trim(),
      batchSize: DEFAULT_INTERCEPT_INTENT_BATCH_SIZE,
      ...INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT,
      extraParams: this.toPlainJsonValue(this.buildDefaultInterceptIntentExtraParams()),
      isDefault: true,
      status: 'ENABLED',
      createdById,
    };
  }

  private async ensureDefaultInterceptIntentPromptConfig(tenantId: string, createdById?: string) {
    const db = this.prisma as any;
    const currentDefault = await db.interceptIntentPromptConfig.findFirst({
      where: { tenantId, deletedAt: null, status: 'ENABLED', isDefault: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (currentDefault) return currentDefault;

    const firstEnabled = await db.interceptIntentPromptConfig.findFirst({
      where: { tenantId, deletedAt: null, status: 'ENABLED' },
      orderBy: { updatedAt: 'desc' },
    });
    if (firstEnabled) {
      await db.interceptIntentPromptConfig.updateMany({ where: { tenantId, deletedAt: null }, data: { isDefault: false } });
      return db.interceptIntentPromptConfig.update({ where: { id: firstEnabled.id }, data: { isDefault: true } });
    }

    return db.interceptIntentPromptConfig.create({ data: this.buildDefaultInterceptIntentPromptConfigData(tenantId, createdById) });
  }

  private async findInterceptIntentPromptConfigOrThrow(id: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user, undefined);
    const config = await db.interceptIntentPromptConfig.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
    if (!config) throw new NotFoundException('截流意向分析提示词配置不存在');
    return config as InterceptIntentPromptConfigRow;
  }

  private normalizeInterceptIntentPromptConfigRow(row: InterceptIntentPromptConfigRow) {
    return {
      ...row,
      batchSize: this.clampInterceptIntentBatchSize(row.batchSize),
      isDefault: row.isDefault === true,
      extraParams: this.ensureJsonRecord(row.extraParams),
    };
  }

  private interceptIntentPromptConfigToSnapshot(row: InterceptIntentPromptConfigRow) {
    const extraParams = this.ensureJsonRecord(row.extraParams);
    return {
      id: String(row.id || ''),
      name: String(row.name || ''),
      workflowId: this.pickFirstText(row.workflowId, String(this.configService.get<string>('COZE_COMMENT_INTENT_WORKFLOW_ID') || '').trim()),
      batchSize: this.clampInterceptIntentBatchSize(row.batchSize),
      biz: this.pickFirstText(row.biz, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.biz),
      cust: this.pickFirstText(row.cust, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.cust),
      acctType: this.pickFirstText(row.acctType, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctType),
      acctPos: this.pickFirstText(row.acctPos, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctPos),
      tone: this.pickFirstText(row.tone, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.tone),
      sellPts: this.pickFirstText(row.sellPts, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.sellPts),
      banRules: this.pickFirstText(row.banRules, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.banRules),
      nonCust: this.pickFirstText(row.nonCust, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.nonCust),
      dmRule: this.pickFirstText(row.dmRule, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.dmRule),
      entryRules: this.pickFirstText(row.entryRules, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.entryRules),
      videoTitle: this.pickFirstText(row.videoTitle, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.videoTitle),
      platform: this.pickFirstText(row.platform, INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.platform),
      extraParams,
    };
  }

  private interceptIntentPromptSnapshotToContext(snapshot: Record<string, unknown>) {
    const extraParams = this.ensureJsonRecord(snapshot.extraParams);
    const context = {
      ...INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT,
      ...snapshot,
      ...extraParams,
    } as Record<string, unknown>;
    delete context.id;
    delete context.name;
    delete context.workflowId;
    delete context.batchSize;
    delete context.extraParams;

    const businessProfile = this.resolveInterceptBusinessProfile(context);
    context.business_profile = businessProfile;
    context.businessProfile = businessProfile;
    context.video_title = this.pickFirstText(context.videoTitle, (context.video_data as any)?.video_title);
    context.video_desc = this.pickFirstText(context.videoDesc, (context.video_data as any)?.video_desc, '');
    context.video_data = {
      video_id: this.pickFirstText((context.video_data as any)?.video_id, context.videoId, ''),
      video_title: context.video_title,
      video_desc: context.video_desc,
    };
    context.workflow_mode = this.pickFirstText(context.workflowMode, 'dynamic_pc_config');
    context.node_chain_version = this.pickFirstText(context.nodeChainVersion, 'work_decision_plus_comment_analysis_v1');
    context.video_analysis_rules = this.pickFirstText(context.videoRelevanceRules);
    context.comment_scoring_rules = this.pickFirstText(context.commentScoringRules);
    context.risk_routing_rules = this.pickFirstText(context.riskRoutingRules);
    context.script_generation_rules = this.pickFirstText(context.scriptGenerationRules);
    return context;
  }

  private buildDefaultInterceptIntentExtraParams() {
    return {
      workflowMode: 'dynamic_pc_config',
      clientName: '默认截流获客业务',
      mainBusiness: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.biz,
      mainProducts: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.sellPts,
      targetCustomers: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.cust,
      targetScenarios: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.acctPos,
      customerPainPoints: '获客线索筛选耗时,竞品评论区潜在线索难识别,主动私信开场容易突兀',
      coreSellingPoints: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.sellPts,
      positiveKeywords: '竞品截流,评论截流,获客,线索,私域,工具,试用,怎么做,多少钱,合作',
      negativeKeywords: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.banRules,
      highIntentKeywords: '多少钱,报价,怎么联系,怎么合作,能试用吗,有工具吗,有链接吗,可以发我吗',
      nonLeadSignals: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.nonCust,
      allowedOffers: '真实线索样例,实际筛选效果,工具演示,试用说明,配置建议',
      accountPersona: '有相关工具、方案、样例或经验的人，不冒充作者或官方客服',
      forbiddenClaims: INTERCEPT_INTENT_ANALYSIS_DEFAULT_CONTEXT.banRules,
      ctaPolicy: { allow_wechat: false, default_cta: '先给对方看真实样例或实际筛选效果' },
      videoRelevanceRules: '作品是否继续执行由独立工作流处理；评论分析仅处理已采集评论，但仍需结合作品标题/文案上下文谨慎判断。',
      commentScoringRules: '评论意向必须绑定当前作品上下文和目标业务，不能只因“多少钱/怎么联系”等泛词判高意向。',
      riskRoutingRules: '风险规避直接由禁用规则、非客户定义和后端兜底处理；高风险、广告、违规、辱骂、明显无关内容不触达。',
      scriptGenerationRules: '只在 should=true 时生成陌生人冷启动私信；should=false 时 reply 必须为空。',
    };
  }

  private hasInterceptIntentExtraParamUpdate(dto: object) {
    const record = dto as Record<string, unknown>;
    if (record.extraParams !== undefined) return true;
    return INTERCEPT_INTENT_EXTRA_PARAM_KEYS.some((key) => record[key] !== undefined);
  }

  private buildInterceptIntentExtraParams(dto: object, base: Record<string, unknown> = {}) {
    const record = dto as Record<string, unknown>;
    const next = { ...base } as Record<string, unknown>;
    if (record.extraParams !== undefined) {
      Object.assign(next, this.ensureJsonRecord(record.extraParams));
    }
    for (const key of INTERCEPT_INTENT_EXTRA_PARAM_KEYS) {
      if (record[key] !== undefined) {
        next[key] = typeof record[key] === 'string' ? String(record[key]).trim() : this.toPlainJsonValue(record[key]);
      }
    }
    return next;
  }

  private resolveInterceptBusinessProfile(context: Record<string, unknown>) {
    const explicit = this.parseMaybeJsonRecord(context.business_profile) || this.parseMaybeJsonRecord(context.businessProfile);
    if (explicit && Object.keys(explicit).length) return explicit;
    const ctaPolicy = this.parseMaybeJsonRecord(context.ctaPolicy) || { allow_wechat: false, default_cta: this.pickFirstText(context.dmRule, '先在私信里发参考资料') };
    return {
      client_name: this.pickFirstText(context.clientName, context.name, '未配置客户名称'),
      main_business: this.pickFirstText(context.mainBusiness, context.biz),
      main_products: this.normalizeFlexibleList(context.mainProducts || context.sellPts),
      target_customers: this.normalizeFlexibleList(context.targetCustomers || context.cust),
      target_scenarios: this.normalizeFlexibleList(context.targetScenarios || context.acctPos),
      customer_pain_points: this.normalizeFlexibleList(context.customerPainPoints),
      core_selling_points: this.normalizeFlexibleList(context.coreSellingPoints || context.sellPts),
      positive_keywords: this.normalizeFlexibleList(context.positiveKeywords),
      negative_keywords: this.normalizeFlexibleList(context.negativeKeywords || context.banRules),
      high_intent_keywords: this.normalizeFlexibleList(context.highIntentKeywords),
      non_lead_signals: this.normalizeFlexibleList(context.nonLeadSignals || context.nonCust),
      allowed_offers: this.normalizeFlexibleList(context.allowedOffers),
      account_persona: this.pickFirstText(context.accountPersona, context.tone),
      forbidden_claims: this.normalizeFlexibleList(context.forbiddenClaims || context.banRules),
      cta_policy: ctaPolicy,
    };
  }

  private parseMaybeJsonRecord(value: unknown) {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return this.ensureJsonRecord(value);
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return this.ensureJsonRecord(parsed);
    } catch {
      return null;
    }
    return null;
  }

  private normalizeFlexibleList(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
      } catch {
        return text.split(/[，,、;；\n]/).map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  }

  private async resolveInterceptIntentPromptConfigForRobot(
    robot: { tenantId: string; config?: Prisma.JsonValue | null },
    user: CurrentUserPayload,
  ) {
    const db = this.prisma as any;
    const root = this.ensureJsonRecord(robot.config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const analysis = this.ensureJsonRecord(intercept.intentAnalysis);
    const promptConfigId = this.pickFirstText(analysis.promptConfigId);
    if (promptConfigId) {
      const bound = await db.interceptIntentPromptConfig.findFirst({
        where: { id: promptConfigId, tenantId: robot.tenantId, deletedAt: null, status: 'ENABLED' },
      });
      if (bound) return bound as InterceptIntentPromptConfigRow;
      this.logger.warn(`绑定的截流提示词配置不可用，已回退默认配置：tenantId=${robot.tenantId}, promptConfigId=${promptConfigId}`);
    }
    return this.ensureDefaultInterceptIntentPromptConfig(robot.tenantId, user.id);
  }

  private normalizeCozeIntentResult(result: Record<string, unknown>, fallback?: { cid?: string; text?: string }) {
    const lead = this.ensureJsonRecord(result.lead_analysis_result || result.leadAnalysisResult || result.lead || result.intent || {});
    const routing = this.ensureJsonRecord(result.routing_result || result.routingResult || result.routing || {});
    const script = this.ensureJsonRecord(result.script_result || result.scriptResult || result.script || {});
    const cid = this.pickFirstText(
      result.cid,
      result.comment_id,
      result.commentId,
      lead.comment_id,
      lead.commentId,
      routing.comment_id,
      script.comment_id,
      fallback?.cid,
    );
    const intentLevel = this.pickFirstText(result.level, result.intentLevel, result.intent_level, result.grade);
    const numericIntentLevel = Number(this.pickFirstText(result.intent_level, result.intentLevel, lead.intent_level, lead.intentLevel, intentLevel));
    const normalizedLevel = /^[SABCD]$/i.test(intentLevel) ? intentLevel : this.mapNumericIntentLevelToLetter(numericIntentLevel);
    const scriptStatus = this.pickFirstText(result.script_status, result.scriptStatus, script.script_status, script.scriptStatus);
    const action = this.pickFirstText(result.action, routing.action);
    const risk = this.pickFirstText(result.risk, result.riskLevel, result.risk_level, routing.risk_level, script.risk_level) || 'low';
    const should = result.should === true
      || String(result.should ?? '').toLowerCase() === 'true'
      || scriptStatus === 'generated'
      || action === 'generate_script';
    const reply = should ? this.pickFirstText(result.reply, result.messageDraft, result.privateMessageDraft, result.script_content, script.script_content) : '';
    const intentType = this.pickFirstText(result.intent_type, result.intentType, lead.intent_type, lead.intentType);
    const tags = Array.isArray(result.tags)
      ? result.tags.map((item) => String(item)).filter(Boolean).slice(0, 2)
      : [intentType, this.pickFirstText(routing.routing_account, routing.routingAccount)].filter(Boolean).slice(0, 2);
    return {
      cid,
      text: this.pickFirstText(result.text, result.comment_text, lead.text, fallback?.text),
      level: String(normalizedLevel || 'C').toUpperCase(),
      reason: this.pickFirstText(result.reason, result.judgeReason, result.intentReason, script.reason, routing.reason, lead.reason),
      need: this.pickFirstText(result.need, result.user_need, result.userNeed, intentType),
      entry: this.pickFirstText(result.entry, result.entryPointSummary, result.entryDecision, routing.reason, action),
      reply,
      risk,
      should,
      tags,
      raw: result,
    };
  }

  private mapNumericIntentLevelToLetter(level: number) {
    if (level === 1) return 'S';
    if (level === 2) return 'A';
    if (level === 3) return 'B';
    if (level === 4) return 'C';
    if (level === 5) return 'D';
    return '';
  }

  private clampInterceptIntentBatchSize(value: unknown) {
    const raw = Number(value ?? DEFAULT_INTERCEPT_INTENT_BATCH_SIZE);
    if (!Number.isFinite(raw)) return DEFAULT_INTERCEPT_INTENT_BATCH_SIZE;
    return Math.max(1, Math.min(Math.floor(raw), MAX_INTERCEPT_INTENT_BATCH_SIZE));
  }

  private nullableTrim(value: unknown) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
  }

  private normalizeStringArray(value: unknown) {
    const normalizeItems = (items: unknown[]) =>
      items
        .map((item) => this.safeNullableText(item, 120))
        .filter((item): item is string => Boolean(item));
    if (Array.isArray(value)) return normalizeItems(value);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return normalizeItems(parsed);
      } catch {
        const text = this.safeNullableText(value, 500);
        return text ? text.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
      }
    }
    return [];
  }

  private getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error.trim();
    return fallback;
  }

  private async findExistingInterceptCapture(data: Prisma.InterceptCaptureRecordUncheckedCreateInput) {
    if (data.dedupeKey) {
      const byKey = await this.prisma.interceptCaptureRecord.findUnique({
        where: {
          interceptCaptureDedupe: {
            tenantId: data.tenantId,
            robotId: data.robotId,
            dedupeKey: data.dedupeKey,
          },
        },
      });
      if (byKey) return byKey;
    }

    // Compatibility with rows created before dedupeKey existed: use the business
    // rule directly so old duplicates can be matched once and patched with the
    // new dedupeKey instead of creating a new record.
    if (!data.commentText || !data.commentTimeIso || (!data.userId && !data.nickname)) {
      return null;
    }
    return this.prisma.interceptCaptureRecord.findFirst({
      where: {
        tenantId: data.tenantId,
        robotId: data.robotId,
        commentText: data.commentText,
        commentTimeIso: data.commentTimeIso,
        OR: [
          ...(data.userId ? [{ userId: data.userId }] : []),
          ...(data.nickname ? [{ nickname: data.nickname }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async buildInterceptCaptureCommentCountMap(
    tenantId: string | undefined,
    items: Array<{ tenantId: string; platform: string; platformContentId?: string | null; contentUrl?: string | null }>,
  ) {
    const counts = new Map<string, number>();
    if (!items.length) return counts;

    const tenantIds = Array.from(new Set(items.map((item) => String(item.tenantId || '').trim()).filter(Boolean)));
    if (!tenantId && !tenantIds.length) return counts;
    const tenantScope = tenantId ? { tenantId } : { tenantId: { in: tenantIds } };

    const contentIds = Array.from(new Set(items.map((item) => String(item.platformContentId || '').trim()).filter(Boolean)));
    if (contentIds.length) {
      const groupedById = await this.prisma.interceptCaptureRecord.groupBy({
        by: ['tenantId', 'platform', 'platformContentId'],
        where: { ...tenantScope, platformContentId: { in: contentIds } },
        _count: { _all: true },
      });
      groupedById.forEach((item) => {
        const key = this.interceptCaptureWorkKey({ tenantId: item.tenantId, platform: item.platform, platformContentId: item.platformContentId });
        if (key) counts.set(key, item._count._all);
      });
    }

    const contentUrls = Array.from(new Set(items.filter((item) => !String(item.platformContentId || '').trim()).map((item) => String(item.contentUrl || '').trim()).filter(Boolean)));
    if (contentUrls.length) {
      const groupedByUrl = await this.prisma.interceptCaptureRecord.groupBy({
        by: ['tenantId', 'platform', 'contentUrl'],
        where: { ...tenantScope, contentUrl: { in: contentUrls } },
        _count: { _all: true },
      });
      groupedByUrl.forEach((item) => {
        const key = this.interceptCaptureWorkKey({ tenantId: item.tenantId, platform: item.platform, contentUrl: item.contentUrl });
        if (key) counts.set(key, item._count._all);
      });
    }
    return counts;
  }

  private interceptCaptureWorkKey(item: { tenantId?: string | null; platform?: string | null; platformContentId?: string | null; contentUrl?: string | null }) {
    const tenantId = String(item.tenantId || '').trim();
    const platform = String(item.platform || '').trim().toUpperCase();
    const contentId = String(item.platformContentId || '').trim();
    const contentUrl = String(item.contentUrl || '').trim();
    if (!tenantId || !platform) return '';
    if (contentId) return `${tenantId}:${platform}:id:${contentId}`;
    if (contentUrl) return `${tenantId}:${platform}:url:${contentUrl}`;
    return '';
  }

  private async findInterceptCaptureViewPresetOrThrow(id: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const preset = await (this.prisma as any).interceptCaptureViewPreset.findFirst({ where: { id, tenantId, userId: user.id } });
    if (!preset) throw new NotFoundException('字段预设不存在或无权访问');
    return preset;
  }

  private normalizeInterceptCaptureViewPresetName(value: string) {
    const name = String(value || '').trim();
    if (!name) throw new BadRequestException('预设名称不能为空');
    if (name.length > 64) throw new BadRequestException('预设名称不能超过 64 个字符');
    return name;
  }

  private normalizeInterceptCaptureViewPresetColumns(input?: unknown) {
    const rawRows = Array.isArray(input) ? input : [];
    const byKey = new Map<string, { visible: boolean; order: number }>();
    rawRows.forEach((row, index) => {
      const record = this.ensureJsonRecord(row);
      const key = String(record.key || '').trim();
      if (!INTERCEPT_CAPTURE_VIEW_COLUMN_KEYS.has(key) || byKey.has(key)) return;
      const rawOrder = Number(record.order);
      byKey.set(key, {
        visible: record.visible !== false,
        order: Number.isInteger(rawOrder) && rawOrder >= 0 && rawOrder <= 99 ? rawOrder : index,
      });
    });
    return INTERCEPT_CAPTURE_VIEW_COLUMNS
      .map((column, index) => {
        const configured = byKey.get(column.key);
        return { key: column.key, visible: configured?.visible ?? column.visible, order: configured?.order ?? index };
      })
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
      .map((column, index) => ({ ...column, order: index }));
  }

  private assertInterceptCaptureViewPresetHasVisibleColumn(columns: Array<{ visible: boolean }>) {
    if (!columns.some((item) => item.visible)) {
      throw new BadRequestException('至少保留一个显示字段');
    }
  }

  private normalizeInterceptCaptureViewPreset(item: any) {
    return {
      id: String(item.id || ''),
      tenantId: String(item.tenantId || ''),
      userId: String(item.userId || ''),
      name: String(item.name || ''),
      isDefault: item.isDefault === true,
      columns: this.normalizeInterceptCaptureViewPresetColumns(item.columns),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private buildInterceptCaptureWhere(query: InterceptCaptureQueryDto, tenantId?: string): Prisma.InterceptCaptureRecordWhereInput {
    const keyword = query.keyword?.trim();
    const intentLevel = query.intentLevel?.trim().toUpperCase();
    const analysisStatus = query.analysisStatus?.trim().toUpperCase();
    const andConditions: Prisma.InterceptCaptureRecordWhereInput[] = [];
    if (intentLevel) {
      andConditions.push({ raw: { path: ['intentLevel'], equals: intentLevel } } as Prisma.InterceptCaptureRecordWhereInput);
    }
    if (analysisStatus) {
      andConditions.push({ raw: { path: ['intentAnalysisStatus'], equals: analysisStatus } } as Prisma.InterceptCaptureRecordWhereInput);
    }
    return {
      ...(tenantId ? { tenantId } : {}),
      ...(query.robotId ? { robotId: query.robotId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(keyword
        ? {
            OR: [
              { nickname: { contains: keyword, mode: 'insensitive' } },
              { commentText: { contains: keyword, mode: 'insensitive' } },
              { contentTitle: { contains: keyword, mode: 'insensitive' } },
              { contentUrl: { contains: keyword, mode: 'insensitive' } },
              { homepageUrl: { contains: keyword, mode: 'insensitive' } },
              { platformContentId: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(andConditions.length ? { AND: andConditions } : {}),
    };
  }

  private async resolveInterceptWorkDecisionEvidence(
    robot: { tenantId: string; id: string },
    item: NonNullable<CreateInterceptCaptureBatchDto['items']>[number],
  ): Promise<InterceptWorkDecisionEvidence> {
    const empty: InterceptWorkDecisionEvidence = {
      traceId: null,
      provider: null,
      model: null,
      configurationHash: null,
    };
    const traceId = this.safeNullableText(item.workDecisionTraceId, 64);
    if (!traceId) return empty;

    try {
      const trace = await this.replyTraces.getScopedInternal(traceId, robot.tenantId);
      const expectedSourceRefId = this.buildInterceptWorkDecisionSourceRef(robot.id, {
        vid: item.platformContentId,
        url: item.contentUrl,
        title: item.contentTitle,
        script: item.speechTranscript,
      });
      if (
        trace.sourceType !== 'INTERCEPT_WORK_DECISION'
        || trace.robotId !== robot.id
        || trace.sourceRefId !== expectedSourceRefId
      ) {
        return empty;
      }

      return {
        traceId: this.safeNullableText(trace.id, 64),
        provider: this.safeNullableText(trace.provider, 40),
        model: this.safeNullableText(trace.model, 120),
        configurationHash: this.safeNullableText(trace.configurationHash, 64),
      };
    } catch {
      // 客户端只负责透传 Trace ID；不存在、已清理或跨租户的 Trace 一律不落权威证据字段。
      return empty;
    }
  }

  private buildInterceptCaptureCreateData(
    robot: { tenantId: string; id: string; platform: string },
    item: NonNullable<CreateInterceptCaptureBatchDto['items']>[number],
    batchRunId: string | undefined,
    now: Date,
    workDecisionEvidence: InterceptWorkDecisionEvidence,
  ): Prisma.InterceptCaptureRecordUncheckedCreateInput {
    const runId = this.safeNullableText(item.runId ?? batchRunId, 64);
    const platform = this.safeRequiredText(item.platform ?? robot.platform, 32, 'UNKNOWN').toUpperCase();
    const data: Prisma.InterceptCaptureRecordUncheckedCreateInput = {
      tenantId: robot.tenantId,
      robotId: robot.id,
      runId,
      platform,
      accountAlias: this.safeNullableText(item.accountAlias, 100),
      targetType: this.safeNullableText(item.targetType, 32),
      targetUrl: this.safeNullableText(item.targetUrl),
      homepageUrl: this.safeNullableText(item.homepageUrl),
      contentUrl: this.safeNullableText(item.contentUrl),
      platformContentId: this.safeNullableText(item.platformContentId, 128),
      contentTitle: this.safeNullableText(item.contentTitle),
      publishTimeIso: this.parseNullableDate(item.publishTimeIso),
      speechTranscript: this.safeNullableText(item.speechTranscript),
      speechStatus: this.safeNullableText(item.speechStatus, 32),
      speechError: this.safeNullableText(item.speechError),
      videoDescription: this.safeNullableText(item.videoDescription),
      videoTags: this.normalizeStringArray(item.videoTags),
      workDecisionStatus: this.safeNullableText(item.workDecisionStatus, 32),
      workDecisionShouldRun: this.parseNullableBoolean(item.workDecisionShouldRun),
      workDecisionReason: this.safeNullableText(item.workDecisionReason),
      workDecisionWorkflowId: this.safeNullableText(item.workDecisionWorkflowId, 128),
      workDecisionTraceId: workDecisionEvidence.traceId,
      workDecisionProvider: workDecisionEvidence.provider,
      workDecisionModel: workDecisionEvidence.model,
      workDecisionConfigurationHash: workDecisionEvidence.configurationHash,
      commentId: this.safeNullableText(item.commentId, 128),
      parentCommentId: this.safeNullableText(item.parentCommentId, 128),
      userId: this.safeNullableText(item.userId, 128),
      nickname: this.safeNullableText(item.nickname, 100),
      commentText: this.safeNullableText(item.commentText),
      commentTimeIso: this.parseNullableDate(item.commentTimeIso),
      visibleRegion: this.safeNullableText(item.visibleRegion),
      raw: this.toPlainJsonValue(item.raw ?? item),
      capturedAt: now,
      createdAt: now,
    };
    data.dedupeKey = this.buildInterceptCaptureDedupeKey(data);
    return data;
  }

  private buildInterceptCaptureFailedRow(index: number, item: unknown, error: unknown) {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const summary = (key: string, maxLength = 160) => {
      const value = this.safeNullableText(record[key], maxLength);
      return value || undefined;
    };
    return {
      index,
      message: this.getErrorMessage(error, '同步入库失败'),
      platform: summary('platform', 32),
      targetType: summary('targetType', 32),
      contentUrl: summary('contentUrl', 220),
      platformContentId: summary('platformContentId', 128),
      commentId: summary('commentId', 128),
      userId: summary('userId', 128),
      nickname: summary('nickname', 100),
      commentTextPreview: summary('commentText', 120),
      commentTextLength: typeof record.commentText === 'string' ? record.commentText.length : undefined,
    };
  }

  private safeRequiredText(value: unknown, maxLength?: number, fallback = '') {
    return this.safeNullableText(value, maxLength) || fallback;
  }

  private safeNullableText(value: unknown, maxLength?: number) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    const text = String(value)
      .replace(/\u0000/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();
    if (!text) return null;
    const lowered = text.toLowerCase();
    if (['undefined', 'null', 'none', 'nan'].includes(lowered)) return null;
    if (maxLength && maxLength > 0 && text.length > maxLength) {
      return text.slice(0, Math.max(0, maxLength));
    }
    return text;
  }

  private parseNullableBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return value !== 0;
    }
    const text = this.safeNullableText(value, 16)?.toLowerCase();
    if (!text) return null;
    if (['true', '1', 'yes', 'y', 'run', 'continue', '继续', '是'].includes(text)) return true;
    if (['false', '0', 'no', 'n', 'skip', 'stop', '跳过', '否'].includes(text)) return false;
    return null;
  }

  private buildInterceptCaptureDedupeKey(data: Prisma.InterceptCaptureRecordUncheckedCreateInput) {
    if (data.targetType === 'content_precheck') {
      const runId = this.normalizeDedupeText(data.runId);
      const platform = this.normalizeDedupeText(data.platform);
      const contentKey = this.normalizeDedupeText(data.platformContentId || data.contentUrl);
      if (platform && contentKey) {
        return createHash('sha256').update(`precheck|${runId}|${platform}|${contentKey}`).digest('hex');
      }
    }
    const commentUser = this.normalizeDedupeText(data.userId || data.nickname);
    const commentTime = data.commentTimeIso instanceof Date ? data.commentTimeIso.toISOString() : this.normalizeDedupeText(data.commentTimeIso);
    const commentText = this.normalizeDedupeText(data.commentText);
    if (commentUser && commentTime && commentText) {
      return createHash('sha256').update(`${commentUser}|${commentTime}|${commentText}`).digest('hex');
    }
    const platform = this.normalizeDedupeText(data.platform);
    const commentId = this.normalizeDedupeText(data.commentId);
    if (platform && commentId) {
      return createHash('sha256').update(`${platform}|${commentId}`).digest('hex');
    }
    return null;
  }

  private normalizeDedupeText(value: unknown) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  private buildMissingCaptureUpdate(
    existing: { [key: string]: unknown },
    next: Prisma.InterceptCaptureRecordUncheckedCreateInput,
  ): Prisma.InterceptCaptureRecordUncheckedUpdateInput {
    const update: Prisma.InterceptCaptureRecordUncheckedUpdateInput = {};
    const fields = [
      'runId',
      'platform',
      'accountAlias',
      'targetType',
      'targetUrl',
      'homepageUrl',
      'contentUrl',
      'platformContentId',
      'contentTitle',
      'publishTimeIso',
      'speechTranscript',
      'speechStatus',
      'speechError',
      'videoDescription',
      'videoTags',
      'workDecisionStatus',
      'workDecisionShouldRun',
      'workDecisionReason',
      'workDecisionWorkflowId',
      'workDecisionTraceId',
      'workDecisionProvider',
      'workDecisionModel',
      'workDecisionConfigurationHash',
      'intentReplyTraceId',
      'intentGenerationSource',
      'intentGenerationProvider',
      'intentGenerationModel',
      'intentQualityStatus',
      'intentSafetyStatus',
      'commentId',
      'parentCommentId',
      'userId',
      'nickname',
      'commentText',
      'commentTimeIso',
      'visibleRegion',
      'dedupeKey',
      'raw',
    ] as const;
    for (const field of fields) {
      const nextValue = next[field];
      if (this.isEmptyCaptureValue(existing[field]) && !this.isEmptyCaptureValue(nextValue)) {
        (update as Record<string, unknown>)[field] = nextValue;
      }
    }
    return update;
  }

  private isEmptyCaptureValue(value: unknown) {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  }

  async detail(id: string, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    return this.findRobotOrThrow(id, user);
  }

  async create(dto: CreateRobotDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const expireAt = this.parseOptionalDate(dto.expireAt, 'expireAt');
    const auth = dto.authId ? await this.findAuthOrThrow(dto.authId, user, tenantId) : null;
    const device = dto.deviceId ? await this.findDeviceOrThrow(dto.deviceId, user, tenantId) : null;
    this.ensureRobotBindingCompatibility(dto.platform, auth, device);
    if (dto.type === 'INTERCEPT') {
      await this.assertInterceptRobotPromptConfigBound(dto.config ?? {}, tenantId);
    }

    const robot = await this.prisma.robot.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        type: dto.type,
        platform: dto.platform,
        status: this.computeEditableRobotStatus('DRAFT', auth, device, expireAt),
        authId: auth?.id ?? null,
        deviceId: device?.id ?? null,
        expireAt,
        config: this.prepareRobotConfigForSave(dto.config ?? {}),
        remark: dto.remark,
        createdById: user.id,
      },
      include: robotInclude,
    });
    return this.withRuntimePolicyDefaults(robot);
  }

  async update(id: string, dto: UpdateRobotDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const existing = await this.findRobotOrThrow(id, user);
    if (RUNNING_ROBOT_STATUSES.includes(existing.status)) {
      throw new ConflictException('运行中的机器人请先停止后再编辑');
    }

    const tenantId = existing.tenantId;
    const nextPlatform = dto.platform ?? existing.platform;
    const nextAuthId = dto.authId !== undefined ? this.normalizeNullableId(dto.authId) : existing.authId;
    const nextDeviceId = dto.deviceId !== undefined ? this.normalizeNullableId(dto.deviceId) : existing.deviceId;
    const expireAt = dto.expireAt !== undefined ? this.parseOptionalDate(dto.expireAt, 'expireAt') : existing.expireAt;
    const auth = nextAuthId ? await this.findAuthOrThrow(nextAuthId, user, tenantId) : null;
    const device = nextDeviceId ? await this.findDeviceOrThrow(nextDeviceId, user, tenantId) : null;
    this.ensureRobotBindingCompatibility(nextPlatform, auth, device);
    const nextType = dto.type ?? existing.type;
    if (nextType === 'INTERCEPT') {
      await this.assertInterceptRobotPromptConfigBound(dto.config !== undefined ? dto.config : (existing.config as Record<string, unknown> | undefined), tenantId);
    }

    const updated = await this.prisma.robot.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.authId !== undefined ? { authId: nextAuthId } : {}),
        ...(dto.deviceId !== undefined ? { deviceId: nextDeviceId } : {}),
        ...(dto.expireAt !== undefined ? { expireAt } : {}),
        ...(dto.config !== undefined ? { config: this.prepareRobotConfigForSave(dto.config, existing.config as Prisma.JsonValue | null) } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
        status: this.computeEditableRobotStatus(existing.status, auth, device, expireAt),
      },
      include: robotInclude,
    });
    return this.withRuntimePolicyDefaults(updated);
  }


  async updateRuntimeStatus(id: string, dto: UpdateRobotRuntimeStatusDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    const now = new Date();
    const status = dto.status;
    const stopReason = dto.stopReason ?? (status === 'EXPIRED' ? 'EXPIRED' : status === 'STOPPED' ? 'MANUAL' : robot.stopReason);

    const terminal = ['STOPPED', 'DISABLED', 'ERROR', 'EXPIRED'].includes(status);
    const data: Prisma.RobotUpdateInput = {
      status,
      lastHeartbeatAt: status === 'RUNNING' ? now : robot.lastHeartbeatAt,
      startedAt: status === 'RUNNING' ? robot.startedAt ?? now : robot.startedAt,
      stoppedAt: terminal ? now : status === 'RUNNING' ? null : robot.stoppedAt,
      stopReason: terminal ? stopReason : status === 'RUNNING' ? null : robot.stopReason,
      lastError: dto.lastError ?? (status === 'RUNNING' ? null : robot.lastError),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.robot.update({ where: { id: robot.id }, data });
      if (status === 'RUNNING') {
        await tx.robotRun.updateMany({
          where: { robotId: robot.id, status: 'RUNNING' },
          data: { lastHeartbeatAt: now, lastError: dto.lastError ?? null },
        });
      }
      if (terminal || status === 'STOPPING') {
        await tx.robotRun.updateMany({
          where: { robotId: robot.id, status: 'RUNNING' },
          data: {
            status: status === 'ERROR' ? 'ERROR' : status === 'EXPIRED' ? 'EXPIRED' : status === 'STOPPING' ? 'STOPPING' : 'STOPPED',
            stopReason: terminal || status === 'STOPPING' ? stopReason : undefined,
            stoppedAt: terminal ? now : undefined,
            lastError: dto.lastError,
          },
        });
      }
    });

    return this.findRobotOrThrow(id, user);
  }

  async remove(id: string, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    if (RUNNING_ROBOT_STATUSES.includes(robot.status)) {
      throw new ConflictException('运行中的机器人不能直接删除，请先停止');
    }
    await this.prisma.robot.update({
      where: { id: robot.id },
      data: { deletedAt: new Date(), status: 'DISABLED', stoppedAt: new Date(), stopReason: 'MANUAL' },
    });
    return { success: true };
  }

  async start(id: string, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    const now = new Date();
    if (robot.expireAt && robot.expireAt <= now) {
      await this.markRobotExpired(robot.id, now);
      throw new ConflictException('机器人已过期，无法启动');
    }
    if (robot.status === 'RUNNING') {
      return this.findRobotOrThrow(id, user);
    }
    if (['STOPPING', 'DISABLED', 'EXPIRED'].includes(robot.status)) {
      throw new ConflictException('当前状态不允许启动机器人');
    }
    if (!robot.authId || !robot.deviceId) {
      throw new ConflictException('请先绑定授权和执行设备后再启动');
    }

    const [auth, device] = await Promise.all([
      this.findAuthOrThrow(robot.authId, user, robot.tenantId),
      this.findDeviceOrThrow(robot.deviceId, user, robot.tenantId),
    ]);
    this.ensureRobotStartable(robot, auth, device);
    await this.ensureNoRunningRobotConflict(robot);

    await this.prisma.$transaction(async (tx) => {
      await tx.robot.update({
        where: { id: robot.id },
        data: {
          status: 'RUNNING',
          startedAt: now,
          stoppedAt: null,
          stopReason: null,
          lastError: null,
          lastHeartbeatAt: now,
        },
      });
      await tx.robotRun.create({
        data: {
          tenantId: robot.tenantId,
          robotId: robot.id,
          authId: robot.authId,
          deviceId: robot.deviceId,
          createdById: user.id,
          runToken: this.generateRunToken(),
          status: 'RUNNING',
          startedAt: now,
          lastHeartbeatAt: now,
        },
      });
    });

    return this.findRobotOrThrow(id, user);
  }

  async stop(id: string, dto: StopRobotDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    const now = new Date();
    const stopReason = dto.stopReason ?? 'MANUAL';

    if (['STOPPED', 'EXPIRED', 'DISABLED'].includes(robot.status)) {
      return robot;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.robot.update({
        where: { id: robot.id },
        data: {
          status: stopReason === 'EXPIRED' ? 'EXPIRED' : 'STOPPED',
          stoppedAt: now,
          stopReason,
        },
      });
      await tx.robotRun.updateMany({
        where: { robotId: robot.id, status: 'RUNNING' },
        data: {
          status: stopReason === 'EXPIRED' ? 'EXPIRED' : 'STOPPED',
          stopReason,
          stoppedAt: now,
        },
      });
    });

    return this.findRobotOrThrow(id, user);
  }


  async disable(id: string, dto: StopRobotDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    const now = new Date();
    const stopReason = dto.stopReason ?? 'MANUAL';

    if (robot.status === 'DISABLED') {
      return robot;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.robot.update({
        where: { id: robot.id },
        data: {
          status: 'DISABLED',
          stoppedAt: now,
          stopReason,
        },
      });
      await tx.robotRun.updateMany({
        where: { robotId: robot.id, status: { in: ['RUNNING', 'STOPPING'] } },
        data: {
          status: 'STOPPED',
          stopReason,
          stoppedAt: now,
        },
      });
    });

    return this.findRobotOrThrow(id, user);
  }

  async enable(id: string, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    if (robot.status !== 'DISABLED') {
      return robot;
    }

    const [auth, device] = await Promise.all([
      robot.authId ? this.findAuthOrThrow(robot.authId, user, robot.tenantId) : Promise.resolve(null),
      robot.deviceId ? this.findDeviceOrThrow(robot.deviceId, user, robot.tenantId) : Promise.resolve(null),
    ]);
    const nextStatus = this.computeEditableRobotStatus('DRAFT', auth, device, robot.expireAt);

    await this.prisma.robot.update({
      where: { id: robot.id },
      data: {
        status: nextStatus,
        stoppedAt: null,
        stopReason: null,
        lastError: null,
      },
    });

    return this.findRobotOrThrow(id, user);
  }

  async refreshExpired(user: CurrentUserPayload, tenantId?: string) {
    const scopedTenantId = resolveTenantId(user, tenantId);
    return this.syncExpiredRobots(scopedTenantId);
  }

  async listDevices(query: RobotDeviceQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.RobotDeviceWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { deviceCode: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.robotDevice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: robotDeviceInclude,
      }),
      this.prisma.robotDevice.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async deviceOptions(query: RobotOptionsQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    const items = await this.prisma.robotDevice.findMany({
      where: {
        deletedAt: null,
        status: 'ONLINE',
        ...(tenantId ? { tenantId } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        deviceCode: true,
        platform: true,
        status: true,
        tenantId: true,
      },
    });
    return items.map((item) => ({
      label: item.name,
      value: item.id,
      deviceCode: item.deviceCode,
      platform: item.platform,
      status: item.status,
      tenantId: item.tenantId,
    }));
  }

  async detailDevice(id: string, user: CurrentUserPayload) {
    return this.findDeviceOrThrow(id, user);
  }

  async createDevice(dto: CreateRobotDeviceDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const deviceCode = dto.deviceCode?.trim() || this.generateDeviceCode(dto.platform);
    const deviceSecret = this.generateDeviceSecret();
    const created = await this.prisma.robotDevice.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        platform: dto.platform,
        deviceCode,
        deviceSecretHash: this.hashSecret(deviceSecret),
        status: dto.status ?? 'OFFLINE',
        clientVersion: dto.clientVersion,
        osName: dto.osName,
        remark: dto.remark,
      },
      include: robotDeviceInclude,
    });
    return { ...created, deviceSecret };
  }

  async updateDevice(id: string, dto: UpdateRobotDeviceDto, user: CurrentUserPayload) {
    const existing = await this.findDeviceOrThrow(id, user);
    return this.prisma.robotDevice.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.clientVersion !== undefined ? { clientVersion: dto.clientVersion } : {}),
        ...(dto.osName !== undefined ? { osName: dto.osName } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
      },
      include: robotDeviceInclude,
    });
  }

  async updateDeviceStatus(id: string, dto: UpdateRobotDeviceStatusDto, user: CurrentUserPayload) {
    await this.findDeviceOrThrow(id, user);
    return this.prisma.robotDevice.update({
      where: { id },
      data: { status: dto.status },
      include: robotDeviceInclude,
    });
  }

  async heartbeatDevice(id: string, dto: RobotDeviceHeartbeatDto, user: CurrentUserPayload) {
    await this.findDeviceOrThrow(id, user);
    const now = new Date();
    return this.prisma.robotDevice.update({
      where: { id },
      data: {
        status: dto.status ?? 'ONLINE',
        clientVersion: dto.clientVersion,
        osName: dto.osName,
        ip: dto.ip,
        lastHeartbeatAt: now,
      },
      include: robotDeviceInclude,
    });
  }

  async removeDevice(id: string, user: CurrentUserPayload) {
    const device = await this.findDeviceOrThrow(id, user);
    const runningRobotCount = await this.prisma.robot.count({
      where: {
        deletedAt: null,
        deviceId: device.id,
        status: { in: RUNNING_ROBOT_STATUSES },
      },
    });
    if (runningRobotCount > 0) {
      throw new ConflictException('当前设备下仍有运行中的机器人，无法删除');
    }
    await this.prisma.robotDevice.update({
      where: { id: device.id },
      data: { deletedAt: new Date(), status: 'DISABLED' },
    });
    return { success: true };
  }

  async listAuths(query: RobotAuthQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.RobotPlatformAuthWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { accountName: { contains: query.keyword, mode: 'insensitive' } },
              { accountUid: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.robotPlatformAuth.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: robotAuthInclude,
      }),
      this.prisma.robotPlatformAuth.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async authOptions(query: RobotOptionsQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    const items = await this.prisma.robotPlatformAuth.findMany({
      where: {
        deletedAt: null,
        status: 'AUTHORIZED',
        ...(tenantId ? { tenantId } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        accountUid: true,
        accountName: true,
        status: true,
        tenantId: true,
        sessionExpiresAt: true,
      },
    });
    return items.map((item) => ({
      label: item.accountName || item.accountUid || item.id,
      value: item.id,
      platform: item.platform,
      accountUid: item.accountUid,
      status: item.status,
      tenantId: item.tenantId,
      sessionExpiresAt: item.sessionExpiresAt,
    }));
  }

  async detailAuth(id: string, user: CurrentUserPayload) {
    return this.findAuthOrThrow(id, user);
  }

  async createAuth(dto: CreateRobotAuthDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const deviceId = dto.deviceId ? (await this.findDeviceOrThrow(dto.deviceId, user, tenantId)).id : null;
    const status = dto.status ?? 'UNBOUND';
    return this.prisma.robotPlatformAuth.create({
      data: {
        tenantId,
        platform: dto.platform,
        authType: dto.authType ?? 'QR_SESSION',
        deviceId,
        accountUid: dto.accountUid,
        accountName: dto.accountName,
        accountAvatarUrl: dto.accountAvatarUrl,
        status,
        sessionData: dto.sessionData,
        sessionExpiresAt: this.parseOptionalDate(dto.sessionExpiresAt, 'sessionExpiresAt'),
        authorizedAt: this.parseOptionalDate(dto.authorizedAt, 'authorizedAt') ?? (status === 'AUTHORIZED' ? new Date() : null),
        authorizedByUserId: status === 'AUTHORIZED' ? user.id : null,
        remark: dto.remark,
      },
      include: robotAuthInclude,
    });
  }

  async updateAuth(id: string, dto: UpdateRobotAuthDto, user: CurrentUserPayload) {
    const existing = await this.findAuthOrThrow(id, user);
    const deviceId = dto.deviceId !== undefined ? this.normalizeNullableId(dto.deviceId) : existing.deviceId;
    if (deviceId) {
      await this.findDeviceOrThrow(deviceId, user, existing.tenantId);
    }
    const nextStatus = dto.status ?? existing.status;
    return this.prisma.robotPlatformAuth.update({
      where: { id: existing.id },
      data: {
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.authType !== undefined ? { authType: dto.authType } : {}),
        ...(dto.deviceId !== undefined ? { deviceId } : {}),
        ...(dto.accountUid !== undefined ? { accountUid: dto.accountUid } : {}),
        ...(dto.accountName !== undefined ? { accountName: dto.accountName } : {}),
        ...(dto.accountAvatarUrl !== undefined ? { accountAvatarUrl: dto.accountAvatarUrl } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.sessionData !== undefined ? { sessionData: dto.sessionData } : {}),
        ...(dto.sessionExpiresAt !== undefined ? { sessionExpiresAt: this.parseOptionalDate(dto.sessionExpiresAt, 'sessionExpiresAt') } : {}),
        ...(dto.authorizedAt !== undefined ? { authorizedAt: this.parseOptionalDate(dto.authorizedAt, 'authorizedAt') } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
        ...(nextStatus === 'AUTHORIZED' ? { authorizedByUserId: existing.authorizedByUserId ?? user.id } : {}),
        ...(nextStatus === 'REVOKED' ? { revokedAt: new Date() } : {}),
      },
      include: robotAuthInclude,
    });
  }

  async updateAuthStatus(id: string, dto: UpdateRobotAuthStatusDto, user: CurrentUserPayload) {
    const auth = await this.findAuthOrThrow(id, user);
    const now = new Date();
    const statusDowngraded = ['WAIT_QR', 'REVOKED', 'AUTH_EXPIRED', 'AUTH_FAILED', 'UNBOUND'].includes(dto.status);
    return this.prisma.robotPlatformAuth.update({
      where: { id: auth.id },
      data: {
        status: dto.status,
        authorizedByUserId: dto.status === 'AUTHORIZED' ? auth.authorizedByUserId ?? user.id : auth.authorizedByUserId,
        authorizedAt: dto.status === 'AUTHORIZED' ? auth.authorizedAt ?? now : auth.authorizedAt,
        lastVerifiedAt: dto.status === 'AUTHORIZED' ? now : auth.lastVerifiedAt,
        revokedAt: dto.status === 'REVOKED' ? now : dto.status === 'AUTHORIZED' || dto.status === 'WAIT_QR' ? null : auth.revokedAt,
        ...(statusDowngraded ? { sessionData: null, sessionExpiresAt: null } : {}),
      },
      include: robotAuthInclude,
    });
  }

  async removeAuth(id: string, user: CurrentUserPayload) {
    const auth = await this.findAuthOrThrow(id, user);
    const boundRobotCount = await this.prisma.robot.count({
      where: {
        deletedAt: null,
        authId: auth.id,
        status: { in: ['DRAFT', 'READY', 'RUNNING', 'STOPPING', 'STOPPED', 'ERROR'] },
      },
    });
    if (boundRobotCount > 0) {
      throw new ConflictException('当前授权仍被机器人引用，无法删除');
    }
    await this.prisma.robotPlatformAuth.update({
      where: { id: auth.id },
      data: { deletedAt: new Date(), status: 'REVOKED', revokedAt: new Date() },
    });
    return { success: true };
  }

  async createPairSession(dto: CreateRobotPairSessionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const ttlSeconds = this.normalizeTtlSeconds(dto.ttlSeconds, 600, 60, 3600);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const sessionId = randomUUID();
    const pairCode = this.generatePairCode();
    const session: RobotPairSessionPayload = {
      id: sessionId,
      tenantId,
      platform: dto.platform,
      pairCode,
      status: 'PENDING',
      createdById: user.id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await Promise.all([
      this.saveRedisJson(this.buildPairSessionKey(sessionId), session, expiresAt),
      this.redisService.set(this.buildPairCodeKey(pairCode), sessionId, ttlSeconds),
    ]);

    return session;
  }

  async getPairSession(sessionId: string, user: CurrentUserPayload) {
    const session = await this.getRequiredPairSession(sessionId);
    this.ensureSessionTenantAccess(user, session.tenantId);
    return session;
  }

  async consumePairSession(dto: ConsumeRobotPairSessionDto) {
    const sessionId = await this.redisService.get(this.buildPairCodeKey(dto.pairCode));
    if (!sessionId) {
      throw new NotFoundException('配对会话不存在或已失效');
    }
    const session = await this.getRequiredPairSession(sessionId);
    if (session.status !== 'PENDING') {
      throw new ConflictException('当前配对会话不可用');
    }

    const device = await this.verifyDeviceCredentials(dto.deviceCode, dto.deviceSecret, session.tenantId);
    if (session.platform && device.platform && session.platform !== device.platform) {
      throw new ConflictException('设备平台与配对会话平台不一致');
    }

    const now = new Date();
    await this.prisma.robotDevice.update({
      where: { id: device.id },
      data: {
        status: 'ONLINE',
        clientVersion: dto.clientVersion,
        osName: dto.osName,
        ip: dto.ip,
        lastHeartbeatAt: now,
      },
    });

    const nextSession: RobotPairSessionPayload = {
      ...session,
      status: 'CONFIRMED',
      deviceId: device.id,
      deviceCode: device.deviceCode,
      deviceName: device.name,
      clientVersion: dto.clientVersion ?? session.clientVersion,
      osName: dto.osName ?? session.osName,
      ip: dto.ip ?? session.ip,
      confirmedAt: now.toISOString(),
    };

    await this.saveRedisJson(this.buildPairSessionKey(session.id), nextSession, new Date(session.expiresAt));
    return nextSession;
  }

  async createAuthSession(dto: CreateRobotAuthSessionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const auth = await this.findAuthOrThrow(dto.authId, user, tenantId);
    const device = await this.findDeviceOrThrow(dto.deviceId, user, tenantId);
    if (auth.platform !== device.platform && device.platform) {
      throw new ConflictException('授权平台与设备平台不一致');
    }

    const ttlSeconds = this.normalizeTtlSeconds(dto.ttlSeconds, 600, 60, 3600);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const session: RobotAuthSessionPayload = {
      id: randomUUID(),
      tenantId,
      authId: auth.id,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      platform: auth.platform,
      status: 'PENDING',
      requestedByUserId: user.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await Promise.all([
      this.prisma.robotPlatformAuth.update({
        where: { id: auth.id },
        data: {
          status: 'WAIT_QR',
          deviceId: device.id,
          revokedAt: null,
        },
      }),
      this.saveRedisJson(this.buildAuthSessionKey(session.id), session, expiresAt),
    ]);

    return session;
  }

  async getAuthSession(sessionId: string, user: CurrentUserPayload) {
    const session = await this.getRequiredAuthSession(sessionId);
    this.ensureSessionTenantAccess(user, session.tenantId);
    return session;
  }

  async reportAuthQr(dto: ReportRobotAuthQrDto) {
    const session = await this.getRequiredAuthSession(dto.sessionId);
    await this.verifyDeviceCredentials(dto.deviceCode, dto.deviceSecret, session.tenantId, session.deviceId);

    const nextSession: RobotAuthSessionPayload = {
      ...session,
      status: 'WAIT_QR',
      qrCodeUrl: dto.qrCodeUrl,
      qrCodeContent: dto.qrCodeContent,
      updatedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.prisma.robotPlatformAuth.update({
        where: { id: session.authId },
        data: { status: 'WAIT_QR', deviceId: session.deviceId },
      }),
      this.saveRedisJson(this.buildAuthSessionKey(session.id), nextSession, new Date(session.expiresAt)),
    ]);

    return nextSession;
  }

  async completeAuthSession(dto: CompleteRobotAuthSessionDto) {
    const session = await this.getRequiredAuthSession(dto.sessionId);
    await this.verifyDeviceCredentials(dto.deviceCode, dto.deviceSecret, session.tenantId, session.deviceId);

    const now = new Date();
    const auth = await this.prisma.robotPlatformAuth.update({
      where: { id: session.authId },
      data: {
        status: 'AUTHORIZED',
        deviceId: session.deviceId,
        accountUid: dto.accountUid,
        accountName: dto.accountName,
        accountAvatarUrl: dto.accountAvatarUrl,
        sessionData: dto.sessionData,
        sessionExpiresAt: this.parseOptionalDate(dto.sessionExpiresAt, 'sessionExpiresAt'),
        authorizedAt: now,
        authorizedByUserId: session.requestedByUserId,
        lastVerifiedAt: now,
        revokedAt: null,
      },
      include: robotAuthInclude,
    });

    const nextSession: RobotAuthSessionPayload = {
      ...session,
      status: 'AUTHORIZED',
      accountUid: dto.accountUid,
      accountName: dto.accountName,
      accountAvatarUrl: dto.accountAvatarUrl,
      sessionExpiresAt: dto.sessionExpiresAt,
      updatedAt: now.toISOString(),
    };

    await this.saveRedisJson(this.buildAuthSessionKey(session.id), nextSession, new Date(session.expiresAt));
    return { session: nextSession, auth };
  }


  async syncRobotAuthStatus(id: string, dto: SyncRobotAuthStatusDto, user: CurrentUserPayload) {
    await this.syncExpiredRobots();
    const robot = await this.findRobotOrThrow(id, user);
    const now = new Date();

    const explicitDeviceId = dto.deviceId !== undefined ? this.normalizeNullableId(dto.deviceId) : undefined;
    let deviceId = explicitDeviceId !== undefined ? explicitDeviceId : robot.deviceId;
    if (deviceId) {
      const device = await this.findDeviceOrThrow(deviceId, user, robot.tenantId);
      if (device.platform && device.platform !== robot.platform) {
        throw new ConflictException('机器人平台与执行设备平台不一致');
      }
      deviceId = device.id;
    }

    const existingAuth = robot.authId ? await this.findAuthOrThrow(robot.authId, user, robot.tenantId) : null;
    if (existingAuth && existingAuth.platform !== robot.platform) {
      throw new ConflictException('机器人平台与授权平台不一致');
    }

    const sessionExpiresAt = dto.sessionExpiresAt !== undefined ? this.parseOptionalDate(dto.sessionExpiresAt, 'sessionExpiresAt') : undefined;
    const authorizedAt = dto.authorizedAt !== undefined ? this.parseOptionalDate(dto.authorizedAt, 'authorizedAt') : dto.status === 'AUTHORIZED' ? now : undefined;
    const statusDowngraded = ['WAIT_QR', 'REVOKED', 'AUTH_EXPIRED', 'AUTH_FAILED', 'UNBOUND'].includes(dto.status);
    const shouldClearSession = dto.clearSession === true || statusDowngraded;

    const authData: Prisma.RobotPlatformAuthUpdateInput = {
      status: dto.status,
      ...(explicitDeviceId !== undefined || (!existingAuth?.deviceId && deviceId) ? { device: deviceId ? { connect: { id: deviceId } } : { disconnect: true } } : {}),
      ...(dto.accountUid !== undefined ? { accountUid: dto.accountUid } : {}),
      ...(dto.accountName !== undefined ? { accountName: dto.accountName } : {}),
      ...(dto.accountAvatarUrl !== undefined ? { accountAvatarUrl: dto.accountAvatarUrl } : {}),
      ...(dto.sessionData !== undefined && !shouldClearSession ? { sessionData: dto.sessionData } : {}),
      ...(dto.sessionExpiresAt !== undefined && !shouldClearSession ? { sessionExpiresAt } : {}),
      ...(shouldClearSession ? { sessionData: null, sessionExpiresAt: null } : {}),
      ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
      ...(dto.status === 'AUTHORIZED'
        ? {
            authorizedAt,
            authorizedBy: { connect: { id: user.id } },
            lastVerifiedAt: now,
            revokedAt: null,
          }
        : {}),
      ...(dto.status === 'WAIT_QR' ? { revokedAt: null } : {}),
      ...(dto.status === 'REVOKED' ? { revokedAt: now } : {}),
    };

    const auth = existingAuth
      ? await this.prisma.robotPlatformAuth.update({
          where: { id: existingAuth.id },
          data: authData,
          include: robotAuthInclude,
        })
      : await this.prisma.robotPlatformAuth.create({
          data: {
            tenant: { connect: { id: robot.tenantId } },
            platform: robot.platform,
            authType: 'QR_SESSION',
            status: dto.status,
            ...(deviceId ? { device: { connect: { id: deviceId } } } : {}),
            accountUid: dto.accountUid,
            accountName: dto.accountName,
            accountAvatarUrl: dto.accountAvatarUrl,
            sessionData: shouldClearSession ? null : dto.sessionData,
            sessionExpiresAt: shouldClearSession ? null : sessionExpiresAt,
            authorizedAt: dto.status === 'AUTHORIZED' ? authorizedAt ?? now : null,
            ...(dto.status === 'AUTHORIZED' ? { authorizedBy: { connect: { id: user.id } }, lastVerifiedAt: now } : {}),
            revokedAt: dto.status === 'REVOKED' ? now : null,
            remark: dto.remark,
          },
          include: robotAuthInclude,
        });

    const shouldBindDevice = explicitDeviceId !== undefined || (!robot.deviceId && deviceId);
    const updatedRobot = await this.prisma.robot.update({
      where: { id: robot.id },
      data: {
        auth: { connect: { id: auth.id } },
        ...(shouldBindDevice ? (deviceId ? { device: { connect: { id: deviceId } } } : { device: { disconnect: true } }) : {}),
      },
      include: robotInclude,
    });
    return this.withRuntimePolicyDefaults(updatedRobot);
  }



  async listPrivateMessageRobots(query: PrivateMessageRobotQueryDto, user: CurrentUserPayload) {
    const result = await this.list({ ...query, type: 'LEAD_PRIVATE_MESSAGE' } as RobotQueryDto, user);
    const items = await Promise.all(result.items.map(async (item: any) => this.enrichPrivateMessageRobot(item)));
    return { ...result, items };
  }

  async detailPrivateMessageRobot(id: string, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(id, user);
    this.ensurePrivateMessageRobot(robot);
    return this.enrichPrivateMessageRobot(robot as any);
  }

  async createPrivateMessageRobot(dto: CreatePrivateMessageRobotDto, user: CurrentUserPayload) {
    const config = this.buildPrivateMessageConfig(dto);
    const robot = await this.create(
      {
        tenantId: dto.tenantId,
        name: dto.name,
        type: 'LEAD_PRIVATE_MESSAGE',
        platform: dto.platform,
        authId: dto.authId || dto.boundAccountId,
        deviceId: dto.deviceId,
        expireAt: dto.expireAt,
        config: { leadPrivateMessage: config },
        remark: dto.remark,
      } as CreateRobotDto,
      user,
    );
    return this.enrichPrivateMessageRobot(robot as any);
  }

  async updatePrivateMessageRobot(id: string, dto: UpdatePrivateMessageRobotDto, user: CurrentUserPayload) {
    const existing = await this.findRobotOrThrow(id, user);
    this.ensurePrivateMessageRobot(existing);
    const existingConfig = this.extractPrivateMessageConfig(existing.config as Record<string, unknown> | null);
    const nextConfig = this.buildPrivateMessageConfig(dto, existingConfig);
    const baseConfig = this.ensureJsonRecord(existing.config);
    const updated = await this.update(
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        type: 'LEAD_PRIVATE_MESSAGE',
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.authId !== undefined || dto.boundAccountId !== undefined ? { authId: dto.authId || dto.boundAccountId || '' } : {}),
        ...(dto.deviceId !== undefined ? { deviceId: dto.deviceId } : {}),
        ...(dto.expireAt !== undefined ? { expireAt: dto.expireAt } : {}),
        config: { ...baseConfig, leadPrivateMessage: nextConfig },
        ...(dto.remark !== undefined ? { remark: dto.remark } : {}),
      } as UpdateRobotDto,
      user,
    );
    return this.enrichPrivateMessageRobot(updated as any);
  }

  async removePrivateMessageRobot(id: string, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(id, user);
    this.ensurePrivateMessageRobot(robot);
    return this.remove(id, user);
  }

  async pausePrivateMessageRobot(id: string, user: CurrentUserPayload) {
    return this.patchPrivateMessagePaused(id, true, user);
  }

  async resumePrivateMessageRobot(id: string, user: CurrentUserPayload) {
    return this.patchPrivateMessagePaused(id, false, user);
  }

  async getPrivateMessageRuntimeConfig(id: string, user: CurrentUserPayload) {
    const robot = await this.detailPrivateMessageRobot(id, user) as any;
    return {
      robotId: robot.id,
      platform: robot.platform,
      status: robot.status,
      authId: robot.authId,
      deviceId: robot.deviceId,
      config: robot.leadPrivateMessageConfig ?? robot.privateMessageConfig,
      enabled: (robot.leadPrivateMessageConfig ?? robot.privateMessageConfig).enabled,
      paused: (robot.leadPrivateMessageConfig ?? robot.privateMessageConfig).paused,
      executionStatus: robot.executionStatus,
      todaySentCount: robot.todaySentCount,
      pendingTaskCount: robot.pendingTaskCount,
    };
  }

  async createPrivateMessageTasks(dto: CreatePrivateMessageTasksDto, user: CurrentUserPayload) {
    const captureIds = Array.from(new Set((dto.captureIds || []).map((item) => item?.trim()).filter(Boolean)));
    const robotIds = Array.from(new Set((dto.robotIds || []).map((item) => item?.trim()).filter(Boolean)));
    if (!captureIds.length) throw new BadRequestException('请先选择捕获数据');
    if (!robotIds.length) throw new BadRequestException('请选择主动私信机器人');
    const plannedStartAt = this.parseOptionalDate(dto.plannedStartAt, 'plannedStartAt');
    const plannedEndAt = this.parseOptionalDate(dto.plannedEndAt, 'plannedEndAt');
    if (!plannedStartAt || !plannedEndAt || plannedEndAt <= plannedStartAt) {
      throw new BadRequestException('任务执行时间范围不合法');
    }

    const robot = await this.findRobotOrThrow(robotIds[0], user);
    this.ensurePrivateMessageRobot(robot);
    const robotConfig = this.extractPrivateMessageConfig(robot.config as Record<string, unknown> | null);
    if (!robotConfig.enabled) throw new ConflictException('选择的主动私信机器人未启用');
    const messageOverrideMap = new Map(
      (dto.messageOverrides || [])
        .map((item) => [String(item.captureId || '').trim(), String(item.messageFinal || '').trim()] as const)
        .filter(([captureId, message]) => Boolean(captureId && message)),
    );

    const tenantId = resolveTenantId(user, robot.tenantId);
    const captures = await this.prisma.interceptCaptureRecord.findMany({
      where: { id: { in: captureIds }, ...(tenantId ? { tenantId } : {}) },
      orderBy: { capturedAt: 'desc' },
    });
    const captureMap = new Map<string, any>((captures as any[]).map((item) => [item.id, item]));
    const batchId = randomUUID();
    const batchNo = `PMB${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}${randomUUID().slice(0, 4).toUpperCase()}`;
    const now = new Date();
    const items: Array<{ captureId: string; created: boolean; taskId?: string; reason?: string }> = [];
    let createdCount = 0;
    let skippedCount = 0;

    await this.executeRaw(
      `INSERT INTO "PrivateMessageTaskBatch" ("id", "batchNo", "tenantId", "createdBy", "selectedCount", "createdCount", "skippedCount", "robotIds", "plannedStartAt", "plannedEndAt", "status", "remark", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,0,0,$6::jsonb,$7,$8,'CREATING',$9,$10,$10)`,
      batchId,
      batchNo,
      robot.tenantId,
      user.id,
      captureIds.length,
      JSON.stringify(robotIds),
      plannedStartAt,
      plannedEndAt,
      dto.remark || null,
      now,
    );

    for (const captureId of captureIds) {
      const capture = captureMap.get(captureId);
      const validation = await this.validatePrivateMessageTaskCandidate(capture, robot as any, robotConfig, messageOverrideMap.get(captureId));
      if (!validation.ok) {
        skippedCount += 1;
        items.push({ captureId, created: false, reason: validation.reason });
        continue;
      }
      const taskId = randomUUID();
      const taskNo = `PMT${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}${randomUUID().slice(0, 6).toUpperCase()}`;
      const status = plannedStartAt > now ? 'WAITING_WINDOW' : 'PENDING';
      await this.executeRaw(
        `INSERT INTO "PrivateMessageTask" (
          "id", "taskNo", "batchId", "tenantId", "captureId", "robotId", "platform",
          "targetUserId", "targetNickname", "targetProfileUrl", "sourceContentTitle", "sourceContentUrl", "sourceCommentId", "sourceCommentText",
          "intentLevel", "intentScore", "entryPointSummary", "messageDraft", "messageFinal", "messageSource",
          "replyTraceId", "generationSource", "generationProvider", "generationModel", "qualityStatus", "safetyStatus",
          "plannedStartAt", "plannedEndAt", "status", "priority", "riskLevel", "riskReason", "createdBy", "createdAt", "updatedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,0,$29,$30,$31,$32,$32)`,
        taskId,
        taskNo,
        batchId,
        capture!.tenantId,
        capture!.id,
        robot.id,
        capture!.platform || robot.platform,
        validation.targetUserId,
        validation.targetNickname,
        validation.targetProfileUrl,
        validation.sourceContentTitle,
        validation.sourceContentUrl,
        validation.sourceCommentId,
        validation.sourceCommentText,
        validation.intentLevel,
        validation.intentScore,
        validation.entryPointSummary,
        validation.messageDraft,
        validation.messageSource,
        validation.replyTraceId,
        validation.generationSource,
        validation.generationProvider,
        validation.generationModel,
        validation.qualityStatus,
        validation.safetyStatus,
        plannedStartAt,
        plannedEndAt,
        status,
        validation.riskLevel,
        validation.riskReason,
        user.id,
        now,
      );
      createdCount += 1;
      items.push({ captureId, created: true, taskId });
    }

    await this.executeRaw(
      `UPDATE "PrivateMessageTaskBatch" SET "createdCount"=$1, "skippedCount"=$2, "status"=$3, "updatedAt"=$4 WHERE "id"=$5`,
      createdCount,
      skippedCount,
      createdCount > 0 && skippedCount > 0 ? 'PARTIAL_CREATED' : createdCount > 0 ? 'CREATED' : 'SKIPPED',
      new Date(),
      batchId,
    );

    return { batchId, batchNo, selectedCount: captureIds.length, createdCount, skippedCount, items };
  }

  async listPrivateMessageTasks(query: PrivateMessageTaskQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const params: any[] = [];
    const where: string[] = [];
    const add = (sql: string, value?: any) => {
      if (value !== undefined) {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
      } else {
        where.push(sql);
      }
    };
    if (tenantId) add(`t."tenantId" = ?`, tenantId);
    if (query.platform) add(`t."platform" = ?`, query.platform);
    if (query.robotId) add(`t."robotId" = ?`, query.robotId);
    if (query.status) add(`t."status" = ?`, query.status);
    if (query.intentLevel) add(`t."intentLevel" = ?`, query.intentLevel);
    if (query.riskLevel) add(`t."riskLevel" = ?`, query.riskLevel);
    if (query.plannedStartAt) add(`t."plannedEndAt" >= ?`, this.parseOptionalDate(query.plannedStartAt, 'plannedStartAt'));
    if (query.plannedEndAt) add(`t."plannedStartAt" <= ?`, this.parseOptionalDate(query.plannedEndAt, 'plannedEndAt'));
    if (query.createdStartAt) add(`t."createdAt" >= ?`, this.parseOptionalDate(query.createdStartAt, 'createdStartAt'));
    if (query.createdEndAt) add(`t."createdAt" <= ?`, this.parseOptionalDate(query.createdEndAt, 'createdEndAt'));
    const keyword = query.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(t."taskNo" ILIKE $${params.length} OR t."targetNickname" ILIKE $${params.length} OR t."sourceCommentText" ILIKE $${params.length} OR t."sourceContentTitle" ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await this.queryRaw<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "PrivateMessageTask" t ${whereSql}`, ...params);
    const total = Number(countRows[0]?.count || 0);
    const rows = await this.queryRaw<PrivateMessageTaskRow>(
      `SELECT t.*, r."name" AS "robotName", r."status" AS "robotStatus", b."batchNo" AS "batchNo"
       FROM "PrivateMessageTask" t
       LEFT JOIN "Robot" r ON r."id" = t."robotId"
       LEFT JOIN "PrivateMessageTaskBatch" b ON b."id" = t."batchId"
       ${whereSql}
       ORDER BY t."createdAt" DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params,
      take,
      skip,
    );
    return { items: rows.map((row) => this.normalizePrivateMessageTaskRow(row)), page, pageSize, total };
  }

  async cancelPrivateMessageTask(id: string, user: CurrentUserPayload) {
    const task = await this.findPrivateMessageTaskOrThrow(id, user);
    if (PRIVATE_MESSAGE_TERMINAL_STATUSES.includes(String(task.status))) {
      return this.normalizePrivateMessageTaskRow(task);
    }
    await this.executeRaw(`UPDATE "PrivateMessageTask" SET "status"='CANCELED', "updatedAt"=$1 WHERE "id"=$2`, new Date(), id);
    return this.normalizePrivateMessageTaskRow({ ...task, status: 'CANCELED', updatedAt: new Date() });
  }

  async retryPrivateMessageTask(id: string, user: CurrentUserPayload) {
    const task = await this.findPrivateMessageTaskOrThrow(id, user);
    if (!['FAILED', 'BLOCKED', 'EXPIRED', 'SKIPPED', 'CANCELED'].includes(String(task.status))) {
      throw new ConflictException('只有失败、拦截、过期、跳过或取消的任务可以重试');
    }
    await this.executeRaw(
      `UPDATE "PrivateMessageTask" SET "status"='PENDING', "claimToken"=NULL, "claimedAt"=NULL, "claimedByRobotId"=NULL, "sendError"=NULL, "updatedAt"=$1 WHERE "id"=$2`,
      new Date(),
      id,
    );
    return this.normalizePrivateMessageTaskRow({ ...task, status: 'PENDING', claimToken: null, claimedAt: null, claimedByRobotId: null, sendError: null, updatedAt: new Date() });
  }

  async updatePrivateMessageTaskMessage(id: string, dto: UpdatePrivateMessageTaskMessageDto, user: CurrentUserPayload) {
    const task = await this.findPrivateMessageTaskOrThrow(id, user);
    if (['CLAIMED', 'RUNNING', 'SENT'].includes(String(task.status))) {
      throw new ConflictException('已领取、执行中或已发送的任务不能编辑私信文案');
    }
    const messageFinal = String(dto.messageFinal || '').trim();
    if (!messageFinal) throw new BadRequestException('主动私信内容不能为空');
    await this.executeRaw(
      `UPDATE "PrivateMessageTask" SET "messageFinal"=$1, "messageSource"='MANUAL_EDIT', "updatedAt"=$2 WHERE "id"=$3`,
      messageFinal,
      new Date(),
      id,
    );
    return this.normalizePrivateMessageTaskRow({ ...task, messageFinal, messageSource: 'MANUAL_EDIT', updatedAt: new Date() });
  }

  async deletePrivateMessageTask(id: string, user: CurrentUserPayload) {
    const task = await this.findPrivateMessageTaskOrThrow(id, user);
    const result = await this.executeRaw(`DELETE FROM "PrivateMessageTask" WHERE "id"=$1`, task.id);
    return { deleted: Number(result || 0) };
  }

  async deletePrivateMessageTaskBatch(dto: DeletePrivateMessageTaskBatchDto, user: CurrentUserPayload) {
    const ids = Array.from(new Set((Array.isArray(dto.ids) ? dto.ids : []).map((item) => item?.trim()).filter(Boolean)));
    if (!ids.length) return { deleted: 0 };
    const tenantId = resolveTenantId(user, undefined);
    const result = await this.executeRaw(
      `DELETE FROM "PrivateMessageTask" WHERE "id" = ANY($1::text[]) ${tenantId ? 'AND "tenantId"=$2' : ''}`,
      ...(tenantId ? [ids, tenantId] : [ids]),
    );
    return { deleted: Number(result || 0) };
  }

  async clearPrivateMessageTasks(query: PrivateMessageTaskQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    const params: any[] = [];
    const where: string[] = [];
    const add = (sql: string, value?: any) => {
      if (value !== undefined) {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
      } else {
        where.push(sql);
      }
    };
    if (tenantId) add(`"tenantId" = ?`, tenantId);
    if (query.platform) add(`"platform" = ?`, query.platform);
    if (query.robotId) add(`"robotId" = ?`, query.robotId);
    if (query.status) add(`"status" = ?`, query.status);
    if (query.intentLevel) add(`"intentLevel" = ?`, query.intentLevel);
    if (query.riskLevel) add(`"riskLevel" = ?`, query.riskLevel);
    if (query.plannedStartAt) add(`"plannedEndAt" >= ?`, this.parseOptionalDate(query.plannedStartAt, 'plannedStartAt'));
    if (query.plannedEndAt) add(`"plannedStartAt" <= ?`, this.parseOptionalDate(query.plannedEndAt, 'plannedEndAt'));
    if (query.createdStartAt) add(`"createdAt" >= ?`, this.parseOptionalDate(query.createdStartAt, 'createdStartAt'));
    if (query.createdEndAt) add(`"createdAt" <= ?`, this.parseOptionalDate(query.createdEndAt, 'createdEndAt'));
    const keyword = query.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`("taskNo" ILIKE $${params.length} OR "targetNickname" ILIKE $${params.length} OR "sourceCommentText" ILIKE $${params.length} OR "sourceContentTitle" ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.executeRaw(`DELETE FROM "PrivateMessageTask" ${whereSql}`, ...params);
    return { deleted: Number(result || 0) };
  }

  async claimPrivateMessageTasks(dto: ClaimPrivateMessageTaskDto, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(dto.robotId, user);
    this.ensurePrivateMessageRobot(robot);
    const config = this.extractPrivateMessageConfig(robot.config as Record<string, unknown> | null);
    if (!config.enabled) return { items: [], reason: '主动私信机器人未启用' };
    if (config.paused) return { items: [], reason: '主动私信机器人已暂停' };
    const timeReason = this.getPrivateMessageTimeBlockReason(config, new Date());
    if (timeReason) return { items: [], reason: timeReason };
    // 主动私信机器人是“截流线索主动触达”的执行配置，不再要求绑定授权账号或执行设备。
    // 是否可领取任务由 enabled/paused、执行时间窗口和频控决定；只拦截已禁用/过期/异常等不可用状态。
    if (['DISABLED', 'EXPIRED', 'ERROR', 'STOPPING'].includes(robot.status)) return { items: [], reason: '主动私信机器人状态不可用' };

    const dailySent = await this.countPrivateMessageTasks(`"robotId"=$1 AND "status"='SENT' AND "sentAt" >= date_trunc('day', now())`, robot.id);
    if (dailySent >= config.dailySendLimit) return { items: [], reason: '今日发送量已达上限' };
    const hourlySent = await this.countPrivateMessageTasks(`"robotId"=$1 AND "status"='SENT' AND "sentAt" >= now() - interval '1 hour'`, robot.id);
    if (hourlySent >= config.hourlySendLimit) return { items: [], reason: '本小时发送量已达上限' };

    const limit = Math.max(1, Math.min(Number(dto.limit || config.claimBatchSize || 1), Math.max(1, config.dailySendLimit - dailySent), 20));
    const now = new Date();
    const claimToken = randomUUID();
    const platform = dto.platform || robot.platform;
    const rows = await this.prisma.$transaction(async (tx) => {
      // maxConsecutiveFailures 是单任务自动重试保护，不应该因为一次 DOM 调试失败就让任务永久消失。
      // 旧逻辑如果配置为 1，任务第一次 FAILED 后重新启动机器人会直接提示“暂无可执行任务”。
      // 这里保留上限保护，但给自动化调试/页面结构波动留出至少 10 次可领取机会；超过后仍可在 PC 后台点“重试”重置。
      const maxRetryAttempts = Math.max(10, Number(config.maxConsecutiveFailures || 5));
      const claimed = (await tx.$queryRawUnsafe(
        `SELECT * FROM "PrivateMessageTask"
         WHERE "tenantId"=$1 AND "robotId"=$2 AND "platform"=$3
           AND "plannedEndAt" >= $4
           AND (
             ("status" IN ('PENDING','WAITING_WINDOW') AND "plannedStartAt" <= $4)
             OR ("status"='FAILED' AND COALESCE("sendAttemptCount", 0) < $5)
             OR ("status"='CLAIMED' AND "claimedAt" IS NOT NULL AND "claimedAt" <= $4 - interval '10 minutes')
           )
         ORDER BY
           CASE "status"
             WHEN 'PENDING' THEN 0
             WHEN 'WAITING_WINDOW' THEN 1
             WHEN 'FAILED' THEN 2
             WHEN 'CLAIMED' THEN 3
             ELSE 9
           END ASC,
           "priority" DESC,
           "createdAt" ASC
         LIMIT $6
         FOR UPDATE SKIP LOCKED`,
        robot.tenantId,
        robot.id,
        platform,
        now,
        maxRetryAttempts,
        limit,
      )) as PrivateMessageTaskRow[];
      if (!claimed.length) return [];
      const ids = claimed.map((item) => item.id);
      await tx.$executeRawUnsafe(
        `UPDATE "PrivateMessageTask" SET "status"='CLAIMED', "claimToken"=$1, "claimedAt"=$2, "claimedByRobotId"=$3, "sendError"=NULL, "updatedAt"=$2 WHERE "id" = ANY($4::text[])`,
        claimToken,
        now,
        robot.id,
        ids,
      );
      return claimed.map((item) => ({ ...item, status: 'CLAIMED', claimToken, claimedAt: now, claimedByRobotId: robot.id, updatedAt: now }));
    });
    await this.prisma.robot.update({ where: { id: robot.id }, data: { lastHeartbeatAt: now, lastError: null } });
    return { items: rows.map((row) => this.normalizePrivateMessageTaskRow(row)), claimToken };
  }

  async reportPrivateMessageTask(dto: ReportPrivateMessageTaskDto, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(dto.robotId, user);
    this.ensurePrivateMessageRobot(robot);
    const task = await this.findPrivateMessageTaskOrThrow(dto.taskId, user);
    if (task.robotId !== robot.id) throw new ConflictException('任务不属于当前主动私信机器人');
    const now = new Date();
    const finalStatus = dto.status;
    const errorMessage = dto.errorMessage || null;
    await this.executeRaw(
      `UPDATE "PrivateMessageTask"
       SET "status"=$1,
           "sendAttemptCount"="sendAttemptCount" + 1,
           "lastSendAt"=$2,
           "sentAt"=CASE WHEN $1='SENT' THEN $2 ELSE "sentAt" END,
           "sendError"=$3,
           "sendResultRaw"=$4::jsonb,
           "updatedAt"=$2
       WHERE "id"=$5`,
      finalStatus,
      now,
      errorMessage,
      JSON.stringify({ errorMessage, screenshotUrl: dto.screenshotUrl || '', raw: dto.raw || null }),
      task.id,
    );
    await this.prisma.robot.update({
      where: { id: robot.id },
      data: { lastHeartbeatAt: now, lastError: finalStatus === 'SENT' ? null : errorMessage },
    });
    return { success: true, taskId: task.id, status: finalStatus };
  }

  async syncExpiredRobots(tenantId?: string) {
    const now = new Date();
    const expiredRobots = await this.prisma.robot.findMany({
      where: {
        deletedAt: null,
        expireAt: { lte: now },
        status: { in: ACTIVE_ROBOT_STATUSES },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    });

    if (!expiredRobots.length) {
      return { expiredCount: 0 };
    }

    const robotIds = expiredRobots.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.robot.updateMany({
        where: { id: { in: robotIds } },
        data: { status: 'EXPIRED', stoppedAt: now, stopReason: 'EXPIRED' },
      });
      await tx.robotRun.updateMany({
        where: { robotId: { in: robotIds }, status: 'RUNNING' },
        data: { status: 'EXPIRED', stopReason: 'EXPIRED', stoppedAt: now },
      });
    });

    return { expiredCount: robotIds.length };
  }


  private ensurePrivateMessageRobot(robot: { type: string }) {
    if (robot.type !== 'LEAD_PRIVATE_MESSAGE') {
      throw new BadRequestException('当前机器人不是主动私信机器人');
    }
  }

  private extractPrivateMessageConfig(config: Record<string, unknown> | null | undefined): PrivateMessageRobotConfig {
    const root = this.ensureJsonRecord(config);
    // leadPrivateMessage 是“截流捕获数据 -> 主动私信高意向用户”的配置。
    // privateMessage 仅作为上一版交付包的兼容读取，避免已经保存过的配置丢失。
    return this.buildPrivateMessageConfig(this.ensureJsonRecord(root.leadPrivateMessage ?? root.privateMessage));
  }

  private buildPrivateMessageConfig(input: Partial<PrivateMessageRobotConfig> | Record<string, unknown> | undefined, existing?: PrivateMessageRobotConfig): PrivateMessageRobotConfig {
    const source = this.ensureJsonRecord(input);
    const base = { ...PRIVATE_MESSAGE_DEFAULT_CONFIG, ...(existing ?? {}) };
    const config = {
      minSendIntervalSeconds: this.normalizePositiveInt(source.minSendIntervalSeconds, base.minSendIntervalSeconds, 1),
      maxSendIntervalSeconds: this.normalizePositiveInt(source.maxSendIntervalSeconds, base.maxSendIntervalSeconds, 1),
      claimBatchSize: this.normalizePositiveInt(source.claimBatchSize, base.claimBatchSize, 1),
      dailySendLimit: this.normalizePositiveInt(source.dailySendLimit, base.dailySendLimit, 1),
      hourlySendLimit: this.normalizePositiveInt(source.hourlySendLimit, base.hourlySendLimit, 1),
      userTouchIntervalDays: this.normalizePositiveInt(source.userTouchIntervalDays, base.userTouchIntervalDays, 0),
      maxConsecutiveFailures: this.normalizePositiveInt(source.maxConsecutiveFailures, base.maxConsecutiveFailures, 1),
      workStartTime: this.normalizeTimeText(source.workStartTime, base.workStartTime),
      workEndTime: this.normalizeTimeText(source.workEndTime, base.workEndTime),
      sleepStartTime: this.normalizeTimeText(source.sleepStartTime, base.sleepStartTime, true),
      sleepEndTime: this.normalizeTimeText(source.sleepEndTime, base.sleepEndTime, true),
      enabled: source.enabled === undefined ? base.enabled : source.enabled !== false,
      paused: source.paused === undefined ? base.paused : source.paused === true,
      defaultMessageTemplate: String(source.defaultMessageTemplate || base.defaultMessageTemplate || PRIVATE_MESSAGE_DEFAULT_CONFIG.defaultMessageTemplate),
    };
    if (config.maxSendIntervalSeconds < config.minSendIntervalSeconds) {
      config.maxSendIntervalSeconds = config.minSendIntervalSeconds;
    }
    return config;
  }

  private normalizePositiveInt(value: unknown, fallback: number, min: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
  }

  private normalizeTimeText(value: unknown, fallback: string, allowEmpty = false) {
    const text = String(value ?? fallback ?? '').trim();
    if (!text && allowEmpty) return '';
    if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(text)) return text.padStart(5, '0');
    return fallback;
  }

  private async enrichPrivateMessageRobot(robot: any) {
    const config = this.extractPrivateMessageConfig(robot.config as Record<string, unknown> | null);
    const [pendingTaskCount, todaySentCount, lastClaimRows, lastSentRows] = await Promise.all([
      this.countPrivateMessageTasks('"robotId"=$1 AND "status" IN (\'PENDING\',\'WAITING_WINDOW\',\'CLAIMED\',\'RUNNING\')', robot.id),
      this.countPrivateMessageTasks('"robotId"=$1 AND "status"=\'SENT\' AND "sentAt" >= date_trunc(\'day\', now())', robot.id),
      this.queryRaw<{ value: Date }>('SELECT MAX("claimedAt") AS value FROM "PrivateMessageTask" WHERE "robotId"=$1', robot.id),
      this.queryRaw<{ value: Date }>('SELECT MAX("sentAt") AS value FROM "PrivateMessageTask" WHERE "robotId"=$1', robot.id),
    ]);
    const executionStatus = config.paused ? 'PAUSED' : robot.status === 'RUNNING' ? (pendingTaskCount > 0 ? 'CLAIMING' : 'IDLE') : robot.status === 'ERROR' ? 'ERROR' : 'IDLE';
    return {
      ...robot,
      leadPrivateMessageConfig: config,
      privateMessageConfig: config,
      executionStatus,
      todaySentCount,
      dailySendLimit: config.dailySendLimit,
      hourlySendLimit: config.hourlySendLimit,
      pendingTaskCount,
      lastClaimedAt: lastClaimRows[0]?.value ?? null,
      lastSentAt: lastSentRows[0]?.value ?? null,
    };
  }

  private async patchPrivateMessagePaused(id: string, paused: boolean, user: CurrentUserPayload) {
    const robot = await this.findRobotOrThrow(id, user);
    this.ensurePrivateMessageRobot(robot);
    const baseConfig = this.ensureJsonRecord(robot.config);
    const config = this.extractPrivateMessageConfig(robot.config as Record<string, unknown> | null);
    config.paused = paused;
    const updated = await this.prisma.robot.update({
      where: { id: robot.id },
      data: { config: this.prepareRobotConfigForSave({ ...baseConfig, leadPrivateMessage: config }, robot.config as Prisma.JsonValue | null) },
      include: robotInclude,
    });
    return this.enrichPrivateMessageRobot(updated as any);
  }

  private async validatePrivateMessageTaskCandidate(
    capture: any,
    robot: { id: string; tenantId: string; platform: string },
    robotConfig: PrivateMessageRobotConfig,
    messageOverride?: string,
  ): Promise<{
    ok: boolean;
    reason?: string;
    targetUserId?: string | null;
    targetNickname?: string | null;
    targetProfileUrl?: string | null;
    sourceContentTitle?: string | null;
    sourceContentUrl?: string | null;
    sourceCommentId?: string | null;
    sourceCommentText?: string | null;
    intentLevel?: string | null;
    intentScore?: number | null;
    entryPointSummary?: string | null;
    messageDraft?: string;
    messageSource?: string;
    replyTraceId?: string | null;
    generationSource?: string | null;
    generationProvider?: string | null;
    generationModel?: string | null;
    qualityStatus?: string | null;
    safetyStatus?: string | null;
    riskLevel?: string | null;
    riskReason?: string | null;
  }> {
    if (!capture) return { ok: false, reason: '捕获数据不存在' };
    const raw = this.ensureJsonRecord(capture.raw);
    const targetUserId = this.pickFirstText(capture.userId, raw.targetUserId, raw.userId, raw.commentUserId);
    const targetNickname = String(capture.nickname || raw.nickname || '').trim() || null;
    const targetProfileUrl = this.buildPrivateMessageTargetProfileUrl(capture, raw, targetUserId);
    if (!targetUserId && !targetProfileUrl) return { ok: false, reason: '捕获数据缺少评论用户 userId 或主页链接，无法创建主动私信任务' };
    const sourceCommentId = String(capture.commentId || raw.commentId || '').trim() || null;
    const messageDraft = this.pickFirstText(
      messageOverride,
      raw.privateMessageDraft,
      raw.messageDraft,
      raw.messageFinal,
      raw.privateMessageContent,
      raw.autoPrivateMessage,
      this.applyPrivateMessageTemplate(robotConfig.defaultMessageTemplate, capture),
    );
    if (!messageDraft) return { ok: false, reason: '捕获数据缺少私信内容' };

    const activeCaptureCount = await this.countPrivateMessageTasks(`"captureId"=$1 AND "status" = ANY($2::text[])`, capture.id, PRIVATE_MESSAGE_ACTIVE_STATUSES);
    if (activeCaptureCount > 0) return { ok: false, reason: '该捕获数据已存在未完成私信任务' };
    if (sourceCommentId) {
      const sameCommentCount = await this.countPrivateMessageTasks(`"tenantId"=$1 AND "sourceCommentId"=$2 AND "status" = ANY($3::text[])`, capture.tenantId, sourceCommentId, PRIVATE_MESSAGE_ACTIVE_STATUSES);
      if (sameCommentCount > 0) return { ok: false, reason: '该评论已存在未完成私信任务' };
    }
    if (targetUserId) {
      const activeUserCount = await this.countPrivateMessageTasks(`"tenantId"=$1 AND "targetUserId"=$2 AND "status" = ANY($3::text[])`, capture.tenantId, targetUserId, PRIVATE_MESSAGE_ACTIVE_STATUSES);
      if (activeUserCount > 0) return { ok: false, reason: '该用户已存在待执行私信任务' };
      if (robotConfig.userTouchIntervalDays > 0) {
        const touchedCount = await this.countPrivateMessageTasks(
          `"tenantId"=$1 AND "targetUserId"=$2 AND "status"='SENT' AND "sentAt" >= now() - ($3::text || ' days')::interval`,
          capture.tenantId,
          targetUserId,
          robotConfig.userTouchIntervalDays,
        );
        if (touchedCount > 0) return { ok: false, reason: `该用户 ${robotConfig.userTouchIntervalDays} 天内已触达` };
      }
    }

    return {
      ok: true,
      targetUserId: targetUserId || null,
      targetNickname,
      targetProfileUrl: targetProfileUrl || null,
      sourceContentTitle: this.pickFirstText(capture.contentTitle, raw.contentTitle, raw.sourceContentTitle) || null,
      sourceContentUrl: this.pickFirstText(capture.contentUrl, capture.targetUrl, raw.contentUrl, raw.sourceContentUrl) || null,
      sourceCommentId,
      sourceCommentText: this.pickFirstText(capture.commentText, raw.commentText, raw.sourceCommentText) || null,
      intentLevel: this.pickFirstText(raw.intentLevel, raw.aiIntentLevel) || null,
      intentScore: this.pickFirstNumber(raw.intentScore, raw.aiIntentScore),
      entryPointSummary: this.pickFirstText(raw.entryPointSummary, raw.entryDecision, raw.intentReason) || null,
      messageDraft,
      messageSource: messageOverride
        ? 'MANUAL_CREATE'
        : this.pickFirstText(raw.generationSource, capture.intentGenerationSource)
          ? 'UNIFIED_AI_DRAFT'
          : raw.privateMessageDraft || raw.messageDraft || raw.messageFinal
            ? 'AI_DRAFT'
            : 'TEMPLATE',
      replyTraceId: messageOverride ? null : this.pickFirstText(raw.replyTraceId, capture.intentReplyTraceId) || null,
      generationSource: messageOverride ? null : this.pickFirstText(raw.generationSource, capture.intentGenerationSource) || null,
      generationProvider: messageOverride ? null : this.pickFirstText(raw.generationProvider, capture.intentGenerationProvider) || null,
      generationModel: messageOverride ? null : this.pickFirstText(raw.generationModel, capture.intentGenerationModel) || null,
      qualityStatus: messageOverride ? null : this.pickFirstText(raw.qualityStatus, capture.intentQualityStatus) || null,
      safetyStatus: messageOverride ? null : this.pickFirstText(raw.safetyStatus, capture.intentSafetyStatus) || null,
      riskLevel: this.pickFirstText(raw.aiRiskLevel, raw.riskLevel) || null,
      riskReason: this.pickFirstText(raw.aiRiskReason, raw.riskReason) || null,
    };
  }

  private getPrivateMessageTimeBlockReason(config: PrivateMessageRobotConfig, now: Date) {
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (config.sleepStartTime && config.sleepEndTime && this.isTimeWithinWindow(hhmm, config.sleepStartTime, config.sleepEndTime)) {
      return '当前处于休眠时间段';
    }
    if (config.workStartTime && config.workEndTime && !this.isTimeWithinWindow(hhmm, config.workStartTime, config.workEndTime)) {
      return '当前不在允许执行时间段内';
    }
    return '';
  }

  private isTimeWithinWindow(current: string, start: string, end: string) {
    if (!start || !end) return true;
    if (start <= end) return current >= start && current <= end;
    return current >= start || current <= end;
  }

  private applyPrivateMessageTemplate(template: string, capture: any) {
    const map: Record<string, string> = {
      nickname: String(capture?.nickname || ''),
      comment: String(capture?.commentText || ''),
      contentTitle: String(capture?.contentTitle || ''),
    };
    return String(template || '').replace(/\{\{\s*(nickname|comment|contentTitle)\s*\}\}/g, (_, key) => map[key] || '');
  }

  private buildPrivateMessageTargetProfileUrl(capture: any, raw: Record<string, unknown>, targetUserId?: string | null) {
    const userId = this.pickFirstText(
      targetUserId,
      capture?.userId,
      capture?.commentUserId,
      raw.targetUserId,
      raw.userId,
      raw.commentUserId,
    );
    const explicitUrl = this.pickFirstText(
      raw.commentUserProfileUrl,
      raw.targetProfileUrl,
      raw.userProfileUrl,
      raw.profileUrl,
      capture?.commentUserProfileUrl,
      capture?.targetProfileUrl,
    );
    const normalizedExplicit = this.normalizePrivateMessageTargetUrl(explicitUrl, userId);
    if (normalizedExplicit) return normalizedExplicit;
    return this.buildPlatformUserProfileUrl(this.pickFirstText(capture?.platform, raw.platform), userId);
  }

  private normalizePrivateMessageTargetUrl(value: unknown, targetUserId?: string | null) {
    const text = this.pickFirstText(value);
    if (!text) return '';
    if (text.startsWith('//')) return `https:${text}`;
    if (text.startsWith('/user/')) return `https://www.douyin.com${text}`;
    if (/^https?:\/\//i.test(text)) {
      if (targetUserId && text.includes('/user/') && !text.includes(targetUserId)) return '';
      return text;
    }
    return this.buildPlatformUserProfileUrl('DOUYIN', text);
  }

  private buildPlatformUserProfileUrl(platform: unknown, targetUserId: unknown) {
    const uid = this.pickFirstText(targetUserId);
    if (!uid) return '';
    if (/^https?:\/\//i.test(uid)) return uid;
    if (uid.startsWith('//')) return `https:${uid}`;
    const normalizedPlatform = this.pickFirstText(platform).toUpperCase();
    if (uid.startsWith('/user/')) return `https://www.douyin.com${uid}`;
    if (!normalizedPlatform || normalizedPlatform === 'DOUYIN' || normalizedPlatform === 'DOU_YIN') {
      return `https://www.douyin.com/user/${encodeURIComponent(uid)}`;
    }
    return '';
  }

  private pickFirstText(...values: unknown[]) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '';
  }

  private pickFirstBoolean(...values: unknown[]) {
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      const text = String(value).trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'run', 'continue', '继续', '是'].includes(text)) return true;
      if (['false', '0', 'no', 'n', 'skip', 'stop', '跳过', '否'].includes(text)) return false;
    }
    return undefined;
  }

  private listToText(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join('，');
    return this.pickFirstText(value);
  }

  private compactTextRecord(record: Record<string, unknown>) {
    return Object.entries(record).reduce<Record<string, string>>((acc, [key, value]) => {
      const text = this.pickFirstText(value);
      if (text) acc[key] = text;
      return acc;
    }, {});
  }

  private pickFirstNumber(...values: unknown[]) {
    for (const value of values) {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  private normalizePrivateMessageTaskRow(row: PrivateMessageTaskRow) {
    const targetUserId = this.pickFirstText(row.targetUserId);
    const normalizedTargetProfileUrl = this.normalizePrivateMessageTargetUrl(row.targetProfileUrl, targetUserId)
      || this.buildPlatformUserProfileUrl(row.platform, targetUserId);
    return {
      ...row,
      id: String(row.id || ''),
      taskNo: String(row.taskNo || ''),
      batchId: row.batchId || null,
      batchNo: row.batchNo || null,
      robotName: row.robotName || null,
      targetProfileUrl: normalizedTargetProfileUrl || row.targetProfileUrl || null,
      targetUrl: normalizedTargetProfileUrl || row.targetProfileUrl || null,
      messageFinal: this.pickFirstText(row.messageFinal, row.messageDraft),
      messageDraft: this.pickFirstText(row.messageDraft, row.messageFinal),
      sendAttemptCount: Number(row.sendAttemptCount || 0),
      priority: Number(row.priority || 0),
    };
  }

  private async findPrivateMessageTaskOrThrow(id: string, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, undefined);
    const rows = await this.queryRaw<PrivateMessageTaskRow>(
      `SELECT t.*, r."name" AS "robotName" FROM "PrivateMessageTask" t LEFT JOIN "Robot" r ON r."id"=t."robotId" WHERE t."id"=$1 ${tenantId ? 'AND t."tenantId"=$2' : ''} LIMIT 1`,
      ...(tenantId ? [id, tenantId] : [id]),
    );
    if (!rows.length) throw new NotFoundException('私信任务不存在');
    return rows[0];
  }

  private async countPrivateMessageTasks(whereSql: string, ...params: any[]) {
    const rows = await this.queryRaw<{ count: number }>(`SELECT COUNT(*)::int AS count FROM "PrivateMessageTask" WHERE ${whereSql}`, ...params);
    return Number(rows[0]?.count || 0);
  }

  private async queryRaw<T = Record<string, unknown>>(sql: string, ...params: any[]): Promise<T[]> {
    try {
      return await this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
    } catch (error) {
      if (error instanceof Error && /PrivateMessageTask|PrivateMessageTaskBatch/.test(error.message)) {
        throw new BadRequestException('私信任务表不存在，请先执行数据库迁移');
      }
      throw error;
    }
  }

  private async executeRaw(sql: string, ...params: any[]) {
    try {
      return await this.prisma.$executeRawUnsafe(sql, ...params);
    } catch (error) {
      if (error instanceof Error && /PrivateMessageTask|PrivateMessageTaskBatch/.test(error.message)) {
        throw new BadRequestException('私信任务表不存在，请先执行数据库迁移');
      }
      throw error;
    }
  }

  private async findRobotOrThrow(id: string, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user);
    const robot = await this.prisma.robot.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      include: robotInclude,
    });
    if (!robot) {
      throw new NotFoundException('机器人不存在');
    }
    return this.withRuntimePolicyDefaults(robot);
  }

  private withRuntimePolicyDefaults<T extends { config: Prisma.JsonValue | null }>(robot: T): T {
    return {
      ...robot,
      config: withDefaultRuntimePolicy((robot.config as Record<string, unknown> | null) ?? {}),
    } as T;
  }

  private async findDeviceOrThrow(id: string, user: CurrentUserPayload, explicitTenantId?: string) {
    const tenantId = resolveTenantId(user, explicitTenantId);
    const device = await this.prisma.robotDevice.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      include: robotDeviceInclude,
    });
    if (!device) {
      throw new NotFoundException('机器人设备不存在');
    }
    return device;
  }

  private async findAuthOrThrow(id: string, user: CurrentUserPayload, explicitTenantId?: string) {
    const tenantId = resolveTenantId(user, explicitTenantId);
    const auth = await this.prisma.robotPlatformAuth.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      include: robotAuthInclude,
    });
    if (!auth) {
      throw new NotFoundException('机器人授权不存在');
    }
    return auth;
  }

  private ensureRobotBindingCompatibility(
    platform: string,
    auth: { platform: string } | null,
    device: { platform: string | null } | null,
  ) {
    if (auth && auth.platform !== platform) {
      throw new ConflictException('机器人平台与授权平台不一致');
    }
    if (device?.platform && device.platform !== platform) {
      throw new ConflictException('机器人平台与执行设备平台不一致');
    }
  }

  private ensureRobotStartable(
    robot: { authId: string | null; deviceId: string | null },
    auth: { status: string; sessionExpiresAt: Date | null },
    device: { status: string },
  ) {
    if (auth.status !== 'AUTHORIZED') {
      throw new ConflictException('当前授权状态不可用，请先完成扫码授权');
    }
    if (auth.sessionExpiresAt && auth.sessionExpiresAt <= new Date()) {
      throw new ConflictException('当前授权已过期，请重新授权');
    }
    if (device.status !== 'ONLINE') {
      throw new ConflictException('当前执行设备不在线，无法启动机器人');
    }
    if (!robot.authId || !robot.deviceId) {
      throw new ConflictException('机器人缺少授权或执行设备');
    }
  }

  private async ensureNoRunningRobotConflict(robot: { id: string; tenantId: string; authId: string | null; deviceId: string | null }) {
    const [sameAuthRunning, sameDeviceRunning] = await Promise.all([
      robot.authId
        ? this.prisma.robot.count({
            where: {
              deletedAt: null,
              id: { not: robot.id },
              tenantId: robot.tenantId,
              authId: robot.authId,
              status: { in: RUNNING_ROBOT_STATUSES },
            },
          })
        : Promise.resolve(0),
      robot.deviceId
        ? this.prisma.robot.count({
            where: {
              deletedAt: null,
              id: { not: robot.id },
              tenantId: robot.tenantId,
              deviceId: robot.deviceId,
              status: { in: RUNNING_ROBOT_STATUSES },
            },
          })
        : Promise.resolve(0),
    ]);

    if (sameAuthRunning > 0) {
      throw new ConflictException('当前授权账号已被其他运行中的机器人占用');
    }
    if (sameDeviceRunning > 0) {
      throw new ConflictException('当前执行设备已被其他运行中的机器人占用');
    }
  }

  private computeEditableRobotStatus(
    currentStatus: string,
    auth: { status: string; sessionExpiresAt?: Date | null } | null,
    device: { status: string } | null,
    expireAt?: Date | null,
  ) {
    if (expireAt && expireAt <= new Date()) {
      return 'EXPIRED';
    }
    if (currentStatus === 'DISABLED') {
      return 'DISABLED';
    }
    if (currentStatus === 'STOPPED') {
      return 'STOPPED';
    }
    if (currentStatus === 'ERROR') {
      return 'ERROR';
    }
    if (auth?.status === 'AUTHORIZED' && (!auth.sessionExpiresAt || auth.sessionExpiresAt > new Date()) && device?.status === 'ONLINE') {
      return 'READY';
    }
    return 'DRAFT';
  }

  private async markRobotExpired(id: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.robot.update({
        where: { id },
        data: { status: 'EXPIRED', stoppedAt: now, stopReason: 'EXPIRED' },
      });
      await tx.robotRun.updateMany({
        where: { robotId: id, status: 'RUNNING' },
        data: { status: 'EXPIRED', stopReason: 'EXPIRED', stoppedAt: now },
      });
    });
  }

  private ensureSessionTenantAccess(user: CurrentUserPayload, tenantId: string) {
    const scopedTenantId = resolveTenantId(user, tenantId);
    if (scopedTenantId !== tenantId) {
      throw new NotFoundException('会话不存在');
    }
  }

  private async getRequiredPairSession(sessionId: string) {
    const session = await this.getRedisJson<RobotPairSessionPayload>(this.buildPairSessionKey(sessionId));
    if (!session) {
      throw new NotFoundException('配对会话不存在或已失效');
    }
    return this.ensureSessionNotExpired(session);
  }

  private async getRequiredAuthSession(sessionId: string) {
    const session = await this.getRedisJson<RobotAuthSessionPayload>(this.buildAuthSessionKey(sessionId));
    if (!session) {
      throw new NotFoundException('授权会话不存在或已失效');
    }
    return this.ensureSessionNotExpired(session);
  }

  private ensureSessionNotExpired<T extends { status: string; expiresAt: string }>(session: T) {
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return { ...session, status: 'EXPIRED' } as T;
    }
    return session;
  }

  private async verifyDeviceCredentials(deviceCode: string, deviceSecret: string, tenantId?: string, deviceId?: string) {
    const device = await this.prisma.robotDevice.findFirst({
      where: {
        deviceCode,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        ...(deviceId ? { id: deviceId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        platform: true,
        deviceCode: true,
        status: true,
        deviceSecretHash: true,
      },
    });
    if (!device) {
      throw new NotFoundException('机器人设备不存在');
    }
    if (device.deviceSecretHash !== this.hashSecret(deviceSecret)) {
      throw new ConflictException('设备认证失败');
    }
    if (device.status === 'DISABLED') {
      throw new ConflictException('当前设备已禁用');
    }
    return device;
  }

  private buildPairSessionKey(sessionId: string) {
    return `${ROBOT_PAIR_SESSION_PREFIX}${sessionId}`;
  }

  private buildPairCodeKey(pairCode: string) {
    return `${ROBOT_PAIR_CODE_PREFIX}${pairCode}`;
  }

  private buildAuthSessionKey(sessionId: string) {
    return `${ROBOT_AUTH_SESSION_PREFIX}${sessionId}`;
  }

  private async getRedisJson<T>(key: string) {
    const raw = await this.redisService.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  private async saveRedisJson(key: string, value: unknown, expiresAt: Date) {
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.redisService.set(key, JSON.stringify(value), ttlSeconds);
  }

  private parseOptionalDate(value: string | undefined, field: string) {
    if (value === undefined) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} 不是合法时间`);
    }
    return date;
  }

  private normalizeNullableId(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }


  private parseNullableDate(value?: unknown) {
    const text = this.safeNullableText(value, 80);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toPlainJsonValue(value: unknown) {
    const sanitize = (input: unknown, depth = 0): unknown => {
      if (input === undefined || input === null) return null;
      if (typeof input === 'bigint') return input.toString();
      if (typeof input === 'number') return Number.isFinite(input) ? input : null;
      if (typeof input === 'string') return this.safeNullableText(input) ?? '';
      if (typeof input === 'boolean') return input;
      if (depth > 8) return '[MaxDepth]';
      if (Array.isArray(input)) return input.map((item) => sanitize(item, depth + 1));
      if (typeof input === 'object') {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
          if (item !== undefined) output[key] = sanitize(item, depth + 1);
        }
        return output;
      }
      return String(input);
    };
    return sanitize(value) as Prisma.InputJsonValue;
  }

  private async assertInterceptRobotPromptConfigBound(config: Record<string, unknown> | undefined | Prisma.JsonValue | null, tenantId: string) {
    const root = this.ensureJsonRecord(config);
    const intercept = this.ensureJsonRecord(root.intercept);
    const analysis = this.ensureJsonRecord(intercept.intentAnalysis);
    const promptConfigId = this.pickFirstText(analysis.promptConfigId);
    if (!promptConfigId) {
      throw new BadRequestException('创建或编辑截流机器人必须关联一个启用的意向分析提示词配置');
    }
    const db = this.prisma as any;
    const exists = await db.interceptIntentPromptConfig.findFirst({
      where: { id: promptConfigId, tenantId, deletedAt: null, status: 'ENABLED' },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException('关联的截流意向分析提示词配置不存在或未启用');
    }
  }

  private prepareRobotConfigForSave(value: Record<string, unknown> | undefined, existing?: Prisma.JsonValue | null) {
    if (value === undefined) return undefined;
    const normalized = withDefaultRuntimePolicy(value) as Record<string, unknown>;
    const intercept = this.ensureJsonRecord(normalized.intercept);
    const schedule = this.ensureJsonRecord(intercept.schedule);
    const existingNormalized =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (withDefaultRuntimePolicy(existing as Record<string, unknown>) as Record<string, unknown>)
      : null;
    const existingIntercept = existingNormalized ? this.ensureJsonRecord(existingNormalized.intercept) : null;
    const existingSchedule = existingIntercept ? this.ensureJsonRecord(existingIntercept.schedule) : null;
    const existingAnchor = typeof existingSchedule?.anchorDate === 'string' ? existingSchedule.anchorDate : '';
    const shouldKeepAnchor = Boolean(existingAnchor) && existingIntercept && this.stableJsonWithoutAnchor(intercept) === this.stableJsonWithoutAnchor(existingIntercept);
    schedule.anchorDate = shouldKeepAnchor ? existingAnchor : new Date().toISOString().slice(0, 10);
    intercept.schedule = schedule;
    normalized.intercept = intercept;
    return normalized as Prisma.InputJsonValue;
  }

  private ensureJsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  }

  private stableJsonWithoutAnchor(value: unknown): string {
    const sanitize = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(sanitize);
      if (!input || typeof input !== 'object') return input;
      const record = input as Record<string, unknown>;
      return Object.keys(record)
        .filter((key) => key !== 'anchorDate')
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sanitize(record[key]);
          return acc;
        }, {});
    };
    return JSON.stringify(sanitize(value));
  }

  private toJsonValue(value: Record<string, unknown> | undefined) {
    if (value === undefined) return undefined;
    return withDefaultRuntimePolicy(value) as Prisma.InputJsonValue;
  }

  private generateRunToken() {
    return randomUUID().replace(/-/g, '');
  }

  private generatePairCode() {
    return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  }

  private normalizeTtlSeconds(value: number | undefined, defaultValue: number, min: number, max: number) {
    const normalized = Number(value ?? defaultValue);
    if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
      throw new BadRequestException(`ttlSeconds 必须在 ${min} 到 ${max} 秒之间`);
    }
    return Math.floor(normalized);
  }

  private generateDeviceCode(platform?: string | null) {
    const prefix = (platform || 'GUI').replace(/[^A-Z0-9]/gi, '').slice(0, 12).toUpperCase() || 'GUI';
    return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }

  private generateDeviceSecret() {
    return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  }

  private hashSecret(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }
}
