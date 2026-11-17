#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/hve3-release-regression-firewall-v1.json'), 'utf8'));
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
check('firewall is development/release only', fixture.authority === 'DEVELOPMENT_RELEASE_GATE_ONLY');
check('Runtime import is forbidden', fixture.runtimeImportForbidden === true);
check('critical changes require live smoke', fixture.liveSmokePolicy?.requiredForCriticalRuntimeChange === true);
check('live smoke requires >=3 role fingerprints', Number(fixture.liveSmokePolicy?.minimumDistinctRoleFingerprints) >= 3);
check('live smoke requires >=6 successful turns', Number(fixture.liveSmokePolicy?.minimumSuccessfulTurns) >= 6);
check('live smoke requires zero controlled availability', Number(fixture.liveSmokePolicy?.maximumControlledAvailability) === 0);
check('live smoke requires zero Selected:none', Number(fixture.liveSmokePolicy?.maximumSelectedNone) === 0);
check('live smoke requires zero candidate starvation', Number(fixture.liveSmokePolicy?.maximumCandidateStarvation) === 0);
check('firewall schema carries dependency + semantic-variance freeze governance', Number(fixture.schemaVersion) >= 4);
const frozenPolicy = fixture.frozenCapabilityPolicy || {};
check('closure impact invalidates inherited frozen PASS', frozenPolicy.oldPassInvalidatedOnClosureImpact === true);
check('impacted frozen capability requires fresh Live evidence', frozenPolicy.requireFreshLiveForImpactedCapability === true);
check('new freezes require explicit dependency-closure registration', frozenPolicy.requireExplicitClosureRegistrationForNewFreeze === true);
check('language-sensitive freezes require semantic/output variance evidence', frozenPolicy.requireSemanticOutputVarianceForLanguageSensitiveCapability === true);
check('single Fresh Live is sample-only, not reseal proof', frozenPolicy.singleFreshLiveProvesSampleOnly === true);
const varianceContract = frozenPolicy.semanticVarianceEvidenceContract || {};
check('variance evidence is release-only and cannot become Runtime Authority', varianceContract.authority === 'RELEASE_EVIDENCE_ONLY_NO_RUNTIME_AUTHORITY' && varianceContract.runtimeNaturalLanguageInferenceForbidden === true);
check('variance evidence delegates semantic equivalence to human/typed evidence', varianceContract.semanticEquivalenceAdjudication === 'HUMAN_OR_TYPED_VERIFIER_EVIDENCE_ONLY');
check('variance evidence requires trace identity and semantic shape', (varianceContract.variantRequiredFields || []).includes('replyTrace') && (varianceContract.variantRequiredFields || []).includes('semanticShapeId') && (varianceContract.variantRequiredFields || []).includes('equivalenceBasis'));
const frozenCapabilities = frozenPolicy.capabilities || [];
const frozenByKey = new Map(frozenCapabilities.map((item) => [item.key, item]));
for (const key of ['P0_REFUSAL_GENERATION_SEND', 'R2_2_CUSTOMER_REFUSAL_USEFUL_SERVICE_CONTINUATION', 'R2_1_ACTIVE_CONSTRAINT_DECISION_INTEGRITY', 'R2_3_RESPONSE_EFFORT_DEPTH', 'R2_4_CONTEXTUAL_EXTENSION_STOP_WHEN_ENOUGH', 'R2_2_ENTITY_CONTINUITY', 'CONFORMANCE_SURFACE_SEAM']) {
  const capability = frozenByKey.get(key);
  check(`frozen capability registry contains ${key}`, Boolean(capability));
  check(`${key} declares an observable contract`, Boolean(String(capability?.observableContract || '').trim()));
  check(`${key} declares a non-empty dependency closure`, Boolean((capability?.dependencyPaths || []).length || (capability?.dependencyPrefixes || []).length));
  check(`${key} requires Fresh Live after closure impact`, capability?.freshLiveRequired === true);
  check(`${key} mandatory verifiers exist`, (capability?.mandatoryVerifiers || []).length > 0
    && capability.mandatoryVerifiers.every((rel) => fs.existsSync(path.join(root, rel))),
    (capability?.mandatoryVerifiers || []).filter((rel) => !fs.existsSync(path.join(root, rel))).join(', '));
  check(`${key} requires semantic/output variance closure`, capability?.semanticVarianceRequired === true && Number(capability?.minimumSemanticVariants) >= 2);
  check(`${key} declares a versioned observable contract`, Boolean(String(capability?.contractVersion || '').trim()));
  check(`${key} semantic variance verifiers exist`, (capability?.semanticVarianceVerifiers || []).length > 0
    && capability.semanticVarianceVerifiers.every((rel) => fs.existsSync(path.join(root, rel))),
    (capability?.semanticVarianceVerifiers || []).filter((rel) => !fs.existsSync(path.join(root, rel))).join(', '));
}

