import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';
import type {
  CustomerServiceBehaviorHistoryProjection,
  CustomerServiceConversationStateSummary,
} from '@/modules/customer-service/types/simulation.types';

export type CustomerServiceReplyFeedbackValue = 'SATISFIED' | 'UNSATISFIED';

export interface CustomerServiceHumanBehaviorPreferenceExplainability {
  naturalness?: string;
  responseDensity?: string;
  colloquiality?: string;
  questionFrequency?: string;
  businessAdvance?: string;
  returningContinuity?: string;
  emoji?: string;
  identityExposure?: string;
  segmentation?: string;
}

export interface CustomerServiceHumanBehaviorDecisionExplainability {
  ruleId: string | null;
  priority: number;
  reason: string | null;
}

export interface CustomerServiceExpressionPlanExplainability {
  interactionMode?: string;
  responseDensity?: string;
  sentenceTarget?: { min?: number; max?: number };
  segmentTarget?: { min?: number; max?: number };
  maxCharacters?: number;
  acknowledgement?: string;
  selfIntroduction?: string;
  identityResponse?: string;
  openingStyle?: string;
  serviceScopeExposure?: string;
  needRestatement?: string;
  questionPolicy?: string;
  questionStyle?: string;
  businessAdvance?: string;
  historyReference?: string;
  colloquiality?: string;
  completionStyle?: string;
  emojiPolicy?: string;
  requiredActs?: string[];
  optionalActs?: string[];
  forbiddenActs?: string[];
  avoidStructureKeys?: string[];
  matchedRuleIds?: string[];
  suppressedRuleIds?: string[];
  decisionReasons?: CustomerServiceHumanBehaviorDecisionExplainability[];
  context?: Record<string, unknown>;
}

export interface CustomerServiceInteractionPlanSourceExplainability {
  kind: 'PLANNER' | 'UNDERSTANDING' | 'STATE' | 'BEHAVIOR_MEMORY' | 'RESPONSE_ASSET' | 'LEGACY_POLICY' | 'GUIDELINE' | string;
  refId?: string;
  version?: string;
}

export interface CustomerServiceInteractionPlanGroundingExplainability {
  source: 'STATE' | 'KNOWLEDGE' | 'RUNTIME_VARIABLE' | 'EXECUTION_RECEIPT' | 'RESPONSE_ASSET' | string;
  key: string;
  requirement: 'REQUIRED' | 'OPTIONAL' | string;
  status: 'SATISFIED' | 'MISSING' | 'UNKNOWN' | 'STALE' | 'CONFLICTED' | string;
  evidenceRefs?: string[];
}

export interface CustomerServiceInteractionPlanActExplainability {
  id: string;
  type: string;
  necessity: 'REQUIRED' | 'PREFERRED' | 'OPTIONAL' | string;
  priority: number;
  reasonCode: string;
  trackingKey?: string;
  dependsOnActIds?: string[];
  parameters?: {
    target?: string;
    decisionPurpose?: string;
    known?: string[];
    missing?: string[];
    expectedInformationGain?: 'NONE' | 'CONFIRM' | 'REDUCE_UNCERTAINTY' | 'ADD_GROUNDED_INFORMATION' | 'ADVANCE_REQUIRED_TASK' | string;
  };
  grounding?: CustomerServiceInteractionPlanGroundingExplainability[];
  sources?: CustomerServiceInteractionPlanSourceExplainability[];
}

export interface CustomerServiceInteractionPlanSuppressionExplainability {
  type: string;
  enforcement: 'HARD' | 'SOFT' | string;
  priority: number;
  reasonCode: string;
  sources?: CustomerServiceInteractionPlanSourceExplainability[];
}

