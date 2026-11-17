<template>
  <el-dialog
    v-model="visible"
    :title="undefined"
    width="1280px"
    top="4vh"
    destroy-on-close
    class="customer-lead-form-dialog"
  >
    <template #header>
      <div class="dialog-heading">
        <div>
          <div class="dialog-title">{{ mode === 'create' ? '新增商机客户' : '编辑商机客户' }}</div>
          <div class="dialog-subtitle">
            {{
              mode === 'create'
                ? '按“客户识别 → 当前推进 → 实际沟通 → 后续行动”录入。首次实际沟通填写后会自动生成第一条不可覆盖的历史记录。'
                : '维护客户主档、当前推进与后续待办；历史沟通请使用“登记跟进”追加，避免改写已发生记录。'
            }}
          </div>
        </div>
      </div>
    </template>

    <el-alert
      v-if="mode === 'create' && demoMode"
      class="demo-form-alert"
      title="已回填一套演示数据"
      description="这些内容仅用于查看字段、历史跟进与当前待办的完整流程；不会自动创建记录，保存前请替换为真实客户信息。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-form ref="formRef" :model="form" :rules="rules" label-width="118px" class="customer-lead-form">
      <section class="form-section">
        <div class="section-heading">
          <span class="section-index">01</span>
          <div>
            <div class="section-title">客户识别与关键联系人</div>
            <div class="section-hint">先确保客户可识别、可触达，并记录线索从何而来。</div>
          </div>
        </div>
        <div class="form-grid">
          <el-form-item label="公司名称" prop="companyName">
            <el-input v-model="form.companyName" placeholder="请输入公司全称或常用名称" maxlength="150" show-word-limit />
          </el-form-item>
          <el-form-item label="关键联系人">
            <el-input v-model="form.contactName" placeholder="例如：张女士" maxlength="80" />
          </el-form-item>
          <el-form-item label="职位 / 角色">
            <el-input v-model="form.contactPosition" placeholder="例如：运营负责人 / 决策人" maxlength="80" />
          </el-form-item>
          <el-form-item label="联系方式">
            <el-input v-model="form.contactInfo" placeholder="手机号、微信、邮箱等" maxlength="200" />
          </el-form-item>
          <el-form-item label="线索来源" prop="leadSource">
            <el-select v-model="form.leadSource" class="w-full" placeholder="请选择来源">
              <el-option v-for="item in leadSourceOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="来源说明">
            <el-input v-model="form.leadSourceDetail" placeholder="例如：官网表单 / 某场直播 / 转介绍人" maxlength="300" />
          </el-form-item>
          <el-form-item label="主营类目">
            <el-input v-model="form.primaryCategoriesInput" placeholder="例如：美妆护肤, 私域运营（逗号分隔）" maxlength="1000" />
          </el-form-item>
          <el-form-item label="公司地址">
            <el-input v-model="form.companyAddress" placeholder="可选，记录公司或办公地址" maxlength="500" />
          </el-form-item>
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading">
          <span class="section-index">02</span>
          <div>
            <div class="section-title">当前推进判断</div>
            <div class="section-hint">状态表达所处阶段；价值表达是否值得继续投入销售或产品资源。两者必须分开判断。</div>
          </div>
        </div>
        <div class="form-grid">
          <el-form-item label="当前跟进状态" prop="followUpStatus">
            <el-select v-model="form.followUpStatus" class="w-full" placeholder="请选择当前推进阶段">
              <el-option v-for="item in followUpStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="继续跟进价值" prop="followUpValue">
            <el-select v-model="form.followUpValue" class="w-full" placeholder="请选择资源投入判断">
              <el-option v-for="item in followUpValueOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="当前跟进人">
            <el-input v-model="form.followUpOwner" placeholder="当前可为空，后续可关联系统账号" maxlength="80" />
          </el-form-item>
        </div>
      </section>

      <section v-if="mode === 'create'" class="form-section emphasis-section">
        <div class="section-heading">
          <span class="section-index">03</span>
          <div>
            <div class="section-title">首次实际跟进 <span class="optional-mark">（可选）</span></div>
            <div class="section-hint">仅当已发生真实沟通时填写。保存后会直接创建第一条跟进历史，不会因为后续跟进而被覆盖。</div>
          </div>
        </div>
        <div class="form-grid">
          <el-form-item label="首次跟进时间" prop="firstFollowUpAt">
            <el-date-picker
              v-model="form.firstFollowUpAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              placeholder="未实际沟通可留空"
              class="!w-full"
            />
          </el-form-item>
          <el-form-item label="首次沟通方式">
            <el-select v-model="form.firstFollowUpMethod" class="w-full" clearable placeholder="可选">
              <el-option v-for="item in followUpMethodOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="首次沟通结论" prop="firstFollowUpSummary" class="!mb-0">
          <el-input
            v-model="form.firstFollowUpSummary"
            type="textarea"
            :rows="3"
            maxlength="4000"
            show-word-limit
            placeholder="填写首次真实沟通中的客户反馈、已确认结论与待推进事项；若填写首次跟进时间，此项必填。"
          />
        </el-form-item>
      </section>

      <section class="form-section">
        <div class="section-heading">
          <span class="section-index">{{ mode === 'create' ? '04' : '03' }}</span>
          <div>
            <div class="section-title">下一步行动安排</div>
            <div class="section-hint">这是当前待办，不属于历史；终态客户会自动清空该计划。每次后续真实沟通请使用“登记跟进”。</div>
          </div>
        </div>
        <div class="form-grid">
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
          <el-form-item label="下一步行动">
            <el-input
              v-model="form.nextFollowUpPlan"
              :disabled="isTerminal"
              placeholder="例如：发送演示环境，并在下周三收集试用意见"
              maxlength="1000"
            />
          </el-form-item>
        </div>
      </section>

      <section class="form-section secondary-section">
        <div class="section-heading">
          <span class="section-index">{{ mode === 'create' ? '05' : '04' }}</span>
          <div>
            <div class="section-title">客户诉求与关键阻碍</div>
            <div class="section-hint">用于后续复盘方案匹配、竞品情况和未成交/未被打动的真实原因。</div>
          </div>
        </div>
        <el-form-item label="客户所需功能">
          <el-input
            v-model="form.requestedFeatures"
            type="textarea"
            :rows="4"
            maxlength="4000"
            show-word-limit
            placeholder="例如：自动客服需要更拟人化，能区分售前、售后、投诉并支持人工无缝接管"
          />
        </el-form-item>
        <el-form-item label="现有方案 / 竞品">
          <el-input
            v-model="form.currentSolution"
            type="textarea"
            :rows="2"
            maxlength="2000"
            show-word-limit
            placeholder="例如：目前使用人工客服 + 某 SaaS；客户正在比较的竞品或内部自建方案"
          />
        </el-form-item>
        <el-form-item label="未打动 / 阻碍原因">
          <el-input
            v-model="form.notWonReason"
            type="textarea"
            :rows="3"
            maxlength="4000"
            show-word-limit
            placeholder="记录产品能力、价格、采购时机、内部决策、竞品等阻碍合作的真实原因"
          />
        </el-form-item>
        <el-form-item label="备注" class="!mb-0">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="4000" show-word-limit placeholder="其他补充信息（可选）" />
        </el-form-item>
      </section>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ mode === 'create' ? '保存商机客户' : '保存客户信息' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { SelectOption } from '@/utils/apiData';
