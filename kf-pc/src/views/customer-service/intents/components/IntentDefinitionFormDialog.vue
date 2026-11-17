<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增客户意图' : '编辑客户意图与流程'" width="1120px" destroy-on-close>
    <el-alert title="意图定义约束处理方向，不是固定话术。正式意图负责识别、流程、业务动作和策略关联；确定性策略由“角色配置 → 高级维护”中的策略配置组统一定义；自然表达由角色/身份 Prompt 交给模型完成。" type="info" :closable="false" show-icon class="mb-4" />
    <div v-if="mode === 'create'" class="sample-fill-bar">
      <div><strong>JSON 和流程不知道怎么写？</strong><span>回填一套“催物流”完整样例，识别依据、处理流程、回复要求和样本会一起填好，状态保持草稿。</span></div>
      <SampleFillButton label="填入催物流样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本定义" name="base">
          <div class="grid gap-4 md:grid-cols-2">
            <el-form-item label="意图编码" prop="key"><el-input v-model="form.key" :disabled="mode === 'edit'" placeholder="例如 logistics-urge" /></el-form-item>
            <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
            <el-form-item label="分类" prop="category"><el-select v-model="form.category" class="w-full"><el-option v-for="item in categoryOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="默认风险"><el-select v-model="form.defaultRiskLevel" class="w-full"><el-option v-for="item in riskOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="业务事件 / 场景" prop="scenario"><el-input v-model="form.scenario" placeholder="例如 LOGISTICS_DELAY" /></el-form-item>
            <el-form-item label="主要客户意图" prop="primaryIntent"><el-input v-model="form.primaryIntent" placeholder="例如 REQUEST_ACTION" /></el-form-item>
            <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="0" :max="10000" class="!w-full" /></el-form-item>
            <el-form-item label="状态"><el-select v-model="form.status" class="w-full"><el-option label="待审核草稿" value="DRAFT" /><el-option label="启用" value="ENABLED" /><el-option label="停用" value="DISABLED" /><el-option label="归档" value="ARCHIVED" /></el-select></el-form-item>
          </div>
          <el-form-item label="适用行业编码"><el-select v-model="form.supportedIndustryCodes" multiple allow-create filterable default-first-option class="w-full" placeholder="留空表示全行业；例如 skincare、women-clothing" /></el-form-item>
          <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
        </el-tab-pane>

        <el-tab-pane label="识别依据" name="recognition">
          <ConfigEditor v-model="form.recognitionText" title="识别配置 JSON" :example="recognitionExample" />
        </el-tab-pane>

        <el-tab-pane label="策略配置" name="policy">
          <div class="space-y-4">
            <el-alert title="本页决定当前意图如何继承阿梨通用策略、场景策略，关联哪些专属配置组，以及需要哪些局部覆盖。系统安全硬约束和风险动态收紧始终生效，不能在这里关闭。" type="success" :closable="false" show-icon />

            <el-card shadow="never">
              <template #header><span class="font-semibold">继承模式</span></template>
              <div class="grid gap-4 md:grid-cols-3">
                <el-form-item label="软策略模式">
                  <el-select v-model="form.strategyMode" class="w-full">
                    <el-option label="默认继承" value="INHERIT" />
                    <el-option label="继承并局部覆盖" value="INHERIT_AND_OVERRIDE" />
                    <el-option label="独立软策略" value="INDEPENDENT" />
                  </el-select>
                </el-form-item>
                <el-form-item label="角色通用配置"><el-switch v-model="form.inheritRoleCommon" :disabled="form.strategyMode === 'INDEPENDENT'" active-text="继承" inactive-text="不继承" /></el-form-item>
                <el-form-item label="场景通用配置"><el-switch v-model="form.inheritScenarioCommon" :disabled="form.strategyMode === 'INDEPENDENT'" active-text="继承" inactive-text="不继承" /></el-form-item>
              </div>
              <div class="text-xs leading-5 text-slate-500">独立软策略只关闭可配置的角色和场景软规则，不会关闭事实、安全、权限、投诉处理和风险控制等系统硬约束。</div>
            </el-card>

            <el-card shadow="never">
              <template #header><div class="flex items-center justify-between"><span class="font-semibold">配置组关联与停用</span><el-tag type="info">{{ strategyGroups.length }} 个已发布配置组</el-tag></div></template>
              <el-table v-loading="strategyLoading" :data="strategyGroups" row-key="key" stripe max-height="360">
                <el-table-column prop="name" label="配置组" min-width="210"><template #default="{ row }"><div class="font-medium">{{ row.name }}</div><div class="text-xs text-slate-400">{{ row.key }}</div></template></el-table-column>
                <el-table-column label="层级" width="105"><template #default="{ row }"><el-tag size="small" :type="row.scopeType === 'INTENT' ? 'warning' : row.scopeType === 'SCENARIO' ? 'success' : 'info'">{{ scopeLabel(row.scopeType) }}</el-tag></template></el-table-column>
                <el-table-column label="继承状态" width="130"><template #default="{ row }"><el-tag size="small" :type="defaultApplies(row) ? 'success' : 'info'">{{ defaultApplies(row) ? '本意图将继承' : row.enabledByDefault ? '范围未命中' : '需显式关联' }}</el-tag></template></el-table-column>
                <el-table-column prop="summary" label="关键规则" min-width="260" show-overflow-tooltip />
                <el-table-column label="显式关联" width="105"><template #default="{ row }"><el-switch :model-value="bindingEnabled(row.key)" :disabled="groupDisabled(row.key)" @change="setBinding(row.key, Boolean($event))" /></template></el-table-column>
                <el-table-column label="本意图停用" width="110"><template #default="{ row }"><el-switch :model-value="groupDisabled(row.key)" @change="setDisabled(row.key, Boolean($event))" /></template></el-table-column>
              </el-table>
              <el-empty v-if="!strategyLoading && !strategyGroups.length" description="尚未发布策略配置组；如确实需要确定性策略，请到“角色配置 → 高级维护”创建并发布" />
            </el-card>

            <el-card shadow="never">
              <template #header><span class="font-semibold">本意图局部覆盖</span></template>
              <el-alert class="mb-4" title="局部覆盖只填写与通用配置不同的部分；留空表示继续使用继承结果。禁止项、安全项和数量上限合并时默认采用更严格结果。" type="info" :closable="false" />
              <el-alert v-if="form.strategyMode === 'INHERIT'" class="mb-4" title="当前为“默认继承”模式，本意图局部覆盖不会保存或生效。需要覆盖时请切换为“继承并局部覆盖”或“独立软策略”。" type="warning" :closable="false" show-icon />
              <div :class="['grid gap-4 md:grid-cols-4', form.strategyMode === 'INHERIT' ? 'pointer-events-none opacity-50' : '']">
                <el-form-item label="温度"><el-input-number v-model="form.overrideWarmth" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
                <el-form-item label="俏皮度"><el-input-number v-model="form.overridePlayfulness" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
                <el-form-item label="正式度"><el-input-number v-model="form.overrideFormality" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
                <el-form-item label="直接度"><el-input-number v-model="form.overrideDirectness" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
                <el-form-item label="情绪强度"><el-input-number v-model="form.overrideEmotionalIntensity" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
                <el-form-item label="波浪号"><el-select v-model="form.overrideTildePolicy" clearable class="w-full"><el-option label="禁止" value="FORBIDDEN" /><el-option label="仅跟随客户" value="FOLLOW_CUSTOMER" /><el-option label="允许" value="ALLOWED" /></el-select></el-form-item>
                <el-form-item label="表情策略"><el-select v-model="form.overrideEmojiPolicy" clearable class="w-full"><el-option label="禁止" value="FORBIDDEN" /><el-option label="限制使用" value="LIMITED" /><el-option label="仅跟随客户" value="FOLLOW_CUSTOMER" /><el-option label="自动" value="AUTO" /></el-select></el-form-item>
                <el-form-item label="表情上限"><el-input-number v-model="form.overrideEmojiLimit" :min="0" :max="10" clearable class="!w-full" /></el-form-item>
                <el-form-item label="语气词频率"><el-select v-model="form.overrideSentenceParticleFrequency" clearable class="w-full"><el-option label="不用" value="NONE" /><el-option label="低频" value="LOW" /><el-option label="中等" value="MEDIUM" /></el-select></el-form-item>
                <el-form-item label="最多问题数"><el-input-number v-model="form.overrideMaxQuestions" :min="0" :max="10" clearable class="!w-full" /></el-form-item>
                <el-form-item label="最多核心动作"><el-input-number v-model="form.overrideMaxCoreMoves" :min="1" :max="3" clearable class="!w-full" /></el-form-item>
                <el-form-item label="最多猜测数"><el-input-number v-model="form.overrideMaxGuesses" :min="0" :max="5" clearable class="!w-full" /></el-form-item>
                <el-form-item label="最多句数"><el-input-number v-model="form.overrideMaxSentences" :min="1" :max="20" clearable class="!w-full" /></el-form-item>
                <el-form-item label="选择题式提问"><el-select v-model="form.overrideAllowChoiceQuestions" clearable class="w-full" placeholder="未设置"><el-option label="允许" :value="true" /><el-option label="禁止" :value="false" /></el-select></el-form-item>
                <el-form-item label="先承接再提问"><el-select v-model="form.overrideRequireAcknowledgeBeforeQuestion" clearable class="w-full" placeholder="未设置"><el-option label="要求" :value="true" /><el-option label="不额外要求" :value="false" /></el-select></el-form-item>
                <el-form-item label="销售显露度"><el-select v-model="form.overrideSalesVisibility" clearable class="w-full"><el-option v-for="item in ['S0','S1','S2','S3']" :key="item" :label="item" :value="item" /></el-select></el-form-item>
                <el-form-item label="商品提及权限"><el-select v-model="form.overrideProductMentionPolicy" clearable class="w-full"><el-option label="禁止提商品" value="PROHIBITED" /><el-option label="只允许品类方向" value="CATEGORY_ONLY" /><el-option label="相关时可提具体商品" value="SPECIFIC_IF_RELEVANT" /><el-option label="允许具体商品" value="SPECIFIC_ALLOWED" /></el-select></el-form-item>
                <el-form-item label="首要微动作"><el-input v-model="form.overrideFirstMove" clearable placeholder="例如 ACKNOWLEDGE_FIRST" /></el-form-item>
              </div>
              <div :class="['grid gap-4 md:grid-cols-2', form.strategyMode === 'INHERIT' ? 'pointer-events-none opacity-50' : '']">
                <el-form-item label="追加禁止措辞（每行一条）"><el-input v-model="form.overrideForbiddenExpressionsText" type="textarea" :rows="5" /></el-form-item>
                <el-form-item label="追加谨慎措辞（每行一条）"><el-input v-model="form.overrideCautiousExpressionsText" type="textarea" :rows="5" /></el-form-item>
                <el-form-item label="推荐表达方向（每行一条）"><el-input v-model="form.overridePreferredExpressionsText" type="textarea" :rows="4" /></el-form-item>
                <el-form-item label="追加禁止语气词（每行一条）"><el-input v-model="form.overrideForbiddenSentenceParticlesText" type="textarea" :rows="4" /></el-form-item>
                <el-form-item label="停止条件（每行一条）"><el-input v-model="form.overrideStopConditionsText" type="textarea" :rows="4" /></el-form-item>
                <el-form-item label="追加语义质量检查"><el-select v-model="form.overrideSemanticChecks" multiple allow-create filterable class="w-full" placeholder="例如 NO_PRESCRIPTIVE_CUSTOMER_DIRECTION" /></el-form-item>
              </div>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane label="高级处理策略" name="strategy">
          <el-alert class="mb-3" title="这里保留服务目标、情绪姿态和历史兼容字段。保存时，strategyPolicy 会由“策略配置”页重新生成，避免结构化配置和手写 JSON 互相冲突。" type="warning" :closable="false" show-icon />
          <ConfigEditor v-model="form.strategyText" title="高级服务、关系、情绪与经营策略 JSON" :example="strategyExample" />
        </el-tab-pane>

        <el-tab-pane label="处理流程" name="flow">
          <ConfigEditor v-model="form.flowText" title="流程步骤 JSON" :example="flowExample" />
        </el-tab-pane>
        <el-tab-pane label="回复要求与样本" name="reply">
          <ConfigEditor v-model="form.replyText" title="回复要求 JSON" :example="replyExample" />
          <div class="mt-4"><ConfigEditor v-model="form.examplesText" title="识别样本 JSON" :example="examplesExample" /></div>
        </el-tab-pane>
      </el-tabs>
    </el-form>
    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="submit">保存</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref, watch } from 'vue';
