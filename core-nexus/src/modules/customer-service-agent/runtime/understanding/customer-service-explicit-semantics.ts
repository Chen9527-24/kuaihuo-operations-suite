import type {
  CustomerServiceMessageUnderstanding,
  CustomerServiceNamedOfferingReferentV1,
} from './types/customer-service-message-understanding.type';

/**
 * Deterministic fact/referent finalization after typed semantic understanding.
 *
 * Open-language ownership belongs to Deep Recognition. This layer may only verify
 * server-owned structured entity identity, bind a model-owned verbatim named-offering
 * span to that identity, or continue a model-owned contextual referent over proven
 * delivered grounding refs. It must not reconstruct merchant scope, product identity,
 * attribute type, or conversational reference from customer keywords/regex/grammar.
 */

export type CustomerServiceFactOwnershipScope = 'CURRENT_BUSINESS_FACT' | 'GENERAL_DOMAIN' | 'NONE';
export type CustomerServiceFactOwnershipV1 = CustomerServiceMessageUnderstanding['factOwnership'];

export function finalizeCustomerServiceFactOwnershipFromGroundingEvidence(input: {
  ownership: CustomerServiceFactOwnershipV1;
  primaryScenario: string;
  primaryIntent: string;
  message?: string | null;
  namedOfferingMentionSpans?: string[];
  priorDeliveredGroundingRefs?: string[];
  contextualReferentSelection?: { mode: 'SINGLE' | 'SET'; evidence: string; sourceQuote: string; groundingRefs: string[] } | null;
  knowledgeEntries: Array<{
    id?: string | null;
    entityType?: string | null;
    entityKey?: string | null;
    title?: string | null;
    aliases?: string[] | null;
    selectionReason?: string | null;
    matchEvidence?: string[] | null;
    currentMessageEntityIdentity?: {
      authority?: string | null;
      status?: string | null;
      kind?: string | null;
      surface?: string | null;
    } | null;
  }>;
}): CustomerServiceFactOwnershipV1 {
  const currentStructuredEntries = input.knowledgeEntries.filter((entry) => {
    const entityType = String(entry.entityType || '').trim().toUpperCase();
    const entityKey = String(entry.entityKey || '').trim();
    return Boolean(entityType)
      && entityType !== 'GENERIC'
      && Boolean(entityKey)
      && String(entry.selectionReason || '') !== 'STATE';
  });

  const typedExactMatches = currentStructuredEntries.filter((entry) => (
    String(entry.currentMessageEntityIdentity?.authority || '') === 'RUNTIME_CURRENT_MESSAGE_ENTITY_IDENTITY'
    && String(entry.currentMessageEntityIdentity?.status || '') === 'EXACT_STRUCTURED_ENTITY'
    && Boolean(String(entry.currentMessageEntityIdentity?.surface || '').trim())
  ));

  // Typed Runtime identity is the only exact-entity Authority. Legacy retrieval
  // matchEvidence may remain observable in old traces, but it cannot grant current
  // entity/fact permission when the typed identity projection is absent.
  const exactMatches = typedExactMatches;

  const entityOwners = groupEntityOwners(exactMatches);
  if (entityOwners.size === 1) {
    const matchedEntries = [...entityOwners.values()][0];
    const matchedIds = matchedEntries.map((entry) => String(entry.id || '').trim()).filter(Boolean);
    const surface = matchedEntries
      .map((entry) => String(entry.currentMessageEntityIdentity?.surface || '').trim())
      .find(Boolean)
      || firstNamedOfferingSpan(input.namedOfferingMentionSpans)
      || input.ownership.namedOfferingReferent.surface;
    return {
      authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.97, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY',
        ...matchedIds.map((id) => `GROUNDING_ENTITY_MATCH:${id}`),
      ]),
      reason: 'Deep Recognition 的命名对象/当前业务事实边界与结构化实体唯一一致；只有该实体可承担当前事实 Grounding。',
      namedOfferingReferent: namedOfferingReferent(
        'EXACT_STRUCTURED_ENTITY',
        'STRUCTURED_ENTITY',
        surface,
        matchedIds,
      ),
    };
  }

  if (entityOwners.size > 1) {
    const matchedEntries = [...entityOwners.values()].flat();
    const surface = matchedEntries
      .map((entry) => String(entry.currentMessageEntityIdentity?.surface || '').trim())
      .find(Boolean)
      || firstNamedOfferingSpan(input.namedOfferingMentionSpans)
      || input.ownership.namedOfferingReferent.surface;
    return {
      ...input.ownership,
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.96, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT_RESOLUTION:AMBIGUOUS_EXACT_STRUCTURED_ENTITY',
      ]),
      reason: '同一 typed 命名对象映射到多个结构化实体；唯一实体确认前不得任选一个候选承担事实 Grounding。',
      namedOfferingReferent: namedOfferingReferent(
        'AMBIGUOUS_EXACT_STRUCTURED_ENTITY',
        'STRUCTURED_ENTITY',
        surface,
      ),
    };
  }

  const namedSpan = firstNamedOfferingSpan(input.namedOfferingMentionSpans);
  if (namedSpan) {
    return {
      ...input.ownership,
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.95, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT:MODEL_NAMED_OFFERING_SPAN',
        'REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING',
      ]),
      reason: 'Deep Recognition 已识别当前轮命名对象，但结构化实体未完成唯一匹配；保持业务事实边界并 fail closed。',
      namedOfferingReferent: namedOfferingReferent(
        'UNMATCHED_NAMED_OFFERING',
        'MODEL_NAMED_SPAN',
        namedSpan,
      ),
    };
  }

  // A bounded contextual referent is considered only when the current message does
  // not name a different offering. Explicit current named-offering evidence therefore
  // cannot inherit an older delivered entity by accident.
  const contextual = resolveTypedContextualReferent(input);
  if (contextual) return contextual;
  if (input.contextualReferentSelection) {
    const evidence = String(input.contextualReferentSelection.evidence || '').trim() || null;
    return {
      ...input.ownership,
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.95, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT:CONTEXTUAL_DELIVERED_GROUNDED_OFFERING',
        'REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING',
      ]),
      reason: 'Deep Recognition 已声明当前轮关系指代，但上一轮交付证明或当前结构化 Knowledge 无法闭合；保持当前业务事实边界并 fail closed。',
      namedOfferingReferent: namedOfferingReferent(
        'UNMATCHED_NAMED_OFFERING',
        'CONTEXTUAL_GROUNDED_ENTITY',
        evidence,
      ),
    };
  }

  // Preserve a typed unresolved referent from any upstream structured/manual producer,
  // but never manufacture one from raw customer wording here.
  if (input.ownership.namedOfferingReferent.status === 'PRESENT_UNRESOLVED') {
    return {
      ...input.ownership,
      scope: 'CURRENT_BUSINESS_FACT',
      evidence: uniqueStrings([...input.ownership.evidence, 'REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING']),
      reason: '上游 typed referent 尚未完成实体证明；保持业务事实边界并 fail closed。',
      namedOfferingReferent: namedOfferingReferent(
        'UNMATCHED_NAMED_OFFERING',
        input.ownership.namedOfferingReferent.source,
        input.ownership.namedOfferingReferent.surface,
      ),
    };
  }

  return input.ownership;
}

