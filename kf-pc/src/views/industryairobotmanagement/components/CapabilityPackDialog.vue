<template>
  <el-dialog v-model="visible" :title="pack ? '编辑行业能力包' : '新建行业能力包'" width="1080px" top="4vh" destroy-on-close>
    <el-alert
      type="info"
      :closable="false"
      class="!mb-4"
      title="此处只维护新行业 AI 机器人的行业规则、场景示例与风控要求，不会修改现有评论机器人、私信机器人或 Coze 配置。"
    />
    <div v-if="!pack" class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div><div class="text-sm font-semibold text-slate-700">行业能力包内容较多，可先回填完整样例</div><div class="mt-1 text-xs text-slate-500">包含行业表达、两个高频场景、自然回复示例和风险规则；只生成草稿表单。</div></div>
      <SampleFillButton label="填入女装行业能力样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="app-scrollbar max-h-[72vh] overflow-y-auto pr-2">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <el-form-item label="能力包名称" prop="name">
          <el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：职业技能培训咨询" />
        </el-form-item>
        <el-form-item label="适用行业名称" prop="industryName">
          <el-input v-model="form.industryName" maxlength="50" placeholder="例如：教育培训" />
        </el-form-item>
        <el-form-item label="行业编码" prop="industryCode">
          <el-input v-model="form.industryCode" maxlength="64" placeholder="例如：education_training" />
        </el-form-item>
        <el-form-item label="适用渠道" prop="channel">
          <el-select v-model="form.channel" class="w-full">
            <el-option v-for="item in channelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="能力包说明">
        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="300" show-word-limit placeholder="说明该行业包的适用业务、用户类型或覆盖范围。" />
      </el-form-item>

      <el-divider content-position="left">行业表达与风险策略</el-divider>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <el-form-item label="行业语气">
          <el-input v-model="form.version.tone" type="textarea" :rows="4" placeholder="例如：专业、耐心、直接说明事实；不刻意卖萌，不使用空泛套话。" />
        </el-form-item>
        <el-form-item label="回复原则">
          <el-input v-model="form.version.replyPrinciples" type="textarea" :rows="4" placeholder="例如：先确认具体问题，再说明依据与下一步；信息不足时只追问一个必要问题。" />
        </el-form-item>
        <el-form-item label="风险策略">
          <el-input v-model="form.version.riskPolicy" type="textarea" :rows="4" placeholder="例如：不承诺结果、价格、退款时效；不能确认时直接说明并建议人工处理。" />
        </el-form-item>
        <el-form-item label="总转人工规则">
          <el-input v-model="form.version.handoffPolicy" type="textarea" :rows="4" placeholder="例如：退款、付款、合同、投诉、账号安全、连续未解决问题，必须建议转人工。" />
        </el-form-item>
      </div>

      <el-divider content-position="left">行业场景</el-divider>
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="text-sm text-slate-500">场景决定客服在不同问题下先回应什么、怎么把重点说清、怎么自然跟进。初期每个能力包建议维护 8–12 个高频场景。</div>
        <el-button type="primary" plain @click="addScenario">新增场景</el-button>
      </div>

      <div v-if="!form.version.scenarios.length" class="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
        暂无场景。至少添加一个高频咨询场景后再保存。
      </div>

      <div v-for="(scenario, scenarioIndex) in form.version.scenarios" :key="scenario.localId" class="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="font-medium text-slate-700 dark:text-slate-100">场景 {{ scenarioIndex + 1 }}</div>
          <el-button type="danger" link @click="removeScenario(scenarioIndex)">删除场景</el-button>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <el-form-item label="场景名称" required>
            <el-input v-model="scenario.name" maxlength="60" placeholder="例如：课程效果顾虑" />
          </el-form-item>
          <el-form-item label="场景编码" required>
            <el-input v-model="scenario.code" maxlength="64" placeholder="例如：course_effect_concern" />
          </el-form-item>
          <el-form-item label="适用渠道">
            <el-select v-model="scenario.channel" class="w-full">
              <el-option v-for="item in channelOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="风险等级">
            <el-select v-model="scenario.riskLevel" class="w-full">
              <el-option v-for="item in riskOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="回复模式">
            <el-select v-model="scenario.replyMode" class="w-full">
              <el-option v-for="item in replyModeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级">
            <el-input-number v-model="scenario.priority" :min="1" :max="9999" class="!w-full" />
          </el-form-item>
          <el-form-item label="启用场景" class="flex items-end">
            <el-switch v-model="scenario.enabled" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>

        <el-form-item label="触发词 / 典型问法">
          <el-input v-model="scenario.triggerPhrasesText" type="textarea" :rows="2" placeholder="用逗号或换行分隔，例如：学不会、有没有效果、怕浪费钱" />
        </el-form-item>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <el-form-item label="用户意图说明">
            <el-input v-model="scenario.intentDescription" type="textarea" :rows="3" placeholder="描述用户真正关心的问题。" />
          </el-form-item>
          <el-form-item label="回复目标">
            <el-input v-model="scenario.replyGoal" type="textarea" :rows="3" placeholder="描述此场景必须达成的回复目标。" />
          </el-form-item>
          <el-form-item label="回复框架">
            <el-input v-model="scenario.replyFramework" type="textarea" :rows="3" placeholder="例如：确认顾虑 → 解释支持方式 → 给下一步，不承诺效果。" />
          </el-form-item>
        </div>

        <div class="mt-1 flex items-center justify-between gap-3">
          <div class="text-sm font-medium text-slate-700 dark:text-slate-100">高质量示例</div>
          <el-button size="small" type="primary" plain @click="addExample(scenario)">新增示例</el-button>
        </div>
        <div v-if="!scenario.examples.length" class="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-slate-800/60">建议至少填写 1 条真实、可复用的用户问法与推荐回复。</div>
        <div v-for="(example, exampleIndex) in scenario.examples" :key="example.localId" class="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
          <div class="mb-2 flex justify-end"><el-button type="danger" link size="small" @click="removeExample(scenario, exampleIndex)">删除示例</el-button></div>
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <el-form-item label="用户问法" required class="!mb-0">
              <el-input v-model="example.userInput" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="例如：课程学不会怎么办？" />
            </el-form-item>
            <el-form-item label="推荐回复" required class="!mb-0">
              <el-input v-model="example.recommendedReply" type="textarea" :rows="3" maxlength="3000" show-word-limit placeholder="写入可直接参考的自然回复，不要写死价格、活动或无法验证的承诺。" />
            </el-form-item>
          </div>
          <el-form-item label="适用备注" class="mt-3 !mb-0">
            <el-input v-model="example.notes" maxlength="300" placeholder="可选：适用条件、注意事项或来源说明。" />
          </el-form-item>
        </div>
      </div>

      <el-divider content-position="left">禁答与转人工规则</el-divider>
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="text-sm text-slate-500">规则在新行业 AI 机器人测试中参与提示词组装与转人工建议，不会影响旧机器人。</div>
        <el-button type="primary" plain @click="addGuardrail">新增规则</el-button>
      </div>
      <div v-if="!form.version.guardrails.length" class="rounded-xl border border-dashed border-slate-300 px-5 py-5 text-center text-sm text-slate-500 dark:border-slate-700">暂无规则。</div>
      <div v-for="(rule, ruleIndex) in form.version.guardrails" :key="rule.localId" class="mb-3 grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[170px_1fr_110px_100px_auto] dark:border-slate-700">
        <el-form-item label="规则类型" class="!mb-0">
          <el-select v-model="rule.type"><el-option v-for="item in guardrailTypeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        </el-form-item>
        <el-form-item label="规则内容" class="!mb-0"><el-input v-model="rule.ruleContent" maxlength="1000" placeholder="例如：不得承诺包过、保证效果或具体到账时间。" /></el-form-item>
        <el-form-item label="优先级" class="!mb-0"><el-input-number v-model="rule.priority" :min="1" :max="9999" class="!w-full" /></el-form-item>
        <el-form-item label="启用" class="!mb-0"><el-switch v-model="rule.enabled" /></el-form-item>
        <el-button type="danger" link @click="removeGuardrail(ruleIndex)">删除</el-button>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存草稿</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type {
  IndustryAiCapabilityPack,
  IndustryAiCapabilityPackPayload,
  IndustryAiChannel,
  IndustryAiGuardrailType,
  IndustryAiReplyMode,
  IndustryAiRiskLevel,
  IndustryAiServiceCapabilityKey
} from '@/api/modules/industryAi';