import { ElInput, ElMessage, type FormInstance, type FormRules } from 'element-plus';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import { listCustomerServiceAssets, listCustomerServiceAssetVersions } from '@/modules/customer-service/api/assets.api';
import type { CustomerServiceIntentDefinition, CustomerServiceIntentPayload } from '@/modules/customer-service/types/intent-definitions.types';
import type { CustomerServiceAsset } from '@/modules/customer-service/types/assets.types';
import type { CustomerServiceIntentStrategyPolicyConfig, CustomerServiceStrategyGroupContent, CustomerServiceStrategyInheritanceMode, CustomerServiceStrategyScopeType } from '@/modules/customer-service/types/strategy-policy.types';

const ConfigEditor = defineComponent({
  props: { modelValue: { type: String, required: true }, title: { type: String, required: true }, example: { type: String, required: true } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', {}, [
      h('div', { class: 'mb-2 text-sm font-medium text-slate-700' }, props.title),
      h(ElInput, { modelValue: props.modelValue, 'onUpdate:modelValue': (value: string) => emit('update:modelValue', value), type: 'textarea', rows: 13, placeholder: props.example, class: 'font-mono' }),
      h('div', { class: 'mt-2 text-xs leading-5 text-slate-500' }, `示例：${props.example}`),
    ]);
  }
});

