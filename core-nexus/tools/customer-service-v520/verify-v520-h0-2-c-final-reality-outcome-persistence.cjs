#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@nestjs/common') {
    return { Injectable: () => (target) => target };
  }
  return originalLoad.call(this, request, parent, isMain);
};
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const req = (rel) => require(path.join(root, rel));

const {
  inferCustomerServiceDialogueObligation,
  reconcileCustomerServiceDialogueObligationWithModelSignal,
} = req('src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts');
const { resolveCustomerServiceAnswerObligation } = req('src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts');
const { CustomerServiceInteractionTypeResolver } = req('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts');
const { resolveCustomerServiceResolvedRoleIdentityContext } = req('src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts');
const { resolveCustomerServiceRoleCapabilityContextProjection } = req('src/modules/customer-service-agent/runtime/role/customer-service-role-capability-context-projection.ts');
const { resolveCustomerServiceHumanTurnRealization } = req('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const previousAssistant = 'Try the first adjustment and see whether the subject gets brighter.';
const currentMessage = 'I already tried that adjustment; the result stayed the same. Is there another way?';
const baseObligation = inferCustomerServiceDialogueObligation(currentMessage, [
  { role: 'CUSTOMER', content: 'The subject still looks too dark.' },
  { role: 'ASSISTANT', content: previousAssistant },
]);
const reconciled = reconcileCustomerServiceDialogueObligationWithModelSignal(baseObligation, {
  userFeedback: 'INSUFFICIENT',
  previousAdviceOutcome: 'TRIED_INEFFECTIVE',
  requestedDeltas: [],
  correctionTarget: 'CONTENT',
  evidence: 'I already tried that adjustment; the result stayed the same.',
  confidence: 0.94,
}, { message: currentMessage, previousAssistantText: previousAssistant });

check('model semantic feedback can close a language-independent attempted-but-ineffective outcome',
  reconciled.userFeedback === 'INSUFFICIENT'
  && reconciled.feedbackHandlingMode === 'REFINE'
  && reconciled.requestedDeltas.includes('DIFFERENT_APPROACH')
  && reconciled.strategyChangeRequired === true
  && reconciled.source === 'MODEL', JSON.stringify(reconciled));

const unsupported = reconcileCustomerServiceDialogueObligationWithModelSignal(baseObligation, {
  userFeedback: 'REJECTED', previousAdviceOutcome: 'TRIED_INEFFECTIVE', requestedDeltas: ['DIFFERENT_APPROACH'],
  correctionTarget: 'CONTENT', evidence: 'words that are not in the latest user message', confidence: 0.99,
}, { message: currentMessage, previousAssistantText: previousAssistant });
check('model feedback is ignored when its quoted evidence is not present in the current user turn',
  unsupported.userFeedback === baseObligation.userFeedback
  && unsupported.source === baseObligation.source
  && !unsupported.requestedDeltas.includes('DIFFERENT_APPROACH'));

const explicitCurrent = {
  ...baseObligation,
  userFeedback: 'ESCALATED', feedbackHandlingMode: 'TRUST_REPAIR', acknowledgementRequired: true,
  strategyChangeRequired: true, correctionTarget: 'CONTENT', repairObligation: true,
  source: 'EXPLICIT', confidence: 0.97,
};
const explicitPreserved = reconcileCustomerServiceDialogueObligationWithModelSignal(explicitCurrent, {
  userFeedback: 'ACCEPTED', previousAdviceOutcome: 'TRIED_INEFFECTIVE', requestedDeltas: [],
  correctionTarget: 'CONTENT', evidence: 'the result stayed the same', confidence: 0.95,
}, { message: currentMessage, previousAssistantText: previousAssistant });
check('explicit current feedback remains authoritative over contradictory model reception while compatible outcome delta may merge',
  explicitPreserved.userFeedback === 'ESCALATED'
  && explicitPreserved.feedbackHandlingMode === 'TRUST_REPAIR'
  && explicitPreserved.requestedDeltas.includes('DIFFERENT_APPROACH')
  && explicitPreserved.source === 'EXPLICIT');

const explicitAccepted = {
  ...baseObligation,
  userFeedback: 'ACCEPTED', feedbackHandlingMode: 'NONE', acknowledgementRequired: false,
  requestedDeltas: [], strategyChangeRequired: false, correctionTarget: null, repairObligation: false,
  source: 'EXPLICIT', confidence: 0.96,
};
const contradictoryOutcomeIgnored = reconcileCustomerServiceDialogueObligationWithModelSignal(explicitAccepted, {
  userFeedback: 'INSUFFICIENT', previousAdviceOutcome: 'TRIED_INEFFECTIVE', requestedDeltas: ['DIFFERENT_APPROACH'],
  correctionTarget: 'CONTENT', evidence: 'the result stayed the same', confidence: 0.95,
}, { message: currentMessage, previousAssistantText: previousAssistant });
check('contradictory model outcome cannot create ACCEPTED + DIFFERENT_APPROACH state',
  contradictoryOutcomeIgnored.userFeedback === 'ACCEPTED'
  && !contradictoryOutcomeIgnored.requestedDeltas.includes('DIFFERENT_APPROACH')
  && contradictoryOutcomeIgnored.strategyChangeRequired === false
  && contradictoryOutcomeIgnored.source === 'EXPLICIT');

const correctionMessage = 'The correct value is fifteen, not fifty.';
const correctionBase = inferCustomerServiceDialogueObligation(correctionMessage, [
  { role: 'ASSISTANT', content: 'Use fifty as the value.' },
]);
const corrected = reconcileCustomerServiceDialogueObligationWithModelSignal(correctionBase, {
  userFeedback: 'CORRECTED', previousAdviceOutcome: 'NONE', requestedDeltas: [],
  correctionTarget: 'CONTENT', evidence: 'fifteen, not fifty', confidence: 0.93,
}, { message: correctionMessage, previousAssistantText: 'Use fifty as the value.' });
check('semantic current-turn correction compiles into the existing DialogueObligation authority',
  corrected.userFeedback === 'CORRECTED'
  && corrected.feedbackHandlingMode === 'CORRECT'
  && corrected.strategyChangeRequired === true
  && corrected.correctionTarget === 'CONTENT');

const rejectMessage = 'That option does not fit what I need. Give me a different direction.';
const rejectBase = inferCustomerServiceDialogueObligation(rejectMessage, [
  { role: 'ASSISTANT', content: 'Use the first option.' },
]);
const rejected = reconcileCustomerServiceDialogueObligationWithModelSignal(rejectBase, {
  userFeedback: 'REJECTED', previousAdviceOutcome: 'NONE', requestedDeltas: ['DIFFERENT_APPROACH'],
  correctionTarget: 'CONTENT', evidence: 'That option does not fit what I need.', confidence: 0.94,
}, { message: rejectMessage, previousAssistantText: 'Use the first option.' });
check('semantic rejection compiles into persistent non-repeat state without a new planner',
  rejected.userFeedback === 'REJECTED'
  && rejected.strategyChangeRequired === true
  && rejected.requestedDeltas.includes('DIFFERENT_APPROACH'));

const understanding = {
  primaryScenario: 'GENERAL_INQUIRY', primaryIntent: 'ASK_INFORMATION', confidence: 0.9,
  humanContext: {
    dialogueObligation: reconciled,
    dominantTurnGoal: { key: 'ANSWER_INFORMATION', responseRequirement: 'Answer the unresolved problem using a materially different direction.' },
    requiredTurnGoals: [],
    conversationTaskState: { pendingSlots: [] },
  },
};
const summaryState = {
  schemaVersion: 2, revision: 4, currentTurn: 4,
  activeTask: null, suspendedTasks: [], relevantMemories: [],
  recentAssistantMoves: [{
    turn: 3, move: 'UNKNOWN', actionFamilies: [], practicalActionFamilies: [], interpersonalActionFamilies: [],
    strategyKey: '', openingKey: '', endingKey: '', accepted: false, rejected: true,
    requestedDeltas: ['DIFFERENT_APPROACH'], excerpt: previousAssistant, behavior: null,
  }],
  behaviorHistory: {
    lastAssistantMoveAccepted: false, lastAssistantMoveRejected: true,
    recentRequestedDeltas: ['DIFFERENT_APPROACH'],
  },
  relationshipDynamics: {
    relationshipDistance: 'NEUTRAL', warmContactAcceptance: 'UNKNOWN', humorAcceptance: 'UNKNOWN',
    supportMode: 'PROBLEM_SOLVING', previousReplyReception: 'REJECTED', emotionalIntensity: 'LOW',
    conversationTempo: 'STEADY', recommendedStance: 'SERIOUS_PRACTICAL', recentInterpersonalActions: [], recentPracticalActions: [], evidence: [],
  },
  latestFeedback: reconciled, closedSemanticQuestions: [], canonicalFields: {},
};
const answer = resolveCustomerServiceAnswerObligation({
  interactionType: 'GENERAL_SERVICE', latestCustomerMessage: currentMessage,
  conversationHistory: [
    { role: 'CUSTOMER', content: 'The subject still looks too dark.' },
    { role: 'ASSISTANT', content: previousAssistant },
  ],
  conversationState: summaryState, knowledgeEntries: [], understanding,
});
check('attempted-but-ineffective feedback becomes a non-repeat Canonical response delta',
  answer.continuity === 'FOLLOW_UP_REFINEMENT'
  && answer.mustAddNewInformation === true
  && answer.avoidRepeat === true
  && answer.responseTarget.requiredDelta !== 'NONE', JSON.stringify(answer));

const resolver = new CustomerServiceInteractionTypeResolver();
function casualUnderstanding(strategyChangeRequired) {
  return {
    primaryScenario: 'CASUAL_CHAT', primaryIntent: 'CASUAL',
    humanContext: {
      dominantTurnGoal: { key: 'RESPOND_TO_SHARED_CONTEXT' }, requiredTurnGoals: [],
      emotionalDisclosure: { detected: false, mode: 'NONE' },
      primaryMotive: 'RELATIONSHIP_CONTACT',
      interactionStrategy: { phase: 'OPENING' },
      conversationTaskState: { currentTurnRelation: 'CONTINUATION', status: 'IN_PROGRESS' },
      dialogueObligation: { ...reconciled, strategyChangeRequired },
    },
  };
}
const plan = { expressionPlan: { identityResponse: 'NONE' } };
check('current feedback prevents a weak CASUAL_CHAT classification from reopening SOCIAL_GREETING',
  resolver.resolve({ understanding: casualUnderstanding(true), plan, knowledgeAvailable: false, latestCustomerMessage: currentMessage }) === 'CASUAL_CHAT');
check('ordinary fresh relationship-contact opening behavior is unchanged when there is no feedback event',
  resolver.resolve({ understanding: casualUnderstanding(false), plan, knowledgeAvailable: false, latestCustomerMessage: 'hello' }) === 'SOCIAL_GREETING');

const topicShiftUnderstanding = casualUnderstanding(true);
topicShiftUnderstanding.humanContext.conversationTaskState.currentTurnRelation = 'TOPIC_SHIFT';
check('explicit TOPIC_SHIFT still outranks feedback and weak social-opening posture',
  resolver.resolve({ understanding: topicShiftUnderstanding, plan, knowledgeAvailable: false, latestCustomerMessage: 'new topic' }) === 'TOPIC_SHIFT');

const role = resolveCustomerServiceResolvedRoleIdentityContext({
  merchantRole: { id: 'r-c2', code: 'c2', name: '顾问', description: '负责持续理解当前问题并给出实用建议。', publicRelation: '顾问', revision: 1 },
  prototype: { id: 'p-c2', code: 'p-c2', personality: '自然、具体、有判断。', languageStyle: '口语自然。', servicePosture: '沿着真实对话继续判断，已经无效的方向不重复。', revision: 1 },
  accountProfile: { id: 'a-c2', revision: 1, channel: 'PRIVATE_DOMAIN', profile: { tone: '自然、具体。', voice: '接当前事实，再给必要判断。', background: '长期做日常咨询。', relationship: '愿意一起持续判断的顾问', greetingServiceScope: '可一起看当前问题。' } },
  storeProfile: { id: 's-c2', revision: 1, name: '测试空间', profile: { brandTone: '自然', mainBusiness: '日常咨询' } },
});
const capability = resolveCustomerServiceRoleCapabilityContextProjection({
  merchantRole: { publicRelation: role.identity.publicRelation, description: role.identity.roleDescription },
  prototype: { identity: role.identity.prototypeIdentity, personality: role.rolePrototype.personality, languageStyle: role.rolePrototype.languageStyle, servicePosture: role.rolePrototype.servicePosture },
  accountProfile: null, storeProfile: null, resolvedRoleIdentity: role,
});
const posture = {
  schemaVersion: 1, authority: 'ROLE_DATA_ONLY', source: 'TYPED_V1',
  effective: { schemaVersion: 1, initiativeLevel: 'BALANCED', openingParticipation: 'CONTEXTUAL_ENTRY', followUpOffering: 'CONTEXTUAL_OFFER', clarificationInitiative: 'DECISION_RELEVANT', guidanceInitiative: 'CONTEXTUAL', resolutionFollowThrough: 'NEXT_STEP', salesPressure: 'LOW' },
  sourceModules: [], legacyUntypedModuleCount: 0, issues: [],
};
const canonicalPlan = {
  schemaVersion: 2, interactionType: 'GENERAL_SERVICE',
  acts: [{ id: 'a1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', priority: 900, sources: [] }],
  suppressedActs: [], grounding: { requirements: [], prohibitedUnknownFacts: [] },
  completion: { mode: 'ALLOW_CONTINUATION', conditions: [], allowOptionalContinuation: true },
  answerObligation: answer,
  diagnostics: { roleTurnPolicy: { maneuver: 'FOLLOW_CANONICAL_PLAN' } },
};
const serviceRealization = {
  family: { family: 'GENERAL', responsePriority: 'VALUE_FIRST', emotionalRegister: 'NEUTRAL', optionalQuestionRestraint: 'NORMAL' },
  opening: { active: false, invitation: 'FORBIDDEN', receptionType: 'CONSULTANT', allowCasualChat: true, serviceEntryTarget: null, avoidGenericChatInvitation: true },
  identity: { mode: 'NONE', answerFirst: false, stopAfterAnswer: false },
  acknowledgement: { mode: 'NONE', fuseWithNextValue: true }, currentTurnValue: { mode: 'DIRECT' },
  question: { posture: 'NONE', target: null, decisionPurpose: null, selectionRule: 'NONE', avoidNavigationOnly: true },
  multiTurn: { varyFromRecentStructure: false }, rhythm: { shape: 'ONE_BEAT', maxSentences: 2, maxQuestions: 0, stopWhenComplete: false },
};
const humanTurn = resolveCustomerServiceHumanTurnRealization({
  plan: canonicalPlan, speaker: role.speakerProjection, resolvedRoleIdentity: role,
  interactionPosture: posture, roleCapabilityContext: capability, conversationState: summaryState,
  recentConversationCount: 6, serviceRealization,
  identity: { businessLabel: null, relationLabel: '顾问', publicName: null, surfaceLabel: '顾问' },
  latestCustomerMessage: currentMessage, relationshipDistance: 'NEUTRAL',
});
check('current user feedback is projected into Conversation Reality as factual state',
  humanTurn.conversationReality.currentFeedback.reception === 'INSUFFICIENT'
  && humanTurn.conversationReality.currentFeedback.strategyChangeRequired === true
  && humanTurn.conversationReality.currentFeedback.requestedDeltas.includes('DIFFERENT_APPROACH'));
check('the rejected prior assistant move remains linked to its actual excerpt',
  humanTurn.conversationReality.recentAssistantMoves[0].rejected === true
  && humanTurn.conversationReality.recentAssistantMoves[0].excerpt === previousAssistant);
check('feedback persistence does not create new Canonical Acts',
  humanTurn.turnComposition.segmentPlan.flatMap((item) => item.plannedActTypes).every((type) => type === 'DIRECT_ANSWER'));

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const dialogueSrc = read('src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts');
const deepSrc = read('src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts');
const resolverSrc = read('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts');
const humanSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const promptSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const reducerSrc = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts');
const runtimeChanged = dialogueSrc + deepSrc + resolverSrc + humanSrc + promptSrc;

check('deep recognition reuses its existing model call and only adds a bounded feedback signal schema',
  (deepSrc.match(/modelGateway\.generate\(/g) || []).length === 2
  && deepSrc.includes('dialogueFeedbackSignal')
  && deepSrc.includes('reconcileCustomerServiceDialogueObligationWithModelSignal'));
check('recognition fast path cannot relabel an ongoing non-casual task as a fresh casual opening before semantic feedback is compiled',
  deepSrc.includes("activeStateTask.scenario !== 'CASUAL_CHAT'")
  && deepSrc.includes("heuristic.primaryScenario === 'CASUAL_CHAT'")
  && deepSrc.includes("task.currentTurnRelation === 'CONTINUATION'"));
check('existing parse-repair recognition path preserves dialogueFeedbackSignal instead of dropping the outcome event',
  deepSrc.includes('humanContext 只保留：primaryMotive、commercialOpenness、rankedTurnGoals、dominantTurnGoal、dialogueFeedbackSignal')
  && deepSrc.includes('dialogueFeedbackSignal 若原任务存在则必须保留'));
check('assistant ledger already persists INSUFFICIENT/CORRECTED/REJECTED reception as rejection state',
  reducerSrc.includes("['REJECTED', 'CORRECTED', 'INSUFFICIENT', 'ESCALATED'].includes(feedback.userFeedback)")
  && reducerSrc.includes('prior.requestedDeltas = feedback.requestedDeltas'));
check('HVE3 prompt treats rejected prior direction as lived continuity without repair scripting',
  promptSrc.includes('humanPresence.realization')
  && promptSrc.includes('server-owned continuity evidence')
  && promptSrc.includes('不得从这些事实额外创建当前轮 Acts')
  && promptSrc.includes('compileCustomerServiceFinalModelFacingHumanTurn(contract, frame)')
  && !/Repair 脚本/.test(promptSrc.slice(promptSrc.indexOf('function buildHumanConversationSystemPrompt'), promptSrc.indexOf('function buildHveModelFacingGenerationFrame'))));
check('current feedback projection is independent from legacy relationship heuristics',
  humanSrc.includes('const currentFeedback = state.latestFeedback')
  && !humanSrc.slice(humanSrc.indexOf('const currentFeedback = state.latestFeedback'), humanSrc.indexOf('\nfunction resolveTurnMode')).includes('state.relationshipDynamics'));
check('no trace/industry wording was encoded into runtime logic',
  !/(点脸|树荫|苹果手机|摄影|暗暗)/.test(runtimeChanged));
check('no new Humanizer/Repair/Gate/Fallback/Retry authority was introduced',
  !/(DisagreementHumanizer|CorrectionGate|RepeatRepair|NegativeEmotionPolicy|ConversationRealityGate|PersonaRepair|HumanizationRetry)/.test(runtimeChanged));

console.log(`\nH0.2-C Final Reality Outcome Persistence Closure: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
