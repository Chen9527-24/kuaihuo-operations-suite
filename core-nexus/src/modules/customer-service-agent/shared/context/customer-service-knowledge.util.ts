import type {
  CustomerServiceConversationStateSummary,
  CustomerServiceConversationStateValue,
} from '../../runtime/state/customer-service-conversation-state.type';
import type { CustomerServiceConversationStrategyPreferences } from './customer-service-account-runtime-preferences.util';
import {
  isCustomerServiceKnowledgeIndustryCoherent,
  type CustomerServiceEffectiveBusinessScopeV1,
} from './customer-service-business-scope.util';
import { canonicalizeCustomerServiceIndustryCode } from './customer-service-industry-code.util';

export type CustomerServiceRuntimeKnowledgeEntry = {
  id: string;
  collectionId?: string | null;
  scopeType: string;
  scopeKey: string;
  entityType?: string | null;
  entityKey?: string | null;
  aliases?: string[];
  structuredData?: unknown;
  references?: unknown;
  authorityLevel?: string | null;
  chunkIndex?: number | null;
  sourceFileName?: string | null;
  bindingPriority?: number;
  bindingTargetType?: string | null;
  bindingTargetKey?: string | null;
  collection?: { id: string; name: string; industryCode?: string | null; revision?: number } | null;
  category: string;
  title: string;
  question: string | null;
  content: string;
  tags: string[];
  sourceType: string;
  sourceReference: string | null;
  revision: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  updatedAt: Date;
};

export type CustomerServiceKnowledgeSelectionReason = 'CURRENT_MESSAGE' | 'STATE' | 'CURRENT_AND_STATE';

export type CustomerServiceKnowledgeReference = {
  type: string;
  title: string;
  url: string;
  shareable: boolean;
};

export type CustomerServiceCurrentMessageEntityIdentityV1 = {
  authority: 'RUNTIME_CURRENT_MESSAGE_ENTITY_IDENTITY';
  status: 'EXACT_STRUCTURED_ENTITY';
  kind: 'TYPED_MENTION_EXACT' | 'QUOTED_EXACT' | 'UNQUOTED_ALIAS_EXACT' | 'TITLE_LABEL_EXACT' | 'CORE_EXACT' | 'ENTITY_KEY_EXACT';
  surface: string;
};

export type CustomerServiceSelectedKnowledgeEntry = {
  id: string;
  collectionId?: string | null;
  collectionName?: string | null;
  collectionRevision?: number | null;
  collectionIndustryCode?: string | null;
  scopeType: string;
  scopeKey: string;
  entityType?: string;
  entityKey?: string | null;
  aliases?: string[];
  category: string;
  title: string;
  question: string | null;
  content: string;
  tags: string[];
  structuredData?: Record<string, unknown> | null;
  references?: CustomerServiceKnowledgeReference[];
  authorityLevel?: string;
  sourceType: string;
  sourceReference: string | null;
  sourceFileName?: string | null;
  revision: number;
  bindingPriority?: number;
  bindingTargetType?: string | null;
  bindingTargetKey?: string | null;
  scopeCoherence?: 'DIRECT_SCOPE' | 'GENERIC_COLLECTION' | 'INDUSTRY_MATCH';
  selectionReason: CustomerServiceKnowledgeSelectionReason;
  relevanceScore?: number;
  matchEvidence?: string[];
  currentMessageEntityIdentity?: CustomerServiceCurrentMessageEntityIdentityV1 | null;
  estimatedTokens: number;
};

export type CustomerServiceBusinessFactOwnershipLike = {
  scope?: string | null;
  evidence?: string[] | null;
  namedOfferingReferent?: {
    status?: string | null;
    source?: string | null;
    resolvedGroundingIds?: string[] | null;
  } | null;
};

/**
 * R2.2 Grounding ownership: a current-offering attribute is allowed to consume
 * business facts only from a typed resolved structured entity. Normally that identity
 * is matched by the current customer message; a narrow contextual exception may reuse
 * the immediately prior delivered entity only when Reply Trace Semantic Conformance
 * already proved its realized Grounding. Broad category/state relevance alone is never
 * current-entity fact authority.
 */

function isCustomerServiceStructuredEntityKnowledgeEntry(entry: CustomerServiceSelectedKnowledgeEntry) {
  const entityType = String(entry.entityType || '').trim().toUpperCase();
  const entityKey = String(entry.entityKey || '').trim();
  return Boolean(entityType) && entityType !== 'GENERIC' && Boolean(entityKey);
}

