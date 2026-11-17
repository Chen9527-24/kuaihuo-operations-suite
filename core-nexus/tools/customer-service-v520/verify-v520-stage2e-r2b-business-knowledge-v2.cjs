#!/usr/bin/env node
const fs=require('fs');const path=require('path');const os=require('os');
const root=path.resolve(__dirname,'../..');
let pass=0,fail=0;function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
const schema=read('prisma/schema.prisma');
const migration=read('prisma/migrations/20260810153000_business_knowledge_v2_foundation/migration.sql');
const dto=read('src/modules/customer-service-agent/admin/knowledge-entries/dto/customer-service-knowledge-entry.dto.ts');
const service=read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts');
const controller=read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.controller.ts');
const repo=read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-knowledge-entry.repository.ts');
const utilSrc=read('src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts');
const simulation=read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const robots=read('src/modules/robots/robots.service.ts');
const prompt=read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const brief=read('src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts');
const kernel=read('src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts');

check('Prisma adds KnowledgeCollection',/model CustomerServiceKnowledgeCollection/.test(schema));
check('Prisma adds polymorphic KnowledgeBinding',/model CustomerServiceKnowledgeBinding/.test(schema)&&/targetType\s+String/.test(schema)&&/ACCOUNT \/ STORE \/ ROLE/.test(schema));
check('KnowledgeEntry adds collection and structured entity fields',/collectionId\s+String\?/.test(schema)&&/structuredData\s+Json\?/.test(schema)&&/references\s+Json\?/.test(schema)&&/aliases\s+String\[\]/.test(schema)&&/authorityLevel/.test(schema));
check('migration creates collection and binding tables',/CREATE TABLE "CustomerServiceKnowledgeCollection"/.test(migration)&&/CREATE TABLE "CustomerServiceKnowledgeBinding"/.test(migration));
check('migration adds KnowledgeEntry V2 fields',/ADD COLUMN "collectionId"/.test(migration)&&/ADD COLUMN "structuredData"/.test(migration)&&/ADD COLUMN "references"/.test(migration));
check('DTO supports COLLECTION scope and ROLE binding',['COLLECTION','ROLE','BatchImportCustomerServiceKnowledgeDto','PreviewCustomerServiceKnowledgeDto'].every(v=>dto.includes(v)));
check('admin controller exposes collection/binding/import/preview routes',['collections/:id/bindings','batch-import','preview','bindings/:id'].every(v=>controller.includes(v)));
check('service supports collection CRUD and bounded batch import',service.includes('createCollection(')&&service.includes('upsertBinding(')&&service.includes('batchImport(')&&service.includes('.slice(0, 1000)'));
check('binding target validation covers account/store/role',service.includes("targetType === 'ACCOUNT'")&&service.includes("targetType === 'STORE'")&&service.includes("targetType === 'ROLE'")&&service.includes('customerServiceMerchantRole.findFirst'));
check('runtime repository consumes bound collections by ACCOUNT/STORE/ROLE',repo.includes("targetType: 'ACCOUNT'")&&repo.includes("targetType: 'STORE'")&&repo.includes("targetType: 'ROLE'")&&repo.includes("scopeType: 'COLLECTION'"));
check('disabled/deleted collections cannot enter runtime',repo.includes("collection: { deletedAt: null, status: 'ENABLED' }"));
check('customer-service runtime passes merchantRoleId',simulation.includes('merchantRoleId: role.id'));
check('intercept runtime also passes merchantRoleId',robots.includes('merchantRoleId: account.merchantRoleId || undefined'));
check('retrieval ranks entity key, aliases, structured data and references',utilSrc.includes('ENTITY_KEY_MATCH')&&utilSrc.includes('ENTITY_ALIAS_MATCH')&&utilSrc.includes('STRUCTURED:')&&utilSrc.includes('REFERENCE:'));
check('selected knowledge preserves retrieval evidence',utilSrc.includes('relevanceScore:')&&utilSrc.includes('matchEvidence:')&&utilSrc.includes('bindingPriority:'));
check('model-facing knowledge carries structured facts and references',brief.includes('structuredData: item.structuredData')&&brief.includes('references: item.references')&&brief.includes('authorityLevel: item.authorityLevel'));
check('prompt only allows explicit shareable URLs',prompt.includes('URL 只在当前知识明确提供且标记为可分享时才对客户输出'));
check('service scope cannot become product capability via prompt',prompt.includes('角色服务范围只说明可以围绕哪些事情提供帮助，不自动证明某个产品能力'));
check('current Generation Kernel still carries v1.28 Business Knowledge invariant',kernel.includes('V1.28 Stage-2E-R2B Business Knowledge V2')&&(kernel.match(/id: 'customer-service-generation-kernel'/g)||[]).length===1);

