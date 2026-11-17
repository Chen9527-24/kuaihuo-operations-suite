#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const runnerPath = path.join(__dirname, 'run-v520-human-progress-promotion-gate.cjs');
const { policy, loadStableBaselineManifest, validateEvidence, treeHash } = require(runnerPath);
const baseline = loadStableBaselineManifest();
const currentTree = treeHash('src');
let pass = 0;
let fail = 0;

function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}
function baseEvidence() {
  const roles = ['ROLE_A', 'ROLE_B', 'ROLE_C'];
  const comparisons = Array.from({ length: 6 }, (_, index) => ({
    id: `C${index + 1}`,
    roleFingerprint: roles[index % roles.length],
    roleFamily: `FAMILY_${(index % roles.length) + 1}`,
    industryFamily: `INDUSTRY_${(index % roles.length) + 1}`,
    scenarioFamily: `SCENARIO_${(index % 3) + 1}`,
    input: `neutral input ${index + 1}`,
    baselineReply: `baseline reply ${index + 1}`,
    candidateReply: `candidate reply ${index + 1}`,
    humanReview: {
      verdict: index < 3 ? 'POSITIVE_GAIN' : 'NO_MATERIAL_GAIN',
      rationale: 'Neutral synthetic contract verification rationale.',
      visibleBehaviorDelta: 'Verifies that paired visible behavior evidence is required.'
    }
  }));
  return {
    evidenceKind: 'REAL_PROMOTION_EVIDENCE',
    baseline: { id: baseline.id, sourceTreeSha256: baseline.productionSourceTree.sha256 },
    candidate: { id: 'CONTRACT_TEST_ONLY', sourceTreeSha256: currentTree.sha256 },
    productGoal: 'Contract-only verification of promotion evidence requirements.',
    comparisons,
    p1OverallVerdict: 'POSITIVE_GAIN',
    universalCounterfactuals: roles.map((role, index) => ({
      id: `U${index + 1}`,
      roleFingerprint: role,
      roleFamily: `FAMILY_${index + 1}`,
      industryFamily: `INDUSTRY_${index + 1}`,
      scenarioFamily: `SCENARIO_${index + 1}`,
      inputVariantClass: `VARIANT_${index + 1}`,
      verdict: 'MECHANISM_HOLDS',
      rationale: 'Neutral synthetic contract verification rationale.'
    })),
    p2NoRuntimeFixtureReuse: true,
    p2NoRoleIndustrySentenceSpecialCases: true,
    architectureReview: {
      singleFinalAuthority: true,
      producerOwnsCorrectness: true,
      runtimeDecisionComplexityDelta: 1,
      newRuntimeGate: false,
      newRepairFallbackHumanizer: false,
      canonicalSemanticConformance: { enabled: true, authority: 'CANONICAL_SEMANTIC_CONFORMANCE_V1', modelCallCountMax: 1, correctionMode: 'EXACT_SUBSTRING_REMOVAL_ONLY', retry: false, plannerQualityJudgeHumanizer: false },
      rationale: 'Contract test preserves one Canonical Authority and exercises only the V12-approved bounded semantic conformance layer.'
    },
    releaseReview: { decision: 'PROMOTE', rationale: 'Contract-test release review only; not real release evidence.' }
  };
}

check('promotion authority is development/release only', policy.authority === 'DEVELOPMENT_RELEASE_PROMOTION_GATE_ONLY');
check('promotion gate explicitly forbids Runtime import', policy.runtimeImportForbidden === true);
check('P0 delegates to existing Regression Firewall', /run-v520-release-regression-firewall\.cjs$/.test(policy.p0?.delegate || ''));
check('P1 requires human-reviewed positive gain', policy.p1?.humanReviewRequired === true && policy.p1?.requiredOverallVerdict === 'POSITIVE_GAIN');
check('P2 requires cross-role counterfactual evidence', Number(policy.p2?.minimumDistinctRoleFingerprints) >= 3 && Number(policy.p2?.minimumDistinctStructuralVariants) >= 3);
check('P3 permits exactly one bounded V12 Canonical Semantic Conformance complexity increment and no broader growth', Number(policy.p3?.maximumRuntimeDecisionComplexityDelta) === 1 && policy.p3?.canonicalSemanticConformanceException?.allowed === true && policy.p3?.canonicalSemanticConformanceException?.authority === 'CANONICAL_SEMANTIC_CONFORMANCE_V1' && Number(policy.p3?.canonicalSemanticConformanceException?.maximumModelCalls) === 1);
check('release promotion requires the real project Build Gate', policy.release?.buildPassRequired === true && /run-v520-release-build-gate\.cjs$/.test(policy.release?.buildGate || ''));

