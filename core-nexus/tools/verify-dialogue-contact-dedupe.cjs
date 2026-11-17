const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ts = require('typescript');

const servicePath = path.resolve(__dirname, '../src/modules/dialogue-records/dialogue-records.service.ts');
const source = fs.readFileSync(servicePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
  },
  fileName: servicePath,
}).outputText;

const sandbox = {
  exports: {},
  module: { exports: {} },
  console,
  require(id) {
    if (id === 'crypto') return crypto;
    if (id === '@nestjs/common') {
      return {
        Injectable: () => (target) => target,
        BadRequestException: class BadRequestException extends Error {},
        NotFoundException: class NotFoundException extends Error {},
      };
    }
    if (id.includes('pagination.dto')) return { getPagination: () => ({ page: 1, pageSize: 20, skip: 0, take: 20 }) };
    if (id.includes('tenant-scope')) return { resolveRequiredTenantId: () => '', resolveTenantId: () => '' };
    if (id.includes('prisma.service')) return { PrismaService: class PrismaService {} };
    if (id.includes('dialogue-records.dto')) return {};
    throw new Error(`Unexpected require: ${id}`);
  },
};
sandbox.module.exports = sandbox.exports;
vm.runInNewContext(compiled, sandbox, { filename: servicePath });
const Service = sandbox.exports.DialogueRecordsService;
const service = new Service({});

function message({ id, clientMessageId = id, conversationId, senderRole, text, historyKind, observedAt, sequenceIndex, ...extra }) {
  return {
    id,
    clientMessageId,
    conversationId,
    senderRole,
    messageType: 'text',
    textContent: text,
    typePlaceholder: '',
    historyKind,
    timeAccuracy: historyKind === 'live_observed' ? 'live_observed' : 'unknown_history',
    observedAt: new Date(observedAt),
    createdAt: new Date(observedAt),
    sequenceIndex,
    ...extra,
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const copiedBaseline = service.buildEffectiveMessages([
  message({ id: 'u-live', conversationId: 'old', senderRole: 'user', text: '在哪儿呢，下班没', historyKind: 'initial_visible_baseline', observedAt: '2026-07-16T20:52:48+08:00', sequenceIndex: 1 }),
  message({ id: 'a-live', conversationId: 'old', senderRole: 'account', text: '刚下班，正往家走呢～你找我有事儿呀？', historyKind: 'live_observed', observedAt: '2026-07-16T20:53:15+08:00', sequenceIndex: 2, replyAttemptId: 'reply-1', attributionConfidence: 'verified', actorSource: 'ucp_robot' }),
  message({ id: 'u-copy', conversationId: 'new', senderRole: 'user', text: '在哪儿呢，下班没', historyKind: 'initial_visible_baseline', observedAt: '2026-07-16T21:33:11+08:00', sequenceIndex: 1 }),
  message({ id: 'a-copy', conversationId: 'new', senderRole: 'account', text: '刚下班，正往家走呢～你找我有事儿呀？', historyKind: 'initial_visible_baseline', observedAt: '2026-07-16T21:33:11+08:00', sequenceIndex: 2 }),
]);
assertEqual(copiedBaseline.rawCount, 4, 'copied baseline raw count');
assertEqual(copiedBaseline.duplicateCount, 2, 'copied baseline duplicate count');
assertEqual(copiedBaseline.items.length, 2, 'copied baseline effective count');

const repeatedSameSegment = service.buildEffectiveMessages([
  message({ id: 'repeat-1', conversationId: 'same', senderRole: 'user', text: '在吗', historyKind: 'live_observed', observedAt: '2026-07-16T10:00:00+08:00', sequenceIndex: 1 }),
  message({ id: 'repeat-2', conversationId: 'same', senderRole: 'user', text: '在吗', historyKind: 'live_observed', observedAt: '2026-07-16T10:00:01+08:00', sequenceIndex: 2 }),
  message({ id: 'repeat-3', conversationId: 'same', senderRole: 'user', text: '在吗', historyKind: 'live_observed', observedAt: '2026-07-16T10:00:02+08:00', sequenceIndex: 3 }),
]);
assertEqual(repeatedSameSegment.items.length, 3, 'same-segment repeated text must remain');

const legitimateLaterRepeat = service.buildEffectiveMessages([
  message({ id: 'day1-user', conversationId: 'day1', senderRole: 'user', text: '在吗', historyKind: 'live_observed', observedAt: '2026-07-16T10:00:00+08:00', sequenceIndex: 1 }),
  message({ id: 'day1-account', conversationId: 'day1', senderRole: 'account', text: '在的', historyKind: 'live_observed', observedAt: '2026-07-16T10:00:10+08:00', sequenceIndex: 2, replyAttemptId: 'day1-reply' }),
  message({ id: 'day2-user', conversationId: 'day2', senderRole: 'user', text: '在吗', historyKind: 'live_observed', observedAt: '2026-07-17T10:00:00+08:00', sequenceIndex: 1 }),
  message({ id: 'day2-account', conversationId: 'day2', senderRole: 'account', text: '在的', historyKind: 'live_observed', observedAt: '2026-07-17T10:00:10+08:00', sequenceIndex: 2, replyAttemptId: 'day2-reply' }),
]);
assertEqual(legitimateLaterRepeat.items.length, 4, 'legitimate later repeated conversation must remain');

const stableIdCopy = service.buildEffectiveMessages([
  message({ id: 'stable-live', clientMessageId: 'same-source-id', conversationId: 'stable1', senderRole: 'user', text: '你好', historyKind: 'live_observed', observedAt: '2026-07-16T09:00:00+08:00', sequenceIndex: 1 }),
  message({ id: 'stable-copy', clientMessageId: 'same-source-id', conversationId: 'stable2', senderRole: 'user', text: '你好', historyKind: 'initial_visible_baseline', observedAt: '2026-07-16T09:01:00+08:00', sequenceIndex: 1 }),
]);
assertEqual(stableIdCopy.items.length, 1, 'stable source id duplicate');

console.log('Dialogue effective-message dedupe verification passed: 4 scenarios.');
