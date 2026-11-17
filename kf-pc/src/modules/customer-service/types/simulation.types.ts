import type { CustomerServiceCalibrationScopeType, CustomerServiceTuningDirectives } from './calibrations.types';
import type { CustomerServiceResolvedStrategyPolicy } from './strategy-policy.types';

export type CustomerServiceSimulationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CustomerServiceReplyRoute = 'EXACT_REPLY' | 'TEMPLATE_REPLY' | 'CONTROLLED_GENERATION' | 'SMART_GENERATION' | 'HUMAN_REVIEW';

export interface CustomerServiceSimulationCompilePayload {
  merchantRoleId: string;
  storeProfileId?: string;
  accountProfileId?: string;
  tuningSessionId?: string;
  clientMessageId?: string;
  message: string;
  industryNodeId?: string;
  recognitionSessionId?: string;
  scenario?: string;
  intent?: string;
  riskLevel?: CustomerServiceSimulationRiskLevel;
  serviceGoal?: string;
  conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  customerState?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  facts?: Record<string, unknown>[];
  assetIds?: string[];
  strategyVersionIds?: string[];
  /** HVE-3 test/diagnostic lane. Normal production runtime does not accept an operator lane override. */
  hveExecutionLane?: 'HVE3_CANDIDATE';
}

export interface CustomerServiceSimulationExecutePayload extends CustomerServiceSimulationCompilePayload {
  generateReply?: boolean;
  allowRewrite?: boolean;
}

export interface CustomerServiceMatchedResponseRule {
  id: string;
  key: string;
  name: string;
  priority: number;
  exclusive: boolean;
  responseAssetId: string;
  responseAssetKey: string;
  responseType: string;
  versionId: string;
  versionNo: number;
}

export interface CustomerServiceDeterministicReplyPlan {
  route: 'DETERMINISTIC' | 'UNRESOLVED';
  matchedRules: CustomerServiceMatchedResponseRule[];
  exactReply: string | null;
  templateReply: { template: string; rendered: string | null; missingVariables: string[] } | null;
  requiredPoints: string[];
  workflowSteps: Array<{ code: string; name: string; required: boolean }>;
}

export interface CustomerServiceTopic {
  scenario: string;
  intent: string;
  riskLevel: CustomerServiceSimulationRiskLevel;
  priority: number;
  confidence: number;
  evidence: string[];
}


export type CustomerServiceCommercialOpenness = 'CLOSED' | 'UNKNOWN' | 'LATENT' | 'ACTIVE' | 'EXPLICIT';
export type CustomerServiceCommercialStage =
  | 'NO_COMMERCIAL_MOVE' | 'RELATIONSHIP_BUILDING' | 'CONTEXT_DISCOVERY' | 'NEED_EXPLORATION'
  | 'VALUE_BRIDGING' | 'PRODUCT_RECOMMENDATION' | 'DECISION_SUPPORT' | 'LOW_PRESSURE_CLOSE';
export type CustomerServiceProductMentionPolicy = 'PROHIBITED' | 'CATEGORY_ONLY' | 'SPECIFIC_IF_RELEVANT' | 'SPECIFIC_ALLOWED';
export interface CustomerServiceCommercialStrategy {
  stage: CustomerServiceCommercialStage;
  objective: string;
  discoveryTarget: string;
  productMentionPolicy: CustomerServiceProductMentionPolicy;
  transitionSignals: string[];
  evidence: string[];
  reason: string;
}
export type CustomerServiceRelationshipState = 'FORMAL' | 'OPEN' | 'FAMILIAR' | 'STRAINED';
export type CustomerServiceConversationStance = 'FORMAL_SERVICE' | 'FRIENDLY_SERVICE' | 'CLOSE_FRIEND_SERVICE' | 'REPAIR_SERVICE';
export type CustomerServiceMindset = 'OPEN_AND_RELAXED' | 'TASK_FOCUSED' | 'CAUTIOUS' | 'ANXIOUS' | 'DISAPPOINTED' | 'ANGRY' | 'NEUTRAL';

export type CustomerServiceEmotionalPosture = 'PLAYFUL_WARM' | 'WARM_CURIOUS' | 'WARM_PROFESSIONAL' | 'CALM_REASSURING' | 'EMPATHETIC_ACCOUNTABLE' | 'CALM_ACCOUNTABLE' | 'SERIOUS_REPAIR' | 'CAUTIOUS_SERIOUS';
export interface CustomerServiceEmotionStrategy {
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
}

export type CustomerServicePrimaryMotive = 'RELATIONSHIP_CONTACT' | 'EMOTIONAL_SHARING' | 'INFORMATION_SEEKING' | 'ACTION_REQUEST' | 'PURCHASE_EXPLORATION' | 'PURCHASE_DECISION' | 'PROBLEM_RESOLUTION' | 'RELATIONSHIP_REPAIR';
export type CustomerServiceConversationPhase = 'OPENING' | 'SHARING' | 'SERVICE' | 'DECISION' | 'REPAIR' | 'CLOSING';
export type CustomerServiceFirstMove = 'ACKNOWLEDGE_AND_INVITE_SHARING' | 'INVITE_SHARING' | 'DISCOVER_CONTEXT' | 'RESPOND_TO_SHARED_CONTEXT' | 'PROCESS_PROVIDED_INFORMATION' | 'HANDLE_INFORMATION_BARRIER' | 'CLARIFY_NEED' | 'SOLVE_CURRENT_ISSUE' | 'SUPPORT_DECISION' | 'REPAIR_RELATIONSHIP' | 'CONFIRM_OR_CLOSE';
export type CustomerServiceCommercialTiming = 'HOLD' | 'WAIT_FOR_CONTEXT' | 'EXPLORE_IF_RELEVANT' | 'ASSIST_NOW';

