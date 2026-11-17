<template>
  <section class="effect-panel">
    <el-alert
      title="统计只基于已保存的 Reply Trace 与人工反馈。没有反馈的回复不会被当成满意；发布前后对比只用于运营观察，不代表确定因果。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="effect-toolbar">
      <el-select v-model="accountProfileId" filterable placeholder="选择账号资料" @change="resetTargetAndLoad">
        <el-option v-for="item in accounts" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="days" @change="load">
        <el-option label="近 7 天" :value="7" />
        <el-option label="近 30 天" :value="30" />
        <el-option label="近 90 天" :value="90" />
      </el-select>
      <el-select v-model="compareDays" @change="reloadTarget">
        <el-option label="发布前后各 3 天" :value="3" />
        <el-option label="发布前后各 7 天" :value="7" />
        <el-option label="发布前后各 14 天" :value="14" />
      </el-select>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-empty v-if="!canRead" description="当前账号没有效果观察权限" />
    <el-empty v-else-if="!accountProfileId" description="请先选择一份账号资料" />
    <el-skeleton v-else-if="loading && !result" :rows="8" animated />

    <template v-else-if="result">
      <div class="metric-grid">
        <article class="metric-card"><span>回复 Trace</span><strong>{{ result.current.totalReplies }}</strong><small>反馈覆盖 {{ percent(result.current.feedbackCoverageRate) }}</small></article>
        <article class="metric-card"><span>满意率</span><strong>{{ nullablePercent(result.current.satisfactionRate) }}</strong><small>{{ result.current.satisfiedReplies }} 满意 / {{ result.current.unsatisfiedReplies }} 不满意</small></article>
        <article class="metric-card"><span>质量门通过率</span><strong>{{ percent(result.current.qualityPassRate) }}</strong><small>{{ result.current.qualityPassedReplies }} / {{ result.current.qualityEvaluatedReplies }} 条通过</small></article>
        <article class="metric-card"><span>安全门通过率</span><strong>{{ percent(result.current.safetyPassRate) }}</strong><small>{{ result.current.safetyPassedReplies }} / {{ result.current.safetyEvaluatedReplies }} 条通过</small></article>
        <article class="metric-card"><span>模型回退率</span><strong>{{ percent(result.current.fallbackRate) }}</strong><small>{{ result.current.fallbackReplies }} 条发生回退</small></article>
      </div>

      <el-alert
        :title="result.periodObservation.message"
        :type="signalType(result.periodObservation.status)"
        :closable="false"
        show-icon
        class="observation-alert"
      >
        <template #default>
          与上一等长窗口相比：满意率 {{ delta(result.periodObservation.satisfactionDelta) }}，质量门 {{ delta(result.periodObservation.qualityPassDelta) }}，回退率 {{ delta(result.periodObservation.fallbackDelta) }}。
        </template>
      </el-alert>

      <div v-if="result.window.currentSampled || result.window.previousSampled" class="sample-note">
        数据量超过单次统计上限，本页展示最近 {{ result.window.sampleLimit }} 条样本；总量分别为当前 {{ result.window.currentTotal }}、上一窗口 {{ result.window.previousTotal }}。
      </div>

      <div class="section-grid">
        <section class="observation-section">
          <header><div><strong>策略版本命中</strong><p>按实际进入 Reply Trace 的正式策略版本统计。</p></div></header>
          <el-table :data="result.strategyVersionHits" size="small" empty-text="当前窗口没有命中正式策略版本">
            <el-table-column label="策略 / 版本" min-width="220">
              <template #default="{ row }"><div>{{ row.assetName }}</div><small>v{{ row.versionNo || '-' }} · {{ row.title }}</small></template>
            </el-table-column>
            <el-table-column prop="totalReplies" label="命中" width="72" />
            <el-table-column label="满意率" width="92"><template #default="{ row }">{{ nullablePercent(row.satisfactionRate) }}</template></el-table-column>
            <el-table-column label="质量门" width="88"><template #default="{ row }">{{ percent(row.qualityPassRate) }}</template></el-table-column>
            <el-table-column label="状态" width="88"><template #default="{ row }"><el-tag :type="row.isCurrent ? 'success' : 'info'">{{ row.isCurrent ? '当前' : '历史' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="92"><template #default="{ row }"><el-button link type="primary" @click="observeStrategy(row)">发布对比</el-button></template></el-table-column>
          </el-table>
        </section>

        <section class="observation-section">
          <header><div><strong>知识版本命中</strong><p>同一条知识的不同 revision 分开统计。</p></div></header>
          <el-table :data="result.knowledgeVersionHits" size="small" empty-text="当前窗口没有命中业务知识">
            <el-table-column label="知识 / revision" min-width="220">
              <template #default="{ row }"><div>{{ row.title }}</div><small>revision {{ row.revision || '未知' }}<span v-if="row.currentRevision"> / 当前 {{ row.currentRevision }}</span></small></template>
            </el-table-column>
            <el-table-column prop="totalReplies" label="命中" width="72" />
            <el-table-column label="满意率" width="92"><template #default="{ row }">{{ nullablePercent(row.satisfactionRate) }}</template></el-table-column>
            <el-table-column label="质量门" width="88"><template #default="{ row }">{{ percent(row.qualityPassRate) }}</template></el-table-column>
            <el-table-column label="状态" width="88"><template #default="{ row }"><el-tag :type="row.isCurrentRevision ? 'success' : 'info'">{{ row.isCurrentRevision ? '当前' : '历史' }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="104"><template #default="{ row }"><el-tooltip :content="row.isCurrentRevision ? '查看当前 revision 发布前后效果' : '历史 revision 仅保留命中证据，当前没有独立发布时间快照'"><span><el-button link type="primary" :disabled="!row.isCurrentRevision" @click="observeKnowledge(row)">版本对比</el-button></span></el-tooltip></template></el-table-column>
          </el-table>
        </section>
      </div>

      <section class="observation-section trend-section">
        <header><div><strong>每日趋势</strong><p>用于发现反馈覆盖、满意率和回退率的连续变化。</p></div></header>
        <el-table :data="result.dailyTrend.slice(-14)" size="small" empty-text="当前窗口暂无数据">
          <el-table-column prop="date" label="日期" min-width="110" />
          <el-table-column prop="totalReplies" label="回复" width="72" />
          <el-table-column label="反馈覆盖"><template #default="{ row }">{{ percent(row.feedbackCoverageRate) }}</template></el-table-column>
          <el-table-column label="满意率"><template #default="{ row }">{{ nullablePercent(row.satisfactionRate) }}</template></el-table-column>
          <el-table-column label="质量门"><template #default="{ row }">{{ percent(row.qualityPassRate) }}</template></el-table-column>
          <el-table-column label="回退率"><template #default="{ row }">{{ percent(row.fallbackRate) }}</template></el-table-column>
        </el-table>
      </section>

      <section v-if="result.targetObservation" class="target-section">
        <header class="target-header">
          <div>
            <strong>{{ targetTitle }}</strong>
            <p>锚点：{{ formatDate(result.targetObservation.window.anchor) }}；发布后只统计实际命中目标版本的 Trace。</p>
          </div>
          <el-tag :type="signalType(result.targetObservation.observation.status)">{{ signalLabel(result.targetObservation.observation.status) }}</el-tag>
        </header>
        <el-alert :title="result.targetObservation.observation.message" :type="signalType(result.targetObservation.observation.status)" :closable="false" show-icon />
        <div class="compare-grid">
          <MetricCompare title="发布前窗口" :metrics="result.targetObservation.before" />
          <MetricCompare title="发布后命中窗口" :metrics="result.targetObservation.after" />
        </div>
        <div class="delta-line">
          满意率 {{ delta(result.targetObservation.observation.satisfactionDelta) }}；质量门 {{ delta(result.targetObservation.observation.qualityPassDelta) }}；回退率 {{ delta(result.targetObservation.observation.fallbackDelta) }}。
          <span v-if="!result.targetObservation.window.afterWindowComplete">发布后观察窗口尚未完整结束。</span>
        </div>

        <div v-if="result.targetObservation.type === 'STRATEGY_VERSION'" class="rollback-box">
          <div><strong>策略回滚</strong><p>回滚会把历史版本复制成一个新的正式版本，保留当前和历史记录，不会改写旧版本。</p></div>
          <template v-if="result.targetObservation.target.isCurrent && result.targetObservation.rollbackCandidates.length">
            <el-select v-model="rollbackVersionId" placeholder="选择历史版本">
              <el-option v-for="item in result.targetObservation.rollbackCandidates" :key="item.id" :label="`v${item.versionNo} · ${item.title}`" :value="item.id" />
            </el-select>
            <el-input v-model="rollbackReason" placeholder="填写回滚原因（必填）" />
            <el-button type="danger" :disabled="!canRollback || !rollbackVersionId || rollbackReason.trim().length < 3" :loading="rollingBack" @click="rollbackStrategy">确认回滚</el-button>
          </template>
          <el-alert v-else title="该版本不是当前版本，或没有可回滚的历史版本。" type="info" :closable="false" />
        </div>

        <div v-else class="rollback-box">
          <div><strong>知识异常处理</strong><p>知识条目当前没有独立历史快照回滚；发现退化时可先停用，随后在“业务知识”中核实并修订。</p></div>
          <el-button v-if="result.targetObservation.target.status === 'ENABLED'" type="danger" plain :disabled="!canUpdateKnowledge" @click="disableKnowledge">紧急停用当前知识</el-button>
          <el-button @click="$emit('open-knowledge')">前往业务知识</el-button>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getCustomerServiceEffectObservation, type CustomerServiceEffectMetrics, type CustomerServiceEffectObservationResult, type CustomerServiceKnowledgeVersionHit, type CustomerServiceStrategyVersionHit } from '@/modules/customer-service/api/effect-observation.api';
