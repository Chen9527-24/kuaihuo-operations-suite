#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const root = path.resolve(__dirname, '../..');
const fixturePath = path.join(__dirname, 'fixtures/hve3-human-progress-promotion-gate-v1.json');
const policy = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function normalizeFile(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function treeHash(relativeRoot) {
  const base = path.join(root, relativeRoot);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(base);
  const lines = files.map((file) => `${normalizeFile(path.relative(root, file))}\0${sha256(fs.readFileSync(file))}\n`).join('');
  return { root: relativeRoot, fileCount: files.length, sha256: sha256(lines) };
}

function loadStableBaselineManifest() {
  const abs = path.join(root, policy.stableBaselineManifest);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function parseArgs(argv) {
  const out = { evidence: null, changedFiles: [], changedFilesFrom: null, liveTraces: [], baseRef: null, printCandidateHash: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence') out.evidence = argv[++i];
    else if (arg === '--changed-file') out.changedFiles.push(normalizeFile(argv[++i]));
    else if (arg === '--changed-files-from') out.changedFilesFrom = argv[++i];
    else if (arg === '--live-trace') out.liveTraces.push(argv[++i]);
    else if (arg === '--base-ref') out.baseRef = argv[++i];
    else if (arg === '--print-candidate-hash') out.printCandidateHash = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:\n  node tools/customer-service-v520/run-v520-human-progress-promotion-gate.cjs \\\n    --evidence <promotion-evidence.json> \\\n    --changed-file <root-relative-path> [--changed-file ...] \\\n    [--live-trace <hve-analysis.txt> ...]\n\nAlternative change discovery:\n  --changed-files-from <text-file>\n  --base-ref <git-ref>\n\nUtility:\n  --print-candidate-hash\n\nThe gate is release-time only. P0 delegates to the existing Regression Firewall; P1/P2/P3 validate explicit human-reviewed promotion evidence and architecture declarations. It never changes Runtime behavior.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function discoverChangedFiles(args) {
  const found = new Set(args.changedFiles.filter(Boolean));
  if (args.changedFilesFrom) {
    const text = fs.readFileSync(path.resolve(args.changedFilesFrom), 'utf8');
    for (const line of text.split(/\r?\n/)) if (normalizeFile(line)) found.add(normalizeFile(line));
  }
  if (!found.size && fs.existsSync(path.join(root, '.git'))) {
    const base = args.baseRef || 'HEAD';
    const proc = cp.spawnSync('git', ['diff', '--name-only', base, '--'], { cwd: root, encoding: 'utf8' });
    if (proc.status === 0) {
      for (const line of String(proc.stdout || '').split(/\r?\n/)) if (normalizeFile(line)) found.add(normalizeFile(line));
    }
  }
  return [...found];
}

function checkResult(name, condition, detail = '') {
  return { name, ok: Boolean(condition), detail };
}

function validateEvidence(evidence, baselineManifest, candidateSourceTree) {
  const checks = [];
  const p1 = policy.p1;
  const p2 = policy.p2;
  const p3 = policy.p3;

  checks.push(checkResult('evidence is real promotion evidence', evidence?.evidenceKind === 'REAL_PROMOTION_EVIDENCE', String(evidence?.evidenceKind || 'missing')));
  checks.push(checkResult('evidence references the fixed Stable Baseline', evidence?.baseline?.id === baselineManifest.id, String(evidence?.baseline?.id || 'missing')));
  checks.push(checkResult('evidence baseline source hash matches Stable Baseline manifest', evidence?.baseline?.sourceTreeSha256 === baselineManifest.productionSourceTree.sha256, String(evidence?.baseline?.sourceTreeSha256 || 'missing')));
  checks.push(checkResult('candidate evidence is bound to the current source tree', evidence?.candidate?.sourceTreeSha256 === candidateSourceTree.sha256, `${evidence?.candidate?.sourceTreeSha256 || 'missing'} != ${candidateSourceTree.sha256}`));
  checks.push(checkResult('product goal is explicit', typeof evidence?.productGoal === 'string' && evidence.productGoal.trim().length >= 8));

  const comparisons = Array.isArray(evidence?.comparisons) ? evidence.comparisons : [];
  const roleFingerprints = new Set(comparisons.map((item) => String(item?.roleFingerprint || '').trim()).filter(Boolean));
  const reviewed = comparisons.filter((item) => p1.allowedVerdicts.includes(item?.humanReview?.verdict));
  const positive = comparisons.filter((item) => item?.humanReview?.verdict === 'POSITIVE_GAIN');
  const positiveRoles = new Set(positive.map((item) => String(item?.roleFingerprint || '').trim()).filter(Boolean));
  const regressions = comparisons.filter((item) => item?.humanReview?.verdict === 'REGRESSION');
  const completePairs = comparisons.filter((item) =>
    typeof item?.input === 'string' && item.input.trim()
    && typeof item?.baselineReply === 'string' && item.baselineReply.trim()
    && typeof item?.candidateReply === 'string' && item.candidateReply.trim()
    && typeof item?.humanReview?.rationale === 'string' && item.humanReview.rationale.trim()
    && typeof item?.humanReview?.visibleBehaviorDelta === 'string' && item.humanReview.visibleBehaviorDelta.trim());

  checks.push(checkResult('P1 compares enough real turns', comparisons.length >= Number(p1.minimumComparedTurns), `${comparisons.length}/${p1.minimumComparedTurns}`));
  checks.push(checkResult('P1 covers enough distinct role fingerprints', roleFingerprints.size >= Number(p1.minimumDistinctRoleFingerprints), `${roleFingerprints.size}/${p1.minimumDistinctRoleFingerprints}`));
  checks.push(checkResult('P1 every comparison has paired visible replies and human rationale', completePairs.length === comparisons.length, `${completePairs.length}/${comparisons.length}`));
  checks.push(checkResult('P1 every comparison has a human review verdict', reviewed.length === comparisons.length, `${reviewed.length}/${comparisons.length}`));
  checks.push(checkResult('P1 contains enough observed positive-gain comparisons', positive.length >= Number(p1.minimumPositiveGainComparisons), `${positive.length}/${p1.minimumPositiveGainComparisons}`));
  checks.push(checkResult('P1 positive gain spans multiple roles', positiveRoles.size >= Number(p1.minimumRolesWithPositiveGain), `${positiveRoles.size}/${p1.minimumRolesWithPositiveGain}`));
  checks.push(checkResult('P1 has zero observed regression', regressions.length <= Number(p1.regressionTolerance), `${regressions.length}`));
  checks.push(checkResult('P1 overall human verdict is positive gain', evidence?.p1OverallVerdict === p1.requiredOverallVerdict, String(evidence?.p1OverallVerdict || 'missing')));

  const counterfactuals = Array.isArray(evidence?.universalCounterfactuals) ? evidence.universalCounterfactuals : [];
  const cfRoles = new Set(counterfactuals.map((item) => String(item?.roleFingerprint || '').trim()).filter(Boolean));
  const structuralVariants = new Set(counterfactuals.map((item) => [item?.roleFamily, item?.industryFamily, item?.scenarioFamily, item?.inputVariantClass].map((v) => String(v || '').trim()).join('|')).filter((v) => v.replace(/\|/g, '')));
  const cfComplete = counterfactuals.filter((item) =>
    item?.verdict === p2.requiredVerdict
    && typeof item?.rationale === 'string' && item.rationale.trim()
    && typeof item?.inputVariantClass === 'string' && item.inputVariantClass.trim());
  checks.push(checkResult('P2 has enough counterfactual cases', counterfactuals.length >= Number(p2.minimumCounterfactualCases), `${counterfactuals.length}/${p2.minimumCounterfactualCases}`));
  checks.push(checkResult('P2 spans enough distinct role fingerprints', cfRoles.size >= Number(p2.minimumDistinctRoleFingerprints), `${cfRoles.size}/${p2.minimumDistinctRoleFingerprints}`));
  checks.push(checkResult('P2 spans enough structural variants', structuralVariants.size >= Number(p2.minimumDistinctStructuralVariants), `${structuralVariants.size}/${p2.minimumDistinctStructuralVariants}`));
  checks.push(checkResult('P2 all counterfactuals show the same mechanism holds', cfComplete.length === counterfactuals.length, `${cfComplete.length}/${counterfactuals.length}`));
  checks.push(checkResult('P2 evidence declares no Runtime fixture/sentence special case', evidence?.p2NoRuntimeFixtureReuse === true && evidence?.p2NoRoleIndustrySentenceSpecialCases === true));

  const architecture = evidence?.architectureReview || {};
  checks.push(checkResult('P3 retains one final Authority', architecture.singleFinalAuthority === p3.singleFinalAuthorityRequired));
  checks.push(checkResult('P3 producer still owns correctness', architecture.producerOwnsCorrectness === p3.producerOwnsCorrectnessRequired));
  const conformanceException = p3.canonicalSemanticConformanceException || {};
  const conformance = architecture.canonicalSemanticConformance || {};
  const usesApprovedConformance = conformanceException.allowed === true
    && conformance.enabled === true
    && conformance.authority === conformanceException.authority
    && Number(conformance.modelCallCountMax) <= Number(conformanceException.maximumModelCalls)
    && conformance.correctionMode === conformanceException.correctionMode
    && conformance.retry === false
    && conformance.plannerQualityJudgeHumanizer === false;
  const allowedComplexity = usesApprovedConformance
    ? Number(conformanceException.maximumRuntimeDecisionComplexityDelta)
    : 0;
  checks.push(checkResult('P3 Runtime decision complexity is zero-growth except the explicitly approved Canonical Semantic Conformance layer', Number.isFinite(architecture.runtimeDecisionComplexityDelta) && architecture.runtimeDecisionComplexityDelta <= allowedComplexity, `${architecture.runtimeDecisionComplexityDelta}/${allowedComplexity}`));
  checks.push(checkResult('P3 adds no unapproved Runtime Gate', architecture.newRuntimeGate === false && (architecture.runtimeDecisionComplexityDelta <= 0 || usesApprovedConformance)));
  checks.push(checkResult('P3 approved Canonical Semantic Conformance is bounded when declared', architecture.runtimeDecisionComplexityDelta <= 0 || usesApprovedConformance));
  checks.push(checkResult('P3 adds no Repair/Fallback/Humanizer authority', architecture.newRepairFallbackHumanizer === false));
  checks.push(checkResult('P3 architecture rationale is explicit', typeof architecture.rationale === 'string' && architecture.rationale.trim().length >= 12));

  const releaseReview = evidence?.releaseReview || {};
  checks.push(checkResult('human release decision explicitly says PROMOTE', releaseReview.decision === policy.release.requiredHumanDecision));
  checks.push(checkResult('human release rationale is explicit', typeof releaseReview.rationale === 'string' && releaseReview.rationale.trim().length >= 12));

  return checks;
}

function runP0(changedFiles, liveTraces, baseRef) {
  const runner = path.join(root, policy.p0.delegate);
  const args = [runner];
  for (const file of changedFiles) args.push('--changed-file', file);
  for (const trace of liveTraces) args.push('--live-trace', trace);
  if (baseRef) args.push('--base-ref', baseRef);
  console.log('\n[PROMOTION] P0 Existing Capability Regression');
  const proc = cp.spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);
  return proc.status === 0;
}

function runBuildGate() {
  const runner = path.join(root, policy.release.buildGate);
  console.log('\n[PROMOTION] Release Build Gate');
  const proc = cp.spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);
  return proc.status === 0;
}

function printChecks(title, checks) {
  console.log(`\n[PROMOTION] ${title}`);
  let ok = true;
  for (const item of checks) {
    if (item.ok) console.log(`PASS ${item.name}`);
    else { ok = false; console.error(`FAIL ${item.name}${item.detail ? ` :: ${item.detail}` : ''}`); }
  }
  return ok;
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`[PROMOTION] ${error.message}`); process.exit(2); }

  const candidateSourceTree = treeHash('src');
  if (args.printCandidateHash) {
    console.log(JSON.stringify(candidateSourceTree, null, 2));
    if (!args.evidence) return;
  }
  if (!args.evidence) {
    console.error('[PROMOTION] FAIL --evidence is required for a promotion decision.');
    process.exit(2);
  }
  const changedFiles = discoverChangedFiles(args);
  if (!changedFiles.length) {
    console.error('[PROMOTION] FAIL change set is unknown. Pass --changed-file/--changed-files-from or run inside a git worktree.');
    process.exit(2);
  }

  const evidence = JSON.parse(fs.readFileSync(path.resolve(args.evidence), 'utf8'));
  const baselineManifest = loadStableBaselineManifest();
  const evidenceChecks = validateEvidence(evidence, baselineManifest, candidateSourceTree);
  const p123Ok = printChecks('P1/P2/P3 Evidence', evidenceChecks);
  const p0Ok = runP0(changedFiles, args.liveTraces, args.baseRef);
  const buildOk = runBuildGate();

  if (!p0Ok || !p123Ok || !buildOk) {
    console.error(`\n[PROMOTION] NOT PROMOTABLE · P0=${p0Ok ? 'PASS' : 'FAIL'} · P1/P2/P3=${p123Ok ? 'PASS' : 'FAIL'} · BUILD=${buildOk ? 'PASS' : 'FAIL'}`);
    process.exit(1);
  }
  console.log('\n[PROMOTION] PROMOTABLE RELEASE · P0/P1/P2/P3 + BUILD PASS');
}

module.exports = { treeHash, loadStableBaselineManifest, validateEvidence, policy };
if (require.main === module) main();
