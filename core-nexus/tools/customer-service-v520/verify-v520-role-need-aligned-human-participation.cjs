#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const humanFile = path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const promptFile = path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const humanSrc = fs.readFileSync(humanFile, 'utf8');
const promptSrc = fs.readFileSync(promptFile, 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`[PASS] ${name}`); }
  else { fail += 1; console.error(`[FAIL] ${name}${detail ? ` · ${detail}` : ''}`); }
}

check('HumanTurn owns one needAlignment projection', /needAlignment:\s*\{[\s\S]*?authority:\s*'REALIZATION_ONLY'/.test(humanSrc));
check('Need alignment cannot create Acts/facts/permission', /cannotCreateActs:\s*true/.test(humanSrc) && /cannotChangeFactsOrPermission:\s*true/.test(humanSrc));
check('Required Canonical Acts are explicitly preserved', /preserveAllRequiredActs:\s*true/.test(humanSrc));
check('Need restatement cannot substitute for value', /noNeedRestatementAsSubstituteForValue:\s*true/.test(humanSrc));
check('Alignment consumes Canonical plan and turnComposition', /function resolveRoleNeedAlignment\([\s\S]*?plan:\s*CustomerServiceInteractionPlanV2[\s\S]*?turnComposition:/.test(humanSrc));
check('No new model call in HumanTurn resolver', !/openai|chat\.completions|responses\.create|generateContent|invokeModel|model\.call/iu.test(humanSrc));
check('No industry/role/test-sentence special cases', !/(宠物|女装|护肤|技术顾问|猫|柯基|转正答辩|分享会|闷痘)/u.test(humanSrc + '\n' + promptSrc));
check('NeedAlignment remains server-side diagnostic and is not model-facing Planner text', !/NeedAlignment：|needAlignment:\s*/.test(promptSrc));
const finalAuthoritySrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'), 'utf8');
check('NeedAlignment contributes only the selected primary semantic value to final HumanTurn', /contribution:\s*human\.needAlignment\.primaryContribution/.test(finalAuthoritySrc) && !/explanationRole/.test(finalAuthoritySrc) && !/needAlignment:\s*human\.needAlignment/.test(promptSrc));
check('Explanation role does not become a fixed sentence/length quota', !/explanationRole.{0,80}(?:句|字|token|maxSentences)/s.test(promptSrc) && !/固定\s*[1234567890一二三四五六七八九十]+\s*句/.test(promptSrc));
check('Prompt uses final realization authority without a phrase-level acknowledgement protocol', promptSrc.includes('humanPresence.realization') && !promptSrc.includes('compileCustomerServiceAcknowledgementExecutionContract') && !/(首个可见语义单元|固定承接句|先说我懂|同一句\/段仍禁止)/.test(promptSrc));
check('Prompt preserves required semantic contribution without taking over explanation HOW', promptSrc.includes('canonicalPlan.requiredActs[].parameters.target / decisionPurpose / expectedInformationGain') && promptSrc.includes('已选中的 Required value Act 必须在本轮真正完成') && promptSrc.includes('不规定措辞、顺序、长度、步骤数或消息数'));

// Execute the actual private resolver in-memory without changing Runtime exports.
const transpiled = ts.transpileModule(humanSrc + '\nexports.__resolveRoleNeedAlignment = resolveRoleNeedAlignment;\n', {
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
const resolve = sandbox.exports.__resolveRoleNeedAlignment;
check('Actual resolver is executable in verifier', typeof resolve === 'function');

function makeCase({ focus='CURRENT_SPECIFIC_QUESTION', acts=[], beats=['VALUE'] }) {
  return resolve({
    plan: { acts: acts.map((a, i) => ({ id: `a${i}`, necessity: 'REQUIRED', priority: i, sources: [], ...a })) },
    participation: {},
    turnComposition: {
      semanticDelta: { responseTarget: { focus, requestedSpecificity: 'DIRECTION', knowledgeRequirement: 'NOT_REQUIRED', confidence: 0.9 } },
      beats,
    },
  });
}

const recommendation = makeCase({
  focus: 'RECOMMENDATION',
  acts: [
    { type: 'PROVIDE_GENERAL_GUIDANCE' },
    { type: 'DIRECT_ANSWER' },
    { type: 'ACKNOWLEDGE_PREFERENCE', necessity: 'PREFERRED' },
  ],
});
check('Recommendation centers recommendation, not meta explanation', recommendation.primaryContribution === 'RECOMMEND' && recommendation.explanationRole === 'SUPPORT_PRIMARY_ONLY');
check('Preferred preference acknowledgement is implicit in useful recommendation', recommendation.acknowledgementRealization === 'IMPLICIT_IN_PRIMARY' && recommendation.openingBias === 'PRIMARY_FIRST');

const why = makeCase({ focus: 'WHY_REASON', acts: [{ type: 'DIRECT_ANSWER' }] });
check('Why/reason request keeps explanation as primary behavior', why.primaryContribution === 'EXPLAIN' && why.explanationRole === 'PRIMARY_VALUE');

const emotional = makeCase({
  acts: [{ type: 'DIRECT_ANSWER' }, { type: 'EMOTIONAL_ACK', necessity: 'PREFERRED' }],
});
check('Relational/emotional acknowledgement can remain explicit', emotional.acknowledgementRealization === 'EXPLICIT_RELATIONAL' && emotional.openingBias === 'RELATIONAL_FIRST');

const requiredAck = makeCase({
  focus: 'RECOMMENDATION',
  acts: [{ type: 'PROVIDE_GENERAL_GUIDANCE' }, { type: 'ACKNOWLEDGE_PREFERENCE', necessity: 'REQUIRED' }],
});
check('Required acknowledgement is never silently demoted', requiredAck.acknowledgementRealization === 'EXPLICIT_REQUIRED');

const clarify = makeCase({ focus: 'CURRENT_SPECIFIC_QUESTION', beats: ['QUESTION'], acts: [{ type: 'REQUEST_REQUIRED_SLOT' }] });
check('Missing decisive input keeps clarification as primary behavior', clarify.primaryContribution === 'CLARIFY');

const execute = makeCase({ acts: [{ type: 'EXECUTE_SERVICE_STEP' }] });
check('Authorized service execution stays execution-primary', execute.primaryContribution === 'EXECUTE' && execute.explanationRole === 'SUPPORT_PRIMARY_ONLY');

const howTo = makeCase({ focus: 'HOW_TO', acts: [{ type: 'PROVIDE_GENERAL_GUIDANCE' }] });
check('How-to keeps guidance primary', howTo.primaryContribution === 'GUIDE');

console.log(`\n[ROLE-NEED ALIGNMENT] PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
