import type { CustomerServiceTuningDirectives } from '../../shared/calibration/customer-service-calibration-profile.util';

type CalibrationStrategyDraftInput = {
  recordId: string;
  roleCode: string;
  roleName: string;
  accountProfileId: string | null;
  accountProfileName: string | null;
  scopeType: string | null;
  scenario: string | null;
  intent: string | null;
  riskLevel: string | null;
  industryCode: string | null;
  directives: CustomerServiceTuningDirectives;
  problemTypes: string[];
};

export function buildCalibrationStrategyDraft(input: CalibrationStrategyDraftInput) {
  const scope = resolveStrategyScope(input);
  const isAccountScope = String(input.scopeType || '').startsWith('ACCOUNT_');
  const suffix = scope.scopeType === 'ROLE_GLOBAL'
    ? 'global'
    : String(input.scopeType || '').endsWith('_CONTEXT')
      ? `context-${slug(input.scenario || 'general')}-${slug(input.intent || 'general')}`
      : `scenario-${slug(input.scenario || 'context')}`;
  const accountSuffix = isAccountScope && input.accountProfileId
    ? `-account-${slug(input.accountProfileId)}`
    : '';
  const assetKey = `calibration-${slug(input.roleCode)}${accountSuffix}-${suffix}`;
  const content = {
    schemaVersion: 1,
    scopeType: scope.scopeType,
    enabledByDefault: true,
    priority: isAccountScope ? 920 : scope.scopeType === 'ROLE_GLOBAL' ? 850 : scope.scopeType === 'SCENARIO' ? 860 : 880,
    appliesTo: {
      roleCodes: [input.roleCode],
      ...(isAccountScope && input.accountProfileId ? { accountProfileIds: [input.accountProfileId] } : {}),
      ...(scope.scopeType === 'SCENARIO' && input.scenario ? { scenarios: [input.scenario] } : {}),
      ...(String(input.scopeType || '').endsWith('_CONTEXT') && input.intent ? { intents: [input.intent] } : {}),
      ...(input.industryCode ? { industryCodes: [input.industryCode] } : {}),
      ...(input.riskLevel ? { riskLevels: [input.riskLevel] } : {}),
    },
    policy: {
      wording: {
        // A calibration draft carries abstract behavior evidence only. Exact
        // preferred/forbidden expressions would turn a failed case into a
        // production phrase rule and are intentionally not emitted.
        emojiPolicy: input.directives.emojiPolicy === 'AVOID'
          ? 'FORBIDDEN'
          : input.directives.emojiPolicy === 'ALLOW'
            ? 'AUTO'
            : 'FOLLOW_CUSTOMER',
      },
      structure: {
        ...(input.directives.maxSentences === null ? {} : { maxSentences: input.directives.maxSentences }),
        ...(input.directives.maxQuestions === null ? {} : { maxQuestions: input.directives.maxQuestions }),
      },
      ...(hasDeliveryDirective(input.directives.delivery) ? {
        delivery: Object.fromEntries(
          Object.entries(input.directives.delivery).filter(([, value]) => value !== null),
        ),
      } : {}),
    },
    calibration: {
      sourceRecordIds: [input.recordId],
      goals: input.directives.goals.slice(0, 30),
      behaviorRules: input.directives.behaviorRules.slice(0, 50),
      problemTypes: input.problemTypes.slice(0, 30),
      advisoryOnlyUntilRegressionPassed: true,
    },
  };
  return {
    assetKey,
    assetName: `${isAccountScope ? input.accountProfileName || '当前账号' : input.roleName} · 校准策略 ${suffix}`,
    description: '由校准证据自动生成的结构化策略草稿；回归通过并人工发布前不会进入运行时。',
    versionTitle: `校准草稿 ${new Date().toISOString()}`,
    versionSummary: `来源校准 ${input.recordId}；必须使用该草稿版本完成回归后才能发布。`,
    content,
  };
}

function resolveStrategyScope(input: CalibrationStrategyDraftInput) {
  if (input.scopeType === 'ROLE_GLOBAL' || input.scopeType === 'ACCOUNT_GLOBAL') return { scopeType: 'ROLE_GLOBAL' as const };
  // 校准记录中的 intent 是运行时语义意图，不是正式意图定义 key。
  // 因此精确上下文校准仍使用 SCENARIO 组，再由 appliesTo.intents/riskLevels 收窄；
  // 不能伪装成必须显式绑定的 INTENT 配置组，否则发布后不会命中运行时。
  return { scopeType: 'SCENARIO' as const };
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'default';
}

function hasDeliveryDirective(delivery: CustomerServiceTuningDirectives['delivery']) {
  return Object.values(delivery).some((value) => value !== null);
}
