#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@nestjs/common') return { Injectable: () => (target) => target };
  if (request.includes('compile-simulation.dto')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const understandingRel = 'src/modules/customer-service-agent/runtime/understanding/customer-service-message-understanding.service.ts';
const understandingTypeRel = 'src/modules/customer-service-agent/runtime/understanding/types/customer-service-message-understanding.type.ts';
const compilerRel = 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const understandingSrc = read(understandingRel);
const understandingTypeSrc = read(understandingTypeRel);
const compilerSrc = read(compilerRel);
const {
  resolveCustomerServiceSpecificItemRecommendationBoundary,
} = require(path.join(root, understandingRel));

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

check('specific-item boundary recognizer is executable',
  typeof resolveCustomerServiceSpecificItemRecommendationBoundary === 'function');

if (typeof resolveCustomerServiceSpecificItemRecommendationBoundary === 'function') {
  const guidanceOnlyCases = [
    '先不要给我推荐具体商品，我只想知道这种开衫版型和面料应该怎么选。',
    '先不用给我推荐具体款，讲讲怎么挑就行。',
    '具体商品先别推荐，我先看选择原则。',
    '先讲选法，不用报具体商品。',
    '不要具体推荐，先说说面料和版型怎么判断。',
  ];
  for (const text of guidanceOnlyCases) {
    check(`guidance-only semantic scope: ${text}`,
      resolveCustomerServiceSpecificItemRecommendationBoundary(text) === 'GUIDANCE_ONLY');
  }

  const reverseCases = [
    '帮我推荐一件适合办公室穿的针织开衫。',
    '我只想知道你更推荐哪一件。',
    '不要衬衫，给我推荐别的上衣。',
    '不要推荐太多，具体推荐一件就行。',
    '不用讲原则了，那就具体推荐一件吧。',
    '先别推荐别的，我只想知道青禾清简衬衫是什么面料。',
  ];
  for (const text of reverseCases) {
    check(`reverse protection keeps concrete recommendation/fact semantics: ${text}`,
      resolveCustomerServiceSpecificItemRecommendationBoundary(text) === 'NONE');
  }
}

check('typed current-turn scope exists without replacing broad customerRejectedRecommendation',
  understandingTypeSrc.includes('export type CustomerServiceSpecificItemRecommendationBoundary =')
    && understandingTypeSrc.includes("| 'GUIDANCE_ONLY';")
    && understandingTypeSrc.includes('specificItemRecommendationBoundary?: CustomerServiceSpecificItemRecommendationBoundary;')
    && understandingSrc.includes('const customerRejectedRecommendation =')
    && understandingSrc.includes('const specificItemRecommendationBoundary = resolveCustomerServiceSpecificItemRecommendationBoundary(message);'));

check('specific-item boundary is recomputed from current message and not persisted by state',
  understandingSrc.includes('It is recomputed from')
    && !read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.type.ts').includes('specificItemRecommendationBoundary')
    && !read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts').includes('specificItemRecommendationBoundary'));

check('Canonical grounded recommendation admission is blocked before required grounding is created',
  compilerSrc.includes("specificItemRecommendationBoundary !== 'GUIDANCE_ONLY'")
    && /specificItemRecommendationBoundary !== 'GUIDANCE_ONLY'[\s\S]{0,220}ensureKnowledgeGrounding\(recommendationKnowledgeEntries, grounding\)/.test(compilerSrc));

const guidanceOnlySuppressionBlock = compilerSrc.match(
  /if \(input\.understanding\.specificItemRecommendationBoundary === 'GUIDANCE_ONLY'\) \{([\s\S]*?)\r?\n  \}\r?\n  if \(deltas\.has\('NO_ADVICE'\)/,
)?.[1] || '';

check('general guidance remains selected independently of the specific-item boundary',
  compilerSrc.includes("const guidanceFocuses = new Set(['RECOMMENDATION', 'HOW_TO', 'TROUBLESHOOTING'])")
    && compilerSrc.includes("type: 'PROVIDE_GENERAL_GUIDANCE'")
    && guidanceOnlySuppressionBlock.includes("type: 'RECOMMEND_GROUNDED_ITEM'")
    && !guidanceOnlySuppressionBlock.includes("type: 'PROVIDE_GENERAL_GUIDANCE'"));

check('Canonical policy merge cannot reintroduce the forbidden grounded-item Act',
  compilerSrc.includes("reasonCode: 'CUSTOMER_BOUNDARY_GUIDANCE_ONLY_NO_SPECIFIC_ITEM_RECOMMENDATION'")
    && /CUSTOMER_BOUNDARY_GUIDANCE_ONLY_NO_SPECIFIC_ITEM_RECOMMENDATION[\s\S]{0,240}UNDERSTANDING/.test(compilerSrc));

check('patch does not move the new permission into Generation, Conformance, Delivery, or state authority',
  !read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts').includes('specificItemRecommendationBoundary')
    && !read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts').includes('specificItemRecommendationBoundary')
    && !read('src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts').includes('specificItemRecommendationBoundary')
    && !read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts').includes('specificItemRecommendationBoundary'));

check('patch introduces no fixed output quota, role/domain branch, second planner, judge, repair, retry, or fallback',
  !/(softMaxChars|maxValueUnits|maxPresentedOptions|roleCode\s*===|industryCode\s*===|SpecificItemRecommendationPlanner|SpecificItemRecommendationJudge|SpecificItemRecommendationRepair|SpecificItemRecommendationRetry|SpecificItemRecommendationFallback|secondModelCall)/i.test(`${understandingSrc}\n${compilerSrc}`));

console.log(`\nP0-3 Guidance-Only Specific-Item Permission: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
