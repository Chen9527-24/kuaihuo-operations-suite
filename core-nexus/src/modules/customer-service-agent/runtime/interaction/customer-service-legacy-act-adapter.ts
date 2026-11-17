import type { CustomerServiceActType } from './customer-service-interaction-plan.type';

export type CustomerServiceLegacyActSource =
  | 'RESPONSE_ACT'
  | 'ASSISTANT_MOVE'
  | 'MICRO_ACTION';

export type CustomerServiceLegacyActMapping = {
  source: CustomerServiceLegacyActSource;
  legacy: string;
  canonical: CustomerServiceActType | null;
  status: 'MAPPED' | 'NO_CANONICAL_MAPPING';
};

const RESPONSE_ACT_MAP: Record<string, CustomerServiceActType | null> = {
  // H0.2-A: these are legacy surface-realization recipes, not semantic obligations.
  // Keep them observable in migration diagnostics, but do not promote them into
  // Canonical Acts. HumanTurn may naturally realize warmth/acknowledgement from
  // the high-fidelity person + conversation context when the turn actually calls for it.
  DIRECT_WARM_CONTACT: null,
  SPECIFIC_CONTEXT_ACKNOWLEDGEMENT: null,
  OPTIONAL_SMALL_RELIEF: null,
  DIRECT_ANSWER: 'DIRECT_ANSWER',
  // Customer-side practical advice is content guidance, not proof that the service runtime executes an action.
  PRACTICAL_NEXT_STEP: 'PROVIDE_GENERAL_GUIDANCE',
  LISTENING_SPACE: null,
  RESPECT_BOUNDARY: 'STOP',
  LOW_PRESSURE_CONTINUATION: null,
};

const ASSISTANT_MOVE_MAP: Record<string, CustomerServiceActType | null> = {
  ACKNOWLEDGE: 'LIGHT_ACK',
  INVITE_SHARING: 'RELATIONSHIP_MAINTENANCE',
  GENERIC_EMPATHY: 'EMOTIONAL_ACK',
  ANALYZE: null,
  ADVISE: null,
  ASK_QUESTION: 'REQUEST_OPTIONAL_PREFERENCE',
  OFFER_OPTIONS: null,
  EXPLAIN: null,
  BUSINESS_ACTION: 'EXECUTE_SERVICE_STEP',
  UNKNOWN: null,
};

const MICRO_ACTION_MAP: Record<string, CustomerServiceActType | null> = {
  RESPOND_LATEST_MESSAGE: 'DIRECT_ANSWER',
  ACKNOWLEDGE_DOMINANT_SHARING_GOAL: 'LIGHT_ACK',
  INVITE_CUSTOMER_TO_SHARE_NATURALLY: 'RELATIONSHIP_MAINTENANCE',
  RESPOND_TO_SHARED_CONTEXT_FIRST: 'LIGHT_ACK',
  ACKNOWLEDGE_PROVIDED_INFORMATION: 'LIGHT_ACK',
  ADVANCE_PENDING_SERVICE_TASK: 'EXECUTE_SERVICE_STEP',
  ACKNOWLEDGE_INFORMATION_BARRIER: 'LIGHT_ACK',
  REDUCE_CUSTOMER_EFFORT: 'REASSURE',
  OFFER_ONE_REAL_NEXT_STEP: 'EXECUTE_SERVICE_STEP',
  REPAIR_RELATIONSHIP_FIRST: 'REASSURE',
  OPEN_SHARING_SPACE: 'RELATIONSHIP_MAINTENANCE',
  ANSWER_DIRECTLY: 'DIRECT_ANSWER',
  GIVE_GROUNDED_GUIDANCE: 'EXPLAIN_GROUNDED_FACT',
  ACKNOWLEDGE_IMPACT: 'ACKNOWLEDGE_PROBLEM',
  PROVIDE_RESOLUTION_PATH: 'EXECUTE_SERVICE_STEP',
  REDUCE_UNCERTAINTY: 'REASSURE',
  STATE_NEXT_PROGRESS_NODE: 'REPORT_STATUS',
  ACKNOWLEDGE_TRUST_DAMAGE: 'ACKNOWLEDGE_PROBLEM',
  REBUILD_WITH_ACTION: 'EXECUTE_SERVICE_STEP',
  STATE_SAFETY_BOUNDARY: 'EXPLAIN_BOUNDARY',
  CLOSE_WITHOUT_REOPENING_TOPIC: 'NATURAL_CLOSE',
  ACKNOWLEDGE_EMOTION_ACCURATELY: 'EMOTIONAL_ACK',
  EXPLORE_LATENT_NEED_WITHOUT_PRODUCT_PUSH: 'REQUEST_OPTIONAL_PREFERENCE',
  HELP_CUSTOMER_EVALUATE_NEED: 'DIRECT_ANSWER',
  OFFER_LOW_PRESSURE_NEXT_STEP: 'BUSINESS_ADVANCE',
  ASK_ONE_LOW_PRESSURE_LIFE_CONTEXT_QUESTION: 'REQUEST_OPTIONAL_PREFERENCE',
  EXPLORE_ONE_RELEVANT_NEED_DIMENSION: 'REQUEST_OPTIONAL_PREFERENCE',
  BRIDGE_CONTEXT_TO_CATEGORY_VALUE: 'BUSINESS_ADVANCE',
  RECOMMEND_ONLY_MATCHED_PRODUCTS: 'RECOMMEND_GROUNDED_ITEM',
  COMPARE_AGAINST_CUSTOMER_CRITERIA: 'DIRECT_ANSWER',
  REDUCE_TRANSACTION_FRICTION: 'BUSINESS_ADVANCE',
  COVER_REQUIRED_POINTS: 'DIRECT_ANSWER',
  // Legacy micro-actions are diagnostic-only; workflow content never grants execution authority.
  FOLLOW_REQUIRED_WORKFLOW: null,
  STATE_ACTION_BOUNDARY: 'EXPLAIN_BOUNDARY',
  // Internal review is not a customer-visible handoff authorization.
  REQUEST_HUMAN_REVIEW: null,
  CONTINUE_CANONICAL_CONTEXT: 'HISTORY_REFERENCE',
  SOFT_REFERENCE_CANONICAL_CONTEXT: 'HISTORY_REFERENCE',
  REUSE_CONFIRMED_CUSTOMER_STATE: 'HISTORY_REFERENCE',
};

export function mapCustomerServiceLegacyAct(
  source: CustomerServiceLegacyActSource,
  legacyValue: unknown,
): CustomerServiceLegacyActMapping {
  const legacy = String(legacyValue || '').trim();
  const table = source === 'RESPONSE_ACT'
    ? RESPONSE_ACT_MAP
    : source === 'ASSISTANT_MOVE'
      ? ASSISTANT_MOVE_MAP
      : MICRO_ACTION_MAP;
  const canonical = Object.prototype.hasOwnProperty.call(table, legacy) ? table[legacy] : null;
  return {
    source,
    legacy,
    canonical,
    status: canonical ? 'MAPPED' : 'NO_CANONICAL_MAPPING',
  };
}

export function mapCustomerServiceLegacyActs(
  source: CustomerServiceLegacyActSource,
  values: unknown[],
): CustomerServiceLegacyActMapping[] {
  return uniqueStrings(values).map((value) => mapCustomerServiceLegacyAct(source, value));
}

export function collectMappedCustomerServiceActs(mappings: CustomerServiceLegacyActMapping[]) {
  return Array.from(new Set(
    mappings
      .map((item) => item.canonical)
      .filter((item): item is CustomerServiceActType => Boolean(item)),
  ));
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}
