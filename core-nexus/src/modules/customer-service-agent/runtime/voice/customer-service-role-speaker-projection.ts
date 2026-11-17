import {
  defaultCustomerServiceRoleSpeakerProfile,
  parseCustomerServiceRoleSpeakerProfile,
  type CustomerServiceRoleSpeakerProfileV1,
} from '../../shared/role/customer-service-role-speaker-profile';

export type CustomerServiceRoleSpeakerProjectionV1 = {
  schemaVersion: 1;
  source: 'EXPLICIT_ROLE_PROFILE' | 'COMPILED_ROLE_CONTEXT' | 'NEUTRAL_COMPATIBILITY';
  stableCore: CustomerServiceRoleSpeakerProfileV1;
  provenance: {
    roleId: string;
    roleCode: string;
    roleRevision: number;
    prototypeId: string;
    prototypeCode: string;
    prototypeRevision: number;
    speakerProfileSource: 'ROLE_PROTOTYPE' | 'COMPILED_ROLE_CONTEXT' | 'SYSTEM_NEUTRAL';
    legacySummariesPresent: boolean;
    compileEvidence: string[];
    parseIssues: string[];
  };
};

export function resolveCustomerServiceRoleSpeakerProjection(input: {
  role: { id: string; code: string; revision: number };
  prototype: {
    id: string;
    code: string;
    revision: number;
    speakerProfile?: unknown;
    personality?: string | null;
    languageStyle?: string | null;
    servicePosture?: string | null;
  };
  expressionFallback?: {
    tone?: string | null;
    voice?: string | null;
    background?: string | null;
    relationship?: string | null;
    brandTone?: string | null;
  } | null;
}): CustomerServiceRoleSpeakerProjectionV1 {
  const parsed = parseCustomerServiceRoleSpeakerProfile(input.prototype.speakerProfile);
  const explicit = parsed.profile;
  // Free-text role/account/store summaries remain model-facing expression context.
  // They must not be re-parsed by Runtime keyword/regex tables into a second typed
  // behavior authority. Only an explicit structured speakerProfile can own these axes.
  const source: CustomerServiceRoleSpeakerProjectionV1['source'] = explicit
    ? 'EXPLICIT_ROLE_PROFILE'
    : 'NEUTRAL_COMPATIBILITY';
  return {
    schemaVersion: 1,
    source,
    stableCore: explicit || defaultCustomerServiceRoleSpeakerProfile(),
    provenance: {
      roleId: input.role.id,
      roleCode: input.role.code,
      roleRevision: input.role.revision,
      prototypeId: input.prototype.id,
      prototypeCode: input.prototype.code,
      prototypeRevision: input.prototype.revision,
      speakerProfileSource: explicit ? 'ROLE_PROTOTYPE' : 'SYSTEM_NEUTRAL',
      legacySummariesPresent: Boolean(
        input.prototype.personality
        || input.prototype.languageStyle
        || input.prototype.servicePosture
        || input.expressionFallback?.tone
        || input.expressionFallback?.voice
        || input.expressionFallback?.background
        || input.expressionFallback?.relationship
        || input.expressionFallback?.brandTone
      ),
      compileEvidence: explicit ? ['EXPLICIT_TYPED_SPEAKER_PROFILE'] : ['FREE_TEXT_ROLE_CONTEXT_NOT_COMPILED_TO_TYPED_BEHAVIOR'],
      parseIssues: [...parsed.issues],
    },
  };
}
