<template>
  <el-card v-if="generation && quality" shadow="never">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <span class="font-semibold">候选回复与质量门</span>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <el-button v-if="generation.draft && canCalibrate" size="small" type="warning" plain @click="$emit('calibrate')">这条回复不满意，开始校准</el-button>
          <el-tag v-if="generation.semanticFallbackUsed" type="warning">语义安全兜底</el-tag>
          <el-tag v-else-if="generation.fallbackUsed" type="info">历史兜底记录</el-tag>
          <el-tag type="info">{{ generation.finalReplySource || generation.source }}</el-tag>
          <el-tag :type="qualityTagType">{{ quality.status }}</el-tag>
        </div>
      </div>
    </template>

    <div class="grid gap-3 md:grid-cols-4">
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">端到端耗时</div><div class="mt-1 font-medium">{{ performance ? `${performance.totalElapsedMs}ms` : '历史记录未保存' }}</div></div>
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">意图识别</div><div class="mt-1 font-medium">{{ performance ? `${performance.recognitionElapsedMs}ms · ${performance.recognitionPath}` : '—' }}</div></div>
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">生成模型耗时</div><div class="mt-1 font-medium">{{ performance ? `${performance.generationModelElapsedMs}ms` : `${generation.totalModelElapsedMs ?? generation.elapsedMs}ms` }}</div></div>
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">模型调用 / 重写</div><div class="mt-1 font-medium">{{ performance?.modelCallCount ?? generation.modelCallCount ?? '—' }} / {{ rewriteAttemptCount }}</div></div>
    </div>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <div class="rounded-lg border border-slate-200 p-3"><div class="text-xs text-slate-500">请求模型 / 实际模型</div><div class="mt-1 break-all text-sm font-medium">{{ generation.requestedModel || '—' }} / {{ generation.actualModel || generation.model || '—' }}</div></div>
      <div class="rounded-lg border border-slate-200 p-3"><div class="text-xs text-slate-500">思考模式 / finish reason</div><div class="mt-1 text-sm font-medium">{{ generation.thinkingMode || 'UNKNOWN' }} / {{ generation.finishReason || '—' }}</div></div>
      <div class="rounded-lg border border-slate-200 p-3"><div class="text-xs text-slate-500">Token 上限 / 超时</div><div class="mt-1 text-sm font-medium">{{ tokenBudgetLabel }} / {{ generation.timeoutMs != null ? `${generation.timeoutMs}ms` : '—' }}</div></div>
      <div class="rounded-lg border border-slate-200 p-3"><div class="text-xs text-slate-500">可见字数 / reasoning 字数</div><div class="mt-1 text-sm font-medium">{{ generation.visibleContentLength ?? generation.draft?.trim().length ?? 0 }} / {{ generation.reasoningContentLength ?? 0 }}</div></div>
    </div>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">首次生成</div><div class="mt-1 font-medium">{{ generation.initialGenerationStatus || legacyDiagnosticLabel }}</div></div>
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">紧凑重试</div><div class="mt-1 font-medium">{{ generation.compactRetryAttempted ? generation.compactRetryStatus : 'NOT_ATTEMPTED' }}</div></div>
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">质量重写</div><div class="mt-1 font-medium">{{ generation.rewriteAttempted ? generation.rewriteStatus : 'NOT_ATTEMPTED' }}</div></div>
      <div class="rounded-lg bg-slate-50 p-3"><div class="text-xs text-slate-500">最终回复来源</div><div class="mt-1 font-medium">{{ generation.finalReplySource || generation.source }}</div></div>
    </div>
    <div class="mt-3 grid gap-3 md:grid-cols-3">
      <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div class="text-xs text-emerald-700">绝对安全</div><div class="mt-1 font-medium text-emerald-900">{{ generation.candidateSafetyStatus || '历史记录未保存' }}</div></div>
      <div class="rounded-lg border border-amber-200 bg-amber-50 p-3"><div class="text-xs text-amber-700">候选质量</div><div class="mt-1 font-medium text-amber-900">{{ generation.candidateQualityStatus || quality.status }}</div></div>
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-3"><div class="text-xs text-blue-700">最终投递决定</div><div class="mt-1 font-medium text-blue-900">{{ generation.deliveryDecision || '历史记录未保存' }}</div></div>
    </div>
    <el-alert class="mt-3" title="V5.14-T1：最终回复生成显式关闭思考；空文本、截断、超时或无效响应只允许一次短预算紧凑重试，之后转为按当前主导目标生成的语义安全兜底。" type="info" :closable="false" show-icon />
    <el-alert v-if="modelBudgetExceeded" class="mt-3" :title="`本轮模型累计等待 ${pipelineModelElapsedMs}ms，已超过 18 秒 T0 质量救援预算，请检查模型网关是否及时中断。`" type="error" :closable="false" show-icon />

    <el-alert v-if="isLegacyFailureNotice" class="mt-4" title="这是升级前保存的历史失败提示记录；V5.14-T1 当前链路不会再把生成过程或稍后回复类技术说明发送给客户。" type="info" :closable="false" show-icon />
    <el-alert v-if="generation.emptyContentReason" class="mt-4" :title="`首个无效候选原因：${generation.emptyContentReason}`" type="warning" :closable="false" show-icon />
    <el-alert v-if="generation.finalFailureReason" class="mt-4" :title="`最终失败诊断：${generation.finalFailureReason}`" type="warning" :closable="false" show-icon />
    <el-alert v-if="generation.status === 'QUALITY_REJECTED'" class="mt-4" title="所有候选均未通过质量门，客户可见候选已清空并禁止发送；失败内容仅保留在重写轨迹中用于调优。" type="error" :closable="false" show-icon />
    <el-alert v-if="generation.errorMessage" class="mt-4" :title="generation.errorMessage" :type="generation.status === 'QUALITY_REJECTED' ? 'error' : 'warning'" :closable="false" show-icon />
    <el-alert v-if="generation.fallbackUsed && generation.fallbackReason" class="mt-4" :title="generation.fallbackReason" type="warning" :closable="false" show-icon />
    <el-alert
      v-if="generation.finalReplySource === 'BEST_SAFE_MODEL_CANDIDATE'"
      class="mt-4"
      title="两次模型质量救援后仍未完整达标；系统已发送综合得分最高且通过绝对安全门的模型候选，普通质量问题不会再造成空回复。"
      type="info"
      :closable="false"
      show-icon
    />

    <div v-if="generation.deliveryPlan?.segments.length" class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div class="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-blue-800">
        <span>消息投递计划</span><el-tag size="small">{{ generation.deliveryPlan.mode }}</el-tag>
      </div>
      <div class="text-xs leading-5 text-blue-700">{{ generation.deliveryPlan.reason }}</div>
      <div class="mt-3 space-y-2">
        <div v-for="segment in generation.deliveryPlan.segments" :key="segment.index" class="rounded border border-blue-100 bg-white p-2 text-sm leading-6">
          <div class="mb-1 text-xs text-slate-400">第 {{ segment.index + 1 }} 段 · 前置等待 {{ segment.delayBeforeMs }} ms</div>
          <div class="whitespace-pre-wrap">{{ segment.content }}</div>
        </div>
      </div>
      <div v-if="generation.deliveryPlan.cancelRemainingOnCustomerMessage" class="mt-2 text-xs text-blue-700">客户在段间发送新消息时，取消未发送的后续段。</div>
    </div>

    <div v-if="generation.draft" class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div class="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-emerald-800">
        <span>最终候选客户回复</span>
        <el-tag v-if="generation.source === 'SEMANTIC_SAFE_FALLBACK'" type="warning" size="small">按当前主导目标生成的语义兜底</el-tag>
        <el-tag v-if="generation.source === 'COMPACT_MODEL_RETRY'" type="success" size="small">紧凑重试恢复</el-tag>
        <el-tag v-if="generation.source === 'QUALITY_REWRITE'" type="success" size="small">质量重写通过</el-tag>
        <el-tag v-if="generation.source === 'BEST_SAFE_MODEL_CANDIDATE'" type="warning" size="small">最佳安全模型候选</el-tag>
        <el-tag v-if="generation.source === 'MODEL_AVAILABILITY_FALLBACK'" type="danger" size="small">模型不可用灾难应急</el-tag>
        <el-tag v-if="generation.source === 'HIGH_RISK_SAFE_RESPONSE'" type="danger" size="small">高风险安全回复</el-tag>
        <el-tag v-if="generation.source === 'BEST_SAFE_CANDIDATE'" type="info" size="small">保留最佳安全候选</el-tag>
        <el-tag v-if="generation.source === 'SAFE_FALLBACK'" type="info" size="small">升级前安全兜底记录</el-tag>
        <el-tag v-if="generation.source === 'HUMAN_REVIEW_ACK'" type="warning" size="small">后台处理标记下的客户回复</el-tag>
        <el-tag v-if="generation.source === 'FAILURE_NOTICE'" type="info" size="small">升级前失败提示记录</el-tag>
      </div>
      <div class="whitespace-pre-wrap text-sm leading-7 text-emerald-950">{{ generation.draft }}</div>
    </div>
    <el-empty v-else class="py-4" description="本次没有生成客户可见候选回复" />

    <el-collapse v-if="hasRewriteDetails" class="mt-4">
      <el-collapse-item title="查看原始回复与定向重写轨迹" name="rewrite-trace">
        <div v-if="generation.originalDraft && generation.originalDraft !== generation.draft" class="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <div class="mb-2 text-sm font-medium text-orange-800">首次被拦截的候选回复</div>
          <div class="whitespace-pre-wrap text-sm leading-6 text-orange-950">{{ generation.originalDraft }}</div>
        </div>
        <el-table v-if="rewriteHistory.length" :data="rewriteHistory" size="small" max-height="360">
          <el-table-column prop="attempt" label="序号" width="70" />
          <el-table-column label="处理方式" width="150"><template #default="scope">{{ rewriteModeLabel(scope.row.mode) }}</template></el-table-column>
          <el-table-column prop="status" label="调用状态" width="130" />
          <el-table-column label="复检结果" width="100"><template #default="scope"><el-tag :type="traceQualityType(scope.row.qualityStatus)" size="small">{{ scope.row.qualityStatus || '未复检' }}</el-tag></template></el-table-column>
          <el-table-column label="失败原因" min-width="240" show-overflow-tooltip><template #default="scope">{{ traceMessage(scope.row) }}</template></el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>

    <el-collapse v-if="hasCandidateRescueDetails" class="mt-4">
      <el-collapse-item title="查看候选拆解、救援与仲裁评分" name="candidate-rescue">
        <div v-if="generation.candidateSalvagePlan" class="grid gap-3 md:grid-cols-2">
          <div class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm"><b>保留片段</b><div class="mt-2 whitespace-pre-wrap text-xs leading-5">{{ generation.candidateSalvagePlan.preservedSpans.join('\n') || '无' }}</div></div>
          <div class="rounded border border-red-200 bg-red-50 p-3 text-sm"><b>剔除片段</b><div class="mt-2 whitespace-pre-wrap text-xs leading-5">{{ generation.candidateSalvagePlan.rejectedSpans.join('\n') || '无' }}</div></div>
          <div class="rounded border border-blue-200 bg-blue-50 p-3 text-sm"><b>待补复合意图</b><div class="mt-2 text-xs leading-5">{{ generation.candidateSalvagePlan.missingIntentCoverage.join('、') || '无' }}</div></div>
          <div class="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><b>待补真人回应动作</b><div class="mt-2 text-xs leading-5">{{ generation.candidateSalvagePlan.missingResponseActs.join('、') || '无' }}</div></div>
          <div class="rounded border border-fuchsia-200 bg-fuchsia-50 p-3 text-sm"><b>近期已用动作族</b><div class="mt-2 text-xs leading-5">{{ generation.candidateSalvagePlan.recentActionFamilies?.join('、') || '无' }}</div></div>
          <div class="rounded border border-orange-200 bg-orange-50 p-3 text-sm"><b>本轮禁止重复的实用动作</b><div class="mt-2 text-xs leading-5">{{ generation.candidateSalvagePlan.blockedPracticalActionFamilies?.join('、') || '无' }}</div></div>
          <div class="rounded border border-cyan-200 bg-cyan-50 p-3 text-sm"><b>候选动作族</b><div class="mt-2 text-xs leading-5">{{ generation.candidateSalvagePlan.candidateActionFamilies?.join('、') || '无' }}</div></div>
          <div class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <b>动作新颖性要求</b>
            <div class="mt-2 text-xs leading-5">
              {{ generation.candidateSalvagePlan.requireNovelPracticalAction ? '本轮必须给出新实用动作族' : '本轮不强制新动作' }}
              · 新动作 {{ generation.candidateSalvagePlan.novelPracticalActionFamilies?.join('、') || '无' }}
            </div>
          </div>
        </div>
        <el-table v-if="generation.candidateScores?.length" class="mt-3" :data="generation.candidateScores" size="small" max-height="320">
          <el-table-column prop="source" label="候选来源" width="180" />
          <el-table-column label="绝对安全" width="95"><template #default="scope"><el-tag :type="scope.row.absoluteSafe ? 'success' : 'danger'" size="small">{{ scope.row.absoluteSafe ? '通过' : '失败' }}</el-tag></template></el-table-column>
          <el-table-column label="总分" width="70"><template #default="scope">{{ scope.row.score.total }}</template></el-table-column>
          <el-table-column label="意图/真人/上下文/实用/变化" min-width="210"><template #default="scope">{{ scope.row.score.intentCoverageScore }}/{{ scope.row.score.humanityScore }}/{{ scope.row.score.contextGroundingScore }}/{{ scope.row.score.practicalValueScore }}/{{ scope.row.score.variationScore }}</template></el-table-column>
          <el-table-column label="语义动作（新/重复）" min-width="250"><template #default="scope">{{ scope.row.score.actionFamilies?.join('/') || '无' }}（{{ scope.row.score.novelPracticalActionFamilies?.join('/') || '无' }} / {{ scope.row.score.repeatedActionFamilies?.join('/') || '无' }}）</template></el-table-column>
          <el-table-column label="真人感十维" min-width="320"><template #default="scope">{{ humanityDimensionSummary(scope.row.score.humanityDimensions) }}</template></el-table-column>
          <el-table-column label="候选文本" min-width="300" show-overflow-tooltip><template #default="scope">{{ scope.row.draft }}</template></el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>

    <el-collapse v-if="modelAttempts.length" class="mt-4">
      <el-collapse-item title="查看模型调用诊断" name="model-attempts">
        <el-table :data="modelAttempts" size="small" max-height="420">
          <el-table-column prop="attempt" label="#" width="52" />
          <el-table-column prop="mode" label="阶段" width="125" />
          <el-table-column prop="status" label="状态" width="130" />
          <el-table-column label="模型" min-width="180" show-overflow-tooltip><template #default="scope">{{ scope.row.requestedModel }} / {{ scope.row.actualModel || '—' }}</template></el-table-column>
          <el-table-column label="思考" width="85"><template #default="scope">{{ scope.row.thinkingMode }}</template></el-table-column>
          <el-table-column label="预算" width="140"><template #default="scope">{{ scope.row.requestedMaxTokens }}/{{ scope.row.effectiveMaxTokens }} · {{ scope.row.timeoutMs }}ms</template></el-table-column>
          <el-table-column label="finish" width="100"><template #default="scope">{{ scope.row.finishReason || '—' }}</template></el-table-column>
          <el-table-column label="可见/reasoning" width="130"><template #default="scope">{{ scope.row.visibleContentLength }}/{{ scope.row.reasoningContentLength }}</template></el-table-column>
          <el-table-column label="耗时" width="90"><template #default="scope">{{ scope.row.elapsedMs }}ms</template></el-table-column>
          <el-table-column label="失败原因" min-width="220" show-overflow-tooltip><template #default="scope">{{ scope.row.emptyContentReason || scope.row.errorMessage || '—' }}</template></el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>

    <el-divider />
    <div class="grid gap-3 md:grid-cols-4">
      <div class="text-sm">检查规则：<b>{{ quality.checkedRuleCount }}</b></div>
      <div class="text-sm text-red-600">阻断：<b>{{ quality.blockerCount }}</b></div>
      <div class="text-sm text-orange-600">错误：<b>{{ quality.errorCount }}</b></div>
      <div class="text-sm text-amber-600">警告：<b>{{ quality.warningCount }}</b></div>
    </div>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <div class="rounded-lg border border-slate-200 p-3"><div class="text-xs text-slate-500">真人感质量分</div><div class="mt-1 text-lg font-semibold">{{ quality.naturalnessScore ?? '—' }}</div></div>
      <div class="rounded-lg border border-red-200 bg-red-50 p-3"><div class="text-xs text-red-600">硬阻断项</div><div class="mt-1 text-lg font-semibold text-red-700">{{ quality.blockingIssueCount ?? quality.blockerCount }}</div></div>
      <div class="rounded-lg border border-orange-200 bg-orange-50 p-3"><div class="text-xs text-orange-600">需自动重写</div><div class="mt-1 text-lg font-semibold text-orange-700">{{ quality.rewriteIssueCount ?? quality.errorCount }}</div></div>
      <div class="rounded-lg border border-amber-200 bg-amber-50 p-3"><div class="text-xs text-amber-600">仅评分扣分</div><div class="mt-1 text-lg font-semibold text-amber-700">{{ quality.scoreOnlyIssueCount ?? quality.warningCount }}</div></div>
    </div>
    <el-table class="mt-3" :data="quality.issues" size="small" max-height="420">
      <el-table-column label="处置" width="110"><template #default="scope">{{ dispositionLabel(scope.row.disposition) }}</template></el-table-column>
      <el-table-column label="结果" width="78"><template #default="scope"><el-tag :type="scope.row.passed ? 'success' : 'danger'" size="small">{{ scope.row.passed ? '通过' : '失败' }}</el-tag></template></el-table-column>
      <el-table-column prop="name" label="质量规则" min-width="180" />
      <el-table-column prop="severity" label="等级" width="100" />
      <el-table-column prop="message" label="说明" min-width="260" show-overflow-tooltip />
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  CustomerServiceGenerationResult,
  CustomerServiceQualityReport,
  CustomerServiceRewriteAttempt,
} from '@/modules/customer-service/types/simulation.types';

