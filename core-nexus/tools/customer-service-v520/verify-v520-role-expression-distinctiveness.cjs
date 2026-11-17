#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const authority = read('src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts');
const roleDefault = read('src/modules/customer-service-agent/admin/foundation/templates/customer-service-generation-prompt.template.ts');
let pass = 0; let fail = 0;
const check = (name, ok) => { if (ok) { pass += 1; console.log(`PASS ${name}`); } else { fail += 1; console.error(`FAIL ${name}`); } };

check('failed E2 wording-first helper remains retired', !prompt.includes('buildRoleExpressionMethodInstruction'));
check('retired Role judgment helper remains absent', !prompt.includes('buildRoleJudgmentRealizationInstruction') && !authority.includes('judgmentRealization'));
check('Role to Identity persisted Prompt is the sole editable expression chain', authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && authority.includes('generationPrompt.role') && authority.includes('generationPrompt.identity'));
check('default Role Prompt delegates wording and natural amount to the model', roleDefault.includes('具体怎么说、自然说多少、分几条消息，由当前对话决定'));
check('default Role Prompt distinguishes customer-owned premises from this-turn contribution', roleDefault.includes('先分清什么是共同前提，什么是本轮新增贡献') && roleDefault.includes('只作为推理前提使用') && roleDefault.includes('默认不重新声明'));
check('default Role Prompt prevents customer-owned premises from being repackaged as model judgments', roleDefault.includes('不要因为同意、认可、确认、理解或加强语气') && roleDefault.includes('把它包装成自己的判断'));
check('default Role Prompt keeps only semantically necessary premise restatement', roleDefault.includes('指代不清、条件范围错误') && roleDefault.includes('本轮需要确认、纠正、质疑的对象') && roleDefault.includes('最小必要表达'));
check('default Role Prompt preserves confidence for genuinely new model-owned judgments', roleDefault.includes('真正由你本轮新增的判断、信息、选择、风险或办法') && roleDefault.includes('自然表达确定程度') && roleDefault.includes('直接从实际增量开始'));
check('default Role Prompt preserves genuine relational functions without treating emotional wording as sufficient', roleDefault.includes('只有情绪安定本身就是本轮任务') && roleDefault.includes('关系修复、误解消除、责任承认时') && roleDefault.includes('承接或肯定本身才是实际贡献') && roleDefault.includes('普通咨询即使带有情绪色彩，也直接完成实际判断、选择、建议或办法'));
check('default Role Prompt has no lexical blacklist or observed-sample wording rule', !/(确实该|完全理解|广州热的话确实|肩膀宽的话|伸缩绳确实|关键词|黑名单)/.test(roleDefault));
check('default Role Prompt does not expose internal acknowledgement fields', !roleDefault.includes('selectedComponents') && !roleDefault.includes('selected=false'));
check('no role/domain/test-sentence branch exists', !/(宠物|女装|护肤|SaaS|角色编码|行业编码)/i.test(roleDefault + prompt + authority));
check('no fixed first-person or lexical persona proof is installed', !prompt.includes('有边界的第一人称判断') && !prompt.includes('必须让其中至少一个与当前语义相关的选择在客户可见表达里真实可感'));
console.log(`\nRole Expression Distinctiveness Authority: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