const r21 = frozenByKey.get('R2_1_ACTIVE_CONSTRAINT_DECISION_INTEGRITY');
check('R2.1 freeze spans typed constraint producer through state, planning, final realization, and observability', [
  'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts',
  'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts',
  'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
].every((rel) => (r21?.dependencyPaths || []).includes(rel)));
check('R2.1 freeze owns active-constraint decision integrity verifier', (r21?.mandatoryVerifiers || []).includes('tools/customer-service-v520/verify-v520-r2-1-active-constraint-decision-integrity.cjs'));
const r23 = frozenByKey.get('R2_3_RESPONSE_EFFORT_DEPTH');
check('R2.3 freeze spans ResponseTarget through final realization, ordinary Generation, execution, and reply observability', [
  'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
].every((rel) => (r23?.dependencyPaths || []).includes(rel)));
const r24 = frozenByKey.get('R2_4_CONTEXTUAL_EXTENSION_STOP_WHEN_ENOUGH');
check('R2.4 freeze spans ResponseTarget/final realization through Given-New, Generation, stop realization, and presentation-only delivery', [
  'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts',
].every((rel) => (r24?.dependencyPaths || []).includes(rel)));

const p0 = frozenByKey.get('P0_REFUSAL_GENERATION_SEND');
check('P0 refusal freeze protects the full Runtime dependency prefix', (p0?.dependencyPrefixes || []).includes('src/modules/customer-service-agent/runtime/'));
check('P0 refusal freeze owns the Generation Send seal', (p0?.mandatoryVerifiers || []).includes('tools/customer-service-v520/verify-v520-generation-send-authority-seal.cjs'));
const refusalContinuation = frozenByKey.get('R2_2_CUSTOMER_REFUSAL_USEFUL_SERVICE_CONTINUATION');
check('R2.2 refusal/useful-service freeze spans understanding, planning, Conformance, completion state, candidate selection, and Delivery', [
  'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts',
  'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts',
  'src/modules/customer-service-agent/runtime/behavior/customer-service-behavior-memory.util.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
].every((rel) => (refusalContinuation?.dependencyPaths || []).includes(rel)));
check('R2.2 refusal/useful-service freeze owns Canonical Conformance + Generation Send mandatory verifiers',
  (refusalContinuation?.mandatoryVerifiers || []).includes('tools/customer-service-v520/verify-v520-canonical-semantic-conformance.cjs')
  && (refusalContinuation?.mandatoryVerifiers || []).includes('tools/customer-service-v520/verify-v520-generation-send-authority-seal.cjs'));
