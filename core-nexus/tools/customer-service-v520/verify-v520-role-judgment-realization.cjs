#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { loadFinalHumanTurnCompiler, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const human = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const authority = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
let pass = 0; let fail = 0;
const check = (name, ok) => { if (ok) { pass += 1; console.log(`PASS ${name}`); } else { fail += 1; console.error(`FAIL ${name}`); } };

check('retired judgmentRealization producer is absent', !human.includes('judgmentRealization'));
check('retired judgmentRealization projection is absent', !authority.includes('judgmentRealization') && !prompt.includes('judgmentRealization'));
check('retired HVE_JUDGMENT protocol is absent', !prompt.includes('HVE_JUDGMENT'));
check('Canonical Plan preserves selected value judgment semantics', authority.includes('requiredActs: cloneSemanticActs(frame.acts.required)'));
check('Role to Identity Prompt owns how judgment sounds', authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'"));

const { compile } = loadFinalHumanTurnCompiler(root);
const act = { id: 'ACT_DIRECT_ANSWER_FIXTURE', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', semantic: '给出明确但有边界的当前判断。', authorityScope: 'PLAN_ONLY', allowedGroundingRefs: [], parameters: { target: 'CURRENT_QUESTION', decisionPurpose: 'REDUCE_UNCERTAINTY', expectedInformationGain: 'ACTIONABLE_DIRECTION' } };
const output = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: '结论清楚，保留必要条件。', identity: '自然协作。' } } } }, normalizeFrame({ acts: { required: [act], preferred: [], optional: [], forbidden: [] } }));
check('actual compiler keeps judgment WHAT in the Canonical Act', JSON.stringify(output.realization.canonicalPlan.requiredActs[0]) === JSON.stringify(act));
check('actual compiler keeps judgment HOW only in configured guidance', output.surface.generationGuidance.role === '结论清楚，保留必要条件。' && output.surface.generationGuidance.identity === '自然协作。');
check('actual compiler exposes no judgment micro-protocol', !Object.prototype.hasOwnProperty.call(output.realization, 'judgmentRealization'));
check('no role/domain/message phrase branch exists', !/(宠物|女装|护肤|SaaS|roleCode|industryCode|latestCustomerMessage\.(?:includes|match|test))/i.test(prompt + authority));
check('no replacement judgment planner/gate/judge/repair/retry exists', !/RoleJudgment(?:Planner|Gate|Judge|Repair|Fallback|Retry|Humanizer)/.test(prompt + authority + human));
console.log(`\nRole Judgment Authority Retirement: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
