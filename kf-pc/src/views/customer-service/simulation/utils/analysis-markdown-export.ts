import type { CustomerServiceTuningAnalysis, CustomerServiceTuningSessionDetails } from '@/modules/customer-service/types/tuning-sessions.types';
import type {
  CustomerServiceIntentHypothesis,
  CustomerServiceModelAttempt,
  CustomerServiceQualityIssue,
  CustomerServiceRecognizedItem,
  CustomerServiceRewriteAttempt,
  CustomerServiceTurnGoal,
} from '@/modules/customer-service/types/simulation.types';

type ExportInput = {
  session: CustomerServiceTuningSessionDetails | null;
  analysis: CustomerServiceTuningAnalysis;
};

type ConsistencyCheck = { status: 'PASS' | 'WARNING' | 'INFO'; name: string; detail: string };

const asArray = <T>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];

export function buildCustomerServiceAnalysisMarkdown({ session, analysis }: ExportInput) {
  const contract = analysis.runtimeContract;
  const understanding = analysis.understanding;
  const human = understanding.humanContext;
  const orchestration = contract.orchestrationPlan;
  const recognition = understanding.recognitionModel;
  const intentRanking = understanding.intentRanking || orchestration?.intentRanking || [];
  const goals = human.rankedTurnGoals || orchestration?.rankedTurnGoals || [];
  const dominantGoal = human.dominantTurnGoal || orchestration?.dominantTurnGoal || null;
  const taskState = human.conversationTaskState || null;
  const recognizedItems = asArray(understanding.recognizedItems);
  const generation = analysis.generation;
  const quality = analysis.quality;
  const strategy = contract.strategyPolicy || {
    sources: [],
    resolved: {},
    conflicts: [],
    inheritance: null,
    schemaVersion: 0,
    legacyCompatibility: { calibrationAdvisoryOnly: true, intentJsonMigratedAtRuntime: false },
  };
  const conversation = buildConversationSnapshot(analysis);
  const checks = buildConsistencyChecks(analysis);
  const lines: string[] = [];

  lines.push('# 智能客服回复调优 · 当前分析明细', '');
  lines.push('> 本文档由 PC 管理端从单条历史分析记录导出。前半部分用于人工审阅，末尾保留完整原始 JSON。', '');

  heading(lines, '一、分析基本信息');
  table(lines, [
    ['会话名称', session?.title || '未提供'],
    ['分析序号', `#${analysis.sequenceNo}`],
    ['分析类型', analysis.runType === 'EXECUTE' ? '生成与质检' : '只分析'],
    ['创建时间', formatTime(analysis.createdAt)],
    ['分析记录 ID', analysis.id],
    ['客服角色', contract.identity?.merchantRole ? `${contract.identity.merchantRole.name}（${contract.identity.merchantRole.code}）` : '历史记录未保存'],
    ['行业能力', contract.classification?.industry?.path || contract.classification?.industry?.name || '未绑定'],
    ['运行模式', contract.runtimeMode || '历史记录未保存'],
    ['配置哈希', contract.provenance?.configurationHash || '历史记录未保存'],
  ]);

  heading(lines, '二、完整对话上下文');
  if (!conversation.length) lines.push('_没有保存对话上下文。_', '');
  for (const item of conversation) {
    lines.push(`### ${item.current ? '本轮客户消息' : item.role === 'CUSTOMER' ? '客户' : '阿梨'}`, '', blockquote(item.content), '');
  }

  heading(lines, '三、最终识别摘要');
  table(lines, [
    ['识别来源', understanding.source],
    ['主场景', understanding.primaryScenario],
    ['稳定主意图', understanding.primaryIntent],
    ['情绪 / 风险', `${understanding.emotion} / ${understanding.riskLevel}`],
    ['识别置信度', percent(understanding.confidence)],
    ['对话阶段', human.interactionStrategy.phase],
    ['本轮第一动作', human.interactionStrategy.firstMove],
    ['经营时机', human.interactionStrategy.commercialTiming],
    ['商业开放度', `${human.commercialOpenness} / ${human.commercialOpennessScore}`],
    ['经营阶段', human.commercialStrategy?.stage || '历史记录未保存'],
    ['商品提及权限', human.commercialStrategy?.productMentionPolicy || '历史记录未保存'],
  ]);

  heading(lines, '四、DeepSeek 识别诊断');
  table(lines, [
    ['模型', recognition.model || '未调用'],
    ['状态', recognition.status],
    ['耗时', `${recognition.elapsedMs || 0} ms`],
    ['请求 ID', recognition.requestId || '无'],
    ['结束原因', recognition.finishReason || '未返回'],
    ['响应长度', recognition.responseLength == null ? '未记录' : `${recognition.responseLength} 字符`],
    ['首次解析错误', recognition.parseError || '无'],
    ['结构恢复模式', recognition.recoveryMode || '未使用'],
    ['再生成尝试', recognition.repairAttempted ? '是' : '否'],
    ['再生成成功', recognition.repairSucceeded ? '是' : '否'],
    ['再生成请求 ID', recognition.repairRequestId || '无'],
    ['再生成解析错误', recognition.repairParseError || '无'],
    ['快速路径原因', recognition.fastPathReason || '未使用快速路径'],
    ['最终说明', recognition.errorMessage || (recognition.status === 'FAST_PATH' ? '高置信度快速识别，未调用 DeepSeek' : '模型结构化识别成功')],
  ]);
  if (recognition.rawResponsePreview) jsonSection(lines, '首次模型响应预览', recognition.rawResponsePreview);
  if (recognition.repairResponsePreview) jsonSection(lines, '结构再生成响应预览', recognition.repairResponsePreview);

  heading(lines, '五、上下文多意图排序');
  if (!intentRanking.length) lines.push('_该历史记录未保存多意图排序。_', '');
  else intentRanking.forEach((item, index) => renderIntent(lines, item, index + 1));

  heading(lines, '六、本轮目标排序');
  if (dominantGoal) {
    lines.push(`**主导目标：${dominantGoal.name}（${dominantGoal.key}）**`, '', `- 置信度：${percent(dominantGoal.confidence)}`, `- 优先级：${dominantGoal.priority}`, `- 依据：${plain(dominantGoal.reason)}`, `- 回复要求：${plain(dominantGoal.responseRequirement)}`, '');
  }
  if (!goals.length) lines.push('_该历史记录未保存本轮目标排序。_', '');
  else goals.forEach((item, index) => renderGoal(lines, item, index + 1));

  heading(lines, '七、多轮任务与待补信息');
  if (!taskState) lines.push('_该历史记录未保存多轮任务状态。_', '');
  else {
    const pendingSlots = asArray(taskState.pendingSlots);
    const providedSlots = asArray(taskState.providedSlots);
    const unresolvedGoals = asArray(taskState.unresolvedGoals);
    const suspendedTasks = asArray(taskState.suspendedTasks);
    const semanticQuestions = asArray(taskState.semanticQuestions);
    const taskEvidence = asArray(taskState.evidence);

    table(lines, [
      ['当前轮关系', taskState.currentTurnRelation || '历史记录未保存'],
      ['请求回应类型', taskState.requestResponseType || '历史记录未保存'],
      ['任务状态', taskState.status || '历史记录未保存'],
      ['当前任务', `${taskState.activeScenario || 'UNKNOWN'} / ${taskState.activeIntent || 'UNKNOWN'}`],
      ['上一轮客服请求', taskState.lastAssistantRequest || '无'],
      ['待补信息', taskState.status === 'WAITING_FOR_CUSTOMER' ? pendingSlots.map((item) => `${item.name}（${item.status}）`).join('；') || '无' : '当前责任不在客户'],
      ['当前责任', taskState.responsibility || 'NONE'],
      ['已关闭语义问题', semanticQuestions.filter((item) => item.status?.startsWith('CLOSED')).map((item) => `${item.name}=${item.answer || item.status}`).join('；') || '无'],
      ['本轮已补信息', providedSlots.map((item) => `${item.name}（${percent(item.confidence)}）`).join('；') || '无'],
      ['未完成任务', unresolvedGoals.join('；') || '无'],
      ['后台保留旧任务', suspendedTasks.map((item) => `${item.scenario}/${item.intent}（${item.status}）`).join('；') || '无'],
      ['内部处理标记', taskState.internalHandling?.required ? `${taskState.internalHandling.scenario || '当前任务'} / ${taskState.internalHandling.status} / 客户不可见` : '无'],
    ]);
    listSection(lines, '请求—回答判断依据', taskEvidence);
  }

  heading(lines, '八、事件、状态和弱信号');
  renderRecognizedGroup(lines, '正式意图', recognizedItems.filter((item) => item.type === 'INTENT'));
  renderRecognizedGroup(lines, '当前事件', recognizedItems.filter((item) => item.type === 'EVENT'));
  renderRecognizedGroup(lines, '当前状态', recognizedItems.filter((item) => item.type === 'STATE'));
  renderRecognizedGroup(lines, '弱信号', recognizedItems.filter((item) => item.type === 'SIGNAL'));

  heading(lines, '九、正式意图匹配');
  const formalMatches = recognizedItems.filter((item) => item.type === 'INTENT');
  if (!formalMatches.length) lines.push('_没有识别出可关联的稳定正式意图。_', '');
  for (const item of formalMatches) {
    lines.push(`### ${item.name}`, '', `- 匹配状态：${item.matchStatus}`, `- 匹配分数：${item.matchScore}`, `- 正式意图：${item.matchedDefinition?.name || '未关联'}`, `- 匹配原因：${plain(item.matchReason)}`, `- 是否进入候选：${item.candidate ? `是（${item.candidate.status}）` : '否'}`, '');
  }

  heading(lines, '十、本轮最终聊天策略');
  table(lines, [
    ['策略模式', human.replyStrategy.mode],
    ['主导目标', dominantGoal ? `${dominantGoal.name}（${dominantGoal.key}）` : '未保存'],
    ['第一动作', human.interactionStrategy.firstMove],
    ['首要回复动作', human.replyStrategy.primaryMove],
    ['延续方式', human.replyStrategy.continuation],
    ['关系姿态', human.conversationStance || '历史记录未保存'],
    ['情绪姿态', human.emotionStrategy.posture],
    ['核心动作上限', String(orchestration?.semanticMoveBudget?.maxCoreMoves ?? human.semanticMoveBudget?.maxCoreMoves ?? '历史记录未保存')],
    ['问题预算', String(orchestration?.questionBudget ?? '历史记录未保存')],
    ['商品提及权限', human.commercialStrategy?.productMentionPolicy || orchestration?.businessOpportunity?.productMentionPolicy || '未保存'],
    ['经营目标', human.commercialStrategy?.objective || orchestration?.businessOpportunity?.reason || '历史记录未保存'],
  ]);
  listSection(lines, '必须体现', human.replyStrategy.mustInclude);
  listSection(lines, '必须避免', human.replyStrategy.avoid);
  listSection(lines, '允许核心动作', human.semanticMoveBudget?.allowedMoves || orchestration?.semanticMoveBudget?.allowedMoves || []);
  listSection(lines, '禁止动作组合', human.semanticMoveBudget?.forbiddenCombinations || orchestration?.semanticMoveBudget?.forbiddenCombinations || []);
  listSection(lines, '允许微动作', orchestration?.microActions || []);
  listSection(lines, '禁止微动作', orchestration?.prohibitedMicroActions || []);

  lines.push('### 本轮真实服务能力', '');
  const capabilities = orchestration?.serviceCapabilities;
  if (!capabilities) lines.push('- 历史记录未保存服务能力契约。', '');
  else table(lines, [
    ['权限配置状态', capabilities.configurationStatus || (capabilities.source === 'RUNTIME_CONFIG' ? 'CONFIGURED' : 'NOT_CONFIGURED')],
    ['执行校验模式', capabilities.enforcementMode || 'COMMUNICATION_ONLY'],
    ['可信动作凭证', String(capabilities.executionReceipts?.length || 0)],
    ['当前账号订单可见', capabilities.accountOrderVisibility],
    ['订单号查询', capabilities.orderLookupById],
    ['手机号查询', capabilities.orderLookupByPhone],
    ['运单号查询', capabilities.trackingLookup],
    ['提交催件', capabilities.logisticsUrge],
  ]);

  heading(lines, '十一、实际生效配置');
  lines.push('### 配置来源', '');
  if (!strategy.sources.length) lines.push('- 未命中已发布配置组，使用系统兼容策略。', '');
  for (const item of strategy.sources) lines.push(`- **${item.name}**（${item.sourceType} / 优先级 ${item.priority} / V${item.versionNo} / ${item.key}）`);
  lines.push('');
  jsonSection(lines, '最终合并配置', strategy.resolved);
  lines.push('### 配置覆盖与冲突', '');
  if (!strategy.conflicts.length) lines.push('- 无。', '');
  for (const item of strategy.conflicts) lines.push(`- **${item.kind}** · ${item.path || '未指定路径'} · ${plain(item.resolution || '')}`);
  lines.push('');

  heading(lines, '十二、回复生成全过程');
  if (!generation) {
    lines.push('_本条记录是“只分析”，没有执行回复生成。_', '');
  } else {
    table(lines, [
      ['最终状态', generation.status],
      ['最终来源', generation.finalReplySource || generation.source],
      ['绝对安全 / 候选质量', `${generation.candidateSafetyStatus || '历史记录未保存'} / ${generation.candidateQualityStatus || quality?.status || '历史记录未保存'}`],
      ['最终投递决定', generation.deliveryDecision || '历史记录未保存'],
      ['请求模型 / 实际模型', `${generation.requestedModel || '未记录'} / ${generation.actualModel || generation.model || '未使用'}`],
      ['思考模式 / finish reason', `${generation.thinkingMode || 'UNKNOWN'} / ${generation.finishReason || '未记录'}`],
      ['Token 上限（请求/生效）', `${generation.requestedMaxTokens ?? '未记录'} / ${generation.effectiveMaxTokens ?? '未记录'}`],
      ['调用超时', generation.timeoutMs != null ? `${generation.timeoutMs} ms` : '未记录'],
      ['可见字数 / reasoning 字数', `${generation.visibleContentLength ?? generation.draft?.trim().length ?? 0} / ${generation.reasoningContentLength ?? 0}`],
      ['首次生成状态', generation.initialGenerationStatus || '历史记录未保存'],
      ['紧凑重试', generation.compactRetryAttempted ? String(generation.compactRetryStatus || 'UNKNOWN') : 'NOT_ATTEMPTED'],
      ['质量重写', generation.rewriteAttempted ? String(generation.rewriteStatus || 'UNKNOWN') : 'NOT_ATTEMPTED'],
      ['语义安全兜底', generation.semanticFallbackUsed ? '已启用' : '未启用'],
      ['最终失败诊断', generation.finalFailureReason || generation.emptyContentReason || '无'],
      ['模型请求 ID', generation.requestId || '无'],
      ['端到端耗时', generation.pipelinePerformance ? `${generation.pipelinePerformance.totalElapsedMs} ms` : '历史记录未保存'],
      ['意图识别耗时 / 路径', generation.pipelinePerformance ? `${generation.pipelinePerformance.recognitionElapsedMs} ms / ${generation.pipelinePerformance.recognitionPath}` : '历史记录未保存'],
      ['首次生成耗时', `${generation.initialElapsedMs ?? generation.elapsedMs ?? 0} ms`],
      ['生成模型累计耗时', `${generation.totalModelElapsedMs ?? generation.elapsedMs ?? 0} ms`],
      ['本地处理耗时', generation.pipelinePerformance ? `${generation.pipelinePerformance.localProcessingElapsedMs} ms` : '历史记录未保存'],
      ['模型调用次数', String(generation.pipelinePerformance?.modelCallCount ?? generation.modelCallCount ?? '历史记录未保存')],
      ['重写尝试 / 成功', `${generation.rewriteAttemptCount ?? generation.rewriteCount ?? 0} / ${generation.rewriteCount || 0}`],
      ['安全兜底', generation.fallbackUsed ? `已启用：${generation.fallbackReason || ''}` : '未启用'],
      ['生成错误', generation.errorMessage || '无'],
    ]);
    textSection(lines, '首次候选回复', generation.originalDraft || (generation.rewriteCount ? null : generation.draft));
    if (generation.modelAttempts?.length) {
      lines.push('### 模型调用诊断', '');
      generation.modelAttempts.forEach((attempt) => renderModelAttempt(lines, attempt));
    }
    for (const attempt of generation.rewriteHistory || []) renderRewriteAttempt(lines, attempt);
    textSection(lines, '最终候选客户回复', generation.draft);
    lines.push('### 消息投递计划', '');
    if (!generation.deliveryPlan?.segments.length) lines.push('- 未生成投递计划；这是回复必达不变量失败，应按 T0 事故处理。', '');
    else {
      table(lines, [
        ['投递方式', generation.deliveryPlan.mode],
        ['消息段数', String(generation.deliveryPlan.segments.length)],
        ['客户插话取消后续段', generation.deliveryPlan.cancelRemainingOnCustomerMessage ? '是' : '否'],
        ['规划原因', generation.deliveryPlan.reason],
      ]);
      generation.deliveryPlan.segments.forEach((segment) => {
        lines.push(`#### 第 ${segment.index + 1} 段 · 前置等待 ${segment.delayBeforeMs} ms`, '', blockquote(segment.content), '');
      });
    }
  }

  heading(lines, '十三、完整质量门');
  if (!quality) lines.push('_本条记录未执行质量检查。_', '');
  else {
    table(lines, [
      ['最终状态', quality.status],
      ['检查规则', String(quality.checkedRuleCount)],
      ['阻断 / 错误 / 警告', `${quality.blockerCount} / ${quality.errorCount} / ${quality.warningCount}`],
      ['硬阻断 / 自动重写 / 仅评分', `${quality.blockingIssueCount ?? quality.blockerCount} / ${quality.rewriteIssueCount ?? quality.errorCount} / ${quality.scoreOnlyIssueCount ?? quality.warningCount}`],
      ['真人感质量分', quality.naturalnessScore == null ? '历史记录未提供' : String(quality.naturalnessScore)],
    ]);
    renderQualityIssues(lines, quality.issues);
  }

  heading(lines, '十四、数据一致性检查');
  for (const item of checks) lines.push(`- **${item.status} · ${item.name}**：${plain(item.detail)}`);
  lines.push('');

  heading(lines, '十五、运行警告');
  const warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
  if (!warnings.length) lines.push('- 无。', '');
  else warnings.forEach((item) => lines.push(`- ${plain(item)}`));
  lines.push('');

  heading(lines, '十六、原始分析 JSON');
  lines.push('```json', JSON.stringify({
    exportVersion: 'customer-service-analysis-md-v11',
    exportedAt: new Date().toISOString(),
    session: session ? {
      id: session.id,
      title: session.title,
      status: session.status,
      merchantRoleId: session.merchantRoleId,
      industryNodeId: session.industryNodeId,
      messageCount: session.messageCount,
      analysisCount: session.analysisCount,
    } : null,
    analysis,
  }, null, 2), '```', '');

  return lines.join('\n');
}

