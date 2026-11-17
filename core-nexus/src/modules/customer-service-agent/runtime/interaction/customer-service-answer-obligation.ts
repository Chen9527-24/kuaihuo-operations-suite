import { selectCustomerServiceBusinessFactGroundingEntries, type CustomerServiceSelectedKnowledgeEntry } from '../../shared/context/customer-service-knowledge.util';
import type { CustomerServiceConversationStateSummary } from '../state/customer-service-conversation-state.type';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import type {
  CustomerServiceAnswerFocusKind,
  CustomerServiceAnswerObligationV1,
  CustomerServiceInteractionType,
  CustomerServiceResponseTargetV1,
} from './customer-service-interaction-plan.type';

type FocusResolution = {
  focus: CustomerServiceAnswerFocusKind;
  source: CustomerServiceResponseTargetV1['source'];
  confidence: number;
  evidence: string[];
  expansionSignal: 'NONE' | 'MORE_SPECIFIC' | 'MORE_DETAIL' | 'EXHAUSTIVE';
};

export function resolveCustomerServiceAnswerObligation(input: {
  interactionType: CustomerServiceInteractionType;
  latestCustomerMessage: string;
  conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  conversationState: CustomerServiceConversationStateSummary;
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
  understanding?: CustomerServiceMessageUnderstanding | null;
}): CustomerServiceAnswerObligationV1 {
  const latest = compact(input.latestCustomerMessage);
  const history = input.conversationHistory || [];
  const previousAssistant = [...history].reverse().find((item) => item.role === 'ASSISTANT' && compact(item.content));
  const latestPlanFulfillment = resolveLatestAssistantPlanFulfillment(input.conversationState);
  // Semantic coverage is evidence-bearing state: only an explicitly FULFILLED
  // assistant move may grant previousFocus/priorCoverage. UNKNOWN remains usable
  // as conversational text context elsewhere, but never proves that the prior
  // semantic obligation was completed.
  const priorSemanticCoverageAllowed = latestPlanFulfillment === 'FULFILLED';
  const canonicalPreviousFocus = priorSemanticCoverageAllowed
    ? resolveCanonicalPreviousFocus(input.conversationState)
    : null;
  const previousResolution = priorSemanticCoverageAllowed && canonicalPreviousFocus
    ? result(canonicalPreviousFocus, 'STATE', 0.98, [`CANONICAL_PREVIOUS_TARGET:${canonicalPreviousFocus}`])
    : null;
  const currentResolution = resolveAnswerFocus({
    text: latest,
    interactionType: input.interactionType,
    understanding: input.understanding || null,
    previousFocus: previousResolution?.focus || null,
  });
  const currentFocus = currentResolution.focus;
  const previousFocus = previousResolution?.focus || null;
  // Current-turn semantic deltas come from the lifecycle-aware Dialogue Obligation.
  // BehaviorHistory remains observation memory, not a current Turn Need authority.
  const requestedDeltas = new Set([
    ...(input.conversationState.latestFeedback?.requestedDeltas || []),
    ...(input.understanding?.humanContext?.dialogueObligation?.requestedDeltas || []),
  ]);
  const refinementRequested = [...requestedDeltas].some((item) => [
    'DEEPER', 'MORE_SPECIFIC', 'MORE_DETAILED', 'DIFFERENT_APPROACH', 'ANOTHER_OPTION', 'ANSWER_PREVIOUS_QUESTION',
  ].includes(item)) || currentResolution.expansionSignal !== 'NONE';
  const correction = input.conversationState.latestFeedback?.feedbackHandlingMode === 'CORRECT'
    || input.conversationState.latestFeedback?.userFeedback === 'CORRECTED'
    || input.understanding?.humanContext?.dialogueObligation?.feedbackHandlingMode === 'CORRECT';
  const hasPriorExchange = Boolean(previousAssistant);
  const focusChanged = Boolean(previousFocus && previousFocus !== currentFocus && !['CURRENT_SPECIFIC_QUESTION', 'CONVERSATIONAL_CLOSURE'].includes(currentFocus));
  const continuity: CustomerServiceAnswerObligationV1['continuity'] = correction
    ? 'CORRECTION'
    : currentFocus === 'CONVERSATIONAL_CLOSURE' && hasPriorExchange
      ? 'CONTINUATION'
      : !hasPriorExchange
        ? 'NEW_NEED'
        : refinementRequested
        ? 'FOLLOW_UP_REFINEMENT'
        : focusChanged
          ? 'FOLLOW_UP_NEW_FACET'
          : 'CONTINUATION';

  // Stage 2E-R Canonical Turn Obligation closure:
  // responseTarget.requiredDelta is the single source of truth for whether the
  // current turn must add/correct/expand information. Do not maintain a second
  // interaction-type-derived boolean that can disagree with the target.
  const responseTarget = buildResponseTarget({
    input,
    currentResolution,
    currentFocus,
    previousFocus,
    continuity,
    requestedDeltas,
    correction,
  });
  const mustAddNewInformation = Boolean(
    hasPriorExchange
    && responseTarget.requiredDelta !== 'NONE',
  );
  const businessFactGroundingEntries = selectCustomerServiceBusinessFactGroundingEntries({
    entries: input.knowledgeEntries,
    factOwnership: input.understanding?.factOwnership || null,
  });
  const evidenceState: CustomerServiceAnswerObligationV1['evidenceState'] = responseTarget.knowledgeRequirement !== 'BUSINESS_FACT_GROUNDING_REQUIRED'
    ? 'NOT_REQUIRED'
    : businessFactGroundingEntries.length > 0
      ? 'GROUNDED_KNOWLEDGE'
      : 'CONTEXT_ONLY';
  const unknownStrategy: CustomerServiceAnswerObligationV1['unknownStrategy'] = responseTarget.knowledgeRequirement !== 'BUSINESS_FACT_GROUNDING_REQUIRED' || evidenceState === 'GROUNDED_KNOWLEDGE'
    ? 'NOT_APPLICABLE'
    : mustAddNewInformation || currentFocus === 'PRODUCT_CAPABILITIES'
      ? 'ANSWER_KNOWN_THEN_BOUNDARY'
      : 'ANSWER_AVAILABLE_CONTEXT_ONLY';

  return {
    schemaVersion: 1,
    authority: 'CANONICAL_RESPONSE_OBLIGATION',
    continuity,
    currentFocus,
    currentFocusLabel: answerFocusLabel(currentFocus),
    previousFocus,
    previousAssistantExcerpt: previousAssistant ? compact(previousAssistant.content).slice(0, 220) : null,
    mustAddNewInformation,
    avoidRepeat: mustAddNewInformation,
    evidenceState,
    unknownStrategy,
    responseTarget,
    evidence: [
      `INTERACTION:${input.interactionType}`,
      `CURRENT_FOCUS:${currentFocus}`,
      ...(previousFocus ? [`PREVIOUS_FOCUS:${previousFocus}`] : []),
      ...(latestPlanFulfillment === 'NOT_FULFILLED'
        ? ['PREVIOUS_FOCUS_SOURCE:PRIOR_PLAN_NOT_FULFILLED_NO_COVERAGE']
        : latestPlanFulfillment === 'UNKNOWN'
          ? ['PREVIOUS_FOCUS_SOURCE:PRIOR_PLAN_UNKNOWN_NO_COVERAGE']
          : canonicalPreviousFocus
            ? ['PREVIOUS_FOCUS_SOURCE:CANONICAL_ASSISTANT_PLAN_SHADOW']
            : previousFocus
              ? ['PREVIOUS_FOCUS_SOURCE:CANONICAL_ONLY_NO_REPARSE']
              : []),
      `CONTINUITY:${continuity}`,
      `EVIDENCE_STATE:${evidenceState}`,
      ...(responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED'
        ? [`BUSINESS_FACT_GROUNDING_ELIGIBLE:${businessFactGroundingEntries.length}`]
        : []),
      `RESPONSE_TARGET:${responseTarget.focus}:${responseTarget.requestedSpecificity}:${responseTarget.requiredDelta}`,
      ...currentResolution.evidence,
      ...(refinementRequested ? ['REQUESTED_DELTA_REFINEMENT'] : []),
    ],
  };
}