type StrategyGroupOption = {
  key: string;
  name: string;
  scopeType: CustomerServiceStrategyScopeType;
  enabledByDefault: boolean;
  appliesTo: CustomerServiceStrategyGroupContent['appliesTo'];
  summary: string;
};

const props = defineProps<{ modelValue: boolean; mode: 'create' | 'edit'; initialData?: CustomerServiceIntentDefinition | null; submitting?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [payload: CustomerServiceIntentPayload & { revision: number }] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const activeTab = ref('base');
const strategyLoading = ref(false);
const strategyGroups = ref<StrategyGroupOption[]>([]);
const bindingOverrides = ref<Record<string, Record<string, unknown>>>({});
const form = reactive(defaultForm());
const hasUserContent = computed(() => Boolean(
  form.key.trim() || form.name.trim() || form.description.trim()
  || [form.recognitionText, form.strategyText, form.flowText, form.replyText, form.examplesText].some((item) => item.trim() !== '{}'),
));
const rules: FormRules = {
  key: [{ required: true, message: '请输入意图编码', trigger: 'blur' }], name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }], scenario: [{ required: true, message: '请输入场景', trigger: 'blur' }],
  primaryIntent: [{ required: true, message: '请输入主要意图', trigger: 'blur' }]
};
const categoryOptions = [
  { label: '关系与闲聊', value: 'RELATIONSHIP' }, { label: '售前', value: 'PRE_SALE' }, { label: '订单', value: 'ORDER' },
  { label: '物流', value: 'LOGISTICS' }, { label: '售后', value: 'AFTER_SALE' }, { label: '安全', value: 'SAFETY' }
];
const riskOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const recognitionExample = '{"positiveSignals":["想聊两句"],"negativeSignals":["我要投诉"],"contextSignals":["客户主动进入商家窗口"],"confidenceThreshold":0.68}';
const strategyExample = '{"serviceGoal":"先承接当前诉求","relationshipGoal":"自然亲近","optionalBusinessGoal":null,"emotionalPosture":"PLAYFUL_WARM","salesVisibility":"S1","questionBudget":1,"informationBudget":2,"rules":[]}';
const flowExample = '{"steps":[{"code":"READ_MOTIVE","name":"判断客户动机"},{"code":"RESPOND","name":"自然回应"}],"stopConditions":[]}';
const replyExample = '{"requiredPoints":["回应客户当前表达"],"forbiddenExpressions":["客服套话"],"styleGuidance":["不固定句式"]}';
const examplesExample = '{"positive":["今天心情不错，想聊两句。"],"negative":["我要投诉。"],"boundary":[],"multiTurn":[]}';