import { CUSTOMER_LEAD_DEFAULT_FORM, TERMINAL_FOLLOW_UP_STATUSES, TERMINAL_FOLLOW_UP_VALUES } from '../constants';
import type { CustomerLeadFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<CustomerLeadFormModel>;
  /** 仅用于提示当前表单已由“回填默认示例”打开，不会影响提交逻辑。 */
  demoMode?: boolean;
  followUpStatusOptions: SelectOption[];
  followUpValueOptions: SelectOption[];
  leadSourceOptions: SelectOption[];
  followUpMethodOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: CustomerLeadFormModel];
}>();

const formRef = ref<FormInstance>();
const form = reactive<CustomerLeadFormModel>({ ...CUSTOMER_LEAD_DEFAULT_FORM });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const isTerminal = computed(
  () => TERMINAL_FOLLOW_UP_STATUSES.includes(form.followUpStatus) || TERMINAL_FOLLOW_UP_VALUES.includes(form.followUpValue)
);

const validateInitialFollowUp = (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
  if (props.mode !== 'create') {
    callback();
    return;
  }
  const hasDate = Boolean(form.firstFollowUpAt);
  const hasMethod = Boolean(form.firstFollowUpMethod);
  const hasSummary = Boolean(form.firstFollowUpSummary.trim());
  if ((hasMethod || hasSummary) && !hasDate) {
    callback(new Error('填写首次沟通方式或结论时，请同时填写首次跟进时间'));
    return;
  }
  if (hasDate && !hasSummary) {
    callback(new Error('填写首次跟进时间时，请填写首次沟通结论'));
    return;
  }
  callback();
};

const rules: FormRules<CustomerLeadFormModel> = {
  companyName: [{ required: true, message: '请输入公司名称', trigger: 'blur' }],
  followUpValue: [{ required: true, message: '请选择继续跟进价值', trigger: 'change' }],
  followUpStatus: [{ required: true, message: '请选择当前跟进状态', trigger: 'change' }],
  leadSource: [{ required: true, message: '请选择线索来源', trigger: 'change' }],
  firstFollowUpAt: [{ validator: validateInitialFollowUp, trigger: ['change', 'blur'] }],
  firstFollowUpSummary: [{ validator: validateInitialFollowUp, trigger: ['change', 'blur'] }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, CUSTOMER_LEAD_DEFAULT_FORM, props.initialData ?? {});
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
  padding-right: 32px;
}

.dialog-title {
  color: #182230;
  font-size: 21px;
  font-weight: 680;
  letter-spacing: 0.01em;
}

.dialog-subtitle,
.section-hint {
  margin-top: 6px;
  color: #7a8699;
  font-size: 13px;
  line-height: 1.65;
}

.demo-form-alert {
  margin: 0 0 16px;
}

.customer-lead-form {
  display: grid;
  gap: 18px;
}

.form-section {
  border: 1px solid #e8edf4;
  border-radius: 12px;
  padding: 19px 22px 22px;
  background: #fff;
}

.emphasis-section {
  border-color: #dbeafe;
  background: #fbfdff;
}

.secondary-section {
  background: #fcfdff;
}

.section-heading {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.section-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 24px;
  border-radius: 6px;
  background: #eff6ff;
  color: #3270d9;
  font-size: 12px;
  font-weight: 700;
}

.section-title {
  color: #26364a;
  font-size: 15px;
  font-weight: 680;
}

.optional-mark {
  color: #7a8699;
  font-size: 13px;
  font-weight: 500;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 34px;
}

:deep(.customer-lead-form-dialog) {
  width: min(1280px, calc(100vw - 48px)) !important;
}

:deep(.customer-lead-form-dialog .el-dialog__body) {
  max-height: calc(92vh - 152px);
  overflow-y: auto;
  padding: 8px 28px 10px;
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-section {
    padding: 16px;
  }
}
</style>
