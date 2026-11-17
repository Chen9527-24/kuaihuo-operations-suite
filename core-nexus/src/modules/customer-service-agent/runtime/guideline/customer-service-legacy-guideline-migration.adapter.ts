import { Injectable } from '@nestjs/common';
import type { CustomerServiceGuidelineCondition, CustomerServiceGuidelineVersionDraftContent } from './customer-service-guideline.type';

export type CustomerServiceLegacyGuidelineMigrationCandidate = {
  sourceKind: 'RESPONSE_RULE' | 'INTENT_DEFINITION' | 'ROLE_MODULE' | 'STRATEGY_GROUP';
  sourceId: string;
  sourceRevision: number;
  sourceHash?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  autoPublishAllowed: boolean;
  status: 'MAPPABLE' | 'REVIEW_REQUIRED' | 'UNMAPPABLE';
  guidelineCode: string;
  guidelineName: string;
  content: CustomerServiceGuidelineVersionDraftContent | null;
  notes: string[];
};

@Injectable()
export class CustomerServiceLegacyGuidelineMigrationAdapter {
  fromResponseRule(input: {
    rule: {
      id: string;
      key: string;
      name: string;
      description?: string | null;
      conditions: unknown;
      exclusions?: unknown;
      priority: number;
      exclusive?: boolean;
      revision: number;
      responseAssetId: string;
    };
    version: { id: string; versionNo: number; contentHash?: string };
  }): CustomerServiceLegacyGuidelineMigrationCandidate {
    const include = convertLegacyCondition(input.rule.conditions);
    const exclude = convertLegacyCondition(input.rule.exclusions);
    const legacyConditions = asRecord(input.rule.conditions);
    const legacyIndustryCodes = stringArray(legacyConditions.industryCodes);
    const condition: CustomerServiceGuidelineCondition = exclude
      ? { all: [include || {}, { not: exclude }] } as any
      : include || ({} as any);
    return {
      sourceKind: 'RESPONSE_RULE',
      sourceId: input.rule.id,
      sourceRevision: input.rule.revision,
      sourceHash: input.version.contentHash,
      confidence: 'HIGH',
      autoPublishAllowed: legacyIndustryCodes.length === 0,
      status: legacyIndustryCodes.length ? 'REVIEW_REQUIRED' : 'MAPPABLE',
      guidelineCode: `legacy.response-rule.${input.rule.key}`.slice(0, 120),
      guidelineName: `迁移·${input.rule.name}`,
      content: {
        schemaVersion: 1,
        binding: { type: 'TENANT', key: '*' },
        condition,
        actions: [{
          op: 'USE_RESPONSE_ASSET',
          assetId: input.rule.responseAssetId,
          versionId: input.version.id,
          versionNo: input.version.versionNo,
        }],
        priority: input.rule.priority,
        criticality: input.rule.exclusive ? 'IMPORTANT' : 'STANDARD',
        tags: ['legacy:response-rule', input.rule.exclusive ? 'legacy:exclusive' : 'legacy:normal'],
        relationships: {},
        evidenceRefs: [`RESPONSE_RULE:${input.rule.id}:REV:${input.rule.revision}`],
      },
      notes: [
        ...(input.rule.exclusive ? ['旧 exclusive 语义不会自动转换为通用 exclude 关系；发布前必须检查同优先级规则。'] : []),
        ...(legacyIndustryCodes.length ? [`旧规则包含行业绑定 ${legacyIndustryCodes.join('、')}；V1.2 要求行业属于 Static Binding，禁止以 TENANT binding 自动发布，需拆分/确认行业 binding。`] : []),
      ],
    };
  }

