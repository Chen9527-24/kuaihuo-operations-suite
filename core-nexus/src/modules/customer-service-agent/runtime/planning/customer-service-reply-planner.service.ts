import { Injectable } from '@nestjs/common';
import type { CustomerServiceExpressionPlan } from '../behavior/customer-service-human-behavior.type';
import type { CustomerServiceInteractionPlanV2 } from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceInteractionExecutionEnvelope } from '../interaction/customer-service-interaction-execution.type';
import type { CustomerServiceGuidelineResolutionSet } from '../guideline/customer-service-guideline.type';
import { CustomerServiceDeterministicReplyPlan } from '../compiler/customer-service-deterministic-response-compiler.service';
import {
  CustomerServiceCommercialOpenness,
  CustomerServiceCommercialStage,
  CustomerServiceProductMentionPolicy,
  CustomerServiceMessageUnderstanding,
} from '../understanding/types/customer-service-message-understanding.type';
import type {
  CustomerServiceConversationStateSummary,
  CustomerServiceConversationStateValue,
} from '../state/customer-service-conversation-state.type';
import type { CustomerServiceConversationStrategyPreferences } from '../../shared/context/customer-service-account-runtime-preferences.util';
import { resolveCustomerServicePublicIdentityProjection, type CustomerServicePublicIdentityProjection } from '../identity/customer-service-public-identity-projection';

export type CustomerServiceReplyRoute =
  | 'EXACT_REPLY'
  | 'TEMPLATE_REPLY'
  | 'CONTROLLED_GENERATION'
  | 'SMART_GENERATION';


export type CustomerServiceIntentGuidance = {
  id: string;
  key: string;
  name: string;
  category: string;
  scenario: string;
  primaryIntent: string;
  defaultRiskLevel: string;
  recognitionConfig: Record<string, unknown>;
  strategyConfig: Record<string, unknown>;
  flowConfig: Record<string, unknown>;
  replyConfig: Record<string, unknown>;
  examples: unknown;
  priority: number;
  revision: number;
};

export type CustomerServiceBusinessOpportunityMode = 'NONE' | 'OBSERVE' | 'DISCOVER' | 'ASSIST' | 'ADVANCE';

export type CustomerServiceCapabilityAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN' | 'REQUIRES_APPROVAL';
export type CustomerServiceCapabilityConfigurationStatus = 'NOT_CONFIGURED' | 'CONFIGURED';
export type CustomerServiceCapabilityEnforcementMode = 'COMMUNICATION_ONLY' | 'STRICT_EXECUTION';

export type CustomerServiceExecutionReceipt = {
  action: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'ACCEPTED' | 'REJECTED';
  source: 'TOOL_RESULT' | 'BUSINESS_STATE' | 'RUNTIME';
  evidence: string[];
  occurredAt: string | null;
};

export type CustomerServiceServiceCapabilities = {
  accountOrderVisibility: CustomerServiceCapabilityAvailability;
  orderLookupById: CustomerServiceCapabilityAvailability;
  orderLookupByPhone: CustomerServiceCapabilityAvailability;
  trackingLookup: CustomerServiceCapabilityAvailability;
  logisticsUrge: CustomerServiceCapabilityAvailability;
  source: 'RUNTIME_CONFIG' | 'NOT_CONFIGURED';
  configurationStatus: CustomerServiceCapabilityConfigurationStatus;
  enforcementMode: CustomerServiceCapabilityEnforcementMode;
  actionLimits: Record<string, unknown>;
  executionReceipts: CustomerServiceExecutionReceipt[];
  evidence: string[];
};

export type CustomerServiceHistoryReferenceMode = 'NONE' | 'SOFT' | 'DIRECT';

export type CustomerServiceBusinessIdentityConstraint = {
  stable: true;
  identityLabel: string;
  merchantRoleName: string;
  accountName: string | null;
  storeName: string | null;
  businessAnchored: boolean;
  strength: CustomerServiceConversationStrategyPreferences['policy']['businessIdentityStrength'];
  casualChatBoundary: CustomerServiceConversationStrategyPreferences['policy']['casualChatBoundary'];
  forbiddenDrift: string[];
  /** V1.7 customer-visible projection; internal Role/Profile labels remain non-surface authority. */
  customerVisibleIdentity: CustomerServicePublicIdentityProjection;
};

export type CustomerServiceStatePlanningGuidance = {
  stateRevision: number;
  stateAvailable: boolean;
  policySource: CustomerServiceConversationStrategyPreferences['source'];
  contextCarryoverMode: CustomerServiceConversationStrategyPreferences['policy']['contextCarryoverMode'];
  returningGreetingMode: CustomerServiceConversationStrategyPreferences['policy']['returningGreetingMode'];
  stateInferenceMode: CustomerServiceConversationStrategyPreferences['policy']['stateInferenceMode'];
  reuseConfirmedPreferences: boolean;
  continueUnfinishedItems: boolean;
  activeTopic: string | null;
  activeTopicStatus: CustomerServiceConversationStateValue<string>['status'];
  currentIntent: string | null;
  currentIntentStatus: CustomerServiceConversationStateValue<string>['status'];
  customerGoal: string | null;
  explicitFacts: Array<{ key: string; value: string }>;
  preferences: Array<{ key: string; value: string }>;
  pendingItems: string[];
  resolvedItems: string[];
  closedSemanticQuestions: string[];
  activeTask: {
    scenario: string;
    intent: string;
    goal: string;
    status: string;
    pendingSlots: string[];
    providedSlots: string[];
    unresolvedGoals: string[];
  } | null;
  shouldReferenceHistory: CustomerServiceHistoryReferenceMode;
  shouldUseBusinessKnowledge: boolean;
  shouldAdvanceSales: boolean;
  commercialAdvanceBlocked: boolean;
  topicShiftDetected: boolean;
  staleOrConflictedValues: string[];
  forbiddenAssumptions: string[];
  requiredContinuityActs: string[];
  evidenceMessageIds: string[];
  reason: string;
};

export type CustomerServiceReplyPlannerContext = {
  conversationState?: CustomerServiceConversationStateSummary | null;
  latestMessage?: string;
  conversationStrategy?: CustomerServiceConversationStrategyPreferences | null;
  identity?: {
    merchantRoleName?: string | null;
    publicIdentity?: string | null;
    publicRelation?: string | null;
    prototypeIdentity?: string | null;
    accountName?: string | null;
    storeName?: string | null;
    storeBrandName?: string | null;
    accountPublicIdentity?: string | null;
  } | null;
};

export function defaultCustomerServiceCapabilities(): CustomerServiceServiceCapabilities {
  return {
    accountOrderVisibility: 'UNKNOWN',
    orderLookupById: 'UNKNOWN',
    orderLookupByPhone: 'UNKNOWN',
    trackingLookup: 'UNKNOWN',
    logisticsUrge: 'UNKNOWN',
    source: 'NOT_CONFIGURED',
    configurationStatus: 'NOT_CONFIGURED',
    enforcementMode: 'COMMUNICATION_ONLY',
    actionLimits: {},
    executionReceipts: [],
    evidence: ['当前尚未绑定行业动作权限，本轮只验证意图理解与真人沟通；不得把历史客服说法当成真实执行结果。'],
  };
}

