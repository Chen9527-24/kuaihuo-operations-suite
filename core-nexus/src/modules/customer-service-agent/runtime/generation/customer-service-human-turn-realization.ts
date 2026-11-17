import type { CustomerServiceActType, CustomerServiceInteractionPlanV2 } from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';
import type { CustomerServiceRoleInteractionPostureProjectionV1 } from '../role/customer-service-role-interaction-posture-projection';
import type { CustomerServiceHveFamilyRealizationProfile } from './customer-service-hve-family-realization';
import type { CustomerServiceRoleCapabilityContextProjectionV1 } from '../role/customer-service-role-capability-context-projection';
import type {
  CustomerServiceConversationStateSummary,
  CustomerServiceMemoryKind,
} from '../state/customer-service-conversation-state.type';
import type { CustomerServiceResolvedRoleIdentityContextV1 } from '../role/customer-service-resolved-role-identity-context';
import {
  resolveCustomerServiceRoleConditionedParticipationFrame,
  type CustomerServiceRoleConditionedParticipationFrameV1,
} from './customer-service-role-conditioned-participation';

export type CustomerServiceHumanTurnRealizationV1 = {
  schemaVersion: 1;
  authority: 'REALIZATION_ONLY';
  persona: {
    source: CustomerServiceRoleSpeakerProjectionV1['source'];
    preset: CustomerServiceRoleSpeakerProjectionV1['stableCore']['preset'];
    preserveStableCore: true;
    /** Coarse semantic band retained for existing diagnostics. */
    presence: {
      warmth: 'COOL' | 'NEUTRAL' | 'WARM';
      directness: 'SOFT' | 'BALANCED' | 'DIRECT';
      formality: 'CASUAL' | 'NEUTRAL' | 'FORMAL';
      energy: 'QUIET' | 'STEADY' | 'LIVELY';
      playfulness: 'RESTRAINED' | 'LIGHT' | 'PLAYFUL';
      expressiveness: 'RESTRAINED' | 'BALANCED' | 'EXPRESSIVE';
    };
    /**
     * High-fidelity projection of the same stable Role speaker source. This does not
     * create behavior; it preserves within-band differences that would otherwise be
     * lost when the model sees only three-level presence labels.
     */
    corePresenceFidelity: {
      warmth: number;
      directness: number;
      formality: number;
      energy: number;
      playfulness: number;
      emotionalExpressiveness: number;
    };
  };
  /**
   * High-fidelity private Role material used by the one HumanTurn authority.
   * It is realization context only: it cannot create Acts/facts/permissions and
   * must never be surfaced as a self-description unless identity Acts authorize it.
   */
  roleEmbodiment: {
    authority: 'REALIZATION_CONTEXT_ONLY';
    /**
     * Stable Role prose is high-fidelity persona context, not current-turn procedure.
     * Generic sequencing embedded in profile text cannot override NeedAlignment,
     * SharedContext or TurnComposition for acknowledgement/reference/opening order.
     */
    turnExecutionAuthority: 'NONE';
    identity: {
      roleDescription: string | null;
      prototypeIdentity: string | null;
    };
    rolePrototype: {
      personality: string | null;
      languageStyle: string | null;
      servicePosture: string | null;
    };
    accountExpression: {
      tone: string | null;
      voice: string | null;
      background: string | null;
      relationship: string | null;
    };
    storeExpression: {
      brandTone: string | null;
    };
    channel: string | null;
    configurationFingerprint: string | null;
  };
  /**
   * Projection of already-owned conversation state. This preserves the reality
   * of an ongoing exchange independently from semantic previousFocus, so a topic
   * facet change does not make the same person behave as if the relationship reset.
   */
  conversationReality: {
    authority: 'REALIZATION_CONTEXT_ONLY';
    currentTurn: number;
    priorConversationMessages: number;
    /**
     * Server-owned exchange continuity. This is intentionally independent from the
     * semantic AnswerObligation continuity: a new semantic facet can still belong to
     * the same ongoing human exchange.
     */
    exchange: {
      state: 'FRESH' | 'ONGOING';
      priorAssistantTurns: number;
    };
    /**
     * Factual interaction continuity only. H0.2-C deliberately does not project
     * relationshipDynamics here: that legacy producer mixes explicit feedback with
     * language-specific warmth/humor/emotion heuristics and therefore cannot own
     * high-fidelity HumanTurn relationship reality.
     */
    continuity: {
      lastAssistantMoveAccepted: boolean | null;
      lastAssistantMoveRejected: boolean;
      recentRequestedDeltas: string[];
    };
    /**
     * Current user-turn reception of the immediately previous assistant response.
     * This is a projection of the existing server-owned DialogueObligation after
     * the current customer turn has been reduced into Conversation State. It is
     * factual continuity only; it cannot create Acts or surface repair language.
     */
    currentFeedback: {
      reception: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'INSUFFICIENT' | 'REJECTED' | 'CORRECTED' | 'ESCALATED' | 'WITHDRAWN' | 'UNCLEAR';
      handlingMode: 'NONE' | 'REFINE' | 'CORRECT' | 'BOUNDARY' | 'WITHDRAW' | 'TRUST_REPAIR';
      strategyChangeRequired: boolean;
      correctionTarget: 'CONTENT' | 'TONE' | 'WORDING' | 'INTERACTION' | 'BUSINESS_ACTION' | null;
      requestedDeltas: string[];
    };
    activeTask: {
      status: string;
      goal: string;
      responsibility: string;
      createdTurn: number;
      lastActiveTurn: number;
      pendingSlots: string[];
      providedSlots: string[];
      unresolvedGoals: string[];
      anchors: string[];
    } | null;
    /**
     * Server-selected customer-side facts/preferences/constraints that remain relevant
     * to the current task. This is lived conversation context, not a new Planner or
     * permission source: it may shape how the same person judges the current turn,
     * but cannot create Acts, merchant facts, or hidden assumptions.
     */
    relevantMemories: Array<{
      kind: CustomerServiceMemoryKind;
      key: string;
      value: string;
      sourceTurn: number;
      confidence: number;
    }>;
    recentSuspendedTasks: Array<{
      status: string;
      goal: string;
      responsibility: string;
      createdTurn: number;
      lastActiveTurn: number;
      pendingSlots: string[];
      unresolvedGoals: string[];
      anchors: string[];
    }>;
    recentAssistantMoves: Array<{
      turn: number;
      excerpt: string;
      accepted: boolean | null;
      rejected: boolean;
      requestedDeltas: string[];
    }>;
  };
  /** Generic Role-conditioned participation; realization-only and downstream of Canonical Plan. */
  participation: CustomerServiceRoleConditionedParticipationFrameV1;
  /**
   * Surface-weight projection for already-authorized behavior. This is not a Planner:
   * Canonical Plan / Response Target still decide what the turn must do; this only
   * tells the one HumanTurn authority which authorized contribution should carry the
   * conversational weight for this Role/need, and whether acknowledgement/explanation
   * is primary value, relational support, or can stay implicit in useful action.
   */
  needAlignment: {
    authority: 'REALIZATION_ONLY';
    primaryContribution:
      | 'ANSWER'
      | 'RECOMMEND'
      | 'GUIDE'
      | 'EXPLAIN'
      | 'CLARIFY'
      | 'EXECUTE'
      | 'REPORT'
      | 'BOUNDARY'
      | 'RELATE'
      | 'CLOSE';
    acknowledgementRealization: 'NONE' | 'IMPLICIT_IN_PRIMARY' | 'EXPLICIT_RELATIONAL' | 'EXPLICIT_REQUIRED';
    explanationRole: 'PRIMARY_VALUE' | 'SUPPORT_PRIMARY_ONLY' | 'MINIMAL';
    openingBias: 'PRIMARY_FIRST' | 'RELATIONAL_FIRST';
    understandingProof: 'BY_USEFUL_PRIMARY_CONTRIBUTION' | 'BY_EXPLICIT_RELATIONAL_ACK';
    constraints: {
      preserveAllRequiredActs: true;
      cannotCreateActs: true;
      cannotChangeFactsOrPermission: true;
      noNeedRestatementAsSubstituteForValue: true;
    };
  };
  /**
   * F1 Shared Context / Given-New projection. This stays inside the one HumanTurn
   * realization authority: it does not resolve facts, create Acts, or judge wording.
   * It only says how already-shared information should be referenced before the
   * authorized new contribution begins.
   */
  sharedContext: {
    authority: 'REALIZATION_ONLY';
    currentTurnInformation: 'GIVEN_BY_CUSTOMER';
    priorContext: 'NONE' | 'ESTABLISHED';
    referentialMode: 'IMPLICIT' | 'LIGHT_ANCHOR' | 'EXPLICIT';
    referenceBasis:
      | 'CURRENT_TURN_GIVEN'
      | 'ESTABLISHED_THREAD'
      | 'NEW_FACET_IN_ESTABLISHED_THREAD'
      | 'CANONICAL_RESTATEMENT'
      | 'AMBIGUITY_RESOLUTION'
      | 'CORRECTION_BINDING'
      | 'PRECISION_BINDING';
    newValueStart: 'PRIMARY_CONTRIBUTION' | 'RELATIONAL_ACK_THEN_PRIMARY' | 'REQUIRED_CLARIFICATION';
    /**
     * Read-only carryover reality for the immediately previous assistant contribution.
     * This does not create Acts or facts; it only tells realization whether the prior
     * contribution is already accepted/shared, rejected, corrected, or still unresolved.
     */
    priorContributionStatus:
      | 'NONE'
      | 'ACCEPTED'
      | 'PARTIALLY_ACCEPTED'
      | 'REJECTED'
      | 'CORRECTED'
      | 'UNRESOLVED';
    priorContributionReuse:
      | 'NORMAL'
      | 'ADVANCE_FROM_ACCEPTED'
      | 'PRESERVE_ACCEPTED_REFINE_REMAINDER'
      | 'CHANGE_FROM_REJECTED'
      | 'CORRECT_PRIOR'
      | 'FOLLOW_REQUESTED_DELTA';
    avoidEvaluativeReceptionBeforeValue: boolean;
    mustAdvanceBeyondGiven: boolean;
    constraints: {
      cannotCreateActs: true;
      cannotChangeFactsOrPermission: true;
      cannotInventReferents: true;
      explicitReferenceRequiresSemanticNeed: true;
    };
  };
  turnShape: {
    mode:
      | 'MINIMAL_RECIPROCAL'
      | 'CONVERSATIONAL_CLOSE'
      | 'LIGHT_SERVICE_ENTRY'
      | 'IDENTITY_CONFIRMATION'
      | 'IDENTITY_THEN_LIGHT_ENTRY'
      | 'IDENTITY_DISCLOSURE'
      | 'DIRECT_VALUE'
      | 'VALUE_THEN_QUESTION'
      | 'REQUIRED_QUESTION'
      | 'TASK_DIRECT'
      | 'RELATIONAL_RESPONSE'
      | 'FLEXIBLE';
    preferredBeats: 1 | 2 | 3;
    maxBeats: 1 | 2 | 3;
    acknowledgement: 'OMIT_IF_REDUNDANT' | 'FUSE_WITH_VALUE' | 'SEPARATE_ONLY_WHEN_RELATIONALLY_NEEDED';
    questionPlacement: 'NONE' | 'INLINE_OR_FINAL' | 'FINAL_SEPARATE' | 'REQUIRED_DIRECT';
    stopBias: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  turnComposition: {
    authority: 'REALIZATION_ONLY';
    semanticDelta: {
      continuity: 'NEW_NEED' | 'FOLLOW_UP_NEW_FACET' | 'FOLLOW_UP_REFINEMENT' | 'CONTINUATION' | 'CORRECTION';
      currentFocus: string;
      currentFocusLabel: string;
      previousFocus: string | null;
      mustAddNewInformation: boolean;
      avoidRepeat: boolean;
      evidenceState: 'NOT_REQUIRED' | 'GROUNDED_KNOWLEDGE' | 'CONTEXT_ONLY';
      unknownStrategy: 'NOT_APPLICABLE' | 'ANSWER_AVAILABLE_CONTEXT_ONLY' | 'ANSWER_KNOWN_THEN_BOUNDARY';
      responseTarget: {
        focus: string;
        requestedSpecificity: 'MINIMAL' | 'SUMMARY' | 'DIRECTION' | 'CONCRETE' | 'DETAIL' | 'EXHAUSTIVE';
        priorCoverage: 'NONE' | 'SAME_FOCUS_PARTIAL' | 'DIFFERENT_FOCUS' | 'CORRECTION';
        requiredDelta: 'NONE' | 'NEW_FACET' | 'MORE_SPECIFIC' | 'MORE_DETAIL' | 'DIFFERENT_APPROACH' | 'CORRECT' | 'COMPLETE_CURRENT_FOCUS';
        knowledgeRequirement: 'NOT_REQUIRED' | 'GENERAL_CONTEXT_ALLOWED' | 'BUSINESS_FACT_GROUNDING_REQUIRED';
        unresolvedNeed: string | null;
        source: 'UNDERSTANDING' | 'STATE' | 'SEMANTIC_SIGNAL' | 'COMPATIBILITY_FALLBACK';
        confidence: number;
        evidence: string[];
      };
    };
    beats: Array<'ACKNOWLEDGE' | 'VALUE' | 'BOUNDARY' | 'QUESTION' | 'SERVICE_PRESENCE' | 'CLOSE'>;
    segmentPlan: Array<{
      index: number;
      purposes: Array<'ACKNOWLEDGE' | 'VALUE' | 'BOUNDARY' | 'QUESTION' | 'SERVICE_PRESENCE' | 'CLOSE'>;
      roleSignals: Array<'WARMTH' | 'JUDGMENT' | 'REASSURANCE' | 'SERVICE_PRESENCE' | 'RELATIONSHIP' | 'DIRECTNESS'>;
      /** Server-owned projection from Canonical Plan; the model never declares these Acts. */
      plannedActRefs: string[];
      plannedActTypes: CustomerServiceActType[];
      /** Server-owned Knowledge evidence envelope projected from planned grounded Acts. */
      allowedGroundingRefs: string[];
      mustCarryNewValue: boolean;
    }>;
    preferredMessageSegments: 1 | 2 | 3;
    maxMessageSegments: 1 | 2 | 3;
    segmentation: 'SINGLE' | 'OPTIONAL_SEQUENTIAL' | 'PREFER_SEQUENTIAL';
    eachSegmentNeedsNewValue: true;
  };
  texture: {
    spokenRegister: 'RESTRAINED' | 'NATURAL' | 'HIGH';
    brevity: CustomerServiceRoleSpeakerProjectionV1['stableCore']['conversationalTexture']['brevity'];
    sentenceShape: CustomerServiceRoleSpeakerProjectionV1['stableCore']['conversationalTexture']['sentenceShape'];
    fragmentAllowance: 'LOW' | 'MEDIUM' | 'HIGH';
    ellipsisAllowance: 'LOW' | 'MEDIUM' | 'HIGH';
    rhythmVariation: 'LOW' | 'MEDIUM' | 'HIGH';
    connectiveDensity: 'LOW' | 'MEDIUM' | 'HIGH';
    explicitReasoning: 'LOW' | 'MEDIUM';
    completionCadence: 'LOW' | 'MEDIUM' | 'HIGH';
    sentenceParticleLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    emoji: 'NONE' | 'LIGHT' | 'NATURAL';
  };
  identitySurface: {
    mode: 'NONE' | 'RELATION_ONLY' | 'BUSINESS_RELATION_MINIMAL' | 'AI_TRUTHFUL' | 'PUBLIC_NAME' | 'SERVICE_SCOPE';
    preferredSurface: string | null;
    fallbackSurface: string | null;
    answerFirst: boolean;
    answerOnly: boolean;
    maxIdentityUnits: 1;
    avoidDescriptorStack: true;
  };
  opening: {
    mode: 'NONE' | 'RECIPROCAL_GREETING' | 'GREETING_WITH_LIGHT_ENTRY' | 'PRESENCE_CONFIRMATION';
    serviceEntryMode: 'NONE' | 'SERVICE_NEED' | 'CASUAL_ALLOWED';
    serviceEntryTarget: string | null;
    avoidGenericChatInvitation: boolean;
    literalPresenceNeeded: boolean;
    avoidPresenceFormula: boolean;
  };
  /** R5-B-H1: executable surface budget, not a business-policy source. */
  surfaceBudget: {
    softMaxChars: number;
    maxValueUnits: 0 | 1 | 2;
    maxPreQuestionClauses: 1 | 2 | 3;
    recapPolicy: 'NONE' | 'LIGHT_ONLY_IF_RELATIONALLY_NEEDED';
    optionalQuestionPresentation: 'NONE' | 'OPEN' | 'NATURAL_CONTRAST' | 'DIRECT_REQUIRED';
    maxPresentedOptions: 0 | 2;
    stopAfterQuestion: boolean;
    completionPolicy: 'STOP_WHEN_ENOUGH' | 'ALLOW_BRIEF_WRAP';
  };
  antiAiCadence: {
    avoidActPerSentence: true;
    avoidRecapBeforeValue: boolean;
    avoidQuestionRationaleAfterQuestion: true;
    avoidSelfProcessNarration: true;
    avoidExhaustiveCompletion: boolean;
    preferImplicitTransitions: true;
    doNotExplainConversationStrategy: true;
  };
  adaptation: {
    customerMessageShape: 'BRIEF' | 'NORMAL' | 'EXPRESSIVE';
    relationshipDistance: string;
    family: CustomerServiceHveFamilyRealizationProfile['family'];
    mirrorIntensity: 'RESTRAINED' | 'BALANCED';
    varyFromRecentStructure: boolean;
  };
};

type ServiceRealizationInput = {
  family: CustomerServiceHveFamilyRealizationProfile;
  opening: {
    active: boolean;
    invitation: 'FORBIDDEN' | 'OPTIONAL' | 'PREFERRED' | 'REQUIRED';
    receptionType: 'BUSINESS_SERVICE' | 'CONTENT_INTERACTION' | 'COMMUNITY_COMPANION' | 'AFTER_SALES' | 'CONSULTANT';
    allowCasualChat: boolean;
    serviceEntryTarget: string | null;
    avoidGenericChatInvitation: boolean;
  };
  identity: {
    mode: 'NONE' | 'CONFIRM_RELATION' | 'PUBLIC_IDENTITY' | 'AI_TRUTHFUL' | 'PUBLIC_NAME' | 'SERVICE_SCOPE';
    answerFirst: boolean;
    stopAfterAnswer: boolean;
  };
  acknowledgement: {
    mode: 'NONE' | 'PRESENCE' | 'LIGHT' | 'SPECIFIC';
    fuseWithNextValue: boolean;
  };
  currentTurnValue: { mode: string };
  question: {
    posture: 'NONE' | 'REQUIRED_DIRECT' | 'OPTIONAL_AFTER_VALUE' | 'OPTIONAL_DECISION_RELEVANT';
    target?: string | null;
    decisionPurpose?: string | null;
    selectionRule?: 'NONE' | 'REQUIRED_SLOT' | 'MAX_DECISION_DELTA';
    avoidNavigationOnly?: boolean;
  };
  multiTurn: {
    varyFromRecentStructure: boolean;
  };
  rhythm: {
    shape: 'ONE_BEAT' | 'IDENTITY_THEN_SERVICE_ENTRY' | 'ACK_THEN_SERVICE_ENTRY' | 'ACK_THEN_VALUE' | 'VALUE_THEN_QUESTION' | 'TASK_THEN_WAIT' | 'SEQUENTIAL';
    maxSentences: number;
    maxQuestions: number;
    stopWhenComplete: boolean;
  };
};

export function resolveCustomerServiceHumanTurnRealization(input: {
  plan: CustomerServiceInteractionPlanV2;
  speaker: CustomerServiceRoleSpeakerProjectionV1;
  resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1 | null;
  interactionPosture: CustomerServiceRoleInteractionPostureProjectionV1;
  roleCapabilityContext: CustomerServiceRoleCapabilityContextProjectionV1;
  conversationState: CustomerServiceConversationStateSummary;
  recentConversationCount: number;
  serviceRealization: ServiceRealizationInput;
  identity: {
    businessLabel: string | null;
    relationLabel: string | null;
    publicName: string | null;
    surfaceLabel: string | null;
  };
  latestCustomerMessage: string;
}): CustomerServiceHumanTurnRealizationV1 {
  const { plan, speaker, interactionPosture, serviceRealization, identity } = input;
  const stable = speaker.stableCore;
  const latest = String(input.latestCustomerMessage || '').trim();
  // Opening realization consumes the typed Canonical interaction/opening contract only.
  // Raw greeting/presence wording must not become a second behavior owner.
  const pureGreeting = plan.interactionType === 'SOCIAL_GREETING';
  const presenceQuery = false;
  const hasValue = serviceRealization.currentTurnValue.mode !== 'NONE' && serviceRealization.currentTurnValue.mode !== 'RELATIONAL';
  const hasOptionalQuestion = serviceRealization.question.posture.startsWith('OPTIONAL');
  const hasRequiredQuestion = serviceRealization.question.posture === 'REQUIRED_DIRECT';
  const hasConversationalClose = plan.acts.some((item) => item.type === 'NATURAL_CLOSE' && item.necessity === 'REQUIRED');

  const turnMode = resolveTurnMode({
    interactionType: plan.interactionType,
    pureGreeting,
    presenceQuery,
    hasValue,
    hasOptionalQuestion,
    hasRequiredQuestion,
    hasConversationalClose,
    serviceRealization,
  });

  const preferredBeats = resolvePreferredBeats(turnMode, stable.conversationalTexture.brevity);
  const maxBeats = Math.max(
    preferredBeats,
    Math.min(3, Math.max(1, serviceRealization.rhythm.maxSentences)),
  ) as 1 | 2 | 3;

  const identitySurface = resolveIdentitySurface(serviceRealization.identity.mode, identity, serviceRealization.identity.stopAfterAnswer);
  const spokenRegister = stable.conversationalTexture.colloquiality === 'HIGH'
    ? 'HIGH'
    : stable.conversationalTexture.colloquiality === 'LOW' ? 'RESTRAINED' : 'NATURAL';
  const connectiveDensity = stable.conversationalTexture.sentenceShape === 'FLOWING'
    ? 'MEDIUM'
    : stable.conversationalTexture.sentenceShape === 'CRISP' ? 'LOW' : 'LOW';
  const explicitReasoning = stable.corePresence.formality >= 78 && stable.corePresence.directness < 58
    ? 'MEDIUM'
    : 'LOW';
  const questionPlacement = hasRequiredQuestion
    ? 'REQUIRED_DIRECT'
    : hasOptionalQuestion
      ? (stable.deliveryStyle.segmentation === 'SEQUENTIAL' ? 'FINAL_SEPARATE' : 'INLINE_OR_FINAL')
      : 'NONE';
  const acknowledgement = serviceRealization.acknowledgement.mode === 'NONE'
    ? 'OMIT_IF_REDUNDANT'
    : serviceRealization.acknowledgement.fuseWithNextValue
      ? 'FUSE_WITH_VALUE'
      : serviceRealization.acknowledgement.mode === 'SPECIFIC'
        ? 'SEPARATE_ONLY_WHEN_RELATIONALLY_NEEDED'
        : 'OMIT_IF_REDUNDANT';
  const roleEmbodiment = resolveRoleEmbodiment(input.resolvedRoleIdentity);
  const conversationReality = resolveConversationReality(input.conversationState, input.recentConversationCount);
  const relationshipAdaptation = resolveRelationshipAdaptation({
    baselineDistance: stable.relationshipStyle.baselineDistance,
    familiarityAdaptation: stable.relationshipStyle.familiarityAdaptation,
    exchangeState: conversationReality.exchange.state,
    feedbackHandlingMode: conversationReality.currentFeedback.handlingMode,
  });
  const participation = resolveCustomerServiceRoleConditionedParticipationFrame({
    plan,
    speaker,
    resolvedRoleIdentity: input.resolvedRoleIdentity,
    posture: interactionPosture,
    capabilityContext: input.roleCapabilityContext,
    conversationState: input.conversationState,
    recentConversationCount: input.recentConversationCount,
    livedContext: {
      exchangeState: conversationReality.exchange.state,
      relevantMemorySourceTurns: conversationReality.relevantMemories.map((item) => item.sourceTurn),
    },
  });
  const turnComposition = resolveTurnComposition({
    plan,
    participation,
    turnMode,
    preferredBeats,
    maxBeats,
    brevity: stable.conversationalTexture.brevity,
  });
  const needAlignment = resolveRoleNeedAlignment({
    plan,
    participation,
    turnComposition,
  });
  const sharedContext = resolveSharedContextGivenNew({
    plan,
    conversationReality,
    turnComposition,
    needAlignment,
  });

  return {
    schemaVersion: 1,
    authority: 'REALIZATION_ONLY',
    persona: {
      source: speaker.source,
      preset: stable.preset,
      preserveStableCore: true,
      presence: {
        warmth: level3(stable.corePresence.warmth, 'COOL', 'NEUTRAL', 'WARM'),
        directness: level3(stable.corePresence.directness, 'SOFT', 'BALANCED', 'DIRECT'),
        formality: level3(stable.corePresence.formality, 'CASUAL', 'NEUTRAL', 'FORMAL'),
        energy: level3(stable.corePresence.energy, 'QUIET', 'STEADY', 'LIVELY'),
        playfulness: level3(stable.corePresence.playfulness, 'RESTRAINED', 'LIGHT', 'PLAYFUL'),
        expressiveness: level3(stable.corePresence.emotionalExpressiveness, 'RESTRAINED', 'BALANCED', 'EXPRESSIVE'),
      },
      corePresenceFidelity: { ...stable.corePresence },
    },
    roleEmbodiment,
    conversationReality,
    participation,
    needAlignment,
    sharedContext,
    turnShape: {
      mode: turnMode,
      preferredBeats,
      maxBeats,
      acknowledgement,
      questionPlacement,
      stopBias: serviceRealization.rhythm.stopWhenComplete || identitySurface.answerOnly || stable.conversationalTexture.brevity === 'COMPACT'
        ? 'HIGH'
        : stable.conversationalTexture.brevity === 'EXPANSIVE' ? 'LOW' : 'MEDIUM',
    },
    turnComposition,
    texture: {
      spokenRegister,
      brevity: stable.conversationalTexture.brevity,
      sentenceShape: stable.conversationalTexture.sentenceShape,
      fragmentAllowance: stable.conversationalTexture.fragmentTolerance,
      ellipsisAllowance: stable.conversationalTexture.ellipsisTolerance,
      rhythmVariation: stable.conversationalTexture.rhythmVariation,
      connectiveDensity,
      explicitReasoning,
      completionCadence: stable.conversationalTexture.completionCadence,
      sentenceParticleLevel: stable.deliveryStyle.sentenceParticleLevel,
      emoji: stable.deliveryStyle.emoji,
    },
    identitySurface,
    opening: {
      mode: plan.interactionType !== 'SOCIAL_GREETING'
        ? 'NONE'
        : presenceQuery
          ? 'PRESENCE_CONFIRMATION'
          : serviceRealization.opening.invitation !== 'FORBIDDEN'
            ? 'GREETING_WITH_LIGHT_ENTRY'
            : 'RECIPROCAL_GREETING',
      serviceEntryMode: serviceRealization.opening.invitation === 'FORBIDDEN'
        ? 'NONE'
        : serviceRealization.opening.avoidGenericChatInvitation
          ? 'SERVICE_NEED'
          : serviceRealization.opening.allowCasualChat
            ? 'CASUAL_ALLOWED'
            : 'SERVICE_NEED',
      serviceEntryTarget: serviceRealization.opening.serviceEntryTarget,
      avoidGenericChatInvitation: serviceRealization.opening.avoidGenericChatInvitation,
      literalPresenceNeeded: presenceQuery,
      avoidPresenceFormula: pureGreeting && !presenceQuery,
    },
    surfaceBudget: resolveSurfaceBudget({
      turnMode,
      stable,
      hasValue,
      hasOptionalQuestion,
      hasRequiredQuestion,
      question: serviceRealization.question,
      identityAnswerOnly: identitySurface.answerOnly,
      pureGreeting,
      turnComposition,
    }),
    antiAiCadence: {
      avoidActPerSentence: true,
      avoidRecapBeforeValue: hasValue,
      avoidQuestionRationaleAfterQuestion: true,
      avoidSelfProcessNarration: true,
      avoidExhaustiveCompletion: stable.conversationalTexture.completionCadence !== 'HIGH',
      preferImplicitTransitions: true,
      doNotExplainConversationStrategy: true,
    },
    adaptation: {
      customerMessageShape: customerMessageShape(latest),
      relationshipDistance: relationshipAdaptation.relationshipDistance,
      family: serviceRealization.family.family,
      mirrorIntensity: relationshipAdaptation.mirrorIntensity,
      varyFromRecentStructure: serviceRealization.multiTurn.varyFromRecentStructure,
    },
  };
}


function resolveRelationshipAdaptation(input: {
  baselineDistance: CustomerServiceRoleSpeakerProjectionV1['stableCore']['relationshipStyle']['baselineDistance'];
  familiarityAdaptation: CustomerServiceRoleSpeakerProjectionV1['stableCore']['relationshipStyle']['familiarityAdaptation'];
  exchangeState: CustomerServiceHumanTurnRealizationV1['conversationReality']['exchange']['state'];
  feedbackHandlingMode: CustomerServiceHumanTurnRealizationV1['conversationReality']['currentFeedback']['handlingMode'];
}): Pick<CustomerServiceHumanTurnRealizationV1['adaptation'], 'relationshipDistance' | 'mirrorIntensity'> {
  // Phase B relationship truth boundary: model-facing familiarity must not consume
  // legacy relationshipDynamics because that producer mixes durable feedback with
  // language-specific warmth/humor/message-shape heuristics. Use only explicit role
  // relationship configuration plus server-owned exchange continuity. TRUST_REPAIR
  // is already a structured current-feedback state and may temporarily narrow distance.
  if (input.feedbackHandlingMode === 'TRUST_REPAIR') {
    return { relationshipDistance: 'REPAIR', mirrorIntensity: 'RESTRAINED' };
  }

  const baseline = input.baselineDistance === 'PROFESSIONAL'
    ? 'FORMAL'
    : input.baselineDistance === 'FAMILIAR'
      ? 'WARM'
      : 'NEUTRAL';
  const mayAdapt = input.exchangeState === 'ONGOING' && input.familiarityAdaptation !== 'FIXED';
  const relationshipDistance = !mayAdapt
    ? baseline
    : baseline === 'FORMAL'
      ? 'NEUTRAL'
      : baseline === 'NEUTRAL'
        ? 'WARM'
        : 'CLOSE';
  const mirrorIntensity = input.familiarityAdaptation === 'RESPONSIVE'
    || (input.familiarityAdaptation === 'GRADUAL' && input.exchangeState === 'ONGOING')
    ? 'BALANCED'
    : 'RESTRAINED';
  return { relationshipDistance, mirrorIntensity };
}

function resolveRoleEmbodiment(
  resolved: CustomerServiceResolvedRoleIdentityContextV1 | null | undefined,
): CustomerServiceHumanTurnRealizationV1['roleEmbodiment'] {
  return {
    authority: 'REALIZATION_CONTEXT_ONLY',
    turnExecutionAuthority: 'NONE',
    identity: {
      roleDescription: resolved?.identity.roleDescription || null,
      prototypeIdentity: resolved?.identity.prototypeIdentity || null,
    },
    rolePrototype: {
      personality: resolved?.rolePrototype.personality || null,
      languageStyle: resolved?.rolePrototype.languageStyle || null,
      servicePosture: resolved?.rolePrototype.servicePosture || null,
    },
    accountExpression: {
      tone: resolved?.accountExpression.tone || null,
      voice: resolved?.accountExpression.voice || null,
      background: resolved?.accountExpression.background || null,
      relationship: resolved?.accountExpression.relationship || null,
    },
    storeExpression: {
      brandTone: resolved?.storeExpression.brandTone || null,
    },
    channel: resolved?.channel || null,
    configurationFingerprint: resolved?.provenance.configurationFingerprint || null,
  };
}

function resolveConversationReality(
  state: CustomerServiceConversationStateSummary,
  recentConversationCount: number,
): CustomerServiceHumanTurnRealizationV1['conversationReality'] {
  const currentTurn = Math.max(0, Number(state.currentTurn || 0));
  const priorConversationMessages = Math.max(0, Number(recentConversationCount || 0));
  const priorAssistantTurns = (state.recentAssistantMoves || []).filter((item) => Boolean(String(item.excerpt || '').trim())).length;
  const exchangeState: CustomerServiceHumanTurnRealizationV1['conversationReality']['exchange']['state'] =
    currentTurn > 1 || priorAssistantTurns > 0 || priorConversationMessages > 1 ? 'ONGOING' : 'FRESH';
  const currentFeedback = state.latestFeedback;
  return {
    authority: 'REALIZATION_CONTEXT_ONLY',
    currentTurn,
    priorConversationMessages,
    // H0.2-C Real Closure: prompt-window selection is not allowed to decide whether
    // the human exchange "started over". Server state owns that factual continuity.
    exchange: {
      state: exchangeState,
      priorAssistantTurns,
    },
    // H0.2-C Authority boundary: only server-owned factual interaction history is
    // projected into high-fidelity Conversation Reality. Legacy relationshipDynamics
    // remains available to Legacy/diagnostics but cannot become HVE3 model-facing truth.
    continuity: {
      lastAssistantMoveAccepted: state.behaviorHistory.lastAssistantMoveAccepted ?? null,
      lastAssistantMoveRejected: state.behaviorHistory.lastAssistantMoveRejected === true,
      recentRequestedDeltas: [...(state.behaviorHistory.recentRequestedDeltas || [])].map((value) => String(value)),
    },
    currentFeedback: {
      reception: currentFeedback?.userFeedback || 'UNCLEAR',
      handlingMode: currentFeedback?.feedbackHandlingMode || 'NONE',
      strategyChangeRequired: currentFeedback?.strategyChangeRequired === true,
      correctionTarget: currentFeedback?.correctionTarget || null,
      requestedDeltas: [...(currentFeedback?.requestedDeltas || [])].map((value) => String(value)),
    },
    activeTask: state.activeTask
      ? {
          status: state.activeTask.status,
          goal: state.activeTask.goal,
          responsibility: state.activeTask.responsibility,
          createdTurn: Math.max(0, Number(state.activeTask.createdTurn || 0)),
          lastActiveTurn: Math.max(0, Number(state.activeTask.lastActiveTurn || 0)),
          pendingSlots: [...(state.activeTask.pendingSlots || [])].map((value) => String(value)).slice(-6),
          providedSlots: [...(state.activeTask.providedSlots || [])].map((value) => String(value)).slice(-6),
          unresolvedGoals: [...(state.activeTask.unresolvedGoals || [])].map((value) => String(value)).slice(-6),
          anchors: [...(state.activeTask.anchors || [])].map((value) => String(value).trim()).filter(Boolean).slice(-4),
        }
      : null,
    // R2 continuous-human closure: reuse R1's relevance-selected memory truth instead
    // of making the generator reconstruct the customer's lived position from a short
    // prompt window. The selector upstream already excludes invalidated/withdrawn and
    // unrelated durable memory; HumanTurn remains a read-only realization consumer.
    relevantMemories: (state.relevantMemories || [])
      .filter((item) => ['CUSTOMER_FACT', 'CUSTOMER_PREFERENCE', 'CUSTOMER_CONSTRAINT', 'DECISION', 'COMMITMENT', 'CORRECTION', 'WITHDRAWAL'].includes(item.kind))
      .slice(0, 8)
      .map((item) => ({
        kind: item.kind,
        key: String(item.key || '').slice(0, 120),
        value: String(item.value || '').trim().slice(0, 240),
        sourceTurn: Math.max(0, Number(item.sourceTurn || 0)),
        confidence: Math.max(0, Math.min(1, Number(item.confidence || 0))),
      })),
    // A semantic facet shift may suspend one task record and activate another while
    // the same real conversation continues. Preserve that recent task history for
    // realization without turning it into a second Planner.
    recentSuspendedTasks: (state.suspendedTasks || []).slice(-3).map((item) => ({
      status: item.status,
      goal: item.goal,
      responsibility: item.responsibility,
      createdTurn: Math.max(0, Number(item.createdTurn || 0)),
      lastActiveTurn: Math.max(0, Number(item.lastActiveTurn || 0)),
      pendingSlots: [...(item.pendingSlots || [])].map((value) => String(value)).slice(-6),
      unresolvedGoals: [...(item.unresolvedGoals || [])].map((value) => String(value)).slice(-6),
      anchors: [...(item.anchors || [])].map((value) => String(value).trim()).filter(Boolean).slice(-4),
    })),
    recentAssistantMoves: state.recentAssistantMoves.slice(0, 6).map((item) => ({
      turn: Math.max(0, Number(item.turn || 0)),
      excerpt: String(item.excerpt || '').trim().slice(0, 240),
      accepted: item.accepted,
      rejected: item.rejected === true,
      requestedDeltas: [...(item.requestedDeltas || [])].map((value) => String(value)),
    })),
  };
}

function resolveTurnMode(input: {
  interactionType: CustomerServiceInteractionPlanV2['interactionType'];
  pureGreeting: boolean;
  presenceQuery: boolean;
  hasValue: boolean;
  hasOptionalQuestion: boolean;
  hasRequiredQuestion: boolean;
  hasConversationalClose: boolean;
  serviceRealization: ServiceRealizationInput;
}): CustomerServiceHumanTurnRealizationV1['turnShape']['mode'] {
  // H0.1 invariant: a truly REQUIRED information question outranks conversational
  // closure. A close may end an already-complete exchange, but it cannot erase a
  // decision-changing missing-information obligation.
  if (input.hasRequiredQuestion) return 'REQUIRED_QUESTION';
  if (input.hasConversationalClose) return 'CONVERSATIONAL_CLOSE';
  if (input.interactionType === 'SOCIAL_GREETING') {
    if (input.presenceQuery || input.pureGreeting) {
      return input.serviceRealization.opening.invitation === 'FORBIDDEN' ? 'MINIMAL_RECIPROCAL' : 'LIGHT_SERVICE_ENTRY';
    }
    return 'LIGHT_SERVICE_ENTRY';
  }
  if (input.interactionType === 'ROLE_CONFIRMATION') {
    return input.serviceRealization.identity.stopAfterAnswer || input.serviceRealization.opening.invitation === 'FORBIDDEN'
      ? 'IDENTITY_CONFIRMATION'
      : 'IDENTITY_THEN_LIGHT_ENTRY';
  }
  if (['AI_IDENTITY_QUERY', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(input.interactionType)) return 'IDENTITY_DISCLOSURE';
  if (input.hasValue && input.hasOptionalQuestion) return 'VALUE_THEN_QUESTION';
  if (input.hasValue) return 'DIRECT_VALUE';
  if (input.serviceRealization.rhythm.shape === 'TASK_THEN_WAIT') return 'TASK_DIRECT';
  if (input.serviceRealization.acknowledgement.mode !== 'NONE') return 'RELATIONAL_RESPONSE';
  return 'FLEXIBLE';
}

function resolvePreferredBeats(
  mode: CustomerServiceHumanTurnRealizationV1['turnShape']['mode'],
  brevity: CustomerServiceRoleSpeakerProjectionV1['stableCore']['conversationalTexture']['brevity'],
): 1 | 2 | 3 {
  if (['MINIMAL_RECIPROCAL', 'CONVERSATIONAL_CLOSE', 'IDENTITY_CONFIRMATION', 'IDENTITY_DISCLOSURE', 'REQUIRED_QUESTION'].includes(mode)) return 1;
  if (mode === 'IDENTITY_THEN_LIGHT_ENTRY' || mode === 'VALUE_THEN_QUESTION') return 2;
  if (brevity === 'COMPACT') return 1;
  if (brevity === 'EXPANSIVE') return 2;
  return mode === 'DIRECT_VALUE' || mode === 'LIGHT_SERVICE_ENTRY' ? 1 : 2;
}

function resolveIdentitySurface(
  mode: ServiceRealizationInput['identity']['mode'],
  identity: { businessLabel: string | null; relationLabel: string | null; publicName: string | null; surfaceLabel: string | null },
  stopAfterAnswer: boolean,
): CustomerServiceHumanTurnRealizationV1['identitySurface'] {
  if (mode === 'NONE') return identityResult('NONE', null, null, false, false);
  if (mode === 'CONFIRM_RELATION') {
    return identityResult('RELATION_ONLY', identity.relationLabel, null, true, stopAfterAnswer);
  }
  if (mode === 'PUBLIC_IDENTITY') {
    return identityResult('BUSINESS_RELATION_MINIMAL', identity.surfaceLabel || identity.businessLabel || identity.relationLabel, identity.relationLabel, true, stopAfterAnswer);
  }
  if (mode === 'AI_TRUTHFUL') return identityResult('AI_TRUTHFUL', null, identity.relationLabel, true, true);
  if (mode === 'PUBLIC_NAME') return identityResult('PUBLIC_NAME', identity.publicName, identity.relationLabel, true, true);
  return identityResult('SERVICE_SCOPE', identity.surfaceLabel || identity.relationLabel, identity.businessLabel, true, stopAfterAnswer);
}

function identityResult(
  mode: CustomerServiceHumanTurnRealizationV1['identitySurface']['mode'],
  preferredSurface: string | null,
  fallbackSurface: string | null,
  answerFirst: boolean,
  answerOnly: boolean,
): CustomerServiceHumanTurnRealizationV1['identitySurface'] {
  return {
    mode,
    preferredSurface: cleanSurface(preferredSurface),
    fallbackSurface: cleanSurface(fallbackSurface),
    answerFirst,
    answerOnly,
    maxIdentityUnits: 1,
    avoidDescriptorStack: true,
  };
}

function cleanSurface(value: string | null) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 80) : null;
}

