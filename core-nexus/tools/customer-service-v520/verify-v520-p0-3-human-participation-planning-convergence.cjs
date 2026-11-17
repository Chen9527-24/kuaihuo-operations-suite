#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { loadFinalHumanTurnCompiler, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function syntax(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: rel,
  });
  return !(out.diagnostics || []).some((item) => item.category === ts.DiagnosticCategory.Error);
}

function loadTsModule(rel) {
  const outputText = ts.transpileModule(read(rel), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  }).outputText;
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require, console };
  vm.runInNewContext(outputText, sandbox, { filename: rel });
  return module.exports;
}

const rels = {
  dialogue: 'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts',
  obligation: 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts',
  plan: 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
  participation: 'src/modules/customer-service-agent/runtime/generation/customer-service-role-conditioned-participation.ts',
  authority: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  kernel: 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
};
const sources = Object.fromEntries(Object.entries(rels).map(([key, rel]) => [key, read(rel)]));

check('kernel preserves P0-3 plus R2 ownership closure markers',
  sources.kernel.includes('V1.52 P0-3 Human Participation Planning Convergence')
    && sources.kernel.includes('V1.53 P0-3 R2 Current-Turn Goal Ownership Closure'));
check('fresh-turn dialogue feedback requires a real prior assistant contribution',
  sources.dialogue.includes("if (!input.hasPreviousAssistant) return 'UNCLEAR'")
    && sources.dialogue.includes('Boolean(previousAssistantText)'));
check('boundary continuity cannot inherit a feedback event without a target assistant turn',
  sources.dialogue.includes('previous.feedbackTargetTurnNo === null'));
check('same-focus continuation no longer manufactures implicit expansion delta',
  !sources.obligation.includes('sameFocusContinuationNeedsDelta')
    && !sources.obligation.includes('sameFocusRequiredDelta'));
check('explicit requested specificity and delta remain the single response-scope owner',
  sources.obligation.includes('resolveRequestedSpecificity(')
    && sources.obligation.includes("input.currentResolution.expansionSignal === 'EXHAUSTIVE'")
    && sources.obligation.includes("? 'COMPLETE_CURRENT_FOCUS'"));
check('Required Canonical Acts remain a semantic floor rather than a new P0-3 planner',
  sources.plan.includes("type: 'DIRECT_ANSWER'")
    && sources.plan.includes("type: 'PROVIDE_GENERAL_GUIDANCE'")
    && !/ParticipationAmountPlanner|AdjacentContributionPlanner|CoveragePlanner/.test(sources.plan));
check('Human Participation remains downstream realization-only and cannot alter Acts',
  sources.participation.includes("authority: 'REALIZATION_ONLY'")
    && sources.participation.includes('It never creates, removes, upgrades, suppresses, or reorders Acts'));
check('Final HumanTurn distinguishes sufficient versus complete semantic coverage',
  sources.authority.includes("coverageObligation: 'SUFFICIENT_CURRENT_FOCUS' | 'COMPLETE_CURRENT_FOCUS'")
    && sources.authority.includes("responseTarget.requiredDelta === 'COMPLETE_CURRENT_FOCUS'"));
check('Generation consumes sufficient-versus-complete as the existing semantic coverage boundary',
  sources.prompt.includes('SUFFICIENT_CURRENT_FOCUS 不得被 requestedSpecificity、历史反馈或 Persona 擅自升级为 COMPLETE_CURRENT_FOCUS')
    && sources.prompt.includes('只有现有 Authority 明确给出 COMPLETE_CURRENT_FOCUS 时才承担完整覆盖'));
check('Generation treats existing Required Act parameters as current-turn semantic completion criteria',
  sources.prompt.includes('canonicalPlan.requiredActs[].parameters.target / decisionPurpose / expectedInformationGain')
    && sources.prompt.includes('已选中的 Required value Act 必须在本轮真正完成')
    && sources.prompt.includes('不能把已经授权的核心贡献留给客户下一轮再次索取'));
check('Generation treats existing required semantic delta as a completion criterion',
  sources.prompt.includes('primary.requiredDelta / mustAddBeyondKnown / avoidReframeOnly')
    && sources.prompt.includes('换一种说法、重新分组或重新列出既有内容不能完成该增量')
    && sources.prompt.includes('requiredDelta=NONE 且 mustAddBeyondKnown=false 时不得反向强求新内容'));
check('Final HumanTurn permits relevant adjacent context only inside the selected primary',
  sources.authority.includes("adjacentContextUse: 'OPTIONAL_WITHIN_PRIMARY' | 'NONE'")
    && sources.authority.includes('noUnauthorizedIndependentContribution: true'));
check('P0-3 adds no Runtime wording/length/sentence/bubble budget',
  !/(softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|fixed.{0,8}(chars|sentences|bubbles)|固定.{0,8}(字数|句数|气泡数))/i.test(sources.authority));
