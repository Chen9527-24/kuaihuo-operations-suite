<template>
  <div class="space-y-4 pt-2">
    <el-alert
      title="校准结论、人工标签、摘要、哈希和审计记录长期保留；只对过期大 JSON 做归档或压缩。PURGE 默认关闭，本页不提供硬删除入口。"
      type="info"
      :closable="false"
      show-icon
    />
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      <el-card shadow="never"><div class="text-xs text-slate-500">调优分析</div><div class="mt-2 text-2xl font-semibold">{{ overview?.counts.analyses || 0 }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">校准记录</div><div class="mt-2 text-2xl font-semibold">{{ overview?.counts.calibrationRecords || 0 }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">正式回复幂等记录</div><div class="mt-2 text-2xl font-semibold">{{ overview?.counts.runtimeReplyRequests || 0 }}</div><div class="mt-1 text-xs text-slate-400">到期待清理 {{ overview?.counts.expiredRuntimeReplyRequests || 0 }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">相关表总容量</div><div class="mt-2 text-xl font-semibold">{{ formatBytes(overview?.capacity.totalTableBytes) }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">日均逻辑增长</div><div class="mt-2 text-xl font-semibold">{{ formatBytes(overview?.projection.averageDailyBytes) }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">90 天预计新增</div><div class="mt-2 text-xl font-semibold">{{ formatBytes(overview?.projection.projected90DayBytes) }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">分析 P95 载荷</div><div class="mt-2 text-xl font-semibold">{{ formatBytes(overview?.payloadPercentiles?.[0]?.analysisP95Bytes) }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">已归档 / 已压缩</div><div class="mt-2 text-xl font-semibold">{{ lifecycleCount('ARCHIVED') }} / {{ lifecycleCount('COMPACTED') }}</div></el-card>
    </div>

    <el-alert v-if="overview?.capacity.status === 'WARNING'" title="数据容量已达到预警阈值，请先执行只读预检并评估归档/压缩。" type="warning" :closable="false" show-icon />

    <el-card shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">生命周期操作</span><el-button :loading="loading" @click="load">刷新</el-button></div></template>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm"><span class="mb-1 block text-xs text-slate-500">保留天数</span><el-input-number v-model="retentionDays" :min="30" :max="3650" /></label>
        <label class="text-sm"><span class="mb-1 block text-xs text-slate-500">单批上限</span><el-input-number v-model="batchSize" :min="10" :max="1000" /></label>
        <el-button :loading="running" @click="execute('DRY_RUN')">只读预检</el-button>
        <el-button :loading="running" @click="execute('VERIFY')">一致性检查</el-button>
        <el-button v-if="canUpdate" type="warning" plain :loading="running" @click="execute('ARCHIVE')">归档过期载荷</el-button>
        <el-button v-if="canUpdate" type="danger" plain :loading="running" @click="execute('COMPACT')">压缩过期大 JSON</el-button>
      </div>
      <div class="mt-4 text-xs leading-6 text-slate-500">
        归档只改变生命周期状态；压缩会移除重复的大型运行时 JSON，但保留客户消息、原回复、人工问题标记、AI 诊断、调优指令、摘要、哈希和来源关系。物理文件大小不会因此立即下降。
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header><span class="font-semibold">表与索引容量</span></template>
      <el-table :data="overview?.tableSizes || []" size="small">
        <el-table-column prop="tableName" label="数据表" min-width="240" />
        <el-table-column prop="recordCount" label="记录数" width="100" />
        <el-table-column label="平均物理行"><template #default="scope">{{ formatBytes(scope.row.averagePhysicalRowBytes) }}</template></el-table-column>
        <el-table-column label="总容量"><template #default="scope">{{ formatBytes(scope.row.totalBytes) }}</template></el-table-column>
        <el-table-column label="表数据"><template #default="scope">{{ formatBytes(scope.row.tableBytes) }}</template></el-table-column>
        <el-table-column label="索引"><template #default="scope">{{ formatBytes(scope.row.indexBytes) }}</template></el-table-column>
        <el-table-column label="TOAST"><template #default="scope">{{ formatBytes(scope.row.toastBytes) }}</template></el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header><span class="font-semibold">最近治理记录</span></template>
      <el-table :data="runs" size="small">
        <el-table-column label="时间" width="180"><template #default="scope">{{ new Date(scope.row.createdAt).toLocaleString() }}</template></el-table-column>
        <el-table-column prop="mode" label="模式" width="110" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="candidateCount" label="候选" width="90" />
        <el-table-column prop="processedCount" label="处理" width="90" />
        <el-table-column label="估算载荷"><template #default="scope">{{ formatBytes(scope.row.estimatedBytes) }}</template></el-table-column>
        <el-table-column prop="errorMessage" label="错误" min-width="220" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getCustomerServiceGovernanceOverview, listCustomerServiceGovernanceRuns, runCustomerServiceGovernance } from '@/modules/customer-service/api/data-governance.api';
import type { CustomerServiceGovernanceMode, CustomerServiceGovernanceOverview, CustomerServiceGovernanceRun } from '@/modules/customer-service/types/data-governance.types';

const props = defineProps<{ canUpdate: boolean }>();
const overview = ref<CustomerServiceGovernanceOverview | null>(null);
const runs = ref<CustomerServiceGovernanceRun[]>([]);
const retentionDays = ref(180);
const batchSize = ref(100);
const loading = ref(false);
const running = ref(false);

onMounted(load);
async function load() {
  loading.value = true;
  try { [overview.value, runs.value] = await Promise.all([getCustomerServiceGovernanceOverview(), listCustomerServiceGovernanceRuns()]); }
  finally { loading.value = false; }
}
async function execute(mode: CustomerServiceGovernanceMode) {
  if (!props.canUpdate && !['DRY_RUN', 'VERIFY'].includes(mode)) return;
  if (mode === 'COMPACT') {
    await ElMessageBox.confirm('压缩只处理超过保留期的大 JSON，并保留结论、摘要、标签、哈希和审计。确认继续？', '确认压缩', { type: 'warning' });
  }
  running.value = true;
  try {
    const run = await runCustomerServiceGovernance({ mode, retentionDays: retentionDays.value, batchSize: batchSize.value });
    ElMessage.success(`${mode} 完成：候选 ${run.candidateCount}，处理 ${run.processedCount}`);
    await load();
  } finally { running.value = false; }
}
function formatBytes(value: string | number | null | undefined) {
  let bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let index = 0;
  while (bytes >= 1024 && index < units.length - 1) { bytes /= 1024; index += 1; }
  return `${bytes.toFixed(index ? 2 : 0)} ${units[index]}`;
}
function lifecycleCount(state: string) {
  if (!overview.value) return 0;
  return Object.values(overview.value.states).flat().filter((item) => item.payloadState === state).reduce((sum, item) => sum + Number(item._count._all || 0), 0);
}
</script>