const fixtureDir=path.join(root,'tools/customer-service-v520/fixtures/business-knowledge-v2');
const samples=['fashion-commute-professional.json','beauty-skincare-professional.json','digital-after-sales-professional.json','saas-business-management-professional.json','private-community-operations-professional.json'];
for(const file of samples){
  const full=path.join(fixtureDir,file);let data=null;try{data=JSON.parse(fs.readFileSync(full,'utf8'))}catch{}
  check(`professional sample exists: ${file}`,!!data);
  check(`professional sample has >=8 entries: ${file}`,Array.isArray(data?.entries)&&data.entries.length>=8);
  check(`professional sample includes structured facts: ${file}`,Array.isArray(data?.entries)&&data.entries.some(x=>x.structuredData&&Object.keys(x.structuredData).length));
  check(`professional sample includes shareable reference: ${file}`,Array.isArray(data?.entries)&&data.entries.some(x=>Array.isArray(x.references)&&x.references.some(r=>r.shareable===true&&r.url)));
}
check('generic CSV import template ships',fs.existsSync(path.join(fixtureDir,'business-knowledge-import-template.csv')));

try{
  process.env.TS_NODE_TRANSPILE_ONLY='1';
  process.env.TS_NODE_PROJECT=path.join(root,'tsconfig.json');
  require('ts-node/register/transpile-only');
  const mod=require(path.join(root,'src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts'));
  const now=new Date();
  const entries=[
    {id:'bound-api',collectionId:'c1',scopeType:'COLLECTION',scopeKey:'c1',entityType:'MODULE',entityKey:'YZ-API',aliases:['开放API','接口文档'],structuredData:{useCases:['系统集成','审批回写']},references:[{type:'API_DOC',title:'开放 API 文档',url:'https://example.com/demo/api',shareable:true}],authorityLevel:'BUSINESS_FACT',bindingPriority:120,collection:{id:'c1',name:'SaaS知识',industryCode:null,revision:2},category:'SERVICE',title:'开放 API',question:'API怎么接',content:'使用 Token 鉴权，并以当前接口文档为准。',tags:['API','接口'],sourceType:'IMPORT',sourceReference:null,revision:1,effectiveFrom:null,effectiveTo:null,updatedAt:now},
    {id:'direct',scopeType:'ACCOUNT',scopeKey:'a1',category:'FAQ',title:'普通问答',question:'怎么使用',content:'普通说明',tags:['使用'],sourceType:'MANUAL',sourceReference:null,revision:1,effectiveFrom:null,effectiveTo:null,updatedAt:now},
  ];
  const selected=mod.selectCustomerServiceRuntimeKnowledge(entries,{message:'开放API文档在哪里',topics:[],conversationState:null,conversationStrategy:null,maxEstimatedTokens:1200});
  check('runtime selector can hit bound entity alias',selected[0]?.id==='bound-api',JSON.stringify(selected));
  check('runtime selector preserves exact shareable reference',selected[0]?.references?.[0]?.url==='https://example.com/demo/api');
  check('runtime selector emits match evidence',Array.isArray(selected[0]?.matchEvidence)&&selected[0].matchEvidence.length>0);
  const structured=mod.selectCustomerServiceRuntimeKnowledge(entries,{message:'审批回写怎么做',topics:[],conversationState:null,conversationStrategy:null,maxEstimatedTokens:1200});
  check('runtime selector can match structured fact',structured.some(x=>x.id==='bound-api'&&x.matchEvidence.some(e=>e.startsWith('STRUCTURED:'))),JSON.stringify(structured));
}catch(error){check('runtime selector executable counterfactual',false,error?.stack||String(error))}

const runtimeFiles=[
 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
 'src/modules/customer-service-agent/runtime/interaction/customer-service-answer-obligation.ts',
 'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
];
const leaked=samples.flatMap(file=>{const d=JSON.parse(fs.readFileSync(path.join(fixtureDir,file),'utf8'));return d.entries.slice(0,2).map(x=>x.title)}).filter(title=>runtimeFiles.some(rel=>read(rel).includes(title)));
check('professional fixture titles are not hard-coded into Runtime',leaked.length===0,leaked.join(','));

console.log(`\nStage 2E-R2B Business Knowledge V2 Foundation: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
