export const CUSTOMER_SERVICE_ASSET_TYPES = [
  'ROLE_MODULE',
  'STRATEGY_GROUP',
  'RESPONSE_POLICY',
  'QUALITY_RULE',
  'WORKFLOW',
  'CASE_REFERENCE',
  'EXACT_REPLY',
  'TEMPLATE_REPLY',
  'REQUIRED_POINTS',
  'REQUIRED_WORKFLOW',
] as const;

export const CUSTOMER_SERVICE_DETERMINISTIC_ASSET_TYPES = [
  'EXACT_REPLY',
  'TEMPLATE_REPLY',
  'REQUIRED_POINTS',
  'REQUIRED_WORKFLOW',
] as const;

export const CUSTOMER_SERVICE_ASSET_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_VERSION_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_ROLE_STATUSES = ['DRAFT', 'ENABLED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_INDUSTRY_STATUSES = ['ENABLED', 'DISABLED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_INDUSTRY_NODE_TYPES = ['INDUSTRY', 'CATEGORY', 'SUBCATEGORY'] as const;
export const CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES = ['ENABLED', 'DISABLED', 'ARCHIVED'] as const;

export type CustomerServiceAssetType = (typeof CUSTOMER_SERVICE_ASSET_TYPES)[number];
export type CustomerServiceDeterministicAssetType = (typeof CUSTOMER_SERVICE_DETERMINISTIC_ASSET_TYPES)[number];
export type CustomerServiceAssetStatus = (typeof CUSTOMER_SERVICE_ASSET_STATUSES)[number];
export type CustomerServiceRoleStatus = (typeof CUSTOMER_SERVICE_ROLE_STATUSES)[number];
export type CustomerServiceIndustryStatus = (typeof CUSTOMER_SERVICE_INDUSTRY_STATUSES)[number];
export type CustomerServiceIndustryNodeType = (typeof CUSTOMER_SERVICE_INDUSTRY_NODE_TYPES)[number];
export type CustomerServiceResponseRuleStatus = (typeof CUSTOMER_SERVICE_RESPONSE_RULE_STATUSES)[number];
