import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import type {
  CustomerServiceActType,
  CustomerServiceExpectedInformationGain,
  CustomerServiceGroundingRequirement,
  CustomerServiceInteractionPlanV2,
  CustomerServicePlannedAct,
} from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceInteractionExecutionEnvelope } from '../interaction/customer-service-interaction-execution.type';
import { getCustomerServiceActDescriptor } from '../compliance/customer-service-act-descriptor.registry';
import { getCustomerServicePromptKernel } from './customer-service-prompt-kernel.registry';
import { resolveCustomerServiceOpeningReception } from '../../shared/context/customer-service-opening-reception.util';
import { resolveCustomerServicePublicIdentityProjection, type CustomerServicePublicIdentityProjection } from '../identity/customer-service-public-identity-projection';
import { resolveCustomerServiceHveFamilyRealization, type CustomerServiceHveFamilyRealizationProfile } from './customer-service-hve-family-realization';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';
import { resolveCustomerServiceHumanTurnRealization, type CustomerServiceHumanTurnRealizationV1 } from './customer-service-human-turn-realization';
import { resolveCustomerServiceRoleCapabilityContextProjection, type CustomerServiceRoleCapabilityContextProjectionV1 } from '../role/customer-service-role-capability-context-projection';
import { resolveCustomerServiceResolvedRoleIdentityContext, type CustomerServiceResolvedRoleIdentityContextV1 } from '../role/customer-service-resolved-role-identity-context';
import type { CustomerServiceConversationSummarySourceV1 } from '../interaction/customer-service-summary-source.contract';
export { resolveCustomerServiceConversationSummarySource } from '../interaction/customer-service-summary-source.contract';
export type { CustomerServiceConversationSummarySourceV1 } from '../interaction/customer-service-summary-source.contract';

/**
 * Projection-only business-fact grounding envelope.
 *
 * This does not decide whether a claim is true and does not create a send gate.
 * It preserves the existing Answer Obligation + server-owned business grounding
 * boundary inside the Semantic Frame. Human Realization must not reinterpret it
 * as a generic general-domain/risk/epistemic governor.
 */
export type CustomerServiceAnswerAuthorityProjectionV1 = {
  schemaVersion: 2;
  authority: 'PROJECTION_ONLY';
  /**
   * Business-fact grounding projection only. General-domain content stays open
   * unless an existing system hard constraint, PC policy, Business Knowledge or
   * current business boundary says otherwise. This projection must not become a
   * generic domain/risk/epistemic governor for Human Realization.
   */
  mode: 'NO_BUSINESS_GROUNDING_REQUIRED' | 'CURRENT_CONTEXT_ONLY' | 'CURRENT_SCOPE_GROUNDED_BUSINESS';
  evidenceState: CustomerServiceHumanTurnRealizationV1['turnComposition']['semanticDelta']['evidenceState'];
  unknownStrategy: CustomerServiceHumanTurnRealizationV1['turnComposition']['semanticDelta']['unknownStrategy'];
  knowledgeRequirement: CustomerServiceHumanTurnRealizationV1['turnComposition']['semanticDelta']['responseTarget']['knowledgeRequirement'];
  customerContextAllowed: true;
  generalGuidanceAllowed: true;
  currentScopeBusinessFactAllowed: boolean;
  allowedGroundingRefs: string[];
  evidenceBoundaryRequired: boolean;
  rewritePreservation: 'AUTHORIZED_CONTENT_ONLY';
};

export type CustomerServiceNlgExecutionBriefV2 = {
  schemaVersion: 2;
  execution: CustomerServiceInteractionExecutionEnvelope;
  kernel: ReturnType<typeof getCustomerServicePromptKernel>;
  interaction: {
    type: CustomerServiceInteractionPlanV2['interactionType'];
    primaryGoal: string;
    secondaryGoals: string[];
    completion: CustomerServiceInteractionPlanV2['completion'];
  };
  acts: {
    required: CustomerServicePlannedAct[];
    preferred: CustomerServicePlannedAct[];
    optional: CustomerServicePlannedAct[];
    hardSuppressed: CustomerServiceActType[];
    softSuppressed: CustomerServiceActType[];
  };
  grounding: {
    requirements: CustomerServiceGroundingRequirement[];
    verifiedFacts: unknown[];
    knowledge: Array<{ id: string; collectionId?: string | null; collectionName?: string | null; category: string; entityType?: string; entityKey?: string | null; aliases?: string[]; title: string; content: string; structuredData?: Record<string, unknown> | null; references?: unknown[]; authorityLevel?: string; relevanceScore?: number; matchEvidence?: string[]; revision: number }>;
    prohibitedUnknownFacts: string[];
  };
  identityProjection: {
    /** Audit-only internal role identity; never copied to customer-visible Semantic Frame. */
    internalRoleIdentity: string;
    merchantRoleName: string;
    rolePersonality: string;
    languageStyle: string;
    servicePosture: string;
    stable: boolean;
    businessAnchored: boolean;
    customerVisible: CustomerServicePublicIdentityProjection;
  };
  relationshipProjection: {
    stage: string | null;
    casualChatBoundary: string;
    recentMoveKeys: string[];
    requestedDeltas: string[];
  };
  profileProjection: {
    store: Record<string, string | boolean | number | null>;
    account: Record<string, string | boolean | number | null>;
  };
  realizationPreferences: CustomerServiceInteractionPlanV2['realizationPreferences'] & { naturalness: 'AUTO' | 'RESERVED' | 'BALANCED' | 'RELAXED' };
  context: {
    latestCustomerMessage: string;
    recentConversation: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
    activeTask: unknown;
    relevantMemories: unknown[];
  };
  responseAssets: CustomerServiceRuntimeReplyContract['policy']['assets'];
  hardBoundaries: {
    forbiddenAssumptions: string[];
    identityForbiddenDrift: string[];
    capabilityLimits: unknown;
    factPolicy: CustomerServiceRuntimeReplyContract['groundedContext']['factPolicy'];
    /** Explicit Role service/permission boundary; hard generation constraint, not style context. */
    roleBoundary: string | null;
  };
};

/**
 * V1.4 model-facing projection. This is deliberately smaller than the audit brief:
 * the model receives only semantic authority/data needed to realize the current plan.
 */
export type CustomerServiceModelFacingCanonicalActV1 = {
  id: string;
  type: CustomerServiceActType;
  necessity: CustomerServicePlannedAct['necessity'];
  semantic: string;
  authorityScope: 'PLAN_ONLY' | 'GENERAL_GUIDANCE' | 'GROUNDED_BUSINESS';
  /** Existing Canonical Grounding binding required to complete this exact Act. */
  allowedGroundingRefs: string[];
  parameters?: CustomerServicePlannedAct['parameters'];
};