export function selectCustomerServiceBusinessFactGroundingEntries(input: {
  entries: CustomerServiceSelectedKnowledgeEntry[];
  factOwnership?: CustomerServiceBusinessFactOwnershipLike | null;
}) {
  if (String(input.factOwnership?.scope || '').toUpperCase() !== 'CURRENT_BUSINESS_FACT') return [];

  const typedReferentStatus = String(input.factOwnership?.namedOfferingReferent?.status || '').trim().toUpperCase();
  const typedResolvedEntryIds = new Set((input.factOwnership?.namedOfferingReferent?.resolvedGroundingIds || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean));

  // A typed current-offering referent is the only entity-scoping Authority.
  // Compatibility evidence strings and retrieval similarity cannot create, recover,
  // or broaden current-entity Grounding. When no current offering is referenced,
  // merchant discovery/selection may still use the current-message candidate set.
  if (typedReferentStatus === 'EXACT_STRUCTURED_ENTITY') {
    if (!typedResolvedEntryIds.size) return [];
    return input.entries.filter((entry) =>
      typedResolvedEntryIds.has(entry.id)
      && isCustomerServiceStructuredEntityKnowledgeEntry(entry));
  }
  if (typedReferentStatus && typedReferentStatus !== 'NONE') return [];
  return input.entries.filter((entry) => entry.selectionReason !== 'STATE');
}

export type CustomerServiceKnowledgeRetrievalRole =
  | 'CURRENT_OPTION_ASSESSMENT_GUIDE';

export type CustomerServiceRuntimeKnowledgeSelectionInput = {
  message: string;
  /**
   * Verbatim named-offering spans produced by Deep Recognition for this exact
   * current message. They are segmentation evidence only; Runtime remains the
   * sole owner of canonical entity identity and Grounding authority.
   */
  namedOfferingMentionSpans?: string[];
  scenario?: string;
  intent?: string;
  topics?: string[];
  conversationState?: CustomerServiceConversationStateSummary | null;
  conversationStrategy?: CustomerServiceConversationStrategyPreferences | null;
  /**
   * Typed retrieval demand produced by the current-turn semantic owner.
   * A role may only change admission/order inside the finite Knowledge budget.
   * It cannot create entity identity, Fact ownership, Canonical Acts, Grounding,
   * recommendation authority, or proposition entailment.
   */
  requiredKnowledgeRoles?: CustomerServiceKnowledgeRetrievalRole[];
  /**
   * Retrieval-only recall hints from the immediately prior delivered reply.
   * IDs must already be proven realized Grounding refs by Reply Trace/Conversation State.
   * They may admit the matching Knowledge entry into the finite retrieval budget,
   * but they never create entity identity, Fact ownership, Act, or Grounding Authority.
   */
  priorDeliveredGroundingRefs?: string[];
  maxEstimatedTokens?: number;
  businessScope?: CustomerServiceEffectiveBusinessScopeV1 | null;
};

const MAX_ENTRIES = 8;
const MAX_TOTAL_CHARACTERS = 6000;
const DEFAULT_MAX_ESTIMATED_TOKENS = 2200;

type WeightedTerm = {
  term: string;
  weight: number;
  source: 'CURRENT' | 'STATE';
};

export type CustomerServiceKnowledgeSelectionRejection = {
  id: string;
  title: string;
  collectionId: string | null;
  collectionName: string | null;
  collectionIndustryCode: string | null;
  collectionCanonicalIndustryCode?: string | null;
  scopeCanonicalIndustryCode?: string | null;
  reason: 'FOREIGN_COLLECTION_INDUSTRY' | 'INDUSTRY_SCOPE_UNRESOLVED' | 'TOKEN_BUDGET' | 'CHARACTER_BUDGET';
};

export type CustomerServiceRuntimeKnowledgeSelectionResult = {
  selected: CustomerServiceSelectedKnowledgeEntry[];
  scopeRejected: CustomerServiceKnowledgeSelectionRejection[];
  budgetEvicted: CustomerServiceKnowledgeSelectionRejection[];
};

export function selectCustomerServiceRuntimeKnowledge(
  entries: CustomerServiceRuntimeKnowledgeEntry[],
  input: CustomerServiceRuntimeKnowledgeSelectionInput,
): CustomerServiceSelectedKnowledgeEntry[] {
  return selectCustomerServiceRuntimeKnowledgeDetailed(entries, input).selected;
}

