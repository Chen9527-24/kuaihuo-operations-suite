import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import type { CustomerServiceNlgSemanticFrameV1 } from './customer-service-nlg-execution-brief';

export type CustomerServiceFinalModelFacingHumanTurnV1 = {
  schemaVersion: 1;
  authority: 'FINAL_MODEL_FACING_HUMAN_TURN_V1';
  realization: {
    authority: 'EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY';
    /**
     * Lossless projection of the already-selected Canonical Plan WHAT.
     * This is not another planner: it preserves selected Act semantics and
     * completion ownership that would otherwise disappear before Generation.
     */
    canonicalPlan: {
      source: 'EXISTING_CANONICAL_INTERACTION_PLAN';
      requiredActs: CustomerServiceNlgSemanticFrameV1['acts']['required'];
      preferredActs: CustomerServiceNlgSemanticFrameV1['acts']['preferred'];
      optionalActs: CustomerServiceNlgSemanticFrameV1['acts']['optional'];
      forbiddenActs: CustomerServiceNlgSemanticFrameV1['acts']['forbidden'];
      completion: CustomerServiceNlgSemanticFrameV1['interaction']['completion'];
      /** Canonical WHAT projection only; this does not create a second acknowledgement selector. */
      receptionContribution: {
        authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY';
        selected: boolean;
        actTypes: string[];
      };
      /**
       * Exhaustive customer-visible semantic permit derived from the same selected Acts.
       * Persona may realize these Acts, but it may not contribute a semantic delta of its own.
       */
      semanticPermit: {
        authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY';
        selectedActTypes: string[];
        customerVisibleContributionScope: 'SELECTED_CANONICAL_ACTS_ONLY';
        personaSemanticDelta: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA';
      };
    };
    primary: {
      contribution: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['needAlignment']['primaryContribution'];
      target: CustomerServiceNlgSemanticFrameV1['serviceRealization']['contribution']['target'];
      requestedSpecificity: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['turnComposition']['semanticDelta']['responseTarget']['requestedSpecificity'];
      requiredDelta: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['turnComposition']['semanticDelta']['responseTarget']['requiredDelta'];
      currentTurnValueMode: CustomerServiceNlgSemanticFrameV1['serviceRealization']['currentTurnValue']['mode'];
      mustAddBeyondKnown: boolean;
      avoidReframeOnly: boolean;
      /** Semantic participation scope, never a length/sentence/message budget. */
      coverageObligation: 'SUFFICIENT_CURRENT_FOCUS' | 'COMPLETE_CURRENT_FOCUS';
      /** Relevant lived context may be used only inside the selected primary contribution. */
      adjacentContextUse: 'OPTIONAL_WITHIN_PRIMARY' | 'NONE';
    };
    /**
     * R2.3 response-effort projection. This field owns no WHAT and introduces no
     * output quota; it only makes the existing Response Target's specificity and
     * coverage expectation executable by ordinary Generation.
     */
    effortDepth: {
      authority: 'DERIVED_FROM_EXISTING_RESPONSE_TARGET_AND_CANONICAL_COMPLETION_ONLY';
      semanticAuthority: 'NO_INDEPENDENT_SEMANTIC_AUTHORITY';
      mode:
        | 'MINIMAL_DIRECT'
        | 'SUMMARY_CURRENT_FOCUS'
        | 'DIRECTIONAL_CURRENT_FOCUS'
        | 'CONCRETE_CURRENT_FOCUS'
        | 'DETAILED_CURRENT_FOCUS'
        | 'EXHAUSTIVE_CURRENT_FOCUS';
      coverageObligation: 'SUFFICIENT_CURRENT_FOCUS' | 'COMPLETE_CURRENT_FOCUS';
      requiredDelta: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['turnComposition']['semanticDelta']['responseTarget']['requiredDelta'];
      stopBasis: 'CANONICAL_COMPLETION_PLUS_REQUIRED_RESPONSE_TARGET_SATISFACTION';
      fixedQuotaAuthority: 'NONE';
    };
    selectedComponents: {
      identity: {
        selected: boolean;
        mode: CustomerServiceNlgSemanticFrameV1['serviceRealization']['identity']['mode'];
      };
      customerInput: {
        selected: boolean;
        disposition: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['participation']['questionDisposition'];
        completionDependency:
          | 'CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN'
          | 'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN';
      };
    };
    continuity: {
      /** Factual prior-turn state only; no model-facing reuse/order/cadence instruction. */
      priorContributionStatus: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['sharedContext']['priorContributionStatus'];
      currentFeedback: {
        reception: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['conversationReality']['currentFeedback']['reception'];
        correctionTarget: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['conversationReality']['currentFeedback']['correctionTarget'];
        requestedDeltas: string[];
      };
    };
    constraints: {
      preserveRequiredActs: true;
      cannotCreateActs: true;
      cannotChangeFactsOrPermission: true;
      noUnauthorizedIndependentContribution: true;
      /** Function-level semantic scope: sentence/segment fusion never authorizes an unselected contribution. */
      noUnauthorizedSemanticContribution: true;
      semanticContributionScope: 'SELECTED_CANONICAL_ACTS_ONLY';
    };
  };
  surface: {
    authority: 'FINAL_HUMAN_TURN_SURFACE_V1';
    /** Factual relationship context compiled from explicit role configuration + lived exchange state. */
    relationshipContext: {
      distance: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['adaptation']['relationshipDistance'];
    };
    /** The only editable HOW authority exposed to ordinary generation. */
    generationGuidance: {
      authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1';
      /** Persona is the sole editable HOW authority, never a semantic-contribution owner. */
      semanticAuthority: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA';
      /**
       * R1 structural least-privilege Persona projection. Persisted free-form Prompt
       * text remains server-side configuration/audit data; ordinary Generation only
       * receives a typed surface profile that cannot itself create a semantic Act.
       */
      semanticProjection: {
        authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY';
        selectedActTypes: string[];
        selectedReceptionActTypes: string[];
        unselectedSemanticInstructions: 'INERT_THIS_TURN';
        sourceTextRole: 'EXPRESSION_SOURCE_DATA_ONLY';
      };
      /** Persisted free-form configuration retained server-side for audit/editing; ordinary Generation transport strips it. */
      role: string | null;
      identity: string | null;
      surfaceProfile: {
        authority: 'STRUCTURED_PERSONA_SURFACE_ONLY_V1';
        source: 'ROLE_SPEAKER_PROJECTION';
        directness: number;
        formality: number;
        energy: number;
        colloquiality: string;
        sentenceShape: string;
        fragmentTolerance: string;
        ellipsisTolerance: string;
        rhythmVariation: string;
        emoji: string;
        sentenceParticleLevel: string;
      };
    };
  };
};

