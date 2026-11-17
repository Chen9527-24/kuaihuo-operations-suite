import type {
  CustomerServiceAssistantBehaviorObservation,
  CustomerServiceAssistantBehaviorPlanSnapshot,
  CustomerServiceAssistantMoveLedgerEntry,
  CustomerServiceBehaviorHistoryProjection,
} from '../state/customer-service-conversation-state.type';
import type {
  CustomerServiceMessageUnderstanding,
  CustomerServiceRequestedDelta,
} from '../understanding/types/customer-service-message-understanding.type';
import {
  CUSTOMER_SERVICE_ACT_TYPES,
  CUSTOMER_SERVICE_ANSWER_FOCUS_KINDS,
  CUSTOMER_SERVICE_INTERACTION_TYPES,
  type CustomerServiceActType,
  type CustomerServiceInteractionPlanShadowSnapshot,
} from '../interaction/customer-service-interaction-plan.type';

const BEHAVIOR_HISTORY_WINDOW = 8;

export function extractCustomerServiceBehaviorPlanFromRuntimeContract(value: unknown) {
  const contract = asRecord(value);
  const orchestrationPlan = asRecord(contract.orchestrationPlan);
  return normalizeCustomerServiceAssistantBehaviorPlan(orchestrationPlan.expressionPlan);
}


export function extractCustomerServiceInteractionPlanV2FromRuntimeContract(value: unknown) {
  const contract = asRecord(value);
  const orchestrationPlan = asRecord(contract.orchestrationPlan);
  return normalizeCustomerServiceInteractionPlanV2Shadow(orchestrationPlan.interactionPlanV2);
}


export function extractCustomerServiceProvenGroundingRefsFromReplyTrace(generationDetails: unknown) {
  const generation = asRecord(generationDetails);
  const hve3 = asRecord(generation.hve3);
  const conformance = asRecord(hve3.semanticConformance);
  const decision = clean(conformance.decision, 80);
  if (!['PASS', 'REMOVED_UNAUTHORIZED_SPANS'].includes(decision)) return [];
  const unitChecks = Array.isArray(conformance.unitChecks) ? conformance.unitChecks.map(asRecord) : [];
  return uniqueStrings(unitChecks
    .filter((unit) => unit.authorized === true)
    .flatMap((unit) => stringArray(unit.realizedGroundingRefs)))
    .slice(0, 32);
}

export function normalizeCustomerServiceProvenGroundedUnits(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).map(asRecord).map((unit) => ({
    text: clean(unit.text, 2000),
    groundingRefs: uniqueStrings(stringArray(unit.groundingRefs)).slice(0, 32),
  })).filter((unit) => unit.text && unit.groundingRefs.length > 0);
}

export function extractCustomerServiceProvenGroundedUnitsFromReplyTrace(value: unknown) {
  const conformance = asRecord(asRecord(asRecord(value).hve3).semanticConformance);
  if (!['PASS', 'REMOVED_UNAUTHORIZED_SPANS'].includes(clean(conformance.decision, 80))) return [];
  const units = Array.isArray(conformance.unitChecks) ? conformance.unitChecks.map(asRecord) : [];
  return normalizeCustomerServiceProvenGroundedUnits(units.filter((unit) => unit.authorized === true).flatMap((unit) => {
    const spans = Array.isArray(unit.semanticSpans) ? unit.semanticSpans.map(asRecord).filter((span) => span.authorized === true) : [];
    // Conformance already pairs each immutable atom with its own proven refs.
    // A generated unit can compare several entities; unioning its atoms loses
    // the relation needed by the next turn. Never split a multi-ref atom here.
    return spans.map((span) => ({
      text: typeof span.exactText === 'string' ? span.exactText : '',
      groundingRefs: uniqueStrings(stringArray(span.realizedGroundingRefs)),
    }));
  }));
}

