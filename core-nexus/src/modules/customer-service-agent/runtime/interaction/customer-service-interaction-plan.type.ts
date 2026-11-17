import type { CustomerServiceNamedOfferingReferentV1 } from '../understanding/types/customer-service-message-understanding.type';

export const CUSTOMER_SERVICE_INTERACTION_TYPES = [
  'SOCIAL_GREETING',
  'CASUAL_CHAT',
  'POSITIVE_SHARING',
  'NEGATIVE_DISCLOSURE',
  'LIGHT_HUMOR',
  'PERSONAL_CURIOSITY',
  'ROLE_CONFIRMATION',
  'NAME_QUERY',
  'AI_IDENTITY_QUERY',
  'SERVICE_SCOPE_QUERY',
  'PRODUCT_DISCOVERY',
  'PRODUCT_DISCOVERY_NO_GROUNDING',
  'PRODUCT_FACT_QUERY',
  'LOGISTICS_STATUS',
  'LOGISTICS_DELAY',
  'AFTER_SALES',
  'REFUND_REQUEST',
  'COMPLAINT',
  'SECURITY_SENSITIVE',
  'TOPIC_SHIFT',
  'RETURN_TO_BUSINESS',
  'HANDOFF',
  'GENERAL_SERVICE',
  'UNCLASSIFIED',
] as const;
export type CustomerServiceInteractionType = (typeof CUSTOMER_SERVICE_INTERACTION_TYPES)[number];

export const CUSTOMER_SERVICE_ACT_TYPES = [
  'PRESENCE_ACK',
  'LIGHT_ACK',
  'EMOTIONAL_ACK',
  'REASSURE',
  'LIGHT_HUMOR',
  'HISTORY_REFERENCE',
  'RELATIONSHIP_MAINTENANCE',
  'NATURAL_CLOSE',
  'STOP',
  'CONFIRM_ROLE',
  'DISCLOSE_PUBLIC_IDENTITY',
  'DISCLOSE_AI_IDENTITY',
  'DISCLOSE_NAME',
  'EXPLAIN_SERVICE_SCOPE',
  'OPEN_SERVICE_INVITATION',
  'DIRECT_ANSWER',
  'REQUEST_REQUIRED_SLOT',
  'REQUEST_OPTIONAL_PREFERENCE',
  'CLARIFY_AMBIGUITY',
  'RESTATEMENT',
  'ACKNOWLEDGE_PREFERENCE',
  'PROVIDE_GENERAL_GUIDANCE',
  'RECOMMEND_GROUNDED_ITEM',
  'EXPLAIN_GROUNDED_FACT',
  'BUSINESS_ADVANCE',
  'SALES_CTA',
  'ACKNOWLEDGE_PROBLEM',
  'REPORT_STATUS',
  'EXECUTE_SERVICE_STEP',
  'REQUEST_HANDOFF',
  'EXPLAIN_BOUNDARY',
] as const;
export type CustomerServiceActType = (typeof CUSTOMER_SERVICE_ACT_TYPES)[number];

export type CustomerServicePolicySourceKind =
  | 'PLANNER'
  | 'UNDERSTANDING'
  | 'STATE'
  | 'BEHAVIOR_MEMORY'
  | 'RESPONSE_ASSET'
  | 'ROLE_PROFILE'
  | 'LEGACY_POLICY'
  | 'GUIDELINE';

export type CustomerServicePolicySourceRef = {
  kind: CustomerServicePolicySourceKind;
  refId?: string;
  version?: string;
};

export type CustomerServiceGroundingSource =
  | 'STATE'
  | 'KNOWLEDGE'
  | 'RUNTIME_VARIABLE'
  | 'EXECUTION_RECEIPT'
  | 'RESPONSE_ASSET';

export type CustomerServiceGroundingRequirement = {
  source: CustomerServiceGroundingSource;
  key: string;
  requirement: 'REQUIRED' | 'OPTIONAL';
  status: 'SATISFIED' | 'MISSING' | 'UNKNOWN' | 'STALE' | 'CONFLICTED';
  evidenceRefs: string[];
};

export const CUSTOMER_SERVICE_ANSWER_FOCUS_KINDS = [
  'OVERVIEW',
  'APPLICATION_USAGE',
  'HOW_TO',
  'WHY_REASON',
  'COMPARISON',
  'LIMITATION_BOUNDARY',
  'COMPATIBILITY',
  'PRICE_COST',
  'AVAILABILITY',
  'STATUS_PROGRESS',
  'RECOMMENDATION',
  'TROUBLESHOOTING',
  'PRODUCT_CAPABILITIES',
  'CONVERSATIONAL_CLOSURE',
  'CURRENT_SPECIFIC_QUESTION',
] as const;
export type CustomerServiceAnswerFocusKind = (typeof CUSTOMER_SERVICE_ANSWER_FOCUS_KINDS)[number];