watch(() => [props.modelValue, props.initialData] as const, async ([open]) => {
  if (!open) return;
  fill(props.initialData ?? null);
  await loadStrategyGroups();
}, { immediate: true });

function defaultForm() {
  return {
    key: '', name: '', category: 'RELATIONSHIP', description: '', scenario: 'CASUAL_CHAT', primaryIntent: 'CASUAL',
    defaultRiskLevel: 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', supportedIndustryCodes: [] as string[], priority: 100, status: 'ENABLED' as 'DRAFT' | 'ENABLED' | 'DISABLED' | 'ARCHIVED', revision: 1,
    recognitionText: '{}', strategyText: '{}', flowText: '{}', replyText: '{}', examplesText: '{}',
    strategyMode: 'INHERIT_AND_OVERRIDE' as CustomerServiceStrategyInheritanceMode,
    inheritRoleCommon: true, inheritScenarioCommon: true,
    bindingStates: {} as Record<string, boolean>, disabledGroupKeys: [] as string[],
    overrideWarmth: null as number | null, overridePlayfulness: null as number | null, overrideFormality: null as number | null, overrideDirectness: null as number | null, overrideEmotionalIntensity: null as number | null,
    overrideTildePolicy: '', overrideEmojiPolicy: '', overrideEmojiLimit: null as number | null, overrideSentenceParticleFrequency: '',
    overrideMaxQuestions: null as number | null, overrideMaxCoreMoves: null as number | null, overrideMaxGuesses: null as number | null, overrideMaxSentences: null as number | null,
    overrideAllowChoiceQuestions: null as boolean | null, overrideRequireAcknowledgeBeforeQuestion: null as boolean | null,
    overrideSalesVisibility: '', overrideProductMentionPolicy: '', overrideFirstMove: '',
    overrideForbiddenExpressionsText: '', overrideCautiousExpressionsText: '', overridePreferredExpressionsText: '', overrideForbiddenSentenceParticlesText: '', overrideStopConditionsText: '', overrideSemanticChecks: [] as string[],
  };
}

