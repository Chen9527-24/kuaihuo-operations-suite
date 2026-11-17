<template>
  <div class="space-y-4">
    <el-alert
      title="校准档案会持续保存管理员确认过的抽象校准原则。运行时按“机器人上下文 → 机器人场景 → 机器人全局 → 身份上下文 → 身份场景 → 身份全局”确定优先级；同层更具体上下文优先，再按最近应用优先。非冲突原则会继续累积，近似重复或被新校准反向修正的旧原则会被收敛。角色级作用域仍只作为共享策略候选。"
      type="info"
      :closable="false"
      show-icon
    />

    <el-card shadow="never">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <el-input v-model="filters.keyword" clearable placeholder="搜索档案名称、角色或作用域" @keyup.enter="load" />
        <el-select v-model="filters.status" clearable placeholder="全部状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.scopeType" clearable placeholder="全部作用域">
          <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.merchantRoleId" clearable filterable placeholder="全部客服角色">
          <el-option v-for="item in roles" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
        </el-select>
        <div class="flex gap-2"><el-button type="primary" @click="load">查询</el-button><el-button @click="reset">重置</el-button></div>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">校准记忆档案</span><span class="text-xs text-slate-500">共 {{ total }} 份</span></div></template>
      <el-table v-if="!mobile" v-loading="loading" :data="items" row-key="id">
        <el-table-column label="档案" min-width="220">
          <template #default="scope"><div class="font-medium">{{ scope.row.title }}</div><div class="mt-1 text-xs text-slate-400">{{ scopeLabel(scope.row.scopeType) }}</div></template>
        </el-table-column>
        <el-table-column label="客服角色" min-width="130"><template #default="scope">{{ scope.row.merchantRole.name }}</template></el-table-column>
        <el-table-column label="行业 / 场景" min-width="220">
          <template #default="scope"><div>{{ scope.row.industryNode?.path || '角色通用' }}</div><div class="mt-1 text-xs text-slate-400">{{ scope.row.scenario || '*' }} / {{ scope.row.intent || '*' }} / {{ scope.row.riskLevel || '*' }}</div></template>
        </el-table-column>
        <el-table-column label="累计校准" width="100"><template #default="scope">{{ scope.row.appliedCount }} 次</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="scope"><el-tag :type="profileStatusTag(scope.row.status)">{{ profileStatusLabel(scope.row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="最后应用" width="170"><template #default="scope">{{ formatTime(scope.row.lastAppliedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="openDetail(scope.row)">查看</el-button>
            <el-button v-if="canUpdate && scope.row.status === 'DISABLED'" link type="success" @click="changeStatus(scope.row, 'ACTIVE')">启用</el-button>
            <el-button v-if="canUpdate && scope.row.status === 'ACTIVE'" link type="warning" @click="changeStatus(scope.row, 'DISABLED')">停用</el-button>
            <el-button v-if="canUpdate && scope.row.status !== 'ARCHIVED'" link type="info" @click="changeStatus(scope.row, 'ARCHIVED')">归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else v-loading="loading" class="space-y-3">
        <article v-for="item in items" :key="item.id" class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="flex items-start justify-between gap-3"><div><b>{{ item.title }}</b><div class="mt-1 text-xs text-slate-400">{{ scopeLabel(item.scopeType) }}</div></div><el-tag :type="profileStatusTag(item.status)" size="small">{{ profileStatusLabel(item.status) }}</el-tag></div>
          <div class="mt-3 text-sm">{{ item.merchantRole.name }} · {{ item.industryNode?.path || '角色通用' }}</div>
          <div class="mt-2 text-xs text-slate-500">累计校准 {{ item.appliedCount }} 次 · {{ formatTime(item.lastAppliedAt) }}</div>
          <div class="mt-3 grid grid-cols-2 gap-2"><el-button @click="openDetail(item)">查看详情</el-button><el-button v-if="canUpdate && item.status === 'ACTIVE'" type="warning" plain @click="changeStatus(item, 'DISABLED')">停用</el-button><el-button v-else-if="canUpdate && item.status === 'DISABLED'" type="success" plain @click="changeStatus(item, 'ACTIVE')">启用</el-button></div>
        </article>
        <el-empty v-if="!items.length" description="暂无校准档案" :image-size="64" />
      </div>
      <div class="mt-4 flex justify-end"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" layout="total, prev, pager, next" @current-change="load" /></div>
    </el-card>

    <el-drawer v-model="drawerVisible" title="校准档案详情" :size="mobile ? '100%' : '820px'">
      <div v-if="detail" class="space-y-4">
        <el-descriptions :column="mobile ? 1 : 2" border>
          <el-descriptions-item label="档案名称">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ profileStatusLabel(detail.status) }}</el-descriptions-item>
          <el-descriptions-item label="客服角色">{{ detail.merchantRole.name }}</el-descriptions-item>
          <el-descriptions-item label="作用域">{{ scopeLabel(detail.scopeType) }}</el-descriptions-item>
          <el-descriptions-item label="行业">{{ detail.industryNode?.path || '角色通用' }}</el-descriptions-item>
          <el-descriptions-item label="场景 / 意图 / 风险">{{ detail.scenario || '*' }} / {{ detail.intent || '*' }} / {{ detail.riskLevel || '*' }}</el-descriptions-item>
          <el-descriptions-item label="来源校准">{{ detail.sourceRecordIds.length }} 条</el-descriptions-item>
          <el-descriptions-item label="累计应用">{{ detail.appliedCount }} 次</el-descriptions-item>
          <el-descriptions-item v-if="isImmediateScopeType(detail.scopeType)" label="运行优先级">{{ runtimePriorityLabel(detail.scopeType) }}</el-descriptions-item>
          <el-descriptions-item label="最后更新">{{ formatTime(detail.updatedAt) }}</el-descriptions-item>
        </el-descriptions>

        <el-card shadow="never">
          <template #header><span class="font-semibold">校准规则</span></template>
          <div class="space-y-3 text-sm leading-7">
            <div v-if="detail.directives.goals.length"><b>目标：</b>{{ detail.directives.goals.join('；') }}</div>
            <div v-if="detail.directives.behaviorRules.length"><b>行为规则：</b>{{ detail.directives.behaviorRules.join('；') }}</div>
            <el-alert v-if="isImmediateScopeType(detail.scopeType)" title="即时生效只投影上面的抽象目标和行为规则；历史避免表达、参考句式、句数/问题数、表情和投递配额不会直接进入普通生成。多个 ACTIVE 档案同时命中时，更具体范围优先；同层最近应用优先；非冲突原则继承，近似重复/反向修正以高优先级版本为准。" type="info" :closable="false" show-icon />
            <template v-else>
              <div v-if="detail.directives.avoidExpressions.length"><b>避免表达：</b>{{ detail.directives.avoidExpressions.join('、') }}</div>
              <div v-if="detail.directives.preferredPatterns.length"><b>抽象表达方向：</b>{{ detail.directives.preferredPatterns.join('；') }}</div>
              <div><b>长度与表情：</b>句数上限 {{ detail.directives.maxSentences ?? '按场景预算' }}，问题上限 {{ detail.directives.maxQuestions ?? '按场景预算' }}；表情策略 {{ detail.directives.emojiPolicy }}。上限不等于固定句数。</div>
            </template>
          </div>
        </el-card>

        <el-card v-if="detail.examples?.length" shadow="never">
          <template #header><span class="font-semibold">已确认参考案例（仅用于理解方向，不进入固定话术）</span></template>
          <div v-for="(example, index) in detail.examples" :key="index" class="mb-3 rounded-lg bg-slate-50 p-3 text-sm last:mb-0">
            <div><b>客户：</b>{{ textValue(example.customerMessage) }}</div>
            <div class="mt-2 text-red-700"><b>原回复：</b>{{ textValue(example.originalReply) }}</div>
            <div class="mt-2 text-emerald-700"><b>偏好回复：</b>{{ textValue(example.preferredReply) }}</div>
          </div>
        </el-card>

        <div v-if="canUpdate" class="flex flex-wrap gap-2">
          <el-button v-if="detail.status === 'DISABLED'" type="success" @click="changeStatus(detail, 'ACTIVE')">启用校准</el-button>
          <el-button v-if="detail.status === 'ACTIVE'" type="warning" @click="changeStatus(detail, 'DISABLED')">停用校准</el-button>
          <el-button v-if="detail.status !== 'ARCHIVED'" @click="changeStatus(detail, 'ARCHIVED')">归档</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getCustomerServiceCalibrationProfile,
  listCustomerServiceCalibrationProfiles,
  updateCustomerServiceCalibrationProfileStatus
} from '@/modules/customer-service/api/calibrations.api';
import type {
  CustomerServiceCalibrationProfile,
  CustomerServiceCalibrationProfileStatus,
  CustomerServiceCalibrationScopeType
} from '@/modules/customer-service/types/calibrations.types';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';

