<template>
  <div class="space-y-4 pt-2">
    <el-alert title="C6-D 先对两份本地输出包做确定性 Humanity Evaluator，再进行匿名人工 A/B 盲评；盲评不会自动把对话发给第三方。机器评估不能替代真人判断，至少完成 80 组有效评分后才满足人工验收完整度。" type="warning" :closable="false" show-icon />
    <el-card shadow="never">
      <template #header><div class="font-semibold">匿名 A/B 输出包</div></template>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="rounded-lg border border-dashed p-4 text-sm"><div class="font-medium">修改前基线包</div><input class="mt-3 block w-full" type="file" accept="application/json" @change="loadArtifact($event, 'baseline')"><div class="mt-2 text-xs text-slate-500">{{ baselineCount }} 组已匹配</div></label>
        <label class="rounded-lg border border-dashed p-4 text-sm"><div class="font-medium">V5.20 C6 候选包</div><input class="mt-3 block w-full" type="file" accept="application/json" @change="loadArtifact($event, 'candidate')"><div class="mt-2 text-xs text-slate-500">{{ candidateCount }} 组已匹配</div></label>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2"><el-tag>评测对话 {{ conversations.length }}</el-tag><el-tag type="success">已评分 {{ completedCount }}</el-tag><el-button :disabled="!completedCount" @click="aggregate">计算盲评指标</el-button><el-button :disabled="!completedCount" @click="exportReviews">导出评分 JSON</el-button></div>
    </el-card>

    <el-card v-if="machineComparison" shadow="never">
      <template #header><div class="flex items-center justify-between gap-3"><b>C6-D Humanity Evaluator</b><el-tag :type="machineComparison.comparison.candidateSafetyClear && machineComparison.comparison.humanBehaviorNotRegressed ? 'success' : 'warning'">{{ machineComparison.comparison.humanBehaviorImproved ? '候选人感指标改善' : machineComparison.comparison.humanBehaviorNotRegressed ? '候选未退化' : '存在人感指标退化' }}</el-tag></div></template>
      <el-alert class="mb-4" :title="machineComparison.candidate.limitation" type="info" :closable="false" show-icon />
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded border p-3"><div class="text-xs text-slate-500">综合缺陷分（越低越好）</div><div class="mt-1 text-lg font-semibold">{{ percent(machineComparison.baseline.behaviorDefectScore) }} → {{ percent(machineComparison.candidate.behaviorDefectScore) }}</div></div>
        <div class="rounded border p-3"><div class="text-xs text-slate-500">改善 / 退化指标</div><div class="mt-1 text-lg font-semibold">{{ machineComparison.comparison.improvedMetricCount }} / {{ machineComparison.comparison.regressedMetricCount }}</div></div>
        <div class="rounded border p-3"><div class="text-xs text-slate-500">候选安全回归</div><div class="mt-1 text-lg font-semibold">{{ machineComparison.candidate.metrics.safetyRegressionCount || 0 }}</div></div>
        <div class="rounded border p-3"><div class="text-xs text-slate-500">ExpressionPlan 覆盖</div><div class="mt-1 text-lg font-semibold">{{ percent(machineComparison.candidate.metrics.expressionPlanCoverageRate || 0) }}</div></div>
      </div>
      <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="key in machineMetricKeys" :key="key" class="flex items-center justify-between rounded bg-slate-50 px-3 py-2 text-sm"><span>{{ machineMetricLabel(key) }}</span><span class="font-medium">{{ percent(machineComparison.baseline.metrics[key] || 0) }} → {{ percent(machineComparison.candidate.metrics[key] || 0) }}</span></div>
      </div>
      <div class="mt-3 text-xs text-slate-500">可比对话 {{ machineComparison.comparison.comparableConversationCount }} 组；只有同一套 conversationId 的基线/候选才允许判断改善。C5 semantic regression 仍由现有定向回归单独守门。</div>
    </el-card>

    <el-card v-if="current && assignment" shadow="never">
      <template #header><div class="flex items-center justify-between gap-3"><div><b>{{ current.id }}</b><div class="text-xs text-slate-500">{{ current.scenario }} · {{ current.relationship }} · 第 {{ currentIndex + 1 }}/{{ reviewable.length }} 组</div></div><div class="flex gap-2"><el-button :disabled="currentIndex === 0" @click="currentIndex--">上一组</el-button><el-button :disabled="currentIndex >= reviewable.length - 1" @click="currentIndex++">下一组</el-button></div></div></template>
      <div class="mb-4 rounded-lg bg-slate-50 p-3 text-sm"><b>评估重点：</b>{{ current.evaluationFocus.join('、') }}<div class="mt-1 text-xs text-red-600">禁止虚构：{{ current.forbiddenInventions.join('、') }}</div></div>
      <div class="grid gap-4 xl:grid-cols-2">
        <section v-for="side in ['A', 'B'] as const" :key="side" class="rounded-lg border p-4">
          <div class="mb-3 text-center text-lg font-semibold">匿名版本 {{ side }}</div>
          <div v-for="(customer, index) in current.customerTurns" :key="index" class="mb-3 space-y-2 text-sm">
            <div class="ml-auto max-w-[88%] rounded-xl bg-emerald-600 px-3 py-2 text-white"><span class="text-xs opacity-70">客户 {{ index + 1 }}</span><div>{{ customer }}</div></div>
            <div class="max-w-[88%] rounded-xl border bg-white px-3 py-2"><span class="text-xs text-slate-400">版本 {{ side }}</span><div>{{ assignment[side][index] || '（无回复）' }}</div></div>
          </div>
          <div class="mt-4 space-y-2 border-t pt-3">
            <div v-for="dimension in dimensions" :key="dimension.key" class="flex items-center justify-between gap-2"><span class="text-xs">{{ dimension.label }}</span><el-rate v-model="review[side === 'A' ? 'ratingA' : 'ratingB'][dimension.key]" size="small" /></div>
            <el-checkbox v-for="flag in flags" :key="flag.key" v-model="review[side === 'A' ? 'flagsA' : 'flagsB'][flag.key]">{{ flag.label }}</el-checkbox>
          </div>
        </section>
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4"><div><b>整体更愿意继续和哪个版本交流？</b><el-radio-group v-model="review.preferred" class="ml-3"><el-radio-button value="A">A</el-radio-button><el-radio-button value="B">B</el-radio-button><el-radio-button value="TIE">相当</el-radio-button></el-radio-group></div><el-button type="primary" @click="saveAndNext">保存并下一组</el-button></div>
    </el-card>
    <el-empty v-else description="加载两份输出包后开始匿名盲评" :image-size="72" />

    <el-card v-if="score" shadow="never"><template #header><div class="flex items-center justify-between"><b>盲评聚合结果</b><div class="flex gap-2"><el-tag :type="score.completeForAcceptance ? 'success' : 'warning'">{{ score.reviewCount }}/80</el-tag><el-tag v-if="score.completeForAcceptance" :type="score.acceptancePassed ? 'success' : 'danger'">{{ score.acceptancePassed ? '盲评目标通过' : '盲评目标未通过' }}</el-tag></div></div></template><div class="grid gap-3 md:grid-cols-3"><div v-for="(value, key) in score.metrics" :key="key" class="rounded border p-3"><div class="text-xs text-slate-500">{{ metricLabel(key) }}</div><div class="mt-1 text-xl font-semibold">{{ metricValue(key, value) }}</div></div></div></el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { compareCustomerServiceHumanityArtifacts, listCustomerServiceHumanityConversations, scoreCustomerServiceHumanityReviews } from '@/modules/customer-service/api/evaluation-benchmarks.api';
