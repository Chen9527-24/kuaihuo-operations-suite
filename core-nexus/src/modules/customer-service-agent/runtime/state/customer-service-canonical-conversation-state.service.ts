import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import {
  CustomerServiceCanonicalConversationStateRepository,
  CustomerServiceCanonicalDialogueEvent,
  CustomerServiceCanonicalMessageEvidence,
  CustomerServiceCanonicalConversationStateRow,
} from '../../infrastructure/persistence/customer-service-canonical-conversation-state.repository';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import type { CompileCustomerServiceSimulationDto } from '../simulation/dto/compile-simulation.dto';
import { CustomerServiceMessageUnderstandingService } from '../understanding/customer-service-message-understanding.service';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import {
  customerServiceLongHorizonStateEnabled,
  emptyCustomerServiceConversationStateV2,
  readCustomerServiceConversationStateV2,
  reduceCustomerServiceConversationState,
  reconcileCustomerServiceCurrentFeedback,
  reduceCustomerServiceObservedAssistantAction,
} from './customer-service-conversation-state.reducer';
import type { CustomerServiceConversationStateV2 } from './customer-service-conversation-state.type';
import {
  extractCustomerServiceBehaviorPlanFromRuntimeContract,
  extractCustomerServiceInteractionPlanV2FromRuntimeContract,
  extractCustomerServiceProvenGroundingRefsFromReplyTrace,
  extractCustomerServiceProvenGroundedUnitsFromReplyTrace,
  resolveCustomerServicePlanFulfillmentFromReplyTrace,
} from '../behavior/customer-service-behavior-memory.util';

const MAX_RECENT_PROCESSED_MESSAGE_IDS = 96;
const MAX_REBUILD_HISTORY_MESSAGES = 30;

export type CustomerServiceCanonicalStateRuntimeContext = {
  rowId: string;
  dialogueConversationId: string;
  robotId: string;
  revision: number;
  stateHash: string;
  state: CustomerServiceConversationStateV2;
  rebuildRequired: boolean;
  evidence: CustomerServiceCanonicalMessageEvidence | null;
  sourceConversationIds: string[];
  currentCustomerApplied: boolean;
  lastRebuiltAt: Date | null;
  lastRebuildReason: string;
};

export type CustomerServiceCanonicalProjectionResult = {
  status: 'APPLIED' | 'ALREADY_APPLIED' | 'NO_EVIDENCE' | 'OUT_OF_ORDER' | 'CONFLICT' | 'NOT_CANONICAL';
  dialogueConversationId: string | null;
  revision: number | null;
  stateHash: string | null;
  evidenceMessageId: string | null;
  rebuildRequired: boolean;
};

export type CustomerServiceCanonicalLifecycleResult = {
  status: 'APPLIED' | 'REBUILT' | 'UP_TO_DATE' | 'REBUILD_DEFERRED' | 'CONFLICT' | 'NOT_CANONICAL';
  dialogueConversationId: string | null;
  revision: number | null;
  stateHash: string | null;
  processedEventCount: number;
  customerEventCount: number;
  assistantEventCount: number;
  sourceConversationIds: string[];
  rebuildRequired: boolean;
  rebuildReason: string;
};

@Injectable()
export class CustomerServiceCanonicalConversationStateService {
  private readonly logger = new Logger(CustomerServiceCanonicalConversationStateService.name);

  constructor(
    private readonly repository: CustomerServiceCanonicalConversationStateRepository,
    private readonly understandingService: CustomerServiceMessageUnderstandingService,
  ) {}

  async readRuntimeState(input: {
    dialogueConversationId?: string | null;
    expectedRobotId?: string | null;
    user: CurrentUserPayload;
  }): Promise<CustomerServiceCanonicalStateRuntimeContext | null> {
    if (!customerServiceLongHorizonStateEnabled()) return null;
    const loaded = await this.loadOrCreateState(input);
    if (!loaded) return null;
    return runtimeContextFromRow(loaded.row, null, false);
  }

