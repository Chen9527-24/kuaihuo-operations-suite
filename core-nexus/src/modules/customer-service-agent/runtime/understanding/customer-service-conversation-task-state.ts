import { CompileCustomerServiceSimulationDto } from '../simulation/dto/compile-simulation.dto';
import {
  CustomerServiceConversationTaskState,
  CustomerServicePendingSlot,
  CustomerServicePendingSlotKey,
} from './types/customer-service-message-understanding.type';
import { readCustomerServiceConversationStateV2 } from '../state/customer-service-conversation-state.reducer';

const SERVICE_SCENARIOS = new Set([
  'COMPLAINT_ESCALATION', 'REFUND_REQUEST', 'AFTER_SALE', 'LOGISTICS_DELAY', 'ORDER_STATUS',
  'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE', 'APPOINTMENT',
]);

const SLOT_DEFINITIONS: Array<{
  key: CustomerServicePendingSlotKey;
  name: string;
  valuePattern?: RegExp;
}> = [
  { key: 'ORDER_ID', name: '订单号', valuePattern: /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/ },
  { key: 'TRACKING_NUMBER', name: '物流单号', valuePattern: /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/ },
  { key: 'PHONE', name: '联系电话', valuePattern: /^\+?[0-9][0-9\s-]{6,19}$/ },
  { key: 'ADDRESS', name: '收货地址' },
  { key: 'PRODUCT_MODEL', name: '商品型号或规格' },
  { key: 'ISSUE_EVIDENCE', name: '问题凭证' },
  { key: 'ORIGINAL_APPOINTMENT_TIME', name: '原预约时间' },
  { key: 'APPOINTMENT_ID', name: '预约编号', valuePattern: /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/ },
];

export function isCustomerServiceScenario(scenario: string) {
  return SERVICE_SCENARIOS.has(String(scenario || '').toUpperCase());
}

export function canonicalIntentForScenario(scenario: string, proposedIntent: string) {
  const normalizedScenario = String(scenario || '').toUpperCase();
  const normalizedIntent = String(proposedIntent || '').toUpperCase();
  if (!normalizedIntent) return normalizedScenario === 'ORDER_STATUS' ? 'ASK_INFORMATION' : 'UNKNOWN';
  if (normalizedIntent === 'UNKNOWN') return 'UNKNOWN';
  if (normalizedScenario === 'CASUAL_CHAT' && normalizedIntent === 'EMOTIONAL_SHARING') return 'CASUAL';
  if (normalizedScenario === 'COMPLAINT_ESCALATION') return 'EXPRESS_DISSATISFACTION';
  if (['LOGISTICS_DELAY', 'ORDER_STATUS', 'APPOINTMENT', 'REFUND_REQUEST'].includes(normalizedScenario)) {
    if (['ASK_INFORMATION', 'REQUEST_ACTION', 'REFUSE_SOLUTION', 'EXPRESS_DISSATISFACTION'].includes(normalizedIntent)) return normalizedIntent;
    return normalizedScenario === 'ORDER_STATUS' ? 'ASK_INFORMATION' : 'REQUEST_ACTION';
  }
  if (['AFTER_SALE', 'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE'].includes(normalizedScenario)) {
    if (['ASK_INFORMATION', 'REQUEST_ACTION', 'REFUSE_SOLUTION', 'EXPRESS_DISSATISFACTION', 'PROBLEM_RESOLUTION'].includes(normalizedIntent)) return normalizedIntent;
    return 'PROBLEM_RESOLUTION';
  }
  return normalizedIntent;
}

/**
 * Pre-model/failure-path task projection is deliberately structural and state-only.
 * It may transport a previously persisted task/slot and validate bounded slot value
 * formats, but it never infers topic shift, resolution, refusal, appointment, after-sale,
 * complaint, or any other business lifecycle transition from the customer's wording.
 * A successful Deep Recognition stateTruthSignal owns those open-language mutations.
 */
