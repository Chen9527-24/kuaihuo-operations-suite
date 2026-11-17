<template>
  <div class="space-y-4">
    <PageToolbar v-if="!props.embedded" title="行业能力" description="维护“行业 → 品类 → 子品类”主路径。支持级联删除与跨层级拖拽整理。">
    </PageToolbar>

    <el-alert
      title="当前最多三级：行业 → 品类 → 子品类。拖拽可调整同级顺序、跨父级移动和改变层级，保存时会自动重算类型与路径；编码创建后保持不变。删除上级节点会同时删除全部下级。"
      type="info"
      :closable="false"
      show-icon
    />

    <CrudTablePanel title="行业与品类树">
      <template #actions>
        <el-button :loading="loading" @click="fetchItems">刷新</el-button>
        <el-button v-if="canUpdate && items.length > 1" @click="arrangeOpen = true">拖拽整理</el-button>
        <el-button v-if="canCreate" type="primary" @click="openCreate()">新增根行业</el-button>
      </template>
      <el-table
        v-loading="loading"
        :data="tree"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        stripe
      >
        <el-table-column prop="name" label="名称" min-width="220" />
        <el-table-column prop="code" label="编码" min-width="190" />
        <el-table-column prop="nodeType" label="类型" width="110">
          <template #default="{ row }">{{ typeLabel(row.nodeType) }}</template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="240" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ENABLED' ? 'success' : row.status === 'ARCHIVED' ? 'info' : 'warning'">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="80" />
        <el-table-column label="操作" width="225" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canCreate && row.nodeType !== 'SUBCATEGORY' && row.status !== 'ARCHIVED'" link type="primary" @click="openCreate(row.id)">新增下级</el-button>
            <el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canDelete" link type="danger" :loading="deletingId === row.id" @click="confirmDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </CrudTablePanel>

    <IndustryNodeFormDialog
      v-model="formOpen"
      :mode="formMode"
      :initial-data="editing"
      :default-parent-id="defaultParentId"
      :nodes="items"
      :submitting="submitting"
      @submit="saveNode"
    />

    <IndustryTreeArrangeDialog
      v-model="arrangeOpen"
      :nodes="items"
      :saving="arrangeSaving"
      @save="saveTreeLayout"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import {
  createCustomerServiceIndustryNode,
  deleteCustomerServiceIndustryNode,
  saveCustomerServiceIndustryTreeLayout,
  updateCustomerServiceIndustryNode,
  type CustomerServiceIndustryTreeLayoutItem
} from '@/modules/customer-service/api/industries.api';
import { useCustomerServiceIndustries } from '@/modules/customer-service/composables/useCustomerServiceIndustries';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import {
  customerServiceIndustryStatusOptions,
  customerServiceIndustryTypeOptions
} from '@/modules/customer-service/constants/foundation.constants';
import type {
  CustomerServiceIndustryNode,
  CustomerServiceIndustryNodeType,
  CustomerServiceIndustryStatus
} from '@/modules/customer-service/types/industries.types';
import IndustryNodeFormDialog from './components/IndustryNodeFormDialog.vue';
import IndustryTreeArrangeDialog from './components/IndustryTreeArrangeDialog.vue';

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const { loading, items, tree, fetchItems } = useCustomerServiceIndustries();
const { has } = useCustomerServicePermission();
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editing = ref<CustomerServiceIndustryNode | null>(null);
const defaultParentId = ref('');
const submitting = ref(false);
const arrangeOpen = ref(false);
const arrangeSaving = ref(false);
const deletingId = ref('');
const canCreate = computed(() => has('customer-service:industry-node:create'));
const canUpdate = computed(() => has('customer-service:industry-node:update'));
const canDelete = computed(() => has('customer-service:industry-node:delete'));

onMounted(fetchItems);

function openCreate(parentId = '') {
  formMode.value = 'create';
  editing.value = null;
  defaultParentId.value = parentId;
  formOpen.value = true;
}
function openEdit(item: CustomerServiceIndustryNode) {
  formMode.value = 'edit';
  editing.value = item;
  defaultParentId.value = '';
  formOpen.value = true;
}

async function saveNode(form: {
  parentId: string; code: string; name: string; nodeType: CustomerServiceIndustryNodeType;
  description: string; status: CustomerServiceIndustryStatus; sort: number; revision: number;
}) {
  submitting.value = true;
  try {
    if (formMode.value === 'create') {
      await createCustomerServiceIndustryNode({
        parentId: form.parentId || undefined,
        code: form.code,
        name: form.name,
        nodeType: form.nodeType,
        description: form.description,
        status: form.status,
        sort: form.sort
      });
    } else if (editing.value) {
      await updateCustomerServiceIndustryNode(editing.value.id, {
        name: form.name,
        description: form.description,
        status: form.status,
        sort: form.sort,
        revision: form.revision
      });
    }
    formOpen.value = false;
    ElMessage.success('行业节点已保存');
    await fetchItems();
  } finally {
    submitting.value = false;
  }
}

async function saveTreeLayout(layout: CustomerServiceIndustryTreeLayoutItem[]) {
  arrangeSaving.value = true;
  try {
    const result = await saveCustomerServiceIndustryTreeLayout(layout);
    arrangeOpen.value = false;
    ElMessage.success(result.updated ? `树结构已保存，本次更新 ${result.updated} 个节点` : '树结构没有发生变化');
    await fetchItems();
  } finally {
    arrangeSaving.value = false;
  }
}

async function confirmDelete(row: CustomerServiceIndustryNode) {
  const descendants = collectDescendants(row.id);
  const childText = descendants.length ? `，并同时删除 ${descendants.length} 个下级节点` : '';
  try {
    await ElMessageBox.confirm(
      `确认删除“${row.name}”${childText}吗？相关业务角色、账号资料和正在进行的调优会自动解除这些行业节点绑定；历史对话、评测与校准记录不会删除。删除后的节点编码会保留用于历史追踪。`,
      '删除行业节点',
      {
        type: 'warning',
        confirmButtonText: descendants.length ? '删除节点及全部下级' : '确认删除',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true
      }
    );
  } catch {
    return;
  }

  deletingId.value = row.id;
  try {
    const result = await deleteCustomerServiceIndustryNode(row.id, row.revision);
    const detached = result.detachedMerchantRoles + result.detachedAccountProfiles + result.detachedActiveTuningSessions;
    ElMessage.success(`已删除 ${result.deletedNodes} 个节点${detached ? `，并解除 ${detached} 处当前绑定` : ''}`);
    await fetchItems();
  } finally {
    deletingId.value = '';
  }
}

function collectDescendants(rootId: string) {
  const descendants: CustomerServiceIndustryNode[] = [];
  const stack = [rootId];
  while (stack.length) {
    const parentId = stack.pop()!;
    const children = items.value.filter((item) => item.parentId === parentId);
    descendants.push(...children);
    stack.push(...children.map((item) => item.id));
  }
  return descendants;
}

function typeLabel(value: string) { return customerServiceIndustryTypeOptions.find((item) => item.value === value)?.label ?? value; }
function statusLabel(value: string) { return customerServiceIndustryStatusOptions.find((item) => item.value === value)?.label ?? value; }
</script>
