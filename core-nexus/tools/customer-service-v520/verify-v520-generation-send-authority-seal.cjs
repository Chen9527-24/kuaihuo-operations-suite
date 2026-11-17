#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const rel = {
  gateway: 'src/modules/customer-service-agent/infrastructure/model-gateway/customer-service-model-gateway.service.ts',
  generator: 'src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts',
  conformance: 'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts',
  conformanceType: 'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.type.ts',
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  hve3: 'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  candidate: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-candidate.ts',
  delivery: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-delivery-arbiter.ts',
  planner: 'src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts',
  summary: 'src/modules/customer-service-agent/runtime/generation/customer-service-source-bound-summary-protocol.ts',
  surface: 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-surface-compliance.ts',
  pruner: 'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-surface-pruner.ts',
  runtime: 'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
  simulation: 'src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts',
  autoReplies: 'src/modules/auto-replies/auto-replies.service.ts',
  kernel: 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
  behavior: 'src/modules/customer-service-agent/runtime/behavior/customer-service-behavior-memory.util.ts',
};
const src = Object.fromEntries(Object.entries(rel).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), 'utf8')]));
let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}`); }
}
function transpile(file, code) {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: file,
  });
}
function allTsUnder(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...allTsUnder(full));
    else if (entry.isFile() && /\.ts$/.test(entry.name)) result.push(full);
  }
  return result;
}

// 1) Lowest-level model availability truth: provider non-empty content is success.
check('Model Gateway derives status SUCCESS from non-empty content before responseValid/truncation branches', /const status:[\s\S]{0,260}= content\s*\? 'SUCCESS'/.test(src.gateway));
check('Model Gateway ok is exactly Boolean(non-empty trimmed content)', src.gateway.includes('ok: Boolean(content)'));
check('Model Gateway errorMessage is cleared whenever content exists', src.gateway.includes('errorMessage: content ? null : emptyContentMessage'));
check('Provider responseValid cannot turn non-empty content into INVALID_RESPONSE', /const status:[\s\S]{0,120}content\s*\? 'SUCCESS'\s*:\s*!result\.responseValid/.test(src.gateway));

// 2) Generation: metadata/protocol cannot become model-availability authority.
check('Generator preserves non-empty initial customer-visible content unless it is a malformed machine envelope', src.generator.includes('initialProtocolFailure') && src.generator.includes('if (initial.ok && !initialProtocolFailure)') && src.generator.includes('return normalizeStructuredHveGeneration'));
check('Generator has primary + structured recovery + one plain transport availability rescue call', (src.generator.match(/modelGateway\.generate\(/g) || []).length === 3);
check('Protocol failure recovery remains structural-first; plain rescue is availability-only after zero recoverable provider text', src.generator.includes('hasMalformedOrdinaryHveProtocolEnvelope') && src.generator.includes('deterministic protocol') && src.generator.includes('recoverFailedProviderVisibleGeneration') && src.generator.includes('buildPlainAvailabilityRecovery') && (src.generator.match(/modelGateway\.generate\(/g) || []).length === 3);
check('Ordinary Presentation V2 preserves non-empty provider-visible text', src.generator.includes('normalizeOrdinaryHveChatPresentation') && src.generator.includes('const providerText = generation.draft?.trim() || null'));
check('Summary provenance projection falls back to raw provider text instead of null', src.generator.includes('summaryTransformation.visibleText.trim() || generation.draft.trim()'));
check('Recovery explanation distinguishes structured recovery from plain transport availability rescue', src.generator.includes('结构化模型可用性恢复调用') && src.generator.includes('plain transport availability rescue'));
check('Ordinary HVE and Summary both use provider JSON-object mode while Runtime keeps schema normalization', src.generator.includes('jsonMode: usesStructuredHveJsonProtocol(contract)') && src.generator.includes("['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane))") && src.generator.includes('jsonMode: recoveryRequiresStructuredProtocol'));
check('Plain availability rescue changes transport only and remains Canonical/Conformance-bound', src.generator.includes("jsonMode: false") && src.generator.includes("source: 'PLAIN_MODEL_RECOVERY'") && src.generator.includes("source: 'PLAIN_RECOVERY'") && src.hve3.includes("'PLAIN_MODEL_RECOVERY'") && src.hve3.includes("generation.protocolPreservation?.applied") && src.hve3.includes("source: 'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE'"));
check('Plain availability rescue prompt is current-turn Canonical/knowledge projection and never a second planner', src.prompt.includes('EXISTING_CANONICAL_AVAILABILITY_RECOVERY_ONLY') && src.prompt.includes('transport availability rescue') && src.prompt.includes('只负责把既有语义范围实现成自然客户可见正文') && src.prompt.includes('不要 JSON'));

check('Ordinary prompt uses one HVE_REPLY_V2 output contract and model-owned segments', src.prompt.includes('HVE_REPLY_V2') && src.prompt.includes('只有 segments 数组元素边界才是实际发送消息边界') && !src.prompt.includes('Chat Presentation Contract V2'));
check('Summary prompt states provenance cannot control reply send eligibility', src.prompt.includes('不得改变 SOURCE_UNITS 作为唯一历史事实来源，也不得成为客户回复发送资格'));

// 3) Candidate / diagnostics: no quality-language send veto.
const hve3MissingDraftIndex = src.hve3.indexOf('if (!generated.draft?.trim()) {');
const hve3RecoveryIndex = src.hve3.indexOf('const recovered = recoverNonEmptyProviderGeneration(generated);', hve3MissingDraftIndex);
const hve3RecoveredBranchIndex = src.hve3.indexOf('if (recovered) {', hve3RecoveryIndex);
const hve3AvailabilityIndex = src.hve3.indexOf('return this.buildModelAvailabilityDegradation(input.contract, generated);', hve3RecoveredBranchIndex);
check('HVE3 preserves provider recovery first, then blocks unproven merchant/business fact bodies on checker self-failure or classified proposition-ownership failure', hve3MissingDraftIndex>=0&&hve3RecoveryIndex>hve3MissingDraftIndex&&hve3RecoveredBranchIndex>hve3RecoveryIndex&&hve3AvailabilityIndex>hve3RecoveredBranchIndex&&src.hve3.includes('buildSemanticConformanceDegradation')&&src.hve3.includes('shouldUseGroundedConformanceFailureDegradation')&&src.hve3.includes('hasGroundedCustomerVisibleBindings')&&src.hve3.includes('hasMerchantEvidenceRequiredTurn')&&src.hve3.includes("BUSINESS_FACT_GROUNDING_REQUIRED")&&src.hve3.includes("['LOCAL_PROTOCOL_ERROR', 'INVALID_RESPONSE', 'UNAVAILABLE']")&&src.hve3.includes("span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'")&&src.hve3.includes("trace.decision === 'UNPROVEN_PRESERVED'")&&src.hve3.includes('planSatisfied: false')&&src.hve3.includes('buildFactFreeUsefulServiceFloor')&&src.hve3.includes('FACT_FREE_USEFUL_SERVICE_FLOOR')&&src.hve3.includes("finalReplySource: 'FAILURE_NOTICE'"));
check('Protocol-preserved non-empty provider text becomes a Canonical recovery candidate for Conformance instead of raw Send or LOCAL_PROTOCOL_ERROR', src.hve3.includes("generation.protocolPreservation?.applied")&&src.hve3.includes('projectCanonicalProtocolRecoveryCandidateBindings')&&src.hve3.includes("source: 'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE'")&&src.hve3.includes('projectCustomerServiceCanonicalActsForSemanticFrame(plan.acts)')&&src.conformance.includes("'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE'")&&src.generator.includes("'CANONICAL_PROTOCOL_RECOVERY_CANDIDATE'"));
check('Protocol recovery copies only already-selected Canonical Act/ref ceilings and still requires Conformance before Send', src.hve3.includes('groundingRefs: [...(act.allowedGroundingRefs || [])]')&&!src.hve3.includes('inferProtocolRecovery')&&src.hve3.includes('isCanonicalProtocolRecoveryCandidate(generation)')&&src.hve3.includes('shouldUseGroundedConformanceFailureDegradation'));
check('Classified degradation preserves only trace-proven useful contributions, including FULLY_SUPPORTED grounded spans, without pretending all Required Acts completed', src.hve3.includes('buildAuthorizedNonGroundedPartialReply')&&src.hve3.includes("span.authorized !== true")&&src.hve3.includes("span.classifierResult?.evidenceRequirement === 'MERCHANT_ENTITY_EVIDENCE_REQUIRED'")&&src.hve3.includes("span.classifierResult?.groundingEntailment === 'FULLY_SUPPORTED'")&&src.hve3.includes('canonicalActIds')&&src.hve3.includes('nonGroundedActIds')&&src.hve3.includes('hasUsefulContribution')&&src.hve3.includes("'PARTIAL_SAFE_NON_GROUNDED_RECOVERY'")&&src.hve3.includes('planSatisfied: false'));
check('Post-correction Required-value loss has a typed evidence-boundary recovery path and a source-owned premise channel instead of accepting support-only merchant facts as task completion', src.hve3.includes('buildPostCorrectionRequiredValueDegradation')&&src.hve3.includes('collectTraceProvenSourcePremises')&&src.hve3.includes('CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:')&&src.hve3.includes("'POST_CORRECTION_EVIDENCE_BOUNDARY_WITH_SAFE_VALUE'")&&src.hve3.includes("span.taskDependency === 'MATERIAL_TO_CUSTOMER_TASK'")&&src.hve3.includes("span.violationCode !== 'GROUNDED_EVIDENCE_UNSUPPORTED'")&&src.hve3.includes("act.authorityScope === 'GROUNDED_BUSINESS'")&&src.hve3.includes('sourceContent.includes(excerpt)')&&src.hve3.includes("span.classifierResult?.groundedActionRole"));
check('Normal partial continuation is represented by typed Conformance completion state rather than error-message parsing', src.conformance.includes("status: partialSafeContinuation ? 'PARTIAL_SAFE_CONTINUATION' : 'UNSATISFIED'")&&src.behavior.includes("requiredValueCompletion.status === 'PARTIAL_SAFE_CONTINUATION'")&&!/errorMessage[^\n]{0,160}PARTIAL_SAFE_CONTINUATION|PARTIAL_SAFE_CONTINUATION[^\n]{0,160}errorMessage/.test(src.behavior));
check('Normal partial continuation remains narrow: only an authorized task-material Required GENERAL_GUIDANCE contribution with no merchant/evidence ownership can keep the corrected candidate on the normal path', src.conformance.includes('hasIndependentTaskMaterialSafeContinuation')&&src.conformance.includes("act.authorityScope === 'GENERAL_GUIDANCE'")&&src.conformance.includes("act.type === 'PROVIDE_GENERAL_GUIDANCE'")&&src.conformance.includes("span.taskDependency !== 'MATERIAL_TO_CUSTOMER_TASK'")&&src.conformance.includes("act.necessity === 'REQUIRED'")&&src.conformance.includes("['ANSWER_CONTENT', 'ANSWER_JUDGMENT', 'GUIDANCE_CONTENT']")&&src.conformance.includes("classification.evidenceRequirement !== 'NOT_REQUIRED'")&&src.conformance.includes("classification.merchantReferentRefs.length === 0")&&src.conformance.includes("classification.groundedActionRole === 'NOT_APPLICABLE'")&&src.conformance.includes("classification.groundingSupport.length === 0")&&src.conformance.includes('return { accepted: partialSafeContinuation, generation: correctedWithCompletion, trace }'));
check('partial-support semantic refinement stays inside the single blind Conformance owner and cannot become a Send/recovery rewrite authority', src.conformance.includes('partialSupportSpans is a one-level refinement owned by this SAME classifier call')&&src.conformance.includes('span.partialSupportSpans.length >= 2')&&src.conformance.includes('groundedActionUnitIds.has(unit.unitId)')&&(src.conformance.match(/modelGateway\.generate\(/g)||[]).length===1&&!src.hve3.includes('partialSupportSpans'));
check('Grounded proof failure never raw-sends unproven merchant facts and can preserve already-proven grounded value before using the final useful service floor', !src.hve3.includes('这部分业务信息我现在没法可靠确认，先不把没有确认清楚的内容直接说给你。')&&!src.hve3.includes('这次回复处理出了问题')&&!src.hve3.includes('没能把答复完整给你')&&!src.hve3.includes('这轮有些具体信息还没能可靠确认')&&src.hve3.includes("groundingEntailment === 'FULLY_SUPPORTED'")&&src.hve3.includes('supportRefs.every')&&src.hve3.includes('还能继续往下判断'));
check('Non-empty HVE3 candidate is always selectionEligible', src.hve3.includes('selectionEligible: true'));
check('Non-empty HVE3 candidate selection reason is PRIMARY_CANDIDATE_ACCEPTED', src.hve3.includes("selectedReason: 'PRIMARY_CANDIDATE_ACCEPTED'"));
check('Human/act/surface diagnostics are isolated from Send', src.hve3.includes("authority: 'DIAGNOSTIC_ONLY'") && src.hve3.includes('affectsSelectionEligibility: false') && src.hve3.includes('affectsFinalCandidate: false') && src.hve3.includes('affectsDelivery: false'));
check('Diagnostics errors are caught and cannot erase reply', src.hve3.includes('diagnosticError') && src.hve3.includes('真人感诊断未完成，但不影响客户回复'));
check('No HVE3 quality/texture/humanity branch marks selection ineligible', !/selectionEligible:\s*false|if\s*\([^\n]*(humanity|texture|cadence|quality)[^\n]*\)[\s\S]{0,160}(return|throw|replaceCustomerServiceVisibleContent)/i.test(src.hve3));
check('Final Candidate canonicalization can demote stale metadata without nulling draft', src.candidate.includes('presentationIntent: undefined') && src.candidate.includes('summaryTransformation') && !/canonicalizeCustomerServiceGenerationCandidate[\s\S]{0,1800}draft:\s*null/.test(src.candidate));
check('Dead Final Candidate runtime assertion veto is removed', !src.candidate.includes('assertCustomerServiceFinalCandidateIdentity'));
check('Source-bound Summary protocol declares provenance diagnostic-only, not send eligibility', src.summary.includes('typed provenance validity is diagnostics/provenance evidence only') && src.summary.includes('must never become reply send eligibility'));
check('Surface compliance is explicitly diagnostics-only', src.surface.includes('read-only surface diagnostics') && src.surface.includes('rewrite, retry, Final Candidate or Delivery') && src.surface.includes('can never become Send Authority'));
check('Legacy surface pruner is retired instead of remaining a hidden lexical veto', /RETIRED/.test(src.pruner) && /export \{\};/.test(src.pruner));

// Ensure no other Runtime source imports the retired pruner.
const runtimeTs = allTsUnder(path.join(root, 'src/modules/customer-service-agent'));
const prunerImporters = runtimeTs
  .filter(file => !file.endsWith('customer-service-human-turn-surface-pruner.ts'))
  .filter(file => fs.readFileSync(file, 'utf8').includes('customer-service-human-turn-surface-pruner'));
check('No Runtime source imports retired surface pruner', prunerImporters.length === 0);

// 4) Presentation / Delivery: structure can degrade, text cannot disappear.
check('Delivery planner has no paragraph/punctuation/length splitter', !/splitDraft|splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion/.test(src.planner));
check('Delivery missing structured boundary stays one bubble', src.planner.includes('保留模型非空正文并按单条投递，不做后处理断句'));
check('Delivery consumes explicit Generation presentation intent when valid', src.planner.includes('GENERATION_PRESENTATION_INTENT') && src.planner.includes('normalizeExplicitPresentationSegments'));
check('Final Delivery quality report is not used as a veto', !/if\s*\([^\n]*input\.quality|throw[^\n]*(quality|humanity|texture|cadence)/i.test(src.delivery));
check('Explicit safety block remains the only content hard-stop in Final Delivery', src.delivery.includes("generation.candidateSafetyStatus === 'BLOCKED'"));
check('Candidate seal drift is diagnostic-only at Delivery', src.delivery.includes('DRIFT_DEMOTED_TO_DIAGNOSTIC') && src.delivery.includes('Candidate identity is a regression/integrity diagnostic at this layer, not Send Authority'));
check('Presentation lexical mismatch demotes to exact frozen single bubble instead of throw', src.delivery.includes('展示边界与冻结正文不一致；忽略展示元数据并原样单气泡投递') && !src.delivery.includes('Final Text Freeze 不变量失败：Delivery 修改了冻结正文'));
check('Final Delivery preserves lexical content and demotes stale presentation metadata instead of vetoing text', src.delivery.includes('NON_WHITESPACE_LEXICAL_CONTENT_EXACT') && src.delivery.includes('EXACT_SINGLE_DEMOTION') && !src.delivery.includes('assertCustomerServiceFinalCandidateIdentity'));

// 5) Post-generation persistence / observability cannot retroactively veto a generated reply.
check('Canonical Conversation State persistence already preserves current reply', src.runtime.includes('Canonical Conversation State 保存失败，保留本轮回复'));
check('Reply Trace persistence already preserves current reply', src.runtime.includes('Reply Trace 保存失败，保留原运行回复'));
check('Runtime idempotency completion failure preserves envelope', src.runtime.includes('幂等结果保存异常，但 Final Candidate 已生成；保留本轮客户回复') && src.runtime.includes('return envelope'));
check('Runtime missing Delivery Plan with non-empty text demotes to exact single instead of failing dialogue', src.runtime.includes('Runtime Delivery Plan 缺失，但已有非空模型正文') && src.runtime.includes('buildCustomerServiceExactSingleDeliveryPlan'));
check('Old post-generation idempotency hard failure text is removed', !src.runtime.includes('运行回复已生成，但幂等结果保存失败'));
check('Idempotency failure-record release is best-effort and non-throwing', src.runtime.includes('releaseIdempotencyPersistenceFailure') && src.runtime.includes('本轮仍保留客户回复'));
check('Simulation customer-message persistence is non-veto after generation', src.simulation.includes('客户消息持久化失败，保留已生成回复'));
check('Simulation analysis persistence is non-veto', src.simulation.includes('调优分析记录保存失败，继续返回本轮结果'));
check('Simulation session context persistence is non-veto', src.simulation.includes('调优对话上下文保存失败'));
check('Robot Test session commit failure preserves generated reply', src.autoReplies.includes('Robot Test SESSION_COMMIT 失败，保留已生成回复') && src.autoReplies.includes("'DEGRADED_REPLY_PRESERVED'"));

// 6) Full-chain generalization / governance.
check('Generation kernel preserves Send Authority Seal and v1.43 responsibility correction under current convergence', src.kernel.includes('V1.41 Full-project Send Authority Seal') && src.kernel.includes('V1.43 Generation Responsibility Boundary Correction'));
check('latest kernel preserves no-new-retry/judge and mechanism-generalization governance', src.kernel.includes('Runtime does not re-plan wording, length, segmentation, or humanization after generation'));
check('No current audit source contains test-role/domain branches', !/(碎花裙|咬沙发|柯基|女装客服|SaaS客服|外卖员)/.test(src.generator + src.hve3 + src.planner + src.delivery + src.runtime));

// 7) Syntax/transpile affected executable TypeScript.
for (const key of ['gateway','generator','conformance','conformanceType','prompt','hve3','candidate','delivery','planner','summary','surface','runtime','simulation','autoReplies','kernel','behavior']) {
  const out = transpile(rel[key], src[key]);
  check(`${path.basename(rel[key])} syntax transpiles`, (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length === 0);
}

// 8) Dynamic proof: current HVE requires canonical HVE_REPLY_V2 Act-bound output; legacy/raw may use only the existing recovery call.
function descriptor(type) {
  return { semanticDefinition: `semantic:${type}`, authorityScope: ['RECOMMEND_GROUNDED_ITEM','EXPLAIN_GROUNDED_FACT'].includes(type) ? 'GROUNDED_BUSINESS' : type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_GUIDANCE' : 'PLAN_ONLY' };
}
function projectActs(acts = []) {
  return acts.map((act, index) => ({
    id: act.id || `ACT_${index}`, type: act.type, necessity: act.necessity || 'REQUIRED', semantic: `semantic:${act.type}`,
    authorityScope: descriptor(act.type).authorityScope,
    allowedGroundingRefs: [...new Set((act.grounding || []).filter(g => g.status === 'SATISFIED').flatMap(g => g.evidenceRefs || []))],
    parameters: act.parameters || {},
  }));
}
const generatorJs = transpile(rel.generator, src.generator);
// Exercise the actual partial-delivery owner without exposing a production export.
const partialJs = transpile(rel.hve3, src.hve3 + '\nexport { buildAuthorizedNonGroundedPartialReply as testPartialReply };');
const partialCandidateBox={exports:{},module:{exports:{}},require};
partialCandidateBox.module.exports=partialCandidateBox.exports;
vm.runInNewContext(transpile(rel.candidate,src.candidate).outputText,partialCandidateBox,{filename:rel.candidate});
const partialFrame={
  humanTurnRealization:{turnComposition:{segmentPlan:[]}},
  context:{summarySource:{authority:'NONE',mode:'NONE'}},
  voice:{speaker:null,tone:null,posture:null,delivery:null},
  resolvedRoleExpression:{account:null},
};
const partialBox={exports:{},module:{exports:{}},require:id=>{
  if(id==='@nestjs/common')return {Injectable:()=>target=>target};
  if(id.includes('customer-service-nlg-execution-brief'))return {projectCustomerServiceCanonicalActsForSemanticFrame:projectActs,compileCustomerServiceNlgSemanticFrameV1:()=>partialFrame};
  if(id.includes('customer-service-final-candidate'))return partialCandidateBox.exports;
  if(id.includes('customer-service-prompt-kernel.registry'))return {getCustomerServicePromptKernel:()=>({id:'fixture-generation'})};
  if(id.includes('customer-service-final-realization-authority'))return {compileCustomerServiceFinalModelFacingHumanTurn:()=>({})};
  return {};
}};
partialBox.module.exports=partialBox.exports;
vm.runInNewContext(partialJs.outputText,partialBox,{filename:rel.hve3});
const partialContract={orchestrationPlan:{interactionPlanV2:{acts:[{id:'A1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]}]}}};
const partialSpan=(text,authorized,options={})=>({
  exactText:text,authorized,
  contributionKind:options.contributionKind||'GUIDANCE_CONTENT',
  semanticTarget:options.semanticTarget||'TASK_OR_DOMAIN_FACT',
  taskDependency:options.taskDependency||'MATERIAL_TO_CUSTOMER_TASK',
  realizedGroundingRefs:options.realizedGroundingRefs||[],
  realizedActIds:options.realizedActIds||(authorized?['A1']:[]),
  violationCode:options.violationCode||null,
  classifierResult:{
    evidenceRequirement:options.evidenceRequirement||'NOT_REQUIRED',
    groundingEntailment:'NOT_APPLICABLE',groundedActionRole:'NOT_APPLICABLE',
    groundingBasis:'NOT_APPLICABLE',groundingSupport:[],realizedGroundingRefs:[],
    ...(options.classifierResult||{}),
  },
});
const partialUnitFixture=groups=>({structuredSegments:[{semanticUnits:groups.map(spans=>({content:spans.map(s=>s.exactText).join('')}))}],semanticConformance:{observedDecision:'CLASSIFIED',unitChecks:groups.map((spans,unitIndex)=>({segmentIndex:0,unitIndex,semanticSpans:spans}))}});
const partialFixture=spans=>partialUnitFixture([spans]);
check('partial delivery keeps a whole independently authorized general-help unit',partialBox.exports.testPartialReply(partialContract,partialFixture([partialSpan('先核对订单页显示的状态。',true)]))==='先核对订单页显示的状态。');
const groundedPartialContract={orchestrationPlan:{interactionPlanV2:{acts:[{id:'G1',type:'RECOMMEND_GROUNDED_ITEM',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}]}]}}};
const groundedPartialSpan=partialSpan('优先看测试款A。',true,{
  contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
  evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',realizedGroundingRefs:['K1'],realizedActIds:['G1'],
  classifierResult:{groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'CHOICE_OR_RECOMMENDATION',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['测试款A']}],realizedGroundingRefs:['K1']},
});
check('partial delivery keeps an independently authorized FULLY_SUPPORTED grounded recommendation instead of replacing it with a refusal notice',partialBox.exports.testPartialReply(groundedPartialContract,partialFixture([groundedPartialSpan]))==='优先看测试款A。');
const unsupportedGroundedPartial={...groundedPartialSpan,classifierResult:{...groundedPartialSpan.classifierResult,groundingEntailment:'PARTIALLY_SUPPORTED',groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE'}};
check('partial delivery still rejects unproven grounded content and cannot use no-refusal recovery to bypass Grounding',partialBox.exports.testPartialReply(groundedPartialContract,partialFixture([unsupportedGroundedPartial]))===null);
check('partial delivery preserves complete authorized general-help paragraphs beside an unsafe business paragraph',partialBox.exports.testPartialReply(partialContract,partialFixture([
  partialSpan('这件商品的实际状态目前不能确认。\n\n',false,{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED'}),
  partialSpan('先看页面上的已知状态和关键差异。\n\n',true),
  partialSpan('如果条件会改变结论，就把条件一起核对。',true),
]))==='先看页面上的已知状态和关键差异。\n\n如果条件会改变结论，就把条件一起核对。');
check('partial delivery cannot drop a condition and retain its conclusion inside the same paragraph',partialBox.exports.testPartialReply(partialContract,partialFixture([partialSpan('如果页面显示已发货，',false),partialSpan('再查看物流记录。',true)]))===null);
const mixedSameParagraph=partialFixture([
  partialSpan('这件商品的具体状态无法确认，',false,{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED'}),
  partialSpan('先按一般原则处理。',true),
]);
check('mixed unsafe and safe atoms in one paragraph are dropped as one block rather than stitched',partialBox.exports.testPartialReply(partialContract,mixedSameParagraph)===null);
const mismatchedPartial=partialFixture([partialSpan('先核对订单状态。',true)]);mismatchedPartial.structuredSegments[0].semanticUnits[0].content='另一条原始正文。';
check('partial delivery requires exact complete original-unit coverage',partialBox.exports.testPartialReply(partialContract,mismatchedPartial)===null);
const preferredPartialContract={orchestrationPlan:{interactionPlanV2:{acts:[
  {id:'GF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[]},
  {id:'A1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'PREFERRED',grounding:[]},
]}}};
const independentGuidance='可以先对照订单页的发货说明和当前状态，确认等待发生在哪一步。';
check('independent Preferred guidance survives when a Required merchant answer is unavailable',partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([partialSpan(independentGuidance,true)]))===independentGuidance);
const twoRequiredContract={orchestrationPlan:{interactionPlanV2:{acts:[
  {id:'A1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]},
  {id:'A2',type:'DIRECT_ANSWER',necessity:'REQUIRED',grounding:[]},
]}}};
check('one useful independently authorized contribution survives another missing non-Grounded Required Act',partialBox.exports.testPartialReply(twoRequiredContract,partialFixture([partialSpan(independentGuidance,true)]))===independentGuidance);
const boundarySpan=partialSpan('现有商品资料不能保证久坐后一定不勒；',true,{contributionKind:'ANSWER_JUDGMENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_BOUNDARY'});
const conditionalGuidance='如果尺码余量合适，通常更便于活动，试穿时可以坐下检查腰头和里衬是否顶住。';
check('authorized evidence boundary can accompany complete conditional general guidance without merchant refs',partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([boundarySpan,partialSpan(conditionalGuidance,true)]))===boundarySpan.exactText+conditionalGuidance);
check('a standalone authorized evidence boundary cannot masquerade as useful recovery',partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([boundarySpan]))===null);
check('a plain boundary function cannot masquerade as an answer under NOT_REQUIRED',partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([partialSpan('暂时无法回答。',true,{contributionKind:'BOUNDARY_CONTENT'})]))===null);
for(const contributionKind of ['RECEPTION_ACK','QUESTION_OR_SERVICE_ENTRY','REASSURANCE']){
  check(`partial recovery does not treat ${contributionKind} as substantive help`,partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([partialSpan('这条已授权的社交或提问信息不完成实质帮助。',true,{contributionKind})]))===null);
}
for(const options of [
  {evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED'},
  {realizedGroundingRefs:['K1']},
  {classifierResult:{realizedGroundingRefs:['K1']}},
  {classifierResult:{groundingSupport:[{ref:'K1',excerpts:['中薄']}] }},
  {classifierResult:{witnessProtocolError:'GROUNDING_SUPPORT_INVALID'}},
  {realizedActIds:['GF1']},
]){
  check(`partial recovery rejects evidence or owner leakage ${JSON.stringify(options)}`,partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([partialSpan(independentGuidance,true,options)]))===null);
}
check('partial recovery does not retain an unauthorized evidence boundary even beside valid guidance in the same paragraph',partialBox.exports.testPartialReply(preferredPartialContract,partialFixture([{...boundarySpan,authorized:false},partialSpan(conditionalGuidance,true)]))===null);
const acrossUnitCondition=partialUnitFixture([[partialSpan('如果页面显示已发货，',false)],[partialSpan('再查看物流记录。',true)]]);
check('partial recovery cannot discard a condition from a different unit in the same paragraph',partialBox.exports.testPartialReply(partialContract,acrossUnitCondition)===null);
const acrossUnitIndependent=partialUnitFixture([[partialSpan('这项业务结论未获支持。\n\n',false)],[partialSpan(independentGuidance,true)]]);
check('explicit blank-line boundary permits independent useful help across units',partialBox.exports.testPartialReply(partialContract,acrossUnitIndependent)===independentGuidance);
const missingUnitCheck=partialUnitFixture([[partialSpan('未分类的条件，',false)],[partialSpan(independentGuidance,true)]]);
missingUnitCheck.semanticConformance.unitChecks.shift();
check('missing unit evidence cannot silently remove the premise before retaining another unit',partialBox.exports.testPartialReply(partialContract,missingUnitCheck)===null);
const complaintPartialContract={orchestrationPlan:{interactionPlanV2:{acts:[...preferredPartialContract.orchestrationPlan.interactionPlanV2.acts,{id:'ACK1',type:'EMOTIONAL_ACK',necessity:'PREFERRED',grounding:[]}]}}};
const complaintAck=partialSpan('等了几天还没有消息确实让人着急。',true,{contributionKind:'RECEPTION_ACK',semanticTarget:'CUSTOMER_AFFECT_OR_STANCE',taskDependency:'INDEPENDENT_OF_CUSTOMER_TASK',realizedActIds:['ACK1']});
check('already-authorized complaint reception can accompany substantive guidance without an Act-name allowlist',partialBox.exports.testPartialReply(complaintPartialContract,partialFixture([complaintAck,partialSpan(independentGuidance,true)]))===complaintAck.exactText+independentGuidance);
check('authorized reception alone still cannot count as substantive recovery',partialBox.exports.testPartialReply(complaintPartialContract,partialFixture([complaintAck]))===null);
const staleUnclassified=partialFixture([partialSpan(independentGuidance,true)]);staleUnclassified.semanticConformance.observedDecision='INVALID_RESPONSE';
check('stale-looking atom checks do not authorize recovery after an invalid classifier response',partialBox.exports.testPartialReply(partialContract,staleUnclassified)===null);
const generatorBox = { exports: {}, module: { exports: {} }, require: id => {
  if (id === '@nestjs/common') return { Injectable: () => target => target };
  if (id.includes('customer-service-act-descriptor.registry')) return { getCustomerServiceActDescriptor: descriptor };
  if (id.includes('customer-service-nlg-execution-brief')) return { projectCustomerServiceCanonicalActsForSemanticFrame: projectActs };
  if (id.includes('source-bound-summary-protocol')) return {
    parseCustomerServiceTypedSourceBoundSummary: value => ({
      schemaVersion: 3, mode: 'SOURCE_BOUND_SUMMARY', outputFormat: 'TYPED_JSON_SOURCE_BINDINGS',
      protocolDetected: false, protocolValid: false, visibleText: '', issueKeys: ['TEST_INVALID'], items: [], raw: value,
    }),
  };
  return {};
}, console, process };
generatorBox.module.exports = generatorBox.exports;
vm.runInNewContext(generatorJs.outputText, generatorBox, { filename: rel.generator });
const Generator = generatorBox.exports.CustomerServiceReplyGenerator;
const base = {
  requestedModel: 'audit-model', actualModel: 'audit-model', model: 'audit-model', elapsedMs: 2,
  requestId: 'audit', usage: {}, finishReason: 'stop', thinkingMode: 'DISABLED', requestedMaxTokens: 800,
  effectiveMaxTokens: 800, timeoutMs: 1000, reasoningContentLength: 0, visibleContentLength: 0,
  emptyContentReason: null, truncated: false, timedOut: false, errorMessage: null,
};
const ordinaryContract = {
  orchestrationPlan: {
    route: 'MODEL_GENERATION', interactionExecution: { lane: 'HVE3_CANDIDATE' },
    interactionPlanV2: { acts: [{ id: 'A1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', grounding: [] }] },
  },
  generationContext: { summarySource: { authority: 'NONE', mode: 'NONE', transformMode: 'NONE', messages: [] } },
};
const summaryContract = {
  orchestrationPlan: {
    route: 'MODEL_GENERATION', interactionExecution: { lane: 'HVE3_CANDIDATE' },
    interactionPlanV2: { acts: [{ id: 'A1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', grounding: [] }], answerObligation: { responseTarget: { requestedSpecificity: 'SUMMARY', requiredDelta: 'COMPLETE_CURRENT_FOCUS', evidence: ['UNDERSTANDING_GOAL:SUMMARIZE_CONVERSATION'] } } },
  },
  generationContext: { summarySource: { authority: 'SERVER_CANONICAL_TRANSCRIPT', mode: 'BOUNDED_CONVERSATION_HISTORY', transformMode: 'SOURCE_BOUND_SUMMARY', messages: [{ role: 'CUSTOMER', content: 'A' }] } },
};
const v2 = texts => JSON.stringify({ version: 'HVE_REPLY_V2', segments: texts.map(text => ({ text, units: [{ text, bindings: [{ actId: 'A1', actType: 'DIRECT_ANSWER', groundingRefs: [] }] }] })) });
const prompts = {
  build: () => ({ system: 'primary', user: 'primary' }),
  buildCompact: () => ({ system: 'summary-recovery', user: 'summary-recovery' }),
  buildAvailabilityRecovery: () => ({ system: 'plain-recovery', user: 'plain-recovery' }),
  buildProtocolRecovery: () => ({ system: 'protocol-recovery', user: 'protocol-recovery' }),
  buildPlainAvailabilityRecovery: () => ({ system: 'plain-availability-recovery', user: 'plain-availability-recovery' }),
};

(async () => {
  // Execute the actual HVE service through its Generation -> Conformance ->
  // degradation branch. Only external providers/compiler diagnostics are fixtures;
  // partial extraction, lifecycle invalidation and history fulfillment are real owners.
  const behaviorBox={exports:{},module:{exports:{}},require:()=>({})};
  behaviorBox.module.exports=behaviorBox.exports;
  vm.runInNewContext(transpile(rel.behavior,src.behavior).outputText,behaviorBox,{filename:rel.behavior});
  const partialExecutionContract={
    ...preferredPartialContract,
    orchestrationPlan:{
      ...preferredPartialContract.orchestrationPlan,
      interactionExecution:{lane:'HVE3_CANDIDATE'},
      identityConstraint:{customerVisibleIdentity:{allowedSurfaceLabels:[],withheldInternalLabels:[]}},
    },
    businessContext:{},persona:{},
  };
  async function executePartialScenario(retainedSpans,observedDecision='CLASSIFIED',options={}){
    const unsafe=partialSpan('本店这件商品穿三个小时肯定不勒。\n\n',false,{evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED'});
    const fixture=options.unitGroups?partialUnitFixture([[unsafe],...options.unitGroups]):partialFixture([unsafe,...retainedSpans]);
    fixture.draft=fixture.structuredSegments[0].semanticUnits.map(u=>u.content).join('');
    fixture.status='GENERATED';fixture.source='MODEL';
    fixture.structuredSegments[0].index=0;fixture.structuredSegments[0].purposes=['VALUE'];
    fixture.structuredSegments[0].content=fixture.draft;
    const executionContract=options.contract||partialExecutionContract;
    for(const unit of fixture.structuredSegments[0].semanticUnits)unit.bindings=projectActs(executionContract.orchestrationPlan.interactionPlanV2.acts).map(act=>({
      actId:act.id,actType:act.type,groundingRefs:act.authorityScope==='GROUNDED_BUSINESS'?['K1']:[],
    }));
    const trace={...fixture.semanticConformance,decision:'UNPROVEN_PRESERVED',observedDecision,modelCallCount:1};
    if(observedDecision!=='CLASSIFIED')trace.unitChecks=[];
    let generationCalls=0;let conformanceCalls=0;
    const service=new partialBox.exports.CustomerServiceHve3ExecutionService(
      {generate:async()=>{generationCalls+=1;return fixture;}},{},{},
      {conform:async({generation})=>{conformanceCalls+=1;return {accepted:false,trace,generation:{...generation,semanticConformance:trace}};}},
    );
    const result=await service.execute({contract:executionContract,generateReply:true});
    return {result,generationCalls,conformanceCalls};
  }
  const postCorrectionContract={
    ...partialExecutionContract,
    orchestrationPlan:{
      ...partialExecutionContract.orchestrationPlan,
      interactionPlanV2:{acts:[
        {id:'GF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}]},
        {id:'A1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'PREFERRED',grounding:[]},
      ]},
    },
  };
  async function executePostCorrectionRequiredValueScenario(){
    const unsafeText='这条测试商品夏天坐办公室穿，方向上是舒服的、不容易闷。\n';
    const safeText='它不是冰丝，也不是纯天然面料，成分是聚酯68%、粘胶27%、氨纶5%。';
    const unsafeSpan=partialSpan(unsafeText,false,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:[],realizedGroundingRefs:[],
      classifierResult:{
        groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',
        groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const safeSpan=partialSpan(safeText,true,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',
      taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:['GF1'],realizedGroundingRefs:['K1'],
      classifierResult:{
        groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',
        groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['不是冰丝，也不是纯天然面料']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const original=partialFixture([unsafeSpan,safeSpan]);
    original.draft=unsafeText+safeText;original.status='GENERATED';original.source='MODEL';
    original.structuredSegments[0].index=0;original.structuredSegments[0].purposes=['VALUE'];
    original.structuredSegments[0].content=original.draft;
    original.structuredSegments[0].semanticUnits[0].bindings=projectActs(postCorrectionContract.orchestrationPlan.interactionPlanV2.acts).map(act=>({
      actId:act.id,actType:act.type,groundingRefs:act.authorityScope==='GROUNDED_BUSINESS'?['K1']:[],
    }));
    const trace={
      ...original.semanticConformance,decision:'UNPROVEN_PRESERVED',observedDecision:'CLASSIFIED',modelCallCount:1,
      errorMessage:'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1',
      removals:[{segmentIndex:0,unitIndex:0,atomId:'S0U0A0',exactText:unsafeText,occurrence:1,code:'GROUNDED_EVIDENCE_UNSUPPORTED'}],
      violations:[{code:'REQUIRED_ACT_NOT_REALIZED',segmentIndex:0,unitIndex:0,reason:'CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1'}],
    };
    const corrected={
      ...original,draft:safeText,semanticConformance:trace,
      structuredSegments:[{
        ...original.structuredSegments[0],content:safeText,semanticUnits:[{
          ...original.structuredSegments[0].semanticUnits[0],content:safeText,
        }],
      }],
    };
    let generationCalls=0;let conformanceCalls=0;
    const service=new partialBox.exports.CustomerServiceHve3ExecutionService(
      {generate:async()=>{generationCalls+=1;return original;}},{},{},
      {conform:async()=>{conformanceCalls+=1;return {accepted:false,trace,generation:corrected};}},
    );
    const result=await service.execute({contract:postCorrectionContract,generateReply:true});
    return {result,generationCalls,conformanceCalls,unsafeText,safeText};
  }
  const executedPostCorrection=await executePostCorrectionRequiredValueScenario();
  check('actual post-correction execution marks the Required main value unfulfilled, preserves only safe corrected merchant facts, and adds a typed evidence boundary without retry',
    executedPostCorrection.generationCalls===1&&executedPostCorrection.conformanceCalls===1
    &&executedPostCorrection.result.generation.hve3.controlledDegradation.planSatisfied===false
    &&executedPostCorrection.result.generation.hve3.controlledDegradation.presentationCause==='POST_CORRECTION_EVIDENCE_BOUNDARY_WITH_SAFE_VALUE'
    &&executedPostCorrection.result.generation.draft.includes('你问的具体体验或效果，现有资料还不足以把它当成确定结果；这类体验通常还会受实际使用条件和个人感受影响。')
    &&executedPostCorrection.result.generation.draft.includes(`能确认的是：${executedPostCorrection.safeText}`)
    &&!executedPostCorrection.result.generation.draft.includes(executedPostCorrection.unsafeText.trim())
    &&executedPostCorrection.result.generation.hve3.selectedReason==='PARTIAL_SAFE_NON_GROUNDED_RECOVERY');

  async function executePostCorrectionGuidanceOnlyScenario(){
    const unsafeText='这条测试商品久坐一天一定不会勒。\n';
    const safeGuidance='没法确认实际压感时，可以先看腰头结构、可调节余量和自己的腰围余量，再决定是否值得尝试。';
    const executionContract={
      ...postCorrectionContract,
      orchestrationPlan:{
        ...postCorrectionContract.orchestrationPlan,
        interactionPlanV2:{acts:[
          {id:'GF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}]},
          {id:'A1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]},
        ]},
      },
    };
    const unsafeSpan=partialSpan(unsafeText,false,{
      contributionKind:'ANSWER_JUDGMENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:[],realizedGroundingRefs:[],
      classifierResult:{
        groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',
        groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const safeSpan=partialSpan(safeGuidance,true,{
      contributionKind:'GUIDANCE_CONTENT',semanticTarget:'TASK_OR_DOMAIN_FACT',
      taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',
      realizedActIds:['A1'],realizedGroundingRefs:[],
    });
    const original=partialFixture([unsafeSpan,safeSpan]);
    original.draft=unsafeText+safeGuidance;original.status='GENERATED';original.source='MODEL';
    original.structuredSegments[0].index=0;original.structuredSegments[0].purposes=['VALUE'];
    original.structuredSegments[0].content=original.draft;
    original.structuredSegments[0].semanticUnits[0].bindings=projectActs(executionContract.orchestrationPlan.interactionPlanV2.acts).map(act=>({
      actId:act.id,actType:act.type,groundingRefs:act.authorityScope==='GROUNDED_BUSINESS'?['K1']:[],
    }));
    const trace={
      ...original.semanticConformance,decision:'UNPROVEN_PRESERVED',observedDecision:'CLASSIFIED',modelCallCount:1,
      errorMessage:'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1',
      removals:[{segmentIndex:0,unitIndex:0,atomId:'S0U0A0',exactText:unsafeText,occurrence:1,code:'GROUNDED_EVIDENCE_UNSUPPORTED'}],
      requiredValueCompletion:{status:'UNSATISFIED',missingRequiredActIds:['GF1']},
      violations:[{code:'REQUIRED_ACT_NOT_REALIZED',segmentIndex:null,unitIndex:null,reason:'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1'}],
    };
    const corrected={
      ...original,draft:safeGuidance,semanticConformance:trace,
      structuredSegments:[{
        ...original.structuredSegments[0],content:safeGuidance,semanticUnits:[{
          ...original.structuredSegments[0].semanticUnits[0],content:safeGuidance,
          bindings:[{actId:'A1',actType:'PROVIDE_GENERAL_GUIDANCE',groundingRefs:[]}],
        }],
      }],
    };
    let generationCalls=0;let conformanceCalls=0;
    const service=new partialBox.exports.CustomerServiceHve3ExecutionService(
      {generate:async()=>{generationCalls+=1;return original;}},{},{},
      {conform:async()=>{conformanceCalls+=1;return {accepted:false,trace,generation:corrected};}},
    );
    const result=await service.execute({contract:executionContract,generateReply:true});
    return {result,generationCalls,conformanceCalls,unsafeText,safeGuidance};
  }
  const executedGuidanceOnly=await executePostCorrectionGuidanceOnlyScenario();
  check('post-correction degradation keeps independently authorized general guidance when the Required merchant proposition is removed',
    executedGuidanceOnly.generationCalls===1&&executedGuidanceOnly.conformanceCalls===1
    &&executedGuidanceOnly.result.generation.hve3.controlledDegradation.planSatisfied===false
    &&executedGuidanceOnly.result.generation.hve3.controlledDegradation.presentationCause==='POST_CORRECTION_EVIDENCE_BOUNDARY_WITH_SAFE_VALUE'
    &&executedGuidanceOnly.result.generation.hve3.selectedReason==='PARTIAL_SAFE_NON_GROUNDED_RECOVERY'
    &&executedGuidanceOnly.result.generation.draft.includes(executedGuidanceOnly.safeGuidance)
    &&executedGuidanceOnly.result.generation.draft.includes('现有资料还不足以把它当成确定结果')
    &&!executedGuidanceOnly.result.generation.draft.includes(executedGuidanceOnly.unsafeText.trim())
    &&!executedGuidanceOnly.result.generation.draft.includes('这个具体结论我先不替你说死'));

  const normalPartialContinuationContract={
    ...postCorrectionContract,
    orchestrationPlan:{
      ...postCorrectionContract.orchestrationPlan,
      interactionPlanV2:{
        ...postCorrectionContract.orchestrationPlan.interactionPlanV2,
        acts:[
          {id:'GF1',type:'EXPLAIN_GROUNDED_FACT',necessity:'REQUIRED',grounding:[{status:'SATISFIED',evidenceRefs:['K1']}]},
          {id:'A1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'REQUIRED',grounding:[]},
        ],
      },
    },
  };
  async function executeNormalPartialContinuationScenario(){
    const unsafeText='这条测试商品从早穿到晚肯定不会闷。\n';
    const safeGuidance='如果皮肤比较敏感，可以加一件薄的纯棉打底，减少直接摩擦。\n';
    const safeFact='它的成分和轻薄透气定位仍然可以作为选购参考。';
    const unsafeSpan=partialSpan(unsafeText,false,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      violationCode:'GROUNDED_EVIDENCE_UNSUPPORTED',realizedActIds:[],realizedGroundingRefs:[],
      classifierResult:{groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景']}],realizedGroundingRefs:['K1']},
    });
    const guidanceSpan=partialSpan(safeGuidance,true,{
      contributionKind:'GUIDANCE_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'NOT_REQUIRED',
      realizedActIds:['A1'],realizedGroundingRefs:[],
    });
    const factSpan=partialSpan(safeFact,true,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',
      taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:['GF1'],realizedGroundingRefs:['K1'],
      classifierResult:{groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['轻薄透气']}],realizedGroundingRefs:['K1']},
    });
    const original=partialFixture([unsafeSpan,guidanceSpan,factSpan]);
    original.draft=unsafeText+safeGuidance+safeFact;original.status='GENERATED';original.source='MODEL';
    original.structuredSegments[0].index=0;original.structuredSegments[0].purposes=['VALUE'];original.structuredSegments[0].content=original.draft;
    original.structuredSegments[0].semanticUnits[0].bindings=projectActs(normalPartialContinuationContract.orchestrationPlan.interactionPlanV2.acts).map(act=>({actId:act.id,actType:act.type,groundingRefs:act.authorityScope==='GROUNDED_BUSINESS'?['K1']:[]}));
    const unitCheck={...original.semanticConformance.unitChecks[0],authorized:true,realizedActIds:['GF1','A1'],realizedGroundingRefs:['K1']};
    const trace={
      ...original.semanticConformance,decision:'REMOVED_UNAUTHORIZED_SPANS',observedDecision:'CLASSIFIED',modelCallCount:1,unitChecks:[unitCheck],
      requiredValueCompletion:{status:'PARTIAL_SAFE_CONTINUATION',missingRequiredActIds:['GF1']},
      errorMessage:'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1',
      removals:[{segmentIndex:0,unitIndex:0,atomId:'S0U0A0',exactText:unsafeText,occurrence:1,code:'GROUNDED_EVIDENCE_UNSUPPORTED'}],
      violations:[{code:'REQUIRED_ACT_NOT_REALIZED',segmentIndex:null,unitIndex:null,reason:'CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_VALUE_NOT_REALIZED:GF1'}],
    };
    const correctedText=safeGuidance+safeFact;
    const corrected={
      ...original,draft:correctedText,semanticConformance:trace,
      structuredSegments:[{...original.structuredSegments[0],content:correctedText,semanticUnits:[{...original.structuredSegments[0].semanticUnits[0],content:correctedText}]}],
      presentationIntent:{schemaVersion:1,authority:'GENERATION_PRESENTATION_ONLY',segments:[{index:0,content:correctedText,source:'STRUCTURED_CHAT_PRESENTATION'}]},
    };
    let generationCalls=0;let conformanceCalls=0;
    const service=new partialBox.exports.CustomerServiceHve3ExecutionService(
      {generate:async()=>{generationCalls+=1;return original;}},{},{},
      {conform:async()=>{conformanceCalls+=1;return {accepted:true,trace,generation:corrected};}},
    );
    const result=await service.execute({contract:normalPartialContinuationContract,generateReply:true});
    return {result,generationCalls,conformanceCalls,unsafeText,safeGuidance,safeFact};
  }
  const executedNormalPartialContinuation=await executeNormalPartialContinuationScenario();
  check('typed partial-safe continuation stays on the normal HVE candidate path instead of invoking PARTIAL_SAFE_NON_GROUNDED_RECOVERY',
    executedNormalPartialContinuation.generationCalls===1&&executedNormalPartialContinuation.conformanceCalls===1
    &&executedNormalPartialContinuation.result.generation.hve3.selectedReason==='PRIMARY_CANDIDATE_ACCEPTED'
    &&!executedNormalPartialContinuation.result.generation.hve3.controlledDegradation
    &&executedNormalPartialContinuation.result.generation.fallbackUsed===false
    &&executedNormalPartialContinuation.result.generation.draft===executedNormalPartialContinuation.safeGuidance+executedNormalPartialContinuation.safeFact
    &&!executedNormalPartialContinuation.result.generation.draft.includes(executedNormalPartialContinuation.unsafeText.trim()));
  check('history records a normally delivered partial-safe continuation as UNKNOWN rather than falsely FULFILLED or degradation NOT_FULFILLED',
    behaviorBox.exports.resolveCustomerServicePlanFulfillmentFromReplyTrace({generationDetails:executedNormalPartialContinuation.result.generation,runtimeContract:normalPartialContinuationContract})==='UNKNOWN');
  check('normal partial continuation preserves Conformance-proven merchant evidence in history while the removed unsafe proposition stays absent',
    behaviorBox.exports.extractCustomerServiceProvenGroundingRefsFromReplyTrace(executedNormalPartialContinuation.result.generation).includes('K1')
    &&behaviorBox.exports.extractCustomerServiceProvenGroundedUnitsFromReplyTrace(executedNormalPartialContinuation.result.generation).some(unit=>unit.groundingRefs.includes('K1'))
    &&!executedNormalPartialContinuation.result.generation.draft.includes(executedNormalPartialContinuation.unsafeText.trim()));


  async function executePostCorrectionSemanticSubstitutionScenario(){
    const safeSuitability='这条测试商品夏天坐办公室穿是合适的。\n';
    const unsafePerformance='久坐不太容易闷得难受。\n';
    const safeFit='版型高腰直筒偏微阔，臀胯留量比较足。';
    const safeSuitabilitySpan=partialSpan(safeSuitability,true,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:['GF1'],realizedGroundingRefs:['K1'],
      classifierResult:{
        groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',
        groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const unsafePerformanceSpan=partialSpan(unsafePerformance,false,{
      contributionKind:'ANSWER_JUDGMENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:[],realizedGroundingRefs:[],
      classifierResult:{
        groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',
        groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',groundingSupport:[{ref:'K1',excerpts:['适合夏季通勤和办公室场景']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const safeFitSpan=partialSpan(safeFit,true,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:['GF1'],realizedGroundingRefs:['K1'],
      classifierResult:{
        groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'SUITABILITY_OR_DECISION_SUPPORT',
        groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['高腰直筒偏微阔版型，臀胯留量较足']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const original=partialFixture([safeSuitabilitySpan,unsafePerformanceSpan,safeFitSpan]);
    original.draft=safeSuitability+unsafePerformance+safeFit;original.status='GENERATED';original.source='MODEL';
    original.structuredSegments[0].index=0;original.structuredSegments[0].purposes=['VALUE'];
    original.structuredSegments[0].content=original.draft;
    original.structuredSegments[0].semanticUnits[0].bindings=projectActs(postCorrectionContract.orchestrationPlan.interactionPlanV2.acts).map(act=>({
      actId:act.id,actType:act.type,groundingRefs:act.authorityScope==='GROUNDED_BUSINESS'?['K1']:[],
    }));
    const trace={
      ...original.semanticConformance,decision:'UNPROVEN_PRESERVED',observedDecision:'CLASSIFIED',modelCallCount:1,
      errorMessage:'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:GF1:ACTION_OPTION_RISK_OR_OUTCOME|PERFORMANCE_OR_EXPERIENCE',
      removals:[{segmentIndex:0,unitIndex:0,atomId:'S0U0A1',exactText:unsafePerformance,occurrence:1,code:'GROUNDED_EVIDENCE_UNSUPPORTED'}],
      violations:[{code:'REQUIRED_ACT_NOT_REALIZED',segmentIndex:0,unitIndex:0,reason:'CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:GF1:ACTION_OPTION_RISK_OR_OUTCOME|PERFORMANCE_OR_EXPERIENCE'}],
    };
    const correctedText=safeSuitability+safeFit;
    const corrected={
      ...original,draft:correctedText,semanticConformance:trace,
      structuredSegments:[{
        ...original.structuredSegments[0],content:correctedText,semanticUnits:[{
          ...original.structuredSegments[0].semanticUnits[0],content:correctedText,
        }],
      }],
    };
    let generationCalls=0;let conformanceCalls=0;
    const service=new partialBox.exports.CustomerServiceHve3ExecutionService(
      {generate:async()=>{generationCalls+=1;return original;}},{},{},
      {conform:async()=>{conformanceCalls+=1;return {accepted:false,trace,generation:corrected};}},
    );
    const result=await service.execute({contract:postCorrectionContract,generateReply:true});
    return {result,generationCalls,conformanceCalls,unsafePerformance,correctedText};
  }
  const executedSemanticSubstitution=await executePostCorrectionSemanticSubstitutionScenario();
  check('actual HVE execution does not accept adjacent suitability as completion of a removed performance answer and instead preserves safe facts behind a typed evidence boundary',
    executedSemanticSubstitution.generationCalls===1&&executedSemanticSubstitution.conformanceCalls===1
    &&executedSemanticSubstitution.result.generation.hve3.controlledDegradation.planSatisfied===false
    &&executedSemanticSubstitution.result.generation.hve3.controlledDegradation.presentationCause==='POST_CORRECTION_EVIDENCE_BOUNDARY_WITH_SAFE_VALUE'
    &&executedSemanticSubstitution.result.generation.draft.includes('你问的具体体验或效果，现有资料还不足以把它当成确定结果；这类体验通常还会受实际使用条件和个人感受影响。')
    &&executedSemanticSubstitution.result.generation.draft.includes(`能确认的是：${executedSemanticSubstitution.correctedText.trim()}`)
    &&!executedSemanticSubstitution.result.generation.draft.includes(executedSemanticSubstitution.unsafePerformance.trim())
    &&executedSemanticSubstitution.result.generation.hve3.selectedReason==='PARTIAL_SAFE_NON_GROUNDED_RECOVERY');

  async function executeMixedSpanSourcePremiseRecoveryScenario(){
    const sourceContent='高腰直筒偏微阔版型，臀胯留量较足，裤腿不贴腿。面料中薄、垂坠、微弹，适合夏季通勤和办公室场景。该商品不是冰丝，也不是纯天然面料。';
    const knowledgeEntry={
      id:'K1',content:sourceContent,title:'测试款A',question:null,tags:[],scopeType:'ENTITY',scopeKey:'K1',
      category:'PRODUCT',sourceType:'FIXTURE',sourceReference:null,revision:1,estimatedTokens:64,
    };
    const executionContract={
      ...postCorrectionContract,
      businessContext:{
        ...(postCorrectionContract.businessContext||{}),
        knowledgeEntries:[knowledgeEntry],
        knowledgeSelection:{selected:[knowledgeEntry],scopeRejected:[],budgetEvicted:[]},
      },
    };
    const mixedPerformance='测试款A是高腰直筒偏微阔版型，臀胯留量比较足，裤腿不贴腿，坐一天办公室不太会有那种绷着、闷住的感觉。\n';
    const mixedComfort='面料中薄、垂坠带微弹，本来就是按夏季通勤和办公室场景做的，所以夏天穿会比较舒服透气。\n';
    const safeText='它不是冰丝，也不是纯天然面料。';
    const mixedPerformanceSpan=partialSpan(mixedPerformance,false,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      violationCode:'GROUNDED_EVIDENCE_UNSUPPORTED',realizedActIds:[],realizedGroundingRefs:[],
      classifierResult:{
        groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',
        groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',
        groundingSupport:[{ref:'K1',excerpts:['高腰直筒偏微阔版型，臀胯留量较足，裤腿不贴腿']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const mixedComfortSpan=partialSpan(mixedComfort,false,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'ACTION_OPTION_RISK_OR_OUTCOME',
      taskDependency:'MATERIAL_TO_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      violationCode:'GROUNDED_EVIDENCE_UNSUPPORTED',realizedActIds:[],realizedGroundingRefs:[],
      classifierResult:{
        groundingEntailment:'PARTIALLY_SUPPORTED',groundedActionRole:'PERFORMANCE_OR_EXPERIENCE',
        groundingBasis:'PARTIAL_SOURCE_PLUS_INFERENCE',
        groundingSupport:[{ref:'K1',excerpts:['面料中薄、垂坠、微弹，适合夏季通勤和办公室场景']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const safeSpan=partialSpan(safeText,true,{
      contributionKind:'GROUNDED_CONTENT',semanticTarget:'MERCHANT_ENTITY_OR_POLICY',
      taskDependency:'SUPPORTS_CUSTOMER_TASK',evidenceRequirement:'MERCHANT_ENTITY_EVIDENCE_REQUIRED',
      realizedActIds:['GF1'],realizedGroundingRefs:['K1'],
      classifierResult:{
        groundingEntailment:'FULLY_SUPPORTED',groundedActionRole:'NOT_APPLICABLE',
        groundingBasis:'DIRECT_SOURCE',groundingSupport:[{ref:'K1',excerpts:['该商品不是冰丝，也不是纯天然面料']}],
        realizedGroundingRefs:['K1'],
      },
    });
    const original=partialFixture([mixedPerformanceSpan,mixedComfortSpan,safeSpan]);
    original.draft=mixedPerformance+mixedComfort+safeText;original.status='GENERATED';original.source='MODEL';
    original.structuredSegments[0].index=0;original.structuredSegments[0].purposes=['VALUE'];
    original.structuredSegments[0].content=original.draft;
    original.structuredSegments[0].semanticUnits[0].bindings=projectActs(executionContract.orchestrationPlan.interactionPlanV2.acts).map(act=>({
      actId:act.id,actType:act.type,groundingRefs:act.authorityScope==='GROUNDED_BUSINESS'?['K1']:[],
    }));
    const trace={
      ...original.semanticConformance,decision:'UNPROVEN_PRESERVED',observedDecision:'CLASSIFIED',modelCallCount:1,
      errorMessage:'CONFORMANCE_REQUIRED_MATERIAL_VALUE_NOT_REALIZED_AFTER_CORRECTION:CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:GF1:ACTION_OPTION_RISK_OR_OUTCOME|PERFORMANCE_OR_EXPERIENCE',
      removals:[
        {segmentIndex:0,unitIndex:0,atomId:'S0U0A0',exactText:mixedPerformance,occurrence:1,code:'GROUNDED_EVIDENCE_UNSUPPORTED'},
        {segmentIndex:0,unitIndex:0,atomId:'S0U0A1',exactText:mixedComfort,occurrence:1,code:'GROUNDED_EVIDENCE_UNSUPPORTED'},
      ],
      violations:[{code:'REQUIRED_ACT_NOT_REALIZED',segmentIndex:0,unitIndex:0,reason:'CONFORMANCE_GROUNDED_REQUIRED_MATERIAL_SEMANTIC_NOT_REALIZED:GF1:ACTION_OPTION_RISK_OR_OUTCOME|PERFORMANCE_OR_EXPERIENCE'}],
    };
    const corrected={
      ...original,draft:safeText,semanticConformance:trace,
      structuredSegments:[{
        ...original.structuredSegments[0],content:safeText,semanticUnits:[{
          ...original.structuredSegments[0].semanticUnits[0],content:safeText,
        }],
      }],
    };
    let generationCalls=0;let conformanceCalls=0;
    const service=new partialBox.exports.CustomerServiceHve3ExecutionService(
      {generate:async()=>{generationCalls+=1;return original;}},{},{},
      {conform:async()=>{conformanceCalls+=1;return {accepted:false,trace,generation:corrected};}},
    );
    const result=await service.execute({contract:executionContract,generateReply:true});
    return {result,generationCalls,conformanceCalls,mixedPerformance,mixedComfort,safeText};
  }
  const executedMixedSpanSourcePremise=await executeMixedSpanSourcePremiseRecoveryScenario();
  check('architecture recovery keeps server-verifiable source premises from a mixed unsupported claim span while the unsupported outcome remains deleted',
    executedMixedSpanSourcePremise.generationCalls===1&&executedMixedSpanSourcePremise.conformanceCalls===1
    &&executedMixedSpanSourcePremise.result.generation.hve3.controlledDegradation.planSatisfied===false
    &&executedMixedSpanSourcePremise.result.generation.hve3.controlledDegradation.presentationCause==='POST_CORRECTION_EVIDENCE_BOUNDARY_WITH_SAFE_VALUE'
    &&executedMixedSpanSourcePremise.result.generation.draft.includes('现有资料能直接确认的是：高腰直筒偏微阔版型，臀胯留量较足，裤腿不贴腿；面料中薄、垂坠、微弹，适合夏季通勤和办公室场景。')
    &&executedMixedSpanSourcePremise.result.generation.draft.includes('你问的具体体验或效果，现有资料还不足以把它当成确定结果；这类体验通常还会受实际使用条件和个人感受影响。')
    &&executedMixedSpanSourcePremise.result.generation.draft.includes(executedMixedSpanSourcePremise.safeText)
    &&!executedMixedSpanSourcePremise.result.generation.draft.includes('坐一天办公室不太会有那种绷着、闷住的感觉')
    &&!executedMixedSpanSourcePremise.result.generation.draft.includes('所以夏天穿会比较舒服透气')
    &&executedMixedSpanSourcePremise.result.generation.hve3.selectedReason==='PARTIAL_SAFE_NON_GROUNDED_RECOVERY');

  const executedPartial=await executePartialScenario([boundarySpan,partialSpan(conditionalGuidance,true)]);
  check('actual HVE execution delivers authorized Preferred help plus its evidence boundary and removes unsafe merchant text',executedPartial.result.generation.draft===boundarySpan.exactText+conditionalGuidance&&executedPartial.result.generation.hve3.selectedReason==='PARTIAL_SAFE_NON_GROUNDED_RECOVERY');
  check('actual partial service performs one Generation and one Conformance without repair calls',executedPartial.generationCalls===1&&executedPartial.conformanceCalls===1);
  check('actual partial service remains NOT_FULFILLED in the existing history consumer',executedPartial.result.generation.hve3.controlledDegradation.planSatisfied===false&&behaviorBox.exports.resolveCustomerServicePlanFulfillmentFromReplyTrace({generationDetails:executedPartial.result.generation,runtimeContract:partialExecutionContract})==='NOT_FULFILLED');
  check('actual partial service invalidates old merchant segments and cannot transport proven grounding into history',!executedPartial.result.generation.structuredSegments&&!executedPartial.result.generation.presentationIntent&&behaviorBox.exports.extractCustomerServiceProvenGroundingRefsFromReplyTrace(executedPartial.result.generation).length===0&&behaviorBox.exports.extractCustomerServiceProvenGroundedUnitsFromReplyTrace(executedPartial.result.generation).length===0);
  const executedBoundaryOnly=await executePartialScenario([boundarySpan]);
  check('actual boundary-only output emits a fact-free useful service floor instead of the old cross-scenario refusal or an invented merchant fact',executedBoundaryOnly.result.generation.finalReplySource==='FAILURE_NOTICE'&&!executedBoundaryOnly.result.generation.draft.includes('这轮有些具体信息还没能可靠确认')&&executedBoundaryOnly.result.generation.draft.includes('还能继续往下判断')&&executedBoundaryOnly.result.generation.draft.includes('关键影响因素')&&!executedBoundaryOnly.result.generation.draft.includes('回复处理出了问题')&&!executedBoundaryOnly.result.generation.draft.includes('本店这件商品')&&executedBoundaryOnly.result.generation.hve3.controlledDegradation.presentationCause==='FACT_FREE_USEFUL_SERVICE_FLOOR');
  const executedProtocolFailure=await executePartialScenario([partialSpan(independentGuidance,true)],'INVALID_RESPONSE');
  check('actual classifier self-failure cannot authorize apparently useful text without atom evidence and falls to a fact-free useful service floor without pretending knowledge absence',executedProtocolFailure.result.generation.finalReplySource==='FAILURE_NOTICE'&&!executedProtocolFailure.result.generation.draft.includes('这轮有些具体信息还没能可靠确认')&&executedProtocolFailure.result.generation.draft.includes('还能继续往下判断')&&!executedProtocolFailure.result.generation.draft.includes(independentGuidance)&&executedProtocolFailure.result.generation.hve3.controlledDegradation.planSatisfied===false&&executedProtocolFailure.result.generation.hve3.controlledDegradation.presentationCause==='FACT_FREE_USEFUL_SERVICE_FLOOR'&&executedProtocolFailure.result.quality.issues[0].message.includes('不是知识缺失结论'));
  const executedSplitCondition=await executePartialScenario([],'CLASSIFIED',{unitGroups:[[partialSpan('如果这次订单已经发出，',false)],[partialSpan('再查看物流记录。',true)]]});
  check('actual execution rejects a conclusion whose missing condition lives in another semantic unit and keeps only the fact-free useful service floor',executedSplitCondition.result.generation.finalReplySource==='FAILURE_NOTICE'&&executedSplitCondition.result.generation.draft.includes('还能继续往下判断')&&!executedSplitCondition.result.generation.draft.includes('再查看物流记录'));
  const executedIndependentUnits=await executePartialScenario([],'CLASSIFIED',{unitGroups:[[partialSpan(independentGuidance,true)]]});
  check('actual execution retains independent help after an explicitly separate unsafe paragraph unit',executedIndependentUnits.result.generation.draft===independentGuidance&&executedIndependentUnits.result.generation.hve3.controlledDegradation.planSatisfied===false);
  const executedComplaint=await executePartialScenario([complaintAck,partialSpan(independentGuidance,true)],'CLASSIFIED',{contract:{...partialExecutionContract,orchestrationPlan:{...partialExecutionContract.orchestrationPlan,interactionPlanV2:complaintPartialContract.orchestrationPlan.interactionPlanV2}}});
  check('actual execution preserves authorized complaint acknowledgement together with useful next steps',executedComplaint.result.generation.draft===complaintAck.exactText+independentGuidance&&executedComplaint.result.generation.hve3.controlledDegradation.planSatisfied===false);

  const ordinaryCalls = [];
  const ordinary = new Generator({ generate: async input => {
    ordinaryCalls.push(input);
    return { ...base, ok: true, status: 'SUCCESS', content: v2(['第一泡普通正文。', '第二泡普通正文。']), visibleContentLength: 80 };
  } }, prompts);
  const ordinaryResult = await ordinary.generate(ordinaryContract, true);
  check('Dynamic canonical HVE_REPLY_V2 preserves model-authored visible segments', ordinaryResult.draft === '第一泡普通正文。\n\n第二泡普通正文。');
  check('Dynamic ordinary V2 primary performs one model call with provider jsonMode=true', ordinaryCalls.length === 1 && ordinaryCalls[0].jsonMode === true && ordinaryResult.source === 'MODEL' && ordinaryResult.compactRetryAttempted === false);
  check('Dynamic HVE_REPLY_V2 segments become the only Generation presentation intent', ordinaryResult.presentationIntent?.segments?.length === 2 && ordinaryResult.structuredSegments?.every(s => s.semanticUnits?.length === 1) && !ordinaryResult.summaryTransformation);

  const malformedSyntaxCalls = [];
  const malformedSyntax = new Generator({ generate: async input => {
    malformedSyntaxCalls.push(input);
    const raw = '{"version":"HVE_REPLY_V2","segments":[{"text":"第一行\n第二行","units":[{"text":"第一行\n第二行","bindings":[{"actId":"A1","actType":"DIRECT_ANSWER","groundingRefs":[]}]}]}]}'.replace(/\\n/g, '\n');
    return { ...base, ok: true, status: 'SUCCESS', content: raw, visibleContentLength: 100 };
  } }, prompts);
  const malformedSyntaxResult = await malformedSyntax.generate(ordinaryContract, true);
  check('Dynamic syntax-only repair unwraps V2 envelope with literal newline and never leaks wrapper', malformedSyntaxCalls.length === 1 && malformedSyntaxResult.draft === '第一行\n第二行' && !malformedSyntaxResult.draft.includes('HVE_REPLY_V2'));

  const wrongEnvelopeCalls = [];
  const wrongEnvelope = new Generator({ generate: async input => {
    wrongEnvelopeCalls.push(input);
    if (wrongEnvelopeCalls.length === 1) return { ...base, ok: true, status: 'SUCCESS', content: JSON.stringify({ version: 'HVE_REPLY_V2', messages: [{ text: '不允许直出这个错误包络' }] }), visibleContentLength: 80 };
    return { ...base, ok: true, status: 'SUCCESS', content: v2(['恢复后的正常客户回复。']), visibleContentLength: 90 };
  } }, prompts);
  const wrongEnvelopeResult = await wrongEnvelope.generate(ordinaryContract, true);
  check('Dynamic wrong V2 JSON envelope triggers only the existing one recovery call', wrongEnvelopeCalls.length === 2 && wrongEnvelopeResult.compactRetryAttempted === true && wrongEnvelopeResult.source === 'COMPACT_MODEL_RETRY');
  check('Dynamic wrong JSON envelope can never reach customer-visible draft', wrongEnvelopeResult.draft === '恢复后的正常客户回复。' && !wrongEnvelopeResult.draft.includes('messages') && !wrongEnvelopeResult.draft.includes('HVE_REPLY_V2'));
  check('Dynamic protocol recovery records protocol-specific V2 reason instead of pretending provider no-content', String(wrongEnvelopeResult.fallbackReason || '').includes('无效 HVE_REPLY_V2 Act-bound 机器协议包络'));

  const doubleWrongCalls = [];
  const doubleWrong = new Generator({ generate: async input => {
    doubleWrongCalls.push(input);
    return { ...base, ok: true, status: 'SUCCESS', content: JSON.stringify({ response: '协议字段不合格，但这是 provider 已经给出的非空客户正文。' }), visibleContentLength: 40 };
  } }, prompts);
  const doubleWrongResult = await doubleWrong.generate(ordinaryContract, true);
  check('Dynamic two invalid protocol envelopes preserve recoverable provider-visible text instead of manufacturing model availability', doubleWrongCalls.length === 2 && doubleWrongResult.status === 'GENERATED' && doubleWrongResult.draft === '协议字段不合格，但这是 provider 已经给出的非空客户正文。');
  check('Dynamic protocol preservation remains non-veto evidence and never exposes wrapper JSON', doubleWrongResult.protocolPreservation?.applied === true && doubleWrongResult.finalReplySource !== 'FAILURE_NOTICE' && !doubleWrongResult.draft.includes('response'));

  const wrongBindingCalls = [];
  const wrongBinding = new Generator({ generate: async input => {
    wrongBindingCalls.push(input);
    const text = wrongBindingCalls.length === 1 ? '首轮正文有错误 Act binding。' : '恢复轮正文仍有错误 Act binding，但正文必须保留。';
    return { ...base, ok: true, status: 'SUCCESS', content: JSON.stringify({ version: 'HVE_REPLY_V2', segments: [{ text, units: [{ text, bindings: [{ actId: 'UNSELECTED', actType: 'DIRECT_ANSWER', groundingRefs: [] }] }] }] }), visibleContentLength: 80 };
  } }, prompts);
  const wrongBindingResult = await wrongBinding.generate(ordinaryContract, true);
  check('Dynamic repeated canonical-binding failure cannot erase non-empty provider segment text', wrongBindingCalls.length === 2 && wrongBindingResult.status === 'GENERATED' && wrongBindingResult.draft === '恢复轮正文仍有错误 Act binding，但正文必须保留。');
  check('Dynamic repeated binding failure is protocol-preserved, not model-availability fallback', wrongBindingResult.protocolPreservation?.applied === true && wrongBindingResult.finalReplySource === 'COMPACT_MODEL_RETRY' && wrongBindingResult.source === 'COMPACT_MODEL_RETRY');

  const legacyCalls = [];
  const legacy = new Generator({ generate: async input => {
    legacyCalls.push(input);
    if (legacyCalls.length === 1) return { ...base, ok: true, status: 'SUCCESS', content: JSON.stringify({ version: 'HVE_REPLY_V1', segments: [{ text: '旧协议不能直出。' }] }), visibleContentLength: 48 };
    return { ...base, ok: true, status: 'SUCCESS', content: v2(['V2恢复正文。']), visibleContentLength: 60 };
  } }, prompts);
  const legacyResult = await legacy.generate(ordinaryContract, true);
  check('Dynamic legacy V1 cannot bypass V2 and may use only the existing protocol recovery', legacyCalls.length === 2 && legacyResult.source === 'COMPACT_MODEL_RETRY' && legacyResult.draft === 'V2恢复正文。');
  check('Legacy compatibility does not create a second recovery path', legacyCalls.length === 2 && legacyResult.compactRetryAttempted === true && legacyResult.rewriteCount === 0);

  const summaryCalls = [];
  const summary = new Generator({ generate: async input => {
    summaryCalls.push(input);
    return { ...base, ok: true, status: 'SUCCESS', content: '模型已经给出的可读总结正文。', visibleContentLength: 15 };
  } }, prompts);
  const summaryResult = await summary.generate(summaryContract, true);
  check('Dynamic invalid Summary provenance preserves non-empty model summary text', summaryResult.draft === '模型已经给出的可读总结正文。');
  check('Dynamic invalid Summary provenance does not trigger recovery', summaryCalls.length === 1 && summaryResult.compactRetryAttempted === false && summaryResult.summaryTransformation?.protocolValid === false);

  const recoveryCalls = [];
  const recovery = new Generator({ generate: async input => {
    recoveryCalls.push(input);
    if (recoveryCalls.length === 1) return { ...base, ok: false, status: 'EMPTY_CONTENT', content: '', emptyContentReason: 'NULL_OR_MISSING_CONTENT', errorMessage: 'empty' };
    return { ...base, ok: true, status: 'SUCCESS', content: v2(['只有首轮真正无正文时才进入的恢复回复。']), visibleContentLength: 100 };
  } }, prompts);
  const recoveryResult = await recovery.generate(ordinaryContract, true);
  check('Dynamic true no-content uses the one existing recovery call', recoveryCalls.length === 2 && recoveryResult.source === 'COMPACT_MODEL_RETRY');
  check('Dynamic ordinary recovery keeps provider jsonMode=true and still requires valid V2', recoveryCalls[1].jsonMode === true && recoveryResult.draft === '只有首轮真正无正文时才进入的恢复回复。' && recoveryResult.structuredSegments?.[0]?.semanticUnits?.length === 1);

  const plainRescueCalls = [];
  const plainRescue = new Generator({ generate: async input => {
    plainRescueCalls.push(input);
    if (plainRescueCalls.length <= 2) return { ...base, ok: false, status: 'MODEL_ERROR', content: '', errorMessage: 'structured transport unavailable' };
    return { ...base, ok: true, status: 'SUCCESS', content: '这是 plain transport 恢复出的正常客户正文。', visibleContentLength: 27 };
  } }, prompts);
  const plainRescueResult = await plainRescue.generate(ordinaryContract, true);
  check('Dynamic zero-visible structured failures use exactly one plain transport availability rescue', plainRescueCalls.length === 3 && plainRescueCalls[0].jsonMode === true && plainRescueCalls[1].jsonMode === true && plainRescueCalls[2].jsonMode === false);
  check('Dynamic plain rescue returns provider-visible text as non-authoritative recovery candidate, not MODEL_AVAILABILITY', plainRescueResult.status === 'GENERATED' && plainRescueResult.source === 'PLAIN_MODEL_RECOVERY' && plainRescueResult.finalReplySource === 'PLAIN_MODEL_RECOVERY' && plainRescueResult.draft === '这是 plain transport 恢复出的正常客户正文。' && plainRescueResult.protocolPreservation?.source === 'PLAIN_RECOVERY');
  check('Dynamic plain rescue retains all attempt diagnostics and never pretends structured bindings already exist', plainRescueResult.modelAttempts?.length === 3 && plainRescueResult.modelAttempts[2]?.mode === 'PLAIN_RECOVERY' && !plainRescueResult.structuredSegments && plainRescueResult.presentationIntent?.segments?.length === 1);

  const plainEnvelopeCalls = [];
  const plainEnvelope = new Generator({ generate: async input => {
    plainEnvelopeCalls.push(input);
    if (plainEnvelopeCalls.length <= 2) return { ...base, ok: false, status: 'MODEL_ERROR', content: '', errorMessage: 'structured transport unavailable' };
    return { ...base, ok: true, status: 'SUCCESS', content: '{\"foo\":\"bar\",\"baz\":\"qux\"}', visibleContentLength: 25 };
  } }, prompts);
  const plainEnvelopeResult = await plainEnvelope.generate(ordinaryContract, true);
  check('Dynamic plain rescue never raw-sends a non-recoverable machine envelope', plainEnvelopeCalls.length === 3 && plainEnvelopeResult.draft === null && plainEnvelopeResult.source === 'NONE' && plainEnvelopeResult.status === 'INVALID_RESPONSE' && plainEnvelopeResult.modelAttempts?.[2]?.status === 'INVALID_RESPONSE');

  const allAvailabilityCalls = [];
  const allAvailabilityFail = new Generator({ generate: async input => {
    allAvailabilityCalls.push(input);
    return { ...base, ok: false, status: 'MODEL_ERROR', content: '', errorMessage: 'down' };
  } }, prompts);
  const allAvailabilityResult = await allAvailabilityFail.generate(ordinaryContract, true);
  check('Dynamic true all-transport outage remains availability-only after three zero-visible attempts', allAvailabilityCalls.length === 3 && allAvailabilityResult.draft === null && allAvailabilityResult.status === 'MODEL_ERROR' && allAvailabilityResult.modelAttempts?.length === 3);

  const unconfiguredCalls = [];
  const unconfigured = new Generator({ generate: async input => {
    unconfiguredCalls.push(input);
    return { ...base, ok: false, status: 'MODEL_NOT_CONFIGURED', content: '', errorMessage: 'not configured' };
  } }, prompts);
  const unconfiguredResult = await unconfigured.generate(ordinaryContract, true);
  check('Dynamic model-not-configured remains a single honest availability failure and does not spend futile rescue calls', unconfiguredCalls.length === 1 && unconfiguredResult.status === 'MODEL_NOT_CONFIGURED' && unconfiguredResult.draft === null);

  const summaryOutageCalls = [];
  const summaryOutage = new Generator({ generate: async input => {
    summaryOutageCalls.push(input);
    return { ...base, ok: false, status: 'MODEL_ERROR', content: '', errorMessage: 'summary down' };
  } }, prompts);
  const summaryOutageResult = await summaryOutage.generate(summaryContract, true);
  check('Dynamic source-bound summary keeps its typed structured recovery path and never uses the ordinary plain rescue', summaryOutageCalls.length === 2 && summaryOutageCalls.every(call => call.jsonMode === true) && summaryOutageResult.status === 'MODEL_ERROR' && summaryOutageResult.draft === null);

  // Dynamic Delivery proof: quality FAIL/WARN is diagnostic and cannot veto a non-empty reply.
  const deliveryJs = transpile(rel.delivery, src.delivery);
  const deliveryBox = { exports: {}, module: { exports: {} }, require: id => {
    if (id === 'crypto') return require('crypto');
    if (id.includes('customer-service-message-delivery-planner')) return {
      buildCustomerServiceMessageDeliveryPlan: (_contract, draft) => draft && String(draft).trim() ? {
        // Intentionally stale presentation content: Delivery must demote metadata, not fail Send.
        mode: 'SINGLE', segments: [{ index: 0, content: 'STALE_PRESENTATION_METADATA', delayBeforeMs: 0, status: 'PLANNED' }],
        cancelRemainingOnCustomerMessage: true, boundarySource: 'GENERATION_PRESENTATION_INTENT', explicitBreakCount: 0, explicitSegmentCount: 1, reason: 'audit-stale',
      } : null,
      buildCustomerServiceExactSingleDeliveryPlan: (contract, draft, reason) => draft && String(draft).trim() ? {
        mode: 'SINGLE', segments: [{ index: 0, content: String(draft), delayBeforeMs: 0, status: 'PLANNED' }],
        cancelRemainingOnCustomerMessage: contract.strategyPolicy.resolved.delivery.cancelRemainingOnCustomerMessage,
        boundarySource: 'NONE', explicitBreakCount: 0, explicitSegmentCount: 0, reason,
      } : null,
    };
    if (id.includes('customer-service-final-candidate')) {
      const lexicalContentSha256 = value => require('crypto').createHash('sha256').update(String(value || '').replace(/\s+/gu, '')).digest('hex');
      return {
        lexicalContentSha256,
        buildCustomerServiceFinalCandidateIdentity: generation => ({
          schemaVersion: 1, authority: 'FINAL_CANDIDATE', lexicalSha256: lexicalContentSha256(generation.draft || ''),
          structuredSegmentSha256: null, segmentCount: String(generation.draft || '').trim() ? 1 : 0,
          structuredSegmentsAuthoritative: false, sealedAtStage: 'FINAL_CANDIDATE_SEAL',
        }),
      };
    }
    return {};
  }, console };
  deliveryBox.module.exports = deliveryBox.exports;
  vm.runInNewContext(deliveryJs.outputText, deliveryBox, { filename: rel.delivery });
  const finalize = deliveryBox.exports.finalizeCustomerServiceDelivery;
  const delivered = finalize({
    contract: {
      orchestrationPlan: { interactionExecution: { lane: 'HVE3_CANDIDATE' } },
      strategyPolicy: { resolved: { delivery: { cancelRemainingOnCustomerMessage: true } } },
    },
    generation: {
      draft: '质量诊断即使 FAIL 也不能吞掉这段非空正文。', hve3: { selectedCandidateIndex: 0 },
      candidateSafetyStatus: 'PASS', candidateQualityStatus: 'NOT_RUN', finalReplySource: 'MODEL',
      finalCandidateIdentity: { schemaVersion: 1, authority: 'FINAL_CANDIDATE', lexicalSha256: 'stale', structuredSegmentSha256: null, segmentCount: 1, structuredSegmentsAuthoritative: false, sealedAtStage: 'FINAL_CANDIDATE_SEAL' },
    },
    quality: { status: 'FAIL' },
  });
  check('Dynamic quality FAIL does not veto non-empty final reply', delivered.draft === '质量诊断即使 FAIL 也不能吞掉这段非空正文。' && delivered.deliveryPlan?.segments?.length === 1);
  check('Dynamic quality status is observational projection, not Send Authority', delivered.candidateQualityStatus === 'FAIL' && delivered.deliveryDecision === 'SEND_PRIMARY');
  check('Dynamic stale Final Candidate seal is diagnostic-only and reply is preserved', delivered.finalTextFreeze?.deliveryIntegrity?.candidateSealStatus === 'DRIFT_DEMOTED_TO_DIAGNOSTIC' && delivered.draft === '质量诊断即使 FAIL 也不能吞掉这段非空正文。');
  check('Dynamic stale Presentation metadata demotes to exact single bubble', delivered.finalTextFreeze?.deliveryIntegrity?.presentationIntegrityStatus === 'EXACT_SINGLE_DEMOTION' && delivered.deliveryPlan?.segments?.[0]?.content === delivered.draft);

  console.log(`\nGeneration Send Authority Seal: ${pass}/${pass + fail} PASS`);
  if (fail) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
