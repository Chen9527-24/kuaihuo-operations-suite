import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';

/**
 * R2.1 read-only owner-chain diagnostics.
 * This projection is intentionally downstream of the compiled contract and cannot
 * create acts, mutate state, change candidate eligibility, rewrite text, or affect send.
 */
export function projectCustomerServiceDecisionIntegrityDiagnostics(contract: CustomerServiceRuntimeReplyContract) {
  const state = contract.generationContext.conversationState;
  const plan = contract.orchestrationPlan;
  const recognizedConstraints = (contract.classification.recognizedItems || [])
    .filter((item) => item.type === 'STATE' && item.scope === 'CONVERSATION' && item.suggestedCategory === 'CUSTOMER_CONSTRAINT')
    .map((item) => ({
      recognitionId: item.recognitionId,
      key: item.key,
      confidence: item.confidence,
      evidenceFingerprints: (item.evidence || []).map(diagnosticValueFingerprint).slice(0, 4),
    }))
    .slice(0, 8);
  const relevantConstraints = (state.relevantMemories || [])
    .filter((item) => item.kind === 'CUSTOMER_CONSTRAINT')
    .map((item) => ({
      id: item.id,
      key: item.key,
      sourceTurn: item.sourceTurn,
      confidence: item.confidence,
      valueFingerprint: diagnosticValueFingerprint(item.value),
    }))
    .slice(0, 12);
  const canonicalExplicitFacts = Array.isArray(state.canonicalFields.explicitFacts.value)
    ? state.canonicalFields.explicitFacts.value.map((item) => ({
        key: item.key,
        valueFingerprint: diagnosticValueFingerprint(item.value),
      })).slice(0, 16)
    : [];
  const stateGuidanceExplicitFacts = (plan.stateGuidance?.explicitFacts || [])
    .map((item) => ({
      key: item.key,
      valueFingerprint: diagnosticValueFingerprint(item.value),
    }))
    .slice(0, 16);
  const decisionActs = (plan.interactionPlanV2?.acts || [])
    .filter((act) => ['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM'].includes(act.type))
    .map((act) => ({
      type: act.type,
      necessity: act.necessity,
      reasonCode: act.reasonCode,
      knownFingerprints: (act.parameters?.known || []).map(diagnosticValueFingerprint).slice(0, 12),
    }))
    .slice(0, 12);
  return {
    contract: 'R2_1_DECISION_INTEGRITY_DIAGNOSTICS_V1',
    authority: 'DIAGNOSTIC_ONLY' as const,
    authorityEffects: {
      generation: false,
      selectionEligibility: false,
      finalCandidate: false,
      delivery: false,
      send: false,
    },
    recognition: {
      customerConstraintCount: recognizedConstraints.length,
      constraints: recognizedConstraints,
    },
    state: {
      relevantConstraintCount: relevantConstraints.length,
      relevantConstraints,
      canonicalExplicitFactStatus: state.canonicalFields.explicitFacts.status,
      canonicalExplicitFacts,
    },
    planning: {
      stateGuidanceExplicitFacts,
      decisionActs,
    },
  };
}

function diagnosticValueFingerprint(value: unknown) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? stableJsonHash({ value: normalized }).slice(0, 16) : null;
}
