import { Injectable } from '@nestjs/common';
import type { CustomerServiceIntentGuidance } from '../planning/customer-service-reply-planner.service';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import { resolveCustomerServiceReplyExperiencePreferences } from '../../shared/context/customer-service-account-runtime-preferences.util';
import type {
  CustomerServiceResolvedStrategyPolicy,
  CustomerServiceStrategyGroupContent,
  CustomerServiceStrategyInheritanceMode,
  CustomerServiceStrategyPolicySource,
  CustomerServiceStrategyPolicyValue,
} from './types/customer-service-strategy-policy.type';

type PublishedStrategyGroup = {
  asset: { id: string; key: string; name: string };
  version: { id: string; versionNo: number; content: unknown; contentHash: string };
};

type CompileInput = {
  roleCode: string;
  accountProfileId: string | null;
  storeProfile?: { profile?: unknown } | null;
  accountProfile?: { profile?: unknown } | null;
  industryCode: string | null;
  understanding: CustomerServiceMessageUnderstanding;
  intentGuidance: CustomerServiceIntentGuidance[];
  groups: PublishedStrategyGroup[];
};

const DEFAULT_POLICY: CustomerServiceStrategyPolicyValue = {
  tone: { warmth: null, playfulness: null, formality: null, directness: null, emotionalIntensity: null },
  wording: {
    tildePolicy: 'ALLOWED',
    emojiPolicy: 'AUTO',
    emojiLimit: 10,
    sentenceParticleFrequency: 'MEDIUM',
    forbiddenExpressions: [],
    cautiousExpressions: [],
    preferredExpressions: [],
    forbiddenSentenceParticles: [],
    semanticChecks: [],
  },
  structure: {
    maxQuestions: null,
    maxCoreMoves: null,
    maxGuesses: null,
    maxSentences: null,
    allowChoiceQuestions: true,
    requireAcknowledgeBeforeQuestion: false,
  },
  service: { salesVisibility: null, productMentionPolicy: null, firstMove: null, stopConditions: [] },
  delivery: { mode: 'AUTO', maxSegments: 4, minDelayMs: 700, maxDelayMs: 1400, splitThresholdChars: 72, cancelRemainingOnCustomerMessage: true },
};

