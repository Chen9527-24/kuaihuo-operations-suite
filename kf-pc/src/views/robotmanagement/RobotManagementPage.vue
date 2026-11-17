<template>
  <div class="space-y-4">
    <PageToolbar :title="meta.title" :description="meta.description">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-5">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="机器人名称 / 编号 / 账号" clearable @keyup.enter="applyFilters" />
        </el-form-item>
        <el-form-item label="平台" class="!mb-0">
          <el-select v-model="filters.platform" placeholder="全部平台" clearable>
            <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="授权状态" class="!mb-0">
          <el-select v-model="filters.authStatus" placeholder="全部状态" clearable>
            <el-option v-for="item in authStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="运行状态" class="!mb-0">
          <el-select v-model="filters.runStatus" placeholder="全部状态" clearable>
            <el-option v-for="item in runStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="applyFilters">查询</el-button>
            <el-button @click="handleResetFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button v-if="autoReplyModule" @click="promptManagerVisible = true">提示词配置</el-button>
        <el-button v-if="category === 'COMMENT'" @click="datasetManagerVisible = true">导入回复数据</el-button>
        <el-button type="primary" @click="openCreate">新增</el-button>
      </template>
    </PageToolbar>

    <section class="grid grid-cols-1 gap-4 md:grid-cols-4">
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">总机器人数</div>
        <div class="mt-2 text-2xl font-semibold">{{ pagination.total }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">运行中</div>
        <div class="mt-2 text-2xl font-semibold">{{ countByRunStatus('RUNNING') }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">未授权</div>
        <div class="mt-2 text-2xl font-semibold">{{ countByAuthStatus('UNAUTHORIZED') }}</div>
      </article>
      <article class="panel-surface p-5 shadow-panel">
        <div class="text-sm text-slate-500">已禁用</div>
        <div class="mt-2 text-2xl font-semibold">{{ countByRunStatus('DISABLED') }}</div>
      </article>
    </section>

    <el-tabs v-if="category === 'INTERCEPT'" v-model="activeTab" class="robot-page-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="机器人列表" name="robots" />
      <el-tab-pane label="捕获数据" name="captures" />
    </el-tabs>

    <CrudTablePanel v-show="category !== 'INTERCEPT' || activeTab === 'robots'" :title="`${meta.title}列表`" description="已接入真实接口，支持创建、编辑、删除、启动、停止和扫码授权会话">
      <el-alert
        title="新建机器人默认显示未授权；授权状态和运行状态以后端返回及 PC 端绑定结果为准，过期后前端兜底展示为已禁用。"
        type="info"
        :closable="false"
        class="mb-4"
      />

      <el-table v-loading="loading" :data="filteredItems" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" align="center" header-align="center" />
        <el-table-column prop="name" label="机器人名称" min-width="200" />
        <el-table-column prop="code" label="编号" width="100" />
        <el-table-column prop="platform" label="平台" width="120">
          <template #default="{ row }">
            <DictTag :value="row.platform" :options="platformOptions" />
          </template>
        </el-table-column>
        <el-table-column v-if="autoReplyModule" label="提示词" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.promptSnapshot?.name || promptName(row.promptConfigId) || '--' }}</template>
        </el-table-column>
        <el-table-column v-if="category === 'COMMENT'" label="评论回复范围" min-width="160">
          <template #default="{ row }">{{ row.commentReplyMode === 'PUBLISHER_REPLY_THREAD_ONLY' ? '只针对账号评论的回复' : '全部未回复评论' }}</template>
        </el-table-column>
        <el-table-column prop="accountName" label="授权账号" min-width="160" />
        <el-table-column prop="deviceName" label="执行设备" min-width="160" show-overflow-tooltip />
        <el-table-column prop="authStatus" label="授权状态" width="120">
          <template #default="{ row }">
            <DictTag :value="row.authStatus" :options="authStatusOptions" />
          </template>
        </el-table-column>
        <el-table-column prop="runStatus" label="运行状态" width="120">
          <template #default="{ row }">
            <DictTag :value="row.runStatus" :options="runStatusOptions" />
          </template>
        </el-table-column>
        <el-table-column v-if="category === 'INTERCEPT'" label="监听顺序" min-width="150">
          <template #default="{ row }">
            <el-tag :type="row.interceptConfig?.collect?.randomizeTargets !== false ? 'success' : 'info'" effect="light">
              {{ row.interceptConfig?.collect?.randomizeTargets !== false ? '随机，不重复' : '按列表顺序' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="expiredAt" label="过期时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.expiredAt) }}</template>
        </el-table-column>
        <el-table-column label="最近活跃" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastActiveAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="success" :disabled="!canStart(row)" @click="startRobot(row)">启动</el-button>
            <el-button link type="warning" :disabled="!canStop(row)" @click="stopRobot(row)">停止</el-button>
            <el-button link @click="refreshQr(row)">扫码</el-button>
            <el-button link type="danger" @click="removeRobot(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <CrudPaginationBar
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          @update:current-page="pagination.page = $event; fetchList()"
          @update:page-size="pagination.pageSize = $event; fetchList(true)"
        />
      </template>
    </CrudTablePanel>


    <CrudTablePanel v-if="category === 'INTERCEPT'" v-show="activeTab === 'captures'" title="截流捕获数据" description="展示截流机器人客户端回传的评论/线索数据，支持分页、关键词筛选、单条删除、多选删除和一键删除。">
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-input v-model="captureFilters.keyword" placeholder="评论内容 / 昵称 / 作品ID" clearable @keyup.enter="fetchCaptureList(true)" />
        <el-select v-model="captureFilters.robotId" placeholder="全部机器人" clearable>
          <el-option v-for="item in items" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="captureFilters.platform" placeholder="全部平台" clearable>
          <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <div class="flex gap-2">
          <el-button type="primary" @click="fetchCaptureList(true)">查询</el-button>
          <el-button @click="resetCaptureFilters">重置</el-button>
        </div>
      </div>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm text-slate-500">已选 {{ captureSelection.length }} 条</div>
        <div class="flex flex-wrap gap-2">
          <el-button type="danger" plain :disabled="!captureSelection.length || captureDeleting" :loading="captureDeleting" @click="deleteSelectedCaptures">删除选中</el-button>
          <el-button type="danger" :disabled="capturePagination.total <= 0 || captureDeleting" :loading="captureDeleting" @click="clearCaptureList">一键删除</el-button>
        </div>
      </div>
      <el-table ref="captureTableRef" v-loading="captureLoading" :data="captureItems" row-key="id" stripe @selection-change="handleCaptureSelectionChange">
        <el-table-column type="selection" width="48" align="center" reserve-selection />
        <el-table-column type="index" label="#" width="60" align="center" header-align="center" />
        <el-table-column label="捕获时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.capturedAt || row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="机器人" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ captureRobotName(row) }}</template>
        </el-table-column>
        <el-table-column label="平台" width="110">
          <template #default="{ row }"><DictTag :value="row.platform" :options="platformOptions" /></template>
        </el-table-column>
        <el-table-column label="来源" width="110">
          <template #default="{ row }">{{ row.targetType || '--' }}</template>
        </el-table-column>
        <el-table-column label="主页 / 作品链接" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contentUrl || row.homepageUrl || row.targetUrl || '--' }}</template>
        </el-table-column>
        <el-table-column label="作品ID/标题" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.platformContentId || row.contentTitle || '--' }}</template>
        </el-table-column>
        <el-table-column label="评论用户" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.nickname || row.userId || '--' }}</template>
        </el-table-column>
        <el-table-column label="评论内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.commentText || '--' }}</template>
        </el-table-column>
        <el-table-column label="IP/地区" width="120">
          <template #default="{ row }">{{ row.visibleRegion || '--' }}</template>
        </el-table-column>
        <el-table-column label="评论时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.commentTimeIso) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" :disabled="captureDeleting" @click="deleteSingleCapture(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="capturePagination.page"
          :page-size="capturePagination.pageSize"
          :total="capturePagination.total"
          @update:current-page="capturePagination.page = $event; fetchCaptureList()"
          @update:page-size="capturePagination.pageSize = $event; fetchCaptureList(true)"
        />
      </template>
    </CrudTablePanel>


    <RobotFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :category="category"
      :initial-data="currentFormData"
      :platform-options="platformOptions"
      :prompt-options="currentPromptConfigs"
      :dataset-options="commentDatasets"
      :submitting="submitting"
      :syncing-prompt="syncingPrompt"
      @submit="handleSubmit"
      @test="openTestDrawer"
      @sync-prompt-config="handleSyncPromptConfig"
    />

    <PromptConfigManagerDialog
      v-if="autoReplyModule"
      v-model="promptManagerVisible"
      :module="autoReplyModule"
      @changed="fetchPromptConfigs"
    />

    <CommentReplyDatasetManagerDialog
      v-if="category === 'COMMENT'"
      v-model="datasetManagerVisible"
      @changed="fetchCommentDatasets"
    />

    <AutoReplyTestDrawer
      v-if="testPayload && autoReplyModule"
      v-model="testDrawerVisible"
      :module="autoReplyModule"
      :robot-id="currentRecord?.id"
      :prompt-config-id="testPayload.promptConfigId"
      :prompt-snapshot="testPayload.promptSnapshot"
      :dataset-id="testPayload.replyDatasetId"
      :bot-nickname="testPayload.name || currentRecord?.name"
      :ai-binding="testPayload.aiBinding"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus';
