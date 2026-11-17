export type CustomerServiceClassificationSource = 'MANUAL' | 'HEURISTIC' | 'MODEL_ASSISTED';

export type CustomerServiceTopic = {
  scenario: string;
  intent: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priority: number;
  confidence: number;
  evidence: string[];
};

export type CustomerServiceRecognitionItemType = 'INTENT' | 'EVENT' | 'STATE' | 'SIGNAL';
export type CustomerServiceRecognitionMatchStatus = 'EXACT' | 'RELATED' | 'UNMATCHED';
export type CustomerServiceRecognitionScope = 'CONVERSATION' | 'TURN';
export type CustomerServiceRecognitionContinuity = 'NEW' | 'CONTINUING' | 'SHIFTED' | 'RESOLVED';

export type CustomerServiceIntentRole = 'PRIMARY' | 'SECONDARY' | 'LATENT';
export type CustomerServiceIntentHypothesis = {
  key: string;
  name: string;
  scenario: string;
  intent: string;
  role: CustomerServiceIntentRole;
  scope: CustomerServiceRecognitionScope;
  continuity: CustomerServiceRecognitionContinuity;
  confidence: number;
  priority: number;
  evidence: string[];
  reason: string;
  actionable: boolean;
};

export type CustomerServiceRequestedContributionKind =
  | 'INFORMATION'
  | 'DECISION_SUPPORT'
  | 'ACTION'
  | 'ADVICE'
  | 'OTHER';

export type CustomerServiceRequestedEvidenceScope =
  | 'MERCHANT_BUSINESS'
  | 'GENERAL_DOMAIN'
  | 'NOT_APPLICABLE';

export type CustomerServiceRequestedDecisionMode =
  | 'ASSESS_CURRENT_OPTION'
  | 'SELECT_OR_PRIORITIZE_OPTION'
  | 'NOT_APPLICABLE';

/**
 * Open-language answer facet owned by the same Deep Recognition semantic envelope.
 * Downstream consumers must not reconstruct this axis from raw wording when a valid
 * model-assisted goal is available.
 */
export type CustomerServiceRequestedAnswerFocus =
  | 'OVERVIEW'
  | 'APPLICATION_USAGE'
  | 'HOW_TO'
  | 'WHY_REASON'
  | 'COMPARISON'
  | 'LIMITATION_BOUNDARY'
  | 'COMPATIBILITY'
  | 'PRICE_COST'
  | 'AVAILABILITY'
  | 'STATUS_PROGRESS'
  | 'RECOMMENDATION'
  | 'TROUBLESHOOTING'
  | 'PRODUCT_CAPABILITIES'
  | 'CURRENT_SPECIFIC_QUESTION'
  | 'AI_IDENTITY'
  | 'PUBLIC_NAME'
  | 'SERVICE_ROLE'
  | 'SERVICE_SCOPE'
  | 'NOT_APPLICABLE';

export type CustomerServiceRequestedSpecificity =
  | 'MINIMAL'
  | 'SUMMARY'
  | 'DIRECTION'
  | 'CONCRETE'
  | 'DETAIL'
  | 'EXHAUSTIVE'
  | 'NOT_APPLICABLE';

export type CustomerServiceTurnGoalKey =
  | 'INVITE_POSITIVE_SHARING'
  | 'INVITE_EMOTIONAL_SHARING'
  | 'PROVIDE_EMOTIONAL_COMFORT'
  | 'LISTEN_TO_VENTING'
  | 'PROVIDE_REQUESTED_ADVICE'
  | 'RESPECT_EMOTIONAL_SPACE'
  | 'RESPOND_TO_SHARED_CONTEXT'
  | 'PROCESS_PROVIDED_INFORMATION'
  | 'HANDLE_INFORMATION_BARRIER'
  | 'ANSWER_INFORMATION'
  | 'SUMMARIZE_CONVERSATION'
  | 'EXECUTE_REQUEST'
  | 'RESOLVE_CURRENT_PROBLEM'
  | 'REPAIR_TRUST'
  | 'CLARIFY_NEED'
  | 'EXPLORE_PRODUCT_NEED'
  | 'SUPPORT_PURCHASE_DECISION'
  | 'CONFIRM_TRANSACTION'
  | 'DISCOVER_LIFE_CONTEXT'
  | 'MAINTAIN_RELATIONSHIP'
  | 'CLOSE_CONVERSATION';
