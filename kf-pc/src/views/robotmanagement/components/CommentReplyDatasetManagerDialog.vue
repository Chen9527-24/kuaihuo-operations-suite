<template>
  <el-dialog v-model="visible" title="评论导入回复数据" width="min(1180px, calc(100vw - 32px))" class="comment-dataset-dialog" align-center destroy-on-close>
    <div class="space-y-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <el-input v-model="keyword" class="md:max-w-xs" placeholder="搜索数据集名称 / 说明" clearable @keyup.enter="fetchList(true)">
          <template #append>
            <el-button @click="fetchList(true)">搜索</el-button>
          </template>
        </el-input>
        <div class="flex flex-wrap gap-2">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="handleTopImport">
            <el-button :loading="topImporting">导入</el-button>
          </el-upload>
          <el-button type="primary" @click="openCreate">新增</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="items" stripe row-key="id" height="420">
        <el-table-column prop="name" label="数据集名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '--' }}</template>
        </el-table-column>
        <el-table-column label="数据条数" width="120" align="center">
          <template #default="{ row }">{{ row.entriesCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt || row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <CrudPaginationBar
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @update:current-page="page = $event; fetchList()"
        @update:page-size="pageSize = $event; fetchList(true)"
      />
    </div>

    <el-dialog
      v-model="formVisible"
      :title="formMode === 'create' ? '新增评论导入回复数据' : '编辑评论导入回复数据'"
      width="min(1280px, calc(100vw - 32px))"
      top="4vh"
      class="comment-dataset-form-dialog"
      append-to-body
      destroy-on-close
    >
      <div v-loading="formLoading" class="comment-dataset-form-body">
        <div v-if="formMode === 'create'" class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div><div class="text-sm font-semibold text-slate-700">先看一组评论与回复样例</div><div class="mt-1 text-xs text-slate-500">回填精确匹配和包含匹配各一条，默认停用；只写入表单，不会自动保存。</div></div>
          <SampleFillButton label="填入评论回复样例" :has-content="hasDatasetContent" @fill="fillDatasetSample" />
        </div>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="comment-dataset-form">
        <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
          <el-form-item label="数据集名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入数据集名称" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="form.description" placeholder="可选，说明适用场景" />
          </el-form-item>
        </div>
        <div class="comment-dataset-toolbar mb-3 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
          <div class="leading-5">字段对应：commentContent、replyContent、keywords、matchType、priority、enabled；也兼容中文表头。新增或导入时默认精确匹配。</div>
          <div class="comment-dataset-toolbar-actions">
            <el-button-group>
              <el-button :disabled="!form.rows.length" @click="applyMatchTypeToAll('EXACT')">全部精确</el-button>
              <el-button :disabled="!form.rows.length" @click="applyMatchTypeToAll('CONTAINS')">全部包含</el-button>
              <el-button :disabled="!form.rows.length" @click="applyMatchTypeToAll('FUZZY')">全部模糊</el-button>
            </el-button-group>
            <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="handleFormImport">
              <el-button :loading="formImporting">导入表格</el-button>
            </el-upload>
            <el-button @click="addRow">新增一行</el-button>
          </div>
        </div>
        <el-form-item label="数据内容" prop="rows" class="comment-dataset-rows-item">
          <div class="dataset-edit-table-shell">
            <el-table class="dataset-edit-table" :data="form.rows" stripe max-height="420" scrollbar-always-on empty-text="暂无数据，请先新增一行或导入表格">
              <el-table-column type="index" label="#" width="56" align="center" />
              <el-table-column label="评论内容" min-width="380">
                <template #default="{ row, $index }">
                  <el-input v-model="form.rows[$index].commentContent" type="textarea" :rows="4" maxlength="2000" />
                </template>
              </el-table-column>
              <el-table-column label="配套回复" min-width="420">
                <template #default="{ row, $index }">
                  <el-input v-model="form.rows[$index].replyContent" type="textarea" :rows="4" maxlength="4000" />
                </template>
              </el-table-column>
              <el-table-column label="关键词" min-width="180">
                <template #default="{ row, $index }">
                  <el-input :model-value="(row.keywords || []).join('，')" placeholder="多个关键词用逗号分隔" @update:model-value="updateKeywords($index, $event)" />
                </template>
              </el-table-column>
              <el-table-column label="匹配方式" width="136">
                <template #default="{ $index }">
                  <el-select v-model="form.rows[$index].matchType" class="w-full">
                    <el-option label="精确匹配" value="EXACT" />
                    <el-option label="包含匹配" value="CONTAINS" />
                    <el-option label="模糊匹配" value="FUZZY" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="优先级" width="128">
                <template #default="{ $index }">
                  <el-input-number v-model="form.rows[$index].priority" :min="0" :max="9999" class="w-full" />
                </template>
              </el-table-column>
              <el-table-column label="启用" width="90" align="center">
                <template #default="{ $index }">
                  <el-switch v-model="form.rows[$index].enabled" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="90" align="center">
                <template #default="{ $index }">
                  <el-button link type="danger" @click="removeRow($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="saving" @click="formVisible = false">取消</el-button>
        <el-button type="primary" :disabled="formLoading" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadFile } from 'element-plus';
