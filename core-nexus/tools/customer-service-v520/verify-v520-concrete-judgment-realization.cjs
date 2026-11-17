#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { loadFinalHumanTurnCompiler, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const generator = read('src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const authority = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
let pass = 0; let fail = 0;
const check = (name, ok) => { if (ok) { pass += 1; console.log(`PASS ${name}`); } else { fail += 1; console.error(`FAIL ${name}`); } };
const syntax = (file) => !(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true, fileName: file }).diagnostics || []).some((d) => d.category === ts.DiagnosticCategory.Error);

check('retired HVE_JUDGMENT transport marker is absent', !generator.includes('HVE_JUDGMENT') && !prompt.includes('HVE_JUDGMENT'));
check('retired concrete judgment parser is absent', !generator.includes('parseHveConcreteJudgmentDecision'));
check('retired judgment realization is not model-facing', !authority.includes('judgmentRealization') && !prompt.includes('judgmentRealization'));
check('Canonical Plan remains the concrete semantic decision owner', authority.includes('canonicalPlan: {') && authority.includes('requiredActs: cloneSemanticActs(frame.acts.required)'));
check('persisted Role/Identity remains the server-side configurable source while ordinary Generation receives one typed surface HOW projection', authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && authority.includes("authority: 'STRUCTURED_PERSONA_SURFACE_ONLY_V1'") && prompt.includes('PERSONA_SURFACE_PROFILE=') && prompt.includes('ordinary Generation 不接收持久化 Role / Identity 的 free-form Prompt 原文'));

const { compile } = loadFinalHumanTurnCompiler(root);
const semanticAct = { id: 'ACT_DIRECT_ANSWER_FIXTURE', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', semantic: '给出当前明确判断。', authorityScope: 'PLAN_ONLY', allowedGroundingRefs: [], parameters: { target: 'CURRENT_FOCUS', decisionPurpose: 'RESOLVE_CURRENT_NEED', expectedInformationGain: 'CLEAR_DIRECTION' } };
const output = compile({ persona: { resolvedRoleIdentity: { generationPrompt: { role: 'ROLE HOW', identity: 'IDENTITY HOW' } } } }, normalizeFrame({ acts: { required: [semanticAct], preferred: [], optional: [], forbidden: [] } }));
check('actual final compiler preserves selected Act semantics and parameters', JSON.stringify(output.realization.canonicalPlan.requiredActs) === JSON.stringify([semanticAct]));
check('actual final compiler preserves configured Role and Identity HOW', output.surface.generationGuidance.role === 'ROLE HOW' && output.surface.generationGuidance.identity === 'IDENTITY HOW');
check('no role/domain/test-sentence dispatch exists in the final authority', !/(宠物|女装|护肤|SaaS|roleCode|industryCode|latestCustomerMessage\.(?:includes|match|test))/i.test(authority + prompt));
check('no replacement Gate/Judge/Repair/Retry authority was added', !/(ConcreteJudgment|JudgmentDecision)(Gate|Judge|Repair|Fallback|Retry|Humanizer)/.test(generator + prompt + authority));
check('current final files transpile', syntax('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts') && syntax('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'));
console.log(`\nRetired Concrete Judgment Authority: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
