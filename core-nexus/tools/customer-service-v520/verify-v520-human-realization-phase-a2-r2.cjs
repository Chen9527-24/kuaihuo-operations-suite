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

check('A2-R2 has one final model-facing realization owner', /authority:\s*'EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY'/.test(authority) && !/contributionSelection\s*:/.test(prompt));
check('Question existence is compiled from existing Canonical Acts', /requiredCustomerInputSelected[\s\S]*REQUEST_REQUIRED_SLOT[\s\S]*optionalCustomerInputSelected[\s\S]*REQUEST_OPTIONAL_PREFERENCE/.test(authority));
check('Canonical question disposition remains model-facing without a QuestionGate', /disposition:\s*customerInputDisposition/.test(authority) && !/QuestionGate|SolicitationGate/.test(prompt+authority));
check('Canonical completion owns semantic stopping without reprojecting legacy completion HOW', !/human\.surfaceBudget\.completionPolicy|human\.turnShape\.stopBias|human\.texture\.completionCadence/.test(authority) && system.includes('控制类 Act 与 completion 是 Canonical WHAT 的执行边界') && system.includes('它们不规定客户可见措辞'));
check('Unauthorized independent contribution is closed at the final authority', /noUnauthorizedIndependentContribution:\s*true/.test(authority));
check('Existing response-target depth is preserved', /requestedSpecificity:\s*responseTarget\.requestedSpecificity/.test(authority) && /requiredDelta:\s*responseTarget\.requiredDelta/.test(authority));
check('System declares realization as sole current-turn behavior / semantic authority', system.includes('`humanPresence.realization` 是 Generation 唯一的当前轮行为/语义边界'));
check('Complex primary work is not globally compressed', /coverageObligation:\s*completeCurrentFocus[\s\S]*'COMPLETE_CURRENT_FOCUS'[\s\S]*'SUFFICIENT_CURRENT_FOCUS'/.test(authority) && !/固定\s*[0-9一二三四五六七八九十]+\s*(字|句|步|气泡)/.test(system));
check('Surface cannot synthesize unselected acts', system.includes('当前轮语义责任仍只由 humanPresence.realization 提供') && /cannotCreateActs:\s*true/.test(authority));
check('Question contract is semantic, not punctuation targeted', !/(问号|疑问句|固定措辞|question mark)/i.test(system));
check('Conversation Reality carryover remains factual in final authority', /priorContributionStatus:\s*human\.sharedContext\.priorContributionStatus/.test(authority) && /reception:\s*human\.conversationReality\.currentFeedback\.reception/.test(authority) && !/priorContributionReuse:\s*human\.sharedContext/.test(authority));
check('General-domain content remains open under existing boundaries', system.includes('一般知识和普通话题默认可以正常回答') && system.includes('PC 明确配置的语言政策、权限、服务边界和能力继续生效'));
check('No role / industry / test-sentence specialization', !/(宠物|柯基|外卖员|女装|通勤|SaaS|技术支持|敲门|扑门)/i.test(system+authority));
check('No model-facing numeric surface budgets', !/softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|maxSentences|maxQuestions/.test(authority));
check('No rewrite / post-processing authority', !/rewritePrompt|repairPrompt|postProcess|regexReplace|outputCleanup|secondModelCall/i.test(prompt+authority));
check('Final authority TypeScript transpiles', syntax(authorityRel, authority));
const none=compileFinalHumanTurn(root,baseFrame({question:'NONE'}));
const hold=compileFinalHumanTurn(root,baseFrame({question:'HOLD_THIS_TURN',stopBias:'HIGH'}));
const optional=compileFinalHumanTurn(root,baseFrame({question:'ASK_ONE_IF_DECISION_RELEVANT'}));
const required=compileFinalHumanTurn(root,baseFrame({question:'REQUIRED'}));
const detail=compileFinalHumanTurn(root,baseFrame({specificity:'DETAIL',delta:'NEW_FACET',primary:'GUIDE',explanation:'SUPPORT_PRIMARY_ONLY'}));
const exhaustive=compileFinalHumanTurn(root,baseFrame({specificity:'EXHAUSTIVE',primary:'ANSWER',explanation:'PRIMARY_VALUE'}));
check('NONE does not select customer input', none.realization.selectedComponents.customerInput.selected===false && none.realization.selectedComponents.customerInput.disposition==='NONE');
check('HOLD does not select customer input', hold.realization.selectedComponents.customerInput.selected===false && hold.realization.selectedComponents.customerInput.completionDependency==='NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN');
check('ASK_ONE preserves already-authorized optional input', optional.realization.selectedComponents.customerInput.selected===true);
check('REQUIRED preserves required input', required.realization.selectedComponents.customerInput.selected===true && required.realization.selectedComponents.customerInput.completionDependency==='CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN');
check('DIRECTION/DETAIL/EXHAUSTIVE are not collapsed into one depth', none.realization.primary.requestedSpecificity==='DIRECTION' && detail.realization.primary.requestedSpecificity==='DETAIL' && exhaustive.realization.primary.requestedSpecificity==='EXHAUSTIVE');
check('Ordinary detail stays sufficient while exhaustive explicitly completes current focus', detail.realization.primary.coverageObligation==='SUFFICIENT_CURRENT_FOCUS' && exhaustive.realization.primary.coverageObligation==='COMPLETE_CURRENT_FOCUS');

console.log(`\nHuman Realization Phase A2-R2 Contribution Selection Authority Closure: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