export function resolveCustomerServicePlanFulfillmentFromReplyTrace(input: {
  fallbackUsed?: unknown;
  generationDetails?: unknown;
  runtimeContract?: unknown;
}) {
  const generation = asRecord(input.generationDetails);
  const hve3 = asRecord(generation.hve3);
  const degradation = asRecord(hve3.controlledDegradation);
  if (generation.finalReplySource === 'FAILURE_NOTICE'
    || (degradation.applied === true && degradation.planSatisfied === false)) {
    return 'NOT_FULFILLED' as const;
  }
  const contract = asRecord(input.runtimeContract);
  const replyPlan = asRecord(contract.replyPlan);
  const fixedQa = asRecord(replyPlan.fixedQa);
  if (generation.finalReplySource === 'FIXED_QA' && generation.status === 'DETERMINISTIC'
    && typeof fixedQa.answer === 'string' && fixedQa.answer.trim()
    && generation.draft === fixedQa.answer && replyPlan.exactReply === fixedQa.answer) {
    return 'FULFILLED' as const;
  }
  const conformance = asRecord(hve3.semanticConformance);
  if (!['PASS', 'REMOVED_UNAUTHORIZED_SPANS'].includes(clean(conformance.decision, 80))) return 'UNKNOWN' as const;
  const requiredValueCompletion = asRecord(conformance.requiredValueCompletion);
  // A permission-reducing correction may safely deliver an independently authorized
  // task-material contribution even though a Required merchant proposition was removed.
  // Preserve that delivered evidence/history, but never certify the full Canonical plan
  // as fulfilled merely because the corrected candidate remained sendable.
  if (requiredValueCompletion.status === 'PARTIAL_SAFE_CONTINUATION') return 'UNKNOWN' as const;
  const plan = asRecord(asRecord(contract.orchestrationPlan).interactionPlanV2);
  const target = asRecord(asRecord(plan.answerObligation).responseTarget);
  // Conformance proves selected Acts, not cross-turn novelty or depth.
  if (target.requiredDelta && target.requiredDelta !== 'NONE') return 'UNKNOWN' as const;
  const required = (Array.isArray(plan.acts) ? plan.acts.map(asRecord) : []).filter((act) => act.necessity === 'REQUIRED' && act.type !== 'STOP');
  if (!required.length || required.some((act) => !clean(act.id, 160))) return 'UNKNOWN' as const;
  const units = Array.isArray(conformance.unitChecks) ? conformance.unitChecks.map(asRecord) : [];
  const realized = new Set(units.filter((unit) => unit.authorized === true).flatMap((unit) =>
    (Array.isArray(unit.semanticSpans) ? unit.semanticSpans.map(asRecord) : [])
      .filter((span) => span.authorized === true).flatMap((span) => stringArray(span.realizedActIds))));
  if (required.every((act) => realized.has(clean(act.id, 160)))) return 'FULFILLED' as const;
  return 'UNKNOWN' as const;
}

export function normalizeCustomerServiceInteractionPlanV2Shadow(
  value: unknown,
): CustomerServiceInteractionPlanShadowSnapshot | null {
  const record = asRecord(value);
  if (Number(record.schemaVersion) !== 2 || record.shadow !== true) return null;
  const interactionType = clean(record.interactionType, 80);
  if (!CUSTOMER_SERVICE_INTERACTION_TYPES.includes(interactionType as any)) return null;
  const acts = Array.isArray(record.acts) ? record.acts.map(asRecord) : [];
  const suppressed = Array.isArray(record.suppressedActs) ? record.suppressedActs.map(asRecord) : [];
  const completion = asRecord(record.completion);
  const answerObligation = asRecord(record.answerObligation);
  const responseTarget = asRecord(answerObligation.responseTarget);
  const completionMode = clean(completion.mode, 60);
  const answerFocusValue = clean(responseTarget.focus || answerObligation.currentFocus, 80);
  const requestedSpecificityValue = clean(responseTarget.requestedSpecificity, 40);
  const requiredDeltaValue = clean(responseTarget.requiredDelta, 40);
  if (!['STOP_AFTER_REQUIRED', 'WAIT_CUSTOMER', 'ALLOW_CONTINUATION', 'HANDOFF'].includes(completionMode)) return null;
  const actTypes = (necessity: string) => uniqueStrings(
    acts
      .filter((item) => item.necessity === necessity)
      .map((item) => clean(item.type, 80))
      .filter((item) => CUSTOMER_SERVICE_ACT_TYPES.includes(item as any)),
  ) as CustomerServiceActType[];
  return {
    schemaVersion: 2,
    shadow: true,
    interactionType: interactionType as CustomerServiceInteractionPlanShadowSnapshot['interactionType'],
    requiredActs: actTypes('REQUIRED'),
    preferredActs: actTypes('PREFERRED'),
    optionalActs: actTypes('OPTIONAL'),
    suppressedActs: suppressed
      .map((item) => ({
        type: clean(item.type, 80) as CustomerServiceActType,
        enforcement: item.enforcement === 'HARD' ? 'HARD' as const : 'SOFT' as const,
      }))
      .filter((item) => CUSTOMER_SERVICE_ACT_TYPES.includes(item.type as any))
      .slice(0, 32),
    completionMode: completionMode as CustomerServiceInteractionPlanShadowSnapshot['completionMode'],
    answerFocus: CUSTOMER_SERVICE_ANSWER_FOCUS_KINDS.includes(answerFocusValue as any)
      ? answerFocusValue as CustomerServiceInteractionPlanShadowSnapshot['answerFocus']
      : null,
    requestedSpecificity: ['SUMMARY', 'DIRECTION', 'CONCRETE', 'DETAIL', 'EXHAUSTIVE'].includes(requestedSpecificityValue)
      ? requestedSpecificityValue as CustomerServiceInteractionPlanShadowSnapshot['requestedSpecificity']
      : null,
    requiredDelta: ['NONE', 'NEW_FACET', 'MORE_SPECIFIC', 'MORE_DETAIL', 'DIFFERENT_APPROACH', 'CORRECT', 'COMPLETE_CURRENT_FOCUS'].includes(requiredDeltaValue)
      ? requiredDeltaValue as CustomerServiceInteractionPlanShadowSnapshot['requiredDelta']
      : null,
    trackingKeys: uniqueStrings(acts.map((item) => clean(item.trackingKey, 160))).slice(0, 32),
  };
}