check('P0-3 adds no role/domain/test-sentence branch',
  !/(柯基|狗粮|女装|穿搭|牛仔裤|浅灰|roleCode\s*===|industryCode\s*===)/i.test([
    sources.dialogue,
    sources.obligation,
    sources.authority,
  ].join('\n')));
check('P0-3 adds no Planner/Gate/Judge/Repair/Retry/Fallback/model-call authority',
  !/(ParticipationPlanner|ParticipationGate|ParticipationJudge|ParticipationRepair|ParticipationRetry|ParticipationFallback|secondModelCall)/i.test([
    sources.dialogue,
    sources.obligation,
    sources.authority,
    sources.prompt,
  ].join('\n')));

const dialogueModule = loadTsModule(rels.dialogue);
const inferDialogue = dialogueModule.inferCustomerServiceDialogueObligation;
const inheritBoundaries = dialogueModule.inheritPersistentDialogueBoundaries;
check('DialogueObligation compiler is executable', typeof inferDialogue === 'function' && typeof inheritBoundaries === 'function');

if (typeof inferDialogue === 'function' && typeof inheritBoundaries === 'function') {
  const fresh = inferDialogue('不要展开分析，直接告诉我当前怎么选', []);
  check('fresh customer constraint is not fictional prior-response rejection',
    fresh.userFeedback === 'UNCLEAR'
      && fresh.feedbackHandlingMode === 'NONE'
      && fresh.strategyChangeRequired === false,
    JSON.stringify(fresh));

  const priorHistory = [{ role: 'ASSISTANT', content: '可以先按这个方向处理。' }];
  const actualFeedback = inferDialogue('这个回答不对，不要再按这个方向分析了', priorHistory);
  check('real prior-response feedback remains available',
    ['REJECTED', 'CORRECTED'].includes(actualFeedback.userFeedback)
      && actualFeedback.feedbackTargetTurnNo !== null
      && actualFeedback.strategyChangeRequired === true,
    JSON.stringify(actualFeedback));

  const staleBoundaryWithoutTarget = {
    ...actualFeedback,
    feedbackHandlingMode: 'BOUNDARY',
    feedbackTargetTurnNo: null,
    forbiddenRepeatedMoves: ['ANALYZE'],
  };
  const inherited = inheritBoundaries(fresh, staleBoundaryWithoutTarget, '继续看当前问题', 'CONTINUATION');
  check('boundary without assistant target does not persist into later turns',
    inherited.feedbackHandlingMode === fresh.feedbackHandlingMode
      && inherited.strategyChangeRequired === fresh.strategyChangeRequired,
    JSON.stringify(inherited));
}

const obligationModule = loadTsModule(rels.obligation);
const resolveObligation = obligationModule.resolveCustomerServiceAnswerObligation;
check('Canonical Answer Obligation compiler is executable', typeof resolveObligation === 'function');

if (typeof resolveObligation === 'function') {
  const state = {
    recentAssistantMoves: [{
      behavior: {
        planFulfillment: 'FULFILLED',
        interactionPlanV2: { answerFocus: 'COMPARISON' },
      },
    }],
    latestFeedback: null,
  };
  const history = [
    { role: 'CUSTOMER', content: '比较这两个方案。' },
    { role: 'ASSISTANT', content: '它们的主要差异在使用条件。' },
  ];
  const ordinary = resolveObligation({
    interactionType: 'PRODUCT_FACT_QUERY',
    latestCustomerMessage: '这两个方案还有什么区别',
    conversationHistory: history,
    conversationState: state,
    knowledgeEntries: [],
    understanding: null,
  });
  check('ordinary same-focus continuation stays sufficient instead of auto-completing the topic',
    ordinary.responseTarget.requestedSpecificity === 'CONCRETE'
      && ordinary.responseTarget.requiredDelta === 'NONE'
      && ordinary.mustAddNewInformation === false,
    JSON.stringify(ordinary.responseTarget));

  const exhaustive = resolveObligation({
    interactionType: 'PRODUCT_FACT_QUERY',
    latestCustomerMessage: '请完整比较这两个方案的全部差异',
    conversationHistory: history,
    conversationState: state,
    knowledgeEntries: [],
    understanding: null,
  });
  check('explicit complete request still authorizes exhaustive coverage',
    exhaustive.responseTarget.requestedSpecificity === 'EXHAUSTIVE'
      && exhaustive.responseTarget.requiredDelta === 'COMPLETE_CURRENT_FOCUS',
    JSON.stringify(exhaustive.responseTarget));
}

const { compile } = loadFinalHumanTurnCompiler(ROOT);
const contract = {
  persona: { resolvedRoleIdentity: { generationPrompt: { role: 'ROLE_PROMPT', identity: null } } },
};
const sufficient = compile(contract, normalizeFrame({
  serviceRealization: { contribution: { target: 'DIRECT_ANSWER' }, identity: { mode: 'NONE', stopAfterAnswer: false } },
  humanTurnRealization: { turnComposition: { semanticDelta: { responseTarget: { requestedSpecificity: 'DIRECTION', requiredDelta: 'NONE' } } } },
}));
check('ordinary primary is sufficient and may naturally use adjacent lived context',
  sufficient.realization.primary.coverageObligation === 'SUFFICIENT_CURRENT_FOCUS'
    && sufficient.realization.primary.adjacentContextUse === 'OPTIONAL_WITHIN_PRIMARY'
    && sufficient.realization.constraints.noUnauthorizedIndependentContribution === true,
  JSON.stringify(sufficient.realization));

