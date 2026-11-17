import type {
  HveCanonicalPlanDiagnostic,
  HveCandidateSelectionDiagnostic,
  HveGroundingAuditDiagnostic,
  HveActiveContextWindowDiagnostic,
  HveDeliveryPlanDiagnostic,
  HveDecisionIntegrityDiagnostic,
  HveHumanityMetricDiagnostic,
  HveHumanTurnObservabilityDiagnostic,
  HveResolvedRoleDiagnostic,
  HveRoleCapabilityContextDiagnostic,
  HveRoleParticipationDiagnostic,
  HveTurnCompositionDiagnostic,
  HveV19ActivationDiagnostic
} from '@/api/modules/autoReplies';

export interface HveTurnDiagnosticSnapshot {
  id: string;
  turnNumber: number;
  attemptNumber: number;
  requestKind: 'INITIAL' | 'REGENERATE';
  requestStatus: 'SUCCESS' | 'BLOCKED' | 'ERROR';
  capturedAt: string;
  lane: 'HVE3_CANDIDATE' | 'HVE_ACTIVE';
  testClientMessageId?: string | null;
  inputContent: string;
  assistantContent: string;
  errorMessage?: string | null;
  replyTraceId?: string | null;
  testSessionId?: string | null;
  stateRevision?: number | null;
  contextMessageCount?: number | null;
  activeContextWindow?: HveActiveContextWindowDiagnostic | null;
  deliveryPlan?: HveDeliveryPlanDiagnostic | null;
  activation?: HveV19ActivationDiagnostic | null;
  generationKernel?: Record<string, unknown> | null;
  deepRecognition?: Record<string, unknown> | null;
  semanticStateAudit?: Record<string, unknown> | null;
  robotTestSessionDiagnostic?: Record<string, unknown> | null;
  runtimeOutcomeDiagnostic?: Record<string, unknown> | null;
  plan?: HveCanonicalPlanDiagnostic | null;
  participation?: HveRoleParticipationDiagnostic | null;
  turnComposition?: HveTurnCompositionDiagnostic | null;
  humanTurnObservability?: HveHumanTurnObservabilityDiagnostic | null;
  finalModelFacingHumanTurn?: Record<string, unknown> | null;
  humanityMetrics?: HveHumanityMetricDiagnostic | null;
  decisionIntegrity?: HveDecisionIntegrityDiagnostic | null;
  roleContext?: HveRoleCapabilityContextDiagnostic | null;
  resolvedRole?: HveResolvedRoleDiagnostic | null;
  candidateSelection?: HveCandidateSelectionDiagnostic | null;
  groundingAudit?: HveGroundingAuditDiagnostic | null;
  /** Server-owned bounded Runtime Audit envelope; read-only diagnostic projection. */
  runtimeAudit?: Record<string, unknown> | null;
}