export interface CustomerServiceInteractionPlanV2Explainability {
  schemaVersion: number;
  shadow: boolean;
  policyMode?: 'LEGACY_SHADOW' | 'GUIDELINE_SHADOW' | string;
  interactionType: string;
  goal?: { primary?: string; secondary?: string[] };
  acts?: CustomerServiceInteractionPlanActExplainability[];
  suppressedActs?: CustomerServiceInteractionPlanSuppressionExplainability[];
  grounding?: {
    requirements?: CustomerServiceInteractionPlanGroundingExplainability[];
    prohibitedUnknownFacts?: string[];
  };
  completion?: {
    mode?: string;
    conditions?: Array<{ type?: string; ref?: string }>;
    allowOptionalContinuation?: boolean;
  };
  answerObligation?: {
    schemaVersion?: number;
    authority?: string;
    continuity?: string;
    currentFocus?: string;
    currentFocusLabel?: string;
    previousFocus?: string | null;
    previousAssistantExcerpt?: string | null;
    mustAddNewInformation?: boolean;
    avoidRepeat?: boolean;
    evidenceState?: string;
    unknownStrategy?: string;
    evidence?: string[];
  };
  behaviorContext?: {
    relationshipStage?: string | null;
    recentMoveKeys?: string[];
    requestedDeltas?: string[];
    activeTaskKey?: string | null;
  };
  realizationPreferences?: Record<string, unknown>;
  sources?: CustomerServiceInteractionPlanSourceExplainability[];
  diagnostics?: {
    legacyMappings?: Array<{ source?: string; legacy?: string; canonical?: string | null; status?: string }>;
    unmappedLegacyActs?: string[];
    guidelinePolicy?: {
      resolutionHash?: string; guidelineVersionIds?: string[]; appliedDecisionCount?: number; conflictCount?: number; hasUnresolvedHardConflict?: boolean;
    };
    guidelineSkippedDecisions?: Array<{ guidelineId?: string; op?: string; act?: string; reasonCode?: string }>;
  };
}

export interface CustomerServiceHve3ObservedActExplainability {
  type?: string;
  observation?: 'OBSERVED' | 'NOT_OBSERVED' | 'UNCERTAIN' | string;
  confidence?: number;
  evidence?: string[];
  groundingRefs?: string[];
  spans?: Array<{ start?: number; end?: number; text?: string }>;
}