export type CustomerServiceTurnGoal = {
  key: CustomerServiceTurnGoalKey;
  /** Typed semantic function requested from the assistant; never reconstructed from raw wording downstream. */
  requestedContributionKind?: CustomerServiceRequestedContributionKind;
  /** Typed evidence ownership for the requested contribution; lexical fallback cannot override a valid model value. */
  requestedEvidenceScope?: CustomerServiceRequestedEvidenceScope;
  /** For DECISION_SUPPORT only: distinguish assessment of the current option from selecting/prioritizing an option. */
  requestedDecisionMode?: CustomerServiceRequestedDecisionMode;
  /** Semantic answer facet; owned by Deep Recognition, never re-parsed from raw wording downstream. */
  requestedAnswerFocus?: CustomerServiceRequestedAnswerFocus;
  /** Requested response specificity; owned by Deep Recognition when the turn expresses one. */
  requestedSpecificity?: CustomerServiceRequestedSpecificity;
  name: string;
  priority: number;
  confidence: number;
  evidence: string[];
  reason: string;
  responseRequirement: string;
  source: 'EXPLICIT' | 'CONTEXT' | 'STATE' | 'SIGNAL' | 'MODEL';
  deferred: boolean;
};

export type CustomerServiceResponseAct =
  | 'DIRECT_WARM_CONTACT'
  | 'SPECIFIC_CONTEXT_ACKNOWLEDGEMENT'
  | 'OPTIONAL_SMALL_RELIEF'
  | 'DIRECT_ANSWER'
  | 'PRACTICAL_NEXT_STEP'
  | 'LISTENING_SPACE'
  | 'RESPECT_BOUNDARY'
  | 'LOW_PRESSURE_CONTINUATION';

export type CustomerServiceRecognizedItem = {
  recognitionId: string;
  type: CustomerServiceRecognitionItemType;
  key: string;
  name: string;
  description: string;
  confidence: number;
  evidence: string[];
  isPrimary: boolean;
  scope: CustomerServiceRecognitionScope;
  continuity: CustomerServiceRecognitionContinuity;
  eligibleForIntentLibrary: boolean;
  suggestedCategory: string;
  suggestedScenario: string;
  suggestedPrimaryIntent: string;
  suggestedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  matchedDefinition: {
    id: string;
    key: string;
    name: string;
    category: string;
    scenario: string;
    primaryIntent: string;
  } | null;
  matchStatus: CustomerServiceRecognitionMatchStatus;
  matchScore: number;
  matchReason: string;
  candidate: {
    id: string;
    status: 'PENDING' | 'CONVERTED' | 'IGNORED';
    occurrenceCount: number;
    averageConfidence: number;
    convertedDefinitionId: string | null;
  } | null;
};

export type CustomerServiceRecognitionModelMeta = {
  attempted: boolean;
  status: 'NOT_REQUESTED' | 'FAST_PATH' | 'SUCCESS' | 'MODEL_NOT_CONFIGURED' | 'MODEL_ERROR' | 'INVALID_RESPONSE';
  model: string | null;
  requestId: string | null;
  elapsedMs: number;
  errorMessage: string | null;
  repairAttempted?: boolean;
  repairSucceeded?: boolean;
  repairRequestId?: string | null;
  parseError?: string | null;
  repairParseError?: string | null;
  finishReason?: string | null;
  responseLength?: number;
  rawResponsePreview?: string | null;
  repairResponsePreview?: string | null;
  recoveryMode?: 'LOCAL_REPAIR' | 'MODEL_REGENERATION' | null;
  fastPathReason?: string | null;
};


export type CustomerServicePendingSlotKey =
  | 'ORDER_ID'
  | 'TRACKING_NUMBER'
  | 'PHONE'
  | 'ADDRESS'
  | 'PRODUCT_MODEL'
  | 'ISSUE_EVIDENCE'
  | 'ORIGINAL_APPOINTMENT_TIME'
  | 'APPOINTMENT_ID';

export type CustomerServicePendingSlot = {
  key: CustomerServicePendingSlotKey;
  name: string;
  status: 'REQUESTED' | 'PROVIDED' | 'MISSING' | 'CONFIRMED';
  value: string | null;
  confidence: number;
  requestedByAssistant: string | null;
  evidence: string[];
};

