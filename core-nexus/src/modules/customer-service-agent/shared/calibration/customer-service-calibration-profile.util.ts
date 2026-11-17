export const CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES = ['ROBOT_CONTEXT', 'ROBOT_SCENARIO', 'ROBOT_GLOBAL', 'ACCOUNT_CONTEXT', 'ACCOUNT_SCENARIO', 'ACCOUNT_GLOBAL', 'ROLE_CONTEXT', 'ROLE_SCENARIO', 'ROLE_GLOBAL'] as const;
export type CustomerServiceCalibrationScopeType = (typeof CUSTOMER_SERVICE_CALIBRATION_SCOPE_TYPES)[number];

export type CustomerServiceTuningDirectives = {
  version: 1;
  goals: string[];
  behaviorRules: string[];
  avoidExpressions: string[];
  preferredPatterns: string[];
  maxSentences: number | null;
  maxQuestions: number | null;
  emojiPolicy: 'AUTO' | 'AVOID' | 'ALLOW';
  delivery: {
    mode: 'AUTO' | 'SINGLE' | 'SEQUENTIAL' | null;
    maxSegments: number | null;
    minDelayMs: number | null;
    maxDelayMs: number | null;
    splitThresholdChars: number | null;
    cancelRemainingOnCustomerMessage: boolean | null;
  };
};

export type CustomerServiceCalibrationScope = {
  scopeType: CustomerServiceCalibrationScopeType;
  scopeKey: string;
  title: string;
  merchantRoleId: string;
  accountProfileId: string | null;
  robotId: string | null;
  industryNodeId: string | null;
  scenario: string | null;
  intent: string | null;
  riskLevel: string | null;
};

type ScopeSource = {
  merchantRoleId: string;
  merchantRoleName?: string | null;
  accountProfileId?: string | null;
  accountProfileName?: string | null;
  robotId?: string | null;
  industryNodeId?: string | null;
  industryName?: string | null;
  scenario?: string | null;
  intent?: string | null;
  riskLevel?: string | null;
};

