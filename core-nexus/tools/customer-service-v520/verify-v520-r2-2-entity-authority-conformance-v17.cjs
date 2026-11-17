const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

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
const plan = read('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts');
const planType = read('src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan.type.ts');
const reply = read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const hveExecution = read('src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts');
const generator = read('src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts');
const conformance = read('src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts');
const answerObligation = read('src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts');

const loadTsModule = (source, fileName, requireStub = () => ({})) => {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName,
  });
  const syntaxErrors = (transpiled.diagnostics || [])
    .filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (syntaxErrors.length) throw new Error(`FAIL ${fileName} TypeScript syntax`);
  const box = { exports: {}, module: { exports: {} }, require: requireStub, console };
  box.module.exports = box.exports;
  vm.runInNewContext(transpiled.outputText, box, { filename: fileName });
  return box.module.exports;
};

const knowledgeRuntime = loadTsModule(
  knowledge,
  'customer-service-knowledge.util.ts',
  (id) => {
    if (id.includes('customer-service-industry-code.util')) {
      return { canonicalizeCustomerServiceIndustryCode: (value) => String(value || '').trim().toUpperCase() || null };
    }
    if (id.includes('customer-service-business-scope.util')) {
      return { isCustomerServiceKnowledgeIndustryCoherent: () => ({ coherent: true, reason: null }) };
    }
    return {};
  },
);
const semanticsRuntime = loadTsModule(
  semantics,
  'customer-service-explicit-semantics.ts',
);
const answerObligationRuntime = loadTsModule(
  answerObligation,
  'customer-service-answer-obligation.ts',
  (id) => id.includes('customer-service-knowledge.util') ? knowledgeRuntime : {},
);

check('quoted named offering uses whole-span exact identity authority',
  knowledge.includes('collectExplicitNamedOfferingSpans')
  && knowledge.includes('NAMED_OFFERING_EXACT_MATCH:')
  && knowledge.includes('the whole quoted span must match one canonical identity surface'));

check('fragment retrieval evidence cannot become entity authority',
  knowledge.includes('Retrieval similarity is intentionally NOT entity authority')
  && !/return evidence\.has\('ENTITY_KEY_MATCH'\)[\s\S]{0,180}TITLE_ENTITY_SURFACE_MATCH/.test(knowledge)
  && knowledge.includes("item.startsWith('NAMED_OFFERING_EXACT_MATCH:')"));

check('unquoted exact identity stays in Knowledge while unmatched referent authority moves to typed Understanding state',
  knowledge.includes("surface.kind === 'QUOTED_LABEL'")
  && knowledge.includes("surface.kind === 'PRODUCT_CORE' || surface.kind === 'FULL_TITLE'")
  && knowledge.includes("kind: 'UNQUOTED_ALIAS_EXACT'")
  && knowledge.includes("kind: 'TITLE_LABEL_EXACT'")
  && knowledge.includes('hasWholeUnquotedNamedOfferingSurface')
  && !knowledge.includes('resolveCurrentNamedOfferingIdentityConflict')
  && !knowledge.includes('NAMED_OFFERING_IDENTITY_CONFLICT:')
  && semantics.includes('MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT')
  && semantics.includes('resolveUnmatchedNamedOfferingReferent')
  && semantics.includes("'KNOWN_IDENTITY_EXTENSION'")
  && semantics.includes("'MERCHANT_NAMED_SUBJECT'")
  && knowledge.includes("kind: 'CORE_EXACT'")
  && knowledge.includes("kind: 'ENTITY_KEY_EXACT'"));

check('typed named-offering projection is the primary exact-identity path and mismatches cannot fall back to lexical authority',
  knowledge.includes("kind: 'TYPED_MENTION_EXACT'")
  && knowledge.includes('hasTypedMentionProjection')
  && knowledge.includes('canonicalSurfaces.has(mention)')
  && knowledge.includes('It cannot override a present typed mismatch'));

check('current offering grounding is scoped by resolved entry id',
  knowledge.includes("item.startsWith('GROUNDING_ENTITY_MATCH:')")
  && knowledge.includes('resolvedEntryIds.has(entry.id)')
  && knowledge.includes('isCustomerServiceCurrentMessageEntityGroundingEntry(entry)'));