export function normalizeCustomerServiceAssistantBehaviorPlan(
  value: unknown,
): CustomerServiceAssistantBehaviorPlanSnapshot | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    interactionMode: clean(record.interactionMode, 40),
    questionPolicy: enumValue(record.questionPolicy, ['NONE', 'OPTIONAL_ONE', 'REQUIRED_ONE'] as const, 'UNKNOWN'),
    businessAdvance: enumValue(record.businessAdvance, ['NONE', 'SOFT', 'NORMAL'] as const, 'UNKNOWN'),
    selfIntroduction: clean(record.selfIntroduction, 40),
    identityResponse: clean(record.identityResponse, 40),
    serviceScopeExposure: clean(record.serviceScopeExposure, 40),
    needRestatement: clean(record.needRestatement, 40),
    completionStyle: clean(record.completionStyle, 40),
    requiredActs: stringArray(record.requiredActs).slice(0, 24),
    optionalActs: stringArray(record.optionalActs).slice(0, 24),
    forbiddenActs: stringArray(record.forbiddenActs).slice(0, 24),
  };
}

export function normalizeCustomerServiceAssistantBehaviorObservation(
  value: unknown,
): CustomerServiceAssistantBehaviorObservation | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  const plan = normalizeCustomerServiceAssistantBehaviorPlan(record.plan);
  const interactionPlanV2 = normalizeCustomerServiceInteractionPlanV2Shadow(record.interactionPlanV2);
  return {
    logicalActionKey: clean(record.logicalActionKey, 640),
    replyAttemptId: clean(record.replyAttemptId, 512),
    replyTraceId: clean(record.replyTraceId, 512),
    evidenceMessageIds: uniqueStrings(stringArray(record.evidenceMessageIds)).slice(-20),
    source: record.source === 'TRACE_AND_TEXT' ? 'TRACE_AND_TEXT' : 'TEXT_HEURISTIC',
    plan,
    interactionPlanV2,
    planFulfillment: ['FULFILLED', 'NOT_FULFILLED'].includes(String(record.planFulfillment))
      ? record.planFulfillment as 'FULFILLED' | 'NOT_FULFILLED'
      : 'UNKNOWN',
    taskId: clean(record.taskId, 160) || undefined,
    realizedGroundingRefs: uniqueStrings(stringArray(record.realizedGroundingRefs)).slice(0, 32),
    provenGroundedUnits: normalizeCustomerServiceProvenGroundedUnits(record.provenGroundedUnits),
    observedActs: uniqueStrings(stringArray(record.observedActs)).slice(0, 32),
    questionCount: Math.max(0, Math.min(8, Math.trunc(Number(record.questionCount) || 0))),
    questionEnding: record.questionEnding === true,
    structureKey: clean(record.structureKey, 160),
  };
}

