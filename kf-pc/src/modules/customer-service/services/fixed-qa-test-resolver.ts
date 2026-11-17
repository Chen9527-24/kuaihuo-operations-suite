import { previewCustomerServiceKnowledge } from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceKnowledgeEntry } from '@/modules/customer-service/types/context-profiles.types';

export type CustomerServiceFixedQaMatchType = 'EXACT' | 'CONTAINS' | 'KEYWORD_COMBINATION';

export interface CustomerServiceFixedQaConfig {
  enabled: boolean;
  matchType: CustomerServiceFixedQaMatchType;
  triggerPhrases: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  priority: number;
  loadingMinMs: number;
  loadingMaxMs: number;
}

export interface CustomerServiceFixedQaHit {
  entryId: string;
  title: string;
  answer: string;
  matchType: CustomerServiceFixedQaMatchType;
  matchedPhrases: string[];
  priority: number;
  loadingMs: number;
  collectionId: string | null;
}

export interface ResolveCustomerServiceFixedQaInput {
  message: string;
  accountProfileId?: string;
  storeProfileId?: string;
  merchantRoleId?: string;
}

const DEFAULT_LOADING_MIN_MS = 1800;
const DEFAULT_LOADING_MAX_MS = 4200;

export function readCustomerServiceFixedQaConfig(entry: Pick<CustomerServiceKnowledgeEntry, 'structuredData'>): CustomerServiceFixedQaConfig | null {
  const source = entry.structuredData;
  if (!source || typeof source !== 'object') return null;
  const raw = (source as Record<string, unknown>).fixedQa;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const matchType = normalizeMatchType(record.matchType);
  if (!matchType) return null;
  const loadingMinMs = clampMs(record.loadingMinMs, DEFAULT_LOADING_MIN_MS);
  const loadingMaxMs = Math.max(loadingMinMs, clampMs(record.loadingMaxMs, DEFAULT_LOADING_MAX_MS));
  return {
    enabled: record.enabled !== false,
    matchType,
    triggerPhrases: normalizeStringArray(record.triggerPhrases),
    requiredKeywords: normalizeStringArray(record.requiredKeywords),
    excludedKeywords: normalizeStringArray(record.excludedKeywords),
    priority: normalizeNumber(record.priority, 100),
    loadingMinMs,
    loadingMaxMs,
  };
}

export async function resolveCustomerServiceFixedQa(input: ResolveCustomerServiceFixedQaInput): Promise<CustomerServiceFixedQaHit | null> {
  const message = input.message.trim();
  if (!message || (!input.accountProfileId && !input.storeProfileId && !input.merchantRoleId)) return null;
  const preview = await previewCustomerServiceKnowledge({
    accountProfileId: input.accountProfileId,
    storeProfileId: input.storeProfileId,
    merchantRoleId: input.merchantRoleId,
    message,
  });
  const hits = (preview.selected || [])
    .map((entry) => matchEntry(entry, message))
    .filter((item): item is CustomerServiceFixedQaHit => Boolean(item));
  hits.sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return matchRank(right.matchType) - matchRank(left.matchType);
  });
  return hits[0] || null;
}

export async function waitCustomerServiceFixedQa(hit: CustomerServiceFixedQaHit) {
  if (hit.loadingMs <= 0) return;
  await new Promise<void>((resolve) => window.setTimeout(resolve, hit.loadingMs));
}

function matchEntry(entry: CustomerServiceKnowledgeEntry, message: string): CustomerServiceFixedQaHit | null {
  if (entry.status !== 'ENABLED' || !entry.content?.trim()) return null;
  const config = readCustomerServiceFixedQaConfig(entry);
  if (!config?.enabled) return null;
  const normalizedMessage = normalizeText(message);
  const excluded = config.excludedKeywords.filter((item) => normalizedMessage.includes(normalizeText(item)));
  if (excluded.length) return null;

  let matchedPhrases: string[] = [];
  if (config.matchType === 'EXACT') {
    matchedPhrases = config.triggerPhrases.filter((item) => normalizedMessage === normalizeText(item));
  } else if (config.matchType === 'CONTAINS') {
    matchedPhrases = config.triggerPhrases.filter((item) => normalizedMessage.includes(normalizeText(item)));
  } else {
    const keywords = config.requiredKeywords.filter(Boolean);
    if (keywords.length >= 2 && keywords.every((item) => normalizedMessage.includes(normalizeText(item)))) matchedPhrases = keywords;
  }
  if (!matchedPhrases.length) return null;

  const loadingMs = randomBetween(config.loadingMinMs, config.loadingMaxMs);
  return {
    entryId: entry.id,
    title: entry.title,
    answer: entry.content.trim(),
    matchType: config.matchType,
    matchedPhrases,
    priority: config.priority,
    loadingMs,
    collectionId: entry.collectionId,
  };
}

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[？?！!。．.，,、；;：:]+$/g, '');
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeMatchType(value: unknown): CustomerServiceFixedQaMatchType | null {
  return value === 'EXACT' || value === 'CONTAINS' || value === 'KEYWORD_COMBINATION' ? value : null;
}

function normalizeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampMs(value: unknown, fallback: number) {
  return Math.max(0, Math.min(10000, normalizeNumber(value, fallback)));
}

function randomBetween(min: number, max: number) {
  if (max <= min) return Math.round(min);
  return Math.round(min + Math.random() * (max - min));
}

function matchRank(type: CustomerServiceFixedQaMatchType) {
  return type === 'EXACT' ? 3 : type === 'CONTAINS' ? 2 : 1;
}
