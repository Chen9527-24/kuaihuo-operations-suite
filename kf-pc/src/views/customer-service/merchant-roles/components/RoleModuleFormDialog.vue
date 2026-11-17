<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增角色模块' : '编辑角色模块'" width="920px" top="4vh" destroy-on-close append-to-body>
    <div v-if="mode === 'create'" class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div><div class="text-sm font-semibold text-slate-700">生成当前模块类型的参考配置</div><div class="mt-1 text-xs text-slate-500">SERVICE_POSTURE 使用 V1.9 结构化互动姿态；其他模块继续使用 JSON。样例保持停用，保存前可修改。</div></div>
      <div class="flex flex-wrap items-center gap-2">
        <SampleFillButton label="填入角色模块样例" :has-content="hasUserContent" @fill="fillSample" />
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="模块类型" prop="definitionId">
          <el-select v-model="form.definitionId" class="w-full" :disabled="mode === 'edit'" @change="applyDefinitionDefaults">
            <el-option v-for="item in definitions" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="模块标识" prop="key">
          <el-input v-model="form.key" :disabled="mode === 'edit'" placeholder="例如 primary-service-posture" />
        </el-form-item>
        <el-form-item label="模块名称" prop="name">
          <el-input v-model="form.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="合并方式" prop="mergeMode">
          <el-select v-model="form.mergeMode" class="w-full">
            <el-option v-for="item in availableMergeModeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级" prop="priority"><el-input-number v-model="form.priority" :min="0" :max="2000" class="!w-full" /></el-form-item>
        <el-form-item label="排序" prop="sort"><el-input-number v-model="form.sort" :min="0" :max="9999" class="!w-full" /></el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" class="w-full">
            <el-option v-for="item in customerServiceRoleModuleStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </div>

      <template v-if="isServicePosture">
        <el-alert
          title="V1.9 互动姿态是当前明确 Role 的结构化数据，不是第二套 Role Policy"
          type="info"
          :closable="false"
          class="mb-4"
        >
          <template #default>
            它只描述“这个 Role 在允许范围内通常怎么参与”。最终能不能做、这一轮做什么，仍由现有 Planner → Unified Guideline → Canonical InteractionPlan 唯一权威链决定；Speaker Persona 只负责“怎么说”。
          </template>
        </el-alert>

        <div v-if="typedPostureEnabled" class="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="font-semibold text-slate-800">结构化互动姿态（RoleInteractionPostureV1）</div>
              <div class="mt-1 text-xs text-slate-500">这里只配置 Role 的稳定参与倾向；Hard / Safety / Grounding / 客户边界永远优先。</div>
            </div>
            <el-tag type="success">TYPED_V1</el-tag>
          </div>
          <div class="grid gap-x-6 md:grid-cols-2">
            <el-form-item label="开场参与">
              <el-select v-model="posture.openingParticipation" class="w-full"><el-option v-for="item in openingOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
            <el-form-item label="回答后承接">
              <el-select v-model="posture.followUpOffering" class="w-full"><el-option v-for="item in followUpOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
          </div>
          <el-alert title="V1.9 Correction 已把互动强度接入可验证的行为语义" type="warning" :closable="false" class="mb-3">
            <template #default>开场参与 / 回答后承接由现有 Guideline → Canonical Plan 决定；整体主动性影响已授权行为的参与口吻，澄清主动性影响商品探索中的可选问题倾向，建议主动性参与表达姿态。问题跟进与销售压力仍只作为结构化数据/Trace 预留，不会偷偷获得新权限。</template>
          </el-alert>
          <div class="grid gap-x-6 md:grid-cols-2">
            <el-form-item label="整体主动性">
              <el-select v-model="posture.initiativeLevel" class="w-full"><el-option v-for="item in initiativeOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
            <el-form-item label="澄清主动性">
              <el-select v-model="posture.clarificationInitiative" class="w-full"><el-option v-for="item in clarificationOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
            <el-form-item label="建议主动性">
              <el-select v-model="posture.guidanceInitiative" class="w-full"><el-option v-for="item in guidanceOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
            <el-form-item label="问题跟进（预留）">
              <el-select v-model="posture.resolutionFollowThrough" class="w-full"><el-option v-for="item in followThroughOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
            <el-form-item label="销售压力（预留）">
              <el-select v-model="posture.salesPressure" class="w-full"><el-option v-for="item in salesPressureOptions" :key="item.value" v-bind="item" /></el-select>
            </el-form-item>
          </div>
        </div>

        <el-alert v-else title="检测到旧版 SERVICE_POSTURE 内容" type="warning" :closable="false" class="mb-3">
          <template #default>
            旧 JSON 会继续按兼容模式保存，系统不会根据旧摘要或 Speaker Persona 自动授予主动行为。只有点击下面按钮并保存后，才显式启用 V1.9 typed posture。
          </template>
        </el-alert>
        <div v-if="!typedPostureEnabled" class="mb-4 flex justify-end">
          <el-button type="primary" plain @click="enableTypedPosture">显式启用 V1.9 互动姿态</el-button>
        </div>
      </template>

      <el-form-item v-if="!isServicePosture || !typedPostureEnabled" label="模块内容" prop="contentText">
        <el-input v-model="form.contentText" type="textarea" :rows="9" placeholder='必须是 JSON 对象，例如 {"rules":["先解决问题"]}' />
      </el-form-item>
      <el-form-item v-else label="结构化预览">
        <el-input :model-value="posturePreview" type="textarea" :rows="9" readonly />
      </el-form-item>

      <el-form-item label="生效条件">
        <el-input v-model="form.conditionsText" type="textarea" :rows="5" placeholder='可留空；支持 scenarios、intents、riskLevels、industryNodeIds、industryCodes 字符串数组' />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  customerServiceRoleModuleMergeModeOptions,
  customerServiceRoleModuleStatusOptions,
} from '@/modules/customer-service/constants/foundation.constants';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type {
  CustomerServiceMerchantRole,
  CustomerServiceRoleInteractionPostureV1,
  CustomerServiceRoleModuleDefinition,
  CustomerServiceRoleModuleInstance,
  CustomerServiceRoleModuleMergeMode,
  CustomerServiceRoleModulePayload,
  CustomerServiceRoleModuleStatus,
} from '@/modules/customer-service/types/merchant-roles.types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: CustomerServiceRoleModuleInstance | null;
  definitions: CustomerServiceRoleModuleDefinition[];
  role?: CustomerServiceMerchantRole | null;
  submitting?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [value: CustomerServiceRoleModulePayload] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const typedPostureEnabled = ref(false);
