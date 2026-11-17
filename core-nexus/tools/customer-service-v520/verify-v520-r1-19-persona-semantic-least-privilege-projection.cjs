#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const {loadFinalHumanTurnCompiler,normalizeFrame}=require('./_final-human-turn-test-helper.cjs');
const root=path.resolve(__dirname,'../..');
const authorityRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const authority=fs.readFileSync(path.join(root,authorityRel),'utf8');
const prompt=fs.readFileSync(path.join(root,promptRel),'utf8');
const kernel=fs.readFileSync(path.join(root,kernelRel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function loadPromptBuilder(){
  const compiled=ts.transpileModule(prompt,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:promptRel});
  const loaded={exports:{}};
  const localRequire=req=>{if(req==='@nestjs/common')return{Injectable:()=>t=>t};if(req==='./customer-service-nlg-execution-brief')return{compileCustomerServiceNlgSemanticFrameV1:()=>({})};if(req==='./customer-service-final-realization-authority')return{compileCustomerServiceFinalModelFacingHumanTurn:()=>({})};throw new Error(`Unexpected verifier dependency: ${req}`)};
  Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);
  return loaded.exports;
}
const contract={persona:{resolvedRoleIdentity:{generationPrompt:{role:'ROLE_SOURCE_WITH_MIXED_HOW',identity:'IDENTITY_SOURCE_WITH_MIXED_HOW'}}},businessContext:{conversationStrategy:{policy:{humanBehavior:{}}}}};
const valueFrame=normalizeFrame({acts:{required:[{type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',reasonCode:'fixture',parameters:{target:'answer'}}],preferred:[],optional:[],forbidden:[]}});
const receptionFrame=normalizeFrame({acts:{required:[{type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',reasonCode:'fixture',parameters:{target:'answer'}}],preferred:[{type:'EMOTIONAL_ACK',necessity:'PREFERRED',semantic:'ack',reasonCode:'fixture',parameters:{}}],optional:[],forbidden:[]}});
const {compile}=loadFinalHumanTurnCompiler(root);
const value=compile(contract,valueFrame);
const reception=compile(contract,receptionFrame);
check('FinalHumanTurn keeps persisted Role/Identity text while adding one Canonical-derived Persona projection',
  value.surface.generationGuidance.role==='ROLE_SOURCE_WITH_MIXED_HOW'
  && value.surface.generationGuidance.identity==='IDENTITY_SOURCE_WITH_MIXED_HOW'
  && value.surface.generationGuidance.semanticProjection.authority==='DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY');
check('value-only Persona projection exposes only selected value Acts and zero reception Acts',
  value.surface.generationGuidance.semanticProjection.selectedActTypes.includes('DIRECT_ANSWER')
  && value.surface.generationGuidance.semanticProjection.selectedReceptionActTypes.length===0);
check('selected reception remains available through the same projection instead of a second Persona selector',
  reception.surface.generationGuidance.semanticProjection.selectedReceptionActTypes.includes('EMOTIONAL_ACK')
  && reception.surface.generationGuidance.semanticProjection.selectedActTypes.includes('DIRECT_ANSWER'));
check('unselected Persona semantic instructions are explicitly inert while source text remains HOW data',
  value.surface.generationGuidance.semanticProjection.unselectedSemanticInstructions==='INERT_THIS_TURN'
  && value.surface.generationGuidance.semanticProjection.sourceTextRole==='EXPRESSION_SOURCE_DATA_ONLY');
const builder=loadPromptBuilder();
const section=builder.buildRoleIdentityPersonaSystemSection(value.surface.generationGuidance);
const sourceData=builder.buildRoleIdentityPersonaSourceData(value.surface.generationGuidance);
check('Persona system carrier exposes the Canonical-derived capability without embedding persisted source text',
  section.includes('PERSONA_SEMANTIC_CAPABILITY=')
  && section.includes('"selectedReceptionActTypes":[]')
  && section.includes('"unselectedSemanticInstructions":"INERT_THIS_TURN"')
  && !section.includes('ROLE_SOURCE_WITH_MIXED_HOW')
  && !section.includes('IDENTITY_SOURCE_WITH_MIXED_HOW')
  && !section.includes('【Role Prompt】')
  && !section.includes('【Identity Prompt】'));
check('persisted Role and Identity remain server-side configuration while ordinary Persona source projection is typed surface-only',
  value.surface.generationGuidance.role==='ROLE_SOURCE_WITH_MIXED_HOW'
  && value.surface.generationGuidance.identity==='IDENTITY_SOURCE_WITH_MIXED_HOW'
  && sourceData.authority==='STRUCTURED_PERSONA_SURFACE_ONLY_V1'
  && sourceData.semanticAuthority==='EXPRESSION_ONLY_NO_SEMANTIC_DELTA'
  && sourceData.source==='ROLE_SPEAKER_PROJECTION'
  && sourceData.profile?.authority==='STRUCTURED_PERSONA_SURFACE_ONLY_V1'
  && !Object.prototype.hasOwnProperty.call(sourceData,'role')
  && !Object.prototype.hasOwnProperty.call(sourceData,'identity')
  && !Object.prototype.hasOwnProperty.call(sourceData,'sourceTextRole'));
check('no-reception capability preserves expression-only scope and denies independent reception semantics',
  section.includes('Selected reception Acts: none.')
  && section.includes('no independent relation/reception speech-act authority'));
check('R1.19 changes model-facing transport only; persisted Role/Identity resolver remains untouched by lexical sanitation',
  authority.includes("sourceTextRole: 'EXPRESSION_SOURCE_DATA_ONLY'")
  && !/(sanitizePersona|filterPersona|stripPersona|personaKeyword|tokenBlacklist|phraseBlacklist)/i.test(authority+'\n'+prompt));
check('R1.19 adds no second Persona, judge, repair, retry, fallback or post-generation rewrite',
  !/(SecondaryPersona|PersonaSelector|PersonaJudge|PersonaRepair|PersonaRetry|PersonaFallback|postGenerationPersona|rewriteGenerated)/i.test(authority+'\n'+prompt));
check('R1.19 source contains no observed role/domain/utterance fixture',
  !/(柯基|广州|通勤穿搭|恭喜入职|别太担心|不用太担心|不用太着急)/i.test(authority+'\n'+prompt));
check('kernel retains R1.19 least-privilege history under latest v1.96 transport closure',
  kernel.includes("version: 'hve-3-v1.99'")
  && kernel.includes('V1.95 P0-5 final closure')
  && kernel.includes('EXPRESSION_SOURCE_DATA_ONLY')
  && kernel.includes('INERT_THIS_TURN'));
console.log(`\nR1.19 Persona Semantic Least-Privilege Projection: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