export interface CustomerServiceSemanticMoveBudget {
  maxCoreMoves: 1 | 2 | 3;
  allowedMoves: string[];
  forbiddenCombinations: string[];
  reason: string;
}


export type CustomerServiceRecognitionItemType = 'INTENT' | 'EVENT' | 'STATE' | 'SIGNAL';
export type CustomerServiceRecognitionMatchStatus = 'EXACT' | 'RELATED' | 'UNMATCHED';
export type CustomerServiceRecognitionScope = 'CONVERSATION' | 'TURN';
export type CustomerServiceRecognitionContinuity = 'NEW' | 'CONTINUING' | 'SHIFTED' | 'RESOLVED';

export type CustomerServiceIntentRole = 'PRIMARY' | 'SECONDARY' | 'LATENT';
export interface CustomerServiceIntentHypothesis {
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
}
export type CustomerServiceTurnGoalKey =
  | 'INVITE_POSITIVE_SHARING' | 'INVITE_EMOTIONAL_SHARING'
  | 'PROVIDE_EMOTIONAL_COMFORT' | 'LISTEN_TO_VENTING' | 'PROVIDE_REQUESTED_ADVICE' | 'RESPECT_EMOTIONAL_SPACE'
  | 'RESPOND_TO_SHARED_CONTEXT' | 'PROCESS_PROVIDED_INFORMATION' | 'HANDLE_INFORMATION_BARRIER'
  | 'ANSWER_INFORMATION' | 'EXECUTE_REQUEST' | 'RESOLVE_CURRENT_PROBLEM' | 'REPAIR_TRUST'
  | 'CLARIFY_NEED' | 'EXPLORE_PRODUCT_NEED' | 'SUPPORT_PURCHASE_DECISION' | 'CONFIRM_TRANSACTION'
  | 'DISCOVER_LIFE_CONTEXT' | 'MAINTAIN_RELATIONSHIP' | 'CLOSE_CONVERSATION';
export interface CustomerServiceTurnGoal {
  key: CustomerServiceTurnGoalKey;
  name: string;
  priority: number;
  confidence: number;
  evidence: string[];
  reason: string;
  responseRequirement: string;
  source: 'EXPLICIT' | 'CONTEXT' | 'STATE' | 'SIGNAL' | 'MODEL';
  deferred: boolean;
}


export type CustomerServicePendingSlotKey = 'ORDER_ID' | 'TRACKING_NUMBER' | 'PHONE' | 'ADDRESS' | 'PRODUCT_MODEL' | 'ISSUE_EVIDENCE' | 'ORIGINAL_APPOINTMENT_TIME' | 'APPOINTMENT_ID';
export interface CustomerServicePendingSlot {
  key: CustomerServicePendingSlotKey;
  name: string;
  status: 'REQUESTED' | 'PROVIDED' | 'MISSING' | 'CONFIRMED';
  value: string | null;
  confidence: number;
  requestedByAssistant: string | null;
  evidence: string[];
}
export interface CustomerServiceSemanticQuestionState {
  key: 'EMOTION_CAUSE' | 'SERVICE_DETAIL' | 'OTHER';
  name: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED_UNAVAILABLE' | 'CLOSED_REFUSED';
  askedByAssistant: string;
  answer: string | null;
  reopenAllowed: boolean;
  evidence: string[];
}
export interface CustomerServiceConversationTaskState {
  currentTurnRelation: 'NEW_REQUEST' | 'ANSWER_TO_ASSISTANT_REQUEST' | 'INFORMATION_BARRIER' | 'CONTINUATION' | 'TOPIC_SHIFT' | 'RESOLUTION';
  activeScenario: string;
  activeIntent: string;
  status: 'NONE' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'INTERNAL_PROCESSING' | 'READY_TO_ADVANCE' | 'RESOLVED';
  lastAssistantRequest: string | null;
  pendingSlots: CustomerServicePendingSlot[];
  providedSlots: CustomerServicePendingSlot[];
  unresolvedGoals: string[];
  suspendedTasks: Array<{ scenario: string; intent: string; status: 'PAUSED' | 'PENDING_INTERNAL'; reason: string }>;
  internalHandling: {
    required: boolean;
    status: 'NONE' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
    scenario: string | null;
    reason: string | null;
    customerVisibleDisclosure: 'HIDDEN';
  };
  evidence: string[];
  responsibility: 'NONE' | 'CUSTOMER' | 'INTERNAL' | 'SHARED';
  semanticQuestions: CustomerServiceSemanticQuestionState[];
  requestResponseType?: 'NONE' | 'PROVIDED' | 'UNAVAILABLE' | 'REFUSED' | 'ALTERNATIVE_REQUEST';
  activeTaskId?: string | null;
  longHorizonStatus?: 'ACTIVE' | 'SUSPENDED' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'RESOLVED' | 'ABANDONED' | 'REOPENED';
}