function resolveSurfaceBudget(input: {
  turnMode: CustomerServiceHumanTurnRealizationV1['turnShape']['mode'];
  stable: CustomerServiceRoleSpeakerProjectionV1['stableCore'];
  hasValue: boolean;
  hasOptionalQuestion: boolean;
  hasRequiredQuestion: boolean;
  question: ServiceRealizationInput['question'];
  identityAnswerOnly: boolean;
  pureGreeting: boolean;
  turnComposition: CustomerServiceHumanTurnRealizationV1['turnComposition'];
}): CustomerServiceHumanTurnRealizationV1['surfaceBudget'] {
  const brevity = input.stable.conversationalTexture.brevity;
  const identityOrGreeting = input.identityAnswerOnly || input.pureGreeting
    || ['MINIMAL_RECIPROCAL', 'CONVERSATIONAL_CLOSE', 'IDENTITY_CONFIRMATION', 'IDENTITY_DISCLOSURE'].includes(input.turnMode);
  const baseSoftMaxChars = input.turnMode === 'IDENTITY_THEN_LIGHT_ENTRY'
    ? (brevity === 'COMPACT' ? 34 : brevity === 'EXPANSIVE' ? 56 : 44)
    : identityOrGreeting
      ? (['MINIMAL_RECIPROCAL', 'CONVERSATIONAL_CLOSE'].includes(input.turnMode) ? 16 : 24)
    : input.turnMode === 'VALUE_THEN_QUESTION'
      ? (brevity === 'COMPACT' ? 44 : brevity === 'EXPANSIVE' ? 68 : 52)
      : input.turnMode === 'DIRECT_VALUE'
        ? (brevity === 'COMPACT' ? 48 : brevity === 'EXPANSIVE' ? 92 : 68)
        : brevity === 'COMPACT' ? 48 : brevity === 'EXPANSIVE' ? 96 : 72;
  const compositionNeedsMultipleValues = input.turnComposition.beats.includes('VALUE')
    && (input.turnComposition.beats.includes('BOUNDARY') || input.turnComposition.beats.includes('QUESTION'));
  const softMaxChars = compositionNeedsMultipleValues
    ? Math.max(baseSoftMaxChars, brevity === 'COMPACT' ? 76 : brevity === 'EXPANSIVE' ? 128 : 96)
    : baseSoftMaxChars;
  const optionalQuestionPresentation: CustomerServiceHumanTurnRealizationV1['surfaceBudget']['optionalQuestionPresentation'] = input.hasRequiredQuestion
    ? 'DIRECT_REQUIRED'
    : !input.hasOptionalQuestion
      ? 'NONE'
      : input.stable.interactionStyle.questionStyle === 'EXPLORATORY'
        ? 'OPEN'
        : input.stable.interactionStyle.questionStyle === 'MINIMAL'
          ? 'OPEN'
          : 'NATURAL_CONTRAST';
  return {
    softMaxChars,
    maxValueUnits: input.hasValue ? (compositionNeedsMultipleValues ? 2 : input.turnMode === 'VALUE_THEN_QUESTION' ? 1 : brevity === 'EXPANSIVE' ? 2 : 1) : 0,
    maxPreQuestionClauses: input.turnMode === 'VALUE_THEN_QUESTION' ? 2 : brevity === 'EXPANSIVE' ? 3 : 2,
    recapPolicy: input.hasValue ? 'NONE' : 'LIGHT_ONLY_IF_RELATIONALLY_NEEDED',
    optionalQuestionPresentation,
    maxPresentedOptions: input.hasOptionalQuestion && input.question.avoidNavigationOnly !== false ? 2 : input.hasOptionalQuestion ? 2 : 0,
    stopAfterQuestion: input.hasOptionalQuestion || input.hasRequiredQuestion,
    completionPolicy: input.turnMode === 'CONVERSATIONAL_CLOSE' || input.identityAnswerOnly || input.hasOptionalQuestion || input.hasRequiredQuestion || brevity !== 'EXPANSIVE'
      ? 'STOP_WHEN_ENOUGH'
      : 'ALLOW_BRIEF_WRAP',
  };
}