const complete = compile(contract, normalizeFrame({
  serviceRealization: { contribution: { target: 'DIRECT_ANSWER' }, identity: { mode: 'NONE', stopAfterAnswer: false } },
  humanTurnRealization: { turnComposition: { semanticDelta: { responseTarget: { requestedSpecificity: 'EXHAUSTIVE', requiredDelta: 'COMPLETE_CURRENT_FOCUS' } } } },
}));
check('explicit exhaustive primary requires complete current-focus coverage',
  complete.realization.primary.coverageObligation === 'COMPLETE_CURRENT_FOCUS'
    && complete.realization.primary.adjacentContextUse === 'OPTIONAL_WITHIN_PRIMARY',
  JSON.stringify(complete.realization));

const requiredGuidance = compile(contract, normalizeFrame({
  acts: {
    required: [{
      type: 'PROVIDE_GENERAL_GUIDANCE',
      semantic: '当前问题需要实际方向。',
      authorityScope: 'GENERAL_GUIDANCE',
      parameters: {
        target: '客户当前需要解决的事项',
        decisionPurpose: '给出当前可采用的实际方向，不能只解释背景',
        expectedInformationGain: 'ADD_GENERAL_GUIDANCE',
      },
    }],
    preferred: [], optional: [], forbidden: [],
  },
  serviceRealization: {
    currentTurnValue: { mode: 'GENERAL_GUIDANCE', mustAddBeyondKnown: true },
    contribution: { target: 'USEFUL_DIRECTION', avoidReframeOnly: true, contributeBeforeOptionalAsk: false },
    identity: { mode: 'NONE', stopAfterAnswer: false },
  },
  humanTurnRealization: {
    needAlignment: { primaryContribution: 'GUIDE' },
  },
}));
check('Required guidance completion truth survives unchanged into the sole final HumanTurn',
  requiredGuidance.realization.canonicalPlan.requiredActs[0]?.parameters?.expectedInformationGain === 'ADD_GENERAL_GUIDANCE'
    && requiredGuidance.realization.primary.target === 'USEFUL_DIRECTION'
    && requiredGuidance.realization.primary.mustAddBeyondKnown === true
    && requiredGuidance.realization.primary.avoidReframeOnly === true,
  JSON.stringify(requiredGuidance.realization));

const newFacet = compile(contract, normalizeFrame({
  serviceRealization: {
    currentTurnValue: { mode: 'DIRECT', mustAddBeyondKnown: true },
    contribution: { target: 'DIRECT_ANSWER', avoidReframeOnly: true, contributeBeforeOptionalAsk: false },
    identity: { mode: 'NONE', stopAfterAnswer: false },
  },
  humanTurnRealization: {
    needAlignment: { primaryContribution: 'ANSWER' },
    turnComposition: { semanticDelta: { responseTarget: { requestedSpecificity: 'CONCRETE', requiredDelta: 'NEW_FACET' } } },
  },
}));
check('Required NEW_FACET completion truth survives unchanged into the sole final HumanTurn',
  newFacet.realization.primary.requiredDelta === 'NEW_FACET'
    && newFacet.realization.primary.mustAddBeyondKnown === true
    && newFacet.realization.primary.avoidReframeOnly === true,
  JSON.stringify(newFacet.realization.primary));

const close = compile(contract, normalizeFrame({
  serviceRealization: { contribution: { target: 'NONE' }, identity: { mode: 'NONE', stopAfterAnswer: false } },
  humanTurnRealization: {
    needAlignment: { primaryContribution: 'CLOSE' },
    turnComposition: { semanticDelta: { responseTarget: { requestedSpecificity: 'MINIMAL', requiredDelta: 'NONE' } } },
  },
}));
check('closure does not reopen adjacent contribution',
  close.realization.primary.adjacentContextUse === 'NONE',
  JSON.stringify(close.realization.primary));

const answerThenStop = compile(contract, normalizeFrame({
  interaction: { completion: 'STOP_AFTER_REQUIRED' },
  serviceRealization: { contribution: { target: 'DIRECT_ANSWER' }, identity: { mode: 'NONE', stopAfterAnswer: false } },
}));
check('Canonical terminal completion alone closes adjacent contribution after a substantive primary',
  answerThenStop.realization.primary.target === 'DIRECT_ANSWER'
    && answerThenStop.realization.primary.adjacentContextUse === 'NONE',
  JSON.stringify(answerThenStop.realization.primary));

for (const rel of Object.values(rels)) check(`${path.basename(rel)} TypeScript syntax`, syntax(rel));

console.log(`\nP0-3 Human Participation Planning Convergence: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
