#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.includes('compile-simulation.dto')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const rel = (p) => path.join(root, p);
const stateReducerRel = 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts';
const stateTypeRel = 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.type.ts';
const humanTurnRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts';
const promptRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const finalAuthorityRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const stateReducerSrc = read(stateReducerRel);
const stateTypeSrc = read(stateTypeRel);
const humanTurnSrc = read(humanTurnRel);
const promptSrc = read(promptRel);
const finalAuthoritySrc = read(finalAuthorityRel);
const kernelSrc = read(kernelRel);
const {
  selectRelevantCustomerServiceAssistantMoves,
} = require(rel(stateReducerRel));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

function move(turn, excerpt) {
  return {
    turn,
    move: 'ANSWER',
    actionFamilies: [],
    practicalActionFamilies: [],
    interpersonalActionFamilies: [],
    strategyKey: '',
    openingKey: '',
    endingKey: '',
    accepted: null,
    rejected: false,
    requestedDeltas: [],
    excerpt,
    behavior: null,
  };
}
function task(overrides = {}) {
  return {
    id: 'task-1', scenario: 'GENERAL_SERVICE', intent: 'ASK_INFORMATION', goal: '继续当前选择', status: 'ACTIVE', responsibility: 'SHARED',
    pendingSlots: [], providedSlots: [], unresolvedGoals: [], completedSteps: [], evidence: [], evidenceMessageIds: [], createdTurn: 1, lastActiveTurn: 8,
    resolvedTurn: null, resumeSignals: [], anchors: [], proactiveReminderAllowed: false, ...overrides,
  };
}

const ledger = [
  move(1, '我前面更推荐浅灰色，因为你深色裤子比较多，深浅搭配更利落'),
  move(2, '我们后来聊了上衣版型'),
  move(3, '也说过面料垂感'),
  move(4, '补充了通勤场景'),
  move(5, '最近一轮先看尺码'),
  move(6, '最近一轮继续确认长度'),
  move(7, '最近一轮讨论鞋子'),
  move(8, '最近一轮说到外套'),
];
const relevant = selectRelevantCustomerServiceAssistantMoves(ledger, '你之前为什么更推荐浅灰色来着', [task()], 6);
check('older relevant speaker position can survive the fixed six-turn projection',
  relevant.some((item) => item.turn === 1) && relevant.length === 6,
  JSON.stringify(relevant.map((item) => [item.turn, item.excerpt])));
check('the newest four observed speaker turns are always retained',
  [5, 6, 7, 8].every((turn) => relevant.some((item) => item.turn === turn)),
  JSON.stringify(relevant.map((item) => item.turn)));

const openLoopLedger = [
  move(1, '你回去量一下腰围，量好直接把数字发我就行'),
  move(2, '后面聊了颜色'),
  move(3, '后面聊了鞋子'),
  move(4, '后面聊了包'),
  move(5, '后面聊了外套'),
  move(6, '后面聊了天气'),
  move(7, '后面聊了通勤'),
  move(8, '后面聊了活动'),
];
const openLoop = selectRelevantCustomerServiceAssistantMoves(openLoopLedger, '74', [task({
  goal: '等待客户补充腰围',
  pendingSlots: ['waist'],
  unresolvedGoals: ['确认腰围后继续尺码判断'],
  anchors: ['你回去量一下腰围，量好直接把数字发我就行'],
})], 6);
check('active-task lineage can retain an older speaker request even when the new customer message is terse',
  openLoop.some((item) => item.turn === 1),
  JSON.stringify(openLoop.map((item) => [item.turn, item.excerpt])));

const unrelated = selectRelevantCustomerServiceAssistantMoves(ledger, '完全换个新话题', [task({ goal: '新话题', anchors: ['完全换个新话题'] })], 6);
check('without a relevant older match the selector falls back to the recent six turns',
  JSON.stringify(unrelated.map((item) => item.turn)) === JSON.stringify([3, 4, 5, 6, 7, 8]),
  JSON.stringify(unrelated.map((item) => item.turn)));

