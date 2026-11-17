export type CustomerServiceIntentFlowMode = 'AUTO' | 'SELECTED_ONLY' | 'AUTO_EXCEPT_DISABLED';
export type CustomerServiceReplyLengthPreset = 'AUTO' | 'CONCISE' | 'BALANCED' | 'DETAILED' | 'CUSTOM';
export type CustomerServiceProfileDeliveryMode = 'AUTO' | 'SINGLE' | 'SEQUENTIAL';
export type CustomerServiceContextCarryoverMode = 'AUTO' | 'CONSERVATIVE' | 'CONTINUITY_FIRST';
export type CustomerServiceReturningGreetingMode = 'CURRENT_ONLY' | 'SOFT_CONTINUITY' | 'CONTINUE_PENDING';
export type CustomerServiceBusinessIdentityStrength = 'LIGHT' | 'BALANCED' | 'STRONG';
export type CustomerServiceCasualChatBoundary = 'BUSINESS_ANCHORED' | 'FLEXIBLE' | 'OPEN';
export type CustomerServiceStateInferenceMode = 'EXPLICIT_ONLY' | 'CONSERVATIVE' | 'BALANCED';
export type CustomerServiceContextBudgetMode = 'AUTO' | 'CUSTOM';
export type CustomerServiceHumanNaturalnessPreference = 'AUTO' | 'RESERVED' | 'BALANCED' | 'RELAXED';
export type CustomerServiceHumanResponseDensityPreference = 'AUTO' | 'COMPACT' | 'BALANCED' | 'RICH';
export type CustomerServiceHumanColloquialityPreference = 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH';
export type CustomerServiceHumanQuestionFrequencyPreference = 'AUTO' | 'LOW' | 'BALANCED' | 'HIGH';
export type CustomerServiceHumanBusinessAdvancePreference = 'AUTO' | 'LOW' | 'BALANCED' | 'HIGH';
export type CustomerServiceHumanReturningContinuityPreference = 'AUTO' | 'LIGHT' | 'BALANCED' | 'STRONG';
export type CustomerServiceHumanEmojiPreference = 'AUTO' | 'NONE' | 'LIGHT' | 'NATURAL';
export type CustomerServiceHumanIdentityExposurePreference = 'AUTO' | 'AMBIENT' | 'NATURAL' | 'DIRECT';
export type CustomerServiceHumanSegmentationPreference = 'AUTO' | 'COMPACT' | 'BALANCED' | 'SEQUENTIAL';

export type CustomerServiceHumanBehaviorPreferences = {
  naturalness: CustomerServiceHumanNaturalnessPreference;
  responseDensity: CustomerServiceHumanResponseDensityPreference;
  colloquiality: CustomerServiceHumanColloquialityPreference;
  questionFrequency: CustomerServiceHumanQuestionFrequencyPreference;
  businessAdvance: CustomerServiceHumanBusinessAdvancePreference;
  returningContinuity: CustomerServiceHumanReturningContinuityPreference;
  emoji: CustomerServiceHumanEmojiPreference;
  identityExposure: CustomerServiceHumanIdentityExposurePreference;
  segmentation: CustomerServiceHumanSegmentationPreference;
};

export type CustomerServiceIntentFlowPreferences = {
  source: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
  mode: CustomerServiceIntentFlowMode;
  keys: string[];
};

export type CustomerServiceReplyExperiencePreferences = {
  configured: boolean;
  source: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
  preset: CustomerServiceReplyLengthPreset;
  policy: {
    structure: { maxSentences: number | null };
    delivery: {
      mode: CustomerServiceProfileDeliveryMode;
      maxSegments: number;
      splitThresholdChars: number;
      minDelayMs: number;
      maxDelayMs: number;
      cancelRemainingOnCustomerMessage: boolean;
    };
  };
};


export type CustomerServiceConversationStrategyPreferences = {
  configured: boolean;
  source: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
  policy: {
    contextCarryoverMode: CustomerServiceContextCarryoverMode;
    returningGreetingMode: CustomerServiceReturningGreetingMode;
    businessIdentityStrength: CustomerServiceBusinessIdentityStrength;
    casualChatBoundary: CustomerServiceCasualChatBoundary;
    reuseConfirmedPreferences: boolean;
    continueUnfinishedItems: boolean;
    stateInferenceMode: CustomerServiceStateInferenceMode;
    humanBehavior: CustomerServiceHumanBehaviorPreferences;
    contextBudget: {
      mode: CustomerServiceContextBudgetMode;
      activeContextTokenBudget: number;
      totalInputTokenBudget: number;
      reservedInstructionTokens: number;
      maxKnowledgeTokens: number;
    };
  };
};

type ProfileHolder = { profile?: unknown } | null | undefined;

