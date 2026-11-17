#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let pass=0, fail=0;
function check(name, ok, detail='') { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); } }
function loadStandaloneTsExports(rel) {
  const compiled = ts.transpileModule(read(rel), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: rel });
  const loaded = { exports: {} };
  Function('exports','module',compiled.outputText)(loaded.exports, loaded);
  return loaded.exports;
}
function normalizeNewlines(value) { return String(value || '').replace(/\r\n?/g, '\n'); }
function dollarQuotedBody(sql, tag) {
  const marker = `$${tag}$`; const start = sql.indexOf(marker); const end = start < 0 ? -1 : sql.indexOf(marker, start + marker.length);
  return start < 0 || end < 0 ? null : sql.slice(start + marker.length, end);
}
const prompt = loadStandaloneTsExports('src/modules/customer-service-agent/admin/foundation/templates/customer-service-generation-prompt.template.ts').DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT;
const priorSql = read('prisma/migrations/20260829213000_p0_5_r1_12_given_premise_new_contribution_ownership_boundary/migration.sql');
const sql = read('prisma/migrations/20260830013000_p0_5_r1_13_social_normalization_ownership_boundary/migration.sql');
const nextSql = read('prisma/migrations/20260830014000_p0_5_r1_14_functional_preface_deletion_boundary/migration.sql');
const kernel = read('src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts');
const oldPrompt = dollarQuotedBody(sql, 'p0_5_r1_13_old_lf');
const oldNfkc = dollarQuotedBody(sql, 'p0_5_r1_13_old_nfkc_lf');
const nextPrompt = dollarQuotedBody(sql, 'p0_5_r1_13_new_lf');
const priorPrompt = dollarQuotedBody(priorSql, 'p0_5_r1_12_new_lf');
const nextGuard = dollarQuotedBody(nextSql, 'p0_5_r1_14_old_lf');
check('R1.13 keeps proposition ownership as the governing abstraction', prompt.includes('共同前提') && prompt.includes('本轮新增贡献') && prompt.includes('只作为推理前提使用'));
check('R1.13 blocks social normalization as contribution when it has no answer function', prompt.includes('安抚、拉近关系或完成社交性承接') && prompt.includes('普遍性、正常性或合理性判断'));
check('R1.13 preserves legitimate prevalence/normality judgment when it is the requested information', prompt.includes('这类普遍性/正常性判断本身就是当前问题所需的新信息'));
check('R1.13 preserves genuinely new model-owned judgment and certainty', prompt.includes('真正由你本轮新增的判断、信息、选择、风险或办法') && prompt.includes('自然表达确定程度'));
check('R1.13 is not an observed-word blacklist', !/(这种情况确实很常见|这个担心很常见|广州夏天穿长裤|米白色确实|塞衣角确实|关键词|黑名单|词表|短语表)/.test(prompt));
check('R1.13 exact old guard equals R1.12 published default', normalizeNewlines(oldPrompt) === normalizeNewlines(priorPrompt));
check('R1.13 exact NFKC guard equals PC-normalized R1.12 default', normalizeNewlines(oldNfkc) === normalizeNewlines(priorPrompt).normalize('NFKC'));
check('R1.13 migration write becomes the exact R1.14 guard', normalizeNewlines(nextPrompt) === normalizeNewlines(nextGuard));
check('R1.13 migration touches exact Role defaults only', sql.includes(' IN (') && sql.includes('versions."r1_12Default"') && sql.includes('versions."r1_12PcNormalizedDefault"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(sql));
check('R1.13 migration does not touch Identity/custom fallback scope', !sql.includes('AccountProfile') && !sql.includes('generationPrompt" IS NULL'));
check('Kernel retains v1.86 R1.13 history under latest v1.92', kernel.includes("version: 'hve-3-v1.99'") && kernel.includes('V1.86 P0-5 R1 Regression Narrow Reopen plus R2.1 Decision-Integrity Observability'));
console.log(`\nR1.13 Social Normalization Ownership Boundary: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
