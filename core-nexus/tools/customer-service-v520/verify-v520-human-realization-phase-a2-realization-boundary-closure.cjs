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

const plannerRel='src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts'; const planner=read(plannerRel);
const generatorRel='src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts'; const generator=read(generatorRel);
check('Realization Boundary is consolidated into the single final model-facing HumanTurn owner', /FINAL_MODEL_FACING_HUMAN_TURN_V1/.test(authority) && /EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY/.test(authority) && !/realizationBoundary\s*:|contributionSelection\s*:/.test(prompt));
check('Boundary primary reuses existing HumanTurn and Service Realization decisions', /contribution:\s*human\.needAlignment\.primaryContribution/.test(authority) && /target:\s*frame\.serviceRealization\.contribution\.target/.test(authority) && /currentTurnValueMode:\s*frame\.serviceRealization\.currentTurnValue\.mode/.test(authority));
check('Existing Response Target depth is projected rather than recomputed', /requestedSpecificity:\s*responseTarget\.requestedSpecificity/.test(authority) && /requiredDelta:\s*responseTarget\.requiredDelta/.test(authority));
check('Support amount HOW is absent while requested semantic depth remains model-facing', !/support\s*:|PRIMARY_IS_EXPLANATION|SUBORDINATE_TO_PRIMARY|MINIMAL_ONLY/.test(authority) && /requestedSpecificity:\s*responseTarget\.requestedSpecificity/.test(authority) && !/SupportPlanner|SupportJudge|SupportGate/.test(authority));
check('Selected components carry only hard identity and customer-input dependencies; acknowledgement stays in Canonical Plan', /canonicalPlan:\s*\{/.test(authority) && !/selectedComponents:\s*\{[\s\S]*?acknowledgement:\s*\{/.test(authority) && /canonicalIdentityMode !== 'NONE'/.test(authority) && /disposition:\s*customerInputDisposition/.test(authority));
check('Legacy completion cadence and surface-budget stopping HOW are absent from model-facing control', !/completion\s*:\s*\{|surfaceBudget\.completionPolicy|stopBias:\s*human\.turnShape\.stopBias|cadence:\s*human\.texture\.completionCadence/.test(authority));
check('Stopping position is model-owned while hard semantic expansion boundary remains', /noUnauthorizedIndependentContribution:\s*true/.test(authority) && !/STOP_UNLESS_A_SELECTED_COMPONENT_REMAINS|softMaxChars|maxValueUnits|maxSentences|maxQuestions/.test(authority));
check('Unauthorized independent expansion is closed without a MarginalValueJudge', /noUnauthorizedIndependentContribution:\s*true/.test(authority) && !/MarginalValueJudge/.test(prompt+authority));
check('Detailed/exhaustive primary work remains preserved by existing target depth', /requestedSpecificity:\s*responseTarget\.requestedSpecificity/.test(authority) && !/DIRECTION_ONLY|FORCE_SHORT/.test(authority));
check('Question/input dependency remains the existing HumanTurn behavior authority', /NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN/.test(authority) && /CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN/.test(authority));
check('Conversation Reality projection remains in final realization ownership', /priorContributionStatus:\s*human\.sharedContext\.priorContributionStatus/.test(authority) && /currentFeedback:/.test(authority));
check('Presentation remains Generation-owned and Delivery presentation-only', system.includes('HVE_REPLY_V2') && system.includes('segments 数组元素边界') && !/splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion/.test(planner));
check('No numeric chars/sentences/steps/bubbles quota is added', !/softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|maxSentences|maxQuestions/.test(authority) && !/固定\s*[0-9一二三四五六七八九十]+\s*(字|句|步|泡|气泡)/.test(system));
check('No role/industry/test phrase/surface-symbol special case', !/(宠物|柯基|外卖员|女装|通勤|SaaS|技术支持|第一步|第二步|禁止引号|禁止粗体)/i.test(system+authority));
check('No second Planner/Gate/Judge/Repair/Rewrite/Retry/model call', !/(RealizationPlanner|RealizationGate|StopGate|ContributionJudge|MarginalValueJudge|SurfaceJudge|Humanizer|PersonaRepair|SurfaceRewrite|HumanizationRetry|secondModelCall)/i.test(prompt+authority+planner));
check('General-domain freedom remains explicit', system.includes('一般知识和普通话题默认可以正常回答'));
check('Prompt/final-authority TypeScript transpile', syntax(promptRel,prompt) && syntax(authorityRel,authority));
const direction=compileFinalHumanTurn(root,baseFrame({specificity:'DIRECTION',primary:'GUIDE',explanation:'SUPPORT_PRIMARY_ONLY'})); const detail=compileFinalHumanTurn(root,baseFrame({specificity:'DETAIL',delta:'NEW_FACET',primary:'GUIDE',explanation:'SUPPORT_PRIMARY_ONLY'})); const exhaustive=compileFinalHumanTurn(root,baseFrame({specificity:'EXHAUSTIVE',explanation:'PRIMARY_VALUE'})); const required=compileFinalHumanTurn(root,baseFrame({question:'REQUIRED',identity:'SERVICE_SCOPE'}));
check('DIRECTION remains sufficient while allowing relevant context inside the selected primary', direction.realization.primary.requestedSpecificity==='DIRECTION' && direction.realization.primary.coverageObligation==='SUFFICIENT_CURRENT_FOCUS' && direction.realization.primary.adjacentContextUse==='OPTIONAL_WITHIN_PRIMARY' && direction.realization.constraints.noUnauthorizedIndependentContribution===true);
check('DETAIL and EXHAUSTIVE remain distinct and complete coverage stays explicit', detail.realization.primary.requestedSpecificity==='DETAIL' && detail.realization.primary.coverageObligation==='SUFFICIENT_CURRENT_FOCUS' && exhaustive.realization.primary.requestedSpecificity==='EXHAUSTIVE' && exhaustive.realization.primary.coverageObligation==='COMPLETE_CURRENT_FOCUS');
check('Runtime DIRECTION keeps semantic depth without a support-amount HOW object', direction.realization.primary.requestedSpecificity==='DIRECTION' && !Object.prototype.hasOwnProperty.call(direction.realization,'support'));
check('REQUIRED input and selected identity survive consolidation', required.realization.selectedComponents.customerInput.selected===true && required.realization.selectedComponents.identity.selected===true);

console.log(`\nA2 Realization Boundary Closure: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
