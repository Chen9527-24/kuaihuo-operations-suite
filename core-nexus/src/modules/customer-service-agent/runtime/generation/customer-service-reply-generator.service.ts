import { Injectable } from '@nestjs/common';
import type { DeepSeekThinkingMode } from '../../../ai/deepseek.service';
import {
  CustomerServiceModelGateway,
  CustomerServiceModelResult,
  CustomerServiceModelStatus,
} from '../../infrastructure/model-gateway/customer-service-model-gateway.service';
import { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import type { CustomerServiceActType } from '../interaction/customer-service-interaction-plan.type';
import { getCustomerServiceActDescriptor } from '../compliance/customer-service-act-descriptor.registry';
import { projectCustomerServiceCanonicalActsForSemanticFrame } from './customer-service-nlg-execution-brief';
import { CustomerServiceGenerationPromptBuilder } from './customer-service-generation-prompt.builder';
import type { CustomerServiceMessageDeliveryPlan } from './customer-service-message-delivery-planner';
import type { CustomerServiceOutputRuleApplication } from '../../shared/context/customer-service-language-policy.util';
import {
  parseCustomerServiceTypedSourceBoundSummary,
  type CustomerServiceSourceBoundSummaryTransformationV3,
} from './customer-service-source-bound-summary-protocol';
import type { CustomerServiceSemanticConformanceTraceV1 } from './customer-service-semantic-conformance.type';

export type CustomerServiceGenerationStatus =
  | 'NOT_REQUESTED'
  | 'DETERMINISTIC'
  | 'GENERATED'
  | 'MODEL_NOT_CONFIGURED'
  | 'MODEL_ERROR'
  | 'GENERATION_EMPTY'
  | 'GENERATION_TRUNCATED'
  | 'GENERATION_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'GENERATION_FAILED_NOTICE';
export type CustomerServiceGenerationSource =
  | 'NONE'
  | 'EXACT_REPLY'
  | 'FIXED_QA'
  | 'TEMPLATE_REPLY'
  | 'MODEL'
  | 'COMPACT_MODEL_RETRY'
  | 'PLAIN_MODEL_RECOVERY'
  | 'MODEL_AVAILABILITY_FALLBACK'
  | 'FAILURE_NOTICE';
export type CustomerServiceGeneratedSegmentPurpose = 'ACKNOWLEDGE' | 'VALUE' | 'BOUNDARY' | 'QUESTION' | 'SERVICE_PRESENCE' | 'CLOSE';
export type CustomerServiceGeneratedSemanticActBinding = {
  actId: string;
  actType: CustomerServiceActType;
  groundingRefs: string[];
};
export type CustomerServiceGeneratedSemanticUnit = {
  index: number;
  content: string;
  bindings: CustomerServiceGeneratedSemanticActBinding[];
  source: 'HVE_REPLY_V2' | 'LEGACY_COMPATIBILITY' | 'CANONICAL_SINGLE_OWNER_RECOVERY' | 'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE';
};
export type CustomerServiceGeneratedSegment = {
  index: number;
  purposes: CustomerServiceGeneratedSegmentPurpose[];
  content: string;
  source: 'STRUCTURED_PROTOCOL' | 'SINGLE_FALLBACK';
  /** Stage 2E Final Grounding Provenance: server-owned projection from the canonical segment plan. */
  plannedActRefs?: string[];
  plannedActTypes?: string[];
  allowedGroundingRefs?: string[];
  provenanceAuthority?: 'CANONICAL_SEGMENT_PLAN';
  /** V12 HVE_REPLY_V2: model-declared semantic units structurally bound to selected Canonical Acts. */
  semanticUnits?: CustomerServiceGeneratedSemanticUnit[];
};
export type CustomerServicePresentationIntentV1 = {
  schemaVersion: 1;
  authority: 'GENERATION_PRESENTATION_ONLY';
  segments: Array<{
    index: number;
    content: string;
    source: 'STRUCTURED_CHAT_PRESENTATION' | 'RAW_TEXT_COMPATIBILITY';
  }>;
};
export type CustomerServiceModelAttempt = {
  mode: 'INITIAL' | 'COMPACT_RETRY' | 'PLAIN_RECOVERY';
  attempt: number;
  status: CustomerServiceModelStatus;
  requestedModel: string;
  actualModel: string | null;
  thinkingMode: DeepSeekThinkingMode;
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
};
export type CustomerServiceRewriteAttempt = {
  attempt: number;
  mode: 'COMPACT_MODEL_RETRY' | 'PLAIN_MODEL_RECOVERY' | 'MODEL_AVAILABILITY_FALLBACK' | 'FAILURE_NOTICE';
  status: CustomerServiceGenerationStatus;
  draft: string | null;
  model: string | null;
  elapsedMs: number;
  requestId: string | null;
  errorMessage: string | null;
  qualityStatus: 'PASS' | 'WARN' | 'FAIL' | 'NOT_RUN' | null;
  failedIssues: [];
};

export type CustomerServiceCandidateSafetyStatus = 'PASS' | 'BLOCKED' | 'NOT_RUN';
export type CustomerServiceCandidateQualityStatus = 'PASS' | 'WARN' | 'DEGRADED' | 'FAIL' | 'NOT_RUN';
export type CustomerServiceDeliveryDecision =
  | 'NOT_DECIDED'
  | 'SEND_PRIMARY'
  | 'SEND_MODEL_AVAILABILITY_FALLBACK';

export type CustomerServiceGenerationResult = {
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
  originalDraft: string | null;
  rewriteAttemptCount: number;
  rewriteHistory: CustomerServiceRewriteAttempt[];
  fallbackUsed: boolean;
  fallbackReason: string | null;
  initialElapsedMs: number;
  totalModelElapsedMs: number;
  modelCallCount: number;
  deliveryPlan: CustomerServiceMessageDeliveryPlan | null;
  /** Stage 2E structured HumanTurn realization evidence. Internal control markers are stripped before evaluation/delivery. */
  structuredSegments?: CustomerServiceGeneratedSegment[];
  /** Presentation-only intent captured from explicit model control markers before those markers are removed from visible text. */
  presentationIntent?: CustomerServicePresentationIntentV1;
  /** Stage 2E source-bound Summary producer evidence. Internal markers never reach Delivery. */
  summaryTransformation?: CustomerServiceSourceBoundSummaryTransformationV3;
  requestedModel: string | null;
  actualModel: string | null;
  thinkingMode: DeepSeekThinkingMode | 'UNKNOWN';
  requestedMaxTokens: number | null;
  effectiveMaxTokens: number | null;
  timeoutMs: number | null;
  finishReason: string | null;
  reasoningContentLength: number;
  visibleContentLength: number;
  emptyContentReason: string | null;
  initialGenerationStatus: CustomerServiceModelStatus | 'NOT_REQUESTED' | 'DETERMINISTIC';
  compactRetryAttempted: boolean;
  compactRetryStatus: CustomerServiceModelStatus | 'NOT_ATTEMPTED';
  rewriteAttempted: boolean;
  rewriteStatus: CustomerServiceModelStatus | 'NOT_ATTEMPTED';
  semanticFallbackUsed: boolean;
  finalReplySource: CustomerServiceGenerationSource;
  finalFailureReason: string | null;
  candidateSafetyStatus: CustomerServiceCandidateSafetyStatus;
  candidateQualityStatus: CustomerServiceCandidateQualityStatus;
  deliveryDecision: CustomerServiceDeliveryDecision;
  modelAttempts: CustomerServiceModelAttempt[];
  outputRuleApplications?: CustomerServiceOutputRuleApplication[];
  /** HVE-3 structured diagnostics; intentionally opaque here to avoid coupling generator core to evaluator modules. */
  hve3?: Record<string, unknown>;
  /** V12 bounded Canonical semantic authorization enforcement; never a quality/persona score. */
  semanticConformance?: CustomerServiceSemanticConformanceTraceV1;
  /** V1.99 protocol non-veto seal: provider text recovered from a non-send-authoritative machine-envelope failure. */
  protocolPreservation?: {
    applied: true;
    reason: string;
    source: 'INITIAL' | 'COMPACT_RETRY' | 'PLAIN_RECOVERY';
    segmentCount: number;
    invariant: 'NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY';
  };
  /** Stage 2E-R: immutable identity of the exact candidate evaluated, selected and delivered. */
  finalCandidateIdentity?: import('./customer-service-final-candidate').CustomerServiceFinalCandidateIdentityV1;
  /** Final Text Freeze proof. Delivery may segment this exact text but must not modify its content. */
  finalTextFreeze?: {
    frozen: true;
    sha256: string;
    frozenAtStage: 'POST_FINAL_CANDIDATE_SEAL';
    textLength: number;
    /** Delivery may change bubble boundaries/whitespace only; non-whitespace lexical content must remain exact. */
    deliveryIntegrity?: {
      verified: true;
      invariant: 'NON_WHITESPACE_LEXICAL_CONTENT_EXACT';
      mode: 'SINGLE' | 'SEQUENTIAL';
      segmentCount: number;
      sourceLexicalSha256: string;
      deliveryLexicalSha256: string;
      candidateLexicalSha256: string;
      /** Final Candidate seal is an integrity diagnostic only; it can never veto non-empty text at Delivery. */
      candidateSealStatus?: 'MATCH' | 'DRIFT_DEMOTED_TO_DIAGNOSTIC' | 'UNSEALED_DEMOTED_TO_DIAGNOSTIC';
      /** Presentation inconsistency may only demote to an exact single bubble. */
      presentationIntegrityStatus?: 'PRIMARY_PLAN' | 'EXACT_SINGLE_DEMOTION';
    };
  };
  pipelinePerformance?: {
    totalElapsedMs: number;
    recognitionElapsedMs: number;
    generationModelElapsedMs: number;
    localProcessingElapsedMs: number;
    modelCallCount: number;
    recognitionPath: 'FAST_PATH' | 'MODEL' | 'MODEL_REGENERATION' | 'HEURISTIC_FALLBACK';
  };
};

@Injectable()
export class CustomerServiceReplyGenerator {
  private static readonly INITIAL_MAX_TOKENS = 800;
  private static readonly INITIAL_TIMEOUT_MS = resolveGenerationTimeoutMs('CUSTOMER_SERVICE_HVE_INITIAL_TIMEOUT_MS', 15_000, 5_000, 60_000);
  private static readonly COMPACT_RETRY_MAX_TOKENS = CustomerServiceReplyGenerator.INITIAL_MAX_TOKENS;
  private static readonly COMPACT_RETRY_TIMEOUT_MS = resolveGenerationTimeoutMs('CUSTOMER_SERVICE_HVE_COMPACT_RETRY_TIMEOUT_MS', 8_000, 4_000, 30_000);
  private static readonly PLAIN_RECOVERY_MAX_TOKENS = 700;
  private static readonly PLAIN_RECOVERY_TIMEOUT_MS = resolveGenerationTimeoutMs('CUSTOMER_SERVICE_HVE_PLAIN_RECOVERY_TIMEOUT_MS', 8_000, 4_000, 30_000);

  constructor(
    private readonly modelGateway: CustomerServiceModelGateway,
    private readonly promptBuilder: CustomerServiceGenerationPromptBuilder,
  ) {}

  async generate(contract: CustomerServiceRuntimeReplyContract, requested: boolean): Promise<CustomerServiceGenerationResult> {
    if (!requested) return emptyResult('NOT_REQUESTED');
    if (contract.orchestrationPlan.route === 'EXACT_REPLY') {
      return deterministicResult(
        contract.replyPlan.exactReply,
        contract.replyPlan.fixedQa ? 'FIXED_QA' : 'EXACT_REPLY',
      );
    }
    if (contract.orchestrationPlan.route === 'TEMPLATE_REPLY') {
      return deterministicResult(contract.replyPlan.templateReply?.rendered ?? null, 'TEMPLATE_REPLY');
    }

    const prompt = this.promptBuilder.build(contract);
    const initial = await this.modelGateway.generate({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: contract.orchestrationPlan.route === 'CONTROLLED_GENERATION' ? 0.35 : 0.68,
      maxTokens: CustomerServiceReplyGenerator.INITIAL_MAX_TOKENS,
      timeoutMs: CustomerServiceReplyGenerator.INITIAL_TIMEOUT_MS,
      thinkingMode: 'DISABLED',
      // Ordinary HVE now has a canonical machine protocol too. Provider JSON-object mode prevents
      // syntax drift at the transport boundary; Runtime still validates/normalizes the exact HVE
      // schema and keeps legacy compatibility only where it cannot bypass current semantic authorization.
      jsonMode: usesStructuredHveJsonProtocol(contract),
    });
    const initialProtocolFailure = initial.ok && hasMalformedOrdinaryHveProtocolEnvelope(contract, initial.content);
    const effectiveInitial = initialProtocolFailure ? asHveProtocolInvalidModelResult(initial) : initial;
    const attempts = [toModelAttempt(effectiveInitial, 'INITIAL', 1)];
    if (initial.ok && !initialProtocolFailure) {
      // A non-empty provider response is only a Generation result until the current HVE machine protocol
      // is structurally normalized. In HVE lanes, raw/V1 text cannot bypass HVE_REPLY_V2 Act binding;
      // malformed or legacy envelopes may use only the existing single protocol-recovery call.
      return normalizeStructuredHveGeneration(
        contract,
        modelResult({ result: initial, prompt, source: 'MODEL', initial, attempts }),
      );
    }

    // Exactly one recovery call exists. Besides true provider no-content, it may now be used when
    // the provider returned a malformed machine-protocol envelope. This is a deterministic protocol
    // transport failure, not a quality/semantic judge and not a new retry path.
    if (effectiveInitial.status !== 'MODEL_NOT_CONFIGURED') {
      const recoveryRequiresStructuredProtocol = usesStructuredHveJsonProtocol(contract);
      const compactPrompt = isCanonicalSourceBoundSummaryExpected(contract)
        ? this.promptBuilder.buildCompact(contract)
        : initialProtocolFailure
          ? this.promptBuilder.buildProtocolRecovery(contract)
          : this.promptBuilder.buildAvailabilityRecovery(contract);
      const compact = await this.modelGateway.generate({
        messages: [
          { role: 'system', content: compactPrompt.system },
          { role: 'user', content: compactPrompt.user },
        ],
        temperature: initialProtocolFailure ? 0 : 0.3,
        maxTokens: CustomerServiceReplyGenerator.COMPACT_RETRY_MAX_TOKENS,
        timeoutMs: CustomerServiceReplyGenerator.COMPACT_RETRY_TIMEOUT_MS,
        thinkingMode: 'DISABLED',
        jsonMode: recoveryRequiresStructuredProtocol,
      });
      const compactProtocolFailure = compact.ok && hasMalformedOrdinaryHveProtocolEnvelope(contract, compact.content);
      const effectiveCompact = compactProtocolFailure ? asHveProtocolInvalidModelResult(compact) : compact;
      attempts.push(toModelAttempt(effectiveCompact, 'COMPACT_RETRY', 1));
      if (effectiveCompact.ok) {
        const recovered = modelResult({
          result: compact,
          prompt: compactPrompt,
          source: 'COMPACT_MODEL_RETRY',
          initial,
          compact,
          attempts,
          fallbackReason: initialProtocolFailure
            ? '首次模型返回的是无效 HVE_REPLY_V2 Act-bound 机器协议包络，已阻止协议数据进入客户可见回复，并使用既有结构化恢复调用。'
            : '首次模型调用未返回客户可见正文，已使用既有结构化模型可用性恢复调用。',
        });
        return normalizeStructuredHveGeneration(contract, recovered);
      }

      // If either structured attempt already contains provider-visible text, preserve it under the
      // existing protocol non-veto seal before spending another model call. Only true zero-visible-text
      // ordinary HVE generation may use the plain transport rescue below.
      const structuredPreserved = recoverFailedProviderVisibleGeneration({
        initial: effectiveInitial,
        compact: effectiveCompact,
        prompt: compactPrompt,
        attempts,
      });
      if (structuredPreserved) return structuredPreserved;

      if (!isCanonicalSourceBoundSummaryExpected(contract)) {
        const plainPrompt = this.promptBuilder.buildPlainAvailabilityRecovery(contract);
        const plain = await this.modelGateway.generate({
          messages: [
            { role: 'system', content: plainPrompt.system },
            { role: 'user', content: plainPrompt.user },
          ],
          temperature: 0.25,
          maxTokens: CustomerServiceReplyGenerator.PLAIN_RECOVERY_MAX_TOKENS,
          timeoutMs: CustomerServiceReplyGenerator.PLAIN_RECOVERY_TIMEOUT_MS,
          thinkingMode: 'DISABLED',
          // This last availability rescue deliberately changes only transport shape. It emits plain
          // provider-visible text, then HVE execution rebinds it to already-selected Canonical Acts/refs
          // and still runs the same Semantic Conformance classifier before Send.
          jsonMode: false,
        });
        const plainSegments = plain.ok ? extractRecoverableProviderVisibleSegments(plain.content) : [];
        const effectivePlain = plain.ok && !plainSegments.length
          ? asPlainAvailabilityInvalidModelResult(plain)
          : plain;
        attempts.push(toModelAttempt(effectivePlain, 'PLAIN_RECOVERY', 1));
        if (plainSegments.length) {
          return plainAvailabilityRecoveryResult({
            result: plain,
            segments: plainSegments,
            prompt: plainPrompt,
            initial,
            compact: effectiveCompact,
            attempts,
          });
        }
        return failedGenerationResult(effectiveInitial, effectiveCompact, effectivePlain, plainPrompt, attempts);
      }

      return failedGenerationResult(effectiveInitial, effectiveCompact, null, compactPrompt, attempts);
    }

    return failedGenerationResult(effectiveInitial, null, null, prompt, attempts);
  }

}


function resolveGenerationTimeoutMs(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}


const HVE_SEGMENT_MARKER = '⟦HVE_SEGMENT:';

function normalizeStructuredHveGeneration(
  contract: CustomerServiceRuntimeReplyContract,
  generation: CustomerServiceGenerationResult,
): CustomerServiceGenerationResult {
  const lane = contract.orchestrationPlan.interactionExecution?.lane;
  if (!['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane)) || !generation.draft?.trim()) return generation;

  if (isCanonicalSourceBoundSummaryExpected(contract)) {
    const summaryTransformation = parseCustomerServiceTypedSourceBoundSummary(generation.draft);
    // Canonical Transcript remains the factual source Authority. Typed source bindings are
    // provenance evidence, not send eligibility. If the model already returned non-empty text,
    // incomplete typed provenance may be diagnosed but can never erase the customer-visible answer.
    // Prefer the typed summaryText projection when it exists; otherwise preserve the provider text.
    const draft = summaryTransformation.visibleText.trim() || generation.draft.trim();
    return {
      ...generation,
      draft,
      visibleContentLength: draft.length,
      structuredSegments: undefined,
      presentationIntent: undefined,
      summaryTransformation,
    };
  }

  return normalizeOrdinaryHveChatPresentation(contract, generation);
}

function normalizeOrdinaryHveChatPresentation(
  contract: CustomerServiceRuntimeReplyContract,
  generation: CustomerServiceGenerationResult,
): CustomerServiceGenerationResult {
  const providerText = generation.draft?.trim() || null;
  if (!providerText) return generation;

  // V12 ordinary HVE output authority is HVE_REPLY_V2. The model still owns wording and
  // 1/N message boundaries, but every customer-visible semantic unit must be bound to
  // already-selected Canonical Act ids. Runtime validates only this machine contract;
  // it does not infer semantics from punctuation, length, role/domain wording or style.
  const parsed = parseCustomerServiceChatPresentationProtocol(providerText);
  const bindingError = parsed.protocol === 'HVE_REPLY_V2' && parsed.semanticSegments
    ? validateHveReplyV2CanonicalBindings(contract, parsed.semanticSegments)
    : requiresActBoundHveReplyV2(contract) ? 'HVE_REPLY_V2_REQUIRED' : null;
  if (parsed.protocolEnvelopeDetected && (!parsed.protocolValid || bindingError)) {
    // Defense-in-depth for callers that reach the normalizer directly. The production generate()
    // path detects malformed/legacy HVE protocol before normalization and routes it through the
    // existing single recovery call; HVE3 execution then preserves any recoverable provider-visible
    // text under the non-veto seal. This strict direct-normalizer guard therefore prevents V1/raw
    // compatibility from becoming Act-bound evidence without turning protocol failure into Send veto.
    return {
      ...generation,
      draft: null,
      visibleContentLength: 0,
      structuredSegments: undefined,
      presentationIntent: undefined,
      summaryTransformation: undefined,
      errorMessage: bindingError || parsed.error || 'HVE_REPLY_PROTOCOL_INVALID',
    };
  }
  if (requiresActBoundHveReplyV2(contract) && (parsed.protocol !== 'HVE_REPLY_V2' || !parsed.semanticSegments?.length)) {
    // Same defense-in-depth boundary for direct normalizer callers. The live generation path owns
    // protocol recovery/non-veto preservation before this point; raw/V1 text cannot be promoted to
    // HVE_REPLY_V2 structural authorization merely because it contains visible text.
    return {
      ...generation,
      draft: null,
      visibleContentLength: 0,
      structuredSegments: undefined,
      presentationIntent: undefined,
      summaryTransformation: undefined,
      errorMessage: '当前 HVE 客户回复必须使用 HVE_REPLY_V2 Act-bound 协议。',
    };
  }
  const normalizedSegments = parsed.protocolValid && parsed.segments.length
    ? parsed.segments
    : [providerText];
  const draft = normalizedSegments.join('\n\n').trim();
  const presentationIntent: CustomerServicePresentationIntentV1 = {
    schemaVersion: 1,
    authority: 'GENERATION_PRESENTATION_ONLY',
    segments: normalizedSegments.map((content, index) => ({
      index,
      content,
      source: parsed.protocol === 'HVE_REPLY_V2' ? 'STRUCTURED_CHAT_PRESENTATION' : 'RAW_TEXT_COMPATIBILITY',
    })),
  };
  const structuredSegments: CustomerServiceGeneratedSegment[] = parsed.protocol === 'HVE_REPLY_V2' && parsed.semanticSegments
    ? parsed.semanticSegments.map((segment, segmentIndex) => ({
      index: segmentIndex,
      purposes: ['VALUE'],
      content: segment.text,
      source: 'STRUCTURED_PROTOCOL' as const,
      semanticUnits: segment.units.map((unit, unitIndex) => ({
        index: unitIndex,
        content: unit.text,
        bindings: unit.bindings.map((binding) => ({
          actId: binding.actId,
          actType: binding.actType,
          groundingRefs: [...binding.groundingRefs],
        })),
        source: 'HVE_REPLY_V2' as const,
      })),
      plannedActRefs: uniqueProtocolStrings(segment.units.flatMap((unit) => unit.bindings.map((binding) => binding.actId))),
      plannedActTypes: uniqueProtocolStrings(segment.units.flatMap((unit) => unit.bindings.map((binding) => binding.actType))),
      allowedGroundingRefs: uniqueProtocolStrings(segment.units.flatMap((unit) => unit.bindings.flatMap((binding) => binding.groundingRefs))),
    }))
    : [{
      index: 0,
      purposes: ['VALUE'],
      content: draft,
      source: 'SINGLE_FALLBACK' as const,
      semanticUnits: [{
        index: 0,
        content: draft,
        bindings: [],
        source: 'LEGACY_COMPATIBILITY' as const,
      }],
    }];

  return {
    ...generation,
    draft,
    visibleContentLength: draft.length,
    structuredSegments,
    presentationIntent,
    summaryTransformation: undefined,
  };
}

function preserveProtocolUnverifiedGeneration(
  generation: CustomerServiceGenerationResult,
  segments: string[],
  reason: string,
  source: 'INITIAL' | 'COMPACT_RETRY',
): CustomerServiceGenerationResult {
  const normalized = segments.map((item) => String(item || '').trim()).filter(Boolean);
  const draft = normalized.join('\n\n').trim();
  if (!draft) return generation;
  return {
    ...generation,
    status: 'GENERATED',
    draft,
    visibleContentLength: draft.length,
    structuredSegments: undefined,
    presentationIntent: {
      schemaVersion: 1,
      authority: 'GENERATION_PRESENTATION_ONLY',
      segments: normalized.map((content, index) => ({
        index,
        content,
        source: 'RAW_TEXT_COMPATIBILITY' as const,
      })),
    },
    summaryTransformation: undefined,
    protocolPreservation: {
      applied: true,
      reason,
      source,
      segmentCount: normalized.length,
      invariant: 'NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY',
    },
  };
}

export function usesStructuredHveJsonProtocol(contract: CustomerServiceRuntimeReplyContract) {
  // Both ordinary customer-visible HVE replies and source-bound summaries have machine protocols.
  // Provider JSON-object mode enforces syntax only; Runtime remains the schema/version normalizer.
  const lane = contract.orchestrationPlan.interactionExecution?.lane;
  return ['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane)) || isCanonicalSourceBoundSummaryExpected(contract);
}

export function isCanonicalSourceBoundSummaryExpected(contract: CustomerServiceRuntimeReplyContract) {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  const target = plan?.answerObligation?.responseTarget;
  if (!plan
    || target?.requestedSpecificity !== 'SUMMARY'
    || target?.requiredDelta !== 'COMPLETE_CURRENT_FOCUS'
    || !Array.isArray(target.evidence)
    || !target.evidence.includes('UNDERSTANDING_GOAL:SUMMARIZE_CONVERSATION')) return false;
  // The Compiler is the only Summary Source producer. Generator is read-only:
  // never recalculate Source from active-context conversationHistory.
  const source = contract.generationContext.summarySource;
  return source?.authority === 'SERVER_CANONICAL_TRANSCRIPT'
    && source.mode === 'BOUNDED_CONVERSATION_HISTORY'
    && source.transformMode === 'SOURCE_BOUND_SUMMARY'
    && source.messages.length > 0;
}


export type CustomerServiceHveReplyV2Binding = {
  actId: string;
  actType: CustomerServiceActType;
  groundingRefs: string[];
};
export type CustomerServiceHveReplyV2Unit = {
  text: string;
  /** Producer-declared complete set of Grounding evidence actually consumed by this exact unit text. */
  usedGroundingRefs: string[];
  bindings: CustomerServiceHveReplyV2Binding[];
};
export type CustomerServiceHveReplyV2Segment = {
  text: string;
  units: CustomerServiceHveReplyV2Unit[];
};
type CustomerServiceChatPresentationProtocolParseResult = {
  protocolValid: boolean;
  protocolEnvelopeDetected: boolean;
  protocol: 'HVE_REPLY_V2' | 'HVE_REPLY_V1' | 'LEGACY_PRESENTATION_V1' | 'NONE';
  segments: string[];
  semanticSegments: CustomerServiceHveReplyV2Segment[] | null;
  error: string | null;
};

function parseCustomerServiceChatPresentationProtocol(value: string): CustomerServiceChatPresentationProtocolParseResult {
  const raw = String(value || '').trim();
  if (!raw) return { protocolValid: false, protocolEnvelopeDetected: false, protocol: 'NONE', segments: [], semanticSegments: null, error: 'HVE_REPLY_PROTOCOL_INVALID' };
  const stripped = stripJsonCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const repaired = escapeInvalidJsonControlCharactersInsideStrings(stripped);
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return {
        protocolValid: false,
        protocolEnvelopeDetected: looksLikeMachineProtocolEnvelope(stripped),
        protocol: 'NONE',
        segments: [],
        semanticSegments: null,
        error: 'HVE_REPLY_PROTOCOL_INVALID',
      };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { protocolValid: false, protocolEnvelopeDetected: true, protocol: 'NONE', segments: [], semanticSegments: null, error: 'HVE_REPLY_PROTOCOL_INVALID' };
  }
  const root = parsed as { version?: unknown; segments?: unknown; presentationSegments?: unknown };

  if (String(root.version || '').trim() === 'HVE_REPLY_V2') {
    const semanticSegments = normalizeHveReplyV2Segments(root.segments);
    if (semanticSegments) {
      return {
        protocolValid: true,
        protocolEnvelopeDetected: true,
        protocol: 'HVE_REPLY_V2',
        segments: semanticSegments.map((segment) => segment.text),
        semanticSegments,
        error: null,
      };
    }
    return { protocolValid: false, protocolEnvelopeDetected: true, protocol: 'NONE', segments: [], semanticSegments: null, error: 'HVE_REPLY_V2_INVALID' };
  }

  if (Array.isArray(root.segments)) {
    const segments = normalizeExplicitProtocolSegments(root.segments);
    if (segments.length === root.segments.length && segments.length > 0) {
      const canonical = String(root.version || '').trim() === 'HVE_REPLY_V1';
      return { protocolValid: true, protocolEnvelopeDetected: true, protocol: canonical ? 'HVE_REPLY_V1' : 'LEGACY_PRESENTATION_V1', segments, semanticSegments: null, error: null };
    }
    return { protocolValid: false, protocolEnvelopeDetected: true, protocol: 'NONE', segments: [], semanticSegments: null, error: 'HVE_REPLY_PROTOCOL_INVALID' };
  }

  if (Array.isArray(root.presentationSegments)) {
    const segments = normalizeExplicitProtocolSegments(root.presentationSegments);
    if (segments.length === root.presentationSegments.length && segments.length > 0) {
      return { protocolValid: true, protocolEnvelopeDetected: true, protocol: 'LEGACY_PRESENTATION_V1', segments, semanticSegments: null, error: null };
    }
  }
  return { protocolValid: false, protocolEnvelopeDetected: true, protocol: 'NONE', segments: [], semanticSegments: null, error: 'HVE_REPLY_PROTOCOL_INVALID' };
}

function normalizeHveReplyV2Segments(value: unknown): CustomerServiceHveReplyV2Segment[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const segments: CustomerServiceHveReplyV2Segment[] = [];
  for (const rawSegment of value) {
    if (!rawSegment || typeof rawSegment !== 'object' || Array.isArray(rawSegment)) return null;
    const segment = rawSegment as { text?: unknown; units?: unknown };
    if (typeof segment.text !== 'string' || !segment.text.trim() || !Array.isArray(segment.units) || !segment.units.length) return null;
    const units: CustomerServiceHveReplyV2Unit[] = [];
    for (const rawUnit of segment.units) {
      if (!rawUnit || typeof rawUnit !== 'object' || Array.isArray(rawUnit)) return null;
      const unit = rawUnit as { text?: unknown; usedGroundingRefs?: unknown; bindings?: unknown };
      if (typeof unit.text !== 'string' || !unit.text || !Array.isArray(unit.bindings) || !unit.bindings.length) return null;
      if (unit.usedGroundingRefs !== undefined && !Array.isArray(unit.usedGroundingRefs)) return null;
      const rawUsedGroundingRefs = Array.isArray(unit.usedGroundingRefs) ? unit.usedGroundingRefs : [];
      const usedGroundingRefs = rawUsedGroundingRefs.map((item) => String(item || '').trim()).filter(Boolean);
      if (usedGroundingRefs.length !== rawUsedGroundingRefs.length) return null;
      const bindings: CustomerServiceHveReplyV2Binding[] = [];
      for (const rawBinding of unit.bindings) {
        if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) return null;
        const binding = rawBinding as { actId?: unknown; actType?: unknown; groundingRefs?: unknown };
        const actId = String(binding.actId || '').trim();
        const actType = String(binding.actType || '').trim() as CustomerServiceActType;
        if (!actId || !actType || !Array.isArray(binding.groundingRefs)) return null;
        const groundingRefs = binding.groundingRefs.map((item) => String(item || '').trim()).filter(Boolean);
        if (groundingRefs.length !== binding.groundingRefs.length) return null;
        bindings.push({ actId, actType, groundingRefs: uniqueProtocolStrings(groundingRefs) });
      }
      units.push({
        text: unit.text,
        usedGroundingRefs: uniqueProtocolStrings(usedGroundingRefs),
        bindings,
      });
    }
    // Units are semantic annotations of the exact customer-visible segment, not a
    // second renderer. Their text must partition the segment exactly.
    if (units.map((unit) => unit.text).join('') !== segment.text) return null;
    segments.push({ text: segment.text, units });
  }
  return segments;
}

const PRIMARY_TASK_PREFIX_NEUTRAL_ACT_TYPES = new Set<CustomerServiceActType>([
  'PRESENCE_ACK',
  'LIGHT_ACK',
  'EMOTIONAL_ACK',
  'REASSURE',
  'ACKNOWLEDGE_PREFERENCE',
  'ACKNOWLEDGE_PROBLEM',
]);

export function validateHveReplyV2PrimaryTaskSurfaceOrder(
  contract: CustomerServiceRuntimeReplyContract,
  segments: CustomerServiceHveReplyV2Segment[],
): string | null {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan || plan.answerObligation?.responseTarget?.focus !== 'RECOMMENDATION') return null;
  const requiredRecommendation = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts)
    .find((act) => act.necessity === 'REQUIRED'
      && act.type === 'RECOMMEND_GROUNDED_ITEM'
      && (act.allowedGroundingRefs || []).length > 0);
  if (!requiredRecommendation) return null;

  // A minimal reception-only acknowledgement may precede the answer. Any other selected
  // customer-visible move is substantive for ordering purposes, so the executable Canonical
  // primary must already be bound in that first substantive unit. This validates existing
  // Authority; it creates no Act/ref and does not inspect or rewrite customer-visible wording.
  const firstSubstantiveUnit = segments
    .flatMap((segment) => segment.units)
    .find((unit) => unit.bindings.some((binding) => !PRIMARY_TASK_PREFIX_NEUTRAL_ACT_TYPES.has(binding.actType)));
  if (!firstSubstantiveUnit) return 'HVE_REPLY_V2_PRIMARY_SUBSTANTIVE_UNIT_MISSING';
  if (!firstSubstantiveUnit.bindings.some((binding) => binding.actId === requiredRecommendation.id
    && binding.actType === 'RECOMMEND_GROUNDED_ITEM')) {
    return 'HVE_REPLY_V2_PRIMARY_REQUIRED_RECOMMENDATION_NOT_FIRST_SUBSTANTIVE_UNIT';
  }
  return null;
}

