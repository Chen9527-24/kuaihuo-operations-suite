#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { loadFinalHumanTurnCompiler, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const participation = read('src/modules/customer-service-agent/runtime/generation/customer-service-role-conditioned-participation.ts');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const authority = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
let pass = 0; let fail = 0;
const check = (name, ok) => { if (ok) { pass += 1; console.log(`PASS ${name}`); } else { fail += 1; console.error(`FAIL ${name}`); } };

check('retired currentHumanManeuver producer is absent', !participation.includes('currentHumanManeuver'));
check('retired maneuver is absent from final model-facing authority', !authority.includes('currentHumanManeuver'));
check('retired maneuver is absent from Generation prompt', !prompt.includes('currentHumanManeuver'));
check('Canonical Plan remains current-turn semantic owner', authority.includes("source: 'EXISTING_CANONICAL_INTERACTION_PLAN'"));
check('Role and Identity Prompt remain expression owner', authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'"));

const { compile } = loadFinalHumanTurnCompiler(root);
const act = { type: 'PROVIDE_GENERAL_GUIDANCE', semantic: '给出当前可行方向。', authorityScope: 'PLAN_ONLY' };
const output = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: 'ROLE', identity: 'IDENTITY' } } } }, normalizeFrame({ acts: { required: [act], preferred: [], optional: [], forbidden: [] } }));
check('actual final compiler preserves the selected maneuver as a Canonical Act', output.realization.canonicalPlan.requiredActs[0].type === 'PROVIDE_GENERAL_GUIDANCE');
check('actual final compiler does not recreate maneuver HOW fields', !Object.prototype.hasOwnProperty.call(output.realization, 'currentHumanManeuver'));
check('no role/domain/message-content branch was added', !/(宠物|女装|护肤|SaaS|roleCode|industryCode|latestCustomerMessage\.(?:includes|match|test))/i.test(prompt + authority));
check('no replacement maneuver gate/judge/repair/retry exists', !/HumanManeuver(?:Planner|Gate|Judge|Repair|Fallback|Retry|Humanizer)/.test(prompt + authority + participation));
console.log(`\nRetired Current Human Maneuver: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
