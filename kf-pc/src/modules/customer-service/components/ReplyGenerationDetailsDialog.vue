<template>
  <el-dialog
    :model-value="modelValue"
    title="回复生成详情"
    width="960px"
    :fullscreen="mobile"
    destroy-on-close
    @close="$emit('update:modelValue', false)"
  >
    <div v-loading="loading" class="min-h-40 space-y-4">
      <el-alert
        title="这里只展示脱敏后的生成证据，不展示完整系统提示词、密钥或敏感内部快照。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-empty v-if="!loading && !trace" description="暂无可查看的生成详情" />

      <template v-else-if="trace">
        <el-descriptions :column="mobile ? 1 : 2" border>
          <el-descriptions-item label="来源">{{ sourceLabel(trace.sourceType) }}</el-descriptions-item>
          <el-descriptions-item label="生成方式">{{ trace.generationSource || '—' }}</el-descriptions-item>
          <el-descriptions-item label="Provider">{{ trace.provider || '—' }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{ trace.model || '—' }}</el-descriptions-item>
          <el-descriptions-item label="账号资料">{{ trace.accountProfileId || '未绑定' }}</el-descriptions-item>
          <el-descriptions-item label="客服角色">{{ trace.merchantRoleId || '未绑定' }}</el-descriptions-item>
          <el-descriptions-item label="渠道 / 平台">{{ [trace.channel, trace.platform].filter(Boolean).join(' / ') || '—' }}</el-descriptions-item>
          <el-descriptions-item label="是否回退">{{ trace.fallbackUsed ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="质量结果">{{ trace.qualityStatus || '—' }}</el-descriptions-item>
          <el-descriptions-item label="安全结果">{{ trace.safetyStatus || '—' }}</el-descriptions-item>
          <el-descriptions-item label="策略版本" :span="mobile ? 1 : 2">{{ trace.strategyVersionIds?.join('、') || '未命中正式策略版本' }}</el-descriptions-item>
          <el-descriptions-item label="表达规则" :span="mobile ? 1 : 2">{{ trace.languagePolicyIds?.join('、') || '未记录' }}</el-descriptions-item>
          <el-descriptions-item label="命中业务知识" :span="mobile ? 1 : 2">{{ trace.knowledgeEntryIds?.join('、') || '未命中' }}</el-descriptions-item>
          <el-descriptions-item label="命中意图 / 流程" :span="mobile ? 1 : 2">{{ intentLabel(trace.runtimeExplainability) }}</el-descriptions-item>
          <el-descriptions-item label="意图范围来源">{{ scopeSourceLabel(trace.runtimeExplainability?.intent?.scopeSource) }}</el-descriptions-item>
          <el-descriptions-item label="意图应用方式">{{ scopeModeLabel(trace.runtimeExplainability?.intent?.scopeMode) }}</el-descriptions-item>
          <el-descriptions-item label="回复长度来源">{{ scopeSourceLabel(trace.runtimeExplainability?.replyExperience?.source) }}</el-descriptions-item>
          <el-descriptions-item label="回复长度">{{ lengthPresetLabel(trace.runtimeExplainability?.replyExperience?.preset) }}，最多 {{ trace.runtimeExplainability?.replyExperience?.maxSentences || '—' }} 句</el-descriptions-item>
          <el-descriptions-item label="发送方式" :span="mobile ? 1 : 2">{{ deliveryLabel(trace.runtimeExplainability) }}</el-descriptions-item>
          <el-descriptions-item label="旧扣子提示词" :span="mobile ? 1 : 2">{{ legacyPromptLabel(trace.runtimeExplainability) }}</el-descriptions-item>
          <el-descriptions-item label="配置哈希" :span="mobile ? 1 : 2"><span class="break-all">{{ trace.configurationHash || '—' }}</span></el-descriptions-item>
          <el-descriptions-item label="生成时间" :span="mobile ? 1 : 2">{{ formatDate(trace.createdAt) }}</el-descriptions-item>
        </el-descriptions>

        <el-card v-if="conversationStrategy" shadow="never">
          <template #header><strong>多轮上下文策略</strong></template>
          <el-descriptions :column="mobile ? 1 : 3" border>
            <el-descriptions-item label="策略来源">{{ scopeSourceLabel(conversationStrategy.source) }}</el-descriptions-item>
            <el-descriptions-item label="上下文承接">{{ carryoverLabel(conversationStrategy.policy.contextCarryoverMode) }}</el-descriptions-item>
            <el-descriptions-item label="老客户开场">{{ returningGreetingLabel(conversationStrategy.policy.returningGreetingMode) }}</el-descriptions-item>
            <el-descriptions-item label="业务身份">{{ identityStrengthLabel(conversationStrategy.policy.businessIdentityStrength) }}</el-descriptions-item>
            <el-descriptions-item label="闲聊边界">{{ casualBoundaryLabel(conversationStrategy.policy.casualChatBoundary) }}</el-descriptions-item>
            <el-descriptions-item label="State 推断">{{ inferenceLabel(conversationStrategy.policy.stateInferenceMode) }}</el-descriptions-item>
            <el-descriptions-item label="复用已确认偏好">{{ conversationStrategy.policy.reuseConfirmedPreferences ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="承接普通 pending">{{ conversationStrategy.policy.continueUnfinishedItems ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="Context Budget">{{ conversationStrategy.policy.contextBudget.mode === 'CUSTOM' ? '高级自定义' : '系统自动' }}</el-descriptions-item>
          </el-descriptions>
          <el-alert class="mt-3" type="info" :closable="false" show-icon title="运营策略不能关闭 canonical 幂等、身份安全、售后/投诉/安全连续性和质量门。" />
        </el-card>


        <el-card v-if="interactionPlanV2" shadow="never">
          <template #header><strong>HVE InteractionPlan v2</strong></template>
          <el-alert
            class="mb-3"
            type="info"
            :closable="false"
            show-icon
            :title="hvePlanStatusTitle()"
          />
          <el-descriptions :column="mobile ? 1 : 3" border>
            <el-descriptions-item label="互动类型">{{ interactionPlanV2.interactionType || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Policy 来源">{{ interactionPlanV2.policyMode === 'GUIDELINE_SHADOW' ? 'HVE-2 Guideline Shadow' : 'HVE-1 Legacy Shadow' }}</el-descriptions-item>
            <el-descriptions-item label="本轮主目标" :span="mobile ? 1 : 2">{{ interactionPlanV2.goal?.primary || '—' }}</el-descriptions-item>
            <el-descriptions-item label="结束方式">{{ interactionPlanV2.completion?.mode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="允许可选延续">{{ interactionPlanV2.completion?.allowOptionalContinuation ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="关系阶段">{{ interactionPlanV2.behaviorContext?.relationshipStage || '—' }}</el-descriptions-item>
          </el-descriptions>
          <div class="detail-line"><span>必须动作：</span>{{ interactionActsByNecessity('REQUIRED') }}</div>
          <div class="detail-line"><span>建议动作：</span>{{ interactionActsByNecessity('PREFERRED') }}</div>
          <div class="detail-line"><span>可选动作：</span>{{ interactionActsByNecessity('OPTIONAL') }}</div>
          <div class="detail-line"><span>硬性禁止：</span>{{ interactionSuppressions('HARD') }}</div>
          <div class="detail-line"><span>柔性抑制：</span>{{ interactionSuppressions('SOFT') }}</div>
          <div class="detail-line"><span>Grounding：</span>{{ interactionGroundingSummary() }}</div>
          <div v-if="interactionPlanV2.completion?.conditions?.length" class="detail-line"><span>停止 / 等待条件：</span>{{ interactionCompletionSummary() }}</div>
          <template v-if="guidelinePolicy?.resolutionSet">
            <div class="detail-line"><span>Guideline Resolution：</span>{{ guidelineResolutionSummary() }}</div>
            <div class="detail-line"><span>Legacy → Guideline Shadow：</span>{{ guidelineComparisonSummary() }}</div>
            <el-alert
              v-if="guidelinePolicy.resolutionSet.hasUnresolvedHardConflict"
              class="mt-2" type="error" :closable="false" show-icon
              title="检测到未解决的 Hard Guideline 冲突；HVE-2 当前只记录 Shadow，不会影响客户可见回复。"
            />
          </template>
          <el-collapse v-if="interactionPlanV2.acts?.length || interactionPlanV2.diagnostics?.unmappedLegacyActs?.length || guidelinePolicy?.resolutionSet?.traces?.length" class="mt-3">
            <el-collapse-item title="查看 Plan 来源与迁移诊断" name="hve-v2-diagnostics">
              <div v-for="act in interactionPlanV2.acts || []" :key="act.id" class="evidence-row mb-2">
                <div class="text-xs text-slate-500">{{ act.id }} · {{ act.necessity }} · priority {{ act.priority }}</div>
                <div class="mt-1 text-sm">{{ act.type }} · {{ act.reasonCode || '—' }}</div>
                <div v-if="act.trackingKey" class="mt-1 text-xs text-slate-500">tracking: {{ act.trackingKey }}</div>
                <div v-if="act.parameters" class="mt-1 text-xs text-slate-500">参数：{{ hveActParametersLabel(act.parameters) }}</div>
              </div>
              <div v-if="interactionPlanV2.diagnostics?.unmappedLegacyActs?.length" class="detail-line">
                <span>暂未映射旧动作：</span>{{ interactionPlanV2.diagnostics.unmappedLegacyActs.join('、') }}
              </div>
            </el-collapse-item>
            <el-collapse-item v-if="guidelinePolicy?.resolutionSet?.traces?.length" title="查看 Guideline 命中 / 跳过 / 冲突" name="hve-v2-guidelines">
              <div v-for="(item, index) in guidelinePolicy.resolutionSet.traces || []" :key="`${item.guidelineId || item.code}-${index}`" class="evidence-row mb-2">
                <div class="text-xs text-slate-500">{{ item.code || item.guidelineId || 'UNKNOWN' }} · v{{ item.versionNo || '—' }} · {{ item.criticality || '—' }}</div>
                <div class="mt-1 text-sm">{{ item.status || '—' }} · {{ item.reasonCode || '—' }}</div>
              </div>
              <div v-for="(conflict, index) in guidelinePolicy.resolutionSet.conflicts || []" :key="`conflict-${index}`" class="detail-line">
                <span>冲突：</span>{{ [conflict.kind, conflict.act, conflict.reasonCode].filter(Boolean).join(' / ') }}
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>

        <el-card v-if="hve3Execution" shadow="never">
          <template #header><strong>HVE-3 Natural NLG / Plan Compliance</strong></template>
          <el-alert
            class="mb-3"
            :type="hve3Execution.envelope?.customerVisible ? 'success' : 'info'"
            :closable="false"
            show-icon
            :title="hve3Execution.envelope?.customerVisible ? '本轮使用 HVE-3 Candidate 执行链；仅调优/Robot Test 验收可见，生产仍未晋级。' : '本轮未使用客户可见 HVE-3 Candidate 执行链。'"
          />
          <el-alert
            v-if="hve3Execution.diagnostics?.controlledDegradation?.applied"
            class="mb-3"
            type="warning"
            :closable="false"
            show-icon
            title="本轮没有 Hard/Plan-qualified 候选，已走受控可用性降级；这是可诊断的引擎结果，不是服务器 500。"
          />
          <el-descriptions :column="mobile ? 1 : 3" border>
            <el-descriptions-item label="Execution Lane">{{ hve3Execution.envelope?.lane || hve3Execution.diagnostics?.executionLane || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Prompt Kernel">{{ hveKernelLabel() }}</el-descriptions-item>
            <el-descriptions-item label="最终文本冻结">{{ hveFreezeLabel() }}</el-descriptions-item>
            <el-descriptions-item label="Plan Compliance">{{ hve3Execution.diagnostics?.planCompliance?.status || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Hard Gate">{{ hve3Execution.diagnostics?.hardCompliance?.status || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Soft Humanity">{{ hveHumanityLabel() }}</el-descriptions-item>
            <el-descriptions-item label="Role Evidence">{{ hveRoleEvidenceLabel() }}</el-descriptions-item>
            <el-descriptions-item label="Semantic Value">{{ hveSemanticValueLabel() }}</el-descriptions-item>
            <el-descriptions-item label="Knowledge 利用">{{ hveKnowledgeUtilizationLabel() }}</el-descriptions-item>
            <el-descriptions-item label="Voice Posture">{{ hveVoiceProjectionLabel() }}</el-descriptions-item>
            <el-descriptions-item label="候选选择" :span="mobile ? 1 : 3">{{ hveSelectionLabel() }}</el-descriptions-item>
          </el-descriptions>
          <div class="detail-line"><span>Expected Information Gain：</span>{{ hveExpectedInformationGainLabel() }}</div>
          <div class="detail-line"><span>Semantic Economy：</span>{{ hveSemanticEconomyLabel() }}</div>
          <div class="detail-line"><span>Decision Contribution：</span>{{ hveDecisionContributionLabel() }}</div>
          <div class="detail-line"><span>Public Identity Projection：</span>{{ hvePublicIdentityProjectionLabel() }}</div>
          <div class="detail-line"><span>Resolved Role Contract：</span>{{ hveResolvedRoleLabel() }}</div>
          <div class="detail-line"><span>Role Behavior：</span>{{ hveRoleBehaviorLabel() }}</div>
          <div class="detail-line"><span>Semantic Delta / Turn Composition：</span>{{ hveTurnCompositionLabel() }}</div>
          <div class="detail-line"><span>Semantic Fulfillment：</span>{{ hveSemanticFulfillmentLabel() }}</div>
          <div class="detail-line"><span>实际观察动作：</span>{{ hveObservedActsLabel() }}</div>
          <div class="detail-line"><span>计划外高影响动作：</span>{{ hveUnexpectedActsLabel() }}</div>
          <div class="detail-line"><span>关键身份声明：</span>{{ hveCriticalClaimsLabel() }}</div>
          <div class="detail-line"><span>人感高风险特征：</span>{{ hveHumanityRiskLabel() }}</div>
          <div class="detail-line"><span>NLG 最小权限上下文：</span>{{ hveNlgProjectionLabel() }}</div>
          <div class="detail-line"><span>Hard 问题：</span>{{ hveHardIssuesLabel() }}</div>
          <div class="detail-line"><span>Plan 警告：</span>{{ hvePlanWarningsLabel() }}</div>
          <el-collapse v-if="hve3Execution.diagnostics?.candidates?.length" class="mt-3">
            <el-collapse-item title="查看候选与选择依据" name="hve3-candidates">
              <div v-for="item in hve3Execution.diagnostics?.candidates || []" :key="`hve3-candidate-${item.index}`" class="evidence-row mb-2">
                <div class="flex items-center gap-2 text-xs text-slate-500">
                  <span>候选 #{{ Number(item.index || 0) + 1 }} · {{ item.source || '—' }}</span>
                  <el-tag v-if="item.selected" type="success" size="small">最终选择</el-tag>
                </div>
                <div class="mt-1 text-sm">基础门禁 {{ (item.baseQualified ?? item.qualified) ? '通过' : '未通过' }} · Hold Value {{ item.holdValueReady ? 'READY' : 'NOT READY' }} · 最终可选 {{ item.selectionEligible ? 'YES' : 'NO' }} · Hard {{ item.hardStatus || '—' }} · Plan {{ item.planStatus || '—' }} · Humanity {{ item.naturalnessScore ?? '—' }} · {{ hveCandidatePersonaLabel(item) }} · Role Evidence {{ item.roleEvidenceStatus || '—' }}({{ item.roleEvidenceScore ?? '—' }}) · Behavior {{ item.roleBehaviorAlignmentScore ?? '—' }} · Utility {{ item.pairwiseUtilityScore ?? '—' }}</div>
                <div v-if="item.selectionIneligibilityReasons?.length" class="mt-1 text-xs text-amber-600">不可选原因：{{ item.selectionIneligibilityReasons.join('、') }}</div>
                <div class="mt-1 text-xs text-slate-500">Semantic Fulfillment {{ item.semanticFulfillmentStatus || '—' }} {{ item.semanticFulfillmentScore ?? '—' }} · Target Coverage {{ item.targetCoverageStatus || '—' }} {{ item.targetCoverageScore ?? '—' }} · Human Realization {{ item.humanRealizationFloorStatus || '—' }} {{ item.humanRealizationFloorScore ?? '—' }} · Claim Authority {{ item.claimAuthorityStatus || '—' }}</div>
                <div v-if="item.semanticFulfillmentIssueKeys?.length || item.targetCoverageIssueKeys?.length || item.humanRealizationFloorIssueKeys?.length || item.claimAuthorityIssueKeys?.length" class="mt-1 text-xs text-amber-600">语义/事实/人感问题：{{ [...(item.semanticFulfillmentIssueKeys || []), ...(item.targetCoverageIssueKeys || []), ...(item.humanRealizationFloorIssueKeys || []), ...(item.claimAuthorityIssueKeys || [])].join('、') }}</div>
                <div v-if="item.candidateIdentity?.lexicalSha256" class="mt-1 text-xs text-slate-500">Final Candidate Hash：{{ item.candidateIdentity.lexicalSha256 }}</div>
                <div v-if="item.structuredSegments?.length" class="mt-1 text-xs text-slate-500">结构化消息：{{ hveStructuredSegmentsLabel(item.structuredSegments) }}</div>
                <div class="mt-1 text-xs text-slate-500">Information Gain {{ item.informationGainScore ?? '—' }} · Cross-turn Delta {{ item.crossTurnInformationGainScore ?? '—' }} · Current Value {{ item.currentTurnValueScore ?? '—' }} · Contribution {{ hveDecisionContributionKindLabel(item.decisionContributionKind) }} {{ item.decisionContributionScore ?? '—' }} · Preference {{ item.preferenceUsageScore ?? '—' }} · Service Entry {{ item.serviceEntryValueScore ?? '—' }} · Identity Surface {{ item.identitySurfaceQualityScore ?? '—' }} · Knowledge {{ hveKnowledgeStatusLabel(item.knowledgeUtilizationStatus) }}</div>
                <div v-if="item.positiveRoleEvidence?.length || item.missingRoleEvidence?.length" class="mt-1 text-xs text-slate-500">角色证据：{{ hveCandidateRoleEvidenceLabel(item) }}</div>
                <div v-if="item.humanityHighRiskKeys?.length" class="mt-1 text-xs text-amber-600">Humanity 高风险：{{ item.humanityHighRiskKeys.join('、') }}</div>
                <div v-if="item.criticalClaimStatus?.length" class="mt-1 text-xs text-slate-500">关键声明：{{ hveCandidateClaimsLabel(item) }}</div>
                <div v-if="item.hardIssueKeys?.length" class="mt-1 text-xs text-red-500">Hard：{{ item.hardIssueKeys.join('、') }}</div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>

        <el-card v-if="runtimeAudit" shadow="never">
          <template #header><strong>Runtime Audit Diagnostic V1</strong></template>
          <el-alert
            class="mb-3"
            type="info"
            :closable="false"
            show-icon
            title="该区块仅展示服务器保存的只读诊断事实，不参与候选资格、事实权限、完成度或发送判定。"
          />
          <el-descriptions :column="mobile ? 1 : 3" border>
            <el-descriptions-item label="Contract">{{ runtimeAudit.contract || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Authority">{{ runtimeAudit.authority || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Target Resolution">{{ runtimeAuditTargetStatus }}</el-descriptions-item>
            <el-descriptions-item label="Selected / Membership Rejected">{{ runtimeAuditRetrievalCounts }}</el-descriptions-item>
            <el-descriptions-item label="Fact Firewall">{{ runtimeAuditFactFirewallStatus }}</el-descriptions-item>
            <el-descriptions-item label="Delivery Effect">{{ runtimeAuditDeliveryEffect }}</el-descriptions-item>
          </el-descriptions>
          <el-collapse class="mt-3">
            <el-collapse-item title="查看 bounded Runtime Audit JSON" name="runtime-audit-json">
              <pre class="runtime-audit-json">{{ runtimeAuditJson }}</pre>
            </el-collapse-item>
          </el-collapse>
        </el-card>

        <el-card v-if="humanBehavior" shadow="never">
          <template #header><strong>Human Behavior / ExpressionPlan</strong></template>
          <el-descriptions :column="mobile ? 1 : 3" border>
            <el-descriptions-item label="偏好来源">{{ scopeSourceLabel(behaviorExplainability?.preferenceSource || conversationStrategy?.source) }}</el-descriptions-item>
            <el-descriptions-item label="互动模式">{{ humanBehavior.interactionMode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="回复密度">{{ humanBehavior.responseDensity || '—' }}</el-descriptions-item>
            <el-descriptions-item label="口语化">{{ humanBehavior.colloquiality || '—' }}</el-descriptions-item>
            <el-descriptions-item label="提问策略">{{ humanBehavior.questionPolicy || '—' }}</el-descriptions-item>
            <el-descriptions-item label="业务推进">{{ humanBehavior.businessAdvance || '—' }}</el-descriptions-item>
            <el-descriptions-item label="首次 / 身份显现">{{ [humanBehavior.openingStyle, humanBehavior.identityResponse].filter(Boolean).join(' / ') || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Emoji">{{ humanBehavior.emojiPolicy || '—' }}</el-descriptions-item>
            <el-descriptions-item label="气泡目标">{{ segmentTargetLabel() }}</el-descriptions-item>
            <el-descriptions-item label="结束方式">{{ humanBehavior.completionStyle || '—' }}</el-descriptions-item>
            <el-descriptions-item label="允许历史承接">{{ humanBehavior.historyReference || '—' }}</el-descriptions-item>
            <el-descriptions-item label="避免结构">{{ humanBehavior.avoidStructureKeys?.join('、') || '无' }}</el-descriptions-item>
          </el-descriptions>
          <div class="detail-line"><span>运营人感偏好：</span>{{ behaviorPreferenceSummary() }}</div>
          <div v-if="humanBehavior.questionPolicy === 'NONE'" class="detail-line"><span>为什么这一轮没继续问：</span>{{ behaviorReason('QUESTION') }}</div>
          <div v-if="humanBehavior.businessAdvance === 'NONE' || humanBehavior.forbiddenActs?.includes('SALES_CTA')" class="detail-line"><span>为什么这一轮没 CTA：</span>{{ behaviorReason('CTA') }}</div>
          <div v-if="humanBehavior.avoidStructureKeys?.length" class="detail-line"><span>为什么换结构：</span>{{ behaviorReason('STRUCTURE') }}</div>
          <div v-if="behaviorExplainability?.matchedBehaviorRules?.length" class="detail-line">
            <span>命中 Behavior Rules：</span>{{ behaviorExplainability.matchedBehaviorRules.join('、') }}
          </div>
          <div v-if="behaviorExplainability?.suppressedBehaviorRules?.length" class="detail-line">
            <span>被更高优先级覆盖：</span>{{ behaviorExplainability.suppressedBehaviorRules.join('、') }}
          </div>
          <el-collapse v-if="behaviorDecisionReasons.length" class="mt-3">
            <el-collapse-item title="查看本轮 Behavior 决策原因" name="behavior-reasons">
              <div v-for="(item, index) in behaviorDecisionReasons" :key="`${item.ruleId || 'rule'}-${index}`" class="evidence-row mb-2">
                <div class="text-xs text-slate-500">{{ item.ruleId || 'UNKNOWN_RULE' }} · priority {{ item.priority || 0 }}</div>
                <div class="mt-1 text-sm">{{ item.reason || '—' }}</div>
              </div>
            </el-collapse-item>
          </el-collapse>
          <el-alert class="mt-3" type="info" :closable="false" show-icon title="这里展示的是结构化行为决策与安全摘要，不包含完整系统提示词或模型内部推理。" />
        </el-card>

        <el-card v-if="hasPlannerOrBudget" shadow="never">
          <template #header><strong>Planner / Active Context / Input Budget</strong></template>
          <el-descriptions :column="mobile ? 1 : 3" border>
            <el-descriptions-item label="Planner Route">{{ planner?.route || '—' }}</el-descriptions-item>
            <el-descriptions-item label="销售可见度">{{ planner?.salesVisibility || '—' }}</el-descriptions-item>
            <el-descriptions-item label="历史承接">{{ plannerStateGuidance('shouldReferenceHistory') || '—' }}</el-descriptions-item>
            <el-descriptions-item label="提问预算">{{ numberOrDash(planner?.questionBudget) }}</el-descriptions-item>
            <el-descriptions-item label="信息预算">{{ numberOrDash(planner?.informationBudget) }}</el-descriptions-item>
            <el-descriptions-item label="State Revision">{{ plannerStateGuidance('stateRevision') || traceState?.revision || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Active Context 模式">{{ activeContext?.selectionMode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="Active Context Token">{{ budgetPair(activeContext?.estimatedTokens, activeContext?.tokenBudget) }}</el-descriptions-item>
            <el-descriptions-item label="历史消息选择">{{ historySelectionLabel() }}</el-descriptions-item>
            <el-descriptions-item label="Input Budget 来源">{{ scopeSourceLabel(stringValue(inputBudget?.source)) }}</el-descriptions-item>
            <el-descriptions-item label="Input Budget 模式">{{ stringValue(inputBudget?.mode) || '—' }}</el-descriptions-item>
            <el-descriptions-item label="总输入预算">{{ numberOrDash(inputBudget?.totalTokenBudget) }}</el-descriptions-item>
            <el-descriptions-item label="预留系统指令">{{ numberOrDash(inputBudget?.reservedInstructionTokens) }}</el-descriptions-item>
            <el-descriptions-item label="知识预算">{{ budgetPair(inputBudget?.estimatedKnowledgeTokens, inputBudget?.knowledgeTokenBudget) }}</el-descriptions-item>
            <el-descriptions-item label="估算输入">{{ numberOrDash(inputBudget?.estimatedRuntimeInputTokens) }}</el-descriptions-item>
          </el-descriptions>
          <div v-if="planner?.microActions?.length" class="detail-line"><span>本轮动作：</span>{{ planner.microActions.join('、') }}</div>
          <div v-if="planner?.prohibitedMicroActions?.length" class="detail-line"><span>禁止动作：</span>{{ planner.prohibitedMicroActions.join('、') }}</div>
        </el-card>

        <SimulationLongHorizonStatePanel
          v-if="traceState"
          :state="traceState"
          :context-window="traceContextWindow"
        />

        <el-card v-if="canInspectCanonical" shadow="never">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>当前 Canonical Conversation State</strong>
                <div class="mt-1 text-xs text-slate-500">这里读取服务器当前状态；上面的 State 是本次生成时快照，两者 revision 可能不同。</div>
              </div>
              <div class="flex gap-2">
                <el-button size="small" :loading="stateLoading" @click="loadCanonicalState">刷新</el-button>
                <el-button v-if="canUpdateState" size="small" type="warning" plain :loading="stateMutating" @click="safeRebuildState">安全重建</el-button>
              </div>
            </div>
          </template>
          <div v-loading="stateLoading">
            <el-alert
              v-if="canonicalState?.rebuildRequired"
              type="warning"
              :closable="false"
              show-icon
              :title="`当前 State 标记需要重建${canonicalState.lastRebuildReason ? `：${canonicalState.lastRebuildReason}` : ''}`"
            />
            <el-empty v-if="!stateLoading && (!canonicalState || !canonicalState.enabled || !canonicalState.state)" description="该会话当前没有可读取的 canonical State" />
            <template v-else-if="canonicalState?.state">
              <el-descriptions class="mb-3" :column="mobile ? 1 : 3" border>
                <el-descriptions-item label="Revision">{{ canonicalState.revision ?? canonicalState.state.revision }}</el-descriptions-item>
                <el-descriptions-item label="State Hash"><span class="break-all">{{ shortHash(canonicalState.stateHash) }}</span></el-descriptions-item>
                <el-descriptions-item label="Canonical 会话段">{{ canonicalState.sourceConversationIds?.length || 1 }}</el-descriptions-item>
              </el-descriptions>

              <SimulationLongHorizonStatePanel :state="canonicalState.state" :context-window="null" />

              <el-collapse class="mt-3">
                <el-collapse-item title="State 字段与证据 / 安全失效" name="fields">
                  <el-alert class="mb-3" type="warning" :closable="false" show-icon title="“标记失效”只让派生 State 不再作为事实使用，不会删除或篡改原始 DialogueMessage。安全重建会重新从权威原始证据计算，因此纠错应以真实新消息/纠正后的原始证据为准。" />
                  <div v-for="field in canonicalFieldEntries" :key="field.key" class="state-row">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <strong>{{ field.label }}</strong>
                        <el-tag size="small" :type="stateStatusTag(field.value.status)">{{ field.value.status }}</el-tag>
                        <span class="text-xs text-slate-400">confidence {{ formatConfidence(field.value.confidence) }}</span>
                      </div>
                      <div class="mt-1 break-words text-sm">{{ stateValueLabel(field.value.value) }}</div>
                      <div class="mt-1 text-xs text-slate-500">证据：{{ field.value.evidenceMessageIds?.length || 0 }} 条 · {{ field.value.reason || '—' }}</div>
                    </div>
                    <el-button
                      v-if="canUpdateState && !['UNKNOWN', 'STALE'].includes(field.value.status)"
                      size="small"
                      type="danger"
                      plain
                      :loading="stateMutating"
                      @click="invalidateState('CANONICAL_FIELD', field.key, field.label)"
                    >标记失效</el-button>
                  </div>

                  <div v-if="canonicalState.state.relevantMemories?.length" class="mt-4">
                    <div class="mb-2 font-medium">本轮可召回记忆</div>
                    <div v-for="memory in canonicalState.state.relevantMemories" :key="memory.id" class="state-row">
                      <div class="min-w-0 flex-1">
                        <strong>{{ memory.kind }}</strong>
                        <div class="mt-1 break-words text-sm">{{ memory.value }}</div>
                        <div class="mt-1 text-xs text-slate-500">memoryId: {{ memory.id }} · evidence: {{ memory.evidenceMessageIds?.length || 0 }}</div>
                      </div>
                      <el-button v-if="canUpdateState" size="small" type="danger" plain :loading="stateMutating" @click="invalidateState('MEMORY', memory.id, String(memory.value || memory.key || memory.id))">失效记忆</el-button>
                    </div>
                  </div>
                </el-collapse-item>

                <el-collapse-item :title="`权威证据消息（${canonicalState.evidenceMessages?.length || 0}）`" name="evidence">
                  <div v-if="canonicalState.evidenceMessages?.length" class="space-y-2">
                    <div v-for="message in canonicalState.evidenceMessages" :key="message.id" class="evidence-row">
                      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <el-tag size="small" :type="message.senderRole === 'account' ? 'success' : 'info'">{{ message.senderRole }}</el-tag>
                        <span>{{ formatDate(message.observedAt) }}</span>
                        <span class="break-all">{{ message.id }}</span>
                      </div>
                      <div class="mt-1 whitespace-pre-wrap break-words text-sm">{{ message.textContent || '（非文本/空文本）' }}</div>
                    </div>
                  </div>
                  <el-empty v-else description="当前 State 没有可展示的消息证据" />
                </el-collapse-item>
              </el-collapse>
            </template>
          </div>
        </el-card>

        <el-alert
          v-if="!trace.merchantRoleId"
          title="该回复缺少客服角色生成证据"
          description="可以保存满意度，但不能进行精确校准。请先为机器人绑定已启用的账号资料。"
          type="warning"
          :closable="false"
          show-icon
        />
      </template>
    </div>
    <template #footer><el-button @click="$emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { CustomerServiceReplyTraceDetail } from '@/modules/customer-service/api/reply-traces.api';
import type { CustomerServiceConversationStateSummary } from '@/modules/customer-service/types/simulation.types';
import SimulationLongHorizonStatePanel from '@/views/customer-service/simulation/components/SimulationLongHorizonStatePanel.vue';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import {
  getCanonicalConversationState,
  invalidateCanonicalConversationState,
  rebuildCanonicalConversationState,
  type CanonicalConversationStateDetail,
  type CanonicalStateTargetType
} from '@/api/modules/dialogueRecords';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  trace: CustomerServiceReplyTraceDetail | null;
  loading?: boolean;
  mobile?: boolean;
}>(), { loading: false, mobile: false });

defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { has } = useCustomerServicePermission();
const canonicalState = ref<CanonicalConversationStateDetail | null>(null);
const stateLoading = ref(false);
const stateMutating = ref(false);
const canUpdateState = computed(() => has('robot:update'));
const conversationStrategy = computed(() => props.trace?.runtimeExplainability?.conversationStrategy || null);
const interactionPlanV2 = computed(() => props.trace?.runtimeExplainability?.interactionPlanV2 || null);
const guidelinePolicy = computed(() => props.trace?.runtimeExplainability?.guidelinePolicy || null);
const hve3Execution = computed(() => props.trace?.runtimeExplainability?.hve3Execution || null);
const runtimeAudit = computed<Record<string, any> | null>(() => props.trace?.runtimeExplainability?.runtimeAudit || null);
const runtimeAuditTargetStatus = computed(() => stringValue((runtimeAudit.value?.targetResolution as Record<string, unknown> | undefined)?.status) || '—');
const runtimeAuditRetrievalCounts = computed(() => {
  const retrieval = runtimeAudit.value?.retrieval as Record<string, any> | undefined;
  const counts = retrieval?.counts as Record<string, unknown> | undefined;
  if (!counts) return '—';
  return `${numberOrDash(counts.selected)} / ${numberOrDash(counts.candidateMembershipRejected)}`;
});
const runtimeAuditFactFirewallStatus = computed(() => {
  const firewall = runtimeAudit.value?.factFirewall as Record<string, unknown> | undefined;
  if (!firewall) return '—';
  return [stringValue(firewall.decision), stringValue(firewall.observedDecision)].filter(Boolean).join(' / ') || '—';
});
const runtimeAuditDeliveryEffect = computed(() => {
  const isolation = runtimeAudit.value?.failureIsolation as Record<string, any> | undefined;
  return stringValue(isolation?.affectsDelivery) || '—';
});
const runtimeAuditJson = computed(() => {
  try { return JSON.stringify(runtimeAudit.value, null, 2); } catch { return String(runtimeAudit.value ?? ''); }
});
const behaviorExplainability = computed(() => props.trace?.runtimeExplainability?.behaviorExplainability || null);
const humanBehavior = computed(() => {
  const value = behaviorExplainability.value?.expressionPlan || props.trace?.runtimeExplainability?.humanBehavior || null;
  return value && Object.keys(value).length ? value : null;
});
const behaviorDecisionReasons = computed(() => behaviorExplainability.value?.decisionReasons || humanBehavior.value?.decisionReasons || []);
const planner = computed(() => props.trace?.runtimeExplainability?.planner || null);
const inputBudget = computed(() => props.trace?.runtimeExplainability?.inputBudget || null);
const activeContext = computed(() => props.trace?.runtimeExplainability?.activeContext || null);
const traceState = computed<CustomerServiceConversationStateSummary | null>(() => props.trace?.runtimeExplainability?.conversationState || null);
const hasPlannerOrBudget = computed(() => Boolean(planner.value || inputBudget.value || activeContext.value?.budgetApplied));
const canInspectCanonical = computed(() => Boolean(
  props.trace?.conversationId
  && (props.trace.sourceType === 'RUNTIME_DM' || props.trace.runtimeExplainability?.canonicalConversationState?.enabled === true)
));
const traceContextWindow = computed(() => traceState.value ? {
  recentMessageCount: Number(activeContext.value?.recentMessageCount || 0),
  retrievedMemoryCount: Number(activeContext.value?.retrievedMemoryCount || activeContext.value?.evidenceRecallCount || 0),
  estimatedCharacters: Number(activeContext.value?.estimatedCharacters || 0)
} : null);
const canonicalFieldLabels: Record<string, string> = {
  relationship: '客户关系', activeTopic: '当前主题', currentIntent: '当前意图', customerGoal: '客户目标',
  customerActions: '客户动作', explicitFacts: '明确事实', preferences: '客户偏好', assistantActions: '已发送客服动作',
  pendingItems: '未完成事项', resolvedItems: '已完成事项', transientState: '瞬时状态'
};
const canonicalFieldEntries = computed(() => Object.entries(canonicalState.value?.state?.canonicalFields || {}).map(([key, value]) => ({
  key, label: canonicalFieldLabels[key] || key, value
})));

watch(
  () => [props.modelValue, props.trace?.id, props.trace?.conversationId] as const,
  ([open]) => {
    canonicalState.value = null;
    if (open && canInspectCanonical.value) void loadCanonicalState();
  },
  { immediate: true }
);

async function loadCanonicalState() {
  const conversationId = props.trace?.conversationId;
  if (!conversationId || stateLoading.value) return;
  stateLoading.value = true;
  try {
    canonicalState.value = await getCanonicalConversationState(conversationId);
  } catch {
    canonicalState.value = null;
    ElMessage.warning('当前会话的 canonical State 暂不可读取；本次生成时 State 快照仍可继续查看');
  } finally {
    stateLoading.value = false;
  }
}

async function invalidateState(targetType: CanonicalStateTargetType, targetKey: string, label: string) {
  const conversationId = props.trace?.conversationId;
  if (!conversationId || stateMutating.value) return;
  await ElMessageBox.confirm(
    `确认将“${label}”标记为失效？该操作不会删除原始聊天记录，只会让当前派生 State 不再把它当成有效事实。`,
    '安全失效 State',
    { type: 'warning', confirmButtonText: '确认失效', cancelButtonText: '取消' }
  );
  stateMutating.value = true;
  try {
    const result = await invalidateCanonicalConversationState(conversationId, {
      targetType,
      targetKey,
      reason: 'KF_PC_OPERATOR_INVALIDATION'
    });
    if (result.status === 'CONFLICT') ElMessage.warning('State 刚刚被其他消息更新，请刷新后重试');
    else if (result.status === 'UNCHANGED') ElMessage.info('目标已失效或当前不存在，无需重复处理');
    else ElMessage.success('已标记失效；后续回复将使用新的 State revision');
    await loadCanonicalState();
  } finally {
    stateMutating.value = false;
  }
}

async function safeRebuildState() {
  const conversationId = props.trace?.conversationId;
  if (!conversationId || stateMutating.value) return;
  await ElMessageBox.confirm(
    '安全重建会从服务器保存的 canonical 有效 DialogueMessage 重新计算 State，不会删除原始聊天记录。若你只是想让错误推断暂时失效，请先使用“标记失效”。确认继续？',
    '从权威会话证据重建 State',
    { type: 'warning', confirmButtonText: '确认重建', cancelButtonText: '取消' }
  );
  stateMutating.value = true;
  try {
    const result = await rebuildCanonicalConversationState(conversationId);
    if (result.status === 'CONFLICT') ElMessage.warning('重建期间会话有新事件进入，请刷新后再试');
    else if (result.status === 'NOT_CANONICAL') ElMessage.warning('该会话当前没有可重建的 canonical State');
    else ElMessage.success('Canonical State 已从权威会话证据安全重建');
    await loadCanonicalState();
  } finally {
    stateMutating.value = false;
  }
}


function hvePlanStatusTitle() {
  const lane = hve3Execution.value?.envelope?.lane;
  if (lane === 'HVE3_CANDIDATE' || lane === 'HVE_ACTIVE') return '当前 InteractionPlan v2 已作为 HVE-3 NLG 的唯一行为 authority；Legacy ExpressionPlan 仅保留对照诊断。';
  return '当前 InteractionPlan v2 仍为 Shadow：用于验证“这一轮应该做什么”，不会改变 Legacy 客户可见回复。';
}
function hveKernelLabel() {
  const kernel = hve3Execution.value?.diagnostics?.kernel;
  if (!kernel) return '—';
  return [kernel.id, kernel.version, kernel.contentHash ? shortHash(kernel.contentHash) : ''].filter(Boolean).join(' / ');
}
function hveFreezeLabel() {
  const freeze = hve3Execution.value?.finalTextFreeze;
  if (!freeze?.frozen) return '未冻结 / Legacy';
  return `已冻结 · ${freeze.textLength ?? '—'} 字 · ${shortHash(freeze.sha256)}`;
}
function hveHumanityLabel() {
  const value = hve3Execution.value?.diagnostics?.softHumanity;
  if (!value) return '—';
  const roleEvidenceStatus = value.roleEvidence?.status || 'INSUFFICIENT_EVIDENCE';
  const persona = roleEvidenceStatus === 'SUFFICIENT'
    ? `Persona ${value.personaPreferenceScore ?? '—'}`
    : `Persona UNVERIFIED(${value.personaPreferenceScore ?? '—'})`;
  return `${value.status || '—'} · ${value.score ?? '—'} · ${persona} · Utility ${value.pairwiseUtilityScore ?? '—'}`;
}
function hveRoleEvidenceLabel() {
  const value = hve3Execution.value?.diagnostics?.softHumanity?.roleEvidence;
  if (!value) return 'INSUFFICIENT_EVIDENCE · 未提供正向角色证据';
  const positive = value.positiveEvidence?.length ? ` · 正向 ${value.positiveEvidence.join('、')}` : '';
  const missing = value.missingEvidence?.length ? ` · 缺失 ${value.missingEvidence.join('、')}` : '';
  return `${value.status || 'INSUFFICIENT_EVIDENCE'} · ${value.score ?? '—'}${positive}${missing}`;
}
function hveSemanticValueLabel() {
  const value = hve3Execution.value?.diagnostics?.softHumanity?.semanticValue;
  if (!value) return '—';
  return `当前价值 ${value.currentTurnValueScore ?? '—'} · 决策贡献 ${hveDecisionContributionKindLabel(value.decisionContributionKind)} ${value.decisionContributionScore ?? '—'} · 偏好使用 ${value.preferenceUsageScore ?? '—'} · 服务入口 ${value.serviceEntryValueScore ?? '—'} · 身份表面 ${value.identitySurfaceQualityScore ?? '—'} · 信息增量 ${value.informationGainScore ?? '—'} · 问题价值 ${value.questionValueScore ?? '—'} · 去复述 ${value.redundantParaphraseScore ?? '—'}`;
}
function hveDecisionContributionKindLabel(value?: string) {
  return ({
    NONE: '无需决策贡献',
    REFRAME_ONLY: '仅重述/弱改写',
    USEFUL_DIRECTION: '形成有用方向',
    GROUNDED_FACT: 'Grounded 事实',
    DECISION_REDUCTION: '减少决策不确定性',
    TASK_ADVANCE: '推进必要任务',
  } as Record<string, string>)[value || ''] || value || '—';
}
function hveDecisionContributionLabel() {
  const value = hve3Execution.value?.diagnostics?.softHumanity?.semanticValue;
  if (!value) return '—';
  return `${hveDecisionContributionKindLabel(value.decisionContributionKind)} · ${value.decisionContributionScore ?? '—'}`;
}
function hvePublicIdentityProjectionLabel() {
  const value = hve3Execution.value?.diagnostics?.publicIdentityProjection;
  if (!value) return '—';
  const surface = value.preferredSurfaceLabel || value.businessLabel || value.relationLabel || '通用客服关系';
  const source = value.source ? ` · 来源 ${value.source}` : '';
  const withheld = value.withheldInternalLabelCount != null ? ` · 已隔离内部标签 ${value.withheldInternalLabelCount}` : '';
  return `${surface}${source}${withheld}`;
}
function hveResolvedRoleLabel() {
  const value = hve3Execution.value?.diagnostics?.resolvedRoleIdentity;
  if (!value) return '未记录 / 旧 Trace';
  const fields = value.fieldSources || [];
  const accountSources = ['accountExpression.tone', 'accountExpression.voice', 'accountExpression.background', 'accountExpression.relationship']
    .map((key) => {
      const field = fields.find((item) => item.field === key);
      const source = field?.source || 'MISSING';
      return `${key.split('.').pop()}=${source}${field?.compatibilityAlias ? '(compat)' : ''}`;
    })
    .join(' / ');
  const flags = [
    value.missingFields?.length ? `缺失 ${value.missingFields.join('、')}` : '',
    value.defaultedFields?.length ? `默认 ${value.defaultedFields.join('、')}` : '',
    value.conflictKeys?.length ? `冲突 ${value.conflictKeys.join('、')}` : '',
  ].filter(Boolean).join('；');
  return `speaker=${value.speakerSource || '—'} · fingerprint=${shortHash(value.configurationFingerprint)} · ${accountSources}${flags ? ` · ${flags}` : ''}`;
}
function hveRoleBehaviorLabel() {
  const behavior = hve3Execution.value?.diagnostics?.humanTurnRealization?.participation?.roleBehavior;
  if (!behavior) return '未记录 / 旧 Trace';
  return [
    behavior.responsePriority ? `priority=${behavior.responsePriority}` : '',
    behavior.judgmentStyle ? `judgment=${behavior.judgmentStyle}` : '',
    behavior.relationshipStance ? `relation=${behavior.relationshipStance}` : '',
    behavior.questionThreshold ? `question=${behavior.questionThreshold}` : '',
    behavior.adviceMode ? `advice=${behavior.adviceMode}` : '',
    behavior.cadence ? `cadence=${behavior.cadence}` : '',
    behavior.expressionDynamics?.warmth ? `warmth=${behavior.expressionDynamics.warmth}` : '',
    behavior.expressionDynamics?.engagement ? `engagement=${behavior.expressionDynamics.engagement}` : '',
    behavior.expressionDynamics?.reassurance ? `reassurance=${behavior.expressionDynamics.reassurance}` : '',
    behavior.expressionDynamics?.servicePresence ? `servicePresence=${behavior.expressionDynamics.servicePresence}` : '',
    behavior.behaviorSignature ? `signature=${behavior.behaviorSignature}` : '',
  ].filter(Boolean).join(' · ') || '—';
}

function hveTurnCompositionLabel() {
  const planDelta = interactionPlanV2.value?.answerObligation;
  const composition = hve3Execution.value?.diagnostics?.humanTurnRealization?.turnComposition;
  const delta = composition?.semanticDelta || planDelta;
  if (!delta && !composition) return '未记录 / 旧 Trace';
  return [
    delta?.continuity ? `continuity=${delta.continuity}` : '',
    delta?.currentFocus ? `focus=${delta.currentFocus}${delta.currentFocusLabel ? `(${delta.currentFocusLabel})` : ''}` : '',
    delta?.previousFocus ? `previous=${delta.previousFocus}` : '',
    delta?.mustAddNewInformation != null ? `mustAdd=${delta.mustAddNewInformation ? 'YES' : 'NO'}` : '',
    delta?.avoidRepeat != null ? `avoidRepeat=${delta.avoidRepeat ? 'YES' : 'NO'}` : '',
    delta?.evidenceState ? `evidence=${delta.evidenceState}` : '',
    delta?.unknownStrategy ? `unknown=${delta.unknownStrategy}` : '',
    delta?.responseTarget?.requestedSpecificity ? `specificity=${delta.responseTarget.requestedSpecificity}` : '',
    delta?.responseTarget?.priorCoverage ? `priorCoverage=${delta.responseTarget.priorCoverage}` : '',
    delta?.responseTarget?.requiredDelta ? `requiredDelta=${delta.responseTarget.requiredDelta}` : '',
    delta?.responseTarget?.knowledgeRequirement ? `knowledge=${delta.responseTarget.knowledgeRequirement}` : '',
    delta?.responseTarget?.unresolvedNeed ? `unresolved=${delta.responseTarget.unresolvedNeed}` : '',
    composition?.beats?.length ? `beats=${composition.beats.join('+')}` : '',
    composition?.segmentPlan?.length ? `segmentPlan=${composition.segmentPlan.map((segment) => `${Number(segment.index || 0) + 1}:${(segment.purposes || []).join('+')}`).join('/')}` : '',
    composition?.segmentation ? `segmentation=${composition.segmentation}` : '',
    composition?.preferredMessageSegments != null ? `preferredSegments=${composition.preferredMessageSegments}` : '',
    composition?.maxMessageSegments != null ? `maxSegments=${composition.maxMessageSegments}` : '',
  ].filter(Boolean).join(' · ') || '—';
}

function hveExpectedInformationGainLabel() {
  const fromHumanity = hve3Execution.value?.diagnostics?.softHumanity?.semanticValue?.expectedInformationGains || [];
  const fromPlan = (interactionPlanV2.value?.acts || []).map((item) => item.parameters?.expectedInformationGain).filter(Boolean) as string[];
  const values = [...new Set(fromHumanity.length ? fromHumanity : fromPlan)];
  return values.length ? values.map(hveInformationGainLabel).join('、') : '未声明 / Legacy Trace';
}
function hveInformationGainLabel(value?: string) {
  return ({
    NONE: '无需新增信息',
    CONFIRM: '确认已有信息',
    REDUCE_UNCERTAINTY: '减少不确定性',
    ADD_GENERAL_GUIDANCE: '增加安全的一般性指导',
    ADD_GROUNDED_INFORMATION: '增加有 Grounding 的信息',
    ADVANCE_REQUIRED_TASK: '推进必要任务',
  } as Record<string, string>)[value || ''] || value || '—';
}
function hveKnowledgeStatusLabel(value?: string) {
  return ({
    NOT_AVAILABLE: '未命中 Knowledge',
    AVAILABLE_NOT_OBSERVED: '已命中但生成未观察到使用',
    OBSERVED_WITH_GROUNDING: '已观察到 Grounding 使用',
    UNCERTAIN: '命中但本轮是否应使用不确定',
  } as Record<string, string>)[value || ''] || value || '—';
}
function hveKnowledgeUtilizationLabel() {
  const value = hve3Execution.value?.diagnostics?.softHumanity?.semanticValue?.knowledgeUtilization;
  if (!value) return '—';
  const counts = `可用 ${value.availableEntryIds?.length || 0} / 已观察 ${value.observedEntryIds?.length || 0}`;
  const expected = value.expectedByActs?.length ? ` · 期望动作 ${value.expectedByActs.join('、')}` : '';
  return `${hveKnowledgeStatusLabel(value.status)} · ${counts}${expected}`;
}
function hveVoiceProjectionLabel() {
  const value = hve3Execution.value?.diagnostics?.voiceProjection;
  if (!value) return '—';
  const posture = value.posture || {};
  const tone = value.tone || {};
  const postureParts = [
    posture.familiarityDistance ? `距离 ${posture.familiarityDistance}` : '',
    posture.conversationalEnergy ? `能量 ${posture.conversationalEnergy}` : '',
    posture.humorTolerance ? `玩笑 ${posture.humorTolerance}` : '',
    posture.advicePosture ? `建议 ${posture.advicePosture}` : '',
    posture.supportMode ? `支持 ${posture.supportMode}` : '',
  ].filter(Boolean);
  const toneParts = [
    tone.directness != null ? `直接度 ${tone.directness}` : '',
    tone.warmth != null ? `温度 ${tone.warmth}` : '',
    tone.formality != null ? `正式度 ${tone.formality}` : '',
  ].filter(Boolean);
  return [...postureParts, ...toneParts].join(' · ') || '—';
}
function hveSelectionLabel() {
  const value = hve3Execution.value?.diagnostics;
  if (!value) return '—';
  const selected = value.selectedCandidateIndex == null ? '' : `候选 #${Number(value.selectedCandidateIndex) + 1}`;
  return [selected, value.selectionPolicy, value.selectedReason].filter(Boolean).join(' · ') || '—';
}
function hveSemanticEconomyLabel() {
  const features = hve3Execution.value?.diagnostics?.softHumanity?.features || [];
  const pick = (key: string) => features.find((item) => item.key === key)?.score;
  const values = [
    ['Act Economy', pick('ACT_ECONOMY')],
    ['Semantic Load', pick('SEMANTIC_LOAD')],
    ['Redundant Paraphrase', pick('REDUNDANT_PARAPHRASE')],
  ].filter((item) => item[1] != null);
  return values.length ? values.map(([key, value]) => `${key} ${value}`).join(' · ') : '—';
}
function hveSemanticFulfillmentLabel() {
  const value = hve3Execution.value?.diagnostics?.semanticFulfillment;
  if (!value) return '未记录 / 旧 Trace';
  const issues = value.issueKeys?.length ? ` · ${value.issueKeys.join('、')}` : '';
  const claim = value.claimAuthority
    ? ` · Claim ${value.claimAuthority.status || '—'}${value.claimAuthority.issueKeys?.length ? `(${value.claimAuthority.issueKeys.join('、')})` : ''}`
    : '';
  return `${value.status || '—'} · score=${value.score ?? '—'}${issues}${claim}`;
}
function hveStructuredSegmentsLabel(segments?: Array<{ index?: number; purposes?: string[]; source?: string; preview?: string }>) {
  if (!segments?.length) return '—';
  return segments.map((segment) => `#${Number(segment.index || 0) + 1} ${(segment.purposes || []).join('+') || '—'}：${segment.preview || '—'}`).join(' / ');
}

function hveObservedActsLabel() {
  const values = (hve3Execution.value?.diagnostics?.observedActs || []).filter((item) => item.observation === 'OBSERVED').map((item) => item.type);
  return values.length ? values.join('、') : '未确定观察到 Canonical Act';
}
function hveUnexpectedActsLabel() {
  const values = hve3Execution.value?.diagnostics?.planCompliance?.unexpected || [];
  return values.length ? values.map((item) => item.act || 'UNKNOWN').join('、') : '无';
}
function hveCriticalClaimsLabel() {
  const values = hve3Execution.value?.diagnostics?.criticalClaims || [];
  return values.length ? values.map((item) => `${item.key || 'CLAIM'}=${item.status || '—'}`).join('、') : '未检测到关键身份声明';
}
function hveHumanityRiskLabel() {
  const values = hve3Execution.value?.diagnostics?.softHumanity?.highRiskKeys || [];
  return values.length ? values.join('、') : '无高风险特征';
}
function hveNlgProjectionLabel() {
  const value = hve3Execution.value?.diagnostics?.nlgContextProjection;
  if (!value) return '—';
  const exposed = value.exposedFields?.length || 0;
  const withheld = value.withheldFields?.length || 0;
  return `暴露 ${exposed} 类 / 隐藏 ${withheld} 类`;
}
function hveCandidateClaimsLabel(item: { criticalClaimStatus?: Array<{ key?: string; status?: string }> }) {
  const values = item.criticalClaimStatus || [];
  return values.length ? values.map((claim) => `${claim.key || 'CLAIM'}:${claim.status || '—'}`).join('、') : '—';
}
function hveCandidatePersonaLabel(item: { personaPreferenceScore?: number; roleEvidenceStatus?: string }) {
  return item.roleEvidenceStatus === 'SUFFICIENT'
    ? `Persona ${item.personaPreferenceScore ?? '—'}`
    : `Persona UNVERIFIED(${item.personaPreferenceScore ?? '—'})`;
}
function hveCandidateRoleEvidenceLabel(item: { positiveRoleEvidence?: string[]; missingRoleEvidence?: string[] }) {
  const positive = item.positiveRoleEvidence?.length ? `正向 ${item.positiveRoleEvidence.join('、')}` : '';
  const missing = item.missingRoleEvidence?.length ? `缺失 ${item.missingRoleEvidence.join('、')}` : '';
  return [positive, missing].filter(Boolean).join('；') || '无可观察角色证据';
}

function hveActParametersLabel(parameters?: { target?: string; decisionPurpose?: string; known?: string[]; missing?: string[]; expectedInformationGain?: string }) {
  if (!parameters) return '—';
  return [
    parameters.target ? `target=${parameters.target}` : '',
    parameters.decisionPurpose ? `purpose=${parameters.decisionPurpose}` : '',
    parameters.known?.length ? `known=${parameters.known.join(' / ')}` : '',
    parameters.missing?.length ? `missing=${parameters.missing.join(' / ')}` : '',
    parameters.expectedInformationGain ? `informationGain=${hveInformationGainLabel(parameters.expectedInformationGain)}` : '',
  ].filter(Boolean).join(' · ') || '—';
}
function hveHardIssuesLabel() {
  const values = hve3Execution.value?.diagnostics?.hardCompliance?.hardIssueKeys || [];
  return values.length ? values.join('、') : '无';
}
function hvePlanWarningsLabel() {
  const values = hve3Execution.value?.diagnostics?.planCompliance?.warningKeys || [];
  return values.length ? values.join('、') : '无';
}

function interactionActsByNecessity(necessity: 'REQUIRED' | 'PREFERRED' | 'OPTIONAL') {
  const values = (interactionPlanV2.value?.acts || []).filter((item) => item.necessity === necessity).map((item) => item.type);
  return values.length ? values.join('、') : '无';
}
function interactionSuppressions(enforcement: 'HARD' | 'SOFT') {
  const values = (interactionPlanV2.value?.suppressedActs || []).filter((item) => item.enforcement === enforcement).map((item) => item.type);
  return values.length ? values.join('、') : '无';
}
function interactionGroundingSummary() {
  const values = interactionPlanV2.value?.grounding?.requirements || [];
  if (!values.length) return '本轮无显式 Grounding 要求';
  return values.map((item) => `${item.source}:${item.key}=${item.status}${item.requirement === 'REQUIRED' ? '（必须）' : ''}`).join('；');
}
function interactionCompletionSummary() {
  const values = interactionPlanV2.value?.completion?.conditions || [];
  return values.map((item) => item.ref ? `${item.type}:${item.ref}` : String(item.type || 'UNKNOWN')).join('；') || '—';
}
function guidelineResolutionSummary() {
  const value = guidelinePolicy.value?.resolutionSet;
  if (!value) return '未加载 Guideline Shadow';
  const applied = (value.traces || []).filter((item) => item.status === 'APPLIED').length;
  const skipped = (value.traces || []).length - applied;
  return `已应用 ${applied} 条；未应用/跳过 ${skipped} 条；冲突 ${(value.conflicts || []).length} 条；hash=${value.resolutionHash || '—'}`;
}
function guidelineComparisonSummary() {
  const value = guidelinePolicy.value?.comparison;
  if (!value) return '暂无对照';
  if (!value.changed) return '核心 Plan 语义一致';
  return `存在 Shadow 差异${value.completionChanged ? '；结束条件已变化' : ''}`;
}

function behaviorPreferenceSummary() {
  const policy = behaviorExplainability.value?.preferencePolicy || conversationStrategy.value?.policy?.humanBehavior;
  if (!policy) return '系统自动';
  const items = [
    ['自然度', policy.naturalness],
    ['密度', policy.responseDensity],
    ['口语化', policy.colloquiality],
    ['提问', policy.questionFrequency],
    ['业务推进', policy.businessAdvance],
    ['熟客承接', policy.returningContinuity],
    ['Emoji', policy.emoji],
    ['身份显现', policy.identityExposure],
    ['分段', policy.segmentation],
  ];
  return items.map(([label, value]) => `${label}=${humanPreferenceLabel(String(value || 'AUTO'))}`).join('；');
}
function humanPreferenceLabel(value: string) {
  return ({
    AUTO: '系统自动', RESERVED: '稳重克制', RELAXED: '松弛自然', COMPACT: '偏精简/合并', RICH: '偏丰富',
    LOW: '低', MEDIUM: '中', HIGH: '高', LIGHT: '轻量', STRONG: '较强', NONE: '不用', NATURAL: '自然',
    AMBIENT: '环境式', DIRECT: '直接', SEQUENTIAL: '允许多段', BALANCED: '平衡'
  } as Record<string, string>)[value] || value;
}
function segmentTargetLabel() {
  const target = humanBehavior.value?.segmentTarget;
  if (!target) return '—';
  const min = numberOrDash(target.min);
  const max = numberOrDash(target.max);
  return min === max ? `${max} 条` : `${min}～${max} 条`;
}
function behaviorReason(kind: 'QUESTION' | 'CTA' | 'STRUCTURE') {
  const patterns = kind === 'QUESTION'
    ? [/QUESTION/i, /提问|追问|问题|问句/]
    : kind === 'CTA'
      ? [/CTA|SALES|BUSINESS_ADVANCE/i, /成交|销售|推进/]
      : [/STRUCTURE/i, /结构/];
  const matched = behaviorDecisionReasons.value.find((item) => patterns.some((pattern) => pattern.test(`${item.ruleId || ''} ${item.reason || ''}`)));
  return matched?.reason || (kind === 'QUESTION' ? '由本轮 ExpressionPlan 与提问预算共同决定。' : kind === 'CTA' ? '由 Planner、客户当前意图与 Behavior 规则共同决定。' : '近期回复结构触发了 anti-repetition 变化规则。');
}

function plannerStateGuidance(key: string) {
  return stringValue(planner.value?.stateGuidance?.[key]);
}
function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}
function numberOrDash(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? String(number) : '—';
}
function budgetPair(used: unknown, limit: unknown) {
  const usedText = numberOrDash(used);
  const limitText = numberOrDash(limit);
  return usedText === '—' && limitText === '—' ? '—' : `${usedText} / ${limitText}`;
}
function historySelectionLabel() {
  const selected = numberOrDash(activeContext.value?.selectedMessageCount);
  const candidates = numberOrDash(activeContext.value?.candidateMessageCount);
  if (selected === '—' && candidates === '—') return '—';
  return `${selected} / ${candidates}${activeContext.value?.allHistoryIncluded ? '（完整历史）' : '（预算筛选）'}`;
}
function stateValueLabel(value: unknown) {
  if (value == null) return 'UNKNOWN / 无值';
  if (typeof value === 'string') return value || '—';
  try { return JSON.stringify(value); } catch { return String(value); }
}
function formatConfidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}
function shortHash(value?: string) {
  if (!value) return '—';
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}
function stateStatusTag(value?: string) {
  if (value === 'EXPLICIT') return 'success';
  if (value === 'INFERRED') return 'warning';
  if (value === 'CONFLICTED') return 'danger';
  if (value === 'STALE') return 'info';
  return 'info';
}
function intentLabel(value: CustomerServiceReplyTraceDetail['runtimeExplainability'] | undefined) {
  const intent = value?.intent;
  const name = intent?.name || intent?.key || '未命中正式意图流程';
  return intent?.scenario ? `${name}（场景：${intent.scenario}）` : name;
}
function scopeSourceLabel(value?: string) {
  return ({ STORE_PROFILE: '店铺默认', ACCOUNT_PROFILE: '当前账号覆盖', SYSTEM_DEFAULT: '系统默认' } as Record<string, string>)[value || ''] || value || '—';
}
function scopeModeLabel(value?: string) {
  return ({ AUTO: '自动使用适用流程', SELECTED_ONLY: '只使用选中流程', AUTO_EXCEPT_DISABLED: '自动使用并排除选中流程' } as Record<string, string>)[value || ''] || value || '—';
}
function lengthPresetLabel(value?: string) {
  return ({ CONCISE: '精简', BALANCED: '适中', DETAILED: '详细', CUSTOM: '自定义' } as Record<string, string>)[value || ''] || value || '—';
}
function carryoverLabel(value?: string) {
  return ({ AUTO: '自动判断', CONSERVATIVE: '保守承接', CONTINUITY_FIRST: '优先连续性' } as Record<string, string>)[value || ''] || value || '—';
}
function returningGreetingLabel(value?: string) {
  return ({ CURRENT_ONLY: '只回应当前问候', SOFT_CONTINUITY: '轻量承接历史', CONTINUE_PENDING: '优先承接未完成事项' } as Record<string, string>)[value || ''] || value || '—';
}
function identityStrengthLabel(value?: string) {
  return ({ LIGHT: '轻量保持', BALANCED: '自然平衡', STRONG: '清晰稳定' } as Record<string, string>)[value || ''] || value || '—';
}
function casualBoundaryLabel(value?: string) {
  return ({ BUSINESS_ANCHORED: '业务身份锚定', FLEXIBLE: '灵活闲聊', OPEN: '开放闲聊' } as Record<string, string>)[value || ''] || value || '—';
}
function inferenceLabel(value?: string) {
  return ({ EXPLICIT_ONLY: '仅明确事实', CONSERVATIVE: '保守高置信推断', BALANCED: '平衡推断' } as Record<string, string>)[value || ''] || value || '—';
}
function deliveryLabel(value: CustomerServiceReplyTraceDetail['runtimeExplainability'] | undefined) {
  const delivery = value?.replyExperience?.delivery;
  if (!delivery) return '—';
  const mode = ({ AUTO: '自动判断', SINGLE: '尽量合并一条', SEQUENTIAL: '允许顺序分段' } as Record<string, string>)[delivery.mode] || delivery.mode;
  return `${mode}；最多 ${delivery.maxSegments} 条；${delivery.minDelayMs}～${delivery.maxDelayMs}ms；客户插话${delivery.cancelRemainingOnCustomerMessage ? '取消' : '继续'}后续消息`;
}
function legacyPromptLabel(value: CustomerServiceReplyTraceDetail['runtimeExplainability'] | undefined) {
  const legacy = value?.legacyPrompt;
  if (!legacy) return '—';
  if (legacy.fallbackUsed) return `本次发生扣子回退${legacy.fallbackReason ? `：${legacy.fallbackReason}` : ''}`;
  return legacy.normalDeepSeekUsesLegacyPrompt ? '本次使用了旧提示词兼容链路' : '正常 DeepSeek 未使用旧扣子提示词正文';
}
function sourceLabel(value: string) {
  return ({ ROBOT_TEST_DM: '机器人私信测试', ROBOT_TEST_COMMENT: '机器人评论测试', RUNTIME_DM: '正式私信', RUNTIME_COMMENT: '正式评论', TUNING_SIMULATION: '回复调优模拟', RUNTIME_API: '运行时接口' } as Record<string, string>)[value] || value || '—';
}
function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<style scoped>
.detail-line { margin-top: 10px; color: var(--el-text-color-regular); font-size: 13px; line-height: 1.7; }
.detail-line span { color: var(--el-text-color-secondary); }
.state-row { display: flex; align-items: flex-start; gap: 12px; border-bottom: 1px solid var(--el-border-color-lighter); padding: 10px 0; }
.state-row:last-child { border-bottom: 0; }
.evidence-row { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-fill-color-lighter); padding: 9px 10px; }
.runtime-audit-json { margin: 0; max-height: 520px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.55; }
</style>
