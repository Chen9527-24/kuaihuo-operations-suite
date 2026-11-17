#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { compileFinalHumanTurn, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

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

const rels = {
  authority: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  semanticFrame: 'src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts',
  planCompiler: 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
  kernel: 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
};
const sources = Object.fromEntries(Object.entries(rels).map(([key, rel]) => [key, read(rel)]));
const {
  projectCustomerServiceCanonicalActsForSemanticFrame,
  projectCustomerServiceCanonicalForbiddenActsForSemanticFrame,
} = require(path.join(ROOT, rels.semanticFrame));
const {
  projectCustomerServiceModelFacingGenerationFrame,
} = require(path.join(ROOT, rels.prompt));
const {
  CustomerServiceInteractionPlanCompiler,
  buildCompletion,
} = require(path.join(ROOT, rels.planCompiler));

for (const [key, rel] of Object.entries(rels)) {
  check(`${key} TypeScript syntax`, syntax(rel));
}

const closeFrame = normalizeFrame({
  interaction: { completion: 'STOP_AFTER_REQUIRED' },
  acts: {
    required: [{
      type: 'NATURAL_CLOSE',
      semantic: 'Finish the already-complete exchange without reopening prior work.',
      authorityScope: 'PLAN_ONLY',
      parameters: { decisionPurpose: 'Do not create another contribution or input dependency.' },
    }],
    preferred: [],
    optional: [],
    forbidden: ['OPEN_SERVICE_INVITATION'],
  },
  serviceRealization: {
    currentTurnValue: { mode: 'ACKNOWLEDGE_ONLY', mustAddBeyondKnown: false },
    contribution: { target: 'NONE', avoidReframeOnly: false },
    identity: { mode: 'NONE', stopAfterAnswer: false },
  },
  humanTurnRealization: {
    needAlignment: { primaryContribution: 'CLOSE', acknowledgementRealization: 'IMPLICIT_ALLOWED' },
    participation: { questionDisposition: 'NONE' },
    turnComposition: { semanticDelta: { responseTarget: { requestedSpecificity: 'MINIMAL', requiredDelta: 'NONE' } } },
    sharedContext: { priorContributionStatus: 'ACCEPTED' },
    conversationReality: {
      continuity: { recentRequestedDeltas: ['MORE_SPECIFIC'] },
      currentFeedback: { reception: 'ACCEPTED', correctionTarget: null, requestedDeltas: [] },
    },
  },
});
const closeProjection = compileFinalHumanTurn(ROOT, closeFrame);

const fullConfiguredCapabilities = {
  configurationStatus: 'CONFIGURED',
  source: 'FIXTURE_CONFIGURATION',
  actionLimits: { canInvite: true },
  executionReceipts: [{ id: 'old-receipt' }],
};
const payloadContract = {
  persona: { resolvedRoleIdentity: null, speakerProjection: null },
  businessContext: { languagePolicyConstraints: [], accountProfile: null },
  generationContext: {
    conversationHistory: [
      { role: 'CUSTOMER', content: 'Earlier question.' },
      { role: 'ASSISTANT', content: 'Earlier answer.' },
    ],
  },
  groundedContext: { latestCustomerMessage: 'Accepted; close this exchange.' },
  orchestrationPlan: { serviceCapabilities: fullConfiguredCapabilities },
  policy: { assets: [{ id: 'unselected-asset' }] },
  provenance: { configurationHash: 'fixture-hash' },
};
const payloadCloseFrame = normalizeFrame({
  ...closeFrame,
  identity: {
    aiIdentity: null, businessLabel: null, relationLabel: null, publicName: null,
    surfaceLabel: null, allowedSurfaceLabels: [], serviceScope: null,
  },
  grounding: { facts: [], knowledge: [], prohibitedUnknownFacts: [] },
  context: { activeTask: null },
  responseAssets: [],
  hardBoundaries: {
    forbiddenAssumptions: [], identityForbiddenDrift: [], capabilityLimits: null, roleBoundary: null,
  },
  humanTurnRealization: {
    ...closeFrame.humanTurnRealization,
    conversationReality: {
      authority: 'REALIZATION_CONTEXT_ONLY',
      currentTurn: 4,
      priorConversationMessages: 6,
      exchange: { state: 'ONGOING', priorAssistantTurns: 3 },
      continuity: { recentRequestedDeltas: ['MORE_SPECIFIC'] },
      currentFeedback: { reception: 'ACCEPTED', correctionTarget: null, requestedDeltas: [] },
      activeTask: { id: 'stale-task', status: 'ACTIVE' },
      recentSuspendedTasks: [{ id: 'suspended-task', unresolvedGoals: ['old-work'] }],
      relevantMemories: [{ id: 'memory-1', kind: 'TOPIC_ANCHOR', value: 'Earlier topic.' }],
      recentAssistantMoves: [{
        turn: 2, excerpt: 'Older assistant position.', accepted: false, rejected: false,
        requestedDeltas: ['MORE_SPECIFIC'],
      }],
    },
  },
});
const closeModelPayload = projectCustomerServiceModelFacingGenerationFrame(payloadContract, payloadCloseFrame);
check('dynamic final close payload excludes every unselected Runtime collection and stale task command path',
  closeModelPayload.pcPolicy.capabilities === null
    && closeModelPayload.knowledge.verifiedFacts.length === 0
    && closeModelPayload.knowledge.selectedEntries.length === 0
    && closeModelPayload.responseAssets.length === 0
    && closeModelPayload.conversation.activeTask === null
    && !Object.prototype.hasOwnProperty.call(closeModelPayload.conversation, 'recentSuspendedTasks'));
