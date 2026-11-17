import type { CompileCustomerServiceSimulationDto } from '../simulation/dto/compile-simulation.dto';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import {
  CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION,
  CustomerServiceAssistantMoveLedgerEntry,
  CustomerServiceCanonicalStateFields,
  CustomerServiceConversationMemory,
  CustomerServiceConversationStateSummary,
  CustomerServiceConversationStateValue,
  CustomerServiceConversationStateV2,
  CustomerServiceLongHorizonTask,
  CustomerServiceLongHorizonTaskStatus,
  CustomerServiceMemoryKind,
} from './customer-service-conversation-state.type';
import {
  buildCustomerServiceAssistantBehaviorObservation,
  buildCustomerServiceBehaviorHistoryProjection,
  buildCustomerServiceReplyStructureKey,
  normalizeCustomerServiceAssistantBehaviorObservation,
} from '../behavior/customer-service-behavior-memory.util';

const MAX_TASKS = 20;
const MAX_MEMORIES = 80;
const MAX_ENTITIES = 40;
const MAX_MOVE_LEDGER = 20;
const MAX_EVIDENCE_LENGTH = 240;

export function customerServiceLongHorizonStateEnabled() {
  return String(process.env.CUSTOMER_SERVICE_LONG_HORIZON_STATE_V2 ?? 'true').toLowerCase() !== 'false';
}