const runtimeFiles = walk(path.join(root, 'src/modules/customer-service-agent/runtime')).filter((file) => file.endsWith('.ts'));
const leaks = runtimeFiles.filter((file) => /human-progress-promotion|promotion-gate-v1|stable-baseline-0r9-s0/i.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(root, file));
check('Runtime never imports or references Promotion Gate', leaks.length === 0, leaks.join(', '));

check('Stable Baseline manifest records failed candidates as excluded', Array.isArray(baseline.excludedFailedCandidates) && baseline.excludedFailedCandidates.includes('0R8 Surface De-Planning') && baseline.excludedFailedCandidates.includes('0R8-R2 Producer Shape Authority Convergence'));
const approvedRuntimeFiles = policy.p3?.canonicalSemanticConformanceException?.permittedNewRuntimeFiles || [];
const approvedRuntimeFilesExist = approvedRuntimeFiles.every((rel) => fs.existsSync(path.join(root, rel)));
check('Stable Baseline stays pinned while the Internal Candidate may add only the two V12-approved conformance Runtime files', baseline.productionSourceTree.sha256 === 'e2135dc5ae99f373cf1f3909e8536de2f494ed02873e1438f2cf484451c24066' && baseline.productionSourceTree.fileCount === 394 && currentTree.fileCount === baseline.productionSourceTree.fileCount + approvedRuntimeFiles.length && approvedRuntimeFiles.length === 2 && approvedRuntimeFilesExist, `${baseline.productionSourceTree.sha256} / baselineCount=${baseline.productionSourceTree.fileCount} / currentCount=${currentTree.fileCount}`);

const positiveChecks = validateEvidence(baseEvidence(), baseline, currentTree);
check('complete contract evidence can satisfy P1/P2/P3 validation', positiveChecks.every((item) => item.ok), positiveChecks.filter((item) => !item.ok).map((item) => item.name).join(', '));

const noGain = baseEvidence();
noGain.p1OverallVerdict = 'NO_MATERIAL_GAIN';
for (const item of noGain.comparisons) item.humanReview.verdict = 'NO_MATERIAL_GAIN';
const noGainChecks = validateEvidence(noGain, baseline, currentTree);
check('NO_MATERIAL_GAIN cannot satisfy promotion evidence', noGainChecks.some((item) => !item.ok));

const regression = baseEvidence();
regression.comparisons[0].humanReview.verdict = 'REGRESSION';
const regressionChecks = validateEvidence(regression, baseline, currentTree);
check('observed regression cannot satisfy promotion evidence', regressionChecks.some((item) => item.name === 'P1 has zero observed regression' && !item.ok));

const overfit = baseEvidence();
overfit.universalCounterfactuals = overfit.universalCounterfactuals.slice(0, 1);
const overfitChecks = validateEvidence(overfit, baseline, currentTree);
check('single-role/under-covered counterfactual evidence cannot satisfy P2', overfitChecks.some((item) => item.name === 'P2 spans enough distinct role fingerprints' && !item.ok));

const complexity = baseEvidence();
complexity.architectureReview.runtimeDecisionComplexityDelta = 2;
const complexityChecks = validateEvidence(complexity, baseline, currentTree);
check('Runtime decision complexity beyond the single approved conformance layer cannot satisfy P3', complexityChecks.some((item) => item.name.includes('Runtime decision complexity') && !item.ok));


const unapprovedConformance = baseEvidence();
unapprovedConformance.architectureReview.canonicalSemanticConformance.authority = 'SOME_OTHER_GATE';
const unapprovedChecks = validateEvidence(unapprovedConformance, baseline, currentTree);
check('unapproved Runtime gate cannot masquerade as the V12 conformance exception', unapprovedChecks.some((item) => item.name === 'P3 approved Canonical Semantic Conformance is bounded when declared' && !item.ok));

console.log(`\nHuman Progress Promotion Gate: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