export function buildCalibrationScope(source: ScopeSource, scopeType: CustomerServiceCalibrationScopeType): CustomerServiceCalibrationScope {
  const scenario = clean(source.scenario);
  const intent = clean(source.intent);
  const riskLevel = clean(source.riskLevel);
  const industryNodeId = clean(source.industryNodeId);
  const roleName = clean(source.merchantRoleName) || '当前客服角色';
  const accountProfileId = clean(source.accountProfileId);
  const accountName = clean(source.accountProfileName) || '当前账号身份';
  const robotId = clean(source.robotId);
  if ((scopeType.startsWith('ACCOUNT_') || scopeType.startsWith('ROBOT_')) && !accountProfileId) {
    throw new Error('账号/机器人级校准作用域必须关联账号资料');
  }
  if (scopeType.startsWith('ROBOT_') && !robotId) {
    throw new Error('机器人级校准作用域必须关联机器人');
  }
  if (scopeType === 'ROBOT_GLOBAL') {
    return {
      scopeType,
      scopeKey: `robot:${robotId}|role:${source.merchantRoleId}|account:${accountProfileId}|global`,
      title: `${accountName} · 当前机器人 · 全局校准`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId,
      robotId,
      industryNodeId: null,
      scenario: null,
      intent: null,
      riskLevel: null,
    };
  }
  if (scopeType === 'ROBOT_SCENARIO') {
    return {
      scopeType,
      scopeKey: `robot:${robotId}|role:${source.merchantRoleId}|account:${accountProfileId}|industry:${industryNodeId || '*'}|scenario:${scenario || '*'}`,
      title: `${accountName} · 当前机器人 · ${scenario || '通用场景'}`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId,
      robotId,
      industryNodeId,
      scenario,
      intent: null,
      riskLevel: null,
    };
  }
  if (scopeType === 'ROBOT_CONTEXT') {
    return {
      scopeType,
      scopeKey: [
        `robot:${robotId}`,
        `role:${source.merchantRoleId}`,
        `account:${accountProfileId}`,
        `industry:${industryNodeId || '*'}`,
        `scenario:${scenario || '*'}`,
        `intent:${intent || '*'}`,
        `risk:${riskLevel || '*'}`,
      ].join('|'),
      title: `${accountName} · 当前机器人 · ${scenario || '通用场景'} · ${intent || '通用意图'}`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId,
      robotId,
      industryNodeId,
      scenario,
      intent,
      riskLevel,
    };
  }
  if (scopeType === 'ACCOUNT_GLOBAL') {
    return {
      scopeType,
      scopeKey: `account:${accountProfileId}|global`,
      title: `${accountName} · 账号全局调优`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId,
      robotId: null,
      industryNodeId: null,
      scenario: null,
      intent: null,
      riskLevel: null,
    };
  }
  if (scopeType === 'ACCOUNT_SCENARIO') {
    return {
      scopeType,
      scopeKey: `account:${accountProfileId}|industry:${industryNodeId || '*'}|scenario:${scenario || '*'}`,
      title: `${accountName} · ${scenario || '通用场景'}`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId,
      robotId: null,
      industryNodeId,
      scenario,
      intent: null,
      riskLevel: null,
    };
  }
  if (scopeType === 'ACCOUNT_CONTEXT') {
    return {
      scopeType,
      scopeKey: [
        `account:${accountProfileId}`,
        `industry:${industryNodeId || '*'}`,
        `scenario:${scenario || '*'}`,
        `intent:${intent || '*'}`,
        `risk:${riskLevel || '*'}`,
      ].join('|'),
      title: `${accountName} · ${scenario || '通用场景'} · ${intent || '通用意图'} · ${riskLevel || '通用风险'}`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId,
      robotId: null,
      industryNodeId,
      scenario,
      intent,
      riskLevel,
    };
  }
  if (scopeType === 'ROLE_GLOBAL') {
    return {
      scopeType,
      scopeKey: `role:${source.merchantRoleId}|global`,
      title: `${roleName} · 全局调优`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId: null,
      robotId: null,
      industryNodeId: null,
      scenario: null,
      intent: null,
      riskLevel: null,
    };
  }
  if (scopeType === 'ROLE_SCENARIO') {
    return {
      scopeType,
      scopeKey: `role:${source.merchantRoleId}|industry:${industryNodeId || '*'}|scenario:${scenario || '*'}`,
      title: `${roleName} · ${source.industryName || '通用行业'} · ${scenario || '通用场景'}`,
      merchantRoleId: source.merchantRoleId,
      accountProfileId: null,
      robotId: null,
      industryNodeId,
      scenario,
      intent: null,
      riskLevel: null,
    };
  }
  return {
    scopeType,
    scopeKey: [
      `role:${source.merchantRoleId}`,
      `industry:${industryNodeId || '*'}`,
      `scenario:${scenario || '*'}`,
      `intent:${intent || '*'}`,
      `risk:${riskLevel || '*'}`,
    ].join('|'),
    title: `${roleName} · ${scenario || '通用场景'} · ${intent || '通用意图'} · ${riskLevel || '通用风险'}`,
    merchantRoleId: source.merchantRoleId,
    accountProfileId: null,
    robotId: null,
    industryNodeId,
    scenario,
    intent,
    riskLevel,
  };
}

export function normalizeTuningDirectives(value: unknown): CustomerServiceTuningDirectives {
  const source = asObject(value);
  return {
    version: 1,
    goals: uniqueStrings(source.goals, 12),
    behaviorRules: normalizeBehaviorRules(source.behaviorRules),
    avoidExpressions: uniqueStrings(source.avoidExpressions, 30),
    preferredPatterns: normalizePreferredPatterns(source.preferredPatterns),
    maxSentences: positiveIntOrNull(source.maxSentences, 8),
    maxQuestions: nonNegativeIntOrNull(source.maxQuestions, 5),
    emojiPolicy: normalizeEmojiPolicy(source.emojiPolicy),
    delivery: normalizeDeliveryDirectives(source.delivery),
  };
}

/**
 * 保存/更新调优档案时使用的兼容入口。
 * Epic7 将清洗逻辑统一收口到 normalizeTuningDirectives，保留此导出以兼容
 * 已经使用 sanitizeTuningDirectives 的管理端服务。
 */
export function sanitizeTuningDirectives(value: unknown): CustomerServiceTuningDirectives {
  return normalizeTuningDirectives(value);
}

/**
 * A single failed conversation is evidence, not a production wording policy.
 * Keep only abstract goals/behavior guidance that does not copy the source case;
 * phrase lists, fixed structure, emoji and delivery preferences require aggregated
 * evidence and a separately reviewed strategy version.
 */