const props = defineProps<{
  generation?: CustomerServiceGenerationResult | null;
  quality?: CustomerServiceQualityReport | null;
  canCalibrate?: boolean;
}>();
defineEmits<{ calibrate: [] }>();

const qualityTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => props.quality?.status === 'PASS' ? 'success' : props.quality?.status === 'WARN' ? 'warning' : props.quality?.status === 'FAIL' ? 'danger' : 'info');
const rewriteAttemptCount = computed(() => props.generation?.rewriteAttemptCount ?? props.generation?.rewriteCount ?? 0);
const performance = computed(() => props.generation?.pipelinePerformance ?? null);
const rewriteHistory = computed(() => props.generation?.rewriteHistory ?? []);
const modelAttempts = computed(() => props.generation?.modelAttempts ?? []);
const hasRewriteDetails = computed(() => Boolean(rewriteHistory.value.length || (props.generation?.originalDraft && props.generation.originalDraft !== props.generation.draft)));
const hasCandidateRescueDetails = computed(() => Boolean(props.generation?.candidateSalvagePlan || props.generation?.candidateScores?.length));
const pipelineModelElapsedMs = computed(() => (performance.value?.recognitionElapsedMs || 0) + (performance.value?.generationModelElapsedMs ?? props.generation?.totalModelElapsedMs ?? props.generation?.elapsedMs ?? 0));
const modelBudgetExceeded = computed(() => pipelineModelElapsedMs.value > 18000);
const tokenBudgetLabel = computed(() => props.generation?.requestedMaxTokens != null ? `${props.generation.requestedMaxTokens}/${props.generation.effectiveMaxTokens ?? props.generation.requestedMaxTokens}` : '—');
const legacyDiagnosticLabel = computed(() => props.generation?.modelAttempts ? 'NOT_REQUESTED' : '历史记录未保存');
const isLegacyFailureNotice = computed(() => props.generation?.status === 'GENERATION_FAILED_NOTICE' || props.generation?.source === 'FAILURE_NOTICE');

