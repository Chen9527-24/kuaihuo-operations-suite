#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@nestjs/common') return { Injectable: () => (target) => target, Logger: class { warn() {} log() {} error() {} } };
  if (request.includes('customer-service-model-gateway.service')) return { CustomerServiceModelGateway: class {} };
  if (request.includes('compile-simulation.dto')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const rel = {
  deep: 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts',
  type: 'src/modules/customer-service-agent/runtime/understanding/types/customer-service-message-understanding.type.ts',
  interaction: 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts',
  obligation: 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts',
  compiler: 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
  simulation: 'src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts',
  knowledge: 'src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts',
  conformance: 'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts',
  hve: 'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  v26: 'docs/hve/01_DEVELOPMENT_RULES_V26.md',
  project: 'docs/hve/gpt-web-kit/PROJECT_INSTRUCTIONS.md',
  heuristic: 'src/modules/customer-service-agent/runtime/understanding/customer-service-message-understanding.service.ts',
};
// Source-contract assertions must behave identically for Windows CRLF and LF.
// Normalize only the in-memory inspection copy; do not rewrite source files.
const read = (key) => fs.readFileSync(path.join(root, rel[key]), 'utf8').replace(/\r\n?/g, '\n');
const deepSrc = read('deep');
const interactionSrc = read('interaction');
const obligationSrc = read('obligation');
const compilerSrc = read('compiler');
const simulationSrc = read('simulation');
const knowledgeSrc = read('knowledge');
const conformanceSrc = read('conformance');
const hveSrc = read('hve');
const promptSrc = read('prompt');
const v26 = read('v26');
const project = read('project');
const heuristicSrc = read('heuristic');

const {
  resolveCustomerServiceRequiredTurnGoals,
  resolveCustomerServiceRawModelTurnGoals,
  resolveCustomerServiceFactOwnershipFromTypedTurnGoals,
} = require(path.join(root, rel.deep));
const { CustomerServiceInteractionTypeResolver } = require(path.join(root, rel.interaction));
const { resolveCustomerServiceAnswerObligation } = require(path.join(root, rel.obligation));
const { CustomerServiceInteractionPlanCompiler } = require(path.join(root, rel.compiler));
const { selectCustomerServiceRuntimeKnowledgeDetailed } = require(path.join(root, rel.knowledge));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function goal(key, requestedContributionKind, requestedEvidenceScope, priority = 1000, evidence = ['opaque-current-turn-evidence'], requestedDecisionMode = null, requestedAnswerFocus = 'NOT_APPLICABLE') {
  const decisionMode = requestedDecisionMode || (requestedContributionKind === 'DECISION_SUPPORT'
    ? 'SELECT_OR_PRIORITIZE_OPTION'
    : 'NOT_APPLICABLE');
  return {
    key,
    requestedContributionKind,
    requestedEvidenceScope,
    requestedDecisionMode: decisionMode,
    requestedAnswerFocus,
    name: key,
    priority,
    confidence: 0.95,
    evidence,
    reason: 'typed-fixture',
    responseRequirement: 'typed-fixture',
    source: 'MODEL',
    deferred: false,
  };
}
function understanding({ dominant, required, scenario = 'GENERAL_INQUIRY', intent = 'ASK_INFORMATION', factScope = 'CURRENT_BUSINESS_FACT' }) {
  return {
    primaryScenario: scenario,
    primaryIntent: intent,
    topics: [],
    factOwnership: {
      authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
      scope: factScope,
      confidence: 0.95,
      evidence: [factScope === 'CURRENT_BUSINESS_FACT' ? 'TYPED_EVIDENCE_SCOPE:MERCHANT_BUSINESS' : 'TYPED_EVIDENCE_SCOPE:GENERAL_DOMAIN'],
      reason: 'typed-fixture',
      namedOfferingReferent: {
        authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
        status: 'NONE', source: 'NONE', surface: null, resolvedGroundingIds: [],
      },
    },
    humanContext: {
      dominantTurnGoal: dominant,
      requiredTurnGoals: required,
      rankedTurnGoals: required,
      requiredResponseActs: [],
      conversationTaskState: { pendingSlots: [], unresolvedGoals: [], currentTurnRelation: 'NEW_REQUEST', status: 'IN_PROGRESS', internalHandling: { scenario: null } },
      dialogueObligation: { requestedDeltas: [], feedbackHandlingMode: 'NONE', forbiddenRepeatedMoves: [] },
      emotionalDisclosure: { detected: false, mode: 'NONE' },
      interactionStrategy: { phase: 'SERVICE' },
      commercialStrategy: { discoveryTarget: '', objective: '' },
      statedNeeds: [],
      uncertainties: [],
      primaryMotive: 'INFORMATION',
    },
  };
}
const emptyState = { latestFeedback: null, behaviorHistory: { recentRequestedDeltas: [] }, recentAssistantPlans: [] };

// Producer/representation: same legacy key may carry distinct compound obligations.
const infoGoal = goal('ANSWER_INFORMATION', 'INFORMATION', 'MERCHANT_BUSINESS', 1200);
const decisionGoalSameKey = goal('ANSWER_INFORMATION', 'DECISION_SUPPORT', 'MERCHANT_BUSINESS', 1100);
const discoveryDecisionGoal = goal('EXPLORE_PRODUCT_NEED', 'DECISION_SUPPORT', 'MERCHANT_BUSINESS', 1080);
const context = { dominantTurnGoal: infoGoal, rankedTurnGoals: [infoGoal, decisionGoalSameKey, discoveryDecisionGoal] };
const requiredGoals = resolveCustomerServiceRequiredTurnGoals(context, context.rankedTurnGoals);
check('compound typed obligations survive same legacy key because semantic identity includes contribution/evidence axes',
  requiredGoals.some((item) => item.key === 'ANSWER_INFORMATION' && item.requestedContributionKind === 'INFORMATION')
  && requiredGoals.some((item) => item.key === 'ANSWER_INFORMATION' && item.requestedContributionKind === 'DECISION_SUPPORT'),
  JSON.stringify(requiredGoals));
check('typed executable obligation is not erased merely because its legacy goal key is outside the old authoritative-key whitelist',
  requiredGoals.some((item) => item.key === 'EXPLORE_PRODUCT_NEED' && item.requestedContributionKind === 'DECISION_SUPPORT'),
  JSON.stringify(requiredGoals));

const merchantOwnership = resolveCustomerServiceFactOwnershipFromTypedTurnGoals([decisionGoalSameKey]);
const generalOwnership = resolveCustomerServiceFactOwnershipFromTypedTurnGoals([goal('ANSWER_INFORMATION', 'INFORMATION', 'GENERAL_DOMAIN')]);
check('typed MERCHANT_BUSINESS scope owns business FactOwnership without lexical reconstruction', merchantOwnership?.scope === 'CURRENT_BUSINESS_FACT');
check('typed GENERAL_DOMAIN scope cannot inherit merchant FactOwnership', generalOwnership?.scope === 'GENERAL_DOMAIN');

// Legacy positive explicit-semantic owner is retired; only hard safety/security pre-model floors remain deterministic.
check('legacy positive explicit-semantic override is absent from Deep Recognition Runtime',
  !deepSrc.includes('resolveCustomerServiceEffectiveExplicitSemantic')
  && !deepSrc.includes('inferExplicitCustomerSemantic'));
check('Safety/Security deterministic hard floor remains explicitly permission-reducing',
  heuristicSrc.includes('detectSafetySecurityHardFloor')
  && heuristicSrc.includes("scenario: 'SAFETY_SENSITIVE'")
  && heuristicSrc.includes("scenario: 'SECURITY_SENSITIVE'"));

// Actual consumers: typed contract, not surface paraphrase, owns merchant choice behavior.
const resolver = new CustomerServiceInteractionTypeResolver();
const compoundUnderstanding = understanding({ dominant: infoGoal, required: [infoGoal, decisionGoalSameKey] });
const interactionA = resolver.resolve({ understanding: compoundUnderstanding, plan: {}, knowledgeAvailable: true, latestCustomerMessage: '表面文本甲' });
const interactionB = resolver.resolve({ understanding: compoundUnderstanding, plan: {}, knowledgeAvailable: true, latestCustomerMessage: '完全不同的表面文本乙' });
check('same typed merchant selection contract is paraphrase-independent in InteractionType consumer',
  interactionA === 'PRODUCT_DISCOVERY' && interactionB === 'PRODUCT_DISCOVERY', `${interactionA}/${interactionB}`);

const assessmentInfoGoal = goal('ANSWER_INFORMATION', 'INFORMATION', 'MERCHANT_BUSINESS', 1200, ['当前字段值是什么'], null, 'CURRENT_SPECIFIC_QUESTION');
const assessmentGoal = goal('SUPPORT_PURCHASE_DECISION', 'DECISION_SUPPORT', 'MERCHANT_BUSINESS', 1100, ['在条件X下怎么判断当前方案'], 'ASSESS_CURRENT_OPTION', 'COMPATIBILITY');
const assessmentUnderstanding = understanding({ dominant: assessmentInfoGoal, required: [assessmentInfoGoal, assessmentGoal], scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION' });
const assessmentInteractionA = resolver.resolve({ understanding: assessmentUnderstanding, plan: {}, knowledgeAvailable: true, latestCustomerMessage: '自然改写甲' });
const assessmentInteractionB = resolver.resolve({ understanding: assessmentUnderstanding, plan: {}, knowledgeAvailable: true, latestCustomerMessage: '自然改写乙' });
check('current-option assessment remains PRODUCT_FACT_QUERY and cannot create replacement recommendation authority',
  assessmentInteractionA === 'PRODUCT_FACT_QUERY' && assessmentInteractionB === 'PRODUCT_FACT_QUERY', `${assessmentInteractionA}/${assessmentInteractionB}`);

const assessmentObligation = resolveCustomerServiceAnswerObligation({
  interactionType: assessmentInteractionA,
  latestCustomerMessage: '当前字段值是什么？另外，在条件X下怎么判断当前方案？',
  conversationState: emptyState,
  knowledgeEntries: [],
  understanding: assessmentUnderstanding,
});
check('compound response target transports all required current-turn evidence without collapsing to dominant-only need',
  assessmentObligation.responseTarget.focus !== 'RECOMMENDATION'
  && String(assessmentObligation.responseTarget.unresolvedNeed || '').includes('当前字段值是什么')
  && String(assessmentObligation.responseTarget.unresolvedNeed || '').includes('在条件X下怎么判断当前方案'),
  JSON.stringify(assessmentObligation.responseTarget));

const factualUnderstanding = understanding({ dominant: infoGoal, required: [infoGoal], scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION' });
const factualInteraction = resolver.resolve({ understanding: factualUnderstanding, plan: {}, knowledgeAvailable: true, latestCustomerMessage: '推荐 建议 选择 哪个' });
check('recommendation-looking surface cannot create choice Authority when typed contract is merchant INFORMATION', factualInteraction === 'PRODUCT_FACT_QUERY', factualInteraction);

const obligation = resolveCustomerServiceAnswerObligation({
  interactionType: interactionA,
  latestCustomerMessage: '任意自然表达',
  conversationState: emptyState,
  knowledgeEntries: [],
  understanding: compoundUnderstanding,
});
check('Canonical Answer Obligation consumes typed merchant decision support as RECOMMENDATION while retaining business-fact Grounding requirement',
  obligation.responseTarget.focus === 'RECOMMENDATION'
  && obligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED', JSON.stringify(obligation.responseTarget));

const factualObligation = resolveCustomerServiceAnswerObligation({
  interactionType: factualInteraction,
  latestCustomerMessage: '推荐 建议 选择 哪个',
  conversationState: emptyState,
  knowledgeEntries: [],
  understanding: factualUnderstanding,
});
check('near-surface lexical similarity cannot promote factual typed contract into recommendation',
  factualObligation.responseTarget.focus !== 'RECOMMENDATION'
  && factualObligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED', JSON.stringify(factualObligation.responseTarget));

// Static producer boundaries: no pre-model lexical answer key and no post-model fallback merge.
check('Deep Recognition positive prompt is not pre-anchored by heuristic/pragmatic semantic seeds',
  !deepSrc.includes('heuristicSeed:') && !deepSrc.includes('pragmaticSeed:') && deepSrc.includes("lexicalFallbackAuthority: 'NONE_WHEN_MODEL_RESULT_IS_VALID'"));
check('valid model ranked goals replace lexical fallback goals rather than merging a second semantic owner',
  deepSrc.includes('const merged: CustomerServiceTurnGoal[] = [];')
  && deepSrc.includes('const source = merged.length')
  && deepSrc.includes(': fallback.map((item) => ({ ...item, evidence: [...item.evidence] }))'));

// Deep Recognition transport/recovery budget: length truncation must not silently
// collapse into neutral heuristic merely because the primary request consumed the
// entire local wall-clock window. This remains one semantic owner with one bounded
// compact regeneration path.
check('Deep Recognition reserves completion headroom and an independent bounded regeneration window',
  deepSrc.includes('const DEEP_RECOGNITION_PRIMARY_MAX_TOKENS = 3000')
  && deepSrc.includes('maxTokens: DEEP_RECOGNITION_PRIMARY_MAX_TOKENS')
  && deepSrc.includes('const DEEP_RECOGNITION_PRIMARY_TIMEOUT_MS = 8_000')
  && deepSrc.includes('timeoutMs: DEEP_RECOGNITION_PRIMARY_TIMEOUT_MS')
  && deepSrc.includes('const DEEP_RECOGNITION_TOTAL_BUDGET_MS = 12_000')
  && deepSrc.includes('const DEEP_RECOGNITION_REPAIR_MIN_BUDGET_MS = 2_000')
  && deepSrc.includes('const DEEP_RECOGNITION_REPAIR_MAX_TOKENS = 1400')
  && deepSrc.includes('const DEEP_RECOGNITION_REPAIR_MAX_TIMEOUT_MS = 3_500')
  && deepSrc.includes('DEEP_RECOGNITION_TOTAL_BUDGET_MS - result.elapsedMs')
  && deepSrc.includes('remainingRecognitionBudgetMs >= DEEP_RECOGNITION_REPAIR_MIN_BUDGET_MS')
  && deepSrc.includes('maxTokens: DEEP_RECOGNITION_REPAIR_MAX_TOKENS')
  && deepSrc.includes('Math.min(DEEP_RECOGNITION_REPAIR_MAX_TIMEOUT_MS, remainingRecognitionBudgetMs)'));
check('Deep Recognition recovery remains a single bounded regeneration path, not a second semantic owner',
  (deepSrc.match(/modelGateway\.generate\(/g) || []).length === 2
  && deepSrc.includes('buildJsonRepairPrompt(prompt.user, result.content, firstParseError)')
  && deepSrc.includes("thinkingMode: 'DISABLED'"));
check('Deep Recognition recovery diagnostics only claim LOCAL_REPAIR after a valid locally repaired envelope and MODEL_REGENERATION after successful regeneration',
  deepSrc.includes("let recoveryMode: 'LOCAL_REPAIR' | 'MODEL_REGENERATION' | null = parsed && firstParse.repaired ? 'LOCAL_REPAIR' : null")
  && deepSrc.includes("if (parsed) recoveryMode = repairedParse.repaired ? 'LOCAL_REPAIR' : 'MODEL_REGENERATION'")
  && deepSrc.includes('repairSucceeded = Boolean(parsed)'));
const rawAssessmentMessage = '当前对象属性是什么，同时请评估它在条件甲下是否适合。';
const rawAssessmentGoals = resolveCustomerServiceRawModelTurnGoals({ humanContext: { rankedTurnGoals: [
  { key: 'ANSWER_INFORMATION', requestedContributionKind: 'INFORMATION', requestedEvidenceScope: 'MERCHANT_BUSINESS', requestedDecisionMode: 'NOT_APPLICABLE', requestedAnswerFocus: 'CURRENT_SPECIFIC_QUESTION', confidence: .94, priority: 100, evidence: ['当前对象属性是什么'] },
  { key: 'SUPPORT_PURCHASE_DECISION', requestedContributionKind: 'DECISION_SUPPORT', requestedEvidenceScope: 'MERCHANT_BUSINESS', requestedDecisionMode: 'ASSESS_CURRENT_OPTION', requestedAnswerFocus: 'COMPATIBILITY', confidence: .93, priority: 90, evidence: ['请评估它在条件甲下是否适合'] },
] } }, rawAssessmentMessage);
const rawAssessmentRequired = resolveCustomerServiceRequiredTurnGoals(
  { ...assessmentUnderstanding.humanContext, rankedTurnGoals: rawAssessmentGoals, dominantTurnGoal: rawAssessmentGoals[0] },
  rawAssessmentGoals,
);
check('raw Deep Recognition transport preserves ASSESS_CURRENT_OPTION through required-goal closure',
  rawAssessmentGoals.some((item) => item.requestedDecisionMode === 'ASSESS_CURRENT_OPTION')
  && rawAssessmentRequired.some((item) => item.requestedDecisionMode === 'ASSESS_CURRENT_OPTION'),
  JSON.stringify({ rawAssessmentGoals, rawAssessmentRequired }));
check('raw Deep Recognition transport preserves typed answer facet through required-goal closure',
  rawAssessmentGoals.some((item) => item.requestedAnswerFocus === 'COMPATIBILITY')
  && rawAssessmentRequired.some((item) => item.requestedAnswerFocus === 'COMPATIBILITY'),
  JSON.stringify({ rawAssessmentGoals, rawAssessmentRequired }));
check('typed answer facet is model-produced, normalized, schema-validated, identity-bearing and repair-preserved rather than reconstructed from raw wording',
  deepSrc.includes('requestedAnswerFocus: REQUESTED_ANSWER_FOCUSES')
  && deepSrc.includes('normalizeEnum(record.requestedAnswerFocus, REQUESTED_ANSWER_FOCUSES, null)')
  && deepSrc.includes('缺少合法 requestedAnswerFocus')
  && deepSrc.includes("goal.requestedAnswerFocus || 'UNSPECIFIED'")
  && deepSrc.includes('每个 goal 必须保留 requestedContributionKind')
  && deepSrc.includes('requestedAnswerFocus（OVERVIEW|APPLICATION_USAGE|HOW_TO|WHY_REASON|COMPARISON|LIMITATION_BOUNDARY|COMPATIBILITY'));
const typedDecisionAxisUse = /goal\??\.requestedContributionKind\s*===\s*['"]DECISION_SUPPORT['"]/;
check('typed decision mode is produced, schema-validated, preserved in semantic identity, and projected to coarse intent without raw-wording reconstruction',
  deepSrc.includes('requestedDecisionMode')
  && deepSrc.includes('ASSESS_CURRENT_OPTION')
  && deepSrc.includes('SELECT_OR_PRIORITIZE_OPTION')
  && deepSrc.includes("requestedDecisionMode || 'UNSPECIFIED'")
  && deepSrc.includes("if (requestedDecisionMode === 'ASSESS_CURRENT_OPTION') return 'ASK_INFORMATION'")
  && deepSrc.includes("if (requestedDecisionMode === 'SELECT_OR_PRIORITIZE_OPTION') return 'PURCHASE_INTEREST'"));
check('downstream recommendation consumers require typed selection mode and do not import/reconstruct the retired product-choice phrase helper',
  typedDecisionAxisUse.test(interactionSrc)
  && typedDecisionAxisUse.test(obligationSrc)
  && interactionSrc.includes("requestedDecisionMode === 'SELECT_OR_PRIORITIZE_OPTION'")
  && obligationSrc.includes("requestedDecisionMode === 'SELECT_OR_PRIORITIZE_OPTION'")
  && !interactionSrc.includes('hasExplicitProductChoiceRequest')
  && !obligationSrc.includes('hasExplicitProductChoiceRequest')
  && !/from\s+['"][^'"]*customer-service-explicit-semantics['"]/.test(interactionSrc)
  && !/from\s+['"][^'"]*customer-service-explicit-semantics['"]/.test(obligationSrc));

check('Canonical compiler keeps current-entity Grounding separate from current-option assessment guidance authority',
  compilerSrc.includes("goal.requestedDecisionMode === 'ASSESS_CURRENT_OPTION'")
  && compilerSrc.includes('CURRENT_OPTION_ASSESSMENT_GUIDANCE_REQUIRED')
  && compilerSrc.includes('GUIDE/一般原则不能成为当前实体属性、性能、体验或保证的事实来源')
  && compilerSrc.includes('不得推荐、替换或排序其他对象'));

const retrievalRoleHelper = simulationSrc.match(/function\s+resolveRequiredKnowledgeRetrievalRoles[\s\S]*?\n}\n/);
check('Simulation transports typed current-option assessment evidence demand into Knowledge retrieval without reading raw wording',
  simulationSrc.includes('resolveRequiredKnowledgeRetrievalRoles(understanding)')
  && simulationSrc.includes('requiredKnowledgeRoles,')
  && !!retrievalRoleHelper
  && retrievalRoleHelper[0].includes("goal.requestedContributionKind === 'DECISION_SUPPORT'")
  && retrievalRoleHelper[0].includes("goal.requestedEvidenceScope === 'MERCHANT_BUSINESS'")
  && retrievalRoleHelper[0].includes("goal.requestedDecisionMode === 'ASSESS_CURRENT_OPTION'")
  && retrievalRoleHelper[0].includes("['CURRENT_OPTION_ASSESSMENT_GUIDE' as const]")
  && !/(?:latestCustomerMessage|dto\.message|includes\(|match\(|test\()/u.test(retrievalRoleHelper[0]));

const retrievalNow = new Date('2026-09-11T00:00:00Z');
const retrievalEntry = (values) => ({
  id: values.id,
  collectionId: null,
  scopeType: 'STORE',
  scopeKey: 'store-1',
  entityType: values.entityType || 'PRODUCT',
  entityKey: values.entityKey || values.id,
  aliases: [],
  structuredData: null,
  references: [],
  authorityLevel: 'BUSINESS_FACT',
  chunkIndex: null,
  sourceFileName: null,
  bindingPriority: 0,
  bindingTargetType: null,
  bindingTargetKey: null,
  collection: null,
  category: values.category || (values.entityType === 'GUIDE' ? 'REFERENCE' : 'PRODUCT'),
  title: values.title,
  question: values.question || null,
  content: values.content,
  tags: values.tags || [],
  sourceType: 'MANUAL',
  sourceReference: null,
  revision: 1,
  effectiveFrom: null,
  effectiveTo: null,
  updatedAt: retrievalNow,
});
const retrievalCurrent = retrievalEntry({ id: 'P-CURRENT', title: '当前已证明对象', content: '当前对象结构化业务事实。' });
const retrievalGuide = retrievalEntry({
  id: 'G-ASSESS', entityType: 'GUIDE', entityKey: 'guide-assess', category: 'REFERENCE',
  title: '通勤体感判断原则', content: '通勤久坐体感要结合版型余量、织法和厚度判断。', tags: ['通勤', '久坐', '版型'],
});
const retrievalCompetitors = Array.from({ length: 10 }, (_, index) => retrievalEntry({
  id: `P-COMP-${index + 1}`,
  title: `外面工位坐久候选${index + 1}`,
  question: '外面走一阵回工位坐久',
  content: `外面 工位 坐久 贴身 候选 ${index + 1}`,
  tags: ['外面', '工位', '坐久', '贴身'],
}));
const retrievalInput = {
  message: '下午外面走一阵再回工位坐很久，这种情况下它会不会比较容易贴在身上？你会怎么判断？',
  scenario: 'PRODUCT_CONSULT',
  intent: 'ASK_INFORMATION',
  topics: [],
  priorDeliveredGroundingRefs: ['P-CURRENT'],
  maxEstimatedTokens: 260,
  businessScope: null,
};
const retrievalWithoutAssessmentRole = selectCustomerServiceRuntimeKnowledgeDetailed(
  [retrievalCurrent, ...retrievalCompetitors, retrievalGuide],
  retrievalInput,
).selected;
const retrievalWithAssessmentRole = selectCustomerServiceRuntimeKnowledgeDetailed(
  [retrievalCurrent, ...retrievalCompetitors, retrievalGuide],
  { ...retrievalInput, requiredKnowledgeRoles: ['CURRENT_OPTION_ASSESSMENT_GUIDE'] },
).selected;
check('typed assessment retrieval keeps the proven current entity and admits an already-relevant GUIDE before unrelated high-scoring candidates exhaust budget',
  retrievalWithAssessmentRole[0]?.id === 'P-CURRENT'
  && retrievalWithAssessmentRole.some((item) => item.id === 'G-ASSESS')
  && retrievalWithAssessmentRole.find((item) => item.id === 'G-ASSESS')?.matchEvidence?.includes('REQUIRED_KNOWLEDGE_ROLE:CURRENT_OPTION_ASSESSMENT_GUIDE')
  && !retrievalWithoutAssessmentRole.some((item) => item.id === 'G-ASSESS'),
  JSON.stringify({ without: retrievalWithoutAssessmentRole.map((item) => item.id), with: retrievalWithAssessmentRole.map((item) => item.id) }));
const irrelevantGuide = retrievalEntry({
  id: 'G-IRRELEVANT', entityType: 'GUIDE', entityKey: 'guide-refund', category: 'REFERENCE',
  title: '退换货政策原则', content: '退换货政策与时效说明。', tags: ['售后', '退款'],
});
const irrelevantGuideSelection = selectCustomerServiceRuntimeKnowledgeDetailed(
  [retrievalCurrent, irrelevantGuide],
  { ...retrievalInput, requiredKnowledgeRoles: ['CURRENT_OPTION_ASSESSMENT_GUIDE'] },
).selected;
check('typed assessment role cannot summon an unrelated zero-relevance GUIDE or replace current-entity evidence',
  irrelevantGuideSelection.some((item) => item.id === 'P-CURRENT')
  && !irrelevantGuideSelection.some((item) => item.id === 'G-IRRELEVANT'),
  JSON.stringify(irrelevantGuideSelection.map((item) => item.id)));
check('Knowledge retrieval role is retrieval-only and cannot itself create entity or Grounding Authority',
  knowledgeSrc.includes('It cannot create entity identity, Fact ownership, Canonical Acts, Grounding,')
  && knowledgeSrc.includes('relevance.score > 0')
  && knowledgeSrc.includes("requiredKnowledgeRoles.has('CURRENT_OPTION_ASSESSMENT_GUIDE')")
  && knowledgeSrc.includes('currentOptionAssessmentGuidePriority')
  && knowledgeSrc.includes('b.currentEntityIdentityAuthorityRank - a.currentEntityIdentityAuthorityRank'));


function compilerStateFixture(requestedDeltas = []) {
  return {
    schemaVersion: 2,
    revision: 2,
    currentTurn: 2,
    canonicalFields: {
      activeTopic: { value: null, confidence: 0, source: 'NONE' },
      currentIntent: { value: null, confidence: 0, source: 'NONE' },
      customerGoal: { value: null, confidence: 0, source: 'NONE' },
      explicitFacts: { value: [], confidence: 0, source: 'NONE' },
      relationship: { value: null, confidence: 0, source: 'NONE' },
    },
    activeTask: null,
    behaviorHistory: { recentRequestedDeltas: requestedDeltas, consecutiveQuestionEndingTurns: 0 },
    recentAssistantMoves: [],
  };
}
function compilerPlanFixture(dominantTurnGoal) {
  return {
    route: 'GENERATION', microActions: [], salesVisibility: 'S0',
    businessOpportunity: { mode: 'NONE' },
    stateGuidance: { preferences: [], explicitFacts: [] },
    identityConstraint: {
      businessAnchored: true, identityLabel: 'fixture', merchantRoleName: 'fixture', accountName: null, storeName: null,
      strength: 'NORMAL', casualChatBoundary: 'SERVICE_ANCHORED', forbiddenDrift: [], customerVisibleIdentity: null,
    },
    dominantTurnGoal,
    requiredTurnGoals: [],
    serviceGoal: '完成当前客户请求', humanityGoal: '自然直接', businessGoal: null,
  };
}
const deterministicFixture = { matchedRules: [], requiredPoints: [], workflowSteps: [], templateReply: null };
const assessmentCompilerUnderstanding = structuredClone(assessmentUnderstanding);
assessmentCompilerUnderstanding.factOwnership = {
  ...assessmentCompilerUnderstanding.factOwnership,
  evidence: [
    'FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE',
    'REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY',
    'GROUNDING_ENTITY_MATCH:P-CURRENT',
  ],
  namedOfferingReferent: {
    authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
    status: 'EXACT_STRUCTURED_ENTITY',
    source: 'CONTEXTUAL_GROUNDED_ENTITY',
    surface: '当前对象',
    resolvedGroundingIds: ['P-CURRENT'],
  },
};
assessmentCompilerUnderstanding.humanContext.dialogueObligation = {
  ...assessmentCompilerUnderstanding.humanContext.dialogueObligation,
  requestedDeltas: [],
};
const assessmentCompiler = new CustomerServiceInteractionPlanCompiler(resolver);
const assessmentCompiledPlan = assessmentCompiler.compileShadow({
  understanding: assessmentCompilerUnderstanding,
  plan: compilerPlanFixture(assessmentCompilerUnderstanding.humanContext.dominantTurnGoal),
  deterministic: deterministicFixture,
  conversationState: compilerStateFixture(),
  knowledgeEntries: [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT'), retrievalWithAssessmentRole.find((item) => item.id === 'G-ASSESS')].filter(Boolean),
  latestCustomerMessage: '当前对象属性是什么，同时请评估它在条件甲下是否适合。',
  conversationHistory: [],
});
const assessmentGroundedAct = assessmentCompiledPlan?.acts?.find((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED');
const assessmentGuidanceAct = assessmentCompiledPlan?.acts?.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED');
const assessmentGroundingRefs = (assessmentGroundedAct?.grounding || []).flatMap((item) => item.evidenceRefs || []);
check('dynamic Canonical owner-chain gives typed current-option assessment separate grounded-fact and general-guidance Required Acts',
  Boolean(assessmentCompiledPlan)
  && assessmentCompiledPlan.interactionType === 'PRODUCT_FACT_QUERY'
  && Boolean(assessmentGroundedAct)
  && Boolean(assessmentGuidanceAct)
  && !assessmentCompiledPlan.acts.some((item) => item.type === 'RECOMMEND_GROUNDED_ITEM'),
  JSON.stringify(assessmentCompiledPlan?.acts));
check('dynamic current-option assessment keeps GUIDE out of current-entity Grounding refs while preserving current entity proof',
  assessmentGroundingRefs.includes('P-CURRENT')
  && !assessmentGroundingRefs.includes('G-ASSESS')
  && !(assessmentGuidanceAct?.grounding || []).length,
  JSON.stringify({ assessmentGroundingRefs, guidanceGrounding: assessmentGuidanceAct?.grounding || [] }));

const factualCompilerUnderstanding = structuredClone(assessmentCompilerUnderstanding);
factualCompilerUnderstanding.humanContext.requiredTurnGoals = [assessmentInfoGoal];
factualCompilerUnderstanding.humanContext.rankedTurnGoals = [assessmentInfoGoal];
factualCompilerUnderstanding.humanContext.dominantTurnGoal = assessmentInfoGoal;
const factualCompiledPlan = assessmentCompiler.compileShadow({
  understanding: factualCompilerUnderstanding,
  plan: compilerPlanFixture(assessmentInfoGoal),
  deterministic: deterministicFixture,
  conversationState: compilerStateFixture(),
  knowledgeEntries: [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT')].filter(Boolean),
  latestCustomerMessage: '当前对象属性是什么？',
  conversationHistory: [],
});
check('reverse boundary: a pure grounded fact query does not gain current-option assessment guidance authority',
  Boolean(factualCompiledPlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED'))
  && !factualCompiledPlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'),
  JSON.stringify(factualCompiledPlan?.acts));

const factualPreferredHelpAct = factualCompiledPlan?.acts?.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'PREFERRED');
check('known business fact plan exposes only zero-Grounding preferred general-help authority beside the single grounded fact owner',
  Boolean(factualPreferredHelpAct)
  && !(factualPreferredHelpAct?.grounding || []).length
  && Boolean(factualCompiledPlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED'))
  && !factualCompiledPlan?.acts?.some((item) => item.type === 'DIRECT_ANSWER'),
  JSON.stringify(factualCompiledPlan?.acts));

const capabilityInfoGoal = { ...assessmentInfoGoal, requestedAnswerFocus: 'PRODUCT_CAPABILITIES', evidence: ['当前对象在场景甲下表现如何'] };
function compileHybridFacetVariant(goalFixture, message) {
  const variant = structuredClone(factualCompilerUnderstanding);
  variant.humanContext.dominantTurnGoal = goalFixture;
  variant.humanContext.requiredTurnGoals = [goalFixture];
  variant.humanContext.rankedTurnGoals = [goalFixture];
  return assessmentCompiler.compileShadow({
    understanding: variant,
    plan: compilerPlanFixture(goalFixture),
    deterministic: deterministicFixture,
    conversationState: compilerStateFixture(),
    knowledgeEntries: [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT')].filter(Boolean),
    latestCustomerMessage: message,
    conversationHistory: [],
  });
}
const capabilityPlanA = compileHybridFacetVariant(capabilityInfoGoal, '自然改写甲');
const capabilityPlanB = compileHybridFacetVariant(capabilityInfoGoal, '完全不同的自然改写乙');
for (const [label, planValue] of [['A', capabilityPlanA], ['B', capabilityPlanB]]) {
  const grounded = planValue?.acts?.find((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED');
  const guidance = planValue?.acts?.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED');
  check(`typed PRODUCT_CAPABILITIES hybrid continuation ${label} keeps Grounded fact and independent Required general help regardless of surface wording`,
    Boolean(grounded)
    && Boolean(guidance)
    && !(guidance?.grounding || []).length
    && !planValue?.acts?.some((item) => item.type === 'DIRECT_ANSWER' || item.type === 'RECOMMEND_GROUNDED_ITEM'),
    JSON.stringify(planValue?.acts));
}
const compatibilityInfoGoal = { ...assessmentInfoGoal, requestedAnswerFocus: 'COMPATIBILITY', evidence: ['当前对象和条件甲是否适配'] };
const compatibilityPlan = compileHybridFacetVariant(compatibilityInfoGoal, '近义改写但不包含任何固定业务关键词');
check('typed COMPATIBILITY information question gets the same hybrid continuation without requiring DECISION_SUPPORT relabeling',
  compatibilityPlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED')
  && compatibilityPlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'),
  JSON.stringify(compatibilityPlan?.acts));
const exactAttributeNearCounterexample = { ...assessmentInfoGoal, requestedAnswerFocus: 'CURRENT_SPECIFIC_QUESTION', evidence: ['当前对象的精确属性是什么'] };
const exactAttributePlan = compileHybridFacetVariant(exactAttributeNearCounterexample, '这句表面也可以出现适合、体验、表现等词，但 typed facet 仍是普通精确事实');
check('near counterexample: ordinary exact merchant fact remains Grounded Required plus only Preferred general help even when surface wording looks evaluative',
  exactAttributePlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED')
  && exactAttributePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'PREFERRED')
  && !exactAttributePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'),
  JSON.stringify(exactAttributePlan?.acts));

// The latest compound Live carries INFORMATION/MERCHANT_BUSINESS and
// ADVICE/GENERAL_DOMAIN under the same legacy key. Exercise the actual compiler:
// neither that key nor the wording of the surface message owns guidance necessity.
const requiredGeneralAdviceGoal = goal('ANSWER_INFORMATION', 'ADVICE', 'GENERAL_DOMAIN', 1100, ['说明判断因素与适用条件']);
function compileGeneralAdviceVariant({ adviceGoal = requiredGeneralAdviceGoal, message = '自然输入甲', requestedDeltas = [], close = false, knownEntity = true } = {}) {
  const variant = structuredClone(factualCompilerUnderstanding);
  const closeGoal = goal('CLOSE_CONVERSATION', 'OTHER', 'NOT_APPLICABLE', 1300);
  const dominant = close ? closeGoal : assessmentInfoGoal;
  variant.humanContext.dominantTurnGoal = dominant;
  variant.humanContext.requiredTurnGoals = [dominant, structuredClone(adviceGoal)];
  variant.humanContext.rankedTurnGoals = variant.humanContext.requiredTurnGoals;
  variant.humanContext.dialogueObligation = {
    ...variant.humanContext.dialogueObligation,
    requestedDeltas,
  };
  return assessmentCompiler.compileShadow({
    understanding: variant,
    plan: compilerPlanFixture(dominant),
    deterministic: deterministicFixture,
    conversationState: compilerStateFixture(requestedDeltas),
    knowledgeEntries: knownEntity
      ? [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT')].filter(Boolean)
      : [],
    latestCustomerMessage: message,
    conversationHistory: [],
  });
}
const requiredGeneralAdvicePlan = compileGeneralAdviceVariant();
const requiredGeneralAdviceAct = requiredGeneralAdvicePlan?.acts?.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE');
const requiredGeneralFactAct = requiredGeneralAdvicePlan?.acts?.find((item) => item.type === 'EXPLAIN_GROUNDED_FACT');
check('compound merchant information plus same-key general advice keeps both contributions Required without creating a recommendation',
  requiredGeneralAdviceAct?.necessity === 'REQUIRED'
  && requiredGeneralFactAct?.necessity === 'REQUIRED'
  && !(requiredGeneralAdviceAct.grounding || []).length
  && (requiredGeneralFactAct.grounding || []).flatMap((item) => item.evidenceRefs || []).join(',') === 'P-CURRENT'
  && !requiredGeneralAdvicePlan?.acts?.some((item) => item.type === 'RECOMMEND_GROUNDED_ITEM' || item.type === 'DIRECT_ANSWER'),
  JSON.stringify(requiredGeneralAdvicePlan?.acts));

const differentKeyGeneralAdvicePlan = compileGeneralAdviceVariant({
  adviceGoal: { ...requiredGeneralAdviceGoal, key: 'PROVIDE_REQUESTED_ADVICE' },
  message: '完全不同的自然输入乙',
});
check('general advice requirement depends on executable axes rather than legacy key or surface wording',
  differentKeyGeneralAdvicePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED')
  && differentKeyGeneralAdvicePlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED')
  && !differentKeyGeneralAdvicePlan?.acts?.some((item) => item.type === 'RECOMMEND_GROUNDED_ITEM'),
  JSON.stringify(differentKeyGeneralAdvicePlan?.acts));

const deferredGeneralAdvicePlan = compileGeneralAdviceVariant({ adviceGoal: { ...requiredGeneralAdviceGoal, deferred: true } });
check('deferred general advice cannot promote optional support into a current Required obligation',
  deferredGeneralAdvicePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'PREFERRED')
  && !deferredGeneralAdvicePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'),
  JSON.stringify(deferredGeneralAdvicePlan?.acts));

const merchantAdvicePlan = compileGeneralAdviceVariant({ adviceGoal: { ...requiredGeneralAdviceGoal, requestedEvidenceScope: 'MERCHANT_BUSINESS' } });
check('merchant-scoped advice is not relabeled as independently Required general-domain help',
  merchantAdvicePlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED')
  && !merchantAdvicePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'),
  JSON.stringify(merchantAdvicePlan?.acts));

const noAdviceGeneralPlan = compileGeneralAdviceVariant({ requestedDeltas: ['NO_ADVICE'] });
check('NO_ADVICE suppresses even typed Required general guidance while preserving the grounded fact obligation',
  noAdviceGeneralPlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED')
  && !noAdviceGeneralPlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE')
  && noAdviceGeneralPlan?.suppressedActs?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.enforcement === 'HARD'),
  JSON.stringify({ acts: noAdviceGeneralPlan?.acts, suppressed: noAdviceGeneralPlan?.suppressedActs }));

const closedGeneralPlan = compileGeneralAdviceVariant({ close: true, message: '谢谢，就到这里。' });
check('an authoritative conversational close is not reopened by a carried general-advice goal',
  closedGeneralPlan?.answerObligation?.responseTarget?.focus === 'CONVERSATIONAL_CLOSURE'
  && closedGeneralPlan?.acts?.some((item) => item.type === 'NATURAL_CLOSE' && item.necessity === 'REQUIRED')
  && !closedGeneralPlan?.acts?.some((item) => ['PROVIDE_GENERAL_GUIDANCE', 'EXPLAIN_GROUNDED_FACT', 'RECOMMEND_GROUNDED_ITEM'].includes(item.type)),
  JSON.stringify(closedGeneralPlan?.acts));

const unknownGeneralPlan = compileGeneralAdviceVariant({ knownEntity: false });
const unknownGeneralAct = unknownGeneralPlan?.acts?.find((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE');
check('missing entity evidence keeps a useful general obligation alongside the boundary without inventing grounded facts',
  unknownGeneralAct?.necessity === 'REQUIRED'
  && !(unknownGeneralAct.grounding || []).length
  && unknownGeneralPlan?.acts?.some((item) => item.type === 'EXPLAIN_BOUNDARY' && item.necessity === 'REQUIRED')
  && !unknownGeneralPlan?.acts?.some((item) => ['EXPLAIN_GROUNDED_FACT', 'RECOMMEND_GROUNDED_ITEM'].includes(item.type)),
  JSON.stringify(unknownGeneralPlan?.acts));

check('actual general-help parameters transport conditional judgment permission with unknown-premise and probability-wording limits',
  [requiredGeneralAdviceAct, factualPreferredHelpAct, unknownGeneralAct].every((act) => {
    const purpose = String(act?.parameters?.decisionPurpose || '');
    return purpose.includes('有条件的趋势判断')
      && purpose.includes('尚未确认的前提只能保留为条件')
      && purpose.includes('概率措辞不能洗白')
      && purpose.includes('不得声称已查过网络或商家系统');
  }));

const pureFactNoAdviceUnderstanding = structuredClone(factualCompilerUnderstanding);
pureFactNoAdviceUnderstanding.humanContext.dialogueObligation = {
  ...pureFactNoAdviceUnderstanding.humanContext.dialogueObligation,
  requestedDeltas: ['NO_ADVICE'],
};
const pureFactNoAdvicePlan = assessmentCompiler.compileShadow({
  understanding: pureFactNoAdviceUnderstanding,
  plan: compilerPlanFixture(pureFactNoAdviceUnderstanding.humanContext.dominantTurnGoal),
  deterministic: deterministicFixture,
  conversationState: compilerStateFixture(['NO_ADVICE']),
  knowledgeEntries: [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT')].filter(Boolean),
  latestCustomerMessage: '只回答当前已知事实，不要给额外建议。',
  conversationHistory: [],
});
check('NO_ADVICE still removes preferred general-help permission while leaving the required grounded fact owner intact',
  Boolean(pureFactNoAdvicePlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT' && item.necessity === 'REQUIRED'))
  && !pureFactNoAdvicePlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE')
  && pureFactNoAdvicePlan?.suppressedActs?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.enforcement === 'HARD'),
  JSON.stringify({ acts: pureFactNoAdvicePlan?.acts, suppressed: pureFactNoAdvicePlan?.suppressedActs }));

const noAdviceAssessmentUnderstanding = structuredClone(assessmentCompilerUnderstanding);
noAdviceAssessmentUnderstanding.humanContext.dialogueObligation = {
  ...noAdviceAssessmentUnderstanding.humanContext.dialogueObligation,
  requestedDeltas: ['NO_ADVICE'],
};
const noAdviceAssessmentPlan = assessmentCompiler.compileShadow({
  understanding: noAdviceAssessmentUnderstanding,
  plan: compilerPlanFixture(noAdviceAssessmentUnderstanding.humanContext.dominantTurnGoal),
  deterministic: deterministicFixture,
  conversationState: compilerStateFixture(['NO_ADVICE']),
  knowledgeEntries: [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT'), retrievalWithAssessmentRole.find((item) => item.id === 'G-ASSESS')].filter(Boolean),
  latestCustomerMessage: '只告诉我当前对象属性，别给建议。',
  conversationHistory: [],
});
check('customer NO_ADVICE hard boundary still removes assessment guidance without removing grounded current-entity facts',
  Boolean(noAdviceAssessmentPlan?.acts?.some((item) => item.type === 'EXPLAIN_GROUNDED_FACT'))
  && !noAdviceAssessmentPlan?.acts?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE')
  && noAdviceAssessmentPlan?.suppressedActs?.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.enforcement === 'HARD'),
  JSON.stringify({ acts: noAdviceAssessmentPlan?.acts, suppressed: noAdviceAssessmentPlan?.suppressedActs }));

const selectionCompilerUnderstanding = structuredClone(compoundUnderstanding);
selectionCompilerUnderstanding.factOwnership = assessmentCompilerUnderstanding.factOwnership;
const selectionCompiledPlan = assessmentCompiler.compileShadow({
  understanding: selectionCompilerUnderstanding,
  plan: compilerPlanFixture(selectionCompilerUnderstanding.humanContext.dominantTurnGoal),
  deterministic: deterministicFixture,
  conversationState: compilerStateFixture(),
  knowledgeEntries: [retrievalWithAssessmentRole.find((item) => item.id === 'P-CURRENT')].filter(Boolean),
  latestCustomerMessage: '这些选项里优先哪个？',
  conversationHistory: [],
});
check('selection contract remains recommendation-shaped and is not converted into current-option assessment guidance',
  Boolean(selectionCompiledPlan?.acts?.some((item) => item.type === 'RECOMMEND_GROUNDED_ITEM'))
  && !selectionCompiledPlan?.acts?.some((item) => String(item.reasonCode || '').includes('CURRENT_OPTION_ASSESSMENT_GUIDANCE_REQUIRED')),
  JSON.stringify(selectionCompiledPlan?.acts));
check('Conformance exact removal cleans orphaned soft punctuation only when deletion exposes a surface boundary',
  conformanceSrc.includes('hasSurfaceBoundaryBeforeRemoval(prefix)')
  && conformanceSrc.includes('orphanedSoftSeparatorLength(exactText)')
  && (conformanceSrc.match(/projectAuthorizedSurfacePieces\(pieces\)/g) || []).length === 2);

// Proposition Grounding: whether merchant evidence is needed is independent from Act/contribution wrapper.
check('Semantic Conformance single classifier owns proposition evidence plus merchant referent scope independently from contribution kind',
  conformanceSrc.includes("version: 'HVE_SEMANTIC_SPANS_V4'")
  && conformanceSrc.includes('MERCHANT_ENTITY_EVIDENCE_REQUIRED')
  && conformanceSrc.includes('evidenceRequirement is an independent proposition-semantic axis')
  && conformanceSrc.includes('merchantReferentRefs is a separate semantic referent-scope axis')
  && conformanceSrc.includes('MODEL_SINGLE_SEMANTIC_SPAN_ACTION_GROUP_AND_REFERENT_AUTHORITY_V12')
  && conformanceSrc.includes('Runtime derives offsets/atom ids only after proving exact exhaustive coverage'));
check('partial-support refinement is a same-call typed representation refinement, not Runtime lexical splitting or a second semantic owner',
  conformanceSrc.includes('partialSupportSpans is a one-level refinement owned by this SAME classifier call')
  && conformanceSrc.includes('byte-exact exhaustive partition of the parent exactText')
  && conformanceSrc.includes("span.groundingEntailment === 'PARTIALLY_SUPPORTED'")
  && conformanceSrc.includes('span.partialSupportSpans.length >= 2')
  && conformanceSrc.includes("span.partialSupportSpans.map((leaf) => leaf.exactText).join('') === span.exactText")
  && conformanceSrc.includes('groundedActionUnitIds.has(unit.unitId)')
  && conformanceSrc.includes('partialSupportSpans is an optional, permission-reducing refinement')
  && conformanceSrc.includes('refinement must never invalidate an otherwise valid parent classification')
  && conformanceSrc.includes('partialSupportResult.ok ? partialSupportResult.value : []')
  && !conformanceSrc.includes('partialSupportRegex')
  && !conformanceSrc.includes('splitPartialSupportByPunctuation')
  && (conformanceSrc.match(/modelGateway\.generate\(/g) || []).length === 1);
check('epistemic evidence insufficiency is a typed evidence-boundary state, not an object-level merchant outcome or a phrase-specific exception',
  conformanceSrc.includes('MERCHANT_ENTITY_EVIDENCE_BOUNDARY is only for an EPISTEMIC conclusion about evidential sufficiency')
  && conformanceSrc.includes('must NOT assert that referenced proposition true or false')
  && conformanceSrc.includes('A general rule remains NOT_REQUIRED')
  && conformanceSrc.includes('merchantEvidenceBoundaryRuntimeCompatible')
  && conformanceSrc.includes("classification.groundingEntailment === 'NOT_APPLICABLE'")
  && conformanceSrc.includes('classification.groundingSupport.length === 0')
  && (conformanceSrc.match(/modelGateway\.generate\(/g) || []).length === 1);
check('evidence boundary target follows the epistemic proposition and can remain TASK_OR_DOMAIN_FACT without becoming merchant fact authority',
  conformanceSrc.includes('TASK_OR_DOMAIN_FACT is also valid')
  && conformanceSrc.includes("['MERCHANT_ENTITY_OR_POLICY', 'ACTION_OPTION_RISK_OR_OUTCOME', 'TASK_OR_DOMAIN_FACT']")
  && conformanceSrc.includes('classification.groundingSupport.length === 0'));
check('bounded suitability synthesis combines customer constraints with proven merchant premises but never upgrades performance or status',
  conformanceSrc.includes('customer-owned constraints from latestCustomerMessage')
  && conformanceSrc.includes('merchant-side premises that are themselves directly supported')
  && conformanceSrc.includes('must never be used to upgrade an unconfigured product performance'));
check('merchant referent cross-axis enforcement is permission-reducing and does not add a Runtime open-language parser',
  conformanceSrc.includes('merchantReferentScopeRequiresEvidence')
  && conformanceSrc.includes("violationCode = 'UNAUTHORIZED_SEMANTIC_CONTRIBUTION'")
  && conformanceSrc.includes('Runtime does not infer which merchant proposition is')
  && !conformanceSrc.includes('MERCHANT_REFERENT_KEYWORD')
  && !conformanceSrc.includes('merchantReferentRegex')
  && (conformanceSrc.match(/modelGateway\.generate\(/g) || []).length === 1);
check('ordinary Generation keeps missing merchant facts separate from useful general knowledge and never invents web verification',
  promptSrc.includes('缺失或只部分命中的业务知识只限制依赖该缺口的具体结论强度')
  && promptSrc.includes('不应把整轮问题变成拒答')
  && promptSrc.includes('只有 Runtime 实际提供了外部检索结果/来源证据时')
  && promptSrc.includes('不得声称上网查到、实时搜索或已经核实'));
check('surface realization may use natural short paragraphs without creating semantic or message-boundary authority',
  promptSrc.includes('表面组织属于 HOW')
  && promptSrc.includes('通常两到三段即可')
  && promptSrc.includes('不是固定段数、句数或消息气泡配额')
  && promptSrc.includes('不得新增/删除 Act、改变 Grounding'));
check('selected merchant Knowledge is classifier evidence context only and cannot create Canonical Grounding authority',
  conformanceSrc.includes('authorizedKnowledgeEvidence')
  && conformanceSrc.includes('availableGroundingEvidence: input.knowledgeEvidence')
  && conformanceSrc.includes('seeing an evidence ref here cannot create Grounding'));
check('REMOVE path defers only a Runtime-owned removable task-material Required candidate to typed post-correction completion',
  conformanceSrc.includes("decision === 'REMOVE_UNAUTHORIZED_SPANS'")
  && conformanceSrc.includes('collectRemovedMaterialCandidatesForRequiredAct(checks, removals, requiredAct).length > 0')
  && conformanceSrc.includes('TASK_MATERIAL_REQUIRED_VALUE_ACT_TYPES.has(requiredAct.type)')
  && conformanceSrc.includes('PASS remains strict')
  && conformanceSrc.includes('validateTaskMaterialRequiredValueRealizationAfterCorrection')
  && conformanceSrc.includes('CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION'));
const groundedNormalizationCallCount = (conformanceSrc.match(/normalizeGroundedSubstantiveContributionKind\(classification\)/g) || []).length;
const groundedNormalizationFunction = conformanceSrc.match(/function\s+normalizeGroundedSubstantiveContributionKind[\s\S]*?\n}\n/); 
check('merchant evidence-required ANSWER/GUIDANCE is normalized to Grounded semantics even with zero realized refs',
  groundedNormalizationCallCount >= 2
  && !!groundedNormalizationFunction
  && groundedNormalizationFunction[0].includes("classification.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'")
  && groundedNormalizationFunction[0].includes('GROUNDABLE_SUBSTANTIVE_CONTRIBUTION_KINDS.has(classification.contributionKind)')
  && groundedNormalizationFunction[0].includes("'GROUNDED_CONTENT'"));

// Enforcement: checker failure and successfully-classified evidence-required failure cannot become Send authority.
check('HVE fail-safe blocks checker self-failure when either actual Grounded ownership or typed Canonical merchant-evidence obligation exists',
  hveSrc.includes('const checkerSelfFailure')
  && hveSrc.includes('hasGroundedCustomerVisibleBindings(generation) || hasMerchantEvidenceRequiredTurn(contract)')
  && hveSrc.includes("knowledgeRequirement\n    === 'BUSINESS_FACT_GROUNDING_REQUIRED'")
  && !/function hasGroundedCustomerVisibleBindings[\s\S]{0,900}allowedGroundingRefs/.test(hveSrc)
  && !/function hasMerchantEvidenceRequiredTurn[\s\S]{0,500}latestCustomerMessage/.test(hveSrc));
check('HVE fail-safe also blocks CLASSIFIED merchant-evidence-required propositions that remain unproven, without reading raw wording',
  hveSrc.includes("trace.decision === 'UNPROVEN_PRESERVED'")
  && hveSrc.includes("span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'")
  && !/hasPropositionLevelMerchantEvidenceRequirement[\s\S]{0,900}latestCustomerMessage/.test(hveSrc));
check('root fix adds no semantic retry, judge, free rewrite, or second model call',
  !/(SemanticConformanceRetry|ConformanceJudge|SemanticRepair|\.rewrite\s*\()/i.test(hveSrc)
  && (conformanceSrc.match(/modelGateway\.generate\(/g) || []).length === 1);

const whitespaceCoverageRecoveryFunction=conformanceSrc.match(/function recoverWhitespaceOnlySemanticSpanCoverage[\s\S]*?\n}\n\nfunction projectClassifierSemanticSpans/);
check('conformance span protocol may repair presentation-only whitespace but still rejects substantive coverage mutation',
  !!whitespaceCoverageRecoveryFunction
  && whitespaceCoverageRecoveryFunction[0].includes("stripWhitespace(spans.map((span) => span.exactText).join(''))")
  && whitespaceCoverageRecoveryFunction[0].includes('CONFORMANCE_SEMANTIC_SPAN_COVERAGE_MISMATCH')
  && !/(keyword|alias|title|productName|latestCustomerMessage)/i.test(whitespaceCoverageRecoveryFunction[0]));
check('checker protocol failure no longer exposes the internal retry notice and still cannot raw-send unproven merchant facts',
  hveSrc.includes('shouldUseGroundedConformanceFailureDegradation')
  && hveSrc.includes('hasMerchantEvidenceRequiredTurn(contract)')
  && hveSrc.includes("['LOCAL_PROTOCOL_ERROR', 'INVALID_RESPONSE', 'UNAVAILABLE']")
  && hveSrc.includes('buildFactFreeUsefulServiceFloor')
  && hveSrc.includes("'FACT_FREE_USEFUL_SERVICE_FLOOR'")
  && hveSrc.includes('planSatisfied: false')
  && !hveSrc.includes('抱歉，这次回复处理出了问题，没能把答复完整给你，请重试这一条。')
  && !hveSrc.includes('这轮有些具体信息还没能可靠确认')
  && !hveSrc.includes('这次回复处理出了问题'));

check('project rules make symptoms non-Authority and require producer-to-enforcement root tracing',
  project.includes('失败样例只作 witness / reproducer / regression fixture')
  && project.includes('producer→representation/state→actual consumer→enforcement/completion→最终结果')
  && project.includes('不得把样例里的某个词、动作、商品、错误码或测试句直接升级成 Runtime 修复维度'));
check('V26 states proposition Grounding is semantic, not DIRECT_ANSWER/GUIDANCE/EXPLAIN wrapper authority',
  v26.includes('Grounding Requirement 由 proposition 语义拥有')
  && v26.includes('DIRECT_ANSWER') && v26.includes('GUIDANCE') && v26.includes('EXPLAIN'));

check('typed executable contribution axis, not the legacy goal-key whitelist, defines a valid current-turn semantic owner',
  deepSrc.includes('return goal && isCustomerServiceExecutableTypedGoal(goal) ? goal : null')
  && deepSrc.includes("['INFORMATION', 'DECISION_SUPPORT', 'ACTION', 'ADVICE']")
  && !/readRawModelCurrentTurnGoalValue[\s\S]{0,500}CURRENT_TURN_AUTHORITATIVE_GOALS\.has\(goal\.key\)/.test(deepSrc));

console.log(`\nRoot-Cause Semantic Authority: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
