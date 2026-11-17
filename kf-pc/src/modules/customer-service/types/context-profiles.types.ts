export type CustomerServiceContextStatus = 'DRAFT' | 'ENABLED' | 'DISABLED' | 'ARCHIVED';
export type CustomerServiceLanguageScopeType = 'GLOBAL' | 'STORE' | 'ACCOUNT' | 'ROLE' | 'CHANNEL' | 'SCENARIO' | 'INTENT';
export type CustomerServiceAccountChannel = 'WECHAT' | 'TAOBAO' | 'DOUYIN' | 'XIAOHONGSHU' | 'WEB' | 'AFTER_SALES' | 'PRIVATE_DOMAIN' | 'OTHER';

export interface CustomerServiceStoreProfile {
  id: string; tenantId: string; code: string; name: string; description: string | null;
  profile: Record<string, unknown>; status: CustomerServiceContextStatus; revision: number; updatedAt: string;
  _count?: { accounts: number };
}

export interface CustomerServiceAccountProfile {
  id: string; tenantId: string; code: string; name: string;
  storeProfileId: string | null; merchantRoleId: string | null; industryNodeId: string | null;
  channel: CustomerServiceAccountChannel | null; description: string | null; profile: Record<string, unknown>;
  status: CustomerServiceContextStatus; revision: number; updatedAt: string;
  storeProfile?: { id: string; code: string; name: string; status: string; revision: number } | null;
  merchantRole?: { id: string; code: string; name: string; status: string; revision: number } | null;
  industryNode?: { id: string; code: string; name: string; path: string; status: string; revision: number } | null;
}

export interface CustomerServiceLanguageRule {
  id: string; type: string; pattern: string; replacement?: string | null;
  position: 'ANYWHERE' | 'START' | 'END';
  action: 'PROMPT_ONLY' | 'REMOVE' | 'REPLACE' | 'MODEL_REWRITE' | 'BLOCK' | 'WARN';
  severity: 'HARD' | 'SOFT'; enabled: boolean;
  exceptions?: string[]; limit?: number | null;
  name?: string; description?: string | null;
}

export interface CustomerServiceLanguagePolicy {
  id: string; tenantId: string; code: string; name: string; description: string | null;
  scopeType: CustomerServiceLanguageScopeType; scopeKey: string; priority: number;
  rules: CustomerServiceLanguageRule[]; styleGuidance: Record<string, unknown>;
  status: CustomerServiceContextStatus; revision: number; updatedAt: string;
}

export interface CustomerServiceContextQuery {
  keyword?: string; status?: string; page?: number; pageSize?: number;
}

export type CustomerServiceStoreProfilePayload = Omit<CustomerServiceStoreProfile, 'id' | 'tenantId' | 'updatedAt' | '_count'>;
export type CustomerServiceAccountProfilePayload = Omit<CustomerServiceAccountProfile, 'id' | 'tenantId' | 'updatedAt' | 'storeProfile' | 'merchantRole' | 'industryNode'>;
export type CustomerServiceLanguagePolicyPayload = Omit<CustomerServiceLanguagePolicy, 'id' | 'tenantId' | 'updatedAt'>;

export type CustomerServiceKnowledgeScopeType = 'STORE' | 'ACCOUNT' | 'COLLECTION';
export type CustomerServiceKnowledgeCategory = 'FAQ' | 'PRODUCT' | 'SERVICE' | 'SERVICE_POLICY' | 'BRAND_FACT' | 'ACTIVITY' | 'DOCUMENT' | 'REFERENCE' | 'OTHER';
export type CustomerServiceKnowledgeKind = 'ENTITY' | 'POLICY' | 'BUSINESS_RULE' | 'GUIDE' | 'FAQ' | 'REFERENCE';
export type CustomerServiceKnowledgeSourceType = 'MANUAL' | 'DOCUMENT' | 'IMPORT' | 'CALIBRATION_DRAFT';
export type CustomerServiceKnowledgeBindingTargetType = 'ACCOUNT' | 'STORE' | 'ROLE';

export type CustomerServiceFixedQaMatchType = 'FUZZY' | 'EXACT' | 'CONTAINS' | 'KEYWORD_COMBINATION';
export interface CustomerServiceFixedQaConfig {
  schemaVersion: 1 | 2;
  matchType: CustomerServiceFixedQaMatchType;
  triggerPhrases: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  priority: number;
  loadingDelay: { minMs: number; maxMs: number };
}
export interface CustomerServiceFixedQaResolveResult {
  matched: boolean;
  entryId?: string;
  title?: string;
  answer?: string;
  matchType?: CustomerServiceFixedQaMatchType;
  matchScore?: number;
  matchedPhrases?: string[];
  matchedKeywords?: string[];
  priority?: number;
  delayMs?: number;
  loadingDelay?: { minMs: number; maxMs: number };
  applicability?: {
    scopeType: string;
    scopeKey: string;
    bindingTargetType: string | null;
    bindingTargetKey: string | null;
    bindingPriority: number;
    specificity: number;
  };
}

export interface CustomerServiceKnowledgeReference {
  type: string; title: string; url: string; shareable: boolean;
}

