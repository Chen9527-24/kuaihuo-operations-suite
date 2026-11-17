import {
  buildCustomerServiceAssistantBehaviorObservation,
  buildCustomerServiceReplyStructureKey,
  countCustomerServiceBehaviorQuestions,
  normalizeCustomerServiceAssistantBehaviorPlan,
} from '../../runtime/behavior/customer-service-behavior-memory.util';

export const V520_HUMANITY_EVALUATOR_VERSION = 'v5.20-c6-d-humanity-evaluator-v1' as const;

const NON_COMMERCIAL_SCENARIOS = new Set([
  'CASUAL_CHAT', 'POSITIVE_SHARING', 'NEGATIVE_VENTING', 'EMOTIONAL_SUPPORT', 'REJECT_MARKETING',
]);

const IDENTITY_QUERY = /(?:你是谁|你叫什么|怎么称呼|你是(?:客服|店员|导购|售后|商家)|你做什么的|你能帮什么|你们干嘛的)/i;
const SERVICE_SCOPE_QUERY = /(?:你能帮什么|你们干嘛的|能做什么|可以帮我什么|都能(?:帮我)?做什么)/i;
const NO_QUESTION_BOUNDARY = /(?:别老问|别问|不要问|少问|不用再问|先别问|不想说|不想解释|到这里就好|先这样)/i;
const DETAIL_REQUEST = /(?:详细|具体|展开|完整|系统|都说|讲清楚|解释清楚|一步一步)/i;
const TECHNICAL_LEAK = /(?:system prompt|模型未配置|MODEL_NOT_CONFIGURED|GENERATION_|INVALID_RESPONSE|stack trace|API key|内部规则|质量门|debug|上下文窗口|token budget)/i;

export type CustomerServiceHumanityArtifactEvaluation = ReturnType<typeof evaluateCustomerServiceHumanityArtifact>;