  async prepareRuntime(input: {
    dialogueConversationId?: string | null;
    expectedRobotId?: string | null;
    customerMessageClientId?: string | null;
    dto?: CompileCustomerServiceSimulationDto;
    user: CurrentUserPayload;
  }): Promise<CustomerServiceCanonicalStateRuntimeContext | null> {
    if (!customerServiceLongHorizonStateEnabled()) return null;
    const loaded = await this.loadOrCreateState(input);
    if (!loaded) return null;
    const tenantId = resolveRequiredTenantId(input.user);
    const evidence = await this.repository.findCustomerMessageEvidence({
      tenantId,
      dialogueConversationId: loaded.dialogueConversationId,
      clientMessageId: input.customerMessageClientId,
    });
    let row = loaded.row;

    // C5-B moves the customer projection before reply generation. This fallback
    // keeps direct runtime callers safe even when they skipped resolve-sync.
    if (evidence && !isEventCovered(row, evidence) && !row.rebuildRequired) {
      if (row.lastProcessedSortKey && evidence.sortKey <= row.lastProcessedSortKey) {
        await this.repository.markRebuildRequired(
          row.id,
          tenantId,
          'DIRECT_RUNTIME_OUT_OF_ORDER',
          row.sourceConversationIds?.length ? row.sourceConversationIds : [loaded.dialogueConversationId],
        );
        row = await this.repository.findState(tenantId, loaded.dialogueConversationId) ?? row;
      } else if (input.dto) {
        const previousState = alignPayloadRevision(row);
        const dto = lifecycleDto({
          message: evidence.textContent || input.dto.message,
          previousState,
          conversationHistory: input.dto.conversationHistory ?? [],
          base: input.dto,
          dialogueConversationId: loaded.dialogueConversationId,
        });
        const understanding = this.understandingService.understand(dto);
        const applied = await this.applyCustomerProjection({
          row,
          evidence,
          dto,
          understanding,
          tenantId,
          sourceConversationIds: row.sourceConversationIds?.length
            ? row.sourceConversationIds
            : [loaded.dialogueConversationId],
        });
        if (applied.status === 'APPLIED' || applied.status === 'ALREADY_APPLIED') {
          row = await this.repository.findState(tenantId, loaded.dialogueConversationId) ?? row;
        }
      }
    }

    return runtimeContextFromRow(row, evidence, Boolean(evidence && isEventCovered(row, evidence)));
  }