import * as autoRepliesApi from '@/api/modules/autoReplies';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import { formatDateTime } from '@/utils/format';
import type { CommentMatchType, CommentReplyDatasetItem, CommentReplyDatasetRow } from '@/api/modules/autoReplies';
import { parseCommentDatasetRows, splitKeywords } from '../commentDatasetUtils';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const keyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const formLoading = ref(false);
const topImporting = ref(false);
const formImporting = ref(false);
const items = ref<CommentReplyDatasetItem[]>([]);
const formVisible = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const currentId = ref('');
const formRef = ref<FormInstance>();

const form = reactive(createEmptyForm());
const hasDatasetContent = computed(() => Boolean(form.name.trim() || form.description.trim() || form.rows.length));

const matchTypeLabels: Record<CommentMatchType, string> = {
  EXACT: '精确匹配',
  CONTAINS: '包含匹配',
  FUZZY: '模糊匹配'
};

const rules: FormRules = {
  name: [{ required: true, message: '请输入数据集名称', trigger: 'blur' }],
  rows: [{ validator: validateRows, trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) fetchList(true);
  }
);

async function fetchList(reset = false) {
  if (reset) page.value = 1;
  loading.value = true;
  try {
    const result = await autoRepliesApi.listCommentReplyDatasets({
      keyword: keyword.value,
      page: page.value,
      pageSize: pageSize.value
    });
    items.value = result.items;
    total.value = result.total;
    page.value = result.page;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  formMode.value = 'create';
  currentId.value = '';
  Object.assign(form, createEmptyForm());
  formVisible.value = true;
}

async function openEdit(row: CommentReplyDatasetItem) {
  formMode.value = 'edit';
  currentId.value = row.id;
  Object.assign(form, createEmptyForm(row.name || '', []));
  formVisible.value = true;
  formLoading.value = true;
  try {
    const detail = await autoRepliesApi.detailCommentReplyDataset(row.id);
    Object.assign(form, datasetToForm(detail));
  } catch (error) {
    formVisible.value = false;
    throw error;
  } finally {
    formLoading.value = false;
  }
}

async function remove(row: CommentReplyDatasetItem) {
  await ElMessageBox.confirm(`确认删除数据集「${row.name}」？`, '删除确认', { type: 'warning' });
  await autoRepliesApi.removeCommentReplyDataset(row.id);
  ElMessage.success('数据集已删除');
  await fetchList(true);
  emit('changed');
}

function addRow() {
  form.rows.push(createEmptyRow());
}

function fillDatasetSample() {
  Object.assign(form, createEmptyForm('通勤女装评论回复参考', [
    {
      commentContent: '这件上班穿会不会太休闲？',
      replyContent: '版型整体比较利落，日常通勤没问题。你更喜欢合身一点还是宽松一点？',
      keywords: ['上班', '通勤'], matchType: 'CONTAINS', priority: 100, enabled: false,
    },
    {
      commentContent: '怎么选尺码',
      replyContent: '可以把身高、体重和偏好的松紧感发我，我结合当前款尺码表帮你看方向。',
      keywords: ['尺码'], matchType: 'EXACT', priority: 90, enabled: false,
    },
  ]));
  form.description = '虚构参考样例：演示评论内容、配套回复、关键词、匹配方式和优先级。';
  ElMessage.success('评论回复样例已填入，示例行当前为停用状态');
}

function removeRow(index: number) {
  form.rows.splice(index, 1);
}

function updateKeywords(index: number, value: string) {
  form.rows[index].keywords = splitKeywords(value);
}

function applyMatchTypeToAll(type: CommentMatchType) {
  if (!form.rows.length) {
    ElMessage.warning('请先新增或导入数据');
    return;
  }
  form.rows.forEach((row) => {
    row.matchType = type;
  });
  ElMessage.success(`已将全部数据改为${matchTypeLabels[type]}`);
}

async function handleTopImport(file: UploadFile) {
  const raw = file.raw;
  if (!raw || topImporting.value) return;
  topImporting.value = true;
  try {
    const rows = await parseCommentDatasetRows(raw);
    if (!rows.length) {
      ElMessage.warning('表格中没有识别到有效的评论回复数据');
      return;
    }
    formMode.value = 'create';
    currentId.value = '';
    Object.assign(form, createEmptyForm(raw.name.replace(/\.(xlsx|xls)$/i, ''), rows));
    formVisible.value = true;
  } finally {
    topImporting.value = false;
  }
}

async function handleFormImport(file: UploadFile) {
  const raw = file.raw;
  if (!raw || formImporting.value) return;
  formImporting.value = true;
  try {
    const rows = await parseCommentDatasetRows(raw);
    if (!rows.length) {
      ElMessage.warning('表格中没有识别到有效的评论回复数据');
      return;
    }
    form.rows = rows;
    if (!form.name.trim()) form.name = raw.name.replace(/\.(xlsx|xls)$/i, '');
    ElMessage.success(`已导入 ${rows.length} 条数据`);
  } finally {
    formImporting.value = false;
  }
}

async function submitForm() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      rows: normalizeRows(form.rows),
      defaultMatchType: 'EXACT' as CommentMatchType
    };
    if (formMode.value === 'create') {
      await autoRepliesApi.importCommentReplyDataset(payload);
      ElMessage.success('评论导入回复数据已新增');
    } else {
      await autoRepliesApi.updateCommentReplyDataset(currentId.value, payload);
      ElMessage.success('评论导入回复数据已更新');
    }
    formVisible.value = false;
    await fetchList();
    emit('changed');
  } finally {
    saving.value = false;
  }
}