export type CustomerServiceNlgSemanticFrameV1 = {
  schemaVersion: 1;
  kernel: { id: string; version: string; contentHash: string };
  interaction: {
    type: CustomerServiceInteractionPlanV2['interactionType'];
    goal: string;
    completion: CustomerServiceInteractionPlanV2['completion']['mode'];
  };
  acts: {
    required: CustomerServiceModelFacingCanonicalActV1[];
    preferred: CustomerServiceModelFacingCanonicalActV1[];
    optional: CustomerServiceModelFacingCanonicalActV1[];
    forbidden: CustomerServiceActType[];
  };
  identity: {
    aiIdentity: string | null;
    /** V1.7 only exposes customer-visible identity projection, never internal role descriptors. */
    businessLabel: string | null;
    relationLabel: string | null;
    publicName: string | null;
    surfaceLabel: string | null;
    allowedSurfaceLabels: string[];
    serviceScope: string | null;
  };
  relationship: {
    stage: string | null;
    casualChatBoundary: string;
    requestedDeltas: string[];
  };
  resolvedRoleExpression: {
    authority: 'ROLE_EXPRESSION_ONLY';
    configurationFingerprint: string;
    speakerSource: CustomerServiceRoleSpeakerProjectionV1['source'];
    account: {
      tone: string | null;
      voice: string | null;
      background: string | null;
      relationship: string | null;
    };
    store: {
      brandTone: string | null;
    };
    channel: string | null;
  };
  voice: {
    /** V1.8 stable Role-grounded speaker core. Legacy prototype prose is audit-only. */
    speaker: {
      source: CustomerServiceRoleSpeakerProjectionV1['source'];
      stableCore: CustomerServiceRoleSpeakerProjectionV1['stableCore'];
    };
    accountCommunicationStyle: string | null;
    customerRelationship: string | null;
    tone: {
      warmth: number | null;
      playfulness: number | null;
      formality: number | null;
      directness: number | null;
      emotionalIntensity: number | null;
    };
    posture: {
      familiarityDistance: string;
      conversationalEnergy: string;
      humorTolerance: string;
      advicePosture: 'REQUESTED' | 'TASK_ORIENTED' | 'RESTRAINED';
      supportMode: string;
      recommendedStance: string;
    };
    delivery: {
      warmth: 'COOL' | 'NEUTRAL' | 'WARM';
      formality: 'CASUAL' | 'NEUTRAL' | 'FORMAL';
      directness: 'SOFT' | 'BALANCED' | 'DIRECT';
      energy: 'QUIET' | 'STEADY' | 'LIGHT' | 'SERIOUS';
      texture: 'CRISP' | 'CONVERSATIONAL' | 'CALM';
    };
  };
  roleCapabilityContext: {
    authority: 'ROLE_CONTEXT_ONLY';
    source: CustomerServiceRoleCapabilityContextProjectionV1['source'];
    relationLabel: string | null;
    primaryScope: string | null;
    supportAreas: string[];
    serviceBoundary: string | null;
    domainLabel: string | null;
    realizationAnchor: string | null;
    privateRole: CustomerServiceRoleCapabilityContextProjectionV1['privateRole'];
  };
  humanTurnRealization: CustomerServiceHumanTurnRealizationV1;
  serviceRealization: {
    /** R4-G family-aware surface posture; non-authoritative and derived from the Canonical Plan. */
    family: CustomerServiceHveFamilyRealizationProfile;
    opening: {
      active: boolean;
      posture: 'NONE' | 'AMBIENT_SERVICE' | 'SERVICE_READY';
      invitation: 'FORBIDDEN' | 'OPTIONAL' | 'PREFERRED' | 'REQUIRED';
      receptionType: 'BUSINESS_SERVICE' | 'CONTENT_INTERACTION' | 'COMMUNITY_COMPANION' | 'AFTER_SALES' | 'CONSULTANT';
      allowCasualChat: boolean;
      serviceEntryTarget: string | null;
      avoidGenericChatInvitation: boolean;
      maxChars: number | null;
      maxQuestions: number;
    };
    identity: {
      mode: 'NONE' | 'CONFIRM_RELATION' | 'PUBLIC_IDENTITY' | 'AI_TRUTHFUL' | 'PUBLIC_NAME' | 'SERVICE_SCOPE';
      answerFirst: boolean;
      stopAfterAnswer: boolean;
      /** Prefer the shortest reliable business label over descriptor-rich role text. */
      preferredSurfaceLabel: string | null;
      avoidDescriptorStack: boolean;
    };
    acknowledgement: {
      mode: 'NONE' | 'PRESENCE' | 'LIGHT' | 'SPECIFIC';
      fuseWithNextValue: boolean;
      avoidFullRestatement: boolean;
    };
    currentTurnValue: {
      mode: 'NONE' | 'RELATIONAL' | 'DIRECT' | 'GENERAL_GUIDANCE' | 'GROUNDED_INFORMATION' | 'TASK_PROGRESS';
      necessity: 'NONE' | CustomerServicePlannedAct['necessity'];
      expectedInformationGains: CustomerServiceExpectedInformationGain[];
      known: string[];
      mustAddBeyondKnown: boolean;
    };
    contribution: {
      target: 'NONE' | 'DIRECT_ANSWER' | 'USEFUL_DIRECTION' | 'GROUNDED_FACT' | 'DECISION_REDUCTION' | 'TASK_ADVANCE';
      avoidReframeOnly: boolean;
      contributeBeforeOptionalAsk: boolean;
    };
    question: {
      posture: 'NONE' | 'REQUIRED_DIRECT' | 'OPTIONAL_AFTER_VALUE' | 'OPTIONAL_DECISION_RELEVANT';
      target: string | null;
      decisionPurpose: string | null;
      known: string[];
      missing: string[];
      requiresPriorValue: boolean;
      /** R4-E: ranking hint only; never creates question authority. */
      selectionRule: 'NONE' | 'REQUIRED_SLOT' | 'MAX_DECISION_DELTA';
      avoidNavigationOnly: boolean;
    };
    multiTurn: {
      /** Cross-turn realization only; sourced from the authoritative AssistantMoveLedger projection. */
      varyFromRecentStructure: boolean;
      avoidQuestionEnding: boolean;
      avoidRestatement: boolean;
      recentPatternKeys: string[];
    };
    rhythm: {
      shape: 'ONE_BEAT' | 'IDENTITY_THEN_SERVICE_ENTRY' | 'ACK_THEN_SERVICE_ENTRY' | 'ACK_THEN_VALUE' | 'VALUE_THEN_QUESTION' | 'TASK_THEN_WAIT' | 'SEQUENTIAL';
      maxSentences: number;
      maxQuestions: number;
      stopWhenComplete: boolean;
    };
  };
  realization: CustomerServiceNlgExecutionBriefV2['realizationPreferences'];
  /** Projection-only; Claim/Hard/Plan remain the actual authorities. */
  answerAuthority: CustomerServiceAnswerAuthorityProjectionV1;
  grounding: {
    facts: unknown[];
    knowledge: Array<{ id: string; collectionId?: string | null; collectionName?: string | null; category: string; entityType?: string; entityKey?: string | null; aliases?: string[]; title: string; content: string; structuredData?: Record<string, unknown> | null; references?: unknown[]; authorityLevel?: string; relevanceScore?: number; matchEvidence?: string[]; revision: number }>;
    prohibitedUnknownFacts: string[];
  };
  context: {
    latestCustomerMessage: string;
    recentConversation: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
    summarySource: CustomerServiceConversationSummarySourceV1;
    activeTask: unknown | null;
  };
  responseAssets: CustomerServiceRuntimeReplyContract['policy']['assets'];
  hardBoundaries: {
    forbiddenAssumptions: string[];
    identityForbiddenDrift: string[];
    capabilityLimits: unknown;
    roleBoundary: string | null;
  };
  projectionDiagnostics: {
    exposedFields: string[];
    withheldFields: string[];
  };
};