const form = reactive({
  definitionId: '',
  key: '',
  name: '',
  mergeMode: 'APPEND' as CustomerServiceRoleModuleMergeMode,
  priority: 100,
  sort: 0,
  status: 'ENABLED' as CustomerServiceRoleModuleStatus,
  contentText: '{\n  \n}',
  conditionsText: '',
  revision: 1,
});
const posture = reactive<CustomerServiceRoleInteractionPostureV1>(defaultInteractionPosture());

const selectedDefinition = computed(() => props.definitions.find((item) => item.id === form.definitionId) ?? props.initialData?.definition ?? null);
const isServicePosture = computed(() => selectedDefinition.value?.code === 'SERVICE_POSTURE');
const posturePreview = computed(() => JSON.stringify(buildPosturePayload(), null, 2));
const availableMergeModeOptions = computed(() => isServicePosture.value && typedPostureEnabled.value
  ? customerServiceRoleModuleMergeModeOptions.filter((item) => item.value !== 'APPEND')
  : customerServiceRoleModuleMergeModeOptions);
const hasUserContent = computed(() => Boolean(
  form.definitionId || form.key.trim() || form.name.trim()
  || !['', '{}', '{\n  \n}'].includes(form.contentText.trim()) || form.conditionsText.trim(),
));
const rules: FormRules = {
  definitionId: [{ required: true, message: '请选择模块类型', trigger: 'change' }],
  key: [
    { required: true, message: '请输入模块标识', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '仅支持字母、数字、点、下划线和短横线', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入模块名称', trigger: 'blur' }],
  contentText: [{ required: true, message: '请输入模块内容', trigger: 'blur' }],
};

const initiativeOptions = [
  { label: '克制：尽量只响应明确需求', value: 'RESTRAINED' },
  { label: '平衡：有上下文价值时自然参与', value: 'BALANCED' },
  { label: '主动：在合法范围内积极承接', value: 'PROACTIVE' },
];
const openingOptions = [
  { label: '只回应问候', value: 'ACK_ONLY' },
  { label: '情境承接：合适时偏好打开轻量入口', value: 'CONTEXTUAL_ENTRY' },
  { label: '主动承接：无更高边界时本轮必须实际打开入口', value: 'ACTIVE_ENTRY' },
];
const followUpOptions = [
  { label: '回答后停止', value: 'ANSWER_ONLY' },
  { label: '情境承接：合适时偏好补一句可继续帮忙', value: 'CONTEXTUAL_OFFER' },
  { label: '主动承接：无更高边界时本轮必须实际承接下一步', value: 'ACTIVE_OFFER' },
];
const clarificationOptions = [
  { label: '只问完成任务所必需的信息', value: 'REQUIRED_ONLY' },
  { label: '只问能明显减少决策不确定性的信息', value: 'DECISION_RELEVANT' },
  { label: '允许探索式澄清', value: 'EXPLORATORY' },
];
const guidanceOptions = [
  { label: '客户明确要求时才给建议', value: 'REQUESTED_ONLY' },
  { label: '上下文有价值时给建议', value: 'CONTEXTUAL' },
  { label: '明确有帮助时可主动给建议', value: 'PROACTIVE_WHEN_USEFUL' },
];
const followThroughOptions = [
  { label: '最小回应', value: 'MINIMAL' },
  { label: '自然推进到下一步', value: 'NEXT_STEP' },
  { label: '在权限内持续跟进至解决', value: 'UNTIL_RESOLVED' },
];
const salesPressureOptions = [
  { label: '不施加销售压力', value: 'NONE' },
  { label: '低压力', value: 'LOW' },
  { label: '正常业务压力', value: 'NORMAL' },
];

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const initialContent = props.initialData?.content ?? {};
    Object.assign(form, {
      definitionId: props.initialData?.definitionId ?? '',
      key: props.initialData?.key ?? '',
      name: props.initialData?.name ?? '',
      mergeMode: props.initialData?.mergeMode ?? 'APPEND',
      priority: props.initialData?.priority ?? 100,
      sort: props.initialData?.sort ?? 0,
      status: props.initialData?.status ?? 'ENABLED',
      contentText: JSON.stringify(initialContent, null, 2),
      conditionsText: props.initialData?.conditions ? JSON.stringify(props.initialData.conditions, null, 2) : '',
      revision: props.initialData?.revision ?? 1,
    });
    const typed = parseTypedPosture(initialContent);
    typedPostureEnabled.value = Boolean(props.initialData?.definition.code === 'SERVICE_POSTURE' && typed);
    Object.assign(posture, typed ?? defaultInteractionPosture());
  },
);