function fill(item: CustomerServiceIntentDefinition | null) {
  activeTab.value = 'base';
  const defaults = defaultForm();
  bindingOverrides.value = {};
  if (!item) { Object.assign(form, defaults); return; }
  const strategyConfig = objectRecord(item.strategyConfig);
  const policy = objectRecord(strategyConfig.strategyPolicy) as Partial<CustomerServiceIntentStrategyPolicyConfig>;
  const bindings = Array.isArray(policy.bindings) ? policy.bindings.filter((value): value is CustomerServiceIntentStrategyPolicyConfig['bindings'][number] => Boolean(value && typeof value === 'object' && typeof (value as { key?: unknown }).key === 'string')) : [];
  const bindingStates: Record<string, boolean> = {};
  for (const binding of bindings) {
    bindingStates[binding.key] = binding.enabled !== false;
    if (binding.overrides && typeof binding.overrides === 'object') bindingOverrides.value[binding.key] = binding.overrides;
  }
  const overrides = objectRecord(policy.overrides);
  const tone = objectRecord(overrides.tone); const wording = objectRecord(overrides.wording); const structure = objectRecord(overrides.structure); const service = objectRecord(overrides.service);
  Object.assign(form, defaults, {
    key: item.key, name: item.name, category: item.category, description: item.description || '', scenario: item.scenario,
    primaryIntent: item.primaryIntent, defaultRiskLevel: item.defaultRiskLevel, supportedIndustryCodes: [...item.supportedIndustryCodes],
    priority: item.priority, status: item.status, revision: item.revision,
    recognitionText: format(item.recognitionConfig), strategyText: format(item.strategyConfig), flowText: format(item.flowConfig), replyText: format(item.replyConfig), examplesText: format(item.examples ?? {}),
    strategyMode: policy.mode || 'INHERIT_AND_OVERRIDE', inheritRoleCommon: policy.inheritRoleCommon !== false, inheritScenarioCommon: policy.inheritScenarioCommon !== false,
    bindingStates, disabledGroupKeys: [...(Array.isArray(policy.disabledGroupKeys) ? policy.disabledGroupKeys.map(String) : [])],
    overrideWarmth: numberOrNull(tone.warmth), overridePlayfulness: numberOrNull(tone.playfulness), overrideFormality: numberOrNull(tone.formality), overrideDirectness: numberOrNull(tone.directness), overrideEmotionalIntensity: numberOrNull(tone.emotionalIntensity),
    overrideTildePolicy: stringOrEmpty(wording.tildePolicy), overrideEmojiPolicy: stringOrEmpty(wording.emojiPolicy), overrideEmojiLimit: numberOrNull(wording.emojiLimit), overrideSentenceParticleFrequency: stringOrEmpty(wording.sentenceParticleFrequency),
    overrideMaxQuestions: numberOrNull(structure.maxQuestions), overrideMaxCoreMoves: numberOrNull(structure.maxCoreMoves), overrideMaxGuesses: numberOrNull(structure.maxGuesses), overrideMaxSentences: numberOrNull(structure.maxSentences),
    overrideAllowChoiceQuestions: booleanOrNull(structure.allowChoiceQuestions), overrideRequireAcknowledgeBeforeQuestion: booleanOrNull(structure.requireAcknowledgeBeforeQuestion),
    overrideSalesVisibility: stringOrEmpty(service.salesVisibility), overrideProductMentionPolicy: stringOrEmpty(service.productMentionPolicy), overrideFirstMove: stringOrEmpty(service.firstMove),
    overrideForbiddenExpressionsText: stringList(wording.forbiddenExpressions).join('\n'), overrideCautiousExpressionsText: stringList(wording.cautiousExpressions).join('\n'), overridePreferredExpressionsText: stringList(wording.preferredExpressions).join('\n'), overrideForbiddenSentenceParticlesText: stringList(wording.forbiddenSentenceParticles).join('\n'), overrideStopConditionsText: stringList(service.stopConditions).join('\n'), overrideSemanticChecks: stringList(wording.semanticChecks),
  });
  normalizeInheritanceMode();
}

