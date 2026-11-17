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
const {
  resolveCustomerServiceStateTruthSignal,
  alignCustomerServiceConversationTaskStateWithModel,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function stateTruth(overrides = {}) {
  return {
    authority: 'STATE_MUTATION_EVIDENCE_ONLY',
    task: { relation: 'NONE', targetTaskId: null, evidence: '', confidence: 0, ...(overrides.task || {}) },
    memory: { action: 'NONE', targetMemoryId: null, replacementValue: null, evidence: '', confidence: 0, ...(overrides.memory || {}) },
    entity: { action: 'NONE', targetEntityId: null, replacementValue: null, evidence: '', confidence: 0, ...(overrides.entity || {}) },
  };
}
function dialogue(userFeedback = 'UNCLEAR') {
  return {
    previousAssistantMove: 'UNKNOWN', userFeedback, feedbackHandlingMode: 'NONE', acknowledgementRequired: false,
    requestedDeltas: [], feedbackTargetTurnNo: null, strategyChangeRequired: false, rejectedMove: null,
    correctionTarget: null, unresolvedNeed: null, repairObligation: false, forbiddenRepeatedMoves: [],
    acceptedConversationStyle: [], currentResponseObligation: '继续当前真实任务。', evidence: [], confidence: 0.9, source: 'STATE',
  };
}
function taskState(overrides = {}) {
  return {
    currentTurnRelation: 'NEW_REQUEST', activeScenario: 'AFTER_SALE', activeIntent: 'PROBLEM_RESOLUTION',
    status: 'IN_PROGRESS', lastAssistantRequest: null, pendingSlots: [], providedSlots: [], unresolvedGoals: ['继续处理当前问题'],
    suspendedTasks: [], internalHandling: { required: false, status: 'NONE', scenario: null, reason: null, customerVisibleDisclosure: 'HIDDEN' },
    evidence: ['当前责任：SHARED'], responsibility: 'SHARED', semanticQuestions: [], requestResponseType: 'NONE',
    activeTaskId: null, longHorizonStatus: 'ACTIVE', ...overrides,
  };
}
function goal(key = 'RESOLVE_CURRENT_PROBLEM') {
  return { key, name: key, priority: 1000, confidence: 0.95, evidence: ['fixture'], reason: 'fixture', responseRequirement: 'fixture', source: 'MODEL', deferred: false };
}
function understanding({ task = {}, goalKey = 'RESOLVE_CURRENT_PROBLEM', feedback = 'UNCLEAR', truth = stateTruth(), scenario = 'AFTER_SALE', intent = 'PROBLEM_RESOLUTION', confidence = 0.9 } = {}) {
  return {
    primaryScenario: scenario, primaryIntent: intent, confidence, emotion: 'NEUTRAL',
    humanContext: {
      conversationTaskState: taskState(task), dominantTurnGoal: goal(goalKey), rankedTurnGoals: [goal(goalKey)], requiredTurnGoals: [goal(goalKey)],
      dialogueObligation: dialogue(feedback), stateTruthSignal: truth,
      primaryMotive: 'PROBLEM_RESOLUTION', secondaryMotives: [], mindset: 'TASK_FOCUSED', relationshipState: 'OPEN', conversationStance: 'FRIENDLY_SERVICE',
      commercialOpenness: 'CLOSED', commercialOpennessScore: 0, commercialStrategy: { stage:'NO_COMMERCIAL_MOVE' }, statedNeeds: [], inferredNeeds: [], valueOpportunities: [], evidence: [], uncertainties: [],
      emotionalDisclosure: { detected:false, polarity:'NONE', mode:'NONE', confidence:0, adviceRequested:false, evidence:[] },
      emotionStrategy: {}, interactionStrategy: {}, replyStrategy: {}, semanticMoveBudget: {}, requiredResponseActs: [],
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

// Task identity: same task, changed intent/goal -> same server task id.
let s0 = emptyCustomerServiceConversationStateV2();
let s1 = reduce(s0, '设备一直连不上', understanding(), []);
const taskA = s1.activeTaskId;
let s2 = reduce(s1, '那这个一般是什么原因', understanding({
  task: { currentTurnRelation: 'CONTINUATION', activeTaskId: taskA, activeIntent: 'ASK_INFORMATION' },
  goalKey: 'ANSWER_INFORMATION', intent: 'ASK_INFORMATION',
}), [{ role:'CUSTOMER', content:'设备一直连不上' }, { role:'ASSISTANT', content:'先看连接状态' }]);
check('same task survives intent/goal refinement with stable id', s2.activeTaskId === taskA && s2.tasks.find((t) => t.id === taskA)?.intent === 'ASK_INFORMATION', JSON.stringify(s2.tasks));

// Same scenario/intent but semantically new task -> new id, old suspended.
let s3 = reduce(s2, '另外还有一台设备也连不上', understanding({
  task: { currentTurnRelation: 'TOPIC_SHIFT', activeTaskId: null, activeIntent: 'ASK_INFORMATION' },
  goalKey: 'ANSWER_INFORMATION', intent: 'ASK_INFORMATION',
}), [{ role:'CUSTOMER', content:'前一个设备的问题' }, { role:'ASSISTANT', content:'继续排查' }]);
const taskB = s3.activeTaskId;
check('independent same-scenario/same-intent task gets a new id', Boolean(taskB && taskB !== taskA), JSON.stringify(s3.tasks));
check('topic shift suspends the prior task instead of merging it', s3.tasks.find((t) => t.id === taskA)?.status === 'SUSPENDED', JSON.stringify(s3.tasks));

// Semantic resume targets exact old task id.
let s4 = reduce(s3, '回到前面那台设备', understanding({
  task: { currentTurnRelation: 'CONTINUATION', activeTaskId: taskA, longHorizonStatus: 'REOPENED', activeIntent: 'ASK_INFORMATION' },
  goalKey: 'ANSWER_INFORMATION', intent: 'ASK_INFORMATION',
}), [{ role:'CUSTOMER', content:'另一个设备' }, { role:'ASSISTANT', content:'先看第二台' }]);
check('resume reactivates the exact server-owned task id', s4.activeTaskId === taskA && s4.tasks.find((t) => t.id === taskA)?.status === 'REOPENED', JSON.stringify(s4.tasks));
check('resuming one task suspends the task that was active immediately before it', s4.tasks.find((t) => t.id === taskB)?.status === 'SUSPENDED', JSON.stringify(s4.tasks));

// State-truth target validation.
const validationState = { ...s4, activeTaskId: taskA };
let truth = resolveCustomerServiceStateTruthSignal({ task: { relation:'CONTINUE_CURRENT', targetTaskId:taskA, evidence:'继续前面那个', confidence:0.95 } }, '继续前面那个', validationState);
check('stateTruth task mutation accepts only evidence-bound exact active task id', truth.task.relation === 'CONTINUE_CURRENT' && truth.task.targetTaskId === taskA, JSON.stringify(truth.task));
truth = resolveCustomerServiceStateTruthSignal({ task: { relation:'CONTINUE_CURRENT', targetTaskId:'invented-task', evidence:'继续前面那个', confidence:0.99 } }, '继续前面那个', validationState);
check('stateTruth rejects invented task ids', truth.task.relation === 'NONE' && truth.task.targetTaskId === null, JSON.stringify(truth.task));
truth = resolveCustomerServiceStateTruthSignal({ task: { relation:'RESOLVE_CURRENT', targetTaskId:taskA, evidence:'not-in-message', confidence:0.99 } }, '现在还有问题', validationState);
check('stateTruth task mutation requires verbatim latest-turn evidence', truth.task.relation === 'NONE', JSON.stringify(truth.task));
const activeOther = { ...s4.tasks.find((item) => item.id === taskA), id:'task-active-other', status:'ACTIVE', createdTurn:99, lastActiveTurn:99 };
const resumeValidationState = { ...s4, tasks:[...s4.tasks, activeOther] };
truth = resolveCustomerServiceStateTruthSignal({ task: { relation:'RESUME_EXISTING', targetTaskId:'task-active-other', evidence:'回到那个任务', confidence:.97 } }, '回到那个任务', resumeValidationState);
check('RESUME_EXISTING only accepts suspended or resolved task ids', truth.task.relation === 'NONE' && truth.task.targetTaskId === null, JSON.stringify(truth.task));

const abandonEvidence = '这个任务不用继续了';
const abandonTruth = resolveCustomerServiceStateTruthSignal({ task: { relation:'ABANDON_CURRENT', targetTaskId:taskA, evidence:abandonEvidence, confidence:.97 } }, abandonEvidence, { ...s4, activeTaskId:taskA });
const abandonedTaskState = alignCustomerServiceConversationTaskStateWithModel(
  taskState({ currentTurnRelation:'CONTINUATION', activeTaskId:taskA, longHorizonStatus:'ACTIVE' }),
  { intentRanking:[], humanContext:{ dominantTurnGoal:{ key:'CLOSE_CONVERSATION' } } },
  'AFTER_SALE', 'PROBLEM_RESOLUTION', false, abandonEvidence, abandonTruth,
);
const abandonedState = reduce(s4, abandonEvidence, understanding({
  task: abandonedTaskState, goalKey:'CLOSE_CONVERSATION', truth:abandonTruth, scenario:'AFTER_SALE', intent:'PROBLEM_RESOLUTION',
}), []);
check('ABANDON_CURRENT leaves no abandoned task as activeTaskId', abandonedState.tasks.find((item) => item.id === taskA)?.status === 'ABANDONED' && abandonedState.activeTaskId !== taskA, JSON.stringify({activeTaskId:abandonedState.activeTaskId,tasks:abandonedState.tasks}));

// Existing intentRanking continuity can correct lexical false shift/resolution.
const baseTask = taskState({ currentTurnRelation:'TOPIC_SHIFT', activeTaskId:null, longHorizonStatus:'ACTIVE' });
let aligned = alignCustomerServiceConversationTaskStateWithModel(baseTask, {
  intentRanking:[{ role:'PRIMARY', continuity:'CONTINUING', confidence:0.93, evidence:['其实还是刚才那个问题'] }], humanContext:{ dominantTurnGoal:{ key:'ANSWER_INFORMATION' } },
}, 'AFTER_SALE', 'ASK_INFORMATION', true, '其实还是刚才那个问题', stateTruth());
check('evidence-bound CONTINUING demotes lexical false topic shift', aligned.currentTurnRelation === 'CONTINUATION', JSON.stringify(aligned));
aligned = alignCustomerServiceConversationTaskStateWithModel(taskState({ currentTurnRelation:'RESOLUTION', activeTaskId:taskA, longHorizonStatus:'RESOLVED' }), {
  intentRanking:[{ role:'PRIMARY', continuity:'CONTINUING', confidence:0.93, evidence:['没事我再问一下刚才那个'] }], humanContext:{ dominantTurnGoal:{ key:'ANSWER_INFORMATION' } },
}, 'AFTER_SALE', 'ASK_INFORMATION', false, '没事我再问一下刚才那个', stateTruth());
check('evidence-bound CONTINUING demotes lexical false resolution', aligned.currentTurnRelation === 'CONTINUATION' && aligned.longHorizonStatus === 'ACTIVE', JSON.stringify(aligned));
aligned = alignCustomerServiceConversationTaskStateWithModel(taskState({ currentTurnRelation:'CONTINUATION', activeTaskId:taskA }), {
  intentRanking:[{ role:'PRIMARY', continuity:'RESOLVED', confidence:0.94, evidence:['这个问题已经处理好了'] }], humanContext:{ dominantTurnGoal:{ key:'CLOSE_CONVERSATION' } },
}, 'AFTER_SALE', 'PROBLEM_RESOLUTION', false, '这个问题已经处理好了', stateTruth());
check('evidence-bound RESOLVED can close current task lifecycle', aligned.currentTurnRelation === 'RESOLUTION' && aligned.longHorizonStatus === 'RESOLVED', JSON.stringify(aligned));
aligned = alignCustomerServiceConversationTaskStateWithModel(taskState({ currentTurnRelation:'RESOLUTION', activeTaskId:taskA, longHorizonStatus:'RESOLVED' }), {
  intentRanking:[{ role:'PRIMARY', continuity:'RESOLVED', confidence:0.94, evidence:['没事了，不过这个怎么设置'] }], humanContext:{ dominantTurnGoal:{ key:'ANSWER_INFORMATION' } },
}, 'AFTER_SALE', 'ASK_INFORMATION', false, '没事了，不过这个怎么设置', stateTruth());
check('resolved wording cannot close state while the same turn has a substantive operation', aligned.currentTurnRelation === 'CONTINUATION' && aligned.longHorizonStatus === 'ACTIVE', JSON.stringify(aligned));
aligned = alignCustomerServiceConversationTaskStateWithModel(taskState({ currentTurnRelation:'NEW_REQUEST', activeTaskId:null }), { intentRanking:[], humanContext:{ dominantTurnGoal:{ key:'ANSWER_INFORMATION' } } }, 'AFTER_SALE', 'ASK_INFORMATION', false, '第一个问题', stateTruth({ task:{ relation:'START_NEW', evidence:'第一个问题', confidence:.95 } }));
check('START_NEW on an empty lineage stays NEW_REQUEST rather than fake TOPIC_SHIFT', aligned.currentTurnRelation === 'NEW_REQUEST', JSON.stringify(aligned));

// Memory mutation: exact target only.
const memBase = emptyCustomerServiceConversationStateV2();
memBase.currentTurn = 4;
memBase.memories = [
  { id:'m-name', kind:'CUSTOMER_FACT', key:'customer.name', value:'小王', evidence:'我叫小王', evidenceMessageIds:['x1'], sourceTurn:1, confidence:.96, durable:true, temporaryEmotion:false, invalidated:false, withdrawn:false, supersededBy:null, lastUsedTurn:1 },
  { id:'m-pref', kind:'CUSTOMER_PREFERENCE', key:'preference.color', value:'黑色', evidence:'我喜欢黑色', evidenceMessageIds:['x2'], sourceTurn:2, confidence:.9, durable:true, temporaryEmotion:false, invalidated:false, withdrawn:false, supersededBy:null, lastUsedTurn:2 },
];
let memTruth = stateTruth({ memory:{ action:'SUPERSEDE', targetMemoryId:'m-name', replacementValue:'小李', evidence:'我名字改成小李', confidence:.95 } });
let memState = reduce(memBase, '我名字改成小李', understanding({ truth:memTruth, feedback:'CORRECTED', scenario:'CASUAL_CHAT', intent:'CASUAL', task:{ activeScenario:'CASUAL_CHAT', activeIntent:'CASUAL', status:'NONE', currentTurnRelation:'NEW_REQUEST', responsibility:'NONE' }, goalKey:'MAINTAIN_RELATIONSHIP' }), []);
check('correction supersedes only the exact memory target', memState.memories.find((m) => m.id === 'm-name')?.invalidated === true && memState.memories.find((m) => m.id === 'm-pref')?.invalidated === false, JSON.stringify(memState.memories));
check('evidence-bound memory correction writes replacement on the same semantic key', memState.memories.some((m) => m.key === 'customer.name' && m.value === '小李' && !m.invalidated), JSON.stringify(memState.memories));
check('canonical explicitFacts follows active memory truth after correction', Array.isArray(memState.canonicalFields.explicitFacts.value)
  && memState.canonicalFields.explicitFacts.value.some((item) => item.key === 'customer.name' && item.value === '小李')
  && !memState.canonicalFields.explicitFacts.value.some((item) => item.key === 'customer.name' && item.value === '小王'), JSON.stringify(memState.canonicalFields.explicitFacts));

// SUPERSEDE must be atomic: an ungrounded replacement cannot erase old truth.
let invalidReplacement = resolveCustomerServiceStateTruthSignal({
  memory: { action:'SUPERSEDE', targetMemoryId:'m-name', replacementValue:'小李', evidence:'名字要改一下', confidence:.97 },
}, '名字要改一下', memBase);
check('memory SUPERSEDE without verbatim replacement fails closed atomically', invalidReplacement.memory.action === 'NONE' && invalidReplacement.memory.targetMemoryId === null, JSON.stringify(invalidReplacement.memory));

// A real state id that was not exposed in the bounded mutation candidates cannot be targeted.
const hiddenMemoryState = emptyCustomerServiceConversationStateV2();
hiddenMemoryState.currentTurn = 20;
hiddenMemoryState.memories = [{ id:'old-hidden-memory', kind:'CUSTOMER_FACT', key:'customer.budget', value:'预算五百', evidence:'很久以前说过预算五百', evidenceMessageIds:[], sourceTurn:1, confidence:.95, durable:true, temporaryEmotion:false, invalidated:false, withdrawn:false, supersededBy:null, lastUsedTurn:1 }];
let hiddenMemoryTruth = resolveCustomerServiceStateTruthSignal({
  memory: { action:'SUPERSEDE', targetMemoryId:'old-hidden-memory', replacementValue:'新名字', evidence:'现在改成新名字', confidence:.97 },
}, '现在改成新名字', hiddenMemoryState);
check('real memory id outside exposed candidate window is rejected', hiddenMemoryTruth.memory.action === 'NONE' && hiddenMemoryTruth.memory.targetMemoryId === null, JSON.stringify(hiddenMemoryTruth.memory));

// Explicit WITHDRAW removes only its target and canonical truth cannot retain the stale fact.
const withdrawBase = emptyCustomerServiceConversationStateV2();
withdrawBase.currentTurn = 3;
withdrawBase.memories = JSON.parse(JSON.stringify(memBase.memories));
let withdrawState = reduce(withdrawBase, '前面那个名字信息撤掉', understanding({
  truth: stateTruth({ memory:{ action:'WITHDRAW', targetMemoryId:'m-name', evidence:'前面那个名字信息撤掉', confidence:.96 } }),
  feedback:'WITHDRAWN', scenario:'CASUAL_CHAT', intent:'CASUAL',
  task:{ activeScenario:'CASUAL_CHAT', activeIntent:'CASUAL', status:'NONE', currentTurnRelation:'NEW_REQUEST', responsibility:'NONE' },
  goalKey:'MAINTAIN_RELATIONSHIP',
}), []);
check('exact memory WITHDRAW removes only its target', withdrawState.memories.find((m) => m.id === 'm-name')?.withdrawn === true && withdrawState.memories.find((m) => m.id === 'm-pref')?.withdrawn === false, JSON.stringify(withdrawState.memories));
check('canonical fields do not retain withdrawn stale fact', !Array.isArray(withdrawState.canonicalFields.explicitFacts.value) || !withdrawState.canonicalFields.explicitFacts.value.some((item) => item.key === 'customer.name' && item.value === '小王'), JSON.stringify(withdrawState.canonicalFields.explicitFacts));

const unclearBase = emptyCustomerServiceConversationStateV2();
unclearBase.currentTurn = 4;
unclearBase.memories = JSON.parse(JSON.stringify(memBase.memories));
let unclearState = reduce(unclearBase, '刚才那个我说错了', understanding({ feedback:'CORRECTED', scenario:'CASUAL_CHAT', intent:'CASUAL', task:{ activeScenario:'CASUAL_CHAT', activeIntent:'CASUAL', status:'NONE', currentTurnRelation:'NEW_REQUEST', responsibility:'NONE' }, goalKey:'MAINTAIN_RELATIONSHIP' }), []);
check('unclear correction fails closed instead of invalidating latest unrelated memory', unclearState.memories.find((m) => m.id === 'm-name')?.invalidated === false && unclearState.memories.find((m) => m.id === 'm-pref')?.invalidated === false, JSON.stringify(unclearState.memories));

// Entity mutation: no PERSON-type-wide clearing.
const entBase = emptyCustomerServiceConversationStateV2();
entBase.currentTurn = 2;
entBase.entities = [
  { id:'e-self', type:'PERSON', canonicalValue:'小王', semanticKey:'customer.name', aliases:[], sourceTurns:[1], invalidated:false, lastSeenTurn:1 },
  { id:'e-friend', type:'PERSON', canonicalValue:'阿杰', semanticKey:'contact.friend', aliases:[], sourceTurns:[2], invalidated:false, lastSeenTurn:2 },
];
let entTruth = stateTruth({ entity:{ action:'SUPERSEDE', targetEntityId:'e-self', replacementValue:'小李', evidence:'我名字改成小李', confidence:.96 } });
let entState = reduce(entBase, '我名字改成小李', understanding({ truth:entTruth, feedback:'CORRECTED', scenario:'CASUAL_CHAT', intent:'CASUAL', task:{ activeScenario:'CASUAL_CHAT', activeIntent:'CASUAL', status:'NONE', currentTurnRelation:'NEW_REQUEST', responsibility:'NONE' }, goalKey:'MAINTAIN_RELATIONSHIP' }), []);
check('entity correction invalidates only exact target entity', entState.entities.find((e) => e.id === 'e-self')?.invalidated === true && entState.entities.find((e) => e.id === 'e-friend')?.invalidated === false, JSON.stringify(entState.entities));
check('entity replacement preserves semantic key and old value as alias', entState.entities.some((e) => e.semanticKey === 'customer.name' && e.canonicalValue === '小李' && e.aliases.includes('小王') && !e.invalidated), JSON.stringify(entState.entities));

let invalidEntityReplacement = resolveCustomerServiceStateTruthSignal({
  entity: { action:'SUPERSEDE', targetEntityId:'e-self', replacementValue:'小李', evidence:'名字要改一下', confidence:.97 },
}, '名字要改一下', entBase);
check('entity SUPERSEDE without verbatim replacement fails closed atomically', invalidEntityReplacement.entity.action === 'NONE' && invalidEntityReplacement.entity.targetEntityId === null, JSON.stringify(invalidEntityReplacement.entity));

const hiddenEntityState = emptyCustomerServiceConversationStateV2();
hiddenEntityState.currentTurn = 30;
hiddenEntityState.entities = Array.from({ length: 21 }, (_, index) => ({
  id:`entity-${index}`, type:'PERSON', canonicalValue:`人物${index}`, semanticKey:`person.${index}`, aliases:[], sourceTurns:[index + 1], invalidated:false, lastSeenTurn:index + 1,
}));
let hiddenEntityTruth = resolveCustomerServiceStateTruthSignal({
  entity: { action:'SUPERSEDE', targetEntityId:'entity-0', replacementValue:'新人物', evidence:'现在改成新人物', confidence:.97 },
}, '现在改成新人物', hiddenEntityState);
check('real entity id outside exposed candidate window is rejected', hiddenEntityTruth.entity.action === 'NONE' && hiddenEntityTruth.entity.targetEntityId === null, JSON.stringify(hiddenEntityTruth.entity));

// Durable != relevant.
const memories = [
  { id:'old-black', kind:'CUSTOMER_PREFERENCE', key:'preference.color', value:'我喜欢黑色', evidence:'上次说我喜欢黑色', evidenceMessageIds:[], sourceTurn:1, confidence:.95, durable:true, temporaryEmotion:false, invalidated:false, withdrawn:false, supersededBy:null, lastUsedTurn:1 },
  { id:'order', kind:'CUSTOMER_FACT', key:'order.reference', value:'订单 A12345', evidence:'我的订单 A12345 一直没动', evidenceMessageIds:[], sourceTurn:8, confidence:.95, durable:true, temporaryEmotion:false, invalidated:false, withdrawn:false, supersededBy:null, lastUsedTurn:8 },
];
const taskForMemory = [{ id:'t1', scenario:'ORDER_STATUS', intent:'ASK_INFORMATION', goal:'ANSWER_INFORMATION', status:'ACTIVE', responsibility:'SHARED', pendingSlots:[], providedSlots:[], unresolvedGoals:['订单 A12345 状态'], completedSteps:[], evidence:[], evidenceMessageIds:[], createdTurn:8, lastActiveTurn:9, resolvedTurn:null, resumeSignals:[], anchors:['订单 A12345 一直没动'], proactiveReminderAllowed:false }];
let selected = selectRelevantCustomerServiceMemories(memories, '物流现在到哪了', taskForMemory, 10);
check('durable but unrelated memory is not projected as relevant', !selected.some((m) => m.id === 'old-black'), JSON.stringify(selected));
check('durable memory remains available when it overlaps active task lineage', selected.some((m) => m.id === 'order'), JSON.stringify(selected));

const reducerSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts'), 'utf8');
const deepSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'), 'utf8');
const taskSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-conversation-task-state.ts'), 'utf8');
const generationPromptSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts'), 'utf8');
check('scenario:intent is no longer used as the long-horizon task identity lookup', !reducerSrc.includes('`${current.activeScenario}:${current.activeIntent}`') && reducerSrc.includes('stable task id survives scenario/intent/goal'));
check('latest-active memory invalidation path is retired', !reducerSrc.includes('const latestActive = [...memories].reverse().find'));
check('PERSON type-wide invalidation path is retired', !reducerSrc.includes("for (const item of entities) if (item.type === 'PERSON') item.invalidated = true"));
check('durable no longer grants relevance by itself', !reducerSrc.includes('score >= 3 || item.durable') && reducerSrc.includes('durability is retention metadata'));
check('canonical fact/preference projection is rebuilt from non-invalidated memory truth', reducerSrc.includes('const activeMemories = input.memories.filter') && reducerSrc.includes('更正或撤回后不继续保留旧值'));
check('stateTruth is evidence-only and validated against server ids', deepSrc.includes('STATE_MUTATION_EVIDENCE_ONLY') && deepSrc.includes('stateTruth rejects') === false && deepSrc.includes('activeMemoryIds') && deepSrc.includes('activeEntityIds'));
check('parse-repair contract preserves stateTruthSignal instead of dropping state mutation evidence', deepSrc.includes('stateTruthSignal 若原任务存在也必须保留') && deepSrc.includes('target ID 不得自造'));
check('stateTruthSignal is not projected into HVE3 generation prompt', !generationPromptSrc.includes('stateTruthSignal'));
check('R1 adds no MemoryGate/TaskJudge/CorrectionRepair/StateFallback authority', !/(MemoryGate|TaskJudge|CorrectionRepair|EntityRepair|StateFallback)/.test(reducerSrc + deepSrc + taskSrc));
check('Deep Recognition still has only primary + repair model calls', (deepSrc.match(/modelGateway\.generate\(/g) || []).length === 2, String((deepSrc.match(/modelGateway\.generate\(/g) || []).length));

console.log(`\nR1 Long-Horizon State Truth Hardening: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
