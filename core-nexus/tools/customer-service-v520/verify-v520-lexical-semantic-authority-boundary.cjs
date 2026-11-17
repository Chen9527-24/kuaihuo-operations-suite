#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

const rel = {
  explicit: 'src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts',
  heuristic: 'src/modules/customer-service-agent/runtime/understanding/customer-service-message-understanding.service.ts',
  deep: 'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts',
  dialogue: 'src/modules/customer-service-agent/runtime/understanding/customer-service-dialogue-obligation.ts',
  task: 'src/modules/customer-service-agent/runtime/understanding/customer-service-conversation-task-state.ts',
  behavior: 'src/modules/customer-service-agent/runtime/behavior/customer-service-behavior-memory.util.ts',
  state: 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts',
  actionFamily: 'src/modules/customer-service-agent/runtime/state/customer-service-semantic-action-family.ts',
  obligation: 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts',
  critical: 'src/modules/customer-service-agent/runtime/interaction/customer-service-critical-intent.util.ts',
  plan: 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
  planner: 'src/modules/customer-service-agent/runtime/planning/customer-service-reply-planner.service.ts',
  state: 'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts',
  actionFamily: 'src/modules/customer-service-agent/runtime/state/customer-service-semantic-action-family.ts',
  opening: 'src/modules/customer-service-agent/shared/context/customer-service-opening-reception.util.ts',
  speaker: 'src/modules/customer-service-agent/runtime/voice/customer-service-role-speaker-projection.ts',
  v26: 'docs/hve/01_DEVELOPMENT_RULES_V26.md',
};
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const src = Object.fromEntries(Object.entries(rel).map(([k, p]) => [k, read(p)]));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const authorityDirs = [
  'src/modules/customer-service-agent/runtime/interaction',
  'src/modules/customer-service-agent/runtime/generation',
  'src/modules/customer-service-agent/runtime/planning',
  'src/modules/customer-service-agent/runtime/state',
];
const forbiddenExplicitSemanticImports = [];
for (const dir of authorityDirs) {
  const base = path.join(root, dir);
  for (const name of fs.readdirSync(base)) {
    const full = path.join(base, name);
    if (!fs.statSync(full).isFile() || !name.endsWith('.ts')) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (text.includes('customer-service-explicit-semantics')) forbiddenExplicitSemanticImports.push(path.relative(root, full));
  }
}
check('open-language semantic compatibility module is not imported by downstream Canonical/Generation/Planning/State authority consumers',
  forbiddenExplicitSemanticImports.length === 0, forbiddenExplicitSemanticImports.join(', '));

check('legacy explicit-semantics module is now structural finalization only, with no raw-message business regex producer',
  src.explicit.includes('Deterministic fact/referent finalization after typed semantic understanding')
  && src.explicit.includes('namedOfferingMentionSpans')
  && src.explicit.includes('contextualReferentSelection')
  && !src.explicit.includes('inferExplicitCustomerSemantic')
  && !src.explicit.includes('resolveCustomerServiceFactOwnership(')
  && !src.explicit.includes('PATTERN = /'));

check('Required current-turn obligations close over executable typed Deep Recognition goals rather than a legacy key whitelist alone',
  src.deep.includes('export function resolveCustomerServiceRequiredTurnGoals')
  && src.deep.includes('isCustomerServiceExecutableTypedGoal')
  && src.deep.includes("['INFORMATION', 'DECISION_SUPPORT', 'ACTION', 'ADVICE']")
  && src.deep.includes('resolveCustomerServiceRequiredTurnGoals(context, rawModelTurnGoals)'));

check('Deep Recognition is the positive open-language owner; pre-model fallback is neutral except hard safety/security floors',
  src.heuristic.includes('No positive open-language business semantics inferred before Deep Recognition.')
  && src.heuristic.includes('detectSafetySecurityHardFloor')
  && !src.heuristic.includes('SCENARIO_RULES')
  && !src.heuristic.includes('inferExplicitCustomerSemantic'));

