<template>
  <el-drawer v-model="visible" :title="asset ? `${asset.name} · 版本` : '资产版本'" size="760px" destroy-on-close>
    <div class="mb-4 flex items-center justify-between">
      <div class="text-sm text-slate-500">资产编码：{{ asset?.key || '-' }}</div>
      <el-button v-if="canCreate" type="primary" @click="versionDialogOpen = true">新增版本</el-button>
    </div>
    <el-table v-loading="loading" :data="versions" row-key="id" stripe>
      <el-table-column prop="versionNo" label="版本" width="90">
        <template #default="{ row }">V{{ row.versionNo }}</template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="180" />
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'PUBLISHED' ? 'success' : row.status === 'ARCHIVED' ? 'info' : 'warning'">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contentHash" label="内容哈希" min-width="150" show-overflow-tooltip />
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'DRAFT' && canPublish" link type="primary" @click="publish(row)">发布</el-button>
          <el-button v-if="row.status !== 'DRAFT' && canCreate" link @click="cloneAsDraft(row)">基于此版本建草稿</el-button>
        </template>
      </el-table-column>
    </el-table>

    <AssetVersionFormDialog v-model="versionDialogOpen" :asset-type="asset?.assetType" :submitting="submitting" @submit="createVersion" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createCustomerServiceAssetVersion,
  listCustomerServiceAssetVersions,
  publishCustomerServiceAssetVersion
} from '@/modules/customer-service/api/assets.api';
import type { CustomerServiceAsset, CustomerServiceAssetVersion } from '@/modules/customer-service/types/assets.types';
import AssetVersionFormDialog from './AssetVersionFormDialog.vue';

const props = defineProps<{
  modelValue: boolean;
  asset: CustomerServiceAsset | null;
  canCreate: boolean;
  canPublish: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const loading = ref(false);
const submitting = ref(false);
const versionDialogOpen = ref(false);
const versions = ref<CustomerServiceAssetVersion[]>([]);

watch(
  () => [props.modelValue, props.asset?.id] as const,
  ([open]) => {
    if (open && props.asset) loadVersions();
  }
);

async function loadVersions() {
  if (!props.asset) return;
  loading.value = true;
  try {
    versions.value = await listCustomerServiceAssetVersions(props.asset.id);
  } finally {
    loading.value = false;
  }
}

async function createVersion(payload: { title: string; summary?: string; content: Record<string, unknown> }) {
  if (!props.asset) return;
  submitting.value = true;
  try {
    await createCustomerServiceAssetVersion(props.asset.id, payload);
    versionDialogOpen.value = false;
    ElMessage.success('草稿版本已创建');
    await loadVersions();
    emit('changed');
  } finally {
    submitting.value = false;
  }
}

async function publish(version: CustomerServiceAssetVersion) {
  if (!props.asset) return;
  await ElMessageBox.confirm(`确认发布 V${version.versionNo}？当前已发布版本会自动归档。`, '发布资产版本', { type: 'warning' });
  await publishCustomerServiceAssetVersion(props.asset.id, version.id, version.revision);
  ElMessage.success('资产版本已发布');
  await loadVersions();
  emit('changed');
}

async function cloneAsDraft(version: CustomerServiceAssetVersion) {
  if (!props.asset) return;
  await ElMessageBox.confirm(`将 V${version.versionNo} 的完整内容复制为一个新草稿。确认测试后再发布，即可实现可审计回滚。`, '基于历史版本创建草稿', { type: 'warning' });
  submitting.value = true;
  try {
    await createCustomerServiceAssetVersion(props.asset.id, {
      title: `回滚候选 · 基于 V${version.versionNo}`,
      summary: `复制历史版本 V${version.versionNo}（${version.contentHash}）形成的新草稿；发布前请先执行回归测试。`,
      content: version.content
    });
    ElMessage.success('历史版本已复制为新草稿');
    await loadVersions();
    emit('changed');
  } finally {
    submitting.value = false;
  }
}

function statusLabel(status: string) {
  return { DRAFT: '草稿', PUBLISHED: '已发布', ARCHIVED: '已归档' }[status] ?? status;
}
</script>