export type CustomerServiceSemanticQuestionState = {
  key: 'EMOTION_CAUSE' | 'SERVICE_DETAIL' | 'OTHER';
  name: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED_UNAVAILABLE' | 'CLOSED_REFUSED';
  askedByAssistant: string;
  answer: string | null;
  reopenAllowed: boolean;
  evidence: string[];
};


export type CustomerServiceInternalHandlingState = {
  required: boolean;
  status: 'NONE' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  scenario: string | null;
  reason: string | null;
  customerVisibleDisclosure: 'HIDDEN';
};

export type CustomerServiceSuspendedTask = {
  scenario: string;
  intent: string;
  status: 'PAUSED' | 'PENDING_INTERNAL';
  reason: string;
};

export type CustomerServiceConversationTaskState = {
  currentTurnRelation: 'NEW_REQUEST' | 'ANSWER_TO_ASSISTANT_REQUEST' | 'INFORMATION_BARRIER' | 'CONTINUATION' | 'TOPIC_SHIFT' | 'RESOLUTION';
  activeScenario: string;
  activeIntent: string;
  status: 'NONE' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'INTERNAL_PROCESSING' | 'READY_TO_ADVANCE' | 'RESOLVED';
  lastAssistantRequest: string | null;
  pendingSlots: CustomerServicePendingSlot[];
  providedSlots: CustomerServicePendingSlot[];
  unresolvedGoals: string[];
  suspendedTasks: CustomerServiceSuspendedTask[];
  internalHandling: CustomerServiceInternalHandlingState;
  evidence: string[];
  responsibility: 'NONE' | 'CUSTOMER' | 'INTERNAL' | 'SHARED';
  semanticQuestions: CustomerServiceSemanticQuestionState[];
  requestResponseType?: 'NONE' | 'PROVIDED' | 'UNAVAILABLE' | 'REFUSED' | 'ALTERNATIVE_REQUEST';
  activeTaskId?: string | null;
  longHorizonStatus?: 'ACTIVE' | 'SUSPENDED' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'RESOLVED' | 'ABANDONED' | 'REOPENED';
};

export type CustomerServiceAssistantMove =
  | 'ACKNOWLEDGE'
  | 'INVITE_SHARING'
  | 'GENERIC_EMPATHY'
  | 'ANALYZE'
  | 'ADVISE'
  | 'ASK_QUESTION'
  | 'OFFER_OPTIONS'
  | 'EXPLAIN'
  | 'BUSINESS_ACTION'
  | 'UNKNOWN';

export type CustomerServiceFeedbackType =
  | 'ACCEPTED'
  | 'PARTIALLY_ACCEPTED'
  | 'INSUFFICIENT'
  | 'REJECTED'
  | 'CORRECTED'
  | 'ESCALATED'
  | 'WITHDRAWN'
  | 'UNCLEAR';

export type CustomerServiceRequestedDelta =
  | 'DEEPER'
  | 'MORE_SPECIFIC'
  | 'MORE_DETAILED'
  | 'WARMER'
  | 'LESS_WARM'
  | 'LESS_FORMAL'
  | 'MORE_DIRECT'
  | 'SHORTER'
  | 'DIFFERENT_APPROACH'
  | 'ANOTHER_OPTION'
  | 'NO_SPECIFIC_RECOMMENDATION'
  | 'HUMOR_OK'
  | 'NO_HUMOR'
  | 'NO_QUESTIONS'
  | 'NO_ADVICE'
  | 'LISTEN_ONLY'
  | 'ANSWER_PREVIOUS_QUESTION'
  | 'RETURN_TO_PREVIOUS_TOPIC'
  | 'STOP_CURRENT_TOPIC';

export type CustomerServiceFeedbackHandlingMode =
  | 'NONE'
  | 'REFINE'
  | 'CORRECT'
  | 'BOUNDARY'
  | 'WITHDRAW'
  | 'TRUST_REPAIR';