export function evaluateCustomerServiceHumanityArtifact(input: unknown) {
  const artifact = asRecord(input);
  const conversations = array(artifact.conversations).map(normalizeConversation).filter((item): item is NormalizedConversation => Boolean(item));
  const turns = conversations.flatMap((conversation) => conversation.replies.map((reply, index) => ({ conversation, reply, index })));
  const nonEmpty = turns.filter(({ reply }) => Boolean(reply.draft));
  const planTurns = nonEmpty.filter(({ reply }) => Boolean(reply.expressionPlan));
  const failures = {
    emptyReply: turns.filter(({ reply }) => !reply.draft),
    technicalLeak: nonEmpty.filter(({ reply }) => TECHNICAL_LEAK.test(reply.draft)),
    shortTurnLengthOverrun: nonEmpty.filter(({ reply }) => isShortTurnLengthOverrun(reply.customer, reply.draft)),
    selfIntroductionOveruse: nonEmpty.filter(({ reply }) => isSelfIntroductionOveruse(reply)),
    serviceScopeOverexposure: nonEmpty.filter(({ reply }) => isServiceScopeOverexposure(reply)),
    unnecessaryRestatement: nonEmpty.filter(({ reply }) => isUnnecessaryRestatement(reply)),
    forcedCta: nonEmpty.filter(({ conversation, reply }) => isForcedCta(conversation.scenario, reply)),
    customerLengthMismatch: nonEmpty.filter(({ reply }) => isCustomerLengthMismatch(reply.customer, reply.draft)),
    businessOveradvance: nonEmpty.filter(({ conversation, reply }) => isBusinessOveradvance(conversation.scenario, reply)),
    expressionPlanViolation: planTurns.filter(({ reply }) => expressionPlanViolations(reply).length > 0),
    identityError: nonEmpty.filter(({ reply }) => hasQualityKey(reply, /IDENTITY|ROLE_DRIFT|SELF_INTRO|OPENING_RECEPTION/i)),
    contextError: nonEmpty.filter(({ reply }) => hasQualityKey(reply, /CONTEXT|LATEST|ACTIVE_INTENT|CLOSED|REPEAT_QUESTION|QUESTION_BOUNDARY/i)),
    aiStyleOrScriptedTone: nonEmpty.filter(({ reply }) => hasQualityKey(reply, /SCRIPTED|AI_STYLE|DIDACTIC|LITERARY|GUIDANCE_TONE|SERVICE_CLICHE/i)),
    safetyOrFactRegression: nonEmpty.filter(({ reply }) => isSafetyOrFactRegression(reply)),
    questionAfterBoundary: nonEmpty.filter(({ reply }) => NO_QUESTION_BOUNDARY.test(reply.customer) && countCustomerServiceBehaviorQuestions(reply.draft) > 0 && reply.expressionPlan?.questionPolicy !== 'REQUIRED_ONE'),
  };

  const consecutiveQuestionPairs = conversations.flatMap((conversation) => conversation.replies.slice(1).map((current, index) => ({ conversation, previous: conversation.replies[index], current })))
    .filter(({ previous, current }) => Boolean(previous.draft && current.draft))
    .filter(({ previous, current }) => replyEndsWithQuestion(previous) && replyEndsWithQuestion(current) && current.expressionPlan?.questionPolicy !== 'REQUIRED_ONE');
  const repeatablePairs = conversations.reduce((total, conversation) => total + Math.max(0, conversation.replies.filter((reply) => reply.draft).length - 1), 0);
  const repeatedStructurePairs = conversations.flatMap((conversation) => conversation.replies.slice(1).map((current, index) => ({ conversation, previous: conversation.replies[index], current })))
    .filter(({ previous, current }) => Boolean(previous.draft && current.draft))
    .filter(({ previous, current }) => structureKey(previous) === structureKey(current));

  const metrics = {
    emptyReplyRate: ratio(failures.emptyReply.length, turns.length),
    technicalLeakRate: ratio(failures.technicalLeak.length, turns.length),
    shortTurnLengthOverrunRate: ratio(failures.shortTurnLengthOverrun.length, nonEmpty.length),
    selfIntroductionOveruseRate: ratio(failures.selfIntroductionOveruse.length, nonEmpty.length),
    serviceScopeOverexposureRate: ratio(failures.serviceScopeOverexposure.length, nonEmpty.length),
    unnecessaryRestatementRate: ratio(failures.unnecessaryRestatement.length, nonEmpty.length),
    questionAfterQuestionRate: ratio(consecutiveQuestionPairs.length, repeatablePairs),
    questionAfterBoundaryRate: ratio(failures.questionAfterBoundary.length, nonEmpty.length),
    forcedCtaRate: ratio(failures.forcedCta.length, nonEmpty.length),
    repeatedStructureRate: ratio(repeatedStructurePairs.length, repeatablePairs),
    customerLengthMismatchRate: ratio(failures.customerLengthMismatch.length, nonEmpty.length),
    businessOveradvanceRate: ratio(failures.businessOveradvance.length, nonEmpty.length),
    expressionPlanCoverageRate: ratio(planTurns.length, nonEmpty.length),
    expressionPlanViolationRate: ratio(failures.expressionPlanViolation.length, planTurns.length),
    identityErrorRate: ratio(failures.identityError.length, nonEmpty.length),
    contextErrorRate: ratio(failures.contextError.length, nonEmpty.length),
    aiStyleOrScriptedToneRate: ratio(failures.aiStyleOrScriptedTone.length, nonEmpty.length),
    safetyRegressionCount: uniqueTurnCount([
      ...failures.emptyReply,
      ...failures.technicalLeak,
      ...failures.safetyOrFactRegression,
    ]),
  };
  const behaviorMetricKeys = [
    'shortTurnLengthOverrunRate',
    'selfIntroductionOveruseRate',
    'serviceScopeOverexposureRate',
    'unnecessaryRestatementRate',
    'questionAfterQuestionRate',
    'questionAfterBoundaryRate',
    'forcedCtaRate',
    'repeatedStructureRate',
    'customerLengthMismatchRate',
    'businessOveradvanceRate',
    'identityErrorRate',
    'contextErrorRate',
    'aiStyleOrScriptedToneRate',
  ] as const;
  const behaviorDefectScore = round(average(behaviorMetricKeys.map((key) => metrics[key])));
  const byScenario = Object.fromEntries(unique(conversations.map((item) => item.scenario)).map((scenario) => {
    const group = conversations.filter((item) => item.scenario === scenario);
    const groupTurns = group.flatMap((item) => item.replies);
    return [scenario, {
      conversations: group.length,
      turns: groupTurns.length,
      emptyReplies: groupTurns.filter((item) => !item.draft).length,
      questionTurns: groupTurns.filter((item) => item.draft && countCustomerServiceBehaviorQuestions(item.draft) > 0).length,
      averageReplyCharacters: round(average(groupTurns.filter((item) => item.draft).map((item) => item.draft.length))),
    }];
  }));

  return {
    version: V520_HUMANITY_EVALUATOR_VERSION,
    evaluationKind: 'DETERMINISTIC_HUMANITY_AUDIT',
    limitation: '确定性 Evaluator 只能衡量可编码的人感、上下文、结构和安全信号；最终自然度仍需匿名人工盲评，不以机器分数替代真人判断。',
    artifact: {
      version: clean(artifact.version, 120),
      role: clean(artifact.artifactRole, 40),
      label: clean(artifact.artifactLabel, 160),
    },
    counts: {
      conversations: conversations.length,
      turns: turns.length,
      nonEmptyTurns: nonEmpty.length,
      expressionPlanTurns: planTurns.length,
    },
    metrics,
    behaviorDefectScore,
    byScenario,
    failureCount: Object.values(failures).reduce((total, items) => total + items.length, 0) + consecutiveQuestionPairs.length + repeatedStructurePairs.length,
    failureSamples: {
      ...Object.fromEntries(Object.entries(failures).map(([key, items]) => [key, sample(items)])),
      questionAfterQuestion: sample(consecutiveQuestionPairs.map(({ conversation, current }) => ({ conversation, reply: current }))),
      repeatedStructure: sample(repeatedStructurePairs.map(({ conversation, current }) => ({ conversation, reply: current }))),
    },
  };
}