check('fact ownership enriches already-current business facts with exact entity resolution',
  !semantics.includes("if (input.ownership.scope === 'CURRENT_BUSINESS_FACT') return input.ownership;")
  && semantics.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY')
  && semantics.includes('GROUNDING_ENTITY_MATCH:'));

const inventedNamedOfferingMessage = '你们店里有「不存在的极光西装」吗？它是什么面料和尺码？';
const inventedNamedOfferingOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  inventedNamedOfferingMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const inventedNamedOfferingFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: inventedNamedOfferingOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: inventedNamedOfferingMessage,
  knowledgeEntries: [],
});
check('named product attributes outrank broad merchant capability and fail closed when invented',
  inventedNamedOfferingOwnership.evidence.includes('FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE')
  && inventedNamedOfferingOwnership.evidence.includes('REFERENT:EXPLICIT_NAMED_OFFERING')
  && !inventedNamedOfferingOwnership.evidence.includes('FACT_DIMENSION:MERCHANT_SERVICE_CAPABILITY')
  && inventedNamedOfferingFinalOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: [],
    factOwnership: inventedNamedOfferingFinalOwnership,
  }).length === 0);

// Assert the protected behavior, not the explanatory prose in reason.
const similarNamedOfferingEntries = [{
  id: 'SIMILAR_ONLY', entityType: 'PRODUCT', entityKey: 'SIMILAR_ONLY',
  title: '极光西装', aliases: [], selectionReason: 'CURRENT_MESSAGE',
  matchEvidence: ['CONTENT:西装', 'TITLE:极光'],
}];
const unmatchedWithSimilarKnowledge = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: inventedNamedOfferingOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: inventedNamedOfferingMessage,
  knowledgeEntries: similarNamedOfferingEntries,
});
check('unmatched named offering remains current-business boundary without similarity promotion',
  unmatchedWithSimilarKnowledge.scope === 'CURRENT_BUSINESS_FACT'
  && unmatchedWithSimilarKnowledge.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && unmatchedWithSimilarKnowledge.namedOfferingReferent.resolvedGroundingIds.length === 0
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: similarNamedOfferingEntries,
    factOwnership: unmatchedWithSimilarKnowledge,
  }).length === 0);

check('ambiguous exact entity identity fails closed to boundary',
  semantics.includes('REFERENT_RESOLUTION:AMBIGUOUS_EXACT_STRUCTURED_ENTITY')
  && semantics.includes('entityOwners.size > 1'));

const baseOwnership = {
  authority: 'MESSAGE_UNDERSTANDING_FACT_OWNERSHIP',
  scope: 'CURRENT_BUSINESS_FACT',
  confidence: 0.97,
  evidence: ['FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE', 'REFERENT:EXPLICIT_NAMED_OFFERING'],
  reason: 'fixture',
  namedOfferingReferent: {
    authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
    status: 'PRESENT_UNRESOLVED',
    source: 'EXPLICIT_QUOTED',
    surface: 'same-name',
    resolvedGroundingIds: [],
  },
};
const exactEntries = [
  { id: 'ENTRY_A', entityType: 'PRODUCT', entityKey: 'PRODUCT_A', selectionReason: 'CURRENT_MESSAGE', matchEvidence: ['NAMED_OFFERING_EXACT_MATCH:same-name'] },
  { id: 'ENTRY_B', entityType: 'PRODUCT', entityKey: 'PRODUCT_B', selectionReason: 'CURRENT_MESSAGE', matchEvidence: ['NAMED_OFFERING_EXACT_MATCH:same-name'] },
];
const ambiguousOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: baseOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  knowledgeEntries: exactEntries,
});
const ambiguousGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: exactEntries,
  factOwnership: ambiguousOwnership,
});
check('ambiguous owner cannot fall back to multiple exact grounding candidates',
  ambiguousOwnership.evidence.includes('REFERENT_RESOLUTION:AMBIGUOUS_EXACT_STRUCTURED_ENTITY')
  && ambiguousGrounding.length === 0);

const unmatchedOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: baseOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  knowledgeEntries: [],
});
const unmatchedGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: exactEntries,
  factOwnership: unmatchedOwnership,
});
check('unmatched owner cannot re-authorize related product candidates',
  unmatchedOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
  && unmatchedGrounding.length === 0);


check('typed unmatched referent blocks candidate exact evidence from regaining Grounding authority',
  knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: exactEntries,
    factOwnership: {
      ...baseOwnership,
      namedOfferingReferent: {
        authority: 'MESSAGE_UNDERSTANDING_NAMED_OFFERING_REFERENT',
        status: 'UNMATCHED_NAMED_OFFERING',
        source: 'KNOWN_IDENTITY_EXTENSION',
        surface: 'same-name-plus-extension',
        resolvedGroundingIds: [],
      },
    },
  }).length === 0);

const resolvedOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: baseOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  knowledgeEntries: [exactEntries[0]],
});
const resolvedGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: exactEntries,
  factOwnership: resolvedOwnership,
});
check('resolved owner authorizes only its concrete entry id',
  resolvedGrounding.length === 1 && resolvedGrounding[0].id === 'ENTRY_A');

const runtimeEntry = (overrides) => ({
  id: 'ENTRY',
  collectionId: null,
  scopeType: 'ACCOUNT',
  scopeKey: 'ACCOUNT_A',
  entityType: 'PRODUCT',
  entityKey: 'PRODUCT',
  aliases: [],
  structuredData: null,
  references: [],
  authorityLevel: 'BUSINESS_FACT',
  category: 'PRODUCT',
  title: '商品',
  question: null,
  content: '商品事实。',
  tags: [],
  sourceType: 'MANUAL',
  sourceReference: null,
  revision: 1,
  effectiveFrom: null,
  effectiveTo: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});
const exactIdentityEntry = runtimeEntry({
  id: 'EXACT_PRODUCT',
  entityKey: 'P001',
  title: '「云感轻垂」通勤西裤',
  aliases: ['云感轻垂通勤西裤'],
  content: '聚酯纤维、粘胶与氨纶混纺；颜色和尺码以结构化数据为准。',
});
const unquotedAliasEntry = runtimeEntry({
  id: 'M7_PRODUCT',
  entityKey: 'MQ-CLOUD-BED-M7',
  title: '毛球云朵猫窝 M7 清洗说明',
  aliases: ['毛球云朵猫窝M7', '云朵猫窝M7', 'M7猫窝'],
  content: '外套可冷水轻柔机洗；内胆不可机洗，只能局部擦拭后自然阴干；内胆不可烘干。',
});
const canonicalQuotedLabelEntry = runtimeEntry({
  id: 'CANONICAL_LABEL_PRODUCT',
  entityKey: 'PRODUCT-P002',
  title: '青禾「清风棉麻」短袖衬衫',
  aliases: [],
  content: '棉55%、亚麻30%、粘胶15%的混纺。',
});

const typedCanonicalCoreMessage = '清风棉麻短袖衬衫在高温高湿通勤是不是挺合适？';
const typedCanonicalCoreSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: typedCanonicalCoreMessage,
    namedOfferingMentionSpans: ['清风棉麻短袖衬衫'],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
check('typed canonical core remains exact even when an open-language scenario clause follows without punctuation',
  typedCanonicalCoreSelection.selected.length === 1
  && typedCanonicalCoreSelection.selected[0].currentMessageEntityIdentity?.kind === 'TYPED_MENTION_EXACT'
  && typedCanonicalCoreSelection.selected[0].currentMessageEntityIdentity?.surface === '清风棉麻短袖衬衫');

const typedInventedLongerMessage = '清风棉麻短袖衬衫至尊纪念版是纯棉的吗？';
const typedInventedLongerSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: typedInventedLongerMessage,
    namedOfferingMentionSpans: ['清风棉麻短袖衬衫至尊纪念版'],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
check('typed longer invented offering cannot be truncated to a known canonical core for exact identity',
  typedInventedLongerSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedInventedLongerSelection.selected.every((entry) => !(entry.matchEvidence || []).some((item) => String(item).startsWith('NAMED_OFFERING_EXACT_MATCH:'))));