  async reconcileEffectiveEvents(input: {
    dialogueConversationId: string;
    expectedRobotId?: string | null;
    sourceConversationIds: string[];
    events: CustomerServiceCanonicalDialogueEvent[];
    changedEventIds?: string[];
    mutatedExistingMessageIds?: string[];
    eventsComplete: boolean;
    user: CurrentUserPayload;
  }): Promise<CustomerServiceCanonicalLifecycleResult> {
    if (!customerServiceLongHorizonStateEnabled()) return emptyLifecycle('NOT_CANONICAL');
    const loaded = await this.loadOrCreateState({
      dialogueConversationId: input.dialogueConversationId,
      expectedRobotId: input.expectedRobotId,
      user: input.user,
      sourceConversationIds: input.sourceConversationIds,
    });
    if (!loaded) return emptyLifecycle('NOT_CANONICAL');
    const tenantId = resolveRequiredTenantId(input.user);
    let row = loaded.row;
    const sourceConversationIds = normalizeIds([
      input.dialogueConversationId,
      ...(input.sourceConversationIds ?? []),
    ]);
    const events = normalizeEvents(input.events, sourceConversationIds);
    if (!events.length) {
      if (row.rebuildRequired) {
        const reason = row.lastRebuildReason || 'REBUILD_REQUIRED';
        if (!input.eventsComplete) {
          return lifecycleFromRow('REBUILD_DEFERRED', row, 0, 0, 0, sourceConversationIds, reason);
        }
        return this.rebuildFromEvents({
          row,
          events: [],
          tenantId,
          sourceConversationIds,
          reason,
        });
      }
      return lifecycleFromRow('UP_TO_DATE', row, 0, 0, 0, sourceConversationIds, row.lastRebuildReason || '');
    }

    const processedIds = new Set(normalizeIds(row.recentProcessedMessageIds));
    const changedEventIds = new Set(normalizeIds(input.changedEventIds));
    const mutatedExistingMessageIds = normalizeIds(input.mutatedExistingMessageIds);
    // An existing authoritative row changing semantically can remove or alter an
    // event during effective-history folding (for example text -> non-text). In
    // that case the changed row may no longer appear in `events`, so preserve
    // the mutation signal separately and rebuild conservatively once State has
    // already projected any lifecycle history.
    const canonicalMessageMutated = mutatedExistingMessageIds.length > 0
      && Boolean(row.lastProcessedSortKey || Number(row.revision || 0) > 0);
    const changedHistoricalEvent = events.find((event) => (
      changedEventIds.has(event.id)
      && (
        processedIds.has(event.id)
        || event.id === row.lastProcessedMessageId
        || Boolean(row.lastProcessedSortKey && event.sortKey <= row.lastProcessedSortKey)
      )
    ));
    const previousScope = new Set(normalizeIds(row.sourceConversationIds));
    const scopeExpanded = sourceConversationIds.some((id) => !previousScope.has(id));
    const rebuildReason = row.rebuildRequired
      ? (row.lastRebuildReason || 'REBUILD_REQUIRED')
      : canonicalMessageMutated
        ? 'CANONICAL_MESSAGE_MUTATED'
        : changedHistoricalEvent
          ? 'OUT_OF_ORDER_OR_HISTORY_BACKFILL'
          : scopeExpanded && row.lastProcessedSortKey
            ? 'CANONICAL_SCOPE_EXPANDED'
            : !input.eventsComplete && !row.lastProcessedSortKey && Number(row.revision || 0) === 0
              ? 'INITIAL_HISTORY_INCOMPLETE'
              : '';

    if (rebuildReason) {
      if (!input.eventsComplete) {
        await this.repository.markRebuildRequired(row.id, tenantId, rebuildReason, sourceConversationIds);
        row = await this.repository.findState(tenantId, input.dialogueConversationId) ?? row;
        return lifecycleFromRow('REBUILD_DEFERRED', row, 0, 0, 0, sourceConversationIds, rebuildReason);
      }
      return this.rebuildFromEvents({
        row,
        events,
        tenantId,
        sourceConversationIds,
        reason: rebuildReason,
      });
    }

    const newEvents = events.filter((event) => (
      !processedIds.has(event.id)
      && event.id !== row.lastProcessedMessageId
      && (!row.lastProcessedSortKey || event.sortKey > row.lastProcessedSortKey)
    ));
    if (!newEvents.length) {
      return lifecycleFromRow('UP_TO_DATE', row, 0, 0, 0, sourceConversationIds, '');
    }

    let state = alignPayloadRevision(row);
    let customerEventCount = 0;
    let assistantEventCount = 0;
    const eventIndex = new Map(events.map((event, index) => [event.id, index]));
    const assistantBehaviorContexts = await this.loadAssistantBehaviorContexts(tenantId, newEvents);
    for (const event of newEvents) {
      const index = eventIndex.get(event.id) ?? 0;
      const priorHistory = historyBefore(events, index);
      if (event.senderRole === 'user') {
        const dto = lifecycleDto({
          message: event.textContent,
          previousState: state,
          conversationHistory: priorHistory,
          dialogueConversationId: input.dialogueConversationId,
        });
        const understanding = this.understandingService.understand(dto);
        state = reduceCustomerServiceConversationState({
          previous: state,
          dto,
          understanding,
          assistantDraft: null,
          evidenceMessageIds: [event.id],
        });
        customerEventCount += 1;
      } else {
        const behaviorContext = resolveAssistantBehaviorContext(event, assistantBehaviorContexts);
        const priorEvent = events[index - 1];
        if (priorEvent?.senderRole === 'user' && behaviorContext?.finalFeedback
          && behaviorContext.customerEvidenceMessageId === priorEvent.id) {
          state = reconcileCustomerServiceCurrentFeedback(state, behaviorContext.finalFeedback);
        }
        state = reduceCustomerServiceObservedAssistantAction({
          previous: state,
          assistantText: event.textContent,
          evidenceMessageIds: [event.id],
          replyAttemptId: behaviorContext?.replyAttemptId || event.replyAttemptId,
          replyTraceId: behaviorContext?.id || event.replyTraceId,
          behaviorPlan: behaviorContext?.behaviorPlan,
          interactionPlanV2: behaviorContext?.interactionPlanV2,
          planFulfillment: behaviorContext?.planFulfillment,
          realizedGroundingRefs: behaviorContext?.realizedGroundingRefs,
          provenGroundedUnits: behaviorContext?.provenGroundedUnits,
        });
        assistantEventCount += 1;
      }
    }

    const nextRevision = Number(row.revision || 0) + 1;
    state.revision = nextRevision;
    const stateHash = stableJsonHash(state);
    const recentProcessedMessageIds = normalizeIds([
      ...normalizeIds(row.recentProcessedMessageIds),
      ...newEvents.map((event) => event.id),
    ]).slice(-MAX_RECENT_PROCESSED_MESSAGE_IDS);
    const lastEvent = newEvents.at(-1) || null;
    const applied = await this.repository.replaceStateCas({
      id: row.id,
      tenantId,
      expectedRevision: Number(row.revision || 0),
      stateSchemaVersion: state.schemaVersion,
      stateHash,
      statePayload: state as unknown as Prisma.InputJsonValue,
      payloadBytes: Buffer.byteLength(JSON.stringify(state), 'utf8'),
      lastEvent,
      recentProcessedMessageIds,
      sourceConversationIds,
      rebuildRequired: false,
      rebuildReason: '',
    });
    if (!applied) {
      const winner = await this.repository.findState(tenantId, input.dialogueConversationId);
      return winner
        ? lifecycleFromRow('CONFLICT', winner, 0, 0, 0, sourceConversationIds, 'CAS_CONFLICT')
        : emptyLifecycle('CONFLICT');
    }
    return {
      status: 'APPLIED',
      dialogueConversationId: input.dialogueConversationId,
      revision: nextRevision,
      stateHash,
      processedEventCount: newEvents.length,
      customerEventCount,
      assistantEventCount,
      sourceConversationIds,
      rebuildRequired: false,
      rebuildReason: '',
    };
  }

  async forceRebuildFromEvents(input: {
    dialogueConversationId: string;
    expectedRobotId?: string | null;
    sourceConversationIds: string[];
    events: CustomerServiceCanonicalDialogueEvent[];
    reason?: string;
    user: CurrentUserPayload;
  }): Promise<CustomerServiceCanonicalLifecycleResult> {
    if (!customerServiceLongHorizonStateEnabled()) return emptyLifecycle('NOT_CANONICAL');
    const loaded = await this.loadOrCreateState({
      dialogueConversationId: input.dialogueConversationId,
      expectedRobotId: input.expectedRobotId,
      user: input.user,
      sourceConversationIds: input.sourceConversationIds,
    });
    if (!loaded) return emptyLifecycle('NOT_CANONICAL');
    const tenantId = resolveRequiredTenantId(input.user);
    return this.rebuildFromEvents({
      row: loaded.row,
      events: normalizeEvents(input.events, input.sourceConversationIds),
      tenantId,
      sourceConversationIds: normalizeIds([input.dialogueConversationId, ...input.sourceConversationIds]),
      reason: String(input.reason || 'ADMIN_SAFE_REBUILD').slice(0, 128),
    });
  }

