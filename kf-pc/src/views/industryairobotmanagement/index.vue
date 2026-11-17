<template>
  <div class="space-y-4">
    <PageToolbar title="行业 AI 机器人" description="独立维护行业能力包、DeepSeek 测试机器人和聊天测试记录；当前不接入任何已有自动回复链路。">
      <template #actions>
        <template v-if="activeTab === 'packs' && can('industry-ai:create')">
          <el-button type="primary" plain @click="handleImportEcommerceTemplate">导入电商事务优先客服种子包</el-button>
          <el-button type="primary" @click="openCreatePack">新建行业能力包</el-button>
        </template>
        <el-button v-if="activeTab === 'robots' && can('industry-ai:create')" type="primary" @click="openCreateRobot">新建行业 AI 机器人</el-button>
      </template>
    </PageToolbar>

    <el-alert
      type="warning"
      :closable="false"
      title="第一阶段仅支持后台聊天测试：DeepSeek 调用、能力包配置和测试会话均使用独立接口与数据表，不会影响现有评论机器人、私信机器人、提示词、回复数据集和 Coze 工作流。"
    />

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="行业能力包" name="packs">
        <CrudTablePanel title="行业能力包" description="优先通过“导入电商事务优先客服种子包”生成草稿，再结合店铺实际处理方式和日常客服口吻调整；机器人只能绑定已发布版本。">
          <template #actions>
            <el-form :model="packFilters" inline class="!mb-0">
              <el-form-item class="!mb-0"><el-input v-model="packFilters.keyword" clearable placeholder="能力包 / 行业" @keyup.enter="fetchPacks(true)" /></el-form-item>
              <el-form-item class="!mb-0">
                <el-select v-model="packFilters.status" clearable placeholder="全部状态" class="w-[130px]">
                  <el-option label="草稿" value="DRAFT" />
                  <el-option label="已发布" value="PUBLISHED" />
                  <el-option label="已归档" value="ARCHIVED" />
                </el-select>
              </el-form-item>
              <el-form-item class="!mb-0"><el-button type="primary" @click="fetchPacks(true)">查询</el-button><el-button @click="resetPackFilters">重置</el-button></el-form-item>
            </el-form>
          </template>

          <el-table v-loading="packLoading" :data="packs" row-key="id" stripe>
            <el-table-column type="index" label="#" width="56" />
            <el-table-column label="行业能力包" min-width="250">
              <template #default="{ row }">
                <div class="font-medium text-slate-800 dark:text-slate-100">{{ row.name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ row.industryName }} · {{ channelLabel(row.channel) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="版本" min-width="170">
              <template #default="{ row }">
                <div>当前草稿：{{ row.latestVersion ? `v${row.latestVersion.versionNo}` : '--' }}</div>
                <div class="mt-1 text-xs text-slate-500">已发布：{{ row.publishedVersion ? `v${row.publishedVersion.versionNo}` : '暂无' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="草稿场景" width="130">
              <template #default="{ row }">
                {{ row.latestVersion?.scenarioCount || row.latestVersion?.scenarios?.length || 0 }} 个
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="packTagType(row.status)" effect="plain">{{ packStatusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="更新时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template></el-table-column>
            <el-table-column label="操作" width="300" fixed="right">
              <template #default="{ row }">
                <el-button v-if="can('industry-ai:update')" link type="primary" @click="openEditPack(row)">编辑</el-button>
                <el-button v-if="can('industry-ai:publish') && row.latestVersion?.status !== 'PUBLISHED'" link type="success" @click="handlePublishPack(row)">发布当前版本</el-button>
                <el-button v-if="can('industry-ai:delete')" link type="danger" @click="handleDeletePack(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <template #footer>
            <CrudPaginationBar
              :current-page="packPagination.page"
              :page-size="packPagination.pageSize"
              :total="packPagination.total"
              @update:current-page="packPagination.page = $event; fetchPacks()"
              @update:page-size="packPagination.pageSize = $event; fetchPacks(true)"
            />
          </template>
        </CrudTablePanel>
      </el-tab-pane>

      <el-tab-pane label="行业 AI 机器人" name="robots">
        <CrudTablePanel title="行业 AI 机器人" description="每个机器人绑定一个已发布的行业能力包版本，先在聊天框中使用 DeepSeek 测试，再进入下一阶段。">
          <template #actions>
            <el-form :model="robotFilters" inline class="!mb-0">
              <el-form-item class="!mb-0"><el-input v-model="robotFilters.keyword" clearable placeholder="机器人名称" @keyup.enter="fetchRobots(true)" /></el-form-item>
              <el-form-item class="!mb-0">
                <el-select v-model="robotFilters.status" clearable placeholder="全部状态" class="w-[130px]">
                  <el-option label="草稿" value="DRAFT" />
                  <el-option label="启用测试" value="ENABLED" />
                  <el-option label="停用" value="DISABLED" />
                </el-select>
              </el-form-item>
              <el-form-item class="!mb-0"><el-button type="primary" @click="fetchRobots(true)">查询</el-button><el-button @click="resetRobotFilters">重置</el-button></el-form-item>
            </el-form>
          </template>
          <el-table v-loading="robotLoading" :data="robots" row-key="id" stripe>
            <el-table-column type="index" label="#" width="56" />
            <el-table-column label="机器人" min-width="230">
              <template #default="{ row }">
                <div class="font-medium text-slate-800 dark:text-slate-100">{{ row.name }}</div>
                <div class="mt-1 line-clamp-1 text-xs text-slate-500">{{ row.remark || row.businessProfile || '暂无说明' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="行业 / 渠道" min-width="180"><template #default="{ row }">{{ row.industryName || row.capabilityPack?.industryName || '--' }} · {{ channelLabel(row.channel) }}</template></el-table-column>
            <el-table-column label="绑定能力包" min-width="200"><template #default="{ row }">{{ packName(row) }}</template></el-table-column>
            <el-table-column label="固定回复" width="100"><template #default="{ row }">{{ row.fixedReplyRuleCount || 0 }} 条</template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="robotTagType(row.status)" effect="plain">{{ robotStatusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="更新时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template></el-table-column>
            <el-table-column label="操作" width="360" fixed="right">
              <template #default="{ row }">
                <el-button v-if="can('industry-ai:test')" link type="success" @click="openTest(row)">聊天测试</el-button>
                <el-button v-if="can('industry-ai:update')" link type="primary" @click="openFixedReplyRules(row)">固定回复</el-button>
                <el-button v-if="can('industry-ai:update')" link type="primary" @click="openEditRobot(row)">编辑</el-button>
                <el-button v-if="can('industry-ai:delete')" link type="danger" @click="handleDeleteRobot(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <template #footer>
            <CrudPaginationBar
              :current-page="robotPagination.page"
              :page-size="robotPagination.pageSize"
              :total="robotPagination.total"
              @update:current-page="robotPagination.page = $event; fetchRobots()"
              @update:page-size="robotPagination.pageSize = $event; fetchRobots(true)"
            />
          </template>
        </CrudTablePanel>
      </el-tab-pane>
    </el-tabs>

    <CapabilityPackDialog v-model="packDialogVisible" :pack="editingPack" :saving="submitting" @submit="handleSavePack" />
    <IndustryAiRobotDialog v-model="robotDialogVisible" :robot="editingRobot" :pack-options="packOptions" :saving="submitting" @submit="handleSaveRobot" />
    <IndustryAiChatTestDrawer v-model="testDrawerVisible" :robot="testingRobot" />
    <IndustryAiFixedReplyRulesDialog
      v-model="fixedReplyDialogVisible"
      :robot="fixedReplyRobot"
      :can-edit="can('industry-ai:update')"
      @changed="fetchRobots"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { formatDateTime } from '@/utils/format';
import * as industryAiApi from '@/api/modules/industryAi';
import type {
  IndustryAiCapabilityPack,
  IndustryAiCapabilityPackOption,
  IndustryAiCapabilityPackPayload,
  IndustryAiPackStatus,
  IndustryAiRobot,
  IndustryAiRobotPayload,
  IndustryAiRobotStatus
} from '@/api/modules/industryAi';
import CapabilityPackDialog from './components/CapabilityPackDialog.vue';
import IndustryAiRobotDialog from './components/IndustryAiRobotDialog.vue';
import IndustryAiChatTestDrawer from './components/IndustryAiChatTestDrawer.vue';
import IndustryAiFixedReplyRulesDialog from './components/IndustryAiFixedReplyRulesDialog.vue';

defineOptions({ name: 'IndustryAiRobotManagementView' });

const auth = useAuthStore();
const activeTab = ref<'packs' | 'robots'>('packs');
const submitting = ref(false);

const packs = ref<IndustryAiCapabilityPack[]>([]);
const packLoading = ref(false);
const packFilters = reactive({ keyword: '', status: '' });
const packPagination = reactive({ page: 1, pageSize: 10, total: 0 });
const packDialogVisible = ref(false);
const editingPack = ref<IndustryAiCapabilityPack | null>(null);

const robots = ref<IndustryAiRobot[]>([]);
const robotLoading = ref(false);
const robotFilters = reactive({ keyword: '', status: '' });
const robotPagination = reactive({ page: 1, pageSize: 10, total: 0 });
const robotDialogVisible = ref(false);
const editingRobot = ref<IndustryAiRobot | null>(null);
const packOptions = ref<IndustryAiCapabilityPackOption[]>([]);

const testDrawerVisible = ref(false);
const testingRobot = ref<IndustryAiRobot | null>(null);
const fixedReplyDialogVisible = ref(false);
const fixedReplyRobot = ref<IndustryAiRobot | null>(null);

function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}

async function fetchPacks(resetPage = false) {
  if (resetPage) packPagination.page = 1;
  packLoading.value = true;
  try {
    const result = await industryAiApi.listIndustryAiCapabilityPacks({
      keyword: packFilters.keyword || undefined,
      status: (packFilters.status || undefined) as IndustryAiPackStatus | undefined,
      page: packPagination.page,
      pageSize: packPagination.pageSize
    });
    packs.value = result.items;
    packPagination.total = result.total;
  } finally {
    packLoading.value = false;
  }
}

async function fetchRobots(resetPage = false) {
  if (resetPage) robotPagination.page = 1;
  robotLoading.value = true;
  try {
    const result = await industryAiApi.listIndustryAiRobots({
      keyword: robotFilters.keyword || undefined,
      status: (robotFilters.status || undefined) as IndustryAiRobotStatus | undefined,
      page: robotPagination.page,
      pageSize: robotPagination.pageSize
    });
    robots.value = result.items;
    robotPagination.total = result.total;
  } finally {
    robotLoading.value = false;
  }
}

async function fetchPackOptions() {
  packOptions.value = await industryAiApi.listIndustryAiCapabilityPackOptions();
}

function resetPackFilters() {
  packFilters.keyword = '';
  packFilters.status = '';
  void fetchPacks(true);
}

function resetRobotFilters() {
  robotFilters.keyword = '';
  robotFilters.status = '';
  void fetchRobots(true);
}

async function handleTabChange(tab: string | number) {
  if (tab === 'robots') {
    await Promise.all([fetchRobots(), fetchPackOptions()]);
  }
}

async function handleImportEcommerceTemplate() {
  try {
    await ElMessageBox.confirm(
      '将创建一份当前租户独立的“电商日常客服 · 事务优先沟通”V3 草稿，包含行业语气、场景、日常客服示例与必要的风险规则。不会自动发布，不会修改现有能力包、机器人或历史数据。导入后只需补充店铺平时如何处理订单、物流、售后等真实说明。',
      '导入电商事务优先客服种子包',
      { type: 'warning', confirmButtonText: '创建草稿', cancelButtonText: '取消' }
    );
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('导入操作未完成');
    return;
  }

  submitting.value = true;
  try {
    const created = await industryAiApi.importIndustryAiCapabilityTemplate({ templateCode: 'ECOMMERCE_NATURAL_SERVICE_V3' });
    editingPack.value = created;
    packDialogVisible.value = true;
    ElMessage.success('电商事务优先客服种子包已创建为草稿，请先补充店铺实际处理说明并完成聊天测试后再发布');
    await fetchPacks(true);
  } catch {
    ElMessage.error('导入电商事务优先客服种子包失败');
  } finally {
    submitting.value = false;
  }
}

function openCreatePack() {
  editingPack.value = null;
  packDialogVisible.value = true;
}

async function openEditPack(row: IndustryAiCapabilityPack) {
  try {
    editingPack.value = await industryAiApi.getIndustryAiCapabilityPack(row.id);
    packDialogVisible.value = true;
  } catch {
    ElMessage.error('加载行业能力包详情失败');
  }
}

async function handleSavePack(payload: IndustryAiCapabilityPackPayload & { versionId?: string }) {
  submitting.value = true;
  try {
    if (editingPack.value) {
      await industryAiApi.updateIndustryAiCapabilityPack(editingPack.value.id, payload);
      ElMessage.success('行业能力包草稿已保存');
    } else {
      await industryAiApi.createIndustryAiCapabilityPack(payload);
      ElMessage.success('行业能力包已创建');
    }
    packDialogVisible.value = false;
    await fetchPacks();
  } finally {
    submitting.value = false;
  }
}

async function handlePublishPack(row: IndustryAiCapabilityPack) {
  const version = row.latestVersion;
  if (!version) {
    ElMessage.warning('当前能力包没有可发布版本');
    return;
  }
  await ElMessageBox.confirm(`发布 ${row.name} v${version.versionNo} 后，新机器人可选择并绑定该版本；已绑定旧版本的机器人不会受影响。`, '确认发布', { type: 'warning' });
  try {
    await industryAiApi.publishIndustryAiCapabilityPack(row.id, version.id);
    ElMessage.success('版本已发布');
    await Promise.all([fetchPacks(), fetchPackOptions()]);
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('发布失败');
  }
}

async function handleDeletePack(row: IndustryAiCapabilityPack) {
  await ElMessageBox.confirm(`删除“${row.name}”后将不能再被新机器人选择；已存在机器人不会自动切换配置。`, '确认删除', { type: 'warning' });
  try {
    await industryAiApi.removeIndustryAiCapabilityPack(row.id);
    ElMessage.success('行业能力包已删除');
    await Promise.all([fetchPacks(), fetchPackOptions()]);
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败');
  }
}

function openCreateRobot() {
  editingRobot.value = null;
  robotDialogVisible.value = true;
  void fetchPackOptions();
}

async function openEditRobot(row: IndustryAiRobot) {
  try {
    const [robot] = await Promise.all([industryAiApi.getIndustryAiRobot(row.id), fetchPackOptions()]);
    editingRobot.value = robot;
    robotDialogVisible.value = true;
  } catch {
    ElMessage.error('加载机器人详情失败');
  }
}

async function handleSaveRobot(payload: IndustryAiRobotPayload) {
  submitting.value = true;
  try {
    if (editingRobot.value) {
      await industryAiApi.updateIndustryAiRobot(editingRobot.value.id, payload);
      ElMessage.success('行业 AI 机器人已保存');
    } else {
      await industryAiApi.createIndustryAiRobot(payload);
      ElMessage.success('行业 AI 机器人已创建');
    }
    robotDialogVisible.value = false;
    await fetchRobots();
  } finally {
    submitting.value = false;
  }
}

async function handleDeleteRobot(row: IndustryAiRobot) {
  await ElMessageBox.confirm(`删除“${row.name}”只会删除该新行业 AI 机器人，不会影响已有评论机器人或私信机器人。`, '确认删除', { type: 'warning' });
  try {
    await industryAiApi.removeIndustryAiRobot(row.id);
    ElMessage.success('行业 AI 机器人已删除');
    await fetchRobots();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败');
  }
}

async function openTest(row: IndustryAiRobot) {
  try {
    testingRobot.value = await industryAiApi.getIndustryAiRobot(row.id);
    testDrawerVisible.value = true;
  } catch {
    ElMessage.error('加载机器人测试配置失败');
  }
}

async function openFixedReplyRules(row: IndustryAiRobot) {
  try {
    fixedReplyRobot.value = await industryAiApi.getIndustryAiRobot(row.id);
    fixedReplyDialogVisible.value = true;
  } catch {
    ElMessage.error('加载店铺固定回复配置失败');
  }
}

function channelLabel(channel?: string) {
  if (channel === 'COMMENT') return '评论';
  if (channel === 'BOTH') return '评论和私信';
  return '私信';
}

function packName(row: IndustryAiRobot) {
  const name = row.capabilityPack?.name || '未加载能力包';
  const version = row.capabilityPackVersion?.versionNo;
  return version ? `${name} v${version}` : name;
}


function packStatusLabel(status?: string) {
  return status === 'PUBLISHED' ? '已发布' : status === 'ARCHIVED' ? '已归档' : '草稿';
}

function packTagType(status?: string) {
  return status === 'PUBLISHED' ? 'success' : status === 'ARCHIVED' ? 'info' : 'warning';
}

function robotStatusLabel(status?: string) {
  return status === 'ENABLED' ? '启用测试' : status === 'DISABLED' ? '停用' : '草稿';
}

function robotTagType(status?: string) {
  return status === 'ENABLED' ? 'success' : status === 'DISABLED' ? 'info' : 'warning';
}

onMounted(async () => {
  await Promise.all([fetchPacks(), fetchPackOptions()]);
});
</script>
