import type { CustomerServiceRoleInteractionPostureProjectionV1 } from '../role/customer-service-role-interaction-posture-projection';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';
import type { CustomerServiceRoleCapabilityContextProjectionV1 } from '../role/customer-service-role-capability-context-projection';
import type {
  CustomerServiceActType,
  CustomerServiceInteractionPlanV2,
  CustomerServicePlannedAct,
  CustomerServiceSuppressedAct,
} from './customer-service-interaction-plan.type';

export type CustomerServiceRoleTurnManeuverV1 =
  | 'FOLLOW_REQUIRED_TASK'
  | 'GUIDE_THEN_OPTIONAL_CLARIFY'
  | 'PROVIDE_DIRECTION_AND_HOLD'
  | 'ACKNOWLEDGE_AND_HOLD'
  | 'OPTIONAL_CLARIFY'
  | 'FOLLOW_CANONICAL_PLAN';

type ConversationItem = { role: 'CUSTOMER' | 'ASSISTANT'; content: string };

/**
 * Role-driven policy for discretionary Acts in the final Canonical Plan.
 *
 * This is deliberately not a sentence/template layer. It selects already-authorized
 * discretionary Acts and may grant one existing low-pressure service-entry Act from
 * typed Role Posture on low-risk turns. Hard, safety, grounded business and REQUIRED
 * Acts are never removed or downgraded, and Role policy never grants facts or tools.
 */