function buildResponseTarget(input: {
  input: Parameters<typeof resolveCustomerServiceAnswerObligation>[0];
  currentResolution: FocusResolution;
  currentFocus: CustomerServiceAnswerFocusKind;
  previousFocus: CustomerServiceAnswerFocusKind | null;
  continuity: CustomerServiceAnswerObligationV1['continuity'];
  requestedDeltas: Set<string>;
  correction: boolean;
}): CustomerServiceResponseTargetV1 {
  const feedback = input.input.understanding?.humanContext?.dialogueObligation || input.input.conversationState.latestFeedback;
  const conversationalClosure = input.currentFocus === 'CONVERSATIONAL_CLOSURE';
  // For a concrete current-turn question, keep the already-recognized verbatim goal
  // evidence as the response target. A generic focus label or refinement delta is
  // not enough to distinguish the customer's new choice/question from an accepted
  // prior solution. This is transport of existing Understanding evidence only; it
  // does not create a second goal parser or alter Canonical Act selection.
  const currentTurnGoalEvidence = resolveCurrentTurnGoalEvidence(input.input.understanding, input.input.latestCustomerMessage);
  const unresolvedNeed = conversationalClosure
    ? null
    : currentTurnGoalEvidence
      || cleanOptional(feedback?.unresolvedNeed)
      || cleanOptional(input.input.understanding?.humanContext?.dominantTurnGoal?.responseRequirement)
      || null;
  const summaryRequested = hasTurnGoal(input.input.understanding, 'SUMMARIZE_CONVERSATION');
  const typedSpecificity = resolveTypedRequestedSpecificity(input.input.understanding || null);
  const requestedSpecificity = conversationalClosure
    ? 'MINIMAL' as const
    : summaryRequested
      ? 'SUMMARY' as const
      : typedSpecificity || resolveRequestedSpecificity(input.currentResolution.expansionSignal, input.requestedDeltas, input.currentFocus);
  const priorCoverage: CustomerServiceResponseTargetV1['priorCoverage'] = input.correction
    ? 'CORRECTION'
    : !input.previousFocus
      ? 'NONE'
      : input.previousFocus === input.currentFocus ? 'SAME_FOCUS_PARTIAL' : 'DIFFERENT_FOCUS';
  const requiredDelta: CustomerServiceResponseTargetV1['requiredDelta'] = conversationalClosure
    ? 'NONE'
    : summaryRequested
      ? 'COMPLETE_CURRENT_FOCUS'
    : input.correction
      ? 'CORRECT'
    : input.requestedDeltas.has('DIFFERENT_APPROACH')
      ? 'DIFFERENT_APPROACH'
    : input.continuity === 'FOLLOW_UP_NEW_FACET'
      ? 'NEW_FACET'
      : input.currentResolution.expansionSignal === 'MORE_SPECIFIC' || input.requestedDeltas.has('MORE_SPECIFIC')
        ? 'MORE_SPECIFIC'
        : input.currentResolution.expansionSignal === 'MORE_DETAIL' || input.requestedDeltas.has('MORE_DETAILED') || input.requestedDeltas.has('DEEPER')
          ? 'MORE_DETAIL'
          : input.currentResolution.expansionSignal === 'EXHAUSTIVE'
            ? 'COMPLETE_CURRENT_FOCUS'
            : input.continuity === 'FOLLOW_UP_REFINEMENT'
              ? 'MORE_DETAIL'
              : 'NONE';
  // Authority purification: raw surface Focus may still help realization, but it
  // must not independently promote/demote factual ownership. Epistemic ownership
  // is derived once from the already-resolved InteractionType family. This removes
  // the old second-pass focus-to-business-evidence authority.
  const knowledgeRequirement = resolveKnowledgeRequirement(
    input.input.understanding || null,
    conversationalClosure,
  );
  const factOwnership = input.input.understanding?.factOwnership || null;
  const namedOfferingReferent = factOwnership?.namedOfferingReferent || {
    authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT' as const,
    status: 'NONE' as const,
    source: 'NONE' as const,
    surface: null,
    resolvedGroundingIds: [],
  };

  return {
    schemaVersion: 1,
    authority: 'CANONICAL_RESPONSE_TARGET',
    focus: input.currentFocus,
    requestedSpecificity,
    unresolvedNeed,
    priorCoverage,
    requiredDelta,
    knowledgeRequirement,
    namedOfferingReferent,
    source: input.currentResolution.source,
    confidence: input.currentResolution.confidence,
    evidence: [
      ...input.currentResolution.evidence,
      `PRIOR_COVERAGE:${priorCoverage}`,
      `REQUIRED_DELTA:${requiredDelta}`,
      `KNOWLEDGE_REQUIREMENT:${knowledgeRequirement}`,
      ...(factOwnership ? [`FACT_OWNERSHIP:${factOwnership.scope}`, ...factOwnership.evidence] : []),
      ...(summaryRequested ? ['UNDERSTANDING_GOAL:SUMMARIZE_CONVERSATION'] : []),
      ...(unresolvedNeed ? ['UNDERSTANDING_UNRESOLVED_NEED_PRESENT'] : []),
    ],
  };
}


