#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const {
  resolveCustomerServiceAnswerObligation,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function goal(key, message, priority = 900) {
  return {
    key,
    priority,
    confidence: 0.95,
    source: 'MODEL',
    evidence: [message],
    responseRequirement: `完成 ${key}`,
    deferred: false,
  };
}

function resolve(message, requiredGoalKeys = []) {
  const dominant = goal(requiredGoalKeys[0] || 'ANSWER_INFORMATION', message);
  const requiredTurnGoals = requiredGoalKeys.length
    ? requiredGoalKeys.map((key, index) => key === dominant.key ? dominant : goal(key, message, 880 - index))
    : [];
  return resolveCustomerServiceAnswerObligation({
    interactionType: 'PRODUCT_FACT_QUERY',
    latestCustomerMessage: message,
    conversationHistory: [],
    conversationState: {
      recentAssistantMoves: [],
      latestFeedback: null,
    },
    knowledgeEntries: [],
    understanding: {
      factOwnership: {
        authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
        scope: 'GENERAL_DOMAIN',
        confidence: 0.99,
        evidence: ['FACT_OWNERSHIP:GENERAL_DOMAIN'],
        reason: 'verifier',
      },
      primaryScenario: 'PRODUCT_CONSULT',
      primaryIntent: 'ASK_INFORMATION',
      humanContext: {
        dominantTurnGoal: dominant,
        requiredTurnGoals,
        dialogueObligation: { requestedDeltas: [] },
      },
    },
  });
}

const whyCases = [
  '我只想了解一下，为什么这个克重范围更适合办公室穿？',
  '为什么这件更适合我？',
];
for (const text of whyCases) {
  const result = resolve(text);
  check(`explanatory suitability stays WHY_REASON: ${text}`,
    result.responseTarget.focus === 'WHY_REASON'
      && !result.responseTarget.evidence.includes('SEMANTIC_SIGNAL:RECOMMENDATION'),
    JSON.stringify(result.responseTarget));
}

// "使用场景" is an existing APPLICATION_USAGE facet with a higher lexical score
// than WHY_REASON. For this mixed explanatory wording, the P0-3 regression boundary
// is that bare "适合我" must not promote the turn into RECOMMENDATION. Do not widen
// this narrow patch into unrelated WHY_REASON vs APPLICATION_USAGE arbitration.
const whyUsageScene = resolve('只解释一下为什么这个范围更适合我这个使用场景。');
check('why + usage-scene remains explanatory and never becomes recommendation',
  ['WHY_REASON', 'APPLICATION_USAGE'].includes(whyUsageScene.responseTarget.focus)
    && !whyUsageScene.responseTarget.evidence.includes('SEMANTIC_SIGNAL:RECOMMENDATION'),
  JSON.stringify(whyUsageScene.responseTarget));

const currentItemSuitability = resolve('这个款适合我吗？', ['ANSWER_INFORMATION']);
check('current-item suitability check is not automatically a recommendation request',
  currentItemSuitability.responseTarget.focus === 'CURRENT_SPECIFIC_QUESTION',
  JSON.stringify(currentItemSuitability.responseTarget));

const choiceCases = [
  '哪款更适合我？',
  '哪款更适合？',
  '哪一款更适合？',
  '哪几款更合适？',
  '你们店里哪款更适合夏天办公室穿？',
  '哪个方案更合适？',
  '哪种面料更适合高温通勤？',
  '有没有适合我的通勤款？',
  '有什么款式适合我？',
  '有适合我的吗？',
  '帮我选一件适合我的。',
];
for (const text of choiceCases) {
  const result = resolve(text, ['SUPPORT_PURCHASE_DECISION']);
  check(`typed suitability choice remains RECOMMENDATION across paraphrases: ${text}`,
    result.responseTarget.focus === 'RECOMMENDATION',
    JSON.stringify(result.responseTarget));
}

const src = fs.readFileSync(
  path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts'),
  'utf8',
);
check('Answer Obligation no longer owns open-language suitability-choice parsing',
  !src.includes('hasSuitabilityChoiceSignal')
    && !src.includes('const selector =')
    && !src.includes('const suitability =')
    && src.includes('structuredRecommendationRequired')
    && src.includes('UNDERSTANDING_GOAL:SUPPORT_PURCHASE_DECISION'));
check('choice-vs-current-item boundary is transported by typed Turn Goals rather than a phrase/regex owner',
  src.includes("String(goal?.key || '') === 'SUPPORT_PURCHASE_DECISION'")
    && src.includes('Raw customer wording')
    && !src.includes('哪款更适合夏天办公室穿'));
check('focus patch does not add product/domain/fixture special cases',
  !/(120到150|克重|办公室|青禾|衬衫|PRODUCT:QH)/i.test(src));

console.log(`\nP0-3 Explanatory Suitability Focus: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
