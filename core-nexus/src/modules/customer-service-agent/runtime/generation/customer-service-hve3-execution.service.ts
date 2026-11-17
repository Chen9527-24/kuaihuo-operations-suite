import { Injectable } from '@nestjs/common';
import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import type { CustomerServiceQualityReport } from '../quality/types/customer-service-quality-report.type';
import { CustomerServiceOutputActRecognizer } from '../compliance/customer-service-output-act-recognizer';
import {
  CustomerServiceHumanityPreferenceEvaluator,
  type CustomerServiceHumanityFeatureVector,
} from '../compliance/customer-service-humanity-preference-evaluator';
import {
  CustomerServiceGenerationResult,
  CustomerServiceReplyGenerator,
  extractRecoverableProviderVisibleSegments,
} from './customer-service-reply-generator.service';
import { getCustomerServicePromptKernel } from './customer-service-prompt-kernel.registry';
import {
  compileCustomerServiceNlgSemanticFrameV1,
  projectCustomerServiceCanonicalActsForSemanticFrame,
  type CustomerServiceNlgSemanticFrameV1,
} from './customer-service-nlg-execution-brief';
import {
  evaluateCustomerServiceHumanTurnSurface,
  type CustomerServiceHumanTurnSurfaceComplianceReport,
} from './customer-service-human-turn-surface-compliance';
import {
  buildCustomerServiceFinalCandidateIdentity,
  canonicalizeCustomerServiceGenerationCandidate,
  replaceCustomerServiceVisibleContent,
  sealCustomerServiceFinalCandidate,
} from './customer-service-final-candidate';
import { compileCustomerServiceFinalModelFacingHumanTurn } from './customer-service-final-realization-authority';
import { CustomerServiceSemanticConformanceService } from './customer-service-semantic-conformance.service';

export type CustomerServiceHve3SoftHumanityReport = CustomerServiceHumanityFeatureVector & { warningKeys: string[] };

export type CustomerServiceHve3ExecutionResult = {
  generation: CustomerServiceGenerationResult;
  quality: CustomerServiceQualityReport;
  warnings: string[];
};

type HumanDiagnostics = {
  observedActs: ReturnType<CustomerServiceOutputActRecognizer['recognize']>;
  softHumanity: CustomerServiceHve3SoftHumanityReport | null;
  surfaceCompliance: CustomerServiceHumanTurnSurfaceComplianceReport | null;
  diagnosticError: string | null;
};

/**
 * Minimal HVE customer-visible execution path.
 *
 * Runtime ownership is intentionally narrow:
 * 1) Context/Role/Knowledge/Policy are compiled before generation.
 * 2) The model + Human Realization produce the customer-visible reply.
 * 3) Ordinary generated HVE_REPLY_V2 semantic units pass one bounded Canonical Semantic Conformance check.
 *    This is semantic authorization enforcement only: it cannot plan, add facts/Acts, score quality,
 *    improve style, retry, or freely rewrite; the only correction is verified exact-substring removal.
 * 4) Once Generation has produced non-empty customer-visible text, Semantic Conformance may remove only
 *    byte-exact proven unauthorized spans. Ordinary classified semantic disputes remain non-veto and are never
 *    freely rewritten. Two fact-sensitive exceptions block the original body: (a) checker infrastructure/protocol
 *    failure while the candidate already carries actual Grounded bindings; or (b) a completed proposition
 *    classification proves merchant/entity evidence is required but Runtime cannot safely authorize/correct it.
 *    Both cases retain only independently authorized useful content. After a CLASSIFIED exact-correction
 *    failure, Runtime may also surface exact source-owned witness excerpts already bound to selected Canonical
 *    Grounded refs as known premises; those premises never authorize or reconstruct the deleted proposition.
 *    When no safe value remains, Runtime emits a fact-free useful service floor; planSatisfied=false in either case.
 *    Genuine non-Grounded replies
 *    keep the historical non-veto behavior.
 * 5) Human/act/surface evaluators remain diagnostics only and are isolated from Send.
 *
 * Customer-visible degradation is therefore limited to true Generation availability failure or a Grounded
 * Semantic-Conformance proof-path failure; neither path adds business facts, retries, a Judge, or free rewrite.
 */
@Injectable()
export class CustomerServiceHve3ExecutionService {
  constructor(
    private readonly generator: CustomerServiceReplyGenerator,
    private readonly actRecognizer: CustomerServiceOutputActRecognizer,
    private readonly humanityEvaluator: CustomerServiceHumanityPreferenceEvaluator,
    private readonly semanticConformance: CustomerServiceSemanticConformanceService,
  ) {}