check('dynamic final close payload keeps prior speech as facts without historical refinement commands',
  closeModelPayload.conversation.priorSpeakerTurns.length === 1
    && !Object.prototype.hasOwnProperty.call(closeModelPayload.conversation.priorSpeakerTurns[0], 'requestedDeltas')
    && closeModelPayload.humanPresence.realization.continuity.currentFeedback.requestedDeltas.length === 0);
check('dynamic final close payload component views cannot contradict its Canonical close Plan',
  closeModelPayload.humanPresence.realization.canonicalPlan.completion === 'STOP_AFTER_REQUIRED'
    && !Object.prototype.hasOwnProperty.call(closeModelPayload.humanPresence.realization.selectedComponents, 'acknowledgement')
    && closeModelPayload.humanPresence.realization.selectedComponents.identity.selected === false
    && closeModelPayload.humanPresence.realization.selectedComponents.customerInput.selected === false);
check('Conversation Reality exposes ONGOING only as a pre-reply fact, never as a current completion-looking field',
  closeModelPayload.conversation.reality.exchangeStateBeforeCurrentReply === 'ONGOING'
    && !Object.prototype.hasOwnProperty.call(closeModelPayload.conversation.reality, 'exchangeState')
    && closeModelPayload.humanPresence.realization.canonicalPlan.completion === 'STOP_AFTER_REQUIRED');
const capabilityAuthorizedPayload = projectCustomerServiceModelFacingGenerationFrame(payloadContract, {
  ...payloadCloseFrame,
  hardBoundaries: { ...payloadCloseFrame.hardBoundaries, capabilityLimits: fullConfiguredCapabilities },
});
check('dynamic payload preserves capability truth only when the Semantic Frame selected it',
  capabilityAuthorizedPayload.pcPolicy.capabilities?.configurationStatus === 'CONFIGURED'
    && capabilityAuthorizedPayload.pcPolicy.capabilities?.executionReceipts?.[0]?.id === 'old-receipt');

const canonicalCloseActs = projectCustomerServiceCanonicalActsForSemanticFrame([
  { type:'NATURAL_CLOSE', necessity:'REQUIRED', parameters:{ decisionPurpose:'fixture-close' } },
  { type:'STOP', necessity:'REQUIRED' },
]);
check('real Semantic Frame projection preserves every selected content and control Act',
  canonicalCloseActs.length === 2
    && canonicalCloseActs[0].type === 'NATURAL_CLOSE'
    && canonicalCloseActs[1].type === 'STOP'
    && canonicalCloseActs[1].semantic.includes('停止'));
