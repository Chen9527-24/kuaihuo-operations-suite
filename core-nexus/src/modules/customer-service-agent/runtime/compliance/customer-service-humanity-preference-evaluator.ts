import { Injectable } from '@nestjs/common';
import type { CustomerServiceSelectedKnowledgeEntry } from '../../shared/context/customer-service-knowledge.util';
import type {
  CustomerServiceExpectedInformationGain,
  CustomerServiceInteractionPlanV2,
  CustomerServicePlannedAct,
} from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceObservedAct } from './customer-service-output-act-recognizer';
import { getCustomerServiceActDescriptor } from './customer-service-act-descriptor.registry';
import type { CustomerServicePublicIdentityProjection } from '../identity/customer-service-public-identity-projection';
import type { CustomerServiceBehaviorHistoryProjection } from '../state/customer-service-conversation-state.type';
import { resolveCustomerServiceHveFamilyRealization } from '../generation/customer-service-hve-family-realization';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';
import type { CustomerServiceHumanTurnRealizationV1 } from '../generation/customer-service-human-turn-realization';
import type { CustomerServiceResolvedRoleIdentityContextV1 } from '../role/customer-service-resolved-role-identity-context';

export type CustomerServiceHumanityFeatureKey =
  | 'ACT_ECONOMY'
  | 'DIRECTNESS'
  | 'SPEECH_ACT_NARRATION'
  | 'ROLE_CARD_EXPANSION'
  | 'STYLE_AMPLIFICATION'
  | 'CUSTOMER_STYLE_ALIGNMENT'
  | 'GENERIC_TRUISM'
  | 'REPETITION_STRUCTURE'
  | 'SEMANTIC_LOAD'
  | 'CONTEXT_SPECIFICITY'
  | 'GROUNDEDNESS'
  | 'QUESTION_VALUE'
  | 'INFORMATION_GAIN'
  | 'REDUNDANT_PARAPHRASE'
  | 'CROSS_TURN_INFORMATION_GAIN'
  | 'SERVICE_POSTURE'
  | 'CONVERSATIONAL_FLOW'
  | 'SERVICE_ENTRY_VALUE'
  | 'IDENTITY_SURFACE_QUALITY'
  | 'CURRENT_TURN_VALUE'
  | 'PREFERENCE_USAGE'
  | 'DECISION_CONTRIBUTION'
  | 'MULTI_TURN_RHYTHM'
  | 'CROSS_FAMILY_VOICE'
  | 'ROLE_TURN_MANEUVER'
  | 'ROLE_BEHAVIOR_ALIGNMENT'
  | 'ROLE_VOICE_FIDELITY'
  | 'SPEAKER_CONTINUITY'
  | 'CONVERSATIONAL_TEXTURE'
  | 'AI_ANSWER_CADENCE'
  | 'ROLE_EVIDENCE';

export type CustomerServiceHumanityFeature = {
  key: CustomerServiceHumanityFeatureKey;
  score: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: string[];
};

export type CustomerServiceKnowledgeUtilizationStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_AVAILABLE'
  | 'AVAILABLE_NOT_OBSERVED'
  | 'OBSERVED_WITH_GROUNDING'
  | 'UNCERTAIN';

export type CustomerServiceDecisionContributionKind =
  | 'NONE'
  | 'REFRAME_ONLY'
  | 'USEFUL_DIRECTION'
  | 'GROUNDED_FACT'
  | 'DECISION_REDUCTION'
  | 'TASK_ADVANCE';

export type CustomerServiceSemanticValueSummary = {
  expectedInformationGains: CustomerServiceExpectedInformationGain[];
  knowledgeUtilization: {
    status: CustomerServiceKnowledgeUtilizationStatus;
    availableEntryIds: string[];
    observedEntryIds: string[];
    expectedByActs: string[];
  };
  questionValueScore: number;
  informationGainScore: number;
  redundantParaphraseScore: number;
  crossTurnInformationGainScore: number;
  serviceEntryValueScore: number;
  identitySurfaceQualityScore: number;
  currentTurnValueScore: number;
  preferenceUsageScore: number;
  decisionContributionKind: CustomerServiceDecisionContributionKind;
  decisionContributionScore: number;
  multiTurnRhythmScore: number;
  crossFamilyVoiceScore: number;
  roleTurnManeuverScore: number;
  roleBehaviorAlignmentScore: number;
  roleVoiceFidelityScore: number;
  speakerContinuityScore: number;
  conversationalTextureScore: number;
  aiAnswerCadenceScore: number;
  roleEvidenceScore: number;
};

export type CustomerServiceRoleEvidenceStatus = 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE';

export type CustomerServiceRoleEvidenceSummary = {
  status: CustomerServiceRoleEvidenceStatus;
  score: number;
  positiveEvidence: string[];
  missingEvidence: string[];
  configurationFingerprint: string | null;
};

export type CustomerServiceHumanityFeatureVector = {
  score: number;
  /** R3-A pairwise utility: compares useful realization after Hard + Plan qualification. */
  pairwiseUtilityScore: number;
  /** R5-C role-conditioned preference only; never creates or suppresses an Act. */
  personaPreferenceScore: number;
  roleEvidence: CustomerServiceRoleEvidenceSummary;
  status: 'GOOD' | 'ACCEPTABLE' | 'POOR';
  features: CustomerServiceHumanityFeature[];
  highRiskKeys: CustomerServiceHumanityFeatureKey[];
  shouldGenerateNaturalnessCandidate: boolean;
  semanticValue: CustomerServiceSemanticValueSummary;
};

@Injectable()
export class CustomerServiceHumanityPreferenceEvaluator {
  evaluate(input: {
    text: string;
    latestCustomerMessage: string;
    plan: CustomerServiceInteractionPlanV2;
    observedActs: CustomerServiceObservedAct[];
    knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
    identityProjection?: CustomerServicePublicIdentityProjection | null;
    behaviorHistory?: CustomerServiceBehaviorHistoryProjection | null;
    speakerProjection?: CustomerServiceRoleSpeakerProjectionV1 | null;
    resolvedRoleIdentity?: CustomerServiceResolvedRoleIdentityContextV1 | null;
    humanTurnRealization?: CustomerServiceHumanTurnRealizationV1 | null;
    recentConversation?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  }): CustomerServiceHumanityFeatureVector {
    const text = String(input.text || '').trim();
    const customer = String(input.latestCustomerMessage || '').trim();
    const planned = new Set(input.plan.acts.map((item) => item.type));
    const observed = input.observedActs.filter((item) => item.observation === 'OBSERVED');
    const unexpectedExplicit = observed.filter((item) => {
      const descriptor = getCustomerServiceActDescriptor(item.type);
      if (descriptor.authorization !== 'EXPLICIT_ONLY' || planned.has(item.type)) return false;
      return !(descriptor.allowedWhenActs || []).some((allowed) => planned.has(allowed));
    });
    const features: CustomerServiceHumanityFeature[] = [];

    features.push(feature(
      'ACT_ECONOMY',
      clamp(100 - unexpectedExplicit.length * 28 - Math.max(0, observed.length - Math.max(2, input.plan.acts.length + 1)) * 6),
      unexpectedExplicit.map((item) => `UNEXPECTED:${item.type}`),
    ));

    const narration = [
      ...matchAll(text, /(?:(?:看到|注意到|收到|留意到).{0,8}(?:你|你的).{0,8}(?:问候|消息|招呼|提问|说|问|提到)|你刚刚(?:说|问|提到)|你是在(?:问|说)|你这个(?:问题|问法))/giu),
      ...matchAll(text, /(?:(?:我|这边)?(?:先|再)?(?:帮你|给你)?(?:往.{0,12})?(?:理一理|梳理(?:一下)?|捋一捋|分析(?:一下)?|判断(?:一下)?|整理(?:一下)?)(?:方向|思路)?)/giu),
    ];
    features.push(feature('SPEECH_ACT_NARRATION', clamp(100 - narration.length * 48), narration));

    const identityObserved = observed.filter((item) => ['DISCLOSE_NAME', 'DISCLOSE_PUBLIC_IDENTITY', 'EXPLAIN_SERVICE_SCOPE'].includes(item.type));
    const identityUnneeded = identityObserved.filter((item) => !planned.has(item.type) && !(getCustomerServiceActDescriptor(item.type).allowedWhenActs || []).some((allowed) => planned.has(allowed)));
    features.push(feature('ROLE_CARD_EXPANSION', clamp(100 - identityUnneeded.length * 35), identityUnneeded.map((item) => item.type)));

    const customerStyle = styleSignals(customer);
    const replyStyle = styleSignals(text);
    const amplification = Math.max(0, replyStyle.expressive - customerStyle.expressive - (customer.length <= 8 ? 0 : 1));
    features.push(feature('STYLE_AMPLIFICATION', clamp(100 - amplification * 16), replyStyle.evidence));
    const styleDistance = Math.abs(replyStyle.expressive - customerStyle.expressive);
    features.push(feature('CUSTOMER_STYLE_ALIGNMENT', clamp(100 - styleDistance * 10), styleDistance >= 3 ? [`STYLE_DISTANCE:${styleDistance}`] : []));

    const genericTruisms = matchAll(text, /(?:一般来说|通常来说|确实(?:要|得).{0,10}才行|不容易出错|好搭(?:也|又)?不容易|比较省心|怎么穿都|基本不会错|比较百搭|确实(?:更|比较)?(?:日常|实用|方便|省心|百搭|好搭)|(?:更|比较)(?:日常|百搭|好搭)(?:一些|一点)?)/giu);
    const noKnowledgeProduct = input.plan.interactionType === 'PRODUCT_DISCOVERY_NO_GROUNDING' && input.knowledgeEntries.length === 0;
    const generalGuidanceAuthorized = planned.has('PROVIDE_GENERAL_GUIDANCE');
    const generalGuidanceObserved = observed.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE');
    const genericTruismPenalty = noKnowledgeProduct && !(generalGuidanceAuthorized && generalGuidanceObserved) ? 50 : 24;
    features.push(feature('GENERIC_TRUISM', clamp(100 - genericTruisms.length * genericTruismPenalty), genericTruisms));

    const repeatedStarts = repeatedClauseStarts(text);
    features.push(feature('REPETITION_STRUCTURE', clamp(100 - repeatedStarts.length * 18), repeatedStarts));

    const knowledgeUtilization = resolveKnowledgeUtilization(input.plan, observed, input.knowledgeEntries);
    const questionValue = evaluateQuestionValue(input.plan, observed, text);
    const redundantParaphrase = evaluateRedundantParaphrase({
      customer,
      reply: text,
      genericTruisms,
      observed,
      interactionType: input.plan.interactionType,
    });
    const crossTurnInformationGain = evaluateCrossTurnInformationGain({
      plan: input.plan,
      reply: text,
      recentConversation: input.recentConversation || [],
    });
    const currentTurnValue = evaluateCurrentTurnValue({
      plan: input.plan,
      observed,
      customer,
      reply: text,
      genericTruisms,
      knowledge: knowledgeUtilization,
      crossTurnInformationGainScore: crossTurnInformationGain.score,
    });
    const informationGain = evaluateInformationGain(input.plan, observed, questionValue.score, knowledgeUtilization, currentTurnValue.score, crossTurnInformationGain.score);
    const servicePosture = evaluateServicePosture(input.plan, observed, text);
    const conversationalFlow = evaluateConversationalFlow(input.plan, observed, text);
    const serviceEntryValue = evaluateServiceEntryValue(input.plan, observed);
    const identitySurfaceQuality = evaluateIdentitySurfaceQuality(input.plan, observed, text, input.identityProjection || null);
    const preferenceUsage = evaluatePreferenceUsage(input.plan, observed, text, currentTurnValue.score);
    const decisionContribution = evaluateDecisionContribution({
      plan: input.plan,
      observed,
      currentTurnValueScore: currentTurnValue.score,
      questionValueScore: questionValue.score,
      knowledge: knowledgeUtilization,
    });
    const multiTurnRhythm = evaluateMultiTurnRhythm({
      plan: input.plan,
      observed,
      text,
      behaviorHistory: input.behaviorHistory || null,
      redundantParaphraseScore: redundantParaphrase.score,
      crossTurnInformationGainScore: crossTurnInformationGain.score,
    });
    const crossFamilyVoice = evaluateCrossFamilyVoice({
      plan: input.plan,
      observed,
      text,
    });
    const roleTurnManeuver = evaluateRoleTurnManeuver({
      observed,
      realization: input.humanTurnRealization || null,
    });
    const roleBehaviorAlignment = evaluateRoleBehaviorAlignment({
      plan: input.plan,
      observed,
      realization: input.humanTurnRealization || null,
    });
    const roleVoiceFidelity = evaluateRoleVoiceFidelity({
      text,
      plan: input.plan,
      observed,
      speaker: input.speakerProjection || null,
      realization: input.humanTurnRealization || null,
    });
    const speakerContinuity = evaluateSpeakerContinuity({
      text,
      speaker: input.speakerProjection || null,
      recentConversation: input.recentConversation || [],
    });
    const conversationalTexture = evaluateConversationalTexture({
      text,
      realization: input.humanTurnRealization || null,
    });
    const aiAnswerCadence = evaluateAiAnswerCadence({
      text,
      realization: input.humanTurnRealization || null,
    });
    const roleEvidence = evaluatePositiveRoleEvidence({
      text,
      plan: input.plan,
      observed,
      resolvedRole: input.resolvedRoleIdentity || null,
      speaker: input.speakerProjection || null,
      roleTurnManeuver,
      roleBehaviorAlignment,
      roleVoiceFidelity,
      speakerContinuity,
    });

    const requiredCount = input.plan.acts.filter((item) => item.necessity === 'REQUIRED' && item.type !== 'STOP').length;
    const preferredCount = input.plan.acts.filter((item) => item.necessity === 'PREFERRED' && item.type !== 'STOP').length;
    const observedOptional = observed.some((item) => input.plan.acts.some((act) => act.type === item.type && act.necessity === 'OPTIONAL'));
    const expectedMoves = Math.max(1, requiredCount + Math.min(1, preferredCount) + (observedOptional ? 1 : 0));
    const clauses = splitSemanticClauses(text);
    const extraClauses = Math.max(0, clauses.length - expectedMoves);
    const expectedLength = 18 + expectedMoves * 20 + (knowledgeUtilization.status === 'OBSERVED_WITH_GROUNDING' ? 26 : 0);
    const overload = Math.max(0, text.length - expectedLength);
    const semanticLoadScore = clamp(100 - extraClauses * 18 - Math.round(overload * 0.62));
    features.push(feature('SEMANTIC_LOAD', semanticLoadScore, [
      ...(extraClauses ? [`EXTRA_SEMANTIC_CLAUSES:${extraClauses}`] : []),
      ...(overload > 14 ? [`OVER_EXPECTED_CHARS:${overload}`] : []),
    ]));

    const directnessPenalty = startsWithMetaPreamble(text) ? 24 : 0;
    features.push(feature('DIRECTNESS', 100 - directnessPenalty, directnessPenalty ? ['META_OR_SOP_PREAMBLE'] : []));

    const contextSpecificity = evaluateContextSpecificity(input.plan, customer, text, knowledgeUtilization, redundantParaphrase.score);
    features.push(feature('CONTEXT_SPECIFICITY', contextSpecificity.score, contextSpecificity.evidence));

    const ungroundedRecommendation = observed.some((item) => item.type === 'RECOMMEND_GROUNDED_ITEM' && !item.groundingRefs.length);
    const groundingScore = ungroundedRecommendation
      ? 30
      : knowledgeUtilization.status === 'AVAILABLE_NOT_OBSERVED' && knowledgeUtilization.expectedByActs.length ? 66 : 100;
    features.push(feature('GROUNDEDNESS', groundingScore, [
      ...(ungroundedRecommendation ? ['UNGROUNDED_RECOMMENDATION'] : []),
      ...(knowledgeUtilization.status === 'AVAILABLE_NOT_OBSERVED' && knowledgeUtilization.expectedByActs.length ? ['KNOWLEDGE_AVAILABLE_BUT_NOT_OBSERVED'] : []),
    ]));

    features.push(feature('QUESTION_VALUE', questionValue.score, questionValue.evidence));
    features.push(feature('INFORMATION_GAIN', informationGain.score, informationGain.evidence));
    features.push(feature('REDUNDANT_PARAPHRASE', redundantParaphrase.score, redundantParaphrase.evidence));
    features.push(feature('CROSS_TURN_INFORMATION_GAIN', crossTurnInformationGain.score, crossTurnInformationGain.evidence));
    features.push(feature('SERVICE_POSTURE', servicePosture.score, servicePosture.evidence));
    features.push(feature('CONVERSATIONAL_FLOW', conversationalFlow.score, conversationalFlow.evidence));
    features.push(feature('SERVICE_ENTRY_VALUE', serviceEntryValue.score, serviceEntryValue.evidence));
    features.push(feature('IDENTITY_SURFACE_QUALITY', identitySurfaceQuality.score, identitySurfaceQuality.evidence));
    features.push(feature('CURRENT_TURN_VALUE', currentTurnValue.score, currentTurnValue.evidence));
    features.push(feature('PREFERENCE_USAGE', preferenceUsage.score, preferenceUsage.evidence));
    features.push(feature('DECISION_CONTRIBUTION', decisionContribution.score, decisionContribution.evidence));
    features.push(feature('MULTI_TURN_RHYTHM', multiTurnRhythm.score, multiTurnRhythm.evidence));
    features.push(feature('CROSS_FAMILY_VOICE', crossFamilyVoice.score, crossFamilyVoice.evidence));
    features.push(feature('ROLE_TURN_MANEUVER', roleTurnManeuver.score, roleTurnManeuver.evidence));
    features.push(feature('ROLE_BEHAVIOR_ALIGNMENT', roleBehaviorAlignment.score, roleBehaviorAlignment.evidence));
    features.push(feature('ROLE_VOICE_FIDELITY', roleVoiceFidelity.score, roleVoiceFidelity.evidence));
    features.push(feature('SPEAKER_CONTINUITY', speakerContinuity.score, speakerContinuity.evidence));
    features.push(feature('CONVERSATIONAL_TEXTURE', conversationalTexture.score, conversationalTexture.evidence));
    features.push(feature('AI_ANSWER_CADENCE', aiAnswerCadence.score, aiAnswerCadence.evidence));
    features.push(feature('ROLE_EVIDENCE', roleEvidence.score, [
      ...roleEvidence.positiveEvidence,
      ...roleEvidence.missingEvidence,
    ]));

    const score = Math.round(features.reduce((sum, item) => sum + item.score, 0) / Math.max(1, features.length));
    const pairwiseUtilityScore = weightedUtility(features);
    const rawPersonaPreferenceScore = weightedPersonaPreference(features);
    const personaPreferenceScore = roleEvidence.status === 'SUFFICIENT'
      ? rawPersonaPreferenceScore
      : roleEvidence.status === 'PARTIAL'
        ? Math.min(rawPersonaPreferenceScore, 74)
        : Math.min(rawPersonaPreferenceScore, 58);
    const highRiskKeys = features.filter((item) => item.risk === 'HIGH').map((item) => item.key);
    const naturalServiceNeedsRewrite = features.some((item) =>
      ['CROSS_TURN_INFORMATION_GAIN', 'SERVICE_POSTURE', 'CONVERSATIONAL_FLOW', 'SERVICE_ENTRY_VALUE', 'IDENTITY_SURFACE_QUALITY', 'CURRENT_TURN_VALUE', 'PREFERENCE_USAGE', 'DECISION_CONTRIBUTION', 'MULTI_TURN_RHYTHM', 'CROSS_FAMILY_VOICE', 'ROLE_TURN_MANEUVER', 'ROLE_BEHAVIOR_ALIGNMENT', 'ROLE_VOICE_FIDELITY', 'SPEAKER_CONTINUITY', 'CONVERSATIONAL_TEXTURE', 'AI_ANSWER_CADENCE', 'ROLE_EVIDENCE'].includes(item.key) && item.score < 82,
    );
    const contributionDeficit = hasExpectedContributionDeficit(input.plan, decisionContribution);
    return {
      score,
      pairwiseUtilityScore,
      personaPreferenceScore,
      roleEvidence,
      status: highRiskKeys.length || score < 72
        ? 'POOR'
        : score < 84 || roleEvidence.status !== 'SUFFICIENT'
          ? 'ACCEPTABLE'
          : 'GOOD',
      features,
      highRiskKeys,
      shouldGenerateNaturalnessCandidate: highRiskKeys.length > 0 || naturalServiceNeedsRewrite || contributionDeficit || score < 78 || pairwiseUtilityScore < 78,
      semanticValue: {
        expectedInformationGains: uniqueInformationGains(input.plan.acts),
        knowledgeUtilization,
        questionValueScore: questionValue.score,
        informationGainScore: informationGain.score,
        redundantParaphraseScore: redundantParaphrase.score,
        crossTurnInformationGainScore: crossTurnInformationGain.score,
        serviceEntryValueScore: serviceEntryValue.score,
        identitySurfaceQualityScore: identitySurfaceQuality.score,
        currentTurnValueScore: currentTurnValue.score,
        preferenceUsageScore: preferenceUsage.score,
        decisionContributionKind: decisionContribution.kind,
        decisionContributionScore: decisionContribution.score,
        multiTurnRhythmScore: multiTurnRhythm.score,
        crossFamilyVoiceScore: crossFamilyVoice.score,
        roleTurnManeuverScore: roleTurnManeuver.score,
        roleBehaviorAlignmentScore: roleBehaviorAlignment.score,
        roleVoiceFidelityScore: roleVoiceFidelity.score,
        speakerContinuityScore: speakerContinuity.score,
        conversationalTextureScore: conversationalTexture.score,
        aiAnswerCadenceScore: aiAnswerCadence.score,
        roleEvidenceScore: roleEvidence.score,
      },
    };
  }

