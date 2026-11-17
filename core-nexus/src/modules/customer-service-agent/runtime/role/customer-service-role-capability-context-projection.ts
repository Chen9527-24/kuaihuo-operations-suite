import type { CustomerServiceResolvedRoleIdentityContextV1 } from './customer-service-resolved-role-identity-context';
export type CustomerServiceRoleCapabilityContextProjectionV1 = {
  schemaVersion: 1;
  authority: 'ROLE_CONTEXT_ONLY';
  source: 'EXPLICIT_SERVICE_CONTEXT' | 'PUBLIC_ROLE_ONLY' | 'DOMAIN_ONLY' | 'NONE';
  publicRole: {
    relationLabel: string | null;
    identityLabel: string | null;
  };
  serviceContext: {
    primaryScope: string | null;
    supportAreas: string[];
    serviceBoundary: string | null;
    domainLabel: string | null;
  };
  /**
   * Private model-readable Role essence. These fields explain who the explicitly
   * bound Role is and how it participates; they are never customer-visible labels
   * and never grant facts, Acts, permissions, promises, or tool authority.
   * Output identity remains controlled by PublicIdentityProjection + Canonical Plan.
   */
  privateRole: {
    authority: 'MODEL_BEHAVIOR_CONTEXT_ONLY';
    identityEssence: string | null;
    roleDescription: string | null;
    personality: string | null;
    languageStyle: string | null;
    servicePosture: string | null;
    relationshipFrame: string | null;
    disclosurePolicy: 'NEVER_QUOTE_OR_SELF_DISCLOSE';
  };
  /**
   * Customer-facing context only. This projection never grants an Act, capability,
   * fact, workflow, promise, or recommendation authority. The Canonical Plan and
   * Grounding remain authoritative; this data only helps HumanTurn realize already
   * authorized behavior as the explicitly bound Role instead of a generic assistant.
   */
  realizationAnchor: string | null;
  issues: string[];
};

type ProfileSource = { profile?: unknown } | null | undefined;

export function resolveCustomerServiceRoleCapabilityContextProjection(input: {
  merchantRole: {
    publicIdentity?: unknown;
    publicRelation?: unknown;
    description?: unknown;
  };
  prototype?: {
    identity?: unknown;
    personality?: unknown;
    languageStyle?: unknown;
    servicePosture?: unknown;
  } | null;
  industry?: { name?: unknown; path?: unknown } | null;
  accountProfile?: ProfileSource;
  storeProfile?: ProfileSource;
  resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1 | null;
}): CustomerServiceRoleCapabilityContextProjectionV1 {
  const account = asRecord(input.accountProfile?.profile);
  const store = asRecord(input.storeProfile?.profile);
  const resolved = input.resolvedRoleIdentity || null;
  const relationLabel = resolved?.identity.publicRelation || cleanText(input.merchantRole.publicRelation, 48);
  const identityLabel = resolved?.identity.publicIdentity || cleanText(input.merchantRole.publicIdentity, 120);
  const roleDescription = resolved?.identity.roleDescription || cleanText(input.merchantRole.description, 180);
  const identityEssence = resolved?.identity.prototypeIdentity || cleanText(input.prototype?.identity, 180);
  const personality = resolved?.rolePrototype.personality || cleanText(input.prototype?.personality, 180);
  const languageStyle = resolved?.rolePrototype.languageStyle || cleanText(input.prototype?.languageStyle, 180);
  const servicePosture = resolved?.rolePrototype.servicePosture || cleanText(input.prototype?.servicePosture, 180);
  const domainLabel = cleanText(input.industry?.name, 80) || cleanText(input.industry?.path, 120);
  const explicitScopes = resolved
    ? uniqueText([
        resolved.serviceContext.greetingServiceScope,
        resolved.storeExpression.mainBusiness,
      ], 5, 180)
    : uniqueText([
        ...textValues(account.greetingServiceScope),
        ...textValues(account.serviceScope),
        ...textValues(account.businessScope),
        ...textValues(store.mainBusiness),
      ], 5, 180);
  const serviceBoundary = (resolved
    ? uniqueText([
        resolved.serviceContext.serviceBoundary,
        resolved.serviceContext.permissions,
      ], 3, 180)
    : uniqueText([
        ...textValues(account.serviceBoundary),
        ...textValues(account.permissions),
        ...textValues(store.serviceBoundary),
      ], 3, 180)).join('；') || null;
  const supportAreas = resolved
    ? uniqueText([
        ...explicitScopes,
        resolved.storeExpression.brandIntro,
      ], 5, 180)
    : uniqueText([
        ...explicitScopes,
        cleanText(store.brandIntro, 180),
      ], 5, 180);
  const primaryScope = explicitScopes[0] || null;
  const relationshipFrame = resolved
    ? firstText(
        resolved.accountExpression.relationship,
        resolved.accountExpression.voice,
        resolved.accountExpression.tone,
      )
    : firstText(
        account.relationship,
        account.customerRelationship,
        account.relationshipDescription,
        account.voice,
        account.communicationStyle,
      );
  const source: CustomerServiceRoleCapabilityContextProjectionV1['source'] = explicitScopes.length
    ? 'EXPLICIT_SERVICE_CONTEXT'
    : relationLabel || identityLabel
      ? 'PUBLIC_ROLE_ONLY'
      : domainLabel
        ? 'DOMAIN_ONLY'
        : 'NONE';
  const anchorParts = uniqueText([
    relationLabel,
    primaryScope,
    domainLabel,
  ], 3, 120);
  return {
    schemaVersion: 1,
    authority: 'ROLE_CONTEXT_ONLY',
    source,
    publicRole: {
      relationLabel,
      identityLabel,
    },
    serviceContext: {
      primaryScope,
      supportAreas,
      serviceBoundary,
      domainLabel,
    },
    privateRole: {
      authority: 'MODEL_BEHAVIOR_CONTEXT_ONLY',
      identityEssence,
      roleDescription,
      personality,
      languageStyle,
      servicePosture,
      relationshipFrame,
      disclosurePolicy: 'NEVER_QUOTE_OR_SELF_DISCLOSE',
    },
    realizationAnchor: anchorParts.length ? anchorParts.join(' · ') : null,
    issues: [identityEssence, roleDescription, personality, languageStyle, servicePosture].some(Boolean)
      ? []
      : ['PRIVATE_ROLE_ESSENCE_NOT_CONFIGURED'],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, limit: number) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, limit) : null;
}

function textValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item));
  return ['string', 'number', 'boolean'].includes(typeof value) ? [value] : [];
}

function uniqueText(values: unknown[], maxItems: number, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanText(value, limit);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value, 180);
    if (text) return text;
  }
  return null;
}
