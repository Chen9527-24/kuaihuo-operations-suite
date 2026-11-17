#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const {
  inferCustomerServiceDialogueObligation,
  reconcileCustomerServiceDialogueObligationWithModelSignal,
} = require(path.join(
  root,
  'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts',
));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const history = [
  { role: 'USER', content: '先给我一个方向。' },
  { role: 'ASSISTANT', content: '先按两个判断维度看：一个看材料，一个看结构。' },
];

function fallback(message, customHistory = history) {
  return inferCustomerServiceDialogueObligation(message, customHistory);
}
function signal({
  userFeedback = 'UNCLEAR', previousAdviceOutcome = 'NONE', requestedDeltas = [],
  correctionTarget = null, evidence, accepted = '', insufficient = '', rejected = '', corrected = '', confidence = 0.99,
}) {
  return {
    userFeedback, previousAdviceOutcome, requestedDeltas, correctionTarget,
    evidence, confidence,
    receptionEvidence: { accepted, insufficient, rejected, corrected },
  };
}
function reconcile(message, modelSignal, currentTurnGoalEvidence = [], customHistory = history, currentTurnGoalKey = null) {
  const current = fallback(message, customHistory);
  const final = reconcileCustomerServiceDialogueObligationWithModelSignal(current, modelSignal, {
    message,
    previousAssistantText: [...customHistory].reverse().find((item) => item.role === 'ASSISTANT')?.content || '',
    currentTurnGoalEvidence,
    currentTurnGoalKey,
  });
  return { current, final };
}

for (const message of [
  '这个方向可以，版型先不用再讲了。',
  '重点不是版型，而是你把我的尺码条件理解反了。',
  '别讲大道理，直接告诉我怎么选。',
  '还是太笼统，再具体一点。',
  '我说的是先做第二步，不是先做第一步。',
]) {
  const value = fallback(message);
  check(`raw wording fallback is neutral: ${message.slice(0, 10)}`,
    value.userFeedback === 'UNCLEAR'
      && value.feedbackHandlingMode === 'NONE'
      && value.requestedDeltas.length === 0
      && value.strategyChangeRequired === false
      && value.correctionTarget === null
      && value.rejectedMove === null,
    JSON.stringify(value));
}

let result = reconcile(
  '这个方向可以，第一部分再具体一点。',
  signal({
    userFeedback: 'ACCEPTED', requestedDeltas: ['MORE_SPECIFIC'], evidence: '这个方向可以', accepted: '这个方向可以',
  }),
  ['第一部分再具体一点'],
).final;
check('typed accepted reception can coexist with MORE_SPECIFIC without manufacturing correction',
  result.userFeedback === 'ACCEPTED'
    && result.requestedDeltas.includes('MORE_SPECIFIC')
    && result.feedbackHandlingMode === 'NONE'
    && result.correctionTarget === null,
  JSON.stringify(result));
check('typed MORE_SPECIFIC alone is a refinement preference, not forced strategy repair',
  result.strategyChangeRequired === false && result.rejectedMove === null && result.forbiddenRepeatedMoves.length === 0,
  JSON.stringify(result));

result = reconcile(
  '重点不是版型，而是你把我的尺码条件理解反了。',
  signal({
    userFeedback: 'CORRECTED', correctionTarget: 'CONTENT', evidence: '理解反了', corrected: '理解反了',
  }),
).final;
check('evidence-bound typed correction owns CORRECT handling',
  result.userFeedback === 'CORRECTED' && result.feedbackHandlingMode === 'CORRECT'
    && result.correctionTarget === 'CONTENT' && result.strategyChangeRequired === true,
  JSON.stringify(result));

result = reconcile(
  '别讲大道理，直接告诉我怎么选。',
  signal({
    userFeedback: 'REJECTED', requestedDeltas: ['MORE_DIRECT'], correctionTarget: 'INTERACTION',
    evidence: '别讲大道理', rejected: '别讲大道理',
  }),
).final;
check('evidence-bound typed rejection owns interaction boundary without reparsing prior assistant prose',
  result.userFeedback === 'REJECTED' && result.feedbackHandlingMode === 'BOUNDARY'
    && result.requestedDeltas.includes('MORE_DIRECT') && result.correctionTarget === 'INTERACTION'
    && result.rejectedMove === null && result.forbiddenRepeatedMoves.length === 0,
  JSON.stringify(result));

result = reconcile(
  '直接一点告诉我怎么选。',
  signal({ userFeedback: 'UNCLEAR', requestedDeltas: ['MORE_DIRECT'], evidence: '直接一点' }),
).final;
check('typed presentation delta does not manufacture reception truth',
  result.userFeedback === 'UNCLEAR' && result.feedbackHandlingMode === 'NONE'
    && result.requestedDeltas.includes('MORE_DIRECT') && result.correctionTarget === null,
  JSON.stringify(result));
check('strategy-changing typed presentation delta can still alter realization without inventing feedback',
  result.strategyChangeRequired === true, JSON.stringify(result));