interface EditableExample {
  localId: string;
  userInput: string;
  recommendedReply: string;
  notes: string;
}

interface EditableScenario {
  localId: string;
  code: string;
  name: string;
  channel: IndustryAiChannel;
  triggerPhrasesText: string;
  // 兼容已存在的数据字段；新页面不再要求逐项配置客服处理权限。
  serviceKey: IndustryAiServiceCapabilityKey;
  intentDescription: string;
  replyGoal: string;
  replyFramework: string;
  riskLevel: IndustryAiRiskLevel;
  replyMode: IndustryAiReplyMode;
  priority: number;
  enabled: boolean;
  examples: EditableExample[];
}

interface EditableGuardrail {
  localId: string;
  type: IndustryAiGuardrailType;
  ruleContent: string;
  priority: number;
  enabled: boolean;
}

interface EditablePackForm {
  name: string;
  industryCode: string;
  industryName: string;
  channel: IndustryAiChannel;
  description: string;
  version: {
    tone: string;
    replyPrinciples: string;
    riskPolicy: string;
    handoffPolicy: string;
    scenarios: EditableScenario[];
    guardrails: EditableGuardrail[];
  };
}

const props = defineProps<{ modelValue: boolean; pack?: IndustryAiCapabilityPack | null; saving?: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: IndustryAiCapabilityPackPayload & { versionId?: string }];
}>();

