const fs=require('node:fs'); const path=require('node:path');
process.env.TS_NODE_TRANSPILE_ONLY='1';
process.env.TS_NODE_PROJECT=path.resolve(__dirname,'../../tsconfig.json');
require('ts-node/register/transpile-only');
const root=path.resolve(__dirname,'../..'); let passed=0;
function read(r){return fs.readFileSync(path.join(root,r),'utf8')} function all(t,v){return v.every(x=>t.includes(x))}
function check(n,c){if(!c)throw new Error(n);passed++;console.log(`PASS ${String(passed).padStart(2,'0')} ${n}`)}
const schema=read('prisma/schema.prisma');
check('知识模型含作用域分类有效期版本审计',all(schema,['model CustomerServiceKnowledgeEntry','scopeType','scopeKey','category','effectiveFrom','effectiveTo','status','revision','createdById','updatedById','deletedAt']));
check('知识模型具备租户范围与有效期索引',all(schema,['CsKnowledgeEntry_tenant_scope_status','CsKnowledgeEntry_tenant_category_status','CsKnowledgeEntry_effective_window']));
check('Reply Trace 保存命中知识 ID',schema.includes('knowledgeEntryIds    String[]'));
const migration=read('prisma/migrations/20260806193000_add_customer_service_knowledge_entries/migration.sql');
check('T3 增量迁移创建知识表和 Trace 字段',all(migration,['CREATE TABLE "CustomerServiceKnowledgeEntry"','ALTER TABLE "CustomerServiceReplyTrace" ADD COLUMN "knowledgeEntryIds"']));
check('T3 迁移无破坏性 SQL',!/(DROP\s+(TABLE|DATABASE|COLUMN)|TRUNCATE|DELETE\s+FROM)/i.test(migration));
const dto=read('src/modules/customer-service-agent/admin/knowledge-entries/dto/customer-service-knowledge-entry.dto.ts');
check('DTO 保留账号店铺作用域并扩展知识库作用域',all(dto,["['STORE', 'ACCOUNT', 'COLLECTION']",'CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES','CUSTOMER_SERVICE_KNOWLEDGE_STATUSES']));
check('DTO 校验内容长度和日期格式',all(dto,['@Length(1, 20000)','@IsDateString()','revision!: number']));
const repo=read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-knowledge-entry.repository.ts');
check('运行时只查询启用且未删除知识',all(repo,["status: 'ENABLED'",'deletedAt: null']));
check('运行时严格检查生效和失效窗口',all(repo,['effectiveFrom: { lte: input.now }','effectiveTo: { gt: input.now }']));
check('运行时保留当前账号和店铺直接作用域查询',all(repo,["scopeType: 'ACCOUNT'","scopeType: 'STORE'",'scopeKey: input.accountProfileId','scopeKey: input.storeProfileId']));
const service=read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts');
check('CRUD 使用租户隔离与乐观锁',all(service,['resolveRequiredTenantId','resolveTenantId','dto.revision','ConflictException']));
check('创建更新验证作用域归属当前租户',all(service,['assertScope','findAccount(key, tenantId)','findStore(key, tenantId)']));
check('失效时间必须晚于生效时间',service.includes('失效时间必须晚于生效时间'));
check('删除为软删除和归档',all(service,["status: 'ARCHIVED'",'deletedAt: new Date()']));
const controller=read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.controller.ts');
check('业务知识提供 list/get/create/update/delete 接口',all(controller,['@Get()','@Get(\':id\')','@Post()','@Patch(\':id\')','@Delete(\':id\')']));
check('接口复用账号配置权限并由后端校验',all(controller,['customer-service:context-profile:read','customer-service:context-profile:create','customer-service:context-profile:update']));
const selectorSource=read('src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts');
check('检索具备 top-K 与字符预算',all(selectorSource,['MAX_ENTRIES = 8','MAX_TOTAL_CHARACTERS = 6000']));
check('账号知识仍优先于店铺和集合基础作用域',selectorSource.includes("entry.scopeType === 'ACCOUNT' ? 30 : entry.scopeType === 'STORE' ? 22 : 18"));
check('无相关性知识不进入运行时',selectorSource.includes('.filter((item) => item.score > 0)'));
const { selectCustomerServiceRuntimeKnowledge }=require(path.join(root,'src/modules/customer-service-agent/shared/context/customer-service-knowledge.util.ts'));
const now=new Date(); const selected=selectCustomerServiceRuntimeKnowledge([
 {id:'store',scopeType:'STORE',scopeKey:'s',category:'SERVICE_POLICY',title:'发货说明',question:'什么时候发货',content:'正常在付款后48小时内发出',tags:['发货','物流'],sourceType:'MANUAL',sourceReference:null,revision:2,effectiveFrom:null,effectiveTo:null,updatedAt:now},
 {id:'account',scopeType:'ACCOUNT',scopeKey:'a',category:'FAQ',title:'账号发货说明',question:'多久发货',content:'当前账号通常24小时内发出',tags:['发货'],sourceType:'MANUAL',sourceReference:null,revision:3,effectiveFrom:null,effectiveTo:null,updatedAt:now},
 {id:'irrelevant',scopeType:'ACCOUNT',scopeKey:'a',category:'PRODUCT',title:'面料',question:'是什么面料',content:'棉质',tags:['面料'],sourceType:'MANUAL',sourceReference:null,revision:1,effectiveFrom:null,effectiveTo:null,updatedAt:now},
],{message:'请问多久发货',scenario:'LOGISTICS',intent:'SHIPPING',topics:['发货']});
check('检索功能测试命中相关知识并排除无关项',selected.some(x=>x.id==='account')&&!selected.some(x=>x.id==='irrelevant'));
check('检索功能测试账号知识排在店铺知识前',selected[0]?.id==='account');
const simulation=read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
check('运行时按消息场景意图加载知识',all(simulation,['knowledgeEntriesService.selectForRuntime','message: dto.message','scenario: understanding.primaryScenario','intent: understanding.primaryIntent']));
const contract=read('src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts');
check('运行时合同包含知识及版本来源',all(contract,['knowledgeEntries: businessContext.knowledgeEntries','knowledgeEntry:${entry.id}']));
const prompt=read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
check('生成提示只投影现有 Canonical Plan 已选知识并服从 server-owned truth',all(prompt,["Semantic Frame already applies the Canonical Plan's grounding need",'verifiedFacts: frame.grounding.facts','selectedEntries: frame.grounding.knowledge','Knowledge、Policy、Permission、Service Boundary 与真实执行状态属于 server-owned truth'])&&!prompt.includes('contract.businessContext.knowledgeEntries'));
const trace=read('src/modules/customer-service-agent/admin/reply-traces/customer-service-reply-traces.service.ts');
check('Trace 创建和安全详情均包含知识 ID',all(trace,['knowledgeEntryIds: uniqueStrings','knowledgeEntryIds: true']));
const moduleFile=read('src/modules/customer-service-agent/customer-service-agent.module.ts');
check('Controller Service Repository 均已注册',all(moduleFile,['CustomerServiceKnowledgeEntriesController','CustomerServiceKnowledgeEntriesService','CustomerServiceKnowledgeEntryRepository']));
const governance=read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-data-governance.repository.ts');
check('知识表纳入数据治理容量概览',all(governance,["'CustomerServiceKnowledgeEntry'",'customerServiceKnowledgeEntry.count','knowledgeEntries']));
check('未引入向量数据库或 embedding 依赖',!/(pgvector|pinecone|milvus|embedding)/i.test([service,repo,selectorSource].join('\n')));
console.log(`\nV5.20-T3 Core 业务知识闭环验证通过：${passed} 项。`);
