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
check('R4 keeps current-turn semantic ownership in final HumanTurn realization', /EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY/.test(authority));
check('R4 solicitation closure derives from existing Canonical question Acts', /customerInputDisposition:[\s\S]*requiredCustomerInputSelected[\s\S]*optionalCustomerInputSelected/.test(authority));
check('R4 does not target question punctuation or wording', !/(问号|疑问句|固定措辞|question mark)/i.test(system+authority));
check('R4 presentation is Generation-owned HVE_REPLY_V2 and presentation-only', system.includes('HVE_REPLY_V2') && system.includes('segments 数组元素边界') && system.includes('由你按自然交流节奏直接决定 1/N 条'));
check('R4 has no role/industry/test-sentence presentation branch', !/(宠物|女装|SaaS|技术支持|柯基|敲门|扑门)/i.test(system+planner));
check('R4 removes semantic SINGLE -> hard one-bubble coupling', !/typedSegmentation\s*===\s*['\"]SINGLE['\"][\s\S]{0,180}mode:\s*['\"]SINGLE['\"]/.test(planner));
check('R4 preserves explicit sequential authorities', /PREFER_SEQUENTIAL|SEQUENTIAL/.test(planner));
check('R4 Generation presentation boundaries are captured before Delivery', /presentationIntent/.test(generator) && /parseCustomerServiceChatPresentationProtocol/.test(generator));
check('R4 AUTO planner no longer infers natural text-shape boundaries', !/splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion/.test(planner));
check('R4 adds no fixed chars/sentences/bubbles quota', !/固定\s*[0-9一二三四五六七八九十]+\s*(字|句|泡|气泡)|最多\s*[0-9一二三四五六七八九十]+\s*(字|句|泡|气泡)/.test(system));
check('Prompt/planner/generator TypeScript transpile', syntax(promptRel,prompt) && syntax(plannerRel,planner) && syntax(generatorRel,generator));
const none=compileFinalHumanTurn(root,baseFrame({question:'NONE'})); const hold=compileFinalHumanTurn(root,baseFrame({question:'HOLD_THIS_TURN'})); const required=compileFinalHumanTurn(root,baseFrame({question:'REQUIRED'}));
check('NONE forbids new customer-input dependency', none.realization.selectedComponents.customerInput.selected===false && none.realization.selectedComponents.customerInput.completionDependency==='NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN');
check('HOLD forbids new customer-input dependency', hold.realization.selectedComponents.customerInput.selected===false);
check('REQUIRED preserves authorized customer-input dependency', required.realization.selectedComponents.customerInput.selected===true && required.realization.selectedComponents.customerInput.completionDependency==='CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN');

console.log(`\nHuman Realization Phase A2-R4 Precise Correction: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
