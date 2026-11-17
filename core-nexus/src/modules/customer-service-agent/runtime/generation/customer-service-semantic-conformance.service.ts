import { Injectable } from '@nestjs/common';
import type { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import { CustomerServiceModelGateway } from '../../infrastructure/model-gateway/customer-service-model-gateway.service';
import {
  projectCustomerServiceCanonicalActsForSemanticFrame,
  type CustomerServiceNlgSemanticFrameV1,
} from './customer-service-nlg-execution-brief';
import { compileCustomerServiceFinalModelFacingHumanTurn } from './customer-service-final-realization-authority';
import {
  type CustomerServiceGenerationResult,
  type CustomerServiceGeneratedSegment,
  type CustomerServiceHveReplyV2Segment,
  validateHveReplyV2CanonicalBindingIntegrity,
  validateHveReplyV2CanonicalBindings,
  validateHveReplyV2PrimaryTaskSurfaceOrder,
} from './customer-service-reply-generator.service';
import type {
  CustomerServiceSemanticConformanceRemovalV1,
  CustomerServiceSemanticContributionKind,
  CustomerServiceSemanticConformanceTraceV1,
  CustomerServiceSemanticConformanceUnitCheckV1,
  CustomerServiceSemanticConformanceViolationCode,
  CustomerServiceSemanticConformanceViolationV1,
  CustomerServiceSemanticTarget,
  CustomerServiceSemanticTaskDependency,
  CustomerServiceGroundingEntailment,
  CustomerServiceEvidenceRequirement,
  CustomerServiceGroundedActionRole,
  CustomerServiceGroundingBasis,
  CustomerServiceGroundingSupportWitnessV1,
} from './customer-service-semantic-conformance.type';

export type CustomerServiceSemanticConformanceOutcome = {
  accepted: boolean;
  generation: CustomerServiceGenerationResult;
  trace: CustomerServiceSemanticConformanceTraceV1;
};

type RuntimeSurfaceAtom = {
  atomId: string;
  segmentIndex: number;
  unitIndex: number;
  startOffset: number;
  endOffset: number;
  exactText: string;
};

type RuntimeSurfaceAtomProjection = {
  atoms: RuntimeSurfaceAtom[];
  byUnit: Map<string, RuntimeSurfaceAtom[]>;
};

type RuntimeSurfaceUnit = {
  unitId: string;
  segmentIndex: number;
  unitIndex: number;
  exactText: string;
};

type RuntimeSurfaceUnitProjection = {
  units: RuntimeSurfaceUnit[];
};

type ModelGroundingSupportWitness = CustomerServiceGroundingSupportWitnessV1 & {
  /** Semantic target of the cited source proposition itself, classified independently from the reply claim. */
  sourceSemanticTarget: CustomerServiceSemanticTarget;
  /** Action/outcome role of the cited source proposition itself. Runtime uses this only as a typed fail-closed consistency check. */
  sourceGroundedActionRole: CustomerServiceGroundedActionRole;
};

type ModelSemanticAtomClassification = {
  /** Runtime-only parse evidence; never inferred or returned as model authority. */
  witnessProtocolError?: string;
  atomId: string;
  contributionKind: CustomerServiceSemanticContributionKind;
  semanticTarget: CustomerServiceSemanticTarget;
  taskDependency: CustomerServiceSemanticTaskDependency;
  /** Whether this proposition semantically requires merchant/entity evidence, independent of outer Act/contribution labels. */
  evidenceRequirement: CustomerServiceEvidenceRequirement;
  /** Merchant/entity refs this proposition is semantically about, independent of whether those refs support the claim. */
  merchantReferentRefs: string[];
  /** Whether every merchant/entity-specific factual proposition in this whole Runtime atom is supported by supplied evidence. */
  groundingEntailment: CustomerServiceGroundingEntailment;
  /** Sub-role for ACTION_OPTION_RISK_OR_OUTCOME so recommendation choice is not conflated with product performance/outcome claims. */
  groundedActionRole: CustomerServiceGroundedActionRole;
  /** How the grounded proposition is justified: direct source, bounded choice synthesis, partial inference, or unsupported inference. */
  groundingBasis: CustomerServiceGroundingBasis;
  /** Exact source-owned witness excerpts. Runtime verifies each excerpt belongs to the same declared ref. */
  groundingSupport: ModelGroundingSupportWitness[];
  /** Grounding refs materially realized by this Runtime-owned atom, if any. Authorization is decided later by Runtime. */
  realizedGroundingRefs: string[];
};

type GroundingEvidenceProjection = {
  id: string;
  entityType: string | null;
  entityKey: string | null;
  /** Server-owned canonical aliases are classifier context only; they never create Grounding permission. */
  aliases: string[];
  title: string;
  content: string;
  structuredData: unknown;
};

type ModelPartialSupportSpanClassification = Omit<ModelSemanticAtomClassification, 'atomId'> & {
  exactText: string;
};

type ModelSemanticSpanClassification = Omit<ModelSemanticAtomClassification, 'atomId'> & {
  unitId: string;
  exactText: string;
  /**
   * Optional one-level semantic subpartition owned by the SAME blind classifier call.
   * Runtime consumes it only for a PARTIALLY_SUPPORTED parent that the classifier can
   * decompose into byte-exact, ordered, exhaustive leaf propositions. It is never a
   * Runtime lexical split and never grants authorization by itself.
   */
  partialSupportSpans: ModelPartialSupportSpanClassification[];
};

type ModelSemanticUnitGroundedAction = {
  unitId: string;
  groundedActionRole: 'CHOICE_OR_RECOMMENDATION';
  taskDependency: 'MATERIAL_TO_CUSTOMER_TASK';
  /** Zero-based indexes into this unit's returned semantic spans. */
  spanIndexes: number[];
  /** Grounding refs whose already-supported propositions the unit-level action operates over. */
  realizedGroundingRefs: string[];
};

type ModelSemanticFunctionEnvelope = {
  version: 'HVE_SEMANTIC_SPANS_V4';
  spans: ModelSemanticSpanClassification[];
  /** Same classifier call owns discourse-level grounded action semantics; no Canonical Act ids are visible. */
  unitGroundedActions: ModelSemanticUnitGroundedAction[];
};

const ALLOWED_VIOLATION_CODES = new Set<CustomerServiceSemanticConformanceViolationCode>([
  'UNAUTHORIZED_SEMANTIC_CONTRIBUTION',
  'DECLARED_ACT_MISMATCH',
  'UNAUTHORIZED_RECEPTION_CONTRIBUTION',
  'UNAUTHORIZED_RELATIONSHIP_CONTRIBUTION',
  'UNAUTHORIZED_QUESTION_OR_SERVICE_ENTRY',
  'GROUNDED_EVIDENCE_NOT_REALIZED',
  'GROUNDED_EVIDENCE_UNSUPPORTED',
  'REQUIRED_ACT_NOT_REALIZED',
  'CONFORMANCE_PROTOCOL_ERROR',
]);

const REMOVABLE_SEMANTIC_VIOLATION_CODES = new Set<CustomerServiceSemanticConformanceViolationCode>([
  'UNAUTHORIZED_SEMANTIC_CONTRIBUTION',
  'UNAUTHORIZED_RECEPTION_CONTRIBUTION',
  'UNAUTHORIZED_RELATIONSHIP_CONTRIBUTION',
  'UNAUTHORIZED_QUESTION_OR_SERVICE_ENTRY',
  'GROUNDED_EVIDENCE_UNSUPPORTED',
]);


const SEMANTIC_CONTRIBUTION_KINDS = new Set<CustomerServiceSemanticContributionKind>([
  'ANSWER_CONTENT',
  'ANSWER_JUDGMENT',
  'GUIDANCE_CONTENT',
  'GROUNDED_CONTENT',
  'STATUS_OR_EXECUTION_CONTENT',
  'IDENTITY_OR_SCOPE_CONTENT',
  'BOUNDARY_CONTENT',
  'RESTATEMENT_CONTENT',
  'HISTORY_REFERENCE_CONTENT',
  'RECEPTION_ACK',
  'REASSURANCE',
  'SOCIAL_NORMALIZATION',
  'RELATIONSHIP_CONTENT',
  'QUESTION_OR_SERVICE_ENTRY',
  'BUSINESS_ADVANCE_OR_CTA',
  'HUMOR',
  'CLOSE_ACK',
  'CLOSE_WARMTH',
  'NON_PROPOSITIONAL_FRAGMENT',
  'MIXED_OR_UNCERTAIN',
  'OTHER_PROPOSITION',
]);

const SEMANTIC_TARGETS = new Set<CustomerServiceSemanticTarget>([
  'CUSTOMER_AFFECT_OR_STANCE',
  'CUSTOMER_EFFORT_OR_SELF_EVALUATION',
  'CUSTOMER_SITUATION_FACT',
  'TASK_OR_DOMAIN_FACT',
  'ACTION_OPTION_RISK_OR_OUTCOME',
  'MERCHANT_ENTITY_OR_POLICY',
  'RELATIONSHIP_OR_CONVERSATION',
  'OTHER',
]);

const SEMANTIC_TASK_DEPENDENCIES = new Set<CustomerServiceSemanticTaskDependency>([
  'MATERIAL_TO_CUSTOMER_TASK',
  'SUPPORTS_CUSTOMER_TASK',
  'INDEPENDENT_OF_CUSTOMER_TASK',
  'CLOSURE_ONLY',
]);

const GROUNDING_ENTAILMENT_VALUES = new Set<CustomerServiceGroundingEntailment>([
  'NOT_APPLICABLE',
  'FULLY_SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'UNSUPPORTED',
]);

const EVIDENCE_REQUIREMENT_VALUES = new Set<CustomerServiceEvidenceRequirement>([
  'NOT_REQUIRED',
  'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',
  'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
]);

const GROUNDED_ACTION_ROLE_VALUES = new Set<CustomerServiceGroundedActionRole>([
  'NOT_APPLICABLE',
  'CHOICE_OR_RECOMMENDATION',
  'SUITABILITY_OR_DECISION_SUPPORT',
  'PERFORMANCE_OR_EXPERIENCE',
  'RISK_OR_OTHER_OUTCOME',
]);

const GROUNDING_BASIS_VALUES = new Set<CustomerServiceGroundingBasis>([
  'NOT_APPLICABLE',
  'DIRECT_SOURCE',
  'SUPPORTED_CHOICE_SYNTHESIS',
  'PARTIAL_SOURCE_PLUS_INFERENCE',
  'INFERRED_OR_UNSUPPORTED',
]);

const TASK_MATERIAL_REQUIRED_VALUE_ACT_TYPES = new Set([
  'DIRECT_ANSWER',
  'PROVIDE_GENERAL_GUIDANCE',
  'RECOMMEND_GROUNDED_ITEM',
  'EXPLAIN_GROUNDED_FACT',
  'REPORT_STATUS',
  'EXECUTE_SERVICE_STEP',
]);

const CONTRIBUTION_KIND_COMPATIBLE_ACT_TYPES: Record<CustomerServiceSemanticContributionKind, ReadonlySet<string>> = {
  ANSWER_CONTENT: new Set(['DIRECT_ANSWER']),
  ANSWER_JUDGMENT: new Set(['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'REPORT_STATUS']),
  GUIDANCE_CONTENT: new Set(['PROVIDE_GENERAL_GUIDANCE', 'DIRECT_ANSWER', 'EXECUTE_SERVICE_STEP']),
  GROUNDED_CONTENT: new Set(['EXPLAIN_GROUNDED_FACT', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP']),
  STATUS_OR_EXECUTION_CONTENT: new Set(['REPORT_STATUS', 'EXECUTE_SERVICE_STEP', 'REQUEST_HANDOFF']),
  IDENTITY_OR_SCOPE_CONTENT: new Set(['CONFIRM_ROLE', 'DISCLOSE_PUBLIC_IDENTITY', 'DISCLOSE_AI_IDENTITY', 'DISCLOSE_NAME', 'EXPLAIN_SERVICE_SCOPE']),
  BOUNDARY_CONTENT: new Set(['EXPLAIN_BOUNDARY']),
  RESTATEMENT_CONTENT: new Set(['RESTATEMENT']),
  HISTORY_REFERENCE_CONTENT: new Set(['HISTORY_REFERENCE', 'DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE']),
  RECEPTION_ACK: new Set(['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PREFERENCE', 'ACKNOWLEDGE_PROBLEM']),
  REASSURANCE: new Set(['REASSURE']),
  SOCIAL_NORMALIZATION: new Set(['REASSURE', 'EMOTIONAL_ACK']),
  RELATIONSHIP_CONTENT: new Set(['RELATIONSHIP_MAINTENANCE']),
  QUESTION_OR_SERVICE_ENTRY: new Set(['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY', 'OPEN_SERVICE_INVITATION']),
  BUSINESS_ADVANCE_OR_CTA: new Set(['BUSINESS_ADVANCE', 'SALES_CTA']),
  HUMOR: new Set(['LIGHT_HUMOR', 'DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'NATURAL_CLOSE']),
  CLOSE_ACK: new Set(['NATURAL_CLOSE']),
  CLOSE_WARMTH: new Set(['NATURAL_CLOSE']),
  NON_PROPOSITIONAL_FRAGMENT: new Set(),
  MIXED_OR_UNCERTAIN: new Set(),
  OTHER_PROPOSITION: new Set(),
};

const GROUNDABLE_SUBSTANTIVE_CONTRIBUTION_KINDS = new Set<CustomerServiceSemanticContributionKind>([
  'ANSWER_CONTENT',
  'ANSWER_JUDGMENT',
  'GUIDANCE_CONTENT',
  // contributionKind describes customer-facing function; proposition evidence ownership
  // is carried separately. An object-level merchant assertion cannot evade Grounding merely
  // because its surface function was classified as a boundary.
  'BOUNDARY_CONTENT',
]);

/**
 * V12 Canonical Semantic Conformance.
 *
 * This is deliberately not a Planner, quality Judge, Humanizer or free-text Repair.
 * It gets no authority to add facts/Acts/grounding or improve style. It performs one
 * bounded semantic-authorization check over the already-generated HVE_REPLY_V2 units.
 * The single semantic model call owns proposition partition + semantic classification. Runtime
 * accepts only an exact, exhaustive, in-order verbatim partition, derives all offsets itself,
 * and may then remove only whole validated semantic spans. Conformance itself does not own Send:
 * classified-but-unsafe semantic disputes remain diagnostic/non-veto here, while the HVE execution consumer may fact-safe
 * degrade a proposition-level merchant/entity claim when the checker itself is unavailable/invalid and therefore cannot
 * establish evidence authorization.
 */
@Injectable()
export class CustomerServiceSemanticConformanceService {
  private static readonly MIN_CLASSIFIER_MAX_TOKENS = 1200;
  private static readonly MAX_CLASSIFIER_MAX_TOKENS = 4000;
  private static readonly TIMEOUT_MS = resolveConformanceTimeoutMs();

  constructor(private readonly modelGateway: CustomerServiceModelGateway) {}

  async conform(input: {
    contract: CustomerServiceRuntimeReplyContract;
    semanticFrame: CustomerServiceNlgSemanticFrameV1;
    generation: CustomerServiceGenerationResult;
  }): Promise<CustomerServiceSemanticConformanceOutcome> {
    const originalText = String(input.generation.draft || '').trim();
    if (!originalText) {
      return rejectedWithoutCall(input.generation, 'CONFORMANCE_PROTOCOL_ERROR', '客户可见正文为空，无法执行 Semantic Conformance。');
    }

    const semanticSegments = projectGeneratedSemanticSegments(input.generation.structuredSegments || []);
    if (!semanticSegments.length) {
      return rejectedWithoutCall(input.generation, 'CONFORMANCE_PROTOCOL_ERROR', '当前 HVE 回复缺少 HVE_REPLY_V2 semantic units。');
    }
    const structuralError = validateHveReplyV2CanonicalBindings(input.contract, semanticSegments);
    if (structuralError) {
      return rejectedWithoutCall(input.generation, 'DECLARED_ACT_MISMATCH', structuralError);
    }

    const finalHumanTurn = compileCustomerServiceFinalModelFacingHumanTurn(input.contract, input.semanticFrame);
    const selectedActs = [
      ...finalHumanTurn.realization.canonicalPlan.requiredActs,
      ...finalHumanTurn.realization.canonicalPlan.preferredActs,
      ...finalHumanTurn.realization.canonicalPlan.optionalActs,
    ];
    const allowedGroundingRefs = new Set(
      selectedActs.flatMap((act) => act.allowedGroundingRefs || []),
    );
    // Classification evidence and authorization are deliberately separate. The blind
    // classifier may inspect every already-selected Knowledge entry so it can determine
    // whether a proposition semantically requires merchant/entity evidence even when an
    // upstream Canonical bug omitted the Grounded Act. Runtime bindings below remain the
    // only authorization owner; seeing an evidence ref here cannot create Grounding.
    const availableKnowledgeEvidence: GroundingEvidenceProjection[] = uniqueGroundingEvidenceProjections([
      // The model-facing Semantic Frame intentionally withholds business Knowledge when no
      // Grounded Act was planned. Conformance is a different, blind enforcement boundary:
      // it must still see the server-selected business evidence so an upstream Act omission
      // cannot downgrade a merchant proposition into NOT_REQUIRED. These entries are
      // classification evidence only; authorization below still requires Canonical bindings.
      ...input.contract.businessContext.knowledgeEntries.map((entry) => ({
        id: entry.id,
        entityType: entry.entityType || null,
        entityKey: entry.entityKey || null,
        aliases: [...(entry.aliases || [])],
        title: entry.title,
        content: entry.content,
        structuredData: entry.structuredData || null,
      })),
      ...input.semanticFrame.grounding.knowledge.map((entry) => ({
        id: entry.id,
        entityType: entry.entityType || null,
        entityKey: entry.entityKey || null,
        aliases: [...(entry.aliases || [])],
        title: entry.title,
        content: entry.content,
        structuredData: entry.structuredData || null,
      })),
    ]);
    const authorizedKnowledgeEvidence = availableKnowledgeEvidence
      .filter((entry) => allowedGroundingRefs.has(entry.id));

    // HVE units own the deterministic outer structure. Open-language proposition
    // boundaries are classified in the same single semantic-model call as the semantic
    // axes below; Runtime never derives those boundaries from punctuation, keywords,
    // entity-title position, or sentence templates.
    const unitProjection = buildRuntimeSurfaceUnitProjection(semanticSegments);
    if (!unitProjection.ok) {
      return rejectedWithoutCall(input.generation, 'CONFORMANCE_PROTOCOL_ERROR', unitProjection.error);
    }

    const responseTarget = input.semanticFrame.humanTurnRealization?.turnComposition?.semanticDelta?.responseTarget;
    const responseTargetContext: ConformanceResponseTargetContext | null = responseTarget
      ? {
        knowledgeRequirement: responseTarget.knowledgeRequirement,
        unresolvedNeed: responseTarget.unresolvedNeed,
        // Preserve only typed fact/referent diagnostics needed to resolve proposition subject scope.
        // These tokens are classification context, never executable Authority.
        evidence: (responseTarget.evidence || []).filter((item) => (
          item.startsWith('FACT_OWNERSHIP:')
          || item.startsWith('FACT_DIMENSION:')
          || item.startsWith('REFERENT_RESOLUTION:')
          || item.startsWith('GROUNDING_ENTITY_MATCH:')
        )),
      }
      : null;
    const prompt = buildConformancePrompt({
      latestCustomerMessage: input.contract.groundedContext.latestCustomerMessage,
      units: unitProjection.value.units,
      knowledgeEvidence: availableKnowledgeEvidence,
      responseTargetContext,
    });
    const classifierMaxTokens = resolveConformanceClassifierMaxTokens(
      resolveSemanticSpanBudgetUnits(unitProjection.value.units),
      CustomerServiceSemanticConformanceService.MIN_CLASSIFIER_MAX_TOKENS,
      CustomerServiceSemanticConformanceService.MAX_CLASSIFIER_MAX_TOKENS,
    );
    const result = await this.modelGateway.generate({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0,
      maxTokens: classifierMaxTokens,
      timeoutMs: CustomerServiceSemanticConformanceService.TIMEOUT_MS,
      thinkingMode: 'DISABLED',
      jsonMode: true,
    });

    if (!result.ok) {
      const trace = baseTrace({
        decision: 'UNPROVEN_PRESERVED',
        observedDecision: 'UNAVAILABLE',
        generation: input.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        violations: [{
          code: 'CONFORMANCE_PROTOCOL_ERROR',
          segmentIndex: null,
          unitIndex: null,
          reason: result.errorMessage || result.status,
        }],
        errorMessage: result.errorMessage || result.status,
      });
      return { accepted: false, generation: attachConformance(input.generation, trace, result.elapsedMs), trace };
    }

    const classifierTruncated = result.truncated === true
      || String(result.finishReason || '').toLowerCase() === 'length';
    const parsedResult = classifierTruncated
      ? ({ ok: false, reason: 'CLASSIFIER_OUTPUT_TRUNCATED' } as const)
      : parseSemanticFunctionEnvelope(result.content);
    if (!parsedResult.ok) {
      const protocolDiagnostic = buildConformanceProtocolDiagnostic({
        reason: parsedResult.reason,
        atomCount: unitProjection.value.units.length,
        requestedMaxTokens: result.requestedMaxTokens || classifierMaxTokens,
        effectiveMaxTokens: result.effectiveMaxTokens || classifierMaxTokens,
        completionTokens: Number(result.usage?.completionTokens || 0),
        finishReason: result.finishReason || null,
        truncated: classifierTruncated,
      });
      const trace = baseTrace({
        decision: 'UNPROVEN_PRESERVED',
        observedDecision: 'INVALID_RESPONSE',
        generation: input.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        violations: [{
          code: 'CONFORMANCE_PROTOCOL_ERROR',
          segmentIndex: null,
          unitIndex: null,
          reason: `Semantic classifier returned an invalid HVE_SEMANTIC_SPANS_V4 envelope: ${protocolDiagnostic}`,
        }],
        errorMessage: `HVE_SEMANTIC_SPANS_V4_INVALID:${protocolDiagnostic}`,
      });
      return { accepted: false, generation: attachConformance(input.generation, trace, result.elapsedMs), trace };
    }
    const parsed = parsedResult.value;
    const semanticPartition = projectClassifierSemanticSpans(semanticSegments, unitProjection.value, parsed.spans, parsed.unitGroundedActions);
    if (!semanticPartition.ok) {
      return invalidParsedDecision(input.generation, result, semanticPartition.error);
    }
    const atomProjection = semanticPartition.atomProjection;
    const classifications = semanticPartition.classifications;

    const observedModelDecision = 'CLASSIFIED' as const;
    const serverOwnedEvidence = projectServerOwnedSemanticOwnership(semanticSegments, atomProjection, classifications, parsed.unitGroundedActions, availableKnowledgeEvidence);
    if (!serverOwnedEvidence.ok) {
      return invalidParsedDecision(input.generation, result, serverOwnedEvidence.error);
    }
    if (serverOwnedEvidence.unsafeViolation) {
      const trace = baseTrace({
        decision: 'UNPROVEN_PRESERVED',
        observedDecision: observedModelDecision,
        generation: input.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        unitChecks: serverOwnedEvidence.checks,
        violations: serverOwnedEvidence.violations,
        errorMessage: serverOwnedEvidence.unsafeViolation,
      });
      return { accepted: false, generation: attachConformance(input.generation, trace, result.elapsedMs), trace };
    }

    const projectedChecks = serverOwnedEvidence.checks;
    const projectedViolations = serverOwnedEvidence.violations;
    const projectedRemovals = serverOwnedEvidence.removals;
    const projectedDecision: 'PASS' | 'REMOVE_UNAUTHORIZED_SPANS' = projectedRemovals.length
      ? 'REMOVE_UNAUTHORIZED_SPANS'
      : 'PASS';

    if (projectedDecision === 'PASS') {
      if (projectedRemovals.length || projectedViolations.length) {
        return invalidParsedDecision(input.generation, result, 'PASS cannot include removals or violations.');
      }
      const checkError = validateConformanceUnitChecks(input.contract, semanticSegments, projectedChecks, 'PASS', [], projectedViolations);
      if (checkError) {
        return classifiedUnprovenDecision(input.generation, result, checkError, {
          unitChecks: projectedChecks,
          violations: projectedViolations,
        });
      }
      const narrowed = narrowGeneratedGroundedBindingsToConformanceEvidence(input.generation, projectedChecks);
      if (!narrowed.ok) {
        return classifiedUnprovenDecision(input.generation, result, narrowed.error, {
          unitChecks: projectedChecks,
          violations: projectedViolations,
        });
      }
      const narrowedSemanticSegments = projectGeneratedSemanticSegments(narrowed.generation.structuredSegments || []);
      const narrowedBindingError = narrowedSemanticSegments.length
        ? validateHveReplyV2CanonicalBindings(input.contract, narrowedSemanticSegments)
        : 'HVE_REPLY_V2_NARROWED_SEMANTIC_UNITS_EMPTY';
      if (narrowedBindingError) {
        return classifiedUnprovenDecision(input.generation, result, narrowedBindingError, {
          unitChecks: projectedChecks,
          violations: projectedViolations,
        });
      }
      const trace = baseTrace({
        decision: 'PASS',
        observedDecision: observedModelDecision,
        generation: narrowed.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        unitChecks: projectedChecks,
        violations: projectedViolations,
        errorMessage: null,
      });
      return { accepted: true, generation: attachConformance(narrowed.generation, trace, result.elapsedMs), trace };
    }

    if (!projectedRemovals.length || !projectedViolations.length) {
      return invalidParsedDecision(input.generation, result, 'REMOVE_UNAUTHORIZED_SPANS requires at least one removal and violation.');
    }
    const originalCheckError = validateConformanceUnitChecks(
      input.contract,
      semanticSegments,
      projectedChecks,
      'REMOVE_UNAUTHORIZED_SPANS',
      projectedRemovals,
      projectedViolations,
    );
    if (originalCheckError) {
      return classifiedUnprovenDecision(input.generation, result, originalCheckError, {
        unitChecks: projectedChecks,
        violations: projectedViolations,
      });
    }

    const narrowed = narrowGeneratedGroundedBindingsToConformanceEvidence(input.generation, projectedChecks);
    if (!narrowed.ok) {
      return classifiedUnprovenDecision(input.generation, result, narrowed.error, {
        unitChecks: projectedChecks,
        violations: projectedViolations,
      });
    }
    const narrowedSemanticSegments = projectGeneratedSemanticSegments(narrowed.generation.structuredSegments || []);
    // Classification already proved actual Required realization above. After narrowing,
    // validate only structural binding integrity here: re-applying the ingress primary-order
    // gate before exact removal could reject a safely removable failed producer before a later
    // authorized recommendation has a chance to survive correction.
    const narrowedBindingError = narrowedSemanticSegments.length
      ? validateHveReplyV2CanonicalBindingIntegrity(input.contract, narrowedSemanticSegments)
      : 'HVE_REPLY_V2_NARROWED_SEMANTIC_UNITS_EMPTY';
    if (narrowedBindingError) {
      return classifiedUnprovenDecision(input.generation, result, narrowedBindingError, {
        unitChecks: projectedChecks,
        violations: projectedViolations,
      });
    }
    const correction = applyExactSubstringRemovals(narrowed.generation, projectedRemovals, atomProjection);
    const correctionFailure = !correction.ok
      ? correction.error
      : !correction.generation.draft?.trim() ? 'CONFORMANCE_CORRECTED_DRAFT_EMPTY' : null;
    if (correctionFailure) {
      const trace = baseTrace({
        decision: 'UNPROVEN_PRESERVED',
        observedDecision: observedModelDecision,
        generation: input.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        unitChecks: projectedChecks,
        violations: [...projectedViolations, {
          code: 'CONFORMANCE_PROTOCOL_ERROR',
          segmentIndex: null,
          unitIndex: null,
          reason: correctionFailure,
        }],
        errorMessage: correctionFailure,
      });
      return { accepted: false, generation: attachConformance(input.generation, trace, result.elapsedMs), trace };
    }

    const correctedSemanticSegments = projectGeneratedSemanticSegments(correction.generation.structuredSegments || []);
    const correctedBindingError = correctedSemanticSegments.length
      ? (validateHveReplyV2CanonicalBindingIntegrity(input.contract, correctedSemanticSegments)
        || validateHveReplyV2PrimaryTaskSurfaceOrder(input.contract, correctedSemanticSegments))
      : 'HVE_REPLY_V2_CORRECTED_SEMANTIC_UNITS_EMPTY';
    if (correctedBindingError) {
      const trace = baseTrace({
        decision: 'UNPROVEN_PRESERVED',
        observedDecision: observedModelDecision,
        generation: input.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        unitChecks: projectedChecks,
        violations: [...projectedViolations, {
          code: 'REQUIRED_ACT_NOT_REALIZED',
          segmentIndex: null,
          unitIndex: null,
          reason: correctedBindingError,
        }],
        errorMessage: correctedBindingError,
      });
      return { accepted: false, generation: attachConformance(input.generation, trace, result.elapsedMs), trace };
    }
    const correctedEvidenceError = validateCorrectedUnitsAgainstConformanceEvidence(
      narrowedSemanticSegments,
      correctedSemanticSegments,
      projectedChecks,
    );
    if (correctedEvidenceError) {
      return classifiedUnprovenDecision(input.generation, result, correctedEvidenceError, {
        unitChecks: projectedChecks,
        violations: projectedViolations,
      });
    }

    const requiredMaterialFailure = validateTaskMaterialRequiredValueRealizationAfterCorrection(input.contract, projectedChecks, projectedRemovals);
    if (requiredMaterialFailure) {
      const postCorrectionError = `CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:${requiredMaterialFailure.error}`;
      const partialSafeContinuation = hasIndependentTaskMaterialSafeContinuation(input.contract, projectedChecks);
      const trace = baseTrace({
        decision: partialSafeContinuation ? 'REMOVED_UNAUTHORIZED_SPANS' : 'UNPROVEN_PRESERVED',
        observedDecision: observedModelDecision,
        generation: correction.generation,
        modelCallCount: 1,
        elapsedMs: result.elapsedMs,
        requestedModel: result.requestedModel || null,
        actualModel: result.actualModel || null,
        requestId: result.requestId || null,
        removals: projectedRemovals,
        unitChecks: projectedChecks,
        violations: [...projectedViolations, {
          code: 'REQUIRED_ACT_NOT_REALIZED',
          segmentIndex: null,
          unitIndex: null,
          reason: postCorrectionError,
        }],
        errorMessage: postCorrectionError,
        requiredValueCompletion: {
          status: partialSafeContinuation ? 'PARTIAL_SAFE_CONTINUATION' : 'UNSATISFIED',
          missingRequiredActIds: [requiredMaterialFailure.requiredActId],
        },
        originalTextLength: originalText.length,
      });
      const correctedWithCompletion = attachConformance(correction.generation, trace, result.elapsedMs);
      // Permission-reducing correction may leave a model-authored, task-material, non-grounded
      // contribution that independently survives Conformance. In that narrow case the unsafe
      // merchant proposition stays removed, the missing Required merchant value stays explicitly
      // unfulfilled in typed trace state, but normal Generation is not cancelled into recovery.
      // This does not mark the Canonical plan fulfilled and does not let supporting merchant facts
      // substitute for the lost task-material proposition.
      return { accepted: partialSafeContinuation, generation: correctedWithCompletion, trace };
    }

    const trace = baseTrace({
      decision: 'REMOVED_UNAUTHORIZED_SPANS',
      observedDecision: observedModelDecision,
      generation: correction.generation,
      modelCallCount: 1,
      elapsedMs: result.elapsedMs,
      requestedModel: result.requestedModel || null,
      actualModel: result.actualModel || null,
      requestId: result.requestId || null,
      removals: projectedRemovals,
      unitChecks: projectedChecks,
      violations: projectedViolations,
      errorMessage: null,
      originalTextLength: originalText.length,
    });
    const corrected = attachConformance(correction.generation, trace, result.elapsedMs);
    return { accepted: true, generation: corrected, trace };
  }
}

function buildRuntimeSurfaceUnitProjection(
  segments: CustomerServiceHveReplyV2Segment[],
): { ok: true; value: RuntimeSurfaceUnitProjection } | { ok: false; error: string } {
  const units: RuntimeSurfaceUnit[] = [];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    if (segment.units.map((unit) => unit.text).join('') !== segment.text) {
      return { ok: false, error: 'CONFORMANCE_HVE_SEGMENT_UNIT_TEXT_MISMATCH' };
    }
    for (let unitIndex = 0; unitIndex < segment.units.length; unitIndex += 1) {
      const exactText = segment.units[unitIndex].text;
      if (!exactText.length) continue;
      units.push({ unitId: `S${segmentIndex}U${unitIndex}`, segmentIndex, unitIndex, exactText });
    }
  }
  return units.length
    ? { ok: true, value: { units } }
    : { ok: false, error: 'CONFORMANCE_HVE_UNIT_TEXT_EMPTY' };
}

function resolveSemanticSpanBudgetUnits(units: readonly RuntimeSurfaceUnit[]) {
  const charBudget = units.reduce((sum, unit) => sum + unit.exactText.length, 0);
  // HVE_SEMANTIC_SPANS_V4 output size is driven by proposition count plus its typed
  // evidence envelope, not by source text length alone. The previous /32 proxy
  // under-budgeted ordinary multi-proposition Chinese replies and could force a
  // valid single classifier call to finish=length before Runtime saw any semantic
  // evidence. Reserve one bounded envelope unit per HVE unit plus roughly each
  // short proposition-sized source slice; the existing 4k gateway ceiling remains
  // the hard cap and this never adds a retry/model call or semantic Authority.
  return Math.max(units.length, units.length + Math.ceil(charBudget / 12));
}

/**
 * The semantic model owns open-language span partitioning, but never executable
 * offsets. Runtime requires the returned span sequence to preserve every substantive
 * source character in order. Provider JSON serializers/models may normalize or omit
 * presentation-only whitespace around/between spans; Runtime may reattach only that
 * source-owned whitespace because it carries zero business/semantic Authority. Any
 * non-whitespace gap, insertion, mutation, reordering, unknown unit or empty span still
 * invalidates the classifier result. Runtime then derives executable offsets itself.
 */
function recoverWhitespaceOnlySemanticSpanCoverage(
  unit: RuntimeSurfaceUnit,
  spans: ModelSemanticSpanClassification[],
): { ok: true; value: ModelSemanticSpanClassification[] } | { ok: false; error: string } {
  const stripWhitespace = (value: string) => value.replace(/\s+/gu, '');
  const coverageMismatch = () => ({
    ok: false as const,
    error: `CONFORMANCE_SEMANTIC_SPAN_COVERAGE_MISMATCH:${unit.unitId}:${buildSemanticSpanCoverageDiagnostic(unit, spans)}`,
  });
  if (stripWhitespace(spans.map((span) => span.exactText).join('')) !== stripWhitespace(unit.exactText)) {
    return coverageMismatch();
  }

  let cursor = 0;
  const recovered: ModelSemanticSpanClassification[] = [];
  for (const span of spans) {
    const substantive = stripWhitespace(span.exactText);
    if (!substantive.length) {
      let end = cursor;
      while (end < unit.exactText.length && /\s/u.test(unit.exactText[end])) end += 1;
      if (end === cursor) {
        return coverageMismatch();
      }
      recovered.push({ ...span, exactText: unit.exactText.slice(cursor, end) });
      cursor = end;
      continue;
    }

    let sourceIndex = cursor;
    let targetIndex = 0;
    while (sourceIndex < unit.exactText.length && targetIndex < substantive.length) {
      const sourceCharacter = unit.exactText[sourceIndex];
      if (/\s/u.test(sourceCharacter)) {
        sourceIndex += 1;
        continue;
      }
      if (sourceCharacter !== substantive[targetIndex]) {
        return coverageMismatch();
      }
      sourceIndex += 1;
      targetIndex += 1;
    }
    if (targetIndex !== substantive.length) {
      return coverageMismatch();
    }
    recovered.push({ ...span, exactText: unit.exactText.slice(cursor, sourceIndex) });
    cursor = sourceIndex;
  }

  if (cursor < unit.exactText.length) {
    const trailing = unit.exactText.slice(cursor);
    if (!/^\s+$/u.test(trailing) || !recovered.length) {
      return coverageMismatch();
    }
    const last = recovered[recovered.length - 1];
    recovered[recovered.length - 1] = { ...last, exactText: `${last.exactText}${trailing}` };
  }

  if (recovered.map((span) => span.exactText).join('') !== unit.exactText) {
    return coverageMismatch();
  }
  return { ok: true, value: recovered };
}


function buildSemanticSpanCoverageDiagnostic(
  unit: RuntimeSurfaceUnit,
  spans: ModelSemanticSpanClassification[],
) {
  const classifierSurface = spans.map((span) => span.exactText).join('');
  const compactSource = Array.from(unit.exactText.replace(/\s+/gu, ''));
  const compactClassifier = Array.from(classifierSurface.replace(/\s+/gu, ''));
  const sourceNonPunctuation = unit.exactText.replace(/[\s\p{P}]+/gu, '');
  const classifierNonPunctuation = classifierSurface.replace(/[\s\p{P}]+/gu, '');
  let mismatchIndex = 0;
  const sharedLength = Math.min(compactSource.length, compactClassifier.length);
  while (mismatchIndex < sharedLength && compactSource[mismatchIndex] === compactClassifier[mismatchIndex]) {
    mismatchIndex += 1;
  }
  const codePointLabel = (character: string | undefined) => character === undefined
    ? 'EOF'
    : `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
  return [
    `sourceCpLen=${compactSource.length}`,
    `classifierCpLen=${compactClassifier.length}`,
    `firstMismatch=${mismatchIndex}`,
    `sourceCp=${codePointLabel(compactSource[mismatchIndex])}`,
    `classifierCp=${codePointLabel(compactClassifier[mismatchIndex])}`,
    `nonPunctEquivalent=${sourceNonPunctuation === classifierNonPunctuation ? 'YES' : 'NO'}`,
  ].join(';');
}

function projectClassifierSemanticSpans(
  segments: CustomerServiceHveReplyV2Segment[],
  units: RuntimeSurfaceUnitProjection,
  spans: ModelSemanticSpanClassification[],
  unitGroundedActions: ModelSemanticUnitGroundedAction[],
): { ok: true; atomProjection: RuntimeSurfaceAtomProjection; classifications: ModelSemanticAtomClassification[] }
  | { ok: false; error: string } {
  const knownUnits = new Map(units.units.map((unit) => [unit.unitId, unit] as const));
  const spansByUnit = new Map<string, ModelSemanticSpanClassification[]>();
  for (const span of spans) {
    const unit = knownUnits.get(span.unitId);
    if (!unit) return { ok: false, error: `CONFORMANCE_SEMANTIC_SPAN_UNKNOWN_UNIT:${span.unitId}` };
    if (!span.exactText.length) return { ok: false, error: `CONFORMANCE_SEMANTIC_SPAN_EMPTY:${span.unitId}` };
    const list = spansByUnit.get(span.unitId) || [];
    list.push(span);
    spansByUnit.set(span.unitId, list);
  }

  const atoms: RuntimeSurfaceAtom[] = [];
  const byUnit = new Map<string, RuntimeSurfaceAtom[]>();
  const classifications: ModelSemanticAtomClassification[] = [];
  const groundedActionUnitIds = new Set(unitGroundedActions.map((action) => action.unitId));
  for (const unit of units.units) {
    const unitSpans = spansByUnit.get(unit.unitId) || [];
    if (!unitSpans.length) return { ok: false, error: `CONFORMANCE_SEMANTIC_SPAN_UNIT_MISSING:${unit.unitId}` };
    const recoveredCoverage = recoverWhitespaceOnlySemanticSpanCoverage(unit, unitSpans);
    if (!recoveredCoverage.ok) return recoveredCoverage;
    const runtimeUnitSpans = recoveredCoverage.value;
    let cursor = 0;
    const unitAtoms: RuntimeSurfaceAtom[] = [];
    runtimeUnitSpans.forEach((span) => {
      // PARTIALLY_SUPPORTED means the parent mixes supported and unsupported merchant semantics.
      // When the SAME blind classifier also supplies a byte-exact one-level proposition
      // decomposition, Runtime may execute those leaves instead of deleting the whole parent.
      // This remains disabled for units carrying discourse-level grounded recommendation groups
      // so the frozen action-group span-index/locality contract stays byte-stable.
      const executableLeaves = !groundedActionUnitIds.has(unit.unitId)
        && span.groundingEntailment === 'PARTIALLY_SUPPORTED'
        && span.partialSupportSpans.length >= 2
        && span.partialSupportSpans.map((leaf) => leaf.exactText).join('') === span.exactText
        ? span.partialSupportSpans
        : null;
      const executableSpans: ModelPartialSupportSpanClassification[] = executableLeaves || [{
        exactText: span.exactText,
        witnessProtocolError: span.witnessProtocolError,
        contributionKind: span.contributionKind,
        semanticTarget: span.semanticTarget,
        taskDependency: span.taskDependency,
        evidenceRequirement: span.evidenceRequirement,
        merchantReferentRefs: [...span.merchantReferentRefs],
        groundingEntailment: span.groundingEntailment,
        groundedActionRole: span.groundedActionRole,
        groundingBasis: span.groundingBasis,
        groundingSupport: span.groundingSupport.map((support) => ({ ...support, excerpts: [...support.excerpts] })),
        realizedGroundingRefs: [...span.realizedGroundingRefs],
      }];

      for (const executable of executableSpans) {
        const atomId = `${unit.unitId}A${unitAtoms.length}`;
        const atom: RuntimeSurfaceAtom = {
          atomId,
          segmentIndex: unit.segmentIndex,
          unitIndex: unit.unitIndex,
          startOffset: cursor,
          endOffset: cursor + executable.exactText.length,
          exactText: executable.exactText,
        };
        cursor = atom.endOffset;
        unitAtoms.push(atom);
        atoms.push(atom);
        classifications.push({
          atomId,
          witnessProtocolError: executable.witnessProtocolError,
          contributionKind: executable.contributionKind,
          semanticTarget: executable.semanticTarget,
          taskDependency: executable.taskDependency,
          evidenceRequirement: executable.evidenceRequirement,
          merchantReferentRefs: [...executable.merchantReferentRefs],
          groundingEntailment: executable.groundingEntailment,
          groundedActionRole: executable.groundedActionRole,
          groundingBasis: executable.groundingBasis,
          groundingSupport: executable.groundingSupport.map((support) => ({ ...support, excerpts: [...support.excerpts] })),
          realizedGroundingRefs: [...executable.realizedGroundingRefs],
        });
      }
    });
    if (cursor !== unit.exactText.length) return { ok: false, error: `CONFORMANCE_SEMANTIC_SPAN_OFFSET_MISMATCH:${unit.unitId}` };
    byUnit.set(`${unit.segmentIndex}:${unit.unitIndex}`, unitAtoms);
  }
  if (atoms.length !== classifications.length) return { ok: false, error: 'CONFORMANCE_SEMANTIC_SPAN_CARDINALITY_MISMATCH' };
  void segments;
  return { ok: true, atomProjection: { atoms, byUnit }, classifications };
}

type ConformanceResponseTargetContext = {
  knowledgeRequirement: 'NOT_REQUIRED' | 'GENERAL_CONTEXT_ALLOWED' | 'BUSINESS_FACT_GROUNDING_REQUIRED';
  unresolvedNeed: string | null;
  evidence: string[];
};

function buildConformancePrompt(input: {
  latestCustomerMessage: string;
  units: RuntimeSurfaceUnit[];
  knowledgeEvidence: Array<Record<string, unknown>>;
  responseTargetContext: ConformanceResponseTargetContext | null;
}) {
  return {
    system: [
      'You are a single semantic classifier and span partitioner over immutable HVE semantic units. You are NOT a conversation writer, planner, quality judge, authorization checker, boundary detector, humanizer, style editor, retry controller, or Send Authority.',
      'You intentionally receive NO Canonical Acts, Act ids, HVE bindings, completion policy, role behavior diagnostics, pass/fail target, character offsets, deletion authority, or pre-decided proposition boundaries. You receive immutable generatedReplyUnits and must partition each unit semantically while preserving every character exactly. In the SAME response, you also classify whether an entire unit realizes a grounded choice/recommendation function that is distributed across discourse framing plus one or more grounded propositions; this unit-level axis is semantic classification only and never creates an Act or Grounding permission.',
      'Return an exact, exhaustive, in-order semantic partition for every supplied unitId and no span for any unknown unit. If a proposition is genuinely inseparable or semantically mixed, keep that complete proposition in one span and use MIXED_OR_UNCERTAIN rather than inventing a surface heuristic. Do not let punctuation, whitespace, conjunction shape, product-title position, token overlap, fixed templates, or character counts decide span boundaries.',
      'Contribution kinds classify customer-facing FUNCTION only and are independent from evidence ownership: ANSWER_CONTENT = directly provides requested information; ANSWER_JUDGMENT = gives the requested assessment/conclusion; GUIDANCE_CONTENT = gives actionable direction or a decision rule; GROUNDED_CONTENT = surface content whose primary function is explicitly merchant/entity factual or grounded decision content; STATUS_OR_EXECUTION_CONTENT = execution/status/handoff content; IDENTITY_OR_SCOPE_CONTENT = identity/name/role/service-scope disclosure; BOUNDARY_CONTENT = a capability/fact/permission boundary proposition (never punctuation, a connector, or grammatical glue); RESTATEMENT_CONTENT = restatement only; HISTORY_REFERENCE_CONTENT = relevant established history; RECEPTION_ACK = acknowledgement/validation/evaluation of the customer feeling, concern, stance, effort or situation rather than answering it; REASSURANCE = primarily reduces worry, fear, urgency or self-blame; SOCIAL_NORMALIZATION = primarily normalizes a feeling/behavior/situation to soothe or validate rather than establish a needed answer fact; RELATIONSHIP_CONTENT = independent relationship maintenance; QUESTION_OR_SERVICE_ENTRY = asks for information/preference or opens a new service entry; BUSINESS_ADVANCE_OR_CTA = advances business/sales action; HUMOR = independent light humor; CLOSE_ACK = acknowledgement/farewell whose function is to close an already-ending exchange; CLOSE_WARMTH = warm wish or relational warmth whose function is closing an already-ending exchange; NON_PROPOSITIONAL_FRAGMENT = surface discourse/topic/transition material that is not independently truth-evaluable and does not itself answer, advise, assert a merchant fact, express a boundary, ask a question, or realize any Canonical Act; MIXED_OR_UNCERTAIN = the supplied Runtime atom contains inseparable functions or cannot be safely classified as one contribution; OTHER_PROPOSITION = a coherent independent proposition not covered above. Do NOT change contributionKind merely to make Grounding pass or fail. Classify evidenceRequirement separately from the proposition itself. Runtime, not the classifier, will normalize evidence-required substantive ANSWER_CONTENT/ANSWER_JUDGMENT/GUIDANCE_CONTENT to Grounded semantics before authorization.',
      'NON_PROPOSITIONAL_FRAGMENT is a zero-Authority structural classification, not a semantic shortcut. Use it only when the whole supplied span is not an independent proposition at all. It MUST use semanticTarget=OTHER, evidenceRequirement=NOT_REQUIRED, groundingEntailment=NOT_APPLICABLE, groundedActionRole=NOT_APPLICABLE, groundingBasis=NOT_APPLICABLE, groundingSupport=[], realizedGroundingRefs=[]. A true structural fragment may remain as surface glue when the surrounding unit is otherwise authorized, but it never realizes an Act, creates a fact, creates Grounding, or satisfies completion by itself. Never use it for a substantive conclusion, condition, merchant/product claim, performance/experience claim, risk/outcome, boundary, question or judgment merely because that content would otherwise fail authorization.',
      'For merchant fact boundaries, classify only the customer-facing conclusion about what the merchant currently provides or can support as BOUNDARY_CONTENT. A separate claim about catalog lifecycle, future availability, hidden operational status, pending publication/review, or the assistant/system lookup process is STATUS_OR_EXECUTION_CONTENT or OTHER_PROPOSITION according to its function; it must not be absorbed into BOUNDARY_CONTENT merely because it is used to explain a refusal. This is a semantic distinction, not a phrase list.',
      'Semantic targets: CUSTOMER_AFFECT_OR_STANCE, CUSTOMER_EFFORT_OR_SELF_EVALUATION, CUSTOMER_SITUATION_FACT, TASK_OR_DOMAIN_FACT, ACTION_OPTION_RISK_OR_OUTCOME, MERCHANT_ENTITY_OR_POLICY, RELATIONSHIP_OR_CONVERSATION, OTHER. For GROUNDED_CONTENT, semanticTarget still describes the customer-facing proposition target, never the storage/source category of its evidence. MERCHANT_ENTITY_OR_POLICY is restricted to descriptive object/policy/state predicates whose truth directly describes the merchant object itself without evaluating what the customer should choose or what use/experience/outcome follows from that fact. A proposition that recommends/selects an option, assesses suitability for a scenario or audience, compares appropriateness, evaluates presentation/style/formality, asserts comfort/feel/sensory experience, performance, risk, causal effect, guarantee, or another downstream outcome MUST use ACTION_OPTION_RISK_OR_OUTCOME even when the source itself directly states that proposition and even when the same atom names a merchant product or includes supporting attributes. Functional test: if removing the atom would remove which concrete option is being suggested under the current preference/condition, it is choice semantics; more generally, if removing the atom removes a choice, suitability/comparison judgment, experienced-result judgment, or downstream action/outcome conclusion rather than only a descriptive merchant fact, use ACTION_OPTION_RISK_OR_OUTCOME. Do not choose MERCHANT_ENTITY_OR_POLICY merely because the realized evidence belongs to a merchant/product entity.',
      'Task dependency: MATERIAL_TO_CUSTOMER_TASK = removing it changes the requested answer/action; SUPPORTS_CUSTOMER_TASK = useful supporting content but not the primary answer; INDEPENDENT_OF_CUSTOMER_TASK = standalone reception/relationship/question/CTA/humor or other contribution not needed for the task; CLOSURE_ONLY = serves only to close the current exchange.',
      'Use a functional deletion test, never a keyword list. A claim that an action is risky can be ANSWER_JUDGMENT; a separate validation that the customer concern is valid is RECEPTION_ACK. Commonness/intensity/certainty language can belong to a real answer judgment when it changes the requested conclusion. Classify by semantic function, target, and task dependency, not by individual words.',
      'For CLOSE_ACK/CLOSE_WARMTH use semanticTarget=RELATIONSHIP_OR_CONVERSATION and taskDependency=CLOSURE_ONLY. If a closing atom also introduces substantive advice or a new task that cannot be separated by Runtime atoms, use MIXED_OR_UNCERTAIN rather than pretending it is pure close.',
      'evidenceRequirement is an independent proposition-semantic axis with three meanings. MERCHANT_ENTITY_EVIDENCE_REQUIRED is for OBJECT-LEVEL assertions whose truth says something substantive about a specific merchant/store/product/service/business state or outcome, including positive or negative attributes, price/stock/policy/status, performance/experience, suitability, guarantees, or merchant-specific recommendations/choices. MERCHANT_ENTITY_EVIDENCE_BOUNDARY is only for an EPISTEMIC conclusion about evidential sufficiency: the atom says the available merchant/entity evidence does not establish, is insufficient to confirm, or cannot by itself justify a specific object-level merchant/entity proposition; it must NOT assert that referenced proposition true or false. The semanticTarget of that epistemic proposition follows what the customer-facing boundary is about: ACTION_OPTION_RISK_OR_OUTCOME or MERCHANT_ENTITY_OR_POLICY are common, but TASK_OR_DOMAIN_FACT is also valid when the proposition itself is the evidential limitation/general inference boundary rather than a claim that the merchant object has or lacks the outcome. Example distinction by semantics, not wording: “current facts do not establish whether this item will feel tight after hours of sitting” is an evidence boundary; “this item will not feel tight after hours of sitting” is an object-level performance assertion and still requires merchant evidence. If a whole atom inseparably combines an evidence-boundary statement with an object-level merchant claim, use MIXED_OR_UNCERTAIN instead of laundering the claim through the boundary. Use NOT_REQUIRED for propositions whose truth is genuinely non-merchant, including general-domain decision criteria/rules and customer-owned facts. A general rule remains NOT_REQUIRED even when used while discussing a current merchant item, as long as it does not assert that the current item actually has the criterion or outcome. Do not infer this axis from whether evidence happened to be supplied or whether a ref is available.',
      'merchantReferentRefs is a separate semantic referent-scope axis. For each span, return the ids from availableGroundingEvidence whose specific merchant/store/product/service/policy object the proposition explicitly names, uses a known canonical alias for, abbreviates from an already-established option in the supplied generatedReplyUnits, pronominally refers to, compares, selects, prioritizes, or otherwise semantically predicates about. This field answers ONLY “which merchant object(s) is this proposition about?” It does not say the evidence supports the proposition and it never grants Grounding or authorization. A genuinely general rule or customer-owned fact that is not about an actual merchant object must use merchantReferentRefs=[]. Questions, history/restatement, or epistemic boundaries may carry referent refs without thereby asserting an object-level fact; Runtime checks their other typed axes separately. For a substantive ACTION_OPTION_RISK_OR_OUTCOME or MERCHANT_ENTITY_OR_POLICY proposition that is about a concrete merchant object, merchantReferentRefs must not be empty merely because evidence is missing or the surface uses a shortened label instead of the full catalog title. Do not invent ids; use only ids supplied in availableGroundingEvidence.',
      'responseTargetContext is typed task/reference context from the already-resolved upstream response target. It is classification context only: it cannot create Acts, Grounding refs, evidence, authorization, deletion, completion, or Send Authority. When knowledgeRequirement=BUSINESS_FACT_GROUNDING_REQUIRED, typed evidence such as REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY and GROUNDING_ENTITY_MATCH:<id> identifies which availableGroundingEvidence entry is the current merchant object under discussion. Use that context to resolve ordinary anaphora, ellipsis, omitted repeated subjects, and comparative continuations across the supplied generatedReplyUnits. If an atom explicitly names, pronominally refers to, or grammatically inherits that current merchant object as its subject, a positive/negative attribute, performance, experience, suitability, comparison, or outcome asserted of that object is OBJECT-LEVEL and therefore MERCHANT_ENTITY_EVIDENCE_REQUIRED even when the atom surface itself omits the product name and even when its contributionKind is ANSWER_JUDGMENT or GUIDANCE_CONTENT. This context must not upgrade a genuinely general rule, conditional criterion, or domain fact that does not assert the current object has the premise or outcome; those remain NOT_REQUIRED.',
      'Grounding entailment is a strict source-entailment check only for evidenceRequirement=MERCHANT_ENTITY_EVIDENCE_REQUIRED. Only availableGroundingEvidence can support such object-level propositions, and those entries are evidence context only—not authorization. latestCustomerMessage, customer requirements/preferences/concerns, general-domain knowledge, and model/common-sense inference are task context only and never evidence that a merchant/entity actually has a requested property, performance result, guarantee, causal effect, or status. Use NOT_APPLICABLE when evidenceRequirement=NOT_REQUIRED or MERCHANT_ENTITY_EVIDENCE_BOUNDARY. A MERCHANT_ENTITY_EVIDENCE_BOUNDARY atom must have groundedActionRole=NOT_APPLICABLE, groundingBasis=NOT_APPLICABLE, empty groundingSupport and empty realizedGroundingRefs because it does not assert the referenced merchant outcome; it states only that the available evidence does not establish that outcome. For evidence-required propositions, use FULLY_SUPPORTED only when every such proposition in the whole atom is stated by availableGroundingEvidence or is semantically equivalent to a proposition stated there; use PARTIALLY_SUPPORTED when supplied evidence supports part but the atom adds an unsupported merchant/entity proposition; use UNSUPPORTED when no supplied evidence supports it. Evidence that an item is suitable for a scenario or customer group supports a suitability judgment at that same level; it does not entail every requested property, physiological/comfort experience, or downstream outcome. Evidence for an input, feature, material, shape, fit, or adjacent attribute does not by itself entail a downstream experience/performance/guarantee. General-domain decision criteria do not themselves need merchant evidence merely because a current item is under discussion, and a merchant-specific recommendation may synthesize customer constraints with supported facts; do not mark it partial merely because recommendation wording is not verbatim. Do not convert a supported fact or suitability label into a stronger entity-specific experience, performance result, or guarantee unless availableGroundingEvidence itself supports that stronger proposition.',
      'For each atom, realizedGroundingRefs may contain only ids from availableGroundingEvidence that materially support merchant/entity-specific propositions in the whole atom. FULLY_SUPPORTED and PARTIALLY_SUPPORTED require at least one realizedGroundingRef; NOT_APPLICABLE and UNSUPPORTED require an empty array. Grounding refs are evidence labels only, not authorization; Runtime separately checks Canonical bindings.',
      'groundedActionRole is an independent semantic axis for OBJECT-LEVEL grounded action/outcome propositions. If evidenceRequirement=NOT_REQUIRED or MERCHANT_ENTITY_EVIDENCE_BOUNDARY, use groundedActionRole=NOT_APPLICABLE, groundingBasis=NOT_APPLICABLE, groundingEntailment=NOT_APPLICABLE, groundingSupport=[] and realizedGroundingRefs=[] even when semanticTarget=ACTION_OPTION_RISK_OR_OUTCOME. A general conditional inference does not assert that an actual merchant item meets the premise; an evidence boundary is about whether evidence establishes an outcome rather than asserting it. For MERCHANT_ENTITY_EVIDENCE_REQUIRED use NOT_APPLICABLE unless semanticTarget=ACTION_OPTION_RISK_OR_OUTCOME. Use CHOICE_OR_RECOMMENDATION only when the proposition itself proposes/selects/prioritizes a concrete option. Use SUITABILITY_OR_DECISION_SUPPORT for scenario/audience fit, comparative appropriateness, presentation/style/formality or another decision-support judgment that helps a choice without itself proposing the option. Use PERFORMANCE_OR_EXPERIENCE for product/service performance, comfort, sensory or experienced-result claims. Use RISK_OR_OTHER_OUTCOME for other causal/risk/outcome claims. A suitability/style/experience/outcome proposition never becomes MERCHANT_ENTITY_OR_POLICY merely because Knowledge stores it as product content, and a performance/experience claim is never CHOICE_OR_RECOMMENDATION merely because it appears next to a recommendation.',
      'unitGroundedActions is the independent grounded choice/recommendation-group axis owned by this same classifier call. A single generatedReplyUnit may contain zero, one or multiple independent choice/recommendation groups. Return one entry per independently meaningful merchant option/choice that is compositionally expressed across one or more of the semantic spans you return for that same unit. spanIndexes is the non-empty, unique, zero-based list of those span positions within that unit, in source order. Different groups in the same unit must use different spanIndexes and may overlap only when the same proposition genuinely contributes to both choices. Do NOT create groups from punctuation, paragraph/list topology, ordering, titles, lexical overlap, or the mere presence of product facts. A plain catalog/fact list must return no unitGroundedAction. Each group must use groundedActionRole=CHOICE_OR_RECOMMENDATION, taskDependency=MATERIAL_TO_CUSTOMER_TASK, and realizedGroundingRefs containing only merchant refs materially used by that exact choice/recommendation group. If one option contains an unsupported proposition, do not merge unrelated supported options into that same action group merely because they share one HVE unit. Runtime will independently require every group ref to belong to its listed spans, to be realized by FULLY_SUPPORTED authorized spans, and to be permitted by an already-selected Canonical Grounded Act.',
      'groundingBasis records HOW the grounded proposition is justified. DIRECT_SOURCE means the same factual predicate is directly stated by, or semantically equivalent to, the cited source. SUPPORTED_CHOICE_SYNTHESIS is allowed only for CHOICE_OR_RECOMMENDATION or SUITABILITY_OR_DECISION_SUPPORT when the conclusion combines customer-owned constraints from latestCustomerMessage with merchant-side premises that are themselves directly supported by the cited source. At that bounded choice/suitability level the conclusion may be FULLY_SUPPORTED even when its final wording is not verbatim in Knowledge; the source witnesses must still own every merchant-side premise. SUPPORTED_CHOICE_SYNTHESIS must never be used to upgrade an unconfigured product performance, comfort, sensory result, guarantee, causal effect, stock/order/policy state or other business status, and it cannot turn a merely adjacent attribute into such an outcome. PARTIAL_SOURCE_PLUS_INFERENCE corresponds exactly to PARTIALLY_SUPPORTED. INFERRED_OR_UNSUPPORTED corresponds exactly to UNSUPPORTED. NOT_APPLICABLE corresponds exactly to NOT_APPLICABLE.',
      'groundingSupport is a typed source-proof object, not free-form explanation. For every realizedGroundingRef in FULLY_SUPPORTED or PARTIALLY_SUPPORTED, return exactly one groundingSupport item with that same ref and one or more short exact excerpts copied byte-for-byte from that evidence entry title/content/structuredData serialization. Also classify the SOURCE proposition expressed by those excerpts independently from the generated reply claim: sourceSemanticTarget uses the same semanticTarget vocabulary, and sourceGroundedActionRole uses the same groundedActionRole vocabulary. A source excerpt saying only that an item is suitable for a scenario or audience is SUITABILITY_OR_DECISION_SUPPORT; it is not PERFORMANCE_OR_EXPERIENCE merely because the generated claim asks about comfort, heat, feel, or another experience. A source excerpt explicitly stating a comfort or performance result may be PERFORMANCE_OR_EXPERIENCE. Each excerpt must support the SAME factual predicate used by the semantic span; do not cite a scenario, audience, adjacent material/fit attribute, or another product as a witness for a stronger performance/experience/outcome claim. Runtime will verify source ownership and typed source/claim consistency for DIRECT_SOURCE; this is fail-closed typed enforcement, not a second surface or lexical semantic gate. NOT_APPLICABLE and UNSUPPORTED must return groundingSupport=[].',
      'For DIRECT_SOURCE action/outcome propositions, semantic equivalence is proposition-level rather than surface containment: a natural paraphrase of the same supported suitability, experience or outcome predicate may remain FULLY_SUPPORTED even when wording differs. Conversely, a source that supports only an adjacent scenario, audience, material, fit or other predicate must be PARTIALLY_SUPPORTED or UNSUPPORTED when the span adds a stronger or different suitability, experience, performance, guarantee, risk or downstream outcome. Do not use token overlap, normalized substring containment or entity-title removal as semantic evidence.',
      'A general conditional inference can be ANSWER_JUDGMENT or GUIDANCE_CONTENT with evidenceRequirement=NOT_REQUIRED: the whole proposition retains the decisive premise as a hypothesis and explains a domain-level tendency without asserting that the current merchant item meets that premise. Referencing the current decision does not by itself make this a merchant performance assertion. Conversely, a probable or hedged outcome asserted of the actual item is still MERCHANT_ENTITY_EVIDENCE_REQUIRED; probability words cannot establish missing material, performance, order status or execution evidence. Classify the complete meaning including conditions and conclusion. If an immutable atom inseparably combines a general premise with an unsupported merchant conclusion, never authorize just the premise or relabel the whole as general guidance. A requested proof/insufficiency judgment remains a legitimate answer; do not force every ordinary judgment into an evidence-boundary classification.',
      'Partition every generatedReplyUnit into the smallest complete proposition-level semantic spans needed for one consistent semantic classification. Span boundaries are open-language semantic decisions: do not use punctuation, token overlap, product-title position, fixed phrase templates, or character counts as the rule. Keep conjunctions/conditions with the proposition they semantically govern. A recommendation judgment and its separate supporting fact are separate spans even if written in one sentence; one inseparable proposition remains one span. Preserve every character exactly.',
      'partialSupportSpans is a one-level refinement owned by this SAME classifier call, not a second classifier and not Runtime splitting. Use it only when a top-level span has groundingEntailment=PARTIALLY_SUPPORTED AND that parent actually contains two or more semantically separable complete propositions. In that case partialSupportSpans must be an ordered byte-exact exhaustive partition of the parent exactText; classify every leaf independently with the same axes and source-proof rules, and no leaf may itself use PARTIALLY_SUPPORTED. This lets Runtime preserve an independently safe source-backed premise, evidence boundary, or genuinely general-domain rule while deleting a separate unsupported merchant outcome. If the PARTIALLY_SUPPORTED proposition is genuinely inseparable, return partialSupportSpans=[]. For every non-PARTIALLY_SUPPORTED parent, return partialSupportSpans=[]. Never manufacture a split from punctuation, conjunctions, product titles, token overlap, fixed wording, or character counts. Conditions and qualifiers that are necessary to keep a leaf truthful must remain inside that leaf; do not extract a dependent conclusion as if it were independent.',
      'Return only strict JSON: {"version":"HVE_SEMANTIC_SPANS_V4","spans":[{"unitId":"S0U0","exactText":"exact verbatim substring","contributionKind":"ANSWER_CONTENT","semanticTarget":"TASK_OR_DOMAIN_FACT","taskDependency":"MATERIAL_TO_CUSTOMER_TASK","evidenceRequirement":"NOT_REQUIRED","merchantReferentRefs":[],"groundingEntailment":"NOT_APPLICABLE","groundedActionRole":"NOT_APPLICABLE","groundingBasis":"NOT_APPLICABLE","groundingSupport":[],"realizedGroundingRefs":[],"partialSupportSpans":[]}],"unitGroundedActions":[{"unitId":"S0U0","groundedActionRole":"CHOICE_OR_RECOMMENDATION","taskDependency":"MATERIAL_TO_CUSTOMER_TASK","spanIndexes":[0],"realizedGroundingRefs":["evidence-ref"]}]}. unitGroundedActions may be empty and may contain multiple entries for the same unit when that unit contains independently meaningful choices. For each unitId, spans must be in source order and their exactText values concatenated byte-for-byte must equal that generatedReplyUnit.text. spanIndexes always index that unit-local returned span order, never global offsets. Do not return offsets or atom ids. Runtime derives offsets/atom ids only after proving exact exhaustive coverage. Object-level merchant/entity propositions must use evidenceRequirement=MERCHANT_ENTITY_EVIDENCE_REQUIRED regardless of outer contribution label or whether evidence is available. Use MERCHANT_ENTITY_EVIDENCE_BOUNDARY only for the narrow epistemic relation defined above; it never authorizes a positive or negative object-level merchant proposition. No markdown, no Act ids, no authorization, and no removals.',
      'Non-empty groundingSupport MUST be an array of objects with these exact field names: [{"ref":"<id copied from availableGroundingEvidence>","excerpts":["<exact substring copied from that same entry>"],"sourceSemanticTarget":"MERCHANT_ENTITY_OR_POLICY","sourceGroundedActionRole":"NOT_APPLICABLE"}]. Each object requires a string ref, a non-empty array of non-empty strings named excerpts, one sourceSemanticTarget from the closed semanticTarget vocabulary, and one sourceGroundedActionRole from the closed groundedActionRole vocabulary. These source-side fields classify only the cited source proposition and must not be copied from the reply claim when the source is semantically weaker. Do not emit evidenceId, quote, text, strings alone, null, or an object keyed by ref. The placeholders illustrate shape only; copy actual source values. The full nested wire schema is: ' + JSON.stringify({
        type: 'array', items: { type: 'object', required: ['ref', 'excerpts', 'sourceSemanticTarget', 'sourceGroundedActionRole'], additionalProperties: false,
          properties: { ref: { type: 'string', minLength: 1 }, excerpts: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } }, sourceSemanticTarget: { type: 'string', enum: [...SEMANTIC_TARGETS] }, sourceGroundedActionRole: { type: 'string', enum: [...GROUNDED_ACTION_ROLE_VALUES] } } },
      }),
      'Closed wire vocabulary (each field must contain exactly one of its own listed strings; never reuse a label from another field or invent a synonym): ' + JSON.stringify({
        contributionKind: [...SEMANTIC_CONTRIBUTION_KINDS],
        semanticTarget: [...SEMANTIC_TARGETS],
        taskDependency: [...SEMANTIC_TASK_DEPENDENCIES],
        evidenceRequirement: [...EVIDENCE_REQUIREMENT_VALUES],
        groundingEntailment: [...GROUNDING_ENTAILMENT_VALUES],
        groundedActionRole: [...GROUNDED_ACTION_ROLE_VALUES],
        groundingBasis: [...GROUNDING_BASIS_VALUES],
      }),
    ].join('\n\n'),
    user: JSON.stringify({
      latestCustomerMessage: input.latestCustomerMessage,
      responseTargetContext: input.responseTargetContext,
      availableGroundingEvidence: input.knowledgeEvidence,
      generatedReplyUnits: input.units.map((unit) => ({ unitId: unit.unitId, text: unit.exactText })),
    }),
  };
}

// Only presentation differences in an existing ASCII wire label are compatible.
// No coercion, synonym mapping, cross-axis mapping, or unknown-to-OTHER fallback.
function normalizeSemanticWireLabel(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '').replace(/[a-z]/g, (letter) => letter.toUpperCase())
    : '';
}

function describeInvalidSemanticWireLabel(value: unknown): string {
  if (typeof value !== 'string') return `type=${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`;
  // Diagnostic-only: bounded machine tokens, never free-form response/source text.
  const label = normalizeSemanticWireLabel(value);
  return /^[A-Z_]{1,80}$/.test(label) ? `token=${label}` : `type=string,length=${value.length},token=REDACTED`;
}

function parsePartialSupportSpans(
  raw: unknown,
  parentExactText: string,
  parentGroundingEntailment: CustomerServiceGroundingEntailment,
  parentIndex: number,
): { ok: true; value: ModelPartialSupportSpanClassification[] } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.length > 32) {
    return { ok: false, reason: `SPAN_${parentIndex}_PARTIAL_SUPPORT_SPANS_INVALID` };
  }
  if (parentGroundingEntailment !== 'PARTIALLY_SUPPORTED') {
    return raw.length
      ? { ok: false, reason: `SPAN_${parentIndex}_PARTIAL_SUPPORT_SPANS_OUTSIDE_PARTIAL` }
      : { ok: true, value: [] };
  }
  if (!raw.length) return { ok: true, value: [] };

  const value: ModelPartialSupportSpanClassification[] = [];
  for (let childIndex = 0; childIndex < raw.length; childIndex += 1) {
    const item = raw[childIndex];
    const prefix = `SPAN_${parentIndex}_PARTIAL_${childIndex}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: `${prefix}_NOT_OBJECT` };
    const record = item as Record<string, unknown>;
    if ('unitId' in record || 'startOffset' in record || 'endOffset' in record || 'atomId' in record
      || 'authorized' in record || 'actId' in record || 'actIds' in record || 'partialSupportSpans' in record) {
      return { ok: false, reason: `${prefix}_FORBIDDEN_EXECUTABLE_FIELD` };
    }
    const exactText = typeof record.exactText === 'string' ? record.exactText : '';
    const contributionKind = normalizeSemanticWireLabel(record.contributionKind) as CustomerServiceSemanticContributionKind;
    const semanticTarget = normalizeSemanticWireLabel(record.semanticTarget) as CustomerServiceSemanticTarget;
    const taskDependency = normalizeSemanticWireLabel(record.taskDependency) as CustomerServiceSemanticTaskDependency;
    const evidenceRequirement = normalizeSemanticWireLabel(record.evidenceRequirement) as CustomerServiceEvidenceRequirement;
    if (!Array.isArray(record.merchantReferentRefs)) return { ok: false, reason: `${prefix}_MERCHANT_REFERENT_REFS_NOT_ARRAY` };
    if (record.merchantReferentRefs.some((ref) => typeof ref !== 'string' || !String(ref).trim())) return { ok: false, reason: `${prefix}_MERCHANT_REFERENT_REFS_INVALID` };
    const merchantReferentRefs = uniqueConformanceStrings(record.merchantReferentRefs);
    if (merchantReferentRefs.length !== record.merchantReferentRefs.length) return { ok: false, reason: `${prefix}_MERCHANT_REFERENT_REFS_DUPLICATE` };
    const groundingEntailment = normalizeSemanticWireLabel(record.groundingEntailment) as CustomerServiceGroundingEntailment;
    const groundedActionRole = normalizeSemanticWireLabel(record.groundedActionRole) as CustomerServiceGroundedActionRole;
    const groundingBasis = normalizeSemanticWireLabel(record.groundingBasis) as CustomerServiceGroundingBasis;
    if (!exactText.length) return { ok: false, reason: `${prefix}_EXACT_TEXT_EMPTY` };
    if (!SEMANTIC_CONTRIBUTION_KINDS.has(contributionKind)) return { ok: false, reason: `${prefix}_CONTRIBUTION_KIND_INVALID:${describeInvalidSemanticWireLabel(record.contributionKind)}` };
    if (!SEMANTIC_TARGETS.has(semanticTarget)) return { ok: false, reason: `${prefix}_SEMANTIC_TARGET_INVALID:${describeInvalidSemanticWireLabel(record.semanticTarget)}` };
    if (!SEMANTIC_TASK_DEPENDENCIES.has(taskDependency)) return { ok: false, reason: `${prefix}_TASK_DEPENDENCY_INVALID:${describeInvalidSemanticWireLabel(record.taskDependency)}` };
    if (!EVIDENCE_REQUIREMENT_VALUES.has(evidenceRequirement)) return { ok: false, reason: `${prefix}_EVIDENCE_REQUIREMENT_INVALID:${describeInvalidSemanticWireLabel(record.evidenceRequirement)}` };
    if (!GROUNDING_ENTAILMENT_VALUES.has(groundingEntailment)) return { ok: false, reason: `${prefix}_GROUNDING_ENTAILMENT_INVALID:${describeInvalidSemanticWireLabel(record.groundingEntailment)}` };
    if (groundingEntailment === 'PARTIALLY_SUPPORTED') return { ok: false, reason: `${prefix}_NESTED_PARTIAL_NOT_ALLOWED` };
    if (!GROUNDED_ACTION_ROLE_VALUES.has(groundedActionRole)) return { ok: false, reason: `${prefix}_GROUNDED_ACTION_ROLE_INVALID:${describeInvalidSemanticWireLabel(record.groundedActionRole)}` };
    if (!GROUNDING_BASIS_VALUES.has(groundingBasis)) return { ok: false, reason: `${prefix}_GROUNDING_BASIS_INVALID:${describeInvalidSemanticWireLabel(record.groundingBasis)}` };
    if (!Array.isArray(record.realizedGroundingRefs)) return { ok: false, reason: `${prefix}_GROUNDING_REFS_NOT_ARRAY` };
    if (record.realizedGroundingRefs.some((ref) => typeof ref !== 'string' || !String(ref).trim())) return { ok: false, reason: `${prefix}_GROUNDING_REFS_INVALID` };
    const realizedGroundingRefs = uniqueConformanceStrings(record.realizedGroundingRefs);
    if (realizedGroundingRefs.length !== record.realizedGroundingRefs.length) return { ok: false, reason: `${prefix}_GROUNDING_REFS_DUPLICATE` };
    const supportResult = parseGroundingSupport(record.groundingSupport);
    value.push({
      exactText,
      contributionKind,
      semanticTarget,
      taskDependency,
      evidenceRequirement,
      merchantReferentRefs,
      groundingEntailment,
      groundedActionRole,
      groundingBasis,
      groundingSupport: supportResult.value,
      realizedGroundingRefs,
      witnessProtocolError: supportResult.error,
    });
  }
  if (value.map((item) => item.exactText).join('') !== parentExactText) {
    return { ok: false, reason: `SPAN_${parentIndex}_PARTIAL_SUPPORT_COVERAGE_MISMATCH` };
  }
  return { ok: true, value };
}

function parseSemanticFunctionEnvelope(value: string):
  | { ok: true; value: ModelSemanticFunctionEnvelope }
  | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value || '').trim());
  } catch {
    return { ok: false, reason: 'JSON_PARSE_ERROR' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'ROOT_NOT_OBJECT' };
  const root = parsed as Record<string, unknown>;
  if (root.version !== 'HVE_SEMANTIC_SPANS_V4') return { ok: false, reason: 'VERSION_MISMATCH' };
  if (!Array.isArray(root.spans) || !root.spans.length || root.spans.length > 512) return { ok: false, reason: 'SPANS_ARRAY_INVALID' };

  const spans: ModelSemanticSpanClassification[] = [];
  for (let index = 0; index < root.spans.length; index += 1) {
    const item = root.spans[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: `SPAN_${index}_NOT_OBJECT` };
    const record = item as Record<string, unknown>;
    if ('startOffset' in record || 'endOffset' in record || 'atomId' in record || 'authorized' in record || 'actId' in record || 'actIds' in record) {
      return { ok: false, reason: `SPAN_${index}_FORBIDDEN_EXECUTABLE_FIELD` };
    }
    const unitId = typeof record.unitId === 'string' ? record.unitId.trim() : '';
    const exactText = typeof record.exactText === 'string' ? record.exactText : '';
    const contributionKind = normalizeSemanticWireLabel(record.contributionKind) as CustomerServiceSemanticContributionKind;
    const semanticTarget = normalizeSemanticWireLabel(record.semanticTarget) as CustomerServiceSemanticTarget;
    const taskDependency = normalizeSemanticWireLabel(record.taskDependency) as CustomerServiceSemanticTaskDependency;
    const evidenceRequirement = normalizeSemanticWireLabel(record.evidenceRequirement) as CustomerServiceEvidenceRequirement;
    if (!Array.isArray(record.merchantReferentRefs)) return { ok: false, reason: `SPAN_${index}_MERCHANT_REFERENT_REFS_NOT_ARRAY` };
    if (record.merchantReferentRefs.some((ref) => typeof ref !== 'string' || !String(ref).trim())) return { ok: false, reason: `SPAN_${index}_MERCHANT_REFERENT_REFS_INVALID` };
    const merchantReferentRefs = uniqueConformanceStrings(record.merchantReferentRefs);
    if (merchantReferentRefs.length !== record.merchantReferentRefs.length) return { ok: false, reason: `SPAN_${index}_MERCHANT_REFERENT_REFS_DUPLICATE` };
    const groundingEntailment = normalizeSemanticWireLabel(record.groundingEntailment) as CustomerServiceGroundingEntailment;
    const groundedActionRole = normalizeSemanticWireLabel(record.groundedActionRole) as CustomerServiceGroundedActionRole;
    const groundingBasis = normalizeSemanticWireLabel(record.groundingBasis) as CustomerServiceGroundingBasis;
    if (!/^S\d+U\d+$/.test(unitId)) return { ok: false, reason: `SPAN_${index}_UNIT_ID_INVALID` };
    if (!exactText.length) return { ok: false, reason: `SPAN_${index}_EXACT_TEXT_EMPTY` };
    if (!SEMANTIC_CONTRIBUTION_KINDS.has(contributionKind)) return { ok: false, reason: `SPAN_${index}_CONTRIBUTION_KIND_INVALID:${describeInvalidSemanticWireLabel(record.contributionKind)}` };
    if (!SEMANTIC_TARGETS.has(semanticTarget)) return { ok: false, reason: `SPAN_${index}_SEMANTIC_TARGET_INVALID:${describeInvalidSemanticWireLabel(record.semanticTarget)}` };
    if (!SEMANTIC_TASK_DEPENDENCIES.has(taskDependency)) return { ok: false, reason: `SPAN_${index}_TASK_DEPENDENCY_INVALID:${describeInvalidSemanticWireLabel(record.taskDependency)}` };
    if (!EVIDENCE_REQUIREMENT_VALUES.has(evidenceRequirement)) return { ok: false, reason: `SPAN_${index}_EVIDENCE_REQUIREMENT_INVALID:${describeInvalidSemanticWireLabel(record.evidenceRequirement)}` };
    if (!GROUNDING_ENTAILMENT_VALUES.has(groundingEntailment)) return { ok: false, reason: `SPAN_${index}_GROUNDING_ENTAILMENT_INVALID:${describeInvalidSemanticWireLabel(record.groundingEntailment)}` };
    if (!GROUNDED_ACTION_ROLE_VALUES.has(groundedActionRole)) return { ok: false, reason: `SPAN_${index}_GROUNDED_ACTION_ROLE_INVALID:${describeInvalidSemanticWireLabel(record.groundedActionRole)}` };
    if (!GROUNDING_BASIS_VALUES.has(groundingBasis)) return { ok: false, reason: `SPAN_${index}_GROUNDING_BASIS_INVALID:${describeInvalidSemanticWireLabel(record.groundingBasis)}` };
    if (!Array.isArray(record.realizedGroundingRefs)) return { ok: false, reason: `SPAN_${index}_GROUNDING_REFS_NOT_ARRAY` };
    const rawGroundingRefs = record.realizedGroundingRefs;
    if (rawGroundingRefs.some((ref) => typeof ref !== 'string' || !String(ref).trim())) return { ok: false, reason: `SPAN_${index}_GROUNDING_REFS_INVALID` };
    const realizedGroundingRefs = uniqueConformanceStrings(rawGroundingRefs);
    if (realizedGroundingRefs.length !== rawGroundingRefs.length) return { ok: false, reason: `SPAN_${index}_GROUNDING_REFS_DUPLICATE` };
    const supportResult = parseGroundingSupport(record.groundingSupport);
    const partialSupportResult = parsePartialSupportSpans(record.partialSupportSpans, exactText, groundingEntailment, index);
    // partialSupportSpans is an optional, permission-reducing refinement. A malformed
    // refinement must never invalidate an otherwise valid parent classification or create
    // a new refusal path; ignore it and retain the old whole-parent fail-closed behavior.
    const partialSupportSpans = partialSupportResult.ok ? partialSupportResult.value : [];
    spans.push({ unitId, exactText, contributionKind, semanticTarget, taskDependency, evidenceRequirement, merchantReferentRefs, groundingEntailment, groundedActionRole, groundingBasis, groundingSupport: supportResult.value, realizedGroundingRefs, witnessProtocolError: supportResult.error, partialSupportSpans });
  }

  const rawUnitGroundedActions = root.unitGroundedActions === undefined ? [] : root.unitGroundedActions;
  if (!Array.isArray(rawUnitGroundedActions) || rawUnitGroundedActions.length > 128) {
    return { ok: false, reason: 'UNIT_GROUNDED_ACTIONS_ARRAY_INVALID' };
  }
  const unitGroundedActions: ModelSemanticUnitGroundedAction[] = [];
  const seenUnitGroundedActions = new Set<string>();
  for (let index = 0; index < rawUnitGroundedActions.length; index += 1) {
    const item = rawUnitGroundedActions[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: `UNIT_ACTION_${index}_NOT_OBJECT` };
    const record = item as Record<string, unknown>;
    if ('actId' in record || 'actIds' in record || 'authorized' in record || 'binding' in record || 'bindings' in record) {
      return { ok: false, reason: `UNIT_ACTION_${index}_FORBIDDEN_EXECUTABLE_FIELD` };
    }
    const unitId = typeof record.unitId === 'string' ? record.unitId.trim() : '';
    const groundedActionRole = normalizeSemanticWireLabel(record.groundedActionRole);
    const taskDependency = normalizeSemanticWireLabel(record.taskDependency);
    if (!/^S\d+U\d+$/.test(unitId)) return { ok: false, reason: `UNIT_ACTION_${index}_UNIT_ID_INVALID` };
    if (groundedActionRole !== 'CHOICE_OR_RECOMMENDATION') return { ok: false, reason: `UNIT_ACTION_${index}_ROLE_INVALID:${describeInvalidSemanticWireLabel(record.groundedActionRole)}` };
    if (taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK') return { ok: false, reason: `UNIT_ACTION_${index}_TASK_DEPENDENCY_INVALID:${describeInvalidSemanticWireLabel(record.taskDependency)}` };
    if (!Array.isArray(record.spanIndexes) || !record.spanIndexes.length) return { ok: false, reason: `UNIT_ACTION_${index}_SPAN_INDEXES_INVALID` };
    if (record.spanIndexes.some((spanIndex) => !Number.isInteger(spanIndex) || Number(spanIndex) < 0)) return { ok: false, reason: `UNIT_ACTION_${index}_SPAN_INDEXES_INVALID` };
    const spanIndexes = [...new Set(record.spanIndexes.map((spanIndex) => Number(spanIndex)))];
    if (spanIndexes.length !== record.spanIndexes.length) return { ok: false, reason: `UNIT_ACTION_${index}_SPAN_INDEXES_DUPLICATE` };
    if (!Array.isArray(record.realizedGroundingRefs) || !record.realizedGroundingRefs.length) return { ok: false, reason: `UNIT_ACTION_${index}_GROUNDING_REFS_INVALID` };
    if (record.realizedGroundingRefs.some((ref) => typeof ref !== 'string' || !String(ref).trim())) return { ok: false, reason: `UNIT_ACTION_${index}_GROUNDING_REFS_INVALID` };
    const realizedGroundingRefs = uniqueConformanceStrings(record.realizedGroundingRefs);
    if (realizedGroundingRefs.length !== record.realizedGroundingRefs.length) return { ok: false, reason: `UNIT_ACTION_${index}_GROUNDING_REFS_DUPLICATE` };
    const key = `${unitId}:${groundedActionRole}:${spanIndexes.join(',')}:${realizedGroundingRefs.join(',')}`;
    if (seenUnitGroundedActions.has(key)) return { ok: false, reason: `UNIT_ACTION_${index}_DUPLICATE` };
    seenUnitGroundedActions.add(key);
    unitGroundedActions.push({
      unitId,
      groundedActionRole: 'CHOICE_OR_RECOMMENDATION',
      taskDependency: 'MATERIAL_TO_CUSTOMER_TASK',
      spanIndexes,
      realizedGroundingRefs,
    });
  }
  return { ok: true, value: { version: 'HVE_SEMANTIC_SPANS_V4', spans, unitGroundedActions } };
}

function parseGroundingSupport(raw: unknown): { value: ModelGroundingSupportWitness[]; error?: string } {
  const fail = (error: string) => ({ value: [], error });
  if (!Array.isArray(raw)) return fail('GROUNDING_SUPPORT_NOT_ARRAY');
  const value: ModelGroundingSupportWitness[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail(`SUPPORT_${index}_NOT_OBJECT`);
    const support = item as Record<string, unknown>;
    if (typeof support.ref !== 'string' || !support.ref.trim()) return fail(`SUPPORT_${index}_REF_MISSING_OR_NOT_STRING`);
    const ref = support.ref.trim();
    if (seen.has(ref)) return fail(`SUPPORT_${index}_REF_DUPLICATE`);
    if (!Array.isArray(support.excerpts) || !support.excerpts.length) return fail(`SUPPORT_${index}_EXCERPTS_MISSING_OR_NOT_ARRAY`);
    if (support.excerpts.some((text) => typeof text !== 'string' || !text.trim())) return fail(`SUPPORT_${index}_EXCERPT_NOT_STRING_OR_EMPTY`);
    const excerpts = support.excerpts as string[];
    if (new Set(excerpts).size !== excerpts.length) return fail(`SUPPORT_${index}_EXCERPT_DUPLICATE`);
    const sourceSemanticTarget = normalizeSemanticWireLabel(support.sourceSemanticTarget) as CustomerServiceSemanticTarget;
    const sourceGroundedActionRole = normalizeSemanticWireLabel(support.sourceGroundedActionRole) as CustomerServiceGroundedActionRole;
    if (!SEMANTIC_TARGETS.has(sourceSemanticTarget)) return fail(`SUPPORT_${index}_SOURCE_SEMANTIC_TARGET_INVALID:${describeInvalidSemanticWireLabel(support.sourceSemanticTarget)}`);
    if (!GROUNDED_ACTION_ROLE_VALUES.has(sourceGroundedActionRole)) return fail(`SUPPORT_${index}_SOURCE_GROUNDED_ACTION_ROLE_INVALID:${describeInvalidSemanticWireLabel(support.sourceGroundedActionRole)}`);
    seen.add(ref);
    value.push({ ref, excerpts: [...excerpts], sourceSemanticTarget, sourceGroundedActionRole });
  }
  return { value };
}

function resolveConformanceClassifierMaxTokens(budgetUnits: number, floor: number, ceiling: number) {
  const normalizedBudgetUnits = Math.max(1, Math.min(256, Math.trunc(Number(budgetUnits) || 1)));
  // HVE_SEMANTIC_SPANS_V4 carries proposition-level evidence, merchant referent scope,
  // typed source proof, and unit-level grounded action semantics in one classifier envelope.
  // Keep exactly one classifier call, but budget the output envelope from the structural
  // budget units above rather than pretending HVE-unit count equals proposition count.
  const estimated = 384 + (normalizedBudgetUnits * 320);
  return Math.min(ceiling, Math.max(floor, estimated));
}

function flattenGroundingEvidenceSurfaces(value: unknown, surfaces: string[], seen: Set<unknown>) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (value.length) surfaces.push(value);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    surfaces.push(String(value));
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) flattenGroundingEvidenceSurfaces(item, surfaces, seen);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key) surfaces.push(key);
    flattenGroundingEvidenceSurfaces(item, surfaces, seen);
  }
}

