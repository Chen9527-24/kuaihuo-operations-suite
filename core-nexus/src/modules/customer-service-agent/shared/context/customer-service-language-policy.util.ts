export type CustomerServiceLanguageRule = {
  key: string;
  type: string;
  pattern: string;
  replacement: string | null;
  position: 'ANYWHERE' | 'START' | 'END';
  action: 'PROMPT_ONLY' | 'REMOVE' | 'REPLACE' | 'MODEL_REWRITE' | 'BLOCK' | 'WARN';
  severity: 'BLOCKER' | 'ERROR' | 'WARNING';
  enabled: boolean;
  exceptions: string[];
  limit: number | null;
};

export type CustomerServiceEffectiveLanguagePolicy = {
  id: string;
  code: string;
  name: string;
  scopeType: string;
  scopeKey: string;
  priority: number;
  revision: number;
  styleGuidance: Record<string, unknown>;
  rules: CustomerServiceLanguageRule[];
};

export type CustomerServiceOutputRuleApplication = {
  policyId: string;
  ruleKey: string;
  type: string;
  action: string;
  status: 'APPLIED' | 'UNCHANGED' | 'SKIPPED_EXCEPTION' | 'SKIPPED_EMPTY' | 'INVALID_RULE';
  before?: string;
  after?: string;
  message: string;
};

type PolicySource = {
  id: string;
  code: string;
  name: string;
  scopeType: string;
  scopeKey: string;
  priority: number;
  revision: number;
  styleGuidance: unknown;
  rules: unknown;
};

export function selectEffectiveLanguagePolicies(
  policies: PolicySource[],
  context: {
    storeProfileId?: string | null;
    accountProfileId?: string | null;
    merchantRoleId: string;
    channel?: string | null;
    scenario?: string | null;
    intent?: string | null;
  },
): CustomerServiceEffectiveLanguagePolicy[] {
  const scopeValues: Record<string, string | null | undefined> = {
    GLOBAL: '*',
    STORE: context.storeProfileId,
    ACCOUNT: context.accountProfileId,
    ROLE: context.merchantRoleId,
    CHANNEL: context.channel,
    SCENARIO: context.scenario,
    INTENT: context.intent,
  };
  return policies
    .filter((policy) => policy.scopeType === 'GLOBAL'
      ? policy.scopeKey === '*' || policy.scopeKey.toUpperCase() === 'GLOBAL'
      : Boolean(scopeValues[policy.scopeType]) && policy.scopeKey === scopeValues[policy.scopeType])
    .map((policy) => ({
      id: policy.id,
      code: policy.code,
      name: policy.name,
      scopeType: policy.scopeType,
      scopeKey: policy.scopeKey,
      priority: policy.priority,
      revision: policy.revision,
      styleGuidance: asRecord(policy.styleGuidance),
      rules: normalizeRules(policy.rules),
    }))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/**
 * Compile only explicit Language Policy constraints for ordinary Generation.
 *
 * `styleGuidance` remains persisted/readable for PC/admin compatibility and diagnostics,
 * but is not a model-facing Persona HOW source. Natural expression is owned solely by
 * the persisted Role -> Identity Prompt chain. This compiler therefore consumes only
 * typed policy rules and does not translate free-form style guidance into prompt text.
 */
export function buildLanguagePolicyConstraintInstructions(policies: CustomerServiceEffectiveLanguagePolicy[]) {
  const constraints: string[] = [];
  for (const policy of policies) {
    for (const rule of policy.rules.filter((item) => item.enabled)) {
      const position = rule.position === 'END' ? '结尾' : rule.position === 'START' ? '开头' : '全文';
      if (rule.type === 'ENDING_SYMBOL') {
        constraints.push(`回复${position}禁止使用“${rule.pattern}”`);
      } else if (rule.action === 'REPLACE' && rule.replacement !== null) {
        constraints.push(`${position}出现“${rule.pattern}”时改成“${rule.replacement}”`);
      } else if (rule.action !== 'WARN') {
        constraints.push(`${position}禁止出现“${rule.pattern}”`);
      }
    }
  }
  return uniqueStrings(constraints).slice(0, 80);
}


function normalizeRules(value: unknown): CustomerServiceLanguageRule[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = asRecord(item);
    const normalizedPosition = String(record.position).toUpperCase();
    const position: CustomerServiceLanguageRule['position'] = normalizedPosition === 'START'
      ? 'START'
      : normalizedPosition === 'END'
        ? 'END'
        : 'ANYWHERE';
    const normalizedSeverity = String(record.severity).toUpperCase();
    const severity: CustomerServiceLanguageRule['severity'] = normalizedSeverity === 'BLOCKER'
      ? 'BLOCKER'
      : normalizedSeverity === 'ERROR'
        ? 'ERROR'
        : 'WARNING';
    return {
      key: String(record.key || `rule_${index + 1}`),
      type: String(record.type || 'FORBIDDEN_PHRASE').toUpperCase(),
      pattern: String(record.pattern || record.value || ''),
      replacement: record.replacement === null || record.replacement === undefined
        ? null
        : String(record.replacement),
      position,
      action: ['PROMPT_ONLY', 'REMOVE', 'REPLACE', 'MODEL_REWRITE', 'BLOCK', 'WARN'].includes(String(record.action).toUpperCase())
        ? String(record.action).toUpperCase() as CustomerServiceLanguageRule['action']
        : 'MODEL_REWRITE',
      severity,
      enabled: record.enabled !== false,
      exceptions: Array.isArray(record.exceptions) ? record.exceptions.map(String).filter(Boolean).slice(0, 50) : [],
      limit: Number.isInteger(record.limit) && Number(record.limit) > 0 ? Number(record.limit) : null,
    };
  }).filter((item) => item.pattern);
}


function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