const formRef = ref<FormInstance>();
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });
const form = reactive<EditablePackForm>(createEmptyForm());
const hasUserContent = computed(() => Boolean(
  form.name.trim() || form.industryCode.trim() || form.industryName.trim() || form.description.trim()
  || form.version.tone.trim() || form.version.replyPrinciples.trim() || form.version.scenarios.length || form.version.guardrails.length,
));

const channelOptions: Array<{ label: string; value: IndustryAiChannel }> = [
  { label: '私信', value: 'DM' },
  { label: '评论', value: 'COMMENT' },
  { label: '评论和私信', value: 'BOTH' }
];
const riskOptions: Array<{ label: string; value: IndustryAiRiskLevel }> = [
  { label: '低风险', value: 'LOW' },
  { label: '中风险', value: 'MEDIUM' },
  { label: '高风险', value: 'HIGH' }
];
const replyModeOptions: Array<{ label: string; value: IndustryAiReplyMode }> = [
  { label: 'AI 直接生成', value: 'AI_REPLY' },
  { label: '仅建议人工发送', value: 'SUGGEST_ONLY' },
  { label: '建议转人工', value: 'HANDOFF' }
];
const guardrailTypeOptions: Array<{ label: string; value: IndustryAiGuardrailType }> = [
  { label: '禁止表达', value: 'FORBIDDEN' },
  { label: '必须包含', value: 'REQUIRED' },
  { label: '触发转人工', value: 'HANDOFF' }
];

const rules: FormRules<EditablePackForm> = {
  name: [{ required: true, message: '请输入能力包名称', trigger: 'blur' }],
  industryName: [{ required: true, message: '请输入行业名称', trigger: 'blur' }],
  industryCode: [{ required: true, message: '请输入行业编码', trigger: 'blur' }],
  channel: [{ required: true, message: '请选择适用渠道', trigger: 'change' }]
};

watch(
  () => [props.modelValue, props.pack] as const,
  ([open]) => {
    if (!open) return;
    resetForm(props.pack || null);
  },
  { immediate: true }
);

function createEmptyForm(): EditablePackForm {
  return {
    name: '',
    industryCode: '',
    industryName: '',
    channel: 'DM',
    description: '',
    version: { tone: '', replyPrinciples: '', riskPolicy: '', handoffPolicy: '', scenarios: [], guardrails: [] }
  };
}