export function resolveCustomerServiceIntentFlowPreferences(input: {
  storeProfile?: ProfileHolder;
  accountProfile?: ProfileHolder;
}): CustomerServiceIntentFlowPreferences {
  const store = readIntentFlow(asRecord(input.storeProfile?.profile), 'STORE_PROFILE');
  const accountRecord = asRecord(input.accountProfile?.profile);
  if (accountRecord.inheritStoreIntentFlow !== false) return store;
  return readIntentFlow(accountRecord, 'ACCOUNT_PROFILE');
}

export function filterCustomerServiceIntentItems<T extends { key?: unknown }>(
  items: T[],
  preferences: CustomerServiceIntentFlowPreferences,
): T[] {
  if (preferences.mode === 'AUTO' || !preferences.keys.length) return items;
  const keys = new Set(preferences.keys);
  if (preferences.mode === 'SELECTED_ONLY') {
    return items.filter((item) => keys.has(normalizeKey(item.key)));
  }
  return items.filter((item) => !keys.has(normalizeKey(item.key)));
}

export function resolveCustomerServiceConversationStrategyPreferences(input: {
  storeProfile?: ProfileHolder;
  accountProfile?: ProfileHolder;
}): CustomerServiceConversationStrategyPreferences {
  const store = readConversationStrategy(asRecord(input.storeProfile?.profile), 'STORE_PROFILE');
  const accountRecord = asRecord(input.accountProfile?.profile);
  if (accountRecord.inheritStoreConversationStrategy !== false) return store;
  return readConversationStrategy(accountRecord, 'ACCOUNT_PROFILE');
}

export function resolveCustomerServiceReplyExperiencePreferences(input: {
  storeProfile?: ProfileHolder;
  accountProfile?: ProfileHolder;
}): CustomerServiceReplyExperiencePreferences {
  const store = readReplyExperience(asRecord(input.storeProfile?.profile), 'STORE_PROFILE');
  const accountRecord = asRecord(input.accountProfile?.profile);
  if (accountRecord.inheritStoreReplyExperience !== false) return store;
  return readReplyExperience(accountRecord, 'ACCOUNT_PROFILE');
}

function readConversationStrategy(
  profile: Record<string, unknown>,
  source: CustomerServiceConversationStrategyPreferences['source'],
): CustomerServiceConversationStrategyPreferences {
  const configuredRecord = asRecord(profile.conversationStrategy);
  const configured = Object.keys(configuredRecord).length > 0;
  const totalInputTokenBudget = clampInteger(configuredRecord.totalInputTokenBudget, 4096, 24000, 8000);
  const reservedInstructionTokens = Math.min(
    Math.max(800, totalInputTokenBudget - 512),
    clampInteger(configuredRecord.reservedInstructionTokens, 800, 5000, 1800),
  );
  const maxKnowledgeUpperBound = Math.max(256, Math.min(6000, totalInputTokenBudget - reservedInstructionTokens - 256));
  return {
    configured,
    source: configured ? source : 'SYSTEM_DEFAULT',
    policy: {
      contextCarryoverMode: normalizeEnum(configuredRecord.contextCarryoverMode, ['AUTO', 'CONSERVATIVE', 'CONTINUITY_FIRST'], 'AUTO'),
      returningGreetingMode: normalizeEnum(configuredRecord.returningGreetingMode, ['CURRENT_ONLY', 'SOFT_CONTINUITY', 'CONTINUE_PENDING'], 'SOFT_CONTINUITY'),
      businessIdentityStrength: normalizeEnum(configuredRecord.businessIdentityStrength, ['LIGHT', 'BALANCED', 'STRONG'], 'BALANCED'),
      casualChatBoundary: normalizeEnum(configuredRecord.casualChatBoundary, ['BUSINESS_ANCHORED', 'FLEXIBLE', 'OPEN'], 'BUSINESS_ANCHORED'),
      reuseConfirmedPreferences: configuredRecord.reuseConfirmedPreferences !== false,
      continueUnfinishedItems: configuredRecord.continueUnfinishedItems !== false,
      stateInferenceMode: normalizeEnum(configuredRecord.stateInferenceMode, ['EXPLICIT_ONLY', 'CONSERVATIVE', 'BALANCED'], 'CONSERVATIVE'),
      humanBehavior: {
        naturalness: normalizeEnum(configuredRecord.humanNaturalness, ['AUTO', 'RESERVED', 'BALANCED', 'RELAXED'], 'AUTO'),
        responseDensity: normalizeEnum(configuredRecord.humanResponseDensity, ['AUTO', 'COMPACT', 'BALANCED', 'RICH'], 'AUTO'),
        colloquiality: normalizeEnum(configuredRecord.humanColloquiality, ['AUTO', 'LOW', 'MEDIUM', 'HIGH'], 'AUTO'),
        questionFrequency: normalizeEnum(configuredRecord.humanQuestionFrequency, ['AUTO', 'LOW', 'BALANCED', 'HIGH'], 'AUTO'),
        businessAdvance: normalizeEnum(configuredRecord.humanBusinessAdvance, ['AUTO', 'LOW', 'BALANCED', 'HIGH'], 'AUTO'),
        returningContinuity: normalizeEnum(configuredRecord.humanReturningContinuity, ['AUTO', 'LIGHT', 'BALANCED', 'STRONG'], 'AUTO'),
        emoji: normalizeEnum(configuredRecord.humanEmoji, ['AUTO', 'NONE', 'LIGHT', 'NATURAL'], 'AUTO'),
        identityExposure: normalizeEnum(configuredRecord.humanIdentityExposure, ['AUTO', 'AMBIENT', 'NATURAL', 'DIRECT'], 'AUTO'),
        segmentation: normalizeEnum(configuredRecord.humanSegmentation, ['AUTO', 'COMPACT', 'BALANCED', 'SEQUENTIAL'], 'AUTO'),
      },
      contextBudget: {
        mode: normalizeEnum(configuredRecord.contextBudgetMode, ['AUTO', 'CUSTOM'], 'AUTO'),
        activeContextTokenBudget: clampInteger(configuredRecord.activeContextTokenBudget, 800, 12000, 3200),
        totalInputTokenBudget,
        reservedInstructionTokens,
        maxKnowledgeTokens: clampInteger(configuredRecord.maxKnowledgeTokens, 256, maxKnowledgeUpperBound, Math.min(2200, maxKnowledgeUpperBound)),
      },
    },
  };
}

