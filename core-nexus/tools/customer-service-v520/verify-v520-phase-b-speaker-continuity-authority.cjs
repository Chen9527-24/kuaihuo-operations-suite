#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const rel = (p) => path.join(root, p);
const promptRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const finalAuthorityRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const humanTurnRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts';
const stateTypeRel = 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.type.ts';
const stateReducerRel = 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts';
const canonicalStateRel = 'src/modules/customer-service-agent/runtime/state/customer-service-canonical-conversation-state.service.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';

const read = (p) => fs.readFileSync(rel(p), 'utf8');
const promptSrc = read(promptRel);
const finalAuthoritySrc = read(finalAuthorityRel);
const humanTurnSrc = read(humanTurnRel);
const stateTypeSrc = read(stateTypeRel);
const stateReducerSrc = read(stateReducerRel);
const canonicalStateSrc = read(canonicalStateRel);
const kernelSrc = read(kernelRel);

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const modelFrameStart = promptSrc.indexOf('function buildHveModelFacingGenerationFrame');
const modelFrameEnd = promptSrc.indexOf('function projectModelFacingSpeaker', modelFrameStart);
const modelFrame = promptSrc.slice(modelFrameStart, modelFrameEnd);
const systemStart = promptSrc.indexOf('function buildHumanConversationSystemPrompt');
const systemEnd = promptSrc.indexOf('function buildHveModelFacingGenerationFrame', systemStart);
const system = promptSrc.slice(systemStart, systemEnd);
const speakerTurnsStart = modelFrame.indexOf('const priorSpeakerTurns =');
const speakerTurnsEnd = modelFrame.indexOf('const relevantMemories =', speakerTurnsStart);
const speakerTurnsProjection = modelFrame.slice(speakerTurnsStart, speakerTurnsEnd);

check('ConversationStateV2 remains the single persisted state owner for assistant history',
  /assistantMoveLedger:\s*CustomerServiceAssistantMoveLedgerEntry\[\]/.test(stateTypeSrc)
  && /recentAssistantMoves:\s*CustomerServiceAssistantMoveLedgerEntry\[\]/.test(stateTypeSrc));
check('Canonical state folds platform-observed account messages into the existing state owner',
  canonicalStateSrc.includes('reduceCustomerServiceObservedAssistantAction({')
  && canonicalStateSrc.includes('assistantText: event.textContent'));
check('Observed assistant history records actual customer-visible text instead of a new persona state',
  stateReducerSrc.includes('excerpt: truncate(text, 160)')
  && !/(speakerMemory|personaMemory|relationshipMemory|speakerContinuityState)/.test(stateTypeSrc));
check('HumanTurn exposes the bounded relevance-selected assistant moves as lived conversation context',
  /recentAssistantMoves:\s*state\.recentAssistantMoves\.slice\(0, 6\)/.test(humanTurnSrc));

check('Generation now consumes observed prior speaker turns from existing Conversation Reality',
  /const priorSpeakerTurns = conversationReality\.recentAssistantMoves/.test(modelFrame)
  && /priorSpeakerTurns,/.test(modelFrame));
check('Prior speaker evidence is least-privilege and excludes inferred move/strategy/behavior labels',
  /turn:\s*item\.turn/.test(speakerTurnsProjection)
  && /excerpt:\s*item\.excerpt/.test(speakerTurnsProjection)
  && /accepted:\s*item\.accepted/.test(speakerTurnsProjection)
  && /rejected:\s*item\.rejected/.test(speakerTurnsProjection)
  && !/requestedDeltas:/.test(speakerTurnsProjection)
  && !/(move:|strategyKey:|openingKey:|endingKey:|behavior:|actionFamilies:)/.test(speakerTurnsProjection));
check('Historical deltas remain server-owned while current feedback is the only model-facing delta owner',
  /requestedDeltas:\s*\[\.\.\.\(item\.requestedDeltas/.test(humanTurnSrc)
    && /currentFeedback:[\s\S]*requestedDeltas:/.test(finalAuthoritySrc));
check('Speaker-history evidence cannot become a second current-turn behavior authority',
  system.includes('priorSpeakerTurns')
  && system.includes('仅是只读连续事实')
  && system.includes('不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则')
  && system.includes('当前轮语义责任仍只由 humanPresence.realization 提供'));
check('Final model-facing HumanTurn remains the one compiled WHAT/HOW-MUCH authority',
  /humanPresence:\s*compileCustomerServiceFinalModelFacingHumanTurn\(contract, frame\)/.test(modelFrame)
  && /authority:\s*'FINAL_MODEL_FACING_HUMAN_TURN_V1'/.test(finalAuthoritySrc));
check('B continuity consumption does not restore retired parallel model-facing authorities',
  !/sharedContext\s*:|relationshipContinuity\s*:|speakerPresence\s*:|speakerPresenceFidelity\s*:|surfaceTexture\s*:/.test(promptSrc));
check('B continuity consumption adds no planner/gate/judge/repair/retry/model call',
  !/(SpeakerContinuityPlanner|SpeakerContinuityGate|RelationshipJudge|PersonaRepair|ContinuityRewrite|ContinuityRetry|secondModelCall)/i.test(promptSrc));
check('B continuity projection has no role/domain/test-sentence/keyword runtime branch',
  !/(roleCode|industry|domain\s*===|宠物|柯基|服饰|穿搭|SaaS|售后|外卖|咬沙发|敲门|牛仔裤|亚麻|includes\(['\"])/i.test(speakerTurnsProjection));
check('No fixed output length/sentence/bubble quota is introduced by B continuity projection',
  !/(softMaxChars|maxSentences|maxQuestions|maxMessageSegments|fixed.{0,12}(?:chars|sentences|bubbles)|固定.{0,8}(?:字数|句数|气泡数)|最多.{0,8}(?:字|句|泡|气泡))/i.test(speakerTurnsProjection));
check('Generation kernel preserves Phase B speaker-continuity governance through cross-turn continuity convergence',
  kernelSrc.includes('V1.38 Phase B Speaker Continuity Consumption')
  && kernelSrc.includes('V1.39 Phase B Relationship Truth Producer Convergence')
  && kernelSrc.includes('V1.47 Cross-Turn Human Continuity First Convergence'));

for (const [file, src] of [
  [promptRel, promptSrc],
  [finalAuthorityRel, finalAuthoritySrc],
  [humanTurnRel, humanTurnSrc],
  [stateTypeRel, stateTypeSrc],
  [stateReducerRel, stateReducerSrc],
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

console.log(`\nPhase B Speaker Continuity Authority: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