import * as robotsApi from '@/api/modules/robots';
import * as autoRepliesApi from '@/api/modules/autoReplies';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { formatDateTime } from '@/utils/format';
import RobotFormDialog from './components/RobotFormDialog.vue';
import PromptConfigManagerDialog from './components/PromptConfigManagerDialog.vue';
import CommentReplyDatasetManagerDialog from './components/CommentReplyDatasetManagerDialog.vue';
import AutoReplyTestDrawer from './components/AutoReplyTestDrawer.vue';
import { DEFAULT_INTERCEPT_CONFIG, ROBOT_AUTH_STATUS_OPTIONS, ROBOT_CATEGORY_META, ROBOT_PLATFORM_OPTIONS, ROBOT_RUN_STATUS_OPTIONS } from './constants';
import { normalizeRuntimePolicy } from './runtimePolicy';
import type { AutoReplyModule, AutoReplyPromptConfig, AutoReplyPromptSnapshot, AutoReplyPromptConfigPayload, RobotAutoReplySettingPayload, CommentReplyDatasetItem, CommentReplyMode } from '@/api/modules/autoReplies';
import type { InterceptRobotConfig, RobotAiBinding, RobotAuthStatus, RobotBackendType, RobotCategory, RobotManagementFilters, RobotManagementFormModel, RobotManagementItem, RobotRunStatus } from './types';

