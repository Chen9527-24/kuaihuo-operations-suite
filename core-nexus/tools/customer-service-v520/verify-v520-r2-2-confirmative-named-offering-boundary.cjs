const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
const check = (name, ok) => {
  if (!ok) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS ${name}`);
};

const knowledge = read('src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts');
const semantics = read('src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts');

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
const semanticsRuntime = loadTsModule(semantics, 'customer-service-explicit-semantics.ts');

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

const qingjian = runtimeEntry({
  id: 'QH_SHIRT_01',
  entityKey: 'QH-SHIRT-01',
  title: '青禾「清简」垂感衬衫',
  aliases: ['清简', '清简垂感衬衫'],
  content: '聚酯纤维混纺；版型微宽松。',
});

const exactEvidence = (message) => {
  const selection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
    [qingjian],
    { message, scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION', maxEstimatedTokens: 2200 },
  );
  const selected = selection.selected.find((entry) => entry.id === 'QH_SHIRT_01');
  return {
    selection,
    selected,
    exact: Boolean(selected && selected.matchEvidence.some((item) =>
      item.startsWith('NAMED_OFFERING_EXACT_MATCH:')
      || item.startsWith('NAMED_OFFERING_CORE_EXACT_MATCH:')
      || item.startsWith('ENTITY_KEY_EXACT_MATCH:'))),
  };
};

const finalOwnership = (message, selection) => {
  const ownership = semanticsRuntime.resolveCustomerServiceFactOwnership(
    message,
    'PRODUCT_CONSULT',
    'ASK_INFORMATION',
  );
  return semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
    ownership,
    primaryScenario: 'PRODUCT_CONSULT',
    primaryIntent: 'ASK_INFORMATION',
    message,
    merchantIdentitySurfaces: ['青禾'],
    knowledgeEntries: selection.selected,
  });
};

check('confirmative prefix is represented inside the existing whole-referent left boundary',
  knowledge.includes('(?:问|咨询|了解|看看|确认)')
  && knowledge.includes('(?:只)?(?:请|麻烦)?'));

for (const message of [
  '青禾「清简」垂感衬衫是什么面料？',
  '我想确认一下青禾「清简」垂感衬衫是什么面料？',
  '我只想确认一下青禾「清简」垂感衬衫是什么面料？',
  '先别给我推荐别的商品，我只想确认一下青禾「清简」垂感衬衫是什么面料，夏天办公室穿会不会太闷？',
]) {
  const resolved = exactEvidence(message);
  const ownership = finalOwnership(message, resolved.selection);
  check(`known named offering resolves exactly under confirmative intro: ${message}`,
    resolved.exact
    && ownership.evidence.includes('REFERENT_RESOLUTION:EXACT_STRUCTURED_ENTITY')
    && ownership.evidence.includes('GROUNDING_ENTITY_MATCH:QH_SHIRT_01'));
}

const inventedMessage = '我想确认一下青禾「清简」垂感衬衫至尊纪念版是什么面料？';
const invented = exactEvidence(inventedMessage);
const inventedOwnership = finalOwnership(inventedMessage, invented.selection);
check('longer invented offering still cannot inherit the real shorter product identity',
  !invented.exact
  && inventedOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING'));

const unquotedInventedMessage = '我想确认一下清简垂感衬衫至尊纪念版是什么面料？';
const unquotedInvented = exactEvidence(unquotedInventedMessage);
const unquotedInventedOwnership = finalOwnership(unquotedInventedMessage, unquotedInvented.selection);
const unquotedInventedGrounding = knowledgeRuntime.selectCustomerServiceBusinessFactGroundingEntries({
  entries: unquotedInvented.selection.selected,
  factOwnership: unquotedInventedOwnership,
});
check('unquoted longer name keeps merchant fact boundary through typed referent state without retrieval conflict authority',
  !unquotedInvented.exact
  && unquotedInvented.selection.selected.every((entry) =>
    !entry.matchEvidence.some((item) => item.startsWith('NAMED_OFFERING_IDENTITY_CONFLICT:')))
  && unquotedInventedOwnership.scope === 'CURRENT_BUSINESS_FACT'
  && unquotedInventedOwnership.namedOfferingReferent.status === 'UNMATCHED_NAMED_OFFERING'
  && unquotedInventedOwnership.namedOfferingReferent.source === 'KNOWN_IDENTITY_EXTENSION'
  && unquotedInventedOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
  && unquotedInventedGrounding.length === 0);

const genericMessage = '我想确认一下有没有适合通勤的衬衫？';
const generic = exactEvidence(genericMessage);
check('confirmative language alone cannot create named-offering exact authority', !generic.exact);

const orderMessage = '我想确认一下订单什么时候到？';
const order = exactEvidence(orderMessage);
check('confirmative order/status language does not enter product exact-identity authority', !order.exact);

const existingUnknownMessage = '毛球云朵猫窝 X99 的内胆是什么材质？';
const unknownEntry = runtimeEntry({
  id: 'M7_PRODUCT',
  entityKey: 'MQ-CLOUD-BED-M7',
  title: '毛球云朵猫窝 M7 清洗说明',
  aliases: ['毛球云朵猫窝M7', '云朵猫窝M7', 'M7猫窝'],
  content: '内胆不可机洗。',
});
const unknownSelection = knowledgeRuntime.selectCustomerServiceRuntimeKnowledgeDetailed(
  [unknownEntry],
  { message: existingUnknownMessage, scenario: 'PRODUCT_CONSULT', intent: 'ASK_INFORMATION', maxEstimatedTokens: 2200 },
);
const unknownOwnership = semanticsRuntime.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: semanticsRuntime.resolveCustomerServiceFactOwnership(existingUnknownMessage, 'PRODUCT_CONSULT', 'ASK_INFORMATION'),
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  message: existingUnknownMessage,
  merchantIdentitySurfaces: ['青禾'],
  knowledgeEntries: unknownSelection.selected,
});
check('existing unquoted unknown-model fail-closed boundary remains intact',
  unknownOwnership.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING'));

const total = 10;
console.log(`\nR2.2 Confirmative Named-Offering Boundary: ${passed}/${total} PASS`);
if (passed !== total) process.exitCode = 1;
