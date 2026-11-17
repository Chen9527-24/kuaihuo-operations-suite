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

let pass = 0; let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const humanSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const nlgSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts');
const reducerSrc = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts');
const promptSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const kernelSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts');
const finalSrc = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
const understandingSrc = read('src/modules/customer-service-agent/runtime/understanding/customer-service-message-understanding.service.ts');
const deepRecognitionSrc = read('src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts');

const profile = {
  schemaVersion: 1, preset: 'CUSTOM',
  corePresence: { warmth: 64, directness: 62, formality: 42, energy: 50, playfulness: 18, emotionalExpressiveness: 46 },
  conversationalTexture: { colloquiality: 'MEDIUM', brevity: 'BALANCED', sentenceShape: 'MIXED', fragmentTolerance: 'MEDIUM', ellipsisTolerance: 'LOW', completionCadence: 'LOW', rhythmVariation: 'MEDIUM' },
  interactionStyle: { proactivity: 'BALANCED', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'BALANCED', empathyStyle: 'BALANCED', humorTolerance: 'LOW' },
  relationshipStyle: { baselineDistance: 'PROFESSIONAL_FRIENDLY', familiarityAdaptation: 'GRADUAL' },
  deliveryStyle: { segmentation: 'NATURAL', emoji: 'LIGHT', sentenceParticleLevel: 'LOW' },
};
const role = resolveCustomerServiceResolvedRoleIdentityContext({
  merchantRole: { id: 'r-b-rel', code: 'b-rel', name: '通用角色', description: '处理用户当前问题。', publicRelation: '顾问', revision: 1 },
  prototype: { id: 'p-b-rel', code: 'p-b-rel', speakerProfile: profile, personality: null, languageStyle: null, servicePosture: null, revision: 1 },
  accountProfile: { id: 'a-b-rel', revision: 1, channel: 'PRIVATE_DOMAIN', profile: {} },
  storeProfile: { id: 's-b-rel', revision: 1, name: '通用空间', profile: {} },
});
const capability = resolveCustomerServiceRoleCapabilityContextProjection({
  merchantRole: { publicRelation: role.identity.publicRelation, description: role.identity.roleDescription },
  prototype: { identity: role.identity.prototypeIdentity, personality: null, languageStyle: null, servicePosture: null },
  accountProfile: null, storeProfile: null, resolvedRoleIdentity: role,
});
const posture = {
  schemaVersion: 1, authority: 'ROLE_DATA_ONLY', source: 'TYPED_V1',
  effective: { schemaVersion: 1, initiativeLevel: 'BALANCED', openingParticipation: 'CONTEXTUAL_ENTRY', followUpOffering: 'CONTEXTUAL_OFFER', clarificationInitiative: 'DECISION_RELEVANT', guidanceInitiative: 'CONTEXTUAL', resolutionFollowThrough: 'NEXT_STEP', salesPressure: 'LOW' },
  sourceModules: [], legacyUntypedModuleCount: 0, issues: [],
};
const plan = {
  schemaVersion: 2, interactionType: 'GENERAL_SERVICE',
  acts: [{ id: 'a1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', priority: 900, sources: [] }],
  suppressedActs: [], grounding: { requirements: [], prohibitedUnknownFacts: [] },
  completion: { mode: 'ALLOW_CONTINUATION', conditions: [], allowOptionalContinuation: true },
  answerObligation: { continuity: 'CONTINUING', currentFocus: 'CURRENT_SPECIFIC_QUESTION', currentFocusLabel: '当前问题', previousFocus: 'CURRENT_SPECIFIC_QUESTION', mustAddNewInformation: true, avoidRepeat: true, evidenceState: 'NOT_REQUIRED', unknownStrategy: 'NOT_APPLICABLE', responseTarget: { focus: 'CURRENT_SPECIFIC_QUESTION', requestedSpecificity: 'DIRECTION', priorCoverage: 'PARTIAL', requiredDelta: 'NEW_INFORMATION', knowledgeRequirement: 'NOT_REQUIRED', unresolvedNeed: null, source: 'UNDERSTANDING', confidence: 0.8, evidence: [] } },
  diagnostics: { roleTurnPolicy: { maneuver: 'FOLLOW_CANONICAL_PLAN' } },
};
const serviceRealization = {
  family: { family: 'GENERAL', responsePriority: 'VALUE_FIRST', emotionalRegister: 'NEUTRAL', optionalQuestionRestraint: 'NORMAL' },
  opening: { active: false, invitation: 'FORBIDDEN', receptionType: 'CONSULTANT', allowCasualChat: true, serviceEntryTarget: null, avoidGenericChatInvitation: true },
  identity: { mode: 'NONE', answerFirst: false, stopAfterAnswer: false }, acknowledgement: { mode: 'NONE', fuseWithNextValue: true },
  currentTurnValue: { mode: 'DIRECT' }, question: { posture: 'NONE', target: null, decisionPurpose: null, selectionRule: 'NONE', avoidNavigationOnly: true },
  multiTurn: { varyFromRecentStructure: true }, rhythm: { shape: 'ONE_BEAT', maxSentences: 2, maxQuestions: 0, stopWhenComplete: false },
};
const dynA = { relationshipDistance: 'CLOSE', warmContactAcceptance: 'ACCEPTED', humorAcceptance: 'ACCEPTED', supportMode: 'COMPANIONSHIP', previousReplyReception: 'ACCEPTED', emotionalIntensity: 'LOW', conversationTempo: 'LIGHT', recommendedStance: 'LIGHT_FRIENDLY', recentInterpersonalActions: [], recentPracticalActions: [], evidence: ['legacy-a'] };
const dynB = { relationshipDistance: 'FORMAL', warmContactAcceptance: 'REJECTED', humorAcceptance: 'REJECTED', supportMode: 'SPACE', previousReplyReception: 'REJECTED', emotionalIntensity: 'HIGH', conversationTempo: 'SERIOUS', recommendedStance: 'FORMAL_SAFE', recentInterpersonalActions: [], recentPracticalActions: [], evidence: ['legacy-b'] };
function state({ turn = 3, dynamics = dynA, feedback = null, withAssistant = true } = {}) {
  return {
    schemaVersion: 2, revision: turn, currentTurn: turn, activeTask: null, suspendedTasks: [], relevantMemories: [],
    recentAssistantMoves: withAssistant ? [{ turn: Math.max(1, turn - 1), move: 'ANSWER', actionFamilies: [], practicalActionFamilies: [], interpersonalActionFamilies: [], strategyKey: '', openingKey: '', endingKey: '', accepted: null, rejected: false, requestedDeltas: [], excerpt: '此前已给过一个方向。', behavior: null }] : [],
    behaviorHistory: { lastAssistantMoveAccepted: null, lastAssistantMoveRejected: false, recentRequestedDeltas: [] },
    relationshipDynamics: dynamics, latestFeedback: feedback, closedSemanticQuestions: [], canonicalFields: {},
  };
}
function turn(conversationState, recentConversationCount = 2) {
  return resolveCustomerServiceHumanTurnRealization({
    plan, speaker: role.speakerProjection, resolvedRoleIdentity: role, interactionPosture: posture, roleCapabilityContext: capability,
    conversationState, recentConversationCount, serviceRealization,
    identity: { businessLabel: null, relationLabel: '顾问', publicName: null, surfaceLabel: '顾问' },
    latestCustomerMessage: '继续看下一步。',
  });
}
const a = turn(state({ dynamics: dynA }));
const b = turn(state({ dynamics: dynB }));
const fresh = turn(state({ turn: 1, dynamics: dynA, withAssistant: false }), 0);
const repair = turn(state({ dynamics: dynB, feedback: { userFeedback: 'ESCALATED', feedbackHandlingMode: 'TRUST_REPAIR', strategyChangeRequired: true, correctionTarget: 'INTERACTION', requestedDeltas: [] } }));

