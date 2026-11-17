import { createHash } from 'crypto';
import type { CustomerServiceGeneratedSegment, CustomerServiceGenerationResult } from './customer-service-reply-generator.service';

export type CustomerServiceFinalCandidateIdentityV1 = {
  schemaVersion: 1;
  authority: 'FINAL_CANDIDATE';
  lexicalSha256: string;
  structuredSegmentSha256: string | null;
  segmentCount: number;
  structuredSegmentsAuthoritative: boolean;
  sealedAtStage: 'FINAL_CANDIDATE_SEAL';
};

/**
 * Final Candidate identity closure.
 *
 * A candidate may be rewritten/pruned after the model returned structured HVE
 * segments. Once lexical text changes those old segment contents are stale and
 * must never remain attached to the candidate. Every evaluator therefore sees
 * the exact same canonical generation representation that Selection/Delivery
 * will later use.
 */
export function canonicalizeCustomerServiceGenerationCandidate(
  generation: CustomerServiceGenerationResult,
): CustomerServiceGenerationResult {
  const draft = String(generation.draft || '');
  const summaryTransformation = generation.summaryTransformation
    && lexicalContentSha256(generation.summaryTransformation.visibleText) !== lexicalContentSha256(draft)
    ? undefined
    : generation.summaryTransformation;
  const presentationIntent = isPresentationIntentConsistent(generation.presentationIntent, draft)
    ? generation.presentationIntent
    : undefined;
  const presentationIntentChanged = presentationIntent !== generation.presentationIntent;
  const segments = normalizeSegments(generation.structuredSegments);
  if (!segments?.length) {
    if (generation.structuredSegments?.length
      || summaryTransformation !== generation.summaryTransformation
      || presentationIntentChanged) {
      return { ...generation, structuredSegments: undefined, presentationIntent, summaryTransformation };
    }
    return generation;
  }
  const segmentText = segments.map((segment) => segment.content).join('');
  if (lexicalContentSha256(segmentText) !== lexicalContentSha256(draft)) {
    return {
      ...generation,
      structuredSegments: undefined,
      presentationIntent,
      summaryTransformation,
    };
  }
  const changed = segments.length !== generation.structuredSegments?.length
    || segments.some((segment, index) => (
      segment.index !== generation.structuredSegments?.[index]?.index
      || segment.content !== generation.structuredSegments?.[index]?.content
    ));
  return changed || summaryTransformation !== generation.summaryTransformation || presentationIntentChanged
    ? { ...generation, structuredSegments: segments, presentationIntent, summaryTransformation }
    : generation;
}

/**
 * Replace the customer-visible source text and atomically invalidate every
 * downstream projection that was derived from the previous text.
 *
 * This helper owns lifecycle consistency only. It does not decide whether a
 * fallback/rewrite should happen, what the new text should be, or whether the
 * result is sendable. Those decisions remain with their existing authorities.
 */
export function replaceCustomerServiceVisibleContent(
  generation: CustomerServiceGenerationResult,
  draft: string | null,
): CustomerServiceGenerationResult {
  const nextDraft = draft === null ? null : String(draft);
  return {
    ...generation,
    draft: nextDraft,
    visibleContentLength: nextDraft?.length || 0,
    structuredSegments: undefined,
    presentationIntent: undefined,
    summaryTransformation: undefined,
    finalCandidateIdentity: undefined,
    finalTextFreeze: undefined,
    deliveryPlan: null,
    deliveryDecision: 'NOT_DECIDED',
  };
}

export function sealCustomerServiceFinalCandidate(
  generation: CustomerServiceGenerationResult,
): CustomerServiceGenerationResult {
  const canonical = canonicalizeCustomerServiceGenerationCandidate(generation);
  return {
    ...canonical,
    finalCandidateIdentity: buildCustomerServiceFinalCandidateIdentity(canonical),
  };
}

export function buildCustomerServiceFinalCandidateIdentity(
  generation: CustomerServiceGenerationResult,
): CustomerServiceFinalCandidateIdentityV1 {
  const canonical = canonicalizeCustomerServiceGenerationCandidate(generation);
  const segments = canonical.structuredSegments || [];
  return {
    schemaVersion: 1,
    authority: 'FINAL_CANDIDATE',
    lexicalSha256: lexicalContentSha256(canonical.draft || ''),
    structuredSegmentSha256: segments.length ? structuredSegmentSha256(segments) : null,
    segmentCount: segments.length || (String(canonical.draft || '').trim() ? 1 : 0),
    structuredSegmentsAuthoritative: segments.length > 0,
    sealedAtStage: 'FINAL_CANDIDATE_SEAL',
  };
}

export function lexicalContentSha256(value: string) {
  const lexicalContent = String(value || '').replace(/\s+/gu, '');
  return createHash('sha256').update(lexicalContent).digest('hex');
}

function structuredSegmentSha256(segments: CustomerServiceGeneratedSegment[]) {
  const stable = segments
    .map((segment) => `${segment.index}|${segment.purposes.join('+')}|${segment.content}`)
    .join('\n');
  return createHash('sha256').update(stable).digest('hex');
}

function isPresentationIntentConsistent(
  intent: CustomerServiceGenerationResult['presentationIntent'],
  draft: string,
) {
  if (!intent?.segments?.length) return false;
  const presentationText = intent.segments.map((segment) => String(segment.content || '')).join('');
  return lexicalContentSha256(presentationText) === lexicalContentSha256(draft);
}

function normalizeSegments(
  value: CustomerServiceGeneratedSegment[] | undefined,
): CustomerServiceGeneratedSegment[] | undefined {
  if (!value?.length) return undefined;
  const normalized = value
    .map((segment, index) => ({
      ...segment,
      index,
      content: String(segment.content || '').trim(),
      purposes: [...new Set(segment.purposes || [])],
    }))
    .filter((segment) => Boolean(segment.content));
  return normalized.length ? normalized : undefined;
}