export function inferConversationTaskState(
  dto: CompileCustomerServiceSimulationDto,
  scenario: string,
  intent: string,
): CustomerServiceConversationTaskState {
  const history = dto.conversationHistory ?? [];
  const latestAssistant = [...history].reverse().find((item) => item.role === 'ASSISTANT')?.content?.trim() || '';
  const current = dto.message.trim();
  const longHorizonState = readCustomerServiceConversationStateV2(dto.conversationState);
  const persistedActiveTask = longHorizonState.tasks.find((item) => item.id === longHorizonState.activeTaskId) || null;
  const activeScenario = String(scenario || persistedActiveTask?.scenario || 'GENERAL_INQUIRY').toUpperCase();
  const activeIntent = canonicalIntentForScenario(activeScenario, intent || persistedActiveTask?.intent || 'ASK_INFORMATION');

  const persistedPendingKeys = (persistedActiveTask?.pendingSlots || [])
    .map((key) => String(key || '').toUpperCase() as CustomerServicePendingSlotKey)
    .filter((key) => SLOT_DEFINITIONS.some((item) => item.key === key));
  const pendingSlots = persistedPendingKeys.map((key) => requestedSlot(key, latestAssistant));
  const providedSlots: CustomerServicePendingSlot[] = [];

  // Only bounded value-format validation is allowed before model semantics. Free-form
  // slot answers are promoted later only when Deep Recognition emits the typed
  // PROCESS_PROVIDED_INFORMATION obligation for the same current turn.
  if (pendingSlots.length) {
    const first = pendingSlots[0];
    const definition = SLOT_DEFINITIONS.find((item) => item.key === first.key);
    const value = definition?.valuePattern ? extractStructuredValue(definition.valuePattern, current) : '';
    if (value) {
      providedSlots.push({ ...first, status: 'PROVIDED', value, confidence: 0.98, evidence: [`STRUCTURED_SLOT_VALUE:${first.key}`] });
      pendingSlots.shift();
    }
  }

  if (!pendingSlots.length && !providedSlots.length) {
    const anticipated = inferAnticipatedSlot(activeScenario, dto);
    if (anticipated) pendingSlots.push(anticipated);
  }

  const currentTurnRelation: CustomerServiceConversationTaskState['currentTurnRelation'] = providedSlots.length
    ? 'ANSWER_TO_ASSISTANT_REQUEST'
    : history.length ? 'CONTINUATION' : 'NEW_REQUEST';
  const highRiskScenario = ['SAFETY_SENSITIVE', 'SECURITY_SENSITIVE'].includes(activeScenario);
  const status: CustomerServiceConversationTaskState['status'] = providedSlots.length
    ? 'READY_TO_ADVANCE'
    : pendingSlots.length ? 'WAITING_FOR_CUSTOMER'
    : persistedActiveTask && ['WAITING_INTERNAL', 'WAITING_CUSTOMER', 'ACTIVE', 'REOPENED'].includes(persistedActiveTask.status)
      ? mapPersistedTaskStatus(persistedActiveTask.status)
      : isCustomerServiceScenario(activeScenario) ? 'IN_PROGRESS' : 'NONE';
  const responsibility: CustomerServiceConversationTaskState['responsibility'] = status === 'WAITING_FOR_CUSTOMER'
    ? 'CUSTOMER'
    : status === 'READY_TO_ADVANCE' || status === 'IN_PROGRESS' ? 'SHARED'
    : status === 'INTERNAL_PROCESSING' ? 'INTERNAL' : 'NONE';

  return {
    currentTurnRelation,
    activeScenario,
    activeIntent,
    status,
    lastAssistantRequest: latestAssistant || null,
    pendingSlots,
    providedSlots,
    unresolvedGoals: persistedActiveTask?.unresolvedGoals ? [...persistedActiveTask.unresolvedGoals] : [],
    suspendedTasks: [],
    internalHandling: {
      required: highRiskScenario,
      status: highRiskScenario ? 'PENDING' : 'NONE',
      scenario: highRiskScenario ? activeScenario : null,
      reason: highRiskScenario ? 'SAFETY_SECURITY_HARD_FLOOR' : null,
      customerVisibleDisclosure: 'HIDDEN',
    },
    requestResponseType: providedSlots.length ? 'PROVIDED' : 'NONE',
    activeTaskId: persistedActiveTask?.id || null,
    longHorizonStatus: persistedActiveTask?.status === 'REOPENED' ? 'REOPENED'
      : persistedActiveTask?.status === 'WAITING_CUSTOMER' ? 'WAITING_CUSTOMER'
      : persistedActiveTask?.status === 'WAITING_INTERNAL' ? 'WAITING_INTERNAL'
      : persistedActiveTask?.status === 'SUSPENDED' ? 'SUSPENDED'
      : persistedActiveTask?.status === 'RESOLVED' ? 'RESOLVED'
      : persistedActiveTask?.status === 'ABANDONED' ? 'ABANDONED' : 'ACTIVE',
    responsibility,
    semanticQuestions: [],
    evidence: uniqueStrings([
      persistedActiveTask ? `STATE_ACTIVE_TASK:${persistedActiveTask.id}` : null,
      pendingSlots.length ? `STATE_PENDING_SLOTS:${pendingSlots.map((item) => item.key).join(',')}` : null,
      providedSlots.length ? `STRUCTURED_PROVIDED_SLOTS:${providedSlots.map((item) => item.key).join(',')}` : null,
      `STRUCTURAL_FALLBACK_RELATION:${currentTurnRelation}`,
    ]),
  };
}

function requestedSlot(key: CustomerServicePendingSlotKey, requestedByAssistant: string | null): CustomerServicePendingSlot {
  const definition = SLOT_DEFINITIONS.find((item) => item.key === key)!;
  return {
    key,
    name: definition.name,
    status: 'REQUESTED',
    value: null,
    confidence: 1,
    requestedByAssistant: requestedByAssistant || null,
    evidence: [`STATE_PENDING_SLOT:${key}`],
  };
}

function inferAnticipatedSlot(
  scenario: string,
  dto: CompileCustomerServiceSimulationDto,
): CustomerServicePendingSlot | null {
  const capabilities = {
    ...asRecord(asRecord(dto.customerState).serviceCapabilities),
    ...asRecord(asRecord(dto.variables).serviceCapabilities),
  };
  if (['LOGISTICS_DELAY', 'ORDER_STATUS'].includes(scenario)) {
    const accountVisible = String(capabilities.accountOrderVisibility || '').toUpperCase() === 'AVAILABLE';
    return accountVisible ? null : requestedSlot('ORDER_ID', null);
  }
  if (scenario === 'APPOINTMENT') return requestedSlot('ORIGINAL_APPOINTMENT_TIME', null);
  return null;
}

function mapPersistedTaskStatus(status: string): CustomerServiceConversationTaskState['status'] {
  if (status === 'WAITING_CUSTOMER') return 'WAITING_FOR_CUSTOMER';
  if (status === 'WAITING_INTERNAL') return 'INTERNAL_PROCESSING';
  if (status === 'RESOLVED' || status === 'ABANDONED') return 'RESOLVED';
  return 'IN_PROGRESS';
}

function extractStructuredValue(pattern: RegExp, message: string) {
  const direct = message.trim();
  pattern.lastIndex = 0;
  if (pattern.test(direct)) return direct;
  const candidates = direct.match(/[A-Za-z0-9][A-Za-z0-9_-]{3,63}/g) || [];
  return candidates.find((candidate) => {
    pattern.lastIndex = 0;
    return pattern.test(candidate);
  }) || '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}