import type { CustomerServiceHumanityBlindConversation, CustomerServiceHumanityComparisonResult, CustomerServiceHumanityOutputArtifact, CustomerServiceHumanityReview, CustomerServiceHumanityScoreResult } from '@/modules/customer-service/types/evaluation-benchmarks.types';

const STORAGE_KEY = 'customer-service:v520-c6-d-humanity-blind-reviews';
const conversations = ref<CustomerServiceHumanityBlindConversation[]>([]);
const baseline = ref<Record<string, string[]>>({});
const candidate = ref<Record<string, string[]>>({});
const baselineArtifact = ref<CustomerServiceHumanityOutputArtifact | null>(null);
const candidateArtifact = ref<CustomerServiceHumanityOutputArtifact | null>(null);
const machineComparison = ref<CustomerServiceHumanityComparisonResult | null>(null);
const currentIndex = ref(0);
const reviews = reactive<Record<string, CustomerServiceHumanityReview>>({});
const score = ref<CustomerServiceHumanityScoreResult | null>(null);
const machineMetricKeys = ['shortTurnLengthOverrunRate', 'selfIntroductionOveruseRate', 'serviceScopeOverexposureRate', 'unnecessaryRestatementRate', 'questionAfterQuestionRate', 'forcedCtaRate', 'repeatedStructureRate', 'businessOveradvanceRate', 'expressionPlanViolationRate', 'contextErrorRate'] as const;
const dimensions = [
  ['specificGrounding', '回应具体内容'], ['naturalness', '自然、不像模板'], ['relationshipFit', '关系距离合适'], ['personalityConsistency', '人格稳定不机械'],
  ['noAiStylePreaching', '无 AI 式升华说教'], ['expressionVariation', '句式有变化'], ['conversationRhythm', '推进或停顿自然'], ['boundaryCompliance', '事实安全边界'],
].map(([key, label]) => ({ key, label }));
const flags = [
  ['templated', '明显模板化'], ['contextError', '上下文承接错误'], ['highlyRepeated', '开场/收尾高度重复'], ['safetyViolation', '安全边界问题'], ['factInvention', '虚构事实或操作'], ['emptyOrTechnicalLeak', '空回复或技术提示泄漏'],
].map(([key, label]) => ({ key, label }));