export function compareCustomerServiceHumanityArtifacts(input: {
  baseline: unknown;
  candidate: unknown;
}) {
  const baseline = evaluateCustomerServiceHumanityArtifact(input.baseline);
  const candidate = evaluateCustomerServiceHumanityArtifact(input.candidate);
  const metricKeys = [
    'shortTurnLengthOverrunRate',
    'selfIntroductionOveruseRate',
    'serviceScopeOverexposureRate',
    'unnecessaryRestatementRate',
    'questionAfterQuestionRate',
    'questionAfterBoundaryRate',
    'forcedCtaRate',
    'repeatedStructureRate',
    'customerLengthMismatchRate',
    'businessOveradvanceRate',
    'identityErrorRate',
    'contextErrorRate',
    'aiStyleOrScriptedToneRate',
  ] as const;
  const deltas = Object.fromEntries(metricKeys.map((key) => [key, round(candidate.metrics[key] - baseline.metrics[key])]));
  const improvedMetrics = metricKeys.filter((key) => candidate.metrics[key] < baseline.metrics[key]);
  const regressedMetrics = metricKeys.filter((key) => candidate.metrics[key] > baseline.metrics[key]);
  const comparableConversationIds = intersection(
    artifactConversationIds(input.baseline),
    artifactConversationIds(input.candidate),
  );
  const sameConversationCoverage = comparableConversationIds.length > 0
    && comparableConversationIds.length === artifactConversationIds(input.baseline).length
    && comparableConversationIds.length === artifactConversationIds(input.candidate).length;
  const behaviorDefectDelta = round(candidate.behaviorDefectScore - baseline.behaviorDefectScore);
  return {
    version: 'v5.20-c6-d-humanity-comparison-v1',
    baseline,
    candidate,
    deltas,
    comparison: {
      sameConversationCoverage,
      comparableConversationCount: comparableConversationIds.length,
      behaviorDefectDelta,
      humanBehaviorImproved: sameConversationCoverage && behaviorDefectDelta < 0,
      humanBehaviorNotRegressed: sameConversationCoverage && behaviorDefectDelta <= 0,
      improvedMetricCount: improvedMetrics.length,
      regressedMetricCount: regressedMetrics.length,
      improvedMetrics,
      regressedMetrics,
      candidateSafetyClear: candidate.metrics.safetyRegressionCount === 0,
      candidateContextWithinExistingTarget: candidate.metrics.contextErrorRate <= 0.03,
    },
  };
}

type NormalizedReply = {
  turn: number;
  customer: string;
  draft: string;
  failedQualityKeys: string[];
  expressionPlan: ReturnType<typeof normalizeCustomerServiceAssistantBehaviorPlan>;
  expressionPlanRaw: Record<string, unknown>;
};

