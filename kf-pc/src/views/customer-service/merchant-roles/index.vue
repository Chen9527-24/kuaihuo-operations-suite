<template>
  <div class="space-y-4">
    <PageToolbar v-if="!props.embedded" title="业务角色" description="把角色原型绑定成实际使用身份；HVE 按明确绑定的 Role 形成人感，不自行猜角色。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <el-form-item label="关键词" class="!mb-0"><el-input v-model="filters.keyword" clearable placeholder="编码 / 名称" @keyup.enter="fetchItems(true)" /></el-form-item>
        <el-form-item label="状态" class="!mb-0"><el-select v-model="filters.status" clearable placeholder="全部状态"><el-option v-for="item in customerServiceRoleStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="操作" class="!mb-0"><div class="flex gap-2"><el-button type="primary" @click="fetchItems(true)">查询</el-button><el-button @click="resetFilters">重置</el-button></div></el-form-item>
      </el-form>
    </PageToolbar>

    <CrudTablePanel title="业务角色列表">
      <template #actions><el-button v-if="canCreate" type="primary" @click="openCreate">新增业务角色</el-button></template>
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column prop="code" label="角色编码" min-width="150" />
        <el-table-column prop="name" label="角色名称" min-width="140" />
        <el-table-column prop="prototype.name" label="角色原型" min-width="140" />
        <el-table-column prop="publicRelation" label="对外关系" min-width="130" show-overflow-tooltip />
        <el-table-column label="行业范围" min-width="160"><template #default="{ row }">{{ row.industryNode?.name ?? '未绑定' }}</template></el-table-column>
        <el-table-column label="模块" width="90"><template #default="{ row }">{{ row._count?.modules ?? 0 }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ENABLED' ? 'success' : row.status === 'ARCHIVED' ? 'info' : 'warning'">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="205" fixed="right"><template #default="{ row }"><el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button><el-button v-if="canReadModules" link type="primary" @click="openModules(row)">模块</el-button><el-button v-if="canDelete && row.code !== 'ali'" link type="danger" :loading="deletingId === row.id" @click="confirmDelete(row)">删除</el-button></template></el-table-column>
      </el-table>
      <template #footer><CrudPaginationBar :current-page="filters.page" :page-size="filters.pageSize" :total="total" @update:current-page="filters.page = $event; fetchItems()" @update:page-size="filters.pageSize = $event; fetchItems(true)" /></template>
    </CrudTablePanel>

    <MerchantRoleFormDialog v-model="formOpen" :mode="formMode" :initial-data="editing" :prototypes="prototypes" :industry-options="industryOptions" :submitting="submitting" @submit="saveRole" />
    <RoleModulesDrawer v-model="modulesOpen" :role="moduleRole" @changed="fetchItems" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { listCustomerServiceIndustryNodes } from '@/modules/customer-service/api/industries.api';
import { createCustomerServiceMerchantRole, deleteCustomerServiceMerchantRole, updateCustomerServiceMerchantRole } from '@/modules/customer-service/api/merchant-roles.api';
import { listCustomerServiceRolePrototypes } from '@/modules/customer-service/api/roles.api';
import { useCustomerServiceMerchantRoles } from '@/modules/customer-service/composables/useCustomerServiceMerchantRoles';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import { customerServiceRoleStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type { CustomerServiceRolePrototype, CustomerServiceRoleStatus } from '@/modules/customer-service/types/roles.types';
import MerchantRoleFormDialog from './components/MerchantRoleFormDialog.vue';
import RoleModulesDrawer from './components/RoleModulesDrawer.vue';

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const { loading, items, filters, total, fetchItems, resetFilters } = useCustomerServiceMerchantRoles();
const { has } = useCustomerServicePermission();
const prototypes = ref<CustomerServiceRolePrototype[]>([]);
const industries = ref<CustomerServiceIndustryNode[]>([]);
const formOpen = ref(false);
const modulesOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceMerchantRole | null>(null);
const moduleRole = ref<CustomerServiceMerchantRole | null>(null);
const submitting = ref(false);
const deletingId = ref('');
const canCreate = computed(() => has('customer-service:merchant-role:create'));
const canUpdate = computed(() => has('customer-service:merchant-role:update'));
const canDelete = computed(() => has('customer-service:merchant-role:delete'));
const canReadModules = computed(() => has('customer-service:role-module:read'));
const industryOptions = computed(() => buildIndustryOptions(industries.value));

onMounted(async () => {
  const [roleResult, industryResult] = await Promise.all([
    listCustomerServiceRolePrototypes({ keyword: '', status: '', page: 1, pageSize: 500 }),
    listCustomerServiceIndustryNodes()
  ]);
  prototypes.value = roleResult.items.filter((item) => item.status !== 'ARCHIVED');
  industries.value = industryResult.filter((item) => item.status !== 'ARCHIVED');
  await fetchItems();
});
function openCreate() { formMode.value = 'create'; editing.value = null; formOpen.value = true; }
function openEdit(item: CustomerServiceMerchantRole) { formMode.value = 'edit'; editing.value = item; formOpen.value = true; }
function openModules(item: CustomerServiceMerchantRole) { moduleRole.value = item; modulesOpen.value = true; }

async function saveRole(form: { code: string; name: string; prototypeId: string; industryNodeId: string; publicRelation: string; publicIdentity: string; description: string; generationPrompt: string; status: CustomerServiceRoleStatus; revision: number }) {
  submitting.value = true;
  try {
    const payload = { name: form.name, prototypeId: form.prototypeId, industryNodeId: form.industryNodeId || null, publicRelation: form.publicRelation, publicIdentity: form.publicIdentity, description: form.description, generationPrompt: form.generationPrompt, status: form.status };
    if (formMode.value === 'create') await createCustomerServiceMerchantRole({ ...payload, code: form.code });
    else if (editing.value) await updateCustomerServiceMerchantRole(editing.value.id, { ...payload, revision: form.revision });
    formOpen.value = false;
    ElMessage.success('业务角色已保存');
    await fetchItems();
  } finally { submitting.value = false; }
}
async function confirmDelete(item: CustomerServiceMerchantRole) {
  await ElMessageBox.confirm(`确认删除使用角色“${item.name}”吗？仍被账号或进行中调优使用时，系统会阻止删除并提示先解除绑定。`, '删除使用角色', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' });
  deletingId.value = item.id;
  try {
    await deleteCustomerServiceMerchantRole(item.id, item.revision);
    ElMessage.success('使用角色已删除');
    await fetchItems();
  } finally { deletingId.value = ''; }
}
function statusLabel(value: string) { return customerServiceRoleStatusOptions.find((item) => item.value === value)?.label ?? value; }
function formatTime(value: string) { return value ? new Date(value).toLocaleString() : '-'; }
function buildIndustryOptions(nodes: CustomerServiceIndustryNode[]) {
  const map = new Map(nodes.map((item) => [item.id, item]));
  return nodes.map((item) => {
    const names = [item.name];
    let parentId = item.parentId;
    while (parentId && map.has(parentId)) { const parent = map.get(parentId)!; names.unshift(parent.name); parentId = parent.parentId; }
    return { value: item.id, label: names.join(' / ') };
  });
}
</script>
