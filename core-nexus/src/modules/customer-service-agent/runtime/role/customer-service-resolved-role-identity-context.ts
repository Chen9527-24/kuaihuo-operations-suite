import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import { resolveCustomerServiceRoleSpeakerProjection, type CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';

export type CustomerServiceResolvedRoleFieldSource =
  | 'ACCOUNT_PROFILE'
  | 'MERCHANT_ROLE'
  | 'ROLE_PROTOTYPE'
  | 'STORE_PROFILE'
  | 'SYSTEM_COMPATIBILITY';

export type CustomerServiceResolvedRoleFieldDiagnostic = {
  field: string;
  source: CustomerServiceResolvedRoleFieldSource;
  sourceKey: string;
  defaulted: boolean;
  compatibilityAlias: boolean;
};

export type CustomerServiceResolvedRoleIdentityContextV1 = {
  schemaVersion: 1;
  authority: 'ROLE_EXPRESSION_ONLY';
  identity: {
    roleName: string;
    roleDescription: string | null;
    publicIdentity: string | null;
    publicRelation: string | null;
    prototypeIdentity: string | null;
  };
  rolePrototype: {
    personality: string | null;
    languageStyle: string | null;
    servicePosture: string | null;
  };
  accountExpression: {
    tone: string | null;
    voice: string | null;
    background: string | null;
    relationship: string | null;
  };
  generationPrompt: {
    authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1';
    role: string | null;
    identity: string | null;
  };
  storeExpression: {
    brandName: string | null;
    brandTone: string | null;
    brandIntro: string | null;
    mainBusiness: string | null;
  };
  serviceContext: {
    greetingServiceScope: string | null;
    businessVisibility: string | null;
    permissions: string | null;
    serviceBoundary: string | null;
  };
  channel: string | null;
  speakerProjection: CustomerServiceRoleSpeakerProjectionV1;
  provenance: {
    roleId: string;
    roleRevision: number;
    prototypeId: string;
    prototypeRevision: number;
    accountProfileId: string | null;
    accountProfileRevision: number | null;
    storeProfileId: string | null;
    storeProfileRevision: number | null;
    fieldSources: CustomerServiceResolvedRoleFieldDiagnostic[];
    conflictKeys: string[];
    missingFields: string[];
    defaultedFields: string[];
    configurationFingerprint: string;
  };
};

type ProfileSource = {
  id: string;
  revision: number;
  channel?: string | null;
  name?: string | null;
  profile?: unknown;
} | null | undefined;

export function resolveCustomerServiceResolvedRoleIdentityContext(input: {
  merchantRole: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    publicIdentity?: unknown;
    publicRelation?: unknown;
    generationPrompt?: unknown;
    revision: number;
  };
  prototype: {
    id: string;
    code: string;
    identity?: unknown;
    personality?: unknown;
    languageStyle?: unknown;
    servicePosture?: unknown;
    speakerProfile?: unknown;
    revision: number;
  };
  accountProfile?: ProfileSource;
  storeProfile?: ProfileSource;
}): CustomerServiceResolvedRoleIdentityContextV1 {
  const account = asRecord(input.accountProfile?.profile);
  const store = asRecord(input.storeProfile?.profile);
  const fieldSources: CustomerServiceResolvedRoleFieldDiagnostic[] = [];
  const conflicts: string[] = [];

  const resolve = (
    field: string,
    candidates: Array<{ source: CustomerServiceResolvedRoleFieldSource; key: string; value: unknown; alias?: boolean }>,
  ) => {
    const present = candidates
      .map((item) => ({ ...item, text: cleanText(item.value, 240) }))
      .filter((item) => Boolean(item.text));
    const chosen = present[0] || null;
    if (!chosen) return null;
    fieldSources.push({
      field,
      source: chosen.source,
      sourceKey: chosen.key,
      defaulted: chosen.source === 'SYSTEM_COMPATIBILITY',
      compatibilityAlias: chosen.alias === true,
    });
    const sameAuthorityValues = present
      .filter((item) => item.source === chosen.source)
      .map((item) => item.text);
    const distinctSameAuthority = [...new Set(sameAuthorityValues)];
    if (distinctSameAuthority.length > 1) {
      conflicts.push(`${field}:${chosen.source}.${chosen.key}`);
    }
    return chosen.text;
  };


  const resolvePrompt = (
    field: string,
    source: CustomerServiceResolvedRoleFieldSource,
    key: string,
    value: unknown,
  ) => {
    const text = cleanPromptText(value, 12000);
    if (!text) return null;
    fieldSources.push({ field, source, sourceKey: key, defaulted: false, compatibilityAlias: false });
    return text;
  };

  const roleDescription = resolve('identity.roleDescription', [
    { source: 'MERCHANT_ROLE', key: 'description', value: input.merchantRole.description },
  ]);
  const publicIdentity = resolve('identity.publicIdentity', [
    { source: 'ACCOUNT_PROFILE', key: 'publicIdentity', value: account.publicIdentity },
    { source: 'MERCHANT_ROLE', key: 'publicIdentity', value: input.merchantRole.publicIdentity },
    { source: 'ROLE_PROTOTYPE', key: 'identity', value: input.prototype.identity },
  ]);
  const publicRelation = resolve('identity.publicRelation', [
    { source: 'MERCHANT_ROLE', key: 'publicRelation', value: input.merchantRole.publicRelation },
  ]);
  const personality = resolve('rolePrototype.personality', [
    { source: 'ROLE_PROTOTYPE', key: 'personality', value: input.prototype.personality },
  ]);
  const languageStyle = resolve('rolePrototype.languageStyle', [
    { source: 'ROLE_PROTOTYPE', key: 'languageStyle', value: input.prototype.languageStyle },
  ]);
  const servicePosture = resolve('rolePrototype.servicePosture', [
    { source: 'ROLE_PROTOTYPE', key: 'servicePosture', value: input.prototype.servicePosture },
  ]);

  // New canonical account fields always win. Legacy aliases remain explicit and observable.
  const tone = resolve('accountExpression.tone', [
    { source: 'ACCOUNT_PROFILE', key: 'tone', value: account.tone },
    { source: 'ACCOUNT_PROFILE', key: 'communicationTone', value: account.communicationTone, alias: true },
    { source: 'STORE_PROFILE', key: 'brandTone', value: store.brandTone },
  ]);
  const voice = resolve('accountExpression.voice', [
    { source: 'ACCOUNT_PROFILE', key: 'voice', value: account.voice },
    { source: 'ACCOUNT_PROFILE', key: 'communicationStyle', value: account.communicationStyle, alias: true },
    { source: 'ROLE_PROTOTYPE', key: 'languageStyle', value: input.prototype.languageStyle },
    { source: 'STORE_PROFILE', key: 'brandTone', value: store.brandTone },
  ]);
  const background = resolve('accountExpression.background', [
    { source: 'ACCOUNT_PROFILE', key: 'background', value: account.background },
    { source: 'MERCHANT_ROLE', key: 'description', value: input.merchantRole.description },
    { source: 'STORE_PROFILE', key: 'brandIntro', value: store.brandIntro },
  ]);
  const relationship = resolve('accountExpression.relationship', [
    { source: 'ACCOUNT_PROFILE', key: 'relationship', value: account.relationship },
    { source: 'ACCOUNT_PROFILE', key: 'customerRelationship', value: account.customerRelationship, alias: true },
    { source: 'ACCOUNT_PROFILE', key: 'relationshipDescription', value: account.relationshipDescription, alias: true },
    { source: 'MERCHANT_ROLE', key: 'publicRelation', value: input.merchantRole.publicRelation },
  ]);
  const roleGenerationPrompt = resolvePrompt('generationPrompt.role', 'MERCHANT_ROLE', 'generationPrompt', input.merchantRole.generationPrompt);
  const identityGenerationPrompt = resolvePrompt('generationPrompt.identity', 'ACCOUNT_PROFILE', 'generationPrompt', account.generationPrompt);

  const brandName = resolve('storeExpression.brandName', [
    { source: 'STORE_PROFILE', key: 'brandName', value: store.brandName },
    { source: 'STORE_PROFILE', key: 'name', value: input.storeProfile?.name },
  ]);
  const brandTone = resolve('storeExpression.brandTone', [
    { source: 'STORE_PROFILE', key: 'brandTone', value: store.brandTone },
  ]);
  const brandIntro = resolve('storeExpression.brandIntro', [
    { source: 'STORE_PROFILE', key: 'brandIntro', value: store.brandIntro },
  ]);
  const mainBusiness = resolve('storeExpression.mainBusiness', [
    { source: 'STORE_PROFILE', key: 'mainBusiness', value: store.mainBusiness },
  ]);
  const greetingServiceScope = resolve('serviceContext.greetingServiceScope', [
    { source: 'ACCOUNT_PROFILE', key: 'greetingServiceScope', value: account.greetingServiceScope },
    { source: 'ACCOUNT_PROFILE', key: 'serviceScope', value: account.serviceScope, alias: true },
    { source: 'ACCOUNT_PROFILE', key: 'businessScope', value: account.businessScope, alias: true },
    { source: 'STORE_PROFILE', key: 'mainBusiness', value: store.mainBusiness },
  ]);
  const businessVisibility = resolve('serviceContext.businessVisibility', [
    { source: 'ACCOUNT_PROFILE', key: 'businessVisibility', value: account.businessVisibility },
  ]);
  const permissions = resolve('serviceContext.permissions', [
    { source: 'ACCOUNT_PROFILE', key: 'permissions', value: account.permissions },
  ]);
  const serviceBoundary = resolve('serviceContext.serviceBoundary', [
    { source: 'ACCOUNT_PROFILE', key: 'serviceBoundary', value: account.serviceBoundary },
    { source: 'STORE_PROFILE', key: 'serviceBoundary', value: store.serviceBoundary },
    { source: 'STORE_PROFILE', key: 'permissionBoundaries', value: store.permissionBoundaries, alias: true },
  ]);

  const speakerProjection = resolveCustomerServiceRoleSpeakerProjection({
    role: { id: input.merchantRole.id, code: input.merchantRole.code, revision: input.merchantRole.revision },
    prototype: {
      id: input.prototype.id,
      code: input.prototype.code,
      revision: input.prototype.revision,
      speakerProfile: input.prototype.speakerProfile,
      personality,
      languageStyle,
      servicePosture,
    },
    expressionFallback: {
      tone,
      voice,
      background,
      relationship,
      brandTone,
    },
  });

  const missingFields = [
    ['identity.publicIdentity', publicIdentity],
    ['accountExpression.tone', tone],
    ['accountExpression.voice', voice],
    ['accountExpression.background', background],
    ['accountExpression.relationship', relationship],
  ].filter(([, value]) => !value).map(([field]) => String(field));
  const defaultedFields = speakerProjection.source === 'NEUTRAL_COMPATIBILITY'
    ? ['speakerProjection']
    : [];

  const fingerprintPayload = {
    role: { id: input.merchantRole.id, revision: input.merchantRole.revision },
    prototype: { id: input.prototype.id, revision: input.prototype.revision },
    account: input.accountProfile ? { id: input.accountProfile.id, revision: input.accountProfile.revision } : null,
    store: input.storeProfile ? { id: input.storeProfile.id, revision: input.storeProfile.revision } : null,
    resolved: {
      roleDescription,
      publicIdentity,
      publicRelation,
      personality,
      languageStyle,
      servicePosture,
      tone,
      voice,
      background,
      relationship,
      roleGenerationPrompt,
      identityGenerationPrompt,
      brandName,
      brandTone,
      brandIntro,
      mainBusiness,
      greetingServiceScope,
      businessVisibility,
      permissions,
      serviceBoundary,
      channel: cleanText(input.accountProfile?.channel, 60),
      speakerSource: speakerProjection.source,
      speakerCore: speakerProjection.stableCore,
    },
  };

  return {
    schemaVersion: 1,
    authority: 'ROLE_EXPRESSION_ONLY',
    identity: {
      roleName: cleanText(input.merchantRole.name, 120) || input.merchantRole.code,
      roleDescription,
      publicIdentity,
      publicRelation,
      prototypeIdentity: cleanText(input.prototype.identity, 180),
    },
    rolePrototype: { personality, languageStyle, servicePosture },
    accountExpression: { tone, voice, background, relationship },
    generationPrompt: {
      authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1',
      role: roleGenerationPrompt,
      identity: identityGenerationPrompt,
    },
    storeExpression: { brandName, brandTone, brandIntro, mainBusiness },
    serviceContext: { greetingServiceScope, businessVisibility, permissions, serviceBoundary },
    channel: cleanText(input.accountProfile?.channel, 60),
    speakerProjection,
    provenance: {
      roleId: input.merchantRole.id,
      roleRevision: input.merchantRole.revision,
      prototypeId: input.prototype.id,
      prototypeRevision: input.prototype.revision,
      accountProfileId: input.accountProfile?.id || null,
      accountProfileRevision: input.accountProfile?.revision ?? null,
      storeProfileId: input.storeProfile?.id || null,
      storeProfileRevision: input.storeProfile?.revision ?? null,
      fieldSources,
      conflictKeys: [...new Set(conflicts)],
      missingFields,
      defaultedFields,
      configurationFingerprint: stableJsonHash(fingerprintPayload),
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanPromptText(value: unknown, limit: number) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').replace(/\r\n?/gu, '\n').trim();
  return text ? text.slice(0, limit) : null;
}

function cleanText(value: unknown, limit: number) {
  if (!['string', 'number', 'boolean'].includes(typeof value)) return null;
  const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, limit) : null;
}

