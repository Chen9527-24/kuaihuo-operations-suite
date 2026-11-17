#!/usr/bin/env node
'use strict';

process.env.TS_NODE_TRANSPILE_ONLY = '1';
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../../tsconfig.json');

const Module = require('module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@nestjs/common') return { Injectable: () => (target) => target };
  if (request.includes('customer-service-model-gateway.service')) return { CustomerServiceModelGateway: class {} };
  if (request.includes('compile-simulation.dto')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const {
  resolveCustomerServiceRecognizedDominantTurnGoal,
  projectCustomerServiceValidModelCompatibilityContext,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'));
const {
  CustomerServiceInteractionTypeResolver,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts'));
const {
  inferHumanContext,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-message-understanding.service.ts'));
const {
  inferConversationTaskState,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-conversation-task-state.ts'));
const {
  resolveCustomerServiceCriticalIntent,
} = require(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-critical-intent.util.ts'));

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function goal(key, priority, confidence, source = 'STATE', evidence = []) {
  return { key, name:key, priority, confidence, evidence, reason:'fixture', responseRequirement:'fixture', source, deferred:false };
}

const staleService = goal('RESOLVE_CURRENT_PROBLEM', 1880, 0.94, 'STATE', ['historical service task']);
const currentAnswer = goal('ANSWER_INFORMATION', 900, 0.94, 'MODEL', ['actual current question']);
let selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'ANSWER_INFORMATION', priority:900, confidence:0.94, evidence:['actual current question'], source:'MODEL' },
  [staleService, currentAnswer], staleService, 'Here is my actual current question',
);
check('evidence-bound current substantive goal outranks stale state priority', selected.key === 'ANSWER_INFORMATION', JSON.stringify(selected));

const currentClose = goal('CLOSE_CONVERSATION', 700, 0.95, 'MODEL', ['I will try that now']);
selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'CLOSE_CONVERSATION', priority:700, confidence:0.95, evidence:['I will try that now'], source:'MODEL' },
  [staleService, currentClose], staleService, 'Thanks, I will try that now',
);
check('close uses the same generic current-turn semantic precedence', selected.key === 'CLOSE_CONVERSATION', JSON.stringify(selected));

const relationOnly = goal('MAINTAIN_RELATIONSHIP', 700, 0.95, 'MODEL', ['hello there']);
selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'MAINTAIN_RELATIONSHIP', priority:700, confidence:0.95, evidence:['hello there'], source:'MODEL' },
  [staleService, relationOnly], staleService, 'hello there',
);
check('relationship posture cannot use substantive current-turn precedence', selected.key === 'RESOLVE_CURRENT_PROBLEM', JSON.stringify(selected));

selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'ANSWER_INFORMATION', priority:900, confidence:0.94, evidence:['not in message'], source:'MODEL' },
  [staleService, currentAnswer], staleService, 'different current text',
);
check('current semantic precedence requires verbatim current-turn evidence', selected.key === 'RESOLVE_CURRENT_PROBLEM', JSON.stringify(selected));

selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'ANSWER_INFORMATION', priority:900, confidence:0.61, evidence:['actual current question'], source:'MODEL' },
  [staleService, { ...currentAnswer, confidence:0.61 }], staleService, 'actual current question',
);
check('low-confidence semantic signal cannot outrank stale context', selected.key === 'RESOLVE_CURRENT_PROBLEM', JSON.stringify(selected));

const explicitSemanticsSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts'), 'utf8');
check('open-language explicit semantic producer is retired from Runtime source',
  !explicitSemanticsSrc.includes('inferExplicitCustomerSemantic')
  && !explicitSemanticsSrc.includes('resolveCustomerServiceFactOwnership(')
  && !explicitSemanticsSrc.includes('PATTERN = /'), explicitSemanticsSrc.slice(0, 300));