export type CustomerServiceAssistantMove = 'ACKNOWLEDGE' | 'INVITE_SHARING' | 'GENERIC_EMPATHY' | 'ANALYZE' | 'ADVISE' | 'ASK_QUESTION' | 'OFFER_OPTIONS' | 'EXPLAIN' | 'BUSINESS_ACTION' | 'UNKNOWN';
export type CustomerServiceFeedbackType = 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'INSUFFICIENT' | 'REJECTED' | 'CORRECTED' | 'ESCALATED' | 'WITHDRAWN' | 'UNCLEAR';
export type CustomerServiceRequestedDelta = 'DEEPER' | 'MORE_SPECIFIC' | 'MORE_DETAILED' | 'WARMER' | 'LESS_FORMAL' | 'MORE_DIRECT' | 'SHORTER' | 'DIFFERENT_APPROACH' | 'ANOTHER_OPTION' | 'NO_QUESTIONS' | 'NO_ADVICE' | 'LISTEN_ONLY' | 'ANSWER_PREVIOUS_QUESTION' | 'RETURN_TO_PREVIOUS_TOPIC' | 'STOP_CURRENT_TOPIC';
export type CustomerServiceSemanticActionFamily =
  | 'WARM_CONTACT' | 'EMOTIONAL_ACKNOWLEDGEMENT' | 'LISTENING_PRESENCE'
  | 'LOWER_IMMEDIATE_PRESSURE' | 'DISTANCE_FROM_TRIGGER' | 'BASIC_BODY_CARE'
  | 'CHANGE_IMMEDIATE_ENVIRONMENT' | 'WRITE_OR_EXTERNALIZE' | 'CONTACT_TRUSTED_PERSON'
  | 'FOCUSED_RELIEF_ACTIVITY'
  | 'GATHER_NECESSARY_INFORMATION' | 'VERIFY_SERVICE_FACT' | 'SUBMIT_SERVICE_ACTION'
  | 'EXPLAIN_BOUNDARY' | 'RESPECT_PAUSE' | 'REOPEN_ADVICE' | 'LIGHT_HUMOR'
  | 'INVITE_SHARED_ACTIVITY';
export type CustomerServiceFeedbackHandlingMode = 'NONE' | 'REFINE' | 'CORRECT' | 'BOUNDARY' | 'WITHDRAW' | 'TRUST_REPAIR';
export interface CustomerServiceDialogueObligation {
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
}

export interface CustomerServiceAssistantBehaviorObservationSummary {
  logicalActionKey?: string;
  replyAttemptId?: string;
  replyTraceId?: string;
  evidenceMessageIds?: string[];
  source?: 'TRACE_AND_TEXT' | 'TEXT_HEURISTIC';
  observedActs?: string[];
  questionCount?: number;
  questionEnding?: boolean;
  structureKey?: string;
  plan?: {
    interactionMode?: string;
    questionPolicy?: string;
    businessAdvance?: string;
    selfIntroduction?: string;
    identityResponse?: string;
    serviceScopeExposure?: string;
    needRestatement?: string;
    completionStyle?: string;
    requiredActs?: string[];
    optionalActs?: string[];
    forbiddenActs?: string[];
  } | null;
}

export interface CustomerServiceBehaviorHistoryProjection {
  windowSize: number;
  recentQuestionTurns: number[];
  consecutiveQuestionEndingTurns: number;
  recentOptionalQuestionCount: number;
  recentRequiredQuestionCount: number;
  recentSuggestionQuestionTurns: number;
  recentCtaCount: number;
  recentBusinessAdvanceCount: number;
  recentSelfIntroCount: number;
  recentServiceScopeCount: number;
  recentRestatementCount: number;
  recentSuggestionCount: number;
  recentInteractionModes: string[];
  recentStructureKeys: string[];
  recentOpeningKeys: string[];
  recentEndingKeys: string[];
  lastAssistantMoveAccepted: boolean | null;
  lastAssistantMoveRejected: boolean;
  recentRequestedDeltas: CustomerServiceRequestedDelta[];
  lastAssistantAskedQuestion: boolean;
}

