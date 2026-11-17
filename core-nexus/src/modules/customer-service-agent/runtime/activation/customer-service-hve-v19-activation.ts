import { normalizeCustomerServicePublicRelation } from '../../shared/role/customer-service-public-relation';
import type { CustomerServicePublishedGuideline } from '../guideline/customer-service-guideline.type';
import type { CustomerServiceRoleInteractionPostureProjectionV1 } from '../role/customer-service-role-interaction-posture-projection';

/**
 * Activation diagnostics only. This is deliberately NOT a policy/resolver:
 * it cannot add/suppress Acts or alter the Canonical InteractionPlan.
 */
export const CUSTOMER_SERVICE_HVE_V19_REQUIRED_SYSTEM_GUIDELINE_CODES = [
  'hve.social-greeting.presence-only',
  'hve.social-greeting.compatibility-stop',
  'hve.social-greeting.role-service-entry',
  'hve.social-greeting.role-active-service-entry',
  'hve.identity.role-confirmation-stop',
  'hve.identity.role-confirmation-compatibility-stop',
  'hve.identity.role-confirmation-follow-up',
  'hve.identity.role-confirmation-active-follow-up',
  'hve.identity.ai-truthful-stop',
  'hve.boundary.no-questions',
  'hve.boundary.listen-only',
  'hve.boundary.no-advice',
  'hve.behavior.question-fatigue',
  'hve.product.no-grounding-no-recommendation',
  'hve.product.no-grounding-general-guidance',
  'hve.product.clarification-required-only',
  'hve.product.clarification-role-preference',
] as const;

export type CustomerServiceHveV19ActivationBlockerCode =
  | 'ROLE_POSTURE_NOT_TYPED'
  | 'SYSTEM_GUIDELINES_MISSING'
  | 'SYSTEM_GUIDELINE_SEMANTICS_OUTDATED'
  | 'PUBLIC_RELATION_NOT_READY';

export type CustomerServiceHveV19Activation = {
  schemaVersion: 1;
  blueprintVersion: 'V1.9';
  authority: 'DIAGNOSTIC_ONLY';
  status: 'READY' | 'BLOCKED';
  ready: boolean;
  blockerCodes: CustomerServiceHveV19ActivationBlockerCode[];
  rolePostureSource: CustomerServiceRoleInteractionPostureProjectionV1['source'];
  effectivePosture: CustomerServiceRoleInteractionPostureProjectionV1['effective'];
  publicRelation: {
    status: 'VALID' | 'EMPTY' | 'INVALID';
    value: string | null;
    normalizedFromLegacy: boolean;
    issues: string[];
  };
  requiredSystemGuidelineCodes: string[];
  observedSystemGuidelineCodes: string[];
  missingSystemGuidelineCodes: string[];
  semanticMismatchCodes: string[];
  issues: string[];
};

export function inspectCustomerServiceHveV19Activation(input: {
  posture: CustomerServiceRoleInteractionPostureProjectionV1 | null | undefined;
  guidelines: Pick<CustomerServicePublishedGuideline, 'code' | 'originType' | 'actions'>[];
  publicRelation?: unknown;
  businessLabels?: Array<string | null | undefined>;
}): CustomerServiceHveV19Activation {
  const requiredSystemGuidelineCodes = [...CUSTOMER_SERVICE_HVE_V19_REQUIRED_SYSTEM_GUIDELINE_CODES];
  const systemGuidelines = input.guidelines
    .filter((item) => String(item.originType || '').toUpperCase() === 'SYSTEM_TEMPLATE');
  const observedSystemGuidelineCodes = [...new Set(
    systemGuidelines.map((item) => String(item.code || '').trim()).filter(Boolean),
  )].sort();
  const observed = new Set(observedSystemGuidelineCodes);
  const missingSystemGuidelineCodes = requiredSystemGuidelineCodes.filter((code) => !observed.has(code));
  const semanticMismatchCodes = inspectRequiredGuidelineSemantics(systemGuidelines);
  const posture = input.posture;
  const rolePostureSource = posture?.source || 'NONE';
  const effectivePosture = posture?.effective || {
    schemaVersion: 1 as const,
    initiativeLevel: 'BALANCED' as const,
    openingParticipation: 'ACK_ONLY' as const,
    followUpOffering: 'ANSWER_ONLY' as const,
    clarificationInitiative: 'REQUIRED_ONLY' as const,
    guidanceInitiative: 'REQUESTED_ONLY' as const,
    resolutionFollowThrough: 'MINIMAL' as const,
    salesPressure: 'NONE' as const,
  };
  const publicRelation = normalizeCustomerServicePublicRelation(input.publicRelation, {
    businessLabels: input.businessLabels,
    mode: 'RUNTIME_COMPAT',
  });
  const blockerCodes: CustomerServiceHveV19ActivationBlockerCode[] = [];
  const issues: string[] = [];

  if (rolePostureSource !== 'TYPED_V1') {
    blockerCodes.push('ROLE_POSTURE_NOT_TYPED');
    issues.push('当前 Active Role 尚未显式启用 typed V1 Interaction Posture。');
  }
  if (missingSystemGuidelineCodes.length) {
    blockerCodes.push('SYSTEM_GUIDELINES_MISSING');
    issues.push(`System Guideline 未同步到 V1.9 Correction：缺少 ${missingSystemGuidelineCodes.join(', ')}`);
  }
  if (semanticMismatchCodes.length) {
    blockerCodes.push('SYSTEM_GUIDELINE_SEMANTICS_OUTDATED');
    issues.push(`System Guideline 虽存在但行为语义仍不是 V1.9 Correction：${semanticMismatchCodes.join(', ')}`);
  }
  if (publicRelation.status !== 'VALID') {
    blockerCodes.push('PUBLIC_RELATION_NOT_READY');
    issues.push(publicRelation.status === 'EMPTY'
      ? '当前 Active Role 缺少客户可见的对外关系称谓。'
      : `当前 Active Role 的对外关系称谓不能安全用于客户可见身份：${publicRelation.issues.join('；')}`);
  }

  const uniqueBlockers = [...new Set(blockerCodes)];
  return {
    schemaVersion: 1,
    blueprintVersion: 'V1.9',
    authority: 'DIAGNOSTIC_ONLY',
    status: uniqueBlockers.length ? 'BLOCKED' : 'READY',
    ready: uniqueBlockers.length === 0,
    blockerCodes: uniqueBlockers,
    rolePostureSource,
    effectivePosture,
    publicRelation: {
      status: publicRelation.status,
      value: publicRelation.value,
      normalizedFromLegacy: publicRelation.normalizedFromLegacy,
      issues: [...publicRelation.issues],
    },
    requiredSystemGuidelineCodes,
    observedSystemGuidelineCodes,
    missingSystemGuidelineCodes,
    semanticMismatchCodes,
    issues,
  };
}

