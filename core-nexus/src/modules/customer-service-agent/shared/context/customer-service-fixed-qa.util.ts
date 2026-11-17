import type { CustomerServiceRuntimeKnowledgeEntry } from './customer-service-knowledge.util';

export type CustomerServiceFixedQaMatchType = 'FUZZY';

export type CustomerServiceFixedQaMatch = {
  entryId: string;
  title: string;
  answer: string;
  matchType: CustomerServiceFixedQaMatchType;
  matchScore: number;
  matchedPhrases: string[];
  matchedKeywords: string[];
  priority: number;
  delayMs: number;
  loadingDelay: { minMs: number; maxMs: number };
  applicability: {
    scopeType: string;
    scopeKey: string;
    bindingTargetType: string | null;
    bindingTargetKey: string | null;
    bindingPriority: number;
    specificity: number;
  };
};

type FixedQaConfig = {
  triggerPhrases: string[];
  excludedKeywords: string[];
  priority: number;
  loadingDelay: { minMs: number; maxMs: number };
};

type RankedMatch = CustomerServiceFixedQaMatch & {
  phraseSpecificity: number;
};

const DEFAULT_MIN_DELAY_MS = 1800;
const DEFAULT_MAX_DELAY_MS = 4200;
const MIN_ALLOWED_DELAY_MS = 500;
const MAX_ALLOWED_DELAY_MS = 8000;
const DEFAULT_FUZZY_MIN_SCORE = 0.68;
const SHORT_FUZZY_MIN_SCORE = 0.78;
const SHORT_TEXT_LENGTH = 4;
const AMBIGUITY_SCORE_MARGIN = 0.04;

/**
 * Account-bound deterministic FAQ resolver.
 *
 * Scope admission MUST happen before this function. Callers pass only entries returned by
 * CustomerServiceKnowledgeEntryRepository.findRuntimeCandidates(), which already applies
 * ACCOUNT / STORE / ROLE collection bindings and effective-window/status filtering.
 *
 * Every FIXED_QA is intentionally FUZZY. Historical EXACT / CONTAINS / KEYWORD_COMBINATION
 * metadata is treated as compatibility-only input and never changes runtime matching mode.
 * The matcher is deterministic and local; it never calls a model.
 */
export function resolveCustomerServiceFixedQa(
  entries: CustomerServiceRuntimeKnowledgeEntry[],
  message: string,
): CustomerServiceFixedQaMatch | null {
  const normalizedMessage = normalizeCustomerServiceFixedQaText(message);
  if (!normalizedMessage) return null;

  const matches: RankedMatch[] = [];
  for (const entry of entries) {
    if (String(entry.entityType || '').trim().toUpperCase() !== 'FIXED_QA') continue;
    const answer = String(entry.content || '').trim();
    if (!answer) continue;
    const config = parseFixedQaConfig(entry);
    if (!config) continue;

    const excluded = config.excludedKeywords
      .map(normalizeCustomerServiceFixedQaText)
      .filter(Boolean);
    if (excluded.some((keyword) => normalizedMessage.includes(keyword))) continue;

    const candidates = config.triggerPhrases
      .map((raw) => ({
        raw,
        normalized: normalizeCustomerServiceFixedQaText(raw),
      }))
      .filter((item) => Boolean(item.normalized))
      .map((item) => ({
        ...item,
        score: fixedQaFuzzySimilarity(normalizedMessage, item.normalized),
      }))
      .sort((a, b) => b.score - a.score || b.normalized.length - a.normalized.length || a.raw.localeCompare(b.raw));

    const bestPhrase = candidates[0];
    if (!bestPhrase) continue;
    const minScore = fuzzyMinimumScore(normalizedMessage, bestPhrase.normalized);
    if (bestPhrase.score < minScore) continue;

    const applicability = resolveApplicability(entry);
    matches.push({
      entryId: entry.id,
      title: entry.title,
      answer,
      matchType: 'FUZZY',
      matchScore: roundScore(bestPhrase.score),
      matchedPhrases: [bestPhrase.raw],
      matchedKeywords: [],
      priority: config.priority,
      delayMs: randomDelay(config.loadingDelay.minMs, config.loadingDelay.maxMs),
      loadingDelay: config.loadingDelay,
      applicability,
      phraseSpecificity: bestPhrase.normalized.length,
    });
  }

  matches.sort((a, b) =>
    b.applicability.specificity - a.applicability.specificity
    || b.priority - a.priority
    || b.matchScore - a.matchScore
    || b.applicability.bindingPriority - a.applicability.bindingPriority
    || b.phraseSpecificity - a.phraseSpecificity
    || a.entryId.localeCompare(b.entryId));

  const selected = matches[0];
  if (!selected) return null;

  const competing = matches[1];
  if (
    competing
    && competing.applicability.specificity === selected.applicability.specificity
    && competing.priority === selected.priority
    && competing.answer !== selected.answer
    && selected.matchScore - competing.matchScore < AMBIGUITY_SCORE_MARGIN
  ) {
    return null;
  }

  const { phraseSpecificity: _phraseSpecificity, ...result } = selected;
  return result;
}