  async execute(input: {
    contract: CustomerServiceRuntimeReplyContract;
    generateReply: boolean;
  }): Promise<CustomerServiceHve3ExecutionResult> {
    const plan = input.contract.orchestrationPlan.interactionPlanV2;
    const execution = input.contract.orchestrationPlan.interactionExecution;
    if (!plan || !execution || !['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(execution.lane)) {
      throw new Error('HVE-3 execution service requires a customer-visible HVE execution lane and canonical plan');
    }

    let generated = canonicalizeCustomerServiceGenerationCandidate(
      await this.generator.generate(input.contract, input.generateReply),
    );
    if (!generated.draft?.trim()) {
      const recovered = recoverNonEmptyProviderGeneration(generated);
      if (recovered) {
        generated = canonicalizeCustomerServiceGenerationCandidate(recovered);
      } else {
        return this.buildModelAvailabilityDegradation(input.contract, generated);
      }
    }

    const semanticFrame = compileCustomerServiceNlgSemanticFrameV1({
      contract: input.contract,
      execution,
    });
    // Protocol non-veto may preserve non-empty provider text without model-authored
    // HVE_REPLY_V2 units. Before Conformance, transport that text only as a candidate
    // ceiling copied from already-selected Canonical Acts/refs; never infer semantics
    // from the raw wording. The single existing classifier must still prove which
    // contribution(s) and Grounding, if any, are actually realized before Send.
    const conformanceReadyGeneration = bindCanonicalSegmentGroundingProvenance(
      generated,
      semanticFrame.humanTurnRealization,
      true,
      input.contract,
    );
    let enforcedGeneration = conformanceReadyGeneration;
    let conformanceWarning: string | null = null;
    if (shouldRunCanonicalSemanticConformance(conformanceReadyGeneration)) {
      const conformance = await this.semanticConformance.conform({
        contract: input.contract,
        semanticFrame,
        generation: conformanceReadyGeneration,
      });
      // Conformance uncertainty cannot become business-fact Send Authority. Two evidence-owned
      // cases fail safe on the *original fact body*: checker self-failure when the visible candidate
      // actually carries Grounded bindings OR the typed Canonical turn already requires merchant/business
      // evidence, and completed classification that proves merchant evidence is required but Runtime
      // cannot authorize/correct that proposition. Ordinary non-merchant semantic disputes
      // keep the historical non-veto path; this is not a language/quality Judge or free rewrite.
      if (!conformance.accepted
        && shouldUseGroundedConformanceFailureDegradation(
          input.contract,
          conformanceReadyGeneration,
          conformance.trace,
        )) {
        return this.buildSemanticConformanceDegradation(input.contract, conformance.generation);
      }
      enforcedGeneration = conformance.generation;
      if (!conformance.accepted) {
        conformanceWarning = `HVE-3：Canonical Semantic Conformance 未能证明/修正候选；普通非 Grounded/非 merchant-evidence-required 的不可安全修正场景保留非空 Generation；decision=${conformance.trace.decision}。`;
      }
    }
    const candidate = bindCanonicalSegmentGroundingProvenance(enforcedGeneration, semanticFrame.humanTurnRealization, false, input.contract);
    const diagnostics = this.buildHumanDiagnostics(input.contract, candidate, semanticFrame);
    const sealed = sealCustomerServiceFinalCandidate({
      ...candidate,
      candidateSafetyStatus: 'PASS',
      candidateQualityStatus: 'NOT_RUN',
      fallbackUsed: false,
      fallbackReason: null,
      semanticFallbackUsed: false,
      finalReplySource: candidate.source,
      finalFailureReason: null,
    });
    const selectedCandidateIdentity = sealed.finalCandidateIdentity!;
    const quality = buildMinimalRuntimeQualityReport();
    const hve3 = this.buildDiagnostics({
      contract: input.contract,
      generation: sealed,
      semanticFrame,
      diagnostics,
      selectedCandidateIdentity,
    });

    return {
      generation: {
        ...sealed,
        hve3,
      },
      quality,
      warnings: [
        ...(conformanceWarning ? [conformanceWarning] : []),
        ...(diagnostics.diagnosticError
          ? [`HVE-3 真人感诊断未完成，但不影响客户回复：${diagnostics.diagnosticError}`]
          : []),
      ],
    };
  }

  private buildHumanDiagnostics(
    contract: CustomerServiceRuntimeReplyContract,
    generation: CustomerServiceGenerationResult,
    semanticFrame: CustomerServiceNlgSemanticFrameV1,
  ): HumanDiagnostics {
    try {
      const plan = contract.orchestrationPlan.interactionPlanV2!;
      const publicIdentityProjection = contract.orchestrationPlan.identityConstraint.customerVisibleIdentity;
      const observedActs = this.actRecognizer.recognize({
        text: generation.draft || '',
        plan,
        latestCustomerMessage: contract.groundedContext.latestCustomerMessage,
        knowledgeEntries: contract.businessContext.knowledgeEntries,
        publicIdentity: publicIdentityProjection.preferredSurfaceLabel,
        publicIdentityAliases: publicIdentityProjection.allowedSurfaceLabels,
        merchantRoleName: publicIdentityProjection.publicName,
        merchantBrandName: contract.persona.resolvedRoleIdentity?.storeExpression.brandName || null,
        serviceScope: resolveCustomerServiceConfiguredServiceScope(contract),
        humanTurnRealization: semanticFrame.humanTurnRealization,
        generatedSegments: generation.structuredSegments || null,
      });
      const humanity = this.humanityEvaluator.evaluate({
        text: generation.draft || '',
        latestCustomerMessage: contract.groundedContext.latestCustomerMessage,
        plan,
        observedActs,
        knowledgeEntries: contract.businessContext.knowledgeEntries,
        identityProjection: publicIdentityProjection,
        behaviorHistory: contract.generationContext.conversationState.behaviorHistory,
        speakerProjection: contract.persona.resolvedRoleIdentity?.speakerProjection || contract.persona.speakerProjection || null,
        resolvedRoleIdentity: contract.persona.resolvedRoleIdentity || null,
        humanTurnRealization: semanticFrame.humanTurnRealization,
        recentConversation: semanticFrame.context.recentConversation,
      });
      const softHumanity: CustomerServiceHve3SoftHumanityReport = {
        ...humanity,
        warningKeys: humanity.features
          .filter((item) => item.risk !== 'LOW')
          .map((item) => `HVE_HUMANITY_${item.key}`),
      };
      const surfaceCompliance = evaluateCustomerServiceHumanTurnSurface({
        text: generation.draft || '',
        realization: semanticFrame.humanTurnRealization,
        fullPublicIdentity: {
          businessLabel: publicIdentityProjection.businessLabel,
          relationLabel: publicIdentityProjection.relationLabel,
          preferredSurfaceLabel: publicIdentityProjection.preferredSurfaceLabel,
          allowedSurfaceLabels: [...publicIdentityProjection.allowedSurfaceLabels],
        },
      });
      return { observedActs, softHumanity, surfaceCompliance, diagnosticError: null };
    } catch (error) {
      return {
        observedActs: [],
        softHumanity: null,
        surfaceCompliance: null,
        diagnosticError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildDiagnostics(input: {
    contract: CustomerServiceRuntimeReplyContract;
    generation: CustomerServiceGenerationResult;
    semanticFrame: CustomerServiceNlgSemanticFrameV1;
    diagnostics: HumanDiagnostics;
    selectedCandidateIdentity: ReturnType<typeof buildCustomerServiceFinalCandidateIdentity>;
  }) {
    const { contract, generation, semanticFrame, diagnostics } = input;
    const candidate = {
      index: 0,
      selected: true,
      source: generation.source,
      candidateIdentity: buildCustomerServiceFinalCandidateIdentity(generation),
      preview: buildCandidateDiagnosticPreview(generation.draft),
      observedActTypes: diagnostics.observedActs
        .filter((act) => act.observation === 'OBSERVED')
        .map((act) => act.type),
      qualified: true,
      baseQualified: true,
      holdValueReady: true,
      selectionEligible: true,
      selectionIneligibilityReasons: [],
      semanticFulfillmentStatus: null,
      semanticFulfillmentScore: null,
      semanticFulfillmentIssueKeys: [],
      semanticFulfillmentWarningKeys: [],
      targetCoverageStatus: null,
      targetCoverageScore: null,
      targetCoverageIssueKeys: [],
      targetCoverageWarningKeys: [],
      humanRealizationFloorStatus: null,
      humanRealizationFloorScore: null,
      humanRealizationFloorIssueKeys: [],
      claimAuthorityStatus: null,
      claimAuthorityIssueKeys: [],
      claimAuthorityEvidence: [],
      structuredSegments: (generation.structuredSegments || []).map((segment) => ({
        index: segment.index,
        purposes: segment.purposes,
        source: segment.source,
        plannedActTypes: segment.plannedActTypes || [],
        allowedGroundingRefs: segment.allowedGroundingRefs || [],
        provenanceAuthority: segment.provenanceAuthority || null,
        preview: buildCandidateDiagnosticPreview(segment.content),
      })),
      summaryTransformation: buildSummaryTransformationDiagnostics(generation.summaryTransformation),
      hardStatus: null,
      planStatus: null,
      naturalnessScore: diagnostics.softHumanity?.score ?? null,
      humanTurnSurfaceStatus: diagnostics.surfaceCompliance?.status ?? null,
      humanTurnSurfaceScore: diagnostics.surfaceCompliance?.score ?? null,
      humanTurnSurfaceIssueKeys: diagnostics.surfaceCompliance?.issueKeys ?? [],
      pairwiseUtilityScore: diagnostics.softHumanity?.pairwiseUtilityScore ?? null,
      personaPreferenceScore: diagnostics.softHumanity?.personaPreferenceScore ?? null,
      informationGainScore: diagnostics.softHumanity?.semanticValue.informationGainScore ?? null,
      crossTurnInformationGainScore: diagnostics.softHumanity?.semanticValue.crossTurnInformationGainScore ?? null,
      currentTurnValueScore: diagnostics.softHumanity?.semanticValue.currentTurnValueScore ?? null,
      preferenceUsageScore: diagnostics.softHumanity?.semanticValue.preferenceUsageScore ?? null,
      serviceEntryValueScore: diagnostics.softHumanity?.semanticValue.serviceEntryValueScore ?? null,
      identitySurfaceQualityScore: diagnostics.softHumanity?.semanticValue.identitySurfaceQualityScore ?? null,
      decisionContributionKind: diagnostics.softHumanity?.semanticValue.decisionContributionKind ?? null,
      decisionContributionScore: diagnostics.softHumanity?.semanticValue.decisionContributionScore ?? null,
      multiTurnRhythmScore: diagnostics.softHumanity?.semanticValue.multiTurnRhythmScore ?? null,
      crossFamilyVoiceScore: diagnostics.softHumanity?.semanticValue.crossFamilyVoiceScore ?? null,
      roleTurnManeuverScore: diagnostics.softHumanity?.semanticValue.roleTurnManeuverScore ?? null,
      roleBehaviorAlignmentScore: diagnostics.softHumanity?.semanticValue.roleBehaviorAlignmentScore ?? null,
      roleVoiceFidelityScore: diagnostics.softHumanity?.semanticValue.roleVoiceFidelityScore ?? null,
      speakerContinuityScore: diagnostics.softHumanity?.semanticValue.speakerContinuityScore ?? null,
      conversationalTextureScore: diagnostics.softHumanity?.semanticValue.conversationalTextureScore ?? null,
      aiAnswerCadenceScore: diagnostics.softHumanity?.semanticValue.aiAnswerCadenceScore ?? null,
      roleEvidenceStatus: diagnostics.softHumanity?.roleEvidence.status ?? null,
      roleEvidenceScore: diagnostics.softHumanity?.roleEvidence.score ?? null,
      positiveRoleEvidence: diagnostics.softHumanity?.roleEvidence.positiveEvidence ?? [],
      missingRoleEvidence: diagnostics.softHumanity?.roleEvidence.missingEvidence ?? [],
      knowledgeUtilizationStatus: diagnostics.softHumanity?.semanticValue.knowledgeUtilization.status ?? null,
      humanityHighRiskKeys: diagnostics.softHumanity?.highRiskKeys ?? [],
      criticalClaimStatus: [],
      hardIssueKeys: [],
      planIssueKeys: [],
      planWarningKeys: [],
    };

    return {
      executionLane: contract.orchestrationPlan.interactionExecution?.lane || 'HVE3_CANDIDATE',
      runtimeArchitecture: 'MINIMAL_RUNTIME_V1_WITH_CANONICAL_SEMANTIC_CONFORMANCE_V1',
      sendAuthority: 'PRIMARY_NON_EMPTY_OR_GROUNDED_CONFORMANCE_DEGRADATION',
      postGenerationLanguageVeto: false,
      semanticAuthorizationEnforcement: true,
      kernel: getCustomerServicePromptKernel('GENERATION'),
      businessScope: contract.businessContext.businessScope,
      knowledgeSelection: contract.businessContext.knowledgeSelection,
      candidates: [candidate],
      selectedCandidateIndex: 0,
      selectionPolicy: 'PRIMARY_NON_EMPTY_WITH_GROUNDED_CONFORMANCE_FAILSAFE',
      protocolPreservation: generation.protocolPreservation || null,
      modelAvailability: {
        eligible: false,
        reason: 'NON_EMPTY_GENERATION_PRESENT',
        recoverableTextSource: generation.protocolPreservation?.source || (generation.draft?.trim() ? 'CURRENT_DRAFT' : 'NONE'),
      },
      observedActs: diagnostics.observedActs,
      criticalClaims: [],
      nlgContextProjection: semanticFrame.projectionDiagnostics,
      summarySource: buildSummarySourceDiagnostics(semanticFrame.context.summarySource),
      resolvedRoleIdentity: buildResolvedRoleIdentityDiagnostics(contract),
      voiceProjection: {
        speaker: semanticFrame.voice.speaker,
        accountExpression: semanticFrame.resolvedRoleExpression.account,
        tone: semanticFrame.voice.tone,
        posture: semanticFrame.voice.posture,
        delivery: semanticFrame.voice.delivery,
      },
      roleCapabilityContextProjection: semanticFrame.roleCapabilityContext,
      humanTurnRealization: semanticFrame.humanTurnRealization,
      modelFacingHumanTurn: compileCustomerServiceFinalModelFacingHumanTurn(contract, semanticFrame),
      serviceRealization: semanticFrame.serviceRealization,
      publicIdentityProjection: buildSafePublicIdentityProjectionDiagnostics(
        contract.orchestrationPlan.identityConstraint.customerVisibleIdentity,
      ),
      roleInteractionPostureProjection: buildRoleInteractionPostureDiagnostics(contract),
      planCompliance: null,
      hardCompliance: null,
      softHumanity: diagnostics.softHumanity,
      semanticFulfillment: null,
      selectedReason: 'PRIMARY_CANDIDATE_ACCEPTED',
      selectedCandidateIdentity: input.selectedCandidateIdentity,
      finalCandidateInvariant: 'GENERATED_SELECTED_DELIVERED_SAME_CANDIDATE',
      repairBudget: {
        constrainedRegenerationCount: 0,
        maxConstrainedRegenerations: 0,
      },
      semanticConformance: generation.semanticConformance || null,
      conformanceBudget: {
        modelCallCount: generation.semanticConformance?.modelCallCount || 0,
        maxModelCalls: 1,
        correctionMode: 'EXACT_SUBSTRING_REMOVAL_ONLY',
        retryCount: 0,
      },
      diagnosticIsolation: {
        authority: 'DIAGNOSTIC_ONLY',
        affectsSelectionEligibility: false,
        affectsFinalCandidate: false,
        affectsDelivery: false,
        error: diagnostics.diagnosticError,
      },
    };
  }

  private buildSemanticConformanceDegradation(
    contract: CustomerServiceRuntimeReplyContract,
    generation: CustomerServiceGenerationResult,
  ): CustomerServiceHve3ExecutionResult {
    const observedDecision = generation.semanticConformance?.observedDecision || 'INVALID_RESPONSE';
    const postCorrectionUsefulDraft = buildPostCorrectionRequiredValueDegradation(contract, generation);
    const partialSafeDraft = postCorrectionUsefulDraft || buildAuthorizedNonGroundedPartialReply(contract, generation);
    const draft = partialSafeDraft || buildFactFreeUsefulServiceFloor(contract);
    const degraded = replaceCustomerServiceVisibleContent(generation, draft);
    const partialSafeRecovery = Boolean(partialSafeDraft);
    const semanticFrame = compileCustomerServiceNlgSemanticFrameV1({
      contract,
      execution: contract.orchestrationPlan.interactionExecution!,
    });
    const hve3 = {
      executionLane: contract.orchestrationPlan.interactionExecution?.lane || 'HVE3_CANDIDATE',
      runtimeArchitecture: 'MINIMAL_RUNTIME_V1_WITH_CANONICAL_SEMANTIC_CONFORMANCE_V1',
      sendAuthority: 'GROUNDED_SEMANTIC_CONFORMANCE_PROOF_REQUIRED',
      postGenerationLanguageVeto: false,
      semanticAuthorizationEnforcement: true,
      kernel: getCustomerServicePromptKernel('GENERATION'),
      businessScope: contract.businessContext.businessScope,
      knowledgeSelection: contract.businessContext.knowledgeSelection,
      candidates: [],
      selectedCandidateIndex: null,
      selectionPolicy: partialSafeRecovery
        ? 'PARTIAL_SAFE_NON_GROUNDED_RECOVERY'
        : 'GROUNDED_CONFORMANCE_FAILURE_DEGRADATION',
      protocolPreservation: generation.protocolPreservation || null,
      modelAvailability: {
        eligible: false,
        reason: 'NON_EMPTY_GENERATION_PRESENT_BUT_GROUNDED_AUTHORITY_UNPROVEN',
        recoverableTextSource: generation.protocolPreservation?.source || (generation.originalDraft?.trim() ? 'INITIAL' : 'CURRENT_DRAFT'),
      },
      observedActs: [],
      criticalClaims: [],
      nlgContextProjection: semanticFrame.projectionDiagnostics,
      summarySource: buildSummarySourceDiagnostics(semanticFrame.context.summarySource),
      resolvedRoleIdentity: buildResolvedRoleIdentityDiagnostics(contract),
      voiceProjection: {
        speaker: semanticFrame.voice.speaker,
        accountExpression: semanticFrame.resolvedRoleExpression.account,
        tone: semanticFrame.voice.tone,
        posture: semanticFrame.voice.posture,
        delivery: semanticFrame.voice.delivery,
      },
      roleCapabilityContextProjection: semanticFrame.roleCapabilityContext,
      humanTurnRealization: semanticFrame.humanTurnRealization,
      modelFacingHumanTurn: compileCustomerServiceFinalModelFacingHumanTurn(contract, semanticFrame),
      serviceRealization: semanticFrame.serviceRealization,
      publicIdentityProjection: buildSafePublicIdentityProjectionDiagnostics(
        contract.orchestrationPlan.identityConstraint.customerVisibleIdentity,
      ),
      roleInteractionPostureProjection: buildRoleInteractionPostureDiagnostics(contract),
      planCompliance: null,
      hardCompliance: null,
      softHumanity: null,
      semanticFulfillment: null,
      selectedReason: partialSafeRecovery
        ? 'PARTIAL_SAFE_NON_GROUNDED_RECOVERY'
        : 'GROUNDED_CONFORMANCE_FAILURE_DEGRADATION',
      selectedCandidateIdentity: null,
      finalCandidateInvariant: null,
      controlledDegradation: {
        applied: true,
        reason: 'GROUNDED_SEMANTIC_CONFORMANCE_UNPROVEN',
        rootCause: `SEMANTIC_CONFORMANCE_${observedDecision}`,
        presentationCause: postCorrectionUsefulDraft
          ? 'POST_CORRECTION_EVIDENCE_BOUNDARY_WITH_SAFE_VALUE'
          : partialSafeRecovery ? 'PARTIAL_AUTHORIZED_HELP_ONLY' : 'FACT_FREE_USEFUL_SERVICE_FLOOR',
        originalGenerationStatus: generation.status,
        planSatisfied: false,
        customerVisibleFallback: !partialSafeRecovery,
      },
      repairBudget: {
        constrainedRegenerationCount: 0,
        maxConstrainedRegenerations: 0,
      },
      semanticConformance: generation.semanticConformance || null,
      conformanceBudget: {
        modelCallCount: generation.semanticConformance?.modelCallCount || 0,
        maxModelCalls: 1,
        correctionMode: 'EXACT_SUBSTRING_REMOVAL_ONLY',
        retryCount: 0,
      },
    };
    return {
      generation: {
        ...degraded,
        status: 'GENERATED',
        source: partialSafeRecovery ? generation.source : 'FAILURE_NOTICE',
        errorMessage: null,
        fallbackUsed: true,
        fallbackReason: partialSafeRecovery
          ? 'HVE3_PARTIAL_SAFE_NON_GROUNDED_RECOVERY'
          : 'HVE3_GROUNDED_SEMANTIC_CONFORMANCE_DEGRADATION',
        semanticFallbackUsed: false,
        finalReplySource: partialSafeRecovery ? generation.source : 'FAILURE_NOTICE',
        finalFailureReason: generation.semanticConformance?.errorMessage || `SEMANTIC_CONFORMANCE_${observedDecision}`,
        candidateSafetyStatus: 'PASS',
        candidateQualityStatus: 'DEGRADED',
        hve3,
      },
      quality: buildSemanticConformanceFailureQualityReport(observedDecision, partialSafeRecovery),
      warnings: [postCorrectionUsefulDraft
        ? `HVE-3：Required 主值在 exact correction 后未保留 task-material owner；已保留修正后安全正文并补充 typed evidence boundary，planSatisfied=false；observedDecision=${observedDecision}。`
        : partialSafeRecovery
          ? `HVE-3：Grounded 主贡献未完成，但已仅保留同轮 Semantic Conformance 明确授权的客户价值；原未证明业务事实未发送；observedDecision=${observedDecision}。`
          : `HVE-3：回复验证未完成且没有可独立保留的已授权实质帮助，已发送 fact-free useful service floor；未证明业务事实未发送，任务仍未完成；observedDecision=${observedDecision}。`],
    };
  }

  private buildModelAvailabilityDegradation(
    contract: CustomerServiceRuntimeReplyContract,
    generation: CustomerServiceGenerationResult,
  ): CustomerServiceHve3ExecutionResult {
    const draft = buildModelAvailabilityNotice(generation.status);
    const degraded = replaceCustomerServiceVisibleContent(generation, draft);
    const semanticFrame = compileCustomerServiceNlgSemanticFrameV1({
      contract,
      execution: contract.orchestrationPlan.interactionExecution!,
    });
    const hve3 = {
      executionLane: contract.orchestrationPlan.interactionExecution?.lane || 'HVE3_CANDIDATE',
      runtimeArchitecture: 'MINIMAL_RUNTIME_V1_WITH_CANONICAL_SEMANTIC_CONFORMANCE_V1',
      sendAuthority: 'MODEL_AVAILABILITY_ONLY',
      postGenerationLanguageVeto: false,
      semanticAuthorizationEnforcement: true,
      kernel: getCustomerServicePromptKernel('GENERATION'),
      businessScope: contract.businessContext.businessScope,
      knowledgeSelection: contract.businessContext.knowledgeSelection,
      candidates: [],
      selectedCandidateIndex: null,
      selectionPolicy: 'MODEL_AVAILABILITY_DEGRADATION_ONLY',
      protocolPreservation: generation.protocolPreservation || null,
      modelAvailability: {
        eligible: true,
        reason: 'NO_RECOVERABLE_PROVIDER_VISIBLE_TEXT',
        recoverableTextSource: 'NONE',
        originalDraftPresent: Boolean(generation.originalDraft?.trim()),
        recoveryDraftPresent: Boolean(generation.rewriteHistory?.some((item) => item.draft?.trim())),
      },
      observedActs: [],
      criticalClaims: [],
      nlgContextProjection: semanticFrame.projectionDiagnostics,
      summarySource: buildSummarySourceDiagnostics(semanticFrame.context.summarySource),
      resolvedRoleIdentity: buildResolvedRoleIdentityDiagnostics(contract),
      voiceProjection: {
        speaker: semanticFrame.voice.speaker,
        accountExpression: semanticFrame.resolvedRoleExpression.account,
        tone: semanticFrame.voice.tone,
        posture: semanticFrame.voice.posture,
        delivery: semanticFrame.voice.delivery,
      },
      roleCapabilityContextProjection: semanticFrame.roleCapabilityContext,
      humanTurnRealization: semanticFrame.humanTurnRealization,
      modelFacingHumanTurn: compileCustomerServiceFinalModelFacingHumanTurn(contract, semanticFrame),
      serviceRealization: semanticFrame.serviceRealization,
      publicIdentityProjection: buildSafePublicIdentityProjectionDiagnostics(
        contract.orchestrationPlan.identityConstraint.customerVisibleIdentity,
      ),
      roleInteractionPostureProjection: buildRoleInteractionPostureDiagnostics(contract),
      planCompliance: null,
      hardCompliance: null,
      softHumanity: null,
      semanticFulfillment: null,
      selectedReason: 'MODEL_AVAILABILITY_FALLBACK',
      selectedCandidateIdentity: null,
      finalCandidateInvariant: null,
      controlledDegradation: {
        applied: true,
        reason: 'MODEL_AVAILABILITY_EXHAUSTED',
        rootCause: 'MODEL_AVAILABILITY_EXHAUSTED',
        presentationCause: 'MODEL_UNAVAILABLE',
        originalGenerationStatus: generation.status,
        planSatisfied: null,
        customerVisibleFallback: true,
      },
      repairBudget: {
        constrainedRegenerationCount: 0,
        maxConstrainedRegenerations: 0,
      },
      semanticConformance: null,
      conformanceBudget: {
        modelCallCount: 0,
        maxModelCalls: 1,
        correctionMode: 'EXACT_SUBSTRING_REMOVAL_ONLY',
        retryCount: 0,
      },
    };
    return {
      generation: {
        ...degraded,
        status: 'GENERATED',
        source: 'FAILURE_NOTICE',
        errorMessage: null,
        fallbackUsed: true,
        fallbackReason: 'HVE3_MODEL_AVAILABILITY_DEGRADATION',
        semanticFallbackUsed: false,
        finalReplySource: 'FAILURE_NOTICE',
        finalFailureReason: generation.finalFailureReason || generation.errorMessage || generation.status,
        candidateSafetyStatus: 'PASS',
        candidateQualityStatus: 'DEGRADED',
        hve3,
      },
      quality: buildModelAvailabilityQualityReport(generation.status),
      warnings: [`HVE-3：模型没有形成可发送正文，已使用基础设施级可用性提示；generationStatus=${generation.status}。`],
    };
  }
}


function recoverNonEmptyProviderGeneration(
  generation: CustomerServiceGenerationResult,
): CustomerServiceGenerationResult | null {
  const candidates = [
    ...[...(generation.rewriteHistory || [])].reverse().map((item) => ({
      value: item.draft,
      source: item.mode === 'PLAIN_MODEL_RECOVERY' ? 'PLAIN_RECOVERY' as const : 'COMPACT_RETRY' as const,
    })),
    { value: generation.originalDraft, source: 'INITIAL' as const },
  ];
  for (const candidate of candidates) {
    const segments = extractRecoverableProviderVisibleSegments(candidate.value || '');
    if (!segments.length) continue;
    const draft = segments.join('\n\n').trim();
    if (!draft) continue;
    const source = candidate.source === 'PLAIN_RECOVERY'
      ? 'PLAIN_MODEL_RECOVERY' as const
      : candidate.source === 'COMPACT_RETRY'
        ? 'COMPACT_MODEL_RETRY' as const
        : 'MODEL' as const;
    return {
      ...generation,
      status: 'GENERATED',
      draft,
      source,
      visibleContentLength: draft.length,
      errorMessage: null,
      fallbackUsed: false,
      fallbackReason: null,
      finalReplySource: source,
      finalFailureReason: null,
      presentationIntent: {
        schemaVersion: 1,
        authority: 'GENERATION_PRESENTATION_ONLY',
        segments: segments.map((content, index) => ({
          index,
          content,
          source: 'RAW_TEXT_COMPATIBILITY' as const,
        })),
      },
      structuredSegments: undefined,
      protocolPreservation: {
        applied: true,
        reason: 'HVE_EXECUTION_RECOVERED_NON_EMPTY_PROVIDER_TEXT_BEFORE_MODEL_AVAILABILITY',
        source: candidate.source,
        segmentCount: segments.length,
        invariant: 'NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY',
      },
    };
  }
  return null;
}

function bindCanonicalSegmentGroundingProvenance(
  generation: CustomerServiceGenerationResult,
  realization: CustomerServiceNlgSemanticFrameV1['humanTurnRealization'],
  recoverSingleCanonicalOwnerUnit = false,
  contract?: CustomerServiceRuntimeReplyContract,
): CustomerServiceGenerationResult {
  const expected = realization.turnComposition.segmentPlan || [];
  if (!expected.length) return generation;
  let segments = generation.structuredSegments;
  if (!segments?.length) {
    const modelCandidate = ['MODEL', 'COMPACT_MODEL_RETRY', 'PLAIN_MODEL_RECOVERY'].includes(generation.source);
    const visiblePresentationSegments = (generation.presentationIntent?.segments || [])
      .filter((item) => Boolean(item.content?.trim()));
    const visiblePresentationSegmentCount = visiblePresentationSegments.length || 1;
    const hasVisibleDraft = Boolean(generation.draft?.trim());
    const exactSingle = expected.length === 1
      && visiblePresentationSegmentCount === 1
      && hasVisibleDraft;
    const protocolRecoveryCandidate = Boolean(
      recoverSingleCanonicalOwnerUnit
      && contract
      && generation.protocolPreservation?.applied
      && hasVisibleDraft,
    );
    if (!modelCandidate || (!exactSingle && !protocolRecoveryCandidate) || generation.summaryTransformation) return generation;

    // A provider may return useful customer-visible text even after both machine-protocol
    // attempts fail. Do not manufacture model availability and do not trust that text raw.
    // Transport each recovered visible segment instead as a candidate ceiling copied only
    // from already-selected Canonical Acts. Grounding refs come from those Acts, never
    // from raw wording or retrieval similarity; Conformance still proves realization.
    const protocolRecoveryBindings = protocolRecoveryCandidate
      ? projectCanonicalProtocolRecoveryCandidateBindings(contract!)
      : [];
    if (protocolRecoveryCandidate && !protocolRecoveryBindings.length) return generation;

    if (protocolRecoveryCandidate) {
      const recoveryVisibleSegments = visiblePresentationSegments.length
        ? visiblePresentationSegments
        : [{ index: 0, content: generation.draft!.trim() }];
      const fallbackPurposes = uniqueStringValues(expected.flatMap((item) => item.purposes || [])) as typeof expected[0]['purposes'];
      segments = recoveryVisibleSegments.map((visible, index) => {
        const projection = expected.find((item) => item.index === visible.index) || expected[index];
        return {
          index: visible.index,
          purposes: projection?.purposes?.length ? [...projection.purposes] : [...fallbackPurposes],
          content: visible.content.trim(),
          source: 'SINGLE_FALLBACK' as const,
          semanticUnits: [{
            index: 0,
            content: visible.content.trim(),
            bindings: protocolRecoveryBindings.map((binding) => ({ ...binding, groundingRefs: [...binding.groundingRefs] })),
            source: 'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE' as const,
          }],
        };
      });
    } else {
      segments = [{
        index: 0,
        purposes: [...expected[0].purposes],
        content: generation.draft!.trim(),
        source: 'SINGLE_FALLBACK' as const,
      }];
    }
  }

  let changed = segments !== generation.structuredSegments;
  const singleFallbackTopology = recoverSingleCanonicalOwnerUnit
    && expected.length === 1
    && segments.length === 1
    && (generation.presentationIntent?.segments.length || 1) === 1;
  const bound = segments.map((segment, index) => {
    const projection = expected.find((item) => item.index === segment.index) || expected[index];
    if (!projection) return segment;
    const plannedActRefs = uniqueStringValues(projection.plannedActRefs || []);
    const plannedActTypes = uniqueStringValues(projection.plannedActTypes || []);
    const allowedGroundingRefs = uniqueStringValues(projection.allowedGroundingRefs || []);
    const canonicalRecoveryUnit = singleFallbackTopology
      && plannedActRefs.length === 1
      && plannedActTypes.length === 1
      && isUnboundCompatibilitySegment(segment)
      ? [{
          index: 0,
          content: segment.content,
          bindings: [{
            actId: plannedActRefs[0],
            actType: projection.plannedActTypes[0],
            groundingRefs: [...allowedGroundingRefs],
          }],
          source: 'CANONICAL_SINGLE_OWNER_RECOVERY' as const,
        }]
      : null;
    const same = segment.provenanceAuthority === 'CANONICAL_SEGMENT_PLAN'
      && arraysEqual(segment.plannedActRefs || [], plannedActRefs)
      && arraysEqual(segment.plannedActTypes || [], plannedActTypes)
      && arraysEqual(segment.allowedGroundingRefs || [], allowedGroundingRefs)
      && !canonicalRecoveryUnit;
    if (same) return segment;
    changed = true;
    return {
      ...segment,
      plannedActRefs,
      plannedActTypes,
      allowedGroundingRefs,
      provenanceAuthority: 'CANONICAL_SEGMENT_PLAN' as const,
      semanticUnits: canonicalRecoveryUnit || segment.semanticUnits,
    };
  });
  return changed ? { ...generation, structuredSegments: bound } : generation;
}

function projectCanonicalProtocolRecoveryCandidateBindings(
  contract: CustomerServiceRuntimeReplyContract,
) {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return [];
  return projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts)
    .filter((act) => act.type !== 'STOP')
    .map((act) => ({
      actId: act.id,
      actType: act.type,
      groundingRefs: [...(act.allowedGroundingRefs || [])],
    }));
}

function isCanonicalProtocolRecoveryCandidate(
  generation: CustomerServiceGenerationResult,
) {
  return (generation.structuredSegments || []).some((segment) =>
    (segment.semanticUnits || []).some((unit) => unit.source === 'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE'),
  );
}

function isUnboundCompatibilitySegment(
  segment: NonNullable<CustomerServiceGenerationResult['structuredSegments']>[number],
) {
  if (!segment.content.trim()) return false;
  if (!segment.semanticUnits?.length) return segment.source === 'SINGLE_FALLBACK';
  return segment.semanticUnits.length === 1
    && segment.semanticUnits[0].source === 'LEGACY_COMPATIBILITY'
    && segment.semanticUnits[0].content === segment.content
    && segment.semanticUnits[0].bindings.length === 0;
}

function uniqueStringValues(values: unknown[]) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function shouldUseGroundedConformanceFailureDegradation(
  contract: CustomerServiceRuntimeReplyContract,
  generation: CustomerServiceGenerationResult,
  trace: NonNullable<CustomerServiceGenerationResult['semanticConformance']>,
) {
  const observedDecision = String(trace.observedDecision || '');
  const checkerSelfFailure = ['LOCAL_PROTOCOL_ERROR', 'INVALID_RESPONSE', 'UNAVAILABLE'].includes(observedDecision);

  // Checker self-failure cannot authorize either an already-Grounded customer-visible
  // body or a turn whose Canonical response obligation itself requires merchant/business
  // evidence. The second condition closes the correlated-failure hole where Generation
  // accidentally drops the Grounded binding and the checker fails in the same turn. It
  // consumes existing typed Canonical evidence ownership, not raw wording or available refs.
  if (checkerSelfFailure
    && (hasGroundedCustomerVisibleBindings(generation) || hasMerchantEvidenceRequiredTurn(contract))) return true;

  // A completed classifier may prove that the proposition itself requires merchant/entity
  // evidence even when upstream omitted a Grounded Act. If Runtime then cannot safely
  // authorize/correct that proposition, preserving the original body would turn a
  // classification/enforcement failure into business-fact Authority. This applies to
  // CLASSIFIED unsafe correction as well as protocol/infrastructure failure traces that
  // still carry completed unit evidence. Ordinary classified non-merchant disputes remain
  // on the historical non-veto path.
  if (trace.decision === 'UNPROVEN_PRESERVED' && isCanonicalProtocolRecoveryCandidate(generation)) return true;

  return trace.decision === 'UNPROVEN_PRESERVED'
    && hasPropositionLevelMerchantEvidenceRequirement(trace);
}


function hasMerchantEvidenceRequiredTurn(contract: CustomerServiceRuntimeReplyContract) {
  return contract.orchestrationPlan.interactionPlanV2?.answerObligation?.responseTarget?.knowledgeRequirement
    === 'BUSINESS_FACT_GROUNDING_REQUIRED';
}

function hasPropositionLevelMerchantEvidenceRequirement(
  trace: NonNullable<CustomerServiceGenerationResult['semanticConformance']>,
) {
  return (trace.unitChecks || []).some((unit) =>
    (unit.semanticSpans || []).some((span) =>
      span.authorized !== true
      && span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
    ));
}

function hasGroundedCustomerVisibleBindings(generation: CustomerServiceGenerationResult) {
  // Fail-safe is keyed to actual customer-visible Grounded ownership, not merely
  // to refs that the Canonical segment plan made available. A segment may expose
  // allowed refs while the generated unit realizes only a non-Grounded Act; that
  // must retain the ordinary non-veto path. Any actual semantic-unit binding with
  // Grounding refs is sufficient here, regardless of Act type, so future grounded
  // status/execution Acts cannot accidentally reopen the same checker-failure hole.
  return (generation.structuredSegments || []).some((segment) =>
    (segment.semanticUnits || []).some((unit) =>
      unit.bindings.some((binding) => (binding.groundingRefs || []).length > 0),
    ));
}

function shouldRunCanonicalSemanticConformance(generation: CustomerServiceGenerationResult) {
  if (generation.summaryTransformation) return false;
  return ['MODEL', 'COMPACT_MODEL_RETRY', 'PLAIN_MODEL_RECOVERY'].includes(generation.source)
    && Boolean(generation.draft?.trim());
}

function buildMinimalRuntimeQualityReport(): CustomerServiceQualityReport {
  return {
    status: 'NOT_RUN',
    checkedRuleCount: 0,
    blockerCount: 0,
    errorCount: 0,
    warningCount: 0,
    blockingIssueCount: 0,
    rewriteIssueCount: 0,
    scoreOnlyIssueCount: 0,
    naturalnessScore: 0,
    issues: [],
  };
}

function buildModelAvailabilityQualityReport(status: CustomerServiceGenerationResult['status']): CustomerServiceQualityReport {
  return {
    status: 'WARN',
    checkedRuleCount: 1,
    blockerCount: 0,
    errorCount: 0,
    warningCount: 1,
    blockingIssueCount: 0,
    rewriteIssueCount: 0,
    scoreOnlyIssueCount: 1,
    naturalnessScore: 0,
    issues: [{
      ruleId: 'HVE_MODEL_AVAILABILITY',
      key: 'HVE_MODEL_AVAILABILITY_DEGRADATION',
      name: 'HVE 模型可用性提示',
      category: 'RUNTIME_AVAILABILITY',
      severity: 'WARNING',
      passed: false,
      disposition: 'SCORE_ONLY',
      message: '模型没有形成客户可见正文；仅保留基础设施级可用性提示。',
      evidence: [status],
    }],
  };
}

const POST_CORRECTION_REQUIRED_MATERIAL_VALUE_PREFIX = 'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:';

function normalizeRecoverySurfaceForComparison(value: string) {
  return String(value || '').replace(/\s+/gu, '').trim();
}

function collectTraceProvenSourcePremises(
  contract: CustomerServiceRuntimeReplyContract,
  generation: CustomerServiceGenerationResult,
  safeDraft: string,
) {
  const trace = generation.semanticConformance;
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!trace?.unitChecks?.length || !plan) return [];

  const canonicalActs = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts);
  const allowedGroundingRefs = new Set(canonicalActs
    .filter((act) => act.authorityScope === 'GROUNDED_BUSINESS')
    .flatMap((act) => act.allowedGroundingRefs || [])
    .map((ref) => String(ref || '').trim())
    .filter(Boolean));
  if (!allowedGroundingRefs.size) return [];

  const knowledgeById = new Map<string, { content?: string | null }>();
  for (const entry of [
    ...(contract.businessContext.knowledgeEntries || []),
    ...(contract.businessContext.knowledgeSelection?.selected || []),
  ]) {
    const id = String(entry?.id || '').trim();
    if (!id || knowledgeById.has(id)) continue;
    knowledgeById.set(id, entry);
  }

  const normalizedSafeDraft = normalizeRecoverySurfaceForComparison(safeDraft);
  const seen = new Set<string>();
  const premises: string[] = [];

  for (const check of trace.unitChecks || []) {
    for (const span of check.semanticSpans || []) {
      const classification = span.classifierResult;
      if (span.authorized === true
        || span.taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK'
        || span.violationCode !== 'GROUNDED_EVIDENCE_UNSUPPORTED'
        || !classification
        || classification.witnessProtocolError
        || classification.evidenceRequirement !== 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'
        || !['PARTIALLY_SUPPORTED', 'FULLY_SUPPORTED'].includes(classification.groundingEntailment)) continue;

      const supportRefs = [...new Set((classification.groundingSupport || [])
        .map((support) => String(support.ref || '').trim())
        .filter(Boolean))];
      const realizedRefs = [...new Set((classification.realizedGroundingRefs || [])
        .map((ref) => String(ref || '').trim())
        .filter(Boolean))];
      if (!supportRefs.length
        || supportRefs.length !== realizedRefs.length
        || supportRefs.some((ref) => !realizedRefs.includes(ref))) continue;

      for (const support of classification.groundingSupport || []) {
        const ref = String(support.ref || '').trim();
        if (!allowedGroundingRefs.has(ref)) continue;
        const sourceContent = String(knowledgeById.get(ref)?.content || '');
        if (!sourceContent) continue;

        for (const excerptValue of support.excerpts || []) {
          const excerpt = String(excerptValue || '').trim();
          if (!excerpt || !sourceContent.includes(excerpt)) continue;
          const normalizedExcerpt = normalizeRecoverySurfaceForComparison(excerpt);
          if (!normalizedExcerpt
            || (normalizedSafeDraft && normalizedSafeDraft.includes(normalizedExcerpt))
            || seen.has(normalizedExcerpt)) continue;
          seen.add(normalizedExcerpt);
          premises.push(excerpt);
        }
      }
    }
  }
  return premises;
}

function buildPostCorrectionRequiredValueDegradation(
  contract: CustomerServiceRuntimeReplyContract,
  generation: CustomerServiceGenerationResult,
) {
  const trace = generation.semanticConformance;
  const errorMessage = String(trace?.errorMessage || '');
  if (trace?.observedDecision !== 'CLASSIFIED'
    || trace.decision !== 'UNPROVEN_PRESERVED'
    || !errorMessage.startsWith(POST_CORRECTION_REQUIRED_MATERIAL_VALUE_PREFIX)) return null;
  const safeDraft = String(generation.draft || '').trim();

  const removedMaterialSpans = (trace.unitChecks || []).flatMap((check) => (check.semanticSpans || []).filter((span) => (
    span.authorized !== true
    && span.taskDependency === 'MATERIAL_TO_CUSTOMER_TASK'
    && span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'
  )));
  if (!removedMaterialSpans.length) return null;

  const sourcePremises = collectTraceProvenSourcePremises(contract, generation, safeDraft);
  if (!safeDraft && !sourcePremises.length) return null;

  const roles = new Set(removedMaterialSpans.map((span) => span.classifierResult?.groundedActionRole || 'NOT_APPLICABLE'));
  const targets = new Set(removedMaterialSpans.map((span) => span.classifierResult?.semanticTarget || span.semanticTarget || 'OTHER'));
  let boundary = '你问的这个具体结论，现有资料还不足以把它当成确定事实。';
  if (roles.has('PERFORMANCE_OR_EXPERIENCE')) {
    boundary = '你问的具体体验或效果，现有资料还不足以把它当成确定结果；这类体验通常还会受实际使用条件和个人感受影响。';
  } else if (roles.has('SUITABILITY_OR_DECISION_SUPPORT')) {
    boundary = '你问的具体适配结论，现有资料还不足以把它当成确定结果；适不适合还要结合你的实际条件一起看。';
  } else if (roles.has('RISK_OR_OTHER_OUTCOME')) {
    boundary = '你问的具体风险或结果，现有资料还不足以把它当成确定结果；这类结果还会受实际条件影响。';
  } else if (roles.has('CHOICE_OR_RECOMMENDATION')) {
    boundary = '至于是否该直接选这个方案，现有资料还不足以把这个结论说死；可以先按已经确认的条件和取舍点继续比较。';
  } else if (targets.has('MERCHANT_ENTITY_OR_POLICY')) {
    boundary = '你问的这个具体商品或商家事实，现有资料还不足以确认。';
  }

  if (!sourcePremises.length) {
    return safeDraft ? `${boundary}\n\n能确认的是：${safeDraft}` : boundary;
  }

  const premiseBody = sourcePremises.join('；');
  const sourcePremiseSection = `现有资料能直接确认的是：${premiseBody}${/[。！？.!?]$/u.test(premiseBody) ? '' : '。'}`;
  return [sourcePremiseSection, boundary, safeDraft].filter(Boolean).join('\n\n');
}

function buildAuthorizedNonGroundedPartialReply(
  contract: CustomerServiceRuntimeReplyContract,
  generation: CustomerServiceGenerationResult,
) {
  const trace = generation.semanticConformance;
  if (trace?.observedDecision !== 'CLASSIFIED' || !trace.unitChecks?.length) return null;
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return null;
  const canonicalActs = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts);
  // Partial recovery may retain only content already proven by the same Conformance trace and
  // already owned by Canonical Acts. FULLY_SUPPORTED Grounded spans are safe to retain here;
  // this path never invents facts, refs, Acts, recommendations, or source support.
  const canonicalActIds = new Set(canonicalActs.filter((act) => act.type !== 'STOP').map((act) => act.id));
  const nonGroundedActIds = new Set(canonicalActs
    .filter((act) => act.authorityScope !== 'GROUNDED_BUSINESS' && act.type !== 'STOP')
    .map((act) => act.id));
  if (!canonicalActIds.size) return null;

