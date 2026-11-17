import { Injectable, Logger } from '@nestjs/common';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import { CustomerServiceGuidelineConditionEvaluator } from './customer-service-guideline-condition-evaluator';
import type {
  CustomerServiceGuidelineAction,
  CustomerServiceGuidelineConflict,
  CustomerServiceGuidelineContextSnapshot,
  CustomerServiceGuidelineCriticality,
  CustomerServiceGuidelineRelationshipRef,
  CustomerServiceGuidelineResolutionSet,
  CustomerServiceGuidelineResolutionTrace,
  CustomerServiceGuidelineResolvedDecision,
  CustomerServicePublishedGuideline,
} from './customer-service-guideline.type';

@Injectable()
export class CustomerServiceGuidelineResolver {
  private readonly logger = new Logger(CustomerServiceGuidelineResolver.name);

  constructor(private readonly conditionEvaluator: CustomerServiceGuidelineConditionEvaluator) {}

  resolveShadow(input: {
    guidelines: CustomerServicePublishedGuideline[];
    context: CustomerServiceGuidelineContextSnapshot;
  }): CustomerServiceGuidelineResolutionSet {
    try {
      return this.resolve(input);
    } catch (error) {
      this.logger.warn(`HVE-2 Guideline Shadow Resolver 失败，保持 HVE-1 legacy shadow plan：${error instanceof Error ? error.message : String(error)}`);
      const base = {
        schemaVersion: 1 as const,
        shadow: true as const,
        snapshotHash: input.context.snapshotHash,
        guidelineVersionIds: [] as string[],
        traces: [] as CustomerServiceGuidelineResolutionTrace[],
        decisions: [] as CustomerServiceGuidelineResolvedDecision[],
        conflicts: [{ kind: 'ACTION_CONFLICT' as const, guidelineIds: [], reasonCode: 'RESOLVER_EXCEPTION' }],
        hasUnresolvedHardConflict: false,
      };
      return { ...base, resolutionHash: stableJsonHash(base) };
    }
  }