function uniqueGroundingEvidenceProjections(entries: GroundingEvidenceProjection[]) {
  const byId = new Map<string, GroundingEvidenceProjection>();
  for (const entry of entries) {
    const id = String(entry.id || '').trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...entry, id });
  }
  return [...byId.values()];
}

function buildGroundingEvidenceWitnessCorpus(entry: GroundingEvidenceProjection) {
  const surfaces: string[] = [entry.title, entry.content].filter((value) => value.length > 0);
  if (entry.structuredData !== null && entry.structuredData !== undefined) {
    try {
      const serialized = JSON.stringify(entry.structuredData);
      if (serialized) surfaces.push(serialized);
    } catch {
      // The source projection is diagnostic-only input to a blind classifier. If an exotic
      // structured value cannot stringify, primitive leaf surfaces still remain available.
    }
    flattenGroundingEvidenceSurfaces(entry.structuredData, surfaces, new Set());
  }
  return uniqueConformanceStrings(surfaces);
}

function validateGroundingSupportWitnessOwnership(
  classification: ModelSemanticAtomClassification,
  evidenceById: ReadonlyMap<string, GroundingEvidenceProjection>,
) {
  if (classification.witnessProtocolError) return false;
  if (classification.groundingEntailment === 'NOT_APPLICABLE'
    || classification.groundingEntailment === 'UNSUPPORTED') {
    return classification.groundingSupport.length === 0;
  }
  if (!classification.groundingSupport.length) return false;
  if (!sameStringSet(
    classification.groundingSupport.map((support) => support.ref),
    classification.realizedGroundingRefs,
  )) return false;
  for (const support of classification.groundingSupport) {
    const evidence = evidenceById.get(support.ref);
    if (!evidence) return false;
    const corpus = buildGroundingEvidenceWitnessCorpus(evidence);
    if (!support.excerpts.length || support.excerpts.some((excerpt) => !corpus.some((surface) => surface.includes(excerpt)))) {
      return false;
    }
  }
  return true;
}