export type CustomerServiceOrchestrationPlan = {
  route: CustomerServiceReplyRoute;
  primaryTopic: CustomerServiceMessageUnderstanding['topics'][number];
  topics: CustomerServiceMessageUnderstanding['topics'];
  intentRanking: CustomerServiceMessageUnderstanding['intentRanking'];
  dominantTurnGoal: CustomerServiceMessageUnderstanding['humanContext']['dominantTurnGoal'];
  rankedTurnGoals: CustomerServiceMessageUnderstanding['humanContext']['rankedTurnGoals'];
  requiredTurnGoals: CustomerServiceMessageUnderstanding['humanContext']['requiredTurnGoals'];
  requiredResponseActs: CustomerServiceMessageUnderstanding['humanContext']['requiredResponseActs'];
  intentExecutionOrder: Array<{ key: string; name: string; role: 'PRIMARY' | 'SECONDARY' | 'LATENT'; priority: number; confidence: number; actionable: boolean; guidanceKey: string | null }>;
  serviceGoal: string;
  humanityGoal: string;
  businessGoal: string | null;
  businessOpportunity: {
    mode: CustomerServiceBusinessOpportunityMode;
    openness: CustomerServiceCommercialOpenness;
    score: number;
    stage: CustomerServiceCommercialStage;
    productMentionPolicy: CustomerServiceProductMentionPolicy;
    discoveryTarget: string;
    transitionSignals: string[];
    reason: string;
    allowedApproaches: string[];
    forbiddenApproaches: string[];
  };
  microActions: string[];
  prohibitedMicroActions: string[];
  semanticMoveBudget: CustomerServiceMessageUnderstanding['humanContext']['semanticMoveBudget'];
  questionBudget: number;
  informationBudget: number;
  salesVisibility: 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
  humanReviewRequired: boolean;
  serviceCapabilities: CustomerServiceServiceCapabilities;
  stateGuidance: CustomerServiceStatePlanningGuidance;
  identityConstraint: CustomerServiceBusinessIdentityConstraint;
  /** C6-A: 由 Runtime Contract Compiler 在 Planner 完成后解析；Planner 本身仍只负责业务/语义决策。 */
  expressionPlan?: CustomerServiceExpressionPlan;
  /** HVE-1: legacy-source shadow baseline; Generator/Quality/Delivery must not consume it yet. */
  interactionPlanV2Legacy?: CustomerServiceInteractionPlanV2;
  /** HVE-2: deterministic Guideline resolution trace. */
  guidelineResolutionSet?: CustomerServiceGuidelineResolutionSet;
  /** HVE-2: canonical shadow plan after Guideline resolution; still not customer-visible. */
  interactionPlanV2?: CustomerServiceInteractionPlanV2;
  /** HVE-3: execution lane is intentionally separate from InteractionPlan semantics. */
  interactionExecution?: CustomerServiceInteractionExecutionEnvelope;
  /** HVE-2: shadow semantic diff; used for migration/trace only. */
  interactionPlanV2Comparison?: {
    legacyRequiredActs: string[]; guidelineRequiredActs: string[];
    legacySuppressedActs: string[]; guidelineSuppressedActs: string[];
    completionChanged: boolean;
    changed: boolean;
  };
  routeReason: string;
};

@Injectable()
export class CustomerServiceReplyPlanner {
  plan(
    understanding: CustomerServiceMessageUnderstanding,
    deterministic: CustomerServiceDeterministicReplyPlan,
    requestedServiceGoal?: string,
    intentGuidanceList: CustomerServiceIntentGuidance[] = [],
    context: CustomerServiceReplyPlannerContext = {},
  ): CustomerServiceOrchestrationPlan {
    const primaryTopic = understanding.topics[0]!;
    const route = this.resolveRoute(understanding, deterministic);
    const intentGuidance = selectPrimaryIntentGuidance(understanding, intentGuidanceList);
    const baseSalesVisibility = resolveIntentSalesVisibility(intentGuidance) || this.resolveSalesVisibility(understanding);
    const serviceGoal = requestedServiceGoal?.trim() || readString(intentGuidance?.strategyConfig, 'serviceGoal') || defaultServiceGoal(understanding);
    const baseBusinessOpportunity = resolveBusinessOpportunity(understanding, baseSalesVisibility);
    const conversationStrategy = context.conversationStrategy || defaultConversationStrategyPreferences();
    const identityConstraint = resolveBusinessIdentityConstraint(context.identity, conversationStrategy);
    const stateGuidance = resolveStatePlanningGuidance({
      understanding,
      state: context.conversationState || null,
      latestMessage: context.latestMessage || '',
      baseOpportunity: baseBusinessOpportunity,
      conversationStrategy,
    });
    const salesVisibility = stateGuidance.commercialAdvanceBlocked ? 'S0' as const : baseSalesVisibility;
    const businessOpportunity = stateGuidance.commercialAdvanceBlocked
      ? constrainBusinessOpportunityForPendingService(baseBusinessOpportunity)
      : baseBusinessOpportunity;
    stateGuidance.shouldAdvanceSales = businessOpportunity.mode === 'ADVANCE' && salesVisibility !== 'S0';
    // Internal review is a risk/operations marker only. It must not select a
    // customer-visible generation route or imply public handoff.
    const humanReviewRequired = understanding.requiresHumanReview;
    return {
      route,
      primaryTopic,
      topics: understanding.topics,
      intentRanking: understanding.intentRanking,
      dominantTurnGoal: understanding.humanContext.dominantTurnGoal,
      rankedTurnGoals: understanding.humanContext.rankedTurnGoals,
      requiredTurnGoals: understanding.humanContext.requiredTurnGoals,
      requiredResponseActs: understanding.humanContext.requiredResponseActs,
      intentExecutionOrder: buildIntentExecutionOrder(understanding, intentGuidanceList),
      serviceGoal,
      humanityGoal: buildHumanityGoal(understanding, intentGuidance),
      businessGoal: readNullableString(intentGuidance?.strategyConfig, 'optionalBusinessGoal') ?? resolveBusinessGoal(businessOpportunity, understanding),
      businessOpportunity,
      microActions: resolveMicroActions(understanding, deterministic, businessOpportunity, stateGuidance),
      prohibitedMicroActions: resolveProhibitedActions(understanding, salesVisibility, businessOpportunity, stateGuidance),
      semanticMoveBudget: understanding.humanContext.semanticMoveBudget,
      questionBudget: readPositiveInt(intentGuidance?.strategyConfig, 'questionBudget') ?? resolveQuestionBudget(route, understanding, businessOpportunity),
      informationBudget: readPositiveInt(intentGuidance?.strategyConfig, 'informationBudget') ?? resolveInformationBudget(route, understanding),
      salesVisibility,
      humanReviewRequired,
      serviceCapabilities: defaultCustomerServiceCapabilities(),
      stateGuidance,
      identityConstraint,
      routeReason: resolveRouteReason(route, deterministic, understanding),
    };
  }