export interface CustomerServiceConversationStateSummary {
  schemaVersion: 2;
  revision: number;
  currentTurn: number;
  activeTask: Record<string, unknown> | null;
  suspendedTasks: Array<Record<string, unknown>>;
  relevantMemories: Array<{
    id: string; kind: string; key: string; value: string; evidence: string; evidenceMessageIds?: string[]; sourceTurn: number;
    confidence: number; durable: boolean; invalidated: boolean; withdrawn: boolean;
  }>;
  recentAssistantMoves: Array<{
    turn: number; move: CustomerServiceAssistantMove; strategyKey: string; openingKey: string; endingKey: string;
    accepted: boolean | null; rejected: boolean; requestedDeltas: CustomerServiceRequestedDelta[]; excerpt: string;
    actionFamilies?: CustomerServiceSemanticActionFamily[];
    practicalActionFamilies?: CustomerServiceSemanticActionFamily[];
    interpersonalActionFamilies?: CustomerServiceSemanticActionFamily[];
    behavior?: CustomerServiceAssistantBehaviorObservationSummary | null;
  }>;
  behaviorHistory?: CustomerServiceBehaviorHistoryProjection;
  relationshipDynamics?: {
    relationshipDistance: 'FORMAL' | 'NEUTRAL' | 'WARM' | 'CLOSE' | 'REPAIR';
    warmContactAcceptance: 'UNKNOWN' | 'ACCEPTED' | 'REJECTED';
    humorAcceptance: 'UNKNOWN' | 'ACCEPTED' | 'REJECTED';
    supportMode: 'COMPANIONSHIP' | 'PROBLEM_SOLVING' | 'BALANCED' | 'SPACE';
    previousReplyReception: 'NO_SIGNAL' | 'ACCEPTED' | 'PARTIAL' | 'REJECTED';
    emotionalIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
    conversationTempo: 'QUIET' | 'STEADY' | 'LIGHT' | 'SERIOUS';
    recommendedStance: 'ACTIVE_WARM' | 'QUIET_COMPANION' | 'LIGHT_FRIENDLY' | 'SERIOUS_PRACTICAL' | 'FORMAL_SAFE';
    recentInterpersonalActions: CustomerServiceSemanticActionFamily[];
    recentPracticalActions: CustomerServiceSemanticActionFamily[];
    evidence: string[];
  };
  latestFeedback: CustomerServiceDialogueObligation | null;
  closedSemanticQuestions: string[];
  canonicalFields?: Record<string, {
    value: unknown;
    status: 'EXPLICIT' | 'INFERRED' | 'UNKNOWN' | 'CONFLICTED' | 'STALE';
    confidence: number;
    evidenceMessageIds: string[];
    reason: string;
    updatedAt: string | null;
  }>;
}

export interface CustomerServiceRecognizedItem {
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
  suggestedRiskLevel: CustomerServiceSimulationRiskLevel;
  matchedDefinition: { id: string; key: string; name: string; category: string; scenario: string; primaryIntent: string } | null;
  matchStatus: CustomerServiceRecognitionMatchStatus;
  matchScore: number;
  matchReason: string;
  candidate: { id: string; status: 'PENDING' | 'CONVERTED' | 'IGNORED'; occurrenceCount: number; averageConfidence: number; convertedDefinitionId: string | null } | null;
}
export interface CustomerServiceRecognitionModelMeta {
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
}

export type CustomerServiceReplyStrategyMode =
  | 'PLAYFUL_INVITATION' | 'FRIENDLIKE_REACTION' | 'WARM_EXPLORATION' | 'DIRECT_ANSWER'
  | 'PROFESSIONAL_GUIDANCE' | 'ACCOUNTABLE_RESOLUTION' | 'CALM_PROGRESS_UPDATE'
  | 'RELATIONSHIP_REPAIR' | 'SAFE_BOUNDARY' | 'NATURAL_CLOSE';
export type CustomerServiceReplyContinuation = 'INVITE_SHARING' | 'OPEN_QUESTION' | 'OPEN_STATEMENT' | 'WAIT_FOR_CUSTOMER' | 'NEXT_SERVICE_STEP' | 'CLOSE_NATURALLY';
export interface CustomerServiceReplyStrategy {
  mode: CustomerServiceReplyStrategyMode;
  primaryMove: string;
  secondaryMoves: string[];
  continuation: CustomerServiceReplyContinuation;
  valueGoal: string;
  mustInclude: string[];
  avoid: string[];
  reason: string;
}

export interface CustomerServiceEmotionalDisclosure {
  detected: boolean;
  polarity: 'NONE' | 'POSITIVE' | 'NEGATIVE' | 'MIXED';
  mode: 'NONE' | 'POSITIVE_SHARING' | 'NEGATIVE_SHARING' | 'VENTING' | 'SEEK_LISTENING' | 'SEEK_COMFORT' | 'SEEK_ADVICE' | 'GRIEF_OR_LOSS' | 'RELATIONSHIP_DISTRESS';
  confidence: number;
  adviceRequested: boolean;
  evidence: string[];
}

export interface CustomerServiceHumanContext {
  primaryMotive: CustomerServicePrimaryMotive;
  secondaryMotives: CustomerServicePrimaryMotive[];
  mindset: CustomerServiceMindset;
  relationshipState: CustomerServiceRelationshipState;
  conversationStance?: CustomerServiceConversationStance;
  commercialOpenness: CustomerServiceCommercialOpenness;
  commercialOpennessScore: number;
  commercialStrategy?: CustomerServiceCommercialStrategy;
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
  semanticMoveBudget?: CustomerServiceSemanticMoveBudget;
  dominantTurnGoal?: CustomerServiceTurnGoal;
  rankedTurnGoals?: CustomerServiceTurnGoal[];
  requiredTurnGoals?: CustomerServiceTurnGoal[];
  requiredResponseActs?: Array<
    | 'DIRECT_WARM_CONTACT'
    | 'SPECIFIC_CONTEXT_ACKNOWLEDGEMENT'
    | 'OPTIONAL_SMALL_RELIEF'
    | 'DIRECT_ANSWER'
    | 'PRACTICAL_NEXT_STEP'
    | 'LISTENING_SPACE'
    | 'RESPECT_BOUNDARY'
    | 'LOW_PRESSURE_CONTINUATION'
  >;
  conversationTaskState?: CustomerServiceConversationTaskState;
  dialogueObligation: CustomerServiceDialogueObligation;
}

