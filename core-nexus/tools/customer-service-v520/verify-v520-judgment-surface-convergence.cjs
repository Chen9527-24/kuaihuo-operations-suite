#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { loadFinalHumanTurnCompiler, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const authority = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
let pass = 0; let fail = 0;
const check = (name, ok) => { if (ok) { pass += 1; console.log(`PASS ${name}`); } else { fail += 1; console.error(`FAIL ${name}`); } };

check('retired judgment-surface helper is absent', !prompt.includes('buildJudgmentSurfaceConvergenceInstruction'));
check('retired wording-performance protocol is absent', !prompt.includes('Judgment → Continuity → Pragmatic Surface') && !prompt.includes('HVE_JUDGMENT'));
check('final surface excludes roleEmbodiment and surfaceBudget choreography', !authority.includes('roleEmbodiment:') && !authority.includes('surfaceBudget:'));
check('final surface exposes one Role to Identity Prompt chain', authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && authority.includes('generationGuidance:'));
check('system leaves wording and message count to the model', prompt.includes('它们不规定客户可见措辞、字数、句数、顺序、节奏或消息数量') && prompt.includes('不存在固定配额'));

const { compile } = loadFinalHumanTurnCompiler(root);
const frame = normalizeFrame({ acts: { required: [{ type: 'DIRECT_ANSWER', semantic: '回答当前问题。', authorityScope: 'PLAN_ONLY' }], preferred: [], optional: [], forbidden: [] } });
const a = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: '温和自然地表达。', identity: null } } } }, frame);
const b = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: '简短直接地表达。', identity: null } } } }, frame);
check('role counterfactual changes only configured surface HOW', JSON.stringify(a.realization) === JSON.stringify(b.realization) && a.surface.generationGuidance.role !== b.surface.generationGuidance.role);
check('same Canonical Acts survive both role configurations', JSON.stringify(a.realization.canonicalPlan) === JSON.stringify(b.realization.canonicalPlan));
check('no role/domain/test wording branch exists', !/(宠物|女装|护肤|SaaS|industryCode|roleCode)/i.test(prompt + authority));
check('no new surface planner/gate/judge/repair/retry exists', !/(JudgmentSurface|RoleExpression)(Planner|Gate|Judge|Repair|Fallback|Retry|Humanizer)/.test(prompt + authority));
console.log(`\nJudgment Surface Authority Retirement: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
