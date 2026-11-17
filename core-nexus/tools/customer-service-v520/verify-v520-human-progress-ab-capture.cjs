#!/usr/bin/env node
'use strict';
const { loadStableBaselineManifest, treeHash, validateEvidence } = require('./run-v520-human-progress-promotion-gate.cjs');
const { validateRunSnapshot, pairSnapshots, buildDraftEvidence } = require('./run-v520-human-progress-ab-capture.cjs');
const baselineManifest=loadStableBaselineManifest(); const candidateTree=treeHash('src');
let pass=0,fail=0;function check(n,c,d=''){if(c){pass++;console.log(`PASS ${n}`)}else{fail++;console.error(`FAIL ${n}${d?` :: ${d}`:''}`)}}
function snapshot(side,hash){
  const roles=['ROLE_A','ROLE_B','ROLE_C'];
  return {evidenceKind:'HUMAN_PROGRESS_AB_RUN_CAPTURE',side,sourceTreeSha256:hash,environmentFingerprint:'MODEL+ACCOUNT+KNOWLEDGE+STATE:SAME',candidateId:'PHASE_C_INTERNAL_EXPERIMENT',runs:Array.from({length:6},(_,i)=>({caseId:`CASE_${i+1}`,roleFingerprint:roles[i%3],roleFamily:`FAMILY_${i%3}`,industryFamily:`INDUSTRY_${i%3}`,scenarioFamily:`SCENARIO_${i%3}`,inputVariantClass:`VARIANT_${i%3}`,input:`neutral input ${i+1}`,reply:`${side} reply ${i+1}`,requestStatus:'SUCCESS',selected:`C${i+1}`,controlledAvailability:false,candidateStarvation:false}))};
}
const stable=snapshot('STABLE_BASELINE',baselineManifest.productionSourceTree.sha256); const candidate=snapshot('CANDIDATE',candidateTree.sha256);
check('Stable snapshot is bound to the fixed baseline source hash',validateRunSnapshot(stable,'STABLE_BASELINE',baselineManifest.productionSourceTree.sha256).ok);
check('Candidate snapshot is bound to the current Candidate source hash',validateRunSnapshot(candidate,'CANDIDATE',candidateTree.sha256).ok);
let paired=pairSnapshots(stable,candidate,baselineManifest,candidateTree);
check('same-environment same-input runs pair successfully',paired.ok&&paired.comparisons.length===6,paired.errors.join(' | '));
const envMismatch=JSON.parse(JSON.stringify(candidate)); envMismatch.environmentFingerprint='OTHER_ENV';
check('environment mismatch blocks A/B pairing',!pairSnapshots(stable,envMismatch,baselineManifest,candidateTree).ok);
const inputMismatch=JSON.parse(JSON.stringify(candidate)); inputMismatch.runs[0].input='different input';
check('input mismatch blocks A/B pairing',!pairSnapshots(stable,inputMismatch,baselineManifest,candidateTree).ok);
const roleMismatch=JSON.parse(JSON.stringify(candidate)); roleMismatch.runs[0].roleFingerprint='OTHER_ROLE';
check('role mismatch blocks A/B pairing',!pairSnapshots(stable,roleMismatch,baselineManifest,candidateTree).ok);
const degraded=JSON.parse(JSON.stringify(candidate)); degraded.runs[0].controlledAvailability=true;
check('controlled availability cannot enter P1 paired evidence',!pairSnapshots(stable,degraded,baselineManifest,candidateTree).ok);
const starved=JSON.parse(JSON.stringify(candidate)); starved.runs[0].candidateStarvation=true;
check('candidate starvation cannot enter P1 paired evidence',!pairSnapshots(stable,starved,baselineManifest,candidateTree).ok);
const duplicate=JSON.parse(JSON.stringify(candidate)); duplicate.runs[1].caseId=duplicate.runs[0].caseId;
check('duplicate case IDs are rejected',!validateRunSnapshot(duplicate,'CANDIDATE',candidateTree.sha256).ok);
const draft=buildDraftEvidence({baseline:stable,candidate,productGoal:'Universal Human Realization positive-gain A/B.'});
check('capture tool emits draft evidence rather than claiming real promotion evidence',draft.ok&&draft.evidence.evidenceKind==='DRAFT_PROMOTION_EVIDENCE');
check('capture tool leaves every visible-behavior verdict to a human',draft.evidence.comparisons.every((x)=>x.humanReview.verdict==='PENDING_HUMAN_REVIEW'&&!x.humanReview.rationale&&!x.humanReview.visibleBehaviorDelta));
const promotionChecks=validateEvidence(draft.evidence,baselineManifest,candidateTree);
check('unreviewed capture can never satisfy Promotion Gate',promotionChecks.some((x)=>!x.ok));
console.log(`\nHuman Progress A/B Capture: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