export function buildCustomerServiceAssistantBehaviorObservation(input: {
  text: string;
  replyAttemptId?: string | null;
  replyTraceId?: string | null;
  evidenceMessageIds?: string[];
  behaviorPlan?: unknown;
  interactionPlanV2?: unknown;
  planFulfillment?: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
  taskId?: string | null;
  realizedGroundingRefs?: string[];
  provenGroundedUnits?: CustomerServiceAssistantBehaviorObservation['provenGroundedUnits'];
}): CustomerServiceAssistantBehaviorObservation {
  const text = normalizeText(input.text);
  const plan = normalizeCustomerServiceAssistantBehaviorPlan(input.behaviorPlan);
  const interactionPlanV2 = normalizeCustomerServiceInteractionPlanV2Shadow(input.interactionPlanV2);
  const replyTraceId = clean(input.replyTraceId, 512);
  const replyAttemptId = clean(input.replyAttemptId, 512);
  const evidenceMessageIds = uniqueStrings(input.evidenceMessageIds ?? []).slice(-20);
  const logicalActionKey = replyTraceId
    ? `trace:${replyTraceId}`
    : replyAttemptId
      ? `attempt:${replyAttemptId}`
      : evidenceMessageIds[0]
        ? `message:${evidenceMessageIds[0]}`
        : '';
  const questionCount = countCustomerServiceBehaviorQuestions(text);
  const questionEnding = customerServiceReplyEndsWithQuestion(text);
  const observedActs = projectObservedActsFromStructuredContracts({
    plan,
    interactionPlanV2,
    planFulfillment: input.planFulfillment || 'UNKNOWN',
    questionCount,
    questionEnding,
  });
  const provenGroundedUnits = normalizeCustomerServiceProvenGroundedUnits(input.provenGroundedUnits)
    .filter((unit) => text.includes(normalizeText(unit.text)));
  const deliveredRefs = new Set(provenGroundedUnits.flatMap((unit) => unit.groundingRefs));
  return {
    logicalActionKey,
    replyAttemptId,
    replyTraceId,
    evidenceMessageIds,
    source: plan ? 'TRACE_AND_TEXT' : 'TEXT_HEURISTIC',
    plan,
    interactionPlanV2,
    planFulfillment: input.planFulfillment || 'UNKNOWN',
    taskId: clean(input.taskId, 160) || undefined,
    realizedGroundingRefs: uniqueStrings(input.realizedGroundingRefs ?? [])
      .filter((ref) => !input.provenGroundedUnits?.length || deliveredRefs.has(ref)).slice(0, 32),
    provenGroundedUnits,
    observedActs,
    questionCount,
    questionEnding,
    structureKey: buildCustomerServiceReplyStructureKey(text, plan, observedActs, questionEnding),
  };
}