export function compileCustomerServiceNlgExecutionBriefV2(input: {
  contract: CustomerServiceRuntimeReplyContract;
  execution: CustomerServiceInteractionExecutionEnvelope;
}): CustomerServiceNlgExecutionBriefV2 {
  const contract = input.contract;
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) throw new Error('HVE-3 NLG Execution Brief requires canonical InteractionPlan v2');
  const strategy = contract.businessContext.conversationStrategy.policy;
  const realizationPreferences = resolveHveRealizationPreferences(plan, strategy.humanBehavior);
  return {
    schemaVersion: 2,
    execution: input.execution,
    kernel: getCustomerServicePromptKernel('GENERATION'),
    interaction: {
      type: plan.interactionType,
      primaryGoal: plan.goal.primary,
      secondaryGoals: [...plan.goal.secondary],
      completion: {
        ...plan.completion,
        conditions: plan.completion.conditions.map((item) => ({ ...item })),
      },
    },
    acts: {
      required: cloneActs(plan.acts.filter((item) => item.necessity === 'REQUIRED')),
      preferred: cloneActs(plan.acts.filter((item) => item.necessity === 'PREFERRED')),
      optional: cloneActs(plan.acts.filter((item) => item.necessity === 'OPTIONAL')),
      hardSuppressed: plan.suppressedActs.filter((item) => item.enforcement === 'HARD').map((item) => item.type),
      softSuppressed: plan.suppressedActs.filter((item) => item.enforcement === 'SOFT').map((item) => item.type),
    },
    grounding: {
      requirements: plan.grounding.requirements.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs] })),
      verifiedFacts: contract.groundedContext.facts.slice(-12),
      knowledge: contract.businessContext.knowledgeEntries.map((item) => ({
        id: item.id,
        collectionId: item.collectionId,
        collectionName: item.collectionName,
        category: item.category,
        entityType: item.entityType,
        entityKey: item.entityKey,
        aliases: item.aliases,
        title: item.title,
        content: item.content,
        structuredData: item.structuredData,
        references: item.references,
        authorityLevel: item.authorityLevel,
        relevanceScore: item.relevanceScore,
        matchEvidence: item.matchEvidence,
        revision: item.revision,
      })),
      prohibitedUnknownFacts: [...plan.grounding.prohibitedUnknownFacts],
    },
    identityProjection: {
      internalRoleIdentity: contract.identity.merchantRole.publicIdentity || contract.identity.prototype.identity || '业务角色',
      merchantRoleName: contract.identity.merchantRole.name || '',
      rolePersonality: contract.identity.prototype.personality || '专业、稳定、负责',
      languageStyle: contract.identity.prototype.languageStyle || '自然、清楚、简洁',
      servicePosture: contract.identity.prototype.servicePosture || '先解决问题，再维护关系',
      stable: contract.orchestrationPlan.identityConstraint.stable,
      businessAnchored: contract.orchestrationPlan.identityConstraint.businessAnchored,
      customerVisible: clonePublicIdentityProjection(resolveRuntimePublicIdentityProjection(contract)),
    },
    relationshipProjection: {
      stage: plan.behaviorContext.relationshipStage,
      casualChatBoundary: strategy.casualChatBoundary,
      recentMoveKeys: [...plan.behaviorContext.recentMoveKeys],
      requestedDeltas: [...plan.behaviorContext.requestedDeltas],
    },
    profileProjection: {
      store: projectProfile(contract.businessContext.storeProfile?.profile, [
        'brandName', 'mainBusiness', 'brandIntro', 'serviceBoundary', 'businessHours',
      ]),
      account: projectProfile(contract.businessContext.accountProfile?.profile, [
        'publicIdentity', 'tone', 'voice', 'background', 'relationship',
        'customerRelationship', 'relationshipDescription', 'communicationStyle',
        'permissions', 'greetingServiceScope', 'businessVisibility',
      ]),
    },
    realizationPreferences,
    context: {
      latestCustomerMessage: contract.groundedContext.latestCustomerMessage,
      recentConversation: contract.generationContext.conversationHistory.map((item) => ({ ...item })),
      activeTask: contract.generationContext.conversationState.activeTask,
      relevantMemories: contract.generationContext.conversationState.relevantMemories.slice(-8),
    },
    responseAssets: contract.policy.assets.map((item) => ({ ...item })),
    hardBoundaries: {
      forbiddenAssumptions: [...contract.orchestrationPlan.stateGuidance.forbiddenAssumptions],
      identityForbiddenDrift: [...contract.orchestrationPlan.identityConstraint.forbiddenDrift],
      capabilityLimits: contract.orchestrationPlan.serviceCapabilities,
      factPolicy: contract.groundedContext.factPolicy,
      roleBoundary: resolveRuntimeRoleCapabilityContext(contract).serviceContext.serviceBoundary,
    },
  };
}