export function buildCustomerServiceAnalysisFilename(session: CustomerServiceTuningSessionDetails | null, analysis: CustomerServiceTuningAnalysis) {
  const title = sanitizeFilename(session?.title || '回复调优');
  const type = analysis.runType === 'EXECUTE' ? '生成与质检' : '只分析';
  const timestamp = new Date(analysis.createdAt).toISOString().replace(/[:.]/g, '-');
  return `${title}_第${analysis.sequenceNo}轮_${type}_${timestamp}.md`;
}

function buildConversationSnapshot(analysis: CustomerServiceTuningAnalysis) {
  const history = analysis.runtimeContract.generationContext?.conversationHistory || [];
  const items = history.map((item) => ({ role: item.role, content: item.content, current: false }));
  const latest = analysis.latestMessage || analysis.runtimeContract.groundedContext.latestCustomerMessage;
  if (latest) items.push({ role: 'CUSTOMER' as const, content: latest, current: true });
  return items;
}

function buildConsistencyChecks(analysis: CustomerServiceTuningAnalysis): ConsistencyCheck[] {
  const contract = analysis.runtimeContract;
  const human = analysis.understanding.humanContext;
  const dominant = human.dominantTurnGoal || contract.orchestrationPlan?.dominantTurnGoal;
  const budget = human.semanticMoveBudget || contract.orchestrationPlan?.semanticMoveBudget || { reason: '历史记录未保存语义动作预算', allowedMoves: [], forbiddenCombinations: [], maxCoreMoves: 1 };
  const business = human.commercialStrategy || contract.orchestrationPlan?.businessOpportunity || { stage: '历史记录未保存', productMentionPolicy: undefined };
  const result: ConsistencyCheck[] = [];

  const expectedMove: Partial<Record<string, string[]>> = {
    INVITE_POSITIVE_SHARING: ['ACKNOWLEDGE_AND_INVITE_SHARING', 'INVITE_SHARING'],
    INVITE_EMOTIONAL_SHARING: ['ACKNOWLEDGE_AND_INVITE_SHARING', 'INVITE_SHARING'],
    PROVIDE_EMOTIONAL_COMFORT: ['RESPOND_TO_SHARED_CONTEXT'],
    LISTEN_TO_VENTING: ['RESPOND_TO_SHARED_CONTEXT'],
    PROVIDE_REQUESTED_ADVICE: ['RESPOND_TO_SHARED_CONTEXT'],
    RESPECT_EMOTIONAL_SPACE: ['RESPOND_TO_SHARED_CONTEXT'],
    RESPOND_TO_SHARED_CONTEXT: ['RESPOND_TO_SHARED_CONTEXT'],
    PROCESS_PROVIDED_INFORMATION: ['PROCESS_PROVIDED_INFORMATION'],
    HANDLE_INFORMATION_BARRIER: ['HANDLE_INFORMATION_BARRIER'],
    RESOLVE_CURRENT_PROBLEM: ['SOLVE_CURRENT_ISSUE'],
    REPAIR_TRUST: ['REPAIR_RELATIONSHIP'],
    SUPPORT_PURCHASE_DECISION: ['SUPPORT_DECISION'],
  };
  const allowedMoves = dominant ? expectedMove[dominant.key] : null;
  result.push({
    status: allowedMoves && !allowedMoves.includes(human.interactionStrategy.firstMove) ? 'WARNING' : 'PASS',
    name: '主导目标与第一动作',
    detail: dominant ? `${dominant.key} → ${human.interactionStrategy.firstMove}` : '历史记录未保存主导目标。',
  });

  const task = human.conversationTaskState;
  const providedSlots = asArray(task?.providedSlots);
  const repeatSlotRisk = Boolean(providedSlots.length) && /(?:提供|发|给|告诉|确认).{0,8}(?:订单号|订单编号|物流单号|快递单号|运单号|手机号|联系电话|地址|型号|规格|图片|截图)/i.test(analysis.generation?.draft || '');
  result.push({
    status: repeatSlotRisk ? 'WARNING' : 'PASS',
    name: '待补信息与回复推进',
    detail: task ? `${task.currentTurnRelation || '未记录'} / ${task.status || '未记录'} / ${task.requestResponseType || '未记录'}；已补：${providedSlots.map((item) => item.name).join('、') || '无'}；${repeatSlotRisk ? '最终回复疑似再次索取已提供字段' : '未发现重复索取已提供字段'}` : '历史记录未保存多轮任务状态。',
  });

  const sharingGoal = dominant && ['INVITE_POSITIVE_SHARING', 'INVITE_EMOTIONAL_SHARING', 'PROVIDE_EMOTIONAL_COMFORT', 'LISTEN_TO_VENTING', 'PROVIDE_REQUESTED_ADVICE', 'RESPECT_EMOTIONAL_SPACE'].includes(dominant.key);
  const budgetText = [budget.reason, ...(budget.allowedMoves || [])].join(' ');
  result.push({
    status: sharingGoal && /(近期安排|生活场景问题|预算|购买)/.test(budgetText) ? 'WARNING' : 'PASS',
    name: '主导目标与语义动作预算',
    detail: sharingGoal ? budgetText : '当前不是分享邀请目标。',
  });

  const productPolicy = 'productMentionPolicy' in business ? business.productMentionPolicy : undefined;
  const earlyStage = 'stage' in business && ['NO_COMMERCIAL_MOVE', 'RELATIONSHIP_BUILDING', 'CONTEXT_DISCOVERY', 'NEED_EXPLORATION'].includes(String(business.stage));
  result.push({
    status: earlyStage && productPolicy !== 'PROHIBITED' ? 'WARNING' : 'PASS',
    name: '经营阶段与商品权限',
    detail: `${'stage' in business ? business.stage : '未保存'} / ${productPolicy || '未保存'}`,
  });

  const pipeline = analysis.generation?.pipelinePerformance;
  const pipelineModelMs = pipeline ? pipeline.recognitionElapsedMs + pipeline.generationModelElapsedMs : null;
  result.push({
    status: pipelineModelMs != null && pipelineModelMs > 14000 ? 'WARNING' : 'PASS',
    name: 'T0 模型调用与耗时预算',
    detail: pipeline ? `${pipeline.recognitionPath} / 模型调用 ${pipeline.modelCallCount} 次 / 模型累计 ${pipelineModelMs} ms` : '历史记录未保存完整性能数据。',
  });

  result.push({
    status: analysis.generation?.source === 'FAILURE_NOTICE'
      ? 'WARNING'
      : analysis.quality?.status === 'FAIL' && analysis.generation?.draft
        ? 'WARNING'
        : 'PASS',
    name: '质量门与最终候选',
    detail: `${analysis.quality?.status || 'NOT_RUN'} / ${analysis.generation?.source || 'NONE'}${analysis.generation?.source === 'FAILURE_NOTICE' ? '（中性生成失败提示，不是业务回复）' : ''}`,
  });

  result.push({
    status: 'INFO',
    name: '模拟环境发送状态',
    detail: `customerVisibleSend=${contract.responseControl?.customerVisibleSend ?? '历史记录未保存'} 表示不会向真实客户发送；调优对话是否写入由历史消息记录决定。`,
  });
  return result;
}

