export type CustomerServiceSemanticConformanceDecision =
  | 'PASS'
  | 'REMOVED_UNAUTHORIZED_SPANS'
  | 'UNPROVEN_PRESERVED'
  | 'NOT_RUN';

export type CustomerServiceSemanticConformanceObservedDecision =
  | 'CLASSIFIED'
  | 'PASS'
  | 'REMOVE_UNAUTHORIZED_SPANS'
  | 'REJECT'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'LOCAL_PROTOCOL_ERROR'
  | null;

export type CustomerServiceSemanticConformanceViolationCode =
  | 'UNAUTHORIZED_SEMANTIC_CONTRIBUTION'
  | 'DECLARED_ACT_MISMATCH'
  | 'UNAUTHORIZED_RECEPTION_CONTRIBUTION'
  | 'UNAUTHORIZED_RELATIONSHIP_CONTRIBUTION'
  | 'UNAUTHORIZED_QUESTION_OR_SERVICE_ENTRY'
  | 'GROUNDED_EVIDENCE_NOT_REALIZED'
  | 'GROUNDED_EVIDENCE_UNSUPPORTED'
  | 'REQUIRED_ACT_NOT_REALIZED'
  | 'CONFORMANCE_PROTOCOL_ERROR';

export type CustomerServiceSemanticContributionKind =
  | 'ANSWER_CONTENT'
  | 'ANSWER_JUDGMENT'
  | 'GUIDANCE_CONTENT'
  | 'GROUNDED_CONTENT'
  | 'STATUS_OR_EXECUTION_CONTENT'
  | 'IDENTITY_OR_SCOPE_CONTENT'
  | 'BOUNDARY_CONTENT'
  | 'RESTATEMENT_CONTENT'
  | 'HISTORY_REFERENCE_CONTENT'
  | 'RECEPTION_ACK'
  | 'REASSURANCE'
  | 'SOCIAL_NORMALIZATION'
  | 'RELATIONSHIP_CONTENT'
  | 'QUESTION_OR_SERVICE_ENTRY'
  | 'BUSINESS_ADVANCE_OR_CTA'
  | 'HUMOR'
  | 'CLOSE_ACK'
  | 'CLOSE_WARMTH'
  | 'MIXED_OR_UNCERTAIN'
  | 'NON_PROPOSITIONAL_FRAGMENT'
  | 'OTHER_PROPOSITION';

export type CustomerServiceSemanticTarget =
  | 'CUSTOMER_AFFECT_OR_STANCE'
  | 'CUSTOMER_EFFORT_OR_SELF_EVALUATION'
  | 'CUSTOMER_SITUATION_FACT'
  | 'TASK_OR_DOMAIN_FACT'
  | 'ACTION_OPTION_RISK_OR_OUTCOME'
  | 'MERCHANT_ENTITY_OR_POLICY'
  | 'RELATIONSHIP_OR_CONVERSATION'
  | 'OTHER';

export type CustomerServiceSemanticTaskDependency =
  | 'MATERIAL_TO_CUSTOMER_TASK'
  | 'SUPPORTS_CUSTOMER_TASK'
  | 'INDEPENDENT_OF_CUSTOMER_TASK'
  | 'CLOSURE_ONLY';

export type CustomerServiceGroundingEntailment =
  | 'NOT_APPLICABLE'
  | 'FULLY_SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNSUPPORTED';

export type CustomerServiceEvidenceRequirement =
  | 'NOT_REQUIRED'
  | 'MERCHANT_ENTITY_EVIDENCE_BOUNDARY'
  | 'MERCHANT_ENTITY_EVIDENCE_REQUIRED';

export type CustomerServiceGroundedActionRole =
  | 'NOT_APPLICABLE'
  | 'CHOICE_OR_RECOMMENDATION'
  | 'SUITABILITY_OR_DECISION_SUPPORT'
  | 'PERFORMANCE_OR_EXPERIENCE'
  | 'RISK_OR_OTHER_OUTCOME';

export type CustomerServiceGroundingBasis =
  | 'NOT_APPLICABLE'
  | 'DIRECT_SOURCE'
  | 'SUPPORTED_CHOICE_SYNTHESIS'
  | 'PARTIAL_SOURCE_PLUS_INFERENCE'
  | 'INFERRED_OR_UNSUPPORTED';

export type CustomerServiceGroundingSupportWitnessV1 = {
  ref: string;
  /** Exact source-owned excerpts returned by the blind classifier; Runtime verifies ownership. */
  excerpts: string[];
};

