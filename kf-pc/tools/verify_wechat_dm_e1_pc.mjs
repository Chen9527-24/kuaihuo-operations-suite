import fs from 'node:fs';

const source = fs.readFileSync('src/views/dialoguerecordmanagement/index.vue', 'utf8');
const checks = [
  ['wechat_video_filter_option', source.includes('<el-option label="微信视频号" value="WECHAT_VIDEO" />')],
  ['platform_label_renderer', source.includes('platformLabel(row.platform)')],
  ['wechat_video_human_label', source.includes("if (value === 'WECHAT_VIDEO') return '微信视频号';")],
  ['selection_export_preserved', source.includes('handleExport') && source.includes('selectedIds')],
  ['delete_and_watermark_preserved', source.includes('deleteDialogueConversations') && source.includes('防回灌水位')],
  ['non_text_placeholder_display', source.includes('entry.message.typePlaceholder')],
];
let failed = false;
for (const [name, ok] of checks) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log(`WeChat DM E1 PC verification passed: ${checks.length} checks.`);
