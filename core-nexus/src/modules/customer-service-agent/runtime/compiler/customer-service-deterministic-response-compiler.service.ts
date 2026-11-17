import { Injectable } from '@nestjs/common';
import type { CustomerServiceFixedQaMatch } from '../../shared/context/customer-service-fixed-qa.util';

type SelectedRule = {
  rule: {
    id: string;
    key: string;
    name: string;
    priority: number;
    exclusive: boolean;
    responseAsset: {
      id: string;
      key: string;
      name: string;
      assetType: string;
    };
  };
  version: {
    id: string;
    versionNo: number;
    content: unknown;
    contentHash: string;
  };
};

export type CustomerServiceDeterministicReplyPlan = {
  route: 'DETERMINISTIC' | 'UNRESOLVED';
  matchedRules: Array<{
    id: string;
    key: string;
    name: string;
    priority: number;
    exclusive: boolean;
    responseAssetId: string;
    responseAssetKey: string;
    responseType: string;
    versionId: string;
    versionNo: number;
  }>;
  exactReply: string | null;
  fixedQa: CustomerServiceFixedQaMatch | null;
  templateReply: { template: string; rendered: string | null; missingVariables: string[] } | null;
  requiredPoints: string[];
  workflowSteps: Array<{ code: string; name: string; required: boolean }>;
};

@Injectable()
export class CustomerServiceDeterministicResponseCompiler {
  compileFixedQa(match: CustomerServiceFixedQaMatch): CustomerServiceDeterministicReplyPlan {
    return {
      route: 'DETERMINISTIC',
      matchedRules: [],
      exactReply: match.answer,
      fixedQa: match,
      templateReply: null,
      requiredPoints: [],
      workflowSteps: [],
    };
  }

  compile(rules: SelectedRule[], variables: Record<string, unknown>): CustomerServiceDeterministicReplyPlan {
    const plan: CustomerServiceDeterministicReplyPlan = {
      route: rules.length ? 'DETERMINISTIC' : 'UNRESOLVED',
      matchedRules: [],
      exactReply: null,
      fixedQa: null,
      templateReply: null,
      requiredPoints: [],
      workflowSteps: [],
    };

    for (const item of rules) {
      plan.matchedRules.push({
        id: item.rule.id,
        key: item.rule.key,
        name: item.rule.name,
        priority: item.rule.priority,
        exclusive: item.rule.exclusive,
        responseAssetId: item.rule.responseAsset.id,
        responseAssetKey: item.rule.responseAsset.key,
        responseType: item.rule.responseAsset.assetType,
        versionId: item.version.id,
        versionNo: item.version.versionNo,
      });
      const content = asRecord(item.version.content);
      if (!content) continue;
      if (item.rule.responseAsset.assetType === 'EXACT_REPLY' && typeof content.text === 'string') {
        plan.exactReply ??= content.text;
      }
      if (item.rule.responseAsset.assetType === 'TEMPLATE_REPLY' && typeof content.template === 'string') {
        plan.templateReply ??= compileTemplate(content.template, content.variables, variables);
      }
      if (item.rule.responseAsset.assetType === 'REQUIRED_POINTS' && Array.isArray(content.points)) {
        appendUnique(plan.requiredPoints, content.points.filter((value): value is string => typeof value === 'string'));
      }
      if (item.rule.responseAsset.assetType === 'REQUIRED_WORKFLOW' && Array.isArray(content.steps)) {
        for (const step of content.steps) {
          const record = asRecord(step);
          if (!record || typeof record.code !== 'string' || typeof record.name !== 'string') continue;
          if (!plan.workflowSteps.some((existing) => existing.code === record.code)) {
            plan.workflowSteps.push({ code: record.code, name: record.name, required: record.required !== false });
          }
        }
      }
    }
    return plan;
  }
}

function compileTemplate(template: string, definitions: unknown, variables: Record<string, unknown>) {
  const required = Array.isArray(definitions)
    ? definitions
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .filter((item) => item.required !== false && typeof item.key === 'string')
        .map((item) => item.key as string)
    : [];
  const missingVariables = required.filter((key) => !hasValue(variables[key]));
  const rendered = missingVariables.length
    ? null
    : template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => String(variables[key] ?? ''));
  return { template, rendered, missingVariables };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function appendUnique(target: string[], values: string[]) {
  for (const value of values.map((item) => item.trim()).filter(Boolean)) if (!target.includes(value)) target.push(value);
}