export interface CustomerServiceMessageUnderstanding {
  source: 'MANUAL' | 'HEURISTIC' | 'MODEL_ASSISTED';
  primaryScenario: string;
  primaryIntent: string;
  riskLevel: CustomerServiceSimulationRiskLevel;
  emotion: 'NEUTRAL' | 'ANXIOUS' | 'FRUSTRATED' | 'DISAPPOINTED' | 'ANGRY' | 'POSITIVE';
  topics: CustomerServiceTopic[];
  intentRanking?: CustomerServiceIntentHypothesis[];
  recognizedItems: CustomerServiceRecognizedItem[];
  recognitionModel: CustomerServiceRecognitionModelMeta;
  humanContext: CustomerServiceHumanContext;
  customerRequestedRefund: boolean;
  customerRejectedRecommendation: boolean;
  requiresHumanReview: boolean;
  confidence: number;
  reasons: string[];
}


export type CustomerServiceCapabilityAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN' | 'REQUIRES_APPROVAL';
export interface CustomerServiceServiceCapabilities {
  accountOrderVisibility: CustomerServiceCapabilityAvailability;
  orderLookupById: CustomerServiceCapabilityAvailability;
  orderLookupByPhone: CustomerServiceCapabilityAvailability;
  trackingLookup: CustomerServiceCapabilityAvailability;
  logisticsUrge: CustomerServiceCapabilityAvailability;
  source: 'RUNTIME_CONFIG' | 'NOT_CONFIGURED';
  configurationStatus: 'NOT_CONFIGURED' | 'CONFIGURED';
  enforcementMode: 'COMMUNICATION_ONLY' | 'STRICT_EXECUTION';
  actionLimits: Record<string, unknown>;
  executionReceipts: Array<{ action: string; status: 'COMPLETED' | 'IN_PROGRESS' | 'ACCEPTED' | 'REJECTED'; source: 'TOOL_RESULT' | 'BUSINESS_STATE' | 'RUNTIME'; evidence: string[]; occurredAt: string | null }>;
  evidence: string[];
}

export interface CustomerServiceOrchestrationPlan {
  route: CustomerServiceReplyRoute;
  primaryTopic: CustomerServiceTopic;
  topics: CustomerServiceTopic[];
  intentRanking?: CustomerServiceIntentHypothesis[];
  dominantTurnGoal?: CustomerServiceTurnGoal;
  rankedTurnGoals?: CustomerServiceTurnGoal[];
  requiredTurnGoals?: CustomerServiceTurnGoal[];
  requiredResponseActs?: string[];
  intentExecutionOrder?: Array<{ key: string; name: string; role: CustomerServiceIntentRole; priority: number; confidence: number; actionable: boolean; guidanceKey: string | null }>;
  serviceGoal: string;
  humanityGoal: string;
  businessGoal: string | null;
  businessOpportunity: {
    mode: 'NONE' | 'OBSERVE' | 'DISCOVER' | 'ASSIST' | 'ADVANCE';
    openness: CustomerServiceCommercialOpenness;
    score: number;
    stage?: CustomerServiceCommercialStage;
    productMentionPolicy?: CustomerServiceProductMentionPolicy;
    discoveryTarget?: string;
    transitionSignals?: string[];
    reason: string;
    allowedApproaches: string[];
    forbiddenApproaches: string[];
  };
  microActions: string[];
  prohibitedMicroActions: string[];
  semanticMoveBudget: CustomerServiceSemanticMoveBudget;
  questionBudget: number;
  informationBudget: number;
  salesVisibility: 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
  humanReviewRequired: boolean;
  routeReason: string;
  serviceCapabilities: CustomerServiceServiceCapabilities;
}