export interface CustomerServiceHve3ExecutionExplainability {
  envelope?: { schemaVersion?: number; lane?: string; planSchemaVersion?: number; planAvailable?: boolean; customerVisible?: boolean; reasonCode?: string } | null;
  diagnostics?: {
    executionLane?: string;
    kernel?: { id?: string; family?: string; version?: string; contentHash?: string; provider?: string };
    candidates?: Array<{
      index?: number;
      selected?: boolean;
      source?: string;
      candidateIdentity?: { lexicalSha256?: string; structuredSegmentSha256?: string | null; segmentCount?: number; structuredSegmentsAuthoritative?: boolean };
      qualified?: boolean;
      baseQualified?: boolean;
      holdValueReady?: boolean;
      selectionEligible?: boolean;
      selectionIneligibilityReasons?: string[];
      hardStatus?: string;
      planStatus?: string;
      semanticFulfillmentStatus?: string;
      semanticFulfillmentScore?: number;
      semanticFulfillmentIssueKeys?: string[];
      targetCoverageStatus?: string;
      targetCoverageScore?: number;
      targetCoverageIssueKeys?: string[];
      humanRealizationFloorStatus?: string;
      humanRealizationFloorScore?: number;
      humanRealizationFloorIssueKeys?: string[];
      claimAuthorityStatus?: string;
      claimAuthorityIssueKeys?: string[];
      structuredSegments?: Array<{ index?: number; purposes?: string[]; source?: string; preview?: string }>;
      naturalnessScore?: number;
      pairwiseUtilityScore?: number;
      personaPreferenceScore?: number;
      roleTurnManeuverScore?: number;
      roleBehaviorAlignmentScore?: number;
      roleVoiceFidelityScore?: number;
      speakerContinuityScore?: number;
      conversationalTextureScore?: number;
      aiAnswerCadenceScore?: number;
      roleEvidenceStatus?: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE' | string;
      roleEvidenceScore?: number;
      positiveRoleEvidence?: string[];
      missingRoleEvidence?: string[];
      informationGainScore?: number;
      crossTurnInformationGainScore?: number;
      currentTurnValueScore?: number;
      preferenceUsageScore?: number;
      serviceEntryValueScore?: number;
      identitySurfaceQualityScore?: number;
      decisionContributionKind?: 'NONE' | 'REFRAME_ONLY' | 'USEFUL_DIRECTION' | 'GROUNDED_FACT' | 'DECISION_REDUCTION' | 'TASK_ADVANCE' | string;
      decisionContributionScore?: number;
      knowledgeUtilizationStatus?: 'NOT_AVAILABLE' | 'AVAILABLE_NOT_OBSERVED' | 'OBSERVED_WITH_GROUNDING' | 'UNCERTAIN' | string;
      humanityHighRiskKeys?: string[];
      criticalClaimStatus?: Array<{ key?: string; status?: string }>;
      hardIssueKeys?: string[];
      planWarningKeys?: string[];
    }>;
    selectedCandidateIndex?: number | null;
    selectedCandidateIdentity?: { lexicalSha256?: string; structuredSegmentSha256?: string | null; segmentCount?: number; structuredSegmentsAuthoritative?: boolean };
    finalCandidateInvariant?: string;
    selectionPolicy?: string;
    observedActs?: CustomerServiceHve3ObservedActExplainability[];
    criticalClaims?: Array<{ key?: string; expected?: boolean; status?: string; criticality?: string; evidence?: string[]; spans?: Array<{ start?: number; end?: number; text?: string }> }>;
    nlgContextProjection?: { exposedFields?: string[]; withheldFields?: string[] };
    publicIdentityProjection?: {
      schemaVersion?: number;
      businessLabel?: string | null;
      relationLabel?: string | null;
      preferredSurfaceLabel?: string | null;
      publicName?: string | null;
      source?: string;
      allowedSurfaceLabels?: string[];
      withheldInternalLabelCount?: number;
    };
    voiceProjection?: {
      tone?: { warmth?: number | null; playfulness?: number | null; formality?: number | null; directness?: number | null; emotionalIntensity?: number | null };
      posture?: { familiarityDistance?: string; conversationalEnergy?: string; humorTolerance?: string; advicePosture?: string; supportMode?: string; recommendedStance?: string };
      accountExpression?: { tone?: string | null; voice?: string | null; background?: string | null; relationship?: string | null };
      speaker?: { source?: string; profileSource?: string; compileEvidence?: string[] };
    };
    resolvedRoleIdentity?: {
      schemaVersion?: number;
      authority?: string;
      configurationFingerprint?: string;
      speakerSource?: string;
      speakerProfileSource?: string;
      compileEvidence?: string[];
      fieldSources?: Array<{
        field?: string;
        source?: string;
        sourceKey?: string;
        defaulted?: boolean;
        compatibilityAlias?: boolean;
      }>;
      conflictKeys?: string[];
      missingFields?: string[];
      defaultedFields?: string[];
      accountExpression?: { tone?: string | null; voice?: string | null; background?: string | null; relationship?: string | null };
      storeExpression?: { brandName?: string | null; brandTone?: string | null; mainBusiness?: string | null };
      channel?: string | null;
    } | null;
    planCompliance?: { status?: string; required?: unknown[]; suppressed?: unknown[]; unexpected?: Array<{ act?: string; status?: string; evidence?: string[]; spans?: Array<{ start?: number; end?: number; text?: string }> }>; dependencies?: unknown[]; grounding?: unknown[]; completion?: Record<string, unknown>; hardFailureKeys?: string[]; warningKeys?: string[] };
    hardCompliance?: { status?: string; hardIssueKeys?: string[]; qualityIssueKeys?: string[]; planIssueKeys?: string[]; claimIssueKeys?: string[] };
    softHumanity?: {
      score?: number;
      pairwiseUtilityScore?: number;
      personaPreferenceScore?: number;
      status?: string;
      roleEvidence?: {
        status?: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE' | string;
        score?: number;
        positiveEvidence?: string[];
        missingEvidence?: string[];
      };
      warningKeys?: string[];
      highRiskKeys?: string[];
      features?: Array<{ key?: string; score?: number; risk?: string; evidence?: string[] }>;
      shouldGenerateNaturalnessCandidate?: boolean;
      semanticValue?: {
        expectedInformationGains?: string[];
        knowledgeUtilization?: { status?: string; availableEntryIds?: string[]; observedEntryIds?: string[]; expectedByActs?: string[] };
        questionValueScore?: number;
        informationGainScore?: number;
        crossTurnInformationGainScore?: number;
        redundantParaphraseScore?: number;
        serviceEntryValueScore?: number;
        identitySurfaceQualityScore?: number;
        currentTurnValueScore?: number;
        preferenceUsageScore?: number;
        decisionContributionKind?: 'NONE' | 'REFRAME_ONLY' | 'USEFUL_DIRECTION' | 'GROUNDED_FACT' | 'DECISION_REDUCTION' | 'TASK_ADVANCE' | string;
        decisionContributionScore?: number;
        roleEvidenceScore?: number;
        roleBehaviorAlignmentScore?: number;
      };
    };
    humanTurnRealization?: {
      turnComposition?: {
        authority?: string;
        semanticDelta?: {
          continuity?: string;
          currentFocus?: string;
          currentFocusLabel?: string;
          previousFocus?: string | null;
          previousAssistantExcerpt?: string | null;
          mustAddNewInformation?: boolean;
          avoidRepeat?: boolean;
          evidenceState?: string;
          unknownStrategy?: string;
          evidence?: string[];
          responseTarget?: {
            focus?: string;
            requestedSpecificity?: string;
            unresolvedNeed?: string | null;
            priorCoverage?: string;
            requiredDelta?: string;
            knowledgeRequirement?: string;
            source?: string;
            confidence?: number;
            evidence?: string[];
          } | null;
        };
        beats?: string[];
        segmentPlan?: Array<{ index?: number; purposes?: string[]; roleSignals?: string[]; mustCarryNewValue?: boolean }>;
        preferredMessageSegments?: number;
        maxMessageSegments?: number;
        segmentation?: string;
        eachSegmentNeedsNewValue?: boolean;
      };
      participation?: {
        authority?: 'REALIZATION_ONLY' | string;
        participationMode?: string;
        ownershipLevel?: string;
        continuityMode?: string;
        initiativeRealization?: string;
        rolePresence?: string;
        turnManeuver?: string;
        questionDisposition?: string;
        guidanceDisposition?: string;
        roleBehavior?: {
          authority?: 'REALIZATION_ONLY' | string;
          responsePriority?: string;
          judgmentStyle?: string;
          relationshipStance?: string;
          questionThreshold?: string;
          adviceMode?: string;
          cadence?: string;
          expressionDynamics?: {
            warmth?: string;
            engagement?: string;
            reassurance?: string;
            servicePresence?: string;
          };
          evidenceTargets?: string[];
          sourceSignals?: string[];
          behaviorSignature?: string;
        };
      };
    };
    semanticFulfillment?: {
      status?: string;
      score?: number;
      issueKeys?: string[];
      evidence?: string[];
      claimAuthority?: { status?: string; issueKeys?: string[]; evidence?: string[] };
    };
    selectedReason?: string;
    controlledDegradation?: {
      applied?: boolean;
      reason?: string;
      criticalIntent?: string;
      originalHardIssueKeys?: string[];
      planSatisfied?: boolean;
      customerVisibleFallback?: boolean;
    };
    repairBudget?: Record<string, unknown>;
  } | null;
  finalTextFreeze?: { frozen?: boolean; sha256?: string; frozenAtStage?: string; textLength?: number } | null;
}

