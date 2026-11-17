import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceModelGateway } from '../../infrastructure/model-gateway/customer-service-model-gateway.service';
import { CustomerServiceCalibrationProfileRepository } from '../../infrastructure/persistence/customer-service-calibration-profile.repository';
import { CustomerServiceCalibrationRecordRepository } from '../../infrastructure/persistence/customer-service-calibration-record.repository';
import { boundJsonPayload } from '../../shared/utils/bounded-json-payload.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import {
  buildCalibrationScope,
  CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES,
  CustomerServiceCalibrationScopeType,
  CustomerServiceTuningDirectives,
  mergeTuningDirectives,
  mergeImmediateCalibrationMemoryDirectives,
  normalizeTuningDirectives,
  sanitizeAliFlagshipDirectives,
  sanitizeSingleCaseCalibrationDirectives,
  isImmediateCalibrationScopeType,
} from '../../shared/calibration/customer-service-calibration-profile.util';
import { ApplyCustomerServiceCalibrationRecordDto } from './dto/apply-calibration-record.dto';
import { CustomerServiceCalibrationRecordQueryDto } from './dto/calibration-record-query.dto';
import { CreateCustomerServiceCalibrationRecordDto } from './dto/create-calibration-record.dto';
import { UpdateCustomerServiceCalibrationStatusDto } from './dto/update-calibration-status.dto';
import { CustomerServiceAssetsService } from '../assets/customer-service-assets.service';
import { buildCalibrationStrategyDraft } from './customer-service-calibration-strategy-draft';
import { RecordCustomerServiceStrategyDraftRegressionDto } from './dto/record-strategy-draft-regression.dto';
import { CreateCustomerServiceCalibrationFromReplyDto } from './dto/create-calibration-from-reply.dto';
import { CustomerServiceReplyTracesService } from '../reply-traces/customer-service-reply-traces.service';
import { CustomerServiceKnowledgeEntryRepository } from '../../infrastructure/persistence/customer-service-knowledge-entry.repository';
import { CustomerServiceKnowledgeRevisionDraftRepository } from '../../infrastructure/persistence/customer-service-knowledge-revision-draft.repository';
import {
  CreateCustomerServiceKnowledgeRevisionDraftDto,
  PublishCustomerServiceKnowledgeRevisionDraftDto,
  VerifyCustomerServiceKnowledgeRevisionDraftDto,
} from './dto/knowledge-revision-draft.dto';
import {
  CalibrationAnalysisParseError,
  parseCalibrationAnalysisJson,
} from './customer-service-calibration-analysis-parser';
import { CustomerServiceCurrentTestReplyService } from './customer-service-current-test-reply.service';
import { RefineCustomerServiceCalibrationAnalysisDto } from './dto/refine-calibration-analysis.dto';

const TARGET_SCOPES = [
  'ROLE_PROTOTYPE',
  'MERCHANT_ROLE',
  'ROLE_MODULE',
  'INDUSTRY_CAPABILITY',
  'RESPONSE_RULE',
  'QUALITY_RULE',
  'GENERATION_PROMPT',
  'UNDERSTANDING_RULE',
] as const;

type RoleModuleSnapshotSource = {
  id: string;
  key: string;
  name: string;
  content: unknown;
  conditions: unknown;
  priority: number;
  sort: number;
  revision: number;
  definition: { code: string };
};

type CalibrationPromptSource = {
  improvementMode: string;
  problemTypes: string[];
  problemDescription: string | null;
  userSuggestion: string | null;
  customerMessage: string;
  originalReply: string;
  scenario: string | null;
  intent: string | null;
  riskLevel: string | null;
  configurationHash: string | null;
  runtimeContract: unknown;
  sourceSnapshot: unknown;
  qualityReport: unknown;
};

