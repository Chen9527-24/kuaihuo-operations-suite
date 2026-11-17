#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { treeHash, loadStableBaselineManifest, validateEvidence } = require('./run-v520-human-progress-promotion-gate.cjs');

const root = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const out = { baselineCapture: null, candidateCapture: null, output: null, productGoal: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline-capture') out.baselineCapture = argv[++i];
    else if (arg === '--candidate-capture') out.candidateCapture = argv[++i];
    else if (arg === '--out') out.output = argv[++i];
    else if (arg === '--product-goal') out.productGoal = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:\n  node tools/customer-service-v520/run-v520-human-progress-ab-capture.cjs \\\n    --baseline-capture <stable-run.json> \\\n    --candidate-capture <candidate-run.json> \\\n    --product-goal <text> \\\n    --out <draft-promotion-evidence.json>\n\nThis tool only validates and pairs real Stable-vs-Candidate run captures. It never scores human quality and always emits DRAFT_PROMOTION_EVIDENCE with PENDING_HUMAN_REVIEW. A human must review visible behavior before the Promotion Gate can accept the evidence.`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function requiredText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRunSnapshot(snapshot, expectedSide, expectedSourceHash) {
  const errors = [];
  if (snapshot?.evidenceKind !== 'HUMAN_PROGRESS_AB_RUN_CAPTURE') errors.push('evidenceKind must be HUMAN_PROGRESS_AB_RUN_CAPTURE');
  if (snapshot?.side !== expectedSide) errors.push(`side must be ${expectedSide}`);
  if (snapshot?.sourceTreeSha256 !== expectedSourceHash) errors.push(`sourceTreeSha256 does not match ${expectedSide}`);
  if (!requiredText(snapshot?.environmentFingerprint)) errors.push('environmentFingerprint is required');
  const runs = Array.isArray(snapshot?.runs) ? snapshot.runs : [];
  if (!runs.length) errors.push('runs must be a non-empty array');
  const ids = new Set();
  for (const [index, run] of runs.entries()) {
    const label = `runs[${index}]`;
    for (const key of ['caseId', 'roleFingerprint', 'roleFamily', 'industryFamily', 'scenarioFamily', 'inputVariantClass', 'input', 'reply']) {
      if (!requiredText(run?.[key])) errors.push(`${label}.${key} is required`);
    }
    if (requiredText(run?.caseId)) {
      if (ids.has(run.caseId)) errors.push(`duplicate caseId ${run.caseId}`);
      ids.add(run.caseId);
    }
    if (run?.requestStatus !== 'SUCCESS') errors.push(`${label}.requestStatus must be SUCCESS`);
    if (!requiredText(run?.selected) || /^none$/i.test(String(run.selected).trim())) errors.push(`${label}.selected must identify a delivered candidate`);
    if (run?.controlledAvailability === true) errors.push(`${label}.controlledAvailability must be false`);
    if (run?.candidateStarvation === true) errors.push(`${label}.candidateStarvation must be false`);
  }
  return { ok: errors.length === 0, errors, runs };
}

function pairSnapshots(baseline, candidate, baselineManifest, candidateTree) {
  const errors = [];
  const stableValidation = validateRunSnapshot(baseline, 'STABLE_BASELINE', baselineManifest.productionSourceTree.sha256);
  const candidateValidation = validateRunSnapshot(candidate, 'CANDIDATE', candidateTree.sha256);
  errors.push(...stableValidation.errors.map((item) => `baseline: ${item}`));
  errors.push(...candidateValidation.errors.map((item) => `candidate: ${item}`));
  if (baseline?.environmentFingerprint !== candidate?.environmentFingerprint) errors.push('baseline/candidate environmentFingerprint mismatch');

  const baselineById = new Map(stableValidation.runs.map((run) => [run.caseId, run]));
  const candidateById = new Map(candidateValidation.runs.map((run) => [run.caseId, run]));
  const allIds = new Set([...baselineById.keys(), ...candidateById.keys()]);
  const comparisons = [];
  for (const caseId of [...allIds].sort()) {
    const left = baselineById.get(caseId);
    const right = candidateById.get(caseId);
    if (!left || !right) {
      errors.push(`case ${caseId} is not paired on both sides`);
      continue;
    }
    for (const key of ['roleFingerprint', 'roleFamily', 'industryFamily', 'scenarioFamily', 'inputVariantClass', 'input']) {
      if (left[key] !== right[key]) errors.push(`case ${caseId} ${key} mismatch between Stable and Candidate`);
    }
    comparisons.push({
      id: caseId,
      roleFingerprint: left.roleFingerprint,
      roleFamily: left.roleFamily,
      industryFamily: left.industryFamily,
      scenarioFamily: left.scenarioFamily,
      inputVariantClass: left.inputVariantClass,
      input: left.input,
      baselineReply: left.reply,
      candidateReply: right.reply,
      humanReview: {
        verdict: 'PENDING_HUMAN_REVIEW',
        rationale: '',
        visibleBehaviorDelta: '',
      },
    });
  }

  return { ok: errors.length === 0, errors, comparisons };
}

function buildDraftEvidence({ baseline, candidate, productGoal }) {
  const baselineManifest = loadStableBaselineManifest();
  const candidateTree = treeHash('src');
  const paired = pairSnapshots(baseline, candidate, baselineManifest, candidateTree);
  if (!paired.ok) return { ok: false, errors: paired.errors, evidence: null };
  const evidence = {
    evidenceKind: 'DRAFT_PROMOTION_EVIDENCE',
    baseline: { id: baselineManifest.id, sourceTreeSha256: baselineManifest.productionSourceTree.sha256 },
    candidate: { id: String(candidate.candidateId || 'PHASE_C_INTERNAL_EXPERIMENT'), sourceTreeSha256: candidateTree.sha256 },
    productGoal,
    captureAudit: {
      environmentFingerprint: baseline.environmentFingerprint,
      pairedCaseCount: paired.comparisons.length,
      generatedAt: new Date().toISOString(),
      automatedHumanVerdictForbidden: true,
    },
    comparisons: paired.comparisons,
    p1OverallVerdict: 'PENDING_HUMAN_REVIEW',
    universalCounterfactuals: [],
    p2NoRuntimeFixtureReuse: true,
    p2NoRoleIndustrySentenceSpecialCases: true,
    architectureReview: {
      singleFinalAuthority: true,
      producerOwnsCorrectness: true,
      runtimeDecisionComplexityDelta: 0,
      newRuntimeGate: false,
      newRepairFallbackHumanizer: false,
      rationale: 'PENDING_ARCHITECTURE_REVIEW',
    },
    releaseReview: { decision: 'PENDING_HUMAN_REVIEW', rationale: '' },
  };
  return { ok: true, errors: [], evidence };
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`[HUMAN A/B CAPTURE] ${error.message}`); process.exit(2); }
  if (!args.baselineCapture || !args.candidateCapture || !args.output || !requiredText(args.productGoal)) {
    console.error('[HUMAN A/B CAPTURE] baseline, candidate, product goal and output are required. Use --help.');
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(path.resolve(args.baselineCapture), 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(path.resolve(args.candidateCapture), 'utf8'));
  const result = buildDraftEvidence({ baseline, candidate, productGoal: args.productGoal.trim() });
  if (!result.ok) {
    for (const error of result.errors) console.error(`[HUMAN A/B CAPTURE] FAIL ${error}`);
    process.exit(1);
  }
  const output = path.resolve(args.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result.evidence, null, 2)}\n`, 'utf8');
  const promotionChecks = validateEvidence(result.evidence, loadStableBaselineManifest(), treeHash('src'));
  const unexpectedlyPromotable = promotionChecks.every((item) => item.ok);
  if (unexpectedlyPromotable) {
    console.error('[HUMAN A/B CAPTURE] FAIL draft evidence unexpectedly satisfies Promotion Gate');
    process.exit(1);
  }
  console.log(`[HUMAN A/B CAPTURE] DRAFT READY · paired=${result.evidence.comparisons.length} · human review still required · ${path.relative(root, output) || output}`);
}

module.exports = { validateRunSnapshot, pairSnapshots, buildDraftEvidence };
if (require.main === module) main();
