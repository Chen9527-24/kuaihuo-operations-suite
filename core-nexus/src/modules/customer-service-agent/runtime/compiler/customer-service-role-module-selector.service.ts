import { Injectable } from '@nestjs/common';
import {
  CustomerServiceConditionContext,
  CustomerServiceConditionMatcher,
} from '../../shared/conditions/customer-service-condition-matcher.service';

type SelectableRoleModule = {
  key: string;
  name: string;
  conditions: unknown;
};

@Injectable()
export class CustomerServiceRoleModuleSelector {
  constructor(private readonly conditionMatcher: CustomerServiceConditionMatcher) {}

  select<T extends SelectableRoleModule>(modules: T[], context: CustomerServiceConditionContext) {
    const selected: T[] = [];
    const warnings: string[] = [];
    for (const module of modules) {
      const result = this.conditionMatcher.matches(module.conditions, context);
      if (result.invalidReason) {
        warnings.push(`角色模块“${module.name}（${module.key}）”未生效：${result.invalidReason}`);
        continue;
      }
      if (result.matched) selected.push(module);
    }
    return { selected, warnings };
  }
}
