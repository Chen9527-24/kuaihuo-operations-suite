<template>
  <el-dialog
    v-model="visible"
    :title="undefined"
    width="960px"
    top="8vh"
    destroy-on-close
    class="customer-lead-follow-up-dialog"
  >
    <template #header>
      <div class="dialog-heading">
        <div>
          <div class="dialog-title">{{ isFirstFollowUp ? '登记首次跟进' : '登记跟进' }}</div>
          <div class="dialog-subtitle">每次保存都会新增一条历史记录，并同步更新客户当前状态与下一次计划；已有记录不会被覆盖。</div>
        </div>
        <div v-if="customerName" class="customer-name">{{ customerName }}</div>
      </div>
    </template>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="118px" class="follow-up-form">
      <section class="form-section">
        <div class="section-title">本次实际沟通</div>
        <div class="form-grid">
          <el-form-item label="实际跟进时间" prop="followedUpAt">
            <el-date-picker
              v-model="form.followedUpAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="请选择实际发生时间"
              class="!w-full"
            />
          </el-form-item>
          <el-form-item label="沟通方式">
            <el-select v-model="form.followUpMethod" class="w-full" clearable placeholder="请选择沟通方式">
              <el-option v-for="item in followUpMethodOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="本次跟进人" class="!mb-0">
            <el-input v-model="form.followUpOwner" placeholder="可为空；填写后同步为当前跟进人" maxlength="80" />
          </el-form-item>
        </div>
        <el-form-item label="沟通内容与结论" prop="summary" class="!mb-0">
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="7"
            maxlength="4000"
            show-word-limit
            placeholder="记录本次沟通内容、客户反馈、已确认结论、风险与待确认项。例如：客户认可售后分流方向，需等运营负责人确认试用名单。"
          />
        </el-form-item>
      </section>

      <section class="form-section">
        <div class="section-title">本次沟通后的判断</div>
        <div class="section-hint">该判断会同步到客户主档，历史记录中也会保留本次快照，方便回看推进变化。</div>
        <div class="form-grid top-gap">
          <el-form-item label="跟进状态" prop="followUpStatus" class="!mb-0">
            <el-select v-model="form.followUpStatus" class="w-full" placeholder="请选择当前推进阶段">
              <el-option v-for="item in followUpStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="跟进价值" prop="followUpValue" class="!mb-0">
            <el-select v-model="form.followUpValue" class="w-full" placeholder="请选择继续跟进判断">
              <el-option v-for="item in followUpValueOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
      </section>

      <section class="form-section">
        <div class="section-title">下一次计划</div>
        <div class="section-hint">
          下次计划是当前待办。若选择“已成交 / 已流失 / 暂不建议继续跟进 / 已转正式客户”，系统会自动清空该待办。
        </div>
        <div class="form-grid top-gap">
          <el-form-item label="下次计划跟进">
            <el-date-picker
              v-model="form.nextFollowUpAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="可为空"
              class="!w-full"
              :disabled="isTerminal"
            />
          </el-form-item>
          <el-form-item label="下一步行动" class="!mb-0">
            <el-input
              v-model="form.nextFollowUpPlan"
              :disabled="isTerminal"
              placeholder="例如：发送演示环境，并在下周三收集试用意见"
              maxlength="1000"
            />
          </el-form-item>
        </div>
      </section>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存并登记历史</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { SelectOption } from '@/utils/apiData';
import {
  CUSTOMER_LEAD_FOLLOW_UP_DEFAULT_FORM,
  TERMINAL_FOLLOW_UP_STATUSES,
  TERMINAL_FOLLOW_UP_VALUES
} from '../constants';
import type { CustomerLeadFollowUpFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  customerName?: string;
  isFirstFollowUp?: boolean;
  initialData?: Partial<CustomerLeadFollowUpFormModel>;
  followUpStatusOptions: SelectOption[];
  followUpValueOptions: SelectOption[];
  followUpMethodOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: CustomerLeadFollowUpFormModel];
}>();

const formRef = ref<FormInstance>();
const form = reactive<CustomerLeadFollowUpFormModel>({ ...CUSTOMER_LEAD_FOLLOW_UP_DEFAULT_FORM });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const isTerminal = computed(
  () => TERMINAL_FOLLOW_UP_STATUSES.includes(form.followUpStatus) || TERMINAL_FOLLOW_UP_VALUES.includes(form.followUpValue)
);

const rules: FormRules<CustomerLeadFollowUpFormModel> = {
  followedUpAt: [{ required: true, message: '请选择本次实际跟进时间', trigger: 'change' }],
  summary: [{ required: true, message: '请填写本次沟通内容与结论', trigger: 'blur' }],
  followUpStatus: [{ required: true, message: '请选择跟进状态', trigger: 'change' }],
  followUpValue: [{ required: true, message: '请选择跟进价值', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, CUSTOMER_LEAD_FOLLOW_UP_DEFAULT_FORM, props.initialData ?? {});
  }
);

watch(isTerminal, (terminal) => {
  if (!terminal) return;
  form.nextFollowUpAt = '';
  form.nextFollowUpPlan = '';
});

async function handleSubmit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>

<style scoped>
.dialog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-right: 32px;
}

.dialog-title {
  color: #182230;
  font-size: 20px;
  font-weight: 650;
}

.dialog-subtitle,
.section-hint {
  margin-top: 6px;
  color: #7a8699;
  font-size: 13px;
  line-height: 1.6;
}

.customer-name {
  flex: 0 0 auto;
  max-width: 280px;
  overflow: hidden;
  color: #3a6fc4;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.follow-up-form {
  display: grid;
  gap: 18px;
}

.form-section {
  border: 1px solid #e8edf4;
  border-radius: 10px;
  padding: 18px 20px 20px;
  background: #fff;
}

.section-title {
  color: #26364a;
  font-size: 15px;
  font-weight: 650;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
}

.top-gap {
  margin-top: 16px;
}

:deep(.customer-lead-follow-up-dialog) {
  width: min(960px, calc(100vw - 48px)) !important;
}

:deep(.customer-lead-follow-up-dialog .el-dialog__body) {
  max-height: calc(84vh - 150px);
  overflow-y: auto;
  padding: 8px 24px 8px;
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