function renderIntent(lines: string[], item: CustomerServiceIntentHypothesis, index: number) {
  lines.push(`### ${index}. ${item.name}`, '', `- 角色：${item.role}`, `- 范围 / 延续：${item.scope} / ${item.continuity}`, `- 场景 / 意图：${item.scenario} / ${item.intent}`, `- 置信度 / 优先级：${percent(item.confidence)} / ${item.priority}`, `- 当前可执行：${item.actionable ? '是' : '否'}`, `- 排序原因：${plain(item.reason)}`, `- 证据：${item.evidence.map(plain).join('；') || '无'}`, '');
}

function renderGoal(lines: string[], item: CustomerServiceTurnGoal, index: number) {
  lines.push(`### ${index}. ${item.name}（${item.key}）`, '', `- 状态：${item.deferred ? '延后' : '当前'}`, `- 来源：${item.source}`, `- 置信度 / 优先级：${percent(item.confidence)} / ${item.priority}`, `- 原因：${plain(item.reason)}`, `- 回复要求：${plain(item.responseRequirement)}`, `- 证据：${item.evidence.map(plain).join('；') || '无'}`, '');
}

function renderRecognizedGroup(lines: string[], title: string, items: CustomerServiceRecognizedItem[]) {
  lines.push(`### ${title}`, '');
  if (!items.length) lines.push('- 无。', '');
  else {
    for (const item of items) lines.push(`- **${item.name}**（${percent(item.confidence)} / ${item.scope} / ${item.continuity}）— ${plain(item.description)}`);
    lines.push('');
  }
}

