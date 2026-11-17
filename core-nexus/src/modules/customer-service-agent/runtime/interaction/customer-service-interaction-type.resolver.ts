import { Injectable } from '@nestjs/common';
import type { CustomerServiceOrchestrationPlan } from '../planning/customer-service-reply-planner.service';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import type { CustomerServiceInteractionType } from './customer-service-interaction-plan.type';
import { resolveCustomerServiceCriticalIntent } from './customer-service-critical-intent.util';

@Injectable()
export class CustomerServiceInteractionTypeResolver {
  resolve(input: {
    understanding: CustomerServiceMessageUnderstanding;
    plan: CustomerServiceOrchestrationPlan;
    knowledgeAvailable: boolean;
    latestCustomerMessage?: string;
  }): CustomerServiceInteractionType {
    const { understanding } = input;
    const human = understanding.humanContext;
    const task = human.conversationTaskState;
    const criticalIntent = resolveCustomerServiceCriticalIntent(understanding);
    const currentTurnGoals = [
      human.dominantTurnGoal,
      ...(human.requiredTurnGoals || []),
    ].filter(Boolean);
    const turnGoalKeys = new Set(currentTurnGoals.map((goal) => goal?.key).filter(Boolean));
    const merchantSelectionRequired = currentTurnGoals.some((goal) => (
      goal?.requestedContributionKind === 'DECISION_SUPPORT'
      && goal?.requestedEvidenceScope === 'MERCHANT_BUSINESS'
      && goal?.requestedDecisionMode === 'SELECT_OR_PRIORITIZE_OPTION'
    ));
    const hasTypedDecisionMode = currentTurnGoals.some((goal) => (
      goal?.requestedContributionKind === 'DECISION_SUPPORT'
      && Boolean(goal?.requestedDecisionMode)
    ));
    const currentTurnHardSafetyEvidence = understanding.topics?.some((topic) => (
      ['SECURITY_SENSITIVE', 'SAFETY_SENSITIVE'].includes(topic.scenario)
      && topic.evidence.includes('当前轮明确命中')
    )) === true;
    const settledInheritedSafetyClosure = turnGoalKeys.has('CLOSE_CONVERSATION')
      && human.dialogueObligation.userFeedback === 'ACCEPTED'
      && human.dialogueObligation.requestedDeltas.length === 0
      && human.dialogueObligation.strategyChangeRequired === false
      && !task.pendingSlots?.some((slot) => ['MISSING', 'REQUESTED'].includes(slot.status))
      && !currentTurnHardSafetyEvidence;

    // Safety/Security remains hard unless an evidence-bound current close is also
    // structurally settled. Historical risk context alone cannot manufacture a new
    // risk answer after acceptance, but current risk evidence or unresolved required
    // information always keeps the hard safety interaction family.
    if ((understanding.primaryScenario === 'SECURITY_SENSITIVE' || understanding.primaryScenario === 'SAFETY_SENSITIVE')
      && !settledInheritedSafetyClosure) return 'SECURITY_SENSITIVE';

    // Current explicit conversation operations own the turn before stale service
    // family context. Safety/Security has already been resolved above.
    if (turnGoalKeys.has('CLOSE_CONVERSATION')) return 'CASUAL_CHAT';
    if (turnGoalKeys.has('SUMMARIZE_CONVERSATION')) return 'GENERAL_SERVICE';

    if (criticalIntent.intent !== 'NONE') return criticalIntent.intent;

    if (understanding.primaryScenario === 'COMPLAINT_ESCALATION') return 'COMPLAINT';
    if (understanding.primaryScenario === 'REFUND_REQUEST') return 'REFUND_REQUEST';
    if (understanding.primaryScenario === 'AFTER_SALE') return 'AFTER_SALES';
    if (understanding.primaryScenario === 'LOGISTICS_DELAY') return 'LOGISTICS_DELAY';
    if (understanding.primaryScenario === 'ORDER_STATUS') return 'LOGISTICS_STATUS';

    // Deep Recognition's typed decision mode owns whether the turn is asking to select
    // an option or evaluate the already-established option. Only selection/prioritization
    // can create PRODUCT_DISCOVERY. ASSESS_CURRENT_OPTION remains in the fact/evaluation
    // family and must not be converted into authority to recommend a replacement item.
    // The legacy key fallback is retained only for non-typed fallback envelopes.
    if (merchantSelectionRequired
      || (!hasTypedDecisionMode && turnGoalKeys.has('SUPPORT_PURCHASE_DECISION'))) {
      return input.knowledgeAvailable ? 'PRODUCT_DISCOVERY' : 'PRODUCT_DISCOVERY_NO_GROUNDING';
    }

    if (['PRODUCT_CONSULT', 'PRODUCT_COMPARE', 'PRICE_HESITATION'].includes(understanding.primaryScenario)) {
      if (understanding.primaryIntent === 'ASK_INFORMATION' || understanding.primaryScenario === 'PRODUCT_COMPARE') {
        return 'PRODUCT_FACT_QUERY';
      }
      return input.knowledgeAvailable ? 'PRODUCT_DISCOVERY' : 'PRODUCT_DISCOVERY_NO_GROUNDING';
    }

    if (understanding.primaryScenario === 'CASUAL_CHAT') {
      // H0.2-C Final Reality Closure: explicit task continuity outranks weak
      // opening/relationship-contact posture. Feedback about the immediately
      // previous assistant response is an ongoing exchange event, never a fresh
      // social opening. Keep it in the ordinary conversational lane so Canonical
      // Turn Obligation can consume the same DialogueObligation state.
      if (task.currentTurnRelation === 'TOPIC_SHIFT') return 'TOPIC_SHIFT';
      if (human.dialogueObligation.strategyChangeRequired) return 'CASUAL_CHAT';
      // R0: current task semantics own InteractionType before emotion/relationship
      // posture. Worry, warmth or casual wording may tune realization, but cannot
      // turn a concrete information/problem/action turn into disclosure/greeting.
      if (hasTaskCurrentTurnNeed(turnGoalKeys, understanding.primaryIntent)
        || hasSubstantivePrimaryIntent(understanding.primaryIntent)) return 'CASUAL_CHAT';
      if (human.emotionalDisclosure.mode === 'POSITIVE_SHARING') return 'POSITIVE_SHARING';
      if (human.emotionalDisclosure.detected && ['NEGATIVE_SHARING', 'VENTING', 'SEEK_LISTENING', 'SEEK_COMFORT', 'GRIEF_OR_LOSS', 'RELATIONSHIP_DISTRESS'].includes(human.emotionalDisclosure.mode)) {
        return 'NEGATIVE_DISCLOSURE';
      }
      // Explicit emotional/boundary goals still prevent a pure greeting label even
      // when the disclosure observer is uncertain.
      if (hasSubstantiveCurrentTurnNeed(turnGoalKeys)) return 'CASUAL_CHAT';
      if (human.interactionStrategy.phase === 'OPENING' && human.primaryMotive === 'RELATIONSHIP_CONTACT') return 'SOCIAL_GREETING';
      if (human.primaryMotive === 'RELATIONSHIP_CONTACT' && task.status === 'IN_PROGRESS') return 'RETURN_TO_BUSINESS';
      return 'CASUAL_CHAT';
    }

    if (task.currentTurnRelation === 'TOPIC_SHIFT') return 'TOPIC_SHIFT';
    if (understanding.primaryScenario === 'GENERAL_INQUIRY' || understanding.primaryScenario === 'APPOINTMENT') return 'GENERAL_SERVICE';
    return understanding.primaryScenario === 'UNKNOWN' ? 'UNCLASSIFIED' : 'GENERAL_SERVICE';
  }
}

