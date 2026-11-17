export type CalibrationAnalysisParseStage =
  | 'STRICT_JSON'
  | 'STRIPPED_FENCE'
  | 'BALANCED_OBJECT'
  | 'TRAILING_COMMA_REPAIR';

export type CalibrationAnalysisParseResult = {
  value: Record<string, unknown>;
  stage: CalibrationAnalysisParseStage;
};

export class CalibrationAnalysisParseError extends Error {
  constructor(
    message: string,
    readonly diagnostics: {
      contentLength: number;
      attemptedStages: CalibrationAnalysisParseStage[];
      lastError: string | null;
    },
  ) {
    super(message);
    this.name = 'CalibrationAnalysisParseError';
  }
}

export function parseCalibrationAnalysisJson(content: string): CalibrationAnalysisParseResult {
  const raw = String(content || '').trim();
  const attemptedStages: CalibrationAnalysisParseStage[] = [];
  let lastError: string | null = null;

  const strict = tryParseObject(raw, 'STRICT_JSON', attemptedStages);
  if (strict.value) return strict.value;
  lastError = strict.error;

  const withoutFence = stripMarkdownFence(raw);
  if (withoutFence !== raw) {
    const fenced = tryParseObject(withoutFence, 'STRIPPED_FENCE', attemptedStages);
    if (fenced.value) return fenced.value;
    lastError = fenced.error;
  }

  const balanced = extractFirstBalancedObject(withoutFence);
  if (balanced) {
    const extracted = tryParseObject(balanced, 'BALANCED_OBJECT', attemptedStages);
    if (extracted.value) return extracted.value;
    lastError = extracted.error;

    const repaired = removeTrailingJsonCommas(balanced);
    if (repaired !== balanced) {
      const repairedResult = tryParseObject(repaired, 'TRAILING_COMMA_REPAIR', attemptedStages);
      if (repairedResult.value) return repairedResult.value;
      lastError = repairedResult.error;
    }
  }

  throw new CalibrationAnalysisParseError('AI 返回的校准分析不是有效的 JSON 对象', {
    contentLength: raw.length,
    attemptedStages,
    lastError,
  });
}

function tryParseObject(
  value: string,
  stage: CalibrationAnalysisParseStage,
  attemptedStages: CalibrationAnalysisParseStage[],
) {
  attemptedStages.push(stage);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { value: null, error: 'JSON 顶层不是对象' };
    }
    return {
      value: { value: parsed as Record<string, unknown>, stage },
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function stripMarkdownFence(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractFirstBalancedObject(value: string) {
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === '{') {
      if (start < 0) start = index;
      depth += 1;
      continue;
    }
    if (character === '}' && start >= 0) {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

function removeTrailingJsonCommas(value: string) {
  let output = '';
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }

    if (character === '"') {
      quoted = true;
      output += character;
      continue;
    }

    if (character === ',') {
      let cursor = index + 1;
      while (cursor < value.length && /\s/.test(value[cursor])) cursor += 1;
      if (value[cursor] === '}' || value[cursor] === ']') continue;
    }
    output += character;
  }
  return output;
}
