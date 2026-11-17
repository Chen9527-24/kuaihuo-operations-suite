const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checks = [];
const pass = (name, condition, detail = '') => checks.push({ name, condition, detail });

pass('core marker src/main.ts exists', fs.existsSync(path.join(root, 'src/main.ts')));
pass('customer-service-agent core module exists', fs.existsSync(path.join(root, 'src/modules/customer-service-agent')));

const forbidden = [
  'src/modules/customer-service/api/knowledge-entries.api.ts',
  'src/modules/customer-service/types/context-profiles.types.ts',
  'src/views/customer-service/context-profiles/components/BusinessKnowledgePanel.vue',
  'src/views/customer-service/context-profiles/index.vue',
  'src/api/modules/autoReplies.ts',
  'src/views/robotmanagement/components/AutoReplyTestDrawer.vue',
  'src/views/robotmanagement/components/HveDiagnosticsHistoryPanel.vue',
  'src/views/robotmanagement/components/hve-diagnostics.types.ts',
];
for (const rel of forbidden) {
  pass(`PC-only source absent: ${rel}`, !fs.existsSync(path.join(root, rel)));
}

const v16Verifier = 'tools/customer-service-v520/verify-v520-r2-2-grounding-ownership-provenance-v16.cjs';
pass('V16 grounding verifier remains present', fs.existsSync(path.join(root, v16Verifier)));

const runtimeFile = 'src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts';
const runtimeText = fs.existsSync(path.join(root, runtimeFile)) ? fs.readFileSync(path.join(root, runtimeFile), 'utf8') : '';
pass('V16 runtime source remains present after boundary repair', runtimeText.length > 0);

let failed = 0;
for (const c of checks) {
  if (c.condition) console.log(`PASS ${c.name}`);
  else {
    failed += 1;
    console.error(`FAIL ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
  }
}
console.log(`\nR2.2 Core Project Boundary V16.1: ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
