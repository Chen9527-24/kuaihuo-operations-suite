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
function loadTs(rel,deps={}){const src=read(rel);const compiled=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:rel});const loaded={exports:{}};const localRequire=req=>{if(req==='@nestjs/common')return{Injectable:()=>t=>t,Logger:class{warn(){}}};if(Object.prototype.hasOwnProperty.call(deps,req))return deps[req];throw new Error(`Unexpected verifier dependency: ${req}`)};Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);return loaded.exports}
const planRel='src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const nlgRel='src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts';
const finalRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const hve3Rel='src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts';
const planSrc=read(planRel),nlgSrc=read(nlgRel),finalSrc=read(finalRel),promptSrc=read(promptRel),hve3Src=read(hve3Rel);

const planModule=loadTs(planRel,{
  './customer-service-legacy-act-adapter':{mapCustomerServiceLegacyActs:()=>[]},
  './customer-service-interaction-type.resolver':{CustomerServiceInteractionTypeResolver:class{}},
  './customer-service-answer-obligation':{resolveCustomerServiceAnswerObligation:()=>null},
  './customer-service-critical-intent.util':{resolveCustomerServiceCriticalIntent:()=>({intent:'NONE'})},
  '../../shared/context/customer-service-knowledge.util':{selectCustomerServiceBusinessFactGroundingEntries:()=>[]},
});
const isCandidate=planModule.isCustomerServiceRecommendationCapableKnowledgeEntry;
check('recommendation admission accepts structured PRODUCT identity',isCandidate({entityType:'PRODUCT',entityKey:'sku-1',category:'PRODUCT'})===true);
check('recommendation admission accepts structured SERVICE identity',isCandidate({entityType:'MODULE',entityKey:'module-1',category:'SERVICE'})===true);
check('STORE applicability cannot manufacture a recommendation candidate',isCandidate({entityType:'GUIDE',entityKey:'guide-1',category:'REFERENCE',bindingTargetType:'STORE',bindingTargetKey:'store-1'})===false);
check('ROLE applicability cannot promote policy Knowledge into a recommendation candidate',isCandidate({entityType:'POLICY',entityKey:'policy-1',category:'SERVICE_POLICY',bindingTargetType:'ROLE',bindingTargetKey:'role-1'})===false);
check('ACCOUNT applicability cannot promote generic Knowledge into a recommendation candidate',isCandidate({entityType:'GENERIC',entityKey:null,category:'OTHER',bindingTargetType:'ACCOUNT',bindingTargetKey:'account-1'})===false);
check('generic content-only Knowledge cannot manufacture a grounded recommendation candidate',isCandidate({entityType:'GENERIC',entityKey:null,category:'OTHER',title:'具体推荐商品A',content:'强烈推荐这款商品',tags:['推荐']})===false);
check('non-generic entity type without entity key is insufficient',isCandidate({entityType:'PRODUCT',entityKey:null,category:'PRODUCT'})===false);
check('non-offering entity category cannot gain recommendation authority from entity metadata alone',isCandidate({entityType:'GUIDE',entityKey:'guide-1',category:'REFERENCE'})===false);
const predicateBlock=planSrc.slice(planSrc.indexOf('export function isCustomerServiceRecommendationCapableKnowledgeEntry'),planSrc.indexOf('function ensureKnowledgeGrounding'));
check('recommendation-capability predicate uses structured identity plus canonical offering category and ignores applicability binding as candidate identity',predicateBlock.includes('entityType')&&predicateBlock.includes('entityKey')&&predicateBlock.includes('category')&&predicateBlock.includes("category === 'PRODUCT'")&&predicateBlock.includes("category === 'SERVICE'")&&!/const bindingTarget(Type|Key)/.test(predicateBlock)&&!/(entry\.title|entry\.content|entry\.tags|latestCustomerMessage|industryCode|roleCode)/.test(predicateBlock));
check('Grounding cannot create recommendation need',/if\s*\(\s*target\.focus\s*===\s*'RECOMMENDATION'\s*&&\s*recommendationKnowledgeEntries\.length(?:\s*&&[\s\S]*?)?\)/m.test(planSrc)&&planSrc.includes('Grounding still cannot create recommendation behavior'));