const props = defineProps<{
  category: RobotCategory;
}>();

const category = computed(() => props.category);
const meta = computed(() => ROBOT_CATEGORY_META[props.category]);
const platformOptions = ROBOT_PLATFORM_OPTIONS;
const authStatusOptions = ROBOT_AUTH_STATUS_OPTIONS;
const runStatusOptions = ROBOT_RUN_STATUS_OPTIONS;
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const submitting = ref(false);
const syncingPrompt = ref(false);
const currentRecord = ref<RobotManagementItem | null>(null);
const promptManagerVisible = ref(false);
const datasetManagerVisible = ref(false);
const promptConfigs = ref<Array<AutoReplyPromptConfig | robotsApi.InterceptIntentPromptConfigItem>>([]);
const commentDatasets = ref<CommentReplyDatasetItem[]>([]);
const testDrawerVisible = ref(false);
const testPayload = ref<RobotManagementFormModel | null>(null);
const activeTab = ref<'robots' | 'captures'>('robots');
const captureItems = ref<robotsApi.InterceptCaptureItem[]>([]);
const captureLoading = ref(false);
const captureDeleting = ref(false);
const captureTableRef = ref<TableInstance>();
const captureSelection = ref<robotsApi.InterceptCaptureItem[]>([]);
const captureFilters = ref({ keyword: '', robotId: '', platform: '' });
const capturePagination = ref({ page: 1, pageSize: 10, total: 0 });

const autoReplyModule = computed<AutoReplyModule | undefined>(() => {
  if (props.category === 'COMMENT') return 'comment';
  if (props.category === 'PRIVATE_MESSAGE') return 'dm';
  return undefined;
});

const currentPromptConfigs = computed(() => props.category === 'INTERCEPT' ? promptConfigs.value : promptConfigs.value.filter((item) => (item as AutoReplyPromptConfig).module === autoReplyModule.value));

const { items, filters, pagination, loading, fetchList, resetFilters: resetTableFilters } = useRemoteTable<RobotManagementItem, RobotManagementFilters>(
  { keyword: '', platform: '', authStatus: '', runStatus: '' },
  async (query) => {
    const response = await robotsApi.listRobots({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      platform: query.platform,
      type: mapCategoryToBackendType(props.category),
      status: query.runStatus
    });

    return {
      ...response,
      items: response.items.map((item) => normalizeRobotManagementItem(item))
    };
  },
  10
);

const filteredItems = computed(() =>
  items.value.filter((item) => {
    if (filters.platform && item.platform !== filters.platform) return false;
    if (filters.authStatus && item.authStatus !== filters.authStatus) return false;
    if (filters.runStatus && item.runStatus !== filters.runStatus) return false;
    const keyword = filters.keyword.trim().toLowerCase();
    if (!keyword) return true;
    return [item.name, item.code, item.accountName, item.scope].some((field) => field.toLowerCase().includes(keyword));
  })
);

const currentFormData = computed<RobotManagementFormModel | undefined>(() => {
  if (!currentRecord.value) return undefined;
  const { name, platform, expiredAt, remark, promptConfigId, promptSnapshot, commentReplyMode, replyDatasetId, enableFirstReply, firstReplyContents, useConversationContext, aiBinding, autoReplySettingConfig, runtimePolicy, interceptConfig } = currentRecord.value;
  return {
    name,
    platform,
    expiredAt: toLocalDateTimeValue(expiredAt),
    remark: remark || '',
    promptConfigId: promptConfigId || '',
    promptSnapshot: { ...(promptSnapshot ?? {}) },
    commentReplyMode: commentReplyMode || 'ALL_UNREPLIED',
    replyDatasetId: replyDatasetId || '',
    enableFirstReply: enableFirstReply === true,
    firstReplyContents: [...(firstReplyContents ?? [])],
    useConversationContext: useConversationContext !== false,
    aiBinding: normalizeAiBinding(aiBinding),
    autoReplySettingConfig: { ...(autoReplySettingConfig ?? {}) },
    runtimePolicy: normalizeRuntimePolicy(runtimePolicy),
    interceptConfig: normalizeInterceptConfig(interceptConfig)
  };
});

const latestAutoStopReason = computed(
  () =>
    [...filteredItems.value]
      .reverse()
      .find((item) => item.autoStopReason)?.autoStopReason || ''
);

onMounted(() => {
  loadPageData();
});

watch(
  () => props.category,
  () => {
    dialogVisible.value = false;
    promptManagerVisible.value = false;
    datasetManagerVisible.value = false;
    testDrawerVisible.value = false;
    activeTab.value = 'robots';
    loadPageData();
  }
);

function applyFilters() {
  fetchList(true);
}

function handleResetFilters() {
  resetTableFilters();
}


function handleTabChange() {
  if (activeTab.value === 'captures') {
    fetchCaptureList(true);
  }
}

async function fetchCaptureList(resetPage = false) {
  if (props.category !== 'INTERCEPT') return;
  if (resetPage) capturePagination.value.page = 1;
  captureLoading.value = true;
  try {
    const result = await robotsApi.listInterceptCaptures({
      page: capturePagination.value.page,
      pageSize: capturePagination.value.pageSize,
      keyword: captureFilters.value.keyword,
      robotId: captureFilters.value.robotId,
      platform: captureFilters.value.platform
    });
    captureItems.value = result.items;
    capturePagination.value.total = result.total;
    capturePagination.value.page = result.page;
    clearCaptureSelection();
  } finally {
    captureLoading.value = false;
  }
}

