<template>
  <div class="space-y-4">
    <PageToolbar title="测试数据管理" description="用明确的测试批次收纳成员、团队、任务及其订单/佣金/流水；清理只处理同一批次，不递归扫描其他历史数据。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-form-item label="租户" class="!mb-0"><el-select v-model="filters.tenantId" clearable filterable placeholder="全部租户"><el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="状态" class="!mb-0"><el-select v-model="filters.status" clearable placeholder="全部状态"><el-option label="进行中" value="ACTIVE"/><el-option label="已归档" value="ARCHIVED"/><el-option label="已清理" value="PURGED"/></el-select></el-form-item>
        <el-form-item label="关键词" class="!mb-0"><el-input v-model="filters.keyword" clearable placeholder="批次名称或用途" @keyup.enter="fetchList(true)" /></el-form-item>
        <el-form-item label="操作" class="!mb-0"><div class="flex gap-2"><el-button type="primary" @click="fetchList(true)">查询</el-button><el-button @click="resetFilters">重置</el-button></div></el-form-item>
      </el-form>
      <template #actions><el-button type="primary" @click="openCreate">创建测试批次</el-button></template>
    </PageToolbar>

    <el-alert type="warning" :closable="false" title="测试批次应只纳入专用测试成员、专用测试团队和测试任务。批次清理不会删除 H5 用户账号或团队档案，但会清理本批次任务、订单、佣金、流水和模拟提现；真实外部付款仍必须人工处理。" />

    <CrudTablePanel title="测试批次" description="先创建批次，再明确纳入测试成员和团队；创建任务时选择该批次即可形成可解释、可清理的数据范围。">
      <el-table v-loading="loading" :data="items" row-key="id" stripe>
        <el-table-column label="批次名称" min-width="210"><template #default="{ row }"><div class="font-medium">{{ row.name }}</div><div class="text-xs text-slate-500">{{ row.purpose || '未填写用途' }}</div></template></el-table-column>
        <el-table-column label="租户" min-width="160"><template #default="{ row }">{{ row.tenant?.name || tenantName(row.tenantId) }}</template></el-table-column>
        <el-table-column label="范围" width="200"><template #default="{ row }"><span>成员 {{ row._count?.users || 0 }}</span><span class="mx-2 text-slate-300">·</span><span>团队 {{ row._count?.groups || 0 }}</span><span class="mx-2 text-slate-300">·</span><span>任务 {{ row._count?.tasks || 0 }}</span></template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="batchTagType(row.status)">{{ batchStatusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="创建时间" width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" fixed="right" width="260"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">管理范围</el-button><el-button v-if="row.status === 'ACTIVE'" link type="warning" @click="archive(row)">归档</el-button><el-button v-if="row.status === 'ARCHIVED'" link type="success" @click="activate(row)">恢复</el-button><el-button v-if="row.status !== 'PURGED'" link type="danger" @click="openPurge(row)">清理批次</el-button></template></el-table-column>
      </el-table>
      <template #footer><CrudPaginationBar :current-page="pagination.page" :page-size="pagination.pageSize" :total="pagination.total" @update:current-page="pagination.page = $event; fetchList()" @update:page-size="pagination.pageSize = $event; fetchList(true)" /></template>
    </CrudTablePanel>

    <el-dialog v-model="createVisible" title="创建测试批次" width="680px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="所属租户" prop="tenantId"><el-select v-model="createForm.tenantId" filterable class="w-full"><el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="批次名称" prop="name"><el-input v-model="createForm.name" maxlength="120" placeholder="例如：2026-07 团长分佣联调" /></el-form-item>
        <el-form-item label="测试用途"><el-input v-model="createForm.purpose" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="说明本轮测试覆盖的业务与数据边界" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="createSubmitting" @click="submitCreate">创建批次</el-button></template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="detail ? `测试批次：${detail.name}` : '测试批次详情'" width="1120px" destroy-on-close>
      <template v-if="detail">
        <el-alert :type="detail.status === 'ACTIVE' ? 'info' : 'warning'" :closable="false" :title="detail.status === 'ACTIVE' ? '进行中的批次可继续纳入成员、团队和创建测试任务。' : detail.status === 'ARCHIVED' ? '已归档批次不能再纳入新数据，但仍可查看并清理。' : '该批次已清理，只保留审计信息。'" class="mb-4" />
        <div class="preview-grid mb-4">
          <div><span>任务</span><strong>{{ detail.preview.taskCount }}</strong></div><div><span>任务订单</span><strong>{{ detail.preview.participantCount }}</strong></div><div><span>佣金</span><strong>{{ detail.preview.commissionSettlementCount }}</strong></div><div><span>钱包流水</span><strong>{{ detail.preview.walletLedgerCount }}</strong></div><div><span>提现</span><strong>{{ detail.preview.withdrawalCount }}</strong></div>
        </div>
        <el-tabs v-model="detailTab">
          <el-tab-pane label="测试成员" name="users">
            <div class="mb-3"><el-button v-if="detail.status === 'ACTIVE'" type="primary" plain @click="openUserPicker">纳入测试成员</el-button></div>
            <el-table :data="detail.users" size="small" max-height="310"><el-table-column label="成员" min-width="180"><template #default="{ row }">{{ row.appUser?.nickname || '--' }} <span class="text-slate-400">{{ row.appUser?.phone || '' }}</span></template></el-table-column><el-table-column prop="role" label="批次角色" width="120"/><el-table-column label="操作" width="100"><template #default="{ row }"><el-button v-if="detail?.status === 'ACTIVE'" link type="danger" @click="removeUser(row.appUserId)">移出</el-button></template></el-table-column></el-table>
          </el-tab-pane>
          <el-tab-pane label="测试团队" name="groups">
            <div class="mb-3"><el-button v-if="detail.status === 'ACTIVE'" type="primary" plain @click="openGroupPicker">纳入测试团队</el-button></div>
            <el-table :data="detail.groups" size="small" max-height="310"><el-table-column label="团队" min-width="220"><template #default="{ row }">{{ row.group?.name || row.groupId }}</template></el-table-column><el-table-column label="团长" min-width="180"><template #default="{ row }">{{ row.group?.leaderName || '待绑定' }} {{ row.group?.leaderPhone || '' }}</template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }">{{ row.group?.status || '--' }}</template></el-table-column><el-table-column label="操作" width="100"><template #default="{ row }"><el-button v-if="detail?.status === 'ACTIVE'" link type="danger" @click="removeGroup(row.groupId)">移出</el-button></template></el-table-column></el-table>
          </el-tab-pane>
          <el-tab-pane label="清理预演" name="preview">
            <el-alert v-if="detail.preview.blockers.length" type="error" :closable="false" class="mb-4"><template #title>当前不能清理</template><ul class="pl-4"><li v-for="item in detail.preview.blockers" :key="item">{{ item }}</li></ul></el-alert>
            <el-alert v-else type="success" :closable="false" title="批次范围已明确，可以执行批次清理。不会扫描同租户的其他成员、团队或任务。" class="mb-4" />
            <el-table :data="detail.preview.tasks" size="small" max-height="300"><el-table-column prop="title" label="本批次任务" min-width="260"/><el-table-column prop="status" label="状态" width="110"/><el-table-column prop="distributionScope" label="投放范围" width="120"/></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
      <template #footer><el-button @click="detailVisible = false">关闭</el-button><el-button v-if="detail && detail.status !== 'PURGED'" type="danger" @click="openPurge(detail)">清理此批次</el-button></template>
    </el-dialog>

    <el-dialog v-model="pickerVisible" :title="pickerMode === 'users' ? '纳入测试成员' : '纳入测试团队'" width="900px" destroy-on-close>
      <el-alert type="warning" :closable="false" title="请只选择本轮专用测试数据。纳入后，新建测试任务只允许这些成员领取；团队团长会自动作为批次成员纳入。" class="mb-4" />
      <el-table v-if="pickerMode === 'users'" ref="userPickerRef" :data="candidateUsers" row-key="id" max-height="360" @selection-change="selectedCandidateUsers = $event"><el-table-column type="selection" width="50"/><el-table-column label="昵称" min-width="180"><template #default="{ row }">{{ row.nickname || '--' }}</template></el-table-column><el-table-column prop="phone" label="手机号" min-width="160"/><el-table-column label="当前团队" min-width="200"><template #default="{ row }">{{ row.distributionLeaders?.[0]?.groupName || '--' }}</template></el-table-column></el-table>
      <el-table v-else ref="groupPickerRef" :data="candidateGroups" row-key="id" max-height="360" @selection-change="selectedCandidateGroups = $event"><el-table-column type="selection" width="50"/><el-table-column prop="name" label="团队" min-width="230"/><el-table-column prop="leaderName" label="团长" min-width="160"/><el-table-column prop="leaderPhone" label="手机号" min-width="160"/></el-table>
      <template #footer><el-button @click="pickerVisible = false">取消</el-button><el-button type="primary" :loading="pickerSubmitting" @click="confirmPicker">纳入所选数据</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { useRoute } from 'vue-router';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import * as testBatchesApi from '@/api/modules/testDataBatches';
