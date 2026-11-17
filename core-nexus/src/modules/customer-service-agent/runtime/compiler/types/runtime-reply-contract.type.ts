import type { CustomerServiceDeterministicReplyPlan } from '../customer-service-deterministic-response-compiler.service';
import type { CustomerServiceIntentGuidance, CustomerServiceOrchestrationPlan, CustomerServiceReplyRoute } from '../../planning/customer-service-reply-planner.service';
import type { CustomerServiceMessageUnderstanding } from '../../understanding/types/customer-service-message-understanding.type';
import type { CustomerServiceGenerationResult } from '../../generation/customer-service-reply-generator.service';
import type { CustomerServiceQualityReport } from '../../quality/types/customer-service-quality-report.type';
import type { CustomerServiceTuningDirectives } from '../../../shared/calibration/customer-service-calibration-profile.util';
import type { CustomerServiceResolvedStrategyPolicy } from './customer-service-strategy-policy.type';
import type { CustomerServiceConversationStateSummary } from '../../state/customer-service-conversation-state.type';
import type { CustomerServiceEffectiveLanguagePolicy } from '../../../shared/context/customer-service-language-policy.util';
import type { CustomerServiceRuntimeKnowledgeSelectionResult, CustomerServiceSelectedKnowledgeEntry } from '../../../shared/context/customer-service-knowledge.util';
import type { CustomerServiceEffectiveBusinessScopeV1 } from '../../../shared/context/customer-service-business-scope.util';
import type { CustomerServiceRuntimeInputBudget } from '../../../shared/context/customer-service-runtime-input-budget.util';
import type { CustomerServiceConversationStrategyPreferences } from '../../../shared/context/customer-service-account-runtime-preferences.util';

import type { CustomerServiceRoleSpeakerProfileV1 } from '../../../shared/role/customer-service-role-speaker-profile';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../../voice/customer-service-role-speaker-projection';
import type { CustomerServiceRoleInteractionPostureProjectionV1 } from '../../role/customer-service-role-interaction-posture-projection';
import type { CustomerServiceRoleCapabilityContextProjectionV1 } from '../../role/customer-service-role-capability-context-projection';
import type { CustomerServiceResolvedRoleIdentityContextV1 } from '../../role/customer-service-resolved-role-identity-context';
import type { CustomerServiceHveV19Activation } from '../../activation/customer-service-hve-v19-activation';
import type { CustomerServiceCanonicalTranscriptV1, CustomerServiceConversationSummarySourceV1 } from '../../interaction/customer-service-summary-source.contract';
export type CustomerServiceRuntimeReplyContract = {
  runtimeMode: 'SIMULATION';
  identity: {
    merchantRole: { id: string; code: string; name: string; description?: string | null; publicIdentity: string | null; publicRelation?: string | null; revision: number };
    prototype: {
      id: string;
      code: string;
      name: string;
      identity: string | null;
      personality: string | null;
      languageStyle: string | null;
      servicePosture: string | null;
      speakerProfile?: CustomerServiceRoleSpeakerProfileV1 | null;
      revision: number;
    };
  };
  understanding: CustomerServiceMessageUnderstanding;
  businessContext: {
    storeProfile: {
      id: string;
      code: string;
      name: string;
      description: string | null;
      profile: Record<string, unknown>;
      revision: number;
    } | null;
    accountProfile: {
      id: string;
      code: string;
      name: string;
      channel: string | null;
      description: string | null;
      profile: Record<string, unknown>;
      revision: number;
    } | null;
    languagePolicies: CustomerServiceEffectiveLanguagePolicy[];
    knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
    knowledgeSelection: CustomerServiceRuntimeKnowledgeSelectionResult;
    businessScope: CustomerServiceEffectiveBusinessScopeV1;
    runtimeInputBudget: CustomerServiceRuntimeInputBudget;
    conversationStrategy: CustomerServiceConversationStrategyPreferences;
    languagePolicyConstraints: string[];
  };
  classification: {
    source: CustomerServiceMessageUnderstanding['source'];
    industry: { id: string; code: string; name: string; nodeType: string; path: string; revision: number } | null;
    scenario: string;
    intent: string;
    riskLevel: CustomerServiceMessageUnderstanding['riskLevel'];
    emotion: CustomerServiceMessageUnderstanding['emotion'];
    confidence: number;
    topics: CustomerServiceMessageUnderstanding['topics'];
    intentRanking: CustomerServiceMessageUnderstanding['intentRanking'];
    recognizedItems: CustomerServiceMessageUnderstanding['recognizedItems'];
    recognitionModel: CustomerServiceMessageUnderstanding['recognitionModel'];
    humanContext: CustomerServiceMessageUnderstanding['humanContext'];
  };
  persona: {
    resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1;
    speakerProjection?: CustomerServiceRoleSpeakerProjectionV1;
    interactionPostureProjection?: CustomerServiceRoleInteractionPostureProjectionV1;
    roleCapabilityContextProjection?: CustomerServiceRoleCapabilityContextProjectionV1;
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
  intentGuidance: CustomerServiceIntentGuidance[];
  strategyPolicy: CustomerServiceResolvedStrategyPolicy;
  calibration: {
    profiles: Array<{
      id: string;
      scopeType: string;
      scopeKey: string;
      title: string;
      scenario: string | null;
      intent: string | null;
      riskLevel: string | null;
      directives: unknown;
      examples: unknown;
      revision: number;
    }>;
    directives: CustomerServiceTuningDirectives;
  };
  generationContext: {
    feedbackAuthority?: 'FINAL_UNDERSTANDING_CURRENT_EVENT';
    customerEvidenceMessageId?: string | null;
    previousDrafts: string[];
    /** Ordinary context-window history. This is not Summary history authority. */
    conversationHistory: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
    /** Server-owned transcript used only to compile the single Summary Source. */
    canonicalTranscript: CustomerServiceCanonicalTranscriptV1 | null;
    /** Single compiled Summary Source consumed read-only by Generator/Compliance/Final Candidate. */
    summarySource: CustomerServiceConversationSummarySourceV1;
    conversationState: CustomerServiceConversationStateSummary;
    contextWindow: {
      recentMessageCount: number;
      retrievedMemoryCount: number;
      estimatedCharacters: number;
      budgetApplied?: true;
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
      physicalMessageCount?: number;
      estimatedInternalStateTokens?: number;
      stateProjection?: string;
      evidenceRecallCount?: number;
      sourceConversationCount?: number;
    };
  };
  customerState: Record<string, unknown>;
  groundedContext: {
    latestCustomerMessage: string;
    facts: unknown[];
    factPolicy: 'VERIFIED_ONLY';
    assistantHistoryPolicy: 'CONTEXT_ONLY_NOT_EXECUTION_EVIDENCE';
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
};

export type CustomerServiceSimulationCompileResult = {
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
  contract: CustomerServiceRuntimeReplyContract;
};

export type CustomerServiceSimulationExecutionResult = CustomerServiceSimulationCompileResult & {
  executedAt: string;
  generation: CustomerServiceGenerationResult;
  quality: CustomerServiceQualityReport;
  hveV19Activation: CustomerServiceHveV19Activation | null;
  performance: {
    totalElapsedMs: number;
    recognitionElapsedMs: number;
    generationModelElapsedMs: number;
    localProcessingElapsedMs: number;
    modelCallCount: number;
    recognitionPath: 'FAST_PATH' | 'MODEL' | 'MODEL_REGENERATION' | 'HEURISTIC_FALLBACK';
  };
};