function resolveTurnComposition(input: {
  plan: CustomerServiceInteractionPlanV2;
  participation: CustomerServiceRoleConditionedParticipationFrameV1;
  turnMode: CustomerServiceHumanTurnRealizationV1['turnShape']['mode'];
  preferredBeats: 1 | 2 | 3;
  maxBeats: 1 | 2 | 3;
  brevity: CustomerServiceRoleSpeakerProjectionV1['stableCore']['conversationalTexture']['brevity'];
}): CustomerServiceHumanTurnRealizationV1['turnComposition'] {
  const obligation = input.plan.answerObligation || fallbackAnswerObligation(input.plan.interactionType);
  const planned = new Set(input.plan.acts.map((item) => item.type));
  const beats: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'] = [];
  const push = (beat: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'][number]) => {
    if (!beats.includes(beat)) beats.push(beat);
  };
  if (input.plan.acts.some((item) => ['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE'].includes(item.type))) push('ACKNOWLEDGE');
  if (input.plan.acts.some((item) => ['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP'].includes(item.type))) push('VALUE');
  if (planned.has('EXPLAIN_BOUNDARY')) push('BOUNDARY');
  if (input.plan.acts.some((item) => ['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY'].includes(item.type))) push('QUESTION');
  if (planned.has('OPEN_SERVICE_INVITATION')) push('SERVICE_PRESENCE');
  if (planned.has('NATURAL_CLOSE') || planned.has('STOP')) push('CLOSE');

  // H0.2-A Final Authority Leak Closure: roleBehavior is diagnostic projection only.
  // It may annotate already-authorized segments below, but must never create, delete,
  // reorder, merge or prioritize Canonical semantic beats.

  const complexKnowledgeBoundary = obligation.unknownStrategy === 'ANSWER_KNOWN_THEN_BOUNDARY'
    && planned.has('EXPLAIN_BOUNDARY')
    && beats.includes('VALUE');
  const valueQuestion = beats.includes('VALUE') && beats.includes('QUESTION');
  // ACK + VALUE is often more human when fused into one bubble. Multi-message is
  // reserved for independently valuable beats (value+boundary, value+question,
  // or genuinely expansive sequential work), not for stylistic warmth alone.
  const explicitSequential = input.maxBeats >= 2 && input.preferredBeats >= 2
    && input.brevity === 'EXPANSIVE';
  const shouldPreferTwo = complexKnowledgeBoundary || valueQuestion || explicitSequential;
  const maxMessageSegments = Math.max(1, Math.min(3, Math.max(input.maxBeats, beats.length > 1 ? 2 : 1))) as 1 | 2 | 3;
  const preferredMessageSegments = (shouldPreferTwo
    ? Math.min(maxMessageSegments, beats.length >= 3 && input.brevity === 'EXPANSIVE' ? 3 : 2)
    : 1) as 1 | 2 | 3;
  const segmentation = preferredMessageSegments > 1
    ? (complexKnowledgeBoundary || valueQuestion ? 'PREFER_SEQUENTIAL' : 'OPTIONAL_SEQUENTIAL')
    : 'SINGLE';
  const segmentPlan = buildStructuredSegmentPlan({
    beats,
    preferredMessageSegments,
    segmentation,
    participation: input.participation,
    plan: input.plan,
  });
  const target = obligation.responseTarget || fallbackResponseTarget(obligation.currentFocus);

  return {
    authority: 'REALIZATION_ONLY',
    semanticDelta: {
      continuity: obligation.continuity,
      currentFocus: obligation.currentFocus,
      currentFocusLabel: obligation.currentFocusLabel,
      previousFocus: obligation.previousFocus,
      mustAddNewInformation: obligation.mustAddNewInformation,
      avoidRepeat: obligation.avoidRepeat,
      evidenceState: obligation.evidenceState,
      unknownStrategy: obligation.unknownStrategy,
      responseTarget: {
        focus: target.focus,
        requestedSpecificity: target.requestedSpecificity,
        priorCoverage: target.priorCoverage,
        requiredDelta: target.requiredDelta,
        knowledgeRequirement: target.knowledgeRequirement,
        unresolvedNeed: target.unresolvedNeed,
        source: target.source,
        confidence: target.confidence,
        evidence: [...target.evidence],
      },
    },
    beats: beats.slice(0, 6),
    segmentPlan,
    preferredMessageSegments,
    maxMessageSegments,
    segmentation,
    eachSegmentNeedsNewValue: true,
  };
}


