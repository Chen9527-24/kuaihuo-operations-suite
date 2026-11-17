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
const candidateRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-candidate.ts'; const candidate=read(candidateRel);
const arbiterRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-delivery-arbiter.ts'; const arbiter=read(arbiterRel);
check('Final Closure uses one final HumanTurn realization authority', /FINAL_MODEL_FACING_HUMAN_TURN_V1/.test(authority) && !/contributionSelection\s*:/.test(prompt));
check('NONE/HOLD customer-input dependency remains existing Canonical-Act-derived', /requiredCustomerInputSelected = \['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY'\][\s\S]*optionalCustomerInputSelected = selectedActTypes\.has\('REQUEST_OPTIONAL_PREFERENCE'\)/.test(authority));
check('Self-contained guidance remains allowed without creating a customer return obligation', /NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN/.test(authority) && /primary:\s*\{/.test(authority));
check('Turn-act closure is semantic rather than punctuation targeting', !/(问号|疑问句|固定措辞|question mark)/i.test(system+authority));
check('Presentation intent is explicit, Generation-owned HVE_REPLY_V2 and presentation-only', system.includes('HVE_REPLY_V2') && system.includes('segments 数组元素边界') && system.includes('由你按自然交流节奏直接决定 1/N 条'));
check('No role/domain/test-sentence or procedural keyword branch', !/(宠物|柯基|外卖员|女装|通勤|SaaS|第一步|第二步)/i.test(system+authority+planner));
check('AUTO Delivery no longer infers boundaries from punctuation/list/paragraph shape', !/splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion/.test(planner));
check('Typed semantic SINGLE is not hard-coupled to one bubble', !/typedSegmentation\s*===\s*['\"]SINGLE['\"][\s\S]{0,180}mode:\s*['\"]SINGLE['\"]/.test(planner));
check('Existing explicit sequential authorities remain available', /GENERATION_PRESENTATION_INTENT|PC_EXPLICIT/.test(planner));
check('Generator captures Generation-authored presentation boundaries', /parseCustomerServiceChatPresentationProtocol/.test(generator) && /presentationIntent/.test(generator));
check('Final Candidate invalidates stale presentation metadata', /presentationIntent:\s*undefined/.test(candidate) || /presentationIntent/.test(candidate));
check('Final Delivery consumes frozen presentation intent', /presentationIntent/.test(arbiter));
check('No fixed Human Realization quota', !/固定\s*[0-9一二三四五六七八九十]+\s*(字|句|泡|气泡)|最多\s*[0-9一二三四五六七八九十]+\s*(字|句|泡|气泡)/.test(system));
check('Changed TypeScript files transpile', [promptRel,plannerRel,generatorRel,candidateRel,arbiterRel].every(r=>syntax(r)));
const none=compileFinalHumanTurn(root,baseFrame({question:'NONE'})); const hold=compileFinalHumanTurn(root,baseFrame({question:'HOLD_THIS_TURN'})); const required=compileFinalHumanTurn(root,baseFrame({question:'REQUIRED'}));
check('NONE projects no new customer-input dependency', none.realization.selectedComponents.customerInput.selected===false);
check('HOLD projects no new customer-input dependency', hold.realization.selectedComponents.customerInput.selected===false);
check('REQUIRED preserves authorized customer-input dependency', required.realization.selectedComponents.customerInput.selected===true);

console.log(`\nA2-R4 Final Closure: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
