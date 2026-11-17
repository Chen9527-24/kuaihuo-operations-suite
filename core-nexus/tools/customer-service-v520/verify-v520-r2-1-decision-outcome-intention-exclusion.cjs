#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const rel = 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const source = fs.readFileSync(path.join(root, rel), 'utf8');
const kernel = fs.readFileSync(path.join(root, kernelRel), 'utf8');
let pass=0, fail=0;
function check(name, ok, detail=''){ if(ok){pass++; console.log(`PASS ${name}`);} else {fail++; console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`);} }
function loadNormalize(){
  const instrumented = `${source}\nexport const __verifyNormalizeRecognizedItem = normalizeRecognizedItem;\n`;
  const compiled = ts.transpileModule(instrumented,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:rel});
  const loaded={exports:{}};
  const localRequire=request=>{
    if(request==='@nestjs/common') return {Injectable:()=>target=>target};
    if(request.includes('customer-service-model-gateway.service')) return {CustomerServiceModelGateway:class{}};
    if(request.includes('compile-simulation.dto')) return {};
    if(request==='./customer-service-conversation-task-state') return {canonicalIntentForScenario:(_s,i)=>i,inferConversationTaskState:()=>({}),isCustomerServiceScenario:()=>false};
    if(request==='./customer-service-message-understanding.service') return {analyzeCustomerServicePragmatics:()=>({}),inferHumanContext:()=>({})};
    if(request==='./types/customer-service-message-understanding.type') return {};
    if(request==='./customer-service-dialogue-obligation') return {hasDialogueRepairSignal:()=>false,reconcileCustomerServiceDialogueObligationWithModelSignal:x=>x,resolveCustomerServiceDialogueFeedbackEvidence:()=>({})};
    if(request==='../state/customer-service-conversation-state.reducer') return {readCustomerServiceConversationStateV2:()=>({tasks:[],memories:[],entities:[],currentTurn:0}),summarizeCustomerServiceConversationState:()=>({activeTask:null,suspendedTasks:[],relevantMemories:[],latestFeedback:null,closedSemanticQuestions:[]})};
    if(request==='./customer-service-contextual-referent') return {getCustomerServiceDeliveredReferentCandidates:()=>[],resolveCustomerServiceContextualReferentSelection:()=>null,resolveCustomerServiceContextualReferentEvidence:()=>null};
    if(request==='./customer-service-explicit-semantics') return {hasLatentCommercialOpportunity:()=>false,inferDeterministicSecondaryIntents:()=>[],resolveCustomerServiceFactOwnership:()=>({}),inferExplicitCustomerSemantic:()=>null};
    throw new Error(`Unexpected verifier dependency: ${request}`);
  };
  Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);
  return loaded.exports.__verifyNormalizeRecognizedItem;
}
const normalize=loadNormalize();
const context={primaryScenario:'PRODUCT_CONSULT',primaryIntent:'ASK_INFORMATION',riskLevel:'LOW',message:'customer-owned exact evidence'};
function item(role, extra={}){return {type:'STATE',key:'generic-condition',name:'generic condition',confidence:0.96,evidence:['customer-owned exact evidence'],scope:'CONVERSATION',continuity:'NEW',eligibleForIntentLibrary:false,suggestedCategory:'CUSTOMER_CONSTRAINT',suggestedScenario:'PRODUCT_CONSULT',suggestedPrimaryIntent:'ASK_INFORMATION',suggestedRiskLevel:'LOW',constraintBasis:'CUSTOMER_ESTABLISHED',constraintRole:role,changesDecisionSpace:true,...extra};}
const open=normalize(item('OPEN_DECISION_CONDITION'),context);
const outcome=normalize(item('DECISION_OUTCOME'),context);
const intention=normalize(item('ACTION_OR_PURCHASE_INTENTION'),context);
const question=normalize(item('QUESTION_OR_OPTION'),context);
const feedback=normalize(item('FEEDBACK_ONLY'),context);
const inference=normalize(item('MODEL_INFERENCE'),context);
const missing=normalize(item(undefined,{constraintRole:undefined}),context);
check('still-open customer condition remains eligible for CUSTOMER_CONSTRAINT', Boolean(open) && open.suggestedCategory==='CUSTOMER_CONSTRAINT');
check('completed or accepted decision outcome is not retyped as CUSTOMER_CONSTRAINT', outcome===null);
check('purchase/try/execute intention is not retyped as CUSTOMER_CONSTRAINT', intention===null);
check('question or option-under-evaluation role is not retyped as CUSTOMER_CONSTRAINT', question===null);
check('feedback-only role is not retyped as CUSTOMER_CONSTRAINT', feedback===null);
check('model inference role is not retyped as CUSTOMER_CONSTRAINT', inference===null);
check('constraint role metadata fails closed when absent', missing===null);
check('prompt explicitly separates open-decision conditions from decision outcomes and future action intentions', source.includes('开放决策条件角色测试') && source.includes('DECISION_OUTCOME') && source.includes('ACTION_OR_PURCHASE_INTENTION') && source.includes('已有 Conversation State 的 DECISION/其他记忆通道负责保存其本来语义'));
check('normalizer requires all three orthogonal admission dimensions', source.includes("constraintBasis !== 'CUSTOMER_ESTABLISHED'") && source.includes("constraintRole !== 'OPEN_DECISION_CONDITION'") && source.includes('|| !changesDecisionSpace'));
check('sealed regression closure stays in the existing Deep Recognition primary + JSON-repair call count', (source.match(/modelGateway\.generate\(/g)||[]).length===2);
check('precision regression closure contains no product/domain/test-utterance special case', !/(tencel|wide-leg|柯基|广州|utteranceFixture|domainFixture|productFixture|keywordConstraintMap)/i.test(source));
check('kernel records v1.92 narrow R2.1 sealed precision regression closure', kernel.includes("version: 'hve-3-v1.100'") && kernel.includes('R2.1 SEALED Precision Regression Closure') && kernel.includes('constraintRole=OPEN_DECISION_CONDITION'));
console.log(`\nR2.1 Decision Outcome / Intention Exclusion: ${pass}/${pass+fail} PASS`);
if(fail) process.exit(1);