export function emptyCustomerServiceConversationStateV2(): CustomerServiceConversationStateV2 {
  return {
    schemaVersion: CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION,
    revision: 0,
    currentTurn: 0,
    activeTaskId: null,
    tasks: [],
    memories: [],
    entities: [],
    assistantMoveLedger: [],
    relationshipDynamics: emptyRelationshipDynamics(),
    latestFeedback: null,
    closedSemanticQuestions: [],
    invalidatedMemoryIds: [],
    selectedMemoryIds: [],
    canonicalFields: emptyCanonicalFields(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function readCustomerServiceConversationStateV2(value: unknown): CustomerServiceConversationStateV2 {
  const record = asRecord(value);
  if (Number(record.schemaVersion) !== CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION) {
    return emptyCustomerServiceConversationStateV2();
  }
  return {
    ...emptyCustomerServiceConversationStateV2(),
    ...record,
    schemaVersion: CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION,
    revision: finiteInt(record.revision),
    currentTurn: finiteInt(record.currentTurn),
    activeTaskId: stringOrNull(record.activeTaskId),
    tasks: arrayOfRecords(record.tasks).slice(-MAX_TASKS).map((item) => ({
      ...item,
      evidenceMessageIds: stringArray(item.evidenceMessageIds),
      anchors: stringArray(item.anchors).slice(-8),
    })) as CustomerServiceLongHorizonTask[],
    memories: arrayOfRecords(record.memories).slice(-MAX_MEMORIES).map((item) => ({
      ...item,
      evidenceMessageIds: stringArray(item.evidenceMessageIds),
    })) as CustomerServiceConversationMemory[],
    entities: arrayOfRecords(record.entities).slice(-MAX_ENTITIES).map((item) => ({
      ...item,
      semanticKey: stringOrNull(item.semanticKey),
      aliases: stringArray(item.aliases),
      sourceTurns: Array.isArray(item.sourceTurns) ? item.sourceTurns.map(finiteInt).filter((value: number) => value > 0) : [],
    })) as CustomerServiceConversationStateV2['entities'],
    assistantMoveLedger: readMoveLedger(record.assistantMoveLedger),
    relationshipDynamics: readRelationshipDynamics(record.relationshipDynamics),
    latestFeedback: asRecord(record.latestFeedback).userFeedback
      ? record.latestFeedback as CustomerServiceConversationStateV2['latestFeedback']
      : null,
    closedSemanticQuestions: stringArray(record.closedSemanticQuestions).slice(-30),
    invalidatedMemoryIds: stringArray(record.invalidatedMemoryIds).slice(-MAX_MEMORIES),
    selectedMemoryIds: stringArray(record.selectedMemoryIds).slice(-20),
    canonicalFields: readCanonicalFields(record.canonicalFields),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
  };
}

export function reduceCustomerServiceConversationState(input: {
  previous: unknown;
  dto: CompileCustomerServiceSimulationDto;
  understanding: CustomerServiceMessageUnderstanding;
  assistantDraft?: string | null;
  evidenceMessageIds?: string[];
  assistantBehavior?: {
    replyAttemptId?: string | null;
    replyTraceId?: string | null;
    behaviorPlan?: unknown;
    interactionPlanV2?: unknown;
    planFulfillment?: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
    realizedGroundingRefs?: string[];
    provenGroundedUnits?: Array<{ text: string; groundingRefs: string[] }>;
  };
}): CustomerServiceConversationStateV2 {
  const previous = readCustomerServiceConversationStateV2(input.previous);
  if (!customerServiceLongHorizonStateEnabled()) return previous;

  const turn = Math.max(
    previous.currentTurn + 1,
    (input.dto.conversationHistory ?? []).filter((item) => item.role === 'CUSTOMER').length + 1,
  );
  const latest = input.dto.message.trim();
  const taskState = input.understanding.humanContext.conversationTaskState;
  const feedback = input.understanding.humanContext.dialogueObligation;
  const evidenceMessageIds = uniqueStrings(input.evidenceMessageIds ?? []).slice(-12);
  const tasks = updateTasks(previous, input.understanding, latest, turn, evidenceMessageIds);
  const activeTaskId = tasks
    .filter((item) => ['ACTIVE', 'REOPENED', 'WAITING_CUSTOMER', 'WAITING_INTERNAL'].includes(item.status))
    .sort((a, b) => b.lastActiveTurn - a.lastActiveTurn || b.createdTurn - a.createdTurn)[0]?.id ?? null;
  const memories = updateMemories(previous.memories, latest, input.understanding, tasks, turn, evidenceMessageIds);
  const selectedMemories = selectRelevantCustomerServiceMemories(memories, latest, tasks, turn);
  const entities = updateEntities(previous.entities, latest, input.understanding, turn);
  const assistantMoveLedger = updateMoveLedger(
    previous.assistantMoveLedger,
    input.assistantDraft,
    feedback,
    turn,
    evidenceMessageIds,
    activeTaskId,
    input.assistantBehavior,
  );
  const relationshipDynamics = updateRelationshipDynamics({
    previous: previous.relationshipDynamics,
    message: latest,
    understanding: input.understanding,
    assistantMoveLedger,
  });
  const canonicalFields = updateCanonicalFields({
    previous: previous.canonicalFields,
    understanding: input.understanding,
    tasks,
    memories,
    turn,
    evidenceMessageIds,
  });
  const closedSemanticQuestions = uniqueStrings([
    ...previous.closedSemanticQuestions,
    ...taskState.semanticQuestions
      .filter((item) => item.status === 'ANSWERED' || item.status.startsWith('CLOSED_'))
      .map((item) => item.key),
  ]).slice(-30);

  return {
    schemaVersion: CUSTOMER_SERVICE_CONVERSATION_STATE_SCHEMA_VERSION,
    revision: previous.revision + 1,
    currentTurn: turn,
    activeTaskId,
    tasks: tasks.slice(-MAX_TASKS),
    memories: memories.slice(-MAX_MEMORIES),
    entities,
    assistantMoveLedger,
    relationshipDynamics,
    latestFeedback: feedback,
    closedSemanticQuestions,
    invalidatedMemoryIds: memories.filter((item) => item.invalidated || item.withdrawn).map((item) => item.id).slice(-MAX_MEMORIES),
    selectedMemoryIds: selectedMemories.map((item) => item.id),
    canonicalFields,
    updatedAt: new Date().toISOString(),
  };
}

// Reconcile the same already-counted customer event. This owns feedback only;
// task/entity/memory projection and turn/revision advancement remain unchanged.
export function reconcileCustomerServiceCurrentFeedback(
  previousValue: unknown,
  feedback: CustomerServiceMessageUnderstanding['humanContext']['dialogueObligation'],
): CustomerServiceConversationStateV2 {
  const previous = readCustomerServiceConversationStateV2(previousValue);
  if (!customerServiceLongHorizonStateEnabled()) return previous;
  const ledger = previous.assistantMoveLedger.map((entry) => ({ ...entry }));
  const prior = ledger.at(-1);
  if (prior) {
    prior.accepted = feedback.userFeedback === 'ACCEPTED' ? true
      : ['REJECTED', 'CORRECTED', 'ESCALATED', 'WITHDRAWN'].includes(feedback.userFeedback) ? false : null;
    prior.rejected = ['REJECTED', 'CORRECTED', 'ESCALATED'].includes(feedback.userFeedback);
    prior.requestedDeltas = [...feedback.requestedDeltas];
  }
  return { ...previous, latestFeedback: feedback, assistantMoveLedger: ledger };
}

export function reduceCustomerServiceObservedAssistantAction(input: {
  previous: unknown;
  assistantText: string;
  evidenceMessageIds?: string[];
  replyAttemptId?: string | null;
  replyTraceId?: string | null;
  behaviorPlan?: unknown;
  interactionPlanV2?: unknown;
  planFulfillment?: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
  realizedGroundingRefs?: string[];
  provenGroundedUnits?: Array<{ text: string; groundingRefs: string[] }>;
}): CustomerServiceConversationStateV2 {
  const previous = readCustomerServiceConversationStateV2(input.previous);
  if (!customerServiceLongHorizonStateEnabled()) return previous;
  const text = String(input.assistantText || '').trim();
  if (!text) return previous;

  const evidenceMessageIds = uniqueStrings(input.evidenceMessageIds ?? []).slice(-20);
  const behavior = buildCustomerServiceAssistantBehaviorObservation({
    text,
    evidenceMessageIds,
    replyAttemptId: input.replyAttemptId,
    replyTraceId: input.replyTraceId,
    behaviorPlan: input.behaviorPlan,
    interactionPlanV2: input.interactionPlanV2,
    planFulfillment: input.planFulfillment,
    taskId: previous.activeTaskId,
    realizedGroundingRefs: input.realizedGroundingRefs,
    provenGroundedUnits: input.provenGroundedUnits,
  });
  const ledger = readMoveLedger(previous.assistantMoveLedger);
  const existingIndex = findObservedAssistantActionIndex(ledger, behavior.logicalActionKey, evidenceMessageIds);
  if (existingIndex >= 0) {
    const existing = ledger[existingIndex];
    const existingEvidence = new Set(existing.behavior?.evidenceMessageIds || []);
    if (evidenceMessageIds.length && evidenceMessageIds.every((id) => existingEvidence.has(id))) {
      return previous;
    }
    const combinedText = [existing.excerpt, text].map((item) => String(item || '').trim()).filter(Boolean).join('\n');
    const combinedEvidenceMessageIds = uniqueStrings([
      ...(existing.behavior?.evidenceMessageIds || []),
      ...evidenceMessageIds,
    ]).slice(-20);
    const mergedBehaviorBase = buildCustomerServiceAssistantBehaviorObservation({
      text: combinedText,
      evidenceMessageIds: combinedEvidenceMessageIds,
      replyAttemptId: input.replyAttemptId || existing.behavior?.replyAttemptId,
      replyTraceId: input.replyTraceId || existing.behavior?.replyTraceId,
      behaviorPlan: input.behaviorPlan || existing.behavior?.plan,
      interactionPlanV2: input.interactionPlanV2 || existing.behavior?.interactionPlanV2,
      planFulfillment: input.planFulfillment === 'NOT_FULFILLED' || existing.behavior?.planFulfillment === 'NOT_FULFILLED'
        ? 'NOT_FULFILLED'
        : input.planFulfillment || existing.behavior?.planFulfillment || 'UNKNOWN',
      taskId: existing.behavior?.taskId || previous.activeTaskId,
      provenGroundedUnits: input.provenGroundedUnits?.length ? input.provenGroundedUnits : existing.behavior?.provenGroundedUnits,
      realizedGroundingRefs: uniqueStrings([
        ...(existing.behavior?.realizedGroundingRefs || []),
        ...(input.realizedGroundingRefs || []),
      ]).slice(0, 32),
    });
    const mergedObservedActs = uniqueStrings([
      ...(existing.behavior?.observedActs || []),
      ...behavior.observedActs,
      ...mergedBehaviorBase.observedActs,
    ]);
    const mergedBehavior = {
      ...mergedBehaviorBase,
      provenGroundedUnits: [...(existing.behavior?.provenGroundedUnits || []), ...(mergedBehaviorBase.provenGroundedUnits || []), ...(behavior.provenGroundedUnits || [])]
        .filter((unit, index, units) => units.findIndex((item) => item.text === unit.text && item.groundingRefs.join('|') === unit.groundingRefs.join('|')) === index).slice(-24),
      realizedGroundingRefs: uniqueStrings([...(existing.behavior?.realizedGroundingRefs || []), ...(mergedBehaviorBase.realizedGroundingRefs || []), ...(behavior.realizedGroundingRefs || [])]).slice(0, 32),
      observedActs: mergedObservedActs,
      questionCount: Math.min(8, Math.max(0, Number(existing.behavior?.questionCount || 0)) + behavior.questionCount),
      questionEnding: behavior.questionEnding,
      structureKey: buildCustomerServiceReplyStructureKey(
        combinedText,
        mergedBehaviorBase.plan,
        mergedObservedActs,
        behavior.questionEnding,
      ),
    };
    const actionFamilies = [...existing.actionFamilies] as CustomerServiceAssistantMoveLedgerEntry['actionFamilies'];
    ledger[existingIndex] = {
      ...existing,
      move: projectAssistantMoveFromBehavior(mergedBehavior),
      actionFamilies,
      practicalActionFamilies: [...existing.practicalActionFamilies],
      interpersonalActionFamilies: [...existing.interpersonalActionFamilies],
      strategyKey: mergedBehavior.structureKey || existing.strategyKey || '',
      openingKey: existing.openingKey || normalizeEdge(combinedText.slice(0, 28)),
      endingKey: normalizeEdge(combinedText.slice(-28)),
      excerpt: truncate(combinedText, 160),
      behavior: mergedBehavior,
    };
  } else {
    const actionFamilies: CustomerServiceAssistantMoveLedgerEntry['actionFamilies'] = [];
    ledger.push({
      turn: Math.max(0, previous.currentTurn),
      move: projectAssistantMoveFromBehavior(behavior),
      actionFamilies,
      practicalActionFamilies: [],
      interpersonalActionFamilies: [],
      strategyKey: behavior?.structureKey || '',
      openingKey: normalizeEdge(text.slice(0, 28)),
      endingKey: normalizeEdge(text.slice(-28)),
      accepted: null,
      rejected: false,
      requestedDeltas: [],
      excerpt: truncate(text, 160),
      behavior,
    } satisfies CustomerServiceAssistantMoveLedgerEntry);
  }

  const assistantMoveLedger = ledger.slice(-MAX_MOVE_LEDGER);
  const now = new Date().toISOString();
  const previousDynamics = readRelationshipDynamics(previous.relationshipDynamics);
  const canonicalFields = readCanonicalFields(previous.canonicalFields);
  const previousActions = Array.isArray(canonicalFields.assistantActions.value)
    ? canonicalFields.assistantActions.value
    : [];
  const assistantActions = uniqueStrings([...previousActions, truncate(text, 180)]).slice(-20);

  return {
    ...previous,
    revision: previous.revision + 1,
    assistantMoveLedger,
    relationshipDynamics: {
      ...previousDynamics,
      recentInterpersonalActions: uniqueStrings(
        assistantMoveLedger.flatMap((item) => item.interpersonalActionFamilies),
      ).slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentInterpersonalActions'],
      recentPracticalActions: uniqueStrings(
        assistantMoveLedger.flatMap((item) => item.practicalActionFamilies),
      ).slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentPracticalActions'],
    },
    canonicalFields: {
      ...canonicalFields,
      assistantActions: {
        value: assistantActions,
        status: 'EXPLICIT',
        confidence: 1,
        evidenceMessageIds: uniqueStrings([
          ...canonicalFields.assistantActions.evidenceMessageIds,
          ...evidenceMessageIds,
        ]).slice(-20),
        reason: '来自平台已观测到的账号侧实际消息；生成草稿本身不会进入该字段。',
        updatedAt: now,
      },
    },
    updatedAt: now,
  };
}

function findObservedAssistantActionIndex(
  ledger: CustomerServiceAssistantMoveLedgerEntry[],
  logicalActionKey: string,
  evidenceMessageIds: string[],
) {
  if (logicalActionKey) {
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
      if (ledger[index].behavior?.logicalActionKey === logicalActionKey) return index;
    }
  }
  if (evidenceMessageIds.length) {
    const evidence = new Set(evidenceMessageIds);
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
      if ((ledger[index].behavior?.evidenceMessageIds || []).some((id) => evidence.has(id))) return index;
    }
  }
  return -1;
}

export function summarizeCustomerServiceConversationState(
  value: unknown,
  latestMessage = '',
): CustomerServiceConversationStateSummary {
  const state = readCustomerServiceConversationStateV2(value);
  const activeTask = state.tasks.find((item) => item.id === state.activeTaskId) ?? null;
  const relevantMemories = selectRelevantCustomerServiceMemories(
    state.memories,
    latestMessage,
    state.tasks,
    state.currentTurn,
  );
  return {
    schemaVersion: 2,
    revision: state.revision,
    currentTurn: state.currentTurn,
    activeTask,
    suspendedTasks: state.tasks.filter((item) => item.status === 'SUSPENDED').slice(-6),
    relevantMemories,
    recentAssistantMoves: selectRelevantCustomerServiceAssistantMoves(
      state.assistantMoveLedger,
      latestMessage,
      state.tasks,
      6,
    ),
    behaviorHistory: buildCustomerServiceBehaviorHistoryProjection(state.assistantMoveLedger),
    relationshipDynamics: state.relationshipDynamics,
    latestFeedback: state.latestFeedback,
    closedSemanticQuestions: state.closedSemanticQuestions.slice(-20),
    canonicalFields: state.canonicalFields,
  };
}

// Budget-only projection for Active Context allocation. The persisted ConversationStateV2
// remains the single State Authority; this projection must never replace, mutate, or become
// a second memory/state store. It only estimates the bounded state actually relevant to
// understanding/generation so internal planner/diagnostic payload does not evict recent raw history.
export function projectCustomerServiceActiveContextBudgetState(
  value: unknown,
  latestMessage = '',
): Record<string, unknown> {
  const summary = summarizeCustomerServiceConversationState(value, latestMessage);
  const compactTask = (task: CustomerServiceLongHorizonTask) => ({
    id: task.id,
    scenario: task.scenario,
    intent: task.intent,
    goal: truncate(task.goal, 180),
    status: task.status,
    responsibility: task.responsibility,
    pendingSlots: (task.pendingSlots || []).slice(-6),
    providedSlots: (task.providedSlots || []).slice(-6),
    unresolvedGoals: (task.unresolvedGoals || []).map((item) => truncate(item, 160)).slice(-6),
    anchors: (task.anchors || []).map((item) => truncate(item, 120)).slice(-4),
    createdTurn: task.createdTurn,
    lastActiveTurn: task.lastActiveTurn,
  });
  return {
    schemaVersion: summary.schemaVersion,
    revision: summary.revision,
    currentTurn: summary.currentTurn,
    activeTask: summary.activeTask ? compactTask(summary.activeTask) : null,
    suspendedTasks: summary.suspendedTasks.slice(-3).map(compactTask),
    relevantMemories: summary.relevantMemories.slice(-8).map((item) => ({
      id: item.id,
      kind: item.kind,
      key: truncate(item.key, 120),
      value: truncate(item.value, 240),
      sourceTurn: item.sourceTurn,
      confidence: Math.max(0, Math.min(1, Number(item.confidence || 0))),
    })),
    continuity: {
      lastAssistantMoveAccepted: summary.behaviorHistory.lastAssistantMoveAccepted ?? null,
      lastAssistantMoveRejected: summary.behaviorHistory.lastAssistantMoveRejected === true,
      recentRequestedDeltas: (summary.behaviorHistory.recentRequestedDeltas || []).slice(-6),
    },
    recentAssistantMoves: summary.recentAssistantMoves.slice(-6).map((item) => ({
      turn: Math.max(0, Number(item.turn || 0)),
      excerpt: truncate(item.excerpt, 180),
      accepted: item.accepted ?? null,
      rejected: item.rejected === true,
      requestedDeltas: (item.requestedDeltas || []).slice(-4),
    })),
    latestFeedback: summary.latestFeedback ? {
      userFeedback: summary.latestFeedback.userFeedback,
      feedbackHandlingMode: summary.latestFeedback.feedbackHandlingMode,
      strategyChangeRequired: summary.latestFeedback.strategyChangeRequired === true,
      correctionTarget: summary.latestFeedback.correctionTarget || null,
      requestedDeltas: (summary.latestFeedback.requestedDeltas || []).slice(-6),
    } : null,
  };
}


/**
 * B cross-turn continuity projection over the existing AssistantMoveLedger.
 *
 * Keep a bounded recent tail, but allow an older platform-observed assistant turn to
 * displace a less relevant recent turn when the current customer message / active task
 * semantically reconnects to it. This is relevance selection only: it creates no new
 * memory/state, makes no role/domain decision, and never changes current-turn Acts.
 */
export function selectRelevantCustomerServiceAssistantMoves(
  ledger: CustomerServiceAssistantMoveLedgerEntry[],
  latestMessage: string,
  tasks: CustomerServiceLongHorizonTask[],
  limit = 6,
) {
  const boundedLimit = Math.max(1, Math.min(10, finiteInt(limit) || 6));
  const source = readMoveLedger(ledger);
  if (source.length <= boundedLimit) return source;

  const recentKeepCount = Math.min(4, boundedLimit, source.length);
  const recent = source.slice(-recentKeepCount);
  const older = source.slice(0, -recentKeepCount);
  const taskTerms = tasks
    .filter((item) => ['ACTIVE', 'REOPENED', 'WAITING_CUSTOMER', 'WAITING_INTERNAL'].includes(item.status))
    .flatMap((item) => [
      item.scenario,
      item.intent,
      item.goal,
      ...item.pendingSlots,
      ...item.providedSlots,
      ...item.unresolvedGoals,
      ...(item.anchors || []),
    ]);
  const queryTerms = tokenize([latestMessage, ...taskTerms].join(' '));
  const scoredOlder = older
    .map((item, index) => {
      const moveTerms = tokenize(item.excerpt);
      const overlap = [...moveTerms].filter((term) => queryTerms.has(term)).length;
      return { item, index, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || b.item.turn - a.item.turn || b.index - a.index);

  const remaining = boundedLimit - recent.length;
  const selectedOlder: CustomerServiceAssistantMoveLedgerEntry[] = [];
  const selectedKeys = new Set<string>();
  for (const candidate of scoredOlder) {
    if (selectedOlder.length >= remaining) break;
    if (candidate.overlap <= 0) continue;
    const key = `${candidate.item.turn}\u0000${candidate.item.excerpt}`;
    if (selectedKeys.has(key)) continue;
    selectedKeys.add(key);
    selectedOlder.push(candidate.item);
  }
  if (selectedOlder.length < remaining) {
    for (let index = older.length - 1; index >= 0 && selectedOlder.length < remaining; index -= 1) {
      const item = older[index];
      const key = `${item.turn}\u0000${item.excerpt}`;
      if (selectedKeys.has(key)) continue;
      selectedKeys.add(key);
      selectedOlder.push(item);
    }
  }

  return [...selectedOlder, ...recent]
    .sort((a, b) => a.turn - b.turn)
    .slice(-boundedLimit);
}

export function selectRelevantCustomerServiceMemories(
  memories: CustomerServiceConversationMemory[],
  latestMessage: string,
  tasks: CustomerServiceLongHorizonTask[],
  currentTurn: number,
) {
  const activeTaskTerms = tasks
    .filter((item) => ['ACTIVE', 'REOPENED', 'WAITING_CUSTOMER', 'WAITING_INTERNAL'].includes(item.status))
    .flatMap((item) => [
      item.scenario,
      item.intent,
      item.goal,
      ...item.unresolvedGoals,
      ...(item.anchors || []),
    ]);
  const terms = tokenize([latestMessage, ...activeTaskTerms].join(' '));
  const activeTaskIds = new Set(tasks
    .filter((item) => ['ACTIVE', 'REOPENED', 'WAITING_CUSTOMER', 'WAITING_INTERNAL'].includes(item.status))
    .map((item) => item.id));
  return memories
    // Memory is prior-turn lived context. The current customer message is already
    // present as the authoritative latest turn and must not be projected back into
    // the same generation as if it were remembered history. Persist current-turn
    // facts/decisions for future turns, but only expose memories from earlier turns.
    .filter((item) => !item.invalidated && !item.withdrawn && item.sourceTurn < currentTurn)
    .map((item) => {
      const memoryTerms = tokenize(`${item.key} ${item.value} ${item.evidence}`);
      const overlap = [...memoryTerms].filter((term) => terms.has(term)).length;
      const scopedConstraintTaskId = item.kind === 'CUSTOMER_CONSTRAINT'
        ? readConstraintTaskId(item.key)
        : null;
      const activeConstraint = Boolean(scopedConstraintTaskId && activeTaskIds.has(scopedConstraintTaskId));
      const recency = Math.max(0, 4 - Math.floor((currentTurn - item.sourceTurn) / 3));
      // R1: durability is retention metadata, never a relevance grant. A memory
      // must overlap the latest turn or the active task lineage before it can be
      // projected back into Understanding/HumanTurn. Recency only orders matches.
      return { item, overlap, scopedConstraintTaskId, activeConstraint, score: (activeConstraint ? 24 : overlap * 6) + recency + item.confidence };
    })
    .filter(({ overlap, scopedConstraintTaskId, activeConstraint }) => scopedConstraintTaskId ? activeConstraint : overlap > 0)
    .sort((a, b) => b.score - a.score || b.item.sourceTurn - a.item.sourceTurn)
    .slice(0, 12)
    .map(({ item }) => item);
}

function readConstraintTaskId(key: string) {
  const match = String(key || '').match(/^constraint\.([^.]*)\./);
  return match?.[1] || null;
}

function emptyCanonicalFields(): CustomerServiceCanonicalStateFields {
  return {
    relationship: unknownStateValue('关系证据不足，保持 UNKNOWN。'),
    activeTopic: unknownStateValue('尚无足够证据确认当前主题。'),
    currentIntent: unknownStateValue('尚无足够证据确认当前意图。'),
    customerGoal: unknownStateValue('尚无足够证据确认客户目标。'),
    customerActions: unknownStateValue('尚无明确客户动作证据。'),
    explicitFacts: unknownStateValue('尚无客户明确事实证据。'),
    preferences: unknownStateValue('尚无客户明确偏好证据。'),
    assistantActions: unknownStateValue('尚无已确认发送成功的账号动作证据。'),
    pendingItems: unknownStateValue('尚无待处理事项证据。'),
    resolvedItems: unknownStateValue('尚无已完成事项证据。'),
    transientState: unknownStateValue('尚无需要持久化的瞬时状态证据。'),
  };
}

function unknownStateValue<T>(reason: string): CustomerServiceConversationStateValue<T> {
  return {
    value: null,
    status: 'UNKNOWN',
    confidence: 0,
    evidenceMessageIds: [],
    reason,
    updatedAt: null,
  };
}

function readCanonicalFields(value: unknown): CustomerServiceCanonicalStateFields {
  const source = asRecord(value);
  const fallback = emptyCanonicalFields();
  return {
    relationship: readStateValue(source.relationship, fallback.relationship),
    activeTopic: readStateValue(source.activeTopic, fallback.activeTopic),
    currentIntent: readStateValue(source.currentIntent, fallback.currentIntent),
    customerGoal: readStateValue(source.customerGoal, fallback.customerGoal),
    customerActions: readStateValue(source.customerActions, fallback.customerActions),
    explicitFacts: readStateValue(source.explicitFacts, fallback.explicitFacts),
    preferences: readStateValue(source.preferences, fallback.preferences),
    assistantActions: readStateValue(source.assistantActions, fallback.assistantActions),
    pendingItems: readStateValue(source.pendingItems, fallback.pendingItems),
    resolvedItems: readStateValue(source.resolvedItems, fallback.resolvedItems),
    transientState: readStateValue(source.transientState, fallback.transientState),
  };
}

function readStateValue<T>(
  value: unknown,
  fallback: CustomerServiceConversationStateValue<T>,
): CustomerServiceConversationStateValue<T> {
  const record = asRecord(value);
  const status = enumValue(
    record.status,
    ['EXPLICIT', 'INFERRED', 'UNKNOWN', 'CONFLICTED', 'STALE'] as const,
    fallback.status,
  );
  return {
    value: Object.prototype.hasOwnProperty.call(record, 'value') ? record.value as T | null : fallback.value,
    status,
    confidence: Math.max(0, Math.min(1, Number(record.confidence || 0))),
    evidenceMessageIds: stringArray(record.evidenceMessageIds).slice(-20),
    reason: typeof record.reason === 'string' ? truncate(record.reason, 320) : fallback.reason,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : fallback.updatedAt,
  };
}

function updateCanonicalFields(input: {
  previous: CustomerServiceCanonicalStateFields;
  understanding: CustomerServiceMessageUnderstanding;
  tasks: CustomerServiceLongHorizonTask[];
  memories: CustomerServiceConversationMemory[];
  turn: number;
  evidenceMessageIds: string[];
}): CustomerServiceCanonicalStateFields {
  const previous = readCanonicalFields(input.previous);
  const evidenceMessageIds = input.evidenceMessageIds.slice(-12);
  const now = new Date().toISOString();
  const confidence = Math.max(0, Math.min(1, Number(input.understanding.confidence || 0)));
  const currentTask = [...input.tasks].reverse().find((item) => item.lastActiveTurn === input.turn) ?? null;
  const currentMemories = input.memories.filter((item) => item.sourceTurn === input.turn && !item.invalidated && !item.withdrawn);
  const activeMemories = input.memories.filter((item) => !item.invalidated && !item.withdrawn);
  const explicitFacts = uniqueKeyValuePairs(activeMemories
    .filter((item) => ['CUSTOMER_FACT', 'CUSTOMER_CONSTRAINT'].includes(item.kind))
    .map((item) => ({ key: item.key, value: item.value })));
  const preferences = uniqueKeyValuePairs(activeMemories
    .filter((item) => item.kind === 'CUSTOMER_PREFERENCE')
    .map((item) => ({ key: item.key, value: item.value })));
  const stateTruthTargetId = input.understanding.humanContext.stateTruthSignal.memory.targetMemoryId;
  const mutatedMemory = stateTruthTargetId ? input.memories.find((item) => item.id === stateTruthTargetId) ?? null : null;
  const currentIds = new Set(currentMemories.map((item) => item.id));
  const supersededThisTurn = input.memories.filter((item) => item.supersededBy && currentIds.has(item.supersededBy));
  const factTruthChanged = Boolean(
    mutatedMemory && ['CUSTOMER_FACT', 'CUSTOMER_CONSTRAINT'].includes(mutatedMemory.kind)
    || supersededThisTurn.some((item) => ['CUSTOMER_FACT', 'CUSTOMER_CONSTRAINT'].includes(item.kind)),
  );
  const preferenceTruthChanged = Boolean(
    mutatedMemory?.kind === 'CUSTOMER_PREFERENCE'
    || supersededThisTurn.some((item) => item.kind === 'CUSTOMER_PREFERENCE'),
  );
  const customerActions = currentMemories
    .filter((item) => ['DECISION', 'COMMITMENT', 'WITHDRAWAL', 'CORRECTION'].includes(item.kind))
    .map((item) => item.value);
  const pendingItems = currentTask
    ? uniqueStrings([...currentTask.pendingSlots, ...currentTask.unresolvedGoals])
    : [];
  const resolvedItems = input.tasks
    .filter((item) => item.resolvedTurn === input.turn || item.status === 'RESOLVED' && item.lastActiveTurn === input.turn)
    .map((item) => item.goal)
    .filter(Boolean);
  const scenario = String(input.understanding.primaryScenario || '').trim();
  const intent = String(input.understanding.primaryIntent || '').trim();
  const goal = String(input.understanding.humanContext.dominantTurnGoal?.key || '').trim();
  const feedback = input.understanding.humanContext.dialogueObligation?.userFeedback;
  const transientEntries = Object.entries({
    emotion: input.understanding.emotion && input.understanding.emotion !== 'NEUTRAL' ? input.understanding.emotion : '',
    feedback: feedback && feedback !== 'UNCLEAR' ? feedback : '',
  }).filter(([, value]) => Boolean(value));
  const inferred = <T>(value: T, reason: string, floor = 0.6) => ({
    value,
    status: 'INFERRED' as const,
    confidence: Math.max(floor, confidence),
    evidenceMessageIds,
    reason,
    updatedAt: now,
  });
  const explicit = <T>(value: T, reason: string) => ({
    value,
    status: 'EXPLICIT' as const,
    confidence: 0.95,
    evidenceMessageIds,
    reason,
    updatedAt: now,
  });

  return {
    // Business relationship must not be guessed from a greeting or generic chat style.
    relationship: previous.relationship,
    activeTopic: scenario && confidence >= 0.65
      ? inferred(scenario, '由本轮场景识别得到；属于可回溯推断，不视为客户明示。')
      : previous.activeTopic,
    currentIntent: intent && confidence >= 0.65
      ? inferred(intent, '由本轮意图识别得到；信息不足时不会提升为 EXPLICIT。')
      : previous.currentIntent,
    customerGoal: goal && confidence >= 0.65
      ? inferred(goal, '由本轮对话目标识别得到。')
      : previous.customerGoal,
    customerActions: customerActions.length
      ? inferred(customerActions, '由客户本轮决定、承诺、更正或撤回信号归纳；动作级状态保持可回溯推断。', 0.75)
      : previous.customerActions,
    explicitFacts: explicitFacts.length
      ? explicit(explicitFacts, '由当前未失效的客户明确事实记忆汇总；更正或撤回后不继续保留旧值。')
      : factTruthChanged
        ? unknownStateValue('相关客户事实已被更正或撤回，当前没有可继续保留的明确事实值。')
        : previous.explicitFacts,
    preferences: preferences.length
      ? explicit(preferences, '由当前未失效的客户偏好记忆汇总；durable 只表示保留，不代表当前相关。')
      : preferenceTruthChanged
        ? unknownStateValue('相关客户偏好已被更正或撤回，当前没有可继续保留的明确偏好值。')
        : previous.preferences,
    // Assistant actions only become authoritative after the platform send is observed/verified.
    assistantActions: previous.assistantActions,
    pendingItems: pendingItems.length
      ? inferred(pendingItems, '由当前任务待补信息和未完成目标归纳。')
      : previous.pendingItems,
    resolvedItems: resolvedItems.length
      ? inferred(resolvedItems, '由本轮任务状态明确进入 RESOLVED 得到。')
      : previous.resolvedItems,
    transientState: transientEntries.length
      ? inferred(Object.fromEntries(transientEntries), '由本轮情绪/反馈信号归纳，仅作为瞬时状态。', 0.55)
      : previous.transientState,
  };
}

function updateTasks(
  previous: CustomerServiceConversationStateV2,
  understanding: CustomerServiceMessageUnderstanding,
  latestMessage: string,
  turn: number,
  evidenceMessageIds: string[],
) {
  const current = understanding.humanContext.conversationTaskState;
  const tasks = previous.tasks.map((item) => ({
    ...item,
    pendingSlots: [...item.pendingSlots],
    providedSlots: [...item.providedSlots],
    unresolvedGoals: [...item.unresolvedGoals],
    completedSteps: [...item.completedSteps],
    evidence: [...item.evidence],
    evidenceMessageIds: [...(item.evidenceMessageIds || [])],
    resumeSignals: [...item.resumeSignals],
    anchors: [...(item.anchors || [])],
  }));
  const previousActive = tasks.find((item) => item.id === previous.activeTaskId) ?? null;
  const relation = current.currentTurnRelation;

  // R1 task identity authority: a stable task id survives scenario/intent/goal
  // refinement. scenario:intent is descriptive state, not the task identity key.
  let target = current.activeTaskId
    ? tasks.find((item) => item.id === current.activeTaskId && item.status !== 'ABANDONED') ?? null
    : null;

  if (relation === 'TOPIC_SHIFT' || (relation === 'NEW_REQUEST' && previousActive)) {
    target = null;
  } else if (!target && ['CONTINUATION', 'ANSWER_TO_ASSISTANT_REQUEST', 'INFORMATION_BARRIER', 'RESOLUTION'].includes(relation)) {
    if (previousActive && !['RESOLVED', 'ABANDONED'].includes(previousActive.status)) target = previousActive;
  }

  if (!target && relation === 'CONTINUATION') {
    const compatible = tasks
      .filter((item) => item.status !== 'ABANDONED' && item.scenario === current.activeScenario)
      .sort((a, b) => b.lastActiveTurn - a.lastActiveTurn);
    if (compatible.length === 1) target = compatible[0];
  }

  if (relation === 'TOPIC_SHIFT' && previousActive && !['RESOLVED', 'ABANDONED'].includes(previousActive.status)) {
    previousActive.status = 'SUSPENDED';
  }

  if (!target) {
    const identitySeed = `${current.activeScenario}:${understanding.humanContext.dominantTurnGoal.key}:${latestMessage}`;
    target = {
      id: `task-${turn}-${stableKey(identitySeed)}`,
      scenario: current.activeScenario,
      intent: current.activeIntent,
      goal: understanding.humanContext.dominantTurnGoal.key,
      status: 'ACTIVE',
      responsibility: current.responsibility,
      pendingSlots: [],
      providedSlots: [],
      unresolvedGoals: [],
      completedSteps: [],
      evidence: [],
      evidenceMessageIds: [],
      createdTurn: turn,
      lastActiveTurn: turn,
      resolvedTurn: null,
      resumeSignals: [],
      anchors: latestMessage ? [truncate(latestMessage, 180)] : [],
      proactiveReminderAllowed: false,
    };
    tasks.push(target);
  }

  if (target.id !== previous.activeTaskId && previousActive && previousActive.id !== target.id
    && !['RESOLVED', 'ABANDONED'].includes(previousActive.status)) {
    previousActive.status = 'SUSPENDED';
  }

  target.status = current.longHorizonStatus
    || mapTaskStatus(current.status);
  target.scenario = current.activeScenario;
  target.intent = current.activeIntent;
  target.goal = understanding.humanContext.dominantTurnGoal.key;
  target.responsibility = current.responsibility;
  target.pendingSlots = uniqueStrings(current.pendingSlots.map((item) => item.key));
  target.providedSlots = uniqueStrings([...target.providedSlots, ...current.providedSlots.map((item) => item.key)]);
  target.unresolvedGoals = uniqueStrings(current.unresolvedGoals).slice(-12);
  target.evidence = uniqueStrings([...target.evidence, ...current.evidence]).slice(-12).map((item) => truncate(item));
  target.evidenceMessageIds = uniqueStrings([...(target.evidenceMessageIds ?? []), ...evidenceMessageIds]).slice(-12);
  target.anchors = uniqueStrings([...(target.anchors || []), latestMessage ? truncate(latestMessage, 180) : null]).slice(-8);
  target.lastActiveTurn = turn;
  target.resolvedTurn = ['RESOLVED', 'ABANDONED'].includes(target.status) ? turn : null;
  target.resumeSignals = uniqueStrings([
    ...target.resumeSignals,
    relation === 'TOPIC_SHIFT' ? 'TOPIC_SHIFT' : null,
    current.longHorizonStatus === 'REOPENED' ? 'SEMANTIC_RESUME' : null,
  ]).slice(-8);
  return tasks;
}

function updateMemories(
  previous: CustomerServiceConversationMemory[],
  message: string,
  understanding: CustomerServiceMessageUnderstanding,
  tasks: CustomerServiceLongHorizonTask[],
  turn: number,
  evidenceMessageIds: string[],
) {
  let memories = previous.map((item) => ({ ...item, evidenceMessageIds: [...(item.evidenceMessageIds || [])] }));
  const signal = understanding.humanContext.stateTruthSignal.memory;
  const correction = understanding.humanContext.dialogueObligation.userFeedback === 'CORRECTED'
    || signal.action === 'SUPERSEDE';
  const withdrawal = understanding.humanContext.dialogueObligation.userFeedback === 'WITHDRAWN'
    || signal.action === 'WITHDRAW';

  // R1: never mutate “the latest memory” merely because a correction/withdrawal
  // was detected. State mutation requires an exact server memory id from validated
  // semantic evidence, or a same-key replacement candidate below.
  const targeted = signal.targetMemoryId
    ? memories.find((item) => item.id === signal.targetMemoryId && !item.invalidated && !item.withdrawn) ?? null
    : null;
  if (targeted && signal.action === 'WITHDRAW') targeted.withdrawn = true;
  if (targeted && signal.action === 'SUPERSEDE') {
    targeted.invalidated = true;
    const replacement = String(signal.replacementValue || '').trim();
    if (replacement) {
      const replacementId = `memory-${turn}-${stableKey(`${targeted.kind}:${targeted.key}:${replacement}`)}`;
      targeted.supersededBy = replacementId;
      memories.push({
        ...targeted,
        id: replacementId,
        value: truncate(replacement),
        evidence: truncate(message.replace(/\s+/g, ' ').trim()),
        evidenceMessageIds: evidenceMessageIds.slice(-12),
        sourceTurn: turn,
        confidence: Math.max(0.9, signal.confidence),
        invalidated: false,
        withdrawn: false,
        supersededBy: null,
        lastUsedTurn: turn,
      });
    }
  }

  const currentTask = [...tasks].reverse().find((item) => item.lastActiveTurn === turn && !['RESOLVED', 'ABANDONED'].includes(item.status)) ?? null;
  const candidates = inferMemories(message, understanding, currentTask?.id ?? null, turn, evidenceMessageIds);
  for (const candidate of candidates) {
    const duplicate = memories.find((item) => item.key === candidate.key && item.value === candidate.value && !item.invalidated && !item.withdrawn);
    if (duplicate) {
      duplicate.lastUsedTurn = turn;
      duplicate.confidence = Math.max(duplicate.confidence, candidate.confidence);
      duplicate.evidenceMessageIds = uniqueStrings([
        ...(duplicate.evidenceMessageIds ?? []),
        ...candidate.evidenceMessageIds,
      ]).slice(-12);
      continue;
    }
    if (correction) {
      const sameKey = memories
        .filter((item) => item.key === candidate.key && !item.invalidated && !item.withdrawn)
        .sort((a, b) => b.sourceTurn - a.sourceTurn)[0];
      if (sameKey) {
        sameKey.invalidated = true;
        sameKey.supersededBy = candidate.id;
      }
    } else if (withdrawal) {
      // Withdrawal without an exact target fails closed. A new withdrawal memory
      // may still be recorded, but unrelated durable facts are never guessed away.
    }
    memories.push(candidate);
  }
  return memories.slice(-MAX_MEMORIES);
}

function inferMemories(
  message: string,
  understanding: CustomerServiceMessageUnderstanding,
  taskId: string | null,
  turn: number,
  evidenceMessageIds: string[],
): CustomerServiceConversationMemory[] {
  const result: CustomerServiceConversationMemory[] = [];
  const normalized = message.replace(/\s+/g, ' ').trim();
  const add = (kind: CustomerServiceMemoryKind, key: string, value: string, durable: boolean, confidence: number) => {
    if (!value.trim()) return;
    result.push({
      id: `memory-${turn}-${stableKey(`${kind}:${key}:${value}`)}`,
      kind,
      key,
      value: truncate(value),
      evidence: truncate(normalized),
      evidenceMessageIds: evidenceMessageIds.slice(-12),
      sourceTurn: turn,
      confidence,
      durable,
      temporaryEmotion: kind === 'EMOTIONAL_EVENT',
      invalidated: false,
      withdrawn: false,
      supersededBy: null,
      lastUsedTurn: turn,
    });
  };

  // Durable open-language customer facts are never created from local phrase families.
  // Persist only typed slot/state evidence already produced upstream. PERSON/name has no
  // canonical typed producer here, so it intentionally remains unpersisted rather than
  // being guessed from wording such as “我叫…”.
  for (const slot of understanding.humanContext.conversationTaskState.providedSlots || []) {
    if (!slot.value || slot.confidence < 0.8) continue;
    if (slot.key === 'ADDRESS') add('CUSTOMER_FACT', 'customer.location', slot.value, true, slot.confidence);
  }
  // Open-language preferences and decisions are not inferred here from phrase families.
  // Durable semantic state must come from the evidence-bound typed Understanding/state
  // projection below; deterministic extraction is limited to typed slot/ID transport.
  // R2.1: explicit decision constraints are already semantically recognized by the
  // existing Deep Recognition call. Persist only exact customer-owned evidence and
  // scope it to the existing long-horizon task; no keyword/domain/product rule is used.
  if (taskId && understanding.humanContext.stateTruthSignal.memory.action === 'NONE') {
    for (const item of understanding.recognizedItems || []) {
      if (item.type !== 'STATE' || item.scope !== 'CONVERSATION' || item.suggestedCategory !== 'CUSTOMER_CONSTRAINT') continue;
      if (item.confidence < 0.8) continue;
      const evidence = String(item.evidence?.[0] || '').replace(/\s+/g, ' ').trim();
      if (!evidence || !normalized.includes(evidence)) continue;
      const semanticKey = String(item.key || '').trim();
      if (!semanticKey) continue;
      add('CUSTOMER_CONSTRAINT', `constraint.${taskId}.${semanticKey}`, evidence, true, item.confidence);
    }
  }
  // Durable COMMITMENT truth must not be manufactured from raw wording here.
  // This reducer has no typed, speaker-owned commitment authority; phrase matching
  // would turn language form into server-owned history. Keep the memory kind for
  // compatible persisted state / future canonical producers, but do not create it
  // from ad-hoc customer text in this legacy inference helper.
  if (understanding.humanContext.dialogueObligation.userFeedback === 'CORRECTED') {
    add('CORRECTION', `correction.${understanding.primaryScenario}`, normalized, true, 0.98);
  }
  if (understanding.humanContext.dialogueObligation.userFeedback === 'WITHDRAWN') {
    add('WITHDRAWAL', `withdrawal.${understanding.primaryScenario}`, normalized, true, 0.96);
  }
  if (understanding.primaryIntent === 'EMOTIONAL_DISCLOSURE' && normalized.length >= 8) {
    add('EMOTIONAL_EVENT', `emotion.${understanding.primaryScenario}`, normalized, false, 0.78);
  }
  if (result.length === 0 && normalized.length >= 12 && understanding.confidence >= 0.75) {
    add('TOPIC_ANCHOR', `topic.${understanding.primaryScenario}`, normalized, false, 0.72);
  }
  return result.slice(0, 4);
}

function updateMoveLedger(
  previous: CustomerServiceAssistantMoveLedgerEntry[],
  draft: string | null | undefined,
  feedback: CustomerServiceMessageUnderstanding['humanContext']['dialogueObligation'],
  turn: number,
  evidenceMessageIds: string[] = [],
  taskId: string | null = null,
  behaviorInput?: {
    replyAttemptId?: string | null;
    replyTraceId?: string | null;
    behaviorPlan?: unknown;
    interactionPlanV2?: unknown;
    planFulfillment?: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
    realizedGroundingRefs?: string[];
    provenGroundedUnits?: Array<{ text: string; groundingRefs: string[] }>;
  },
) {
  const ledger = previous.map((item) => ({ ...item }));
  const prior = ledger.at(-1);
  if (prior && feedback.userFeedback !== 'UNCLEAR') {
    prior.accepted = feedback.userFeedback === 'ACCEPTED' ? true
      : ['REJECTED', 'CORRECTED', 'ESCALATED', 'WITHDRAWN'].includes(feedback.userFeedback) ? false : null;
    prior.rejected = ['REJECTED', 'CORRECTED', 'ESCALATED'].includes(feedback.userFeedback);
    prior.requestedDeltas = feedback.requestedDeltas;
  }
  const text = String(draft || '').trim();
  if (text) {
    const actionFamilies: CustomerServiceAssistantMoveLedgerEntry['actionFamilies'] = [];
    const behavior = behaviorInput
      ? buildCustomerServiceAssistantBehaviorObservation({
          text,
          evidenceMessageIds,
          replyAttemptId: behaviorInput.replyAttemptId,
          replyTraceId: behaviorInput.replyTraceId,
          behaviorPlan: behaviorInput.behaviorPlan,
          interactionPlanV2: behaviorInput.interactionPlanV2,
          planFulfillment: behaviorInput.planFulfillment,
          taskId,
          realizedGroundingRefs: behaviorInput.realizedGroundingRefs,
          provenGroundedUnits: behaviorInput.provenGroundedUnits,
        })
      : null;
    ledger.push({
      turn,
      move: projectAssistantMoveFromBehavior(behavior),
      actionFamilies,
      practicalActionFamilies: [],
      interpersonalActionFamilies: [],
      strategyKey: behavior?.structureKey || '',
      openingKey: normalizeEdge(text.slice(0, 28)),
      endingKey: normalizeEdge(text.slice(-28)),
      accepted: null,
      rejected: false,
      requestedDeltas: [],
      excerpt: truncate(text, 160),
      behavior: behavior || undefined,
    });
  }
  return ledger.slice(-MAX_MOVE_LEDGER);
}

function emptyRelationshipDynamics(): CustomerServiceConversationStateV2['relationshipDynamics'] {
  return {
    relationshipDistance: 'NEUTRAL',
    warmContactAcceptance: 'UNKNOWN',
    humorAcceptance: 'UNKNOWN',
    supportMode: 'COMPANIONSHIP',
    previousReplyReception: 'NO_SIGNAL',
    emotionalIntensity: 'LOW',
    conversationTempo: 'STEADY',
    recommendedStance: 'ACTIVE_WARM',
    recentInterpersonalActions: [],
    recentPracticalActions: [],
    evidence: [],
  };
}

function readRelationshipDynamics(value: unknown): CustomerServiceConversationStateV2['relationshipDynamics'] {
  const fallback = emptyRelationshipDynamics();
  const record = asRecord(value);
  return {
    relationshipDistance: enumValue(
      record.relationshipDistance,
      ['FORMAL', 'NEUTRAL', 'WARM', 'CLOSE', 'REPAIR'] as const,
      fallback.relationshipDistance,
    ),
    warmContactAcceptance: enumValue(
      record.warmContactAcceptance,
      ['UNKNOWN', 'ACCEPTED', 'REJECTED'] as const,
      fallback.warmContactAcceptance,
    ),
    humorAcceptance: enumValue(
      record.humorAcceptance,
      ['UNKNOWN', 'ACCEPTED', 'REJECTED'] as const,
      fallback.humorAcceptance,
    ),
    supportMode: enumValue(
      record.supportMode,
      ['COMPANIONSHIP', 'PROBLEM_SOLVING', 'BALANCED', 'SPACE'] as const,
      fallback.supportMode,
    ),
    previousReplyReception: enumValue(
      record.previousReplyReception,
      ['NO_SIGNAL', 'ACCEPTED', 'PARTIAL', 'REJECTED'] as const,
      fallback.previousReplyReception,
    ),
    emotionalIntensity: enumValue(
      record.emotionalIntensity,
      ['LOW', 'MEDIUM', 'HIGH'] as const,
      fallback.emotionalIntensity,
    ),
    conversationTempo: enumValue(
      record.conversationTempo,
      ['QUIET', 'STEADY', 'LIGHT', 'SERIOUS'] as const,
      fallback.conversationTempo,
    ),
    recommendedStance: enumValue(
      record.recommendedStance,
      ['ACTIVE_WARM', 'QUIET_COMPANION', 'LIGHT_FRIENDLY', 'SERIOUS_PRACTICAL', 'FORMAL_SAFE'] as const,
      fallback.recommendedStance,
    ),
    recentInterpersonalActions: stringArray(record.recentInterpersonalActions)
      .slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentInterpersonalActions'],
    recentPracticalActions: stringArray(record.recentPracticalActions)
      .slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentPracticalActions'],
    evidence: stringArray(record.evidence).slice(-8),
  };
}

function readMoveLedger(value: unknown): CustomerServiceAssistantMoveLedgerEntry[] {
  return arrayOfRecords(value)
    .slice(-MAX_MOVE_LEDGER)
    .map((record) => {
      const excerpt = String(record.excerpt || '');
      const actionFamilies = stringArray(record.actionFamilies) as CustomerServiceAssistantMoveLedgerEntry['actionFamilies'];
      return {
        ...record,
        turn: finiteInt(record.turn),
        move: String(record.move || 'UNKNOWN') as CustomerServiceAssistantMoveLedgerEntry['move'],
        actionFamilies,
        practicalActionFamilies: stringArray(record.practicalActionFamilies) as CustomerServiceAssistantMoveLedgerEntry['practicalActionFamilies'],
        interpersonalActionFamilies: stringArray(record.interpersonalActionFamilies) as CustomerServiceAssistantMoveLedgerEntry['interpersonalActionFamilies'],
        strategyKey: String(record.strategyKey || ''),
        openingKey: String(record.openingKey || ''),
        endingKey: String(record.endingKey || ''),
        accepted: typeof record.accepted === 'boolean' ? record.accepted : null,
        rejected: record.rejected === true,
        requestedDeltas: stringArray(record.requestedDeltas) as CustomerServiceAssistantMoveLedgerEntry['requestedDeltas'],
        excerpt,
        behavior: normalizeCustomerServiceAssistantBehaviorObservation(record.behavior),
      };
    });
}

function updateRelationshipDynamics(input: {
  previous: CustomerServiceConversationStateV2['relationshipDynamics'];
  message: string;
  understanding: CustomerServiceMessageUnderstanding;
  assistantMoveLedger: CustomerServiceAssistantMoveLedgerEntry[];
}): CustomerServiceConversationStateV2['relationshipDynamics'] {
  const previous = readRelationshipDynamics(input.previous);
  const human = input.understanding.humanContext;
  const feedback = human.dialogueObligation.userFeedback;
  const deltas = new Set(human.dialogueObligation.requestedDeltas);
  const explicitWarmRequest = deltas.has('WARMER');
  const rejectsWarmth = deltas.has('LESS_WARM');
  const acceptsHumor = deltas.has('HUMOR_OK');
  const rejectsHumor = deltas.has('NO_HUMOR');
  const asksSpace = human.requiredTurnGoals.some((item) => item.key === 'RESPECT_EMOTIONAL_SPACE')
    || human.dialogueObligation.requestedDeltas.includes('LISTEN_ONLY');
  const asksAdvice = human.requiredTurnGoals.some((item) => item.key === 'PROVIDE_REQUESTED_ADVICE');
  const asksCompanionship = human.requiredTurnGoals.some((item) =>
    ['PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING', 'INVITE_EMOTIONAL_SHARING'].includes(item.key),
  );
  const negativeEmotion = ['ANXIOUS', 'FRUSTRATED', 'DISAPPOINTED', 'ANGRY'].includes(input.understanding.emotion);
  const highIntensity = input.understanding.emotion === 'ANGRY'
    || (human.emotionalDisclosure.detected && human.emotionStrategy.validationPriority >= 90);
  const positiveOrLight = input.understanding.emotion === 'POSITIVE' || acceptsHumor;
  const recentInterpersonalActions = uniqueStrings(
    input.assistantMoveLedger.flatMap((item) => item.interpersonalActionFamilies),
  ).slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentInterpersonalActions'];
  const recentPracticalActions = uniqueStrings(
    input.assistantMoveLedger.flatMap((item) => item.practicalActionFamilies),
  ).slice(-8) as CustomerServiceConversationStateV2['relationshipDynamics']['recentPracticalActions'];
  const supportMode = asksSpace
    ? 'SPACE'
    : asksAdvice && asksCompanionship
      ? 'BALANCED'
      : asksAdvice
        ? 'PROBLEM_SOLVING'
        : asksCompanionship
          ? 'COMPANIONSHIP'
          : previous.supportMode;
  const previousReplyReception = feedback === 'ACCEPTED'
    ? 'ACCEPTED'
    : feedback === 'PARTIALLY_ACCEPTED' || feedback === 'INSUFFICIENT'
      ? 'PARTIAL'
      : ['REJECTED', 'CORRECTED', 'ESCALATED'].includes(feedback)
        ? 'REJECTED'
        : 'NO_SIGNAL';
  const relationshipDistance = input.understanding.riskLevel === 'HIGH'
    || input.understanding.riskLevel === 'CRITICAL'
    ? 'FORMAL'
    : human.relationshipState === 'STRAINED'
      ? 'REPAIR'
      : human.relationshipState === 'FAMILIAR'
        ? 'CLOSE'
        : explicitWarmRequest || human.relationshipState === 'OPEN' || input.understanding.primaryScenario === 'CASUAL_CHAT'
          ? 'WARM'
          : previous.relationshipDistance;
  const emotionalIntensity = highIntensity
    ? 'HIGH'
    : negativeEmotion
      ? 'MEDIUM'
      : positiveOrLight
        ? 'LOW'
        : previous.emotionalIntensity;
  const conversationTempo = asksSpace
    ? 'QUIET'
    : positiveOrLight
      ? 'LIGHT'
      : negativeEmotion || asksAdvice
        ? 'SERIOUS'
        : 'STEADY';
  const recommendedStance = relationshipDistance === 'FORMAL'
    ? 'FORMAL_SAFE'
    : asksSpace
      ? 'QUIET_COMPANION'
      : positiveOrLight
        ? 'LIGHT_FRIENDLY'
        : asksAdvice
          ? 'SERIOUS_PRACTICAL'
          : 'ACTIVE_WARM';

  return {
    relationshipDistance,
    warmContactAcceptance: rejectsWarmth ? 'REJECTED' : explicitWarmRequest ? 'ACCEPTED' : previous.warmContactAcceptance,
    humorAcceptance: rejectsHumor ? 'REJECTED' : acceptsHumor ? 'ACCEPTED' : previous.humorAcceptance,
    supportMode,
    previousReplyReception,
    emotionalIntensity,
    conversationTempo,
    recommendedStance,
    recentInterpersonalActions,
    recentPracticalActions,
    evidence: uniqueStrings([
      ...previous.evidence,
      explicitWarmRequest ? '客户明确接受或请求温暖接触' : null,
      rejectsWarmth ? '客户拒绝亲近表达' : null,
      acceptsHumor ? '客户明确接受轻微玩笑' : null,
      rejectsHumor ? '客户拒绝玩笑并要求严肃' : null,
      asksSpace ? '客户当前更需要安静或倾听空间' : null,
      asksAdvice ? '客户当前明确需要解决办法' : null,
      asksCompanionship ? '客户当前仍需要人际承接' : null,
      previousReplyReception !== 'NO_SIGNAL' ? `客户对上一轮回复：${previousReplyReception}` : null,
    ]).slice(-8),
  };
}

function updateEntities(
  previous: CustomerServiceConversationStateV2['entities'],
  message: string,
  understanding: CustomerServiceMessageUnderstanding,
  turn: number,
) {
  const entities = previous.map((item) => ({
    ...item,
    aliases: [...item.aliases],
    sourceTurns: [...item.sourceTurns],
  }));
  type Entity = CustomerServiceConversationStateV2['entities'][number];
  const candidates: Array<{ type: Entity['type']; value: string; semanticKey: string }> = [];
  for (const slot of understanding.humanContext.conversationTaskState.providedSlots || []) {
    const value = String(slot.value || '').trim();
    if (!value || slot.confidence < 0.8) continue;
    if (slot.key === 'ORDER_ID' || slot.key === 'TRACKING_NUMBER') {
      candidates.push({ type: 'ORDER', value, semanticKey: 'order.reference' });
    } else if (slot.key === 'ADDRESS') {
      candidates.push({ type: 'LOCATION', value, semanticKey: 'customer.location' });
    }
  }

  const signal = understanding.humanContext.stateTruthSignal.entity;
  const targeted = signal.targetEntityId
    ? entities.find((item) => item.id === signal.targetEntityId && !item.invalidated) ?? null
    : null;
  if (targeted && signal.action === 'WITHDRAW') targeted.invalidated = true;
  if (targeted && signal.action === 'SUPERSEDE') {
    targeted.invalidated = true;
    const replacement = String(signal.replacementValue || '').trim();
    if (replacement) {
      entities.push({
        id: `entity-${turn}-${stableKey(`${targeted.type}:${targeted.semanticKey || 'unknown'}:${replacement}`)}`,
        type: targeted.type,
        canonicalValue: replacement,
        semanticKey: targeted.semanticKey,
        aliases: uniqueStrings([...targeted.aliases, targeted.canonicalValue]),
        sourceTurns: [turn],
        invalidated: false,
        lastSeenTurn: turn,
      });
    }
  }

  const corrected = understanding.humanContext.dialogueObligation.userFeedback === 'CORRECTED';
  for (const candidate of candidates) {
    const existing = entities.find((item) => item.type === candidate.type
      && item.canonicalValue === candidate.value
      && !item.invalidated);
    if (existing) {
      existing.semanticKey = existing.semanticKey || candidate.semanticKey;
      existing.lastSeenTurn = turn;
      existing.sourceTurns = uniqueNumbers([...existing.sourceTurns, turn]).slice(-12);
      continue;
    }
    if (corrected) {
      // Key-targeted fallback only. Never invalidate all PERSON entities.
      const sameKey = entities
        .filter((item) => item.semanticKey === candidate.semanticKey && !item.invalidated)
        .sort((a, b) => b.lastSeenTurn - a.lastSeenTurn)[0];
      if (sameKey) sameKey.invalidated = true;
    }
    entities.push({
      id: `entity-${turn}-${stableKey(`${candidate.type}:${candidate.semanticKey}:${candidate.value}`)}`,
      type: candidate.type,
      canonicalValue: candidate.value,
      semanticKey: candidate.semanticKey,
      aliases: [],
      sourceTurns: [turn],
      invalidated: false,
      lastSeenTurn: turn,
    });
  }
  return entities.slice(-MAX_ENTITIES);
}

function mapTaskStatus(status: string): CustomerServiceLongHorizonTaskStatus {
  switch (status) {
    case 'WAITING_FOR_CUSTOMER': return 'WAITING_CUSTOMER';
    case 'INTERNAL_PROCESSING': return 'WAITING_INTERNAL';
    case 'RESOLVED': return 'RESOLVED';
    default: return 'ACTIVE';
  }
}

function projectAssistantMoveFromBehavior(
  behavior: CustomerServiceAssistantMoveLedgerEntry['behavior'] | null | undefined,
): CustomerServiceAssistantMoveLedgerEntry['move'] {
  const acts = new Set(behavior?.observedActs || []);
  if (acts.has('REQUIRED_QUESTION') || acts.has('OPTIONAL_QUESTION') || acts.has('CLARIFYING_QUESTION')) return 'ASK_QUESTION';
  if (acts.has('PRODUCT_SUGGESTION')) return 'OFFER_OPTIONS';
  if (acts.has('LIGHT_SUGGESTION')) return 'ADVISE';
  if (acts.has('DIRECT_ANSWER')) return 'EXPLAIN';
  if (acts.has('SPECIFIC_ACK')) return 'GENERIC_EMPATHY';
  if (acts.has('LIGHT_ACK')) return 'ACKNOWLEDGE';
  return 'UNKNOWN';
}

function uniqueKeyValuePairs(items: Array<{ key: string; value: string }>) {
  const seen = new Set<string>();
  const result: Array<{ key: string; value: string }> = [];
  for (const item of items) {
    const token = `${item.key}\u0000${item.value}`;
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(item);
  }
  return result.slice(-40);
}

function tokenize(value: string) {
  const tokens = new Set<string>();
  const segments = value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
  for (const segment of segments) {
    const item = segment.trim();
    if (item.length >= 2) tokens.add(item);
    // CJK text commonly has no whitespace. Character n-grams make relevance
    // matching language-form agnostic without turning durability into relevance.
    if (/[\u3400-\u9fff]/u.test(item)) {
      const chars = [...item];
      for (const size of [2, 3, 4]) {
        for (let i = 0; i + size <= chars.length; i += 1) tokens.add(chars.slice(i, i + size).join(''));
      }
    }
    if (tokens.size >= 240) break;
  }
  return tokens;
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeEdge(value: string) {
  return value.toLowerCase().replace(/[\s，。！？、,.!?；;：:“”"'（）()]/g, '').slice(0, 24);
}

function truncate(value: string, max = MAX_EVIDENCE_LENGTH) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function finiteInt(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? value as T[number] : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.filter((item) => Number.isFinite(item)))];
}
