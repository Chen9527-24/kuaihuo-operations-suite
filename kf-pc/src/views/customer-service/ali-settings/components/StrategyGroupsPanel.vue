<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 font-semibold">
            {{ title }}
            <HelpTip title="回复规则如何生效" content="系统不会把所有规则全部塞给阿梨。只会加载已经发布、适用于阿梨，并且符合当前对话范围的规则；意图专属规则必须在“客户意图与流程”中选择后才使用。" />
          </div>
          <div class="mt-1 text-xs text-slate-500">每一组规则负责一种明确用途。修改后建议先保存草稿并测试，通过后再发布。</div>
        </div>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新增回复规则</el-button>
      </div>
    </template>
    <el-table v-loading="loading" :data="filteredItems" row-key="id" stripe>
      <el-table-column prop="name" label="规则名称" min-width="190">
        <template #default="{ row }"><div class="font-medium">{{ row.name }}</div><div class="text-xs text-slate-400">{{ row.key }}</div></template>
      </el-table-column>
      <el-table-column label="什么时候使用" min-width="210"><template #default="{ row }"><div class="text-sm font-medium">{{ scopeLabel(contentOf(row)?.scopeType) }}</div><div class="mt-1 text-xs text-slate-400">{{ loadDescription(contentOf(row)) }}</div></template></el-table-column>
      <el-table-column label="当前状态" width="120"><template #default="{ row }"><el-tag :type="contentOf(row) ? 'success' : 'warning'">{{ contentOf(row) ? '已发布' : '仅有草稿' }}</el-tag></template></el-table-column>
      <el-table-column label="主要内容" min-width="300"><template #default="{ row }"><span class="text-sm text-slate-600">{{ summary(contentOf(row)) }}</span></template></el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
      <el-table-column label="操作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canEdit" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link @click="openVersions(row)">版本</el-button>
        </template>
      </el-table-column>
    </el-table>
    <StrategyGroupEditorDialog v-model="dialogOpen" :mode="mode" :asset="editing" :content="editingContent" :submitting="submitting" :can-publish="canPublish" @submit="save" />
    <AssetVersionsDrawer v-model="versionsOpen" :asset="versionAsset" :can-create="canCreateVersion" :can-publish="canPublish" @changed="load" />
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import HelpTip from '@/components/common/HelpTip.vue';
import { createCustomerServiceAsset, createCustomerServiceAssetVersion, listCustomerServiceAssets, listCustomerServiceAssetVersions, publishCustomerServiceAssetVersion, updateCustomerServiceAsset } from '@/modules/customer-service/api/assets.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import type { CustomerServiceAsset } from '@/modules/customer-service/types/assets.types';
import type { CustomerServiceStrategyGroupContent, CustomerServiceStrategyScopeType } from '@/modules/customer-service/types/strategy-policy.types';
import StrategyGroupEditorDialog from './StrategyGroupEditorDialog.vue';
import AssetVersionsDrawer from '../../assets/components/AssetVersionsDrawer.vue';

const props = defineProps<{ title?: string; scopeFilter?: CustomerServiceStrategyScopeType | '' }>();
const emit = defineEmits<{ changed: [] }>();
const { has } = useCustomerServicePermission();
const loading = ref(false); const submitting = ref(false); const items = ref<CustomerServiceAsset[]>([]); const contentMap = ref<Record<string, CustomerServiceStrategyGroupContent>>({});
const dialogOpen = ref(false); const versionsOpen = ref(false); const versionAsset = ref<CustomerServiceAsset | null>(null); const mode = ref<'create' | 'edit'>('create'); const editing = ref<CustomerServiceAsset | null>(null); const editingContent = ref<CustomerServiceStrategyGroupContent | null>(null);
const title = computed(() => props.title || '策略配置组');
const canCreate = computed(() => has('customer-service:asset:create') && has('customer-service:asset:version:create'));
const canEdit = computed(() => has('customer-service:asset:update') && has('customer-service:asset:version:create'));
const canCreateVersion = computed(() => has('customer-service:asset:version:create'));
const canPublish = computed(() => has('customer-service:asset:publish'));
const filteredItems = computed(() => props.scopeFilter ? items.value.filter((item) => contentOf(item)?.scopeType === props.scopeFilter) : items.value);

