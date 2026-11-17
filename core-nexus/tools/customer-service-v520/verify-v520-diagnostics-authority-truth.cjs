#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const rel='src/modules/customer-service-agent/runtime/compliance/customer-service-humanity-preference-evaluator.ts';
const src=fs.readFileSync(path.join(root,rel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
const descriptor=type=>({authorityScope:['RECOMMEND_GROUNDED_ITEM','EXPLAIN_GROUNDED_FACT'].includes(type)?'GROUNDED_BUSINESS':'PLAN_ONLY',allowedWhenActs:[]});
const compiled=ts.transpileModule(src+'\nexports.__resolveKnowledgeUtilization=resolveKnowledgeUtilization;\nexports.__evaluateCurrentTurnValue=evaluateCurrentTurnValue;\nexports.__evaluateRoleVoiceFidelity=evaluateRoleVoiceFidelity;\n',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});
check('humanity evaluator TypeScript syntax',!(compiled.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));
const box={exports:{},module:{exports:{}},require:id=>{
 if(id==='@nestjs/common')return{Injectable:()=>t=>t};
 if(id.includes('customer-service-act-descriptor.registry'))return{getCustomerServiceActDescriptor:descriptor};
 if(id.includes('customer-service-hve-family-realization'))return{resolveCustomerServiceHveFamilyRealization:()=>({family:'GENERAL'})};
 return{};
},console,process};box.module.exports=box.exports;vm.runInNewContext(compiled.outputText,box,{filename:rel});
const resolve=box.exports.__resolveKnowledgeUtilization;
const current=box.exports.__evaluateCurrentTurnValue;
const role=box.exports.__evaluateRoleVoiceFidelity;
const knowledge=[{id:'K1'}];
const exactGrounding=[{source:'KNOWLEDGE',key:'K1',requirement:'REQUIRED',status:'SATISFIED',evidenceRefs:['K1']}];
const genericPlan={interactionType:'PRODUCT_FACT_QUERY',acts:[{type:'DIRECT_ANSWER',necessity:'REQUIRED',parameters:{expectedInformationGain:'ADD_GROUNDED_INFORMATION'}}],answerObligation:null};
const genericUtil=resolve(genericPlan,[],knowledge);
check('generic non-GROUNDED Act is Grounded NOT_APPLICABLE',genericUtil.status==='NOT_APPLICABLE'&&genericUtil.expectedByActs.length===0,JSON.stringify(genericUtil));
const genericValue=current({plan:genericPlan,observed:[],customer:'x',reply:'answer',genericTruisms:[],knowledge:genericUtil,crossTurnInformationGainScore:96});
check('generic metadata cannot emit CURRENT_TURN_GROUNDED_VALUE_MISSED',!genericValue.evidence.includes('CURRENT_TURN_GROUNDED_VALUE_MISSED'),JSON.stringify(genericValue));
const groundedWithoutRefs={interactionType:'PRODUCT_FACT_QUERY',acts:[{type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',parameters:{expectedInformationGain:'ADD_GROUNDED_INFORMATION'}}],answerObligation:null};
const noRefs=resolve(groundedWithoutRefs,[],knowledge);
check('GROUNDED_BUSINESS type without exact Act-bound refs is NOT_APPLICABLE',noRefs.status==='NOT_APPLICABLE'&&noRefs.expectedByActs.length===0,JSON.stringify(noRefs));
const preferredGrounded={interactionType:'PRODUCT_FACT_QUERY',acts:[{type:'EXPLAIN_GROUNDED_FACT',necessity:'PREFERRED',grounding:exactGrounding,parameters:{expectedInformationGain:'ADD_GROUNDED_INFORMATION'}}],answerObligation:null};
const preferred=resolve(preferredGrounded,[],knowledge);
check('non-Required Grounded Act cannot create a missed obligation',preferred.status==='NOT_APPLICABLE'&&preferred.expectedByActs.length===0,JSON.stringify(preferred));
const groundedPlan={interactionType:'PRODUCT_FACT_QUERY',acts:[
 {type:'DIRECT_ANSWER',necessity:'REQUIRED',parameters:{expectedInformationGain:'ANSWER_CURRENT_FOCUS'}},
 {type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:exactGrounding,parameters:{expectedInformationGain:'ADD_GROUNDED_INFORMATION'}},
],answerObligation:null};
const missed=resolve(groundedPlan,[],knowledge);
check('selected GROUNDED_BUSINESS Act with available unobserved evidence remains observable as missed',missed.status==='AVAILABLE_NOT_OBSERVED'&&missed.expectedByActs[0]==='RECOMMEND_GROUNDED_ITEM');
const missedValue=current({plan:groundedPlan,observed:[],customer:'x',reply:'x',genericTruisms:[],knowledge:missed,crossTurnInformationGainScore:96});
check('true Grounded obligation takes precedence over co-selected generic answer diagnostics',missedValue.evidence.includes('CURRENT_TURN_GROUNDED_VALUE_MISSED'),JSON.stringify(missedValue));
const irrelevant=resolve(groundedPlan,[],[{id:'K2'}]);
check('unrelated Knowledge cannot satisfy exact Act-bound Grounding eligibility',irrelevant.status==='NOT_AVAILABLE'&&irrelevant.availableEntryIds.length===0,JSON.stringify(irrelevant));
const wrongActObserved=resolve(groundedPlan,[{type:'DIRECT_ANSWER',observation:'OBSERVED',groundingRefs:['K1'],spans:[]}],knowledge);
check('Grounding ref observed under a non-Grounded Act cannot count as realized',wrongActObserved.status==='AVAILABLE_NOT_OBSERVED'&&wrongActObserved.observedEntryIds.length===0,JSON.stringify(wrongActObserved));
const used=resolve(groundedPlan,[{type:'RECOMMEND_GROUNDED_ITEM',observation:'OBSERVED',groundingRefs:['K1'],spans:[]}],knowledge);
check('observed Act-bound Grounding remains OBSERVED_WITH_GROUNDING',used.status==='OBSERVED_WITH_GROUNDING'&&used.observedEntryIds[0]==='K1');

const speaker={source:'ROLE_PROTOTYPE',stableCore:{
 deliveryStyle:{emoji:'NATURAL',sentenceParticleLevel:'MEDIUM'},
 conversationalTexture:{brevity:'BALANCED',colloquiality:'HIGH'},
 interactionStyle:{adviceStyle:'COLLABORATIVE'},
 corePresence:{warmth:80},
}};
const realization={persona:{presence:{formality:'CASUAL',directness:'BALANCED',playfulness:'BALANCED',expressiveness:'BALANCED',energy:'BALANCED'}},surfaceBudget:{softMaxChars:200},participation:{roleBehavior:{expressionDynamics:{warmth:'WARM',engagement:'ACTIVE',reassurance:'LIGHT',servicePresence:'AVAILABLE'}}}};
const unauthorizedObserved=[{type:'LIGHT_ACK',observation:'OBSERVED',groundingRefs:[],spans:[{text:'这个我懂',start:0,end:4}]}];
const valueOnlyPlan={acts:[{type:'DIRECT_ANSWER',necessity:'REQUIRED'}]};
const unauthorized=role({text:'这个我懂，直接回答。',plan:valueOnlyPlan,observed:unauthorizedObserved,speaker,realization});
check('unauthorized reception is surfaced as diagnostic mismatch',unauthorized.evidence.includes('UNAUTHORIZED_RECEPTION_OBSERVED_DIAGNOSTIC'),JSON.stringify(unauthorized));
check('unauthorized reception is never rewarded as ROLE_WARMTH_ACK_OBSERVED',!unauthorized.evidence.includes('ROLE_WARMTH_ACK_OBSERVED'),JSON.stringify(unauthorized));
const authorizedPlan={acts:[{type:'LIGHT_ACK',necessity:'REQUIRED'}]};
const authorized=role({text:'这个我懂。',plan:authorizedPlan,observed:unauthorizedObserved,speaker,realization});
check('selected reception can still count as positive Role warmth',authorized.evidence.includes('ROLE_WARMTH_ACK_OBSERVED')&&!authorized.evidence.includes('UNAUTHORIZED_RECEPTION_OBSERVED_DIAGNOSTIC'),JSON.stringify(authorized));
check('diagnostic correction remains isolated from generation/selection/send symbols',!/(selectionEligible\s*=|finalCandidate\s*=|deliveryDecision\s*=|generator\.|modelGateway\.generate)/.test(src.slice(src.indexOf('function resolveKnowledgeUtilization'),src.indexOf('function evaluateSpeakerContinuity'))));
console.log(`\nDiagnostics Authority Truth: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
