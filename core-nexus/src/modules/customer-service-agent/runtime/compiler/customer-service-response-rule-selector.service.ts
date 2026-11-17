import { Injectable } from '@nestjs/common';
import {
  CustomerServiceConditionContext,
  CustomerServiceConditionMatcher,
} from '../../shared/conditions/customer-service-condition-matcher.service';

type SelectableResponseRule = {
  rule: {
    key: string;
    name: string;
    conditions: unknown;
    exclusions: unknown;
    exclusive: boolean;
  };
};

@Injectable()
export class CustomerServiceResponseRuleSelector {
  constructor(private readonly conditionMatcher: CustomerServiceConditionMatcher) {}

  select<T extends SelectableResponseRule>(rules: T[], context: CustomerServiceConditionContext) {
    const selected: T[] = [];
    const warnings: string[] = [];
    for (const item of rules) {
      const include = this.conditionMatcher.matches(item.rule.conditions, context);
      if (include.invalidReason) {
        warnings.push(`回复规则“${item.rule.name}（${item.rule.key}）”未生效：${include.invalidReason}`);
        continue;
      }
      if (!include.matched) continue;

      const exclude = this.conditionMatcher.matches(item.rule.exclusions, context);
      if (exclude.invalidReason) {
        warnings.push(`回复规则“${item.rule.name}（${item.rule.key}）”排除条件无效：${exclude.invalidReason}`);
        continue;
      }
      if (hasConditionEntries(item.rule.exclusions) && exclude.matched) continue;

      selected.push(item);
      if (item.rule.exclusive) break;
    }
    return { selected, warnings };
  }
}

function hasConditionEntries(value: unknown) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0;
}
