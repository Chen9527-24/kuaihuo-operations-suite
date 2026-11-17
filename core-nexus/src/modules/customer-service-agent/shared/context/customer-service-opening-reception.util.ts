export type CustomerServiceOpeningReceptionType =
  | 'AUTO'
  | 'BUSINESS_SERVICE'
  | 'CONTENT_INTERACTION'
  | 'COMMUNITY_COMPANION'
  | 'AFTER_SALES'
  | 'CONSULTANT';

export type CustomerServiceGreetingMode = 'SERVICE_SCOPE' | 'LIGHT_QUESTION' | 'ACK_ONLY' | 'CUSTOM';
export type CustomerServiceBusinessVisibility = 'NONE' | 'LIGHT' | 'EXPLICIT';

export type CustomerServiceOpeningReceptionContext = {
  active: boolean;
  receptionType: Exclude<CustomerServiceOpeningReceptionType, 'AUTO'>;
  greetingMode: CustomerServiceGreetingMode;
  greetingModeConfigured: boolean;
  businessVisibility: CustomerServiceBusinessVisibility;
  businessVisibilityConfigured: boolean;
  allowCasualChatOnOpening: boolean;
  maxChars: number;
  maxQuestions: number;
  identityLabel: string;
  serviceScopeSummary: string;
  customGuidance: string;
  reason: 'NOT_GREETING' | 'HAS_MEANINGFUL_HISTORY' | 'OPENING_GREETING';
};

type ProfileSource = {
  name?: string | null;
  profile?: unknown;
} | null | undefined;

type ConversationItem = { role?: string; content?: string };

export function resolveCustomerServiceOpeningReception(input: {
  accountProfile: ProfileSource;
  storeProfile: ProfileSource;
  latestMessage?: string;
  conversationHistory?: ConversationItem[];
  understanding?: {
    primaryScenario?: string | null;
    primaryIntent?: string | null;
    humanContext?: {
      primaryMotive?: string | null;
      interactionStrategy?: { phase?: string | null } | null;
      dominantTurnGoal?: { key?: string | null } | null;
      requiredTurnGoals?: Array<{ key?: string | null }> | null;
    } | null;
  } | null;
}): CustomerServiceOpeningReceptionContext {
  const account = asRecord(input.accountProfile?.profile);
  const store = asRecord(input.storeProfile?.profile);
  const isGreeting = isTypedOpeningGreeting(input.understanding);
  const hasMeaningfulHistory = (input.conversationHistory || []).some((item) => isMeaningfulConversationContent(item?.content));
  const configuredType = normalizeEnum<CustomerServiceOpeningReceptionType>(
    account.receptionType,
    ['AUTO', 'BUSINESS_SERVICE', 'CONTENT_INTERACTION', 'COMMUNITY_COMPANION', 'AFTER_SALES', 'CONSULTANT'],
    'AUTO',
  );
  const receptionType = configuredType === 'AUTO'
    ? inferReceptionTypeFromStructuredProfile(store)
    : configuredType;
  const businessAccount = ['BUSINESS_SERVICE', 'AFTER_SALES', 'CONSULTANT'].includes(receptionType);
  const greetingModeConfigured = Object.prototype.hasOwnProperty.call(account, 'greetingMode');
  const greetingMode = normalizeEnum<CustomerServiceGreetingMode>(
    account.greetingMode,
    ['SERVICE_SCOPE', 'LIGHT_QUESTION', 'ACK_ONLY', 'CUSTOM'],
    businessAccount ? 'SERVICE_SCOPE' : 'ACK_ONLY',
  );
  const businessVisibilityConfigured = Object.prototype.hasOwnProperty.call(account, 'businessVisibility');
  const businessVisibility = normalizeEnum<CustomerServiceBusinessVisibility>(
    account.businessVisibility,
    ['NONE', 'LIGHT', 'EXPLICIT'],
    businessAccount ? 'LIGHT' : 'NONE',
  );
  const allowCasualChatOnOpening = typeof account.allowCasualChatOnOpening === 'boolean'
    ? account.allowCasualChatOnOpening
    : !businessAccount;
  const identityLabel = cleanText(account.publicIdentity || input.accountProfile?.name || '当前账号', 80);
  const serviceScopeSummary = cleanText(
    account.greetingServiceScope
      || account.permissions
      || store.mainBusiness
      || store.brandIntro
      || '',
    240,
  );
  const customGuidance = cleanText(account.customGreetingGuidance || '', 500);
  const maxChars = clampNumber(account.openingMaxChars, 12, 120, businessAccount ? 40 : 50);
  const maxQuestions = clampNumber(account.openingMaxQuestions, 0, 1, greetingMode === 'ACK_ONLY' ? 0 : 1);
  const active = isGreeting && !hasMeaningfulHistory;
  return {
    active,
    receptionType,
    greetingMode,
    greetingModeConfigured,
    businessVisibility,
    businessVisibilityConfigured,
    allowCasualChatOnOpening,
    maxChars,
    maxQuestions,
    identityLabel,
    serviceScopeSummary,
    customGuidance,
    reason: !isGreeting ? 'NOT_GREETING' : hasMeaningfulHistory ? 'HAS_MEANINGFUL_HISTORY' : 'OPENING_GREETING',
  };
}

function isTypedOpeningGreeting(understanding: {
  primaryScenario?: string | null;
  primaryIntent?: string | null;
  humanContext?: {
    primaryMotive?: string | null;
    interactionStrategy?: { phase?: string | null } | null;
    dominantTurnGoal?: { key?: string | null } | null;
    requiredTurnGoals?: Array<{ key?: string | null }> | null;
  } | null;
} | null | undefined) {
  if (!understanding) return false;
  const human = understanding.humanContext || {};
  const goals = [human.dominantTurnGoal, ...(human.requiredTurnGoals || [])]
    .map((item) => String(item?.key || '').toUpperCase())
    .filter(Boolean);
  const relationshipOnlyGoal = goals.length > 0
    && goals.every((key) => ['MAINTAIN_RELATIONSHIP', 'INVITE_POSITIVE_SHARING'].includes(key));
  return String(understanding.primaryScenario || '').toUpperCase() === 'CASUAL_CHAT'
    && ['CASUAL', 'RELATIONSHIP_CONTACT'].includes(String(understanding.primaryIntent || '').toUpperCase())
    && String(human.interactionStrategy?.phase || '').toUpperCase() === 'OPENING'
    && String(human.primaryMotive || '').toUpperCase() === 'RELATIONSHIP_CONTACT'
    && relationshipOnlyGoal;
}

function inferReceptionTypeFromStructuredProfile(store: Record<string, unknown>): Exclude<CustomerServiceOpeningReceptionType, 'AUTO'> {
  // AUTO may use only structured profile presence. Specific business-role families
  // (after-sales / consultant / community companion) require the explicit enum; the
  // public identity wording is expression data and must not be re-parsed as policy.
  return cleanText(store.mainBusiness || store.brandIntro, 240)
    ? 'BUSINESS_SERVICE'
    : 'CONTENT_INTERACTION';
}
function isMeaningfulConversationContent(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (/^\[[^\]]{1,32}\]$/.test(normalized)) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim();
}

function cleanText(value: unknown, limit: number) {
  return normalizeText(value).replace(/\s+/g, ' ').slice(0, limit);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  const normalized = String(value || '').trim().toUpperCase() as T;
  return options.includes(normalized) ? normalized : fallback;
}
