export type CustomerServiceCalibrationProblemType =
  | 'AI_TONE'
  | 'REDUNDANT'
  | 'REPETITIVE'
  | 'UNNATURAL'
  | 'ROLE_INCONSISTENT'
  | 'EMOTION_MISMATCH'
  | 'TOO_MANY_QUESTIONS'
  | 'FACT_ERROR'
  | 'WORKFLOW_ERROR'
  | 'SALES_OVERREACH'
  | 'TOO_FORMAL'
  | 'DELIVERY_SHOULD_SPLIT'
  | 'DELIVERY_SHOULD_MERGE'
  | 'DELIVERY_PACING'
  | 'CONTEXT_LOSS'
  | 'CAPABILITY_OVERREACH'
  | 'NO_CONVERSATION_VALUE'
  | 'TOO_LONG'
  | 'TOO_PLAYFUL'
  | 'QUALITY_GATE_MISJUDGMENT'
  | 'UNDERSTANDING_MISCLASSIFICATION'
  | 'OTHER';

export type CustomerServiceCalibrationImprovementMode = 'GUIDED' | 'AI_AUTO';
export type CustomerServiceCalibrationStatus = 'OPEN' | 'AI_ANALYZED' | 'ACCEPTED' | 'APPLIED_TUNING' | 'ARCHIVED';
export type CustomerServiceCalibrationScopeType =
  | 'ROBOT_CONTEXT'
  | 'ROBOT_SCENARIO'
  | 'ROBOT_GLOBAL'
  | 'ACCOUNT_CONTEXT'
  | 'ACCOUNT_SCENARIO'
  | 'ACCOUNT_GLOBAL'
  | 'ROLE_CONTEXT'
  | 'ROLE_SCENARIO'
  | 'ROLE_GLOBAL';

export interface CustomerServiceTuningDirectives {
  version: 1;
  goals: string[];
  behaviorRules: string[];
  avoidExpressions: string[];
  preferredPatterns: string[];
  maxSentences: number | null;
  maxQuestions: number | null;
  emojiPolicy: 'AUTO' | 'AVOID' | 'ALLOW';
  delivery: {
    mode: 'AUTO' | 'SINGLE' | 'SEQUENTIAL' | null;
    maxSegments: number | null;
    minDelayMs: number | null;
    maxDelayMs: number | null;
    splitThresholdChars: number | null;
    cancelRemainingOnCustomerMessage: boolean | null;
  };
}

export interface CustomerServiceCalibrationCreatePayload {
  merchantRoleId: string;
  industryNodeId?: string;
  evaluationCaseId?: string;
  sourceAnalysisId?: string;
  problemTypes: CustomerServiceCalibrationProblemType[];
  improvementMode: CustomerServiceCalibrationImprovementMode;
  problemDescription?: string;
  userSuggestion?: string;
  customerMessage: string;
  originalReply: string;
  scenario?: string;
  intent?: string;
  riskLevel?: string;
  generationModel?: string;
  configurationHash?: string;
  understanding?: Record<string, unknown>;
  runtimeContract?: Record<string, unknown>;
  qualityReport?: Record<string, unknown>;
  sourceSnapshot?: Record<string, unknown>;
}


export interface CustomerServiceCalibrationFromReplyPayload {
  replyTraceId: string;
  sourceRefId?: string;
  selectedSegmentIndexes?: number[];
  problemTypes: CustomerServiceCalibrationProblemType[];
  improvementMode: CustomerServiceCalibrationImprovementMode;
  problemDescription?: string;
  userSuggestion?: string;
}

export interface CustomerServiceCalibrationRefinePayload {
  refinementInstruction?: string;
}