export function compileCustomerServiceNlgSemanticFrameV1(input: {
  contract: CustomerServiceRuntimeReplyContract;
  execution: CustomerServiceInteractionExecutionEnvelope;
}): CustomerServiceNlgSemanticFrameV1 {
  const audit = compileCustomerServiceNlgExecutionBriefV2(input);
  const plan = input.contract.orchestrationPlan.interactionPlanV2!;
  const planned = new Set(plan.acts.map((item) => item.type));
  // Architecture Convergence Phase 2: static Business Knowledge supports grounded
  // recommendation/fact Acts only. Runtime status is a separate authority and must
  // use verified facts / active task evidence, never static Knowledge entries.
  const needsKnowledge = ['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT']
    .some((type) => planned.has(type as CustomerServiceActType));
  const needsFacts = needsKnowledge || ['EXECUTE_SERVICE_STEP', 'REQUEST_REQUIRED_SLOT', 'EXPLAIN_BOUNDARY']
    .some((type) => planned.has(type as CustomerServiceActType));
  const needsActiveTask = ['REQUEST_REQUIRED_SLOT', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP', 'REQUEST_HANDOFF']
    .some((type) => planned.has(type as CustomerServiceActType));
  const needsAssets = input.contract.policy.assets.length > 0 && plan.acts.some((item) => item.sources.some((source) => source.kind === 'RESPONSE_ASSET'));
  const resolvedRoleIdentity = resolveRuntimeResolvedRoleIdentity(input.contract);
  const relationshipDynamics = input.contract.generationContext.conversationState.relationshipDynamics;
  const behaviorHistory = input.contract.generationContext.conversationState.behaviorHistory;
  const openingReception = resolveCustomerServiceOpeningReception({
    accountProfile: input.contract.businessContext.accountProfile,
    storeProfile: input.contract.businessContext.storeProfile,
    latestMessage: input.contract.groundedContext.latestCustomerMessage,
    conversationHistory: input.contract.generationContext.conversationHistory,
    understanding: input.contract.understanding,
  });
  const identityVisible = planned.has('DISCLOSE_PUBLIC_IDENTITY') || planned.has('CONFIRM_ROLE') || planned.has('EXPLAIN_SERVICE_SCOPE');
  const publicIdentityProjection = resolveRuntimePublicIdentityProjection(input.contract);
  const identitySurfaceLabel = identityVisible ? publicIdentityProjection.preferredSurfaceLabel : null;
  const identityAuthority = {
    aiIdentity: planned.has('DISCLOSE_AI_IDENTITY') ? '智能客服/AI 客服' : null,
    businessLabel: identityVisible ? publicIdentityProjection.businessLabel : null,
    relationLabel: identityVisible ? publicIdentityProjection.relationLabel : null,
    publicName: planned.has('DISCLOSE_NAME') ? publicIdentityProjection.publicName : null,
    surfaceLabel: identitySurfaceLabel,
    allowedSurfaceLabels: identityVisible ? [...publicIdentityProjection.allowedSurfaceLabels] : [],
    serviceScope: planned.has('EXPLAIN_SERVICE_SCOPE')
      ? firstText(
          resolvedRoleIdentity.serviceContext.greetingServiceScope,
          resolvedRoleIdentity.serviceContext.serviceBoundary,
          resolvedRoleIdentity.storeExpression.mainBusiness,
        )
      : null,
  };

  const speakerProjection = resolvedRoleIdentity.speakerProjection;
  const roleCapabilityContext = resolveRuntimeRoleCapabilityContext(input.contract, resolvedRoleIdentity);
  const serviceRealization = resolveServiceRealization({
    plan,
    openingReception,
    behaviorHistory,
    identitySurfaceLabel,
    groundedKnowledgeAvailable: audit.grounding.knowledge.length > 0,
  });
  // H0.2-A contract hygiene: HumanTurn consumes already-owned resolved Role +
  // conversation state. Do not thread raw classification.humanContext into this
  // realization Authority; doing so would duplicate Understanding-side behavior context.
  const humanTurnRealization = resolveCustomerServiceHumanTurnRealization({
    plan,
    speaker: speakerProjection,
    resolvedRoleIdentity,
    interactionPosture: input.contract.persona.interactionPostureProjection || fallbackInteractionPostureProjection(),
    roleCapabilityContext,
    conversationState: input.contract.generationContext.conversationState,
    recentConversationCount: input.contract.generationContext.conversationHistory.length,
    serviceRealization,
    identity: identityAuthority,
    latestCustomerMessage: audit.context.latestCustomerMessage,
  });
  // R5-B-H1 least-privilege surface: the model receives only identity material needed by this turn.
  // Full public identity authority remains available to compliance/trace outside this model-facing projection.
  const identity = projectModelFacingIdentity(identityAuthority, humanTurnRealization);
  const projectedRequiredActs = projectCustomerServiceCanonicalActsForSemanticFrame(audit.acts.required);
  const projectedPreferredActs = projectCustomerServiceCanonicalActsForSemanticFrame(audit.acts.preferred);
  const projectedOptionalActs = projectCustomerServiceCanonicalActsForSemanticFrame(audit.acts.optional);
  const projectedForbiddenActs = projectCustomerServiceCanonicalForbiddenActsForSemanticFrame(plan);

  const exposedFields = [
    'interaction', 'acts', 'resolvedRoleExpression', 'roleCapabilityContext', 'humanTurnRealization', 'answerAuthority', 'latestCustomerMessage', 'recentConversation', 'hardBoundaries',
    ...(identity.aiIdentity ? ['identity.aiIdentity'] : []),
    ...(identity.businessLabel ? ['identity.businessLabel'] : []),
    ...(identity.relationLabel ? ['identity.relationLabel'] : []),
    ...(identity.publicName ? ['identity.publicName'] : []),
    ...(identity.surfaceLabel ? ['identity.surfaceLabel'] : []),
    ...(identity.allowedSurfaceLabels.length ? ['identity.allowedSurfaceLabels'] : []),
    ...(identity.serviceScope ? ['identity.serviceScope'] : []),
    ...(needsKnowledge ? ['grounding.knowledge'] : []),
    ...(needsFacts ? ['grounding.facts'] : []),
    ...(needsActiveTask ? ['context.activeTask'] : []),
    ...(needsAssets ? ['responseAssets'] : []),
  ];

  return {
    schemaVersion: 1,
    kernel: { id: audit.kernel.id, version: audit.kernel.version, contentHash: audit.kernel.contentHash },
    interaction: {
      type: audit.interaction.type,
      goal: audit.interaction.primaryGoal,
      completion: audit.interaction.completion.mode,
    },
    acts: {
      required: projectedRequiredActs,
      preferred: projectedPreferredActs,
      optional: projectedOptionalActs,
      forbidden: projectedForbiddenActs,
    },
    identity,
    relationship: {
      stage: audit.relationshipProjection.stage,
      casualChatBoundary: audit.relationshipProjection.casualChatBoundary,
      requestedDeltas: [...audit.relationshipProjection.requestedDeltas],
    },
    resolvedRoleExpression: {
      authority: 'ROLE_EXPRESSION_ONLY',
      configurationFingerprint: resolvedRoleIdentity.provenance.configurationFingerprint,
      speakerSource: speakerProjection.source,
      account: { ...resolvedRoleIdentity.accountExpression },
      store: { brandTone: resolvedRoleIdentity.storeExpression.brandTone },
      channel: resolvedRoleIdentity.channel,
    },
    voice: {
      speaker: { source: speakerProjection.source, stableCore: speakerProjection.stableCore },
      accountCommunicationStyle: resolvedRoleIdentity.accountExpression.voice,
      customerRelationship: resolvedRoleIdentity.accountExpression.relationship,
      tone: { ...input.contract.strategyPolicy.resolved.tone },
      posture: {
        familiarityDistance: relationshipDynamics.relationshipDistance,
        conversationalEnergy: relationshipDynamics.conversationTempo,
        humorTolerance: relationshipDynamics.humorAcceptance,
        // H0.2-A: advice posture must come from the already-resolved Canonical Plan /
        // conversation state, not from raw Understanding humanContext. A canonical
        // PROVIDE_GENERAL_GUIDANCE act means the current turn has authorized requested
        // recommendation value; otherwise task posture is inherited from relationship state.
        advicePosture: planned.has('PROVIDE_GENERAL_GUIDANCE')
          ? 'REQUESTED'
          : relationshipDynamics.supportMode === 'PROBLEM_SOLVING' ? 'TASK_ORIENTED' : 'RESTRAINED',
        supportMode: relationshipDynamics.supportMode,
        recommendedStance: relationshipDynamics.recommendedStance,
      },
      delivery: resolveVoiceDelivery(input.contract.strategyPolicy.resolved.tone, relationshipDynamics.conversationTempo),
    },
    roleCapabilityContext: projectModelFacingRoleCapabilityContext(roleCapabilityContext),
    humanTurnRealization,
    serviceRealization,
    realization: audit.realizationPreferences,
    answerAuthority: resolveCustomerServiceAnswerAuthorityProjection({
      plan,
      humanTurnRealization,
    }),
    grounding: {
      facts: needsFacts ? audit.grounding.verifiedFacts : [],
      knowledge: needsKnowledge ? audit.grounding.knowledge : [],
      prohibitedUnknownFacts: [...audit.grounding.prohibitedUnknownFacts],
    },
    context: {
      latestCustomerMessage: audit.context.latestCustomerMessage,
      recentConversation: audit.context.recentConversation.slice(-8),
      // Summary Source is compiled once from the server-owned Canonical
      // Transcript. Model-facing NLG is a read-only consumer and must never
      // reinterpret active context as conversation-history authority.
      summarySource: input.contract.generationContext.summarySource,
      activeTask: needsActiveTask ? audit.context.activeTask : null,
    },
    responseAssets: needsAssets ? audit.responseAssets : [],
    hardBoundaries: {
      forbiddenAssumptions: [...audit.hardBoundaries.forbiddenAssumptions],
      identityForbiddenDrift: [...audit.hardBoundaries.identityForbiddenDrift],
      capabilityLimits: needsFacts ? audit.hardBoundaries.capabilityLimits : null,
      roleBoundary: audit.hardBoundaries.roleBoundary,
    },
    projectionDiagnostics: {
      exposedFields,
      withheldFields: [
        'audit.sources', 'audit.reasonCode', 'audit.trackingKey', 'audit.guidelineIds',
        'identity.internalRoleIdentity',
        'identity.internalRoleDescriptors',
        ...(identity.businessLabel ? [] : ['identity.businessLabel']),
        ...(identity.relationLabel ? [] : ['identity.relationLabel']),
        ...(identity.publicName ? [] : ['identity.publicName']),
        ...(identity.surfaceLabel ? [] : ['identity.surfaceLabel']),
        ...(identity.serviceScope ? [] : ['identity.serviceScope']),
        ...(needsKnowledge ? [] : ['grounding.knowledge']),
        ...(needsFacts ? [] : ['grounding.facts']),
        ...(needsActiveTask ? [] : ['context.activeTask']),
        ...(needsAssets ? [] : ['responseAssets']),
      ],
    },
  };
}


function projectModelFacingIdentity(
  authority: CustomerServiceNlgSemanticFrameV1['identity'],
  realization: CustomerServiceHumanTurnRealizationV1,
): CustomerServiceNlgSemanticFrameV1['identity'] {
  const empty = {
    aiIdentity: null,
    businessLabel: null,
    relationLabel: null,
    publicName: null,
    surfaceLabel: null,
    allowedSurfaceLabels: [] as string[],
    serviceScope: null,
  };
  const surface = realization.identitySurface.preferredSurface;
  switch (realization.identitySurface.mode) {
    case 'RELATION_ONLY':
      return {
        ...empty,
        relationLabel: surface || authority.relationLabel,
        surfaceLabel: surface || authority.relationLabel,
        allowedSurfaceLabels: [surface || authority.relationLabel].filter(Boolean) as string[],
      };
    case 'BUSINESS_RELATION_MINIMAL': {
      const preferred = surface || authority.surfaceLabel || authority.businessLabel || authority.relationLabel;
      return {
        ...empty,
        businessLabel: authority.businessLabel,
        relationLabel: authority.relationLabel,
        surfaceLabel: preferred,
        allowedSurfaceLabels: [preferred, authority.relationLabel, authority.businessLabel].filter(Boolean).slice(0, 2) as string[],
      };
    }
    case 'AI_TRUTHFUL':
      return { ...empty, aiIdentity: authority.aiIdentity || '智能客服/AI 客服' };
    case 'PUBLIC_NAME':
      return { ...empty, publicName: surface || authority.publicName, surfaceLabel: surface || authority.publicName };
    case 'SERVICE_SCOPE':
      return { ...empty, serviceScope: authority.serviceScope, surfaceLabel: surface };
    case 'NONE':
    default:
      return empty;
  }
}

function resolveServiceRealization(input: {
  plan: CustomerServiceInteractionPlanV2;
  openingReception: ReturnType<typeof resolveCustomerServiceOpeningReception>;
  behaviorHistory: {
    consecutiveQuestionEndingTurns: number;
    recentOptionalQuestionCount: number;
    recentRequiredQuestionCount: number;
    recentSelfIntroCount: number;
    recentServiceScopeCount: number;
    recentRestatementCount: number;
    recentStructureKeys: string[];
    lastAssistantAskedQuestion: boolean;
  };
  identitySurfaceLabel: string | null;
  /**
   * Existing Grounding availability only. This does not select a grounded Act;
   * it prevents a Canonical grounded value Act from being flattened behind an
   * earlier generic value Act when the grounded evidence required to realize it
   * is actually present.
   */
  groundedKnowledgeAvailable: boolean;
}): CustomerServiceNlgSemanticFrameV1['serviceRealization'] {
  const { plan, openingReception, behaviorHistory, identitySurfaceLabel, groundedKnowledgeAvailable } = input;
  const familyRealization = resolveCustomerServiceHveFamilyRealization(plan);
  const planned = new Set(plan.acts.map((item) => item.type));
  const invitation = plan.acts.find((item) => item.type === 'OPEN_SERVICE_INVITATION');
  const requiredQuestion = plan.acts.find((item) => item.type === 'REQUEST_REQUIRED_SLOT');
  const optionalQuestion = plan.acts.find((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE');
  const questionAct = requiredQuestion || optionalQuestion;
  const selectedValueActs = plan.acts.filter((item) => [
    'PROVIDE_GENERAL_GUIDANCE',
    'RECOMMEND_GROUNDED_ITEM',
    'EXPLAIN_GROUNDED_FACT',
    'DIRECT_ANSWER',
    'EXECUTE_SERVICE_STEP',
    'REPORT_STATUS',
  ].includes(item.type));
  // R2.2 Grounded realization convergence: Canonical may legitimately select
  // DIRECT_ANSWER / PROVIDE_GENERAL_GUIDANCE together with a grounded value Act.
  // The former implementation collapsed that multi-value Plan to the first Act,
  // so a later RECOMMEND_GROUNDED_ITEM could disappear from currentTurnValue even
  // though its Grounding was available and the full Canonical Plan still selected it.
  // Grounded evidence is server-owned truth, so when the already-selected grounded
  // Act has actual Knowledge available it becomes the realization carrier; Required
  // generic value Acts remain losslessly present in canonicalPlan and still must be
  // completed. With no Grounding, realization still must not manufacture a grounded
  // obligation; a separately selected required guidance Act may carry an existing
  // recommendation obligation before the legacy first-value fallback is considered.
  const groundedValueAct = groundedKnowledgeAvailable
    ? selectedValueActs.find((item) => ['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(item.type))
    : undefined;
  // R2.2 reverse protection: removing an invalid grounded recommendation must not
  // collapse an otherwise valid multi-value recommendation turn back to the first
  // generic value Act. When the existing Answer Obligation is RECOMMENDATION and
  // Canonical already selected REQUIRED PROVIDE_GENERAL_GUIDANCE, that already-owned
  // Act is the correct non-grounded realization carrier. This only chooses among
  // selected Acts; it never creates, upgrades, or suppresses an Act.
  const requiredRecommendationGuidanceAct = !groundedValueAct
    && plan.answerObligation?.responseTarget.focus === 'RECOMMENDATION'
    ? selectedValueActs.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED')
    : undefined;
  const valueAct = groundedValueAct || requiredRecommendationGuidanceAct || selectedValueActs[0];
  const expectedInformationGains = [...new Set(plan.acts
    .map((item) => item.parameters?.expectedInformationGain)
    .filter(Boolean))] as CustomerServiceExpectedInformationGain[];
  const valueMode: CustomerServiceNlgSemanticFrameV1['serviceRealization']['currentTurnValue']['mode'] = !valueAct
    ? (plan.acts.some((item) => ['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE'].includes(item.type)) ? 'RELATIONAL' : 'NONE')
    : valueAct.type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_GUIDANCE'
      : ['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(valueAct.type) ? 'GROUNDED_INFORMATION'
        : ['EXECUTE_SERVICE_STEP', 'REPORT_STATUS'].includes(valueAct.type) ? 'TASK_PROGRESS'
          : 'DIRECT';
  const acknowledgementAct = plan.acts.find((item) => [
    'ACKNOWLEDGE_PREFERENCE',
    'ACKNOWLEDGE_PROBLEM',
    'EMOTIONAL_ACK',
    'LIGHT_ACK',
    'PRESENCE_ACK',
  ].includes(item.type));
  const identityMode: CustomerServiceNlgSemanticFrameV1['serviceRealization']['identity']['mode'] = planned.has('DISCLOSE_AI_IDENTITY')
    ? 'AI_TRUTHFUL'
    : planned.has('DISCLOSE_NAME')
      ? 'PUBLIC_NAME'
      : planned.has('CONFIRM_ROLE')
        ? 'CONFIRM_RELATION'
        : planned.has('DISCLOSE_PUBLIC_IDENTITY')
          ? 'PUBLIC_IDENTITY'
          : planned.has('EXPLAIN_SERVICE_SCOPE')
            ? 'SERVICE_SCOPE'
            : 'NONE';
  const acknowledgementMode: CustomerServiceNlgSemanticFrameV1['serviceRealization']['acknowledgement']['mode'] = planned.has('PRESENCE_ACK')
    ? 'PRESENCE'
    : planned.has('ACKNOWLEDGE_PROBLEM') || planned.has('EMOTIONAL_ACK')
      ? 'SPECIFIC'
      : planned.has('ACKNOWLEDGE_PREFERENCE') || planned.has('LIGHT_ACK')
        ? 'LIGHT'
        : 'NONE';
  // Question existence is already resolved by the final Canonical Plan + RoleTurnPolicy.
  // Realization may shape an authorized question, but it must not suppress or recreate it.
  const canonicalOptionalQuestionHeld = Boolean(
    !optionalQuestion
    && plan.suppressedActs.some((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE')
  );
  const recentPatternKeys = behaviorHistory.recentStructureKeys
    .slice(-3)
    .map(normalizeMultiTurnPatternKey)
    .filter(Boolean);
  const repeatedRecentPattern = recentPatternKeys.length >= 2
    && recentPatternKeys[recentPatternKeys.length - 1] === recentPatternKeys[recentPatternKeys.length - 2];
  const questionPosture: CustomerServiceNlgSemanticFrameV1['serviceRealization']['question']['posture'] = requiredQuestion
    ? 'REQUIRED_DIRECT'
    : optionalQuestion
      ? (valueAct ? 'OPTIONAL_AFTER_VALUE' : 'OPTIONAL_DECISION_RELEVANT')
      : 'NONE';
  const openingInvitation: CustomerServiceNlgSemanticFrameV1['serviceRealization']['opening']['invitation'] = invitation?.necessity === 'REQUIRED'
    ? 'REQUIRED'
    : invitation?.necessity === 'PREFERRED'
      ? 'PREFERRED'
      : invitation?.necessity === 'OPTIONAL'
        ? 'OPTIONAL'
        : 'FORBIDDEN';
  const openingPosture: CustomerServiceNlgSemanticFrameV1['serviceRealization']['opening']['posture'] = !openingReception.active
    ? 'NONE'
    : openingInvitation === 'FORBIDDEN' ? 'AMBIENT_SERVICE' : 'SERVICE_READY';
  const identityFollowUpAllowed = identityMode === 'CONFIRM_RELATION'
    && Boolean(invitation)
    && plan.completion.mode !== 'STOP_AFTER_REQUIRED';
  const shape: CustomerServiceNlgSemanticFrameV1['serviceRealization']['rhythm']['shape'] = identityMode !== 'NONE'
    ? (identityFollowUpAllowed ? 'IDENTITY_THEN_SERVICE_ENTRY' : 'ONE_BEAT')
    : openingReception.active && invitation
      ? 'ACK_THEN_SERVICE_ENTRY'
      : requiredQuestion
        ? 'TASK_THEN_WAIT'
        : optionalQuestion && valueAct
          ? 'VALUE_THEN_QUESTION'
          : acknowledgementAct && valueAct
            ? 'ACK_THEN_VALUE'
            : plan.acts.filter((item) => item.type !== 'STOP').length <= 1 ? 'ONE_BEAT' : 'SEQUENTIAL';
  const maxQuestions = requiredQuestion ? 1
    : optionalQuestion ? 1
      : canonicalOptionalQuestionHeld ? 0
        : invitation ? Math.min(1, openingReception.maxQuestions) : 0;
  const maxSentences = shape === 'IDENTITY_THEN_SERVICE_ENTRY'
    ? 2
    : identityMode !== 'NONE' || openingReception.active
      ? 1
      : shape === 'VALUE_THEN_QUESTION' || shape === 'ACK_THEN_VALUE' ? 2 : 3;
  return {
    family: familyRealization,
    opening: {
      active: openingReception.active,
      posture: openingPosture,
      invitation: openingInvitation,
      receptionType: openingReception.receptionType,
      allowCasualChat: openingReception.allowCasualChatOnOpening,
      serviceEntryTarget: invitation?.parameters?.target || null,
      avoidGenericChatInvitation: Boolean(
        invitation
        && ['BUSINESS_SERVICE', 'AFTER_SALES', 'CONSULTANT'].includes(openingReception.receptionType)
        && !openingReception.allowCasualChatOnOpening
      ),
      maxChars: openingReception.active ? openingReception.maxChars : null,
      maxQuestions,
    },
    identity: {
      mode: identityMode,
      answerFirst: identityMode !== 'NONE',
      stopAfterAnswer: ['AI_IDENTITY_QUERY', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(plan.interactionType)
        || (plan.interactionType === 'ROLE_CONFIRMATION' && !identityFollowUpAllowed),
      preferredSurfaceLabel: identityMode === 'NONE' ? null : identitySurfaceLabel,
      avoidDescriptorStack: identityMode !== 'NONE',
    },
    acknowledgement: {
      mode: acknowledgementMode,
      fuseWithNextValue: acknowledgementMode !== 'NONE' && Boolean(valueAct),
      avoidFullRestatement: true,
    },
    currentTurnValue: {
      mode: valueMode,
      necessity: valueAct?.necessity || 'NONE',
      expectedInformationGains,
      known: [...(valueAct?.parameters?.known || acknowledgementAct?.parameters?.known || [])],
      mustAddBeyondKnown: expectedInformationGains.some((item) => ['ADD_GENERAL_GUIDANCE', 'ADD_GROUNDED_INFORMATION', 'ADVANCE_REQUIRED_TASK', 'ANSWER_CURRENT_FOCUS'].includes(item)),
    },
    contribution: {
      target: valueAct?.type === 'DIRECT_ANSWER'
        ? 'DIRECT_ANSWER'
        : valueAct?.type === 'PROVIDE_GENERAL_GUIDANCE'
          ? 'USEFUL_DIRECTION'
          : valueAct && ['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(valueAct.type)
            ? 'GROUNDED_FACT'
            : valueAct && ['EXECUTE_SERVICE_STEP', 'REPORT_STATUS'].includes(valueAct.type)
              ? 'TASK_ADVANCE'
              : optionalQuestion
                ? 'DECISION_REDUCTION'
                : 'NONE',
      avoidReframeOnly: Boolean(valueAct?.type === 'PROVIDE_GENERAL_GUIDANCE'),
      contributeBeforeOptionalAsk: Boolean(optionalQuestion && valueAct),
    },
    question: {
      posture: questionPosture,
      target: questionAct?.parameters?.target || null,
      decisionPurpose: questionAct?.parameters?.decisionPurpose || null,
      known: [...(questionAct?.parameters?.known || [])],
      missing: [...(questionAct?.parameters?.missing || [])],
      requiresPriorValue: Boolean(optionalQuestion && valueAct),
      selectionRule: requiredQuestion ? 'REQUIRED_SLOT' : optionalQuestion ? 'MAX_DECISION_DELTA' : 'NONE',
      avoidNavigationOnly: Boolean(optionalQuestion),
    },
    multiTurn: {
      varyFromRecentStructure: repeatedRecentPattern,
      avoidQuestionEnding: canonicalOptionalQuestionHeld,
      avoidRestatement: behaviorHistory.recentRestatementCount >= 1,
      recentPatternKeys,
    },
    rhythm: {
      shape,
      maxSentences,
      maxQuestions,
      stopWhenComplete: plan.completion.mode === 'STOP_AFTER_REQUIRED'
        || canonicalOptionalQuestionHeld,
    },
  };
}


function normalizeMultiTurnPatternKey(value: string) {
  const tokens = String(value || '')
    .split('+')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const normalized: string[] = [];
  const add = (value: string) => { if (!normalized.includes(value)) normalized.push(value); };
  for (const token of tokens) {
    if (['IDENTITY', 'SCOPE'].includes(token)) add('IDENTITY');
    else if (['ACK', 'RESTATE'].includes(token)) add('ACK');
    else if (['ANSWER', 'SUGGEST', 'BRIDGE', 'DIRECT'].includes(token)) add('VALUE');
    else if (token === 'CTA') add('CTA');
    else if (token === 'QUESTION') add('QUESTION');
    else if (['CLOSE', 'STOP'].includes(token)) add('CLOSE');
  }
  return normalized.join('+');
}

function resolveVoiceDelivery(
  tone: { warmth: number | null; formality: number | null; directness: number | null },
  tempo: 'QUIET' | 'STEADY' | 'LIGHT' | 'SERIOUS',
): CustomerServiceNlgSemanticFrameV1['voice']['delivery'] {
  const warmth = tone.warmth === null ? 'NEUTRAL' : tone.warmth >= 65 ? 'WARM' : tone.warmth <= 35 ? 'COOL' : 'NEUTRAL';
  const formality = tone.formality === null ? 'NEUTRAL' : tone.formality >= 65 ? 'FORMAL' : tone.formality <= 35 ? 'CASUAL' : 'NEUTRAL';
  const directness = tone.directness === null ? 'BALANCED' : tone.directness >= 70 ? 'DIRECT' : tone.directness <= 40 ? 'SOFT' : 'BALANCED';
  const texture = tempo === 'SERIOUS' || tempo === 'QUIET' ? 'CALM' : directness === 'DIRECT' ? 'CRISP' : 'CONVERSATIONAL';
  return { warmth, formality, directness, energy: tempo, texture };
}



function resolveRuntimeRoleCapabilityContext(
  contract: CustomerServiceRuntimeReplyContract,
  resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1,
): CustomerServiceRoleCapabilityContextProjectionV1 {
  return contract.persona.roleCapabilityContextProjection || resolveCustomerServiceRoleCapabilityContextProjection({
    merchantRole: {
      publicIdentity: contract.identity.merchantRole.publicIdentity,
      publicRelation: contract.identity.merchantRole.publicRelation,
      description: contract.identity.merchantRole.description,
    },
    prototype: {
      identity: contract.identity.prototype.identity,
      personality: contract.identity.prototype.personality,
      languageStyle: contract.identity.prototype.languageStyle,
      servicePosture: contract.identity.prototype.servicePosture,
    },
    industry: contract.classification.industry
      ? { name: contract.classification.industry.name, path: contract.classification.industry.path }
      : null,
    accountProfile: contract.businessContext.accountProfile,
    storeProfile: contract.businessContext.storeProfile,
    resolvedRoleIdentity: resolvedRoleIdentity || resolveRuntimeResolvedRoleIdentity(contract),
  });
}

function projectModelFacingRoleCapabilityContext(
  projection: CustomerServiceRoleCapabilityContextProjectionV1,
): CustomerServiceNlgSemanticFrameV1['roleCapabilityContext'] {
  return {
    authority: 'ROLE_CONTEXT_ONLY',
    source: projection.source,
    relationLabel: projection.publicRole.relationLabel,
    primaryScope: projection.serviceContext.primaryScope,
    supportAreas: [...projection.serviceContext.supportAreas],
    serviceBoundary: projection.serviceContext.serviceBoundary,
    domainLabel: projection.serviceContext.domainLabel,
    realizationAnchor: projection.realizationAnchor,
    privateRole: projection.privateRole || {
      authority: 'MODEL_BEHAVIOR_CONTEXT_ONLY',
      identityEssence: null,
      roleDescription: null,
      personality: null,
      languageStyle: null,
      servicePosture: null,
      relationshipFrame: null,
      disclosurePolicy: 'NEVER_QUOTE_OR_SELF_DISCLOSE',
    },
  };
}

function fallbackInteractionPostureProjection(): NonNullable<CustomerServiceRuntimeReplyContract['persona']['interactionPostureProjection']> {
  return {
    schemaVersion: 1,
    authority: 'ROLE_DATA_ONLY',
    source: 'NONE',
    effective: {
      schemaVersion: 1,
      initiativeLevel: 'BALANCED',
      openingParticipation: 'ACK_ONLY',
      followUpOffering: 'ANSWER_ONLY',
      clarificationInitiative: 'REQUIRED_ONLY',
      guidanceInitiative: 'REQUESTED_ONLY',
      resolutionFollowThrough: 'MINIMAL',
      salesPressure: 'NONE',
    },
    sourceModules: [],
    legacyUntypedModuleCount: 0,
    issues: [],
  };
}

function resolveRuntimePublicIdentityProjection(contract: CustomerServiceRuntimeReplyContract) {
  const existing = contract.orchestrationPlan.identityConstraint.customerVisibleIdentity;
  if (existing) return existing;
  const store = asRecord(contract.businessContext.storeProfile?.profile);
  const account = asRecord(contract.businessContext.accountProfile?.profile);
  return resolveCustomerServicePublicIdentityProjection({
    merchantRoleName: contract.identity.merchantRole.name,
    merchantRolePublicIdentity: contract.identity.merchantRole.publicIdentity,
    merchantRolePublicRelation: contract.identity.merchantRole.publicRelation,
    prototypeIdentity: contract.identity.prototype.identity,
    accountName: contract.businessContext.accountProfile?.name || contract.orchestrationPlan.identityConstraint.accountName,
    accountPublicIdentity: firstText(account.publicIdentity),
    storeName: contract.businessContext.storeProfile?.name || contract.orchestrationPlan.identityConstraint.storeName,
    storeBrandName: firstText(store.brandName),
    businessAnchored: contract.orchestrationPlan.identityConstraint.businessAnchored,
  });
}

function resolveRuntimeResolvedRoleIdentity(contract: CustomerServiceRuntimeReplyContract): CustomerServiceResolvedRoleIdentityContextV1 {
  if (contract.persona.resolvedRoleIdentity) return contract.persona.resolvedRoleIdentity;
  return resolveCustomerServiceResolvedRoleIdentityContext({
    merchantRole: {
      id: contract.identity.merchantRole.id,
      code: contract.identity.merchantRole.code,
      name: contract.identity.merchantRole.name,
      description: contract.identity.merchantRole.description,
      publicIdentity: contract.identity.merchantRole.publicIdentity,
      publicRelation: contract.identity.merchantRole.publicRelation,
      revision: contract.identity.merchantRole.revision,
    },
    prototype: {
      id: contract.identity.prototype.id,
      code: contract.identity.prototype.code,
      identity: contract.identity.prototype.identity,
      personality: contract.identity.prototype.personality,
      languageStyle: contract.identity.prototype.languageStyle,
      servicePosture: contract.identity.prototype.servicePosture,
      speakerProfile: contract.identity.prototype.speakerProfile,
      revision: contract.identity.prototype.revision,
    },
    accountProfile: contract.businessContext.accountProfile,
    storeProfile: contract.businessContext.storeProfile,
  });
}


function clonePublicIdentityProjection(value: CustomerServicePublicIdentityProjection): CustomerServicePublicIdentityProjection {
  return {
    ...value,
    allowedSurfaceLabels: [...value.allowedSurfaceLabels],
    withheldInternalLabels: [...value.withheldInternalLabels],
  };
}

export function resolveCustomerServiceAnswerAuthorityProjection(input: {
  plan: CustomerServiceInteractionPlanV2;
  humanTurnRealization: CustomerServiceHumanTurnRealizationV1;
}): CustomerServiceAnswerAuthorityProjectionV1 {
  const semantic = input.humanTurnRealization.turnComposition.semanticDelta;
  const allowedGroundingRefs = uniqueStrings(
    input.humanTurnRealization.turnComposition.segmentPlan.flatMap((segment) => segment.allowedGroundingRefs || []),
  );
  const businessFactsRequired = semantic.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED';
  const groundedBusinessAllowed = businessFactsRequired
    && (semantic.evidenceState === 'GROUNDED_KNOWLEDGE' || allowedGroundingRefs.length > 0);
  const mode: CustomerServiceAnswerAuthorityProjectionV1['mode'] = !businessFactsRequired
    ? 'NO_BUSINESS_GROUNDING_REQUIRED'
    : groundedBusinessAllowed
      ? 'CURRENT_SCOPE_GROUNDED_BUSINESS'
      : 'CURRENT_CONTEXT_ONLY';

  return {
    schemaVersion: 2,
    authority: 'PROJECTION_ONLY',
    mode,
    evidenceState: semantic.evidenceState,
    unknownStrategy: semantic.unknownStrategy,
    knowledgeRequirement: semantic.responseTarget.knowledgeRequirement,
    customerContextAllowed: true,
    generalGuidanceAllowed: true,
    currentScopeBusinessFactAllowed: mode === 'CURRENT_SCOPE_GROUNDED_BUSINESS',
    allowedGroundingRefs,
    evidenceBoundaryRequired: businessFactsRequired
      && input.plan.acts.some((act) => act.type === 'EXPLAIN_BOUNDARY')
      && semantic.unknownStrategy !== 'NOT_APPLICABLE',
    rewritePreservation: 'AUTHORIZED_CONTENT_ONLY',
  };
}


/**
 * Lossless execution projection of every Act already selected by the Canonical
 * InteractionPlan, including the minimal Act identity and Grounding refs needed to
 * complete a bound GROUNDED_BUSINESS Act before Generation. Control Acts such as STOP do not create visible wording, but
 * they must remain model-facing execution boundaries instead of disappearing
 * before Generation. This function only projects existing Acts; it never adds,
 * removes, ranks, or specializes them.
 */
export function projectCustomerServiceCanonicalActsForSemanticFrame(items: CustomerServicePlannedAct[]): CustomerServiceModelFacingCanonicalActV1[] {
  return items.map((item) => {
    const descriptor = getCustomerServiceActDescriptor(item.type);
    return {
      id: item.id,
      type: item.type,
      necessity: item.necessity,
      semantic: descriptor.semanticDefinition,
      authorityScope: descriptor.authorityScope || 'PLAN_ONLY',
      allowedGroundingRefs: uniqueStrings(
        (item.grounding || [])
          .filter((grounding) => grounding.source === 'KNOWLEDGE' && grounding.status === 'SATISFIED')
          .flatMap((grounding) => grounding.evidenceRefs || []),
      ),
      parameters: item.parameters ? { ...item.parameters, known: item.parameters.known ? [...item.parameters.known] : undefined, missing: item.parameters.missing ? [...item.parameters.missing] : undefined } : undefined,
    };
  });
}

/**
 * A selected Act and a forbidden Act are mutually exclusive model instructions.
 * HARD conflicts have already been removed by the Canonical compiler; when final
 * Role policy intentionally retains an Act beside a SOFT suppression, selected
 * Canonical ownership wins and the soft diagnostic is not projected as forbidden.
 */
export function projectCustomerServiceCanonicalForbiddenActsForSemanticFrame(
  plan: CustomerServiceInteractionPlanV2,
): CustomerServiceActType[] {
  const selectedActTypes = new Set(plan.acts.map((item) => item.type));
  return [...new Set(plan.suppressedActs.map((item) => item.type))]
    .filter((type) => !selectedActTypes.has(type));
}

function resolveHveRealizationPreferences(
  plan: CustomerServiceInteractionPlanV2,
  human: {
    naturalness: 'AUTO' | 'RESERVED' | 'BALANCED' | 'RELAXED';
    responseDensity: 'AUTO' | 'COMPACT' | 'BALANCED' | 'RICH';
    colloquiality: 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH';
    emoji: 'AUTO' | 'NONE' | 'LIGHT' | 'NATURAL';
    segmentation: 'AUTO' | 'COMPACT' | 'BALANCED' | 'SEQUENTIAL';
  },
): CustomerServiceNlgExecutionBriefV2['realizationPreferences'] {
  return {
    density: plan.realizationPreferences.density !== 'AUTO'
      ? plan.realizationPreferences.density
      : human.responseDensity === 'COMPACT' ? 'SHORT' : human.responseDensity === 'RICH' ? 'RICH' : human.responseDensity === 'BALANCED' ? 'NORMAL' : 'AUTO',
    toneProfile: plan.realizationPreferences.toneProfile,
    colloquiality: plan.realizationPreferences.colloquiality !== 'AUTO' ? plan.realizationPreferences.colloquiality : human.colloquiality,
    segmentation: plan.realizationPreferences.segmentation !== 'AUTO'
      ? plan.realizationPreferences.segmentation
      : human.segmentation === 'COMPACT' ? 'SINGLE' : human.segmentation === 'SEQUENTIAL' ? 'SEQUENTIAL' : 'AUTO',
    emoji: plan.realizationPreferences.emoji !== 'AUTO' ? plan.realizationPreferences.emoji : human.emoji,
    naturalness: human.naturalness,
  };
}

function cloneActs(items: CustomerServicePlannedAct[]) {
  return items.map((item) => ({
    ...item,
    sources: item.sources.map((source) => ({ ...source })),
    grounding: item.grounding?.map((grounding) => ({ ...grounding, evidenceRefs: [...grounding.evidenceRefs] })),
    dependsOnActIds: item.dependsOnActIds ? [...item.dependsOnActIds] : undefined,
    parameters: item.parameters ? { ...item.parameters, known: item.parameters.known ? [...item.parameters.known] : undefined, missing: item.parameters.missing ? [...item.parameters.missing] : undefined } : undefined,
  }));
}

function projectProfile(value: unknown, allowedKeys: string[]): Record<string, string | boolean | number | null> {
  const source = asRecord(value);
  const result: Record<string, string | boolean | number | null> = {};
  for (const key of allowedKeys) {
    const current = source[key];
    if (typeof current === 'string') {
      const cleaned = current.trim().replace(/\s+/g, ' ').slice(0, 500);
      if (cleaned) result[key] = cleaned;
    } else if (typeof current === 'boolean' || typeof current === 'number') {
      result[key] = current;
    } else if (current === null) {
      result[key] = null;
    }
  }
  return result;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 240) : '';
    if (text) return text;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: string[]) { return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]; }
