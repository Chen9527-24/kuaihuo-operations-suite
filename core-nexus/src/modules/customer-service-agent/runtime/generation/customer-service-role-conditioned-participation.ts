import type { CustomerServiceInteractionPlanV2, CustomerServiceActType } from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceRoleInteractionPostureProjectionV1 } from '../role/customer-service-role-interaction-posture-projection';
import type { CustomerServiceRoleCapabilityContextProjectionV1 } from '../role/customer-service-role-capability-context-projection';
import type { CustomerServiceConversationStateSummary } from '../state/customer-service-conversation-state.type';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';
import type { CustomerServiceResolvedRoleIdentityContextV1 } from '../role/customer-service-resolved-role-identity-context';

export type CustomerServiceRoleConditionedParticipationFrameV1 = {
  schemaVersion: 1;
  authority: 'REALIZATION_ONLY';
  participationMode:
    | 'RESPONDING'
    | 'ASSISTING'
    | 'GUIDING'
    | 'DIAGNOSING'
    | 'COORDINATING'
    | 'FOLLOWING_THROUGH'
    | 'LISTENING';
  ownershipLevel: 'LOW' | 'SHARED' | 'HIGH';
  continuityMode: 'FRESH' | 'CARRY_FORWARD' | 'RESUME_PENDING' | 'CLOSE_LOOP';
  initiativeRealization: 'RESTRAINED' | 'NATURAL' | 'PROACTIVE_WITHIN_PLAN';
  rolePresence: 'BACKGROUND' | 'IMPLICIT' | 'VISIBLE';
  /**
   * Current human position inside the same HumanTurn. This is realization context,
   * never a second Planner: it only tells generation whether the current value is
   * a fresh response, a continuation of already-established lived context, an
   * absorption of newly relevant customer reality, or follow-through on an existing
   * task. It cannot create/suppress/reorder Acts or grant facts/permission.
   */
  currentPosition: {
    authority: 'REALIZATION_CONTEXT_ONLY';
    mode: 'FRESH' | 'CARRY_ESTABLISHED_CONTEXT' | 'ABSORB_NEW_LIVED_CONTEXT' | 'FOLLOW_THROUGH_EXISTING_TASK';
    useRelevantLivedContext: boolean;
    explicitHistoryReference: 'ONLY_WHEN_NATURAL';
  };
  turnManeuver:
    | 'FOLLOW_REQUIRED_TASK'
    | 'GUIDE_THEN_OPTIONAL_CLARIFY'
    | 'PROVIDE_DIRECTION_AND_HOLD'
    | 'ACKNOWLEDGE_AND_HOLD'
    | 'OPTIONAL_CLARIFY'
    | 'FOLLOW_CANONICAL_PLAN';
  questionDisposition: 'REQUIRED' | 'ASK_ONE_IF_DECISION_RELEVANT' | 'HOLD_THIS_TURN' | 'NONE';
  guidanceDisposition: 'LEAD' | 'CONTEXTUAL' | 'RESTRAINED' | 'NONE';
  /**
   * Coarse per-turn role-behavior projection retained for trace/evaluator compatibility.
   * H0.2 model-facing generation consumes high-fidelity HumanTurn roleEmbodiment instead;
   * this object is no longer the final persona/realization authority.
   */
  roleBehavior: {
    authority: 'REALIZATION_ONLY';
    responsePriority:
      | 'REQUIRED_TASK_FIRST'
      | 'ACK_FUSED_WITH_VALUE'
      | 'VALUE_FIRST'
      | 'RELATIONAL_ACK_FIRST'
      | 'QUESTION_ONLY'
      | 'CANONICAL_FLOW';
    judgmentStyle: 'NONE' | 'RESTRAINED' | 'BALANCED_JUDGMENT' | 'CLEAR_DIRECTION';
    relationshipStance: CustomerServiceRoleSpeakerProjectionV1['stableCore']['relationshipStyle']['baselineDistance'];
    questionThreshold:
      | 'REQUIRED_NOW'
      | 'HOLD_THIS_TURN'
      | 'DECISION_RELEVANT_WITHIN_PLAN'
      | 'EXPLORATORY_WITHIN_PLAN'
      | 'NONE';
    adviceMode: 'NONE' | 'RESTRAINED' | 'BALANCED' | 'COLLABORATIVE' | 'DIRECTIVE';
    cadence: CustomerServiceRoleSpeakerProjectionV1['stableCore']['conversationalTexture']['brevity'];
    /** Role-specific intensity targets. These render already-authorized behavior only. */
    expressionDynamics: {
      warmth: 'RESTRAINED' | 'BALANCED' | 'WARM';
      engagement: 'LOW_KEY' | 'PRESENT' | 'ACTIVE';
      reassurance: 'LIGHT' | 'STEADY' | 'EXPRESSIVE';
      servicePresence: 'BACKGROUND' | 'AVAILABLE' | 'ENGAGED';
    };
    evidenceTargets: string[];
    sourceSignals: string[];
    behaviorSignature: string;
  };
};