export function resolveCustomerServiceProvenEvidenceRecall(input: {
  understanding: CustomerServiceMessageUnderstanding;
  assistantMoveLedger: CustomerServiceAssistantMoveLedgerEntry[];
}) {
  const ledger = input.assistantMoveLedger;
  const latestBehavior = ledger.at(-1)?.behavior || null;
  const latestRefs = uniqueStrings(latestBehavior?.realizedGroundingRefs || []).slice(0, 32);
  if (!latestRefs.length && !ledger.some((entry) => entry.behavior?.realizedGroundingRefs?.length)) return [];

  // Explicit contextual-reference continuity remains the narrowest owner: it may
  // only reuse refs already proven on the latest delivered assistant behavior.
  const latestSet = new Set(latestRefs);
  const contextual = uniqueStrings(input.understanding.contextualReferentSelection?.groundingRefs || [])
    .filter((ref) => latestSet.has(ref));
  if (contextual.length) return contextual.slice(0, 32);
  if (input.understanding.factOwnership?.namedOfferingReferent?.source === 'CONTEXTUAL_GROUNDED_ENTITY') {
    return latestRefs;
  }

  // Same-task recall is evidence visibility only. Positive eligibility comes from
  // the typed state/goal owners, never from customer wording, punctuation, titles,
  // similarity, or assistant prose. Current named-offering identity is handled by
  // the current-message entity owner instead of replaying prior task evidence.
  const human = input.understanding.humanContext;
  const taskSignal = human.stateTruthSignal.task;
  const currentTaskId = String(human.conversationTaskState.activeTaskId || '').trim();
  const targetTaskId = String(taskSignal.targetTaskId || '').trim();
  const sameTask = ['CONTINUE_CURRENT', 'RESUME_EXISTING'].includes(taskSignal.relation)
    && Boolean(targetTaskId)
    && targetTaskId === currentTaskId;
  const merchantDecision = human.requiredTurnGoals.some((goal) =>
    goal.requestedContributionKind === 'DECISION_SUPPORT'
    && goal.requestedEvidenceScope === 'MERCHANT_BUSINESS'
    && ['SELECT_OR_PRIORITIZE_OPTION', 'ASSESS_CURRENT_OPTION'].includes(goal.requestedDecisionMode || 'NOT_APPLICABLE'));
  const currentNamedOffering = (input.understanding.namedOfferingMentionSpans || []).length > 0;
  const feedback = human.dialogueObligation;
  const suppressPriorOptions = ['REJECTED', 'CORRECTED', 'WITHDRAWN', 'ESCALATED'].includes(feedback.userFeedback)
    || feedback.requestedDeltas.some((delta) => ['ANOTHER_OPTION', 'NO_SPECIFIC_RECOMMENDATION', 'STOP_CURRENT_TOPIC'].includes(delta));
  if (!sameTask || !merchantDecision || currentNamedOffering || suppressPriorOptions) return [];

  return uniqueStrings(ledger.flatMap((entry) => {
    const behavior = entry.behavior;
    if (!behavior || behavior.taskId !== targetTaskId || entry.rejected) return [];
    if (entry.requestedDeltas.some((delta) => ['ANOTHER_OPTION', 'NO_SPECIFIC_RECOMMENDATION', 'STOP_CURRENT_TOPIC'].includes(delta))) return [];
    return behavior.realizedGroundingRefs || [];
  })).slice(0, 32);
}

export function buildCustomerServiceBehaviorHistoryProjection(
  ledger: CustomerServiceAssistantMoveLedgerEntry[],
): CustomerServiceBehaviorHistoryProjection {
  const recent = ledger.slice(-BEHAVIOR_HISTORY_WINDOW);
  const normalized = recent.map((entry) => ({
    entry,
    behavior: entry.behavior || buildCustomerServiceAssistantBehaviorObservation({ text: entry.excerpt }),
  }));
  const questionTurns = normalized.filter(({ behavior }) => behavior.questionCount > 0 || behavior.questionEnding);
  let consecutiveQuestionEndingTurns = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (!normalized[index].behavior.questionEnding) break;
    consecutiveQuestionEndingTurns += 1;
  }
  const hasAct = (behavior: CustomerServiceAssistantBehaviorObservation, act: string) => behavior.observedActs.includes(act);
  const recentRequestedDeltas = uniqueStrings(
    recent.slice(-6).flatMap((entry) => entry.requestedDeltas || []),
  ) as CustomerServiceRequestedDelta[];
  return {
    windowSize: recent.length,
    recentQuestionTurns: questionTurns.map(({ entry }) => entry.turn),
    consecutiveQuestionEndingTurns,
    recentOptionalQuestionCount: normalized.filter(({ behavior }) => behavior.questionCount > 0 && behavior.plan?.questionPolicy === 'OPTIONAL_ONE').length,
    recentRequiredQuestionCount: normalized.filter(({ behavior }) => behavior.questionCount > 0 && behavior.plan?.questionPolicy === 'REQUIRED_ONE').length,
    recentSuggestionQuestionTurns: normalized.filter(({ behavior }) => (
      behavior.questionCount > 0
      && (hasAct(behavior, 'LIGHT_SUGGESTION') || hasAct(behavior, 'PRODUCT_SUGGESTION'))
    )).length,
    recentCtaCount: normalized.filter(({ behavior }) => hasAct(behavior, 'SALES_CTA')).length,
    recentBusinessAdvanceCount: normalized.filter(({ behavior }) => (
      hasAct(behavior, 'SALES_CTA')
      || hasAct(behavior, 'BUSINESS_BRIDGE')
      || (behavior.plan?.businessAdvance !== undefined && !['NONE', 'UNKNOWN'].includes(behavior.plan.businessAdvance))
    )).length,
    recentSelfIntroCount: normalized.filter(({ behavior }) => hasAct(behavior, 'SELF_INTRODUCTION')).length,
    recentServiceScopeCount: normalized.filter(({ behavior }) => hasAct(behavior, 'SERVICE_SCOPE_EXPOSITION')).length,
    recentRestatementCount: normalized.filter(({ behavior }) => hasAct(behavior, 'NEED_RESTATEMENT')).length,
    recentSuggestionCount: normalized.filter(({ behavior }) => (
      hasAct(behavior, 'LIGHT_SUGGESTION') || hasAct(behavior, 'PRODUCT_SUGGESTION')
    )).length,
    recentInteractionModes: normalized.map(({ behavior }) => behavior.plan?.interactionMode || '').filter(Boolean),
    recentStructureKeys: normalized.map(({ behavior }) => behavior.structureKey).filter(Boolean),
    recentOpeningKeys: recent.map((entry) => entry.openingKey).filter(Boolean),
    recentEndingKeys: recent.map((entry) => entry.endingKey).filter(Boolean),
    lastAssistantMoveAccepted: recent.length ? (recent[recent.length - 1]?.accepted ?? null) : null,
    lastAssistantMoveRejected: recent.length ? recent[recent.length - 1]?.rejected === true : false,
    recentRequestedDeltas,
    lastAssistantAskedQuestion: normalized.length ? Boolean(normalized[normalized.length - 1]?.behavior.questionCount || normalized[normalized.length - 1]?.behavior.questionEnding) : false,
  };
}

