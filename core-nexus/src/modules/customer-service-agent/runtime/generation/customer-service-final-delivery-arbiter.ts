import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import type { CustomerServiceQualityReport } from '../quality/types/customer-service-quality-report.type';
import type { CustomerServiceGenerationResult } from './customer-service-reply-generator.service';
import {
  buildCustomerServiceExactSingleDeliveryPlan,
  buildCustomerServiceMessageDeliveryPlan,
} from './customer-service-message-delivery-planner';
import { createHash } from 'crypto';
import {
  buildCustomerServiceFinalCandidateIdentity,
  lexicalContentSha256,
} from './customer-service-final-candidate';

export class CustomerServiceDeliveryInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerServiceDeliveryInvariantError';
  }
}

/**
 * Final Delivery is presentation-only.
 *
 * Once a non-empty customer-visible draft exists, neither stale Presentation metadata,
 * Final Candidate seal diagnostics nor Quality/Humanity diagnostics may turn it into a
 * failed dialogue. Structural presentation inconsistency demotes to one exact bubble.
 * Explicit safety remains a hard boundary.
 */
export function finalizeCustomerServiceDelivery(input: {
  contract: CustomerServiceRuntimeReplyContract;
  generation: CustomerServiceGenerationResult;
  quality: CustomerServiceQualityReport;
}): CustomerServiceGenerationResult {
  const frozenDraft = String(input.generation.draft || '');
  const hasVisibleDraft = Boolean(frozenDraft.trim());
  const generation: CustomerServiceGenerationResult = {
    ...input.generation,
    draft: hasVisibleDraft ? frozenDraft : null,
    visibleContentLength: frozenDraft.length,
  };
  if (generation.candidateSafetyStatus === 'BLOCKED') {
    throw new CustomerServiceDeliveryInvariantError(
      '回复必达不变量失败：最终候选仍被绝对安全门阻断',
    );
  }
  if (!hasVisibleDraft) {
    throw new CustomerServiceDeliveryInvariantError(
      '回复必达不变量失败：模型/确定性生成未形成客户可见正文',
    );
  }

  // Candidate identity is a regression/integrity diagnostic at this layer, not Send Authority.
  // If an upstream bug produced a stale/missing seal, Delivery preserves the current frozen text
  // and records the drift in Final Text Freeze instead of failing the customer conversation.
  const currentCandidateIdentity = buildCustomerServiceFinalCandidateIdentity(generation);
  const sealedCandidateIdentity = generation.finalCandidateIdentity || null;
  const candidateSealStatus: NonNullable<NonNullable<CustomerServiceGenerationResult['finalTextFreeze']>['deliveryIntegrity']>['candidateSealStatus'] = !sealedCandidateIdentity
    ? 'UNSEALED_DEMOTED_TO_DIAGNOSTIC'
    : sameFinalCandidateIdentity(sealedCandidateIdentity, currentCandidateIdentity)
      ? 'MATCH'
      : 'DRIFT_DEMOTED_TO_DIAGNOSTIC';

  let deliveryPlan = buildCustomerServiceMessageDeliveryPlan(
    input.contract,
    generation.draft,
    generation.hve3,
    generation.structuredSegments || null,
    generation.presentationIntent || null,
  );
  let presentationIntegrityStatus: NonNullable<NonNullable<CustomerServiceGenerationResult['finalTextFreeze']>['deliveryIntegrity']>['presentationIntegrityStatus'] = 'PRIMARY_PLAN';
  if (!deliveryPlan?.segments.length) {
    // Non-empty text is already the Send fact. Presentation failure may only lose segmentation.
    deliveryPlan = buildCustomerServiceExactSingleDeliveryPlan(input.contract, frozenDraft, 'Delivery 未形成结构化展示计划；保留冻结正文并降级为单气泡。')!;
    presentationIntegrityStatus = 'EXACT_SINGLE_DEMOTION';
  }

  let sourceLexicalSha256 = lexicalContentSha256(frozenDraft);
  let deliveryLexicalSha256 = lexicalContentSha256(
    deliveryPlan.segments.map((segment) => segment.content).join(''),
  );
  if (sourceLexicalSha256 !== deliveryLexicalSha256) {
    // Stale or inconsistent presentation boundaries are metadata faults, not content faults.
    // Never rewrite or reject the model answer; display the exact frozen draft as one bubble.
    deliveryPlan = buildCustomerServiceExactSingleDeliveryPlan(input.contract, frozenDraft, '展示边界与冻结正文不一致；忽略展示元数据并原样单气泡投递。')!;
    presentationIntegrityStatus = 'EXACT_SINGLE_DEMOTION';
    sourceLexicalSha256 = lexicalContentSha256(frozenDraft);
    deliveryLexicalSha256 = lexicalContentSha256(deliveryPlan.segments[0].content);
  }

  return {
    ...generation,
    finalTextFreeze: {
      frozen: true,
      sha256: createHash('sha256').update(frozenDraft).digest('hex'),
      frozenAtStage: 'POST_FINAL_CANDIDATE_SEAL',
      textLength: frozenDraft.length,
      deliveryIntegrity: {
        verified: true,
        invariant: 'NON_WHITESPACE_LEXICAL_CONTENT_EXACT',
        mode: deliveryPlan.mode,
        segmentCount: deliveryPlan.segments.length,
        sourceLexicalSha256,
        deliveryLexicalSha256,
        candidateLexicalSha256: currentCandidateIdentity.lexicalSha256,
        candidateSealStatus,
        presentationIntegrityStatus,
      },
    },
    deliveryPlan,
    candidateSafetyStatus: generation.candidateSafetyStatus === 'NOT_RUN'
      ? 'PASS'
      : generation.candidateSafetyStatus,
    candidateQualityStatus: generation.candidateQualityStatus === 'NOT_RUN'
      ? input.quality.status
      : generation.candidateQualityStatus,
    deliveryDecision: resolveCustomerServiceDeliveryDecision(generation),
  };
}

export function resolveCustomerServiceDeliveryDecision(
  generation: CustomerServiceGenerationResult,
): CustomerServiceGenerationResult['deliveryDecision'] {
  if (['MODEL_AVAILABILITY_FALLBACK', 'FAILURE_NOTICE'].includes(generation.finalReplySource)) {
    return 'SEND_MODEL_AVAILABILITY_FALLBACK';
  }
  return 'SEND_PRIMARY';
}

function sameFinalCandidateIdentity(
  left: NonNullable<CustomerServiceGenerationResult['finalCandidateIdentity']>,
  right: NonNullable<CustomerServiceGenerationResult['finalCandidateIdentity']>,
) {
  return left.lexicalSha256 === right.lexicalSha256
    && left.structuredSegmentSha256 === right.structuredSegmentSha256
    && left.segmentCount === right.segmentCount;
}