const directChoiceMessage = '我想买一条适合夏天办公室通勤的裤子，你有什么推荐？';
const staleInformationGoal = goal('ANSWER_INFORMATION', 1880, 0.94, 'STATE', ['historical product question']);
const typedDirectChoiceGoal = goal('SUPPORT_PURCHASE_DECISION', 900, 0.94, 'MODEL', ['你有什么推荐']);
selected = resolveCustomerServiceRecognizedDominantTurnGoal(
  { key:'SUPPORT_PURCHASE_DECISION', priority:900, confidence:0.94, evidence:['你有什么推荐'], source:'MODEL' },
  [staleInformationGoal, typedDirectChoiceGoal],
  staleInformationGoal,
  directChoiceMessage,
);
check('evidence-bound typed direct product choice cannot be demoted by stale information state merely because the surface is a question',
  selected.key === 'SUPPORT_PURCHASE_DECISION', JSON.stringify(selected));


const resolver = new CustomerServiceInteractionTypeResolver();
function understanding({scenario='CASUAL_CHAT', intent='CASUAL', goalKey='MAINTAIN_RELATIONSHIP', required=[], phase='OPENING', motive='RELATIONSHIP_CONTACT', taskStatus='NONE', relation='NEW_REQUEST'}) {
  return {
    primaryScenario: scenario,
    primaryIntent: intent,
    humanContext: {
      dominantTurnGoal: goal(goalKey, 1000, 0.9, 'MODEL', ['fixture']),
      requiredTurnGoals: required.map((k) => goal(k, 900, 0.9, 'MODEL', ['fixture'])),
      conversationTaskState: { currentTurnRelation: relation, status: taskStatus },
      dialogueObligation: { strategyChangeRequired:false },
      emotionalDisclosure: { mode:'NONE', detected:false },
      interactionStrategy: { phase },
      primaryMotive: motive,
    },
  };
}
function plan(identityResponse='NONE') { return { expressionPlan: { identityResponse } }; }

let type = resolver.resolve({
  understanding: understanding({goalKey:'ANSWER_INFORMATION', required:['ANSWER_INFORMATION'], phase:'OPENING', motive:'RELATIONSHIP_CONTACT'}),
  plan: plan(), knowledgeAvailable:false, latestCustomerMessage:'A concrete problem stated casually',
});
check('substantive CASUAL turn cannot become SOCIAL_GREETING from opening/relationship posture', type === 'CASUAL_CHAT', type);

type = resolver.resolve({
  understanding: understanding({intent:'PROBLEM_RESOLUTION', goalKey:'MAINTAIN_RELATIONSHIP', phase:'OPENING', motive:'RELATIONSHIP_CONTACT'}),
  plan: plan(), knowledgeAvailable:false, latestCustomerMessage:'A problem statement without question punctuation',
});
check('substantive primary intent also blocks SOCIAL_GREETING when coarse goal posture lags behind', type === 'CASUAL_CHAT', type);

type = resolver.resolve({
  understanding: understanding({goalKey:'MAINTAIN_RELATIONSHIP', phase:'OPENING', motive:'RELATIONSHIP_CONTACT'}),
  plan: plan(), knowledgeAvailable:false, latestCustomerMessage:'hello',
});
check('true relationship-only opening remains SOCIAL_GREETING', type === 'SOCIAL_GREETING', type);

type = resolver.resolve({
  understanding: understanding({scenario:'AFTER_SALE', intent:'PROBLEM_RESOLUTION', goalKey:'SUMMARIZE_CONVERSATION', required:['SUMMARIZE_CONVERSATION'], phase:'SERVICE', motive:'PROBLEM_RESOLUTION', taskStatus:'IN_PROGRESS'}),
  plan: plan(), knowledgeAvailable:false, latestCustomerMessage:'summarize our discussion',
});
check('current summary operation outranks stale service interaction family', type === 'GENERAL_SERVICE', type);

type = resolver.resolve({
  understanding: understanding({scenario:'AFTER_SALE', intent:'PROBLEM_RESOLUTION', goalKey:'CLOSE_CONVERSATION', required:['CLOSE_CONVERSATION'], phase:'CLOSING', motive:'PROBLEM_RESOLUTION', taskStatus:'IN_PROGRESS'}),
  plan: plan(), knowledgeAvailable:false, latestCustomerMessage:'I am done for now',
});
check('current close operation outranks stale service interaction family', type === 'CASUAL_CHAT', type);

