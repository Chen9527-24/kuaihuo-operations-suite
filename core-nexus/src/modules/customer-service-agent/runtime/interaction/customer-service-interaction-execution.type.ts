import type { CustomerServiceInteractionPlanV2 } from './customer-service-interaction-plan.type';

export const CUSTOMER_SERVICE_HVE_EXECUTION_LANES = [
  'HVE3_CANDIDATE',
  'HVE_ACTIVE',
] as const;

export type CustomerServiceHveExecutionLane = (typeof CUSTOMER_SERVICE_HVE_EXECUTION_LANES)[number];

export type CustomerServiceInteractionExecutionEnvelope = {
  schemaVersion: 1;
  lane: CustomerServiceHveExecutionLane;
  planSchemaVersion: CustomerServiceInteractionPlanV2['schemaVersion'];
  planAvailable: boolean;
  customerVisible: true;
  reasonCode: string;
};

export function buildCustomerServiceInteractionExecutionEnvelope(input: {
  requestedLane?: unknown;
  plan?: CustomerServiceInteractionPlanV2 | null;
}): CustomerServiceInteractionExecutionEnvelope {
  const requested = String(input.requestedLane || '').trim().toUpperCase();
  const lane: CustomerServiceHveExecutionLane = requested === 'HVE3_CANDIDATE'
    ? 'HVE3_CANDIDATE'
    : 'HVE_ACTIVE';
  const planAvailable = Boolean(input.plan);
  return {
    schemaVersion: 1,
    lane,
    planSchemaVersion: 2,
    planAvailable,
    customerVisible: true,
    reasonCode: !planAvailable
      ? 'HVE_PLAN_UNAVAILABLE'
      : lane === 'HVE3_CANDIDATE'
        ? 'HVE3_EXPLICIT_CANDIDATE_LANE'
        : 'HVE_ACTIVE_PUBLISHED_LANE',
  };
}