  private resolveRoute(
    understanding: CustomerServiceMessageUnderstanding,
    deterministic: CustomerServiceDeterministicReplyPlan,
  ): CustomerServiceReplyRoute {
    if (deterministic.exactReply) return 'EXACT_REPLY';
    if (deterministic.templateReply?.rendered) return 'TEMPLATE_REPLY';
    if (deterministic.requiredPoints.length || deterministic.workflowSteps.length) return 'CONTROLLED_GENERATION';
    return 'SMART_GENERATION';
  }

  private resolveSalesVisibility(understanding: CustomerServiceMessageUnderstanding) {
    if (
      understanding.primaryIntent === 'REFUSE_SOLUTION' ||
      understanding.riskLevel === 'HIGH' ||
      understanding.riskLevel === 'CRITICAL' ||
      ['COMPLAINT_ESCALATION', 'REFUND_REQUEST', 'AFTER_SALE', 'LOGISTICS_DELAY', 'SAFETY_SENSITIVE'].includes(understanding.primaryScenario)
    ) return 'S0' as const;
    if (understanding.humanContext.commercialOpenness === 'EXPLICIT') return 'S3' as const;
    if (understanding.humanContext.commercialOpenness === 'ACTIVE') return 'S2' as const;
    if (understanding.humanContext.commercialOpenness === 'LATENT') return 'S1' as const;
    return 'S1' as const;
  }
}

function selectPrimaryIntentGuidance(
  understanding: CustomerServiceMessageUnderstanding,
  items: CustomerServiceIntentGuidance[],
) {
  if (!items.length) return null;
  const primaryHypothesis = understanding.intentRanking.find((item) => item.role === 'PRIMARY');
  return items.find((item) => item.key === primaryHypothesis?.key)
    || items.find((item) => item.scenario === primaryHypothesis?.scenario && item.primaryIntent === primaryHypothesis?.intent)
    || items.find((item) => item.scenario === understanding.primaryScenario && item.primaryIntent === understanding.primaryIntent)
    || items[0]
    || null;
}

function buildIntentExecutionOrder(
  understanding: CustomerServiceMessageUnderstanding,
  guidance: CustomerServiceIntentGuidance[],
): CustomerServiceOrchestrationPlan['intentExecutionOrder'] {
  return understanding.intentRanking.map((item) => ({
    key: item.key,
    name: item.name,
    role: item.role,
    priority: item.priority,
    confidence: item.confidence,
    actionable: item.actionable,
    guidanceKey: guidance.find((entry) => entry.key === item.key
      || (entry.scenario === item.scenario && entry.primaryIntent === item.intent))?.key || null,
  }));
}

function resolveMicroActions(
  understanding: CustomerServiceMessageUnderstanding,
  deterministic: CustomerServiceDeterministicReplyPlan,
  opportunity: CustomerServiceOrchestrationPlan['businessOpportunity'],
  stateGuidance?: CustomerServiceStatePlanningGuidance,
) {
  const actions: string[] = [
    'INTERPRET_CUSTOMER_MOTIVE',
    'RESPOND_LATEST_MESSAGE',
    'MATCH_CUSTOMER_MINDSET',
    'PROVIDE_RELEVANT_VALUE',
  ];
  const strategy = understanding.humanContext.interactionStrategy;
  const replyStrategy = understanding.humanContext.replyStrategy;
  if (strategy.firstMove === 'ACKNOWLEDGE_AND_INVITE_SHARING') actions.push('ACKNOWLEDGE_DOMINANT_SHARING_GOAL', 'INVITE_CUSTOMER_TO_SHARE_NATURALLY');
  if (strategy.firstMove === 'INVITE_SHARING') actions.push('INVITE_CUSTOMER_TO_SHARE_NATURALLY');
  if (strategy.firstMove === 'DISCOVER_CONTEXT') actions.push('DISCOVER_CUSTOMER_LIFE_CONTEXT_NATURALLY');
  if (strategy.firstMove === 'RESPOND_TO_SHARED_CONTEXT') actions.push('RESPOND_TO_SHARED_CONTEXT_FIRST');
  if (strategy.firstMove === 'PROCESS_PROVIDED_INFORMATION') actions.push('ACKNOWLEDGE_PROVIDED_INFORMATION', 'ADVANCE_PENDING_SERVICE_TASK');
  if (strategy.firstMove === 'HANDLE_INFORMATION_BARRIER') actions.push('ACKNOWLEDGE_INFORMATION_BARRIER', 'REDUCE_CUSTOMER_EFFORT', 'OFFER_ONE_REAL_NEXT_STEP');
  if (strategy.firstMove === 'REPAIR_RELATIONSHIP') actions.push('REPAIR_RELATIONSHIP_FIRST');
  const replyModeActions: Partial<Record<typeof replyStrategy.mode, string[]>> = {
    PLAYFUL_INVITATION: ['MAKE_GENTLE_HYPOTHESIS', 'OPEN_SHARING_SPACE'],
    FRIENDLIKE_REACTION: ['REACT_LIKE_REAL_CONVERSATION', 'ADD_NON_DIDACTIC_VALUE_MOVE'],
    WARM_EXPLORATION: ['EXPLORE_WITHOUT_INTERROGATING'],
    DIRECT_ANSWER: ['ANSWER_DIRECTLY'],
    PROFESSIONAL_GUIDANCE: ['GIVE_GROUNDED_GUIDANCE'],
    ACCOUNTABLE_RESOLUTION: ['ACKNOWLEDGE_IMPACT', 'PROVIDE_RESOLUTION_PATH'],
    CALM_PROGRESS_UPDATE: ['REDUCE_UNCERTAINTY', 'STATE_NEXT_PROGRESS_NODE'],
    RELATIONSHIP_REPAIR: ['ACKNOWLEDGE_TRUST_DAMAGE', 'REBUILD_WITH_ACTION'],
    SAFE_BOUNDARY: ['STATE_SAFETY_BOUNDARY'],
    NATURAL_CLOSE: ['CLOSE_WITHOUT_REOPENING_TOPIC'],
  };
  actions.push(...(replyModeActions[replyStrategy.mode] || []));
  if (understanding.humanContext.conversationStance === 'CLOSE_FRIEND_SERVICE') actions.push('SPEAK_WITH_CLOSE_FRIEND_SERVICE_STANCE');
  else if (understanding.humanContext.conversationStance === 'FRIENDLY_SERVICE') actions.push('SPEAK_WITH_FRIENDLY_SERVICE_STANCE');
  else if (understanding.humanContext.conversationStance === 'REPAIR_SERVICE') actions.push('SPEAK_WITH_REPAIR_SERVICE_STANCE');
  if (understanding.emotion !== 'NEUTRAL') actions.push('ACKNOWLEDGE_EMOTION_ACCURATELY');
  actions.push(...understanding.humanContext.requiredResponseActs);
  if (opportunity.mode === 'DISCOVER') actions.push('EXPLORE_LATENT_NEED_WITHOUT_PRODUCT_PUSH');
  if (opportunity.mode === 'ASSIST') actions.push('HELP_CUSTOMER_EVALUATE_NEED');
  if (opportunity.mode === 'ADVANCE') actions.push('OFFER_LOW_PRESSURE_NEXT_STEP');
  if (opportunity.stage === 'CONTEXT_DISCOVERY' && understanding.humanContext.dominantTurnGoal.key !== 'INVITE_POSITIVE_SHARING' && understanding.humanContext.dominantTurnGoal.key !== 'INVITE_EMOTIONAL_SHARING') actions.push('ASK_ONE_LOW_PRESSURE_LIFE_CONTEXT_QUESTION');
  if (opportunity.stage === 'NEED_EXPLORATION') actions.push('EXPLORE_ONE_RELEVANT_NEED_DIMENSION');
  if (opportunity.stage === 'VALUE_BRIDGING') actions.push('BRIDGE_CONTEXT_TO_CATEGORY_VALUE');
  if (opportunity.stage === 'PRODUCT_RECOMMENDATION') actions.push('RECOMMEND_ONLY_MATCHED_PRODUCTS');
  if (opportunity.stage === 'DECISION_SUPPORT') actions.push('COMPARE_AGAINST_CUSTOMER_CRITERIA');
  if (opportunity.stage === 'LOW_PRESSURE_CLOSE') actions.push('REDUCE_TRANSACTION_FRICTION');
  if (deterministic.requiredPoints.length) actions.push('COVER_REQUIRED_POINTS');
  if (deterministic.workflowSteps.length) actions.push('FOLLOW_REQUIRED_WORKFLOW');
  if (understanding.primaryIntent === 'REQUEST_ACTION') actions.push('STATE_ACTION_BOUNDARY');
  if (understanding.requiresHumanReview) actions.push('REQUEST_HUMAN_REVIEW');
  if (understanding.primaryIntent === 'REFUSE_SOLUTION') actions.push('STOP_RECOMMENDATION');
  if (stateGuidance?.shouldReferenceHistory === 'DIRECT') actions.push('CONTINUE_CANONICAL_CONTEXT');
  else if (stateGuidance?.shouldReferenceHistory === 'SOFT') actions.push('SOFT_REFERENCE_CANONICAL_CONTEXT');
  if (stateGuidance?.explicitFacts.length || stateGuidance?.preferences.length) actions.push('REUSE_CONFIRMED_CUSTOMER_STATE');
  if (
    stateGuidance?.activeTask
    && !['RESOLVED', 'ABANDONED'].includes(stateGuidance.activeTask.status)
    && (stateGuidance.continueUnfinishedItems || isSafetyContinuityScenario(stateGuidance.activeTask.scenario))
  ) actions.push('CONTINUE_UNFINISHED_TASK_WHEN_RELEVANT');
  return [...new Set(actions)].slice(0, 12);
}