function validateDirectSourceWitnessTypedPredicateCompatibility(
  classification: ModelSemanticAtomClassification,
) {
  if (classification.witnessProtocolError) return false;
  if (classification.groundingEntailment !== 'FULLY_SUPPORTED'
    || classification.groundingBasis !== 'DIRECT_SOURCE') return true;
  if (!classification.groundingSupport.length) return false;
  return classification.groundingSupport.every((support) => {
    if (support.sourceSemanticTarget !== classification.semanticTarget) return false;
    if (classification.semanticTarget === 'ACTION_OPTION_RISK_OR_OUTCOME') {
      if (classification.groundedActionRole === 'NOT_APPLICABLE') return false;
      if (support.sourceGroundedActionRole === classification.groundedActionRole) return true;

      // Claim-side CHOICE_OR_RECOMMENDATION includes the customer-facing act of
      // proposing the concrete option, while source-side proof independently labels
      // the factual predicate stated by Knowledge. A source that directly states the
      // same scenario/audience suitability therefore remains a valid witness for
      // recommendation framing under an already-selected Canonical recommendation
      // Act. Keep this bridge asymmetric and narrow: suitability still cannot prove
      // performance/experience/risk, and performance/descriptive facts do not gain
      // DIRECT_SOURCE recommendation Authority through this check.
      return classification.groundedActionRole === 'CHOICE_OR_RECOMMENDATION'
        && support.sourceGroundedActionRole === 'SUITABILITY_OR_DECISION_SUPPORT';
    }
    return support.sourceGroundedActionRole === 'NOT_APPLICABLE';
  });
}

