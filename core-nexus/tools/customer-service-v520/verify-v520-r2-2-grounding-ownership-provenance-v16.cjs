const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const check = (name, ok) => {
  if (!ok) throw new Error(`FAIL ${name}`);
  checks.push(name);
  console.log(`PASS ${name}`);
};

const knowledge = read('src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts');
const semantics = read('src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts');
const simulation = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const obligation = read('src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts');
const plan = read('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts');
const reply = read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const autoReplies = read('src/modules/auto-replies/auto-replies.service.ts');

check('named offering ownership is semantic-family bounded',
  semantics.includes("primaryScenario === 'PRODUCT_CONSULT'")
  && semantics.includes("primaryIntent === 'ASK_INFORMATION'")
  && semantics.includes('REFERENT:EXPLICIT_NAMED_OFFERING')
  && semantics.includes('FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE'));

check('structured grounding can finalize current business fact ownership',
  semantics.includes('finalizeCustomerServiceFactOwnershipFromGroundingEvidence')
  && semantics.includes('GROUNDING_ENTITY_MATCH:')
  && (semantics.includes("evidence.startsWith('TITLE_ENTITY_SURFACE_MATCH:')")
    || semantics.includes("evidence.startsWith('NAMED_OFFERING_EXACT_MATCH:')")));

check('knowledge retrieval has generic entity surface evidence',
  knowledge.includes('collectTitleEntitySurfaces')
  && knowledge.includes('TITLE_ENTITY_SURFACE_MATCH:')
  && knowledge.includes('structuredEntity')
  && knowledge.includes('NAMED_OFFERING_EXACT_MATCH:'));

check('current offering fact grounding requires exact structured entity evidence',
  knowledge.includes('isCustomerServiceCurrentMessageEntityGroundingEntry')
  && knowledge.includes('selectCustomerServiceBusinessFactGroundingEntries')
  && knowledge.includes("evidence.has('FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE')")
  && knowledge.includes('resolvedEntryIds.has(entry.id)'));

check('state-only knowledge cannot become current entity fact authority',
  knowledge.includes("entry.selectionReason === 'STATE'")
  && knowledge.includes("return input.entries.filter(isCustomerServiceCurrentMessageEntityGroundingEntry)"));

check('simulation finalizes ownership after knowledge retrieval before compile',
  (simulation.match(/finalizeCustomerServiceFactOwnershipFromGroundingEvidence/g) || []).length >= 3
  && simulation.includes('knowledgeEntries: sources.businessContext.knowledgeEntries'));

check('answer obligation evidence state uses eligible business fact grounding',
  obligation.includes('businessFactGroundingEntries')
  && obligation.includes("businessFactGroundingEntries.length > 0")
  && obligation.includes('BUSINESS_FACT_GROUNDING_ELIGIBLE:'));

check('canonical plan boundary is driven by eligible grounding not any related knowledge',
  plan.includes("target.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED' && !businessFactGroundingEntries.length")
  && plan.includes('ensureKnowledgeGrounding(businessFactGroundingEntries, grounding)'));

check('unknown business fact stays epistemically bounded while preserving useful general-domain help',
  plan.includes('当前已确认的业务事实不足以确认客户所指命名对象的当前问题')
  && plan.includes('只表达无法确认、不能据此推断的事实边界并保持未知')
  && plan.includes('不能推出该对象不存在、未上架、停售、售罄、无库存、未发布、店铺不提供')
  && !plan.includes('直接表达店铺当前不提供该命名对象')
  && plan.includes('不得向客户讲检索、查询、系统、Grounding、证据或内部“不命中”过程')
  && plan.includes('UNKNOWN_BUSINESS_FACT_GENERAL_HELP_REQUIRED')
  && plan.includes("type: 'PROVIDE_GENERAL_GUIDANCE'")
  && plan.includes('具体商家/商品/订单事实保持未知，但未知不等于拒答')
  && plan.includes('不能把通常情况改写成当前商品、库存、价格、订单、物流、售后时效或退换货状态'));

check('business fact act rejects assistant history as factual authority',
  plan.includes('历史助手文本')
  && (plan.includes('不能替代当前实体事实来源')
    || plan.includes('不能获得当前实体事实权限')
    || plan.includes('其他商品事实替代当前实体')));

check('grounding provenance audit is diagnostic-only',
  (reply.includes('R2_2_GROUNDING_PROVENANCE_AUDIT_V1') || reply.includes('R2_2_GROUNDING_PROVENANCE_AUDIT_V2'))
  && reply.includes("authority: 'DIAGNOSTIC_ONLY'")
  && reply.includes('affectsGeneration: false')
  && reply.includes('affectsDelivery: false'));

check('grounding audit exposes selected/allowed/realized provenance',
  reply.includes('selectedKnowledge')
  && reply.includes('groundedActs')
  && reply.includes('allowedGroundingRefs')
  && reply.includes('realizedGroundingRefs')
  && reply.includes('unitChecks'));

check('grounding audit exposes actual semantic-unit bindings and raw classifier evidence',
  reply.includes('semanticUnitBindings')
  && reply.includes('semanticSpans')
  && reply.includes('classifierResult')
  && reply.includes('authorizationChecks'));

const conformance = read('src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts');
check('Conformance preserves pre-normalization classifier refs without changing authorization',
  conformance.includes('classifierResult: {')
  && conformance.includes('realizedGroundingRefs: [...classification.realizedGroundingRefs]')
  && conformance.includes('semanticUnitBindings: unit.bindings.map')
  && conformance.includes('CLASSIFIER_REFS=')
  && conformance.includes('COMPATIBLE_BINDING_REFS='));

check('robot test API exposes grounding audit',
  autoReplies.includes('hveGroundingAudit: result.diagnostics?.groundingAudit || null'));

const fixturePattern = /QH-HVE|云感轻垂|青禾|冰丝极光|FASHION_APPAREL/;
const runtimeModified = [knowledge, semantics, simulation, obligation, plan, reply, autoReplies].join('\n');
check('no qinghe/product/test fixture branch in runtime fix', !fixturePattern.test(runtimeModified));

console.log(`\nR2.2 Grounding Ownership + Provenance V16: ${checks.length}/${checks.length} PASS`);
