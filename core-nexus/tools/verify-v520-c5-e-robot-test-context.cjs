const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let passed = 0;
const failures = [];
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function check(name, condition){ if(condition){ passed++; console.log(`PASS ${name}`); } else { failures.push(name); console.error(`FAIL ${name}`); } }

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260807192500_add_customer_service_robot_test_session_purpose/migration.sql');
const dto = read('src/modules/auto-replies/dto/auto-reply.dto.ts');
const auto = read('src/modules/auto-replies/auto-replies.service.ts');
const moduleSrc = read('src/modules/customer-service-agent/customer-service-agent.module.ts');
const tuningService = read('src/modules/customer-service-agent/admin/tuning-sessions/customer-service-tuning-sessions.service.ts');
const repo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-tuning-session.repository.ts');
const channel = read('src/modules/customer-service-agent/runtime/channel/customer-service-channel-reply.service.ts');
const runtime = read('src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts');
const simulation = read('src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts');
const testSession = read('src/modules/customer-service-agent/runtime/testing/customer-service-robot-test-dm-session.service.ts');
const activeUtil = read('src/modules/dialogue-records/dialogue-active-context.util.ts');
const dialogue = read('src/modules/dialogue-records/dialogue-records.service.ts');
const compiler = read('src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts');
const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const humanTurn = read('src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts');
const executionBrief = read('src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts');

check('schema adds tuning session purpose', /purpose\s+String\s+@default\("TUNING"\)/.test(schema));
check('migration adds purpose + index', migration.includes('ADD COLUMN "purpose"') && migration.includes('CsTuningSession_tenant_purpose_status_updated'));
check('robot test DTO has isolated session + client message id', dto.includes('testSessionId?: string;') && dto.includes('testClientMessageId?: string;'));
check('tuning UI list excludes robot-test sessions', tuningService.includes("purpose: 'TUNING'") && tuningService.includes("session: { ...(tenantId ? { tenantId } : {}), purpose: 'TUNING' }"));
check('repository persists purpose and supports message lookup', repo.includes("purpose: input.purpose || 'TUNING'") && repo.includes('findMessageByClientId(') && repo.includes('listMessagesByIds('));
check('robot-test session service is exported', moduleSrc.includes('CustomerServiceRobotTestDmSessionService') && /exports:[\s\S]*CustomerServiceRobotTestDmSessionService/.test(moduleSrc));
check('robot-test session validates tenant/user/purpose', testSession.includes("session.purpose !== CUSTOMER_SERVICE_ROBOT_TEST_DM_SESSION_PURPOSE") && testSession.includes('session.createdById !== userId'));
check('robot-test session is isolated from canonical ids', auto.includes("purpose: 'ROBOT_TEST_DM'") && auto.includes('isolatedFromCanonicalConversation: true') && auto.includes('isolatedTestSessionId'));
check('DeepSeek test uses server test session Active Context', auto.includes('this.robotTestDmSessions.prepare') && auto.includes('activeContextWindow: activeContext.window'));
check('Coze conversation id remains separate fallback input', auto.includes('dto.dialogueConversationId || robotTestSessionId || dto.conversationId'));
check('channel passes test session only through internal isolated option', channel.includes('tuningSessionId: input.isolatedTestSessionId') && channel.includes("input.sourceType === 'ROBOT_TEST_DM'"));
check('runtime strips tuning session unless explicitly allowed', runtime.includes('options.allowIsolatedTestSession === true') && runtime.includes('tuningSessionId: isolatedTestSession ? effectiveDto.tuningSessionId : undefined'));
check('runtime diagnostics exposes server-owned Deep Recognition typed projection without provider raw previews', runtime.includes("contract: 'DEEP_RECOGNITION_TYPED_PROJECTION_V1'") && runtime.includes("authority: 'DIAGNOSTIC_ONLY'") && runtime.includes('humanContext: result.understanding.humanContext') && runtime.includes('deepRecognition: hveDeepRecognition') && !runtime.slice(runtime.indexOf("const hveDeepRecognition ="), runtime.indexOf('const hve3AuthorityRuntime')).includes('rawResponsePreview'));
check('Robot Test response transports Deep Recognition diagnostics without recomputing semantic goals', auto.includes('hveDeepRecognition: result.diagnostics?.deepRecognition || null') && auto.includes('deepRecognition: result.diagnostics?.deepRecognition || null') && !/dominantTurnGoal\s*[:=].*messageContent/.test(auto));
check('simulation enforces tuning vs robot-test session purpose', simulation.includes("const expectedPurpose = options.sessionPurpose || 'TUNING'") && simulation.includes("session.purpose !== expectedPurpose") && runtime.includes("{ sessionPurpose: 'ROBOT_TEST_DM' }"));
check('simulation preserves budget-selected server history', simulation.includes('hasBudgetSelectedActiveContext(dto.variables)') && simulation.includes('coalesceConversationHistory(dto.conversationHistory || [])'));
check('simulation avoids duplicate message state mutation', simulation.includes('existingSessionCustomerMessage') && simulation.includes('if (!existingSessionCustomerMessage)') && simulation.includes('同一会话消息 ID 不能用于不同内容'));
check('simulation writes authoritative tuning-message evidence ids', simulation.includes('customerMessageId ? [customerMessageId] : []') && simulation.includes('evidenceMessageIds'));
check('robot-test regeneration does not append duplicate turn', testSession.includes('currentMessageAlreadyCommitted') && auto.includes('!testMessageAlreadyCommitted'));
check('robot-test active context recalls state evidence outside recent window', testSession.includes('listMessagesByIds(session.id, tenantId, evidenceIds)') && testSession.includes('uniqueDialogueRowsById'));
check('canonical and robot-test share Active Context constants', activeUtil.includes('DIALOGUE_ACTIVE_CONTEXT_DEFAULT_TOKEN_BUDGET') && dialogue.includes('DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO') && testSession.includes('DIALOGUE_ACTIVE_CONTEXT_RECENT_TOKEN_RATIO'));
check('canonical UCP/Core path uses the shared Active Context selector', auto.includes('this.dialogueRecordsService.getActiveContextForReply') && auto.includes('dialogueConversationId') && dialogue.includes('selectDialogueActiveContextRows'));
check('Active Context window exposes budget and selection evidence', ['tokenBudget','estimatedCurrentMessageTokens','estimatedStateTokens','historyTokenBudget','estimatedHistoryTokens','candidateMessageCount','selectedMessageCount','allHistoryIncluded','evidenceRecallCount','sourceConversationCount'].every((key)=>testSession.includes(key)));
check('runtime compiler preserves budget-selected conversation history', compiler.includes('const activeContextWindow = readActiveContextWindow(dto.variables);') && compiler.includes('? normalizeConversationHistory(dto.conversationHistory, true)') && compiler.includes('conversationHistory,'));
check('generation prompt maps generationContext history to recentConversation', prompt.includes('const recentConversation = contract.generationContext.conversationHistory.map') && prompt.includes('recentConversation,'));
check('Conversation Reality priorMessages is exactly generationContext history count', humanTurn.includes('const priorConversationMessages = Math.max(0, Number(recentConversationCount || 0));') && executionBrief.includes('recentConversationCount: input.contract.generationContext.conversationHistory.length'));

