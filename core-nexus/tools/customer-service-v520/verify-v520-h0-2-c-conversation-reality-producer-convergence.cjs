#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

const { resolveCustomerServiceResolvedRoleIdentityContext } = require(path.join(root, 'src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts'));
const { resolveCustomerServiceRoleCapabilityContextProjection } = require(path.join(root, 'src/modules/customer-service-agent/runtime/role/customer-service-role-capability-context-projection.ts'));
const { resolveCustomerServiceHumanTurnRealization } = require(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const role = resolveCustomerServiceResolvedRoleIdentityContext({
  merchantRole: { id: 'r-c', code: 'c', name: '顾问', description: '负责持续理解当前问题并给出实用建议。', publicRelation: '顾问', revision: 1 },
  prototype: { id: 'p-c', code: 'p-c', personality: '自然、耐心、具体。', languageStyle: '口语自然。', servicePosture: '沿着真实对话继续判断，不重复开局。', revision: 1 },
  accountProfile: { id: 'a-c', revision: 1, channel: 'PRIVATE_DOMAIN', profile: { tone: '自然、耐心。', voice: '先接当前变化，再给必要判断。', background: '长期做日常咨询。', relationship: '熟悉、会记住前面讨论过的限制并继续往下判断的顾问', greetingServiceScope: '可一起看当前问题。' } },
  storeProfile: { id: 's-c', revision: 1, name: '测试空间', profile: { brandTone: '自然', mainBusiness: '日常咨询' } },
});
const capability = resolveCustomerServiceRoleCapabilityContextProjection({
  merchantRole: { publicRelation: role.identity.publicRelation, description: role.identity.roleDescription },
  prototype: { identity: role.identity.prototypeIdentity, personality: role.rolePrototype.personality, languageStyle: role.rolePrototype.languageStyle, servicePosture: role.rolePrototype.servicePosture },
  accountProfile: null,
  storeProfile: null,
  resolvedRoleIdentity: role,
});
const posture = {
  schemaVersion: 1, authority: 'ROLE_DATA_ONLY', source: 'TYPED_V1',
  effective: { schemaVersion: 1, initiativeLevel: 'BALANCED', openingParticipation: 'CONTEXTUAL_ENTRY', followUpOffering: 'CONTEXTUAL_OFFER', clarificationInitiative: 'DECISION_RELEVANT', guidanceInitiative: 'CONTEXTUAL', resolutionFollowThrough: 'NEXT_STEP', salesPressure: 'LOW' },
  sourceModules: [], legacyUntypedModuleCount: 0, issues: [],
};
const plan = {
  schemaVersion: 2,
  interactionType: 'GENERAL_SERVICE',
  acts: [{ id: 'a1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', priority: 900, sources: [] }],
  suppressedActs: [],
  grounding: { requirements: [], prohibitedUnknownFacts: [] },
  completion: { mode: 'ALLOW_CONTINUATION', conditions: [], allowOptionalContinuation: true },
  answerObligation: {
    continuity: 'NEW_NEED', currentFocus: 'CURRENT_SPECIFIC_QUESTION', currentFocusLabel: '当前问题', previousFocus: null,
    mustAddNewInformation: false, avoidRepeat: false, evidenceState: 'NOT_REQUIRED', unknownStrategy: 'NOT_APPLICABLE',
    responseTarget: { focus: 'CURRENT_SPECIFIC_QUESTION', requestedSpecificity: 'DIRECTION', priorCoverage: 'NONE', requiredDelta: 'NONE', knowledgeRequirement: 'NOT_REQUIRED', unresolvedNeed: null, source: 'UNDERSTANDING', confidence: 0.8, evidence: [] },
  },
  diagnostics: { roleTurnPolicy: { maneuver: 'FOLLOW_CANONICAL_PLAN' } },
};
const serviceRealization = {
  family: { family: 'GENERAL', responsePriority: 'VALUE_FIRST', emotionalRegister: 'NEUTRAL', optionalQuestionRestraint: 'NORMAL' },
  opening: { active: false, invitation: 'FORBIDDEN', receptionType: 'CONSULTANT', allowCasualChat: true, serviceEntryTarget: null, avoidGenericChatInvitation: true },
  identity: { mode: 'NONE', answerFirst: false, stopAfterAnswer: false },
  acknowledgement: { mode: 'NONE', fuseWithNextValue: true },
  currentTurnValue: { mode: 'DIRECT' },
  question: { posture: 'NONE', target: null, decisionPurpose: null, selectionRule: 'NONE', avoidNavigationOnly: true },
  multiTurn: { varyFromRecentStructure: false },
  rhythm: { shape: 'ONE_BEAT', maxSentences: 2, maxQuestions: 0, stopWhenComplete: false },
};

const move = {
  turn: 4, move: 'ANSWER', actionFamilies: [], practicalActionFamilies: [], interpersonalActionFamilies: [], strategyKey: '', openingKey: '', endingKey: '',
  accepted: false, rejected: true, requestedDeltas: ['MORE_SPECIFIC'], excerpt: '前面那个方向不太适合我。', behavior: null,
};
function state(dynamics) {
  return {
    schemaVersion: 2, revision: 5, currentTurn: 5,
    activeTask: { id: 'task-1', scenario: 'GENERAL_SERVICE', intent: 'ASK', goal: '继续解决当前选择问题', status: 'ACTIVE', responsibility: 'SHARED', pendingSlots: [], providedSlots: [], unresolvedGoals: ['继续比较'], completedSteps: [], evidence: [], evidenceMessageIds: [], createdTurn: 1, lastActiveTurn: 5, resolvedTurn: null, resumeSignals: [], proactiveReminderAllowed: false },
    suspendedTasks: [{ id: 'task-0', scenario: 'GENERAL_SERVICE', intent: 'ASK', goal: '前一个相关问题角度', status: 'SUSPENDED', responsibility: 'SHARED', pendingSlots: [], providedSlots: [], unresolvedGoals: [], completedSteps: [], evidence: [], evidenceMessageIds: [], createdTurn: 2, lastActiveTurn: 4, resolvedTurn: null, resumeSignals: ['TOPIC_SHIFT'], proactiveReminderAllowed: false }],
    relevantMemories: [{ id: 'memory-2-constraint', kind: 'CUSTOMER_CONSTRAINT', key: 'customer.constraint.current', value: '当前选择要兼顾已有现实限制', evidence: '我前面说过这个限制还得算进去', evidenceMessageIds: ['m2'], sourceTurn: 2, confidence: 0.94, durable: true, temporaryEmotion: false, invalidated: false, withdrawn: false, supersededBy: null, lastUsedTurn: 5 }],
    recentAssistantMoves: [move],
    behaviorHistory: { lastAssistantMoveAccepted: false, lastAssistantMoveRejected: true, recentRequestedDeltas: ['MORE_SPECIFIC'] },
    relationshipDynamics: dynamics,
    latestFeedback: null, closedSemanticQuestions: [], canonicalFields: {},
  };
}
const heuristicA = { relationshipDistance: 'CLOSE', warmContactAcceptance: 'ACCEPTED', humorAcceptance: 'ACCEPTED', supportMode: 'COMPANIONSHIP', previousReplyReception: 'ACCEPTED', emotionalIntensity: 'LOW', conversationTempo: 'LIGHT', recommendedStance: 'LIGHT_FRIENDLY', recentInterpersonalActions: [], recentPracticalActions: [], evidence: ['哈哈/温暖关键词启发式'] };
const heuristicB = { relationshipDistance: 'FORMAL', warmContactAcceptance: 'REJECTED', humorAcceptance: 'REJECTED', supportMode: 'SPACE', previousReplyReception: 'REJECTED', emotionalIntensity: 'HIGH', conversationTempo: 'SERIOUS', recommendedStance: 'FORMAL_SAFE', recentInterpersonalActions: [], recentPracticalActions: [], evidence: ['另一组启发式'] };
function turn(conversationState, recentConversationCount = 8) {
  return resolveCustomerServiceHumanTurnRealization({
    plan, speaker: role.speakerProjection, resolvedRoleIdentity: role, interactionPosture: posture, roleCapabilityContext: capability,
    conversationState, recentConversationCount, serviceRealization,
    identity: { businessLabel: null, relationLabel: '顾问', publicName: null, surfaceLabel: '顾问' },
    latestCustomerMessage: '那换一个方向呢？',
  });
}
const a = turn(state(heuristicA));
const b = turn(state(heuristicB));
const stateOwnedOnly = turn(state(heuristicA), 0);

check('semantic NEW_NEED does not reset factual conversation depth', a.turnComposition.semanticDelta.continuity === 'NEW_NEED' && a.conversationReality.currentTurn === 5 && a.conversationReality.priorConversationMessages === 8);
check('ongoing exchange is owned by server state rather than prompt-window history', stateOwnedOnly.conversationReality.exchange.state === 'ONGOING' && stateOwnedOnly.conversationReality.priorConversationMessages === 0 && stateOwnedOnly.conversationReality.exchange.priorAssistantTurns === 1);
check('semantic NEW_NEED cannot reset ongoing exchange reality', a.turnComposition.semanticDelta.continuity === 'NEW_NEED' && a.conversationReality.exchange.state === 'ONGOING');
check('active task carries server-owned turn lineage and unresolved goals', a.conversationReality.activeTask?.createdTurn === 1 && a.conversationReality.activeTask?.lastActiveTurn === 5 && a.conversationReality.activeTask?.unresolvedGoals?.includes('继续比较'));
check('recent suspended task survives a semantic facet switch without becoming a new Act', a.conversationReality.recentSuspendedTasks?.[0]?.goal === '前一个相关问题角度' && a.conversationReality.recentSuspendedTasks?.[0]?.lastActiveTurn === 4 && a.turnComposition.segmentPlan.flatMap((s) => s.plannedActTypes).every((x) => x === 'DIRECT_ANSWER'));
check('factual rejection survives in Conversation Reality', a.conversationReality.continuity.lastAssistantMoveRejected === true && a.conversationReality.recentAssistantMoves[0]?.rejected === true);
check('requested delta survives without creating a new Act', a.conversationReality.continuity.recentRequestedDeltas.includes('MORE_SPECIFIC') && a.conversationReality.recentAssistantMoves[0]?.requestedDeltas.includes('MORE_SPECIFIC') && a.turnComposition.segmentPlan.flatMap((s) => s.plannedActTypes).every((x) => x === 'DIRECT_ANSWER'));
check('active task survives topic-facet semantic NEW_NEED', a.conversationReality.activeTask?.status === 'ACTIVE' && a.conversationReality.activeTask?.goal === '继续解决当前选择问题');
check('R1 relevance-selected customer constraint survives inside Conversation Reality', a.conversationReality.relevantMemories?.length === 1 && a.conversationReality.relevantMemories[0]?.kind === 'CUSTOMER_CONSTRAINT' && a.conversationReality.relevantMemories[0]?.value === '当前选择要兼顾已有现实限制');
check('relevant customer memory stays realization context and creates no Act', a.turnComposition.segmentPlan.flatMap((s) => s.plannedActTypes).every((x) => x === 'DIRECT_ANSWER'));
check('legacy warmth/humor/emotion heuristics do not alter Conversation Reality', JSON.stringify(a.conversationReality) === JSON.stringify(b.conversationReality), `${JSON.stringify(a.conversationReality)} <> ${JSON.stringify(b.conversationReality)}`);
check('Conversation Reality exposes no legacy relationship heuristic object', !Object.prototype.hasOwnProperty.call(a.conversationReality, 'relationship'));

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const humanSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const promptSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const reducerSrc = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts');
const cStart = humanSrc.indexOf('function resolveConversationReality');
const cEnd = humanSrc.indexOf('\nfunction resolveTurnMode', cStart);
const cSrc = humanSrc.slice(cStart, cEnd);

check('HVE3 Conversation Reality producer no longer consumes relationshipDynamics', cStart >= 0 && !cSrc.includes('state.relationshipDynamics') && !cSrc.includes('dynamics.') && !cSrc.includes('warmContactAcceptance:') && !cSrc.includes('humorAcceptance:') && !cSrc.includes('conversationTempo:'));
check('legacy relationship heuristic producer remains available for Legacy compatibility', reducerSrc.includes('function updateRelationshipDynamics') && reducerSrc.includes('explicitWarmRequest') && reducerSrc.includes('acceptsHumor'));
check('model-facing HVE3 keeps legacy relationship scaffolding out while HumanTurn owns structured relationship adaptation', !/modelFacingAdaptation|_diagnosticRelationshipDistance|relationshipDynamics/.test(promptSrc) && !/relationshipDistance:\s*input\.relationshipDistance/.test(humanSrc) && /relationshipContext:\s*\{[\s\S]*distance:\s*human\.adaptation\.relationshipDistance/.test(read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts')));
check('source-bound summary style does not reintroduce heuristic relationshipDistance', !promptSrc.slice(promptSrc.indexOf('function buildCanonicalSourceBoundSummaryPrompt'), promptSrc.indexOf('function buildHve3SystemPrompt')).includes('adaptation.relationshipDistance'));
check('prompt keeps lived conversation first-class while speaker is identity/context-only and HumanTurn owns semantics with one typed Persona surface', promptSrc.includes("speaker:") && promptSrc.includes("conversation:") && promptSrc.includes('priorSpeakerTurns') && promptSrc.includes("authority: 'PC_RESOLVED_ROLE_IDENTITY_CONTEXT'") && promptSrc.includes('humanPresence.surface') && promptSrc.includes('PERSONA_SURFACE_PROFILE='));
check('Conversation Reality consumes only relevance-selected memories rather than raw canonical field dumps', cSrc.includes('state.relevantMemories') && !cSrc.includes('state.canonicalFields'));
check('Conversation Reality lived context excludes topic/emotion/repair memory classes', cSrc.includes("'CUSTOMER_FACT', 'CUSTOMER_PREFERENCE', 'CUSTOMER_CONSTRAINT', 'DECISION', 'COMMITMENT'") && !cSrc.includes("'TOPIC_ANCHOR', 'EMOTIONAL_EVENT'"));
check('prompt preserves ongoing exchange without exposing suspended-task dossiers or NEW_NEED semantic labels', promptSrc.includes('priorSpeakerTurns、recentConversation、activeTask 和 memories 仅是只读连续事实') && !promptSrc.includes('recentSuspendedTasks: conversationReality.recentSuspendedTasks') && promptSrc.includes('不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则') && !promptSrc.includes('NEW_NEED'));
check('H0.2-C adds no Emotion/Empathy/Persona repair authority', !/(EmotionHumanizer|EmpathyGate|PersonaRepair|HumanizationRetry|RelationshipJudge|ConversationRealityGate)/.test(humanSrc + promptSrc));
check('H0.2-C does not alter semantic previousFocus lifecycle', !cSrc.includes('previousFocus'));

console.log(`\nH0.2-C Conversation Reality Producer Convergence: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
