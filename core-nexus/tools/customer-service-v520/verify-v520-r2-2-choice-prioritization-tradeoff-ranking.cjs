#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const planRel = 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const generationRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const plan = fs.readFileSync(path.join(root, planRel), 'utf8');
const generation = fs.readFileSync(path.join(root, generationRel), 'utf8');
const kernel = fs.readFileSync(path.join(root, kernelRel), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const choicePurpose = /const CHOICE_PRIORITIZATION_DECISION_PURPOSE = \[[\s\S]{0,2600}?\]\.join\('；'\);/m.exec(plan)?.[0] || '';
const directAnswerCreation = /type: 'DIRECT_ANSWER'[\s\S]{0,1800}?expectedInformationGain: 'ANSWER_CURRENT_FOCUS'/m.exec(plan)?.[0] || '';
const guidanceCreation = /type: 'PROVIDE_GENERAL_GUIDANCE'[\s\S]{0,2400}?expectedInformationGain: 'ADD_GENERAL_GUIDANCE'/m.exec(plan)?.[0] || '';
const groundedCreation = /type: 'RECOMMEND_GROUNDED_ITEM'[\s\S]{0,2200}?expectedInformationGain: 'ADD_GROUNDED_INFORMATION'/m.exec(plan)?.[0] || '';
const enrichGrounded = /else if \(act\.type === 'RECOMMEND_GROUNDED_ITEM'\)[\s\S]{0,1700}?expectedInformationGain:[\s\S]{0,250}?'ADD_GROUNDED_INFORMATION'/m.exec(plan)?.[0] || '';
const enrichDirect = /else if \(act\.type === 'DIRECT_ANSWER'\)[\s\S]{0,2200}?expectedInformationGain:[\s\S]{0,350}?'ANSWER_CURRENT_FOCUS'/m.exec(plan)?.[0] || '';

check('R2.2 remains inside existing value Acts; no ranking Act or second ranking authority',
  plan.includes("type: 'PROVIDE_GENERAL_GUIDANCE'")
    && plan.includes("type: 'DIRECT_ANSWER'")
    && !/type:\s*['\"](?:RANK|PRIORITIZE|TRADEOFF|CHOICE_RANK)/i.test(plan));

check('shared choice purpose is conditional on actual answer containing viable alternatives',
  choicePurpose.includes('实际答案需要同时处理多个可行候选、方向或方案')
    && choicePurpose.includes('基于当前已知条件形成真实取舍'));

check('materially distinguishable candidates must expose useful hierarchy',
  choicePurpose.includes('条件足以区分时')
    && choicePurpose.includes('更合适的方向自然优先')
    && choicePurpose.includes('存在实质劣势的候选平级铺开'));

check('material trade-off is surfaced when the affected candidate first becomes a viable direction',
  choicePurpose.includes('material trade-off')
    && choicePurpose.includes('第一次把它作为可行方向提供时'));

check('near-equal / insufficient-evidence / explicit comparison cases remain multi-option capable',
  choicePurpose.includes('当前条件确实不足以区分')
    && choicePurpose.includes('候选近似并列')
    && choicePurpose.includes('客户明确要求比较/列举'));

check('pure fact or single-conclusion turns cannot manufacture options or fake ranking',
  choicePurpose.includes('纯事实、单一结论')
    && choicePurpose.includes('不额外制造候选、伪排序'));

check('choice semantics are no longer limited to focus=RECOMMENDATION: DIRECT_ANSWER carries the shared purpose',
  directAnswerCreation.includes('CHOICE_PRIORITIZATION_DECISION_PURPOSE'));

check('PROVIDE_GENERAL_GUIDANCE carries the same choice semantics for recommendation/how-to/troubleshooting value',
  guidanceCreation.includes('CHOICE_PRIORITIZATION_DECISION_PURPOSE'));

check('grounded recommendation carries choice semantics while Grounding remains fact-only',
  groundedCreation.includes('CHOICE_PRIORITIZATION_DECISION_PURPOSE')
    && groundedCreation.includes('Grounding 只证明候选事实')
    && groundedCreation.includes('不创建推荐需求、排序理由或候选 quota'));

check('enrichActParameters preserves upstream grounded ranking purpose instead of overwriting it',
  enrichGrounded.includes('...(act.parameters || {})')
    && enrichGrounded.includes('decisionPurpose: act.parameters?.decisionPurpose')
    && enrichGrounded.includes("expectedInformationGain: act.parameters?.expectedInformationGain || 'ADD_GROUNDED_INFORMATION'"));

check('enrichActParameters preserves upstream DIRECT_ANSWER choice purpose instead of replacing it',
  enrichDirect.includes('...(act.parameters || {})')
    && enrichDirect.includes('decisionPurpose: act.parameters?.decisionPurpose ||')
    && enrichDirect.includes("known: act.parameters?.known?.length ? [...act.parameters.known] : knownNeeds"));

check('existing R2.1 state-guidance facts still feed Canonical known parameters',
  plan.includes("const stateExplicitFacts = (plan.stateGuidance?.explicitFacts || [])")
    && plan.includes('const knownNeeds = uniqueStrings([...human.statedNeeds, ...statePreferences, ...stateExplicitFacts])'));

check('Generation continues consuming existing Required Act target/decisionPurpose as semantic completion',
  generation.includes('`canonicalPlan.requiredActs[].parameters.target / decisionPurpose / expectedInformationGain`')
    && generation.includes('已选中的 Required value Act 必须在本轮真正完成'));

check('R2.2 adds no fixed count/rank-label output template or lexical/domain detector',
  choicePurpose.includes('不额外制造候选、伪排序、固定选项数、固定 rank label 或固定输出结构')
    && !/(maxRecommendationOptions|fixedOptionCount|rankLabelMap|recommendationKeywordMap|tradeoffKeyword|choiceKeywordMap)/i.test(plan));

check('R2.2 adds no second model/judge/repair or post-generation ranking path',
  !/(secondRecommendationModel|rankingJudge|choiceJudge|tradeoffJudge|postGenerationRank|rewriteRecommendation)/i.test(plan + generation));

check('kernel advances to v1.91 while keeping R2.1 SEALED and R2.2 active',
  kernel.includes("version: 'hve-3-v1.99'")
    && kernel.includes('V1.90 P0-5 R2.1 SEALED plus R2.2 Choice Prioritization and Trade-off Ranking START')
    && kernel.includes('V1.91 P0-5 R1 Regression-only Cross-layer Reception Authority Seal plus R2.2 Choice Coverage/Projection Closure'));

console.log(`\nR2.2 Choice Prioritization / Trade-off Ranking: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
