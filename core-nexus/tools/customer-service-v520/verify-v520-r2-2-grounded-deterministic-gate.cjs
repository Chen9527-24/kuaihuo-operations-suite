#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
let pass=0,fail=0;function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function load(rel,extra,deps={}){const src=fs.readFileSync(path.join(root,rel),'utf8')+extra;const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});check(`${path.basename(rel)} TypeScript syntax`,!(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));const box={exports:{},module:{exports:{}},require:id=>{if(id==='@nestjs/common')return{Injectable:()=>t=>t,Logger:class{warn(){}}};if(Object.prototype.hasOwnProperty.call(deps,id))return deps[id];return{};},console,process};box.module.exports=box.exports;vm.runInNewContext(out.outputText,box,{filename:rel});return box.exports;}
const knowledgeRel='src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts';
const knowledge=load(knowledgeRel,'',{ './customer-service-business-scope.util':{isCustomerServiceKnowledgeIndustryCoherent:()=>({coherent:true,reason:null})} });
const planRel='src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const plan=load(planRel,'\nexports.__addAnswerObligationActs=addAnswerObligationActs;\n',{
 './customer-service-legacy-act-adapter':{mapCustomerServiceLegacyActs:()=>[]},
 './customer-service-interaction-type.resolver':{CustomerServiceInteractionTypeResolver:class{}},
 './customer-service-answer-obligation':{resolveCustomerServiceAnswerObligation:()=>null},
 './customer-service-critical-intent.util':{resolveCustomerServiceCriticalIntent:()=>({intent:'NONE'})},
 '../../shared/context/customer-service-knowledge.util':{
  selectCustomerServiceBusinessFactGroundingEntries:knowledge.selectCustomerServiceBusinessFactGroundingEntries,
 },
});
const select=knowledge.selectCustomerServiceRuntimeKnowledgeDetailed;
const add=plan.__addAnswerObligationActs;
const now=new Date('2026-08-31T00:00:00Z');
const entry=(v)=>({collectionId:null,scopeType:'STORE',scopeKey:'store-1',aliases:[],structuredData:null,references:[],authorityLevel:'BUSINESS_FACT',chunkIndex:null,sourceFileName:null,bindingPriority:0,bindingTargetType:null,bindingTargetKey:null,collection:null,question:null,tags:[],sourceType:'MANUAL',sourceReference:null,revision:1,effectiveFrom:null,effectiveTo:null,updatedAt:now,...v});
const generic=entry({id:'K_GENERIC',entityType:'GENERIC',entityKey:null,category:'REFERENCE',title:'广州夏季通勤裤选择',content:'夏季通勤裤优先考虑透气和垂坠感。',tags:['广州','夏季','通勤','裤']});
const guideWithApplicability=entry({id:'K_GUIDE',entityType:'GUIDE',entityKey:'guide-fabric',category:'REFERENCE',bindingTargetType:'STORE',bindingTargetKey:'store-1',title:'夏季通勤面料与体感原则',content:'高温通勤可综合考虑吸湿、抗皱和垂坠。',tags:['夏季','通勤','面料']});
const policyWithApplicability=entry({id:'K_POLICY',entityType:'POLICY',entityKey:'policy-service',category:'SERVICE_POLICY',bindingTargetType:'ROLE',bindingTargetKey:'role-1',title:'售前事实边界',content:'不承诺未确认的实时库存和价格。',tags:['售前','边界']});
const matched=entry({id:'K_PRODUCT_A',entityType:'PRODUCT',entityKey:'product-A',aliases:['测试款A'],category:'PRODUCT',title:'广州夏季高腰微阔腿通勤裤',content:'测试款A，高腰微阔腿，天丝混纺，适合夏季通勤，黑色和浅灰。',tags:['广州','夏季','通勤','胯宽','裤'],structuredData:{fit:'高腰微阔腿',material:'天丝混纺',season:'夏季',colors:['黑色','浅灰']}});
const irrelevant=entry({id:'K_WINTER_COAT',entityType:'PRODUCT',entityKey:'winter-coat',aliases:['冬季大衣B'],category:'PRODUCT',title:'冬季羊毛大衣',content:'冬季羊毛大衣，保暖厚实。',tags:['冬季','羊毛','大衣']});
const input={message:'广州夏天通勤，胯宽，想选具体裤子，有没有合适的方向？',scenario:'PRODUCT_CONSULT',intent:'ASK_INFORMATION',topics:['通勤裤'],conversationState:null,conversationStrategy:null,maxEstimatedTokens:2200,businessScope:null};
const genericSelection=select([generic,guideWithApplicability,policyWithApplicability],input).selected;
check('Case A context Knowledge is retrievable but applicability/non-offering identity cannot create a candidate',genericSelection.length>0&&genericSelection.every(e=>plan.isCustomerServiceRecommendationCapableKnowledgeEntry(e)===false),JSON.stringify(genericSelection.map(e=>[e.id,e.entityType,e.category,e.bindingTargetType,e.bindingTargetKey])));
check('Case A strongest reverse boundary rejects STORE/ROLE applicability as concrete candidate identity',plan.isCustomerServiceRecommendationCapableKnowledgeEntry(guideWithApplicability)===false&&plan.isCustomerServiceRecommendationCapableKnowledgeEntry(policyWithApplicability)===false);
const matchedSelection=select([generic,guideWithApplicability,policyWithApplicability,matched],input).selected;
check('Case B matched structured product entity is selected as recommendation-capable',matchedSelection.some(e=>e.id==='K_PRODUCT_A'&&plan.isCustomerServiceRecommendationCapableKnowledgeEntry(e)===true),JSON.stringify(matchedSelection.map(e=>[e.id,e.relevanceScore,e.selectionReason])));
const irrelevantSelection=select([irrelevant],input).selected;
check('Case C irrelevant structured entity is excluded before Grounded admission',irrelevantSelection.length===0,JSON.stringify(irrelevantSelection));
const obligation={schemaVersion:1,authority:'CANONICAL_RESPONSE_OBLIGATION',continuity:'NEW_NEED',currentFocus:'RECOMMENDATION',currentFocusLabel:'基于当前条件给出具体推荐',previousFocus:null,previousAssistantExcerpt:null,mustAddNewInformation:true,avoidRepeat:false,evidenceState:'NOT_REQUIRED',unknownStrategy:'NOT_APPLICABLE',responseTarget:{schemaVersion:1,authority:'CANONICAL_RESPONSE_TARGET',focus:'RECOMMENDATION',requestedSpecificity:'CONCRETE',unresolvedNeed:'给出当前推荐',priorCoverage:'NONE',requiredDelta:'NONE',knowledgeRequirement:'GENERAL_CONTEXT_ALLOWED',source:'SEMANTIC_SIGNAL',confidence:.98,evidence:[]},evidence:[]};
function compile(entries){const acts=[],grounding=[];add(obligation,entries,acts,grounding);return{acts,grounding};}
const caseA=compile(genericSelection);
check('Case A produces general recommendation value without RECOMMEND_GROUNDED_ITEM',caseA.acts.some(a=>a.type==='PROVIDE_GENERAL_GUIDANCE')&&!caseA.acts.some(a=>a.type==='RECOMMEND_GROUNDED_ITEM'));
const caseB=compile(matchedSelection);
const grounded=caseB.acts.find(a=>a.type==='RECOMMEND_GROUNDED_ITEM');
check('Case B can trigger RECOMMEND_GROUNDED_ITEM on the first recommendation turn',grounded?.necessity==='REQUIRED');
check('Case B exact Required Grounded Act is bound to matched entity evidence',grounded?.grounding?.some(g=>g.key==='K_PRODUCT_A'&&g.status==='SATISFIED'&&g.evidenceRefs.includes('K_PRODUCT_A'))===true,JSON.stringify(grounded));
const caseC=compile(irrelevantSelection);
check('Case C cannot manufacture Grounded obligation from an irrelevant entity pool',!caseC.acts.some(a=>a.type==='RECOMMEND_GROUNDED_ITEM')&&caseC.grounding.length===0);
const planSrc=fs.readFileSync(path.join(root,planRel),'utf8');
check('Grounded admission has no dialogue-turn-count trigger',!/turnCount|currentTurn\s*[>=]|priorAssistantTurns\s*[>=]/i.test(planSrc.slice(planSrc.indexOf('// Axis B1:'),planSrc.indexOf('// Axis B2:'))));
check('Grounding still cannot create recommendation need',/if\s*\(\s*target\.focus\s*===\s*'RECOMMENDATION'\s*&&\s*recommendationKnowledgeEntries\.length(?:\s*&&[\s\S]*?)?\)/m.test(planSrc));
console.log(`\nR2.2 Grounded Deterministic Gate: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
