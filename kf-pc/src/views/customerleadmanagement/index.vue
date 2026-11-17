<template>
  <div class="space-y-4">
    <PageToolbar
      title="商机客户管理"
      description="以当前推进和待办优先管理外部公司客户；首次和每次实际沟通均独立留痕，不与 H5 用户、租户或系统账号混用。"
    >
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="公司 / 联系人 / 联系方式 / 类目" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="当前状态" class="!mb-0">
          <el-select v-model="filters.followUpStatus" placeholder="全部状态" clearable>
            <el-option v-for="item in followUpStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="跟进价值" class="!mb-0">
          <el-select v-model="filters.followUpValue" placeholder="全部价值" clearable>
            <el-option v-for="item in followUpValueOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="线索来源" class="!mb-0">
          <el-select v-model="filters.leadSource" placeholder="全部来源" clearable>
            <el-option v-for="item in leadSourceOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="当前跟进人" class="!mb-0">
          <el-input v-model="filters.followUpOwner" placeholder="按当前跟进人筛选" clearable @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="官网咨询" class="!mb-0">
          <el-select v-model="filters.websiteInquiry" placeholder="全部线索">
            <el-option label="全部线索" value="" />
            <el-option label="全部官网咨询" value="ONLY" />
            <el-option label="仅未读官网咨询" value="UNREAD" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0 xl:col-span-6">
          <div class="flex gap-2">
            <el-button type="primary" @click="fetchList(true)">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button @click="openCreateWithDemoData">回填默认示例</el-button>
        <el-button type="primary" @click="openCreate">新增商机客户</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="商机客户列表" description="列表按“当前推进 → 当前待办 → 实际跟进概览”排列。长文本信息沉入详情，避免主列表被低优先级字段挤占。">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column label="商机客户 / 联系人" min-width="270" fixed="left">
          <template #default="{ row }">
            <button class="company-link" type="button" @click="openDetail(row)">{{ row.companyName }}</button>
            <div v-if="row.websiteSubmission" class="mt-1">
              <el-tag :type="row.websiteSubmission.viewedAt ? 'info' : 'danger'" size="small" effect="light">
                {{ row.websiteSubmission.viewedAt ? '官网咨询' : '官网新咨询' }}
              </el-tag>
            </div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ contactLine(row) }}
            </div>
            <div class="mt-1 text-xs text-slate-400">{{ sourceLabel(row.leadSource) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="当前推进" min-width="196">
          <template #default="{ row }">
            <div class="flex flex-wrap gap-1">
              <DictTag :value="row.followUpStatus" :options="followUpStatusOptions" />
              <DictTag :value="row.followUpValue" :options="followUpValueOptions" />
            </div>
            <div class="mt-2 text-xs text-slate-500 dark:text-slate-400">跟进人：{{ row.followUpOwner || '未指定' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="当前待办" min-width="278">
          <template #default="{ row }">
            <div class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ row.nextFollowUpAt ? formatDateTime(row.nextFollowUpAt) : '暂未安排' }}</div>
            <div class="mt-1 max-w-[250px] truncate text-xs text-slate-500 dark:text-slate-400" :title="row.nextFollowUpPlan || ''">
              {{ row.nextFollowUpPlan || '未填写下一步行动' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="实际跟进概览" min-width="216">
          <template #default="{ row }">
            <div class="text-sm text-slate-700 dark:text-slate-200">首次：{{ row.firstFollowUpAt ? formatDateTime(row.firstFollowUpAt) : '未登记' }}</div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">最近：{{ row.lastFollowUpAt ? formatDateTime(row.lastFollowUpAt) : '暂无记录' }}</div>
            <div class="mt-1 text-xs text-slate-400">历史 {{ row.followUpCount ?? 0 }} 条</div>
          </template>
        </el-table-column>
        <el-table-column label="客户画像" min-width="220">
          <template #default="{ row }">
            <div v-if="row.primaryCategories?.length" class="flex flex-wrap gap-1">
              <el-tag v-for="category in row.primaryCategories" :key="category" size="small" effect="plain">{{ category }}</el-tag>
            </div>
            <span v-else class="text-slate-400">未填写主营类目</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="176">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="openFollowUp(row)">{{ row.firstFollowUpAt ? '登记跟进' : '首次跟进' }}</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <CrudPaginationBar
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          @update:current-page="pagination.page = $event; fetchList()"
          @update:page-size="pagination.pageSize = $event; fetchList(true)"
        />
      </template>
    </CrudTablePanel>

    <CustomerLeadFormDialog
      v-model="formDialogVisible"
      :mode="formDialogMode"
      :initial-data="formInitialData"
      :demo-mode="formDialogUsesDemoData"
      :follow-up-status-options="followUpStatusOptions"
      :follow-up-value-options="followUpValueOptions"
      :lead-source-options="leadSourceOptions"
      :follow-up-method-options="followUpMethodOptions"
      :submitting="formSubmitting"
      @submit="handleCustomerFormSubmit"
    />

    <CustomerLeadFollowUpDialog
      v-model="followUpDialogVisible"
      :customer-name="selectedLead?.companyName"
      :is-first-follow-up="!selectedLead?.firstFollowUpAt"
      :initial-data="followUpInitialData"
      :follow-up-status-options="followUpStatusOptions"
      :follow-up-value-options="followUpValueOptions"
      :follow-up-method-options="followUpMethodOptions"
      :submitting="followUpSubmitting"
      @submit="handleFollowUpSubmit"
    />

    <CustomerLeadDetailDrawer
      v-model="detailVisible"
      :lead="selectedLead"
      :follow-up-status-options="followUpStatusOptions"
      :follow-up-value-options="followUpValueOptions"
      :follow-up-method-options="followUpMethodOptions"
      :refresh-key="detailRefreshKey"
      @register-follow-up="openFollowUp(selectedLead)"
      @edit="openEdit(selectedLead)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as customerLeadsApi from '@/api/modules/customerLeads';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { useAuthStore } from '@/stores/auth';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime, toIsoDateTime } from '@/utils/format';
import CustomerLeadDetailDrawer from './components/CustomerLeadDetailDrawer.vue';
import CustomerLeadFollowUpDialog from './components/CustomerLeadFollowUpDialog.vue';
import CustomerLeadFormDialog from './components/CustomerLeadFormDialog.vue';
import {
  FOLLOW_UP_METHOD_OPTIONS,
  FOLLOW_UP_STATUS_OPTIONS,
  FOLLOW_UP_VALUE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  createCustomerLeadDemoForm
} from './constants';
import type { CustomerLeadFilters, CustomerLeadFollowUpFormModel, CustomerLeadFormModel } from './types';

const followUpStatusOptions = ref<SelectOption[]>(FOLLOW_UP_STATUS_OPTIONS);
const followUpValueOptions = ref<SelectOption[]>(FOLLOW_UP_VALUE_OPTIONS);
const followUpMethodOptions = ref<SelectOption[]>(FOLLOW_UP_METHOD_OPTIONS);
const leadSourceOptions = ref<SelectOption[]>(LEAD_SOURCE_OPTIONS);
const authStore = useAuthStore();
const canMarkWebsiteInquiry = computed(
  () => authStore.isPlatformAdmin || authStore.user.permissions.includes('customer-lead:website-submission:update')
);

const formDialogVisible = ref(false);
const formDialogMode = ref<'create' | 'edit'>('create');
const formDialogUsesDemoData = ref(false);
const createFormInitialData = ref<Partial<CustomerLeadFormModel> | undefined>();
const formSubmitting = ref(false);
const followUpDialogVisible = ref(false);
const followUpSubmitting = ref(false);
const detailVisible = ref(false);
const detailRefreshKey = ref(0);
const selectedLead = ref<customerLeadsApi.CustomerLeadItem | null>(null);

const { items, filters, pagination, loading, fetchList, resetFilters } = useRemoteTable<
  customerLeadsApi.CustomerLeadItem,
  CustomerLeadFilters
>(
  { keyword: '', followUpStatus: '', followUpValue: '', leadSource: '', followUpOwner: '', websiteInquiry: '' },
  customerLeadsApi.listCustomerLeads,
  10
);

const formInitialData = computed<Partial<CustomerLeadFormModel> | undefined>(() => {
  if (formDialogMode.value === 'create') {
    return createFormInitialData.value;
  }

  const record = selectedLead.value;
  if (!record) return undefined;
  return {
    companyName: record.companyName,
    contactName: record.contactName || '',
    contactPosition: record.contactPosition || '',
    contactInfo: record.contactInfo || '',
    leadSource: record.leadSource || 'UNKNOWN',
    leadSourceDetail: record.leadSourceDetail || '',
    companyAddress: record.companyAddress || '',
    primaryCategoriesInput: record.primaryCategories?.join(', ') || '',
    followUpStatus: record.followUpStatus,
    followUpValue: record.followUpValue,
    followUpOwner: record.followUpOwner || '',
    nextFollowUpAt: toDateTimeInput(record.nextFollowUpAt),
    nextFollowUpPlan: record.nextFollowUpPlan || '',
    requestedFeatures: record.requestedFeatures || '',
    currentSolution: record.currentSolution || '',
    notWonReason: record.notWonReason || '',
    remark: record.remark || ''
  };
});

const followUpInitialData = computed<Partial<CustomerLeadFollowUpFormModel> | undefined>(() => {
  const record = selectedLead.value;
  if (!record) return undefined;
  return {
    followedUpAt: nowDateTimeInput(),
    followUpMethod: 'WECHAT',
    followUpOwner: record.followUpOwner || '',
    summary: '',
    followUpStatus: record.followUpStatus,
    followUpValue: record.followUpValue,
    nextFollowUpAt: toDateTimeInput(record.nextFollowUpAt),
    nextFollowUpPlan: record.nextFollowUpPlan || ''
  };
});

onMounted(fetchList);

function openCreate() {
  formDialogMode.value = 'create';
  formDialogUsesDemoData.value = false;
  createFormInitialData.value = undefined;
  detailVisible.value = false;
  selectedLead.value = null;
  formDialogVisible.value = true;
}

function openCreateWithDemoData() {
  formDialogMode.value = 'create';
  formDialogUsesDemoData.value = true;
  createFormInitialData.value = createCustomerLeadDemoForm();
  detailVisible.value = false;
  selectedLead.value = null;
  formDialogVisible.value = true;
  ElMessage.success('已回填一套演示数据；仅用于查看和修改，不会自动创建记录');
}

async function openDetail(row: customerLeadsApi.CustomerLeadItem) {
  selectedLead.value = await customerLeadsApi.getCustomerLeadDetail(row.id);
  detailVisible.value = true;
  if (selectedLead.value.websiteSubmission && !selectedLead.value.websiteSubmission.viewedAt && canMarkWebsiteInquiry.value) {
    await customerLeadsApi.markWebsiteSubmissionViewed(row.id);
    selectedLead.value = await customerLeadsApi.getCustomerLeadDetail(row.id);
    await fetchList();
  }
}

function openEdit(record?: customerLeadsApi.CustomerLeadItem | null) {
  if (!record) return;
  formDialogUsesDemoData.value = false;
  createFormInitialData.value = undefined;
  selectedLead.value = record;
  formDialogMode.value = 'edit';
  formDialogVisible.value = true;
}

function openFollowUp(record?: customerLeadsApi.CustomerLeadItem | null) {
  if (!record) return;
  selectedLead.value = record;
  followUpDialogVisible.value = true;
}

async function handleCustomerFormSubmit(payload: CustomerLeadFormModel) {
  formSubmitting.value = true;
  try {
    const data = toCustomerRequestPayload(payload, formDialogMode.value === 'create');
    if (formDialogMode.value === 'create') {
      await customerLeadsApi.createCustomerLead(data);
      ElMessage.success(payload.firstFollowUpAt ? '商机客户及首次跟进历史已新增' : '商机客户已新增');
    } else if (selectedLead.value) {
      await customerLeadsApi.updateCustomerLead(selectedLead.value.id, data);
      ElMessage.success('客户主档已更新；历史跟进记录未受影响');
    }
    formDialogVisible.value = false;
    formDialogUsesDemoData.value = false;
    createFormInitialData.value = undefined;
    await refreshListAndSelectedLead();
  } finally {
    formSubmitting.value = false;
  }
}

async function handleFollowUpSubmit(payload: CustomerLeadFollowUpFormModel) {
  const record = selectedLead.value;
  if (!record) return;

  followUpSubmitting.value = true;
  try {
    await customerLeadsApi.recordCustomerLeadFollowUp(record.id, toFollowUpRequestPayload(payload));
    ElMessage.success('已登记一条跟进历史，并同步更新当前推进信息');
    followUpDialogVisible.value = false;
    await refreshListAndSelectedLead();
    detailRefreshKey.value += 1;
  } finally {
    followUpSubmitting.value = false;
  }
}

async function handleRemove(row: customerLeadsApi.CustomerLeadItem) {
  await ElMessageBox.confirm(`确认删除商机客户「${row.companyName}」？删除后将不再出现在列表中。`, '删除确认', {
    type: 'warning'
  });
  await customerLeadsApi.removeCustomerLead(row.id);
  if (selectedLead.value?.id === row.id) {
    detailVisible.value = false;
    selectedLead.value = null;
  }
  ElMessage.success('商机客户已删除');
  await fetchList();
}

async function refreshListAndSelectedLead() {
  await fetchList();
  if (!selectedLead.value) return;
  selectedLead.value = await customerLeadsApi.getCustomerLeadDetail(selectedLead.value.id);
  detailRefreshKey.value += 1;
}

function toCustomerRequestPayload(form: CustomerLeadFormModel, includeInitialFollowUp: boolean): customerLeadsApi.CustomerLeadPayload {
  const payload: customerLeadsApi.CustomerLeadPayload = {
    companyName: form.companyName.trim(),
    contactName: toNullable(form.contactName),
    contactPosition: toNullable(form.contactPosition),
    contactInfo: toNullable(form.contactInfo),
    leadSource: form.leadSource,
    leadSourceDetail: toNullable(form.leadSourceDetail),
    companyAddress: toNullable(form.companyAddress),
    primaryCategories: splitCategories(form.primaryCategoriesInput),
    followUpStatus: form.followUpStatus,
    followUpValue: form.followUpValue,
    followUpOwner: toNullable(form.followUpOwner),
    nextFollowUpAt: toIsoDateTime(form.nextFollowUpAt) ?? null,
    nextFollowUpPlan: toNullable(form.nextFollowUpPlan),
    requestedFeatures: toNullable(form.requestedFeatures),
    currentSolution: toNullable(form.currentSolution),
    notWonReason: toNullable(form.notWonReason),
    remark: toNullable(form.remark)
  };

  if (includeInitialFollowUp) {
    payload.firstFollowUpAt = toIsoDateTime(form.firstFollowUpAt) ?? null;
    payload.firstFollowUpMethod = toNullable(form.firstFollowUpMethod);
    payload.firstFollowUpSummary = toNullable(form.firstFollowUpSummary);
  }

  return payload;
}

function toFollowUpRequestPayload(form: CustomerLeadFollowUpFormModel): customerLeadsApi.CustomerLeadFollowUpPayload {
  const followedUpAt = toIsoDateTime(form.followedUpAt);
  if (!followedUpAt) {
    throw new Error('本次实际跟进时间不正确');
  }

  return {
    followedUpAt,
    followUpMethod: toNullable(form.followUpMethod),
    followUpOwner: toNullable(form.followUpOwner),
    summary: form.summary.trim(),
    followUpStatus: form.followUpStatus,
    followUpValue: form.followUpValue,
    nextFollowUpAt: toIsoDateTime(form.nextFollowUpAt) ?? null,
    nextFollowUpPlan: toNullable(form.nextFollowUpPlan)
  };
}

function contactLine(row: customerLeadsApi.CustomerLeadItem) {
  const contact = [row.contactName, row.contactPosition].filter(Boolean).join(' · ');
  return [contact, row.contactInfo].filter(Boolean).join(' · ') || '--';
}

function sourceLabel(value?: string | null) {
  if (!value) return '来源待补充';
  return leadSourceOptions.value.find((item) => item.value === value)?.label || value;
}

function splitCategories(value: string) {
  return [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function toNullable(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function toDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatLocalDateTime(date);
}

function nowDateTimeInput() {
  return formatLocalDateTime(new Date());
}

function formatLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
</script>

<style scoped>
.company-link {
  display: block;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  padding: 0;
  background: transparent;
  color: #2668c9;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.company-link:hover {
  color: #174f9c;
  text-decoration: underline;
}
</style>