function rewriteModeLabel(mode: CustomerServiceRewriteAttempt['mode']) {
  if (mode === 'COMPACT_MODEL_RETRY') return '紧凑模型重试';
  if (mode === 'SALVAGE_REWRITE') return '候选拆解后救援';
  if (mode === 'BEST_SAFE_MODEL_CANDIDATE') return '最佳安全模型候选';
  if (mode === 'MODEL_AVAILABILITY_FALLBACK') return '模型不可用灾难应急';
  if (mode === 'HIGH_RISK_SAFE_RESPONSE') return '高风险安全回复';
  if (mode === 'BEST_SAFE_CANDIDATE') return '最佳安全候选仲裁';
  if (mode === 'SEMANTIC_SAFE_FALLBACK') return '语义安全兜底';
  if (mode === 'SAFE_FALLBACK') return '升级前安全兜底';
  if (mode === 'FAILURE_NOTICE') return '升级前失败提示';
  return '模型定向重写';
}

function traceQualityType(status: CustomerServiceRewriteAttempt['qualityStatus']): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'PASS') return 'success';
  if (status === 'WARN') return 'warning';
  if (status === 'FAIL') return 'danger';
  return 'info';
}

function traceMessage(item: CustomerServiceRewriteAttempt) {
  if (item.errorMessage) return item.errorMessage;
  if (item.failedIssues.length) return item.failedIssues.map((issue) => `${issue.name}：${issue.message}`).join('；');
  return item.qualityStatus === 'PASS' ? '已通过质量门' : '无额外失败项';
}
function dispositionLabel(disposition?: 'BLOCK' | 'REWRITE' | 'SCORE_ONLY') {
  if (disposition === 'BLOCK') return '硬阻断';
  if (disposition === 'REWRITE') return '自动重写';
  if (disposition === 'SCORE_ONLY') return '仅评分';
  return '历史规则';
}
function humanityDimensionSummary(value?: Record<string, number>) {
  if (!value) return '历史记录未保存';
  const labels: Record<string, string> = {
    currentContent: '当前内容',
    historyContinuity: '历史连续',
    interpersonalNaturalness: '人际自然',
    relationshipConsistency: '关系一致',
    emotionMatch: '情绪匹配',
    rhythm: '节奏',
    variation: '变化',
    dialogueValue: '对话价值',
    modelTone: '去模型腔',
    continuationWillingness: '继续意愿',
  };
  return Object.entries(value).map(([key, score]) => `${labels[key] || key}:${score}`).join(' · ');
}
</script>