type = resolver.resolve({
  understanding: understanding({scenario:'SAFETY_SENSITIVE', intent:'ASK_INFORMATION', goalKey:'RESOLVE_CURRENT_PROBLEM', required:['RESOLVE_CURRENT_PROBLEM'], phase:'SERVICE', motive:'PROBLEM_RESOLUTION', taskStatus:'IN_PROGRESS'}),
  plan: plan('AI_IDENTITY_TRUTHFUL'), knowledgeAvailable:false, latestCustomerMessage:'你是AI吗',
});
check('Safety/Security owns the turn before identity handling', type === 'SECURITY_SENSITIVE', type);

function inferredCasualContext(message, intent, emotion = 'NEUTRAL') {
  const dto = { message, conversationHistory: [], conversationState: {}, customerState: {}, variables: {} };
  const task = inferConversationTaskState(dto, 'CASUAL_CHAT', intent);
  return inferHumanContext({
    dto,
    message,
    normalized: message.toLowerCase(),
    scenario: 'CASUAL_CHAT',
    intent,
    emotion,
    riskLevel: 'LOW',
    customerRejectedRecommendation: false,
    conversationTaskState: task,
  });
}

const fallbackQuestion = inferredCasualContext('This looks like a question?', 'ASK_INFORMATION', 'ANXIOUS');
const fallbackGreeting = inferredCasualContext('hello hello', 'ASK_INFORMATION', 'ANXIOUS');
check('model-unavailable compatibility projection does not derive goal/phase from customer wording',
  fallbackQuestion.dominantTurnGoal.key === fallbackGreeting.dominantTurnGoal.key
  && fallbackQuestion.interactionStrategy.phase === fallbackGreeting.interactionStrategy.phase
  && fallbackQuestion.replyStrategy.mode === fallbackGreeting.replyStrategy.mode,
  JSON.stringify({ question: fallbackQuestion.dominantTurnGoal, greeting: fallbackGreeting.dominantTurnGoal }));
check('model-unavailable fallback carries no phrase-derived durable needs or commercial exploration',
  fallbackQuestion.statedNeeds.length === 0
  && fallbackQuestion.inferredNeeds.length === 0
  && fallbackQuestion.commercialStrategy.stage === 'NO_COMMERCIAL_MOVE',
  JSON.stringify({ stated: fallbackQuestion.statedNeeds, inferred: fallbackQuestion.inferredNeeds, commercial: fallbackQuestion.commercialStrategy }));

const typedProductGoal = {
  ...goal('EXPLORE_PRODUCT_NEED', 1000, 0.9, 'MODEL', ['typed product need']),
  requestedContributionKind: 'DECISION_SUPPORT',
  requestedEvidenceScope: 'MERCHANT_BUSINESS',
  requestedDecisionMode: 'SELECT_OR_PRIORITIZE_OPTION',
  responseRequirement: '基于已确认条件提供购买选择支持。',
};
function fallbackProductContext(message) {
  const dto = { message, conversationHistory: [], conversationState: {}, customerState: {}, variables: {} };
  const task = inferConversationTaskState(dto, 'PRODUCT_CONSULT', 'PURCHASE_INTEREST');
  return inferHumanContext({
    dto,
    message,
    normalized: message.toLowerCase(),
    scenario: 'PRODUCT_CONSULT',
    intent: 'PURCHASE_INTEREST',
    emotion: 'NEUTRAL',
    riskLevel: 'LOW',
    conversationTaskState: task,
  });
}
const modelSuccessProjectionA = projectCustomerServiceValidModelCompatibilityContext(
  fallbackProductContext('surface wording A'),
  { primaryMotive:'PURCHASE_EXPLORATION', commercialOpenness:'ACTIVE', dominantTurnGoal:typedProductGoal, rankedTurnGoals:[typedProductGoal] },
);
const modelSuccessProjectionB = projectCustomerServiceValidModelCompatibilityContext(
  fallbackProductContext('completely different punctuation?!'),
  { primaryMotive:'PURCHASE_EXPLORATION', commercialOpenness:'ACTIVE', dominantTurnGoal:typedProductGoal, rankedTurnGoals:[typedProductGoal] },
);
check('valid Deep Recognition product envelope projects legacy commercial fields from typed semantics instead of unavailable fallback',
  modelSuccessProjectionA.commercialStrategy.stage === 'PRODUCT_RECOMMENDATION'
  && modelSuccessProjectionA.commercialStrategy.productMentionPolicy === 'SPECIFIC_IF_RELEVANT'
  && modelSuccessProjectionA.interactionStrategy.phase === 'DECISION'
  && modelSuccessProjectionA.interactionStrategy.firstMove === 'SUPPORT_DECISION'
  && modelSuccessProjectionA.commercialOpennessScore === 80
  && modelSuccessProjectionA.uncertainties.length === 0,
  JSON.stringify(modelSuccessProjectionA));
