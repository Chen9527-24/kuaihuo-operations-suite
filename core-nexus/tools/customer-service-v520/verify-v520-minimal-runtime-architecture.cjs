#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
const hve = read('src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts');
const sim = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const mod = read('src/modules/customer-service-agent/customer-service-agent.module.ts');
const delivery = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-delivery-arbiter.ts');
const deliveryPlanner = read('src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts');
const generator = read('src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts');
const foundationQuality = read('src/modules/customer-service-agent/admin/foundation/templates/customer-service-quality-rule.template.ts');
const foundationRoles = read('src/modules/customer-service-agent/admin/foundation/templates/customer-service-foundation.template.ts');
const foundationIntents = read('src/modules/customer-service-agent/admin/foundation/templates/customer-service-intent-definition.template.ts');

const runtimeReply = read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const executionType = read('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-execution.type.ts');
const simDto = read('src/modules/customer-service-agent/runtime/simulation/dto/compile-simulation.dto.ts');
const human = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const conformance = read('src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts');
// String-scanning loops are not model retry loops. Inspect executable calls and
// their ancestors, not comments or arbitrary `while` tokens anywhere in the file.
const conformanceAst = ts.createSourceFile('conformance.ts', conformance, ts.ScriptTarget.Latest, true);
const modelCalls = [], retryCalls = [];
function walk(node) {
  if (ts.isCallExpression(node)) {
    if (node.expression.getText(conformanceAst) === 'this.modelGateway.generate') modelCalls.push(node);
    if (/(?:^|\.)(?:retry|conform)$/.test(node.expression.getText(conformanceAst))) retryCalls.push(node);
  }
  ts.forEachChild(node, walk);
}
walk(conformanceAst);
function isInsideLoop(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isWhileStatement(parent) || ts.isDoStatement(parent) || ts.isForStatement(parent)
      || ts.isForOfStatement(parent) || ts.isForInStatement(parent)) return true;
  }
  return false;
}
const removalOwner = conformanceAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'applyExactSubstringRemovals');
const removalSource = removalOwner?.getText(conformanceAst) || '';
const removed = [
  'src/modules/customer-service-agent/runtime/compliance/customer-service-plan-compliance.service.ts',
  'src/modules/customer-service-agent/runtime/compliance/customer-service-hard-compliance.service.ts',
  'src/modules/customer-service-agent/runtime/compliance/customer-service-critical-claim-verifier.ts',
  'src/modules/customer-service-agent/runtime/compliance/customer-service-semantic-fulfillment.ts',
  'src/modules/customer-service-agent/runtime/compliance/customer-service-claim-authority-verifier.ts',
  'src/modules/customer-service-agent/runtime/compliance/customer-service-human-realization-floor.ts',
  'src/modules/customer-service-agent/runtime/quality/customer-service-quality-gate.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-reply-repair.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-candidate-salvage.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-safe-reply-fallback.ts',
];
check('HVE declares minimal Runtime plus the one V12-approved Canonical Semantic Conformance layer', hve.includes("runtimeArchitecture: 'MINIMAL_RUNTIME_V1_WITH_CANONICAL_SEMANTIC_CONFORMANCE_V1'"));
check('HVE keeps non-empty Generation as the default Send path while merchant-evidence proof failure is fact-safe', hve.includes("sendAuthority: 'PRIMARY_NON_EMPTY_OR_GROUNDED_CONFORMANCE_DEGRADATION'") && hve.includes("selectionPolicy: 'PRIMARY_NON_EMPTY_WITH_GROUNDED_CONFORMANCE_FAILSAFE'") && hve.includes('semanticAuthorizationEnforcement: true') && hve.includes('shouldUseGroundedConformanceFailureDegradation') && hve.includes("span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'"));
check('HVE has no quality/style/humanity post-generation veto; only Canonical semantic authorization enforcement is explicit', hve.includes('postGenerationLanguageVeto: false') && hve.includes('semanticAuthorizationEnforcement: true'));
check('HVE owns zero constrained regeneration budget', hve.includes('maxConstrainedRegenerations: 0') && hve.includes('constrainedRegenerationCount: 0'));
check('HVE never calls generator.rewrite', !/\.rewrite\s*\(/.test(hve));
check('HVE does not import QualityGate', !/customer-service-quality-gate/.test(hve));
check('HVE does not import PlanCompliance', !/customer-service-plan-compliance/.test(hve));
check('HVE does not import HardCompliance', !/customer-service-hard-compliance/.test(hve));
check('HVE does not import CriticalClaim verifier', !/customer-service-critical-claim-verifier/.test(hve));
check('HVE does not import SemanticFulfillment', !/customer-service-semantic-fulfillment/.test(hve));
check('HVE does not import ClaimAuthority', !/customer-service-claim-authority/.test(hve));
check('HVE does not import HumanRealizationFloor gate', !/customer-service-human-realization-floor/.test(hve));
check('V12 conformance owns exactly one bounded model call and no retry loop', conformanceAst.parseDiagnostics.length === 0 && modelCalls.length === 1 && !isInsideLoop(modelCalls[0]) && retryCalls.length === 0 && modelCalls[0].arguments[0]?.getText(conformanceAst).includes('maxTokens: classifierMaxTokens') && modelCalls[0].arguments[0]?.getText(conformanceAst).includes('timeoutMs:'), 'one bounded executable gateway call outside loops; no recursive conform/retry calls');
check('V12 conformance can only apply deterministic exact-substring deletion and cannot free-rewrite', !!removalOwner && ['atom.exactText !== removal.exactText','CONFORMANCE_REMOVAL_NOT_RUNTIME_OWNED_ATOM','CONFORMANCE_REMOVAL_RANGES_OVERLAP','content.slice(0, item.start) + content.slice(item.end)'].every(token => removalSource.includes(token)) && conformance.includes('const correction = applyExactSubstringRemovals(') && !/\.rewrite\s*\(/.test(conformance) && !/from ['"][^'"]*(?:quality-gate|humanizer|planner)[^'"]*['"]/.test(conformance));
check('V12 conformance cannot create Acts/facts/Grounding or retry', ['canCreateActs: false','canCreateFacts: false','canCreateGrounding: false','canRetry: false'].every((token) => conformance.includes(token)));
check('old customer send-authority / repair source files are physically removed', removed.every((rel) => !fs.existsSync(path.join(root, rel))), removed.filter((rel) => fs.existsSync(path.join(root, rel))).join(', '));
check('Nest module no longer registers removed send judges', !/(CustomerServicePlanComplianceService|CustomerServiceHardComplianceService|CustomerServiceCriticalClaimVerifier)/.test(mod));
check('simulation passes only contract and generation request into HVE execution', /hve3Execution\.execute\(\{\s*contract:\s*compiled\.contract,\s*generateReply:/s.test(sim) && !/hve3Execution\.execute\(\{[\s\S]{0,240}(?:qualityRules|allowRewrite|understanding):/s.test(sim));
check('human diagnostics are isolated from Send by try/catch', /private buildHumanDiagnostics[\s\S]*?try\s*\{[\s\S]*?catch\s*\(/.test(hve) && hve.includes("authority: 'DIAGNOSTIC_ONLY'"));
check('diagnostic failure explicitly cannot affect selection/final/delivery', ['affectsSelectionEligibility: false','affectsFinalCandidate: false','affectsDelivery: false'].every((token) => hve.includes(token)));
check('Human Realization contract remains in Runtime', /resolveCustomerServiceHumanTurnRealization|humanTurnRealization/.test(human));
check('generation prompt selectively exposes Human Presence while hiding planner scaffolding', /humanPresence:\s*compileCustomerServiceFinalModelFacingHumanTurn\(contract, frame\)/.test(prompt) && /FINAL_MODEL_FACING_HUMAN_TURN_V1/.test(fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'),'utf8')) && !/humanTurnRealization:\s*project|interaction:\s*frame\.interaction|acts:\s*frame\.acts/.test(prompt));
check('generation prompt no longer asks model to decide bubble count', !/一条或多条消息|最终气泡上限与发送节奏/.test(prompt));
check('raw paragraph fallback no longer creates generated message units', !/PARAGRAPH_FALLBACK/.test(generator));
check('AUTO presentation keeps semantic ownership upstream while Delivery only consumes explicit HVE_REPLY_V2 presentation intent', deliveryPlanner.includes('Generation owns 1/N message boundaries through HVE_REPLY_V2') && deliveryPlanner.includes('normalizeExplicitPresentationSegments') && deliveryPlanner.includes('不做后处理断句') && !deliveryPlanner.includes("typedSegmentation === 'SINGLE'"));
check('model-facing Human Realization does not become a generic content/epistemic governor', !/situatedJudgment:\s*\{/.test(prompt) && !/answerAuthority:\s*frame\.answerAuthority/.test(prompt) && prompt.includes('一般知识和普通话题默认可以正常回答'));
const finalAuthoritySrc = fs.readFileSync(path.join(root, 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts'),'utf8');
check('model-facing frame removes raw HumanTurn planner/shape scaffolding while allowing selected response-target depth', !/needAlignment:\s*human\.needAlignment|turnShape:\s*human\.turnShape|turnComposition:\s*|modelFacingParticipation|modelFacingAdaptation|segmentPlan|surfaceBudget:\s*human\.surfaceBudget/.test(prompt.slice(prompt.indexOf('function buildHveModelFacingGenerationFrame'), prompt.indexOf('function projectModelFacingSpeaker'))) && /requestedSpecificity:\s*responseTarget\.requestedSpecificity/.test(finalAuthoritySrc));
check('generation prompt uses semantic final realization without Runtime surface amount/order authority', prompt.includes('humanPresence.realization') && prompt.includes('控制类 Act 与 completion 是 Canonical WHAT 的执行边界') && prompt.includes('不规定客户可见措辞、字数、句数、顺序、节奏或消息数量') && prompt.includes('首个实质 customer-visible unit 必须绑定指定 Required Act') && prompt.includes('这不创建新 Act，也不规定固定措辞、长度、候选数或消息数量') && finalAuthoritySrc.includes('noUnauthorizedIndependentContribution: true') && finalAuthoritySrc.includes('canonicalPlan:') && finalAuthoritySrc.includes('completion: frame.interaction.completion') && !/STOP_UNLESS_A_SELECTED_COMPONENT_REMAINS|support\s*:|surfaceBudget\.completionPolicy/.test(finalAuthoritySrc) && !/对话是逐轮参与，不是一次性报告|不要机械逐项扫描、逐项给方案|一到两句话|一至三句|最多\s*[1234567890一二三四五六七八九十]+\s*句|固定\s*[1234567890一二三]+\s*(?:条|气泡)/.test(prompt));
check('future foundation seeds no longer ship default reply length/sentence budgets', !/reply-max-length|reply-sentence-budget|MAX_SENTENCES|低风险单主题.*句|简单问题一到两句话|maxSentences:\s*3/.test([foundationQuality, foundationRoles, foundationIntents].join('\n')));
check('Final Candidate identity still seals generated text', /sealCustomerServiceFinalCandidate/.test(hve) && /GENERATED_SELECTED_DELIVERED_SAME_CANDIDATE/.test(hve));
check('Delivery still verifies lexical text freeze', /NON_WHITESPACE_LEXICAL_CONTENT_EXACT/.test(delivery));
check('customer-visible degradation is limited to Generation availability or proposition-owned merchant-evidence proof failure, never generic quality veto', /buildModelAvailabilityDegradation/.test(hve) && /buildSemanticConformanceDegradation/.test(hve) && /shouldUseGroundedConformanceFailureDegradation/.test(hve) && /LOCAL_PROTOCOL_ERROR/.test(hve) && /INVALID_RESPONSE/.test(hve) && /UNAVAILABLE/.test(hve) && /MERCHANT_ENTITY_EVIDENCE_REQUIRED/.test(hve) && /planSatisfied:\s*false/.test(hve) && !/COMPLIANCE_CANDIDATE_EXHAUSTED|CONTROLLED_AVAILABILITY_COMPLIANCE_EXHAUSTED|NO_SELECTION_ELIGIBLE_CANDIDATE/.test(hve));
check('model availability fallback cannot masquerade as semantic repair', hve.includes('semanticFallbackUsed: false') && hve.includes("fallbackReason: 'HVE3_MODEL_AVAILABILITY_DEGRADATION'"));
check('legacy repair/salvage/fallback are not imported by HVE execution', !/(reply-repair|candidate-salvage|safe-reply-fallback)/.test(hve));
check('formal customer runtime now defaults to HVE_ACTIVE', /isolatedTestSession \? \(effectiveDto\.hveExecutionLane \|\| 'HVE3_CANDIDATE'\) : 'HVE_ACTIVE'/.test(runtimeReply));
check('execution envelope only exposes HVE candidate/active lanes', executionType.includes("'HVE3_CANDIDATE'") && executionType.includes("'HVE_ACTIVE'") && !executionType.includes('LEGACY_AC1') && !executionType.includes('HVE3_SHADOW'));
check('plan unavailability stays a structural HVE condition instead of routing to legacy', executionType.includes("reasonCode: !planAvailable") && executionType.includes("'HVE_PLAN_UNAVAILABLE'"));
check('simulation DTO exposes only HVE Candidate/Active lanes', simDto.includes("default: 'HVE_ACTIVE'") && simDto.includes("'HVE3_CANDIDATE'") && simDto.includes("'HVE_ACTIVE'") && !simDto.includes('LEGACY_AC1') && !simDto.includes('HVE3_SHADOW'));
check('legacy reply repair/quality providers are physically absent from Nest module', !/(CustomerServiceReplyRepairService|CustomerServiceQualityGate)/.test(mod));
console.log(`\nMinimal Runtime Architecture: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
