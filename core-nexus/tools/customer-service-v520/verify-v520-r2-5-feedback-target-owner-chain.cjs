#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

const path = require('path');
const root = path.resolve(__dirname, '../..');
const rel = (p) => path.join(root, p);
const {
  inferCustomerServiceDialogueObligation,
} = require(rel('src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts'));
const {
  resolveCustomerServiceAnswerObligation,
} = require(rel('src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts'));

const { CustomerServiceInteractionPlanCompiler } = require(rel('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts'));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

function makeStateValue(value = null) {
  return {
    value,
    status: 'UNKNOWN',
    confidence: 0,
    evidenceMessageIds: [],
    reason: 'verifier fixture',
    updatedAt: null,
  };
}

function makeCanonicalFields() {
  return {
    relationship: makeStateValue(),
    activeTopic: makeStateValue(),
    currentIntent: makeStateValue(),
    customerGoal: makeStateValue(),
    customerActions: makeStateValue(),
    explicitFacts: makeStateValue(),
    preferences: makeStateValue(),
    assistantActions: makeStateValue(),
    pendingItems: makeStateValue(),
    resolvedItems: makeStateValue(),
    transientState: makeStateValue(),
  };
}

const history = [
  { role: 'CUSTOMER', content: '那如果只能看尺码表，我这种腰细胯宽应该优先按腰围还是臀围选？前面版型那个方向我认可，不用再展开。' },
  { role: 'ASSISTANT', content: '腰细胯宽的话，优先按臀围选。按臀围合适后，再看腰围差多少；腰围松可以优先考虑可调节腰头。' },
];
const message = '臀围优先这个我明白了，腰头能调节也可以；但我不想靠腰带。那如果臀围刚好、腰围大一截，是宁愿改腰，还是换小一码？';
const dialogue = inferCustomerServiceDialogueObligation(message, history);
const goalEvidence = '那如果臀围刚好、腰围大一截，是宁愿改腰，还是换小一码？';

const understanding = {
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  factOwnership: {
    authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
    scope: 'GENERAL_DOMAIN',
    confidence: 0.98,
    evidence: ['GENERAL_DOMAIN'],
    reason: 'verifier',
    namedOfferingReferent: {
      authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
      status: 'NONE', source: 'NONE', surface: null, resolvedGroundingIds: [],
    },
  },
  humanContext: {
    dialogueObligation: {
      ...dialogue,
      userFeedback: 'ACCEPTED',
      feedbackHandlingMode: 'NONE',
      requestedDeltas: ['MORE_SPECIFIC'],
      correctionTarget: null,
      strategyChangeRequired: false,
      unresolvedNeed: null,
    },
    dominantTurnGoal: {
      key: 'ANSWER_INFORMATION',
      name: '回答当前具体问题',
      priority: 1000,
      confidence: 0.98,
      evidence: [goalEvidence],
      reason: 'MODEL_CURRENT_TURN_EVIDENCE',
      responseRequirement: '回复应完成该目标。',
      source: 'MODEL',
      deferred: false,
    },
    requiredTurnGoals: [],
  },
};

const state = {
  latestFeedback: {
    userFeedback: 'ACCEPTED',
    feedbackHandlingMode: 'NONE',
    requestedDeltas: ['MORE_SPECIFIC'],
  },
  recentAssistantMoves: [{
    behavior: {
      planFulfillment: 'FULFILLED',
      interactionPlanV2: { answerFocus: 'CURRENT_SPECIFIC_QUESTION' },
    },
  }],
};

const obligation = resolveCustomerServiceAnswerObligation({
  interactionType: 'PRODUCT_FACT_QUERY',
  latestCustomerMessage: message,
  conversationHistory: history,
  conversationState: state,
  knowledgeEntries: [],
  understanding,
});