check('valid model compatibility projection contains no model-unavailable semantic markers',
  !JSON.stringify(modelSuccessProjectionA).includes('Deep Recognition 尚未提供')
  && !JSON.stringify(modelSuccessProjectionA).includes('Neutral fallback')
  && !JSON.stringify(modelSuccessProjectionA).includes('No positive open-language semantic authority in fallback')
  && !JSON.stringify(modelSuccessProjectionA).includes('Neutral compatibility fallback'),
  JSON.stringify(modelSuccessProjectionA));
check('valid model compatibility projection is invariant to raw wording when the typed envelope is identical',
  JSON.stringify({
    stage:modelSuccessProjectionA.commercialStrategy.stage,
    policy:modelSuccessProjectionA.commercialStrategy.productMentionPolicy,
    interaction:modelSuccessProjectionA.interactionStrategy,
    replyMode:modelSuccessProjectionA.replyStrategy.mode,
    score:modelSuccessProjectionA.commercialOpennessScore,
  }) === JSON.stringify({
    stage:modelSuccessProjectionB.commercialStrategy.stage,
    policy:modelSuccessProjectionB.commercialStrategy.productMentionPolicy,
    interaction:modelSuccessProjectionB.interactionStrategy,
    replyMode:modelSuccessProjectionB.replyStrategy.mode,
    score:modelSuccessProjectionB.commercialOpennessScore,
  }));

const taskWithEmotion = understanding({intent:'ASK_INFORMATION', goalKey:'ANSWER_INFORMATION', required:['ANSWER_INFORMATION'], phase:'SERVICE', motive:'INFORMATION_SEEKING'});
taskWithEmotion.humanContext.emotionalDisclosure = { detected:true, mode:'NEGATIVE_SHARING' };
type = resolver.resolve({ understanding: taskWithEmotion, plan: plan(), knowledgeAvailable:false, latestCustomerMessage:'A concrete question with some worry' });
check('emotion observer cannot steal InteractionType from a current task goal', type === 'CASUAL_CHAT', type);

function typedCriticalUnderstanding(focus, extraFocus = null) {
  const dominant = { ...goal('ANSWER_INFORMATION', 1000, 0.95, 'MODEL', ['typed evidence']), requestedAnswerFocus: focus };
  const required = extraFocus
    ? [{ ...goal('ANSWER_INFORMATION', 900, 0.95, 'MODEL', ['other typed evidence']), requestedAnswerFocus: extraFocus }]
    : [];
  return {
    primaryScenario: 'GENERAL_INQUIRY',
    primaryIntent: 'ASK_INFORMATION',
    humanContext: { dominantTurnGoal: dominant, requiredTurnGoals: required },
  };
}

let critical = resolveCustomerServiceCriticalIntent(typedCriticalUnderstanding('PUBLIC_NAME'));
check('typed PUBLIC_NAME focus projects finite name query', critical.intent === 'NAME_QUERY', JSON.stringify(critical));
critical = resolveCustomerServiceCriticalIntent(typedCriticalUnderstanding('SERVICE_SCOPE'));
check('typed SERVICE_SCOPE focus projects finite service-scope query', critical.intent === 'SERVICE_SCOPE_QUERY', JSON.stringify(critical));
critical = resolveCustomerServiceCriticalIntent(typedCriticalUnderstanding('AI_IDENTITY'));
check('typed AI_IDENTITY focus projects finite AI identity query', critical.intent === 'AI_IDENTITY_QUERY', JSON.stringify(critical));
critical = resolveCustomerServiceCriticalIntent(typedCriticalUnderstanding('SERVICE_ROLE'));
check('typed SERVICE_ROLE focus projects finite role confirmation', critical.intent === 'ROLE_CONFIRMATION', JSON.stringify(critical));
critical = resolveCustomerServiceCriticalIntent(typedCriticalUnderstanding('CURRENT_SPECIFIC_QUESTION'));
check('non-identity typed focus cannot manufacture critical identity', critical.intent === 'NONE', JSON.stringify(critical));

const deepSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts'), 'utf8');
const understandingSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/understanding/customer-service-message-understanding.service.ts'), 'utf8');
const interactionSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts'), 'utf8');
const behaviorResolverPath = path.join(root, 'src/modules/customer-service-agent/runtime/behavior/customer-service-human-behavior-resolver.service.ts');
const planCompilerSrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts'), 'utf8');
const fastPathSrc = deepSrc.slice(deepSrc.indexOf('function resolveRecognitionFastPath'), deepSrc.indexOf('function validateRecognitionPayload'));

check('Deep Recognition is the positive open-language semantic owner while deterministic message understanding retains only hard safety/security floors',
  !deepSrc.includes('inferExplicitCustomerSemantic')
  && !deepSrc.includes('resolveCustomerServiceEffectiveExplicitSemantic')
  && understandingSrc.includes('SAFETY_SENSITIVE')
  && understandingSrc.includes('SECURITY_SENSITIVE'));
check('model-valid path does not rebuild scenario/topic shift from lexical heuristic seeds',
  !deepSrc.includes('explicitTopicShift')
  && !deepSrc.includes('pragmatics.lowInformation && !rawModelCurrentGoal')
  && deepSrc.includes("const primaryScenario = manualScenario || hardFloorScenario || modelScenario || 'GENERAL_INQUIRY'"));
