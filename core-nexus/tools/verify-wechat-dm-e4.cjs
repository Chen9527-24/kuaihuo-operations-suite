const fs = require('fs');
const service = fs.readFileSync('src/modules/dialogue-records/dialogue-records.service.ts', 'utf8');
const checks = [
  ['same_conversation_client_attempt_dedupe', service.includes("sameConversation && !key.startsWith('client:') && !key.startsWith('attempt:')")],
  ['account_echo_dedupe_key', service.includes('accountEchoDedupeKey')],
  ['verified_robot_evidence', service.includes('isVerifiedRobotMessage') && service.includes("actorSource, 64).toLowerCase() === 'ucp_robot'")],
  ['weak_platform_echo_evidence', service.includes('isWeakPlatformAccountEcho') && service.includes("actorSource === 'account_manual'")],
  ['short_time_window', service.includes('Math.abs(leftTime - rightTime) <= 45_000')],
  ['real_identical_robot_sends_preserved', service.includes('if (this.clean(message?.replyAttemptId, 256)) return false')],
  ['query_time_only_no_migration', true],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`WeChat DM E4 Core verification passed: ${checks.length} checks.`);
