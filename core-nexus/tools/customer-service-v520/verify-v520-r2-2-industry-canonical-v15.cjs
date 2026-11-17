const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const industry=read('src/modules/customer-service-agent/shared/context/customer-service-industry-code.util.ts');
const scope=read('src/modules/customer-service-agent/shared/context/customer-service-business-scope.util.ts');
const knowledge=read('src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts');
const service=read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts');
const checks=[
 ['central canonical industry utility',/canonicalizeCustomerServiceIndustryCode/.test(industry)],
 ['legacy fashion alias migrates to apparel',/'fashion-apparel': 'apparel'/.test(industry)],
 ['taxonomy family supports apparel subcategory',/'women-clothing': 'apparel'/.test(industry)],
 ['foreign digital remains separate',/'digital-3c': 'digital-3c'/.test(industry)],
 ['business scope canonicalizes server industry code',/canonicalizeCustomerServiceIndustryCode\(input\.industryCode\)/.test(scope)],
 ['industry coherence uses canonical compatibility',/areCustomerServiceIndustryCodesCompatible\(collectionCode, scopeCode\)/.test(scope)],
 ['selector diagnostics expose canonical codes',/collectionCanonicalIndustryCode/.test(knowledge)&&/scopeCanonicalIndustryCode/.test(knowledge)],
 ['collection create derives industry from applicability',/resolveCollectionIndustryCode\(tenantId, applicability, dto\.industryCode\)/.test(service)],
 ['collection update derives industry from effective applicability',/effectiveApplicability[\s\S]*resolveCollectionIndustryCode/.test(service)],
 ['STORE ACCOUNT ROLE industry derivation exists',/targetType === 'ACCOUNT'/.test(service)&&/targetType === 'STORE'/.test(service)&&/targetType === 'ROLE'/.test(service)],
 ['legacy reconcile canonicalizes persisted industry',/industryCanonicalized/.test(service)&&/deriveApplicabilityIndustryCode/.test(service)],
 ['conflicting industry cannot silently overwrite',/KNOWLEDGE_INDUSTRY_APPLICABILITY_CONFLICT/.test(service)],
 ['binding maintenance resyncs collection industry',/syncCollectionIndustryFromCurrentBindings/.test(service)],
 ['no qinghe/product fixture special case',!/QH-HVE-P001|云感轻垂|青禾|qinghe/i.test(industry+scope+knowledge+service)],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`\n${pass}/${checks.length} PASS`);
if(pass!==checks.length)process.exit(1);
