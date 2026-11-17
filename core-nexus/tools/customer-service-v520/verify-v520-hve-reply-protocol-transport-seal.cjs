#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const generatorRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts';
const promptRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const generatorSrc = fs.readFileSync(path.join(root, generatorRel), 'utf8');
const promptSrc = fs.readFileSync(path.join(root, promptRel), 'utf8');
const kernelSrc = fs.readFileSync(path.join(root, kernelRel), 'utf8');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}`); } }
function transpile(rel, code) {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
}
function descriptor(type) {
  return {
    semanticDefinition: `semantic:${type}`,
    authorityScope: ['RECOMMEND_GROUNDED_ITEM','EXPLAIN_GROUNDED_FACT'].includes(type) ? 'GROUNDED_BUSINESS' : 'PLAN_ONLY',
  };
}
function projectActs(acts = []) {
  return acts.map((act, index) => ({
    id: act.id || `ACT_${index}`,
    type: act.type,
    necessity: act.necessity || 'REQUIRED',
    semantic: `semantic:${act.type}`,
    authorityScope: descriptor(act.type).authorityScope,
    allowedGroundingRefs: [...new Set((act.grounding || []).filter(g => g.status === 'SATISFIED').flatMap(g => g.evidenceRefs || []))],
    parameters: act.parameters || {},
  }));
}
const contract = {
  orchestrationPlan: {
    route: 'MODEL_GENERATION',
    interactionExecution: { lane: 'HVE3_CANDIDATE' },
    interactionPlanV2: { acts: [{ id: 'A1', type: 'DIRECT_ANSWER', necessity: 'REQUIRED', grounding: [] }] },
  },
  generationContext: { summarySource: { authority: 'NONE', mode: 'NONE', transformMode: 'NONE', messages: [] } },
};

check('Prompt explicitly requires canonical HVE_REPLY_V2 Act-bound JSON object', promptSrc.includes('HVE_REPLY_V2') && promptSrc.includes('units') && promptSrc.includes('bindings') && promptSrc.includes('只返回这个 JSON object'));
check('Prompt requires standard JSON.parse-valid output', promptSrc.includes('必须能被标准 JSON.parse 直接解析'));
check('Ordinary HVE enables provider JSON-object mode', generatorSrc.includes("['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane))") && generatorSrc.includes('jsonMode: usesStructuredHveJsonProtocol(contract)'));
check('Runtime parser owns V2 plus legacy parsing but current HVE requires V2 authorization', generatorSrc.includes("protocol: 'HVE_REPLY_V2' | 'HVE_REPLY_V1' | 'LEGACY_PRESENTATION_V1' | 'NONE'") && generatorSrc.includes('requiresActBoundHveReplyV2') && generatorSrc.includes('HVE_REPLY_V2_REQUIRED'));
check('Legacy/raw compatibility cannot bypass current HVE Act-bound authorization', generatorSrc.includes('当前 HVE 客户回复必须使用 HVE_REPLY_V2 Act-bound 协议'));
check('Malformed machine envelope is distinguished from raw text at parser level', generatorSrc.includes('protocolEnvelopeDetected') && generatorSrc.includes('hasMalformedOrdinaryHveProtocolEnvelope'));
check('Literal JSON control characters get syntax-only repair', generatorSrc.includes('escapeInvalidJsonControlCharactersInsideStrings'));
check('Unknown/wrong top-level JSON object cannot be exposed verbatim in current HVE', generatorSrc.includes('protocolEnvelopeDetected') && generatorSrc.includes('draft: null'));
check('Protocol failure uses only existing single recovery call', (generatorSrc.match(/modelGateway\.generate\(/g) || []).length === 2 && generatorSrc.includes('deterministic protocol'));
check('Second invalid envelope fails closed instead of sending wrapper', generatorSrc.includes('asHveProtocolInvalidModelResult'));
check('No role/domain/keyword/length/bubble repair logic added', !/(女装|宠物|SaaS|关键词|softMaxChars|maxSegments|splitDraft)/.test(generatorSrc));
check('Historical v1.49 transport seal remains recorded under current kernel convergence', kernelSrc.includes('V1.49 HVE Reply Protocol Transport Seal'));

for (const [rel, src] of [[generatorRel, generatorSrc], [promptRel, promptSrc], [kernelRel, kernelSrc]]) {
  const out = transpile(rel, src);
  check(`${path.basename(rel)} syntax transpiles`, (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length === 0);
}

const js = transpile(generatorRel, generatorSrc + '\nexports.__parse = parseCustomerServiceChatPresentationProtocol;\nexports.__normalize = normalizeOrdinaryHveChatPresentation;\n');
const box = { exports: {}, module: { exports: {} }, require: id => {
  if (id === '@nestjs/common') return { Injectable: () => target => target };
  if (id.includes('customer-service-act-descriptor.registry')) return { getCustomerServiceActDescriptor: descriptor };
  if (id.includes('customer-service-nlg-execution-brief')) return { projectCustomerServiceCanonicalActsForSemanticFrame: projectActs };
  if (id.includes('source-bound-summary-protocol')) return { parseCustomerServiceTypedSourceBoundSummary: value => ({ protocolValid: false, visibleText: '', raw: value }) };
  return {};
}, console, process };
box.module.exports = box.exports;
vm.runInNewContext(js.outputText, box, { filename: generatorRel });
const parse = box.exports.__parse;
const normalize = box.exports.__normalize;

const repaired = parse('{"version":"HVE_REPLY_V2","segments":[{"text":"a\nb","units":[{"text":"a\nb","bindings":[{"actId":"A1","actType":"DIRECT_ANSWER","groundingRefs":[]}]}]}]}'.replace(/\\n/g, '\n'));
check('Literal newline inside V2 JSON string is structurally recovered', repaired.protocolValid === true && repaired.protocol === 'HVE_REPLY_V2' && repaired.segments[0] === 'a\nb');
const wrong = parse(JSON.stringify({ response: 'hello' }));
check('Wrong JSON schema is detected as machine envelope failure', wrong.protocolValid === false && wrong.protocolEnvelopeDetected === true);
const normalizedWrong = normalize(contract, { draft: JSON.stringify({ response: 'hello' }), visibleContentLength: 20 });
check('Direct current-HVE normalizer nulls wrong machine envelope instead of raw-sending it', normalizedWrong.draft === null && normalizedWrong.visibleContentLength === 0);
const legacy = parse(JSON.stringify({ version: 'HVE_REPLY_V1', segments: [{ text: 'legacy' }] }));
check('Legacy V1 remains parse-readable for compatibility', legacy.protocolValid === true && legacy.protocol === 'HVE_REPLY_V1');
const normalizedLegacy = normalize(contract, { draft: JSON.stringify({ version: 'HVE_REPLY_V1', segments: [{ text: 'legacy' }] }), visibleContentLength: 20 });
check('Legacy V1 cannot bypass V2 semantic authorization in current HVE', normalizedLegacy.draft === null);
const plain = parse('正常客户可见正文');
check('Plain non-JSON text remains distinguishable from a machine envelope at parser level', plain.protocolValid === false && plain.protocolEnvelopeDetected === false);
const normalizedPlain = normalize(contract, { draft: '正常客户可见正文', visibleContentLength: 8 });
check('Plain raw text cannot bypass V2 semantic authorization in current HVE', normalizedPlain.draft === null);

console.log(`\nHVE Reply Protocol Transport Seal: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
