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
function check(name, ok, detail='') { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); } }
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
const normalizedWithoutName = normalize({
  type:'STATE', key:'execution-availability', confidence:0.96,
  evidence:['customer-owned exact evidence'], scope:'CONVERSATION', continuity:'NEW',
  eligibleForIntentLibrary:false, suggestedCategory:'CUSTOMER_CONSTRAINT',
  suggestedScenario:'CASUAL_CHAT', suggestedPrimaryIntent:'ASK_INFORMATION', suggestedRiskLevel:'LOW',
  constraintBasis:'CUSTOMER_ESTABLISHED', constraintRole:'OPEN_DECISION_CONDITION', changesDecisionSpace:true,
}, { primaryScenario:'CASUAL_CHAT', primaryIntent:'ASK_INFORMATION', riskLevel:'LOW', message:'customer-owned exact evidence' });
check('recognizedItems schema now declares name metadata that normalizer consumes',
  source.includes("name: '简短语义名称；描述该识别项是什么，不写具体取值'")
    && source.includes('const name = normalizeString(item.name, key, 160)'));
check('missing descriptive name no longer drops an otherwise valid CUSTOMER_CONSTRAINT item',
  Boolean(normalizedWithoutName)
    && normalizedWithoutName.name === 'execution-availability'
    && normalizedWithoutName.type === 'STATE'
    && normalizedWithoutName.scope === 'CONVERSATION'
    && normalizedWithoutName.suggestedCategory === 'CUSTOMER_CONSTRAINT', JSON.stringify(normalizedWithoutName));
check('Deep Recognition applies a generic decision-space semantic test before recognizedItems selection',
  source.includes('决策空间测试')
    && source.includes('方案集合、推荐排序、适用资格、执行方式或现实可行性是否会实质改变')
    && source.includes('proposition ownership 和语义功能，不按词形、问号、行业、实体或句式'));
check('same-turn question or feedback cannot consume a qualifying explicit constraint',
  source.includes('dominantTurnGoal/dialogueFeedbackSignal 不能消费或替代 CUSTOMER_CONSTRAINT')
    && source.includes('recognizedItems 必须优先为它保留条目'));
check('single-call user payload carries the same recognition requirement without adding a new authority',
  source.includes("authority: 'RECOGNITION_REQUIREMENT_ONLY'")
    && source.includes("source: 'latestMessage explicit customer-owned information only'")
    && source.includes('only when all three tests pass: recognizedItems STATE + CUSTOMER_CONSTRAINT + CONVERSATION')
    && source.includes('constraintBasis=CUSTOMER_ESTABLISHED + constraintRole=OPEN_DECISION_CONDITION + changesDecisionSpace=true'));
check('exact customer evidence and existing reducer/state authority remain unchanged in R2.1 source',
  source.includes('evidence 必须逐字摘自 latestMessage')
    && source.includes('eligibleForIntentLibrary=false'));
check('Deep Recognition still has only the existing primary plus JSON-repair model calls',
  (source.match(/modelGateway\.generate\(/g) || []).length === 2, String((source.match(/modelGateway\.generate\(/g) || []).length));
check('Deep Recognition primary output budget has headroom for the current typed envelope without using the gateway ceiling',
  source.includes('const DEEP_RECOGNITION_PRIMARY_MAX_TOKENS = 3000')
    && source.includes('maxTokens: DEEP_RECOGNITION_PRIMARY_MAX_TOKENS')
    && source.includes('const DEEP_RECOGNITION_PRIMARY_TIMEOUT_MS = 8_000')
    && source.includes('timeoutMs: DEEP_RECOGNITION_PRIMARY_TIMEOUT_MS'));
check('length/schema recovery retains a bounded second-call window instead of being starved by the primary call',
  source.includes('const DEEP_RECOGNITION_TOTAL_BUDGET_MS = 12_000')
    && source.includes('const DEEP_RECOGNITION_REPAIR_MIN_BUDGET_MS = 2_000')
    && source.includes('const DEEP_RECOGNITION_REPAIR_MAX_TOKENS = 1400')
    && source.includes('const DEEP_RECOGNITION_REPAIR_MAX_TIMEOUT_MS = 3_500')
    && source.includes('DEEP_RECOGNITION_TOTAL_BUDGET_MS - result.elapsedMs')
    && source.includes('remainingRecognitionBudgetMs >= DEEP_RECOGNITION_REPAIR_MIN_BUDGET_MS')
    && source.includes('maxTokens: DEEP_RECOGNITION_REPAIR_MAX_TOKENS')
    && source.includes('Math.min(DEEP_RECOGNITION_REPAIR_MAX_TIMEOUT_MS, remainingRecognitionBudgetMs)'));
check('recoveryMode reports only an accepted local repair or an actually attempted model regeneration',
  source.includes("let recoveryMode: 'LOCAL_REPAIR' | 'MODEL_REGENERATION' | null = parsed && firstParse.repaired ? 'LOCAL_REPAIR' : null")
    && source.includes("if (parsed) recoveryMode = repairedParse.repaired ? 'LOCAL_REPAIR' : 'MODEL_REGENERATION'"));
check('natural constraint producer fix contains no observed role/domain/utterance special case',
  !/(utteranceFixture|domainFixture|productFixture|keywordConstraintMap|constraintKeyword)/.test(source));
check('Kernel retains v1.88 R2.1 producer robustness under current v1.100 without a new planner/judge',
  kernel.includes("version: 'hve-3-v1.100'")
    && kernel.includes('R2.1 Natural Constraint Producer Robustness')
    && kernel.includes('existing primary plus JSON-repair call count remain unchanged'));
console.log(`\nR2.1 Natural Constraint Producer Robustness: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
