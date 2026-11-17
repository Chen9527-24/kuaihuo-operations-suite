const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const knowledge = read('src/views/customer-service/context-profiles/components/BusinessKnowledgePanel.vue');
const profiles = read('src/views/customer-service/context-profiles/index.vue');
const calibration = read('src/views/customer-service/simulation/components/CalibrationFeedbackDialog.vue');
const xlsx = read('src/modules/customer-service/utils/xlsx-import.ts');

const checks = [
  ['knowledge collection import exists', knowledge.includes('title="导入知识库"') && knowledge.includes('downloadCollectionImportTemplate')],
  ['collection relationships are selected in dialog', knowledge.includes('collectionImportForm.storeIds') && knowledge.includes('collectionImportForm.roleIds') && knowledge.includes('collectionImportForm.accountIds')],
  ['regular and fixed direct imports are separate', knowledge.includes('title="导入常规知识"') && knowledge.includes('title="导入固定问答（输入 → 输出）"')],
  ['regular import explicitly rejects fixed QA', knowledge.includes('常规知识导入检测到 FIXED_QA / fixedQa 配置') && knowledge.includes('normalizeImportedEntries(rows,true)')],
  ['fixed direct import remains canonical FUZZY', knowledge.includes("matchType:'FUZZY'") && knowledge.includes('downloadFixedQaImportTemplate')],
  ['all import dialogs offer templates', knowledge.includes('downloadRegularKnowledgeTemplate') && knowledge.includes('downloadCollectionImportTemplate') && knowledge.includes('downloadFixedQaImportTemplate')],
  ['account/background import exists', profiles.includes('title="导入账号背景 / 身份资料"') && profiles.includes('downloadProfileImportTemplate')],
  ['background relationships are manual in dialog', profiles.includes('profileImportForm.merchantRoleId') && profiles.includes('profileImportForm.industryNodeId') && profiles.includes('profileImportForm.storeMode')],
  ['existing store import does not overwrite store facts', profiles.includes('关联已有店铺时，不覆盖店铺事实') && profiles.includes("profileImportForm.storeMode === 'CREATE_PER_ROW'" )],
  ['calibration has per-iteration knowledge action', calibration.includes('@click.stop="openKnowledgeCapture(version)"') && calibration.includes('knowledgeCaptureVersion.value = version')],
  ['calibration target knowledge collection is explicit', calibration.includes('v-model="knowledgeCaptureForm.collectionId"') && calibration.includes('listCustomerServiceKnowledgeCollections')],
  ['calibration supports regular and fixed direct knowledge distinctly', calibration.includes('value="REGULAR">常规知识') && calibration.includes('value="FIXED_QA">固定答案直出')],
  ['calibration fixed direct preserves FUZZY no-model semantics', calibration.includes("matchType:'FUZZY'") && calibration.includes('固定答案直出会跳过模型')],
  ['calibration regular knowledge is conservative', calibration.includes("authorityLevel:'REFERENCE_ONLY'") && calibration.includes("sourceType: 'CALIBRATION_DRAFT'" )],
  ['xlsx helper supports generated templates and parsing', xlsx.includes('downloadCustomerServiceXlsxTemplate') && xlsx.includes('parseCustomerServiceXlsx')],
];

let passed = 0;
for (const [name, ok] of checks) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    console.error(`FAIL ${name}`);
  }
}
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);
