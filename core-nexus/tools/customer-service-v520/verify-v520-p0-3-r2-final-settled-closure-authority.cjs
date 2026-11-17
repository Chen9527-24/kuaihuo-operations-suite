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
  shouldConvergeCustomerServiceSettledAcceptanceToClosure,
  resolveCustomerServiceModelCurrentTurnGoal,
  resolveCustomerServiceRawModelTurnGoals,
  resolveCustomerServiceFeedbackOwnershipEvidence,
  alignCustomerServiceHumanContextWithResolvedModelCurrentGoal,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'));
const {
  resolveCustomerServiceDialogueFeedbackEvidence,
  inferCustomerServiceDialogueObligation,
  reconcileCustomerServiceDialogueObligationWithModelSignal,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts'));
const {
  resolveCustomerServiceAnswerObligation,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

function goal(key, evidence, source = 'STATE', confidence = 0.94) {
  return { key, name:key, priority:1600, confidence, evidence, reason:'fixture', responseRequirement:'fixture', source, deferred:false };
}
function context({
  feedback = 'ACCEPTED',
  source = 'MODEL',
  deltas = [],
  strategyChangeRequired = false,
  repairObligation = false,
  unresolvedNeed = null,
  pendingSlots = [],
  dominant = goal('ANSWER_INFORMATION', ['历史任务']),
} = {}) {
  return {
    dominantTurnGoal:dominant,
    rankedTurnGoals:[dominant],
    conversationTaskState:{ pendingSlots },
    dialogueObligation:{
      userFeedback:feedback, source, confidence:0.9, requestedDeltas:deltas,
      strategyChangeRequired, repairObligation, unresolvedNeed,
    },
  };
}
function decision(overrides = {}) {
  return shouldConvergeCustomerServiceSettledAcceptanceToClosure({
    context:overrides.context || context(),
    rawModelCurrentGoal:overrides.rawModelCurrentGoal || null,
    rawModelTurnGoals:overrides.rawModelTurnGoals || [],
    dialogueFeedbackEvidence:overrides.dialogueFeedbackEvidence || null,
    feedbackOwnershipEvidence:overrides.feedbackOwnershipEvidence || [],
    latestMessage:overrides.latestMessage || '收到，我按这个处理。',
    previousAssistantText:Object.prototype.hasOwnProperty.call(overrides, 'previousAssistantText')
      ? overrides.previousAssistantText
      : '上一轮已经给出处理方向。',
    hasCurrentTurnHardScenarioEvidence:Boolean(overrides.hasCurrentTurnHardScenarioEvidence),
  });
}

check('accepted feedback alone cannot replace the current turn goal with closure', decision() === false);
check('an evidence-owned current close may converge through the existing closure path', decision({
  rawModelCurrentGoal:goal('CLOSE_CONVERSATION', ['收到，我按这个处理。'], 'MODEL', 0.94),
  context:context({ dominant:goal('CLOSE_CONVERSATION', ['收到，我按这个处理。'], 'MODEL', 0.94) }),
}) === true);
const receptionOnlyMessage = 'The previous contribution is accepted and complete.';
const receptionOnlyContext = context({
  dominant:goal('RESPOND_TO_SHARED_CONTEXT', [receptionOnlyMessage], 'MODEL', 0.94),
});
receptionOnlyContext.rankedTurnGoals.push(
  goal('MAINTAIN_RELATIONSHIP', [receptionOnlyMessage], 'MODEL', 0.9),
);
check('feedback-owned reception-only goals converge without requiring a second close detector', decision({
  context:receptionOnlyContext,
  dialogueFeedbackEvidence:receptionOnlyMessage,
  latestMessage:receptionOnlyMessage,
}) === true);
check('a reception goal with independently evidenced new sharing remains open', decision({
  context:context({ dominant:goal('RESPOND_TO_SHARED_CONTEXT', ['A separate new life update.'], 'MODEL', 0.94) }),
  dialogueFeedbackEvidence:'The previous contribution is accepted.',
  latestMessage:'The previous contribution is accepted. A separate new life update.',
}) === false);
const acceptedPlanMessage = '明白了，我之后会按这个方向试试看。';
const acceptedPlanGoals = [
  goal('RESPOND_TO_SHARED_CONTEXT', ['我之后会按这个方向试试看。'], 'MODEL', 0.95),
  goal('MAINTAIN_RELATIONSHIP', ['明白了'], 'MODEL', 0.9),
];
check('raw model reception-only goals owned across accepted feedback items converge before stale scenario fallback', decision({
  context:context({ dominant:goal('ANSWER_INFORMATION', ['历史任务'], 'STATE', 0.94) }),
  rawModelTurnGoals:acceptedPlanGoals,
  dialogueFeedbackEvidence:'明白了',
  feedbackOwnershipEvidence:['我之后会按这个方向试试看。'],
  latestMessage:acceptedPlanMessage,
}) === true);
check('raw model reception goal cannot hide an independently evidenced current answer obligation', decision({
  rawModelCurrentGoal:goal('ANSWER_INFORMATION', ['另外请回答新问题'], 'MODEL', 0.95),
  rawModelTurnGoals:[
    goal('RESPOND_TO_SHARED_CONTEXT', ['明白了'], 'MODEL', 0.95),
    goal('ANSWER_INFORMATION', ['另外请回答新问题'], 'MODEL', 0.95),
  ],
  dialogueFeedbackEvidence:'明白了',
  feedbackOwnershipEvidence:['明白了'],
  latestMessage:'明白了，另外请回答新问题',
}) === false);

const acceptedPayload = {
  recognizedItems:[{
    type:'EVENT', key:'accepted-plan', confidence:.95,
    evidence:['我之后会按这个方向试试看。'],
    constraintBasis:'FEEDBACK_OR_ACCEPTANCE', constraintRole:'FEEDBACK_ONLY', changesDecisionSpace:false,
  }],
  humanContext:{
    dominantTurnGoal:{ key:'RESPOND_TO_SHARED_CONTEXT', priority:1000, confidence:.95, evidence:['我之后会按这个方向试试看。'], deferred:false },
    rankedTurnGoals:[
      { key:'RESPOND_TO_SHARED_CONTEXT', priority:1000, confidence:.95, evidence:['我之后会按这个方向试试看。'], deferred:false },
      { key:'MAINTAIN_RELATIONSHIP', priority:700, confidence:.9, evidence:['明白了'], deferred:false },
    ],
  },
};
const acceptedPayloadGoals = resolveCustomerServiceRawModelTurnGoals(acceptedPayload, acceptedPlanMessage);
const acceptedPayloadOwnership = resolveCustomerServiceFeedbackOwnershipEvidence(acceptedPayload, acceptedPlanMessage);
check('raw goal reader preserves evidence-bound reception goals from the same Deep Recognition result',
  acceptedPayloadGoals.length === 2
    && acceptedPayloadGoals.every((item) => ['RESPOND_TO_SHARED_CONTEXT', 'MAINTAIN_RELATIONSHIP'].includes(item.key)),
  JSON.stringify(acceptedPayloadGoals));
check('structured FEEDBACK_ONLY recognized item supplies ownership without a phrase detector',
  acceptedPayloadOwnership.length === 1 && acceptedPayloadOwnership[0] === '我之后会按这个方向试试看。',
  JSON.stringify(acceptedPayloadOwnership));
check('fresh turn cannot manufacture previous-response closure', decision({ previousAssistantText:'' }) === false);
check('evidence-owned current request outranks acceptance closure', decision({
  latestMessage:'收到。另外请说明当前的新问题。',
  rawModelCurrentGoal:goal('ANSWER_INFORMATION', ['请说明当前的新问题。'], 'MODEL', 0.94),
}) === false);
check('accepted feedback cannot erase an evidence-owned current obligation even when spans overlap', decision({
  latestMessage:'Acknowledged state for this turn.',
  dialogueFeedbackEvidence:'Acknowledged state for this turn.',
  rawModelCurrentGoal:goal('ANSWER_INFORMATION', ['Acknowledged state for this turn.'], 'MODEL', 0.94),
}) === false);
check('distinct verbatim goal evidence still outranks accepted closure', decision({
  latestMessage:'Acknowledged. Provide the independent current item.',
  dialogueFeedbackEvidence:'Acknowledged.',
  rawModelCurrentGoal:goal('ANSWER_INFORMATION', ['Provide the independent current item.'], 'MODEL', 0.94),
}) === false);
check('explicit current semantic goal outranks acceptance closure', decision({
  latestMessage:'收到。另外请说明当前的新问题。',
  context:context({ dominant:goal('ANSWER_INFORMATION', ['请说明当前的新问题。'], 'EXPLICIT', 0.94) }),
}) === false);
check('current hard safety evidence outranks acceptance closure', decision({ hasCurrentTurnHardScenarioEvidence:true }) === false);
check('required missing input outranks acceptance closure', decision({
  context:context({ pendingSlots:[{ status:'MISSING' }] }),
}) === false);
check('requested response delta cannot be closed', decision({ context:context({ deltas:['MORE_SPECIFIC'] }) }) === false);
check('correction or repair cannot be closed', decision({
  context:context({ feedback:'CORRECTED', strategyChangeRequired:true, repairObligation:true }),
}) === false);
check('unresolved current need cannot be closed', decision({
  context:context({ unresolvedNeed:'仍需完成当前请求' }),
}) === false);
check('unowned heuristic uncertainty cannot manufacture closure', decision({
  context:context({ source:'STATE' }),
}) === false);

check('existing dialogue-feedback signal projects validated verbatim evidence',
  resolveCustomerServiceDialogueFeedbackEvidence({
    userFeedback:'ACCEPTED', previousAdviceOutcome:'NONE', requestedDeltas:[], correctionTarget:null,
    evidence:'Acknowledged.', confidence:0.94,
  }, 'Acknowledged. Provide the independent current item.') === 'Acknowledged.');
check('invalid or non-verbatim feedback evidence cannot affect ownership',
  resolveCustomerServiceDialogueFeedbackEvidence({
    userFeedback:'ACCEPTED', previousAdviceOutcome:'NONE', requestedDeltas:[], correctionTarget:null,
    evidence:'Absent evidence.', confidence:0.94,
  }, 'Acknowledged.') === null);

const recapConfirmationMessage = '我理解的是先按已有步骤处理，再观察后续结果，对吗？';
const recapConfirmationEvidence = '先按已有步骤处理，再观察后续结果，对吗？';
const previousContribution = '可以先按已有步骤处理，完成后再观察后续结果。';
const recapBaseObligation = inferCustomerServiceDialogueObligation(
  recapConfirmationMessage,
  [{ role:'ASSISTANT', content:previousContribution }],
);
const recapAcceptedObligation = reconcileCustomerServiceDialogueObligationWithModelSignal(
  recapBaseObligation,
  {
    userFeedback:'ACCEPTED', previousAdviceOutcome:'NONE', requestedDeltas:[], correctionTarget:null,
    evidence:recapConfirmationEvidence, confidence:0.93,
  },
  {
    message:recapConfirmationMessage,
    previousAssistantText:previousContribution,
    currentTurnGoalEvidence:[recapConfirmationEvidence],
  },
);
check('bounded recap confirmation compiles through existing DialogueObligation as accepted without an outcome claim',
  recapAcceptedObligation.userFeedback === 'ACCEPTED'
    && recapAcceptedObligation.requestedDeltas.length === 0
    && recapAcceptedObligation.strategyChangeRequired === false
    && recapAcceptedObligation.source === 'MODEL',
  JSON.stringify(recapAcceptedObligation));
const recapConfirmationContext = context({
  dominant:goal('CLOSE_CONVERSATION', [recapConfirmationEvidence], 'MODEL', 0.93),
});
recapConfirmationContext.dialogueObligation = recapAcceptedObligation;
check('a bounded recap closes only when the current Turn Goal itself owns closure',
  decision({
    context:recapConfirmationContext,
    rawModelCurrentGoal:goal('CLOSE_CONVERSATION', [recapConfirmationEvidence], 'MODEL', 0.93),
    dialogueFeedbackEvidence:recapConfirmationEvidence,
    latestMessage:recapConfirmationMessage,
    previousAssistantText:previousContribution,
  }) === true);
check('recap plus independently evidenced new condition remains open',
  decision({
    context:context({ dominant:goal('ANSWER_INFORMATION', ['如果出现新情况该怎么处理？'], 'MODEL', 0.93) }),
    rawModelCurrentGoal:goal('ANSWER_INFORMATION', ['如果出现新情况该怎么处理？'], 'MODEL', 0.93),
    dialogueFeedbackEvidence:'我理解前面的步骤了。',
    latestMessage:'我理解前面的步骤了。如果出现新情况该怎么处理？',
    previousAssistantText:previousContribution,
  }) === false);

const contradictoryModelGoal = resolveCustomerServiceModelCurrentTurnGoal({
  humanContext:{
    dominantTurnGoal:goal('CLOSE_CONVERSATION', ['我明白了，但还有一个新条件要确认。'], 'MODEL', 0.94),
    rankedTurnGoals:[
      goal('CLOSE_CONVERSATION', ['我明白了，但还有一个新条件要确认。'], 'MODEL', 0.94),
      goal('ANSWER_INFORMATION', ['还有一个新条件要确认。'], 'MODEL', 0.92),
    ],
  },
}, '我明白了，但还有一个新条件要确认。');
check('a model-ranked current obligation resolves an internally contradictory dominant close',
  contradictoryModelGoal?.key === 'ANSWER_INFORMATION', JSON.stringify(contradictoryModelGoal));
const pureModelClose = resolveCustomerServiceModelCurrentTurnGoal({
  humanContext:{
    dominantTurnGoal:goal('CLOSE_CONVERSATION', ['收到，我先按这个处理。'], 'MODEL', 0.94),
    rankedTurnGoals:[goal('CLOSE_CONVERSATION', ['收到，我先按这个处理。'], 'MODEL', 0.94)],
  },
}, '收到，我先按这个处理。');
check('a coherent evidence-owned close remains the current Turn Goal',
  pureModelClose?.key === 'CLOSE_CONVERSATION', JSON.stringify(pureModelClose));
const contradictoryNormalizedContext = context({
  dominant:goal('CLOSE_CONVERSATION', ['我明白了，但还有一个新条件要确认。'], 'MODEL', 0.94),
});
contradictoryNormalizedContext.rankedTurnGoals.push(
  goal('ANSWER_INFORMATION', ['还有一个新条件要确认。'], 'MODEL', 0.92),
);
const alignedCurrentGoalContext = alignCustomerServiceHumanContextWithResolvedModelCurrentGoal(
  contradictoryNormalizedContext,
  contradictoryModelGoal,
);
check('the resolved current obligation becomes the HumanContext dominant Turn Goal consumed downstream',
  alignedCurrentGoalContext.dominantTurnGoal.key === 'ANSWER_INFORMATION'
    && alignedCurrentGoalContext.rankedTurnGoals[0].key === 'ANSWER_INFORMATION',
  JSON.stringify(alignedCurrentGoalContext.rankedTurnGoals));

const closeGoal = goal('CLOSE_CONVERSATION', ['收到，我按这个处理。'], 'SIGNAL', 0.94);
const closeUnderstanding = {
  primaryScenario:'GENERAL_INQUIRY', primaryIntent:'CASUAL',
  humanContext:{
    dominantTurnGoal:closeGoal, requiredTurnGoals:[closeGoal],
    conversationTaskState:{ pendingSlots:[] },
    dialogueObligation:{ requestedDeltas:[], unresolvedNeed:null },
  },
};
const answer = resolveCustomerServiceAnswerObligation({
  interactionType:'CASUAL_CHAT',
  latestCustomerMessage:'收到，我按这个处理。',
  conversationHistory:[{ role:'ASSISTANT', content:'上一轮已经给出处理方向。' }],
  conversationState:{ recentAssistantMoves:[] },
  knowledgeEntries:[],
  understanding:closeUnderstanding,
});
check('existing Answer Obligation receives conversational closure',
  answer.currentFocus === 'CONVERSATIONAL_CLOSURE'
    && answer.responseTarget.requiredDelta === 'NONE'
    && answer.responseTarget.requestedSpecificity === 'MINIMAL'
    && answer.responseTarget.unresolvedNeed === null,
  JSON.stringify(answer.responseTarget));

const deepSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'), 'utf8');
const answerSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts'), 'utf8');
const planSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts'), 'utf8');
const kernelSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts'), 'utf8');
const joined = `${deepSrc}\n${answerSrc}\n${planSrc}`;
check('closure is aligned before inherited scenario and task context',
  deepSrc.indexOf('const settledClosureAlignedHumanContext = alignHumanContextWithSettledAcceptedClosure(')
    < deepSrc.search(/alignHumanContextWithScenarioContract\(\s*settledClosureAlignedHumanContext/));
check('recognition asks for minimal separately owned feedback and goal spans',
  deepSrc.includes('使用足以证明该信号的最小原文片段')
    && deepSrc.includes('feedback evidence 只引用反馈片段')
    && deepSrc.includes('current goal evidence 只引用新请求片段'));
check('recognition contract owns semantic recap confirmation without treating question form as a new task',
  deepSrc.includes('复述、归纳或核对前述内容本身不等同于新的信息请求')
    && deepSrc.includes('previousAdviceOutcome=NONE')
    && deepSrc.includes('不能单独授权 CLOSE_CONVERSATION')
    && deepSrc.includes('不能把每次答完后的正常停顿误当成结束交流'));
check('recognition keeps reception-only goals from masking a completed accepted turn',
  deepSrc.includes('RESPOND_TO_SHARED_CONTEXT 和 MAINTAIN_RELATIONSHIP 只表示客户本轮提供了独立的新分享')
    && deepSrc.includes('不能作为接受、认可或感谢上一轮完整贡献的兜底标签')
    && deepSrc.includes('必须把它的最小原文证据与 feedback evidence 分开'));
check('existing canonical plan emits one required natural close',
  planSrc.includes("type: 'NATURAL_CLOSE'")
    && planSrc.includes("necessity: 'REQUIRED'")
    && planSrc.includes("focus === 'CONVERSATIONAL_CLOSURE'"));
check('kernel records generalized prior-contribution reception recognition convergence',
  kernelSrc.includes("version: 'hve-3-v1.99'")
    && kernelSrc.includes('V1.58 P0-3 Prior-Contribution Reception Recognition Convergence')
    && kernelSrc.includes('V1.68 P0-3 Current Obligation Before Closure Seal')
    && kernelSrc.includes('V1.69 P0-3 Required Contribution Realization Regression Closure')
    && kernelSrc.includes('V1.70 P0-3 Reception-only Closure Regression Convergence')
    && kernelSrc.includes('V1.71 P0-3 Required Semantic Delta Realization Seal')
    && kernelSrc.includes('V1.72 P0-5 R1.3 Acknowledgement Authority Execution')
    && kernelSrc.includes('V1.77 P0-5 R1.7 Current Execution and Historical Surface Authority Separation')
    && kernelSrc.includes('V1.78 P0-5 R1.8 Prompt Principle Consolidation')
    && kernelSrc.includes('V1.79 P0-5 R1.9 Persona HOW Signal Reduction')
    && kernelSrc.includes('V1.80 P0-5 R1.10 Functional Emotional Boundary Calibration')
    && kernelSrc.includes('V1.81 P0-3 Regression Canonical Completion Execution Boundary Convergence')
    && kernelSrc.includes('V1.82 P0-3 Pre-Reply Exchange-State Temporal Demotion')
    && kernelSrc.includes('V1.83 P0-5 R1.11 Embedded Evaluative Reception Functional Deletion Boundary'));
check('R2 Final adds no utterance, role, domain, format, length, or segmentation authority',
  !/(roleCode\s*===|industryCode\s*===|softMaxChars|segmentCount|bubbleCount|sentenceCount)/i.test(joined));
check('R2 Final adds no Planner/Gate/Judge/Repair/Retry/Fallback/model call',
  !/(SettledClosurePlanner|SettledClosureGate|SettledClosureJudge|SettledClosureRepair|SettledClosureRetry|SettledClosureFallback|secondModelCall)/i.test(joined));

console.log(`\nP0-3 R2 Final Settled Closure Authority: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
