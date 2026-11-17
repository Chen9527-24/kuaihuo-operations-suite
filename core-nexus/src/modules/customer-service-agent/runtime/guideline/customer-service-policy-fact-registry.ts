import type {
  CustomerServiceGuidelineFactKey,
  CustomerServiceGuidelineOperator,
} from './customer-service-guideline.type';

export type CustomerServicePolicyFactValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'STRING_ARRAY';
export type CustomerServicePolicyFactDefinition = {
  key: CustomerServiceGuidelineFactKey;
  valueType: CustomerServicePolicyFactValueType;
  allowedOperators: CustomerServiceGuidelineOperator[];
  source: string;
  kind: 'CANONICAL' | 'DERIVED';
  missingPolicy: 'UNKNOWN';
};

const STRING_OPS: CustomerServiceGuidelineOperator[] = ['EQ', 'NE', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS', 'CONTAINS'];
const NUMBER_OPS: CustomerServiceGuidelineOperator[] = ['EQ', 'NE', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS', 'GT', 'GTE', 'LT', 'LTE'];
const BOOLEAN_OPS: CustomerServiceGuidelineOperator[] = ['EQ', 'NE', 'EXISTS', 'NOT_EXISTS'];
const ARRAY_OPS: CustomerServiceGuidelineOperator[] = ['EQ', 'NE', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS', 'CONTAINS'];

export const CUSTOMER_SERVICE_POLICY_FACT_REGISTRY: Readonly<Record<CustomerServiceGuidelineFactKey, CustomerServicePolicyFactDefinition>> = {
  'interaction.type': def('interaction.type', 'STRING', STRING_OPS, 'InteractionTypeResolver', 'DERIVED'),
  'understanding.scenario': def('understanding.scenario', 'STRING', STRING_OPS, 'Understanding', 'CANONICAL'),
  'understanding.intent': def('understanding.intent', 'STRING', STRING_OPS, 'Understanding', 'CANONICAL'),
  'understanding.riskLevel': def('understanding.riskLevel', 'STRING', STRING_OPS, 'Understanding', 'CANONICAL'),
  'task.status': def('task.status', 'STRING', STRING_OPS, 'ConversationState', 'CANONICAL'),
  'task.intent': def('task.intent', 'STRING', STRING_OPS, 'ConversationState', 'CANONICAL'),
  'task.pendingSlots': def('task.pendingSlots', 'STRING_ARRAY', ARRAY_OPS, 'ConversationState', 'CANONICAL'),
  'state.topicShift': def('state.topicShift', 'BOOLEAN', BOOLEAN_OPS, 'Understanding/State', 'DERIVED'),
  'knowledge.matched': def('knowledge.matched', 'BOOLEAN', BOOLEAN_OPS, 'KnowledgeRetrieval', 'DERIVED'),
  'knowledge.count': def('knowledge.count', 'NUMBER', NUMBER_OPS, 'KnowledgeRetrieval', 'DERIVED'),
  'knowledge.categories': def('knowledge.categories', 'STRING_ARRAY', ARRAY_OPS, 'KnowledgeRetrieval', 'DERIVED'),
  'behavior.consecutiveQuestionTurns': def('behavior.consecutiveQuestionTurns', 'NUMBER', NUMBER_OPS, 'AssistantMoveLedger', 'DERIVED'),
  'behavior.recentOptionalQuestionCount': def('behavior.recentOptionalQuestionCount', 'NUMBER', NUMBER_OPS, 'AssistantMoveLedger', 'DERIVED'),
  'behavior.recentRequiredQuestionCount': def('behavior.recentRequiredQuestionCount', 'NUMBER', NUMBER_OPS, 'AssistantMoveLedger', 'DERIVED'),
  'behavior.recentCtaCount': def('behavior.recentCtaCount', 'NUMBER', NUMBER_OPS, 'AssistantMoveLedger', 'DERIVED'),
  'behavior.requestedDeltas': def('behavior.requestedDeltas', 'STRING_ARRAY', ARRAY_OPS, 'ConversationState', 'CANONICAL'),
  'behavior.lastReplyAccepted': def('behavior.lastReplyAccepted', 'BOOLEAN', BOOLEAN_OPS, 'AssistantMoveLedger', 'DERIVED'),
  'behavior.lastReplyRejected': def('behavior.lastReplyRejected', 'BOOLEAN', BOOLEAN_OPS, 'AssistantMoveLedger', 'DERIVED'),
  'relationship.stage': def('relationship.stage', 'STRING', STRING_OPS, 'Understanding/ConversationState', 'CANONICAL'),
  'role.posture.source': def('role.posture.source', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.initiativeLevel': def('role.posture.initiativeLevel', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.openingParticipation': def('role.posture.openingParticipation', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.followUpOffering': def('role.posture.followUpOffering', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.clarificationInitiative': def('role.posture.clarificationInitiative', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.guidanceInitiative': def('role.posture.guidanceInitiative', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.resolutionFollowThrough': def('role.posture.resolutionFollowThrough', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'role.posture.salesPressure': def('role.posture.salesPressure', 'STRING', STRING_OPS, 'ActiveRoleProjection', 'DERIVED'),
  'opening.active': def('opening.active', 'BOOLEAN', BOOLEAN_OPS, 'OpeningReception', 'DERIVED'),
  'opening.greetingMode': def('opening.greetingMode', 'STRING', STRING_OPS, 'OpeningReception', 'DERIVED'),
  'runtime.channel': def('runtime.channel', 'STRING', STRING_OPS, 'RuntimeContext', 'CANONICAL'),
  'runtime.platform': def('runtime.platform', 'STRING', STRING_OPS, 'RuntimeContext', 'CANONICAL'),
};

export function getCustomerServicePolicyFactDefinition(key: string) {
  return CUSTOMER_SERVICE_POLICY_FACT_REGISTRY[key as CustomerServiceGuidelineFactKey] || null;
}

function def(
  key: CustomerServiceGuidelineFactKey,
  valueType: CustomerServicePolicyFactValueType,
  allowedOperators: CustomerServiceGuidelineOperator[],
  source: string,
  kind: 'CANONICAL' | 'DERIVED',
): CustomerServicePolicyFactDefinition {
  return { key, valueType, allowedOperators, source, kind, missingPolicy: 'UNKNOWN' };
}