result = reconcile(
  '前一部分我已经明白了，后一部分我还是没太弄懂，只解释后一部分。',
  signal({
    userFeedback: 'PARTIALLY_ACCEPTED', evidence: '前一部分我已经明白了，后一部分我还是没太弄懂',
    accepted: '前一部分我已经明白了', insufficient: '后一部分我还是没太弄懂',
  }),
  ['只解释后一部分'],
).final;
check('separate typed accepted and insufficient evidence projects PARTIALLY_ACCEPTED',
  result.userFeedback === 'PARTIALLY_ACCEPTED' && result.feedbackHandlingMode === 'REFINE'
    && result.rejectedMove === null,
  JSON.stringify(result));

result = reconcile(
  '还是太笼统，再具体一点。',
  signal({
    userFeedback: 'INSUFFICIENT', requestedDeltas: ['MORE_SPECIFIC'], evidence: '还是太笼统', insufficient: '还是太笼统',
  }),
).final;
check('typed insufficient reception remains REFINE rather than rejection',
  result.userFeedback === 'INSUFFICIENT' && result.feedbackHandlingMode === 'REFINE'
    && result.requestedDeltas.includes('MORE_SPECIFIC') && result.rejectedMove === null,
  JSON.stringify(result));

result = reconcile(
  '我照着试了还是没用，换个方向。',
  signal({
    userFeedback: 'UNCLEAR', previousAdviceOutcome: 'TRIED_INEFFECTIVE', evidence: '照着试了还是没用',
  }),
).final;
check('typed ineffective outcome becomes INSUFFICIENT plus DIFFERENT_APPROACH',
  result.userFeedback === 'INSUFFICIENT'
    && result.requestedDeltas.includes('DIFFERENT_APPROACH')
    && result.unresolvedNeed !== null,
  JSON.stringify(result));

const invalid = reconcile(
  '这个思路可以，再具体一点。',
  signal({
    userFeedback: 'REJECTED', requestedDeltas: ['DIFFERENT_APPROACH'], correctionTarget: 'CONTENT',
    evidence: '不存在的证据', rejected: '不存在的证据',
  }),
  ['再具体一点'],
).final;
check('non-verbatim model feedback fails closed to neutral semantic state',
  invalid.userFeedback === 'UNCLEAR'
    && invalid.requestedDeltas.length === 0
    && invalid.feedbackHandlingMode === 'NONE'
    && invalid.strategyChangeRequired === false
    && invalid.correctionTarget === null,
  JSON.stringify(invalid));

const noPrior = reconcile(
  '这个方向可以，直接一点。',
  signal({
    userFeedback: 'ACCEPTED', requestedDeltas: ['MORE_DIRECT'], evidence: '直接一点', accepted: '这个方向可以',
  }),
  [],
  [],
).final;
check('without prior assistant contribution, model cannot invent acceptance/rejection truth',
  noPrior.userFeedback === 'UNCLEAR' && noPrior.correctionTarget === null,
  JSON.stringify(noPrior));
check('without prior assistant contribution, evidence-bound presentation delta may still apply',
  noPrior.requestedDeltas.includes('MORE_DIRECT'), JSON.stringify(noPrior));

const answerPrevious = reconcile(
  '你还没回答我刚才那个问题。',
  signal({ userFeedback: 'UNCLEAR', requestedDeltas: ['ANSWER_PREVIOUS_QUESTION'], evidence: '还没回答我刚才那个问题' }),
  ['还没回答我刚才那个问题'],
).final;
check('ANSWER_PREVIOUS_QUESTION survives only when typed feedback evidence owns the same current-goal span',
  answerPrevious.requestedDeltas.includes('ANSWER_PREVIOUS_QUESTION'), JSON.stringify(answerPrevious));
const unrelatedAnswerPrevious = reconcile(
  '语气直接一点，同时回答新的尺码问题。',
  signal({ userFeedback: 'UNCLEAR', requestedDeltas: ['ANSWER_PREVIOUS_QUESTION'], evidence: '语气直接一点' }),
  ['回答新的尺码问题'],
).final;
check('ANSWER_PREVIOUS_QUESTION is removed when typed feedback evidence does not own the current-goal span',
  !unrelatedAnswerPrevious.requestedDeltas.includes('ANSWER_PREVIOUS_QUESTION'), JSON.stringify(unrelatedAnswerPrevious));

const fresh = fallback('这个思路可以，再具体一点。', []);
check('fresh raw turn cannot invent prior-response reception or strategy change',
  fresh.userFeedback === 'UNCLEAR' && fresh.strategyChangeRequired === false && fresh.feedbackTargetTurnNo === null,
  JSON.stringify(fresh));

const source = fs.readFileSync(
  path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts'),
  'utf8',
);
check('DialogueFeedbackSignal is the only customer open-language feedback owner in this module',
  source.includes('reconcileCustomerServiceDialogueObligationWithModelSignal')
    && !source.includes('inferRequestedDeltas(')
    && !source.includes('inferFeedbackType(')
    && !source.includes('resolveDeterministicDialogueFeedbackSource(')
    && !/(MixedFeedbackJudge|IncrementalValueJudge|SecondPlanner|FeedbackRepairModel)/.test(source));
check('assistant-move surface observer cannot create hidden customer rejection authority',
  source.includes('rejectedMove: null') && source.includes('forbiddenRepeatedMoves: []'));
check('patch contains no domain/product/test-fixture special cases',
  !/(120到150|克重|纤维比例|办公室|青禾|衬衫|PRODUCT:QH)/i.test(source));

console.log(`\nR2.5 Mixed Feedback DialogueObligation: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