function resolveProhibitedActions(
  understanding: CustomerServiceMessageUnderstanding,
  salesVisibility: CustomerServiceOrchestrationPlan['salesVisibility'],
  opportunity: CustomerServiceOrchestrationPlan['businessOpportunity'],
  stateGuidance?: CustomerServiceStatePlanningGuidance,
) {
  const actions = [
    'FABRICATE_FACT',
    'CLAIM_UNEXECUTED_ACTION',
    'PROMISE_UNVERIFIED_TIME',
    'FORCE_CONVERSION',
    'USE_EMOTION_AS_SALES_TRIGGER',
    'COPY_CALIBRATION_EXAMPLE',
    'OVERSTATE_RELATIONSHIP',
  ];
  if (understanding.primaryScenario !== 'REFUND_REQUEST') actions.push('INTRODUCE_REFUND');
  if (salesVisibility === 'S0') actions.push('RECOMMEND_PRODUCT', 'PUSH_SALE');
  if (opportunity.mode === 'NONE' || opportunity.mode === 'OBSERVE' || opportunity.mode === 'DISCOVER') {
    actions.push('RECOMMEND_SPECIFIC_PRODUCT_WITHOUT_SIGNAL');
  }
  if (opportunity.productMentionPolicy === 'PROHIBITED') {
    actions.push('MENTION_PRODUCT_OR_PROMOTION', 'ASK_BUDGET_TOO_EARLY', 'ASK_PURCHASE_INTENT_DIRECTLY');
  }
  if (opportunity.productMentionPolicy === 'CATEGORY_ONLY') actions.push('NAME_SPECIFIC_PRODUCT_BEFORE_CUSTOMER_INTEREST');
  if (understanding.primaryScenario === 'COMPLAINT_ESCALATION') actions.push('USE_HUMOR');
  if (understanding.humanContext.conversationTaskState?.providedSlots?.length) actions.push('ASK_ALREADY_PROVIDED_SLOT', 'RESTART_RESOLVED_SERVICE_FLOW');
  if (stateGuidance?.explicitFacts.length || stateGuidance?.preferences.length) actions.push('ASK_CONFIRMED_STATE_AGAIN');
  if (stateGuidance?.resolvedItems.length) actions.push('RESTART_RESOLVED_STATE_WITHOUT_CUSTOMER_SIGNAL');
  if (stateGuidance?.staleOrConflictedValues.length) actions.push('USE_STALE_OR_CONFLICTED_STATE_AS_FACT');
  if (stateGuidance?.commercialAdvanceBlocked) actions.push('IGNORE_UNFINISHED_SERVICE_FOR_SALES');
  return [...new Set(actions)];
}