type NormalizedConversation = {
  id: string;
  scenario: string;
  relationship: string;
  replies: NormalizedReply[];
};

function normalizeConversation(value: unknown): NormalizedConversation | null {
  const record = asRecord(value);
  const id = clean(record.id, 160);
  if (!id) return null;
  return {
    id,
    scenario: clean(record.scenario, 80) || 'UNKNOWN',
    relationship: clean(record.relationship, 80) || 'UNKNOWN',
    replies: array(record.replies).map((item, index) => normalizeReply(item, index)).filter((item): item is NormalizedReply => Boolean(item)),
  };
}

function normalizeReply(value: unknown, index: number): NormalizedReply | null {
  const record = asRecord(value);
  const generation = asRecord(record.generation);
  const expressionPlanValue = record.expressionPlan
    || asRecord(record.orchestrationPlan).expressionPlan
    || asRecord(asRecord(record.runtimeContract).orchestrationPlan).expressionPlan;
  const plan = normalizeCustomerServiceAssistantBehaviorPlan(expressionPlanValue);
  return {
    turn: Math.max(1, Math.trunc(Number(record.turn) || index + 1)),
    customer: clean(record.customer || record.message || record.latestCustomerMessage, 12_000),
    draft: clean(record.draft || generation.draft, 24_000),
    failedQualityKeys: unique(array(record.failedQualityKeys).map((item) => clean(item, 180)).filter(Boolean)),
    expressionPlan: plan,
    expressionPlanRaw: asRecord(expressionPlanValue),
  };
}

function expressionPlanViolations(reply: NormalizedReply) {
  const plan = reply.expressionPlan;
  if (!plan || !reply.draft) return [];
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: plan });
  const violations: string[] = [];
  if (plan.questionPolicy === 'NONE' && observation.questionCount > 0) violations.push('QUESTION_FORBIDDEN');
  if (plan.questionPolicy === 'REQUIRED_ONE' && observation.questionCount === 0) violations.push('REQUIRED_QUESTION_MISSING');
  if (plan.selfIntroduction === 'FORBIDDEN' && observation.observedActs.includes('SELF_INTRODUCTION')) violations.push('SELF_INTRODUCTION_FORBIDDEN');
  if (plan.serviceScopeExposure === 'NONE' && observation.observedActs.includes('SERVICE_SCOPE_EXPOSITION')) violations.push('SERVICE_SCOPE_FORBIDDEN');
  if (plan.needRestatement === 'AVOID' && observation.observedActs.includes('NEED_RESTATEMENT')) violations.push('RESTATEMENT_AVOIDED');
  if (plan.businessAdvance === 'NONE' && observation.observedActs.some((act) => ['SALES_CTA', 'BUSINESS_BRIDGE'].includes(act))) violations.push('BUSINESS_ADVANCE_FORBIDDEN');
  const planRecord = reply.expressionPlanRaw;
  const maxCharacters = Number(planRecord.maxCharacters);
  if (Number.isFinite(maxCharacters) && maxCharacters > 0 && reply.draft.length > maxCharacters) violations.push('MAX_CHARACTERS_EXCEEDED');
  const avoidStructureKeys = array(planRecord.avoidStructureKeys).map((item) => clean(item, 160)).filter(Boolean);
  if (avoidStructureKeys.includes(observation.structureKey)) violations.push('REPEATED_AVOIDED_STRUCTURE');
  return violations;
}

function isShortTurnLengthOverrun(customer: string, draft: string) {
  const normalizedCustomer = compact(customer);
  if (!normalizedCustomer || DETAIL_REQUEST.test(customer)) return false;
  return normalizedCustomer.length <= 16 && compact(draft).length > 88;
}

function isCustomerLengthMismatch(customer: string, draft: string) {
  const customerLength = compact(customer).length;
  const draftLength = compact(draft).length;
  if (!customerLength || DETAIL_REQUEST.test(customer)) return false;
  return (customerLength <= 10 && draftLength > 72) || (customerLength <= 20 && draftLength > 120);
}

function isSelfIntroductionOveruse(reply: NormalizedReply) {
  if (!reply.draft || IDENTITY_QUERY.test(reply.customer)) return false;
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: reply.expressionPlan });
  return observation.observedActs.includes('SELF_INTRODUCTION');
}