function merchantReferentScopeRequiresEvidence(classification: ModelSemanticAtomClassification) {
  if (!classification.merchantReferentRefs.length) return false;
  if (!['ACTION_OPTION_RISK_OR_OUTCOME', 'MERCHANT_ENTITY_OR_POLICY'].includes(classification.semanticTarget)) return false;
  if (!['MATERIAL_TO_CUSTOMER_TASK', 'SUPPORTS_CUSTOMER_TASK'].includes(classification.taskDependency)) return false;
  return ![
    'QUESTION_OR_SERVICE_ENTRY',
    'RECEPTION_ACK',
    'REASSURANCE',
    'SOCIAL_NORMALIZATION',
    'RELATIONSHIP_CONTENT',
    'HUMOR',
    'CLOSE_ACK',
    'CLOSE_WARMTH',
    'NON_PROPOSITIONAL_FRAGMENT',
  ].includes(classification.contributionKind);
}

// Open-language proposition entailment is owned by the single blind semantic classifier.
// Runtime verifies protocol shape, source-witness ownership, typed-axis consistency and
// Canonical binding/ref permission; it must not re-parse the atom surface with a second
// lexical/coverage rule after a valid typed entailment result exists.
function groundingBasisRuntimeCompatible(classification: ModelSemanticAtomClassification) {
  if (classification.groundingEntailment !== 'FULLY_SUPPORTED') return false;
  if (classification.semanticTarget === 'ACTION_OPTION_RISK_OR_OUTCOME') {
    if (classification.groundedActionRole === 'NOT_APPLICABLE') return false;
  } else if (classification.groundedActionRole !== 'NOT_APPLICABLE') {
    return false;
  }
  if (classification.groundingBasis === 'DIRECT_SOURCE') return true;
  return classification.groundingBasis === 'SUPPORTED_CHOICE_SYNTHESIS'
    && classification.semanticTarget === 'ACTION_OPTION_RISK_OR_OUTCOME'
    && (classification.groundedActionRole === 'CHOICE_OR_RECOMMENDATION'
      || classification.groundedActionRole === 'SUITABILITY_OR_DECISION_SUPPORT');
}

