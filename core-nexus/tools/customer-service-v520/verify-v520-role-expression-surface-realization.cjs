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
const delivery = read('src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts');
let pass = 0; let fail = 0;
const check = (name, ok) => { if (ok) { pass += 1; console.log(`PASS ${name}`); } else { fail += 1; console.error(`FAIL ${name}`); } };

check('rich HumanTurn surface remains server-side diagnostics compatibility', human.includes('roleEmbodiment:') && human.includes('surfaceBudget:') && human.includes('turnComposition:'));
check('final model-facing authority strips retired surface choreography', !authority.includes('roleEmbodiment:') && !authority.includes('surfaceBudget:') && !authority.includes('segmentPlan:'));
check('Generation receives one configurable Role to Identity surface', authority.includes("authority: 'FINAL_HUMAN_TURN_SURFACE_V1'") && authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'"));
check('model owns natural HVE_REPLY_V2 segment count while units bind semantics only', prompt.includes('由你按自然交流节奏直接决定 1/N 条') && prompt.includes('不存在固定配额') && prompt.includes('units 是同一实际消息的 semantic binding'));
check('Delivery remains structural executor without valuePhase or role judgment', !delivery.includes('valuePhase') && !delivery.includes('Role Judgment Realization'));

const { compile } = loadFinalHumanTurnCompiler(root);
const frame = normalizeFrame({ acts: { required: [{ type: 'DIRECT_ANSWER', semantic: '回答当前问题。', authorityScope: 'PLAN_ONLY' }], preferred: [], optional: [], forbidden: [] } });
const warm = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: '自然温和。', identity: '熟悉但不过度亲近。' } } } }, frame);
const compact = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: '专业直接。', identity: '保持克制。' } } } }, frame);
check('different configured voices preserve identical Canonical semantics', JSON.stringify(warm.realization) === JSON.stringify(compact.realization));
check('different configured voices remain available only in surface HOW', warm.surface.generationGuidance.role !== compact.surface.generationGuidance.role && warm.surface.generationGuidance.identity !== compact.surface.generationGuidance.identity);
check('final realization contains no fixed segment or sentence budget', !JSON.stringify(warm).match(/softMaxChars|maxSentences|maxMessageSegments|preferredMessageSegments/));
check('no role/domain/test-sentence dispatch exists', !/(宠物|女装|护肤|SaaS|roleCode|industryCode)/i.test(prompt + authority));
check('no new humanizer/gate/judge/repair/retry authority exists', !/RoleExpression(?:Planner|Gate|Judge|Repair|Fallback|Retry|Humanizer)/.test(prompt + authority));
console.log(`\nRole Expression Surface Authority: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
