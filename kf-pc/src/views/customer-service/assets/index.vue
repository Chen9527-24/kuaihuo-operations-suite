<template>
  <div class="space-y-4">
    <PageToolbar :title="props.mode === 'deterministic' ? '响应内容' : '配置资产'" :description="props.mode === 'deterministic' ? '维护固定全文、固定模板、必含要点和必走流程；发布后才能被触发规则引用。' : '按资源管理确定性回复、角色模块、质量规则和业务流程；每次变更通过独立版本发布。'">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" clearable placeholder="编码 / 名称" @keyup.enter="fetchItems(true)" />
        </el-form-item>
        <el-form-item label="资产类型" class="!mb-0">
          <el-select v-model="filters.assetType" clearable placeholder="全部类型">
            <el-option v-for="item in visibleAssetTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" clearable placeholder="全部状态">
            <el-option v-for="item in customerServiceAssetStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="fetchItems(true)">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增资产</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="配置资产列表">
      <el-table v-loading="loading" :data="displayItems" row-key="id" stripe>
        <el-table-column prop="key" label="资产编码" min-width="190" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="assetType" label="类型" width="130">
          <template #default="{ row }">{{ optionLabel(customerServiceAssetTypeOptions, row.assetType) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ optionLabel(customerServiceAssetStatusOptions, row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="版本数" width="90"><template #default="{ row }">{{ row._count?.versions ?? 0 }}</template></el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openVersions(row)">版本</el-button>
            <el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="filters.page"
          :page-size="filters.pageSize"
          :total="total"
          @update:current-page="filters.page = $event; fetchItems()"
          @update:page-size="filters.pageSize = $event; fetchItems(true)"
        />
      </template>
    </CrudTablePanel>

    <AssetFormDialog v-model="formOpen" :mode="formMode" :initial-data="editing" :submitting="submitting" :allowed-types="allowedAssetTypes" @submit="saveAsset" />
    <AssetVersionsDrawer
      v-model="versionsOpen"
      :asset="versionAsset"
      :can-create="canCreateVersion"
      :can-publish="canPublish"
      @changed="fetchItems()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { createCustomerServiceAsset, updateCustomerServiceAsset } from '@/modules/customer-service/api/assets.api';
import { useCustomerServiceAssets } from '@/modules/customer-service/composables/useCustomerServiceAssets';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import {
  customerServiceAssetStatusOptions,
  customerServiceAssetTypeOptions,
  customerServiceDeterministicAssetTypes,
} from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceAsset, CustomerServiceAssetStatus, CustomerServiceAssetType } from '@/modules/customer-service/types/assets.types';
import AssetFormDialog from './components/AssetFormDialog.vue';
import AssetVersionsDrawer from './components/AssetVersionsDrawer.vue';

const props = withDefaults(defineProps<{ mode?: 'all' | 'deterministic' }>(), { mode: 'all' });

const { loading, items, filters, total, fetchItems, resetFilters } = useCustomerServiceAssets();
const { has } = useCustomerServicePermission();
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceAsset | null>(null);
const submitting = ref(false);
const versionsOpen = ref(false);
const versionAsset = ref<CustomerServiceAsset | null>(null);
const canCreate = computed(() => has('customer-service:asset:create'));
const canUpdate = computed(() => has('customer-service:asset:update'));
const canCreateVersion = computed(() => has('customer-service:asset:version:create'));
const canPublish = computed(() => has('customer-service:asset:publish'));
const allowedAssetTypes = computed<readonly CustomerServiceAssetType[] | undefined>(() => props.mode === 'deterministic' ? customerServiceDeterministicAssetTypes : undefined);
const visibleAssetTypeOptions = computed(() => props.mode === 'deterministic'
  ? customerServiceAssetTypeOptions.filter((item) => customerServiceDeterministicAssetTypes.some((type) => type === item.value))
  : customerServiceAssetTypeOptions);
const displayItems = computed(() => props.mode === 'deterministic'
  ? items.value.filter((item) => customerServiceDeterministicAssetTypes.some((type) => type === item.assetType))
  : items.value);

onMounted(() => fetchItems());

function openCreate() {
  formMode.value = 'create';
  editing.value = null;
  formOpen.value = true;
}
function openEdit(item: CustomerServiceAsset) {
  formMode.value = 'edit';
  editing.value = item;
  formOpen.value = true;
}
function openVersions(item: CustomerServiceAsset) {
  versionAsset.value = item;
  versionsOpen.value = true;
}

async function saveAsset(form: {
  key: string;
  name: string;
  assetType: CustomerServiceAssetType;
  description: string;
  status: CustomerServiceAssetStatus;
  revision: number;
}) {
  submitting.value = true;
  try {
    if (formMode.value === 'create') {
      await createCustomerServiceAsset({ key: form.key, name: form.name, assetType: form.assetType, description: form.description });
    } else if (editing.value) {
      await updateCustomerServiceAsset(editing.value.id, {
        revision: form.revision,
        name: form.name,
        description: form.description,
        status: form.status
      });
    }
    formOpen.value = false;
    ElMessage.success('配置资产已保存');
    await fetchItems();
  } finally {
    submitting.value = false;
  }
}

function optionLabel(options: readonly { label: string; value: string }[], value: string) {
  return options.find((item) => item.value === value)?.label ?? value;
}
function statusType(status: string) {
  return status === 'PUBLISHED' ? 'success' : status === 'ARCHIVED' ? 'info' : 'warning';
}
function formatTime(value: string) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