export type CustomerServiceDialogueObligation = {
  previousAssistantMove: CustomerServiceAssistantMove;
  userFeedback: CustomerServiceFeedbackType;
  feedbackHandlingMode: CustomerServiceFeedbackHandlingMode;
  acknowledgementRequired: boolean;
  requestedDeltas: CustomerServiceRequestedDelta[];
  feedbackTargetTurnNo: number | null;
  strategyChangeRequired: boolean;
  rejectedMove: CustomerServiceAssistantMove | null;
  correctionTarget: 'CONTENT' | 'TONE' | 'WORDING' | 'INTERACTION' | 'BUSINESS_ACTION' | null;
  unresolvedNeed: string | null;
  repairObligation: boolean;
  forbiddenRepeatedMoves: CustomerServiceAssistantMove[];
  acceptedConversationStyle: string[];
  currentResponseObligation: string;
  evidence: string[];
  confidence: number;
  source: 'HEURISTIC' | 'MODEL' | 'STATE' | 'EXPLICIT';
};


export type CustomerServiceStateTruthTaskRelation =
  | 'NONE'
  | 'CONTINUE_CURRENT'
  | 'START_NEW'
  | 'RESUME_EXISTING'
  | 'RESOLVE_CURRENT'
  | 'ABANDON_CURRENT';

export type CustomerServiceStateTruthMutationAction = 'NONE' | 'SUPERSEDE' | 'WITHDRAW';

export type CustomerServiceStateTruthSignal = {
  /** Semantic evidence only. The server-owned state reducer remains the sole mutation Authority. */
  authority: 'STATE_MUTATION_EVIDENCE_ONLY';
  task: {
    relation: CustomerServiceStateTruthTaskRelation;
    targetTaskId: string | null;
    evidence: string;
    confidence: number;
  };
  memory: {
    action: CustomerServiceStateTruthMutationAction;
    targetMemoryId: string | null;
    replacementValue: string | null;
    evidence: string;
    confidence: number;
  };
  entity: {
    action: CustomerServiceStateTruthMutationAction;
    targetEntityId: string | null;
    replacementValue: string | null;
    evidence: string;
    confidence: number;
  };
};

export type CustomerServiceCommercialOpenness = 'CLOSED' | 'UNKNOWN' | 'LATENT' | 'ACTIVE' | 'EXPLICIT';
export type CustomerServiceCommercialStage =
  | 'NO_COMMERCIAL_MOVE'
  | 'RELATIONSHIP_BUILDING'
  | 'CONTEXT_DISCOVERY'
  | 'NEED_EXPLORATION'
  | 'VALUE_BRIDGING'
  | 'PRODUCT_RECOMMENDATION'
  | 'DECISION_SUPPORT'
  | 'LOW_PRESSURE_CLOSE';
export type CustomerServiceProductMentionPolicy = 'PROHIBITED' | 'CATEGORY_ONLY' | 'SPECIFIC_IF_RELEVANT' | 'SPECIFIC_ALLOWED';
export type CustomerServiceCommercialStrategy = {
  stage: CustomerServiceCommercialStage;
  objective: string;
  discoveryTarget: string;
  productMentionPolicy: CustomerServiceProductMentionPolicy;
  transitionSignals: string[];
  evidence: string[];
  reason: string;
};
export type CustomerServiceRelationshipState = 'FORMAL' | 'OPEN' | 'FAMILIAR' | 'STRAINED';
export type CustomerServiceConversationStance = 'FORMAL_SERVICE' | 'FRIENDLY_SERVICE' | 'CLOSE_FRIEND_SERVICE' | 'REPAIR_SERVICE';
export type CustomerServiceMindset =
  | 'OPEN_AND_RELAXED'
  | 'TASK_FOCUSED'
  | 'CAUTIOUS'
  | 'ANXIOUS'
  | 'DISAPPOINTED'
  | 'ANGRY'
  | 'NEUTRAL';
export type CustomerServiceConversationPhase = 'OPENING' | 'SHARING' | 'SERVICE' | 'DECISION' | 'REPAIR' | 'CLOSING';
export type CustomerServiceFirstMove =
  | 'ACKNOWLEDGE_AND_INVITE_SHARING'
  | 'INVITE_SHARING'
  | 'DISCOVER_CONTEXT'
  | 'RESPOND_TO_SHARED_CONTEXT'
  | 'PROCESS_PROVIDED_INFORMATION'
  | 'HANDLE_INFORMATION_BARRIER'
  | 'CLARIFY_NEED'
  | 'SOLVE_CURRENT_ISSUE'
  | 'SUPPORT_DECISION'
  | 'REPAIR_RELATIONSHIP'
  | 'CONFIRM_OR_CLOSE';
