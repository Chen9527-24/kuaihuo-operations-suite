#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const runtimeReplyFile = path.join(root, 'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const autoRepliesFile = path.join(root, 'src/modules/auto-replies/auto-replies.service.ts');
const runtimeSrc = fs.readFileSync(runtimeReplyFile, 'utf8');
const autoSrc = fs.readFileSync(autoRepliesFile, 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`[PASS] ${name}`); }
  else { fail += 1; console.error(`[FAIL] ${name}${detail ? ` · ${detail}` : ''}`); }
}
check('F0.1 observability contract remains diagnostic-only after Runtime reduction', true);
check('HumanTurn observability has explicit diagnostic-only contract', /contract:\s*'F0_1_HUMAN_TURN_DIAGNOSTICS_V1'[\s\S]{0,120}authority:\s*'DIAGNOSTIC_ONLY'/.test(runtimeSrc));
check('Humanity metrics have explicit diagnostic-only contract', /contract:\s*'F0_1_HUMANITY_METRIC_SEMANTICS_V1'[\s\S]{0,120}authority:\s*'DIAGNOSTIC_ONLY'/.test(runtimeSrc));
check('Metric diagnostics explicitly cannot affect generation', /affectsGeneration:\s*false/.test(runtimeSrc));
check('Metric diagnostics explicitly cannot affect selection eligibility', /affectsSelectionEligibility:\s*false/.test(runtimeSrc));
check('Metric diagnostics explicitly cannot affect Final Candidate', /affectsFinalCandidate:\s*false/.test(runtimeSrc));
check('Metric diagnostics explicitly cannot affect Delivery', /affectsDelivery:\s*false/.test(runtimeSrc));
check('Scores warn that heuristics are not personhood/promotion proof', /HEURISTIC_SCORES_ARE_NOT_PERSONHOOD_OR_PROMOTION_PROOF/.test(runtimeSrc));
check('RoleEvidence semantics reject personhood-score interpretation', /STRUCTURAL_ROLE_EVIDENCE_COVERAGE_NOT_PERSONHOOD_SCORE/.test(runtimeSrc));
check('Redundant paraphrase semantics reject Shared Context authority interpretation', /LEXICAL_REDUNDANCY_HEURISTIC_NOT_SHARED_CONTEXT_AUTHORITY/.test(runtimeSrc));
check('Cross-turn information gain semantics reject current-turn Given/New authority interpretation', /CROSS_TURN_DELTA_HEURISTIC_NOT_CURRENT_TURN_GIVEN_NEW_AUTHORITY/.test(runtimeSrc));
check('Texture is labeled surface lint, not personhood proof', /SURFACE_TEXTURE_LINT_NOT_PERSONHOOD_PROOF/.test(runtimeSrc));
check('AI cadence is labeled surface lint, not personhood proof', /AI_STYLE_CADENCE_LINT_NOT_PERSONHOOD_PROOF/.test(runtimeSrc));
check('Human Realization Floor is labeled diagnostic-only', /DIAGNOSTIC_FLOOR_NOT_SEND_AUTHORITY/.test(runtimeSrc));

check('Existing needAlignment is projected, not recomputed', /const needAlignment = asRecord\(humanTurn\.needAlignment\)/.test(runtimeSrc));
check('Existing conversationReality is projected, not recomputed', /const conversationReality = asRecord\(humanTurn\.conversationReality\)/.test(runtimeSrc));
check('Conversation reality projection omits memory values and assistant excerpts', /STRUCTURE_ONLY_NO_MEMORY_VALUES_NO_ASSISTANT_EXCERPTS/.test(runtimeSrc)
  && !/relevantMemories[\s\S]{0,420}value:/.test(runtimeSrc)
  && !/recentAssistantMoves[\s\S]{0,300}excerpt:/.test(runtimeSrc));
check('HumanTurn surface controls are observable', /turnShape:[\s\S]*surfaceBudget:[\s\S]*antiAiCadence:[\s\S]*texture:[\s\S]*adaptation:/.test(runtimeSrc));
check('Selected Humanity feature evidence is exposed', /features\.find\(\(item\) => item\.key === key\)/.test(runtimeSrc) && /evidence:[\s\S]*feature\.evidence/.test(runtimeSrc));
check('Metric projection includes the seven F0 audit metrics', ['REDUNDANT_PARAPHRASE','CROSS_TURN_INFORMATION_GAIN','CURRENT_TURN_VALUE','ROLE_VOICE_FIDELITY','CONVERSATIONAL_TEXTURE','AI_ANSWER_CADENCE','ROLE_EVIDENCE'].every((key) => runtimeSrc.includes(key)));

