import type { CustomerServiceInteractionPlanV2 } from './customer-service-interaction-plan.type';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';

export type CustomerServiceCanonicalTranscriptV1 = {
  schemaVersion: 1;
  /**
   * The transcript is server-owned. Caller-selected active context is never a
   * transcript authority and must not be used to rebuild Summary Source.
   */
  authority: 'SERVER_CANONICAL_TRANSCRIPT';
  source: 'TUNING_SESSION_MESSAGES' | 'DIALOGUE_CONVERSATION_MESSAGES';
  sourceId: string;
  revision: number;
  fingerprint: string;
  messages: Array<{
    turn: number;
    role: 'CUSTOMER' | 'ASSISTANT';
    content: string;
  }>;
};

export type CustomerServiceConversationSummarySourceV1 = {
  schemaVersion: 1;
  mode: 'NONE' | 'BOUNDED_CONVERSATION_HISTORY';
  /**
   * Producer protocol only. Canonical Target Coverage remains the completion
   * authority; this field only tells the existing generator how to transform
   * the authoritative conversation source.
   */
  transformMode: 'NONE' | 'SOURCE_BOUND_SUMMARY';
  authority: 'NONE' | 'SERVER_CANONICAL_TRANSCRIPT';
  transcriptSource: CustomerServiceCanonicalTranscriptV1['source'] | null;
  transcriptSourceId: string | null;
  transcriptRevision: number | null;
  transcriptFingerprint: string | null;
  messages: Array<{
    sourceId: string;
    sourceIndex: number;
    turn: number;
    role: 'CUSTOMER' | 'ASSISTANT';
    content: string;
  }>;
};

const MAX_SUMMARY_SOURCE_MESSAGES = 30;

export function buildCustomerServiceServerCanonicalTranscript(input: {
  source: CustomerServiceCanonicalTranscriptV1['source'];
  sourceId: string;
  revision: number;
  messages: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
}): CustomerServiceCanonicalTranscriptV1 {
  const messages = input.messages
    .map((item) => ({ role: item.role, content: compactSummarySourceText(item.content) }))
    .filter((item) => Boolean(item.content))
    .map((item, index) => ({ ...item, turn: index + 1 }));
  const sourceId = String(input.sourceId || '').trim();
  const revision = Math.max(0, Math.trunc(Number(input.revision) || 0));
  return {
    schemaVersion: 1,
    authority: 'SERVER_CANONICAL_TRANSCRIPT',
    source: input.source,
    sourceId,
    revision,
    fingerprint: stableJsonHash({
      authority: 'SERVER_CANONICAL_TRANSCRIPT',
      source: input.source,
      sourceId,
      revision,
      messages,
    }),
    messages,
  };
}

export function resolveCustomerServiceConversationSummarySource(input: {
  plan?: CustomerServiceInteractionPlanV2 | null;
  canonicalTranscript?: CustomerServiceCanonicalTranscriptV1 | null;
  latestCustomerMessage: string;
}): CustomerServiceConversationSummarySourceV1 {
  const target = input.plan?.answerObligation?.responseTarget;
  const requested = target?.requestedSpecificity === 'SUMMARY'
    && target?.requiredDelta === 'COMPLETE_CURRENT_FOCUS'
    && Array.isArray(target.evidence)
    && target.evidence.includes('UNDERSTANDING_GOAL:SUMMARIZE_CONVERSATION');
  const transcript = input.canonicalTranscript || null;
  if (!requested) return emptySummarySource(transcript);
  if (!transcript || transcript.authority !== 'SERVER_CANONICAL_TRANSCRIPT') return emptySummarySource(null);

  const latest = compactSummarySourceText(input.latestCustomerMessage);
  const normalized = transcript.messages
    .map((item, sourceIndex) => ({
      sourceIndex,
      turn: item.turn,
      role: item.role,
      content: compactSummarySourceText(item.content),
    }))
    .filter((item) => Boolean(item.content));

  // Server transcripts normally exclude the current not-yet-committed customer
  // request. Canonical Dialogue callers may already contain it; never let the
  // Summary request itself become evidence for the requested Summary.
  const last = normalized[normalized.length - 1];
  const withoutCurrentRequest = last?.role === 'CUSTOMER' && latest && last.content === latest
    ? normalized.slice(0, -1)
    : normalized;
  const bounded = withoutCurrentRequest.slice(-MAX_SUMMARY_SOURCE_MESSAGES);
  const messages = bounded.map((item, index) => ({
    ...item,
    sourceId: `S${index + 1}`,
  }));
  if (!messages.length) return emptySummarySource(transcript);

  return {
    schemaVersion: 1,
    mode: 'BOUNDED_CONVERSATION_HISTORY',
    transformMode: 'SOURCE_BOUND_SUMMARY',
    authority: transcript.authority,
    transcriptSource: transcript.source,
    transcriptSourceId: transcript.sourceId,
    transcriptRevision: transcript.revision,
    transcriptFingerprint: transcript.fingerprint,
    messages,
  };
}

function emptySummarySource(
  transcript: CustomerServiceCanonicalTranscriptV1 | null,
): CustomerServiceConversationSummarySourceV1 {
  return {
    schemaVersion: 1,
    mode: 'NONE',
    transformMode: 'NONE',
    authority: transcript?.authority || 'NONE',
    transcriptSource: transcript?.source || null,
    transcriptSourceId: transcript?.sourceId || null,
    transcriptRevision: transcript?.revision ?? null,
    transcriptFingerprint: transcript?.fingerprint || null,
    messages: [],
  };
}

function compactSummarySourceText(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