/**
 * Final model-facing HumanTurn projection.
 *
 * This function does not plan, rank, judge or repair. It only compiles existing
 * Canonical Plan / HumanTurn state and the persisted Role → Identity Prompt chain into
 * the two model-facing authorities Generation actually needs:
 *   1) realization = server-owned current-turn semantic scope + lived continuity facts;
 *   2) surface = factual relationship context + the one configurable HOW prompt chain.
 *
 * Canonical completion is preserved as WHAT; natural ordering, explanation amount,
 * stopping cadence, wording, sentence shape, length, rhythm and message segmentation
 * are intentionally not projected here.
 * Raw upstream fields remain server-side for diagnostics/compatibility only.
 */
export function compileCustomerServiceFinalModelFacingHumanTurn(
  contract: CustomerServiceRuntimeReplyContract,
  frame: CustomerServiceNlgSemanticFrameV1,
): CustomerServiceFinalModelFacingHumanTurnV1 {
  const human = frame.humanTurnRealization;
  const responseTarget = human.turnComposition.semanticDelta.responseTarget;
  const selectedActs = [
    ...frame.acts.required,
    ...frame.acts.preferred,
    ...frame.acts.optional,
  ];
  const selectedActTypes = new Set<string>(selectedActs.map((item) => item.type));
  const requiredActTypes = new Set<string>(frame.acts.required.map((item) => item.type));
  // selectedComponents are compatibility views only for hard semantic selections
  // whose existence must survive as an explicit model-facing dependency. Reception /
  // relationship semantic Acts are owned only by the selected Canonical Plan; HumanTurn
  // and Persona may shape their expression but cannot create an unselected reception WHAT.
  const requiredCustomerInputSelected = ['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY']
    .some((type) => requiredActTypes.has(type));
  const optionalCustomerInputSelected = selectedActTypes.has('REQUEST_OPTIONAL_PREFERENCE');
  const customerInputSelected = requiredCustomerInputSelected || optionalCustomerInputSelected;
  const customerInputDisposition: CustomerServiceNlgSemanticFrameV1['humanTurnRealization']['participation']['questionDisposition'] = requiredCustomerInputSelected
    ? 'REQUIRED'
    : optionalCustomerInputSelected
      ? 'ASK_ONE_IF_DECISION_RELEVANT'
      : 'NONE';
  const canonicalIdentityMode = resolveCanonicalIdentityMode(selectedActTypes);
  const canonicalReceptionActTypes = resolveCanonicalReceptionActTypes(selectedActTypes);
  const completeCurrentFocus = responseTarget.requiredDelta === 'COMPLETE_CURRENT_FOCUS'
    || responseTarget.requestedSpecificity === 'EXHAUSTIVE'
    || responseTarget.requestedSpecificity === 'SUMMARY';
  const coverageObligation: CustomerServiceFinalModelFacingHumanTurnV1['realization']['primary']['coverageObligation'] = completeCurrentFocus
    ? 'COMPLETE_CURRENT_FOCUS'
    : 'SUFFICIENT_CURRENT_FOCUS';
  const adjacentContextAllowed = frame.serviceRealization.contribution.target !== 'NONE'
    && !['STOP_AFTER_REQUIRED', 'HANDOFF'].includes(frame.interaction.completion);

  return {
    schemaVersion: 1,
    authority: 'FINAL_MODEL_FACING_HUMAN_TURN_V1',
    realization: {
      authority: 'EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY',
      canonicalPlan: {
        source: 'EXISTING_CANONICAL_INTERACTION_PLAN',
        requiredActs: cloneSemanticActs(frame.acts.required),
        preferredActs: cloneSemanticActs(frame.acts.preferred),
        optionalActs: cloneSemanticActs(frame.acts.optional),
        forbiddenActs: [...frame.acts.forbidden],
        completion: frame.interaction.completion,
        receptionContribution: {
          authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY',
          selected: canonicalReceptionActTypes.length > 0,
          actTypes: canonicalReceptionActTypes,
        },
        semanticPermit: {
          authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY',
          selectedActTypes: [...selectedActTypes],
          customerVisibleContributionScope: 'SELECTED_CANONICAL_ACTS_ONLY',
          personaSemanticDelta: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
        },
      },
      primary: {
        contribution: human.needAlignment.primaryContribution,
        target: frame.serviceRealization.contribution.target,
        requestedSpecificity: responseTarget.requestedSpecificity,
        requiredDelta: responseTarget.requiredDelta,
        currentTurnValueMode: frame.serviceRealization.currentTurnValue.mode,
        mustAddBeyondKnown: frame.serviceRealization.currentTurnValue.mustAddBeyondKnown,
        avoidReframeOnly: frame.serviceRealization.contribution.avoidReframeOnly,
        coverageObligation,
        adjacentContextUse: adjacentContextAllowed
          ? 'OPTIONAL_WITHIN_PRIMARY'
          : 'NONE',
      },
      effortDepth: {
        authority: 'DERIVED_FROM_EXISTING_RESPONSE_TARGET_AND_CANONICAL_COMPLETION_ONLY',
        semanticAuthority: 'NO_INDEPENDENT_SEMANTIC_AUTHORITY',
        mode: resolveResponseEffortDepthMode(responseTarget.requestedSpecificity),
        coverageObligation,
        requiredDelta: responseTarget.requiredDelta,
        stopBasis: 'CANONICAL_COMPLETION_PLUS_REQUIRED_RESPONSE_TARGET_SATISFACTION',
        fixedQuotaAuthority: 'NONE',
      },
      selectedComponents: {
        identity: {
          selected: canonicalIdentityMode !== 'NONE',
          mode: canonicalIdentityMode,
        },
        customerInput: {
          selected: customerInputSelected,
          disposition: customerInputDisposition,
          completionDependency: customerInputSelected
            ? 'CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN'
            : 'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN',
        },
      },
      continuity: {
        priorContributionStatus: human.sharedContext.priorContributionStatus,
        currentFeedback: {
          reception: human.conversationReality.currentFeedback.reception,
          correctionTarget: human.conversationReality.currentFeedback.correctionTarget,
          // Current Feedback is a current-turn authority. Historical requested
          // deltas remain available as read-only continuity evidence through the
          // conversation projection, but must not be relabelled as work that is
          // still requested now (especially after the current turn accepted and
          // closed the previous contribution).
          requestedDeltas: [...new Set(
            human.conversationReality.currentFeedback.requestedDeltas,
          )],
        },
      },
      constraints: {
        preserveRequiredActs: true,
        cannotCreateActs: true,
        cannotChangeFactsOrPermission: true,
        noUnauthorizedIndependentContribution: true,
        noUnauthorizedSemanticContribution: true,
        semanticContributionScope: 'SELECTED_CANONICAL_ACTS_ONLY',
      },
    },
    surface: {
      authority: 'FINAL_HUMAN_TURN_SURFACE_V1',
      relationshipContext: {
        distance: human.adaptation.relationshipDistance,
      },
      generationGuidance: {
        authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1',
        semanticAuthority: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
        semanticProjection: {
          authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY',
          selectedActTypes: [...selectedActTypes],
          selectedReceptionActTypes: [...canonicalReceptionActTypes],
          unselectedSemanticInstructions: 'INERT_THIS_TURN',
          sourceTextRole: 'EXPRESSION_SOURCE_DATA_ONLY',
        },
        role: contract.persona?.resolvedRoleIdentity?.generationPrompt.role || null,
        identity: contract.persona?.resolvedRoleIdentity?.generationPrompt.identity || null,
        surfaceProfile: projectStructuredPersonaSurfaceProfile(frame),
      },
    },
  };
}


