<template>
  <el-drawer v-model="visible" :title="role ? `${role.name} · 角色模块` : '角色模块'" size="72%" destroy-on-close>
    <el-alert v-if="!definitions.length && !loading" title="未找到模块定义，请先在后端执行 pnpm run prisma:sync-system" type="warning" :closable="false" class="mb-4" />
    <el-alert v-if="definitions.length" title="角色配置边界" type="info" :closable="false" class="mb-4">
      <template #default>公开身份说明“客户可以知道我是谁”；SERVICE_POSTURE 说明“这个 Role 通常怎么参与”；Speaker Persona 说明“已经授权的行为怎么说”。三者不会生成第二套 Policy。</template>
    </el-alert>
    <div class="mb-4 flex justify-end">
      <el-button v-if="canCreate" type="primary" :disabled="!definitions.length" @click="openCreate">新增模块</el-button>
    </div>
    <el-table v-loading="loading" :data="items" row-key="id" stripe>
      <el-table-column prop="definition.name" label="模块类型" min-width="180">
        <template #default="{ row }">
          <span>{{ row.definition.name }}</span>
          <el-tag v-if="isTypedPosture(row)" size="small" type="success" class="ml-2">V1.9</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="key" label="模块标识" min-width="170" />
      <el-table-column prop="name" label="模块名称" min-width="170" />
      <el-table-column prop="mergeMode" label="合并方式" width="110"><template #default="{ row }">{{ optionLabel(row.mergeMode) }}</template></el-table-column>
      <el-table-column prop="priority" label="优先级" width="90" />
      <el-table-column prop="status" label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button></template></el-table-column>
    </el-table>

    <RoleModuleFormDialog v-model="formOpen" :mode="formMode" :initial-data="editing" :definitions="definitions" :role="role" :submitting="submitting" @submit="saveModule" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  createCustomerServiceRoleModule,
  listCustomerServiceRoleModuleDefinitions,
  listCustomerServiceRoleModules,
  updateCustomerServiceRoleModule
} from '@/modules/customer-service/api/merchant-roles.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import { customerServiceRoleModuleMergeModeOptions, customerServiceRoleModuleStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import type {
  CustomerServiceMerchantRole,
  CustomerServiceRoleModuleDefinition,
  CustomerServiceRoleModuleInstance,
  CustomerServiceRoleModulePayload
} from '@/modules/customer-service/types/merchant-roles.types';
import RoleModuleFormDialog from './RoleModuleFormDialog.vue';

const props = defineProps<{ modelValue: boolean; role?: CustomerServiceMerchantRole | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const { has } = useCustomerServicePermission();
const loading = ref(false);
const submitting = ref(false);
const items = ref<CustomerServiceRoleModuleInstance[]>([]);
const definitions = ref<CustomerServiceRoleModuleDefinition[]>([]);
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceRoleModuleInstance | null>(null);
const canCreate = computed(() => has('customer-service:role-module:create'));
const canUpdate = computed(() => has('customer-service:role-module:update'));

watch(
  () => props.modelValue,
  (open) => { if (open) void load(); }
);

async function load() {
  if (!props.role) return;
  loading.value = true;
  try {
    const [moduleDefinitions, modules] = await Promise.all([
      listCustomerServiceRoleModuleDefinitions(),
      listCustomerServiceRoleModules(props.role.id)
    ]);
    definitions.value = moduleDefinitions;
    items.value = modules;
  } finally { loading.value = false; }
}
function openCreate() { formMode.value = 'create'; editing.value = null; formOpen.value = true; }
function openEdit(item: CustomerServiceRoleModuleInstance) { formMode.value = 'edit'; editing.value = item; formOpen.value = true; }

async function saveModule(payload: CustomerServiceRoleModulePayload) {
  if (!props.role) return;
  submitting.value = true;
  try {
    if (formMode.value === 'create') await createCustomerServiceRoleModule(props.role.id, payload);
    else if (editing.value) await updateCustomerServiceRoleModule(props.role.id, editing.value.id, payload);
    formOpen.value = false;
    ElMessage.success('角色模块已保存');
    await load();
    emit('changed');
  } finally { submitting.value = false; }
}
function optionLabel(value: string) { return customerServiceRoleModuleMergeModeOptions.find((item) => item.value === value)?.label ?? value; }
function statusLabel(value: string) { return customerServiceRoleModuleStatusOptions.find((item) => item.value === value)?.label ?? value; }
function isTypedPosture(item: CustomerServiceRoleModuleInstance) {
  return item.definition.code === 'SERVICE_POSTURE' && item.content?.schemaVersion === 1;
}
</script>
