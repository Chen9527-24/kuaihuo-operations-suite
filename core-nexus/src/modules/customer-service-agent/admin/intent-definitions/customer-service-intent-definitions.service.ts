import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceIntentDefinitionRepository } from '../../infrastructure/persistence/customer-service-intent-definition.repository';
import { CustomerServiceIntentCandidateRepository } from '../../infrastructure/persistence/customer-service-intent-candidate.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { CreateCustomerServiceIntentDefinitionDto } from './dto/create-intent-definition.dto';
import { CustomerServiceIntentDefinitionQueryDto } from './dto/intent-definition-query.dto';
import { UpdateCustomerServiceIntentDefinitionDto } from './dto/update-intent-definition.dto';
import { CreateIntentFromRecognitionDto } from './dto/create-intent-from-recognition.dto';

@Injectable()
export class CustomerServiceIntentDefinitionsService {
  constructor(
    private readonly repository: CustomerServiceIntentDefinitionRepository,
    private readonly candidateRepository: CustomerServiceIntentCandidateRepository,
  ) {}

  async list(query: CustomerServiceIntentDefinitionQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceIntentDefinitionWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.scenario ? { scenario: query.scenario } : {}),
      ...(query.keyword
        ? {
            OR: [
              { key: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { description: { contains: query.keyword, mode: 'insensitive' } },
              { scenario: { contains: query.keyword, mode: 'insensitive' } },
              { primaryIntent: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.list(where, skip, take),
      this.repository.count(where),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('客户意图不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceIntentDefinitionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    validateIntentStrategyConfig(dto.strategyConfig);
    try {
      return await this.repository.create({
        tenantId,
        key: normalizeCustomerServiceKey(dto.key),
        name: dto.name.trim(),
        category: normalizeEnum(dto.category),
        description: dto.description?.trim() || null,
        scenario: normalizeEnum(dto.scenario),
        primaryIntent: normalizeEnum(dto.primaryIntent),
        defaultRiskLevel: normalizeEnum(dto.defaultRiskLevel || 'LOW'),
        supportedIndustryCodes: normalizeCodes(dto.supportedIndustryCodes),
        recognitionConfig: dto.recognitionConfig as Prisma.InputJsonValue,
        strategyConfig: dto.strategyConfig as Prisma.InputJsonValue,
        flowConfig: dto.flowConfig as Prisma.InputJsonValue,
        replyConfig: dto.replyConfig as Prisma.InputJsonValue,
        ...(dto.examples ? { examples: dto.examples as Prisma.InputJsonValue } : {}),
        priority: dto.priority ?? 100,
        sort: dto.sort ?? 0,
        status: dto.status ?? 'ENABLED',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同客户意图编码');
      }
      throw error;
    }
  }


  async createFromRecognition(dto: CreateIntentFromRecognitionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const item = asRecord(dto.recognizedItem);
    const type = String(item.type || '').trim().toUpperCase();
    if (type !== 'INTENT') throw new BadRequestException('只有识别结果中的客户意图可以作为意图加入');

    const matchedDefinition = asRecord(item.matchedDefinition);
    if (String(item.matchStatus || '').toUpperCase() === 'EXACT' && matchedDefinition.id) {
      throw new ConflictException('该识别意图已经精确关联正式意图，无需重复创建');
    }

    const name = String(item.name || '').trim().slice(0, 160);
    if (!name) throw new BadRequestException('识别意图缺少名称');
    const scenario = normalizeEnum(String(item.suggestedScenario || 'GENERAL_INQUIRY'));
    const primaryIntent = normalizeEnum(String(item.suggestedPrimaryIntent || 'ASK_INFORMATION'));
    const category = normalizeEnum(String(item.suggestedCategory || inferCategory(scenario)));
    const riskLevel = normalizeRisk(item.suggestedRiskLevel);
    const key = buildRecognitionIntentKey(item, scenario, primaryIntent);
    const existing = await this.repository.findByKey(tenantId, key);
    if (existing) throw new ConflictException(`意图编码 ${key} 已存在，请在客户意图与流程中编辑现有数据`);

    const evidence = stringArray(item.evidence, 12);
    const conversationHistory = normalizeConversation(dto.conversationHistory);
    const understanding = asRecord(dto.understanding);
    const humanContext = asRecord(understanding.humanContext);
    const interactionStrategy = asRecord(humanContext.interactionStrategy);
    const emotionStrategy = asRecord(humanContext.emotionStrategy);
    const positiveExamples = [...new Set([dto.message.trim(), ...conversationHistory.filter((entry) => entry.role === 'CUSTOMER').map((entry) => entry.content)])].filter(Boolean).slice(-8);

    try {
      return await this.repository.create({
        tenantId,
        key,
        name,
        category,
        description: String(item.description || `从真实调优对话识别出的“${name}”客户意图。`).trim().slice(0, 2000),
        scenario,
        primaryIntent,
        defaultRiskLevel: riskLevel,
        supportedIndustryCodes: normalizeCodes(dto.industryCodes?.length ? dto.industryCodes : dto.industryCode?.trim() ? [dto.industryCode] : []),
        recognitionConfig: {
          source: 'REPLY_TUNING_RECOGNITION',
          sourceRecognitionId: String(item.recognitionId || ''),
          confidence: clampNumber(item.confidence, 0.65, 0, 1),
          positiveSignals: evidence,
          negativeSignals: [],
          contextSignals: buildContextSignals(humanContext, interactionStrategy),
          confidenceThreshold: Math.max(0.55, Math.min(0.9, clampNumber(item.confidence, 0.65, 0, 1) - 0.08)),
          reviewRequired: true,
          sourceSnapshot: {
            merchantRoleId: dto.merchantRoleId || null,
            industryNodeId: dto.industryNodeId || null,
            message: dto.message.trim(),
            recognizedItem: item,
          },
        } as Prisma.InputJsonValue,
        strategyConfig: {
          serviceGoal: inferServiceGoal(name, scenario, humanContext),
          relationshipGoal: inferRelationshipGoal(humanContext),
          optionalBusinessGoal: null,
          emotionalPosture: String(emotionStrategy.posture || 'WARM_PROFESSIONAL'),
          salesVisibility: inferSalesVisibility(humanContext, scenario),
          questionBudget: inferQuestionBudget(interactionStrategy),
          informationBudget: 3,
          rules: stringArray(emotionStrategy.guidance, 8),
          uncertainties: stringArray(humanContext.uncertainties, 8),
        } as Prisma.InputJsonValue,
        flowConfig: {
          phase: String(interactionStrategy.phase || 'SERVICE'),
          firstMove: String(interactionStrategy.firstMove || 'CLARIFY_NEED'),
          commercialTiming: String(interactionStrategy.commercialTiming || 'HOLD'),
          steps: buildSuggestedFlow(interactionStrategy, scenario),
          stopConditions: buildStopConditions(scenario),
        } as Prisma.InputJsonValue,
        replyConfig: {
          requiredPoints: stringArray(humanContext.valueOpportunities, 8),
          forbiddenExpressions: stringArray(emotionStrategy.forbiddenTone, 8),
          styleGuidance: stringArray(emotionStrategy.guidance, 8),
          generationPrinciples: [
            '根据当前多轮上下文重新判断，不固定复用本次示例原句。',
            '意图定义只提供处理方向；客户后续表达变化时必须允许重新分类。',
            '先完成客户当前价值，再判断是否存在自然经营机会。',
          ],
        } as Prisma.InputJsonValue,
        examples: {
          positive: positiveExamples,
          negative: [],
          boundary: [],
          multiTurn: conversationHistory.length ? [{ messages: conversationHistory, latestMessage: dto.message.trim() }] : [],
          sourceUnderstanding: understanding,
        } as Prisma.InputJsonValue,
        priority: Math.round(clampNumber(item.confidence, 0.65, 0, 1) * 100),
        sort: 0,
        status: dto.status || 'DRAFT',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同客户意图编码');
      }
      throw error;
    }
  }

  async createFromCandidate(candidateId: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const candidate = await this.candidateRepository.findScoped(candidateId, tenantId);
    if (!candidate) throw new NotFoundException('已识别意图不存在');
    if (candidate.status === 'CONVERTED' && candidate.convertedDefinitionId) {
      throw new ConflictException('该识别意图已经生成过正式意图草稿');
    }

    const sourceContext = asRecord(candidate.sourceContext);
    const latestUnderstanding = asRecord(sourceContext.latestUnderstanding);
    const samples = jsonObjectArray(candidate.samples);
    const latestSample = samples[samples.length - 1] || {};
    const conversationHistory = Array.isArray(latestSample.conversationHistory)
      ? latestSample.conversationHistory as Array<Record<string, unknown>>
      : [];
    const recognizedItem = {
      recognitionId: `candidate:${candidate.id}`,
      type: 'INTENT',
      key: candidate.recognitionKey,
      name: candidate.name,
      description: candidate.description,
      confidence: candidate.latestConfidence,
      evidence: jsonStringArray(candidate.evidence),
      isPrimary: true,
      suggestedCategory: candidate.suggestedCategory,
      suggestedScenario: candidate.suggestedScenario,
      suggestedPrimaryIntent: candidate.suggestedPrimaryIntent,
      suggestedRiskLevel: candidate.suggestedRiskLevel,
      matchStatus: candidate.relatedDefinitionId ? 'RELATED' : 'UNMATCHED',
      matchedDefinition: candidate.relatedDefinitionId ? { id: candidate.relatedDefinitionId } : null,
    };
    const created = await this.createFromRecognition({
      recognizedItem,
      message: String(latestSample.message || '').trim() || candidate.name,
      conversationHistory,
      merchantRoleId: String(sourceContext.merchantRoleId || '') || undefined,
      industryNodeId: String(sourceContext.industryNodeId || '') || undefined,
      industryCode: candidate.suggestedCategory === 'RELATIONSHIP' ? undefined : candidate.observedIndustryCodes[0] || String(sourceContext.industryCode || '') || undefined,
      industryCodes: candidate.suggestedCategory === 'RELATIONSHIP' ? [] : candidate.observedIndustryCodes,
      understanding: latestUnderstanding,
      status: 'DRAFT',
    }, user);
    await this.candidateRepository.markConverted(candidate.id, tenantId, created.id);
    return { definition: created, candidateId: candidate.id };
  }

  async update(id: string, dto: UpdateCustomerServiceIntentDefinitionDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    if (dto.strategyConfig !== undefined) validateIntentStrategyConfig(dto.strategyConfig);
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.category !== undefined ? { category: normalizeEnum(dto.category) } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.scenario !== undefined ? { scenario: normalizeEnum(dto.scenario) } : {}),
      ...(dto.primaryIntent !== undefined ? { primaryIntent: normalizeEnum(dto.primaryIntent) } : {}),
      ...(dto.defaultRiskLevel !== undefined ? { defaultRiskLevel: normalizeEnum(dto.defaultRiskLevel) } : {}),
      ...(dto.supportedIndustryCodes !== undefined ? { supportedIndustryCodes: normalizeCodes(dto.supportedIndustryCodes) } : {}),
      ...(dto.recognitionConfig !== undefined ? { recognitionConfig: dto.recognitionConfig as Prisma.InputJsonValue } : {}),
      ...(dto.strategyConfig !== undefined ? { strategyConfig: dto.strategyConfig as Prisma.InputJsonValue } : {}),
      ...(dto.flowConfig !== undefined ? { flowConfig: dto.flowConfig as Prisma.InputJsonValue } : {}),
      ...(dto.replyConfig !== undefined ? { replyConfig: dto.replyConfig as Prisma.InputJsonValue } : {}),
      ...(dto.examples !== undefined ? { examples: dto.examples as Prisma.InputJsonValue } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('客户意图已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }
}


function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function validateIntentStrategyConfig(value: unknown) {
  const strategy = asRecord(value);
  if (!Object.prototype.hasOwnProperty.call(strategy, 'strategyPolicy')) return;
  if (!strategy.strategyPolicy || typeof strategy.strategyPolicy !== 'object' || Array.isArray(strategy.strategyPolicy)) {
    throw new BadRequestException('意图 strategyPolicy 必须是对象。');
  }
  const policy = asRecord(strategy.strategyPolicy);
  if (policy.mode !== undefined && !['INHERIT', 'INHERIT_AND_OVERRIDE', 'INDEPENDENT'].includes(String(policy.mode))) {
    throw new BadRequestException('意图策略继承模式不合法。');
  }
  for (const key of ['inheritRoleCommon', 'inheritScenarioCommon']) {
    if (policy[key] !== undefined && typeof policy[key] !== 'boolean') {
      throw new BadRequestException(`${key} 必须是布尔值。`);
    }
  }
  if (policy.disabledGroupKeys !== undefined && !isUniqueNonEmptyStringArray(policy.disabledGroupKeys)) {
    throw new BadRequestException('disabledGroupKeys 必须是不重复的非空字符串数组。');
  }
  if (policy.overrides !== undefined && (!policy.overrides || typeof policy.overrides !== 'object' || Array.isArray(policy.overrides))) {
    throw new BadRequestException('意图策略 overrides 必须是对象。');
  }
  if (policy.bindings !== undefined) {
    if (!Array.isArray(policy.bindings)) throw new BadRequestException('意图策略 bindings 必须是数组。');
    const keys = new Set<string>();
    for (const binding of policy.bindings) {
      const item = asRecord(binding);
      const key = String(item.key || '').trim();
      if (!key) throw new BadRequestException('每个意图策略关联必须提供非空 key。');
      if (keys.has(key)) throw new BadRequestException(`意图策略配置组 ${key} 重复关联。`);
      keys.add(key);
      if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
        throw new BadRequestException(`意图策略配置组 ${key} 的 enabled 必须是布尔值。`);
      }
      if (item.overrides !== undefined && (!item.overrides || typeof item.overrides !== 'object' || Array.isArray(item.overrides))) {
        throw new BadRequestException(`意图策略配置组 ${key} 的 overrides 必须是对象。`);
      }
    }
  }
}

function isUniqueNonEmptyStringArray(value: unknown) {
  if (!Array.isArray(value)) return false;
  const normalized = value.map((item) => String(item || '').trim());
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

function jsonObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit) : [];
}

function normalizeConversation(value?: Array<Record<string, unknown>>) {
  return (value ?? []).map((entry) => ({
    role: String(entry.role || '').toUpperCase() === 'ASSISTANT' ? 'ASSISTANT' : 'CUSTOMER',
    content: String(entry.content || '').trim().slice(0, 4000),
  })).filter((entry) => entry.content).slice(-20);
}

function buildRecognitionIntentKey(item: Record<string, unknown>, scenario: string, primaryIntent: string) {
  const suggested = String(item.key || '').trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9.-]/g, '').replace(/^-+|-+$/g, '');
  if (suggested.length >= 2) return suggested.slice(0, 100);
  return `${scenario.toLowerCase().replace(/_/g, '-')}-${primaryIntent.toLowerCase().replace(/_/g, '-')}`.slice(0, 100);
}

function normalizeRisk(value: unknown) {
  const normalized = String(value || 'LOW').trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized) ? normalized : 'LOW';
}

function inferCategory(scenario: string) {
  if (scenario === 'CASUAL_CHAT') return 'RELATIONSHIP';
  if (['PRODUCT_CONSULT', 'PRODUCT_COMPARE', 'PRICE_HESITATION'].includes(scenario)) return 'PRE_SALE';
  if (scenario === 'ORDER_STATUS') return 'ORDER';
  if (scenario === 'LOGISTICS_DELAY') return 'LOGISTICS';
  if (['AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION'].includes(scenario)) return 'AFTER_SALE';
  return 'SAFETY';
}

function buildContextSignals(humanContext: Record<string, unknown>, interactionStrategy: Record<string, unknown>) {
  return [
    humanContext.primaryMotive ? `主要动机=${String(humanContext.primaryMotive)}` : null,
    humanContext.mindset ? `心境=${String(humanContext.mindset)}` : null,
    humanContext.relationshipState ? `关系状态=${String(humanContext.relationshipState)}` : null,
    interactionStrategy.phase ? `对话阶段=${String(interactionStrategy.phase)}` : null,
  ].filter((item): item is string => Boolean(item));
}

function inferServiceGoal(name: string, scenario: string, humanContext: Record<string, unknown>) {
  const stated = stringArray(humanContext.statedNeeds, 3);
  return stated[0] || `识别并妥善处理“${name}”意图（场景 ${scenario}）。`;
}

function inferRelationshipGoal(humanContext: Record<string, unknown>) {
  const state = String(humanContext.relationshipState || 'FORMAL');
  if (state === 'STRAINED') return '先修复信任，避免辩解和销售。';
  if (state === 'FAMILIAR') return '保持熟悉感，但不虚构共同经历或越界亲昵。';
  if (state === 'OPEN') return '自然靠近并保留客户选择空间。';
  return '保持礼貌、自然和有边界的关系感。';
}

function inferSalesVisibility(humanContext: Record<string, unknown>, scenario: string) {
  if (['AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION', 'LOGISTICS_DELAY', 'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE'].includes(scenario)) return 'S0';
  const openness = String(humanContext.commercialOpenness || 'UNKNOWN');
  return openness === 'EXPLICIT' ? 'S3' : openness === 'ACTIVE' ? 'S2' : openness === 'LATENT' ? 'S1' : 'S0';
}

function inferQuestionBudget(interactionStrategy: Record<string, unknown>) {
  return String(interactionStrategy.firstMove || '') === 'INVITE_SHARING' || String(interactionStrategy.firstMove || '') === 'CLARIFY_NEED' ? 1 : 0;
}

function buildSuggestedFlow(interactionStrategy: Record<string, unknown>, scenario: string) {
  const firstMove = String(interactionStrategy.firstMove || 'CLARIFY_NEED');
  const base = [
    { code: 'READ_CONTEXT', name: '读取多轮上下文并确认当前阶段', required: true },
    { code: firstMove, name: firstMoveName(firstMove), required: true },
  ];
  if (['AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION', 'LOGISTICS_DELAY', 'ORDER_STATUS'].includes(scenario)) {
    base.push({ code: 'VERIFY_FACTS', name: '查询并核验业务事实', required: true });
    base.push({ code: 'PROVIDE_NEXT_STEP', name: '给出明确处理结果或下一节点', required: true });
  } else {
    base.push({ code: 'REASSESS_AFTER_REPLY', name: '客户继续表达后重新识别，不沿用旧结论', required: true });
  }
  return base;
}

function firstMoveName(value: string) {
  const labels: Record<string, string> = {
    INVITE_SHARING: '自然邀请客户分享', DISCOVER_CONTEXT: '主动探索生活场景', RESPOND_TO_SHARED_CONTEXT: '先回应客户已分享内容',
    CLARIFY_NEED: '确认真正需要', SOLVE_CURRENT_ISSUE: '先处理当前问题', SUPPORT_DECISION: '帮助客户做判断',
    REPAIR_RELATIONSHIP: '先修复关系与信任', CONFIRM_OR_CLOSE: '确认结果或自然收束',
  };
  return labels[value] || value;
}

function buildStopConditions(scenario: string) {
  const common = ['客户切换到新意图时重新识别', '置信度不足时保留不确定性'];
  if (['AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION'].includes(scenario)) common.push('问题未解决前禁止销售');
  return common;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.min(max, Math.max(min, normalized)) : fallback;
}

function normalizeEnum(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function normalizeCodes(value?: string[]) {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))];
}