export type CustomerServiceSemanticConformanceRemovalV1 = {
  segmentIndex: number;
  unitIndex: number;
  /** Runtime-owned immutable atom id. */
  atomId?: string;
  exactText: string;
  occurrence: number;
  code: CustomerServiceSemanticConformanceViolationCode;
};

export type CustomerServiceSemanticConformanceViolationV1 = {
  code: CustomerServiceSemanticConformanceViolationCode;
  segmentIndex: number | null;
  unitIndex: number | null;
  reason: string;
};

export type CustomerServiceSemanticConformanceSpanCheckV1 = {
  /** Runtime-owned immutable atom id. The classifier may classify but never define its range. */
  atomId?: string;
  /** Exact contiguous text sliced by Runtime from the original HVE_REPLY_V2 unit. */
  exactText: string;
  contributionKind: CustomerServiceSemanticContributionKind;
  semanticTarget?: CustomerServiceSemanticTarget;
  taskDependency?: CustomerServiceSemanticTaskDependency;
  /** Diagnostic-only normalized classifier output before Runtime grounding-precedence projection. */
  classifierResult?: {
    /** Runtime parse error for this atom only; never an authorization signal. */
    witnessProtocolError?: string;
    contributionKind: CustomerServiceSemanticContributionKind;
    semanticTarget: CustomerServiceSemanticTarget;
    taskDependency: CustomerServiceSemanticTaskDependency;
    evidenceRequirement: CustomerServiceEvidenceRequirement;
    /** Merchant/entity refs this classifier span semantically refers to; diagnostic-only, never authorization. */
    merchantReferentRefs: string[];
    groundingEntailment: CustomerServiceGroundingEntailment;
    groundedActionRole: CustomerServiceGroundedActionRole;
    groundingBasis: CustomerServiceGroundingBasis;
    groundingSupport: CustomerServiceGroundingSupportWitnessV1[];
    realizedGroundingRefs: string[];
    /**
     * Classifier-owned semantic continuation group for fail-safe partial recovery only.
     * Adjacent spans in the same group must survive/drop together; this never creates
     * Acts, facts, Grounding, completion, or Send Authority. Missing means legacy
     * conservative recovery topology.
     */
    continuationGroup?: number;
  };
  authorized: boolean;
  authorizationChecks?: {
    actTypeCompatible: boolean;
    semanticTargetCompatible: boolean;
    taskDependencyCompatible: boolean;
    groundingCompatible: boolean;
  };
  realizedActIds: string[];
  realizedGroundingRefs: string[];
  independentFromBoundActs: boolean;
  violationCode: CustomerServiceSemanticConformanceViolationCode | null;
};

export type CustomerServiceSemanticConformanceUnitGroundedActionV1 = {
  groundedActionRole: 'CHOICE_OR_RECOMMENDATION';
  taskDependency: 'MATERIAL_TO_CUSTOMER_TASK';
  /** Runtime-owned span ids that the same semantic classifier grouped into this independent choice/recommendation. */
  spanAtomIds: string[];
  realizedGroundingRefs: string[];
  /** Every declared ref appears in one of this action group's classifier spans and in an existing unit-local recommendation binding. */
  refScopeOwned: boolean;
  /** Runtime proof that every unit-level action ref is realized by an authorized Grounded span in the same unit. */
  evidenceOwned: boolean;
  /** Runtime-mapped Canonical Grounded Acts; the classifier never sees Act ids. */
  realizedActIds: string[];
};

export type CustomerServiceSemanticConformanceUnitCheckV1 = {
  segmentIndex: number;
  unitIndex: number;
  /** Diagnostic-only copy of the actual HVE semantic-unit bindings seen by Conformance. */
  semanticUnitBindings?: Array<{
    actId: string;
    actType: string;
    groundingRefs: string[];
  }>;
  /** Discourse-level grounded action classification from the same single semantic model call. */
  unitGroundedActions?: CustomerServiceSemanticConformanceUnitGroundedActionV1[];
  authorized: boolean;
  realizedActIds: string[];
  realizedGroundingRefs: string[];
  /** Ordered Runtime-owned Surface Atom evidence over the ORIGINAL unit text. */
  semanticSpans: CustomerServiceSemanticConformanceSpanCheckV1[];
};