function createEmptyForm(name = '', rows: CommentReplyDatasetRow[] = []) {
  return {
    name,
    description: '',
    rows
  };
}

function createEmptyRow(): CommentReplyDatasetRow {
  return {
    commentContent: '',
    replyContent: '',
    keywords: [],
    matchType: 'EXACT',
    priority: 0,
    enabled: true
  };
}

function datasetToForm(dataset: CommentReplyDatasetItem) {
  return {
    name: dataset.name || '',
    description: dataset.description || '',
    rows: (dataset.entries || []).map((item) => ({
      commentContent: item.commentContent || '',
      replyContent: item.replyContent || '',
      keywords: [...(item.keywords || [])],
      matchType: item.matchType || 'EXACT',
      priority: Number(item.priority) || 0,
      enabled: item.enabled !== false
    }))
  };
}

function normalizeRows(rows: CommentReplyDatasetRow[]) {
  return rows
    .map((item) => ({
      commentContent: String(item.commentContent || '').trim(),
      replyContent: String(item.replyContent || '').trim(),
      keywords: [...(item.keywords || [])].map((keyword) => String(keyword || '').trim()).filter(Boolean),
      matchType: item.matchType || 'EXACT',
      priority: Number(item.priority) || 0,
      enabled: item.enabled !== false
    }))
    .filter((item) => item.commentContent && item.replyContent);
}

function validateRows(_: unknown, value: CommentReplyDatasetRow[], callback: (error?: Error) => void) {
  const rows = normalizeRows(value || []);
  if (!rows.length) {
    callback(new Error('请至少填写一条有效数据'));
    return;
  }
  callback();
}
</script>


<style>
.comment-dataset-dialog .el-dialog__body {
  max-height: calc(100vh - 148px);
  overflow-y: auto;
}

.comment-dataset-form-dialog .el-dialog__body {
  max-height: calc(100vh - 132px);
  overflow: hidden;
  padding-bottom: 12px;
}

.comment-dataset-form-body {
  min-height: 260px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.comment-dataset-form-dialog .comment-dataset-form,
.comment-dataset-form-dialog .el-form-item,
.comment-dataset-form-dialog .el-form-item__content {
  min-width: 0;
}

.comment-dataset-form-dialog .el-form-item__label {
  justify-content: flex-start;
  width: auto !important;
  height: auto;
  margin-bottom: 6px;
  line-height: 20px;
}

.comment-dataset-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.comment-dataset-toolbar-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.comment-dataset-rows-item .el-form-item__content {
  display: block;
}

.dataset-edit-table-shell {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
}

.dataset-edit-table-shell .dataset-edit-table {
  min-width: 1480px;
}

.dataset-edit-table-shell .el-textarea__inner {
  min-height: 96px !important;
}

.dataset-edit-table-shell .el-input-number,
.dataset-edit-table-shell .el-select {
  min-width: 0;
  width: 100%;
}

.dataset-edit-table-shell .el-input-number .el-input__wrapper {
  padding-inline: 26px;
}

@media (max-width: 1023px) {
  .comment-dataset-dialog,
  .comment-dataset-form-dialog {
    width: calc(100vw - 20px) !important;
  }

  .comment-dataset-dialog .el-dialog__body,
  .comment-dataset-form-dialog .el-dialog__body {
    max-height: calc(100vh - 118px);
    padding: 12px 14px 14px;
  }

  .comment-dataset-form-body {
    max-height: calc(100vh - 196px);
  }

  .comment-dataset-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .comment-dataset-toolbar-actions {
    justify-content: flex-start;
  }

  .dataset-edit-table-shell .dataset-edit-table {
    min-width: 1480px;
  }
}
</style>
