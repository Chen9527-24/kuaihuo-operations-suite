import { request } from '@/api/core/http';
import { isRecord, normalizePageResult, pickArray, pickNumber, pickString, type PageResult, unwrapData } from '@/utils/apiData';

export type AutoReplyModule = 'comment' | 'dm';
export type AutoReplyWorkflowMode = 'DEFAULT' | 'STRUCTURED' | 'PLAIN_CHAT';
export type CommentReplyMode = 'ALL_UNREPLIED' | 'PUBLISHER_REPLY_THREAD_ONLY';
export type CommentMatchType = 'EXACT' | 'CONTAINS' | 'FUZZY';

export interface AutoReplyPromptConfigQuery {
  tenantId?: string;
  module?: AutoReplyModule;
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AutoReplyPromptSnapshot {
  id?: string;
  module?: AutoReplyModule;
  name?: string;
  customSystemPrompt?: string;
  customUserPrompt?: string;
  forbiddenWords?: string;
  requiredWords?: string;
  replyStyle?: string;
  platformLabel?: string;
  accountPositioning?: string;
  businessProfile?: string;
  goal?: string;
  policy?: string;
  safetyPolicy?: string;
  replyLength?: number;
  maxMsgCount?: number;
  workflowMode?: AutoReplyWorkflowMode;
  workflowId?: string;
  workflowBotId?: string;
  workflowInputKey?: string;
  extraParams?: Record<string, unknown>;
}

export interface AutoReplyPromptConfig extends AutoReplyPromptSnapshot {
  id: string;
  tenantId?: string;
  module: AutoReplyModule;
  name: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutoReplyPromptConfigPayload extends Omit<AutoReplyPromptConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> {
  tenantId?: string;
}

export interface RobotAutoReplySettingPayload {
  tenantId?: string;
  module: AutoReplyModule;
  promptConfigId?: string;
  promptSnapshot?: AutoReplyPromptSnapshot;
  commentReplyMode?: CommentReplyMode;
  replyDatasetId?: string;
  enableFirstReply?: boolean;
  firstReplyContents?: string[];
  useConversationContext?: boolean;
  config?: Record<string, unknown>;
}

export interface RobotAutoReplySetting extends RobotAutoReplySettingPayload {
  id?: string;
  tenantId?: string;
  robotId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommentReplyDatasetRow {
  commentContent: string;
  replyContent: string;
  keywords?: string[];
  matchType?: CommentMatchType;
  priority?: number;
  enabled?: boolean;
}

export interface CommentReplyDatasetQuery {
  tenantId?: string;
  robotId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface CommentReplyDatasetItem {
  id: string;
  name: string;
  description?: string;
  robotId?: string;
  status?: string;
  entries?: CommentReplyDatasetRow[];
  entriesCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImportCommentReplyDatasetPayload {
  tenantId?: string;
  robotId?: string;
  name: string;
  description?: string;
  rows: CommentReplyDatasetRow[];
  defaultMatchType?: CommentMatchType;
}

export interface UpdateCommentReplyDatasetPayload {
  tenantId?: string;
  robotId?: string;
  name?: string;
  description?: string;
  rows?: CommentReplyDatasetRow[];
  defaultMatchType?: CommentMatchType;
}

export interface CommentTestReplyPayload extends AutoReplyPromptSnapshot {
  tenantId?: string;
  robotId?: string;
  aiProvider?: 'COZE' | 'DEEPSEEK';
  accountProfileId?: string;
  fallbackToCoze?: boolean;
  assetIds?: string[];
  promptConfigId?: string;
  datasetId?: string;
  userInput: string;
  platform?: string;
  postContext?: string;
  commentGoal?: string;
  commentPolicy?: string;
}

export interface CommentTestReplyResult {
  replyTraceId?: string;
  provider?: string;
  source: 'imported_dataset' | 'coze_workflow' | string;
  matched?: boolean;
  datasetId?: string;
  entryId?: string;
  reply?: string;
  commentType?: string;
  intentLevel?: string;
  judgeReason?: string;
  shouldReply?: boolean;
  skipReply?: boolean;
  skipReason?: string;
  replyStatus?: string;
  workflowMode?: AutoReplyWorkflowMode;
  workflowId?: string;
  raw?: unknown;
}

export interface DmTestReplyPayload extends AutoReplyPromptSnapshot {
  tenantId?: string;
  robotId?: string;
  aiProvider?: 'COZE' | 'DEEPSEEK';
  accountProfileId?: string;
  fallbackToCoze?: boolean;
  assetIds?: string[];
  promptConfigId?: string;
  messageContent: string;
  useConversationContext?: boolean;
  conversationId?: string;
  testSessionId?: string;
  testClientMessageId?: string;
  /** PC Robot Test isolated HVE candidate lane; formal production runtime uses HVE_ACTIVE server-side. */
  hveExecutionLane?: 'HVE3_CANDIDATE';
  platform?: string;
  conversionGoal?: string;
  contactPolicy?: string;
}

export interface HveV19ActivationDiagnostic {
  schemaVersion: 1;
  blueprintVersion: 'V1.9';
  authority: 'DIAGNOSTIC_ONLY';
  status: 'READY' | 'BLOCKED';
  ready: boolean;
  blockerCodes: Array<'ROLE_POSTURE_NOT_TYPED' | 'SYSTEM_GUIDELINES_MISSING' | 'SYSTEM_GUIDELINE_SEMANTICS_OUTDATED' | 'PUBLIC_RELATION_NOT_READY'>;
  rolePostureSource: 'TYPED_V1' | 'LEGACY_UNTYPED' | 'NONE';
  effectivePosture: {
    schemaVersion: 1;
    initiativeLevel: string;
    openingParticipation: string;
    followUpOffering: string;
    clarificationInitiative: string;
    guidanceInitiative: string;
    resolutionFollowThrough: string;
    salesPressure: string;
  };
  publicRelation: {
    status: 'VALID' | 'EMPTY' | 'INVALID';
    value: string | null;
    normalizedFromLegacy: boolean;
    issues: string[];
  };
  missingSystemGuidelineCodes: string[];
  semanticMismatchCodes: string[];
  issues: string[];
}

export interface HveCanonicalPlanDiagnostic {
  interactionType: string;
  answerObligation: HveAnswerObligationDiagnostic | null;
  requiredActs: string[];
  preferredActs: string[];
  optionalActs: string[];
  completion: string;
  rolePolicy: {
    authority: string;
    maneuver: string;
    addedActTypes: string[];
    removedActTypes: string[];
  } | null;
}

export interface HveAnswerObligationDiagnostic {
  authority: string;
  continuity: string;
  currentFocus: string;
  currentFocusLabel: string;
  previousFocus: string | null;
  mustAddNewInformation: boolean;
  avoidRepeat: boolean;
  evidenceState: string;
  unknownStrategy: string;
  responseTarget: {
    focus: string;
    requestedSpecificity: string;
    unresolvedNeed: string | null;
    priorCoverage: string;
    requiredDelta: string;
    knowledgeRequirement: string;
    source: string;
    confidence: number;
    evidence: string[];
  } | null;
}

export interface HveTurnCompositionDiagnostic {
  authority: 'REALIZATION_ONLY';
  semanticDelta: HveAnswerObligationDiagnostic;
  beats: string[];
  preferredMessageSegments: number;
  maxMessageSegments: number;
  segmentation: string;
  eachSegmentNeedsNewValue: boolean;
  segmentPlan: Array<{
    index: number;
    purposes: string[];
    roleSignals: string[];
    mustCarryNewValue: boolean;
  }>;
}

export interface HveRoleParticipationDiagnostic {
  schemaVersion: number;
  authority: 'REALIZATION_ONLY';
  participationMode: string;
  ownershipLevel: string;
  continuityMode: string;
  initiativeRealization: string;
  rolePresence: string;
  turnManeuver: string;
  questionDisposition: string;
  guidanceDisposition: string;
  roleBehavior: {
    authority: 'REALIZATION_ONLY';
    responsePriority: string;
    judgmentStyle: string;
    relationshipStance: string;
    questionThreshold: string;
    adviceMode: string;
    cadence: string;
    expressionDynamics: {
      warmth: string;
      engagement: string;
      reassurance: string;
      servicePresence: string;
    } | null;
    evidenceTargets: string[];
    sourceSignals: string[];
    behaviorSignature: string;
  } | null;
}

export interface HveRoleCapabilityContextDiagnostic {
  authority: 'ROLE_CONTEXT_ONLY';
  source: string;
  relationLabel: string | null;
  primaryScope: string | null;
  supportAreas: string[];
  serviceBoundary: string | null;
  domainLabel: string | null;
  realizationAnchor: string | null;
}

export interface HveHumanTurnObservabilityDiagnostic {
  contract: string;
  authority: string;
  realizationAuthority: string | null;
  schemaVersion: number | null;
  needAlignment: {
    authority: string | null;
    primaryContribution: string | null;
    acknowledgementRealization: string | null;
    explanationRole: string | null;
    openingBias: string | null;
    understandingProof: string | null;
    constraints: {
      preserveAllRequiredActs: boolean | null;
      cannotCreateActs: boolean | null;
      cannotChangeFactsOrPermission: boolean | null;
      noNeedRestatementAsSubstituteForValue: boolean | null;
    };
  } | null;
  sharedContext: {
    authority: string | null;
    currentTurnInformation: string | null;
    priorContext: string | null;
    referentialMode: string | null;
    referenceBasis: string | null;
    newValueStart: string | null;
    priorContributionStatus: string | null;
    priorContributionReuse: string | null;
    avoidEvaluativeReceptionBeforeValue: boolean | null;
    mustAdvanceBeyondGiven: boolean | null;
    constraints: {
      cannotCreateActs: boolean | null;
      cannotChangeFactsOrPermission: boolean | null;
      cannotInventReferents: boolean | null;
      explicitReferenceRequiresSemanticNeed: boolean | null;
    };
  } | null;
  conversationReality: {
    authority: string | null;
    privacyProjection: string | null;
    sourceAuthority: string | null;
    currentTurn: number | null;
    priorConversationMessages: number | null;
    exchange: {
      state: string | null;
      priorAssistantTurns: number | null;
    };
    continuity: {
      lastAssistantMoveAccepted: boolean | null;
      lastAssistantMoveRejected: boolean | null;
      recentRequestedDeltas: string[];
    };
    currentFeedback: {
      reception: string | null;
      handlingMode: string | null;
      strategyChangeRequired: boolean | null;
      correctionTarget: string | null;
      requestedDeltas: string[];
    };
    activeTask: {
      status: string | null;
      responsibility: string | null;
      createdTurn: number | null;
      lastActiveTurn: number | null;
      unresolvedGoalCount: number | null;
    } | null;
    relevantMemories: Array<{
      kind: string | null;
      key: string | null;
      sourceTurn: number | null;
      confidence: number | null;
    }>;
    recentSuspendedTasks: Array<{
      status: string | null;
      responsibility: string | null;
      createdTurn: number | null;
      lastActiveTurn: number | null;
    }>;
    recentAssistantMoves: Array<{
      accepted: boolean | null;
      rejected: boolean | null;
      requestedDeltas: string[];
    }>;
  } | null;
  turnShape: {
    mode: string | null;
    preferredBeats: number | null;
    maxBeats: number | null;
    acknowledgement: string | null;
    questionPlacement: string | null;
    stopBias: string | null;
  } | null;
  surfaceBudget: Record<string, unknown> | null;
  antiAiCadence: Record<string, unknown> | null;
  texture: Record<string, unknown> | null;
  adaptation: Record<string, unknown> | null;
}

export interface HveHumanityMetricDiagnostic {
  contract: string;
  authority: string;
  affectsGeneration: boolean | null;
  affectsSelectionEligibility: boolean | null;
  affectsFinalCandidate: boolean | null;
  affectsDelivery: boolean | null;
  caution: string | null;
  selectedCandidateIndex: number | null;
  humanRealizationFloor: {
    semantics: string | null;
    status: string | null;
    score: number | null;
    issueKeys: string[];
  };
  headline: {
    humanityAverageScore: number | null;
    pairwiseUtilityScore: number | null;
    personaPreferenceScore: number | null;
    status: string | null;
    highRiskKeys: string[];
  };
  roleEvidence: {
    semantics: string | null;
    status: string | null;
    score: number | null;
    positiveEvidence: string[];
    missingEvidence: string[];
    configurationFingerprint: string | null;
  };
  metrics: Array<{
    key: string;
    semantics: string | null;
    score: number | null;
    risk: string | null;
    evidence: string[];
  }>;
  semanticValue: {
    informationGainScore: number | null;
    redundantParaphraseScore: number | null;
    crossTurnInformationGainScore: number | null;
    currentTurnValueScore: number | null;
    decisionContributionKind: string | null;
    decisionContributionScore: number | null;
  };
}


export interface HveResolvedRoleDiagnostic {
  schemaVersion: number;
  authority: 'ROLE_EXPRESSION_ONLY';
  configurationFingerprint: string;
  speakerSource: string;
  speakerProfileSource: string;
  compileEvidence: string[];
  fieldSources: Array<{
    field: string;
    source: string;
    sourceKey: string;
    defaulted: boolean;
    compatibilityAlias: boolean;
  }>;
  conflictKeys: string[];
  missingFields: string[];
  defaultedFields: string[];
  accountExpression: {
    tone: string | null;
    voice: string | null;
    background: string | null;
    relationship: string | null;
  };
  channel: string | null;
}

export interface HveFinalCandidateIdentity {
  schemaVersion: number | null;
  authority: string | null;
  lexicalSha256: string;
  structuredSegmentSha256: string | null;
  segmentCount: number | null;
  structuredSegmentsAuthoritative: boolean;
  sealedAtStage: string | null;
}

export interface HveGroundingAuditDiagnostic {
  contract: string;
  authority: 'DIAGNOSTIC_ONLY' | string;
  affectsGeneration: boolean;
  affectsSelectionEligibility: boolean;
  affectsFinalCandidate: boolean;
  affectsDelivery: boolean;
  responseTarget: {
    evidenceState: string | null;
    unknownStrategy: string | null;
    knowledgeRequirement: string | null;
    factEvidence: string[];
  } | null;
  selectedKnowledge: Array<{
    id: string | null;
    title: string | null;
    entityType: string | null;
    entityKey: string | null;
    selectionReason: string | null;
    relevanceScore: number | null;
    matchEvidence: string[];
  }>;
  groundedActs: Array<{
    id: string | null;
    type: string | null;
    necessity: string | null;
    reasonCode: string | null;
    grounding: Array<{
      source: string | null;
      key: string | null;
      status: string | null;
      evidenceRefs: string[];
    }>;
  }>;
  generatedBindings: Array<{
    index: number | null;
    plannedActTypes: string[];
    allowedGroundingRefs: string[];
    provenanceAuthority: string | null;
  }>;
  allowedGroundingRefs: string[];
  conformanceDecision: string | null;
  unitChecks: Array<{
    segmentIndex: number | null;
    unitIndex: number | null;
    authorized: boolean;
    realizedActIds: string[];
    realizedGroundingRefs: string[];
    /** Server evidence, preserved without frontend authorization inference. */
    semanticUnitBindings: Record<string, unknown>[];
    semanticSpans: Record<string, unknown>[];
  }>;
  realizedGroundingRefs: string[];
  /** V17+ diagnostic-only fields not yet promoted into the stable PC schema. */
  rawExtension: Record<string, unknown>;
}

export interface HveDecisionIntegrityDiagnostic {
  contract: string;
  authority: 'DIAGNOSTIC_ONLY' | string;
  authorityEffects: {
    generation: boolean | null;
    selectionEligibility: boolean | null;
    finalCandidate: boolean | null;
    delivery: boolean | null;
    send: boolean | null;
  };
  recognition: {
    customerConstraintCount: number | null;
    constraints: Array<{
      recognitionId: string | null;
      key: string | null;
      confidence: number | null;
      evidenceFingerprints: string[];
    }>;
  };
  state: {
    relevantConstraintCount: number | null;
    relevantConstraints: Array<{
      id: string | null;
      key: string | null;
      sourceTurn: number | null;
      confidence: number | null;
      valueFingerprint: string | null;
    }>;
    canonicalExplicitFactStatus: string | null;
    canonicalExplicitFacts: Array<{
      key: string | null;
      valueFingerprint: string | null;
    }>;
  };
  planning: {
    stateGuidanceExplicitFacts: Array<{
      key: string | null;
      valueFingerprint: string | null;
    }>;
    decisionActs: Array<{
      type: string | null;
      necessity: string | null;
      reasonCode: string | null;
      knownFingerprints: string[];
    }>;
  };
}

export interface HveCandidateSelectionDiagnostic {
  selectedCandidateIndex: number | null;
  selectedReason: string | null;
  selectedCandidateIdentity: HveFinalCandidateIdentity | null;
  finalCandidateInvariant: string | null;
  candidates: Array<{
    index: number | null;
    selected: boolean;
    source: string | null;
    candidateIdentity: HveFinalCandidateIdentity | null;
    qualified: boolean;
    baseQualified: boolean;
    holdValueReady: boolean;
    selectionEligible: boolean;
    selectionIneligibilityReasons: string[];
    planStatus: string | null;
    hardStatus: string | null;
    hardIssueKeys: string[];
    planIssueKeys: string[];
    planWarningKeys: string[];
    humanTurnSurfaceStatus: string | null;
    humanTurnSurfaceIssueKeys: string[];
    semanticFulfillmentStatus: string | null;
    semanticFulfillmentScore: number | null;
    semanticFulfillmentIssueKeys: string[];
    targetCoverageStatus: string | null;
    targetCoverageScore: number | null;
    targetCoverageIssueKeys: string[];
    humanRealizationFloorStatus: string | null;
    humanRealizationFloorScore: number | null;
    humanRealizationFloorIssueKeys: string[];
    claimAuthorityStatus: string | null;
    claimAuthorityIssueKeys: string[];
    structuredSegments: Array<{
      index: number | null;
      purposes: string[];
      source: string | null;
      plannedActTypes: string[];
      allowedGroundingRefs: string[];
      provenanceAuthority: string | null;
      preview: string | null;
    }>;
    naturalnessScore: number | null;
    personaPreferenceScore: number | null;
    crossTurnInformationGainScore: number | null;
    roleTurnManeuverScore: number | null;
    roleBehaviorAlignmentScore: number | null;
    roleVoiceFidelityScore: number | null;
    speakerContinuityScore: number | null;
    conversationalTextureScore: number | null;
    aiAnswerCadenceScore: number | null;
    roleEvidenceStatus: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE' | null;
    roleEvidenceScore: number | null;
    positiveRoleEvidence: string[];
    missingRoleEvidence: string[];
  }>;
}

export interface HveActiveContextWindowDiagnostic {
  budgetApplied: boolean;
  selectionMode: 'FULL_HISTORY' | 'STATE_EVIDENCE_RECENT' | string;
  tokenBudget: number;
  estimatedTokens: number;
  estimatedCurrentMessageTokens: number;
  estimatedStateTokens: number;
  estimatedHistoryTokens: number;
  historyTokenBudget: number;
  allHistoryIncluded: boolean;
  selectedMessageCount: number;
  candidateMessageCount: number;
  physicalMessageCount: number;
  estimatedInternalStateTokens: number;
  stateProjection: string;
  evidenceRecallCount: number;
  sourceConversationCount: number;
}

export interface HveDeliveryPlanDiagnostic {
  authority: 'PRESENTATION_ONLY' | string;
  mode: 'SINGLE' | 'SEQUENTIAL' | string;
  segmentCount: number;
  cancelRemainingOnCustomerMessage: boolean;
  boundarySource: string | null;
  explicitBreakCount: number;
  explicitSegmentCount: number;
  reason: string;
  segments: Array<{
    index: number;
    delayBeforeMs: number;
    contentLength: number;
    preview: string | null;
  }>;
}

export interface DmRobotTestRuntimeError {
  errorCode: string;
  phase: string;
  errorName: string;
  errorMessage: string;
  sourceRefId?: string;
  testSessionId?: string;
  testClientMessageId?: string;
}

export interface DmTestReplyResult {
  replyTraceId?: string;
  provider?: string;
  source: 'coze_chat_workflow' | string;
  conversationId?: string;
  testSessionId?: string;
  testStateRevisionAtGeneration?: number | null;
  contextMessageCount?: number;
  activeContextWindow?: HveActiveContextWindowDiagnostic;
  hveActivation?: HveV19ActivationDiagnostic | null;
  hveGenerationKernel?: Record<string, unknown> | null;
  /** Server-owned Deep Recognition diagnostic. PC preserves it verbatim and does not reinterpret business authority. */
  hveDeepRecognition?: Record<string, unknown> | null;
  /** Phase A committed semantic-state audit. Diagnostic-only; PC must not infer or mutate Authority from it. */
  hveSemanticStateAudit?: Record<string, unknown> | null;
  /** Robot Test session persistence diagnostic projected by Core in raw.robotTestSession. */
  robotTestSessionDiagnostic?: Record<string, unknown> | null;
  /** Small server-owned runtime outcome projection used by the compact audit view. */
  runtimeOutcomeDiagnostic?: Record<string, unknown> | null;
  hvePlan?: HveCanonicalPlanDiagnostic | null;
  hveParticipation?: HveRoleParticipationDiagnostic | null;
  hveTurnComposition?: HveTurnCompositionDiagnostic | null;
  hveHumanTurnObservability?: HveHumanTurnObservabilityDiagnostic | null;
  hveFinalModelFacingHumanTurn?: Record<string, unknown> | null;
  hveHumanityMetrics?: HveHumanityMetricDiagnostic | null;
  hveDecisionIntegrity?: HveDecisionIntegrityDiagnostic | null;
  hveDeliveryPlan?: HveDeliveryPlanDiagnostic | null;
  hveRoleContext?: HveRoleCapabilityContextDiagnostic | null;
  hveResolvedRole?: HveResolvedRoleDiagnostic | null;
  hveCandidateSelection?: HveCandidateSelectionDiagnostic | null;
  hveGroundingAudit?: HveGroundingAuditDiagnostic | null;
  /** Server-owned bounded Runtime Audit envelope. Diagnostic-only; PC must never recompute Authority from it. */
  hveRuntimeAudit?: Record<string, unknown> | null;
  replies: string[];
  replyCount?: number;
  workflowMode?: AutoReplyWorkflowMode;
  workflowId?: string;
  supportsConversationContext?: boolean;
  shouldReply?: boolean;
  skipReply?: boolean;
  skipReason?: string;
  manualTakeover?: boolean;
  replyStatus?: string;
  failReason?: string;
  runtimeError?: DmRobotTestRuntimeError;
  raw?: unknown;
}

export async function listPromptConfigs(query: AutoReplyPromptConfigQuery): Promise<PageResult<AutoReplyPromptConfig>> {
  const payload = await request<unknown>({
    path: '/auto-replies/prompt-configs',
    query
  });
  const page = normalizePageResult<unknown>(payload);
  return {
    ...page,
    items: page.items.map((item) => normalizePromptConfig(item))
  };
}

export async function createPromptConfig(payload: AutoReplyPromptConfigPayload): Promise<AutoReplyPromptConfig> {
  const response = await request<unknown>({
    path: '/auto-replies/prompt-configs',
    method: 'POST',
    body: payload
  });
  return normalizePromptConfig(unwrapData(response));
}

export async function updatePromptConfig(id: string, payload: Partial<AutoReplyPromptConfigPayload>): Promise<AutoReplyPromptConfig> {
  const response = await request<unknown>({
    path: `/auto-replies/prompt-configs/${id}`,
    method: 'PATCH',
    body: payload
  });
  return normalizePromptConfig(unwrapData(response));
}

export async function removePromptConfig(id: string) {
  return request<unknown>({
    path: `/auto-replies/prompt-configs/${id}`,
    method: 'DELETE'
  });
}

export async function getRobotSetting(robotId: string, module: AutoReplyModule): Promise<RobotAutoReplySetting> {
  const response = await request<unknown>({ path: `/auto-replies/robots/${robotId}/settings/${module}` });
  return normalizeRobotSetting(unwrapData(response));
}

export async function updateRobotSetting(robotId: string, payload: RobotAutoReplySettingPayload): Promise<RobotAutoReplySetting> {
  const response = await request<unknown>({
    path: `/auto-replies/robots/${robotId}/settings`,
    method: 'PATCH',
    body: payload
  });
  return normalizeRobotSetting(unwrapData(response));
}

export async function syncRobotPromptConfig(robotId: string, payload: { module: AutoReplyModule; promptConfigId?: string; promptSnapshot?: AutoReplyPromptSnapshot }) {
  const response = await request<unknown>({
    path: `/auto-replies/robots/${robotId}/prompt-config-sync`,
    method: 'POST',
    body: payload
  });
  return normalizePromptConfig(unwrapData(response));
}

export async function listCommentReplyDatasets(query: CommentReplyDatasetQuery): Promise<PageResult<CommentReplyDatasetItem>> {
  const payload = await request<unknown>({
    path: '/auto-replies/comment/reply-datasets',
    query
  });
  const page = normalizePageResult<unknown>(payload);
  return {
    ...page,
    items: page.items.map((item) => normalizeCommentReplyDataset(item))
  };
}

export async function detailCommentReplyDataset(id: string): Promise<CommentReplyDatasetItem> {
  const response = await request<unknown>({ path: `/auto-replies/comment/reply-datasets/${id}` });
  return normalizeCommentReplyDataset(unwrapData(response));
}

export async function importCommentReplyDataset(payload: ImportCommentReplyDatasetPayload): Promise<CommentReplyDatasetItem> {
  const response = await request<unknown>({
    path: '/auto-replies/comment/reply-datasets/import',
    method: 'POST',
    body: payload
  });
  return normalizeCommentReplyDataset(unwrapData(response));
}

export async function updateCommentReplyDataset(id: string, payload: UpdateCommentReplyDatasetPayload): Promise<CommentReplyDatasetItem> {
  const response = await request<unknown>({
    path: `/auto-replies/comment/reply-datasets/${id}`,
    method: 'PATCH',
    body: payload
  });
  return normalizeCommentReplyDataset(unwrapData(response));
}

export async function removeCommentReplyDataset(id: string) {
  return request<unknown>({
    path: `/auto-replies/comment/reply-datasets/${id}`,
    method: 'DELETE'
  });
}

export async function testCommentReply(payload: CommentTestReplyPayload): Promise<CommentTestReplyResult> {
  const response = await request<unknown>({
    path: '/auto-replies/comment/test-reply',
    method: 'POST',
    body: payload
  });
  const source = unwrapData(response);
  const record = isRecord(source) ? source : {};
  const raw = isRecord(record.raw) ? record.raw : {};
  return {
    replyTraceId: pickString(record, ['replyTraceId']) || pickString(raw, ['replyTraceId']),
    provider: pickString(record, ['provider']),
    source: pickString(record, ['source']) || 'coze_workflow',
    matched: record.matched === true,
    datasetId: pickString(record, ['datasetId']),
    entryId: pickString(record, ['entryId']),
    reply: pickString(record, ['reply', 'replyContent']),
    commentType: pickString(record, ['commentType']),
    intentLevel: pickString(record, ['intentLevel']),
    judgeReason: pickString(record, ['judgeReason']),
    shouldReply: record.shouldReply === true,
    skipReply: record.skipReply === true,
    skipReason: pickString(record, ['skipReason']),
    replyStatus: pickString(record, ['replyStatus']),
    workflowMode: normalizeWorkflowMode(pickString(record, ['workflowMode'])),
    workflowId: pickString(record, ['workflowId']),
    raw: record.raw
  };
}

export async function testDmReply(payload: DmTestReplyPayload): Promise<DmTestReplyResult> {
  const response = await request<unknown>({
    path: '/auto-replies/dm/test-reply',
    method: 'POST',
    body: payload
  });
  const source = unwrapData(response);
  const record = isRecord(source) ? source : {};
  const raw = isRecord(record.raw) ? record.raw : {};
  const runtimeErrorRecord = isRecord(record.runtimeError)
    ? record.runtimeError
    : isRecord(raw.runtimeError) ? raw.runtimeError : {};
  const runtimeError = Object.keys(runtimeErrorRecord).length ? {
    errorCode: pickString(runtimeErrorRecord, ['errorCode']),
    phase: pickString(runtimeErrorRecord, ['phase']),
    errorName: pickString(runtimeErrorRecord, ['errorName']),
    errorMessage: pickString(runtimeErrorRecord, ['errorMessage']),
    sourceRefId: pickString(runtimeErrorRecord, ['sourceRefId']),
    testSessionId: pickString(runtimeErrorRecord, ['testSessionId']),
    testClientMessageId: pickString(runtimeErrorRecord, ['testClientMessageId'])
  } : undefined;
  const deepRecognitionRecord = isRecord(record.hveDeepRecognition)
    ? record.hveDeepRecognition
    : isRecord(raw.deepRecognition) ? raw.deepRecognition : null;
  const robotTestSessionRecord = isRecord(raw.robotTestSession) ? raw.robotTestSession : null;
  const semanticStateAuditRecord = isRecord(record.hveSemanticStateAudit)
    ? record.hveSemanticStateAudit
    : robotTestSessionRecord && isRecord(robotTestSessionRecord.semanticStateAudit)
      ? robotTestSessionRecord.semanticStateAudit
      : null;
  const runtimeOutcomeDiagnostic = Object.keys(raw).length ? {
    action: pickString(raw, ['action']) || null,
    messageType: pickString(raw, ['messageType']) || null,
    intentLevel: pickString(raw, ['intentLevel']) || null,
    riskLevel: pickString(raw, ['riskLevel']) || null,
    replySource: pickString(raw, ['replySource']) || null,
    qualityStatus: pickString(raw, ['qualityStatus']) || null,
    safetyStatus: pickString(raw, ['safetyStatus']) || null,
    fallbackUsed: raw.fallbackUsed === true,
  } : null;
  return {
    replyTraceId: pickString(record, ['replyTraceId']) || pickString(raw, ['replyTraceId']),
    provider: pickString(record, ['provider']),
    source: pickString(record, ['source']) || 'coze_chat_workflow',
    conversationId: pickString(record, ['conversationId', 'conversation_id']),
    testSessionId: pickString(record, ['testSessionId']),
    testStateRevisionAtGeneration: record.testStateRevisionAtGeneration == null
      ? null
      : pickNumber(record, ['testStateRevisionAtGeneration'], 0),
    contextMessageCount: pickNumber(record, ['contextMessageCount'], 0),
    activeContextWindow: normalizeHveActiveContextWindow(record.activeContextWindow),
    hveActivation: normalizeHveActivation(record.hveActivation),
    hveGenerationKernel: isRecord(record.hveGenerationKernel) ? record.hveGenerationKernel : null,
    hveDeepRecognition: deepRecognitionRecord ? { ...deepRecognitionRecord } : null,
    hveSemanticStateAudit: semanticStateAuditRecord ? { ...semanticStateAuditRecord } : null,
    robotTestSessionDiagnostic: robotTestSessionRecord ? { ...robotTestSessionRecord } : null,
    runtimeOutcomeDiagnostic,
    hvePlan: normalizeHvePlan(record.hvePlan),
    hveParticipation: normalizeHveParticipation(record.hveParticipation),
    hveTurnComposition: normalizeHveTurnComposition(record.hveTurnComposition),
    hveHumanTurnObservability: normalizeHveHumanTurnObservability(record.hveHumanTurnObservability),
    hveFinalModelFacingHumanTurn: isRecord(record.hveFinalModelFacingHumanTurn) ? record.hveFinalModelFacingHumanTurn : null,
    hveHumanityMetrics: normalizeHveHumanityMetrics(record.hveHumanityMetrics),
    hveDecisionIntegrity: normalizeHveDecisionIntegrity(record.hveDecisionIntegrity ?? raw.decisionIntegrityDiagnostics),
    hveDeliveryPlan: normalizeHveDeliveryPlan(record.hveDeliveryPlan),
    hveRoleContext: normalizeHveRoleContext(record.hveRoleContext),
    hveResolvedRole: normalizeHveResolvedRole(record.hveResolvedRole),
    hveCandidateSelection: normalizeHveCandidateSelection(record.hveCandidateSelection),
    hveGroundingAudit: normalizeHveGroundingAudit(record.hveGroundingAudit),
    hveRuntimeAudit: isRecord(record.hveRuntimeAudit)
      ? { ...record.hveRuntimeAudit }
      : isRecord(raw.runtimeAudit) ? { ...raw.runtimeAudit } : null,
    replies: pickArray<string>(record, ['replies', 'REPLIES']).map((item) => String(item)),
    replyCount: pickNumber(record, ['replyCount'], 0),
    workflowMode: normalizeWorkflowMode(pickString(record, ['workflowMode'])),
    workflowId: pickString(record, ['workflowId']),
    supportsConversationContext: record.supportsConversationContext !== false,
    shouldReply: record.shouldReply !== false,
    skipReply: record.skipReply === true,
    skipReason: pickString(record, ['skipReason']),
    manualTakeover: record.manualTakeover === true,
    replyStatus: pickString(record, ['replyStatus']),
    failReason: pickString(record, ['failReason']),
    runtimeError,
    raw: record.raw
  };
}

function normalizeHveActiveContextWindow(value: unknown): HveActiveContextWindowDiagnostic | undefined {
  if (!isRecord(value)) return undefined;
  return {
    budgetApplied: value.budgetApplied === true,
    selectionMode: pickString(value, ['selectionMode']) || '-',
    tokenBudget: pickNumber(value, ['tokenBudget'], 0),
    estimatedTokens: pickNumber(value, ['estimatedTokens'], 0),
    estimatedCurrentMessageTokens: pickNumber(value, ['estimatedCurrentMessageTokens'], 0),
    estimatedStateTokens: pickNumber(value, ['estimatedStateTokens'], 0),
    estimatedHistoryTokens: pickNumber(value, ['estimatedHistoryTokens'], 0),
    historyTokenBudget: pickNumber(value, ['historyTokenBudget'], 0),
    allHistoryIncluded: value.allHistoryIncluded === true,
    selectedMessageCount: pickNumber(value, ['selectedMessageCount'], 0),
    candidateMessageCount: pickNumber(value, ['candidateMessageCount'], 0),
    physicalMessageCount: pickNumber(value, ['physicalMessageCount'], 0),
    estimatedInternalStateTokens: pickNumber(value, ['estimatedInternalStateTokens'], 0),
    stateProjection: pickString(value, ['stateProjection']) || '-',
    evidenceRecallCount: pickNumber(value, ['evidenceRecallCount'], 0),
    sourceConversationCount: pickNumber(value, ['sourceConversationCount'], 0),
  };
}

function normalizeHveDeliveryPlan(value: unknown): HveDeliveryPlanDiagnostic | null {
  if (!isRecord(value)) return null;
  return {
    authority: pickString(value, ['authority']) || 'PRESENTATION_ONLY',
    mode: pickString(value, ['mode']) || '-',
    segmentCount: pickNumber(value, ['segmentCount'], 0),
    cancelRemainingOnCustomerMessage: value.cancelRemainingOnCustomerMessage === true,
    boundarySource: pickString(value, ['boundarySource']),
    explicitBreakCount: pickNumber(value, ['explicitBreakCount'], 0),
    explicitSegmentCount: pickNumber(value, ['explicitSegmentCount'], 0),
    reason: pickString(value, ['reason']),
    segments: pickArray<unknown>(value, ['segments']).map((item) => {
      const segment = isRecord(item) ? item : {};
      return {
        index: pickNumber(segment, ['index'], 0),
        delayBeforeMs: pickNumber(segment, ['delayBeforeMs'], 0),
        contentLength: pickNumber(segment, ['contentLength'], 0),
        preview: pickString(segment, ['preview']),
      };
    }),
  };
}

export function normalizeHveActivation(value: unknown): HveV19ActivationDiagnostic | null {
  if (!isRecord(value)) return null;
  const effective = isRecord(value.effectivePosture) ? value.effectivePosture : {};
  const publicRelation = isRecord(value.publicRelation) ? value.publicRelation : {};
  const status = pickString(value, ['status']);
  const source = pickString(value, ['rolePostureSource']);
  if (!['READY', 'BLOCKED'].includes(status)) return null;
  const blockerCodes = pickArray<unknown>(value, ['blockerCodes'])
    .map((item) => String(item))
    .filter((item) => ['ROLE_POSTURE_NOT_TYPED', 'SYSTEM_GUIDELINES_MISSING', 'SYSTEM_GUIDELINE_SEMANTICS_OUTDATED', 'PUBLIC_RELATION_NOT_READY'].includes(item)) as HveV19ActivationDiagnostic['blockerCodes'];
  const publicRelationStatus = pickString(publicRelation, ['status']);
  return {
    schemaVersion: 1,
    blueprintVersion: 'V1.9',
    authority: 'DIAGNOSTIC_ONLY',
    status: status as HveV19ActivationDiagnostic['status'],
    ready: value.ready === true,
    blockerCodes,
    rolePostureSource: (['TYPED_V1', 'LEGACY_UNTYPED', 'NONE'].includes(source) ? source : 'NONE') as HveV19ActivationDiagnostic['rolePostureSource'],
    effectivePosture: {
      schemaVersion: 1,
      initiativeLevel: pickString(effective, ['initiativeLevel']),
      openingParticipation: pickString(effective, ['openingParticipation']),
      followUpOffering: pickString(effective, ['followUpOffering']),
      clarificationInitiative: pickString(effective, ['clarificationInitiative']),
      guidanceInitiative: pickString(effective, ['guidanceInitiative']),
      resolutionFollowThrough: pickString(effective, ['resolutionFollowThrough']),
      salesPressure: pickString(effective, ['salesPressure']),
    },
    publicRelation: {
      status: (['VALID', 'EMPTY', 'INVALID'].includes(publicRelationStatus) ? publicRelationStatus : 'EMPTY') as HveV19ActivationDiagnostic['publicRelation']['status'],
      value: pickString(publicRelation, ['value']) || null,
      normalizedFromLegacy: publicRelation.normalizedFromLegacy === true,
      issues: pickArray<unknown>(publicRelation, ['issues']).map((item) => String(item)),
    },
    missingSystemGuidelineCodes: pickArray<unknown>(value, ['missingSystemGuidelineCodes']).map((item) => String(item)),
    semanticMismatchCodes: pickArray<unknown>(value, ['semanticMismatchCodes']).map((item) => String(item)),
    issues: pickArray<unknown>(value, ['issues']).map((item) => String(item)),
  };
}

function nullableNumber(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? Number(record[key]) : null;
}

function nullableBoolean(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'boolean' ? Boolean(record[key]) : null;
}

function stringArray(record: Record<string, unknown>, key: string) {
  return pickArray<unknown>(record, [key]).map((item) => String(item));
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function normalizeHveHumanTurnObservability(value: unknown): HveHumanTurnObservabilityDiagnostic | null {
  if (!isRecord(value)) return null;
  const needAlignment = isRecord(value.needAlignment) ? value.needAlignment : null;
  const constraints = needAlignment && isRecord(needAlignment.constraints) ? needAlignment.constraints : {};
  const sharedContext = isRecord(value.sharedContext) ? value.sharedContext : null;
  const sharedContextConstraints = sharedContext && isRecord(sharedContext.constraints) ? sharedContext.constraints : {};
  const conversationReality = isRecord(value.conversationReality) ? value.conversationReality : null;
  const exchange = conversationReality && isRecord(conversationReality.exchange) ? conversationReality.exchange : {};
  const continuity = conversationReality && isRecord(conversationReality.continuity) ? conversationReality.continuity : {};
  const currentFeedback = conversationReality && isRecord(conversationReality.currentFeedback) ? conversationReality.currentFeedback : {};
  const activeTask = conversationReality && isRecord(conversationReality.activeTask) ? conversationReality.activeTask : null;
  const turnShape = isRecord(value.turnShape) ? value.turnShape : null;
  return {
    contract: pickString(value, ['contract']),
    authority: pickString(value, ['authority']),
    realizationAuthority: pickString(value, ['realizationAuthority']) || null,
    schemaVersion: nullableNumber(value, 'schemaVersion'),
    needAlignment: needAlignment ? {
      authority: pickString(needAlignment, ['authority']) || null,
      primaryContribution: pickString(needAlignment, ['primaryContribution']) || null,
      acknowledgementRealization: pickString(needAlignment, ['acknowledgementRealization']) || null,
      explanationRole: pickString(needAlignment, ['explanationRole']) || null,
      openingBias: pickString(needAlignment, ['openingBias']) || null,
      understandingProof: pickString(needAlignment, ['understandingProof']) || null,
      constraints: {
        preserveAllRequiredActs: nullableBoolean(constraints, 'preserveAllRequiredActs'),
        cannotCreateActs: nullableBoolean(constraints, 'cannotCreateActs'),
        cannotChangeFactsOrPermission: nullableBoolean(constraints, 'cannotChangeFactsOrPermission'),
        noNeedRestatementAsSubstituteForValue: nullableBoolean(constraints, 'noNeedRestatementAsSubstituteForValue')
      }
    } : null,
    sharedContext: sharedContext ? {
      authority: pickString(sharedContext, ['authority']) || null,
      currentTurnInformation: pickString(sharedContext, ['currentTurnInformation']) || null,
      priorContext: pickString(sharedContext, ['priorContext']) || null,
      referentialMode: pickString(sharedContext, ['referentialMode']) || null,
      referenceBasis: pickString(sharedContext, ['referenceBasis']) || null,
      newValueStart: pickString(sharedContext, ['newValueStart']) || null,
      priorContributionStatus: pickString(sharedContext, ['priorContributionStatus']) || null,
      priorContributionReuse: pickString(sharedContext, ['priorContributionReuse']) || null,
      avoidEvaluativeReceptionBeforeValue: nullableBoolean(sharedContext, 'avoidEvaluativeReceptionBeforeValue'),
      mustAdvanceBeyondGiven: nullableBoolean(sharedContext, 'mustAdvanceBeyondGiven'),
      constraints: {
        cannotCreateActs: nullableBoolean(sharedContextConstraints, 'cannotCreateActs'),
        cannotChangeFactsOrPermission: nullableBoolean(sharedContextConstraints, 'cannotChangeFactsOrPermission'),
        cannotInventReferents: nullableBoolean(sharedContextConstraints, 'cannotInventReferents'),
        explicitReferenceRequiresSemanticNeed: nullableBoolean(sharedContextConstraints, 'explicitReferenceRequiresSemanticNeed')
      }
    } : null,
    conversationReality: conversationReality ? {
      authority: pickString(conversationReality, ['authority']) || null,
      privacyProjection: pickString(conversationReality, ['privacyProjection']) || null,
      sourceAuthority: pickString(conversationReality, ['sourceAuthority']) || null,
      currentTurn: nullableNumber(conversationReality, 'currentTurn'),
      priorConversationMessages: nullableNumber(conversationReality, 'priorConversationMessages'),
      exchange: {
        state: pickString(exchange, ['state']) || null,
        priorAssistantTurns: nullableNumber(exchange, 'priorAssistantTurns')
      },
      continuity: {
        lastAssistantMoveAccepted: nullableBoolean(continuity, 'lastAssistantMoveAccepted'),
        lastAssistantMoveRejected: nullableBoolean(continuity, 'lastAssistantMoveRejected'),
        recentRequestedDeltas: stringArray(continuity, 'recentRequestedDeltas')
      },
      currentFeedback: {
        reception: pickString(currentFeedback, ['reception']) || null,
        handlingMode: pickString(currentFeedback, ['handlingMode']) || null,
        strategyChangeRequired: nullableBoolean(currentFeedback, 'strategyChangeRequired'),
        correctionTarget: pickString(currentFeedback, ['correctionTarget']) || null,
        requestedDeltas: stringArray(currentFeedback, 'requestedDeltas')
      },
      activeTask: activeTask ? {
        status: pickString(activeTask, ['status']) || null,
        responsibility: pickString(activeTask, ['responsibility']) || null,
        createdTurn: nullableNumber(activeTask, 'createdTurn'),
        lastActiveTurn: nullableNumber(activeTask, 'lastActiveTurn'),
        unresolvedGoalCount: nullableNumber(activeTask, 'unresolvedGoalCount')
      } : null,
      relevantMemories: pickArray<unknown>(conversationReality, ['relevantMemories']).filter(isRecord).map((item) => ({
        kind: pickString(item, ['kind']) || null,
        key: pickString(item, ['key']) || null,
        sourceTurn: nullableNumber(item, 'sourceTurn'),
        confidence: nullableNumber(item, 'confidence')
      })),
      recentSuspendedTasks: pickArray<unknown>(conversationReality, ['recentSuspendedTasks']).filter(isRecord).map((item) => ({
        status: pickString(item, ['status']) || null,
        responsibility: pickString(item, ['responsibility']) || null,
        createdTurn: nullableNumber(item, 'createdTurn'),
        lastActiveTurn: nullableNumber(item, 'lastActiveTurn')
      })),
      recentAssistantMoves: pickArray<unknown>(conversationReality, ['recentAssistantMoves']).filter(isRecord).map((item) => ({
        accepted: nullableBoolean(item, 'accepted'),
        rejected: nullableBoolean(item, 'rejected'),
        requestedDeltas: stringArray(item, 'requestedDeltas')
      }))
    } : null,
    turnShape: turnShape ? {
      mode: pickString(turnShape, ['mode']) || null,
      preferredBeats: nullableNumber(turnShape, 'preferredBeats'),
      maxBeats: nullableNumber(turnShape, 'maxBeats'),
      acknowledgement: pickString(turnShape, ['acknowledgement']) || null,
      questionPlacement: pickString(turnShape, ['questionPlacement']) || null,
      stopBias: pickString(turnShape, ['stopBias']) || null
    } : null,
    surfaceBudget: nullableRecord(value.surfaceBudget),
    antiAiCadence: nullableRecord(value.antiAiCadence),
    texture: nullableRecord(value.texture),
    adaptation: nullableRecord(value.adaptation)
  };
}

export function normalizeHveHumanityMetrics(value: unknown): HveHumanityMetricDiagnostic | null {
  if (!isRecord(value)) return null;
  const floor = isRecord(value.humanRealizationFloor) ? value.humanRealizationFloor : {};
  const headline = isRecord(value.headline) ? value.headline : {};
  const roleEvidence = isRecord(value.roleEvidence) ? value.roleEvidence : {};
  const semanticValue = isRecord(value.semanticValue) ? value.semanticValue : {};
  return {
    contract: pickString(value, ['contract']),
    authority: pickString(value, ['authority']),
    affectsGeneration: nullableBoolean(value, 'affectsGeneration'),
    affectsSelectionEligibility: nullableBoolean(value, 'affectsSelectionEligibility'),
    affectsFinalCandidate: nullableBoolean(value, 'affectsFinalCandidate'),
    affectsDelivery: nullableBoolean(value, 'affectsDelivery'),
    caution: pickString(value, ['caution']) || null,
    selectedCandidateIndex: nullableNumber(value, 'selectedCandidateIndex'),
    humanRealizationFloor: {
      semantics: pickString(floor, ['semantics']) || null,
      status: pickString(floor, ['status']) || null,
      score: nullableNumber(floor, 'score'),
      issueKeys: stringArray(floor, 'issueKeys')
    },
    headline: {
      humanityAverageScore: nullableNumber(headline, 'humanityAverageScore'),
      pairwiseUtilityScore: nullableNumber(headline, 'pairwiseUtilityScore'),
      personaPreferenceScore: nullableNumber(headline, 'personaPreferenceScore'),
      status: pickString(headline, ['status']) || null,
      highRiskKeys: stringArray(headline, 'highRiskKeys')
    },
    roleEvidence: {
      semantics: pickString(roleEvidence, ['semantics']) || null,
      status: pickString(roleEvidence, ['status']) || null,
      score: nullableNumber(roleEvidence, 'score'),
      positiveEvidence: stringArray(roleEvidence, 'positiveEvidence'),
      missingEvidence: stringArray(roleEvidence, 'missingEvidence'),
      configurationFingerprint: pickString(roleEvidence, ['configurationFingerprint']) || null
    },
    metrics: pickArray<unknown>(value, ['metrics']).filter(isRecord).map((item) => ({
      key: pickString(item, ['key']),
      semantics: pickString(item, ['semantics']) || null,
      score: nullableNumber(item, 'score'),
      risk: pickString(item, ['risk']) || null,
      evidence: stringArray(item, 'evidence')
    })),
    semanticValue: {
      informationGainScore: nullableNumber(semanticValue, 'informationGainScore'),
      redundantParaphraseScore: nullableNumber(semanticValue, 'redundantParaphraseScore'),
      crossTurnInformationGainScore: nullableNumber(semanticValue, 'crossTurnInformationGainScore'),
      currentTurnValueScore: nullableNumber(semanticValue, 'currentTurnValueScore'),
      decisionContributionKind: pickString(semanticValue, ['decisionContributionKind']) || null,
      decisionContributionScore: nullableNumber(semanticValue, 'decisionContributionScore')
    }
  };
}

function normalizeHvePlan(value: unknown): HveCanonicalPlanDiagnostic | null {
  if (!isRecord(value)) return null;
  return {
    interactionType: pickString(value, ['interactionType']),
    answerObligation: normalizeHveAnswerObligation(value.answerObligation),
    requiredActs: pickArray<unknown>(value, ['requiredActs']).map((item) => String(item)),
    preferredActs: pickArray<unknown>(value, ['preferredActs']).map((item) => String(item)),
    optionalActs: pickArray<unknown>(value, ['optionalActs']).map((item) => String(item)),
    completion: pickString(value, ['completion']),
    rolePolicy: isRecord(value.rolePolicy) ? {
      authority: pickString(value.rolePolicy, ['authority']),
      maneuver: pickString(value.rolePolicy, ['maneuver']),
      addedActTypes: pickArray<unknown>(value.rolePolicy, ['addedActTypes']).map((item) => String(item)),
      removedActTypes: pickArray<unknown>(value.rolePolicy, ['removedActTypes']).map((item) => String(item)),
    } : null,
  };
}

function normalizeHveAnswerObligation(value: unknown): HveAnswerObligationDiagnostic | null {
  if (!isRecord(value)) return null;
  return {
    authority: pickString(value, ['authority']),
    continuity: pickString(value, ['continuity']),
    currentFocus: pickString(value, ['currentFocus']),
    currentFocusLabel: pickString(value, ['currentFocusLabel']),
    previousFocus: pickString(value, ['previousFocus']) || null,
    mustAddNewInformation: value.mustAddNewInformation === true,
    avoidRepeat: value.avoidRepeat === true,
    evidenceState: pickString(value, ['evidenceState']),
    unknownStrategy: pickString(value, ['unknownStrategy']),
    responseTarget: isRecord(value.responseTarget) ? {
      focus: pickString(value.responseTarget, ['focus']),
      requestedSpecificity: pickString(value.responseTarget, ['requestedSpecificity']),
      unresolvedNeed: pickString(value.responseTarget, ['unresolvedNeed']) || null,
      priorCoverage: pickString(value.responseTarget, ['priorCoverage']),
      requiredDelta: pickString(value.responseTarget, ['requiredDelta']),
      knowledgeRequirement: pickString(value.responseTarget, ['knowledgeRequirement']),
      source: pickString(value.responseTarget, ['source']),
      confidence: pickNumber(value.responseTarget, ['confidence'], 0),
      evidence: pickArray<unknown>(value.responseTarget, ['evidence']).map((item) => String(item)),
    } : null,
  };
}

function normalizeHveTurnComposition(value: unknown): HveTurnCompositionDiagnostic | null {
  if (!isRecord(value) || value.authority !== 'REALIZATION_ONLY') return null;
  const semanticDelta = normalizeHveAnswerObligation(value.semanticDelta);
  if (!semanticDelta) return null;
  return {
    authority: 'REALIZATION_ONLY',
    semanticDelta,
    beats: pickArray<unknown>(value, ['beats']).map((item) => String(item)),
    preferredMessageSegments: pickNumber(value, ['preferredMessageSegments'], 1),
    maxMessageSegments: pickNumber(value, ['maxMessageSegments'], 1),
    segmentation: pickString(value, ['segmentation']),
    eachSegmentNeedsNewValue: value.eachSegmentNeedsNewValue !== false,
    segmentPlan: pickArray<unknown>(value, ['segmentPlan']).filter(isRecord).map((segment) => ({
      index: pickNumber(segment, ['index'], 0),
      purposes: pickArray<unknown>(segment, ['purposes']).map((item) => String(item)),
      roleSignals: pickArray<unknown>(segment, ['roleSignals']).map((item) => String(item)),
      mustCarryNewValue: segment.mustCarryNewValue !== false,
    })),
  };
}

function normalizeHveParticipation(value: unknown): HveRoleParticipationDiagnostic | null {
  if (!isRecord(value) || value.authority !== 'REALIZATION_ONLY') return null;
  const roleBehavior = isRecord(value.roleBehavior) ? value.roleBehavior : null;
  return {
    schemaVersion: pickNumber(value, ['schemaVersion'], 1),
    authority: 'REALIZATION_ONLY',
    participationMode: pickString(value, ['participationMode']),
    ownershipLevel: pickString(value, ['ownershipLevel']),
    continuityMode: pickString(value, ['continuityMode']),
    initiativeRealization: pickString(value, ['initiativeRealization']),
    rolePresence: pickString(value, ['rolePresence']),
    turnManeuver: pickString(value, ['turnManeuver']),
    questionDisposition: pickString(value, ['questionDisposition']),
    guidanceDisposition: pickString(value, ['guidanceDisposition']),
    roleBehavior: roleBehavior ? {
      authority: 'REALIZATION_ONLY',
      responsePriority: pickString(roleBehavior, ['responsePriority']),
      judgmentStyle: pickString(roleBehavior, ['judgmentStyle']),
      relationshipStance: pickString(roleBehavior, ['relationshipStance']),
      questionThreshold: pickString(roleBehavior, ['questionThreshold']),
      adviceMode: pickString(roleBehavior, ['adviceMode']),
      cadence: pickString(roleBehavior, ['cadence']),
      expressionDynamics: isRecord(roleBehavior.expressionDynamics) ? {
        warmth: pickString(roleBehavior.expressionDynamics, ['warmth']),
        engagement: pickString(roleBehavior.expressionDynamics, ['engagement']),
        reassurance: pickString(roleBehavior.expressionDynamics, ['reassurance']),
        servicePresence: pickString(roleBehavior.expressionDynamics, ['servicePresence']),
      } : null,
      evidenceTargets: pickArray<unknown>(roleBehavior, ['evidenceTargets']).map((item) => String(item)),
      sourceSignals: pickArray<unknown>(roleBehavior, ['sourceSignals']).map((item) => String(item)),
      behaviorSignature: pickString(roleBehavior, ['behaviorSignature']),
    } : null,
  };
}

function normalizeHveRoleContext(value: unknown): HveRoleCapabilityContextDiagnostic | null {
  if (!isRecord(value) || value.authority !== 'ROLE_CONTEXT_ONLY') return null;
  return {
    authority: 'ROLE_CONTEXT_ONLY',
    source: pickString(value, ['source']),
    relationLabel: pickString(value, ['relationLabel']) || null,
    primaryScope: pickString(value, ['primaryScope']) || null,
    supportAreas: pickArray<unknown>(value, ['supportAreas']).map((item) => String(item)),
    serviceBoundary: pickString(value, ['serviceBoundary']) || null,
    domainLabel: pickString(value, ['domainLabel']) || null,
    realizationAnchor: pickString(value, ['realizationAnchor']) || null,
  };
}


function normalizeHveResolvedRole(value: unknown): HveResolvedRoleDiagnostic | null {
  if (!isRecord(value) || value.authority !== 'ROLE_EXPRESSION_ONLY') return null;
  const account = isRecord(value.accountExpression) ? value.accountExpression : {};
  return {
    schemaVersion: pickNumber(value, ['schemaVersion'], 1),
    authority: 'ROLE_EXPRESSION_ONLY',
    configurationFingerprint: pickString(value, ['configurationFingerprint']),
    speakerSource: pickString(value, ['speakerSource']),
    speakerProfileSource: pickString(value, ['speakerProfileSource']),
    compileEvidence: pickArray<unknown>(value, ['compileEvidence']).map((item) => String(item)),
    fieldSources: pickArray<unknown>(value, ['fieldSources']).filter(isRecord).map((item) => ({
      field: pickString(item, ['field']),
      source: pickString(item, ['source']),
      sourceKey: pickString(item, ['sourceKey']),
      defaulted: item.defaulted === true,
      compatibilityAlias: item.compatibilityAlias === true,
    })),
    conflictKeys: pickArray<unknown>(value, ['conflictKeys']).map((item) => String(item)),
    missingFields: pickArray<unknown>(value, ['missingFields']).map((item) => String(item)),
    defaultedFields: pickArray<unknown>(value, ['defaultedFields']).map((item) => String(item)),
    accountExpression: {
      tone: pickString(account, ['tone']) || null,
      voice: pickString(account, ['voice']) || null,
      background: pickString(account, ['background']) || null,
      relationship: pickString(account, ['relationship']) || null,
    },
    channel: pickString(value, ['channel']) || null,
  };
}

function normalizeFinalCandidateIdentity(value: unknown): HveFinalCandidateIdentity | null {
  if (!isRecord(value) || typeof value.lexicalSha256 !== 'string' || !value.lexicalSha256) return null;
  return {
    schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : null,
    authority: pickString(value, ['authority']) || null,
    lexicalSha256: value.lexicalSha256,
    structuredSegmentSha256: pickString(value, ['structuredSegmentSha256']) || null,
    segmentCount: typeof value.segmentCount === 'number' ? value.segmentCount : null,
    structuredSegmentsAuthoritative: value.structuredSegmentsAuthoritative === true,
    sealedAtStage: pickString(value, ['sealedAtStage']) || null,
  };
}

function normalizeHveGroundingAudit(raw: unknown): HveGroundingAuditDiagnostic | null {
  if (!isRecord(raw)) return null;
  const responseTarget = isRecord(raw.responseTarget) ? raw.responseTarget : null;
  const selectedKnowledge = pickArray<unknown>(raw, ['selectedKnowledge']).filter(isRecord).map((entry) => ({
    id: pickString(entry, ['id']) || null,
    title: pickString(entry, ['title']) || null,
    entityType: pickString(entry, ['entityType']) || null,
    entityKey: pickString(entry, ['entityKey']) || null,
    selectionReason: pickString(entry, ['selectionReason']) || null,
    relevanceScore: typeof entry.relevanceScore === 'number' ? entry.relevanceScore : null,
    matchEvidence: pickArray<unknown>(entry, ['matchEvidence']).map((item) => String(item))
  }));
  const groundedActs = pickArray<unknown>(raw, ['groundedActs']).filter(isRecord).map((act) => ({
    id: pickString(act, ['id']) || null,
    type: pickString(act, ['type']) || null,
    necessity: pickString(act, ['necessity']) || null,
    reasonCode: pickString(act, ['reasonCode']) || null,
    grounding: pickArray<unknown>(act, ['grounding']).filter(isRecord).map((grounding) => ({
      source: pickString(grounding, ['source']) || null,
      key: pickString(grounding, ['key']) || null,
      status: pickString(grounding, ['status']) || null,
      evidenceRefs: pickArray<unknown>(grounding, ['evidenceRefs']).map((item) => String(item))
    }))
  }));
  const generatedBindings = pickArray<unknown>(raw, ['generatedBindings']).filter(isRecord).map((binding) => ({
    index: typeof binding.index === 'number' ? binding.index : null,
    plannedActTypes: pickArray<unknown>(binding, ['plannedActTypes']).map((item) => String(item)),
    allowedGroundingRefs: pickArray<unknown>(binding, ['allowedGroundingRefs']).map((item) => String(item)),
    provenanceAuthority: pickString(binding, ['provenanceAuthority']) || null
  }));
  const unitChecks = pickArray<unknown>(raw, ['unitChecks']).filter(isRecord).map((unit) => ({
    segmentIndex: typeof unit.segmentIndex === 'number' ? unit.segmentIndex : null,
    unitIndex: typeof unit.unitIndex === 'number' ? unit.unitIndex : null,
    semanticUnitBindings: pickArray<unknown>(unit, ['semanticUnitBindings']).filter(isRecord).map((item) => ({ ...item })),
    semanticSpans: pickArray<unknown>(unit, ['semanticSpans']).filter(isRecord).map((item) => ({ ...item })),
    authorized: unit.authorized === true,
    realizedActIds: pickArray<unknown>(unit, ['realizedActIds']).map((item) => String(item)),
    realizedGroundingRefs: pickArray<unknown>(unit, ['realizedGroundingRefs']).map((item) => String(item))
  }));
  const knownGroundingAuditKeys = new Set([
    'contract', 'authority', 'affectsGeneration', 'affectsSelectionEligibility',
    'affectsFinalCandidate', 'affectsDelivery', 'responseTarget', 'selectedKnowledge',
    'groundedActs', 'generatedBindings', 'allowedGroundingRefs', 'conformanceDecision',
    'unitChecks', 'realizedGroundingRefs'
  ]);
  const rawExtension = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !knownGroundingAuditKeys.has(key))
  );
  return {
    contract: pickString(raw, ['contract']) || 'R2_2_GROUNDING_PROVENANCE_AUDIT_V1',
    authority: pickString(raw, ['authority']) || 'DIAGNOSTIC_ONLY',
    affectsGeneration: raw.affectsGeneration === true,
    affectsSelectionEligibility: raw.affectsSelectionEligibility === true,
    affectsFinalCandidate: raw.affectsFinalCandidate === true,
    affectsDelivery: raw.affectsDelivery === true,
    responseTarget: responseTarget ? {
      evidenceState: pickString(responseTarget, ['evidenceState']) || null,
      unknownStrategy: pickString(responseTarget, ['unknownStrategy']) || null,
      knowledgeRequirement: pickString(responseTarget, ['knowledgeRequirement']) || null,
      factEvidence: pickArray<unknown>(responseTarget, ['factEvidence']).map((item) => String(item))
    } : null,
    selectedKnowledge,
    groundedActs,
    generatedBindings,
    allowedGroundingRefs: pickArray<unknown>(raw, ['allowedGroundingRefs']).map((item) => String(item)),
    conformanceDecision: pickString(raw, ['conformanceDecision']) || null,
    unitChecks,
    realizedGroundingRefs: pickArray<unknown>(raw, ['realizedGroundingRefs']).map((item) => String(item)),
    rawExtension
  };
}

function normalizeHveDecisionIntegrity(value: unknown): HveDecisionIntegrityDiagnostic | null {
  if (!isRecord(value)) return null;
  const authorityEffects = isRecord(value.authorityEffects) ? value.authorityEffects : {};
  const recognition = isRecord(value.recognition) ? value.recognition : {};
  const state = isRecord(value.state) ? value.state : {};
  const planning = isRecord(value.planning) ? value.planning : {};
  return {
    contract: pickString(value, ['contract']),
    authority: pickString(value, ['authority']) || 'DIAGNOSTIC_ONLY',
    authorityEffects: {
      generation: nullableBoolean(authorityEffects, 'generation'),
      selectionEligibility: nullableBoolean(authorityEffects, 'selectionEligibility'),
      finalCandidate: nullableBoolean(authorityEffects, 'finalCandidate'),
      delivery: nullableBoolean(authorityEffects, 'delivery'),
      send: nullableBoolean(authorityEffects, 'send'),
    },
    recognition: {
      customerConstraintCount: typeof recognition.customerConstraintCount === 'number' ? recognition.customerConstraintCount : null,
      constraints: pickArray<unknown>(recognition, ['constraints']).filter(isRecord).map((item) => ({
        recognitionId: pickString(item, ['recognitionId']) || null,
        key: pickString(item, ['key']) || null,
        confidence: typeof item.confidence === 'number' ? item.confidence : null,
        evidenceFingerprints: pickArray<unknown>(item, ['evidenceFingerprints']).map((entry) => String(entry)),
      })),
    },
    state: {
      relevantConstraintCount: typeof state.relevantConstraintCount === 'number' ? state.relevantConstraintCount : null,
      relevantConstraints: pickArray<unknown>(state, ['relevantConstraints']).filter(isRecord).map((item) => ({
        id: pickString(item, ['id']) || null,
        key: pickString(item, ['key']) || null,
        sourceTurn: typeof item.sourceTurn === 'number' ? item.sourceTurn : null,
        confidence: typeof item.confidence === 'number' ? item.confidence : null,
        valueFingerprint: pickString(item, ['valueFingerprint']) || null,
      })),
      canonicalExplicitFactStatus: pickString(state, ['canonicalExplicitFactStatus']) || null,
      canonicalExplicitFacts: pickArray<unknown>(state, ['canonicalExplicitFacts']).filter(isRecord).map((item) => ({
        key: pickString(item, ['key']) || null,
        valueFingerprint: pickString(item, ['valueFingerprint']) || null,
      })),
    },
    planning: {
      stateGuidanceExplicitFacts: pickArray<unknown>(planning, ['stateGuidanceExplicitFacts']).filter(isRecord).map((item) => ({
        key: pickString(item, ['key']) || null,
        valueFingerprint: pickString(item, ['valueFingerprint']) || null,
      })),
      decisionActs: pickArray<unknown>(planning, ['decisionActs']).filter(isRecord).map((item) => ({
        type: pickString(item, ['type']) || null,
        necessity: pickString(item, ['necessity']) || null,
        reasonCode: pickString(item, ['reasonCode']) || null,
        knownFingerprints: pickArray<unknown>(item, ['knownFingerprints']).map((entry) => String(entry)),
      })),
    },
  };
}

function normalizeHveCandidateSelection(value: unknown): HveCandidateSelectionDiagnostic | null {
  if (!isRecord(value)) return null;
  const candidates = pickArray<unknown>(value, ['candidates'])
    .filter(isRecord)
    .map((candidate) => ({
      index: typeof candidate.index === 'number' ? candidate.index : null,
      selected: candidate.selected === true,
      source: pickString(candidate, ['source']) || null,
      candidateIdentity: normalizeFinalCandidateIdentity(candidate.candidateIdentity),
      qualified: candidate.qualified === true,
      baseQualified: candidate.baseQualified === true || candidate.qualified === true,
      holdValueReady: candidate.holdValueReady === true,
      selectionEligible: candidate.selectionEligible === true,
      selectionIneligibilityReasons: pickArray<unknown>(candidate, ['selectionIneligibilityReasons']).map((item) => String(item)),
      planStatus: pickString(candidate, ['planStatus']) || null,
      hardStatus: pickString(candidate, ['hardStatus']) || null,
      hardIssueKeys: pickArray<unknown>(candidate, ['hardIssueKeys']).map((item) => String(item)),
      planIssueKeys: pickArray<unknown>(candidate, ['planIssueKeys']).map((item) => String(item)),
      planWarningKeys: pickArray<unknown>(candidate, ['planWarningKeys']).map((item) => String(item)),
      humanTurnSurfaceStatus: pickString(candidate, ['humanTurnSurfaceStatus']) || null,
      humanTurnSurfaceIssueKeys: pickArray<unknown>(candidate, ['humanTurnSurfaceIssueKeys']).map((item) => String(item)),
      semanticFulfillmentStatus: pickString(candidate, ['semanticFulfillmentStatus']) || null,
      semanticFulfillmentScore: typeof candidate.semanticFulfillmentScore === 'number' ? candidate.semanticFulfillmentScore : null,
      semanticFulfillmentIssueKeys: pickArray<unknown>(candidate, ['semanticFulfillmentIssueKeys']).map((item) => String(item)),
      targetCoverageStatus: pickString(candidate, ['targetCoverageStatus']) || null,
      targetCoverageScore: typeof candidate.targetCoverageScore === 'number' ? candidate.targetCoverageScore : null,
      targetCoverageIssueKeys: pickArray<unknown>(candidate, ['targetCoverageIssueKeys']).map((item) => String(item)),
      humanRealizationFloorStatus: pickString(candidate, ['humanRealizationFloorStatus']) || null,
      humanRealizationFloorScore: typeof candidate.humanRealizationFloorScore === 'number' ? candidate.humanRealizationFloorScore : null,
      humanRealizationFloorIssueKeys: pickArray<unknown>(candidate, ['humanRealizationFloorIssueKeys']).map((item) => String(item)),
      claimAuthorityStatus: pickString(candidate, ['claimAuthorityStatus']) || null,
      claimAuthorityIssueKeys: pickArray<unknown>(candidate, ['claimAuthorityIssueKeys']).map((item) => String(item)),
      structuredSegments: pickArray<unknown>(candidate, ['structuredSegments']).filter(isRecord).map((segment) => ({
        index: typeof segment.index === 'number' ? segment.index : null,
        purposes: pickArray<unknown>(segment, ['purposes']).map((item) => String(item)),
        source: pickString(segment, ['source']) || null,
        plannedActTypes: pickArray<unknown>(segment, ['plannedActTypes']).map((item) => String(item)),
        allowedGroundingRefs: pickArray<unknown>(segment, ['allowedGroundingRefs']).map((item) => String(item)),
        provenanceAuthority: pickString(segment, ['provenanceAuthority']) || null,
        preview: pickString(segment, ['preview']) || null,
      })),
      naturalnessScore: typeof candidate.naturalnessScore === 'number' ? candidate.naturalnessScore : null,
      personaPreferenceScore: typeof candidate.personaPreferenceScore === 'number' ? candidate.personaPreferenceScore : null,
      crossTurnInformationGainScore: typeof candidate.crossTurnInformationGainScore === 'number' ? candidate.crossTurnInformationGainScore : null,
      roleTurnManeuverScore: typeof candidate.roleTurnManeuverScore === 'number' ? candidate.roleTurnManeuverScore : null,
      roleBehaviorAlignmentScore: typeof candidate.roleBehaviorAlignmentScore === 'number' ? candidate.roleBehaviorAlignmentScore : null,
      roleVoiceFidelityScore: typeof candidate.roleVoiceFidelityScore === 'number' ? candidate.roleVoiceFidelityScore : null,
      speakerContinuityScore: typeof candidate.speakerContinuityScore === 'number' ? candidate.speakerContinuityScore : null,
      conversationalTextureScore: typeof candidate.conversationalTextureScore === 'number' ? candidate.conversationalTextureScore : null,
      aiAnswerCadenceScore: typeof candidate.aiAnswerCadenceScore === 'number' ? candidate.aiAnswerCadenceScore : null,
      roleEvidenceStatus: ['SUFFICIENT', 'PARTIAL', 'INSUFFICIENT_EVIDENCE'].includes(pickString(candidate, ['roleEvidenceStatus']))
        ? pickString(candidate, ['roleEvidenceStatus']) as 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE'
        : null,
      roleEvidenceScore: typeof candidate.roleEvidenceScore === 'number' ? candidate.roleEvidenceScore : null,
      positiveRoleEvidence: pickArray<unknown>(candidate, ['positiveRoleEvidence']).map((item) => String(item)),
      missingRoleEvidence: pickArray<unknown>(candidate, ['missingRoleEvidence']).map((item) => String(item)),
    }));
  if (!candidates.length && value.selectedCandidateIndex == null && !value.selectedReason) return null;
  return {
    selectedCandidateIndex: typeof value.selectedCandidateIndex === 'number' ? value.selectedCandidateIndex : null,
    selectedReason: pickString(value, ['selectedReason']) || null,
    selectedCandidateIdentity: normalizeFinalCandidateIdentity(value.selectedCandidateIdentity),
    finalCandidateInvariant: pickString(value, ['finalCandidateInvariant']) || null,
    candidates,
  };
}

function normalizeWorkflowMode(value: string): AutoReplyWorkflowMode {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PLAIN_CHAT') return 'PLAIN_CHAT';
  if (normalized === 'STRUCTURED') return 'STRUCTURED';
  return 'DEFAULT';
}

function normalizePromptConfig(payload: unknown): AutoReplyPromptConfig {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  const extraParams = isRecord(record.extraParams) ? record.extraParams : {};
  return {
    id: pickString(record, ['id', '_id']),
    tenantId: pickString(record, ['tenantId']),
    module: (pickString(record, ['module']) || 'comment') as AutoReplyModule,
    name: pickString(record, ['name']) || '--',
    description: pickString(record, ['description']),
    customSystemPrompt: pickString(record, ['customSystemPrompt']),
    customUserPrompt: pickString(record, ['customUserPrompt']),
    forbiddenWords: pickString(record, ['forbiddenWords']),
    requiredWords: pickString(record, ['requiredWords']),
    replyStyle: pickString(record, ['replyStyle']),
    platformLabel: pickString(record, ['platformLabel']),
    accountPositioning: pickString(record, ['accountPositioning']),
    businessProfile: pickString(record, ['businessProfile']),
    goal: pickString(record, ['goal']),
    policy: pickString(record, ['policy']),
    safetyPolicy: pickString(record, ['safetyPolicy']),
    replyLength: pickNumber(record, ['replyLength'], 0) || undefined,
    maxMsgCount: pickNumber(record, ['maxMsgCount'], 0) || undefined,
    workflowMode: normalizeWorkflowMode(pickString(record, ['workflowMode']) || pickString(extraParams, ['WORKFLOW_MODE'])),
    workflowId: pickString(record, ['workflowId']) || pickString(extraParams, ['WORKFLOW_ID']),
    workflowBotId: pickString(record, ['workflowBotId']) || pickString(extraParams, ['WORKFLOW_BOT_ID']),
    workflowInputKey: pickString(record, ['workflowInputKey']) || pickString(extraParams, ['WORKFLOW_INPUT_KEY']) || 'input',
    extraParams,
    status: pickString(record, ['status']),
    createdAt: pickString(record, ['createdAt']),
    updatedAt: pickString(record, ['updatedAt'])
  };
}

function normalizeRobotSetting(payload: unknown): RobotAutoReplySetting {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  return {
    id: pickString(record, ['id']),
    tenantId: pickString(record, ['tenantId']),
    robotId: pickString(record, ['robotId']),
    module: (pickString(record, ['module']) || 'comment') as AutoReplyModule,
    promptConfigId: pickString(record, ['promptConfigId']),
    promptSnapshot: isRecord(record.promptSnapshot) ? record.promptSnapshot : undefined,
    commentReplyMode: pickString(record, ['commentReplyMode']) as CommentReplyMode,
    replyDatasetId: pickString(record, ['replyDatasetId']),
    enableFirstReply: record.enableFirstReply === true,
    firstReplyContents: pickArray<string>(record, ['firstReplyContents']).map((item) => String(item)),
    useConversationContext: record.useConversationContext !== false,
    config: isRecord(record.config) ? record.config : undefined,
    createdAt: pickString(record, ['createdAt']),
    updatedAt: pickString(record, ['updatedAt'])
  };
}

function normalizeCommentReplyDataset(payload: unknown): CommentReplyDatasetItem {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  const countRecord = isRecord(record._count) ? record._count : {};
  return {
    id: pickString(record, ['id']),
    name: pickString(record, ['name']) || '--',
    description: pickString(record, ['description']),
    robotId: pickString(record, ['robotId']),
    status: pickString(record, ['status']),
    entries: pickArray<CommentReplyDatasetRow>(record, ['entries']),
    entriesCount: pickNumber(countRecord, ['entries'], pickArray(record, ['entries']).length),
    createdAt: pickString(record, ['createdAt']),
    updatedAt: pickString(record, ['updatedAt'])
  };
}