/**
 * V1.9 Generic Role-conditioned Human Participation.
 *
 * This resolver is deliberately downstream of the final Canonical InteractionPlan.
 * It never creates, removes, upgrades, suppresses, or reorders Acts. It only describes
 * the human participation stance used to realize behavior that is already authorized.
 */
export function resolveCustomerServiceRoleConditionedParticipationFrame(input: {
  plan: CustomerServiceInteractionPlanV2;
  speaker?: CustomerServiceRoleSpeakerProjectionV1;
  resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1 | null;
  posture: CustomerServiceRoleInteractionPostureProjectionV1;
  capabilityContext: CustomerServiceRoleCapabilityContextProjectionV1;
  conversationState: CustomerServiceConversationStateSummary;
  recentConversationCount: number;
  livedContext?: {
    exchangeState: 'FRESH' | 'ONGOING';
    relevantMemorySourceTurns: number[];
  };
}): CustomerServiceRoleConditionedParticipationFrameV1 {
  const actTypes = new Set(input.plan.acts.filter((act) => act.type !== 'STOP').map((act) => act.type));
  const participationMode = resolveParticipationMode(actTypes, input.conversationState);
  const initiativeRealization = resolveInitiative(input.posture, input.speaker);
  const continuityMode = resolveContinuity(input.conversationState, input.recentConversationCount);
  const ownershipLevel = resolveOwnership({
    mode: participationMode,
    posture: input.posture,
    actTypes,
    state: input.conversationState,
    speaker: input.speaker,
  });
  const rolePresence = resolveRolePresence({
    actTypes,
    mode: participationMode,
    capabilityContext: input.capabilityContext,
    posture: input.posture,
  });
  const currentPosition = resolveCurrentPosition({
    state: input.conversationState,
    continuityMode,
    recentConversationCount: input.recentConversationCount,
    livedContext: input.livedContext,
  });
  const turnManeuver = input.plan.diagnostics.roleTurnPolicy?.maneuver ?? 'FOLLOW_CANONICAL_PLAN';
  const questionDisposition = resolveQuestionDisposition(actTypes, turnManeuver);
  const guidanceDisposition = resolveGuidanceDisposition(actTypes, input.speaker);
  const roleBehavior = resolveRoleBehavior({
    actTypes,
    speaker: input.speaker,
    resolvedRoleIdentity: input.resolvedRoleIdentity,
    posture: input.posture,
    capabilityContext: input.capabilityContext,
    turnManeuver,
    questionDisposition,
    guidanceDisposition,
    ownershipLevel,
    participationMode,
    rolePresence,
    initiativeRealization,
    interactionType: input.plan.interactionType,
  });
  return {
    schemaVersion: 1,
    authority: 'REALIZATION_ONLY',
    participationMode,
    ownershipLevel,
    continuityMode,
    initiativeRealization,
    rolePresence,
    currentPosition,
    turnManeuver,
    questionDisposition,
    guidanceDisposition,
    roleBehavior,
  };
}

