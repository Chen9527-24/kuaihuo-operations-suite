#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(__dirname,'../..');
const rel='src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts';
const src=fs.readFileSync(path.join(root,rel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function descriptor(type){return {semanticDefinition:`semantic:${type}`,authorityScope:type==='RECOMMEND_GROUNDED_ITEM'||type==='EXPLAIN_GROUNDED_FACT'?'GROUNDED_BUSINESS':'PLAN_ONLY'};}
function projectActs(acts){return acts.map((act,index)=>({
  id:act.id||`ACT_${index}`,
  type:act.type,
  necessity:act.necessity||'REQUIRED',
  semantic:`semantic:${act.type}`,
  authorityScope:descriptor(act.type).authorityScope,
  allowedGroundingRefs:[...new Set((act.grounding||[]).filter(g=>g.status==='SATISFIED').flatMap(g=>g.evidenceRefs||[]))],
  parameters:act.parameters||{},
}));}
const compiled=ts.transpileModule(src+'\nexports.__parse=parseCustomerServiceChatPresentationProtocol;\nexports.__normalize=normalizeOrdinaryHveChatPresentation;\n',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});
check('generator TypeScript syntax',!(compiled.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));
const box={exports:{},module:{exports:{}},require:id=>{
  if(id==='@nestjs/common')return{Injectable:()=>t=>t};
  if(id.includes('customer-service-act-descriptor.registry'))return{getCustomerServiceActDescriptor:descriptor};
  if(id.includes('customer-service-nlg-execution-brief'))return{projectCustomerServiceCanonicalActsForSemanticFrame:projectActs};
  if(id.includes('customer-service-source-bound-summary-protocol'))return{parseCustomerServiceTypedSourceBoundSummary:v=>({protocolValid:false,visibleText:'',raw:v})};
  if(id.includes('customer-service-generation-prompt.builder'))return{CustomerServiceGenerationPromptBuilder:class{}};
  if(id.includes('customer-service-model-gateway.service'))return{CustomerServiceModelGateway:class{}};
  return{};
},console,process}; box.module.exports=box.exports;
vm.runInNewContext(compiled.outputText,box,{filename:rel});
const {validateHveReplyV2CanonicalBindings,parseCustomerServiceHveReplyV2ForVerification,requiresActBoundHveReplyV2}=box.exports;
const parse=box.exports.__parse, normalize=box.exports.__normalize;
const contract={orchestrationPlan:{interactionExecution:{lane:'HVE_ACTIVE'},interactionPlanV2:{acts:[
  {id:'A1',type:'DIRECT_ANSWER',necessity:'REQUIRED',grounding:[]},
  {id:'A2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]},
  {id:'G1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}]},
]}}};
const valid=[{text:'先回答，再给方向，具体候选A。',units:[
  {text:'先回答，',usedGroundingRefs:[],bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]}]},
  {text:'再给方向，',usedGroundingRefs:[],bindings:[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}]},
  {text:'具体候选A。',usedGroundingRefs:['K1'],bindings:[{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]},
]}];
check('valid V2 units cover every Required visible Canonical Act',validateHveReplyV2CanonicalBindings(contract,valid)===null);
check('current HVE lane requires Act-bound V2',requiresActBoundHveReplyV2(contract)===true);
const envelope=JSON.stringify({version:'HVE_REPLY_V2',segments:valid});
const parsed=parseCustomerServiceHveReplyV2ForVerification(envelope);
check('V2 parser preserves exact segment/unit partition and producer-declared Grounding usage',parsed?.[0]?.text===valid[0].text&&parsed[0].units.map(u=>u.text).join('')===valid[0].text&&parsed[0].units[2].usedGroundingRefs?.join(',')==='K1');
check('unselected or mismatched Act binding is rejected',validateHveReplyV2CanonicalBindings(contract,[{text:'x',units:[{text:'x',bindings:[{actId:'X',actType:'DIRECT_ANSWER',groundingRefs:[]}]}]}])==='HVE_REPLY_V2_UNSELECTED_OR_MISMATCHED_ACT_BINDING');
check('missing Required Act binding is rejected',validateHveReplyV2CanonicalBindings(contract,[{text:'x',units:[{text:'x',bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]}]}]}])==='HVE_REPLY_V2_REQUIRED_ACT_BINDING_MISSING');
const closeStopContract={orchestrationPlan:{interactionExecution:{lane:'HVE_ACTIVE'},interactionPlanV2:{acts:[{id:'C1',type:'NATURAL_CLOSE',necessity:'REQUIRED',grounding:[]},{id:'S1',type:'STOP',necessity:'REQUIRED',grounding:[]}]}}};
check('STOP is control-only and does not require a customer-visible HVE binding',validateHveReplyV2CanonicalBindings(closeStopContract,[{text:'不客气，先这样。',units:[{text:'不客气，先这样。',bindings:[{actId:'C1',actType:'NATURAL_CLOSE',groundingRefs:[]}]}]}])===null);
check('NATURAL_CLOSE remains a required visible binding even when STOP is selected',validateHveReplyV2CanonicalBindings(closeStopContract,[{text:'x',units:[{text:'x',bindings:[{actId:'S1',actType:'STOP',groundingRefs:[]}]}]}])==='HVE_REPLY_V2_REQUIRED_ACT_BINDING_MISSING');
check('Grounded Act requires at least one bound ref',validateHveReplyV2CanonicalBindings(contract,[{text:'x',units:[{text:'x',usedGroundingRefs:[],bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]},{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:[]}]}]}])==='HVE_REPLY_V2_GROUNDED_BINDING_REQUIRES_REF');
check('Grounding ref outside that exact Act authority is rejected',validateHveReplyV2CanonicalBindings(contract,[{text:'x',units:[{text:'x',usedGroundingRefs:['K2'],bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]},{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K2']}]}]}])==='HVE_REPLY_V2_GROUNDING_REF_OUTSIDE_ACT_AUTHORITY');
check('non-grounded Act cannot claim a Grounding ref',validateHveReplyV2CanonicalBindings(contract,[{text:'x',units:[{text:'x',usedGroundingRefs:['K1'],bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:['K1']},{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]}]}])==='HVE_REPLY_V2_NON_GROUNDED_ACT_CANNOT_CLAIM_GROUNDING');
const multiGroundContract={orchestrationPlan:{interactionExecution:{lane:'HVE_ACTIVE'},interactionPlanV2:{acts:[
  {id:'A2',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]},
  {id:'G1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1','K2']}]},
]}}};
const multiGroundValid=[{text:'候选A有取舍，候选B也可考虑。',units:[{text:'候选A有取舍，候选B也可考虑。',usedGroundingRefs:['K1','K2'],bindings:[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1','K2']}]}]}];
check('multi-evidence unit may stay whole only when used Grounding refs and grounded binding refs are complete and equal',validateHveReplyV2CanonicalBindings(multiGroundContract,multiGroundValid)===null);
check('multi-evidence under-binding is rejected before it can claim V2 structural authorization',validateHveReplyV2CanonicalBindings(multiGroundContract,[{text:'候选A有取舍，候选B也可考虑。',units:[{text:'候选A有取舍，候选B也可考虑。',usedGroundingRefs:['K1','K2'],bindings:[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K2']}]}]}])==='HVE_REPLY_V2_USED_GROUNDING_REF_UNBOUND');
check('grounded binding cannot over-claim a ref the unit does not declare as actually used',validateHveReplyV2CanonicalBindings(multiGroundContract,[{text:'只说候选B。',units:[{text:'只说候选B。',usedGroundingRefs:['K2'],bindings:[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1','K2']}]}]}])==='HVE_REPLY_V2_BOUND_GROUNDING_REF_NOT_DECLARED_USED');
check('legacy grounded V2 unit without usedGroundingRefs cannot silently retain structural authorization',validateHveReplyV2CanonicalBindings(contract,[{text:'x',units:[{text:'x',bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]},{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]}]}])==='HVE_REPLY_V2_BOUND_GROUNDING_REF_NOT_DECLARED_USED');
const splitGroundValid=[{text:'候选A有取舍，候选B也可考虑。',units:[
  {text:'候选A有取舍，',usedGroundingRefs:['K1'],bindings:[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K1']}]},
  {text:'候选B也可考虑。',usedGroundingRefs:['K2'],bindings:[{actId:'A2',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]},{actId:'G1',actType:'RECOMMEND_GROUNDED_ITEM',groundingRefs:['K2']}]},
]}];
check('multi-evidence visible message may split into adjacent semantic units without changing segment text',validateHveReplyV2CanonicalBindings(multiGroundContract,splitGroundValid)===null&&splitGroundValid[0].units.map(u=>u.text).join('')===splitGroundValid[0].text);
const badConcat=JSON.stringify({version:'HVE_REPLY_V2',segments:[{text:'AB',units:[{text:'A',bindings:[{actId:'A1',actType:'DIRECT_ANSWER',groundingRefs:[]}]}]}]});
check('segment text must equal exact unit concatenation',parseCustomerServiceHveReplyV2ForVerification(badConcat)===null);
const v1=JSON.stringify({version:'HVE_REPLY_V1',segments:[{text:'legacy'}]});
const baseGen={draft:v1,visibleContentLength:v1.length};
const normalized=normalize(contract,baseGen);
check('direct current-HVE normalizer cannot claim V2 structural authorization from V1/raw compatibility',normalized.draft===null&&normalized.structuredSegments===undefined&&String(normalized.errorMessage||'').includes('HVE_REPLY_V2'));
check('protocol implementation has no role/domain/wording/fixed quota branch',!/(industryCode\s*===|roleCode\s*===|customerMessage\.includes|softMaxChars|maxRecommendationOptions|groundedKeyword)/.test(src));
console.log(`\nHVE_REPLY_V2 Act-bound Protocol: ${pass}/${pass+fail} PASS`); if(fail)process.exit(1);
