#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const {loadFinalHumanTurnCompiler,normalizeFrame}=require('./_final-human-turn-test-helper.cjs');
const root=path.resolve(__dirname,'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function loadTs(rel,deps={}){const src=read(rel);const compiled=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:rel});const loaded={exports:{}};const localRequire=req=>{if(req==='@nestjs/common')return{Injectable:()=>t=>t};if(Object.prototype.hasOwnProperty.call(deps,req))return deps[req];throw new Error(`Unexpected verifier dependency: ${req}`)};Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);return loaded.exports}
const finalRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const registryRel='src/modules/customer-service-agent/runtime/compliance/customer-service-act-descriptor.registry.ts';
const recognizerRel='src/modules/customer-service-agent/runtime/compliance/customer-service-output-act-recognizer.ts';
const planRel='src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const finalSrc=read(finalRel),promptSrc=read(promptRel),registry=read(registryRel),recognizer=read(recognizerRel),plan=read(planRel),kernel=read(kernelRel);
const receptionActs=['PRESENCE_ACK','LIGHT_ACK','EMOTIONAL_ACK','REASSURE','RELATIONSHIP_MAINTENANCE','ACKNOWLEDGE_PREFERENCE','ACKNOWLEDGE_PROBLEM'];
check('all independently visible reception/relationship Acts use Canonical explicit ownership',receptionActs.every(type=>new RegExp(`type: '${type}'[^\\n]+authorization: 'EXPLICIT_ONLY'`).test(registry)));
check('obsolete HumanTurn-natural-acknowledgement ownership is absent from InteractionPlan owner',!/(HumanTurn.{0,80}(?:natural acknowledgement|acknowledgement.*useful)|acknowledgement.{0,80}HumanTurn)/is.test(plan));
check('v1.97 Prompt-level independent acknowledgement flag is fully retired',!finalSrc.includes('independentAcknowledgement')&&!promptSrc.includes('independentAcknowledgement'));

const {compile}=loadFinalHumanTurnCompiler(root);
const contract={persona:{resolvedRoleIdentity:{generationPrompt:{role:'RAW_ROLE_MUST_NOT_TRAVEL',identity:'RAW_IDENTITY_MUST_NOT_TRAVEL'}}}};
const frame=normalizeFrame({
  acts:{required:[{id:'ACT_VALUE',type:'DIRECT_ANSWER',necessity:'REQUIRED',semantic:'answer',authorityScope:'PLAN_ONLY',allowedGroundingRefs:[]}],preferred:[],optional:[],forbidden:[]},
  voice:{speaker:{stableCore:{
    corePresence:{directness:73,formality:41,energy:58,warmth:99,empathyStyle:'HIGH',proactivity:99,adviceStyle:'PUSH'},
    conversationalTexture:{colloquiality:'HIGH',sentenceShape:'MIXED',fragmentTolerance:'HIGH',ellipsisTolerance:'MEDIUM',rhythmVariation:'HIGH',humor:'HIGH'},
    deliveryStyle:{emoji:'NATURAL',sentenceParticleLevel:'MEDIUM',relationshipMaintenance:'HIGH'}
  }}}
});
const human=compile(contract,frame);
const profile=human.surface.generationGuidance.surfaceProfile;
check('server-side persisted Prompt remains intact for audit/editing',human.surface.generationGuidance.role==='RAW_ROLE_MUST_NOT_TRAVEL'&&human.surface.generationGuidance.identity==='RAW_IDENTITY_MUST_NOT_TRAVEL');
check('typed Persona profile contains only approved surface dimensions',JSON.stringify(Object.keys(profile).sort())===JSON.stringify(['authority','colloquiality','directness','ellipsisTolerance','emoji','energy','formality','fragmentTolerance','rhythmVariation','sentenceParticleLevel','sentenceShape','source'].sort()));
check('semantic-capable Persona dimensions are structurally absent',!['warmth','empathyStyle','proactivity','adviceStyle','relationshipMaintenance','humor','playfulness','emotionalExpressiveness'].some(k=>Object.prototype.hasOwnProperty.call(profile,k)));
check('typed Persona profile preserves selected neutral surface values',profile.directness===73&&profile.formality===41&&profile.colloquiality==='HIGH'&&profile.rhythmVariation==='HIGH');

const builder=loadTs(promptRel,{
  './customer-service-nlg-execution-brief':{compileCustomerServiceNlgSemanticFrameV1:()=>({})},
  './customer-service-final-realization-authority':{compileCustomerServiceFinalModelFacingHumanTurn:()=>({})},
});
const system=builder.buildRoleIdentityPersonaSystemSection(human.surface.generationGuidance);
const transport=builder.projectHveModelFacingContextTransport({
  schemaVersion:2,speaker:{authority:'PC_RESOLVED_ROLE_IDENTITY_CONTEXT'},
  conversation:{recentConversation:[],priorSpeakerTurns:[]},
  humanPresence:human,
  answerAuthority:{authority:'PROJECTION_ONLY',allowedGroundingRefs:[]},
  knowledge:{verifiedFacts:[],selectedEntries:[]},pcPolicy:{},responseAssets:[]
});
const serialized=JSON.stringify(transport);
check('ordinary model transport contains no raw persisted Role/Identity Prompt',!serialized.includes('RAW_ROLE_MUST_NOT_TRAVEL')&&!serialized.includes('RAW_IDENTITY_MUST_NOT_TRAVEL'));
check('ordinary model transport carries exactly one typed Persona surface projection',transport.personaSurfaceProfile?.authority==='STRUCTURED_PERSONA_SURFACE_ONLY_V1'&&!Object.prototype.hasOwnProperty.call(transport.humanPresence.surface,'generationGuidance'));
check('system Persona carrier exposes capability plus typed surface but no raw source',system.includes('PERSONA_SEMANTIC_CAPABILITY=')&&system.includes('PERSONA_SURFACE_PROFILE=')&&!system.includes('RAW_ROLE_MUST_NOT_TRAVEL')&&!system.includes('RAW_IDENTITY_MUST_NOT_TRAVEL'));
check('value-only turn exposes no selected reception owner',human.realization.canonicalPlan.receptionContribution.selected===false&&system.includes('Selected reception Acts: none.'));

check('unexpected reception diagnostics now scan all EXPLICIT_ONLY Acts without becoming send authority',recognizer.includes(".filter((item) => item.authorization === 'EXPLICIT_ONLY')")&&recognizer.includes("case 'EMOTIONAL_ACK'")&&recognizer.includes("case 'RELATIONSHIP_MAINTENANCE'")&&!/selectionEligible\s*=|finalCandidate|deliveryDecision|sendEligible/.test(recognizer));
const lightAckBlock=recognizer.slice(recognizer.indexOf("case 'LIGHT_ACK'"),recognizer.indexOf("case 'REASSURE'"));
check('bare factual stance marker is not treated as generic LIGHT_ACK',!lightAckBlock.includes('确实'));
check('no role/domain/product/location/test-utterance branch or lexical Generation blacklist was added',!/(roleCode\s*===|industryCode\s*===|productKeyword|locationKeyword|banCongrat|banIndeed|banCommon|testUtterance)/i.test(finalSrc+'\n'+promptSrc+'\n'+plan));
check('no second Planner/Gate/Judge/Repair/Retry/Fallback/model call or post-generation rewrite was added',!/(ReceptionPlanner|ReceptionGate|ReceptionJudge|PersonaRepair|PersonaRetry|PersonaFallback|secondModelCall|rewriteGenerated)/i.test(finalSrc+'\n'+promptSrc+'\n'+plan));
check('kernel identifies v1.98 as V11-governed Authority/Enforcement structural closure',kernel.includes("version: 'hve-3-v1.99'")&&kernel.includes('V11 Anti-Patch-Inertia')&&kernel.includes('Authority/Enforcement Structural Closure'));
console.log(`\nR1.22 Authority/Enforcement Structural Closure: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
