import type {
  CustomerServiceMessageUnderstanding,
  CustomerServiceRequestedDelta,
} from '../understanding/types/customer-service-message-understanding.type';

export type CustomerServiceSemanticActionFamily =
  | 'WARM_CONTACT'
  | 'EMOTIONAL_ACKNOWLEDGEMENT'
  | 'LISTENING_PRESENCE'
  | 'LOWER_IMMEDIATE_PRESSURE'
  | 'DISTANCE_FROM_TRIGGER'
  | 'BASIC_BODY_CARE'
  | 'CHANGE_IMMEDIATE_ENVIRONMENT'
  | 'WRITE_OR_EXTERNALIZE'
  | 'CONTACT_TRUSTED_PERSON'
  | 'FOCUSED_RELIEF_ACTIVITY'
  | 'DECLUTTER_SMALL_ITEM'
  | 'GATHER_NECESSARY_INFORMATION'
  | 'VERIFY_SERVICE_FACT'
  | 'SUBMIT_SERVICE_ACTION'
  | 'EXPLAIN_BOUNDARY'
  | 'RESPECT_PAUSE'
  | 'REOPEN_ADVICE'
  | 'LIGHT_HUMOR'
  | 'INVITE_SHARED_ACTIVITY';

/**
 * Legacy action-family labels retained for persisted-state/admin compatibility.
 * They are no longer recognized from assistant wording. Open-language semantic
 * history belongs to Canonical/InteractionPlan/Conformance typed evidence.
 */
const PRACTICAL_FAMILIES = new Set<CustomerServiceSemanticActionFamily>([
  'DISTANCE_FROM_TRIGGER', 'BASIC_BODY_CARE', 'CHANGE_IMMEDIATE_ENVIRONMENT',
  'WRITE_OR_EXTERNALIZE', 'CONTACT_TRUSTED_PERSON', 'FOCUSED_RELIEF_ACTIVITY',
  'DECLUTTER_SMALL_ITEM',
]);

const INTERPERSONAL_FAMILIES = new Set<CustomerServiceSemanticActionFamily>([
  'WARM_CONTACT', 'EMOTIONAL_ACKNOWLEDGEMENT', 'LISTENING_PRESENCE',
  'LOWER_IMMEDIATE_PRESSURE', 'LIGHT_HUMOR', 'INVITE_SHARED_ACTIVITY',
]);

export function extractCustomerServiceSemanticActionFamilies(_text: string) {
  // Retained only for legacy/admin compatibility. Phrase families must not create
  // Runtime behavioral memory or planning Authority.
  return [] as CustomerServiceSemanticActionFamily[];
}

export function customerServiceActionFamilyName(family: CustomerServiceSemanticActionFamily) {
  return family;
}

export function isCustomerServicePracticalActionFamily(family: CustomerServiceSemanticActionFamily) {
  return PRACTICAL_FAMILIES.has(family);
}

export function isCustomerServiceInterpersonalActionFamily(family: CustomerServiceSemanticActionFamily) {
  return INTERPERSONAL_FAMILIES.has(family);
}

export function collectRecentCustomerServiceActionFamilies(
  drafts: string[],
  limit = 6,
) {
  return uniqueFamilies(
    drafts
      .filter((item) => typeof item === 'string' && Boolean(item.trim()))
      .slice(-limit)
      .flatMap(extractCustomerServiceSemanticActionFamilies),
  );
}

export function collectRecentCustomerServicePracticalActionFamilies(
  drafts: string[],
  limit = 6,
) {
  return collectRecentCustomerServiceActionFamilies(drafts, limit)
    .filter(isCustomerServicePracticalActionFamily);
}

export function customerServiceRequiresNovelPracticalAction(input: {
  understanding: Pick<CustomerServiceMessageUnderstanding, 'humanContext'>;
  latestMessage?: string;
}) {
  const human = input.understanding.humanContext;
  const goals = human.requiredTurnGoals?.length ? human.requiredTurnGoals : [human.dominantTurnGoal];
  if (!goals.some((item) => item.key === 'PROVIDE_REQUESTED_ADVICE')) return false;
  const deltas = new Set<CustomerServiceRequestedDelta>(human.dialogueObligation.requestedDeltas);
  if (
    ['INSUFFICIENT', 'PARTIALLY_ACCEPTED', 'REJECTED', 'ESCALATED'].includes(
      human.dialogueObligation.userFeedback,
    )
  ) return true;
  if (
    ['DEEPER', 'MORE_SPECIFIC', 'MORE_DETAILED', 'DIFFERENT_APPROACH', 'ANOTHER_OPTION']
      .some((item) => deltas.has(item as CustomerServiceRequestedDelta))
  ) return true;
  return false;
}

export function customerServiceNovelPracticalActionFamilies(
  draft: string,
  previousDrafts: string[],
) {
  const current = extractCustomerServiceSemanticActionFamilies(draft)
    .filter(isCustomerServicePracticalActionFamily);
  const previous = new Set(collectRecentCustomerServicePracticalActionFamilies(previousDrafts));
  return current.filter((item) => !previous.has(item));
}

export function customerServiceRepeatedActionFamilies(
  draft: string,
  previousDrafts: string[],
) {
  const current = extractCustomerServiceSemanticActionFamilies(draft);
  const previous = new Set(collectRecentCustomerServiceActionFamilies(previousDrafts));
  return current.filter((item) => previous.has(item));
}

function uniqueFamilies(values: CustomerServiceSemanticActionFamily[]) {
  return [...new Set(values)];
}