function resolveResponseEffortDepthMode(
  requestedSpecificity: CustomerServiceFinalModelFacingHumanTurnV1['realization']['primary']['requestedSpecificity'],
): CustomerServiceFinalModelFacingHumanTurnV1['realization']['effortDepth']['mode'] {
  switch (requestedSpecificity) {
    case 'MINIMAL':
      return 'MINIMAL_DIRECT';
    case 'SUMMARY':
      return 'SUMMARY_CURRENT_FOCUS';
    case 'CONCRETE':
      return 'CONCRETE_CURRENT_FOCUS';
    case 'DETAIL':
      return 'DETAILED_CURRENT_FOCUS';
    case 'EXHAUSTIVE':
      return 'EXHAUSTIVE_CURRENT_FOCUS';
    case 'DIRECTION':
    default:
      return 'DIRECTIONAL_CURRENT_FOCUS';
  }
}


function resolveCanonicalReceptionActTypes(selectedActTypes: Set<string>) {
  const receptionTypes = [
    'PRESENCE_ACK',
    'LIGHT_ACK',
    'EMOTIONAL_ACK',
    'REASSURE',
    'RELATIONSHIP_MAINTENANCE',
    'ACKNOWLEDGE_PREFERENCE',
    'ACKNOWLEDGE_PROBLEM',
  ];
  return receptionTypes.filter((type) => selectedActTypes.has(type));
}