export function selectCustomerServiceRuntimeKnowledgeDetailed(
  entries: CustomerServiceRuntimeKnowledgeEntry[],
  input: CustomerServiceRuntimeKnowledgeSelectionInput,
): CustomerServiceRuntimeKnowledgeSelectionResult {
  const scopeRejected: CustomerServiceKnowledgeSelectionRejection[] = [];
  const scopedEntries = entries.filter((entry) => {
    if (!entry.collectionId && entry.scopeType !== 'COLLECTION') return true;
    const coherence = isCustomerServiceKnowledgeIndustryCoherent(entry.collection?.industryCode, input.businessScope);
    if (coherence.coherent) return true;
    scopeRejected.push(rejection(entry, coherence.reason, input.businessScope));
    return false;
  });

  const currentTerms = collectTerms(
    [input.message, input.scenario || '', input.intent || '', ...(input.topics || [])],
    'CURRENT',
    1,
  );
  const namedOfferingMentionSpans = input.namedOfferingMentionSpans === undefined
    ? undefined
    : normalizeCurrentMessageNamedOfferingMentionSpans(input.message, input.namedOfferingMentionSpans);
  const requiredKnowledgeRoles = new Set((input.requiredKnowledgeRoles || [])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean));
  const priorDeliveredGroundingRefs = new Set((input.priorDeliveredGroundingRefs || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
  const stateTerms = collectStateTerms(input.conversationState, input.conversationStrategy || null);
  const terms = mergeWeightedTerms([...currentTerms, ...stateTerms]);
  const ranked = scopedEntries
    .map((entry) => {
      const relevance = relevanceScore(entry, input.message, terms, namedOfferingMentionSpans);
      const priorDeliveredGroundingRecall = priorDeliveredGroundingRefs.has(entry.id);
      const currentOptionAssessmentGuidePriority = relevance.score > 0
        && requiredKnowledgeRoles.has('CURRENT_OPTION_ASSESSMENT_GUIDE')
        && isCustomerServiceGuideKnowledgeEntry(entry);
      const evidence = [
        ...relevance.evidence,
        ...(priorDeliveredGroundingRecall ? ['PRIOR_DELIVERED_GROUNDING_REF_RECALL'] : []),
        ...(currentOptionAssessmentGuidePriority ? ['REQUIRED_KNOWLEDGE_ROLE:CURRENT_OPTION_ASSESSMENT_GUIDE'] : []),
      ];
      return {
        entry,
        ...relevance,
        evidence,
        priorDeliveredGroundingRecall,
        currentOptionAssessmentGuidePriority,
        currentEntityIdentityAuthorityRank: relevance.exactIdentity ? 1 : 0,
      };
    })
    .filter((item) => item.score > 0 || item.priorDeliveredGroundingRecall)
    // Exact identity is an Authority prerequisite, not another similarity bonus.
    // It must be admitted before related/state candidates consume the finite
    // Knowledge budget; otherwise a known exact product can become UNMATCHED on
    // a later turn merely because a weaker candidate was ranked first.
    .sort((a, b) => Number(b.priorDeliveredGroundingRecall) - Number(a.priorDeliveredGroundingRecall)
      || b.currentEntityIdentityAuthorityRank - a.currentEntityIdentityAuthorityRank
      || Number(b.currentOptionAssessmentGuidePriority) - Number(a.currentOptionAssessmentGuidePriority)
      || b.score - a.score
      || b.entry.updatedAt.getTime() - a.entry.updatedAt.getTime());

  const tokenBudget = normalizeTokenBudget(input.maxEstimatedTokens);
  const result: CustomerServiceSelectedKnowledgeEntry[] = [];
  const budgetEvicted: CustomerServiceKnowledgeSelectionRejection[] = [];
  let usedCharacters = 0;
  let usedTokens = 0;
  for (const { entry, score, matchedCurrent, matchedState, evidence, exactIdentity, priorDeliveredGroundingRecall } of ranked) {
    if (result.length >= MAX_ENTRIES) {
      budgetEvicted.push(rejection(entry, 'TOKEN_BUDGET'));
      continue;
    }
    const remainingCharacters = MAX_TOTAL_CHARACTERS - usedCharacters;
    const remainingTokens = tokenBudget - usedTokens;
    if (remainingCharacters < 80) {
      budgetEvicted.push(rejection(entry, 'CHARACTER_BUDGET'));
      continue;
    }
    if (remainingTokens < 24) {
      budgetEvicted.push(rejection(entry, 'TOKEN_BUDGET'));
      continue;
    }

    const aliases = normalizeStringArray(entry.aliases, 30);
    const structuredData = compactStructuredData(entry.structuredData);
    const references = normalizeKnowledgeReferences(entry.references);
    const metadataText = [
      entry.title,
      entry.question || '',
      aliases.join(' '),
      entry.entityKey || '',
      entry.tags.join(' '),
      structuredData ? JSON.stringify(structuredData) : '',
      references.map((item) => `${item.title} ${item.url}`).join(' '),
    ].join('\n');
    const fixedTokens = estimateCustomerServiceRuntimeTextTokens(metadataText) + 10;
    const rawContent = entry.content.trim();
    const fullEstimatedTokens = fixedTokens + estimateCustomerServiceRuntimeTextTokens(rawContent);
    // Business facts are atomic evidence. Never slice an Entry prefix to fit a
    // token budget because a later qualifier/negation may change its meaning.
    if (!rawContent || rawContent.length > remainingCharacters) {
      budgetEvicted.push(rejection(entry, 'CHARACTER_BUDGET'));
      continue;
    }
    if (fullEstimatedTokens > remainingTokens || usedTokens + fullEstimatedTokens > tokenBudget) {
      budgetEvicted.push(rejection(entry, 'TOKEN_BUDGET'));
      continue;
    }

    const collectionIndustryCode = String(entry.collection?.industryCode || '').trim() || null;
    const scopeCoherence = !entry.collectionId && entry.scopeType !== 'COLLECTION'
      ? 'DIRECT_SCOPE' as const
      : collectionIndustryCode ? 'INDUSTRY_MATCH' as const : 'GENERIC_COLLECTION' as const;
    result.push({
      id: entry.id,
      collectionId: entry.collectionId || null,
      collectionName: entry.collection?.name || null,
      collectionRevision: entry.collection?.revision ?? null,
      collectionIndustryCode,
      scopeType: entry.scopeType,
      scopeKey: entry.scopeKey,
      entityType: String(entry.entityType || 'GENERIC'),
      entityKey: entry.entityKey || null,
      aliases,
      category: entry.category,
      title: entry.title,
      question: entry.question,
      content: rawContent,
      tags: entry.tags,
      structuredData,
      references,
      authorityLevel: String(entry.authorityLevel || 'BUSINESS_FACT'),
      sourceType: entry.sourceType,
      sourceReference: entry.sourceReference,
      sourceFileName: entry.sourceFileName || null,
      revision: entry.revision,
      bindingPriority: Math.max(0, Number(entry.bindingPriority || 0)),
      bindingTargetType: entry.bindingTargetType || null,
      bindingTargetKey: entry.bindingTargetKey || null,
      scopeCoherence,
      selectionReason: matchedCurrent && (matchedState || priorDeliveredGroundingRecall)
        ? 'CURRENT_AND_STATE'
        : (matchedState || priorDeliveredGroundingRecall)
          ? 'STATE'
          : 'CURRENT_MESSAGE',
      relevanceScore: Math.round(score * 100) / 100,
      matchEvidence: evidence.slice(0, 20),
      currentMessageEntityIdentity: exactIdentity
        ? {
            authority: 'RUNTIME_CURRENT_MESSAGE_ENTITY_IDENTITY',
            status: 'EXACT_STRUCTURED_ENTITY',
            kind: exactIdentity.kind,
            surface: exactIdentity.surface,
          }
        : null,
      estimatedTokens: fullEstimatedTokens,
    });
    usedCharacters += rawContent.length + metadataText.length;
    usedTokens += fullEstimatedTokens;
  }
  return {
    selected: result,
    scopeRejected: dedupeRejections(scopeRejected).slice(0, 50),
    budgetEvicted: dedupeRejections(budgetEvicted).slice(0, 50),
  };
}

function rejection(
  entry: CustomerServiceRuntimeKnowledgeEntry,
  reason: CustomerServiceKnowledgeSelectionRejection['reason'],
  businessScope?: CustomerServiceEffectiveBusinessScopeV1 | null,
): CustomerServiceKnowledgeSelectionRejection {
  const collectionIndustryCode = String(entry.collection?.industryCode || '').trim() || null;
  return {
    id: entry.id,
    title: entry.title,
    collectionId: entry.collectionId || null,
    collectionName: entry.collection?.name || null,
    collectionIndustryCode,
    collectionCanonicalIndustryCode: canonicalizeCustomerServiceIndustryCode(collectionIndustryCode),
    scopeCanonicalIndustryCode: canonicalizeCustomerServiceIndustryCode(businessScope?.industryCode),
    reason,
  };
}

function dedupeRejections(values: CustomerServiceKnowledgeSelectionRejection[]) {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.id}:${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function relevanceScore(
  entry: CustomerServiceRuntimeKnowledgeEntry,
  message: string,
  terms: WeightedTerm[],
  namedOfferingMentionSpans?: string[],
) {
  const normalizedMessage = normalize(message);
  const title = normalize(entry.title);
  const question = normalize(entry.question || '');
  const content = normalize(entry.content);
  const aliases = normalizeStringArray(entry.aliases, 30).map(normalize).filter(Boolean);
  const entityKey = normalize(entry.entityKey || '');
  const tags = entry.tags.map(normalize).filter(Boolean);
  const structured = normalize(flattenSearchableJson(entry.structuredData));
  const references = normalizeKnowledgeReferences(entry.references)
    .map((item) => normalize(`${item.title} ${item.type}`))
    .filter(Boolean);
  let relevance = 0;
  let matchedCurrent = false;
  let matchedState = false;
  let exactIdentity: CustomerServiceExactNamedOfferingIdentity | null = null;
  const evidence = new Set<string>();

  if (normalizedMessage.length >= 2 && question && (normalizedMessage.includes(question) || question.includes(normalizedMessage))) {
    relevance += 80;
    matchedCurrent = true;
    evidence.add('QUESTION_EXACT_OR_CONTAINED');
  }
  if (normalizedMessage.length >= 2 && entityKey && (normalizedMessage.includes(entityKey) || entityKey.includes(normalizedMessage))) {
    relevance += 95;
    matchedCurrent = true;
    evidence.add('ENTITY_KEY_MATCH');
  }
  if (normalizedMessage.length >= 2 && aliases.some((alias) => normalizedMessage.includes(alias) || alias.includes(normalizedMessage))) {
    relevance += 85;
    matchedCurrent = true;
    evidence.add('ENTITY_ALIAS_MATCH');
  }

  // Retrieval and entity authority are separate layers.
  //
  // 1) Similar title/alias fragments may raise retrieval relevance.
  // 2) A named current-offering fact may gain entity authority only through an
  //    exact Runtime-owned identity resolution. In particular, when the customer
  //    supplied a quoted offering span, that entire span must equal a canonical
  //    title/alias/entity-key surface. Fragments from a longer invented name can
  //    never be stitched together across multiple products.
  const structuredEntity = Boolean(String(entry.entityType || '').trim()
    && String(entry.entityType || '').trim().toUpperCase() !== 'GENERIC'
    && entityKey);
  if (structuredEntity) {
    const titleEntitySurfaces = collectTitleEntitySurfaces(entry.title);
    const matchedTitleSurfaces = titleEntitySurfaces.filter((surface) => normalizedMessage.includes(surface.normalized));
    const fullTitleMatched = title.length >= 4 && normalizedMessage.includes(title);
    const strongSurfaceMatches = matchedTitleSurfaces.filter((surface) => surface.strong);
    if (fullTitleMatched || strongSurfaceMatches.length > 0 || matchedTitleSurfaces.length >= 2) {
      relevance += fullTitleMatched ? 100 : strongSurfaceMatches.length > 0 ? 92 : 82;
      matchedCurrent = true;
      for (const surface of (fullTitleMatched
        ? [{ normalized: title, strong: true }]
        : (strongSurfaceMatches.length ? strongSurfaceMatches : matchedTitleSurfaces)).slice(0, 4)) {
        evidence.add(`TITLE_ENTITY_SURFACE_MATCH:${surface.normalized}`);
      }
    }

    exactIdentity = resolveExactCurrentNamedOfferingIdentity({
      message,
      namedOfferingMentionSpans,
      entityKey: entry.entityKey || '',
      aliases: normalizeStringArray(entry.aliases, 30),
      title: entry.title,
    });
    if (exactIdentity) {
      relevance += exactIdentity.kind === 'QUOTED_EXACT' ? 240 : 180;
      matchedCurrent = true;
      if (exactIdentity.kind === 'TYPED_MENTION_EXACT'
        || exactIdentity.kind === 'QUOTED_EXACT'
        || exactIdentity.kind === 'UNQUOTED_ALIAS_EXACT'
        || exactIdentity.kind === 'TITLE_LABEL_EXACT') {
        evidence.add(`NAMED_OFFERING_EXACT_MATCH:${exactIdentity.surface}`);
      } else if (exactIdentity.kind === 'CORE_EXACT') {
        evidence.add(`NAMED_OFFERING_CORE_EXACT_MATCH:${exactIdentity.surface}`);
      } else {
        evidence.add(`ENTITY_KEY_EXACT_MATCH:${exactIdentity.surface}`);
      }
    }
  }

  for (const item of terms) {
    const term = item.term;
    if (term.length < 2) continue;
    let matched = false;
    if (entityKey.includes(term)) { relevance += 36 * item.weight; matched = true; evidence.add(`ENTITY:${term}`); }
    if (aliases.some((alias) => alias.includes(term) || term.includes(alias))) { relevance += 34 * item.weight; matched = true; evidence.add(`ALIAS:${term}`); }
    if (title.includes(term)) { relevance += 18 * item.weight; matched = true; evidence.add(`TITLE:${term}`); }
    if (question.includes(term)) { relevance += 22 * item.weight; matched = true; evidence.add(`QUESTION:${term}`); }
    if (tags.some((tag) => tag.includes(term) || term.includes(tag))) { relevance += 24 * item.weight; matched = true; evidence.add(`TAG:${term}`); }
    if (structured.includes(term)) { relevance += 12 * item.weight; matched = true; evidence.add(`STRUCTURED:${term}`); }
    if (references.some((reference) => reference.includes(term))) { relevance += 14 * item.weight; matched = true; evidence.add(`REFERENCE:${term}`); }
    if (content.includes(term)) { relevance += 5 * item.weight; matched = true; evidence.add(`CONTENT:${term}`); }
    if (matched && item.source === 'CURRENT') matchedCurrent = true;
    if (matched && item.source === 'STATE') matchedState = true;
  }
  if (!relevance) return { score: 0, matchedCurrent: false, matchedState: false, evidence: [] as string[], exactIdentity: null };

  const scopeBonus = entry.scopeType === 'ACCOUNT' ? 30 : entry.scopeType === 'STORE' ? 22 : 18;
  const bindingBonus = entry.scopeType === 'COLLECTION' ? Math.min(30, Math.max(0, Number(entry.bindingPriority || 0)) / 10) : 0;
  if (bindingBonus > 0) evidence.add(`BOUND_COLLECTION_PRIORITY:${entry.bindingPriority}`);
  return {
    score: relevance + scopeBonus + bindingBonus,
    matchedCurrent,
    matchedState,
    evidence: [...evidence],
    exactIdentity,
  };
}

function isCustomerServiceGuideKnowledgeEntry(entry: CustomerServiceRuntimeKnowledgeEntry) {
  return String(entry.entityType || '').trim().toUpperCase() === 'GUIDE';
}


function collectTitleEntitySurfaces(value: string) {
  const raw = String(value || '').trim();
  const values: Array<{ normalized: string; strong: boolean }> = [];
  const add = (text: string, strong: boolean) => {
    const normalized = normalize(text);
    if (normalized.length < 3) return;
    const current = values.find((item) => item.normalized === normalized);
    if (!current) values.push({ normalized, strong });
    else if (strong) current.strong = true;
  };
  for (const match of raw.matchAll(/[「『【“"']([^」』】”"']{2,40})[」』】”"']/gu)) add(match[1], true);
  const stripped = raw.replace(/[「」『』【】“”"']/gu, ' ');
  for (const token of stripped.match(/[a-z0-9][a-z0-9._+-]{2,}|[\p{Script=Han}]{3,12}/giu) || []) add(token, false);
  return values.slice(0, 12);
}

export type CustomerServiceExactNamedOfferingIdentity = {
  kind: CustomerServiceCurrentMessageEntityIdentityV1['kind'];
  surface: string;
};

export function resolveExactCurrentNamedOfferingIdentity(input: {
  message: string;
  namedOfferingMentionSpans?: string[];
  entityKey: string;
  aliases: string[];
  title: string;
}): CustomerServiceExactNamedOfferingIdentity | null {
  // Deep Recognition owns the customer-written mention boundary. Runtime may only
  // map that typed verbatim span to a canonical server-owned identity surface.
  // Missing typed projection is deliberately fail-closed for entity authority;
  // raw message/title/alias overlap remains retrieval relevance only.
  if (!Array.isArray(input.namedOfferingMentionSpans)) return null;

  const titleIdentity = collectCanonicalTitleIdentitySurfaces(input.title);
  const aliases = input.aliases.map(normalize).filter((value) => value.length >= 3);
  const entityKey = normalize(input.entityKey);
  const typedMentions = normalizeCurrentMessageNamedOfferingMentionSpans(
    input.message,
    input.namedOfferingMentionSpans,
  ).flatMap(collectTypedNamedOfferingIdentitySurfaces)
    .filter((value) => value.length >= 3);
  const canonicalSurfaces = new Set([
    ...(entityKey ? [entityKey] : []),
    ...aliases,
    ...titleIdentity.map((surface) => surface.normalized),
  ]);
  const exactMention = typedMentions.find((mention) => canonicalSurfaces.has(mention));
  return exactMention ? { kind: 'TYPED_MENTION_EXACT', surface: exactMention } : null;
}

function normalizeCurrentMessageNamedOfferingMentionSpans(message: string, value: unknown) {
  const rawMessage = String(message || '');
  if (!rawMessage || !Array.isArray(value)) return [];
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const span = raw.trim();
    if (!span || span.length > 80 || !rawMessage.includes(span) || result.includes(span)) continue;
    result.push(span);
    if (result.length >= 4) break;
  }
  return result;
}


function collectTypedNamedOfferingIdentitySurfaces(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const result: string[] = [];
  const add = (text: string) => {
    const normalized = normalize(text);
    if (normalized.length >= 3 && !result.includes(normalized)) result.push(normalized);
  };

  add(raw);
  // Deep Recognition owns the verbatim named-offering span. Quote delimiters are
  // presentation syntax rather than product identity, so remove only complete paired
  // display quotes while preserving every prefix/suffix character. Exact equality
  // against server-owned canonical surfaces remains the Authority gate.
  const dequoted = raw.replace(/[「『【“"']([^」』】”"']{2,40})[」』】”"']/gu, '$1');
  if (dequoted !== raw) add(dequoted);
  return result.slice(0, 8);
}
function collectCanonicalTitleIdentitySurfaces(value: string) {
  const raw = String(value || '').trim();
  const surfaces: Array<{ normalized: string; kind: 'QUOTED_LABEL' | 'PRODUCT_CORE' | 'FULL_TITLE' }> = [];
  const add = (text: string, kind: 'QUOTED_LABEL' | 'PRODUCT_CORE' | 'FULL_TITLE') => {
    const normalized = normalize(text);
    if (normalized.length < 3) return;
    if (!surfaces.some((item) => item.normalized === normalized && item.kind === kind)) {
      surfaces.push({ normalized, kind });
    }
  };

  add(raw, 'FULL_TITLE');
  const quotePattern = /[「『【“"']([^」』】”"']{2,40})[」』】”"']/gu;
  for (const match of raw.matchAll(quotePattern)) {
    add(match[1], 'QUOTED_LABEL');
    const end = (match.index || 0) + match[0].length;
    const suffix = raw.slice(end).match(/^\s*([\p{Script=Han}a-z0-9._+-]{1,20})/iu)?.[1] || '';
    if (suffix) add(`${match[1]}${suffix}`, 'PRODUCT_CORE');
  }
  return surfaces.slice(0, 12);
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

function compactStructuredData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    if (raw == null || typeof raw === 'boolean' || typeof raw === 'number') output[key] = raw;
    else if (typeof raw === 'string') output[key] = raw.slice(0, 1000);
    else if (Array.isArray(raw)) output[key] = raw.slice(0, 30).map((item) => typeof item === 'string' ? item.slice(0, 500) : item);
    else if (typeof raw === 'object') output[key] = compactJsonValue(raw, 2);
  }
  return Object.keys(output).length ? output : null;
}

function compactJsonValue(value: unknown, depth: number): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 800);
  if (depth <= 0) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactJsonValue(item, depth - 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, item]) => [key, compactJsonValue(item, depth - 1)]));
  }
  return String(value).slice(0, 800);
}

