#!/usr/bin/env node
'use strict';
// Offline regression gate. Model outputs are fixtures, not Live/model-quality proof.
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../../tsconfig.json');
process.env.CUSTOMER_SERVICE_LONG_HORIZON_STATE_V2 = 'true';
require('ts-node/register/transpile-only');
const base = path.resolve(__dirname, '../../src/modules/customer-service-agent/runtime');
const use = p => require(path.join(base, p));
const feedback = use('understanding/customer-service-dialogue-obligation.ts');
const behavior = use('behavior/customer-service-behavior-memory.util.ts');
const referent = use('understanding/customer-service-contextual-referent.ts');
const semantics = use('understanding/customer-service-explicit-semantics.ts');
const reducer = use('state/customer-service-conversation-state.reducer.ts');
const { resolveCustomerServiceAnswerObligation } = use('interaction/customer-service-answer-obligation.ts');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
const message = '那你推荐的这款具体是什么面料？夏天办公室穿会不会闷？';
const history = [{ role: 'CUSTOMER', content: '帮我选一款。' }, { role: 'ASSISTANT', content: '优先考虑甲款，乙款不太适合。' }];
const neutral = feedback.inferCustomerServiceDialogueObligation(message, history);
check('ordinary specific follow-up does not reject previous recommendation', () => {
  assert.equal(neutral.userFeedback, 'UNCLEAR');
  assert.equal(neutral.strategyChangeRequired, false);
  assert.equal(neutral.rejectedMove, null);
  assert(neutral.requestedDeltas.includes('MORE_SPECIFIC'));
});
check('model cannot turn current request evidence into insufficient reception', () => {
  const final = feedback.reconcileCustomerServiceDialogueObligationWithModelSignal(neutral, {
    userFeedback: 'INSUFFICIENT', previousAdviceOutcome: 'NONE',
    requestedDeltas: ['MORE_SPECIFIC'], correctionTarget: 'BUSINESS_ACTION',
    evidence: '具体是什么面料', receptionEvidence: { insufficient: '具体是什么面料' }, confidence: .99,
  }, { message, previousAssistantText: history[1].content, currentTurnGoalEvidence: [message] });
  assert.equal(final.userFeedback, 'UNCLEAR'); assert.equal(final.rejectedMove, null);
  assert.equal(final.strategyChangeRequired, false);
});
check('genuine rejection and explicit insufficiency remain distinct', () => {
  const rejected = feedback.inferCustomerServiceDialogueObligation('这个回答不对，换个方案。', history);
  assert.equal(rejected.userFeedback, 'REJECTED'); assert.equal(rejected.strategyChangeRequired, true);
  const insufficient = feedback.inferCustomerServiceDialogueObligation('还是太笼统，再具体一点。', history);
  assert.equal(insufficient.userFeedback, 'INSUFFICIENT'); assert.equal(insufficient.rejectedMove, null);
});
const ownership = semantics.resolveCustomerServiceFactOwnership(message, 'PRODUCT_CONSULT', 'ASK_INFORMATION');
const understanding = {
  primaryScenario: 'PRODUCT_CONSULT', primaryIntent: 'ASK_INFORMATION', factOwnership: ownership,
  humanContext: { dialogueObligation: neutral, requiredTurnGoals: [],
    dominantTurnGoal: { key: 'ANSWER_INFORMATION', evidence: [message], confidence: .98,
      deferred: false, responseRequirement: '回答当前问题' } },
};
check('current fact goal owns target despite prior recommendation and lexical recommendation', () => {
  const result = resolveCustomerServiceAnswerObligation({
    interactionType: 'PRODUCT_FACT_QUERY', latestCustomerMessage: message, conversationHistory: history,
    understanding, knowledgeEntries: [], conversationState: { latestFeedback: neutral,
      recentAssistantMoves: [{ behavior: { planFulfillment: 'FULFILLED', interactionPlanV2: { answerFocus: 'RECOMMENDATION' } } }] },
  });
  assert.equal(result.currentFocus, 'CURRENT_SPECIFIC_QUESTION');
  assert.equal(result.responseTarget.unresolvedNeed, message);
});
check('short fact follow-up cannot take the generic expansion shortcut', () => {
  const shortMessage = '这款具体什么面料？';
  const result = resolveCustomerServiceAnswerObligation({
    interactionType: 'PRODUCT_FACT_QUERY', latestCustomerMessage: shortMessage, conversationHistory: history,
    understanding: { ...understanding, humanContext: { ...understanding.humanContext,
      dominantTurnGoal: { ...understanding.humanContext.dominantTurnGoal, evidence: [shortMessage] } } },
    knowledgeEntries: [], conversationState: { latestFeedback: neutral,
      recentAssistantMoves: [{ behavior: { planFulfillment: 'FULFILLED', interactionPlanV2: { answerFocus: 'RECOMMENDATION' } } }] },
  });
  assert.equal(result.currentFocus, 'CURRENT_SPECIFIC_QUESTION');
  assert.equal(result.responseTarget.unresolvedNeed, shortMessage);
});
check('genuine current purchase-decision goal still permits recommendation', () => {
  const request = '推荐一款适合我的。';
  const result = resolveCustomerServiceAnswerObligation({
    interactionType: 'PRODUCT_DISCOVERY', latestCustomerMessage: request, conversationHistory: history,
    understanding: { ...understanding, humanContext: { ...understanding.humanContext,
      dominantTurnGoal: { key: 'SUPPORT_PURCHASE_DECISION', evidence: [request], confidence: .98 } } },
    knowledgeEntries: [], conversationState: { latestFeedback: neutral, recentAssistantMoves: [] },
  });
  assert.equal(result.currentFocus, 'RECOMMENDATION');
});
const trace = { hve3: { semanticConformance: { decision: 'REMOVED_UNAUTHORIZED_SPANS', unitChecks: [
  { authorized: true, realizedGroundingRefs: ['A'], semanticSpans: [
    { authorized: true, exactText: '优先考虑甲款。', realizedGroundingRefs: ['A'], realizedActIds: ['FACT'] },
    { authorized: false, exactText: '隐藏未授权内容。', realizedGroundingRefs: ['X'], realizedActIds: [] },
  ] },
  { authorized: true, realizedGroundingRefs: ['B'], semanticSpans: [
    { authorized: true, exactText: '乙款不太适合。', realizedGroundingRefs: ['B'], realizedActIds: ['FACT'] },
  ] },
] } } };
const units = behavior.extractCustomerServiceProvenGroundedUnitsFromReplyTrace(trace);
check('surviving text stays paired with its own proven refs', () => {
  assert.deepEqual(units, [{ text: '优先考虑甲款。', groundingRefs: ['A'] }, { text: '乙款不太适合。', groundingRefs: ['B'] }]);
  assert.deepEqual(behavior.extractCustomerServiceProvenGroundedUnitsFromReplyTrace({ hve3: { semanticConformance: { ...trace.hve3.semanticConformance, decision: 'UNPROVEN_PRESERVED' } } }), []);
});
const observed = behavior.buildCustomerServiceAssistantBehaviorObservation({
  text: '优先考虑甲款。乙款不太适合。', evidenceMessageIds: ['assistant-1'],
  realizedGroundingRefs: ['A', 'B'], provenGroundedUnits: units,
});
const state = { ...reducer.emptyCustomerServiceConversationStateV2(), currentTurn: 2, revision: 3,
  assistantMoveLedger: [{ turn: 1, move: 'RECOMMEND', excerpt: '优先考虑甲款。乙款不太适合。',
    accepted: false, rejected: true, requestedDeltas: [], behavior: observed }] };