function resetForm(pack: IndustryAiCapabilityPack | null) {
  const next = createEmptyForm();
  if (pack) {
    const version = pack.latestVersion || pack.versions?.[0];
    next.name = pack.name;
    next.industryCode = pack.industryCode;
    next.industryName = pack.industryName;
    next.channel = pack.channel || 'DM';
    next.description = pack.description || '';
    next.version.tone = version?.tone || '';
    next.version.replyPrinciples = version?.replyPrinciples || '';
    next.version.riskPolicy = version?.riskPolicy || '';
    next.version.handoffPolicy = version?.handoffPolicy || '';
    next.version.scenarios = (version?.scenarios || []).map((scenario) => ({
      localId: createId(),
      code: scenario.code,
      name: scenario.name,
      channel: scenario.channel || next.channel,
      triggerPhrasesText: (scenario.triggerPhrases || []).join('、'),
      serviceKey: scenario.serviceKey || 'GENERAL_CONSULTATION',
      intentDescription: scenario.intentDescription || '',
      replyGoal: scenario.replyGoal || '',
      replyFramework: scenario.replyFramework || '',
      riskLevel: scenario.riskLevel || 'LOW',
      replyMode: scenario.replyMode || 'AI_REPLY',
      priority: scenario.priority || 100,
      enabled: scenario.enabled !== false,
      examples: (scenario.examples || []).map((example) => ({ localId: createId(), userInput: example.userInput, recommendedReply: example.recommendedReply, notes: example.notes || '' }))
    }));
    next.version.guardrails = (version?.guardrails || []).map((rule) => ({
      localId: createId(),
      type: rule.type,
      ruleContent: rule.ruleContent,
      priority: rule.priority || 100,
      enabled: rule.enabled !== false
    }));
  }
  Object.assign(form, next);
  formRef.value?.clearValidate();
}

function fillSample() {
  Object.assign(form, {
    name: '通勤女装客服能力包（参考）',
    industryCode: `women_clothing_sample_${Date.now().toString(36)}`,
    industryName: '通勤女装', channel: 'BOTH',
    description: '虚构参考能力包：覆盖女装咨询、尺码方向、物流与售后边界。',
    version: {
      tone: '自然、耐心、直接说明已知事实；不使用“亲亲”“宝宝”等套话，不夸张营销。',
      replyPrinciples: '先回答客户当前问题；信息不足时只追问一个必要问题；商品、库存和活动只使用已验证信息。',
      riskPolicy: '不保证绝对合身，不编造库存、活动、物流节点或退款到账时间。',
      handoffPolicy: '投诉升级、支付安全、退款争议、连续两轮无法解决时建议转人工。',
      scenarios: [
        {
          localId: createId(), code: 'size_direction', name: '尺码方向咨询', channel: 'BOTH',
          triggerPhrasesText: '怎么选尺码、我穿多大、会不会太紧', serviceKey: 'GENERAL_CONSULTATION',
          intentDescription: '客户希望结合当前商品尺码表获得选择方向。',
          replyGoal: '先说明需要的关键信息，再基于已验证尺码表给出方向，不保证绝对合身。',
          replyFramework: '回应问题 → 只询问一个必要信息 → 给出尺码方向与边界',
          riskLevel: 'LOW', replyMode: 'AI_REPLY', priority: 120, enabled: true,
          examples: [{ localId: createId(), userInput: '160，50 公斤选什么码？', recommendedReply: '可以先看这款的版型和尺码表。你平时更喜欢合身还是稍微宽松一点？', notes: '没有真实尺码表时不能直接报尺码。' }],
        },
        {
          localId: createId(), code: 'logistics_delay', name: '物流长时间未更新', channel: 'DM',
          triggerPhrasesText: '物流怎么不动、帮我催一下、几天没更新', serviceKey: 'GENERAL_CONSULTATION',
          intentDescription: '客户正在等待已发货订单，希望查询或催促物流。',
          replyGoal: '确认订单后查询真实节点，说明可以执行的催件动作，不承诺到货时间。',
          replyFramework: '承接等待问题 → 确认订单 → 查询或催件 → 报告真实结果',
          riskLevel: 'MEDIUM', replyMode: 'AI_REPLY', priority: 150, enabled: true,
          examples: [{ localId: createId(), userInput: '快递三天没动了，能催一下吗？', recommendedReply: '可以，我先帮你看最新物流节点。是刚才那件黑色外套的订单吗？', notes: '只追问一个用于定位订单的信息。' }],
        },
      ],
      guardrails: [
        { localId: createId(), type: 'FORBIDDEN', ruleContent: '不得编造价格、库存、优惠、物流节点和售后处理结果。', priority: 1000, enabled: true },
        { localId: createId(), type: 'HANDOFF', ruleContent: '涉及验证码、密码、支付安全或严重投诉时必须建议转人工。', priority: 1100, enabled: true },
      ],
    },
  });
  formRef.value?.clearValidate();
  ElMessage.success('完整行业能力样例已填入，保存后只会创建草稿');
}

