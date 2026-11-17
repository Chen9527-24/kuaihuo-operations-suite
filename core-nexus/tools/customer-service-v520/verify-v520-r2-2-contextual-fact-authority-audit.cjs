#!/usr/bin/env node
'use strict';
// User-run offline gate. The model is a fixture; this does not certify Live.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');
const base = path.resolve(__dirname, '../../src/modules/customer-service-agent');
const use = p => require(path.join(base, p));
const simulationSrc = fs.readFileSync(path.join(base, 'runtime/simulation/customer-service-simulation.service.ts'), 'utf8').replace(/\r\n?/g, '\n');
const behavior = use('runtime/behavior/customer-service-behavior-memory.util.ts');
const referent = use('runtime/understanding/customer-service-contextual-referent.ts');
const semantics = use('runtime/understanding/customer-service-explicit-semantics.ts');
const reducer = use('runtime/state/customer-service-conversation-state.reducer.ts');
const knowledge = use('shared/context/customer-service-knowledge.util.ts');
const { resolveCustomerServiceAnswerObligation } = use('runtime/interaction/customer-service-answer-obligation.ts');
const { CustomerServiceMessageUnderstandingService } = use('runtime/understanding/customer-service-message-understanding.service.ts');
const { CustomerServiceDeepRecognitionService } = use('runtime/understanding/customer-service-deep-recognition.service.ts');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
const message = '那你更推荐的那条具体是什么面料？办公室空调不太足的话会不会闷？';
// Shape from 2026-09-09 Live: two products in ONE generated unit,
// each already proved by a separate immutable Conformance atom.
const textA = '优先考虑甲款，它的版型比较宽松。';
const textB = '乙款偏贴身，不建议优先选。';
const span = (text, refs, authorized = true) => ({ exactText: text, realizedGroundingRefs: refs, authorized });
const trace = { hve3: { semanticConformance: { decision: 'REMOVED_UNAUTHORIZED_SPANS', unitChecks: [{
  authorized: true, realizedGroundingRefs: ['A', 'B'], semanticSpans: [
    span(textA, ['A']), span('不应保留的内容。', ['X'], false),
    span(textB, ['B']), span('普通说明。', []),
  ],
}] } } };
const units = behavior.extractCustomerServiceProvenGroundedUnitsFromReplyTrace(trace);
check('one generated unit retains separate atom-to-entity evidence', () => {
  assert.deepEqual(units, [{ text: textA, groundingRefs: ['A'] }, { text: textB, groundingRefs: ['B'] }]);
});
const observation = behavior.buildCustomerServiceAssistantBehaviorObservation({
  text: textA + textB, evidenceMessageIds: ['delivered'], realizedGroundingRefs: ['A', 'B'], provenGroundedUnits: units,
});
const state = { ...reducer.emptyCustomerServiceConversationStateV2(), currentTurn: 2, revision: 2,
  assistantMoveLedger: [{ turn: 1, move: 'RECOMMEND', excerpt: textA + textB,
    accepted: null, rejected: false, requestedDeltas: [], behavior: observation }] };
const entries = ['A', 'B'].map(id => ({ id, entityType: 'PRODUCT', entityKey: 'ITEM_' + id,
  title: id === 'A' ? '甲款' : '乙款', aliases: [], selectionReason: 'CURRENT_AND_STATE', matchEvidence: ['CONTENT:面料'] }));
const signal = { status: 'UNIQUE', candidateId: 'delivered-unit-0', evidence: '你更推荐的那条',
  sourceQuote: textA, confidence: .98 };
const ownership = (text = message, raw = signal) => semantics.resolveCustomerServiceFactOwnership(
  text, 'PRODUCT_CONSULT', 'ASK_INFORMATION', referent.resolveCustomerServiceContextualReferentEvidence(raw, text));
const finalize = (text = message, raw = signal, catalog = entries, previous = state) =>
  semantics.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
    ownership: ownership(text, raw), primaryScenario: 'PRODUCT_CONSULT', primaryIntent: 'ASK_INFORMATION',
    message: text, knowledgeEntries: catalog,
    priorDeliveredGroundingRefs: previous.assistantMoveLedger.at(-1)?.behavior?.realizedGroundingRefs || [],
    contextualReferentSelection: referent.resolveCustomerServiceContextualReferentSelection(raw, text, previous),
  });