check('partial delivery cannot inherit an unsent product relation', () => {
  const partial = behavior.buildCustomerServiceAssistantBehaviorObservation({
    text: '优先考虑甲款。', evidenceMessageIds: ['partial'], realizedGroundingRefs: ['A', 'B'], provenGroundedUnits: units,
  });
  assert.deepEqual(partial.realizedGroundingRefs, ['A']); assert.equal(partial.provenGroundedUnits.length, 1);
});
const signal = { status: 'UNIQUE', candidateId: 'delivered-unit-0', evidence: '你推荐的这款',
  sourceQuote: '优先考虑甲款。', confidence: .99 };
const selection = referent.resolveCustomerServiceContextualReferentSelection(signal, message, state);
check('bounded relation selection carries server refs only', () => {
  assert.deepEqual(selection.groundingRefs, ['A']);
  for (const invalid of [
    { ...signal, status: 'AMBIGUOUS' }, { ...signal, candidateId: 'made-up' },
    { ...signal, sourceQuote: '不存在的原文' }, { ...signal, evidence: '不存在的指代' },
    { ...signal, confidence: .4 }, { ...signal, confidence: '0.99' },
  ]) assert.equal(referent.resolveCustomerServiceContextualReferentSelection(invalid, message, state), null);
});
const entries = [
  { id: 'A', entityType: 'PRODUCT', entityKey: 'ITEM_A', title: '甲款', aliases: [] },
  { id: 'B', entityType: 'PRODUCT', entityKey: 'ITEM_B', title: '乙款', aliases: [] },
];
const finalize = selected => semantics.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership, primaryScenario: 'PRODUCT_CONSULT', primaryIntent: 'ASK_INFORMATION', message,
  priorDeliveredGroundingRefs: ['A', 'B'], contextualReferentSelection: selected, knowledgeEntries: entries,
});
check('proven relation narrows two owners; absent relation stays ambiguous', () => {
  assert.deepEqual(finalize(selection).namedOfferingReferent.resolvedGroundingIds, ['A']);
  assert.equal(finalize(null).namedOfferingReferent.status, 'AMBIGUOUS_EXACT_STRUCTURED_ENTITY');
  assert.notEqual(finalize({ ...selection, groundingRefs: ['X'] }).namedOfferingReferent.status, 'EXACT_STRUCTURED_ENTITY');
});
check('same-event feedback reconciliation clears stale rejection without another turn', () => {
  const before = reducer.readCustomerServiceConversationStateV2(state);
  const after = reducer.reconcileCustomerServiceCurrentFeedback(before, neutral);
  assert.equal(after.currentTurn, before.currentTurn); assert.equal(after.revision, before.revision);
  assert.equal(after.assistantMoveLedger[0].rejected, false); assert.equal(after.assistantMoveLedger[0].accepted, null);
  for (const key of ['tasks', 'entities', 'memories', 'canonicalFields', 'relationshipDynamics']) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(reducer.reconcileCustomerServiceCurrentFeedback(after, neutral), after);
});
const runtimeContract = { orchestrationPlan: { interactionPlanV2: {
  acts: [{ id: 'FACT', type: 'EXPLAIN_GROUNDED_FACT', necessity: 'REQUIRED' }, { id: 'STOP', type: 'STOP', necessity: 'REQUIRED' }],
  answerObligation: { responseTarget: { requiredDelta: 'NONE' } },
} } };
const fulfill = generationDetails => behavior.resolveCustomerServicePlanFulfillmentFromReplyTrace({ generationDetails, runtimeContract });
check('selected candidate alone cannot prove completion', () => assert.equal(fulfill({ hve3: { selectedCandidateIndex: 0 } }), 'UNKNOWN'));
check('surviving required Act proof excludes control-only STOP', () => assert.equal(fulfill(trace), 'FULFILLED'));
check('unproven conformance remains unknown even when candidate is selected', () => {
  assert.equal(fulfill({ hve3: { selectedCandidateIndex: 0, semanticConformance: { ...trace.hve3.semanticConformance, decision: 'UNPROVEN_PRESERVED' } } }), 'UNKNOWN');
});
check('required delta cannot be proven from Act coverage', () => {
  const deltaContract = structuredClone(runtimeContract);
  deltaContract.orchestrationPlan.interactionPlanV2.answerObligation.responseTarget.requiredDelta = 'MORE_SPECIFIC';
  assert.equal(behavior.resolveCustomerServicePlanFulfillmentFromReplyTrace({ generationDetails: trace, runtimeContract: deltaContract }), 'UNKNOWN');
});
check('missing required Act is unknown and explicit failure remains negative', () => {
  const missing = structuredClone(trace);
  missing.hve3.semanticConformance.unitChecks.forEach(u => u.semanticSpans.forEach(s => s.realizedActIds = []));
  assert.equal(fulfill(missing), 'UNKNOWN');
  assert.equal(fulfill({ finalReplySource: 'FAILURE_NOTICE' }), 'NOT_FULFILLED');
});
check('fixed QA requires observed exact direct output rather than a source label', () => {
  const contract = { replyPlan: { fixedQa: { answer: '固定原文' }, exactReply: '固定原文' } };
  const details = { finalReplySource: 'FIXED_QA', status: 'DETERMINISTIC', draft: '固定原文' };
  assert.equal(behavior.resolveCustomerServicePlanFulfillmentFromReplyTrace({ runtimeContract: contract, generationDetails: details }), 'FULFILLED');
  assert.equal(behavior.resolveCustomerServicePlanFulfillmentFromReplyTrace({ runtimeContract: contract, generationDetails: { ...details, draft: '不同文本' } }), 'UNKNOWN');
});
(async () => {
  const { CustomerServiceCanonicalConversationStateService } = use('state/customer-service-canonical-conversation-state.service.ts');
  const evidence = { id: 'customer-2', sortKey: '002', senderRole: 'user', textContent: message };
  let row = { id: 'state-1', dialogueConversationId: 'conv-1', revision: 3, statePayload: state,
    lastProcessedMessageId: evidence.id, lastProcessedSortKey: evidence.sortKey,
    recentProcessedMessageIds: [evidence.id], sourceConversationIds: ['conv-1'], rebuildRequired: false };
  let writes = 0, conflict = false;
  const repository = {
    findState: async tenant => { assert.equal(tenant, 'tenant-1'); return row; },
    updateStateCas: async input => {
      writes++; assert.equal(input.tenantId, 'tenant-1'); assert.equal(input.expectedRevision, row.revision);
      if (conflict) return false;
      row = { ...row, revision: input.statePayload.revision, statePayload: input.statePayload, stateHash: input.stateHash };
      return true;
    },
  };
  const service = new CustomerServiceCanonicalConversationStateService(repository, {});
  const input = { runtimeContext: { evidence, dialogueConversationId: 'conv-1' },
    dto: { message }, understanding, user: { tenantId: 'tenant-1', roles: [] } };
  const applied = await service.commitCustomerProjection(input);
  check('canonical commit reconciles same event through CAS without turn increment', () => {
    assert.equal(applied.status, 'APPLIED'); assert.equal(row.statePayload.currentTurn, 2);
    assert.equal(row.statePayload.latestFeedback.userFeedback, 'UNCLEAR'); assert.equal(writes, 1);
  });
  await service.commitCustomerProjection(input);
  check('identical final feedback commit is idempotent', () => assert.equal(writes, 1));
  row = { ...row, lastProcessedSortKey: '003' };
  await service.commitCustomerProjection(input);
  check('older event cannot rewrite feedback after newer event', () => assert.equal(writes, 1));
  row = { ...row, lastProcessedSortKey: '002' }; conflict = true;
  const conflicting = await service.commitCustomerProjection({ ...input, understanding: { ...understanding,
    humanContext: { ...understanding.humanContext, dialogueObligation: { ...neutral, userFeedback: 'ACCEPTED' } } } });
  check('CAS conflict is reported instead of claiming a successful reconciliation', () => assert.equal(conflicting.status, 'CONFLICT'));
  console.log('Live follow-up authority closure: ' + count + '/' + count + ' PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