function fillSample() {
  Object.assign(form, defaultForm(), {
    key: `logistics-urge-${Date.now().toString(36)}`,
    name: '催物流进度', category: 'LOGISTICS',
    description: '参考样例：识别客户询问或催促物流进度，并先核对订单信息再给出可执行反馈。',
    scenario: 'LOGISTICS_DELAY', primaryIntent: 'REQUEST_ACTION', defaultRiskLevel: 'LOW',
    supportedIndustryCodes: [], priority: 120, status: 'DRAFT',
    recognitionText: format({
      positiveSignals: ['怎么还没到', '帮我催一下快递', '物流几天没更新了'],
      negativeSignals: ['我要退款', '我要投诉快递员'],
      contextSignals: ['客户存在已发货订单', '客户正在询问物流节点'],
      confidenceThreshold: 0.72,
    }),
    strategyText: format({
      serviceGoal: '先核对订单与物流事实，再提供可执行的查询或催促方案',
      relationshipGoal: '直接、耐心，不机械道歉', optionalBusinessGoal: null,
      emotionalPosture: 'CALM_HELPFUL', salesVisibility: 'S0', questionBudget: 1, informationBudget: 3, rules: [],
    }),
    flowText: format({
      steps: [
        { code: 'CHECK_ORDER', name: '确认客户所指订单' },
        { code: 'READ_LOGISTICS', name: '读取最新物流节点与更新时间' },
        { code: 'RESPOND_OR_ESCALATE', name: '说明现状，必要时发起催促或转人工' },
      ],
      stopConditions: ['客户明确要求退款或投诉时，切换到对应意图', '缺少订单信息且无法定位时，只追问一个必要信息'],
    }),
    replyText: format({
      requiredPoints: ['回应客户正在等待的具体问题', '仅引用已查询到的物流事实', '说明下一步能做什么'],
      forbiddenExpressions: ['亲亲', '耐心等待一下哦', '保证今天送到'],
      styleGuidance: ['先说结论，再补充下一步', '未知信息明确说需要查询，不编造节点'],
    }),
    examplesText: format({
      positive: ['这个快递三天没动了，能帮我催一下吗', '怎么还没到呀'],
      negative: ['这件衣服尺码怎么选', '我要直接退款'],
      boundary: ['物流显示签收但我没收到'],
      multiTurn: [['客户：物流怎么不动了', '客服：我先帮你看一下，是刚才那件黑色外套吗']],
    }),
    strategyMode: 'INHERIT_AND_OVERRIDE', inheritRoleCommon: true, inheritScenarioCommon: true,
    overrideWarmth: 55, overridePlayfulness: 5, overrideFormality: 30, overrideDirectness: 75,
    overrideEmotionalIntensity: 20, overrideTildePolicy: 'FORBIDDEN', overrideEmojiPolicy: 'FORBIDDEN',
    overrideMaxQuestions: 1, overrideMaxCoreMoves: 2, overrideMaxGuesses: 0, overrideMaxSentences: 4,
    overrideAllowChoiceQuestions: false, overrideRequireAcknowledgeBeforeQuestion: true,
    overrideSalesVisibility: 'S0', overrideProductMentionPolicy: 'PROHIBITED', overrideFirstMove: 'ACKNOWLEDGE_FIRST',
    overrideForbiddenExpressionsText: '耐心等待一下哦\n保证今天送到',
    overridePreferredExpressionsText: '先说明当前查到的物流节点\n不确定时明确说明需要进一步查询',
    overrideStopConditionsText: '客户明确转为退款诉求\n客户明确提出投诉',
    overrideSemanticChecks: ['NO_RECEPTION_CLICHE', 'NO_DIDACTIC_EXPLANATION'],
  });
  bindingOverrides.value = {};
  activeTab.value = 'base';
  ElMessage.success('催物流完整样例已填入，当前状态为待审核草稿');
}