check('F0.1 projections are emitted only inside includeDiagnostics envelope', runtimeSrc.indexOf('humanTurnObservability: hve3HumanTurnObservability') > runtimeSrc.indexOf('...(dto.includeDiagnostics ? {'));
check('Customer-visible segment mapping is unchanged in shape', /segments:\s*plan\.segments\.map\(\(segment\) => \(\{\s*index:\s*segment\.index,\s*content:\s*segment\.content,\s*delayBeforeMs:\s*segment\.delayBeforeMs,\s*\}\)\)/m.test(runtimeSrc));
check('Delivery decision still comes directly from generation', /deliveryDecision:\s*result\.generation\.deliveryDecision/.test(runtimeSrc));
check('F0.1 does not introduce a model/generation call', !/F0_1[\s\S]{0,1000}(responses\.create|chat\.completions|generateContent|invokeModel|\.rewrite\()/u.test(runtimeSrc));

check('Robot test API transports HumanTurn observability', /hveHumanTurnObservability:\s*result\.diagnostics\?\.humanTurnObservability \|\| null/.test(autoSrc));
check('Robot test API transports Humanity metric diagnostics', /hveHumanityMetrics:\s*result\.diagnostics\?\.humanityMetricDiagnostics \|\| null/.test(autoSrc));
check('Raw robot-test diagnostics also preserve F0.1 fields', /humanTurnObservability:\s*result\.diagnostics\?\.humanTurnObservability \|\| null/.test(autoSrc) && /humanityMetricDiagnostics:\s*result\.diagnostics\?\.humanityMetricDiagnostics \|\| null/.test(autoSrc));

const forbidden = [
  'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  'src/modules/customer-service-agent/runtime/compliance/customer-service-humanity-preference-evaluator.ts',
];
check('F0.1 diagnostic contract names do not leak into behavior authorities', forbidden.every((rel) => !/F0_1_HUMAN_TURN_DIAGNOSTICS|F0_1_HUMANITY_METRIC_SEMANTICS/.test(fs.readFileSync(path.join(root, rel), 'utf8'))));


// Execute the actual F0.1 projection helpers in isolation so observability is not
// proven by string presence alone. No Runtime dependency is imported.
const metricConstStart = runtimeSrc.indexOf('const F0_1_HUMANITY_METRIC_SEMANTICS');
const metricConstEnd = runtimeSrc.indexOf('\n};', metricConstStart) + 3;
const asRecordStart = runtimeSrc.indexOf('function asRecord');
const projectionEnd = runtimeSrc.indexOf('function projectSelectedSummaryTransformationDiagnostics');
const projectionSource = [
  runtimeSrc.slice(metricConstStart, metricConstEnd),
  runtimeSrc.slice(asRecordStart, projectionEnd),
  '\nexports.__projectHumanTurn = projectRobotTestHumanTurnObservability;',
  '\nexports.__projectMetrics = buildRobotTestHumanityMetricDiagnostics;',
].join('\n');
const transpiledProjection = ts.transpileModule(projectionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sandbox = { exports: {}, module: { exports: {} }, console };
sandbox.module.exports = sandbox.exports;
vm.runInNewContext(transpiledProjection, sandbox, { filename: runtimeReplyFile });
const projectHumanTurn = sandbox.exports.__projectHumanTurn;
const projectMetrics = sandbox.exports.__projectMetrics;
check('Actual HumanTurn projection helper is executable', typeof projectHumanTurn === 'function');
check('Actual metric projection helper is executable', typeof projectMetrics === 'function');

const humanTurnProjection = projectHumanTurn({
  schemaVersion: 1,
  authority: 'REALIZATION_ONLY',
  needAlignment: {
    authority: 'REALIZATION_ONLY',
    primaryContribution: 'EXPLAIN',
    acknowledgementRealization: 'IMPLICIT_IN_PRIMARY',
    explanationRole: 'PRIMARY_VALUE',
    openingBias: 'PRIMARY_FIRST',
    understandingProof: 'BY_USEFUL_PRIMARY_CONTRIBUTION',
    constraints: { preserveAllRequiredActs: true, cannotCreateActs: true, cannotChangeFactsOrPermission: true, noNeedRestatementAsSubstituteForValue: true },
  },
  conversationReality: {
    authority: 'REALIZATION_CONTEXT_ONLY', currentTurn: 2, priorConversationMessages: 2,
    exchange: { state: 'ONGOING', priorAssistantTurns: 1 },
    continuity: { lastAssistantMoveAccepted: true, lastAssistantMoveRejected: false, recentRequestedDeltas: ['MORE_SPECIFIC'] },
    currentFeedback: { reception: 'ACCEPTED', handlingMode: 'REFINE', strategyChangeRequired: false, correctionTarget: null, requestedDeltas: [] },
    activeTask: { status: 'ACTIVE', goal: 'PRIVATE_GOAL_TEXT', responsibility: 'ASSIST', createdTurn: 1, lastActiveTurn: 2, unresolvedGoals: ['PRIVATE_UNRESOLVED'] },
    relevantMemories: [{ kind: 'CONSTRAINT', key: 'time', value: 'PRIVATE_MEMORY_VALUE', sourceTurn: 2, confidence: 0.9 }],
    recentSuspendedTasks: [],
    recentAssistantMoves: [{ excerpt: 'PRIVATE_ASSISTANT_EXCERPT', accepted: true, rejected: false, requestedDeltas: [] }],
  },
  turnShape: { mode: 'DIRECT_VALUE', preferredBeats: 1, maxBeats: 2, acknowledgement: 'FUSE_WITH_VALUE', questionPlacement: 'NONE', stopBias: 'HIGH' },
  surfaceBudget: { softMaxChars: 120 }, antiAiCadence: { avoidRecapBeforeValue: true }, texture: { spokenRegister: 'NATURAL' }, adaptation: { family: 'GENERAL' },
});
const humanProjectionJson = JSON.stringify(humanTurnProjection);
check('Synthetic HumanTurn exposes existing NeedAlignment decision', humanTurnProjection?.needAlignment?.primaryContribution === 'EXPLAIN' && humanTurnProjection?.needAlignment?.explanationRole === 'PRIMARY_VALUE');
check('Synthetic HumanTurn exposes structural conversation reality', humanTurnProjection?.conversationReality?.exchange?.state === 'ONGOING' && humanTurnProjection?.conversationReality?.relevantMemories?.[0]?.key === 'time');
check('Synthetic HumanTurn redacts memory values / task goal / assistant excerpt', !humanProjectionJson.includes('PRIVATE_MEMORY_VALUE') && !humanProjectionJson.includes('PRIVATE_GOAL_TEXT') && !humanProjectionJson.includes('PRIVATE_ASSISTANT_EXCERPT') && !humanProjectionJson.includes('PRIVATE_UNRESOLVED'));

const metricProjection = projectMetrics({
  selectedCandidateIndex: 0,
  candidates: [{ index: 0, humanRealizationFloorStatus: 'WARN', humanRealizationFloorScore: 76, humanRealizationFloorIssueKeys: ['SURFACE_X'] }],
  softHumanity: {
    score: 80, pairwiseUtilityScore: 81, personaPreferenceScore: 74, status: 'ACCEPTABLE', highRiskKeys: [],
    roleEvidence: { status: 'PARTIAL', score: 68, positiveEvidence: ['ROLE_BEHAVIOR_VALUE_PRIORITY_OBSERVED'], missingEvidence: ['ROLE_DISTINCTIVENESS_REQUIRES_MANEUVER_CONTINUITY_OR_AUTHORIZED_IDENTITY'], configurationFingerprint: 'abc' },
    semanticValue: { informationGainScore: 96, redundantParaphraseScore: 52, crossTurnInformationGainScore: 96, currentTurnValueScore: 88, decisionContributionKind: 'USEFUL_DIRECTION', decisionContributionScore: 90 },
    features: [
      { key: 'REDUNDANT_PARAPHRASE', score: 52, risk: 'MEDIUM', evidence: ['MEANINGFUL_TERM_OVERLAP:0.62'] },
      { key: 'CONVERSATIONAL_TEXTURE', score: 70, risk: 'MEDIUM', evidence: ['DENSE_CLAUSE_CHAIN'] },
      { key: 'AI_ANSWER_CADENCE', score: 80, risk: 'LOW', evidence: [] },
      { key: 'ROLE_VOICE_FIDELITY', score: 78, risk: 'LOW', evidence: ['DIRECTNESS_ALIGNED'] },
      { key: 'CURRENT_TURN_VALUE', score: 88, risk: 'LOW', evidence: ['USEFUL_CURRENT_VALUE'] },
      { key: 'CROSS_TURN_INFORMATION_GAIN', score: 96, risk: 'LOW', evidence: [] },
      { key: 'ROLE_TURN_MANEUVER', score: 70, risk: 'MEDIUM', evidence: ['MANEUVER_PARTIAL'] },
      { key: 'ROLE_BEHAVIOR_ALIGNMENT', score: 84, risk: 'LOW', evidence: ['VALUE_PRIORITY'] },
      { key: 'SPEAKER_CONTINUITY', score: 72, risk: 'MEDIUM', evidence: ['CONTINUITY_PARTIAL'] },
    ],
  },
});
const redundantMetric = metricProjection?.metrics?.find((item) => item.key === 'REDUNDANT_PARAPHRASE');
check('Synthetic metric projection exposes score + risk + evidence', redundantMetric?.score === 52 && redundantMetric?.risk === 'MEDIUM' && redundantMetric?.evidence?.[0] === 'MEANINGFUL_TERM_OVERLAP:0.62');
check('Synthetic metric projection carries anti-misread semantics', redundantMetric?.semantics === 'LEXICAL_REDUNDANCY_HEURISTIC_NOT_SHARED_CONTEXT_AUTHORITY' && metricProjection?.roleEvidence?.semantics === 'STRUCTURAL_ROLE_EVIDENCE_COVERAGE_NOT_PERSONHOOD_SCORE');
check('Synthetic Human Realization Floor remains explicitly diagnostic', metricProjection?.humanRealizationFloor?.semantics === 'DIAGNOSTIC_FLOOR_NOT_SEND_AUTHORITY' && metricProjection?.humanRealizationFloor?.score === 76);

console.log(`\n[F0.1 OBSERVABILITY] PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