function normalizeKnowledgeReferences(value: unknown): CustomerServiceKnowledgeReference[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return {
      type: String(item.type || 'REFERENCE').trim().toUpperCase().slice(0, 40),
      title: String(item.title || '').trim().slice(0, 200),
      url: String(item.url || '').trim().slice(0, 2000),
      shareable: item.shareable !== false,
    };
  }).filter((item) => Boolean(item.title || item.url));
}

function flattenSearchableJson(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenSearchableJson).join(' ');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => [key, flattenSearchableJson(item)])
    .join(' ');
  return '';
}

function collectStateTerms(
  state: CustomerServiceConversationStateSummary | null | undefined,
  strategy: CustomerServiceConversationStrategyPreferences | null,
): WeightedTerm[] {
  if (!state) return [];
  const policy = strategy?.policy;
  const inferenceMode = policy?.stateInferenceMode || 'CONSERVATIVE';
  const fields = state.canonicalFields;
  const values: Array<{ value: unknown; weight: number }> = [
    { value: usableStateValue(fields.activeTopic, inferenceMode), weight: 1.8 },
    { value: usableStateValue(fields.currentIntent, inferenceMode), weight: 1.6 },
    { value: usableStateValue(fields.customerGoal, inferenceMode), weight: 1.6 },
    { value: usableStateValue(fields.explicitFacts, inferenceMode), weight: 1.45 },
    { value: policy?.reuseConfirmedPreferences === false ? null : usableStateValue(fields.preferences, inferenceMode), weight: 1.55 },
    { value: usableStateValue(fields.pendingItems, inferenceMode), weight: 1.5 },
  ];
  const taskOpen = Boolean(state.activeTask && !['RESOLVED', 'ABANDONED'].includes(state.activeTask.status));
  const safetyTask = Boolean(state.activeTask && [
    'ORDER_STATUS', 'LOGISTICS_DELAY', 'AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION', 'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE',
  ].includes(String(state.activeTask.scenario || '')));
  if (taskOpen && (policy?.continueUnfinishedItems !== false || safetyTask)) {
    values.push(
      { value: state.activeTask?.scenario, weight: 1.8 },
      { value: state.activeTask?.intent, weight: 1.8 },
      { value: state.activeTask?.goal, weight: 1.6 },
      { value: state.activeTask?.pendingSlots, weight: 1.4 },
      { value: state.activeTask?.unresolvedGoals, weight: 1.5 },
    );
  }
  for (const memory of state.relevantMemories || []) {
    if (memory.invalidated || memory.withdrawn || memory.temporaryEmotion || memory.confidence < 0.6) continue;
    if (policy?.reuseConfirmedPreferences === false && memory.kind === 'CUSTOMER_PREFERENCE') continue;
    if (inferenceMode === 'EXPLICIT_ONLY' && memory.confidence < 0.9) continue;
    if (inferenceMode === 'CONSERVATIVE' && memory.confidence < 0.75) continue;
    values.push({ value: [memory.key, memory.value], weight: memory.durable ? 1.35 : 1.1 });
  }
  return values.flatMap(({ value, weight }) => collectTerms(flattenKnowledgeTermValue(value), 'STATE', weight));
}

