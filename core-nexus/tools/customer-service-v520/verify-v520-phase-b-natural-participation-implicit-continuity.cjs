const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const prompt = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const state = read('src/modules/customer-service-agent/runtime/state/customer-service-conversation-state.reducer.ts');
const kernel = read('src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts');

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}`);
  }
}

const budgetStart = state.indexOf('export function projectCustomerServiceActiveContextBudgetState(');
const budgetEnd = state.indexOf('/**\r\n * B cross-turn continuity projection', budgetStart) >= 0
  ? state.indexOf('/**\r\n * B cross-turn continuity projection', budgetStart)
  : state.indexOf('/**\n * B cross-turn continuity projection', budgetStart);
const budget = state.slice(budgetStart, budgetEnd > budgetStart ? budgetEnd : undefined);

check('v1.48 continuity mechanics remain preserved under current kernel', kernel.includes('V1.48 Natural Participation + Implicit Continuity Convergence') && kernel.includes('V1.50 Runtime Expression Responsibility Clearance'));
check('P0-1 removes the v1.48 exhaustive-report participation prose from Runtime model-facing prompt', !prompt.includes('对话是逐轮参与，不是一次性报告') && !prompt.includes('不表示要穷尽当前消息里所有可展开的细节'));
check('P0-1 removes Runtime-authored multi-detail output-amount guidance', !prompt.includes('不要机械逐项扫描、逐项给方案') && !prompt.includes('结合当前重点自然选择足够的参与'));
check('P0-1 removes Runtime-authored accepted-turn closing guidance', !prompt.includes('不要重播已经接受的旧建议来证明价值'));
check('P0-1 removes Runtime-authored lived-continuity phrasing guidance', !prompt.includes('连续性应像亲历过这段交流一样被默默使用') && !prompt.includes('不要复述、总结或列举历史来证明“我记得”'));
check('continuity remains projected as read-only facts rather than a new expression authority', prompt.includes('仅是只读连续事实') && prompt.includes('不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则'));
check('no fixed output amount was reintroduced', prompt.includes('不存在固定配额') && !prompt.includes('最多 68') && !prompt.includes('最多68'));

check('model frame structurally de-duplicates prior speaker turns already present in raw assistant history', prompt.includes('isContinuityEvidenceAlreadyInRawConversation(item.excerpt, recentAssistantTexts)'));
check('model frame structurally de-duplicates memories already present in selected raw history', prompt.includes('isContinuityEvidenceAlreadyInRawConversation(item.value, recentConversationTexts)'));
check('de-duplication is normalized structural matching rather than semantic role/domain rules', prompt.includes("replace(/\\s+/g, ' ')") && prompt.includes('raw === evidence') && prompt.includes('raw.includes(evidence)'));
check('bounded diagnostic excerpts are de-duplicated structurally against their full raw assistant turn', prompt.includes('isBoundedExcerpt') && prompt.includes('raw.startsWith(comparableEvidence)'));
check('older relevant continuity evidence remains possible when absent from raw history', prompt.includes('const priorSpeakerTurns = conversationReality.recentAssistantMoves') && prompt.includes('.filter((item) => !isContinuityEvidenceAlreadyInRawConversation'));
check('historical assistant content becomes non-chat continuity evidence with no current surface authority', prompt.includes("continuityAuthority: 'LIVED_CONVERSATION_EVIDENCE_ONLY'") && prompt.includes("currentSurfaceAuthority: 'NONE'") && prompt.includes('verbatimEvidence: content') && prompt.includes('既往回复的开头、措辞、顺序、篇幅和组织方式都不是本轮表达示例'));

check('active-context budget keeps task slots that are actually model-facing', budget.includes('pendingSlots:') && budget.includes('providedSlots:') && budget.includes('unresolvedGoals:') && budget.includes('anchors:'));
check('active-context budget keeps factual assistant continuity only', budget.includes('turn: Math.max') && budget.includes('excerpt: truncate') && budget.includes('accepted: item.accepted') && budget.includes('requestedDeltas:'));
check('legacy assistant behavior planning no longer consumes raw-history budget', !budget.includes('strategyKey:') && !budget.includes('structureKey:') && !budget.includes('logicalActionKey:') && !budget.includes('planFulfillment:'));
check('legacy relationshipDynamics no longer consumes raw-history budget', !budget.includes('supportMode:') && !budget.includes('conversationTempo:') && !budget.includes('recommendedStance:') && !budget.includes('previousReplyReception:'));
check('diagnostic closed questions and duplicate canonical projection no longer consume raw-history budget', !budget.includes('closedSemanticQuestions:') && !budget.includes('canonical:'));
check('question-ending cadence diagnostic no longer consumes raw-history budget', !budget.includes('consecutiveQuestionEndingTurns'));

check('HVE_REPLY_V2 remains model-owned delivery protocol with Act-bound units', prompt.includes('HVE_REPLY_V2') && prompt.includes('由你按自然交流节奏直接决定 1/N 条') && prompt.includes('units 是同一实际消息的 semantic binding'));
check('no new retry or post-generation rewrite path added in this stage', kernel.toLowerCase().includes('no phrase/role/domain rule, length/beat/message quota, new planner/gate/judge/repair/retry/model call, or post-generation rewrite is added'));

console.log(`\nPhase B Natural Participation + Implicit Continuity: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
