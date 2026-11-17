export const CUSTOMER_SERVICE_ROLE_INITIATIVE_LEVELS = ['RESTRAINED', 'BALANCED', 'PROACTIVE'] as const;
export const CUSTOMER_SERVICE_ROLE_OPENING_PARTICIPATIONS = ['ACK_ONLY', 'CONTEXTUAL_ENTRY', 'ACTIVE_ENTRY'] as const;
export const CUSTOMER_SERVICE_ROLE_FOLLOW_UP_OFFERINGS = ['ANSWER_ONLY', 'CONTEXTUAL_OFFER', 'ACTIVE_OFFER'] as const;
export const CUSTOMER_SERVICE_ROLE_CLARIFICATION_INITIATIVES = ['REQUIRED_ONLY', 'DECISION_RELEVANT', 'EXPLORATORY'] as const;
export const CUSTOMER_SERVICE_ROLE_GUIDANCE_INITIATIVES = ['REQUESTED_ONLY', 'CONTEXTUAL', 'PROACTIVE_WHEN_USEFUL'] as const;
export const CUSTOMER_SERVICE_ROLE_RESOLUTION_FOLLOW_THROUGHS = ['MINIMAL', 'NEXT_STEP', 'UNTIL_RESOLVED'] as const;
export const CUSTOMER_SERVICE_ROLE_SALES_PRESSURES = ['NONE', 'LOW', 'NORMAL'] as const;

export type CustomerServiceRoleInitiativeLevel = typeof CUSTOMER_SERVICE_ROLE_INITIATIVE_LEVELS[number];
export type CustomerServiceRoleOpeningParticipation = typeof CUSTOMER_SERVICE_ROLE_OPENING_PARTICIPATIONS[number];
export type CustomerServiceRoleFollowUpOffering = typeof CUSTOMER_SERVICE_ROLE_FOLLOW_UP_OFFERINGS[number];
export type CustomerServiceRoleClarificationInitiative = typeof CUSTOMER_SERVICE_ROLE_CLARIFICATION_INITIATIVES[number];
export type CustomerServiceRoleGuidanceInitiative = typeof CUSTOMER_SERVICE_ROLE_GUIDANCE_INITIATIVES[number];
export type CustomerServiceRoleResolutionFollowThrough = typeof CUSTOMER_SERVICE_ROLE_RESOLUTION_FOLLOW_THROUGHS[number];
export type CustomerServiceRoleSalesPressure = typeof CUSTOMER_SERVICE_ROLE_SALES_PRESSURES[number];

/**
 * V1.9 Role Interaction Posture is Role data, not a second policy runtime.
 * It describes how an explicitly bound Role normally participates when the
 * existing Planner/Guideline authority allows that behavior.
 */
export type CustomerServiceRoleInteractionPostureV1 = {
  schemaVersion: 1;
  initiativeLevel: CustomerServiceRoleInitiativeLevel;
  openingParticipation: CustomerServiceRoleOpeningParticipation;
  followUpOffering: CustomerServiceRoleFollowUpOffering;
  clarificationInitiative: CustomerServiceRoleClarificationInitiative;
  guidanceInitiative: CustomerServiceRoleGuidanceInitiative;
  resolutionFollowThrough: CustomerServiceRoleResolutionFollowThrough;
  salesPressure: CustomerServiceRoleSalesPressure;
};

export type CustomerServiceRoleInteractionPostureParseResult = {
  posture: CustomerServiceRoleInteractionPostureV1 | null;
  issues: string[];
};

export function compatibilityCustomerServiceRoleInteractionPosture(): CustomerServiceRoleInteractionPostureV1 {
  return {
    schemaVersion: 1,
    initiativeLevel: 'BALANCED',
    openingParticipation: 'ACK_ONLY',
    followUpOffering: 'ANSWER_ONLY',
    clarificationInitiative: 'REQUIRED_ONLY',
    guidanceInitiative: 'REQUESTED_ONLY',
    resolutionFollowThrough: 'MINIMAL',
    salesPressure: 'NONE',
  };
}

export function defaultCustomerServiceRoleInteractionPosture(): CustomerServiceRoleInteractionPostureV1 {
  return {
    schemaVersion: 1,
    initiativeLevel: 'BALANCED',
    openingParticipation: 'CONTEXTUAL_ENTRY',
    followUpOffering: 'CONTEXTUAL_OFFER',
    clarificationInitiative: 'DECISION_RELEVANT',
    guidanceInitiative: 'CONTEXTUAL',
    resolutionFollowThrough: 'NEXT_STEP',
    salesPressure: 'LOW',
  };
}

export function parseCustomerServiceRoleInteractionPosture(value: unknown): CustomerServiceRoleInteractionPostureParseResult {
  const root = asRecord(value);
  if (!root) return { posture: null, issues: ['content 必须是对象'] };
  if (root.schemaVersion !== 1) return { posture: null, issues: [] };
  const issues: string[] = [];
  const posture: CustomerServiceRoleInteractionPostureV1 = {
    schemaVersion: 1,
    initiativeLevel: enumField(root.initiativeLevel, CUSTOMER_SERVICE_ROLE_INITIATIVE_LEVELS, 'initiativeLevel', issues),
    openingParticipation: enumField(root.openingParticipation, CUSTOMER_SERVICE_ROLE_OPENING_PARTICIPATIONS, 'openingParticipation', issues),
    followUpOffering: enumField(root.followUpOffering, CUSTOMER_SERVICE_ROLE_FOLLOW_UP_OFFERINGS, 'followUpOffering', issues),
    clarificationInitiative: enumField(root.clarificationInitiative, CUSTOMER_SERVICE_ROLE_CLARIFICATION_INITIATIVES, 'clarificationInitiative', issues),
    guidanceInitiative: enumField(root.guidanceInitiative, CUSTOMER_SERVICE_ROLE_GUIDANCE_INITIATIVES, 'guidanceInitiative', issues),
    resolutionFollowThrough: enumField(root.resolutionFollowThrough, CUSTOMER_SERVICE_ROLE_RESOLUTION_FOLLOW_THROUGHS, 'resolutionFollowThrough', issues),
    salesPressure: enumField(root.salesPressure, CUSTOMER_SERVICE_ROLE_SALES_PRESSURES, 'salesPressure', issues),
  };
  return { posture: issues.length ? null : posture, issues };
}

function enumField<T extends readonly string[]>(value: unknown, allowed: T, field: string, issues: string[]): T[number] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if ((allowed as readonly string[]).includes(normalized)) return normalized as T[number];
  issues.push(`${field} 必须是 ${allowed.join(' / ')}`);
  return allowed[0];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
