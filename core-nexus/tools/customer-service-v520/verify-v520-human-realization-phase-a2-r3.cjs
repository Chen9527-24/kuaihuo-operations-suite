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
check('R3 turn-act owner is the final HumanTurn realization authority', /EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY/.test(authority) && !/contributionSelection\s*:/.test(prompt));
check('R3 customer-input selection is derived from existing Canonical question Acts', /requiredCustomerInputSelected = \['REQUEST_REQUIRED_SLOT', 'CLARIFY_AMBIGUITY'\][\s\S]*optionalCustomerInputSelected = selectedActTypes\.has\('REQUEST_OPTIONAL_PREFERENCE'\)/.test(authority));
check('R3 customer-input dependency is semantic', /NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN/.test(authority) && /CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN/.test(authority));
check('R3 does not target punctuation or fixed words', !/(问号|疑问句|固定措辞|\?\s*检测|question mark)/i.test(system+authority));
check('R3 preserves complex primary depth through Response Target', /requestedSpecificity:\s*responseTarget\.requestedSpecificity/.test(authority));
check('R3 keeps general-domain freedom and server-owned business truth', system.includes('一般知识和普通话题默认可以正常回答') && system.includes('Knowledge、Policy、Permission、Service Boundary 与真实执行状态属于 server-owned truth'));
check('R3 has no role/industry/test-sentence specialization', !/(宠物|女装|SaaS|技术支持|柯基|敲门|扑门)/i.test(system+authority));
check('R3 Delivery does not hard-couple semantic SINGLE to one bubble', !/typedSegmentation\s*===\s*['\"]SINGLE['\"][\s\S]{0,180}mode:\s*['\"]SINGLE['\"]/.test(planner));
check('R3 Delivery remains presentation-only', planner.includes('Delivery does not re-plan') && planner.includes('Delivery 直接消费 Generation HVE_REPLY_V2') && planner.includes('不做后处理断句') && !/semanticJudge|candidateJudge/i.test(planner));
check('R3 introduces no fixed Human Realization bubble quota', !/固定.{0,8}(泡|气泡)|最多.{0,8}(泡|气泡)/.test(system));
check('Prompt and planner TypeScript transpile', syntax(promptRel,prompt) && syntax(plannerRel,planner));
const none=compileFinalHumanTurn(root,baseFrame({question:'NONE'})); const hold=compileFinalHumanTurn(root,baseFrame({question:'HOLD_THIS_TURN'})); const required=compileFinalHumanTurn(root,baseFrame({question:'REQUIRED'}));
check('NONE projects no selected customer-input act', none.realization.selectedComponents.customerInput.selected===false);
check('HOLD projects no selected customer-input act', hold.realization.selectedComponents.customerInput.selected===false);
check('REQUIRED preserves selected customer-input act', required.realization.selectedComponents.customerInput.selected===true);

console.log(`\nHuman Realization Phase A2-R3 Turn Act + Presentation Regression: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
