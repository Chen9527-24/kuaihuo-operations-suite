#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const {
  emptyCustomerServiceConversationStateV2,
  reduceCustomerServiceConversationState,
  summarizeCustomerServiceConversationState,
  selectRelevantCustomerServiceMemories,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function stateTruth() {
  return {
    authority: 'STATE_MUTATION_EVIDENCE_ONLY',
    task: { relation: 'NONE', targetTaskId: null, evidence: '', confidence: 0 },
    memory: { action: 'NONE', targetMemoryId: null, replacementValue: null, evidence: '', confidence: 0 },
    entity: { action: 'NONE', targetEntityId: null, replacementValue: null, evidence: '', confidence: 0 },
  };
}
function dialogue() {
  return {
    previousAssistantMove: 'UNKNOWN', userFeedback: 'UNCLEAR', feedbackHandlingMode: 'NONE', acknowledgementRequired: false,
    requestedDeltas: [], feedbackTargetTurnNo: null, strategyChangeRequired: false, rejectedMove: null,
    correctionTarget: null, unresolvedNeed: null, repairObligation: false, forbiddenRepeatedMoves: [], acceptedConversationStyle: [],
    currentResponseObligation: '回应当前消息。', evidence: [], confidence: 0.9, source: 'EXPLICIT',
  };
}
function taskState(overrides = {}) {
  return {
    currentTurnRelation: 'NEW_REQUEST', activeScenario: 'CASUAL_CHAT', activeIntent: 'CASUAL', status: 'IN_PROGRESS',
    lastAssistantRequest: null, pendingSlots: [], providedSlots: [], unresolvedGoals: [], suspendedTasks: [],
    internalHandling: { required: false, status: 'NONE', scenario: null, reason: null, customerVisibleDisclosure: 'HIDDEN' },
    evidence: [], responsibility: 'NONE', semanticQuestions: [], requestResponseType: 'NONE', activeTaskId: null,
    longHorizonStatus: 'ACTIVE', ...overrides,
  };
}
function goal(key = 'RESPOND_TO_SHARED_CONTEXT') {
  return { key, name: key, priority: 1000, confidence: 0.95, evidence: ['fixture'], reason: 'fixture', responseRequirement: 'fixture', source: 'EXPLICIT', deferred: false };
}
function understanding({ scenario = 'CASUAL_CHAT', intent = 'CASUAL', goalKey = 'RESPOND_TO_SHARED_CONTEXT', task = {} } = {}) {
  const g = goal(goalKey);
  return {
    primaryScenario: scenario, primaryIntent: intent, confidence: 0.95, emotion: 'NEUTRAL',
    humanContext: {
      conversationTaskState: taskState(task), dominantTurnGoal: g, rankedTurnGoals: [g], requiredTurnGoals: [g],
      dialogueObligation: dialogue(), stateTruthSignal: stateTruth(), requiredResponseActs: ['DIRECT_ANSWER'],
      primaryMotive: 'RELATIONSHIP', secondaryMotives: [], mindset: 'OPEN', relationshipState: 'OPEN', conversationStance: 'FRIENDLY_SERVICE',
      commercialOpenness: 'CLOSED', commercialOpennessScore: 0, commercialStrategy: { stage: 'NO_COMMERCIAL_MOVE' },
      statedNeeds: [], inferredNeeds: [], valueOpportunities: [], evidence: [], uncertainties: [],
      emotionalDisclosure: { detected: false, polarity: 'NONE', mode: 'NONE', confidence: 0, adviceRequested: false, evidence: [] },
      emotionStrategy: {}, interactionStrategy: {}, replyStrategy: {}, semanticMoveBudget: {},
    },
  };
}
function reduce(previous, message, u = understanding()) {
  return reduceCustomerServiceConversationState({
    previous,
    dto: { message, conversationHistory: [], conversationState: previous, customerState: {}, variables: {} },
    understanding: u,
    assistantDraft: null,
    evidenceMessageIds: [`m-${(previous.currentTurn || 0) + 1}`],
  });
}

// Mechanism proof: current-turn memories may persist for future turns but never
// project back into the same turn as lived history. Use a generic preference fact so
// the verifier does not depend on the wording that originally exposed the bug.
const fresh0 = emptyCustomerServiceConversationStateV2();
const preference1 = reduce(fresh0, '我喜欢蓝色');
const storedPreference = preference1.memories.find((m) => m.kind === 'CUSTOMER_PREFERENCE');
check('current-turn factual memory is persisted for future continuity', Boolean(storedPreference), JSON.stringify(preference1.memories));
check('current-turn factual memory is not projected back into the same generation',
  summarizeCustomerServiceConversationState(preference1, '我喜欢蓝色').relevantMemories.length === 0,
  JSON.stringify(summarizeCustomerServiceConversationState(preference1, '我喜欢蓝色').relevantMemories));
check('persisted factual memory remains eligible on a later related turn',
  Boolean(storedPreference) && selectRelevantCustomerServiceMemories(preference1.memories, '蓝色', [], 2).some((m) => m.id === storedPreference.id));

// Authority proof: raw wording is not allowed to manufacture durable COMMITMENT
// history. The reducer may consume compatible persisted COMMITMENT state, but it no
// longer owns a phrase-level producer for that fact class.
const rawCommitmentLike = reduce(emptyCustomerServiceConversationStateV2(), '我会明天再试一下');
check('raw customer wording does not manufacture server-owned COMMITMENT memory',
  !rawCommitmentLike.memories.some((m) => m.kind === 'COMMITMENT'), JSON.stringify(rawCommitmentLike.memories));