function resolveRoleNeedAlignment(input: {
  plan: CustomerServiceInteractionPlanV2;
  participation: CustomerServiceRoleConditionedParticipationFrameV1;
  turnComposition: CustomerServiceHumanTurnRealizationV1['turnComposition'];
}): CustomerServiceHumanTurnRealizationV1['needAlignment'] {
  const acts = input.plan.acts.filter((act) => act.type !== 'STOP');
  const actTypes = new Set(acts.map((act) => act.type));
  const target = input.turnComposition.semanticDelta.responseTarget;
  const focus = target.focus;
  const hasValue = input.turnComposition.beats.includes('VALUE');
  const ackActs = acts.filter((act) => [
    'PRESENCE_ACK',
    'LIGHT_ACK',
    'EMOTIONAL_ACK',
    'REASSURE',
    'ACKNOWLEDGE_PROBLEM',
    'ACKNOWLEDGE_PREFERENCE',
  ].includes(act.type));
  const requiredAck = ackActs.some((act) => act.necessity === 'REQUIRED');
  const relationalAck = ackActs.some((act) => ['EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM'].includes(act.type));

  let primaryContribution: CustomerServiceHumanTurnRealizationV1['needAlignment']['primaryContribution'];
  if (actTypes.has('EXECUTE_SERVICE_STEP')) primaryContribution = 'EXECUTE';
  else if (actTypes.has('REPORT_STATUS') || focus === 'STATUS_PROGRESS') primaryContribution = 'REPORT';
  else if (actTypes.has('EXPLAIN_BOUNDARY') || focus === 'LIMITATION_BOUNDARY') primaryContribution = 'BOUNDARY';
  else if (!hasValue && (actTypes.has('REQUEST_REQUIRED_SLOT') || actTypes.has('CLARIFY_AMBIGUITY'))) primaryContribution = 'CLARIFY';
  else if (actTypes.has('RECOMMEND_GROUNDED_ITEM') || focus === 'RECOMMENDATION') primaryContribution = 'RECOMMEND';
  else if (focus === 'WHY_REASON' || actTypes.has('EXPLAIN_GROUNDED_FACT') || actTypes.has('EXPLAIN_SERVICE_SCOPE')) primaryContribution = 'EXPLAIN';
  else if (focus === 'HOW_TO' || focus === 'TROUBLESHOOTING' || actTypes.has('PROVIDE_GENERAL_GUIDANCE')) primaryContribution = 'GUIDE';
  else if (focus === 'CONVERSATIONAL_CLOSURE' || actTypes.has('NATURAL_CLOSE')) primaryContribution = 'CLOSE';
  else if (!hasValue && ackActs.length) primaryContribution = 'RELATE';
  else primaryContribution = 'ANSWER';

  const acknowledgementRealization: CustomerServiceHumanTurnRealizationV1['needAlignment']['acknowledgementRealization'] = !ackActs.length
    ? 'NONE'
    : requiredAck
      ? 'EXPLICIT_REQUIRED'
      : relationalAck
        ? 'EXPLICIT_RELATIONAL'
        : hasValue
          ? 'IMPLICIT_IN_PRIMARY'
          : 'EXPLICIT_RELATIONAL';

  const explanationRole: CustomerServiceHumanTurnRealizationV1['needAlignment']['explanationRole'] = ['EXPLAIN', 'BOUNDARY'].includes(primaryContribution)
    ? 'PRIMARY_VALUE'
    : ['RECOMMEND', 'GUIDE', 'EXECUTE', 'REPORT'].includes(primaryContribution)
      ? 'SUPPORT_PRIMARY_ONLY'
      : 'MINIMAL';
  const openingBias: CustomerServiceHumanTurnRealizationV1['needAlignment']['openingBias'] = acknowledgementRealization === 'EXPLICIT_REQUIRED'
    || acknowledgementRealization === 'EXPLICIT_RELATIONAL'
      ? 'RELATIONAL_FIRST'
      : 'PRIMARY_FIRST';

  return {
    authority: 'REALIZATION_ONLY',
    primaryContribution,
    acknowledgementRealization,
    explanationRole,
    openingBias,
    understandingProof: openingBias === 'PRIMARY_FIRST'
      ? 'BY_USEFUL_PRIMARY_CONTRIBUTION'
      : 'BY_EXPLICIT_RELATIONAL_ACK',
    constraints: {
      preserveAllRequiredActs: true,
      cannotCreateActs: true,
      cannotChangeFactsOrPermission: true,
      noNeedRestatementAsSubstituteForValue: true,
    },
  };
}

