export type CustomerServiceStrategyScopeType = 'ROLE_GLOBAL' | 'SCENARIO' | 'INTENT';
export type CustomerServiceStrategyInheritanceMode = 'INHERIT' | 'INHERIT_AND_OVERRIDE' | 'INDEPENDENT';
export type CustomerServiceTildePolicy = 'FORBIDDEN' | 'FOLLOW_CUSTOMER' | 'ALLOWED';
export type CustomerServiceEmojiPolicy = 'FORBIDDEN' | 'LIMITED' | 'FOLLOW_CUSTOMER' | 'AUTO';
export type CustomerServiceProductMentionPolicy = 'PROHIBITED' | 'CATEGORY_ONLY' | 'SPECIFIC_IF_RELEVANT' | 'SPECIFIC_ALLOWED';
export type CustomerServiceSalesVisibility = 'S0' | 'S1' | 'S2' | 'S3';
export type CustomerServiceMessageDeliveryMode = 'AUTO' | 'SINGLE' | 'SEQUENTIAL';

export type CustomerServiceStrategyPolicyValue = {
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
    sentenceParticleFrequency: 'NONE' | 'LOW' | 'MEDIUM';
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
    salesVisibility: CustomerServiceSalesVisibility | null;
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
};

export type CustomerServiceStrategyGroupContent = {
  schemaVersion: 1;
  scopeType: CustomerServiceStrategyScopeType;
  enabledByDefault?: boolean;
  priority?: number;
  appliesTo?: {
    roleCodes?: string[];
    accountProfileIds?: string[];
    scenarios?: string[];
    intentKeys?: string[];
    intents?: string[];
    industryCodes?: string[];
    riskLevels?: string[];
  };
  policy: Partial<{
    tone: Partial<CustomerServiceStrategyPolicyValue['tone']>;
    wording: Partial<CustomerServiceStrategyPolicyValue['wording']>;
    structure: Partial<CustomerServiceStrategyPolicyValue['structure']>;
    service: Partial<CustomerServiceStrategyPolicyValue['service']>;
    delivery: Partial<CustomerServiceStrategyPolicyValue['delivery']>;
  }>;
};

export type CustomerServiceStrategyPolicySource = {
  sourceType: 'SYSTEM_FALLBACK' | 'ROLE_COMMON' | 'SCENARIO_COMMON' | 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'INTENT_GROUP' | 'INTENT_LEGACY' | 'INTENT_OVERRIDE' | 'DYNAMIC_SAFETY';
  key: string;
  name: string;
  assetId?: string;
  versionId?: string;
  versionNo?: number;
  priority: number;
  contentHash?: string;
};

export type CustomerServiceResolvedStrategyPolicy = {
  schemaVersion: 1;
  inheritance: {
    mode: CustomerServiceStrategyInheritanceMode;
    inheritRoleCommon: boolean;
    inheritScenarioCommon: boolean;
    disabledGroupKeys: string[];
  };
  resolved: CustomerServiceStrategyPolicyValue;
  sources: CustomerServiceStrategyPolicySource[];
  conflicts: Array<{
    kind: 'OVERRIDE' | 'TIGHTENED' | 'MISSING_BINDING' | 'NOT_APPLICABLE';
    path: string;
    previous: unknown;
    next: unknown;
    sourceKey: string;
    resolution: string;
  }>;
  legacyCompatibility: {
    calibrationAdvisoryOnly: true;
    intentJsonMigratedAtRuntime: boolean;
  };
};