function addScenario() {
  form.version.scenarios.push({
    localId: createId(),
    code: '',
    name: '',
    channel: form.channel,
    triggerPhrasesText: '',
    serviceKey: 'GENERAL_CONSULTATION',
    intentDescription: '',
    replyGoal: '',
    replyFramework: '',
    riskLevel: 'LOW',
    replyMode: 'AI_REPLY',
    priority: 100,
    enabled: true,
    examples: []
  });
}

function removeScenario(index: number) {
  form.version.scenarios.splice(index, 1);
}

function addExample(scenario: EditableScenario) {
  scenario.examples.push({ localId: createId(), userInput: '', recommendedReply: '', notes: '' });
}

function removeExample(scenario: EditableScenario, index: number) {
  scenario.examples.splice(index, 1);
}

function addGuardrail() {
  form.version.guardrails.push({ localId: createId(), type: 'FORBIDDEN', ruleContent: '', priority: 100, enabled: true });
}

function removeGuardrail(index: number) {
  form.version.guardrails.splice(index, 1);
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (!form.version.scenarios.length) {
    ElMessage.warning('请至少维护一个行业场景');
    return;
  }
  for (const scenario of form.version.scenarios) {
    if (!scenario.name.trim() || !scenario.code.trim()) {
      ElMessage.warning('每个场景都需要填写名称和编码');
      return;
    }
    for (const example of scenario.examples) {
      if (!example.userInput.trim() || !example.recommendedReply.trim()) {
        ElMessage.warning(`场景“${scenario.name || scenario.code}”存在未完成的示例`);
        return;
      }
    }
  }
  for (const rule of form.version.guardrails) {
    if (!rule.ruleContent.trim()) {
      ElMessage.warning('请补全规则内容，或删除空规则');
      return;
    }
  }

  const sourceVersion = props.pack?.latestVersion || props.pack?.versions?.[0];
  emit('submit', {
    name: form.name.trim(),
    industryCode: form.industryCode.trim(),
    industryName: form.industryName.trim(),
    channel: form.channel,
    description: form.description.trim() || undefined,
    versionId: sourceVersion?.id,
    version: {
      tone: form.version.tone.trim() || undefined,
      replyPrinciples: form.version.replyPrinciples.trim() || undefined,
      riskPolicy: form.version.riskPolicy.trim() || undefined,
      handoffPolicy: form.version.handoffPolicy.trim() || undefined,
      scenarios: form.version.scenarios.map((scenario) => ({
        code: scenario.code.trim(),
        name: scenario.name.trim(),
        channel: scenario.channel,
        triggerPhrases: scenario.triggerPhrasesText.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean),
        serviceKey: scenario.serviceKey,
        intentDescription: scenario.intentDescription.trim() || undefined,
        replyGoal: scenario.replyGoal.trim() || undefined,
        replyFramework: scenario.replyFramework.trim() || undefined,
        riskLevel: scenario.riskLevel,
        replyMode: scenario.replyMode,
        priority: scenario.priority,
        enabled: scenario.enabled,
        examples: scenario.examples.map((example) => ({
          userInput: example.userInput.trim(),
          recommendedReply: example.recommendedReply.trim(),
          notes: example.notes.trim() || undefined,
          qualityScore: 100,
          enabled: true
        }))
      })),
      guardrails: form.version.guardrails.map((rule) => ({ type: rule.type, ruleContent: rule.ruleContent.trim(), priority: rule.priority, enabled: rule.enabled }))
    }
  });
}

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
</script>