function resetCaptureFilters() {
  captureFilters.value = { keyword: '', robotId: '', platform: '' };
  fetchCaptureList(true);
}


function handleCaptureSelectionChange(selection: robotsApi.InterceptCaptureItem[]) {
  captureSelection.value = selection;
}

function clearCaptureSelection() {
  captureSelection.value = [];
  captureTableRef.value?.clearSelection();
}

async function deleteSingleCapture(row: robotsApi.InterceptCaptureItem) {
  await ElMessageBox.confirm(`确认删除评论用户「${row.nickname || row.userId || '--'}」的这条捕获数据？`, '删除确认', { type: 'warning' });
  captureDeleting.value = true;
  try {
    const result = await robotsApi.deleteInterceptCapture(row.id);
    ElMessage.success(`已删除 ${result.deleted || 0} 条捕获数据`);
    await refreshCaptureListAfterDelete(result.deleted || 1);
  } finally {
    captureDeleting.value = false;
  }
}

async function deleteSelectedCaptures() {
  const ids = Array.from(new Set(captureSelection.value.map((item) => item.id).filter(Boolean)));
  if (!ids.length) {
    ElMessage.warning('请先勾选需要删除的捕获数据');
    return;
  }
  await ElMessageBox.confirm(`确认删除已选的 ${ids.length} 条捕获数据？`, '批量删除确认', { type: 'warning' });
  captureDeleting.value = true;
  try {
    const result = await robotsApi.deleteInterceptCaptureBatch(ids);
    ElMessage.success(`已删除 ${result.deleted || 0} 条捕获数据`);
    await refreshCaptureListAfterDelete(result.deleted || ids.length);
  } finally {
    captureDeleting.value = false;
  }
}

async function clearCaptureList() {
  if (capturePagination.value.total <= 0) {
    ElMessage.warning('当前没有可删除的捕获数据');
    return;
  }
  const scopeText = captureFilters.value.keyword || captureFilters.value.robotId || captureFilters.value.platform ? '当前筛选条件下的全部捕获数据' : '当前租户下的全部捕获数据';
  await ElMessageBox.confirm(`确认一键删除${scopeText}？该操作不可恢复。`, '一键删除确认', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消'
  });
  captureDeleting.value = true;
  try {
    const result = await robotsApi.clearInterceptCaptures({
      keyword: captureFilters.value.keyword,
      robotId: captureFilters.value.robotId,
      platform: captureFilters.value.platform
    });
    ElMessage.success(`已删除 ${result.deleted || 0} 条捕获数据`);
    capturePagination.value.page = 1;
    await fetchCaptureList();
  } finally {
    captureDeleting.value = false;
  }
}

async function refreshCaptureListAfterDelete(deletedCount: number) {
  const nextTotal = Math.max(0, capturePagination.value.total - Math.max(1, deletedCount));
  const maxPage = Math.max(1, Math.ceil(nextTotal / capturePagination.value.pageSize));
  if (capturePagination.value.page > maxPage) {
    capturePagination.value.page = maxPage;
  }
  await fetchCaptureList();
}

function captureRobotName(row: robotsApi.InterceptCaptureItem) {
  const robot = row.robot && typeof row.robot === 'object' ? row.robot : null;
  return (robot && String(robot.name || '')) || items.value.find((item) => item.id === row.robotId)?.name || row.robotId || '--';
}

function countByRunStatus(status: RobotRunStatus) {
  return filteredItems.value.filter((item) => item.runStatus === status).length;
}

function countByAuthStatus(status: RobotAuthStatus) {
  return filteredItems.value.filter((item) => item.authStatus === status).length;
}

function openCreate() {
  dialogMode.value = 'create';
  currentRecord.value = null;
  testPayload.value = null;
  dialogVisible.value = true;
}

function openEdit(row: RobotManagementItem) {
  dialogMode.value = 'edit';
  currentRecord.value = row;
  testPayload.value = null;
  dialogVisible.value = true;
}

async function handleSubmit(payload: RobotManagementFormModel) {
  submitting.value = true;
  try {
    let robotId = currentRecord.value?.id || '';
    if (dialogMode.value === 'create') {
      const created = await robotsApi.createRobot(buildRobotPayload(payload));
      robotId = created.id;
      ElMessage.success(`${meta.value.title}已新增`);
    } else if (currentRecord.value) {
      const updated = await robotsApi.updateRobot(currentRecord.value.id, buildRobotPayload(payload));
      robotId = updated.id || currentRecord.value.id;
      ElMessage.success(`${meta.value.title}已更新`);
    }
    if (robotId && autoReplyModule.value) {
      await autoRepliesApi.updateRobotSetting(robotId, buildRobotSettingPayload(payload, autoReplyModule.value));
    }
    dialogVisible.value = false;
    await loadPageData();
  } finally {
    submitting.value = false;
  }
}

function openTestDrawer(payload: RobotManagementFormModel) {
  testPayload.value = payload;
  testDrawerVisible.value = true;
}

async function handleSyncPromptConfig(payload: RobotManagementFormModel) {
  if (!payload.promptConfigId || !autoReplyModule.value) return;
  syncingPrompt.value = true;
  try {
    if (currentRecord.value?.id) {
      await autoRepliesApi.syncRobotPromptConfig(currentRecord.value.id, {
        module: autoReplyModule.value,
        promptConfigId: payload.promptConfigId,
        promptSnapshot: payload.promptSnapshot
      });
    } else {
      await autoRepliesApi.updatePromptConfig(payload.promptConfigId, promptSnapshotToPromptConfigPayload(payload.promptSnapshot, autoReplyModule.value));
    }
    ElMessage.success('已同步到提示词配置项');
    await fetchPromptConfigs();
  } finally {
    syncingPrompt.value = false;
  }
}

