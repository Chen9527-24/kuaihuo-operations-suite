import type {
  CustomerServiceActType,
  CustomerServiceActParameters,
  CustomerServiceCompletionCondition,
  CustomerServiceGroundingRequirement,
  CustomerServiceInteractionPlanV2,
} from '../interaction/customer-service-interaction-plan.type';

export const CUSTOMER_SERVICE_GUIDELINE_BINDING_TYPES = [
  'SYSTEM', 'TENANT', 'ROLE', 'STORE', 'ACCOUNT', 'INDUSTRY', 'CHANNEL',
] as const;
export type CustomerServiceGuidelineBindingType = (typeof CUSTOMER_SERVICE_GUIDELINE_BINDING_TYPES)[number];

export const CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES = [
  'ADVISORY', 'STANDARD', 'IMPORTANT', 'MANDATORY',
] as const;
export type CustomerServiceGuidelineCriticality = (typeof CUSTOMER_SERVICE_GUIDELINE_CRITICALITIES)[number];

export type CustomerServiceGuidelineBinding = {
  type: CustomerServiceGuidelineBindingType;
  key: string;
};

export const CUSTOMER_SERVICE_GUIDELINE_FACT_KEYS = [
  'interaction.type',
  'understanding.scenario',
  'understanding.intent',
  'understanding.riskLevel',
  'task.status',
  'task.intent',
  'task.pendingSlots',
  'state.topicShift',
  'knowledge.matched',
  'knowledge.count',
  'knowledge.categories',
  'behavior.consecutiveQuestionTurns',
  'behavior.recentOptionalQuestionCount',
  'behavior.recentRequiredQuestionCount',
  'behavior.recentCtaCount',
  'behavior.requestedDeltas',
  'behavior.lastReplyAccepted',
  'behavior.lastReplyRejected',
  'relationship.stage',
  'role.posture.source',
  'role.posture.initiativeLevel',
  'role.posture.openingParticipation',
  'role.posture.followUpOffering',
  'role.posture.clarificationInitiative',
  'role.posture.guidanceInitiative',
  'role.posture.resolutionFollowThrough',
  'role.posture.salesPressure',
  'opening.active',
  'opening.greetingMode',
  'runtime.channel',
  'runtime.platform',
] as const;
export type CustomerServiceGuidelineFactKey = (typeof CUSTOMER_SERVICE_GUIDELINE_FACT_KEYS)[number];

export const CUSTOMER_SERVICE_GUIDELINE_OPERATORS = [
  'EQ', 'NE', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS',
] as const;
export type CustomerServiceGuidelineOperator = (typeof CUSTOMER_SERVICE_GUIDELINE_OPERATORS)[number];

export type CustomerServiceGuidelineConditionLeaf = {
  fact: CustomerServiceGuidelineFactKey | string;
  op: CustomerServiceGuidelineOperator | string;
  value?: unknown;
};
export type CustomerServiceGuidelineCondition =
  | CustomerServiceGuidelineConditionLeaf
  | { all: CustomerServiceGuidelineCondition[] }
  | { any: CustomerServiceGuidelineCondition[] }
  | { not: CustomerServiceGuidelineCondition };

export type CustomerServiceGuidelineRelationshipRef = {
  kind: 'GUIDELINE' | 'TAG';
  value: string;
};

export type CustomerServiceGuidelineRelationships = {
  dependencies?: {
    mode: 'ALL' | 'ANY';
    refs: CustomerServiceGuidelineRelationshipRef[];
  };
  excludes?: CustomerServiceGuidelineRelationshipRef[];
  prioritizeOver?: CustomerServiceGuidelineRelationshipRef[];
};

export type CustomerServiceGuidelineAction =
  | {
      op: 'REQUIRE_ACT';
      act: CustomerServiceActType;
      necessity?: 'REQUIRED' | 'PREFERRED' | 'OPTIONAL';
      priority?: number;
      trackingKey?: string;
      dependsOnTrackingKeys?: string[];
      parameters?: CustomerServiceActParameters;
      enforcement?: 'HARD' | 'SOFT';
    }
  | {
      op: 'SUPPRESS_ACT';
      act: CustomerServiceActType;
      enforcement: 'HARD' | 'SOFT';
      priority?: number;
    }
  | { op: 'PRIORITIZE_ACT'; act: CustomerServiceActType; priority: number }
  | {
      op: 'SET_COMPLETION';
      mode: CustomerServiceInteractionPlanV2['completion']['mode'];
      conditions?: CustomerServiceCompletionCondition[];
      allowOptionalContinuation?: boolean;
      enforcement?: 'HARD' | 'SOFT';
    }
  | { op: 'REQUIRE_GROUNDING'; requirement: CustomerServiceGroundingRequirement }
  | {
      op: 'USE_RESPONSE_ASSET';
      assetId: string;
      versionId: string;
      versionNo?: number;
      responseType?: string;
    }
  | {
      op: 'SET_REALIZATION_PREFERENCE';
      key: keyof CustomerServiceInteractionPlanV2['realizationPreferences'];
      value: string;
    }
  | { op: 'REQUEST_HANDOFF'; reasonCode?: string };