const reviewable = computed(() => conversations.value.filter((item) => baseline.value[item.id]?.length && candidate.value[item.id]?.length));
const current = computed(() => reviewable.value[currentIndex.value] || null);
const assignment = computed(() => {
  if (!current.value) return null;
  const baseFirst = stableHash(current.value.id) % 2 === 0;
  return { A: baseFirst ? baseline.value[current.value.id] : candidate.value[current.value.id], B: baseFirst ? candidate.value[current.value.id] : baseline.value[current.value.id] };
});
const review = computed(() => current.value ? ensureReview(current.value.id) : emptyReview(''));
const baselineCount = computed(() => Object.keys(baseline.value).length);
const candidateCount = computed(() => Object.keys(candidate.value).length);
const completedCount = computed(() => Object.values(reviews).filter(isReviewComplete).length);

onMounted(async () => {
  conversations.value = (await listCustomerServiceHumanityConversations(0, 80)).items;
  try { Object.assign(reviews, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* ignore invalid local draft */ }
});
watch(reviews, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews)), { deep: true });

async function loadArtifact(event: Event, kind: 'baseline' | 'candidate') {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as CustomerServiceHumanityOutputArtifact;
    const mapped = Object.fromEntries((parsed.conversations || []).map((item) => [item.id, item.replies.map((reply) => reply.draft || '')]));
    if (kind === 'baseline') { baseline.value = mapped; baselineArtifact.value = parsed; }
    else { candidate.value = mapped; candidateArtifact.value = parsed; }
    currentIndex.value = 0; score.value = null;
    await refreshMachineComparison();
    ElMessage.success(`${kind === 'baseline' ? '基线' : '候选'}包已加载：${Object.keys(mapped).length} 组`);
  } catch { ElMessage.error('输出包 JSON 无法解析'); }
}
function ensureReview(id: string) {
  if (!reviews[id]) reviews[id] = emptyReview(id);
  return reviews[id];
}
function emptyReview(id: string): CustomerServiceHumanityReview {
  return { conversationId: id, preferred: '' as 'A', ratingA: Object.fromEntries(dimensions.map((item) => [item.key, 0])), ratingB: Object.fromEntries(dimensions.map((item) => [item.key, 0])), flagsA: Object.fromEntries(flags.map((item) => [item.key, false])), flagsB: Object.fromEntries(flags.map((item) => [item.key, false])) };
}
function isReviewComplete(item: CustomerServiceHumanityReview) {
  return Boolean(item.preferred) && dimensions.every((dimension) => Number(item.ratingA[dimension.key]) >= 1 && Number(item.ratingB[dimension.key]) >= 1);
}
function saveAndNext() {
  if (!review.value.preferred) return ElMessage.warning('请选择整体偏好');
  if (!isReviewComplete(review.value)) return ElMessage.warning('请完成 A/B 的全部 8 个维度评分');
  if (currentIndex.value < reviewable.value.length - 1) currentIndex.value += 1;
}
async function aggregate() { score.value = await scoreCustomerServiceHumanityReviews(Object.values(reviews).filter(isReviewComplete)); }
async function refreshMachineComparison() {
  if (!baselineArtifact.value || !candidateArtifact.value) { machineComparison.value = null; return; }
  try { machineComparison.value = await compareCustomerServiceHumanityArtifacts(baselineArtifact.value, candidateArtifact.value); }
  catch (error) { machineComparison.value = null; ElMessage.error(error instanceof Error ? error.message : 'Humanity Evaluator 执行失败'); }
}
function exportReviews() { downloadJson({ version: 'v5.20-c6-d-humanity-human-review-v1', exportedAt: new Date().toISOString(), reviews: Object.values(reviews).filter(isReviewComplete) }, 'V5.20-C6-D-真人感盲评结果.json'); }
function downloadJson(value: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function stableHash(value: string) { let hash = 0; for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0; return hash; }
function metricLabel(key: string) { return ({ candidateAverage: '候选平均分', baselineAverage: '基线平均分', candidateBlindWinRate: '候选盲选胜率', templatedRatio: '明显模板化比例', contextErrorRatio: '上下文错误比例', repeatedBoundaryRatio: '开场/收尾重复比例', safetyRegressionCount: '安全/事实/空回复回归' } as Record<string, string>)[key] || key; }
function metricValue(key: string, value: number) { return key.includes('Average') ? Number(value).toFixed(2) : key.includes('Count') ? String(value) : percent(value); }
function percent(value: number) { return `${(Number(value) * 100).toFixed(1)}%`; }
function machineMetricLabel(key: string) { return ({ shortTurnLengthOverrunRate: '短轮次长度超标', selfIntroductionOveruseRate: '身份自报过度', serviceScopeOverexposureRate: '服务范围过曝', unnecessaryRestatementRate: '无必要复述', questionAfterQuestionRate: '连续追问', forcedCtaRate: '强制 CTA', repeatedStructureRate: '连续结构重复', businessOveradvanceRate: '业务过度推进', expressionPlanViolationRate: 'ExpressionPlan 违约', contextErrorRate: '上下文错误' } as Record<string, string>)[key] || key; }
</script>