const fullChainCloseProjection = compileFinalHumanTurn(ROOT, {
  ...closeFrame,
  acts: { ...closeFrame.acts, required:canonicalCloseActs },
});
check('projected Canonical control Act survives through Final Model-Facing HumanTurn',
  fullChainCloseProjection.realization.canonicalPlan.requiredActs.map((item) => item.type).join('|')
    === 'NATURAL_CLOSE|STOP'
    && fullChainCloseProjection.realization.canonicalPlan.completion === 'STOP_AFTER_REQUIRED');
check('Semantic Frame has no lossy selected-Act exclusion',
  !/items\.filter\(\(item\)\s*=>\s*item\.type\s*!==\s*['"]STOP['"]\)/.test(sources.semanticFrame)
    && sources.semanticFrame.includes('projectCustomerServiceCanonicalActsForSemanticFrame(audit.acts.required)'));

const planCompiler = new CustomerServiceInteractionPlanCompiler({ resolve: () => 'CASUAL_CHAT' });
const source = { kind: 'UNDERSTANDING', refId: 'fixture' };
const basePlan = {
  schemaVersion: 2,
  shadow: true,
  policyMode: 'LEGACY_SHADOW',
  interactionType: 'CASUAL_CHAT',
  goal: { primary: 'fixture', secondary: [] },
  acts: [],
  suppressedActs: [],
  grounding: { requirements: [], prohibitedUnknownFacts: [] },
  completion: { mode: 'ALLOW_CONTINUATION', conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }], allowOptionalContinuation: true },
  answerObligation: null,
  behaviorContext: { relationshipStage: null, recentMoveKeys: [], requestedDeltas: [], activeTaskKey: null },
  realizationPreferences: { density: 'AUTO', toneProfile: null, colloquiality: 'AUTO', segmentation: 'AUTO', emoji: 'AUTO' },
  sources: [source],
  diagnostics: {},
};
const emptyResolution = { decisions: [], resolutionHash: 'fixture', guidelineVersionIds: [], conflicts: [], hasUnresolvedHardConflict: false };
const act = (type, reasonCode = `FIXTURE_${type}`) => ({
  id: `ACT_${type}`,
  type,
  necessity: 'REQUIRED',
  priority: 900,
  reasonCode,
  sources: [source],
});
const waitingTaskInput = {
  understanding: { humanContext: { conversationTaskState: { status: 'WAITING_FOR_CUSTOMER' } } },
  plan: {},
};
const staleWaitingCloseCompletion = buildCompletion(
  waitingTaskInput,
  [act('NATURAL_CLOSE')],
  'CASUAL_CHAT',
);
check('stale WAITING_FOR_CUSTOMER task cannot outrank a current natural close',
  staleWaitingCloseCompletion.mode === 'STOP_AFTER_REQUIRED');
const staleWaitingNoQuestionCompletion = buildCompletion(waitingTaskInput, [], 'GENERAL_SERVICE');
check('stale waiting task cannot manufacture a current input dependency without a selected question',
  staleWaitingNoQuestionCompletion.mode === 'ALLOW_CONTINUATION');
const currentRequiredInputCompletion = buildCompletion(
  waitingTaskInput,
  [act('REQUEST_REQUIRED_SLOT')],
  'GENERAL_SERVICE',
);
check('current required input Act remains the owner of WAIT_CUSTOMER',
  currentRequiredInputCompletion.mode === 'WAIT_CUSTOMER');
const hardConflictPlan = planCompiler.applyGuidelineResolutionShadow({
  ...basePlan,
  acts: [act('DIRECT_ANSWER')],
  suppressedActs: [{ type: 'DIRECT_ANSWER', enforcement: 'HARD', priority: 1000, reasonCode: 'FIXTURE_HARD_BOUNDARY', sources: [source] }],
}, emptyResolution);
check('HARD-suppressed Act cannot remain selected in the final Canonical Plan',
  !hardConflictPlan.acts.some((item) => item.type === 'DIRECT_ANSWER')
    && hardConflictPlan.suppressedActs.some((item) => item.type === 'DIRECT_ANSWER' && item.enforcement === 'HARD'));