function resolveAnswerFocus(input: {
  text: string;
  interactionType: CustomerServiceInteractionType;
  understanding: CustomerServiceMessageUnderstanding | null;
  previousFocus: CustomerServiceAnswerFocusKind | null;
}): FocusResolution {
  const task = input.understanding?.humanContext?.conversationTaskState;
  const hasBlockingRequiredInformation = Boolean(task?.pendingSlots?.some((slot) => ['MISSING', 'REQUESTED'].includes(slot.status)));
  if (hasTurnGoal(input.understanding, 'CLOSE_CONVERSATION')
    && input.interactionType !== 'SECURITY_SENSITIVE'
    && !hasBlockingRequiredInformation) {
    return result('CONVERSATIONAL_CLOSURE', 'UNDERSTANDING', 0.98, ['UNDERSTANDING_GOAL:CLOSE_CONVERSATION']);
  }

  const typedFocus = resolveTypedAnswerFocus(input.understanding);
  if (typedFocus) {
    return result(
      typedFocus,
      'UNDERSTANDING',
      0.99,
      [`TYPED_ANSWER_FOCUS:${typedFocus}`],
      resolveExpansionSignal(input.understanding),
    );
  }

  const goals = input.understanding
    ? [input.understanding.humanContext?.dominantTurnGoal, ...(input.understanding.humanContext?.requiredTurnGoals || [])].filter(Boolean)
    : [];
  const selectionRequired = goals.some((goal) => (
    goal?.requestedContributionKind === 'DECISION_SUPPORT'
    && goal?.requestedEvidenceScope === 'MERCHANT_BUSINESS'
    && goal?.requestedDecisionMode === 'SELECT_OR_PRIORITIZE_OPTION'
  ));
  if (selectionRequired || ['PRODUCT_DISCOVERY', 'PRODUCT_DISCOVERY_NO_GROUNDING'].includes(input.interactionType)) {
    return result('RECOMMENDATION', 'UNDERSTANDING', selectionRequired ? 0.96 : 0.7,
      [selectionRequired ? 'TYPED_DECISION_MODE:SELECT_OR_PRIORITIZE_OPTION' : `INTERACTION_TYPE:${input.interactionType}`],
      resolveExpansionSignal(input.understanding));
  }
  if (['LOGISTICS_STATUS', 'LOGISTICS_DELAY'].includes(input.interactionType)) {
    return result('STATUS_PROGRESS', 'UNDERSTANDING', 0.75, [`INTERACTION_TYPE:${input.interactionType}`], resolveExpansionSignal(input.understanding));
  }
  if (input.interactionType === 'PRODUCT_FACT_QUERY') {
    return result('CURRENT_SPECIFIC_QUESTION', 'UNDERSTANDING', 0.75, ['INTERACTION_TYPE:PRODUCT_FACT_QUERY'], resolveExpansionSignal(input.understanding));
  }
  if (input.previousFocus && input.understanding?.humanContext?.dialogueObligation?.requestedDeltas.some((item) => [
    'MORE_SPECIFIC', 'MORE_DETAILED', 'DEEPER', 'DIFFERENT_APPROACH', 'ANSWER_PREVIOUS_QUESTION',
  ].includes(item))) {
    return result(input.previousFocus, 'STATE', 0.85, [`TYPED_DELTA_INHERITS_PREVIOUS_FOCUS:${input.previousFocus}`], resolveExpansionSignal(input.understanding));
  }
  return result(
    'CURRENT_SPECIFIC_QUESTION',
    input.understanding ? 'UNDERSTANDING' : 'COMPATIBILITY_FALLBACK',
    input.understanding ? 0.6 : 0.35,
    ['STRUCTURAL_FOCUS_ONLY_NO_LEXICAL_REPARSE'],
    resolveExpansionSignal(input.understanding),
  );
}