const props = defineProps<{ roles: CustomerServiceMerchantRole[]; canUpdate: boolean; mobile?: boolean }>();
const loading = ref(false);
const items = ref<CustomerServiceCalibrationProfile[]>([]);
const total = ref(0);
const drawerVisible = ref(false);
const detail = ref<CustomerServiceCalibrationProfile | null>(null);
const filters = reactive({ keyword: '', status: '', scopeType: '', merchantRoleId: '', page: 1, pageSize: 10 });
const statusOptions: Array<{ value: CustomerServiceCalibrationProfileStatus; label: string }> = [
  { value: 'ACTIVE', label: '已启用' }, { value: 'DISABLED', label: '已停用' }, { value: 'ARCHIVED', label: '已归档' }
];
const scopeOptions: Array<{ value: CustomerServiceCalibrationScopeType; label: string }> = [
  { value: 'ROBOT_CONTEXT', label: '角色 + 身份/背景 + 机器人 + 完整上下文' },
  { value: 'ROBOT_SCENARIO', label: '角色 + 身份/背景 + 机器人 + 场景' },
  { value: 'ROBOT_GLOBAL', label: '角色 + 身份/背景 + 机器人全局' },
  { value: 'ACCOUNT_CONTEXT', label: '角色 + 身份/背景 + 完整上下文' },
  { value: 'ACCOUNT_SCENARIO', label: '角色 + 身份/背景 + 场景' },
  { value: 'ACCOUNT_GLOBAL', label: '角色 + 身份/背景全局' },
  { value: 'ROLE_CONTEXT', label: '角色级共享候选 + 完整上下文' },
  { value: 'ROLE_SCENARIO', label: '角色级共享候选 + 场景' },
  { value: 'ROLE_GLOBAL', label: '角色级共享候选全局' }
];

