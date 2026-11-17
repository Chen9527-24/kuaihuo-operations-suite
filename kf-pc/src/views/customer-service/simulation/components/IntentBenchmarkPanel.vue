<template>
  <div class="space-y-4 pt-2">
    <el-alert title="独立评测集不会调用外部模型；当前运行的是确定性启发式层，用于比较修改前后并定位失败簇。完整模型链指标需单独授权后运行。" type="info" :closable="false" show-icon />
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div><div class="font-semibold">V5.15 意图识别基准</div><div class="text-xs text-slate-500">{{ manifest ? `${manifest.intent.sampleCount} 条 / ${manifest.intent.suiteCount} 类 / 新表达 ${percent(manifest.intent.novelExpressionRatio)}` : '等待加载清单' }}</div></div>
          <el-button type="primary" :loading="running" @click="run">运行 375 条语义评测</el-button>
        </div>
      </template>
      <div v-if="result" class="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div v-for="item in metricCards" :key="item.key" class="rounded-lg border p-3" :class="item.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'">
          <div class="text-xs text-slate-500">{{ item.label }}</div><div class="mt-1 text-xl font-semibold">{{ item.display }}</div><div class="mt-1 text-xs">目标 {{ item.targetDisplay }}</div>
        </div>
      </div>
      <el-empty v-else description="运行后显示准确率、Macro-F1、分场景结果和失败样本" :image-size="72" />
    </el-card>

    <el-card v-if="result" shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">分场景结果</span><el-tag>{{ suiteRows.length }} 类</el-tag></div></template>
      <el-table :data="suiteRows" size="small" max-height="420">
        <el-table-column prop="suite" label="样本组" min-width="220" />
        <el-table-column prop="samples" label="数量" width="80" />
        <el-table-column label="场景" width="100"><template #default="scope">{{ percent(scope.row.scenarioAccuracy) }}</template></el-table-column>
        <el-table-column label="意图" width="100"><template #default="scope">{{ percent(scope.row.intentAccuracy) }}</template></el-table-column>
        <el-table-column label="轮次关系" width="110"><template #default="scope">{{ percent(scope.row.relationAccuracy) }}</template></el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="result" shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">失败样本</span><el-tag type="danger">{{ result.failureCount }}</el-tag></div></template>
      <el-table :data="result.failures" size="small" max-height="520">
        <el-table-column prop="id" label="ID" min-width="210" fixed />
        <el-table-column prop="message" label="客户表达" min-width="260" show-overflow-tooltip />
        <el-table-column label="期望" min-width="230"><template #default="scope"><div>{{ scope.row.expected.scenario }} / {{ scope.row.expected.intent }}</div><div class="text-xs text-slate-400">{{ scope.row.expected.relation }}</div></template></el-table-column>
        <el-table-column label="实际" min-width="230"><template #default="scope"><div>{{ scope.row.actual.scenario }} / {{ scope.row.actual.intent }}</div><div class="text-xs text-slate-400">{{ scope.row.actual.relation }} · {{ Math.round(scope.row.actual.confidence * 100) }}%</div></template></el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getCustomerServiceEvaluationBenchmarkManifest, runCustomerServiceIntentBenchmark } from '@/modules/customer-service/api/evaluation-benchmarks.api';
import type { CustomerServiceEvaluationBenchmarkManifest, CustomerServiceIntentBenchmarkResult } from '@/modules/customer-service/types/evaluation-benchmarks.types';

const manifest = ref<CustomerServiceEvaluationBenchmarkManifest | null>(null);
const result = ref<CustomerServiceIntentBenchmarkResult | null>(null);
const running = ref(false);

const metrics = [
  ['coveredScenarioAccuracy', '主场景准确率', 'coveredScenarioAccuracy'], ['primaryIntentAccuracy', '主意图准确率', 'primaryIntentAccuracy'],
  ['intentMacroF1', 'Intent Macro-F1', 'macroF1'], ['highRiskRecall', '高风险召回', 'highRiskRecall'],
  ['multiIntentPrimaryAccuracy', '多意图主任务', 'multiIntentPrimaryAccuracy'], ['secondaryIntentRecall', '次级意图召回', 'secondaryIntentRecall'],
  ['topicShiftAccuracy', '话题切换', 'topicShiftAccuracy'], ['multiTurnRelationAccuracy', '多轮关系', 'multiTurnRelationAccuracy'],
] as const;

const metricCards = computed(() => metrics.map(([key, label, targetKey]) => {
  const value = result.value?.metrics[key] ?? 0;
  const target = manifest.value?.targets[targetKey] ?? 0;
  return { key, label, value, display: key.includes('F1') ? value.toFixed(3) : percent(value), targetDisplay: key.includes('F1') ? target.toFixed(2) : percent(target), passed: value >= target };
}));
const suiteRows = computed(() => Object.entries(result.value?.bySuite || {}).map(([suite, value]) => ({ suite, ...value })));

onMounted(async () => { manifest.value = await getCustomerServiceEvaluationBenchmarkManifest(); });
async function run() {
  running.value = true;
  try { result.value = await runCustomerServiceIntentBenchmark(100); ElMessage.success(`评测完成：${result.value.benchmark.sampleCount} 条`); }
  finally { running.value = false; }
}
function percent(value: number) { return `${(Number(value || 0) * 100).toFixed(1)}%`; }
</script>