export interface CustomerServiceGuidelinePolicyExplainability {
  resolutionSet?: {
    schemaVersion?: number; shadow?: boolean; snapshotHash?: string; resolutionHash?: string; guidelineVersionIds?: string[];
    traces?: Array<{ guidelineId?: string; code?: string; versionId?: string; versionNo?: number; criticality?: string; priority?: number; status?: string; reasonCode?: string; relatedGuidelineIds?: string[] }>;
    decisions?: Array<{ guidelineId?: string; code?: string; versionId?: string; versionNo?: number; criticality?: string; guidelinePriority?: number; action?: Record<string, unknown> }>;
    conflicts?: Array<{ kind?: string; act?: string; guidelineIds?: string[]; reasonCode?: string }>;
    hasUnresolvedHardConflict?: boolean;
  } | null;
  legacyPlan?: CustomerServiceInteractionPlanV2Explainability | null;
  comparison?: {
    legacyRequiredActs?: string[]; guidelineRequiredActs?: string[]; legacySuppressedActs?: string[]; guidelineSuppressedActs?: string[]; completionChanged?: boolean; changed?: boolean;
  } | null;
}

export interface CustomerServiceReplyTraceDetail {
  id: string;
  sourceType: string;
  sourceRefId: string | null;
  robotId: string | null;
  accountProfileId: string | null;
  storeProfileId: string | null;
  merchantRoleId: string | null;
  industryNodeId: string | null;
  channel: string | null;
  platform: string | null;
  conversationId: string | null;
  commentThreadId: string | null;
  customerMessageId: string | null;
  replyMessageId: string | null;
  replyAttemptId: string | null;
  provider: string | null;
  model: string | null;
  generationSource: string;
  configurationHash: string | null;
  sourceRevisions: Record<string, unknown> | null;
  strategyAssetIds: string[];
  strategyVersionIds: string[];
  languagePolicyIds: string[];
  knowledgeEntryIds: string[];
  understandingSummary: Record<string, unknown> | null;
  qualityStatus: string;
  safetyStatus: string;
  qualityReport: Record<string, unknown> | null;
  fallbackUsed: boolean;
  payloadState: string;
  runtimeExplainability: {
    intent: {
      key: string | null;
      name: string | null;
      scenario: string | null;
      scopeSource: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
      scopeMode: 'AUTO' | 'SELECTED_ONLY' | 'AUTO_EXCEPT_DISABLED';
      configuredKeys: string[];
    };
    replyExperience: {
      source: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
      preset: 'CONCISE' | 'BALANCED' | 'DETAILED' | 'CUSTOM';
      maxSentences: number;
      delivery: {
        mode: 'AUTO' | 'SINGLE' | 'SEQUENTIAL';
        maxSegments: number;
        splitThresholdChars: number;
        minDelayMs: number;
        maxDelayMs: number;
        cancelRemainingOnCustomerMessage: boolean;
      };
    };
    conversationStrategy?: {
      configured: boolean;
      source: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
      policy: {
        contextCarryoverMode: 'AUTO' | 'CONSERVATIVE' | 'CONTINUITY_FIRST';
        returningGreetingMode: 'CURRENT_ONLY' | 'SOFT_CONTINUITY' | 'CONTINUE_PENDING';
        businessIdentityStrength: 'LIGHT' | 'BALANCED' | 'STRONG';
        casualChatBoundary: 'BUSINESS_ANCHORED' | 'FLEXIBLE' | 'OPEN';
        reuseConfirmedPreferences: boolean;
        continueUnfinishedItems: boolean;
        stateInferenceMode: 'EXPLICIT_ONLY' | 'CONSERVATIVE' | 'BALANCED';
        humanBehavior: {
          naturalness: 'AUTO' | 'RESERVED' | 'BALANCED' | 'RELAXED';
          responseDensity: 'AUTO' | 'COMPACT' | 'BALANCED' | 'RICH';
          colloquiality: 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH';
          questionFrequency: 'AUTO' | 'LOW' | 'BALANCED' | 'HIGH';
          businessAdvance: 'AUTO' | 'LOW' | 'BALANCED' | 'HIGH';
          returningContinuity: 'AUTO' | 'LIGHT' | 'BALANCED' | 'STRONG';
          emoji: 'AUTO' | 'NONE' | 'LIGHT' | 'NATURAL';
          identityExposure: 'AUTO' | 'AMBIENT' | 'NATURAL' | 'DIRECT';
          segmentation: 'AUTO' | 'COMPACT' | 'BALANCED' | 'SEQUENTIAL';
        };
        contextBudget: {
          mode: 'AUTO' | 'CUSTOM';
          activeContextTokenBudget: number;
          totalInputTokenBudget: number;
          reservedInstructionTokens: number;
          maxKnowledgeTokens: number;
        };
      };
    };
    conversationState?: CustomerServiceConversationStateSummary | null;
    humanBehavior?: CustomerServiceExpressionPlanExplainability | null;
    interactionPlanV2?: CustomerServiceInteractionPlanV2Explainability | null;
    guidelinePolicy?: CustomerServiceGuidelinePolicyExplainability | null;
    hve3Execution?: CustomerServiceHve3ExecutionExplainability | null;
    /** Server-owned bounded Runtime Audit envelope shared with Robot Test. */
    runtimeAudit?: Record<string, unknown> | null;
    behaviorExplainability?: {
      preferenceSource: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
      preferencePolicy: CustomerServiceHumanBehaviorPreferenceExplainability;
      matchedBehaviorRules: string[];
      suppressedBehaviorRules: string[];
      decisionReasons: CustomerServiceHumanBehaviorDecisionExplainability[];
      expressionPlan: CustomerServiceExpressionPlanExplainability;
      behaviorHistory: Partial<CustomerServiceBehaviorHistoryProjection>;
    } | null;
    planner?: {
      route?: string | null;
      serviceGoal?: string | null;
      humanityGoal?: string | null;
      businessGoal?: string | null;
      salesVisibility?: string | null;
      questionBudget?: number;
      informationBudget?: number;
      microActions?: string[];
      prohibitedMicroActions?: string[];
      stateGuidance?: Record<string, unknown>;
      identityConstraint?: Record<string, unknown>;
    };
    inputBudget?: Record<string, unknown>;
    canonicalConversationState?: Record<string, unknown>;
    activeContext?: {
      recentMessageCount?: number;
      retrievedMemoryCount?: number;
      estimatedCharacters?: number;
      budgetApplied?: boolean;
      selectionMode?: string;
      tokenBudget?: number;
      estimatedTokens?: number;
      estimatedCurrentMessageTokens?: number;
      estimatedStateTokens?: number;
      estimatedHistoryTokens?: number;
      historyTokenBudget?: number;
      allHistoryIncluded?: boolean;
      selectedMessageCount?: number;
      candidateMessageCount?: number;
      evidenceRecallCount?: number;
      sourceConversationCount?: number;
    };
    legacyPrompt: {
      normalDeepSeekUsesLegacyPrompt: boolean;
      fallbackUsed: boolean;
      fallbackReason: string | null;
    };
  };
  createdAt: string;
  scopeImpact: {
    accountScope: { accountCount: number; robotCount: number };
    roleScope: { accountCount: number; robotCount: number };
  };
  feedback: {
    id: string;
    feedback: CustomerServiceReplyFeedbackValue;
    note: string | null;
    updatedAt: string;
  } | null;
  calibration: {
    id: string;
    status: string;
    strategyDraftStatus: string | null;
    updatedAt: string;
  } | null;
}

export interface CustomerServiceReplyFeedbackResult {
  id: string;
  replyTraceId: string;
  feedback: CustomerServiceReplyFeedbackValue;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getCustomerServiceReplyTrace(id: string): Promise<CustomerServiceReplyTraceDetail> {
  return unwrapData(await request({
    path: `/customer-service/admin/reply-traces/${id}`,
    method: 'GET',
    apiVersion: 5
  }));
}

export async function upsertCustomerServiceReplyFeedback(
  id: string,
  feedback: CustomerServiceReplyFeedbackValue,
  note?: string
): Promise<CustomerServiceReplyFeedbackResult> {
  return unwrapData(await request({
    path: `/customer-service/admin/reply-traces/${id}/feedback`,
    method: 'POST',
    body: { feedback, ...(note?.trim() ? { note: note.trim() } : {}) },
    apiVersion: 5
  }));
}