check('base compilation and Guideline merge share the same HARD-suppression normalizer',
  (sources.planCompiler.match(/removeHardSuppressedCanonicalActs\(acts, suppressedActs\)/g) || []).length === 2);

const explicitStopPlan = planCompiler.applyGuidelineResolutionShadow({
  ...basePlan,
  acts: [act('STOP', 'EXPLICIT_CUSTOMER_BOUNDARY')],
}, emptyResolution);
check('explicit required STOP and completion are synchronized after Guideline merge',
  explicitStopPlan.completion.mode === 'STOP_AFTER_REQUIRED'
    && explicitStopPlan.completion.allowOptionalContinuation === false
    && explicitStopPlan.acts.filter((item) => item.type === 'STOP').length === 1);
const handoffWithStopPlan = planCompiler.applyGuidelineResolutionShadow({
  ...basePlan,
  acts: [act('REQUEST_HANDOFF'), act('STOP', 'EXPLICIT_STOP_AFTER_HANDOFF')],
  completion: { mode: 'HANDOFF', conditions: [{ type: 'HANDOFF_REQUIRED' }], allowOptionalContinuation: false },
}, emptyResolution);
check('terminal HANDOFF retains its completion semantics beside compatible explicit STOP',
  handoffWithStopPlan.completion.mode === 'HANDOFF'
    && handoffWithStopPlan.acts.some((item) => item.type === 'REQUEST_HANDOFF')
    && handoffWithStopPlan.acts.filter((item) => item.type === 'STOP').length === 1);

const contradictoryClosurePlan = planCompiler.applyGuidelineResolutionShadow({
  ...basePlan,
  acts: [act('DIRECT_ANSWER'), act('NATURAL_CLOSE'), act('STOP')],
  answerObligation: {
    responseTarget: {
      focus: 'CONVERSATIONAL_CLOSURE', requiredDelta: 'NONE', confidence: 0.98,
    },
  },
  completion: { mode: 'STOP_AFTER_REQUIRED', conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }, { type: 'NO_FURTHER_ACTS' }], allowOptionalContinuation: false },
}, emptyResolution);
check('pure conversational closure removes a contradictory value Act from the selected Canonical collection',
  contradictoryClosurePlan.acts.map((item) => item.type).sort().join('|') === 'NATURAL_CLOSE|STOP'
    && contradictoryClosurePlan.suppressedActs.some((item) => (
      item.type === 'DIRECT_ANSWER'
      && item.enforcement === 'HARD'
      && item.reasonCode === 'ANSWER_OBLIGATION_CONVERSATIONAL_CLOSURE_EXCLUSIVE'
    )),
  JSON.stringify({ acts:contradictoryClosurePlan.acts, suppressed:contradictoryClosurePlan.suppressedActs }));
const terminalHandoffClosePlan = planCompiler.applyGuidelineResolutionShadow({
  ...basePlan,
  acts: [act('REQUEST_HANDOFF'), act('NATURAL_CLOSE'), act('STOP')],
  answerObligation: contradictoryClosurePlan.answerObligation,
  completion: { mode: 'HANDOFF', conditions: [{ type: 'HANDOFF_REQUIRED' }], allowOptionalContinuation: false },
}, emptyResolution);
check('closure coherence never demotes the existing terminal handoff obligation',
  terminalHandoffClosePlan.completion.mode === 'HANDOFF'
    && terminalHandoffClosePlan.acts.some((item) => item.type === 'REQUEST_HANDOFF')
    && terminalHandoffClosePlan.acts.some((item) => item.type === 'STOP'));

const stopResolution = {
  ...emptyResolution,
  decisions: [{
    guidelineId: 'fixture-stop', versionId: 'v1', code: 'fixture-stop', guidelinePriority: 900,
    action: { op: 'SET_COMPLETION', mode: 'STOP_AFTER_REQUIRED', enforcement: 'HARD', allowOptionalContinuation: false },
  }],
};
const completionOwnedStopPlan = planCompiler.applyGuidelineResolutionShadow(basePlan, stopResolution);
check('Guideline-owned STOP_AFTER_REQUIRED receives one matching control Act',
  completionOwnedStopPlan.completion.mode === 'STOP_AFTER_REQUIRED'
    && completionOwnedStopPlan.acts.filter((item) => item.type === 'STOP').length === 1);