function supportingGroundedClauseRuntimeCompatible(classification: ModelSemanticAtomClassification) {
  if (!groundingBasisRuntimeCompatible(classification)) return false;
  if (classification.semanticTarget === 'MERCHANT_ENTITY_OR_POLICY') {
    return classification.groundingBasis === 'DIRECT_SOURCE';
  }
  if (classification.semanticTarget !== 'ACTION_OPTION_RISK_OR_OUTCOME') return false;
  if (classification.groundedActionRole === 'SUITABILITY_OR_DECISION_SUPPORT') return true;
  if (classification.groundedActionRole === 'PERFORMANCE_OR_EXPERIENCE'
    || classification.groundedActionRole === 'RISK_OR_OTHER_OUTCOME') {
    return classification.groundingBasis === 'DIRECT_SOURCE';
  }
  return classification.groundedActionRole === 'CHOICE_OR_RECOMMENDATION';
}

function buildConformanceProtocolDiagnostic(input: {
  reason: string;
  atomCount: number;
  requestedMaxTokens: number;
  effectiveMaxTokens: number;
  completionTokens: number;
  finishReason: string | null;
  truncated: boolean;
}) {
  return [
    `reason=${input.reason}`,
    `atoms=${Math.max(0, Math.trunc(input.atomCount))}`,
    `finish=${String(input.finishReason || '-').trim() || '-'}`,
    `truncated=${input.truncated ? 'YES' : 'NO'}`,
    `completionTokens=${Math.max(0, Math.trunc(input.completionTokens || 0))}`,
    `requestedMaxTokens=${Math.max(0, Math.trunc(input.requestedMaxTokens || 0))}`,
    `effectiveMaxTokens=${Math.max(0, Math.trunc(input.effectiveMaxTokens || 0))}`,
  ].join(';');
}