export type CustomerServicePublishedGuideline = {
  guidelineId: string;
  code: string;
  name: string;
  originType: string;
  versionId: string;
  versionNo: number;
  schemaVersion: number;
  binding: CustomerServiceGuidelineBinding;
  condition: CustomerServiceGuidelineCondition;
  actions: CustomerServiceGuidelineAction[];
  priority: number;
  criticality: CustomerServiceGuidelineCriticality;
  tags: string[];
  relationships: CustomerServiceGuidelineRelationships;
  evidenceRefs: string[];
  contentHash: string;
};

export type CustomerServiceGuidelineFactValue = string | number | boolean | string[] | null;

export type CustomerServiceGuidelineContextSnapshot = {
  snapshotHash: string;
  tenantId: string;
  binding: {
    roleId: string;
    roleCode: string;
    storeProfileId: string | null;
    accountProfileId: string | null;
    industryCode: string | null;
    channel: string | null;
  };
  facts: Partial<Record<CustomerServiceGuidelineFactKey, CustomerServiceGuidelineFactValue>>;
  unavailableFacts: CustomerServiceGuidelineFactKey[];
};

export type CustomerServiceGuidelineConditionStatus = 'MATCHED' | 'NOT_MATCHED' | 'UNKNOWN' | 'INVALID';
export type CustomerServiceGuidelineConditionResult = {
  status: CustomerServiceGuidelineConditionStatus;
  reasonCode: string;
  evidence: Array<{ fact?: string; actual?: unknown; expected?: unknown; op?: string; status: string }>;
};

export type CustomerServiceGuidelineResolutionStatus =
  | 'MATCHED'
  | 'SCOPE_MISS'
  | 'CONDITION_FALSE'
  | 'FACT_UNKNOWN'
  | 'INVALID'
  | 'DEPENDENCY_UNMET'
  | 'EXCLUDED'
  | 'DEPRIORITIZED'
  | 'CONFLICTED'
  | 'APPLIED';

export type CustomerServiceGuidelineResolutionTrace = {
  guidelineId: string;
  code: string;
  versionId: string;
  versionNo: number;
  criticality: CustomerServiceGuidelineCriticality;
  priority: number;
  status: CustomerServiceGuidelineResolutionStatus;
  reasonCode: string;
  relatedGuidelineIds: string[];
  conditionEvidence: CustomerServiceGuidelineConditionResult['evidence'];
};

export type CustomerServiceGuidelineConflict = {
  kind: 'UNRESOLVED_HARD_CONFLICT' | 'ACTION_CONFLICT';
  act?: CustomerServiceActType;
  guidelineIds: string[];
  reasonCode: string;
};

export type CustomerServiceGuidelineResolvedDecision = {
  guidelineId: string;
  code: string;
  versionId: string;
  versionNo: number;
  criticality: CustomerServiceGuidelineCriticality;
  guidelinePriority: number;
  action: CustomerServiceGuidelineAction;
};

export type CustomerServiceGuidelineResolutionSet = {
  schemaVersion: 1;
  shadow: true;
  snapshotHash: string;
  resolutionHash: string;
  guidelineVersionIds: string[];
  traces: CustomerServiceGuidelineResolutionTrace[];
  decisions: CustomerServiceGuidelineResolvedDecision[];
  conflicts: CustomerServiceGuidelineConflict[];
  hasUnresolvedHardConflict: boolean;
};

export type CustomerServiceGuidelineVersionDraftContent = {
  schemaVersion: number;
  binding: CustomerServiceGuidelineBinding;
  condition: CustomerServiceGuidelineCondition;
  actions: CustomerServiceGuidelineAction[];
  priority: number;
  criticality: CustomerServiceGuidelineCriticality;
  tags: string[];
  relationships: CustomerServiceGuidelineRelationships;
  evidenceRefs: string[];
};