function renderRewriteAttempt(lines: string[], item: CustomerServiceRewriteAttempt) {
  const label = item.mode === 'COMPACT_MODEL_RETRY' ? '紧凑模型重试' : item.mode === 'SEMANTIC_SAFE_FALLBACK' ? '语义安全兜底' : item.mode === 'SAFE_FALLBACK' ? '升级前安全兜底' : item.mode === 'FAILURE_NOTICE' ? '升级前失败提示' : '定向重写';
  lines.push(`### 第 ${item.attempt} 次${label}`, '');
  table(lines, [
    ['状态', item.status],
    ['模型', item.model || '未使用'],
    ['耗时', `${item.elapsedMs || 0} ms`],
    ['请求 ID', item.requestId || '无'],
    ['复检状态', item.qualityStatus || 'NOT_RUN'],
    ['错误', item.errorMessage || '无'],
  ]);
  textSection(lines, '本次候选', item.draft);
  if (item.failedIssues?.length) {
    lines.push('#### 本次仍未通过的问题', '');
    item.failedIssues.forEach((issue) => lines.push(`- **${issue.severity} · ${issue.name}**：${plain(issue.message)}${issue.evidence?.length ? `；证据：${issue.evidence.map(plain).join('、')}` : ''}`));
    lines.push('');
  }
}

