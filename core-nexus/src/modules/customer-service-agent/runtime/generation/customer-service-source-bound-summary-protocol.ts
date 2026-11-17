/**
 * Stage 2E typed Source-Bound Summary producer contract.
 *
 * Canonical Summary has exactly one provenance representation: each sourceRef
 * owns its own evidenceSpans. Parallel sourceRefs/evidenceSpans arrays are not
 * accepted because they do not structurally encode source-to-evidence ownership.
 *
 * This module parses the Generator's typed Summary representation and projects
 * typed summaryText when available. Canonical Transcript remains the factual source
 * Authority; typed provenance validity is diagnostics/provenance evidence only and
 * must never become reply send eligibility.
 * It does not decide whether the turn is a Summary, whether the candidate may
 * be selected, whether regeneration is allowed, or whether the reply is sent.
 */
export type CustomerServiceGeneratedSummarySourceBindingV3 = {
  sourceRef: string;
  evidenceSpans: string[];
};

export type CustomerServiceGeneratedSummaryItemV3 = {
  index: number;
  sources: CustomerServiceGeneratedSummarySourceBindingV3[];
  /** The only customer-visible text owned by this Summary item. */
  content: string;
  source: 'SOURCE_BOUND_SUMMARY_TYPED_ITEM';
};

export type CustomerServiceSourceBoundSummaryTransformationV3 = {
  schemaVersion: 3;
  mode: 'SOURCE_BOUND_SUMMARY';
  outputFormat: 'TYPED_JSON_SOURCE_BINDINGS';
  protocolDetected: boolean;
  protocolValid: boolean;
  /** Exact final-text projection derived only from typed items[].summaryText. */
  visibleText: string;
  issueKeys: string[];
  items: CustomerServiceGeneratedSummaryItemV3[];
};

type RawSummarySourceBinding = {
  sourceRef?: unknown;
  evidenceSpans?: unknown;
};

type RawSummaryItem = {
  sources?: unknown;
  summaryText?: unknown;
};

export function parseCustomerServiceTypedSourceBoundSummary(
  value: string,
): CustomerServiceSourceBoundSummaryTransformationV3 {
  const text = String(value || '').trim();
  if (!text) return invalidTransformation(false, ['SUMMARY_TYPED_OUTPUT_EMPTY']);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalidTransformation(false, ['SUMMARY_TYPED_JSON_INVALID']);
  }

  if (!isPlainObject(parsed)) {
    return invalidTransformation(true, ['SUMMARY_TYPED_TOP_LEVEL_INVALID']);
  }

  const topLevelKeys = Object.keys(parsed);
  const issueKeys: string[] = [];
  if (topLevelKeys.some((key) => key !== 'items')) issueKeys.push('SUMMARY_TYPED_TOP_LEVEL_INVALID');
  if (!Array.isArray(parsed.items)) {
    issueKeys.push('SUMMARY_TYPED_ITEMS_MISSING');
    return invalidTransformation(true, issueKeys);
  }

  const items: CustomerServiceGeneratedSummaryItemV3[] = [];
  for (const raw of parsed.items as RawSummaryItem[]) {
    if (!isPlainObject(raw)) {
      issueKeys.push('SUMMARY_TYPED_ITEM_INVALID');
      continue;
    }
    const itemKeys = Object.keys(raw);
    if (itemKeys.some((key) => !['sources', 'summaryText'].includes(key))) {
      issueKeys.push('SUMMARY_TYPED_ITEM_INVALID');
    }
    const content = typeof raw.summaryText === 'string' ? raw.summaryText.trim() : '';
    const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
    const sources: CustomerServiceGeneratedSummarySourceBindingV3[] = [];
    if (!rawSources.length) issueKeys.push('SUMMARY_TYPED_SOURCE_BINDINGS_MISSING');
    for (const rawSource of rawSources as RawSummarySourceBinding[]) {
      if (!isPlainObject(rawSource)) {
        issueKeys.push('SUMMARY_TYPED_SOURCE_BINDING_INVALID');
        continue;
      }
      const sourceKeys = Object.keys(rawSource);
      if (sourceKeys.some((key) => !['sourceRef', 'evidenceSpans'].includes(key))) {
        issueKeys.push('SUMMARY_TYPED_SOURCE_BINDING_INVALID');
      }
      const sourceRef = typeof rawSource.sourceRef === 'string' ? rawSource.sourceRef.trim() : '';
      const evidenceSpans = uniqueStringValues(rawSource.evidenceSpans);
      if (!sourceRef || !evidenceSpans.length) {
        issueKeys.push('SUMMARY_TYPED_SOURCE_BINDING_INVALID');
      }
      sources.push({ sourceRef, evidenceSpans });
    }
    if (!content) issueKeys.push('SUMMARY_TYPED_ITEM_INVALID');
    items.push({
      index: items.length,
      sources,
      content,
      source: 'SOURCE_BOUND_SUMMARY_TYPED_ITEM',
    });
  }

  if (!items.length) issueKeys.push('SUMMARY_TYPED_ITEMS_EMPTY');
  const uniqueIssues = [...new Set(issueKeys)];
  return {
    schemaVersion: 3,
    mode: 'SOURCE_BOUND_SUMMARY',
    outputFormat: 'TYPED_JSON_SOURCE_BINDINGS',
    protocolDetected: true,
    protocolValid: uniqueIssues.length === 0,
    visibleText: items.map((item) => item.content).filter(Boolean).join('\n\n').trim(),
    issueKeys: uniqueIssues,
    items,
  };
}

function invalidTransformation(
  protocolDetected: boolean,
  issueKeys: string[],
): CustomerServiceSourceBoundSummaryTransformationV3 {
  return {
    schemaVersion: 3,
    mode: 'SOURCE_BOUND_SUMMARY',
    outputFormat: 'TYPED_JSON_SOURCE_BINDINGS',
    protocolDetected,
    protocolValid: false,
    visibleText: '',
    issueKeys: [...new Set(issueKeys)],
    items: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStringValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))];
}
