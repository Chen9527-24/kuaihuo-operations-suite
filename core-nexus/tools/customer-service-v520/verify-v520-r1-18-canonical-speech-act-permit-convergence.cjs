#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const {compileFinalHumanTurn,normalizeFrame}=require('./_final-human-turn-test-helper.cjs');
const root=path.resolve(__dirname,'../..');
const authorityRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const runtimeRel='src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts';
const autoRel='src/modules/auto-replies/auto-replies.service.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const authority=fs.readFileSync(path.join(root,authorityRel),'utf8');
const prompt=fs.readFileSync(path.join(root,promptRel),'utf8');
const runtime=fs.readFileSync(path.join(root,runtimeRel),'utf8');
const auto=fs.readFileSync(path.join(root,autoRel),'utf8');
const kernel=fs.readFileSync(path.join(root,kernelRel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
const contract={persona:{resolvedRoleIdentity:{generationPrompt:{role:'generic role how',identity:'generic identity how'}}},businessContext:{conversationStrategy:{policy:{humanBehavior:{}}}}};
const valueFrame=normalizeFrame({acts:{required:[{type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',reasonCode:'fixture',parameters:{target:'answer'}}],preferred:[],optional:[],forbidden:[]}});
const receptionFrame=normalizeFrame({acts:{required:[{type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',reasonCode:'fixture',parameters:{target:'answer'}}],preferred:[{type:'EMOTIONAL_ACK',necessity:'PREFERRED',semantic:'ack',reasonCode:'fixture',parameters:{}}],optional:[],forbidden:[]}});
const value=compileFinalHumanTurn(root,valueFrame,contract);
const reception=compileFinalHumanTurn(root,receptionFrame,contract);
check('FinalHumanTurn exposes exhaustive permit derived from selected Canonical Acts', value.realization.canonicalPlan.semanticPermit.authority==='DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY' && value.realization.canonicalPlan.semanticPermit.selectedActTypes.includes('DIRECT_ANSWER'));
check('value-only permit has no reception owner while selected reception remains explicit', value.realization.canonicalPlan.receptionContribution.selected===false && reception.realization.canonicalPlan.receptionContribution.selected===true && reception.realization.canonicalPlan.receptionContribution.actTypes.includes('EMOTIONAL_ACK'));
check('Persona authority is expression-only and carries no semantic delta', value.surface.generationGuidance.semanticAuthority==='EXPRESSION_ONLY_NO_SEMANTIC_DELTA' && value.realization.canonicalPlan.semanticPermit.personaSemanticDelta==='EXPRESSION_ONLY_NO_SEMANTIC_DELTA');
check('customer-visible contribution scope remains selected Canonical Acts only', value.realization.canonicalPlan.semanticPermit.customerVisibleContributionScope==='SELECTED_CANONICAL_ACTS_ONLY' && value.realization.constraints.semanticContributionScope==='SELECTED_CANONICAL_ACTS_ONLY');
function loadPromptBuilder(){
  const compiled=ts.transpileModule(prompt,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:promptRel});
  const loaded={exports:{}};
  const localRequire=req=>{if(req==='@nestjs/common')return{Injectable:()=>t=>t};if(req==='./customer-service-nlg-execution-brief')return{compileCustomerServiceNlgSemanticFrameV1:()=>({})};if(req==='./customer-service-final-realization-authority')return{compileCustomerServiceFinalModelFacingHumanTurn:()=>({})};throw new Error(`Unexpected verifier dependency: ${req}`)};
  Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);
  return loaded.exports;
}
const systemSection=loadPromptBuilder().buildCurrentCanonicalExecutionSystemSection(value.realization);
check('Current Canonical Execution emits one compact machine-readable semantic permit', systemSection.includes('CURRENT_SEMANTIC_PERMIT=') && systemSection.includes('"receptionContribution":"NOT_SELECTED"') && systemSection.includes('"personaSemanticDelta":"EXPRESSION_ONLY_NO_SEMANTIC_DELTA"'));
check('permit is stated as exhaustive speech-act/proposition authority rather than surface style', systemSection.includes('穷尽语义授权') && systemSection.includes('不是 Persona 风格'));
check('permit uses neutral-realization function test rather than phrase or position rules', systemSection.includes('中性实现同一组 selected Acts') && systemSection.includes('删除后不损失这些 Acts 实际判断、信息、风险、选择、行动或已选关系任务'));
check('older duplicated semantic-scope explanation was replaced rather than stacked', !prompt.includes('把额外关系承接、评价、安抚或其他贡献塞进已选 value Act 的同一句/同一 segment') && (prompt.match(/CURRENT_SEMANTIC_PERMIT/g)||[]).length>=2);
check('read-only diagnostics expose exact generation kernel without authority effects', runtime.includes('generationKernel: Object.keys(hve3GenerationKernel).length ? hve3GenerationKernel : null') && auto.includes('hveGenerationKernel: result.diagnostics?.generationKernel || null'));
check('R1.18 adds no lexical blacklist, phrase frequency, post-generation rewrite or second model path', !/(tokenBlacklist|phraseBlacklist|phraseFrequency|rewriteCandidate|replaceGenerated|receptionJudge|normalizationJudge|secondModelCall)/i.test(authority+'\n'+prompt+'\n'+runtime+'\n'+auto));
check('R1.18 source contains no observed Live utterance/domain fixture', !/(恭喜入职|别太担心|柯基爆冲|广州夏天|tencel|wide-leg)/i.test(authority+'\n'+prompt));
check('kernel records v1.93 permit convergence with R2.2 unchanged', kernel.includes("version: 'hve-3-v1.99'") && kernel.includes('R1 Regression-only Canonical Speech-Act Permit Convergence') && kernel.includes('R2.2 implementation is unchanged and remains Live pending'));
console.log(`\nR1.18 Canonical Speech-Act Permit Convergence: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