function renderModelAttempt(lines: string[], item: CustomerServiceModelAttempt) {
  table(lines, [
    ['阶段 / 次数', `${item.mode} / ${item.attempt}`],
    ['状态', item.status],
    ['请求模型 / 实际模型', `${item.requestedModel} / ${item.actualModel || '无'}`],
    ['思考模式', item.thinkingMode],
    ['Token 上限（请求/生效）', `${item.requestedMaxTokens} / ${item.effectiveMaxTokens}`],
    ['超时 / 耗时', `${item.timeoutMs} / ${item.elapsedMs} ms`],
    ['finish reason', item.finishReason || '无'],
    ['prompt / completion / reasoning tokens', `${item.promptTokens} / ${item.completionTokens} / ${item.reasoningTokens}`],
    ['可见字数 / reasoning 字数', `${item.visibleContentLength} / ${item.reasoningContentLength}`],
    ['空内容原因', item.emptyContentReason || '无'],
    ['错误', item.errorMessage || '无'],
  ]);
}

function renderQualityIssues(lines: string[], issues: CustomerServiceQualityIssue[]) {
  if (!issues.length) { lines.push('- 没有质量规则明细。', ''); return; }
  for (const item of issues) {
    lines.push(`- **${item.passed ? '通过' : '失败'} · ${item.severity} · ${item.disposition || '历史规则'} · ${item.name}**：${plain(item.message)}${item.evidence?.length ? `；证据：${item.evidence.map(plain).join('、')}` : ''}`);
  }
  lines.push('');
}