const continueResolution = {
  ...emptyResolution,
  decisions: [{
    guidelineId: 'fixture-continue', versionId: 'v1', code: 'fixture-continue', guidelinePriority: 600,
    action: { op: 'SET_COMPLETION', mode: 'ALLOW_CONTINUATION', enforcement: 'SOFT', allowOptionalContinuation: true },
  }],
};
const completionDerivedStopReleased = planCompiler.applyGuidelineResolutionShadow({
  ...basePlan,
  acts: [act('STOP', 'COMPLETION_STOP_AFTER_REQUIRED')],
  completion: { mode: 'STOP_AFTER_REQUIRED', conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }, { type: 'NO_FURTHER_ACTS' }], allowOptionalContinuation: false },
}, continueResolution);
check('completion-derived STOP is removed when final completion legitimately changes',
  completionDerivedStopReleased.completion.mode === 'ALLOW_CONTINUATION'
    && !completionDerivedStopReleased.acts.some((item) => item.type === 'STOP'));

const softSelectedPlan = {
  ...basePlan,
  acts: [act('PROVIDE_GENERAL_GUIDANCE')],
  suppressedActs: [{ type: 'PROVIDE_GENERAL_GUIDANCE', enforcement: 'SOFT', priority: 600, reasonCode: 'FIXTURE_SOFT', sources: [source] }],
};
check('selected Act cannot also be projected as forbidden',
  planCompiler.applyGuidelineResolutionShadow(softSelectedPlan, emptyResolution).acts.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE')
    && projectCustomerServiceCanonicalForbiddenActsForSemanticFrame(softSelectedPlan).length === 0);

check('selected required Act survives into Final HumanTurn',
  closeProjection.realization.canonicalPlan.requiredActs.length === 1
    && closeProjection.realization.canonicalPlan.requiredActs[0].type === 'NATURAL_CLOSE'
    && closeProjection.realization.canonicalPlan.requiredActs[0].semantic === closeFrame.acts.required[0].semantic);
check('selected Act parameters survive without becoming Runtime wording',
  closeProjection.realization.canonicalPlan.requiredActs[0].parameters.decisionPurpose
    === closeFrame.acts.required[0].parameters.decisionPurpose);
check('Canonical completion and forbidden Acts survive into Final HumanTurn',
  closeProjection.realization.canonicalPlan.completion === 'STOP_AFTER_REQUIRED'
    && closeProjection.realization.canonicalPlan.forbiddenActs.includes('OPEN_SERVICE_INVITATION'));
check('settled close still carries no new contribution or customer-input dependency',
  closeProjection.realization.primary.target === 'NONE'
    && closeProjection.realization.primary.requiredDelta === 'NONE'
    && closeProjection.realization.selectedComponents.customerInput.selected === false);
check('settled close cannot inherit a historical requested delta as current work',
  closeProjection.realization.continuity.currentFeedback.reception === 'ACCEPTED'
    && closeProjection.realization.continuity.currentFeedback.requestedDeltas.length === 0);

const ordinaryFrame = normalizeFrame({
  interaction: { completion: 'CONTINUE' },
  acts: {
    required: [{ type: 'DIRECT_ANSWER', semantic: 'Answer the current request.', authorityScope: 'PLAN_ONLY' }],
    preferred: [{ type: 'PROVIDE_GENERAL_GUIDANCE', semantic: 'Add authorized general guidance.', authorityScope: 'GENERAL_GUIDANCE' }],
    optional: [],
    forbidden: ['REQUEST_HANDOFF'],
  },
});
const ordinaryProjection = compileFinalHumanTurn(ROOT, ordinaryFrame);
check('projection is generic across non-closure Canonical Plans',
  ordinaryProjection.realization.canonicalPlan.requiredActs[0].type === 'DIRECT_ANSWER'
    && ordinaryProjection.realization.canonicalPlan.preferredActs[0].type === 'PROVIDE_GENERAL_GUIDANCE'
    && ordinaryProjection.realization.canonicalPlan.completion === 'CONTINUE');
