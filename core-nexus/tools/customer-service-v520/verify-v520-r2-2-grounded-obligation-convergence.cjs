#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
process.env.TS_NODE_TRANSPILE_ONLY='1';
process.env.TS_NODE_PROJECT=path.join(root,'tsconfig.json');
require('ts-node/register/transpile-only');
const obligationRel='src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts';
const deepRel='src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts';
const explicitRel='src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts';
const hveRel='src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts';
const planRel='src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const nlgRel='src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts';
const finalRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const obligationSrc=fs.readFileSync(path.join(root,obligationRel),'utf8');
const deepSrc=fs.readFileSync(path.join(root,deepRel),'utf8');
const explicitSrc=fs.readFileSync(path.join(root,explicitRel),'utf8');
const hve=fs.readFileSync(path.join(root,hveRel),'utf8');
const plan=fs.readFileSync(path.join(root,planRel),'utf8');
const nlg=fs.readFileSync(path.join(root,nlgRel),'utf8');
const {resolveCustomerServiceAnswerObligation}=require(path.join(root,obligationRel));
const {resolveCustomerServiceRequiredTurnGoals}=require(path.join(root,deepRel));
const finalAuthority=fs.readFileSync(path.join(root,finalRel),'utf8');
const prompt=fs.readFileSync(path.join(root,promptRel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function turnGoal(key,message,priority=900,requestedContributionKind='INFORMATION',requestedEvidenceScope='MERCHANT_BUSINESS'){
  return {key,requestedContributionKind,requestedEvidenceScope,priority,confidence:.95,source:'MODEL',evidence:[message],responseRequirement:`完成 ${key}`,deferred:false};
}
function resolveCompound(message,{goalKey='ANSWER_INFORMATION',scope='CURRENT_BUSINESS_FACT',requiredGoalKeys=[goalKey]}={}){
  const dominant=turnGoal(goalKey,message,900,'INFORMATION',scope==='CURRENT_BUSINESS_FACT'?'MERCHANT_BUSINESS':'GENERAL_DOMAIN');
  const requiredTurnGoals=[...new Set(requiredGoalKeys)].map((key,index)=>key===goalKey
    ? dominant
    : turnGoal(key,message,880-index,key==='SUPPORT_PURCHASE_DECISION'?'DECISION_SUPPORT':'INFORMATION',scope==='CURRENT_BUSINESS_FACT'?'MERCHANT_BUSINESS':'GENERAL_DOMAIN'));
  return resolveCustomerServiceAnswerObligation({
    interactionType:'PRODUCT_FACT_QUERY',
    latestCustomerMessage:message,
    conversationHistory:[{role:'ASSISTANT',content:'上一轮已推荐测试款A。'}],
    conversationState:{recentAssistantMoves:[],latestFeedback:null},
    knowledgeEntries:[],
    understanding:{
      factOwnership:{authority:'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',scope,confidence:.99,evidence:['FACT_OWNERSHIP:'+scope],reason:'verifier'},
      primaryScenario:'PRODUCT_CONSULT',
      primaryIntent:'ASK_INFORMATION',
      humanContext:{
        dominantTurnGoal:dominant,
        requiredTurnGoals,
        dialogueObligation:{requestedDeltas:['MORE_SPECIFIC']},
      },
    },
  });
}
const compound=resolveCompound('我胯比较宽，而且不喜欢太贴身，那刚才这条还适合我吗？如果不合适你更建议我选什么？',{
  requiredGoalKeys:['ANSWER_INFORMATION','SUPPORT_PURCHASE_DECISION'],
});
check('compound fact + typed conditional choice preserves recommendation as executable response focus while retaining business-fact Grounding requirement',
  compound.responseTarget.focus==='RECOMMENDATION'
  && compound.responseTarget.knowledgeRequirement==='BUSINESS_FACT_GROUNDING_REQUIRED'
  && compound.responseTarget.evidence.includes('UNDERSTANDING_GOAL:SUPPORT_PURCHASE_DECISION'),
  JSON.stringify(compound.responseTarget));
const paraphraseA=resolveCompound('这条对我合适吗？要是不行，换哪一个更符合我的条件？',{requiredGoalKeys:['ANSWER_INFORMATION','SUPPORT_PURCHASE_DECISION']});
const paraphraseB=resolveCompound('先判断现在这款是否匹配；如果不匹配，请给我一个替代选择。',{requiredGoalKeys:['ANSWER_INFORMATION','SUPPORT_PURCHASE_DECISION']});
check('compound obligation consumption is paraphrase-independent once Deep Recognition supplies the same typed required goals',
  [compound,paraphraseA,paraphraseB].every((item)=>item.responseTarget.focus==='RECOMMENDATION'
    && item.responseTarget.knowledgeRequirement==='BUSINESS_FACT_GROUNDING_REQUIRED'));
const referential=resolveCompound('那你推荐的这款具体是什么面料？');
check('attributive reference to a prior recommendation stays a factual query and does not reopen recommendation',
  referential.responseTarget.focus==='CURRENT_SPECIFIC_QUESTION'
  && !referential.responseTarget.evidence.includes('UNDERSTANDING_GOAL:SUPPORT_PURCHASE_DECISION'),
  JSON.stringify(referential.responseTarget));
const currentSuitability=resolveCompound('这款适合我吗？');
check('current-item suitability without a typed open choice remains a grounded fact question',
  currentSuitability.responseTarget.focus==='CURRENT_SPECIFIC_QUESTION',
  JSON.stringify(currentSuitability.responseTarget));
const modelGoals=[turnGoal('ANSWER_INFORMATION','事实片段',950,'INFORMATION','MERCHANT_BUSINESS'),turnGoal('SUPPORT_PURCHASE_DECISION','选择片段',900,'DECISION_SUPPORT','MERCHANT_BUSINESS')];
const requiredKeys=resolveCustomerServiceRequiredTurnGoals({
  dominantTurnGoal:modelGoals[0],
  rankedTurnGoals:modelGoals,
},modelGoals).map((goal)=>goal.key);
check('Deep Recognition typed ranked goals close over multiple evidence-bound current-turn obligations without lexical reconstruction',
  requiredKeys.includes('ANSWER_INFORMATION') && requiredKeys.includes('SUPPORT_PURCHASE_DECISION'),
  JSON.stringify(requiredKeys));
check('compound obligation authority no longer depends on product-choice keyword/regex helpers downstream of Deep Recognition',
  !obligationSrc.includes('customer-service-explicit-semantics')
  && !obligationSrc.includes('hasExplicitProductChoiceRequest')
  && !obligationSrc.includes('hasSuitabilityChoiceSignal')
  && obligationSrc.includes('structuredRecommendationRequired')
  && obligationSrc.includes('UNDERSTANDING_GOAL:SUPPORT_PURCHASE_DECISION')
  && deepSrc.includes('resolveCustomerServiceRequiredTurnGoals')
  && deepSrc.includes('rawModelTurnGoals')
  && !deepSrc.includes('explicitSemantic?.requiredGoals')
  && !deepSrc.includes('hasExplicitProductChoiceRequest')
  && !explicitSrc.includes('hasExplicitProductChoiceRequest'));
check('Grounded checker protocol/infrastructure failure cannot become business-fact Send authority',
  hve.includes('shouldUseGroundedConformanceFailureDegradation')
  && hve.includes('hasGroundedCustomerVisibleBindings')
  && hve.includes('hasPropositionLevelMerchantEvidenceRequirement')
  && hve.includes("span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'")
  && hve.includes('const checkerSelfFailure')
  && hve.includes("['LOCAL_PROTOCOL_ERROR', 'INVALID_RESPONSE', 'UNAVAILABLE']")
  && hve.includes("trace.decision === 'UNPROVEN_PRESERVED'")
  && hve.includes('buildSemanticConformanceDegradation')
  && hve.includes('planSatisfied: false')
  && hve.includes("finalReplySource: 'FAILURE_NOTICE'")
  && hve.includes('原业务事实正文未发送'));
check('Grounded checker fail-safe keys off actual Grounding, typed Canonical merchant-evidence obligation, or proposition-level evidence requirement; never merely available refs or hard-coded Act names',
  hve.includes('unit.bindings.some((binding) => (binding.groundingRefs || []).length > 0)')
  && hve.includes("knowledgeRequirement\n    === 'BUSINESS_FACT_GROUNDING_REQUIRED'")
  && hve.includes("span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'")
  && !/function hasGroundedCustomerVisibleBindings[\s\S]{0,800}segment\.allowedGroundingRefs/.test(hve)
  && !/function hasGroundedCustomerVisibleBindings[\s\S]{0,800}RECOMMEND_GROUNDED_ITEM.*EXPLAIN_GROUNDED_FACT/.test(hve)
  && !/function hasMerchantEvidenceRequiredTurn[\s\S]{0,500}latestCustomerMessage/.test(hve));
check('ordinary non-Grounded/classified disputes stay non-veto while merchant evidence-required classified failures are fact-safe, with no retry/Judge/free rewrite',
  hve.includes('Genuine non-Grounded replies')
  && hve.includes('Ordinary classified semantic disputes remain non-veto')
  && hve.includes('hasPropositionLevelMerchantEvidenceRequirement')
  && !/(SemanticConformanceRetry|ConformanceJudge|SemanticRepair|\.rewrite\s*\()/i.test(hve));

const ownerStart=plan.indexOf('function addAnswerObligationActs(');
const ownerEnd=plan.indexOf('export function isCustomerServiceRecommendationCapableKnowledgeEntry',ownerStart);
const block=ownerStart>=0&&ownerEnd>ownerStart?plan.slice(ownerStart,ownerEnd):'';
check('Grounded obligation stays inside existing Canonical recommendation owner',
  block.includes("target.focus === 'RECOMMENDATION'")
  && block.includes('recommendationKnowledgeEntries')
  && block.includes('isCustomerServiceRecommendationCapableKnowledgeEntry')
  && !/(GroundingPlanner|GroundingSelector|RecommendationPlanner)/.test(plan));
check('Grounding cannot create recommendation need; it only changes provenance realization of an existing recommendation target',
  block.includes('Grounding still cannot create recommendation behavior')
  && block.includes("target.focus === 'RECOMMENDATION'")
  && block.includes('structured evidence'));
check('matched entity Grounding makes RECOMMEND_GROUNDED_ITEM required for the same recommendation obligation',
  block.includes("type: 'RECOMMEND_GROUNDED_ITEM'")
  && block.includes("necessity: 'REQUIRED'")
  && block.includes("reasonCode: 'ANSWER_OBLIGATION_RECOMMENDATION_GROUNDED_PROVENANCE_REQUIRED'"));
check('matched grounded recommendation is ordered ahead of supporting general guidance for the same recommendation focus',
  block.includes("type: 'PROVIDE_GENERAL_GUIDANCE'")
  && block.includes('priority: 910')
  && block.includes("type: 'RECOMMEND_GROUNDED_ITEM'")
  && block.includes('priority: 930')
  && plan.includes('acts: acts.sort((a, b) => b.priority - a.priority')
  && block.indexOf("type: 'RECOMMEND_GROUNDED_ITEM'") > block.indexOf("type: 'PROVIDE_GENERAL_GUIDANCE'"));
check('grounded requirement is absent when no recommendation-capable Knowledge exists',
  block.includes("target.focus === 'RECOMMENDATION'")
  && block.includes('recommendationKnowledgeEntries.length')
  && block.includes('knowledgeEntries.filter(isCustomerServiceRecommendationCapableKnowledgeEntry)')
  && !/else\s*\{[\s\S]{0,500}?RECOMMEND_GROUNDED_ITEM/m.test(block));
check('grounded decision purpose makes bound concrete candidate/solution realization mandatory without creating a second recommendation layer',
  block.includes('必须实际消费至少一个该 Act 绑定的具体候选/方案事实来完成同一个推荐义务')
  && block.includes('不是只完成泛化类别、材质或方向后停止')
  && block.includes('不要求固定推荐措辞'));
check('Grounding remains provenance/fact-only and cannot manufacture ranking reasons or quota',
  block.includes('Grounding 只证明候选事实并提供 provenance')
  && block.includes('不创建推荐需求、排序理由或候选 quota'));
check('existing R2.2 choice/trade-off purpose remains attached to grounded recommendation',
  block.includes('CHOICE_PRIORITIZATION_DECISION_PURPOSE'));
check('grounded carrier still requires actual grounded Knowledge and falls back only to an already-selected required recommendation guidance Act',
  nlg.includes('const groundedValueAct = groundedKnowledgeAvailable')
  && nlg.includes('const requiredRecommendationGuidanceAct = !groundedValueAct')
  && nlg.includes("plan.answerObligation?.responseTarget.focus === 'RECOMMENDATION'")
  && nlg.includes("item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'")
  && nlg.includes('const valueAct = groundedValueAct || requiredRecommendationGuidanceAct || selectedValueActs[0]')
  && nlg.includes("? 'GROUNDED_FACT'"));
check('FinalHumanTurn remains a lossless consumer of Canonical required/preferred Acts and existing service realization',
  finalAuthority.includes('requiredActs: cloneSemanticActs(frame.acts.required)')
  && finalAuthority.includes('preferredActs: cloneSemanticActs(frame.acts.preferred)')
  && finalAuthority.includes('target: frame.serviceRealization.contribution.target'));
check('Generation treats required Acts as mandatory semantic completion and projects executable primary recommendation order from existing Primary + Required Grounding only',
  prompt.includes('已选中的 Required value Act 必须在本轮真正完成')
  && prompt.includes('canonicalPlan.requiredActs[].parameters.target / decisionPurpose / expectedInformationGain')
  && prompt.includes('HVE_REPLY_V2_PROTOCOL_REQUIREMENTS.primaryTaskSurface')
  && prompt.includes('firstSubstantiveUnitMustBindRequiredAct')
  && prompt.includes("if (realization.primary.contribution !== 'RECOMMEND') return null")
  && prompt.includes("String(act.type) === 'RECOMMEND_GROUNDED_ITEM'")
  && prompt.includes('(act.allowedGroundingRefs || []).length > 0')
  && prompt.includes('不创建新 Act'));
check('R2.2 obligation closure adds no fixed candidate count/rank template or domain/phrase branch',
  !/(fixedGroundedCount|groundedCandidateCount|rankLabelMap|maxRecommendationOptions|groundedKeyword|productKeyword|domainBranch)/i.test(plan+'\n'+prompt));
check('R2.2 obligation closure adds no judge, repair, retry, fallback, second model or post-generation rewrite',
  !/(GroundingJudge|RecommendationJudge|GroundedRepair|GroundedRetry|GroundedFallback|secondModelCall|postGenerationGround|rewriteGrounded)/i.test(plan+'\n'+nlg+'\n'+prompt));
check('modified TypeScript sources remain syntactically valid', [obligationRel,hveRel,planRel,nlgRel,finalRel,promptRel].every(rel=>{
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});
  return !(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error);
}));
check('grounded obligation verifier resolves the current Canonical answer-obligation owner by stable function boundaries, not historical Axis or stage text',
  ownerStart>=0
  && ownerEnd>ownerStart
  && block.includes("target.focus === 'RECOMMENDATION'")
  && block.includes('recommendationKnowledgeEntries')
  && block.includes("type: 'RECOMMEND_GROUNDED_ITEM'"));
console.log(`\nR2.2 Grounded Obligation Convergence: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