import { rollbackCustomerServiceAssetVersion } from '@/modules/customer-service/api/assets.api';
import { updateCustomerServiceKnowledgeEntry } from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceAccountProfile } from '@/modules/customer-service/types/context-profiles.types';

const props = defineProps<{
  accounts: CustomerServiceAccountProfile[];
  canRead: boolean;
  canRollback: boolean;
  canUpdateKnowledge: boolean;
}>();
defineEmits<{ (event: 'open-knowledge'): void }>();

const accountProfileId = ref('');
const days = ref(30);
const compareDays = ref(7);
const loading = ref(false);
const rollingBack = ref(false);
const result = ref<CustomerServiceEffectObservationResult | null>(null);
const strategyVersionId = ref('');
const knowledgeEntryId = ref('');
const rollbackVersionId = ref('');
const rollbackReason = ref('');

const targetTitle = computed(() => {
  const target = result.value?.targetObservation?.target;
  if (!target) return '';
  if (result.value?.targetObservation?.type === 'STRATEGY_VERSION') return `${target.assetName || '策略'} · v${target.versionNo || '-'} · ${target.title || ''}`;
  return `${target.title || '知识条目'} · revision ${target.revision || '-'}`;
});

const MetricCompare = defineComponent({
  name: 'MetricCompare',
  props: { title: { type: String, required: true }, metrics: { type: Object as () => CustomerServiceEffectMetrics, required: true } },
  setup(componentProps) {
    return () => h('article', { class: 'compare-card' }, [
      h('strong', componentProps.title),
      h('span', `回复 ${componentProps.metrics.totalReplies} · 反馈 ${componentProps.metrics.feedbackReplies}`),
      h('span', `满意率 ${nullablePercent(componentProps.metrics.satisfactionRate)}`),
      h('span', `质量门 ${percent(componentProps.metrics.qualityPassRate)} · 回退 ${percent(componentProps.metrics.fallbackRate)}`),
    ]);
  },
});