export function validateHveReplyV2CanonicalBindingIntegrity(
  contract: CustomerServiceRuntimeReplyContract,
  segments: CustomerServiceHveReplyV2Segment[],
): string | null {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return 'HVE_REPLY_V2_CANONICAL_PLAN_MISSING';
  const projectedActs = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts);
  const byId = new Map(projectedActs.map((act) => [act.id, act]));
  for (const segment of segments) {
    for (const unit of segment.units) {
      const boundGroundingRefs = new Set<string>();
      for (const binding of unit.bindings) {
        const act = byId.get(binding.actId);
        if (!act || act.type !== binding.actType) return 'HVE_REPLY_V2_UNSELECTED_OR_MISMATCHED_ACT_BINDING';
        const descriptor = getCustomerServiceActDescriptor(act.type);
        const allowedGroundingRefs = new Set(act.allowedGroundingRefs || []);
        if (descriptor.authorityScope === 'GROUNDED_BUSINESS') {
          if (!binding.groundingRefs.length) return 'HVE_REPLY_V2_GROUNDED_BINDING_REQUIRES_REF';
          if (binding.groundingRefs.some((ref) => !allowedGroundingRefs.has(ref))) return 'HVE_REPLY_V2_GROUNDING_REF_OUTSIDE_ACT_AUTHORITY';
          for (const ref of binding.groundingRefs) boundGroundingRefs.add(ref);
        } else if (binding.groundingRefs.length) {
          return 'HVE_REPLY_V2_NON_GROUNDED_ACT_CANNOT_CLAIM_GROUNDING';
        }
      }
      const usedGroundingRefs = new Set(unit.usedGroundingRefs || []);
      if ([...usedGroundingRefs].some((ref) => !boundGroundingRefs.has(ref))) {
        return 'HVE_REPLY_V2_USED_GROUNDING_REF_UNBOUND';
      }
      if ([...boundGroundingRefs].some((ref) => !usedGroundingRefs.has(ref))) {
        return 'HVE_REPLY_V2_BOUND_GROUNDING_REF_NOT_DECLARED_USED';
      }
    }
  }
  return null;
}