export function sanitizeSingleCaseCalibrationDirectives(
  value: unknown,
  evidenceTexts: unknown[] = [],
): CustomerServiceTuningDirectives {
  const normalized = normalizeTuningDirectives(value);
  const evidence = evidenceTexts
    .map((item) => typeof item === 'string' ? compactEvidenceText(item) : '')
    .filter((item) => item.length >= minimumEvidenceLiteralLength(item));
  const genericOnly = (items: string[]) => items.filter((item) => !sharesCaseLiteral(item, evidence));
  return {
    version: 1,
    goals: genericOnly(normalized.goals),
    behaviorRules: genericOnly(normalized.behaviorRules),
    avoidExpressions: [],
    preferredPatterns: [],
    maxSentences: null,
    maxQuestions: null,
    emojiPolicy: 'AUTO',
    delivery: {
      mode: null,
      maxSegments: null,
      minDelayMs: null,
      maxDelayMs: null,
      splitThresholdChars: null,
      cancelRemainingOnCustomerMessage: null,
    },
  };
}

/**
 * 按传入顺序合并调优约束，越靠前优先级越高。
 * 数组类约束会去重累加；句数、问题数和表情策略采用第一个明确值，
 * 这样完整场景调优可以覆盖角色场景或角色全局的宽泛设置。
 */
export function mergeTuningDirectives(...values: unknown[]): CustomerServiceTuningDirectives {
  const normalized = values.map(normalizeTuningDirectives);
  return {
    version: 1,
    goals: mergeStrings(normalized.flatMap((item) => item.goals), 12),
    behaviorRules: mergeStrings(normalized.flatMap((item) => item.behaviorRules), 30),
    avoidExpressions: mergeStrings(normalized.flatMap((item) => item.avoidExpressions), 30),
    preferredPatterns: mergeStrings(normalized.flatMap((item) => item.preferredPatterns), 20),
    maxSentences: firstDefinedLimit(normalized.map((item) => item.maxSentences)),
    maxQuestions: firstDefinedLimit(normalized.map((item) => item.maxQuestions)),
    emojiPolicy: normalized.find((item) => item.emojiPolicy !== 'AUTO')?.emojiPolicy ?? 'AUTO',
    delivery: mergeDeliveryDirectives(normalized.map((item) => item.delivery)),
  };
}


/**
 * 阿梨旗舰母版同步时使用。它不会删除历史校准记录，只清理已经进入调优档案的
 * 固定句式、情绪触发营销和机械结构，再由新的全局/场景母版提供稳定方向。
 */
export function sanitizeAliFlagshipDirectives(value: unknown): CustomerServiceTuningDirectives {
  const normalized = normalizeTuningDirectives(value);
  return {
    version: 1,
    goals: normalized.goals.filter((item) => !isAliLegacySalesDirective(item)),
    behaviorRules: normalized.behaviorRules.filter((item) => !isAliLegacySalesDirective(item)),
    avoidExpressions: normalized.avoidExpressions,
    preferredPatterns: normalized.preferredPatterns.filter((item) => !isAliLegacySalesDirective(item)),
    // 旧档案里的 3 句/0 问题多数来自单条参考回复，不能继续作为长期固定结构。
    maxSentences: null,
    maxQuestions: null,
    emojiPolicy: normalized.emojiPolicy,
    delivery: normalized.delivery,
  };
}

export function isImmediateCalibrationScopeType(scopeType: string) {
  return scopeType.startsWith('ROBOT_') || scopeType.startsWith('ACCOUNT_');
}

/**
 * Immediate calibration is deliberately narrower than the formal shared strategy path.
 * Only administrator-applied robot/account scopes are projected into ordinary generation.
 * Role scopes stay evidence/draft-only until the existing regression + publish workflow promotes them.
 */
export function projectImmediateCalibrationDirectives(values: unknown[]): CustomerServiceTuningDirectives {
  const normalized = values.map((value) => projectSingleImmediateCalibrationDirectives(value));
  return buildImmediateCalibrationDirectives(
    mergePriorityCalibrationStrings(normalized.map((item) => item.goals), 12),
    mergePriorityCalibrationStrings(normalized.map((item) => item.behaviorRules), 30),
  );
}

export type ImmediateCalibrationProfileProjectionSource = {
  id?: string | null;
  scopeType: string;
  industryNodeId?: string | null;
  scenario?: string | null;
  intent?: string | null;
  riskLevel?: string | null;
  updatedAt?: Date | string | null;
  directives: unknown;
};

/**
 * Runtime projection is profile-aware so precedence is deterministic instead of relying
 * on database return order. More specific robot/account scopes win first; within the
 * same scope type, exact industry/context beats wildcard fallback, then the most recently
 * applied profile wins. Lower-priority non-conflicting guidance is still inherited.
 */
