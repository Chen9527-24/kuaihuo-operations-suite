#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const rel='src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts';
const reducerRel='src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const source=fs.readFileSync(path.join(root,rel),'utf8');
const reducer=fs.readFileSync(path.join(root,reducerRel),'utf8');
const kernel=fs.readFileSync(path.join(root,kernelRel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function loadNormalize(){
 const instrumented=`${source}\nexport const __verifyNormalizeRecognizedItem=normalizeRecognizedItem;\n`;
 const compiled=ts.transpileModule(instrumented,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:rel});
 const loaded={exports:{}};
 const localRequire=request=>{
  if(request==='@nestjs/common')return{Injectable:()=>target=>target};
  if(request.includes('customer-service-model-gateway.service'))return{CustomerServiceModelGateway:class{}};
  if(request.includes('compile-simulation.dto'))return{};
  if(request==='./customer-service-conversation-task-state')return{canonicalIntentForScenario:(_s,i)=>i,inferConversationTaskState:()=>({}),isCustomerServiceScenario:()=>false};
  if(request==='./customer-service-message-understanding.service')return{analyzeCustomerServicePragmatics:()=>({}),inferHumanContext:()=>({})};
  if(request==='./types/customer-service-message-understanding.type')return{};
  if(request==='./customer-service-dialogue-obligation')return{hasDialogueRepairSignal:()=>false,reconcileCustomerServiceDialogueObligationWithModelSignal:x=>x,resolveCustomerServiceDialogueFeedbackEvidence:()=>({})};
  if(request==='../state/customer-service-conversation-state.reducer')return{readCustomerServiceConversationStateV2:()=>({tasks:[],memories:[],entities:[],currentTurn:0}),summarizeCustomerServiceConversationState:()=>({activeTask:null,suspendedTasks:[],relevantMemories:[],latestFeedback:null,closedSemanticQuestions:[]})};
  if(request==='./customer-service-explicit-semantics')return{hasLatentCommercialOpportunity:()=>false,inferDeterministicSecondaryIntents:()=>[],resolveCustomerServiceFactOwnership:()=>({}),inferExplicitCustomerSemantic:()=>null};
  throw new Error(`Unexpected verifier dependency: ${request}`);
 };
 Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);
 return loaded.exports.__verifyNormalizeRecognizedItem;
}
const normalize=loadNormalize();
const context={primaryScenario:'PRODUCT_CONSULT',primaryIntent:'ASK_INFORMATION',riskLevel:'LOW',message:'customer-owned exact evidence'};
function item(key,category='CUSTOMER_CONSTRAINT'){return{type:'STATE',key,name:'generic condition',confidence:.96,evidence:['customer-owned exact evidence'],scope:'CONVERSATION',continuity:'NEW',eligibleForIntentLibrary:false,suggestedCategory:category,suggestedScenario:'PRODUCT_CONSULT',suggestedPrimaryIntent:'ASK_INFORMATION',suggestedRiskLevel:'LOW',constraintBasis:'CUSTOMER_ESTABLISHED',constraintRole:'OPEN_DECISION_CONDITION',changesDecisionSpace:true};}
const semantic=normalize(item('customer-constraint-generic-condition'),context);
const scoped=normalize(item('constraint.task-abc123.customer-constraint-generic-condition'),context);
const repeated=normalize(item('constraint.task-old.constraint.task-older.customer-constraint-generic-condition'),context);
const nonConstraint=normalize(item('constraint.task-abc123.generic-state','PRE_SALE'),context);
check('plain semantic constraint key is preserved', semantic?.key==='customer-constraint-generic-condition');
check('one downstream task scope is stripped before State ownership', scoped?.key==='customer-constraint-generic-condition');
check('accidentally repeated task scopes collapse to one semantic key', repeated?.key==='customer-constraint-generic-condition');
check('non-CUSTOMER_CONSTRAINT keys are not rewritten by constraint scope canonicalizer', nonConstraint?.key==='constraint.task-abc123.generic-state');
check('admission truth and exact evidence survive key normalization', scoped?.suggestedCategory==='CUSTOMER_CONSTRAINT' && scoped?.evidence?.[0]==='customer-owned exact evidence' && scoped?.confidence===.96);
check('State reducer remains the sole task-scope owner and applies scope once', reducer.includes("add('CUSTOMER_CONSTRAINT', `constraint.${taskId}.${semanticKey}`") && !reducer.includes('normalizeCustomerConstraintSemanticKey'));
check('normalization recognizes only the generic State transport shape', source.includes("normalized.match(/^constraint\\.[a-z0-9-]+\\.(.+)$/)") && source.includes('strip that transport scope before the State'));
check('same Deep Recognition call count is unchanged', (source.match(/modelGateway\.generate\(/g)||[]).length===2);
check('scoped-key fix contains no domain/product/location/test-utterance special case', !/(柯基|广州|tencel|wide-leg|walking-area|purchase-intention|utteranceFixture|domainFixture|productFixture)/i.test(source));
check('kernel records v1.93 R2.1 scoped-key normalization while keeping R2.1 sealed', kernel.includes("version: 'hve-3-v1.99'") && kernel.includes('R2.1 Scoped-Key Normalization') && kernel.includes('R2.1 remains SEALED'));
console.log(`\nR2.1 Scoped-Key Normalization: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