function projectServerOwnedSemanticOwnership(
  segments: CustomerServiceHveReplyV2Segment[],
  atomProjection: RuntimeSurfaceAtomProjection,
  classifications: ModelSemanticAtomClassification[],
  unitGroundedActions: ModelSemanticUnitGroundedAction[],
  knowledgeEvidence: GroundingEvidenceProjection[],
): {
  ok: true;
  checks: CustomerServiceSemanticConformanceUnitCheckV1[];
  violations: CustomerServiceSemanticConformanceViolationV1[];
  removals: CustomerServiceSemanticConformanceRemovalV1[];
  unsafeViolation: string | null;
} | { ok: false; error: string } {
  if (classifications.length !== atomProjection.atoms.length) {
    return { ok: false, error: 'CONFORMANCE_RUNTIME_ATOM_CLASSIFICATION_COVERAGE_MISMATCH' };
  }
  const byAtomId = new Map(classifications.map((classification) => [classification.atomId, classification]));
  if (byAtomId.size !== atomProjection.atoms.length
    || atomProjection.atoms.some((atom) => !byAtomId.has(atom.atomId))
    || classifications.some((classification) => !atomProjection.atoms.some((atom) => atom.atomId === classification.atomId))) {
    return { ok: false, error: 'CONFORMANCE_RUNTIME_ATOM_CLASSIFICATION_ID_MISMATCH' };
  }

  const evidenceById = new Map(knowledgeEvidence.map((entry) => [entry.id, entry] as const));
  if (classifications.some((classification) => classification.merchantReferentRefs.some((ref) => !evidenceById.has(ref)))) {
    return { ok: false, error: 'CONFORMANCE_MERCHANT_REFERENT_REF_NOT_AVAILABLE' };
  }
  const knownUnitKeys = new Set(atomProjection.atoms.map((atom) => `S${atom.segmentIndex}U${atom.unitIndex}`));
  if (unitGroundedActions.some((action) => !knownUnitKeys.has(action.unitId))) {
    return { ok: false, error: 'CONFORMANCE_UNIT_GROUNDED_ACTION_UNKNOWN_UNIT' };
  }
  const unitGroundedActionsByUnitId = new Map<string, ModelSemanticUnitGroundedAction[]>();
  for (const action of unitGroundedActions) {
    const list = unitGroundedActionsByUnitId.get(action.unitId) || [];
    list.push(action);
    unitGroundedActionsByUnitId.set(action.unitId, list);
  }
  const witnessOwnershipByAtomId = new Map(classifications.map((classification) => [
    classification.atomId,
    validateGroundingSupportWitnessOwnership(classification, evidenceById),
  ] as const));
  const witnessTypedPredicateCompatibilityByAtomId = new Map(classifications.map((classification) => [
    classification.atomId,
    validateDirectSourceWitnessTypedPredicateCompatibility(classification),
  ] as const));
  const projectedChecks: CustomerServiceSemanticConformanceUnitCheckV1[] = [];
  const violations: CustomerServiceSemanticConformanceViolationV1[] = [];
  const removals: CustomerServiceSemanticConformanceRemovalV1[] = [];
  let unsafeViolation: string | null = null;

  // HVE producer bindings declare which selected non-grounded Acts the reply attempts to
  // realize, but they do not own the exact unit where that semantic function is proven.
  // Runtime's blind atom classifier owns actual non-grounded realization location. Grounded
  // bindings remain strictly unit-local because their refs are evidence authority, not labels.
  const replyDeclaredNonGroundedBindings = uniqueConformanceBindings(segments
    .flatMap((segment) => segment.units.flatMap((unit) => unit.bindings))
    .filter((binding) => binding.actType !== 'STOP' && binding.groundingRefs.length === 0));

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    for (let unitIndex = 0; unitIndex < segment.units.length; unitIndex += 1) {
      const unit = segment.units[unitIndex];
      const unitAtoms = atomProjection.byUnit.get(`${segmentIndex}:${unitIndex}`) || [];
      if (!unitAtoms.length || unitAtoms.map((atom) => atom.exactText).join('') !== unit.text) {
        return { ok: false, error: 'CONFORMANCE_RUNTIME_ATOM_UNIT_COVERAGE_MISMATCH' };
      }

      const localGroundedBindings = unit.bindings.filter((binding) => binding.groundingRefs.length > 0);
      const independentlyProvenRecommendationActIds = new Set(localGroundedBindings
        .filter((binding) => binding.actType === 'RECOMMEND_GROUNDED_ITEM')
        .filter((binding) => unitAtoms.some((atom) => {
          const classification = byAtomId.get(atom.atomId);
          if (!classification) return false;
          const contributionKind = normalizeGroundedSubstantiveContributionKind(classification);
          return contributionKind === 'GROUNDED_CONTENT'
            && classification.semanticTarget === 'ACTION_OPTION_RISK_OR_OUTCOME'
            && classification.groundedActionRole === 'CHOICE_OR_RECOMMENDATION'
            && classification.taskDependency === 'MATERIAL_TO_CUSTOMER_TASK'
            && witnessOwnershipByAtomId.get(classification.atomId) === true
            && witnessTypedPredicateCompatibilityByAtomId.get(classification.atomId) === true
            && groundingBasisRuntimeCompatible(classification)
            && classificationGroundingFullyOwnedByBinding(classification, binding.groundingRefs);
        }))
        .map((binding) => binding.actId));

      const projectedSpans: CustomerServiceSemanticConformanceUnitCheckV1['semanticSpans'] = [];
      let unitUnsafeViolation: string | null = null;
      for (const atom of unitAtoms) {
        const classification = byAtomId.get(atom.atomId);
        if (!classification) return { ok: false, error: 'CONFORMANCE_RUNTIME_ATOM_CLASSIFICATION_MISSING' };

        // A blind classifier may correctly identify the materially realized evidence while
        // retaining the surface-function label (answer/judgment/guidance). Grounding is the
        // more specific semantic function in that internally consistent result. Normalize
        // only that evidence-bearing substantive subset; Runtime still verifies every ref
        // against the unit's server-owned binding below, so this cannot create Grounding.
        const contributionKind = normalizeGroundedSubstantiveContributionKind(classification);

        const candidateBindings = uniqueConformanceBindings([
          ...localGroundedBindings,
          ...replyDeclaredNonGroundedBindings,
        ]);
        const compatibleBindings = uniqueConformanceBindings([
          ...candidateBindings.filter((binding) => contributionActTypeCompatible(
            contributionKind,
            classification.semanticTarget,
            classification.taskDependency,
            classification.groundedActionRole,
            classification.evidenceRequirement,
            binding.actType,
          )),
          // Clause atomization may separate the independently-proven recommendation from
          // fully-supported follow-on product facts or decision-supporting outcome facts.
          // They may remain under that already-proven recommendation only when they use the
          // same unit-local evidence; this never lets a supporting clause create recommendation
          // Authority on its own.
          ...localGroundedBindings.filter((binding) => binding.actType === 'RECOMMEND_GROUNDED_ITEM'
            && independentlyProvenRecommendationActIds.has(binding.actId)
            && contributionKind === 'GROUNDED_CONTENT'
            && (classification.semanticTarget === 'MERCHANT_ENTITY_OR_POLICY'
              || classification.semanticTarget === 'ACTION_OPTION_RISK_OR_OUTCOME')
            && (classification.taskDependency === 'MATERIAL_TO_CUSTOMER_TASK'
              || classification.taskDependency === 'SUPPORTS_CUSTOMER_TASK')
            && witnessOwnershipByAtomId.get(classification.atomId) === true
            && witnessTypedPredicateCompatibilityByAtomId.get(classification.atomId) === true
            && supportingGroundedClauseRuntimeCompatible(classification)
            && classificationGroundingFullyOwnedByBinding(classification, binding.groundingRefs)),
        ]);
        const compatibleGroundedBindings = compatibleBindings.filter((binding) => binding.groundingRefs.length > 0);
        const actTypeCompatible = compatibleBindings.length > 0;
        const semanticTargetCompatible = semanticTargetCompatibleWithContribution(
          contributionKind,
          classification.semanticTarget,
          classification.taskDependency,
        );
        const taskDependencyCompatible = taskDependencyCompatibleWithContribution(
          contributionKind,
          classification.taskDependency,
        );

        const evidenceWitnessOwned = witnessOwnershipByAtomId.get(classification.atomId) === true;
        const evidenceWitnessTypedPredicateCompatible = witnessTypedPredicateCompatibilityByAtomId.get(classification.atomId) === true;
        let groundingCompatible = true;
        let realizedGroundingRefs: string[] = [];
        if (contributionKind === 'GROUNDED_CONTENT') {
          const allowedRefs = new Set(compatibleGroundedBindings.flatMap((binding) => binding.groundingRefs));
          realizedGroundingRefs = uniqueConformanceStrings(classification.realizedGroundingRefs)
            .filter((ref) => allowedRefs.has(ref));
          groundingCompatible = classification.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'
            && groundingBasisRuntimeCompatible(classification)
            && evidenceWitnessOwned
            && evidenceWitnessTypedPredicateCompatible
            && realizedGroundingRefs.length > 0
            && realizedGroundingRefs.length === uniqueConformanceStrings(classification.realizedGroundingRefs).length;
        } else {
          const merchantReferentEvidenceConflict = classification.evidenceRequirement === 'NOT_REQUIRED'
            && merchantReferentScopeRequiresEvidence(classification);
          const ordinaryNonMerchant = classification.evidenceRequirement === 'NOT_REQUIRED'
            && classification.groundingEntailment === 'NOT_APPLICABLE'
            && classification.groundingBasis === 'NOT_APPLICABLE'
            && classification.groundingSupport.length === 0
            && classification.realizedGroundingRefs.length === 0
            && !merchantReferentEvidenceConflict;
          groundingCompatible = ordinaryNonMerchant || merchantEvidenceBoundaryRuntimeCompatible(classification);
        }

        groundingCompatible = groundingCompatible && !classification.witnessProtocolError;
        const structuralNeutral = contributionKind === 'NON_PROPOSITIONAL_FRAGMENT'
          && classification.semanticTarget === 'OTHER'
          && classification.evidenceRequirement === 'NOT_REQUIRED'
          && classification.groundingEntailment === 'NOT_APPLICABLE'
          && classification.groundedActionRole === 'NOT_APPLICABLE'
          && classification.groundingBasis === 'NOT_APPLICABLE'
          && classification.groundingSupport.length === 0
          && classification.realizedGroundingRefs.length === 0
          && classification.merchantReferentRefs.length === 0
          && !classification.witnessProtocolError;
        const authorized = structuralNeutral
          || (actTypeCompatible && semanticTargetCompatible && taskDependencyCompatible && groundingCompatible);
        let violationCode: CustomerServiceSemanticConformanceViolationCode | null = null;
        if (!authorized) violationCode = violationCodeForContributionKind(contributionKind);
        if (classification.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED' && !groundingCompatible) {
          violationCode = classification.groundingEntailment === 'UNSUPPORTED'
            || classification.groundingEntailment === 'PARTIALLY_SUPPORTED'
            || classification.realizedGroundingRefs.length > 0
            ? 'GROUNDED_EVIDENCE_UNSUPPORTED'
            : 'GROUNDED_EVIDENCE_NOT_REALIZED';
        } else if (classification.evidenceRequirement === 'NOT_REQUIRED'
          && merchantReferentScopeRequiresEvidence(classification)) {
          // Permission-reducing cross-axis guard only: the same typed classifier says this
          // substantive proposition is about a concrete merchant object, so NOT_REQUIRED
          // cannot grant Send Authority. Runtime does not infer which merchant proposition is
          // true, add refs, create an Act, or re-parse the open-language text.
          violationCode = 'UNAUTHORIZED_SEMANTIC_CONTRIBUTION';
        }

        const removableSupportingOtherProposition = contributionKind === 'OTHER_PROPOSITION'
          && isRemovableSupportingOtherProposition(classification);
        const intrinsicallyUnsafe = !!classification.witnessProtocolError || contributionKind === 'MIXED_OR_UNCERTAIN'
          || (contributionKind === 'OTHER_PROPOSITION' && !removableSupportingOtherProposition)
          || (!authorized && contributionKind === 'BOUNDARY_CONTENT');
        if (intrinsicallyUnsafe) {
          const reason = classification.witnessProtocolError
            ? `CONFORMANCE_WITNESS_PROTOCOL_ERROR:${atom.atomId}:${classification.witnessProtocolError}`
            : contributionKind === 'BOUNDARY_CONTENT'
            ? 'CONFORMANCE_BOUNDARY_CONTENT_NOT_INDEPENDENTLY_REMOVABLE'
            : contributionKind === 'MIXED_OR_UNCERTAIN'
              ? 'CONFORMANCE_MIXED_OR_UNCERTAIN_ATOM'
              : 'CONFORMANCE_OTHER_PROPOSITION_ATOM_UNPROVEN';
          unitUnsafeViolation ||= reason;
          unsafeViolation ||= reason;
        }

        const realizedActIds = authorized
          ? uniqueConformanceStrings(compatibleBindings.map((binding) => binding.actId))
          : [];
        const independentlyRemovable = !authorized && !intrinsicallyUnsafe && !!violationCode
          && REMOVABLE_SEMANTIC_VIOLATION_CODES.has(violationCode);

        projectedSpans.push({
          atomId: atom.atomId,
          exactText: atom.exactText,
          contributionKind,
          semanticTarget: classification.semanticTarget,
          taskDependency: classification.taskDependency,
          classifierResult: {
            witnessProtocolError: classification.witnessProtocolError,
            contributionKind: classification.contributionKind,
            semanticTarget: classification.semanticTarget,
            taskDependency: classification.taskDependency,
            evidenceRequirement: classification.evidenceRequirement,
            merchantReferentRefs: [...classification.merchantReferentRefs],
            groundingEntailment: classification.groundingEntailment,
            groundedActionRole: classification.groundedActionRole,
            groundingBasis: classification.groundingBasis,
            groundingSupport: classification.groundingSupport.map((support) => ({
              ref: support.ref,
              excerpts: [...support.excerpts],
            })),
            realizedGroundingRefs: [...classification.realizedGroundingRefs],
          },
          authorized,
          authorizationChecks: {
            actTypeCompatible,
            semanticTargetCompatible,
            taskDependencyCompatible,
            groundingCompatible,
          },
          realizedActIds,
          realizedGroundingRefs: authorized ? realizedGroundingRefs : [],
          independentFromBoundActs: independentlyRemovable,
          violationCode: authorized ? null : violationCode,
        });

        if (!authorized && violationCode) {
          const groundingDiagnostic = !groundingCompatible
            ? `:EVIDENCE_REQUIREMENT=${classification.evidenceRequirement}:MERCHANT_REFERENT_REFS=${classification.merchantReferentRefs.join(',') || '-'}:ENTAILMENT=${classification.groundingEntailment}:ACTION_ROLE=${classification.groundedActionRole}:BASIS=${classification.groundingBasis}:WITNESS=${evidenceWitnessOwned ? 'OWNED' : 'INVALID'}:WITNESS_TYPED=${evidenceWitnessTypedPredicateCompatible ? 'COMPATIBLE' : 'INCOMPATIBLE'}:SOURCE_WITNESS_TYPES=${classification.groundingSupport.map((support) => `${support.ref}:${support.sourceSemanticTarget}/${support.sourceGroundedActionRole}`).join('|') || '-'}:CLASSIFIER_REFS=${uniqueConformanceStrings(classification.realizedGroundingRefs).join(',') || '-'}:COMPATIBLE_BINDING_REFS=${uniqueConformanceStrings(compatibleGroundedBindings.flatMap((binding) => binding.groundingRefs)).join(',') || '-'}`
            : '';
          violations.push({
            code: violationCode,
            segmentIndex,
            unitIndex,
            reason: `SERVER_OWNED_MULTI_AXIS_NOT_AUTHORIZED:${contributionKind}:${classification.semanticTarget}:${classification.taskDependency}${groundingDiagnostic}`,
          });
          if (independentlyRemovable) {
            const occurrence = occurrenceAtExactOffset(unit.text, atom.exactText, atom.startOffset);
            if (occurrence < 1) return { ok: false, error: 'CONFORMANCE_RUNTIME_ATOM_OCCURRENCE_INVALID' };
            removals.push({
              segmentIndex,
              unitIndex,
              atomId: atom.atomId,
              exactText: atom.exactText,
              occurrence,
              code: violationCode,
            });
          } else if (!intrinsicallyUnsafe) {
            const reason = `CONFORMANCE_NON_REMOVABLE_ATOM:${contributionKind}`;
            unitUnsafeViolation ||= reason;
            unsafeViolation ||= reason;
          }
        }
      }

      const unitId = `S${segmentIndex}U${unitIndex}`;
      const modelUnitGroundedActions = unitGroundedActionsByUnitId.get(unitId) || [];
      const authorizedSpanGroundingRefs = uniqueConformanceStrings(projectedSpans
        .filter((span) => span.authorized)
        .flatMap((span) => span.realizedGroundingRefs));
      const authorizedRefSet = new Set(authorizedSpanGroundingRefs);
      const unitGroundedActionChecks: CustomerServiceSemanticConformanceUnitCheckV1['unitGroundedActions'] = [];
      const unitGroundedActionRealizedActIds: string[] = [];
      for (const modelUnitGroundedAction of modelUnitGroundedActions) {
        if (modelUnitGroundedAction.spanIndexes.some((spanIndex) => spanIndex >= projectedSpans.length)) {
          return { ok: false, error: `CONFORMANCE_UNIT_GROUNDED_ACTION_SPAN_INDEX_INVALID:${unitId}` };
        }
        const actionSpans = modelUnitGroundedAction.spanIndexes.map((spanIndex) => projectedSpans[spanIndex]);
        const spanAtomIds = actionSpans.map((span) => span.atomId).filter(Boolean) as string[];
        const declaredRefs = uniqueConformanceStrings(modelUnitGroundedAction.realizedGroundingRefs);
        const groupedClassifierRefs = new Set(actionSpans.flatMap((span) => span.classifierResult?.realizedGroundingRefs || []));
        const candidateRecommendationBindings = localGroundedBindings.filter((binding) => binding.actType === 'RECOMMEND_GROUNDED_ITEM');
        const refScopeOwned = declaredRefs.length > 0
          && groupedClassifierRefs.size === declaredRefs.length
          && declaredRefs.every((ref) => groupedClassifierRefs.has(ref))
          && candidateRecommendationBindings.some((binding) => declaredRefs.every((ref) => binding.groundingRefs.includes(ref)));
        const evidenceOwned = refScopeOwned
          && actionSpans.every((span) => span.authorized)
          && declaredRefs.every((ref) => authorizedRefSet.has(ref))
          && declaredRefs.every((ref) => actionSpans.some((span) => span.realizedGroundingRefs.includes(ref)));
        const realizedActIds: string[] = [];
        if (evidenceOwned) {
          for (const binding of candidateRecommendationBindings) {
            if (declaredRefs.every((ref) => binding.groundingRefs.includes(ref))) realizedActIds.push(binding.actId);
          }
          unitGroundedActionRealizedActIds.push(...realizedActIds);
        }
        unitGroundedActionChecks.push({
          groundedActionRole: modelUnitGroundedAction.groundedActionRole,
          taskDependency: modelUnitGroundedAction.taskDependency,
          spanAtomIds,
          realizedGroundingRefs: [...declaredRefs],
          refScopeOwned,
          evidenceOwned,
          realizedActIds: uniqueConformanceStrings(realizedActIds),
        });
      }

      projectedChecks.push({
        segmentIndex,
        unitIndex,
        semanticUnitBindings: unit.bindings.map((binding) => ({
          actId: binding.actId,
          actType: binding.actType,
          groundingRefs: [...binding.groundingRefs],
        })),
        unitGroundedActions: unitGroundedActionChecks,
        authorized: unitUnsafeViolation === null,
        realizedActIds: uniqueConformanceStrings([
          ...projectedSpans.flatMap((span) => span.realizedActIds),
          ...unitGroundedActionRealizedActIds,
        ]),
        realizedGroundingRefs: uniqueConformanceStrings(projectedSpans.flatMap((span) => span.realizedGroundingRefs)),
        semanticSpans: projectedSpans,
      });
    }
  }
  return { ok: true, checks: projectedChecks, violations, removals, unsafeViolation };
}

function merchantEvidenceBoundaryRuntimeCompatible(
  classification: ModelSemanticAtomClassification,
) {
  if (classification.evidenceRequirement !== 'MERCHANT_ENTITY_EVIDENCE_BOUNDARY') return false;
  // Evidence sufficiency is an independent proposition axis. BOUNDARY_CONTENT may carry
  // the same epistemic conclusion as answer/judgment/guidance, but only under this strict
  // zero-Grounding boundary shape. Ordinary capability/policy boundaries are unaffected.
  if (!['ANSWER_CONTENT', 'ANSWER_JUDGMENT', 'GUIDANCE_CONTENT', 'BOUNDARY_CONTENT'].includes(classification.contributionKind)) return false;
  if (!['MERCHANT_ENTITY_OR_POLICY', 'ACTION_OPTION_RISK_OR_OUTCOME', 'TASK_OR_DOMAIN_FACT'].includes(classification.semanticTarget)) return false;
  if (!['MATERIAL_TO_CUSTOMER_TASK', 'SUPPORTS_CUSTOMER_TASK'].includes(classification.taskDependency)) return false;
  return classification.groundingEntailment === 'NOT_APPLICABLE'
    && classification.groundedActionRole === 'NOT_APPLICABLE'
    && classification.groundingBasis === 'NOT_APPLICABLE'
    && classification.groundingSupport.length === 0
    && classification.realizedGroundingRefs.length === 0;
}

function normalizeGroundedSubstantiveContributionKind(
  classification: ModelSemanticAtomClassification,
): CustomerServiceSemanticContributionKind {
  // Proposition semantics own Grounding. A merchant/entity claim cannot hide under
  // ANSWER/GUIDANCE/BOUNDARY merely because its surface function sounds cautious, upstream
  // omitted a Grounded Act or the classifier found no supporting ref. A true epistemic
  // evidence boundary uses MERCHANT_ENTITY_EVIDENCE_BOUNDARY and therefore stays non-grounded.
  return classification.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'
    && GROUNDABLE_SUBSTANTIVE_CONTRIBUTION_KINDS.has(classification.contributionKind)
    ? 'GROUNDED_CONTENT'
    : classification.contributionKind;
}

function classificationGroundingFullyOwnedByBinding(
  classification: ModelSemanticAtomClassification,
  bindingRefs: string[],
) {
  if (classification.groundingEntailment !== 'FULLY_SUPPORTED') return false;
  const realizedRefs = uniqueConformanceStrings(classification.realizedGroundingRefs);
  const allowedRefs = new Set(bindingRefs);
  return realizedRefs.length > 0 && realizedRefs.every((ref) => allowedRefs.has(ref));
}

function contributionActTypeCompatible(
  kind: CustomerServiceSemanticContributionKind,
  target: CustomerServiceSemanticTarget,
  dependency: CustomerServiceSemanticTaskDependency,
  groundedActionRole: CustomerServiceGroundedActionRole,
  evidenceRequirement: CustomerServiceEvidenceRequirement,
  actType: string,
) {
  // Grounding evidence and recommendation ownership are separate axes. A grounded
  // descriptive merchant fact cannot satisfy RECOMMEND_GROUNDED_ITEM merely because the
  // unit declared that Act. The blind semantic target must independently prove that the
  // proposition itself is a task-material choice/risk/outcome judgment.
  if (kind === 'GROUNDED_CONTENT' && actType === 'RECOMMEND_GROUNDED_ITEM') {
    return target === 'ACTION_OPTION_RISK_OR_OUTCOME'
      && groundedActionRole === 'CHOICE_OR_RECOMMENDATION'
      && dependency === 'MATERIAL_TO_CUSTOMER_TASK';
  }
  // A true evidence-sufficiency boundary is useful answer content, not a merchant refusal.
  // It may realize only Acts that Canonical already selected; this branch creates neither
  // an Act nor Grounding and cannot authorize a positive/negative object-level claim.
  if (kind === 'BOUNDARY_CONTENT'
    && evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_BOUNDARY'
    && (actType === 'DIRECT_ANSWER' || actType === 'PROVIDE_GENERAL_GUIDANCE')) {
    return ['MERCHANT_ENTITY_OR_POLICY', 'ACTION_OPTION_RISK_OR_OUTCOME', 'TASK_OR_DOMAIN_FACT'].includes(target)
      && (dependency === 'MATERIAL_TO_CUSTOMER_TASK' || dependency === 'SUPPORTS_CUSTOMER_TASK');
  }
  if (CONTRIBUTION_KIND_COMPATIBLE_ACT_TYPES[kind].has(actType)) return true;
  // The same independently-proven grounded choice proposition may jointly realize an
  // already-selected General Guidance Act. Runtime still cannot create either Act, infer
  // Grounding refs, or let a plain MERCHANT_ENTITY_OR_POLICY fact masquerade as guidance.
  return (kind === 'ANSWER_CONTENT' || kind === 'GROUNDED_CONTENT')
    && actType === 'PROVIDE_GENERAL_GUIDANCE'
    && target === 'ACTION_OPTION_RISK_OR_OUTCOME'
    && dependency === 'MATERIAL_TO_CUSTOMER_TASK';
}

function isRemovableSupportingOtherProposition(
  classification: ModelSemanticAtomClassification,
) {
  // OTHER_PROPOSITION remains fail-closed by default. The only exception is an
  // independently removable, non-grounded supporting domain proposition: it is not the
  // customer's material requested result, carries no merchant/entity evidence requirement,
  // has no Grounding witness/ref/action role, and therefore cannot authorize or prove
  // anything. Removing it is permission-reducing. Material OTHER, merchant/entity OTHER,
  // outcome OTHER and any malformed/evidence-bearing OTHER continue to veto the unit.
  return !classification.witnessProtocolError
    && classification.taskDependency === 'SUPPORTS_CUSTOMER_TASK'
    && classification.semanticTarget === 'TASK_OR_DOMAIN_FACT'
    && classification.evidenceRequirement === 'NOT_REQUIRED'
    && classification.groundingEntailment === 'NOT_APPLICABLE'
    && classification.groundedActionRole === 'NOT_APPLICABLE'
    && classification.groundingBasis === 'NOT_APPLICABLE'
    && classification.groundingSupport.length === 0
    && classification.realizedGroundingRefs.length === 0;
}

function semanticTargetCompatibleWithContribution(
  kind: CustomerServiceSemanticContributionKind,
  target: CustomerServiceSemanticTarget,
  dependency: CustomerServiceSemanticTaskDependency,
) {
  if (kind === 'CLOSE_ACK' || kind === 'CLOSE_WARMTH') {
    return target === 'RELATIONSHIP_OR_CONVERSATION' && dependency === 'CLOSURE_ONLY';
  }
  if (kind === 'RECEPTION_ACK' || kind === 'REASSURANCE' || kind === 'SOCIAL_NORMALIZATION') return true;
  if (kind === 'RELATIONSHIP_CONTENT' || kind === 'QUESTION_OR_SERVICE_ENTRY' || kind === 'HUMOR') return true;
  if (kind === 'MIXED_OR_UNCERTAIN' || kind === 'OTHER_PROPOSITION') return false;
  if (target === 'CUSTOMER_EFFORT_OR_SELF_EVALUATION') return false;
  if (target === 'CUSTOMER_AFFECT_OR_STANCE' && dependency !== 'MATERIAL_TO_CUSTOMER_TASK') return false;
  if (target === 'RELATIONSHIP_OR_CONVERSATION'
    && kind !== 'HISTORY_REFERENCE_CONTENT'
    && kind !== 'RESTATEMENT_CONTENT') return false;
  return true;
}

function taskDependencyCompatibleWithContribution(
  kind: CustomerServiceSemanticContributionKind,
  dependency: CustomerServiceSemanticTaskDependency,
) {
  if (kind === 'CLOSE_ACK' || kind === 'CLOSE_WARMTH') return dependency === 'CLOSURE_ONLY';
  if (kind === 'RECEPTION_ACK'
    || kind === 'REASSURANCE'
    || kind === 'SOCIAL_NORMALIZATION'
    || kind === 'RELATIONSHIP_CONTENT'
    || kind === 'QUESTION_OR_SERVICE_ENTRY'
    || kind === 'HUMOR') return true;
  if (kind === 'MIXED_OR_UNCERTAIN' || kind === 'OTHER_PROPOSITION') return false;
  return dependency === 'MATERIAL_TO_CUSTOMER_TASK' || dependency === 'SUPPORTS_CUSTOMER_TASK';
}

function violationCodeForContributionKind(
  kind: CustomerServiceSemanticContributionKind,
): CustomerServiceSemanticConformanceViolationCode {
  if (kind === 'RECEPTION_ACK' || kind === 'REASSURANCE' || kind === 'SOCIAL_NORMALIZATION') {
    return 'UNAUTHORIZED_RECEPTION_CONTRIBUTION';
  }
  if (kind === 'RELATIONSHIP_CONTENT') return 'UNAUTHORIZED_RELATIONSHIP_CONTRIBUTION';
  if (kind === 'QUESTION_OR_SERVICE_ENTRY') return 'UNAUTHORIZED_QUESTION_OR_SERVICE_ENTRY';
  if (kind === 'GROUNDED_CONTENT') return 'GROUNDED_EVIDENCE_UNSUPPORTED';
  return 'UNAUTHORIZED_SEMANTIC_CONTRIBUTION';
}