export function validateHveReplyV2CanonicalBindings(
  contract: CustomerServiceRuntimeReplyContract,
  segments: CustomerServiceHveReplyV2Segment[],
): string | null {
  const integrityError = validateHveReplyV2CanonicalBindingIntegrity(contract, segments);
  if (integrityError) return integrityError;
  const primarySurfaceError = validateHveReplyV2PrimaryTaskSurfaceOrder(contract, segments);
  if (primarySurfaceError) return primarySurfaceError;
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return 'HVE_REPLY_V2_CANONICAL_PLAN_MISSING';
  const projectedActs = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts);
  const declaredActIds = new Set(segments.flatMap((segment) => segment.units.flatMap((unit) => unit.bindings.map((binding) => binding.actId))));
  const missingRequired = projectedActs
    .filter((act) => act.necessity === 'REQUIRED' && act.type !== 'STOP')
    .filter((act) => !declaredActIds.has(act.id));
  return missingRequired.length ? 'HVE_REPLY_V2_REQUIRED_ACT_BINDING_MISSING' : null;
}

export function requiresActBoundHveReplyV2(contract: CustomerServiceRuntimeReplyContract) {
  if (isCanonicalSourceBoundSummaryExpected(contract)) return false;
  const lane = contract.orchestrationPlan.interactionExecution?.lane;
  return ['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane));
}

export function parseCustomerServiceHveReplyV2ForVerification(value: string) {
  const parsed = parseCustomerServiceChatPresentationProtocol(value);
  return parsed.protocol === 'HVE_REPLY_V2' && parsed.protocolValid ? parsed.semanticSegments : null;
}

function uniqueProtocolStrings(values: unknown[]) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function hasMalformedOrdinaryHveProtocolEnvelope(
  contract: CustomerServiceRuntimeReplyContract,
  value: string,
) {
  if (isCanonicalSourceBoundSummaryExpected(contract)) return false;
  const lane = contract.orchestrationPlan.interactionExecution?.lane;
  if (!['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane))) return false;
  const parsed = parseCustomerServiceChatPresentationProtocol(value);
  if (requiresActBoundHveReplyV2(contract)) {
    if (!parsed.protocolValid || parsed.protocol !== 'HVE_REPLY_V2' || !parsed.semanticSegments?.length) return true;
    return Boolean(validateHveReplyV2CanonicalBindings(contract, parsed.semanticSegments));
  }
  return parsed.protocolEnvelopeDetected && !parsed.protocolValid;
}

function asHveProtocolInvalidModelResult(result: CustomerServiceModelResult): CustomerServiceModelResult {
  // Preserve provider content as evidence/recovery material. Protocol validity may request the one
  // existing recovery call, but it has no authority to rewrite a non-empty provider result into
  // synthetic emptiness and thereby masquerade as model availability.
  return {
    ...result,
    ok: false,
    status: 'INVALID_RESPONSE',
    content: result.content,
    visibleContentLength: String(result.content || '').trim().length,
    emptyContentReason: null,
    errorMessage: '模型返回的 HVE_REPLY_V2 机器协议无效；已保留 provider 非空内容供 non-veto recovery。',
  };
}

function asPlainAvailabilityInvalidModelResult(result: CustomerServiceModelResult): CustomerServiceModelResult {
  const raw = String(result.content || '').trim();
  return {
    ...result,
    ok: false,
    status: raw ? 'INVALID_RESPONSE' : 'EMPTY_CONTENT',
    content: result.content,
    visibleContentLength: 0,
    emptyContentReason: raw ? 'INVALID_RESPONSE' : 'BLANK_CONTENT',
    errorMessage: raw
      ? 'plain transport recovery 返回了非空机器包络，但没有可安全恢复的客户正文。'
      : 'plain transport recovery 没有返回客户正文。',
  };
}

function looksLikeMachineProtocolEnvelope(value: string) {
  const text = String(value || '').trim();
  return /^\{\s*["']/u.test(text)
    || /HVE_REPLY_V[12]/u.test(text)
    || /["'](?:segments|presentationSegments)["']\s*:/u.test(text);
}

function escapeInvalidJsonControlCharactersInsideStrings(value: string) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (const char of String(value || '')) {
    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      result += char;
      inString = false;
      continue;
    }
    const code = char.codePointAt(0) || 0;
    if (code < 0x20) {
      if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      else result += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    result += char;
  }
  return result;
}

function normalizeExplicitProtocolSegments(values: unknown[]) {
  const segments: string[] = [];
  for (const value of values) {
    const compatibleText = typeof value === 'string'
      ? value
      : value && typeof value === 'object' && !Array.isArray(value)
        ? (typeof (value as { text?: unknown }).text === 'string'
          ? (value as { text: string }).text
          : typeof (value as { content?: unknown }).content === 'string'
            ? (value as { content: string }).content
            : '')
        : '';
    const content = stripHveInternalControlTokens(compatibleText).trim();
    if (!content) return [];
    segments.push(content);
  }
  return segments;
}

function stripJsonCodeFence(value: string) {
  const text = String(value || '').trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match ? match[1].trim() : text;
}

function stripHveInternalControlTokens(value: string) {
  return String(value || '')
    .replace(/⟦HVE_SEGMENT:[A-Z_+]+⟧/gu, '')
    .trim();
}

function parseHveStructuredSegments(value: string): CustomerServiceGeneratedSegment[] {
  const text = String(value || '').trim();
  if (!text) return [];
  const markerPattern = /⟦HVE_SEGMENT:([A-Z_+]+)⟧/gu;
  const matches = [...text.matchAll(markerPattern)];
  if (matches.length) {
    const segments: CustomerServiceGeneratedSegment[] = [];
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const start = (match.index || 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index || text.length) : text.length;
      const content = stripStructuredControlTokens(text.slice(start, end)).trim();
      if (!content) continue;
      const purposes = match[1].split('+').filter(isGeneratedSegmentPurpose);
      segments.push({
        index: segments.length,
        purposes: purposes.length ? purposes : ['VALUE'],
        content,
        source: 'STRUCTURED_PROTOCOL',
      });
    }
    if (segments.length) return segments;
  }
  const clean = stripStructuredControlTokens(text).trim();
  if (!clean) return [];
  // Natural paragraphs are formatting inside one model reply, not message-boundary authority.
  // Only the explicit structured protocol may create generated message units.
  return [{ index: 0, purposes: ['VALUE'], content: clean, source: 'SINGLE_FALLBACK' }];
}


function stripStructuredControlTokens(value: string) {
  return String(value || '')
    .replace(/```(?:json|text)?/giu, '')
    .replace(/```/gu, '')
    .replace(/⟦HVE_SEGMENT:[A-Z_+]+⟧/gu, '')
    .trim();
}

function isGeneratedSegmentPurpose(value: string): value is CustomerServiceGeneratedSegmentPurpose {
  return ['ACKNOWLEDGE', 'VALUE', 'BOUNDARY', 'QUESTION', 'SERVICE_PRESENCE', 'CLOSE'].includes(value);
}

function modelResult(input: {
  result: CustomerServiceModelResult;
  prompt: { system: string; user: string };
  source: CustomerServiceGenerationSource;
  initial: CustomerServiceModelResult;
  compact?: CustomerServiceModelResult;
  plainRecovery?: CustomerServiceModelResult;
  attempts: CustomerServiceModelAttempt[];
  fallbackReason?: string;
}): CustomerServiceGenerationResult {
  const { result, initial, compact, plainRecovery, attempts } = input;
  const totalElapsedMs = attempts.reduce((sum, item) => sum + item.elapsedMs, 0);
  return {
    status: result.ok ? 'GENERATED' : mapGenerationStatus(result.status),
    draft: result.ok ? result.content : null,
    source: result.ok ? input.source : 'NONE',
    model: result.actualModel || initial.actualModel || null,
    elapsedMs: totalElapsedMs,
    requestId: result.requestId || initial.requestId || null,
    usage: mergeUsage(attempts),
    errorMessage: result.errorMessage,
    promptPreview: input.prompt,
    rewriteCount: 0,
    originalDraft: initial.content.trim() || null,
    rewriteAttemptCount: 0,
    rewriteHistory: [
      ...(compact ? [{
        attempt: 1,
        mode: 'COMPACT_MODEL_RETRY' as const,
        status: compact.ok ? 'GENERATED' as const : mapGenerationStatus(compact.status),
        draft: compact.content.trim() || null,
        model: compact.actualModel || null,
        elapsedMs: compact.elapsedMs,
        requestId: compact.requestId || null,
        errorMessage: compact.errorMessage,
        qualityStatus: null,
        failedIssues: [] as [],
      }] : []),
      ...(plainRecovery ? [{
        attempt: 1,
        mode: 'PLAIN_MODEL_RECOVERY' as const,
        status: plainRecovery.ok ? 'GENERATED' as const : mapGenerationStatus(plainRecovery.status),
        draft: plainRecovery.content.trim() || null,
        model: plainRecovery.actualModel || null,
        elapsedMs: plainRecovery.elapsedMs,
        requestId: plainRecovery.requestId || null,
        errorMessage: plainRecovery.errorMessage,
        qualityStatus: null,
        failedIssues: [] as [],
      }] : []),
    ],
    fallbackUsed: ['COMPACT_MODEL_RETRY', 'PLAIN_MODEL_RECOVERY'].includes(input.source),
    fallbackReason: input.source === 'PLAIN_MODEL_RECOVERY'
      ? (input.fallbackReason || '结构化生成与结构化恢复都没有形成可恢复正文，已使用一次 plain transport availability rescue。')
      : input.source === 'COMPACT_MODEL_RETRY'
        ? (input.fallbackReason || '首次模型调用未返回客户可见正文，已使用结构化模型可用性恢复调用。')
        : null,
    initialElapsedMs: initial.elapsedMs,
    totalModelElapsedMs: totalElapsedMs,
    modelCallCount: attempts.length,
    deliveryPlan: null,
    requestedModel: initial.requestedModel || result.requestedModel || null,
    actualModel: initial.actualModel || result.actualModel || null,
    thinkingMode: initial.thinkingMode,
    requestedMaxTokens: initial.requestedMaxTokens,
    effectiveMaxTokens: initial.effectiveMaxTokens,
    timeoutMs: initial.timeoutMs,
    finishReason: initial.finishReason,
    reasoningContentLength: initial.reasoningContentLength,
    visibleContentLength: initial.visibleContentLength,
    emptyContentReason: initial.emptyContentReason,
    initialGenerationStatus: initial.status,
    compactRetryAttempted: Boolean(compact),
    compactRetryStatus: compact?.status ?? 'NOT_ATTEMPTED',
    rewriteAttempted: false,
    rewriteStatus: 'NOT_ATTEMPTED',
    semanticFallbackUsed: false,
    finalReplySource: result.ok ? input.source : 'NONE',
    finalFailureReason: result.ok ? null : result.errorMessage,
    candidateSafetyStatus: 'NOT_RUN',
    candidateQualityStatus: 'NOT_RUN',
    deliveryDecision: 'NOT_DECIDED',
    modelAttempts: attempts,
  };
}

function plainAvailabilityRecoveryResult(input: {
  result: CustomerServiceModelResult;
  segments: string[];
  prompt: { system: string; user: string };
  initial: CustomerServiceModelResult;
  compact: CustomerServiceModelResult;
  attempts: CustomerServiceModelAttempt[];
}): CustomerServiceGenerationResult {
  const draft = input.segments.join('\n\n').trim();
  const base = modelResult({
    result: input.result,
    prompt: input.prompt,
    source: 'PLAIN_MODEL_RECOVERY',
    initial: input.initial,
    compact: input.compact,
    plainRecovery: input.result,
    attempts: input.attempts,
    fallbackReason: '结构化初始生成和结构化恢复均未形成可恢复客户正文；plain transport rescue 仅恢复同一 Canonical 语义范围，随后仍需 Runtime 绑定与 Semantic Conformance。',
  });
  return {
    ...base,
    status: 'GENERATED',
    draft,
    source: 'PLAIN_MODEL_RECOVERY',
    visibleContentLength: draft.length,
    errorMessage: null,
    finalReplySource: 'PLAIN_MODEL_RECOVERY',
    finalFailureReason: null,
    presentationIntent: {
      schemaVersion: 1,
      authority: 'GENERATION_PRESENTATION_ONLY',
      segments: input.segments.map((content, index) => ({
        index,
        content,
        source: 'RAW_TEXT_COMPATIBILITY' as const,
      })),
    },
    structuredSegments: undefined,
    protocolPreservation: {
      applied: true,
      reason: 'PLAIN_TRANSPORT_AVAILABILITY_RECOVERY_REQUIRES_CANONICAL_REBIND_AND_CONFORMANCE',
      source: 'PLAIN_RECOVERY',
      segmentCount: input.segments.length,
      invariant: 'NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY',
    },
  };
}

function recoverFailedProviderVisibleGeneration(input: {
  initial: CustomerServiceModelResult;
  compact: CustomerServiceModelResult | null;
  prompt: { system: string; user: string };
  attempts: CustomerServiceModelAttempt[];
}): CustomerServiceGenerationResult | null {
  const candidates = [
    ...(input.compact ? [{ result: input.compact, source: 'COMPACT_RETRY' as const }] : []),
    { result: input.initial, source: 'INITIAL' as const },
  ].map((item) => ({ ...item, segments: extractRecoverableProviderVisibleSegments(item.result.content) }));
  const recoverable = candidates.find((item) => item.segments.length > 0);
  if (!recoverable) return null;
  const draft = recoverable.segments.join('\n\n').trim();
  if (!draft) return null;
  const final = input.compact || input.initial;
  const base = modelResult({
    result: final,
    prompt: input.prompt,
    source: 'NONE',
    initial: input.initial,
    compact: input.compact || undefined,
    attempts: input.attempts,
  });
  const source: CustomerServiceGenerationSource = recoverable.source === 'COMPACT_RETRY'
    ? 'COMPACT_MODEL_RETRY'
    : 'MODEL';
  return {
    ...base,
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
      segments: recoverable.segments.map((content, index) => ({
        index,
        content,
        source: 'RAW_TEXT_COMPATIBILITY' as const,
      })),
    },
    structuredSegments: undefined,
    protocolPreservation: {
      applied: true,
      reason: 'MACHINE_PROTOCOL_OR_BINDING_INVALID_BUT_PROVIDER_VISIBLE_TEXT_RECOVERED',
      source: recoverable.source,
      segmentCount: recoverable.segments.length,
      invariant: 'NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY',
    },
  };
}

function failedGenerationResult(
  initial: CustomerServiceModelResult,
  compact: CustomerServiceModelResult | null,
  plainRecovery: CustomerServiceModelResult | null,
  prompt: { system: string; user: string },
  attempts: CustomerServiceModelAttempt[],
): CustomerServiceGenerationResult {
  const final = plainRecovery || compact || initial;
  const base = modelResult({
    result: final,
    prompt,
    source: 'NONE',
    initial,
    compact: compact || undefined,
    plainRecovery: plainRecovery || undefined,
    attempts,
  });

  // Last defense: availability is eligible only when every attempted transport produced zero
  // recoverable provider-visible text. Plain recovery is checked first because it is the latest attempt.
  const recoverable = [
    ...(plainRecovery ? [{ result: plainRecovery, source: 'PLAIN_RECOVERY' as const }] : []),
    ...(compact ? [{ result: compact, source: 'COMPACT_RETRY' as const }] : []),
    { result: initial, source: 'INITIAL' as const },
  ].map((item) => ({ ...item, segments: extractRecoverableProviderVisibleSegments(item.result.content) }))
    .find((item) => item.segments.length > 0);

  if (!recoverable) return base;

  const draft = recoverable.segments.join('\n\n').trim();
  if (!draft) return base;
  const source: CustomerServiceGenerationSource = recoverable.source === 'PLAIN_RECOVERY'
    ? 'PLAIN_MODEL_RECOVERY'
    : recoverable.source === 'COMPACT_RETRY'
      ? 'COMPACT_MODEL_RETRY'
      : 'MODEL';
  return {
    ...base,
    status: 'GENERATED',
    draft,
    source,
    visibleContentLength: draft.length,
    errorMessage: null,
    fallbackUsed: source !== 'MODEL',
    fallbackReason: source === 'PLAIN_MODEL_RECOVERY'
      ? 'plain transport availability rescue returned recoverable provider-visible text.'
      : null,
    finalReplySource: source,
    finalFailureReason: null,
    presentationIntent: {
      schemaVersion: 1,
      authority: 'GENERATION_PRESENTATION_ONLY',
      segments: recoverable.segments.map((content, index) => ({
        index,
        content,
        source: 'RAW_TEXT_COMPATIBILITY' as const,
      })),
    },
    structuredSegments: undefined,
    protocolPreservation: {
      applied: true,
      reason: 'MACHINE_PROTOCOL_OR_BINDING_INVALID_BUT_PROVIDER_VISIBLE_TEXT_RECOVERED',
      source: recoverable.source,
      segmentCount: recoverable.segments.length,
      invariant: 'NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY',
    },
  };
}

export function extractRecoverableProviderVisibleSegments(value: string): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const parsed = parseCustomerServiceChatPresentationProtocol(raw);
  if (parsed.segments.length) return parsed.segments.map((item) => String(item || '').trim()).filter(Boolean);

  const stripped = stripJsonCodeFence(raw);
  let root: unknown = null;
  try {
    root = JSON.parse(stripped);
  } catch {
    try {
      root = JSON.parse(escapeInvalidJsonControlCharactersInsideStrings(stripped));
    } catch {
      root = null;
    }
  }
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    const envelope = root as { segments?: unknown; presentationSegments?: unknown };
    for (const candidate of [envelope.segments, envelope.presentationSegments]) {
      if (!Array.isArray(candidate) || !candidate.length) continue;
      const segments = candidate.map((item) => {
        if (typeof item === 'string') return item.trim();
        if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
        return typeof (item as { text?: unknown }).text === 'string'
          ? String((item as { text?: unknown }).text).trim()
          : '';
      }).filter(Boolean);
      if (segments.length) return segments;
    }
    const record = root as Record<string, unknown>;
    for (const key of ['response', 'reply', 'answer', 'content', 'message', 'text']) {
      if (typeof record[key] === 'string' && String(record[key]).trim()) return [String(record[key]).trim()];
    }
    const stringValues = Object.values(record).filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
    if (stringValues.length === 1) return [stringValues[0].trim()];
  }

  // Plain provider text is already customer-visible content. Machine envelopes are never emitted raw;
  // if a malformed envelope has no safely recoverable text field, the existing single recovery call
  // remains the only availability mechanism.
  return looksLikeMachineProtocolEnvelope(stripped) ? [] : [stripStructuredControlTokens(raw)].filter(Boolean);
}

function toModelAttempt(
  result: CustomerServiceModelResult,
  mode: CustomerServiceModelAttempt['mode'],
  attempt: number,
): CustomerServiceModelAttempt {
  return {
    mode,
    attempt,
    status: result.status,
    requestedModel: result.requestedModel,
    actualModel: result.actualModel || null,
    thinkingMode: result.thinkingMode,
    requestedMaxTokens: result.requestedMaxTokens,
    effectiveMaxTokens: result.effectiveMaxTokens,
    timeoutMs: result.timeoutMs,
    finishReason: result.finishReason,
    promptTokens: Number(result.usage.promptTokens || 0),
    completionTokens: Number(result.usage.completionTokens || 0),
    reasoningTokens: Number(result.usage.reasoningTokens || 0),
    reasoningContentLength: result.reasoningContentLength,
    visibleContentLength: result.visibleContentLength,
    emptyContentReason: result.emptyContentReason,
    truncated: result.truncated,
    timedOut: result.timedOut,
    elapsedMs: result.elapsedMs,
    requestId: result.requestId || null,
    errorMessage: result.errorMessage,
  };
}

function mergeUsage(attempts: CustomerServiceModelAttempt[]) {
  return attempts.reduce<Record<string, number>>((usage, item) => {
    usage.promptTokens = (usage.promptTokens || 0) + item.promptTokens;
    usage.completionTokens = (usage.completionTokens || 0) + item.completionTokens;
    usage.reasoningTokens = (usage.reasoningTokens || 0) + item.reasoningTokens;
    usage.totalTokens = (usage.totalTokens || 0) + item.promptTokens + item.completionTokens;
    return usage;
  }, {});
}

function mapGenerationStatus(status: CustomerServiceModelStatus): CustomerServiceGenerationStatus {
  if (status === 'MODEL_NOT_CONFIGURED') return 'MODEL_NOT_CONFIGURED';
  if (status === 'EMPTY_CONTENT') return 'GENERATION_EMPTY';
  if (status === 'TRUNCATED') return 'GENERATION_TRUNCATED';
  if (status === 'TIMEOUT') return 'GENERATION_TIMEOUT';
  if (status === 'INVALID_RESPONSE') return 'INVALID_RESPONSE';
  return status === 'SUCCESS' ? 'GENERATED' : 'MODEL_ERROR';
}

function emptyResult(status: CustomerServiceGenerationResult['status']): CustomerServiceGenerationResult {
  return baseNonModelResult(status, null, 'NONE', null);
}

function deterministicResult(draft: string | null, source: 'EXACT_REPLY' | 'FIXED_QA' | 'TEMPLATE_REPLY'): CustomerServiceGenerationResult {
  return baseNonModelResult('DETERMINISTIC', draft, source, draft ? null : '确定性内容未能渲染。');
}

function baseNonModelResult(
  status: CustomerServiceGenerationStatus,
  draft: string | null,
  source: CustomerServiceGenerationSource,
  errorMessage: string | null,
): CustomerServiceGenerationResult {
  return {
    status,
    draft,
    source,
    model: null,
    elapsedMs: 0,
    requestId: null,
    usage: {},
    errorMessage,
    promptPreview: null,
    rewriteCount: 0,
    originalDraft: draft,
    rewriteAttemptCount: 0,
    rewriteHistory: [],
    fallbackUsed: false,
    fallbackReason: null,
    initialElapsedMs: 0,
    totalModelElapsedMs: 0,
    modelCallCount: 0,
    deliveryPlan: null,
    requestedModel: null,
    actualModel: null,
    thinkingMode: 'UNKNOWN',
    requestedMaxTokens: null,
    effectiveMaxTokens: null,
    timeoutMs: null,
    finishReason: null,
    reasoningContentLength: 0,
    visibleContentLength: draft?.trim().length || 0,
    emptyContentReason: null,
    initialGenerationStatus: status === 'DETERMINISTIC' ? 'DETERMINISTIC' : 'NOT_REQUESTED',
    compactRetryAttempted: false,
    compactRetryStatus: 'NOT_ATTEMPTED',
    rewriteAttempted: false,
    rewriteStatus: 'NOT_ATTEMPTED',
    semanticFallbackUsed: false,
    finalReplySource: source,
    finalFailureReason: errorMessage,
    candidateSafetyStatus: 'NOT_RUN',
    candidateQualityStatus: 'NOT_RUN',
    deliveryDecision: 'NOT_DECIDED',
    modelAttempts: [],
  };
}