function canStart(row: RobotManagementItem) {
  return row.authStatus === 'AUTHORIZED' && row.runStatus !== 'RUNNING' && row.runStatus !== 'DISABLED' && !isExpired(row.expiredAt);
}

function canStop(row: RobotManagementItem) {
  return row.runStatus === 'RUNNING';
}

async function startRobot(row: RobotManagementItem) {
  if (!canStart(row)) {
    ElMessage.warning('请先完成授权且确保未过期后再启动机器人');
    return;
  }
  await robotsApi.startRobot(row.id);
  ElMessage.success('机器人已启动');
  await fetchList();
}

async function stopRobot(row: RobotManagementItem) {
  if (!canStop(row)) return;
  await robotsApi.stopRobot(row.id, { stopReason: 'MANUAL' });
  ElMessage.success('机器人已停止');
  await fetchList();
}

async function refreshQr(row: RobotManagementItem) {
  if (!row.authId || !row.deviceId) {
    ElMessage.warning('当前机器人缺少授权或设备绑定，无法发起扫码');
    return;
  }

  const created = await robotsApi.createRobotAuthSession({
    authId: row.authId,
    deviceId: row.deviceId
  });
  const session = created.qrCodeUrl || created.qrCodeContent ? created : await robotsApi.getRobotAuthSession(created.sessionId);

  const tips = session.qrCodeUrl
    ? `扫码会话已创建，二维码地址：${session.qrCodeUrl}`
    : `扫码会话已创建，会话ID：${session.sessionId}，等待 GUI 上报二维码`;
  ElMessage.success(tips);
  await fetchList();
}

async function removeRobot(row: RobotManagementItem) {
  await ElMessageBox.confirm(`确认删除${meta.value.title}「${row.name}」？`, '删除确认', { type: 'warning' });
  await robotsApi.removeRobot(row.id);
  ElMessage.success('机器人已删除');
  await fetchList();
}

function applyRobotRuntimeRules(item: RobotManagementItem): RobotManagementItem {
  const now = Date.now();
  const expiredTime = new Date(item.expiredAt).getTime();
  const isExpiredNow = Number.isFinite(expiredTime) && expiredTime <= now;

  if (isExpiredNow) {
    return {
      ...item,
      runStatus: 'DISABLED',
      autoStopReason: '到达过期时间后已禁用',
      updatedAt: new Date().toISOString()
    };
  }

  if (item.authStatus === 'AUTH_EXPIRED') {
    return {
      ...item,
      runStatus: 'DISABLED',
      autoStopReason: item.autoStopReason || '授权已失效，机器人已禁用'
    };
  }

  if (item.authStatus === 'UNAUTHORIZED' && item.runStatus === 'RUNNING') {
    return {
      ...item,
      runStatus: 'STOPPED',
      autoStopReason: '未授权时不可运行'
    };
  }

  return item;
}