check('Answer Obligation consumes typed requestedAnswerFocus and contains no raw customer-wording facet parser',
  src.obligation.includes('goal?.requestedAnswerFocus')
  && src.obligation.includes("focus === 'RECOMMENDATION'")
  && !src.obligation.includes('function signal(')
  && !/new RegExp\(/.test(src.obligation));

check('Deep Recognition prompt requires semantic decomposition of compound/conditional obligations without fixed phrase or punctuation templates',
  src.deep.includes('复合请求必须按可独立验收的语义义务拆入 rankedTurnGoals')
  && src.deep.includes('不要用固定关键词、固定句式、问号数量或标点模板判断是否存在该义务'));

check('Deep Recognition positive semantic producer is not pre-anchored by lexical heuristic/pragmatic seeds',
  !src.deep.includes('heuristicSeed:')
  && !src.deep.includes('pragmaticSeed:')
  && src.deep.includes("lexicalFallbackAuthority: 'NONE_WHEN_MODEL_RESULT_IS_VALID'"));

check('valid typed Deep Recognition goals replace fallback goals instead of merging a second semantic owner after the model',
  src.deep.includes('const merged: CustomerServiceTurnGoal[] = [];')
  && src.deep.includes('const source = merged.length')
  && !src.deep.includes('const merged = fallback.map((item) => ({ ...item, evidence: [...item.evidence] }));'));

check('typed evidence scope owns FactOwnership; structured Grounding finalizer cannot infer merchant scope from customer wording',
  src.deep.includes('resolveCustomerServiceFactOwnershipFromTypedTurnGoals(rawModelTurnGoals)')
  && src.deep.includes('`TYPED_EVIDENCE_SCOPE:${scopeLabel}`')
  && !src.explicit.includes('CURRENT_BUSINESS_PRICE_AVAILABILITY_PATTERN')
  && !src.explicit.includes('IMPLICIT_MERCHANT_CATALOG_MATCH_PATTERN'));

check('DialogueObligation fallback is neutral and evidence-bound model signal is the only customer feedback semantic owner',
  src.dialogue.includes("userFeedback: 'UNCLEAR'")
  && src.dialogue.includes('reconcileCustomerServiceDialogueObligationWithModelSignal')
  && !src.dialogue.includes('inferRequestedDeltas(')
  && !src.dialogue.includes('inferFeedbackType(')
  && !src.dialogue.includes('resolveDeterministicDialogueFeedbackSource('));

check('critical identity/service semantics project only from typed requestedAnswerFocus',
  src.critical.includes('requestedAnswerFocus')
  && src.critical.includes('TYPED_ANSWER_FOCUS')
  && !/\.test\(/.test(src.critical)
  && !/new RegExp\(/.test(src.critical));

check('task-state fallback is structural/state-only and does not use raw wording to create lifecycle transitions',
  src.task.includes('structural and state-only')
  && !src.task.includes('TOPIC_SHIFT_PATTERN')
  && !src.task.includes('RESOLUTION_PATTERN')
  && !src.task.includes('inferExplicitCustomerSemantic'));

check('opening reception uses typed opening semantics and explicit reception enum instead of greeting/identity wording regex',
  src.opening.includes('isTypedOpeningGreeting')
  && src.opening.includes('inferReceptionTypeFromStructuredProfile')
  && !src.opening.includes('isPureGreetingMessage')
  && !/售后\|退换\|退款/.test(src.opening)
  && !/顾问\|咨询/.test(src.opening));

check('free-text role/account/store expression is not keyword-compiled into typed speaker behavior authority',
  src.speaker.includes('FREE_TEXT_ROLE_CONTEXT_NOT_COMPILED_TO_TYPED_BEHAVIOR')
  && src.speaker.includes("source: 'EXPLICIT_ROLE_PROFILE' | 'COMPILED_ROLE_CONTEXT' | 'NEUTRAL_COMPATIBILITY'")
  && !src.speaker.includes('compileSpeakerProfileFromResolvedRoleText')
  && !src.speaker.includes('COMPILED_WARMTH')
  && !/const has = \(pattern: RegExp\)/.test(src.speaker));

check('recommendation refusal/novelty boundaries use typed intent/deltas instead of customer phrase compatibility flags',
  src.plan.includes("requestedDeltas.includes('NO_SPECIFIC_RECOMMENDATION')")
  && src.planner.includes("understanding.primaryIntent === 'REFUSE_SOLUTION'")
  && src.planner.includes("actions.push('STOP_RECOMMENDATION')")
  && !src.plan.includes('customerRejectedRecommendation')
  && !src.planner.includes('customerRejectedRecommendation')
  && !src.actionFamily.includes('不要重复'));

check('relationship persistence is driven by typed deltas/state rather than customer warmth/humor phrase lists',
  src.state.includes("deltas.has('LESS_WARM')")
  && src.state.includes("deltas.has('HUMOR_OK')")
  && src.state.includes("deltas.has('NO_HUMOR')")
  && !src.state.includes('抱抱|')
  && !src.state.includes('哈哈|'));

check('intent catalog EXACT authority cannot be promoted by fuzzy names/examples/recognition hints',
  src.deep.includes('only from the model-supplied catalog key')
  && src.deep.includes("matchStatus: 'EXACT' as const")
  && src.deep.includes('仅作诊断相关性，不授予 Runtime EXACT Authority')
  && !src.deep.includes('isDefinitionSemanticallyCompatible'));

check('history context window is stable/bounded rather than expanded from latest-message continuation keywords',
  src.deep.includes('.slice(-16)')
  && !src.deep.includes('needsExpandedWindow'));

check('V26 contains a lexical semantic Authority boundary and explicit exception taxonomy',
  src.v26.includes('Lexical / Surface Heuristic Authority Boundary')
  && src.v26.includes('不得在已经存在 typed semantic owner 时重新成为第二份业务语义 Authority')
  && src.v26.includes('协议/格式/结构解析')
  && src.v26.includes('Safety / Security hard floor')
  && src.v26.includes('permission-reducing boundary floor')
  && src.v26.includes('Diagnostic / lint / observability / migration compatibility'));

check('assistant semantic history does not re-parse generated prose into moves/action families',
  !src.state.includes('inferAssistantMove(')
  && !src.state.includes('extractCustomerServiceSemanticActionFamilies(')
  && !src.actionFamily.includes('pattern: /'));
check('behavior memory semantic Acts come from structured plan contracts, not suggestion/CTA/identity phrase regex',
  src.behavior.includes('projectObservedActsFromStructuredContracts')
  && !src.behavior.includes('function inferObservedActs(')
  && !src.behavior.includes('isImplicitQuestionClause(')
  && !src.behavior.includes('const suggestion = /')
  && !src.behavior.includes('const cta = /'));

console.log(`\nLexical Semantic Authority Boundary: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