function heading(lines: string[], title: string) { lines.push(`## ${title}`, ''); }
function textSection(lines: string[], title: string, value: string | null | undefined) { lines.push(`### ${title}`, '', value ? blockquote(value) : '_无。_', ''); }
function jsonSection(lines: string[], title: string, value: unknown) { lines.push(`### ${title}`, '', '```json', typeof value === 'string' ? value : JSON.stringify(value, null, 2), '```', ''); }
function listSection(lines: string[], title: string, values: string[]) { lines.push(`### ${title}`, ''); if (!values?.length) lines.push('- 无。'); else values.forEach((item) => lines.push(`- ${plain(item)}`)); lines.push(''); }
function table(lines: string[], rows: Array<[string, string]>) { lines.push('| 字段 | 内容 |', '|---|---|'); rows.forEach(([key, value]) => lines.push(`| ${escapeCell(key)} | ${escapeCell(value)} |`)); lines.push(''); }
function blockquote(value: string) { return String(value || '').split('\n').map((line) => `> ${line}`).join('\n'); }
function percent(value: number) { return `${Math.round((Number(value) || 0) * 100)}%`; }
function plain(value: unknown) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function escapeCell(value: unknown) { return plain(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>'); }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }); }
function sanitizeFilename(value: string) { return String(value || '回复调优').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 60); }