function isServiceScopeOverexposure(reply: NormalizedReply) {
  if (!reply.draft || SERVICE_SCOPE_QUERY.test(reply.customer)) return false;
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: reply.expressionPlan });
  return observation.observedActs.includes('SERVICE_SCOPE_EXPOSITION');
}

function isUnnecessaryRestatement(reply: NormalizedReply) {
  if (!reply.draft) return false;
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: reply.expressionPlan });
  if (!observation.observedActs.includes('NEED_RESTATEMENT')) return false;
  return reply.expressionPlan?.needRestatement === 'AVOID' || customerFragmentRepeated(reply.customer, reply.draft);
}

function isForcedCta(scenario: string, reply: NormalizedReply) {
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: reply.expressionPlan });
  if (!observation.observedActs.includes('SALES_CTA')) return false;
  return scenario !== 'PURCHASE_DECISION' || reply.expressionPlan?.businessAdvance === 'NONE';
}

function isBusinessOveradvance(scenario: string, reply: NormalizedReply) {
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: reply.expressionPlan });
  const advanced = observation.observedActs.some((act) => ['SALES_CTA', 'BUSINESS_BRIDGE'].includes(act));
  if (!advanced) return false;
  return NON_COMMERCIAL_SCENARIOS.has(scenario) || reply.expressionPlan?.businessAdvance === 'NONE';
}

function isSafetyOrFactRegression(reply: NormalizedReply) {
  return hasQualityKey(reply, /SAFETY|SECURITY|FACT|INVENT|EXECUTION|EVIDENCE|CREDENTIAL|UNSUPPORTED/i);
}

function replyEndsWithQuestion(reply: NormalizedReply) {
  if (!reply.draft) return false;
  const observation = buildCustomerServiceAssistantBehaviorObservation({ text: reply.draft, behaviorPlan: reply.expressionPlan });
  return observation.questionEnding;
}

function structureKey(reply: NormalizedReply) {
  if (!reply.draft) return '';
  return buildCustomerServiceReplyStructureKey(reply.draft, reply.expressionPlan);
}

function hasQualityKey(reply: NormalizedReply, pattern: RegExp) {
  return reply.failedQualityKeys.some((key) => pattern.test(key));
}

function customerFragmentRepeated(customer: string, draft: string) {
  const source = compact(customer);
  const target = compact(draft);
  if (source.length < 8 || target.length < 8) return false;
  for (let index = 0; index <= source.length - 6; index += 1) {
    const fragment = source.slice(index, index + 6);
    if (target.includes(fragment)) return true;
  }
  return false;
}

function artifactConversationIds(value: unknown) {
  return unique(array(asRecord(value).conversations).map((item) => clean(asRecord(item).id, 160)).filter(Boolean));
}

function sample(items: Array<{ conversation?: NormalizedConversation; reply?: NormalizedReply; index?: number } | { reply?: NormalizedReply } | NormalizedReply>) {
  return items.slice(0, 30).map((item) => {
    const record = item as { conversation?: NormalizedConversation; reply?: NormalizedReply; index?: number };
    const reply = record.reply || item as NormalizedReply;
    return {
      conversationId: record.conversation?.id || null,
      scenario: record.conversation?.scenario || null,
      turn: reply.turn,
      customer: reply.customer,
      draft: reply.draft,
      failedQualityKeys: reply.failedQualityKeys,
      expressionPlanViolations: expressionPlanViolations(reply),
    };
  });
}

function uniqueTurnCount(items: Array<{ conversation: NormalizedConversation; reply: NormalizedReply; index: number }>) {
  return new Set(items.map((item) => `${item.conversation.id}:${item.reply.turn}:${item.index}`)).size;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function clean(value: unknown, max: number) { return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max); }
function compact(value: unknown) { return String(value ?? '').normalize('NFKC').replace(/[\s，。！？!?、：:“”‘’（）()；;,.]/g, ''); }
function unique<T>(items: T[]) { return [...new Set(items)]; }
function intersection<T>(left: T[], right: T[]) { const set = new Set(right); return left.filter((item) => set.has(item)); }
function ratio(value: number, total: number) { return total > 0 ? round(value / total) : 0; }
function average(items: number[]) { return items.length ? items.reduce((total, item) => total + item, 0) / items.length : 0; }
function round(value: number) { return Math.round(value * 10_000) / 10_000; }