function resolveBusinessIdentityConstraint(
  identity: CustomerServiceReplyPlannerContext['identity'] | undefined,
  conversationStrategy: CustomerServiceConversationStrategyPreferences,
): CustomerServiceBusinessIdentityConstraint {
  const merchantRoleName = cleanPlannerText(identity?.merchantRoleName) || '业务角色';
  const identityLabel = cleanPlannerText(identity?.publicIdentity)
    || cleanPlannerText(identity?.prototypeIdentity)
    || cleanPlannerText(identity?.accountName)
    || merchantRoleName;
  const accountName = cleanPlannerText(identity?.accountName) || null;
  const storeName = cleanPlannerText(identity?.storeName) || null;
  const publicRelation = cleanPlannerText(identity?.publicRelation) || null;
  const businessAnchored = Boolean(accountName || storeName || identity?.publicIdentity || publicRelation);
  const customerVisibleIdentity = resolveCustomerServicePublicIdentityProjection({
    merchantRoleName,
    merchantRolePublicIdentity: identity?.publicIdentity,
    merchantRolePublicRelation: publicRelation,
    prototypeIdentity: identity?.prototypeIdentity,
    accountName,
    accountPublicIdentity: identity?.accountPublicIdentity,
    storeName,
    storeBrandName: identity?.storeBrandName,
    businessAnchored,
  });
  const strength = conversationStrategy.policy.businessIdentityStrength;
  const casualChatBoundary = conversationStrategy.policy.casualChatBoundary;
  return {
    stable: true,
    identityLabel,
    merchantRoleName,
    accountName,
    storeName,
    businessAnchored,
    strength,
    casualChatBoundary,
    customerVisibleIdentity,
    forbiddenDrift: uniqueStrings([
      '不得否认或改写当前已绑定业务角色与可靠公开身份',
      '不得为了显得真人而冒充客户现实朋友、闺蜜、兄弟、恋人或已有线下关系',
      casualChatBoundary === 'BUSINESS_ANCHORED'
        ? '允许自然闲聊，但闲聊不能把服务账号退化成无业务身份的泛陪聊机器人'
        : casualChatBoundary === 'FLEXIBLE'
          ? '可以自然延展非业务闲聊，但仍需保持当前账号身份和权限边界'
          : '可以开放闲聊，但不得虚构现实关系、共同经历或否认当前账号身份',
      strength === 'STRONG'
        ? '业务身份需要清晰稳定；当回复容易被理解为泛聊天身份时，应轻量保留账号/服务定位'
        : strength === 'LIGHT'
          ? '无需每轮强调业务身份，但身份冲突和角色漂移仍然禁止'
          : '不要求每句话都提商品或业务；身份稳定与表达自然必须同时成立',
    ]),
  };
}

function resolveStatePlanningGuidance(input: {
  understanding: CustomerServiceMessageUnderstanding;
  state: CustomerServiceConversationStateSummary | null;
  latestMessage: string;
  baseOpportunity: CustomerServiceOrchestrationPlan['businessOpportunity'];
  conversationStrategy: CustomerServiceConversationStrategyPreferences;
}): CustomerServiceStatePlanningGuidance {
  const state = input.state;
  const policy = input.conversationStrategy.policy;
  const fields = state?.canonicalFields;
  const activeTopicField = fields?.activeTopic;
  const currentIntentField = fields?.currentIntent;
  const customerGoalField = fields?.customerGoal;
  const activeTopic = usableScalarStateValue(activeTopicField, policy.stateInferenceMode);
  const currentIntent = usableScalarStateValue(currentIntentField, policy.stateInferenceMode);
  const customerGoal = usableScalarStateValue(customerGoalField, policy.stateInferenceMode);
  const canonicalExplicitFacts = usableListStateValue(fields?.explicitFacts, policy.stateInferenceMode);
  const relevantExplicitFactKeys = new Set((state?.relevantMemories || [])
    .filter((item) => ['CUSTOMER_FACT', 'CUSTOMER_CONSTRAINT'].includes(item.kind))
    .map((item) => item.key));
  const explicitFacts = canonicalExplicitFacts.filter((item) => relevantExplicitFactKeys.has(item.key));
  const preferences = policy.reuseConfirmedPreferences
    ? usableListStateValue(fields?.preferences, policy.stateInferenceMode)
    : [];
  const pendingItems = usableStringListStateValue(fields?.pendingItems, policy.stateInferenceMode);
  const resolvedItems = usableStringListStateValue(fields?.resolvedItems, policy.stateInferenceMode);
  const task = state?.activeTask || null;
  const activeTaskOpen = Boolean(task && !['RESOLVED', 'ABANDONED'].includes(task.status));
  const supportPending = Boolean(
    activeTaskOpen
    && ['ORDER_STATUS', 'LOGISTICS_DELAY', 'AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION', 'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE']
      .includes(String(task?.scenario || '')),
  );
  const typedTask = input.understanding.humanContext.conversationTaskState;
  const typedStateTruth = input.understanding.humanContext.stateTruthSignal.task;
  const typedDeltas = new Set(input.understanding.humanContext.dialogueObligation.requestedDeltas);
  const topicShiftDetected = typedTask.currentTurnRelation === 'TOPIC_SHIFT'
    || typedStateTruth.relation === 'START_NEW';
  const directReference = !topicShiftDetected && (
    typedStateTruth.relation === 'RESUME_EXISTING'
    || typedDeltas.has('RETURN_TO_PREVIOUS_TOPIC')
  );
  const canCarryUnfinished = policy.continueUnfinishedItems || supportPending;
  const structuralContinuation = !topicShiftDetected
    && typedTask.currentTurnRelation === 'CONTINUATION'
    && Boolean(
      (canCarryUnfinished && (task || pendingItems.length))
      || activeTopic || currentIntent || preferences.length || explicitFacts.length,
    );
  const softReference = !directReference && structuralContinuation;
  const shouldReferenceHistory: CustomerServiceHistoryReferenceMode = directReference ? 'DIRECT' : softReference ? 'SOFT' : 'NONE';
  const commercialAdvanceBlocked = supportPending && !topicShiftDetected;
  const staleOrConflictedValues = collectStaleOrConflictedStateValues(fields);
  const evidenceMessageIds = uniqueStrings([
    ...(state?.activeTask?.evidenceMessageIds || []),
    ...(state?.relevantMemories || []).flatMap((item) => item.evidenceMessageIds || []),
    ...Object.values(fields || {}).flatMap((field) => field?.evidenceMessageIds || []),
  ]).slice(-40);
  const requiredContinuityActs = uniqueStrings([
    shouldReferenceHistory === 'DIRECT' ? '客户明确在继续历史话题：直接承接，不重新从零开始。' : null,
    shouldReferenceHistory === 'SOFT' ? '历史状态可轻量承接；不要生硬复述整段历史。' : null,
    explicitFacts.length ? '已明确客户事实可复用，避免再次索取同一事实。' : null,
    preferences.length ? '已明确客户偏好可复用，不要反向假设或重复询问。' : null,
    activeTaskOpen && canCarryUnfinished ? '存在未完成事项；除非客户明确切换话题，不得把它误判为已解决。' : null,
    supportPending && !policy.continueUnfinishedItems ? '运营配置不承接普通未完成事项，但售后/投诉/安全类未完成事项属于安全连续性，不可被关闭。' : null,
    resolvedItems.length ? '已完成事项不得无理由重新启动；客户明确重开时再处理。' : null,
    topicShiftDetected ? '客户已明确切换话题：新话题优先，旧 State 只能作为背景，不得强行拉回。' : null,
  ]);
  const forbiddenAssumptions = uniqueStrings([
    'UNKNOWN 不是事实：信息不足时必须保留未知，不推断购买意愿、具体情绪、关系亲密度或现实经历。',
    policy.stateInferenceMode === 'EXPLICIT_ONLY'
      ? '当前配置只允许复用 EXPLICIT State；INFERRED 不得作为本轮承接依据。'
      : 'INFERRED 只能作为可回溯线索，不能升级成客户明示事实。',
    staleOrConflictedValues.length ? `以下 State 已失效或冲突，不得继续当事实：${staleOrConflictedValues.join('；')}` : null,
    topicShiftDetected ? '不得因为旧主题仍在 State 中就覆盖客户最新明确话题。' : null,
  ]);
  const shouldUseBusinessKnowledge = input.understanding.primaryScenario !== 'CASUAL_CHAT'
    || Boolean(activeTopic || currentIntent || task || explicitFacts.length || preferences.length || pendingItems.length);
  return {
    stateRevision: state?.revision || 0,
    stateAvailable: Boolean(state && (state.revision > 0 || state.currentTurn > 0)),
    policySource: input.conversationStrategy.source,
    contextCarryoverMode: policy.contextCarryoverMode,
    returningGreetingMode: policy.returningGreetingMode,
    stateInferenceMode: policy.stateInferenceMode,
    reuseConfirmedPreferences: policy.reuseConfirmedPreferences,
    continueUnfinishedItems: policy.continueUnfinishedItems,
    activeTopic,
    activeTopicStatus: activeTopicField?.status || 'UNKNOWN',
    currentIntent,
    currentIntentStatus: currentIntentField?.status || 'UNKNOWN',
    customerGoal,
    explicitFacts,
    preferences,
    pendingItems,
    resolvedItems,
    closedSemanticQuestions: state?.closedSemanticQuestions || [],
    activeTask: task ? {
      scenario: task.scenario,
      intent: task.intent,
      goal: task.goal,
      status: task.status,
      pendingSlots: [...task.pendingSlots],
      providedSlots: [...task.providedSlots],
      unresolvedGoals: [...task.unresolvedGoals],
    } : null,
    shouldReferenceHistory,
    shouldUseBusinessKnowledge,
    shouldAdvanceSales: input.baseOpportunity.mode === 'ADVANCE' && !commercialAdvanceBlocked,
    commercialAdvanceBlocked,
    topicShiftDetected,
    staleOrConflictedValues,
    forbiddenAssumptions,
    requiredContinuityActs,
    evidenceMessageIds,
    reason: topicShiftDetected
      ? '客户最新消息形成明确话题切换；旧 State 只保留为背景。'
      : directReference
        ? '客户明确引用历史内容，Planner 必须承接 canonical State。'
        : softReference
          ? '当前消息较短/回访问候，且配置允许使用可靠历史 State。'
          : state
            ? '存在 canonical State，但本轮以客户最新明确表达和当前运营策略为主，不强行引用历史。'
            : '当前没有可用 canonical State；保持 UNKNOWN 友好策略。',
  };
}