function applyDefinitionDefaults(id: string) {
  if (props.mode !== 'create') return;
  const definition = props.definitions.find((item) => item.id === id);
  if (!definition) return;
  form.mergeMode = definition.defaultMergeMode;
  form.priority = definition.defaultPriority;
  if (!form.name) form.name = definition.name;
  if (definition.code === 'SERVICE_POSTURE') {
    typedPostureEnabled.value = true;
    Object.assign(posture, defaultInteractionPosture());
    form.contentText = posturePreview.value;
  } else {
    typedPostureEnabled.value = false;
    form.contentText = '{\n  \n}';
  }
}

function enableTypedPosture() {
  typedPostureEnabled.value = true;
  Object.assign(posture, defaultInteractionPosture());
  if (form.mergeMode === 'APPEND') form.mergeMode = 'STRICTER';
  form.contentText = posturePreview.value;
  ElMessage.success('已切换为 V1.9 结构化互动姿态；保存后才会生效');
}

function fillSample() {
  const definition = props.definitions[0];
  if (!definition) {
    ElMessage.warning('当前没有可用模块定义，请先初始化客服基础数据');
    return;
  }
  const contentByType: Record<string, Record<string, unknown>> = {
    IDENTITY: { rules: ['保持当前明确角色的身份边界', '不虚构权限、经历和动作结果'] },
    SERVICE_POSTURE: defaultInteractionPosture(),
    LANGUAGE_STYLE: { rules: ['自然短句优先', '不复述客户已经说过的内容', '一轮只问一个必要问题'] },
    BUSINESS_BEHAVIOR: { rules: ['客户明确需求后再推进业务', '客户拒绝后停止相应推进'] },
    EVALUATION_CRITERIA: { rules: ['简单问题一到两句话完成', '第一句直接回应客户当前问题'] },
    PROHIBITION: { forbidden: ['编造价格、库存和活动', '动作未成功时声称已完成'] },
  };
  Object.assign(form, {
    definitionId: definition.id,
    key: `sample-${definition.code.toLowerCase()}-${Date.now().toString(36)}`,
    name: `${definition.name}（参考）`,
    mergeMode: definition.defaultMergeMode,
    priority: definition.defaultPriority,
    sort: 0,
    status: 'DISABLED',
    contentText: JSON.stringify(contentByType[definition.code] || { rules: ['按当前模块职责处理客户问题，不虚构事实'] }, null, 2),
    conditionsText: JSON.stringify({ scenarios: ['PRODUCT_CONSULT'], riskLevels: ['LOW'] }, null, 2),
  });
  const typed = definition.code === 'SERVICE_POSTURE' ? parseTypedPosture(contentByType.SERVICE_POSTURE) : null;
  typedPostureEnabled.value = Boolean(typed);
  if (typed) Object.assign(posture, typed);
  ElMessage.success('角色模块样例已填入，当前保持停用状态');
}

