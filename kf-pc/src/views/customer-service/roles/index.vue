<template>
  <div class="space-y-4">
    <PageToolbar v-if="!props.embedded" title="角色原型" description="维护内部角色定位与稳定 Speaker Persona；HVE 只实现当前明确绑定的角色，不自行猜身份。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" clearable placeholder="编码 / 名称" @keyup.enter="fetchItems(true)" />
        </el-form-item>
        <el-form-item label="状态" class="!mb-0">
          <el-select v-model="filters.status" clearable placeholder="全部状态">
            <el-option v-for="item in customerServiceRoleStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2"><el-button type="primary" @click="fetchItems(true)">查询</el-button><el-button @click="resetFilters">重置</el-button></div>
        </el-form-item>
      </el-form>
    </PageToolbar>

    <CrudTablePanel title="角色原型列表">
      <template #actions><el-button v-if="canCreate" type="primary" @click="openCreate">新增角色原型</el-button></template>
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column prop="code" label="角色编码" min-width="180" />
        <el-table-column prop="name" label="角色名称" min-width="160" />
        <el-table-column prop="identity" label="内部角色定位" min-width="220" show-overflow-tooltip />
        <el-table-column prop="personality" label="核心人格" min-width="220" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }"><el-tag :type="row.status === 'ENABLED' ? 'success' : row.status === 'ARCHIVED' ? 'info' : 'warning'">{{ optionLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }"><el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button><el-button v-if="canDelete" link type="danger" :loading="deletingId === row.id" @click="confirmDelete(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar :current-page="filters.page" :page-size="filters.pageSize" :total="total" @update:current-page="filters.page = $event; fetchItems()" @update:page-size="filters.pageSize = $event; fetchItems(true)" />
      </template>
    </CrudTablePanel>

    <RolePrototypeFormDialog v-model="formOpen" :mode="formMode" :initial-data="editing" :submitting="submitting" @submit="saveRole" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { createCustomerServiceRolePrototype, deleteCustomerServiceRolePrototype, updateCustomerServiceRolePrototype } from '@/modules/customer-service/api/roles.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import { useCustomerServiceRoles } from '@/modules/customer-service/composables/useCustomerServiceRoles';
import { customerServiceRoleStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceRolePrototype, CustomerServiceRoleSpeakerProfileV1, CustomerServiceRoleStatus } from '@/modules/customer-service/types/roles.types';
import RolePrototypeFormDialog from './components/RolePrototypeFormDialog.vue';

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const { loading, items, filters, total, fetchItems, resetFilters } = useCustomerServiceRoles();
const { has } = useCustomerServicePermission();
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceRolePrototype | null>(null);
const submitting = ref(false);
const deletingId = ref('');
const canCreate = computed(() => has('customer-service:role-prototype:create'));
const canUpdate = computed(() => has('customer-service:role-prototype:update'));
const canDelete = computed(() => has('customer-service:role-prototype:delete'));

onMounted(() => fetchItems());
function openCreate() { formMode.value = 'create'; editing.value = null; formOpen.value = true; }
function openEdit(item: CustomerServiceRolePrototype) { formMode.value = 'edit'; editing.value = item; formOpen.value = true; }

async function saveRole(form: {
  code: string; name: string; description: string; identity: string; personality: string; languageStyle: string;
  servicePosture: string; speakerProfile: CustomerServiceRoleSpeakerProfileV1; status: CustomerServiceRoleStatus; revision: number;
}) {
  submitting.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description,
      identity: form.identity,
      personality: form.personality,
      languageStyle: form.languageStyle,
      servicePosture: form.servicePosture,
      speakerProfile: form.speakerProfile,
      status: form.status
    };
    if (formMode.value === 'create') await createCustomerServiceRolePrototype({ ...payload, code: form.code });
    else if (editing.value) await updateCustomerServiceRolePrototype(editing.value.id, { ...payload, revision: form.revision });
    formOpen.value = false;
    ElMessage.success('角色原型已保存');
    await fetchItems();
  } finally { submitting.value = false; }
}

async function confirmDelete(item: CustomerServiceRolePrototype) {
  await ElMessageBox.confirm(`确认删除角色模板“${item.name}”吗？仍有使用角色引用时，系统会阻止删除并提示先处理引用关系。`, '删除角色模板', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' });
  deletingId.value = item.id;
  try {
    await deleteCustomerServiceRolePrototype(item.id, item.revision);
    ElMessage.success('角色模板已删除');
    await fetchItems();
  } finally { deletingId.value = ''; }
}

function optionLabel(value: string) { return customerServiceRoleStatusOptions.find((item) => item.value === value)?.label ?? value; }
function formatTime(value: string) { return value ? new Date(value).toLocaleString() : '-'; }
</script>