export function isCustomerServiceFixedQaEntry(entry: Pick<CustomerServiceRuntimeKnowledgeEntry, 'entityType'>) {
  return String(entry.entityType || '').trim().toUpperCase() === 'FIXED_QA';
}

export function normalizeCustomerServiceFixedQaText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
}

export function fixedQaFuzzySimilarity(left: string, right: string) {
  const a = normalizeCustomerServiceFixedQaText(left);
  const b = normalizeCustomerServiceFixedQaText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length, 1);
    return roundScore(0.92 + ratio * 0.08);
  }

  const charDice = diceCoefficient([...a], [...b]);
  const editSimilarity = 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length, 1);
  const bigramDice = diceCoefficient(toBigrams(a), toBigrams(b));
  return roundScore(charDice * 0.5 + editSimilarity * 0.3 + bigramDice * 0.2);
}

function parseFixedQaConfig(entry: CustomerServiceRuntimeKnowledgeEntry): FixedQaConfig | null {
  const structured = asRecord(entry.structuredData);
  const fixedQa = asRecord(structured.fixedQa);
  if (!Object.keys(fixedQa).length) return null;

  const configuredPhrases = normalizeStringArray(fixedQa.triggerPhrases, 80);
  const question = String(entry.question || '').trim();
  const legacyRequiredKeywords = normalizeStringArray(fixedQa.requiredKeywords, 40);
  const legacyKeywordPhrase = legacyRequiredKeywords.length ? legacyRequiredKeywords.join('') : '';
  const triggerPhrases = uniqueStrings([
    ...configuredPhrases,
    ...(question ? [question] : []),
    ...(legacyKeywordPhrase ? [legacyKeywordPhrase] : []),
  ]).slice(0, 80);
  if (!triggerPhrases.length) return null;

  const excludedKeywords = normalizeStringArray(fixedQa.excludedKeywords, 40);
  const loadingDelay = asRecord(fixedQa.loadingDelay);
  let minMs = clampDelay(loadingDelay.minMs, DEFAULT_MIN_DELAY_MS);
  let maxMs = clampDelay(loadingDelay.maxMs, DEFAULT_MAX_DELAY_MS);
  if (maxMs < minMs) [minMs, maxMs] = [maxMs, minMs];
  return {
    triggerPhrases,
    excludedKeywords,
    priority: clampInt(fixedQa.priority, 200, 0, 1000),
    loadingDelay: { minMs, maxMs },
  };
}

function fuzzyMinimumScore(left: string, right: string) {
  return Math.min(left.length, right.length) <= SHORT_TEXT_LENGTH
    ? SHORT_FUZZY_MIN_SCORE
    : DEFAULT_FUZZY_MIN_SCORE;
}

function resolveApplicability(entry: CustomerServiceRuntimeKnowledgeEntry) {
  const scopeType = String(entry.scopeType || '').trim().toUpperCase();
  const bindingTargetType = String(entry.bindingTargetType || '').trim().toUpperCase() || null;
  const specificity = scopeType === 'ACCOUNT'
    ? 500
    : scopeType === 'STORE'
      ? 450
      : bindingTargetType === 'ACCOUNT'
        ? 400
        : bindingTargetType === 'STORE'
          ? 350
          : bindingTargetType === 'ROLE'
            ? 300
            : 0;
  return {
    scopeType,
    scopeKey: String(entry.scopeKey || '').trim(),
    bindingTargetType,
    bindingTargetKey: String(entry.bindingTargetKey || '').trim() || null,
    bindingPriority: clampInt(entry.bindingPriority, 0, 0, 1000),
    specificity,
  };
}

function toBigrams(value: string) {
  if (value.length <= 1) return value ? [value] : [];
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) result.push(value.slice(index, index + 2));
  return result;
}

function diceCoefficient(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0;
  const leftCounts = countValues(left);
  const rightCounts = countValues(right);
  let shared = 0;
  for (const [value, count] of leftCounts.entries()) shared += Math.min(count, rightCounts.get(value) || 0);
  return (2 * shared) / (left.length + right.length);
}

function countValues(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        substitution,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function randomDelay(minMs: number, maxMs: number) {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

function clampDelay(value: unknown, fallback: number) {
  return clampInt(value, fallback, MIN_ALLOWED_DELAY_MS, MAX_ALLOWED_DELAY_MS);
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value).slice(0, limit);
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
