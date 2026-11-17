import type { CustomerServiceOrchestrationPlan } from '../planning/customer-service-reply-planner.service';
import type { CustomerServiceConversationStateSummary } from '../state/customer-service-conversation-state.type';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import type { CustomerServiceSelectedKnowledgeEntry } from '../../shared/context/customer-service-knowledge.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import type {
  CustomerServiceGuidelineContextSnapshot,
  CustomerServiceGuidelineFactKey,
} from './customer-service-guideline.type';
import type { CustomerServiceInteractionType } from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceRoleInteractionPostureProjectionV1 } from '../role/customer-service-role-interaction-posture-projection';
import type { CustomerServiceOpeningReceptionContext } from '../../shared/context/customer-service-opening-reception.util';

export function buildCustomerServiceGuidelineContextSnapshot(input: {
  tenantId: string;
  roleId: string;
  roleCode: string;
  storeProfileId?: string | null;
  accountProfileId?: string | null;
  industryCode?: string | null;
  channel?: string | null;
  platform?: string | null;
  interactionType: CustomerServiceInteractionType;
  understanding: CustomerServiceMessageUnderstanding;
  plan: CustomerServiceOrchestrationPlan;
  state: CustomerServiceConversationStateSummary;
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
  roleInteractionPosture: CustomerServiceRoleInteractionPostureProjectionV1;
  openingReception?: CustomerServiceOpeningReceptionContext;
}): CustomerServiceGuidelineContextSnapshot {
  const task = input.state.activeTask;
  const history = input.state.behaviorHistory;
  const recentMove = input.state.recentAssistantMoves[input.state.recentAssistantMoves.length - 1];
  const facts: CustomerServiceGuidelineContextSnapshot['facts'] = {
    'interaction.type': input.interactionType,
    'understanding.scenario': input.understanding.primaryScenario,
    'understanding.intent': input.understanding.primaryIntent,
    'understanding.riskLevel': input.understanding.riskLevel,
    'task.status': task?.status || input.understanding.humanContext.conversationTaskState.status,
    'task.intent': task?.intent || input.understanding.primaryIntent,
    'task.pendingSlots': uniqueStrings([
      ...(task?.pendingSlots || []),
      ...(input.understanding.humanContext.conversationTaskState.pendingSlots || []),
    ]),
    'state.topicShift': input.understanding.humanContext.conversationTaskState.currentTurnRelation === 'TOPIC_SHIFT',
    'knowledge.matched': input.knowledgeEntries.length > 0,
    'knowledge.count': input.knowledgeEntries.length,
    'knowledge.categories': uniqueStrings(input.knowledgeEntries.map((item: any) => item.category)),
    'behavior.consecutiveQuestionTurns': history.consecutiveQuestionEndingTurns,
    'behavior.recentOptionalQuestionCount': history.recentOptionalQuestionCount,
    'behavior.recentRequiredQuestionCount': history.recentRequiredQuestionCount,
    'behavior.recentCtaCount': history.recentCtaCount,
    'behavior.requestedDeltas': history.recentRequestedDeltas || [],
    'behavior.lastReplyAccepted': recentMove?.accepted === true,
    'behavior.lastReplyRejected': recentMove?.rejected === true,
    'relationship.stage': input.understanding.humanContext.relationshipState || input.state.canonicalFields.relationship.value || '',
    'role.posture.source': input.roleInteractionPosture.source,
    'role.posture.initiativeLevel': input.roleInteractionPosture.effective.initiativeLevel,
    'role.posture.openingParticipation': input.roleInteractionPosture.effective.openingParticipation,
    'role.posture.followUpOffering': input.roleInteractionPosture.effective.followUpOffering,
    'role.posture.clarificationInitiative': input.roleInteractionPosture.effective.clarificationInitiative,
    'role.posture.guidanceInitiative': input.roleInteractionPosture.effective.guidanceInitiative,
    'role.posture.resolutionFollowThrough': input.roleInteractionPosture.effective.resolutionFollowThrough,
    'role.posture.salesPressure': input.roleInteractionPosture.effective.salesPressure,
    'opening.active': input.openingReception?.active === true,
    'opening.greetingMode': input.openingReception?.greetingMode || '',
    'runtime.channel': input.channel || '',
    'runtime.platform': input.platform || '',
  };
  const unavailableFacts: CustomerServiceGuidelineFactKey[] = [];
  for (const key of ['opening.greetingMode', 'runtime.channel', 'runtime.platform'] as const) if (!facts[key]) unavailableFacts.push(key);
  const snapshotBase = {
    tenantId: input.tenantId,
    binding: {
      roleId: input.roleId,
      roleCode: input.roleCode,
      storeProfileId: input.storeProfileId || null,
      accountProfileId: input.accountProfileId || null,
      industryCode: input.industryCode || null,
      channel: input.channel || null,
    },
    facts,
    unavailableFacts,
  };
  return { ...snapshotBase, snapshotHash: stableJsonHash(snapshotBase) };
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
}