const typedPartialMentionMessage = '棉麻的成分是什么？';
const typedPartialMentionSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: typedPartialMentionMessage,
    namedOfferingMentionSpans: ['棉麻'],
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
check('typed partial offering surface remains retrieval-only and cannot acquire exact entity authority',
  typedPartialMentionSelection.selected.every((entry) => !entry.currentMessageEntityIdentity)
  && typedPartialMentionSelection.selected.every((entry) => !(entry.matchEvidence || []).some((item) => String(item).startsWith('NAMED_OFFERING_EXACT_MATCH:'))));
const canonicalQuotedLabelMessage = '这件清风棉麻是纯棉的吗？';
const canonicalQuotedLabelSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: canonicalQuotedLabelMessage,
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const canonicalQuotedLabelOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  canonicalQuotedLabelMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const canonicalQuotedLabelFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: canonicalQuotedLabelOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: canonicalQuotedLabelMessage,
  knowledgeEntries: canonicalQuotedLabelSelection.selected,
});
const canonicalQuotedLabelGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: canonicalQuotedLabelSelection.selected,
  factOwnership: canonicalQuotedLabelFinalOwnership,
});
check('canonical quoted title label repeated unquoted can recover exact current-product ownership and scoped grounding',
  canonicalQuotedLabelOwnership.scope === 'GENERAL_DOMAIN'
  && canonicalQuotedLabelSelection.selected.length === 1
  && canonicalQuotedLabelSelection.selected[0].matchEvidence.some((item) => item === 'NAMED_OFFERING_EXACT_MATCH:清风棉麻')
  && canonicalQuotedLabelFinalOwnership.scope === 'CURRENT_BUSINESS_FACT'
  && canonicalQuotedLabelFinalOwnership.evidence.includes('FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE')
  && canonicalQuotedLabelFinalOwnership.evidence.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY')
  && canonicalQuotedLabelGrounding.length === 1
  && canonicalQuotedLabelGrounding[0].id === 'CANONICAL_LABEL_PRODUCT');

