const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/modules/auto-replies/auto-replies.service.ts');
const source = fs.readFileSync(file, 'utf8');
const checks = [
  ['account_owner_role', source.includes('作品的发布账号本人/账号运营者身份')],
  ['not_bystander_or_service', source.includes('不要像旁观网友、客服或机器人')],
  ['factual_boundary', source.includes('地点、拍摄方式、设备、价格、开放时间、效果等没有依据时，不得猜测或装作确定')],
  ['certainty_consistency', source.includes('后续回复的确定程度不能无依据高于前文')],
  ['no_private_message_steering', source.includes('不要引导私信')],
  ['works_without_history', !/if\s*\(\s*!rows\.length\s*\)\s*return\s+userInput/.test(source)],
  ['final_text_only', source.includes('只输出最终可发布的中文回复文本')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) {
    console.log(`[PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}`);
  }
}
if (failed) {
  console.error(`Comment role D10 verification failed: ${failed}/${checks.length} checks.`);
  process.exit(1);
}
console.log(`Comment role D10 verification passed: ${checks.length} checks.`);