onMounted(load);
async function load() {
  loading.value = true;
  try {
    const result = await listCustomerServiceAssets({ keyword: '', assetType: 'STRATEGY_GROUP', status: '', page: 1, pageSize: 500 });
    items.value = result.items.filter((item) => item.status !== 'ARCHIVED');
    const pairs = await Promise.all(items.value.map(async (asset) => [asset.id, await currentContent(asset)] as const));
    contentMap.value = Object.fromEntries(pairs.filter((pair): pair is readonly [string, CustomerServiceStrategyGroupContent] => Boolean(pair[1])));
  } finally { loading.value = false; }
}
async function currentContent(asset: CustomerServiceAsset) {
  const versions = await listCustomerServiceAssetVersions(asset.id);
  const current = versions.find((item) => item.id === asset.currentVersionId) || versions.find((item) => item.status === 'PUBLISHED');
  return current?.content as CustomerServiceStrategyGroupContent | undefined;
}
function contentOf(asset: CustomerServiceAsset) { return contentMap.value[asset.id] || null; }
function openCreate() { mode.value = 'create'; editing.value = null; editingContent.value = null; dialogOpen.value = true; }
function openEdit(asset: CustomerServiceAsset) { mode.value = 'edit'; editing.value = asset; editingContent.value = contentOf(asset); dialogOpen.value = true; }
function openVersions(asset: CustomerServiceAsset) { versionAsset.value = asset; versionsOpen.value = true; }
async function save(value: { key: string; name: string; description: string; content: CustomerServiceStrategyGroupContent; publish: boolean }) {
  submitting.value = true;
  try {
    let asset = editing.value;
    if (mode.value === 'create') asset = await createCustomerServiceAsset({ key: value.key, name: value.name, assetType: 'STRATEGY_GROUP', description: value.description });
    else if (asset && (asset.name !== value.name || (asset.description || '') !== value.description)) asset = await updateCustomerServiceAsset(asset.id, { revision: asset.revision, name: value.name, description: value.description });
    if (!asset) return;
    const version = await createCustomerServiceAssetVersion(asset.id, { title: `${value.name} · ${new Date().toLocaleString()}`, summary: '通过角色配置高级维护发布的结构化策略配置', content: value.content as unknown as Record<string, unknown> });
    if (value.publish) await publishCustomerServiceAssetVersion(asset.id, version.id, version.revision);
    dialogOpen.value = false;
    ElMessage.success(value.publish ? '策略配置组已保存并发布' : '策略配置组草稿版本已保存');
    await load(); emit('changed');
  } finally { submitting.value = false; }
}
function scopeLabel(value?: string) { return ({ ROLE_GLOBAL: '所有阿梨对话', SCENARIO: '匹配场景时', INTENT: '指定客户意图时' } as Record<string, string>)[value || ''] || '尚未设置'; }
function loadDescription(content: CustomerServiceStrategyGroupContent | null) {
  if (!content) return '发布后才可能生效';
  if (content.scopeType === 'INTENT' || content.enabledByDefault === false) return '需要在“客户意图与流程”中选择';
  if (content.scopeType === 'SCENARIO') return '识别到所设场景后自动加载';
  return '符合适用对象时自动加载';
}
function summary(content: CustomerServiceStrategyGroupContent | null) {
  if (!content) return '尚无已发布内容'; const p = content.policy; const parts = [
    p.tone?.warmth !== undefined ? `亲和度 ${p.tone.warmth}` : '',
    p.tone?.playfulness !== undefined ? `活泼度 ${p.tone.playfulness}` : '',
    p.wording?.tildePolicy ? `波浪号：${({ FORBIDDEN: '不用', FOLLOW_CUSTOMER: '跟随客户', ALLOWED: '允许' } as Record<string, string>)[p.wording.tildePolicy] || p.wording.tildePolicy}` : '',
    p.structure?.maxQuestions !== undefined ? `最多问 ${p.structure.maxQuestions} 个问题` : '',
    p.service?.productMentionPolicy ? `商品：${({ PROHIBITED: '不提', CATEGORY_ONLY: '只提品类', SPECIFIC_IF_RELEVANT: '相关时可提', SPECIFIC_ALLOWED: '允许具体商品' } as Record<string, string>)[p.service.productMentionPolicy] || p.service.productMentionPolicy}` : '',
  ].filter(Boolean); return parts.join('；') || '已配置语气、措辞或服务规则';
}
function formatTime(value: string) { return value ? new Date(value).toLocaleString() : '-'; }
</script>
