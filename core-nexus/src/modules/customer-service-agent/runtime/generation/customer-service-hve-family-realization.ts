import type { CustomerServiceInteractionPlanV2 } from '../interaction/customer-service-interaction-plan.type';

export type CustomerServiceHveFamilyRealizationProfile = {
  /**
   * Server-side coarse family diagnostic. H0.2-A no longer projects this family as
   * a model-facing style authority. It never creates, deletes, or upgrades Acts.
   */
  family:
    | 'GENERAL'
    | 'CASUAL'
    | 'POSITIVE_EMOTION'
    | 'NEGATIVE_EMOTION'
    | 'COMPLAINT'
    | 'LOGISTICS_AFTERSALES'
    | 'BOUNDARY'
    | 'HANDOFF';
  responsePriority:
    | 'DIRECT'
    | 'RELATION_FIRST'
    | 'PROBLEM_THEN_RESOLUTION'
    | 'STATUS_OR_PATH_FIRST'
    | 'BOUNDARY_FIRST'
    | 'HANDOFF_FIRST';
  emotionalRegister: 'NEUTRAL' | 'LIGHT' | 'WARM' | 'CALM' | 'SERIOUS';
  avoidSalesSteering: boolean;
  avoidPrematureAdvice: boolean;
  avoidPerformativeEmpathy: boolean;
  preferConcreteResolution: boolean;
  preferConciseBoundary: boolean;
};

/**
 * R4-G compatibility profile derived only from the already-authoritative Plan.
 * H0.2-A keeps it for server diagnostics/evaluation compatibility only; high-fidelity
 * HumanTurn realization now consumes Role/relationship/user state directly.
 */
export function resolveCustomerServiceHveFamilyRealization(
  plan: CustomerServiceInteractionPlanV2,
): CustomerServiceHveFamilyRealizationProfile {
  const interaction = plan.interactionType;
  const hardSuppressed = new Set(
    plan.suppressedActs
      .filter((item) => item.enforcement === 'HARD')
      .map((item) => item.type),
  );
  const explicitListenOnlyBoundary = hardSuppressed.has('PROVIDE_GENERAL_GUIDANCE')
    && hardSuppressed.has('REQUEST_OPTIONAL_PREFERENCE');

  if (interaction === 'HANDOFF') {
    return profile('HANDOFF', 'HANDOFF_FIRST', 'SERIOUS', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: true,
      avoidPerformativeEmpathy: true,
      preferConcreteResolution: true,
      preferConciseBoundary: true,
    });
  }

  if (interaction === 'SECURITY_SENSITIVE' || explicitListenOnlyBoundary) {
    return profile('BOUNDARY', 'BOUNDARY_FIRST', 'SERIOUS', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: true,
      avoidPerformativeEmpathy: true,
      preferConcreteResolution: false,
      preferConciseBoundary: true,
    });
  }

  if (interaction === 'COMPLAINT') {
    return profile('COMPLAINT', 'PROBLEM_THEN_RESOLUTION', 'SERIOUS', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: false,
      avoidPerformativeEmpathy: true,
      preferConcreteResolution: true,
      preferConciseBoundary: false,
    });
  }

  if (['LOGISTICS_STATUS', 'LOGISTICS_DELAY', 'AFTER_SALES', 'REFUND_REQUEST'].includes(interaction)) {
    return profile('LOGISTICS_AFTERSALES', 'STATUS_OR_PATH_FIRST', 'CALM', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: false,
      avoidPerformativeEmpathy: true,
      preferConcreteResolution: true,
      preferConciseBoundary: false,
    });
  }

  if (interaction === 'NEGATIVE_DISCLOSURE') {
    return profile('NEGATIVE_EMOTION', 'RELATION_FIRST', 'CALM', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: true,
      avoidPerformativeEmpathy: true,
      preferConcreteResolution: false,
      preferConciseBoundary: false,
    });
  }

  if (interaction === 'POSITIVE_SHARING') {
    return profile('POSITIVE_EMOTION', 'RELATION_FIRST', 'LIGHT', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: false,
      avoidPerformativeEmpathy: false,
      preferConcreteResolution: false,
      preferConciseBoundary: false,
    });
  }

  if (['CASUAL_CHAT', 'LIGHT_HUMOR', 'PERSONAL_CURIOSITY'].includes(interaction)) {
    return profile('CASUAL', 'RELATION_FIRST', 'WARM', {
      avoidSalesSteering: true,
      avoidPrematureAdvice: false,
      avoidPerformativeEmpathy: false,
      preferConcreteResolution: false,
      preferConciseBoundary: false,
    });
  }

  return profile('GENERAL', 'DIRECT', 'NEUTRAL', {
    avoidSalesSteering: false,
    avoidPrematureAdvice: false,
    avoidPerformativeEmpathy: false,
    preferConcreteResolution: false,
    preferConciseBoundary: false,
  });
}

function profile(
  family: CustomerServiceHveFamilyRealizationProfile['family'],
  responsePriority: CustomerServiceHveFamilyRealizationProfile['responsePriority'],
  emotionalRegister: CustomerServiceHveFamilyRealizationProfile['emotionalRegister'],
  flags: Pick<
    CustomerServiceHveFamilyRealizationProfile,
    'avoidSalesSteering' | 'avoidPrematureAdvice' | 'avoidPerformativeEmpathy' | 'preferConcreteResolution' | 'preferConciseBoundary'
  >,
): CustomerServiceHveFamilyRealizationProfile {
  return { family, responsePriority, emotionalRegister, ...flags };
}