check('ConversationStateV2 remains the only persisted continuity owner',
  /assistantMoveLedger:\s*CustomerServiceAssistantMoveLedgerEntry\[\]/.test(stateTypeSrc)
  && !/(speakerPositionState|humanContinuityState|sharedRealityState|openLoopState)/.test(stateTypeSrc));
check('state summary uses relevance plus recency over the existing assistant ledger',
  /selectRelevantCustomerServiceAssistantMoves\(\s*state\.assistantMoveLedger,\s*latestMessage,\s*state\.tasks,\s*6,?\s*\)/s.test(stateReducerSrc));
check('active task exposes only bounded existing open-loop truth needed for resume',
  /pendingSlots:\s*\[\.\.\.\(state\.activeTask\.pendingSlots/.test(humanTurnSrc)
  && /providedSlots:\s*\[\.\.\.\(state\.activeTask\.providedSlots/.test(humanTurnSrc)
  && /anchors:\s*\[\.\.\.\(state\.activeTask\.anchors/.test(humanTurnSrc));
check('recent suspended tasks remain server-owned but cannot reopen Generation outside current Canonical activeTask',
  /recentSuspendedTasks:\s*\(state\.suspendedTasks/.test(humanTurnSrc)
  && !/recentSuspendedTasks:\s*conversationReality\.recentSuspendedTasks\.map/.test(promptSrc)
  && /activeTask:\s*frame\.context\.activeTask/.test(promptSrc));
check('relevant correction and withdrawal memories may survive when the existing memory selector selects them',
  humanTurnSrc.includes("'CORRECTION', 'WITHDRAWAL'")
  && /const relevantMemories = conversationReality\.relevantMemories/.test(promptSrc)
  && /relevantMemories,/.test(promptSrc));
check('prior speaker evidence includes factual turn order but no inferred strategy/persona labels',
  /turn:\s*item\.turn/.test(promptSrc)
  && /excerpt:\s*item\.excerpt/.test(promptSrc)
  && !/priorSpeakerTurns:[\s\S]{0,600}(?:strategyKey|openingKey|endingKey|roleBehavior|expressionPlan)/.test(promptSrc));
check('continuity evidence cannot become current-turn behavior authority',
  promptSrc.includes('仅是只读连续事实')
  && promptSrc.includes('不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则')
  && promptSrc.includes('当前轮语义责任仍只由 humanPresence.realization 提供'));
check('FINAL_MODEL_FACING_HUMAN_TURN_V1 stays the single current-turn semantic authority',
  finalAuthoritySrc.includes("authority: 'FINAL_MODEL_FACING_HUMAN_TURN_V1'")
  && !/(CONTINUITY_PLANNER|SPEAKER_POSITION_AUTHORITY|OPEN_LOOP_AUTHORITY)/.test(promptSrc + humanTurnSrc));
check('cross-turn continuity adds no role/domain/test-sentence/fixed-output special case',
  !/(宠物|服饰|SaaS|售后|roleCode|industry|domain\s*===|maxSentences|softMaxChars|maxMessageSegments)/i.test(
    stateReducerSrc.slice(stateReducerSrc.indexOf('export function selectRelevantCustomerServiceAssistantMoves'), stateReducerSrc.indexOf('export function selectRelevantCustomerServiceMemories')),
  ));
check('kernel records v1.47 cross-turn human continuity without replacing earlier authorities',
  kernelSrc.includes('V1.46 Human Realization HOW Authority Final Clearance')
  && kernelSrc.includes('V1.47 Cross-Turn Human Continuity First Convergence'));

for (const [file, src] of [
  [stateReducerRel, stateReducerSrc],
  [humanTurnRel, humanTurnSrc],
  [promptRel, promptSrc],
  [finalAuthorityRel, finalAuthoritySrc],
  [kernelRel, kernelSrc],
]) {
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: file,
  });
  check(`${path.basename(file)} TypeScript syntax`,
    !(transpiled.diagnostics || []).some((d) => d.category === ts.DiagnosticCategory.Error));
}

console.log(`\nPhase B Cross-Turn Human Continuity: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
