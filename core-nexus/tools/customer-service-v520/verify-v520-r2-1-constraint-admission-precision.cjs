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
let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function loadInstrumentedDeepRecognition() {
  const instrumented = `${source}\nexport const __verifyNormalizeRecognizedItem = normalizeRecognizedItem;\n`;
  const compiled = ts.transpileModule(instrumented, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
    fileName: rel,
  });
  const loaded = { exports: {} };
  const localRequire = request => {
    if (request === '@nestjs/common') return { Injectable: () => target => target };
    if (request.includes('customer-service-model-gateway.service')) return { CustomerServiceModelGateway: class {} };
    if (request.includes('compile-simulation.dto')) return {};
    if (request === './customer-service-conversation-task-state') return { canonicalIntentForScenario: (_s,i)=>i, inferConversationTaskState:()=>({}), isCustomerServiceScenario:()=>false };
    if (request === './customer-service-message-understanding.service') return { analyzeCustomerServicePragmatics:()=>({}), inferHumanContext:()=>({}) };
    if (request === './types/customer-service-message-understanding.type') return {};
    if (request === './customer-service-dialogue-obligation') return { hasDialogueRepairSignal:()=>false, reconcileCustomerServiceDialogueObligationWithModelSignal:x=>x, resolveCustomerServiceDialogueFeedbackEvidence:()=>({}) };
    if (request === '../state/customer-service-conversation-state.reducer') return { readCustomerServiceConversationStateV2:()=>({tasks:[],memories:[],entities:[],currentTurn:0}), summarizeCustomerServiceConversationState:()=>({activeTask:null,suspendedTasks:[],relevantMemories:[],latestFeedback:null,closedSemanticQuestions:[]}) };
    if (request === './customer-service-contextual-referent') return { getCustomerServiceDeliveredReferentCandidates:()=>[], resolveCustomerServiceContextualReferentSelection:()=>null, resolveCustomerServiceContextualReferentEvidence:()=>null };
    if (request === './customer-service-explicit-semantics') return { hasLatentCommercialOpportunity:()=>false, inferDeterministicSecondaryIntents:()=>[], resolveCustomerServiceFactOwnership:()=>({}), inferExplicitCustomerSemantic:()=>null };
    throw new Error(`Unexpected verifier dependency: ${request}`);
  };
  Function('exports','module','require',compiled.outputText)(loaded.exports, loaded, localRequire);
  return loaded.exports;
}
const normalize = loadInstrumentedDeepRecognition().__verifyNormalizeRecognizedItem;
const context = { primaryScenario:'PRODUCT_CONSULT', primaryIntent:'ASK_INFORMATION', riskLevel:'LOW', message:'customer-owned exact evidence' };
function candidate(extra={}) {
  return {
    type:'STATE', key:'decision-condition', name:'decision condition', confidence:0.96,
    evidence:['customer-owned exact evidence'], scope:'CONVERSATION', continuity:'NEW',
    eligibleForIntentLibrary:false, suggestedCategory:'CUSTOMER_CONSTRAINT',
    suggestedScenario:'PRODUCT_CONSULT', suggestedPrimaryIntent:'ASK_INFORMATION', suggestedRiskLevel:'LOW',
    ...extra,
  };
}
const established = normalize(candidate({ constraintBasis:'CUSTOMER_ESTABLISHED', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true }), context);
const questionTarget = normalize(candidate({ constraintBasis:'QUESTION_TARGET', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true }), context);
const option = normalize(candidate({ constraintBasis:'OPTION_UNDER_EVALUATION', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true }), context);
const feedback = normalize(candidate({ constraintBasis:'FEEDBACK_OR_ACCEPTANCE', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true }), context);
const futureIntent = normalize(candidate({ constraintBasis:'FUTURE_INTENT_ONLY', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true }), context);
const inference = normalize(candidate({ constraintBasis:'MODEL_INFERENCE', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true }), context);
const noImpact = normalize(candidate({ constraintBasis:'CUSTOMER_ESTABLISHED', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:false }), context);
const missingAdmission = normalize(candidate(), context);

check('customer-established proposition with material decision impact remains an admitted CUSTOMER_CONSTRAINT',
  Boolean(established) && established.suggestedCategory === 'CUSTOMER_CONSTRAINT');
check('question target cannot be persisted merely because its answer would affect a decision', questionTarget === null);
check('option under evaluation cannot be persisted before the customer establishes it as a condition', option === null);
check('feedback or acceptance is not retyped as CUSTOMER_CONSTRAINT', feedback === null);
check('future-intent-only statement is not retyped as CUSTOMER_CONSTRAINT', futureIntent === null);
check('model inference is not retyped as CUSTOMER_CONSTRAINT', inference === null);
check('customer-established information with no material decision-space impact is not CUSTOMER_CONSTRAINT', noImpact === null);
check('CUSTOMER_CONSTRAINT admission fails closed when qualification metadata is absent', missingAdmission === null);
check('Deep Recognition prompt preserves proposition ownership before role and decision-space impact',
  source.includes('客户已建立条件测试')
    && source.includes('开放决策条件角色测试')
    && source.includes('被询问的维度或答案目标、仅处于考虑中的候选选项、对上一轮的接受/评价、没有限制后续可行集合的未来尝试意图、以及模型推断')
    && source.indexOf('客户已建立条件测试') < source.indexOf('开放决策条件角色测试')
    && source.indexOf('开放决策条件角色测试') < source.indexOf('通过客户已建立条件测试和开放决策条件角色测试后，再对该独立信息做“决策空间测试”'));
check('structured output carries generic admission metadata rather than lexical or domain rules',
  source.includes('constraintBasis')
    && source.includes('constraintRole')
    && source.includes('changesDecisionSpace')
    && source.includes('CUSTOMER_ESTABLISHED|QUESTION_TARGET|OPTION_UNDER_EVALUATION|FEEDBACK_OR_ACCEPTANCE|FUTURE_INTENT_ONLY|MODEL_INFERENCE|NOT_APPLICABLE')
    && source.includes('OPEN_DECISION_CONDITION|DECISION_OUTCOME|ACTION_OR_PURCHASE_INTENTION|QUESTION_OR_OPTION|FEEDBACK_ONLY|MODEL_INFERENCE|NOT_APPLICABLE')
    && !/(constraintKeyword|keywordConstraintMap|questionMarkConstraint|domainConstraintMap|utteranceFixture|productFixture)/i.test(source));
check('normalizer preserves old ownership/impact gates and adds open-decision role gate inside the same Deep Recognition authority',
  source.includes("constraintBasis !== 'CUSTOMER_ESTABLISHED'")
    && source.includes("constraintRole !== 'OPEN_DECISION_CONDITION'")
    && source.includes('|| !changesDecisionSpace')
    && source.includes("if (normalizedSuggestedCategory === 'CUSTOMER_CONSTRAINT')"));
check('precision closure adds no additional Deep Recognition model call',
  (source.match(/modelGateway\.generate\(/g) || []).length === 2, String((source.match(/modelGateway\.generate\(/g) || []).length));
check('kernel records v1.89 R1 refreeze and R2.1 precision closure without widening phase scope',
  kernel.includes("version: 'hve-3-v1.100'")
    && kernel.includes('V1.89 P0-5 R1.15 REFROZEN plus R2.1 Constraint Admission Precision Boundary')
    && kernel.includes('proposition-ownership plus decision-impact admission'));

console.log(`\nR2.1 Constraint Admission Precision: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