async function loadStrategyGroups() {
  strategyLoading.value = true;
  try {
    const result = await listCustomerServiceAssets({ keyword: '', assetType: 'STRATEGY_GROUP', status: '', page: 1, pageSize: 500 });
    const assets = result.items.filter((item) => item.status !== 'ARCHIVED');
    strategyGroups.value = (await Promise.all(assets.map(toStrategyOption))).filter((item): item is StrategyGroupOption => Boolean(item));
  } finally { strategyLoading.value = false; }
}
async function toStrategyOption(asset: CustomerServiceAsset): Promise<StrategyGroupOption | null> {
  const versions = await listCustomerServiceAssetVersions(asset.id);
  const current = versions.find((item) => item.id === asset.currentVersionId) || versions.find((item) => item.status === 'PUBLISHED');
  if (!current) return null;
  const content = current.content as unknown as CustomerServiceStrategyGroupContent;
  if (content?.schemaVersion !== 1 || !content.scopeType) return null;
  return { key: asset.key, name: asset.name, scopeType: content.scopeType, enabledByDefault: content.enabledByDefault !== false, appliesTo: content.appliesTo || { roleCodes: [], scenarios: [], intentKeys: [], intents: [], industryCodes: [], riskLevels: [] }, summary: groupSummary(content) };
}

function defaultApplies(row: StrategyGroupOption) {
  if (!row.enabledByDefault || groupDisabled(row.key)) return false;
  if (row.scopeType === 'INTENT') return false;
  if (row.scopeType === 'ROLE_GLOBAL' && !form.inheritRoleCommon) return false;
  if (row.scopeType === 'SCENARIO' && !form.inheritScenarioCommon) return false;
  const applies = row.appliesTo || {};
  return matchesScope(applies.roleCodes, 'ali')
    && matchesScope(applies.scenarios, form.scenario)
    && matchesScope(applies.intentKeys, form.key)
    && matchesScope(applies.intents, form.primaryIntent)
    && (!applies.industryCodes?.length || form.supportedIndustryCodes.some((item) => applies.industryCodes?.includes(item)))
    && matchesScope(applies.riskLevels, form.defaultRiskLevel);
}
function matchesScope(values: string[] | undefined, value: string) { return !values?.length || values.includes(value); }

function bindingEnabled(key: string) { return form.bindingStates[key] === true; }
function setBinding(key: string, enabled: boolean) {
  form.bindingStates[key] = enabled;
  if (enabled) form.disabledGroupKeys = form.disabledGroupKeys.filter((item) => item !== key);
}
function groupDisabled(key: string) { return form.disabledGroupKeys.includes(key); }
function setDisabled(key: string, disabled: boolean) {
  form.disabledGroupKeys = disabled ? unique([...form.disabledGroupKeys, key]) : form.disabledGroupKeys.filter((item) => item !== key);
  if (disabled) form.bindingStates[key] = false;
}
function normalizeInheritanceMode() {
  if (form.strategyMode === 'INDEPENDENT') { form.inheritRoleCommon = false; form.inheritScenarioCommon = false; }
}
watch(() => form.strategyMode, normalizeInheritanceMode);

