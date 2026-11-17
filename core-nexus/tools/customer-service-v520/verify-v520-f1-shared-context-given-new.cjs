#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const humanFile = path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const promptFile = path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const replyFile = path.join(root, 'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const humanSrc = fs.readFileSync(humanFile, 'utf8');
const promptSrc = fs.readFileSync(promptFile, 'utf8');
const replySrc = fs.readFileSync(replyFile, 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`[PASS] ${name}`); }
  else { fail += 1; console.error(`[FAIL] ${name}${detail ? ` · ${detail}` : ''}`); }
}

check('Shared Context lives inside the existing HumanTurn contract', /sharedContext:\s*\{[\s\S]*?authority:\s*'REALIZATION_ONLY'/.test(humanSrc));
check('Shared Context cannot create Acts/facts/permissions/referents', /cannotCreateActs:\s*true/.test(humanSrc) && /cannotChangeFactsOrPermission:\s*true/.test(humanSrc) && /cannotInventReferents:\s*true/.test(humanSrc));
check('Shared Context has only realization reference modes', /referentialMode:\s*'IMPLICIT'\s*\|\s*'LIGHT_ANCHOR'\s*\|\s*'EXPLICIT'/.test(humanSrc));
check('Resolver consumes Canonical Plan + Conversation Reality + Turn Composition + Need Alignment', /function resolveSharedContextGivenNew\([\s\S]*?plan:\s*CustomerServiceInteractionPlanV2[\s\S]*?conversationReality:[\s\S]*?turnComposition:[\s\S]*?needAlignment:/.test(humanSrc));
check('Resolver does not inspect raw customer wording', !/latestCustomerMessage|\.includes\(|\.match\(|RegExp|regex/i.test(humanSrc.slice(humanSrc.indexOf('function resolveSharedContextGivenNew'), humanSrc.indexOf('function fallbackAnswerObligation'))));
check('No role/industry/test-sentence special cases in F1 runtime delta', !/(宠物|女装|护肤|狗粮|反应不过来|那确实|很正常|技术顾问)/u.test(humanSrc + '\n' + promptSrc + '\n' + replySrc));
check('No model call / retry / repair introduced by F1 resolver', !/openai|chat\.completions|responses\.create|generateContent|invokeModel|retry|repair/iu.test(humanSrc.slice(humanSrc.indexOf('function resolveSharedContextGivenNew'), humanSrc.indexOf('function fallbackAnswerObligation'))));
check('Shared Context remains server-side realization diagnostics rather than model-facing procedure', !/sharedContext:\s*frame\.humanTurnRealization/.test(promptSrc) && !/buildSharedContextHint/.test(promptSrc));
check('RoleEmbodiment explicitly has no current-turn execution authority', /roleEmbodiment:\s*\{[\s\S]*?turnExecutionAuthority:\s*'NONE'/.test(humanSrc) && /turnExecutionAuthority:\s*'NONE'/.test(humanSrc.slice(humanSrc.indexOf('function resolveRoleEmbodiment'), humanSrc.indexOf('function resolveConversationReality'))));
check('Model-facing role context centers speaker identity/context while current-turn authority stays in HumanTurn', promptSrc.includes("authority: 'PC_RESOLVED_ROLE_IDENTITY_CONTEXT'") && promptSrc.includes('humanPresence.surface') && promptSrc.includes('`humanPresence.realization` 是 Generation 唯一的当前轮行为/语义边界'));
check('Ordinary generation receives factual prior-contribution status without F1 reuse instructions', /priorContributionStatus:\s*human\.sharedContext\.priorContributionStatus/.test(fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'),'utf8')) && /requestedDeltas:\s*\[\.\.\.new Set/.test(fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'),'utf8')) && promptSrc.includes('仅是只读连续事实') && promptSrc.includes('当前轮语义责任仍只由 humanPresence.realization 提供') && !/首个可见语义单元|IMPLICIT：|LIGHT_ANCHOR：|EXPLICIT：/.test(promptSrc));
check('Shared Context modes remain in server producer but are not projected as model instructions', /referentialMode:\s*'IMPLICIT'\s*\|\s*'LIGHT_ANCHOR'\s*\|\s*'EXPLICIT'/.test(humanSrc) && !/IMPLICIT：|LIGHT_ANCHOR：|EXPLICIT：/.test(promptSrc));
check('Generation prompt contains no F1 wording blacklist or Rewrite authority', !/sharedContext[^\n]*(黑名单|Rewrite Authority|文本 Judge)/.test(promptSrc) && !/buildRewrite|buildHve3RewritePrompt/.test(promptSrc));
check('Primary and recovery generation share the same minimal speaker/conversation and current HumanTurn carrier path with no Rewrite path', /function buildHvePrompt[\s\S]*buildHveModelFacingGenerationFrame\(contract, frame\)/.test(promptSrc) && /buildHumanConversationSystemPrompt\(mode, modelFrame\.humanPresence\)/.test(promptSrc) && !/buildRewrite|buildHve3RewritePrompt/.test(promptSrc));
check('Model-facing continuity stays factual without exposing IMPLICIT execution labels', promptSrc.includes('仅是只读连续事实') && promptSrc.includes('server-owned continuity evidence') && !/IMPLICIT：/.test(promptSrc));
check('Generation avoids fixed reception formula through one semantic authority rather than lexical policing', promptSrc.includes('不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则') && promptSrc.includes('当前轮语义责任仍只由 humanPresence.realization 提供') && !/FORBIDDEN_PHRASE|receptionBlacklist|ackBlacklist|固定承接句/i.test(promptSrc));
check('Robot Test observability projects Shared Context read-only', /sharedContext:\s*Object\.keys\(sharedContext\)\.length/.test(replySrc) && /referentialMode/.test(replySrc) && /mustAdvanceBeyondGiven/.test(replySrc) && /priorContributionStatus/.test(replySrc) && /priorContributionReuse/.test(replySrc));

const transpiled = ts.transpileModule(humanSrc + '\nexports.__resolveSharedContextGivenNew = resolveSharedContextGivenNew;\n', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const sandbox = {
  exports: {},
  module: { exports: {} },
  require: (id) => {
    if (String(id).includes('customer-service-role-conditioned-participation')) {
      return { resolveCustomerServiceRoleConditionedParticipationFrame: () => ({}) };
    }
    return {};
  },
  console,
};
sandbox.module.exports = sandbox.exports;
vm.runInNewContext(transpiled, sandbox, { filename: humanFile });
const resolve = sandbox.exports.__resolveSharedContextGivenNew;
check('Actual Shared Context resolver is executable', typeof resolve === 'function');

function makeCase({ acts = [], continuity = 'NEW_NEED', priorCoverage = 'NONE', requiredDelta = 'NONE', focus = 'CURRENT_SPECIFIC_QUESTION', exchange = 'FRESH', reception = 'UNCLEAR', primary = 'ANSWER', opening = 'PRIMARY_FIRST', mustAddNewInformation = false, avoidRepeat = false, accepted = null, rejected = false, requestedDeltas = [] }) {
  return resolve({
    plan: { acts: acts.map((type, i) => ({ id: `a${i}`, type, necessity: 'REQUIRED', priority: 100 - i, sources: [] })) },
    conversationReality: {
      exchange: { state: exchange, priorAssistantTurns: exchange === 'ONGOING' ? 1 : 0 },
      continuity: { lastAssistantMoveAccepted: accepted, lastAssistantMoveRejected: rejected, recentRequestedDeltas: [...requestedDeltas] },
      currentFeedback: { reception, handlingMode: 'NONE', strategyChangeRequired: false, correctionTarget: reception === 'CORRECTED' ? 'CONTENT' : null, requestedDeltas: [...requestedDeltas] },
    },
    turnComposition: {
      semanticDelta: {
        continuity,
        mustAddNewInformation,
        avoidRepeat,
        responseTarget: { focus, priorCoverage, requiredDelta },
      },
    },
    needAlignment: { primaryContribution: primary, openingBias: opening },
  });
}


const fresh = makeCase({});
check('Fresh direct-value treats the current customer turn as Given', fresh.currentTurnInformation === 'GIVEN_BY_CUSTOMER' && fresh.referentialMode === 'IMPLICIT' && fresh.referenceBasis === 'CURRENT_TURN_GIVEN');
check('Fresh primary-first starts at actual contribution without evaluative reception', fresh.newValueStart === 'PRIMARY_CONTRIBUTION' && fresh.avoidEvaluativeReceptionBeforeValue === true);
check('Fresh answer must add value beyond customer Given, not merely restate it', fresh.mustAdvanceBeyondGiven === true);

const ongoing = makeCase({ exchange: 'ONGOING', priorCoverage: 'SAME_FOCUS_PARTIAL' });
check('Established same-focus thread stays implicit and must advance beyond Given', ongoing.referentialMode === 'IMPLICIT' && ongoing.referenceBasis === 'ESTABLISHED_THREAD' && ongoing.mustAdvanceBeyondGiven === true);

const accepted = makeCase({ exchange: 'ONGOING', priorCoverage: 'SAME_FOCUS_PARTIAL', reception: 'ACCEPTED', accepted: true });
check('Accepted prior contribution becomes shared reality to advance from', accepted.priorContributionStatus === 'ACCEPTED' && accepted.priorContributionReuse === 'ADVANCE_FROM_ACCEPTED');

const rejected = makeCase({ exchange: 'ONGOING', priorCoverage: 'SAME_FOCUS_PARTIAL', reception: 'REJECTED', rejected: true });
check('Rejected prior contribution requires a changed direction rather than re-proof', rejected.priorContributionStatus === 'REJECTED' && rejected.priorContributionReuse === 'CHANGE_FROM_REJECTED');

const correctedPrior = makeCase({ exchange: 'ONGOING', continuity: 'CORRECTION', priorCoverage: 'CORRECTION', requiredDelta: 'CORRECT', reception: 'CORRECTED' });
check('Corrected prior contribution binds correction instead of treating old value as Given', correctedPrior.priorContributionStatus === 'CORRECTED' && correctedPrior.priorContributionReuse === 'CORRECT_PRIOR');

const deltaPrior = makeCase({ exchange: 'ONGOING', priorCoverage: 'SAME_FOCUS_PARTIAL', requestedDeltas: ['MORE_SPECIFIC'] });
check('Requested delta becomes the only carryover direction without creating a new Act', deltaPrior.priorContributionReuse === 'FOLLOW_REQUESTED_DELTA');

const facet = makeCase({ exchange: 'ONGOING', continuity: 'FOLLOW_UP_NEW_FACET', requiredDelta: 'NEW_FACET' });
check('New facet in established thread gets LIGHT_ANCHOR rather than full restatement', facet.referentialMode === 'LIGHT_ANCHOR' && facet.referenceBasis === 'NEW_FACET_IN_ESTABLISHED_THREAD');

const ambiguity = makeCase({ acts: ['CLARIFY_AMBIGUITY'], primary: 'CLARIFY' });
check('Canonical ambiguity resolution requires explicit referential binding', ambiguity.referentialMode === 'EXPLICIT' && ambiguity.referenceBasis === 'AMBIGUITY_RESOLUTION' && ambiguity.newValueStart === 'REQUIRED_CLARIFICATION');

const correction = makeCase({ continuity: 'CORRECTION', priorCoverage: 'CORRECTION', requiredDelta: 'CORRECT', reception: 'CORRECTED' });
check('Correction requires explicit binding', correction.referentialMode === 'EXPLICIT' && correction.referenceBasis === 'CORRECTION_BINDING');

const comparison = makeCase({ focus: 'COMPARISON' });
check('Comparison uses explicit precision binding', comparison.referentialMode === 'EXPLICIT' && comparison.referenceBasis === 'PRECISION_BINDING');

const compatibility = makeCase({ focus: 'COMPATIBILITY' });
check('Compatibility uses explicit precision binding', compatibility.referentialMode === 'EXPLICIT' && compatibility.referenceBasis === 'PRECISION_BINDING');

const restatement = makeCase({ acts: ['RESTATEMENT'] });
check('Canonical RESTATEMENT remains explicit and is not silently suppressed', restatement.referentialMode === 'EXPLICIT' && restatement.referenceBasis === 'CANONICAL_RESTATEMENT');

const relational = makeCase({ opening: 'RELATIONAL_FIRST' });
check('Required relational opening is preserved without forcing primary-first', relational.newValueStart === 'RELATIONAL_ACK_THEN_PRIMARY' && relational.avoidEvaluativeReceptionBeforeValue === false);


const pureRelate = makeCase({ primary: 'RELATE', opening: 'RELATIONAL_FIRST' });
check('Pure relational participation can acknowledge without inventing informational value', pureRelate.mustAdvanceBeyondGiven === false && pureRelate.newValueStart === 'RELATIONAL_ACK_THEN_PRIMARY');

const pureClose = makeCase({ primary: 'CLOSE' });
check('Natural close is not forced to invent new informational value', pureClose.mustAdvanceBeyondGiven === false);

const requiredClarify = makeCase({ acts: ['CLARIFY_AMBIGUITY'], primary: 'CLARIFY' });
check('Required clarification is not forced to invent an answer before the missing distinction is resolved', requiredClarify.mustAdvanceBeyondGiven === false && requiredClarify.newValueStart === 'REQUIRED_CLARIFICATION');

console.log(`\n[F1 SHARED CONTEXT / GIVEN-NEW] PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