const legacyIdentityStopProjection = compileFinalHumanTurn(ROOT, normalizeFrame({
  interaction: { completion: 'ALLOW_CONTINUATION' },
  serviceRealization: {
    contribution: { target: 'DIRECT_ANSWER' },
    identity: { mode: 'SERVICE_SCOPE', stopAfterAnswer: true },
  },
}));
check('legacy identity stop flag cannot compete with final Canonical completion',
  legacyIdentityStopProjection.realization.selectedComponents.identity.selected === true
    && !Object.prototype.hasOwnProperty.call(legacyIdentityStopProjection.realization.selectedComponents.identity, 'stopAfterAnswer')
    && legacyIdentityStopProjection.realization.primary.adjacentContextUse === 'OPTIONAL_WITHIN_PRIMARY'
    && !sources.prompt.includes('stopAfterAnswer: frame.serviceRealization.identity.stopAfterAnswer'));
const staleRealizationSelection = compileFinalHumanTurn(ROOT, normalizeFrame({
  acts: { required: [{ type: 'NATURAL_CLOSE', semantic: 'Close.', authorityScope: 'PLAN_ONLY' }], preferred: [], optional: [], forbidden: [] },
  serviceRealization: { identity: { mode: 'SERVICE_SCOPE', stopAfterAnswer: false } },
  humanTurnRealization: {
    needAlignment: { acknowledgementRealization: 'EXPLICIT_REQUIRED' },
    participation: { questionDisposition: 'REQUIRED' },
  },
}));
check('stale realization flags cannot manufacture components absent from Canonical Acts',
  !Object.prototype.hasOwnProperty.call(staleRealizationSelection.realization.selectedComponents, 'acknowledgement')
    && staleRealizationSelection.realization.selectedComponents.identity.selected === false
    && staleRealizationSelection.realization.selectedComponents.customerInput.selected === false);
const canonicalSelectionOverridesStaleRealization = compileFinalHumanTurn(ROOT, normalizeFrame({
  acts: {
    required: [
      { type: 'ACKNOWLEDGE_PROBLEM', semantic: 'Acknowledge.', authorityScope: 'PLAN_ONLY' },
      { type: 'EXPLAIN_SERVICE_SCOPE', semantic: 'Explain scope.', authorityScope: 'PLAN_ONLY' },
      { type: 'REQUEST_REQUIRED_SLOT', semantic: 'Request required input.', authorityScope: 'PLAN_ONLY' },
    ],
    preferred: [], optional: [], forbidden: [],
  },
  serviceRealization: { identity: { mode: 'NONE', stopAfterAnswer: false } },
  humanTurnRealization: {
    needAlignment: { acknowledgementRealization: 'NONE' },
    participation: { questionDisposition: 'NONE' },
  },
}));
check('Canonical Acts remain the sole component-selection owner when realization flags are stale',
  canonicalSelectionOverridesStaleRealization.realization.canonicalPlan.requiredActs.some(item => item.type === 'ACKNOWLEDGE_PROBLEM')
    && !Object.prototype.hasOwnProperty.call(canonicalSelectionOverridesStaleRealization.realization.selectedComponents, 'acknowledgement')
    && canonicalSelectionOverridesStaleRealization.realization.selectedComponents.identity.mode === 'SERVICE_SCOPE'
    && canonicalSelectionOverridesStaleRealization.realization.selectedComponents.customerInput.disposition === 'REQUIRED');