function resolveTypedContextualReferent(input: {
  ownership: CustomerServiceFactOwnershipV1;
  message?: string | null;
  priorDeliveredGroundingRefs?: string[];
  contextualReferentSelection?: { mode: 'SINGLE' | 'SET'; evidence: string; sourceQuote: string; groundingRefs: string[] } | null;
  knowledgeEntries: Array<{
    id?: string | null;
    entityType?: string | null;
    entityKey?: string | null;
  }>;
}): CustomerServiceFactOwnershipV1 | null {
  const selection = input.contextualReferentSelection;
  if (!selection) return null;
  const evidence = String(selection.evidence || '').trim();
  const sourceQuote = String(selection.sourceQuote || '').trim();
  const message = String(input.message || '');
  const priorRefs = uniqueStrings(input.priorDeliveredGroundingRefs || []);
  const selectedRefs = uniqueStrings(selection.groundingRefs || []);
  const structurallyBound = Boolean(
    evidence
    && message.includes(evidence)
    && selectedRefs.length
    && selectedRefs.every((ref) => priorRefs.includes(ref))
    && (selection.mode === 'SET' || sourceQuote),
  );
  if (!structurallyBound) return null;

  const contextualEntries = input.knowledgeEntries.filter((entry) => {
    const id = String(entry.id || '').trim();
    const entityType = String(entry.entityType || '').trim().toUpperCase();
    const entityKey = String(entry.entityKey || '').trim();
    return selectedRefs.includes(id) && Boolean(entityType) && entityType !== 'GENERIC' && Boolean(entityKey);
  });
  const allSelectedRefsAccountedFor = selectedRefs.every((ref) =>
    contextualEntries.some((entry) => String(entry.id || '').trim() === ref));
  if (!allSelectedRefsAccountedFor) return null;

  const owners = groupEntityOwners(contextualEntries);
  if (selection.mode === 'SET') {
    if (owners.size < 2) return null;
    const matchedIds = contextualEntries.map((entry) => String(entry.id || '').trim()).filter(Boolean);
    return {
      authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.97, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT:CONTEXTUAL_DELIVERED_GROUNDED_OFFERING',
        'REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY_SET',
        ...matchedIds.map((id) => `GROUNDING_ENTITY_MATCH:${id}`),
      ]),
      reason: 'Deep Recognition 的当前轮集合指代已绑定到上一条实际交付且被证明的结构化候选集合；该集合只允许在这些已交付对象内比较或排序。',
      namedOfferingReferent: namedOfferingReferent(
        'EXACT_STRUCTURED_ENTITY',
        'CONTEXTUAL_GROUNDED_ENTITY',
        evidence,
        matchedIds,
      ),
    };
  }
  if (owners.size === 1) {
    const matchedIds = [...owners.values()][0].map((entry) => String(entry.id || '').trim()).filter(Boolean);
    return {
      authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.97, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT:CONTEXTUAL_DELIVERED_GROUNDED_OFFERING',
        'REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY',
        ...matchedIds.map((id) => `GROUNDING_ENTITY_MATCH:${id}`),
      ]),
      reason: 'Deep Recognition 的当前轮逐字关系指代已绑定到上一条实际交付且被证明的唯一结构化 Grounding。',
      namedOfferingReferent: namedOfferingReferent(
        'EXACT_STRUCTURED_ENTITY',
        'CONTEXTUAL_GROUNDED_ENTITY',
        evidence,
        matchedIds,
      ),
    };
  }

  if (owners.size > 1) {
    return {
      ...input.ownership,
      scope: 'CURRENT_BUSINESS_FACT',
      confidence: Math.max(0.96, input.ownership.confidence),
      evidence: uniqueStrings([
        ...input.ownership.evidence,
        'REFERENT:CONTEXTUAL_DELIVERED_GROUNDED_OFFERING',
        'REFERENT_RESOLUTION:AMBIGUOUS_EXACT_STRUCTURED_ENTITY',
      ]),
      reason: 'Deep Recognition 的关系指代对应多个已交付结构化实体；唯一对象确认前不得任选一个实体承担当前事实。',
      namedOfferingReferent: namedOfferingReferent(
        'AMBIGUOUS_EXACT_STRUCTURED_ENTITY',
        'CONTEXTUAL_GROUNDED_ENTITY',
        evidence,
      ),
    };
  }
  return null;
}

function groupEntityOwners<T extends { entityType?: string | null; entityKey?: string | null }>(entries: T[]) {
  const owners = new Map<string, T[]>();
  for (const entry of entries) {
    const key = `${String(entry.entityType || '').trim().toUpperCase()}:${String(entry.entityKey || '').trim()}`;
    owners.set(key, [...(owners.get(key) || []), entry]);
  }
  return owners;
}


function firstNamedOfferingSpan(spans: string[] | undefined) {
  return (spans || []).map((value) => String(value || '').trim()).find(Boolean) || null;
}

function namedOfferingReferent(
  status: CustomerServiceNamedOfferingReferentV1['status'] = 'NONE',
  source: CustomerServiceNamedOfferingReferentV1['source'] = 'NONE',
  surface: string | null = null,
  resolvedGroundingIds: string[] = [],
): CustomerServiceNamedOfferingReferentV1 {
  return {
    authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
    status,
    source,
    surface,
    resolvedGroundingIds: uniqueStrings(resolvedGroundingIds),
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