@Injectable()
export class CustomerServiceStrategyPolicyCompiler {
  compile(input: CompileInput): CustomerServiceResolvedStrategyPolicy {
    const intent = input.intentGuidance[0] ?? null;
    const strategyConfig = asRecord(intent?.strategyConfig);
    const replyConfig = asRecord(intent?.replyConfig);
    const config = asRecord(strategyConfig.strategyPolicy);
    const mode = normalizeMode(config.mode);
    const inheritRoleCommon = mode !== 'INDEPENDENT' && config.inheritRoleCommon !== false;
    const inheritScenarioCommon = mode !== 'INDEPENDENT' && config.inheritScenarioCommon !== false;
    const bindingRecords = objectArray(config.bindings);
    const disabledBindingKeys = bindingRecords
      .filter((item) => item.enabled === false)
      .map((item) => String(item.key || '').trim())
      .filter(Boolean);
    const disabledGroupKeys = unique([...stringArray(config.disabledGroupKeys), ...disabledBindingKeys]);
    const bindings = bindingRecords.filter((item) => item.enabled !== false);
    const bindingKeys = new Set(bindings.map((item) => String(item.key || '').trim()).filter(Boolean));
    const hasExplicitStrategyPolicy = hasExplicitPolicyConfiguration(config);
    const selected = input.groups
      .map((group) => ({ group, content: normalizeGroup(group.version.content) }))
      .filter((item): item is { group: PublishedStrategyGroup; content: CustomerServiceStrategyGroupContent } => Boolean(item.content))
      .filter(({ group, content }) => {
        if (disabledGroupKeys.includes(group.asset.key)) return false;
        if (bindingKeys.has(group.asset.key)) return matchesExplicitBinding(content, input);
        if (!matchesAppliesTo(content, input, intent)) return false;
        if (content.enabledByDefault === false) return false;
        if (content.scopeType === 'ROLE_GLOBAL') return inheritRoleCommon;
        if (content.scopeType === 'SCENARIO') return inheritScenarioCommon;
        return false;
      })
      .sort((a, b) => (a.content.priority ?? 100) - (b.content.priority ?? 100) || a.group.asset.key.localeCompare(b.group.asset.key));

    const resolved = clonePolicy(DEFAULT_POLICY);
    const sources: CustomerServiceStrategyPolicySource[] = [];
    const conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'] = [];

    for (const { group, content } of selected) {
      applyPolicy(resolved, content.policy, conflicts, group.asset.key);
      const explicit = bindingKeys.has(group.asset.key);
      sources.push({
        sourceType: explicit ? 'INTENT_GROUP' : content.scopeType === 'ROLE_GLOBAL' ? 'ROLE_COMMON' : 'SCENARIO_COMMON',
        key: group.asset.key,
        name: group.asset.name,
        assetId: group.asset.id,
        versionId: group.version.id,
        versionNo: group.version.versionNo,
        contentHash: group.version.contentHash,
        priority: content.priority ?? 100,
      });
      const binding = bindings.find((item) => String(item.key || '').trim() === group.asset.key);
      const overrides = asRecord(binding?.overrides);
      if (Object.keys(overrides).length) {
        applyPolicy(resolved, overrides, conflicts, `${group.asset.key}:binding-override`);
        sources.push({
          sourceType: 'INTENT_OVERRIDE',
          key: `${group.asset.key}:binding-override`,
          name: `${group.asset.name}·关联局部覆盖`,
          assetId: group.asset.id,
          versionId: group.version.id,
          versionNo: group.version.versionNo,
          contentHash: group.version.contentHash,
          priority: (content.priority ?? 100) + 1,
        });
      }
    }

    const profileReplyExperience = resolveCustomerServiceReplyExperiencePreferences({
      storeProfile: input.storeProfile,
      accountProfile: input.accountProfile,
    });
    if (profileReplyExperience.configured) {
      applyPolicy(resolved, profileReplyExperience.policy, conflicts, `${profileReplyExperience.source.toLowerCase()}:reply-experience`);
      sources.push({
        sourceType: profileReplyExperience.source as 'STORE_PROFILE' | 'ACCOUNT_PROFILE',
        key: `${profileReplyExperience.source.toLowerCase()}:reply-experience`,
        name: profileReplyExperience.source === 'ACCOUNT_PROFILE' ? '账号回复长度与发送方式' : '店铺默认回复长度与发送方式',
        priority: 700,
      });
    }

    const legacy = legacyIntentPolicy(strategyConfig, replyConfig);
    if (legacy && !hasExplicitStrategyPolicy) {
      applyPolicy(resolved, legacy, conflicts, intent?.key || 'intent-legacy');
      sources.push({ sourceType: 'INTENT_LEGACY', key: intent?.key || 'intent-legacy', name: '意图现有策略兼容层', priority: 800 });
    }

    const localOverrides = asRecord(config.overrides);
    if (mode !== 'INHERIT' && Object.keys(localOverrides).length) {
      applyPolicy(resolved, localOverrides, conflicts, `${intent?.key || 'intent'}:override`);
      sources.push({ sourceType: 'INTENT_OVERRIDE', key: `${intent?.key || 'intent'}:override`, name: '意图局部覆盖', priority: 900 });
    }

    const dynamic = dynamicSafetyPolicy(input.understanding);
    if (dynamic) {
      applyPolicy(resolved, dynamic, conflicts, 'dynamic-safety');
      sources.push({ sourceType: 'DYNAMIC_SAFETY', key: 'dynamic-safety', name: '事件、状态与风险动态收紧', priority: 1000 });
    }

    const availableGroupKeys = new Set(input.groups.map((item) => item.asset.key));
    for (const key of bindingKeys) {
      if (sources.some((item) => item.key === key || item.key === `${key}:binding-override`)) continue;
      conflicts.push({
        kind: availableGroupKeys.has(key) ? 'NOT_APPLICABLE' : 'MISSING_BINDING',
        path: `bindings.${key}`,
        previous: null,
        next: availableGroupKeys.has(key) ? 'NOT_APPLICABLE' : 'MISSING_OR_UNPUBLISHED',
        sourceKey: key,
        resolution: availableGroupKeys.has(key)
          ? '关联配置组不适用于当前角色、行业或风险级别，未加载。'
          : '关联配置组不存在、未发布或已被归档，未加载。',
      });
    }

    return {
      schemaVersion: 1,
      inheritance: { mode, inheritRoleCommon, inheritScenarioCommon, disabledGroupKeys },
      resolved,
      sources,
      conflicts,
      legacyCompatibility: { calibrationAdvisoryOnly: true, intentJsonMigratedAtRuntime: Boolean(legacy && !hasExplicitStrategyPolicy) },
    };
  }
}