function isSafetyContinuityScenario(scenario: string) {
  return ['ORDER_STATUS', 'LOGISTICS_DELAY', 'AFTER_SALE', 'REFUND_REQUEST', 'COMPLAINT_ESCALATION', 'SAFETY_SENSITIVE', 'SECURITY_SENSITIVE']
    .includes(String(scenario || ''));
}

function constrainBusinessOpportunityForPendingService(
  opportunity: CustomerServiceOrchestrationPlan['businessOpportunity'],
): CustomerServiceOrchestrationPlan['businessOpportunity'] {
  return {
    ...opportunity,
    mode: 'NONE',
    productMentionPolicy: 'PROHIBITED',
    reason: `${opportunity.reason}；canonical State 仍有未完成服务事项，本轮禁止销售推进。`,
    allowedApproaches: uniqueStrings([...opportunity.allowedApproaches, '先完成或承接仍未完成的服务事项']),
    forbiddenApproaches: uniqueStrings([...opportunity.forbiddenApproaches, '未完成服务事项期间禁止推荐、加购、活动或成交推进']),
  };
}

function usableScalarStateValue(
  field: CustomerServiceConversationStateValue<string> | undefined,
  inferenceMode: CustomerServiceConversationStrategyPreferences['policy']['stateInferenceMode'],
) {
  if (!isUsableStateField(field, inferenceMode)) return null;
  const value = String(field?.value || '').trim();
  return value || null;
}

function usableListStateValue<T>(
  field: CustomerServiceConversationStateValue<T[]> | undefined,
  inferenceMode: CustomerServiceConversationStrategyPreferences['policy']['stateInferenceMode'],
) {
  if (!isUsableStateField(field, inferenceMode) || !Array.isArray(field?.value)) return [] as T[];
  return field.value.filter(Boolean).slice(-20);
}

function usableStringListStateValue(
  field: CustomerServiceConversationStateValue<string[]> | undefined,
  inferenceMode: CustomerServiceConversationStrategyPreferences['policy']['stateInferenceMode'],
) {
  return usableListStateValue(field, inferenceMode).map((item) => String(item || '').trim()).filter(Boolean);
}

function isUsableStateField<T>(
  field: CustomerServiceConversationStateValue<T> | undefined,
  inferenceMode: CustomerServiceConversationStrategyPreferences['policy']['stateInferenceMode'],
) {
  if (!field || field.value == null) return false;
  if (field.status === 'EXPLICIT') return field.confidence >= 0.55;
  if (field.status !== 'INFERRED' || inferenceMode === 'EXPLICIT_ONLY') return false;
  return field.confidence >= (inferenceMode === 'CONSERVATIVE' ? 0.75 : 0.55);
}

function collectStaleOrConflictedStateValues(fields?: CustomerServiceConversationStateSummary['canonicalFields']) {
  if (!fields) return [];
  const values: string[] = [];
  for (const field of Object.values(fields)) {
    if (!field || !['STALE', 'CONFLICTED'].includes(field.status) || field.value == null) continue;
    if (Array.isArray(field.value)) {
      for (const item of field.value) values.push(typeof item === 'string' ? item : JSON.stringify(item));
    } else if (typeof field.value === 'object') values.push(JSON.stringify(field.value));
    else values.push(String(field.value));
  }
  return uniqueStrings(values).slice(0, 20);
}

function defaultConversationStrategyPreferences(): CustomerServiceConversationStrategyPreferences {
  return {
    configured: false,
    source: 'SYSTEM_DEFAULT',
    policy: {
      contextCarryoverMode: 'AUTO',
      returningGreetingMode: 'SOFT_CONTINUITY',
      businessIdentityStrength: 'BALANCED',
      casualChatBoundary: 'BUSINESS_ANCHORED',
      reuseConfirmedPreferences: true,
      continueUnfinishedItems: true,
      stateInferenceMode: 'CONSERVATIVE',
      humanBehavior: {
        naturalness: 'AUTO',
        responseDensity: 'AUTO',
        colloquiality: 'AUTO',
        questionFrequency: 'AUTO',
        businessAdvance: 'AUTO',
        returningContinuity: 'AUTO',
        emoji: 'AUTO',
        identityExposure: 'AUTO',
        segmentation: 'AUTO',
      },
      contextBudget: {
        mode: 'AUTO',
        activeContextTokenBudget: 3200,
        totalInputTokenBudget: 8000,
        reservedInstructionTokens: 1800,
        maxKnowledgeTokens: 2200,
      },
    },
  };
}