export type CustomerServiceResponseTargetV1 = {
  schemaVersion: 1;
  authority: 'CANONICAL_RESPONSE_TARGET';
  focus: CustomerServiceAnswerFocusKind;
  requestedSpecificity: 'MINIMAL' | 'SUMMARY' | 'DIRECTION' | 'CONCRETE' | 'DETAIL' | 'EXHAUSTIVE';
  unresolvedNeed: string | null;
  priorCoverage: 'NONE' | 'SAME_FOCUS_PARTIAL' | 'DIFFERENT_FOCUS' | 'CORRECTION';
  requiredDelta: 'NONE' | 'NEW_FACET' | 'MORE_SPECIFIC' | 'MORE_DETAIL' | 'DIFFERENT_APPROACH' | 'CORRECT' | 'COMPLETE_CURRENT_FOCUS';
  knowledgeRequirement: 'NOT_REQUIRED' | 'GENERAL_CONTEXT_ALLOWED' | 'BUSINESS_FACT_GROUNDING_REQUIRED';
  namedOfferingReferent: CustomerServiceNamedOfferingReferentV1;
  source: 'UNDERSTANDING' | 'STATE' | 'SEMANTIC_SIGNAL' | 'COMPATIBILITY_FALLBACK';
  confidence: number;
  evidence: string[];
};

export type CustomerServiceAnswerObligationV1 = {
  schemaVersion: 1;
  authority: 'CANONICAL_RESPONSE_OBLIGATION';
  continuity: 'NEW_NEED' | 'FOLLOW_UP_NEW_FACET' | 'FOLLOW_UP_REFINEMENT' | 'CONTINUATION' | 'CORRECTION';
  currentFocus: CustomerServiceAnswerFocusKind;
  currentFocusLabel: string;
  previousFocus: CustomerServiceAnswerFocusKind | null;
  previousAssistantExcerpt: string | null;
  mustAddNewInformation: boolean;
  avoidRepeat: boolean;
  evidenceState: 'NOT_REQUIRED' | 'GROUNDED_KNOWLEDGE' | 'CONTEXT_ONLY';
  unknownStrategy: 'NOT_APPLICABLE' | 'ANSWER_AVAILABLE_CONTEXT_ONLY' | 'ANSWER_KNOWN_THEN_BOUNDARY';
  responseTarget: CustomerServiceResponseTargetV1;
  evidence: string[];
};

export type CustomerServiceCompletionCondition = {
  type:
    | 'REQUIRED_ACTS_SATISFIED'
    | 'WAITING_REQUIRED_SLOT'
    | 'WAITING_CUSTOMER_RESPONSE'
    | 'EXTERNAL_ACTION_PENDING'
    | 'HANDOFF_REQUIRED'
    | 'NO_FURTHER_ACTS';
  ref?: string;
};


export const CUSTOMER_SERVICE_EXPECTED_INFORMATION_GAINS = [
  'NONE',
  'CONFIRM',
  'REDUCE_UNCERTAINTY',
  'ADD_GENERAL_GUIDANCE',
  'ADD_GROUNDED_INFORMATION',
  'ADVANCE_REQUIRED_TASK',
  'ANSWER_CURRENT_FOCUS',
] as const;
export type CustomerServiceExpectedInformationGain = (typeof CUSTOMER_SERVICE_EXPECTED_INFORMATION_GAINS)[number];

export type CustomerServiceActParameters = {
  target?: string;
  decisionPurpose?: string;
  known?: string[];
  missing?: string[];
  /**
   * R3-A semantic-value contract. Describes the value this act is expected to add,
   * not how the sentence should be worded and not a new behavior authority.
   */
  expectedInformationGain?: CustomerServiceExpectedInformationGain;
};

export type CustomerServicePlannedAct = {
  id: string;
  type: CustomerServiceActType;
  necessity: 'REQUIRED' | 'PREFERRED' | 'OPTIONAL';
  priority: number;
  grounding?: CustomerServiceGroundingRequirement[];
  parameters?: CustomerServiceActParameters;
  trackingKey?: string;
  dependsOnActIds?: string[];
  sources: CustomerServicePolicySourceRef[];
  reasonCode: string;
};

export type CustomerServiceSuppressedAct = {
  type: CustomerServiceActType;
  enforcement: 'HARD' | 'SOFT';
  priority: number;
  reasonCode: string;
  sources: CustomerServicePolicySourceRef[];
};