export type CustomerServiceCommercialTiming = 'HOLD' | 'WAIT_FOR_CONTEXT' | 'EXPLORE_IF_RELEVANT' | 'ASSIST_NOW';

export type CustomerServiceSemanticMoveBudget = {
  maxCoreMoves: 1 | 2 | 3;
  allowedMoves: string[];
  forbiddenCombinations: string[];
  reason: string;
};

export type CustomerServiceEmotionalPosture =
  | 'PLAYFUL_WARM'
  | 'WARM_CURIOUS'
  | 'WARM_PROFESSIONAL'
  | 'CALM_REASSURING'
  | 'EMPATHETIC_ACCOUNTABLE'
  | 'CALM_ACCOUNTABLE'
  | 'SERIOUS_REPAIR'
  | 'CAUTIOUS_SERIOUS';

export type CustomerServiceEmotionStrategy = {
  posture: CustomerServiceEmotionalPosture;
  warmth: number;
  playfulness: number;
  validationPriority: number;
  solutionPriority: number;
  emojiPolicy: 'ALLOW_ONE' | 'NEUTRAL' | 'AVOID';
  relationshipDistance: 'FORMAL' | 'FRIENDLY' | 'FAMILIAR' | 'REPAIR';
  guidance: string[];
  forbiddenTone: string[];
  reason: string;
};

export type CustomerServiceEmotionalDisclosurePolarity = 'NONE' | 'POSITIVE' | 'NEGATIVE' | 'MIXED';
export type CustomerServiceEmotionalDisclosureMode =
  | 'NONE'
  | 'POSITIVE_SHARING'
  | 'NEGATIVE_SHARING'
  | 'VENTING'
  | 'SEEK_LISTENING'
  | 'SEEK_COMFORT'
  | 'SEEK_ADVICE'
  | 'GRIEF_OR_LOSS'
  | 'RELATIONSHIP_DISTRESS';

export type CustomerServiceEmotionalDisclosure = {
  detected: boolean;
  polarity: CustomerServiceEmotionalDisclosurePolarity;
  mode: CustomerServiceEmotionalDisclosureMode;
  confidence: number;
  adviceRequested: boolean;
  evidence: string[];
};



export type CustomerServiceReplyStrategyMode =
  | 'PLAYFUL_INVITATION'
  | 'FRIENDLIKE_REACTION'
  | 'WARM_EXPLORATION'
  | 'DIRECT_ANSWER'
  | 'PROFESSIONAL_GUIDANCE'
  | 'ACCOUNTABLE_RESOLUTION'
  | 'CALM_PROGRESS_UPDATE'
  | 'RELATIONSHIP_REPAIR'
  | 'SAFE_BOUNDARY'
  | 'NATURAL_CLOSE';

export type CustomerServiceReplyContinuation =
  | 'INVITE_SHARING'
  | 'OPEN_QUESTION'
  | 'OPEN_STATEMENT'
  | 'WAIT_FOR_CUSTOMER'
  | 'NEXT_SERVICE_STEP'
  | 'CLOSE_NATURALLY';

export type CustomerServiceReplyStrategy = {
  mode: CustomerServiceReplyStrategyMode;
  primaryMove: string;
  secondaryMoves: string[];
  continuation: CustomerServiceReplyContinuation;
  valueGoal: string;
  mustInclude: string[];
  avoid: string[];
  reason: string;
};

export type CustomerServicePrimaryMotive =
  | 'RELATIONSHIP_CONTACT'
  | 'EMOTIONAL_SHARING'
  | 'INFORMATION_SEEKING'
  | 'ACTION_REQUEST'
  | 'PURCHASE_EXPLORATION'
  | 'PURCHASE_DECISION'
  | 'PROBLEM_RESOLUTION'
  | 'RELATIONSHIP_REPAIR';

/**
 * 对客户动机和心境的结构化推断。这里保存的是“当前最合理假设”，不是业务事实。
 * 生成阶段必须把 uncertainties 当成不确定项，不能直接对客户下结论。
 */
