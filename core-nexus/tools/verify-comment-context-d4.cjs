const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checks = [
  ['DTO context item', 'src/modules/auto-replies/dto/auto-reply.dto.ts', 'CommentThreadContextItemDto'],
  ['DTO thread id', 'src/modules/auto-replies/dto/auto-reply.dto.ts', 'commentThreadId?: string'],
  ['DTO context array', 'src/modules/auto-replies/dto/auto-reply.dto.ts', 'threadContext?: CommentThreadContextItemDto[]'],
  ['client context resolver', 'src/modules/auto-replies/auto-replies.service.ts', 'resolveCommentThreadContext'],
  ['server fallback', 'src/modules/auto-replies/auto-replies.service.ts', "source: items.length ? 'server_records' : 'none'"],
  ['context prompt builder', 'src/modules/auto-replies/auto-replies.service.ts', 'buildCommentContextInput'],
  ['plain workflow context', 'src/modules/auto-replies/auto-replies.service.ts', 'requestCozePlainWorkflow(contextualInput, workflow)'],
  ['structured workflow context', 'src/modules/auto-replies/auto-replies.service.ts', 'buildCommentWorkflowParameters(dto, prompt, contextualInput)'],
  ['context metadata', 'src/modules/auto-replies/auto-replies.service.ts', 'contextMessageCount: context.items.length'],
];
const failed = checks.filter(([, file, token]) => {
  const full = path.join(root, file);
  return !fs.existsSync(full) || !fs.readFileSync(full, 'utf8').includes(token);
}).map(([name]) => name);
if (failed.length) {
  console.error(`Comment context verification failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`Comment context verification passed: ${checks.length} checks.`);
