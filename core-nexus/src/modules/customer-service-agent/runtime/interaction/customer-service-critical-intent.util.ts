import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';

export type CustomerServiceCriticalIntent =
  | 'NONE'
  | 'AI_IDENTITY_QUERY'
  | 'ROLE_CONFIRMATION'
  | 'NAME_QUERY'
  | 'SERVICE_SCOPE_QUERY';

export type CustomerServiceCriticalIntentResolution = {
  intent: CustomerServiceCriticalIntent;
  confidence: number;
  evidence: string[];
};

/**
 * Identity/service semantics are owned by Deep Recognition. This projection is
 * deterministic only over the typed envelope; it never re-parses customer wording.
 */
export function resolveCustomerServiceCriticalIntent(
  understanding: CustomerServiceMessageUnderstanding,
): CustomerServiceCriticalIntentResolution {
  const goals = [
    understanding.humanContext.dominantTurnGoal,
    ...(understanding.humanContext.requiredTurnGoals || []),
  ].filter(Boolean);
  const focus = goals.find((goal) => [
    'AI_IDENTITY', 'PUBLIC_NAME', 'SERVICE_ROLE', 'SERVICE_SCOPE',
  ].includes(String(goal?.requestedAnswerFocus)))?.requestedAnswerFocus;
  const mapping: Record<string, CustomerServiceCriticalIntent> = {
    AI_IDENTITY: 'AI_IDENTITY_QUERY',
    PUBLIC_NAME: 'NAME_QUERY',
    SERVICE_ROLE: 'ROLE_CONFIRMATION',
    SERVICE_SCOPE: 'SERVICE_SCOPE_QUERY',
  };
  const intent = focus ? mapping[focus] || 'NONE' : 'NONE';
  return intent === 'NONE'
    ? { intent: 'NONE', confidence: 0, evidence: [] }
    : { intent, confidence: 1, evidence: [`TYPED_ANSWER_FOCUS:${focus}`] };
}
