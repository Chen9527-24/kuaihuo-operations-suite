import { Injectable } from '@nestjs/common';

export type CustomerServiceConditionContext = {
  scenario?: string;
  intent?: string;
  riskLevel: string;
  industryNodeId?: string;
  industryCode?: string;
};

const SUPPORTED_CONDITION_KEYS = new Set([
  'scenarios',
  'intents',
  'riskLevels',
  'industryNodeIds',
  'industryCodes',
]);

@Injectable()
export class CustomerServiceConditionMatcher {
  matches(conditions: unknown, context: CustomerServiceConditionContext) {
    if (conditions === null || conditions === undefined) return { matched: true };
    if (!isRecord(conditions)) return { matched: false, invalidReason: '条件不是 JSON 对象。' };

    const unknownKeys = Object.keys(conditions).filter((key) => !SUPPORTED_CONDITION_KEYS.has(key));
    if (unknownKeys.length) {
      return { matched: false, invalidReason: `包含暂不支持的条件字段：${unknownKeys.join('、')}。` };
    }

    const checks: Array<[string, unknown, string | undefined]> = [
      ['scenarios', conditions.scenarios, context.scenario],
      ['intents', conditions.intents, context.intent],
      ['riskLevels', conditions.riskLevels, context.riskLevel],
      ['industryNodeIds', conditions.industryNodeIds, context.industryNodeId],
      ['industryCodes', conditions.industryCodes, context.industryCode],
    ];
    for (const [key, configured, actual] of checks) {
      if (configured === undefined) continue;
      if (!Array.isArray(configured) || configured.some((item) => typeof item !== 'string')) {
        return { matched: false, invalidReason: `${key} 必须是字符串数组。` };
      }
      if (!configured.length) continue;
      if (!actual || !configured.some((item) => normalize(item) === normalize(actual))) return { matched: false };
    }
    return { matched: true };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalize(value: string) {
  return value.trim().toUpperCase();
}
