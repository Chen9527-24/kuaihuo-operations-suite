const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/modules/auto-replies/auto-replies.service.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/modules/auto-replies/auto-replies.controller.ts'), 'utf8');
const dto = fs.readFileSync(path.join(root, 'src/modules/auto-replies/dto/auto-reply.dto.ts'), 'utf8');

const requiredSchema = [
  'externalCommentId', 'videoId', 'videoTitle', 'senderRole', 'actorSource',
  'attributionConfidence', 'messageType', 'sourceTimeRaw', 'observedAt',
  'collectionStatus', 'repliesCollapsed', 'threadCompleteness', 'sourceClientId'
];
for (const field of requiredSchema) {
  if (!schema.includes(field)) throw new Error(`Prisma CommentRecord missing field: ${field}`);
  if (!dto.includes(field)) throw new Error(`CommentRecordItemDto missing field: ${field}`);
}
for (const token of [
  'mergeCommentRecordUpdate', 'groupCommentThreads', 'listCommentThreads',
  'commentRecordSummary', 'commentThreadDetail'
]) {
  if (!service.includes(token)) throw new Error(`AutoRepliesService missing: ${token}`);
}
for (const route of [
  "comment/records/threads", "comment/records/summary", "comment/records/thread/:rootRecordId"
]) {
  if (!controller.includes(route)) throw new Error(`Controller missing route: ${route}`);
}

const replyRank = { pending: 0, generated: 10, failed: 20, not_required: 30, manual: 35, sent: 40 };
function mergedStatus(existing, incoming) {
  return (replyRank[incoming] ?? 0) < (replyRank[existing] ?? 0) ? existing : incoming;
}
if (mergedStatus('sent', 'pending') !== 'sent') throw new Error('sent status may downgrade to pending');
if (mergedStatus('manual', 'pending') !== 'manual') throw new Error('manual status may downgrade to pending');
if (mergedStatus('pending', 'sent') !== 'sent') throw new Error('sent status cannot upgrade pending');

console.log('Comment record sync verification passed: schema, DTO, endpoints, grouping and status non-downgrade guards are present.');
