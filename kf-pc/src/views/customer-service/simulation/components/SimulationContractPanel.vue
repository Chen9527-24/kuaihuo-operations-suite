<template>
  <div v-if="result" class="space-y-4">
    <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
      <el-card shadow="never"><div class="text-xs text-slate-500">运行模式</div><div class="mt-2 font-semibold">{{ result.summary.runtimeMode }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">角色模块</div><div class="mt-2 text-xl font-semibold">{{ result.summary.moduleCount }} / {{ result.summary.availableModuleCount }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">命中正式意图定义</div><div class="mt-2 text-xl font-semibold">{{ result.summary.intentDefinitionCount }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">回复路线</div><div class="mt-2"><el-tag :type="routeTagType">{{ result.summary.replyRoute }}</el-tag></div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">销售等级</div><div class="mt-2 font-semibold">{{ result.contract.orchestrationPlan.salesVisibility }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">行业上下文</div><div class="mt-2"><el-tag :type="result.summary.hasIndustry ? 'success' : 'info'">{{ result.summary.hasIndustry ? '已包含' : '未包含' }}</el-tag></div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">校准证据</div><div class="mt-2 text-xl font-semibold">{{ result.summary.calibrationProfileCount }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">策略来源</div><div class="mt-2 text-xl font-semibold">{{ result.summary.strategyPolicySourceCount }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">配置覆盖</div><div class="mt-2"><el-tag :type="result.summary.strategyPolicyConflictCount ? 'warning' : 'success'">{{ result.summary.strategyPolicyConflictCount }}</el-tag></div></el-card>
    </div>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <el-card shadow="never"><div class="text-xs text-slate-500">系统主场景</div><div class="mt-1 font-semibold">{{ result.summary.primaryScenario || result.understanding.primaryScenario }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">系统主意图</div><div class="mt-1 font-semibold">{{ result.summary.primaryIntent || result.understanding.primaryIntent }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">本轮主目标</div><div class="mt-1 font-semibold">{{ result.summary.dominantTurnGoal || result.understanding.humanContext.dominantTurnGoal?.name || '未识别' }}</div></el-card>
      <el-card shadow="never"><div class="text-xs text-slate-500">识别路径</div><div class="mt-1"><el-tag type="info">{{ result.summary.recognitionPath || result.understanding.recognitionModel.path }}</el-tag></div></el-card>
    </div>

    <el-alert v-for="warning in result.warnings" :key="warning" :title="warning" type="warning" :closable="false" show-icon />

    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div><div class="font-semibold">本轮最终生效策略</div><div class="mt-1 text-xs text-slate-500">生成和质量门共同读取这一份已编译策略；校准只提供建议证据，不能覆盖最终结果。</div></div>
          <el-tag :type="strategyAttentionCount ? 'danger' : strategyPolicy.conflicts.length ? 'warning' : 'success'">{{ strategyAttentionCount ? `${strategyAttentionCount} 项关联异常` : strategyPolicy.conflicts.length ? `${strategyPolicy.conflicts.length} 项合并记录` : '配置合并正常' }}</el-tag>
        </div>
      </template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg bg-slate-50 p-3 text-sm"><div class="text-xs text-slate-500">继承模式</div><div class="mt-1 font-medium">{{ inheritanceLabel(strategyPolicy.inheritance.mode) }}</div><div class="mt-1 text-xs text-slate-500">角色通用：{{ strategyPolicy.inheritance.inheritRoleCommon ? '继承' : '关闭' }}；场景通用：{{ strategyPolicy.inheritance.inheritScenarioCommon ? '继承' : '关闭' }}</div></div>
        <div class="rounded-lg bg-slate-50 p-3 text-sm"><div class="text-xs text-slate-500">语气强度</div><div class="mt-1">温度 {{ valueLabel(strategyPolicy.resolved.tone.warmth) }} · 俏皮 {{ valueLabel(strategyPolicy.resolved.tone.playfulness) }} · 正式 {{ valueLabel(strategyPolicy.resolved.tone.formality) }}</div></div>
        <div class="rounded-lg bg-slate-50 p-3 text-sm"><div class="text-xs text-slate-500">标点与语气</div><div class="mt-1">波浪号 {{ tildeLabel(strategyPolicy.resolved.wording.tildePolicy) }} · 表情 {{ emojiLabel(strategyPolicy.resolved.wording.emojiPolicy) }} / {{ strategyPolicy.resolved.wording.emojiLimit }} · 语气词 {{ particleLabel(strategyPolicy.resolved.wording.sentenceParticleFrequency) }}</div></div>
        <div class="rounded-lg bg-slate-50 p-3 text-sm"><div class="text-xs text-slate-500">回复结构</div><div class="mt-1">问题 {{ valueLabel(strategyPolicy.resolved.structure.maxQuestions) }} · 核心动作 {{ valueLabel(strategyPolicy.resolved.structure.maxCoreMoves) }} · 猜测 {{ valueLabel(strategyPolicy.resolved.structure.maxGuesses) }} · 句数 {{ valueLabel(strategyPolicy.resolved.structure.maxSentences) }}</div></div>
      </div>
      <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
        <div class="flex flex-wrap items-center justify-between gap-2"><div class="font-medium">行业动作权限</div><el-tag size="small" :type="capabilityModeTag">{{ capabilityModeLabel }}</el-tag></div>
        <div class="mt-1 text-xs text-blue-700">未配置阶段只验证意图理解和真人沟通，不代表能力明确可用或不可用；正式运行后再按行业、意图、额度和审批条件绑定权限。</div>
        <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <div v-for="item in capabilityItems" :key="item.key" class="rounded bg-white/70 px-3 py-2"><div class="text-xs text-slate-500">{{ item.label }}</div><el-tag class="mt-1" size="small" :type="capabilityTag(item.value)">{{ capabilityLabel(item.value) }}</el-tag></div>
        </div>
        <div class="mt-2 text-xs text-blue-700">可信动作凭证：{{ capabilityReceiptCount }} 条。历史客服回复只用于上下文，不作为已查询、已催件或已批准优惠的证明。</div>
      </div>
      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <div class="mb-2 text-sm font-medium">生效来源链</div>
          <div class="space-y-2">
            <div v-for="source in strategyPolicy.sources" :key="`${source.sourceType}-${source.key}-${source.versionId || ''}`" class="rounded border border-slate-200 px-3 py-2 text-sm">
              <div class="flex items-center justify-between gap-3"><span class="font-medium">{{ source.name }}</span><el-tag size="small" type="info">{{ sourceTypeLabel(source.sourceType) }}</el-tag></div>
              <div class="mt-1 text-xs text-slate-400">{{ source.key }} · 优先级 {{ source.priority }}<span v-if="source.versionNo"> · V{{ source.versionNo }}</span></div>
            </div>
            <el-empty v-if="!strategyPolicy.sources.length" description="没有策略来源" :image-size="56" />
          </div>
        </div>
        <div>
          <div class="mb-2 text-sm font-medium">关键约束</div>
          <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <div><b>禁止措辞：</b>{{ strategyPolicy.resolved.wording.forbiddenExpressions.join('、') || '无' }}</div>
            <div><b>谨慎措辞：</b>{{ strategyPolicy.resolved.wording.cautiousExpressions.join('、') || '无' }}</div>
            <div><b>禁止语气词：</b>{{ strategyPolicy.resolved.wording.forbiddenSentenceParticles.join('、') || '无' }}</div>
            <div><b>语义检查：</b>{{ strategyPolicy.resolved.wording.semanticChecks.join('、') || '无' }}</div>
            <div><b>商品权限：</b>{{ strategyPolicy.resolved.service.productMentionPolicy || '未单独设置' }}</div>
          </div>
          <div v-if="strategyPolicy.conflicts.length" class="mt-3 space-y-2"><div class="text-xs text-slate-500">这里同时记录正常覆盖、严格收紧和未加载关联；安全与权限限制始终按更严格结果处理。</div>
            <div v-for="(conflict, index) in strategyPolicy.conflicts" :key="`${conflict.path}-${index}`" :class="['rounded border px-3 py-2 text-xs leading-5', conflict.kind === 'MISSING_BINDING' || conflict.kind === 'NOT_APPLICABLE' ? 'border-red-200 bg-red-50 text-red-900' : 'border-orange-200 bg-orange-50 text-orange-900']">
              <el-tag class="mr-2" size="small" :type="conflict.kind === 'MISSING_BINDING' || conflict.kind === 'NOT_APPLICABLE' ? 'danger' : 'warning'">{{ conflictKindLabel(conflict.kind) }}</el-tag>
              {{ conflict.path }}：由 {{ conflict.sourceKey }} 按“{{ conflict.resolution }}”处理
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <SimulationUnderstandingPanel :understanding="result.understanding" :plan="result.contract.orchestrationPlan" :can-create-intent="canCreateIntent" :adding-intent-key="addingIntentKey" :added-intent-keys="addedIntentKeys" @add-intent="$emit('add-intent', $event)" />


    <el-card v-if="result.contract.intentGuidance.length" shadow="never">
      <template #header><span class="font-semibold">命中的客户意图与流程</span></template>
      <div class="space-y-3">
        <div v-for="intent in result.contract.intentGuidance" :key="intent.id" class="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div class="flex flex-wrap items-center gap-2"><b>{{ intent.name }}</b><el-tag>{{ intent.category }}</el-tag><el-tag type="info">{{ intent.scenario }} / {{ intent.primaryIntent }}</el-tag></div>
          <div class="mt-3 grid gap-3 md:grid-cols-3 text-sm">
            <div><div class="font-medium">处理策略</div><pre class="mt-1 whitespace-pre-wrap text-xs leading-5">{{ pretty(intent.strategyConfig) }}</pre></div>
            <div><div class="font-medium">流程</div><pre class="mt-1 whitespace-pre-wrap text-xs leading-5">{{ pretty(intent.flowConfig) }}</pre></div>
            <div><div class="font-medium">回复要求</div><pre class="mt-1 whitespace-pre-wrap text-xs leading-5">{{ pretty(intent.replyConfig) }}</pre></div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card v-if="result.contract.calibration.profiles.length" shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">本次命中的校准档案</span><el-tag type="info">精确校准可即时继承，角色级仍走发布</el-tag></div></template>
      <div class="flex flex-wrap gap-2">
        <el-tag v-for="profile in result.contract.calibration.profiles" :key="profile.id" :type="isImmediateScopeType(profile.scopeType) ? 'success' : 'info'">{{ profile.title }} · {{ scopeLabel(profile.scopeType) }}</el-tag>
      </div>
      <div v-if="result.contract.calibration.directives.goals.length || result.contract.calibration.directives.behaviorRules.length" class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
        <div class="font-medium">本轮最终生效的精确校准（已收敛）</div>
        <div v-if="result.contract.calibration.directives.goals.length" class="mt-2"><b>目标：</b>{{ result.contract.calibration.directives.goals.join('；') }}</div>
        <div v-if="result.contract.calibration.directives.behaviorRules.length" class="mt-2"><b>原则：</b>{{ result.contract.calibration.directives.behaviorRules.join('；') }}</div>
      </div>
      <el-alert class="mt-4" title="ACTIVE 精确校准按机器人上下文 → 机器人场景 → 机器人全局 → 身份上下文 → 身份场景 → 身份全局排序；同层更具体上下文优先，再按最近应用优先。非冲突原则继承，近似重复或反向修正的低优先级旧原则会被收敛。ROLE_* 仍只作为共享策略证据，必须完成回归并发布后才扩大生效。" type="info" :closable="false" show-icon />
    </el-card>

    <el-card shadow="never">
      <template #header><span class="font-semibold">确定性内容与流程</span></template>
      <el-empty v-if="deterministic.route === 'UNRESOLVED'" description="当前没有命中确定性回复规则，由智能生成或人工审核路线继续处理" />
      <div v-else class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <el-tag v-for="rule in deterministic.matchedRules" :key="rule.id" :type="rule.exclusive ? 'warning' : 'success'">
            {{ rule.name }} · {{ rule.responseType }}<span v-if="rule.exclusive"> · 排他</span>
          </el-tag>
        </div>
        <div v-if="deterministic.exactReply" class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div class="mb-2 text-sm font-medium text-emerald-800">固定全文</div>
          <div class="whitespace-pre-wrap text-sm text-emerald-950">{{ deterministic.exactReply }}</div>
        </div>
        <div v-if="deterministic.templateReply" class="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div class="mb-2 text-sm font-medium text-blue-800">固定模板</div>
          <div v-if="deterministic.templateReply.rendered" class="whitespace-pre-wrap text-sm text-blue-950">{{ deterministic.templateReply.rendered }}</div>
          <div v-else class="text-sm text-amber-700">缺少已验证变量：{{ deterministic.templateReply.missingVariables.join('、') }}</div>
        </div>
        <div v-if="deterministic.requiredPoints.length">
          <div class="mb-2 text-sm font-medium">必含要点</div>
          <ol class="space-y-2 pl-5 text-sm text-slate-700"><li v-for="point in deterministic.requiredPoints" :key="point" class="list-decimal">{{ point }}</li></ol>
        </div>
        <div v-if="deterministic.workflowSteps.length">
          <div class="mb-2 text-sm font-medium">必走流程</div>
          <el-steps direction="vertical" :active="0" finish-status="success" process-status="wait" :space="64">
            <el-step v-for="step in deterministic.workflowSteps" :key="step.code" :title="step.name" :description="step.code" />
          </el-steps>
        </div>
      </div>
    </el-card>

    <SimulationGenerationQualityPanel v-if="showGeneration" :generation="execution?.generation" :quality="execution?.quality" :can-calibrate="canCalibrate" @calibrate="$emit('calibrate')" />

    <el-card shadow="never">
      <template #header><div class="flex items-center justify-between"><span class="font-semibold">运行约束（RuntimeReplyContract）</span><el-button size="small" @click="copyContract">复制 JSON</el-button></div></template>
      <div class="mb-3 break-all text-xs text-slate-500">配置哈希：{{ result.contractHash }}</div>
      <pre class="max-h-[680px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">{{ contractText }}</pre>
    </el-card>
  </div>
  <el-empty v-else description="输入客户消息或继续多轮对话后，查看理解、客户意图、处理流程和运行契约" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import type { CustomerServiceRecognizedItem, CustomerServiceSimulationCompileResult, CustomerServiceSimulationExecutionResult } from '@/modules/customer-service/types/simulation.types';
import type { CustomerServiceResolvedStrategyPolicy } from '@/modules/customer-service/types/strategy-policy.types';
import SimulationUnderstandingPanel from './SimulationUnderstandingPanel.vue';
import SimulationGenerationQualityPanel from './SimulationGenerationQualityPanel.vue';

const props = withDefaults(defineProps<{ result?: CustomerServiceSimulationCompileResult | CustomerServiceSimulationExecutionResult | null; canCalibrate?: boolean; showGeneration?: boolean; canCreateIntent?: boolean; addingIntentKey?: string; addedIntentKeys?: string[] }>(), { showGeneration: true, canCreateIntent: false, addingIntentKey: '', addedIntentKeys: () => [] });
defineEmits<{ calibrate: []; 'add-intent': [item: CustomerServiceRecognizedItem] }>();
const showGeneration = computed(() => props.showGeneration);
const EMPTY_STRATEGY_POLICY: CustomerServiceResolvedStrategyPolicy = {
  schemaVersion: 1,
  inheritance: { mode: 'INHERIT', inheritRoleCommon: true, inheritScenarioCommon: true, disabledGroupKeys: [] },
  resolved: {
    tone: { warmth: null, playfulness: null, formality: null, directness: null, emotionalIntensity: null },
    wording: { tildePolicy: 'FORBIDDEN', emojiPolicy: 'AUTO', emojiLimit: 1, sentenceParticleFrequency: 'LOW', forbiddenExpressions: [], cautiousExpressions: [], preferredExpressions: [], forbiddenSentenceParticles: [], semanticChecks: [] },
    structure: { maxQuestions: null, maxCoreMoves: null, maxGuesses: null, maxSentences: null, allowChoiceQuestions: false, requireAcknowledgeBeforeQuestion: true },
    service: { salesVisibility: null, productMentionPolicy: null, firstMove: null, stopConditions: [] },
    delivery: { mode: 'AUTO', maxSegments: 4, minDelayMs: 700, maxDelayMs: 1400, splitThresholdChars: 72, cancelRemainingOnCustomerMessage: true },
  },
  sources: [], conflicts: [], legacyCompatibility: { calibrationAdvisoryOnly: true, intentJsonMigratedAtRuntime: false },
};
const deterministic = computed(() => props.result!.contract.replyPlan);
const strategyPolicy = computed<CustomerServiceResolvedStrategyPolicy>(() => props.result?.contract?.strategyPolicy || EMPTY_STRATEGY_POLICY);
const strategyAttentionCount = computed(() => (strategyPolicy.value.conflicts || []).filter((item) => item.kind === 'MISSING_BINDING' || item.kind === 'NOT_APPLICABLE').length);
const execution = computed(() => props.result && 'generation' in props.result ? props.result : null);
const capabilityItems = computed(() => {
  const caps = props.result?.contract?.orchestrationPlan?.serviceCapabilities;
  if (!caps) return [];
  return [
    { key: 'accountOrderVisibility', label: '当前账号订单可见', value: caps.accountOrderVisibility },
    { key: 'orderLookupById', label: '订单号查询', value: caps.orderLookupById },
    { key: 'orderLookupByPhone', label: '手机号查询', value: caps.orderLookupByPhone },
    { key: 'trackingLookup', label: '运单号查询', value: caps.trackingLookup },
    { key: 'logisticsUrge', label: '提交催件', value: caps.logisticsUrge },
  ];
});
const capabilityModeLabel = computed(() => {
  const caps = props.result?.contract?.orchestrationPlan?.serviceCapabilities;
  return caps?.enforcementMode === 'STRICT_EXECUTION' ? '已配置·严格执行' : '未配置·沟通验证';
});
const capabilityModeTag = computed<'success' | 'info'>(() => props.result?.contract?.orchestrationPlan?.serviceCapabilities?.enforcementMode === 'STRICT_EXECUTION' ? 'success' : 'info');
const capabilityReceiptCount = computed(() => props.result?.contract?.orchestrationPlan?.serviceCapabilities?.executionReceipts?.length || 0);
const contractText = computed(() => JSON.stringify(props.result?.contract ?? {}, null, 2));
const routeTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  const route = props.result?.summary.replyRoute;
  if (route === 'EXACT_REPLY' || route === 'TEMPLATE_REPLY') return 'success';
  if (route === 'HUMAN_REVIEW') return 'danger';
  if (route === 'CONTROLLED_GENERATION') return 'warning';
  return 'info';
});
function pretty(value: unknown) { return JSON.stringify(value, null, 2); }
function scopeLabel(value: string) { return ({ ROBOT_CONTEXT: '角色 + 身份/背景 + 机器人 · 完整上下文', ROBOT_SCENARIO: '角色 + 身份/背景 + 机器人 · 场景', ROBOT_GLOBAL: '角色 + 身份/背景 + 机器人 · 全局', ACCOUNT_CONTEXT: '角色 + 身份/背景 · 完整上下文', ACCOUNT_SCENARIO: '角色 + 身份/背景 · 场景', ACCOUNT_GLOBAL: '角色 + 身份/背景 · 全局', ROLE_CONTEXT: '角色级共享 · 完整上下文', ROLE_SCENARIO: '角色级共享 · 场景', ROLE_GLOBAL: '角色级共享 · 全局' } as Record<string, string>)[value] || value; }
function isImmediateScopeType(value: string) { return value.startsWith('ROBOT_') || value.startsWith('ACCOUNT_'); }
function inheritanceLabel(value: string) { return ({ INHERIT: '默认继承', INHERIT_AND_OVERRIDE: '继承并覆盖', INDEPENDENT: '独立软策略' } as Record<string, string>)[value] || value; }
function tildeLabel(value: string) { return ({ FORBIDDEN: '禁止', FOLLOW_CUSTOMER: '仅跟随客户', ALLOWED: '允许' } as Record<string, string>)[value] || value; }
function emojiLabel(value: string) { return ({ FORBIDDEN: '禁止', LIMITED: '限制', FOLLOW_CUSTOMER: '仅跟随客户', AUTO: '自动' } as Record<string, string>)[value] || value; }
function particleLabel(value: string) { return ({ NONE: '不用', LOW: '低频', MEDIUM: '中等' } as Record<string, string>)[value] || value; }
function sourceTypeLabel(value: string) { return ({ SYSTEM_FALLBACK: '系统兼容基础策略', ROLE_COMMON: '角色通用', SCENARIO_COMMON: '场景通用', INTENT_GROUP: '意图关联配置', INTENT_LEGACY: '意图历史兼容', INTENT_OVERRIDE: '意图局部覆盖', DYNAMIC_SAFETY: '动态收紧' } as Record<string, string>)[value] || value; }
function conflictKindLabel(value: string) { return ({ OVERRIDE: '正常覆盖', TIGHTENED: '严格收紧', MISSING_BINDING: '关联缺失', NOT_APPLICABLE: '当前不适用' } as Record<string, string>)[value] || value; }
function valueLabel(value: number | null) { return value === null ? '未设置' : String(value); }
function capabilityLabel(value: string) { return ({ AVAILABLE: '可用', UNAVAILABLE: '不可用', UNKNOWN: '待配置', REQUIRES_APPROVAL: '需审批' } as Record<string, string>)[value] || value; }
function capabilityTag(value: string): 'success' | 'danger' | 'warning' | 'info' { return value === 'AVAILABLE' ? 'success' : value === 'UNAVAILABLE' ? 'danger' : value === 'REQUIRES_APPROVAL' ? 'warning' : 'info'; }
async function copyContract() {
  try { await navigator.clipboard.writeText(contractText.value); ElMessage.success('运行契约已复制'); }
  catch { ElMessage.warning('当前浏览器不允许自动复制，请在 JSON 区域手动复制'); }
}
</script>