function resolveCurrentPosition(input: {
  state: CustomerServiceConversationStateSummary;
  continuityMode: CustomerServiceRoleConditionedParticipationFrameV1['continuityMode'];
  recentConversationCount: number;
  livedContext?: { exchangeState: 'FRESH' | 'ONGOING'; relevantMemorySourceTurns: number[] };
}): CustomerServiceRoleConditionedParticipationFrameV1['currentPosition'] {
  const currentTurn = Math.max(0, Number(input.state.currentTurn || 0));
  const sourceTurns = (input.livedContext?.relevantMemorySourceTurns || [])
    .map((turn) => Number(turn))
    .filter((turn) => Number.isFinite(turn) && turn > 0);
  const ongoingExchange = input.livedContext?.exchangeState === 'ONGOING'
    || input.continuityMode !== 'FRESH'
    || input.recentConversationCount > 0
    || currentTurn > 1;
  const hasNewRelevantLivedContext = sourceTurns.some((turn) => turn === currentTurn);
  const hasEstablishedRelevantLivedContext = sourceTurns.some((turn) => turn < currentTurn);
  const task = input.state.activeTask;
  const taskPredatesCurrentTurn = Boolean(
    task
    && Number.isFinite(Number(task.createdTurn))
    && Number(task.createdTurn) < currentTurn
    && !['RESOLVED', 'ABANDONED'].includes(String(task.status || '')),
  );

  const mode: CustomerServiceRoleConditionedParticipationFrameV1['currentPosition']['mode'] =
    ongoingExchange && hasNewRelevantLivedContext
      ? 'ABSORB_NEW_LIVED_CONTEXT'
      : taskPredatesCurrentTurn
        ? 'FOLLOW_THROUGH_EXISTING_TASK'
        : ongoingExchange && hasEstablishedRelevantLivedContext
          ? 'CARRY_ESTABLISHED_CONTEXT'
          : 'FRESH';

  return {
    authority: 'REALIZATION_CONTEXT_ONLY',
    mode,
    useRelevantLivedContext: mode !== 'FRESH',
    explicitHistoryReference: 'ONLY_WHEN_NATURAL',
  };
}

function resolveQuestionDisposition(
  acts: Set<CustomerServiceActType>,
  maneuver: CustomerServiceRoleConditionedParticipationFrameV1['turnManeuver'],
): CustomerServiceRoleConditionedParticipationFrameV1['questionDisposition'] {
  if (hasAny(acts, ['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY'])) return 'REQUIRED';
  if (maneuver === 'ACKNOWLEDGE_AND_HOLD' || maneuver === 'PROVIDE_DIRECTION_AND_HOLD') return 'HOLD_THIS_TURN';
  if (!acts.has('REQUEST_OPTIONAL_PREFERENCE')) return 'NONE';
  return 'ASK_ONE_IF_DECISION_RELEVANT';
}

function resolveGuidanceDisposition(
  acts: Set<CustomerServiceActType>,
  speaker?: CustomerServiceRoleSpeakerProjectionV1,
): CustomerServiceRoleConditionedParticipationFrameV1['guidanceDisposition'] {
  if (!hasAny(acts, ['PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'])) return 'NONE';
  if (speaker?.stableCore.interactionStyle.adviceStyle === 'ASSERTIVE') return 'LEAD';
  if (speaker?.stableCore.interactionStyle.adviceStyle === 'RESTRAINED') return 'RESTRAINED';
  return 'CONTEXTUAL';
}

function resolveParticipationMode(
  acts: Set<CustomerServiceActType>,
  state: CustomerServiceConversationStateSummary,
): CustomerServiceRoleConditionedParticipationFrameV1['participationMode'] {
  if (hasAny(acts, ['EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF'])) {
    return state.activeTask ? 'FOLLOWING_THROUGH' : 'COORDINATING';
  }
  if (hasAny(acts, ['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY'])) return 'DIAGNOSING';
  if (hasAny(acts, ['PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'])) {
    return hasAny(acts, ['REQUEST_OPTIONAL_PREFERENCE', 'ACKNOWLEDGE_PREFERENCE']) ? 'GUIDING' : 'ASSISTING';
  }
  if (hasAny(acts, ['OPEN_SERVICE_INVITATION', 'EXPLAIN_SERVICE_SCOPE', 'DIRECT_ANSWER'])) return 'ASSISTING';
  if (hasAny(acts, ['EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM', 'RELATIONSHIP_MAINTENANCE'])
    && !hasAny(acts, ['BUSINESS_ADVANCE', 'SALES_CTA'])) return 'LISTENING';
  return 'RESPONDING';
}

