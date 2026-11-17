#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@nestjs/common') return { Injectable: () => (target) => target };
  if (request.includes('customer-service-model-gateway.service')) return { CustomerServiceModelGateway: class {} };
  if (request.includes('compile-simulation.dto')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const {
  emptyCustomerServiceConversationStateV2,
  reduceCustomerServiceConversationState,
  selectRelevantCustomerServiceMemories,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function stateTruth(memory = {}) {
  return {
    authority: 'STATE_MUTATION_EVIDENCE_ONLY',
    task: { relation: 'NONE', targetTaskId: null, evidence: '', confidence: 0 },
    memory: { action: 'NONE', targetMemoryId: null, replacementValue: null, evidence: '', confidence: 0, ...memory },
    entity: { action: 'NONE', targetEntityId: null, replacementValue: null, evidence: '', confidence: 0 },
  };
}
function dialogue() {
  return {
    previousAssistantMove: 'UNKNOWN', userFeedback: 'UNCLEAR', feedbackHandlingMode: 'NONE', acknowledgementRequired: false,
    requestedDeltas: [], feedbackTargetTurnNo: null, strategyChangeRequired: false, rejectedMove: null,
    correctionTarget: null, unresolvedNeed: null, repairObligation: false, forbiddenRepeatedMoves: [],
    acceptedConversationStyle: [], currentResponseObligation: '继续当前任务。', evidence: [], confidence: 0.9, source: 'STATE',
  };
}
function goal(key = 'SUPPORT_PURCHASE_DECISION') {
  return { key, name: key, priority: 1000, confidence: 0.95, evidence: ['fixture'], reason: 'fixture', responseRequirement: 'fixture', source: 'MODEL', deferred: false };
}
function taskState(overrides = {}) {
  return {
    currentTurnRelation: 'NEW_REQUEST', activeScenario: 'PRODUCT_CONSULT', activeIntent: 'ASK_INFORMATION',
    status: 'IN_PROGRESS', lastAssistantRequest: null, pendingSlots: [], providedSlots: [], unresolvedGoals: ['完成当前选择'],
    suspendedTasks: [], internalHandling: { required: false, status: 'NONE', scenario: null, reason: null, customerVisibleDisclosure: 'HIDDEN' },
    evidence: ['当前责任：SHARED'], responsibility: 'SHARED', semanticQuestions: [], requestResponseType: 'NONE',
    activeTaskId: null, longHorizonStatus: 'ACTIVE', ...overrides,
  };
}
function constraintItem(evidence, key = 'decision-constraint-compatibility', confidence = 0.96) {
  return {
    recognitionId: `state-${key}`,
    type: 'STATE', key, name: '显式决策约束', description: '客户明确给出的当前选择条件。', confidence,
    evidence: [evidence], isPrimary: false, scope: 'CONVERSATION', continuity: 'NEW', eligibleForIntentLibrary: false,
    suggestedCategory: 'CUSTOMER_CONSTRAINT', suggestedScenario: 'PRODUCT_CONSULT', suggestedPrimaryIntent: 'ASK_INFORMATION', suggestedRiskLevel: 'LOW',
    matchedDefinition: null, matchStatus: 'UNMATCHED', matchScore: 0, matchReason: '', candidate: null,
  };
}
function understanding({ activeTaskId = null, relation = 'NEW_REQUEST', recognizedItems = [], truth = stateTruth(), scenario = 'PRODUCT_CONSULT' } = {}) {
  const g = goal();
  return {
    source: 'MODEL', factOwnership: { authority:'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP', scope:'GENERAL_DOMAIN', confidence:.9, evidence:[], reason:'fixture' },
    primaryScenario: scenario, primaryIntent: 'ASK_INFORMATION', riskLevel:'LOW', emotion:'NEUTRAL', topics:[], intentRanking:[], recognizedItems,
    recognitionModel: { attempted:true, status:'SUCCESS', model:'fixture', requestId:'fixture', elapsedMs:1, errorMessage:null },
    customerRequestedRefund:false, customerRejectedRecommendation:false, requiresHumanReview:false, confidence:.9, reasons:[],
    humanContext: {
      primaryMotive:'PURCHASE_DECISION', secondaryMotives:[], mindset:'TASK_FOCUSED', relationshipState:'OPEN', conversationStance:'FRIENDLY_SERVICE',
      commercialOpenness:'ACTIVE', commercialOpennessScore:80, commercialStrategy:{ stage:'DECISION_SUPPORT', objective:'', discoveryTarget:'', productMentionPolicy:'CATEGORY_ONLY', transitionSignals:[], evidence:[], reason:'' },
      statedNeeds:['完成有依据的选择比较'], inferredNeeds:[], valueOpportunities:[], evidence:[], uncertainties:[],
      emotionalDisclosure:{ detected:false, polarity:'NONE', mode:'NONE', confidence:0, adviceRequested:false, evidence:[] },
      emotionStrategy:{}, interactionStrategy:{}, replyStrategy:{}, semanticMoveBudget:{},
      dominantTurnGoal:g, rankedTurnGoals:[g], requiredTurnGoals:[g], requiredResponseActs:[],
      conversationTaskState:taskState({ currentTurnRelation: relation, activeTaskId }), dialogueObligation:dialogue(), stateTruthSignal:truth,
    },
  };
}
function reduce(previous, message, u, history = []) {
  return reduceCustomerServiceConversationState({
    previous,
    dto: { message, conversationHistory: history, conversationState: previous, customerState: {}, variables: {} },
    understanding: u,
    assistantDraft: null,
    evidenceMessageIds: [`m-${(previous.currentTurn || 0) + 1}`],
  });
}

// Producer: use semantic STATE evidence from the existing recognition call, not lexical rules.
let s0 = emptyCustomerServiceConversationStateV2();
const c1 = '必须兼容现有接口';
let s1 = reduce(s0, `${c1}，部署过程不能停机`, understanding({ recognizedItems:[constraintItem(c1)] }), []);
const createdConstraint = s1.memories.find((item) => item.kind === 'CUSTOMER_CONSTRAINT');
check('explicit recognized decision constraint becomes CUSTOMER_CONSTRAINT memory', Boolean(createdConstraint), JSON.stringify(s1.memories));
check('constraint memory stores exact customer-owned evidence', createdConstraint?.value === c1 && createdConstraint?.evidence.includes(c1), JSON.stringify(createdConstraint));
check('constraint memory is scoped to the existing long-horizon task id', Boolean(createdConstraint && s1.activeTaskId && createdConstraint.key.startsWith(`constraint.${s1.activeTaskId}.`)), JSON.stringify({activeTaskId:s1.activeTaskId, key:createdConstraint?.key}));
check('current-turn constraint is persisted but not projected back into the same turn', Boolean(createdConstraint && !s1.selectedMemoryIds.includes(createdConstraint.id)), JSON.stringify(s1.selectedMemoryIds));
check('canonical explicitFacts consumes CUSTOMER_CONSTRAINT truth', Array.isArray(s1.canonicalFields.explicitFacts.value) && s1.canonicalFields.explicitFacts.value.some((item) => item.key === createdConstraint?.key && item.value === c1), JSON.stringify(s1.canonicalFields.explicitFacts));

// Fail closed: model-derived paraphrase/hallucinated evidence cannot become server-owned customer truth.
let bad = reduce(emptyCustomerServiceConversationStateV2(), '现有系统先保持不动', understanding({ recognizedItems:[constraintItem('必须兼容旧接口')] }), []);
check('non-verbatim recognition evidence cannot create CUSTOMER_CONSTRAINT truth', !bad.memories.some((item) => item.kind === 'CUSTOMER_CONSTRAINT'), JSON.stringify(bad.memories));

// Cross-phrase durability: scoped constraint survives even after its original wording falls out of task anchors.
const scopedMemory = {
  id:'constraint-old', kind:'CUSTOMER_CONSTRAINT', key:'constraint.task-main.decision-constraint-compatibility', value:'必须兼容现有接口', evidence:'必须兼容现有接口', evidenceMessageIds:[],
  sourceTurn:1, confidence:.96, durable:true, temporaryEmotion:false, invalidated:false, withdrawn:false, supersededBy:null, lastUsedTurn:1,
};
const activeTask = {
  id:'task-main', scenario:'PRODUCT_COMPARE', intent:'ASK_INFORMATION', goal:'SUPPORT_PURCHASE_DECISION', status:'ACTIVE', responsibility:'SHARED',
  pendingSlots:[], providedSlots:[], unresolvedGoals:['比较两个升级方案'], completedSteps:[], evidence:[], evidenceMessageIds:[], createdTurn:1, lastActiveTurn:20,
  resolvedTurn:null, resumeSignals:[], anchors:['最近补充一','最近补充二','最近补充三','最近补充四','最近补充五','最近补充六','最近补充七','最近补充八'], proactiveReminderAllowed:false,
};
let selected = selectRelevantCustomerServiceMemories([scopedMemory], '那这两个方案怎么选', [activeTask], 21);
check('active task constraint stays relevant across paraphrases and anchor eviction', selected.some((item) => item.id === scopedMemory.id), JSON.stringify(selected));

// Scope boundary: same words in a different active task must not revive a suspended task constraint.
const suspendedTask = { ...activeTask, status:'SUSPENDED', lastActiveTurn:20 };
const otherTask = { ...activeTask, id:'task-other', createdTurn:21, lastActiveTurn:22, anchors:['新任务也提到兼容'], unresolvedGoals:['新任务'], status:'ACTIVE' };
selected = selectRelevantCustomerServiceMemories([scopedMemory], '这个新任务也要兼容吗', [suspendedTask, otherTask], 23);
check('task-scoped constraint does not bleed into a different active task even with lexical overlap', !selected.some((item) => item.id === scopedMemory.id), JSON.stringify(selected));

// Mutation authority remains the existing exact-id stateTruth path.
const replacementTruth = stateTruth({ action:'SUPERSEDE', targetMemoryId:createdConstraint?.id || null, replacementValue:'可以不兼容现有接口', evidence:'可以不兼容现有接口', confidence:.97 });
let s2 = reduce(s1, '可以不兼容现有接口', understanding({ activeTaskId:s1.activeTaskId, relation:'CONTINUATION', truth:replacementTruth, recognizedItems:[constraintItem('可以不兼容现有接口')] }), []);
check('constraint correction uses existing exact-id SUPERSEDE authority', s2.memories.find((item) => item.id === createdConstraint?.id)?.invalidated === true, JSON.stringify(s2.memories));
check('SUPERSEDE path does not create a second unowned recognition candidate', s2.memories.filter((item) => item.kind === 'CUSTOMER_CONSTRAINT' && !item.invalidated && !item.withdrawn).length === 1, JSON.stringify(s2.memories));

const reducerSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts'), 'utf8');
const deepSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'), 'utf8');
const plannerSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/planning/customer-service-reply-planner.service.ts'), 'utf8');
const compilerSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts'), 'utf8');
const finalHumanSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'), 'utf8');
const kernelSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts'), 'utf8');
const combinedChanged = [deepSrc, reducerSrc, plannerSrc, compilerSrc, kernelSrc].join('\n');

check('Deep Recognition reuses recognizedItems STATE instead of adding a new top-level constraint authority', deepSrc.includes('suggestedCategory=CUSTOMER_CONSTRAINT') && deepSrc.includes("type: 'INTENT|EVENT|STATE'"));
check('Deep Recognition still has only existing primary + JSON-repair model calls', (deepSrc.match(/modelGateway\.generate\(/g) || []).length === 2, String((deepSrc.match(/modelGateway\.generate\(/g) || []).length));
check('State Planning projects explicit facts only when current relevant memories own the key', plannerSrc.includes('relevantExplicitFactKeys') && plannerSrc.includes("['CUSTOMER_FACT', 'CUSTOMER_CONSTRAINT']"));
check('Canonical known inputs now consume existing stateGuidance.explicitFacts', compilerSrc.includes('stateExplicitFacts') && compilerSrc.includes('...stateExplicitFacts'));
check('FinalHumanTurn remains lossless Canonical transport and preserves act known parameters', finalHumanSrc.includes('known: act.parameters.known ? [...act.parameters.known] : undefined'));
check('Generation kernel preserves R2.1 governance under current hve-3-v1.100', kernelSrc.includes("version: 'hve-3-v1.100'") && kernelSrc.includes('V1.85 P0-5 R2.1 Active Constraint Decision Projection'));
check('R2.1 source contains no clothing/location fixture special case', !/(牛仔外套|广州|轻薄)/.test(combinedChanged));
check('R2.1 adds no second planner/gate/judge/repair/retry/fallback authority', !/(RecommendationPlanner|RecommendationGate|RecommendationJudge|ConstraintJudge|ConstraintRepair|RecommendationRetry|RecommendationFallback)/.test(combinedChanged));

console.log(`\nR2.1 Active Constraint Decision Integrity: ${pass}/${pass + fail} PASS`);
if (fail) process.exitCode = 1;
