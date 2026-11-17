export const CUSTOMER_LEAD_FOLLOW_UP_STATUSES = [
  'PENDING_CONTACT',
  'CONTACTED',
  'REQUIREMENT_DISCOVERY',
  'SOLUTION_MATCHING',
  'DEMO_OR_TRIAL',
  'BUSINESS_NEGOTIATION',
  'ON_HOLD',
  'WON',
  'LOST',
] as const;

/**
 * 跟进价值是“是否还值得投入销售/产品资源”的判断；它与当前推进阶段分开维护。
 */
export const CUSTOMER_LEAD_FOLLOW_UP_VALUES = [
  'HIGH',
  'NURTURE',
  'PRODUCT_GAP',
  'TIMING',
  'LOW',
  'NO_FOLLOW_UP',
  'CONVERTED',
] as const;

/** 线索来源用于复盘获客渠道，不能与客户主营类目混用。 */
export const CUSTOMER_LEAD_SOURCES = [
  'UNKNOWN',
  'OFFICIAL_WEBSITE',
  'INBOUND',
  'REFERRAL',
  'CONTENT_OR_AD',
  'OUTBOUND',
  'EVENT_OR_OFFLINE',
  'PARTNER',
  'OTHER',
] as const;

export const CUSTOMER_LEAD_FOLLOW_UP_METHODS = [
  'PHONE',
  'WECHAT',
  'ONLINE_MEETING',
  'ON_SITE_MEETING',
  'DEMO',
  'EMAIL',
  'OTHER',
] as const;

export const CUSTOMER_LEAD_TERMINAL_STATUSES = ['WON', 'LOST'] as const;
export const CUSTOMER_LEAD_TERMINAL_VALUES = ['NO_FOLLOW_UP', 'CONVERTED'] as const;

export const DEFAULT_CUSTOMER_LEAD_FOLLOW_UP_STATUS = 'PENDING_CONTACT';
export const DEFAULT_CUSTOMER_LEAD_FOLLOW_UP_VALUE = 'NURTURE';
export const DEFAULT_CUSTOMER_LEAD_SOURCE = 'UNKNOWN';
