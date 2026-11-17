const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
let passed = 0;
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, '0')} ${name}`);
}
function includesAll(text, values) { return values.every((value) => text.includes(value)); }

const schema = read('prisma/schema.prisma');
check('真实私信消息保存 Trace 与生成来源', includesAll(schema, [
  'model DialogueMessage', 'replyAttemptId', 'replyTraceId', 'generationSource',
  '@@index([tenantId, replyAttemptId])', '@@index([tenantId, replyTraceId])',
]));
check('真实评论记录保存 attempt、Trace 与生成来源', includesAll(schema, [
  'model CommentRecord', 'replyAttemptId', 'replyTraceId', 'generationSource',
]));

const migration = read('prisma/migrations/20260806173000_link_reply_traces_to_records/migration.sql');
check('T2 迁移只增量增加关联字段和索引', includesAll(migration, [
  'ALTER TABLE "CommentRecord"', 'ADD COLUMN "replyAttemptId"', 'ADD COLUMN "replyTraceId"',
  'ALTER TABLE "DialogueMessage"', 'ADD COLUMN "generationSource"',
  'CREATE INDEX "CommentRecord_tenant_reply_trace_idx"',
  'CREATE INDEX "DialogueMessage_tenant_reply_trace_idx"',
]));
check('T2 迁移没有破坏性 SQL', !/\b(?:DROP\s+(?:TABLE|DATABASE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(migration));

const autoDto = read('src/modules/auto-replies/dto/auto-reply.dto.ts');
check('运行时回复 DTO 接收稳定 attempt/message 关联', includesAll(autoDto, [
  'replyAttemptId?: string', 'customerMessageId?: string', 'replyMessageId?: string',
]));
check('评论同步 DTO 接收 Trace 关联字段', includesAll(autoDto, [
  'replyTraceId?: string', 'generationSource?: string',
]));

const autoService = read('src/modules/auto-replies/auto-replies.service.ts');
check('正式私信和评论使用运行时来源类型', includesAll(autoService, [
  "return this.testCommentReply(dto, user, 'RUNTIME_COMMENT')",
  "return this.testDmReply(dto, user, 'RUNTIME_DM')",
]));
check('正式来源使用客户端稳定 attempt/message 作为 sourceRefId', includesAll(autoService, [
  'dto.replyAttemptId || dto.customerMessageId',
  'replyAttemptId: dto.replyAttemptId',
  'customerMessageId: dto.customerMessageId',
]));
const commentSync = autoService.slice(autoService.indexOf('async syncCommentRecords'), autoService.indexOf('async listCommentRecords'));
check('评论同步按租户和机器人校验权威 Trace', includesAll(commentSync, [
  'db.customerServiceReplyTrace.findMany', 'tenantId', 'robotId: dto.robotId',
  'traceById', 'traceByAttempt',
]));
check('评论同步覆盖客户端来源而不是盲目信任', includesAll(commentSync, [
  "row.replyTraceId = trace?.id ?? ''", "row.generationSource = trace?.generationSource ?? ''",
]));
const commentDto = autoService.slice(autoService.indexOf('private toCommentRecordDto'));
check('评论记录接口返回 attempt、Trace 与生成来源', includesAll(commentDto, [
  'reply_attempt_id:', 'reply_trace_id:', 'generation_source:',
]));

const dialogueDto = read('src/modules/dialogue-records/dto/dialogue-records.dto.ts');
check('私信同步 DTO 接收 Trace 关联字段', includesAll(dialogueDto, [
  'replyTraceId?: string', 'generationSource?: string',
]));
const dialogueService = read('src/modules/dialogue-records/dialogue-records.service.ts');
const dialogueSync = dialogueService.slice(dialogueService.indexOf('const suppliedTraceIds'), dialogueService.indexOf('let syncedCount'));
check('私信同步按租户与机器人查询权威 Trace', includesAll(dialogueSync, [
  'db.customerServiceReplyTrace.findMany', 'tenantId', 'robotId: dto.robotId', 'traceByAttempt',
]));
check('只有账号侧消息允许关联模型 Trace', dialogueService.includes("const trace = normalized.senderRole === 'account'"));
check('无权威证据时私信 Trace 与来源被清空', includesAll(dialogueService, [
  "normalized.replyTraceId = trace?.id ?? ''", "normalized.generationSource = trace?.generationSource ?? ''",
]));
check('私信持久化保存 Trace 与生成来源', includesAll(dialogueService, [
  'replyTraceId: normalized.replyTraceId', 'generationSource: normalized.generationSource',
]));

const calibration = read('src/modules/customer-service-agent/admin/calibrations/customer-service-calibrations.service.ts');
check('导入数据集回复不能伪装成模型校准', calibration.includes("toLowerCase() === 'imported_dataset'") && calibration.includes('导入数据集'));

console.log(`\nV5.20-T2 Core 真实记录 Trace 关联验证通过：${passed} 项。`);
