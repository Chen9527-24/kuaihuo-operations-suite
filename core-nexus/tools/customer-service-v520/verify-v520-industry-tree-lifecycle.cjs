const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260813164000_allow_reuse_archived_industry_codes/migration.sql');
const service = read('src/modules/customer-service-agent/admin/industry-nodes/customer-service-industry-nodes.service.ts');
const repo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-industry-node.repository.ts');
const seeder = read('src/modules/customer-service-agent/admin/foundation/seeders/customer-service-role-foundation.seeder.ts');

const industryModel = schema.match(/model CustomerServiceIndustryNode \{[\s\S]*?\n\}/)?.[0] || '';
check('industry node no longer declares full-lifecycle tenant+code unique', !industryModel.includes('@@unique([tenantId, code])'));
check('migration swaps indexes atomically', migration.includes('BEGIN;') && migration.includes('COMMIT;'));
check('migration drops old full-lifecycle unique index', migration.includes('DROP INDEX IF EXISTS \"CustomerServiceIndustryNode_tenantId_code_key\"'));
check('migration creates active-only unique index', migration.includes('CREATE UNIQUE INDEX "CustomerServiceIndustryNode_tenantId_code_active_key"'));
check('active-only unique index is scoped by deletedAt null', /WHERE\s+"deletedAt"\s+IS\s+NULL/i.test(migration));
check('create pre-check only considers active code', repo.includes('findActiveByCode') && repo.includes('where: { tenantId, code, deletedAt: null }'));
check('service uses active-code pre-check for friendly conflict', service.includes('findActiveByCode(tenantId, code)'));
check('database concurrency conflict remains mapped to user conflict', service.includes("error.code === 'P2002'") && service.includes('当前租户下已存在相同行业节点编码'));
check('foundation seed ignores archived code and can create a fresh lifecycle', seeder.includes('customerServiceIndustryNode.findFirst') && seeder.includes('where: { tenantId, code: item.code, deletedAt: null }'));
check('soft delete still preserves historical row', repo.includes("status: 'ARCHIVED'") && repo.includes('deletedAt: now'));
check('subtree cascade soft delete remains intact', repo.includes('descendantIds') && repo.includes('deletedNodes: root.count + descendants.count'));
check('current role/account bindings are detached, not history-deleted', repo.includes('customerServiceMerchantRole.updateMany') && repo.includes('customerServiceAccountProfile.updateMany'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
console.log(`\nIndustry Tree Lifecycle: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
