#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}`); } }
function syntax(file, source) {
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true, fileName: file });
  return !(result.diagnostics || []).some(item => item.category === ts.DiagnosticCategory.Error);
}

const plannerFile = 'src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts';
const runtimeFile = 'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts';
const channelFile = 'src/modules/customer-service-agent/runtime/channel/customer-service-channel-reply.service.ts';
const autoFile = 'src/modules/auto-replies/auto-replies.service.ts';
const constantsFile = 'src/modules/customer-service-agent/shared/constants/customer-service-calibration.constant.ts';
const planner = read(plannerFile);
const runtime = read(runtimeFile);
const channel = read(channelFile);
const auto = read(autoFile);
const constants = read(constantsFile);

check('历史 Delivery 校准问题类型仍可观测', constants.includes("'DELIVERY_SHOULD_SPLIT'") && constants.includes("'DELIVERY_SHOULD_MERGE'") && constants.includes("'DELIVERY_PACING'"));
check('Delivery 只接受 Generation 显式 segments 或 PC SINGLE', planner.includes('GENERATION_PRESENTATION_INTENT') && planner.includes('PC_EXPLICIT'));
check('Delivery 不再使用 HumanTurn segmentation 规划气泡', !planner.includes('typedSegmentation') && !planner.includes('humanSegmentation') && !planner.includes('HUMAN_TURN_SEQUENTIAL'));
check('Delivery 不再按 maxSegments 截断模型 segments', !planner.includes('limitSegments') && !/policy\.maxSegments/.test(planner));
check('Delivery 不再按 splitThresholdChars/标点/段落/长度拆正文', !/splitThresholdChars|splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion|splitDraft/.test(planner));
check('无可验证 model segments 时保持原文单消息', planner.includes('未收到可验证的 Generation segments；保留模型非空正文并按单条投递，不做后处理断句。'));
check('显式 PC SINGLE 只折叠展示不改写正文', planner.includes("policy.mode === 'SINGLE'") && planner.includes('仅折叠展示，不重新理解或改写正文'));
check('模型 segments 仍保留确定性发送延迟', planner.includes('deterministicDelay') && planner.includes('policy.minDelayMs') && planner.includes('policy.maxDelayMs'));
check('客户插话取消剩余消息能力保留', runtime.includes('cancelRemainingOnCustomerMessage: plan.cancelRemainingOnCustomerMessage') && channel.includes('cancelRemainingOnCustomerMessage'));
check('Robot Test Delivery 诊断保持 presentation-only', runtime.includes("authority: 'PRESENTATION_ONLY'") && auto.includes('hveDeliveryPlan: result.diagnostics?.deliveryPlan || null'));
check('Delivery planner TypeScript 可转译', syntax(plannerFile, planner));

const output = ts.transpileModule(planner, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const box = { exports: {}, module: { exports: {} }, require, console };
box.module.exports = box.exports;
vm.runInNewContext(output, box, { filename: plannerFile });
const buildPlan = box.exports.buildCustomerServiceMessageDeliveryPlan;
const baseDelivery = { mode: 'AUTO', maxSegments: 1, minDelayMs: 500, maxDelayMs: 900, splitThresholdChars: 20, cancelRemainingOnCustomerMessage: true };
const contract = { strategyPolicy: { resolved: { delivery: baseDelivery } }, provenance: { configurationHash: 'h3-v2' }, groundedContext: { latestCustomerMessage: '测试当前发送节奏' } };
const raw = '第一段正文。\n\n第二段只是同一条消息内排版。';
const noIntent = buildPlan(contract, raw, { humanTurnRealization: { turnComposition: { segmentation: 'PREFER_SEQUENTIAL' } } });
check('没有模型 segments 时空行/HumanTurn 偏好都不会制造多消息', noIntent.mode === 'SINGLE' && noIntent.segments.length === 1 && noIntent.segments[0].content === raw && noIntent.boundarySource === 'NONE');

const twoIntent = { schemaVersion: 1, authority: 'GENERATION_PRESENTATION_ONLY', segments: [
  { index: 0, content: '模型第一条。', source: 'STRUCTURED_CHAT_PRESENTATION' },
  { index: 1, content: '模型第二条。', source: 'STRUCTURED_CHAT_PRESENTATION' },
] };
const two = buildPlan(contract, '模型第一条。\n\n模型第二条。', null, null, twoIntent);
check('AUTO 精确消费模型两条 segments', two.mode === 'SEQUENTIAL' && two.segments.length === 2 && two.boundarySource === 'GENERATION_PRESENTATION_INTENT');
check('PC maxSegments=1 不再截断模型明确的两条消息', two.segments.length === 2);
check('第二条延迟仍落在 PC 延迟范围', two.segments[1].delayBeforeMs >= 500 && two.segments[1].delayBeforeMs <= 900);

const manyContents = ['一','二','三','四','五','六','七'].map(x => `模型${x}。`);
const manyIntent = { schemaVersion: 1, authority: 'GENERATION_PRESENTATION_ONLY', segments: manyContents.map((content,index)=>({ index, content, source:'STRUCTURED_CHAT_PRESENTATION' })) };
const many = buildPlan(contract, manyContents.join('\n\n'), null, null, manyIntent);
check('Delivery 不设固定气泡配额，模型 1/N segments 原样消费', many.segments.length === 7 && many.mode === 'SEQUENTIAL');

const singleContract = { ...contract, strategyPolicy: { resolved: { delivery: { ...baseDelivery, mode: 'SINGLE' } } } };
const collapsed = buildPlan(singleContract, '模型第一条。\n\n模型第二条。', null, null, twoIntent);
check('显式 PC SINGLE 可作为运营展示约束折叠为一条', collapsed.mode === 'SINGLE' && collapsed.segments.length === 1 && collapsed.boundarySource === 'PC_EXPLICIT');

console.log(`\nDelivery H3: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