check('Final compiler does not branch on a closure Act or role/domain text',
  !/(===\s*['"]NATURAL_CLOSE|roleCode\s*===|industryCode\s*===|includes\([^)]*(NATURAL_CLOSE|OPEN_SERVICE_INVITATION))/i.test(sources.authority));
check('Semantic Frame remains the existing Act and active-task least-privilege owner',
  sources.semanticFrame.includes("const needsActiveTask = ['REQUEST_REQUIRED_SLOT', 'REPORT_STATUS', 'EXECUTE_SERVICE_STEP', 'REQUEST_HANDOFF']")
    && sources.semanticFrame.includes('activeTask: needsActiveTask ? audit.context.activeTask : null'));
check('Generation consumes least-privilege activeTask instead of reopening Conversation Reality task state',
  sources.prompt.includes('activeTask: frame.context.activeTask ? { ...frame.context.activeTask } : null')
    && !sources.prompt.includes('activeTask: conversationReality.activeTask ? { ...conversationReality.activeTask } : null'));
check('Generation cannot bypass Semantic Frame grounding and response-asset least privilege',
  sources.prompt.includes('verifiedFacts: frame.grounding.facts.map')
    && sources.prompt.includes('selectedEntries: frame.grounding.knowledge.map')
    && sources.prompt.includes('responseAssets: frame.responseAssets.map')
    && !sources.prompt.includes('verifiedFacts: contract.groundedContext.facts')
    && !sources.prompt.includes('selectedEntries: contract.businessContext.knowledgeEntries')
    && !sources.prompt.includes('responseAssets: contract.policy.assets'));
check('Generation cannot bypass Semantic Frame capability least privilege',
  sources.prompt.includes('projectConfiguredCapabilities(frame.hardBoundaries.capabilityLimits)')
    && !sources.prompt.includes('projectConfiguredCapabilities(contract.orchestrationPlan.serviceCapabilities)')
    && sources.prompt.includes('不能自行创建、扩大或延长当前行为'));
check('historical speaker deltas cannot re-enter Generation as current refinement pressure',
  sources.prompt.includes('const priorSpeakerTurns = conversationReality.recentAssistantMoves')
    && !/const priorSpeakerTurns =[\s\S]*?const relevantMemories =/.exec(sources.prompt)?.[0].includes('requestedDeltas:'));
check('suspended task dossiers cannot bypass current Canonical task ownership',
  !sources.prompt.includes('recentSuspendedTasks: conversationReality.recentSuspendedTasks')
    && sources.prompt.includes('activeTask: frame.context.activeTask'));
check('Generation names Canonical Plan as an existing projection under the one realization authority',
  sources.prompt.includes('`humanPresence.realization` 是 Generation 唯一的当前轮行为/语义边界')
    && sources.prompt.includes('现有 Canonical InteractionPlan 的无损投影')
    && sources.prompt.includes('控制类 Act 与 completion 是 Canonical WHAT 的执行边界')
    && sources.prompt.includes('尚未实现的 preferred / optional 随之失效')
    && sources.prompt.includes('不得继续创建任何未选贡献、追问或服务入口'));
check('Canonical necessity semantics cannot pressure optional work past completion',
  sources.prompt.includes('required Acts 是本轮必须完成的语义义务')
    && sources.prompt.includes('preferred / optional Acts 只是已授权的非必做贡献')
    && sources.prompt.includes('forbidden Acts 不得实现'));
check('existing customer-input projection compiles the selected current branch instead of competing static branches',
  sources.prompt.includes('buildCurrentCanonicalExecutionSystemSection(humanPresence.realization)')
    && sources.prompt.includes('NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN')
    && sources.prompt.includes('当前生成没有新的客户输入权限')
    && sources.prompt.includes('不得另开服务入口')
    && sources.prompt.includes('只完成 canonicalPlan 已选贡献后结束本次生成'));
check('ALLOW_CONTINUATION cannot manufacture a question or service invitation',
  sources.prompt.includes('completion=ALLOW_CONTINUATION 只是会话状态，不是当前回复的继续权限')
    && sources.prompt.includes('不授予任何 Act')
    && sources.prompt.includes('完成这些 Acts 后结束本次生成')
    && !sources.prompt.includes('completion=ALLOW_CONTINUATION 只表示对话没有被系统终止'));
const terminalExecutionProbe = require(path.join(ROOT, rels.prompt)).buildCurrentCanonicalExecutionSystemSection({
  canonicalPlan: { completion: 'STOP_AFTER_REQUIRED' },
  selectedComponents: {
    customerInput: {
      selected: false,
      disposition: 'NONE',
      completionDependency: 'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN',
    },
  },
});
check('terminal completion ends the current generation without replaying accepted continuity as new work',
  terminalExecutionProbe.includes('completion=STOP_AFTER_REQUIRED 是当前轮终止边界')
    && terminalExecutionProbe.includes('required Acts 完成后立即结束本次生成')
    && terminalExecutionProbe.includes('已经接受的方向只保留为事实证据')
    && terminalExecutionProbe.includes('不得再把它们展开成新的判断、建议、复述、客户输入或服务入口'));
check('diagnostic roleBehavior and servicePresence remain outside the final model-facing generation payload',
  !JSON.stringify(closeModelPayload).includes('roleBehavior')
    && !JSON.stringify(closeModelPayload).includes('servicePresence'));
check('Role to Identity Prompt remains the sole editable Persona HOW',
  sources.authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'")
    && sources.prompt.includes('PERSONA_SURFACE_PROFILE=')
    && sources.prompt.includes('ordinary Generation 不接收持久化 Role / Identity 的 free-form Prompt 原文'));
check('R3 adds no output choreography or post-generation wording repair',
  !/(softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|fixed.{0,8}(chars|sentences|bubbles)|PostGenerationWordingRepair|ClosurePhrase)/i.test([
    sources.authority,
    sources.prompt,
  ].join('\n')));
check('R3 adds no planner, gate, judge, retry, fallback, or model call',
  !/(ClosePlanner|CloseGate|CloseJudge|CloseRepair|CloseRetry|CloseFallback|secondModelCall)/i.test([
    sources.authority,
    sources.prompt,
  ].join('\n')));
check('generation kernel preserves prior convergence and records customer-input execution calibration',
  sources.kernel.includes("version: 'hve-3-v1.99'")
    && sources.kernel.includes('V1.55 P0-3 R3 Canonical Close Execution Projection')
    && sources.kernel.includes('V1.56 P0-3 Final Settled Evidence Ownership Convergence')
    && sources.kernel.includes('V1.57 P0-3 Final Canonical Control Act Execution Seal')
    && sources.kernel.includes('V1.59 P0-3 Current Feedback Temporal Ownership Convergence')
    && sources.kernel.includes('V1.60 P0-3 Canonical Instruction Coherence Convergence')
    && sources.kernel.includes('V1.61 P0-3 Canonical Completion Single-Owner Clearance')
    && sources.kernel.includes('V1.81 P0-3 Regression Canonical Completion Execution Boundary Convergence')
    && sources.kernel.includes('V1.82 P0-3 Pre-Reply Exchange-State Temporal Demotion')
    && sources.kernel.includes('V1.62 P0-3 Current Input Dependency Ownership Convergence')
    && sources.kernel.includes('V1.63 P0-3 Least-Privilege Context Consumer Seal')
    && sources.kernel.includes('V1.64 P0-3 Historical Delta Model-Facing Demotion')
    && sources.kernel.includes('V1.65 P0-3 Suspended-Task Model-Facing Demotion')
    && sources.kernel.includes('V1.66 P0-3 Terminal Completion Compatibility Convergence')
    && sources.kernel.includes('V1.67 P0-3 Final Model Input Single-Owner Seal')
    && sources.kernel.includes('V1.68 P0-3 Current Obligation Before Closure Seal')
    && sources.kernel.includes('V1.69 P0-3 Required Contribution Realization Regression Closure')
    && sources.kernel.includes('V1.70 P0-3 Reception-only Closure Regression Convergence')
    && sources.kernel.includes('V1.71 P0-3 Required Semantic Delta Realization Seal')
    && sources.kernel.includes('V1.72 P0-5 R1.3 Acknowledgement Authority Execution')
    && sources.kernel.includes('V1.76 P0-5 R1.6 Decision-Relevant Delta and Existing Customer-Input Execution Calibration')
    && sources.kernel.includes('V1.77 P0-5 R1.7 Current Execution and Historical Surface Authority Separation')
    && sources.kernel.includes('V1.78 P0-5 R1.8 Prompt Principle Consolidation')
    && sources.kernel.includes('V1.79 P0-5 R1.9 Persona HOW Signal Reduction')
    && sources.kernel.includes('V1.80 P0-5 R1.10 Functional Emotional Boundary Calibration')
    && sources.kernel.includes('V1.83 P0-5 R1.11 Embedded Evaluative Reception Functional Deletion Boundary'));

console.log(`\nP0-3 R3 Canonical Close Execution Projection: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