function cleanPlannerText(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 160);
}

function resolveBusinessOpportunity(
  understanding: CustomerServiceMessageUnderstanding,
  salesVisibility: CustomerServiceOrchestrationPlan['salesVisibility'],
): CustomerServiceOrchestrationPlan['businessOpportunity'] {
  const openness = understanding.humanContext.commercialOpenness;
  const score = understanding.humanContext.commercialOpennessScore;
  const strategy = understanding.humanContext.commercialStrategy;
  const commonForbidden = ['不能把客户情绪当成消费理由', '不能为了成交强行延长话题', '不能在缺少需求信号时推荐具体商品'];
  const base = {
    openness,
    score,
    stage: strategy.stage,
    productMentionPolicy: strategy.productMentionPolicy,
    discoveryTarget: strategy.discoveryTarget,
    transitionSignals: strategy.transitionSignals,
  };
  if (salesVisibility === 'S0' || openness === 'CLOSED' || strategy.stage === 'NO_COMMERCIAL_MOVE') {
    return {
      ...base,
      mode: 'NONE',
      reason: strategy.reason,
      allowedApproaches: ['专注解决当前问题', '维护关系和信任'],
      forbiddenApproaches: [...commonForbidden, '禁止推荐、加购、挽留和营销铺垫'],
    };
  }
  if (strategy.stage === 'RELATIONSHIP_BUILDING') {
    return {
      ...base,
      mode: 'OBSERVE',
      reason: strategy.reason,
      allowedApproaches: ['自然回应当前关系接触', '观察客户是否愿意继续展开'],
      forbiddenApproaches: [...commonForbidden, '不得为了探索需求而连续追问'],
    };
  }
  if (strategy.stage === 'CONTEXT_DISCOVERY') {
    const shareFirst = ['INVITE_POSITIVE_SHARING', 'INVITE_EMOTIONAL_SHARING'].includes(understanding.humanContext.dominantTurnGoal.key);
    return {
      ...base,
      mode: 'DISCOVER',
      reason: shareFirst ? `${strategy.reason}；但本轮显性分享目标优先，场景探索延后。` : strategy.reason,
      allowedApproaches: shareFirst
        ? ['先承接客户当前分享欲', '用一次低压力邀请让客户继续说', '客户给出具体内容后再判断场景']
        : ['先自然回应', '只问一个与今天或近期安排有关的低压力问题', '让客户自己决定是否展开'],
      forbiddenApproaches: [...commonForbidden, '不得提商品、预算、活动、购买意愿或“想了解什么”', ...(shareFirst ? ['不得跳过分享欲直接询问最近在忙什么或今天怎么安排'] : [])],
    };
  }
  if (strategy.stage === 'NEED_EXPLORATION') {
    return {
      ...base,
      mode: 'DISCOVER',
      reason: strategy.reason,
      allowedApproaches: ['先回应客户具体场景', '只探索一个与场景相关的目标、用途或困扰'],
      forbiddenApproaches: [...commonForbidden, '不得从生活场景直接跳到具体产品', '不得同时询问偏好、预算和购买时间'],
    };
  }
  if (strategy.stage === 'VALUE_BRIDGING') {
    return {
      ...base,
      mode: 'ASSIST',
      reason: strategy.reason,
      allowedApproaches: ['先给一个有依据的专业方向', '可以连接到品类价值', '客户表示兴趣后再进入店内具体产品'],
      forbiddenApproaches: [...commonForbidden, '不得直接点名具体商品或制造紧迫感'],
    };
  }
  if (strategy.stage === 'PRODUCT_RECOMMENDATION') {
    return {
      ...base,
      mode: 'ASSIST',
      reason: strategy.reason,
      allowedApproaches: ['补齐一个关键条件', '只给少量匹配产品', '说明推荐与客户需求的对应关系'],
      forbiddenApproaches: [...commonForbidden, '不得堆商品、夸大效果或默认推荐更贵选项'],
    };
  }
  if (strategy.stage === 'DECISION_SUPPORT') {
    return {
      ...base,
      mode: 'ASSIST',
      reason: strategy.reason,
      allowedApproaches: ['围绕客户标准比较', '处理价格、效果或使用顾虑', '给出低压力倾向建议'],
      forbiddenApproaches: [...commonForbidden, '不得用优惠、库存或时限制造焦虑'],
    };
  }
  if (strategy.stage === 'LOW_PRESSURE_CLOSE') {
    return {
      ...base,
      mode: 'ADVANCE',
      reason: strategy.reason,
      allowedApproaches: ['确认已选商品或方案', '说明真实下单步骤', '只询问完成交易所必需的信息'],
      forbiddenApproaches: [...commonForbidden, '不得继续扩展推荐、擅自下单或声称锁库存'],
    };
  }
  return {
    ...base,
    mode: openness === 'EXPLICIT' ? 'ADVANCE' : openness === 'ACTIVE' ? 'ASSIST' : openness === 'LATENT' ? 'DISCOVER' : 'OBSERVE',
    reason: strategy.reason,
    allowedApproaches: ['准确回应', '根据真实信号逐步推进'],
    forbiddenApproaches: commonForbidden,
  };
}

function resolveBusinessGoal(opportunity: CustomerServiceOrchestrationPlan['businessOpportunity'], understanding: CustomerServiceMessageUnderstanding) {
  const goals: Partial<Record<CustomerServiceCommercialStage, string | null>> = {
    NO_COMMERCIAL_MOVE: null,
    RELATIONSHIP_BUILDING: null,
    CONTEXT_DISCOVERY: '通过一个自然的生活场景问题发现真实上下文，本轮不提商品。',
    NEED_EXPLORATION: '从客户已经分享的场景中确认一个真实需求维度，本轮不提具体商品。',
    VALUE_BRIDGING: '先提供专业方向价值，再让客户决定是否继续了解店内产品。',
    PRODUCT_RECOMMENDATION: '基于已确认条件提供少量匹配产品和清楚理由。',
    DECISION_SUPPORT: '帮助客户围绕自己的标准完成比较和顾虑判断。',
    LOW_PRESSURE_CLOSE: '在客户已经确认选择后提供清楚、低压力的成交下一步。',
  };
  if (opportunity.stage === 'CONTEXT_DISCOVERY' && ['INVITE_POSITIVE_SHARING', 'INVITE_EMOTIONAL_SHARING'].includes(understanding.humanContext.dominantTurnGoal.key)) {
    return '先承接客户当前分享欲；客户给出具体内容后，再从分享中发现真实生活场景。';
  }
  return goals[opportunity.stage] ?? null;
}