export type CustomerServiceSemanticConformanceTraceV1 = {
  schemaVersion: 1;
  authority: 'CANONICAL_SEMANTIC_CONFORMANCE_V1';
  scope: 'SEMANTIC_AUTHORIZATION_ONLY';
  functionClassificationAuthority:
    | 'MODEL_BLIND_SEMANTIC_FUNCTION_CLASSIFICATION_V1'
    | 'MODEL_BLIND_MULTI_AXIS_SEMANTIC_CLASSIFICATION_V2'
    | 'MODEL_BLIND_OFFSET_MULTI_AXIS_SEMANTIC_CLASSIFICATION_V3'
    | 'MODEL_BLIND_RUNTIME_ATOM_MULTI_AXIS_CLASSIFICATION_V4'
    | 'MODEL_BLIND_RUNTIME_ATOM_MULTI_AXIS_ENTAILMENT_CLASSIFICATION_V5'
    | 'MODEL_BLIND_RUNTIME_ATOM_EVIDENCE_WITNESS_CLASSIFICATION_V6'
    | 'MODEL_BLIND_RUNTIME_ATOM_PROPOSITION_EVIDENCE_REQUIREMENT_V7'
    | 'MODEL_BLIND_RUNTIME_ATOM_EPISTEMIC_EVIDENCE_BOUNDARY_V8'
    | 'MODEL_SINGLE_SEMANTIC_SPAN_AUTHORITY_V9'
    | 'MODEL_SINGLE_SEMANTIC_SPAN_AND_UNIT_ACTION_AUTHORITY_V10'
    | 'MODEL_SINGLE_SEMANTIC_SPAN_AND_ACTION_GROUP_AUTHORITY_V11'
    | 'MODEL_SINGLE_SEMANTIC_SPAN_ACTION_GROUP_AND_REFERENT_AUTHORITY_V12';
  authorizationAuthority:
    | 'RUNTIME_CONTRIBUTION_KIND_BINDING_MATRIX_V1'
    | 'RUNTIME_MULTI_AXIS_BINDING_MATRIX_V2'
    | 'RUNTIME_MULTI_AXIS_BINDING_MATRIX_V3'
    | 'RUNTIME_SURFACE_ATOM_BINDING_MATRIX_V4'
    | 'RUNTIME_SURFACE_ATOM_ENTAILMENT_BINDING_MATRIX_V5'
    | 'RUNTIME_SURFACE_ATOM_EVIDENCE_WITNESS_BINDING_MATRIX_V6'
    | 'RUNTIME_SURFACE_ATOM_PROPOSITION_EVIDENCE_BINDING_MATRIX_V7'
    | 'RUNTIME_SURFACE_ATOM_EPISTEMIC_EVIDENCE_BINDING_MATRIX_V8'
    | 'RUNTIME_VALIDATED_SEMANTIC_SPAN_BINDING_MATRIX_V9'
    | 'RUNTIME_VALIDATED_SEMANTIC_SPAN_AND_UNIT_ACTION_BINDING_MATRIX_V10'
    | 'RUNTIME_VALIDATED_SEMANTIC_SPAN_AND_ACTION_GROUP_BINDING_MATRIX_V11'
    | 'RUNTIME_VALIDATED_SEMANTIC_SPAN_ACTION_GROUP_REFERENT_MATRIX_V12';
  classificationIsolation: {
    canonicalActsVisible: false;
    actIdsVisible: false;
    hveBindingsVisible: false;
    completionPolicyVisible: false;
    roleBehaviorDiagnosticsVisible: false;
    availableGroundingEvidenceVisible: true;
    groundingEvidenceCreatesAuthorization: false;
  };
  decision: CustomerServiceSemanticConformanceDecision;
  observedDecision: CustomerServiceSemanticConformanceObservedDecision;
  sendEligibilityEffect: 'NONE';
  modelCallCount: 0 | 1;
  elapsedMs: number;
  requestedModel: string | null;
  actualModel: string | null;
  requestId: string | null;
  originalTextLength: number;
  finalTextLength: number;
  removals: CustomerServiceSemanticConformanceRemovalV1[];
  unitChecks: CustomerServiceSemanticConformanceUnitCheckV1[];
  violations: CustomerServiceSemanticConformanceViolationV1[];
  errorMessage: string | null;
  /**
   * Typed post-correction completion result. This is completion/continuity evidence only:
   * it cannot create Acts, facts, Grounding, or authorize a removed proposition.
   */
  requiredValueCompletion?: {
    status: 'PARTIAL_SAFE_CONTINUATION' | 'UNSATISFIED';
    missingRequiredActIds: string[];
  };
  authorityEffects: {
    canCreateActs: false;
    canCreateFacts: false;
    canCreateGrounding: false;
    canImproveStyle: false;
    canRetry: false;
    canVetoNonEmptyGeneration: false;
    correctionMode: 'EXACT_SUBSTRING_REMOVAL_ONLY' | 'RUNTIME_ATOM_REMOVAL_ONLY' | 'RUNTIME_VALIDATED_SPAN_REMOVAL_ONLY';
  };
};