  async invalidateStateTarget(input: {
    dialogueConversationId: string;
    expectedRobotId?: string | null;
    targetType: 'CANONICAL_FIELD' | 'MEMORY';
    targetKey: string;
    reason?: string;
    user: CurrentUserPayload;
  }) {
    if (!customerServiceLongHorizonStateEnabled()) return { status: 'NOT_CANONICAL' as const };
    const loaded = await this.loadOrCreateState(input);
    if (!loaded) return { status: 'NOT_CANONICAL' as const };
    const tenantId = resolveRequiredTenantId(input.user);
    const row = await this.repository.findState(tenantId, loaded.dialogueConversationId) ?? loaded.row;
    const state = alignPayloadRevision(row);
    const reason = cleanAdminReason(input.reason);
    let changed = false;
    if (input.targetType === 'MEMORY') {
      const memory = state.memories.find((item) => item.id === String(input.targetKey || '').trim());
      if (memory && !memory.invalidated) {
        memory.invalidated = true;
        state.invalidatedMemoryIds = normalizeIds([...state.invalidatedMemoryIds, memory.id]);
        state.selectedMemoryIds = state.selectedMemoryIds.filter((id) => id !== memory.id);
        changed = true;
      }
    } else {
      const key = String(input.targetKey || '').trim() as keyof typeof state.canonicalFields;
      const field = state.canonicalFields[key];
      if (field && field.status !== 'STALE') {
        field.status = 'STALE';
        field.confidence = 0;
        field.reason = `ADMIN_INVALIDATED${reason ? `: ${reason}` : ''}`.slice(0, 500);
        field.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (!changed) {
      return {
        status: 'UNCHANGED' as const,
        dialogueConversationId: row.dialogueConversationId,
        revision: Number(row.revision || 0),
        stateHash: row.stateHash,
      };
    }
    const nextRevision = Number(row.revision || 0) + 1;
    state.revision = nextRevision;
    state.updatedAt = new Date().toISOString();
    const stateHash = stableJsonHash(state);
    const applied = await this.repository.replaceStateCas({
      id: row.id,
      tenantId,
      expectedRevision: Number(row.revision || 0),
      stateSchemaVersion: state.schemaVersion,
      stateHash,
      statePayload: state as unknown as Prisma.InputJsonValue,
      payloadBytes: Buffer.byteLength(JSON.stringify(state), 'utf8'),
      recentProcessedMessageIds: row.recentProcessedMessageIds,
      sourceConversationIds: row.sourceConversationIds,
      rebuildRequired: row.rebuildRequired,
      rebuildReason: row.lastRebuildReason,
    });
    if (!applied) {
      const winner = await this.repository.findState(tenantId, row.dialogueConversationId);
      return {
        status: 'CONFLICT' as const,
        dialogueConversationId: row.dialogueConversationId,
        revision: winner?.revision ?? row.revision,
        stateHash: winner?.stateHash ?? row.stateHash,
      };
    }
    return {
      status: 'INVALIDATED' as const,
      dialogueConversationId: row.dialogueConversationId,
      revision: nextRevision,
      stateHash,
      targetType: input.targetType,
      targetKey: input.targetKey,
      rebuildRequired: row.rebuildRequired,
    };
  }

  async commitCustomerProjection(input: {
    runtimeContext: CustomerServiceCanonicalStateRuntimeContext | null;
    dto: CompileCustomerServiceSimulationDto;
    understanding: CustomerServiceMessageUnderstanding;
    user: CurrentUserPayload;
  }): Promise<CustomerServiceCanonicalProjectionResult> {
    const context = input.runtimeContext;
    if (!context) return emptyProjection('NOT_CANONICAL');
    const tenantId = resolveRequiredTenantId(input.user);
    const evidence = context.evidence;
    if (!evidence) {
      return {
        status: 'NO_EVIDENCE',
        dialogueConversationId: context.dialogueConversationId,
        revision: context.revision,
        stateHash: context.stateHash,
        evidenceMessageId: null,
        rebuildRequired: context.rebuildRequired,
      };
    }
    const row = await this.repository.findState(tenantId, context.dialogueConversationId);
    if (!row) return emptyProjection('NOT_CANONICAL');
    if (isEventCovered(row, evidence)) {
      // Never rewrite feedback for an older customer after another event arrived.
      if (row.rebuildRequired || row.lastProcessedSortKey !== evidence.sortKey) {
        return projectionFromRow('ALREADY_APPLIED', row, evidence.id);
      }
      const previous = alignPayloadRevision(row);
      const reconciled = reconcileCustomerServiceCurrentFeedback(previous, input.understanding.humanContext.dialogueObligation);
      if (stableJsonHash(reconciled) === stableJsonHash(previous)) return projectionFromRow('ALREADY_APPLIED', row, evidence.id);
      reconciled.revision = Number(row.revision || 0) + 1;
      const stateHash = stableJsonHash(reconciled);
      const applied = await this.repository.updateStateCas({
        id: row.id, tenantId, expectedRevision: Number(row.revision || 0),
        stateSchemaVersion: reconciled.schemaVersion, stateHash,
        statePayload: reconciled as unknown as Prisma.InputJsonValue,
        payloadBytes: Buffer.byteLength(JSON.stringify(reconciled), 'utf8'),
        evidence, recentProcessedMessageIds: normalizeIds(row.recentProcessedMessageIds),
        sourceConversationIds: row.sourceConversationIds?.length ? row.sourceConversationIds : [context.dialogueConversationId],
      });
      if (applied) return { status: 'APPLIED', dialogueConversationId: row.dialogueConversationId,
        revision: reconciled.revision, stateHash, evidenceMessageId: evidence.id, rebuildRequired: false };
      const winner = await this.repository.findState(tenantId, context.dialogueConversationId);
      return winner ? projectionFromRow('CONFLICT', winner, evidence.id) : emptyProjection('CONFLICT');
    }
    return this.applyCustomerProjection({
      row,
      evidence,
      dto: input.dto,
      understanding: input.understanding,
      tenantId,
      sourceConversationIds: row.sourceConversationIds?.length
        ? row.sourceConversationIds
        : [context.dialogueConversationId],
    });
  }

  private async applyCustomerProjection(input: {
    row: CustomerServiceCanonicalConversationStateRow;
    evidence: CustomerServiceCanonicalMessageEvidence;
    dto: CompileCustomerServiceSimulationDto;
    understanding: CustomerServiceMessageUnderstanding;
    tenantId: string;
    sourceConversationIds: string[];
  }): Promise<CustomerServiceCanonicalProjectionResult> {
    const latest = await this.repository.findState(input.tenantId, input.row.dialogueConversationId);
    if (!latest) return emptyProjection('NOT_CANONICAL');
    if (isEventCovered(latest, input.evidence)) {
      return projectionFromRow('ALREADY_APPLIED', latest, input.evidence.id);
    }
    if (latest.rebuildRequired) {
      return { ...projectionFromRow('OUT_OF_ORDER', latest, input.evidence.id), rebuildRequired: true };
    }
    if (latest.lastProcessedSortKey && input.evidence.sortKey <= latest.lastProcessedSortKey) {
      await this.repository.markRebuildRequired(
        latest.id,
        input.tenantId,
        'OUT_OF_ORDER_EVENT',
        input.sourceConversationIds,
      );
      this.logger.warn(
        `Canonical State 检测到乱序/历史补录事件，标记待重建而不重复投影：conversation=${latest.dialogueConversationId} message=${input.evidence.id}`,
      );
      return { ...projectionFromRow('OUT_OF_ORDER', latest, input.evidence.id), rebuildRequired: true };
    }

    const previousState = alignPayloadRevision(latest);
    const nextState = reduceCustomerServiceConversationState({
      previous: previousState,
      dto: {
        ...input.dto,
        conversationState: previousState as unknown as Record<string, unknown>,
        stateRevision: Number(latest.revision || 0),
      },
      understanding: input.understanding,
      assistantDraft: null,
      evidenceMessageIds: [input.evidence.id],
    });
    nextState.revision = Number(latest.revision || 0) + 1;
    const stateHash = stableJsonHash(nextState);
    const recentProcessedMessageIds = normalizeIds([
      ...normalizeIds(latest.recentProcessedMessageIds),
      input.evidence.id,
    ]).slice(-MAX_RECENT_PROCESSED_MESSAGE_IDS);
    const applied = await this.repository.updateStateCas({
      id: latest.id,
      tenantId: input.tenantId,
      expectedRevision: Number(latest.revision || 0),
      stateSchemaVersion: nextState.schemaVersion,
      stateHash,
      statePayload: nextState as unknown as Prisma.InputJsonValue,
      payloadBytes: Buffer.byteLength(JSON.stringify(nextState), 'utf8'),
      evidence: input.evidence,
      recentProcessedMessageIds,
      sourceConversationIds: input.sourceConversationIds,
    });
    if (applied) {
      return {
        status: 'APPLIED',
        dialogueConversationId: latest.dialogueConversationId,
        revision: nextState.revision,
        stateHash,
        evidenceMessageId: input.evidence.id,
        rebuildRequired: false,
      };
    }
    const winner = await this.repository.findState(input.tenantId, latest.dialogueConversationId);
    if (winner && isEventCovered(winner, input.evidence)) {
      return projectionFromRow('ALREADY_APPLIED', winner, input.evidence.id);
    }
    return winner ? projectionFromRow('CONFLICT', winner, input.evidence.id) : emptyProjection('CONFLICT');
  }

  private async rebuildFromEvents(input: {
    row: CustomerServiceCanonicalConversationStateRow;
    events: CustomerServiceCanonicalDialogueEvent[];
    tenantId: string;
    sourceConversationIds: string[];
    reason: string;
  }): Promise<CustomerServiceCanonicalLifecycleResult> {
    let state = emptyCustomerServiceConversationStateV2();
    let customerEventCount = 0;
    let assistantEventCount = 0;
    const assistantBehaviorContexts = await this.loadAssistantBehaviorContexts(input.tenantId, input.events);
    for (let index = 0; index < input.events.length; index += 1) {
      const event = input.events[index];
      if (event.senderRole === 'user') {
        const dto = lifecycleDto({
          message: event.textContent,
          previousState: state,
          conversationHistory: historyBefore(input.events, index),
          dialogueConversationId: input.row.dialogueConversationId,
        });
        const understanding = this.understandingService.understand(dto);
        state = reduceCustomerServiceConversationState({
          previous: state,
          dto,
          understanding,
          assistantDraft: null,
          evidenceMessageIds: [event.id],
        });
        customerEventCount += 1;
      } else {
        const behaviorContext = resolveAssistantBehaviorContext(event, assistantBehaviorContexts);
        const priorEvent = input.events[index - 1];
        if (priorEvent?.senderRole === 'user' && behaviorContext?.finalFeedback
          && behaviorContext.customerEvidenceMessageId === priorEvent.id) {
          state = reconcileCustomerServiceCurrentFeedback(state, behaviorContext.finalFeedback);
        }
        state = reduceCustomerServiceObservedAssistantAction({
          previous: state,
          assistantText: event.textContent,
          evidenceMessageIds: [event.id],
          replyAttemptId: behaviorContext?.replyAttemptId || event.replyAttemptId,
          replyTraceId: behaviorContext?.id || event.replyTraceId,
          behaviorPlan: behaviorContext?.behaviorPlan,
          interactionPlanV2: behaviorContext?.interactionPlanV2,
          planFulfillment: behaviorContext?.planFulfillment,
          realizedGroundingRefs: behaviorContext?.realizedGroundingRefs,
          provenGroundedUnits: behaviorContext?.provenGroundedUnits,
        });
        assistantEventCount += 1;
      }
    }
    const nextRevision = Number(input.row.revision || 0) + 1;
    state.revision = nextRevision;
    const stateHash = stableJsonHash(state);
    const lastEvent = input.events.at(-1) || null;
    const applied = await this.repository.replaceStateCas({
      id: input.row.id,
      tenantId: input.tenantId,
      expectedRevision: Number(input.row.revision || 0),
      stateSchemaVersion: state.schemaVersion,
      stateHash,
      statePayload: state as unknown as Prisma.InputJsonValue,
      payloadBytes: Buffer.byteLength(JSON.stringify(state), 'utf8'),
      lastEvent,
      recentProcessedMessageIds: input.events.map((event) => event.id).slice(-MAX_RECENT_PROCESSED_MESSAGE_IDS),
      sourceConversationIds: input.sourceConversationIds,
      rebuildRequired: false,
      rebuiltAt: new Date(),
      rebuildReason: input.reason,
      resetLastEventCursor: !lastEvent,
    });
    if (!applied) {
      const winner = await this.repository.findState(input.tenantId, input.row.dialogueConversationId);
      return winner
        ? lifecycleFromRow('CONFLICT', winner, 0, 0, 0, input.sourceConversationIds, 'CAS_CONFLICT')
        : emptyLifecycle('CONFLICT');
    }
    this.logger.log(
      `Canonical State 安全重建完成：conversation=${input.row.dialogueConversationId} events=${input.events.length} reason=${input.reason}`,
    );
    return {
      status: 'REBUILT',
      dialogueConversationId: input.row.dialogueConversationId,
      revision: nextRevision,
      stateHash,
      processedEventCount: input.events.length,
      customerEventCount,
      assistantEventCount,
      sourceConversationIds: input.sourceConversationIds,
      rebuildRequired: false,
      rebuildReason: input.reason,
    };
  }

  private async loadAssistantBehaviorContexts(tenantId: string, events: CustomerServiceCanonicalDialogueEvent[]) {
    const assistantEvents = events.filter((event) => event.senderRole === 'account');
    if (!assistantEvents.length) return emptyAssistantBehaviorContextMaps();
    try {
      const rows = await this.repository.findReplyBehaviorContexts({
        tenantId,
        replyTraceIds: assistantEvents.map((event) => event.replyTraceId).filter(Boolean),
        replyAttemptIds: assistantEvents.map((event) => event.replyAttemptId).filter(Boolean),
      });
      const contexts = rows.map((row) => {
        const planFulfillment = resolveCustomerServicePlanFulfillmentFromReplyTrace({
          fallbackUsed: row.fallbackUsed,
          generationDetails: row.generationDetails,
          runtimeContract: row.runtimeContract,
        });
        const realizedGroundingRefs = extractCustomerServiceProvenGroundingRefsFromReplyTrace(row.generationDetails);
        const generationContext = asRecord(asRecord(row.runtimeContract).generationContext);
        const finalFeedback = asRecord(asRecord(generationContext.conversationState).latestFeedback);
        return {
          id: row.id,
          replyAttemptId: row.replyAttemptId,
          planFulfillment,
          realizedGroundingRefs,
          provenGroundedUnits: extractCustomerServiceProvenGroundedUnitsFromReplyTrace(row.generationDetails),
          customerEvidenceMessageId: generationContext.feedbackAuthority === 'FINAL_UNDERSTANDING_CURRENT_EVENT'
            ? String(generationContext.customerEvidenceMessageId || '') : '',
          finalFeedback: Array.isArray(finalFeedback.requestedDeltas) && typeof finalFeedback.userFeedback === 'string'
            ? finalFeedback as CustomerServiceMessageUnderstanding['humanContext']['dialogueObligation'] : null,
          behaviorPlan: planFulfillment === 'NOT_FULFILLED'
            ? null
            : extractCustomerServiceBehaviorPlanFromRuntimeContract(row.runtimeContract),
          interactionPlanV2: planFulfillment === 'NOT_FULFILLED'
            ? null
            : extractCustomerServiceInteractionPlanV2FromRuntimeContract(row.runtimeContract),
        };
      });
      const byTraceId = new Map<string, AssistantBehaviorContext>();
      const byAttemptId = new Map<string, AssistantBehaviorContext>();
      for (const item of contexts) {
        if (item.id && !byTraceId.has(item.id)) byTraceId.set(item.id, item);
        if (item.replyAttemptId && !byAttemptId.has(item.replyAttemptId)) byAttemptId.set(item.replyAttemptId, item);
      }
      return { byTraceId, byAttemptId };
    } catch (error) {
      this.logger.warn(`Canonical State 读取 Reply Trace 行为上下文失败，降级为已发送文本启发式：${error instanceof Error ? error.message : String(error)}`);
      return emptyAssistantBehaviorContextMaps();
    }
  }

  private async loadOrCreateState(input: {
    dialogueConversationId?: string | null;
    expectedRobotId?: string | null;
    user: CurrentUserPayload;
    sourceConversationIds?: string[];
  }): Promise<{ row: CustomerServiceCanonicalConversationStateRow; dialogueConversationId: string } | null> {
    const dialogueConversationId = String(input.dialogueConversationId || '').trim();
    if (!dialogueConversationId) return null;
    const tenantId = resolveRequiredTenantId(input.user);
    const conversation = await this.repository.findConversation(tenantId, dialogueConversationId);
    if (!conversation) throw new NotFoundException('Canonical dialogue conversation does not exist or is outside the current tenant');
    const expectedRobotId = String(input.expectedRobotId || '').trim();
    if (expectedRobotId && String(conversation.robotId) !== expectedRobotId) {
      throw new NotFoundException('Canonical dialogue conversation does not belong to the requested robot scope');
    }

    let row = await this.repository.findState(tenantId, dialogueConversationId);
    if (!row) {
      const initial = emptyCustomerServiceConversationStateV2();
      const stateHash = stableJsonHash(initial);
      try {
        row = await this.repository.createState({
          tenantId,
          robotId: String(conversation.robotId),
          dialogueConversationId,
          stateSchemaVersion: initial.schemaVersion,
          stateHash,
          statePayload: initial as unknown as Prisma.InputJsonValue,
          payloadBytes: Buffer.byteLength(JSON.stringify(initial), 'utf8'),
          sourceConversationIds: normalizeIds([dialogueConversationId, ...(input.sourceConversationIds ?? [])]),
        });
      } catch (error) {
        row = await this.repository.findState(tenantId, dialogueConversationId);
        if (!row) throw error;
      }
    }
    return { row, dialogueConversationId };
  }
}

function cleanAdminReason(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 400);
}

function runtimeContextFromRow(
  row: CustomerServiceCanonicalConversationStateRow,
  evidence: CustomerServiceCanonicalMessageEvidence | null,
  currentCustomerApplied: boolean,
): CustomerServiceCanonicalStateRuntimeContext {
  const state = alignPayloadRevision(row);
  return {
    rowId: row.id,
    dialogueConversationId: row.dialogueConversationId,
    robotId: String(row.robotId),
    revision: Number(row.revision || 0),
    stateHash: String(row.stateHash || stableJsonHash(state)),
    state,
    rebuildRequired: row.rebuildRequired === true,
    evidence,
    sourceConversationIds: normalizeIds(row.sourceConversationIds?.length ? row.sourceConversationIds : [row.dialogueConversationId]),
    currentCustomerApplied,
    lastRebuiltAt: row.lastRebuiltAt || null,
    lastRebuildReason: String(row.lastRebuildReason || ''),
  };
}

function lifecycleDto(input: {
  message: string;
  previousState: CustomerServiceConversationStateV2;
  conversationHistory: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  dialogueConversationId: string;
  base?: CompileCustomerServiceSimulationDto;
}): CompileCustomerServiceSimulationDto {
  return {
    merchantRoleId: input.base?.merchantRoleId || '__canonical_lifecycle__',
    ...input.base,
    message: String(input.message || input.base?.message || '').trim(),
    recognitionSessionId: input.base?.recognitionSessionId || input.dialogueConversationId,
    canonicalConversationId: input.dialogueConversationId,
    conversationHistory: input.conversationHistory.slice(-MAX_REBUILD_HISTORY_MESSAGES),
    conversationState: input.previousState as unknown as Record<string, unknown>,
    stateRevision: input.previousState.revision,
  };
}

function historyBefore(events: CustomerServiceCanonicalDialogueEvent[], index: number) {
  return events
    .slice(Math.max(0, index - MAX_REBUILD_HISTORY_MESSAGES), index)
    .map((event) => ({
      role: event.senderRole === 'account' ? 'ASSISTANT' as const : 'CUSTOMER' as const,
      content: event.textContent,
    }))
    .filter((item) => Boolean(item.content));
}

type AssistantBehaviorContext = {
  id: string;
  replyAttemptId: string;
  behaviorPlan: ReturnType<typeof extractCustomerServiceBehaviorPlanFromRuntimeContract>;
  interactionPlanV2: ReturnType<typeof extractCustomerServiceInteractionPlanV2FromRuntimeContract>;
  planFulfillment: 'FULFILLED' | 'NOT_FULFILLED' | 'UNKNOWN';
  realizedGroundingRefs: string[];
  provenGroundedUnits: ReturnType<typeof extractCustomerServiceProvenGroundedUnitsFromReplyTrace>;
  customerEvidenceMessageId: string;
  finalFeedback: CustomerServiceMessageUnderstanding['humanContext']['dialogueObligation'] | null;
};

type AssistantBehaviorContextMaps = {
  byTraceId: Map<string, AssistantBehaviorContext>;
  byAttemptId: Map<string, AssistantBehaviorContext>;
};

function emptyAssistantBehaviorContextMaps(): AssistantBehaviorContextMaps {
  return { byTraceId: new Map(), byAttemptId: new Map() };
}

function resolveAssistantBehaviorContext(
  event: CustomerServiceCanonicalDialogueEvent,
  contexts: AssistantBehaviorContextMaps,
) {
  return (event.replyTraceId ? contexts.byTraceId.get(event.replyTraceId) : undefined)
    ?? (event.replyAttemptId ? contexts.byAttemptId.get(event.replyAttemptId) : undefined)
    ?? null;
}

function normalizeEvents(events: CustomerServiceCanonicalDialogueEvent[], sourceConversationIds: string[]) {
  const allowedConversationIds = new Set(sourceConversationIds);
  const seen = new Set<string>();
  return (events ?? [])
    .filter((event) => (
      event
      && Boolean(event.id)
      && Boolean(event.textContent?.trim())
      && (event.senderRole === 'user' || event.senderRole === 'account')
      && (!allowedConversationIds.size || allowedConversationIds.has(event.conversationId))
    ))
    .map((event) => ({ ...event, textContent: event.textContent.trim() }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey) || left.id.localeCompare(right.id))
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
}

function isEventCovered(row: CustomerServiceCanonicalConversationStateRow, event: CustomerServiceCanonicalDialogueEvent) {
  if (row.rebuildRequired) return false;
  const recent = normalizeIds(row.recentProcessedMessageIds);
  // A sort cursor proves ordering, not identity. An unseen historical/backfilled
  // message at or before the cursor must trigger rebuild rather than be assumed
  // to have been projected. Exact authoritative DialogueMessage IDs are the
  // idempotency proof.
  return recent.includes(event.id) || row.lastProcessedMessageId === event.id;
}

function alignPayloadRevision(row: CustomerServiceCanonicalConversationStateRow) {
  const state = readCustomerServiceConversationStateV2(row.statePayload);
  state.revision = Number(row.revision || 0);
  return state;
}

function projectionFromRow(
  status: CustomerServiceCanonicalProjectionResult['status'],
  row: CustomerServiceCanonicalConversationStateRow,
  evidenceMessageId: string | null,
): CustomerServiceCanonicalProjectionResult {
  return {
    status,
    dialogueConversationId: row.dialogueConversationId,
    revision: Number(row.revision || 0),
    stateHash: String(row.stateHash || ''),
    evidenceMessageId,
    rebuildRequired: row.rebuildRequired === true,
  };
}

function lifecycleFromRow(
  status: CustomerServiceCanonicalLifecycleResult['status'],
  row: CustomerServiceCanonicalConversationStateRow,
  processedEventCount: number,
  customerEventCount: number,
  assistantEventCount: number,
  sourceConversationIds: string[],
  rebuildReason: string,
): CustomerServiceCanonicalLifecycleResult {
  return {
    status,
    dialogueConversationId: row.dialogueConversationId,
    revision: Number(row.revision || 0),
    stateHash: String(row.stateHash || ''),
    processedEventCount,
    customerEventCount,
    assistantEventCount,
    sourceConversationIds,
    rebuildRequired: row.rebuildRequired === true,
    rebuildReason,
  };
}

function emptyProjection(status: CustomerServiceCanonicalProjectionResult['status']): CustomerServiceCanonicalProjectionResult {
  return {
    status,
    dialogueConversationId: null,
    revision: null,
    stateHash: null,
    evidenceMessageId: null,
    rebuildRequired: false,
  };
}

function emptyLifecycle(status: CustomerServiceCanonicalLifecycleResult['status']): CustomerServiceCanonicalLifecycleResult {
  return {
    status,
    dialogueConversationId: null,
    revision: null,
    stateHash: null,
    processedEventCount: 0,
    customerEventCount: 0,
    assistantEventCount: 0,
    sourceConversationIds: [],
    rebuildRequired: false,
    rebuildReason: '',
  };
}

function normalizeIds(value: unknown) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
