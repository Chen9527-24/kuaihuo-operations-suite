#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const nlgRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts';
const finalRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const generationRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const planRel = 'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const nlg = fs.readFileSync(path.join(root, nlgRel), 'utf8');
const finalAuthority = fs.readFileSync(path.join(root, finalRel), 'utf8');
const generation = fs.readFileSync(path.join(root, generationRel), 'utf8');
const plan = fs.readFileSync(path.join(root, planRel), 'utf8');
const kernel = fs.readFileSync(path.join(root, kernelRel), 'utf8');
let pass = 0, fail = 0;
function check(name, ok, detail='') {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}

const resolveBlock = nlg.slice(nlg.indexOf('function resolveServiceRealization('), nlg.indexOf('function normalizeMultiTurnPatternKey'));
const compileCall = nlg.slice(nlg.indexOf('const serviceRealization = resolveServiceRealization({'), nlg.indexOf('const serviceRealization = resolveServiceRealization({') + 700);
const frameGrounding = /grounding:\s*\{[\s\S]{0,900}?knowledge:\s*needsKnowledge\s*\?\s*audit\.grounding\.knowledge\s*:\s*\[\]/m.exec(nlg)?.[0] || '';

check('R2.2 grounded convergence stays inside existing service realization owner',
  resolveBlock.includes('R2.2 Grounded realization convergence')
    && !/(GroundingPlanner|GroundedPlanner|RecommendationPlanner|GroundingSelector)/.test(nlg));

check('service realization receives only existing grounded Knowledge availability as factual input',
  compileCall.includes('groundedKnowledgeAvailable: audit.grounding.knowledge.length > 0')
    && resolveBlock.includes('groundedKnowledgeAvailable: boolean'));

check('all already-selected value Acts are preserved before choosing a realization carrier',
  resolveBlock.includes('const selectedValueActs = plan.acts.filter')
    && resolveBlock.includes("'DIRECT_ANSWER'")
    && resolveBlock.includes("'PROVIDE_GENERAL_GUIDANCE'")
    && resolveBlock.includes("'RECOMMEND_GROUNDED_ITEM'")
    && resolveBlock.includes("'EXPLAIN_GROUNDED_FACT'"));

check('grounded realization carrier is eligible only when actual grounded Knowledge exists',
  resolveBlock.includes('const groundedValueAct = groundedKnowledgeAvailable')
    && resolveBlock.includes("['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(item.type)"));

check('no-grounding recommendation keeps required general guidance as the realization carrier before legacy fallback',
  resolveBlock.includes("plan.answerObligation?.responseTarget.focus === 'RECOMMENDATION'")
    && resolveBlock.includes("item.type === 'PROVIDE_GENERAL_GUIDANCE' && item.necessity === 'REQUIRED'")
    && resolveBlock.includes('const valueAct = groundedValueAct || requiredRecommendationGuidanceAct || selectedValueActs[0]'));

check('required guidance reverse protection cannot create or upgrade a Canonical Act',
  resolveBlock.includes('selectedValueActs.find')
    && !resolveBlock.includes("type: 'PROVIDE_GENERAL_GUIDANCE'")
    && !resolveBlock.includes("necessity: 'REQUIRED'"));

check('grounded carrier still outranks non-grounded recommendation guidance',
  resolveBlock.includes('const valueAct = groundedValueAct || requiredRecommendationGuidanceAct || selectedValueActs[0]'));

check('legacy first-value fallback remains only after grounded and required recommendation-guidance carriers are absent',
  resolveBlock.includes('|| selectedValueActs[0]'));

check('selected grounded carrier projects GROUNDED_INFORMATION rather than DIRECT',
  resolveBlock.includes("['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(valueAct.type) ? 'GROUNDED_INFORMATION'"));

check('selected grounded carrier projects GROUNDED_FACT contribution target',
  resolveBlock.includes("['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT'].includes(valueAct.type)")
    && resolveBlock.includes("? 'GROUNDED_FACT'"));

check('Canonical still controls whether Knowledge is exposed; realization cannot reopen all business Knowledge',
  nlg.includes("const needsKnowledge = ['RECOMMEND_GROUNDED_ITEM', 'EXPLAIN_GROUNDED_FACT']")
    && frameGrounding.includes('knowledge: needsKnowledge ? audit.grounding.knowledge : []'));

check('FinalHumanTurn consumes the same existing service-realization carrier without inventing a second selection layer',
  finalAuthority.includes('target: frame.serviceRealization.contribution.target')
    && finalAuthority.includes('currentTurnValueMode: frame.serviceRealization.currentTurnValue.mode')
    && finalAuthority.includes('requiredActs: cloneSemanticActs(frame.acts.required)')
    && finalAuthority.includes('preferredActs: cloneSemanticActs(frame.acts.preferred)'));

check('Generation still treats Canonical required Acts as mandatory even when grounded realization is primary',
  generation.includes('已选中的 Required value Act 必须在本轮真正完成')
    && generation.includes('canonicalPlan.requiredActs[].parameters.target / decisionPurpose / expectedInformationGain'));

check('existing R2.2 ranking purpose remains preserved on grounded recommendation',
  /type: 'RECOMMEND_GROUNDED_ITEM'[\s\S]{0,2200}?CHOICE_PRIORITIZATION_DECISION_PURPOSE/m.test(plan)
    && /else if \(act\.type === 'RECOMMEND_GROUNDED_ITEM'\)[\s\S]{0,1700}?decisionPurpose: act\.parameters\?\.decisionPurpose/m.test(plan));

check('R2.2 grounded closure adds no fixed candidate quota, phrase/domain branch, judge, repair or post-generation rewrite',
  !/(groundedCandidateCount|fixedGroundedCount|groundedRankLabel|groundedKeyword|groundingJudge|groundedJudge|rewriteGroundedRecommendation|postGenerationGround)/i.test(nlg + generation + plan));

check('reverse protection leaves the Generation kernel version and prompt authority unchanged',
  kernel.includes("version: 'hve-3-v1.99'")
    && kernel.includes('R1.18 REFROZEN plus R2.1 regression closure and R2.2 Grounded Realization Convergence')
    && !generation.includes('R2.2 reverse protection'));

console.log(`\nR2.2 Grounded Realization Convergence: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
