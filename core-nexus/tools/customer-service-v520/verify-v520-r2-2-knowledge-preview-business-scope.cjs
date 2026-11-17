const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'src/modules/customer-service-agent/admin/knowledge-entries/customer-service-knowledge-entries.service.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const checks = [
  ['preview imports effective business scope resolver', source.includes('resolveCustomerServiceEffectiveBusinessScope')],
  ['preview resolves identity scope before knowledge selection', source.includes('const previewScope = await this.resolvePreviewRuntimeScope(tenantId, dto);')],
  ['preview uses detailed runtime selector', source.includes('const selection = await this.selectForRuntimeDetailed({')],
  ['preview passes businessScope into same selector', source.includes('businessScope: previewScope.businessScope')],
  ['preview falls back to account-bound store', source.includes('requestedStoreId || account?.storeProfileId || null')],
  ['preview falls back to account-bound role', source.includes('requestedRoleId || account?.merchantRoleId || null')],
  ['preview validates account/store mismatch', source.includes('知识检索测试的账号与店铺绑定不一致')],
  ['preview validates account/role mismatch', source.includes('知识检索测试的账号与业务身份绑定不一致')],
  ['preview derives runtime industry from account/role', source.includes('const industry = account?.industryNode || role.industryNode || null;')],
  ['preview exposes scope rejected diagnostics', source.includes('scopeRejected: selection.scopeRejected')],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`Core Nexus R2.2 Knowledge Preview Scope: ${checks.length - failed}/${checks.length} PASS`);
  process.exit(1);
}
console.log(`Core Nexus R2.2 Knowledge Preview Scope: ${checks.length}/${checks.length} PASS`);