onMounted(load);
defineExpose({ reload: load });

async function load() {
  loading.value = true;
  try {
    const result = await listCustomerServiceCalibrationProfiles({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      scopeType: filters.scopeType || undefined,
      merchantRoleId: filters.merchantRoleId || undefined
    });
    items.value = result.items;
    total.value = result.total;
  } finally { loading.value = false; }
}
function reset() { Object.assign(filters, { keyword: '', status: '', scopeType: '', merchantRoleId: '', page: 1 }); load(); }
async function openDetail(item: CustomerServiceCalibrationProfile) {
  detail.value = await getCustomerServiceCalibrationProfile(item.id);
  drawerVisible.value = true;
}
async function changeStatus(item: CustomerServiceCalibrationProfile, status: CustomerServiceCalibrationProfileStatus) {
  const immediate = isImmediateScopeType(item.scopeType);
  if (status === 'DISABLED') {
    await ElMessageBox.confirm(
      immediate ? '停用后，该机器人/账号精确校准将不再进入后续生成，新会话也不会继承。确定继续吗？' : '停用后，这份角色级共享候选不再参与后续聚合。确定继续吗？',
      immediate ? '停用当前校准记忆' : '停用共享策略候选',
      { type: 'warning' }
    );
  }
  const updated = await updateCustomerServiceCalibrationProfileStatus(item.id, status);
  detail.value = detail.value?.id === updated.id ? updated : detail.value;
  ElMessage.success(status === 'ACTIVE'
    ? (immediate ? '校准记忆已启用，后续新会话会自动继承' : '角色级共享候选已启用，仅用于聚合；正式共享仍需发布')
    : status === 'DISABLED' ? '校准档案已停用' : '校准档案已归档');
  await load();
}
function isImmediateScopeType(value: string) { return value.startsWith('ROBOT_') || value.startsWith('ACCOUNT_'); }
function runtimePriorityLabel(value: string) {
  return ({
    ROBOT_CONTEXT: '1 · 机器人完整上下文',
    ROBOT_SCENARIO: '2 · 机器人场景',
    ROBOT_GLOBAL: '3 · 机器人全局',
    ACCOUNT_CONTEXT: '4 · 身份完整上下文',
    ACCOUNT_SCENARIO: '5 · 身份场景',
    ACCOUNT_GLOBAL: '6 · 身份全局',
  } as Record<string, string>)[value] || '仅作为共享策略候选';
}
function scopeLabel(value: string) { return scopeOptions.find((item) => item.value === value)?.label || value; }
function profileStatusLabel(value: string) { return statusOptions.find((item) => item.value === value)?.label || value; }
function profileStatusTag(value: string): 'success' | 'warning' | 'info' { return value === 'ACTIVE' ? 'success' : value === 'DISABLED' ? 'warning' : 'info'; }
function formatTime(value: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'; }
function textValue(value: unknown) { return typeof value === 'string' && value.trim() ? value : '—'; }
</script>