const extendedCanonicalLabelMessage = '这件清风棉麻至尊纪念版是纯棉的吗？';
const extendedCanonicalLabelSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: extendedCanonicalLabelMessage,
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const extendedCanonicalLabelOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  extendedCanonicalLabelMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const extendedCanonicalLabelFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: extendedCanonicalLabelOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: extendedCanonicalLabelMessage,
  knowledgeEntries: extendedCanonicalLabelSelection.selected,
});
const extendedCanonicalLabelGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: extendedCanonicalLabelSelection.selected,
  factOwnership: extendedCanonicalLabelFinalOwnership,
});
check('longer invented unquoted name becomes typed unmatched referent without retrieval-owned conflict evidence',
  extendedCanonicalLabelOwnership.scope === 'GENERAL_DOMAIN'
  && extendedCanonicalLabelSelection.selected.every((entry) =>
    !entry.matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_EXACT_MATCH:'))
    && !entry.matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_IDENTITY_CONFLICT:')))
  && extendedCanonicalLabelFinalOwnership.scope === 'CURRENT_BUSINESS_FACT'
  && extendedCanonicalLabelFinalOwnership.evidence.includes('FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE')
  && extendedCanonicalLabelFinalOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
  && extendedCanonicalLabelFinalOwnership.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && extendedCanonicalLabelFinalOwnership.namedOfferingReferent.source === 'KNOWN_IDENTITY_EXTENSION'
  && extendedCanonicalLabelFinalOwnership.namedOfferingReferent.surface === '清风棉麻至尊纪念版'
  && extendedCanonicalLabelGrounding.length === 0);


const liveRegressionMessage = '那清风棉麻至尊纪念版也是这个成分吗？';
const liveRegressionSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: liveRegressionMessage,
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const liveRegressionInitialOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  liveRegressionMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const liveRegressionFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: liveRegressionInitialOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: liveRegressionMessage,
  merchantIdentitySurfaces: ['青禾'],
  knowledgeEntries: liveRegressionSelection.selected,
});
const liveRegressionGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: liveRegressionSelection.selected,
  factOwnership: liveRegressionFinalOwnership,
});
check('live regression: discourse prefix plus longer known identity resolves to typed unmatched business fact',
  liveRegressionInitialOwnership.scope === 'GENERAL_DOMAIN'
  && liveRegressionSelection.selected.some((entry) =>
    entry.matchEvidence.some((item) => item === 'TITLE_ENTITY_SURFACE_MATCH:清风棉麻'))
  && liveRegressionSelection.selected.every((entry) =>
    !entry.matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_EXACT_MATCH:')))
  && liveRegressionFinalOwnership.scope === 'CURRENT_BUSINESS_FACT'
  && liveRegressionFinalOwnership.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && liveRegressionFinalOwnership.namedOfferingReferent.source === 'KNOWN_IDENTITY_EXTENSION'
  && liveRegressionFinalOwnership.namedOfferingReferent.surface === '清风棉麻至尊纪念版'
  && liveRegressionGrounding.length === 0);

const liveRegressionObligation = answerObligationRuntime.resolveCustomerServiceAnswerObligation({
  interactionType: 'PRODUCT_FACT_QUERY',
  latestCustomerMessage: liveRegressionMessage,
  conversationHistory: [],
  conversationState: { recentAssistantMoves: [], latestFeedback: null },
  knowledgeEntries: liveRegressionSelection.selected,
  understanding: {
    primaryScenario: 'PRODUCT_CONSULT',
    primaryIntent: 'ASK_INFORMATION',
    factOwnership: liveRegressionFinalOwnership,
  },
});
check('live regression: typed unmatched referent survives into Canonical Response Target and requires business-fact boundary evidence',
  liveRegressionObligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED'
  && liveRegressionObligation.responseTarget.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && liveRegressionObligation.responseTarget.namedOfferingReferent.source === 'KNOWN_IDENTITY_EXTENSION'
  && liveRegressionObligation.evidenceState === 'CONTEXT_ONLY');

const partialCanonicalLabelMessage = '棉麻的成分是什么？';
const partialCanonicalLabelSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [canonicalQuotedLabelEntry],
  {
    message: partialCanonicalLabelMessage,
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const partialCanonicalLabelOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  partialCanonicalLabelMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const partialCanonicalLabelFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: partialCanonicalLabelOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: partialCanonicalLabelMessage,
  knowledgeEntries: partialCanonicalLabelSelection.selected,
});
const partialCanonicalLabelGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: partialCanonicalLabelSelection.selected,
  factOwnership: partialCanonicalLabelFinalOwnership,
});
check('partial canonical title surface remains generic and cannot create exact or unmatched referent authority',
  partialCanonicalLabelSelection.selected.every((entry) =>
    !entry.matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_EXACT_MATCH:')))
  && partialCanonicalLabelFinalOwnership.scope === 'GENERAL_DOMAIN'
  && partialCanonicalLabelFinalOwnership.namedOfferingReferent.status === 'NONE'
  && partialCanonicalLabelGrounding.length === 0);


const freshUnknownMerchantNamedMessage = '青禾晴风雪纺至尊版是什么材质？';
const freshUnknownMerchantNamedInitialOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  freshUnknownMerchantNamedMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const freshUnknownMerchantNamedFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: freshUnknownMerchantNamedInitialOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: freshUnknownMerchantNamedMessage,
  merchantIdentitySurfaces: ['青禾'],
  knowledgeEntries: [],
});
check('fresh merchant-named unknown subject becomes typed unmatched business fact without a known-product substring',
  freshUnknownMerchantNamedInitialOwnership.scope === 'GENERAL_DOMAIN'
  && freshUnknownMerchantNamedFinalOwnership.scope === 'CURRENT_BUSINESS_FACT'
  && freshUnknownMerchantNamedFinalOwnership.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && freshUnknownMerchantNamedFinalOwnership.namedOfferingReferent.source === 'MERCHANT_NAMED_SUBJECT'
  && freshUnknownMerchantNamedFinalOwnership.namedOfferingReferent.surface === '青禾晴风雪纺至尊版'
  && knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
    entries: [],
    factOwnership: freshUnknownMerchantNamedFinalOwnership,
  }).length === 0);