  let hasUsefulContribution = false;
  const survivingSegments: string[] = [];
  const checksByUnit = new Map(trace.unitChecks.map((check) => [`${check.segmentIndex}:${check.unitIndex}`, check]));
  const spanIsSafe = (span: NonNullable<NonNullable<typeof trace.unitChecks>[number]['semanticSpans']>[number]) => {
    if (span.authorized !== true || span.classifierResult?.witnessProtocolError) return false;
    const realizedActIds = span.realizedActIds || [];
    if (!realizedActIds.length || !realizedActIds.every((actId) => canonicalActIds.has(actId))) return false;

    const classifierRefs = span.classifierResult?.realizedGroundingRefs || [];
    const realizedRefs = span.realizedGroundingRefs || [];
    const supportRefs = (span.classifierResult?.groundingSupport || []).map((support) => support.ref);
    const fullySupportedGrounded = span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'
      && span.classifierResult?.groundingEntailment === 'FULLY_SUPPORTED'
      && ['DIRECT_SOURCE', 'SUPPORTED_CHOICE_SYNTHESIS'].includes(span.classifierResult?.groundingBasis || '')
      && realizedRefs.length > 0
      && classifierRefs.length === realizedRefs.length
      && classifierRefs.every((ref) => realizedRefs.includes(ref))
      && supportRefs.length === realizedRefs.length
      && supportRefs.every((ref) => realizedRefs.includes(ref));
    if (fullySupportedGrounded) return true;

    return realizedRefs.length === 0
      && classifierRefs.length === 0
      && supportRefs.length === 0
      && span.classifierResult?.groundingEntailment === 'NOT_APPLICABLE'
      && span.classifierResult?.groundingBasis === 'NOT_APPLICABLE'
      && (span.classifierResult?.evidenceRequirement === 'NOT_REQUIRED'
        || span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_BOUNDARY')
      && realizedActIds.every((actId) => nonGroundedActIds.has(actId));
  };
  const spanAddsUsefulContribution = (span: NonNullable<NonNullable<typeof trace.unitChecks>[number]['semanticSpans']>[number]) => {
    const groundedUseful = span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'
      && span.classifierResult?.groundingEntailment === 'FULLY_SUPPORTED'
      && (span.realizedGroundingRefs || []).length > 0
      && ['MERCHANT_ENTITY_OR_POLICY', 'ACTION_OPTION_RISK_OR_OUTCOME'].includes(span.semanticTarget || '');
    const nonGroundedUseful = span.classifierResult?.evidenceRequirement === 'NOT_REQUIRED'
      && ['ANSWER_CONTENT', 'ANSWER_JUDGMENT', 'GUIDANCE_CONTENT'].includes(span.contributionKind)
      && ['TASK_OR_DOMAIN_FACT', 'CUSTOMER_SITUATION_FACT', 'ACTION_OPTION_RISK_OR_OUTCOME'].includes(span.semanticTarget || '')
      && ['MATERIAL_TO_CUSTOMER_TASK', 'SUPPORTS_CUSTOMER_TASK'].includes(span.taskDependency || '')
      && (span.realizedActIds || []).some((actId) => nonGroundedActIds.has(actId));
    return groundedUseful || nonGroundedUseful;
  };
  const closesIndependentBlock = (text: string) => /\r?\n[ \t]*\r?\n$/.test(text);

  for (const [segmentIndex, segment] of (generation.structuredSegments || []).entries()) {
    const spans: NonNullable<typeof trace.unitChecks>[number]['semanticSpans'] = [];
    let coverageProven = Boolean(segment.semanticUnits?.length);
    for (const [unitIndex, originalUnit] of (segment.semanticUnits || []).entries()) {
      const unitSpans = checksByUnit.get(`${segmentIndex}:${unitIndex}`)?.semanticSpans || [];
      // Unit boundaries are binding boundaries, not proof that a paragraph or
      // a condition has ended. Prove every unit, then group across the segment.
      if (!unitSpans.length || unitSpans.map((span) => span.exactText).join('') !== originalUnit.content) {
        coverageProven = false;
        break;
      }
      spans.push(...unitSpans);
    }
    if (!coverageProven) continue;

    const blocks: Array<typeof spans> = [];
    const continuationGroups = spans.map((span) => span.classifierResult?.continuationGroup);
    const hasAnyTypedContinuationGroup = continuationGroups.some((value) => Number.isInteger(value));
    const hasCompleteTypedContinuationGroups = hasAnyTypedContinuationGroup
      && continuationGroups.every((value) => Number.isInteger(value) && Number(value) >= 0);

    if (hasAnyTypedContinuationGroup) {
      // A partially/malformed transported grouping is fail-closed: do not fall back to
      // surface paragraph boundaries after the classifier already attempted to provide
      // semantic dependency topology. Conformance validates normal Runtime traces too.
      if (!hasCompleteTypedContinuationGroups || continuationGroups[0] !== 0) continue;
      let currentGroup = Number(continuationGroups[0]);
      let current: typeof spans = [];
      let topologyValid = true;
      for (let index = 0; index < spans.length; index += 1) {
        const group = Number(continuationGroups[index]);
        if (index > 0 && group !== currentGroup && group !== currentGroup + 1) {
          topologyValid = false;
          break;
        }
        if (group !== currentGroup) {
          blocks.push(current);
          current = [];
          currentGroup = group;
        }
        current.push(spans[index]);
      }
      if (!topologyValid) continue;
      if (current.length) blocks.push(current);
    } else {
      // Legacy conservative fallback for older verifier/provider envelopes that do not
      // carry typed continuation topology. Paragraph boundaries remain permission-reducing
      // only and never become positive business/semantic Authority.
      let current: typeof spans = [];
      for (const span of spans) {
        current.push(span);
        if (closesIndependentBlock(span.exactText)) {
          blocks.push(current);
          current = [];
        }
      }
      if (current.length) blocks.push(current);
    }

    const survivingBlocks: string[] = [];
    blocks.forEach((block) => {
      // Partial recovery is paragraph/block atomic: never stitch authorized
      // atoms around an unsafe atom from the same paragraph.
      if (!block.length || !block.every(spanIsSafe)) return;
      const text = block.map((span) => span.exactText).join('');
      if (!text.trim()) return;
      if (block.some(spanAddsUsefulContribution)) hasUsefulContribution = true;
      survivingBlocks.push(text);
    });
    const text = survivingBlocks.join('');
    if (text.trim()) survivingSegments.push(text);
  }
  if (!hasUsefulContribution) return null;
  const draft = survivingSegments.join('\n\n').trim();
  return draft || null;
}

function buildModelAvailabilityNotice(status: CustomerServiceGenerationResult['status']) {
  if (status === 'MODEL_NOT_CONFIGURED') return '当前模型服务还没有配置好，请稍后再试。';
  if (status === 'GENERATION_TIMEOUT') return '这边刚才响应超时了，请重试这一条。';
  return '这边刚才没有生成成功，请重试这一条。';
}

function buildSemanticConformanceFailureQualityReport(observedDecision: string, partialSafeRecovery: boolean): CustomerServiceQualityReport {
  return {
    status: 'WARN',
    checkedRuleCount: 1,
    blockerCount: 0,
    errorCount: 0,
    warningCount: 1,
    blockingIssueCount: 0,
    rewriteIssueCount: 0,
    scoreOnlyIssueCount: 1,
    naturalnessScore: 0,
    issues: [{
      ruleId: 'HVE_GROUNDED_SEMANTIC_CONFORMANCE',
      key: 'HVE_GROUNDED_SEMANTIC_CONFORMANCE_DEGRADATION',
      name: 'HVE Grounded 语义证明降级',
      category: 'SEMANTIC_AUTHORITY',
      severity: 'WARNING',
      passed: false,
      disposition: 'SCORE_ONLY',
      message: partialSafeRecovery
        ? '回复未完成全部任务；只保留已授权的独立一般帮助与必要证据边界，未证明业务事实未发送。'
        : '回复验证失败且没有可独立保留的已授权实质帮助；仅发送 fact-free useful service floor。未证明业务事实未发送，这不是知识缺失结论，也不算完成客户任务。',
      evidence: [observedDecision],
    }],
  };
}

function buildFactFreeUsefulServiceFloor(contract: CustomerServiceRuntimeReplyContract) {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  const target = plan?.answerObligation?.responseTarget || null;
  const merchantFactTurn = target?.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED';

  // This is the last-resort customer service floor for a Conformance self-failure.
  // It intentionally consumes only existing typed Canonical state. It never parses
  // raw wording, names a product, invents a merchant fact, or interprets the checker
  // error as knowledge absence. Normal/no-KB turns should still be answered by the
  // primary Generation model with general-domain knowledge; this floor exists only
  // when the single proof call itself cannot establish a safe merchant-fact body.
  if (merchantFactTurn) {
    return '这个具体结论我先不替你说死，但还能继续往下判断：可以先按已经确认的事实、适用条件和关键影响因素来判断；没有直接依据的部分就保留为不确定项，不把它补成店铺事实。';
  }

  return '这部分我先不替你下没有依据的结论，但还能继续往下判断：先按已经确认的条件和关键影响因素来看，没有直接依据的部分就明确保留为不确定项。';
}

function buildSummarySourceDiagnostics(source: CustomerServiceNlgSemanticFrameV1['context']['summarySource']) {
  if (source.authority !== 'SERVER_CANONICAL_TRANSCRIPT' && source.mode === 'NONE') return null;
  return {
    authority: source.authority,
    mode: source.mode,
    transformMode: source.transformMode,
    transcriptSource: source.transcriptSource,
    transcriptSourceId: source.transcriptSourceId,
    transcriptRevision: source.transcriptRevision,
    transcriptFingerprint: source.transcriptFingerprint,
    sourceUnitCount: source.messages.length,
    sourceUnits: source.messages.map((item) => ({
      sourceId: item.sourceId,
      sourceIndex: item.sourceIndex,
      turn: item.turn,
      role: item.role,
      preview: buildCandidateDiagnosticPreview(item.content),
    })),
  };
}

function buildSummaryTransformationDiagnostics(
  transformation: CustomerServiceGenerationResult['summaryTransformation'],
) {
  if (!transformation) return null;
  return {
    schemaVersion: transformation.schemaVersion,
    mode: transformation.mode,
    outputFormat: transformation.outputFormat,
    protocolDetected: transformation.protocolDetected,
    protocolValid: transformation.protocolValid,
    issueKeys: [...transformation.issueKeys],
    finalTextPreview: buildCandidateDiagnosticPreview(transformation.visibleText),
    items: transformation.items.map((item) => ({
      index: item.index,
      sources: item.sources.map((binding) => ({
        sourceRef: binding.sourceRef,
        evidenceSpans: [...binding.evidenceSpans],
      })),
      summaryTextPreview: buildCandidateDiagnosticPreview(item.content),
    })),
  };
}

function buildResolvedRoleIdentityDiagnostics(contract: CustomerServiceRuntimeReplyContract) {
  const resolved = contract.persona.resolvedRoleIdentity;
  if (!resolved) return null;
  return {
    schemaVersion: resolved.schemaVersion,
    authority: resolved.authority,
    configurationFingerprint: resolved.provenance.configurationFingerprint,
    speakerSource: resolved.speakerProjection.source,
    speakerProfileSource: resolved.speakerProjection.provenance.speakerProfileSource,
    compileEvidence: [...resolved.speakerProjection.provenance.compileEvidence],
    fieldSources: resolved.provenance.fieldSources.map((item) => ({ ...item })),
    conflictKeys: [...resolved.provenance.conflictKeys],
    missingFields: [...resolved.provenance.missingFields],
    defaultedFields: [...resolved.provenance.defaultedFields],
    accountExpression: { ...resolved.accountExpression },
    generationPrompt: {
      authority: resolved.generationPrompt.authority,
      roleConfigured: Boolean(resolved.generationPrompt.role),
      identityConfigured: Boolean(resolved.generationPrompt.identity),
    },
    storeExpression: {
      brandName: resolved.storeExpression.brandName,
      brandTone: resolved.storeExpression.brandTone,
      mainBusiness: resolved.storeExpression.mainBusiness,
    },
    channel: resolved.channel,
  };
}

function buildCandidateDiagnosticPreview(value: string | null | undefined) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function buildRoleInteractionPostureDiagnostics(contract: CustomerServiceRuntimeReplyContract) {
  const projection = contract.persona.interactionPostureProjection;
  if (!projection) return null;
  return {
    schemaVersion: projection.schemaVersion,
    authority: projection.authority,
    source: projection.source,
    effective: projection.effective,
    sourceModuleCount: projection.sourceModules.length,
    legacyUntypedModuleCount: projection.legacyUntypedModuleCount,
    issues: projection.issues,
  };
}

function buildSafePublicIdentityProjectionDiagnostics(
  value: CustomerServiceRuntimeReplyContract['orchestrationPlan']['identityConstraint']['customerVisibleIdentity'],
) {
  return {
    schemaVersion: value.schemaVersion,
    businessLabel: value.businessLabel,
    relationLabel: value.relationLabel,
    preferredSurfaceLabel: value.preferredSurfaceLabel,
    publicName: value.publicName,
    source: value.source,
    allowedSurfaceLabels: [...value.allowedSurfaceLabels],
    withheldInternalLabelCount: value.withheldInternalLabels.length,
  };
}

function resolveCustomerServiceConfiguredServiceScope(contract: CustomerServiceRuntimeReplyContract) {
  const resolved = contract.persona.resolvedRoleIdentity || null;
  if (resolved) {
    return [
      resolved.serviceContext.greetingServiceScope,
      resolved.serviceContext.serviceBoundary,
      resolved.storeExpression.mainBusiness,
    ]
      .map((item) => String(item || '').trim())
      .find(Boolean) || null;
  }

  const account = (contract.businessContext.accountProfile?.profile || {}) as Record<string, unknown>;
  const store = (contract.businessContext.storeProfile?.profile || {}) as Record<string, unknown>;
  return [account.greetingServiceScope, account.serviceScope, store.serviceBoundary, store.mainBusiness]
    .map((item) => String(item || '').trim())
    .find(Boolean) || null;
}