const entity = frozenByKey.get('R2_2_ENTITY_CONTINUITY');
check('Entity Continuity closure spans typed producer, state transport, and Grounding consumer', [
  'src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts',
  'src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts',
  'src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts',
  'src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts',
  'src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts',
].every((rel) => (entity?.dependencyPaths || []).includes(rel)));
check('Entity Continuity freeze owns its typed contextual verifier', (entity?.mandatoryVerifiers || []).includes('tools/customer-service-v520/verify-v520-r2-2-contextual-grounded-referent-continuity.cjs'));
const seam = frozenByKey.get('CONFORMANCE_SURFACE_SEAM');
check('Conformance Surface Seam closure spans enforcement through Send surface', [
  'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
].every((rel) => (seam?.dependencyPaths || []).includes(rel)));
check('Conformance Surface Seam freeze owns canonical conformance verifier', (seam?.mandatoryVerifiers || []).includes('tools/customer-service-v520/verify-v520-canonical-semantic-conformance.cjs'));

const runtimeFiles = walk(path.join(root, 'src/modules/customer-service-agent/runtime')).filter((f) => f.endsWith('.ts'));
const runtimeLeaks = runtimeFiles.filter((file) => /release-regression-firewall|hve-minimal-runtime-release-firewall/i.test(fs.readFileSync(file, 'utf8')));
check('Runtime never references release firewall', runtimeLeaks.length === 0, runtimeLeaks.map((f) => path.relative(root, f)).join(', '));
const sourceFiles = walk(path.join(root, 'src')).filter((file) => /\.(?:ts|js|cjs|mjs)$/.test(file));
const toolLeaks = sourceFiles.filter((file) => /tools[\\/]customer-service-v520/i.test(fs.readFileSync(file, 'utf8')));
check('production source never imports verifier tools', toolLeaks.length === 0, toolLeaks.map((f) => path.relative(root, f)).join(', '));
const always = fixture.offlineVerifierPolicy?.always || [];
check('minimal-runtime verifier is always required', always.includes('tools/customer-service-v520/verify-v520-minimal-runtime-architecture.cjs'));
check('generation-send authority seal is always required', always.includes('tools/customer-service-v520/verify-v520-generation-send-authority-seal.cjs'));
check('human-realization goal verifier is always required', always.includes('tools/customer-service-v520/verify-v520-human-realization-goal-alignment.cjs'));
check('business knowledge verifier is always required', always.includes('tools/customer-service-v520/verify-v520-t3-business-knowledge.cjs'));
check('all configured verifiers exist', always.every((rel) => fs.existsSync(path.join(root, rel))), always.filter((rel) => !fs.existsSync(path.join(root, rel))).join(', '));
const criticalPaths = fixture.riskPolicy?.criticalRuntimePaths || [];
check('HVE execution is critical runtime', criticalPaths.some((rel) => rel.endsWith('customer-service-hve3-execution.service.ts')));
check('Human Realization is protected as critical runtime input', criticalPaths.some((rel) => rel.endsWith('customer-service-human-turn-realization.ts')));
check('Conversation State is protected as critical runtime input', criticalPaths.some((rel) => rel.endsWith('customer-service-conversation-state.reducer.ts')));
const runner = fs.readFileSync(path.join(__dirname, 'run-v520-release-regression-firewall.cjs'), 'utf8');
check('runner blocks critical release without live traces', /Critical Runtime change has no live HVE smoke evidence/.test(runner));
check('runner validates controlled availability and selected-none', /controlledAvailability/.test(runner) && /selectedNone/.test(runner));
check('runner has no framework-neutral verifier retry layer', !/FRAMEWORK_NEUTRAL|frameworkNeutralRetry/.test(runner));
check('runner computes frozen capability impacts from dependency closure', /function frozenCapabilityImpacts/.test(runner));
check('runner explicitly invalidates historical frozen PASS on closure impact', /PRIOR_PASS_INVALIDATED/.test(runner));
check('runner requires capability-attributed Fresh Live evidence', /--capability-live-trace/.test(runner));
check('runner requires semantic/output variance evidence for language-sensitive freezes', /--capability-variance-evidence/.test(runner) && /validateCapabilityVarianceEvidence/.test(runner));
check('runner prevents one trace from counting as multiple semantic variants', /duplicate Reply Trace/.test(runner) && /distinct Reply Trace/.test(runner));
check('runner does not infer semantic equivalence from natural-language wording', /Semantic equivalence is declared by human\/typed-verifier evidence; Runtime does not infer equivalence from wording/.test(runner));
check('variance verifier set is automatically included in impacted release Gate', /semanticVarianceVerifiers/.test(runner));
check('runner supports impact-only architecture checks without executing release verifiers', /--impact-only/.test(runner) && /args\.impactOnly/.test(runner));
function impactOutput(file) {
  const proc = cp.spawnSync(process.execPath, [
    path.join(__dirname, 'run-v520-release-regression-firewall.cjs'),
    '--changed-file', file,
    '--impact-only',
  ], { cwd: root, encoding: 'utf8' });
  return { status: proc.status, output: `${proc.stdout || ''}\n${proc.stderr || ''}` };
}
const understandingImpact = impactOutput('src/modules/customer-service-agent/runtime/understanding/customer-service-deep-recognition.service.ts');
check('typed Understanding change invalidates P0 refusal and Entity Continuity freezes', understandingImpact.status === 0
  && understandingImpact.output.includes('P0_REFUSAL_GENERATION_SEND')
  && understandingImpact.output.includes('R2_2_ENTITY_CONTINUITY')
  && understandingImpact.output.includes('R2_1_ACTIVE_CONSTRAINT_DECISION_INTEGRITY')
  && understandingImpact.output.includes('PRIOR_PASS_INVALIDATED'), understandingImpact.output);

