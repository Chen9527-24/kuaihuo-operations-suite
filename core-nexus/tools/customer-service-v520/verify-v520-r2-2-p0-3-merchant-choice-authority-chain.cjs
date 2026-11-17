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
const {
  resolveCustomerServiceFactOwnership,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
}

function resolve(message, scenario = 'PRODUCT_CONSULT', intent = 'ASK_INFORMATION') {
  const factOwnership = resolveCustomerServiceFactOwnership(message, scenario, intent);
  const obligation = resolveCustomerServiceAnswerObligation({
    interactionType: 'PRODUCT_FACT_QUERY',
    latestCustomerMessage: message,
    conversationHistory: [],
    conversationState: {
      recentAssistantMoves: [],
      latestFeedback: null,
    },
    knowledgeEntries: [],
    understanding: {
      factOwnership,
      primaryScenario: scenario,
      primaryIntent: intent,
      humanContext: {
        dominantTurnGoal: null,
        requiredTurnGoals: [],
        dialogueObligation: { requestedDeltas: [] },
      },
    },
  });
  return { factOwnership, obligation };
}

for (const message of [
  '你们店里哪款更适合夏天办公室穿？',
  '本店哪个产品更合适？',
]) {
  const { factOwnership, obligation } = resolve(message);
  check(`explicit merchant unknown-choice reaches recommendation + business grounding: ${message}`,
    factOwnership.scope === 'CURRENT_BUSINESS_FACT'
      && factOwnership.evidence.includes('REFERENT:EXPLICIT_MERCHANT_CATALOG_SCOPE')
      && obligation.responseTarget.focus === 'RECOMMENDATION'
      && obligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED',
    JSON.stringify({ factOwnership, responseTarget: obligation.responseTarget }));
}

for (const message of [
  '哪款更适合夏天通勤？',
  '哪一款更适合日常通勤？',
  '什么款式更适合日常上班？',
]) {
  const { factOwnership, obligation } = resolve(message);
  check(`implicit merchant catalog choice keeps recommendation + business grounding: ${message}`,
    factOwnership.scope === 'CURRENT_BUSINESS_FACT'
      && factOwnership.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE')
      && obligation.responseTarget.focus === 'RECOMMENDATION'
      && obligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED',
    JSON.stringify({ factOwnership, responseTarget: obligation.responseTarget }));
}

for (const message of [
  '哪种面料更适合高温通勤？',
  '哪个材质更适合夏天？',
]) {
  const { factOwnership, obligation } = resolve(message);
  check(`generic category choice can recommend without merchant-catalog authority: ${message}`,
    factOwnership.scope === 'GENERAL_DOMAIN'
      && obligation.responseTarget.focus === 'RECOMMENDATION'
      && obligation.responseTarget.knowledgeRequirement === 'GENERAL_CONTEXT_ALLOWED',
    JSON.stringify({ factOwnership, responseTarget: obligation.responseTarget }));
}

for (const message of [
  '为什么这件更适合我？',
  '这个款适合我吗？',
]) {
  const { obligation } = resolve(message);
  check(`non-open-choice suitability stays non-recommendation: ${message}`,
    obligation.responseTarget.focus !== 'RECOMMENDATION'
      && !obligation.responseTarget.evidence.includes('SEMANTIC_SIGNAL:RECOMMENDATION'),
    JSON.stringify(obligation.responseTarget));
}

const answerSrc = fs.readFileSync(
  path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts'),
  'utf8',
);
const factSrc = fs.readFileSync(
  path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts'),
  'utf8',
);
check('authority fix remains generalized and does not encode the Live fixture or concrete catalog identity',
  !/(青禾|QH-HVE|冰丝质感|夏天办公室穿的衬衫)/i.test(answerSrc)
    && !/(青禾|QH-HVE|冰丝质感|夏天办公室穿的衬衫)/i.test(factSrc));
check('catalog ownership remains scope-only and never creates exact entity resolution',
  factSrc.includes('REFERENT:EXPLICIT_MERCHANT_CATALOG_SCOPE')
    && factSrc.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE')
    && !factSrc.includes('REFERENT_RESOLUTION:EXPLICIT_MERCHANT_CATALOG_SCOPE')
    && !factSrc.includes('REFERENT_RESOLUTION:IMPLICIT_MERCHANT_CATALOG_SCOPE'));

console.log(`\nR2.2/P0-3 Merchant Choice Authority Chain: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
