import type { CustomerServiceConversationStateV2 } from '../state/customer-service-conversation-state.type';
import type { CustomerServiceMessageUnderstanding } from './types/customer-service-message-understanding.type';

export function getCustomerServiceDeliveredReferentCandidates(state: CustomerServiceConversationStateV2) {
  const behavior = state.assistantMoveLedger.at(-1)?.behavior;
  if (!behavior?.evidenceMessageIds.length) return [];
  const proven = new Set(behavior.realizedGroundingRefs || []);
  return (behavior.provenGroundedUnits || []).slice(0, 24)
    .map((unit, index) => ({ candidateId: `delivered-unit-${index}`, text: unit.text,
      groundingRefs: [...new Set(unit.groundingRefs)] }))
    .filter((unit) => unit.text.trim() && unit.groundingRefs.length
      && unit.groundingRefs.every((ref) => proven.has(ref)));
}

export function resolveCustomerServiceContextualReferentSelection(
  raw: unknown,
  message: string,
  state: CustomerServiceConversationStateV2,
): CustomerServiceMessageUnderstanding['contextualReferentSelection'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const status = String(value.status || '').trim().toUpperCase();
  if (!['UNIQUE', 'SET'].includes(status)
    || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)
    || value.confidence < 0.85 || value.confidence > 1) return null;
  const evidence = typeof value.evidence === 'string' ? value.evidence.trim() : '';
  if (evidence.length < 2 || !message.includes(evidence)) return null;

  const candidates = getCustomerServiceDeliveredReferentCandidates(state);
  if (status === 'SET') {
    const candidateIds = Array.isArray(value.candidateIds)
      ? [...new Set(value.candidateIds.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
      : [];
    const sourceQuotes = Array.isArray(value.sourceQuotes)
      ? value.sourceQuotes.map((item) => typeof item === 'string' ? item.trim() : '')
      : [];
    if (candidateIds.length < 2 || sourceQuotes.length !== candidateIds.length) return null;
    const selected = candidateIds.map((candidateId, index) => {
      const candidate = candidates.find((item) => item.candidateId === candidateId);
      const sourceQuote = sourceQuotes[index] || '';
      return candidate && sourceQuote.length >= 2 && candidate.text.includes(sourceQuote)
        ? { candidate, sourceQuote }
        : null;
    });
    if (selected.some((item) => !item)) return null;
    const groundingRefs = [...new Set(selected.flatMap((item) => item!.candidate.groundingRefs))];
    return groundingRefs.length
      ? { mode: 'SET', evidence, sourceQuote: selected.map((item) => item!.sourceQuote).join('\n'), groundingRefs }
      : null;
  }

  const sourceQuote = typeof value.sourceQuote === 'string' ? value.sourceQuote.trim() : '';
  if (sourceQuote.length < 2) return null;
  const candidate = candidates.find((item) => item.candidateId === value.candidateId);
  if (!candidate || !candidate.text.includes(sourceQuote)) return null;
  // Selection can only narrow existing proven references; it cannot add a fact,
  // a catalog identity, or any reference supplied by the model itself.
  return { mode: 'SINGLE', evidence, sourceQuote, groundingRefs: [...candidate.groundingRefs] };
}

/** Presence of an offering reference is distinct from successful resolution.
 * This evidence can require business Grounding, but cannot authorize an entity.
 */
export function resolveCustomerServiceContextualReferentEvidence(raw: unknown, message: string): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!['UNIQUE', 'SET', 'AMBIGUOUS', 'UNRESOLVED'].includes(String(value.status))
    || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)
    || value.confidence < 0.85 || value.confidence > 1) return null;
  const evidence = typeof value.evidence === 'string' ? value.evidence.trim() : '';
  return evidence.length >= 2 && message.includes(evidence) ? evidence : null;
}