export interface CustomerServiceRuntimeContract {
  runtimeMode: 'SIMULATION';
  identity: {
    merchantRole: { id: string; code: string; name: string; publicIdentity: string | null; revision: number };
    prototype: {
      id: string;
      code: string;
      name: string;
      identity: string | null;
      personality: string | null;
      languageStyle: string | null;
      servicePosture: string | null;
      revision: number;
    };
  };
  businessContext: {
    storeProfile: { id: string; code: string; name: string; description: string | null; profile: Record<string, unknown>; revision: number } | null;
    accountProfile: { id: string; code: string; name: string; channel: string | null; description: string | null; profile: Record<string, unknown>; revision: number } | null;
    languagePolicies: Array<{
      id: string; code: string; name: string; scopeType: string; scopeKey: string; priority: number; revision: number;
      styleGuidance: Record<string, unknown>; rules: Array<Record<string, unknown>>;
    }>;
    promptInstructions: string[];
  };
  classification: {
    source: 'MANUAL' | 'HEURISTIC' | 'MODEL_ASSISTED';
    industry: { id: string; code: string; name: string; nodeType: string; path: string; revision: number } | null;
    scenario: string;
    intent: string;
    riskLevel: CustomerServiceSimulationRiskLevel;
    emotion: CustomerServiceMessageUnderstanding['emotion'];
    confidence: number;
    topics: CustomerServiceTopic[];
    intentRanking?: CustomerServiceIntentHypothesis[];
    recognizedItems: CustomerServiceRecognizedItem[];
    recognitionModel: CustomerServiceRecognitionModelMeta;
    humanContext: CustomerServiceHumanContext;
  };
  persona: {
    modules: Array<{
      id: string;
      key: string;
      name: string;
      moduleType: string;
      mergeMode: string;
      priority: number;
      sort: number;
      content: unknown;
      conditions: unknown;
      revision: number;
    }>;
  };

  strategyPolicy: CustomerServiceResolvedStrategyPolicy;
  intentGuidance: Array<{
    id: string; key: string; name: string; category: string; scenario: string; primaryIntent: string; defaultRiskLevel: string;
    recognitionConfig: Record<string, unknown>; strategyConfig: Record<string, unknown>; flowConfig: Record<string, unknown>;
    replyConfig: Record<string, unknown>; examples: unknown; priority: number; revision: number;
  }>;
  calibration: {
    profiles: Array<{
      id: string;
      scopeType: CustomerServiceCalibrationScopeType;
      scopeKey: string;
      title: string;
      scenario: string | null;
      intent: string | null;
      riskLevel: string | null;
      directives: CustomerServiceTuningDirectives;
      examples: Array<Record<string, unknown>> | null;
      revision: number;
    }>;
    directives: CustomerServiceTuningDirectives;
  };
  generationContext: {
    previousDrafts: string[];
    conversationHistory: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
    conversationState: CustomerServiceConversationStateSummary;
    contextWindow: { recentMessageCount: number; retrievedMemoryCount: number; estimatedCharacters: number };
  };
  customerState: Record<string, unknown>;
  groundedContext: {
    latestCustomerMessage: string;
    facts: unknown[];
    factPolicy: 'VERIFIED_ONLY';
    variables: Record<string, unknown>;
  };
  policy: {
    serviceGoal: string;
    assets: Array<{
      assetId: string;
      key: string;
      name: string;
      assetType: string;
      versionId: string;
      versionNo: number;
      content: unknown;
      contentHash: string;
    }>;
  };
  replyPlan: CustomerServiceDeterministicReplyPlan;
  orchestrationPlan: CustomerServiceOrchestrationPlan;
  responseControl: {
    customerVisibleSend: false;
    businessWrite: false;
    modelGeneration: boolean;
    salesVisibility: CustomerServiceOrchestrationPlan['salesVisibility'];
    qualityGate: 'NOT_RUN' | 'PASS' | 'WARN' | 'FAIL';
  };
  provenance: {
    tenantId: string;
    sourceRevisions: Record<string, number>;
    configurationHash: string;
  };
}

export interface CustomerServiceRewriteIssue {
  key: string;
  name: string;
  severity: 'BLOCKER' | 'ERROR' | 'WARNING';
  message: string;
  evidence: string[];
}

export interface CustomerServiceRewriteAttempt {
  attempt: number;
  mode: 'MODEL_REWRITE' | 'SALVAGE_REWRITE' | 'COMPACT_MODEL_RETRY' | 'SEMANTIC_SAFE_FALLBACK' | 'BEST_SAFE_MODEL_CANDIDATE' | 'BEST_SAFE_CANDIDATE' | 'MODEL_AVAILABILITY_FALLBACK' | 'HIGH_RISK_SAFE_RESPONSE' | 'SAFE_FALLBACK' | 'FAILURE_NOTICE';
  status: CustomerServiceGenerationStatus;
  draft: string | null;
  model: string | null;
  elapsedMs: number;
  requestId: string | null;
  errorMessage: string | null;
  qualityStatus: 'PASS' | 'WARN' | 'FAIL' | 'NOT_RUN' | null;
  failedIssues: CustomerServiceRewriteIssue[];
}