function normalizeGroup(value: unknown): CustomerServiceStrategyGroupContent | null {
  const record = asRecord(value);
  if (Number(record.schemaVersion) !== 1) return null;
  if (!['ROLE_GLOBAL', 'SCENARIO', 'INTENT'].includes(String(record.scopeType || ''))) return null;
  const policy = asRecord(record.policy);
  return {
    schemaVersion: 1,
    scopeType: record.scopeType as CustomerServiceStrategyGroupContent['scopeType'],
    enabledByDefault: record.enabledByDefault !== false,
    priority: numberOr(record.priority, 100),
    appliesTo: asRecord(record.appliesTo) as CustomerServiceStrategyGroupContent['appliesTo'],
    policy: policy as CustomerServiceStrategyGroupContent['policy'],
  };
}

function matchesAppliesTo(content: CustomerServiceStrategyGroupContent, input: CompileInput, intent: CustomerServiceIntentGuidance | null) {
  const applies = content.appliesTo || {};
  return matchesOptional(applies.roleCodes, input.roleCode)
    && matchesOptional(applies.accountProfileIds, input.accountProfileId || '')
    && matchesOptional(applies.scenarios, input.understanding.primaryScenario)
    && matchesOptional(applies.intentKeys, intent?.key || '')
    && matchesOptional(applies.intents, input.understanding.primaryIntent)
    && matchesOptional(applies.industryCodes, input.industryCode || '')
    && matchesOptional(applies.riskLevels, input.understanding.riskLevel);
}

function matchesExplicitBinding(content: CustomerServiceStrategyGroupContent, input: CompileInput) {
  const applies = content.appliesTo || {};
  return matchesOptional(applies.roleCodes, input.roleCode)
    && matchesOptional(applies.accountProfileIds, input.accountProfileId || '')
    && matchesOptional(applies.industryCodes, input.industryCode || '')
    && matchesOptional(applies.riskLevels, input.understanding.riskLevel);
}

function matchesOptional(values: string[] | undefined, value: string) {
  const normalized = stringArray(values);
  return !normalized.length || normalized.includes(value);
}

function legacyIntentPolicy(strategy: Record<string, unknown>, reply: Record<string, unknown>) {
  const questionBudget = finiteNumber(strategy.questionBudget);
  const emotionalPosture = String(strategy.emotionalPosture || '');
  const playfulness = /PLAYFUL/.test(emotionalPosture) ? 25 : /SERIOUS|ACCOUNTABLE|CAUTIOUS/.test(emotionalPosture) ? 0 : null;
  const forbiddenExpressions = stringArray(reply.forbiddenExpressions);
  const styleGuidance = stringArray(reply.styleGuidance);
  const rules = stringArray(strategy.rules);
  if (questionBudget === null && playfulness === null && !forbiddenExpressions.length && !styleGuidance.length && !rules.length) return null;
  return {
    tone: { playfulness },
    wording: { forbiddenExpressions, cautiousExpressions: [...styleGuidance, ...rules] },
    structure: { maxQuestions: questionBudget },
    service: {
      salesVisibility: normalizeSalesVisibility(strategy.salesVisibility),
    },
  };
}

function dynamicSafetyPolicy(understanding: CustomerServiceMessageUnderstanding) {
  const seriousScenario = ['LOGISTICS_DELAY', 'AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION', 'SECURITY_SENSITIVE', 'SAFETY_SENSITIVE'].includes(understanding.primaryScenario);
  const elevatedRisk = ['HIGH', 'CRITICAL'].includes(understanding.riskLevel);
  const strained = understanding.humanContext.relationshipState === 'STRAINED';
  if (!seriousScenario && !elevatedRisk && !strained) return null;
  return {
    tone: { playfulness: 0, formality: seriousScenario ? 65 : null },
    wording: { tildePolicy: 'FORBIDDEN', emojiPolicy: 'FORBIDDEN', emojiLimit: 0, sentenceParticleFrequency: 'NONE' },
    structure: { maxQuestions: 1, maxGuesses: 0, allowChoiceQuestions: false },
    service: { salesVisibility: 'S0', productMentionPolicy: 'PROHIBITED' },
  };
}

function applyPolicy(
  target: CustomerServiceStrategyPolicyValue,
  sourceValue: unknown,
  conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'],
  sourceKey: string,
) {
  const source = asRecord(sourceValue);
  mergeTone(target, asRecord(source.tone), conflicts, sourceKey);
  mergeWording(target, asRecord(source.wording), conflicts, sourceKey);
  mergeStructure(target, asRecord(source.structure), conflicts, sourceKey);
  mergeService(target, asRecord(source.service), conflicts, sourceKey);
  mergeDelivery(target, asRecord(source.delivery), conflicts, sourceKey);
}