export interface CustomerServiceCalibrationRecommendation {
  scope: string;
  title: string;
  change: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export type CustomerServiceCalibrationProfileStatus = 'ACTIVE' | 'DISABLED' | 'ARCHIVED';

export interface CustomerServiceCalibrationProfile {
  id: string;
  tenantId: string;
  merchantRoleId: string;
  industryNodeId: string | null;
  accountProfileId: string | null;
  scopeType: CustomerServiceCalibrationScopeType;
  scopeKey: string;
  title: string;
  scenario: string | null;
  intent: string | null;
  riskLevel: string | null;
  status: CustomerServiceCalibrationProfileStatus;
  directives: CustomerServiceTuningDirectives;
  examples: Array<Record<string, unknown>> | null;
  sourceRecordIds: string[];
  sourceConfigurationHashes: string[];
  appliedCount: number;
  lastAppliedAt: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  merchantRole: { id: string; code: string; name: string };
  industryNode: { id: string; code: string; name: string; path: string } | null;
  accountProfile: { id: string; code: string; name: string; channel: string } | null;
  createdBy: { id: string; displayName: string; username: string };
  updatedBy: { id: string; displayName: string; username: string } | null;
}


export interface CustomerServiceAppliedCalibrationProfile {
  id: string;
  scopeType: CustomerServiceCalibrationScopeType;
  scopeKey: string;
  title: string;
  scenario: string | null;
  intent: string | null;
  riskLevel: string | null;
  status: CustomerServiceCalibrationProfileStatus;
  directives: CustomerServiceTuningDirectives;
  examples: Array<Record<string, unknown>> | null;
  revision: number;
  updatedAt: string;
}

export type CustomerServiceKnowledgeRevisionDraftStatus = 'DRAFT' | 'VERIFIED' | 'PUBLISHED' | 'REJECTED';

export interface CustomerServiceKnowledgeRevisionDraft {
  id: string;
  calibrationRecordId?: string;
  targetEntryId: string | null;
  targetEntryRevision?: number | null;
  action: 'CREATE' | 'UPDATE';
  scopeType: 'ACCOUNT' | 'STORE';
  scopeKey: string;
  category: 'FAQ' | 'PRODUCT' | 'SERVICE_POLICY' | 'BRAND_FACT' | 'ACTIVITY' | 'OTHER';
  title: string;
  question?: string | null;
  content?: string;
  tags?: string[];
  sourceReference?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  freshnessPolicy?: string | null;
  status: CustomerServiceKnowledgeRevisionDraftStatus;
  verificationNote: string | null;
  verifiedAt: string | null;
  publishedEntryId: string | null;
  publishedAt: string | null;
  revision: number;
  updatedAt: string;
  verifiedBy?: { id: string; displayName: string; username: string } | null;
  publishedBy?: { id: string; displayName: string; username: string } | null;
}

export interface CustomerServiceCalibrationRecord {
  id: string;
  tenantId: string;
  merchantRoleId: string;
  industryNodeId: string | null;
  evaluationCaseId: string | null;
  sourceAnalysisId: string | null;
  sourceType: string | null;
  sourceRefId: string | null;
  replyTraceId: string | null;
  accountProfileId: string | null;
  robotId: string | null;
  channel: string | null;
  platform: string | null;
  conversationId: string | null;
  messageId: string | null;
  replyAttemptId: string | null;
  status: CustomerServiceCalibrationStatus;
  improvementMode: CustomerServiceCalibrationImprovementMode;
  problemTypes: CustomerServiceCalibrationProblemType[];
  problemDescription: string | null;
  userSuggestion: string | null;
  customerMessage: string;
  originalReply: string;
  scenario: string | null;
  intent: string | null;
  riskLevel: string | null;
  generationModel: string | null;
  configurationHash: string | null;
  userFeedback: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'INSUFFICIENT' | 'REJECTED' | 'CORRECTED' | 'ESCALATED' | 'WITHDRAWN' | 'UNCLEAR' | null;
  requestedDeltas: string[];
  correctionTarget: 'CONTENT' | 'TONE' | 'WORDING' | 'INTERACTION' | 'BUSINESS_ACTION' | null;
  rejectedMoves: string[];
  dominantTurnGoal: string | null;
  currentResponseObligation: string | null;
  relatedRoleModuleIds: string[];
  relatedResponseRuleIds: string[];
  relatedAssetIds: string[];
  understanding: Record<string, unknown> | null;
  runtimeContract: Record<string, unknown> | null;
  qualityReport: Record<string, unknown> | null;
  sourceSnapshot: Record<string, unknown> | null;
  aiDiagnosis: {
    summary?: string;
    rootCause?: string;
    evidence?: string[];
    rationale?: string;
    confidence?: number;
    targetScopes?: string[];
  } | null;
  aiRecommendations: CustomerServiceCalibrationRecommendation[] | null;
  tuningDirectives: CustomerServiceTuningDirectives | null;
  suggestedReply: string | null;
  aiModel: string | null;
  aiAnalysisStatus: 'PROCESSING' | 'SUCCESS' | 'MODEL_FAILED' | 'PARSE_FAILED' | null;
  aiAnalysisAttempts: number;
  aiAnalysisDiagnostics: Record<string, unknown> | null;
  aiAnalysisStartedAt: string | null;
  analyzedAt: string | null;
  appliedProfileId: string | null;
  appliedScopeType: CustomerServiceCalibrationScopeType | null;
  appliedScopeKey: string | null;
  appliedAt: string | null;
  strategyDraftAssetId: string | null;
  strategyDraftVersionId: string | null;
  strategyDraftStatus: 'DRAFT' | 'REGRESSION_PASSED' | 'REGRESSION_FAILED' | 'PUBLISHED' | 'SUPERSEDED' | null;
  strategyDraftRegression: CustomerServiceStrategyDraftRegressionEvidence | null;
  strategyDraftValidatedAt: string | null;
  strategyDraftPublishedAt: string | null;
  knowledgeRevisionDraft: CustomerServiceKnowledgeRevisionDraft | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  contentHash?: string | null;
  payloadBytes?: number;
  payloadState?: 'ACTIVE' | 'ARCHIVED' | 'COMPACTED' | 'PURGED';
  retentionClass?: string;
  compactedAt?: string | null;
  merchantRole: { id: string; code: string; name: string; publicIdentity: string | null; prototype: { id: string; code: string; name: string } };
  industryNode: { id: string; code: string; name: string; path: string } | null;
  evaluationCase: { id: string; key: string; name: string } | null;
  createdBy: { id: string; displayName: string; username: string };
  analyzedBy: { id: string; displayName: string; username: string } | null;
  appliedBy: { id: string; displayName: string; username: string } | null;
  appliedProfile: CustomerServiceAppliedCalibrationProfile | null;
}

export interface CustomerServiceStrategyDraftRegressionEvidence {
  status: 'PASSED' | 'FAILED';
  strategyVersionId: string;
  totalCases: number;
  passedCases: number;
  limitedCases: number;
  failedCases: number;
  failedCaseKeys: string[];
  details?: Record<string, unknown> | null;
  recordedAt?: string;
  recordedById?: string;
}

export interface CustomerServiceCalibrationStrategyDraftResult {
  record: CustomerServiceCalibrationRecord;
  strategyDraft: {
    assetId: string;
    assetKey?: string;
    versionId: string;
    versionNo?: number;
    status: 'DRAFT' | 'REGRESSION_PASSED';
    reused: boolean;
  };
}

export interface CustomerServiceCalibrationStrategyRegressionResult {
  record: CustomerServiceCalibrationRecord;
  regression: CustomerServiceStrategyDraftRegressionEvidence;
  publishAllowed: boolean;
}

export interface CustomerServiceCalibrationStrategyPublishResult {
  record: CustomerServiceCalibrationRecord;
  version: {
    id: string;
    status: string;
    reused?: boolean;
  };
}

export interface CustomerServiceCalibrationCurrentReplyApplication {
  applicable: boolean;
  applied: boolean;
  source: 'TUNING' | 'ROBOT_TEST_DM' | null;
  sessionId: string | null;
  replyTraceId: string | null;
  messageIds: string[];
  content: string | null;
  stateRevision: number | null;
  reason:
    | 'APPLIED'
    | 'ALREADY_APPLIED'
    | 'NOT_TEST_SOURCE'
    | 'TARGET_NOT_CURRENT'
    | 'TARGET_NOT_FOUND'
    | 'STATE_TARGET_NOT_FOUND'
    | 'SESSION_NOT_FOUND'
    | 'SESSION_ARCHIVED'
    | 'APPLY_FAILED';
}

export interface CustomerServiceCalibrationApplyResult {
  record: CustomerServiceCalibrationRecord;
  profile: CustomerServiceCalibrationProfile;
  currentReply: CustomerServiceCalibrationCurrentReplyApplication;
  appliedAnalysisIteration?: number;
  appliedAnalysisVersionCount?: number;
}

export interface CustomerServiceCalibrationListResult {
  items: CustomerServiceCalibrationRecord[];
  total: number;
  page: number;
  pageSize: number;
}


export interface CustomerServiceCalibrationProfileListResult {
  items: CustomerServiceCalibrationProfile[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerServiceKnowledgeRevisionDraftCreatePayload {
  targetEntryId?: string;
  scopeType: 'ACCOUNT' | 'STORE';
  category: 'FAQ' | 'PRODUCT' | 'SERVICE_POLICY' | 'BRAND_FACT' | 'ACTIVITY' | 'OTHER';
  title: string;
  question?: string;
  content: string;
  tags?: string[];
  sourceReference?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  freshnessPolicy?: string;
}