function hasTaskCurrentTurnNeed(turnGoalKeys: Set<string>, primaryIntent: string) {
  if (turnGoalKeys.has('PROVIDE_REQUESTED_ADVICE')
    && String(primaryIntent || '').toUpperCase() !== 'EMOTIONAL_DISCLOSURE') return true;
  return [
    'PROCESS_PROVIDED_INFORMATION', 'HANDLE_INFORMATION_BARRIER', 'ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION',
    'EXECUTE_REQUEST', 'RESOLVE_CURRENT_PROBLEM', 'REPAIR_TRUST', 'CLARIFY_NEED',
    'SUPPORT_PURCHASE_DECISION', 'CONFIRM_TRANSACTION',
  ].some((key) => turnGoalKeys.has(key));
}

function hasSubstantiveCurrentTurnNeed(turnGoalKeys: Set<string>) {
  return [
    'PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING', 'PROVIDE_REQUESTED_ADVICE', 'RESPECT_EMOTIONAL_SPACE',
    'PROCESS_PROVIDED_INFORMATION', 'HANDLE_INFORMATION_BARRIER', 'ANSWER_INFORMATION', 'SUMMARIZE_CONVERSATION',
    'EXECUTE_REQUEST', 'RESOLVE_CURRENT_PROBLEM', 'REPAIR_TRUST', 'CLARIFY_NEED',
    'SUPPORT_PURCHASE_DECISION', 'CONFIRM_TRANSACTION',
  ].some((key) => turnGoalKeys.has(key));
}

function hasSubstantivePrimaryIntent(intent: string) {
  return ['ASK_INFORMATION', 'REQUEST_ACTION', 'PROBLEM_RESOLUTION', 'REFUSE_SOLUTION', 'EXPRESS_DISSATISFACTION'].includes(String(intent || '').toUpperCase());
}
