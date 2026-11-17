#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const rel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const src=fs.readFileSync(path.join(root,rel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function loadPrompt(){
  const compiled=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:rel});
  const mod={exports:{}};
  const localRequire=req=>{
    if(req==='@nestjs/common') return {Injectable:()=>t=>t};
    if(req==='./customer-service-nlg-execution-brief') return {compileCustomerServiceNlgSemanticFrameV1:()=>{throw new Error('not used')}};
    if(req==='./customer-service-final-realization-authority') return {compileCustomerServiceFinalModelFacingHumanTurn:(_c,f)=>f.humanTurnRealization};
    throw new Error(`Unexpected verifier dependency: ${req}`);
  };
  Function('exports','module','require',compiled.outputText)(mod.exports,mod,localRequire);
  return mod.exports;
}
const m=loadPrompt();
const project=m.projectCustomerServiceModelFacingGenerationFrame;
const contract={
  generationContext:{conversationHistory:[]},
  groundedContext:{latestCustomerMessage:'x'},
  persona:{resolvedRoleIdentity:null,speakerProjection:null},
  businessContext:{accountProfile:null,languagePolicyConstraints:[]},
  strategyPolicy:{resolved:{tone:{}}},
  orchestrationPlan:{serviceCapabilities:null},
  provenance:{configurationHash:'h'},
};
const baseHuman={
  surface:{generationGuidance:{rolePrompt:null,identityPrompt:null,personaSurfaceProfile:null}},
  realization:{canonicalPlan:{requiredActs:[],preferredActs:[],optionalActs:[],forbiddenActs:[],completion:'STOP_AFTER_REQUIRED',semanticPermit:{}},selectedComponents:{identity:{selected:false},customerInput:{selected:false}},continuity:{currentFeedback:{requestedDeltas:[]}}},
};
const frame={
  identity:{aiIdentity:null,businessLabel:null,relationLabel:null,publicName:null,surfaceLabel:null,allowedSurfaceLabels:[],serviceScope:null},
  serviceRealization:{identity:{mode:'NONE'}},
  grounding:{facts:[],knowledge:[],prohibitedUnknownFacts:[]},
  context:{activeTask:null},
  responseAssets:[],
  hardBoundaries:{forbiddenAssumptions:[],identityForbiddenDrift:[],capabilityLimits:null,roleBoundary:null},
  humanTurnRealization:{
    ...baseHuman,
    conversationReality:{authority:'REALIZATION_CONTEXT_ONLY',currentTurn:1,priorConversationMessages:0,exchange:{state:'FRESH',priorAssistantTurns:0},continuity:{},currentFeedback:{},activeTask:null,relevantMemories:[],recentAssistantMoves:[]},
  },
};
const legacy=project(contract,frame);
check('legacy/synthetic frame without answerAuthority no longer throws',Boolean(legacy));
check('missing answerAuthority projects inert least-privilege business authority',legacy.answerAuthority?.mode==='NO_BUSINESS_GROUNDING_REQUIRED'&&legacy.answerAuthority?.currentScopeBusinessFactAllowed===false);
check('missing answerAuthority cannot fabricate Grounding refs',Array.isArray(legacy.answerAuthority?.allowedGroundingRefs)&&legacy.answerAuthority.allowedGroundingRefs.length===0);
const grounded={schemaVersion:2,authority:'PROJECTION_ONLY',mode:'CURRENT_SCOPE_GROUNDED_BUSINESS',evidenceState:'GROUNDED_KNOWLEDGE',unknownStrategy:'NOT_APPLICABLE',knowledgeRequirement:'BUSINESS_FACT_GROUNDING_REQUIRED',customerContextAllowed:true,generalGuidanceAllowed:true,currentScopeBusinessFactAllowed:true,allowedGroundingRefs:['K1'],evidenceBoundaryRequired:false,rewritePreservation:'AUTHORIZED_CONTENT_ONLY'};
const current=project(contract,{...frame,answerAuthority:grounded});
check('current production answerAuthority is preserved',current.answerAuthority.mode==='CURRENT_SCOPE_GROUNDED_BUSINESS'&&current.answerAuthority.currentScopeBusinessFactAllowed===true);
check('current Grounding refs are cloned losslessly',JSON.stringify(current.answerAuthority.allowedGroundingRefs)===JSON.stringify(['K1'])&&current.answerAuthority.allowedGroundingRefs!==grounded.allowedGroundingRefs);
check('Generation keeps specific business facts closed-world while preserving natural grounded judgment',src.includes('【Business Fact Closed World】')&&src.includes('不得把一般常识、经验、相邻属性或模型推测补成该业务对象未配置的新属性')&&src.includes('基于已支持的业务事实与客户条件做自然的推荐、比较和选择判断'));
check('customer requirements are constraints rather than merchant fact evidence, and scenario suitability cannot imply every desired outcome',src.includes('客户本轮提出的需求、偏好、担忧、目标属性和期望结果只是选择条件，不是该业务对象事实的证据')&&src.includes('适合某场景')&&src.includes('不自动蕴含该场景下客户期望的每个性能、体感、结果或保证'));
check('missing business facts stay uncertain without collapsing general-domain help into mechanical lookup failure',src.includes('一般知识和普通话题默认可以正常回答')&&src.includes('不依赖未知业务事实的一般领域建议')&&src.includes('不要机械输出检索失败话术'));
check('compatibility fallback is absence-only and does not replace current authority',src.includes('if (!frame.answerAuthority)')&&src.includes('...frame.answerAuthority'));
check('compatibility correction adds no selector/judge/repair/retry/fallback authority',!/(GroundingSelector|RecommendationSelector|GroundingJudge|GroundedRepair|GroundedRetry|secondModelCall)/i.test(src));
console.log(`\nR2.2 Answer Authority Compatibility: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