export interface CustomerServiceKnowledgeEntry {
  id: string; tenantId: string; collectionId: string | null; scopeType: CustomerServiceKnowledgeScopeType; scopeKey: string;
  entityType: string; entityKey: string | null; aliases: string[]; knowledgeKind: CustomerServiceKnowledgeKind | null; taxonomyKeys: string[]; structuredData: Record<string, unknown> | null;
  references: CustomerServiceKnowledgeReference[] | null; authorityLevel: string; chunkIndex: number | null; sourceFileName: string | null;
  category: CustomerServiceKnowledgeCategory; title: string; question: string | null; content: string;
  tags: string[]; sourceType: CustomerServiceKnowledgeSourceType; sourceReference: string | null;
  effectiveFrom: string | null; effectiveTo: string | null; freshnessPolicy: string | null;
  status: CustomerServiceContextStatus; revision: number; createdAt: string; updatedAt: string;
}
export interface CustomerServiceKnowledgeEntryQuery extends CustomerServiceContextQuery {
  scopeType?: CustomerServiceKnowledgeScopeType; scopeKey?: string; category?: CustomerServiceKnowledgeCategory;
}
export type CustomerServiceKnowledgeEntryPayload = Partial<Pick<CustomerServiceKnowledgeEntry,
  'collectionId' | 'entityType' | 'entityKey' | 'aliases' | 'knowledgeKind' | 'taxonomyKeys' | 'structuredData' | 'references' | 'authorityLevel' | 'chunkIndex' | 'sourceFileName'
>> & Omit<CustomerServiceKnowledgeEntry, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'revision' | 'collectionId' | 'entityType' | 'entityKey' | 'aliases' | 'knowledgeKind' | 'taxonomyKeys' | 'structuredData' | 'references' | 'authorityLevel' | 'chunkIndex' | 'sourceFileName'>;

export interface CustomerServiceKnowledgeCollection {
  id: string; tenantId: string; name: string; code: string | null; description: string | null; industryCode: string | null;
  status: CustomerServiceContextStatus; revision: number; createdAt: string; updatedAt: string;
  _count?: { entries: number; bindings: number };
  bindings?: CustomerServiceKnowledgeBinding[];
}
export interface CustomerServiceKnowledgeBinding {
  id: string; tenantId: string; collectionId: string; targetType: CustomerServiceKnowledgeBindingTargetType;
  targetKey: string; priority: number; status: 'ENABLED' | 'DISABLED'; createdAt: string; updatedAt: string;
}
export interface CustomerServiceKnowledgeApplicabilityTarget {
  targetType: CustomerServiceKnowledgeBindingTargetType; targetKey: string; priority?: number; status?: 'ENABLED' | 'DISABLED';
}
export interface CustomerServiceKnowledgePreviewItem extends CustomerServiceKnowledgeEntry {
  collectionName?: string | null; selectionReason?: string; relevanceScore?: number; matchEvidence?: string[]; estimatedTokens?: number;
}
export interface CustomerServiceKnowledgePreviewDiagnostics {
  candidateCount: number;
  scopeRejected: Array<{ id: string; title: string; collectionId: string | null; collectionName: string | null; collectionIndustryCode: string | null; collectionCanonicalIndustryCode?: string | null; scopeCanonicalIndustryCode?: string | null; reason: string }>;
  budgetEvicted: Array<{ id: string; title: string; collectionId: string | null; collectionName: string | null; collectionIndustryCode: string | null; collectionCanonicalIndustryCode?: string | null; scopeCanonicalIndustryCode?: string | null; reason: string }>;
  effectiveBusinessScope?: { accountProfileId?: string | null; storeProfileId?: string | null; merchantRoleId?: string | null; industryNodeId?: string | null; industryCode?: string | null } | null;
}

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

export interface CustomerServiceConversationStrategyConfig {
  contextCarryoverMode: CustomerServiceContextCarryoverMode;
  returningGreetingMode: CustomerServiceReturningGreetingMode;
  businessIdentityStrength: CustomerServiceBusinessIdentityStrength;
  casualChatBoundary: CustomerServiceCasualChatBoundary;
  reuseConfirmedPreferences: boolean;
  continueUnfinishedItems: boolean;
  stateInferenceMode: CustomerServiceStateInferenceMode;
  humanNaturalness: CustomerServiceHumanNaturalnessPreference;
  humanResponseDensity: CustomerServiceHumanResponseDensityPreference;
  humanColloquiality: CustomerServiceHumanColloquialityPreference;
  humanQuestionFrequency: CustomerServiceHumanQuestionFrequencyPreference;
  humanBusinessAdvance: CustomerServiceHumanBusinessAdvancePreference;
  humanReturningContinuity: CustomerServiceHumanReturningContinuityPreference;
  humanEmoji: CustomerServiceHumanEmojiPreference;
  humanIdentityExposure: CustomerServiceHumanIdentityExposurePreference;
  humanSegmentation: CustomerServiceHumanSegmentationPreference;
  contextBudgetMode: CustomerServiceContextBudgetMode;
  activeContextTokenBudget: number;
  totalInputTokenBudget: number;
  reservedInstructionTokens: number;
  maxKnowledgeTokens: number;
}
