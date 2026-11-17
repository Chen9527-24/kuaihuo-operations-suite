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
  normalizeCustomerServiceRecognitionEvidence,
  resolveCustomerServiceRecognizedDominantTurnGoal,
  shouldPreserveCustomerServiceCurrentTurnGoalAcrossScenario,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'));
const {
  inferCustomerServiceDialogueObligation,
  reconcileCustomerServiceDialogueObligationWithModelSignal,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts'));
const {
  CustomerServiceInteractionTypeResolver,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function goal(key, evidence, confidence = 0.9) {
  return { key, name:key, priority:1500, confidence, evidence, reason:'fixture', responseRequirement:'fixture', source:'MODEL', deferred:false };
}

const scalarEvidence = normalizeCustomerServiceRecognitionEvidence('谢谢，我先按这个方向观察两天。', 4);
check('bounded scalar model evidence remains available to current-turn ownership',
  scalarEvidence.length === 1 && scalarEvidence[0] === '谢谢，我先按这个方向观察两天。',
  JSON.stringify(scalarEvidence));
const arrayEvidence = normalizeCustomerServiceRecognitionEvidence(['当前问题', '当前问题', '相邻条件'], 4);
check('array model evidence remains bounded and de-duplicated',
  JSON.stringify(arrayEvidence) === JSON.stringify(['当前问题', '相邻条件']),
  JSON.stringify(arrayEvidence));

const closeGoal = goal('CLOSE_CONVERSATION', scalarEvidence, 0.9);
const staleServiceGoal = goal('RESOLVE_CURRENT_PROBLEM', ['历史风险任务'], 0.96);
const selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'CLOSE_CONVERSATION', priority:1500, confidence:0.9, evidence:scalarEvidence, source:'MODEL' },
  [staleServiceGoal, closeGoal],
  staleServiceGoal,
  '好的，谢谢，我先按这个方向观察两天。',
);
check('scalar evidence can preserve the evidence-bound close over stale task priority',
  selected.key === 'CLOSE_CONVERSATION', JSON.stringify(selected));

check('settled close survives inherited safety context without current risk evidence',
  shouldPreserveCustomerServiceCurrentTurnGoalAcrossScenario({
    scenario:'SAFETY_SENSITIVE', goal:closeGoal,
    latestMessage:'好的，谢谢，我先按这个方向观察两天。',
    hasCurrentTurnHardScenarioEvidence:false, settledClosure:true,
  }) === true);
check('current hard safety evidence still outranks a conflicting close',
  shouldPreserveCustomerServiceCurrentTurnGoalAcrossScenario({
    scenario:'SAFETY_SENSITIVE', goal:closeGoal,
    latestMessage:'好的，谢谢，我先按这个方向观察两天。',
    hasCurrentTurnHardScenarioEvidence:true, settledClosure:true,
  }) === false);
check('unsettled close cannot bypass inherited safety context',
  shouldPreserveCustomerServiceCurrentTurnGoalAcrossScenario({
    scenario:'SAFETY_SENSITIVE', goal:closeGoal,
    latestMessage:'好的，谢谢，我先按这个方向观察两天。',
    hasCurrentTurnHardScenarioEvidence:false, settledClosure:false,
  }) === false);

const latest = '行，我会按刚才的建议观察。还有一个相关情况也需要同样处理吗？';
const priorHistory = [{ role:'ASSISTANT', content:'先减少高强度动作并观察状态。' }];
const base = inferCustomerServiceDialogueObligation(latest, priorHistory);
const splitEvidenceFeedback = reconcileCustomerServiceDialogueObligationWithModelSignal(base, {
  userFeedback:'PARTIALLY_ACCEPTED', previousAdviceOutcome:'TRIED_PARTIAL',
  requestedDeltas:['ANSWER_PREVIOUS_QUESTION'], correctionTarget:null,
  evidence:'行，我会按刚才的建议观察。', confidence:0.82,
}, {
  message:latest,
  previousAssistantText:priorHistory[0].content,
  currentTurnGoalEvidence:['还有一个相关情况也需要同样处理吗？'],
});
check('feedback-only evidence cannot turn a separately evidenced new request into previous-answer refinement',
  !splitEvidenceFeedback.requestedDeltas.includes('ANSWER_PREVIOUS_QUESTION')
    && splitEvidenceFeedback.strategyChangeRequired === false
    && splitEvidenceFeedback.repairObligation === false,
  JSON.stringify(splitEvidenceFeedback));

