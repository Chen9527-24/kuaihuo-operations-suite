#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(__dirname,'../..');let pass=0,fail=0;
function check(name,ok){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}`)}}
function src(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function syntax(rel){const s=src(rel);const out=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});return !(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error)}
const confRel='src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const conf=src(confRel),prompt=src(promptRel),kernel=src(kernelRel);
const economyStart=prompt.indexOf('export function buildGivenNewRealizationEconomySystemSection(');
const economyEnd=prompt.indexOf('export function buildRoleIdentityPersonaSystemSection(',economyStart);
const economy=economyStart>=0&&economyEnd>economyStart?prompt.slice(economyStart,economyEnd):'';
check('Semantic Conformance TypeScript syntax',syntax(confRel));
check('Generation Prompt Builder TypeScript syntax',syntax(promptRel));
check('Prompt Kernel Registry TypeScript syntax',syntax(kernelRel));
check('Runtime constructs Surface Atoms inside each HVE semantic unit',conf.includes('splitRuntimeSurfaceAtoms(unit.text)')&&!conf.includes("'CONFORMANCE_HVE_UNIT_BOUNDARY_NOT_SURFACE_ATOM_ALIGNED'"));
check('Given-New Realization Economy is model-facing current-turn execution',prompt.includes('buildGivenNewRealizationEconomySystemSection(humanPresence.realization)')&&economy.includes('【Given-New Realization Economy — This Turn Only】'));
check('GIVEN premise explicit realization requires semantic necessity',economy.includes('默认作为 reasoning premise 保持 implicit')&&economy.includes('实际改变本轮 selected Act 的判断、风险、选择、动作或结论'));
check('functional deletion test suppresses non-incremental restatement without lexical rules',economy.includes('功能删除测试')&&economy.includes('按语义功能执行，不按词、句首、领域或固定模板执行'));
check('R1 economy does not become R2.3 response-effort or output-quota control',!economy.includes('coverageObligation=SUFFICIENT_CURRENT_FOCUS')&&!/(softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|字符数|句数|固定长度|穷尽主题|教程层级)/.test(economy));
check('no role/domain/test-utterance or phrase special case in economy contract',!/(industryCode|roleCode|domainLabel|customerMessage\.includes|问得好|确实|宠物|服饰)/.test(economy));
check('kernel records final closure provenance only',kernel.includes('R1_UNIT_SCOPED_SURFACE_ATOM_GIVEN_NEW_ECONOMY_FINAL_CLOSURE_V1'));
check('non-veto preservation remains present',conf.includes('UNPROVEN_PRESERVED')&&conf.includes("sendEligibilityEffect: 'NONE'")&&conf.includes('canVetoNonEmptyGeneration: false'));
check('blind classifier remains one model call and no model-owned offsets', (conf.match(/modelGateway\.generate\(/g)||[]).length===1 && !conf.includes('MODEL_BLIND_OFFSET_MULTI_AXIS_SEMANTIC_CLASSIFICATION_V3'));
console.log(`\nR1 Final Freeze Candidate: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