async function submit() {
  await formRef.value?.validate();
  const recognitionConfig = parse(form.recognitionText, '识别配置');
  const strategyConfig = parse(form.strategyText, '处理策略');
  const flowConfig = parse(form.flowText, '流程配置');
  const replyConfig = parse(form.replyText, '回复要求');
  const examples = parse(form.examplesText, '识别样本');
  if (!recognitionConfig || !strategyConfig || !flowConfig || !replyConfig || !examples) return;
  strategyConfig.strategyPolicy = buildStrategyPolicy();
  emit('submit', {
    key: form.key, name: form.name, category: form.category, description: form.description, scenario: form.scenario,
    primaryIntent: form.primaryIntent, defaultRiskLevel: form.defaultRiskLevel, supportedIndustryCodes: form.supportedIndustryCodes,
    recognitionConfig, strategyConfig, flowConfig, replyConfig, examples, priority: form.priority, status: form.status, revision: form.revision
  });
}
function buildStrategyPolicy(): CustomerServiceIntentStrategyPolicyConfig {
  const bindings = Object.entries(form.bindingStates).filter(([, enabled]) => enabled).map(([key]) => ({ key, enabled: true, ...(bindingOverrides.value[key] ? { overrides: bindingOverrides.value[key] } : {}) }));
  return {
    mode: form.strategyMode,
    inheritRoleCommon: form.strategyMode === 'INDEPENDENT' ? false : form.inheritRoleCommon,
    inheritScenarioCommon: form.strategyMode === 'INDEPENDENT' ? false : form.inheritScenarioCommon,
    bindings,
    disabledGroupKeys: unique(form.disabledGroupKeys),
    overrides: form.strategyMode === 'INHERIT' ? {} : compact({
      tone: { warmth: form.overrideWarmth, playfulness: form.overridePlayfulness, formality: form.overrideFormality, directness: form.overrideDirectness, emotionalIntensity: form.overrideEmotionalIntensity },
      wording: {
        tildePolicy: form.overrideTildePolicy || undefined, emojiPolicy: form.overrideEmojiPolicy || undefined, emojiLimit: form.overrideEmojiLimit,
        sentenceParticleFrequency: form.overrideSentenceParticleFrequency || undefined, forbiddenExpressions: lines(form.overrideForbiddenExpressionsText),
        cautiousExpressions: lines(form.overrideCautiousExpressionsText), preferredExpressions: lines(form.overridePreferredExpressionsText), forbiddenSentenceParticles: lines(form.overrideForbiddenSentenceParticlesText), semanticChecks: unique(form.overrideSemanticChecks),
      },
      structure: { maxQuestions: form.overrideMaxQuestions, maxCoreMoves: form.overrideMaxCoreMoves, maxGuesses: form.overrideMaxGuesses, maxSentences: form.overrideMaxSentences, allowChoiceQuestions: form.overrideAllowChoiceQuestions, requireAcknowledgeBeforeQuestion: form.overrideRequireAcknowledgeBeforeQuestion },
      service: { salesVisibility: form.overrideSalesVisibility || undefined, productMentionPolicy: form.overrideProductMentionPolicy || undefined, firstMove: form.overrideFirstMove.trim() || undefined, stopConditions: lines(form.overrideStopConditionsText) },
    }),
  };
}

function parse(text: string, label: string) { try { const value = JSON.parse(text || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value as Record<string, unknown>; } catch { ElMessage.error(`${label}必须是合法 JSON 对象`); return null; } }
function format(value: unknown) { return JSON.stringify(value ?? {}, null, 2); }
function objectRecord(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function stringList(value: unknown) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []; }
function stringOrEmpty(value: unknown) { return typeof value === 'string' ? value : ''; }
function numberOrNull(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function booleanOrNull(value: unknown) { return typeof value === 'boolean' ? value : null; }
function lines(value: string) { return unique(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)); }
function unique(values: string[]) { return [...new Set(values.map(String).map((item) => item.trim()).filter(Boolean))]; }
function compact(value: Record<string, unknown>) { return stripEmpty(value) as Record<string, unknown>; }
function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEmpty).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value === null || value === '' ? undefined : value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) { const normalized = stripEmpty(item); if (normalized !== undefined && (!Array.isArray(normalized) || normalized.length)) result[key] = normalized; }
  return Object.keys(result).length ? result : undefined;
}
function scopeLabel(value: CustomerServiceStrategyScopeType) { return ({ ROLE_GLOBAL: '角色通用', SCENARIO: '场景通用', INTENT: '意图专属' } as const)[value]; }
function groupSummary(content: CustomerServiceStrategyGroupContent) {
  const p = content.policy; return [
    p.tone?.playfulness !== undefined ? `俏皮度 ${p.tone.playfulness}` : '', p.wording?.tildePolicy ? `波浪号 ${p.wording.tildePolicy}` : '',
    p.structure?.maxQuestions !== undefined ? `问题上限 ${p.structure.maxQuestions}` : '', p.service?.productMentionPolicy ? `商品 ${p.service.productMentionPolicy}` : '',
  ].filter(Boolean).join('；') || '结构化策略';
}
</script>

<style scoped>
.sample-fill-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; border: 1px dashed var(--el-color-primary-light-5); border-radius: 10px; background: var(--el-color-primary-light-9); padding: 12px 14px; }.sample-fill-bar strong, .sample-fill-bar span { display: block; }.sample-fill-bar span { margin-top: 3px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .sample-fill-bar { align-items: flex-start; flex-direction: column; } }
</style>