function narrowGeneratedGroundedBindingsToConformanceEvidence(
  generation: CustomerServiceGenerationResult,
  checks: CustomerServiceSemanticConformanceUnitCheckV1[],
): { ok: true; generation: CustomerServiceGenerationResult } | { ok: false; error: string } {
  const segments = (generation.structuredSegments || []).map((segment) => cloneGeneratedSegment(segment));
  const byKey = new Map(checks.map((check) => [`${check.segmentIndex}:${check.unitIndex}`, check] as const));

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const semanticUnits = segments[segmentIndex].semanticUnits || [];
    for (let unitIndex = 0; unitIndex < semanticUnits.length; unitIndex += 1) {
      const unit = semanticUnits[unitIndex];
      const check = byKey.get(`${segmentIndex}:${unitIndex}`);
      if (!check) return { ok: false, error: 'CONFORMANCE_BINDING_NARROWING_CHECK_MISSING' };
      const fullyUnauthorized = check.semanticSpans.length > 0 && check.semanticSpans.every((span) => !span.authorized);
      if (fullyUnauthorized) continue;

      const narrowedBindings = unit.bindings.flatMap((binding) => {
        if (!binding.groundingRefs.length) {
          return [{ ...binding, groundingRefs: [...binding.groundingRefs] }];
        }
        const realizedRefs = uniqueConformanceStrings([
          ...check.semanticSpans
            .filter((span) => span.authorized && span.realizedActIds.includes(binding.actId))
            .flatMap((span) => span.realizedGroundingRefs),
          ...(check.unitGroundedActions || [])
            .filter((action) => action.evidenceOwned && action.realizedActIds.includes(binding.actId))
            .flatMap((action) => action.realizedGroundingRefs),
        ].filter((ref) => binding.groundingRefs.includes(ref)));
        return realizedRefs.length
          ? [{ ...binding, groundingRefs: realizedRefs }]
          : [];
      });
      if (unit.content.trim().length > 0 && !narrowedBindings.length) {
        return { ok: false, error: 'CONFORMANCE_BINDING_NARROWING_WOULD_UNBIND_UNIT' };
      }
      unit.bindings = narrowedBindings;
    }
  }

  return { ok: true, generation: { ...generation, structuredSegments: segments } };
}

function applyExactSubstringRemovals(
  generation: CustomerServiceGenerationResult,
  removals: CustomerServiceSemanticConformanceRemovalV1[],
  atomProjection: RuntimeSurfaceAtomProjection,
): { ok: true; generation: CustomerServiceGenerationResult } | { ok: false; generation: CustomerServiceGenerationResult; error: string } {
  const segments = (generation.structuredSegments || []).map((segment) => cloneGeneratedSegment(segment));
  const grouped = new Map<string, CustomerServiceSemanticConformanceRemovalV1[]>();
  for (const removal of removals) {
    const segment = segments[removal.segmentIndex];
    const unit = segment?.semanticUnits?.[removal.unitIndex];
    if (!segment || !unit || !['HVE_REPLY_V2', 'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE'].includes(unit.source)) {
      return { ok: false, generation, error: 'CONFORMANCE_REMOVAL_TARGET_NOT_FOUND' };
    }
    const atom = removal.atomId ? atomProjection.atoms.find((item) => item.atomId === removal.atomId) : null;
    if (!atom
      || atom.segmentIndex !== removal.segmentIndex
      || atom.unitIndex !== removal.unitIndex
      || atom.exactText !== removal.exactText) {
      return { ok: false, generation, error: 'CONFORMANCE_REMOVAL_NOT_RUNTIME_OWNED_ATOM' };
    }
    const expectedOccurrence = occurrenceAtExactOffset(unit.content, atom.exactText, atom.startOffset);
    if (expectedOccurrence < 1 || expectedOccurrence !== removal.occurrence) {
      return { ok: false, generation, error: 'CONFORMANCE_REMOVAL_RUNTIME_ATOM_OCCURRENCE_MISMATCH' };
    }
    const key = `${removal.segmentIndex}:${removal.unitIndex}`;
    grouped.set(key, [...(grouped.get(key) || []), removal]);
  }

  for (const [key, unitRemovals] of grouped) {
    const [segmentIndex, unitIndex] = key.split(':').map(Number);
    const unit = segments[segmentIndex].semanticUnits![unitIndex];
    const located: Array<{ start: number; end: number; removal: CustomerServiceSemanticConformanceRemovalV1 }> = [];
    for (const removal of unitRemovals) {
      const start = nthIndexOf(unit.content, removal.exactText, removal.occurrence);
      if (start < 0) return { ok: false, generation, error: 'CONFORMANCE_EXACT_SUBSTRING_NOT_FOUND' };
      located.push({ start, end: start + removal.exactText.length, removal });
    }
    located.sort((a, b) => a.start - b.start);
    for (let index = 1; index < located.length; index += 1) {
      if (located[index].start < located[index - 1].end) {
        return { ok: false, generation, error: 'CONFORMANCE_REMOVAL_RANGES_OVERLAP' };
      }
    }
  }

  const removedIds = new Set(removals.map((removal) => removal.atomId));
  // Project once per original segment, retaining every atom's original unit address.
  // This also covers a deleted tail/head of a still-surviving unit, not just empty units.
  const correctedSegments: CustomerServiceGeneratedSegment[] = segments.flatMap((segment, segmentIndex) => {
    const pieces = (segment.semanticUnits || []).flatMap((_, unitIndex) => (
      (atomProjection.byUnit.get(`${segmentIndex}:${unitIndex}`) || []).map((atom) => ({
        unitIndex,
        originalText: atom.exactText,
        survivingText: removedIds.has(atom.atomId) ? '' : atom.exactText,
      }))
    ));
    const projectedPieces = projectAuthorizedSurfacePieces(pieces);
    const projectedTexts = (segment.semanticUnits || []).map(() => '');
    pieces.forEach((piece, index) => {
      projectedTexts[piece.unitIndex] += projectedPieces[index];
    });
    const semanticUnits = (segment.semanticUnits || [])
      .map((unit, unitIndex) => ({ ...unit, content: projectedTexts[unitIndex] }))
      .filter((unit) => unit.content.length > 0)
      .map((unit, index) => ({ ...unit, index }));
    if (!semanticUnits.length) return [];
    const content = semanticUnits.map((unit) => unit.content).join('');
    if (!content.trim()) return [];
    return [{ ...segment, content, semanticUnits }];
  }).map((segment, index) => ({ ...segment, index }));

  const draft = correctedSegments.map((segment) => segment.content).join('\n\n').trim();
  const presentationIntent = generation.presentationIntent
    ? {
      ...generation.presentationIntent,
      segments: correctedSegments.map((segment, index) => ({
        index,
        content: segment.content,
        source: 'STRUCTURED_CHAT_PRESENTATION' as const,
      })),
    }
    : generation.presentationIntent;
  return {
    ok: true,
    generation: {
      ...generation,
      draft,
      visibleContentLength: draft.length,
      structuredSegments: correctedSegments,
      presentationIntent,
    },
  };
}

function hasSurfaceBoundaryBeforeRemoval(prefix: string) {
  if (!prefix.trim()) return true;
  if (/\n[ \t]*$/.test(prefix)) return true;
  return /[。.!！？?；;：:][”’"')）\]】》」』]*[ \t]*$/.test(prefix);
}

function hasTrailingSoftSeparator(prefix: string) {
  return /[，,、；;][ \t]*$/.test(prefix);
}

function orphanedSoftSeparatorLength(suffix: string) {
  const match = suffix.match(/^[ \t]*[，,、；;][ \t]*/);
  return match ? match[0].length : 0;
}

/**
 * One segment-wide atom projection for both correction and evidence validation.
 * Only a real deletion can expose a seam. Never retain deleted words, move a condition,
 * or copy a deleted question/negation onto another proposition. When deletion would
 * join two non-separated surviving surfaces, a single formatting newline separates
 * them; existing separators and untouched adjacency remain byte-exact.
 */
function projectAuthorizedSurfacePieces(pieces: Array<{ originalText: string; survivingText: string }>) {
  let prefix = '';
  let removalSeamOpen = false;
  return pieces.map((piece) => {
    if (!piece.survivingText.length) {
      removalSeamOpen ||= piece.originalText.length > 0;
      return '';
    }
    let exactText = piece.survivingText;
    if (removalSeamOpen) {
      if (hasSurfaceBoundaryBeforeRemoval(prefix) || hasTrailingSoftSeparator(prefix)) {
        exactText = exactText.slice(orphanedSoftSeparatorLength(exactText));
      }
      if (prefix.length && exactText.length
        && !/[\s，,。.!！？?；;：:][”’"')）\]】》」』]*$/.test(prefix)
        && !/^[\s，,。.!！？?；;：:]/.test(exactText)) {
        exactText = '\n' + exactText;
      }
    }
    prefix += exactText;
    removalSeamOpen = false;
    return exactText;
  });
}

function projectGeneratedSemanticSegments(segments: CustomerServiceGeneratedSegment[]): CustomerServiceHveReplyV2Segment[] {
  const projected: CustomerServiceHveReplyV2Segment[] = [];
  for (const segment of segments) {
    if (!segment.semanticUnits?.length || segment.semanticUnits.some((unit) => ![
      'HVE_REPLY_V2',
      'CANONICAL_SINGLE_OWNER_RECOVERY',
      'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE',
    ].includes(unit.source))) return [];
    const units = segment.semanticUnits.map((unit) => ({
      text: unit.content,
      // HVE_REPLY_V2 producer completeness is validated before Conformance. Generated
      // semantic units intentionally transport only bindings, so reconstruct the exact
      // declared Grounding-use set from those already-validated server-owned bindings.
      // This is structural transport only; classifier evidence still owns realization.
      usedGroundingRefs: uniqueConformanceStrings(
        unit.bindings.flatMap((binding) => binding.groundingRefs),
      ),
      bindings: unit.bindings.map((binding) => ({
        actId: binding.actId,
        actType: binding.actType,
        groundingRefs: [...binding.groundingRefs],
      })),
    }));
    const text = units.map((unit) => unit.text).join('');
    if (text !== segment.content) return [];
    projected.push({ text, units });
  }
  return projected;
}

function taskMaterialSemanticSignature(
  semanticTarget: CustomerServiceSemanticTarget,
  groundedActionRole: CustomerServiceGroundedActionRole,
) {
  return `${semanticTarget}|${groundedActionRole}`;
}

function hasIndependentTaskMaterialSafeContinuation(
  contract: CustomerServiceRuntimeReplyContract,
  checks: CustomerServiceSemanticConformanceUnitCheckV1[],
) {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return false;
  const independentActIds = new Set(projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts)
    .filter((act) => act.authorityScope === 'GENERAL_GUIDANCE'
      && act.type === 'PROVIDE_GENERAL_GUIDANCE'
      && act.necessity === 'REQUIRED')
    .map((act) => act.id));
  if (!independentActIds.size) return false;

  return checks.some((check) => (check.semanticSpans || []).some((span) => {
    const classification = span.classifierResult;
    if (span.authorized !== true
      || span.taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK'
      || !classification
      || !(span.realizedActIds || []).some((actId) => independentActIds.has(actId))) return false;
    if (!['ANSWER_CONTENT', 'ANSWER_JUDGMENT', 'GUIDANCE_CONTENT'].includes(span.contributionKind)) return false;
    if (!['TASK_OR_DOMAIN_FACT', 'CUSTOMER_SITUATION_FACT', 'ACTION_OPTION_RISK_OR_OUTCOME'].includes(classification.semanticTarget)) return false;
    if (classification.evidenceRequirement !== 'NOT_REQUIRED') return false;
    return classification.merchantReferentRefs.length === 0
      && classification.groundingEntailment === 'NOT_APPLICABLE'
      && classification.groundedActionRole === 'NOT_APPLICABLE'
      && classification.groundingBasis === 'NOT_APPLICABLE'
      && classification.groundingSupport.length === 0
      && classification.realizedGroundingRefs.length === 0
      && (span.realizedGroundingRefs || []).length === 0;
  }));
}

type RemovedMaterialCandidateClassification = NonNullable<
  CustomerServiceSemanticConformanceUnitCheckV1['semanticSpans'][number]['classifierResult']
>;

type CanonicalProjectedAct = ReturnType<typeof projectCustomerServiceCanonicalActsForSemanticFrame>[number];

function collectRemovedMaterialCandidatesForRequiredAct(
  checks: CustomerServiceSemanticConformanceUnitCheckV1[],
  removals: CustomerServiceSemanticConformanceRemovalV1[],
  requiredAct: CanonicalProjectedAct,
): RemovedMaterialCandidateClassification[] {
  const removedAtomKeys = new Set(removals.map((removal) => (
    `${removal.segmentIndex}:${removal.unitIndex}:${removal.atomId || ''}`
  )));

  return checks.flatMap((check) => {
    const bindingDeclaresRequiredAct = (check.semanticUnitBindings || [])
      .some((binding) => binding.actId === requiredAct.id);
    if (!bindingDeclaresRequiredAct) return [];

    return (check.semanticSpans || []).flatMap((span) => {
      const classification = span.classifierResult;
      if (!classification
        || span.authorized === true
        || span.taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK') return [];
      const removalKey = `${check.segmentIndex}:${check.unitIndex}:${span.atomId || ''}`;
      if (!removedAtomKeys.has(removalKey)) return [];

      const compatibleWithRequiredAct = contributionActTypeCompatible(
        span.contributionKind,
        classification.semanticTarget,
        classification.taskDependency,
        classification.groundedActionRole,
        classification.evidenceRequirement,
        requiredAct.type,
      )
        && semanticTargetCompatibleWithContribution(
          span.contributionKind,
          classification.semanticTarget,
          classification.taskDependency,
        )
        && taskDependencyCompatibleWithContribution(span.contributionKind, classification.taskDependency);
      return compatibleWithRequiredAct ? [classification] : [];
    });
  });
}

type TaskMaterialRequiredValueFailure = {
  error: string;
  requiredActId: string;
};

function validateTaskMaterialRequiredValueRealizationAfterCorrection(
  contract: CustomerServiceRuntimeReplyContract,
  checks: CustomerServiceSemanticConformanceUnitCheckV1[],
  removals: CustomerServiceSemanticConformanceRemovalV1[],
): TaskMaterialRequiredValueFailure | null {
  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return { error: 'CONFORMANCE_CANONICAL_PLAN_MISSING', requiredActId: '-' };
  const requiredValueActs = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts)
    .filter((act) => act.necessity === 'REQUIRED'
      && TASK_MATERIAL_REQUIRED_VALUE_ACT_TYPES.has(act.type));
  const requireSemanticContinuity = Boolean(plan.answerObligation?.responseTarget?.unresolvedNeed?.trim());
  for (const requiredAct of requiredValueActs) {
    const survivingMaterialSignatures = new Set<string>();
    const survivingEvidenceBoundaryTargets = new Set<CustomerServiceSemanticTarget>();
    let hasMaterialOwner = false;

    for (const check of checks) {
      for (const span of check.semanticSpans || []) {
        if (span.authorized !== true
          || span.taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK'
          || !(span.realizedActIds || []).includes(requiredAct.id)) continue;
        hasMaterialOwner = true;
        const classification = span.classifierResult;
        if (!classification) continue;
        if (classification.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_BOUNDARY') {
          survivingEvidenceBoundaryTargets.add(classification.semanticTarget);
          continue;
        }
        survivingMaterialSignatures.add(taskMaterialSemanticSignature(
          classification.semanticTarget,
          classification.groundedActionRole,
        ));
      }

      for (const action of check.unitGroundedActions || []) {
        if (action.taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK'
          || action.evidenceOwned !== true
          || !(action.realizedActIds || []).includes(requiredAct.id)) continue;
        hasMaterialOwner = true;
        survivingMaterialSignatures.add(taskMaterialSemanticSignature(
          'ACTION_OPTION_RISK_OR_OUTCOME',
          action.groundedActionRole,
        ));
      }
    }

    const lostMaterialCandidates = collectRemovedMaterialCandidatesForRequiredAct(
      checks,
      removals,
      requiredAct,
    );
    if (!lostMaterialCandidates.length) continue;

    if (!hasMaterialOwner) {
      return {
        error: (requiredAct.allowedGroundingRefs || []).length > 0
          ? `CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:${requiredAct.id}`
          : `CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:${requiredAct.id}`,
        requiredActId: requiredAct.id,
      };
    }
    // Role-level continuity is only a completion constraint when Canonical state
    // says there is a concrete unresolved customer need. Without that typed signal,
    // a removed material embellishment must not retroactively invalidate another
    // independently realized Required value.
    if (!requireSemanticContinuity) continue;

    const uncoveredLostSemantic = lostMaterialCandidates.find((classification) => {
      // A surviving evidence-boundary proposition with the same semantic target is
      // a valid task-material answer to an unprovable object-level proposition:
      // it answers evidential sufficiency without asserting the merchant outcome.
      if (survivingEvidenceBoundaryTargets.has(classification.semanticTarget)) return false;
      return !survivingMaterialSignatures.has(taskMaterialSemanticSignature(
        classification.semanticTarget,
        classification.groundedActionRole,
      ));
    });
    if (!uncoveredLostSemantic) continue;

    const semanticSignature = taskMaterialSemanticSignature(
      uncoveredLostSemantic.semanticTarget,
      uncoveredLostSemantic.groundedActionRole,
    );
    return {
      error: (requiredAct.allowedGroundingRefs || []).length > 0
        ? `CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:${requiredAct.id}:${semanticSignature}`
        : `CONFORMANCE_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:${requiredAct.id}:${semanticSignature}`,
      requiredActId: requiredAct.id,
    };
  }
  return null;
}

function validateConformanceUnitChecks(
  contract: CustomerServiceRuntimeReplyContract,
  segments: CustomerServiceHveReplyV2Segment[],
  checks: CustomerServiceSemanticConformanceUnitCheckV1[],
  decision: 'PASS' | 'REMOVE_UNAUTHORIZED_SPANS',
  removals: CustomerServiceSemanticConformanceRemovalV1[],
  violations: CustomerServiceSemanticConformanceViolationV1[],
) {
  const expectedCount = segments.reduce((sum, segment) => sum + segment.units.length, 0);
  if (checks.length !== expectedCount) return 'CONFORMANCE_UNIT_CHECK_COVERAGE_MISMATCH';
  const byKey = new Map(checks.map((check) => [`${check.segmentIndex}:${check.unitIndex}`, check]));
  const expectedUnauthorizedRemovals: CustomerServiceSemanticConformanceRemovalV1[] = [];
  const replyDeclaredNonGroundedActIds = new Set(segments
    .flatMap((segment) => segment.units.flatMap((unit) => unit.bindings))
    .filter((binding) => binding.actType !== 'STOP' && binding.groundingRefs.length === 0)
    .map((binding) => binding.actId));

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    for (let unitIndex = 0; unitIndex < segment.units.length; unitIndex += 1) {
      const unit = segment.units[unitIndex];
      const check = byKey.get(`${segmentIndex}:${unitIndex}`);
      if (!check || check.authorized !== true) return 'CONFORMANCE_UNIT_NOT_AUTHORIZED_AFTER_CORRECTION';
      if (!check.semanticSpans.length) return 'CONFORMANCE_SEMANTIC_SPAN_EVIDENCE_MISSING';
      if (check.semanticSpans.map((span) => span.exactText).join('') !== unit.text) {
        return 'CONFORMANCE_SEMANTIC_SPAN_COVERAGE_MISMATCH';
      }

      const declaredActIds = uniqueConformanceStrings(unit.bindings.filter((binding) => binding.actType !== 'STOP').map((binding) => binding.actId));
      const declaredGroundingRefs = uniqueConformanceStrings(unit.bindings.flatMap((binding) => binding.groundingRefs));
      const authorizedActIds: string[] = [];
      const authorizedGroundingRefs: string[] = [];
      let unitOffset = 0;

      for (const span of check.semanticSpans) {
        if (!span.exactText.length) return 'CONFORMANCE_EMPTY_SEMANTIC_SPAN';
        if (span.authorized) {
          if (span.independentFromBoundActs || span.violationCode !== null) {
            return 'CONFORMANCE_AUTHORIZED_SPAN_HAS_UNAUTHORIZED_EVIDENCE';
          }
          const structuralNeutral = span.contributionKind === 'NON_PROPOSITIONAL_FRAGMENT'
            && span.classifierResult?.semanticTarget === 'OTHER'
            && span.classifierResult?.evidenceRequirement === 'NOT_REQUIRED'
            && span.classifierResult?.groundingEntailment === 'NOT_APPLICABLE'
            && span.classifierResult?.groundedActionRole === 'NOT_APPLICABLE'
            && span.classifierResult?.groundingBasis === 'NOT_APPLICABLE'
            && !(span.classifierResult?.groundingSupport || []).length
            && !(span.classifierResult?.realizedGroundingRefs || []).length;
          if (!span.realizedActIds.length && !structuralNeutral) return 'CONFORMANCE_AUTHORIZED_SPAN_HAS_NO_ACT_OWNER';
          if (span.realizedActIds.some((actId) => !declaredActIds.includes(actId)
            && !replyDeclaredNonGroundedActIds.has(actId))) {
            return 'CONFORMANCE_SPAN_ACT_OWNER_OUTSIDE_DECLARED_BINDING';
          }
          if (span.realizedGroundingRefs.some((ref) => !declaredGroundingRefs.includes(ref))) {
            return 'CONFORMANCE_SPAN_GROUNDING_REF_OUTSIDE_DECLARED_BINDING';
          }
          for (const ref of span.realizedGroundingRefs) {
            if (!unit.bindings.some((binding) => span.realizedActIds.includes(binding.actId) && binding.groundingRefs.includes(ref))) {
              return 'CONFORMANCE_SPAN_GROUNDING_REF_NOT_OWNED_BY_REALIZED_ACT';
            }
          }
          authorizedActIds.push(...span.realizedActIds);
          authorizedGroundingRefs.push(...span.realizedGroundingRefs);
        } else {
          if (!span.independentFromBoundActs
            || span.realizedActIds.length
            || span.realizedGroundingRefs.length
            || !span.violationCode
            || !REMOVABLE_SEMANTIC_VIOLATION_CODES.has(span.violationCode)) {
            return 'CONFORMANCE_UNAUTHORIZED_SPAN_EVIDENCE_INVALID';
          }
          const occurrence = occurrenceAtExactOffset(unit.text, span.exactText, unitOffset);
          if (occurrence < 1) return 'CONFORMANCE_UNAUTHORIZED_SPAN_OCCURRENCE_INVALID';
          expectedUnauthorizedRemovals.push({
            segmentIndex,
            unitIndex,
            atomId: span.atomId,
            exactText: span.exactText,
            occurrence,
            code: span.violationCode,
          });
          if (!violations.some((violation) => violation.segmentIndex === segmentIndex
            && violation.unitIndex === unitIndex
            && violation.code === span.violationCode)) {
            return 'CONFORMANCE_UNAUTHORIZED_SPAN_VIOLATION_MISSING';
          }
        }
        unitOffset += span.exactText.length;
      }

      for (const action of check.unitGroundedActions || []) {
        const structurallyUsableActionGroup = action.groundedActionRole === 'CHOICE_OR_RECOMMENDATION'
          && action.taskDependency === 'MATERIAL_TO_CUSTOMER_TASK'
          && action.spanAtomIds.length > 0
          && new Set(action.spanAtomIds).size === action.spanAtomIds.length
          && action.spanAtomIds.every((atomId) => check.semanticSpans.some((span) => span.atomId === atomId))
          && action.realizedGroundingRefs.length > 0
          && action.refScopeOwned;

        // Classifier-supplied action groups are positive grouping evidence only. They may realize
        // recommendation authority when fully proven, but an unusable group has no negative Send
        // Authority over independently-proven span-level recommendations in the same HVE unit.
        if (!structurallyUsableActionGroup) {
          if (action.realizedActIds.length) return 'CONFORMANCE_UNIT_GROUNDED_ACTION_NOT_PROVEN';
          continue;
        }
        // PARTIAL/UNSUPPORTED inside one group remains local: that group realizes no Act and
        // cannot poison a sibling group or an independently-proven recommendation span.
        if (!action.evidenceOwned) {
          if (action.realizedActIds.length) return 'CONFORMANCE_UNIT_GROUNDED_ACTION_NOT_PROVEN';
          continue;
        }
        // If a semantically valid group does not map to a Canonical recommendation binding, it
        // simply realizes nothing. Global Required-Act completion below still fails closed when
        // neither spans nor any valid group independently realize the recommendation.
        if (!action.realizedActIds.length) continue;
        if (action.realizedGroundingRefs.some((ref) => !authorizedGroundingRefs.includes(ref))) {
          return 'CONFORMANCE_UNIT_GROUNDED_ACTION_REF_NOT_OWNED_BY_AUTHORIZED_SPAN';
        }
        for (const actId of action.realizedActIds) {
          const binding = unit.bindings.find((item) => item.actId === actId && item.actType === 'RECOMMEND_GROUNDED_ITEM');
          if (!binding || action.realizedGroundingRefs.some((ref) => !binding.groundingRefs.includes(ref))) {
            return 'CONFORMANCE_UNIT_GROUNDED_ACTION_OUTSIDE_DECLARED_BINDING';
          }
        }
        authorizedActIds.push(...action.realizedActIds);
      }

      const realizedActIds = uniqueConformanceStrings(authorizedActIds);
      const realizedGroundingRefs = uniqueConformanceStrings(authorizedGroundingRefs);
      if (!sameStringSet(check.realizedActIds, realizedActIds)) {
        return 'CONFORMANCE_UNIT_ACT_SUMMARY_MISMATCH';
      }
      if (!sameStringSet(check.realizedGroundingRefs, realizedGroundingRefs)) {
        return 'CONFORMANCE_UNIT_GROUNDING_SUMMARY_MISMATCH';
      }
      const fullyRemovedUnit = decision === 'REMOVE_UNAUTHORIZED_SPANS'
        && check.semanticSpans.every((span) => !span.authorized);
      // Model-authored non-grounded bindings are reply-level candidate declarations, not
      // unit-local semantic proof. Runtime may relocate their realized owner to the atom that
      // independently proves the function. Grounded Act ownership never receives this latitude.
      if (!fullyRemovedUnit && realizedActIds.some((actId) => !declaredActIds.includes(actId)
        && !replyDeclaredNonGroundedActIds.has(actId))) {
        return 'CONFORMANCE_SPAN_ACT_OWNER_OUTSIDE_DECLARED_BINDING';
      }
      // Grounded producer bindings are a unit-local candidate ceiling, not proof that every
      // declared candidate was actually realized. Runtime still forbids any realized ref from
      // leaving its owning unit, and Required grounded Acts are checked globally below against
      // authorized evidence. Unused grounded candidates are narrowed after classification.
      void fullyRemovedUnit;
    }
  }

  const plan = contract.orchestrationPlan.interactionPlanV2;
  if (!plan) return 'CONFORMANCE_CANONICAL_PLAN_MISSING';
  const requiredVisibleActs = projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts)
    .filter((act) => act.necessity === 'REQUIRED' && act.type !== 'STOP');
  const globallyRealizedActIds = uniqueConformanceStrings(checks.flatMap((check) => check.realizedActIds));
  for (const requiredAct of requiredVisibleActs) {
    if (globallyRealizedActIds.includes(requiredAct.id)) continue;

    // On the REMOVE path, a Required task-material Act may be absent precisely because
    // every proposition that attempted to realize it was proven unauthorized and is
    // scheduled for exact removal. Do not turn that expected post-correction state into
    // a pre-correction protocol failure: allow exact removal to run, then let the existing
    // typed post-correction Required-value validator decide whether a safe continuation
    // survives. PASS remains strict, and only a Runtime-owned removal candidate that is
    // semantically compatible with this exact Required Act may defer the check.
    const deferredToPostCorrection = decision === 'REMOVE_UNAUTHORIZED_SPANS'
      && TASK_MATERIAL_REQUIRED_VALUE_ACT_TYPES.has(requiredAct.type)
      && collectRemovedMaterialCandidatesForRequiredAct(checks, removals, requiredAct).length > 0;
    if (deferredToPostCorrection) continue;

    if ((requiredAct.allowedGroundingRefs || []).length > 0) {
      return 'CONFORMANCE_GROUNDED_BINDING_NOT_REALIZED';
    }
    return 'CONFORMANCE_REQUIRED_ACT_NOT_REALIZED';
  }

  if (decision === 'PASS') {
    if (expectedUnauthorizedRemovals.length) return 'CONFORMANCE_PASS_CONTAINS_UNAUTHORIZED_SEMANTIC_SPAN';
    return null;
  }

  if (!expectedUnauthorizedRemovals.length) return 'CONFORMANCE_REMOVE_HAS_NO_UNAUTHORIZED_SEMANTIC_SPAN';
  if (removals.length !== expectedUnauthorizedRemovals.length) {
    return 'CONFORMANCE_REMOVAL_SPAN_COVERAGE_MISMATCH';
  }
  const remaining = [...removals];
  for (const expected of expectedUnauthorizedRemovals) {
    const index = remaining.findIndex((removal) => removal.segmentIndex === expected.segmentIndex
      && removal.unitIndex === expected.unitIndex
      && removal.atomId === expected.atomId
      && removal.exactText === expected.exactText
      && removal.occurrence === expected.occurrence
      && removal.code === expected.code);
    if (index < 0) return 'CONFORMANCE_REMOVAL_DOES_NOT_MATCH_UNAUTHORIZED_SPAN';
    remaining.splice(index, 1);
  }
  if (remaining.length) return 'CONFORMANCE_REMOVAL_WITHOUT_UNAUTHORIZED_SPAN';
  return null;
}