import * as tenantsApi from '@/api/modules/tenants';
import * as appUsersApi from '@/api/modules/appUsers';
import * as groupsApi from '@/api/modules/distributionGroups';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime } from '@/utils/format';

const route = useRoute();
const tenantOptions = ref<SelectOption[]>([]);
const filters = reactive({ tenantId: '', status: '', keyword: '' });
const items = ref<testBatchesApi.TestDataBatchItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });
const loading = ref(false);
const createVisible = ref(false);
const createSubmitting = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({ tenantId: '', name: '', purpose: '' });
const createRules: FormRules = { tenantId: [{ required: true, message: '请选择租户', trigger: 'change' }], name: [{ required: true, message: '请输入测试批次名称', trigger: 'blur' }] };
const detailVisible = ref(false);
const detail = ref<testBatchesApi.TestDataBatchDetail | null>(null);
const detailTab = ref('users');
const pickerVisible = ref(false);
const pickerMode = ref<'users' | 'groups'>('users');
const candidateUsers = ref<appUsersApi.AppUserItem[]>([]);
const candidateGroups = ref<groupsApi.DistributionGroupItem[]>([]);
const selectedCandidateUsers = ref<appUsersApi.AppUserItem[]>([]);
const selectedCandidateGroups = ref<groupsApi.DistributionGroupItem[]>([]);
const pickerSubmitting = ref(false);

