import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign, randomUUID } from 'crypto';
import { getPagination } from '../../common/dto/pagination.dto';
import { cozeErrorResponse, createCozeTransportDiagnostic, extractCozeSafeDiagnostic, formatCozeErrorMessage, readCozeLogIdFromHeaders, type CozeSafeDiagnostic } from '../../common/utils/coze-response';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { DialogueRecordsService } from '../dialogue-records/dialogue-records.service';
import { CustomerServiceChannelReplyService } from '../customer-service-agent/runtime/channel/customer-service-channel-reply.service';
import { CustomerServiceReplyTracesService, CustomerServiceReplyTraceSourceType } from '../customer-service-agent/admin/reply-traces/customer-service-reply-traces.service';
import { CustomerServiceKnowledgeEntriesService } from '../customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service';
import type { CustomerServiceFixedQaMatch } from '../customer-service-agent/shared/context/customer-service-fixed-qa.util';
import {
  CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION_ERROR_CODE,
  CustomerServiceRobotTestDmSessionService,
} from '../customer-service-agent/runtime/testing/customer-service-robot-test-dm-session.service';
import { resolveCustomerServiceConversationStrategyPreferences } from '../customer-service-agent/shared/context/customer-service-account-runtime-preferences.util';
import {
  ApplyPromptToRobotDto,
  AutoReplyPromptConfigQueryDto,
  CommentRecordItemDto,
  CommentRecordQueryDto,
  CommentReplyDatasetQueryDto,
  CommentTestReplyDto,
  DmConversationQueryDto,
  DmTestReplyDto,
  ImportCommentReplyDatasetDto,
  LookupCommentRecordsDto,
  MatchCommentReplyDatasetDto,
  SyncCommentRecordsDto,
  SyncDmConversationsDto,
  SyncRobotPromptConfigDto,
  UpdateAutoReplyPromptConfigDto,
  UpdateCommentReplyDatasetDto,
  UpdateRobotAutoReplySettingDto,
  UpsertAutoReplyPromptConfigDto,
} from './dto/auto-reply.dto';

const COZE_JWT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

type AutoReplyWorkflowMode = 'DEFAULT' | 'STRUCTURED' | 'PLAIN_CHAT';

interface AutoReplyWorkflowSelection {
  mode: AutoReplyWorkflowMode;
  workflowId: string;
  botId: string;
  inputKey: string;
}

type AutoReplyAiBinding = {
  provider: 'COZE' | 'DEEPSEEK';
  accountProfileId: string;
  fallbackToCoze: boolean;
  assetIds: string[];
};