export type CustomerServiceModelStatus = 'SUCCESS' | 'EMPTY_CONTENT' | 'TRUNCATED' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'MODEL_NOT_CONFIGURED' | 'MODEL_ERROR';
export type CustomerServiceGenerationStatus = 'NOT_REQUESTED' | 'DETERMINISTIC' | 'GENERATED' | 'MODEL_NOT_CONFIGURED' | 'MODEL_ERROR' | 'GENERATION_EMPTY' | 'GENERATION_TRUNCATED' | 'GENERATION_TIMEOUT' | 'INVALID_RESPONSE' | 'HUMAN_REVIEW_REQUIRED' | 'QUALITY_REJECTED' | 'GENERATION_FAILED_NOTICE';
export type CustomerServiceGenerationSource = 'NONE' | 'EXACT_REPLY' | 'TEMPLATE_REPLY' | 'MODEL' | 'COMPACT_MODEL_RETRY' | 'QUALITY_REWRITE' | 'PLAN_SURFACE_REPAIR' | 'BEST_SAFE_MODEL_CANDIDATE' | 'BEST_SAFE_CANDIDATE' | 'SEMANTIC_SAFE_FALLBACK' | 'MODEL_AVAILABILITY_FALLBACK' | 'HIGH_RISK_SAFE_RESPONSE' | 'SAFE_FALLBACK' | 'HUMAN_REVIEW_ACK' | 'FAILURE_NOTICE';
export type CustomerServiceCandidateSafetyStatus = 'PASS' | 'BLOCKED' | 'NOT_RUN';
export type CustomerServiceCandidateQualityStatus = 'PASS' | 'WARN' | 'DEGRADED' | 'FAIL' | 'NOT_RUN';
export type CustomerServiceDeliveryDecision = 'NOT_DECIDED' | 'SEND_PRIMARY' | 'SEND_MODEL_REWRITE' | 'SEND_BEST_SAFE_MODEL_CANDIDATE' | 'SEND_MODEL_AVAILABILITY_FALLBACK' | 'SEND_HIGH_RISK_SAFE_RESPONSE';

export interface CustomerServiceModelAttempt {
  mode: 'INITIAL' | 'COMPACT_RETRY' | 'QUALITY_REWRITE' | 'SALVAGE_REWRITE';
  attempt: number;
  status: CustomerServiceModelStatus;
  requestedModel: string;
  actualModel: string | null;
  thinkingMode: 'ENABLED' | 'DISABLED';
  requestedMaxTokens: number;
  effectiveMaxTokens: number;
  timeoutMs: number;
  finishReason: string | null;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  reasoningContentLength: number;
  visibleContentLength: number;
  emptyContentReason: string | null;
  truncated: boolean;
  timedOut: boolean;
  elapsedMs: number;
  requestId: string | null;
  errorMessage: string | null;
}


export interface CustomerServiceDeliverySegment {
  index: number;
  content: string;
  delayBeforeMs: number;
  status: 'PLANNED';
}

export interface CustomerServiceMessageDeliveryPlan {
  mode: 'SINGLE' | 'SEQUENTIAL';
  segments: CustomerServiceDeliverySegment[];
  cancelRemainingOnCustomerMessage: boolean;
  reason: string;
}

export interface CustomerServiceGenerationResult {
  status: CustomerServiceGenerationStatus;
  draft: string | null;
  source: CustomerServiceGenerationSource;
  model: string | null;
  elapsedMs: number;
  requestId: string | null;
  usage: Record<string, number>;
  errorMessage: string | null;
  promptPreview: { system: string; user: string } | null;
  rewriteCount: number;
  originalDraft?: string | null;
  rewriteAttemptCount?: number;
  rewriteHistory?: CustomerServiceRewriteAttempt[];
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  initialElapsedMs?: number;
  totalModelElapsedMs?: number;
  modelCallCount?: number;
  requestedModel?: string | null;
  actualModel?: string | null;
  thinkingMode?: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  requestedMaxTokens?: number | null;
  effectiveMaxTokens?: number | null;
  timeoutMs?: number | null;
  finishReason?: string | null;
  reasoningContentLength?: number;
  visibleContentLength?: number;
  emptyContentReason?: string | null;
  initialGenerationStatus?: CustomerServiceModelStatus | 'NOT_REQUESTED' | 'DETERMINISTIC';
  compactRetryAttempted?: boolean;
  compactRetryStatus?: CustomerServiceModelStatus | 'NOT_ATTEMPTED';
  rewriteAttempted?: boolean;
  rewriteStatus?: CustomerServiceModelStatus | 'NOT_ATTEMPTED';
  semanticFallbackUsed?: boolean;
  finalReplySource?: CustomerServiceGenerationSource;
  finalFailureReason?: string | null;
  candidateSafetyStatus?: CustomerServiceCandidateSafetyStatus;
  candidateQualityStatus?: CustomerServiceCandidateQualityStatus;
  deliveryDecision?: CustomerServiceDeliveryDecision;
  modelAttempts?: CustomerServiceModelAttempt[];
  candidateSalvagePlan?: {
    preservedSpans: string[];
    rejectedSpans: string[];
    groundedFacts: string[];
    usefulActions: string[];
    hardViolations: string[];
    missingResponseActs: string[];
    missingIntentCoverage: string[];
    naturalnessProblems: string[];
    recentActionFamilies?: CustomerServiceSemanticActionFamily[];
    blockedPracticalActionFamilies?: CustomerServiceSemanticActionFamily[];
    candidateActionFamilies?: CustomerServiceSemanticActionFamily[];
    repeatedActionFamilies?: CustomerServiceSemanticActionFamily[];
    novelPracticalActionFamilies?: CustomerServiceSemanticActionFamily[];
    requireNovelPracticalAction?: boolean;
  } | null;
  candidateScores?: Array<{
    source: CustomerServiceGenerationSource;
    draft: string;
    absoluteSafe: boolean;
    score: {
      eligible: boolean;
      total: number;
      intentCoverageScore: number;
      humanityScore: number;
      contextGroundingScore: number;
      practicalValueScore: number;
      variationScore: number;
      humanityDimensions?: {
        currentContent: number;
        historyContinuity: number;
        interpersonalNaturalness: number;
        relationshipConsistency: number;
        emotionMatch: number;
        rhythm: number;
        variation: number;
        dialogueValue: number;
        modelTone: number;
        continuationWillingness: number;
      };
      actionFamilies?: CustomerServiceSemanticActionFamily[];
      repeatedActionFamilies?: CustomerServiceSemanticActionFamily[];
      novelPracticalActionFamilies?: CustomerServiceSemanticActionFamily[];
      requireNovelPracticalAction?: boolean;
      reasons: string[];
    };
  }>;
  deliveryPlan?: CustomerServiceMessageDeliveryPlan | null;
  outputRuleApplications?: Array<{
    policyId: string; ruleKey: string; type: string; action: string;
    status: 'APPLIED' | 'UNCHANGED' | 'SKIPPED_EXCEPTION' | 'SKIPPED_EMPTY' | 'INVALID_RULE';
    before?: string; after?: string; message: string;
  }>;
  pipelinePerformance?: CustomerServicePipelinePerformance;
  hve3?: {
    executionLane?: string;
    kernel?: { id?: string; family?: string; version?: string; contentHash?: string; provider?: string };
    candidates?: Array<{ index?: number; source?: string; qualified?: boolean; hardStatus?: string; planStatus?: string; naturalnessScore?: number; hardIssueKeys?: string[]; planWarningKeys?: string[] }>;
    observedActs?: Array<{ type?: string; observation?: 'OBSERVED' | 'NOT_OBSERVED' | 'UNCERTAIN' | string; confidence?: number; evidence?: string[]; groundingRefs?: string[] }>;
    planCompliance?: Record<string, unknown>;
    hardCompliance?: Record<string, unknown>;
    softHumanity?: Record<string, unknown>;
    selectedReason?: string;
    repairBudget?: Record<string, unknown>;
  };
  finalTextFreeze?: { frozen: boolean; sha256: string; frozenAtStage: string; textLength: number };
}

