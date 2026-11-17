#!/usr/bin/env node
'use strict';
process.env.TS_NODE_TRANSPILE_ONLY='1';
process.env.TS_NODE_PROJECT=require('path').resolve(__dirname,'../../tsconfig.json');
require('ts-node/register/transpile-only');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const { projectCustomerServiceDecisionIntegrityDiagnostics } = require(path.join(root,'src/modules/customer-service-agent/runtime/diagnostics/customer-service-decision-integrity-diagnostics.ts'));
let pass=0, fail=0;
function check(name, ok, detail='') { if(ok){pass++;console.log(`PASS ${name}`);} else {fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`);} }
const constraint='必须兼容现有接口';
const unrelated='一般状态';
const contract={
 classification:{ recognizedItems:[
   { recognitionId:'r-c', type:'STATE', key:'compatibility', confidence:.96, evidence:[constraint], scope:'CONVERSATION', suggestedCategory:'CUSTOMER_CONSTRAINT' },
   { recognitionId:'r-s', type:'STATE', key:'mood', confidence:.8, evidence:[unrelated], scope:'CONVERSATION', suggestedCategory:'RELATIONSHIP' },
 ]},
 generationContext:{ conversationState:{
   relevantMemories:[{ id:'m-c', kind:'CUSTOMER_CONSTRAINT', key:'constraint.task.compatibility', value:constraint, sourceTurn:1, confidence:.96 }],
   canonicalFields:{ explicitFacts:{ status:'EXPLICIT', value:[{key:'constraint.task.compatibility',value:constraint}] } },
 }},
 orchestrationPlan:{
   stateGuidance:{ explicitFacts:[{key:'constraint.task.compatibility',value:constraint}] },
   interactionPlanV2:{ acts:[
     { type:'DIRECT_ANSWER', necessity:'REQUIRED', reasonCode:'fixture', parameters:{known:[constraint]} },
     { type:'LIGHT_ACK', necessity:'OPTIONAL', reasonCode:'fixture', parameters:{known:[unrelated]} },
   ]},
 },
};
const d=projectCustomerServiceDecisionIntegrityDiagnostics(contract);
check('diagnostics are explicitly read-only', d.authority==='DIAGNOSTIC_ONLY' && Object.values(d.authorityEffects).every(v=>v===false), JSON.stringify(d.authorityEffects));
check('recognition stage exposes only CUSTOMER_CONSTRAINT STATE candidates', d.recognition.customerConstraintCount===1 && d.recognition.constraints[0]?.key==='compatibility', JSON.stringify(d.recognition));
check('state stage exposes relevant CUSTOMER_CONSTRAINT memory', d.state.relevantConstraintCount===1 && d.state.relevantConstraints[0]?.key==='constraint.task.compatibility', JSON.stringify(d.state));
check('canonical explicit fact is fingerprinted rather than leaking raw value', d.state.canonicalExplicitFacts.length===1 && !JSON.stringify(d).includes(constraint), JSON.stringify(d));
check('state-guidance projection preserves the same value fingerprint', d.state.canonicalExplicitFacts[0]?.valueFingerprint===d.planning.stateGuidanceExplicitFacts[0]?.valueFingerprint, JSON.stringify(d));
check('decision Act known consumes the same constraint fingerprint', d.planning.decisionActs.length===1 && d.planning.decisionActs[0]?.knownFingerprints.includes(d.state.canonicalExplicitFacts[0]?.valueFingerprint), JSON.stringify(d.planning));
const diagSrc=fs.readFileSync(path.join(root,'src/modules/customer-service-agent/runtime/diagnostics/customer-service-decision-integrity-diagnostics.ts'),'utf8');
const replySrc=fs.readFileSync(path.join(root,'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts'),'utf8');
const autoSrc=fs.readFileSync(path.join(root,'src/modules/auto-replies/auto-replies.service.ts'),'utf8');
check('Runtime only projects diagnostics after simulation result exists', replySrc.includes('projectCustomerServiceDecisionIntegrityDiagnostics(result.contract)') && replySrc.includes('decisionIntegrityDiagnostics: hveDecisionIntegrityDiagnostics'));
check('Robot Test forwards the read-only diagnostics at root and raw', autoSrc.includes('hveDecisionIntegrity: result.diagnostics?.decisionIntegrityDiagnostics || null') && autoSrc.includes('decisionIntegrityDiagnostics: result.diagnostics?.decisionIntegrityDiagnostics || null'));
check('diagnostic source contains no domain/product/test fixture special case', !/(广州|牛仔外套|轻薄|柯基|阔腿裤|米白)/.test(diagSrc));
check('diagnostic source has no send/generation mutation authority', !/(modelGateway\.generate|deliveryDecision\s*=|finalCandidate\s*=|candidateSafetyStatus\s*=|candidateQualityStatus\s*=)/.test(diagSrc));
console.log(`\nR2.1 Decision Integrity Observability: ${pass}/${pass+fail} PASS`);
if(fail) process.exit(1);