export type CustomerServiceInteractionPlanV2 = {
  schemaVersion: 2;
  /** @deprecated Execution visibility is controlled by CustomerServiceInteractionExecutionEnvelope. */
  shadow?: true;
  /** @deprecated Describes migration provenance only; execution lane is separate from plan semantics. */
  policyMode?: 'LEGACY_SHADOW' | 'GUIDELINE_SHADOW';
  interactionType: CustomerServiceInteractionType;
  goal: {
    primary: string;
    secondary: string[];
  };
  acts: CustomerServicePlannedAct[];
  suppressedActs: CustomerServiceSuppressedAct[];
  grounding: {
    requirements: CustomerServiceGroundingRequirement[];
    prohibitedUnknownFacts: string[];
  };
  completion: {
    mode: 'STOP_AFTER_REQUIRED' | 'WAIT_CUSTOMER' | 'ALLOW_CONTINUATION' | 'HANDOFF';
    conditions: CustomerServiceCompletionCondition[];
    allowOptionalContinuation: boolean;
  };
  answerObligation?: CustomerServiceAnswerObligationV1;
  behaviorContext: {
    relationshipStage: string | null;
    recentMoveKeys: string[];
    requestedDeltas: string[];
    activeTaskKey: string | null;
  };
  realizationPreferences: {
    density: 'AUTO' | 'SHORT' | 'NORMAL' | 'RICH';
    toneProfile: string | null;
    colloquiality: 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH';
    segmentation: 'AUTO' | 'SINGLE' | 'SEQUENTIAL';
    emoji: 'AUTO' | 'NONE' | 'LIGHT' | 'NATURAL';
  };
  sources: CustomerServicePolicySourceRef[];
  diagnostics: {
    legacyMappings: Array<{
      source: 'RESPONSE_ACT' | 'ASSISTANT_MOVE' | 'MICRO_ACTION';
      legacy: string;
      canonical: CustomerServiceActType | null;
      status: 'MAPPED' | 'NO_CANONICAL_MAPPING';
    }>;
    unmappedLegacyActs: string[];
    /**
     * V1.45 authority convergence: legacy Response/MicroAction values remain migration evidence only; HumanBehavior ExpressionPlan is retired from production compilation.
     * They remain observable for parity/debugging but cannot directly grant REQUIRED/OPTIONAL,
     * suppress Acts, or control completion in the final Canonical Plan.
     */
    legacyAuthority?: {
      mode: 'MIGRATION_HINT_ONLY';
      demotedResponseActs: string[];
      demotedRequired: string[];
      demotedOptional: string[];
      demotedForbidden: string[];
      demotedMicroActions: string[];
    };
    guidelinePolicy?: {
      resolutionHash: string;
      guidelineVersionIds: string[];
      appliedDecisionCount: number;
      conflictCount: number;
      hasUnresolvedHardConflict: boolean;
    };
    guidelineSkippedDecisions?: Array<{ guidelineId: string; op: string; act?: CustomerServiceActType; reasonCode: string }>;
    roleTurnPolicy?: {
      schemaVersion: 1;
      authority: 'CANONICAL_DISCRETIONARY_ACT_POLICY';
      roleSource: 'EXPLICIT_ROLE_PROFILE' | 'COMPILED_ROLE_CONTEXT' | 'NEUTRAL_COMPATIBILITY';
      maneuver:
        | 'FOLLOW_REQUIRED_TASK'
        | 'GUIDE_THEN_OPTIONAL_CLARIFY'
        | 'PROVIDE_DIRECTION_AND_HOLD'
        | 'ACKNOWLEDGE_AND_HOLD'
        | 'OPTIONAL_CLARIFY'
        | 'FOLLOW_CANONICAL_PLAN';
      previousAssistantAskedQuestion: boolean;
      customerSuppliedPreference: boolean;
      questionStyle: 'MINIMAL' | 'DECISION_FOCUSED' | 'EXPLORATORY';
      adviceStyle: 'RESTRAINED' | 'BALANCED' | 'ASSERTIVE';
      proactivity: 'RESTRAINED' | 'BALANCED' | 'PROACTIVE';
      clarificationInitiative: 'REQUIRED_ONLY' | 'DECISION_RELEVANT' | 'EXPLORATORY';
      guidanceInitiative: 'REQUESTED_ONLY' | 'CONTEXTUAL' | 'PROACTIVE_WHEN_USEFUL';
      removedActTypes: CustomerServiceActType[];
      addedActTypes: CustomerServiceActType[];
    };
  };
};

export type CustomerServiceInteractionPlanShadowSnapshot = {
  schemaVersion: 2;
  shadow: true;
  interactionType: CustomerServiceInteractionType;
  requiredActs: CustomerServiceActType[];
  preferredActs: CustomerServiceActType[];
  optionalActs: CustomerServiceActType[];
  suppressedActs: Array<{ type: CustomerServiceActType; enforcement: 'HARD' | 'SOFT' }>;
  completionMode: CustomerServiceInteractionPlanV2['completion']['mode'];
  /** Canonical prior-turn target carried for continuity. Optional for legacy snapshots. */
  answerFocus?: CustomerServiceAnswerFocusKind | null;
  requestedSpecificity?: CustomerServiceResponseTargetV1['requestedSpecificity'] | null;
  requiredDelta?: CustomerServiceResponseTargetV1['requiredDelta'] | null;
  trackingKeys: string[];
};
