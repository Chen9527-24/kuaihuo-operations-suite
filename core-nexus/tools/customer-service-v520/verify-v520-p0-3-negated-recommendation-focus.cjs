#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

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

function resolveFocus(message, interactionType = 'PRODUCT_FACT_QUERY') {
  const obligation = resolveCustomerServiceAnswerObligation({
    interactionType,
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
        scope: interactionType === 'PRODUCT_FACT_QUERY' ? 'CURRENT_BUSINESS_FACT' : 'GENERAL_DOMAIN',
        confidence: 0.99,
        evidence: [],
        reason: 'verifier',
      },
      primaryScenario: interactionType,
      primaryIntent: 'ASK_INFORMATION',
      humanContext: {
        dominantTurnGoal: null,
        requiredTurnGoals: [],
        dialogueObligation: { requestedDeltas: [] },
      },
    },
  });
  return obligation.responseTarget.focus;
}

const negativeFactCases = [
  '先别给我推荐别的商品，我只想确认一下青禾「清简」垂感衬衫是什么面料？',
  '不用推荐其他款，我只问青禾「清简」垂感衬衫的面料。',
  '不需要推荐，我想知道青禾「清简」垂感衬衫是什么面料。',
];
for (const text of negativeFactCases) {
  const focus = resolveFocus(text);
  check(`negated recommendation does not steal product-fact focus: ${text}`,
    focus === 'CURRENT_SPECIFIC_QUESTION', `focus=${focus}`);
}

const positiveRecommendationCases = [
  '帮我推荐一件适合办公室穿的针织开衫。',
  '不要衬衫，给我推荐别的上衣。',
  '不要推荐太多，具体推荐一件就行。',
  '不建议清简这件，推荐一件别的。',
];
for (const text of positiveRecommendationCases) {
  const focus = resolveFocus(text);
  check(`affirmative recommendation remains recommendation: ${text}`,
    focus === 'RECOMMENDATION', `focus=${focus}`);
}

const guidanceOnlyChoice = '先不要给我推荐具体商品，我只想知道这种开衫版型和面料应该怎么选。';
check('guidance-only choice language still carries recommendation-direction focus',
  resolveFocus(guidanceOnlyChoice) === 'RECOMMENDATION', `focus=${resolveFocus(guidanceOnlyChoice)}`);

console.log(`\nP0-3 Negated Recommendation Focus: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