export interface CustomerServiceQualityIssue {
  ruleId: string;
  key: string;
  name: string;
  category: string;
  severity: 'BLOCKER' | 'ERROR' | 'WARNING';
  passed: boolean;
  message: string;
  evidence: string[];
  disposition?: 'BLOCK' | 'REWRITE' | 'SCORE_ONLY';
}

export interface CustomerServiceQualityReport {
  status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_RUN';
  checkedRuleCount: number;
  blockerCount: number;
  errorCount: number;
  warningCount: number;
  blockingIssueCount?: number;
  rewriteIssueCount?: number;
  scoreOnlyIssueCount?: number;
  naturalnessScore?: number;
  issues: CustomerServiceQualityIssue[];
}

export interface CustomerServiceSimulationCompileResult {
  compiledAt: string;
  contractHash: string;
  warnings: string[];
  understanding: CustomerServiceMessageUnderstanding;
  summary: {
    primaryScenario?: string;
    primaryIntent?: string;
    dominantTurnGoal?: string;
    requiredTurnGoals?: string[];
    requiredResponseActs?: string[];
    conversationPhase?: string;
    recognitionPath?: string;
    userFeedback?: string;
    requestedDeltas?: string[];
    feedbackHandlingMode?: string;
    acknowledgementRequired?: boolean;
    strategyChangeRequired?: boolean;
    correctionTarget?: string | null;
    repairObligation?: boolean;
    currentResponseObligation?: string;
    recognizedItems?: Array<{ type: string; name: string; matchStatus: string; isPrimary: boolean }>;
    moduleCount: number;
    availableModuleCount: number;
    assetCount: number;
    calibrationProfileCount: number;
    strategyPolicySourceCount: number;
    strategyPolicyConflictCount: number;
    intentDefinitionCount: number;
    matchedRuleCount: number;
    availableRuleCount: number;
    replyRoute: CustomerServiceReplyRoute;
    hasIndustry: boolean;
    runtimeMode: 'SIMULATION';
  };
  contract: CustomerServiceRuntimeContract;
  tuningSession?: { id: string; title: string; status: string; messageCount: number; analysisCount: number; updatedAt: string } | null;
  analysisRecord?: { id: string; sequenceNo: number; runType: string; createdAt: string } | null;
}


export interface CustomerServicePipelinePerformance {
  totalElapsedMs: number;
  recognitionElapsedMs: number;
  generationModelElapsedMs: number;
  localProcessingElapsedMs: number;
  modelCallCount: number;
  recognitionPath: 'FAST_PATH' | 'MODEL' | 'MODEL_REGENERATION' | 'HEURISTIC_FALLBACK';
}

export interface CustomerServiceSimulationExecutionResult extends CustomerServiceSimulationCompileResult {
  executedAt: string;
  generation: CustomerServiceGenerationResult;
  quality: CustomerServiceQualityReport;
  performance: CustomerServicePipelinePerformance;
}
