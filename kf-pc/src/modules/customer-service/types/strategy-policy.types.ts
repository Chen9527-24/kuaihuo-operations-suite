export type CustomerServiceStrategyScopeType = 'ROLE_GLOBAL' | 'SCENARIO' | 'INTENT';
export type CustomerServiceStrategyInheritanceMode = 'INHERIT' | 'INHERIT_AND_OVERRIDE' | 'INDEPENDENT';
export type CustomerServiceTildePolicy = 'FORBIDDEN' | 'FOLLOW_CUSTOMER' | 'ALLOWED';
export type CustomerServiceEmojiPolicy = 'FORBIDDEN' | 'LIMITED' | 'FOLLOW_CUSTOMER' | 'AUTO';
export type CustomerServiceSentenceParticleFrequency = 'NONE' | 'LOW' | 'MEDIUM';
export type CustomerServiceProductMentionPolicy = 'PROHIBITED' | 'CATEGORY_ONLY' | 'SPECIFIC_IF_RELEVANT' | 'SPECIFIC_ALLOWED';
export type CustomerServiceMessageDeliveryMode = 'AUTO' | 'SINGLE' | 'SEQUENTIAL';

export interface CustomerServiceStrategyPolicyValue {
  tone: {
    warmth: number | null;
    playfulness: number | null;
    formality: number | null;
    directness: number | null;
    emotionalIntensity: number | null;
  };
  wording: {
    tildePolicy: CustomerServiceTildePolicy;
    emojiPolicy: CustomerServiceEmojiPolicy;
    emojiLimit: number;
    sentenceParticleFrequency: CustomerServiceSentenceParticleFrequency;
    forbiddenExpressions: string[];
    cautiousExpressions: string[];
    preferredExpressions: string[];
    forbiddenSentenceParticles: string[];
    semanticChecks: string[];
  };
  structure: {
    maxQuestions: number | null;
    maxCoreMoves: number | null;
    maxGuesses: number | null;
    maxSentences: number | null;
    allowChoiceQuestions: boolean;
    requireAcknowledgeBeforeQuestion: boolean;
  };
  service: {
    salesVisibility: 'S0' | 'S1' | 'S2' | 'S3' | null;
    productMentionPolicy: CustomerServiceProductMentionPolicy | null;
    firstMove: string | null;
    stopConditions: string[];
  };
  delivery: {
    mode: CustomerServiceMessageDeliveryMode;
    maxSegments: number;
    minDelayMs: number;
    maxDelayMs: number;
    splitThresholdChars: number;
    cancelRemainingOnCustomerMessage: boolean;
  };
}

export interface CustomerServiceStrategyGroupContent {
  schemaVersion: 1;
  scopeType: CustomerServiceStrategyScopeType;
  enabledByDefault: boolean;
  priority: number;
  appliesTo: {
    roleCodes: string[];
    scenarios: string[];
    intentKeys: string[];
    intents: string[];
    industryCodes: string[];
    riskLevels: string[];
  };
  policy: Partial<{
    tone: Partial<CustomerServiceStrategyPolicyValue['tone']>;
    wording: Partial<CustomerServiceStrategyPolicyValue['wording']>;
    structure: Partial<CustomerServiceStrategyPolicyValue['structure']>;
    service: Partial<CustomerServiceStrategyPolicyValue['service']>;
    delivery: Partial<CustomerServiceStrategyPolicyValue['delivery']>;
  }>;
}

export interface CustomerServiceResolvedStrategyPolicy {
  schemaVersion: 1;
  inheritance: {
    mode: CustomerServiceStrategyInheritanceMode;
    inheritRoleCommon: boolean;
    inheritScenarioCommon: boolean;
    disabledGroupKeys: string[];
  };
  resolved: CustomerServiceStrategyPolicyValue;
  sources: Array<{
    sourceType: string;
    key: string;
    name: string;
    assetId?: string;
    versionId?: string;
    versionNo?: number;
    priority: number;
    contentHash?: string;
  }>;
  conflicts: Array<{
    kind: 'OVERRIDE' | 'TIGHTENED' | 'MISSING_BINDING' | 'NOT_APPLICABLE';
    path: string;
    previous: unknown;
    next: unknown;
    sourceKey: string;
    resolution: string;
  }>;
  legacyCompatibility: { calibrationAdvisoryOnly: true; intentJsonMigratedAtRuntime: boolean };
}

export interface CustomerServiceIntentStrategyPolicyConfig {
  mode: CustomerServiceStrategyInheritanceMode;
  inheritRoleCommon: boolean;
  inheritScenarioCommon: boolean;
  bindings: Array<{ key: string; enabled: boolean; overrides?: Record<string, unknown> }>;
  disabledGroupKeys: string[];
  overrides: Record<string, unknown>;
}