function resolveTypedAnswerFocus(
  understanding: CustomerServiceMessageUnderstanding | null,
): CustomerServiceAnswerFocusKind | null {
  if (!understanding || understanding.recognitionModel?.status !== 'SUCCESS') return null;
  const goals = [understanding.humanContext.dominantTurnGoal, ...(understanding.humanContext.requiredTurnGoals || [])]
    .filter((goal) => goal && !goal.deferred);
  const focus = goals.find((goal) => goal?.requestedAnswerFocus && goal.requestedAnswerFocus !== 'NOT_APPLICABLE')?.requestedAnswerFocus;
  if (!focus) return null;
  if (['AI_IDENTITY', 'PUBLIC_NAME', 'SERVICE_ROLE', 'SERVICE_SCOPE'].includes(focus)) return 'CURRENT_SPECIFIC_QUESTION';
  const allowed = new Set<CustomerServiceAnswerFocusKind>([
    'OVERVIEW', 'APPLICATION_USAGE', 'HOW_TO', 'WHY_REASON', 'COMPARISON', 'LIMITATION_BOUNDARY',
    'COMPATIBILITY', 'PRICE_COST', 'AVAILABILITY', 'STATUS_PROGRESS', 'RECOMMENDATION',
    'TROUBLESHOOTING', 'PRODUCT_CAPABILITIES', 'CURRENT_SPECIFIC_QUESTION',
  ]);
  return allowed.has(focus as CustomerServiceAnswerFocusKind) ? focus as CustomerServiceAnswerFocusKind : null;
}

