import { stableJsonHash } from './stable-json-hash.util';

export type BoundedJsonPayload = {
  value: unknown;
  originalBytes: number;
  storedBytes: number;
  truncated: boolean;
  truncatedFields: string[];
  contentHash: string;
};

export function boundJsonPayload(value: unknown, maxBytes: number): BoundedJsonPayload {
  const safeLimit = Math.max(16_384, Math.trunc(maxBytes));
  const originalBytes = jsonBytes(value);
  const contentHash = stableJsonHash(value);
  if (originalBytes <= safeLimit) {
    return { value, originalBytes, storedBytes: originalBytes, truncated: false, truncatedFields: [], contentHash };
  }

  const truncatedFields: string[] = [];
  let bounded = compactJson(value, '$', truncatedFields, 0, {
    maxDepth: 12,
    maxStringChars: 8_000,
    maxArrayItems: 100,
    maxObjectKeys: 200,
  });
  let storedBytes = jsonBytes(bounded);
  if (storedBytes > safeLimit) {
    bounded = compactJson(value, '$', truncatedFields, 0, {
      maxDepth: 8,
      maxStringChars: 2_000,
      maxArrayItems: 30,
      maxObjectKeys: 80,
    });
    storedBytes = jsonBytes(bounded);
  }
  if (storedBytes > safeLimit) {
    bounded = {
      _payloadTruncated: true,
      _contentHash: contentHash,
      _originalBytes: originalBytes,
      _reason: 'SERIALIZED_JSON_LIMIT_EXCEEDED',
      _summary: summarizeJson(value),
    };
    truncatedFields.push('$');
    storedBytes = jsonBytes(bounded);
  }
  return {
    value: bounded,
    originalBytes,
    storedBytes,
    truncated: true,
    truncatedFields: [...new Set(truncatedFields)].slice(0, 200),
    contentHash,
  };
}

export function jsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function compactJson(
  value: unknown,
  path: string,
  truncatedFields: string[],
  depth: number,
  limits: { maxDepth: number; maxStringChars: number; maxArrayItems: number; maxObjectKeys: number },
): unknown {
  if (typeof value === 'string') {
    if (value.length <= limits.maxStringChars) return value;
    truncatedFields.push(path);
    return `${value.slice(0, limits.maxStringChars)}…[TRUNCATED:${value.length - limits.maxStringChars}]`;
  }
  if (value === null || value === undefined || typeof value !== 'object') return value ?? null;
  if (depth >= limits.maxDepth) {
    truncatedFields.push(path);
    return { _truncated: true, _reason: 'MAX_DEPTH', _type: Array.isArray(value) ? 'array' : 'object' };
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, limits.maxArrayItems).map((item, index) => compactJson(item, `${path}[${index}]`, truncatedFields, depth + 1, limits));
    if (value.length > limits.maxArrayItems) {
      truncatedFields.push(path);
      items.push({ _truncatedItems: value.length - limits.maxArrayItems });
    }
    return items;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};
  for (const [key, child] of entries.slice(0, limits.maxObjectKeys)) {
    result[key] = compactJson(child, `${path}.${key}`, truncatedFields, depth + 1, limits);
  }
  if (entries.length > limits.maxObjectKeys) {
    truncatedFields.push(path);
    result._truncatedKeys = entries.length - limits.maxObjectKeys;
  }
  return result;
}

function summarizeJson(value: unknown) {
  if (Array.isArray(value)) return { type: 'array', itemCount: value.length };
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value as object).slice(0, 40) };
  if (typeof value === 'string') return { type: 'string', preview: value.slice(0, 500), length: value.length };
  return { type: typeof value, value };
}