const ambiguousLabelEntries = [
  runtimeEntry({ id: 'AMBIG_A', entityKey: 'AMBIG-A', title: '品牌甲「同名通勤」衬衫', content: 'A。' }),
  runtimeEntry({ id: 'AMBIG_B', entityKey: 'AMBIG-B', title: '品牌乙「同名通勤」衬衫', content: 'B。' }),
];
const ambiguousLabelMessage = '这件同名通勤的成分是什么？';
const ambiguousLabelSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  ambiguousLabelEntries,
  {
    message: ambiguousLabelMessage,
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const ambiguousLabelOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  ambiguousLabelMessage,
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const ambiguousLabelFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: ambiguousLabelOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: ambiguousLabelMessage,
  knowledgeEntries: ambiguousLabelSelection.selected,
});
const ambiguousLabelGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: ambiguousLabelSelection.selected,
  factOwnership: ambiguousLabelFinalOwnership,
});
check('same canonical title label across multiple structured entities remains ambiguous and ungrounded',
  ambiguousLabelSelection.selected.filter((entry) =>
    entry.matchEvidence.some((item) => item === 'NAMED_OFFERING_EXACT_MATCH:同名通勤')).length === 2
  && ambiguousLabelFinalOwnership.evidence.includes('REFERENT_RESOLUTION:AMBIGUOUS_EXACT_STRUCTURED_ENTITY')
  && ambiguousLabelGrounding.length === 0);
const unquotedAliasSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [unquotedAliasEntry],
  {
    message: '毛球云朵猫窝 M7 的内胆脏了，可以直接丢洗衣机洗吗？',
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const unquotedAliasOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  '毛球云朵猫窝 M7 的内胆脏了，可以直接丢洗衣机洗吗？',
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const unquotedAliasFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: unquotedAliasOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '毛球云朵猫窝 M7 的内胆脏了，可以直接丢洗衣机洗吗？',
  knowledgeEntries: unquotedAliasSelection.selected,
});
const unquotedAliasGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: unquotedAliasSelection.selected,
  factOwnership: unquotedAliasFinalOwnership,
});
check('unquoted stable alias can establish exact current-product identity and scoped grounding',
  unquotedAliasSelection.selected.length === 1
  && unquotedAliasSelection.selected[0].matchEvidence.some((item) => item === 'NAMED_OFFERING_EXACT_MATCH:毛球云朵猫窝m7')
  && unquotedAliasFinalOwnership.evidence.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY')
  && unquotedAliasGrounding.length === 1
  && unquotedAliasGrounding[0].id === 'M7_PRODUCT');

const extendedAliasSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [unquotedAliasEntry],
  {
    message: '毛球云朵猫窝 M7 至尊纪念版的内胆可以机洗吗？',
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const extendedAliasOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  '毛球云朵猫窝 M7 至尊纪念版的内胆可以机洗吗？',
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const extendedAliasFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: extendedAliasOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '毛球云朵猫窝 M7 至尊纪念版的内胆可以机洗吗？',
  knowledgeEntries: extendedAliasSelection.selected,
});
check('longer invented unquoted name cannot inherit a contained stable alias',
  extendedAliasSelection.selected.every((entry) =>
    !entry.matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_EXACT_MATCH:')))
  && extendedAliasFinalOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING'));

const unquotedUnknownSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [unquotedAliasEntry],
  {
    message: '毛球云朵猫窝 X99 的内胆脏了，可以直接丢洗衣机洗吗？',
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
const unquotedUnknownOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  '毛球云朵猫窝 X99 的内胆脏了，可以直接丢洗衣机洗吗？',
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
const unquotedUnknownFinalOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: unquotedUnknownOwnership,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: '毛球云朵猫窝 X99 的内胆脏了，可以直接丢洗衣机洗吗？',
  knowledgeEntries: unquotedUnknownSelection.selected,
});
const unquotedUnknownGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: unquotedUnknownSelection.selected,
  factOwnership: unquotedUnknownFinalOwnership,
});
check('unquoted unknown model offering remains current-business fact and fails closed despite weak retrieval candidates',
  unquotedUnknownOwnership.evidence.includes('REFERENT:EXPLICIT_NAMED_OFFERING')
  && unquotedUnknownOwnership.evidence.includes('REFERENT_SURFACE:UNQUOTED_MODEL_TOKEN')
  && unquotedUnknownFinalOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
  && unquotedUnknownGrounding.length === 0);

