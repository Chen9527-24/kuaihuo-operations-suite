#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(__dirname,'../..');let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function transpile(rel){const src=fs.readFileSync(path.join(root,rel),'utf8');const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});check(`${path.basename(rel)} TypeScript syntax`,!(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));return{src,out};}
const descriptor=type=>({semanticDefinition:`semantic:${type}`,authorityScope:['RECOMMEND_GROUNDED_ITEM','EXPLAIN_GROUNDED_FACT'].includes(type)?'GROUNDED_BUSINESS':type==='PROVIDE_GENERAL_GUIDANCE'?'GENERAL_GUIDANCE':'PLAN_ONLY',allowedWhenActs:[]});
const projectActs=acts=>acts.map((act,index)=>({id:act.id||`ACT_${index}`,type:act.type,necessity:act.necessity||'REQUIRED',semantic:`semantic:${act.type}`,authorityScope:descriptor(act.type).authorityScope,allowedGroundingRefs:[...new Set((act.grounding||[]).filter(g=>g.status==='SATISFIED').flatMap(g=>g.evidenceRefs||[]))],parameters:act.parameters||{}}));
const generatorRel='src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts';
const gen=transpile(generatorRel);
const genBox={exports:{},module:{exports:{}},require:id=>{if(id==='@nestjs/common')return{Injectable:()=>t=>t};if(id.includes('customer-service-act-descriptor.registry'))return{getCustomerServiceActDescriptor:descriptor};if(id.includes('customer-service-nlg-execution-brief'))return{projectCustomerServiceCanonicalActsForSemanticFrame:projectActs};if(id.includes('customer-service-source-bound-summary-protocol'))return{parseCustomerServiceTypedSourceBoundSummary:v=>({protocolValid:false,visibleText:'',raw:v})};if(id.includes('customer-service-generation-prompt.builder'))return{CustomerServiceGenerationPromptBuilder:class{}};if(id.includes('customer-service-model-gateway.service'))return{CustomerServiceModelGateway:class{}};return{};},console,process};genBox.module.exports=genBox.exports;vm.runInNewContext(gen.out.outputText,genBox,{filename:generatorRel});
const generatorExports=genBox.exports;
const conformanceRel='src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts';
const conf=transpile(conformanceRel);
function finalProjection(contract){const all=projectActs(contract.orchestrationPlan.interactionPlanV2.acts);return{realization:{canonicalPlan:{requiredActs:all.filter(a=>a.necessity==='REQUIRED'),preferredActs:all.filter(a=>a.necessity==='PREFERRED'),optionalActs:all.filter(a=>a.necessity==='OPTIONAL'),completion:'ALLOW_CONTINUATION'}}};}
const confBox={exports:{},module:{exports:{}},require:id=>{if(id==='@nestjs/common')return{Injectable:()=>t=>t};if(id.includes('customer-service-model-gateway.service'))return{CustomerServiceModelGateway:class{}};if(id.includes('customer-service-final-realization-authority'))return{compileCustomerServiceFinalModelFacingHumanTurn:(contract)=>finalProjection(contract)};if(id.includes('customer-service-nlg-execution-brief'))return{projectCustomerServiceCanonicalActsForSemanticFrame:projectActs};if(id.includes('customer-service-reply-generator.service'))return generatorExports;return{};},console,process};confBox.module.exports=confBox.exports;vm.runInNewContext(conf.out.outputText,confBox,{filename:conformanceRel});
const Service=confBox.exports.CustomerServiceSemanticConformanceService;
const baseResult={ok:true,status:'SUCCESS',content:'',requestedModel:'deepseek-chat',actualModel:'deepseek-chat',model:'deepseek-chat',elapsedMs:5,requestId:'req-1',usage:{},errorMessage:null,finishReason:'stop',thinkingMode:'DISABLED',requestedMaxTokens:700,effectiveMaxTokens:700,timeoutMs:8000,reasoningContentLength:0,visibleContentLength:20,emptyContentReason:null,truncated:false,timedOut:false};
const contractFor=acts=>({orchestrationPlan:{interactionExecution:{lane:'HVE_ACTIVE'},interactionPlanV2:{acts}},groundedContext:{latestCustomerMessage:'我这个情况应该怎么选？'},businessContext:{knowledgeEntries:[]},persona:{},generationContext:{}});
const semanticFrameFor=knowledge=>({grounding:{knowledge},context:{},serviceRealization:{},humanTurnRealization:{}});
function generationFor(text,bindings){return{draft:text,structuredSegments:[{index:0,purposes:['VALUE'],content:text,source:'STRUCTURED_PROTOCOL',semanticUnits:[{index:0,content:text,bindings,source:'HVE_REPLY_V2'}]}],presentationIntent:{schemaVersion:1,authority:'GENERATION_PRESENTATION_ONLY',segments:[{index:0,content:text,source:'STRUCTURED_CHAT_PRESENTATION'}]},totalModelElapsedMs:10,modelCallCount:1,visibleContentLength:text.length,source:'MODEL',status:'GENERATED'};}
function protocolRecoveryGenerationFor(text,bindings){const generation=generationFor(text,bindings);generation.structuredSegments[0].source='SINGLE_FALLBACK';generation.structuredSegments[0].semanticUnits[0].source='CANONICAL_PROTOCOL_RECOVERY_CANDIDATE';return generation;}
function twoUnitGeneration(text,left,right,leftBindings,rightBindings){return{...generationFor(text,leftBindings),structuredSegments:[{index:0,purposes:['VALUE'],content:text,source:'STRUCTURED_PROTOCOL',semanticUnits:[{index:0,content:left,bindings:leftBindings,source:'HVE_REPLY_V2'},{index:1,content:right,bindings:rightBindings,source:'HVE_REPLY_V2'}]}],presentationIntent:{schemaVersion:1,authority:'GENERATION_PRESENTATION_ONLY',segments:[{index:0,content:text,source:'STRUCTURED_CHAT_PRESENTATION'}]}};}
function twoSegmentGeneration(left,right,leftBindings,rightBindings){const draft=`${left}\n\n${right}`;return{...generationFor(left,leftBindings),draft,visibleContentLength:draft.length,structuredSegments:[{index:0,purposes:['VALUE'],content:left,source:'STRUCTURED_PROTOCOL',semanticUnits:[{index:0,content:left,bindings:leftBindings,source:'HVE_REPLY_V2'}]},{index:1,purposes:['VALUE'],content:right,source:'STRUCTURED_PROTOCOL',semanticUnits:[{index:0,content:right,bindings:rightBindings,source:'HVE_REPLY_V2'}]}],presentationIntent:{schemaVersion:1,authority:'GENERATION_PRESENTATION_ONLY',segments:[{index:0,content:left,source:'STRUCTURED_CHAT_PRESENTATION'},{index:1,content:right,source:'STRUCTURED_CHAT_PRESENTATION'}]}};}
function threeSegmentGeneration(parts,bindingsBySegment){const draft=parts.join('\n\n');return{...generationFor(parts[0],bindingsBySegment[0]),draft,visibleContentLength:draft.length,structuredSegments:parts.map((content,index)=>({index,purposes:['VALUE'],content,source:'STRUCTURED_PROTOCOL',semanticUnits:[{index:0,content,bindings:bindingsBySegment[index],source:'HVE_REPLY_V2'}]})),presentationIntent:{schemaVersion:1,authority:'GENERATION_PRESENTATION_ONLY',segments:parts.map((content,index)=>({index,content,source:'STRUCTURED_CHAT_PRESENTATION'}))}};}
function completeFixtureSupport(span){
 const groundingSupport=Array.isArray(span.groundingSupport)?span.groundingSupport.map(support=>({
   ...support,
   sourceSemanticTarget:support.sourceSemanticTarget||span.semanticTarget,
   sourceGroundedActionRole:support.sourceGroundedActionRole||(span.semanticTarget==='ACTION_OPTION_RISK_OR_OUTCOME'?span.groundedActionRole:'NOT_APPLICABLE'),
 })):span.groundingSupport;
 return{...span,groundingSupport};
}
function spanEnvelope(spans,unitGroundedActions=[]){return JSON.stringify({version:'HVE_SEMANTIC_SPANS_V4',spans:spans.map(completeFixtureSupport),unitGroundedActions});}
function classify(atomId,contributionKind='ANSWER_CONTENT',semanticTarget='TASK_OR_DOMAIN_FACT',taskDependency='MATERIAL_TO_CUSTOMER_TASK',realizedGroundingRefs=[],groundingEntailment=realizedGroundingRefs.length?'FULLY_SUPPORTED':'NOT_APPLICABLE',options={}){
 const evidenceRequirement=options.evidenceRequirement||((realizedGroundingRefs.length||contributionKind==='GROUNDED_CONTENT'||groundingEntailment!=='NOT_APPLICABLE')?'MERCHANT_ENTITY_EVIDENCE_REQUIRED':'NOT_REQUIRED');
 const groundedActionRole=options.groundedActionRole||(evidenceRequirement==='MERCHANT_ENTITY_EVIDENCE_BOUNDARY'?'NOT_APPLICABLE':semanticTarget==='ACTION_OPTION_RISK_OR_OUTCOME'?(evidenceRequirement==='MERCHANT_ENTITY_EVIDENCE_REQUIRED'?'CHOICE_OR_RECOMMENDATION':'SUITABILITY_OR_DECISION_SUPPORT'):'NOT_APPLICABLE');
 const groundingBasis=options.groundingBasis||(groundingEntailment==='FULLY_SUPPORTED'?((groundedActionRole==='CHOICE_OR_RECOMMENDATION'||groundedActionRole==='SUITABILITY_OR_DECISION_SUPPORT')?'SUPPORTED_CHOICE_SYNTHESIS':'DIRECT_SOURCE'):groundingEntailment==='PARTIALLY_SUPPORTED'?'PARTIAL_SOURCE_PLUS_INFERENCE':groundingEntailment==='UNSUPPORTED'?'INFERRED_OR_UNSUPPORTED':'NOT_APPLICABLE');
 const merchantReferentRefs=Array.isArray(options.merchantReferentRefs)?[...new Set(options.merchantReferentRefs)]:[];
 const rawGroundingSupport=Array.isArray(options.groundingSupport)?options.groundingSupport:options.groundingSupport;
 const groundingSupport=Array.isArray(rawGroundingSupport)?rawGroundingSupport.map(support=>({
   ...support,
   sourceSemanticTarget:support.sourceSemanticTarget||semanticTarget,
   sourceGroundedActionRole:support.sourceGroundedActionRole||(semanticTarget==='ACTION_OPTION_RISK_OR_OUTCOME'?groundedActionRole:'NOT_APPLICABLE'),
 })):rawGroundingSupport;
 return{atomId,contributionKind,semanticTarget,taskDependency,evidenceRequirement,merchantReferentRefs,groundingEntailment,groundedActionRole,groundingBasis,groundingSupport,realizedGroundingRefs};
}
function completeClassification(item,payload){
 const needsSupport=item.groundingEntailment==='FULLY_SUPPORTED'||item.groundingEntailment==='PARTIALLY_SUPPORTED';
 if(Array.isArray(item.groundingSupport))return item;
 const groundingSupport=needsSupport?(item.realizedGroundingRefs||[]).map(ref=>{const evidence=(payload.availableGroundingEvidence||[]).find(entry=>entry.id===ref);const excerpt=String(evidence?.content||evidence?.title||JSON.stringify(evidence?.structuredData||{}));return{ref,excerpts:[excerpt],sourceSemanticTarget:item.semanticTarget,sourceGroundedActionRole:item.semanticTarget==='ACTION_OPTION_RISK_OR_OUTCOME'?item.groundedActionRole:'NOT_APPLICABLE'};}):[];
 return{...item,groundingSupport};
}
function gatewayFrom(fn,override={}){const calls=[];return{calls,generate:async input=>{calls.push(input);const payload=JSON.parse(String(input.messages[1].content));const content=typeof fn==='function'?fn(payload,input):fn;const requestedMaxTokens=Number(input.maxTokens||baseResult.requestedMaxTokens||700);const effectiveMaxTokens=Math.max(1,Math.min(4000,Math.trunc(requestedMaxTokens)));return{...baseResult,content,requestedMaxTokens,effectiveMaxTokens,...override};}};}
// TEST FIXTURE ONLY: exact semantic partitions declared by each fixed regression sentence.
// This is intentionally not a punctuation/keyword parser and has no Runtime authority.
const TEST_EXACT_SPAN_PARTITIONS=new Map([
 ['测试款A为高腰A字版型。如果腰头在坐下时仍留有活动余量，通常更不容易顶腰。',['测试款A为高腰A字版型。','如果腰头在坐下时仍留有活动余量，通常更不容易顶腰。']],
 ['测试款A为高腰A字版型。如果腰头在坐下时仍留有活动余量，通常更不容易顶腰。这款大概坐多久都不会勒。',['测试款A为高腰A字版型。','如果腰头在坐下时仍留有活动余量，通常更不容易顶腰。','这款大概坐多久都不会勒。']],
 ['测试款A为高腰A字版型，顺带说明一下。判断活动体验要看实际动作。',['测试款A为高腰A字版型','，顺带说明一下。','判断活动体验要看实际动作。']],
 ['测试款A为高腰A字版型，判断活动体验要看实际动作。',['测试款A为高腰A字版型','，判断活动体验要看实际动作。']],
 ['测试款A为高腰A字版型，顺带说明一下。',['测试款A为高腰A字版型','，顺带说明一下。']],
 ['，顺带说明一下。判断活动体验要看实际动作。',['，顺带说明一下。','判断活动体验要看实际动作。']],
 ['测试款A为高腰A字版型，顺带说明一下。，顺带说明一下。',['测试款A为高腰A字版型','，顺带说明一下。','，顺带说明一下。']],
 ['测试款A是微宽松版型。只是比棉麻好打理很多。一般判断抗皱还要看纤维比例和后整理。',['测试款A是微宽松版型。','只是比棉麻好打理很多。','一般判断抗皱还要看纤维比例和后整理。']],
 ['测试款A是微宽松版型，顺带说明一下，判断活动体验要看实际动作。',['测试款A是微宽松版型','，顺带说明一下','，判断活动体验要看实际动作。']],
 ['测试款A是微宽松版型，判断活动体验要看实际动作，这些属于体感。',['测试款A是微宽松版型','，判断活动体验要看实际动作','，这些属于体感。']],
 ['测试款A是微宽松版型，面料轻薄透气。但某种活动体验能否保证，这个现有信息推不出来，相关尺寸数据目前没有来源。能确认的是测试款A微宽松、轻薄透气。判断这类体验，要看实际活动幅度和环境条件，这些属于体感，不是现有面料参数能直接推出来的。',['测试款A是微宽松版型，面料轻薄透气。','但某种活动体验能否保证','，这个现有信息推不出来','，相关尺寸数据目前没有来源。','能确认的是测试款A微宽松、轻薄透气。','判断这类体验','，要看实际活动幅度和环境条件','，这些属于体感','，不是现有面料参数能直接推出来的。']],
 ['测试款A是高腰微阔腿天丝混纺。它的微阔腿版型透气不闷，坐一天也不会黏腿。',['测试款A是高腰微阔腿天丝混纺。','它的微阔腿版型透气不闷','，坐一天也不会黏腿。']],
 ['可以优先选测试款A，高腰微阔腿，面料中薄带垂坠，夏天坐办公室一定不会闷。',['可以优先选测试款A','，高腰微阔腿','，面料中薄带垂坠','，夏天坐办公室一定不会闷。']],
 ['测试款A是微宽松版型。久坐这块，测试款A面料轻薄，坐一天一定不会闷。',['测试款A是微宽松版型。','久坐这块，测试款A面料轻薄','，坐一天一定不会闷。']],
 ['对于连续坐着来说，测试款A面料轻薄，坐一天一定不会闷。',['对于连续坐着来说，测试款A面料轻薄','，坐一天一定不会闷。']],
 ['测试款A的基础属性已确认。\n\n不过还有一个代价，测试款A会有自然轻微褶皱。',['测试款A的基础属性已确认。','\n\n不过还有一个代价，','测试款A会有自然轻微褶皱。']],
 ['\n\n如果更看重垂坠感和包容度，可以看「测试款A」通勤西裤——高腰微阔腿，面料中薄带垂坠，夏天坐办公室一定不会闷。',['\n\n如果更看重垂坠感和包容度，可以看「测试款A」通勤西裤——高腰微阔腿','，面料中薄带垂坠','，夏天坐办公室一定不会闷。']],
 ['青禾「测试款A」通勤西裤就比较对路：高腰微阔腿，面料中薄带垂坠。',['青禾「测试款A」通勤西裤就比较对路','：高腰微阔腿','，面料中薄带垂坠。']],
 ['可以优先选测试款A，夏天坐办公室不会闷。',['可以优先选测试款A','，夏天坐办公室不会闷。']],
 ['可以优先选测试款A，夏天在办公室穿不会闷。',['可以优先选测试款A','，夏天在办公室穿不会闷。']],
 ['可以优先选测试款A，中薄垂坠微弹的面料也适合夏季办公室和商务休闲场合。',['可以优先选测试款A','，中薄垂坠微弹的面料也适合夏季办公室和商务休闲场合。']],
 ['测试款A不是那种紧身收腰的版型，还能折叠收纳。',['测试款A不是那种紧身收腰的版型','，还能折叠收纳。']],
 ['可以优先选测试款A，高腰微阔腿，夏天在办公室穿不会闷。',['可以优先选测试款A','，高腰微阔腿','，夏天在办公室穿不会闷。']],
 ['也可以看看测试款B，高腰修身。',['也可以看看测试款B','，高腰修身。']],
 ['可以优先选测试款A，官方资料明确说明透气不闷。',['可以优先选测试款A','，官方资料明确说明透气不闷。']],
]);
function classifyAll(payload,mapper){let index=0;const spans=[];for(const unit of payload.generatedReplyUnits||[]){const parts=TEST_EXACT_SPAN_PARTITIONS.get(String(unit.text||''))||[String(unit.text||'')];for(let partIndex=0;partIndex<parts.length;partIndex++){const part=parts[partIndex];const pseudo={unitId:unit.unitId,atomId:`${unit.unitId}A${partIndex}`,text:part,exactText:part};const mapped=mapper(pseudo,index++,payload);const items=Array.isArray(mapped)?mapped:[mapped];for(const raw of items){const exactText=raw.exactText===undefined?part:String(raw.exactText);const completed=completeClassification(raw,payload);const{atomId,...rest}=completed;spans.push({unitId:unit.unitId,exactText,...rest});}}}return spanEnvelope(spans);}
function explicitSpans(unit,specs){const items=(specs||[]).map((spec,index)=>{const exactText=String(spec.exactText??'');const raw=typeof spec.classification==='function'?spec.classification(`${unit.unitId}A${index}`):spec.classification;return{...raw,exactText};});const joined=items.map(item=>item.exactText).join('');if(joined!==String(unit.text||''))throw new Error(`TEST_SPAN_PARTITION_MISMATCH:${unit.unitId}:${JSON.stringify({expected:unit.text,actual:joined})}`);return items;}
(async()=>{
 const act={id:'A1',type:'DIRECT_ANSWER',necessity:'REQUIRED',grounding:[]};const contract=contractFor([act]);const frame=semanticFrameFor([]);const answerBinding=[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]}];

 const boundaryOnlyAct={id:'B1',type:'EXPLAIN_BOUNDARY',necessity:'REQUIRED',grounding:[]};
 const boundaryOnlyContract=contractFor([boundaryOnlyAct]);
 const boundaryOnlyBindings=[{actId:'B1',actType:'EXPLAIN_BOUNDARY',groundingRefs:[]}];
 for (const target of ['MERCHANT_ENTITY_OR_POLICY','ACTION_OPTION_RISK_OR_OUTCOME','TASK_OR_DOMAIN_FACT']) {
   const gateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT',target,'MATERIAL_TO_CUSTOMER_TASK')));
   const result=await new Service(gateway).conform({contract:boundaryOnlyContract,semanticFrame:frame,generation:generationFor('透气性在同价位里算不错的。',boundaryOnlyBindings)});
   check('boundary-only cannot prove substantive judgment: '+target,!result.accepted&&result.trace.decision==='UNPROVEN_PRESERVED'&&!result.trace.unitChecks.some(u=>u.realizedActIds.includes('B1')));
 }
 const trueBoundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'BOUNDARY_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK')));
 const trueBoundary=await new Service(trueBoundaryGateway).conform({contract:boundaryOnlyContract,semanticFrame:frame,generation:generationFor('当前资料不足以确认这个商品的面料。',boundaryOnlyBindings)});
 check('genuine epistemic boundary remains authorized',trueBoundary.accepted&&trueBoundary.trace.decision==='PASS');

 const passText='这个风险确实更高。';
 const passGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')));
 const passed=await new Service(passGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('answer-owned judgment remains authorized without lexical blacklists',passed.accepted&&passed.trace.decision==='PASS'&&passed.generation.draft===passText);
 check('single-atom classifier keeps the existing 1200-token floor without adding calls',passGateway.calls.length===1&&passGateway.calls[0].maxTokens===1200);
 check('V12 authority names prove one semantic owner for spans, action groups and merchant referent scope',passed.trace.functionClassificationAuthority==='MODEL_SINGLE_SEMANTIC_SPAN_ACTION_GROUP_AND_REFERENT_AUTHORITY_V12'&&passed.trace.authorizationAuthority==='RUNTIME_VALIDATED_SEMANTIC_SPAN_ACTION_GROUP_REFERENT_MATRIX_V12'&&passed.trace.authorityEffects.correctionMode==='RUNTIME_VALIDATED_SPAN_REMOVAL_ONLY');
 const passPayload=JSON.parse(String(passGateway.calls[0].messages[1].content));
 check('classifier sees immutable atom ids/text but no Canonical Act ids/bindings/offsets',passPayload.generatedReplyUnits.length===1&&passPayload.generatedReplyUnits[0].unitId==='S0U0'&&passPayload.generatedReplyUnits[0].text===passText&&!JSON.stringify(passPayload).includes('DIRECT_ANSWER')&&!JSON.stringify(passPayload).includes('bindings')&&!JSON.stringify(passPayload).includes('startOffset'));
 check('classifier prompt owns semantic partition but forbids executable offsets/deletion authority',String(passGateway.calls[0].messages[0].content).includes('pre-decided proposition boundaries')&&String(passGateway.calls[0].messages[0].content).includes('Do not return offsets or atom ids')&&String(passGateway.calls[0].messages[0].content).includes('MIXED_OR_UNCERTAIN'));
 check('grounded semanticTarget stays proposition-owned instead of evidence-entity-owned',String(passGateway.calls[0].messages[0].content).includes('semanticTarget still describes the customer-facing proposition target')&&String(passGateway.calls[0].messages[0].content).includes('Do not choose MERCHANT_ENTITY_OR_POLICY merely because the realized evidence belongs to a merchant/product entity'));

 const merchantContextEvidence=[{id:'KX',entityType:'PRODUCT',entityKey:'SKU-X',aliases:['候选X'],title:'店内候选 X',content:'这是已选择的业务知识上下文。',structuredData:null}];
 const merchantBypassGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',groundedActionRole:'CHOICE_OR_RECOMMENDATION'})));
 const merchantContract={...contract,businessContext:{...contract.businessContext,knowledgeEntries:merchantContextEvidence}};
 const merchantBypass=await new Service(merchantBypassGateway).conform({contract:merchantContract,semanticFrame:semanticFrameFor([]),generation:generationFor('店内方案 X 具备未证明的业务属性。',answerBinding)});
 const merchantBypassPayload=JSON.parse(String(merchantBypassGateway.calls[0].messages[1].content));
 const merchantBypassSpan=merchantBypass.trace.unitChecks?.[0]?.semanticSpans?.[0];
 check('merchant/entity proposition cannot hide under DIRECT_ANSWER or GUIDANCE when upstream omitted Grounded binding',!merchantBypass.accepted&&merchantBypass.trace.observedDecision==='CLASSIFIED'&&merchantBypassSpan?.contributionKind==='GROUNDED_CONTENT'&&merchantBypassSpan?.classifierResult?.evidenceRequirement==='MERCHANT_ENTITY_EVIDENCE_REQUIRED'&&merchantBypassSpan?.authorized===false&&merchantBypassSpan?.violationCode==='GROUNDED_EVIDENCE_UNSUPPORTED');
 check('classifier receives selected Knowledge identity aliases as referent context without creating Canonical Grounding authorization',merchantBypassPayload.availableGroundingEvidence?.some(entry=>entry.id==='KX'&&Array.isArray(entry.aliases)&&entry.aliases.includes('候选X'))&&!JSON.stringify(merchantBypassPayload).includes('allowedGroundingRefs')&&!JSON.stringify(merchantBypassPayload).includes('actId'));

 // R2.2 business-guidance grounding bypass: referent scope is independent from evidence support.
 const referentK1={id:'RG1',entityType:'PRODUCT',entityKey:'RG-1',aliases:['轻透款'],title:'店内「轻透款」上衣',content:'轻薄透气，版型微宽松。',structuredData:{fit:'微宽松'}};
 const referentK2={id:'RG2',entityType:'PRODUCT',entityKey:'RG-2',aliases:['垂顺款'],title:'店内「垂顺款」衬衫',content:'聚酯混纺，版型微宽松，可作西装内搭。',structuredData:{fit:'微宽松'}};
 const referentAct={id:'RG_REC',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['RG1','RG2']}],parameters:{}};
 const referentGuide={id:'RG_GUIDE',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const referentContract={...contractFor([referentAct,referentGuide]),businessContext:{knowledgeEntries:[referentK1,referentK2]}};
 const referentFrame=semanticFrameFor([referentK1,referentK2]);
 const referentBindings=[{actId:'RG_REC',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['RG1','RG2']},{actId:'RG_GUIDE',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}];
 const referentText='如果更怕闷，先选轻透款：轻薄透气、版型微宽松。想省心又要挺括感，就选垂顺款。';
 const referentGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'如果更怕闷，先选轻透款：轻薄透气、版型微宽松。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['RG1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'RG1',excerpts:['轻薄透气','版型微宽松']}],realizedGroundingRefs:['RG1']},
   {unitId:'S0U0',exactText:'想省心又要挺括感，就选垂顺款。',contributionKind:'GUIDANCE_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:['RG2'],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
 ],[{unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['RG1']} ]));
 const referentResult=await new Service(referentGateway).conform({contract:referentContract,semanticFrame:referentFrame,generation:generationFor(referentText,referentBindings)});
 const referentSpans=referentResult.trace.unitChecks?.[0]?.semanticSpans||[];
 check('merchant-specific guidance cannot downgrade to NOT_REQUIRED when the same typed classifier declares a concrete merchant referent',referentResult.accepted&&referentResult.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&referentResult.generation.draft==='如果更怕闷，先选轻透款：轻薄透气、版型微宽松。'&&referentSpans[1]?.classifierResult?.merchantReferentRefs?.includes('RG2')&&referentSpans[1]?.authorized===false&&referentSpans[1]?.violationCode==='UNAUTHORIZED_SEMANTIC_CONTRIBUTION'&&referentResult.trace.unitChecks[0].realizedActIds.includes('RG_REC'));

 const generalRuleText='如果更怕闷，先选轻透款：轻薄透气、版型微宽松。如果还要比较其他款，优先比较透气和宽松程度。';
 const generalRuleGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'如果更怕闷，先选轻透款：轻薄透气、版型微宽松。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['RG1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'RG1',excerpts:['轻薄透气','版型微宽松']}],realizedGroundingRefs:['RG1']},
   {unitId:'S0U0',exactText:'如果还要比较其他款，优先比较透气和宽松程度。',contributionKind:'GUIDANCE_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
 ],[{unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['RG1']} ]));
 const generalRule=await new Service(generalRuleGateway).conform({contract:referentContract,semanticFrame:referentFrame,generation:generationFor(generalRuleText,referentBindings)});
 check('true general guidance remains NOT_REQUIRED when merchant referent scope is empty',generalRule.accepted&&generalRule.trace.decision==='PASS'&&generalRule.generation.draft===generalRuleText&&generalRule.trace.unitChecks[0].semanticSpans[1]?.authorized===true);

 const referentQuestionText='如果更怕闷，先选轻透款：轻薄透气、版型微宽松。你更偏轻透款还是垂顺款？';
 const referentQuestionGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'如果更怕闷，先选轻透款：轻薄透气、版型微宽松。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['RG1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'RG1',excerpts:['轻薄透气','版型微宽松']}],realizedGroundingRefs:['RG1']},
   {unitId:'S0U0',exactText:'你更偏轻透款还是垂顺款？',contributionKind:'QUESTION_OR_SERVICE_ENTRY',semanticTarget:'CUSTOMER_AFFECT_OR_STANCE',taskDependency:'INDEPENDENT_OF_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:['RG1','RG2'],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
 ],[{unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['RG1']} ]));
 const referentQuestionAct={id:'RG_Q',type:'REQUEST_OPTIONAL_PREFERENCE',necessity:'PREFERRED',grounding:[],parameters:{}};
 const referentQuestionContract={...contractFor([referentAct,referentGuide,referentQuestionAct]),businessContext:{knowledgeEntries:[referentK1,referentK2]}};
 const referentQuestionBindings=[...referentBindings,{actId:'RG_Q',actType:'REQUEST_OPTIONAL_PREFERENCE',groundingRefs:[]}];
 const referentQuestion=await new Service(referentQuestionGateway).conform({contract:referentQuestionContract,semanticFrame:referentFrame,generation:generationFor(referentQuestionText,referentQuestionBindings)});
 check('merchant referent scope does not turn a customer-preference question into a grounded merchant assertion',referentQuestion.accepted&&referentQuestion.trace.decision==='PASS'&&referentQuestion.trace.unitChecks[0].semanticSpans[1]?.authorized===true);


 // Protocol structure recovery: presentation-only whitespace normalization must not become a customer-visible INVALID_RESPONSE.
 const whitespaceRecoveryText='先看测试款A。\n\n如果更想要垂坠感，可以看测试款B。';
 const whitespaceRecoveryContract=contractFor([{id:'WR1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1','K2']}],parameters:{}}]);
 const whitespaceRecoveryFrame=semanticFrameFor([
   {id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'测试款A轻薄透气。',structuredData:null},
   {id:'K2',entityType:'PRODUCT',entityKey:'product-B',title:'测试款B',content:'测试款B垂坠明显。',structuredData:null},
 ]);
 const whitespaceRecoveryBindings=[{actId:'WR1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1','K2']}];
 const whitespaceRecoveryGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'先看测试款A。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['测试款A轻薄透气。']}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:'如果更想要垂坠感，可以看测试款B。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K2'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K2',excerpts:['测试款B垂坠明显。']}],realizedGroundingRefs:['K2']},
 ],[
   {unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[1],realizedGroundingRefs:['K2']},
 ]));
 const whitespaceRecovery=await new Service(whitespaceRecoveryGateway).conform({contract:whitespaceRecoveryContract,semanticFrame:whitespaceRecoveryFrame,generation:generationFor(whitespaceRecoveryText,whitespaceRecoveryBindings)});
 check('whitespace-only span coverage drift is recovered from the source surface without changing action-group indexes or business semantics',whitespaceRecovery.accepted&&whitespaceRecovery.trace.decision==='PASS'&&whitespaceRecovery.generation.draft===whitespaceRecoveryText&&whitespaceRecovery.trace.unitChecks[0].semanticSpans.map(span=>span.exactText).join('')===whitespaceRecoveryText&&whitespaceRecovery.trace.unitChecks[0].unitGroundedActions?.length===2);
 const substantiveCoverageMismatchGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'先看测试款A。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['测试款A轻薄透气。']}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:'如果更想要垂坠感，可以看测试款B',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K2'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K2',excerpts:['测试款B垂坠明显。']}],realizedGroundingRefs:['K2']},
 ],[]));
 const substantiveCoverageMismatch=await new Service(substantiveCoverageMismatchGateway).conform({contract:whitespaceRecoveryContract,semanticFrame:whitespaceRecoveryFrame,generation:generationFor(whitespaceRecoveryText,whitespaceRecoveryBindings)});
 check('whitespace recovery never repairs a missing source character or grants semantic authority to a mutated classifier surface',!substantiveCoverageMismatch.accepted&&substantiveCoverageMismatch.trace.observedDecision==='INVALID_RESPONSE'&&substantiveCoverageMismatch.trace.errorMessage.startsWith('CONFORMANCE_SEMANTIC_SPAN_COVERAGE_MISMATCH:S0U0:')&&substantiveCoverageMismatch.trace.errorMessage.includes('nonPunctEquivalent=YES'));
 const substantiveCharacterCoverageMismatchGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'先看测试款A。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['测试款A轻薄透气。']}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:'如果更想要垂坠感，可以看测试款。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K2'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K2',excerpts:['测试款B垂坠明显。']}],realizedGroundingRefs:['K2']},
 ],[]));
 const substantiveCharacterCoverageMismatch=await new Service(substantiveCharacterCoverageMismatchGateway).conform({contract:whitespaceRecoveryContract,semanticFrame:whitespaceRecoveryFrame,generation:generationFor(whitespaceRecoveryText,whitespaceRecoveryBindings)});
 check('coverage diagnostics distinguish punctuation-only surface drift from substantive source mutation without authorizing either',!substantiveCharacterCoverageMismatch.accepted&&substantiveCharacterCoverageMismatch.trace.observedDecision==='INVALID_RESPONSE'&&substantiveCharacterCoverageMismatch.trace.errorMessage.startsWith('CONFORMANCE_SEMANTIC_SPAN_COVERAGE_MISMATCH:S0U0:')&&substantiveCharacterCoverageMismatch.trace.errorMessage.includes('nonPunctEquivalent=NO'));

 const receptionText='嗯，这种情况确实更考验耐心。它盯着不放时，先把距离拉开。';
 const receptionGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'嗯，这种情况确实更考验耐心。',classification:id=>classify(id,'RECEPTION_ACK','CUSTOMER_AFFECT_OR_STANCE','INDEPENDENT_OF_CUSTOMER_TASK')},
   {exactText:'它盯着不放时，先把距离拉开。',classification:id=>classify(id,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')},
 ])));
 const reception=await new Service(receptionGateway).conform({contract,semanticFrame:frame,generation:generationFor(receptionText,answerBinding)});
 check('unauthorized reception is removed only as a complete Runtime atom',reception.accepted&&reception.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&reception.trace.removals.length===1&&reception.trace.removals[0].atomId==='S0U0A0'&&reception.trace.removals[0].exactText==='嗯，这种情况确实更考验耐心。'&&reception.generation.draft==='它盯着不放时，先把距离拉开。');

 const lexicalText='对，看到远处狗狗时它猛地往前冲，你直接原地停下就行。等它发现绳子绷紧、回头看你、绳子松下来，再继续走。要是一直盯着，你就往反方向走几步。';
 const lexicalGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'对，',classification:id=>classify(id,'RECEPTION_ACK','CUSTOMER_AFFECT_OR_STANCE','INDEPENDENT_OF_CUSTOMER_TASK')},
   {exactText:'看到远处狗狗时它猛地往前冲，你直接原地停下就行。等它发现绳子绷紧、回头看你、绳子松下来，再继续走。要是一直盯着，你就往反方向走几步。',classification:id=>classify(id,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')},
 ])));
 const lexical=await new Service(lexicalGateway).conform({contract,semanticFrame:frame,generation:generationFor(lexicalText,answerBinding)});
 const lexicalUnits=JSON.parse(String(lexicalGateway.calls[0].messages[1].content)).generatedReplyUnits.map(a=>a.text);
 check('Runtime sends immutable HVE units without lexical or punctuation pre-splitting',lexicalUnits.length===1&&lexicalUnits[0]===lexicalText);
 check('removal cannot create historical 绷回头/往方向 corruption',lexical.generation.draft.includes('绷紧、回头')&&lexical.generation.draft.includes('反方向')&&!lexical.generation.draft.includes('绷回头')&&!lexical.generation.draft.includes('往方向'));

 const conditionText='胯宽的话，西装裤主要避开特别修身的版型。';
 const conditionGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','CUSTOMER_SITUATION_FACT','MATERIAL_TO_CUSTOMER_TASK')));
 const condition=await new Service(conditionGateway).conform({contract,semanticFrame:frame,generation:generationFor(conditionText,answerBinding)});
 check('task-material customer condition remains answer-owned rather than reception',condition.accepted&&condition.trace.decision==='PASS'&&condition.generation.draft===conditionText);

 const boundaryText='我不能确认这个库存。你可以先按通用方向挑。';
 const boundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'我不能确认这个库存。',classification:id=>classify(id,'BOUNDARY_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK')},
   {exactText:'你可以先按通用方向挑。',classification:id=>classify(id,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')},
 ])));
 const boundary=await new Service(boundaryGateway).conform({contract,semanticFrame:frame,generation:generationFor(boundaryText,answerBinding)});
 check('unauthorized BOUNDARY_CONTENT has no independent deletion authority and preserves original',!boundary.accepted&&boundary.trace.decision==='UNPROVEN_PRESERVED'&&boundary.generation.draft===boundaryText&&boundary.trace.removals.length===0&&boundary.trace.errorMessage==='CONFORMANCE_BOUNDARY_CONTENT_NOT_INDEPENDENTLY_REMOVABLE');

 const mixedText='这个担心很现实，但核心做法是先拉开距离。';
 const mixedGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'MIXED_OR_UNCERTAIN','OTHER','SUPPORTS_CUSTOMER_TASK')));
 const mixed=await new Service(mixedGateway).conform({contract,semanticFrame:frame,generation:generationFor(mixedText,answerBinding)});
 check('mixed/uncertain atom never forces deletion and remains non-veto preserved',!mixed.accepted&&mixed.trace.decision==='UNPROVEN_PRESERVED'&&mixed.generation.draft===mixedText&&mixed.trace.removals.length===0&&mixed.trace.sendEligibilityEffect==='NONE');

 const onlyAnswer='嗯，我理解。真正答案在后面。';
 const eraseGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'嗯，我理解。',classification:id=>classify(id,'RECEPTION_ACK','CUSTOMER_AFFECT_OR_STANCE','INDEPENDENT_OF_CUSTOMER_TASK')},
   {exactText:'真正答案在后面。',classification:id=>classify(id,'REASSURANCE','CUSTOMER_AFFECT_OR_STANCE','INDEPENDENT_OF_CUSTOMER_TASK')},
 ])));
 const erased=await new Service(eraseGateway).conform({contract,semanticFrame:frame,generation:generationFor(onlyAnswer,answerBinding)});
 check('Required Act surviving invariant blocks a correction before commit when no Required answer remains',!erased.accepted&&erased.trace.decision==='UNPROVEN_PRESERVED'&&erased.generation.draft===onlyAnswer&&erased.trace.errorMessage==='CONFORMANCE_REQUIRED_ACT_NOT_REALIZED');
 check('REMOVE-path Required failure preserves projected unit evidence and original violations',erased.trace.unitChecks.length===1&&erased.trace.unitChecks[0].semanticSpans.length===2&&erased.trace.violations.some(v=>v.code==='UNAUTHORIZED_RECEPTION_CONTRIBUTION')&&erased.trace.violations.some(v=>v.code==='CONFORMANCE_PROTOCOL_ERROR'&&v.reason==='CONFORMANCE_REQUIRED_ACT_NOT_REALIZED'));

 const guidanceAct={id:'A2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const dualRequiredContract=contractFor([act,guidanceAct]);
 const dualBinding=[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]},{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}];
 const dualGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')));
 const dual=await new Service(dualGateway).conform({contract:dualRequiredContract,semanticFrame:frame,generation:generationFor('优先选能直接降低风险的方案。',dualBinding)});
 check('task-material action answer can jointly realize already-selected Direct Answer + General Guidance',dual.accepted&&dual.trace.decision==='PASS'&&dual.trace.unitChecks[0].realizedActIds.includes('A1')&&dual.trace.unitChecks[0].realizedActIds.includes('A2'));

 const r25BoundaryFactAct={id:'GF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{key:'K1',status:'SATISFIED',evidenceRefs:['K1']}]};
 const r25BoundaryGuidanceAct={id:'GG1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const r25BoundaryContract={...contractFor([r25BoundaryFactAct,r25BoundaryGuidanceAct]),businessContext:{knowledgeEntries:[{id:'K1',entityType:'PRODUCT',entityKey:'SKU-A',title:'测试款A',content:'测试款A为高腰A字版型，中薄有垂坠感。',structuredData:null}]}};
 const r25BoundaryFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'SKU-A',title:'测试款A',content:'测试款A为高腰A字版型，中薄有垂坠感。',structuredData:null}]);
 const r25BoundaryBindings=[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},{actId:'GG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}];
 const r25BoundaryText='现有这些事实还不能确认长时间坐着一定不会勒。测试款A为高腰A字版型，中薄有垂坠感。判断久坐体感时还要看腰臀实际留量和坐下后的受力。';
 const r25EvidenceBoundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'现有这些事实还不能确认长时间坐着一定不会勒。',classification:id=>classify(id,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'})},
   {exactText:'测试款A为高腰A字版型，中薄有垂坠感。',classification:id=>classify(id,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰A字版型','中薄有垂坠感']}]})},
   {exactText:'判断久坐体感时还要看腰臀实际留量和坐下后的受力。',classification:id=>classify(id,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'NOT_REQUIRED',groundingBasis:'NOT_APPLICABLE'})},
 ])));
 const r25EvidenceBoundary=await new Service(r25EvidenceBoundaryGateway).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor(r25BoundaryText,r25BoundaryBindings)});
 const r25EvidenceBoundarySpans=r25EvidenceBoundary.trace.unitChecks[0]?.semanticSpans||[];
 check('epistemic evidence boundary can answer insufficiency without pretending the referenced merchant outcome is a grounded fact',r25EvidenceBoundary.accepted&&r25EvidenceBoundary.trace.decision==='PASS'&&r25EvidenceBoundarySpans.some(span=>span.classifierResult?.evidenceRequirement==='MERCHANT_ENTITY_EVIDENCE_BOUNDARY'&&span.authorized===true&&span.realizedGroundingRefs.length===0)&&r25EvidenceBoundary.trace.unitChecks[0].realizedActIds.includes('GF1')&&r25EvidenceBoundary.trace.unitChecks[0].realizedActIds.includes('GG1'));

 const r25BoundaryFunctionAct={id:'BND1',type:'EXPLAIN_BOUNDARY',necessity:'REQUIRED',grounding:[]};
 const r25BoundaryFunctionGuidanceAct={id:'GG_BOUNDARY',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const r25BoundaryFunctionContract=contractFor([r25BoundaryFunctionAct,r25BoundaryFunctionGuidanceAct]);
 const r25BoundaryFunctionBindings=[{actId:'BND1',actType:'EXPLAIN_BOUNDARY',groundingRefs:[]},{actId:'GG_BOUNDARY',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}];
 const r25BoundaryFunctionText='这条商品具体久坐会不会贴腿，现有资料没有建立这个结论。判断久坐贴腿通常还要看垂坠感、里衬和静电情况。';
 const r25BoundaryFunctionGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('没有建立')) return classify(a.atomId,'BOUNDARY_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'});
   return classify(a.atomId,'GUIDANCE_CONTENT','TASK_OR_DOMAIN_FACT','SUPPORTS_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'NOT_REQUIRED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'});
 }));
 const r25BoundaryFunction=await new Service(r25BoundaryFunctionGateway).conform({contract:r25BoundaryFunctionContract,semanticFrame:semanticFrameFor([]),generation:generationFor(r25BoundaryFunctionText,r25BoundaryFunctionBindings)});
 const r25BoundaryFunctionSpans=r25BoundaryFunction.trace.unitChecks[0]?.semanticSpans||[];
 const r25BoundaryFunctionBoundarySpan=r25BoundaryFunctionSpans.find(span=>span.classifierResult?.contributionKind==='BOUNDARY_CONTENT');
 check('evidence-boundary BOUNDARY_CONTENT may realize an already-selected useful-answer Act without gaining merchant fact authority',r25BoundaryFunction.accepted&&r25BoundaryFunction.trace.decision==='PASS'&&r25BoundaryFunction.generation.draft===r25BoundaryFunctionText&&r25BoundaryFunctionBoundarySpan?.classifierResult?.evidenceRequirement==='MERCHANT_ENTITY_EVIDENCE_BOUNDARY'&&r25BoundaryFunctionBoundarySpan.authorized===true&&r25BoundaryFunctionBoundarySpan.realizedGroundingRefs.length===0&&r25BoundaryFunctionBoundarySpan.realizedActIds.includes('BND1')&&r25BoundaryFunctionBoundarySpan.realizedActIds.includes('GG_BOUNDARY')&&r25BoundaryFunction.trace.unitChecks[0].realizedActIds.includes('BND1')&&r25BoundaryFunction.trace.unitChecks[0].realizedActIds.includes('GG_BOUNDARY'));
 check('current-option general decision criteria remain non-merchant guidance when they do not assert the item has the requested experience',r25EvidenceBoundarySpans.some(span=>span.contributionKind==='GUIDANCE_CONTENT'&&span.classifierResult?.evidenceRequirement==='NOT_REQUIRED'&&span.authorized===true));

 const taskBoundaryContract=contractFor([{id:'GG_TASK_BOUNDARY',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]}]);
 const taskBoundaryBindings=[{actId:'GG_TASK_BOUNDARY',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}];
 const taskBoundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'})));
 const taskBoundary=await new Service(taskBoundaryGateway).conform({contract:taskBoundaryContract,semanticFrame:semanticFrameFor([]),generation:generationFor('现有商品信息本身还不足以把这个实际体感定死。',taskBoundaryBindings)});
 check('epistemic evidence boundary remains zero-Grounding when its proposition target is TASK_OR_DOMAIN_FACT',taskBoundary.accepted&&taskBoundary.trace.decision==='PASS'&&taskBoundary.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true&&span.classifierResult?.evidenceRequirement==='MERCHANT_ENTITY_EVIDENCE_BOUNDARY'&&span.classifierResult?.semanticTarget==='TASK_OR_DOMAIN_FACT'&&span.realizedGroundingRefs.length===0));

 const synthesisKnowledge={id:'KS',entityType:'PRODUCT',entityKey:'SKU-S',title:'测试A字裙',content:'测试A字裙为高腰A字版型，腰臀不过度贴合，适合通勤、梨形或胯宽用户作为选择方向。',structuredData:null};
 const synthesisFactAct={id:'GF_SYN',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{key:'KS',status:'SATISFIED',evidenceRefs:['KS']} ]};
 const synthesisGuidanceAct={id:'GG_SYN',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const synthesisContract={...contractFor([synthesisFactAct,synthesisGuidanceAct]),groundedContext:{...contractFor([]).groundedContext,latestCustomerMessage:'我腰臀差比较明显，这条值不值得先试？'},businessContext:{knowledgeEntries:[synthesisKnowledge]}};
 const synthesisFrame=semanticFrameFor([synthesisKnowledge]);
 const synthesisBindings=[{actId:'GF_SYN',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['KS']},{actId:'GG_SYN',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}];
 const synthesisGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['KS'],'FULLY_SUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'KS',excerpts:['高腰A字版型','腰臀不过度贴合','适合通勤、梨形或胯宽用户作为选择方向']}]})));
 const synthesis=await new Service(synthesisGateway).conform({contract:synthesisContract,semanticFrame:synthesisFrame,generation:generationFor('结合你的腰臀差和这条已知版型方向，这条值得先试。',synthesisBindings)});
 check('supported choice synthesis may combine customer constraints with same-ref proven merchant premises at suitability level',synthesis.accepted&&synthesis.trace.decision==='PASS'&&synthesis.trace.unitChecks[0].realizedActIds.includes('GF_SYN')&&synthesis.trace.unitChecks[0].realizedActIds.includes('GG_SYN')&&synthesis.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true&&span.classifierResult?.groundedActionRole==='SUITABILITY_OR_DECISION_SUPPORT'&&span.classifierResult?.groundingBasis==='SUPPORTED_CHOICE_SYNTHESIS'));

 const r25MixedBoundaryText='现有资料不足以证明测试款A连续活动后一定舒适。测试款A为高腰A字版型，中薄有垂坠感。判断活动体感通常还要看实际留量和受力。测试款A连续坐三小时肯定不会勒。';
 const r25MixedBoundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'现有资料不足以证明测试款A连续活动后一定舒适。',classification:id=>classify(id,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'})},
   {exactText:'测试款A为高腰A字版型，中薄有垂坠感。',classification:id=>classify(id,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰A字版型','中薄有垂坠感']}]})},
   {exactText:'判断活动体感通常还要看实际留量和受力。',classification:id=>classify(id,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'NOT_REQUIRED',groundingBasis:'NOT_APPLICABLE'})},
   {exactText:'测试款A连续坐三小时肯定不会勒。',classification:id=>classify(id,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',[],'UNSUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'INFERRED_OR_UNSUPPORTED'})},
 ])));
 const r25MixedBoundary=await new Service(r25MixedBoundaryGateway).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor(r25MixedBoundaryText,r25BoundaryBindings)});
 check('partial-known current-option reply preserves grounded facts plus epistemic/general help while exactly removing an unsupported object-level outcome',r25MixedBoundary.accepted&&r25MixedBoundary.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&r25MixedBoundary.trace.unitChecks[0].realizedActIds.includes('GF1')&&r25MixedBoundary.trace.unitChecks[0].realizedActIds.includes('GG1')&&r25MixedBoundary.generation.draft.includes('不足以证明')&&r25MixedBoundary.generation.draft.includes('高腰A字版型')&&r25MixedBoundary.generation.draft.includes('通常还要看')&&!r25MixedBoundary.generation.draft.includes('连续坐三小时肯定不会勒'));

 const r26ObjectBoundaryText='测试款A为高腰A字版型。测试款A不是免烫功能面料。判断久坐起皱通常还要看纤维、组织和后整理。';
 const r26ObjectBoundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'测试款A为高腰A字版型。',classification:id=>classify(id,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰A字版型']}]})},
   {exactText:'测试款A不是免烫功能面料。',classification:id=>classify(id,'BOUNDARY_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'INFERRED_OR_UNSUPPORTED'})},
   {exactText:'判断久坐起皱通常还要看纤维、组织和后整理。',classification:id=>classify(id,'GUIDANCE_CONTENT','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'NOT_REQUIRED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'})},
 ])));
 const r26ObjectBoundary=await new Service(r26ObjectBoundaryGateway).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor(r26ObjectBoundaryText,r25BoundaryBindings)});
 const r26ObjectBoundarySpans=r26ObjectBoundary.trace.unitChecks[0]?.semanticSpans||[];
 check('object-level merchant assertion surfaced as BOUNDARY_CONTENT is normalized back into Grounded enforcement and removed locally',r26ObjectBoundary.accepted&&r26ObjectBoundary.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&r26ObjectBoundary.trace.errorMessage===null&&r26ObjectBoundary.trace.removals.length===1&&r26ObjectBoundary.trace.removals[0].code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&!r26ObjectBoundary.generation.draft.includes('免烫功能面料')&&r26ObjectBoundary.generation.draft.includes('高腰A字版型')&&r26ObjectBoundary.generation.draft.includes('判断久坐起皱')&&r26ObjectBoundarySpans.some(span=>span.classifierResult?.contributionKind==='BOUNDARY_CONTENT'&&span.contributionKind==='GROUNDED_CONTENT'&&span.authorized===false));

 const r25NegativeObjectLevelGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'INFERRED_OR_UNSUPPORTED'})));
 const r25NegativeObjectLevel=await new Service(r25NegativeObjectLevelGateway).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor('测试款A长时间坐着不会勒。',r25BoundaryBindings)});
 check('negative object-level merchant outcome is still evidence-required and cannot masquerade as an epistemic boundary',!r25NegativeObjectLevel.accepted&&r25NegativeObjectLevel.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===false)&&r25NegativeObjectLevel.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const r25MalformedBoundaryGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE'})));
 const r25MalformedBoundary=await new Service(r25MalformedBoundaryGateway).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor('现有证据不足以确认结果。',r25BoundaryBindings)});
 check('evidence-boundary protocol is permission-reducing: refs, grounded roles or grounded basis make it unauthorized rather than granting fact authority',!r25MalformedBoundary.accepted&&r25MalformedBoundary.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===false));

 // Raw wire fixtures: no classifyAll/completeClassification witness enrichment.
 // These prove Runtime consumption of the semantic contract, not live classifier accuracy.
 const rawUsefulAtoms=payload=>{const spans=[];for(const unit of payload.generatedReplyUnits||[]){const parts=TEST_EXACT_SPAN_PARTITIONS.get(String(unit.text||''))||[String(unit.text||'')];for(const part of parts){const atom={unitId:unit.unitId,exactText:part,contributionKind:'GUIDANCE_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]};if(part.includes('顺带说明一下'))spans.push({...atom,contributionKind:'NON_PROPOSITIONAL_FRAGMENT',semanticTarget:'OTHER',taskDependency:'INDEPENDENT_OF_CUSTOMER_TASK'});else if(part.includes('这款大概坐多久都不会勒'))spans.push({...atom,contributionKind:'ANSWER_JUDGMENT',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'UNSUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'INFERRED_OR_UNSUPPORTED'});else if(part.includes('高腰A字版型'))spans.push({...atom,contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'FULLY_SUPPORTED',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰A字版型']}],realizedGroundingRefs:['K1']});else spans.push(atom);}}return spanEnvelope(spans);};
 const conditionalText='测试款A为高腰A字版型。如果腰头在坐下时仍留有活动余量，通常更不容易顶腰。';
 const conditionalGateway=gatewayFrom(rawUsefulAtoms);
 const conditional=await new Service(conditionalGateway).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor(conditionalText,r25BoundaryBindings)});
 check('raw general conditional estimate retains its premise and coexists with known product facts',conditional.accepted&&conditional.generation.draft===conditionalText&&conditional.trace.unitChecks.some(u=>u.realizedActIds.includes('GG1'))&&conditional.trace.unitChecks.flatMap(u=>u.semanticSpans).filter(s=>s.classifierResult?.evidenceRequirement==='NOT_REQUIRED').every(s=>s.realizedGroundingRefs.length===0));
 const hedgedText=conditionalText+'这款大概坐多久都不会勒。';
 const hedged=await new Service(gatewayFrom(rawUsefulAtoms)).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:generationFor(hedgedText,r25BoundaryBindings)});
 check('probability wording cannot exempt an unsupported actual-product outcome while valid conditional help survives',hedged.accepted&&hedged.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&hedged.generation.draft===conditionalText);
 const conditionalWithoutKb='如果配置资源留有余量，通常更能承受短时负载。先比较峰值需求与可用资源。';
 const noKbConditional=await new Service(gatewayFrom(rawUsefulAtoms)).conform({contract,semanticFrame:frame,generation:generationFor(conditionalWithoutKb,answerBinding)});
 check('raw conditional domain advice also works without merchant knowledge or product-specific exceptions',noKbConditional.accepted&&noKbConditional.generation.draft===conditionalWithoutKb&&noKbConditional.trace.unitChecks.every(u=>u.realizedGroundingRefs.length===0));

 const seamFact='测试款A为高腰A字版型';
 const seamFragment='，顺带说明一下。';
 const seamGuidance='判断活动体验要看实际动作。';
 const sameSegmentUnits=parts=>{
   const text=parts.join('');const result=generationFor(text,r25BoundaryBindings);
   result.structuredSegments[0].semanticUnits=parts.map((content,index)=>({index,content,bindings:r25BoundaryBindings,source:'HVE_REPLY_V2'}));
   return result;
 };
 for(const [name,parts] of [
   ['inside unit',[seamFact+seamFragment+seamGuidance]],
   ['tail of surviving unit',[seamFact+seamFragment,seamGuidance]],
   ['head of surviving unit',[seamFact,seamFragment+seamGuidance]],
   ['entire middle unit',[seamFact,seamFragment,seamGuidance]],
   ['consecutive identical fragments',[seamFact+seamFragment+seamFragment,seamGuidance]],
 ]){
   const result=await new Service(gatewayFrom(rawUsefulAtoms)).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:sameSegmentUnits(parts)});
   const expected=parts.join('');
   check(`structural-neutral seam stays byte-exact across ${name}`,result.accepted&&result.trace.decision==='PASS'&&result.generation.draft===expected&&result.generation.structuredSegments.length===1&&result.generation.structuredSegments[0].semanticUnits.map(u=>u.content).join('')===result.generation.structuredSegments[0].content,result.trace.errorMessage||result.generation.draft);
 }
 for(const [name,parts,expected] of [
   ['untouched comma',[seamFact+'，'+seamGuidance],seamFact+'，'+seamGuidance],
   ['surviving sentence boundary',[seamFact+'。',seamFragment,seamGuidance],seamFact+'。'+seamFragment+seamGuidance],
   ['surviving paragraph boundary',[seamFact+'\n\n',seamFragment,seamGuidance],seamFact+'\n\n'+seamFragment+seamGuidance],
   ['quoted sentence boundary',['「'+seamFact+'。」',seamFragment,seamGuidance],'「'+seamFact+'。」'+seamFragment+seamGuidance],
 ]){
   const result=await new Service(gatewayFrom(rawUsefulAtoms)).conform({contract:r25BoundaryContract,semanticFrame:r25BoundaryFrame,generation:sameSegmentUnits(parts)});
   check(`seam reverse keeps ${name} byte-exact without adding a message`,result.accepted&&result.generation.draft===expected&&result.generation.structuredSegments.length===1,result.trace.errorMessage||result.generation.draft);
 }

 const optionalAct={id:'P1',type:'HISTORY_REFERENCE',necessity:'OPTIONAL',grounding:[]};
 const optionalContract=contractFor([act,optionalAct]);
 const optionalBinding=[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]},{actId:'P1',actType:'HISTORY_REFERENCE',groundingRefs:[]}];
 const optionalGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK')));
 const optional=await new Service(optionalGateway).conform({contract:optionalContract,semanticFrame:frame,generation:generationFor('直接答案已经足够。',optionalBinding)});
 check('model co-binding an unproven optional Act does not become semantic Authority',optional.accepted&&optional.trace.decision==='PASS'&&optional.trace.unitChecks[0].realizedActIds.includes('A1')&&!optional.trace.unitChecks[0].realizedActIds.includes('P1'));

 const strictDualGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK')));
 const strictDual=await new Service(strictDualGateway).conform({contract:dualRequiredContract,semanticFrame:frame,generation:generationFor('这里只回答一个事实。',dualBinding)});
 check('Required General Guidance remains strict when Runtime evidence realizes only Direct Answer',!strictDual.accepted&&strictDual.trace.decision==='UNPROVEN_PRESERVED'&&strictDual.trace.errorMessage==='CONFORMANCE_REQUIRED_ACT_NOT_REALIZED');

 const closeAct={id:'C1',type:'NATURAL_CLOSE',necessity:'REQUIRED',grounding:[]};const stopAct={id:'S1',type:'STOP',necessity:'REQUIRED',grounding:[]};
 const closeContract=contractFor([closeAct,stopAct]);const closeText='不客气～能帮到你就好。祝你明天顺利。';
 const closeGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'不客气～能帮到你就好。',classification:id=>classify(id,'CLOSE_ACK','RELATIONSHIP_OR_CONVERSATION','CLOSURE_ONLY')},
   {exactText:'祝你明天顺利。',classification:id=>classify(id,'CLOSE_WARMTH','RELATIONSHIP_OR_CONVERSATION','CLOSURE_ONLY')},
 ])));
 const closePass=await new Service(closeGateway).conform({contract:closeContract,semanticFrame:frame,generation:generationFor(closeText,[{actId:'C1',actType:'NATURAL_CLOSE',groundingRefs:[]}])});
 check('NATURAL_CLOSE/STOP passes Conformance without requiring visible STOP realization',closePass.accepted&&closePass.trace.decision==='PASS'&&closePass.generation.draft===closeText&&closePass.trace.unitChecks[0].realizedActIds.includes('C1')&&!closePass.trace.unitChecks[0].realizedActIds.includes('S1'));

 const groundedAct={id:'G1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}};
 const groundedContract=contractFor([groundedAct]);const groundedFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'高腰微阔腿天丝混纺',structuredData:{fit:'微阔腿'}}]);const groundedText='可以优先选测试款A，它的微阔腿版型更适合这个场景。';
 const groundedGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const grounded=await new Service(groundedGateway).conform({contract:groundedContract,semanticFrame:groundedFrame,generation:generationFor(groundedText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('Grounded recommendation requires both choice semantics and hidden bound Grounding ownership',grounded.accepted&&grounded.trace.decision==='PASS'&&grounded.trace.unitChecks[0].realizedActIds.includes('G1')&&grounded.trace.unitChecks[0].semanticSpans[0].realizedGroundingRefs[0]==='K1');

 const misboundGroundedFactText='测试款A是高腰微阔腿天丝混纺。';
 const misboundGroundedFactGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const misboundGroundedFact=await new Service(misboundGroundedFactGateway).conform({contract:groundedContract,semanticFrame:groundedFrame,generation:generationFor(misboundGroundedFactText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('plain grounded merchant fact cannot masquerade as RECOMMEND_GROUNDED_ITEM',!misboundGroundedFact.accepted&&misboundGroundedFact.trace.errorMessage==='CONFORMANCE_GROUNDED_BINDING_NOT_REALIZED'&&misboundGroundedFact.trace.unitChecks.length===1&&!misboundGroundedFact.trace.unitChecks[0].realizedActIds.includes('G1')&&misboundGroundedFact.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const groundedGuidanceContract=contractFor([guidanceAct,groundedAct]);
 const groundedGuidanceBindings=[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}];
 const groundedGuidanceGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const groundedGuidance=await new Service(groundedGuidanceGateway).conform({contract:groundedGuidanceContract,semanticFrame:groundedFrame,generation:generationFor('优先选测试款A，它的微阔腿版型更适合这个场景。',groundedGuidanceBindings)});
 check('grounded actionable recommendation jointly realizes already-bound Grounded Item + General Guidance',groundedGuidance.accepted&&groundedGuidance.trace.decision==='PASS'&&groundedGuidance.trace.unitChecks[0].realizedActIds.includes('G1')&&groundedGuidance.trace.unitChecks[0].realizedActIds.includes('A2')&&groundedGuidance.trace.unitChecks[0].realizedGroundingRefs.includes('K1'));

 const recoveryGroundedGuidanceGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const recoveryGroundedGuidance=await new Service(recoveryGroundedGuidanceGateway).conform({contract:groundedGuidanceContract,semanticFrame:groundedFrame,generation:protocolRecoveryGenerationFor('优先选测试款A，它的微阔腿版型更适合这个场景。',groundedGuidanceBindings)});
 check('protocol-recovered Canonical candidate reaches the same single classifier instead of failing for missing HVE_REPLY_V2 semantic units',recoveryGroundedGuidanceGateway.calls.length===1&&recoveryGroundedGuidance.accepted&&recoveryGroundedGuidance.trace.observedDecision==='CLASSIFIED'&&recoveryGroundedGuidance.trace.unitChecks[0].realizedActIds.includes('G1')&&recoveryGroundedGuidance.trace.unitChecks[0].realizedActIds.includes('A2'));

 const distributedRecommendationAct={id:'DG1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1','K2']}],parameters:{}};
 const distributedExplainAct={id:'DE1',type:'EXPLAIN_GROUNDED_FACT',necessity:'PREFERRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1','K2']}],parameters:{}};
 const distributedContract=contractFor([distributedRecommendationAct,distributedExplainAct]);
 const distributedFrame=semanticFrameFor([
   {id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'测试款A轻薄透气。',structuredData:null},
   {id:'K2',entityType:'PRODUCT',entityKey:'product-B',title:'测试款B',content:'测试款B垂坠明显。',structuredData:null},
 ]);
 const distributedBindings=[
   {actId:'DG1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1','K2']},
   {actId:'DE1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1','K2']},
 ];
 const distributedText='先给你两个方向：测试款A轻薄透气；测试款B垂坠明显。';
 const distributedEnvelope=(payload,unitActions)=>{
   const spans=[
     {unitId:'S0U0',exactText:'先给你两个方向：',contributionKind:'NON_PROPOSITIONAL_FRAGMENT',semanticTarget:'OTHER',taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
     {unitId:'S0U0',exactText:'测试款A轻薄透气；',contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['测试款A轻薄透气。']}],realizedGroundingRefs:['K1']},
     {unitId:'S0U0',exactText:'测试款B垂坠明显。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K2',excerpts:['测试款B垂坠明显。']}],realizedGroundingRefs:['K2']},
   ];
   void payload;
   return spanEnvelope(spans,unitActions);
 };
 const distributedGateway=gatewayFrom(payload=>distributedEnvelope(payload,[{unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[1,2],realizedGroundingRefs:['K1','K2']}]));
 const distributed=await new Service(distributedGateway).conform({contract:distributedContract,semanticFrame:distributedFrame,generation:protocolRecoveryGenerationFor(distributedText,distributedBindings)});
 check('semantic/output variance closure: discourse-level recommendation plus supported product facts realizes the same Required grounded recommendation without lexical or punctuation rules',
   distributed.accepted
   && distributed.trace.decision==='PASS'
   && distributed.generation.draft===distributedText
   && distributed.trace.unitChecks[0].realizedActIds.includes('DG1')
   && distributed.trace.unitChecks[0].unitGroundedActions?.[0]?.evidenceOwned===true
   && distributed.trace.unitChecks[0].unitGroundedActions?.[0]?.realizedActIds.includes('DG1')
   && distributed.trace.unitChecks[0].semanticSpans.some(span=>span.contributionKind==='NON_PROPOSITIONAL_FRAGMENT'&&span.realizedActIds.length===0));
 const distributedNoActionGateway=gatewayFrom(payload=>distributedEnvelope(payload,[]));
 const distributedNoAction=await new Service(distributedNoActionGateway).conform({contract:distributedContract,semanticFrame:distributedFrame,generation:protocolRecoveryGenerationFor(distributedText,distributedBindings)});
 check('plain grounded fact list cannot masquerade as recommendation when the single semantic owner reports no unit-level recommendation function',
   !distributedNoAction.accepted
   && distributedNoAction.trace.errorMessage==='CONFORMANCE_GROUNDED_BINDING_NOT_REALIZED'
   && !distributedNoAction.trace.unitChecks[0].realizedActIds.includes('DG1'));
 const distributedForgedActionGateway=gatewayFrom(payload=>distributedEnvelope(payload,[{unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[1,2],realizedGroundingRefs:['K1','K3']}]));
 const distributedForgedAction=await new Service(distributedForgedActionGateway).conform({contract:distributedContract,semanticFrame:distributedFrame,generation:protocolRecoveryGenerationFor(distributedText,distributedBindings)});
 check('unit-level recommendation cannot create Grounding: every declared ref must already be realized by authorized supported spans and the Canonical binding',
   !distributedForgedAction.accepted
   && distributedForgedAction.trace.errorMessage==='CONFORMANCE_GROUNDED_BINDING_NOT_REALIZED');

 const groupedChoiceText='先看测试款A，它正式场合不容易皱。如果更想要垂坠感，可以看测试款B。';
 const groupedChoiceGateway=gatewayFrom(payload=>{
   const unit=payload.generatedReplyUnits?.[0];
   const first='先看测试款A，它正式场合不容易皱。';
   const second='如果更想要垂坠感，可以看测试款B。';
   const firstClassification=completeClassification(classify(`${unit.unitId}A0`,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['测试款A轻薄透气。']}]}),payload);
   const secondClassification=completeClassification(classify(`${unit.unitId}A1`,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K2'],'FULLY_SUPPORTED',{groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K2',excerpts:['测试款B垂坠明显。']}]}),payload);
   const {atomId:firstAtomId,...firstWire}=firstClassification;
   const {atomId:secondAtomId,...secondWire}=secondClassification;
   void firstAtomId; void secondAtomId;
   return spanEnvelope([
     {unitId:unit.unitId,exactText:first,...firstWire},
     {unitId:unit.unitId,exactText:second,...secondWire},
   ],[
     {unitId:unit.unitId,groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['K1']},
     {unitId:unit.unitId,groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[1],realizedGroundingRefs:['K2']},
   ]);
 });
 const groupedChoice=await new Service(groupedChoiceGateway).conform({contract:distributedContract,semanticFrame:distributedFrame,generation:protocolRecoveryGenerationFor(groupedChoiceText,distributedBindings)});
 const groupedActions=groupedChoice.trace.unitChecks?.[0]?.unitGroundedActions||[];
 check('one unsupported merchant option is removed locally while an independent fully-supported recommendation group preserves the Required grounded recommendation',
   groupedChoice.accepted
   && groupedChoice.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && groupedChoice.trace.removals.length===1
   && !groupedChoice.generation.draft.includes('正式场合不容易皱')
   && groupedChoice.generation.draft.includes('如果更想要垂坠感，可以看测试款B。')
   && groupedChoice.trace.unitChecks[0].realizedActIds.includes('DG1')
   && groupedActions.length===2
   && groupedActions[0].refScopeOwned===true
   && groupedActions[0].evidenceOwned===false
   && groupedActions[0].realizedActIds.length===0
   && groupedActions[1].refScopeOwned===true
   && groupedActions[1].evidenceOwned===true
   && groupedActions[1].realizedActIds.includes('DG1'));

 const groupedChoiceForgedGateway=gatewayFrom(payload=>{
   const unit=payload.generatedReplyUnits?.[0];
   const spans=[
     {unitId:unit.unitId,exactText:'先看测试款A，它正式场合不容易皱。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['测试款A轻薄透气。']}],realizedGroundingRefs:['K1']},
     {unitId:unit.unitId,exactText:'如果更想要垂坠感，可以看测试款B。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K2',excerpts:['测试款B垂坠明显。']}],realizedGroundingRefs:['K2']},
   ];
   return spanEnvelope(spans,[
     {unitId:unit.unitId,groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['K1']},
     {unitId:unit.unitId,groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[1],realizedGroundingRefs:['K1','K2']},
   ]);
 });
 const groupedChoiceForged=await new Service(groupedChoiceForgedGateway).conform({contract:distributedContract,semanticFrame:distributedFrame,generation:protocolRecoveryGenerationFor(groupedChoiceText,distributedBindings)});
 check('action-group locality cannot borrow a sibling option ref to manufacture recommendation authority',
   !groupedChoiceForged.accepted
   && groupedChoiceForged.trace.decision==='UNPROVEN_PRESERVED'
   && groupedChoiceForged.trace.requiredValueCompletion?.status==='UNSATISFIED'
   && groupedChoiceForged.trace.errorMessage?.startsWith('CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:')
   && !groupedChoiceForged.generation.draft.includes('正式场合不容易皱'));

 const validSpanForgedGroupGateway=gatewayFrom(payload=>{
   const unit=payload.generatedReplyUnits?.[0];
   const span=completeClassification(classify(`${unit.unitId}A0`,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰微阔腿天丝混纺']}]}),payload);
   const {atomId,...wire}=span;
   void atomId;
   return spanEnvelope([{unitId:unit.unitId,exactText:unit.text,...wire}],[
     {unitId:unit.unitId,groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['K1','K3']},
   ]);
 });
 const validSpanForgedGroup=await new Service(validSpanForgedGroupGateway).conform({contract:groundedContract,semanticFrame:groundedFrame,generation:generationFor('优先选测试款A。',[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('unusable classifier action-group cannot veto an independently FULLY_SUPPORTED span-level recommendation',
   validSpanForgedGroup.accepted
   && validSpanForgedGroup.trace.decision==='PASS'
   && validSpanForgedGroup.trace.unitChecks[0].realizedActIds.includes('G1')
   && validSpanForgedGroup.trace.unitChecks[0].unitGroundedActions?.[0]?.refScopeOwned===false
   && validSpanForgedGroup.trace.unitChecks[0].unitGroundedActions?.[0]?.realizedActIds.length===0);

 const preferredGroundedAct={...groundedAct,necessity:'PREFERRED'};
 const recoveryPartialContract=contractFor([guidanceAct,preferredGroundedAct]);
 const recoveryPartialText='先按通用条件筛。测试款A一定不会闷。';
 const recoveryPartialGateway=gatewayFrom(payload=>classifyAll(payload,a=>explicitSpans(a,[
   {exactText:'先按通用条件筛。',classification:id=>classify(id,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')},
   {exactText:'测试款A一定不会闷。',classification:id=>classify(id,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'})},
 ])));
 const recoveryPartial=await new Service(recoveryPartialGateway).conform({contract:recoveryPartialContract,semanticFrame:groundedFrame,generation:protocolRecoveryGenerationFor(recoveryPartialText,groundedGuidanceBindings)});
 check('protocol-recovery candidate is only a Canonical ceiling: unsupported merchant outcome is removed while authorized general guidance survives',recoveryPartial.accepted&&recoveryPartial.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&recoveryPartial.generation.draft==='先按通用条件筛。'&&recoveryPartial.trace.removals.length===1&&recoveryPartial.trace.unitChecks[0].realizedActIds.includes('A2')&&!recoveryPartial.trace.unitChecks[0].realizedActIds.includes('G1'));

 const groundedPlainFactGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const groundedPlainFact=await new Service(groundedPlainFactGateway).conform({contract:groundedGuidanceContract,semanticFrame:groundedFrame,generation:generationFor('测试款A是高腰微阔腿天丝混纺。',groundedGuidanceBindings)});
 check('plain grounded merchant fact cannot masquerade as grounded recommendation or required General Guidance',!groundedPlainFact.accepted&&groundedPlainFact.trace.errorMessage==='CONFORMANCE_REQUIRED_ACT_NOT_REALIZED'&&groundedPlainFact.trace.unitChecks.length===1&&!groundedPlainFact.trace.unitChecks[0].realizedActIds.includes('G1')&&!groundedPlainFact.trace.unitChecks[0].realizedActIds.includes('A2')&&groundedPlainFact.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const unsupportedGroundedGuidanceGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K2'])));
 const unsupportedGroundedGuidance=await new Service(unsupportedGroundedGuidanceGateway).conform({contract:groundedGuidanceContract,semanticFrame:groundedFrame,generation:generationFor('优先选测试款A。',groundedGuidanceBindings)});
 check('grounded guidance overlap never authorizes unsupported Grounding evidence',!unsupportedGroundedGuidance.accepted&&unsupportedGroundedGuidance.trace.unitChecks.length===1&&unsupportedGroundedGuidance.trace.unitChecks[0].semanticSpans[0].authorized===false&&unsupportedGroundedGuidance.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const localityGroundedAct={id:'LG1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}};
 const localityGuidanceAct={id:'LA2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[],parameters:{}};
 const localityContract=contractFor([localityGuidanceAct,localityGroundedAct]);
 const localityFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'适合当前场景',structuredData:{fit:'A'}}]);
 const localityFirst='优先选测试款A，它更适合当前场景。';
 const localitySecond='这个差异可以作为辅助参考。';
 const localityGeneration=twoSegmentGeneration(localityFirst,localitySecond,[{actId:'LG1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}],[{actId:'LA2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'LG1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]);
 const localityGateway=gatewayFrom(payload=>classifyAll(payload,a=>a.unitId==='S0U0'
   ? explicitSpans(a,[
       {exactText:'优先选测试款A',classification:id=>classify(id,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION'})},
       {exactText:'，它更适合当前场景。',classification:id=>classify(id,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'})},
     ])
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'])));
 const locality=await new Service(localityGateway).conform({contract:localityContract,semanticFrame:localityFrame,generation:localityGeneration});
 check('reply-declared non-grounded Act may relocate to the Runtime atom that independently proves it',locality.accepted&&locality.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&locality.generation.draft===localityFirst&&locality.trace.unitChecks[0].semanticSpans.length===2&&locality.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true)&&locality.trace.unitChecks[0].realizedActIds.includes('LA2')&&locality.trace.unitChecks[0].realizedActIds.includes('LG1')&&locality.trace.unitChecks[1].realizedActIds.length===0&&locality.trace.removals.length===1&&locality.trace.removals[0].segmentIndex===1);
 check('post-Conformance correction validates surviving binding integrity without re-imposing deleted producer locality',locality.accepted&&locality.trace.errorMessage===null&&!locality.trace.violations.some(v=>v.reason==='HVE_REPLY_V2_REQUIRED_ACT_BINDING_MISSING'));

 const undeclaredOptionalGuidance={id:'OA2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'OPTIONAL',grounding:[]};
 const undeclaredOptionalContract=contractFor([act,undeclaredOptionalGuidance]);
 const undeclaredOptionalGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')));
 const undeclaredOptional=await new Service(undeclaredOptionalGateway).conform({contract:undeclaredOptionalContract,semanticFrame:frame,generation:generationFor('直接按能降低风险的方案处理。',answerBinding)});
 check('Runtime cannot create a non-grounded Act that the provider never declared anywhere in the reply',undeclaredOptional.accepted&&undeclaredOptional.trace.decision==='PASS'&&undeclaredOptional.trace.unitChecks[0].realizedActIds.includes('A1')&&!undeclaredOptional.trace.unitChecks[0].realizedActIds.includes('OA2'));

 const crossUnitContract=contractFor([{id:'CA2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'OPTIONAL',grounding:[]},{id:'CG1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}}]);
 const crossUnitGeneration=twoSegmentGeneration('这里也提到了测试款A。','真正的推荐是测试款A。',[{actId:'CA2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}],[{actId:'CG1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]);
 const crossUnitGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const crossUnit=await new Service(crossUnitGateway).conform({contract:crossUnitContract,semanticFrame:localityFrame,generation:crossUnitGeneration});
 check('Grounding authority stays unit-local even when another unit declares the matching grounded Act/ref',crossUnit.accepted&&crossUnit.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&crossUnit.trace.unitChecks[0].semanticSpans[0].authorized===false&&crossUnit.trace.unitChecks[0].semanticSpans[0].realizedGroundingRefs.length===0&&crossUnit.trace.unitChecks[1].realizedActIds.includes('CG1'));

 const groundedFactAct={id:'GF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}};
 const groundedFactContract=contractFor([groundedFactAct]);
 const surfaceAnswerGroundedGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'])));
 const surfaceAnswerGroundedText='测试款A是高腰微阔腿天丝混纺。';
 const surfaceAnswerGrounded=await new Service(surfaceAnswerGroundedGateway).conform({contract:groundedFactContract,semanticFrame:groundedFrame,generation:generationFor(surfaceAnswerGroundedText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('evidence-bearing substantive surface answer normalizes to grounded semantics without creating refs',surfaceAnswerGrounded.accepted&&surfaceAnswerGrounded.trace.decision==='PASS'&&surfaceAnswerGrounded.trace.unitChecks[0].semanticSpans[0].contributionKind==='GROUNDED_CONTENT'&&surfaceAnswerGrounded.trace.unitChecks[0].realizedGroundingRefs[0]==='K1');

 const ungroundedSurfaceAnswerGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK')));
 const ungroundedSurfaceAnswer=await new Service(ungroundedSurfaceAnswerGateway).conform({contract:groundedFactContract,semanticFrame:groundedFrame,generation:generationFor(surfaceAnswerGroundedText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('surface answer without classifier-realized evidence cannot inherit grounded authority',!ungroundedSurfaceAnswer.accepted&&ungroundedSurfaceAnswer.trace.errorMessage==='CONFORMANCE_GROUNDED_BINDING_NOT_REALIZED'&&ungroundedSurfaceAnswer.trace.unitChecks.length===1);


 const assessmentGuideAct={id:'AG1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const assessmentSplitContract=contractFor([groundedFactAct,assessmentGuideAct]);
 const assessmentSplitFrame=semanticFrameFor([
   {id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'微宽松版型',structuredData:{fit:'微宽松'}},
   {id:'KG1',entityType:'GUIDE',entityKey:'guide-fit',title:'活动余量判断原则',content:'判断活动余量时要看版型留量和面料弹性。',structuredData:null},
 ]);
 const assessmentFactText='测试款A是微宽松版型。';
 const assessmentGuidanceText='一般判断活动余量时，要看版型留量和面料弹性。';
 const assessmentSplitGateway=gatewayFrom(payload=>classifyAll(payload,a=>String(a.text||'').includes('测试款A')
   ? classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'})
   : classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')));
 const assessmentSplit=await new Service(assessmentSplitGateway).conform({
   contract:assessmentSplitContract,
   semanticFrame:assessmentSplitFrame,
   generation:twoUnitGeneration(
     assessmentFactText+assessmentGuidanceText,
     assessmentFactText,
     assessmentGuidanceText,
     [{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}],
     [{actId:'AG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}],
   ),
 });
 check('current-option assessment can realize grounded current-entity fact and independent general guidance as separate Required authorities',
   assessmentSplit.accepted
   && assessmentSplit.trace.decision==='PASS'
   && assessmentSplit.trace.unitChecks[0].realizedActIds.includes('GF1')
   && assessmentSplit.trace.unitChecks[1].realizedActIds.includes('AG1')
   && assessmentSplit.trace.unitChecks[1].semanticSpans.every(span=>span.realizedGroundingRefs.length===0));

 const preferredAssessmentGuideAct={id:'AGP',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'PREFERRED',grounding:[]};
 const assessmentMerchantBypassContract=contractFor([groundedFactAct,preferredAssessmentGuideAct]);
 const unsupportedAssessmentOutcome='测试款A抬手不会绷。';
 const assessmentMerchantBypassGateway=gatewayFrom(payload=>classifyAll(payload,a=>String(a.text||'').includes('微宽松')
   ? classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'})
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'})));
 const assessmentMerchantBypass=await new Service(assessmentMerchantBypassGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentSplitFrame,
   generation:twoUnitGeneration(
     assessmentFactText+unsupportedAssessmentOutcome,
     assessmentFactText,
     unsupportedAssessmentOutcome,
     [{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}],
     [{actId:'AGP',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}],
   ),
 });
 check('general-guidance authority cannot authorize an unsupported merchant-specific assessment outcome even when a relevant GUIDE is present',
   assessmentMerchantBypass.accepted
   && assessmentMerchantBypass.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && assessmentMerchantBypass.generation.draft===assessmentFactText
   && assessmentMerchantBypass.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const assessmentTypedContextFrame=structuredClone(assessmentSplitFrame);
 assessmentTypedContextFrame.humanTurnRealization={turnComposition:{semanticDelta:{responseTarget:{
   knowledgeRequirement:'BUSINESS_FACT_GROUNDING_REQUIRED',
   unresolvedNeed:'那它这种面料是不是就说明坐一天也不太容易皱？',
   evidence:['FACT_OWNERSHIP:CURRENT_BUSINESS_FACT','FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE','REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY','GROUNDING_ENTITY_MATCH:K1','UNRELATED_DIAGNOSTIC:SHOULD_NOT_TRANSPORT'],
 }}}};
 const assessmentEllipticalText='测试款A是微宽松版型。只是比棉麻好打理很多。一般判断抗皱还要看纤维比例和后整理。';
 const assessmentEllipticalGateway=gatewayFrom(payload=>{
   const context=payload.responseTargetContext||null;
   const currentEntityResolved=Boolean(context
     && context.knowledgeRequirement==='BUSINESS_FACT_GROUNDING_REQUIRED'
     && Array.isArray(context.evidence)
     && context.evidence.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY')
     && context.evidence.includes('GROUNDING_ENTITY_MATCH:K1'));
   return classifyAll(payload,a=>{
     const text=String(a.text||'');
     if(text.includes('微宽松版型')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE'});
     if(text.includes('只是比棉麻好打理很多')) return currentEntityResolved
       ? classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'INFERRED_OR_UNSUPPORTED'})
       : classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'NOT_REQUIRED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'});
     return classify(a.atomId,'GUIDANCE_CONTENT','TASK_OR_DOMAIN_FACT','SUPPORTS_CUSTOMER_TASK',[],'NOT_APPLICABLE',{evidenceRequirement:'NOT_REQUIRED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE'});
   });
 });
 const assessmentElliptical=await new Service(assessmentEllipticalGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentTypedContextFrame,
   generation:generationFor(assessmentEllipticalText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},{actId:'AGP',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}]),
 });
 const assessmentEllipticalPayload=JSON.parse(String(assessmentEllipticalGateway.calls[0]?.messages?.[1]?.content||'{}'));
 check('typed response-target referent context reaches the blind classifier without executable Authority',
   assessmentEllipticalPayload.responseTargetContext?.knowledgeRequirement==='BUSINESS_FACT_GROUNDING_REQUIRED'
   && assessmentEllipticalPayload.responseTargetContext?.evidence?.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY')
   && assessmentEllipticalPayload.responseTargetContext?.evidence?.includes('GROUNDING_ENTITY_MATCH:K1')
   && !assessmentEllipticalPayload.responseTargetContext?.evidence?.includes('UNRELATED_DIAGNOSTIC:SHOULD_NOT_TRANSPORT')
   && !('acts' in (assessmentEllipticalPayload.responseTargetContext||{}))
   && !('groundingRefs' in (assessmentEllipticalPayload.responseTargetContext||{})));
 check('elliptical current-item performance comparison cannot survive as NOT_REQUIRED general guidance while genuine general criteria remain',
   assessmentElliptical.accepted
   && assessmentElliptical.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && assessmentElliptical.generation.draft.includes('测试款A是微宽松版型')
   && !assessmentElliptical.generation.draft.includes('只是比棉麻好打理很多')
   && assessmentElliptical.generation.draft.includes('一般判断抗皱还要看纤维比例和后整理')
   && assessmentElliptical.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const splitAuthorityBindings=[
   {actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},
   {actId:'AGP',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},
 ];
 const fragmentSupportText='测试款A是微宽松版型，顺带说明一下，判断活动体验要看实际动作。';
 const fragmentSupportGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('测试款A')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
   if(text.includes('顺带说明一下')) return classify(a.atomId,'NON_PROPOSITIONAL_FRAGMENT','OTHER','SUPPORTS_CUSTOMER_TASK');
   return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK');
 }));
 const fragmentSupport=await new Service(fragmentSupportGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(fragmentSupportText,splitAuthorityBindings),
 });
 check('non-propositional fragment stays structural-neutral: it survives surface projection but creates no Act, fact, Grounding or completion authority',
   fragmentSupport.accepted
   && fragmentSupport.trace.decision==='PASS'
   && fragmentSupport.generation.draft===fragmentSupportText
   && fragmentSupport.trace.removals.length===0
   && fragmentSupport.trace.unitChecks[0].semanticSpans.some(span=>span.classifierResult?.contributionKind==='NON_PROPOSITIONAL_FRAGMENT'&&span.authorized===true&&span.realizedActIds.length===0&&span.realizedGroundingRefs.length===0)
   && fragmentSupport.trace.unitChecks[0].realizedActIds.includes('GF1')
   && fragmentSupport.trace.unitChecks[0].realizedActIds.includes('AGP'));

 const supportingOtherText='测试款A是微宽松版型，判断活动体验要看实际动作，这些属于体感。';
 const supportingOtherGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('测试款A')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
   if(text.includes('判断活动体验')) return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK');
   return classify(a.atomId,'OTHER_PROPOSITION','TASK_OR_DOMAIN_FACT','SUPPORTS_CUSTOMER_TASK');
 }));
 const supportingOther=await new Service(supportingOtherGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(supportingOtherText,splitAuthorityBindings),
 });
 check('non-grounded supporting OTHER proposition can be permission-reducing exact removal without vetoing independently proven Required content',
   supportingOther.accepted
   && supportingOther.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && supportingOther.generation.draft==='测试款A是微宽松版型，判断活动体验要看实际动作'
   && supportingOther.trace.removals.length===1
   && supportingOther.trace.removals[0].exactText==='，这些属于体感。'
   && supportingOther.trace.unitChecks[0].realizedActIds.includes('GF1')
   && supportingOther.trace.unitChecks[0].realizedActIds.includes('AGP'));

 const materialOtherGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('测试款A')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
   if(text.includes('判断活动体验')) return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK');
   return classify(a.atomId,'OTHER_PROPOSITION','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK');
 }));
 const materialOther=await new Service(materialOtherGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(supportingOtherText,splitAuthorityBindings),
 });
 check('material OTHER proposition remains whole-unit fail-closed and cannot be silently deleted',
   !materialOther.accepted
   && materialOther.trace.decision==='UNPROVEN_PRESERVED'
   && materialOther.trace.errorMessage==='CONFORMANCE_OTHER_PROPOSITION_ATOM_UNPROVEN'
   && materialOther.trace.removals.length===0
   && materialOther.generation.draft===supportingOtherText);

 const outcomeOtherGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('测试款A')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
   if(text.includes('判断活动体验')) return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK');
   return classify(a.atomId,'OTHER_PROPOSITION','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK');
 }));
 const outcomeOther=await new Service(outcomeOtherGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(supportingOtherText,splitAuthorityBindings),
 });
 check('outcome-shaped OTHER proposition remains fail-closed even when marked supporting',
   !outcomeOther.accepted
   && outcomeOther.trace.decision==='UNPROVEN_PRESERVED'
   && outcomeOther.trace.errorMessage==='CONFORMANCE_OTHER_PROPOSITION_ATOM_UNPROVEN'
   && outcomeOther.trace.removals.length===0);

 const partialKnownLiveShapeText='测试款A是微宽松版型，面料轻薄透气。但某种活动体验能否保证，这个现有信息推不出来，相关尺寸数据目前没有来源。能确认的是测试款A微宽松、轻薄透气。判断这类体验，要看实际活动幅度和环境条件，这些属于体感，不是现有面料参数能直接推出来的。';
 const partialKnownLiveGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('测试款A是微宽松版型')||text.includes('能确认的是测试款A')) {
     return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
   }
   if(text.includes('某种活动体验能否保证')) {
     return classify(a.atomId,'QUESTION_OR_SERVICE_ENTRY','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK');
   }
   if(text.includes('现有信息推不出来')) {
     return classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK');
   }
   if(text.includes('相关尺寸数据目前没有来源')) {
     return classify(a.atomId,'STATUS_OR_EXECUTION_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',[],'UNSUPPORTED',{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED'});
   }
   if(text.includes('判断这类体验')) {
     return classify(a.atomId,'NON_PROPOSITIONAL_FRAGMENT','OTHER','SUPPORTS_CUSTOMER_TASK');
   }
   if(text.includes('要看实际活动幅度和环境条件')) {
     return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK');
   }
   if(text.includes('这些属于体感')) {
     return classify(a.atomId,'OTHER_PROPOSITION','TASK_OR_DOMAIN_FACT','SUPPORTS_CUSTOMER_TASK');
   }
   return classify(a.atomId,'ANSWER_JUDGMENT','TASK_OR_DOMAIN_FACT','SUPPORTS_CUSTOMER_TASK');
 }));
 const partialKnownLiveShape=await new Service(partialKnownLiveGateway).conform({
   contract:assessmentMerchantBypassContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(partialKnownLiveShapeText,splitAuthorityBindings),
 });
 check('partial-known current-item reply preserves supported merchant facts plus independent judgment/guidance instead of degrading the whole turn',
   partialKnownLiveShape.accepted
   && partialKnownLiveShape.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && partialKnownLiveShape.trace.errorMessage===null
   && partialKnownLiveShape.trace.unitChecks[0].realizedActIds.includes('GF1')
   && partialKnownLiveShape.trace.unitChecks[0].realizedActIds.includes('AGP')
   && partialKnownLiveShape.generation.draft.includes('测试款A是微宽松版型')
   && partialKnownLiveShape.generation.draft.includes('这个现有信息推不出来')
   && partialKnownLiveShape.generation.draft.includes('要看实际活动幅度和环境条件')
   && !partialKnownLiveShape.generation.draft.includes('某种活动体验能否保证')
   && !partialKnownLiveShape.generation.draft.includes('相关尺寸数据目前没有来源')
   && !partialKnownLiveShape.generation.draft.includes('这些属于体感'));

 const partialSupportSplitText='判断久坐勒不勒，一般还要看腰头松紧和坐下后的受力；测试款A是微宽松版型，所以坐一整天一定不会勒。';
 const partialSupportSplitGateway=gatewayFrom(payload=>spanEnvelope([completeFixtureSupport({
   unitId:'S0U0',
   exactText:partialSupportSplitText,
   contributionKind:'GROUNDED_CONTENT',
   semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
   taskDependency:'MATERIAL_TO_CUSTOMER_TASK',
   evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
   merchantReferentRefs:['K1'],
   groundingEntailment:'PARTIALLY_SUPPORTED',
   groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',
   groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',
   groundingSupport:[{ref:'K1',excerpts:['微宽松版型']}],
   realizedGroundingRefs:['K1'],
   partialSupportSpans:[
     {exactText:'判断久坐勒不勒，一般还要看腰头松紧和坐下后的受力；',contributionKind:'GUIDANCE_CONTENT',semanticTarget:'TASK_OR_DOMAIN_FACT',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
     {exactText:'测试款A是微宽松版型，',contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['微宽松版型'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}],realizedGroundingRefs:['K1']},
     {exactText:'所以坐一整天一定不会勒。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'UNSUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'INFERRED_OR_UNSUPPORTED',groundingSupport:[],realizedGroundingRefs:[]},
   ],
 })]));
 const partialSupportSplit=await new Service(partialSupportSplitGateway).conform({
   contract:assessmentSplitContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(partialSupportSplitText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},{actId:'AG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}]),
 });
 check('single classifier partial-support subpartition preserves independent general guidance and supported merchant premise while removing only the unsupported current-item outcome',
   partialSupportSplit.accepted
   && partialSupportSplit.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && partialSupportSplit.trace.unitChecks[0].semanticSpans.length===3
   && partialSupportSplit.trace.unitChecks[0].semanticSpans[0].authorized===true
   && partialSupportSplit.trace.unitChecks[0].semanticSpans[0].realizedActIds.includes('AG1')
   && partialSupportSplit.trace.unitChecks[0].semanticSpans[1].authorized===true
   && partialSupportSplit.trace.unitChecks[0].semanticSpans[1].realizedActIds.includes('GF1')
   && partialSupportSplit.trace.unitChecks[0].semanticSpans[2].authorized===false
   && partialSupportSplit.generation.draft==='判断久坐勒不勒，一般还要看腰头松紧和坐下后的受力；测试款A是微宽松版型，');

 const partialDecompInseparableText='测试款A的微宽松版型坐一整天一定不会勒。';
 const partialDecompInseparableGateway=gatewayFrom(payload=>spanEnvelope([completeFixtureSupport({
   unitId:'S0U0',exactText:partialDecompInseparableText,contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['微宽松版型']}],realizedGroundingRefs:['K1'],partialSupportSpans:[],
 })]));
 const partialDecompInseparable=await new Service(partialDecompInseparableGateway).conform({
   contract:groundedFactContract,
   semanticFrame:assessmentSplitFrame,
   generation:generationFor(partialDecompInseparableText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}]),
 });
 check('inseparable PARTIALLY_SUPPORTED proposition keeps the old whole-span fail-closed behavior when no valid subpartition exists',
   !partialDecompInseparable.accepted
   && partialDecompInseparable.trace.decision==='UNPROVEN_PRESERVED'
   && partialDecompInseparable.generation.draft===partialDecompInseparableText);

 const malformedPartialSplitText='判断久坐体感要看腰头松紧；测试款A坐一天一定不会勒。';
 const malformedPartialSplitGateway=gatewayFrom(payload=>spanEnvelope([completeFixtureSupport({
   unitId:'S0U0',exactText:malformedPartialSplitText,contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['微宽松版型']}],realizedGroundingRefs:['K1'],partialSupportSpans:[
     {exactText:'判断久坐体感要看腰头松紧；',contributionKind:'GUIDANCE_CONTENT',semanticTarget:'TASK_OR_DOMAIN_FACT',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
   ],
 })]));
 const malformedPartialSplit=await new Service(malformedPartialSplitGateway).conform({contract:assessmentSplitContract,semanticFrame:assessmentSplitFrame,generation:generationFor(malformedPartialSplitText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},{actId:'AG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}])});
 check('malformed optional partial-support subpartition cannot create authority or a new protocol-failure path and falls back to the original whole-parent fail-closed behavior',
   !malformedPartialSplit.accepted
   && malformedPartialSplit.trace.decision==='UNPROVEN_PRESERVED'
   && malformedPartialSplit.trace.observedDecision==='CLASSIFIED'
   && malformedPartialSplit.generation.draft===malformedPartialSplitText
   && malformedPartialSplit.trace.removals.length===0
   && malformedPartialSplit.trace.unitChecks[0].semanticSpans.length===1
   && malformedPartialSplit.trace.unitChecks[0].semanticSpans[0].classifierResult?.groundingEntailment==='PARTIALLY_SUPPORTED');

 const groupedPartialText='可以优先选测试款A，因为它是微宽松版型，所以坐一天一定不会勒。';
 const groupedPartialGateway=gatewayFrom(payload=>spanEnvelope([completeFixtureSupport({
   unitId:'S0U0',exactText:groupedPartialText,contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['微宽松版型']}],realizedGroundingRefs:['K1'],partialSupportSpans:[
     {exactText:'可以优先选测试款A，因为它是微宽松版型，',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['微宽松版型'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}],realizedGroundingRefs:['K1']},
     {exactText:'所以坐一天一定不会勒。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'UNSUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'INFERRED_OR_UNSUPPORTED',groundingSupport:[],realizedGroundingRefs:[]},
   ],
 })],[{unitId:'S0U0',groundedActionRole:'CHOICE_OR_RECOMMENDATION',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',spanIndexes:[0],realizedGroundingRefs:['K1']}]));
 const groupedPartial=await new Service(groupedPartialGateway).conform({contract:groundedContract,semanticFrame:groundedFrame,generation:generationFor(groupedPartialText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('partial-support refinement is disabled inside a unit carrying a grounded recommendation action-group so frozen group indexes/locality cannot be reinterpreted',
   !groupedPartial.accepted
   && groupedPartial.trace.unitChecks[0].semanticSpans.length===1
   && groupedPartial.trace.unitChecks[0].semanticSpans[0].classifierResult?.groundingEntailment==='PARTIALLY_SUPPORTED');

 const factualEntailmentText='测试款A是高腰微阔腿天丝混纺。它的微阔腿版型透气不闷，坐一天也不会黏腿。';
 const factualEntailmentGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED')
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'})));
 const factualEntailment=await new Service(factualEntailmentGateway).conform({contract:groundedFactContract,semanticFrame:groundedFrame,generation:generationFor(factualEntailmentText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 const factualOutcomeSpans=factualEntailment.trace.unitChecks[0].semanticSpans.slice(1);
 check('whole-atom entailment keeps supported grounded fact and removes every isolated unsupported product-outcome clause',factualEntailment.accepted&&factualEntailment.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&factualEntailment.generation.draft==='测试款A是高腰微阔腿天丝混纺。'&&factualEntailment.trace.removals.length===2&&factualEntailment.trace.removals.map(r=>r.atomId).join(',')==='S0U0A1,S0U0A2');
 check('partial merchant-fact entailment cannot borrow valid ref authority for any unsupported proposition clause',factualEntailment.trace.unitChecks[0].semanticSpans[0].classifierResult?.groundingEntailment==='FULLY_SUPPORTED'&&factualOutcomeSpans.length===2&&factualOutcomeSpans.every(span=>span.classifierResult?.groundingEntailment==='PARTIALLY_SUPPORTED'&&span.authorized===false&&span.violationCode==='GROUNDED_EVIDENCE_UNSUPPORTED')&&factualEntailment.trace.violations.filter(v=>v.reason.includes('ENTAILMENT=PARTIALLY_SUPPORTED')).length===2);

 const groundedClauseText='可以优先选测试款A，高腰微阔腿，面料中薄带垂坠，夏天坐办公室一定不会闷。';
 const groundedClauseGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION'})
   : i<3
     ? classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED')
     : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'})));
 const groundedClauseFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'高腰微阔腿；面料中薄带垂坠',structuredData:{fit:['高腰','微阔腿'],fabric:['中薄','垂坠']}}]);
 const groundedClause=await new Service(groundedClauseGateway).conform({contract:groundedContract,semanticFrame:groundedClauseFrame,generation:generationFor(groundedClauseText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 const groundedClausePayload=JSON.parse(String(groundedClauseGateway.calls[0].messages[1].content));
 check('grounded Runtime topology isolates comma-separated propositions without changing HVE units',groundedClausePayload.generatedReplyUnits.length===1&&groundedClausePayload.generatedReplyUnits[0].text===groundedClauseText);
 check('isolated unsupported grounded outcome is exactly removable while required recommendation and supported descriptive facts survive',groundedClause.accepted&&groundedClause.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&groundedClause.generation.draft==='可以优先选测试款A，高腰微阔腿，面料中薄带垂坠'&&groundedClause.trace.removals.length===1&&groundedClause.trace.removals[0].exactText==='，夏天坐办公室一定不会闷。'&&groundedClause.trace.unitChecks[0].realizedActIds.includes('G1')&&groundedClause.trace.unitChecks[0].semanticSpans[1].authorized===true&&groundedClause.trace.unitChecks[0].semanticSpans[2].authorized===true);

 const topicFrameText='测试款A是微宽松版型。久坐这块，测试款A面料轻薄，坐一天一定不会闷。';
 const topicFrameGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('坐一天一定不会闷')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',[],'UNSUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'});
   return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
 }));
 const topicFrameDirectFactFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'微宽松版型；面料轻薄',structuredData:{fit:'微宽松',fabric:'轻薄'}}]);
 const topicFrameResult=await new Service(topicFrameGateway).conform({contract:groundedFactContract,semanticFrame:topicFrameDirectFactFrame,generation:generationFor(topicFrameText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 const topicFramePayload=JSON.parse(String(topicFrameGateway.calls[0].messages[1].content));
 const topicFrameUnits=topicFramePayload.generatedReplyUnits.map(a=>String(a.text||''));
 check('non-propositional demonstrative topic frame stays attached to its following proposition instead of becoming a standalone OTHER_PROPOSITION-shaped atom',
   topicFrameUnits.some(text=>text.includes('久坐这块，测试款A面料轻薄'))
   && !topicFrameUnits.some(text=>text.trim()==='久坐这块'));
 check('topic-frame topology lets Conformance remove only the unsupported full proposition while preserving independently grounded neighboring facts',
   topicFrameResult.accepted
   && topicFrameResult.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && topicFrameResult.generation.draft==='测试款A是微宽松版型。久坐这块，测试款A面料轻薄'
   && topicFrameResult.trace.removals.length===1);

 const perspectiveTopicText='对于连续坐着来说，测试款A面料轻薄，坐一天一定不会闷。';
 const perspectiveTopicGateway=gatewayFrom(payload=>classifyAll(payload,a=>String(a.text||'').includes('坐一天一定不会闷')
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',[],'UNSUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'})
   : classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'})));
 const perspectiveTopic=await new Service(perspectiveTopicGateway).conform({contract:groundedFactContract,semanticFrame:topicFrameDirectFactFrame,generation:generationFor(perspectiveTopicText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 const perspectivePayload=JSON.parse(String(perspectiveTopicGateway.calls[0].messages[1].content));
 check('explicit perspective topic-frame paraphrase also stays attached for exactly one soft boundary',
   perspectivePayload.generatedReplyUnits.length===1 && perspectivePayload.generatedReplyUnits[0]?.text===perspectiveTopicText
   && perspectiveTopic.accepted
   && perspectiveTopic.generation.draft==='对于连续坐着来说，测试款A面料轻薄');

 const substantiveLookalikeText='这一点已经确认，后续仍需复核。';
 const substantiveLookalikeGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'OTHER_PROPOSITION','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK')
   : classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'})));
 const substantiveLookalike=await new Service(substantiveLookalikeGateway).conform({contract:groundedFactContract,semanticFrame:groundedFrame,generation:generationFor(substantiveLookalikeText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 const substantivePayload=JSON.parse(String(substantiveLookalikeGateway.calls[0].messages[1].content));
 check('substantive lookalike remains independently atomized and coherent OTHER_PROPOSITION stays fail-closed',
   substantivePayload.generatedReplyUnits.length===1
   && substantivePayload.generatedReplyUnits[0].text===substantiveLookalikeText
   && !substantiveLookalike.accepted
   && substantiveLookalike.trace.errorMessage==='CONFORMANCE_OTHER_PROPOSITION_ATOM_UNPROVEN');

 const seamText='测试款A的基础属性已确认。\n\n不过还有一个代价，测试款A会有自然轻微褶皱。';
 const seamGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('不过还有一个代价')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',[],'UNSUPPORTED',{groundedActionRole:'RISK_OR_OTHER_OUTCOME'});
   return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
 }));
 const seamFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'基础属性已确认；会有自然轻微褶皱',structuredData:null}]);
 const seamResult=await new Service(seamGateway).conform({contract:groundedFactContract,semanticFrame:seamFrame,generation:generationFor(seamText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 const seamPayload=JSON.parse(String(seamGateway.calls[0].messages[1].content));
 check('exact-span removal never invents replacement paragraph bytes after deleting an unauthorized paragraph lead',
   seamPayload.generatedReplyUnits.length===1 && seamPayload.generatedReplyUnits[0].text===seamText
   && seamResult.accepted
   && seamResult.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && seamResult.generation.draft==='测试款A的基础属性已确认。测试款A会有自然轻微褶皱。'
   && !seamResult.generation.draft.includes('不过还有一个代价'), `${seamResult.trace.errorMessage||''} | ${seamResult.generation.draft} | removals=${JSON.stringify(seamResult.trace.removals)}`);

 const anchoredFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'青禾「测试款A」通勤西裤',content:'高腰微阔腿；面料中薄带垂坠；适合夏季通勤和办公室',structuredData:{fit:['高腰','微阔腿'],fabric:['中薄','垂坠'],occasions:['夏季通勤','办公室']}}]);
 const anchoredLead='先按版型和面料筛。';
 const anchoredRecommendation='\n\n如果更看重垂坠感和包容度，可以看「测试款A」通勤西裤——高腰微阔腿，面料中薄带垂坠，夏天坐办公室一定不会闷。';
 const anchoredGeneration=twoUnitGeneration(
   anchoredLead+anchoredRecommendation,
   anchoredLead,
   anchoredRecommendation,
   [{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}],
   [{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}],
 );
 const anchoredGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('先按版型和面料筛')) return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK');
   if(text.includes('如果更看重垂坠感和包容度')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED');
   if(text.includes('面料中薄带垂坠')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED');
   return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE'});
 }));
 const anchoredRecommendationResult=await new Service(anchoredGateway).conform({contract:groundedGuidanceContract,semanticFrame:anchoredFrame,generation:anchoredGeneration});
 const anchoredPayload=JSON.parse(String(anchoredGateway.calls[0].messages[1].content));
 const anchoredUnits=anchoredPayload.generatedReplyUnits.map(a=>String(a.text||''));
 check('leading HVE formatting glue never becomes a standalone semantic atom',anchoredUnits.every(text=>text.trim().length>0)&&anchoredUnits.join('')===anchoredLead+anchoredRecommendation);
 check('bound canonical title suffix keeps preference lead attached to the independently-provable recommendation proposition',anchoredUnits.some(text=>text.startsWith('\n\n如果更看重垂坠感和包容度，可以看「测试款A」通勤西裤——高腰微阔腿'))&&!anchoredUnits.some(text=>text.trim()==='如果更看重垂坠感和包容度'));
 check('title-anchored recommendation still isolates later unsupported outcome for exact removal',anchoredRecommendationResult.accepted&&anchoredRecommendationResult.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&anchoredRecommendationResult.generation.draft==='先按版型和面料筛。\n\n如果更看重垂坠感和包容度，可以看「测试款A」通勤西裤——高腰微阔腿，面料中薄带垂坠'&&anchoredRecommendationResult.trace.removals.length===1&&anchoredRecommendationResult.trace.removals[0].exactText==='，夏天坐办公室一定不会闷。'&&anchoredRecommendationResult.trace.unitChecks[1].realizedActIds.includes('G1'));
 check('title anchoring cannot make a plain grounded merchant fact satisfy recommendation by itself',misboundGroundedFact.accepted===false&&!misboundGroundedFact.trace.unitChecks[0].realizedActIds.includes('G1'));

 const colonRecommendationText='青禾「测试款A」通勤西裤就比较对路：高腰微阔腿，面料中薄带垂坠。';
 const colonRecommendationGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('就比较对路')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS'});
   return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'});
 }));
 const colonRecommendation=await new Service(colonRecommendationGateway).conform({contract:groundedContract,semanticFrame:anchoredFrame,generation:generationFor(colonRecommendationText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 const colonPayload=JSON.parse(String(colonRecommendationGateway.calls[0].messages[1].content));
 const colonUnits=colonPayload.generatedReplyUnits.map(a=>String(a.text||''));
 check('immutable HVE unit stays intact while model-owned semantic spans isolate recommendation from colon support',colonUnits.length===1&&colonUnits[0]===colonRecommendationText&&colonRecommendation.trace.unitChecks[0].semanticSpans.length===3&&colonRecommendation.trace.unitChecks[0].semanticSpans[0].exactText==='青禾「测试款A」通勤西裤就比较对路'&&colonRecommendation.trace.unitChecks[0].semanticSpans[1].exactText==='：高腰微阔腿');
 check('colon-shaped grounded recommendation realizes Required recommendation while directly-supported follow-on attributes survive',colonRecommendation.accepted&&colonRecommendation.trace.decision==='PASS'&&colonRecommendation.generation.draft===colonRecommendationText&&colonRecommendation.trace.unitChecks[0].realizedActIds.includes('G1')&&colonRecommendation.trace.unitChecks[0].semanticSpans.every(span=>span.authorized));

 const groundedFactColonAct={id:'GF_COLON',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}};
 const groundedFactColonContract=contractFor([groundedFactColonAct]);
 const groundedFactColonText='青禾「测试款A」通勤西裤成分：80%棉。';
 const groundedFactColonGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE'})));
 const groundedFactColonFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'青禾「测试款A」通勤西裤',content:'成分80%棉',structuredData:{composition:'80%棉'}}]);
 const groundedFactColon=await new Service(groundedFactColonGateway).conform({contract:groundedFactColonContract,semanticFrame:groundedFactColonFrame,generation:generationFor(groundedFactColonText,[{actId:'GF_COLON',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 const groundedFactColonPayload=JSON.parse(String(groundedFactColonGateway.calls[0].messages[1].content));
 const groundedFactColonUnits=groundedFactColonPayload.generatedReplyUnits.map(a=>String(a.text||''));
 check('ordinary grounded fact label:value topology is not split by the recommendation-only colon rule',groundedFactColonUnits.length===1&&groundedFactColonUnits[0]===groundedFactColonText&&groundedFactColon.accepted&&groundedFactColon.trace.decision==='PASS');

 const primaryGuidanceAct={id:'PG1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const primaryRecommendAct={id:'PR1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}};
 const primaryOrderContract=contractFor([primaryGuidanceAct,primaryRecommendAct]);
 primaryOrderContract.orchestrationPlan.interactionPlanV2.answerObligation={responseTarget:{focus:'RECOMMENDATION'}};
 const guidanceFirstSegments=[{text:'先看版型。更推荐测试款A。',units:[
   {text:'先看版型。',usedGroundingRefs:[],bindings:[{actId:'PG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}]},
   {text:'更推荐测试款A。',usedGroundingRefs:['K1'],bindings:[{actId:'PR1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]},
 ]}];
 const recommendationFirstSegments=[{text:'更推荐测试款A。再按版型细看。',units:[
   {text:'更推荐测试款A。',usedGroundingRefs:['K1'],bindings:[{actId:'PR1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]},
   {text:'再按版型细看。',usedGroundingRefs:[],bindings:[{actId:'PG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}]},
 ]}];
 check('primary recommendation protocol rejects supporting guidance as the first substantive unit when a grounded Required recommendation is executable',generatorExports.validateHveReplyV2CanonicalBindings(primaryOrderContract,guidanceFirstSegments)==='HVE_REPLY_V2_PRIMARY_REQUIRED_RECOMMENDATION_NOT_FIRST_SUBSTANTIVE_UNIT');
 check('primary recommendation protocol accepts the grounded recommendation as the first substantive unit and allows supporting guidance after it',generatorExports.validateHveReplyV2CanonicalBindings(primaryOrderContract,recommendationFirstSegments)===null);
 const questionFirstSegments=[{text:'你更偏直筒还是修身？更推荐测试款A。',units:[
   {text:'你更偏直筒还是修身？',usedGroundingRefs:[],bindings:[{actId:'PQ1',actType:'REQUEST_OPTIONAL_PREFERENCE',groundingRefs:[]}]},
   {text:'更推荐测试款A。',usedGroundingRefs:['K1'],bindings:[{actId:'PR1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]},
 ]}];
 const questionFirstContract=contractFor([primaryGuidanceAct,primaryRecommendAct,{id:'PQ1',type:'REQUEST_OPTIONAL_PREFERENCE',necessity:'PREFERRED',grounding:[]}]);
 questionFirstContract.orchestrationPlan.interactionPlanV2.answerObligation={responseTarget:{focus:'RECOMMENDATION'}};
 check('executable primary recommendation cannot be delayed by an optional preference question',generatorExports.validateHveReplyV2CanonicalBindings(questionFirstContract,questionFirstSegments)==='HVE_REPLY_V2_PRIMARY_REQUIRED_RECOMMENDATION_NOT_FIRST_SUBSTANTIVE_UNIT');
 const noGroundedPrimaryContract=contractFor([primaryGuidanceAct]);
 noGroundedPrimaryContract.orchestrationPlan.interactionPlanV2.answerObligation={responseTarget:{focus:'RECOMMENDATION'}};
 const noGroundedSegments=[{text:'先按版型和面料筛。',units:[{text:'先按版型和面料筛。',usedGroundingRefs:[],bindings:[{actId:'PG1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}]}]}];
 check('primary recommendation ordering does not manufacture a shop-item recommendation when no Required grounded candidate exists',generatorExports.validateHveReplyV2CanonicalBindings(noGroundedPrimaryContract,noGroundedSegments)===null);


 const inconsistentAxisText='可以优先选测试款A，夏天坐办公室不会闷。';
 const inconsistentAxisGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION'})
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS'})));
 const inconsistentAxis=await new Service(inconsistentAxisGateway).conform({contract:groundedContract,semanticFrame:groundedFrame,generation:generationFor(inconsistentAxisText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('semantic-axis inconsistency is fail-closed at Runtime instead of becoming protocol-invalid non-veto preservation',inconsistentAxis.accepted&&inconsistentAxis.trace.observedDecision==='CLASSIFIED'&&inconsistentAxis.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&inconsistentAxis.generation.draft==='可以优先选测试款A'&&inconsistentAxis.trace.removals.length===1&&inconsistentAxis.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('BASIS=SUPPORTED_CHOICE_SYNTHESIS')));

 const overboundLeft='先按版型筛。';
 const overboundRight='可以优先选测试款A。';
 const overboundGeneration=twoUnitGeneration(overboundLeft+overboundRight,overboundLeft,overboundRight,[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}],[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]);
 const overboundGateway=gatewayFrom(payload=>classifyAll(payload,a=>String(a.text||'').includes('先按版型')
   ? classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK')
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION'})));
 const overbound=await new Service(overboundGateway).conform({contract:groundedGuidanceContract,semanticFrame:groundedFrame,generation:overboundGeneration});
 const overboundLeftBindings=overbound.generation.structuredSegments?.[0]?.semanticUnits?.[0]?.bindings||[];
 check('unused grounded producer candidate is narrowed when Required grounded recommendation is independently proven elsewhere',overbound.accepted&&overbound.trace.decision==='PASS'&&overbound.trace.unitChecks[0].realizedActIds.includes('A2')&&!overbound.trace.unitChecks[0].realizedActIds.includes('G1')&&overbound.trace.unitChecks[1].realizedActIds.includes('G1')&&overboundLeftBindings.length===1&&overboundLeftBindings[0].actId==='A2');

 const witnessFrame=semanticFrameFor([
   {id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'适合夏季通勤和办公室',structuredData:{occasions:['夏季通勤','办公室']}},
   {id:'K2',entityType:'PRODUCT',entityKey:'product-B',title:'测试款B',content:'明确透气且不闷',structuredData:{performance:['透气','不闷']}},
 ]);
 const witnessAct={id:'WF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1','K2']}],parameters:{}};
 const witnessContract=contractFor([witnessAct]);
 const witnessBinding=[{actId:'WF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1','K2']}];
 const borrowedWitnessGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['明确透气且不闷']}]})));
 const borrowedWitness=await new Service(borrowedWitnessGateway).conform({contract:witnessContract,semanticFrame:witnessFrame,generation:generationFor('测试款A明确透气且不闷。',witnessBinding)});
 check('same-ref evidence witness blocks cross-product source borrowing even when the classifier returns a locally allowed ref',!borrowedWitness.accepted&&borrowedWitness.trace.unitChecks[0].semanticSpans[0].authorized===false&&borrowedWitness.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('WITNESS=INVALID')));

 const sameRefScenarioFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'高腰微阔腿；面料中薄带垂坠；适合夏季通勤和办公室',structuredData:{fit:['高腰','微阔腿'],fabric:['中薄','垂坠'],occasions:['夏季通勤','办公室']}}]);
 const sameRefScenarioText='可以优先选测试款A，夏天在办公室穿不会闷。';
 const sameRefScenarioGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['高腰微阔腿']} ]})
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室']}]})));
 const sameRefScenario=await new Service(sameRefScenarioGateway).conform({contract:groundedContract,semanticFrame:sameRefScenarioFrame,generation:generationFor(sameRefScenarioText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('typed entailment rejects same-ref scenario evidence that only partially supports a comfort/performance outcome',sameRefScenario.accepted&&sameRefScenario.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&sameRefScenario.generation.draft==='可以优先选测试款A'&&sameRefScenario.trace.removals.length===1&&sameRefScenario.trace.removals[0].exactText==='，夏天在办公室穿不会闷。'&&sameRefScenario.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('ENTAILMENT=PARTIALLY_SUPPORTED')));

 const falsePositiveDirectSourceGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}]})));
 const falsePositiveDirectSource=await new Service(falsePositiveDirectSourceGateway).conform({contract:groundedFactContract,semanticFrame:sameRefScenarioFrame,generation:generationFor('测试款A夏天坐办公室整体偏舒服、不容易闷。',[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('typed source-predicate proof vetoes a classifier FULLY_SUPPORTED false positive when suitability evidence is weaker than a comfort/performance claim',!falsePositiveDirectSource.accepted&&falsePositiveDirectSource.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('WITNESS_TYPED=INCOMPATIBLE')));

 const directSuitabilityRecommendationGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}]})));
 const directSuitabilityRecommendation=await new Service(directSuitabilityRecommendationGateway).conform({contract:groundedContract,semanticFrame:sameRefScenarioFrame,generation:generationFor('测试款A夏天办公室穿挺合适。',[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('directly sourced suitability may support recommendation framing for the same concrete option without becoming performance authority',directSuitabilityRecommendation.accepted&&directSuitabilityRecommendation.trace.decision==='PASS'&&directSuitabilityRecommendation.trace.unitChecks[0].realizedActIds.includes('G1')&&directSuitabilityRecommendation.trace.unitChecks[0].semanticSpans[0].authorizationChecks.groundingCompatible===true);

 const performanceChoiceContract=contractFor([{id:'PC1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K2']}],parameters:{}}]);
 const performanceSourceAsDirectChoiceGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K2'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K2',excerpts:['明确透气且不闷'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'PERFORMANCE_OR_EXPERIENCE'}]})));
 const performanceSourceAsDirectChoice=await new Service(performanceSourceAsDirectChoiceGateway).conform({contract:performanceChoiceContract,semanticFrame:witnessFrame,generation:generationFor('优先选测试款B。',[{actId:'PC1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K2']}])});
 check('DIRECT_SOURCE does not gain a generic performance-to-recommendation bridge',!performanceSourceAsDirectChoice.accepted&&performanceSourceAsDirectChoice.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('WITNESS_TYPED=INCOMPATIBLE')));

 const postCorrectionValueFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'面料中薄、垂坠、微弹，适合夏季通勤和办公室场景；不是冰丝，也不是纯天然面料；聚酯68%、粘胶27%、氨纶5%',structuredData:{occasions:['夏季通勤','办公室'],material:{polyester:'68%',viscose:'27%',spandex:'5%'}}}]);
 const postCorrectionValueText='测试款A夏天坐办公室穿，方向上是舒服的、不容易闷。它不是冰丝，也不是纯天然面料，成分是聚酯68%、粘胶27%、氨纶5%。';
 const postCorrectionValueGateway=gatewayFrom(payload=>{
   const specs=[
     {exactText:'测试款A夏天坐办公室穿，方向上是舒服的、不容易闷。',classification:classify('S0U0A0','GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}]})},
     {exactText:'它不是冰丝，也不是纯天然面料，成分是聚酯68%、粘胶27%、氨纶5%。',classification:classify('S0U0A1','GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['不是冰丝，也不是纯天然面料','聚酯68%'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}]})},
   ];
   return spanEnvelope(specs.map(spec=>{const{atomId,...rest}=completeFixtureSupport(spec.classification);return{unitId:'S0U0',exactText:spec.exactText,...rest};}));
 });
 const postCorrectionValue=await new Service(postCorrectionValueGateway).conform({contract:groundedFactContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(postCorrectionValueText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('supporting grounded facts cannot masquerade as the Required task-material answer after unsafe primary removal',
   !postCorrectionValue.accepted
   && postCorrectionValue.trace.decision==='UNPROVEN_PRESERVED'
   && postCorrectionValue.trace.errorMessage?.startsWith('CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:')
   && postCorrectionValue.generation.draft==='它不是冰丝，也不是纯天然面料，成分是聚酯68%、粘胶27%、氨纶5%。'
   && postCorrectionValue.trace.removals.length===1
   && postCorrectionValue.trace.violations.some(v=>v.code==='REQUIRED_ACT_NOT_REALIZED'&&v.reason.includes('CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1')),
   `${postCorrectionValue.trace.errorMessage||''} | accepted=${postCorrectionValue.accepted} | draft=${postCorrectionValue.generation.draft} | removals=${JSON.stringify(postCorrectionValue.trace.removals)} | violations=${JSON.stringify(postCorrectionValue.trace.violations)}`);
 check('support-only merchant residue records typed Required-value incompleteness instead of silently becoming plan completion',
   postCorrectionValue.trace.requiredValueCompletion?.status==='UNSATISFIED'
   && postCorrectionValue.trace.requiredValueCompletion.missingRequiredActIds.length===1
   && postCorrectionValue.trace.requiredValueCompletion.missingRequiredActIds[0]==='GF1');

 const postCorrectionHybridContract={
   ...groundedFactContract,
   orchestrationPlan:{...groundedFactContract.orchestrationPlan,interactionPlanV2:{
     ...groundedFactContract.orchestrationPlan.interactionPlanV2,
     acts:[groundedFactAct,guidanceAct],
     answerObligation:{responseTarget:{unresolvedNeed:'测试款A从早穿到晚会不会闷或者扎皮肤？'}},
   }},
 };
 const postCorrectionHybridBindings=[
   {actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},
   {actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},
 ];
 const unsafeHybridText='测试款A从早穿到晚肯定不会闷。';
 const safeHybridGuidance='如果皮肤比较敏感，可以加一件薄的纯棉打底来减少直接摩擦。';
 const safeHybridSupport='它是轻薄透气路线，成分信息可以作为选购参考。';
 function postCorrectionHybridGateway(taskDependency='MATERIAL_TO_CUSTOMER_TASK',contributionKind='GUIDANCE_CONTENT',semanticTarget='ACTION_OPTION_RISK_OR_OUTCOME'){
   return gatewayFrom(payload=>spanEnvelope([
     {unitId:'S0U0',exactText:unsafeHybridText,contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}],realizedGroundingRefs:['K1']},
     {unitId:'S0U0',exactText:safeHybridGuidance,contributionKind,semanticTarget,taskDependency,evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
     {unitId:'S0U0',exactText:safeHybridSupport,contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹','聚酯68%'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}],realizedGroundingRefs:['K1']},
   ]));
 }
 const postCorrectionHybridText=unsafeHybridText+safeHybridGuidance+safeHybridSupport;
 const postCorrectionHybrid=await new Service(postCorrectionHybridGateway()).conform({contract:postCorrectionHybridContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(postCorrectionHybridText,postCorrectionHybridBindings)});
 check('post-correction normal continuation keeps an independently authorized task-material general contribution while the unsupported merchant performance proposition stays removed',
   postCorrectionHybrid.accepted
   && postCorrectionHybrid.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && postCorrectionHybrid.trace.requiredValueCompletion?.status==='PARTIAL_SAFE_CONTINUATION'
   && postCorrectionHybrid.trace.requiredValueCompletion.missingRequiredActIds.includes('GF1')
   && postCorrectionHybrid.trace.errorMessage?.startsWith('CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:')
   && postCorrectionHybrid.trace.removals.length===1
   && postCorrectionHybrid.trace.removals[0].exactText===unsafeHybridText
   && !postCorrectionHybrid.generation.draft.includes(unsafeHybridText)
   && postCorrectionHybrid.generation.draft.includes(safeHybridGuidance)
   && postCorrectionHybrid.generation.draft.includes(safeHybridSupport)
   && postCorrectionHybrid.trace.unitChecks[0].semanticSpans.some(span=>span.exactText===safeHybridGuidance&&span.authorized===true&&span.realizedActIds.includes('A2')),
   `${postCorrectionHybrid.trace.errorMessage||''} | accepted=${postCorrectionHybrid.accepted} | completion=${JSON.stringify(postCorrectionHybrid.trace.requiredValueCompletion)} | draft=${postCorrectionHybrid.generation.draft}`);

 const supportingOnlyContinuation=await new Service(postCorrectionHybridGateway('SUPPORTS_CUSTOMER_TASK')).conform({contract:postCorrectionHybridContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(postCorrectionHybridText,postCorrectionHybridBindings)});
 check('supporting-only general advice cannot convert missing Required merchant task value into normal partial continuation',
   !supportingOnlyContinuation.accepted
   && supportingOnlyContinuation.trace.decision==='UNPROVEN_PRESERVED'
   && supportingOnlyContinuation.trace.requiredValueCompletion?.status==='UNSATISFIED');

 const unsupportedOnlyMerchantText='测试款A坐一天办公室一定不会勒。';
 const supportingOnlySafeGuidance='没法确认实际压感时，可以先看腰头结构、可调节余量和自己的腰围余量，再决定是否值得尝试。';
 const supportingOnlyRecoveryText=unsupportedOnlyMerchantText+supportingOnlySafeGuidance;
 const supportingOnlyRecoveryGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:unsupportedOnlyMerchantText,contributionKind:'ANSWER_JUDGMENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:supportingOnlySafeGuidance,contributionKind:'GUIDANCE_CONTENT',semanticTarget:'TASK_OR_DOMAIN_FACT',taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
 ]));
 const supportingOnlyRecovery=await new Service(supportingOnlyRecoveryGateway).conform({contract:postCorrectionHybridContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(supportingOnlyRecoveryText,postCorrectionHybridBindings)});
 check('REMOVE path performs exact correction before Required-value failure when the only merchant task-material proposition is unsupported',
   !supportingOnlyRecovery.accepted
   && supportingOnlyRecovery.trace.decision==='UNPROVEN_PRESERVED'
   && supportingOnlyRecovery.trace.requiredValueCompletion?.status==='UNSATISFIED'
   && supportingOnlyRecovery.trace.errorMessage?.startsWith('CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:')
   && supportingOnlyRecovery.trace.removals.length===1
   && supportingOnlyRecovery.trace.removals[0].exactText===unsupportedOnlyMerchantText
   && supportingOnlyRecovery.generation.draft===supportingOnlySafeGuidance
   && !supportingOnlyRecovery.generation.draft.includes(unsupportedOnlyMerchantText),
   `${supportingOnlyRecovery.trace.errorMessage||''} | accepted=${supportingOnlyRecovery.accepted} | draft=${supportingOnlyRecovery.generation.draft} | removals=${JSON.stringify(supportingOnlyRecovery.trace.removals)}`);

 const optionalHybridContract={...postCorrectionHybridContract,orchestrationPlan:{...postCorrectionHybridContract.orchestrationPlan,interactionPlanV2:{...postCorrectionHybridContract.orchestrationPlan.interactionPlanV2,acts:[groundedFactAct,{...guidanceAct,necessity:'OPTIONAL'}]}}};
 const optionalOnlyContinuation=await new Service(postCorrectionHybridGateway()).conform({contract:optionalHybridContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(postCorrectionHybridText,postCorrectionHybridBindings)});
 check('an Optional general-help Act cannot upgrade a missing Required merchant answer into normal partial continuation',
   !optionalOnlyContinuation.accepted
   && optionalOnlyContinuation.trace.requiredValueCompletion?.status!=='PARTIAL_SAFE_CONTINUATION');

 const questionOnlyContinuation=await new Service(postCorrectionHybridGateway('MATERIAL_TO_CUSTOMER_TASK','QUESTION_OR_SERVICE_ENTRY','CUSTOMER_SITUATION_FACT')).conform({contract:postCorrectionHybridContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(postCorrectionHybridText,postCorrectionHybridBindings)});
 check('question/service-entry content cannot masquerade as the independent task-material value needed for normal partial continuation',
   !questionOnlyContinuation.accepted
   && questionOnlyContinuation.trace.requiredValueCompletion?.status!=='PARTIAL_SAFE_CONTINUATION');

 const relationshipOnlyContinuation=await new Service(postCorrectionHybridGateway('INDEPENDENT_OF_CUSTOMER_TASK','RECEPTION_ACK','RELATIONSHIP_OR_CONVERSATION')).conform({contract:postCorrectionHybridContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(postCorrectionHybridText,postCorrectionHybridBindings)});
 check('relationship/reception content cannot masquerade as independent task-material value after merchant proposition removal',
   !relationshipOnlyContinuation.accepted
   && relationshipOnlyContinuation.trace.requiredValueCompletion?.status!=='PARTIAL_SAFE_CONTINUATION');

 const boundaryContinuationContract={...postCorrectionHybridContract,orchestrationPlan:{...postCorrectionHybridContract.orchestrationPlan,interactionPlanV2:{...postCorrectionHybridContract.orchestrationPlan.interactionPlanV2,acts:[groundedFactAct,boundaryOnlyAct]}}};
 const boundaryContinuationBindings=[
   {actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']},
   {actId:'B1',actType:'EXPLAIN_BOUNDARY',groundingRefs:[]},
 ];
 const safeBoundary='现有资料不足以把穿一天不闷当成确定结果。';
 const boundaryContinuationGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:unsafeHybridText,contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:safeBoundary,contributionKind:'BOUNDARY_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]},
   {unitId:'S0U0',exactText:safeHybridSupport,contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹','聚酯68%'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}],realizedGroundingRefs:['K1']},
 ]));
 const boundaryContinuationText=unsafeHybridText+safeBoundary+safeHybridSupport;
 const boundaryOnlyPostCorrection=await new Service(boundaryContinuationGateway).conform({contract:boundaryContinuationContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(boundaryContinuationText,boundaryContinuationBindings)});
 check('a Required evidence-boundary statement by itself cannot certify normal partial continuation after the merchant answer is removed',
   !boundaryOnlyPostCorrection.accepted
   && boundaryOnlyPostCorrection.trace.decision==='UNPROVEN_PRESERVED'
   && boundaryOnlyPostCorrection.trace.requiredValueCompletion?.status==='UNSATISFIED');


 const semanticSubstitutionContract={...groundedFactContract,orchestrationPlan:{...groundedFactContract.orchestrationPlan,interactionPlanV2:{...groundedFactContract.orchestrationPlan.interactionPlanV2,answerObligation:{responseTarget:{unresolvedNeed:'这条商品久坐会不会舒服、不闷？'}}}}};
 const semanticSubstitutionText='测试款A夏天坐办公室穿是合适的。久坐不太容易闷。';
 const semanticSubstitutionGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'测试款A夏天坐办公室穿是合适的。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:'久坐不太容易闷。',contributionKind:'ANSWER_JUDGMENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT'}],realizedGroundingRefs:['K1']},
 ]));
 const semanticSubstitution=await new Service(semanticSubstitutionGateway).conform({contract:semanticSubstitutionContract,semanticFrame:postCorrectionValueFrame,generation:generationFor(semanticSubstitutionText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('post-correction completion cannot let surviving suitability semantics masquerade as a removed performance/experience answer',
   !semanticSubstitution.accepted
   && semanticSubstitution.trace.decision==='UNPROVEN_PRESERVED'
   && semanticSubstitution.generation.draft==='测试款A夏天坐办公室穿是合适的。'
   && semanticSubstitution.trace.errorMessage?.includes('CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:GF1:ACTION_OPTION_RISK_OR_OUTCOME|PERFORMANCE_OR_EXPERIENCE')
   && semanticSubstitution.trace.removals.length===1,
   `${semanticSubstitution.trace.errorMessage||''} | accepted=${semanticSubstitution.accepted} | draft=${semanticSubstitution.generation.draft}`);

 const sameSemanticCompletionFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'官方资料明确说明透气、不闷',structuredData:{performance:['透气','不闷']}}]);
 const sameSemanticCompletionText='测试款A官方资料明确说明透气、不闷。久坐十小时也绝对不会闷。';
 const sameSemanticCompletionGateway=gatewayFrom(payload=>spanEnvelope([
   {unitId:'S0U0',exactText:'测试款A官方资料明确说明透气、不闷。',contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['官方资料明确说明透气、不闷'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'PERFORMANCE_OR_EXPERIENCE'}],realizedGroundingRefs:['K1']},
   {unitId:'S0U0',exactText:'久坐十小时也绝对不会闷。',contributionKind:'ANSWER_JUDGMENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:['K1'],groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['官方资料明确说明透气、不闷'],sourceSemanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',sourceGroundedActionRole:'PERFORMANCE_OR_EXPERIENCE'}],realizedGroundingRefs:['K1']},
 ]));
 const sameSemanticCompletion=await new Service(sameSemanticCompletionGateway).conform({contract:semanticSubstitutionContract,semanticFrame:sameSemanticCompletionFrame,generation:generationFor(sameSemanticCompletionText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('post-correction completion remains satisfied when an independently supported task-material proposition with the same performance semantic role survives',
   sameSemanticCompletion.accepted
   && sameSemanticCompletion.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'
   && sameSemanticCompletion.generation.draft==='测试款A官方资料明确说明透气、不闷。'
   && sameSemanticCompletion.trace.removals.length===1,
   `${sameSemanticCompletion.trace.errorMessage||''} | accepted=${sameSemanticCompletion.accepted} | draft=${sameSemanticCompletion.generation.draft}`);

 const merchantPredicateExtensionFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'面料中薄、垂坠、微弹，适合夏季通勤和办公室场景',structuredData:{fabric:['中薄','垂坠','微弹'],occasions:['夏季通勤','办公室']}}]);
 const merchantPredicateExtensionText='可以优先选测试款A，中薄垂坠微弹的面料也适合夏季办公室和商务休闲场合。';
 const merchantPredicateExtensionGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹','适合夏季通勤和办公室场景']}]})
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹，适合夏季通勤和办公室场景']}]}) ));
 const merchantPredicateExtension=await new Service(merchantPredicateExtensionGateway).conform({contract:groundedContract,semanticFrame:merchantPredicateExtensionFrame,generation:generationFor(merchantPredicateExtensionText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('typed entailment rejects same-ref adjacent evidence that only partially supports a broader suitability predicate',merchantPredicateExtension.accepted&&merchantPredicateExtension.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&merchantPredicateExtension.generation.draft==='可以优先选测试款A'&&merchantPredicateExtension.trace.removals.length===1&&merchantPredicateExtension.trace.removals[0].exactText==='，中薄垂坠微弹的面料也适合夏季办公室和商务休闲场合。'&&merchantPredicateExtension.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('ENTAILMENT=PARTIALLY_SUPPORTED')));

 const suitabilityParaphraseFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'适合夏季通勤和办公室场景',structuredData:{occasions:['夏季通勤','办公室']}}]);
 const suitabilityParaphraseText='测试款A夏天办公室穿挺合适。';
 const suitabilityParaphraseGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景']}]})));
 const suitabilityParaphrase=await new Service(suitabilityParaphraseGateway).conform({contract:groundedFactContract,semanticFrame:suitabilityParaphraseFrame,generation:generationFor(suitabilityParaphraseText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('typed FULLY_SUPPORTED DIRECT_SOURCE suitability paraphrase survives without a second surface/lexical veto',suitabilityParaphrase.accepted&&suitabilityParaphrase.trace.decision==='PASS'&&suitabilityParaphrase.generation.draft===suitabilityParaphraseText&&suitabilityParaphrase.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true&&span.classifierResult?.groundedActionRole==='SUITABILITY_OR_DECISION_SUPPORT'));

 const descriptiveParaphraseFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'肩线自然，非紧身收腰版；可折叠收纳',structuredData:{fit:['肩线自然','非紧身收腰版'],storage:['可折叠收纳']}}]);
 const descriptiveParaphraseAct={id:'DP1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}],parameters:{}};
 const descriptiveParaphraseContract=contractFor([descriptiveParaphraseAct]);
 const descriptiveParaphraseText='测试款A不是那种紧身收腰的版型，还能折叠收纳。';
 const descriptiveParaphraseGateway=gatewayFrom(payload=>classifyAll(payload,a=>String(a.text||'').includes('折叠收纳')
   ? classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['可折叠收纳']}]})
   : classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['非紧身收腰版']}]})
 ));
 const descriptiveParaphrase=await new Service(descriptiveParaphraseGateway).conform({contract:descriptiveParaphraseContract,semanticFrame:descriptiveParaphraseFrame,generation:generationFor(descriptiveParaphraseText,[{actId:'DP1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('descriptive DIRECT_SOURCE semantic paraphrases survive without a second lexical Authority',descriptiveParaphrase.accepted&&descriptiveParaphrase.trace.decision==='PASS'&&descriptiveParaphrase.generation.draft===descriptiveParaphraseText&&descriptiveParaphrase.trace.unitChecks[0].semanticSpans.length===2&&descriptiveParaphrase.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true&&span.classifierResult?.semanticTarget==='MERCHANT_ENTITY_OR_POLICY'&&span.classifierResult?.groundingBasis==='DIRECT_SOURCE'));

 const liveShapeFrame=semanticFrameFor([
   {id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'高腰微阔腿；适合夏季通勤和办公室',structuredData:{fit:['高腰','微阔腿'],occasions:['夏季通勤','办公室']}},
   {id:'K2',entityType:'PRODUCT',entityKey:'product-B',title:'测试款B',content:'高腰修身；适合办公室通勤',structuredData:{fit:['高腰','修身'],occasions:['办公室通勤']}},
 ]);
 const liveShapeGeneralAct={id:'A2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const liveShapeRecommendAct={id:'G1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1','K2']}],parameters:{}};
 const liveShapeContract=contractFor([liveShapeGeneralAct,liveShapeRecommendAct]);
 const liveShapeParts=['先按版型和面料筛。','可以优先选测试款A，高腰微阔腿，夏天在办公室穿不会闷。','也可以看看测试款B，高腰修身。'];
 const liveShapeGeneration=threeSegmentGeneration(liveShapeParts,[
   [{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}],
   [{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}],
   [{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K2']}],
 ]);
 const liveShapeGateway=gatewayFrom(payload=>classifyAll(payload,a=>{
   const text=String(a.text||'');
   if(text.includes('先按版型和面料筛')) return classify(a.atomId,'GUIDANCE_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK');
   if(text.includes('可以优先选测试款A')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['高腰微阔腿']} ]});
   if(text.includes('夏天在办公室穿不会闷')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室']} ]});
   if(text.includes('高腰微阔腿')) return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰微阔腿']} ]});
   if(text.includes('也可以看看测试款B')) return classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K2'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K2',excerpts:['高腰修身']} ]});
   return classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K2'],'FULLY_SUPPORTED',{groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K2',excerpts:['高腰修身']} ]});
 }));
 const liveShape=await new Service(liveShapeGateway).conform({contract:liveShapeContract,semanticFrame:liveShapeFrame,generation:liveShapeGeneration});
 const liveShapeFirstBindings=liveShape.generation.structuredSegments?.[0]?.semanticUnits?.[0]?.bindings||[];
 check('Fresh-Live-shaped closure simultaneously narrows surplus P001 candidate, preserves P001/P007 recommendations, and removes the unsupported P001 outcome',liveShape.accepted&&liveShape.trace.decision==='REMOVED_UNAUTHORIZED_SPANS'&&liveShape.generation.draft==='先按版型和面料筛。\n\n可以优先选测试款A，高腰微阔腿\n\n也可以看看测试款B，高腰修身。'&&liveShape.trace.removals.length===1&&liveShapeFirstBindings.length===1&&liveShapeFirstBindings[0].actId==='A2'&&liveShape.trace.unitChecks[1].realizedGroundingRefs.includes('K1')&&liveShape.trace.unitChecks[2].realizedGroundingRefs.includes('K2'));

 const directPerformanceFrame=semanticFrameFor([{id:'K1',entityType:'PRODUCT',entityKey:'product-A',title:'测试款A',content:'官方资料明确说明：透气，不闷。',structuredData:{performance:['透气','不闷']}}]);
 const directPerformanceGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['官方资料明确说明：透气，不闷。']}]})));
 const directPerformance=await new Service(directPerformanceGateway).conform({contract:groundedFactContract,semanticFrame:directPerformanceFrame,generation:generationFor('测试款A透气，不闷。',[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('directly sourced product performance remains authorized without a lexical comfort blacklist',directPerformance.accepted&&directPerformance.trace.decision==='PASS'&&directPerformance.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true)&&directPerformance.trace.unitChecks[0].semanticSpans.every(span=>span.classifierResult?.groundingBasis==='DIRECT_SOURCE'));

 const performanceBridgeText='可以优先选测试款A，官方资料明确说明透气不闷。';
 const performanceBridgeGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'SUPPORTED_CHOICE_SYNTHESIS',groundingSupport:[{ref:'K1',excerpts:['测试款A']} ]})
   : classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED',{groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['官方资料明确说明：透气，不闷。']}]})));
 const performanceBridge=await new Service(performanceBridgeGateway).conform({contract:groundedContract,semanticFrame:directPerformanceFrame,generation:generationFor(performanceBridgeText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 check('performance follow-on can survive a proven recommendation only with DIRECT_SOURCE evidence owned by the same ref',performanceBridge.accepted&&performanceBridge.trace.decision==='PASS'&&performanceBridge.trace.unitChecks[0].semanticSpans.length===2&&performanceBridge.trace.unitChecks[0].semanticSpans.every(span=>span.authorized===true));

 const protocolScaleText='可以优先选测试款A，高腰微阔腿，面料中薄带垂坠，腰臀留量足，裤腿不贴腿，颜色稳重，线条利落，日常好搭，办公室场景适用，版型简洁，整体偏通勤。';
 const protocolScaleGateway=gatewayFrom(payload=>classifyAll(payload,(a,i)=>i===0
   ? classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED')
   : classify(a.atomId,'GROUNDED_CONTENT','MERCHANT_ENTITY_OR_POLICY','SUPPORTS_CUSTOMER_TASK',['K1'],'FULLY_SUPPORTED')));
 await new Service(protocolScaleGateway).conform({contract:groundedContract,semanticFrame:groundedFrame,generation:generationFor(protocolScaleText,[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}])});
 const protocolScalePayload=JSON.parse(String(protocolScaleGateway.calls[0].messages[1].content));
 check('classifier response budget scales from proposition-capable source size rather than the old /32 text proxy while staying within the existing gateway ceiling',protocolScaleGateway.calls.length===1&&protocolScalePayload.generatedReplyUnits.length===1&&protocolScalePayload.generatedReplyUnits[0].text===protocolScaleText&&protocolScaleGateway.calls[0].maxTokens>=2500&&protocolScaleGateway.calls[0].maxTokens<=4000);

 const longProtocolScaleText=protocolScaleText+' 同时还要说明已确认材质、版型、适用场景和限制条件，并把不同事实与体验判断分开表达，不能让一个较长但正常的单元因为分类 JSON 预算不足直接截断。';
 const longProtocolScaleGateway=gatewayFrom(payload=>spanEnvelope((payload.generatedReplyUnits||[]).map(unit=>({unitId:unit.unitId,exactText:String(unit.text||''),contributionKind:'ANSWER_CONTENT',semanticTarget:'TASK_OR_DOMAIN_FACT',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[]}))));
 await new Service(longProtocolScaleGateway).conform({contract,semanticFrame:frame,generation:generationFor(longProtocolScaleText,answerBinding)});
 check('long ordinary HVE unit receives the full existing 4000-token single-call envelope instead of reproducing the 1984-token truncation class',longProtocolScaleGateway.calls.length===1&&longProtocolScaleGateway.calls[0].maxTokens===4000);

 const plainCommaGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_CONTENT','TASK_OR_DOMAIN_FACT','MATERIAL_TO_CUSTOMER_TASK')));
 const plainComma=await new Service(plainCommaGateway).conform({contract,semanticFrame:frame,generation:generationFor('先看实际条件，再给一般判断。',answerBinding)});
 const plainCommaPayload=JSON.parse(String(plainCommaGateway.calls[0].messages[1].content));
 check('non-grounded units keep the existing sentence-level Runtime topology',plainComma.accepted&&plainCommaPayload.generatedReplyUnits.length===1&&plainCommaPayload.generatedReplyUnits[0].text==='先看实际条件，再给一般判断。');

 const unsupportedJudgmentGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'ANSWER_JUDGMENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',[],'UNSUPPORTED')));
 const unsupportedJudgment=await new Service(unsupportedJudgmentGateway).conform({contract:groundedFactContract,semanticFrame:groundedFrame,generation:generationFor('测试款A坐一天一定不会闷。',[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('ungrounded judgment cannot bypass EXPLAIN_GROUNDED_FACT when entity-specific proposition is unsupported',!unsupportedJudgment.accepted&&unsupportedJudgment.trace.decision==='UNPROVEN_PRESERVED'&&!unsupportedJudgment.trace.unitChecks[0].realizedActIds.includes('GF1')&&unsupportedJudgment.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));

 const inseparablePartialGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId,'GROUNDED_CONTENT','ACTION_OPTION_RISK_OR_OUTCOME','MATERIAL_TO_CUSTOMER_TASK',['K1'],'PARTIALLY_SUPPORTED')));
 const inseparablePartialText='测试款A是高腰微阔腿天丝混纺，所以坐一天一定不会闷。';
 const inseparablePartial=await new Service(inseparablePartialGateway).conform({contract:groundedFactContract,semanticFrame:groundedFrame,generation:generationFor(inseparablePartialText,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}])});
 check('inseparable partially-supported required atom is NOT PASS and preserves non-empty Generation when safe correction would erase Required Grounded binding',!inseparablePartial.accepted&&inseparablePartial.trace.decision==='UNPROVEN_PRESERVED'&&inseparablePartial.generation.draft===inseparablePartialText&&inseparablePartial.trace.errorMessage==='CONFORMANCE_CORRECTED_DRAFT_EMPTY'&&inseparablePartial.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED')&&inseparablePartial.trace.violations.some(v=>v.code==='CONFORMANCE_PROTOCOL_ERROR'&&v.reason==='CONFORMANCE_CORRECTED_DRAFT_EMPTY'));

 // Raw provider-shaped envelopes deliberately bypass classifyAll/completeClassification:
 // those helpers fill witness data and cannot detect a missing nested wire contract.
 const rawWitnessContract=contractFor([act,groundedFactAct]);
 const rawGuidance='先比较版型与厚度。';const rawFact='测试款A是高腰微阔腿天丝混纺。';
 const rawWitnessGeneration=twoSegmentGeneration(rawGuidance,rawFact,answerBinding,[{actId:'GF1',actType:'EXPLAIN_GROUNDED_FACT',groundingRefs:['K1']}]);
 const rawWitnessResponse=(payload,support)=>JSON.stringify({version:'HVE_SEMANTIC_SPANS_V4',spans:payload.generatedReplyUnits.map(a=>a.unitId.startsWith('S0')?{
   unitId:a.unitId,exactText:a.text,contributionKind:'ANSWER_CONTENT',semanticTarget:'TASK_OR_DOMAIN_FACT',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',merchantReferentRefs:[],groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[],
 }:{unitId:a.unitId,exactText:a.text,contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',merchantReferentRefs:[],groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:support,realizedGroundingRefs:['K1']})});
 const rawGoodGateway=gatewayFrom(payload=>rawWitnessResponse(payload,[{ref:'K1',excerpts:['高腰微阔腿天丝混纺'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}]));
 const rawGood=await new Service(rawGoodGateway).conform({contract:rawWitnessContract,semanticFrame:groundedFrame,generation:rawWitnessGeneration});
 check('raw nonempty source witness preserves known facts and general answer without helper enrichment',rawGood.accepted&&rawGood.generation.draft===rawWitnessGeneration.draft&&rawGood.trace.unitChecks.some(u=>u.realizedActIds.includes('GF1')));
 check('model receives explicit nonempty witness keys and nested required-field schema',String(rawGoodGateway.calls[0].messages[0].content).includes('\"required\":[\"ref\",\"excerpts\",\"sourceSemanticTarget\",\"sourceGroundedActionRole\"]')&&String(rawGoodGateway.calls[0].messages[0].content).includes('Non-empty groundingSupport MUST'));
 for(const malformed of [null,[{ref:'K1',quote:'高腰微阔腿天丝混纺'}],[{excerpts:['高腰微阔腿天丝混纺']}],[{ref:'K1',excerpts:[]}],[{ref:'K1',excerpts:[123]}],[{ref:'K1',excerpts:['高腰微阔腿天丝混纺']},{ref:'K1',excerpts:['高腰微阔腿天丝混纺']}]]){
   const rawBadGateway=gatewayFrom(payload=>rawWitnessResponse(payload,malformed));
   const rawBad=await new Service(rawBadGateway).conform({contract:rawWitnessContract,semanticFrame:groundedFrame,generation:rawWitnessGeneration});
   const spans=rawBad.trace.unitChecks.flatMap(u=>u.semanticSpans);
   check(`malformed witness isolates atom without authorizing, deleting or losing valid answer: ${JSON.stringify(malformed)}`,!rawBad.accepted&&rawBad.trace.observedDecision==='CLASSIFIED'&&spans.some(s=>s.authorized&&s.exactText===rawGuidance)&&spans.some(s=>!s.authorized&&s.classifierResult.witnessProtocolError)&&!spans.some(s=>s.realizedActIds.includes('GF1'))&&rawBad.generation.draft===rawWitnessGeneration.draft&&rawBadGateway.calls.length===1);
 }
 const rawForgedGateway=gatewayFrom(payload=>rawWitnessResponse(payload,[{ref:'K1',excerpts:['不存在的来源内容'],sourceSemanticTarget:'MERCHANT_ENTITY_OR_POLICY',sourceGroundedActionRole:'NOT_APPLICABLE'}]));
 const rawForged=await new Service(rawForgedGateway).conform({contract:rawWitnessContract,semanticFrame:groundedFrame,generation:rawWitnessGeneration});
 check('well-formed forged witness still cannot authorize a fact',!rawForged.accepted&&rawForged.trace.unitChecks.every(u=>!u.realizedActIds.includes('GF1')));
 const maliciousGateway=gatewayFrom(payload=>JSON.stringify({version:'HVE_SEMANTIC_SPANS_V4',spans:payload.generatedReplyUnits.map(a=>{const{atomId,...rest}=classify(`${a.unitId}A0`);return{unitId:a.unitId,exactText:a.text,startOffset:0,...rest};})}));
 const malicious=await new Service(maliciousGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('classifier attempts to regain offsets/exactText are rejected and original Generation is preserved',!malicious.accepted&&malicious.trace.observedDecision==='INVALID_RESPONSE'&&malicious.generation.draft===passText);

 const splitText='这是一个完整句子。';const splitGeneration=twoUnitGeneration(splitText,'这是一个','完整句子。',answerBinding,answerBinding);
 const splitGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId)));
 const split=await new Service(splitGateway).conform({contract,semanticFrame:frame,generation:splitGeneration});
 check('HVE semantic units own immutable outer boundaries while classifier owns proposition partition',split.accepted&&split.trace.decision==='PASS'&&splitGateway.calls.length===1&&JSON.parse(String(splitGateway.calls[0].messages[1].content)).generatedReplyUnits.map(a=>a.text).join('')===splitText&&JSON.parse(String(splitGateway.calls[0].messages[1].content)).generatedReplyUnits.length===2);

 const secondAct={id:'A2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]};
 const missingBindingContract=contractFor([act,secondAct]);const missingBindingGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId)));
 const missingBinding=await new Service(missingBindingGateway).conform({contract:missingBindingContract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('missing Required Act binding remains strict and is caught before Conformance model call',!missingBinding.accepted&&missingBinding.trace.decision==='UNPROVEN_PRESERVED'&&missingBinding.trace.errorMessage==='HVE_REPLY_V2_REQUIRED_ACT_BINDING_MISSING'&&missingBindingGateway.calls.length===0&&missingBinding.generation.draft===passText);

 const invalidGateway=gatewayFrom(()=> 'not-json');const invalid=await new Service(invalidGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('invalid classifier protocol remains diagnostic-only/non-veto with no retry',!invalid.accepted&&invalid.trace.decision==='UNPROVEN_PRESERVED'&&invalid.trace.observedDecision==='INVALID_RESPONSE'&&invalid.generation.draft===passText&&invalidGateway.calls.length===1);
 check('invalid classifier diagnostics expose the first protocol parse reason and request budget without raw model content',String(invalid.trace.errorMessage||'').includes('reason=JSON_PARSE_ERROR')&&String(invalid.trace.errorMessage||'').includes('atoms=1')&&String(invalid.trace.errorMessage||'').includes('requestedMaxTokens=1200'));
 const wireFields=['contributionKind','semanticTarget','taskDependency','evidenceRequirement','groundingEntailment','groundedActionRole','groundingBasis'];
 const formattingGateway=gatewayFrom(payload=>classifyAll(payload,a=>{const item=classify(a.atomId);for(const field of wireFields)item[field]=' \t'+item[field].toLowerCase()+'\r\n';return item;}));
 const formatting=await new Service(formattingGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('ASCII enum formatting alone preserves valid semantics, original text and one classifier call',formatting.accepted&&formatting.trace.decision==='PASS'&&formatting.generation.draft===passText&&formattingGateway.calls.length===1);
 for(const field of wireFields){
   const unknownGateway=gatewayFrom(payload=>classifyAll(payload,a=>({...classify(a.atomId),[field]:'UNKNOWN_WIRE_LABEL'})));
   const unknown=await new Service(unknownGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
   check(`unknown ${field} is diagnosed and never converted to semantic authority`,!unknown.accepted&&unknown.trace.observedDecision==='INVALID_RESPONSE'&&unknown.generation.draft===passText&&unknown.trace.unitChecks.length===0&&String(unknown.trace.errorMessage).includes('UNKNOWN_WIRE_LABEL')&&unknownGateway.calls.length===1);
 }
 for(const badTarget of ['PERFORMANCE_OR_EXPERIENCE',['TASK_OR_DOMAIN_FACT'],null,'TASK OR DOMAIN FACT','客户敏感原文']){
   const badGateway=gatewayFrom(payload=>classifyAll(payload,a=>({...classify(a.atomId),semanticTarget:badTarget})));
   const bad=await new Service(badGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
   check(`cross-axis, non-string and free-text labels stay invalid: ${JSON.stringify(badTarget)}`,!bad.accepted&&bad.trace.observedDecision==='INVALID_RESPONSE'&&bad.generation.draft===passText&&!String(bad.trace.errorMessage).includes('客户敏感原文'));
 }
 const wireSystem=String(formattingGateway.calls[0].messages[0].content);
 const wireVocabulary=JSON.parse(wireSystem.slice(wireSystem.lastIndexOf('Closed wire vocabulary')).split(': ').slice(1).join(': '));
 check('classifier receives closed field-specific vocabulary without Act ids or executable boundaries',wireFields.every(field=>Array.isArray(wireVocabulary[field])&&wireVocabulary[field].length>0)&&wireVocabulary.semanticTarget.includes('TASK_OR_DOMAIN_FACT')&&!wireVocabulary.semanticTarget.includes('PERFORMANCE_OR_EXPERIENCE')&&!Object.keys(wireVocabulary).some(key=>['actId','startOffset','authorized'].includes(key)));
 const truncatedGateway=gatewayFrom(payload=>classifyAll(payload,a=>classify(a.atomId)),{truncated:true,finishReason:'length',usage:{completionTokens:1200},requestedMaxTokens:1200,effectiveMaxTokens:1200});
 const truncated=await new Service(truncatedGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('non-empty length-truncated classifier output is never trusted as a complete semantic envelope',!truncated.accepted&&truncated.trace.observedDecision==='INVALID_RESPONSE'&&String(truncated.trace.errorMessage||'').includes('reason=CLASSIFIER_OUTPUT_TRUNCATED')&&String(truncated.trace.errorMessage||'').includes('finish=length')&&truncated.generation.draft===passText&&truncatedGateway.calls.length===1);
 const unavailableGateway=gatewayFrom(()=>'',{ok:false,status:'MODEL_ERROR',errorMessage:'down'});const unavailable=await new Service(unavailableGateway).conform({contract,semanticFrame:frame,generation:generationFor(passText,answerBinding)});
 check('unavailable classifier remains non-veto and does not retry',!unavailable.accepted&&unavailable.trace.decision==='UNPROVEN_PRESERVED'&&unavailable.trace.observedDecision==='UNAVAILABLE'&&unavailable.generation.draft===passText&&unavailableGateway.calls.length===1);

 const confSrc=conf.src;const generatorSrc=gen.src;const hve3Src=fs.readFileSync(path.join(root,'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts'),'utf8');const runtimeReplySrc=fs.readFileSync(path.join(root,'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts'),'utf8');
 check('Conformance owns exactly one model call',(confSrc.match(/modelGateway\.generate\(/g)||[]).length===1);
 check('classifier protocol budget is structural-envelope-aware, capped at the existing 4000-token gateway maximum, and adds no retry',confSrc.includes('resolveSemanticSpanBudgetUnits')&&confSrc.includes('normalizedBudgetUnits * 320')&&confSrc.includes('MAX_CLASSIFIER_MAX_TOKENS = 4000')&&(confSrc.match(/modelGateway\.generate\(/g)||[]).length===1);
 check('classifier invalid-envelope diagnostics distinguish truncation from schema/JSON failures without exposing raw model content',confSrc.includes('CLASSIFIER_OUTPUT_TRUNCATED')&&confSrc.includes('JSON_PARSE_ERROR')&&confSrc.includes('buildConformanceProtocolDiagnostic')&&!confSrc.includes('rawClassifierContent'));
 check('active classifier protocol is V4 semantic-span + action-group + merchant-referent authority with Runtime-owned executable offsets and Canonical mapping',!confSrc.includes("version: 'HVE_SEMANTIC_ATOMS_V3'")&&confSrc.includes("version: 'HVE_SEMANTIC_SPANS_V4'")&&confSrc.includes('MODEL_SINGLE_SEMANTIC_SPAN_ACTION_GROUP_AND_REFERENT_AUTHORITY_V12')&&confSrc.includes('unitGroundedActions')&&confSrc.includes('merchantReferentRefs')&&confSrc.includes('merchantReferentScopeRequiresEvidence')&&confSrc.includes('projectClassifierSemanticSpans')&&confSrc.includes('evidenceRequirement')&&confSrc.includes('groundingEntailment'));
 check('same-proposition merchant evidence ownership is enforced by typed entailment plus source-witness ownership without a second surface semantic gate',
   merchantBypassPayload.availableGroundingEvidence?.some(entry=>entry.id==='KX')
   && borrowedWitness.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('WITNESS=INVALID'))
   && sameRefScenario.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('ENTAILMENT=PARTIALLY_SUPPORTED'))
   && merchantPredicateExtension.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'&&v.reason.includes('ENTAILMENT=PARTIALLY_SUPPORTED'))
   && confSrc.includes('validateGroundingSupportWitnessOwnership')
   && !confSrc.includes('validateDirectSourceActionClaimCoverage')
   && !confSrc.includes('DIRECT_ACTION_CLAIM_COVERAGE='));
 check('semantic proposition partition is classifier-owned and Runtime contains no punctuation/title-position atomizer',confSrc.includes('generatedReplyUnits')&&confSrc.includes('Span boundaries are open-language semantic decisions')&&!confSrc.includes('splitGroundedRecommendationColon')&&!confSrc.includes('findLeadingGroundingAnchorEnd')&&!confSrc.includes('splitRuntimeSurfaceAtoms'));
 check('topic frames no longer have a Runtime semantic-boundary owner',!confSrc.includes('hasLeadingDiscourseTopicFrameSyntax')&&!confSrc.includes('topicFrameJoinConsumed'));
 check('evidence titles do not create Runtime semantic topology',!confSrc.includes('buildGroundingAtomizationAnchors')&&!confSrc.includes('findLeadingGroundingAnchorEnd')&&!misboundGroundedFact.trace.unitChecks[0].realizedActIds.includes('G1')&&merchantBypassSpan?.realizedGroundingRefs?.length===0);
 check('formatting remains inside immutable units until classifier semantic partition',!confSrc.includes('mergeRuntimeFormattingGlueAtoms')&&confSrc.includes('generatedReplyUnits'));
 check('non-propositional fragment vocabulary is zero-Authority and does not weaken coherent OTHER_PROPOSITION fail-closed',
   confSrc.includes('NON_PROPOSITIONAL_FRAGMENT')
   && confSrc.includes('zero-Authority structural classification')
   && confSrc.includes("OTHER_PROPOSITION = a coherent independent proposition")
   && confSrc.includes("contributionKind === 'OTHER_PROPOSITION' && !removableSupportingOtherProposition"));
 check('supporting OTHER removal is narrowly permission-reducing and excludes material/outcome/merchant-shaped unknown propositions',
   confSrc.includes('isRemovableSupportingOtherProposition')
   && confSrc.includes("classification.taskDependency === 'SUPPORTS_CUSTOMER_TASK'")
   && confSrc.includes("classification.semanticTarget === 'TASK_OR_DOMAIN_FACT'")
   && confSrc.includes("classification.evidenceRequirement === 'NOT_REQUIRED'"));
 check('corrected evidence validator replays the same orphan soft-separator seam projection as Runtime exact removal',
   confSrc.includes('projectConformanceEvidencePieces')
   && (confSrc.match(/projectAuthorizedSurfacePieces\(pieces\)/g)||[]).length===2
   && confSrc.includes('orphanedSoftSeparatorLength(exactText)'));
 check('classifier choice semantics keep condition-plus-proposed-option material instead of demoting it to merchant description',confSrc.includes('if removing the atom would remove which concrete option is being suggested under the current preference/condition'));
 check('strict entailment does not turn audience/scenario suitability into an unconfigured comfort or performance outcome',confSrc.includes('suitable for a scenario or customer group supports a suitability judgment at that same level')&&confSrc.includes('does not entail every requested property, physiological/comfort experience, or downstream outcome'));
 check('semantic target contract separates descriptive merchant facts from suitability/style/experience/outcome judgments without business-keyword special cases',confSrc.includes('MERCHANT_ENTITY_OR_POLICY is restricted to descriptive object/policy/state predicates')&&confSrc.includes('assesses suitability for a scenario or audience')&&confSrc.includes('evaluates presentation/style/formality')&&confSrc.includes('MUST use ACTION_OPTION_RISK_OR_OUTCOME')&&confSrc.includes('A suitability/style/experience/outcome proposition never becomes MERCHANT_ENTITY_OR_POLICY'));
 check('supported grounded follow-on clauses can remain under a recommendation only after an independently proven recommendation atom in the same unit',confSrc.includes('independentlyProvenRecommendationActIds')&&confSrc.includes("binding.actType === 'RECOMMEND_GROUNDED_ITEM'")&&confSrc.includes("classification.semanticTarget === 'MERCHANT_ENTITY_OR_POLICY'")&&confSrc.includes("classification.semanticTarget === 'ACTION_OPTION_RISK_OR_OUTCOME'")&&confSrc.includes('classificationGroundingFullyOwnedByBinding'));
 check('plain BOUNDARY_CONTENT remains non-removable while evidence-required object assertions normalize to Grounded enforcement',confSrc.includes('CONFORMANCE_BOUNDARY_CONTENT_NOT_INDEPENDENTLY_REMOVABLE')&&confSrc.includes("'BOUNDARY_CONTENT',")&&confSrc.includes("evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_BOUNDARY'"));
 check('GROUNDED_CONTENT kind alone no longer grants recommendation Authority',!confSrc.includes("GROUNDED_CONTENT: new Set(['RECOMMEND_GROUNDED_ITEM'")&&confSrc.includes("kind === 'GROUNDED_CONTENT' && actType === 'RECOMMEND_GROUNDED_ITEM'")&&confSrc.includes("target === 'ACTION_OPTION_RISK_OR_OUTCOME'"));
 check('EXPLAIN_GROUNDED_FACT requires evidence-bearing grounded semantics rather than an ungrounded ANSWER_JUDGMENT bypass',!confSrc.includes("ANSWER_JUDGMENT: new Set(['DIRECT_ANSWER', 'PROVIDE_GENERAL_GUIDANCE', 'EXPLAIN_GROUNDED_FACT'")&&surfaceAnswerGrounded.accepted&&surfaceAnswerGrounded.trace.unitChecks.some(u=>u.realizedActIds.includes('GF1'))&&!unsupportedJudgment.accepted&&unsupportedJudgment.trace.unitChecks.every(u=>!u.realizedActIds.includes('GF1'))&&unsupportedJudgment.trace.violations.some(v=>v.code==='GROUNDED_EVIDENCE_UNSUPPORTED'));
 check('ingress Required binding validator stays strict while post-Conformance integrity/primary validation is separated',generatorSrc.includes("act.necessity === 'REQUIRED' && act.type !== 'STOP'")&&generatorSrc.includes("HVE_REPLY_V2_REQUIRED_ACT_BINDING_MISSING")&&generatorSrc.includes('validateHveReplyV2CanonicalBindingIntegrity')&&confSrc.includes('validateHveReplyV2CanonicalBindingIntegrity(input.contract, correctedSemanticSegments)')&&confSrc.includes('validateHveReplyV2PrimaryTaskSurfaceOrder(input.contract, correctedSemanticSegments)'));
 check('REMOVE path does not re-impose the ingress primary-order gate before exact deletion can remove a failed earlier producer',confSrc.includes('re-applying the ingress primary-order')&&confSrc.includes('? validateHveReplyV2CanonicalBindingIntegrity(input.contract, narrowedSemanticSegments)'));
 check('ingress protocol enforces Canonical primary recommendation before supporting/optional substantive units without adding a new retry path',generatorSrc.includes('validateHveReplyV2PrimaryTaskSurfaceOrder')&&generatorSrc.includes('PRIMARY_TASK_PREFIX_NEUTRAL_ACT_TYPES')&&generatorSrc.includes('HVE_REPLY_V2_PRIMARY_REQUIRED_RECOMMENDATION_NOT_FIRST_SUBSTANTIVE_UNIT')&&generatorSrc.includes("plan.answerObligation?.responseTarget?.focus !== 'RECOMMENDATION'")&&!generatorSrc.includes('PRIMARY_TASK_RETRY'));
 check('non-grounded realization uses reply-level provider declaration while grounded bindings remain unit-local',confSrc.includes('replyDeclaredNonGroundedBindings')&&confSrc.includes('localGroundedBindings')&&confSrc.includes('compatibleGroundedBindings'));
 check('Runtime verifies source-witness ownership and typed source-predicate compatibility instead of treating a returned ref alone as proposition evidence',confSrc.includes('validateGroundingSupportWitnessOwnership')&&confSrc.includes('validateDirectSourceWitnessTypedPredicateCompatibility')&&confSrc.includes('sourceSemanticTarget')&&confSrc.includes('sourceGroundedActionRole')&&confSrc.includes('surface.includes(excerpt)')&&confSrc.includes('WITNESS_TYPED=${evidenceWitnessTypedPredicateCompatible'));
 check('open-language proposition entailment has one typed semantic owner while Runtime retains only protocol/ref/typed-proof/axis enforcement',confSrc.includes('Open-language proposition entailment is owned by the single blind semantic classifier')&&confSrc.includes('semantic equivalence is proposition-level rather than surface containment')&&confSrc.includes('must be PARTIALLY_SUPPORTED or UNSUPPORTED when the span adds a stronger or different suitability')&&confSrc.includes('validateGroundingSupportWitnessOwnership')&&confSrc.includes('validateDirectSourceWitnessTypedPredicateCompatibility')&&confSrc.includes('groundingBasisRuntimeCompatible')&&!confSrc.includes('validateDirectSourceActionClaimCoverage')&&!confSrc.includes('normalizedWitness.includes(normalizedClaim)')&&!confSrc.includes('textually contains the whole Runtime atom action/outcome claim'));
 check('unused grounded producer bindings are narrowed rather than promoted to semantic Authority',confSrc.includes('narrowGeneratedGroundedBindingsToConformanceEvidence')&&confSrc.includes('CONFORMANCE_BINDING_NARROWING_WOULD_UNBIND_UNIT')&&confSrc.includes('Unused grounded candidates are narrowed after classification'));
 check('Required grounded Acts still need an actually authorized grounded realization after candidate narrowing',confSrc.includes("(requiredAct.allowedGroundingRefs || []).length > 0")&&confSrc.includes("return 'CONFORMANCE_GROUNDED_BINDING_NOT_REALIZED';"));
 check('evidenceRequirement distinguishes object-level merchant facts from epistemic evidence boundaries without adding a second classifier or semantic retry',confSrc.includes('MERCHANT_ENTITY_EVIDENCE_BOUNDARY')&&confSrc.includes('merchantEvidenceBoundaryRuntimeCompatible')&&confSrc.includes('must NOT assert that referenced proposition true or false')&&confSrc.includes('TASK_OR_DOMAIN_FACT is also valid')&&confSrc.includes('A general rule remains NOT_REQUIRED')&&(confSrc.match(/modelGateway\.generate\(/g)||[]).length===1);
 check('supported choice synthesis is bounded to customer constraints plus proven merchant premises and cannot become a performance-evidence bypass',confSrc.includes('customer-owned constraints from latestCustomerMessage')&&confSrc.includes('merchant-side premises that are themselves directly supported')&&confSrc.includes('must never be used to upgrade an unconfigured product performance'));
 console.log(`\nCanonical Semantic Conformance V6 Evidence Witness + Binding Closure: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
