<template>
  <el-dialog v-model="visible" title="新增资产版本" width="760px" destroy-on-close>
    <el-alert title="版本内容必须是 JSON 对象；发布后同一资产的旧发布版本会自动归档。" type="info" :closable="false" show-icon class="mb-4" />
    <div class="sample-fill-bar">
      <div><strong>按当前资产类型生成参考结构</strong><span>样例只回填草稿表单，不会创建或发布版本。</span></div>
      <SampleFillButton label="填入当前类型样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="版本标题" prop="title">
        <el-input v-model="form.title" maxlength="160" show-word-limit />
      </el-form-item>
      <el-form-item label="版本摘要">
        <el-input v-model="form.summary" type="textarea" :rows="2" maxlength="1000" show-word-limit />
      </el-form-item>
      <el-form-item label="配置内容" prop="contentText">
        <el-input v-model="form.contentText" type="textarea" :rows="14" class="font-mono" placeholder='{"requiredPoints": []}' />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">创建草稿版本</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type { CustomerServiceAssetType } from '@/modules/customer-service/types/assets.types';

const props = defineProps<{ modelValue: boolean; assetType?: CustomerServiceAssetType; submitting?: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [value: { title: string; summary?: string; content: Record<string, unknown> }];
}>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const form = reactive({ title: '', summary: '', contentText: '{}' });
const hasUserContent = computed(() => Boolean(form.title.trim() || form.summary.trim() || form.contentText.trim() !== '{}'));
const rules: FormRules = {
  title: [{ required: true, message: '请输入版本标题', trigger: 'blur' }],
  contentText: [{ validator: validateJson, trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) Object.assign(form, { title: '', summary: '', contentText: '{}' });
  }
);

function fillSample() {
  const type = props.assetType || 'RESPONSE_POLICY';
  const samples: Record<CustomerServiceAssetType, Record<string, unknown>> = {
    ROLE_MODULE: { goals: ['先回应客户当前诉求'], behaviorRules: ['不重复客户已经说过的内容'], avoidExpressions: ['亲亲', '这边呢'] },
    STRATEGY_GROUP: { schemaVersion: 1, scopeType: 'ROLE_GLOBAL', enabledByDefault: true, priority: 100, appliesTo: { roleCodes: ['ali'] }, policy: { wording: { forbiddenExpressions: ['亲亲'], semanticChecks: ['NO_RECEPTION_CLICHE'] }, structure: { maxQuestions: 1, maxSentences: 4 } } },
    RESPONSE_POLICY: { requiredPoints: ['直接回应当前问题'], forbiddenExpressions: ['客服接待套话'], styleGuidance: ['自然简短，不固定开场'] },
    QUALITY_RULE: { checks: [{ code: 'NO_FACT_INVENTION', name: '不得编造事实', severity: 'HARD' }], retryOnFailure: true },
    WORKFLOW: { steps: [{ code: 'READ_CONTEXT', name: '读取上下文' }, { code: 'RESPOND', name: '回应当前诉求' }], stopConditions: [] },
    CASE_REFERENCE: { cases: [{ user: '这件适合上班穿吗', preferredReply: '版型比较简洁，通勤穿没问题。你平时更喜欢合身还是宽松一点？', notes: '先回答，再只问一个必要问题' }] },
    EXACT_REPLY: { text: '为保护您的账户安全，请不要在聊天中发送验证码、密码或登录令牌。' },
    TEMPLATE_REPLY: { template: '订单 {{orderNo}} 当前状态为：{{orderStatus}}。', variables: [{ key: 'orderNo', required: true, source: 'VERIFIED_ORDER' }, { key: 'orderStatus', required: true, source: 'VERIFIED_ORDER' }] },
    REQUIRED_POINTS: { points: ['直接回答客户当前问题', '只使用已验证的业务事实', '必要时说明一个明确的下一步'] },
    REQUIRED_WORKFLOW: { steps: [{ code: 'CONFIRM_TARGET', name: '确认处理对象' }, { code: 'CHECK_FACTS', name: '查询真实状态' }, { code: 'REPORT_RESULT', name: '报告结果与下一步' }] },
  };
  form.title = `${assetTypeLabel(type)}参考样例`;
  form.summary = '由样例回填生成的草稿，请按真实业务和接口字段修改后再发布。';
  form.contentText = JSON.stringify(samples[type], null, 2);
}

function assetTypeLabel(type: CustomerServiceAssetType) {
  return ({ ROLE_MODULE: '角色模块', STRATEGY_GROUP: '策略配置组', RESPONSE_POLICY: '回复策略', QUALITY_RULE: '质量规则', WORKFLOW: '业务流程', CASE_REFERENCE: '案例参考', EXACT_REPLY: '固定全文', TEMPLATE_REPLY: '固定模板', REQUIRED_POINTS: '必含要点', REQUIRED_WORKFLOW: '必走流程' } as const)[type];
}

function validateJson(_rule: unknown, value: string, callback: (error?: Error) => void) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    callback();
  } catch {
    callback(new Error('请输入有效的 JSON 对象'));
  }
}

async function submit() {
  await formRef.value?.validate();
  emit('submit', { title: form.title.trim(), summary: form.summary.trim() || undefined, content: JSON.parse(form.contentText) });
}
</script>

<style scoped>
.sample-fill-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; border: 1px dashed var(--el-color-primary-light-5); border-radius: 10px; background: var(--el-color-primary-light-9); padding: 12px 14px; }.sample-fill-bar strong, .sample-fill-bar span { display: block; }.sample-fill-bar span { margin-top: 3px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .sample-fill-bar { align-items: flex-start; flex-direction: column; } }
</style>
