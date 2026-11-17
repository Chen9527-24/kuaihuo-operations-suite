#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(rel) : [rel];
});

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}`); }
}

const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const authority = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
const hve3 = read('src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts');
const delivery = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-delivery-arbiter.ts');
const planner = read('src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts');
const generator = read('src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts');
const simulation = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const runtimeSourceRepo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-runtime-source.repository.ts');
const executeDto = read('src/modules/customer-service-agent/runtime/simulation/dto/execute-simulation.dto.ts');
const compiler = read('src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts');
const languagePolicy = read('src/modules/customer-service-agent/shared/context/customer-service-language-policy.util.ts');
const kernel = read('src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts');
const retiredBehavior = read('src/modules/customer-service-agent/runtime/behavior/customer-service-human-behavior-resolver.service.ts');
const retiredPruner = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-surface-pruner.ts');
const srcFiles = walk('src/modules/customer-service-agent').filter((f) => /\.(ts|tsx|js|cjs)$/.test(f));
const productionSource = srcFiles.map((f) => `${f}\n${read(f)}`).join('\n');

check('current kernel preserves P0-1 Runtime expression responsibility clearance', kernel.includes('V1.50 Runtime Expression Responsibility Clearance'));
check('current-turn model-facing WHAT remains FINAL_MODEL_FACING_HUMAN_TURN_V1', authority.includes("authority: 'FINAL_MODEL_FACING_HUMAN_TURN_V1'") && prompt.includes('compileCustomerServiceFinalModelFacingHumanTurn(contract, frame)'));
check('Role -> Identity Prompt remains persisted configuration while typed Persona surface is the sole ordinary model-facing HOW projection', authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && authority.includes("authority: 'STRUCTURED_PERSONA_SURFACE_ONLY_V1'") && prompt.includes('PERSONA_SURFACE_PROFILE='));
check('the remaining model-facing pcPolicy path is constraint-only and has an explicit Language Policy owner', prompt.includes('languagePolicyConstraints: [...contract.businessContext.languagePolicyConstraints]') && compiler.includes('languagePolicyConstraints: buildLanguagePolicyConstraintInstructions(businessContext.languagePolicies)') && languagePolicy.includes('export function buildLanguagePolicyConstraintInstructions'));
check('PC Language Policy styleGuidance is retained for compatibility but no longer compiled as Persona HOW', languagePolicy.includes('styleGuidance') && languagePolicy.includes('does not translate free-form style guidance into prompt text') && languagePolicy.includes("action: 'PROMPT_ONLY' | 'REMOVE' | 'REPLACE' | 'MODEL_REWRITE' | 'BLOCK' | 'WARN'") && !languagePolicy.includes('applyHveComplianceLanguageRules') && !languagePolicy.includes('applyMechanicalLanguageRules') && !languagePolicy.includes('classifyCustomerServiceLanguageRuleAuthority'));
check('legacy HOW/HOW-MUCH fields are absent from final model-facing projection', !/(rolePresence\s*:|texture\s*:|antiAiCadence\s*:|surfaceBudget\s*:|turnShape\s*:|roleBehavior\s*:|expressionPlan\s*:|openingBias\s*:|completionCadence\s*:|maxSentences\s*:|maxValueUnits\s*:)/.test(authority));
check('ordinary Runtime prompt no longer carries v1.48 natural-participation/output-amount micro-guidance', !/(对话是逐轮参与，不是一次性报告|不要机械逐项扫描、逐项给方案|不要重播已经接受的旧建议来证明价值|连续性应像亲历过这段交流一样被默默使用|不要复述、总结或列举历史来证明“我记得”)/.test(prompt));
check('continuity context is explicitly read-only and cannot become expression authority', prompt.includes('仅是只读连续事实') && prompt.includes('不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则'));
check('source-bound summary keeps factual provenance/schema but no Runtime naturalness/length directive', prompt.includes('SOURCE_UNITS') && prompt.includes('evidenceSpans') && !prompt.includes('不要为了格式把总结写得机械或过短'));
check('ordinary model-facing frame is a least-privilege transport projection, not the full semantic/audit frame', prompt.includes('const modelFrame = buildHveModelFacingGenerationFrame(contract, frame)') && prompt.includes('JSON.stringify(projectHveModelFacingContextTransport(modelFrame))') && !prompt.includes('JSON.stringify(frame)'));
check('ordinary model-facing frame does not project legacy voice/service realization/rich HumanTurn HOW objects', !/return\s*\{[\s\S]*?schemaVersion:\s*2,[\s\S]*?(voice\s*:|serviceRealization\s*:|realizationPreferences\s*:|turnShape\s*:|surfaceBudget\s*:|antiAiCadence\s*:)/.test(prompt.slice(prompt.indexOf('function buildHveModelFacingGenerationFrame'), prompt.indexOf('function normalizeContinuityEvidenceText'))));
check('historical HumanBehaviorResolver remains a non-production tombstone', retiredBehavior.includes('RETIRED FROM PRODUCTION RUNTIME') && !/class CustomerServiceHumanBehaviorResolver|@Injectable/.test(retiredBehavior));
check('historical surface pruner remains a non-production tombstone', retiredPruner.includes('RETIRED') && retiredPruner.includes('No Runtime code imports this file'));
check('production source has no imports of retired HumanBehaviorResolver or surface pruner', !/from\s+['"][^'"]*customer-service-human-behavior-resolver/.test(productionSource) && !/from\s+['"][^'"]*customer-service-human-turn-surface-pruner/.test(productionSource));
check('historical qualityRules no longer load through production Simulation Runtime', !simulation.includes('qualityRules') && !simulation.includes('findEnabledQualityRules'));
check('dead Runtime qualityRules source accessor is deleted while admin quality-rule subsystem can remain independent', !runtimeSourceRepo.includes('findEnabledQualityRules'));
check('allowRewrite is compatibility-only and no internal Runtime caller projects it as active behavior', executeDto.includes('历史兼容字段；Runtime 不再执行质量重写，此值被忽略') && (productionSource.match(/allowRewrite/g) || []).length === 1);
check('legacy post-generation quality/coverage fields remain disabled; Semantic Conformance stays authorization-only with a Grounded proof-path fail-safe', hve3.includes('semanticFulfillmentStatus: null') && hve3.includes('targetCoverageStatus: null') && hve3.includes("selectionPolicy: 'PRIMARY_NON_EMPTY_WITH_GROUNDED_CONFORMANCE_FAILSAFE'") && hve3.includes('semanticAuthorizationEnforcement: true') && hve3.includes('shouldUseGroundedConformanceFailureDegradation') && hve3.includes('postGenerationLanguageVeto: false'));
check('Humanity/Surface evaluation remains diagnostics-only', hve3.includes('buildHumanDiagnostics') && hve3.includes('softHumanity') && hve3.includes('surfaceCompliance') && !/if\s*\([^\n]*(softHumanity|surfaceCompliance)[^\n]*\)\s*(?:throw|return)/.test(hve3));
check('Final Delivery is presentation-only and quality/humanity cannot veto non-empty text', delivery.includes('Final Delivery is presentation-only') && !/if\s*\([^\n]*input\.quality|throw[^\n]*(quality|humanity|texture|cadence)/i.test(delivery));
check('Delivery preserves model-owned HVE segments and has no role/domain/punctuation/length segmentation planner', planner.includes('GENERATION_PRESENTATION_INTENT') && !/roleCode|industryCode|splitNaturalPresentationParagraphs|splitFinalFollowUpQuestion|splitThresholdChars|maxSegments/.test(planner));
check('generation recovery remains availability/protocol recovery, not quality rewrite', generator.includes('模型可用性恢复') && generator.includes('rewriteAttempted: false') && generator.includes("candidateQualityStatus: 'NOT_RUN'"));
check('no new P0-1 role/domain/test-sentence/fixed-output special case exists', !/(碎花裙|咬沙发|柯基|女装客服|SaaS客服|外卖员|牛仔裤|亚麻|fixed.{0,12}(chars|sentences|bubbles)|固定.{0,8}(字数|句数|气泡数))/i.test(prompt + authority + hve3 + delivery + planner));
check('no new expression Planner/Gate/Judge/Repair/Retry/Fallback authority is introduced', !/(HumanizationPlanner|HumanizationGate|HumanizationJudge|PersonaRepair|SurfaceRewrite|HumanizationRetry|ExpressionFallback)/i.test(prompt + authority));

console.log(`\nP0-1 Runtime Expression Responsibility Clearance: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
