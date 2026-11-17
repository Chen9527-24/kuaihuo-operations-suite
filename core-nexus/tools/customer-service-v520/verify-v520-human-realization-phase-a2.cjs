#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { compileFinalHumanTurn } = require('./_final-human-turn-test-helper.cjs');
const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const promptRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const authorityRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const prompt = read(promptRel);
const authority = read(authorityRel);
const system = prompt.slice(prompt.indexOf('function buildHumanConversationSystemPrompt'), prompt.indexOf('function buildHveModelFacingGenerationFrame'));
let pass=0, fail=0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}`); } }
function syntax(rel, src=read(rel)) { const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel}); return !(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error); }
function baseFrame({specificity='DIRECTION',delta='NONE',primary='ANSWER',explanation='MINIMAL',question='NONE',identity='NONE',completion='STOP_WHEN_ENOUGH',stopBias='MEDIUM',accepted=null,rejected=false,reception='UNCLEAR'}={}) { return {
 serviceRealization:{currentTurnValue:{mode:primary==='GUIDE'?'GENERAL_GUIDANCE':'DIRECT',mustAddBeyondKnown:delta!=='NONE'},contribution:{target:primary==='GUIDE'?'USEFUL_DIRECTION':'DIRECT_ANSWER',avoidReframeOnly:false,contributeBeforeOptionalAsk:false},identity:{mode:identity,stopAfterAnswer:identity!=='NONE'}},
 humanTurnRealization:{persona:{corePresenceFidelity:{warmth:76,directness:60,formality:38,energy:50,playfulness:10,emotionalExpressiveness:45}},needAlignment:{primaryContribution:primary,acknowledgementRealization:'NONE',explanationRole:explanation,openingBias:'PRIMARY_FIRST'},participation:{questionDisposition:question},turnComposition:{semanticDelta:{responseTarget:{requestedSpecificity:specificity,requiredDelta:delta}}},sharedContext:{priorContributionStatus:accepted?'ACCEPTED':rejected?'REJECTED':'UNRESOLVED',priorContributionReuse:accepted?'ADVANCE_FROM_ACCEPTED':rejected?'CHANGE_FROM_REJECTED':'NORMAL',avoidEvaluativeReceptionBeforeValue:true,mustAdvanceBeyondGiven:true},conversationReality:{continuity:{lastAssistantMoveAccepted:accepted,lastAssistantMoveRejected:rejected,recentRequestedDeltas:delta==='NONE'?[]:[delta]},currentFeedback:{reception:accepted?'ACCEPTED':rejected?'REJECTED':reception,correctionTarget:rejected?'CONTENT':null,requestedDeltas:delta==='NONE'?[]:[delta]}},surfaceBudget:{completionPolicy:completion,stopAfterQuestion:question==='REQUIRED'},turnShape:{stopBias},texture:{spokenRegister:'HIGH',brevity:'BALANCED',sentenceShape:'MIXED',fragmentAllowance:'MEDIUM',ellipsisAllowance:'LOW',rhythmVariation:'HIGH',connectiveDensity:'LOW',explicitReasoning:'LOW',completionCadence:'LOW',sentenceParticleLevel:'LOW',emoji:'NONE'},antiAiCadence:{avoidRecapBeforeValue:true,preferImplicitTransitions:true,avoidSelfProcessNarration:true},adaptation:{customerMessageShape:'NORMAL',relationshipDistance:'NEUTRAL',mirrorIntensity:'BALANCED',varyFromRecentStructure:false}}
}; }

const humanRel='src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts'; const human=read(humanRel);
check('A2 reuses existing Shared Context instead of creating a second reality planner', /priorContributionStatus/.test(human) && /priorContributionReuse/.test(human));
check('Accepted/rejected/corrected/requested-delta are resolved generically', /ACCEPTED|REJECTED|CORRECTED/.test(human) && /requestedDeltas/.test(human));
check('Generation receives factual prior contribution status and current feedback through final HumanTurn', /priorContributionStatus:\s*human\.sharedContext\.priorContributionStatus/.test(authority) && /currentFeedback:/.test(authority) && !/priorContributionReuse:\s*human\.sharedContext\.priorContributionReuse/.test(authority));
check('Contribution economy advances from accepted and changes from rejected without phrase targeting', /ADVANCE_FROM_ACCEPTED|CHANGE_FROM_REJECTED/.test(human) && !/(宠物|女装|SaaS|敲门|扑门)/i.test(authority));
check('Requested delta is carried as conversation direction, not a new Act', /requestedDeltas:\s*\[\.\.\.new Set/.test(authority) && /cannotCreateActs:\s*true/.test(authority));
check('Shared Context cannot create Acts/facts/permissions', /cannotCreateActs:\s*true/.test(authority) && /cannotChangeFactsOrPermission:\s*true/.test(authority));
check('A2 introduces no role/industry/test-sentence hardcodes', !/(宠物|柯基|女装|通勤|SaaS|技术支持|敲门|扑门)/i.test(system+authority));
check('A2 introduces no fixed sentence/bubble/character quotas', !/固定\s*[0-9一二三四五六七八九十]+\s*(字|句|泡|气泡)|最多\s*[0-9一二三四五六七八九十]+\s*(字|句|泡|气泡)/.test(system) && !/softMaxChars|maxSentences|maxQuestions/.test(authority));
check('A2 adds no Humanizer/Gate/Judge/Repair/Retry authority', !/(Humanizer|ConversationRealityGate|ContributionJudge|SurfaceJudge|PersonaRepair|HumanizationRetry)/i.test(prompt+authority));
check('General-domain situated judgment is not model-facing', !/situatedJudgment\s*:|claimSupport|safeCompletion|causalAttributionRequiresSupport/.test(prompt+authority));
check('General knowledge remains open unless existing business authority restricts it', system.includes('一般知识和普通话题默认可以正常回答'));
check('Business facts remain grounded by Knowledge/verified-data authority', system.includes('Knowledge、Policy、Permission、Service Boundary 与真实执行状态属于 server-owned truth'));
check('Final HumanTurn compiler TypeScript transpiles', syntax(authorityRel,authority));
const accepted=compileFinalHumanTurn(root,baseFrame({accepted:true})); const rejected=compileFinalHumanTurn(root,baseFrame({rejected:true})); const corrected=compileFinalHumanTurn(root,baseFrame({reception:'CORRECTED',delta:'CORRECT'}));
check('ACCEPTED remains factual continuity without model-facing reuse HOW', accepted.realization.continuity.priorContributionStatus==='ACCEPTED' && accepted.realization.continuity.currentFeedback.reception==='ACCEPTED' && !Object.prototype.hasOwnProperty.call(accepted.realization.continuity,'priorContributionReuse'));
check('REJECTED remains factual continuity without model-facing reuse HOW', rejected.realization.continuity.priorContributionStatus==='REJECTED' && rejected.realization.continuity.currentFeedback.reception==='REJECTED' && !Object.prototype.hasOwnProperty.call(rejected.realization.continuity,'priorContributionReuse'));
check('Requested/corrected delta remains visible inside same final authority', corrected.realization.continuity.currentFeedback.requestedDeltas.includes('CORRECT'));

console.log(`\nHuman Realization Phase A2: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