const repairLatest = '你还没有回答我刚才的问题，请先回答我刚才的问题。';
const repairBase = inferCustomerServiceDialogueObligation(repairLatest, priorHistory);
const ownedRepair = reconcileCustomerServiceDialogueObligationWithModelSignal(repairBase, {
  userFeedback:'INSUFFICIENT', previousAdviceOutcome:'NONE',
  requestedDeltas:['ANSWER_PREVIOUS_QUESTION'], correctionTarget:'CONTENT',
  evidence:'请先回答我刚才的问题。', confidence:0.9,
}, {
  message:repairLatest,
  previousAssistantText:priorHistory[0].content,
  currentTurnGoalEvidence:['请先回答我刚才的问题。'],
});
check('evidence-owned prior-question repair remains active',
  ownedRepair.requestedDeltas.includes('ANSWER_PREVIOUS_QUESTION')
    && ownedRepair.strategyChangeRequired === true,
  JSON.stringify(ownedRepair));

function understanding({ currentSafetyEvidence = false, pending = false } = {}) {
  return {
    primaryScenario:'SAFETY_SENSITIVE', primaryIntent:'ASK_INFORMATION',
    topics:[{ scenario:'SAFETY_SENSITIVE', intent:'ASK_INFORMATION', riskLevel:'HIGH', priority:1000, confidence:0.9, evidence:currentSafetyEvidence ? ['当前轮明确命中'] : ['前文主题：SAFETY_SENSITIVE'] }],
    humanContext:{
      dominantTurnGoal:closeGoal,
      requiredTurnGoals:[closeGoal],
      conversationTaskState:{ currentTurnRelation:'CONTINUATION', status:'IN_PROGRESS', pendingSlots:pending ? [{ status:'MISSING' }] : [] },
      dialogueObligation:{ userFeedback:'ACCEPTED', requestedDeltas:[], strategyChangeRequired:false },
    },
  };
}
const resolver = new CustomerServiceInteractionTypeResolver();
let interaction = resolver.resolve({ understanding:understanding(), plan:{}, knowledgeAvailable:false, latestCustomerMessage:'好的，谢谢，我先观察。' });
check('settled inherited-safety close reaches ordinary closure interaction', interaction === 'CASUAL_CHAT', interaction);
interaction = resolver.resolve({ understanding:understanding({ currentSafetyEvidence:true }), plan:{}, knowledgeAvailable:false, latestCustomerMessage:'当前仍有风险。' });
check('current safety evidence keeps SECURITY_SENSITIVE interaction', interaction === 'SECURITY_SENSITIVE', interaction);
interaction = resolver.resolve({ understanding:understanding({ pending:true }), plan:{}, knowledgeAvailable:false, latestCustomerMessage:'先到这里。' });
check('required missing information keeps SECURITY_SENSITIVE interaction', interaction === 'SECURITY_SENSITIVE', interaction);

const deepSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'), 'utf8');
const dialogueSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts'), 'utf8');
const interactionSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts'), 'utf8');
const joined = `${deepSrc}\n${dialogueSrc}\n${interactionSrc}`;
check('R2 uses evidence ownership and existing Authorities without utterance/role/domain fixtures',
  joined.includes('currentTurnGoalEvidence')
    && joined.includes('hasCurrentTurnHardScenarioEvidence')
    && !/(今晚回去|卧室门|护肤|精华|床上|roleCode\s*===|industryCode\s*===)/i.test(joined));
check('R2 adds no output formatting or post-generation control',
  !/(P0.?3 R2[^\n]*(softMaxChars|bubble|segmentCount|post-generation rewrite))/i.test(joined));
check('R2 adds no Planner/Gate/Judge/Repair/Retry/Fallback/model call',
  !/(CurrentTurnGoalPlanner|ClosureGate|ClosureJudge|ClosureRepair|ClosureRetry|ClosureFallback|secondModelCall)/i.test(joined));

console.log(`\nP0-3 R2 Current-Turn Goal Ownership Closure: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