function isExpired(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function normalizeDateTime(value: string) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toLocalDateTimeValue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function loadPageData() {
  await Promise.all([fetchList(true), fetchPromptConfigs(), fetchCommentDatasets()]);
  if (props.category === 'INTERCEPT' && activeTab.value === 'captures') {
    await fetchCaptureList(true);
  }
}

async function fetchPromptConfigs() {
  if (props.category === 'INTERCEPT') {
    const result = await robotsApi.listInterceptIntentPromptConfigs({ status: 'ENABLED', page: 1, pageSize: 100 });
    promptConfigs.value = result.items;
    return;
  }
  if (!autoReplyModule.value) {
    promptConfigs.value = [];
    return;
  }
  const result = await autoRepliesApi.listPromptConfigs({ module: autoReplyModule.value, status: 'ENABLED', page: 1, pageSize: 100 });
  promptConfigs.value = result.items;
}

async function fetchCommentDatasets() {
  if (props.category !== 'COMMENT') {
    commentDatasets.value = [];
    return;
  }
  const result = await autoRepliesApi.listCommentReplyDatasets({ page: 1, pageSize: 100 });
  commentDatasets.value = result.items;
}


function buildRobotConfig(payload: RobotManagementFormModel): Record<string, unknown> {
  const config: Record<string, unknown> = { runtimePolicy: normalizeRuntimePolicy(payload.runtimePolicy) };
  if (props.category === 'INTERCEPT') {
    config.intercept = normalizeInterceptConfig(payload.interceptConfig);
  }
  return config;
}

function buildRobotPayload(payload: RobotManagementFormModel): robotsApi.RobotPayload {
  return {
    name: payload.name.trim(),
    type: mapCategoryToBackendType(props.category),
    platform: payload.platform || 'DOUYIN',
    expireAt: normalizeDateTime(payload.expiredAt),
    config: buildRobotConfig(payload),
    remark: payload.remark.trim() || undefined
  };
}

function buildRobotSettingPayload(payload: RobotManagementFormModel, module: AutoReplyModule): RobotAutoReplySettingPayload {
  return {
    module,
    promptConfigId: payload.promptConfigId,
    promptSnapshot: payload.promptSnapshot,
    commentReplyMode: module === 'comment' ? payload.commentReplyMode : undefined,
    replyDatasetId: module === 'comment' ? payload.replyDatasetId || undefined : undefined,
    enableFirstReply: module === 'dm' ? payload.enableFirstReply : false,
    firstReplyContents: module === 'dm' ? payload.firstReplyContents.map((item) => item.trim()).filter(Boolean) : [],
    useConversationContext: module === 'dm' ? payload.useConversationContext : true,
    config: {
      ...payload.autoReplySettingConfig,
      aiBinding: normalizeAiBinding(payload.aiBinding)
    }
  };
}

function promptSnapshotToPromptConfigPayload(snapshot: AutoReplyPromptSnapshot, module: AutoReplyModule): Partial<AutoReplyPromptConfigPayload> {
  return {
    module,
    name: snapshot.name,
    customSystemPrompt: snapshot.customSystemPrompt,
    customUserPrompt: snapshot.customUserPrompt,
    forbiddenWords: snapshot.forbiddenWords,
    requiredWords: snapshot.requiredWords,
    replyStyle: snapshot.replyStyle,
    platformLabel: snapshot.platformLabel,
    accountPositioning: snapshot.accountPositioning,
    businessProfile: snapshot.businessProfile,
    goal: snapshot.goal,
    policy: snapshot.policy,
    safetyPolicy: snapshot.safetyPolicy,
    replyLength: snapshot.replyLength,
    maxMsgCount: module === 'dm' ? snapshot.maxMsgCount : undefined,
    extraParams: {
      ...(snapshot.extraParams ?? {}),
      ...(module === 'comment' ? { POST_CONTEXT: String(snapshot.extraParams?.POST_CONTEXT ?? '') } : {}),
      WORKFLOW_MODE: String(snapshot.workflowMode ?? snapshot.extraParams?.WORKFLOW_MODE ?? 'DEFAULT'),
      WORKFLOW_ID: String(snapshot.workflowId ?? snapshot.extraParams?.WORKFLOW_ID ?? ''),
      WORKFLOW_BOT_ID: String(snapshot.workflowBotId ?? snapshot.extraParams?.WORKFLOW_BOT_ID ?? ''),
      WORKFLOW_INPUT_KEY: String(snapshot.workflowInputKey ?? snapshot.extraParams?.WORKFLOW_INPUT_KEY ?? 'input')
    }
  };
}

function normalizeRobotManagementItem(item: robotsApi.RobotItem): RobotManagementItem {
  const config = normalizeConfig(item.config);
  const auth = item.auth ?? {};
  const device = item.device ?? {};
  const authStatus = mapAuthStatus(readString(auth, ['status']));
  const deviceStatus = readString(device, ['status']);
  const module = mapBackendTypeToModule(item.type);
  const autoReplyConfig = module ? readAutoReplyConfig(config, module) : {};
  const autoReplySettingConfig = readObject(autoReplyConfig, ['config']);

  return applyRobotRuntimeRules({
    id: item.id,
    name: item.name || '--',
    code: item.code || item.id.slice(0, 8),
    category: mapBackendTypeToCategory(item.type),
    backendType: mapRobotType(item.type),
    platform: mapPlatform(item.platform),
    scope: readString(config, ['scope', 'scene', 'description']),
    authStatus,
    runStatus: mapRunStatus(item.status, item.expireAt, authStatus, deviceStatus),
    accountName: readString(auth, ['accountName', 'name', 'displayName']) || '--',
    authId: item.authId || '',
    deviceId: item.deviceId || '',
    deviceName: readString(device, ['name', 'deviceCode']) || '--',
    expiredAt: item.expireAt || '',
    authorizedAt: readString(auth, ['authorizedAt']),
    lastActiveAt: readString(item as unknown as Record<string, unknown>, ['lastActiveAt', 'updatedAt']) || item.updatedAt,
    qrUpdatedAt: readString(auth, ['updatedAt', 'qrUpdatedAt']),
    autoStopReason: resolveAutoStopReason(authStatus, item.expireAt),
    replyKeyword: readKeywords(config),
    remark: item.remark || '',
    promptConfigId: readString(autoReplyConfig, ['promptConfigId']),
    promptSnapshot: readObject(autoReplyConfig, ['promptSnapshot']) as AutoReplyPromptSnapshot,
    commentReplyMode: (readString(autoReplyConfig, ['commentReplyMode']) || 'ALL_UNREPLIED') as CommentReplyMode,
    replyDatasetId: readString(autoReplyConfig, ['replyDatasetId']),
    enableFirstReply: autoReplyConfig.enableFirstReply === true,
    firstReplyContents: Array.isArray(autoReplyConfig.firstReplyContents) ? autoReplyConfig.firstReplyContents.map((value) => String(value)) : [],
    useConversationContext: autoReplyConfig.useConversationContext !== false,
    aiBinding: normalizeAiBinding(readObject(autoReplySettingConfig, ['aiBinding'])),
    autoReplySettingConfig,
    runtimePolicy: normalizeRuntimePolicy(config.runtimePolicy),
    interceptConfig: normalizeInterceptConfig(readObject(config, ['intercept'])),
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || ''
  });
}

function normalizeAiBinding(source?: Partial<RobotAiBinding> | Record<string, unknown>, defaultProvider: RobotAiBinding['provider'] = 'COZE'): RobotAiBinding {
  const record = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const provider = String(record.provider || defaultProvider).toUpperCase() === 'DEEPSEEK' ? 'DEEPSEEK' : 'COZE';
  return {
    provider,
    accountProfileId: String(record.accountProfileId || '').trim(),
    fallbackToCoze: record.fallbackToCoze !== false,
    assetIds: Array.isArray(record.assetIds) ? record.assetIds.map((item) => String(item || '').trim()).filter(Boolean) : []
  };
}


function normalizeInterceptConfig(source?: Partial<InterceptRobotConfig> | Record<string, unknown>): InterceptRobotConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_CONFIG)) as InterceptRobotConfig;
  const raw = (source && typeof source === 'object' ? source : {}) as Partial<InterceptRobotConfig>;
  const targetMode = raw.targetMode === 'content' ? 'content' : 'homepage';
  const homepageTargets = normalizeInterceptTargets(raw.homepageTargets, '主页');
  const contentTargets = normalizeInterceptTargets(raw.contentTargets, '作品');
  const schedule = (raw.schedule && typeof raw.schedule === 'object' ? raw.schedule : {}) as Partial<InterceptRobotConfig['schedule']>;
  const collect = (raw.collect && typeof raw.collect === 'object' ? raw.collect : {}) as Partial<InterceptRobotConfig['collect']>;
  const intentAnalysis = raw.intentAnalysis && typeof raw.intentAnalysis === 'object' ? raw.intentAnalysis : {};
  const workDecision = raw.workDecision && typeof raw.workDecision === 'object' ? raw.workDecision : {};
  const speech = raw.speech && typeof raw.speech === 'object' ? raw.speech : {};
  return {
    aiBinding: normalizeAiBinding(raw.aiBinding, 'DEEPSEEK'),
    targetMode,
    homepageTargets,
    contentTargets,
    homepageLookbackDays: Math.max(1, Number(raw.homepageLookbackDays || base.homepageLookbackDays)),
    schedule: {
      timezone: String(schedule.timezone || base.schedule.timezone),
      anchorDate: schedule.anchorDate ? String(schedule.anchorDate) : undefined,
      runEveryDays: Math.max(1, Number(schedule.runEveryDays || base.schedule.runEveryDays || 3)),
      runWindows: Array.isArray(schedule.runWindows) && schedule.runWindows.length
        ? schedule.runWindows.map((item, index) => ({
            name: item?.name || `时间段 ${index + 1}`,
            start: String(item?.start || '19:00'),
            end: String(item?.end || '00:00'),
            enabled: item?.enabled !== false
          }))
        : base.schedule.runWindows
    },
    intentAnalysis: {
      promptConfigId: String((intentAnalysis as any).promptConfigId || ''),
      promptConfigName: String((intentAnalysis as any).promptConfigName || ''),
      workflowId: String((intentAnalysis as any).workflowId || ''),
      batchSize: (intentAnalysis as any).batchSize ? Number((intentAnalysis as any).batchSize) : undefined,
      useTenantDefault: false
    },
    workDecision: {
      enabled: (workDecision as any).enabled !== false,
      workflowId: String((workDecision as any).workflowId || base.workDecision.workflowId || ''),
      failStrategy: (workDecision as any).failStrategy === 'RUN' ? 'RUN' : 'SKIP'
    },
    speech: {
      enabled: (speech as any).enabled !== false,
      failStrategy: (speech as any).failStrategy === 'RUN' ? 'RUN' : 'SKIP',
      emptyTranscriptStrategy: (speech as any).emptyTranscriptStrategy === 'RUN' ? 'RUN' : 'SKIP'
    },
    collect: {
      maxPosts: Math.max(0, Number(collect.maxPosts ?? base.collect.maxPosts)),
      maxCommentsPerPost: Math.max(0, Number(collect.maxCommentsPerPost ?? base.collect.maxCommentsPerPost)),
      captureSeconds: Math.max(3, Number(collect.captureSeconds ?? base.collect.captureSeconds)),
      triggerScrollRounds: Math.max(0, Number(collect.triggerScrollRounds ?? base.collect.triggerScrollRounds)),
      triggerPauseSec: Math.max(0.5, Number(collect.triggerPauseSec ?? base.collect.triggerPauseSec)),
      pacingProfile: collect.pacingProfile === 'conservative' || collect.pacingProfile === 'efficient' ? collect.pacingProfile : 'balanced',
      saveDebugFiles: collect.saveDebugFiles === true,
      headless: collect.headless === true,
      maxTargetMinutes: Math.max(1, Number(collect.maxTargetMinutes ?? base.collect.maxTargetMinutes ?? 30)),
      randomizeTargets: collect.randomizeTargets !== false,
      commentFetchMaxSeconds: Math.max(0, Number(collect.commentFetchMaxSeconds ?? base.collect.commentFetchMaxSeconds ?? 0)),
      postCooldownMinSec: Math.max(0, Number(collect.postCooldownMinSec ?? base.collect.postCooldownMinSec ?? 0)),
      postCooldownMaxSec: Math.max(
        Math.max(0, Number(collect.postCooldownMinSec ?? base.collect.postCooldownMinSec ?? 0)),
        Number(collect.postCooldownMaxSec ?? base.collect.postCooldownMaxSec ?? 0)
      ),
      accountCooldownMinSec: Math.max(0, Number(collect.accountCooldownMinSec ?? base.collect.accountCooldownMinSec ?? 0)),
      accountCooldownMaxSec: Math.max(
        Math.max(0, Number(collect.accountCooldownMinSec ?? base.collect.accountCooldownMinSec ?? 0)),
        Number(collect.accountCooldownMaxSec ?? base.collect.accountCooldownMaxSec ?? 0)
      ),
      commentPagePauseMinSec: Math.max(0, Number(collect.commentPagePauseMinSec ?? (collect as any).commentPageIntervalMinSec ?? base.collect.commentPagePauseMinSec ?? 1)),
      commentPagePauseMaxSec: Math.max(
        Math.max(0, Number(collect.commentPagePauseMinSec ?? (collect as any).commentPageIntervalMinSec ?? base.collect.commentPagePauseMinSec ?? 1)),
        Number(collect.commentPagePauseMaxSec ?? (collect as any).commentPageIntervalMaxSec ?? base.collect.commentPagePauseMaxSec ?? 2.2)
      ),
      maxPostDurationSeconds: Math.max(0, Number((collect as any).maxPostDurationSeconds ?? (collect as any).maxPostDurationSec ?? base.collect.maxPostDurationSeconds ?? 0))
    }
  };
}