function resolveTypedRequestedSpecificity(
  understanding: CustomerServiceMessageUnderstanding | null | undefined,
): CustomerServiceResponseTargetV1['requestedSpecificity'] | null {
  if (!understanding || understanding.recognitionModel?.status !== 'SUCCESS') return null;
  const goals = [understanding.humanContext.dominantTurnGoal, ...(understanding.humanContext.requiredTurnGoals || [])]
    .filter((goal) => goal && !goal.deferred);
  const value = goals.find((goal) => goal?.requestedSpecificity && goal.requestedSpecificity !== 'NOT_APPLICABLE')?.requestedSpecificity;
  return value && value !== 'NOT_APPLICABLE'
    ? value as CustomerServiceResponseTargetV1['requestedSpecificity']
    : null;
}

function resolveRequestedSpecificity(
  expansion: FocusResolution['expansionSignal'],
  requestedDeltas: Set<string>,
  focus: CustomerServiceAnswerFocusKind,
): CustomerServiceResponseTargetV1['requestedSpecificity'] {
  if (focus === 'CONVERSATIONAL_CLOSURE') return 'MINIMAL';
  if (expansion === 'EXHAUSTIVE') return 'EXHAUSTIVE';
  if (expansion === 'MORE_DETAIL' || requestedDeltas.has('MORE_DETAILED') || requestedDeltas.has('DEEPER')) return 'DETAIL';
  if (expansion === 'MORE_SPECIFIC' || requestedDeltas.has('MORE_SPECIFIC')) return 'CONCRETE';
  if (focus === 'RECOMMENDATION' || focus === 'COMPARISON' || focus === 'TROUBLESHOOTING') return 'CONCRETE';
  if (focus === 'PRODUCT_CAPABILITIES' || focus === 'APPLICATION_USAGE' || focus === 'HOW_TO') return 'DETAIL';
  if (focus === 'OVERVIEW') return 'SUMMARY';
  return 'DIRECTION';
}

function resolveExpansionSignal(
  understanding: CustomerServiceMessageUnderstanding | null | undefined,
): FocusResolution['expansionSignal'] {
  const specificity = resolveTypedRequestedSpecificity(understanding);
  if (specificity === 'EXHAUSTIVE') return 'EXHAUSTIVE';
  if (specificity === 'CONCRETE') return 'MORE_SPECIFIC';
  if (specificity === 'DETAIL') return 'MORE_DETAIL';
  const deltas = understanding?.humanContext?.dialogueObligation?.requestedDeltas || [];
  if (deltas.includes('MORE_SPECIFIC')) return 'MORE_SPECIFIC';
  if (deltas.includes('MORE_DETAILED') || deltas.includes('DEEPER')) return 'MORE_DETAIL';
  return 'NONE';
}

function resolveKnowledgeRequirement(
  understanding: CustomerServiceMessageUnderstanding | null,
  conversationalClosure: boolean,
): CustomerServiceResponseTargetV1['knowledgeRequirement'] {
  if (conversationalClosure) return 'NOT_REQUIRED';

  // Single factual-ownership consumer: Message Understanding already resolved
  // whether this turn is current merchant fact, general domain knowledge, or not
  // a factual knowledge task. Do not re-parse raw text or infer ownership from the
  // broad InteractionType family here.
  const scope = understanding?.factOwnership?.scope || 'NONE';
  if (scope === 'CURRENT_BUSINESS_FACT') return 'BUSINESS_FACT_GROUNDING_REQUIRED';
  if (scope === 'GENERAL_DOMAIN') return 'GENERAL_CONTEXT_ALLOWED';
  return 'NOT_REQUIRED';
}

