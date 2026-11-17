import { Injectable, Logger } from '@nestjs/common';
import type { CustomerServiceDeterministicReplyPlan } from '../compiler/customer-service-deterministic-response-compiler.service';
import type { CustomerServiceOrchestrationPlan } from '../planning/customer-service-reply-planner.service';
import type { CustomerServiceConversationStateSummary } from '../state/customer-service-conversation-state.type';
import type { CustomerServiceMessageUnderstanding } from '../understanding/types/customer-service-message-understanding.type';
import { selectCustomerServiceBusinessFactGroundingEntries, type CustomerServiceSelectedKnowledgeEntry } from '../../shared/context/customer-service-knowledge.util';
import type { CustomerServiceOpeningReceptionContext } from '../../shared/context/customer-service-opening-reception.util';
import {
  mapCustomerServiceLegacyActs,
  type CustomerServiceLegacyActMapping,
} from './customer-service-legacy-act-adapter';
import { CustomerServiceInteractionTypeResolver } from './customer-service-interaction-type.resolver';
import { resolveCustomerServiceAnswerObligation } from './customer-service-answer-obligation';
import { resolveCustomerServiceCriticalIntent } from './customer-service-critical-intent.util';
import type { CustomerServiceGuidelineResolutionSet, CustomerServiceGuidelineResolvedDecision } from '../guideline/customer-service-guideline.type';
import type {
  CustomerServiceActType,
  CustomerServiceAnswerFocusKind,
  CustomerServiceCompletionCondition,
  CustomerServiceGroundingRequirement,
  CustomerServiceInteractionPlanV2,
  CustomerServicePlannedAct,
  CustomerServicePolicySourceRef,
  CustomerServiceSuppressedAct,
} from './customer-service-interaction-plan.type';

const CHOICE_PRIORITIZATION_DECISION_PURPOSE = [
  '如果当前已选 value Act 的实际答案需要同时处理多个可行候选、方向或方案，必须基于当前已知条件形成真实取舍；条件足以区分时，让更合适的方向自然优先，不把存在实质劣势的候选平级铺开',
  '候选若存在会改变选择的 material trade-off，在第一次把它作为可行方向提供时就自然体现该代价',
  '只有当前条件确实不足以区分、候选近似并列，或客户明确要求比较/列举时，才保持并列展开',
  '纯事实、单一结论或当前回答并不需要候选选择时，不额外制造候选、伪排序、固定选项数、固定 rank label 或固定输出结构',
].join('；');

const GENERAL_DOMAIN_JUDGMENT_BOUNDARY_PURPOSE = [
  '一般领域帮助可以解释可靠原则、关键影响因素和有条件的趋势判断，不必停留在无法确定或只罗列待查因素；条件充分时直接给出对当前任务有用的判断',
  '结论强度必须与依据相称：已确认的前提可用于解释，尚未确认的前提只能保留为条件，不能默认为当前商品或客户已经满足；不得把一般条件关系登记成该商品已验证的性能、体感或保证',
  '可能、通常、预计等概率措辞不能洗白未知商品属性、材质、商家政策、订单或物流状态，也不能凭空补造概率、时长或个人结果；缺少可靠推断依据时给相关核对路径',
  '公共常识不等于实时联网结果；没有实际检索证据时不得声称已查过网络或商家系统',
].join('；');

@Injectable()
export class CustomerServiceInteractionPlanCompiler {
  private readonly logger = new Logger(CustomerServiceInteractionPlanCompiler.name);

  constructor(private readonly interactionTypeResolver: CustomerServiceInteractionTypeResolver) {}