function resolveQuestionBudget(
  route: CustomerServiceReplyRoute,
  understanding: CustomerServiceMessageUnderstanding,
  opportunity: CustomerServiceOrchestrationPlan['businessOpportunity'],
) {
  if (route === 'EXACT_REPLY') return 0;
  const goal = understanding.humanContext.dominantTurnGoal.key;
  const continuation = understanding.humanContext.replyStrategy.continuation;
  const task = understanding.humanContext.conversationTaskState;
  const requestedDeltas = new Set(understanding.humanContext.dialogueObligation.requestedDeltas);
  if (requestedDeltas.has('NO_QUESTIONS') || requestedDeltas.has('LISTEN_ONLY')) return 0;
  if (['LISTEN_TO_VENTING', 'RESPECT_EMOTIONAL_SPACE', 'PROCESS_PROVIDED_INFORMATION', 'CLOSE_CONVERSATION'].includes(goal)) return 0;
  if (['OPEN_STATEMENT', 'WAIT_FOR_CUSTOMER', 'CLOSE_NATURALLY'].includes(continuation)) return 0;
  if (task.currentTurnRelation === 'ANSWER_TO_ASSISTANT_REQUEST' && task.providedSlots.length) return 0;
  if (goal === 'RESPOND_TO_SHARED_CONTEXT') return 0;
  if (opportunity.stage === 'CONTEXT_DISCOVERY' || ['CLARIFY_NEED', 'EXPLORE_PRODUCT_NEED', 'INVITE_POSITIVE_SHARING', 'INVITE_EMOTIONAL_SHARING'].includes(goal)) return 1;
  return 0;
}

function resolveInformationBudget(route: CustomerServiceReplyRoute, understanding: CustomerServiceMessageUnderstanding) {
  if (route === 'EXACT_REPLY') return 1;
  if (understanding.primaryScenario === 'CASUAL_CHAT') return understanding.humanContext.interactionStrategy.phase === 'OPENING' ? 2 : 3;
  return understanding.topics.length > 1 ? 4 : 3;
}

function defaultServiceGoal(understanding: CustomerServiceMessageUnderstanding) {
  const scenario = understanding.primaryScenario;
  const goals: Record<string, string> = {
    PRODUCT_CONSULT: '准确回答客户当前商品问题，只使用已验证信息。',
    PRODUCT_COMPARE: '帮助客户完成有依据的商品比较，不强迫成交。',
    PRICE_HESITATION: '尊重客户决策节奏，说明真实可用信息。',
    ORDER_STATUS: '查询订单事实；事实缺失时明确说明并给出下一步。',
    LOGISTICS_DELAY: '确认物流事实并给出真实处理节点。',
    AFTER_SALE: '确认售后问题并提供权限范围内的处理路径。',
    REFUND_REQUEST: '停止普通挽留，按退款权限和流程处理。',
    COMPLAINT_ESCALATION: '承接投诉和原问题，在事实与权限边界内继续处理；需要内部复核时保留后台标记，不自行承诺人工转接。',
    SECURITY_SENSITIVE: '保护账户安全，拒绝接收敏感凭证。',
    SAFETY_SENSITIVE: '停止可能造成风险的建议，先按安全边界回应；需要内部复核时保留后台标记，不把内部处理当成客户侧转接。',
    CASUAL_CHAT: '先理解客户为什么来聊和当前心境，自然回应，并给其决定聊天或轻度探索需求的空间。',
  };
  return goals[scenario] ?? '理解客户当前表达和真实动机，再解决最重要的问题。';
}

function buildHumanityGoal(understanding: CustomerServiceMessageUnderstanding, intentGuidance?: CustomerServiceIntentGuidance | null) {
  const base = defaultHumanityGoal(understanding);
  const relationshipGoal = readString(intentGuidance?.strategyConfig, 'relationshipGoal');
  const intentRules = readStringArray(intentGuidance?.strategyConfig, 'rules');
  return [base, relationshipGoal ? `意图关系目标：${relationshipGoal}` : null, ...intentRules.map((item) => `意图处理约束：${item}`)]
    .filter(Boolean)
    .join('；');
}

function defaultHumanityGoal(understanding: CustomerServiceMessageUnderstanding) {
  const context = understanding.humanContext;
  return [
    `先完成“${context.dominantTurnGoal.name}”：${context.dominantTurnGoal.responseRequirement}`,
    `围绕客户本轮具体内容回应，不只复述“开心、难过、着急”等抽象标签`,
    `当前是 ${context.conversationTaskState.currentTurnRelation}，任务状态 ${context.conversationTaskState.status}`,
    context.conversationTaskState.providedSlots.length ? `客户本轮已补充：${context.conversationTaskState.providedSlots.map((item) => item.name).join('、')}，不得重复索取` : null,
    context.conversationTaskState.semanticQuestions.some((item) => item.status.startsWith('CLOSED')) ? '客户已经关闭的问题不得换说法重问' : null,
    `关系事实为 ${context.relationshipState}，表达姿态为 ${context.conversationStance}；亲近不等于虚构熟悉历史`,
    `回复策略为 ${context.replyStrategy.mode}/${context.replyStrategy.continuation}，允许只回应、停顿或自然收尾，不要求每轮提问`,
    `商品提及权限为 ${context.commercialStrategy.productMentionPolicy}，没有真实信号时不转销售`,
    '把推断当作假设而不是事实',
  ].filter(Boolean).join('；');
}

function resolveRouteReason(
  route: CustomerServiceReplyRoute,
  deterministic: CustomerServiceDeterministicReplyPlan,
  understanding: CustomerServiceMessageUnderstanding,
) {
  if (route === 'EXACT_REPLY') return '命中不可改写固定全文。';
  if (route === 'TEMPLATE_REPLY') return '命中固定模板且已验证变量完整。';
  if (route === 'CONTROLLED_GENERATION') return `命中 ${deterministic.requiredPoints.length} 个必含要点和 ${deterministic.workflowSteps.length} 个流程步骤。`;
  return '未命中确定性内容，进入受动机、关系、价值和安全契约共同约束的智能生成。';
}


function resolveIntentSalesVisibility(intent?: CustomerServiceIntentGuidance | null): CustomerServiceOrchestrationPlan['salesVisibility'] | null {
  const value = readString(intent?.strategyConfig, 'salesVisibility');
  return ['S0', 'S1', 'S2', 'S3', 'S4'].includes(value) ? value as CustomerServiceOrchestrationPlan['salesVisibility'] : null;
}

function readString(value: Record<string, unknown> | undefined, key: string) {
  const item = value?.[key];
  return typeof item === 'string' && item.trim() ? item.trim() : '';
}

function readNullableString(value: Record<string, unknown> | undefined, key: string) {
  if (!value || !(key in value)) return undefined;
  const item = value[key];
  if (item === null) return null;
  return typeof item === 'string' && item.trim() ? item.trim() : undefined;
}

function readPositiveInt(value: Record<string, unknown> | undefined, key: string) {
  const number = Math.trunc(Number(value?.[key]));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function readStringArray(value: Record<string, unknown> | undefined, key: string) {
  const items = value?.[key];
  return Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
