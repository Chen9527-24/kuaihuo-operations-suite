const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/modules/auto-replies/auto-replies.service.ts');
const dtoPath = path.join(root, 'src/modules/auto-replies/dto/auto-reply.dto.ts');
const controllerPath = path.join(root, 'src/modules/auto-replies/auto-replies.controller.ts');

const service = fs.readFileSync(servicePath, 'utf8');
const dto = fs.readFileSync(dtoPath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');

const checks = [
  ['sent_unconfirmed_dto', dto.includes("'sent_unconfirmed'")],
  ['sent_unconfirmed_merge_rank', service.includes('sent_unconfirmed: 38')],
  ['sent_unconfirmed_thread_summary', service.includes("statuses.includes('sent_unconfirmed')")],
  ['sent_unconfirmed_context', service.includes("['sent', 'sent_unconfirmed', 'manual', 'manual_or_external_reply']")],
  ['generic_comment_sync', controller.includes("@Post('comment/records/sync')")],
  ['thread_detail', controller.includes("comment/records/thread/:rootRecordId")],
  ['thread_context_resolver', service.includes('resolveCommentThreadContext')],
  ['wechat_platform_passthrough', service.includes('platform: ctx.platform')],
  ['platform_case_compatibility', service.includes('platformValues') && service.includes('platform.toUpperCase()')],
];

for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`[FAIL] ${name}`);
    process.exit(1);
  }
  console.log(`[PASS] ${name}`);
}
console.log(`WeChat Video comment F1 Core verification passed: ${checks.length} checks.`);