function inspectRequiredGuidelineSemantics(
  guidelines: Pick<CustomerServicePublishedGuideline, 'code' | 'originType' | 'actions'>[],
) {
  const byCode = new Map(guidelines.map((item) => [item.code, item]));
  const mismatches: string[] = [];
  expectRequire(byCode, mismatches, 'hve.social-greeting.role-service-entry', 'OPEN_SERVICE_INVITATION', 'PREFERRED');
  expectRequire(byCode, mismatches, 'hve.social-greeting.role-active-service-entry', 'OPEN_SERVICE_INVITATION', 'REQUIRED');
  expectRequire(byCode, mismatches, 'hve.identity.role-confirmation-follow-up', 'OPEN_SERVICE_INVITATION', 'PREFERRED');
  expectRequire(byCode, mismatches, 'hve.identity.role-confirmation-active-follow-up', 'OPEN_SERVICE_INVITATION', 'REQUIRED');
  expectRequire(byCode, mismatches, 'hve.product.no-grounding-general-guidance', 'PROVIDE_GENERAL_GUIDANCE', 'PREFERRED');
  expectSuppress(byCode, mismatches, 'hve.product.clarification-required-only', 'REQUEST_OPTIONAL_PREFERENCE', 'HARD');
  expectRequire(byCode, mismatches, 'hve.product.clarification-role-preference', 'REQUEST_OPTIONAL_PREFERENCE', 'PREFERRED');
  expectRequire(byCode, mismatches, 'hve.identity.ai-truthful-stop', 'DISCLOSE_AI_IDENTITY', 'REQUIRED', 'HARD');
  expectCompletion(byCode, mismatches, 'hve.identity.ai-truthful-stop', 'STOP_AFTER_REQUIRED', 'HARD');
  expectSuppress(byCode, mismatches, 'hve.boundary.no-questions', 'OPEN_SERVICE_INVITATION', 'HARD');
  return [...new Set(mismatches)].sort();
}

function expectRequire(
  byCode: Map<string, Pick<CustomerServicePublishedGuideline, 'code' | 'originType' | 'actions'>>,
  mismatches: string[],
  code: string,
  act: string,
  necessity: string,
  enforcement?: string,
) {
  const guideline = byCode.get(code);
  if (!guideline) return;
  const matched = guideline.actions.some((action) => action.op === 'REQUIRE_ACT'
    && action.act === act
    && (action.necessity || 'REQUIRED') === necessity
    && (!enforcement || (action.enforcement || 'HARD') === enforcement));
  if (!matched) mismatches.push(code);
}

function expectSuppress(
  byCode: Map<string, Pick<CustomerServicePublishedGuideline, 'code' | 'originType' | 'actions'>>,
  mismatches: string[],
  code: string,
  act: string,
  enforcement: string,
) {
  const guideline = byCode.get(code);
  if (!guideline) return;
  const matched = guideline.actions.some((action) => action.op === 'SUPPRESS_ACT'
    && action.act === act
    && action.enforcement === enforcement);
  if (!matched) mismatches.push(code);
}

function expectCompletion(
  byCode: Map<string, Pick<CustomerServicePublishedGuideline, 'code' | 'originType' | 'actions'>>,
  mismatches: string[],
  code: string,
  mode: string,
  enforcement: string,
) {
  const guideline = byCode.get(code);
  if (!guideline) return;
  const matched = guideline.actions.some((action) => action.op === 'SET_COMPLETION'
    && action.mode === mode
    && (action.enforcement || 'SOFT') === enforcement);
  if (!matched) mismatches.push(code);
}