  fromIntentDefinition(input: {
    id: string; key: string; name: string; scenario: string; primaryIntent: string;
    strategyConfig: unknown; flowConfig: unknown; replyConfig: unknown; priority: number; revision: number;
  }): CustomerServiceLegacyGuidelineMigrationCandidate {
    const actions: any[] = [];
    const strategy = asRecord(input.strategyConfig);
    if (Number(strategy.questionBudget) === 0) actions.push({ op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 800 });
    if (String(strategy.salesVisibility || '').toUpperCase() === 'S0') {
      actions.push({ op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 850 });
      actions.push({ op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 850 });
    }
    const condition: CustomerServiceGuidelineCondition = {
      all: [
        ...(input.scenario && input.scenario !== '*' ? [{ fact: 'understanding.scenario', op: 'EQ', value: input.scenario } as any] : []),
        ...(input.primaryIntent && input.primaryIntent !== '*' ? [{ fact: 'understanding.intent', op: 'EQ', value: input.primaryIntent } as any] : []),
      ],
    };
    if (!actions.length) {
      return {
        sourceKind: 'INTENT_DEFINITION', sourceId: input.id, sourceRevision: input.revision,
        confidence: 'LOW', autoPublishAllowed: false, status: 'REVIEW_REQUIRED',
        guidelineCode: `legacy.intent.${input.key}`.slice(0, 120), guidelineName: `候选·${input.name}`,
        content: null,
        notes: ['strategyConfig/flowConfig/replyConfig 包含无法安全自动解释的业务语义；禁止自动激活，需 HVE-4 校准/人工提纯。'],
      };
    }
    return {
      sourceKind: 'INTENT_DEFINITION', sourceId: input.id, sourceRevision: input.revision,
      confidence: 'MEDIUM', autoPublishAllowed: false, status: 'MAPPABLE',
      guidelineCode: `legacy.intent.${input.key}`.slice(0, 120), guidelineName: `候选·${input.name}`,
      content: {
        schemaVersion: 1,
        binding: { type: 'TENANT', key: '*' }, condition, actions,
        priority: input.priority, criticality: 'STANDARD', tags: ['legacy:intent'], relationships: {},
        evidenceRefs: [`INTENT:${input.id}:REV:${input.revision}`],
      },
      notes: ['仅迁移可无歧义结构化字段；flow/reply 自然语言内容不自动转 Policy。'],
    };
  }