function resolveSharedContextGivenNew(input: {
  plan: CustomerServiceInteractionPlanV2;
  conversationReality: CustomerServiceHumanTurnRealizationV1['conversationReality'];
  turnComposition: CustomerServiceHumanTurnRealizationV1['turnComposition'];
  needAlignment: CustomerServiceHumanTurnRealizationV1['needAlignment'];
}): CustomerServiceHumanTurnRealizationV1['sharedContext'] {
  const acts = input.plan.acts.filter((act) => act.type !== 'STOP');
  const actTypes = new Set(acts.map((act) => act.type));
  const semantic = input.turnComposition.semanticDelta;
  const target = semantic.responseTarget;
  const priorContext = input.conversationReality.exchange.state === 'ONGOING' ? 'ESTABLISHED' : 'NONE';

  const canonicalRestatement = actTypes.has('RESTATEMENT');
  const ambiguityResolution = actTypes.has('CLARIFY_AMBIGUITY');
  const correctionBinding = semantic.continuity === 'CORRECTION'
    || target.priorCoverage === 'CORRECTION'
    || target.requiredDelta === 'CORRECT'
    || input.conversationReality.currentFeedback.reception === 'CORRECTED';
  const precisionBinding = target.focus === 'COMPARISON' || target.focus === 'COMPATIBILITY';
  const newFacetInEstablishedThread = priorContext === 'ESTABLISHED'
    && (semantic.continuity === 'FOLLOW_UP_NEW_FACET' || target.requiredDelta === 'NEW_FACET');

  let referentialMode: CustomerServiceHumanTurnRealizationV1['sharedContext']['referentialMode'];
  let referenceBasis: CustomerServiceHumanTurnRealizationV1['sharedContext']['referenceBasis'];
  if (canonicalRestatement) {
    referentialMode = 'EXPLICIT';
    referenceBasis = 'CANONICAL_RESTATEMENT';
  } else if (ambiguityResolution) {
    referentialMode = 'EXPLICIT';
    referenceBasis = 'AMBIGUITY_RESOLUTION';
  } else if (correctionBinding) {
    referentialMode = 'EXPLICIT';
    referenceBasis = 'CORRECTION_BINDING';
  } else if (precisionBinding) {
    referentialMode = 'EXPLICIT';
    referenceBasis = 'PRECISION_BINDING';
  } else if (newFacetInEstablishedThread) {
    referentialMode = 'LIGHT_ANCHOR';
    referenceBasis = 'NEW_FACET_IN_ESTABLISHED_THREAD';
  } else if (priorContext === 'ESTABLISHED') {
    referentialMode = 'IMPLICIT';
    referenceBasis = 'ESTABLISHED_THREAD';
  } else {
    referentialMode = 'IMPLICIT';
    referenceBasis = 'CURRENT_TURN_GIVEN';
  }

  const newValueStart: CustomerServiceHumanTurnRealizationV1['sharedContext']['newValueStart'] =
    input.needAlignment.primaryContribution === 'CLARIFY'
      ? 'REQUIRED_CLARIFICATION'
      : input.needAlignment.openingBias === 'RELATIONAL_FIRST'
        ? 'RELATIONAL_ACK_THEN_PRIMARY'
        : 'PRIMARY_CONTRIBUTION';

  const requestedDeltas = Array.from(new Set([
    ...input.conversationReality.continuity.recentRequestedDeltas,
    ...input.conversationReality.currentFeedback.requestedDeltas,
  ]));
  const priorContributionStatus: CustomerServiceHumanTurnRealizationV1['sharedContext']['priorContributionStatus'] =
    input.conversationReality.exchange.state === 'FRESH'
      ? 'NONE'
      : input.conversationReality.currentFeedback.reception === 'ACCEPTED'
        ? 'ACCEPTED'
        : input.conversationReality.currentFeedback.reception === 'PARTIALLY_ACCEPTED'
          ? 'PARTIALLY_ACCEPTED'
          : input.conversationReality.currentFeedback.reception === 'REJECTED'
            ? 'REJECTED'
            : input.conversationReality.currentFeedback.reception === 'CORRECTED'
              ? 'CORRECTED'
              : input.conversationReality.continuity.lastAssistantMoveRejected
                ? 'REJECTED'
                : input.conversationReality.continuity.lastAssistantMoveAccepted === true
                  ? 'ACCEPTED'
                  : 'UNRESOLVED';
  const priorContributionReuse: CustomerServiceHumanTurnRealizationV1['sharedContext']['priorContributionReuse'] =
    requestedDeltas.length > 0
      ? 'FOLLOW_REQUESTED_DELTA'
      : priorContributionStatus === 'ACCEPTED'
        ? 'ADVANCE_FROM_ACCEPTED'
        : priorContributionStatus === 'PARTIALLY_ACCEPTED'
          ? 'PRESERVE_ACCEPTED_REFINE_REMAINDER'
          : priorContributionStatus === 'REJECTED'
            ? 'CHANGE_FROM_REJECTED'
            : priorContributionStatus === 'CORRECTED'
              ? 'CORRECT_PRIOR'
              : 'NORMAL';

  const primaryContributionRequiresValueBeyondGiven = new Set<CustomerServiceHumanTurnRealizationV1['needAlignment']['primaryContribution']>([
    'ANSWER',
    'RECOMMEND',
    'GUIDE',
    'EXPLAIN',
    'EXECUTE',
    'REPORT',
    'BOUNDARY',
  ]).has(input.needAlignment.primaryContribution);
  const mustAdvanceBeyondGiven = Boolean(
    primaryContributionRequiresValueBeyondGiven
    || semantic.mustAddNewInformation
    || semantic.avoidRepeat
    || target.priorCoverage === 'SAME_FOCUS_PARTIAL'
    || target.requiredDelta !== 'NONE',
  );

  return {
    authority: 'REALIZATION_ONLY',
    currentTurnInformation: 'GIVEN_BY_CUSTOMER',
    priorContext,
    referentialMode,
    referenceBasis,
    newValueStart,
    priorContributionStatus,
    priorContributionReuse,
    avoidEvaluativeReceptionBeforeValue: newValueStart === 'PRIMARY_CONTRIBUTION'
      && referentialMode !== 'EXPLICIT',
    mustAdvanceBeyondGiven,
    constraints: {
      cannotCreateActs: true,
      cannotChangeFactsOrPermission: true,
      cannotInventReferents: true,
      explicitReferenceRequiresSemanticNeed: true,
    },
  };
}