function result(
  focus: CustomerServiceAnswerFocusKind,
  source: CustomerServiceResponseTargetV1['source'],
  confidence: number,
  evidence: string[],
  expansionSignal: FocusResolution['expansionSignal'] = 'NONE',
): FocusResolution {
  return { focus, source, confidence, evidence, expansionSignal };
}


function answerFocusLabel(value: CustomerServiceAnswerFocusKind) {
  const labels: Record<CustomerServiceAnswerFocusKind, string> = {
    OVERVIEW: '当前产品/服务的定位与主要作用',
    APPLICATION_USAGE: '当前产品/服务在真实使用中的应用场景与用途',
    HOW_TO: '当前问题的操作方法、步骤或处理流程',
    WHY_REASON: '当前现象或结论背后的原因',
    COMPARISON: '当前选项之间的关键差异与取舍',
    LIMITATION_BOUNDARY: '当前能力、规则或产品的限制与边界',
    COMPATIBILITY: '当前产品/功能的兼容、适配或支持范围',
    PRICE_COST: '当前产品/服务的价格、费用或成本信息',
    AVAILABILITY: '当前产品/服务的可用性、库存或是否可获得',
    STATUS_PROGRESS: '当前事项的状态、进度或时间信息',
    RECOMMENDATION: '基于当前条件给出选择方向或推荐判断',
    TROUBLESHOOTING: '当前故障或异常的定位与排查方向',
    PRODUCT_CAPABILITIES: '当前产品/服务具体具备的功能、能力或特性',
    CONVERSATIONAL_CLOSURE: '自然结束当前交流，不新增信息任务',
    CURRENT_SPECIFIC_QUESTION: '客户本轮明确提出的具体信息需求',
  };
  return labels[value];
}

function resolveLatestAssistantPlanFulfillment(state: CustomerServiceConversationStateSummary) {
  const moves = state.recentAssistantMoves || [];
  const latest = moves.length ? moves[moves.length - 1] : null;
  return latest?.behavior?.planFulfillment || 'UNKNOWN';
}

function resolveCanonicalPreviousFocus(state: CustomerServiceConversationStateSummary): CustomerServiceAnswerFocusKind | null {
  for (let index = (state.recentAssistantMoves || []).length - 1; index >= 0; index -= 1) {
    const focus = state.recentAssistantMoves[index]?.behavior?.interactionPlanV2?.answerFocus || null;
    if (focus) return focus;
  }
  return null;
}

function hasTurnGoal(understanding: CustomerServiceMessageUnderstanding | null | undefined, goalKey: string) {
  const goals = [understanding?.humanContext?.dominantTurnGoal, ...(understanding?.humanContext?.requiredTurnGoals || [])];
  return goals.some((goal) => String(goal?.key || '') === goalKey);
}

function resolveCurrentTurnGoalEvidence(
  understanding: CustomerServiceMessageUnderstanding | null | undefined,
  latestCustomerMessage: string,
) {
  const latest = compact(latestCustomerMessage);
  if (!latest) return null;
  const human = understanding?.humanContext;
  const dominant = human?.dominantTurnGoal || null;
  const orderedGoals = [
    dominant,
    ...(human?.requiredTurnGoals || []).filter((goal) => goal !== dominant),
  ].filter(Boolean);
  const evidenceItems: string[] = [];
  for (const goal of orderedGoals) {
    if (!goal || goal.deferred || !(goal.confidence >= 0.82)) continue;
    for (const rawEvidence of goal.evidence || []) {
      const evidence = compact(rawEvidence);
      if (!evidence || !latest.includes(evidence) || evidenceItems.includes(evidence)) continue;
      evidenceItems.push(evidence);
      break;
    }
  }
  if (!evidenceItems.length) return null;
  // Transport all independently-required current-turn evidence that Understanding
  // already produced. This is not a new raw-text parser: it prevents the response
  // target from collapsing a compound required envelope back to dominant-only text.
  return evidenceItems.join('；').slice(0, 240);
}

function cleanOptional(value: unknown) {
  const text = compact(value);
  return text ? text.slice(0, 240) : null;
}

function compact(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}