function normalizeInterceptTargets(value: unknown, labelPrefix: string) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const url = item.trim();
        return url ? { url, accountName: `${labelPrefix}${index + 1}`, label: `${labelPrefix}${index + 1}`, enabled: true } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const rawItem = item as { url?: unknown; link?: unknown; homepageUrl?: unknown; contentUrl?: unknown; accountName?: unknown; label?: unknown; name?: unknown; enabled?: unknown };
      const url = String(rawItem.url ?? rawItem.link ?? rawItem.homepageUrl ?? rawItem.contentUrl ?? '').trim();
      if (!url) return null;
      const accountName = String(rawItem.accountName ?? rawItem.label ?? rawItem.name ?? '').trim();
      return { url, accountName, label: accountName || `${labelPrefix}${index + 1}`, enabled: rawItem.enabled !== false };
    })
    .filter(Boolean);
}

function mapCategoryToBackendType(category: RobotCategory): RobotBackendType {
  if (category === 'COMMENT') return 'COMMENT_REPLY';
  return category;
}

function mapBackendTypeToCategory(type: string): RobotCategory {
  if (type === 'COMMENT_REPLY') return 'COMMENT';
  if (type === 'INTERCEPT') return 'INTERCEPT';
  return 'PRIVATE_MESSAGE';
}