// Execute the exact shared selector to verify short-history/full-history and long-history/evidence-recall behavior.
const utilJs = ts.transpileModule(activeUtil, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleObj = { exports: {} };
new Function('module','exports','require', utilJs)(moduleObj, moduleObj.exports, require);
const util = moduleObj.exports;
const shortRows = [
  { id:'m1', textContent:'你好' },
  { id:'m2', textContent:'我喜欢黑色通勤款' },
  { id:'m3', textContent:'有别的吗？' },
];
const full = util.selectDialogueActiveContextRows({ effectiveRows: shortRows, evidenceIds:['m2'], historyTokenBudget:1000, candidateComplete:true });
check('shared selector keeps full short history within budget', full.selectionMode === 'FULL_HISTORY' && full.selectedRows.length === 3 && full.allHistoryIncluded === true);
const longRows = Array.from({length:40}, (_,i)=>({ id:`m${i}`, textContent:`第${i}轮消息 ` + '内容'.repeat(30) }));
const selected = util.selectDialogueActiveContextRows({ effectiveRows: longRows, evidenceIds:['m2'], historyTokenBudget:180, candidateComplete:true });
check('shared selector uses State evidence + recent raw when over budget', selected.selectionMode === 'STATE_EVIDENCE_RECENT' && selected.selectedRows.some(x=>x.id==='m2') && selected.evidenceRecallCount >= 1);

const tsFiles = [
  'src/modules/auto-replies/auto-replies.service.ts',
  'src/modules/auto-replies/dto/auto-reply.dto.ts',
  'src/modules/customer-service-agent/customer-service-agent.module.ts',
  'src/modules/customer-service-agent/admin/tuning-sessions/customer-service-tuning-sessions.service.ts',
  'src/modules/customer-service-agent/infrastructure/persistence/customer-service-tuning-session.repository.ts',
  'src/modules/customer-service-agent/runtime/channel/customer-service-channel-reply.service.ts',
  'src/modules/customer-service-agent/runtime/reply/customer-service-runtime-reply.service.ts',
  'src/modules/customer-service-agent/runtime/simulation/customer-service-simulation.service.ts',
  'src/modules/customer-service-agent/runtime/testing/customer-service-robot-test-dm-session.service.ts',
  'src/modules/dialogue-records/dialogue-active-context.util.ts',
  'src/modules/dialogue-records/dialogue-records.service.ts',
  'src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-nlg-execution-brief.ts',
];
let syntaxOk = true;
for(const rel of tsFiles){
  const diagnostics = ts.transpileModule(read(rel), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}, reportDiagnostics:true, fileName:rel }).diagnostics || [];
  if(diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error)){ syntaxOk=false; break; }
}
check(`changed TypeScript syntax transpile (${tsFiles.length} files)`, syntaxOk);

console.log(`\nC5-E Core checks: ${passed}/${passed + failures.length} passed`);
if(failures.length){ console.error(failures.join('\n')); process.exit(1); }