  compare(left: CustomerServiceHumanityFeatureVector, right: CustomerServiceHumanityFeatureVector) {
    const highRiskDelta = left.highRiskKeys.length - right.highRiskKeys.length;
    if (highRiskDelta !== 0) return highRiskDelta;
    const personaDelta = right.personaPreferenceScore - left.personaPreferenceScore;
    if (personaDelta !== 0) return personaDelta;
    const utilityDelta = right.pairwiseUtilityScore - left.pairwiseUtilityScore;
    if (utilityDelta !== 0) return utilityDelta;
    const mediumRisk = (value: CustomerServiceHumanityFeatureVector) => value.features.filter((item) => item.risk === 'MEDIUM').length;
    const mediumDelta = mediumRisk(left) - mediumRisk(right);
    if (mediumDelta !== 0) return mediumDelta;
    return right.score - left.score;
  }
}

function resolveKnowledgeUtilization(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
): CustomerServiceSemanticValueSummary['knowledgeUtilization'] {
  const selectedGroundedObligations = plan.acts.filter((item) =>
    item.necessity === 'REQUIRED'
    && getCustomerServiceActDescriptor(item.type).authorityScope === 'GROUNDED_BUSINESS'
  );
  const allowedEntryIds = uniqueStrings(selectedGroundedObligations.flatMap((act) =>
    (act.grounding || [])
      .filter((requirement) =>
        requirement.source === 'KNOWLEDGE'
        && requirement.requirement === 'REQUIRED'
        && requirement.status === 'SATISFIED'
      )
      .flatMap((requirement) => [requirement.key, ...(requirement.evidenceRefs || [])])
  ));
  // Diagnostics must observe only the exact Knowledge refs bound to a current
  // Required Grounded Act. An unrelated/non-empty Knowledge pool cannot create a
  // Grounded completion obligation or make a non-applicable turn look missed.
  const expectedByActs = allowedEntryIds.length
    ? uniqueStrings(selectedGroundedObligations.map((item) => item.type))
    : [];
  const availableKnowledgeIds = new Set(knowledgeEntries.map((item) => item.id));
  const availableEntryIds = allowedEntryIds.filter((id) => availableKnowledgeIds.has(id));
  const expectedGroundedActTypes = new Set(expectedByActs);
  const observedEntryIds = uniqueStrings(observed
    .filter((item) => item.observation === 'OBSERVED' && expectedGroundedActTypes.has(item.type))
    .flatMap((item) => item.groundingRefs || []))
    .filter((id) => availableEntryIds.includes(id));
  // Grounded-value expectation is owned by an actually selected GROUNDED_BUSINESS
  // Canonical Act, not by a generic expectedInformationGain label. A DIRECT_ANSWER
  // or general guidance Act may carry ADD_GROUNDED_INFORMATION as downstream value
  // metadata without creating business-grounding authority. Diagnostics must not turn
  // that metadata into a false CURRENT_TURN_GROUNDED_VALUE_MISSED signal.
  const status: CustomerServiceKnowledgeUtilizationStatus = !expectedByActs.length
    ? 'NOT_APPLICABLE'
    : !availableEntryIds.length
      ? 'NOT_AVAILABLE'
      : observedEntryIds.length
        ? 'OBSERVED_WITH_GROUNDING'
        : 'AVAILABLE_NOT_OBSERVED';
  return { status, availableEntryIds, observedEntryIds, expectedByActs };
}