type CalibrationAiOutput = {
  diagnosis: { summary: string; rootCause: string; evidence: string[] };
  targetScopes: string[];
  recommendations: Array<{
    scope: string;
    title: string;
    change: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  tuningDirectives: CustomerServiceTuningDirectives;
  suggestedReply: string;
  rationale: string;
  confidence: number;
};

type CalibrationRefinementContext = {
  instruction: string | null;
  previousInstruction: string | null;
  previousDiagnosis: unknown;
  previousRecommendations: unknown;
  previousDirectives: unknown;
  previousSuggestedReply: string;
  previousAnalyzedAt: Date | null;
  previousAiModel: string | null;
};

@Injectable()
export class CustomerServiceCalibrationsService {
  constructor(
    private readonly repository: CustomerServiceCalibrationRecordRepository,
    private readonly profileRepository: CustomerServiceCalibrationProfileRepository,
    private readonly modelGateway: CustomerServiceModelGateway,
    private readonly assetsService: CustomerServiceAssetsService,
    private readonly replyTraces: CustomerServiceReplyTracesService,
    private readonly knowledgeEntries: CustomerServiceKnowledgeEntryRepository,
    private readonly knowledgeRevisionDrafts: CustomerServiceKnowledgeRevisionDraftRepository,
    private readonly currentTestReply: CustomerServiceCurrentTestReplyService,
  ) {}

  async list(query: CustomerServiceCalibrationRecordQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceCalibrationRecordWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.problemType ? { problemTypes: { has: query.problemType } } : {}),
      ...(query.merchantRoleId ? { merchantRoleId: query.merchantRoleId } : {}),
      ...(query.accountProfileId ? { accountProfileId: query.accountProfileId } : {}),
      ...(query.scenario ? { scenario: query.scenario } : {}),
      ...(query.keyword
        ? {
            OR: [
              { customerMessage: { contains: query.keyword, mode: 'insensitive' } },
              { originalReply: { contains: query.keyword, mode: 'insensitive' } },
              { problemDescription: { contains: query.keyword, mode: 'insensitive' } },
              { userSuggestion: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('校准记录不存在');
    const source = item.sourceAnalysis;
    return {
      ...item,
      understanding: item.understanding ?? source?.understanding ?? null,
      runtimeContract: item.runtimeContract ?? source?.runtimeContract ?? null,
      qualityReport: item.qualityReport ?? source?.quality ?? null,
      sourceSnapshot: item.sourceSnapshot ?? (source ? {
        sourceAnalysisId: source.id,
        summary: source.summary,
        generation: source.generation,
        warnings: source.warnings,
      } : null),
    };
  }

  async create(
    dto: CreateCustomerServiceCalibrationRecordDto,
    user: CurrentUserPayload,
    sourceMeta?: {
      sourceType?: string | null; sourceRefId?: string | null; replyTraceId?: string | null;
      accountProfileId?: string | null; robotId?: string | null; channel?: string | null; platform?: string | null;
      conversationId?: string | null; messageId?: string | null; replyAttemptId?: string | null;
    },
  ) {
    const scopedTenantId = resolveTenantId(user);
    const role = await this.repository.findMerchantRole(dto.merchantRoleId, scopedTenantId);
    if (!role) throw new NotFoundException('客服角色不存在或不属于当前租户');

    if (dto.industryNodeId) {
      const industry = await this.repository.findIndustryNode(dto.industryNodeId, role.tenantId);
      if (!industry) throw new BadRequestException('行业节点不存在或不属于客服角色租户');
    }
    if (dto.evaluationCaseId) {
      const evaluationCase = await this.repository.findEvaluationCase(dto.evaluationCaseId, role.tenantId);
      if (!evaluationCase) throw new BadRequestException('测试案例不存在或不属于客服角色租户');
    }
    const sourceAnalysis = dto.sourceAnalysisId
      ? await this.repository.findSourceAnalysis(dto.sourceAnalysisId, role.tenantId)
      : null;
    if (dto.sourceAnalysisId && !sourceAnalysis) {
      throw new BadRequestException('来源调优分析不存在或不属于当前租户');
    }
    if (sourceAnalysis?.session?.merchantRoleId && sourceAnalysis.session.merchantRoleId !== role.id) {
      throw new BadRequestException('来源调优分析与当前客服角色不一致，请刷新后重试');
    }
    const sourceAnalysisSessionSnapshot = asObject(sourceAnalysis?.session?.contextSnapshot);
    const sourceAnalysisRobotId = sourceAnalysis?.session?.purpose === 'ROBOT_TEST_DM'
      ? stringOrNull(sourceAnalysisSessionSnapshot.robotId)
      : null;
    const effectiveSourceMeta = {
      ...sourceMeta,
      accountProfileId: sourceMeta?.accountProfileId || sourceAnalysis?.session?.accountProfileId || null,
      robotId: sourceMeta?.robotId || sourceAnalysisRobotId || null,
    };
    if (dto.improvementMode === 'GUIDED' && !dto.userSuggestion?.trim()) {
      throw new BadRequestException('选择“按我的建议改善”时必须填写改进建议');
    }

    const effectiveRuntimeContract = sourceAnalysis?.runtimeContract ?? dto.runtimeContract;
    const effectiveUnderstanding = sourceAnalysis?.understanding ?? dto.understanding;
    const effectiveQuality = sourceAnalysis?.quality ?? dto.qualityReport;
    const understandingSnapshot = asObject(effectiveUnderstanding);
    const humanContext = asObject(understandingSnapshot.humanContext);
    const dialogueObligation = asObject(humanContext.dialogueObligation);
    const dominantTurnGoal = asObject(humanContext.dominantTurnGoal);
    const runtimeContract = asObject(effectiveRuntimeContract);
    const runtimePersona = asObject(runtimeContract.persona);
    const runtimeReplyPlan = asObject(runtimeContract.replyPlan);
    const runtimePolicy = asObject(runtimeContract.policy);
    const runtimeModules = Array.isArray(runtimePersona.modules) ? runtimePersona.modules : [];
    const matchedRules = Array.isArray(runtimeReplyPlan.matchedRules) ? runtimeReplyPlan.matchedRules : [];
    const selectedAssets = Array.isArray(runtimePolicy.assets) ? runtimePolicy.assets : [];
    const roleModules = role.modules as RoleModuleSnapshotSource[];
    const sourceSnapshot = {
      authoritativeRole: {
        id: role.id,
        code: role.code,
        name: role.name,
        publicIdentity: role.publicIdentity,
        revision: role.revision,
        prototype: {
          id: role.prototype.id,
          code: role.prototype.code,
          name: role.prototype.name,
          identity: role.prototype.identity,
          personality: role.prototype.personality,
          languageStyle: role.prototype.languageStyle,
          servicePosture: role.prototype.servicePosture,
          revision: role.prototype.revision,
        },
        modules: roleModules.map((item) => ({
          id: item.id,
          key: item.key,
          name: item.name,
          type: item.definition.code,
          priority: item.priority,
          sort: item.sort,
          revision: item.revision,
        })),
      },
      sourceAnalysisId: sourceAnalysis?.id || null,
      tuningRun: compactSourceSnapshot(dto.sourceSnapshot, sourceAnalysis),
    };

    const maxJsonBytes = Math.max(16_384, Number(process.env.CUSTOMER_SERVICE_JSON_MAX_BYTES || 524_288));
    const boundedUnderstanding = boundJsonPayload(effectiveUnderstanding ?? null, maxJsonBytes);
    const boundedContract = boundJsonPayload(effectiveRuntimeContract ?? null, maxJsonBytes);
    const boundedQuality = boundJsonPayload(effectiveQuality ?? null, maxJsonBytes);
    const boundedSource = boundJsonPayload(sourceSnapshot, maxJsonBytes);
    const contentHash = stableJsonHash({
      sourceAnalysisId: sourceAnalysis?.id || null,
      replyTraceId: effectiveSourceMeta.replyTraceId || null,
      sourceType: effectiveSourceMeta.sourceType || null,
      sourceRefId: effectiveSourceMeta.sourceRefId || null,
      customerMessage: dto.customerMessage.trim(),
      originalReply: dto.originalReply.trim(),
      problemTypes: [...dto.problemTypes].sort(),
      problemDescription: dto.problemDescription?.trim() || null,
      userSuggestion: dto.userSuggestion?.trim() || null,
      configurationHash: dto.configurationHash || sourceAnalysis?.configurationHash || null,
    });
    const duplicate = await this.repository.findByContentHash(role.tenantId, contentHash);
    if (duplicate) return duplicate;

    return this.repository.create({
      tenantId: role.tenantId,
      merchantRoleId: role.id,
      industryNodeId: dto.industryNodeId || sourceAnalysis?.session?.industryNodeId || role.industryNodeId || null,
      evaluationCaseId: dto.evaluationCaseId || null,
      sourceAnalysisId: sourceAnalysis?.id || null,
      sourceType: effectiveSourceMeta.sourceType || null,
      sourceRefId: effectiveSourceMeta.sourceRefId || null,
      replyTraceId: effectiveSourceMeta.replyTraceId || null,
      accountProfileId: effectiveSourceMeta.accountProfileId || null,
      robotId: effectiveSourceMeta.robotId || null,
      channel: effectiveSourceMeta.channel || null,
      platform: effectiveSourceMeta.platform || null,
      conversationId: effectiveSourceMeta.conversationId || null,
      messageId: effectiveSourceMeta.messageId || null,
      replyAttemptId: effectiveSourceMeta.replyAttemptId || null,
      status: 'OPEN',
      improvementMode: dto.improvementMode,
      problemTypes: dto.problemTypes,
      problemDescription: dto.problemDescription?.trim() || null,
      userSuggestion: dto.userSuggestion?.trim() || null,
      customerMessage: dto.customerMessage.trim(),
      originalReply: dto.originalReply.trim(),
      scenario: dto.scenario || null,
      intent: dto.intent || null,
      riskLevel: dto.riskLevel || null,
      generationModel: dto.generationModel || null,
      configurationHash: dto.configurationHash || sourceAnalysis?.configurationHash || null,
      userFeedback: stringOrNull(dialogueObligation.userFeedback),
      requestedDeltas: arrayStrings(dialogueObligation.requestedDeltas),
      correctionTarget: stringOrNull(dialogueObligation.correctionTarget),
      rejectedMoves: uniqueStrings([
        ...arrayStrings(dialogueObligation.forbiddenRepeatedMoves),
        ...arrayStrings(dialogueObligation.rejectedMove ? [dialogueObligation.rejectedMove] : []),
      ]),
      dominantTurnGoal: stringOrNull(dominantTurnGoal.key),
      currentResponseObligation: stringOrNull(dialogueObligation.currentResponseObligation),
      relatedRoleModuleIds: uniqueStrings(runtimeModules.map((item) => asObject(item).id).concat(roleModules.map((item) => item.id))),
      relatedResponseRuleIds: uniqueStrings(matchedRules.map((item) => asObject(item).id)),
      relatedAssetIds: uniqueStrings(selectedAssets.map((item) => asObject(item).assetId)),
      // When a source analysis exists, keep one authoritative payload and reference it instead of copying large JSON.
      understanding: sourceAnalysis ? Prisma.JsonNull : toJson(boundedUnderstanding.value),
      runtimeContract: sourceAnalysis ? Prisma.JsonNull : toJson(boundedContract.value),
      qualityReport: sourceAnalysis ? Prisma.JsonNull : toJson(boundedQuality.value),
      sourceSnapshot: toJson(boundedSource.value),
      contentHash,
      payloadBytes: sourceAnalysis
        ? boundedSource.storedBytes
        : boundedUnderstanding.storedBytes + boundedContract.storedBytes + boundedQuality.storedBytes + boundedSource.storedBytes,
      createdById: user.id,
    });
  }

  async createFromReply(dto: CreateCustomerServiceCalibrationFromReplyDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const trace = await this.replyTraces.getScopedInternal(dto.replyTraceId, tenantId) as any;
    if (!trace.merchantRoleId) {
      throw new BadRequestException('该回复缺少客服角色生成证据，只能保存满意度反馈；请先为机器人绑定账号资料后再校准。');
    }
    if (String(trace.generationSource || '').toLowerCase() === 'imported_dataset') {
      throw new BadRequestException('该回复来自导入数据集，请修改数据集内容，不能作为模型回复进行校准。');
    }
    if (dto.sourceRefId && trace.sourceRefId && dto.sourceRefId !== trace.sourceRefId) {
      throw new BadRequestException('回复来源与 Reply Trace 不一致，请刷新后重试。');
    }
    const segments = Array.isArray(trace.replySegments) ? trace.replySegments : [];
    const requestedSegmentIndexes = Array.isArray(dto.selectedSegmentIndexes) ? dto.selectedSegmentIndexes : [];
    const selected = requestedSegmentIndexes.length
      ? segments.filter((item: any) => requestedSegmentIndexes.includes(Number(item?.index)))
      : segments;
    if (requestedSegmentIndexes.length && selected.length !== requestedSegmentIndexes.length) {
      throw new BadRequestException('选择的回复分段不存在或已被更新，请刷新后重试。');
    }
    if (!segments.length && !dto.problemTypes.every((item) => [
      'WORKFLOW_ERROR',
      'QUALITY_GATE_MISJUDGMENT',
      'UNDERSTANDING_MISCLASSIFICATION',
      'OTHER',
    ].includes(item))) {
      throw new BadRequestException('SKIP/HANDOFF 结果只能按判断错误、流程错误或其他问题进行校准。');
    }
    const selectedReply = selected
      .map((item: any) => String(item?.content || '').trim())
      .filter(Boolean)
      .join('\n');
    const originalReply = selectedReply || String(trace.finalReply || '').trim() || `【未生成回复：${trace.generationSource}】`;
    const runtimeContract = asObject(trace.runtimeContract);
    const classification = asObject(runtimeContract.classification);
    const understanding = asObject(trace.understandingSummary);
    const sourceSnapshot = {
      replyTraceId: trace.id,
      sourceType: trace.sourceType,
      sourceRefId: trace.sourceRefId,
      selectedSegmentIndexes: dto.selectedSegmentIndexes || [],
      generationDetails: trace.generationDetails || null,
      conversationSnapshot: trace.conversationSnapshot || null,
      postContext: trace.postContext || null,
      weakEvidence: !trace.runtimeContract,
    };
    return this.create({
      merchantRoleId: trace.merchantRoleId,
      industryNodeId: trace.industryNodeId || undefined,
      problemTypes: dto.problemTypes,
      improvementMode: dto.improvementMode,
      problemDescription: dto.problemDescription,
      userSuggestion: dto.userSuggestion,
      customerMessage: String(trace.customerMessage || '').trim(),
      originalReply,
      scenario: stringOrNull(classification.scenario) || stringOrNull(asObject(understanding.summary).primaryScenario) || undefined,
      intent: stringOrNull(classification.intent) || stringOrNull(asObject(understanding.summary).primaryIntent) || undefined,
      riskLevel: stringOrNull(classification.riskLevel) || undefined,
      generationModel: trace.model || undefined,
      configurationHash: trace.configurationHash || undefined,
      understanding: trace.understandingSummary || undefined,
      runtimeContract: trace.runtimeContract || undefined,
      qualityReport: trace.qualityReport || undefined,
      sourceSnapshot,
    }, user, {
      sourceType: trace.sourceType,
      sourceRefId: trace.sourceRefId,
      replyTraceId: trace.id,
      accountProfileId: trace.accountProfileId,
      robotId: trace.robotId,
      channel: trace.channel,
      platform: trace.platform,
      conversationId: trace.conversationId || trace.commentThreadId,
      messageId: trace.customerMessageId,
      replyAttemptId: trace.replyAttemptId,
    });
  }

  async analyze(
    id: string,
    user: CurrentUserPayload,
    refinement?: { instruction: string | null },
  ) {
    const item = await this.get(id, user);
    if (item.status === 'ARCHIVED') throw new BadRequestException('已归档记录不能继续执行 AI 校准分析');
    if (refinement && item.status === 'APPLIED_TUNING') {
      throw new BadRequestException('该校准已经应用。需要继续调整时，请针对新的测试回复创建新的校准，避免改写已经生效的校准证据。');
    }
    if (refinement && (!item.aiDiagnosis || !item.suggestedReply)) {
      throw new BadRequestException('当前记录还没有一版完整校准结果，请先完成首次 AI 校准分析');
    }
    if (!refinement && item.status === 'AI_ANALYZED' && item.aiDiagnosis && item.suggestedReply) return item;

    const previousDiagnostics = asObject(item.aiAnalysisDiagnostics);
    const priorHistory = Number(previousDiagnostics.refinementHistorySchemaVersion || 0) >= 2
      ? normalizeCalibrationRefinementHistory(previousDiagnostics.refinementHistory)
      : migrateLegacyCalibrationRefinementHistory(previousDiagnostics.refinementHistory, item);
    const refinementContext: CalibrationRefinementContext | null = refinement
      ? {
          instruction: refinement.instruction,
          previousInstruction: resolveCurrentCalibrationVersionInstruction(item, previousDiagnostics, priorHistory),
          previousDiagnosis: item.aiDiagnosis,
          previousRecommendations: item.aiRecommendations,
          previousDirectives: item.tuningDirectives,
          previousSuggestedReply: item.suggestedReply || '',
          previousAnalyzedAt: item.analyzedAt || null,
          previousAiModel: item.aiModel || null,
        }
      : null;
    const refinementHistory = refinementContext
      ? appendCalibrationRefinementHistory(priorHistory, refinementContext)
      : priorHistory;

    const lockResult = await this.repository.tryStartAnalysis(
      item.id,
      item.tenantId,
      item.revision,
      user.id,
      new Date(Date.now() - 120_000),
    );
    if (lockResult.count !== 1) {
      throw new ConflictException('这条校准记录正在分析，或已被其他操作更新，请稍后刷新');
    }
    const lockedItem = await this.get(id, user);

    const prompt = this.buildAnalysisPrompt(lockedItem, refinementContext);
    const modelResult = await this.modelGateway.generate({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: refinementContext ? 0.18 : 0.1,
      maxTokens: 2200,
      timeoutMs: 20_000,
      jsonMode: true,
      thinkingMode: 'DISABLED',
    });
    const diagnostics: Record<string, unknown> = {
      analysisMode: refinementContext ? 'REFINEMENT' : 'INITIAL',
      refinementInstruction: refinementContext?.instruction || null,
      refinementHistorySchemaVersion: 2,
      refinementHistory,
      firstAttempt: summarizeModelAttempt(modelResult),
      repairAttempt: null,
      parseStage: null,
      finalStatus: null,
    };
    if (!modelResult.ok || modelResult.truncated) {
      diagnostics.finalStatus = 'MODEL_FAILED';
      await this.repository.updateAnalysis(lockedItem.id, lockedItem.tenantId, lockedItem.revision, {
        aiAnalysisStatus: 'MODEL_FAILED',
        aiAnalysisDiagnostics: toJson(diagnostics),
        aiModel: modelResult.model || null,
        aiRequestId: modelResult.requestId || null,
        updatedById: user.id,
        revision: { increment: 1 },
      } as any);
      throw new BadRequestException(
        modelResult.truncated
          ? 'AI 校准分析输出被截断，已记录诊断，请重试'
          : modelResult.errorMessage || 'AI 校准分析失败，已记录诊断，请重试',
      );
    }

    let parsed: Record<string, unknown>;
    try {
      const parsedResult = parseCalibrationAnalysisJson(modelResult.content);
      parsed = parsedResult.value;
      diagnostics.parseStage = parsedResult.stage;
    } catch (firstError) {
      const repairResult = await this.modelGateway.generate({
        messages: [
          {
            role: 'system',
            content: [
              '你是 JSON 格式修复器，只修复输入中的 JSON 语法和结构，不改变业务结论。',
              '只输出一个 JSON 对象，不要 Markdown，不要解释，不要省略字段。',
              '必须包含 diagnosis、targetScopes、recommendations、tuningDirectives、suggestedReply、rationale、confidence。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: `请修复下面这份校准分析为有效 JSON：\n${truncate(modelResult.content, 14_000)}`,
          },
        ],
        temperature: 0,
        maxTokens: 2200,
        timeoutMs: 15_000,
        jsonMode: true,
        thinkingMode: 'DISABLED',
      });
      diagnostics.repairAttempt = summarizeModelAttempt(repairResult);
      if (!repairResult.ok || repairResult.truncated) {
        await this.persistAnalysisParseFailure(lockedItem, user.id, diagnostics, firstError);
        throw new BadRequestException('AI 校准分析格式修复失败，已保存诊断，可直接重试');
      }
      try {
        const repaired = parseCalibrationAnalysisJson(repairResult.content);
        parsed = repaired.value;
        diagnostics.parseStage = `REPAIR_${repaired.stage}`;
      } catch (repairError) {
        await this.persistAnalysisParseFailure(lockedItem, user.id, diagnostics, repairError);
        throw new BadRequestException('AI 返回的校准分析格式仍无效，已保存诊断，可直接重试');
      }
    }

    const effectiveIterationSuggestion = refinementContext?.instruction || lockedItem.userSuggestion;
    let output = normalizeAnalysisOutput(parsed, lockedItem.originalReply, lockedItem.problemTypes, effectiveIterationSuggestion);

    if (
      refinementContext
      && !isMeaningfullyDifferentCalibrationOutput(refinementContext, output)
    ) {
      const retryResult = await this.modelGateway.generate({
        messages: [
          { role: 'system', content: prompt.system },
          {
            role: 'user',
            content: [
              prompt.user,
              '',
              '【继续校准强制复审】',
              '管理员点击“继续校准”代表上一版结果已被明确判定为不满意。你刚才给出的新版建议回复与上一版没有形成实质变化，因此这次迭代无效。',
              `上一版建议回复：${truncate(refinementContext.previousSuggestedReply, 8000)}`,
              `本次无效候选：${truncate(output.suggestedReply, 8000)}`,
              '请重新完成一次真正的增量校准：保留上一版仍正确的判断，但必须针对诊断中尚未解决的问题至少做一项实质修正。',
              'suggestedReply 不得与上一版相同、仅改标点或仅做同义词替换；应体现更合适的信息量、结构、表达节奏、边界或回应动作。',
              'tuningDirectives 也必须反映本轮最终原则，不能同时保留已被本轮修正否定的旧要求。',
              '只输出完整 JSON 对象。',
            ].join('\n'),
          },
        ],
        temperature: 0.32,
        maxTokens: 2200,
        timeoutMs: 20_000,
        jsonMode: true,
        thinkingMode: 'DISABLED',
      });
      diagnostics.refinementNoChangeRetry = summarizeModelAttempt(retryResult);
      if (!retryResult.ok || retryResult.truncated) {
        diagnostics.finalStatus = 'REFINEMENT_NO_CHANGE_RETRY_FAILED';
        await this.repository.updateAnalysis(lockedItem.id, lockedItem.tenantId, lockedItem.revision, {
          aiAnalysisStatus: 'SUCCESS',
          aiAnalysisDiagnostics: toJson(diagnostics),
          updatedById: user.id,
          revision: { increment: 1 },
        } as any);
        throw new BadRequestException('继续校准没有形成有效新版本，自动复审也未完成；上一版结果已保留，请补充具体调整意见后重试');
      }
      try {
        const retryParsed = parseCalibrationAnalysisJson(retryResult.content);
        diagnostics.refinementNoChangeRetryParseStage = retryParsed.stage;
        output = normalizeAnalysisOutput(
          retryParsed.value,
          lockedItem.originalReply,
          lockedItem.problemTypes,
          effectiveIterationSuggestion,
        );
      } catch (retryError) {
        diagnostics.finalStatus = 'REFINEMENT_NO_CHANGE_RETRY_PARSE_FAILED';
        diagnostics.refinementNoChangeRetryParseError = retryError instanceof Error ? retryError.message : String(retryError);
        await this.repository.updateAnalysis(lockedItem.id, lockedItem.tenantId, lockedItem.revision, {
          aiAnalysisStatus: 'SUCCESS',
          aiAnalysisDiagnostics: toJson(diagnostics),
          updatedById: user.id,
          revision: { increment: 1 },
        } as any);
        throw new BadRequestException('继续校准自动复审返回格式无效；上一版结果已保留，请补充具体调整意见后重试');
      }
      if (!isMeaningfullyDifferentCalibrationOutput(refinementContext, output)) {
        diagnostics.finalStatus = 'REFINEMENT_NO_MEANINGFUL_CHANGE_PRESERVED';
        diagnostics.refinementHistory = priorHistory;
        diagnostics.refinementNoChangePreserved = true;
        await this.repository.updateAnalysis(lockedItem.id, lockedItem.tenantId, lockedItem.revision, {
          aiAnalysisStatus: 'SUCCESS',
          aiAnalysisDiagnostics: toJson(diagnostics),
          updatedById: user.id,
          revision: { increment: 1 },
        } as any);
        return this.get(id, user);
      }
    }

    const maxJsonBytes = Math.max(16_384, Number(process.env.CUSTOMER_SERVICE_JSON_MAX_BYTES || 524_288));
    const boundedDiagnosis = boundJsonPayload({
      ...output.diagnosis,
      rationale: output.rationale,
      confidence: output.confidence,
      targetScopes: output.targetScopes,
    }, maxJsonBytes);
    const boundedRecommendations = boundJsonPayload(output.recommendations, maxJsonBytes);
    const boundedDirectives = boundJsonPayload(output.tuningDirectives, maxJsonBytes);
    diagnostics.finalStatus = 'SUCCESS';
    const updateResult = await this.repository.updateAnalysis(lockedItem.id, lockedItem.tenantId, lockedItem.revision, {
      status: 'AI_ANALYZED',
      aiAnalysisStatus: 'SUCCESS',
      aiAnalysisDiagnostics: toJson(diagnostics),
      aiDiagnosis: toJson(boundedDiagnosis.value),
      aiRecommendations: toJson(boundedRecommendations.value),
      tuningDirectives: toJson(boundedDirectives.value),
      payloadBytes: { increment: boundedDiagnosis.storedBytes + boundedRecommendations.storedBytes + boundedDirectives.storedBytes },
      suggestedReply: output.suggestedReply,
      aiModel: modelResult.model || null,
      aiRequestId: modelResult.requestId || null,
      analyzedAt: new Date(),
      analyzedById: user.id,
      updatedById: user.id,
      revision: { increment: 1 },
    });
    if (updateResult.count !== 1) throw new ConflictException('校准记录已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async refineAnalysis(
    id: string,
    dto: RefineCustomerServiceCalibrationAnalysisDto,
    user: CurrentUserPayload,
  ) {
    return this.analyze(id, user, { instruction: stringOrNull(dto.refinementInstruction) });
  }

  private async persistAnalysisParseFailure(
    item: any,
    userId: string,
    diagnostics: Record<string, unknown>,
    error: unknown,
  ) {
    diagnostics.finalStatus = 'PARSE_FAILED';
    diagnostics.parseError = error instanceof CalibrationAnalysisParseError
      ? error.diagnostics
      : { message: error instanceof Error ? error.message : String(error) };
    await this.repository.updateAnalysis(item.id, item.tenantId, item.revision, {
      aiAnalysisStatus: 'PARSE_FAILED',
      aiAnalysisDiagnostics: toJson(diagnostics),
      updatedById: userId,
      revision: { increment: 1 },
    } as any);
  }

  async updateStatus(id: string, dto: UpdateCustomerServiceCalibrationStatusDto, user: CurrentUserPayload) {
    const item = await this.get(id, user);
    if (dto.status === 'APPLIED_TUNING') throw new BadRequestException('请使用“应用到当前调优”操作');
    if (dto.status === 'AI_ANALYZED' && !item.aiDiagnosis) {
      throw new BadRequestException('尚未执行 AI 校准分析，不能直接标记为已分析');
    }
    if (dto.status === 'ACCEPTED' && !item.suggestedReply) throw new BadRequestException('没有可确认的建议回复');
    const result = await this.repository.updateStatus(item.id, item.tenantId, item.revision, dto.status, user.id);
    if (result.count !== 1) throw new ConflictException('校准记录已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async applyToTuning(id: string, dto: ApplyCustomerServiceCalibrationRecordDto, user: CurrentUserPayload) {
    const item = await this.get(id, user);
    if (item.problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION')) {
      throw new BadRequestException('意图识别误判属于理解机制问题，已保留诊断证据，不能自动发布为表达校准规则');
    }
    const selectedAnalysis = selectCalibrationAnalysisVersion(item, dto.analysisIteration);
    const existingDiagnostics = asObject(item.aiAnalysisDiagnostics);
    const previouslyAppliedIteration = Number(existingDiagnostics.appliedAnalysisIteration || 0);
    const sameAppliedVersion = item.status === 'APPLIED_TUNING'
      && item.appliedProfileId
      && (!dto.analysisIteration || previouslyAppliedIteration === selectedAnalysis.iteration);
    if (sameAppliedVersion && item.appliedProfileId) {
      const appliedProfile = await this.profileRepository.findScoped(item.appliedProfileId, item.tenantId);
      if (appliedProfile) {
        const selectedRecord = withSelectedCalibrationAnalysis(item, selectedAnalysis);
        if (isImmediateCalibrationScopeType(appliedProfile.scopeType) && appliedProfile.status === 'DISABLED') {
          const reactivated = await this.profileRepository.updateStatus(
            appliedProfile.id,
            item.tenantId,
            appliedProfile.revision,
            'ACTIVE',
            user.id,
          );
          if (reactivated.count !== 1) throw new ConflictException('调优档案已被其他操作更新，请刷新后重试');
          const profile = await this.profileRepository.findScoped(appliedProfile.id, item.tenantId);
          const currentReply = await this.currentTestReply.apply(selectedRecord);
          return { record: item, profile, currentReply, appliedAnalysisIteration: selectedAnalysis.iteration, appliedAnalysisVersionCount: selectedAnalysis.totalIterations };
        }
        const currentReply = await this.currentTestReply.apply(selectedRecord);
        return { record: item, profile: appliedProfile, currentReply, appliedAnalysisIteration: selectedAnalysis.iteration, appliedAnalysisVersionCount: selectedAnalysis.totalIterations };
      }
    }
    if (!selectedAnalysis.diagnosis || !selectedAnalysis.suggestedReply) throw new BadRequestException('所选校准轮次没有完整的 AI 校准结果，不能应用');
    if (item.status === 'ARCHIVED') throw new BadRequestException('已归档记录不能应用到调优环境');

    const scopeType = (dto.scopeType || (item.robotId && item.accountProfileId ? 'ROBOT_CONTEXT' : item.accountProfileId ? 'ACCOUNT_CONTEXT' : 'ROLE_CONTEXT')) as CustomerServiceCalibrationScopeType;
    if (!CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES.includes(scopeType)) throw new BadRequestException('无效的调优作用域');
    if (item.status === 'APPLIED_TUNING' && item.appliedScopeType && scopeType !== item.appliedScopeType) {
      throw new BadRequestException('已生效校准切换历史轮次时必须保持原作用域；如需改变作用域，请创建新的校准记录，避免遗留旧作用域同时生效');
    }
    if (item.accountProfileId && scopeType.startsWith('ROLE_')) {
      if (!user.permissions.includes('customer-service:asset:publish')) {
        throw new BadRequestException('账号来源校准扩大到角色范围需要策略发布权限。');
      }
      if (dto.confirmExpandedScope !== true) {
        throw new BadRequestException('扩大到角色范围会影响其他账号，必须确认影响范围后再次提交。');
      }
    }
    const accountProfile = item.accountProfileId
      ? await this.repository.findAccountProfile(item.accountProfileId, item.tenantId)
      : null;
    if ((scopeType.startsWith('ACCOUNT_') || scopeType.startsWith('ROBOT_')) && !accountProfile) {
      throw new BadRequestException('账号/机器人级校准作用域需要有效的账号资料；请刷新账号绑定后重试。');
    }
    if (scopeType.startsWith('ROBOT_') && !item.robotId) {
      throw new BadRequestException('机器人级校准作用域需要服务端 Reply Trace / 测试会话提供机器人身份，不能由前端补传。');
    }
    const scope = buildCalibrationScope(
      {
        merchantRoleId: item.merchantRoleId,
        merchantRoleName: item.merchantRole.name,
        accountProfileId: item.accountProfileId,
        accountProfileName: accountProfile?.name,
        robotId: item.robotId,
        industryNodeId: item.industryNodeId,
        industryName: item.industryNode?.name,
        scenario: item.scenario,
        intent: item.intent,
        riskLevel: item.riskLevel,
      },
      scopeType,
    );
    const immediateRuntimeScope = isImmediateCalibrationScopeType(scope.scopeType);
    const analyzedDirectives = normalizeTuningDirectives(selectedAnalysis.tuningDirectives);
    const immediateDirectiveSource = analyzedDirectives.goals.length || analyzedDirectives.behaviorRules.length
      ? analyzedDirectives
      : mergeTuningDirectives(
          selectedAnalysis.tuningDirectives,
          fallbackDirectives(item.problemTypes, selectedAnalysis.instruction || item.userSuggestion, selectedAnalysis.recommendations, selectedAnalysis.diagnosis),
        );
    const rawRecordDirectives = sanitizeSingleCaseCalibrationDirectives(
      immediateRuntimeScope
        ? immediateDirectiveSource
        : mergeTuningDirectives(
            selectedAnalysis.tuningDirectives,
            fallbackDirectives(item.problemTypes, selectedAnalysis.instruction || item.userSuggestion, selectedAnalysis.recommendations, selectedAnalysis.diagnosis),
          ),
      [item.customerMessage, item.originalReply, selectedAnalysis.suggestedReply, selectedAnalysis.instruction || item.userSuggestion],
    );
    const isAliFlagship = item.merchantRole.code === 'ali';
    const recordDirectives = isAliFlagship
      ? sanitizeAliFlagshipDirectives(rawRecordDirectives)
      : rawRecordDirectives;
    const existing = await this.profileRepository.findByScopeKey(item.tenantId, scope.scopeKey);
    const existingDirectives = isAliFlagship
      ? sanitizeAliFlagshipDirectives(existing?.directives)
      : existing?.directives;
    const existingSourceRecordIds = uniqueStrings(existing?.sourceRecordIds ?? []);
    const replacingOnlyContributionFromThisRecord = Boolean(
      existing
      && dto.analysisIteration
      && previouslyAppliedIteration
      && previouslyAppliedIteration !== selectedAnalysis.iteration
      && existingSourceRecordIds.length === 1
      && existingSourceRecordIds[0] === item.id,
    );
    const mergedDirectives = replacingOnlyContributionFromThisRecord
      ? recordDirectives
      : immediateRuntimeScope
        ? mergeImmediateCalibrationMemoryDirectives(recordDirectives, existingDirectives)
        : mergeTuningDirectives(recordDirectives, existingDirectives);
    const priorExamples = Array.isArray(existing?.examples)
      ? existing.examples.filter((entry: unknown) => asObject(entry).sourceRecordId !== item.id)
      : existing?.examples;
    const examples = mergeExamples(priorExamples, {
      customerMessage: item.customerMessage,
      originalReply: item.originalReply,
      preferredReply: selectedAnalysis.suggestedReply,
      problemTypes: item.problemTypes,
      note: selectedAnalysis.instruction || item.userSuggestion || asObject(selectedAnalysis.diagnosis).summary || null,
      sourceRecordId: item.id,
      analysisIteration: selectedAnalysis.iteration,
    });
    const sourceRecordIds = uniqueStrings([...(existing?.sourceRecordIds ?? []), item.id]).slice(-100);
    const sourceConfigurationHashes = uniqueStrings([
      ...(existing?.sourceConfigurationHashes ?? []),
      item.configurationHash,
    ]).slice(-30);

    let profile;
    if (existing) {
      const updated = await this.profileRepository.update(existing.id, item.tenantId, existing.revision, {
        title: scope.title,
        industryNodeId: scope.industryNodeId,
        accountProfileId: scope.accountProfileId,
        scenario: scope.scenario,
        intent: scope.intent,
        riskLevel: scope.riskLevel,
        status: immediateRuntimeScope ? 'ACTIVE' : 'DISABLED',
        directives: toJson(mergedDirectives),
        examples: toJson(examples),
        sourceRecordIds,
        sourceConfigurationHashes,
        appliedCount: { increment: 1 },
        lastAppliedAt: new Date(),
        updatedById: user.id,
        revision: { increment: 1 },
      });
      if (updated.count !== 1) throw new ConflictException('调优档案已被其他操作更新，请刷新后重试');
      profile = await this.profileRepository.findScoped(existing.id, item.tenantId);
    } else {
      profile = await this.profileRepository.create({
        tenantId: item.tenantId,
        merchantRoleId: scope.merchantRoleId,
        industryNodeId: scope.industryNodeId,
        accountProfileId: scope.accountProfileId,
        scopeType: scope.scopeType,
        scopeKey: scope.scopeKey,
        title: scope.title,
        scenario: scope.scenario,
        intent: scope.intent,
        riskLevel: scope.riskLevel,
        status: immediateRuntimeScope ? 'ACTIVE' : 'DISABLED',
        directives: toJson(mergedDirectives)!,
        examples: toJson(examples),
        sourceRecordIds,
        sourceConfigurationHashes,
        createdById: user.id,
      });
    }
    if (!profile) throw new ConflictException('调优档案保存失败，请刷新后重试');

    const appliedDiagnostics = {
      ...existingDiagnostics,
      appliedAnalysisIteration: selectedAnalysis.iteration,
      appliedAnalysisVersionCount: selectedAnalysis.totalIterations,
      appliedAnalysisAnalyzedAt: selectedAnalysis.analyzedAt,
      appliedAnalysisSuggestedReplyHash: stableJsonHash({ suggestedReply: selectedAnalysis.suggestedReply }),
    };
    const applied = await this.repository.updateApplied(item.id, item.tenantId, item.revision, {
      status: 'APPLIED_TUNING',
      appliedProfileId: profile.id,
      appliedScopeType: scope.scopeType,
      appliedScopeKey: scope.scopeKey,
      appliedAt: new Date(),
      appliedById: user.id,
      aiAnalysisDiagnostics: toJson(appliedDiagnostics),
      updatedById: user.id,
      revision: { increment: 1 },
    });
    if (applied.count !== 1) throw new ConflictException('校准记录已被其他操作更新，请刷新后重试');
    const record = await this.get(id, user);
    const currentReply = await this.currentTestReply.apply(withSelectedCalibrationAnalysis(record, selectedAnalysis));
    return { record, profile, currentReply, appliedAnalysisIteration: selectedAnalysis.iteration, appliedAnalysisVersionCount: selectedAnalysis.totalIterations };
  }

  async applyCurrentTestReply(id: string, user: CurrentUserPayload) {
    const item = await this.get(id, user);
    if (item.status === 'ARCHIVED') throw new BadRequestException('已归档记录不能替换当前测试回复');
    const diagnostics = asObject(item.aiAnalysisDiagnostics);
    const appliedIteration = item.status === 'APPLIED_TUNING'
      ? Number(diagnostics.appliedAnalysisIteration || 0) || undefined
      : undefined;
    const selectedAnalysis = selectCalibrationAnalysisVersion(item, appliedIteration);
    if (!selectedAnalysis.suggestedReply) throw new BadRequestException('当前校准没有可应用的建议回复');
    return this.currentTestReply.apply(withSelectedCalibrationAnalysis(item, selectedAnalysis));
  }

  async createKnowledgeRevisionDraft(
    id: string,
    dto: CreateCustomerServiceKnowledgeRevisionDraftDto,
    user: CurrentUserPayload,
  ) {
    const record = await this.get(id, user) as any;
    if (!Array.isArray(record.problemTypes) || !record.problemTypes.includes('FACT_ERROR')) {
      throw new BadRequestException('只有“事实问题”校准记录可以生成知识修订草稿');
    }
    if (record.knowledgeRevisionDraft) return record;
    if (!record.accountProfileId) {
      throw new BadRequestException('该校准记录缺少账号资料作用域，不能生成可安全隔离的知识草稿');
    }
    const account = await this.repository.findAccountProfile(record.accountProfileId, record.tenantId);
    if (!account) throw new BadRequestException('校准记录关联的账号资料不存在或已失效');
    const scopeKey = dto.scopeType === 'ACCOUNT' ? account.id : account.storeProfileId;
    if (!scopeKey) throw new BadRequestException('当前账号没有关联店铺资料，不能创建店铺级知识草稿');

    const target = dto.targetEntryId
      ? await this.knowledgeEntries.find(dto.targetEntryId, record.tenantId)
      : null;
    if (dto.targetEntryId && !target) throw new BadRequestException('目标业务知识不存在或不属于当前租户');
    if (target && (target.scopeType !== dto.scopeType || target.scopeKey !== scopeKey)) {
      throw new BadRequestException('目标业务知识与当前校准账号/店铺作用域不一致');
    }
    const { effectiveFrom, effectiveTo } = parseKnowledgeWindow(dto.effectiveFrom, dto.effectiveTo);
    await this.knowledgeRevisionDrafts.create({
      tenantId: record.tenantId,
      calibrationRecordId: record.id,
      targetEntryId: target?.id || null,
      targetEntryRevision: target?.revision || null,
      action: target ? 'UPDATE' : 'CREATE',
      scopeType: dto.scopeType,
      scopeKey,
      category: dto.category,
      title: dto.title.trim(),
      question: dto.question?.trim() || null,
      content: dto.content.trim(),
      tags: uniqueStrings(dto.tags || []).slice(0, 30),
      sourceReference: dto.sourceReference?.trim() || `calibration:${record.id}`,
      effectiveFrom,
      effectiveTo,
      freshnessPolicy: dto.freshnessPolicy?.trim() || null,
      status: 'DRAFT',
      createdById: user.id,
    });
    return this.get(id, user);
  }

  async verifyKnowledgeRevisionDraft(
    id: string,
    dto: VerifyCustomerServiceKnowledgeRevisionDraftDto,
    user: CurrentUserPayload,
  ) {
    if (!dto.confirmedFact) throw new BadRequestException('必须由人工明确确认事实已经核实');
    const record = await this.get(id, user) as any;
    const draft = await this.knowledgeRevisionDrafts.findByCalibration(id, record.tenantId);
    if (!draft) throw new NotFoundException('知识修订草稿不存在');
    if (draft.status !== 'DRAFT') throw new BadRequestException('只有待核实草稿可以执行事实核实');
    const result = await this.knowledgeRevisionDrafts.update(draft.id, record.tenantId, dto.revision, {
      status: 'VERIFIED',
      verificationNote: dto.verificationNote.trim(),
      verifiedAt: new Date(),
      verifiedById: user.id,
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('知识草稿已被其他人更新，请刷新后重试');
    return this.get(id, user);
  }

  async publishKnowledgeRevisionDraft(
    id: string,
    dto: PublishCustomerServiceKnowledgeRevisionDraftDto,
    user: CurrentUserPayload,
  ) {
    if (!dto.confirmPublish) throw new BadRequestException('发布正式知识前必须人工确认');
    const record = await this.get(id, user) as any;
    const draft = await this.knowledgeRevisionDrafts.findByCalibration(id, record.tenantId);
    if (!draft) throw new NotFoundException('知识修订草稿不存在');
    if (draft.status !== 'VERIFIED' || !draft.verifiedAt || !draft.verifiedById) {
      throw new BadRequestException('知识草稿必须先完成人工事实核实才能发布');
    }
    let publishedEntryId: string;
    if (draft.action === 'UPDATE' && draft.targetEntryId) {
      const target = await this.knowledgeEntries.find(draft.targetEntryId, record.tenantId);
      if (!target) throw new BadRequestException('待修订的原业务知识不存在');
      if (target.revision !== draft.targetEntryRevision) {
        throw new ConflictException('原业务知识已被更新，请重新核对并生成新的修订草稿');
      }
      const updated = await this.knowledgeEntries.update(target.id, record.tenantId, target.revision, {
        scopeType: draft.scopeType,
        scopeKey: draft.scopeKey,
        category: draft.category,
        title: draft.title,
        question: draft.question,
        content: draft.content,
        tags: draft.tags,
        sourceType: 'CALIBRATION_DRAFT',
        sourceReference: draft.sourceReference || `calibration:${record.id}`,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo,
        freshnessPolicy: draft.freshnessPolicy,
        status: 'ENABLED',
        updatedById: user.id,
      });
      if (!updated.count) throw new ConflictException('原业务知识已被其他人更新，请刷新后重试');
      publishedEntryId = target.id;
    } else {
      const created = await this.knowledgeEntries.create({
        tenantId: record.tenantId,
        scopeType: draft.scopeType,
        scopeKey: draft.scopeKey,
        category: draft.category,
        title: draft.title,
        question: draft.question,
        content: draft.content,
        tags: draft.tags,
        sourceType: 'CALIBRATION_DRAFT',
        sourceReference: draft.sourceReference || `calibration:${record.id}`,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo,
        freshnessPolicy: draft.freshnessPolicy,
        status: 'ENABLED',
        createdById: user.id,
      });
      publishedEntryId = created.id;
    }
    const result = await this.knowledgeRevisionDrafts.update(draft.id, record.tenantId, dto.revision, {
      status: 'PUBLISHED',
      publishedEntryId,
      publishedAt: new Date(),
      publishedById: user.id,
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('知识草稿状态已变化，请刷新后确认发布结果');
    return this.get(id, user);
  }

  async createStrategyDraft(id: string, user: CurrentUserPayload) {
    const item = await this.get(id, user) as any;
    if (item.status !== 'APPLIED_TUNING' || !item.appliedProfileId) {
      throw new BadRequestException('请先完成 AI 校准分析并确认保存为校准证据。');
    }
    if (!item.tuningDirectives) {
      throw new BadRequestException('当前校准没有结构化调优指令，不能生成策略草稿。');
    }
    if (item.strategyDraftVersionId && ['DRAFT', 'REGRESSION_PASSED'].includes(item.strategyDraftStatus)) {
      return {
        record: item,
        strategyDraft: {
          assetId: item.strategyDraftAssetId,
          versionId: item.strategyDraftVersionId,
          status: item.strategyDraftStatus,
          reused: true,
        },
      };
    }
    const evidenceProfile = await this.profileRepository.findScoped(item.appliedProfileId, item.tenantId);
    const independentRecordCount = uniqueStrings(evidenceProfile?.sourceRecordIds || []).length;
    if (independentRecordCount < 3) {
      throw new BadRequestException('至少需要 3 条独立校准记录聚合到同一作用域，才能生成可发布策略草稿。单条失败样例只能作为回归证据。');
    }
    const directives = sanitizeSingleCaseCalibrationDirectives(
      item.tuningDirectives,
      [item.customerMessage, item.originalReply, item.suggestedReply, item.userSuggestion],
    );
    const draft = buildCalibrationStrategyDraft({
      recordId: item.id,
      roleCode: item.merchantRole.code,
      roleName: item.merchantRole.name,
      accountProfileId: item.accountProfileId || null,
      accountProfileName: item.accountProfileId
        ? (await this.repository.findAccountProfile(item.accountProfileId, item.tenantId))?.name || null
        : null,
      scopeType: item.appliedScopeType,
      scenario: item.scenario,
      intent: item.intent,
      riskLevel: item.riskLevel,
      industryCode: item.industryNode?.code || null,
      directives,
      problemTypes: item.problemTypes,
    });
    const created = await this.assetsService.createCalibrationStrategyDraft({
      tenantId: item.tenantId,
      ...draft,
    }, user);
    const update = await this.repository.updateStrategyDraft(item.id, item.tenantId, item.revision, {
      strategyDraftAssetId: created.asset.id,
      strategyDraftVersionId: created.version.id,
      strategyDraftStatus: 'DRAFT',
      strategyDraftRegression: Prisma.JsonNull,
      strategyDraftValidatedAt: null,
      strategyDraftPublishedAt: null,
      relatedAssetIds: uniqueStrings([...(item.relatedAssetIds || []), created.asset.id]),
      updatedById: user.id,
      revision: { increment: 1 },
    });
    if (update.count !== 1) {
      throw new ConflictException('校准记录已被其他操作更新；策略草稿已保留，请刷新后重新关联。');
    }
    return {
      record: await this.get(id, user),
      strategyDraft: {
        assetId: created.asset.id,
        assetKey: created.asset.key,
        versionId: created.version.id,
        versionNo: created.version.versionNo,
        status: 'DRAFT',
        reused: false,
      },
    };
  }

  async recordStrategyDraftRegression(
    id: string,
    dto: RecordCustomerServiceStrategyDraftRegressionDto,
    user: CurrentUserPayload,
  ) {
    const item = await this.get(id, user) as any;
    if (!item.strategyDraftVersionId || item.strategyDraftVersionId !== dto.strategyVersionId) {
      throw new BadRequestException('回归结果使用的不是当前校准策略草稿版本，不能记录。');
    }
    if (['PUBLISHED', 'SUPERSEDED'].includes(item.strategyDraftStatus)) {
      throw new BadRequestException('该策略草稿已发布或已被后续版本替代，不能覆盖其历史回归记录。');
    }
    const countsMatch = dto.totalCases === dto.passedCases + dto.limitedCases + dto.failedCases;
    if (!countsMatch) throw new BadRequestException('回归用例数量汇总不一致。');
    const regressionDetails = asObject(dto.details);
    const distinctRoleCount = Number(regressionDetails.distinctRoleCount || 0);
    const unseenExpressionCaseCount = Number(regressionDetails.unseenExpressionCaseCount || 0);
    const sourceCaseExcluded = regressionDetails.sourceCaseExcluded === true;
    const generalizationEvidencePassed = dto.totalCases >= 12
      && distinctRoleCount >= 2
      && unseenExpressionCaseCount >= 6
      && sourceCaseExcluded;
    const objectivelyPassed = dto.failedCases === 0
      && dto.limitedCases === 0
      && dto.passedCases === dto.totalCases
      && generalizationEvidencePassed;
    if ((dto.status === 'PASSED') !== objectivelyPassed) {
      throw new BadRequestException('回归状态与通过、受限、失败数量不一致。');
    }
    const regression = {
      status: dto.status,
      strategyVersionId: dto.strategyVersionId,
      totalCases: dto.totalCases,
      passedCases: dto.passedCases,
      limitedCases: dto.limitedCases,
      failedCases: dto.failedCases,
      failedCaseKeys: uniqueStrings(dto.failedCaseKeys || []),
      details: dto.details || null,
      generalizationEvidence: {
        requiredTotalCases: 12,
        distinctRoleCount,
        unseenExpressionCaseCount,
        sourceCaseExcluded,
        passed: generalizationEvidencePassed,
      },
      recordedAt: new Date().toISOString(),
      recordedById: user.id,
    };
    const update = await this.repository.updateStrategyDraft(item.id, item.tenantId, item.revision, {
      strategyDraftStatus: objectivelyPassed ? 'REGRESSION_PASSED' : 'REGRESSION_FAILED',
      strategyDraftRegression: toJson(regression),
      strategyDraftValidatedAt: new Date(),
      updatedById: user.id,
      revision: { increment: 1 },
    });
    if (update.count !== 1) throw new ConflictException('校准记录已被其他操作更新，请刷新后重试。');
    return {
      record: await this.get(id, user),
      regression,
      publishAllowed: objectivelyPassed,
    };
  }

  async publishStrategyDraft(id: string, user: CurrentUserPayload) {
    const item = await this.get(id, user) as any;
    if (item.strategyDraftStatus === 'PUBLISHED') {
      return {
        record: item,
        version: {
          id: item.strategyDraftVersionId,
          status: 'PUBLISHED',
          reused: true,
        },
      };
    }
    if (item.strategyDraftStatus !== 'REGRESSION_PASSED') {
      throw new BadRequestException('当前校准策略草稿尚未完成全量回归，不能发布。');
    }
    if (!item.strategyDraftAssetId || !item.strategyDraftVersionId) {
      throw new BadRequestException('当前校准记录没有可发布的策略草稿。');
    }
    const versions = await this.assetsService.listVersions(item.strategyDraftAssetId, user);
    const version = versions.find((candidate) => candidate.id === item.strategyDraftVersionId);
    if (!version) throw new NotFoundException('当前校准策略草稿版本不存在。');
    if (version.status !== 'DRAFT') {
      throw new ConflictException('当前校准策略版本不再是草稿，请刷新校准记录。');
    }
    const published = await this.assetsService.publishVersion(
      item.strategyDraftAssetId,
      item.strategyDraftVersionId,
      { revision: version.revision },
      user,
    );
    return {
      record: await this.get(id, user),
      version: published,
    };
  }

  private buildAnalysisPrompt(item: CalibrationPromptSource, refinement: CalibrationRefinementContext | null = null) {
    const runtime = asObject(item.runtimeContract);
    const source = asObject(item.sourceSnapshot);
    const quality = asObject(item.qualityReport);
    const rawRuntimeContext = Object.keys(asObject(source.fullRuntimeContract)).length
      ? asObject(source.fullRuntimeContract)
      : runtime;
    const isolatedRuntime = isolateRuntimeContractForCalibrationAnalysis(rawRuntimeContext);
    const completeContext = {
      authoritativeRole: source.authoritativeRole ?? runtime.identity ?? null,
      fullRuntimeContract: isolatedRuntime.runtimeContract,
      preexistingCalibrationEvidence: isolatedRuntime.preexistingCalibrationEvidence,
      tuningRun: source.tuningRun ?? null,
      classification: isolatedRuntime.runtimeContract.classification ?? runtime.classification ?? null,
      persona: isolatedRuntime.runtimeContract.persona ?? runtime.persona ?? null,
      policy: isolatedRuntime.runtimeContract.policy ?? runtime.policy ?? null,
      replyPlan: isolatedRuntime.runtimeContract.replyPlan ?? runtime.replyPlan ?? null,
      orchestrationPlan: isolatedRuntime.runtimeContract.orchestrationPlan ?? runtime.orchestrationPlan ?? null,
      provenance: isolatedRuntime.runtimeContract.provenance ?? runtime.provenance ?? null,
      qualityIssues: quality.issues ?? null,
      configurationHash: item.configurationHash,
    };
    const system = [
      '你是智能客服回复调优分析器。你必须基于本轮角色原型、客服角色、角色模块、行业、规则、资产、运行契约和质量结果进行完整诊断。',
      '目标不是只改一条话术，而是提炼以后遇到相同角色和相同场景配置时可以稳定复用的判断原则。',
      '校准链必须隔离：当前 CalibrationRecord 的原始反馈、当前记录内的迭代历史和本轮管理员继续调整意见，才是本次校准要求的来源。其他校准记录或历史已应用校准不得被当成本轮要求继承。',
      '运行上下文中历史已应用的精确校准正文已由服务器剥离，只保留无规则正文的诊断元信息。该元信息只能说明原回复生成时存在过历史校准，不得据此猜测或恢复旧校准内容。',
      '所有回复都先诊断客户的显性诉求、潜在动机、当前心境、关系状态、商业开放度和本轮真正可提供的价值，再判断是否存在可选经营机会。',
      '不能把“没有明确购买信号”简单等同于“完全没有购物意愿”；也不能因为客户在商家窗口聊天就直接判定要买。必须区分 CLOSED、UNKNOWN、LATENT、ACTIVE、EXPLICIT。',
      '经营目标不是必达项。没有合适机会时允许只解决问题、维护关系或自然结束；不得利用客户情绪制造消费理由。',
      '优先检查：动机误判、关系错位、目的感过强、情绪利用式营销、AI腔、废话、重复、口语不自然、角色不一致、共情错误、提问过多、事实和流程问题。',
      '必须保持业务事实和权限边界，不得为了更自然而编造商品、订单、物流、动作结果或承诺时间。',
      '全量配置用于诊断，但只建议修改真正导致问题的配置层。targetScopes 只能使用：' + TARGET_SCOPES.join('、') + '。',
      '如果客户显性请求、识别出的场景/意图/本轮目标彼此不一致，应使用 UNDERSTANDING_RULE，并明确这是识别机制问题；不要把识别误判伪装成语气或表达规则。',
      'tuningDirectives 必须是可长期复用的抽象约束。商家给出的示例回复只能帮助理解方向，严禁把示例原句、第一句、最后一句、句数、表情或段落结构写成固定规则。',
      '只有问题类型明确涉及消息拆分或发送节奏时，才填写 tuningDirectives.delivery；内容满意但应分开发送使用 SEQUENTIAL，内容应保持一条使用 SINGLE，节奏问题可使用 AUTO 并给出延迟范围。',
      'maxSentences 和 maxQuestions 只是上限；没有充分理由时返回 null，绝不能把当前满意回复的句数当作以后每次都要达到的结构。',
      'preferredPatterns 只能写抽象表达方向，例如“自然承接后给客户选择空间”，不能写可直接复制的完整话术。',
      '当客服角色为阿梨时，她是全行业旗舰真人感母版：先识别对话阶段。客户刚表示想聊天但尚未分享时，只建议自然邀请分享，不得提前推荐商品；客户分享后先回应分享内容，再判断是否存在真实相关的价值入口。',
      '阿梨的亲近感来自轻微善意推测、自然接话和分寸，不要用客服接待句、亲昵称呼、固定俏皮句或夸张陪伴。',
      '只输出 JSON，不要 Markdown，不要解释性前后缀。',
      'JSON 格式：{"diagnosis":{"summary":"","rootCause":"","evidence":[""]},"targetScopes":["ROLE_MODULE"],"recommendations":[{"scope":"ROLE_MODULE","title":"","change":"","priority":"HIGH"}],"tuningDirectives":{"goals":[""],"behaviorRules":[""],"avoidExpressions":[""],"preferredPatterns":[""],"maxSentences":null,"maxQuestions":null,"emojiPolicy":"AUTO","delivery":{"mode":null,"maxSegments":null,"minDelayMs":null,"maxDelayMs":null,"splitThresholdChars":null,"cancelRemainingOnCustomerMessage":null}},"suggestedReply":"","rationale":"","confidence":0.8}',
      'emojiPolicy 仅允许 AUTO、AVOID、ALLOW；明确要求不使用表情时必须返回 AVOID。',
    ].join('\n');
    const refinementLines = refinement
      ? [
          '【继续校准：必须承接上一版，不得重新随机起稿】',
          `管理员对上一版的继续调整意见（本轮最高优先级）：${refinement.instruction || '未补充具体意见；请基于上一版诊断和建议回复继续自我审查并优化。'}`,
          `上一版诊断：${truncate(JSON.stringify(refinement.previousDiagnosis), 4000)}`,
          `上一版配置调整建议：${truncate(JSON.stringify(refinement.previousRecommendations), 4500)}`,
          `上一版可复用调优指令：${truncate(JSON.stringify(refinement.previousDirectives), 5000)}`,
          `上一版建议回复：${truncate(refinement.previousSuggestedReply, 8000)}`,
          '管理员点击“继续校准”本身就代表上一版结果未达到要求，即使没有填写额外意见，也必须继续找出至少一个仍可改善的具体点，而不是原样返回上一版。',
          '继续校准要求：先判断上一版哪些部分应保留、哪些部分仍不满足目标；以原始客户消息和原始被校准回复为事实基线，在上一版分析基础上做增量修正。不要把上一版建议回复当作新的客户输入，也不要为了“不同”而无意义改写。',
          '如果本轮管理员继续调整意见与首次校准建议、上一版诊断、上一版 tuningDirectives 或上一版建议回复存在冲突，必须以本轮管理员继续调整意见为准；旧要求只能作为历史背景，不能继续约束新版。',
          'suggestedReply 必须体现本轮实际修正，不能与上一版完全相同、只改标点或只做无意义同义词替换；如果上一版方向基本正确，就从信息量、结构、表达节奏、回应动作或边界中选择真正需要改善的一项进行修正。',
          '新的 tuningDirectives 必须代表当前迭代后的最终抽象原则；如果上一版某条原则仍正确就保留，若本次明确修正则用新原则替代，不要同时输出互相冲突的新旧要求。',
        ]
      : [];
    const user = [
      `改善方式：${item.improvementMode === 'GUIDED' ? '按商家建议改善' : '由 AI 自主诊断改善'}`,
      `问题类型：${item.problemTypes.join('、')}`,
      `问题补充：${item.problemDescription || '无'}`,
      refinement
        ? `首次校准时管理员建议（历史背景；如与本轮继续调整意见冲突，以本轮意见为准）：${item.userSuggestion || '首次未提供'}`
        : `商家建议：${item.userSuggestion || '未提供，请自主判断'}`,
      `客户消息：${item.customerMessage}`,
      `原回复：${item.originalReply}`,
      ...refinementLines,
      `本轮全部生效配置和运行上下文：${truncate(JSON.stringify(completeContext), 24000)}`,
      refinement
        ? '请输出本次继续校准后的最新根因判断、精确配置作用域、最终可复用调优指令和最新版建议回复。'
        : '请输出根因、精确配置作用域、可复用调优指令和一条更自然简洁的建议回复。',
    ].join('\n');
    return { system, user };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function compactSourceSnapshot(value: unknown, authoritativeAnalysis?: unknown) {
  const source = asObject(value);
  const analysis = asObject(authoritativeAnalysis);
  const runtime = asObject(analysis.runtimeContract);
  const generationContext = asObject(runtime.generationContext);
  const replyPlan = asObject(runtime.replyPlan);
  const persona = asObject(runtime.persona);
  const sourceHistory = Array.isArray(source.conversationHistory) ? source.conversationHistory : [];
  const runtimeHistory = Array.isArray(generationContext.conversationHistory) ? generationContext.conversationHistory : [];
  const history = (sourceHistory.length ? sourceHistory : runtimeHistory).slice(-8);
  const generation = asObject(Object.keys(asObject(source.generation)).length ? source.generation : analysis.generation);
  return {
    tuningSessionId: source.tuningSessionId ?? analysis.sessionId ?? null,
    analysisRecordId: source.analysisRecordId ?? analysis.id ?? null,
    summary: source.summary ?? analysis.summary ?? null,
    conversationHistory: history,
    matchedIntentDefinitionIds: compactIds(
      source.matchedIntentDefinitionIds ?? source.matchedIntentDefinitions ?? runtime.intentGuidance,
      30,
    ),
    matchedResponseRuleIds: compactIds(
      source.matchedResponseRuleIds ?? source.matchedResponseRules ?? replyPlan.matchedRules,
      50,
    ),
    roleModuleIds: compactIds(source.roleModuleIds ?? source.roleModules ?? persona.modules, 50),
    generation: Object.keys(generation).length ? {
      status: generation.status ?? null,
      source: generation.source ?? null,
      model: generation.model ?? null,
      rewriteCount: generation.rewriteCount ?? null,
    } : null,
  };
}

function compactIds(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => typeof item === 'string' ? item : asObject(item).id)
    .map((item) => String(item || '').trim())
    .filter(Boolean))].slice(0, limit);
}

function asObject(value: unknown): Record<string, any> {
  return value && !Array.isArray(value) && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()))];
}

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}...[已截断]`;
}


type CalibrationAnalysisVersionSelection = {
  iteration: number;
  totalIterations: number;
  latest: boolean;
  instruction: string | null;
  analyzedAt: string | null;
  aiModel: string | null;
  diagnosis: any;
  recommendations: any[];
  tuningDirectives: any;
  suggestedReply: string;
};

function selectCalibrationAnalysisVersion(item: any, requestedIteration?: number): CalibrationAnalysisVersionSelection {
  const diagnostics = asObject(item.aiAnalysisDiagnostics);
  const rawHistory = Number(diagnostics.refinementHistorySchemaVersion || 0) >= 2
    ? normalizeCalibrationRefinementHistory(diagnostics.refinementHistory)
    : migrateLegacyCalibrationRefinementHistory(diagnostics.refinementHistory, item);
  const versions: Array<Omit<CalibrationAnalysisVersionSelection, 'iteration' | 'totalIterations' | 'latest'>> = [];
  const seen = new Set<string>();

  for (const raw of rawHistory) {
    const entry = asObject(raw);
    const suggestedReply = String(entry.suggestedReply || '').trim();
    if (!suggestedReply) continue;
    const fingerprint = calibrationRefinementHistoryFingerprint(entry);
    if (fingerprint && seen.has(fingerprint)) continue;
    if (fingerprint) seen.add(fingerprint);
    versions.push({
      instruction: stringOrNull(entry.instruction),
      analyzedAt: stringOrNull(entry.analyzedAt),
      aiModel: stringOrNull(entry.aiModel),
      diagnosis: asObject(entry.diagnosis),
      recommendations: Array.isArray(entry.recommendations) ? entry.recommendations : [],
      tuningDirectives: Object.keys(asObject(entry.tuningDirectives)).length ? entry.tuningDirectives : null,
      suggestedReply,
    });
  }

  const latestReply = String(item.suggestedReply || '').trim();
  if (item.aiDiagnosis && latestReply) {
    const latestFingerprint = calibrationRefinementHistoryFingerprint({
      analyzedAt: item.analyzedAt,
      suggestedReply: latestReply,
    });
    const currentInstruction = resolveCurrentCalibrationVersionInstruction(item, diagnostics, rawHistory);
    const existingIndex = versions.findIndex((entry) => calibrationRefinementHistoryFingerprint({
      analyzedAt: entry.analyzedAt,
      suggestedReply: entry.suggestedReply,
    }) === latestFingerprint);
    const latestEntry = {
      instruction: currentInstruction,
      analyzedAt: item.analyzedAt ? String(item.analyzedAt instanceof Date ? item.analyzedAt.toISOString() : item.analyzedAt) : null,
      aiModel: stringOrNull(item.aiModel),
      diagnosis: item.aiDiagnosis,
      recommendations: Array.isArray(item.aiRecommendations) ? item.aiRecommendations : [],
      tuningDirectives: item.tuningDirectives || null,
      suggestedReply: latestReply,
    };
    if (existingIndex >= 0) versions[existingIndex] = latestEntry;
    else versions.push(latestEntry);
  }

  if (!versions.length) throw new BadRequestException('当前记录没有可应用的完整校准轮次');
  const requested = requestedIteration ?? versions.length;
  if (!Number.isInteger(requested) || requested < 1 || requested > versions.length) {
    throw new BadRequestException(`无效的校准轮次：当前共有 ${versions.length} 轮，可选择 1-${versions.length}`);
  }
  const selected = versions[requested - 1];
  return {
    ...selected,
    iteration: requested,
    totalIterations: versions.length,
    latest: requested === versions.length,
  };
}

function withSelectedCalibrationAnalysis(item: any, selected: CalibrationAnalysisVersionSelection) {
  return {
    ...item,
    aiDiagnosis: selected.diagnosis,
    aiRecommendations: selected.recommendations,
    tuningDirectives: selected.tuningDirectives,
    suggestedReply: selected.suggestedReply,
    aiModel: selected.aiModel,
    analyzedAt: selected.analyzedAt,
  };
}

function normalizeCalibrationRefinementHistory(value: unknown) {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  const result: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = asObject(raw);
    if (!Object.keys(entry).length) continue;
    const fingerprint = calibrationRefinementHistoryFingerprint(entry);
    if (fingerprint && seen.has(fingerprint)) continue;
    if (fingerprint) seen.add(fingerprint);
    result.push(entry);
  }
  return result;
}

function migrateLegacyCalibrationRefinementHistory(value: unknown, item: any) {
  const legacy = normalizeCalibrationRefinementHistory(value);
  if (!legacy.length) return legacy;
  return legacy.map((entry, index) => ({
    ...entry,
    // 旧实现把“下一轮的继续调整意见”写在了上一版快照上。
    // 迁移为“产生当前这一版时使用的管理员意见”。
    instruction: index === 0
      ? (item.improvementMode === 'GUIDED' ? stringOrNull(item.userSuggestion) : null)
      : stringOrNull(asObject(legacy[index - 1]).instruction),
  }));
}

function resolveCurrentCalibrationVersionInstruction(
  item: any,
  diagnostics: Record<string, any>,
  history: Record<string, unknown>[],
) {
  const currentFingerprint = calibrationRefinementHistoryFingerprint({
    analyzedAt: item.analyzedAt,
    suggestedReply: item.suggestedReply,
  });
  const snapshottedCurrent = [...history].reverse().find(
    (entry) => calibrationRefinementHistoryFingerprint(entry) === currentFingerprint,
  );
  if (snapshottedCurrent) return stringOrNull(asObject(snapshottedCurrent).instruction);
  if (diagnostics.analysisMode === 'REFINEMENT' && diagnostics.finalStatus === 'SUCCESS') {
    return stringOrNull(diagnostics.refinementInstruction);
  }
  return item.improvementMode === 'GUIDED' ? stringOrNull(item.userSuggestion) : null;
}

function appendCalibrationRefinementHistory(
  history: Record<string, unknown>[],
  context: CalibrationRefinementContext,
) {
  const entry = buildCalibrationRefinementHistoryEntry(context);
  const fingerprint = calibrationRefinementHistoryFingerprint(entry);
  if (fingerprint && history.some((item) => calibrationRefinementHistoryFingerprint(item) === fingerprint)) {
    return history;
  }
  return [...history, entry];
}

function buildCalibrationRefinementHistoryEntry(context: CalibrationRefinementContext) {
  return {
    instruction: context.previousInstruction,
    analyzedAt: context.previousAnalyzedAt,
    aiModel: context.previousAiModel,
    diagnosis: boundJsonPayload(context.previousDiagnosis, 8_192).value,
    recommendations: boundJsonPayload(context.previousRecommendations, 8_192).value,
    tuningDirectives: boundJsonPayload(context.previousDirectives, 8_192).value,
    // 保留每一轮真实建议回复，PC 以折叠版本记录呈现；不再只保留最近 5 轮。
    suggestedReply: truncate(context.previousSuggestedReply, 12_000),
  };
}

function calibrationRefinementHistoryFingerprint(value: unknown) {
  const entry = asObject(value);
  const reply = normalizeCalibrationReplyForComparison(String(entry.suggestedReply || ''));
  const analyzedAt = entry.analyzedAt instanceof Date
    ? entry.analyzedAt.toISOString()
    : String(entry.analyzedAt || '');
  return reply || analyzedAt ? `${analyzedAt}|${reply}` : '';
}

function isolateRuntimeContractForCalibrationAnalysis(value: unknown) {
  const runtime = asObject(value);
  const calibration = asObject(runtime.calibration);
  const calibrationProfiles = Array.isArray(calibration.profiles) ? calibration.profiles.map(asObject) : [];
  const businessContext = asObject(runtime.businessContext);
  const languagePolicyConstraints = arrayStrings(businessContext.languagePolicyConstraints)
    .filter((item) => !isHistoricalCalibrationRuntimeInstruction(item));

  const runtimeContract: Record<string, any> = {
    ...runtime,
    businessContext: {
      ...businessContext,
      languagePolicyConstraints,
    },
    calibration: {
      // 校准分析只能知道“原回复当时存在历史校准”，不能读取其他批次规则正文，
      // 否则继续校准会把历史规则误当成当前管理员要求。
      profiles: [],
      directives: null,
      analysisIsolation: 'PREEXISTING_CALIBRATION_RULE_TEXT_EXCLUDED',
    },
  };

  return {
    runtimeContract,
    preexistingCalibrationEvidence: {
      profileCount: calibrationProfiles.length,
      scopeTypes: uniqueStrings(calibrationProfiles.map((item) => item.scopeType)),
      hadProjectedDirectives: Boolean(
        arrayStrings(asObject(calibration.directives).goals).length
        || arrayStrings(asObject(calibration.directives).behaviorRules).length
      ),
      note: 'DIAGNOSTIC_ONLY_RULE_TEXT_EXCLUDED',
    },
  };
}

function isHistoricalCalibrationRuntimeInstruction(value: string) {
  const normalized = value.trim();
  return normalized.startsWith('以下管理员精确校准已由服务器')
    || normalized.startsWith('管理员已应用的当前账号校准目标：')
    || normalized.startsWith('管理员已应用的当前账号校准原则：');
}

function normalizeCalibrationReplyForComparison(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function isMeaningfullyDifferentCalibrationReply(previous: string, next: string) {
  const previousNormalized = normalizeCalibrationReplyForComparison(previous);
  const nextNormalized = normalizeCalibrationReplyForComparison(next);
  if (!nextNormalized) return false;
  if (!previousNormalized) return true;
  if (previousNormalized !== nextNormalized) return true;
  // 文本字词完全相同但段落/换行结构发生变化时，也可能正是管理员要求的有效校准，
  // 例如“第一段保留，只把最后一句提问拆成第二段”。不能被 no-op 保护误杀。
  return calibrationReplyBlockSignature(previous) !== calibrationReplyBlockSignature(next);
}

function isMeaningfullyDifferentCalibrationOutput(
  previous: CalibrationRefinementContext,
  next: CalibrationAiOutput,
) {
  if (isMeaningfullyDifferentCalibrationReply(previous.previousSuggestedReply, next.suggestedReply)) return true;

  const previousDiagnosis = asObject(previous.previousDiagnosis);
  const previousComparable = {
    diagnosis: {
      summary: normalizeCalibrationComparisonString(previousDiagnosis.summary),
      rootCause: normalizeCalibrationComparisonString(previousDiagnosis.rootCause),
      evidence: arrayStrings(previousDiagnosis.evidence).map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    },
    targetScopes: arrayStrings(previousDiagnosis.targetScopes).map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    recommendations: canonicalizeCalibrationRecommendationsForComparison(previous.previousRecommendations),
    tuningDirectives: canonicalizeCalibrationDirectivesForComparison(previous.previousDirectives),
  };
  const nextComparable = {
    diagnosis: {
      summary: normalizeCalibrationComparisonString(next.diagnosis.summary),
      rootCause: normalizeCalibrationComparisonString(next.diagnosis.rootCause),
      evidence: next.diagnosis.evidence.map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    },
    targetScopes: next.targetScopes.map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    recommendations: canonicalizeCalibrationRecommendationsForComparison(next.recommendations),
    tuningDirectives: canonicalizeCalibrationDirectivesForComparison(next.tuningDirectives),
  };
  return stableJsonHash(previousComparable) !== stableJsonHash(nextComparable);
}

function canonicalizeCalibrationRecommendationsForComparison(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((raw) => {
      const item = asObject(raw);
      return {
        scope: normalizeCalibrationComparisonString(item.scope),
        title: normalizeCalibrationComparisonString(item.title),
        change: normalizeCalibrationComparisonString(item.change),
        priority: normalizeCalibrationComparisonString(item.priority),
      };
    })
    .filter((item) => item.scope || item.title || item.change || item.priority)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function canonicalizeCalibrationDirectivesForComparison(value: unknown) {
  const directives = normalizeTuningDirectives(value);
  return {
    goals: directives.goals.map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    behaviorRules: directives.behaviorRules.map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    avoidExpressions: directives.avoidExpressions.map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    preferredPatterns: directives.preferredPatterns.map(normalizeCalibrationComparisonString).filter(Boolean).sort(),
    maxSentences: directives.maxSentences,
    maxQuestions: directives.maxQuestions,
    emojiPolicy: directives.emojiPolicy,
    delivery: directives.delivery,
  };
}

function normalizeCalibrationComparisonString(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function calibrationReplyBlockSignature(value: string) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeCalibrationReplyForComparison(item).slice(0, 80))
    .join('|');
}

function fallbackDirectives(problemTypes: string[], userSuggestion: string | null, recommendations: unknown, diagnosis: unknown) {
  const diagnosisObject = asObject(diagnosis);
  const behaviorRules = [
    '每轮先判断客户显性诉求、潜在动机、心境、关系状态和商业开放度，再决定回复内容。',
    '经营目标是可选项；没有真实机会时不制造机会，不为了成交强行延长或转移话题。',
    '商家建议和满意回复只用于理解方向，不复用其中示例原句、固定开头、结尾、句数、表情或结构。',
  ];
  if (problemTypes.includes('AI_TONE')) behaviorRules.push('避免宣传文案腔、服务化陪伴套话和刻意制造亲近感。');
  if (problemTypes.some((item) => ['FORCED_SALES', 'SALES_BOUNDARY', 'OTHER'].includes(item))) {
    behaviorRules.push('未出现具体商品、困扰、使用场景、偏好或购买信号时，不直接推荐具体商品；潜在开放场景只做低压力需求探索。');
  }
  if (userSuggestion) behaviorRules.push('吸收商家建议中的目标和边界，但不要照抄其中示例表达。');
  return {
    goals: [String(diagnosisObject.summary || '')].filter(Boolean),
    behaviorRules: uniqueStrings(behaviorRules),
    avoidExpressions: problemTypes.includes('AI_TONE') ? ['您好', '亲亲', '为了给您更准确', '我马上帮您核实', '您方便'] : [],
    preferredPatterns: ['先理解客户，再自然回应；只有出现真实信号时才进入经营承接'],
    maxSentences: problemTypes.some((item) => ['REDUNDANT', 'REPETITIVE'].includes(item)) ? 3 : null,
    maxQuestions: problemTypes.includes('TOO_MANY_QUESTIONS') ? 1 : null,
    emojiPolicy: userSuggestion && /(?:不要|不使用|避免|禁用|去掉).{0,4}(?:表情|emoji)/i.test(userSuggestion) ? 'AVOID' : 'AUTO',
    delivery: buildFallbackDeliveryDirectives(problemTypes),
  };
}


function buildFallbackDeliveryDirectives(problemTypes: string[]): CustomerServiceTuningDirectives['delivery'] {
  if (problemTypes.includes('DELIVERY_SHOULD_SPLIT')) {
    return { mode: 'SEQUENTIAL', maxSegments: 2, minDelayMs: 700, maxDelayMs: 1400, splitThresholdChars: 20, cancelRemainingOnCustomerMessage: true };
  }
  if (problemTypes.includes('DELIVERY_SHOULD_MERGE')) {
    return { mode: 'SINGLE', maxSegments: 1, minDelayMs: null, maxDelayMs: null, splitThresholdChars: null, cancelRemainingOnCustomerMessage: true };
  }
  if (problemTypes.includes('DELIVERY_PACING')) {
    return { mode: 'AUTO', maxSegments: 2, minDelayMs: 700, maxDelayMs: 1400, splitThresholdChars: 72, cancelRemainingOnCustomerMessage: true };
  }
  return { mode: null, maxSegments: null, minDelayMs: null, maxDelayMs: null, splitThresholdChars: null, cancelRemainingOnCustomerMessage: null };
}

function completeTuningDirectives(
  primary: CustomerServiceTuningDirectives,
  fallback: CustomerServiceTuningDirectives,
): CustomerServiceTuningDirectives {
  return {
    version: 1,
    goals: primary.goals.length ? primary.goals : fallback.goals,
    behaviorRules: uniqueStrings([
      ...primary.behaviorRules,
      ...fallback.behaviorRules,
      '调优约束只规定判断方向和边界，不固定开头、结尾、句数、表情、段落结构或示例原句。',
      '每次根据客户当下动机、心境、关系和真实信号灵活组织表达；未形成经营机会时允许不销售。',
    ]).slice(0, 30),
    avoidExpressions: primary.avoidExpressions.length ? primary.avoidExpressions : fallback.avoidExpressions,
    preferredPatterns: primary.preferredPatterns.length ? primary.preferredPatterns : fallback.preferredPatterns,
    maxSentences: primary.maxSentences ?? fallback.maxSentences,
    maxQuestions: primary.maxQuestions ?? fallback.maxQuestions,
    emojiPolicy: primary.emojiPolicy !== 'AUTO' ? primary.emojiPolicy : fallback.emojiPolicy,
    delivery: {
      mode: primary.delivery.mode ?? fallback.delivery.mode,
      maxSegments: primary.delivery.maxSegments ?? fallback.delivery.maxSegments,
      minDelayMs: primary.delivery.minDelayMs ?? fallback.delivery.minDelayMs,
      maxDelayMs: primary.delivery.maxDelayMs ?? fallback.delivery.maxDelayMs,
      splitThresholdChars: primary.delivery.splitThresholdChars ?? fallback.delivery.splitThresholdChars,
      cancelRemainingOnCustomerMessage: primary.delivery.cancelRemainingOnCustomerMessage ?? fallback.delivery.cancelRemainingOnCustomerMessage,
    },
  };
}

function mergeExamples(existing: unknown, next: Record<string, unknown>) {
  const values = Array.isArray(existing) ? existing.filter((item) => item && typeof item === 'object') : [];
  return [...values, next].slice(-12);
}

function normalizeAnalysisOutput(
  parsed: Record<string, unknown>,
  fallbackReply: string,
  problemTypes: string[],
  userSuggestion: string | null,
): CalibrationAiOutput {
  const diagnosisSource = asObject(parsed.diagnosis);
  const targetScopes = Array.isArray(parsed.targetScopes)
    ? parsed.targetScopes.filter(
        (scope): scope is string => typeof scope === 'string' && TARGET_SCOPES.includes(scope as (typeof TARGET_SCOPES)[number]),
      )
    : [];
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .filter((item) => item && typeof item === 'object')
        .map((item: Record<string, any>) => ({
          scope: TARGET_SCOPES.includes(item.scope) ? item.scope : 'ROLE_MODULE',
          title: String(item.title || '调整回复表达约束').slice(0, 160),
          change: String(item.change || '').slice(0, 3000),
          priority: item.priority === 'LOW' || item.priority === 'MEDIUM' ? item.priority : 'HIGH',
        }))
        .filter((item) => item.change)
    : [];
  const normalizedRecommendations = recommendations.length
    ? recommendations
    : [{ scope: 'ROLE_MODULE', title: '调整表达风格', change: '减少模板化承接和重复说明，优先直接回应客户当前问题。', priority: 'HIGH' as const }];
  const parsedDirectives = normalizeTuningDirectives(parsed.tuningDirectives);
  const tuningDirectives = completeTuningDirectives(
    parsedDirectives,
    normalizeTuningDirectives(fallbackDirectives(problemTypes, userSuggestion, normalizedRecommendations, diagnosisSource)),
  );

  return {
    diagnosis: {
      summary: String(diagnosisSource.summary || '当前回复与商家预期不一致').slice(0, 2000),
      rootCause: String(diagnosisSource.rootCause || '需要进一步校准角色表达和回复约束').slice(0, 3000),
      evidence: Array.isArray(diagnosisSource.evidence) ? diagnosisSource.evidence.map(String).slice(0, 12) : [],
    },
    targetScopes: targetScopes.length ? targetScopes : ['ROLE_MODULE', 'QUALITY_RULE'],
    recommendations: normalizedRecommendations,
    tuningDirectives,
    suggestedReply: String(parsed.suggestedReply || fallbackReply).trim().slice(0, 12000),
    rationale: String(parsed.rationale || '').slice(0, 3000),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.6)),
  };
}

function summarizeModelAttempt(result: {
  ok: boolean;
  status: string;
  model: string | null;
  requestId: string | null;
  finishReason: string | null;
  truncated: boolean;
  elapsedMs: number;
  errorMessage: string | null;
}) {
  return {
    ok: result.ok,
    status: result.status,
    model: result.model,
    requestId: result.requestId,
    finishReason: result.finishReason,
    truncated: result.truncated,
    elapsedMs: result.elapsedMs,
    errorMessage: result.errorMessage,
  };
}

function parseKnowledgeWindow(from?: string, to?: string) {
  const effectiveFrom = from ? new Date(from) : null;
  const effectiveTo = to ? new Date(to) : null;
  if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('生效时间格式不正确');
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) throw new BadRequestException('失效时间格式不正确');
  if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('失效时间必须晚于生效时间');
  return { effectiveFrom, effectiveTo };
}