  private resolve(input: {
    guidelines: CustomerServicePublishedGuideline[];
    context: CustomerServiceGuidelineContextSnapshot;
  }): CustomerServiceGuidelineResolutionSet {
    const guidelines = dedupeGuidelines(input.guidelines)
      .sort((a, b) => compareGuidelineAuthority(b, a) || a.code.localeCompare(b.code));
    const traceMap = new Map<string, CustomerServiceGuidelineResolutionTrace>();
    const conditionMatched = new Map<string, CustomerServicePublishedGuideline>();

    for (const guideline of guidelines) {
      if (!bindingMatches(guideline, input.context)) {
        traceMap.set(guideline.guidelineId, trace(guideline, 'SCOPE_MISS', 'BINDING_SCOPE_MISS'));
        continue;
      }
      const condition = this.conditionEvaluator.evaluate(guideline.condition, input.context);
      if (condition.status !== 'MATCHED') {
        traceMap.set(guideline.guidelineId, trace(
          guideline,
          condition.status === 'NOT_MATCHED' ? 'CONDITION_FALSE' : condition.status === 'UNKNOWN' ? 'FACT_UNKNOWN' : 'INVALID',
          condition.reasonCode,
          condition.evidence,
        ));
        continue;
      }
      conditionMatched.set(guideline.guidelineId, guideline);
      traceMap.set(guideline.guidelineId, trace(guideline, 'MATCHED', 'CONDITION_MATCHED', condition.evidence));
    }

    const eligible = new Map(conditionMatched);
    // Dependencies are evaluated against currently condition-matched guidelines and may target ids/codes/tags.
    for (const guideline of [...eligible.values()]) {
      const dependency = guideline.relationships.dependencies;
      if (!dependency?.refs?.length) continue;
      const states = dependency.refs.map((ref) => refMatchesAny(ref, [...eligible.values()]));
      const satisfied = dependency.mode === 'ANY' ? states.some(Boolean) : states.every(Boolean);
      if (!satisfied) {
        eligible.delete(guideline.guidelineId);
        traceMap.set(guideline.guidelineId, {
          ...trace(guideline, 'DEPENDENCY_UNMET', 'DEPENDENCY_UNMET'),
          relatedGuidelineIds: resolveRelatedIds(dependency.refs, [...conditionMatched.values()]),
        });
      }
    }

    // Explicit exclusions: a lower-authority rule cannot exclude a higher-authority rule.
    for (const guideline of [...eligible.values()].sort((a, b) => compareGuidelineAuthority(b, a))) {
      if (!eligible.has(guideline.guidelineId)) continue;
      for (const ref of guideline.relationships.excludes || []) {
        const targets = [...eligible.values()].filter((item) => item.guidelineId !== guideline.guidelineId && refMatches(ref, item));
        for (const target of targets) {
          if (compareGuidelineAuthority(guideline, target) < 0) continue;
          eligible.delete(target.guidelineId);
          traceMap.set(target.guidelineId, {
            ...trace(target, 'EXCLUDED', 'EXCLUDED_BY_GUIDELINE'),
            relatedGuidelineIds: [guideline.guidelineId],
          });
        }
      }
    }

    // Explicit priority relations only suppress the target when source is at least as authoritative.
    for (const guideline of [...eligible.values()].sort((a, b) => compareGuidelineAuthority(b, a))) {
      if (!eligible.has(guideline.guidelineId)) continue;
      for (const ref of guideline.relationships.prioritizeOver || []) {
        const targets = [...eligible.values()].filter((item) => item.guidelineId !== guideline.guidelineId && refMatches(ref, item));
        for (const target of targets) {
          if (compareGuidelineAuthority(guideline, target) < 0) continue;
          eligible.delete(target.guidelineId);
          traceMap.set(target.guidelineId, {
            ...trace(target, 'DEPRIORITIZED', 'PRIORITIZED_OVER_BY_GUIDELINE'),
            relatedGuidelineIds: [guideline.guidelineId],
          });
        }
      }
    }

    const conflicts: CustomerServiceGuidelineConflict[] = [];
    const decisions: CustomerServiceGuidelineResolvedDecision[] = [];
    for (const guideline of [...eligible.values()].sort((a, b) => compareGuidelineAuthority(b, a) || a.code.localeCompare(b.code))) {
      for (const action of guideline.actions) {
        decisions.push({
          guidelineId: guideline.guidelineId,
          code: guideline.code,
          versionId: guideline.versionId,
          versionNo: guideline.versionNo,
          criticality: guideline.criticality,
          guidelinePriority: guideline.priority,
          action,
        });
      }
      traceMap.set(guideline.guidelineId, trace(guideline, 'APPLIED', 'GUIDELINE_APPLIED'));
    }

    resolveActionConflicts(decisions, conflicts, traceMap, guidelines);
    const activeDecisions = decisions.filter((item) => traceMap.get(item.guidelineId)?.status === 'APPLIED');
    const guidelineVersionIds = [...eligible.values()].filter((item) => traceMap.get(item.guidelineId)?.status === 'APPLIED').map((item) => item.versionId).sort();
    const payload = {
      schemaVersion: 1 as const,
      shadow: true as const,
      snapshotHash: input.context.snapshotHash,
      guidelineVersionIds,
      traces: [...traceMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
      decisions: activeDecisions,
      conflicts,
      hasUnresolvedHardConflict: conflicts.some((item) => item.kind === 'UNRESOLVED_HARD_CONFLICT'),
    };
    return { ...payload, resolutionHash: stableJsonHash(payload) };
  }
}

function bindingMatches(guideline: CustomerServicePublishedGuideline, context: CustomerServiceGuidelineContextSnapshot) {
  const { type, key } = guideline.binding;
  if (type === 'SYSTEM') return key === '*' || key === 'SYSTEM';
  if (type === 'TENANT') return key === '*' || key === context.tenantId;
  if (type === 'ROLE') return key === context.binding.roleId || normalized(key) === normalized(context.binding.roleCode);
  if (type === 'STORE') return Boolean(context.binding.storeProfileId) && key === context.binding.storeProfileId;
  if (type === 'ACCOUNT') return Boolean(context.binding.accountProfileId) && key === context.binding.accountProfileId;
  if (type === 'INDUSTRY') return Boolean(context.binding.industryCode) && normalized(key) === normalized(context.binding.industryCode!);
  if (type === 'CHANNEL') return Boolean(context.binding.channel) && normalized(key) === normalized(context.binding.channel!);
  return false;
}

function resolveActionConflicts(
  decisions: CustomerServiceGuidelineResolvedDecision[],
  conflicts: CustomerServiceGuidelineConflict[],
  traceMap: Map<string, CustomerServiceGuidelineResolutionTrace>,
  guidelines: CustomerServicePublishedGuideline[],
) {
  const byAct = new Map<string, CustomerServiceGuidelineResolvedDecision[]>();
  for (const decision of decisions) {
    const action = decision.action;
    if (!('act' in action) || !action.act) continue;
    const list = byAct.get(action.act) || [];
    list.push(decision);
    byAct.set(action.act, list);
  }
  for (const [act, items] of byAct) {
    const requires = items.filter((item) => item.action.op === 'REQUIRE_ACT');
    const suppressions = items.filter((item) => item.action.op === 'SUPPRESS_ACT');
    if (!requires.length || !suppressions.length) continue;
    const hardRequires = requires.filter(isHardDecision);
    const hardSuppressions = suppressions.filter(isHardDecision);
    if (!hardRequires.length || !hardSuppressions.length) continue;
    const bestRequire = [...hardRequires].sort(compareDecisionAuthorityDesc)[0];
    const bestSuppress = [...hardSuppressions].sort(compareDecisionAuthorityDesc)[0];
    const delta = compareDecisionAuthority(bestRequire, bestSuppress);
    if (delta === 0) {
      const guidelineIds = uniqueStrings([bestRequire.guidelineId, bestSuppress.guidelineId]);
      conflicts.push({ kind: 'UNRESOLVED_HARD_CONFLICT', act: act as any, guidelineIds, reasonCode: 'EQUAL_AUTHORITY_HARD_REQUIRE_SUPPRESS' });
      for (const id of guidelineIds) {
        const guideline = guidelines.find((item) => item.guidelineId === id);
        if (guideline) traceMap.set(id, { ...trace(guideline, 'CONFLICTED', 'UNRESOLVED_HARD_CONFLICT'), relatedGuidelineIds: guidelineIds.filter((item) => item !== id) });
      }
    } else {
      const loser = delta > 0 ? bestSuppress : bestRequire;
      const winner = delta > 0 ? bestRequire : bestSuppress;
      const loserGuideline = guidelines.find((item) => item.guidelineId === loser.guidelineId);
      if (loserGuideline) traceMap.set(loser.guidelineId, { ...trace(loserGuideline, 'DEPRIORITIZED', 'ACTION_CONFLICT_LOST'), relatedGuidelineIds: [winner.guidelineId] });
    }
  }
}

function isHardDecision(item: CustomerServiceGuidelineResolvedDecision) {
  if (item.action.op === 'SUPPRESS_ACT') return item.action.enforcement === 'HARD';
  if (item.action.op === 'REQUIRE_ACT') return item.action.enforcement !== 'SOFT' && (item.action.necessity || 'REQUIRED') === 'REQUIRED';
  return false;
}
function compareDecisionAuthority(left: CustomerServiceGuidelineResolvedDecision, right: CustomerServiceGuidelineResolvedDecision) {
  const criticalityDelta = criticalityRank(left.criticality) - criticalityRank(right.criticality);
  if (criticalityDelta) return criticalityDelta;
  return left.guidelinePriority - right.guidelinePriority;
}
function compareDecisionAuthorityDesc(a: CustomerServiceGuidelineResolvedDecision, b: CustomerServiceGuidelineResolvedDecision) { return compareDecisionAuthority(b, a); }
function compareGuidelineAuthority(left: CustomerServicePublishedGuideline, right: CustomerServicePublishedGuideline) {
  const criticalityDelta = criticalityRank(left.criticality) - criticalityRank(right.criticality);
  if (criticalityDelta) return criticalityDelta;
  const priorityDelta = left.priority - right.priority;
  if (priorityDelta) return priorityDelta;
  return right.code.localeCompare(left.code);
}
function criticalityRank(value: CustomerServiceGuidelineCriticality) { return value === 'MANDATORY' ? 4 : value === 'IMPORTANT' ? 3 : value === 'STANDARD' ? 2 : 1; }
function trace(
  guideline: CustomerServicePublishedGuideline,
  status: CustomerServiceGuidelineResolutionTrace['status'],
  reasonCode: string,
  conditionEvidence: CustomerServiceGuidelineResolutionTrace['conditionEvidence'] = [],
): CustomerServiceGuidelineResolutionTrace {
  return {
    guidelineId: guideline.guidelineId,
    code: guideline.code,
    versionId: guideline.versionId,
    versionNo: guideline.versionNo,
    criticality: guideline.criticality,
    priority: guideline.priority,
    status,
    reasonCode,
    relatedGuidelineIds: [],
    conditionEvidence,
  };
}
function refMatches(ref: CustomerServiceGuidelineRelationshipRef, guideline: CustomerServicePublishedGuideline) {
  return ref.kind === 'GUIDELINE'
    ? ref.value === guideline.guidelineId || normalized(ref.value) === normalized(guideline.code)
    : guideline.tags.some((tag) => normalized(tag) === normalized(ref.value));
}
function refMatchesAny(ref: CustomerServiceGuidelineRelationshipRef, guidelines: CustomerServicePublishedGuideline[]) { return guidelines.some((item) => refMatches(ref, item)); }
function resolveRelatedIds(refs: CustomerServiceGuidelineRelationshipRef[], guidelines: CustomerServicePublishedGuideline[]) {
  return uniqueStrings(refs.flatMap((ref) => guidelines.filter((item) => refMatches(ref, item)).map((item) => item.guidelineId)));
}
function dedupeGuidelines(items: CustomerServicePublishedGuideline[]) {
  const map = new Map<string, CustomerServicePublishedGuideline>();
  for (const item of items) {
    const previous = map.get(item.guidelineId);
    if (!previous || item.versionNo > previous.versionNo) map.set(item.guidelineId, item);
  }
  return [...map.values()];
}
function normalized(value: string) { return String(value || '').trim().toUpperCase(); }
function uniqueStrings(values: string[]) { return [...new Set(values.filter(Boolean))]; }