async function submit() {
  await formRef.value?.validate();
  const content = isServicePosture.value && typedPostureEnabled.value
    ? buildPosturePayload()
    : parseObject(form.contentText, '模块内容');
  if (!content) return;
  const conditions = form.conditionsText.trim() ? parseObject(form.conditionsText, '生效条件') : null;
  if (form.conditionsText.trim() && !conditions) return;
  emit('submit', {
    definitionId: form.definitionId,
    key: form.key,
    name: form.name,
    mergeMode: form.mergeMode,
    priority: form.priority,
    sort: form.sort,
    status: form.status,
    content,
    conditions,
    revision: form.revision,
  });
}

function defaultInteractionPosture(): CustomerServiceRoleInteractionPostureV1 {
  return {
    schemaVersion: 1,
    initiativeLevel: 'BALANCED',
    openingParticipation: 'CONTEXTUAL_ENTRY',
    followUpOffering: 'CONTEXTUAL_OFFER',
    clarificationInitiative: 'DECISION_RELEVANT',
    guidanceInitiative: 'CONTEXTUAL',
    resolutionFollowThrough: 'NEXT_STEP',
    salesPressure: 'LOW',
  };
}

function buildPosturePayload(): CustomerServiceRoleInteractionPostureV1 {
  return {
    schemaVersion: 1,
    initiativeLevel: posture.initiativeLevel,
    openingParticipation: posture.openingParticipation,
    followUpOffering: posture.followUpOffering,
    clarificationInitiative: posture.clarificationInitiative,
    guidanceInitiative: posture.guidanceInitiative,
    resolutionFollowThrough: posture.resolutionFollowThrough,
    salesPressure: posture.salesPressure,
  };
}

function parseTypedPosture(value: Record<string, unknown> | undefined): CustomerServiceRoleInteractionPostureV1 | null {
  if (!value || value.schemaVersion !== 1) return null;
  const required = [
    'initiativeLevel', 'openingParticipation', 'followUpOffering', 'clarificationInitiative',
    'guidanceInitiative', 'resolutionFollowThrough', 'salesPressure',
  ];
  if (!required.every((key) => typeof value[key] === 'string' && String(value[key]).trim())) return null;
  return value as unknown as CustomerServiceRoleInteractionPostureV1;
}

function parseObject(value: string, label: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    ElMessage.error(`${label}必须是合法的 JSON 对象`);
    return null;
  }
}
</script>
