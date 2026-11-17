const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dto = read('src/modules/customer-service-agent/admin/knowledge-entries/dto/customer-service-knowledge-entry.dto.ts');
const service = read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts');
const controller = read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.controller.ts');
const repo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-knowledge-entry.repository.ts');
const sim = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const checks = [
  ['DTO models multi-target applicability', /CustomerServiceKnowledgeApplicabilityTargetDto/.test(dto) && /applicability\?: CustomerServiceKnowledgeApplicabilityTargetDto\[\]/.test(dto)],
  ['create saves collection and bindings in one transaction', /createCollection[\s\S]*\$transaction[\s\S]*replaceCollectionBindings/.test(service)],
  ['update atomically replaces applicability when supplied', /updateCollection[\s\S]*applicability !== undefined[\s\S]*replaceCollectionBindings/.test(service)],
  ['enabled collection cannot be created unbound', /已启用知识库必须选择至少一个适用对象/.test(service)],
  ['legacy reconcile exists as bounded compatibility path', /reconcileLegacyApplicability/.test(service) && /bindings: \{ none: \{\} \}/.test(service)],
  ['legacy reconcile only auto-selects unique relation', /storeIds\.length === 1/.test(service) && /roleIds\.length === 1/.test(service) && /unresolved\.push/.test(service)],
  ['binding target ownership is tenant validated', /assertBindingTarget/.test(service) && /绑定店铺不存在或不属于当前租户/.test(service) && /绑定身份\/角色不存在或不属于当前租户/.test(service)],
  ['runtime selector unions ACCOUNT STORE ROLE', /targetType: 'ACCOUNT'/.test(repo) && /targetType: 'STORE'/.test(repo) && /targetType: 'ROLE'/.test(repo)],
  ['runtime only uses enabled bindings and enabled collections', /status: 'ENABLED'[\s\S]*collection: \{ deletedAt: null, status: 'ENABLED' \}/.test(repo)],
  ['simulation supplies account store role to same selector', /accountProfileId: accountProfile\?\.id/.test(sim) && /storeProfileId: storeProfile\?\.id/.test(sim) && /merchantRoleId: role\.id/.test(sim)],
  ['controller exposes compatibility reconcile without changing runtime route', /collections\/reconcile-legacy-applicability/.test(controller)],
  ['no fixture brand product special case', !/QH-HVE-P001|云感轻垂|青禾|qinghe/i.test(dto + service + controller + repo)],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(`\nCore R2.2 Knowledge Applicability Flow V13: ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
