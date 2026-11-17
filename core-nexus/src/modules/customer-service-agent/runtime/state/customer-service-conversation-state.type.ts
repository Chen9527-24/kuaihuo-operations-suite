import type {
  CustomerServiceAssistantMove,
  CustomerServiceDialogueObligation,
  CustomerServiceRequestedDelta,
} from '../understanding/types/customer-service-message-understanding.type';
import type { CustomerServiceSemanticActionFamily } from './customer-service-semantic-action-family';
import type { CustomerServiceInteractionPlanShadowSnapshot } from '../interaction/customer-service-interaction-plan.type';

export type CustomerServiceConversationStateValueStatus =
  | 'EXPLICIT'
  | 'INFERRED'
  | 'UNKNOWN'
  | 'CONFLICTED'
  | 'STALE';

export type CustomerServiceConversationStateValue<T> = {
  value: T | null;
  status: CustomerServiceConversationStateValueStatus;
  confidence: number;
  evidenceMessageIds: string[];
  reason: string;
  updatedAt: string | null;
};

export type CustomerServiceCanonicalStateFields = {
  relationship: CustomerServiceConversationStateValue<string>;
  activeTopic: CustomerServiceConversationStateValue<string>;
  currentIntent: CustomerServiceConversationStateValue<string>;
  customerGoal: CustomerServiceConversationStateValue<string>;
  customerActions: CustomerServiceConversationStateValue<string[]>;
  explicitFacts: CustomerServiceConversationStateValue<Array<{ key: string; value: string }>>;
  preferences: CustomerServiceConversationStateValue<Array<{ key: string; value: string }>>;
  assistantActions: CustomerServiceConversationStateValue<string[]>;
  pendingItems: CustomerServiceConversationStateValue<string[]>;
  resolvedItems: CustomerServiceConversationStateValue<string[]>;
  transientState: CustomerServiceConversationStateValue<Record<string, string>>;
};

export const CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION = 2 as const;

export type CustomerServiceLongHorizonTaskStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'WAITING_CUSTOMER'
  | 'WAITING_INTERNAL'
  | 'RESOLVED'
  | 'ABANDONED'
  | 'REOPENED';

export type CustomerServiceLongHorizonTask = {
  id: string;
  scenario: string;
  intent: string;
  goal: string;
  status: CustomerServiceLongHorizonTaskStatus;
  responsibility: 'NONE' | 'CUSTOMER' | 'INTERNAL' | 'SHARED';
  pendingSlots: string[];
  providedSlots: string[];
  unresolvedGoals: string[];
  completedSteps: string[];
  evidence: string[];
  evidenceMessageIds: string[];
  createdTurn: number;
  lastActiveTurn: number;
  resolvedTurn: number | null;
  resumeSignals: string[];
  /** Bounded user-text anchors for task identity/resume matching; not a generation script. */
  anchors: string[];
  proactiveReminderAllowed: boolean;
};

export type CustomerServiceMemoryKind =
  | 'CUSTOMER_FACT'
  | 'CUSTOMER_PREFERENCE'
  | 'CUSTOMER_CONSTRAINT'
  | 'DECISION'
  | 'COMMITMENT'
  | 'CORRECTION'
  | 'WITHDRAWAL'
  | 'EMOTIONAL_EVENT'
  | 'TOPIC_ANCHOR';

export type CustomerServiceConversationMemory = {
  id: string;
  kind: CustomerServiceMemoryKind;
  key: string;
  value: string;
  evidence: string;
  evidenceMessageIds: string[];
  sourceTurn: number;
  confidence: number;
  durable: boolean;
  temporaryEmotion: boolean;
  invalidated: boolean;
  withdrawn: boolean;
  supersededBy: string | null;
  lastUsedTurn: number;
};

export type CustomerServiceConversationEntity = {
  id: string;
  type: 'PERSON' | 'ORDER' | 'PRODUCT' | 'LOCATION' | 'TIME' | 'OTHER';
  canonicalValue: string;
  /** Server-owned semantic slot identifying what this entity represents. */
  semanticKey: string | null;
  aliases: string[];
  sourceTurns: number[];
  invalidated: boolean;
  lastSeenTurn: number;
};