function evaluateQuestionValue(plan: CustomerServiceInteractionPlanV2, observed: CustomerServiceObservedAct[], text: string) {
  const observedQuestions = observed.filter((item) => ['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY'].includes(item.type));
  if (!observedQuestions.length) return { score: 100, evidence: [] as string[] };
  const plannedQuestions = plan.acts.filter((item) => ['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY'].includes(item.type));
  if (!plannedQuestions.length) return { score: 35, evidence: ['UNPLANNED_QUESTION'] };

  const observedRequired = observedQuestions.some((item) => item.type === 'REQUEST_REQUIRED_SLOT');
  const plannedRequired = plannedQuestions.find((item) => item.type === 'REQUEST_REQUIRED_SLOT');
  if (observedRequired && plannedRequired) return { score: 98, evidence: ['REQUIRED_TASK_INFORMATION'] };

  const optional = plannedQuestions.find((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE');
  const optionalObserved = observedQuestions.find((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE');
  if (!optionalObserved || !optional) return { score: 84, evidence: [] as string[] };

  const questionText = optionalObserved.spans.map((span) => span.text).join(' ') || text;
  const targetValues = [optional.parameters?.target, ...(optional.parameters?.missing || [])].filter(Boolean) as string[];
  const knownValues = optional.parameters?.known || [];
  const targetAlignment = semanticTextAlignment(questionText, targetValues);
  const knownAlignment = semanticTextAlignment(questionText, knownValues);
  const hasConcreteTarget = targetValues.some((value) => !isGenericDecisionTarget(value));
  const maxDecisionDelta = /(?:最大化单个可选问题的决策增量|答案会改变后续建议|答案会改变.*匹配结论|改变后续建议或匹配结论)/u.test(optional.parameters?.decisionPurpose || '');
  const navigationLike = /(?:想先看|先看哪|先从哪|看哪一类|哪个类别|哪类内容|哪个模块|哪个部分|按哪个分类|从哪类开始)/u.test(questionText);
  if (knownAlignment > targetAlignment && knownAlignment >= 0.45) {
    return { score: 42, evidence: ['QUESTION_REASKS_KNOWN_DIMENSION'] };
  }
  if (maxDecisionDelta && navigationLike && !hasConcreteTarget) {
    return { score: 68, evidence: ['QUESTION_NAVIGATION_LIKE_WITHOUT_DECISION_TARGET'] };
  }
  if (targetAlignment >= 0.38) return { score: 96, evidence: ['QUESTION_ALIGNS_WITH_MISSING_INFORMATION'] };
  if (hasConcreteTarget) return { score: 62, evidence: ['QUESTION_MISALIGNED_WITH_PLANNED_TARGET'] };
  return { score: 78, evidence: ['QUESTION_TARGET_GENERIC_BUT_NOT_REASKING_KNOWN'] };
}

function isGenericDecisionTarget(value: string) {
  return /(?:仍未明确|仍缺失|一个偏好维度|当前选择方向|关键匹配条件|决策变量|用途、偏好、限制|客户希望达到的感觉|近期安排|是否愿意分享)/u.test(String(value || ''));
}

function evaluateInformationGain(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
  questionValueScore: number,
  knowledge: CustomerServiceSemanticValueSummary['knowledgeUtilization'],
  currentTurnValueScore: number,
  crossTurnInformationGainScore: number,
) {
  const gains = uniqueInformationGains(plan.acts).filter((item) => item !== 'NONE');
  if (!gains.length) return { score: 96, evidence: [] as string[] };
  const scores: number[] = [];
  const evidence: string[] = [];
  for (const gain of gains) {
    if (gain === 'CONFIRM') scores.push(92);
    else if (gain === 'REDUCE_UNCERTAINTY') {
      scores.push(questionValueScore);
      if (questionValueScore < 78) evidence.push('LOW_VALUE_UNCERTAINTY_REDUCTION');
    } else if (gain === 'ADD_GENERAL_GUIDANCE') {
      const generalGuidance = observed.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.observation === 'OBSERVED');
      if (generalGuidance) scores.push(Math.max(55, currentTurnValueScore));
      else {
        scores.push(58);
        evidence.push('EXPECTED_GENERAL_GUIDANCE_NOT_OBSERVED');
      }
    } else if (gain === 'ADD_GROUNDED_INFORMATION') {
      if (knowledge.status === 'OBSERVED_WITH_GROUNDING') scores.push(100);
      else if (knowledge.status === 'AVAILABLE_NOT_OBSERVED') {
        scores.push(44);
        evidence.push('EXPECTED_GROUNDED_INFORMATION_NOT_OBSERVED');
      } else {
        scores.push(60);
        evidence.push('EXPECTED_GROUNDED_INFORMATION_UNAVAILABLE_OR_UNCERTAIN');
      }
    } else if (gain === 'ADVANCE_REQUIRED_TASK') {
      const advanced = observed.some((item) => ['REQUEST_REQUIRED_SLOT', 'EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF'].includes(item.type));
      scores.push(advanced ? 98 : 62);
      if (!advanced) evidence.push('REQUIRED_TASK_INFORMATION_GAIN_NOT_OBSERVED');
    } else if (gain === 'ANSWER_CURRENT_FOCUS') {
      const directAnswer = observed.some((item) => item.type === 'DIRECT_ANSWER' && item.observation === 'OBSERVED');
      const score = directAnswer
        ? Math.min(currentTurnValueScore, crossTurnInformationGainScore)
        : Math.min(62, currentTurnValueScore);
      scores.push(score);
      if (!directAnswer) evidence.push('CURRENT_FOCUS_DIRECT_ANSWER_NOT_OBSERVED');
      if (crossTurnInformationGainScore < 78) evidence.push('CURRENT_FOCUS_INFORMATION_DELTA_WEAK');
    }
  }
  return { score: Math.round(scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length)), evidence };
}

function evaluateCrossTurnInformationGain(input: {
  plan: CustomerServiceInteractionPlanV2;
  reply: string;
  recentConversation: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
}) {
  const obligation = input.plan.answerObligation;
  if (!obligation?.avoidRepeat && !obligation?.mustAddNewInformation) return { score: 96, evidence: [] as string[] };
  const previous = [...input.recentConversation]
    .reverse()
    .find((item) => item.role === 'ASSISTANT' && String(item.content || '').trim());
  if (!previous) return { score: 82, evidence: ['CROSS_TURN_PRIOR_ASSISTANT_NOT_AVAILABLE'] };
  const prior = normalizeSemanticText(previous.content);
  const current = normalizeSemanticText(input.reply);
  if (!prior || !current) return { score: 60, evidence: ['CROSS_TURN_INFORMATION_GAIN_NOT_OBSERVABLE'] };
  const similarity = ngramSimilarity(prior, current, 2);
  const priorTerms = meaningfulTerms(previous.content);
  const currentTerms = meaningfulTerms(input.reply);
  const novelTerms = currentTerms.filter((term) => !priorTerms.some((priorTerm) => priorTerm.includes(term) || term.includes(priorTerm)));
  const noveltyRatio = currentTerms.length ? novelTerms.length / currentTerms.length : 0;
  if ((similarity >= 0.72 && noveltyRatio < 0.28) || (similarity >= 0.85 && noveltyRatio < 0.35)) {
    return { score: 28, evidence: [`CROSS_TURN_PARAPHRASE_LOOP:${similarity.toFixed(2)}`, 'NO_MEANINGFUL_INFORMATION_GAIN'] };
  }
  if (similarity >= 0.56 && noveltyRatio < 0.35) {
    return { score: 52, evidence: [`CROSS_TURN_LOW_INFORMATION_DELTA:${similarity.toFixed(2)}`, `NOVELTY_RATIO:${noveltyRatio.toFixed(2)}`] };
  }
  if (noveltyRatio >= 0.42 || similarity < 0.42) {
    return { score: 96, evidence: ['CROSS_TURN_MEANINGFUL_INFORMATION_GAIN'] };
  }
  return { score: 82, evidence: [`CROSS_TURN_INFORMATION_GAIN_PRESENT:${noveltyRatio.toFixed(2)}`] };
}

function normalizeSemanticText(value: string) {
  return String(value || '').toLowerCase().replace(/[\s，。！？!?；;、,.:：()（）\-_/]/gu, '');
}

function ngramSimilarity(left: string, right: string, size: number) {
  const grams = (value: string) => {
    const result = new Set<string>();
    if (value.length <= size) { if (value) result.add(value); return result; }
    for (let index = 0; index <= value.length - size; index += 1) result.add(value.slice(index, index + size));
    return result;
  };
  const a = grams(left);
  const b = grams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / Math.max(1, Math.min(a.size, b.size));
}

function evaluateRedundantParaphrase(input: {
  customer: string;
  reply: string;
  genericTruisms: string[];
  observed: CustomerServiceObservedAct[];
  interactionType: CustomerServiceInteractionPlanV2['interactionType'];
}) {
  if (['SOCIAL_GREETING', 'ROLE_CONFIRMATION', 'AI_IDENTITY_QUERY', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(input.interactionType)) {
    return { score: 96, evidence: [] as string[] };
  }
  if (input.reply.length <= 12) return { score: 96, evidence: [] as string[] };
  const terms = meaningfulTerms(input.customer);
  if (!terms.length) return { score: 90, evidence: [] as string[] };
  const groundedSpans = input.observed
    .filter((item) => item.groundingRefs.length > 0)
    .flatMap((item) => item.spans.map((span) => span.text));
  const echoClauses = splitSemanticClauses(input.reply).filter((clause) => {
    if (/[?？]/.test(clause)) return false;
    if (groundedSpans.some((span) => span && clause.includes(span))) return false;
    const matches = terms.filter((term) => clause.includes(term));
    return matches.length >= 2 || (matches.length >= 1 && input.genericTruisms.some((truism) => clause.includes(truism)));
  });
  const penalty = echoClauses.length * 28 + (echoClauses.length && input.genericTruisms.length ? 14 : 0);
  return {
    score: clamp(100 - penalty),
    evidence: echoClauses.slice(0, 5).map((clause) => `ECHO_CLAUSE:${clause.slice(0, 80)}`),
  };
}

function evaluateContextSpecificity(
  plan: CustomerServiceInteractionPlanV2,
  customer: string,
  reply: string,
  knowledge: CustomerServiceSemanticValueSummary['knowledgeUtilization'],
  redundantParaphraseScore: number,
) {
  if (['SOCIAL_GREETING', 'ROLE_CONFIRMATION', 'AI_IDENTITY_QUERY', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(plan.interactionType)) {
    return { score: 96, evidence: [] as string[] };
  }
  if (knowledge.status === 'OBSERVED_WITH_GROUNDING') return { score: 100, evidence: ['GROUNDED_CONTEXT_USED'] };
  const parameterTargets = plan.acts.flatMap((item) => [item.parameters?.target, ...(item.parameters?.missing || [])]).filter(Boolean) as string[];
  const targetAlignment = semanticTextAlignment(reply, parameterTargets);
  const customerAlignment = semanticTextAlignment(reply, meaningfulTerms(customer));
  if (targetAlignment >= 0.38) return { score: 94, evidence: ['PLAN_TARGET_SPECIFICITY'] };
  if (customerAlignment >= 0.35 && redundantParaphraseScore >= 78) return { score: 90, evidence: ['CUSTOMER_CONTEXT_USED_WITHOUT_REDUNDANT_ECHO'] };
  if (customerAlignment >= 0.35) return { score: 72, evidence: ['CUSTOMER_CONTEXT_USED_BUT_MOSTLY_ECHOED'] };
  return { score: 64, evidence: ['LOW_CONTEXT_SPECIFICITY'] };
}


function evaluateCurrentTurnValue(input: {
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  customer: string;
  reply: string;
  genericTruisms: string[];
  knowledge: CustomerServiceSemanticValueSummary['knowledgeUtilization'];
  crossTurnInformationGainScore: number;
}) {
  const expected = uniqueInformationGains(input.plan.acts);
  const expectsGeneral = expected.includes('ADD_GENERAL_GUIDANCE');
  const expectsGrounded = input.knowledge.expectedByActs.length > 0;
  const expectsTask = expected.includes('ADVANCE_REQUIRED_TASK');
  const expectsAnswer = expected.includes('ANSWER_CURRENT_FOCUS');
  if (!expectsGeneral && !expectsGrounded && !expectsTask && !expectsAnswer) return { score: 95, evidence: [] as string[] };

  if (expectsGrounded) {
    if (input.knowledge.status === 'OBSERVED_WITH_GROUNDING') return { score: 100, evidence: ['CURRENT_TURN_GROUNDED_VALUE_USED'] };
    if (input.knowledge.status === 'AVAILABLE_NOT_OBSERVED') return { score: 44, evidence: ['CURRENT_TURN_GROUNDED_VALUE_MISSED'] };
  }

  if (expectsAnswer) {
    const directAnswer = input.observed.some((item) => item.type === 'DIRECT_ANSWER' && item.observation === 'OBSERVED');
    if (!directAnswer) return { score: 52, evidence: ['CURRENT_FOCUS_DIRECT_ANSWER_MISSING'] };
    if (input.plan.answerObligation?.mustAddNewInformation && input.crossTurnInformationGainScore < 78) {
      return { score: Math.min(64, input.crossTurnInformationGainScore), evidence: ['CURRENT_FOCUS_REPEATS_PRIOR_ANSWER_WITHOUT_REQUIRED_DELTA'] };
    }
    return { score: 96, evidence: [input.plan.answerObligation?.mustAddNewInformation ? 'CURRENT_FOCUS_NEW_INFORMATION_OBSERVED' : 'CURRENT_FOCUS_DIRECT_ANSWER_OBSERVED'] };
  }

  if (expectsTask) {
    const advanced = input.observed.some((item) => ['REQUEST_REQUIRED_SLOT', 'EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF'].includes(item.type));
    if (advanced) return { score: 98, evidence: ['CURRENT_TURN_TASK_PROGRESS'] };
  }
  if (!expectsGeneral) return { score: 72, evidence: ['CURRENT_TURN_EXPECTED_VALUE_NOT_OBSERVED'] };

  const guidance = input.observed.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.observation === 'OBSERVED');
  if (!guidance) return { score: 46, evidence: ['CURRENT_TURN_GENERAL_GUIDANCE_MISSING'] };
  const valueText = guidance.spans.map((span) => span.text).join(' ').trim();
  if (!valueText) return { score: 58, evidence: ['CURRENT_TURN_GENERAL_GUIDANCE_UNSCOPED'] };
  const processNarration = /(?:(?:我|这边)?(?:先|再)?(?:帮你|给你)?(?:往.{0,12})?(?:理一理|梳理(?:一下)?|捋一捋|分析(?:一下)?|判断(?:一下)?|整理(?:一下)?)(?:方向|思路)?)/u.test(valueText);
  if (processNarration) return { score: 48, evidence: ['SERVICE_PROCESS_NARRATION_INSTEAD_OF_VALUE'] };
  const hasDirectionalContribution = hasDecisionDirectionalSignal(valueText);
  const lowActionableJudgement = !hasDirectionalContribution
    && /(?:日常|实用|方便|省心|百搭|好搭|耐用|舒服|不错|合适|适合)/u.test(valueText);
  if (lowActionableJudgement) return { score: 58, evidence: ['LOW_ACTIONABLE_GENERAL_JUDGEMENT'] };
  if (input.genericTruisms.some((item) => valueText.includes(item)) && !hasDirectionalContribution) {
    return { score: 64, evidence: ['GENERAL_GUIDANCE_MOSTLY_TRUISM'] };
  }
  const known = uniqueStrings(input.plan.acts.flatMap((item) => item.parameters?.known || []));
  const customerAlignment = semanticTextAlignment(valueText, meaningfulTerms(input.customer));
  const knownAlignment = semanticTextAlignment(valueText, known);
  if (hasDirectionalContribution && (customerAlignment >= 0.12 || knownAlignment >= 0.12)) {
    return { score: 100, evidence: ['GENERAL_GUIDANCE_CONTRIBUTES_FROM_CURRENT_CONTEXT'] };
  }
  if (hasDirectionalContribution) return { score: 90, evidence: ['GENERAL_GUIDANCE_ACTIONABLE_DIRECTION'] };
  return { score: 76, evidence: ['GENERAL_GUIDANCE_PRESENT_BUT_VALUE_WEAK'] };
}

function hasDecisionDirectionalSignal(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /(?:建议|优先|可以(?:先|从|往|考虑|选择|看|试|把|用)|先(?:从|看|考虑|选择|确定)|从.{0,16}(?:入手|开始|看|选|考虑)|往.{0,16}(?:方向|看|选)|考虑.{0,16}(?:方向|因素|条件)|重点(?:看|关注|考虑)|关键(?:是|在于)|注意|避免|如果.{0,24}(?:可以|建议|优先|更适合)|相比.{0,20}(?:更|会)|更适合|更利于|会让|能让|取决于|区别在)/u.test(text);
}

function hasExpectedContributionDeficit(
  plan: CustomerServiceInteractionPlanV2,
  contribution: { kind: CustomerServiceDecisionContributionKind; score: number },
) {
  const gains = uniqueInformationGains(plan.acts);
  if (gains.includes('ADD_GENERAL_GUIDANCE')) return contribution.kind !== 'USEFUL_DIRECTION' || contribution.score < 88;
  if (plan.acts.some((item) => getCustomerServiceActDescriptor(item.type).authorityScope === 'GROUNDED_BUSINESS')) return contribution.kind !== 'GROUNDED_FACT' || contribution.score < 88;
  if (gains.includes('ADVANCE_REQUIRED_TASK')) return contribution.kind !== 'TASK_ADVANCE' || contribution.score < 88;
  return false;
}

function evaluateDecisionContribution(input: {
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  currentTurnValueScore: number;
  questionValueScore: number;
  knowledge: CustomerServiceSemanticValueSummary['knowledgeUtilization'];
}): { kind: CustomerServiceDecisionContributionKind; score: number; evidence: string[] } {
  if (['SOCIAL_GREETING', 'ROLE_CONFIRMATION', 'AI_IDENTITY_QUERY', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(input.plan.interactionType)) {
    return { kind: 'NONE', score: 96, evidence: ['DECISION_CONTRIBUTION_NOT_REQUIRED_FOR_INTERACTION'] };
  }
  const observedType = (type: string) => input.observed.some((item) => item.type === type && item.observation === 'OBSERVED');
  if (input.knowledge.status === 'OBSERVED_WITH_GROUNDING' && input.observed.some((item) => ['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(item.type) && item.observation === 'OBSERVED')) {
    return { kind: 'GROUNDED_FACT', score: 100, evidence: ['DECISION_CONTRIBUTION_GROUNDED_FACT'] };
  }
  if (input.observed.some((item) => ['EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF', 'REQUEST_REQUIRED_SLOT'].includes(item.type) && item.observation === 'OBSERVED')) {
    return { kind: 'TASK_ADVANCE', score: 100, evidence: ['DECISION_CONTRIBUTION_TASK_ADVANCE'] };
  }
  const expectsGeneral = uniqueInformationGains(input.plan.acts).includes('ADD_GENERAL_GUIDANCE')
    || input.plan.acts.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE');
  const guidanceObserved = observedType('PROVIDE_GENERAL_GUIDANCE');
  const optionalQuestionObserved = observedType('REQUEST_OPTIONAL_PREFERENCE');
  if (guidanceObserved && input.currentTurnValueScore >= 88) {
    return { kind: 'USEFUL_DIRECTION', score: 100, evidence: ['DECISION_CONTRIBUTION_USEFUL_DIRECTION'] };
  }
  if (guidanceObserved && input.currentTurnValueScore < 72) {
    return { kind: 'REFRAME_ONLY', score: 48, evidence: ['GENERAL_GUIDANCE_REFRAMES_WITHOUT_DECISION_VALUE'] };
  }
  if (optionalQuestionObserved && input.questionValueScore >= 88) {
    const score = expectsGeneral && input.currentTurnValueScore < 88 ? 68 : 90;
    return {
      kind: 'DECISION_REDUCTION',
      score,
      evidence: [score < 82 ? 'QUESTION_REDUCES_UNCERTAINTY_BUT_EXPECTED_VALUE_IS_WEAK' : 'DECISION_CONTRIBUTION_REDUCES_UNCERTAINTY'],
    };
  }
  if (guidanceObserved) return { kind: 'REFRAME_ONLY', score: 66, evidence: ['GENERAL_GUIDANCE_PRESENT_WITH_LIMITED_DECISION_VALUE'] };
  if (expectsGeneral) return { kind: 'NONE', score: 42, evidence: ['EXPECTED_DECISION_CONTRIBUTION_NOT_OBSERVED'] };
  return { kind: 'NONE', score: 88, evidence: ['NO_EXPLICIT_DECISION_CONTRIBUTION_REQUIRED'] };
}

function evaluateServiceEntryValue(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
) {
  if (!['SOCIAL_GREETING', 'ROLE_CONFIRMATION'].includes(plan.interactionType)) {
    return { score: 96, evidence: [] as string[] };
  }
  const invitation = plan.acts.find((item) => item.type === 'OPEN_SERVICE_INVITATION');
  if (!invitation) return { score: 96, evidence: [] as string[] };
  const used = observed.some((item) => item.type === 'OPEN_SERVICE_INVITATION' && item.observation === 'OBSERVED');
  const prefix = plan.interactionType === 'ROLE_CONFIRMATION' ? 'ROLE_CONFIRMATION' : 'OPENING';
  if (used) return { score: 100, evidence: [`${prefix}_CONTRIBUTES_SERVICE_ENTRY`] };
  if (invitation.necessity === 'REQUIRED') return { score: 20, evidence: [`REQUIRED_${prefix}_SERVICE_ENTRY_VALUE_MISSING`] };
  return invitation.necessity === 'PREFERRED'
    ? { score: 48, evidence: [`PREFERRED_${prefix}_SERVICE_ENTRY_VALUE_MISSING`] }
    : { score: 84, evidence: [`OPTIONAL_${prefix}_SERVICE_ENTRY_NOT_USED`] };
}

function evaluateIdentitySurfaceQuality(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
  text: string,
  projection: CustomerServicePublicIdentityProjection | null,
) {
  if (!['ROLE_CONFIRMATION', 'NAME_QUERY', 'AI_IDENTITY_QUERY', 'SERVICE_SCOPE_QUERY'].includes(plan.interactionType)) {
    return { score: 96, evidence: [] as string[] };
  }
  if (plan.interactionType !== 'ROLE_CONFIRMATION') return { score: text.length <= 88 ? 96 : 76, evidence: text.length <= 88 ? [] : ['IDENTITY_SURFACE_TOO_EXPANDED'] };
  const roleAct = plan.acts.find((item) => item.type === 'CONFIRM_ROLE');
  const roleObserved = observed.some((item) => item.type === 'CONFIRM_ROLE' && item.observation === 'OBSERVED');
  if (!roleObserved) return { score: 45, evidence: ['ROLE_RELATION_NOT_CONFIRMED'] };
  const leakedInternal = findExposedInternalIdentity(text, projection);
  if (leakedInternal.length) {
    return { score: 30, evidence: ['INTERNAL_ROLE_IDENTITY_EXPOSED', ...leakedInternal.slice(0, 3).map((item) => `WITHHELD:${item}`)] };
  }
  const knownIdentity = projection?.allowedSurfaceLabels?.length
    ? projection.allowedSurfaceLabels
    : roleAct?.parameters?.known || [];
  const bound = hasBoundIdentitySurface(text, knownIdentity);
  const descriptorTokens = matchAll(text, /(?:客服顾问|服务顾问|客服|顾问|导购|店员|售后|商家|店铺|官方账号|账号|服务)/gu);
  const descriptorStack = descriptorTokens.length >= 3 || /(?:客服.{0,4}顾问|顾问.{0,4}客服)/u.test(text);
  if (descriptorStack) return { score: bound ? 54 : 44, evidence: ['IDENTITY_DESCRIPTOR_STACK', ...descriptorTokens.slice(0, 4)] };
  if (!bound) return { score: text.length <= 36 ? 72 : 60, evidence: ['IDENTITY_RELATION_GENERIC_WITHOUT_BOUND_SURFACE'] };
  const plannedInvitation = plan.acts.some((item) => item.type === 'OPEN_SERVICE_INVITATION');
  const observedInvitation = observed.some((item) => item.type === 'OPEN_SERVICE_INVITATION' && item.observation === 'OBSERVED');
  if (plannedInvitation && observedInvitation) {
    if (text.length <= 64) return { score: 100, evidence: ['IDENTITY_BOUND_SURFACE_WITH_PLANNED_FOLLOW_UP'] };
    if (text.length <= 78) return { score: 86, evidence: ['IDENTITY_PLANNED_FOLLOW_UP_ACCEPTABLE'] };
    return { score: 68, evidence: ['IDENTITY_PLANNED_FOLLOW_UP_OVEREXPANDED'] };
  }
  if (text.length <= 30) return { score: 100, evidence: ['IDENTITY_MINIMAL_BOUND_SURFACE'] };
  if (text.length <= 44) return { score: 88, evidence: ['IDENTITY_BOUND_SURFACE_ACCEPTABLE'] };
  return { score: 70, evidence: ['IDENTITY_BOUND_SURFACE_OVEREXPANDED'] };
}

function evaluatePreferenceUsage(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
  text: string,
  currentTurnValueScore: number,
) {
  const preferenceRelevant = plan.acts.some((item) => item.type === 'ACKNOWLEDGE_PREFERENCE')
    || ['PRODUCT_DISCOVERY', 'PRODUCT_DISCOVERY_NO_GROUNDING'].includes(plan.interactionType);
  if (!preferenceRelevant) return { score: 96, evidence: [] as string[] };
  const known = uniqueStrings(plan.acts.flatMap((item) => item.parameters?.known || []));
  if (!known.length) return { score: 90, evidence: ['NO_STRUCTURED_PREFERENCE_TO_CONSUME'] };
  const alignment = semanticTextAlignment(text, known);
  const hasSubstantiveValue = observed.some((item) => ['PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'DIRECT_ANSWER'].includes(item.type) && item.observation === 'OBSERVED');
  const asksOptional = observed.some((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE' && item.observation === 'OBSERVED');
  if (alignment >= 0.28 && hasSubstantiveValue && currentTurnValueScore >= 82) return { score: 100, evidence: ['KNOWN_PREFERENCE_USED_TO_SHAPE_VALUE'] };
  if (alignment >= 0.28 && currentTurnValueScore < 72) return { score: 58, evidence: ['KNOWN_PREFERENCE_ECHOED_WITHOUT_VALUE'] };
  if (alignment < 0.16 && (hasSubstantiveValue || asksOptional)) return { score: 74, evidence: ['KNOWN_PREFERENCE_NOT_VISIBLY_CONSUMED'] };
  if (alignment >= 0.16) return { score: 86, evidence: ['KNOWN_PREFERENCE_ACKNOWLEDGED'] };
  return { score: 80, evidence: ['PREFERENCE_USAGE_UNCERTAIN'] };
}


function evaluateServicePosture(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
  text: string,
) {
  const observedType = (type: string) => observed.some((item) => item.type === type && item.observation === 'OBSERVED');
  if (plan.interactionType === 'SOCIAL_GREETING') {
    if (!observedType('PRESENCE_ACK')) return { score: 45, evidence: ['OPENING_PRESENCE_NOT_OBSERVED'] };
    const invitation = plan.acts.find((item) => item.type === 'OPEN_SERVICE_INVITATION');
    if (!invitation) return { score: text.length <= 48 ? 96 : 82, evidence: text.length <= 48 ? [] : ['OPENING_ACK_OVEREXPANDED'] };
    if (observedType('OPEN_SERVICE_INVITATION')) {
      return { score: text.length <= 60 ? 98 : 84, evidence: text.length <= 60 ? ['OPENING_SERVICE_ENTRY_USED'] : ['OPENING_SERVICE_ENTRY_OVEREXPANDED'] };
    }
    if (invitation.necessity === 'REQUIRED') return { score: 30, evidence: ['REQUIRED_OPENING_SERVICE_ENTRY_NOT_USED'] };
    return invitation.necessity === 'PREFERRED'
      ? { score: 70, evidence: ['PREFERRED_OPENING_SERVICE_ENTRY_NOT_USED'] }
      : { score: 84, evidence: ['OPTIONAL_OPENING_SERVICE_ENTRY_NOT_USED'] };
  }

  if (plan.interactionType === 'ROLE_CONFIRMATION') {
    if (!observedType('CONFIRM_ROLE')) return { score: 48, evidence: ['ROLE_CONFIRMATION_NOT_OBSERVED'] };
    const roleAct = plan.acts.find((item) => item.type === 'CONFIRM_ROLE');
    const knownIdentity = roleAct?.parameters?.known || [];
    const usesBoundIdentitySurface = hasBoundIdentitySurface(text, knownIdentity);
    const invitation = plan.acts.find((item) => item.type === 'OPEN_SERVICE_INVITATION');
    const invitationObserved = observedType('OPEN_SERVICE_INVITATION');
    if (invitation) {
      if (usesBoundIdentitySurface && invitationObserved && text.length <= 64) {
        return { score: 100, evidence: ['ROLE_CONFIRMATION_BOUND_IDENTITY_WITH_PLANNED_SERVICE_ENTRY'] };
      }
      if (usesBoundIdentitySurface && invitationObserved) {
        return { score: 86, evidence: ['ROLE_CONFIRMATION_PLANNED_SERVICE_ENTRY_OVEREXPANDED'] };
      }
      if (!invitationObserved && invitation.necessity === 'REQUIRED') {
        return { score: usesBoundIdentitySurface ? 34 : 24, evidence: ['REQUIRED_ROLE_CONFIRMATION_SERVICE_ENTRY_NOT_USED'] };
      }
      if (!invitationObserved && invitation.necessity === 'PREFERRED') {
        return { score: usesBoundIdentitySurface ? 68 : 56, evidence: ['PREFERRED_ROLE_CONFIRMATION_SERVICE_ENTRY_NOT_USED'] };
      }
      return { score: usesBoundIdentitySurface ? 82 : 68, evidence: ['OPTIONAL_ROLE_CONFIRMATION_SERVICE_ENTRY_NOT_USED'] };
    }
    if (usesBoundIdentitySurface && text.length <= 42) return { score: 98, evidence: ['ROLE_CONFIRMATION_USES_BOUND_IDENTITY_SURFACE'] };
    if (usesBoundIdentitySurface) return { score: 86, evidence: ['ROLE_CONFIRMATION_GROUNDED_BUT_EXPANDED'] };
    if (text.length <= 42) return { score: 74, evidence: ['ROLE_CONFIRMATION_GENERIC_RELATION_ONLY'] };
    return { score: 62, evidence: ['ROLE_CONFIRMATION_GENERIC_AND_EXPANDED'] };
  }

  if (['AI_IDENTITY_QUERY', 'NAME_QUERY', 'SERVICE_SCOPE_QUERY'].includes(plan.interactionType)) {
    return { score: text.length <= 88 ? 96 : 76, evidence: text.length <= 88 ? [] : ['IDENTITY_SURFACE_OVEREXPANDED'] };
  }
  return { score: 94, evidence: [] as string[] };
}

function evaluateConversationalFlow(
  plan: CustomerServiceInteractionPlanV2,
  observed: CustomerServiceObservedAct[],
  text: string,
) {
  const optional = plan.acts.find((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE');
  const required = plan.acts.find((item) => item.type === 'REQUEST_REQUIRED_SLOT');
  const observedOptional = observed.find((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE' && item.observation === 'OBSERVED');
  const observedRequired = observed.find((item) => item.type === 'REQUEST_REQUIRED_SLOT' && item.observation === 'OBSERVED');
  const questionMarks = (text.match(/[?？]/g) || []).length;
  if (questionMarks > 1) return { score: 42, evidence: [`MULTIPLE_QUESTION_BEATS:${questionMarks}`] };
  if (required && observedRequired) return { score: 96, evidence: ['REQUIRED_QUESTION_DIRECT_FLOW'] };
  if (!optional || !observedOptional) return { score: 94, evidence: [] as string[] };

  const questionStart = firstObservedStart(observedOptional);
  const questionText = observedOptional.spans.map((span) => span.text).join(' ');
  const valueTypes = new Set(['PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'DIRECT_ANSWER', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP']);
  const plannedValue = plan.acts.some((item) => valueTypes.has(item.type));
  const valueEnds = observed
    .filter((item) => valueTypes.has(item.type) && item.observation === 'OBSERVED')
    .flatMap((item) => item.spans.map((span) => span.end));
  const lastValueEnd = valueEnds.length ? Math.max(...valueEnds) : null;
  if (plannedValue && lastValueEnd === null) {
    return { score: 54, evidence: ['OPTIONAL_QUESTION_WITHOUT_PLANNED_VALUE'] };
  }
  if (plannedValue && lastValueEnd !== null && questionStart !== null && questionStart < lastValueEnd) {
    return { score: 64, evidence: ['OPTIONAL_QUESTION_LEADS_BEFORE_CURRENT_VALUE'] };
  }
  if (questionText.length > 42) return { score: 72, evidence: ['OPTIONAL_QUESTION_TOO_HEAVY'] };
  if (plannedValue && lastValueEnd !== null && questionStart !== null && questionStart >= lastValueEnd) {
    return { score: 98, evidence: ['VALUE_BEFORE_OPTIONAL_QUESTION'] };
  }
  return { score: 86, evidence: ['OPTIONAL_QUESTION_DECISION_RELEVANT_FLOW'] };
}

function firstObservedStart(value: CustomerServiceObservedAct | undefined) {
  if (!value?.spans.length) return null;
  return Math.min(...value.spans.map((item) => item.start));
}

function hasBoundIdentitySurface(text: string, values: string[]) {
  const compactText = String(text || '').replace(/[\s，。！？!?；;、,.]/g, '');
  const genericRole = /(?:智能客服|AI客服|客服|售后|顾问|导购|店员|商家服务|商家|店铺|官方账号|官方)/gi;
  for (const value of uniqueStrings(values)) {
    const core = value.replace(/[\s，。！？!?；;、,.]/g, '').replace(genericRole, '').trim();
    if ([...core].length >= 2 && compactText.includes(core)) return true;
  }
  return false;
}

function findExposedInternalIdentity(text: string, projection: CustomerServicePublicIdentityProjection | null) {
  if (!projection?.withheldInternalLabels?.length) return [] as string[];
  const compactText = compactIdentity(text);
  const allowed = new Set((projection.allowedSurfaceLabels || []).map(compactIdentity).filter(Boolean));
  return projection.withheldInternalLabels.filter((value) => {
    const candidate = compactIdentity(value);
    return candidate.length >= 3 && !allowed.has(candidate) && compactText.includes(candidate);
  });
}

function compactIdentity(value: unknown) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s，。！？!?；;、,.()（）【】\[\]“”"']/g, '');
}


function evaluateMultiTurnRhythm(input: {
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  text: string;
  behaviorHistory: CustomerServiceBehaviorHistoryProjection | null;
  redundantParaphraseScore: number;
  crossTurnInformationGainScore: number;
}) {
  const history = input.behaviorHistory;
  if (!history || history.windowSize <= 0) return { score: 96, evidence: [] as string[] };

  let score = 100;
  const evidence: string[] = [];
  if (input.crossTurnInformationGainScore < 55) {
    score -= 34;
    evidence.push('CROSS_TURN_PARAPHRASE_LOOP');
  }
  const currentPattern = buildCurrentMultiTurnPattern(input.observed, input.text);
  const recentPatterns = (history.recentStructureKeys || [])
    .slice(-3)
    .map(normalizeMultiTurnPatternKey)
    .filter(Boolean);
  const lastPattern = recentPatterns.at(-1) || '';
  const sameAsLast = Boolean(currentPattern && lastPattern && currentPattern === lastPattern);
  const sameRecentCount = currentPattern
    ? recentPatterns.filter((item) => item === currentPattern).length
    : 0;
  const optionalQuestionObserved = input.observed.some((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE' && item.observation === 'OBSERVED');
  const requiredQuestionObserved = input.observed.some((item) => item.type === 'REQUEST_REQUIRED_SLOT' && item.observation === 'OBSERVED');

  // Multi-turn rhythm is Soft Humanity only. A REQUIRED business question must not
  // lose authority merely because recent turns share the same coarse structure.
  if (!requiredQuestionObserved && sameRecentCount >= 2) {
    score -= 28;
    evidence.push(`REPEATED_MULTI_TURN_PATTERN:${currentPattern}`);
  } else if (!requiredQuestionObserved && sameAsLast) {
    score -= 12;
    evidence.push(`SAME_AS_PREVIOUS_PATTERN:${currentPattern}`);
  }

  const questionEnding = /[?？]\s*$/.test(input.text.trim());
  if (!requiredQuestionObserved && optionalQuestionObserved) {
    if (history.consecutiveQuestionEndingTurns >= 2) {
      score -= 38;
      evidence.push('OPTIONAL_QUESTION_EXTENDS_QUESTION_STREAK');
    } else if (history.lastAssistantAskedQuestion && history.recentOptionalQuestionCount >= 2) {
      score -= 22;
      evidence.push('OPTIONAL_QUESTION_REPEATED_RECENTLY');
    } else if (history.lastAssistantAskedQuestion) {
      score -= 10;
      evidence.push('BACK_TO_BACK_OPTIONAL_QUESTION');
    }
    if (questionEnding && history.consecutiveQuestionEndingTurns >= 1) {
      score -= 10;
      evidence.push('REPEATED_QUESTION_ENDING');
    }
  }

  if (history.recentRestatementCount >= 1 && input.redundantParaphraseScore < 80) {
    score -= 24;
    evidence.push('RECENT_RESTATEMENT_PATTERN_REPEATED');
  }

  return { score: clamp(score), evidence: evidence.slice(0, 8) };
}

function buildCurrentMultiTurnPattern(observed: CustomerServiceObservedAct[], text: string) {
  const types = new Set(observed.filter((item) => item.observation === 'OBSERVED').map((item) => item.type));
  const tokens: string[] = [];
  const add = (value: string) => { if (!tokens.includes(value)) tokens.push(value); };
  if ([...types].some((type) => ['DISCLOSE_AI_IDENTITY', 'DISCLOSE_PUBLIC_IDENTITY', 'DISCLOSE_NAME', 'CONFIRM_ROLE', 'EXPLAIN_SERVICE_SCOPE'].includes(type))) add('IDENTITY');
  if ([...types].some((type) => ['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE'].includes(type))) add('ACK');
  if ([...types].some((type) => ['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP'].includes(type))) add('VALUE');
  if ([...types].some((type) => ['SALES_CTA', 'BUSINESS_ADVANCE'].includes(type))) add('CTA');
  if ([...types].some((type) => ['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY', 'OPEN_SERVICE_INVITATION'].includes(type)) || /[?？]\s*$/.test(text.trim())) add('QUESTION');
  if (types.has('STOP')) add('CLOSE');
  if (!tokens.length) add('DIRECT');
  return tokens.join('+');
}

function normalizeMultiTurnPatternKey(value: string) {
  const tokens = String(value || '').split('+').map((item) => item.trim().toUpperCase()).filter(Boolean);
  const normalized: string[] = [];
  const add = (value: string) => { if (!normalized.includes(value)) normalized.push(value); };
  for (const token of tokens) {
    if (['IDENTITY', 'SCOPE'].includes(token)) add('IDENTITY');
    else if (['ACK', 'RESTATE'].includes(token)) add('ACK');
    else if (['ANSWER', 'SUGGEST', 'BRIDGE', 'DIRECT', 'VALUE'].includes(token)) add('VALUE');
    else if (token === 'CTA') add('CTA');
    else if (token === 'QUESTION') add('QUESTION');
    else if (['CLOSE', 'STOP'].includes(token)) add('CLOSE');
  }
  return normalized.join('+');
}


function evaluateCrossFamilyVoice(input: {
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  text: string;
}) {
  const profile = resolveCustomerServiceHveFamilyRealization(input.plan);
  if (profile.family === 'GENERAL') return { score: 96, evidence: [] as string[] };

  let score = 100;
  const evidence: string[] = [];
  const observed = (type: string) => input.observed.find((item) => item.type === type && item.observation === 'OBSERVED');
  const planned = (type: string) => input.plan.acts.find((item) => item.type === type);
  const observedNonRequired = (type: string) => Boolean(observed(type) && planned(type)?.necessity !== 'REQUIRED');
  const firstStart = (types: string[]) => {
    const starts = input.observed
      .filter((item) => types.includes(item.type) && item.observation === 'OBSERVED')
      .flatMap((item) => item.spans.map((span) => span.start));
    return starts.length ? Math.min(...starts) : null;
  };
  const expressive = styleSignals(input.text).expressive;
  const performativeEmpathy = matchAll(
    input.text,
    /(?:真的特别能理解|太能理解(?:你|了)?|完全理解你的感受|抱抱你|别难过|别生气|一定会没事|请您放心|感谢您的理解|深感抱歉)/giu,
  );

  const salesDrift = ['SALES_CTA', 'BUSINESS_ADVANCE', 'OPEN_SERVICE_INVITATION'].filter(observedNonRequired);
  if (profile.avoidSalesSteering && salesDrift.length) {
    score -= Math.min(45, salesDrift.length * 24);
    evidence.push(...salesDrift.map((type) => `FAMILY_SALES_STEERING:${type}`));
  }

  if (profile.family === 'CASUAL') {
    if (input.text.length > 88) {
      score -= 18;
      evidence.push('CASUAL_REPLY_OVEREXPANDED');
    }
    if (observedNonRequired('REQUEST_OPTIONAL_PREFERENCE')) {
      score -= 10;
      evidence.push('CASUAL_OPTIONAL_QUESTION_OVERSTEERS');
    }
  }

  if (profile.family === 'POSITIVE_EMOTION') {
    if (planned('EMOTIONAL_ACK') && !observed('EMOTIONAL_ACK')) {
      score -= 24;
      evidence.push('POSITIVE_SHARING_NOT_ACKNOWLEDGED');
    }
    if (observedNonRequired('REQUEST_OPTIONAL_PREFERENCE')) {
      score -= 10;
      evidence.push('POSITIVE_SHARING_OPTIONAL_QUESTION_OVERSTEERS');
    }
    if (expressive >= 4) {
      score -= 18;
      evidence.push('POSITIVE_EMOTION_STYLE_OVERPERFORMED');
    }
  }

  if (profile.family === 'NEGATIVE_EMOTION') {
    const ack = observed('EMOTIONAL_ACK') || observed('LIGHT_ACK');
    if (planned('EMOTIONAL_ACK') && !ack) {
      score -= 30;
      evidence.push('NEGATIVE_DISCLOSURE_RELATION_ACK_MISSING');
    }
    const prematureAdvice = ['PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'BUSINESS_ADVANCE'].filter(observedNonRequired);
    if (profile.avoidPrematureAdvice && prematureAdvice.length) {
      score -= Math.min(40, prematureAdvice.length * 22);
      evidence.push(...prematureAdvice.map((type) => `NEGATIVE_DISCLOSURE_PREMATURE_ADVICE:${type}`));
    }
    const questionStart = firstStart(['REQUEST_OPTIONAL_PREFERENCE', 'CLARIFY_AMBIGUITY']);
    const ackStart = firstStart(['EMOTIONAL_ACK', 'LIGHT_ACK']);
    if (questionStart !== null && (ackStart === null || questionStart < ackStart)) {
      score -= 22;
      evidence.push('NEGATIVE_DISCLOSURE_QUESTION_BEFORE_RELATION_ACK');
    } else if (observedNonRequired('REQUEST_OPTIONAL_PREFERENCE')) {
      score -= 8;
      evidence.push('NEGATIVE_DISCLOSURE_OPTIONAL_QUESTION_RESTRAINED');
    }
    if (expressive >= 2) {
      score -= 16;
      evidence.push('NEGATIVE_DISCLOSURE_TONE_TOO_PLAYFUL');
    }
  }

  if (profile.family === 'COMPLAINT') {
    if (planned('ACKNOWLEDGE_PROBLEM') && !observed('ACKNOWLEDGE_PROBLEM')) {
      score -= 20;
      evidence.push('COMPLAINT_PROBLEM_ACK_MISSING');
    }
    const resolutionTypes = ['REPORT_STATUS', 'EXECUTE_SERVICE_STEP', 'REQUEST_REQUIRED_SLOT', 'REQUEST_HANDOFF', 'EXPLAIN_BOUNDARY'];
    const plannedResolution = resolutionTypes.some((type) => planned(type));
    const resolutionStart = firstStart(resolutionTypes);
    if (plannedResolution && resolutionStart === null) {
      score -= 24;
      evidence.push('COMPLAINT_RESOLUTION_VALUE_MISSING');
    } else if (resolutionStart !== null && resolutionStart > 48) {
      score -= 18;
      evidence.push('COMPLAINT_RESOLUTION_BURIED_AFTER_PREAMBLE');
    }
    if (performativeEmpathy.length) {
      score -= 16;
      evidence.push('COMPLAINT_PERFORMATIVE_EMPATHY');
    }
    if (expressive >= 2) {
      score -= 24;
      evidence.push('COMPLAINT_TONE_TOO_PLAYFUL');
    }
  }

  if (profile.family === 'LOGISTICS_AFTERSALES') {
    const taskTypes = ['REPORT_STATUS', 'EXECUTE_SERVICE_STEP', 'REQUEST_REQUIRED_SLOT', 'EXPLAIN_GROUNDED_FACT', 'EXPLAIN_BOUNDARY'];
    const plannedTask = taskTypes.some((type) => planned(type));
    const taskStart = firstStart(taskTypes);
    if (plannedTask && taskStart === null) {
      score -= 24;
      evidence.push('SERVICE_RESOLUTION_VALUE_MISSING');
    } else if (taskStart !== null && taskStart > 42) {
      score -= 18;
      evidence.push('SERVICE_RESOLUTION_BURIED_AFTER_PREAMBLE');
    }
    if (performativeEmpathy.length) {
      score -= 12;
      evidence.push('SERVICE_PERFORMATIVE_EMPATHY');
    }
    if (expressive >= 2) {
      score -= 20;
      evidence.push('SERVICE_TONE_TOO_PLAYFUL');
    }
  }

  if (profile.family === 'BOUNDARY' || profile.family === 'HANDOFF') {
    const primaryTypes = profile.family === 'HANDOFF'
      ? ['REQUEST_HANDOFF', 'EXPLAIN_BOUNDARY']
      : ['EXPLAIN_BOUNDARY', 'STOP'];
    if (primaryTypes.some((type) => planned(type)) && firstStart(primaryTypes) === null) {
      score -= 28;
      evidence.push(`${profile.family}_PRIMARY_ACT_NOT_SURFACED`);
    }
    const unnecessaryContinuation = ['REQUEST_OPTIONAL_PREFERENCE', 'PROVIDE_GENERAL_GUIDANCE', 'SALES_CTA', 'BUSINESS_ADVANCE']
      .filter(observedNonRequired);
    if (unnecessaryContinuation.length) {
      score -= Math.min(45, unnecessaryContinuation.length * 22);
      evidence.push(...unnecessaryContinuation.map((type) => `${profile.family}_UNNECESSARY_CONTINUATION:${type}`));
    }
    if (profile.preferConciseBoundary && input.text.length > 110) {
      score -= 18;
      evidence.push(`${profile.family}_OVEREXPLAINED`);
    }
    if (expressive >= 2) {
      score -= 22;
      evidence.push(`${profile.family}_TONE_TOO_PLAYFUL`);
    }
  }

  if (profile.avoidPerformativeEmpathy && performativeEmpathy.length && !['COMPLAINT', 'LOGISTICS_AFTERSALES'].includes(profile.family)) {
    score -= 14;
    evidence.push('FAMILY_PERFORMATIVE_EMPATHY');
  }

  return { score: clamp(score), evidence: uniqueStrings(evidence).slice(0, 10) };
}

function isExplicitPositiveObservedEvidence(value: string) {
  const key = String(value || '').trim();
  if (!/_OBSERVED$/u.test(key)) return false;
  return !/(?:^|_)NOT_OBSERVED$/u.test(key)
    && !/(?:^|_)NOT_POSITIVELY_OBSERVED$/u.test(key)
    && !/(?:^|_)UNCERTAIN_OBSERVED$/u.test(key);
}

function evaluatePositiveRoleEvidence(input: {
  text: string;
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  resolvedRole: CustomerServiceResolvedRoleIdentityContextV1 | null;
  speaker: CustomerServiceRoleSpeakerProjectionV1 | null;
  roleTurnManeuver: { score: number; evidence: string[] };
  roleBehaviorAlignment: { score: number; evidence: string[] };
  roleVoiceFidelity: { score: number; evidence: string[] };
  speakerContinuity: { score: number; evidence: string[] };
}): CustomerServiceRoleEvidenceSummary {
  const positiveEvidence: string[] = [];
  const missingEvidence: string[] = [];
  const resolved = input.resolvedRole;
  const speaker = input.speaker;
  // Text overlap with role/background/business configuration is diagnostic only.
  // Topic/industry words must never become sufficient role evidence by themselves.
  const configuredExpressionValues = resolved ? uniqueStrings([
    resolved.accountExpression.tone,
    resolved.accountExpression.voice,
    resolved.accountExpression.relationship,
  ]) : [];

  if (!resolved) missingEvidence.push('RESOLVED_ROLE_CONTEXT_NOT_AVAILABLE');
  if (!speaker || speaker.source === 'NEUTRAL_COMPATIBILITY') missingEvidence.push('DISTINCT_SPEAKER_PROFILE_NOT_RESOLVED');
  if (!configuredExpressionValues.length) missingEvidence.push('ROLE_EXPRESSION_CONFIGURATION_NOT_AVAILABLE');

  const maneuverEvidence = input.roleTurnManeuver.evidence.filter((item) => /REALIZED/u.test(item));
  if (maneuverEvidence.length) positiveEvidence.push(...maneuverEvidence.slice(0, 2));
  // Positive Role Evidence must be explicitly affirmative. A suffix-only check such as
  // /_OBSERVED$/ also matches *_NOT_OBSERVED and can turn a failed behavior into
  // positive persona evidence. Keep the polarity rule generic and independent of any
  // role, industry, fixture, or customer wording.
  const behaviorEvidence = input.roleBehaviorAlignment.evidence.filter(isExplicitPositiveObservedEvidence);
  if (behaviorEvidence.length) positiveEvidence.push(...behaviorEvidence.slice(0, 2));
  const voiceEvidence = input.roleVoiceFidelity.evidence.filter(isExplicitPositiveObservedEvidence);
  if (voiceEvidence.length) positiveEvidence.push(...voiceEvidence.slice(0, 2));
  const continuityEvidence = input.speakerContinuity.evidence.filter((item) => item === 'SPEAKER_CONTINUITY_OBSERVED');
  if (continuityEvidence.length) positiveEvidence.push(...continuityEvidence);

  const roleConfigTextAlignment = configuredExpressionValues.length
    ? semanticTextAlignment(input.text, configuredExpressionValues)
    : 0;
  if (roleConfigTextAlignment >= 0.35) {
    positiveEvidence.push('ROLE_CONFIG_TEXT_ALIGNMENT_LOW_STRENGTH');
  }

  const identityActs = new Set(['DISCLOSE_PUBLIC_IDENTITY', 'DISCLOSE_NAME', 'CONFIRM_ROLE', 'EXPLAIN_SERVICE_SCOPE']);
  const plannedIdentity = input.plan.acts.some((item) => identityActs.has(item.type));
  const observedIdentity = input.observed.some((item) => item.observation === 'OBSERVED' && identityActs.has(item.type));
  if (plannedIdentity && observedIdentity) positiveEvidence.push('AUTHORIZED_ROLE_IDENTITY_SURFACE_OBSERVED');

  const hasResolvedRole = Boolean(resolved && speaker && speaker.source !== 'NEUTRAL_COMPATIBILITY');
  const maneuverObserved = maneuverEvidence.length > 0;
  const behaviorObserved = behaviorEvidence.length > 0;
  const voiceObserved = voiceEvidence.length > 0;
  const continuityObserved = continuityEvidence.length > 0;
  const authorizedIdentityObserved = plannedIdentity && observedIdentity;
  const strongerDistinctivenessEvidence = maneuverObserved || continuityObserved || authorizedIdentityObserved;
  // A single polished turn cannot prove role distinctiveness merely because it is concise, warm,
  // or lexically overlaps configured background. Sufficient automatic role evidence requires
  // positive role behavior + positive voice evidence plus an actually realized maneuver, mature
  // cross-turn continuity, or an authorized identity surface. Surface stability alone is never
  // promoted to continuity evidence on the first follow-up turn.
  const status: CustomerServiceRoleEvidenceStatus = hasResolvedRole && behaviorObserved && voiceObserved && strongerDistinctivenessEvidence
    ? 'SUFFICIENT'
    : hasResolvedRole && (behaviorObserved || maneuverObserved || voiceObserved || strongerDistinctivenessEvidence)
      ? 'PARTIAL'
      : 'INSUFFICIENT_EVIDENCE';

  if (!behaviorObserved) missingEvidence.push('ROLE_BEHAVIOR_NOT_POSITIVELY_OBSERVED');
  if (!maneuverObserved) missingEvidence.push('ROLE_TURN_MANEUVER_NOT_POSITIVELY_OBSERVED');
  if (!voiceObserved) missingEvidence.push('ROLE_VOICE_POSITIVE_ALIGNMENT_NOT_OBSERVED');
  if (!strongerDistinctivenessEvidence) missingEvidence.push('ROLE_DISTINCTIVENESS_REQUIRES_MANEUVER_CONTINUITY_OR_AUTHORIZED_IDENTITY');

  return {
    status,
    score: status === 'SUFFICIENT' ? 92 : status === 'PARTIAL' ? 68 : 45,
    positiveEvidence: uniqueStrings(positiveEvidence).slice(0, 8),
    missingEvidence: uniqueStrings(missingEvidence).slice(0, 8),
    configurationFingerprint: resolved?.provenance.configurationFingerprint || null,
  };
}

/**
 * R5-C evaluates realization against the explicitly bound Role. These checks are
 * deliberately generic surface measurements: they never infer an identity, add
 * an Act, or turn role prose into a phrase allow/deny list.
 */
function evaluateRoleTurnManeuver(input: {
  observed: CustomerServiceObservedAct[];
  realization: CustomerServiceHumanTurnRealizationV1 | null;
}) {
  const participation = input.realization?.participation;
  if (!participation) return { score: 55, evidence: ['ROLE_TURN_MANEUVER_NOT_AVAILABLE'] };
  const observed = new Set(input.observed
    .filter((item) => item.observation === 'OBSERVED')
    .map((item) => item.type));
  const hasOptionalQuestion = observed.has('REQUEST_OPTIONAL_PREFERENCE');
  const hasGuidance = observed.has('PROVIDE_GENERAL_GUIDANCE')
    || observed.has('RECOMMEND_GROUNDED_ITEM')
    || observed.has('EXPLAIN_GROUNDED_FACT');

  if (participation.questionDisposition === 'HOLD_THIS_TURN' && hasOptionalQuestion) {
    return { score: 28, evidence: ['ROLE_TURN_HOLD_BUT_OPTIONAL_QUESTION_OBSERVED'] };
  }
  if (participation.turnManeuver === 'ACKNOWLEDGE_AND_HOLD' && (hasOptionalQuestion || hasGuidance)) {
    return { score: 36, evidence: ['ROLE_ACKNOWLEDGE_AND_HOLD_OVERRUN'] };
  }
  if (participation.turnManeuver === 'PROVIDE_DIRECTION_AND_HOLD' && hasOptionalQuestion) {
    return { score: 34, evidence: ['ROLE_DIRECTION_AND_HOLD_BUT_QUESTION_OBSERVED'] };
  }
  if (participation.turnManeuver === 'PROVIDE_DIRECTION_AND_HOLD' && !hasGuidance) {
    return { score: 58, evidence: ['ROLE_DIRECTION_EXPECTED_BUT_NOT_OBSERVED'] };
  }
  if (participation.turnManeuver === 'PROVIDE_DIRECTION_AND_HOLD' && hasGuidance) {
    return { score: 96, evidence: ['ROLE_DIRECTION_AND_HOLD_REALIZED'] };
  }
  if (participation.turnManeuver === 'GUIDE_THEN_OPTIONAL_CLARIFY') {
    if (hasGuidance && hasOptionalQuestion) return { score: 100, evidence: ['ROLE_GUIDE_THEN_CLARIFY_REALIZED'] };
    if (hasGuidance) return { score: 90, evidence: ['ROLE_GUIDANCE_REALIZED_WITH_OPTIONAL_STOP'] };
    if (hasOptionalQuestion) return { score: 66, evidence: ['ROLE_CLARIFY_WITHOUT_EXPECTED_DIRECTION'] };
  }
  if (participation.turnManeuver === 'OPTIONAL_CLARIFY' && hasOptionalQuestion) {
    return { score: 98, evidence: ['ROLE_OPTIONAL_CLARIFY_REALIZED'] };
  }
  if (participation.turnManeuver === 'ACKNOWLEDGE_AND_HOLD' && !hasOptionalQuestion && !hasGuidance) {
    return { score: 92, evidence: ['ROLE_ACKNOWLEDGE_AND_HOLD_REALIZED'] };
  }
  return { score: 70, evidence: ['ROLE_TURN_MANEUVER_NOT_OBSERVABLY_PROVEN'] };
}

function evaluateRoleBehaviorAlignment(input: {
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  realization: CustomerServiceHumanTurnRealizationV1 | null;
}) {
  const behavior = input.realization?.participation.roleBehavior;
  if (!behavior) return { score: 55, evidence: ['ROLE_BEHAVIOR_CONTRACT_NOT_AVAILABLE'] };
  const observed = input.observed.filter((item) => item.observation === 'OBSERVED');
  const observedTypes = new Set(observed.map((item) => item.type));
  const evidence: string[] = [];
  let score = 62;
  const add = (amount: number, key: string) => { score += amount; evidence.push(key); };
  const deduct = (amount: number, key: string) => { score -= amount; evidence.push(key); };
  const firstStart = (types: string[]) => observed
    .filter((item) => types.includes(item.type) && item.spans.length)
    .flatMap((item) => item.spans.map((span) => span.start))
    .sort((a, b) => a - b)[0];
  const requiredTypes = input.plan.acts
    .filter((item) => item.necessity === 'REQUIRED' && item.type !== 'STOP')
    .map((item) => item.type);
  const valueTypes = ['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'];
  const ackTypes = ['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE'];
  const valueObserved = valueTypes.some((type) => observedTypes.has(type as any));
  const ackObserved = ackTypes.some((type) => observedTypes.has(type as any));
  const optionalQuestionObserved = observedTypes.has('REQUEST_OPTIONAL_PREFERENCE');

  if (behavior.responsePriority === 'REQUIRED_TASK_FIRST') {
    if (requiredTypes.some((type) => observedTypes.has(type))) add(24, 'ROLE_BEHAVIOR_REQUIRED_TASK_PRIORITY_OBSERVED');
    else deduct(30, 'ROLE_BEHAVIOR_REQUIRED_TASK_NOT_OBSERVED');
  } else if (behavior.responsePriority === 'VALUE_FIRST') {
    const valueStart = firstStart(valueTypes);
    const optionalQuestionStart = firstStart(['REQUEST_OPTIONAL_PREFERENCE']);
    if (valueObserved && (optionalQuestionStart === undefined || (valueStart !== undefined && valueStart <= optionalQuestionStart))) {
      add(22, 'ROLE_BEHAVIOR_VALUE_PRIORITY_OBSERVED');
    } else if (!valueObserved) deduct(24, 'ROLE_BEHAVIOR_VALUE_PRIORITY_NOT_OBSERVED');
    else deduct(14, 'ROLE_BEHAVIOR_VALUE_AFTER_OPTIONAL_QUESTION');
  } else if (behavior.responsePriority === 'ACK_FUSED_WITH_VALUE') {
    const ackStart = firstStart(ackTypes);
    const valueStart = firstStart(valueTypes);
    if (ackObserved && valueObserved && ackStart !== undefined && valueStart !== undefined && ackStart <= valueStart) {
      add(22, 'ROLE_BEHAVIOR_ACK_VALUE_SEQUENCE_OBSERVED');
    } else if (valueObserved) add(8, 'ROLE_BEHAVIOR_VALUE_PRESENT_ACK_NOT_PROVEN');
    else deduct(24, 'ROLE_BEHAVIOR_ACK_VALUE_NOT_OBSERVED');
  } else if (behavior.responsePriority === 'RELATIONAL_ACK_FIRST') {
    if (ackObserved) add(20, 'ROLE_BEHAVIOR_RELATIONAL_ACK_OBSERVED');
    else deduct(20, 'ROLE_BEHAVIOR_RELATIONAL_ACK_NOT_OBSERVED');
  } else if (behavior.responsePriority === 'QUESTION_ONLY') {
    if (optionalQuestionObserved && input.plan.acts.some((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE')) {
      add(16, 'ROLE_BEHAVIOR_OPTIONAL_QUESTION_OBSERVED');
    }
  }

  if (behavior.questionThreshold === 'HOLD_THIS_TURN') {
    if (optionalQuestionObserved) deduct(42, 'ROLE_BEHAVIOR_HOLD_BUT_OPTIONAL_QUESTION_OBSERVED');
    else evidence.push('ROLE_BEHAVIOR_HOLD_RESPECTED');
  }
  if (behavior.questionThreshold === 'REQUIRED_NOW') {
    const requiredQuestionObserved = observedTypes.has('REQUEST_REQUIRED_SLOT') || observedTypes.has('CLARIFY_AMBIGUITY');
    if (requiredQuestionObserved) add(12, 'ROLE_BEHAVIOR_REQUIRED_QUESTION_OBSERVED');
    else deduct(30, 'ROLE_BEHAVIOR_REQUIRED_QUESTION_NOT_OBSERVED');
  }
  if ((behavior.questionThreshold === 'DECISION_RELEVANT_WITHIN_PLAN' || behavior.questionThreshold === 'EXPLORATORY_WITHIN_PLAN')
    && optionalQuestionObserved) add(8, 'ROLE_BEHAVIOR_AUTHORIZED_QUESTION_THRESHOLD_OBSERVED');

  if (behavior.judgmentStyle !== 'NONE' && valueObserved) evidence.push('ROLE_BEHAVIOR_JUDGMENT_SLOT_AVAILABLE');
  return { score: clamp(score), evidence: uniqueStrings(evidence).slice(0, 10) };
}

function evaluateRoleVoiceFidelity(input: {
  text: string;
  plan: CustomerServiceInteractionPlanV2;
  observed: CustomerServiceObservedAct[];
  speaker: CustomerServiceRoleSpeakerProjectionV1 | null;
  realization: CustomerServiceHumanTurnRealizationV1 | null;
}) {
  if (!input.speaker || !input.realization) {
    return { score: 50, evidence: ['ROLE_VOICE_CONTEXT_NOT_AVAILABLE_COMPATIBILITY'] };
  }
  if (input.speaker.source === 'NEUTRAL_COMPATIBILITY') {
    return { score: 56, evidence: ['ROLE_VOICE_NEUTRAL_COMPATIBILITY_NOT_POSITIVE_EVIDENCE'] };
  }
  const stable = input.speaker.stableCore;
  const presence = input.realization.persona.presence;
  const dynamics = input.realization.participation?.roleBehavior?.expressionDynamics || {
    warmth: 'BALANCED' as const,
    engagement: 'PRESENT' as const,
    reassurance: 'LIGHT' as const,
    servicePresence: 'AVAILABLE' as const,
  };
  const signals = roleSurfaceSignals(input.text);
  let score = 72;
  const evidence: string[] = [];
  const add = (amount: number, key: string) => { score += amount; evidence.push(key); };
  const deduct = (amount: number, key: string) => { score -= amount; evidence.push(key); };
  const observedTypes = new Set(input.observed.filter((item) => item.observation === 'OBSERVED').map((item) => item.type));
  const selectedActTypes = new Set(input.plan.acts.map((item) => item.type));
  const isAuthorizedObservedAct = (type: CustomerServicePlannedAct['type']) => {
    if (selectedActTypes.has(type)) return true;
    const allowedWhen = getCustomerServiceActDescriptor(type).allowedWhenActs || [];
    return allowedWhen.some((allowed) => selectedActTypes.has(allowed));
  };
  const authorizedObservedTypes = new Set(
    [...observedTypes].filter((type) => isAuthorizedObservedAct(type)),
  );
  const receptionActTypes = new Set<CustomerServicePlannedAct['type']>([
    'PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'REASSURE',
    'RELATIONSHIP_MAINTENANCE', 'ACKNOWLEDGE_PREFERENCE', 'ACKNOWLEDGE_PROBLEM',
  ]);
  const unauthorizedReceptionObserved = [...observedTypes]
    .filter((type) => receptionActTypes.has(type) && !isAuthorizedObservedAct(type));
  if (unauthorizedReceptionObserved.length) {
    // Diagnostic-only: unauthorized reception must never be rewarded as Persona warmth.
    // This score cannot affect generation/selection/send; it only makes the Authority
    // mismatch visible instead of treating it as positive Role evidence.
    deduct(10, 'UNAUTHORIZED_RECEPTION_OBSERVED_DIAGNOSTIC');
  }

  if (presence.formality === 'CASUAL' && signals.formalServiceMarkers.length) {
    deduct(Math.min(48, 18 + signals.formalServiceMarkers.length * 10), 'CASUAL_ROLE_FORMAL_SERVICE_REGISTER');
  } else if (presence.formality === 'FORMAL' && signals.casualMarkers.length >= 2) {
    deduct(Math.min(34, signals.casualMarkers.length * 12), 'FORMAL_ROLE_OVER_CASUAL_REGISTER');
  }
  if (presence.directness === 'DIRECT') {
    if (startsWithRoleMetaPreamble(input.text)) deduct(18, 'DIRECT_ROLE_META_PREAMBLE');
    if (signals.processMarkers.length) deduct(Math.min(34, signals.processMarkers.length * 14), 'DIRECT_ROLE_PROCESS_HEAVY');
    if (input.text.length > input.realization.surfaceBudget.softMaxChars) deduct(18, 'DIRECT_ROLE_OVER_SURFACE_BUDGET');
  }
  if (presence.playfulness === 'RESTRAINED' && (signals.laughterCount || signals.emojiCount)) {
    deduct(Math.min(34, (signals.laughterCount + signals.emojiCount) * 14), 'RESTRAINED_ROLE_PLAYFUL_SURFACE');
  }
  if (presence.expressiveness === 'RESTRAINED' && signals.expressiveCount >= 2) {
    deduct(Math.min(30, signals.expressiveCount * 8), 'RESTRAINED_ROLE_OVER_EXPRESSIVE');
  }
  if (stable.deliveryStyle.emoji === 'NONE' && signals.emojiCount) {
    deduct(Math.min(32, signals.emojiCount * 18), 'ROLE_EMOJI_POLICY_MISMATCH');
  }
  if (stable.deliveryStyle.sentenceParticleLevel === 'LOW' && signals.particleCount >= 2) {
    deduct(Math.min(24, signals.particleCount * 7), 'ROLE_PARTICLE_LEVEL_MISMATCH');
  }
  if (stable.conversationalTexture.brevity === 'COMPACT' && input.text.length > input.realization.surfaceBudget.softMaxChars) {
    deduct(Math.min(30, 12 + Math.round((input.text.length - input.realization.surfaceBudget.softMaxChars) * 0.7)), 'COMPACT_ROLE_OVEREXPANDED');
  }
  if (stable.conversationalTexture.colloquiality === 'HIGH' && signals.formalServiceMarkers.length >= 2) {
    deduct(18, 'COLLOQUIAL_ROLE_SERVICE_PROSE');
  }
  if (stable.conversationalTexture.colloquiality === 'LOW' && signals.casualMarkers.length >= 3) {
    deduct(16, 'RESTRAINED_REGISTER_TOO_CASUAL');
  }
  if (presence.energy === 'QUIET' && signals.expressiveCount >= 3) {
    deduct(18, 'QUIET_ROLE_ENERGY_SPIKE');
  }
  if (presence.directness === 'DIRECT' && !startsWithRoleMetaPreamble(input.text) && !signals.processMarkers.length) {
    add(8, 'DIRECT_ROLE_LEAD_OBSERVED');
  }
  if (stable.conversationalTexture.brevity === 'COMPACT' && input.text.length <= input.realization.surfaceBudget.softMaxChars) {
    add(7, 'COMPACT_ROLE_BREVITY_OBSERVED');
  }
  if (stable.conversationalTexture.colloquiality === 'HIGH' && signals.casualMarkers.length) {
    add(7, 'COLLOQUIAL_ROLE_REGISTER_OBSERVED');
  }
  if (stable.interactionStyle.adviceStyle !== 'RESTRAINED' && [...authorizedObservedTypes].some((type) => ['PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT', 'DIRECT_ANSWER'].includes(type))) {
    add(6, 'ROLE_ADVICE_POSTURE_OBSERVED');
  }
  if (stable.corePresence.warmth >= 70 && [...authorizedObservedTypes].some((type) => ['PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE'].includes(type))) {
    add(6, 'ROLE_WARMTH_ACK_OBSERVED');
  }

  const relationalObserved = [...authorizedObservedTypes].some((type) => [
    'PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM', 'ACKNOWLEDGE_PREFERENCE',
    'OPEN_SERVICE_INVITATION', 'RELATIONSHIP_MAINTENANCE',
  ].includes(type));
  const servicePresenceObserved = [...authorizedObservedTypes].some((type) => [
    'OPEN_SERVICE_INVITATION', 'DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'RECOMMEND_GROUNDED_ITEM',
    'EXPLAIN_GROUNDED_FACT', 'EXECUTE_SERVICE_STEP', 'REPORT_STATUS', 'REQUEST_HANDOFF',
  ].includes(type));
  const emotionalOpportunity = input.plan.acts.some((item) => ['EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM'].includes(item.type));

  if (dynamics.warmth === 'WARM') {
    if (relationalObserved) add(8, 'ROLE_DYNAMICS_WARMTH_PARTICIPATION_OBSERVED');
    else if (input.plan.acts.some((item) => ['PRESENCE_ACK', 'OPEN_SERVICE_INVITATION', 'ACKNOWLEDGE_PREFERENCE', 'ACKNOWLEDGE_PROBLEM'].includes(item.type))) {
      deduct(12, 'ROLE_DYNAMICS_WARMTH_OPPORTUNITY_MISSED');
    }
  } else if (dynamics.warmth === 'RESTRAINED' && signals.expressiveCount >= 3) {
    deduct(12, 'ROLE_DYNAMICS_RESTRAINED_WARMTH_OVERSHOT');
  }
  if (dynamics.engagement === 'ACTIVE') {
    if (servicePresenceObserved) add(8, 'ROLE_DYNAMICS_ACTIVE_ENGAGEMENT_OBSERVED');
    else if (input.plan.acts.some((item) => ['OPEN_SERVICE_INVITATION', 'PROVIDE_GENERAL_GUIDANCE', 'DIRECT_ANSWER', 'EXECUTE_SERVICE_STEP'].includes(item.type))) {
      deduct(14, 'ROLE_DYNAMICS_ACTIVE_ENGAGEMENT_NOT_OBSERVED');
    }
  }
  if (dynamics.servicePresence === 'ENGAGED') {
    if (servicePresenceObserved) add(7, 'ROLE_DYNAMICS_SERVICE_PRESENCE_OBSERVED');
    else deduct(14, 'ROLE_DYNAMICS_SERVICE_PRESENCE_NOT_OBSERVED');
  }
  if (emotionalOpportunity && dynamics.reassurance !== 'LIGHT') {
    const reassuranceObserved = [...authorizedObservedTypes].some((type) => ['EMOTIONAL_ACK', 'REASSURE', 'ACKNOWLEDGE_PROBLEM'].includes(type));
    if (reassuranceObserved) add(6, 'ROLE_DYNAMICS_REASSURANCE_OBSERVED');
    else deduct(12, 'ROLE_DYNAMICS_REASSURANCE_NOT_OBSERVED');
  }

  return { score: clamp(score), evidence: uniqueStrings(evidence).slice(0, 14) };
}

function evaluateSpeakerContinuity(input: {
  text: string;
  speaker: CustomerServiceRoleSpeakerProjectionV1 | null;
  recentConversation: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
}) {
  if (!input.speaker) return { score: 50, evidence: ['ROLE_SPEAKER_NOT_AVAILABLE_COMPATIBILITY'] };
  const recentAssistant = input.recentConversation
    .filter((item) => item.role === 'ASSISTANT' && String(item.content || '').trim())
    .slice(-3)
    .map((item) => roleSurfaceSignals(item.content));
  if (!recentAssistant.length) return { score: 55, evidence: ['SPEAKER_CONTINUITY_NOT_OBSERVABLE_ON_FRESH_TURN'] };

  const current = roleSurfaceSignals(input.text);
  const previous = recentAssistant.at(-1)!;
  // Continuity is evidence accumulated across turns, not a reward for merely avoiding
  // a visible style switch. One prior assistant turn can establish only early register
  // stability; mature continuity requires at least three prior assistant turns.
  let score = recentAssistant.length >= 3 ? 90 : recentAssistant.length === 2 ? 82 : 72;
  const evidence: string[] = [];
  const previousFormal = previous.formalServiceMarkers.length > 0;
  const previousCasual = previous.casualMarkers.length > 0;
  const currentFormal = current.formalServiceMarkers.length > 0;
  const currentCasual = current.casualMarkers.length > 0;
  if ((previousCasual && currentFormal && !previousFormal) || (previousFormal && currentCasual && !currentFormal)) {
    score -= 40;
    evidence.push('ABRUPT_REGISTER_SWITCH');
  }
  const expressiveDelta = Math.abs(current.expressiveCount - previous.expressiveCount);
  if (expressiveDelta >= 3) {
    score -= Math.min(28, expressiveDelta * 7);
    evidence.push(`ABRUPT_EXPRESSIVENESS_SHIFT:${expressiveDelta}`);
  }
  const emojiWasAbsent = recentAssistant.every((item) => item.emojiCount === 0);
  if (emojiWasAbsent && current.emojiCount >= 2) {
    score -= 20;
    evidence.push('ABRUPT_EMOJI_STYLE_SWITCH');
  }
  const averageSentenceLength = (value: ReturnType<typeof roleSurfaceSignals>) => value.sentences.length
    ? value.sentences.reduce((sum, item) => sum + item.length, 0) / value.sentences.length
    : 0;
  const previousLength = averageSentenceLength(previous);
  const currentLength = averageSentenceLength(current);
  if (previousLength >= 8 && currentLength >= 8) {
    const ratio = Math.max(previousLength, currentLength) / Math.max(1, Math.min(previousLength, currentLength));
    if (ratio >= 3.2 && (current.processMarkers.length || current.formalServiceMarkers.length)) {
      score -= 14;
      evidence.push('ABRUPT_SENTENCE_DENSITY_SWITCH');
    }
  }

  if (!evidence.length) {
    if (recentAssistant.length === 1) evidence.push('SPEAKER_REGISTER_STABILITY_SINGLE_PRIOR_TURN_ONLY');
    else if (recentAssistant.length === 2) evidence.push('SPEAKER_CONTINUITY_EARLY_EVIDENCE');
  }
  if (recentAssistant.length >= 3 && score >= 84) evidence.push('SPEAKER_CONTINUITY_OBSERVED');
  return { score: clamp(score), evidence: uniqueStrings(evidence).slice(0, 8) };
}

function evaluateConversationalTexture(input: {
  text: string;
  realization: CustomerServiceHumanTurnRealizationV1 | null;
}) {
  if (!input.realization) return { score: 94, evidence: ['HUMAN_TURN_REALIZATION_NOT_AVAILABLE_COMPATIBILITY'] };
  const signals = roleSurfaceSignals(input.text);
  const realization = input.realization;
  let score = 100;
  const evidence: string[] = [];
  const deduct = (amount: number, key: string) => { score -= amount; evidence.push(key); };

  if (signals.numberedTransitions.length) {
    deduct(Math.min(54, 18 + signals.numberedTransitions.length * 12), 'LIST_SHAPED_CONVERSATION');
  }
  if (signals.formalServiceMarkers.length >= 2 && realization.texture.spokenRegister !== 'RESTRAINED') {
    deduct(Math.min(32, signals.formalServiceMarkers.length * 9), 'POLISHED_SERVICE_PARAGRAPH');
  }
  if (signals.sentences.length > realization.turnShape.maxBeats) {
    deduct(Math.min(36, (signals.sentences.length - realization.turnShape.maxBeats) * 14), 'TOO_MANY_CONVERSATIONAL_BEATS');
  }
  if (input.text.length > realization.surfaceBudget.softMaxChars) {
    deduct(Math.min(30, 10 + Math.round((input.text.length - realization.surfaceBudget.softMaxChars) * 0.55)), 'HUMAN_TURN_SURFACE_OVEREXPANDED');
  }
  if (realization.texture.sentenceShape === 'CRISP' && signals.longClauses >= 2) {
    deduct(Math.min(28, signals.longClauses * 10), 'CRISP_ROLE_LONG_CLAUSE_STACK');
  }
  if (realization.texture.connectiveDensity === 'LOW' && signals.logicalConnectors.length >= 2) {
    deduct(Math.min(28, signals.logicalConnectors.length * 9), 'LOW_CONNECTIVE_ROLE_EXPLICIT_LINKING');
  }
  if (signals.parallelAdviceUnits >= 3) {
    deduct(24, 'SYMMETRICAL_ADVICE_STACK');
  }
  if (signals.completionFormula.length) {
    deduct(18, 'GENERIC_COMPLETION_FORMULA');
  }
  return { score: clamp(score), evidence: uniqueStrings(evidence).slice(0, 8) };
}

function evaluateAiAnswerCadence(input: {
  text: string;
  realization: CustomerServiceHumanTurnRealizationV1 | null;
}) {
  if (!input.realization) return { score: 94, evidence: ['ANTI_AI_CADENCE_NOT_AVAILABLE_COMPATIBILITY'] };
  const signals = roleSurfaceSignals(input.text);
  const realization = input.realization;
  let score = 100;
  const evidence: string[] = [];
  const deduct = (amount: number, key: string) => { score -= amount; evidence.push(key); };

  if (signals.numberedTransitions.length) deduct(Math.min(56, signals.numberedTransitions.length * 18), 'AI_ENUMERATION_CADENCE');
  if (signals.processMarkers.length && realization.antiAiCadence.avoidSelfProcessNarration) {
    deduct(Math.min(38, signals.processMarkers.length * 15), 'AI_PROCESS_NARRATION_CADENCE');
  }
  if (signals.logicalConnectors.length >= 3 && realization.antiAiCadence.preferImplicitTransitions) {
    deduct(Math.min(34, signals.logicalConnectors.length * 9), 'AI_EXPLICIT_TRANSITION_STACK');
  }
  if (signals.completionFormula.length && realization.antiAiCadence.avoidExhaustiveCompletion) {
    deduct(22, 'AI_EXHAUSTIVE_WRAP_UP');
  }
  if (signals.sentences.length > realization.turnShape.preferredBeats + 1 && realization.turnShape.stopBias === 'HIGH') {
    deduct(Math.min(28, (signals.sentences.length - realization.turnShape.preferredBeats) * 10), 'AI_CONTINUES_AFTER_ENOUGH');
  }
  const questionMarks = (input.text.match(/[?？]/gu) || []).length;
  if (questionMarks > (realization.turnShape.questionPlacement === 'NONE' ? 0 : 1)) {
    deduct(Math.min(36, questionMarks * 16), 'AI_QUESTION_STACK');
  }
  if (realization.antiAiCadence.avoidQuestionRationaleAfterQuestion && /[?？][^?？。！!]{3,}(?:因为|这样|以便|从而|方便)/u.test(input.text)) {
    deduct(24, 'AI_EXPLAINS_QUESTION_AFTER_ASKING');
  }
  if (signals.parallelAdviceUnits >= 3) deduct(20, 'AI_BALANCED_ADVICE_CADENCE');
  return { score: clamp(score), evidence: uniqueStrings(evidence).slice(0, 8) };
}

function roleSurfaceSignals(text: string) {
  const normalized = String(text || '').trim();
  const sentences = splitSemanticClauses(normalized);
  const commaClauses = normalized.split(/[，,、；;。！？!?\n]+/u).map((item) => item.trim()).filter(Boolean);
  const formalServiceMarkers = matchAll(normalized, /(?:请您|为您|建议您|您可以|关于(?:您|当前|这个)|针对(?:您|当前|这个)|以便|如需|若您|感谢您的|非常理解您的|进一步(?:为您)?(?:处理|查询|确认))/giu);
  const casualMarkers = matchAll(normalized, /(?:\bok\b|嗯+|诶+|哎+|行[呀啊]?(?=[，。！？!?\s]|$)|你先|你说|咱们|挺(?:好|累|难|合适)|缓口气|接着看)/giu);
  const processMarkers = matchAll(normalized, /(?:(?:我|这边)(?:先|再|会|将|来)?(?:帮你|为您)?(?:梳理|分析|整理|进一步|进行|处理|查询|确认)|先来看看|下面(?:我|我们)|接下来(?:我|我们))/giu);
  const numberedTransitions = matchAll(normalized, /(?:^|[。！？!?；;\n])\s*(?:第[一二三四五六七八九十]+|[1-9][.、）)]|首先|其次|然后|最后|一方面|另一方面)[，,:：]?/gimu);
  const logicalConnectors = matchAll(normalized, /(?:首先|其次|然后|最后|另外|同时|因此|所以|总的来说|综上|具体来说|换句话说|一方面|另一方面)/giu);
  const completionFormula = matchAll(normalized, /(?:希望(?:以上|这些|这个).{0,8}(?:有帮助|能帮到你)|如果还有.{0,12}(?:随时|欢迎)(?:问我|告诉我|联系)|如有(?:其他|更多).{0,10}(?:随时|欢迎))/giu);
  const particleCount = matchAll(normalized, /(?:呀|啦|呢|哦|哟|嘛)(?=[，。！？!?～~\s]|$)/gu).length;
  const emojiCount = matchAll(normalized, /[😀-🙏🌀-🫿]/gu).length;
  const laughterCount = matchAll(normalized, /(?:哈哈+|嘿嘿+|嘻嘻+)/gu).length;
  const expressiveCount = styleSignals(normalized).expressive;
  const longClauses = commaClauses.filter((item) => item.length > 30).length;
  const parallelAdviceUnits = matchAll(normalized, /(?:建议|可以|不妨|最好|尽量|先|再)(?=.{0,16}(?:，|、|；|。|$))/giu).length;
  return {
    sentences,
    formalServiceMarkers,
    casualMarkers,
    processMarkers,
    numberedTransitions,
    logicalConnectors,
    completionFormula,
    particleCount,
    emojiCount,
    laughterCount,
    expressiveCount,
    longClauses,
    parallelAdviceUnits,
  };
}

function startsWithRoleMetaPreamble(text: string) {
  return /^(?:好的[呀啊呢]?[，,]?|明白了?[呀啊呢]?[，,]|收到(?:了)?[，,]|关于(?:这个|您|当前)|针对(?:这个|您|当前))/u.test(String(text || '').trim());
}

function weightedPersonaPreference(features: CustomerServiceHumanityFeature[]) {
  const weights: Partial<Record<CustomerServiceHumanityFeatureKey, number>> = {
    ROLE_EVIDENCE: 0.28,
    ROLE_BEHAVIOR_ALIGNMENT: 0.20,
    ROLE_TURN_MANEUVER: 0.10,
    ROLE_VOICE_FIDELITY: 0.18,
    SPEAKER_CONTINUITY: 0.12,
    CONVERSATIONAL_TEXTURE: 0.07,
    AI_ANSWER_CADENCE: 0.05,
  };
  let total = 0;
  let weight = 0;
  for (const item of features) {
    const current = weights[item.key] || 0;
    total += item.score * current;
    weight += current;
  }
  return Math.round(total / Math.max(0.01, weight));
}

function weightedUtility(features: CustomerServiceHumanityFeature[]) {
  const weights: Partial<Record<CustomerServiceHumanityFeatureKey, number>> = {
    CURRENT_TURN_VALUE: 0.16,
    DECISION_CONTRIBUTION: 0.16,
    INFORMATION_GAIN: 0.14,
    REDUNDANT_PARAPHRASE: 0.10,
    CROSS_TURN_INFORMATION_GAIN: 0.16,
    QUESTION_VALUE: 0.10,
    PREFERENCE_USAGE: 0.10,
    SERVICE_ENTRY_VALUE: 0.09,
    IDENTITY_SURFACE_QUALITY: 0.08,
    CONTEXT_SPECIFICITY: 0.08,
    ACT_ECONOMY: 0.07,
    SEMANTIC_LOAD: 0.06,
    DIRECTNESS: 0.05,
    GROUNDEDNESS: 0.06,
    CUSTOMER_STYLE_ALIGNMENT: 0.03,
    STYLE_AMPLIFICATION: 0.03,
    SERVICE_POSTURE: 0.08,
    CONVERSATIONAL_FLOW: 0.09,
    MULTI_TURN_RHYTHM: 0.11,
    CROSS_FAMILY_VOICE: 0.13,
    ROLE_EVIDENCE: 0.08,
    ROLE_BEHAVIOR_ALIGNMENT: 0.10,
    ROLE_VOICE_FIDELITY: 0.14,
    SPEAKER_CONTINUITY: 0.10,
    CONVERSATIONAL_TEXTURE: 0.13,
    AI_ANSWER_CADENCE: 0.12,
  };
  let total = 0;
  let weight = 0;
  for (const item of features) {
    const current = weights[item.key] || 0;
    total += item.score * current;
    weight += current;
  }
  return Math.round(total / Math.max(0.01, weight));
}

function uniqueInformationGains(acts: CustomerServicePlannedAct[]) {
  const values = acts.map((item) => item.parameters?.expectedInformationGain).filter(Boolean) as CustomerServiceExpectedInformationGain[];
  return [...new Set(values)];
}

function feature(key: CustomerServiceHumanityFeatureKey, score: number, evidence: string[]): CustomerServiceHumanityFeature {
  const normalized = clamp(score);
  return {
    key,
    score: normalized,
    risk: normalized < 55 ? 'HIGH' : normalized < 78 ? 'MEDIUM' : 'LOW',
    evidence: evidence.slice(0, 8),
  };
}

function styleSignals(text: string) {
  const evidence = matchAll(text, /(?:哈哈+|嘿嘿+|嘻嘻+|呀|啦|哈|～|~|[😀-🙏🌀-🫿])/gu);
  return { expressive: evidence.length, evidence };
}

function repeatedClauseStarts(text: string) {
  const clauses = splitSemanticClauses(text);
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const clause of clauses) {
    const key = clause.slice(0, 4);
    if (key.length < 2) continue;
    if (seen.has(key)) repeated.push(key);
    seen.add(key);
  }
  return repeated;
}

function startsWithMetaPreamble(text: string) {
  return /^(?:好的?[呀啊呢]?[,，]?|明白了?[呀啊呢]?[,，]?|看到你|收到(?:了)?[,，]?|关于这个|针对这个)/u.test(text);
}

function meaningfulTerms(text: string) {
  const compact = String(text || '').replace(/[\s，。！？!?；;、,.]/g, '');
  const stop = new Set(['你好', '您好', '可以', '这个', '那个', '什么', '一下', '有点', '今天', '平时', '还是', '就是', '想看', '喜欢']);
  const terms: string[] = [];
  for (let size = 4; size >= 2; size -= 1) {
    for (let i = 0; i <= compact.length - size; i += 1) {
      const token = compact.slice(i, i + size);
      if (!/[\p{Script=Han}A-Za-z0-9]/u.test(token) || stop.has(token)) continue;
      if (terms.some((item) => item.includes(token) || token.includes(item))) continue;
      terms.push(token);
      if (terms.length >= 18) return terms;
    }
  }
  return terms;
}

function semanticTextAlignment(text: string, values: string[]) {
  const compactText = String(text || '').replace(/[\s，。！？!?；;、,.]/g, '');
  const normalizedValues = uniqueStrings(values);
  if (!normalizedValues.length) return 0;
  let matched = 0;
  for (const value of normalizedValues) {
    const compactValue = value.replace(/[\s，。！？!?；;、,.]/g, '');
    if (!compactValue) continue;
    if (compactText.includes(compactValue)) { matched += 1; continue; }
    const tokens: string[] = [];
    for (let size = Math.min(4, compactValue.length); size >= 2; size -= 1) {
      for (let i = 0; i <= compactValue.length - size; i += 1) tokens.push(compactValue.slice(i, i + size));
    }
    if (tokens.some((token) => compactText.includes(token))) matched += 1;
  }
  return matched / normalizedValues.length;
}

function splitSemanticClauses(text: string) {
  return String(text || '').split(/[。！？!?；;\n]+/u).map((item) => item.trim()).filter(Boolean);
}

function matchAll(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    if (!match[0]) {
      matcher.lastIndex += 1;
      continue;
    }
    values.push(match[0]);
  }
  return values;
}

function uniqueStrings(values: Array<unknown>) {
  return Array.from(new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean)));
}

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