watch(() => props.accounts, (items) => {
  if (!accountProfileId.value && items.length) { accountProfileId.value = items[0].id; if (props.canRead) void load(); }
}, { immediate: true });

onMounted(() => { if (props.canRead && accountProfileId.value) void load(); });

async function load() {
  if (!props.canRead || !accountProfileId.value) return;
  loading.value = true;
  try {
    result.value = await getCustomerServiceEffectObservation({
      accountProfileId: accountProfileId.value,
      days: days.value,
      compareDays: compareDays.value,
      ...(strategyVersionId.value ? { strategyVersionId: strategyVersionId.value } : {}),
      ...(knowledgeEntryId.value ? { knowledgeEntryId: knowledgeEntryId.value } : {}),
    });
    const candidates = result.value.targetObservation?.rollbackCandidates || [];
    rollbackVersionId.value = candidates[0]?.id || '';
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '效果观察加载失败');
  } finally {
    loading.value = false;
  }
}

function resetTargetAndLoad() {
  strategyVersionId.value = '';
  knowledgeEntryId.value = '';
  result.value = null;
  void load();
}
function reloadTarget() { if (result.value) void load(); }
function observeStrategy(row: CustomerServiceStrategyVersionHit) {
  strategyVersionId.value = row.versionId;
  knowledgeEntryId.value = '';
  void load();
}
function observeKnowledge(row: CustomerServiceKnowledgeVersionHit) {
  knowledgeEntryId.value = row.entryId;
  strategyVersionId.value = '';
  void load();
}