check('legacy relationshipDynamics cannot change model-facing HumanTurn adaptation', JSON.stringify(a.adaptation) === JSON.stringify(b.adaptation), `${JSON.stringify(a.adaptation)} <> ${JSON.stringify(b.adaptation)}`);
check('fresh relationship distance comes from explicit role relationship configuration', fresh.adaptation.relationshipDistance === 'NEUTRAL', JSON.stringify(fresh.adaptation));
check('ongoing exchange adapts one relationship step without lexical evidence', a.conversationReality.exchange.state === 'ONGOING' && a.adaptation.relationshipDistance === 'WARM', JSON.stringify(a.adaptation));
check('GRADUAL mirroring activates only in an ongoing server-owned exchange', fresh.adaptation.mirrorIntensity === 'RESTRAINED' && a.adaptation.mirrorIntensity === 'BALANCED');
check('structured TRUST_REPAIR can narrow relationship distance without message keyword matching', repair.adaptation.relationshipDistance === 'REPAIR' && repair.adaptation.mirrorIntensity === 'RESTRAINED');

const sigStart = humanSrc.indexOf('export function resolveCustomerServiceHumanTurnRealization');
const sigEnd = humanSrc.indexOf('}): CustomerServiceHumanTurnRealizationV1', sigStart);
const signature = humanSrc.slice(sigStart, sigEnd);
const relStart = humanSrc.indexOf('function resolveRelationshipAdaptation');
const relEnd = humanSrc.indexOf('function resolveRoleEmbodiment', relStart);
const relSrc = humanSrc.slice(relStart, relEnd);
const callStart = nlgSrc.indexOf('resolveCustomerServiceHumanTurnRealization({');
const callEnd = nlgSrc.indexOf('});', callStart);
const callSrc = nlgSrc.slice(callStart, callEnd);
check('HumanTurn API no longer accepts relationshipDynamics-derived relationshipDistance', sigStart >= 0 && !signature.includes('relationshipDistance: string'));
check('NLG no longer passes legacy relationshipDynamics into HumanTurn', callStart >= 0 && !callSrc.includes('relationshipDynamics') && !callSrc.includes('relationshipDistance:'));
check('relationship adaptation consumes only typed role config + exchange state + structured feedback mode', relSrc.includes('baselineDistance') && relSrc.includes('familiarityAdaptation') && relSrc.includes('exchangeState') && relSrc.includes("feedbackHandlingMode === 'TRUST_REPAIR'") && !relSrc.includes('latestCustomerMessage') && !/input\.relationshipDynamics|state\.relationshipDynamics|dynamics\./.test(relSrc));
check('relationship adaptation has no current-message keyword or regex branch', !/RegExp|\.test\(|includes\(['\"][^'\"]*(?:哈哈|抱|熟悉|老客户|亲近)/.test(relSrc));
check('relationship adaptation introduces no fixed turn-count threshold', !/currentTurn|priorAssistantTurns|priorConversationMessages|>=\s*\d|>\s*\d/.test(relSrc));
check('legacy relationshipDynamics remains outside the HVE3 model-facing prompt', !promptSrc.includes('relationshipDynamics'));
check('Final model-facing surface keeps one factual relationship-distance owner', /relationshipContext:\s*\{[\s\S]*distance:\s*human\.adaptation\.relationshipDistance/.test(finalSrc));
check('no new relationship planner/gate/judge/repair/retry authority', !/(RelationshipPlanner|RelationshipGate|RelationshipJudge|RelationshipRepair|RelationshipRetry|FamiliarityJudge)/.test(humanSrc + nlgSrc));
check('kernel records B relationship truth convergence without replacing prior B speaker continuity governance', kernelSrc.includes('V1.38 Phase B Speaker Continuity Consumption') && kernelSrc.includes('V1.39 Phase B Relationship Truth Producer Convergence')
  && kernelSrc.includes('V1.40 Ordinary Generation Availability Preservation') && kernelSrc.includes('V1.41 Full-project Send Authority Seal'));
check('legacy relationship heuristic producer is demoted rather than duplicated', reducerSrc.includes('function updateRelationshipDynamics') && !callSrc.includes('relationshipDynamics'));
check('heuristic Understanding relationship fallback no longer manufactures familiarity from scenario/emotion/wording/count', (() => {
  const start = understandingSrc.indexOf('function inferRelationshipState');
  const end = understandingSrc.indexOf('function inferConversationStance', start);
  const body = understandingSrc.slice(start, end);
  const executable = body.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  return executable.includes('state.relationshipState') && executable.includes("return 'FORMAL'")
    && !executable.includes('CASUAL_CHAT') && !executable.includes('COMPLAINT_ESCALATION')
    && !executable.includes('containsAny(') && !executable.includes('priorConversationCount')
    && !executable.includes('returningCustomer') && !executable.includes('emotion');
})());
check('Deep Recognition relationship rule binds familiarity to verifiable state/history rather than wording', deepRecognitionSrc.includes('只能依据 customerState 明确关系配置或 state/recentConversation 中可验证的已有关系历史判断') && deepRecognitionSrc.includes('不能根据一句话语气、称呼、闲聊场景或关键词制造熟悉度'));

console.log(`\nPhase B Relationship Truth Producer Convergence: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
