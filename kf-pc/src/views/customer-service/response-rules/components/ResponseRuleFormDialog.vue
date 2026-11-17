<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增回复规则' : '编辑回复规则'" width="960px" top="4vh" destroy-on-close>
    <div v-if="mode === 'create'" class="sample-fill-bar">
      <div><strong>条件组合不清楚？</strong><span>回填一条停用状态的“物流催促”样例；如有可用资产会自动选中第一项，请保存前核对。</span></div>
      <SampleFillButton label="填入条件规则样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="规则编码" prop="key"><el-input v-model="form.key" :disabled="mode === 'edit'" placeholder="例如 logistics-delay-rule" /></el-form-item>
        <el-form-item label="规则名称" prop="name"><el-input v-model="form.name" maxlength="120" /></el-form-item>
        <el-form-item label="响应资产" prop="responseAssetId">
          <el-select v-model="form.responseAssetId" class="w-full" filterable placeholder="选择已发布确定性资产">
            <el-option v-for="item in assets" :key="item.id" :label="`${item.name}（${assetTypeLabel(item.assetType)}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status" class="w-full"><el-option v-for="item in customerServiceResponseRuleStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="0" :max="10000" class="!w-full" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" :max="10000" class="!w-full" /></el-form-item>
      </div>
      <el-form-item label="排他规则"><el-switch v-model="form.exclusive" active-text="命中后停止后续规则" /></el-form-item>

      <ConditionEditor v-model="form.conditions" title="生效条件" :industries="industries" />
      <el-collapse class="mb-4">
        <el-collapse-item title="排除条件（可选）" name="exclusions">
          <ConditionEditor v-model="form.exclusions" title="命中以下任一配置组合时排除" :industries="industries" compact />
        </el-collapse-item>
      </el-collapse>
      <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="2000" /></el-form-item>
    </el-form>
    <el-alert title="同一条件字段内为“任一命中”，不同字段之间为“同时满足”。完全不填写生效条件会形成全局规则，请谨慎使用。" type="info" :closable="false" show-icon />
    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="submit">保存</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { type FormInstance, type FormRules } from 'element-plus';
import { customerServiceAssetTypeOptions, customerServiceResponseRuleStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type { CustomerServiceAsset } from '@/modules/customer-service/types/assets.types';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceResponseRule, CustomerServiceResponseRuleStatus } from '@/modules/customer-service/types/response-rules.types';
import type { CustomerServiceRuleConditionForm } from '@/modules/customer-service/types/rule-conditions.types';
import ConditionEditor from './RuleConditionEditor.vue';

const props = defineProps<{ modelValue: boolean; mode: 'create' | 'edit'; initialData?: CustomerServiceResponseRule | null; assets: CustomerServiceAsset[]; industries: CustomerServiceIndustryNode[]; submitting?: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [value: { key: string; name: string; responseAssetId: string; conditions: Record<string, unknown>; exclusions: Record<string, unknown>; priority: number; sort: number; exclusive: boolean; status: CustomerServiceResponseRuleStatus; description: string; revision: number }];
}>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const form = reactive({ key: '', name: '', responseAssetId: '', conditions: emptyConditions(), exclusions: emptyConditions(), priority: 100, sort: 0, exclusive: false, status: 'ENABLED' as CustomerServiceResponseRuleStatus, description: '', revision: 1 });
const hasUserContent = computed(() => Boolean(
  form.key.trim() || form.name.trim() || form.description.trim() || form.responseAssetId
  || Object.values(form.conditions).some((items) => items.length) || Object.values(form.exclusions).some((items) => items.length),
));
const rules: FormRules = {
  key: [{ required: true, message: '请输入规则编码', trigger: 'blur' }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '规则编码格式不正确', trigger: 'blur' }],
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  responseAssetId: [{ required: true, message: '请选择响应资产', trigger: 'change' }]
};

watch(() => props.modelValue, (open) => {
  if (!open) return;
  const item = props.initialData;
  Object.assign(form, {
    key: item?.key ?? '', name: item?.name ?? '', responseAssetId: item?.responseAssetId ?? '',
    conditions: toConditionForm(item?.conditions), exclusions: toConditionForm(item?.exclusions),
    priority: item?.priority ?? 100, sort: item?.sort ?? 0, exclusive: item?.exclusive ?? false,
    status: item?.status ?? 'ENABLED', description: item?.description ?? '', revision: item?.revision ?? 1
  });
});

function fillSample() {
  Object.assign(form, {
    key: `logistics-delay-rule-${Date.now().toString(36)}`,
    name: '物流停滞时进入催件流程',
    responseAssetId: props.assets[0]?.id ?? '',
    conditions: { scenarios: ['LOGISTICS_DELAY'], intents: ['REQUEST_ACTION'], riskLevels: ['LOW', 'MEDIUM'], industryNodeIds: [], industryCodes: [] },
    exclusions: { scenarios: ['COMPLAINT_ESCALATION'], intents: [], riskLevels: ['HIGH', 'CRITICAL'], industryNodeIds: [], industryCodes: [] },
    priority: 200, sort: 100, exclusive: true, status: 'DISABLED',
    description: '参考样例：仅在客户催促物流且风险较低时命中；投诉或高风险时排除。保存前请核对响应资产。',
  });
}

async function submit() {
  await formRef.value?.validate();
  const conditions = compactConditions(form.conditions);
  const exclusions = compactConditions(form.exclusions);
  emit('submit', { key: form.key, name: form.name, responseAssetId: form.responseAssetId, conditions, exclusions, priority: form.priority, sort: form.sort, exclusive: form.exclusive, status: form.status, description: form.description, revision: form.revision });
}
function emptyConditions(): CustomerServiceRuleConditionForm { return { scenarios: [], intents: [], riskLevels: [], industryNodeIds: [], industryCodes: [] }; }
function toConditionForm(value?: Record<string, unknown> | null): CustomerServiceRuleConditionForm {
  const source = value ?? {};
  return { scenarios: strings(source.scenarios), intents: strings(source.intents), riskLevels: strings(source.riskLevels), industryNodeIds: strings(source.industryNodeIds), industryCodes: strings(source.industryCodes) };
}
function compactConditions(value: CustomerServiceRuleConditionForm) { return Object.fromEntries(Object.entries(value).filter(([, items]) => items.length)); }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function assetTypeLabel(value: string) { return customerServiceAssetTypeOptions.find((item) => item.value === value)?.label ?? value; }
</script>

<style scoped>
.sample-fill-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; border: 1px dashed var(--el-color-primary-light-5); border-radius: 10px; background: var(--el-color-primary-light-9); padding: 12px 14px; }.sample-fill-bar strong, .sample-fill-bar span { display: block; }.sample-fill-bar span { margin-top: 3px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .sample-fill-bar { align-items: flex-start; flex-direction: column; } }
</style>