export function projectImmediateCalibrationProfileDirectives(
  profiles: ImmediateCalibrationProfileProjectionSource[],
): CustomerServiceTuningDirectives {
  const ordered = profiles
    .filter((item) => isImmediateCalibrationScopeType(item.scopeType))
    .slice()
    .sort(compareCalibrationProfilePriority);
  return projectImmediateCalibrationDirectives(ordered.map((item) => item.directives));
}

/**
 * A repeated admin calibration on the same exact profile is a correction to memory, not
 * another independent prompt fragment. Keep the newest abstract direction first and
 * suppress old near-equivalent/opposite wording that targets the same policy statement.
 * Distinct, non-conflicting principles continue to accumulate.
 */
export function mergeImmediateCalibrationMemoryDirectives(
  latest: unknown,
  existing: unknown,
): CustomerServiceTuningDirectives {
  const next = projectSingleImmediateCalibrationDirectives(latest);
  const previous = projectSingleImmediateCalibrationDirectives(existing);
  return buildImmediateCalibrationDirectives(
    mergePriorityCalibrationStrings([next.goals, previous.goals], 12),
    mergePriorityCalibrationStrings([next.behaviorRules, previous.behaviorRules], 30),
  );
}

export function compareCalibrationProfilePriority(
  left: ImmediateCalibrationProfileProjectionSource,
  right: ImmediateCalibrationProfileProjectionSource,
) {
  const scopeDelta = calibrationScopeWeight(right.scopeType) - calibrationScopeWeight(left.scopeType);
  if (scopeDelta) return scopeDelta;
  const specificityDelta = calibrationProfileSpecificity(right) - calibrationProfileSpecificity(left);
  if (specificityDelta) return specificityDelta;
  const updatedDelta = calibrationProfileUpdatedAt(right) - calibrationProfileUpdatedAt(left);
  if (updatedDelta) return updatedDelta;
  return String(left.id || '').localeCompare(String(right.id || ''));
}

export function buildImmediateCalibrationRuntimeInstructions(value: unknown): string[] {
  const directives = projectImmediateCalibrationDirectives([value]);
  if (!directives.goals.length && !directives.behaviorRules.length) return [];
  return mergeStrings([
    '以下管理员精确校准已由服务器按机器人/账号作用域、上下文具体度和最近应用顺序完成收敛；只执行当前列出的有效原则，不恢复已被更高优先级或更新校准覆盖的旧要求。',
    ...directives.goals.map((item) => `管理员已应用的当前账号校准目标：${item}`),
    ...directives.behaviorRules.map((item) => `管理员已应用的当前账号校准原则：${item}`),
  ], 36);
}

export function calibrationScopeWeight(scopeType: string) {
  if (scopeType === 'ROBOT_CONTEXT') return 900;
  if (scopeType === 'ROBOT_SCENARIO') return 800;
  if (scopeType === 'ROBOT_GLOBAL') return 700;
  if (scopeType === 'ACCOUNT_CONTEXT') return 600;
  if (scopeType === 'ACCOUNT_SCENARIO') return 500;
  if (scopeType === 'ACCOUNT_GLOBAL') return 400;
  if (scopeType === 'ROLE_CONTEXT') return 300;
  if (scopeType === 'ROLE_SCENARIO') return 200;
  if (scopeType === 'ROLE_GLOBAL') return 100;
  return 0;
}

function projectSingleImmediateCalibrationDirectives(value: unknown): CustomerServiceTuningDirectives {
  const normalized = normalizeTuningDirectives(value);
  return buildImmediateCalibrationDirectives(normalized.goals, normalized.behaviorRules);
}

function buildImmediateCalibrationDirectives(goals: string[], behaviorRules: string[]): CustomerServiceTuningDirectives {
  return {
    version: 1,
    goals: mergeStrings(goals, 12),
    behaviorRules: mergeStrings(behaviorRules, 30),
    avoidExpressions: [],
    preferredPatterns: [],
    maxSentences: null,
    maxQuestions: null,
    emojiPolicy: 'AUTO',
    delivery: {
      mode: null,
      maxSegments: null,
      minDelayMs: null,
      maxDelayMs: null,
      splitThresholdChars: null,
      cancelRemainingOnCustomerMessage: null,
    },
  };
}

function calibrationProfileSpecificity(value: ImmediateCalibrationProfileProjectionSource) {
  return (value.industryNodeId ? 8 : 0)
    + (value.scenario ? 4 : 0)
    + (value.intent ? 2 : 0)
    + (value.riskLevel ? 1 : 0);
}