check('model-valid merge uses a typed-envelope compatibility projection instead of the model-unavailable fallback as legacy strategy source',
  deepSrc.includes('projectCustomerServiceValidModelCompatibilityContext(')
  && deepSrc.includes('modelCompatibilityFallbackHumanContext')
  && /normalizeHumanContext\(\s*payload\.humanContext,\s*modelCompatibilityFallbackHumanContext,/.test(deepSrc));
check('current-turn operation is carried by evidence-bound typed goal rather than latent-life-context lexical arbitration',
  deepSrc.includes('const rawModelCurrentGoal = resolveCustomerServiceModelCurrentTurnGoal(payload, dto.message)')
  && !deepSrc.includes('hasLatentCommercialOpportunity('));
check('open PRODUCT_COMPARE heuristic scenario is no longer a hard preserve against Deep Recognition',
  !deepSrc.includes("heuristic.primaryScenario === 'PRODUCT_COMPARE' && ['PRODUCT_CONSULT'"));
check('scenario contract is demoted by generic evidence-bound current semantic goal, not close-only exception',
  deepSrc.includes('hasAuthoritativeCurrentTurnGoal(context.dominantTurnGoal, latestMessage)')
  && !deepSrc.includes("context.dominantTurnGoal.key === 'CLOSE_CONVERSATION'\n    && !['SAFETY_SENSITIVE'"));
check('evidence-bound current goal blocks stale task-state goal replacement except typed slot-processing relations',
  deepSrc.includes('hasAuthoritativeCurrentTurnGoal(context.dominantTurnGoal, latestMessage)')
  && deepSrc.includes("!['HANDLE_INFORMATION_BARRIER', 'PROCESS_PROVIDED_INFORMATION'].includes(context.dominantTurnGoal.key)"));
check('required response contract no longer inherits stale fallback composite bundle',
  !deepSrc.includes('useFallbackComposite') && !deepSrc.includes('fallbackKeys.includes(context.dominantTurnGoal.key)'));
check('open-language semantic fast path is fully retired instead of shortcutting Deep Recognition',
  fastPathSrc.includes('return null;')
  && !fastPathSrc.includes('INFORMATION_BARRIER')
  && !fastPathSrc.includes('PROCESS_PROVIDED_INFORMATION'));
check('open-language casual/emotional/service fast paths are retired so Deep Recognition remains current semantic Authority',
  !fastPathSrc.includes('explicitNegativeDisclosure')
  && !fastPathSrc.includes('explicitEmotionalContinuation')
  && !fastPathSrc.includes('stableEmotionalDisclosureContinuation')
  && !fastPathSrc.includes('explicitCasualConfirmation')
  && !fastPathSrc.includes('stableCasualContinuation')
  && !fastPathSrc.includes('stableServiceContinuation')
  && !fastPathSrc.includes('高置信度显性服务场景快速路径')
  && !fastPathSrc.includes('高置信度轻松交流快速路径'));
check('structured task-state alignment remains downstream of Deep Recognition rather than a semantic fast path',
  deepSrc.includes("task.currentTurnRelation === 'INFORMATION_BARRIER'")
  && deepSrc.includes("key: 'HANDLE_INFORMATION_BARRIER'")
  && deepSrc.includes("key: 'PROCESS_PROVIDED_INFORMATION'"));
check('R0 reuses the existing Deep Recognition primary + JSON-repair calls and adds no third model call',
  (deepSrc.match(/modelGateway\.generate\(/g) || []).length === 2);
check('pre-model understanding contains no open-language casual/emotional/business intent parser',
  !understandingSrc.includes('SCENARIO_RULES')
  && !understandingSrc.includes('inferExplicitCustomerSemantic')
  && understandingSrc.includes('No positive open-language business semantics inferred before Deep Recognition.'));
check('question punctuation is diagnostic-only and cannot create scenario/intent/goal authority',
  understandingSrc.includes('Structural routing diagnostic only')
  && understandingSrc.includes('isQuestion: /[?？]$/.test(text)')
  && !understandingSrc.includes('explicitQuestion'));
check('final substantive Turn Goal forces commercial strategy to posture-only/no-extra-move',
  deepSrc.includes("stage: 'NO_COMMERCIAL_MOVE'")
  && deepSrc.includes('商业开放度只能作为背景，不能制造额外动作'));
check('requested advice enters emotional realization only from typed emotional context',
  /const emotionalRequestedAdvice = goal\.key === 'PROVIDE_REQUESTED_ADVICE'/.test(deepSrc)
  && deepSrc.includes("context.primaryMotive === 'EMOTIONAL_SHARING'")
  && deepSrc.includes('context.emotionalDisclosure?.detected === true'));
check('interaction resolver checks substantive need before SOCIAL_GREETING',
  interactionSrc.indexOf('hasSubstantiveCurrentTurnNeed(turnGoalKeys)') < interactionSrc.indexOf("return 'SOCIAL_GREETING'"));
check('boundary-only commercial override no longer re-promotes itself after model recognition',
  !deepSrc.includes('alignHumanContextWithExplicitRecommendationBoundary('));
check('model current-turn goal contract requires latest-message evidence for current authority',
  deepSrc.includes('evidence 必须逐字摘自 latestMessage')
  && deepSrc.includes('resolveCustomerServiceModelCurrentTurnGoal(payload, dto.message)'));
const retiredBehaviorSrc = fs.readFileSync(behaviorResolverPath, 'utf8');
check('Legacy HumanBehaviorResolver is retired instead of keeping a duplicate identity/behavior recognizer',
  retiredBehaviorSrc.includes('RETIRED FROM PRODUCTION RUNTIME')
  && !retiredBehaviorSrc.includes('class CustomerServiceHumanBehaviorResolver')
  && !interactionSrc.includes('expressionPlan')
  && !planCompilerSrc.includes('HUMAN_BEHAVIOR_ACT'));
check('Canonical generation primary goal consumes final dominant Turn Goal before scenario serviceGoal',
  planCompilerSrc.includes("primary: input.plan.dominantTurnGoal?.responseRequirement || input.plan.dominantTurnGoal?.key || input.plan.serviceGoal"));
check('R0 adds no new semantic repair/greeting gate/fallback manager',
  !deepSrc.includes('GreetingGate') && !deepSrc.includes('SemanticRepair') && !deepSrc.includes('ScenarioRepair')
  && !interactionSrc.includes('QuestionOverrideGate') && !interactionSrc.includes('GreetingRepair'));
check('runtime contains no latest trace-specific pet sentence fixture',
  !deepSrc.includes('猫突然不在猫砂盆') && !interactionSrc.includes('猫突然不在猫砂盆') && !understandingSrc.includes('猫突然不在猫砂盆'));

console.log(`\nR0 Current-Turn Semantic Authority Convergence: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