function fallbackAnswerObligation(interactionType: CustomerServiceInteractionPlanV2['interactionType']) {
  const evidenceState = ['PRODUCT_FACT_QUERY', 'PRODUCT_DISCOVERY', 'PRODUCT_DISCOVERY_NO_GROUNDING'].includes(interactionType) ? 'CONTEXT_ONLY' as const : 'NOT_REQUIRED' as const;
  return {
    continuity: 'NEW_NEED' as const,
    currentFocus: 'CURRENT_SPECIFIC_QUESTION' as const,
    currentFocusLabel: '客户本轮明确提出的具体信息需求',
    previousFocus: null,
    mustAddNewInformation: false,
    avoidRepeat: false,
    evidenceState,
    unknownStrategy: 'NOT_APPLICABLE' as const,
    responseTarget: fallbackResponseTarget('CURRENT_SPECIFIC_QUESTION'),
  };
}

function fallbackResponseTarget(focus: string) {
  return {
    focus,
    requestedSpecificity: 'DIRECTION' as const,
    priorCoverage: 'NONE' as const,
    requiredDelta: 'NONE' as const,
    knowledgeRequirement: 'NOT_REQUIRED' as const,
    unresolvedNeed: null,
    source: 'COMPATIBILITY_FALLBACK' as const,
    confidence: 0.4,
    evidence: ['HUMAN_TURN_RESPONSE_TARGET_FALLBACK'],
  };
}