const descriptorStub={getCustomerServiceActDescriptor:(type)=>({semanticDefinition:`semantic:${type}`,authorityScope:type==='RECOMMEND_GROUNDED_ITEM'?'GROUNDED_BUSINESS':'PLAN_ONLY'})};
const nlgModule=loadTs(nlgRel,{
  '../compliance/customer-service-act-descriptor.registry':descriptorStub,
  './customer-service-prompt-kernel.registry':{getCustomerServicePromptKernel:()=>({id:'k',version:'hve-3-v1.99',contentHash:'h'})},
  '../../shared/context/customer-service-opening-reception.util':{resolveCustomerServiceOpeningReception:()=>null},
  '../identity/customer-service-public-identity-projection':{resolveCustomerServicePublicIdentityProjection:()=>({})},
  './customer-service-hve-family-realization':{resolveCustomerServiceHveFamilyRealization:()=>({})},
  './customer-service-human-turn-realization':{resolveCustomerServiceHumanTurnRealization:()=>({})},
  '../role/customer-service-role-capability-context-projection':{resolveCustomerServiceRoleCapabilityContextProjection:()=>({})},
  '../role/customer-service-resolved-role-identity-context':{resolveCustomerServiceResolvedRoleIdentityContext:()=>({})},
  '../interaction/customer-service-summary-source.contract':{resolveCustomerServiceConversationSummarySource:()=>({})},
});
const projectActs=nlgModule.projectCustomerServiceCanonicalActsForSemanticFrame;
const projected=projectActs([
  {id:'ACT_G',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{source:'KNOWLEDGE',key:'k1',requirement:'REQUIRED',status:'SATISFIED',evidenceRefs:['K1','K1']},{source:'KNOWLEDGE',key:'k2',requirement:'REQUIRED',status:'UNSATISFIED',evidenceRefs:['K2']}],parameters:{target:'candidate'}},
  {id:'ACT_D',type:'DIRECT_ANSWER',necessity:'REQUIRED',grounding:[]},
]);
check('Semantic Frame preserves exact Canonical grounded Act identity',projected[0].id==='ACT_G'&&projected[0].type==='RECOMMEND_GROUNDED_ITEM'&&projected[0].necessity==='REQUIRED');
check('Semantic Frame preserves only satisfied Act-bound Knowledge refs',JSON.stringify(projected[0].allowedGroundingRefs)===JSON.stringify(['K1']));
check('non-grounded Act receives no fabricated Grounding refs',Array.isArray(projected[1].allowedGroundingRefs)&&projected[1].allowedGroundingRefs.length===0);

const {compile}=loadFinalHumanTurnCompiler(root);
const compiled=compile({persona:{resolvedRoleIdentity:{generationPrompt:{role:null,identity:null}}}},normalizeFrame({acts:{required:projected,preferred:[],optional:[],forbidden:[]}}));
const finalGrounded=compiled.realization.canonicalPlan.requiredActs.find(a=>a.id==='ACT_G');
check('FinalHumanTurn losslessly preserves Act-bound Grounding refs',finalGrounded?.necessity==='REQUIRED'&&JSON.stringify(finalGrounded.allowedGroundingRefs)===JSON.stringify(['K1']));
check('ordinary model-facing frame now carries existing answerAuthority including allowedGroundingRefs',promptSrc.includes('answerAuthority: projectModelFacingAnswerAuthority(frame)')&&promptSrc.includes('...frame.answerAuthority')&&promptSrc.includes('allowedGroundingRefs: Array.isArray(frame.answerAuthority.allowedGroundingRefs)'));
check('Required Grounded completion is defined as consuming an Act-bound Knowledge entry',promptSrc.includes('Required Grounded Act 只有在客户可见贡献实际消费至少一个自身绑定且当前允许公开的 Grounding entry 时才完成'));
check('generic category/material guidance cannot substitute for a Required Grounded Act',promptSrc.includes('泛化类别/材质/方向可以完成一般 guidance，但不能替代一个仍未兑现的 Required Grounded Act'));
check('completion binding points to selectedEntries by existing evidence ref rather than a new selector',promptSrc.includes('allowedGroundingRefs` 指向 Current Conversation Context.knowledge.selectedEntries')&&!/(GroundingSelector|RecommendationSelector|candidateSelector)/i.test(promptSrc+'\n'+nlgSrc+'\n'+planSrc));
check('post-generation provenance binding remains observation-only and does not become completion enforcement',hve3Src.includes('bindCanonicalSegmentGroundingProvenance')&&!/(if\s*\([^\n]*bindCanonicalSegmentGroundingProvenance[^\n]*\)\s*(?:throw|return|null)|selectionEligible\s*=.*Grounding)/i.test(hve3Src));
check('no fixed candidate count, fixed wording, domain branch, judge, repair, retry, fallback or second model call was introduced',!/(fixedGroundedCount|maxRecommendationOptions|rankLabelMap|groundedKeyword|productKeyword|industryCode\s*===|roleCode\s*===|GroundingJudge|GroundedRepair|GroundedRetry|GroundedFallback|secondModelCall)/i.test(planSrc+'\n'+nlgSrc+'\n'+promptSrc));
check('R2.1 owner code is not imported into this structural completion path',!/(scoped-key-normalization|normalize.*ConstraintScope|constraint\.taskId)/i.test(planSrc+'\n'+nlgSrc+'\n'+promptSrc));
check('grounded completion binding remains owned by Runtime semantic contracts rather than kernel version or stage prose',planSrc.includes("type: 'RECOMMEND_GROUNDED_ITEM'")&&planSrc.includes("reasonCode: 'ANSWER_OBLIGATION_RECOMMENDATION_GROUNDED_PROVENANCE_REQUIRED'")&&nlgSrc.includes('allowedGroundingRefs')&&promptSrc.includes('Required Grounded Act')&&!/(STAGE_PROGRESS|R2\.3-R2\.5 remain NOT STARTED)/.test(planSrc+'\n'+nlgSrc+'\n'+promptSrc+'\n'+hve3Src));
console.log(`\nR2.2 Grounded Completion Binding: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
