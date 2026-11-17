#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const {loadFinalHumanTurnCompiler,normalizeFrame}=require('./_final-human-turn-test-helper.cjs');
const root=path.resolve(__dirname,'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let pass=0,fail=0;
function check(name,ok){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}`)}}
function loadTs(src,fileName,deps={}){const compiled=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName});const loaded={exports:{}};const localRequire=req=>{if(req==='@nestjs/common')return{Injectable:()=>t=>t};if(Object.prototype.hasOwnProperty.call(deps,req))return deps[req];throw new Error(`Unexpected verifier dependency: ${req}`)};Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);return loaded.exports}
const finalRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const registryRel='src/modules/customer-service-agent/runtime/compliance/customer-service-act-descriptor.registry.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const finalSrc=read(finalRel),promptSrc=read(promptRel),registry=read(registryRel),kernel=read(kernelRel);
const {compile}=loadFinalHumanTurnCompiler(root);
const contract={persona:{resolvedRoleIdentity:{generationPrompt:{role:'ROLE_RAW_SERVER_ONLY',identity:'IDENTITY_RAW_SERVER_ONLY'}}}};
const value=compile(contract,normalizeFrame({acts:{required:[{id:'A1',type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',authorityScope:'PLAN_ONLY',allowedGroundingRefs:[]}],preferred:[],optional:[],forbidden:[]}}));
const reception=compile(contract,normalizeFrame({acts:{required:[{id:'A1',type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',authorityScope:'PLAN_ONLY',allowedGroundingRefs:[]}],preferred:[{id:'A2',type:'EMOTIONAL_ACK',necessity:'PREFERRED',semantic:'ack',authorityScope:'PLAN_ONLY',allowedGroundingRefs:[]}],optional:[],forbidden:[]}}));
check('v1.97 acknowledgement capability flag is retired instead of stacked again',!finalSrc.includes('independentAcknowledgement')&&!promptSrc.includes('independentAcknowledgement'));
check('value-only Canonical plan has zero selected reception Acts',value.realization.canonicalPlan.receptionContribution.selected===false&&value.realization.canonicalPlan.receptionContribution.actTypes.length===0&&value.realization.canonicalPlan.semanticPermit.customerVisibleContributionScope==='SELECTED_CANONICAL_ACTS_ONLY');
check('selected Canonical reception Act remains available through the same semantic permit',reception.realization.canonicalPlan.receptionContribution.selected===true&&reception.realization.canonicalPlan.receptionContribution.actTypes.includes('EMOTIONAL_ACK')&&reception.realization.canonicalPlan.semanticPermit.selectedActTypes.includes('DIRECT_ANSWER'));
for(const t of ['PRESENCE_ACK','LIGHT_ACK','EMOTIONAL_ACK','REASSURE','RELATIONSHIP_MAINTENANCE','ACKNOWLEDGE_PREFERENCE','ACKNOWLEDGE_PROBLEM']) check(`${t} is Canonical-explicit semantic ownership`,new RegExp(`type: '${t}'[^\\n]+authorization: 'EXPLICIT_ONLY'`).test(registry));
check('typed Persona surface exists and raw persisted Role/Identity remains server-side only',value.surface.generationGuidance.surfaceProfile.authority==='STRUCTURED_PERSONA_SURFACE_ONLY_V1'&&value.surface.generationGuidance.role==='ROLE_RAW_SERVER_ONLY'&&value.surface.generationGuidance.identity==='IDENTITY_RAW_SERVER_ONLY'&&promptSrc.includes('ordinary Generation 不接收持久化 Role / Identity 的 free-form Prompt 原文'));
check('R1 structural closure adds no lexical Generation filter or post-generation semantic rewrite',!/(banCongrat|banIndeed|banCommon|ackKeyword|receptionKeyword|rewriteGenerated|postGenerationPersona|PersonaJudge|PersonaRepair|PersonaRetry|secondModelCall)/i.test(finalSrc+'\n'+promptSrc));
check('kernel records v1.98 structural closure and keeps later R2 phases unopened',kernel.includes("version: 'hve-3-v1.99'")&&kernel.includes('Authority/Enforcement Structural Closure')&&kernel.includes('R2.3-R2.5 remain NOT STARTED'));
console.log(`\nR1.21 Superseded by Structural Ownership: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