const robot = read('src/modules/customer-service-agent/runtime/testing/customer-service-robot-test-dm-session.service.ts');
const tuningRepo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-tuning-session.repository.ts');
const autoReply = read('src/modules/auto-replies/auto-replies.service.ts');
const channel = read('src/modules/customer-service-agent/runtime/channel/customer-service-channel-reply.service.ts');
const runtime = read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const canonical = read('src/modules/customer-service-agent/runtime/state/customer-service-canonical-conversation-state.service.ts');
const canonicalRepo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-canonical-conversation-state.repository.ts');
const dialogueSrc = read('src/modules/dialogue-records/dialogue-records.service.ts');
const schema = read('prisma/schema.prisma');
const reducer = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts');

// Robot Test scope proof: fresh click creates a new tuning session and every state/message read is session-scoped.
check('Robot Test new session snapshot does not import canonical or prior-session conversationStateV2',
  /return this\.sessions\.create\([\s\S]*purpose: CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE[\s\S]*contextSnapshot:\s*\{[\s\S]*classificationMode:\s*'AUTO'[\s\S]*\}\s*as Prisma\.InputJsonValue/.test(robot)
  && !/contextSnapshot:\s*\{[\s\S]{0,900}conversationStateV2/.test(robot.slice(robot.indexOf('return this.sessions.create'))));
check('Robot Test session reads are scoped by session id plus tenant',
  tuningRepo.includes("where: { session: { id, tenantId } }")
  && tuningRepo.includes("where: { session: { id, tenantId }, id: { in: ids } }")
  && tuningRepo.includes("where: { id, tenantId }"));
check('Robot Test Runtime receives isolated tuningSessionId and no implicit canonicalConversationId',
  autoReply.includes('canonicalConversationId: dto.dialogueConversationId || undefined')
  && autoReply.includes('isolatedTestSessionId: useRobotTestSession ? robotTestSessionId : undefined')
  && autoReply.includes('isolatedFromCanonicalConversation: true')
  && channel.includes('tuningSessionId: input.isolatedTestSessionId')
  && channel.includes('canonicalConversationId: input.canonicalConversationId'));
check('Runtime canonical state is only entered through explicit canonicalConversationId',
  runtime.includes('dialogueConversationId: dto.canonicalConversationId')
  && runtime.includes('const isolatedTestSession = options.allowIsolatedTestSession === true && Boolean(effectiveDto.tuningSessionId)'));

// Production cross-customer audit proof: canonical memory is scoped to tenant + canonical conversation + robot.
check('production canonical state load is tenant + dialogueConversationId scoped and robot-checked',
  canonical.includes('const conversation = await this.repository.findConversation(tenantId, dialogueConversationId)')
  && canonical.includes('if (expectedRobotId && String(conversation.robotId) !== expectedRobotId)')
  && canonical.includes('this.repository.findState(tenantId, dialogueConversationId)'));
check('production canonical state row has one owner conversation',
  schema.includes('dialogueConversationId     String   @unique')
  && schema.includes('conversation DialogueConversation @relation(fields: [dialogueConversationId]'));
check('dialogue alias identity is partitioned by tenant + robot + source client + local conversation',
  schema.includes('@@unique([tenantId, robotId, sourceClientId, localConversationId])')
  && dialogueSrc.includes('tenantId_robotId_sourceClientId_localConversationId'));
check('strong-platform continuity discovery cannot cross tenant or robot and stays on one localConversationId',
  /where:\s*\{ tenantId, robotId, localConversationId \}/.test(dialogueSrc)
  && /where:\s*\{[\s\S]{0,180}id:\s*\{ in: candidateIds \}[\s\S]{0,180}platform,[\s\S]{0,100}channelType,[\s\S]{0,100}deletedAt:\s*null/.test(dialogueSrc));
check('canonical repository state lookup itself is tenant + conversation scoped',
  canonicalRepo.includes('where: { tenantId, dialogueConversationId }') || canonicalRepo.includes('where: { tenantId, dialogueConversationId:'));

const promptBuilder = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
check('same-turn memory projection is structurally excluded', reducer.includes('item.sourceTurn < currentTurn'));
check('legacy raw-text COMMITMENT producer is deleted instead of phrase-tuned',
  !reducer.includes("add('COMMITMENT'") && !reducer.includes('const commitment = normalized.match'));
check('existing Conversation Reality is explicitly projected into ordinary model-facing context',
  promptBuilder.includes('reality: {')
  && promptBuilder.includes('authority: conversationReality.authority')
  && promptBuilder.includes('currentTurn: conversationReality.currentTurn')
  && promptBuilder.includes('priorConversationMessages: conversationReality.priorConversationMessages')
  && promptBuilder.includes('exchangeStateBeforeCurrentReply: conversationReality.exchange.state')
  && promptBuilder.includes('priorAssistantTurns: conversationReality.exchange.priorAssistantTurns'));
check('prior-interaction truth uses one generalized server-owned evidence contract, not phrase cases',
  promptBuilder.includes('任何关于既往交互已经发生过什么的断言')
  && promptBuilder.includes('server-owned continuity evidence')
  && !promptBuilder.includes('你还记得我吗')
  && !promptBuilder.includes('雪球'));

console.log(`\nFresh Test Memory Scope + Continuity Truth Closure: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