function resolveInitiative(
  posture: CustomerServiceRoleInteractionPostureProjectionV1,
  speaker?: CustomerServiceRoleSpeakerProjectionV1,
): CustomerServiceRoleConditionedParticipationFrameV1['initiativeRealization'] {
  // Explicit typed SERVICE_POSTURE remains the stronger role-behavior source.
  if (posture.source === 'TYPED_V1') {
    if (posture.effective.initiativeLevel === 'RESTRAINED') return 'RESTRAINED';
    return posture.effective.initiativeLevel === 'PROACTIVE' ? 'PROACTIVE_WITHIN_PLAN' : 'NATURAL';
  }
  // Stage 2: a resolved non-neutral Speaker may shape realization initiative even when
  // legacy roles do not have typed SERVICE_POSTURE. This never authorizes a new Act.
  if (!speaker || speaker.source === 'NEUTRAL_COMPATIBILITY') return 'RESTRAINED';
  if (speaker.stableCore.interactionStyle.proactivity === 'PROACTIVE') return 'PROACTIVE_WITHIN_PLAN';
  if (speaker.stableCore.interactionStyle.proactivity === 'BALANCED') return 'NATURAL';
  return 'RESTRAINED';
}

function resolveContinuity(
  state: CustomerServiceConversationStateSummary,
  recentConversationCount: number,
): CustomerServiceRoleConditionedParticipationFrameV1['continuityMode'] {
  const task = state.activeTask;
  if (task?.status === 'RESOLVED') return 'CLOSE_LOOP';

  // generationContext contains the prospective State after applying the current customer turn.
  // A task first created by that same turn is current-turn context, not a pending task being resumed.
  // RESUME_PENDING is reserved for a genuinely pre-existing/reopened task.
  const taskCreatedBeforeCurrentTurn = Boolean(
    task
    && Number.isFinite(Number(task.createdTurn))
    && Number(task.createdTurn) < Math.max(0, Number(state.currentTurn || 0)),
  );
  const explicitlyReopened = task?.status === 'REOPENED';
  if (task && (taskCreatedBeforeCurrentTurn || explicitlyReopened)) return 'RESUME_PENDING';

  if (recentConversationCount > 0 || Number(state.currentTurn || 0) > 1) return 'CARRY_FORWARD';
  return 'FRESH';
}

function resolveOwnership(input: {
  mode: CustomerServiceRoleConditionedParticipationFrameV1['participationMode'];
  posture: CustomerServiceRoleInteractionPostureProjectionV1;
  actTypes: Set<CustomerServiceActType>;
  state: CustomerServiceConversationStateSummary;
  speaker?: CustomerServiceRoleSpeakerProjectionV1;
}): CustomerServiceRoleConditionedParticipationFrameV1['ownershipLevel'] {
  const typed = input.posture.source === 'TYPED_V1';
  const followThrough = typed ? input.posture.effective.resolutionFollowThrough : 'MINIMAL';
  if (hasAny(input.actTypes, ['EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF'])
    && (followThrough === 'UNTIL_RESOLVED' || Boolean(input.state.activeTask))) return 'HIGH';
  if (input.mode === 'FOLLOWING_THROUGH' && followThrough !== 'MINIMAL') return 'HIGH';
  if (typed && input.posture.effective.initiativeLevel !== 'RESTRAINED'
    && ['ASSISTING', 'GUIDING', 'DIAGNOSING', 'COORDINATING', 'FOLLOWING_THROUGH'].includes(input.mode)) return 'SHARED';
  const speakerCanShare = input.speaker?.source !== 'NEUTRAL_COMPATIBILITY'
    && input.speaker?.stableCore.interactionStyle.proactivity !== 'RESTRAINED';
  if (!typed && speakerCanShare
    && ['ASSISTING', 'GUIDING', 'DIAGNOSING', 'COORDINATING', 'FOLLOWING_THROUGH'].includes(input.mode)) return 'SHARED';
  return 'LOW';
}

