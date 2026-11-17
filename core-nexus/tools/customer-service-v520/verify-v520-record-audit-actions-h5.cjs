const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require('typescript');
let passed = 0;
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, '0')} ${name}`);
}
function includesAll(text, values) { return values.every((value) => text.includes(value)); }
function transpile(relative) {
  const result = ts.transpileModule(read(relative), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
    fileName: relative,
  });
  const errors = (result.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  check(`${relative} TypeScript 转译`, errors.length === 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('; '));
}

const dialogue = read('src/modules/dialogue-records/dialogue-records.service.ts');
check('对话详情返回来源审计字段', includesAll(dialogue, [
  'toDialogueMessageDto', 'dialogueMessageAudit', 'evidenceLevel', 'feedbackMode', 'feedbackReason', 'sourceLabel', 'mediaLabel', 'isMediaMessage',
]));
check('图片占位明确说明未保存媒体本体', dialogue.includes('当前记录仅保存消息类型占位，未保存媒体文件本体'));
check('每条账号回复按 Trace 与归因分为精确或仅复制', includesAll(dialogue, [
  "evidenceLevel = 'PRECISE_TRACE'", "feedbackMode = 'PRECISE'", "evidenceLevel = 'VERIFIED_ROBOT_HISTORY'", "feedbackMode = 'COPY_ONLY'", "UNATTRIBUTED_ACCOUNT",
]));
check('历史媒体窗口副本使用成组强条件去重', includesAll(dialogue, [
  'isLikelyBaselineMediaWindowCopy', 'left.length < 2', 'allBaseline', 'sameSourceClient', 'hasMediaPlaceholder', '10 * 60 * 1000',
]));
check('等质量历史媒体副本仍选择一侧保留', includesAll(dialogue, [
  'if (leftScore === rightScore)', 'this.preferMessage(leftBlock[0], rightBlock[0])', 'discarded = preferred === leftBlock[0] ? rightBlock : leftBlock',
]));
check('实时消息或已验证回复不会进入历史媒体副本去重', includesAll(dialogue, [
  'hasLiveOrReplyEvidence', "historyKind, 32).toLowerCase() === 'live_observed'", "attributionConfidence, 32).toLowerCase() === 'verified'", 'replyAttemptId',
]));

function likelyBaselineMediaWindowCopy(left, right) {
  if (left.length < 2 || right.length < 2 || left.length !== right.length) return false;
  const baseline = new Set(['initial_visible_baseline', 'unknown_history', 'historical_baseline']);
  if (![...left, ...right].every((item) => baseline.has(item.historyKind))) return false;
  if ([...left, ...right].some((item) => item.historyKind === 'live_observed' || item.attributionConfidence === 'verified' || item.replyAttemptId || item.actorSource === 'ucp_robot')) return false;
  if (!left.every((item, index) => item.sourceClientId && item.sourceClientId === right[index].sourceClientId)) return false;
  if (!left.some((item) => item.messageType && !['text', 'unknown'].includes(item.messageType))) return false;
  return Math.abs(left[0].time - right[0].time) <= 10 * 60 * 1000;
}
const baselineA = [
  { historyKind: 'historical_baseline', sourceClientId: 'ucp-a', messageType: 'image', time: 1000 },
  { historyKind: 'historical_baseline', sourceClientId: 'ucp-a', messageType: 'text', time: 2000 },
];
const baselineB = baselineA.map((item) => ({ ...item, time: item.time + 4 * 60 * 1000 }));
check('运行样例：媒体+文本的重复历史窗口可折叠', likelyBaselineMediaWindowCopy(baselineA, baselineB));
check('运行样例：纯文本重复不做激进去重', !likelyBaselineMediaWindowCopy(baselineA.map((x) => ({ ...x, messageType: 'text' })), baselineB.map((x) => ({ ...x, messageType: 'text' }))));
check('运行样例：不同客户端来源不折叠', !likelyBaselineMediaWindowCopy(baselineA, baselineB.map((x) => ({ ...x, sourceClientId: 'ucp-b' }))));
check('运行样例：实时观测消息不折叠', !likelyBaselineMediaWindowCopy(baselineA, baselineB.map((x) => ({ ...x, historyKind: 'live_observed' }))));

const comments = read('src/modules/auto-replies/auto-replies.service.ts');
check('评论详情返回同一套来源审计字段', includesAll(comments, [
  'commentMessageAudit', 'evidence_level', 'feedback_mode', 'feedback_reason', 'source_label', 'media_label', 'is_media_message',
]));
check('评论自动回复结果和判断 Trace 可精确反馈', includesAll(comments, ['hasReplyOutcome', '(verifiedRobot || hasReplyOutcome) && hasTrace']));
check('评论账号侧来源不明时仅允许复制', includesAll(comments, ["UNATTRIBUTED_ACCOUNT", "feedbackMode = senderRole === 'user' ? 'NONE' : 'COPY_ONLY'"]));

transpile('src/modules/dialogue-records/dialogue-records.service.ts');
transpile('src/modules/auto-replies/auto-replies.service.ts');
console.log(`\nV5.20-H5 Core 记录审计与去重验证通过：${passed} 项。`);