function resolveCanonicalIdentityMode(
  selectedActTypes: Set<string>,
): CustomerServiceNlgSemanticFrameV1['serviceRealization']['identity']['mode'] {
  if (selectedActTypes.has('DISCLOSE_AI_IDENTITY')) return 'AI_TRUTHFUL';
  if (selectedActTypes.has('DISCLOSE_NAME')) return 'PUBLIC_NAME';
  if (selectedActTypes.has('CONFIRM_ROLE')) return 'CONFIRM_RELATION';
  if (selectedActTypes.has('DISCLOSE_PUBLIC_IDENTITY')) return 'PUBLIC_IDENTITY';
  if (selectedActTypes.has('EXPLAIN_SERVICE_SCOPE')) return 'SERVICE_SCOPE';
  return 'NONE';
}

function projectStructuredPersonaSurfaceProfile(frame: CustomerServiceNlgSemanticFrameV1) {
  const stable = frame.voice?.speaker?.stableCore || {
    corePresence: { directness: 60, formality: 45, energy: 50 },
    conversationalTexture: {
      colloquiality: 'MEDIUM', sentenceShape: 'MIXED', fragmentTolerance: 'MEDIUM',
      ellipsisTolerance: 'LOW', rhythmVariation: 'MEDIUM',
    },
    deliveryStyle: { emoji: 'LIGHT', sentenceParticleLevel: 'LOW' },
  };
  return {
    authority: 'STRUCTURED_PERSONA_SURFACE_ONLY_V1' as const,
    source: 'ROLE_SPEAKER_PROJECTION' as const,
    // Only surface dimensions survive ordinary model-facing projection. Warmth,
    // empathy, proactivity, advice style, relationship maintenance and humor are
    // intentionally absent because those dimensions can imply a new semantic Act.
    directness: stable.corePresence.directness,
    formality: stable.corePresence.formality,
    energy: stable.corePresence.energy,
    colloquiality: stable.conversationalTexture.colloquiality,
    sentenceShape: stable.conversationalTexture.sentenceShape,
    fragmentTolerance: stable.conversationalTexture.fragmentTolerance,
    ellipsisTolerance: stable.conversationalTexture.ellipsisTolerance,
    rhythmVariation: stable.conversationalTexture.rhythmVariation,
    emoji: stable.deliveryStyle.emoji,
    sentenceParticleLevel: stable.deliveryStyle.sentenceParticleLevel,
  };
}

function cloneSemanticActs<T extends CustomerServiceNlgSemanticFrameV1['acts']['required']>(acts: T): T {
  return acts.map((act) => ({
    ...act,
    allowedGroundingRefs: [...(act.allowedGroundingRefs || [])],
    parameters: act.parameters ? {
      ...act.parameters,
      known: act.parameters.known ? [...act.parameters.known] : undefined,
      missing: act.parameters.missing ? [...act.parameters.missing] : undefined,
    } : undefined,
  })) as T;
}