export type CustomerServiceHumanContext = {
  primaryMotive: CustomerServicePrimaryMotive;
  secondaryMotives: CustomerServicePrimaryMotive[];
  mindset: CustomerServiceMindset;
  relationshipState: CustomerServiceRelationshipState;
  conversationStance: CustomerServiceConversationStance;
  commercialOpenness: CustomerServiceCommercialOpenness;
  commercialOpennessScore: number;
  commercialStrategy: CustomerServiceCommercialStrategy;
  statedNeeds: string[];
  inferredNeeds: string[];
  valueOpportunities: string[];
  evidence: string[];
  uncertainties: string[];
  emotionalDisclosure: CustomerServiceEmotionalDisclosure;
  emotionStrategy: CustomerServiceEmotionStrategy;
  interactionStrategy: {
    phase: CustomerServiceConversationPhase;
    firstMove: CustomerServiceFirstMove;
    commercialTiming: CustomerServiceCommercialTiming;
    reason: string;
  };
  replyStrategy: CustomerServiceReplyStrategy;
  semanticMoveBudget: CustomerServiceSemanticMoveBudget;
  dominantTurnGoal: CustomerServiceTurnGoal;
  rankedTurnGoals: CustomerServiceTurnGoal[];
  /**
   * 本轮必须共同完成的目标。dominantTurnGoal 只决定先后顺序，不能再把
   * “既要安慰、又问怎么办”这类复合请求压扁成一个标签。
   */
  requiredTurnGoals: CustomerServiceTurnGoal[];
  /**
   * 面向生成和质量门的最小回应动作。它描述“这一轮要怎么像人在接话”，
   * 不保存固定文案，也不替模型捏造事实。
   */
  requiredResponseActs: CustomerServiceResponseAct[];
  conversationTaskState: CustomerServiceConversationTaskState;
  dialogueObligation: CustomerServiceDialogueObligation;
  stateTruthSignal: CustomerServiceStateTruthSignal;
};

export type CustomerServiceNamedOfferingReferentStatus =
  | 'NONE'
  | 'PRESENT_UNRESOLVED'
  | 'EXACT_STRUCTURED_ENTITY'
  | 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY'
  | 'UNMATCHED_NAMED_OFFERING';

export type CustomerServiceNamedOfferingReferentSource =
  | 'NONE'
  | 'EXPLICIT_QUOTED'
  | 'UNQUOTED_MODEL_TOKEN'
  | 'KNOWN_IDENTITY_EXTENSION'
  | 'MERCHANT_NAMED_SUBJECT'
  | 'MODEL_NAMED_SPAN'
  | 'CONTEXTUAL_GROUNDED_ENTITY'
  | 'STRUCTURED_ENTITY';

export type CustomerServiceNamedOfferingReferentV1 = {
  authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT';
  status: CustomerServiceNamedOfferingReferentStatus;
  source: CustomerServiceNamedOfferingReferentSource;
  surface: string | null;
  resolvedGroundingIds: string[];
};

export type CustomerServiceMessageUnderstanding = {
  source: CustomerServiceClassificationSource;
  /**
   * Verbatim current-message spans that the semantic producer identified as names of
   * concrete offerings. These spans carry no catalog/entity/Grounding authority;
   * Runtime may only map them to server-owned canonical identities.
   */
  namedOfferingMentionSpans?: string[];
  /** Bounded single-offering or option-set selection among proven units of the last delivered assistant reply. */
  contextualReferentSelection?: { mode: 'SINGLE' | 'SET'; evidence: string; sourceQuote: string; groundingRefs: string[] } | null;
  factOwnership: {
    authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP';
    scope: 'CURRENT_BUSINESS_FACT' | 'GENERAL_DOMAIN' | 'NONE';
    confidence: number;
    evidence: string[];
    reason: string;
    namedOfferingReferent: CustomerServiceNamedOfferingReferentV1;
  };
  primaryScenario: string;
  primaryIntent: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  emotion: 'NEUTRAL' | 'ANXIOUS' | 'FRUSTRATED' | 'DISAPPOINTED' | 'ANGRY' | 'POSITIVE';
  topics: CustomerServiceTopic[];
  intentRanking: CustomerServiceIntentHypothesis[];
  recognizedItems: CustomerServiceRecognizedItem[];
  recognitionModel: CustomerServiceRecognitionModelMeta;
  humanContext: CustomerServiceHumanContext;
  requiresHumanReview: boolean;
  confidence: number;
  reasons: string[];
};