onMounted(async () => {
  tenantOptions.value = await tenantsApi.getTenantOptions();
  await fetchList(true);
  await openDetailFromRoute();
});

watch(
  () => route.query.batchId,
  () => { void openDetailFromRoute(); },
);

async function openDetailFromRoute() {
  const batchId = String(route.query.batchId || '').trim();
  if (!batchId || detail.value?.id === batchId) return;
  try {
    detail.value = await testBatchesApi.getTestDataBatch(batchId);
    detailVisible.value = true;
    detailTab.value = 'users';
  } catch {
    // 路由可能来自已被清理或无权限批次；列表页仍可正常使用。
  }
}
async function fetchList(reset = false) { if (reset) pagination.page = 1; loading.value = true; try { const page = await testBatchesApi.listTestDataBatches({ tenantId: filters.tenantId || undefined, status: filters.status || undefined, keyword: filters.keyword || undefined, page: pagination.page, pageSize: pagination.pageSize }); items.value = page.items; pagination.total = page.total; } finally { loading.value = false; } }
function resetFilters() { filters.tenantId = ''; filters.status = ''; filters.keyword = ''; void fetchList(true); }
function tenantName(id: string) { return tenantOptions.value.find((item) => item.value === id)?.label || '--'; }
function batchStatusLabel(status: string) { return status === 'ACTIVE' ? '进行中' : status === 'ARCHIVED' ? '已归档' : status === 'PURGED' ? '已清理' : status || '--'; }
function batchTagType(status: string) { return status === 'ACTIVE' ? 'success' : status === 'PURGED' ? 'info' : 'warning'; }
function openCreate() { Object.assign(createForm, { tenantId: filters.tenantId || '', name: '', purpose: '' }); createVisible.value = true; }
async function submitCreate() { await createFormRef.value?.validate(); createSubmitting.value = true; try { const batch = await testBatchesApi.createTestDataBatch({ ...createForm }); ElMessage.success('测试批次已创建，请先纳入本轮测试成员和团队'); createVisible.value = false; await fetchList(); await openDetail(batch); } finally { createSubmitting.value = false; } }
async function openDetail(batch: testBatchesApi.TestDataBatchItem) { detail.value = await testBatchesApi.getTestDataBatch(batch.id); detailVisible.value = true; detailTab.value = 'users'; }
async function refreshDetail() { if (detail.value) detail.value = await testBatchesApi.getTestDataBatch(detail.value.id); }
async function archive(batch: testBatchesApi.TestDataBatchItem) { await ElMessageBox.confirm(`归档“${batch.name}”后不能再纳入成员、团队或创建新的测试任务。确认归档？`, '归档测试批次', { type: 'warning' }); await testBatchesApi.updateTestDataBatch(batch.id, { status: 'ARCHIVED' }); ElMessage.success('测试批次已归档'); await fetchList(); if (detail.value?.id === batch.id) await refreshDetail(); }
async function activate(batch: testBatchesApi.TestDataBatchItem) { await testBatchesApi.updateTestDataBatch(batch.id, { status: 'ACTIVE' }); ElMessage.success('测试批次已恢复'); await fetchList(); if (detail.value?.id === batch.id) await refreshDetail(); }
async function openUserPicker() { if (!detail.value) return; pickerMode.value = 'users'; selectedCandidateUsers.value = []; const page = await appUsersApi.listAppUsers({ tenantId: detail.value.tenantId, memberOnly: 'true', page: 1, pageSize: 200 }); const existing = new Set(detail.value.users.map((item) => item.appUserId)); candidateUsers.value = page.items.filter((item) => !existing.has(item.id)); pickerVisible.value = true; }
async function openGroupPicker() { if (!detail.value) return; pickerMode.value = 'groups'; selectedCandidateGroups.value = []; const page = await groupsApi.listDistributionGroups({ tenantId: detail.value.tenantId, page: 1, pageSize: 200 }); const existing = new Set(detail.value.groups.map((item) => item.groupId)); candidateGroups.value = page.items.filter((item) => !existing.has(item.id) && item.status === 'ENABLED' && !item.deletedAt); pickerVisible.value = true; }
async function confirmPicker() { if (!detail.value) return; const ids = pickerMode.value === 'users' ? selectedCandidateUsers.value.map((item) => item.id) : selectedCandidateGroups.value.map((item) => item.id); if (!ids.length) { ElMessage.warning('请至少选择一条数据'); return; } pickerSubmitting.value = true; try { if (pickerMode.value === 'users') await testBatchesApi.bindTestDataBatchUsers(detail.value.id, ids); else await testBatchesApi.bindTestDataBatchGroups(detail.value.id, ids); ElMessage.success('已纳入测试批次'); pickerVisible.value = false; await refreshDetail(); await fetchList(); } finally { pickerSubmitting.value = false; } }
async function removeUser(appUserId: string) { if (!detail.value) return; await ElMessageBox.confirm('移出后该成员不能再领取本批次后续创建的任务。若已产生本批次任务记录，系统会阻止移出。确认继续？', '移出测试成员', { type: 'warning' }); await testBatchesApi.unbindTestDataBatchUser(detail.value.id, appUserId); ElMessage.success('已移出'); await refreshDetail(); }
async function removeGroup(groupId: string) { if (!detail.value) return; await ElMessageBox.confirm('移出后不能再用该团队创建本批次任务。若已产生本批次任务，系统会阻止移出。确认继续？', '移出测试团队', { type: 'warning' }); await testBatchesApi.unbindTestDataBatchGroup(detail.value.id, groupId); ElMessage.success('已移出'); await refreshDetail(); }
async function openPurge(batch: testBatchesApi.TestDataBatchItem | testBatchesApi.TestDataBatchDetail) { const preview = await testBatchesApi.getTestDataBatchPurgePreview(batch.id); if (!preview.canPurge) { await ElMessageBox.alert(preview.blockers.join('；') || '当前测试批次不能清理', '不能清理测试批次', { type: 'error' }); return; } const { value } = await ElMessageBox.prompt(`将清理本批次内 ${preview.taskCount} 个任务、${preview.participantCount} 条订单、${preview.commissionSettlementCount} 条佣金、${preview.walletLedgerCount} 条流水和 ${preview.withdrawalCount} 笔提现。不会扫描或清理其他批次。请输入确认文本：${preview.confirmText}`, '强制清理测试批次', { type: 'error', inputPlaceholder: preview.confirmText, inputValidator: (text) => String(text || '').trim() === preview.confirmText || '确认文本不匹配' }); await testBatchesApi.forcePurgeTestDataBatch(batch.id, String(value).trim()); ElMessage.success('测试批次已清理'); detailVisible.value = false; await fetchList(); }
</script>

<style scoped>
.preview-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.preview-grid > div { padding: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-fill-color-extra-light); }
.preview-grid span { display: block; color: var(--el-text-color-secondary); font-size: 12px; }
.preview-grid strong { display: block; margin-top: 4px; font-size: 20px; }
@media (max-width: 840px) { .preview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