  fromRoleModule(input: {
    id: string; key: string; name: string; revision: number; priority: number;
    definition?: { code?: string } | null; conditions?: unknown; content?: unknown;
  }): CustomerServiceLegacyGuidelineMigrationCandidate {
    const moduleType = String(input.definition?.code || '').toUpperCase();
    const eligible = ['BUSINESS_BEHAVIOR', 'PROHIBITION'].includes(moduleType);
    return {
      sourceKind: 'ROLE_MODULE', sourceId: input.id, sourceRevision: input.revision,
      confidence: eligible ? 'LOW' : 'LOW', autoPublishAllowed: false,
      status: eligible ? 'REVIEW_REQUIRED' : 'UNMAPPABLE',
      guidelineCode: `legacy.role-module.${input.key}`.slice(0, 120), guidelineName: `候选·${input.name}`,
      content: null,
      notes: eligible
        ? ['角色行为/禁止模块当前存在弱消费或文本规则；只能生成迁移候选，禁止自动发布激活历史死配置。']
        : [`${moduleType || 'UNKNOWN'} 属于身份/语言/能力等非 Guideline 主职责，不迁入 HVE Policy。`],
    };
  }
  fromStrategyGroup(input: {
    id: string; key: string; name: string; revision: number; versionId?: string; versionNo?: number; contentHash?: string; content: unknown;
  }): CustomerServiceLegacyGuidelineMigrationCandidate {
    const content = asRecord(input.content);
    const policy = asRecord(content.policy);
    const structure = asRecord(policy.structure);
    const service = asRecord(policy.service);
    const appliesTo = asRecord(content.appliesTo);
    const actions: any[] = [];

    if (Number.isFinite(Number(structure.maxQuestions)) && Number(structure.maxQuestions) === 0) {
      actions.push({ op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 800 });
    }
    if (String(service.salesVisibility || '').toUpperCase() === 'S0') {
      actions.push({ op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 850 });
      actions.push({ op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 850 });
    }
    if (String(service.productMentionPolicy || '').toUpperCase() === 'PROHIBITED') {
      actions.push({ op: 'SUPPRESS_ACT', act: 'RECOMMEND_GROUNDED_ITEM', enforcement: 'HARD', priority: 850 });
    }

    const staticBindings = [
      ['ROLE', stringArray(appliesTo.roleCodes)],
      ['ACCOUNT', stringArray(appliesTo.accountProfileIds)],
      ['INDUSTRY', stringArray(appliesTo.industryCodes)],
    ].filter(([, values]) => (values as string[]).length) as Array<[string, string[]]>;
    const requiresBindingReview = staticBindings.length > 1 || staticBindings.some(([, values]) => values.length !== 1);
    const binding = staticBindings.length === 1 && staticBindings[0][1].length === 1
      ? { type: staticBindings[0][0] as any, key: staticBindings[0][1][0] }
      : { type: 'TENANT' as const, key: '*' };
    const conditions: CustomerServiceGuidelineCondition[] = [];
    addSet(conditions, appliesTo.scenarios, 'understanding.scenario');
    addSet(conditions, appliesTo.intents, 'understanding.intent');
    addSet(conditions, appliesTo.riskLevels, 'understanding.riskLevel');
    const condition: CustomerServiceGuidelineCondition = conditions.length === 0 ? ({} as any) : conditions.length === 1 ? conditions[0] : { all: conditions };

    if (!actions.length) {
      return {
        sourceKind: 'STRATEGY_GROUP', sourceId: input.id, sourceRevision: input.revision, sourceHash: input.contentHash,
        confidence: 'LOW', autoPublishAllowed: false, status: 'REVIEW_REQUIRED',
        guidelineCode: `legacy.strategy-group.${input.key}`.slice(0, 120), guidelineName: `候选·${input.name}`, content: null,
        notes: ['该 StrategyGroup 仅包含 tone/wording/delivery 或无法无歧义映射的结构字段；保留给 HVE-3/4 Realization 迁移，不转 Guideline。'],
      };
    }

    return {
      sourceKind: 'STRATEGY_GROUP', sourceId: input.id, sourceRevision: input.revision, sourceHash: input.contentHash,
      confidence: requiresBindingReview ? 'LOW' : 'MEDIUM', autoPublishAllowed: false, status: requiresBindingReview ? 'REVIEW_REQUIRED' : 'MAPPABLE',
      guidelineCode: `legacy.strategy-group.${input.key}`.slice(0, 120), guidelineName: `候选·${input.name}`,
      content: {
        schemaVersion: 1, binding, condition, actions, priority: Number(content.priority || 100), criticality: 'STANDARD',
        tags: ['legacy:strategy-group'], relationships: {},
        evidenceRefs: [`STRATEGY_GROUP:${input.id}:REV:${input.revision}${input.versionId ? `:VERSION:${input.versionId}` : ''}`],
      },
      notes: [
        '仅迁移结构/服务中可无歧义映射的行为约束；tone/wording/delivery 继续留在 legacy realization。',
        ...(requiresBindingReview ? ['appliesTo 同时包含多种或多值静态 binding，禁止自动发布，需 HVE-4 拆分后确认。'] : []),
      ],
    };
  }


}

function convertLegacyCondition(value: unknown): CustomerServiceGuidelineCondition | null {
  const source = asRecord(value);
  const leaves: CustomerServiceGuidelineCondition[] = [];
  addSet(leaves, source.scenarios, 'understanding.scenario');
  addSet(leaves, source.intents, 'understanding.intent');
  addSet(leaves, source.riskLevels, 'understanding.riskLevel');
  // industryCodes 在 V1.2 属于 Static Binding，不允许重复进入 Dynamic Condition。
  // 旧规则若包含行业条件，迁移候选保留到 notes/人工重绑；这里不静默转换为 Condition。
  if (!leaves.length) return null;
  return leaves.length === 1 ? leaves[0] : { all: leaves };
}
function addSet(target: CustomerServiceGuidelineCondition[], value: unknown, fact: string) {
  if (!Array.isArray(value) || !value.length) return;
  const items = value.map((item) => String(item || '').trim()).filter(Boolean);
  if (items.length) target.push({ fact, op: 'IN', value: items } as any);

}
function stringArray(value: unknown) { return Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : []; }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