function mergeTone(target: CustomerServiceStrategyPolicyValue, source: Record<string, unknown>, conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'], sourceKey: string) {
  for (const key of ['warmth', 'playfulness', 'formality', 'directness', 'emotionalIntensity'] as const) {
    const value = finiteNumber(source[key]);
    if (value === null) continue;
    assign(target.tone, key, clamp(value, 0, 100), conflicts, `tone.${key}`, sourceKey, '后层覆盖前层');
  }
}

function mergeWording(target: CustomerServiceStrategyPolicyValue, source: Record<string, unknown>, conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'], sourceKey: string) {
  if (['FORBIDDEN', 'FOLLOW_CUSTOMER', 'ALLOWED'].includes(String(source.tildePolicy))) assign(target.wording, 'tildePolicy', source.tildePolicy as any, conflicts, 'wording.tildePolicy', sourceKey, '后层覆盖前层');
  if (['FORBIDDEN', 'LIMITED', 'FOLLOW_CUSTOMER', 'AUTO'].includes(String(source.emojiPolicy))) assign(target.wording, 'emojiPolicy', source.emojiPolicy as any, conflicts, 'wording.emojiPolicy', sourceKey, '后层覆盖前层');
  const emojiLimit = finiteNumber(source.emojiLimit);
  if (emojiLimit !== null) target.wording.emojiLimit = Math.min(target.wording.emojiLimit, clamp(emojiLimit, 0, 10));
  if (['NONE', 'LOW', 'MEDIUM'].includes(String(source.sentenceParticleFrequency))) assign(target.wording, 'sentenceParticleFrequency', source.sentenceParticleFrequency as any, conflicts, 'wording.sentenceParticleFrequency', sourceKey, '后层覆盖前层');
  for (const key of ['forbiddenExpressions', 'cautiousExpressions', 'preferredExpressions', 'forbiddenSentenceParticles', 'semanticChecks'] as const) {
    target.wording[key] = unique([...target.wording[key], ...stringArray(source[key])]);
  }
}

function mergeStructure(target: CustomerServiceStrategyPolicyValue, source: Record<string, unknown>, conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'], sourceKey: string) {
  for (const key of ['maxQuestions', 'maxCoreMoves', 'maxGuesses', 'maxSentences'] as const) {
    const value = finiteNumber(source[key]);
    if (value === null) continue;
    const normalized = clamp(value, key === 'maxCoreMoves' || key === 'maxSentences' ? 1 : 0, 20);
    const current = target.structure[key];
    target.structure[key] = current === null ? normalized : Math.min(current, normalized);
  }
  if (typeof source.allowChoiceQuestions === 'boolean') {
    const previous = target.structure.allowChoiceQuestions;
    const next = previous && source.allowChoiceQuestions;
    if (previous !== next) conflicts.push({ kind: 'TIGHTENED', path: 'structure.allowChoiceQuestions', previous, next, sourceKey, resolution: '禁止选择题属于更严格结构约束，任一来源禁止即禁止' });
    target.structure.allowChoiceQuestions = next;
  }
  if (typeof source.requireAcknowledgeBeforeQuestion === 'boolean') {
    const previous = target.structure.requireAcknowledgeBeforeQuestion;
    const next = previous || source.requireAcknowledgeBeforeQuestion;
    if (previous !== next) conflicts.push({ kind: 'TIGHTENED', path: 'structure.requireAcknowledgeBeforeQuestion', previous, next, sourceKey, resolution: '先承接再提问属于更严格结构约束，任一来源要求即生效' });
    target.structure.requireAcknowledgeBeforeQuestion = next;
  }
}

function mergeService(target: CustomerServiceStrategyPolicyValue, source: Record<string, unknown>, conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'], sourceKey: string) {
  const visibility = normalizeSalesVisibility(source.salesVisibility);
  if (visibility) {
    const current = target.service.salesVisibility;
    target.service.salesVisibility = current ? moreRestrictiveVisibility(current, visibility) : visibility;
  }
  const product = normalizeProductPolicy(source.productMentionPolicy);
  if (product) {
    const current = target.service.productMentionPolicy;
    target.service.productMentionPolicy = current ? moreRestrictiveProductPolicy(current, product) : product;
  }
  if (typeof source.firstMove === 'string' && source.firstMove.trim()) assign(target.service, 'firstMove', source.firstMove.trim(), conflicts, 'service.firstMove', sourceKey, '后层覆盖前层');
  target.service.stopConditions = unique([...target.service.stopConditions, ...stringArray(source.stopConditions)]);
}