function buildStructuredSegmentPlan(input: {
  beats: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'];
  preferredMessageSegments: 1 | 2 | 3;
  segmentation: CustomerServiceHumanTurnRealizationV1['turnComposition']['segmentation'];
  participation: CustomerServiceRoleConditionedParticipationFrameV1;
  plan: CustomerServiceInteractionPlanV2;
}): CustomerServiceHumanTurnRealizationV1['turnComposition']['segmentPlan'] {
  const beats = input.beats.slice();
  if (input.preferredMessageSegments <= 1 || input.segmentation === 'SINGLE' || beats.length <= 1) {
    const purposes: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'] = beats.length
      ? beats
      : ['VALUE'];
    const projectedActs = projectPlannedActsForPurposes(purposes, input.plan);
    return [{
      index: 0,
      purposes,
      roleSignals: resolveSegmentRoleSignals(purposes, input.participation),
      plannedActRefs: projectedActs.map((item) => item.id),
      plannedActTypes: projectedActs.map((item) => item.type),
      allowedGroundingRefs: collectPlannedKnowledgeGroundingRefs(projectedActs),
      mustCarryNewValue: purposes.includes('VALUE') || purposes.includes('BOUNDARY') || purposes.includes('QUESTION'),
    }];
  }
  const groups: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'][] = [];
  const remaining = beats.slice();
  // Keep acknowledgement attached to value; it should not become a synthetic
  // standalone “warmth bubble”. Boundary and question are independently useful.
  const valueIndex = remaining.indexOf('VALUE');
  if (valueIndex >= 0) {
    const primary: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'] = [];
    const ackIndex = remaining.indexOf('ACKNOWLEDGE');
    if (ackIndex >= 0) primary.push('ACKNOWLEDGE');
    primary.push('VALUE');
    for (const purpose of primary) {
      const index = remaining.indexOf(purpose);
      if (index >= 0) remaining.splice(index, 1);
    }
    groups.push(primary);
  }
  for (const purpose of ['BOUNDARY', 'QUESTION', 'SERVICE_PRESENCE', 'CLOSE'] as const) {
    const index = remaining.indexOf(purpose);
    if (index >= 0) {
      groups.push([purpose]);
      remaining.splice(index, 1);
    }
  }
  if (remaining.length) {
    if (groups.length) groups[groups.length - 1].push(...remaining);
    else groups.push(remaining);
  }
  while (groups.length > input.preferredMessageSegments) {
    const tail = groups.pop()!;
    groups[groups.length - 1].push(...tail);
  }
  return groups.map((purposes, index) => {
    const projectedActs = projectPlannedActsForPurposes(purposes, input.plan);
    return {
      index,
      purposes,
      roleSignals: resolveSegmentRoleSignals(purposes, input.participation),
      plannedActRefs: projectedActs.map((item) => item.id),
      plannedActTypes: projectedActs.map((item) => item.type),
      allowedGroundingRefs: collectPlannedKnowledgeGroundingRefs(projectedActs),
      mustCarryNewValue: purposes.some((purpose) => ['VALUE', 'BOUNDARY', 'QUESTION'].includes(purpose)),
    };
  });
}