const answerTargetImpact = impactOutput('src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts');
check('ResponseTarget change invalidates R2.3 effort-depth and R2.4 contextual-stop freezes', answerTargetImpact.status === 0
  && answerTargetImpact.output.includes('R2_3_RESPONSE_EFFORT_DEPTH')
  && answerTargetImpact.output.includes('R2_4_CONTEXTUAL_EXTENSION_STOP_WHEN_ENOUGH')
  && answerTargetImpact.output.includes('PRIOR_PASS_INVALIDATED'), answerTargetImpact.output);

const conformanceImpact = impactOutput('src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts');
check('Conformance change invalidates P0 refusal, refusal/useful-service continuation, and Conformance Surface Seam freezes', conformanceImpact.status === 0
  && conformanceImpact.output.includes('P0_REFUSAL_GENERATION_SEND')
  && conformanceImpact.output.includes('R2_2_CUSTOMER_REFUSAL_USEFUL_SERVICE_CONTINUATION')
  && conformanceImpact.output.includes('CONFORMANCE_SURFACE_SEAM')
  && conformanceImpact.output.includes('PRIOR_PASS_INVALIDATED'), conformanceImpact.output);
const planImpact = impactOutput('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts');
check('Interaction-plan change invalidates refusal/useful-service continuation freeze', planImpact.status === 0
  && planImpact.output.includes('R2_2_CUSTOMER_REFUSAL_USEFUL_SERVICE_CONTINUATION')
  && planImpact.output.includes('PRIOR_PASS_INVALIDATED'), planImpact.output);
const completionStateImpact = impactOutput('src/modules/customer-service-agent/runtime/behavior/customer-service-behavior-memory.util.ts');
check('Completion-state change invalidates refusal/useful-service continuation freeze', completionStateImpact.status === 0
  && completionStateImpact.output.includes('R2_2_CUSTOMER_REFUSAL_USEFUL_SERVICE_CONTINUATION')
  && completionStateImpact.output.includes('PRIOR_PASS_INVALIDATED'), completionStateImpact.output);
const docImpact = impactOutput('README.md');
check('documentation-only change does not fabricate frozen capability impact', docImpact.status === 0
  && docImpact.output.includes('Frozen capability dependency-closure impacts: none'), docImpact.output);
console.log(`\nRegression Firewall Architecture: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
