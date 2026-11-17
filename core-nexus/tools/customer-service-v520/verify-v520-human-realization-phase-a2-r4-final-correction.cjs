#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const files = {
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  generator: 'src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts',
  planner: 'src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts',
  runtime: 'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
  candidate: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-candidate.ts',
  arbiter: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-delivery-arbiter.ts',
};
const src = Object.fromEntries(Object.entries(files).map(([key, rel]) => [key, fs.readFileSync(path.join(root, rel), 'utf8')]));
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}`); } }
function transpile(rel, code) {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
}

const system = src.prompt.slice(src.prompt.indexOf('function buildHumanConversationSystemPrompt'), src.prompt.indexOf('function buildHveModelFacingGenerationFrame'));
check('Primary generation uses canonical HVE_REPLY_V2 segments contract', system.includes('HVE_REPLY_V2') && system.includes('segments 数组元素边界') && !system.includes('Chat Presentation Contract V2'));
check('Presentation segment count remains natural rather than fixed', system.includes('不存在固定配额'));
check('Only model-authored segments are message boundaries; text newlines are not Runtime segmentation authority', system.includes('segment.text/unit.text 中的换行、制表符必须作为合法 JSON 字符串转义') && system.includes('只有 segments 数组元素边界才是实际发送消息边界'));
check('No old magic presentation marker remains model-facing', !src.prompt.includes('HVE_PRESENTATION_BREAK') && !src.generator.includes('HVE_PRESENTATION_BREAK'));
check('No role/domain/test-sentence Runtime branch introduced', !/(宠物|柯基|女装|通勤|技术支持|外卖员|咬沙发|碎花裙)/.test(src.generator + src.planner));
check('No new presentation Gate/Judge/Repair authority added', !/PresentationJudge|BubbleJudge|TypographyGate|SymbolCleaner|Humanizer|PersonaRepair|RewriteGate/i.test(src.prompt + src.generator + src.planner));
check('Ordinary HVE now uses provider JSON-object mode for canonical HVE_REPLY_V2 transport', src.generator.includes('jsonMode: usesStructuredHveJsonProtocol(contract)') && src.generator.includes("['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane))"));
check('Non-empty customer-visible content still returns without recovery unless it is a malformed machine envelope', src.generator.includes('if (initial.ok && !initialProtocolFailure)') && src.generator.includes('return normalizeStructuredHveGeneration'));
check('Malformed machine envelope may use only the existing structural recovery, never a semantic quality retry', src.generator.includes('hasMalformedOrdinaryHveProtocolEnvelope') && src.generator.includes('deterministic protocol') && (src.generator.match(/modelGateway\.generate\(/g) || []).length === 2);
check('Ordinary true-availability recovery keeps canonical provider JSON-object mode', src.generator.includes('buildAvailabilityRecovery') && src.generator.includes('jsonMode: recoveryRequiresStructuredProtocol'));
check('Ordinary Presentation V2 always preserves non-empty provider-visible text', src.generator.includes('normalizeOrdinaryHveChatPresentation') && src.generator.includes('const providerText = generation.draft?.trim() || null'));
check('Summary provenance invalidity cannot erase non-empty provider text', src.generator.includes('summaryTransformation.visibleText.trim() || generation.draft.trim()'));
check('No protocol invalidator may null an already non-empty draft', !/invalidateCustomerServiceChatPresentationProtocol|invalidateSourceBoundSummary|hasInvalidSourceBoundSummary/.test(src.generator));
check('Exactly one existing recovery call remains', (src.generator.match(/modelGateway\.generate\(/g) || []).length === 2);
check('Delivery does not heuristically split paragraphs/punctuation/length', !/splitDraft|splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion/.test(src.planner) && src.planner.includes('保留模型非空正文并按单条投递，不做后处理断句'));
check('Final Candidate stale presentation metadata can still be demoted without changing draft', src.candidate.includes('isPresentationIntentConsistent') && src.candidate.includes('presentationIntent: undefined'));
check('Final Delivery still consumes frozen presentation intent', src.arbiter.includes('generation.presentationIntent || null'));

for (const [key, rel] of Object.entries(files)) {
  const out = transpile(rel, src[key]);
  check(`${path.basename(rel)} syntax transpiles`, (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length === 0);
}

function descriptor(type) { return { semanticDefinition: `semantic:${type}`, authorityScope: ['RECOMMEND_GROUNDED_ITEM','EXPLAIN_GROUNDED_FACT'].includes(type) ? 'GROUNDED_BUSINESS' : 'PLAN_ONLY' }; }
function projectActs(acts = []) { return acts.map((act, index) => ({ id: act.id || `ACT_${index}`, type: act.type, necessity: act.necessity || 'REQUIRED', semantic: `semantic:${act.type}`, authorityScope: descriptor(act.type).authorityScope, allowedGroundingRefs: [...new Set((act.grounding || []).filter(g => g.status === 'SATISFIED').flatMap(g => g.evidenceRefs || []))], parameters: act.parameters || {} })); }
const generatorJs = transpile(files.generator, src.generator + '\nexports.__parseChatPresentation = parseCustomerServiceChatPresentationProtocol;\nexports.__normalizeOrdinaryChat = normalizeOrdinaryHveChatPresentation;\n');
const gbox = { exports: {}, module: { exports: {} }, require: (id) => {
  if (id === '@nestjs/common') return { Injectable: () => target => target };
  if (id.includes('customer-service-act-descriptor.registry')) return { getCustomerServiceActDescriptor: descriptor };
  if (id.includes('customer-service-nlg-execution-brief')) return { projectCustomerServiceCanonicalActsForSemanticFrame: projectActs };
  if (id.includes('source-bound-summary-protocol')) return {
    parseCustomerServiceTypedSourceBoundSummary: value => ({
      schemaVersion: 3,
      mode: 'SOURCE_BOUND_SUMMARY',
      outputFormat: 'TYPED_JSON_SOURCE_BINDINGS',
      protocolDetected: false,
      protocolValid: false,
      visibleText: '',
      issueKeys: ['TEST_INVALID'],
      items: [],
      raw: value,
    }),
  };
  return {};
}, console, process };
gbox.module.exports = gbox.exports;
vm.runInNewContext(generatorJs.outputText, gbox, { filename: files.generator });
const parse = gbox.exports.__parseChatPresentation;
const normalizeOrdinary = gbox.exports.__normalizeOrdinaryChat;
const one = parse(JSON.stringify({ presentationSegments: ['自然的一条聊天消息。'] }));
const two = parse(JSON.stringify({ presentationSegments: ['先给当前判断。', '完整流程：\n阶段一先做这个。\n阶段二再做那个。'] }));
const objectShape = parse(JSON.stringify({ presentationSegments: [{ text: '第一泡。\n\n第二泡。' }] }));
check('Legacy V1 string[] presentation still parses for protocol compatibility', one.protocolValid === true && two.protocolValid === true && two.segments.length === 2);
check('Legacy V1 object-text shape is accepted as protocol compatibility', objectShape.protocolValid === true && objectShape.segments.length === 1);
check('Plain customer text is not mistaken for legacy JSON metadata', parse('模型已经给出的自然正文').protocolValid === false);

const Generator = gbox.exports.CustomerServiceReplyGenerator;
const attemptBase = {
  requestedModel: 'test-model', actualModel: 'test-model', model: 'test-model', elapsedMs: 5,
  requestId: 'req', usage: {}, finishReason: 'stop', thinkingMode: 'DISABLED', requestedMaxTokens: 800,
  effectiveMaxTokens: 800, timeoutMs: 1000, reasoningContentLength: 0, visibleContentLength: 0,
  emptyContentReason: null, truncated: false, timedOut: false, errorMessage: null,
};
const ordinaryContract = {
  orchestrationPlan: { route: 'MODEL_GENERATION', interactionExecution: { lane: 'HVE3_CANDIDATE' }, interactionPlanV2: { acts: [{ id: 'A1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', grounding: [] }] } },
  generationContext: { summarySource: { authority: 'NONE', mode: 'NONE', transformMode: 'NONE', messages: [] } },
};
const promptBuilder = {
  build: () => ({ system: 'primary', user: 'primary' }),
  buildCompact: () => ({ system: 'summary recovery', user: 'summary recovery' }),
  buildAvailabilityRecovery: () => ({ system: 'plain recovery', user: 'plain recovery' }),
};
const v2 = texts => JSON.stringify({ version: 'HVE_REPLY_V2', segments: texts.map(text => ({ text, units: [{ text, bindings: [{ actId: 'A1', actType: 'DIRECT_ANSWER', groundingRefs: [] }] }] })) });

(async () => {
  const primaryCalls = [];
  const primaryGenerator = new Generator({ generate: async input => {
    primaryCalls.push(input);
    return { ...attemptBase, ok: true, status: 'SUCCESS', content: v2(['第一泡自然正文。', '第二泡自然正文。']), visibleContentLength: 80 };
  } }, promptBuilder);
  const primary = await primaryGenerator.generate(ordinaryContract, true);
  check('HVE_REPLY_V2 primary preserves model-authored segments', primary.draft === '第一泡自然正文。\n\n第二泡自然正文。' && primary.presentationIntent?.segments?.length === 2 && primary.source === 'MODEL');
  check('Ordinary primary uses provider jsonMode=true and valid HVE_REPLY_V2 never retries', primaryCalls.length === 1 && primaryCalls[0].jsonMode === true && primary.compactRetryAttempted === false);

  const recoveryCalls = [];
  const recoveryGenerator = new Generator({ generate: async input => {
    recoveryCalls.push(input);
    if (recoveryCalls.length === 1) return { ...attemptBase, ok: false, status: 'EMPTY_CONTENT', content: '', emptyContentReason: 'NULL_OR_MISSING_CONTENT', errorMessage: 'empty' };
    return { ...attemptBase, ok: true, status: 'SUCCESS', content: v2(['真正无正文后的唯一恢复回复。']), visibleContentLength: 100 };
  } }, promptBuilder);
  const recovered = await recoveryGenerator.generate(ordinaryContract, true);
  check('True provider no-content still receives exactly one availability recovery', recoveryCalls.length === 2 && recovered.draft === '真正无正文后的唯一恢复回复。' && recovered.source === 'COMPACT_MODEL_RETRY');
  check('Ordinary availability recovery keeps provider jsonMode=true and returns one valid V2 segment', recoveryCalls[1].jsonMode === true && recovered.presentationIntent?.segments?.length === 1 && recovered.structuredSegments?.[0]?.semanticUnits?.length === 1);

  const legacyNormalized = normalizeOrdinary(ordinaryContract, { draft: JSON.stringify({ presentationSegments: [{ text: '旧协议第一泡。\n\n旧协议第二泡。' }] }), visibleContentLength: 40 });
  check('Observed legacy object-array wrapper is parse-readable but cannot bypass V2 in current HVE', legacyNormalized.draft === null);

  const plannerJs = transpile(files.planner, src.planner);
  const dbox = { exports: {}, module: { exports: {} }, require, console };
  dbox.module.exports = dbox.exports;
  vm.runInNewContext(plannerJs.outputText, dbox, { filename: files.planner });
  const buildPlan = dbox.exports.buildCustomerServiceMessageDeliveryPlan;
  const contract = {
    strategyPolicy: { resolved: { delivery: { mode: 'AUTO', maxSegments: 6, minDelayMs: 500, maxDelayMs: 1200, splitThresholdChars: 20, cancelRemainingOnCustomerMessage: true } } },
    businessContext: { conversationStrategy: { policy: { humanBehavior: { segmentation: 'AUTO' } } } },
    provenance: { configurationHash: 'r4-final-correction' }, groundedContext: { latestCustomerMessage: '当前问题' },
  };
  const diag = { humanTurnRealization: { turnComposition: { segmentation: 'SINGLE' } } };
  const twoIntent = primary.presentationIntent;
  const p2 = buildPlan(contract, primary.draft, diag, null, twoIntent);
  const pLegacy = buildPlan(contract, '旧协议兼容展示只在非当前HVE路径使用。', diag, null, null);
  const pMissing = buildPlan(contract, '普通第一段。\n\n普通第二段！这段很长，也不应该因为句号、感叹号或固定长度被 Delivery 猜成多个气泡。', diag, null, null);
  check('Explicit Generation presentation still yields multiple bubbles', p2.mode === 'SEQUENTIAL' && p2.segments.length === 2 && p2.boundarySource === 'GENERATION_PRESENTATION_INTENT');
  check('Delivery without validated V2 presentation intent stays one message', pLegacy.mode === 'SINGLE' && pLegacy.segments.length === 1);
  check('Missing presentation intent always keeps one bubble regardless of punctuation/paragraph/length', pMissing.mode === 'SINGLE' && pMissing.segments.length === 1 && pMissing.boundarySource === 'NONE');

  console.log(`\nA2-R4 Final Closure Correction: ${pass}/${pass + fail} PASS`);
  if (fail) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
