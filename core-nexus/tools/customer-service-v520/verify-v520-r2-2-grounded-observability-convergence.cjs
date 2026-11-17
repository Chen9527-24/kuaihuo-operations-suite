#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const recRel='src/modules/customer-service-agent/runtime/compliance/customer-service-output-act-recognizer.ts';
const descRel='src/modules/customer-service-agent/runtime/compliance/customer-service-act-descriptor.registry.ts';
const evalRel='src/modules/customer-service-agent/runtime/compliance/customer-service-humanity-preference-evaluator.ts';
const planRel='src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const nlgRel='src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const recSrc=fs.readFileSync(path.join(root,recRel),'utf8');
const descSrc=fs.readFileSync(path.join(root,descRel),'utf8');
const evalSrc=fs.readFileSync(path.join(root,evalRel),'utf8');
const planSrc=fs.readFileSync(path.join(root,planRel),'utf8');
const nlgSrc=fs.readFileSync(path.join(root,nlgRel),'utf8');
const kernel=fs.readFileSync(path.join(root,kernelRel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function compile(source,fileName,localRequire){
  const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName});
  const loaded={exports:{}};
  Function('exports','module','require',out.outputText)(loaded.exports,loaded,localRequire);
  return loaded.exports;
}
const desc=compile(descSrc,descRel,req=>{throw new Error(`Unexpected descriptor dependency: ${req}`)});
const rec=compile(recSrc,recRel,req=>{
  if(req==='@nestjs/common') return {Injectable:()=>t=>t};
  if(req==='./customer-service-act-descriptor.registry') return desc;
  throw new Error(`Unexpected recognizer dependency: ${req}`);
});
const recognizer=new rec.CustomerServiceOutputActRecognizer();
const knowledge=[{
  id:'knowledge-alpha',scopeType:'STORE',scopeKey:'store',entityType:'OFFER',entityKey:'方案Alpha',aliases:['Alpha方案'],
  category:'OFFER',title:'方案Alpha',question:null,content:'方案Alpha包含标准支持项。',tags:[],sourceType:'MANUAL',sourceReference:null,revision:1,selectionReason:'CURRENT_MESSAGE',estimatedTokens:20,
}];
function input(content,actualRefs=['knowledge-alpha']){
  return {
    text:content,
    latestCustomerMessage:'请给我一个具体方向',
    knowledgeEntries:knowledge,
    plan:{
      acts:[{id:'grounded',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',reason:'CANONICAL',parameters:{expectedInformationGain:'ADD_GROUNDED_INFORMATION'}}],
      suppressedActs:[],
    },
    humanTurnRealization:{turnComposition:{segmentPlan:[{index:0,purposes:['VALUE'],plannedActTypes:['RECOMMEND_GROUNDED_ITEM'],allowedGroundingRefs:['knowledge-alpha']}] }},
    generatedSegments:[{index:0,content,plannedActTypes:['RECOMMEND_GROUNDED_ITEM'],allowedGroundingRefs:actualRefs,provenanceAuthority:'CANONICAL_SEGMENT_PLAN'}],
  };
}
const implicitCandidate=recognizer.observe('RECOMMEND_GROUNDED_ITEM',input('我们这边有款方案Alpha，包含标准支持项。'),'我们这边有款方案Alpha，包含标准支持项。');
const noGrounding=recognizer.observe('RECOMMEND_GROUNDED_ITEM',input('我们这边有款方案Alpha，包含标准支持项。',[]),'我们这边有款方案Alpha，包含标准支持项。');
const boundaryOnly=recognizer.observe('RECOMMEND_GROUNDED_ITEM',input('方案Alpha目前还需要确认具体信息。'),'方案Alpha目前还需要确认具体信息。');
const explicitRecommendation=recognizer.observe('RECOMMEND_GROUNDED_ITEM',input('可以优先看看方案Alpha，它包含标准支持项。'),'可以优先看看方案Alpha，它包含标准支持项。');
check('canonical-bound grounded candidate is observed without requiring a lexical recommendation verb',
  implicitCandidate.observation==='OBSERVED'
  && implicitCandidate.groundingRefs.includes('knowledge-alpha')
  && implicitCandidate.provenance==='BUSINESS_GROUNDING');
check('implicit grounded candidate records diagnostics-only provenance evidence',
  implicitCandidate.evidence.includes('CANONICAL_SEGMENT_GROUNDING_PROVENANCE')
  && implicitCandidate.evidence.includes('CANONICAL_GROUNDED_CANDIDATE_REALIZED_WITHOUT_LEXICAL_RECOMMENDATION_SIGNAL'));
check('missing actual grounding refs cannot be upgraded by merchant/entity wording alone',
  noGrounding.observation==='NOT_OBSERVED'
  && noGrounding.groundingRefs.length===0);
check('boundary/uncertain entity mention cannot manufacture grounded recommendation realization',
  boundaryOnly.observation==='NOT_OBSERVED'
  && boundaryOnly.groundingRefs.length===0);
check('existing explicit recommendation observation remains valid',
  explicitRecommendation.observation==='OBSERVED'
  && explicitRecommendation.groundingRefs.includes('knowledge-alpha'));
check('grounded recommendation observation remains bound to exact canonical segment provenance and allowed refs',
  recSrc.includes("actual.provenanceAuthority !== 'CANONICAL_SEGMENT_PLAN'")
  && recSrc.includes('actual.allowedGroundingRefs.filter((ref) => expectedRefs.has(ref))'));
check('observability fallback reuses existing grounded entity assertion rather than adding product/domain vocabulary',
  recSrc.includes('findGroundedFactAssertionSpan(actual.content, input.knowledgeEntries, groundingRefs)')
  && !/(测试款A|裙|裤|宠物|服饰|广州|胯宽)/u.test(recSrc));
check('Humanity knowledge utilization derives only from exact Required Act-bound observed groundingRefs and remains diagnostic-only',
  evalSrc.includes("item.necessity === 'REQUIRED'")
  && evalSrc.includes("requirement.source === 'KNOWLEDGE'")
  && evalSrc.includes("requirement.status === 'SATISFIED'")
  && evalSrc.includes("item.observation === 'OBSERVED' && expectedGroundedActTypes.has(item.type)")
  && evalSrc.includes('.flatMap((item) => item.groundingRefs || [])')
  && evalSrc.includes("? 'OBSERVED_WITH_GROUNDING'")
  && evalSrc.includes("['CURRENT_TURN_GROUNDED_VALUE_MISSED']"));
check('R2.2 Generation owners are not modified into diagnostics-driven wording control',
  !/(CURRENT_TURN_GROUNDED_VALUE_MISSED|OBSERVED_WITH_GROUNDING|CANONICAL_GROUNDED_CANDIDATE_REALIZED_WITHOUT_LEXICAL_RECOMMENDATION_SIGNAL)/.test(planSrc+'\n'+nlgSrc));
check('observability closure adds no judge, retry, rewrite, grounding selector or fixed recommendation phrase requirement',
  !/(GroundedObservationJudge|GroundedRetry|rewriteGrounded|GroundingSelector|mustSayRecommend|recommendationKeywordRequired)/i.test(recSrc));
check('kernel advances to v1.97 and records R2.2 generation frozen while diagnostics observability converges',
  kernel.includes("version: 'hve-3-v1.99'")
  && kernel.includes('Grounded Observability Convergence')
  && kernel.includes('R2.2 Generation remains unchanged'));
console.log(`\nR2.2 Grounded Observability Convergence: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
