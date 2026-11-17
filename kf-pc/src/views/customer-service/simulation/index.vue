<template>
  <div class="customer-service-page space-y-4">
    <section v-if="isMobile" class="mobile-tuning-shell">
      <header class="mobile-tuning-header">
        <div class="min-w-0">
          <div class="truncate text-base font-semibold">{{ currentSession?.title || '对话测试' }}</div>
          <div class="truncate text-xs text-slate-400">{{ selectedAccountName }} · {{ chatMessages.length }} 条消息</div>
        </div>
        <el-button class="mobile-more-button" round @click="mobileDrawerOpen = true">测试设置</el-button>
      </header>

      <div ref="mobileChatScrollRef" class="mobile-chat-history">
        <div v-if="!chatMessages.length" class="mobile-empty">
          <div class="mobile-empty-mark">AI</div>
          <b>开始新的客户对话</b>
          <span>输入客户消息后生成候选回复；确认后发送，不满意可直接校准</span>
        </div>
        <div v-for="item in chatMessages" :key="item.id" class="flex" :class="item.role === 'CUSTOMER' ? 'justify-end' : 'justify-start'">
          <div class="mobile-message" :class="item.role === 'CUSTOMER' ? 'mobile-message-customer' : 'mobile-message-assistant'">
            <div class="mb-1 text-[11px] opacity-60">{{ assistantLabel(item) }}</div>
            <div class="whitespace-pre-wrap">{{ item.content }}</div>
          </div>
        </div>
        <div v-if="submitting" class="mobile-thinking">阿梨正在结合整段对话生成…</div>

        <article v-if="mobilePendingCandidate" class="mobile-candidate-card">
          <div class="flex items-center justify-between gap-2">
            <b>待确认回复</b>
            <el-tag :type="execution?.quality.status === 'PASS' ? 'success' : 'warning'" size="small">{{ execution?.quality.status }}</el-tag>
          </div>
          <div class="mt-3 whitespace-pre-wrap text-sm leading-7">{{ mobilePendingCandidate }}</div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <el-button :loading="mobileAccepting" @click="rejectMobileCandidate">不接受·校准</el-button>
            <el-button type="primary" :loading="mobileAccepting" @click="acceptMobileCandidate">接受并发送</el-button>
          </div>
          <el-button class="mt-2 w-full" text @click="mobileDetailOpen = true">查看本轮分析和质量门</el-button>
        </article>
      </div>

      <div class="mobile-composer">
        <el-input
          ref="mobileMessageInputRef"
          v-model="form.message"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          maxlength="4000"
          placeholder="输入客户消息"
        />
        <div class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <SampleFillButton label="填入测试样例" :has-content="Boolean(form.message.trim())" @fill="fillSimulationSample" />
          <el-button class="w-full" type="primary" :loading="submitting" :disabled="!canExecute || Boolean(mobilePendingCandidate)" @click="submit(true, 'REVIEW')">生成候选</el-button>
        </div>
      </div>
    </section>

    <el-drawer v-model="mobileDrawerOpen" title="测试设置与分析" direction="rtl" size="100%" class="mobile-full-drawer" :close-on-click-modal="false">
      <el-tabs v-model="mobileDrawerTab" stretch>
        <el-tab-pane label="对话设置" name="settings">
          <div class="mobile-drawer-content">
            <el-form label-position="top">
              <el-form-item label="历史对话"><el-select v-model="activeSessionId" class="w-full" filterable @change="switchSession"><el-option v-for="item in sessions" :key="item.id" :label="item.title" :value="item.id" /></el-select></el-form-item>
              <div class="mb-4 grid grid-cols-2 gap-2">
                <el-button :disabled="!sessions.length || deletingSessions" @click="openSessionManager">管理历史对话</el-button>
                <el-button type="primary" plain :loading="creatingConversation" @click="createNewConversation">新建独立会话</el-button>
              </div>
              <el-alert
                class="mb-4"
                title="客服角色属于当前测试会话身份；切换角色会开启新的独立测试对话，当前会话与分析记录会保留。"
                type="info"
                :closable="false"
                show-icon
              />
              <el-form-item label="客服角色"><el-select v-model="form.merchantRoleId" class="w-full" filterable :disabled="creatingConversation || submitting || deletingSessions" @change="handleMerchantRoleChange"><el-option v-for="item in roles" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" /></el-select></el-form-item>
              <el-form-item label="店铺背景"><el-select v-model="form.storeProfileId" class="w-full" clearable><el-option v-for="item in enabledStoreProfiles" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
              <el-form-item label="账号背景/人设"><el-select v-model="form.accountProfileId" class="w-full" clearable @change="applyAccountBinding"><el-option v-for="item in selectableAccountProfiles" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
              <el-form-item label="行业能力"><el-select v-model="form.industryNodeId" class="w-full" clearable><el-option v-for="item in industryOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
        <el-tab-pane label="本轮分析" name="analysis">
          <div class="mobile-drawer-content space-y-4">
            <SimulationGenerationQualityPanel :generation="execution?.generation" :quality="execution?.quality" :can-calibrate="canCreateCalibration" @calibrate="rejectMobileCandidate" />
            <SimulationDialogueObligationPanel :obligation="result?.understanding.humanContext.dialogueObligation" />
            <SimulationLongHorizonStatePanel :state="result?.contract.generationContext.conversationState" :context-window="result?.contract.generationContext.contextWindow" />
            <SimulationContractPanel :result="result" :show-generation="false" :can-calibrate="false" :can-create-intent="canCreateIntent" :adding-intent-key="addingIntentKey" :added-intent-keys="addedIntentKeys" @add-intent="addRecognizedIntent" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="校准记录" name="calibration">
          <div v-if="canReadCalibration" class="mobile-drawer-content space-y-4">
            <CalibrationRecordsPanel ref="mobileRecordsRef" mobile :roles="roles" :can-analyze="canAnalyzeCalibration" :can-update="canUpdateCalibration" :can-publish="canPublishAsset" :regression-evidence="lastStrategyDraftRegression" @start-strategy-draft-regression="startStrategyDraftRegression" />
            <CalibrationProfilesPanel ref="mobileProfilesRef" mobile :roles="roles" :can-update="canUpdateCalibration" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="高级工具" name="regression">
          <div class="mobile-drawer-content"><RegressionTestPanel mobile :merchant-role-id="form.merchantRoleId" :industry-node-id="form.industryNodeId || undefined" :can-execute="canExecute" :strategy-version-ids="activeStrategyDraftVersionId ? [activeStrategyDraftVersionId] : []" @completed="handleStrategyDraftRegressionCompleted" /></div>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <el-drawer v-model="mobileDetailOpen" title="本轮分析与质量门" direction="btt" size="92%" class="mobile-full-drawer" :close-on-click-modal="false">
      <div class="mobile-drawer-content space-y-4">
        <SimulationGenerationQualityPanel :generation="execution?.generation" :quality="execution?.quality" :can-calibrate="canCreateCalibration" @calibrate="rejectMobileCandidate" />
        <SimulationContractPanel :result="result" :show-generation="false" :can-calibrate="false" :can-create-intent="false" />
      </div>
    </el-drawer>

    <el-drawer
      v-if="!isMobile"
      v-model="desktopConfigOpen"
      title="会话配置"
      direction="rtl"
      size="min(440px, 92vw)"
      class="session-config-drawer"
      :close-on-click-modal="false"
    >
      <div class="session-config-content">
        <el-alert
          title="客服角色、账号背景、店铺背景和行业能力会参与当前测试会话上下文；切换客服角色会开启新的独立测试对话，当前会话与分析记录会保留。"
          type="info"
          :closable="false"
          show-icon
        />
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="mt-5">
          <el-form-item label="客服角色" prop="merchantRoleId">
            <el-select v-model="form.merchantRoleId" class="w-full" filterable :disabled="creatingConversation || submitting || deletingSessions" @change="handleMerchantRoleChange">
              <el-option v-for="item in roles" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="行业能力">
            <el-select v-model="form.industryNodeId" class="w-full" clearable filterable placeholder="按当前业务场景选择行业">
              <el-option v-for="item in industryOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="店铺背景">
            <el-select v-model="form.storeProfileId" class="w-full" clearable filterable placeholder="选择店铺背景">
              <el-option v-for="item in enabledStoreProfiles" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="账号背景/人设">
            <el-select v-model="form.accountProfileId" class="w-full" clearable filterable placeholder="选择账号背景" @change="applyAccountBinding">
              <el-option v-for="item in selectableAccountProfiles" :key="item.id" :label="`${item.name}（${channelLabel(item.channel)}）`" :value="item.id" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button type="primary" class="w-full" @click="desktopConfigOpen = false">完成配置</el-button>
      </template>
    </el-drawer>

    <PageToolbar v-if="!isMobile" title="测试与优化" description="像客户一样连续发消息，检查客服回复是否准确、自然；测试不会向真实客户发送消息。">
      <template #actions>
        <el-select v-model="activeSessionId" class="w-[260px]" placeholder="选择历史测试对话" filterable @change="switchSession">
          <el-option v-for="item in sessions" :key="item.id" :label="`${item.title}（${item.messageCount}条消息 / ${item.analysisCount}次分析）`" :value="item.id" />
        </el-select>
        <el-button :disabled="!sessions.length || deletingSessions" @click="openSessionManager">管理会话</el-button>
        <el-button v-if="showAdvancedTools" :disabled="!result" @click="downloadDebugJson">导出完整调试 JSON</el-button>
        <el-button @click="showAdvancedTools = !showAdvancedTools">{{ showAdvancedTools ? '收起高级工具' : '高级工具' }}</el-button>
        <el-button type="primary" :loading="creatingConversation" @click="createNewConversation">开启新对话</el-button>
      </template>
    </PageToolbar>
    <el-alert v-if="!isMobile" title="安全测试模式：不会发送真实客户消息，也不会执行订单、退款等业务操作。" type="success" :closable="false" show-icon />

    <el-tabs v-if="!isMobile" v-model="activeTab" type="card" :class="{ 'single-test-tab': !showAdvancedTools }">
      <el-tab-pane label="对话测试" name="workbench">
        <div :class="['customer-service-tuning-grid', { 'simple-test-grid': !showAdvancedTools }]" class="pt-2">
          <section class="tuning-column tuning-left">
            <el-card shadow="never" class="h-full">
              <template #header>
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-semibold">{{ currentSession?.title || '真实多轮对话' }}</div>
                    <div class="truncate text-xs text-slate-400">{{ desktopContextSummary }}</div>
                  </div>
                  <el-button class="shrink-0" round plain @click="desktopConfigOpen = true">
                    <el-icon class="mr-1"><Setting /></el-icon>
                    会话配置
                  </el-button>
                </div>
              </template>
              <div class="flex h-full min-h-0 flex-col">
                <div ref="chatScrollRef" class="tuning-chat-history min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pr-1">
                  <div v-if="!chatMessages.length" class="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm leading-6 text-slate-500">
                    直接输入客户真实说法。系统会结合整段对话判断稳定意图、本轮事件、当前状态和弱信号，不会把每句话都单独创建成意图。
                  </div>
                  <div v-for="item in chatMessages" :key="item.id" class="flex" :class="item.role === 'CUSTOMER' ? 'justify-end' : 'justify-start'">
                    <div class="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7" :class="item.role === 'CUSTOMER' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-800 shadow-sm'">
                      <div class="mb-1 text-xs opacity-70">{{ assistantLabel(item) }}</div>
                      <div class="whitespace-pre-wrap">{{ item.content }}</div>
                    </div>
                  </div>
                  <div v-if="submitting" class="flex justify-start"><div class="rounded-2xl border bg-white px-4 py-3 text-sm text-slate-500">阿梨正在结合完整上下文判断动机、阶段和本轮策略…</div></div>
                </div>

                <div class="tuning-composer shrink-0 border-t pt-3">
                  <el-input v-model="form.message" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" maxlength="4000" show-word-limit placeholder="输入客户这一轮消息；Ctrl + Enter 发送并生成" @keydown.ctrl.enter.prevent="submit(true)" />
                  <div :class="['mt-3 grid gap-2', showAdvancedTools ? 'grid-cols-3' : 'grid-cols-2']">
                    <SampleFillButton label="填入测试样例" :has-content="Boolean(form.message.trim())" @fill="fillSimulationSample" />
                    <el-button v-if="showAdvancedTools" :loading="submitting" :disabled="!canCompile" @click="submit(false)">只分析本轮</el-button>
                    <el-button type="primary" :loading="submitting" :disabled="!canExecute" @click="submit(true)">发送并生成</el-button>
                  </div>
                  <el-collapse v-if="showAdvancedTools" class="mt-3">
                    <el-collapse-item title="高级上下文与手工覆盖" name="advanced">
                      <el-form label-position="top">
                        <el-form-item label="分类方式"><el-radio-group v-model="form.classificationMode"><el-radio-button value="AUTO">自动识别</el-radio-button><el-radio-button value="MANUAL">手工覆盖</el-radio-button></el-radio-group></el-form-item>
                        <div v-if="form.classificationMode === 'MANUAL'" class="grid gap-2 md:grid-cols-2"><el-form-item label="场景"><el-input v-model="form.scenario" /></el-form-item><el-form-item label="意图"><el-input v-model="form.intent" /></el-form-item><el-form-item label="风险"><el-select v-model="form.riskLevel" class="w-full"><el-option v-for="item in customerServiceRiskLevelOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div>
                        <el-form-item label="服务目标"><el-input v-model="form.serviceGoal" placeholder="通常留空，由理解与意图流程共同生成" /></el-form-item>
                        <el-form-item label="已验证事实 JSON"><el-input v-model="form.factsText" type="textarea" :rows="3" /></el-form-item>
                        <el-form-item label="已验证变量 JSON"><el-input v-model="form.variablesText" type="textarea" :rows="3" /></el-form-item>
                        <el-form-item label="客户状态 JSON"><el-input v-model="form.customerStateText" type="textarea" :rows="3" /></el-form-item>
                      </el-form>
                    </el-collapse-item>
                  </el-collapse>
                </div>
              </div>
            </el-card>
          </section>

          <section v-if="showAdvancedTools" class="tuning-column tuning-middle">
            <el-alert
              v-if="selectedAnalysis"
              class="mb-3"
              :type="isViewingLatestAnalysis ? 'success' : 'warning'"
              :title="isViewingLatestAnalysis ? `当前展示最新一轮：#${selectedAnalysis.sequenceNo}` : `当前正在查看历史轮次：#${selectedAnalysis.sequenceNo}（最新为 #${latestAnalysis?.sequenceNo}）`"
              :description="`${formatDate(selectedAnalysis.createdAt)} · 客户：${selectedAnalysis.latestMessage}`"
              :closable="false"
              show-icon
            />
            <SimulationContractPanel :result="result" :show-generation="false" :can-calibrate="false" :can-create-intent="canCreateIntent" :adding-intent-key="addingIntentKey" :added-intent-keys="addedIntentKeys" @add-intent="addRecognizedIntent" />
          </section>

          <section class="tuning-column tuning-right">
            <div class="space-y-4">
              <SimulationGenerationQualityPanel :generation="execution?.generation" :quality="execution?.quality" :can-calibrate="canCreateCalibration" @calibrate="openCalibration" />
              <template v-if="showAdvancedTools">
              <SimulationDialogueObligationPanel :obligation="result?.understanding.humanContext.dialogueObligation" />
              <SimulationLongHorizonStatePanel
                :state="result?.contract.generationContext.conversationState"
                :context-window="result?.contract.generationContext.contextWindow"
              />
              <el-card v-if="result" shadow="never">
                <template #header><span class="font-semibold">本轮具体聊天策略</span></template>
                <div class="space-y-3 text-sm leading-6">
                  <div><span class="text-slate-500">策略模式：</span><b>{{ result.understanding.humanContext.replyStrategy.mode }}</b></div>
                  <div><span class="text-slate-500">首要动作：</span>{{ result.understanding.humanContext.replyStrategy.primaryMove }}</div>
                  <div><span class="text-slate-500">价值目标：</span>{{ result.understanding.humanContext.replyStrategy.valueGoal }}</div>
                  <div><span class="text-slate-500">延续方式：</span>{{ result.understanding.humanContext.replyStrategy.continuation }}</div>
                  <div><span class="text-slate-500">策略依据：</span>{{ result.understanding.humanContext.replyStrategy.reason }}</div>
                </div>
              </el-card>
              <el-card shadow="never">
                <template #header><div class="flex items-center justify-between"><span class="font-semibold">历次分析记录</span><el-tag>{{ analyses.length }}</el-tag></div></template>
                <div v-if="analyses.length" class="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  <div v-for="item in analyses" :key="item.id" role="button" tabindex="0" class="w-full cursor-pointer rounded-lg border p-3 text-left transition hover:border-emerald-300" :class="selectedAnalysisId === item.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'" @click="selectAnalysis(item)" @keydown.enter.prevent="selectAnalysis(item)">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0"><b>#{{ item.sequenceNo }} · {{ item.runType === 'EXECUTE' ? '生成与质检' : '只分析' }}</b><div class="text-xs text-slate-400">{{ formatDate(item.createdAt) }}</div></div>
                      <el-button size="small" text type="primary" @click.stop="downloadAnalysisMarkdown(item)">导出分析明细 MD</el-button>
                    </div>
                    <div class="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{{ item.latestMessage }}</div>
                    <div class="mt-2 flex flex-wrap gap-1">
                      <el-tag v-if="item.payloadState === 'COMPACTED'" size="small" type="info">已压缩·仅保留摘要</el-tag>
                      <template v-else>
                        <el-tag size="small">{{ item.understanding.primaryScenario }}</el-tag><el-tag size="small" type="info">{{ item.understanding.humanContext.interactionStrategy.phase }}</el-tag><el-tag size="small" type="warning">{{ item.understanding.humanContext.replyStrategy.mode }}</el-tag>
                      </template>
                    </div>
                  </div>
                </div>
                <el-empty v-else description="每次分析完成后都会在这里保留一条不可覆盖的记录" :image-size="64" />
              </el-card>
              </template>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="showAdvancedTools" label="回归测试" name="regression">
        <RegressionTestPanel
          :merchant-role-id="form.merchantRoleId"
          :industry-node-id="form.industryNodeId || undefined"
          :can-execute="canExecute"
          :strategy-version-ids="activeStrategyDraftVersionId ? [activeStrategyDraftVersionId] : []"
          @completed="handleStrategyDraftRegressionCompleted"
        />
      </el-tab-pane>

      <el-tab-pane v-if="showAdvancedTools" label="意图基准" name="intent-benchmark">
        <IntentBenchmarkPanel />
      </el-tab-pane>

      <el-tab-pane v-if="showAdvancedTools" label="真人感盲评" name="humanity-benchmark">
        <HumanityBlindReviewPanel />
      </el-tab-pane>

      <el-tab-pane v-if="showAdvancedTools" label="校准记录" name="records">
        <div v-if="canReadCalibration" class="space-y-4 pt-2">
          <CalibrationRecordsPanel
            ref="recordsRef"
            :roles="roles"
            :can-analyze="canAnalyzeCalibration"
            :can-update="canUpdateCalibration"
            :can-publish="canPublishAsset"
            :regression-evidence="lastStrategyDraftRegression"
            @start-strategy-draft-regression="startStrategyDraftRegression"
          />
          <CalibrationProfilesPanel ref="profilesRef" :roles="roles" :can-update="canUpdateCalibration" />
        </div>
        <el-alert v-else class="mt-2" title="当前账号没有查看校准记录的权限" type="warning" :closable="false" show-icon />
      </el-tab-pane>

      <el-tab-pane v-if="showAdvancedTools && canReadCalibration" label="效果观察" name="effects">
        <EffectObservationPanel
          :accounts="accountProfiles"
          :can-read="canReadCalibration"
          :can-rollback="canPublishAsset"
          :can-update-knowledge="canUpdateKnowledge"
          @open-knowledge="$router.push('/customer-service/knowledge')"
        />
      </el-tab-pane>

      <el-tab-pane v-if="showAdvancedTools" label="数据治理" name="data-governance">
        <DataGovernancePanel v-if="canReadCalibration" :can-update="canUpdateCalibration" />
        <el-alert v-else class="mt-2" title="当前账号没有查看数据治理信息的权限" type="warning" :closable="false" show-icon />
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="sessionManagerVisible"
      title="管理测试对话"
      :width="isMobile ? '100%' : '760px'"
      :fullscreen="isMobile"
      :close-on-click-modal="!deletingSessions"
      :close-on-press-escape="!deletingSessions"
      destroy-on-close
    >
      <el-alert
        class="mb-4"
        title="删除会真正清理该测试会话的消息、分析结果和测试 Reply Trace；已经应用生效的校准资产不会被删除。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-table
        :data="sessions"
        max-height="520"
        row-key="id"
        @selection-change="handleSessionSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="会话" min-width="260">
          <template #default="{ row }">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ row.title }}</span>
                <el-tag v-if="row.id === activeSessionId" size="small" type="success">当前</el-tag>
              </div>
              <div class="mt-1 text-xs text-slate-400">{{ row.messageCount }} 条消息 · {{ row.analysisCount }} 次分析 · {{ formatDate(row.updatedAt) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="deletingSessions || submitting" @click="renameSession(row)">重命名</el-button>
            <el-button link type="danger" :disabled="deletingSessions || submitting" @click="deleteSingleSession(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-slate-500">已选择 {{ selectedSessionIds.length }} 个会话</span>
          <div class="flex gap-2">
            <el-button :disabled="deletingSessions" @click="sessionManagerVisible = false">关闭</el-button>
            <el-button
              type="danger"
              :loading="deletingSessions"
              :disabled="!selectedSessionIds.length || submitting"
              @click="deleteSelectedSessions"
            >
              删除选中{{ selectedSessionIds.length ? `（${selectedSessionIds.length}）` : '' }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <CalibrationFeedbackDialog v-model="calibrationDialogVisible" :base-payload="calibrationBasePayload" :can-analyze="canAnalyzeCalibration" :can-update="canUpdateCalibration" :mobile="isMobile" @changed="handleCalibrationChanged" @reply-applied="handleCurrentReplyApplied" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type InputInstance } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import { listCustomerServiceIndustryNodes } from '@/modules/customer-service/api/industries.api';
import { listCustomerServiceMerchantRoles } from '@/modules/customer-service/api/merchant-roles.api';
import { listCustomerServiceQualityRules } from '@/modules/customer-service/api/quality-rules.api';
import { listCustomerServiceAccountProfiles, listCustomerServiceStoreProfiles } from '@/modules/customer-service/api/context-profiles.api';
import { compileCustomerServiceSimulation, executeCustomerServiceSimulation } from '@/modules/customer-service/api/simulation.api';
import { createCustomerServiceIntentFromRecognition, convertCustomerServiceIntentCandidate } from '@/modules/customer-service/api/intent-definitions.api';
import { acceptCustomerServiceTuningAnalysis, appendCustomerServiceAssistantSegment, createCustomerServiceTuningSession, deleteCustomerServiceTuningSession, deleteCustomerServiceTuningSessions, getCustomerServiceTuningSession, listCustomerServiceTuningSessions, updateCustomerServiceTuningSession } from '@/modules/customer-service/api/tuning-sessions.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import { customerServiceRiskLevelOptions } from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceCalibrationCreatePayload, CustomerServiceCalibrationCurrentReplyApplication, CustomerServiceCalibrationRecord, CustomerServiceStrategyDraftRegressionEvidence } from '@/modules/customer-service/types/calibrations.types';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type { CustomerServiceAccountProfile, CustomerServiceStoreProfile } from '@/modules/customer-service/types/context-profiles.types';
import type { CustomerServiceMessageDeliveryPlan, CustomerServiceRecognizedItem, CustomerServiceSimulationCompileResult, CustomerServiceSimulationExecutionResult, CustomerServiceSimulationRiskLevel } from '@/modules/customer-service/types/simulation.types';
import type { CustomerServiceTuningAnalysis, CustomerServiceTuningSessionDeleteResult, CustomerServiceTuningSessionDetails, CustomerServiceTuningSessionSummary } from '@/modules/customer-service/types/tuning-sessions.types';
import CalibrationFeedbackDialog from './components/CalibrationFeedbackDialog.vue';
import RegressionTestPanel from './components/RegressionTestPanel.vue';
import IntentBenchmarkPanel from './components/IntentBenchmarkPanel.vue';
import HumanityBlindReviewPanel from './components/HumanityBlindReviewPanel.vue';
import CalibrationProfilesPanel from './components/CalibrationProfilesPanel.vue';
import CalibrationRecordsPanel from './components/CalibrationRecordsPanel.vue';
import SimulationContractPanel from './components/SimulationContractPanel.vue';
import SimulationGenerationQualityPanel from './components/SimulationGenerationQualityPanel.vue';
import SimulationDialogueObligationPanel from './components/SimulationDialogueObligationPanel.vue';
import SimulationLongHorizonStatePanel from './components/SimulationLongHorizonStatePanel.vue';
import DataGovernancePanel from './components/DataGovernancePanel.vue';
import EffectObservationPanel from '@/views/customer-service/context-profiles/components/EffectObservationPanel.vue';
import { buildCustomerServiceAnalysisFilename, buildCustomerServiceAnalysisMarkdown } from './utils/analysis-markdown-export';

type CalibrationBasePayload = Omit<CustomerServiceCalibrationCreatePayload, 'problemTypes' | 'improvementMode' | 'problemDescription' | 'userSuggestion'>;
type ChatMessage = { id: string; role: 'CUSTOMER' | 'ASSISTANT'; content: string; replyGroupId?: string; segmentIndex?: number; segmentCount?: number };
const ACTIVE_SESSION_KEY = 'customer-service:reply-tuning:active-session';
const DRAFT_KEY_PREFIX = 'customer-service:reply-tuning:draft:';
const ANALYSIS_KEY_PREFIX = 'customer-service:reply-tuning:selected-analysis:';

const { has } = useCustomerServicePermission();
const formRef = ref<FormInstance>();
const chatScrollRef = ref<HTMLElement | null>(null);
const mobileChatScrollRef = ref<HTMLElement | null>(null);
const mobileMessageInputRef = ref<InputInstance | null>(null);
const recordsRef = ref<{ reload: () => Promise<void> } | null>(null);
const profilesRef = ref<{ reload: () => Promise<void> } | null>(null);
const mobileRecordsRef = ref<{ reload: () => Promise<void> } | null>(null);
const mobileProfilesRef = ref<{ reload: () => Promise<void> } | null>(null);
const activeTab = ref('workbench');
const showAdvancedTools = ref(false);
const submitting = ref(false);
let deliveryToken = 0;
const roles = ref<CustomerServiceMerchantRole[]>([]);
const industries = ref<CustomerServiceIndustryNode[]>([]);
const storeProfiles = ref<CustomerServiceStoreProfile[]>([]);
const accountProfiles = ref<CustomerServiceAccountProfile[]>([]);
const qualityRuleCount = ref(0);
const result = ref<CustomerServiceSimulationCompileResult | CustomerServiceSimulationExecutionResult | null>(null);
const chatMessages = ref<ChatMessage[]>([]);
const sessions = ref<CustomerServiceTuningSessionSummary[]>([]);
const currentSession = ref<CustomerServiceTuningSessionDetails | null>(null);
const activeSessionId = ref('');
const analyses = ref<CustomerServiceTuningAnalysis[]>([]);
const selectedAnalysisId = ref('');
const calibrationDialogVisible = ref(false);
const calibrationBasePayload = ref<CalibrationBasePayload | null>(null);
const activeStrategyDraftVersionId = ref('');
const lastStrategyDraftRegression = ref<CustomerServiceStrategyDraftRegressionEvidence | null>(null);
const addingIntentKey = ref('');
const addedIntentKeys = ref<string[]>([]);
const isMobile = ref(false);
const mobileDrawerOpen = ref(false);
const mobileDetailOpen = ref(false);
const mobileDrawerTab = ref('settings');
const mobilePendingAnalysisId = ref('');
const mobileAccepting = ref(false);
const desktopConfigOpen = ref(false);
const creatingConversation = ref(false);
const sessionManagerVisible = ref(false);
const selectedSessionIds = ref<string[]>([]);
const deletingSessions = ref(false);
let mobileMediaQuery: MediaQueryList | null = null;
const syncMobileLayout = () => {
  isMobile.value = Boolean(mobileMediaQuery?.matches);
  document.body.classList.toggle('customer-service-mobile-mode', isMobile.value);
};
const form = reactive({
  merchantRoleId: '', storeProfileId: '', accountProfileId: '', industryNodeId: '', classificationMode: 'AUTO' as 'AUTO' | 'MANUAL', scenario: '', intent: '',
  riskLevel: 'LOW' as CustomerServiceSimulationRiskLevel, serviceGoal: '', message: '', customerStateText: '{}', variablesText: '{}', factsText: '[]',
  hveExecutionLane: 'HVE3_CANDIDATE' as const
});
const rules: FormRules = { merchantRoleId: [{ required: true, message: '请选择客服角色', trigger: 'change' }], message: [{ required: true, message: '请输入客户消息', trigger: 'blur' }] };

function fillSimulationSample() {
  form.message = '快递三天没有更新了，我有点着急，能帮我看看现在是什么情况吗？';
}
const canCompile = computed(() => has('customer-service:simulation:compile'));
const canExecute = computed(() => has('customer-service:simulation:execute'));
const canReadCalibration = computed(() => has('customer-service:calibration:read'));
const canCreateCalibration = computed(() => has('customer-service:calibration:create'));
const canCreateIntent = computed(() => has('customer-service:response-rule:create'));
const canAnalyzeCalibration = computed(() => has('customer-service:calibration:analyze'));
const canUpdateCalibration = computed(() => has('customer-service:calibration:update'));
const canPublishAsset = computed(() => has('customer-service:asset:publish'));
const canUpdateKnowledge = computed(() => has('customer-service:context-profile:update'));
const industryOptions = computed(() => buildIndustryOptions(industries.value));
const enabledStoreProfiles = computed(() => storeProfiles.value.filter((item) => item.status === 'ENABLED'));
const selectableAccountProfiles = computed(() => accountProfiles.value.filter((item) => (
  item.status === 'ENABLED'
  && (!form.merchantRoleId || !item.merchantRoleId || item.merchantRoleId === form.merchantRoleId)
  && (!form.storeProfileId || !item.storeProfileId || item.storeProfileId === form.storeProfileId)
)));
const execution = computed(() => result.value && 'generation' in result.value ? result.value : null);
const mobilePendingCandidate = computed(() => mobilePendingAnalysisId.value && execution.value?.analysisRecord?.id === mobilePendingAnalysisId.value ? execution.value.generation.draft : null);
const selectedAccountName = computed(() => accountProfiles.value.find((item) => item.id === form.accountProfileId)?.name || '未选择账号背景');
const desktopContextSummary = computed(() => {
  const role = roles.value.find((item) => item.id === form.merchantRoleId)?.name || '未选角色';
  const account = accountProfiles.value.find((item) => item.id === form.accountProfileId)?.name;
  const store = storeProfiles.value.find((item) => item.id === form.storeProfileId)?.name;
  const industry = industryOptions.value.find((item) => item.value === form.industryNodeId)?.label;
  return [role, account || store, industry].filter(Boolean).join(' · ');
});
const selectedAnalysis = computed(() => analyses.value.find((item) => item.id === selectedAnalysisId.value) || null);
const latestAnalysis = computed(() => analyses.value[0] || null);
const isViewingLatestAnalysis = computed(() => Boolean(selectedAnalysis.value && selectedAnalysis.value.id === latestAnalysis.value?.id));

watch(() => form.message, (value) => {
  const sessionId = currentSession.value?.id || activeSessionId.value;
  if (!sessionId) return;
  localStorage.setItem(draftKey(sessionId), value);
});

onMounted(() => {
  mobileMediaQuery = window.matchMedia('(max-width: 767px)');
  syncMobileLayout();
  mobileMediaQuery.addEventListener('change', syncMobileLayout);
  void initializePage();
});
onBeforeUnmount(() => {
  cancelPendingDelivery();
  mobileMediaQuery?.removeEventListener('change', syncMobileLayout);
  document.body.classList.remove('customer-service-mobile-mode');
  mobileMediaQuery = null;
});
onActivated(() => { if (mobileMediaQuery) syncMobileLayout(); });
onDeactivated(() => { document.body.classList.remove('customer-service-mobile-mode'); });

function startStrategyDraftRegression(versionId: string) {
  showAdvancedTools.value = true;
  activeStrategyDraftVersionId.value = versionId;
  lastStrategyDraftRegression.value = null;
  activeTab.value = 'regression';
  if (isMobile.value) mobileDrawerTab.value = 'regression';
  ElMessage.info('已切换到回归测试；本次全部用例会读取该未发布策略草稿。');
}

function handleStrategyDraftRegressionCompleted(evidence: CustomerServiceStrategyDraftRegressionEvidence) {
  showAdvancedTools.value = true;
  lastStrategyDraftRegression.value = evidence;
  activeTab.value = 'records';
  if (isMobile.value) mobileDrawerTab.value = 'calibration';
  ElMessage.success('策略草稿回归完成，已返回校准记录页，请核对并记录结果。');
}

async function initializePage() {
  const [roleResult, industryResult, qualityResult, storeResult, accountResult] = await Promise.all([
    listCustomerServiceMerchantRoles({ keyword: '', status: 'ENABLED', page: 1, pageSize: 100 }),
    listCustomerServiceIndustryNodes(),
    listCustomerServiceQualityRules({ status: 'ENABLED', page: 1, pageSize: 500 }),
    listCustomerServiceStoreProfiles({ page: 1, pageSize: 500 }),
    listCustomerServiceAccountProfiles({ page: 1, pageSize: 500 }),
  ]);
  roles.value = roleResult.items;
  const ali = roles.value.find((item) => item.code === 'ali');
  form.merchantRoleId = ali?.id || roles.value[0]?.id || '';
  industries.value = industryResult.filter((item) => item.status !== 'ARCHIVED');
  storeProfiles.value = storeResult.items;
  accountProfiles.value = accountResult.items;
  qualityRuleCount.value = qualityResult.total;
  await refreshSessions();
  const saved = localStorage.getItem(ACTIVE_SESSION_KEY) || '';
  const target = sessions.value.find((item) => item.id === saved)?.id || sessions.value[0]?.id;
  if (target) await loadSession(target);
  else if (form.merchantRoleId) await createNewConversation(false);
}

async function refreshSessions() {
  const page = await listCustomerServiceTuningSessions({ status: 'ACTIVE', page: 1, pageSize: 100 });
  sessions.value = page.items;
}

function openSessionManager() {
  selectedSessionIds.value = [];
  sessionManagerVisible.value = true;
}

function handleSessionSelectionChange(rows: CustomerServiceTuningSessionSummary[]) {
  selectedSessionIds.value = rows.map((item) => item.id);
}

async function renameSession(session: CustomerServiceTuningSessionSummary) {
  if (submitting.value || deletingSessions.value) return;
  let nextTitle = '';
  try {
    const result = await ElMessageBox.prompt(
      '修改后会立即同步到当前会话标题和历史会话列表，不影响消息、分析或校准数据。',
      '重命名测试对话',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: session.title,
        inputPlaceholder: '请输入会话名称',
        inputValidator: (value) => {
          const title = String(value || '').trim();
          if (!title) return '会话名称不能为空';
          if (title.length > 160) return '会话名称不能超过 160 个字符';
          return true;
        },
      },
    );
    nextTitle = String(result.value || '').trim();
  } catch { return; }
  if (!nextTitle || nextTitle === session.title) return;

  const updated = await updateCustomerServiceTuningSession(session.id, { title: nextTitle });
  const summaryIndex = sessions.value.findIndex((item) => item.id === session.id);
  if (summaryIndex >= 0) {
    sessions.value[summaryIndex] = { ...sessions.value[summaryIndex], ...updated, title: updated.title };
  }
  if (currentSession.value?.id === session.id) {
    currentSession.value = { ...currentSession.value, ...updated };
  }
  ElMessage.success('会话名称已更新');
}

async function deleteSingleSession(session: CustomerServiceTuningSessionSummary) {
  if (submitting.value || deletingSessions.value) return;
  try {
    await ElMessageBox.confirm(
      `确定永久删除“${session.title}”吗？该会话的 ${session.messageCount} 条消息、${session.analysisCount} 次分析和测试 Reply Trace 会一起清理；已经应用生效的校准资产会保留。`,
      '删除测试对话',
      { type: 'warning', confirmButtonText: '永久删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    );
  } catch { return; }
  await performSessionDeletion([session.id], true);
}

async function deleteSelectedSessions() {
  const ids = [...selectedSessionIds.value];
  if (!ids.length || submitting.value || deletingSessions.value) return;
  const selected = sessions.value.filter((item) => ids.includes(item.id));
  const messageCount = selected.reduce((sum, item) => sum + item.messageCount, 0);
  const analysisCount = selected.reduce((sum, item) => sum + item.analysisCount, 0);
  try {
    await ElMessageBox.confirm(
      `确定永久删除选中的 ${ids.length} 个测试对话吗？预计会清理 ${messageCount} 条消息、${analysisCount} 次分析及对应测试 Reply Trace；已经应用生效的校准资产会保留。`,
      '批量删除测试对话',
      { type: 'warning', confirmButtonText: `永久删除 ${ids.length} 个`, cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    );
  } catch { return; }
  await performSessionDeletion(ids, false);
}

async function performSessionDeletion(ids: string[], single: boolean) {
  const activeBefore = activeSessionId.value;
  if (ids.includes(activeBefore)) cancelPendingDelivery();
  deletingSessions.value = true;
  try {
    const deletion = single
      ? await deleteCustomerServiceTuningSession(ids[0])
      : await deleteCustomerServiceTuningSessions(ids);
    await applySessionDeletion(deletion, activeBefore);
    const details = [
      deletion.deletedMessageCount ? `${deletion.deletedMessageCount} 条消息` : '',
      deletion.deletedAnalysisCount ? `${deletion.deletedAnalysisCount} 次分析` : '',
      deletion.deletedReplyTraceCount ? `${deletion.deletedReplyTraceCount} 条测试 Trace` : '',
    ].filter(Boolean).join('、');
    ElMessage.success(`已删除 ${deletion.deletedCount} 个测试对话${details ? `，清理 ${details}` : ''}`);
  } finally {
    deletingSessions.value = false;
  }
}

async function applySessionDeletion(deletion: CustomerServiceTuningSessionDeleteResult, activeBefore: string) {
  const deleted = new Set(deletion.deletedIds);
  for (const id of deleted) {
    localStorage.removeItem(draftKey(id));
    localStorage.removeItem(analysisKey(id));
  }

  const activeDeleted = Boolean(activeBefore && deleted.has(activeBefore));
  if (activeDeleted) {
    currentSession.value = null;
    activeSessionId.value = '';
    chatMessages.value = [];
    analyses.value = [];
    selectedAnalysisId.value = '';
    result.value = null;
    mobilePendingAnalysisId.value = '';
    form.message = '';
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }

  await refreshSessions();
  selectedSessionIds.value = selectedSessionIds.value.filter((id) => !deleted.has(id));
  if (activeDeleted) {
    const nextSessionId = sessions.value[0]?.id || '';
    if (nextSessionId) await loadSession(nextSessionId);
  }
}

async function handleMerchantRoleChange(nextRoleId: string) {
  const session = currentSession.value;
  if (!nextRoleId || !session?.merchantRoleId || nextRoleId === session.merchantRoleId) return;

  const previousRoleId = session.merchantRoleId;
  const nextRole = roles.value.find((item) => item.id === nextRoleId);
  const previousAccountProfileId = form.accountProfileId;
  const currentAccount = accountProfiles.value.find((item) => item.id === previousAccountProfileId);
  const accountNeedsReset = Boolean(currentAccount?.merchantRoleId && currentAccount.merchantRoleId !== nextRoleId);

  try {
    await ElMessageBox.confirm(
      `切换到“${nextRole?.name || '所选角色'}”需要开启新的独立测试对话，避免不同客服角色共享历史上下文。当前会话、消息和分析记录都会保留。`,
      '切换客服角色',
      {
        type: 'info',
        confirmButtonText: '使用此角色开启新对话',
        cancelButtonText: '取消',
      },
    );
  } catch {
    form.merchantRoleId = previousRoleId;
    return;
  }

  if (accountNeedsReset) form.accountProfileId = '';
  try {
    await createNewConversation(false);
    if (accountNeedsReset) {
      ElMessage.info('原账号背景绑定了其他客服角色，已在新会话中取消该账号背景，请按需重新选择兼容账号。');
    }
  } catch {
    form.merchantRoleId = previousRoleId;
    form.accountProfileId = previousAccountProfileId;
  }
}

async function createNewConversation(confirm = true) {
  if (creatingConversation.value) return;
  cancelPendingDelivery();
  mobilePendingAnalysisId.value = '';
  if (!form.merchantRoleId) return;

  let sessionTitle = '新会话';
  if (confirm) {
    try {
      const result = await ElMessageBox.prompt(
        chatMessages.value.length
          ? '新会话将使用独立上下文，当前会话与分析记录仍会保留，可随时从历史会话返回。'
          : '为这次测试对话取一个名称，之后仍可在“管理会话”中随时修改。',
        '开启新对话',
        {
          type: 'info',
          confirmButtonText: '创建',
          cancelButtonText: '取消',
          inputValue: '新会话',
          inputPlaceholder: '请输入会话名称',
          inputValidator: (value) => {
            const title = String(value || '').trim();
            if (!title) return '会话名称不能为空';
            if (title.length > 160) return '会话名称不能超过 160 个字符';
            return true;
          },
        },
      );
      sessionTitle = String(result.value || '').trim();
    } catch { return; }
  }

  creatingConversation.value = true;
  try {
    const session = await createCustomerServiceTuningSession({
      merchantRoleId: form.merchantRoleId,
      accountProfileId: form.accountProfileId || undefined,
      storeProfileId: form.storeProfileId || undefined,
      industryNodeId: form.industryNodeId || undefined,
      title: sessionTitle,
    });
    await refreshSessions();
    await loadSession(session.id);
    form.message = '';
    addedIntentKeys.value = [];
    mobileDrawerOpen.value = false;
    mobileDetailOpen.value = false;
    mobileDrawerTab.value = 'settings';
    activeTab.value = 'workbench';
    await nextTick();
    mobileMessageInputRef.value?.focus();
    ElMessage.success('新会话已建立，可开始输入客户消息');
  } finally {
    creatingConversation.value = false;
  }
}

async function switchSession(value: string) {
  cancelPendingDelivery();
  mobilePendingAnalysisId.value = '';
  if (value) await loadSession(value);
}

async function loadSession(id: string, options: { preferredAnalysisId?: string; selectLatest?: boolean } = {}) {
  persistCurrentDraft();
  const details = await getCustomerServiceTuningSession(id);
  currentSession.value = details;
  activeSessionId.value = details.id;
  localStorage.setItem(ACTIVE_SESSION_KEY, details.id);
  form.merchantRoleId = details.merchantRoleId;
  form.accountProfileId = details.accountProfileId || '';
  form.storeProfileId = details.accountProfile?.storeProfileId || String(details.contextSnapshot?.storeProfileId || '');
  form.industryNodeId = details.industryNodeId || '';
  restoreAdvancedContext(details.contextSnapshot);
  chatMessages.value = details.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, ...parseSegmentMeta(item.clientMessageId) }));
  form.message = localStorage.getItem(draftKey(details.id)) || '';
  analyses.value = [...details.analyses].sort((a, b) => b.sequenceNo - a.sequenceNo);
  const savedAnalysisId = localStorage.getItem(analysisKey(details.id)) || '';
  const desiredAnalysisId = options.preferredAnalysisId || (options.selectLatest ? '' : savedAnalysisId);
  const selected = analyses.value.find((item) => item.id === desiredAnalysisId) || analyses.value[0];
  if (selected) selectAnalysis(selected);
  else { result.value = null; selectedAnalysisId.value = ''; }
  await scrollChat();
}

function applyAccountBinding(value: string) {
  const account = accountProfiles.value.find((item) => item.id === value);
  if (!account) return;
  if (account.storeProfileId) form.storeProfileId = account.storeProfileId;
  if (account.merchantRoleId) form.merchantRoleId = account.merchantRoleId;
  if (account.industryNodeId) form.industryNodeId = account.industryNodeId;
}

async function acceptMobileCandidate() {
  const analysisId = mobilePendingAnalysisId.value;
  if (!analysisId) return;
  mobileAccepting.value = true;
  try {
    await acceptCustomerServiceTuningAnalysis(analysisId, selectedAnalysis.value?.contentHash);
    mobilePendingAnalysisId.value = '';
    await refreshSessions();
    await loadSession(activeSessionId.value, { preferredAnalysisId: analysisId });
    ElMessage.success('候选回复已接受并发送');
  } finally {
    mobileAccepting.value = false;
    await scrollChat();
  }
}

function rejectMobileCandidate() {
  if (!canCreateCalibration.value) {
    ElMessage.warning('当前账号没有创建校准记录的权限');
    return;
  }
  openCalibration();
}

async function submit(execute: boolean, deliveryMode: 'AUTO' | 'REVIEW' = 'AUTO') {
  if (execute && deliveryMode === 'REVIEW' && mobilePendingCandidate.value) {
    ElMessage.warning('请先接受当前候选，或完成/关闭校准后再决定是否发送');
    return;
  }
  await formRef.value?.validate();
  const message = form.message.trim();
  if (!message || !activeSessionId.value) return;
  cancelPendingDelivery();
  const customerState = parseObject(form.customerStateText, '客户状态');
  const variables = parseObject(form.variablesText, '已验证变量');
  const facts = parseArray(form.factsText, '已验证事实');
  if (!customerState || !variables || !facts) return;
  const sessionId = activeSessionId.value;
  const clientMessageId = createId();
  const payload = {
    tuningSessionId: sessionId,
    clientMessageId,
    merchantRoleId: form.merchantRoleId,
    storeProfileId: form.storeProfileId || undefined,
    accountProfileId: form.accountProfileId || undefined,
    message,
    industryNodeId: form.industryNodeId || undefined,
    scenario: form.classificationMode === 'MANUAL' ? form.scenario || undefined : undefined,
    intent: form.classificationMode === 'MANUAL' ? form.intent || undefined : undefined,
    riskLevel: form.classificationMode === 'MANUAL' ? form.riskLevel : undefined,
    serviceGoal: form.serviceGoal || undefined,
    customerState,
    variables,
    facts,
    hveExecutionLane: form.hveExecutionLane
  };
  submitting.value = true;
  try {
    const response = execute
      ? await executeCustomerServiceSimulation({ ...payload, generateReply: true, allowRewrite: true })
      : await compileCustomerServiceSimulation(payload);
    result.value = response;
    if (execute) {
      form.message = '';
      localStorage.removeItem(draftKey(sessionId));
    }
    await refreshSessions();
    await loadSession(sessionId, { preferredAnalysisId: response.analysisRecord?.id, selectLatest: true });
    mobilePendingAnalysisId.value = execute && deliveryMode === 'REVIEW'
      ? response.analysisRecord?.id || ''
      : '';

    if (
      execute
      && deliveryMode === 'AUTO'
      && 'generation' in response
      && response.generation.candidateSafetyStatus !== 'BLOCKED'
      && response.generation.deliveryPlan?.segments.length
    ) {
      const plan = response.generation.deliveryPlan;
      const replyGroupId = `${response.analysisRecord?.id || createId()}:reply`;
      const token = ++deliveryToken;
      await sleep(Math.max(0, plan.segments[0]?.delayBeforeMs || 0));
      await deliverAssistantSegment(sessionId, replyGroupId, plan, 0, token, clientMessageId);
      if (plan.segments.length > 1) void deliverRemainingSegments(sessionId, replyGroupId, plan, 1, token, clientMessageId);
    }
    ElMessage.success(execute
      ? deliveryMode === 'REVIEW' ? '候选已生成，请接受发送或标记不满意进行校准' : '本轮回复生成、质检和分析记录已保存'
      : '本轮完整上下文分析记录已保存');
  } finally {
    submitting.value = false;
    await scrollChat();
  }
}

function cancelPendingDelivery() {
  deliveryToken += 1;
}

async function deliverAssistantSegment(
  sessionId: string,
  replyGroupId: string,
  plan: CustomerServiceMessageDeliveryPlan,
  segmentIndex: number,
  token: number,
  anchorClientMessageId: string,
) {
  if (token !== deliveryToken || activeSessionId.value !== sessionId) return false;
  const segment = plan.segments[segmentIndex];
  if (!segment) return false;
  const message = await appendCustomerServiceAssistantSegment(sessionId, {
    replyGroupId,
    segmentIndex: segment.index,
    content: segment.content,
    anchorClientMessageId,
    clientMessageId: `${replyGroupId}:segment:${segment.index}:of:${plan.segments.length}`,
  });
  if (token !== deliveryToken || activeSessionId.value !== sessionId) return false;
  if (!chatMessages.value.some((item) => item.id === message.id)) {
    chatMessages.value.push({
      id: message.id,
      role: 'ASSISTANT',
      content: message.content,
      replyGroupId,
      segmentIndex: segment.index,
      segmentCount: plan.segments.length,
    });
  }
  await scrollChat();
  return true;
}

async function deliverRemainingSegments(
  sessionId: string,
  replyGroupId: string,
  plan: CustomerServiceMessageDeliveryPlan,
  startIndex: number,
  token: number,
  anchorClientMessageId: string,
) {
  for (let index = startIndex; index < plan.segments.length; index += 1) {
    const segment = plan.segments[index];
    await sleep(segment.delayBeforeMs);
    if (token !== deliveryToken || activeSessionId.value !== sessionId) return;
    let delivered = false;
    try {
      delivered = await deliverAssistantSegment(sessionId, replyGroupId, plan, index, token, anchorClientMessageId);
    } catch {
      return;
    }
    if (!delivered) return;
  }
  await refreshSessions();
}

function selectAnalysis(item: CustomerServiceTuningAnalysis) {
  selectedAnalysisId.value = item.id;
  const sessionId = currentSession.value?.id || activeSessionId.value;
  if (sessionId) localStorage.setItem(analysisKey(sessionId), item.id);
  if (item.payloadState === 'COMPACTED' || !item.understanding?.humanContext || !item.runtimeContract?.orchestrationPlan) {
    result.value = null;
    ElMessage.info('该历史分析的大型运行载荷已按保留策略压缩；摘要、哈希、来源和校准结论仍然保留');
    return;
  }
  const base = {
    compiledAt: item.createdAt,
    contractHash: item.runtimeContract.provenance?.configurationHash || item.id,
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    understanding: item.understanding,
    summary: item.summary as CustomerServiceSimulationCompileResult['summary'],
    contract: item.runtimeContract,
    analysisRecord: { id: item.id, sequenceNo: item.sequenceNo, runType: item.runType, createdAt: item.createdAt },
  };
  result.value = item.runType === 'EXECUTE' && item.generation && item.quality
    ? { ...base, executedAt: item.createdAt, generation: item.generation, quality: item.quality }
    : base;
}

function buildDebugPayload() {
  return {
    exportVersion: 'customer-service-v5.14-debug',
    exportedAt: new Date().toISOString(),
    session: currentSession.value ? {
      id: currentSession.value.id,
      title: currentSession.value.title,
      status: currentSession.value.status,
      messageCount: currentSession.value.messageCount,
      analysisCount: currentSession.value.analysisCount,
      updatedAt: currentSession.value.updatedAt,
    } : null,
    selectedAnalysisId: selectedAnalysisId.value || null,
    messages: chatMessages.value.map((item) => ({ role: item.role, content: item.content })),
    result: result.value,
  };
}

function downloadDebugJson() {
  if (!result.value) return;
  const payload = JSON.stringify(buildDebugPayload(), null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTitle = String(currentSession.value?.title || 'customer-service-debug').replace(/[\/:*?"<>|]+/g, '-').slice(0, 48);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `${safeTitle}-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  ElMessage.success('完整调试 JSON 已导出，可直接发给我分析');
}

function downloadAnalysisMarkdown(item: CustomerServiceTuningAnalysis) {
  const markdown = buildCustomerServiceAnalysisMarkdown({ session: currentSession.value, analysis: item });
  downloadTextFile(markdown, buildCustomerServiceAnalysisFilename(currentSession.value, item), 'text/markdown;charset=utf-8');
  ElMessage.success(`第 ${item.sequenceNo} 条分析明细 MD 已导出`);
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF', content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function addRecognizedIntent(item: CustomerServiceRecognizedItem) {
  const current = result.value;
  if (!current || item.type !== 'INTENT' || !item.eligibleForIntentLibrary) return;
  if (item.matchStatus === 'EXACT') { ElMessage.info('该识别结果已经精确关联正式意图'); return; }
  addingIntentKey.value = item.recognitionId;
  try {
    const created = item.candidate?.id
      ? (await convertCustomerServiceIntentCandidate(item.candidate.id)).definition
      : await createCustomerServiceIntentFromRecognition({
          recognizedItem: item as unknown as Record<string, unknown>,
          message: current.contract.groundedContext.latestCustomerMessage,
          conversationHistory: current.contract.generationContext.conversationHistory,
          merchantRoleId: current.contract.identity.merchantRole.id,
          industryNodeId: current.contract.classification.industry?.id || undefined,
          industryCode: current.contract.classification.industry?.code || undefined,
          understanding: current.understanding as unknown as Record<string, unknown>,
          status: 'DRAFT',
        });
    addedIntentKeys.value = [...new Set([...addedIntentKeys.value, item.recognitionId])];
    ElMessage.success(`已将“${created.name}”转为待审核意图草稿`);
  } finally { addingIntentKey.value = ''; }
}

function openCalibration() {
  cancelPendingDelivery();
  const current = execution.value;
  if (!current?.generation.draft) { ElMessage.warning('本次没有可标记的候选回复'); return; }
  const lastCustomer = current.contract.groundedContext.latestCustomerMessage;
  const sourceAnalysisId = current.analysisRecord?.id;
  calibrationBasePayload.value = {
    sourceAnalysisId,
    merchantRoleId: current.contract.identity.merchantRole.id,
    industryNodeId: current.contract.classification.industry?.id || undefined,
    customerMessage: lastCustomer,
    originalReply: current.generation.draft,
    scenario: current.understanding.primaryScenario,
    intent: current.understanding.primaryIntent,
    riskLevel: current.understanding.riskLevel,
    generationModel: current.generation.model || undefined,
    configurationHash: current.contractHash,
    // The analysis record already owns the authoritative runtime evidence. Only fall back to
    // the legacy inline snapshot when analysis persistence was unavailable for this turn.
    ...(!sourceAnalysisId ? {
      understanding: current.understanding as unknown as Record<string, unknown>,
      runtimeContract: current.contract as unknown as Record<string, unknown>,
      qualityReport: current.quality as unknown as Record<string, unknown>,
      sourceSnapshot: {
        tuningSessionId: activeSessionId.value,
        analysisRecordId: null,
        summary: current.summary,
        conversationHistory: current.contract.generationContext.conversationHistory,
        matchedIntentDefinitions: current.contract.intentGuidance,
        matchedResponseRules: current.contract.replyPlan.matchedRules,
        roleModules: current.contract.persona.modules,
        generation: { status: current.generation.status, source: current.generation.source, model: current.generation.model, rewriteCount: current.generation.rewriteCount }
      }
    } : {})
  };
  calibrationDialogVisible.value = true;
}

function assistantLabel(item: ChatMessage) {
  if (item.role === 'CUSTOMER') return '客户';
  return item.segmentCount && item.segmentCount > 1
    ? `阿梨 · ${Number(item.segmentIndex) + 1}/${item.segmentCount}`
    : '阿梨';
}

function parseSegmentMeta(clientMessageId: string | null | undefined): Partial<ChatMessage> {
  const matched = String(clientMessageId || '').match(/^(.*):reply:segment:(\d+):of:(\d+)$/);
  if (!matched) return {};
  return { replyGroupId: `${matched[1]}:reply`, segmentIndex: Number(matched[2]), segmentCount: Number(matched[3]) };
}

function draftKey(sessionId: string) { return `${DRAFT_KEY_PREFIX}${sessionId}`; }
function analysisKey(sessionId: string) { return `${ANALYSIS_KEY_PREFIX}${sessionId}`; }
function persistCurrentDraft() {
  const sessionId = currentSession.value?.id;
  if (!sessionId) return;
  localStorage.setItem(draftKey(sessionId), form.message);
}

function restoreAdvancedContext(snapshot: Record<string, unknown> | null) {
  const value = snapshot || {};
  form.customerStateText = JSON.stringify(value.customerState || {}, null, 2);
  form.variablesText = JSON.stringify(value.variables || {}, null, 2);
  form.factsText = JSON.stringify(value.facts || [], null, 2);
}
function handleCalibrationChanged(_record: CustomerServiceCalibrationRecord) {
  void recordsRef.value?.reload();
  void profilesRef.value?.reload();
  void mobileRecordsRef.value?.reload();
  void mobileProfilesRef.value?.reload();
}
async function handleCurrentReplyApplied(application: CustomerServiceCalibrationCurrentReplyApplication) {
  if (!application.applied || !application.sessionId || application.sessionId !== activeSessionId.value) return;
  cancelPendingDelivery();
  mobilePendingAnalysisId.value = '';
  await refreshSessions();
  await loadSession(application.sessionId, { preferredAnalysisId: selectedAnalysisId.value || undefined });
  await scrollChat();
}
async function scrollChat() {
  await nextTick();
  if (chatScrollRef.value) chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
  if (mobileChatScrollRef.value) mobileChatScrollRef.value.scrollTop = mobileChatScrollRef.value.scrollHeight;
}
function parseObject(text: string, label: string) { try { const value = JSON.parse(text || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value as Record<string, unknown>; } catch { ElMessage.error(`${label}必须是合法 JSON 对象`); return null; } }
function parseArray(text: string, label: string) { try { const value = JSON.parse(text || '[]'); if (!Array.isArray(value) || value.some((item) => !item || Array.isArray(item) || typeof item !== 'object')) throw new Error(); return value as Record<string, unknown>[]; } catch { ElMessage.error(`${label}必须是合法 JSON 对象数组`); return null; } }
function buildIndustryOptions(nodes: CustomerServiceIndustryNode[]) { const map = new Map(nodes.map((item) => [item.id, item])); return nodes.map((item) => { const names = [item.name]; let parentId = item.parentId; while (parentId && map.has(parentId)) { const parent = map.get(parentId)!; names.unshift(parent.name); parentId = parent.parentId; } return { value: item.id, label: names.join(' / ') }; }); }
function sleep(ms: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms))); }
function createId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function formatDate(value: string) { return new Date(value).toLocaleString(); }
function channelLabel(value: string | null) {
  const labels: Record<string, string> = { WECHAT: '微信', TAOBAO: '淘宝', DOUYIN: '抖音', XIAOHONGSHU: '小红书', WEB: '网页', AFTER_SALES: '售后', PRIVATE_DOMAIN: '私域', OTHER: '其他' };
  return value ? labels[value] || value : '未设渠道';
}
</script>

<style scoped>
.customer-service-page {
  container-name: customer-service-workspace;
  container-type: inline-size;
  min-width: 0;
}

.customer-service-tuning-grid {
  display: grid;
  grid-template-columns: minmax(340px, 390px) minmax(620px, 1fr) minmax(380px, 460px);
  gap: 16px;
  align-items: start;
}

.simple-test-grid {
  grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
}

.single-test-tab :deep(.el-tabs__header) {
  display: none;
}

.tuning-column {
  min-width: 0;
  height: clamp(540px, calc(100dvh - 235px), 920px);
  overflow-y: auto;
}

.tuning-left {
  position: sticky;
  top: 12px;
  overflow: hidden;
}

.tuning-left :deep(.el-card) {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.tuning-left :deep(.el-card__header) {
  flex: 0 0 auto;
}

.tuning-left :deep(.el-card__body) {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.tuning-chat-history {
  min-height: 110px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.tuning-middle,
.tuning-right {
  padding-right: 2px;
}

@media (max-height: 780px) {
  .tuning-composer :deep(.el-textarea__inner) {
    min-height: 76px !important;
  }
}

@container customer-service-workspace (max-width: 1450px) {
  .customer-service-tuning-grid {
    grid-template-columns: minmax(330px, 390px) minmax(0, 1fr);
  }

  .tuning-right {
    grid-column: 2;
    height: auto;
    overflow: visible;
  }
}

@container customer-service-workspace (max-width: 980px) {
  .customer-service-tuning-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .tuning-column {
    height: auto;
    overflow: visible;
  }

  .tuning-left {
    position: static;
    height: clamp(520px, calc(100dvh - 190px), 760px);
    overflow: hidden;
  }

  .tuning-right {
    grid-column: auto;
  }
}

.mobile-tuning-shell {
  display: flex;
  height: 100dvh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 10% 0%, rgba(16, 185, 129, .12), transparent 34%),
    radial-gradient(circle at 100% 20%, rgba(59, 130, 246, .09), transparent 30%),
    #f5f8fc;
}

.mobile-tuning-header {
  display: flex;
  min-height: 64px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(203, 213, 225, .75);
  background: rgba(255, 255, 255, .88);
  padding: max(12px, env(safe-area-inset-top)) 14px 12px;
  box-shadow: 0 8px 30px rgba(15, 23, 42, .05);
  backdrop-filter: blur(18px);
}

.mobile-more-button {
  border-color: rgba(16, 185, 129, .25);
  background: linear-gradient(135deg, #ecfdf5, #eff6ff);
  color: #047857;
}

.mobile-chat-history {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 12px 24px;
}

.mobile-empty {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  margin: 20px 6px;
  border: 1px dashed rgba(148, 163, 184, .55);
  border-radius: 24px;
  background: rgba(255, 255, 255, .68);
  color: #64748b;
  text-align: center;
  font-size: 13px;
}

.mobile-empty-mark {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid rgba(16, 185, 129, .25);
  border-radius: 15px;
  background: linear-gradient(135deg, #d1fae5, #dbeafe);
  color: #047857;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .08em;
  box-shadow: 0 10px 28px rgba(5, 150, 105, .12);
}

.mobile-message {
  max-width: 84%;
  margin-bottom: 12px;
  border-radius: 18px;
  padding: 11px 14px;
  font-size: 14px;
  line-height: 1.75;
  word-break: break-word;
}

.mobile-message-customer {
  border-bottom-right-radius: 5px;
  background: linear-gradient(135deg, #059669, #0f9f77);
  color: white;
}

.mobile-message-assistant {
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 5px;
  background: white;
  color: #1e293b;
  box-shadow: 0 8px 22px rgba(15, 23, 42, .06);
}

.mobile-thinking {
  width: fit-content;
  margin-bottom: 12px;
  border-radius: 16px;
  background: white;
  padding: 10px 14px;
  color: #64748b;
  font-size: 13px;
}

.mobile-candidate-card {
  margin: 8px 0 4px;
  border: 1px solid #a7f3d0;
  border-radius: 18px;
  background: #ecfdf5;
  padding: 14px;
  color: #064e3b;
  box-shadow: 0 8px 22px rgba(5, 150, 105, .08);
}

.mobile-composer {
  flex: 0 0 auto;
  border-top: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, .9);
  padding: 10px 12px max(10px, env(safe-area-inset-bottom));
  box-shadow: 0 -10px 30px rgba(15, 23, 42, .06);
  backdrop-filter: blur(18px);
}

.mobile-drawer-content {
  min-width: 0;
  padding: 4px 2px 22px;
}

.session-config-content {
  max-width: 440px;
  margin: 0 auto;
}

:global(.session-config-drawer .el-drawer__header) {
  margin-bottom: 0;
  border-bottom: 1px solid #e6edf6;
  padding: 18px 20px;
}

:global(.session-config-drawer .el-drawer__body) {
  padding: 20px;
  background: #f8fafc;
}

:global(.session-config-drawer .el-drawer__footer) {
  border-top: 1px solid #e6edf6;
  padding: 14px 20px;
}

@media (max-width: 767px) {
  :global(body.customer-service-mobile-mode .app-layout-header) {
    display: none;
  }

  :global(body.customer-service-mobile-mode .app-layout-main) {
    overflow: hidden;
    padding: 0 !important;
  }

  :global(body.customer-service-mobile-mode .app-layout-main > *) {
    height: 100%;
  }

  :global(.mobile-full-drawer .el-drawer__header) {
    margin-bottom: 0;
    padding: max(16px, env(safe-area-inset-top)) 16px 14px;
    border-bottom: 1px solid #e6edf6;
    background: linear-gradient(135deg, #f6fffb, #f3f7ff);
  }

  :global(.mobile-full-drawer .el-drawer__body) {
    overflow-y: auto;
    padding: 0 12px max(18px, env(safe-area-inset-bottom));
    background: #f7f9fc;
  }

  :global(.mobile-full-drawer .el-tabs__header) {
    margin: 0 -12px 14px;
    padding: 0 8px;
    background: white;
  }

  :global(.mobile-full-drawer .el-tabs__nav-wrap) {
    position: sticky;
    top: 0;
    z-index: 3;
    background: rgba(255, 255, 255, .96);
  }

  :global(.mobile-full-drawer .el-tabs__item) {
    min-width: 82px;
    padding: 0 10px;
    font-size: 13px;
  }

  :global(.mobile-full-drawer .el-card) {
    border-color: #e4eaf3;
    border-radius: 14px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, .04);
  }

  :global(.mobile-full-drawer .el-form-item__label) {
    color: #475569;
    font-weight: 600;
  }

  :global(.mobile-full-drawer .el-table) {
    width: 100% !important;
    min-width: 0 !important;
  }
}
</style>
