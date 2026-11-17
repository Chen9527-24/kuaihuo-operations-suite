<template>
  <div class="space-y-4">
    <el-card shadow="never">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <el-input v-model="filters.keyword" clearable placeholder="搜索客户消息、原回复或建议" @keyup.enter="load" />
        <el-select v-model="filters.status" clearable placeholder="全部状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.problemType" clearable placeholder="全部问题类型">
          <el-option v-for="item in problemTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.merchantRoleId" clearable filterable placeholder="全部客服角色">
          <el-option v-for="item in roles" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
        </el-select>
        <div class="flex gap-2"><el-button type="primary" @click="load">查询</el-button><el-button @click="reset">重置</el-button></div>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">校准记录</span><span class="text-xs text-slate-500">共 {{ total }} 条</span></div></template>
      <el-table v-if="!mobile" v-loading="loading" :data="items" row-key="id">
        <el-table-column label="更新时间" width="170"><template #default="scope">{{ formatTime(scope.row.updatedAt) }}</template></el-table-column>
        <el-table-column label="客服角色" min-width="130"><template #default="scope">{{ scope.row.merchantRole?.name || '—' }}</template></el-table-column>
        <el-table-column label="客户消息" min-width="220" show-overflow-tooltip prop="customerMessage" />
        <el-table-column label="原回复" min-width="260" show-overflow-tooltip prop="originalReply" />
        <el-table-column label="问题类型" min-width="240">
          <template #default="scope"><div class="flex flex-wrap gap-1"><el-tag v-for="type in scope.row.problemTypes" :key="type" size="small" type="warning">{{ problemLabel(type) }}</el-tag></div></template>
        </el-table-column>
        <el-table-column label="状态" width="120"><template #default="scope"><el-tag :type="statusTag(scope.row.status)">{{ statusLabel(scope.row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="openDetail(scope.row)">查看</el-button>
            <el-button v-if="scope.row.status === 'OPEN' && canAnalyze" link type="success" :loading="analyzingId === scope.row.id" @click="analyze(scope.row)">AI 分析</el-button>
            <el-dropdown v-if="canUpdate" trigger="click" @command="(value) => changeStatus(scope.row, value)">
              <el-button link type="info">状态</el-button>
              <template #dropdown><el-dropdown-menu>
                <el-dropdown-item v-if="scope.row.suggestedReply && scope.row.status !== 'APPLIED_TUNING'" command="ACCEPTED">确认调优方向</el-dropdown-item>
                <el-dropdown-item command="ARCHIVED">归档</el-dropdown-item>
                <el-dropdown-item v-if="scope.row.status !== 'OPEN'" command="OPEN">重新打开</el-dropdown-item>
              </el-dropdown-menu></template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div v-else v-loading="loading" class="space-y-3">
        <article v-for="item in items" :key="item.id" class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0"><b>{{ item.merchantRole?.name || '客服角色' }}</b><div class="mt-1 text-xs text-slate-400">{{ formatTime(item.updatedAt) }}</div></div>
            <el-tag :type="statusTag(item.status)" size="small">{{ statusLabel(item.status) }}</el-tag>
          </div>
          <div class="mt-3 text-sm leading-6"><span class="text-slate-400">客户：</span>{{ item.customerMessage }}</div>
          <div class="mt-2 line-clamp-3 text-sm leading-6"><span class="text-slate-400">原回复：</span>{{ item.originalReply }}</div>
          <div class="mt-3 flex flex-wrap gap-1"><el-tag v-for="type in item.problemTypes" :key="type" size="small" type="warning">{{ problemLabel(type) }}</el-tag></div>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <el-button @click="openDetail(item)">查看</el-button>
            <el-button v-if="item.status === 'OPEN' && canAnalyze" type="success" plain :loading="analyzingId === item.id" @click="analyze(item)">AI 分析</el-button>
            <el-dropdown v-if="canUpdate" trigger="click" @command="(value) => changeStatus(item, value)"><el-button>状态</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item v-if="item.suggestedReply && item.status !== 'APPLIED_TUNING'" command="ACCEPTED">确认调优方向</el-dropdown-item><el-dropdown-item command="ARCHIVED">归档</el-dropdown-item><el-dropdown-item v-if="item.status !== 'OPEN'" command="OPEN">重新打开</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
          </div>
        </article>
        <el-empty v-if="!items.length" description="暂无校准记录" :image-size="64" />
      </div>
      <div class="mt-4 flex justify-end"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" /></div>
    </el-card>

    <el-drawer v-model="drawerVisible" title="校准记录详情" :size="mobile ? '100%' : '820px'">
      <div v-if="detail" class="space-y-4">
        <el-descriptions :column="mobile ? 1 : 2" border>
          <el-descriptions-item label="客服角色">{{ detail.merchantRole.name }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
          <el-descriptions-item label="场景">{{ detail.scenario || '—' }}</el-descriptions-item>
          <el-descriptions-item label="意图">{{ detail.intent || '—' }}</el-descriptions-item>
          <el-descriptions-item label="风险">{{ detail.riskLevel || '—' }}</el-descriptions-item>
          <el-descriptions-item label="行业">{{ detail.industryNode?.path || detail.industryNode?.name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="改善方式">{{ detail.improvementMode === 'GUIDED' ? '按商家建议' : 'AI 自主诊断' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ detail.createdBy.displayName }}</el-descriptions-item>
          <el-descriptions-item label="用户反馈">{{ detail.userFeedback || '—' }}</el-descriptions-item>
          <el-descriptions-item label="纠正目标">{{ detail.correctionTarget || '—' }}</el-descriptions-item>
          <el-descriptions-item label="主导目标">{{ detail.dominantTurnGoal || '—' }}</el-descriptions-item>
          <el-descriptions-item label="被拒绝动作">{{ detail.rejectedMoves?.join('、') || '—' }}</el-descriptions-item>
          <el-descriptions-item label="本轮对话义务" :span="2">{{ detail.currentResponseObligation || '—' }}</el-descriptions-item>
          <el-descriptions-item label="关联角色模块">{{ detail.relatedRoleModuleIds.length }} 个</el-descriptions-item>
          <el-descriptions-item label="关联规则 / 资产">{{ detail.relatedResponseRuleIds.length }} / {{ detail.relatedAssetIds.length }}</el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="detail.status === 'APPLIED_TUNING'"
          :title="appliedDetailTitle"
          :description="appliedDetailDescription"
          type="success"
          :closable="false"
          show-icon
        />
        <el-alert
          v-if="['MODEL_FAILED', 'PARSE_FAILED'].includes(detail.aiAnalysisStatus || '')"
          title="上次 AI 校准分析未完成"
          :description="`已保留失败诊断，当前可安全重试；累计分析尝试 ${detail.aiAnalysisAttempts || 0} 次。`"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert
          v-if="detail.problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION')"
          title="意图理解机制证据"
          description="该记录用于排查识别链路，不会自动发布成表达风格规则。"
          type="warning"
          :closable="false"
          show-icon
        />

        <el-card shadow="never"><template #header><span class="font-semibold">客户消息</span></template><div class="whitespace-pre-wrap text-sm leading-7">{{ detail.customerMessage }}</div></el-card>
        <el-card shadow="never"><template #header><span class="font-semibold">原回复</span></template><div class="whitespace-pre-wrap text-sm leading-7">{{ detail.originalReply }}</div></el-card>
        <el-card shadow="never">
          <template #header><span class="font-semibold">问题标记</span></template>
          <div class="flex flex-wrap gap-2"><el-tag v-for="type in detail.problemTypes" :key="type" type="warning">{{ problemLabel(type) }}</el-tag></div>
          <div v-if="detail.problemDescription" class="mt-3 whitespace-pre-wrap text-sm leading-7">{{ detail.problemDescription }}</div>
          <div v-if="detail.userSuggestion" class="mt-3 rounded-lg bg-blue-50 p-3 text-sm leading-7"><b>商家建议：</b>{{ detail.userSuggestion }}</div>
        </el-card>
        <el-card v-if="detail.aiDiagnosis" shadow="never">
          <template #header><div class="flex items-center justify-between"><span class="font-semibold">AI 校准诊断</span><el-tag type="success">{{ detail.aiModel || 'AI' }}</el-tag></div></template>
          <div class="text-sm leading-7"><b>结论：</b>{{ detail.aiDiagnosis.summary || '—' }}</div>
          <div class="mt-2 text-sm leading-7"><b>根因：</b>{{ detail.aiDiagnosis.rootCause || '—' }}</div>
          <div v-if="detail.aiDiagnosis.targetScopes?.length" class="mt-3 flex flex-wrap gap-2"><el-tag v-for="scope in detail.aiDiagnosis.targetScopes" :key="scope">{{ configScopeLabel(scope) }}</el-tag></div>
        </el-card>
        <el-card v-if="detail.aiRecommendations?.length" shadow="never">
          <template #header><span class="font-semibold">配置调整建议</span></template>
          <div v-for="(item, index) in detail.aiRecommendations" :key="index" class="mb-3 rounded-lg bg-slate-50 p-3 last:mb-0">
            <div class="flex items-center gap-2"><el-tag size="small" :type="priorityTag(item.priority)">{{ item.priority }}</el-tag><b>{{ item.title }}</b><span class="text-xs text-slate-500">{{ configScopeLabel(item.scope) }}</span></div>
            <div class="mt-2 whitespace-pre-wrap text-sm leading-6">{{ item.change }}</div>
          </div>
        </el-card>
        <el-card v-if="detail.tuningDirectives" shadow="never">
          <template #header><span class="font-semibold">可复用调优约束</span></template>
          <div class="space-y-3 text-sm leading-6">
            <div v-if="detail.tuningDirectives.goals.length"><b>目标：</b>{{ detail.tuningDirectives.goals.join('；') }}</div>
            <div v-if="detail.tuningDirectives.behaviorRules.length"><b>行为规则：</b>{{ detail.tuningDirectives.behaviorRules.join('；') }}</div>
            <div v-if="detail.tuningDirectives.avoidExpressions.length"><b>避免表达：</b>{{ detail.tuningDirectives.avoidExpressions.join('、') }}</div>
            <div v-if="detail.tuningDirectives.preferredPatterns.length"><b>偏好表达：</b>{{ detail.tuningDirectives.preferredPatterns.join('；') }}</div>
            <div><b>限制：</b>最多 {{ detail.tuningDirectives.maxSentences ?? '按场景预算' }} 句，最多 {{ detail.tuningDirectives.maxQuestions ?? '按场景预算' }} 个问题；表情 {{ detail.tuningDirectives.emojiPolicy }}</div>
          </div>
        </el-card>
        <el-card v-if="detail.suggestedReply" shadow="never">
          <template #header><div class="flex items-center justify-between"><span class="font-semibold">建议回复</span><el-button size="small" @click="copySuggested">复制</el-button></div></template>
          <div class="whitespace-pre-wrap rounded-lg bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">{{ detail.suggestedReply }}</div>
        </el-card>

        <el-card v-if="detail.suggestedReply && detail.status !== 'APPLIED_TUNING' && canUpdate && canApplyToTuning(detail)" shadow="never">
          <template #header><span class="font-semibold">应用校准</span></template>
          <el-select v-model="applyScopeType" class="w-full">
            <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value">
              <div><div>{{ item.label }}</div><div class="text-xs text-slate-400">{{ item.description }}</div></div>
            </el-option>
          </el-select>
          <el-alert class="mt-3" :title="recordScopeAlert.title" :description="recordScopeAlert.description" :type="recordScopeAlert.type" :closable="false" show-icon />
        </el-card>

        <el-card v-if="detail.status === 'APPLIED_TUNING' && !isImmediateScopeType(detail.appliedScopeType)" shadow="never">
          <template #header><span class="font-semibold">策略草稿与发布门禁</span></template>
          <el-alert
            v-if="!detail.strategyDraftVersionId"
            title="校准证据尚未转换为结构化策略草稿，不会影响生成链路。"
            type="info"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else-if="detail.strategyDraftStatus === 'REGRESSION_PASSED'"
            title="当前草稿已完成全量回归且全部通过。就在本页“测试与优化 → 校准记录 → 策略草稿与发布门禁”点击“审核并发布此策略”；发布后仍可按历史版本回滚。"
            type="success"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else-if="detail.strategyDraftStatus === 'PUBLISHED'"
            title="当前校准策略版本已发布并进入正式策略编译链。"
            type="success"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else-if="detail.strategyDraftStatus === 'SUPERSEDED'"
            title="该校准策略曾经发布，但已被同一资产的后续版本替代；当前不再是运行时生效版本。"
            type="info"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else
            :title="detail.strategyDraftStatus === 'REGRESSION_FAILED'
              ? '上次回归存在失败或受限用例，发布门禁保持关闭。'
              : '草稿尚未回归，发布门禁保持关闭。'"
            type="warning"
            :closable="false"
            show-icon
          />
          <div v-if="detail.strategyDraftVersionId" class="mt-3 text-xs text-slate-500">
            草稿版本：{{ detail.strategyDraftVersionId }}
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <el-button
              v-if="!detail.strategyDraftVersionId || detail.strategyDraftStatus === 'REGRESSION_FAILED'"
              type="primary"
              :loading="draftingId === detail.id"
              @click="createStrategyDraft(detail)"
            >生成结构化策略草稿</el-button>
            <el-button
              v-if="detail.strategyDraftVersionId && ['DRAFT', 'REGRESSION_FAILED'].includes(detail.strategyDraftStatus || '')"
              type="warning"
              @click="startDraftRegression(detail)"
            >使用此草稿运行全量回归</el-button>
            <el-button
              v-if="canRecordRegression(detail)"
              type="success"
              :loading="recordingRegressionId === detail.id"
              @click="recordDraftRegression(detail)"
            >记录本次回归结果</el-button>
            <el-button
              v-if="detail.strategyDraftStatus === 'REGRESSION_PASSED' && canPublish"
              type="primary"
              :loading="publishingId === detail.id"
              @click="publishDraft(detail)"
            >审核并发布此策略</el-button>
          </div>
        </el-card>

        <div class="flex flex-wrap gap-2">
          <el-button v-if="detail.status === 'OPEN' && canAnalyze" type="primary" :loading="analyzingId === detail.id" @click="analyze(detail)">执行 AI 校准分析</el-button>
          <el-button v-if="detail.suggestedReply && detail.status !== 'APPLIED_TUNING' && canUpdate && canApplyToTuning(detail)" type="success" :loading="applyingId === detail.id" @click="applyToTuning(detail)">{{ recordApplyButtonLabel }}</el-button>
          <el-button v-if="detail.suggestedReply && detail.status === 'AI_ANALYZED' && canUpdate" @click="changeStatus(detail, 'ACCEPTED')">只确认方向，暂不应用</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  analyzeCustomerServiceCalibration,
  applyCustomerServiceCalibrationToTuning,
  createCustomerServiceCalibrationStrategyDraft,
  getCustomerServiceCalibration,
  listCustomerServiceCalibrations,
  publishCustomerServiceCalibrationStrategyDraft,
  recordCustomerServiceCalibrationStrategyRegression,
  updateCustomerServiceCalibrationStatus
} from '@/modules/customer-service/api/calibrations.api';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type {
  CustomerServiceCalibrationProblemType,
  CustomerServiceCalibrationRecord,
  CustomerServiceCalibrationScopeType,
  CustomerServiceCalibrationStatus,
  CustomerServiceStrategyDraftRegressionEvidence
} from '@/modules/customer-service/types/calibrations.types';

const props = defineProps<{
  roles: CustomerServiceMerchantRole[];
  canAnalyze: boolean;
  canUpdate: boolean;
  canPublish: boolean;
  regressionEvidence?: CustomerServiceStrategyDraftRegressionEvidence | null;
  mobile?: boolean;
}>();
const emit = defineEmits<{ startStrategyDraftRegression: [versionId: string] }>();
const loading = ref(false);
const analyzingId = ref('');
const applyingId = ref('');
const draftingId = ref('');
const recordingRegressionId = ref('');
const publishingId = ref('');
const items = ref<CustomerServiceCalibrationRecord[]>([]);
const total = ref(0);
const drawerVisible = ref(false);
const detail = ref<CustomerServiceCalibrationRecord | null>(null);
const applyScopeType = ref<CustomerServiceCalibrationScopeType>('ROLE_CONTEXT');
const filters = reactive({ keyword: '', status: '', problemType: '', merchantRoleId: '', page: 1, pageSize: 10 });
const statusOptions = [
  { value: 'OPEN', label: '待处理' },
  { value: 'AI_ANALYZED', label: 'AI 已分析' },
  { value: 'ACCEPTED', label: '已确认方向' },
  { value: 'APPLIED_TUNING', label: '已应用调优' },
  { value: 'ARCHIVED', label: '已归档' }
];
const problemTypeOptions: Array<{ value: CustomerServiceCalibrationProblemType; label: string }> = [
  { value: 'AI_TONE', label: 'AI 感强' }, { value: 'REDUNDANT', label: '废话过多' }, { value: 'REPETITIVE', label: '重复表达' },
  { value: 'UNNATURAL', label: '语气不自然' }, { value: 'ROLE_INCONSISTENT', label: '角色不一致' }, { value: 'EMOTION_MISMATCH', label: '共情不准确' },
  { value: 'TOO_MANY_QUESTIONS', label: '提问过多' }, { value: 'FACT_ERROR', label: '事实问题' }, { value: 'WORKFLOW_ERROR', label: '流程问题' },
  { value: 'SALES_OVERREACH', label: '销售过度' }, { value: 'TOO_FORMAL', label: '过度正式' },
  { value: 'UNDERSTANDING_MISCLASSIFICATION', label: '意图识别误判' }, { value: 'OTHER', label: '其他' }
];
const scopeOptions = computed<Array<{ value: CustomerServiceCalibrationScopeType; label: string; description: string }>>(() => {
  if (detail.value?.robotId && detail.value.accountProfileId) {
    const exact: Array<{ value: CustomerServiceCalibrationScopeType; label: string; description: string }> = [
      { value: 'ROBOT_CONTEXT', label: '当前角色 + 身份/背景 + 当前机器人 + 完整上下文（推荐）', description: '立即生效，并在同一组合的新会话中按相同场景/意图/风险自动继承。' },
      { value: 'ROBOT_SCENARIO', label: '当前角色 + 身份/背景 + 当前机器人 + 场景', description: '立即生效，并在该机器人当前场景的新会话中继承。' },
      { value: 'ROBOT_GLOBAL', label: '当前角色 + 身份/背景 + 当前机器人全局', description: '立即生效，该组合所有后续新会话都会继承。' },
    ];
    return props.canPublish ? [
      ...exact,
      { value: 'ROLE_SCENARIO', label: '扩大为角色 + 场景共享策略', description: '不会立即扩大生效；需回归并发布。' },
      { value: 'ROLE_GLOBAL', label: '扩大为角色全局共享策略', description: '不会立即扩大生效；需回归并发布。' },
    ] : exact;
  }
  if (detail.value?.accountProfileId) {
    const exact: Array<{ value: CustomerServiceCalibrationScopeType; label: string; description: string }> = [
      { value: 'ACCOUNT_CONTEXT', label: '当前角色 + 身份/背景 + 完整上下文（推荐）', description: '立即生效，并在同一角色与身份/背景的新会话中继承。' },
      { value: 'ACCOUNT_SCENARIO', label: '当前角色 + 身份/背景 + 场景', description: '立即生效，并在该身份/背景当前场景的新会话中继承。' },
      { value: 'ACCOUNT_GLOBAL', label: '当前角色 + 身份/背景全局', description: '立即生效，并在该角色与身份/背景所有新会话中继承。' },
    ];
    return props.canPublish ? [
      ...exact,
      { value: 'ROLE_SCENARIO', label: '扩大为角色 + 场景共享策略', description: '不会立即扩大生效；需回归并发布。' },
      { value: 'ROLE_GLOBAL', label: '扩大为角色全局共享策略', description: '不会立即扩大生效；需回归并发布。' },
    ] : exact;
  }
  return [
    { value: 'ROLE_CONTEXT', label: '当前角色 + 完整场景上下文', description: '角色级共享策略候选，需聚合证据、回归并发布。' },
    { value: 'ROLE_SCENARIO', label: '当前角色 + 当前场景', description: '角色级共享策略候选，需回归并发布。' },
    { value: 'ROLE_GLOBAL', label: '当前角色全局', description: '角色级共享策略候选，需回归并发布。' },
  ];
});
const selectedRecordScopeImmediate = computed(() => isImmediateScopeType(applyScopeType.value));
const recordScopeAlert = computed<{ title: string; description: string; type: 'success' | 'warning' }>(() => selectedRecordScopeImmediate.value
  ? { title: '确认后立即生效并跨新会话继承', description: '精确作用域只加载抽象校准目标/行为原则，不照抄建议回复原句。', type: 'success' }
  : { title: '角色级扩大仍需发布', description: '本次只保存为共享策略候选；需生成策略草稿、完成全量回归并人工发布。', type: 'warning' });
const recordApplyButtonLabel = computed(() => selectedRecordScopeImmediate.value ? '应用校准并立即生效' : '保存为角色级共享策略候选');
const appliedDetailTitle = computed(() => {
  if (!detail.value) return '校准已应用';
  const target = detail.value.appliedProfile?.title || detail.value.appliedScopeKey || '当前校准档案';
  return isImmediateScopeType(detail.value.appliedScopeType)
    ? `精确校准已${detail.value.appliedProfile?.status === 'ACTIVE' ? '生效' : '保存'}：${target}`
    : `角色级共享策略候选已保存：${target}`;
});
const appliedDetailDescription = computed(() => {
  if (!detail.value) return '';
  if (isImmediateScopeType(detail.value.appliedScopeType)) {
    return detail.value.appliedProfile?.status === 'ACTIVE'
      ? '同一角色、身份/背景和账号作用域的后续新会话会自动继承。'
      : '该历史精确校准当前未启用，可到“校准档案”重新启用。';
  }
  return '扩大到角色级仍需在下方生成策略草稿、完成回归并人工发布。';
});

onMounted(load);
defineExpose({ reload: load });

async function load() {
  loading.value = true;
  try {
    const result = await listCustomerServiceCalibrations({
      page: filters.page, pageSize: filters.pageSize, keyword: filters.keyword || undefined,
      status: filters.status || undefined, problemType: filters.problemType || undefined, merchantRoleId: filters.merchantRoleId || undefined
    });
    items.value = result.items;
    total.value = result.total;
  } finally { loading.value = false; }
}
function reset() { Object.assign(filters, { keyword: '', status: '', problemType: '', merchantRoleId: '', page: 1 }); load(); }
async function openDetail(item: CustomerServiceCalibrationRecord) {
  detail.value = await getCustomerServiceCalibration(item.id);
  applyScopeType.value = detail.value.appliedScopeType || defaultRecordApplyScope(detail.value);
  drawerVisible.value = true;
}
async function analyze(item: CustomerServiceCalibrationRecord) {
  analyzingId.value = item.id;
  try {
    const updated = await analyzeCustomerServiceCalibration(item.id);
    ElMessage.success('AI 校准分析完成，已生成可复用调优约束');
    detail.value = updated;
    await load();
  } finally { analyzingId.value = ''; }
}
async function applyToTuning(item: CustomerServiceCalibrationRecord) {
  const expandingToRole = Boolean(item.accountProfileId) && applyScopeType.value.startsWith('ROLE_');
  if (expandingToRole) {
    try {
      await ElMessageBox.confirm('这会把当前精确校准扩大为角色级共享策略候选。本次不会直接扩大生效，后续仍需完整回归和人工发布。', '确认扩大校准范围', { type: 'warning' });
    } catch { return; }
  }
  applyingId.value = item.id;
  try {
    const applied = await applyCustomerServiceCalibrationToTuning(item.id, applyScopeType.value, expandingToRole);
    detail.value = applied.record;
    ElMessage.success(isImmediateScopeType(applied.record.appliedScopeType) && applied.profile.status === 'ACTIVE'
      ? '校准已立即生效，后续新会话会自动继承'
      : '已保存为角色级共享策略候选；需回归并发布后扩大生效');
    await load();
  } finally { applyingId.value = ''; }
}
async function createStrategyDraft(item: CustomerServiceCalibrationRecord) {
  draftingId.value = item.id;
  try {
    const result = await createCustomerServiceCalibrationStrategyDraft(item.id);
    detail.value = result.record;
    ElMessage.success(result.strategyDraft.reused ? '已读取现有策略草稿' : '结构化策略草稿已生成，尚未发布');
    await load();
  } finally { draftingId.value = ''; }
}
function startDraftRegression(item: CustomerServiceCalibrationRecord) {
  if (!item.strategyDraftVersionId) return;
  emit('startStrategyDraftRegression', item.strategyDraftVersionId);
}
function canRecordRegression(item: CustomerServiceCalibrationRecord) {
  return Boolean(
    props.canUpdate
    && item.strategyDraftVersionId
    && props.regressionEvidence?.strategyVersionId === item.strategyDraftVersionId,
  );
}
async function recordDraftRegression(item: CustomerServiceCalibrationRecord) {
  if (!props.regressionEvidence || !canRecordRegression(item)) return;
  recordingRegressionId.value = item.id;
  try {
    const result = await recordCustomerServiceCalibrationStrategyRegression(item.id, props.regressionEvidence);
    detail.value = result.record;
    ElMessage.success(result.publishAllowed
      ? '回归结果已记录：全部通过，发布门禁已开放'
      : '回归结果已记录：存在失败或受限用例，发布门禁保持关闭');
    await load();
  } finally { recordingRegressionId.value = ''; }
}
async function publishDraft(item: CustomerServiceCalibrationRecord) {
  await ElMessageBox.confirm(
    '确认发布当前已通过全量回归的策略草稿？同一资产的旧发布版本会自动归档，并可从版本历史创建回滚草稿。',
    '发布校准策略',
    { type: 'warning' },
  );
  publishingId.value = item.id;
  try {
    const result = await publishCustomerServiceCalibrationStrategyDraft(item.id);
    detail.value = result.record;
    ElMessage.success(result.version.reused ? '该策略已经发布' : '校准策略已发布并进入正式策略编译链');
    await load();
  } finally { publishingId.value = ''; }
}
async function changeStatus(item: CustomerServiceCalibrationRecord, status: string) {
  const updated = await updateCustomerServiceCalibrationStatus(item.id, status as CustomerServiceCalibrationStatus);
  ElMessage.success(status === 'ACCEPTED' ? '已确认调优方向，尚未应用到生成链路' : '校准状态已更新');
  detail.value = detail.value?.id === updated.id ? updated : detail.value;
  await load();
}
function isImmediateScopeType(value: string | null | undefined) { return Boolean(value && (value.startsWith('ROBOT_') || value.startsWith('ACCOUNT_'))); }
function defaultRecordApplyScope(item: CustomerServiceCalibrationRecord): CustomerServiceCalibrationScopeType {
  if (item.robotId && item.accountProfileId) return 'ROBOT_CONTEXT';
  if (item.accountProfileId) return 'ACCOUNT_CONTEXT';
  return 'ROLE_CONTEXT';
}
function problemLabel(value: string) { return problemTypeOptions.find((item) => item.value === value)?.label || value; }
function canApplyToTuning(item: CustomerServiceCalibrationRecord) { return !item.problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION'); }
function statusLabel(value: string) { return statusOptions.find((item) => item.value === value)?.label || value; }
function statusTag(value: string): 'success' | 'warning' | 'info' | 'danger' {
  return value === 'APPLIED_TUNING' || value === 'ACCEPTED' ? 'success' : value === 'AI_ANALYZED' ? 'warning' : value === 'ARCHIVED' ? 'info' : 'danger';
}
function configScopeLabel(scope: string) { return ({ ROLE_PROTOTYPE: '角色原型', MERCHANT_ROLE: '客服角色', ROLE_MODULE: '角色模块', INDUSTRY_CAPABILITY: '行业能力', RESPONSE_RULE: '回复与流程', QUALITY_RULE: '质量规则', GENERATION_PROMPT: '生成约束', UNDERSTANDING_RULE: '意图理解机制' } as Record<string, string>)[scope] || scope; }
function priorityTag(priority: string): 'danger' | 'warning' | 'info' { return priority === 'HIGH' ? 'danger' : priority === 'MEDIUM' ? 'warning' : 'info'; }
function formatTime(value: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'; }
async function copySuggested() { if (!detail.value?.suggestedReply) return; await navigator.clipboard.writeText(detail.value.suggestedReply); ElMessage.success('建议回复已复制'); }
</script>