const resolved = finalize();
check('delivered observation -> bounded relation -> finalizer selects only A', () => {
  assert.deepEqual(resolved.namedOfferingReferent.resolvedGroundingIds, ['A']);
  assert.deepEqual(knowledge.selectCustomerServiceBusinessFactGroundingEntries({ entries, factOwnership: resolved }).map(e => e.id), ['A']);
});
check('actual near/far demonstratives retain business scope without model signal', () => {
  for (const text of [message, '那款参数是什么？', '那一台兼容什么系统？', '这件是什么成分？']) {
    assert.equal(ownership(text, null).scope, 'CURRENT_BUSINESS_FACT', text);
    assert.equal(finalize(text, null, [], reducer.emptyCustomerServiceConversationStateV2()).scope, 'CURRENT_BUSINESS_FACT');
  }
});
check('unresolved relation cannot fall back to general facts when candidates are missing', () => {
  const text = '刚才你排除的那个，连续用一整天合适吗？';
  const raw = { status: 'UNRESOLVED', evidence: '刚才你排除的那个', confidence: .97 };
  const result = finalize(text, raw, [], reducer.emptyCustomerServiceConversationStateV2());
  assert.equal(result.scope, 'CURRENT_BUSINESS_FACT');
  assert.equal(result.namedOfferingReferent.status, 'UNMATCHED_NAMED_OFFERING');
  assert.deepEqual(knowledge.selectCustomerServiceBusinessFactGroundingEntries({ entries, factOwnership: result }), []);
});
check('ambiguous or unselected relation preserves the business boundary', () => {
  for (const raw of [null, { ...signal, status: 'AMBIGUOUS' }, { ...signal, candidateId: 'missing' }]) {
    const result = finalize(message, raw);
    assert.equal(result.scope, 'CURRENT_BUSINESS_FACT');
    assert.equal(result.namedOfferingReferent.status, 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY');
    assert.deepEqual(result.namedOfferingReferent.resolvedGroundingIds, []);
  }
});
check('missing selected entity and retrieval subset do not manufacture uniqueness', () => {
  assert.notEqual(finalize(message, signal, [entries[1]]).namedOfferingReferent.status, 'EXACT_STRUCTURED_ENTITY');
  assert.notEqual(finalize(message, null, [entries[0]]).namedOfferingReferent.status, 'EXACT_STRUCTURED_ENTITY');
});
check('an inseparable multi-ref atom stays multi-ref even when quoted partially', () => {
  const mixed = structuredClone(trace);
  mixed.hve3.semanticConformance.unitChecks[0].semanticSpans = [span(textA + textB, ['A', 'B'])];
  const mixedUnits = behavior.extractCustomerServiceProvenGroundedUnitsFromReplyTrace(mixed);
  const mixedState = { ...state, assistantMoveLedger: [{ behavior: { ...observation, provenGroundedUnits: mixedUnits } }] };
  assert.deepEqual(referent.resolveCustomerServiceContextualReferentSelection(signal, message, mixedState).groundingRefs, ['A', 'B']);
  assert.equal(finalize(message, signal, entries, mixedState).namedOfferingReferent.status, 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY');
});
check('unproven, unauthorized and unsent evidence cannot become a relation candidate', () => {
  const unknown = structuredClone(trace);
  unknown.hve3.semanticConformance.decision = 'UNPROVEN_PRESERVED';
  assert.deepEqual(behavior.extractCustomerServiceProvenGroundedUnitsFromReplyTrace(unknown), []);
  const partial = behavior.buildCustomerServiceAssistantBehaviorObservation({
    text: textA, evidenceMessageIds: ['partial'], realizedGroundingRefs: ['A', 'B'], provenGroundedUnits: units,
  });
  assert.deepEqual(partial.provenGroundedUnits, [{ text: textA, groundingRefs: ['A'] }]);
  assert.deepEqual(partial.realizedGroundingRefs, ['A']);
});
check('invalid signal never provides relation evidence', () => {
  for (const raw of [null, { ...signal, status: 'NONE' }, { ...signal, status: 'NEW' },
    { ...signal, confidence: .2 }, { ...signal, confidence: '0.98' },
    { ...signal, confidence: NaN }, { ...signal, evidence: '不在当前原文' }]) {
    assert.equal(referent.resolveCustomerServiceContextualReferentEvidence(raw, message), null);
  }
});
check('general-domain questions do not inherit a previously recommended entity', () => {
  for (const text of ['聚酯衬衫一般会不会闷？', '一般怎么选择面料？', '设备一般如何保养？']) {
    const result = finalize(text, { ...signal, status: 'NONE' });
    assert.equal(result.scope, 'GENERAL_DOMAIN');
    assert.notEqual(result.namedOfferingReferent.status, 'EXACT_STRUCTURED_ENTITY');
  }
});
check('new unmatched name cannot inherit an old contextual selection', () => {
  const text = '你更推荐的那条不是，我问「未收录新型号」具体是什么面料？';
  const result = finalize(text, signal);
  assert.equal(result.namedOfferingReferent.status, 'UNMATCHED_NAMED_OFFERING');
  assert.deepEqual(result.namedOfferingReferent.resolvedGroundingIds, []);
});
check('current exact name outranks previous relation', () => {
  const text = '你更推荐的那条先不说，「乙款」具体是什么面料？';
  const result = finalize(text, signal, [{ ...entries[1], matchEvidence: ['NAMED_OFFERING_EXACT_MATCH:乙款'] }]);
  assert.deepEqual(result.namedOfferingReferent.resolvedGroundingIds, ['B']);
});
function obligation(facts, text = message) {
  return resolveCustomerServiceAnswerObligation({
    interactionType: 'PRODUCT_FACT_QUERY', latestCustomerMessage: text, conversationHistory: [], knowledgeEntries: entries,
    conversationState: { latestFeedback: null, recentAssistantMoves: [] },
    understanding: { primaryScenario: 'PRODUCT_CONSULT', primaryIntent: 'ASK_INFORMATION', factOwnership: facts,
      humanContext: { requiredTurnGoals: [], dominantTurnGoal: { key: 'ANSWER_INFORMATION', evidence: [text], confidence: .98 } } },
  });
}
check('real AnswerObligation consumes resolved and unresolved scope as business grounding', () => {
  for (const facts of [resolved, finalize(message, null), finalize(message, signal, [])]) {
    assert.equal(obligation(facts).responseTarget.knowledgeRequirement, 'BUSINESS_FACT_GROUNDING_REQUIRED');
  }
});
check('simulation wires only typed contextual prior Grounding refs into Knowledge recall', () => {
  assert.ok(simulationSrc.includes('resolveKnowledgeRecallGroundingRefs('));
  assert.ok(simulationSrc.includes('priorDeliveredGroundingRefs,'));
  assert.ok(simulationSrc.includes("referent?.source === 'CONTEXTUAL_GROUNDED_ENTITY'"));
  assert.ok(!/resolveKnowledgeRecallGroundingRefs[\s\S]{0,1800}(?:includes\(|match\(|test\()[^\n]*(?:这件|这款|那个|推荐)/u.test(simulationSrc));
});
const runtimeEntry = (id, entityKey, title, content = `${title} 的结构化业务事实。`) => ({
  id, collectionId: null, scopeType: 'MERCHANT_ROLE', scopeKey: 'ROLE', entityType: 'PRODUCT', entityKey, aliases: [],
  structuredData: null, references: [], authorityLevel: 'BUSINESS_FACT', category: 'PRODUCT', title, question: null, content, tags: [],
  sourceType: 'MANUAL', sourceReference: null, revision: 1, effectiveFrom: null, effectiveTo: null, updatedAt: new Date('2026-09-11T00:00:00Z'),
});
const previousProduct = runtimeEntry('P-PREV', 'PREV', '上一轮已交付商品');
const lexicalCompetitor = runtimeEntry('P-LEX', 'LEX', '版型相关候选', '版型 具体 通勤 的候选业务事实。');
const recalledSelection = knowledge.selectCustomerServiceRuntimeKnowledgeDetailed([previousProduct, lexicalCompetitor], {
  message: '这件版型具体怎么样？', scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION',
  priorDeliveredGroundingRefs: ['P-PREV'], maxEstimatedTokens: 1000,
});
check('prior delivered proven ref is recalled ahead of unrelated lexical candidates without becoming current-message identity', () => {
  const prior = recalledSelection.selected.find(item => item.id === 'P-PREV');
  assert.ok(prior);
  assert.equal(prior.selectionReason, 'STATE');
  assert.ok((prior.matchEvidence || []).includes('PRIOR_DELIVERED_GROUNDING_REF_RECALL'));
  assert.equal(knowledge.isCustomerServiceCurrentMessageEntityGroundingEntry(prior), false);
});
const noRecallSelection = knowledge.selectCustomerServiceRuntimeKnowledgeDetailed([previousProduct, lexicalCompetitor], {
  message: '这件版型具体怎么样？', scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION', maxEstimatedTokens: 1000,
});
check('absence of structured prior refs cannot recall the previous entity by history alone', () => {
  assert.ok(!noRecallSelection.selected.some(item => item.id === 'P-PREV'));
});
const multiRecallSelection = knowledge.selectCustomerServiceRuntimeKnowledgeDetailed([
  previousProduct, runtimeEntry('P-OTHER', 'OTHER', '另一已交付商品'), lexicalCompetitor,
], {
  message: '这件版型具体怎么样？', scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION',
  priorDeliveredGroundingRefs: ['P-PREV', 'P-OTHER'], maxEstimatedTokens: 1000,
});
check('multiple prior proven entities are recalled as a set rather than arbitrarily selecting one', () => {
  assert.deepEqual(multiRecallSelection.selected.filter(item => item.id.startsWith('P-') && item.id !== 'P-LEX').map(item => item.id).sort(), ['P-OTHER', 'P-PREV']);
});
async function verifyRecognitionEntry() {
  const dto = { message, conversationState: state, conversationHistory: [
    { role: 'CUSTOMER', content: '帮我选适合通勤的裤子。' }, { role: 'ASSISTANT', content: textA + textB },
  ] };
  const heuristic = new CustomerServiceMessageUnderstandingService().understand(dto);
  const calls = [];
  const gateway = { isConfigured: () => true, generate: async input => {
    calls.push(input);
    const goal = {
      key: 'ANSWER_INFORMATION',
      requestedContributionKind: 'INFORMATION',
      requestedEvidenceScope: 'MERCHANT_BUSINESS',
      requestedDecisionMode: 'NOT_APPLICABLE',
      priority: 100,
      confidence: .98,
      evidence: ['那你更推荐的那条具体是什么面料？'],
      source: 'EXPLICIT',
      deferred: false,
    };
    return { ok: true, content: JSON.stringify({
      primaryScenario: 'PRODUCT_CONSULT',
      primaryIntent: 'ASK_INFORMATION',
      riskLevel: 'LOW',
      emotion: 'NEUTRAL',
      confidence: .98,
      contextualReferentSignal: signal,
      humanContext: { rankedTurnGoals: [goal], dominantTurnGoal: goal },
    }), elapsedMs: 1, finishReason: 'stop', model: 'offline-fixture', requestId: 'fixture' };
  } };
  const result = await new CustomerServiceDeepRecognitionService(gateway).refine(dto, heuristic, []);
  check('public DeepRecognition path transports atom candidates and independent fact scope', () => {
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0].messages.find(m => m.role === 'user').content);
    assert.equal(payload.deliveredReferentCandidates.length, 2);
    assert.deepEqual(payload.deliveredReferentCandidates[0].groundingRefs, ['A']);
    assert.equal(result.factOwnership.scope, 'CURRENT_BUSINESS_FACT');
    assert.equal(result.factOwnership.namedOfferingReferent.surface, signal.evidence);
    assert.deepEqual(result.contextualReferentSelection.groundingRefs, ['A']);
  });
}
verifyRecognitionEntry().then(() => console.log('R2.2 contextual fact authority audit: ' + count + ' checks passed; Live pending.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