function projectConformanceEvidencePieces(
  originalText: string,
  spans: CustomerServiceSemanticConformanceUnitCheckV1['semanticSpans'],
): { ok: true; pieces: Array<{ originalText: string; survivingText: string }> } | { ok: false; error: string } {
  if (spans.map((span) => span.exactText).join('') !== originalText) {
    return { ok: false, error: 'CONFORMANCE_CORRECTED_EVIDENCE_UNIT_COVERAGE_MISMATCH' };
  }
  return { ok: true, pieces: spans.map((span) => ({
    originalText: span.exactText,
    survivingText: span.authorized ? span.exactText : '',
  })) };
}

function validateCorrectedUnitsAgainstConformanceEvidence(
  originalSegments: CustomerServiceHveReplyV2Segment[],
  correctedSegments: CustomerServiceHveReplyV2Segment[],
  checks: CustomerServiceSemanticConformanceUnitCheckV1[],
) {
  const byKey = new Map(checks.map((check) => [`${check.segmentIndex}:${check.unitIndex}`, check]));
  const expected: CustomerServiceHveReplyV2Segment[] = [];
  for (let segmentIndex = 0; segmentIndex < originalSegments.length; segmentIndex += 1) {
    const originalSegment = originalSegments[segmentIndex];
    const units: CustomerServiceHveReplyV2Segment['units'] = [];
    const pieces: Array<{ unitIndex: number; originalText: string; survivingText: string }> = [];
    for (let unitIndex = 0; unitIndex < originalSegment.units.length; unitIndex += 1) {
      const originalUnit = originalSegment.units[unitIndex];
      const check = byKey.get(`${segmentIndex}:${unitIndex}`);
      if (!check) return 'CONFORMANCE_CORRECTED_UNIT_CHECK_MISSING';
      const textProjection = projectConformanceEvidencePieces(originalUnit.text, check.semanticSpans);
      if (!textProjection.ok) return textProjection.error;
      pieces.push(...textProjection.pieces.map((piece) => ({ ...piece, unitIndex })));
      units.push({
        text: '',
        // Corrected units remain internal Conformance carriers. Reconstruct protocol
        // completeness from the already-validated, evidence-narrowed bindings; do not infer
        // refs from corrected prose or create new Grounding authority here.
        usedGroundingRefs: uniqueConformanceStrings(
          originalUnit.bindings.flatMap((binding) => binding.groundingRefs),
        ),
        bindings: originalUnit.bindings.map((binding) => ({
          actId: binding.actId,
          actType: binding.actType,
          groundingRefs: [...binding.groundingRefs],
        })),
      });
    }
    const projectedPieces = projectAuthorizedSurfacePieces(pieces);
    const projectedTexts = units.map(() => '');
    pieces.forEach((piece, index) => {
      projectedTexts[piece.unitIndex] += projectedPieces[index];
    });
    const survivingUnits = units.map((unit, unitIndex) => ({ ...unit, text: projectedTexts[unitIndex] }))
      .filter((unit) => unit.text.length > 0);
    if (!survivingUnits.length) continue;
    expected.push({ text: survivingUnits.map((unit) => unit.text).join(''), units: survivingUnits });
  }
  if (JSON.stringify(correctedSegments) !== JSON.stringify(expected)) {
    return 'CONFORMANCE_CORRECTED_TEXT_EVIDENCE_MISMATCH';
  }
  return null;
}

function occurrenceAtExactOffset(text: string, needle: string, expectedOffset: number) {
  let from = 0;
  let occurrence = 0;
  while (from <= text.length) {
    const index = text.indexOf(needle, from);
    if (index < 0 || index > expectedOffset) return -1;
    occurrence += 1;
    if (index === expectedOffset) return occurrence;
    from = index + needle.length;
  }
  return -1;
}

function sameStringSet(left: string[], right: string[]) {
  const normalizedLeft = uniqueConformanceStrings(left).sort();
  const normalizedRight = uniqueConformanceStrings(right).sort();
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function uniqueConformanceBindings<T extends { actId: string; actType: string; groundingRefs: string[] }>(bindings: T[]) {
  const byKey = new Map<string, T>();
  for (const binding of bindings) {
    const key = `${binding.actId}:${binding.actType}:${uniqueConformanceStrings(binding.groundingRefs).sort().join(',')}`;
    if (!byKey.has(key)) byKey.set(key, binding);
  }
  return [...byKey.values()];
}

function uniqueConformanceStrings(values: unknown[]) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function cloneGeneratedSegment(segment: CustomerServiceGeneratedSegment): CustomerServiceGeneratedSegment {
  return {
    ...segment,
    purposes: [...segment.purposes],
    plannedActRefs: segment.plannedActRefs ? [...segment.plannedActRefs] : undefined,
    plannedActTypes: segment.plannedActTypes ? [...segment.plannedActTypes] : undefined,
    allowedGroundingRefs: segment.allowedGroundingRefs ? [...segment.allowedGroundingRefs] : undefined,
    semanticUnits: segment.semanticUnits?.map((unit) => ({
      ...unit,
      bindings: unit.bindings.map((binding) => ({ ...binding, groundingRefs: [...binding.groundingRefs] })),
    })),
  };
}

function nthIndexOf(text: string, needle: string, occurrence: number) {
  let from = 0;
  let found = -1;
  for (let index = 0; index < occurrence; index += 1) {
    found = text.indexOf(needle, from);
    if (found < 0) return -1;
    from = found + needle.length;
  }
  return found;
}

function classifiedUnprovenDecision(
  generation: CustomerServiceGenerationResult,
  result: { elapsedMs: number; requestedModel: string; actualModel: string; requestId: string },
  reason: string,
  evidence?: {
    unitChecks?: CustomerServiceSemanticConformanceUnitCheckV1[];
    violations?: CustomerServiceSemanticConformanceViolationV1[];
  },
): CustomerServiceSemanticConformanceOutcome {
  // The classifier envelope was valid and Runtime completed proposition classification.
  // A later binding/completion/correction invariant can still make the candidate unsafe,
  // but that is not an INVALID_RESPONSE from the classifier. Preserve CLASSIFIED so the
  // HVE Send consumer can distinguish ordinary classified disputes from checker failure
  // and apply fact-safe degradation only when proposition evidence semantics require it.
  const trace = baseTrace({
    decision: 'UNPROVEN_PRESERVED',
    observedDecision: 'CLASSIFIED',
    generation,
    modelCallCount: 1,
    elapsedMs: result.elapsedMs,
    requestedModel: result.requestedModel || null,
    actualModel: result.actualModel || null,
    requestId: result.requestId || null,
    unitChecks: evidence?.unitChecks,
    violations: [
      ...(evidence?.violations || []),
      { code: 'CONFORMANCE_PROTOCOL_ERROR', segmentIndex: null, unitIndex: null, reason },
    ],
    errorMessage: reason,
  });
  return { accepted: false, generation: attachConformance(generation, trace, result.elapsedMs), trace };
}

function invalidParsedDecision(
  generation: CustomerServiceGenerationResult,
  result: { elapsedMs: number; requestedModel: string; actualModel: string; requestId: string },
  reason: string,
  evidence?: {
    unitChecks?: CustomerServiceSemanticConformanceUnitCheckV1[];
    violations?: CustomerServiceSemanticConformanceViolationV1[];
  },
): CustomerServiceSemanticConformanceOutcome {
  const trace = baseTrace({
    decision: 'UNPROVEN_PRESERVED',
    observedDecision: 'INVALID_RESPONSE',
    generation,
    modelCallCount: 1,
    elapsedMs: result.elapsedMs,
    requestedModel: result.requestedModel || null,
    actualModel: result.actualModel || null,
    requestId: result.requestId || null,
    unitChecks: evidence?.unitChecks,
    violations: [
      ...(evidence?.violations || []),
      { code: 'CONFORMANCE_PROTOCOL_ERROR', segmentIndex: null, unitIndex: null, reason },
    ],
    errorMessage: reason,
  });
  return { accepted: false, generation: attachConformance(generation, trace, result.elapsedMs), trace };
}

function rejectedWithoutCall(
  generation: CustomerServiceGenerationResult,
  code: CustomerServiceSemanticConformanceViolationCode,
  reason: string,
): CustomerServiceSemanticConformanceOutcome {
  const trace = baseTrace({
    decision: 'UNPROVEN_PRESERVED',
    observedDecision: 'LOCAL_PROTOCOL_ERROR',
    generation,
    modelCallCount: 0,
    elapsedMs: 0,
    requestedModel: null,
    actualModel: null,
    requestId: null,
    violations: [{ code, segmentIndex: null, unitIndex: null, reason }],
    errorMessage: reason,
  });
  return { accepted: false, generation: attachConformance(generation, trace, 0), trace };
}

function baseTrace(input: {
  decision: CustomerServiceSemanticConformanceTraceV1['decision'];
  observedDecision?: CustomerServiceSemanticConformanceTraceV1['observedDecision'];
  generation: CustomerServiceGenerationResult;
  modelCallCount: 0 | 1;
  elapsedMs: number;
  requestedModel: string | null;
  actualModel: string | null;
  requestId: string | null;
  removals?: CustomerServiceSemanticConformanceRemovalV1[];
  unitChecks?: CustomerServiceSemanticConformanceUnitCheckV1[];
  violations: CustomerServiceSemanticConformanceViolationV1[];
  errorMessage: string | null;
  requiredValueCompletion?: CustomerServiceSemanticConformanceTraceV1['requiredValueCompletion'];
  originalTextLength?: number;
}): CustomerServiceSemanticConformanceTraceV1 {
  return {
    schemaVersion: 1,
    authority: 'CANONICAL_SEMANTIC_CONFORMANCE_V1',
    scope: 'SEMANTIC_AUTHORIZATION_ONLY',
    functionClassificationAuthority: 'MODEL_SINGLE_SEMANTIC_SPAN_ACTION_GROUP_AND_REFERENT_AUTHORITY_V12',
    authorizationAuthority: 'RUNTIME_VALIDATED_SEMANTIC_SPAN_ACTION_GROUP_REFERENT_MATRIX_V12',
    classificationIsolation: {
      canonicalActsVisible: false,
      actIdsVisible: false,
      hveBindingsVisible: false,
      completionPolicyVisible: false,
      roleBehaviorDiagnosticsVisible: false,
      availableGroundingEvidenceVisible: true,
      groundingEvidenceCreatesAuthorization: false,
    },
    decision: input.decision,
    observedDecision: input.observedDecision ?? (input.decision === 'PASS'
      ? 'PASS'
      : input.decision === 'REMOVED_UNAUTHORIZED_SPANS' ? 'REMOVE_UNAUTHORIZED_SPANS' : null),
    sendEligibilityEffect: 'NONE',
    modelCallCount: input.modelCallCount,
    elapsedMs: input.elapsedMs,
    requestedModel: input.requestedModel,
    actualModel: input.actualModel,
    requestId: input.requestId,
    originalTextLength: input.originalTextLength ?? (input.generation.draft?.trim().length || 0),
    finalTextLength: input.generation.draft?.trim().length || 0,
    removals: (input.removals || []).map((item) => ({ ...item })),
    unitChecks: (input.unitChecks || []).map((item) => ({
      ...item,
      semanticUnitBindings: item.semanticUnitBindings?.map((binding) => ({
        ...binding,
        groundingRefs: [...binding.groundingRefs],
      })),
      unitGroundedActions: item.unitGroundedActions?.map((action) => ({
        ...action,
        spanAtomIds: [...action.spanAtomIds],
        realizedGroundingRefs: [...action.realizedGroundingRefs],
        realizedActIds: [...action.realizedActIds],
      })),
      realizedActIds: [...item.realizedActIds],
      realizedGroundingRefs: [...item.realizedGroundingRefs],
      semanticSpans: item.semanticSpans.map((span) => ({
        ...span,
        classifierResult: span.classifierResult ? {
          ...span.classifierResult,
          merchantReferentRefs: [...span.classifierResult.merchantReferentRefs],
          groundingSupport: span.classifierResult.groundingSupport.map((support) => ({
            ref: support.ref,
            excerpts: [...support.excerpts],
          })),
          realizedGroundingRefs: [...span.classifierResult.realizedGroundingRefs],
        } : undefined,
        realizedActIds: [...span.realizedActIds],
        realizedGroundingRefs: [...span.realizedGroundingRefs],
      })),
    })),
    violations: input.violations.map((item) => ({ ...item })),
    errorMessage: input.errorMessage,
    requiredValueCompletion: input.requiredValueCompletion ? {
      status: input.requiredValueCompletion.status,
      missingRequiredActIds: [...input.requiredValueCompletion.missingRequiredActIds],
    } : undefined,
    authorityEffects: {
      canCreateActs: false,
      canCreateFacts: false,
      canCreateGrounding: false,
      canImproveStyle: false,
      canRetry: false,
      canVetoNonEmptyGeneration: false,
      correctionMode: 'RUNTIME_VALIDATED_SPAN_REMOVAL_ONLY',
    },
  };
}

function attachConformance(
  generation: CustomerServiceGenerationResult,
  trace: CustomerServiceSemanticConformanceTraceV1,
  elapsedMs: number,
): CustomerServiceGenerationResult {
  return {
    ...generation,
    semanticConformance: trace,
    totalModelElapsedMs: generation.totalModelElapsedMs + elapsedMs,
    modelCallCount: generation.modelCallCount + trace.modelCallCount,
  };
}

function resolveConformanceTimeoutMs() {
  const parsed = Number(process.env.CUSTOMER_SERVICE_HVE_CONFORMANCE_TIMEOUT_MS || 8_000);
  if (!Number.isFinite(parsed)) return 8_000;
  return Math.max(3_000, Math.min(30_000, Math.round(parsed)));
}