function resolveRolePresence(input: {
  actTypes: Set<CustomerServiceActType>;
  mode: CustomerServiceRoleConditionedParticipationFrameV1['participationMode'];
  capabilityContext: CustomerServiceRoleCapabilityContextProjectionV1;
  posture: CustomerServiceRoleInteractionPostureProjectionV1;
}): CustomerServiceRoleConditionedParticipationFrameV1['rolePresence'] {
  // Truth/safety turns should not be decorated with extra business-role presence.
  if (hasAny(input.actTypes, ['DISCLOSE_AI_IDENTITY', 'EXPLAIN_BOUNDARY'])
    && !hasAny(input.actTypes, ['OPEN_SERVICE_INVITATION', 'EXECUTE_SERVICE_STEP', 'PROVIDE_GENERAL_GUIDANCE'])) return 'BACKGROUND';
  const hasRoleContext = input.capabilityContext.source !== 'NONE';
  const domainBearingActs: CustomerServiceActType[] = [
    'PROVIDE_GENERAL_GUIDANCE',
    'RECOMMEND_GROUNDED_ITEM',
    'EXPLAIN_GROUNDED_FACT',
    'REQUEST_REQUIRED_SLOT',
    'REQUEST_OPTIONAL_PREFERENCE',
    'CLARIFY_AMBIGUITY',
    'EXPLAIN_SERVICE_SCOPE',
    'EXECUTE_SERVICE_STEP',
    'REPORT_STATUS',
    'REQUEST_HANDOFF',
    'OPEN_SERVICE_INVITATION',
  ];
  const domainParticipationAuthorized = hasAny(input.actTypes, domainBearingActs);
  const engaged = ['ASSISTING', 'GUIDING', 'DIAGNOSING', 'COORDINATING', 'FOLLOWING_THROUGH'].includes(input.mode);
  if (hasRoleContext && engaged && domainParticipationAuthorized) return 'VISIBLE';
  if (input.posture.source === 'TYPED_V1' || hasRoleContext) return 'IMPLICIT';
  return 'BACKGROUND';
}