export function buildCustomerServiceReplyStructureKey(
  text: string,
  planValue?: unknown,
  observedActsValue?: string[],
  questionEndingValue?: boolean,
) {
  const normalized = normalizeText(text);
  const plan = normalizeCustomerServiceAssistantBehaviorPlan(planValue);
  const observedActs = observedActsValue?.length ? observedActsValue : projectObservedActsFromStructuredContracts({
    plan,
    interactionPlanV2: null,
    planFulfillment: 'UNKNOWN',
    questionCount: countCustomerServiceBehaviorQuestions(normalized),
    questionEnding: customerServiceReplyEndsWithQuestion(normalized),
  });
  const questionEnding = questionEndingValue ?? customerServiceReplyEndsWithQuestion(normalized);
  const tokens: string[] = [];
  if (observedActs.includes('SELF_INTRODUCTION') || observedActs.includes('IDENTITY_RESPONSE') || observedActs.includes('NAME_RESPONSE')) tokens.push('IDENTITY');
  if (observedActs.includes('SERVICE_SCOPE_EXPOSITION')) tokens.push('SCOPE');
  if (observedActs.includes('LIGHT_ACK') || observedActs.includes('SPECIFIC_ACK')) tokens.push('ACK');
  if (observedActs.includes('NEED_RESTATEMENT')) tokens.push('RESTATE');
  if (observedActs.includes('DIRECT_ANSWER')) tokens.push('ANSWER');
  if (observedActs.includes('LIGHT_SUGGESTION') || observedActs.includes('PRODUCT_SUGGESTION')) tokens.push('SUGGEST');
  if (observedActs.includes('BUSINESS_BRIDGE')) tokens.push('BRIDGE');
  if (observedActs.includes('SALES_CTA')) tokens.push('CTA');
  if (questionEnding || observedActs.some((act) => ['OPTIONAL_QUESTION', 'REQUIRED_QUESTION', 'CLARIFYING_QUESTION'].includes(act))) tokens.push('QUESTION');
  if (!questionEnding && observedActs.includes('NATURAL_CLOSE')) tokens.push('CLOSE');
  if (!questionEnding && observedActs.includes('NATURAL_STOP')) tokens.push('STOP');
  if (!tokens.length && plan?.interactionMode) tokens.push(plan.interactionMode);
  if (!tokens.length) tokens.push('DIRECT');
  return uniqueStrings(tokens).join('+').slice(0, 160);
}

export function countCustomerServiceBehaviorQuestions(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  // Surface punctuation is structure-only observability. It never creates a semantic
  // question Act; semantic question ownership comes from the typed Canonical plan.
  return (normalized.match(/[?？]/g) || []).length;
}

function customerServiceReplyEndsWithQuestion(value: string) {
  const normalized = normalizeText(value);
  return Boolean(normalized && /[?？]\s*$/.test(normalized));
}