function mapBackendTypeToModule(type: string): AutoReplyModule | undefined {
  if (type === 'COMMENT_REPLY') return 'comment';
  if (type === 'PRIVATE_MESSAGE') return 'dm';
  return undefined;
}

function mapRobotType(type: string): RobotBackendType {
  if (type === 'COMMENT_REPLY') return 'COMMENT_REPLY';
  if (type === 'INTERCEPT') return 'INTERCEPT';
  return 'PRIVATE_MESSAGE';
}

function mapPlatform(platform: string): RobotManagementItem['platform'] {
  if (platform === 'KUAISHOU' || platform === 'XIAOHONGSHU' || platform === 'WECHAT' || platform === 'WECHAT_VIDEO') {
    return platform;
  }
  return 'DOUYIN';
}

function mapAuthStatus(status: string): RobotAuthStatus {
  if (status === 'AUTHORIZED') return 'AUTHORIZED';
  if (status === 'WAIT_QR' || status === 'SCANNING') return 'PENDING_QR';
  if (status === 'AUTH_EXPIRED') return 'AUTH_EXPIRED';
  return 'UNAUTHORIZED';
}

function mapRunStatus(status: string, expiredAt?: string, authStatus?: RobotAuthStatus, deviceStatus?: string): RobotRunStatus {
  if (isExpired(expiredAt || '') || status === 'DISABLED' || status === 'EXPIRED' || deviceStatus === 'DISABLED') {
    return 'DISABLED';
  }
  if (status === 'RUNNING') return 'RUNNING';
  if (deviceStatus === 'BUSY') return 'RUNNING';
  if (status === 'STOPPED' || status === 'READY' || status === 'DRAFT') return 'STOPPED';
  if (deviceStatus === 'ONLINE' || deviceStatus === 'OFFLINE') return 'STOPPED';
  if (authStatus === 'AUTHORIZED') return 'STOPPED';
  return 'STOPPED';
}

function normalizeConfig(config: Record<string, unknown> | undefined) {
  if (!config) return {};
  const raw = (config as unknown as { value?: unknown }).value;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed;
    } catch {
      return {};
    }
  }
  return config;
}

function readAutoReplyConfig(config: Record<string, unknown>, module: AutoReplyModule) {
  const autoReply = readObject(config, ['autoReply']);
  return readObject(autoReply, [module]);
}

function readKeywords(config: Record<string, unknown>) {
  const keywords = config.keywords;
  if (Array.isArray(keywords)) {
    return keywords.map((item) => String(item).trim()).filter(Boolean).join(',');
  }
  if (typeof keywords === 'string') {
    return keywords;
  }
  return '';
}

function resolveAutoStopReason(authStatus: RobotAuthStatus, expiredAt?: string) {
  if (isExpired(expiredAt || '')) return '到达过期时间后已禁用';
  if (authStatus === 'AUTH_EXPIRED') return '授权已失效，机器人已禁用';
  return '';
}

function promptName(id?: string) {
  if (!id) return '';
  return promptConfigs.value.find((item) => item.id === id)?.name || '';
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function readObject(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return {} as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {} as Record<string, unknown>;
}
</script>