check(
  'owner chain: mixed accepted follow-up remains current-specific and requires new specific value',
  obligation.currentFocus === 'CURRENT_SPECIFIC_QUESTION'
    && obligation.continuity === 'FOLLOW_UP_REFINEMENT'
    && obligation.responseTarget.requiredDelta === 'MORE_SPECIFIC'
    && obligation.mustAddNewInformation === true,
  JSON.stringify(obligation),
);
check(
  'owner chain: verbatim current goal becomes the canonical response target instead of a generic focus label',
  obligation.responseTarget.unresolvedNeed === goalEvidence,
  JSON.stringify(obligation.responseTarget),
);
const compilerUnderstanding = {
  ...understanding,
  confidence: 0.98,
  topics: [],
  intentRanking: [],
  customerRejectedRecommendation: false,
  specificItemRecommendationBoundary: 'NONE',
  humanContext: {
    ...understanding.humanContext,
    requiredResponseActs: [],
    rankedTurnGoals: [understanding.humanContext.dominantTurnGoal],
    statedNeeds: [],
    uncertainties: [],
    commercialStrategy: { discoveryTarget: '', objective: '' },
    conversationTaskState: {
      status: 'IN_PROGRESS', currentTurnRelation: 'CONTINUATION', pendingSlots: [], unresolvedGoals: [],
      internalHandling: { scenario: null },
    },
  },
};
const compilerState = {
  ...state,
  schemaVersion: 2, revision: 6, currentTurn: 4,
  canonicalFields: makeCanonicalFields(), activeTask: null,
  behaviorHistory: { recentRequestedDeltas: ['MORE_SPECIFIC'], consecutiveQuestionEndingTurns: 0 },
  recentAssistantMoves: [{
    turn: 3, move: 'UNKNOWN', actionFamilies: [], practicalActionFamilies: [], interpersonalActionFamilies: [],
    strategyKey: '', openingKey: '', endingKey: '', accepted: true, rejected: false,
    requestedDeltas: ['MORE_DETAILED'], excerpt: history[1].content,
    behavior: { planFulfillment: 'FULFILLED', interactionPlanV2: { answerFocus: 'CURRENT_SPECIFIC_QUESTION' } },
  }],
};
const compilerPlan = {
  route: 'GENERATION', microActions: [], salesVisibility: 'S0',
  businessOpportunity: { mode: 'NONE' },
  stateGuidance: { preferences: [], explicitFacts: [] },
  identityConstraint: {
    businessAnchored: true, identityLabel: 'fixture', merchantRoleName: 'fixture', accountName: null, storeName: null,
    strength: 'NORMAL', casualChatBoundary: 'SERVICE_ANCHORED', forbiddenDrift: [], customerVisibleIdentity: null,
  },
  dominantTurnGoal: compilerUnderstanding.humanContext.dominantTurnGoal,
  requiredTurnGoals: [],
  serviceGoal: '完成当前客户请求', humanityGoal: '自然直接', businessGoal: null,
};
const deterministic = { matchedRules: [], requiredPoints: [], workflowSteps: [], templateReply: null };
const planCompiler = new CustomerServiceInteractionPlanCompiler({ resolve: () => 'PRODUCT_FACT_QUERY' });
const compiledPlan = planCompiler.compileShadow({
  understanding: compilerUnderstanding,
  plan: compilerPlan,
  deterministic,
  conversationState: compilerState,
  knowledgeEntries: [],
  latestCustomerMessage: message,
  conversationHistory: history,
});
const directAnswer = compiledPlan?.acts?.find((act) => act.type === 'DIRECT_ANSWER' && act.necessity === 'REQUIRED');
check(
  'owner chain: compiled DIRECT_ANSWER consumes the verbatim current goal instead of the generic focus label',
  Boolean(compiledPlan)
    && compiledPlan.answerObligation?.responseTarget?.unresolvedNeed === goalEvidence
    && directAnswer?.parameters?.target === goalEvidence,
  JSON.stringify({ answerObligation: compiledPlan?.answerObligation, directAnswer }),
);

const nonVerbatimUnderstanding = structuredClone(understanding);
nonVerbatimUnderstanding.humanContext.dominantTurnGoal.evidence = ['上一轮不存在于当前消息的历史目标'];
const nonVerbatim = resolveCustomerServiceAnswerObligation({
  interactionType: 'PRODUCT_FACT_QUERY',
  latestCustomerMessage: message,
  conversationHistory: history,
  conversationState: state,
  knowledgeEntries: [],
  understanding: nonVerbatimUnderstanding,
});
check(
  'reverse boundary: non-verbatim/history goal evidence cannot become the current answer target',
  nonVerbatim.responseTarget.unresolvedNeed !== '上一轮不存在于当前消息的历史目标'
    && nonVerbatim.responseTarget.unresolvedNeed === '回复应完成该目标。',
  JSON.stringify(nonVerbatim.responseTarget),
);

const trueCorrectionMessage = '不是臀围优先，我说的是腰围优先，你理解反了。';
const trueCorrection = inferCustomerServiceDialogueObligation(trueCorrectionMessage, history);
check(
  'reverse boundary: actual contradiction still owns CORRECTED reception',
  trueCorrection.userFeedback === 'CORRECTED'
    && trueCorrection.feedbackHandlingMode === 'CORRECT'
    && trueCorrection.strategyChangeRequired === true,
  JSON.stringify(trueCorrection),
);

console.log(`\nR2.5 feedback/target owner-chain verifier: ${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);