function projectObservedActsFromStructuredContracts(input: {
  plan: CustomerServiceAssistantBehaviorPlanSnapshot | null;
  interactionPlanV2: CustomerServiceInteractionPlanShadowSnapshot | null;
  planFulfillment: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
  questionCount: number;
  questionEnding: boolean;
}) {
  const acts: string[] = [];
  const typed = input.interactionPlanV2;
  const required = new Set(typed?.requiredActs || []);
  const preferred = new Set(typed?.preferredActs || []);
  const optional = new Set(typed?.optionalActs || []);
  const fulfilledRequired = input.planFulfillment === 'FULFILLED';
  const add = (value: string) => { if (!acts.includes(value)) acts.push(value); };

  // Only REQUIRED Acts are projected as semantically realized from a fulfilled plan.
  // Preferred/optional Acts are not assumed realized merely because they were planned.
  if (fulfilledRequired) {
    if (required.has('PRESENCE_ACK') || required.has('LIGHT_ACK')) add('LIGHT_ACK');
    if (required.has('EMOTIONAL_ACK') || required.has('ACKNOWLEDGE_PROBLEM') || required.has('ACKNOWLEDGE_PREFERENCE')) add('SPECIFIC_ACK');
    if (required.has('DISCLOSE_PUBLIC_IDENTITY') || required.has('DISCLOSE_AI_IDENTITY') || required.has('CONFIRM_ROLE')) add('IDENTITY_RESPONSE');
    if (required.has('DISCLOSE_NAME')) add('NAME_RESPONSE');
    if (required.has('EXPLAIN_SERVICE_SCOPE')) add('SERVICE_SCOPE_EXPOSITION');
    if (required.has('RESTATEMENT')) add('NEED_RESTATEMENT');
    if (required.has('DIRECT_ANSWER') || required.has('EXPLAIN_GROUNDED_FACT') || required.has('REPORT_STATUS')) add('DIRECT_ANSWER');
    if (required.has('PROVIDE_GENERAL_GUIDANCE')) add('LIGHT_SUGGESTION');
    if (required.has('RECOMMEND_GROUNDED_ITEM')) add('PRODUCT_SUGGESTION');
    if (required.has('BUSINESS_ADVANCE')) add('BUSINESS_BRIDGE');
    if (required.has('SALES_CTA')) add('SALES_CTA');
    if (required.has('NATURAL_CLOSE')) add('NATURAL_CLOSE');
    if (required.has('STOP')) add('NATURAL_STOP');
  }

  // Question punctuation can confirm that a typed planned question appeared, but it
  // cannot decide question semantics by itself.
  if (input.questionCount > 0 || input.questionEnding) {
    if (required.has('REQUEST_REQUIRED_SLOT')) add('REQUIRED_QUESTION');
    else if (required.has('REQUEST_OPTIONAL_PREFERENCE') || preferred.has('REQUEST_OPTIONAL_PREFERENCE') || optional.has('REQUEST_OPTIONAL_PREFERENCE')) add('OPTIONAL_QUESTION');
    else if (required.has('CLARIFY_AMBIGUITY') || preferred.has('CLARIFY_AMBIGUITY') || optional.has('CLARIFY_AMBIGUITY')) add('CLARIFYING_QUESTION');
  }

  // Legacy behaviorPlan is structured configuration only; it can shape diagnostics
  // when no HVE-1 plan exists, but never reads wording to create semantic Acts.
  if (!typed && input.plan) {
    if (input.plan.interactionMode === 'ANSWER' && input.questionCount === 0) add('DIRECT_ANSWER');
    if (input.questionCount > 0) {
      if (input.plan.questionPolicy === 'REQUIRED_ONE') add('REQUIRED_QUESTION');
      else if (input.plan.questionPolicy === 'OPTIONAL_ONE') add('OPTIONAL_QUESTION');
    }
    if (input.plan.completionStyle === 'NATURAL_CLOSE') add('NATURAL_CLOSE');
    else if (['STOP', 'OPEN_STATEMENT'].includes(input.plan.completionStyle || '')) add('NATURAL_STOP');
  }
  return acts.slice(0, 32);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeText(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number] | 'UNKNOWN') {
  const normalized = String(value || '').trim();
  return allowed.includes(normalized as T[number]) ? normalized as T[number] : fallback;
}
