<template>
  <div class="space-y-4">
    <PageToolbar title="回复与流程" description="用确定性响应资产和条件规则控制固定全文、模板、必含要点和必走流程。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <el-form-item label="关键词" class="!mb-0"><el-input v-model="filters.keyword" clearable placeholder="编码 / 名称" @keyup.enter="fetchItems(true)" /></el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" clearable placeholder="全部状态">
            <el-option v-for="item in customerServiceResponseRuleStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0"><div class="flex gap-2"><el-button type="primary" @click="fetchItems(true)">查询</el-button><el-button @click="resetFilters">重置</el-button></div></el-form-item>
      </el-form>
      <template #actions><el-button v-if="canCreate" type="primary" @click="openCreate">新增规则</el-button></template>
    </PageToolbar>

    <el-alert title="规则只能绑定已发布的固定全文、固定模板、必含要点或必走流程资产。模板缺少真实变量时不会自动补值。" type="info" :closable="false" show-icon />

    <CrudTablePanel title="回复规则列表">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column prop="key" label="规则编码" min-width="190" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="响应资产" min-width="220">
          <template #default="{ row }"><div>{{ row.responseAsset?.name ?? '-' }}</div><div class="text-xs text-slate-400">{{ typeLabel(row.responseAsset?.assetType) }}</div></template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="90" />
        <el-table-column label="排他" width="80"><template #default="{ row }"><el-tag :type="row.exclusive ? 'warning' : 'info'">{{ row.exclusive ? '是' : '否' }}</el-tag></template></el-table-column>
        <el-table-column prop="status" label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="条件" min-width="260"><template #default="{ row }"><code class="text-xs">{{ compactJson(row.conditions) }}</code></template></el-table-column>
        <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar :current-page="filters.page" :page-size="filters.pageSize" :total="total" @update:current-page="filters.page = $event; fetchItems()" @update:page-size="filters.pageSize = $event; fetchItems(true)" />
      </template>
    </CrudTablePanel>

    <ResponseRuleFormDialog v-model="formOpen" :mode="formMode" :initial-data="editing" :assets="assets" :industries="industries" :submitting="submitting" @submit="saveRule" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { listCustomerServiceAssets } from '@/modules/customer-service/api/assets.api';
import { listCustomerServiceIndustryNodes } from '@/modules/customer-service/api/industries.api';
import { createCustomerServiceResponseRule, updateCustomerServiceResponseRule } from '@/modules/customer-service/api/response-rules.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import { useCustomerServiceResponseRules } from '@/modules/customer-service/composables/useCustomerServiceResponseRules';
import {
  customerServiceAssetTypeOptions,
  customerServiceDeterministicAssetTypes,
  customerServiceResponseRuleStatusOptions
} from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceAsset } from '@/modules/customer-service/types/assets.types';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceResponseRule } from '@/modules/customer-service/types/response-rules.types';
import ResponseRuleFormDialog from './components/ResponseRuleFormDialog.vue';

const { has } = useCustomerServicePermission();
const { loading, items, filters, total, fetchItems, resetFilters } = useCustomerServiceResponseRules();
const assets = ref<CustomerServiceAsset[]>([]);
const industries = ref<CustomerServiceIndustryNode[]>([]);
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceResponseRule | null>(null);
const submitting = ref(false);
const canCreate = computed(() => has('customer-service:response-rule:create'));
const canUpdate = computed(() => has('customer-service:response-rule:update'));

onMounted(async () => {
  await Promise.all([fetchItems(), loadSources()]);
});

async function loadSources() {
  const [assetResult, industryResult] = await Promise.all([
    listCustomerServiceAssets({ keyword: '', assetType: '', status: 'PUBLISHED', page: 1, pageSize: 500 }),
    listCustomerServiceIndustryNodes()
  ]);
  assets.value = assetResult.items.filter((item) => customerServiceDeterministicAssetTypes.some((type) => type === item.assetType));
  industries.value = industryResult.filter((item) => item.status !== 'ARCHIVED');
}
function openCreate() { formMode.value = 'create'; editing.value = null; formOpen.value = true; }
function openEdit(item: CustomerServiceResponseRule) { formMode.value = 'edit'; editing.value = item; formOpen.value = true; }
async function saveRule(form: Parameters<typeof createCustomerServiceResponseRule>[0] & { revision: number }) {
  submitting.value = true;
  try {
    if (formMode.value === 'create') {
      const { revision: _revision, ...payload } = form;
      await createCustomerServiceResponseRule(payload);
    } else if (editing.value) {
      const { key: _key, ...payload } = form;
      await updateCustomerServiceResponseRule(editing.value.id, payload);
    }
    formOpen.value = false;
    ElMessage.success('回复规则已保存');
    await fetchItems();
  } finally { submitting.value = false; }
}
function typeLabel(value?: string) { return customerServiceAssetTypeOptions.find((item) => item.value === value)?.label ?? value ?? '-'; }
function statusLabel(value: string) { return customerServiceResponseRuleStatusOptions.find((item) => item.value === value)?.label ?? value; }
function compactJson(value: unknown) { const text = JSON.stringify(value); return text.length > 100 ? `${text.slice(0, 100)}…` : text; }
</script>
