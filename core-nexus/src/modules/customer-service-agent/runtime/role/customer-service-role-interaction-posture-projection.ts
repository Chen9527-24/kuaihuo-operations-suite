import {
  compatibilityCustomerServiceRoleInteractionPosture,
  parseCustomerServiceRoleInteractionPosture,
  type CustomerServiceRoleInteractionPostureV1,
} from '../../shared/role/customer-service-role-interaction-posture';

export type CustomerServiceRoleInteractionPostureProjectionV1 = {
  schemaVersion: 1;
  authority: 'ROLE_DATA_ONLY';
  source: 'TYPED_V1' | 'LEGACY_UNTYPED' | 'NONE';
  effective: CustomerServiceRoleInteractionPostureV1;
  sourceModules: Array<{
    id: string;
    key: string;
    name: string;
    mergeMode: string;
    priority: number;
    sort: number;
    revision: number;
  }>;
  legacyUntypedModuleCount: number;
  issues: string[];
};

type RoleModuleInput = {
  id: string;
  key: string;
  name: string;
  definition: { code: string };
  mergeMode: string;
  priority: number;
  sort: number;
  content: unknown;
  revision: number;
};

export function resolveCustomerServiceRoleInteractionPostureProjection(
  modules: RoleModuleInput[],
): CustomerServiceRoleInteractionPostureProjectionV1 {
  const serviceModules = modules.filter((item) => item.definition.code === 'SERVICE_POSTURE');
  const typed: Array<{ module: RoleModuleInput; posture: CustomerServiceRoleInteractionPostureV1 }> = [];
  const issues: string[] = [];
  let legacyUntypedModuleCount = 0;

  for (const module of serviceModules) {
    const parsed = parseCustomerServiceRoleInteractionPosture(module.content);
    if (parsed.posture) {
      if (module.mergeMode === 'APPEND') {
        issues.push(`${module.key}: typed V1 SERVICE_POSTURE 不支持 APPEND mergeMode`);
        continue;
      }
      typed.push({ module, posture: parsed.posture });
      continue;
    }
    const root = asRecord(module.content);
    if (root?.schemaVersion === 1 && parsed.issues.length) {
      issues.push(...parsed.issues.map((issue) => `${module.key}: ${issue}`));
    } else {
      legacyUntypedModuleCount += 1;
    }
  }

  if (!typed.length) {
    return {
      schemaVersion: 1,
      authority: 'ROLE_DATA_ONLY',
      source: serviceModules.length ? 'LEGACY_UNTYPED' : 'NONE',
      effective: compatibilityCustomerServiceRoleInteractionPosture(),
      sourceModules: [],
      legacyUntypedModuleCount,
      issues,
    };
  }

  const ordered = typed.sort((left, right) =>
    left.module.priority - right.module.priority
    || right.module.sort - left.module.sort
    || left.module.id.localeCompare(right.module.id));
  let effective = clone(ordered[0].posture);
  for (const item of ordered.slice(1)) {
    effective = item.module.mergeMode === 'STRICTER'
      ? stricter(effective, item.posture)
      : clone(item.posture);
  }

  return {
    schemaVersion: 1,
    authority: 'ROLE_DATA_ONLY',
    source: 'TYPED_V1',
    effective,
    sourceModules: ordered.map(({ module }) => ({
      id: module.id,
      key: module.key,
      name: module.name,
      mergeMode: module.mergeMode,
      priority: module.priority,
      sort: module.sort,
      revision: module.revision,
    })),
    legacyUntypedModuleCount,
    issues,
  };
}

function stricter(
  left: CustomerServiceRoleInteractionPostureV1,
  right: CustomerServiceRoleInteractionPostureV1,
): CustomerServiceRoleInteractionPostureV1 {
  return {
    schemaVersion: 1,
    initiativeLevel: lower(left.initiativeLevel, right.initiativeLevel, ['RESTRAINED', 'BALANCED', 'PROACTIVE']),
    openingParticipation: lower(left.openingParticipation, right.openingParticipation, ['ACK_ONLY', 'CONTEXTUAL_ENTRY', 'ACTIVE_ENTRY']),
    followUpOffering: lower(left.followUpOffering, right.followUpOffering, ['ANSWER_ONLY', 'CONTEXTUAL_OFFER', 'ACTIVE_OFFER']),
    clarificationInitiative: lower(left.clarificationInitiative, right.clarificationInitiative, ['REQUIRED_ONLY', 'DECISION_RELEVANT', 'EXPLORATORY']),
    guidanceInitiative: lower(left.guidanceInitiative, right.guidanceInitiative, ['REQUESTED_ONLY', 'CONTEXTUAL', 'PROACTIVE_WHEN_USEFUL']),
    resolutionFollowThrough: lower(left.resolutionFollowThrough, right.resolutionFollowThrough, ['MINIMAL', 'NEXT_STEP', 'UNTIL_RESOLVED']),
    salesPressure: lower(left.salesPressure, right.salesPressure, ['NONE', 'LOW', 'NORMAL']),
  };
}

function lower<T extends string>(left: T, right: T, order: readonly T[]): T {
  return order.indexOf(left) <= order.indexOf(right) ? left : right;
}

function clone(value: CustomerServiceRoleInteractionPostureV1): CustomerServiceRoleInteractionPostureV1 {
  return { ...value };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