function resolveRoleBehavior(input: {
  actTypes: Set<CustomerServiceActType>;
  speaker?: CustomerServiceRoleSpeakerProjectionV1;
  resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1 | null;
  posture: CustomerServiceRoleInteractionPostureProjectionV1;
  capabilityContext: CustomerServiceRoleCapabilityContextProjectionV1;
  turnManeuver: CustomerServiceRoleConditionedParticipationFrameV1['turnManeuver'];
  questionDisposition: CustomerServiceRoleConditionedParticipationFrameV1['questionDisposition'];
  guidanceDisposition: CustomerServiceRoleConditionedParticipationFrameV1['guidanceDisposition'];
  ownershipLevel: CustomerServiceRoleConditionedParticipationFrameV1['ownershipLevel'];
  participationMode: CustomerServiceRoleConditionedParticipationFrameV1['participationMode'];
  rolePresence: CustomerServiceRoleConditionedParticipationFrameV1['rolePresence'];
  initiativeRealization: CustomerServiceRoleConditionedParticipationFrameV1['initiativeRealization'];
  interactionType: CustomerServiceInteractionPlanV2['interactionType'];
}): CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior'] {
  const speaker = input.speaker;
  const stable = speaker?.stableCore;
  const guidanceAuthorized = hasAny(input.actTypes, [
    'DIRECT_ANSWER',
    'PROVIDE_GENERAL_GUIDANCE',
    'RECOMMEND_GROUNDED_ITEM',
    'EXPLAIN_GROUNDED_FACT',
  ]);
  const acknowledgementAuthorized = hasAny(input.actTypes, [
    'ACKNOWLEDGE_PREFERENCE',
    'LIGHT_ACK',
    'EMOTIONAL_ACK',
    'ACKNOWLEDGE_PROBLEM',
    'PRESENCE_ACK',
    'REASSURE',
  ]);

  const responsePriority: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['responsePriority'] =
    input.turnManeuver === 'FOLLOW_REQUIRED_TASK'
      ? 'REQUIRED_TASK_FIRST'
      : input.turnManeuver === 'GUIDE_THEN_OPTIONAL_CLARIFY' || input.turnManeuver === 'PROVIDE_DIRECTION_AND_HOLD'
        ? (acknowledgementAuthorized && Number(stable?.corePresence.warmth || 0) >= 68 && Number(stable?.corePresence.directness || 0) < 76
          ? 'ACK_FUSED_WITH_VALUE'
          : 'VALUE_FIRST')
        : input.turnManeuver === 'ACKNOWLEDGE_AND_HOLD'
          ? 'RELATIONAL_ACK_FIRST'
          : input.turnManeuver === 'OPTIONAL_CLARIFY'
            ? 'QUESTION_ONLY'
            : guidanceAuthorized
              ? 'VALUE_FIRST'
              : acknowledgementAuthorized
                ? 'RELATIONAL_ACK_FIRST'
                : 'CANONICAL_FLOW';

  const judgmentStyle: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['judgmentStyle'] = !guidanceAuthorized
    ? 'NONE'
    : stable?.interactionStyle.adviceStyle === 'ASSERTIVE' || Number(stable?.corePresence.directness || 0) >= 78
      ? 'CLEAR_DIRECTION'
      : stable?.interactionStyle.adviceStyle === 'RESTRAINED'
        ? 'RESTRAINED'
        : 'BALANCED_JUDGMENT';

  const questionThreshold: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['questionThreshold'] =
    input.questionDisposition === 'REQUIRED'
      ? 'REQUIRED_NOW'
      : input.questionDisposition === 'HOLD_THIS_TURN'
        ? 'HOLD_THIS_TURN'
        : input.questionDisposition === 'ASK_ONE_IF_DECISION_RELEVANT'
          ? stable?.interactionStyle.questionStyle === 'EXPLORATORY'
            ? 'EXPLORATORY_WITHIN_PLAN'
            : 'DECISION_RELEVANT_WITHIN_PLAN'
          : 'NONE';

  const adviceMode: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['adviceMode'] =
    input.guidanceDisposition === 'NONE'
      ? 'NONE'
      : input.guidanceDisposition === 'LEAD'
        ? 'DIRECTIVE'
        : input.guidanceDisposition === 'RESTRAINED'
          ? 'RESTRAINED'
          : stable?.relationshipStyle.baselineDistance === 'FAMILIAR'
            || stable?.relationshipStyle.baselineDistance === 'PROFESSIONAL_FRIENDLY'
            ? 'COLLABORATIVE'
            : 'BALANCED';

  const relationshipStance = stable?.relationshipStyle.baselineDistance || 'PROFESSIONAL';
  const cadence = stable?.conversationalTexture.brevity || 'BALANCED';
  const warmthScore = Number(stable?.corePresence.warmth ?? 60);
  const energyScore = Number(stable?.corePresence.energy ?? 50);
  const warmth: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['expressionDynamics']['warmth'] =
    warmthScore >= 70 ? 'WARM' : warmthScore <= 50 ? 'RESTRAINED' : 'BALANCED';
  const engagement: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['expressionDynamics']['engagement'] =
    input.rolePresence === 'BACKGROUND' || input.ownershipLevel === 'LOW'
      ? 'LOW_KEY'
      : input.initiativeRealization === 'PROACTIVE_WITHIN_PLAN' || energyScore >= 60 || input.rolePresence === 'VISIBLE'
        ? 'ACTIVE'
        : 'PRESENT';
  const emotionalSupportAuthorized = hasAny(input.actTypes, ['EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM']);
  const reassurance: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['expressionDynamics']['reassurance'] =
    !emotionalSupportAuthorized
      ? 'LIGHT'
      : stable?.interactionStyle.empathyStyle === 'EXPRESSIVE'
        ? 'EXPRESSIVE'
        : 'STEADY';
  const servicePresence: CustomerServiceRoleConditionedParticipationFrameV1['roleBehavior']['expressionDynamics']['servicePresence'] =
    input.rolePresence === 'BACKGROUND'
      ? 'BACKGROUND'
      : hasAny(input.actTypes, ['OPEN_SERVICE_INVITATION', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'EXECUTE_SERVICE_STEP', 'REPORT_STATUS'])
        ? 'ENGAGED'
        : 'AVAILABLE';
  const expressionDynamics = { warmth, engagement, reassurance, servicePresence };
  const evidenceTargets = [
    'CURRENT_NEED_BEFORE_PROCESS',
    ...(judgmentStyle !== 'NONE' ? ['ROLE_JUDGMENT_WHEN_VALUE_AUTHORIZED'] : []),
    ...(questionThreshold === 'HOLD_THIS_TURN' ? ['NO_OPTIONAL_QUESTION_THIS_TURN'] : []),
    ...(questionThreshold === 'DECISION_RELEVANT_WITHIN_PLAN' || questionThreshold === 'EXPLORATORY_WITHIN_PLAN'
      ? ['ONE_DECISION_RELEVANT_QUESTION_MAX']
      : []),
    ...(relationshipStance !== 'PROFESSIONAL' ? ['RELATIONSHIP_DISTANCE_CONTINUITY'] : []),
    ...(input.ownershipLevel !== 'LOW' ? ['ACTIVE_PARTICIPATION_WITHOUT_PROMISE'] : []),
    ...(warmth === 'WARM' ? ['ROLE_WARMTH_SHOULD_BE_FELT_WITHOUT_STYLE_DECORATION'] : []),
    ...(engagement === 'ACTIVE' ? ['ROLE_ENGAGEMENT_SHOULD_STAY_PRESENT_WITHIN_PLAN'] : []),
    ...(reassurance !== 'LIGHT' ? ['ROLE_REASSURANCE_SHOULD_MATCH_CURRENT_EMOTIONAL_NEED'] : []),
    ...(servicePresence === 'ENGAGED' ? ['ROLE_SERVICE_PRESENCE_SHOULD_BE_OBSERVABLE_WITHOUT_SALES_PRESSURE'] : []),
    'STOP_WHEN_ENOUGH',
  ];
  const fieldSourceMap = new Map(
    (input.resolvedRoleIdentity?.provenance.fieldSources || []).map((item) => [item.field, `${item.source}:${item.sourceKey}`]),
  );
  const sourceSignals = [
    `SPEAKER:${speaker?.source || 'NONE'}`,
    ...['accountExpression.tone', 'accountExpression.voice', 'accountExpression.relationship']
      .map((field) => fieldSourceMap.get(field))
      .filter((item): item is string => Boolean(item)),
    ...(input.posture.source === 'TYPED_V1' ? ['POSTURE:TYPED_V1'] : []),
    ...(input.capabilityContext.source !== 'NONE' ? [`ROLE_CONTEXT:${input.capabilityContext.source}`] : []),
  ];
  const behaviorSignature = [
    responsePriority,
    judgmentStyle,
    relationshipStance,
    questionThreshold,
    adviceMode,
    cadence,
    `warmth=${warmth}`,
    `engagement=${engagement}`,
    `reassurance=${reassurance}`,
    `servicePresence=${servicePresence}`,
  ].join('|');

  return {
    authority: 'REALIZATION_ONLY',
    responsePriority,
    judgmentStyle,
    relationshipStance,
    questionThreshold,
    adviceMode,
    cadence,
    expressionDynamics,
    evidenceTargets,
    sourceSignals,
    behaviorSignature,
  };
}

function hasAny(set: Set<CustomerServiceActType>, values: CustomerServiceActType[]) {
  return values.some((value) => set.has(value));
}