export type CustomerServiceAssistantBehaviorPlanSnapshot = {
  interactionMode: string;
  questionPolicy: 'NONE' | 'OPTIONAL_ONE' | 'REQUIRED_ONE' | 'UNKNOWN';
  businessAdvance: 'NONE' | 'SOFT' | 'NORMAL' | 'UNKNOWN';
  selfIntroduction: string;
  identityResponse: string;
  serviceScopeExposure: string;
  needRestatement: string;
  completionStyle: string;
  requiredActs: string[];
  optionalActs: string[];
  forbiddenActs: string[];
};

export type CustomerServiceAssistantBehaviorObservation = {
  logicalActionKey: string;
  replyAttemptId: string;
  replyTraceId: string;
  evidenceMessageIds: string[];
  source: 'TRACE_AND_TEXT' | 'TEXT_HEURISTIC';
  plan: CustomerServiceAssistantBehaviorPlanSnapshot | null;
  /** HVE-1 shadow-only summary. Existing behavior projection does not consume this field. */
  interactionPlanV2?: CustomerServiceInteractionPlanShadowSnapshot | null;
  /** Result lifecycle marker: delivered text is not the same as fulfilled Canonical Plan. */
  planFulfillment?: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
  /** Server-owned long-horizon task that owned this delivered assistant action; never inferred from prose. */
  taskId?: string;
  /** Grounding ids materially realized by this delivered assistant message and proven by Semantic Conformance. */
  realizedGroundingRefs?: string[];
  /** Surviving delivered unit text paired with its proven refs; never inferred from prose. */
  provenGroundedUnits?: Array<{ text: string; groundingRefs: string[] }>;
  observedActs: string[];
  questionCount: number;
  questionEnding: boolean;
  structureKey: string;
};

export type CustomerServiceAssistantMoveLedgerEntry = {
  turn: number;
  move: CustomerServiceAssistantMove;
  actionFamilies: CustomerServiceSemanticActionFamily[];
  practicalActionFamilies: CustomerServiceSemanticActionFamily[];
  interpersonalActionFamilies: CustomerServiceSemanticActionFamily[];
  strategyKey: string;
  openingKey: string;
  endingKey: string;
  accepted: boolean | null;
  rejected: boolean;
  requestedDeltas: CustomerServiceRequestedDelta[];
  excerpt: string;
  behavior?: CustomerServiceAssistantBehaviorObservation | null;
};

export type CustomerServiceBehaviorHistoryProjection = {
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
};

export type CustomerServiceConversationRelationshipDynamics = {
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

export type CustomerServiceConversationStateV2 = {
  schemaVersion: typeof CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION;
  revision: number;
  currentTurn: number;
  activeTaskId: string | null;
  tasks: CustomerServiceLongHorizonTask[];
  memories: CustomerServiceConversationMemory[];
  entities: CustomerServiceConversationEntity[];
  assistantMoveLedger: CustomerServiceAssistantMoveLedgerEntry[];
  relationshipDynamics: CustomerServiceConversationRelationshipDynamics;
  latestFeedback: CustomerServiceDialogueObligation | null;
  closedSemanticQuestions: string[];
  invalidatedMemoryIds: string[];
  selectedMemoryIds: string[];
  canonicalFields: CustomerServiceCanonicalStateFields;
  updatedAt: string;
};

export type CustomerServiceConversationStateSummary = {
  schemaVersion: 2;
  revision: number;
  currentTurn: number;
  activeTask: CustomerServiceLongHorizonTask | null;
  suspendedTasks: CustomerServiceLongHorizonTask[];
  relevantMemories: CustomerServiceConversationMemory[];
  recentAssistantMoves: CustomerServiceAssistantMoveLedgerEntry[];
  behaviorHistory: CustomerServiceBehaviorHistoryProjection;
  relationshipDynamics: CustomerServiceConversationRelationshipDynamics;
  latestFeedback: CustomerServiceDialogueObligation | null;
  closedSemanticQuestions: string[];
  canonicalFields: CustomerServiceCanonicalStateFields;
};