const genericCareOwnership = semanticsRuntime.resolveCustomerServiceFactOwnership(
  '猫窝内胆一般能机洗吗？',
  'PRODUCT_CONSULT',
  'ASK_INFORMATION',
);
check('generic product-care question without a named offering remains general domain',
  genericCareOwnership.scope === 'GENERAL_DOMAIN'
  && !genericCareOwnership.evidence.includes('REFERENT:EXPLICIT_NAMED_OFFERING'));
const weakerEntries = Array.from({ length: 8 }, (_, index) => runtimeEntry({
  id: `WEAK_${index + 1}`,
  entityKey: `RELATED_${index + 1}`,
  title: `通勤西裤相关说明${index + 1}`,
  question: '这条「云感轻垂」通勤西裤还有什么颜色，尺码最小和最大分别是什么？',
  content: `相关但不是当前命名商品的候选说明 ${index + 1}。`,
  updatedAt: new Date(`2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
}));
const authorityFirstSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [...weakerEntries, exactIdentityEntry],
  {
    message: '这条「云感轻垂」通勤西裤还有什么颜色，尺码最小和最大分别是什么？',
    scenario: 'PRODUCT_CONSULT',
    intent: 'ASK_INFORMATION',
    maxEstimatedTokens: 2200,
  },
);
check('exact current-entity identity is admitted before weaker candidates consume entry budget',
  authorityFirstSelection.selected.length === 8
  && authorityFirstSelection.selected[0].id === 'EXACT_PRODUCT'
  && authorityFirstSelection.selected[0].matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_EXACT_MATCH:'))
  && authorityFirstSelection.budgetEvicted.some((item) => item.id.startsWith('WEAK_')));

check('grounded current-business fact has one required semantic owner',
  plan.includes("type: 'EXPLAIN_GROUNDED_FACT'")
  && plan.includes("necessity: 'REQUIRED'")
  && plan.includes('不得再叠加另一个 DIRECT_ANSWER 去共同拥有同一事实')
  && plan.includes("target.focus !== 'RECOMMENDATION'"));

check('business-fact answer obligation suppresses legacy direct-answer owner',
  plan.includes("answerObligation.responseTarget.knowledgeRequirement === 'BUSINESS_FACT_GROUNDING_REQUIRED'")
  && plan.includes("businessFactGroundingRequired && item.canonical === 'DIRECT_ANSWER'")
  && plan.indexOf('businessFactGroundingRequired') < plan.indexOf('for (const mapping of canonicalResponseMappings)'));

check('controlled-generation points cannot recreate business-fact direct-answer owner',
  plan.includes('businessFactAnswerObligationOwnsGeneratedValue')
  && plan.includes('deterministic.requiredPoints.length && !businessFactAnswerObligationOwnsGeneratedValue')
  && plan.includes('deterministic.workflowSteps.length && !businessFactAnswerObligationOwnsGeneratedValue')
  && plan.includes('Exact/template response assets remain independent deterministic answers'));

check('plan adapter transports typed named-offering referent as primary Grounding Authority',
  plan.includes('namedOfferingReferent: target.namedOfferingReferent')
  && plan.includes('typed referent state is the')
  && plan.includes('primary Authority transport')
  && plan.includes("item.startsWith('REFERENT_RESOLUTION:')"));

check('single-owner fallback receives a canonical unit before Conformance',
  hveExecution.includes('const conformanceReadyGeneration = bindCanonicalSegmentGroundingProvenance(')
  && hveExecution.includes('generation: conformanceReadyGeneration')
  && hveExecution.indexOf('const conformanceReadyGeneration = bindCanonicalSegmentGroundingProvenance(')
    < hveExecution.indexOf('const conformance = await this.semanticConformance.conform('));

check('canonical fallback recovery is restricted to one segment owner',
  hveExecution.includes('expected.length === 1')
  && hveExecution.includes('segments.length === 1')
  && hveExecution.includes("(generation.presentationIntent?.segments.length || 1) === 1")
  && hveExecution.includes('plannedActRefs.length === 1')
  && hveExecution.includes('plannedActTypes.length === 1')
  && hveExecution.includes('isUnboundCompatibilitySegment(segment)')
  && hveExecution.includes("source: 'CANONICAL_SINGLE_OWNER_RECOVERY'"));

check('Conformance consumes recovered units without treating legacy compatibility as proof',
  generator.includes("'CANONICAL_SINGLE_OWNER_RECOVERY'")
  && conformance.includes("'CANONICAL_SINGLE_OWNER_RECOVERY'")
  && conformance.includes("'HVE_REPLY_V2'")
  && !conformance.includes("'LEGACY_COMPATIBILITY',\n    ].includes(unit.source)"));

check('grounded classification has precedence over evidence-bearing surface answer labels',
  conformance.includes('GROUNDABLE_SUBSTANTIVE_CONTRIBUTION_KINDS')
  && conformance.includes('normalizeGroundedSubstantiveContributionKind(classification)')
  && conformance.includes('Grounding is a precedence rule'));

check('classified-but-invalid Conformance preserves unit evidence in Trace',
  conformance.includes('unitChecks: projectedChecks')
  && conformance.includes('unitChecks: evidence?.unitChecks'));

check('unmatched merchant boundary stays epistemic and excludes existence/availability inference',
  plan.includes('当前已确认的业务事实不足以确认客户所指命名对象的当前问题')
  && plan.includes('只表达无法确认、不能据此推断的事实边界并保持未知')
  && plan.includes('不能推出该对象不存在、未上架、停售、售罄、无库存、未发布、店铺不提供')
  && !plan.includes('直接表达店铺当前不提供该命名对象')
  && conformance.includes('catalog lifecycle, future availability, hidden operational status')
  && conformance.includes('assistant/system lookup process')
  && conformance.includes('This is a semantic distinction, not a phrase list.'));

check('grounded fact reuses the canonical typed information-gain value',
  planType.includes("'ADD_GROUNDED_INFORMATION'")
  && plan.includes("expectedInformationGain: 'ADD_GROUNDED_INFORMATION'")
  && !plan.includes('ANSWER_CURRENT_FOCUS_WITH_GROUNDED_INFORMATION'));

check('unmatched current-business fact still produces natural boundary only',
  plan.includes("type: 'EXPLAIN_BOUNDARY'")
  && plan.includes('不得向客户讲检索、查询、系统、Grounding、证据或内部“不命中”过程'));

check('grounding audit exposes exact entity resolution',
  reply.includes("contract: 'R2_2_GROUNDING_PROVENANCE_AUDIT_V2'")
  && reply.includes('entityResolutionStatus')
  && reply.includes('exactEntityKnowledge')
  && reply.includes('resolvedGroundingIds'));

check('grounding audit exposes closure and conformance root cause',
  reply.includes('groundingClosureStatus')
  && reply.includes('conformanceObservedDecision')
  && reply.includes('conformanceErrorMessage')
  && reply.includes('conformanceViolations'));

check('diagnostics remain non-authoritative',
  reply.includes("authority: 'DIAGNOSTIC_ONLY'")
  && reply.includes('affectsGeneration: false')
  && reply.includes('affectsSelectionEligibility: false')
  && reply.includes('affectsFinalCandidate: false')
  && reply.includes('affectsDelivery: false'));

const fixturePattern = /QH-HVE|云感轻垂|冰丝极光|青禾|FASHION_APPAREL/;
check('runtime fix has no fixture/product/test special case',
  !fixturePattern.test([knowledge, semantics, plan, reply].join('\n')));

const protectedOwners = [
  'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-semantic-conformance.type.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
];
check('R1 protected owners contain no V17 mutation marker',
  protectedOwners.every((item) => !read(item).includes('R2_2_ENTITY_AUTHORITY_GROUNDING_CLOSURE_V17')));

console.log(`\nR1 Minimal Reopen + R2.2 Grounding Closure V18: ${checks.length}/${checks.length} PASS`);
