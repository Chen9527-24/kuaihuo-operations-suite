<template>
  <el-dialog v-model="visible" title="拖拽整理行业与品类" width="820px" destroy-on-close :close-on-click-modal="!saving">
    <el-alert
      title="支持跨层级拖拽：可调整同级顺序，也可拖到其他节点内部改变上级。系统会自动重算类型、层级和路径；编码保持不变。最多三级，超出层级或拖到自己的后代会被阻止。"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
    />

    <div class="tree-shell">
      <div class="tree-head">
        <span>名称</span>
        <span>类型</span>
        <span>路径预览</span>
        <span>状态</span>
      </div>
      <el-tree
        :key="treeKey"
        ref="treeRef"
        :data="draftTree"
        node-key="id"
        default-expand-all
        draggable
        :expand-on-click-node="false"
        :allow-drop="allowDrop"
        :allow-drag="allowDrag"
        @node-drop="handleNodeDrop"
      >
        <template #default="{ node, data }">
          <div class="tree-row">
            <div class="tree-name">
              <span class="drag-grip" title="按住拖拽">⋮⋮</span>
              <strong>{{ data.name }}</strong>
              <span class="tree-code">{{ data.code }}</span>
            </div>
            <div><el-tag size="small" effect="plain">{{ typeLabelByTreeLevel(node.level) }}</el-tag></div>
            <div class="tree-path">{{ previewPath(node) }}</div>
            <div>
              <el-tag size="small" :type="data.status === 'ENABLED' ? 'success' : data.status === 'ARCHIVED' ? 'info' : 'warning'">
                {{ statusLabel(data.status) }}
              </el-tag>
            </div>
          </div>
        </template>
      </el-tree>
    </div>

    <div class="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
      <span v-if="dirty">已有未保存的拖拽调整。</span>
      <span v-else>当前布局与服务器一致。</span>
      <el-button link :disabled="saving || !dirty" @click="resetDraft">撤销本次拖拽</el-button>
    </div>

    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!dirty" @click="submit">保存树结构</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { CustomerServiceIndustryTreeLayoutItem } from '@/modules/customer-service/api/industries.api';
import { customerServiceIndustryStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';

const props = defineProps<{
  modelValue: boolean;
  nodes: CustomerServiceIndustryNode[];
  saving?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [layout: CustomerServiceIndustryTreeLayoutItem[]];
}>();

const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const treeRef = ref<any>();
const draftTree = ref<CustomerServiceIndustryNode[]>([]);
const treeKey = ref(0);
const dirty = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetDraft();
  }
);

function resetDraft() {
  draftTree.value = buildTree(props.nodes);
  treeKey.value += 1;
  dirty.value = false;
}

function allowDrag() {
  return !props.saving;
}

function allowDrop(draggingNode: any, dropNode: any, type: 'prev' | 'inner' | 'next') {
  if (props.saving) return false;
  if (!draggingNode || !dropNode || draggingNode.data.id === dropNode.data.id) return false;
  if (isDescendantTarget(draggingNode, dropNode)) return false;
  if (type === 'inner' && dropNode.data.status === 'ARCHIVED') return false;

  // Element Tree 的根节点 level=1。inner 会成为目标的子级，prev/next 与目标同级。
  const newTreeLevel = type === 'inner' ? dropNode.level + 1 : dropNode.level;
  const subtreeHeight = getSubtreeHeight(draggingNode);
  return newTreeLevel >= 1 && newTreeLevel + subtreeHeight <= 3;
}

function isDescendantTarget(draggingNode: any, dropNode: any) {
  let cursor = dropNode;
  while (cursor) {
    if (cursor.data?.id === draggingNode.data?.id) return true;
    cursor = cursor.parent;
  }
  return false;
}

function getSubtreeHeight(node: any): number {
  if (!node?.childNodes?.length) return 0;
  return 1 + Math.max(...node.childNodes.map((child: any) => getSubtreeHeight(child)));
}

function handleNodeDrop() {
  dirty.value = true;
}

function submit() {
  const rootNodes = treeRef.value?.root?.childNodes ?? [];
  const layout: CustomerServiceIndustryTreeLayoutItem[] = [];
  collectLayout(rootNodes, null, layout);
  if (!layout.length) {
    ElMessage.warning('当前行业树为空，无需保存');
    return;
  }
  if (layout.length !== props.nodes.length) {
    ElMessage.error('拖拽后的树节点数量异常，请关闭窗口刷新后重试');
    return;
  }
  emit('save', layout);
}

function collectLayout(nodes: any[], parentId: string | null, output: CustomerServiceIndustryTreeLayoutItem[]) {
  nodes.forEach((node, index) => {
    output.push({
      id: node.data.id,
      parentId,
      sort: (index + 1) * 10,
      revision: node.data.revision
    });
    collectLayout(node.childNodes ?? [], node.data.id, output);
  });
}

function previewPath(node: any) {
  const codes: string[] = [];
  let cursor = node;
  while (cursor?.data?.code) {
    codes.unshift(cursor.data.code);
    cursor = cursor.parent;
  }
  return `/${codes.join('/')}`;
}

function typeLabelByTreeLevel(treeLevel: number) {
  return treeLevel === 1 ? '行业' : treeLevel === 2 ? '品类' : '子品类';
}
function statusLabel(value: string) {
  return customerServiceIndustryStatusOptions.find((item) => item.value === value)?.label ?? value;
}

function buildTree(items: CustomerServiceIndustryNode[]) {
  const map = new Map<string, CustomerServiceIndustryNode>();
  for (const item of items) map.set(item.id, { ...item, children: [] });
  const roots: CustomerServiceIndustryNode[] = [];
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.children!.push(item);
    else roots.push(item);
  }
  const sortChildren = (nodes: CustomerServiceIndustryNode[]) => {
    nodes.sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt));
    nodes.forEach((node) => sortChildren(node.children ?? []));
  };
  sortChildren(roots);
  return roots;
}
</script>

<style scoped>
.tree-shell {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.tree-head,
.tree-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.25fr) 110px minmax(240px, 1fr) 90px;
  align-items: center;
  gap: 12px;
}
.tree-head {
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}
:deep(.el-tree-node__content) {
  height: auto;
  min-height: 46px;
  padding-right: 10px;
  border-top: 1px solid var(--el-border-color-extra-light);
}
:deep(.el-tree-node:first-child > .el-tree-node__content) {
  border-top: 0;
}
.tree-row {
  width: 100%;
  min-width: 0;
  padding: 7px 0;
}
.tree-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.drag-grip {
  cursor: grab;
  user-select: none;
  color: var(--el-text-color-placeholder);
  letter-spacing: -3px;
}
.drag-grip:active { cursor: grabbing; }
.tree-code,
.tree-path {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-code { margin-left: 2px; }
</style>