function calibrationProfileUpdatedAt(value: ImmediateCalibrationProfileProjectionSource) {
  if (value.updatedAt instanceof Date) return value.updatedAt.getTime();
  const parsed = typeof value.updatedAt === 'string' ? Date.parse(value.updatedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergePriorityCalibrationStrings(groups: string[][], limit: number) {
  const result: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const value = raw.trim();
      if (!value) continue;
      if (result.some((current) => calibrationPolicyStatementsOverlap(current, value))) continue;
      result.push(value.slice(0, 1000));
      if (result.length >= limit) return result;
    }
  }
  return result;
}

function calibrationPolicyStatementsOverlap(left: string, right: string) {
  const exactLeft = compactPolicyText(left, false);
  const exactRight = compactPolicyText(right, false);
  if (!exactLeft || !exactRight) return false;
  if (exactLeft === exactRight) return true;

  const subjectLeft = compactPolicyText(left, true);
  const subjectRight = compactPolicyText(right, true);
  if (!subjectLeft || !subjectRight) return false;
  if (subjectLeft === subjectRight) return true;

  const minContainmentLength = /\p{Script=Han}/u.test(`${subjectLeft}${subjectRight}`) ? 6 : 10;
  const shorter = subjectLeft.length <= subjectRight.length ? subjectLeft : subjectRight;
  const longer = shorter === subjectLeft ? subjectRight : subjectLeft;
  if (shorter.length >= minContainmentLength && longer.includes(shorter)) return true;

  return bigramDice(subjectLeft, subjectRight) >= 0.76;
}

function compactPolicyText(value: string, stripPolicyOperators: boolean) {
  let text = value.normalize('NFKC').toLowerCase();
  if (stripPolicyOperators) {
    const operators = [
      '不要', '不得', '禁止', '避免', '不能', '不应', '不必', '无需',
      '应该', '应当', '需要', '必须', '可以', '尽量', '优先', '主动',
      '保持', '减少', '增加', '强化', '弱化',
    ];
    for (const operator of operators) text = text.split(operator).join('');
  }
  return text.replace(/[^\p{L}\p{N}]+/gu, '');
}

function bigramDice(left: string, right: string) {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftPairs = stringBigrams(left);
  const rightPairs = stringBigrams(right);
  let overlap = 0;
  const remaining = new Map<string, number>();
  for (const pair of rightPairs) remaining.set(pair, (remaining.get(pair) || 0) + 1);
  for (const pair of leftPairs) {
    const count = remaining.get(pair) || 0;
    if (!count) continue;
    overlap += 1;
    if (count === 1) remaining.delete(pair);
    else remaining.set(pair, count - 1);
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function stringBigrams(value: string) {
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) result.push(value.slice(index, index + 2));
  return result;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function uniqueStrings(value: unknown, limit: number) {
  return Array.isArray(value) ? mergeStrings(value.filter((item): item is string => typeof item === 'string'), limit) : [];
}

function mergeStrings(values: string[], limit: number) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value.slice(0, 1000));
    if (result.length >= limit) break;
  }
  return result;
}

function sharesCaseLiteral(value: string, evidence: string[]) {
  const compact = compactEvidenceText(value);
  const minimumLength = minimumEvidenceLiteralLength(compact);
  if (compact.length < minimumLength) return false;
  if (evidence.some((item) => item.includes(compact) || compact.includes(item))) return true;
  const windowSize = Math.min(12, Math.max(minimumLength, Math.floor(compact.length * 0.6)));
  for (let index = 0; index <= compact.length - windowSize; index += 1) {
    const fragment = compact.slice(index, index + windowSize);
    if (evidence.some((item) => item.includes(fragment))) return true;
  }
  return false;
}