function projectPlannedActsForPurposes(
  purposes: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'],
  plan: CustomerServiceInteractionPlanV2,
) {
  const allowed = new Set<CustomerServiceActType>();
  if (purposes.includes('ACKNOWLEDGE')) {
    ['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE'].forEach((type) => allowed.add(type as CustomerServiceActType));
  }
  if (purposes.includes('VALUE')) {
    ['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP'].forEach((type) => allowed.add(type as CustomerServiceActType));
  }
  if (purposes.includes('BOUNDARY')) allowed.add('EXPLAIN_BOUNDARY');
  if (purposes.includes('QUESTION')) {
    ['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY'].forEach((type) => allowed.add(type as CustomerServiceActType));
  }
  if (purposes.includes('SERVICE_PRESENCE')) allowed.add('OPEN_SERVICE_INVITATION');
  if (purposes.includes('CLOSE')) { allowed.add('NATURAL_CLOSE'); allowed.add('STOP'); }
  return plan.acts.filter((act) => act.type !== 'STOP' ? allowed.has(act.type) : allowed.has('STOP'));
}

function collectPlannedKnowledgeGroundingRefs(acts: CustomerServiceInteractionPlanV2['acts']) {
  return [...new Set(acts.flatMap((act) => (act.grounding || [])
    .filter((item) => item.source === 'KNOWLEDGE' && item.status === 'SATISFIED')
    .flatMap((item) => item.evidenceRefs || []))
    .map((item) => String(item || '').trim())
    .filter(Boolean))];
}

function resolveSegmentRoleSignals(
  purposes: CustomerServiceHumanTurnRealizationV1['turnComposition']['beats'],
  participation: CustomerServiceRoleConditionedParticipationFrameV1,
): CustomerServiceHumanTurnRealizationV1['turnComposition']['segmentPlan'][number]['roleSignals'] {
  const signals: CustomerServiceHumanTurnRealizationV1['turnComposition']['segmentPlan'][number]['roleSignals'] = ['RELATIONSHIP'];
  const behavior = participation.roleBehavior;
  if (purposes.includes('ACKNOWLEDGE') && behavior.expressionDynamics.warmth === 'WARM') signals.push('WARMTH');
  if (purposes.includes('VALUE') && behavior.judgmentStyle !== 'NONE') signals.push('JUDGMENT');
  if (purposes.includes('VALUE') && behavior.expressionDynamics.reassurance !== 'LIGHT') signals.push('REASSURANCE');
  if (purposes.some((purpose) => ['SERVICE_PRESENCE', 'QUESTION'].includes(purpose)) && behavior.expressionDynamics.servicePresence !== 'BACKGROUND') signals.push('SERVICE_PRESENCE');
  if (behavior.judgmentStyle === 'CLEAR_DIRECTION' || behavior.adviceMode === 'DIRECTIVE') signals.push('DIRECTNESS');
  return [...new Set(signals)];
}

function level3<T extends string>(value: number, low: T, mid: T, high: T): T {
  return value >= 67 ? high : value <= 33 ? low : mid;
}

function customerMessageShape(text: string): CustomerServiceHumanTurnRealizationV1['adaptation']['customerMessageShape'] {
  const length = [...text].length;
  if (length <= 12) return 'BRIEF';
  if (length >= 60 || /[!！]{2,}|[?？]{2,}|~|～/.test(text)) return 'EXPRESSIVE';
  return 'NORMAL';
}

