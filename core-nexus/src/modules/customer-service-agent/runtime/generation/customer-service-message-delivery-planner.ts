import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import type { CustomerServiceGeneratedSegment, CustomerServicePresentationIntentV1 } from './customer-service-reply-generator.service';

export type CustomerServiceDeliverySegment = {
  index: number;
  content: string;
  delayBeforeMs: number;
  status: 'PLANNED';
};

export type CustomerServiceMessageDeliveryPlan = {
  mode: 'SINGLE' | 'SEQUENTIAL';
  segments: CustomerServiceDeliverySegment[];
  cancelRemainingOnCustomerMessage: boolean;
  boundarySource: 'NONE' | 'GENERATION_PRESENTATION_INTENT' | 'PC_EXPLICIT';
  explicitBreakCount: number;
  explicitSegmentCount: number;
  reason: string;
};

export function buildCustomerServiceExactSingleDeliveryPlan(
  contract: CustomerServiceRuntimeReplyContract,
  draft: string | null,
  reason: string,
): CustomerServiceMessageDeliveryPlan | null {
  const content = String(draft || '');
  if (!content.trim()) return null;
  return {
    mode: 'SINGLE',
    segments: [{ index: 0, content, delayBeforeMs: fixedQaFirstDelay(contract), status: 'PLANNED' }],
    cancelRemainingOnCustomerMessage: contract.strategyPolicy.resolved.delivery.cancelRemainingOnCustomerMessage,
    boundarySource: 'NONE',
    explicitBreakCount: 0,
    explicitSegmentCount: 0,
    reason,
  };
}

export function buildCustomerServiceMessageDeliveryPlan(
  contract: CustomerServiceRuntimeReplyContract,
  draft: string | null,
  _hveDiagnostics?: unknown,
  _structuredSegments?: CustomerServiceGeneratedSegment[] | null,
  presentationIntent?: CustomerServicePresentationIntentV1 | null,
): CustomerServiceMessageDeliveryPlan | null {
  const text = String(draft || '').trim();
  if (!text) return null;
  const policy = contract.strategyPolicy.resolved.delivery;
  const seed = `${contract.provenance.configurationHash}|${contract.groundedContext.latestCustomerMessage}|${text}`;
  const normalizedPresentationIntent = normalizeExplicitPresentationSegments(text, presentationIntent);
  const firstDelayMs = fixedQaFirstDelay(contract);

  // Generation owns 1/N message boundaries through HVE_REPLY_V2. Delivery does not re-plan,
  // cap, merge or infer those boundaries from HumanTurn, punctuation, paragraphs, length or
  // role/domain-specific text. An explicit PC SINGLE mode is the only operator-owned collapse.
  const contents = policy.mode === 'SINGLE' || !normalizedPresentationIntent.valid
    ? [text]
    : normalizedPresentationIntent.segments;
  const mode = contents.length > 1 ? 'SEQUENTIAL' as const : 'SINGLE' as const;
  const boundarySource: CustomerServiceMessageDeliveryPlan['boundarySource'] = policy.mode === 'SINGLE'
    ? 'PC_EXPLICIT'
    : normalizedPresentationIntent.valid
      ? 'GENERATION_PRESENTATION_INTENT'
      : 'NONE';
  return {
    mode,
    segments: contents.map((content, index) => ({
      index,
      content,
      delayBeforeMs: index === 0 ? firstDelayMs : deterministicDelay(seed, index, policy.minDelayMs, policy.maxDelayMs),
      status: 'PLANNED' as const,
    })),
    cancelRemainingOnCustomerMessage: policy.cancelRemainingOnCustomerMessage,
    boundarySource,
    explicitBreakCount: normalizedPresentationIntent.valid ? Math.max(0, normalizedPresentationIntent.segments.length - 1) : 0,
    explicitSegmentCount: normalizedPresentationIntent.valid ? normalizedPresentationIntent.segments.length : 0,
    reason: policy.mode === 'SINGLE'
      ? 'PC Delivery 明确要求单条；仅折叠展示，不重新理解或改写正文。'
      : normalizedPresentationIntent.valid
        ? 'Delivery 直接消费 Generation HVE_REPLY_V2 的显式 segments；units 仅承载 Act binding，Delivery 不进行二次语义或气泡规划。'
        : '未收到可验证的 Generation segments；保留模型非空正文并按单条投递，不做后处理断句。',
  };
}

function normalizeExplicitPresentationSegments(
  text: string,
  intent?: CustomerServicePresentationIntentV1 | null,
): { segments: string[]; valid: boolean } {
  const segments = (intent?.segments || [])
    .map((segment) => String(segment.content || '').trim())
    .filter(Boolean);
  if (!segments.length) return { segments: [text], valid: false };
  const sourceLexical = text.replace(/\s+/gu, '');
  const segmentLexical = segments.join('').replace(/\s+/gu, '');
  return sourceLexical === segmentLexical
    ? { segments, valid: true }
    : { segments: [text], valid: false };
}

function fixedQaFirstDelay(contract: CustomerServiceRuntimeReplyContract) {
  return Math.max(0, Math.min(8000, Math.trunc(Number(contract.replyPlan.fixedQa?.delayMs) || 0)));
}

function deterministicDelay(seed: string, index: number, minDelayMs: number, maxDelayMs: number) {
  const min = Math.max(0, Math.trunc(minDelayMs || 0));
  const max = Math.max(min, Math.trunc(maxDelayMs || min));
  if (max === min) return min;
  return min + (stableHash(`${seed}|${index}`) % (max - min + 1));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