function usableStateValue<T>(
  field: CustomerServiceConversationStateValue<T>,
  inferenceMode: CustomerServiceConversationStrategyPreferences['policy']['stateInferenceMode'],
): T | null {
  if (!field || !['EXPLICIT', 'INFERRED'].includes(field.status)) return null;
  if (field.status === 'INFERRED') {
    if (inferenceMode === 'EXPLICIT_ONLY') return null;
    const minConfidence = inferenceMode === 'CONSERVATIVE' ? 0.75 : 0.55;
    if (field.confidence < minConfidence) return null;
  }
  return field.value ?? null;
}

function flattenKnowledgeTermValue(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenKnowledgeTermValue);
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [key, ...flattenKnowledgeTermValue(item)]);
  }
  return [];
}

function collectTerms(values: string[], source: WeightedTerm['source'], weight: number): WeightedTerm[] {
  const terms = new Map<string, WeightedTerm>();
  for (const value of values) {
    const normalized = normalize(value);
    for (const token of normalized.match(/[a-z0-9_-]{2,}|[\p{Script=Han}]{2,8}/gu) || []) {
      addWeightedTerm(terms, token, source, weight);
      if (/^[\p{Script=Han}]+$/u.test(token) && token.length > 3) {
        for (let i = 0; i <= token.length - 2; i += 1) addWeightedTerm(terms, token.slice(i, i + 2), source, weight * 0.72);
      }
    }
  }
  return [...terms.values()].slice(0, 100);
}

function addWeightedTerm(target: Map<string, WeightedTerm>, term: string, source: WeightedTerm['source'], weight: number) {
  const current = target.get(term);
  if (!current || weight > current.weight) target.set(term, { term, source, weight });
}

function mergeWeightedTerms(values: WeightedTerm[]) {
  const merged = new Map<string, WeightedTerm>();
  for (const item of values) {
    const key = `${item.source}:${item.term}`;
    const current = merged.get(key);
    if (!current || item.weight > current.weight) merged.set(key, item);
  }
  return [...merged.values()].slice(0, 160);
}

export function estimateCustomerServiceRuntimeTextTokens(value: unknown): number {
  const text = String(value || '').trim();
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const nonCjk = Math.max(0, text.length - cjk);
  return Math.max(1, Math.ceil(cjk * 1.05 + nonCjk / 3.2));
}

function normalizeTokenBudget(value: unknown) {
  if (value === undefined || value === null || value === '') return DEFAULT_MAX_ESTIMATED_TOKENS;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ESTIMATED_TOKENS;
  if (parsed <= 0) return 0;
  return Math.max(128, Math.min(6000, parsed));
}

function normalize(value: string) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ''); }