function compactEvidenceText(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function minimumEvidenceLiteralLength(value: string) {
  return /\p{Script=Han}/u.test(value) ? 4 : 6;
}



function normalizeBehaviorRules(value: unknown) {
  const source = uniqueStrings(value, 30);
  const result: string[] = [];
  let replacedRigidStructure = false;
  for (const rule of source) {
    const normalized = rule.trim();
    const looksLikeRigidStructure = /(?:第一句|最后一句|固定.{0,4}(?:开头|结尾|句数|三句|两句)|必须.{0,6}(?:开头|结尾|句)|回复可以是|建议回复|例如|比如)/.test(normalized);
    if (looksLikeRigidStructure) {
      replacedRigidStructure = true;
      continue;
    }
    result.push(normalized.slice(0, 360));
  }
  if (replacedRigidStructure) {
    result.push('根据客户当下动机、心境和关系灵活组织表达，不固定开头、结尾、句数或示例原句。');
  }
  return mergeStrings(result, 30);
}

function normalizePreferredPatterns(value: unknown) {
  const source = uniqueStrings(value, 20);
  const abstract = source.filter((item) => {
    const text = item.trim();
    if (text.length > 100) return false;
    if (/[“”"「」『』]/.test(text)) return false;
    if (/^(?:您好|亲|看来|听起来|那挺好|要不要|有什么想聊)/.test(text)) return false;
    return !/(?:固定|照着|原句|第一句|最后一句|开头用|结尾用)/.test(text);
  });
  return mergeStrings(abstract, 20);
}


function isAliLegacySalesDirective(value: string) {
  const text = value.replace(/\s+/g, '');
  if (/(?:积极|开心|心情好|情绪好).{0,32}(?:推荐|商品|产品|上新|营销|价值引导)/.test(text)) return true;
  if (/(?:推荐|商品|产品|营销|价值引导).{0,32}(?:积极|开心|心情|情绪)/.test(text)) return true;
  if (/(?:肯定心情|情绪承接)\+.{0,32}(?:推荐|产品|情绪呼应)/.test(text)) return true;
  if (/(?:推荐后|产品后).{0,20}(?:回扣|呼应)(?:情绪|心情)/.test(text)) return true;
  if (/(?:必须先肯定客户当前情绪|必须先肯定情绪|整体不得超过3句话|推荐仅一次|不追问)/.test(text)) return true;
  if (/(?:闲聊|普通聊天).{0,24}(?:商业价值|推荐产品|融入价值引导)/.test(text)) return true;
  if (/(?:要不要试试|可以来点).{0,20}(?:非强制|推荐|产品)/.test(text)) return true;
  return false;
}


function normalizeDeliveryDirectives(value: unknown): CustomerServiceTuningDirectives['delivery'] {
  const source = asObject(value);
  const rawMode = typeof source.mode === 'string' ? source.mode.trim().toUpperCase() : '';
  const mode = ['AUTO', 'SINGLE', 'SEQUENTIAL'].includes(rawMode)
    ? rawMode as CustomerServiceTuningDirectives['delivery']['mode']
    : null;
  const minDelayMs = nonNegativeIntOrNull(source.minDelayMs, 5000);
  let maxDelayMs = nonNegativeIntOrNull(source.maxDelayMs, 5000);
  if (minDelayMs !== null && maxDelayMs !== null && maxDelayMs < minDelayMs) maxDelayMs = minDelayMs;
  return {
    mode,
    maxSegments: positiveIntOrNull(source.maxSegments, 6),
    minDelayMs,
    maxDelayMs,
    splitThresholdChars: positiveIntOrNull(source.splitThresholdChars, 600),
    cancelRemainingOnCustomerMessage: typeof source.cancelRemainingOnCustomerMessage === 'boolean'
      ? source.cancelRemainingOnCustomerMessage
      : null,
  };
}

function mergeDeliveryDirectives(values: CustomerServiceTuningDirectives['delivery'][]): CustomerServiceTuningDirectives['delivery'] {
  return {
    mode: values.find((item) => item.mode !== null)?.mode ?? null,
    maxSegments: firstDefinedLimit(values.map((item) => item.maxSegments)),
    minDelayMs: firstDefinedLimit(values.map((item) => item.minDelayMs)),
    maxDelayMs: firstDefinedLimit(values.map((item) => item.maxDelayMs)),
    splitThresholdChars: firstDefinedLimit(values.map((item) => item.splitThresholdChars)),
    cancelRemainingOnCustomerMessage: values.find((item) => item.cancelRemainingOnCustomerMessage !== null)?.cancelRemainingOnCustomerMessage ?? null,
  };
}

function normalizeEmojiPolicy(value: unknown): CustomerServiceTuningDirectives['emojiPolicy'] {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (['AVOID', 'FORBID', 'DISALLOW', 'NONE', 'NO_EMOJI'].includes(normalized)) return 'AVOID';
  if (normalized === 'ALLOW') return 'ALLOW';
  return 'AUTO';
}

function positiveIntOrNull(value: unknown, max: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : null;
}

function nonNegativeIntOrNull(value: unknown, max: number) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : null;
}

function firstDefinedLimit(values: Array<number | null>) {
  return values.find((value): value is number => value !== null) ?? null;
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
