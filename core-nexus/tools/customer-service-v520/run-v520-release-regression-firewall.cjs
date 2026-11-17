#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/hve3-release-regression-firewall-v1.json'), 'utf8'));

function normalizeFile(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
function parseArgs(argv) {
  const out = { changedFiles: [], changedFilesFrom: null, liveTraces: [], capabilityLiveTraces: [], capabilityVarianceEvidence: [], impactOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--changed-file') out.changedFiles.push(normalizeFile(argv[++i]));
    else if (arg === '--changed-files-from') out.changedFilesFrom = argv[++i];
    else if (arg === '--live-trace') out.liveTraces.push(argv[++i]);
    else if (arg === '--capability-live-trace') {
      const raw = String(argv[++i] || '');
      const separator = raw.indexOf('=');
      if (separator <= 0 || separator === raw.length - 1) {
        throw new Error('--capability-live-trace expects CAPABILITY_KEY=TRACE_FILE');
      }
      out.capabilityLiveTraces.push({ key: raw.slice(0, separator).trim(), file: raw.slice(separator + 1).trim() });
    }
    else if (arg === '--capability-variance-evidence') {
      const raw = String(argv[++i] || '');
      const separator = raw.indexOf('=');
      if (separator <= 0 || separator === raw.length - 1) {
        throw new Error('--capability-variance-evidence expects CAPABILITY_KEY=EVIDENCE_JSON');
      }
      out.capabilityVarianceEvidence.push({ key: raw.slice(0, separator).trim(), file: raw.slice(separator + 1).trim() });
    }
    else if (arg === '--impact-only') out.impactOnly = true;
    else throw new Error(`unknown argument: ${arg}`);
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
    const proc = cp.spawnSync('git', ['diff', '--name-only', 'HEAD', '--'], { cwd: root, encoding: 'utf8' });
    if (proc.status === 0) {
      for (const line of String(proc.stdout || '').split(/\r?\n/)) if (normalizeFile(line)) found.add(normalizeFile(line));
    }
  }
  return [...found];
}
function classify(files) {
  const exact = new Set((fixture.riskPolicy?.criticalRuntimePaths || []).map(normalizeFile));
  const prefixes = (fixture.riskPolicy?.criticalRuntimePrefixes || []).map(normalizeFile);
  const critical = files.some((file) => {
    const normalized = normalizeFile(file);
    return exact.has(normalized) || prefixes.some((prefix) => normalized.startsWith(prefix));
  });
  return critical ? 'CRITICAL' : 'DEV_ONLY';
}
function frozenCapabilityImpacts(files) {
  const capabilities = fixture.frozenCapabilityPolicy?.capabilities || [];
  return capabilities.map((capability) => {
    const exact = new Set((capability.dependencyPaths || []).map(normalizeFile));
    const prefixes = (capability.dependencyPrefixes || []).map(normalizeFile);
    const matchedFiles = files.filter((file) => {
      const normalized = normalizeFile(file);
      return exact.has(normalized) || prefixes.some((prefix) => normalized.startsWith(prefix));
    });
    return { ...capability, matchedFiles };
  }).filter((capability) => capability.matchedFiles.length > 0);
}
function capabilityTraceFiles(args, key) {
  return args.capabilityLiveTraces
    .filter((item) => item.key === key)
    .map((item) => item.file)
    .filter(Boolean);
}
function capabilityVarianceEvidenceFiles(args, key) {
  return args.capabilityVarianceEvidence
    .filter((item) => item.key === key)
    .map((item) => item.file)
    .filter(Boolean);
}
function runVerifier(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[REGRESSION FIREWALL] FAIL missing verifier ${rel}`);
    return false;
  }
  console.log(`\n[REGRESSION FIREWALL] RUN ${rel}`);
  const proc = cp.spawnSync(process.execPath, [abs], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);
  if (proc.status === 0) return true;
  console.error(`[REGRESSION FIREWALL] VERIFIER_FAIL ${rel} :: exit=${proc.status}`);
  return false;
}
function parseTraceFile(file) {
  const abs = path.resolve(file);
  const text = fs.readFileSync(abs, 'utf8');
  const blocks = text.split(/(?=HVE-3\s*解析数据)/u).filter((item) => /HVE-3\s*解析数据/u.test(item));
  return blocks.map((block, index) => {
    const pick = (regex) => (block.match(regex)?.[1] || '').trim();
    const selected = pick(/^Selected:\s*(.+)$/mi);
    const reason = pick(/^Reason:\s*(.+)$/mi);
    return {
      file: abs,
      index,
      requestStatus: pick(/^Request Status:\s*(\S+)/mi),
      replyTrace: pick(/^Reply Trace:\s*(\S+)/mi),
      selected,
      reason,
      fingerprint: pick(/^Fingerprint:\s*([^\s]+)/mi),
      controlledAvailability: /CONTROLLED_AVAILABILITY/i.test(reason) || /CONTROLLED_AVAILABILITY/i.test(block),
      selectedNone: /^none$/i.test(selected) || selected === '',
      candidateStarvation: /CANDIDATE[_\s-]?STARVATION/i.test(reason) || /CANDIDATE[_\s-]?STARVATION/i.test(block),
    };
  });
}
function validateLiveTraces(files) {
  const policy = fixture.liveSmokePolicy || {};
  const turns = files.flatMap(parseTraceFile);
  const accepted = new Set(policy.acceptedRequestStatus || ['SUCCESS']);
  const successful = turns.filter((item) => accepted.has(item.requestStatus));
  const fingerprints = new Set(successful.map((item) => item.fingerprint).filter(Boolean));
  const controlled = successful.filter((item) => item.controlledAvailability);
  const selectedNone = successful.filter((item) => item.selectedNone);
  const starvation = successful.filter((item) => item.candidateStarvation);
  const badStatus = turns.filter((item) => !accepted.has(item.requestStatus));
  const checks = [
    ['successful turns', successful.length >= Number(policy.minimumSuccessfulTurns || 0), `${successful.length}/${policy.minimumSuccessfulTurns}`],
    ['distinct role fingerprints', fingerprints.size >= Number(policy.minimumDistinctRoleFingerprints || 0), `${fingerprints.size}/${policy.minimumDistinctRoleFingerprints}`],
    ['unexpected request failures', badStatus.length === 0, `${badStatus.length}`],
    ['controlled availability', controlled.length <= Number(policy.maximumControlledAvailability || 0), `${controlled.length}`],
    ['Selected:none', selectedNone.length <= Number(policy.maximumSelectedNone || 0), `${selectedNone.length}`],
    ['candidate starvation', starvation.length <= Number(policy.maximumCandidateStarvation || 0), `${starvation.length}`],
  ];
  let ok = true;
  for (const [name, condition, detail] of checks) {
    if (condition) console.log(`PASS live ${name}`);
    else { ok = false; console.error(`FAIL live ${name} :: ${detail}`); }
  }
  return ok;
}

function validateCapabilityLiveTraces(capability, files) {
  const turns = files.flatMap(parseTraceFile);
  const accepted = new Set(fixture.liveSmokePolicy?.acceptedRequestStatus || ['SUCCESS']);
  const successful = turns.filter((item) => accepted.has(item.requestStatus));
  const badStatus = turns.filter((item) => !accepted.has(item.requestStatus));
  const controlled = successful.filter((item) => item.controlledAvailability);
  const selectedNone = successful.filter((item) => item.selectedNone);
  const starvation = successful.filter((item) => item.candidateStarvation);
  const minimum = Math.max(1, Number(capability.minimumFreshSuccessfulTurns || 1));
  const checks = [
    ['fresh successful turns', successful.length >= minimum, `${successful.length}/${minimum}`],
    ['unexpected request failures', badStatus.length === 0, `${badStatus.length}`],
    ['controlled availability', controlled.length === 0, `${controlled.length}`],
    ['Selected:none', selectedNone.length === 0, `${selectedNone.length}`],
    ['candidate starvation', starvation.length === 0, `${starvation.length}`],
  ];
  let ok = true;
  for (const [name, condition, detail] of checks) {
    if (condition) console.log(`PASS capability ${capability.key} ${name}`);
    else { ok = false; console.error(`FAIL capability ${capability.key} ${name} :: ${detail}`); }
  }
  if (ok) {
    console.log(`[REGRESSION FIREWALL] ${capability.key} fresh trace health is present; semantic adjudication against the observable contract is still required before re-freeze.`);
  }
  return ok;
}


function validateCapabilityVarianceEvidence(capability, evidenceFiles) {
  const policy = fixture.frozenCapabilityPolicy || {};
  const contract = policy.semanticVarianceEvidenceContract || {};
  const minimum = Math.max(2, Number(capability.minimumSemanticVariants || 2));
  const passValue = String(contract.observableOutcomePassValue || 'PASS');
  const variants = [];
  let ok = true;
  const fail = (message) => {
    ok = false;
    console.error(`FAIL capability ${capability.key} semantic variance :: ${message}`);
  };
  if (!evidenceFiles.length) {
    fail(`missing variance evidence; pass --capability-variance-evidence ${capability.key}=<evidence-json>. A single Fresh Live is a sample only and cannot reseal a language-sensitive capability.`);
    return { ok, traceFiles: [] };
  }
  for (const file of evidenceFiles) {
    let manifest;
    const abs = path.resolve(file);
    try { manifest = JSON.parse(fs.readFileSync(abs, 'utf8')); }
    catch (error) { fail(`cannot read ${abs}: ${error.message}`); continue; }
    if (manifest.capabilityKey !== capability.key) {
      fail(`${abs} capabilityKey=${manifest.capabilityKey || '-'} expected=${capability.key}`);
      continue;
    }
    if (manifest.contractVersion !== capability.contractVersion) {
      fail(`${abs} contractVersion=${manifest.contractVersion || '-'} expected=${capability.contractVersion || '-'}`);
      continue;
    }
    if (!Array.isArray(manifest.variants)) {
      fail(`${abs} variants must be an array`);
      continue;
    }
    for (const variant of manifest.variants) variants.push({ ...variant, manifestFile: abs });
  }
  const required = contract.variantRequiredFields || ['id', 'semanticShapeId', 'equivalenceBasis', 'traceFile', 'replyTrace', 'observableOutcome'];
  const ids = new Set();
  const shapes = new Set();
  const traces = new Set();
  const traceFiles = new Set();
  const accepted = new Set(fixture.liveSmokePolicy?.acceptedRequestStatus || ['SUCCESS']);
  for (const variant of variants) {
    const missing = required.filter((field) => !String(variant?.[field] ?? '').trim());
    if (missing.length) { fail(`variant missing required fields: ${missing.join(', ')}`); continue; }
    if (String(variant.observableOutcome) !== passValue) {
      fail(`variant ${variant.id} observableOutcome=${variant.observableOutcome} expected=${passValue}`);
    }
    const id = String(variant.id).trim();
    const shape = String(variant.semanticShapeId).trim();
    const replyTrace = String(variant.replyTrace).trim();
    if (ids.has(id)) fail(`duplicate variant id ${id}`); else ids.add(id);
    if (shapes.has(shape)) fail(`duplicate semanticShapeId ${shape}; declared variants must cover distinct adjudicated semantic/output shapes`); else shapes.add(shape);
    if (traces.has(replyTrace)) fail(`duplicate Reply Trace ${replyTrace}; one Live sample cannot count as multiple variants`); else traces.add(replyTrace);
    const traceFile = path.resolve(path.dirname(variant.manifestFile), String(variant.traceFile));
    traceFiles.add(traceFile);
    let turns;
    try { turns = parseTraceFile(traceFile); }
    catch (error) { fail(`variant ${id} trace unreadable: ${error.message}`); continue; }
    const turn = turns.find((item) => item.replyTrace === replyTrace);
    if (!turn) { fail(`variant ${id} Reply Trace ${replyTrace} not found in ${traceFile}`); continue; }
    if (!accepted.has(turn.requestStatus)) fail(`variant ${id} requestStatus=${turn.requestStatus || '-'}`);
    if (turn.controlledAvailability) fail(`variant ${id} controlled availability is not a reseal PASS`);
    if (turn.selectedNone) fail(`variant ${id} Selected:none is not a reseal PASS`);
    if (turn.candidateStarvation) fail(`variant ${id} candidate starvation is not a reseal PASS`);
  }
  if (variants.length < minimum) fail(`semantic variants ${variants.length}/${minimum}`);
  if (shapes.size < minimum) fail(`distinct semanticShapeId ${shapes.size}/${minimum}`);
  if (traces.size < minimum) fail(`distinct Reply Trace ${traces.size}/${minimum}`);
  if (ok) {
    console.log(`PASS capability ${capability.key} semantic/output variance matrix ${variants.length}/${minimum}`);
    console.log(`[REGRESSION FIREWALL] ${capability.key} variance evidence is structurally complete. Semantic equivalence is declared by human/typed-verifier evidence; Runtime does not infer equivalence from wording.`);
  }
  return { ok, traceFiles: [...traceFiles] };
}

let args;
try { args = parseArgs(process.argv.slice(2)); }
catch (error) { console.error(`[REGRESSION FIREWALL] ${error.message}`); process.exit(2); }
const changedFiles = discoverChangedFiles(args);
if (!changedFiles.length) {
  console.error('[REGRESSION FIREWALL] FAIL change set is unknown. Pass --changed-file or --changed-files-from.');
  process.exit(2);
}
const risk = classify(changedFiles);
const impactedCapabilities = frozenCapabilityImpacts(changedFiles);
console.log('[REGRESSION FIREWALL] Change set:');
for (const file of changedFiles) console.log(`  - ${file}`);
console.log(`[REGRESSION FIREWALL] Risk: ${risk}`);
if (impactedCapabilities.length) {
  console.log('[REGRESSION FIREWALL] Frozen capability dependency-closure impacts:');
  for (const capability of impactedCapabilities) {
    console.log(`  - ${capability.key}: ${capability.matchedFiles.join(', ')}`);
    if (fixture.frozenCapabilityPolicy?.oldPassInvalidatedOnClosureImpact !== false) {
      console.log(`    PRIOR_PASS_INVALIDATED: ${capability.key} must be re-verified; a historical SEALED/FROZEN PASS cannot be inherited.`);
    }
  }
} else {
  console.log('[REGRESSION FIREWALL] Frozen capability dependency-closure impacts: none');
}
if (args.impactOnly) process.exit(0);

let ok = true;
let verifierPass = 0;
let verifierFail = 0;
const verifiers = new Set(fixture.offlineVerifierPolicy?.always || []);
for (const capability of impactedCapabilities) {
  for (const verifier of capability.mandatoryVerifiers || []) verifiers.add(verifier);
  for (const verifier of capability.semanticVarianceVerifiers || []) verifiers.add(verifier);
}
for (const verifier of verifiers) {
  if (runVerifier(verifier)) verifierPass += 1;
  else { verifierFail += 1; ok = false; }
}

for (const capability of impactedCapabilities) {
  let varianceTraceFiles = [];
  if (capability.semanticVarianceRequired) {
    const variance = validateCapabilityVarianceEvidence(capability, capabilityVarianceEvidenceFiles(args, capability.key));
    if (!variance.ok) ok = false;
    varianceTraceFiles = variance.traceFiles;
  }
  if (!capability.freshLiveRequired) continue;
  const files = [...new Set([...capabilityTraceFiles(args, capability.key), ...varianceTraceFiles])];
  if (!files.length) {
    ok = false;
    console.error(`\n[REGRESSION FIREWALL] FAIL impacted frozen capability ${capability.key} has no capability-attributed Fresh Live evidence. Pass --capability-live-trace ${capability.key}=<trace-file> or provide trace-backed --capability-variance-evidence. Historical Live/PASS is invalid after dependency-closure impact.`);
    continue;
  }
  if (!validateCapabilityLiveTraces(capability, files)) ok = false;
}

if (risk === 'CRITICAL') {
  if (!args.liveTraces.length) {
    ok = false;
    console.error('\n[REGRESSION FIREWALL] FAIL Critical Runtime change has no live HVE smoke evidence. This blocks RELEASE only. Provide ordinary smoke traces from >=3 distinct configured roles.');
  } else if (!validateLiveTraces(args.liveTraces)) ok = false;
} else if (args.liveTraces.length && !validateLiveTraces(args.liveTraces)) {
  ok = false;
}
console.log(`\n[REGRESSION FIREWALL] verifier outcomes: PASS=${verifierPass} VERIFIER_FAIL=${verifierFail}`);
if (ok) {
  console.log('[REGRESSION FIREWALL] RELEASE PASS');
  process.exit(0);
}
console.error('[REGRESSION FIREWALL] RELEASE BLOCKED');
process.exit(1);
