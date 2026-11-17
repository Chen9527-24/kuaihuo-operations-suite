<template>
  <div class="space-y-4">
    <PageToolbar title="客户意图与流程" description="从真实多轮对话持续识别客户意图；识别结果先进入待审核池，只有逐条点击“作为意图加入”后，才生成正式意图草稿。">
      <template #actions>
        <el-button v-if="activeTab === 'definitions' && canCreate" type="primary" @click="openCreate">新增客户意图</el-button>
      </template>
    </PageToolbar>

    <el-tabs v-model="activeTab" type="card" @tab-change="handleTabChange">
      <el-tab-pane label="正式意图与流程" name="definitions" />
      <el-tab-pane name="candidates">
        <template #label>
          <span>候选意图</span>
          <el-badge v-if="pendingCandidateTotal" :value="pendingCandidateTotal" :max="99" class="ml-2" />
        </template>
      </el-tab-pane>
      <el-tab-pane label="识别记录" name="recognitions" />
    </el-tabs>

    <template v-if="activeTab === 'definitions'">
      <el-card shadow="never">
        <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
          <el-form-item label="关键词" class="!mb-0"><el-input v-model="filters.keyword" clearable placeholder="名称 / 编码 / 场景" @keyup.enter="fetchItems(true)" /></el-form-item>
          <el-form-item label="分类" class="!mb-0"><el-select v-model="filters.category" clearable placeholder="全部分类"><el-option v-for="item in categoryOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="状态" class="!mb-0"><el-select v-model="filters.status" clearable placeholder="全部状态"><el-option label="待审核草稿" value="DRAFT" /><el-option label="启用" value="ENABLED" /><el-option label="停用" value="DISABLED" /><el-option label="归档" value="ARCHIVED" /></el-select></el-form-item>
          <el-form-item label="操作" class="!mb-0"><div class="flex gap-2"><el-button type="primary" @click="fetchItems(true)">查询</el-button><el-button @click="reset">重置</el-button></div></el-form-item>
        </el-form>
      </el-card>

      <el-alert title="正式意图不是固定回复模板，而是可复用的识别定义、处理目标、流程和边界。运行时每一轮仍会结合多轮上下文重新判断主次意图和阶段。" type="info" :closable="false" show-icon />

      <div class="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <el-card shadow="never" class="h-fit xl:sticky xl:top-4">
          <template #header><span class="font-semibold">意图分类</span></template>
          <div class="space-y-2">
            <button v-for="item in categorySummary" :key="item.value" type="button" class="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition" :class="filters.category === item.value ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:bg-slate-50'" @click="selectCategory(item.value)">
              <span>{{ item.label }}</span><el-tag size="small" type="info">{{ item.count }}</el-tag>
            </button>
          </div>
        </el-card>

        <CrudTablePanel title="正式客户意图、事件与处理流程">
          <el-table v-loading="loading" :data="items" row-key="id" stripe>
            <el-table-column prop="name" label="客户意图" min-width="190"><template #default="{ row }"><div class="font-medium">{{ row.name }}</div><div class="text-xs text-slate-400">{{ row.key }}</div></template></el-table-column>
            <el-table-column prop="category" label="分类" width="100"><template #default="{ row }">{{ categoryLabel(row.category) }}</template></el-table-column>
            <el-table-column label="场景 / 主意图" min-width="220"><template #default="{ row }"><div>{{ row.scenario }}</div><div class="text-xs text-slate-400">{{ row.primaryIntent }}</div></template></el-table-column>
            <el-table-column label="情绪与处理" min-width="220"><template #default="{ row }"><div>{{ readStrategy(row, 'emotionalPosture') || '-' }}</div><div class="text-xs text-slate-400">销售 {{ readStrategy(row, 'salesVisibility') || '-' }} · 问题预算 {{ readStrategy(row, 'questionBudget') ?? '-' }}</div></template></el-table-column>
            <el-table-column label="流程" min-width="220"><template #default="{ row }"><span class="text-sm">{{ flowSummary(row) }}</span></template></el-table-column>
            <el-table-column label="样本" width="90"><template #default="{ row }">{{ sampleCount(row) }}</template></el-table-column>
            <el-table-column prop="priority" label="优先级" width="90" />
            <el-table-column prop="status" label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ENABLED' ? 'success' : row.status === 'DRAFT' ? 'warning' : 'info'">{{ definitionStatusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button></template></el-table-column>
          </el-table>
          <template #footer><CrudPaginationBar :current-page="filters.page" :page-size="filters.pageSize" :total="total" @update:current-page="filters.page = $event; fetchItems()" @update:page-size="filters.pageSize = $event; fetchItems(true)" /></template>
        </CrudTablePanel>
      </div>
    </template>

    <template v-else-if="activeTab === 'candidates'">
      <el-card shadow="never">
        <el-form :model="candidateFilters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
          <el-form-item label="关键词" class="!mb-0"><el-input v-model="candidateFilters.keyword" clearable placeholder="名称 / 识别编码 / 场景" @keyup.enter="fetchCandidates(true)" /></el-form-item>
          <el-form-item label="分类" class="!mb-0"><el-select v-model="candidateFilters.category" clearable placeholder="全部分类"><el-option v-for="item in categoryOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="状态" class="!mb-0"><el-select v-model="candidateFilters.status" clearable placeholder="全部状态"><el-option label="待确认" value="PENDING" /><el-option label="已转为草稿" value="CONVERTED" /><el-option label="已忽略" value="IGNORED" /></el-select></el-form-item>
          <el-form-item label="操作" class="!mb-0"><div class="flex gap-2"><el-button type="primary" @click="fetchCandidates(true)">查询</el-button><el-button @click="resetCandidates">重置</el-button></div></el-form-item>
        </el-form>
      </el-card>

      <el-alert title="这里自动汇总真实对话中未精确命中正式意图库的客户意图。重复表达会聚合为同一条候选，并累计出现次数、平均置信度和样本；系统不会自动发布，也不会批量加入。" type="warning" :closable="false" show-icon />

      <CrudTablePanel title="从真实对话收集的已识别意图">
        <el-table v-loading="candidateLoading" :data="candidates" row-key="id" stripe>
          <el-table-column label="已识别意图" min-width="210"><template #default="{ row }"><div class="flex items-center gap-2"><span class="font-medium">{{ row.name }}</span><el-tag v-if="row.relatedDefinitionId" size="small" type="warning">存在相关意图</el-tag></div><div class="text-xs text-slate-400">{{ row.recognitionKey }}</div><div class="mt-1 line-clamp-2 text-xs text-slate-500">{{ row.description }}</div></template></el-table-column>
          <el-table-column label="建议归属" min-width="220"><template #default="{ row }"><div>{{ categoryLabel(row.suggestedCategory) }} · {{ row.suggestedScenario }}</div><div class="text-xs text-slate-400">{{ row.suggestedPrimaryIntent }} · {{ row.suggestedRiskLevel }}</div></template></el-table-column>
          <el-table-column label="识别稳定性" min-width="170"><template #default="{ row }"><div>出现 {{ row.occurrenceCount }} 次</div><div class="text-xs text-slate-400">平均 {{ percent(row.averageConfidence) }} · 最高 {{ percent(row.maxConfidence) }}</div></template></el-table-column>
          <el-table-column label="识别依据" min-width="260"><template #default="{ row }"><div class="line-clamp-3 text-sm text-slate-600">{{ Array.isArray(row.evidence) && row.evidence.length ? row.evidence.join('；') : '暂无可展示依据' }}</div></template></el-table-column>
          <el-table-column label="最后识别" width="165"><template #default="{ row }">{{ formatTime(row.lastSeenAt) }}</template></el-table-column>
          <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="candidateStatusType(row.status)">{{ candidateStatusLabel(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="逐条处理" width="210" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'PENDING' && canCreate" link type="primary" :loading="convertingCandidateId === row.id" @click="convertCandidate(row)">作为意图加入</el-button>
              <el-button v-if="row.status === 'PENDING' && canUpdate" link type="info" @click="setCandidateStatus(row, 'IGNORED')">忽略</el-button>
              <el-button v-if="row.status === 'IGNORED' && canUpdate" link type="primary" @click="setCandidateStatus(row, 'PENDING')">恢复待确认</el-button>
              <span v-if="row.status === 'CONVERTED'" class="text-xs text-slate-500">已生成待审核草稿</span>
            </template>
          </el-table-column>
        </el-table>
        <template #footer><CrudPaginationBar :current-page="candidateFilters.page" :page-size="candidateFilters.pageSize" :total="candidateTotal" @update:current-page="candidateFilters.page = $event; fetchCandidates()" @update:page-size="candidateFilters.pageSize = $event; fetchCandidates(true)" /></template>
      </CrudTablePanel>
    </template>

    <template v-else>
      <el-card shadow="never">
        <el-form :model="recognitionFilters" class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <el-form-item label="关键词" class="!mb-0"><el-input v-model="recognitionFilters.keyword" clearable placeholder="客户消息 / 会话标题" @keyup.enter="fetchRecognitionRecords(true)" /></el-form-item>
          <el-form-item label="记录类型" class="!mb-0"><el-select v-model="recognitionFilters.runType" clearable placeholder="全部"><el-option label="只分析" value="COMPILE" /><el-option label="发送并生成" value="EXECUTE" /></el-select></el-form-item>
          <el-form-item label="操作" class="!mb-0"><div class="flex gap-2"><el-button type="primary" @click="fetchRecognitionRecords(true)">查询</el-button><el-button @click="resetRecognitionRecords">重置</el-button></div></el-form-item>
        </el-form>
      </el-card>

      <el-alert title="每一次完整分析都会保留识别记录，包括精确命中正式意图的分析。稳定意图、当前事件、当前状态和弱信号在记录中分层展示；精确命中不会重复创建候选意图。" type="info" :closable="false" show-icon />

      <CrudTablePanel title="完整对话识别记录">
        <el-table v-loading="recognitionLoading" :data="recognitionRecords" row-key="id" stripe>
          <el-table-column label="调优会话" min-width="190"><template #default="{ row }"><div class="font-medium">{{ row.session.title }}</div><div class="text-xs text-slate-400">第 {{ row.sequenceNo }} 次分析 · {{ row.runType === 'EXECUTE' ? '发送并生成' : '只分析' }}</div></template></el-table-column>
          <el-table-column label="客户最新消息" min-width="240"><template #default="{ row }"><div class="line-clamp-3 text-sm leading-6">{{ row.latestMessage }}</div></template></el-table-column>
          <el-table-column label="系统主意图" min-width="190"><template #default="{ row }"><div class="font-medium">{{ row.primaryIntent || summaryOf(row).primaryIntent || '—' }}</div><div class="text-xs text-slate-400">{{ row.primaryScenario || summaryOf(row).primaryScenario || '—' }} · {{ phaseOf(row) }}</div></template></el-table-column>
          <el-table-column label="匹配结果" min-width="210"><template #default="{ row }"><div class="flex flex-wrap gap-1"><el-tag v-for="item in intentItems(row)" :key="`${item.type}:${item.name}`" size="small" :type="matchTagType(item.matchStatus)">{{ item.name }} · {{ matchLabel(item.matchStatus) }}</el-tag><span v-if="!intentItems(row).length" class="text-xs text-slate-400">无稳定意图项</span></div></template></el-table-column>
          <el-table-column label="本轮变化" min-width="260"><template #default="{ row }"><div class="space-y-1 text-xs text-slate-600"><div><b>事件：</b>{{ recognitionNames(row, 'EVENT') }}</div><div><b>状态：</b>{{ recognitionNames(row, 'STATE') }}</div><div><b>弱信号：</b>{{ recognitionNames(row, 'SIGNAL') }}</div></div></template></el-table-column>
          <el-table-column label="质量 / 时间" width="175"><template #default="{ row }"><div><el-tag size="small" :type="qualityTagType(row.qualityStatus || undefined)">{{ row.qualityStatus || '未生成' }}</el-tag></div><div class="mt-1 text-xs text-slate-400">{{ formatTime(row.createdAt) }}</div></template></el-table-column>
          <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openRecognitionSession(row)">打开调优会话</el-button></template></el-table-column>
        </el-table>
        <template #footer><CrudPaginationBar :current-page="recognitionFilters.page" :page-size="recognitionFilters.pageSize" :total="recognitionTotal" @update:current-page="recognitionFilters.page = $event; fetchRecognitionRecords()" @update:page-size="recognitionFilters.pageSize = $event; fetchRecognitionRecords(true)" /></template>
      </CrudTablePanel>
    </template>

    <IntentDefinitionFormDialog v-model="formOpen" :mode="formMode" :initial-data="editing" :submitting="submitting" @submit="save" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import {
  convertCustomerServiceIntentCandidate,
  createCustomerServiceIntentDefinition,
  listCustomerServiceIntentCandidates,
  listCustomerServiceIntentDefinitions,
  updateCustomerServiceIntentCandidateStatus,
  updateCustomerServiceIntentDefinition,
} from '@/modules/customer-service/api/intent-definitions.api';
import { listCustomerServiceTuningAnalyses } from '@/modules/customer-service/api/tuning-sessions.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import type {
  CustomerServiceIntentCandidate,
  CustomerServiceIntentCandidateStatus,
  CustomerServiceIntentDefinition,
  CustomerServiceIntentPayload,
  CustomerServiceIntentStatus,
} from '@/modules/customer-service/types/intent-definitions.types';
import type { CustomerServiceRecognizedItem } from '@/modules/customer-service/types/simulation.types';
import type { CustomerServiceRecognitionRecord } from '@/modules/customer-service/types/tuning-sessions.types';
import IntentDefinitionFormDialog from './components/IntentDefinitionFormDialog.vue';

const { has } = useCustomerServicePermission();
const router = useRouter();
const activeTab = ref<'definitions' | 'candidates' | 'recognitions'>('definitions');
const loading = ref(false);
const candidateLoading = ref(false);
const recognitionLoading = ref(false);
const submitting = ref(false);
const convertingCandidateId = ref('');
const items = ref<CustomerServiceIntentDefinition[]>([]);
const candidates = ref<CustomerServiceIntentCandidate[]>([]);
const recognitionRecords = ref<CustomerServiceRecognitionRecord[]>([]);
const total = ref(0);
const candidateTotal = ref(0);
const recognitionTotal = ref(0);
const pendingCandidateTotal = ref(0);
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceIntentDefinition | null>(null);
const filters = reactive({ keyword: '', category: '', scenario: '', status: '', page: 1, pageSize: 20 });
const candidateFilters = reactive({ keyword: '', category: '', status: 'PENDING', page: 1, pageSize: 20 });
const recognitionFilters = reactive({ keyword: '', runType: '', page: 1, pageSize: 20 });
const categoryOptions = [
  { label: '关系与闲聊', value: 'RELATIONSHIP' }, { label: '售前', value: 'PRE_SALE' }, { label: '订单', value: 'ORDER' },
  { label: '物流', value: 'LOGISTICS' }, { label: '售后', value: 'AFTER_SALE' }, { label: '安全', value: 'SAFETY' },
];
const canCreate = computed(() => has('customer-service:response-rule:create'));
const canUpdate = computed(() => has('customer-service:response-rule:update'));
const categorySummary = computed(() => categoryOptions.map((item) => ({ ...item, count: items.value.filter((entry) => entry.category === item.value).length })));

onMounted(async () => { await Promise.all([fetchItems(), refreshPendingCount()]); });
async function handleTabChange(name: string | number) {
  if (name === 'candidates') await fetchCandidates();
  if (name === 'recognitions') await fetchRecognitionRecords();
}
async function fetchItems(resetPage = false) {
  if (resetPage) filters.page = 1;
  loading.value = true;
  try { const result = await listCustomerServiceIntentDefinitions({ ...filters }); items.value = result.items; total.value = result.total; }
  finally { loading.value = false; }
}
async function fetchCandidates(resetPage = false) {
  if (resetPage) candidateFilters.page = 1;
  candidateLoading.value = true;
  try { const result = await listCustomerServiceIntentCandidates({ ...candidateFilters }); candidates.value = result.items; candidateTotal.value = result.total; await refreshPendingCount(); }
  finally { candidateLoading.value = false; }
}
async function fetchRecognitionRecords(resetPage = false) {
  if (resetPage) recognitionFilters.page = 1;
  recognitionLoading.value = true;
  try {
    const result = await listCustomerServiceTuningAnalyses({ ...recognitionFilters });
    recognitionRecords.value = result.items;
    recognitionTotal.value = result.total;
  } finally { recognitionLoading.value = false; }
}

async function refreshPendingCount() {
  const result = await listCustomerServiceIntentCandidates({ keyword: '', category: '', status: 'PENDING', page: 1, pageSize: 1 });
  pendingCandidateTotal.value = result.total;
}
function reset() { Object.assign(filters, { keyword: '', category: '', scenario: '', status: '', page: 1, pageSize: 20 }); void fetchItems(); }
function resetCandidates() { Object.assign(candidateFilters, { keyword: '', category: '', status: 'PENDING', page: 1, pageSize: 20 }); void fetchCandidates(); }
function resetRecognitionRecords() { Object.assign(recognitionFilters, { keyword: '', runType: '', page: 1, pageSize: 20 }); void fetchRecognitionRecords(); }
function selectCategory(value: string) { filters.category = filters.category === value ? '' : value; void fetchItems(true); }
function openCreate() { formMode.value = 'create'; editing.value = null; formOpen.value = true; }
function openEdit(item: CustomerServiceIntentDefinition) { formMode.value = 'edit'; editing.value = item; formOpen.value = true; }
async function save(payload: CustomerServiceIntentPayload & { revision: number }) {
  submitting.value = true;
  try {
    if (formMode.value === 'create') { const { revision: _revision, ...createPayload } = payload; await createCustomerServiceIntentDefinition(createPayload); }
    else if (editing.value) { const { key: _key, ...updatePayload } = payload; await updateCustomerServiceIntentDefinition(editing.value.id, updatePayload); }
    formOpen.value = false; ElMessage.success('客户意图与流程已保存'); await fetchItems();
  } finally { submitting.value = false; }
}
async function convertCandidate(row: CustomerServiceIntentCandidate) {
  await ElMessageBox.confirm(`将“${row.name}”生成一份待审核正式意图草稿？系统不会自动启用。`, '作为意图加入', { type: 'warning', confirmButtonText: '生成草稿', cancelButtonText: '取消' });
  convertingCandidateId.value = row.id;
  try {
    const result = await convertCustomerServiceIntentCandidate(row.id);
    ElMessage.success(`已生成“${result.definition.name}”意图草稿，请逐项审核识别规则和处理流程`);
    await Promise.all([fetchCandidates(), fetchItems(true)]);
  } finally { convertingCandidateId.value = ''; }
}
async function setCandidateStatus(row: CustomerServiceIntentCandidate, status: 'PENDING' | 'IGNORED') {
  await updateCustomerServiceIntentCandidateStatus(row.id, status);
  ElMessage.success(status === 'IGNORED' ? '已忽略该识别意图' : '已恢复为待确认');
  await fetchCandidates();
}
function categoryLabel(value: string) { return categoryOptions.find((item) => item.value === value)?.label ?? value; }
function readStrategy(row: CustomerServiceIntentDefinition, key: string) { return row.strategyConfig?.[key] as string | number | null | undefined; }
function flowSummary(row: CustomerServiceIntentDefinition) { const steps = Array.isArray(row.flowConfig?.steps) ? row.flowConfig.steps as Array<Record<string, unknown>> : []; return steps.slice(0, 3).map((item) => String(item.name || item.code || '')).filter(Boolean).join(' → ') || '未配置流程'; }
function sampleCount(row: CustomerServiceIntentDefinition) { const examples = row.examples || {}; return Object.values(examples).reduce((count, value) => count + (Array.isArray(value) ? value.length : 0), 0); }
function definitionStatusLabel(status: CustomerServiceIntentStatus) { return ({ DRAFT: '待审核', ENABLED: '启用', DISABLED: '停用', ARCHIVED: '归档' } as Record<string, string>)[status] || status; }
function candidateStatusLabel(status: CustomerServiceIntentCandidateStatus) { return ({ PENDING: '待确认', CONVERTED: '已转草稿', IGNORED: '已忽略' } as Record<string, string>)[status] || status; }
function candidateStatusType(status: CustomerServiceIntentCandidateStatus) { return status === 'PENDING' ? 'warning' : status === 'CONVERTED' ? 'success' : 'info'; }
function percent(value: number) { return `${Math.round((Number(value) || 0) * 100)}%`; }
function summaryOf(row: CustomerServiceRecognitionRecord) { return (row.summary || {}) as Record<string, any>; }
function intentItems(row: CustomerServiceRecognitionRecord) { return recognizedItemsOf(row).filter((item) => item.type === 'INTENT'); }
function recognitionNames(row: CustomerServiceRecognitionRecord, type: CustomerServiceRecognizedItem['type']) { const names = recognizedItemsOf(row).filter((item) => item.type === type).map((item) => item.name); return names.length ? names.join('、') : '无'; }
function recognizedItemsOf(row: CustomerServiceRecognitionRecord) { return Array.isArray(summaryOf(row).recognizedItems) ? summaryOf(row).recognizedItems as Array<{ type: string; name: string; matchStatus: CustomerServiceRecognizedItem['matchStatus']; isPrimary: boolean }> : []; }
function phaseOf(row: CustomerServiceRecognitionRecord) { return String(summaryOf(row).conversationPhase || '—'); }
function matchLabel(value: CustomerServiceRecognizedItem['matchStatus']) { return ({ EXACT: '精确命中', RELATED: '相关匹配', UNMATCHED: '未匹配' } as Record<string, string>)[value] || value; }
function matchTagType(value: CustomerServiceRecognizedItem['matchStatus']) { return value === 'EXACT' ? 'success' : value === 'RELATED' ? 'warning' : 'info'; }
function qualityTagType(value?: string) { return value === 'PASS' ? 'success' : value === 'FAIL' ? 'danger' : value === 'WARN' ? 'warning' : 'info'; }
async function openRecognitionSession(row: CustomerServiceRecognitionRecord) { localStorage.setItem('customer-service:reply-tuning:active-session', row.sessionId); localStorage.setItem(`customer-service:reply-tuning:selected-analysis:${row.sessionId}`, row.id); await router.push('/customer-service/simulation'); }
function formatTime(value: string) { return value ? new Date(value).toLocaleString() : '-'; }
</script>