async function rollbackStrategy() {
  const target = result.value?.targetObservation?.target;
  if (!target?.assetId || !target.assetRevision || !rollbackVersionId.value) return;
  try {
    await ElMessageBox.confirm('回滚会立即创建并发布一个复制自历史版本的新版本。确认继续吗？', '确认策略回滚', { type: 'warning', confirmButtonText: '确认回滚' });
  } catch { return; }
  rollingBack.value = true;
  try {
    await rollbackCustomerServiceAssetVersion(target.assetId, rollbackVersionId.value, target.assetRevision, rollbackReason.value);
    ElMessage.success('已回滚为新的正式策略版本；请观察后续新 Reply Trace 是否命中。');
    strategyVersionId.value = '';
    rollbackReason.value = '';
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '策略回滚失败');
  } finally {
    rollingBack.value = false;
  }
}

async function disableKnowledge() {
  const target = result.value?.targetObservation?.target;
  if (!target?.id || !target.revision) return;
  try {
    await ElMessageBox.confirm('停用后新回复不会再加载这条知识，历史 Trace 不受影响。确认停用吗？', '紧急停用知识', { type: 'warning' });
  } catch { return; }
  try {
    await updateCustomerServiceKnowledgeEntry(target.id, { revision: target.revision, status: 'DISABLED' });
    ElMessage.success('知识已停用；请在业务知识中完成事实核实和修订。');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '知识停用失败');
  }
}

function percent(value: number) { return `${Number(value || 0).toFixed(1)}%`; }
function nullablePercent(value: number | null) { return value === null ? '反馈不足' : percent(value); }
function delta(value: number | null) { if (value === null) return '暂无可比反馈'; return `${value > 0 ? '+' : ''}${value.toFixed(1)} 个百分点`; }
function formatDate(value: string) { return new Date(value).toLocaleString(); }
function signalLabel(value: string) { return ({ INSUFFICIENT: '证据不足', WARNING: '退化提醒', POSITIVE: '改善信号', STABLE: '暂时稳定' } as Record<string, string>)[value] || value; }
function signalType(value: string): 'success' | 'warning' | 'info' { return value === 'WARNING' ? 'warning' : value === 'POSITIVE' ? 'success' : 'info'; }
</script>

<style scoped>
.effect-panel { display: grid; gap: 16px; }
.effect-toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 130px 180px auto; gap: 10px; align-items: center; }
.metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.metric-card, .compare-card { border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 14px; background: var(--el-bg-color); display: grid; gap: 6px; }
.metric-card span, .compare-card span { color: var(--el-text-color-secondary); font-size: 13px; }
.metric-card strong { font-size: 25px; }
.metric-card small, .sample-note, .observation-section header p, .target-header p, .rollback-box p { color: var(--el-text-color-secondary); margin: 0; }
.section-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.observation-section, .target-section { border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; background: var(--el-bg-color); }
.observation-section header, .target-header, .rollback-box { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 12px; }
.compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
.delta-line { padding: 12px; border-radius: 8px; background: var(--el-fill-color-light); }
.rollback-box { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--el-border-color-light); align-items: center; }
.rollback-box > div { flex: 1; }
.rollback-box .el-select { width: 260px; }
.rollback-box .el-input { width: 280px; }
@media (max-width: 1000px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .section-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .effect-toolbar, .metric-grid, .compare-grid { grid-template-columns: 1fr; }
  .effect-toolbar .el-select, .effect-toolbar .el-button, .rollback-box .el-select, .rollback-box .el-input { width: 100%; }
  .rollback-box, .target-header { flex-direction: column; }
}
</style>