function mergeDelivery(target: CustomerServiceStrategyPolicyValue, source: Record<string, unknown>, conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'], sourceKey: string) {
  if (['AUTO', 'SINGLE', 'SEQUENTIAL'].includes(String(source.mode))) {
    assign(target.delivery, 'mode', source.mode as CustomerServiceStrategyPolicyValue['delivery']['mode'], conflicts, 'delivery.mode', sourceKey, '后层覆盖前层');
  }
  for (const [key, min, max] of [
    ['maxSegments', 1, 6],
    ['minDelayMs', 0, 5000],
    ['maxDelayMs', 0, 5000],
    ['splitThresholdChars', 20, 600],
  ] as const) {
    const value = finiteNumber(source[key]);
    if (value === null) continue;
    assign(target.delivery, key, Math.trunc(clamp(value, min, max)), conflicts, `delivery.${key}`, sourceKey, '后层覆盖前层');
  }
  if (typeof source.cancelRemainingOnCustomerMessage === 'boolean') {
    assign(target.delivery, 'cancelRemainingOnCustomerMessage', source.cancelRemainingOnCustomerMessage, conflicts, 'delivery.cancelRemainingOnCustomerMessage', sourceKey, '后层覆盖前层');
  }
  if (target.delivery.maxDelayMs < target.delivery.minDelayMs) {
    const previous = target.delivery.maxDelayMs;
    target.delivery.maxDelayMs = target.delivery.minDelayMs;
    conflicts.push({ kind: 'TIGHTENED', path: 'delivery.maxDelayMs', previous, next: target.delivery.maxDelayMs, sourceKey, resolution: '最大延迟不得小于最小延迟，已自动对齐' });
  }
}

function assign<T extends object, K extends keyof T>(target: T, key: K, value: T[K], conflicts: CustomerServiceResolvedStrategyPolicy['conflicts'], path: string, sourceKey: string, resolution: string) {
  const previous = target[key];
  if (previous !== null && previous !== undefined && JSON.stringify(previous) !== JSON.stringify(value)) conflicts.push({ kind: 'OVERRIDE', path, previous, next: value, sourceKey, resolution });
  target[key] = value;
}

function normalizeMode(value: unknown): CustomerServiceStrategyInheritanceMode {
  return ['INHERIT', 'INHERIT_AND_OVERRIDE', 'INDEPENDENT'].includes(String(value)) ? value as CustomerServiceStrategyInheritanceMode : 'INHERIT_AND_OVERRIDE';
}
function hasExplicitPolicyConfiguration(value: Record<string, unknown>) {
  return ['mode', 'inheritRoleCommon', 'inheritScenarioCommon', 'bindings', 'disabledGroupKeys', 'overrides']
    .some((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function normalizeSalesVisibility(value: unknown) { return ['S0', 'S1', 'S2', 'S3'].includes(String(value)) ? value as 'S0' | 'S1' | 'S2' | 'S3' : null; }
function normalizeProductPolicy(value: unknown) { return ['PROHIBITED', 'CATEGORY_ONLY', 'SPECIFIC_IF_RELEVANT', 'SPECIFIC_ALLOWED'].includes(String(value)) ? value as any : null; }
function moreRestrictiveVisibility(a: 'S0' | 'S1' | 'S2' | 'S3', b: 'S0' | 'S1' | 'S2' | 'S3') { return Number(a.slice(1)) <= Number(b.slice(1)) ? a : b; }
function moreRestrictiveProductPolicy(a: any, b: any) { const rank: Record<string, number> = { PROHIBITED: 0, CATEGORY_ONLY: 1, SPECIFIC_IF_RELEVANT: 2, SPECIFIC_ALLOWED: 3 }; return rank[a] <= rank[b] ? a : b; }
function clonePolicy(value: CustomerServiceStrategyPolicyValue): CustomerServiceStrategyPolicyValue { return JSON.parse(JSON.stringify(value)); }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function objectArray(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? unique(value.map((item) => String(item || '').trim()).filter(Boolean)) : []; }
function unique<T>(value: T[]): T[] { return [...new Set(value)]; }
function finiteNumber(value: unknown): number | null { const number = Number(value); return Number.isFinite(number) ? number : null; }
function numberOr(value: unknown, fallback: number) { return finiteNumber(value) ?? fallback; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