function readIntentFlow(
  profile: Record<string, unknown>,
  source: CustomerServiceIntentFlowPreferences['source'],
): CustomerServiceIntentFlowPreferences {
  const mode = normalizeIntentMode(profile.intentFlowMode);
  const keys = uniqueStrings(profile.intentFlowKeys);
  return {
    source: Object.keys(profile).length ? source : 'SYSTEM_DEFAULT',
    mode: mode === 'SELECTED_ONLY' && !keys.length ? 'AUTO' : mode,
    keys,
  };
}

function readReplyExperience(
  profile: Record<string, unknown>,
  source: CustomerServiceReplyExperiencePreferences['source'],
): CustomerServiceReplyExperiencePreferences {
  const preset = normalizeLengthPreset(profile.replyLengthPreset);
  const presetMaxSentences: Record<CustomerServiceReplyLengthPreset, number | null> = {
    AUTO: null,
    CONCISE: 2,
    BALANCED: 4,
    DETAILED: 6,
    CUSTOM: clampInteger(profile.replyMaxSentences, 1, 10, 4),
  };
  const presetThreshold: Record<CustomerServiceReplyLengthPreset, number> = {
    AUTO: 72,
    CONCISE: 48,
    BALANCED: 64,
    DETAILED: 88,
    CUSTOM: clampInteger(profile.splitThresholdChars, 20, 500, 64),
  };
  const minDelayMs = clampInteger(profile.minDelayMs, 0, 10000, 700);
  const maxDelayMs = Math.max(minDelayMs, clampInteger(profile.maxDelayMs, 0, 10000, 1400));
  const configured = [
    'replyLengthPreset', 'replyMaxSentences', 'deliveryMode', 'maxSegments',
    'splitThresholdChars', 'minDelayMs', 'maxDelayMs', 'cancelRemainingOnCustomerMessage',
  ].some((key) => Object.prototype.hasOwnProperty.call(profile, key));
  return {
    configured,
    source: configured ? source : 'SYSTEM_DEFAULT',
    preset,
    policy: {
      structure: {
        maxSentences: presetMaxSentences[preset],
      },
      delivery: {
        mode: normalizeDeliveryMode(profile.deliveryMode),
        maxSegments: clampInteger(profile.maxSegments, 1, 6, 4),
        splitThresholdChars: presetThreshold[preset],
        minDelayMs,
        maxDelayMs,
        cancelRemainingOnCustomerMessage: profile.cancelRemainingOnCustomerMessage !== false,
      },
    },
  };
}

function normalizeIntentMode(value: unknown): CustomerServiceIntentFlowMode {
  const normalized = String(value || '').trim().toUpperCase();
  return ['AUTO', 'SELECTED_ONLY', 'AUTO_EXCEPT_DISABLED'].includes(normalized)
    ? normalized as CustomerServiceIntentFlowMode
    : 'AUTO';
}

function normalizeLengthPreset(value: unknown): CustomerServiceReplyLengthPreset {
  const normalized = String(value || '').trim().toUpperCase();
  return ['AUTO', 'CONCISE', 'BALANCED', 'DETAILED', 'CUSTOM'].includes(normalized)
    ? normalized as CustomerServiceReplyLengthPreset
    : 'AUTO';
}

function normalizeDeliveryMode(value: unknown): CustomerServiceProfileDeliveryMode {
  const normalized = String(value || '').trim().toUpperCase();
  return ['AUTO', 'SINGLE', 'SEQUENTIAL'].includes(normalized)
    ? normalized as CustomerServiceProfileDeliveryMode
    : 'AUTO';
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || '').trim().toUpperCase() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeKey).filter(Boolean))].slice(0, 120);
}

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
