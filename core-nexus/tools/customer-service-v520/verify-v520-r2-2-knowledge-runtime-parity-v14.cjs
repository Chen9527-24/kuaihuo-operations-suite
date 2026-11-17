const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const service = read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts');
const dto = read('src/modules/customer-service-agent/admin/knowledge-entries/dto/customer-service-knowledge-entry.dto.ts');
const controller = read('src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.controller.ts');
const repo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-knowledge-entry.repository.ts');
const simulation = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');

const checks = [
  ['collection DTO owns applicability in normal save', /applicability\?: CustomerServiceKnowledgeApplicabilityTargetDto\[\]/.test(dto)],
  ['enabled collection requires applicability', /已启用知识库必须至少选择一个适用对象/.test(service)],
  ['collection and applicability save share transaction', /\$transaction\(async \(tx\)/.test(service) && /replaceCollectionApplicability\(tx/.test(service)],
  ['legacy reconcile endpoint exists', /collections\/reconcile-legacy-applicability/.test(controller) && /reconcileLegacyApplicability/.test(service)],
  ['preview resolves authoritative identity first', /resolvePreviewIdentity\(tenantId, dto\)/.test(service)],
  ['preview resolves Effective Business Scope', /resolveCustomerServiceEffectiveBusinessScope/.test(service)],
  ['preview passes businessScope to knowledge selector', /businessScope: identity\.businessScope/.test(service)],
  ['preview exposes candidate/scope/budget diagnostics', /candidateCount: entries\.length/.test(service) && /scopeRejected: result\.scopeRejected/.test(service) && /budgetEvicted: result\.budgetEvicted/.test(service)],
  ['runtime simulation still passes same businessScope', /selectForRuntimeDetailed\(\{[\s\S]*?businessScope[\s\S]*?\}\)/.test(simulation)],
  ['runtime repository still unions account/store/role bindings', /targetType: 'ACCOUNT'/.test(repo) && /targetType: 'STORE'/.test(repo) && /targetType: 'ROLE'/.test(repo)],
  ['no test fixture/brand special-case in core fix', !/QH-HVE-P001|云感轻垂|青禾|qinghe/i.test(service + dto + controller)],
  ['no generation/conformance owner touched by this verifier', !/customer-service-reply-generator|semantic-conformance|surface-atom/i.test(service + dto + controller)],
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed += 1;
}
console.log(`\nR2.2 Knowledge Runtime Parity V14: ${checks.length - failed}/${checks.length} PASS`);
process.exitCode = failed ? 1 : 0;
