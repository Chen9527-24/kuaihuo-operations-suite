const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push([name, Boolean(condition)]);

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260806233000_intercept_unified_runtime_trace/migration.sql');
const robotsService = read('src/modules/robots/robots.service.ts');
const robotsController = read('src/modules/robots/robots.controller.ts');
const robotsModule = read('src/modules/robots/robots.module.ts');
const robotsDto = read('src/modules/robots/dto/robot.dto.ts');
const csModule = read('src/modules/customer-service-agent/customer-service-agent.module.ts');
const traceService = read('src/modules/customer-service-agent/admin/reply-traces/customer-service-reply-traces.service.ts');

check('capture stores work decision trace evidence', schema.includes('workDecisionTraceId') && schema.includes('workDecisionConfigurationHash'));
check('capture stores generated outreach trace evidence', schema.includes('intentReplyTraceId') && schema.includes('intentQualityStatus') && schema.includes('intentSafetyStatus'));
check('private message task stores generation evidence', schema.includes('replyTraceId') && schema.includes('generationProvider') && schema.includes('qualityStatus'));
check('migration is additive', migration.includes('ADD COLUMN "workDecisionTraceId"') && migration.includes('ADD COLUMN "replyTraceId"'));
check('migration has no destructive SQL', !/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(migration));
check('robots module imports customer service runtime', robotsModule.includes('CustomerServiceAgentModule'));
check('customer service module exports required services', csModule.includes('CustomerServiceChannelReplyService') && csModule.includes('CustomerServiceReplyTracesService') && csModule.includes('CustomerServiceKnowledgeEntriesService'));
check('intercept trace source types are registered', traceService.includes("'INTERCEPT_WORK_DECISION'") && traceService.includes("'INTERCEPT_INTENT_DRAFT'"));
check('decision trace supports SEND and SKIP', traceService.includes("action: 'SEND' | 'SKIP' | 'HANDOFF'"));
check('external trace keeps strategy knowledge and quality evidence', traceService.includes('strategyVersionIds') && traceService.includes('knowledgeEntryIds') && traceService.includes('qualityReport'));
check('deepseek intercept requires account profile', robotsService.includes('DeepSeek 截流机器人必须绑定一份已启用的账号资料'));
check('unified context is tenant scoped', robotsService.includes("where: { id: accountProfileId, tenantId: robot.tenantId, status: 'ENABLED', deletedAt: null }"));
check('unified context selects runtime knowledge', robotsService.includes('this.knowledgeEntries.selectForRuntime') && robotsService.includes("scenario: 'INTERCEPT_OUTREACH'"));
check('work decision saves dedicated decision trace', robotsService.includes("sourceType: 'INTERCEPT_WORK_DECISION'") && robotsService.includes('decisionTraceId = trace.id'));
check('work decision returns trace and configuration evidence', robotsService.includes('decisionTraceId,') && robotsService.includes('configurationHash: runtimeContext?.configurationHash'));
check('work decision upload DTO accepts trace evidence', robotsDto.includes('workDecisionTraceId?: string') && robotsDto.includes('workDecisionConfigurationHash?: string'));
check('capture upload re-resolves decision trace on server', robotsService.includes('resolveInterceptWorkDecisionEvidence(robot, item)') && robotsService.includes('this.replyTraces.getScopedInternal(traceId, robot.tenantId)'));
check('capture trace is bound to source robot and content', robotsService.includes("trace.sourceType !== 'INTERCEPT_WORK_DECISION'") && robotsService.includes('trace.robotId !== robot.id') && robotsService.includes('trace.sourceRefId !== expectedSourceRefId'));
check('capture authoritative fields do not trust client metadata', robotsService.includes('workDecisionTraceId: workDecisionEvidence.traceId') && !robotsService.includes('workDecisionTraceId: this.safeNullableText(item.workDecisionTraceId, 64)'));
check('deepseek outreach draft uses unified channel runtime', robotsService.includes('this.customerServiceChannelReply.execute') && robotsService.includes("sourceType: 'INTERCEPT_INTENT_DRAFT'"));
check('unified draft requires configured deepseek provider', robotsService.includes("if (binding.provider === 'DEEPSEEK' && binding.accountProfileId)"));
check('direct coze compatibility does not silently switch provider', robotsService.includes("return this.persistInterceptLegacyDraftTrace(input, binding.accountProfileId || '', replyAttemptId, postContext, null)"));
check('coze fallback receives bound account context', robotsService.includes('const fallbackParameters = input.runtimeContext?.parameters || input.requestContext'));
check('coze direct and fallback sources are distinguishable', robotsService.includes("fallbackUsed ? 'COZE_INTERCEPT_FALLBACK' : 'COZE_INTERCEPT'"));
check('unified draft persists quality and safety', robotsService.includes('intentQualityStatus: generation.qualityStatus') && robotsService.includes('intentSafetyStatus: generation.safetyStatus'));
check('private message task copies trace and safety evidence', robotsService.includes('validation.replyTraceId') && robotsService.includes('validation.qualityStatus') && robotsService.includes('validation.safetyStatus'));
check('manual message override clears generation evidence', robotsService.includes('replyTraceId: messageOverride ? null') && robotsService.includes('generationSource: messageOverride ? null'));
check('production API docs no longer claim coze-only execution', robotsController.includes('决策追踪 ID') && !robotsController.includes("根据机器人绑定提示词配置和作品口播文案调用独立 Coze 工作流，返回 shouldRun/reason。' })\n  runInterceptWorkDecision"));

// Syntax and targeted semantic diagnostics for files changed in T6.
const files = [
  'src/modules/customer-service-agent/admin/reply-traces/customer-service-reply-traces.service.ts',
  'src/modules/customer-service-agent/customer-service-agent.module.ts',
  'src/modules/robots/robots.module.ts',
  'src/modules/robots/robots.service.ts',
  'src/modules/robots/robots.controller.ts',
  'src/modules/robots/dto/robot.dto.ts',
];
let syntaxOk = true;
for (const file of files) {
  const out = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, emitDecoratorMetadata: true },
    reportDiagnostics: true,
    fileName: file,
  });
  if ((out.diagnostics || []).some((item) => item.category === ts.DiagnosticCategory.Error)) syntaxOk = false;
}
check('t6 typescript files transpile', syntaxOk);

const program = ts.createProgram(files.map((file) => path.join(root, file)), {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  noEmit: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  skipLibCheck: true,
  strict: false,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  types: [],
});
const ignored = new Set([2307, 2580, 2503, 2304, 2339, 2694, 2724]);
const relevant = ts.getPreEmitDiagnostics(program).filter((diag) => {
  if (ignored.has(diag.code) || !diag.file) return false;
  return files.some((file) => diag.file.fileName.endsWith(file));
});
check('t6 targeted semantic diagnostics are clean', relevant.length === 0);
if (relevant.length) {
  for (const diag of relevant) console.error(`TS${diag.code} ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
}

// Verify the raw INSERT keeps one argument for every numbered placeholder.
const insertMatch = robotsService.match(/INSERT INTO "PrivateMessageTask"[\s\S]*?\) VALUES \(([^`]+)\)`/);
const placeholders = insertMatch ? [...insertMatch[1].matchAll(/\$(\d+)/g)].map((m) => Number(m[1])) : [];
check('private message task insert uses contiguous placeholders', placeholders.length > 0 && Math.max(...placeholders) === 32 && new Set(placeholders).size === 32);

let passed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) passed++; }
console.log(`\n${passed}/${checks.length} passed`);
if (passed !== checks.length) process.exit(1);