export function applyCustomerServiceRoleTurnPolicy(input: {
  plan: CustomerServiceInteractionPlanV2;
  speaker: CustomerServiceRoleSpeakerProjectionV1;
  posture: CustomerServiceRoleInteractionPostureProjectionV1;
  capabilityContext: CustomerServiceRoleCapabilityContextProjectionV1;
  recentConversation: ConversationItem[];
}): CustomerServiceInteractionPlanV2 {
  const profile = input.speaker.stableCore;
  const posture = input.posture.effective;
  const customerSuppliedPreference = input.plan.acts.some((item) => item.type === 'ACKNOWLEDGE_PREFERENCE');
  // Prior-answer consumption is owned by the current typed Canonical acknowledgement,
  // not by re-reading the previous assistant prose for question-looking wording.
  const previousAssistantAskedQuestion = customerSuppliedPreference;
  // A previous question is context, not sufficient proof that the latest message
  // answered it. The Canonical Plan's acknowledgement Act is the semantic evidence
  // that a customer condition was actually supplied and must be consumed now.
  const consumeCustomerConditionBeforeNextQuestion = customerSuppliedPreference;
  const removed: CustomerServicePlannedAct[] = [];
  const added: CustomerServicePlannedAct[] = [];
  const optionalQuestionSuppressedByCanonicalPlan = input.plan.suppressedActs.some(
    (item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE',
  );
  const seededActs = input.plan.acts.map(cloneAct);
  const lowPressurePresence = buildLowPressureServicePresenceAct(input, seededActs);
  if (lowPressurePresence) {
    seededActs.push(lowPressurePresence);
    added.push(lowPressurePresence);
  }

  const acts = seededActs.filter((act) => {
    if (act.necessity === 'REQUIRED' || act.type === 'STOP') return true;

    if (act.type === 'REQUEST_OPTIONAL_PREFERENCE') {
      const roleAvoidsOptionalQuestions = profile.interactionStyle.questionStyle === 'MINIMAL'
        || posture.clarificationInitiative === 'REQUIRED_ONLY';
      // A customer reply immediately after our optional question must first be consumed.
      // Even an exploratory Role gets a non-interrogative beat before asking again.
      if (roleAvoidsOptionalQuestions || consumeCustomerConditionBeforeNextQuestion || optionalQuestionSuppressedByCanonicalPlan) {
        removed.push(act);
        return false;
      }
    }

    if (act.type === 'PROVIDE_GENERAL_GUIDANCE') {
      const roleAvoidsUnrequestedAdvice = profile.interactionStyle.adviceStyle === 'RESTRAINED'
        || posture.guidanceInitiative === 'REQUESTED_ONLY';
      // In a reply-to-question turn, the customer is supplying a condition rather than
      // making a fresh request for generic advice. Restrained Roles acknowledge and hold.
      if (consumeCustomerConditionBeforeNextQuestion && roleAvoidsUnrequestedAdvice) {
        removed.push(act);
        return false;
      }
    }

    return true;
  });

  const removedTypes = [...new Set(removed.map((item) => item.type))];
  const maneuver = resolveManeuver(acts, consumeCustomerConditionBeforeNextQuestion);
  const holdQuestionTypes: CustomerServiceActType[] = ['REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY', 'REQUEST_REQUIRED_SLOT'];
  const explicitlySuppressedQuestionTypes = ['PROVIDE_DIRECTION_AND_HOLD', 'ACKNOWLEDGE_AND_HOLD'].includes(maneuver)
    ? holdQuestionTypes.filter((type) => !acts.some((item) => item.type === type))
    : [];
  const existingSuppressedTypes = new Set(input.plan.suppressedActs.map((item) => item.type));
  const policySuppressedTypes = [...new Set([...removedTypes, ...explicitlySuppressedQuestionTypes])]
    .filter((type) => !existingSuppressedTypes.has(type));
  const suppressedActs: CustomerServiceSuppressedAct[] = [
    ...input.plan.suppressedActs.map((item) => ({ ...item, sources: [...item.sources] })),
    ...policySuppressedTypes.map((type) => ({
      type,
      // Role style/question-threshold is a generation preference. Only an explicit
      // customer/business/safety boundary from the Canonical Plan may remain HARD.
      enforcement: 'SOFT' as const,
      priority: 610,
      reasonCode: consumeCustomerConditionBeforeNextQuestion
        ? 'ROLE_TURN_POLICY:CONSUME_CUSTOMER_REPLY_BEFORE_NEW_OPTIONAL_MOVE'
        : 'ROLE_TURN_POLICY:ROLE_DISCRETION_RESTRAINED',
      sources: [{ kind: 'ROLE_PROFILE' as const, refId: input.speaker.provenance.roleId }],
    })),
  ];

  return {
    ...input.plan,
    acts: acts.map(cloneAct),
    suppressedActs,
    diagnostics: {
      ...input.plan.diagnostics,
      roleTurnPolicy: {
        schemaVersion: 1,
        authority: 'CANONICAL_DISCRETIONARY_ACT_POLICY',
        roleSource: input.speaker.source,
        maneuver,
        previousAssistantAskedQuestion,
        customerSuppliedPreference,
        questionStyle: profile.interactionStyle.questionStyle,
        adviceStyle: profile.interactionStyle.adviceStyle,
        proactivity: profile.interactionStyle.proactivity,
        clarificationInitiative: posture.clarificationInitiative,
        guidanceInitiative: posture.guidanceInitiative,
        removedActTypes: removedTypes,
        addedActTypes: [...new Set(added.map((item) => item.type))],
      },
    },
  };
}


function buildLowPressureServicePresenceAct(
  input: {
    plan: CustomerServiceInteractionPlanV2;
    speaker: CustomerServiceRoleSpeakerProjectionV1;
    posture: CustomerServiceRoleInteractionPostureProjectionV1;
    capabilityContext: CustomerServiceRoleCapabilityContextProjectionV1;
    recentConversation: ConversationItem[];
  },
  acts: CustomerServicePlannedAct[],
): CustomerServicePlannedAct | null {
  // This is a Canonical discretionary Act decision, not NLG improvisation. It is
  // intentionally limited to low-risk browse/uncertain turns and one existing Act.
  if (!['CASUAL_CHAT', 'UNCLASSIFIED'].includes(input.plan.interactionType)) return null;
  if (input.plan.completion.mode === 'STOP_AFTER_REQUIRED' || input.plan.completion.allowOptionalContinuation === false) return null;
  if (acts.some((item) => item.type === 'STOP')) return null;
  if (input.posture.source !== 'TYPED_V1') return null;
  if (input.posture.effective.initiativeLevel === 'RESTRAINED') return null;
  if (input.posture.effective.followUpOffering === 'ANSWER_ONLY') return null;
  if (input.speaker.source === 'NEUTRAL_COMPATIBILITY') return null;
  if (input.speaker.stableCore.interactionStyle.proactivity === 'RESTRAINED') return null;
  if (input.capabilityContext.source === 'NONE') return null;
  if (input.plan.behaviorContext.requestedDeltas.includes('LISTEN_ONLY')) return null;
  if (acts.some((item) => item.type === 'OPEN_SERVICE_INVITATION')) return null;
  if (acts.some((item) => item.necessity === 'REQUIRED' && item.type !== 'STOP')) return null;
  if (input.plan.suppressedActs.some((item) => item.type === 'OPEN_SERVICE_INVITATION' && item.enforcement === 'HARD')) return null;

  const target = input.capabilityContext.serviceContext.primaryScope
    || input.capabilityContext.serviceContext.supportAreas[0]
    || '当前角色可承接的服务范围';
  return {
    id: `ROLE_ACT_OPEN_SERVICE_INVITATION_${acts.length + 1}`,
    type: 'OPEN_SERVICE_INVITATION',
    necessity: 'PREFERRED',
    priority: input.posture.effective.followUpOffering === 'ACTIVE_OFFER' ? 690 : 570,
    reasonCode: input.posture.effective.followUpOffering === 'ACTIVE_OFFER'
      ? 'ROLE_POSTURE_ACTIVE_LOW_PRESSURE_SERVICE_PRESENCE'
      : 'ROLE_POSTURE_CONTEXTUAL_LOW_PRESSURE_SERVICE_PRESENCE',
    sources: [{ kind: 'ROLE_PROFILE', refId: input.speaker.provenance.roleId }],
    parameters: {
      target,
      decisionPurpose: '客户暂未形成明确任务时保持低压力服务在场；优先用非追问式可用性/协助表达，不转销售、不索取偏好、不制造泛陪聊',
      expectedInformationGain: 'NONE',
    },
  };
}

function resolveManeuver(
  acts: CustomerServicePlannedAct[],
  previousAssistantAskedQuestion: boolean,
): CustomerServiceRoleTurnManeuverV1 {
  const types = new Set(acts.filter((item) => item.type !== 'STOP').map((item) => item.type));
  if (acts.some((item) => item.necessity === 'REQUIRED' && ['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY', 'EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF'].includes(item.type))) {
    return 'FOLLOW_REQUIRED_TASK';
  }
  const hasGuidance = types.has('PROVIDE_GENERAL_GUIDANCE')
    || types.has('RECOMMEND_GROUNDED_ITEM')
    || types.has('EXPLAIN_GROUNDED_FACT');
  const hasOptionalQuestion = types.has('REQUEST_OPTIONAL_PREFERENCE');
  const hasAcknowledgement = ['ACKNOWLEDGE_PREFERENCE', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'PRESENCE_ACK']
    .some((type) => types.has(type as CustomerServiceActType));
  if (hasGuidance && hasOptionalQuestion) return 'GUIDE_THEN_OPTIONAL_CLARIFY';
  if (hasGuidance) return 'PROVIDE_DIRECTION_AND_HOLD';
  if (hasOptionalQuestion) return 'OPTIONAL_CLARIFY';
  if (hasAcknowledgement && previousAssistantAskedQuestion) return 'ACKNOWLEDGE_AND_HOLD';
  return 'FOLLOW_CANONICAL_PLAN';
}

function cloneAct(act: CustomerServicePlannedAct): CustomerServicePlannedAct {
  return {
    ...act,
    sources: [...act.sources],
    dependsOnActIds: act.dependsOnActIds ? [...act.dependsOnActIds] : undefined,
    grounding: act.grounding?.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] })),
    parameters: act.parameters ? {
      ...act.parameters,
      known: act.parameters.known ? [...act.parameters.known] : undefined,
      missing: act.parameters.missing ? [...act.parameters.missing] : undefined,
    } : undefined,
  };
}