@Injectable()
export class AutoRepliesService {
  private readonly logger = new Logger(AutoRepliesService.name);
  private cachedCozeAccessToken = '';
  private cachedCozeAccessTokenExpiresAt = 0;
  private cozeQueueTail: Promise<unknown> = Promise.resolve();
  private cozeQueueSeq = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dialogueRecordsService: DialogueRecordsService,
    private readonly channelReplyService: CustomerServiceChannelReplyService,
    private readonly knowledgeEntriesService: CustomerServiceKnowledgeEntriesService,
    private readonly replyTracesService: CustomerServiceReplyTracesService,
    private readonly robotTestDmSessions: CustomerServiceRobotTestDmSessionService,
  ) {}

  async listPromptConfigs(query: AutoReplyPromptConfigQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { description: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.autoReplyPromptConfig.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      db.autoReplyPromptConfig.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async detailPromptConfig(id: string, user: CurrentUserPayload) {
    return this.findPromptConfigOrThrow(id, user);
  }

  async createPromptConfig(dto: UpsertAutoReplyPromptConfigDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    return db.autoReplyPromptConfig.create({
      data: {
        tenantId,
        module: dto.module,
        name: dto.name.trim(),
        description: dto.description,
        customSystemPrompt: dto.customSystemPrompt,
        customUserPrompt: dto.customUserPrompt,
        forbiddenWords: dto.forbiddenWords,
        requiredWords: dto.requiredWords,
        replyStyle: dto.replyStyle,
        platformLabel: dto.platformLabel,
        accountPositioning: dto.accountPositioning,
        businessProfile: dto.businessProfile,
        goal: dto.goal,
        policy: dto.policy,
        safetyPolicy: dto.safetyPolicy,
        replyLength: dto.replyLength,
        maxMsgCount: dto.maxMsgCount,
        extraParams: dto.extraParams,
        status: dto.status ?? 'ENABLED',
        createdById: user.id,
      },
    });
  }

  async updatePromptConfig(id: string, dto: UpdateAutoReplyPromptConfigDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findPromptConfigOrThrow(id, user);
    return db.autoReplyPromptConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.customSystemPrompt !== undefined ? { customSystemPrompt: dto.customSystemPrompt } : {}),
        ...(dto.customUserPrompt !== undefined ? { customUserPrompt: dto.customUserPrompt } : {}),
        ...(dto.forbiddenWords !== undefined ? { forbiddenWords: dto.forbiddenWords } : {}),
        ...(dto.requiredWords !== undefined ? { requiredWords: dto.requiredWords } : {}),
        ...(dto.replyStyle !== undefined ? { replyStyle: dto.replyStyle } : {}),
        ...(dto.platformLabel !== undefined ? { platformLabel: dto.platformLabel } : {}),
        ...(dto.accountPositioning !== undefined ? { accountPositioning: dto.accountPositioning } : {}),
        ...(dto.businessProfile !== undefined ? { businessProfile: dto.businessProfile } : {}),
        ...(dto.goal !== undefined ? { goal: dto.goal } : {}),
        ...(dto.policy !== undefined ? { policy: dto.policy } : {}),
        ...(dto.safetyPolicy !== undefined ? { safetyPolicy: dto.safetyPolicy } : {}),
        ...(dto.replyLength !== undefined ? { replyLength: dto.replyLength } : {}),
        ...(dto.maxMsgCount !== undefined ? { maxMsgCount: dto.maxMsgCount } : {}),
        ...(dto.extraParams !== undefined ? { extraParams: dto.extraParams } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async removePromptConfig(id: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findPromptConfigOrThrow(id, user);
    await db.autoReplyPromptConfig.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    return { success: true };
  }

  async getRobotSetting(robotId: string, module: string, user: CurrentUserPayload, tenantId?: string) {
    const db = this.prisma as any;
    const robot = await this.findRobotOrThrow(robotId, user, tenantId);
    const setting = await db.autoReplyRobotSetting.findUnique({ where: { robotId_module: { robotId: robot.id, module } } });
    return setting ?? this.buildDefaultRobotSetting(robot, module);
  }

  async updateRobotSetting(robotId: string, dto: UpdateRobotAutoReplySettingDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const robot = await this.findRobotOrThrow(robotId, user, dto.tenantId);
    const promptConfig = dto.promptConfigId ? await this.findPromptConfigOrThrow(dto.promptConfigId, user, robot.tenantId) : null;
    if (promptConfig && promptConfig.module !== dto.module) {
      throw new ConflictException('提示词配置模块与机器人设置模块不一致');
    }

    const existing = await db.autoReplyRobotSetting.findUnique({ where: { robotId_module: { robotId: robot.id, module: dto.module } } });
    const nextPromptSnapshot = dto.promptSnapshot ?? (promptConfig ? this.promptConfigToSnapshot(promptConfig) : existing?.promptSnapshot ?? undefined);
    const setting = await db.autoReplyRobotSetting.upsert({
      where: { robotId_module: { robotId: robot.id, module: dto.module } },
      create: {
        tenantId: robot.tenantId,
        robotId: robot.id,
        module: dto.module,
        promptConfigId: dto.promptConfigId,
        promptSnapshot: nextPromptSnapshot,
        commentReplyMode: dto.commentReplyMode ?? (dto.module === 'comment' ? 'ALL_UNREPLIED' : null),
        replyDatasetId: dto.replyDatasetId,
        enableFirstReply: dto.enableFirstReply ?? false,
        firstReplyContents: dto.firstReplyContents ?? [],
        useConversationContext: dto.useConversationContext ?? true,
        config: dto.config,
      },
      update: {
        ...(dto.promptConfigId !== undefined ? { promptConfigId: dto.promptConfigId || null } : {}),
        ...(nextPromptSnapshot !== undefined ? { promptSnapshot: nextPromptSnapshot } : {}),
        ...(dto.commentReplyMode !== undefined ? { commentReplyMode: dto.commentReplyMode } : {}),
        ...(dto.replyDatasetId !== undefined ? { replyDatasetId: dto.replyDatasetId || null } : {}),
        ...(dto.enableFirstReply !== undefined ? { enableFirstReply: dto.enableFirstReply } : {}),
        ...(dto.firstReplyContents !== undefined ? { firstReplyContents: dto.firstReplyContents } : {}),
        ...(dto.useConversationContext !== undefined ? { useConversationContext: dto.useConversationContext } : {}),
        ...(dto.config !== undefined ? { config: dto.config } : {}),
      },
    });
    await this.patchRobotAutoReplyConfig(robot, dto.module, setting);
    return setting;
  }

  async applyPromptToRobot(robotId: string, promptConfigId: string, dto: ApplyPromptToRobotDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const robot = await this.findRobotOrThrow(robotId, user, dto.tenantId);
    const promptConfig = await this.findPromptConfigOrThrow(promptConfigId, user, robot.tenantId);
    if (promptConfig.module !== dto.module) {
      throw new ConflictException('提示词配置模块与机器人模块不一致');
    }
    const promptSnapshot = this.mergePromptSnapshot(this.promptConfigToSnapshot(promptConfig), dto.promptOverrides);
    const setting = await db.autoReplyRobotSetting.upsert({
      where: { robotId_module: { robotId: robot.id, module: dto.module } },
      create: {
        tenantId: robot.tenantId,
        robotId: robot.id,
        module: dto.module,
        promptConfigId: promptConfig.id,
        promptSnapshot,
        commentReplyMode: dto.module === 'comment' ? 'ALL_UNREPLIED' : null,
        firstReplyContents: [],
        useConversationContext: true,
      },
      update: {
        promptConfigId: promptConfig.id,
        ...(dto.overwriteRobotSnapshot === false ? {} : { promptSnapshot }),
      },
    });
    await this.patchRobotAutoReplyConfig(robot, dto.module, setting);
    return setting;
  }

  async syncRobotPromptConfig(robotId: string, dto: SyncRobotPromptConfigDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const robot = await this.findRobotOrThrow(robotId, user, dto.tenantId);
    const setting = await db.autoReplyRobotSetting.findUnique({ where: { robotId_module: { robotId: robot.id, module: dto.module } } });
    const promptConfigId = dto.promptConfigId || setting?.promptConfigId;
    if (!promptConfigId) {
      throw new BadRequestException('缺少 promptConfigId，无法同步到配置项');
    }
    const existingConfig = await this.findPromptConfigOrThrow(promptConfigId, user, robot.tenantId);
    if (existingConfig.module !== dto.module) {
      throw new ConflictException('提示词配置模块与机器人模块不一致');
    }
    const snapshot = dto.promptSnapshot ?? setting?.promptSnapshot;
    if (!snapshot || typeof snapshot !== 'object') {
      throw new BadRequestException('机器人没有可同步的提示词快照');
    }
    return db.autoReplyPromptConfig.update({
      where: { id: existingConfig.id },
      data: this.snapshotToPromptConfigUpdate(snapshot),
    });
  }

  async listCommentReplyDatasets(query: CommentReplyDatasetQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.robotId ? { OR: [{ robotId: query.robotId }, { robotId: null }] } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { description: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.commentReplyDataset.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { entries: true } } },
      }),
      db.commentReplyDataset.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async detailCommentReplyDataset(id: string, user: CurrentUserPayload) {
    return this.findCommentReplyDatasetOrThrow(id, user, undefined, true);
  }

  async importCommentReplyDataset(dto: ImportCommentReplyDatasetDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    if (dto.robotId) {
      await this.findRobotOrThrow(dto.robotId, user, tenantId);
    }
    const rows = this.normalizeCommentReplyDatasetRows(dto.rows, dto.defaultMatchType);
    return db.commentReplyDataset.create({
      data: {
        tenantId,
        robotId: dto.robotId,
        name: dto.name.trim(),
        description: dto.description,
        createdById: user.id,
        entries: {
          create: rows,
        },
      },
      include: { entries: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] } },
    });
  }

  async removeCommentReplyDataset(id: string, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findCommentReplyDatasetOrThrow(id, user);
    await db.commentReplyDataset.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    return { success: true };
  }

  async updateCommentReplyDataset(id: string, dto: UpdateCommentReplyDatasetDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const existing = await this.findCommentReplyDatasetOrThrow(id, user, undefined, true);
    const tenantId = resolveRequiredTenantId(user, dto.tenantId || existing.tenantId);
    const nextRobotId = dto.robotId !== undefined ? dto.robotId : existing.robotId;
    if (nextRobotId) {
      await this.findRobotOrThrow(nextRobotId, user, tenantId);
    }
    const rows = dto.rows?.length ? this.normalizeCommentReplyDatasetRows(dto.rows, dto.defaultMatchType) : [];

    return db.$transaction(async (tx: any) => {
      await tx.commentReplyDataset.update({
        where: { id: existing.id },
        data: {
          tenantId,
          robotId: nextRobotId,
          name: dto.name?.trim() || existing.name,
          description: dto.description !== undefined ? dto.description : existing.description,
        },
      });

      if (rows.length) {
        await tx.commentReplyDatasetEntry.deleteMany({ where: { datasetId: existing.id } });
        await tx.commentReplyDatasetEntry.createMany({
          data: rows.map((row) => ({
            datasetId: existing.id,
            ...row,
          })),
        });
      }

      return tx.commentReplyDataset.findUnique({
        where: { id: existing.id },
        include: { entries: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] } },
      });
    });
  }

  async matchCommentReplyDataset(id: string, dto: MatchCommentReplyDatasetDto, user: CurrentUserPayload) {
    const dataset = await this.findCommentReplyDatasetOrThrow(id, user, undefined, true);
    const match = this.matchDatasetEntry(dataset.entries ?? [], dto.commentContent);
    return match ? this.datasetMatchResponse(match) : { matched: false };
  }

  async testCommentReply(
    dto: CommentTestReplyDto,
    user: CurrentUserPayload,
    sourceType: CustomerServiceReplyTraceSourceType = 'ROBOT_TEST_COMMENT',
  ) {
    const tenantId = await this.resolveReplyTenantId(user, dto.tenantId, dto.robotId);
    const sourceRefId = sourceType === 'ROBOT_TEST_COMMENT'
      ? randomUUID()
      : String(dto.replyAttemptId || dto.customerMessageId || dto.commentThreadId || randomUUID());
    const aiBinding = await this.resolveAiBinding('comment', dto, user, tenantId);
    const fixedQaMatch = await this.resolveAutoReplyFixedQa({
      tenantId,
      accountProfileId: aiBinding.accountProfileId,
      message: dto.userInput,
    });
    if (fixedQaMatch) {
      return this.buildFixedQaCommentReply({
        tenantId,
        sourceType,
        sourceRefId,
        dto,
        user,
        accountProfileId: aiBinding.accountProfileId,
        match: fixedQaMatch,
      });
    }

    const datasetId = dto.datasetId || (dto.robotId ? await this.resolveRobotReplyDatasetId(dto.robotId, 'comment', user, tenantId) : '');
    if (datasetId) {
      const dataset = await this.findCommentReplyDatasetOrThrow(datasetId, user, tenantId, true);
      const matched = this.matchDatasetEntry(dataset.entries ?? [], dto.userInput);
      if (matched) {
        const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
          tenantId,
          createdById: user.id,
          context: {
            sourceType, sourceRefId, robotId: dto.robotId, channel: 'COMMENT', platform: dto.platform,
            commentThreadId: dto.commentThreadId, customerMessageId: dto.customerMessageId || dto.commentThreadId, replyMessageId: dto.replyMessageId, replyAttemptId: dto.replyAttemptId, postContext: dto.postContext,
          },
          customerMessage: dto.userInput,
          replySegments: [{ index: 0, content: matched.replyContent, delayBeforeMs: 0 }],
          provider: 'DATASET',
          generationSource: 'IMPORTED_DATASET',
          details: { datasetId, entryId: matched.id },
        }));
        return {
          replyTraceId: trace?.id,
          source: 'imported_dataset',
          matched: true,
          datasetId,
          entryId: matched.id,
          reply: matched.replyContent,
          commentType: 'imported_reply',
          intentLevel: 'none',
          judgeReason: '命中用户导入的评论回复表，未调用 Coze 工作流。',
          shouldReply: true,
          skipReply: false,
          skipReason: '',
          replyStatus: 'generated',
        };
      }
    }

    const context = await this.resolveCommentThreadContext(dto, tenantId);
    const contextualInput = this.buildCommentContextInput(dto.userInput, context.items, dto.postContext);
    let deepSeekFailure = '';
    if (aiBinding.provider === 'DEEPSEEK') {
      try {
        const result = await this.channelReplyService.execute({
          channel: 'COMMENT',
          robotId: dto.robotId,
          accountProfileId: aiBinding.accountProfileId,
          message: dto.userInput,
          messageId: sourceRefId,
          sourceType,
          sourceRefId,
          commentThreadId: dto.commentThreadId,
          customerMessageId: dto.customerMessageId || dto.commentThreadId,
          replyMessageId: dto.replyMessageId,
          replyAttemptId: dto.replyAttemptId,
          platform: dto.platform,
          postContext: dto.postContext,
          serviceGoal: dto.commentGoal,
          recognitionSessionId: dto.commentThreadId,
          conversationHistory: context.items.map((item: any) => ({
            role: item.role === 'account' ? 'ASSISTANT' : 'CUSTOMER',
            content: String(item.content || '').trim(),
          })),
          assetIds: aiBinding.assetIds,
          variables: {
            contextSource: context.source,
            clientRuntime: {
              source: 'AUTO_REPLY_RUNTIME',
              legacyPromptConfigured: Boolean(dto.promptConfigId),
              normalDeepSeekUsesLegacyPrompt: false,
            },
          },
        }, user);
        const reply = result.segments.map((item) => item.content.trim()).filter(Boolean).join(' ');
        return {
          replyTraceId: result.replyTraceId,
          source: 'deepseek_customer_service',
          provider: result.provider,
          matched: false,
          supportsCommentContext: true,
          commentThreadId: dto.commentThreadId ?? '',
          contextMessageCount: context.items.length,
          contextSource: context.source,
          reply,
          commentType: result.messageType,
          intentLevel: result.intentLevel,
          riskLevel: result.riskLevel,
          judgeReason: result.judgeReason,
          shouldReply: result.shouldReply,
          skipReply: result.skipReply,
          skipReason: result.skipReason,
          manualTakeover: result.action === 'HANDOFF',
          replyStatus: result.action === 'SEND' ? 'generated' : result.action === 'HANDOFF' ? 'manual' : 'not_required',
          raw: {
            action: result.action,
            replySource: result.replySource,
            qualityStatus: result.qualityStatus,
            safetyStatus: result.safetyStatus,
            fallbackUsed: result.fallbackUsed,
            replyTraceId: result.replyTraceId,
            segments: result.segments,
            cancelRemainingOnCustomerMessage: result.cancelRemainingOnCustomerMessage,
          },
        };
      } catch (error) {
        deepSeekFailure = error instanceof Error ? error.message : String(error);
        if (!aiBinding.fallbackToCoze) throw error;
      }
    }
    const prompt = await this.resolvePromptSnapshot('comment', dto.promptConfigId, dto.robotId, user, tenantId);
    const workflow = this.resolveWorkflowSelection('comment', dto, prompt);
    if (workflow.mode === 'PLAIN_CHAT') {
      const result = await this.runCozeQueued('comment_plain_workflow', () =>
        this.requestCozePlainWorkflow(contextualInput, workflow),
      );
      const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
        tenantId,
        createdById: user.id,
        context: {
          sourceType, sourceRefId, robotId: dto.robotId, channel: 'COMMENT', platform: dto.platform,
          commentThreadId: dto.commentThreadId, customerMessageId: dto.customerMessageId || dto.commentThreadId, replyMessageId: dto.replyMessageId, replyAttemptId: dto.replyAttemptId, postContext: dto.postContext,
        },
        customerMessage: dto.userInput,
        replySegments: [{ index: 0, content: result.reply, delayBeforeMs: 0 }],
        provider: 'COZE',
        generationSource: 'COZE_PLAIN_WORKFLOW',
        accountProfileId: aiBinding.accountProfileId || undefined,
        fallbackUsed: Boolean(deepSeekFailure),
        details: { workflowId: workflow.workflowId, workflowMode: workflow.mode, contextSource: context.source },
      }));
      return {
        replyTraceId: trace?.id,
        source: 'coze_plain_workflow',
        matched: false,
        workflowMode: workflow.mode,
        workflowId: workflow.workflowId,
        supportsCommentContext: true,
        commentThreadId: dto.commentThreadId ?? '',
        contextMessageCount: context.items.length,
        contextSource: context.source,
        reply: result.reply,
        commentType: 'plain_chat',
        intentLevel: 'none',
        judgeReason: context.items.length ? '纯聊天工作流结合当前评论线程上下文生成回复。' : '纯聊天工作流直接生成回复。',
        shouldReply: true,
        skipReply: false,
        skipReason: '',
        replyStatus: 'generated',
        raw: result.raw,
        ...(deepSeekFailure ? { providerFallback: { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure } } : {}),
      };
    }

    const parameters = this.buildCommentWorkflowParameters(dto, prompt, contextualInput);
    const result = await this.runCozeQueued('comment_workflow', () =>
      this.requestCozeWorkflowRun(parameters, workflow.workflowId),
    );
    const normalized = this.normalizeCommentWorkflowResult(result);
    const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
      tenantId,
      createdById: user.id,
      context: {
        sourceType, sourceRefId, robotId: dto.robotId, channel: 'COMMENT', platform: dto.platform,
        commentThreadId: dto.commentThreadId, customerMessageId: dto.customerMessageId || dto.commentThreadId, replyMessageId: dto.replyMessageId, replyAttemptId: dto.replyAttemptId, postContext: dto.postContext,
      },
      customerMessage: dto.userInput,
      replySegments: normalized.reply ? [{ index: 0, content: String(normalized.reply), delayBeforeMs: 0 }] : [],
      provider: 'COZE',
      generationSource: normalized.shouldReply ? 'COZE_WORKFLOW' : 'COZE_DECISION',
      accountProfileId: aiBinding.accountProfileId || undefined,
      fallbackUsed: Boolean(deepSeekFailure),
      details: { workflowId: workflow.workflowId, workflowMode: workflow.mode, result },
    }));
    return {
      replyTraceId: trace?.id,
      source: 'coze_workflow',
      matched: false,
      workflowMode: workflow.mode,
      workflowId: workflow.workflowId,
      supportsCommentContext: true,
      commentThreadId: dto.commentThreadId ?? '',
      contextMessageCount: context.items.length,
      contextSource: context.source,
      ...normalized,
      raw: result,
      ...(deepSeekFailure ? { providerFallback: { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure } } : {}),
    };
  }

  async testDmReply(
    dto: DmTestReplyDto,
    user: CurrentUserPayload,
    sourceType: CustomerServiceReplyTraceSourceType = 'ROBOT_TEST_DM',
  ) {
    const tenantId = await this.resolveReplyTenantId(user, dto.tenantId, dto.robotId);
    const sourceRefId = sourceType === 'ROBOT_TEST_DM'
      ? randomUUID()
      : String(dto.replyAttemptId || dto.customerMessageId || dto.currentClientMessageIds?.[0] || dto.dialogueConversationId || dto.conversationId || randomUUID());
    const aiBinding = await this.resolveAiBinding('dm', dto, user, tenantId);
    const directFixedQaAllowed = sourceType !== 'ROBOT_TEST_DM' || aiBinding.provider !== 'DEEPSEEK';
    if (directFixedQaAllowed) {
      const fixedQaMatch = await this.resolveAutoReplyFixedQa({
        tenantId,
        accountProfileId: aiBinding.accountProfileId,
        message: dto.messageContent,
      });
      if (fixedQaMatch) {
        return this.buildFixedQaDmReply({
          tenantId,
          sourceType,
          sourceRefId,
          dto,
          user,
          accountProfileId: aiBinding.accountProfileId,
          match: fixedQaMatch,
        });
      }
    }
    let deepSeekFailure = '';
    let robotTestSessionId = '';
    let robotTestSessionCommitWarning = '';
    let deepSeekRobotTestPhase = 'BINDING_RESOLVED';
    if (aiBinding.provider === 'DEEPSEEK') {
      try {
        const isRobotTest = sourceType === 'ROBOT_TEST_DM';
        const useRobotTestSession = isRobotTest && dto.useConversationContext !== false;
        const testClientMessageId = useRobotTestSession
          ? String(dto.testClientMessageId || `robot-test:${sourceRefId}`).trim().slice(0, 120)
          : undefined;
        let testStateRevisionAtGeneration: number | null = null;
        let testMessageAlreadyCommitted = false;
        deepSeekRobotTestPhase = 'SESSION_PREPARE';
        const activeContext = useRobotTestSession
          ? await (async () => {
              const conversationStrategy = await this.resolveConversationStrategyForBinding(aiBinding.accountProfileId, tenantId);
              const prepared = await this.robotTestDmSessions.prepare({
                testSessionId: dto.testSessionId,
                robotId: dto.robotId,
                accountProfileId: aiBinding.accountProfileId,
                currentMessage: dto.messageContent,
                currentClientMessageId: testClientMessageId,
                tokenBudget: conversationStrategy.policy.contextBudget.mode === 'CUSTOM'
                  ? conversationStrategy.policy.contextBudget.activeContextTokenBudget
                  : undefined,
                user,
              });
              robotTestSessionId = prepared.sessionId;
              testStateRevisionAtGeneration = prepared.stateRevision;
              testMessageAlreadyCommitted = prepared.currentMessageAlreadyCommitted;
              return { history: prepared.history, window: prepared.window };
            })()
          : await this.resolveDmConversationHistory(dto, user, aiBinding.accountProfileId, tenantId);
        const conversationHistory = activeContext.history;
        deepSeekRobotTestPhase = 'HVE_RUNTIME_EXECUTION';
        const result = await this.channelReplyService.execute({
          channel: 'DM',
          robotId: dto.robotId,
          accountProfileId: aiBinding.accountProfileId,
          message: dto.messageContent,
          messageId: sourceRefId,
          sourceType,
          sourceRefId,
          conversationId: dto.dialogueConversationId || robotTestSessionId || dto.conversationId,
          customerMessageId: dto.customerMessageId || dto.currentClientMessageIds?.[0] || testClientMessageId,
          replyMessageId: dto.replyMessageId,
          replyAttemptId: dto.replyAttemptId,
          platform: dto.platform,
          // DeepSeek 正常链路只使用账号知识、意图流程和已发布策略；旧 conversionGoal 仅保留给 Coze 兼容/回退。
          serviceGoal: undefined,
          recognitionSessionId: dto.dialogueConversationId || robotTestSessionId || dto.conversationId,
          canonicalConversationId: dto.dialogueConversationId || undefined,
          canonicalCustomerMessageClientId: dto.dialogueConversationId
            ? (dto.customerMessageId || dto.currentClientMessageIds?.[0])
            : undefined,
          isolatedTestSessionId: useRobotTestSession ? robotTestSessionId : undefined,
          isolatedTestClientMessageId: testClientMessageId,
          hveExecutionLane: useRobotTestSession ? dto.hveExecutionLane : undefined,
          conversationHistory,
          assetIds: aiBinding.assetIds,
          variables: {
            clientRuntime: {
              source: isRobotTest ? 'PC_ROBOT_TEST' : 'AUTO_REPLY_RUNTIME',
              legacyPromptConfigured: Boolean(dto.promptConfigId),
              normalDeepSeekUsesLegacyPrompt: false,
            },
            ...(useRobotTestSession ? {
              robotTestSession: {
                purpose: 'ROBOT_TEST_DM',
                id: robotTestSessionId,
                robotId: String(dto.robotId || '').trim() || null,
                isolatedFromCanonicalConversation: true,
              },
            } : {}),
            activeContextWindow: activeContext.window,
          },
        }, user);

        deepSeekRobotTestPhase = 'SESSION_COMMIT';
        if (useRobotTestSession && robotTestSessionId && testClientMessageId && !testMessageAlreadyCommitted) {
          try {
            if (result.action === 'SEND') {
              await this.robotTestDmSessions.appendAssistantSegments({
                sessionId: robotTestSessionId,
                replyGroupId: testClientMessageId,
                segments: result.segments,
                replyTraceId: result.replyTraceId,
                replyAttemptId: dto.replyAttemptId,
                assistantObservationProof: result.assistantObservationProof,
                user,
              });
            } else {
              await this.robotTestDmSessions.advanceWithoutReply({
                sessionId: robotTestSessionId,
                clientMessageId: testClientMessageId,
                message: dto.messageContent,
                conversationHistory,
                activeContextWindow: activeContext.window || {},
                assetIds: aiBinding.assetIds,
                user,
              });
            }
          } catch (sessionCommitError) {
            // Robot-Test state/history persistence happens after HVE has already produced the
            // customer-visible result. It may degrade the next-turn test context, but it cannot
            // retroactively turn a valid current reply into replyStatus=failed.
            robotTestSessionCommitWarning = sessionCommitError instanceof Error
              ? sessionCommitError.message
              : String(sessionCommitError);
            this.logger.warn(`Robot Test SESSION_COMMIT 失败，保留已生成回复：${robotTestSessionCommitWarning}`);
          }
        }

        deepSeekRobotTestPhase = 'RESPONSE_PROJECTION';
        const replies = result.segments.map((item) => item.content.trim()).filter(Boolean);
        return {
          replyTraceId: result.replyTraceId,
          source: 'deepseek_customer_service',
          provider: result.provider,
          supportsConversationContext: true,
          conversationId: '',
          dialogueConversationId: dto.dialogueConversationId ?? '',
          testSessionId: robotTestSessionId,
          testStateRevisionAtGeneration,
          contextMessageCount: conversationHistory.length,
          activeContextWindow: activeContext.window,
          hveActivation: result.diagnostics?.hveV19Activation || null,
          hveGenerationKernel: result.diagnostics?.generationKernel || null,
          hveDeepRecognition: result.diagnostics?.deepRecognition || null,
          hvePlan: result.diagnostics?.canonicalInteractionPlan || null,
          hveParticipation: result.diagnostics?.roleParticipation || null,
          hveTurnComposition: result.diagnostics?.humanTurnComposition || null,
          hveHumanTurnObservability: result.diagnostics?.humanTurnObservability || null,
          hveFinalModelFacingHumanTurn: result.diagnostics?.finalModelFacingHumanTurn || null,
          hveHumanityMetrics: result.diagnostics?.humanityMetricDiagnostics || null,
          hveDecisionIntegrity: result.diagnostics?.decisionIntegrityDiagnostics || null,
          hveDeliveryPlan: result.diagnostics?.deliveryPlan || null,
          hveRoleContext: result.diagnostics?.roleCapabilityContext || null,
          hveResolvedRole: result.diagnostics?.resolvedRoleIdentity || null,
          hveCandidateSelection: result.diagnostics?.candidateSelection || null,
          hveGroundingAudit: result.diagnostics?.groundingAudit || null,
          replies,
          replyCount: replies.length,
          shouldReply: result.shouldReply,
          skipReply: result.skipReply,
          skipReason: result.skipReason,
          manualTakeover: result.action === 'HANDOFF',
          replyStatus: result.action === 'SEND' ? 'generated' : result.action === 'HANDOFF' ? 'manual' : 'not_required',
          failReason: '',
          raw: {
            action: result.action,
            messageType: result.messageType,
            intentLevel: result.intentLevel,
            riskLevel: result.riskLevel,
            judgeReason: result.judgeReason,
            replySource: result.replySource,
            qualityStatus: result.qualityStatus,
            safetyStatus: result.safetyStatus,
            fallbackUsed: result.fallbackUsed,
            replyTraceId: result.replyTraceId,
            hveV19Activation: result.diagnostics?.hveV19Activation || null,
            deepRecognition: result.diagnostics?.deepRecognition || null,
            canonicalInteractionPlan: result.diagnostics?.canonicalInteractionPlan || null,
            humanTurnObservability: result.diagnostics?.humanTurnObservability || null,
            humanityMetricDiagnostics: result.diagnostics?.humanityMetricDiagnostics || null,
            decisionIntegrityDiagnostics: result.diagnostics?.decisionIntegrityDiagnostics || null,
            deliveryPlan: result.diagnostics?.deliveryPlan || null,
            segments: result.segments,
            cancelRemainingOnCustomerMessage: result.cancelRemainingOnCustomerMessage,
            ...(useRobotTestSession ? {
              robotTestSession: {
                id: robotTestSessionId,
                stateRevisionAtGeneration: testStateRevisionAtGeneration,
                currentMessageAlreadyCommitted: testMessageAlreadyCommitted,
                isolatedFromCanonicalConversation: true,
                sessionCommitStatus: robotTestSessionCommitWarning
                  ? 'DEGRADED_REPLY_PRESERVED'
                  : testMessageAlreadyCommitted
                    ? 'NOT_REQUIRED_ALREADY_COMMITTED'
                    : 'COMMITTED',
                sessionCommitWarning: robotTestSessionCommitWarning || null,
              },
            } : {}),
          },
        };
      } catch (error) {
        if (sourceType === 'ROBOT_TEST_DM' && hasHttpExceptionDataErrorCode(error, CUSTOMER_SERVICE_ROBOT_TEST_DB_MIGRATION_ERROR_CODE)) {
          throw error;
        }
        deepSeekFailure = error instanceof Error ? error.message : String(error);
        if (sourceType === 'ROBOT_TEST_DM' && !aiBinding.fallbackToCoze) {
          const runtimeError = {
            errorCode: 'CUSTOMER_SERVICE_ROBOT_TEST_HVE_RUNTIME_FAILED',
            phase: deepSeekRobotTestPhase,
            errorName: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
            errorMessage: deepSeekFailure.slice(0, 800),
            sourceRefId,
            testSessionId: robotTestSessionId || String(dto.testSessionId || ''),
            testClientMessageId: String(dto.testClientMessageId || ''),
          };
          this.logger.error(`Robot Test HVE 运行失败 phase=${deepSeekRobotTestPhase}: ${deepSeekFailure}`);
          return {
            source: 'deepseek_customer_service_error',
            provider: 'DEEPSEEK',
            supportsConversationContext: true,
            conversationId: '',
            dialogueConversationId: dto.dialogueConversationId ?? '',
            testSessionId: robotTestSessionId || dto.testSessionId || '',
            testStateRevisionAtGeneration: null,
            contextMessageCount: 0,
            activeContextWindow: undefined,
            hveActivation: null,
            hveGenerationKernel: null,
            hveDeepRecognition: null,
            hvePlan: null,
            hveParticipation: null,
            hveTurnComposition: null,
            hveRoleContext: null,
            hveResolvedRole: null,
            hveCandidateSelection: null,
            hveGroundingAudit: null,
            replies: [],
            replyCount: 0,
            shouldReply: false,
            skipReply: false,
            skipReason: '',
            manualTakeover: false,
            replyStatus: 'failed',
            failReason: `HVE Robot Test 执行失败（${deepSeekRobotTestPhase}）`,
            runtimeError,
            raw: { runtimeError },
          };
        }
        if (!aiBinding.fallbackToCoze) throw error;
      }
    }
    const prompt = await this.resolvePromptSnapshot('dm', dto.promptConfigId, dto.robotId, user, tenantId);
    const workflow = this.resolveWorkflowSelection('dm', dto, prompt);
    try {
      if (workflow.mode === 'PLAIN_CHAT') {
        let plainInput = dto.messageContent;
        let contextMessageCount = 0;
        if (dto.useConversationContext !== false && dto.dialogueConversationId) {
          try {
            const context = await this.dialogueRecordsService.getContextForReply(
              dto.dialogueConversationId,
              user,
              dto.currentClientMessageIds ?? [],
              dto.maxMsgCount ?? 10,
            );
            const rows = Array.isArray(context.items) ? context.items : [];
            contextMessageCount = rows.length;
            if (rows.length) {
              const history = rows.map((item: any) => {
                const role = item.senderRole === 'account' ? '助手' : '用户';
                return `${role}：${String(item.textContent || '').trim()}`;
              }).filter((item: string) => item.length > 3).join('\n');
              if (history) {
                plainInput = [
                  '以下是与同一聊天对象最近的真实对话记录，仅用于理解上下文。不要复述记录，不要提及系统或数据库。',
                  history,
                  '',
                  '当前用户消息：',
                  dto.messageContent,
                ].join('\n');
              }
            }
          } catch {
            contextMessageCount = 0;
          }
        }
        const result = await this.runCozeQueued('dm_plain_workflow', () =>
          this.requestCozePlainWorkflow(plainInput, workflow),
        );
        const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
          tenantId,
          createdById: user.id,
          context: {
            sourceType, sourceRefId, robotId: dto.robotId, channel: 'DM', platform: dto.platform,
            conversationId: dto.dialogueConversationId || dto.conversationId, customerMessageId: dto.customerMessageId || dto.currentClientMessageIds?.[0], replyMessageId: dto.replyMessageId, replyAttemptId: dto.replyAttemptId,
          },
          customerMessage: dto.messageContent,
          replySegments: [{ index: 0, content: result.reply, delayBeforeMs: 0 }],
          provider: 'COZE',
          generationSource: 'COZE_PLAIN_WORKFLOW',
          accountProfileId: aiBinding.accountProfileId || undefined,
          fallbackUsed: Boolean(deepSeekFailure),
          details: { workflowId: workflow.workflowId, workflowMode: workflow.mode, contextMessageCount },
        }));
        return {
          replyTraceId: trace?.id,
          source: 'coze_plain_workflow',
          workflowMode: workflow.mode,
          workflowId: workflow.workflowId,
          supportsConversationContext: true,
          conversationId: '',
          dialogueConversationId: dto.dialogueConversationId ?? '',
          contextMessageCount,
          replies: [result.reply],
          replyCount: 1,
          shouldReply: true,
          skipReply: false,
          skipReason: '',
          replyStatus: 'generated',
          failReason: '',
          raw: result.raw,
          ...(deepSeekFailure ? { providerFallback: { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure } } : {}),
        };
      }

      const parameters = this.buildDmChatWorkflowParameters(dto, prompt);
      const result = await this.runCozeQueued('dm_chat_workflow', () =>
        this.requestCozeWorkflowChat(
          dto.messageContent,
          parameters,
          dto.useConversationContext !== false ? dto.conversationId : undefined,
          workflow,
        ),
      );
      const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
        tenantId,
        createdById: user.id,
        context: {
          sourceType, sourceRefId, robotId: dto.robotId, channel: 'DM', platform: dto.platform,
          conversationId: dto.dialogueConversationId || dto.conversationId || result.conversationId,
          customerMessageId: dto.customerMessageId || dto.currentClientMessageIds?.[0],
          replyMessageId: dto.replyMessageId,
          replyAttemptId: dto.replyAttemptId,
        },
        customerMessage: dto.messageContent,
        replySegments: result.replies.map((content: string, index: number) => ({ index, content, delayBeforeMs: 0 })),
        provider: 'COZE',
        generationSource: 'COZE_CHAT_WORKFLOW',
        accountProfileId: aiBinding.accountProfileId || undefined,
        fallbackUsed: Boolean(deepSeekFailure),
        details: { workflowId: workflow.workflowId, workflowMode: workflow.mode, conversationId: result.conversationId },
      }));
      return {
        replyTraceId: trace?.id,
        source: 'coze_chat_workflow',
        workflowMode: workflow.mode,
        workflowId: workflow.workflowId,
        supportsConversationContext: true,
        conversationId: result.conversationId,
        replies: result.replies,
        replyCount: result.replies.length,
        shouldReply: true,
        skipReply: false,
        skipReason: '',
        replyStatus: 'generated',
        failReason: '',
        raw: result.raw,
        ...(deepSeekFailure ? { providerFallback: { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure } } : {}),
      };
    } catch (error) {
      const failure = this.getCozeExceptionDetails(error, workflow.mode === 'PLAIN_CHAT' ? 'Coze 纯聊天工作流调用失败' : 'Coze 私信对话流调用失败');
      return {
        source: workflow.mode === 'PLAIN_CHAT' ? 'coze_plain_workflow' : 'coze_chat_workflow',
        workflowMode: workflow.mode,
        workflowId: workflow.workflowId,
        supportsConversationContext: true,
        conversationId: workflow.mode === 'PLAIN_CHAT' ? '' : dto.conversationId ?? '',
        replies: [],
        replyCount: 0,
        shouldReply: false,
        skipReply: true,
        skipReason: failure.message,
        replyStatus: 'failed',
        failReason: failure.message,
        raw: {
          error: failure.message,
          errorName: error instanceof Error ? error.name : typeof error,
          ...(failure.coze ? { coze: failure.coze } : {}),
        },
        ...(deepSeekFailure ? { providerFallback: { from: 'DEEPSEEK', to: 'COZE', reason: deepSeekFailure } } : {}),
      };
    }
  }

  async runtimeCommentReply(dto: CommentTestReplyDto, user: CurrentUserPayload) {
    const result = await this.testCommentReply(dto, user, 'RUNTIME_COMMENT');
    return this.applyFixedQaRuntimeDelay(result);
  }

  async runtimeDmReply(dto: DmTestReplyDto, user: CurrentUserPayload) {
    const result = await this.testDmReply(dto, user, 'RUNTIME_DM');
    return this.applyFixedQaRuntimeDelay(result);
  }

  async syncCommentRecords(dto: SyncCommentRecordsDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    if (dto.robotId) {
      await this.findRobotOrThrow(dto.robotId, user, tenantId);
    }
    const rows = this.flattenCommentRecords(dto.comments, {
      platform: dto.platform,
      botNickname: dto.botNickname,
      postTitle: dto.postTitle,
      tenantId,
      robotId: dto.robotId,
    });
    const suppliedTraceIds = Array.from(new Set(rows.map((row: any) => String(row.replyTraceId || '').trim()).filter(Boolean)));
    const suppliedAttemptIds = Array.from(new Set(rows.map((row: any) => String(row.replyAttemptId || '').trim()).filter(Boolean)));
    const authoritativeTraces = dto.robotId && (suppliedTraceIds.length || suppliedAttemptIds.length)
      ? await db.customerServiceReplyTrace.findMany({
          where: {
            tenantId,
            robotId: dto.robotId,
            OR: [
              ...(suppliedTraceIds.length ? [{ id: { in: suppliedTraceIds } }] : []),
              ...(suppliedAttemptIds.length ? [{ replyAttemptId: { in: suppliedAttemptIds } }] : []),
            ],
          },
          select: { id: true, replyAttemptId: true, generationSource: true },
        })
      : [];
    type AuthoritativeReplyTrace = { id: string; replyAttemptId: string | null; generationSource: string | null };
    const traceById = new Map<string, AuthoritativeReplyTrace>(
      authoritativeTraces.map((trace: AuthoritativeReplyTrace) => [String(trace.id), trace]),
    );
    const traceByAttempt = new Map<string, AuthoritativeReplyTrace>(
      authoritativeTraces
        .filter((trace: AuthoritativeReplyTrace) => Boolean(trace.replyAttemptId))
        .map((trace: AuthoritativeReplyTrace) => [String(trace.replyAttemptId), trace]),
    );
    for (const row of rows) {
      const trace = traceById.get(String(row.replyTraceId || '')) ?? traceByAttempt.get(String(row.replyAttemptId || ''));
      row.replyTraceId = trace?.id ?? '';
      row.generationSource = trace?.generationSource ?? '';
      if (trace?.replyAttemptId && !row.replyAttemptId) row.replyAttemptId = trace.replyAttemptId;
    }

    const items = [];
    for (const row of rows) {
      const uniqueWhere = { tenantId_recordId: { tenantId: row.tenantId, recordId: row.recordId } };
      const existing = await db.commentRecord.findUnique({ where: uniqueWhere });
      const item = await db.commentRecord.upsert({
        where: uniqueWhere,
        create: row,
        update: this.mergeCommentRecordUpdate(existing, row),
      });
      items.push(item);
    }
    return { syncedCount: items.length, items: items.map((item: any) => this.toCommentRecordDto(item)) };
  }

  async listCommentRecords(query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { skip, take, page, pageSize } = getPagination(query);
    const where = this.buildCommentRecordWhere(query, user);
    const [items, total] = await Promise.all([
      db.commentRecord.findMany({ where, skip, take, orderBy: [{ commentTime: 'desc' }, { createdAt: 'desc' }] }),
      db.commentRecord.count({ where }),
    ]);
    return { items: items.map((item: any) => this.toCommentRecordDto(item)), page, pageSize, total };
  }

  async listCommentThreads(query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { page, pageSize } = getPagination(query);
    const where = this.buildCommentRecordWhere(query, user);
    const rows = await db.commentRecord.findMany({
      where,
      orderBy: [{ observedAt: 'desc' }, { commentTime: 'desc' }, { createdAt: 'desc' }],
      take: 10000,
    });
    const groups = this.groupCommentThreads(rows);
    const start = Math.max(0, (page - 1) * pageSize);
    return {
      items: groups.slice(start, start + pageSize),
      page,
      pageSize,
      total: groups.length,
    };
  }

  async commentRecordSummary(query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const where = this.buildCommentRecordWhere(query, user);
    const rows = await db.commentRecord.findMany({ where, take: 10000 });
    const groups = this.groupCommentThreads(rows);
    const effectiveRows = this.buildEffectiveCommentRowsForGroups(rows);
    const userRows = effectiveRows.filter((item: any) => (item.senderRole ?? 'user') === 'user');
    const accountRows = effectiveRows.filter((item: any) => item.senderRole === 'account');
    const repliedThreads = groups.filter((item: any) => item.account_reply_count > 0 || ['sent', 'sent_unconfirmed', 'manual'].includes(item.reply_status)).length;
    return {
      thread_count: groups.length,
      message_count: effectiveRows.length,
      raw_message_count: rows.length,
      duplicate_count: Math.max(0, rows.length - effectiveRows.length),
      user_comment_count: userRows.length,
      account_reply_count: accountRows.length,
      top_level_count: effectiveRows.filter((item: any) => Number(item.depth ?? 0) === 0).length,
      follow_up_count: effectiveRows.filter((item: any) => Number(item.depth ?? 0) > 0 && (item.senderRole ?? 'user') === 'user').length,
      replied_thread_count: repliedThreads,
      unreplied_thread_count: Math.max(0, groups.length - repliedThreads),
      failed_count: effectiveRows.filter((item: any) => item.replyStatus === 'failed').length,
      not_required_count: effectiveRows.filter((item: any) => item.replyStatus === 'not_required' || item.skipReply).length,
      incomplete_thread_count: groups.filter((item: any) => item.thread_completeness !== 'visible_complete').length,
      video_count: new Set(effectiveRows.map((item: any) => item.videoId || item.videoTitle || item.postTitle || '').filter(Boolean)).size,
      commenter_count: new Set(userRows.map((item: any) => String(item.userNickname ?? '').trim()).filter(Boolean)).size,
    };
  }

  async commentThreadDetail(rootRecordId: string, query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const resolved = await this.resolveCommentThreadGroup(rootRecordId, query, user);
    return {
      thread: resolved.thread,
      messages: resolved.effectiveRows.map((item: any) => this.toCommentRecordDto(item)),
    };
  }

  async deleteCommentThread(rootRecordId: string, query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const resolved = await this.resolveCommentThreadGroup(rootRecordId, query, user);
    if (!resolved.rootRecordIds.length) {
      throw new NotFoundException('评论线程不存在');
    }
    const tenantId = resolveTenantId(user, query.tenantId);
    const result = await db.commentRecord.deleteMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        rootRecordId: { in: resolved.rootRecordIds },
      },
    });
    return {
      deleted_count: Number(result.count || 0),
      thread_count: 1,
      root_record_ids: resolved.rootRecordIds,
    };
  }

  async lookupCommentRecords(dto: LookupCommentRecordsDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user, dto.tenantId);
    const robotId = dto.robotId || undefined;
    const platform = dto.platform || undefined;
    const inputRecords = Array.isArray(dto.records) ? dto.records.slice(0, 100) : [];
    const normalized = inputRecords
      .map((item: any, index: number) => ({
        index,
        recordId: String(item?.recordId ?? '').trim(),
        userNickname: String(item?.userNickname ?? '').trim(),
        commentContent: String(item?.commentContent ?? '').trim(),
      }))
      .filter((item: any) => item.recordId || (item.userNickname && item.commentContent));
    if (!normalized.length) {
      return { items: [], total: 0 };
    }

    const baseWhere: any = {
      ...(tenantId ? { tenantId } : {}),
      ...(robotId ? { robotId } : {}),
      ...(platform ? { platform } : {}),
    };
    const orClauses: any[] = [];
    for (const item of normalized) {
      if (item.recordId) {
        orClauses.push({ recordId: item.recordId });
      }
      if (item.userNickname && item.commentContent) {
        orClauses.push({ userNickname: item.userNickname, commentContent: item.commentContent });
      }
    }
    const rows = await db.commentRecord.findMany({
      where: { ...baseWhere, OR: orClauses },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(1, Math.min(200, orClauses.length * 2)),
    });
    const items = rows.map((row: any) => this.toCommentRecordDto(row));
    return { items, total: items.length };
  }

  async listCommentTree(query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const where = this.buildCommentRecordWhere(query, user);
    const items = await db.commentRecord.findMany({ where, orderBy: [{ rootRecordId: 'asc' }, { depth: 'asc' }, { commentTime: 'asc' }, { createdAt: 'asc' }] });
    const nodes = items.map((item: any) => ({ ...this.toCommentRecordDto(item), children: [] as any[] }));
    const map = new Map<string, any>();
    nodes.forEach((node: any) => map.set(node.record_id, node));
    const roots: any[] = [];
    for (const node of nodes) {
      if (node.parent_record_id && map.has(node.parent_record_id)) {
        map.get(node.parent_record_id).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return {
      module: 'comment',
      platform: query.platform ?? items[0]?.platform ?? '',
      bot_nickname: query.botNickname ?? items[0]?.botNickname ?? '',
      post_title: query.postTitle ?? items[0]?.postTitle ?? '',
      comments: roots,
    };
  }

  async syncDmConversations(dto: SyncDmConversationsDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    if (dto.robotId) {
      await this.findRobotOrThrow(dto.robotId, user, tenantId);
    }
    const conversations = [];
    for (const conversation of dto.conversations) {
      const conversationId = conversation.conversationId || `dm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const savedConversation = await db.dmConversation.upsert({
        where: { conversationId },
        create: {
          tenantId,
          robotId: dto.robotId,
          conversationId,
          module: 'dm',
          platform: dto.platform,
          botNickname: dto.botNickname,
          userNickname: conversation.userNickname,
          manualTakeover: conversation.manualTakeover ?? false,
          rawData: this.stripUndefined(conversation),
        },
        update: {
          robotId: dto.robotId,
          platform: dto.platform,
          botNickname: dto.botNickname,
          userNickname: conversation.userNickname,
          manualTakeover: conversation.manualTakeover ?? false,
          rawData: this.stripUndefined(conversation),
        },
      });
      let sortIndex = 1;
      for (const turn of conversation.turns) {
        const normalized = this.normalizeDmTurnForDb(turn, savedConversation, sortIndex++);
        await db.dmTurn.upsert({
          where: { turnId: normalized.turnId },
          create: normalized,
          update: this.omit(normalized, ['id', 'turnId', 'conversationId', 'createdAt']),
        });
      }
      const full = await db.dmConversation.findUnique({ where: { conversationId }, include: { turns: { orderBy: { sortIndex: 'asc' } } } });
      conversations.push(this.toDmConversationDto(full));
    }
    return { syncedCount: conversations.length, conversations };
  }

  async listDmConversations(query: DmConversationQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const { skip, take, page, pageSize } = getPagination(query);
    const where = this.buildDmConversationWhere(query, user);
    const [items, total] = await Promise.all([
      db.dmConversation.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, include: { turns: { orderBy: { sortIndex: 'asc' } } } }),
      db.dmConversation.count({ where }),
    ]);
    return {
      module: 'dm',
      platform: query.platform ?? items[0]?.platform ?? '',
      bot_nickname: query.botNickname ?? items[0]?.botNickname ?? '',
      conversations: items.map((item: any) => this.toDmConversationDto(item)),
      page,
      pageSize,
      total,
    };
  }

  private async findPromptConfigOrThrow(id: string, user: CurrentUserPayload, explicitTenantId?: string) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user, explicitTenantId);
    const item = await db.autoReplyPromptConfig.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
    if (!item) {
      throw new NotFoundException('提示词配置不存在');
    }
    return item;
  }

  private async findRobotOrThrow(id: string, user: CurrentUserPayload, explicitTenantId?: string) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user, explicitTenantId);
    const robot = await db.robot.findFirst({ where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) } });
    if (!robot) {
      throw new NotFoundException('机器人不存在');
    }
    return robot;
  }

  private async findCommentReplyDatasetOrThrow(id: string, user: CurrentUserPayload, explicitTenantId?: string, includeEntries = false) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user, explicitTenantId);
    const dataset = await db.commentReplyDataset.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: includeEntries ? { entries: { where: { enabled: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] } } : undefined,
    });
    if (!dataset) {
      throw new NotFoundException('评论回复导入数据集不存在');
    }
    return dataset;
  }

  private buildDefaultRobotSetting(robot: any, module: string) {
    return {
      tenantId: robot.tenantId,
      robotId: robot.id,
      module,
      promptConfigId: null,
      promptSnapshot: null,
      commentReplyMode: module === 'comment' ? 'ALL_UNREPLIED' : null,
      replyDatasetId: null,
      enableFirstReply: false,
      firstReplyContents: [],
      useConversationContext: true,
      config: null,
    };
  }

  private async patchRobotAutoReplyConfig(robot: any, module: string, setting: any) {
    const db = this.prisma as any;
    const currentConfig = this.asPlainObject(robot.config);
    const autoReply = this.asPlainObject(currentConfig.autoReply);
    const nextConfig = {
      ...currentConfig,
      autoReply: {
        ...autoReply,
        [module]: {
          promptConfigId: setting.promptConfigId ?? null,
          promptSnapshot: setting.promptSnapshot ?? null,
          commentReplyMode: setting.commentReplyMode ?? null,
          replyDatasetId: setting.replyDatasetId ?? null,
          enableFirstReply: setting.enableFirstReply ?? false,
          firstReplyContents: setting.firstReplyContents ?? [],
          useConversationContext: setting.useConversationContext ?? true,
          config: setting.config ?? null,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    await db.robot.update({ where: { id: robot.id }, data: { config: nextConfig } });
  }

  private promptConfigToSnapshot(config: any) {
    return {
      id: config.id,
      module: config.module,
      name: config.name,
      customSystemPrompt: config.customSystemPrompt ?? '',
      customUserPrompt: config.customUserPrompt ?? '',
      forbiddenWords: config.forbiddenWords ?? '',
      requiredWords: config.requiredWords ?? '',
      replyStyle: config.replyStyle ?? '',
      platformLabel: config.platformLabel ?? '',
      accountPositioning: config.accountPositioning ?? '',
      businessProfile: config.businessProfile ?? '',
      goal: config.goal ?? '',
      policy: config.policy ?? '',
      safetyPolicy: config.safetyPolicy ?? '',
      replyLength: config.replyLength ?? undefined,
      maxMsgCount: config.maxMsgCount ?? undefined,
      workflowMode: this.safeReflectGet(config.extraParams, 'WORKFLOW_MODE') ?? 'DEFAULT',
      workflowId: this.safeReflectGet(config.extraParams, 'WORKFLOW_ID') ?? '',
      workflowBotId: this.safeReflectGet(config.extraParams, 'WORKFLOW_BOT_ID') ?? '',
      workflowInputKey: this.safeReflectGet(config.extraParams, 'WORKFLOW_INPUT_KEY') ?? 'input',
      extraParams: config.extraParams ?? {},
    };
  }

  private mergePromptSnapshot(snapshot: Record<string, unknown>, overrides?: Record<string, unknown>) {
    if (!overrides || typeof overrides !== 'object') {
      return snapshot;
    }
    return { ...snapshot, ...this.stripUndefined(overrides) };
  }

  private snapshotToPromptConfigUpdate(snapshot: any) {
    return this.stripUndefined({
      name: typeof snapshot.name === 'string' && snapshot.name.trim() ? snapshot.name.trim() : undefined,
      customSystemPrompt: snapshot.customSystemPrompt,
      customUserPrompt: snapshot.customUserPrompt,
      forbiddenWords: snapshot.forbiddenWords,
      requiredWords: snapshot.requiredWords,
      replyStyle: snapshot.replyStyle,
      platformLabel: snapshot.platformLabel,
      accountPositioning: snapshot.accountPositioning,
      businessProfile: snapshot.businessProfile,
      goal: snapshot.goal,
      policy: snapshot.policy,
      safetyPolicy: snapshot.safetyPolicy,
      replyLength: snapshot.replyLength,
      maxMsgCount: snapshot.maxMsgCount,
      extraParams: {
        ...this.asPlainObject(snapshot.extraParams),
        WORKFLOW_MODE: String(snapshot.workflowMode ?? this.safeReflectGet(snapshot.extraParams, 'WORKFLOW_MODE') ?? 'DEFAULT'),
        WORKFLOW_ID: String(snapshot.workflowId ?? this.safeReflectGet(snapshot.extraParams, 'WORKFLOW_ID') ?? ''),
        WORKFLOW_BOT_ID: String(snapshot.workflowBotId ?? this.safeReflectGet(snapshot.extraParams, 'WORKFLOW_BOT_ID') ?? ''),
        WORKFLOW_INPUT_KEY: String(snapshot.workflowInputKey ?? this.safeReflectGet(snapshot.extraParams, 'WORKFLOW_INPUT_KEY') ?? 'input'),
      },
    });
  }

  private async resolveRobotReplyDatasetId(robotId: string, module: string, user: CurrentUserPayload, explicitTenantId?: string) {
    const db = this.prisma as any;
    const robot = await this.findRobotOrThrow(robotId, user, explicitTenantId);
    const setting = await db.autoReplyRobotSetting.findUnique({ where: { robotId_module: { robotId: robot.id, module } } });
    return String(setting?.replyDatasetId ?? '').trim();
  }

  private async resolveReplyTenantId(user: CurrentUserPayload, requestedTenantId?: string, robotId?: string) {
    const scopedTenantId = resolveTenantId(user, requestedTenantId);
    if (scopedTenantId && scopedTenantId !== '__NO_TENANT__') return scopedTenantId;
    if (robotId) {
      const robot = await this.findRobotOrThrow(robotId, user, requestedTenantId);
      return robot.tenantId;
    }
    return resolveRequiredTenantId(user, requestedTenantId);
  }

  private async createReplyTraceSafely<T extends { id: string }>(factory: () => Promise<T>): Promise<T | null> {
    try {
      return await factory();
    } catch (traceError) {
      this.logger.error(`Reply Trace 保存失败，保留原自动回复结果：${traceError instanceof Error ? traceError.message : String(traceError)}`);
      return null;
    }
  }

  private async resolveAutoReplyFixedQa(
    input: { tenantId: string; accountProfileId: string; message: string },
  ): Promise<CustomerServiceFixedQaMatch | null> {
    const accountProfileId = String(input.accountProfileId || '').trim();
    const message = String(input.message || '').trim();
    if (!accountProfileId || !message) return null;
    const account = await (this.prisma as any).customerServiceAccountProfile.findFirst({
      where: { id: accountProfileId, tenantId: input.tenantId, status: 'ENABLED', deletedAt: null },
      select: { id: true, storeProfileId: true, merchantRoleId: true },
    });
    if (!account) return null;
    return this.knowledgeEntriesService.resolveFixedQaForRuntime({
      tenantId: input.tenantId,
      accountProfileId: account.id,
      storeProfileId: account.storeProfileId || undefined,
      merchantRoleId: account.merchantRoleId || undefined,
      message,
    });
  }

  private async buildFixedQaCommentReply(input: {
    tenantId: string;
    sourceType: CustomerServiceReplyTraceSourceType;
    sourceRefId: string;
    dto: CommentTestReplyDto;
    user: CurrentUserPayload;
    accountProfileId: string;
    match: CustomerServiceFixedQaMatch;
  }) {
    const segment = { index: 0, content: input.match.answer, delayBeforeMs: input.match.delayMs };
    const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
      tenantId: input.tenantId,
      createdById: input.user.id,
      context: {
        sourceType: input.sourceType,
        sourceRefId: input.sourceRefId,
        robotId: input.dto.robotId,
        channel: 'COMMENT',
        platform: input.dto.platform,
        commentThreadId: input.dto.commentThreadId,
        customerMessageId: input.dto.customerMessageId || input.dto.commentThreadId,
        replyMessageId: input.dto.replyMessageId,
        replyAttemptId: input.dto.replyAttemptId,
        postContext: input.dto.postContext,
      },
      customerMessage: input.dto.userInput,
      replySegments: [segment],
      provider: 'FIXED_QA',
      generationSource: 'FIXED_QA',
      accountProfileId: input.accountProfileId || undefined,
      knowledgeEntryIds: [input.match.entryId],
      details: {
        modelCalled: false,
        hveInvoked: false,
        fixedQa: this.fixedQaTraceDetails(input.match),
      },
    }));
    return {
      replyTraceId: trace?.id,
      source: 'knowledge_fixed_qa',
      provider: 'FIXED_QA',
      matched: true,
      entryId: input.match.entryId,
      reply: input.match.answer,
      commentType: 'fixed_qa',
      intentLevel: 'high',
      riskLevel: 'LOW',
      judgeReason: '命中当前账号/店铺/客服身份可用的固定问答，按配置原文直出，未调用模型。',
      shouldReply: true,
      skipReply: false,
      skipReason: '',
      manualTakeover: false,
      replyStatus: 'generated',
      modelCalled: false,
      raw: {
        action: 'SEND',
        replySource: 'FIXED_QA',
        modelCalled: false,
        hveInvoked: false,
        replyTraceId: trace?.id,
        segments: [segment],
        fixedQa: this.fixedQaTraceDetails(input.match),
        cancelRemainingOnCustomerMessage: true,
      },
    };
  }

  private async buildFixedQaDmReply(input: {
    tenantId: string;
    sourceType: CustomerServiceReplyTraceSourceType;
    sourceRefId: string;
    dto: DmTestReplyDto;
    user: CurrentUserPayload;
    accountProfileId: string;
    match: CustomerServiceFixedQaMatch;
  }) {
    const segment = { index: 0, content: input.match.answer, delayBeforeMs: input.match.delayMs };
    const trace = await this.createReplyTraceSafely(() => this.replyTracesService.createExternalTrace({
      tenantId: input.tenantId,
      createdById: input.user.id,
      context: {
        sourceType: input.sourceType,
        sourceRefId: input.sourceRefId,
        robotId: input.dto.robotId,
        channel: 'DM',
        platform: input.dto.platform,
        conversationId: input.dto.dialogueConversationId || input.dto.conversationId,
        customerMessageId: input.dto.customerMessageId || input.dto.currentClientMessageIds?.[0],
        replyMessageId: input.dto.replyMessageId,
        replyAttemptId: input.dto.replyAttemptId,
      },
      customerMessage: input.dto.messageContent,
      replySegments: [segment],
      provider: 'FIXED_QA',
      generationSource: 'FIXED_QA',
      accountProfileId: input.accountProfileId || undefined,
      knowledgeEntryIds: [input.match.entryId],
      details: {
        modelCalled: false,
        hveInvoked: false,
        fixedQa: this.fixedQaTraceDetails(input.match),
      },
    }));
    return {
      replyTraceId: trace?.id,
      source: 'knowledge_fixed_qa',
      provider: 'FIXED_QA',
      supportsConversationContext: true,
      conversationId: input.dto.conversationId ?? '',
      dialogueConversationId: input.dto.dialogueConversationId ?? '',
      contextMessageCount: 0,
      replies: [input.match.answer],
      replyCount: 1,
      shouldReply: true,
      skipReply: false,
      skipReason: '',
      manualTakeover: false,
      replyStatus: 'generated',
      failReason: '',
      modelCalled: false,
      raw: {
        action: 'SEND',
        messageType: 'fixed_qa',
        intentLevel: 'high',
        riskLevel: 'LOW',
        judgeReason: '命中当前账号/店铺/客服身份可用的固定问答，按配置原文直出，未调用模型。',
        replySource: 'FIXED_QA',
        modelCalled: false,
        hveInvoked: false,
        replyTraceId: trace?.id,
        segments: [segment],
        fixedQa: this.fixedQaTraceDetails(input.match),
        cancelRemainingOnCustomerMessage: true,
      },
    };
  }

  private fixedQaTraceDetails(match: CustomerServiceFixedQaMatch) {
    return {
      entryId: match.entryId,
      title: match.title,
      matchType: match.matchType,
      matchedPhrases: match.matchedPhrases,
      matchedKeywords: match.matchedKeywords,
      priority: match.priority,
      configuredDelayMs: match.delayMs,
      loadingDelay: match.loadingDelay,
      applicability: match.applicability,
    };
  }

  private async applyFixedQaRuntimeDelay<T>(result: T): Promise<T> {
    const root = this.asPlainObject(result);
    const raw = this.asPlainObject(root.raw);
    const provider = String(root.provider || '').trim().toUpperCase();
    const replySource = String(raw.replySource || '').trim().toUpperCase();
    if (provider !== 'FIXED_QA' && replySource !== 'FIXED_QA') return result;

    const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
    const firstSegment = rawSegments.length ? this.asPlainObject(rawSegments[0]) : {};
    const fixedQa = this.asPlainObject(raw.fixedQa);
    const configuredDelay = Number(firstSegment.delayBeforeMs ?? fixedQa.configuredDelayMs ?? 0);
    const delayMs = Number.isFinite(configuredDelay)
      ? Math.max(0, Math.min(8000, Math.trunc(configuredDelay)))
      : 0;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }

    // The production endpoint has already consumed the typing/loading delay server-side.
    // Zero the projected first-segment delay so downstream senders do not apply it twice.
    const projectedSegments = rawSegments.map((segment, index) => {
      const record = this.asPlainObject(segment);
      return index === 0 ? { ...record, delayBeforeMs: 0 } : record;
    });
    return {
      ...root,
      raw: {
        ...raw,
        segments: projectedSegments,
        fixedQaRuntimeDelayApplied: true,
        fixedQaRuntimeDelayAppliedMs: delayMs,
      },
    } as T;
  }

  private async resolveAiBinding(
    module: 'comment' | 'dm',
    dto: CommentTestReplyDto | DmTestReplyDto,
    user: CurrentUserPayload,
    explicitTenantId?: string,
  ): Promise<AutoReplyAiBinding> {
    let configured: Record<string, unknown> = {};
    if (dto.robotId) {
      const db = this.prisma as any;
      const robot = await this.findRobotOrThrow(dto.robotId, user, explicitTenantId);
      const setting = await db.autoReplyRobotSetting.findUnique({
        where: { robotId_module: { robotId: robot.id, module } },
      });
      configured = this.asPlainObject(this.asPlainObject(setting?.config).aiBinding);
    }
    const requestedProvider = String(dto.aiProvider ?? configured.provider ?? 'COZE').trim().toUpperCase();
    const provider: AutoReplyAiBinding['provider'] = requestedProvider === 'DEEPSEEK' ? 'DEEPSEEK' : 'COZE';
    const configuredAssets = Array.isArray(configured.assetIds) ? configured.assetIds : [];
    return {
      provider,
      accountProfileId: String(dto.accountProfileId ?? configured.accountProfileId ?? '').trim(),
      fallbackToCoze: dto.fallbackToCoze ?? configured.fallbackToCoze === true,
      assetIds: Array.from(new Set((dto.assetIds ?? configuredAssets).map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 100),
    };
  }

  private async resolveDmConversationHistory(
    dto: DmTestReplyDto,
    user: CurrentUserPayload,
    accountProfileId: string,
    tenantId: string,
  ): Promise<{
    history: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
    window: Record<string, unknown> | null;
  }> {
    if (dto.useConversationContext === false || !dto.dialogueConversationId) {
      return { history: [], window: null };
    }
    try {
      const conversationStrategy = await this.resolveConversationStrategyForBinding(accountProfileId, tenantId);
      // C5-B: DeepSeek no longer uses the legacy prompt maxMsgCount as its
      // history policy. Canonical history is selected by the server-side
      // conversation-context token budget; Coze keeps the old maxMsgCount path.
      const context = await this.dialogueRecordsService.getActiveContextForReply(
        dto.dialogueConversationId,
        user,
        dto.currentClientMessageIds ?? [],
        conversationStrategy.policy.contextBudget.mode === 'CUSTOM'
          ? conversationStrategy.policy.contextBudget.activeContextTokenBudget
          : undefined,
        dto.messageContent,
      );
      const rows = Array.isArray(context.items) ? context.items : [];
      return {
        history: rows.map((item: any) => ({
          role: item.senderRole === 'account' ? 'ASSISTANT' as const : 'CUSTOMER' as const,
          content: String(item.textContent || '').trim(),
        })).filter((item) => Boolean(item.content)),
        window: context.window && typeof context.window === 'object' ? context.window as Record<string, unknown> : null,
      };
    } catch {
      return { history: [], window: null };
    }
  }

  private async resolveConversationStrategyForBinding(accountProfileId: string, tenantId: string) {
    const db = this.prisma as any;
    const accountId = String(accountProfileId || '').trim();
    if (!accountId) return resolveCustomerServiceConversationStrategyPreferences({});
    const accountProfile = await db.customerServiceAccountProfile.findFirst({
      where: { id: accountId, tenantId, deletedAt: null, status: 'ENABLED' },
      select: { id: true, storeProfileId: true, profile: true },
    });
    if (!accountProfile) return resolveCustomerServiceConversationStrategyPreferences({});
    const storeProfile = accountProfile.storeProfileId
      ? await db.customerServiceStoreProfile.findFirst({
          where: { id: accountProfile.storeProfileId, tenantId, deletedAt: null, status: 'ENABLED' },
          select: { id: true, profile: true },
        })
      : null;
    return resolveCustomerServiceConversationStrategyPreferences({ storeProfile, accountProfile });
  }

  private async resolvePromptSnapshot(module: string, promptConfigId: string | undefined, robotId: string | undefined, user: CurrentUserPayload, explicitTenantId?: string) {
    const db = this.prisma as any;
    if (promptConfigId) {
      const config = await this.findPromptConfigOrThrow(promptConfigId, user, explicitTenantId);
      if (config.module !== module) {
        throw new ConflictException('提示词配置模块不匹配');
      }
      return this.promptConfigToSnapshot(config);
    }
    if (robotId) {
      const robot = await this.findRobotOrThrow(robotId, user, explicitTenantId);
      const setting = await db.autoReplyRobotSetting.findUnique({ where: { robotId_module: { robotId: robot.id, module } } });
      if (setting?.promptSnapshot) {
        return setting.promptSnapshot;
      }
      if (setting?.promptConfigId) {
        const config = await this.findPromptConfigOrThrow(setting.promptConfigId, user, robot.tenantId);
        return this.promptConfigToSnapshot(config);
      }
    }
    return {};
  }

  private resolveWorkflowSelection(
    module: 'comment' | 'dm',
    dto: CommentTestReplyDto | DmTestReplyDto,
    prompt: any,
  ): AutoReplyWorkflowSelection {
    const extraParams = this.asPlainObject(prompt?.extraParams);
    const requestedMode = String(
      (dto as any).workflowMode
        ?? prompt?.workflowMode
        ?? extraParams.WORKFLOW_MODE
        ?? 'DEFAULT',
    ).trim().toUpperCase();
    const mode: AutoReplyWorkflowMode = requestedMode === 'PLAIN_CHAT'
      ? 'PLAIN_CHAT'
      : requestedMode === 'STRUCTURED'
        ? 'STRUCTURED'
        : 'DEFAULT';

    const configuredWorkflowId = String(
      (dto as any).workflowId
        ?? prompt?.workflowId
        ?? extraParams.WORKFLOW_ID
        ?? '',
    ).trim();
    const configuredBotId = String(
      (dto as any).workflowBotId
        ?? prompt?.workflowBotId
        ?? extraParams.WORKFLOW_BOT_ID
        ?? '',
    ).trim();
    const rawInputKey = String(
      (dto as any).workflowInputKey
        ?? prompt?.workflowInputKey
        ?? extraParams.WORKFLOW_INPUT_KEY
        ?? 'input',
    ).trim();
    const inputKey = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(rawInputKey) ? rawInputKey : 'input';

    if (mode === 'PLAIN_CHAT') {
      if (!configuredWorkflowId) {
        throw new BadRequestException('纯聊天工作流模式必须填写工作流 ID');
      }
      return { mode, workflowId: configuredWorkflowId, botId: '', inputKey };
    }

    if (mode === 'STRUCTURED') {
      if (!configuredWorkflowId) {
        throw new BadRequestException('自定义结构化工作流模式必须填写工作流 ID');
      }
      return {
        mode,
        workflowId: configuredWorkflowId,
        botId: module === 'dm'
          ? configuredBotId || String(this.configService.get<string>('COZE_DM_CHAT_BOT_ID') ?? String(this.configService.get<string>('COZE_DM_CHAT_BOT_ID') || '').trim()).trim()
          : '',
        inputKey,
      };
    }

    return {
      mode: 'DEFAULT',
      workflowId: module === 'comment'
        ? String(this.configService.get<string>('COZE_COMMENT_REPLY_WORKFLOW_ID') ?? String(this.configService.get<string>('COZE_COMMENT_REPLY_WORKFLOW_ID') || '').trim()).trim()
        : String(this.configService.get<string>('COZE_DM_CHAT_WORKFLOW_ID') ?? String(this.configService.get<string>('COZE_DM_CHAT_WORKFLOW_ID') || '').trim()).trim(),
      botId: module === 'dm'
        ? String(this.configService.get<string>('COZE_DM_CHAT_BOT_ID') ?? String(this.configService.get<string>('COZE_DM_CHAT_BOT_ID') || '').trim()).trim()
        : '',
      inputKey,
    };
  }

  private normalizeCommentContextRows(rows: any[], currentInput: string) {
    const normalized: Array<{ role: 'user' | 'account'; author: string; content: string; level: number; messageId: string }> = [];
    const seenConsecutive = new Set<string>();
    let previousSignature = '';
    for (const raw of Array.isArray(rows) ? rows : []) {
      const content = String(raw?.content ?? raw?.commentContent ?? raw?.textContent ?? raw?.typePlaceholder ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000);
      if (!content) continue;
      const role: 'user' | 'account' = String(raw?.role ?? raw?.senderRole ?? '').toLowerCase() === 'account' ? 'account' : 'user';
      const row = {
        role,
        author: String(raw?.author ?? raw?.userNickname ?? '').replace(/\s+/g, ' ').trim().slice(0, 128),
        content,
        level: Math.max(1, Math.min(9, Number(raw?.level ?? Number(raw?.depth ?? 0) + 1) || 1)),
        messageId: String(raw?.messageId ?? raw?.recordId ?? '').trim().slice(0, 256),
      };
      const signature = `${row.role}|${row.level}|${row.content.toLocaleLowerCase()}`;
      if (signature === previousSignature) continue;
      previousSignature = signature;
      seenConsecutive.add(signature);
      normalized.push(row);
    }

    const current = String(currentInput || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    if (current) {
      for (let index = normalized.length - 1; index >= 0; index -= 1) {
        if (normalized[index].role === 'user' && normalized[index].content.toLocaleLowerCase() === current) {
          normalized.splice(index, 1);
          break;
        }
      }
    }

    const limited = normalized.length > 10 ? [normalized[0], ...normalized.slice(-9)] : normalized;
    const selected: typeof normalized = [];
    let totalLength = 0;
    for (let index = limited.length - 1; index >= 0; index -= 1) {
      const row = limited[index];
      if (selected.length && totalLength + row.content.length > 1800) continue;
      selected.push(row);
      totalLength += row.content.length;
    }
    return selected.reverse();
  }

  private async resolveCommentThreadContext(dto: CommentTestReplyDto, tenantId?: string) {
    const supplied = this.normalizeCommentContextRows(dto.threadContext ?? [], dto.userInput);
    if (supplied.length) {
      return { items: supplied, source: dto.contextSource?.trim() || 'client_context' };
    }
    const threadId = String(dto.commentThreadId || '').trim();
    if (!threadId) return { items: [], source: 'none' };
    try {
      const db = this.prisma as any;
      const rows = await db.commentRecord.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(dto.robotId ? { robotId: dto.robotId } : {}),
          OR: [{ rootRecordId: threadId }, { recordId: threadId }],
        },
        orderBy: [{ observedAt: 'asc' }, { commentTime: 'asc' }, { createdAt: 'asc' }],
        take: 40,
      });
      const expanded: any[] = [];
      for (const row of rows ?? []) {
        expanded.push({
          role: row.senderRole,
          author: row.userNickname,
          content: row.commentContent || row.typePlaceholder,
          level: Number(row.depth ?? 0) + 1,
          messageId: row.recordId,
        });
        const reply = String(row.replyContent || '').replace(/\s+/g, ' ').trim();
        const replyStatus = String(row.replyStatus || '').toLowerCase();
        if (reply && ['sent', 'sent_unconfirmed', 'manual', 'manual_or_external_reply'].includes(replyStatus)) {
          expanded.push({
            role: 'account',
            author: row.botNickname || '账号',
            content: reply,
            level: Math.max(2, Number(row.depth ?? 0) + 1),
            messageId: `${row.recordId}:reply`,
          });
        }
      }
      const items = this.normalizeCommentContextRows(expanded, dto.userInput);
      return { items, source: items.length ? 'server_records' : 'none' };
    } catch {
      return { items: [], source: 'none' };
    }
  }

  private buildCommentContextInput(userInput: string, rows: Array<{ role: string; author: string; content: string; level: number }>, postContext?: string) {
    const history = rows.map((item) => {
      const role = item.role === 'account' ? '账号' : '用户';
      const author = item.author ? `(${item.author})` : '';
      return `${role}${author}：${item.content}`;
    }).join('\n');
    return [
      '你正在以这条作品的发布账号本人/账号运营者身份，回复抖音公开评论区里的当前用户。',
      '回复要像账号主人顺手回一句，不要像旁观网友、客服或机器人。通常1句话，必要时2句话，简短自然。',
      '事实边界：只使用作品标题和评论线程里明确出现的信息。地点、拍摄方式、设备、价格、开放时间、效果等没有依据时，不得猜测或装作确定。',
      '身份一致性：不要说“我也不知道这是哪儿”后又替作品作肯定推荐；后续回复的确定程度不能无依据高于前文。',
      '不知道时可以自然说明暂时不确定，或只回应能确定的部分；不要编造承诺，不要引导私信，不要复述规则。',
      postContext ? `作品标题/上下文：${String(postContext).trim().slice(0, 500)}` : '作品标题/上下文：未提供',
      rows.length ? '以下是同一根评论线程中已经发生的真实互动，仅用于理解指代和承接语义。不要复述历史，不要提及记录、数据库、上下文或系统。' : undefined,
      rows.length ? '评论线程历史：' : undefined,
      rows.length ? history : undefined,
      '',
      '当前需要回复的评论：',
      userInput,
      '',
      '只输出最终可发布的中文回复文本。',
    ].filter((item): item is string => typeof item === 'string').join('\n');
  }

  private buildCommentWorkflowParameters(dto: CommentTestReplyDto, prompt: any, contextualInput = '') {
    return {
      USER_INPUT: contextualInput || dto.userInput,
      CUSTOM_SYSTEM_PROMPT: this.pickPromptValue(dto.customSystemPrompt, prompt.customSystemPrompt),
      CUSTOM_USER_PROMPT: this.pickPromptValue(dto.customUserPrompt, prompt.customUserPrompt),
      FORBIDDEN_WORDS: this.pickPromptValue(dto.forbiddenWords, prompt.forbiddenWords),
      REQUIRED_WORDS: this.pickPromptValue(dto.requiredWords, prompt.requiredWords),
      REPLY_STYLE: this.pickPromptValue(dto.replyStyle, prompt.replyStyle),
      PLATFORM: this.pickPromptValue(dto.platform, prompt.platformLabel, '抖音评论区'),
      ACCOUNT_POSITIONING: this.pickPromptValue(dto.accountPositioning, prompt.accountPositioning),
      BUSINESS_PROFILE: this.pickPromptValue(dto.businessProfile, prompt.businessProfile),
      POST_CONTEXT: this.pickPromptValue(dto.postContext, prompt.extraParams?.POST_CONTEXT),
      COMMENT_GOAL: this.pickPromptValue(dto.commentGoal, prompt.goal),
      REPLY_LENGTH: dto.replyLength ?? this.numberOrDefault(prompt.replyLength, 2),
      COMMENT_POLICY: this.pickPromptValue(dto.commentPolicy, prompt.policy),
      SAFETY_POLICY: this.pickPromptValue(dto.safetyPolicy, prompt.safetyPolicy),
    };
  }

  private buildDmChatWorkflowParameters(dto: DmTestReplyDto, prompt: any) {
    return {
      CUSTOM_SYSTEM_PROMPT: this.pickPromptValue(dto.customSystemPrompt, prompt.customSystemPrompt),
      CUSTOM_USER_PROMPT: this.pickPromptValue(dto.customUserPrompt, prompt.customUserPrompt),
      FORBIDDEN_WORDS: this.pickPromptValue(dto.forbiddenWords, prompt.forbiddenWords),
      REQUIRED_WORDS: this.pickPromptValue(dto.requiredWords, prompt.requiredWords),
      REPLY_STYLE: this.pickPromptValue(dto.replyStyle, prompt.replyStyle),
      PLATFORM: this.pickPromptValue(dto.platform, prompt.platformLabel, '抖音私信'),
      ACCOUNT_POSITIONING: this.pickPromptValue(dto.accountPositioning, prompt.accountPositioning),
      BUSINESS_PROFILE: this.pickPromptValue(dto.businessProfile, prompt.businessProfile),
      CONVERSION_GOAL: this.pickPromptValue(dto.conversionGoal, prompt.goal),
      REPLY_LENGTH: dto.replyLength ?? this.numberOrDefault(prompt.replyLength, 2),
      MAX_MSG_COUNT: dto.maxMsgCount ?? this.numberOrDefault(prompt.maxMsgCount, 3),
      CONTACT_POLICY: this.pickPromptValue(dto.contactPolicy, prompt.policy),
      SAFETY_POLICY: this.pickPromptValue(dto.safetyPolicy, prompt.safetyPolicy),
    };
  }

  private pickPromptValue(...values: unknown[]) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return '';
  }

  private numberOrDefault(value: unknown, fallback: number) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  private async runCozeQueued<T>(label: string, task: () => Promise<T>): Promise<T> {
    const seq = ++this.cozeQueueSeq;
    const startedAt = Date.now();
    const previous = this.cozeQueueTail.catch(() => undefined);
    let releaseCurrent: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    this.cozeQueueTail = previous.then(() => current);
    await previous;
    try {
      return await task();
    } finally {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > 30_000) {
        // eslint-disable-next-line no-console
        console.warn(`[auto-replies] Coze queue item slow: label=${label}, seq=${seq}, elapsedMs=${elapsedMs}`);
      }
      releaseCurrent?.();
    }
  }

  private async requestCozeWorkflowRun(
    parameters: Record<string, unknown>,
    workflowIdOverride?: string,
    label = 'Coze 评论自动回复工作流',
  ) {
    const baseUrl = this.getCozeApiBaseUrl();
    const token = await this.getCozeBearerToken();
    const workflowId = String(workflowIdOverride || this.configService.get<string>('COZE_COMMENT_REPLY_WORKFLOW_ID') || '').trim();
    if (!workflowId) {
      throw new InternalServerErrorException('Coze 评论自动回复工作流 ID 缺失，请配置 COZE_COMMENT_REPLY_WORKFLOW_ID');
    }
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/workflow/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId, parameters }),
        signal: AbortSignal.timeout(this.getCozeAutoReplyTimeoutMs()),
      });
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, { workflowId });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, `${label}请求失败`), diagnostic),
      );
    }
    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, {
        workflowId,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        logId: readCozeLogIdFromHeaders(response.headers),
      });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, `读取${label}响应失败`), diagnostic),
      );
    }
    const responseJson = this.parseCozeJsonResponse(responseText, response.headers.get('content-type'));
    this.ensureCozeOk(response, responseJson, `${label}调用失败`, {
      workflowId,
      logId: readCozeLogIdFromHeaders(response.headers),
    });
    const data = this.safeReflectGet(responseJson, 'data');
    return typeof data === 'string' ? this.safeJsonParse(data) : data ?? responseJson;
  }

  private async requestCozePlainWorkflow(input: string, workflow: AutoReplyWorkflowSelection) {
    const parameters = { [workflow.inputKey || 'input']: input };
    const raw = await this.requestCozeWorkflowRun(parameters, workflow.workflowId, 'Coze 纯聊天工作流');
    const reply = this.extractCozePlainReply(raw);
    if (!reply) {
      throw new BadGatewayException(`Coze 纯聊天工作流未返回有效文本（workflowId=${workflow.workflowId}）`);
    }
    return { reply, raw };
  }

  private async requestCozeWorkflowChat(
    messageContent: string,
    parameters: Record<string, unknown>,
    conversationId: string | undefined,
    workflow: AutoReplyWorkflowSelection,
  ) {
    const maxAttempts = this.clampNumber(Number(this.configService.get<string>('COZE_DM_CHAT_RETRY_ATTEMPTS') ?? 2), 1, 3);
    let lastError: unknown = null;
    let lastDiagnostic: CozeSafeDiagnostic | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.requestCozeWorkflowChatOnce(messageContent, parameters, conversationId, workflow);
        const replies = this.extractCozeDmReplies(result.raw, result.completed);
        if (replies.length) {
          return { ...result, replies };
        }
        lastDiagnostic = { ...result.diagnostic, retryAttempts: attempt };
        const message = `Coze 私信对话流未返回 content.REPLIES（attempt ${attempt}/${maxAttempts}）`;
        lastError = new BadGatewayException(cozeErrorResponse(message, lastDiagnostic));
      } catch (error) {
        lastError = error;
        const failure = this.getCozeExceptionDetails(error, 'Coze 私信对话流调用失败');
        if (failure.coze) {
          lastDiagnostic = { ...failure.coze, retryAttempts: attempt };
        }
      }
      if (attempt < maxAttempts) {
        await this.sleep(700 * attempt);
      }
    }
    const failure = this.getCozeExceptionDetails(lastError, 'Coze 私信对话流未返回 content.REPLIES');
    const diagnostic = lastDiagnostic
      ? { ...lastDiagnostic, retryAttempts: maxAttempts }
      : failure.coze;
    const message = `${failure.message}；已重试 ${maxAttempts} 次`;
    if (diagnostic) {
      throw new BadGatewayException(cozeErrorResponse(message, diagnostic));
    }
    throw new BadGatewayException(message);
  }

  private async requestCozeWorkflowChatOnce(
    messageContent: string,
    parameters: Record<string, unknown>,
    conversationId: string | undefined,
    workflow: AutoReplyWorkflowSelection,
  ) {
    const baseUrl = this.getCozeApiBaseUrl();
    const token = await this.getCozeBearerToken();
    const workflowId = String(workflow.workflowId || this.configService.get<string>('COZE_DM_CHAT_WORKFLOW_ID') || '').trim();
    const botId = String(workflow.botId || this.configService.get<string>('COZE_DM_CHAT_BOT_ID') || '').trim();
    if (!workflowId || !botId) {
      throw new InternalServerErrorException('Coze 私信对话流配置缺失，请配置 COZE_DM_CHAT_WORKFLOW_ID、COZE_DM_CHAT_BOT_ID');
    }
    const payload = {
      workflow_id: workflowId,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      additional_messages: [
        {
          content: messageContent,
          role: 'user',
          type: 'question',
          content_type: 'text',
        },
      ],
      parameters,
      bot_id: botId,
    };
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/workflows/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.getCozeAutoReplyTimeoutMs()),
      });
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, { workflowId, botId });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, 'Coze 私信对话流请求失败'), diagnostic),
      );
    }
    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, {
        workflowId,
        botId,
        httpStatus: response.status,
        httpStatusText: response.statusText,
        logId: readCozeLogIdFromHeaders(response.headers),
      });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, '读取 Coze 私信对话流响应失败'), diagnostic),
      );
    }
    const responseJson = this.parseCozeJsonResponse(responseText, response.headers.get('content-type'));
    const diagnostic = this.ensureCozeOk(response, responseJson, 'Coze 私信对话流调用失败', {
      workflowId,
      botId,
      logId: readCozeLogIdFromHeaders(response.headers),
    });
    const completed = this.extractCozeCompletedMessage(responseJson);
    const resolvedConversationId = String(completed?.conversation_id ?? this.extractCozeConversationId(responseJson) ?? conversationId ?? '').trim();
    return { conversationId: resolvedConversationId, replies: [] as string[], raw: responseJson, completed, diagnostic };
  }

  /**
   * 评论/私信自动回复均为同步 AI 调用。默认允许最长 10 分钟，
   * 以避免长提示词、较多上下文或 Coze 排队时被 60 秒默认值提前中断。
   */
  private getCozeAutoReplyTimeoutMs(): number {
    const configured = Number(this.configService.get<number>('COZE_AUTO_REPLY_TIMEOUT_MS'));
    if (!Number.isFinite(configured)) return 600_000;
    return Math.min(600_000, Math.max(30_000, Math.floor(configured)));
  }

  private getCozeApiBaseUrl() {
    return String(this.configService.get<string>('COZE_API_BASE_URL') || 'https://api.coze.cn').replace(/\/$/, '');
  }

  private async getCozeBearerToken() {
    const serviceAccessToken = String(this.configService.get<string>('COZE_SERVICE_ACCESS_TOKEN') ?? '').trim();
    if (serviceAccessToken) {
      return serviceAccessToken;
    }

    const authMode = String(this.configService.get<string>('COZE_AUTH_MODE') ?? '').trim().toLowerCase();
    const oauthAppId = String(this.configService.get<string>('COZE_OAUTH_APP_ID') ?? '').trim();
    const oauthPublicKeyId = String(this.configService.get<string>('COZE_OAUTH_PUBLIC_KEY_ID') ?? '').trim();
    const oauthPrivateKey = this.normalizePrivateKey(String(this.configService.get<string>('COZE_OAUTH_PRIVATE_KEY') ?? '').trim());
    const shouldUseOauth = authMode === 'oauth_jwt' || Boolean(oauthAppId && oauthPublicKeyId && oauthPrivateKey);

    if (shouldUseOauth) {
      return this.getCozeOauthAccessToken(oauthAppId, oauthPublicKeyId, oauthPrivateKey);
    }

    const pat = String(
      this.configService.get<string>('COZE_PERSONAL_ACCESS_TOKEN') ?? this.configService.get<string>('COZE_API_PAT') ?? '',
    ).trim();
    if (!pat) {
      throw new InternalServerErrorException('Coze 令牌缺失，请配置 COZE_SERVICE_ACCESS_TOKEN，或配置 COZE_OAUTH_*，或临时配置 COZE_API_PAT');
    }
    return pat;
  }

  private async getCozeOauthAccessToken(appId: string, publicKeyId: string, privateKey: string) {
    if (!appId || !publicKeyId || !privateKey) {
      throw new InternalServerErrorException('Coze OAuth JWT 配置缺失，请检查 COZE_OAUTH_APP_ID、COZE_OAUTH_PUBLIC_KEY_ID、COZE_OAUTH_PRIVATE_KEY');
    }
    if (this.cachedCozeAccessToken && this.cachedCozeAccessTokenExpiresAt - Date.now() > 60_000) {
      return this.cachedCozeAccessToken;
    }
    const baseUrl = this.getCozeApiBaseUrl();
    const durationSeconds = this.clampNumber(Number(this.configService.get<string>('COZE_OAUTH_DURATION_SECONDS') ?? 3600), 900, 86399);
    const jwt = this.signCozeJwt(appId, publicKeyId, privateKey);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/permission/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: durationSeconds, grant_type: COZE_JWT_GRANT_TYPE }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error);
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, 'Coze OAuth Access Token 请求失败'), diagnostic),
      );
    }
    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      const diagnostic = createCozeTransportDiagnostic(error, {
        httpStatus: response.status,
        httpStatusText: response.statusText,
        logId: readCozeLogIdFromHeaders(response.headers),
      });
      throw new BadGatewayException(
        cozeErrorResponse(formatCozeErrorMessage(diagnostic, '读取 Coze OAuth 响应失败'), diagnostic),
      );
    }
    const responseJson = this.parseCozeJsonResponse(responseText, response.headers.get('content-type'));
    this.ensureCozeOk(response, responseJson, 'Coze OAuth Access Token 获取失败');
    const accessToken = String(this.safeReflectGet(responseJson, 'access_token') ?? '').trim();
    if (!accessToken) {
      throw new BadGatewayException('Coze OAuth 响应缺少 access_token');
    }
    const expiresIn = Number(this.safeReflectGet(responseJson, 'expires_in') ?? durationSeconds);
    const nowSeconds = Math.floor(Date.now() / 1000);
    this.cachedCozeAccessToken = accessToken;
    this.cachedCozeAccessTokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > nowSeconds + 3600
      ? expiresIn * 1000
      : Date.now() + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : durationSeconds) * 1000;
    return accessToken;
  }

  private signCozeJwt(appId: string, publicKeyId: string, privateKey: string) {
    const now = Math.floor(Date.now() / 1000);
    const audience = String(this.configService.get<string>('COZE_OAUTH_AUDIENCE') ?? 'api.coze.cn').trim() || 'api.coze.cn';
    const header = this.base64UrlJson({ alg: 'RS256', typ: 'JWT', kid: publicKeyId });
    const payload = this.base64UrlJson({ iat: now, exp: now + 600, jti: randomUUID(), aud: audience, iss: appId });
    const input = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256').update(input).end().sign(privateKey).toString('base64url');
    return `${input}.${signature}`;
  }

  private base64UrlJson(value: unknown) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private normalizePrivateKey(value: string) {
    return value.replace(/\\n/g, '\n');
  }

  private clampNumber(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  private ensureCozeOk(
    response: Response,
    responseJson: unknown,
    fallback: string,
    meta: { workflowId?: string; botId?: string; logId?: string } = {},
  ) {
    const diagnostic = extractCozeSafeDiagnostic(responseJson, {
      httpStatus: response.status,
      httpStatusText: response.statusText,
      workflowId: meta.workflowId,
      botId: meta.botId,
      logId: meta.logId || readCozeLogIdFromHeaders(response.headers),
    });
    if (!response.ok || diagnostic.failure) {
      const message = formatCozeErrorMessage(
        diagnostic,
        diagnostic.requiresAction
          ? 'Coze 对话流要求额外操作，当前接口无法自动继续'
          : `${fallback}${response.ok ? '' : `（HTTP ${response.status}）`}`,
      );
      throw new BadGatewayException(cozeErrorResponse(message, diagnostic));
    }
    return diagnostic;
  }

  private parseCozeJsonResponse(responseText: string, contentType?: string | null) {
    const normalizedText = responseText.trim();
    const normalizedContentType = String(contentType ?? '').toLowerCase();
    if (normalizedContentType.includes('text/event-stream') || normalizedText.startsWith('event:')) {
      return this.parseCozeSseResponse(responseText);
    }
    const parsed = this.safeJsonParse(responseText);
    if (typeof parsed === 'string' && parsed === responseText) {
      const preview = normalizedText.replace(/\s+/g, ' ').slice(0, 300);
      return {
        code: 'COZE_INVALID_RESPONSE',
        message: preview ? `Coze 返回非 JSON 响应：${preview}` : 'Coze 返回空响应',
      };
    }
    return parsed;
  }

  private parseCozeSseResponse(responseText: string) {
    const blocks = responseText
      .split(/\r?\n\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean);
    const events = blocks.map((block) => {
      const lines = block.split(/\r?\n/);
      let event = '';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trim());
        }
      }
      const rawData = dataLines.join('\n').trim();
      return { event, rawData, data: this.safeJsonParse(rawData) };
    });
    return { events };
  }

  private extractCozeCompletedMessage(responseJson: unknown) {
    if (responseJson && typeof responseJson === 'object') {
      const events = Reflect.get(responseJson, 'events');
      if (Array.isArray(events)) {
        const completed = events
          .filter((item) => String(Reflect.get(item, 'event') ?? '') === 'conversation.message.completed')
          .map((item) => Reflect.get(item, 'data'))
          .find((item) => item && typeof item === 'object');
        if (completed) {
          return completed as Record<string, unknown>;
        }
      }
    }
    const data = this.safeReflectGet(responseJson, 'data');
    if (data && typeof data === 'object') {
      return data as Record<string, unknown>;
    }
    return responseJson && typeof responseJson === 'object' ? (responseJson as Record<string, unknown>) : null;
  }

  private extractCozeConversationId(responseJson: unknown) {
    const completed = this.extractCozeCompletedMessage(responseJson);
    const direct = this.safeReflectGet(completed, 'conversation_id');
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
    return '';
  }

  private extractCozePlainReply(value: unknown, depth = 0): string {
    if (depth > 8 || value === undefined || value === null) {
      return '';
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '';
      const parsed = this.safeJsonParse(trimmed);
      if (parsed !== trimmed) {
        const nested = this.extractCozePlainReply(parsed, depth + 1);
        if (nested) return nested;
      }
      const normalized = trimmed.replace(/^```(?:json|text)?\s*/i, '').replace(/```$/i, '').trim();
      if (!normalized || /^(ok|success|done|error)$/i.test(normalized)) return '';
      return normalized;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = this.extractCozePlainReply(item, depth + 1);
        if (nested) return nested;
      }
      return '';
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferredKeys = [
        'output',
        'OUTPUT',
        'reply',
        'REPLY',
        'content',
        'text',
        'answer',
        'result',
        'message',
        'data',
      ];
      for (const key of preferredKeys) {
        if (!(key in record)) continue;
        const nested = this.extractCozePlainReply(record[key], depth + 1);
        if (nested) return nested;
      }
      for (const [key, nestedValue] of Object.entries(record)) {
        if (/^(code|status|success|log_id|logId|debug_url|debugUrl)$/i.test(key)) continue;
        const nested = this.extractCozePlainReply(nestedValue, depth + 1);
        if (nested) return nested;
      }
    }
    return '';
  }

  private extractCozeDmReplies(responseJson: unknown, completed?: Record<string, unknown> | null) {
    const payloads: unknown[] = [];
    const pushContent = (value: unknown) => {
      if (value === undefined || value === null) return;
      payloads.push(typeof value === 'string' ? this.safeJsonParse(value) : value);
    };

    pushContent(completed?.content);
    pushContent(this.safeReflectGet(completed, 'content'));
    pushContent(this.safeReflectGet(responseJson, 'content'));
    pushContent(this.safeReflectGet(responseJson, 'data.content'));

    if (responseJson && typeof responseJson === 'object') {
      const events = Reflect.get(responseJson, 'events');
      if (Array.isArray(events)) {
        for (const item of events) {
          const data = Reflect.get(item, 'data');
          if (data && typeof data === 'object') {
            pushContent(this.safeReflectGet(data, 'content'));
            pushContent(this.safeReflectGet(data, 'data.content'));
          }
        }
      }
    }

    for (const payload of payloads) {
      const replies = this.normalizeStringArray(
        this.safeReflectGet(payload, 'REPLIES')
          ?? this.safeReflectGet(payload, 'replies')
          ?? this.safeReflectGet(payload, 'reply')
          ?? this.safeReflectGet(payload, 'REPLY'),
      );
      if (replies.length) {
        return replies;
      }
    }

    return this.extractRepliesFromAny(responseJson);
  }

  private extractRepliesFromAny(value: unknown): string[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (typeof value === 'string') {
      const parsed = this.safeJsonParse(value);
      return parsed === value ? [] : this.extractRepliesFromAny(parsed);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const replies = this.extractRepliesFromAny(item);
        if (replies.length) return replies;
      }
      return [];
    }
    if (typeof value === 'object') {
      const direct = this.normalizeStringArray(
        this.safeReflectGet(value, 'REPLIES')
          ?? this.safeReflectGet(value, 'replies')
          ?? this.safeReflectGet(value, 'reply')
          ?? this.safeReflectGet(value, 'REPLY'),
      );
      if (direct.length) {
        return direct;
      }
      for (const nested of Object.values(value as Record<string, unknown>)) {
        const replies = this.extractRepliesFromAny(nested);
        if (replies.length) return replies;
      }
    }
    return [];
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getCozeExceptionDetails(error: unknown, fallback: string): { message: string; coze: CozeSafeDiagnostic | null } {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return { message: response.trim() || fallback, coze: null };
      }
      if (response && typeof response === 'object') {
        const record = response as Record<string, unknown>;
        const message = typeof record.message === 'string' && record.message.trim()
          ? record.message.trim()
          : fallback;
        const data = record.data && typeof record.data === 'object'
          ? (record.data as Record<string, unknown>)
          : null;
        const coze = data?.coze && typeof data.coze === 'object'
          ? (data.coze as CozeSafeDiagnostic)
          : null;
        return { message, coze };
      }
    }
    if (error instanceof Error && error.message) {
      return { message: error.message, coze: null };
    }
    if (typeof error === 'string' && error.trim()) {
      return { message: error.trim(), coze: null };
    }
    return { message: fallback, coze: null };
  }

  private normalizeCommentWorkflowResult(result: any) {
    const shouldReply = Boolean(result?.SHOULD_REPLY ?? result?.should_reply ?? result?.shouldReply);
    const skipReason = String(result?.SKIP_REASON ?? result?.skip_reason ?? result?.skipReason ?? '').trim();
    const reply = String(result?.COMMENT_REPLY ?? result?.comment_reply ?? result?.reply ?? '').trim();
    return {
      reply,
      commentType: String(result?.COMMENT_TYPE ?? result?.comment_type ?? 'unknown'),
      intentLevel: String(result?.INTENT_LEVEL ?? result?.intent_level ?? 'none'),
      judgeReason: String(result?.JUDGE_REASON ?? result?.judge_reason ?? ''),
      shouldReply,
      skipReply: !shouldReply || Boolean(skipReason),
      skipReason,
      replyStatus: shouldReply ? 'generated' : 'not_required',
    };
  }

  private normalizeCommentReplyDatasetRows(rows: any[], defaultMatchType?: string) {
    const fallbackMatchType = this.normalizeDatasetMatchType(defaultMatchType, 'EXACT');
    return (rows ?? [])
      .map((row) => ({
        commentContent: String(row?.commentContent ?? '').trim(),
        replyContent: String(row?.replyContent ?? '').trim(),
        keywords: this.normalizeStringArray(row?.keywords),
        matchType: this.normalizeDatasetMatchType(row?.matchType, fallbackMatchType),
        priority: Number(row?.priority ?? 0) || 0,
        enabled: row?.enabled ?? true,
      }))
      .filter((row) => row.commentContent && row.replyContent);
  }

  private normalizeDatasetMatchType(value: unknown, fallback: 'EXACT' | 'CONTAINS' | 'FUZZY' = 'EXACT') {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'EXACT' || normalized === 'CONTAINS' || normalized === 'FUZZY') {
      return normalized as 'EXACT' | 'CONTAINS' | 'FUZZY';
    }
    return fallback;
  }

  private matchDatasetEntry(entries: any[], commentContent: string) {
    const normalizedComment = this.normalizeText(commentContent);
    let best: any = null;
    let bestScore = 0;
    for (const entry of entries ?? []) {
      if (!entry?.enabled) continue;
      const score = this.scoreDatasetEntry(entry, normalizedComment);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return best && bestScore > 0 ? { ...best, matchScore: bestScore } : null;
  }

  private scoreDatasetEntry(entry: any, normalizedComment: string) {
    const normalizedEntry = this.normalizeText(entry.commentContent);
    const keywords = this.normalizeStringArray(entry.keywords).map((item: unknown) => this.normalizeText(item)).filter(Boolean);
    const priority = Number(entry.priority ?? 0);
    let score = 0;
    const matchType = this.normalizeDatasetMatchType(entry.matchType, 'EXACT');
    if (matchType === 'EXACT') {
      score = normalizedComment === normalizedEntry ? 1000 : 0;
    } else if (matchType === 'CONTAINS') {
      score = normalizedEntry && (normalizedComment.includes(normalizedEntry) || normalizedEntry.includes(normalizedComment)) ? 800 : 0;
    } else {
      if (normalizedEntry && normalizedComment === normalizedEntry) {
        score = 1000;
      } else if (normalizedEntry && (normalizedComment.includes(normalizedEntry) || normalizedEntry.includes(normalizedComment))) {
        score = 700;
      } else {
        score = Math.floor(this.charOverlapRatio(normalizedComment, normalizedEntry) * 500);
      }
    }
    if (matchType === 'EXACT') {
      return score > 0 ? score + priority : 0;
    }
    const keywordHits = keywords.filter((keyword: string) => normalizedComment.includes(keyword)).length;
    score += keywordHits * 120;
    return score > 0 ? score + priority : 0;
  }

  private datasetMatchResponse(match: any) {
    return {
      matched: true,
      entryId: match.id,
      replyContent: match.replyContent,
      matchType: this.normalizeDatasetMatchType(match.matchType, 'EXACT'),
      priority: match.priority,
      matchScore: match.matchScore,
    };
  }

  private normalizeText(value: unknown) {
    return String(value ?? '').replace(/\s+/g, '').trim().toLowerCase();
  }

  private charOverlapRatio(left: string, right: string) {
    if (!left || !right) return 0;
    const leftSet = new Set([...left]);
    const rightSet = new Set([...right]);
    const shared = [...leftSet].filter((item) => rightSet.has(item)).length;
    return shared / Math.max(leftSet.size, rightSet.size, 1);
  }

  private flattenCommentRecords(comments: CommentRecordItemDto[], ctx: { tenantId: string; robotId?: string; platform: string; botNickname: string; postTitle?: string }) {
    const rows: any[] = [];
    const walk = (items: CommentRecordItemDto[], parentRecordId: string | null, rootRecordId: string | null, depth: number) => {
      for (const item of items) {
        const recordId = item.recordId || `cmt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const currentRootId = item.rootRecordId || rootRecordId || recordId;
        const normalizedDepth = item.depth ?? depth;
        rows.push({
          tenantId: ctx.tenantId,
          robotId: ctx.robotId,
          recordId,
          externalCommentId: item.externalCommentId ?? '',
          platform: ctx.platform,
          botNickname: ctx.botNickname,
          postTitle: ctx.postTitle,
          videoId: item.videoId ?? '',
          videoTitle: item.videoTitle ?? ctx.postTitle,
          rootRecordId: currentRootId,
          parentRecordId: item.parentRecordId ?? parentRecordId,
          depth: normalizedDepth,
          senderRole: item.senderRole ?? 'user',
          actorSource: item.actorSource ?? 'platform_user',
          attributionConfidence: item.attributionConfidence ?? 'unknown',
          replyAttemptId: item.replyAttemptId ?? '',
          replyTraceId: item.replyTraceId ?? '',
          generationSource: item.generationSource ?? '',
          userNickname: item.userNickname,
          commentContent: item.commentContent,
          messageType: item.messageType ?? 'text',
          typePlaceholder: item.typePlaceholder ?? '',
          commentTime: this.parseOptionalDate(item.commentTime),
          sourceTimeRaw: item.sourceTimeRaw ?? '',
          observedAt: this.parseOptionalDate(item.observedAt),
          timeAccuracy: item.timeAccuracy ?? 'unknown',
          collectionStatus: item.collectionStatus ?? 'observed',
          currentFilter: item.currentFilter ?? '',
          repliesCollapsed: item.repliesCollapsed ?? false,
          threadCompleteness: item.threadCompleteness ?? '',
          sourceClientId: item.sourceClientId ?? '',
          shouldReply: item.shouldReply ?? false,
          skipReply: item.skipReply ?? false,
          skipReason: item.skipReason ?? '',
          commentType: item.commentType ?? 'unknown',
          intentLevel: item.intentLevel ?? 'none',
          intentLabel: item.intentLabel ?? '完全无意向',
          judgeReason: item.judgeReason ?? '',
          replyStatus: item.replyStatus ?? 'pending',
          replyContent: item.replyContent ?? '',
          replyTime: this.parseOptionalDate(item.replyTime),
          failReason: item.failReason ?? '',
          rawData: this.stripUndefined({ ...item, children: undefined }),
        });
        if (item.children?.length) {
          walk(item.children, recordId, currentRootId, normalizedDepth + 1);
        }
      }
    };
    walk(comments, null, null, 0);
    return rows;
  }

  private mergeCommentRecordUpdate(existing: any, incoming: any) {
    const update = this.omit(incoming, ['id', 'recordId', 'tenantId', 'createdAt']);
    if (!existing) return update;
    const replyRank: Record<string, number> = {
      pending: 0,
      generated: 10,
      failed: 20,
      not_required: 30,
      manual: 35,
      sent_unconfirmed: 38,
      sent: 40,
    };
    const existingReplyRank = replyRank[String(existing.replyStatus ?? 'pending')] ?? 0;
    const incomingReplyRank = replyRank[String(incoming.replyStatus ?? 'pending')] ?? 0;
    if (incomingReplyRank < existingReplyRank) {
      update.replyStatus = existing.replyStatus;
      update.replyContent = existing.replyContent;
      update.replyTime = existing.replyTime;
      update.failReason = existing.failReason;
      update.skipReply = existing.skipReply;
      update.skipReason = existing.skipReason;
      update.shouldReply = existing.shouldReply;
    } else {
      if (!incoming.replyContent && existing.replyContent) update.replyContent = existing.replyContent;
      if (!incoming.replyTime && existing.replyTime) update.replyTime = existing.replyTime;
      if (!incoming.failReason && existing.failReason) update.failReason = existing.failReason;
    }
    const collectionRank: Record<string, number> = {
      observed: 10,
      partial_thread: 20,
      complete_visible_thread: 30,
    };
    const existingCollectionRank = collectionRank[String(existing.collectionStatus ?? 'observed')] ?? 0;
    const incomingCollectionRank = collectionRank[String(incoming.collectionStatus ?? 'observed')] ?? 0;
    if (incomingCollectionRank < existingCollectionRank) {
      update.collectionStatus = existing.collectionStatus;
      update.repliesCollapsed = existing.repliesCollapsed;
      update.threadCompleteness = existing.threadCompleteness;
    }
    if (!incoming.commentTime && existing.commentTime) update.commentTime = existing.commentTime;
    if (!incoming.observedAt && existing.observedAt) update.observedAt = existing.observedAt;
    if (!incoming.externalCommentId && existing.externalCommentId) update.externalCommentId = existing.externalCommentId;
    if (!incoming.videoId && existing.videoId) update.videoId = existing.videoId;
    if (!incoming.videoTitle && existing.videoTitle) update.videoTitle = existing.videoTitle;
    if (!incoming.replyAttemptId && existing.replyAttemptId) update.replyAttemptId = existing.replyAttemptId;
    if (!incoming.replyTraceId && existing.replyTraceId) update.replyTraceId = existing.replyTraceId;
    if (!incoming.generationSource && existing.generationSource) update.generationSource = existing.generationSource;
    return update;
  }

  private normalizeCommentIdentity(value: unknown) {
    return String(value ?? '')
      .replace(/\u0000/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private commentRowTime(item: any) {
    const value = item?.commentTime ?? item?.observedAt ?? item?.updatedAt ?? item?.createdAt;
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  private commentRootRows(rows: any[]) {
    const roots = new Map<string, any>();
    for (const row of rows || []) {
      const rootId = String(row?.rootRecordId || row?.recordId || '').trim();
      if (!rootId) continue;
      const current = roots.get(rootId);
      const isRoot = String(row?.recordId || '') === rootId || Number(row?.depth ?? 0) === 0;
      if (!current || isRoot) roots.set(rootId, row);
    }
    return roots;
  }

  private commentThreadGroupKey(row: any, rootRows: Map<string, any>) {
    const rootId = String(row?.rootRecordId || row?.recordId || '').trim();
    const root = rootRows.get(rootId) || row;
    const author = this.normalizeCommentIdentity(root?.userNickname);
    const content = this.normalizeCommentIdentity(root?.commentContent);
    if (!author && !content) return `root:${rootId}`;
    return [
      String(root?.tenantId || row?.tenantId || ''),
      String(root?.robotId || row?.robotId || ''),
      String(root?.platform || row?.platform || '').toUpperCase(),
      String(root?.videoId || row?.videoId || root?.videoTitle || row?.videoTitle || ''),
      author,
      content,
    ].join('|');
  }

  private commentMessageFingerprint(row: any) {
    return [
      String(row?.senderRole || 'user').toLowerCase(),
      String(Number(row?.depth ?? 0)),
      this.normalizeCommentIdentity(row?.userNickname),
      this.normalizeCommentIdentity(row?.commentContent || row?.typePlaceholder || row?.messageType),
    ].join('|');
  }

  private commentRowQuality(row: any) {
    let score = 0;
    const status = String(row?.replyStatus || '').toLowerCase();
    if (status === 'sent') score += 80;
    else if (status === 'sent_unconfirmed') score += 70;
    else if (status === 'generated') score += 40;
    else if (status === 'manual') score += 20;
    else if (status === 'failed') score += 10;
    if (String(row?.actorSource || '') === 'ucp_robot') score += 30;
    if (String(row?.attributionConfidence || '') === 'verified') score += 15;
    if (row?.commentTime) score += 10;
    if (String(row?.collectionStatus || '') === 'complete_visible_thread') score += 8;
    if (!row?.repliesCollapsed) score += 4;
    if (row?.replyContent) score += 3;
    return score;
  }

  private preferCommentRow(left: any, right: any) {
    const qualityDiff = this.commentRowQuality(right) - this.commentRowQuality(left);
    if (qualityDiff > 0) return right;
    if (qualityDiff < 0) return left;
    const leftTime = this.commentRowTime(left);
    const rightTime = this.commentRowTime(right);
    if (leftTime && rightTime && leftTime !== rightTime) return leftTime < rightTime ? left : right;
    return String(left?.recordId || '') <= String(right?.recordId || '') ? left : right;
  }

  private buildEffectiveCommentRows(items: any[]) {
    const sorted = [...(items || [])].sort((left: any, right: any) => {
      const timeDiff = this.commentRowTime(left) - this.commentRowTime(right);
      if (timeDiff) return timeDiff;
      const depthDiff = Number(left?.depth ?? 0) - Number(right?.depth ?? 0);
      if (depthDiff) return depthDiff;
      return String(left?.recordId || '').localeCompare(String(right?.recordId || ''));
    });
    const duplicateIds = new Set<string>();
    const owners = new Map<string, any>();
    const maxDuplicateGapMs = 30 * 60 * 1000;
    for (const row of sorted) {
      const segmentId = String(row?.rootRecordId || row?.recordId || '');
      const fingerprint = this.commentMessageFingerprint(row);
      const key = fingerprint;
      const previous = owners.get(key);
      if (!previous) {
        owners.set(key, row);
        continue;
      }
      const previousSegment = String(previous?.rootRecordId || previous?.recordId || '');
      if (previousSegment === segmentId) continue;
      const leftTime = this.commentRowTime(previous);
      const rightTime = this.commentRowTime(row);
      if (leftTime && rightTime && Math.abs(rightTime - leftTime) > maxDuplicateGapMs) {
        continue;
      }
      const preferred = this.preferCommentRow(previous, row);
      const discarded = preferred === previous ? row : previous;
      duplicateIds.add(String(discarded?.id || discarded?.recordId || ''));
      owners.set(key, preferred);
    }
    const effective = sorted.filter((item: any) => !duplicateIds.has(String(item?.id || item?.recordId || '')));
    return {
      items: effective,
      rawCount: sorted.length,
      duplicateCount: Math.max(0, sorted.length - effective.length),
    };
  }

  private buildEffectiveCommentRowsForGroups(rows: any[]) {
    const rootRows = this.commentRootRows(rows);
    const groups = new Map<string, any[]>();
    for (const row of rows || []) {
      const key = this.commentThreadGroupKey(row, rootRows);
      const bucket = groups.get(key) || [];
      bucket.push(row);
      groups.set(key, bucket);
    }
    return [...groups.values()].flatMap((items) => this.buildEffectiveCommentRows(items).items);
  }

  private groupCommentThreads(rows: any[]) {
    const rootRows = this.commentRootRows(rows);
    const grouped = new Map<string, any[]>();
    for (const row of rows || []) {
      const key = this.commentThreadGroupKey(row, rootRows);
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }
    return [...grouped.values()].map((items) => {
      const effectiveResult = this.buildEffectiveCommentRows(items);
      const ordered = effectiveResult.items;
      const rootRecordIds = Array.from(new Set(items.map((item: any) => String(item.rootRecordId || item.recordId || '')).filter(Boolean)));
      const root = ordered.find((item: any) => Number(item.depth ?? 0) === 0)
        ?? items.find((item: any) => Number(item.depth ?? 0) === 0)
        ?? ordered[0]
        ?? items[0];
      const representativeRootId = String(root?.rootRecordId || root?.recordId || rootRecordIds[0] || '');
      const userMessages = ordered.filter((item: any) => (item.senderRole ?? 'user') === 'user');
      const accountMessages = ordered.filter((item: any) => item.senderRole === 'account');
      const statuses = ordered.map((item: any) => String(item.replyStatus ?? 'pending'));
      const replyStatus = statuses.includes('failed')
        ? 'failed'
        : statuses.includes('sent')
          ? 'sent'
          : statuses.includes('sent_unconfirmed')
            ? 'sent_unconfirmed'
          : statuses.includes('manual') || accountMessages.length
            ? 'manual'
            : statuses.includes('generated')
              ? 'generated'
              : statuses.includes('not_required')
                ? 'not_required'
                : 'pending';
      const partial = items.some((item: any) => item.repliesCollapsed || String(item.collectionStatus ?? '').startsWith('partial'));
      const last = ordered[ordered.length - 1] ?? root;
      return {
        root_record_id: representativeRootId,
        root_record_ids: rootRecordIds,
        merged_segment_count: rootRecordIds.length,
        platform: root?.platform ?? '',
        robot_id: root?.robotId ?? '',
        bot_nickname: root?.botNickname ?? '',
        video_id: root?.videoId ?? '',
        video_title: root?.videoTitle ?? root?.postTitle ?? '',
        root_author: root?.userNickname ?? '',
        root_content: root?.commentContent ?? '',
        root_comment_time: this.formatDate(root?.commentTime),
        first_observed_at: this.formatDate(ordered[0]?.observedAt ?? ordered[0]?.commentTime ?? ordered[0]?.createdAt),
        last_activity_at: this.formatDate(last?.observedAt ?? last?.commentTime ?? last?.updatedAt),
        message_count: ordered.length,
        raw_message_count: items.length,
        duplicate_count: effectiveResult.duplicateCount,
        user_comment_count: userMessages.length,
        account_reply_count: accountMessages.length,
        follow_up_count: userMessages.filter((item: any) => Number(item.depth ?? 0) > 0).length,
        reply_status: replyStatus,
        should_reply_count: userMessages.filter((item: any) => item.shouldReply && !item.skipReply).length,
        failed_count: ordered.filter((item: any) => item.replyStatus === 'failed').length,
        collection_status: partial ? 'partial_thread' : 'complete_visible_thread',
        thread_completeness: partial ? 'partial_collapsed_replies' : 'visible_complete',
        replies_collapsed: partial,
        current_filter: last?.currentFilter ?? root?.currentFilter ?? '',
        commenter_count: new Set(userMessages.map((item: any) => String(item.userNickname ?? '').trim()).filter(Boolean)).size,
      };
    }).sort((left, right) => new Date(right.last_activity_at || 0).getTime() - new Date(left.last_activity_at || 0).getTime());
  }

  private async resolveCommentThreadGroup(rootRecordId: string, query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const db = this.prisma as any;
    const tenantId = resolveTenantId(user, query.tenantId);
    const target = await db.commentRecord.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        OR: [{ rootRecordId }, { recordId: rootRecordId }],
        ...(query.robotId ? { robotId: query.robotId } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
    });
    if (!target) throw new NotFoundException('评论线程不存在');
    const candidates = await db.commentRecord.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(target.robotId ? { robotId: target.robotId } : {}),
        platform: target.platform,
        ...(target.videoId ? { videoId: target.videoId } : { videoTitle: target.videoTitle }),
      },
      take: 10000,
    });
    const groups = this.groupCommentThreads(candidates);
    const thread = groups.find((item: any) => Array.isArray(item.root_record_ids) && item.root_record_ids.includes(rootRecordId))
      ?? groups.find((item: any) => item.root_record_id === rootRecordId)
      ?? null;
    if (!thread) throw new NotFoundException('评论线程不存在');
    const rootRecordIds = Array.isArray(thread.root_record_ids) ? thread.root_record_ids : [thread.root_record_id];
    const rawRows = candidates.filter((item: any) => rootRecordIds.includes(String(item.rootRecordId || item.recordId || '')));
    const effectiveRows = this.buildEffectiveCommentRows(rawRows).items;
    return { thread, rootRecordIds, rawRows, effectiveRows };
  }

  private buildCommentRecordWhere(query: CommentRecordQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    const observedRange = query.startAt || query.endAt
      ? {
          ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
          ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
        }
      : undefined;
    const keyword = String(query.keyword ?? '').trim();
    const platform = String(query.platform ?? '').trim();
    const platformValues = Array.from(new Set([platform, platform.toUpperCase(), platform.toLowerCase()].filter(Boolean)));
    return {
      ...(tenantId ? { tenantId } : {}),
      ...(query.robotId ? { robotId: query.robotId } : {}),
      ...(platformValues.length ? { platform: { in: platformValues } } : {}),
      ...(query.botNickname ? { botNickname: query.botNickname } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
      ...(query.videoId ? { videoId: query.videoId } : {}),
      ...(query.rootRecordId ? { rootRecordId: query.rootRecordId } : {}),
      ...(query.senderRole ? { senderRole: query.senderRole } : {}),
      ...(query.collectionStatus ? { collectionStatus: query.collectionStatus } : {}),
      ...(query.userNickname ? { userNickname: { contains: query.userNickname, mode: 'insensitive' } } : {}),
      ...(query.commentContent ? { commentContent: { contains: query.commentContent, mode: 'insensitive' } } : {}),
      ...(query.postTitle ? { OR: [
        { postTitle: { contains: query.postTitle, mode: 'insensitive' } },
        { videoTitle: { contains: query.postTitle, mode: 'insensitive' } },
      ] } : {}),
      ...(keyword ? { AND: [{ OR: [
        { userNickname: { contains: keyword, mode: 'insensitive' } },
        { commentContent: { contains: keyword, mode: 'insensitive' } },
        { videoTitle: { contains: keyword, mode: 'insensitive' } },
        { postTitle: { contains: keyword, mode: 'insensitive' } },
      ] }] } : {}),
      ...(query.replyStatus ? { replyStatus: query.replyStatus } : {}),
      ...(query.shouldReply !== undefined ? { shouldReply: query.shouldReply } : {}),
      ...(query.skipReply !== undefined ? { skipReply: query.skipReply } : {}),
      ...(observedRange ? { observedAt: observedRange } : {}),
    };
  }

  private commentMessageAudit(item: any) {
    const senderRole = String(item?.senderRole || 'user').trim().toLowerCase();
    const actorSource = String(item?.actorSource || '').trim().toLowerCase();
    const attribution = String(item?.attributionConfidence || '').trim().toLowerCase();
    const messageType = String(item?.messageType || 'text').trim().toLowerCase();
    const isAccount = senderRole === 'account';
    const verifiedRobot = isAccount
      && actorSource === 'ucp_robot'
      && attribution === 'verified'
      && Boolean(String(item?.replyAttemptId || '').trim());
    const hasTrace = Boolean(String(item?.replyTraceId || '').trim());
    const hasReplyOutcome = Boolean(String(item?.replyContent || '').trim())
      || Boolean(String(item?.replyAttemptId || '').trim() && (item?.skipReply || ['not_required', 'failed'].includes(String(item?.replyStatus || '').toLowerCase())));
    const isMediaMessage = !new Set(['text', 'unknown', '']).has(messageType);
    let evidenceLevel = senderRole === 'user' ? 'USER_MESSAGE' : 'UNATTRIBUTED_ACCOUNT';
    let feedbackMode = senderRole === 'user' ? 'NONE' : 'COPY_ONLY';
    let feedbackReason = senderRole === 'user'
      ? '用户评论不属于账号回复校准范围。'
      : '历史账号回复来源不明确，仅可复制，不能作为模型校准证据。';
    if ((verifiedRobot || hasReplyOutcome) && hasTrace) {
      evidenceLevel = 'PRECISE_TRACE';
      feedbackMode = 'PRECISE';
      feedbackReason = verifiedRobot
        ? '已验证机器人回复并关联完整生成追踪，可进行有效反馈、校准和生成详情查看。'
        : '该评论关联了完整的自动回复或判断追踪，可对本次结果进行反馈和校准。';
    } else if (verifiedRobot) {
      evidenceLevel = 'VERIFIED_ROBOT_HISTORY';
      feedbackMode = 'COPY_ONLY';
      feedbackReason = '已确认是历史机器人回复，但缺少生成快照，仅可复制。';
    }
    const sourceLabel = senderRole === 'user'
      ? '平台用户评论'
      : verifiedRobot
        ? 'UCP 已验证机器人回复'
        : actorSource === 'account_manual'
          ? '账号侧人工或既有回复'
          : actorSource === 'platform_self_echo'
            ? '平台账号侧回显'
            : '账号侧历史回复（来源未确认）';
    const mediaLabel = isMediaMessage
      ? `平台${messageType === 'image' ? '图片' : messageType}消息；当前记录仅保存消息类型占位，未保存媒体文件本体。`
      : '';
    return {
      evidence_level: evidenceLevel,
      feedback_mode: feedbackMode,
      feedback_reason: feedbackReason,
      source_label: sourceLabel,
      media_label: mediaLabel,
      is_media_message: isMediaMessage,
    };
  }

  private toCommentRecordDto(item: any) {
    return {
      record_id: item.recordId,
      external_comment_id: item.externalCommentId ?? '',
      platform: item.platform,
      robot_id: item.robotId,
      bot_nickname: item.botNickname,
      post_title: item.postTitle,
      video_id: item.videoId ?? '',
      video_title: item.videoTitle ?? item.postTitle ?? '',
      root_record_id: item.rootRecordId,
      parent_record_id: item.parentRecordId,
      depth: item.depth,
      sender_role: item.senderRole ?? 'user',
      actor_source: item.actorSource ?? 'platform_user',
      attribution_confidence: item.attributionConfidence ?? 'unknown',
      reply_attempt_id: item.replyAttemptId ?? '',
      reply_trace_id: item.replyTraceId ?? '',
      generation_source: item.generationSource ?? '',
      user_nickname: item.userNickname,
      comment_content: item.commentContent,
      message_type: item.messageType ?? 'text',
      type_placeholder: item.typePlaceholder ?? '',
      comment_time: this.formatDate(item.commentTime),
      source_time_raw: item.sourceTimeRaw ?? '',
      observed_at: this.formatDate(item.observedAt),
      time_accuracy: item.timeAccuracy ?? 'unknown',
      collection_status: item.collectionStatus ?? 'observed',
      current_filter: item.currentFilter ?? '',
      replies_collapsed: item.repliesCollapsed ?? false,
      thread_completeness: item.threadCompleteness ?? '',
      source_client_id: item.sourceClientId ?? '',
      should_reply: item.shouldReply,
      skip_reply: item.skipReply,
      skip_reason: item.skipReason,
      comment_type: item.commentType,
      intent_level: item.intentLevel,
      intent_label: item.intentLabel,
      judge_reason: item.judgeReason,
      reply_status: item.replyStatus,
      reply_content: item.replyContent,
      reply_time: this.formatDate(item.replyTime),
      fail_reason: item.failReason,
      ...this.commentMessageAudit(item),
      created_at: this.formatDate(item.createdAt),
      updated_at: this.formatDate(item.updatedAt),
    };
  }

  private normalizeDmTurnForDb(turn: any, conversation: any, defaultSortIndex: number) {
    const userMessage = turn.userMessage ?? {};
    const analysis = turn.analysis ?? {};
    const reply = turn.reply ?? {};
    const replies = this.normalizeStringArray(reply.replies);
    return {
      turnId: turn.turnId || `turn_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      conversationId: conversation.conversationId,
      sortIndex: turn.sortIndex ?? defaultSortIndex,
      platform: conversation.platform,
      botNickname: conversation.botNickname,
      userNickname: conversation.userNickname,
      messageContent: String(userMessage.content ?? userMessage.message_content ?? ''),
      messageTime: this.parseOptionalDate(userMessage.send_time ?? userMessage.sendTime ?? userMessage.message_time),
      shouldReply: Boolean(analysis.should_reply ?? analysis.shouldReply ?? false),
      skipReply: Boolean(analysis.skip_reply ?? analysis.skipReply ?? false),
      skipReason: String(analysis.skip_reason ?? analysis.skipReason ?? ''),
      messageType: String(analysis.message_type ?? analysis.messageType ?? 'unknown'),
      intentLevel: String(analysis.intent_level ?? analysis.intentLevel ?? 'none'),
      intentLabel: String(analysis.intent_label ?? analysis.intentLabel ?? '完全无意向'),
      judgeReason: String(analysis.judge_reason ?? analysis.judgeReason ?? ''),
      replyStatus: String(reply.reply_status ?? reply.replyStatus ?? 'pending'),
      replies,
      replyCount: Number(reply.reply_count ?? reply.replyCount ?? replies.length),
      replyTime: this.parseOptionalDate(reply.reply_time ?? reply.replyTime),
      failReason: String(reply.fail_reason ?? reply.failReason ?? ''),
      rawData: this.stripUndefined(turn),
    };
  }

  private buildDmConversationWhere(query: DmConversationQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    return {
      ...(tenantId ? { tenantId } : {}),
      ...(query.robotId ? { robotId: query.robotId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.botNickname ? { botNickname: query.botNickname } : {}),
      ...(query.userNickname ? { userNickname: { contains: query.userNickname, mode: 'insensitive' } } : {}),
    };
  }

  private toDmConversationDto(item: any) {
    return {
      conversation_id: item.conversationId,
      user_nickname: item.userNickname,
      manual_takeover: item.manualTakeover,
      turns: (item.turns ?? []).map((turn: any) => ({
        turn_id: turn.turnId,
        sort_index: turn.sortIndex,
        user_message: {
          content: turn.messageContent,
          send_time: this.formatDate(turn.messageTime),
        },
        analysis: {
          should_reply: turn.shouldReply,
          skip_reply: turn.skipReply,
          skip_reason: turn.skipReason,
          message_type: turn.messageType,
          intent_level: turn.intentLevel,
          intent_label: turn.intentLabel,
          judge_reason: turn.judgeReason,
        },
        reply: {
          reply_status: turn.replyStatus,
          replies: this.normalizeStringArray(turn.replies),
          reply_count: turn.replyCount,
          reply_time: this.formatDate(turn.replyTime),
          fail_reason: turn.failReason,
        },
      })),
    };
  }

  private parseOptionalDate(value: unknown) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`时间格式不合法：${raw}`);
    }
    return date;
  }

  private formatDate(value: unknown) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';
    const pad = (input: number) => `${input}`.padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      const parsed = this.safeJsonParse(value);
      if (Array.isArray(parsed)) {
        return this.normalizeStringArray(parsed);
      }
      return value.trim() ? [value.trim()] : [];
    }
    return [];
  }

  private safeJsonParse(value: unknown): any {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private safeReflectGet(target: unknown, key: string) {
    if (!target || typeof target !== 'object') return undefined;
    if (!key.includes('.')) {
      return Reflect.get(target, key);
    }
    let current: unknown = target;
    for (const part of key.split('.').filter(Boolean)) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = Reflect.get(current, part);
    }
    return current;
  }

  private asPlainObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
  }

  private stripUndefined<T extends Record<string, any>>(value: T) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
  }

  private omit<T extends Record<string, any>>(value: T, keys: string[]) {
    const blocked = new Set(keys);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)));
  }
}
function hasHttpExceptionDataErrorCode(error: unknown, expectedCode: string): boolean {
  if (!(error instanceof HttpException)) return false;
  const payload = error.getResponse();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return String((data as Record<string, unknown>).errorCode || '') === expectedCode;
}

