#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const sourcePath = 'src/modules/customer-service-agent/runtime/understanding/customer-service-explicit-semantics.ts';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
  reportDiagnostics: true,
  fileName: sourcePath,
});
const syntaxErrors = (transpiled.diagnostics || [])
  .filter((item) => item.category === ts.DiagnosticCategory.Error);
if (syntaxErrors.length) {
  console.error('FAIL TypeScript syntax');
  process.exit(1);
}

const box = { exports: {}, module: { exports: {} }, require: () => ({}), console };
box.module.exports = box.exports;
vm.runInNewContext(transpiled.outputText, box, { filename: sourcePath });
const semantics = box.module.exports;

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
}

function ownership(message, scenario = 'PRODUCT_CONSULT', intent = 'ASK_INFORMATION') {
  return semantics.resolveCustomerServiceFactOwnership(message, scenario, intent);
}

function isImplicitMerchantCatalog(value) {
  return value.scope === 'CURRENT_BUSINESS_FACT'
    && value.evidence.includes('FACT_DIMENSION:MERCHANT_SERVICE_CAPABILITY')
    && value.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE');
}

for (const message of [
  '有没有适合上班通勤穿的衬衫？',
  '我想确认一下有没有适合通勤的衬衫？',
  '有没有合适的通勤上衣？',
  '有合适的吗？',
]) {
  const value = ownership(message);
  check(`implicit merchant catalog-match query requires business-fact grounding: ${message}`,
    isImplicitMerchantCatalog(value),
    `scope=${value.scope}; evidence=${value.evidence.join('|')}`);
}

for (const message of [
  '哪款更适合夏天办公室穿？',
  '哪一款更适合日常通勤？',
  '哪几款更合适？',
  '什么款式更适合高温通勤？',
  '有哪几款更适合日常上班？',
]) {
  const value = ownership(message);
  check(`implicit open catalog choice requires business-fact grounding: ${message}`,
    isImplicitMerchantCatalog(value),
    `scope=${value.scope}; evidence=${value.evidence.join('|')}`);
}

for (const message of [
  '你们店里哪款更适合夏天办公室穿？',
  '本店哪个产品更合适？',
]) {
  const value = ownership(message);
  check(`explicit merchant catalog choice requires current-business grounding: ${message}`,
    value.scope === 'CURRENT_BUSINESS_FACT'
      && value.evidence.includes('REFERENT:EXPLICIT_MERCHANT_CATALOG_SCOPE')
      && !value.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE'),
    `scope=${value.scope}; evidence=${value.evidence.join('|')}`);
}

const explicitMerchant = ownership('你们店里有没有适合上班通勤穿的衬衫？');
check('explicit merchant-scope path remains current-business fact',
  explicitMerchant.scope === 'CURRENT_BUSINESS_FACT'
  && explicitMerchant.evidence.includes('FACT_DIMENSION:MERCHANT_SERVICE_CAPABILITY')
  && !explicitMerchant.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE'),
  `scope=${explicitMerchant.scope}; evidence=${explicitMerchant.evidence.join('|')}`);

for (const message of [
  '衬衫一般怎么选？',
  '哪种面料更适合高温通勤？',
  '哪个材质更适合夏天？',
  '聚酯衬衫一般会不会闷？',
  '有没有办法让衬衫少皱一点？',
  '猫窝内胆一般能机洗吗？',
]) {
  const value = ownership(message);
  check(`generic-domain reverse stays non-merchant: ${message}`,
    value.scope === 'GENERAL_DOMAIN'
    && !value.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE'),
    `scope=${value.scope}; evidence=${value.evidence.join('|')}`);
}

const knownNamed = ownership('青禾「清简」垂感衬衫是什么面料？');
check('named-offering attribute ownership remains exact-entity eligible',
  knownNamed.scope === 'CURRENT_BUSINESS_FACT'
  && knownNamed.evidence.includes('FACT_DIMENSION:CURRENT_OFFERING_ATTRIBUTE')
  && knownNamed.evidence.includes('REFERENT:EXPLICIT_NAMED_OFFERING')
  && !knownNamed.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE'),
  `scope=${knownNamed.scope}; evidence=${knownNamed.evidence.join('|')}`);

const inventedMessage = '青禾「清简」垂感衬衫至尊纪念版是什么面料？';
const inventedBase = ownership(inventedMessage);
const inventedFinal = semantics.finalizeCustomerServiceFactOwnershipFromGroundingEvidence({
  ownership: inventedBase,
  primaryScenario: 'PRODUCT_CONSULT',
  primaryIntent: 'ASK_INFORMATION',
  knowledgeEntries: [],
});
check('invented longer named offering still fails closed',
  inventedFinal.scope === 'CURRENT_BUSINESS_FACT'
  && inventedFinal.evidence.includes('REFERENT_RESOLUTION:UNMATCHED_NAMED_OFFERING')
  && !inventedFinal.evidence.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE'),
  `scope=${inventedFinal.scope}; evidence=${inventedFinal.evidence.join('|')}`);

check('patch remains fact-ownership-only and does not add exact identity authority',
  source.includes('REFERENT:IMPLICIT_MERCHANT_CATALOG_SCOPE')
  && source.includes('REFERENT:EXPLICIT_MERCHANT_CATALOG_SCOPE')
  && source.includes('IMPLICIT_MERCHANT_CATALOG_MATCH_PATTERN')
  && source.includes('EXPLICIT_MERCHANT_CATALOG_CHOICE_PATTERN')
  && !source.includes('REFERENT_RESOLUTION:IMPLICIT_MERCHANT_CATALOG_SCOPE')
  && !source.includes('REFERENT_RESOLUTION:EXPLICIT_MERCHANT_CATALOG_SCOPE'));

console.log(`\nR2.2 Implicit Merchant Catalog Scope: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