  compileShadow(input: {
    understanding: CustomerServiceMessageUnderstanding;
    plan: CustomerServiceOrchestrationPlan;
    deterministic: CustomerServiceDeterministicReplyPlan;
    conversationState: CustomerServiceConversationStateSummary;
    knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
    variables?: Record<string, unknown>;
    latestCustomerMessage?: string;
    openingReception?: CustomerServiceOpeningReceptionContext;
    conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  }): CustomerServiceInteractionPlanV2 | null {
    try {
      return this.compile(input);
    } catch (error) {
      this.logger.warn(`HVE-1 Shadow InteractionPlan 编译失败，保持旧 Runtime 不变：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  applyGuidelineResolutionShadow(
    legacyPlan: CustomerServiceInteractionPlanV2,
    resolution: CustomerServiceGuidelineResolutionSet,
  ): CustomerServiceInteractionPlanV2 {
    const touchedActs = new Set<CustomerServiceActType>();
    for (const decision of resolution.decisions) {
      const action = decision.action;
      if ('act' in action && action.act) touchedActs.add(action.act);
    }

    // HVE-2 No Parallel Policy Gate: for an act already governed by Guideline, remove only
    // LEGACY_POLICY provenance. Planner/Understanding/State/ResponseAsset facts remain authoritative.
    const acts = legacyPlan.acts
      .map((act) => touchedActs.has(act.type) ? { ...act, sources: act.sources.filter((source) => source.kind !== 'LEGACY_POLICY') } : { ...act, sources: [...act.sources] })
      .filter((act) => act.sources.length > 0);
    const suppressedActs = legacyPlan.suppressedActs
      .map((item) => touchedActs.has(item.type) ? { ...item, sources: item.sources.filter((source) => source.kind !== 'LEGACY_POLICY') } : { ...item, sources: [...item.sources] })
      .filter((item) => item.sources.length > 0);
    const grounding = legacyPlan.grounding.requirements.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] }));
    let completion = {
      ...legacyPlan.completion,
      conditions: legacyPlan.completion.conditions.map((item) => ({ ...item })),
    };
    const realizationPreferences = { ...legacyPlan.realizationPreferences };
    const skipped: Array<{ guidelineId: string; op: string; act?: CustomerServiceActType; reasonCode: string }> = [];

    for (const decision of resolution.decisions) {
      const action = decision.action;
      const guidelineSource: CustomerServicePolicySourceRef[] = [{ kind: 'GUIDELINE', refId: decision.guidelineId, version: decision.versionId }];
      if (action.op === 'REQUIRE_ACT') {
        const hardSuppression = suppressedActs.find((item) => item.type === action.act && item.enforcement === 'HARD');
        const protectedSuppression = Boolean(hardSuppression?.sources.some((source) => ['PLANNER', 'UNDERSTANDING', 'STATE', 'RESPONSE_ASSET'].includes(source.kind)));
        const softGuidelineRequire = action.enforcement === 'SOFT' || (action.necessity || 'REQUIRED') !== 'REQUIRED';
        if (protectedSuppression || (hardSuppression && softGuidelineRequire)) {
          skipped.push({
            guidelineId: decision.guidelineId,
            op: action.op,
            act: action.act,
            reasonCode: protectedSuppression ? 'SYSTEM_OR_BUSINESS_SUPPRESSION_OUTRANKS_GUIDELINE' : 'GUIDELINE_HARD_SUPPRESSION_OUTRANKS_SOFT_REQUIRE',
          });
          continue;
        }
        addAct(acts, {
          type: action.act,
          necessity: action.necessity || 'REQUIRED',
          priority: action.priority ?? decision.guidelinePriority,
          reasonCode: `GUIDELINE:${decision.code}:REQUIRE`,
          sources: guidelineSource,
          trackingKey: action.trackingKey,
          dependsOnActIds: resolveTrackingDependencies(acts, action.dependsOnTrackingKeys || []),
          parameters: action.parameters ? { ...action.parameters, known: action.parameters.known ? [...action.parameters.known] : undefined, missing: action.parameters.missing ? [...action.parameters.missing] : undefined } : undefined,
        });
        continue;
      }
      if (action.op === 'SUPPRESS_ACT') {
        // Stage 2E Authority Hardness closure: Guideline suppression is planning guidance,
        // never an independent send-veto authority. Explicit customer dialogue boundaries
        // are re-projected as HARD below from the lifecycle-aware Dialogue Obligation;
        // fact/capability truth is owned by Claim/Capability authorities.
        const enforcement: CustomerServiceSuppressedAct['enforcement'] = 'SOFT';
        addSuppressed(suppressedActs, {
          type: action.act,
          enforcement,
          priority: action.priority ?? decision.guidelinePriority,
          reasonCode: `GUIDELINE:${decision.code}:SUPPRESS`,
          sources: guidelineSource,
        });
        continue;
      }
      if (action.op === 'PRIORITIZE_ACT') {
        const target = acts.find((act) => act.type === action.act);
        if (target) {
          target.priority = Math.max(target.priority, action.priority);
          target.sources = dedupeSources([...target.sources, ...guidelineSource]);
        } else {
          skipped.push({ guidelineId: decision.guidelineId, op: action.op, act: action.act, reasonCode: 'ACT_NOT_PRESENT' });
        }
        continue;
      }
      if (action.op === 'SET_COMPLETION') {
        completion = {
          mode: action.mode,
          conditions: (action.conditions?.length ? action.conditions : completion.conditions).map((item) => ({ ...item })),
          allowOptionalContinuation: action.allowOptionalContinuation ?? completion.allowOptionalContinuation,
        };
        continue;
      }
      if (action.op === 'REQUIRE_GROUNDING') {
        grounding.push({ ...action.requirement, evidenceRefs: [...action.requirement.evidenceRefs] });
        continue;
      }
      if (action.op === 'SET_REALIZATION_PREFERENCE') {
        (realizationPreferences as Record<string, unknown>)[action.key] = action.value;
        continue;
      }
      if (action.op === 'REQUEST_HANDOFF') {
        addAct(acts, { type: 'REQUEST_HANDOFF', necessity: 'REQUIRED', priority: 1000, reasonCode: action.reasonCode || `GUIDELINE:${decision.code}:HANDOFF`, sources: guidelineSource, trackingKey: 'handoff.requested' });
        completion = { mode: 'HANDOFF', conditions: [{ type: 'HANDOFF_REQUIRED' }], allowOptionalContinuation: false };
        continue;
      }
      if (action.op === 'USE_RESPONSE_ASSET') {
        grounding.push({ source: 'RESPONSE_ASSET', key: `${action.assetId}:${action.versionId}`, requirement: 'REQUIRED', status: 'SATISFIED', evidenceRefs: [action.versionId] });
      }
    }

    alignCustomerServiceCanonicalActsWithAnswerTarget(
      acts,
      suppressedActs,
      legacyPlan.answerObligation,
    );

    // A HARD suppression is the existing final prohibition authority for an Act.
    // Never carry the same Act as both selected and prohibited into Role policy or
    // Generation. SOFT suppressions remain discretionary evidence and may still be
    // retained when the final Canonical policy explicitly keeps the Act.
    removeHardSuppressedCanonicalActs(acts, suppressedActs);
    coalesceSingletonCanonicalActs(acts, ['PRESENCE_ACK', 'OPEN_SERVICE_INVITATION']);

    // V1.9 Correction plan consistency: Greeting / Role Confirmation may leave the
    // legacy STOP boundary only when the same final canonical plan still contains the
    // authorized service-entry Act. A higher Hard/Safety/Boundary suppression may remove
    // that Act after the Role posture branch matched; never leave an empty
    // ALLOW_CONTINUATION shell behind.
    if (['SOCIAL_GREETING', 'ROLE_CONFIRMATION'].includes(legacyPlan.interactionType)
      && legacyPlan.completion.mode === 'STOP_AFTER_REQUIRED'
      && completion.mode !== 'STOP_AFTER_REQUIRED'
      && !acts.some((item) => item.type === 'OPEN_SERVICE_INVITATION')) {
      completion = {
        ...legacyPlan.completion,
        conditions: legacyPlan.completion.conditions.map((item) => ({ ...item })),
      };
    }

    completion = synchronizeCanonicalCompletionBoundary(acts, completion);

    return {
      ...legacyPlan,
      policyMode: 'GUIDELINE_SHADOW',
      acts: acts.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)),
      suppressedActs: dedupeSuppressed(suppressedActs).sort((a, b) => b.priority - a.priority || a.type.localeCompare(b.type)),
      grounding: { ...legacyPlan.grounding, requirements: dedupeGrounding(grounding) },
      completion,
      realizationPreferences,
      sources: dedupeSources([
        ...legacyPlan.sources,
        ...resolution.decisions.map((item) => ({ kind: 'GUIDELINE' as const, refId: item.guidelineId, version: item.versionId })),
      ]),
      diagnostics: {
        ...legacyPlan.diagnostics,
        guidelinePolicy: {
          resolutionHash: resolution.resolutionHash,
          guidelineVersionIds: [...resolution.guidelineVersionIds],
          appliedDecisionCount: resolution.decisions.length,
          conflictCount: resolution.conflicts.length,
          hasUnresolvedHardConflict: resolution.hasUnresolvedHardConflict,
        },
        guidelineSkippedDecisions: skipped,
      },
    };
  }

  private compile(input: {
    understanding: CustomerServiceMessageUnderstanding;
    plan: CustomerServiceOrchestrationPlan;
    deterministic: CustomerServiceDeterministicReplyPlan;
    conversationState: CustomerServiceConversationStateSummary;
    knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
    variables?: Record<string, unknown>;
    latestCustomerMessage?: string;
    openingReception?: CustomerServiceOpeningReceptionContext;
    conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  }): CustomerServiceInteractionPlanV2 {
    const responseMappings = mapCustomerServiceLegacyActs('RESPONSE_ACT', input.understanding.humanContext.requiredResponseActs);
    // Prior assistant prose is not a current-turn semantic Authority. Historical
    // surface move labels are retained for diagnostics only; Canonical Acts for the
    // current turn must come from typed Understanding / current planning, never from
    // reparsing the previous assistant's wording.
    const moveMappings: ReturnType<typeof mapCustomerServiceLegacyActs> = [];
    const microMappings = mapCustomerServiceLegacyActs('MICRO_ACTION', input.plan.microActions || []);
    const allMappings = dedupeMappings([
      ...responseMappings,
      ...moveMappings,
      ...microMappings,
    ]);

    const interactionType = this.interactionTypeResolver.resolve({
      understanding: input.understanding,
      plan: input.plan,
      knowledgeAvailable: input.knowledgeEntries.length > 0,
      latestCustomerMessage: input.latestCustomerMessage,
    });
    const answerObligation = resolveCustomerServiceAnswerObligation({
      interactionType,
      latestCustomerMessage: input.latestCustomerMessage || '',
      conversationHistory: input.conversationHistory || [],
      conversationState: input.conversationState,
      knowledgeEntries: input.knowledgeEntries,
      understanding: input.understanding,
    });
    const sources = collectPlanSources(input);
    const acts: CustomerServicePlannedAct[] = [];
    const suppressedActs: CustomerServiceSuppressedAct[] = [];
    const grounding: CustomerServiceGroundingRequirement[] = [];
    const conversationalClosure = answerObligation.responseTarget.focus === 'CONVERSATIONAL_CLOSURE';

    // H0.2-A Human Realization authority convergence:
    // RESPONSE_ACT entries that describe *how to sound human* (warm contact,
    // acknowledgement, relief, listening-space, low-pressure continuation) are
    // explicitly unmapped by the adapter and remain diagnostics only. Only response
    // acts with an actual semantic obligation (for example DIRECT_ANSWER / practical
    // guidance / explicit STOP boundary) may still bridge into Canonical Acts.
    const businessFactGroundingRequired = answerObligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED';
    const canonicalResponseMappings = responseMappings.filter((item) => item.canonical
      // The Answer Obligation owns current-business fact semantics. Its grounded
      // or boundary Act is already the direct answer; the legacy Understanding
      // RESPONSE_ACT adapter must not create a second DIRECT_ANSWER owner.
      && !(businessFactGroundingRequired && item.canonical === 'DIRECT_ANSWER'));
    // A structured close owns the current Turn Need. Legacy RESPONSE_ACT projection may
    // still describe the previous/service context, but it cannot replay DIRECT_ANSWER /
    // PRACTICAL_NEXT_STEP into a turn whose Canonical Response Target is only closure.
    if (!conversationalClosure) {
      for (const mapping of canonicalResponseMappings) {
        addAct(acts, {
          type: mapping.canonical!, necessity: 'REQUIRED', priority: 900,
          reasonCode: `UNDERSTANDING_RESPONSE_ACT:${mapping.legacy}`,
          sources: [{ kind: 'UNDERSTANDING', refId: mapping.legacy }],
        });
      }
    }
    // V1.9 Generic Human Participation authority purification:
    // HumanBehavior required/optional/forbidden Acts and Planner microActions are legacy
    // migration evidence only. They must not directly grant/suppress Canonical behavior.
    // Current authority is rebuilt below from Understanding/State/ResponseAsset plus the
    // single Unified Guideline policy. Keep all mappings in diagnostics for migration audit.


    // Closing an already-complete exchange must not be reopened by a stale/default
    // service-entry posture. This is omission of an old producer, not a new close Gate.
    if (!conversationalClosure) addOpeningServiceActs(input, interactionType, acts);
    addIdentityActs(acts, interactionType, input.understanding);
    addDeterministicActs(
      input.deterministic,
      acts,
      grounding,
      businessFactGroundingRequired,
    );
    if (!isDirectIdentityInteraction(interactionType)) addTaskActs(input.understanding, acts, grounding);
    attachKnowledgeEvidence(input.knowledgeEntries, grounding);
    addAnswerObligationActs(
      answerObligation,
      input.knowledgeEntries,
      acts,
      grounding,
      input.understanding,
    );
    addGroundingSuppressions(interactionType, input.knowledgeEntries, suppressedActs);
    addBehaviorMemorySuppressions(input, suppressedActs);
    addPlannerSuppressions(input.plan, suppressedActs);

    alignCustomerServiceCanonicalActsWithAnswerTarget(
      acts,
      suppressedActs,
      answerObligation,
    );

    removeHardSuppressedCanonicalActs(acts, suppressedActs);
    enrichActParameters(acts, input.understanding, interactionType, input.knowledgeEntries, input.plan, input.openingReception, answerObligation);
    let completion = buildCompletion(input, acts, interactionType);
    completion = synchronizeCanonicalCompletionBoundary(acts, completion);
    // V1.4: HVE Candidate realization no longer inherits C6 ExpressionPlan v1.
    // Guideline decisions may still override specific realization keys later, but the
    // canonical base is neutral and high-level account/store preferences are projected
    // in the NLG layer.
    return {
      schemaVersion: 2,
      shadow: true,
      policyMode: 'LEGACY_SHADOW',
      interactionType,
      goal: {
        // R0: Canonical/NLG primary goal is the final current-turn semantic goal.
        // Scenario/configured serviceGoal remains planner context, but must not
        // outrank the already-resolved current customer operation in generation.
        primary: input.plan.dominantTurnGoal?.responseRequirement || input.plan.dominantTurnGoal?.key || input.plan.serviceGoal || '完成当前客户请求',
        secondary: uniqueStrings([
          input.plan.businessGoal,
          input.plan.humanityGoal,
          ...(input.plan.requiredTurnGoals || []).map((item) => item.responseRequirement || item.key),
        ]).slice(0, 8),
      },
      acts: acts.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)),
      suppressedActs: dedupeSuppressed(suppressedActs).sort((a, b) => b.priority - a.priority || a.type.localeCompare(b.type)),
      grounding: {
        requirements: dedupeGrounding(grounding),
        prohibitedUnknownFacts: collectProhibitedUnknownFacts(input.conversationState),
      },
      completion,
      answerObligation,
      behaviorContext: {
        relationshipStage: input.understanding.humanContext.relationshipState || input.conversationState.canonicalFields.relationship.value || null,
        // Behavior memory may influence realization only through structured observed
        // behavior. `strategyKey` is a diagnostic surface summary and is intentionally
        // excluded from current-turn behavior control.
        recentMoveKeys: uniqueStrings(input.conversationState.recentAssistantMoves.slice(-6).map((item) => item.behavior?.structureKey)).slice(-12),
        requestedDeltas: input.conversationState.behaviorHistory.recentRequestedDeltas || [],
        activeTaskKey: input.conversationState.activeTask?.id || null,
      },
      realizationPreferences: {
        density: 'AUTO',
        toneProfile: null,
        colloquiality: 'AUTO',
        segmentation: 'AUTO',
        emoji: 'AUTO',
      },
      sources,
      diagnostics: {
        legacyMappings: allMappings,
        unmappedLegacyActs: allMappings.filter((item) => item.status === 'NO_CANONICAL_MAPPING').map((item) => `${item.source}:${item.legacy}`),
        legacyAuthority: {
          mode: 'MIGRATION_HINT_ONLY',
          demotedResponseActs: responseMappings
            .filter((item) => !item.canonical)
            .map((item) => `${item.legacy}:${item.canonical || 'NONE'}`),
          // HumanBehavior ExpressionPlan is retired from production compilation.
          demotedRequired: [],
          demotedOptional: [],
          demotedForbidden: [],
          demotedMicroActions: microMappings.map((item) => `${item.legacy}:${item.canonical || 'NONE'}`),
        },
      },
    };
  }
}

/**
 * Final Canonical current-target coherence normalization.
 *
 * The existing Answer Obligation is the single owner of the current response
 * target. A pure conversational close cannot simultaneously select a value,
 * question, identity, service-entry, task or handoff Act from a stale/parallel
 * producer. Record those contradictions through the existing HARD suppression
 * contract, then let the existing suppression normalizer remove the duplicate
 * selected view. No new planning or send authority is introduced.
 */
export function alignCustomerServiceCanonicalActsWithAnswerTarget(
  acts: CustomerServicePlannedAct[],
  suppressedActs: CustomerServiceSuppressedAct[],
  answerObligation: CustomerServiceInteractionPlanV2['answerObligation'] | null | undefined,
) {
  if (answerObligation?.responseTarget?.focus !== 'CONVERSATIONAL_CLOSURE') return;
  // REQUEST_HANDOFF is already a terminal execution obligation and remains
  // compatible with STOP-after-handoff; ordinary close must not demote it.
  const compatible = new Set<CustomerServiceActType>(['NATURAL_CLOSE', 'STOP', 'REQUEST_HANDOFF']);
  for (const act of acts) {
    if (compatible.has(act.type)) continue;
    addSuppressed(suppressedActs, {
      type: act.type,
      enforcement: 'HARD',
      priority: Math.max(2000, act.priority),
      reasonCode: 'ANSWER_OBLIGATION_CONVERSATIONAL_CLOSURE_EXCLUSIVE',
      sources: [{
        kind: 'UNDERSTANDING',
        refId: `answer-obligation:${answerObligation.responseTarget.focus}:${answerObligation.responseTarget.requiredDelta}`,
        version: String(answerObligation.responseTarget.confidence),
      }],
    });
  }
}

/**
 * Final Canonical coherence normalization, not a second policy layer.
 * Existing HARD suppressions already own prohibition; this only removes the
 * contradictory duplicate from the selected collection.
 */
function removeHardSuppressedCanonicalActs(
  acts: CustomerServicePlannedAct[],
  suppressedActs: CustomerServiceSuppressedAct[],
) {
  const hardSuppressedTypes = new Set(
    suppressedActs
      .filter((item) => item.enforcement === 'HARD')
      .map((item) => item.type),
  );
  if (!hardSuppressedTypes.size) return;
  for (let index = acts.length - 1; index >= 0; index -= 1) {
    if (hardSuppressedTypes.has(acts[index].type)) acts.splice(index, 1);
  }
}

/**
 * STOP and completion are two lossless views of the same existing Canonical
 * boundary. Keep them synchronized after base compilation and Guideline merge:
 * completion-derived STOP disappears when completion is changed away from stop;
 * an explicit required STOP keeps STOP_AFTER_REQUIRED; and a stop completion always
 * has one control Act for downstream projection.
 */
function synchronizeCanonicalCompletionBoundary(
  acts: CustomerServicePlannedAct[],
  completion: CustomerServiceInteractionPlanV2['completion'],
): CustomerServiceInteractionPlanV2['completion'] {
  if (completion.mode !== 'STOP_AFTER_REQUIRED') {
    for (let index = acts.length - 1; index >= 0; index -= 1) {
      if (acts[index].type === 'STOP' && acts[index].reasonCode === 'COMPLETION_STOP_AFTER_REQUIRED') {
        acts.splice(index, 1);
      }
    }
  }

  const explicitRequiredStop = acts.some((item) => item.type === 'STOP' && item.necessity === 'REQUIRED');
  const nonTerminalCompletionConflictsWithStop = ['ALLOW_CONTINUATION', 'WAIT_CUSTOMER'].includes(completion.mode);
  const normalizedCompletion: CustomerServiceInteractionPlanV2['completion'] = explicitRequiredStop
    && nonTerminalCompletionConflictsWithStop
    ? {
        mode: 'STOP_AFTER_REQUIRED',
        conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }, { type: 'NO_FURTHER_ACTS' }],
        allowOptionalContinuation: false,
      }
    : completion;

  if (normalizedCompletion.mode === 'STOP_AFTER_REQUIRED') {
    addAct(acts, {
      type: 'STOP',
      necessity: 'REQUIRED',
      priority: 300,
      reasonCode: 'COMPLETION_STOP_AFTER_REQUIRED',
      sources: [{ kind: 'PLANNER', refId: 'completion' }],
      dependsOnActIds: acts
        .filter((item) => item.necessity === 'REQUIRED' && item.type !== 'STOP')
        .map((item) => item.id),
    });
    coalesceSingletonCanonicalActs(acts, ['STOP']);
  }

  return normalizedCompletion;
}

function coalesceSingletonCanonicalActs(
  acts: CustomerServicePlannedAct[],
  singletonTypes: CustomerServiceActType[],
) {
  const singleton = new Set(singletonTypes);
  const replacements = new Map<string, string>();
  for (const type of singleton) {
    const matches = acts.filter((item) => item.type === type);
    if (matches.length <= 1) continue;
    const keeper = matches[0];
    for (const duplicate of matches.slice(1)) {
      if (necessityRank(duplicate.necessity) > necessityRank(keeper.necessity)) keeper.necessity = duplicate.necessity;
      keeper.priority = Math.max(keeper.priority, duplicate.priority);
      keeper.sources = dedupeSources([...keeper.sources, ...duplicate.sources]);
      keeper.grounding = dedupeGrounding([...(keeper.grounding || []), ...(duplicate.grounding || [])]);
      keeper.dependsOnActIds = uniqueStrings([...(keeper.dependsOnActIds || []), ...(duplicate.dependsOnActIds || [])]);
      if (!keeper.trackingKey && duplicate.trackingKey) keeper.trackingKey = duplicate.trackingKey;
      if (duplicate.parameters) {
        keeper.parameters = {
          ...(keeper.parameters || {}),
          ...duplicate.parameters,
          known: duplicate.parameters.known ? [...duplicate.parameters.known] : keeper.parameters?.known,
          missing: duplicate.parameters.missing ? [...duplicate.parameters.missing] : keeper.parameters?.missing,
        };
      }
      replacements.set(duplicate.id, keeper.id);
    }
    for (let index = acts.length - 1; index >= 0; index -= 1) {
      if (acts[index] !== keeper && acts[index].type === type) acts.splice(index, 1);
    }
  }
  if (!replacements.size) return;
  for (const act of acts) {
    if (!act.dependsOnActIds?.length) continue;
    act.dependsOnActIds = uniqueStrings(act.dependsOnActIds.map((id) => replacements.get(id) || id));
  }
}

function addOpeningServiceActs(
  input: {
    plan: CustomerServiceOrchestrationPlan;
    conversationState: CustomerServiceConversationStateSummary;
    openingReception?: CustomerServiceOpeningReceptionContext;
  },
  interactionType: CustomerServiceInteractionPlanV2['interactionType'],
  acts: CustomerServicePlannedAct[],
) {
  if (interactionType !== 'SOCIAL_GREETING') return;
  addAct(acts, {
    type: 'PRESENCE_ACK',
    necessity: 'REQUIRED',
    priority: 940,
    reasonCode: 'R4B_SOCIAL_GREETING_PRESENCE',
    sources: [{ kind: 'PLANNER', refId: 'r4b:opening-presence' }],
  });

  const opening = input.openingReception;
  if (!opening?.active || !input.plan.identityConstraint.businessAnchored) return;
  if (opening.greetingMode === 'ACK_ONLY' || opening.greetingMode === 'CUSTOM') return;

  const explicitlyLight = opening.greetingModeConfigured && opening.greetingMode === 'LIGHT_QUESTION';
  const defaultBusinessOpening = !opening.greetingModeConfigured
    && ['BUSINESS_SERVICE', 'AFTER_SALES', 'CONSULTANT'].includes(opening.receptionType);
  if (!explicitlyLight && !defaultBusinessOpening) return;

  addAct(acts, {
    type: 'OPEN_SERVICE_INVITATION',
    necessity: 'PREFERRED',
    priority: explicitlyLight ? 660 : 560,
    reasonCode: explicitlyLight ? 'R4B_CONFIGURED_OPEN_SERVICE_INVITATION' : 'R4B_DEFAULT_BUSINESS_OPEN_SERVICE_INVITATION',
    sources: [{ kind: 'PLANNER', refId: explicitlyLight ? 'opening:light-question' : 'opening:business-default' }],
  });
}

function addIdentityActs(
  acts: CustomerServicePlannedAct[],
  interactionType: CustomerServiceInteractionPlanV2['interactionType'],
  understanding: CustomerServiceMessageUnderstanding,
) {
  const critical = resolveCustomerServiceCriticalIntent(understanding);
  const identityType = critical.intent !== 'NONE' ? critical.intent : interactionType;
  if (!['AI_IDENTITY_QUERY', 'NAME_QUERY', 'ROLE_CONFIRMATION', 'SERVICE_SCOPE_QUERY'].includes(identityType)) return;

  // Identity behavior is derived from current canonical interaction semantics only.
  // Historical ExpressionPlan no longer participates in InteractionType or Act authority.
  const source: CustomerServicePolicySourceRef[] = critical.intent !== 'NONE'
    ? [{ kind: 'UNDERSTANDING', refId: `criticalIntent:${critical.intent}`, version: String(critical.confidence) }]
    : [{ kind: 'UNDERSTANDING', refId: `interactionType:${identityType}` }];
  if (identityType === 'AI_IDENTITY_QUERY') addAct(acts, { type: 'DISCLOSE_AI_IDENTITY', necessity: 'REQUIRED', priority: 1100, reasonCode: 'CANONICAL_INTERACTION_AI_IDENTITY', sources: source, trackingKey: 'identity.ai.disclosed' });
  else if (identityType === 'NAME_QUERY') addAct(acts, { type: 'DISCLOSE_NAME', necessity: 'REQUIRED', priority: 1060, reasonCode: 'CANONICAL_INTERACTION_NAME_QUERY', sources: source, trackingKey: 'identity.name.disclosed' });
  else if (identityType === 'ROLE_CONFIRMATION') addAct(acts, { type: 'CONFIRM_ROLE', necessity: 'REQUIRED', priority: 1060, reasonCode: 'CANONICAL_INTERACTION_ROLE_CONFIRMATION', sources: source, trackingKey: 'identity.role.confirmed' });
  else if (identityType === 'SERVICE_SCOPE_QUERY') addAct(acts, { type: 'EXPLAIN_SERVICE_SCOPE', necessity: 'REQUIRED', priority: 1040, reasonCode: 'CANONICAL_INTERACTION_SERVICE_SCOPE', sources: source, trackingKey: 'identity.service_scope.explained' });
}

function addDeterministicActs(
  deterministic: CustomerServiceDeterministicReplyPlan,
  acts: CustomerServicePlannedAct[],
  grounding: CustomerServiceGroundingRequirement[],
  businessFactAnswerObligationOwnsGeneratedValue = false,
) {
  for (const rule of deterministic.matchedRules) {
    const source: CustomerServicePolicySourceRef = { kind: 'RESPONSE_ASSET', refId: rule.responseAssetId, version: String(rule.versionNo) };
    grounding.push({ source: 'RESPONSE_ASSET', key: rule.responseAssetKey, requirement: 'REQUIRED', status: 'SATISFIED', evidenceRefs: [rule.versionId] });
    if (['EXACT_REPLY', 'TEMPLATE_REPLY'].includes(rule.responseType)) {
      addAct(acts, { type: 'DIRECT_ANSWER', necessity: 'REQUIRED', priority: 1000, reasonCode: `DETERMINISTIC_${rule.responseType}`, sources: [source], trackingKey: `asset:${rule.versionId}` });
    }
  }
  // REQUIRED_POINTS / REQUIRED_WORKFLOW constrain controlled generation; they
  // are not a second semantic owner for a current-business fact. The Answer
  // Obligation's EXPLAIN_GROUNDED_FACT or EXPLAIN_BOUNDARY Act owns that value.
  // Exact/template response assets remain independent deterministic answers.
  if (deterministic.requiredPoints.length && !businessFactAnswerObligationOwnsGeneratedValue) {
    addAct(acts, { type: 'DIRECT_ANSWER', necessity: 'REQUIRED', priority: 930, reasonCode: 'DETERMINISTIC_REQUIRED_POINTS', sources: deterministicSources(deterministic, 'REQUIRED_POINTS') });
  }
  if (deterministic.workflowSteps.length && !businessFactAnswerObligationOwnsGeneratedValue) {
    // REQUIRED_WORKFLOW is authoritative content/process guidance, not proof that
    // the runtime can execute an external service action. When no business-fact
    // Answer Obligation already owns the value, keep the workflow in the generation
    // brief and realize it through DIRECT_ANSWER rather than minting execution authority.
    addAct(acts, {
      type: 'DIRECT_ANSWER',
      necessity: deterministic.workflowSteps.some((step) => step.required) ? 'REQUIRED' : 'PREFERRED',
      priority: deterministic.workflowSteps.some((step) => step.required) ? 930 : 600,
      reasonCode: 'DETERMINISTIC_REQUIRED_WORKFLOW_CONTENT',
      sources: deterministicSources(deterministic, 'REQUIRED_WORKFLOW'),
    });
  }
  if (deterministic.templateReply?.missingVariables.length) {
    for (const key of deterministic.templateReply.missingVariables) {
      grounding.push({ source: 'RUNTIME_VARIABLE', key, requirement: 'REQUIRED', status: 'MISSING', evidenceRefs: [] });
    }
  }
}

function addTaskActs(
  understanding: CustomerServiceMessageUnderstanding,
  acts: CustomerServicePlannedAct[],
  grounding: CustomerServiceGroundingRequirement[],
) {
  const task = understanding.humanContext.conversationTaskState;
  const missingSlots = task.pendingSlots.filter((slot) => ['MISSING', 'REQUESTED'].includes(slot.status));
  for (const slot of missingSlots) {
    const requirement: CustomerServiceGroundingRequirement = {
      source: 'STATE', key: `slot:${slot.key}`, requirement: 'REQUIRED', status: slot.status === 'MISSING' ? 'MISSING' : 'UNKNOWN', evidenceRefs: slot.evidence || [],
    };
    grounding.push(requirement);
    addAct(acts, {
      type: 'REQUEST_REQUIRED_SLOT', necessity: 'REQUIRED', priority: 970,
      reasonCode: `TASK_REQUIRED_SLOT:${slot.key}`, sources: [{ kind: 'STATE', refId: `slot:${slot.key}` }],
      grounding: [requirement], trackingKey: `slot.requested:${slot.key}`,
    });
  }
  // H0.2-A / R1 structural ownership: emotion/scenario understanding remains useful
  // state, but it never creates a customer-visible acknowledgement Act by implication.
  // Any reception/relationship semantic contribution must already exist as a selected
  // Canonical Act; HumanTurn/Persona may only shape the expression of that selected WHAT.
}

function attachKnowledgeEvidence(
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
  grounding: CustomerServiceGroundingRequirement[],
) {
  // Architecture Convergence Phase 2: Knowledge is evidence, never behavior authority.
  // Retrieval alone cannot create RECOMMEND/FACT/STATUS Acts or make a turn harder
  // to answer. Canonical Answer Obligation decides Acts; only an authorized grounded
  // Act may promote the evidence it actually consumes to REQUIRED.
  for (const entry of knowledgeEntries.slice(0, 8)) {
    grounding.push({
      source: 'KNOWLEDGE',
      key: entry.id,
      requirement: 'OPTIONAL',
      status: 'SATISFIED',
      evidenceRefs: [entry.id],
    });
  }
}


function addAnswerObligationActs(
  obligation: NonNullable<CustomerServiceInteractionPlanV2['answerObligation']>,
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
  acts: CustomerServicePlannedAct[],
  grounding: CustomerServiceGroundingRequirement[],
  understanding: CustomerServiceMessageUnderstanding,
) {
  const target = obligation.responseTarget;
  if (!target) return;
  const factOwnership = {
    scope: target.evidence.find((item) => item.startsWith('FACT_OWNERSHIP:'))?.slice('FACT_OWNERSHIP:'.length) || null,
    namedOfferingReferent: target.namedOfferingReferent,
    // Compatibility evidence remains observable, but typed referent state is the
    // primary Authority transport. The adapter must never reconstruct entity
    // resolution from retrieval candidates or customer-visible text.
    evidence: target.evidence.filter((item) => item.startsWith('FACT_DIMENSION:')
      || item.startsWith('REFERENT_RESOLUTION:')
      || item.startsWith('GROUNDING_ENTITY_MATCH:')),
  };
  const businessFactGroundingEntries = selectCustomerServiceBusinessFactGroundingEntries({
    entries: knowledgeEntries,
    factOwnership,
  });
  const currentOptionAssessmentRequired = (understanding.humanContext.requiredTurnGoals || []).some((goal) => (
    !goal.deferred
    && goal.requestedContributionKind === 'DECISION_SUPPORT'
    && goal.requestedEvidenceScope === 'MERCHANT_BUSINESS'
    && goal.requestedDecisionMode === 'ASSESS_CURRENT_OPTION'
  ));
  // Consume the executable axes of every current Required goal, not a legacy key
  // or the dominant merchant-fact goal. A separately requested general explanation
  // must not become optional merely because this same turn also asks for an item fact.
  const generalDomainAdviceRequired = (understanding.humanContext.requiredTurnGoals || []).some((goal) => (
    !goal.deferred
    && goal.requestedContributionKind === 'ADVICE'
    && goal.requestedEvidenceScope === 'GENERAL_DOMAIN'
  ));
  // PRODUCT_CAPABILITIES / COMPATIBILITY are typed answer facets, not lexical
  // guesses. A current-merchant question in either facet can legitimately require a
  // dual contribution: exact merchant premises remain Grounded, while performance/
  // compatibility reasoning must stay independently general/conditional if the
  // object-level outcome is not directly entailed. Making this continuation Required
  // prevents post-Conformance removal from collapsing the normal service path into a
  // recovery floor. Ordinary current facts (price, availability, exact attributes,
  // generic CURRENT_SPECIFIC_QUESTION) stay outside this trigger.
  const hybridGeneralContinuationRequired = (understanding.humanContext.requiredTurnGoals || []).some((goal) => (
    !goal.deferred
    && goal.requestedEvidenceScope === 'MERCHANT_BUSINESS'
    && ['INFORMATION', 'DECISION_SUPPORT'].includes(goal.requestedContributionKind || '')
    && ['PRODUCT_CAPABILITIES', 'COMPATIBILITY'].includes(goal.requestedAnswerFocus || '')
  ));
  const source: CustomerServicePolicySourceRef[] = [{
    kind: 'UNDERSTANDING',
    refId: `answer-obligation:${target.focus}:${target.requiredDelta}`,
    version: String(target.confidence),
  }];

  // Axis A: what the current turn must accomplish. Conversation-level purchase
  // motive cannot replace the current-turn obligation, and CURRENT_SPECIFIC_QUESTION
  // is still a real answer obligation rather than a no-op compatibility bucket.
  if (target.focus === 'CONVERSATIONAL_CLOSURE') {
    // Defensive invariant: if an upstream inconsistency ever leaves a truly REQUIRED
    // information question in this same plan, do not add a competing close Act.
    if (acts.some((item) => ['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY'].includes(item.type) && item.necessity === 'REQUIRED')) return;
    addAct(acts, {
      type: 'NATURAL_CLOSE',
      necessity: 'REQUIRED',
      priority: 930,
      reasonCode: 'ANSWER_OBLIGATION_CONVERSATIONAL_CLOSURE_REQUIRED',
      sources: source,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: '只自然收束已经完成的交流；不得重播旧建议、创建新问题、开启新服务入口或追加商业动作。',
        expectedInformationGain: 'NONE',
      },
    });
    return;
  }

  // Authority Purification: an unknown current-business fact has one coherent
  // customer-visible obligation: state the factual boundary. Requiring a
  // DIRECT_ANSWER at the same time asked the producer to both answer and not
  // invent the same fact, which pushed correctness downstream into Claim/Repair.
  // Delete that conflict at the Plan producer instead.
  if (target.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED' && !businessFactGroundingEntries.length) {
    addAct(acts, {
      type: 'EXPLAIN_BOUNDARY',
      necessity: 'REQUIRED',
      priority: 930,
      reasonCode: `ANSWER_OBLIGATION_${target.focus}_GROUNDING_BOUNDARY_REQUIRED`,
      sources: source,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: '自然完成客户可理解的当前业务事实边界：当前已确认的业务事实不足以确认客户所指命名对象的当前问题，因此只表达无法确认、不能据此推断的事实边界并保持未知。缺少已确认事实本身不能推出该对象不存在、未上架、停售、售罄、无库存、未发布、店铺不提供或任何未来/生命周期状态；不得把这些状态作为已知事实。也不得向客户讲检索、查询、系统、Grounding、证据或内部“不命中”过程。',
        expectedInformationGain: 'ANSWER_CURRENT_FOCUS',
      },
    });
    addAct(acts, {
      type: 'PROVIDE_GENERAL_GUIDANCE',
      necessity: 'REQUIRED',
      priority: 900,
      reasonCode: `ANSWER_OBLIGATION_${target.focus}_UNKNOWN_BUSINESS_FACT_GENERAL_HELP_REQUIRED`,
      sources: source,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: ['具体商家/商品/订单事实保持未知，但未知不等于拒答。继续给与客户当前问题直接相关、且不依赖未知商家事实即可成立的一般帮助。', GENERAL_DOMAIN_JUDGMENT_BOUNDARY_PURPOSE].join('；'),
        expectedInformationGain: 'ADD_GENERAL_GUIDANCE',
      },
    });
    return;
  }

  // A grounded current-business fact is itself the direct answer. Do not stack a
  // separate DIRECT_ANSWER Act over the same proposition: that creates two semantic
  // owners for one HVE unit and makes downstream provenance/conformance inherently
  // ambiguous. The grounded Act is REQUIRED and carries the complete factual authority.
  if (target.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED'
    && businessFactGroundingEntries.length
    && target.focus !== 'RECOMMENDATION') {
    // Keep current-entity business facts and assessment methodology as two explicit
    // contribution authorities. A GUIDE may inform how to judge the established option,
    // but it is not current-entity Grounding and must never be promoted into the
    // EXPLAIN_GROUNDED_FACT ref set. This lets Conformance distinguish merchant/entity
    // propositions from genuine general-domain guidance without weakening either gate.
    const refs = ensureKnowledgeGrounding(businessFactGroundingEntries, grounding);
    addAct(acts, {
      type: 'EXPLAIN_GROUNDED_FACT',
      necessity: 'REQUIRED',
      priority: 920,
      reasonCode: currentOptionAssessmentRequired
        ? `ANSWER_OBLIGATION_${target.focus}_CURRENT_OPTION_FACT_REQUIRED`
        : `ANSWER_OBLIGATION_${target.focus}_GROUNDED_DIRECT_VALUE_REQUIRED`,
      sources: source,
      grounding: refs,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: currentOptionAssessmentRequired
          ? '完成当前已建立对象的可验证业务事实部分：只允许消费已解析当前实体本身的 Grounding；GUIDE/一般原则不能成为当前实体属性、性能、体验或保证的事实来源。ASSESS_CURRENT_OPTION 不授权推荐、替换或排序其他对象。'
          : '当前业务事实由一个 Grounded Act 直接完成当前回答义务；只允许消费与本轮事实对象一致的结构化证据。不得再叠加另一个 DIRECT_ANSWER 去共同拥有同一事实，也不得用相关类别知识、历史助手文本或其他商品事实替代当前实体。',
        expectedInformationGain: 'ADD_GROUNDED_INFORMATION',
      },
    });
    if (currentOptionAssessmentRequired || generalDomainAdviceRequired || hybridGeneralContinuationRequired) {
      addAct(acts, {
        type: 'PROVIDE_GENERAL_GUIDANCE',
        necessity: 'REQUIRED',
        priority: 910,
        reasonCode: currentOptionAssessmentRequired
          ? `ANSWER_OBLIGATION_${target.focus}_CURRENT_OPTION_ASSESSMENT_GUIDANCE_REQUIRED`
          : generalDomainAdviceRequired
            ? `ANSWER_OBLIGATION_${target.focus}_GENERAL_DOMAIN_ADVICE_REQUIRED`
            : `ANSWER_OBLIGATION_${target.focus}_HYBRID_GENERAL_CONTINUATION_REQUIRED`,
        sources: source,
        parameters: {
          target: obligation.currentFocusLabel,
          decisionPurpose: [
            hybridGeneralContinuationRequired && !currentOptionAssessmentRequired && !generalDomainAdviceRequired
              ? '当前 typed answer facet 要求回答商品能力/兼容性；具体商品事实仍只由 Grounded Act 拥有，同时必须给一个可独立成立的一般/条件化判断贡献，使未被 Direct Source 证明的对象级结果被删除后仍能正常完成客户问题。不得把一般规律改写成当前商品确定属性、性能、体验、保证或商家状态。'
              : '完成同一 typed required envelope 中明确要求的一般判断帮助，或当前选项评估方法；可消费相关 GUIDE/可靠一般领域原则，不能只重复已确认事实后省略此项要求。不得推荐、替换或排序其他对象。',
            GENERAL_DOMAIN_JUDGMENT_BOUNDARY_PURPOSE,
          ].join('；'),
          expectedInformationGain: 'ADD_GENERAL_GUIDANCE',
        },
      });
    } else {
      // A known-business-fact turn can still contain an independently safe explanation
      // of inference limits or a general decision/checking method. Keep the merchant fact
      // itself single-owned by EXPLAIN_GROUNDED_FACT, but expose a PREFERRED zero-Grounding
      // support authority so Generation does not have to choose between "invent a product
      // outcome" and "drop every useful non-merchant explanation". This is permission only:
      // it does not make guidance Required, does not create a recommendation, and cannot
      // authorize merchant/entity propositions because Conformance still normalizes any
      // evidence-required proposition back to grounded semantics.
      addAct(acts, {
        type: 'PROVIDE_GENERAL_GUIDANCE',
        necessity: 'PREFERRED',
        priority: 700,
        reasonCode: `ANSWER_OBLIGATION_${target.focus}_INDEPENDENT_GENERAL_HELP_PREFERRED`,
        sources: source,
        parameters: {
          target: obligation.currentFocusLabel,
          decisionPurpose: [
            '仅在当前事实回答旁边确有独立价值时补充一般帮助；不得用该 Act 共同拥有 EXPLAIN_GROUNDED_FACT 已负责的具体业务事实，也不得创建推荐、替换或排序其他对象。',
            GENERAL_DOMAIN_JUDGMENT_BOUNDARY_PURPOSE,
          ].join('；'),
          expectedInformationGain: 'ADD_GENERAL_GUIDANCE',
        },
      });
    }
    return;
  }

  const guidanceFocuses = new Set(['RECOMMENDATION', 'HOW_TO', 'TROUBLESHOOTING']);
  if (guidanceFocuses.has(target.focus)) {
    addAct(acts, {
      type: 'PROVIDE_GENERAL_GUIDANCE',
      necessity: 'REQUIRED',
      priority: 910,
      reasonCode: target.focus === 'RECOMMENDATION'
        ? 'ANSWER_OBLIGATION_RECOMMENDATION_VALUE_REQUIRED'
        : `ANSWER_OBLIGATION_${target.focus}_GUIDANCE_REQUIRED`,
      sources: source,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: target.focus === 'RECOMMENDATION'
          ? ['客户当前明确需要选择方向；完成当前选择所需的真实判断与取舍。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；')
          : ['客户当前明确需要操作/排查方向；直接给当前问题所需的实际下一步，不用额外包装成完整服务流程。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；'),
        expectedInformationGain: 'ADD_GENERAL_GUIDANCE',
      },
    });
  } else {
    const directAnswerFocuses = new Set([
      'OVERVIEW', 'APPLICATION_USAGE', 'WHY_REASON', 'COMPARISON',
      'LIMITATION_BOUNDARY', 'COMPATIBILITY', 'PRICE_COST', 'AVAILABILITY',
      'STATUS_PROGRESS', 'PRODUCT_CAPABILITIES',
      'CURRENT_SPECIFIC_QUESTION',
    ]);
    if (directAnswerFocuses.has(target.focus)) {
      addAct(acts, {
        type: 'DIRECT_ANSWER',
        necessity: 'REQUIRED',
        priority: 900,
        reasonCode: `ANSWER_OBLIGATION_${target.focus}_DIRECT_VALUE_REQUIRED`,
        sources: source,
        parameters: {
          target: obligation.currentFocusLabel,
          decisionPurpose: ['直接完成 Canonical Response Target；不得只做服务邀请、泛承接或把问题抛回客户。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；'),
          expectedInformationGain: 'ANSWER_CURRENT_FOCUS',
        },
      });
    }
  }

  // Axis B1: Grounded provenance for an already-existing recommendation need.
  // Grounding still cannot create recommendation behavior. Admission now requires
  // structured evidence that the selected Knowledge contains an actual referencable
  // entity/solution candidate; a non-empty generic Knowledge pool is not enough.
  // Once admitted, using that bound Grounding is part of completing the same Required
  // recommendation obligation; no candidate quota or ranking template is introduced.
  let knowledgeRefs: CustomerServiceGroundingRequirement[] | null = null;
  const alternativeRequested = understanding.humanContext.dialogueObligation.requestedDeltas.includes('ANOTHER_OPTION');
  const contextualDeliveredGroundingIds = target.namedOfferingReferent?.source === 'CONTEXTUAL_GROUNDED_ENTITY'
    ? new Set(target.namedOfferingReferent.resolvedGroundingIds)
    : new Set<string>();
  const alternativeExcludedGroundingIds = alternativeRequested
    && target.namedOfferingReferent?.status === 'EXACT_STRUCTURED_ENTITY'
    ? new Set(target.namedOfferingReferent.resolvedGroundingIds)
    : new Set<string>();
  const contextualDeliveredOptionSetBounded = target.namedOfferingReferent?.status === 'EXACT_STRUCTURED_ENTITY'
    && target.namedOfferingReferent.source === 'CONTEXTUAL_GROUNDED_ENTITY'
    && !alternativeRequested;
  // A typed contextual delivered referent is a bounded option-set Authority only while
  // the customer is choosing/prioritizing inside that delivered set. ANOTHER_OPTION is
  // the opposite typed contract: any exact currently resolved option/set remains context,
  // but those resolved refs must not be re-offered as the requested alternative.
  // This exclusion consumes the typed referent identity only; it does not infer identity
  // from raw wording and does not widen recommendation eligibility beyond selected Knowledge.
  const recommendationCandidateEntries = contextualDeliveredOptionSetBounded
    ? businessFactGroundingEntries
    : alternativeRequested && alternativeExcludedGroundingIds.size
      ? knowledgeEntries.filter((entry) => !alternativeExcludedGroundingIds.has(entry.id))
      : knowledgeEntries;
  const recommendationKnowledgeEntries = recommendationCandidateEntries
    .filter(isCustomerServiceRecommendationCapableKnowledgeEntry);
  if (
    target.focus === 'RECOMMENDATION'
    && recommendationKnowledgeEntries.length
    && !understanding.humanContext.dialogueObligation.requestedDeltas.includes('NO_SPECIFIC_RECOMMENDATION')
  ) {
    knowledgeRefs = ensureKnowledgeGrounding(recommendationKnowledgeEntries, grounding);
    addAct(acts, {
      type: 'RECOMMEND_GROUNDED_ITEM',
      necessity: 'REQUIRED',
      // An explicit recommendation focus with eligible grounded candidates is the primary
      // customer task. Keep that executable recommendation ahead of supporting general
      // guidance in Canonical order; this creates no recommendation when eligibility is absent.
      priority: 930,
      reasonCode: 'ANSWER_OBLIGATION_RECOMMENDATION_GROUNDED_PROVENANCE_REQUIRED',
      sources: source,
      grounding: knowledgeRefs,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: ['当前推荐需求已经由 Canonical Response Target 建立；已存在结构化 recommendation-capable Grounding，本轮推荐必须实际消费至少一个该 Act 绑定的具体候选/方案事实来完成同一个推荐义务，而不是只完成泛化类别、材质或方向后停止。Grounding 只证明候选事实并提供 provenance，不创建推荐需求、排序理由或候选 quota，也不要求固定推荐措辞。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；'),
        expectedInformationGain: 'ADD_GROUNDED_INFORMATION',
      },
    });
  }

  // Recommendation can legitimately have both choice behavior and current-business
  // factual provenance. For all other grounded fact turns we returned above with one
  // REQUIRED Grounded Act, avoiding duplicate semantic ownership.
  if (target.knowledgeRequirement !== 'BUSINESS_FACT_GROUNDING_REQUIRED') return;
  if (target.focus === 'RECOMMENDATION' && businessFactGroundingEntries.length) {
    const refs = ensureKnowledgeGrounding(businessFactGroundingEntries, grounding);
    addAct(acts, {
      type: 'EXPLAIN_GROUNDED_FACT',
      necessity: 'PREFERRED',
      priority: 760,
      reasonCode: `ANSWER_OBLIGATION_${target.focus}_USE_GROUNDING`,
      sources: source,
      grounding: refs,
      parameters: {
        target: obligation.currentFocusLabel,
        decisionPurpose: '推荐行为之外的当前业务事实仍只允许使用与本轮事实对象一致的 Grounding；历史助手文本、其他商品或仅相似的候选不能获得当前实体事实权限。',
        expectedInformationGain: 'ADD_GROUNDED_INFORMATION',
      },
    });
  }
}

export function isCustomerServiceRecommendationCapableKnowledgeEntry(
  entry: CustomerServiceSelectedKnowledgeEntry,
) {
  const entityType = String(entry.entityType || '').trim().toUpperCase();
  const entityKey = String(entry.entityKey || '').trim();
  const category = String(entry.category || '').trim().toUpperCase();

  // Collection bindingTargetType/bindingTargetKey describe Knowledge applicability
  // (ACCOUNT / STORE / ROLE): who may consume an entry. They are not the identity of
  // a customer-selectable candidate and therefore cannot grant recommendation authority.
  // A grounded recommendation requires an explicit structured entity plus an existing
  // canonical offering category. Generic guidance/policy/reference entries may remain
  // useful context, but retrieval/applicability alone cannot promote them into an item.
  const explicitEntity = Boolean(entityType && entityType !== 'GENERIC' && entityKey);
  const concreteOfferingCategory = category === 'PRODUCT' || category === 'SERVICE';
  return explicitEntity && concreteOfferingCategory;
}

function ensureKnowledgeGrounding(
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
  grounding: CustomerServiceGroundingRequirement[],
) {
  const refs: CustomerServiceGroundingRequirement[] = [];
  for (const entry of knowledgeEntries.slice(0, 8)) {
    let requirement = grounding.find((item) => item.source === 'KNOWLEDGE' && item.key === entry.id);
    if (!requirement) {
      requirement = { source: 'KNOWLEDGE', key: entry.id, requirement: 'REQUIRED', status: 'SATISFIED', evidenceRefs: [entry.id] };
      grounding.push(requirement);
    } else if (requirement.requirement !== 'REQUIRED') {
      requirement.requirement = 'REQUIRED';
    }
    refs.push({ ...requirement, evidenceRefs: [...requirement.evidenceRefs] });
  }
  return refs;
}

function addGroundingSuppressions(
  interactionType: CustomerServiceInteractionPlanV2['interactionType'],
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
  suppressed: CustomerServiceSuppressedAct[],
) {
  if (interactionType === 'PRODUCT_DISCOVERY_NO_GROUNDING' && knowledgeEntries.length === 0) {
    addSuppressed(suppressed, {
      type: 'RECOMMEND_GROUNDED_ITEM',
      enforcement: 'SOFT',
      priority: 980,
      reasonCode: 'PRODUCT_GROUNDING_UNAVAILABLE_CLAIM_AUTHORITY_OWNS_HARD_BOUNDARY',
      sources: [{ kind: 'PLANNER', refId: 'knowledge-unavailable' }],
    });
  }
}

function addBehaviorMemorySuppressions(
  input: { understanding: CustomerServiceMessageUnderstanding; conversationState: CustomerServiceConversationStateSummary },
  suppressed: CustomerServiceSuppressedAct[],
) {
  // Current explicit dialogue boundary is the only HARD behavior-suppression source.
  // Rolling behavior history may inform fatigue diagnostics, but cannot keep an old
  // NO_QUESTIONS/NO_ADVICE/LISTEN_ONLY boundary alive after its lifecycle cleared.
  const deltas = new Set(input.understanding.humanContext.dialogueObligation?.requestedDeltas || []);
  const boundarySource: CustomerServicePolicySourceRef[] = [{ kind: 'UNDERSTANDING', refId: 'dialogueObligation.requestedDeltas' }];
  if (deltas.has('NO_QUESTIONS') || deltas.has('LISTEN_ONLY')) {
    addSuppressed(suppressed, { type: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_BOUNDARY_NO_QUESTIONS', sources: boundarySource });
    addSuppressed(suppressed, { type: 'OPEN_SERVICE_INVITATION', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_BOUNDARY_NO_QUESTIONS', sources: boundarySource });
  }
  if (deltas.has('NO_SPECIFIC_RECOMMENDATION')) {
    addSuppressed(suppressed, {
      type: 'RECOMMEND_GROUNDED_ITEM',
      enforcement: 'HARD',
      priority: 1000,
      reasonCode: 'CUSTOMER_BOUNDARY_NO_SPECIFIC_ITEM_RECOMMENDATION',
      sources: boundarySource,
    });
  }
  if (deltas.has('NO_ADVICE') || deltas.has('LISTEN_ONLY')) {
    addSuppressed(suppressed, { type: 'PROVIDE_GENERAL_GUIDANCE', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_BOUNDARY_NO_ADVICE', sources: boundarySource });
    addSuppressed(suppressed, { type: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_BOUNDARY_NO_ADVICE', sources: boundarySource });
    addSuppressed(suppressed, { type: 'SALES_CTA', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_BOUNDARY_NO_ADVICE', sources: boundarySource });
  }
  if (input.conversationState.behaviorHistory.consecutiveQuestionEndingTurns >= 2) {
    addSuppressed(suppressed, { type: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'SOFT', priority: 650, reasonCode: 'BEHAVIOR_QUESTION_FATIGUE', sources: [{ kind: 'BEHAVIOR_MEMORY', refId: 'consecutiveQuestionEndingTurns' }] });
  }
  if (input.understanding.primaryIntent === 'REFUSE_SOLUTION') {
    addSuppressed(suppressed, { type: 'SALES_CTA', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_REJECTED_RECOMMENDATION', sources: [{ kind: 'UNDERSTANDING', refId: 'primaryIntent:REFUSE_SOLUTION' }] });
    addSuppressed(suppressed, { type: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 1000, reasonCode: 'CUSTOMER_REJECTED_RECOMMENDATION', sources: [{ kind: 'UNDERSTANDING', refId: 'primaryIntent:REFUSE_SOLUTION' }] });
  }
}

function addPlannerSuppressions(plan: CustomerServiceOrchestrationPlan, suppressed: CustomerServiceSuppressedAct[]) {
  if (plan.salesVisibility === 'S0' || plan.businessOpportunity.mode === 'NONE') {
    addSuppressed(suppressed, { type: 'SALES_CTA', enforcement: 'SOFT', priority: 950, reasonCode: 'PLANNER_SALES_NOT_ALLOWED', sources: [{ kind: 'PLANNER', refId: `salesVisibility:${plan.salesVisibility}` }] });
    addSuppressed(suppressed, { type: 'BUSINESS_ADVANCE', enforcement: 'SOFT', priority: 950, reasonCode: 'PLANNER_SALES_NOT_ALLOWED', sources: [{ kind: 'PLANNER', refId: `businessOpportunity:${plan.businessOpportunity.mode}` }] });
  }
}

export function buildCompletion(
  input: { understanding: CustomerServiceMessageUnderstanding; plan: CustomerServiceOrchestrationPlan },
  acts: CustomerServicePlannedAct[],
  interactionType: CustomerServiceInteractionPlanV2['interactionType'],
): CustomerServiceInteractionPlanV2['completion'] {
  const task = input.understanding.humanContext.conversationTaskState;
  const requiredSlot = acts.find((item) => item.type === 'REQUEST_REQUIRED_SLOT' && item.necessity === 'REQUIRED');
  if (isDirectIdentityInteraction(interactionType)) {
    return { mode: 'STOP_AFTER_REQUIRED', conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }, { type: 'NO_FURTHER_ACTS' }], allowOptionalContinuation: false };
  }
  if (requiredSlot) {
    return { mode: 'WAIT_CUSTOMER', conditions: [{ type: 'WAITING_REQUIRED_SLOT', ref: requiredSlot.trackingKey }], allowOptionalContinuation: false };
  }
  const requiredQuestion = acts.find((item) => ['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY'].includes(item.type) && item.necessity === 'REQUIRED');
  // Historical task status is continuity truth, not permission to create a
  // current-turn customer-input dependency. addTaskActs() already projects every
  // currently missing/requested required slot into the final Canonical Acts; only
  // such a selected required question may own WAIT_CUSTOMER now.
  if (requiredQuestion) {
    return { mode: 'WAIT_CUSTOMER', conditions: [{ type: 'WAITING_CUSTOMER_RESPONSE' }], allowOptionalContinuation: false };
  }
  if (acts.some((item) => item.type === 'NATURAL_CLOSE' && item.necessity === 'REQUIRED')) {
    return { mode: 'STOP_AFTER_REQUIRED', conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }, { type: 'NO_FURTHER_ACTS' }], allowOptionalContinuation: false };
  }
  if (task.status === 'INTERNAL_PROCESSING') {
    return { mode: 'ALLOW_CONTINUATION', conditions: [{ type: 'EXTERNAL_ACTION_PENDING', ref: task.internalHandling.scenario || undefined }], allowOptionalContinuation: false };
  }
  return { mode: 'ALLOW_CONTINUATION', conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }], allowOptionalContinuation: true };
}


function isDirectIdentityInteraction(interactionType: CustomerServiceInteractionPlanV2['interactionType']) {
  return ['AI_IDENTITY_QUERY', 'ROLE_CONFIRMATION', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(interactionType);
}

function enrichActParameters(
  acts: CustomerServicePlannedAct[],
  understanding: CustomerServiceMessageUnderstanding,
  interactionType: CustomerServiceInteractionPlanV2['interactionType'],
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
  plan: CustomerServiceOrchestrationPlan,
  openingReception?: CustomerServiceOpeningReceptionContext,
  answerObligation?: CustomerServiceInteractionPlanV2['answerObligation'],
) {
  const human = understanding.humanContext;
  const statePreferences = (plan.stateGuidance?.preferences || [])
    .map((item) => cleanParameter(item.value) || cleanParameter(item.key))
    .filter(Boolean);
  const stateExplicitFacts = (plan.stateGuidance?.explicitFacts || [])
    .map((item) => cleanParameter(item.value) || cleanParameter(item.key))
    .filter(Boolean);
  const knownNeeds = uniqueStrings([...human.statedNeeds, ...statePreferences, ...stateExplicitFacts]).slice(0, 8);
  const decisionMissing = resolveDecisionRelevantMissing(human);
  const knowledgeTitles = uniqueStrings(knowledgeEntries.map((item) => item.title)).slice(0, 6);
  const customerVisibleIdentity = plan.identityConstraint.customerVisibleIdentity;
  const identityKnown = uniqueStrings(customerVisibleIdentity ? [
    customerVisibleIdentity.businessLabel,
    customerVisibleIdentity.relationLabel,
    customerVisibleIdentity.preferredSurfaceLabel,
  ] : [
    // Backward-compatible contract fallback: never expose legacy identityLabel here,
    // because older values may contain internal Role descriptors.
    plan.identityConstraint.storeName,
    plan.identityConstraint.accountName,
  ]).slice(0, 4);
  for (const act of acts) {
    if (act.type === 'CONFIRM_ROLE') {
      act.parameters = {
        ...(act.parameters || {}),
        target: act.parameters?.target || '当前账号与商家/业务主体的公开服务关系',
        decisionPurpose: act.parameters?.decisionPurpose || '先直接确认客户正在核实的服务关系，再自然停住，不展开角色卡或服务清单',
        known: act.parameters?.known?.length ? [...act.parameters.known] : identityKnown,
        expectedInformationGain: 'CONFIRM',
      };
    } else if (act.type === 'DISCLOSE_PUBLIC_IDENTITY') {
      act.parameters = {
        ...(act.parameters || {}),
        target: act.parameters?.target || '当前已绑定且允许公开的业务身份',
        decisionPurpose: act.parameters?.decisionPurpose || '用可靠公开身份回答当前身份问题，不额外扩展姓名、履历或服务清单',
        known: act.parameters?.known?.length ? [...act.parameters.known] : identityKnown,
        expectedInformationGain: 'CONFIRM',
      };
    } else if (act.type === 'OPEN_SERVICE_INVITATION') {
      act.parameters = {
        ...(act.parameters || {}),
        target: act.parameters?.target || cleanParameter(openingReception?.serviceScopeSummary) || '当前账号可承接的客户需求入口',
        decisionPurpose: act.parameters?.decisionPurpose || '在问候后自然给出一个低压力的服务入口，不朗读服务清单、不制造生活闲聊',
        expectedInformationGain: 'NONE',
      };
    } else if (act.type === 'REQUEST_OPTIONAL_PREFERENCE') {
      const discoveryTarget = cleanParameter(human.commercialStrategy.discoveryTarget);
      const businessObjective = cleanParameter(human.commercialStrategy.objective);
      act.parameters = {
        target: discoveryTarget && discoveryTarget !== '无'
          ? discoveryTarget
          : '一个尚未明确、且答案会明显改变后续建议或匹配结论的决策变量',
        decisionPurpose: [
          '最大化单个可选问题的决策增量：只问一个客户能回答、且答案会改变后续建议或匹配结论的真实缺口',
          '不要重复 known，也不要把纯分类/导航式选择当作默认需求澄清；只有分类本身会改变当前决策时才问',
          businessObjective ? `当前业务目标：${businessObjective}` : null,
        ].filter(Boolean).join('；'),
        known: knownNeeds,
        missing: decisionMissing,
        expectedInformationGain: 'REDUCE_UNCERTAINTY',
      };
    } else if (act.type === 'REQUEST_REQUIRED_SLOT') {
      const slotKeys = uniqueStrings((act.grounding || []).map((item) => item.key.replace(/^slot:/, ''))).slice(0, 4);
      act.parameters = {
        target: slotKeys.length ? slotKeys.join(' / ') : '完成当前任务所缺的必要信息',
        decisionPurpose: '补齐继续处理当前业务任务所必需的信息',
        known: knownNeeds,
        missing: slotKeys.length ? slotKeys : decisionMissing,
        expectedInformationGain: 'ADVANCE_REQUIRED_TASK',
      };
    } else if (act.type === 'ACKNOWLEDGE_PREFERENCE') {
      act.parameters = {
        target: '客户本轮已经明确表达的偏好/用途',
        decisionPurpose: interactionType === 'PRODUCT_DISCOVERY_NO_GROUNDING'
          ? '确认已经理解客户条件，同时不使用公共常识冒充店铺商品结论'
          : '确认已经理解客户给出的选择条件',
        known: knownNeeds,
        expectedInformationGain: 'CONFIRM',
      };
    } else if (act.type === 'PROVIDE_GENERAL_GUIDANCE') {
      act.parameters = {
        ...(act.parameters || {}),
        target: act.parameters?.target || '把客户当前已知条件转化成一个能缩小下一步选择范围的一般性原则、取舍或方向',
        decisionPurpose: act.parameters?.decisionPurpose || '在不声称任何商家具体事实的前提下形成可执行的选择方向；不能只增加无决策后果的正面评价、同义复述或处理过程旁白',
        known: act.parameters?.known?.length ? [...act.parameters.known] : knownNeeds,
        missing: act.parameters?.missing?.length ? [...act.parameters.missing] : decisionMissing,
        expectedInformationGain: 'ADD_GENERAL_GUIDANCE',
      };
    } else if (act.type === 'RECOMMEND_GROUNDED_ITEM') {
      act.parameters = {
        ...(act.parameters || {}),
        target: act.parameters?.target || '当前需求下可由已命中业务知识支持的具体选择',
        decisionPurpose: act.parameters?.decisionPurpose
          || ['在客户已知条件上增加可验证的店铺/商品信息。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；'),
        known: uniqueStrings([...(act.parameters?.known || []), ...knownNeeds, ...knowledgeTitles]).slice(0, 8),
        missing: act.parameters?.missing?.length ? [...act.parameters.missing] : decisionMissing,
        expectedInformationGain: act.parameters?.expectedInformationGain || 'ADD_GROUNDED_INFORMATION',
      };
    } else if (act.type === 'EXPLAIN_GROUNDED_FACT') {
      act.parameters = {
        target: '客户当前询问且已有业务知识支持的事实',
        decisionPurpose: '直接补充可验证事实，而不是复述客户问题',
        known: knowledgeTitles,
        expectedInformationGain: 'ADD_GROUNDED_INFORMATION',
      };
    } else if (act.type === 'DIRECT_ANSWER') {
      const deterministic = act.sources.some((source) => source.kind === 'RESPONSE_ASSET');
      const currentSpecificTarget = answerObligation?.responseTarget.focus === 'CURRENT_SPECIFIC_QUESTION'
        ? cleanParameter(answerObligation.responseTarget.unresolvedNeed)
        : null;
      const existingTarget = cleanParameter(act.parameters?.target);
      const genericFocusTarget = cleanParameter(answerObligation?.currentFocusLabel);
      // The AnswerObligation's verbatim current-goal target is more specific than
      // the generic CURRENT_SPECIFIC_QUESTION label created by addAnswerObligationActs.
      // Replace only that generic placeholder; preserve an independently authored
      // deterministic/explicit Act target if one already exists.
      const effectiveTarget = currentSpecificTarget && (!existingTarget || existingTarget === genericFocusTarget)
        ? currentSpecificTarget
        : existingTarget || currentSpecificTarget || genericFocusTarget || '客户当前明确问题或请求';
      act.parameters = {
        ...(act.parameters || {}),
        target: effectiveTarget,
        decisionPurpose: act.parameters?.decisionPurpose || (
          deterministic
            ? '使用已验证口径直接解决当前问题'
            : answerObligation?.mustAddNewInformation
              ? ['直接回答客户本轮新增的信息面；上一轮已经覆盖的内容只能作为必要背景，不得换词复述冒充新答案。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；')
              : ['直接完成客户当前明确请求。', CHOICE_PRIORITIZATION_DECISION_PURPOSE].join('；')
        ),
        known: act.parameters?.known?.length ? [...act.parameters.known] : knownNeeds,
        missing: act.parameters?.missing?.length ? [...act.parameters.missing] : undefined,
        expectedInformationGain: act.parameters?.expectedInformationGain
          || (deterministic ? 'ADD_GROUNDED_INFORMATION' : 'ANSWER_CURRENT_FOCUS'),
      };
    } else if (['EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'LIGHT_ACK', 'PRESENCE_ACK'].includes(act.type)) {
      act.parameters = {
        ...(act.parameters || {}),
        target: act.parameters?.target || '客户当前情绪/处境/互动信号',
        decisionPurpose: act.parameters?.decisionPurpose || '完成关系承接，不强行制造新的业务信息或追问',
        expectedInformationGain: 'NONE',
      };
    }
  }
}

function resolveDecisionRelevantMissing(human: CustomerServiceMessageUnderstanding['humanContext']) {
  const discoveryTarget = cleanParameter(human.commercialStrategy.discoveryTarget);
  // Free-form `uncertainties` are descriptive diagnostics. They are not typed
  // enough to decide whether Runtime may ask a question, so they must not become a
  // lexical/phrase-level behavior Authority. Only typed discovery target / task gaps
  // may create a decision-relevant missing input here.
  const unresolvedGoals = (human.conversationTaskState?.unresolvedGoals || [])
    .map(cleanParameter)
    .filter(Boolean);
  return uniqueStrings([
    discoveryTarget && discoveryTarget !== '无' ? discoveryTarget : null,
    ...unresolvedGoals,
  ]).slice(0, 4);
}

function cleanParameter(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

function collectPlanSources(input: {
  understanding: CustomerServiceMessageUnderstanding;
  plan: CustomerServiceOrchestrationPlan;
  deterministic: CustomerServiceDeterministicReplyPlan;
  conversationState: CustomerServiceConversationStateSummary;
}) {
  const result: CustomerServicePolicySourceRef[] = [
    { kind: 'PLANNER', refId: `route:${input.plan.route}` },
    { kind: 'UNDERSTANDING', refId: `${input.understanding.primaryScenario}:${input.understanding.primaryIntent}` },
    { kind: 'STATE', refId: `revision:${input.conversationState.revision}` },
  ];
  if (input.conversationState.recentAssistantMoves.length) result.push({ kind: 'BEHAVIOR_MEMORY', refId: `moves:${input.conversationState.recentAssistantMoves.length}` });
  for (const rule of input.deterministic.matchedRules) result.push({ kind: 'RESPONSE_ASSET', refId: rule.responseAssetId, version: String(rule.versionNo) });
  return dedupeSources(result);
}

function collectProhibitedUnknownFacts(state: CustomerServiceConversationStateSummary) {
  return Object.entries(state.canonicalFields)
    .filter(([, value]) => ['UNKNOWN', 'CONFLICTED', 'STALE'].includes(value.status))
    .map(([key, value]) => `${key}:${value.status}`)
    .slice(0, 24);
}

function deterministicSources(plan: CustomerServiceDeterministicReplyPlan, type: string): CustomerServicePolicySourceRef[] {
  return plan.matchedRules
    .filter((item) => item.responseType === type)
    .map((item) => ({ kind: 'RESPONSE_ASSET' as const, refId: item.responseAssetId, version: String(item.versionNo) }));
}

function resolveTrackingDependencies(acts: CustomerServicePlannedAct[], trackingKeys: string[]) {
  if (!trackingKeys.length) return undefined;
  const wanted = new Set(trackingKeys);
  const ids = acts.filter((item) => item.trackingKey && wanted.has(item.trackingKey)).map((item) => item.id);
  return ids.length ? ids : undefined;
}

function addAct(acts: CustomerServicePlannedAct[], input: Omit<CustomerServicePlannedAct, 'id'>) {
  const existing = acts.find((item) => item.type === input.type && item.trackingKey === input.trackingKey);
  if (existing) {
    if (necessityRank(input.necessity) > necessityRank(existing.necessity)) existing.necessity = input.necessity;
    existing.priority = Math.max(existing.priority, input.priority);
    existing.sources = dedupeSources([...existing.sources, ...input.sources]);
    existing.grounding = dedupeGrounding([...(existing.grounding || []), ...(input.grounding || [])]);
    existing.dependsOnActIds = uniqueStrings([...(existing.dependsOnActIds || []), ...(input.dependsOnActIds || [])]);
    if (input.parameters) existing.parameters = { ...(existing.parameters || {}), ...input.parameters, known: input.parameters.known ? [...input.parameters.known] : existing.parameters?.known, missing: input.parameters.missing ? [...input.parameters.missing] : existing.parameters?.missing };
    return;
  }
  acts.push({ id: `ACT_${String(acts.length + 1).padStart(2, '0')}_${input.type}`, ...input });
}

function addSuppressed(items: CustomerServiceSuppressedAct[], input: CustomerServiceSuppressedAct) {
  const existing = items.find((item) => item.type === input.type && item.reasonCode === input.reasonCode);
  if (!existing) items.push(input);
}

function dedupeSuppressed(items: CustomerServiceSuppressedAct[]) {
  const byType = new Map<CustomerServiceActType, CustomerServiceSuppressedAct>();
  for (const item of items) {
    const existing = byType.get(item.type);
    if (!existing) {
      byType.set(item.type, { ...item, sources: dedupeSources(item.sources) });
      continue;
    }
    const enforcementDelta = enforcementRank(item.enforcement) - enforcementRank(existing.enforcement);
    if (enforcementDelta > 0 || (enforcementDelta === 0 && item.priority > existing.priority)) {
      byType.set(item.type, { ...item, sources: dedupeSources([...existing.sources, ...item.sources]) });
    } else {
      existing.sources = dedupeSources([...existing.sources, ...item.sources]);
    }
  }
  return [...byType.values()];
}

function dedupeMappings(items: CustomerServiceLegacyActMapping[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}:${item.legacy}`;
    if (!item.legacy || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSources(items: CustomerServicePolicySourceRef[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.refId || ''}:${item.version || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeGrounding(items: CustomerServiceGroundingRequirement[]) {
  const map = new Map<string, CustomerServiceGroundingRequirement>();
  for (const item of items) {
    const key = `${item.source}:${item.key}`;
    const existing = map.get(key);
    if (!existing) map.set(key, { ...item, evidenceRefs: uniqueStrings(item.evidenceRefs) });
    else {
      if (item.requirement === 'REQUIRED') existing.requirement = 'REQUIRED';
      if (groundingStatusRank(item.status) > groundingStatusRank(existing.status)) existing.status = item.status;
      existing.evidenceRefs = uniqueStrings([...existing.evidenceRefs, ...item.evidenceRefs]);
    }
  }
  return [...map.values()];
}

function necessityRank(value: CustomerServicePlannedAct['necessity']) { return value === 'REQUIRED' ? 3 : value === 'PREFERRED' ? 2 : 1; }
function enforcementRank(value: CustomerServiceSuppressedAct['enforcement']) { return value === 'HARD' ? 2 : 1; }
function groundingStatusRank(value: CustomerServiceGroundingRequirement['status']) { return value === 'CONFLICTED' ? 5 : value === 'MISSING' ? 4 : value === 'STALE' ? 3 : value === 'UNKNOWN' ? 2 : 1; }

function uniqueStrings(values: Array<unknown>) {
  return Array.from(new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean)));
}
