<template>
  <div class="inquiry-page">
    <section class="inquiry-hero">
      <div class="hero-copy">
        <div class="hero-eyebrow"><span class="eyebrow-dot"></span> WEBSITE LEAD DESK</div>
        <h1>官网意向客户</h1>
        <p>官网「联系我们」提交后会实时进入这里。先处理未读咨询，再登记沟通结果与下一步计划，原始提交内容始终保留。</p>
        <div class="hero-tags"><span>独立权限</span><span>原始快照</span><span>跟进留痕</span></div>
      </div>
      <div class="hero-actions">
        <el-button :icon="Refresh" :loading="loading" @click="refreshAll">刷新数据</el-button>
        <el-button type="primary" @click="router.push('/website/content')">管理官网内容</el-button>
      </div>
    </section>

    <el-tabs v-model="listMode" class="view-tabs" @tab-change="handleListModeChange">
      <el-tab-pane label="意向客户" name="ACTIVE" />
      <el-tab-pane label="意向客户回收站" name="TRASH" />
    </el-tabs>

    <section v-if="!isTrash" class="metric-grid" aria-label="官网咨询概览">
      <button class="metric-card metric-card--primary" :class="{ active: scope === 'ALL' }" @click="setScope('ALL')">
        <span class="metric-label">全部官网咨询</span><strong>{{ summary.total }}</strong><span class="metric-note">近 7 天新增 {{ summary.lastSevenDays }} 条</span>
      </button>
      <button class="metric-card metric-card--danger" :class="{ active: scope === 'UNREAD' }" @click="setScope('UNREAD')">
        <span class="metric-label">等待查看</span><strong>{{ summary.unread }}</strong><span class="metric-note">建议优先处理的新咨询</span>
      </button>
      <button class="metric-card metric-card--amber" :class="{ active: scope === 'PENDING' }" @click="setScope('PENDING')">
        <span class="metric-label">待首次联系</span><strong>{{ summary.pendingContact }}</strong><span class="metric-note">今天新提交 {{ summary.today }} 条</span>
      </button>
      <button class="metric-card metric-card--green" :class="{ active: scope === 'HIGH' }" @click="setScope('HIGH')">
        <span class="metric-label">高优先级推进</span><strong>{{ summary.highValue }}</strong><span class="metric-note">已判断为重点机会</span>
      </button>
    </section>

    <section class="lead-workspace">
      <header class="workspace-header">
        <div>
          <div class="workspace-title">{{ isTrash ? '已删除意向客户' : '咨询处理队列' }}</div>
          <div class="workspace-description">{{ isTrash ? `回收站共 ${pagination.total} 条，可恢复或彻底删除。` : `当前筛选共 ${pagination.total} 条，点击整行查看访客原始提交与完整跟进历史。` }}</div>
        </div>
        <div v-if="!isTrash" class="scope-switch">
          <button :class="{ active: scope === 'ALL' }" @click="setScope('ALL')">全部</button>
          <button :class="{ active: scope === 'UNREAD' }" @click="setScope('UNREAD')">未读 <b v-if="summary.unread">{{ summary.unread }}</b></button>
        </div>
      </header>

      <div class="filter-bar">
        <el-input v-model="filters.keyword" :prefix-icon="Search" clearable placeholder="搜索公司、联系人或联系方式" @keyup.enter="fetchList(true)" @clear="fetchList(true)" />
        <el-select v-model="filters.followUpStatus" clearable placeholder="全部跟进阶段" @change="fetchList(true)">
          <el-option v-for="item in FOLLOW_UP_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.followUpValue" clearable placeholder="全部跟进价值" @change="fetchList(true)">
          <el-option v-for="item in FOLLOW_UP_VALUE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="fetchList(true)">查询</el-button>
        <el-button v-if="hasFilters" link @click="resetFilters">清空筛选</el-button>
      </div>

      <el-table v-loading="loading" :data="items" row-key="id" class="inquiry-table" :row-class-name="tableRowClass" :empty-text="isTrash ? '回收站暂无客户' : '暂无符合条件的官网咨询'" @row-click="handleRowClick">
        <el-table-column label="客户 / 联系方式" min-width="270">
          <template #default="{ row }">
            <div class="customer-cell">
              <span v-if="!row.websiteSubmission?.viewedAt" class="unread-dot" title="未读咨询"></span>
              <div class="customer-main"><div class="company-name">{{ row.companyName }}</div><div class="contact-line">{{ contactLine(row) }}</div></div>
              <el-button v-if="row.contactInfo" link class="copy-button" @click.stop="copyContact(row.contactInfo)">复制</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="访客需求" min-width="300">
          <template #default="{ row }">
            <div class="need-text">{{ row.requestedFeatures || row.remark || '访客未补充具体挑战' }}</div>
            <div class="source-meta">官网表单 · {{ formatDateTime(row.websiteSubmission?.createdAt || row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="推进状态" width="150"><template #default="{ row }"><DictTag :value="row.followUpStatus" :options="FOLLOW_UP_STATUS_OPTIONS" /></template></el-table-column>
        <el-table-column label="跟进价值" width="155"><template #default="{ row }"><DictTag :value="row.followUpValue" :options="FOLLOW_UP_VALUE_OPTIONS" /></template></el-table-column>
        <el-table-column label="当前负责人 / 下一步" min-width="210">
          <template #default="{ row }"><div class="owner-line">{{ row.followUpOwner || '暂未指定负责人' }}</div><div class="next-line">{{ row.nextFollowUpAt ? formatDateTime(row.nextFollowUpAt) : '尚未安排下次跟进' }}</div></template>
        </el-table-column>
        <el-table-column v-if="isTrash" label="删除时间" width="175"><template #default="{ row }">{{ formatDateTime(row.deletedAt) }}</template></el-table-column>
        <el-table-column label="操作" :width="isTrash ? 180 : 205" fixed="right" align="right">
          <template #default="{ row }">
            <template v-if="!isTrash"><el-button link type="primary" @click.stop="openDetail(row)">查看</el-button><el-button v-if="canFollowUp" link type="primary" @click.stop="openFollowUp(row)">登记跟进</el-button><el-button v-if="canDelete" link type="danger" :loading="actionId === row.id" @click.stop="removeInquiry(row)">删除</el-button></template>
            <template v-else><el-button v-if="canRestore" link type="primary" :loading="actionId === row.id" @click.stop="restoreInquiry(row)">恢复</el-button><el-button v-if="canPurge" link type="danger" :loading="actionId === row.id" @click.stop="purgeInquiry(row)">彻底删除</el-button></template>
          </template>
        </el-table-column>
      </el-table>

      <footer class="table-footer">
        <span>{{ isTrash ? '普通删除不会丢失数据；只有“彻底删除”会同时清除原始快照与跟进历史。' : '每条官网咨询都保留提交时的原始快照，不会被后续编辑覆盖。' }}</span>
        <el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="pagination.total" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next, jumper" background @current-change="fetchList(false)" @size-change="fetchList(true)" />
      </footer>
    </section>

    <CustomerLeadDetailDrawer v-model="detailVisible" :lead="selectedLead" :follow-up-status-options="FOLLOW_UP_STATUS_OPTIONS" :follow-up-value-options="FOLLOW_UP_VALUE_OPTIONS" :follow-up-method-options="FOLLOW_UP_METHOD_OPTIONS" :refresh-key="detailRefreshKey" :show-edit-action="false" :show-follow-up-action="canFollowUp" :history-loader="customerLeadsApi.listWebsiteInquiryFollowUps" @register-follow-up="openFollowUp(selectedLead)" />
    <CustomerLeadFollowUpDialog v-model="followUpDialogVisible" :customer-name="selectedLead?.companyName" :is-first-follow-up="!selectedLead?.firstFollowUpAt" :initial-data="followUpInitialData" :follow-up-status-options="FOLLOW_UP_STATUS_OPTIONS" :follow-up-value-options="FOLLOW_UP_VALUE_OPTIONS" :follow-up-method-options="FOLLOW_UP_METHOD_OPTIONS" :submitting="followUpSubmitting" @submit="handleFollowUpSubmit" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Search } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import * as customerLeadsApi from '@/api/modules/customerLeads';
import DictTag from '@/components/common/DictTag.vue';
import { formatDateTime, toIsoDateTime } from '@/utils/format';
import CustomerLeadDetailDrawer from '@/views/customerleadmanagement/components/CustomerLeadDetailDrawer.vue';
import CustomerLeadFollowUpDialog from '@/views/customerleadmanagement/components/CustomerLeadFollowUpDialog.vue';
import { FOLLOW_UP_METHOD_OPTIONS, FOLLOW_UP_STATUS_OPTIONS, FOLLOW_UP_VALUE_OPTIONS } from '@/views/customerleadmanagement/constants';
import type { CustomerLeadFollowUpFormModel } from '@/views/customerleadmanagement/types';

type Scope = 'ALL' | 'UNREAD' | 'PENDING' | 'HIGH';
type ListMode = 'ACTIVE' | 'TRASH';
const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const followUpSubmitting = ref(false);
const detailVisible = ref(false);
const followUpDialogVisible = ref(false);
const detailRefreshKey = ref(0);
const selectedLead = ref<customerLeadsApi.CustomerLeadItem | null>(null);
const items = ref<customerLeadsApi.CustomerLeadItem[]>([]);
const listMode = ref<ListMode>('ACTIVE');
const scope = ref<Scope>('ALL');
const actionId = ref('');
const summary = reactive<customerLeadsApi.WebsiteInquirySummary>({ total: 0, unread: 0, today: 0, pendingContact: 0, highValue: 0, lastSevenDays: 0 });
const filters = reactive({ keyword: '', followUpStatus: '', followUpValue: '' });
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });
const permissions = computed(() => auth.user?.permissions || []);
const canMarkViewed = computed(() => auth.isPlatformAdmin || permissions.value.includes('website-inquiry:viewed:update'));
const canFollowUp = computed(() => auth.isPlatformAdmin || permissions.value.includes('website-inquiry:follow-up:create'));
const canDelete = computed(() => auth.isPlatformAdmin || permissions.value.includes('website-inquiry:delete'));
const canRestore = computed(() => auth.isPlatformAdmin || permissions.value.includes('website-inquiry:restore'));
const canPurge = computed(() => auth.isPlatformAdmin || permissions.value.includes('website-inquiry:purge'));
const isTrash = computed(() => listMode.value === 'TRASH');
const hasFilters = computed(() => Boolean(filters.keyword || filters.followUpStatus || filters.followUpValue || scope.value !== 'ALL'));
const followUpInitialData = computed<Partial<CustomerLeadFollowUpFormModel> | undefined>(() => {
  const lead = selectedLead.value;
  if (!lead) return undefined;
  return { followedUpAt: formatLocalDateTime(new Date()), followUpMethod: 'WECHAT', followUpOwner: lead.followUpOwner || '', summary: '', followUpStatus: lead.followUpStatus, followUpValue: lead.followUpValue, nextFollowUpAt: toDateTimeInput(lead.nextFollowUpAt), nextFollowUpPlan: lead.nextFollowUpPlan || '' };
});

onMounted(refreshAll);

async function refreshAll() {
  loading.value = true;
  try {
    const [nextSummary] = await Promise.all([customerLeadsApi.getWebsiteInquirySummary(), fetchList(false, true)]);
    Object.assign(summary, nextSummary);
  } finally { loading.value = false; }
}

async function fetchList(resetPage = false, keepLoading = false) {
  if (resetPage) pagination.page = 1;
  if (!keepLoading) loading.value = true;
  try {
    const query = { keyword: filters.keyword.trim(), followUpStatus: scope.value === 'PENDING' ? 'PENDING_CONTACT' : filters.followUpStatus, followUpValue: scope.value === 'HIGH' ? 'HIGH' : filters.followUpValue, websiteInquiry: scope.value === 'UNREAD' ? 'UNREAD' as const : 'ONLY' as const, page: pagination.page, pageSize: pagination.pageSize };
    const result = isTrash.value ? await customerLeadsApi.listDeletedWebsiteInquiries(query) : await customerLeadsApi.listWebsiteInquiries(query);
    items.value = result.items;
    pagination.total = result.total;
  } finally { if (!keepLoading) loading.value = false; }
}

async function setScope(next: Scope) { listMode.value = 'ACTIVE'; scope.value = next; await fetchList(true); }
async function handleListModeChange() { scope.value = 'ALL'; detailVisible.value = false; selectedLead.value = null; await fetchList(true); }
async function resetFilters() { Object.assign(filters, { keyword: '', followUpStatus: '', followUpValue: '' }); scope.value = 'ALL'; await fetchList(true); }

function handleRowClick(row: customerLeadsApi.CustomerLeadItem) { if (!isTrash.value) void openDetail(row); }

async function openDetail(row: customerLeadsApi.CustomerLeadItem) {
  selectedLead.value = await customerLeadsApi.getWebsiteInquiryDetail(row.id);
  detailVisible.value = true;
  if (!selectedLead.value.websiteSubmission?.viewedAt && canMarkViewed.value) {
    await customerLeadsApi.markWebsiteInquiryViewed(row.id);
    selectedLead.value = await customerLeadsApi.getWebsiteInquiryDetail(row.id);
    await refreshAll();
  }
}

function openFollowUp(row?: customerLeadsApi.CustomerLeadItem | null) { if (!row || !canFollowUp.value) return; selectedLead.value = row; followUpDialogVisible.value = true; }

async function handleFollowUpSubmit(form: CustomerLeadFollowUpFormModel) {
  const lead = selectedLead.value;
  if (!lead) return;
  const followedUpAt = toIsoDateTime(form.followedUpAt);
  if (!followedUpAt) { ElMessage.error('本次实际跟进时间不正确'); return; }
  followUpSubmitting.value = true;
  try {
    await customerLeadsApi.recordWebsiteInquiryFollowUp(lead.id, { followedUpAt, followUpMethod: nullable(form.followUpMethod), followUpOwner: nullable(form.followUpOwner), summary: form.summary.trim(), followUpStatus: form.followUpStatus, followUpValue: form.followUpValue, nextFollowUpAt: toIsoDateTime(form.nextFollowUpAt) ?? null, nextFollowUpPlan: nullable(form.nextFollowUpPlan) });
    ElMessage.success('跟进已登记，客户当前阶段和下一步计划已同步');
    followUpDialogVisible.value = false;
    selectedLead.value = await customerLeadsApi.getWebsiteInquiryDetail(lead.id);
    detailRefreshKey.value += 1;
    await refreshAll();
  } finally { followUpSubmitting.value = false; }
}

async function removeInquiry(row: customerLeadsApi.CustomerLeadItem) {
  try { await ElMessageBox.confirm(`确认删除官网意向客户“${row.companyName}”吗？删除后会进入回收站。`, '删除意向客户', { type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消' }); } catch { return; }
  actionId.value = row.id;
  try {
    await customerLeadsApi.removeWebsiteInquiry(row.id);
    if (selectedLead.value?.id === row.id) { detailVisible.value = false; selectedLead.value = null; }
    ElMessage.success('意向客户已移入回收站');
    await refreshAll();
  } finally { actionId.value = ''; }
}

async function restoreInquiry(row: customerLeadsApi.CustomerLeadItem) {
  actionId.value = row.id;
  try {
    await customerLeadsApi.restoreWebsiteInquiry(row.id);
    ElMessage.success('意向客户已恢复');
    await refreshAll();
  } finally { actionId.value = ''; }
}

async function purgeInquiry(row: customerLeadsApi.CustomerLeadItem) {
  try { await ElMessageBox.confirm(`彻底删除“${row.companyName}”吗？原始官网快照与全部跟进历史都会永久删除，且无法恢复。`, '彻底删除意向客户', { type: 'error', confirmButtonText: '彻底删除', cancelButtonText: '取消' }); } catch { return; }
  actionId.value = row.id;
  try {
    await customerLeadsApi.purgeWebsiteInquiry(row.id);
    ElMessage.success('意向客户已彻底删除');
    await refreshAll();
  } finally { actionId.value = ''; }
}

async function copyContact(value: string) { await navigator.clipboard.writeText(value); ElMessage.success('联系方式已复制'); }
function contactLine(row: customerLeadsApi.CustomerLeadItem) { const person = [row.contactName, row.contactPosition].filter(Boolean).join(' · '); return [person, row.contactInfo].filter(Boolean).join('  |  ') || '未填写联系人'; }
function tableRowClass({ row }: { row: customerLeadsApi.CustomerLeadItem }) { return isTrash.value || row.websiteSubmission?.viewedAt ? '' : 'unread-row'; }
function nullable(value: string) { return value.trim() || null; }
function toDateTimeInput(value?: string | null) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : formatLocalDateTime(date); }
function formatLocalDateTime(date: Date) { const pad = (value: number) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`; }
</script>

<style scoped>
.inquiry-page { min-height: 100%; padding: 20px; background: #f4f7fb; }
.inquiry-hero { position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; overflow: hidden; padding: 30px 34px; border: 1px solid rgba(255,255,255,.78); border-radius: 22px; background: radial-gradient(circle at 88% 10%,rgba(94,152,255,.24),transparent 30%),linear-gradient(135deg,#f7fbff 0%,#eef5ff 48%,#f8fbff 100%); box-shadow: 0 12px 38px rgba(36,76,126,.08); }
.inquiry-hero::after { position: absolute; right: 150px; bottom: -86px; width: 220px; height: 220px; border: 34px solid rgba(65,117,210,.055); border-radius: 50%; content: ''; }
.view-tabs{margin-top:16px;padding:0 20px;border:1px solid #e4eaf1;border-radius:14px;background:#fff}.view-tabs :deep(.el-tabs__header){margin:0}.view-tabs :deep(.el-tabs__content){display:none}
.hero-copy,.hero-actions { position: relative; z-index: 1; }.hero-copy { max-width: 760px; }.hero-eyebrow { display: flex; align-items: center; gap: 9px; color: #4776ba; font-size: 11px; font-weight: 750; letter-spacing: .16em; }.eyebrow-dot { width: 8px; height: 8px; border-radius: 50%; background: #4e85dc; box-shadow: 0 0 0 5px rgba(78,133,220,.12); }
.hero-copy h1 { margin: 12px 0 8px; color: #17243a; font-size: 28px; font-weight: 720; letter-spacing: -.02em; }.hero-copy p { margin: 0; color: #66758a; font-size: 14px; line-height: 1.75; }.hero-tags { display: flex; gap: 8px; margin-top: 17px; }.hero-tags span { padding: 5px 10px; border: 1px solid #dce8f8; border-radius: 999px; background: rgba(255,255,255,.72); color: #57708f; font-size: 12px; }.hero-actions { display: flex; flex: 0 0 auto; }
.metric-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; margin: 16px 0; }.metric-card { --metric-color:#4d7fd2; position: relative; display: grid; gap: 5px; min-height: 132px; padding: 20px 22px; overflow: hidden; border: 1px solid #e4eaf2; border-radius: 16px; background: #fff; text-align: left; cursor: pointer; transition: transform .2s ease,box-shadow .2s ease,border-color .2s ease; }.metric-card::after { position: absolute; top: 19px; right: 20px; width: 10px; height: 10px; border-radius: 50%; background: var(--metric-color); box-shadow: 0 0 0 7px color-mix(in srgb,var(--metric-color) 13%,transparent); content: ''; }.metric-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(30,58,92,.08); }.metric-card.active { border-color: color-mix(in srgb,var(--metric-color) 52%,#e4eaf2); box-shadow: inset 0 0 0 1px color-mix(in srgb,var(--metric-color) 24%,transparent),0 10px 28px rgba(30,58,92,.07); }.metric-card--danger{--metric-color:#e85c66}.metric-card--amber{--metric-color:#e6a33b}.metric-card--green{--metric-color:#36a878}.metric-label{color:#65748a;font-size:13px;font-weight:600}.metric-card strong{color:#17243a;font-size:31px;font-weight:720;line-height:1.15}.metric-note{color:#98a3b2;font-size:12px}
.lead-workspace{overflow:hidden;border:1px solid #e4eaf1;border-radius:18px;background:#fff;box-shadow:0 8px 28px rgba(36,61,91,.055)}.workspace-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px 18px}.workspace-title{color:#1f2b3d;font-size:17px;font-weight:680}.workspace-description{margin-top:5px;color:#8a96a7;font-size:12px}.scope-switch{display:flex;padding:4px;border-radius:10px;background:#f2f5f9}.scope-switch button{min-width:72px;padding:7px 12px;border:0;border-radius:8px;background:transparent;color:#758398;cursor:pointer}.scope-switch button.active{background:#fff;color:#356dbb;font-weight:650;box-shadow:0 2px 8px rgba(35,62,96,.1)}.scope-switch b{display:inline-grid;min-width:18px;height:18px;margin-left:3px;place-items:center;border-radius:9px;background:#e95863;color:#fff;font-size:10px}
.filter-bar{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto auto;gap:10px;align-items:center;padding:15px 24px;border-top:1px solid #eef2f6;border-bottom:1px solid #eef2f6;background:#fbfcfe}.inquiry-table{--el-table-header-bg-color:#f8fafc;--el-table-header-text-color:#64748b}.inquiry-table :deep(th.el-table__cell){height:46px;font-size:12px;font-weight:650}.inquiry-table :deep(td.el-table__cell){padding:15px 0;cursor:pointer}.inquiry-table :deep(.unread-row td.el-table__cell){background:#fffdf8}.customer-cell{display:flex;align-items:flex-start;gap:10px}.unread-dot{flex:0 0 auto;width:8px;height:8px;margin-top:7px;border-radius:50%;background:#e85863;box-shadow:0 0 0 4px rgba(232,88,99,.1)}.customer-main{min-width:0}.company-name{overflow:hidden;color:#243247;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.contact-line,.source-meta,.next-line{margin-top:5px;color:#8a96a7;font-size:12px}.copy-button{opacity:0;transition:opacity .15s}.customer-cell:hover .copy-button{opacity:1}.need-text{display:-webkit-box;overflow:hidden;color:#4a596e;font-size:13px;line-height:1.55;-webkit-box-orient:vertical;-webkit-line-clamp:2}.owner-line{color:#4b5a6d;font-size:13px}.table-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 24px;border-top:1px solid #eef2f6;color:#9aa5b3;font-size:12px}
@media(max-width:1180px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-bar{grid-template-columns:minmax(240px,1fr) 180px 180px auto}.filter-bar>:last-child{display:none}}@media(max-width:760px){.inquiry-page{padding:12px}.inquiry-hero{align-items:flex-start;flex-direction:column;padding:24px}.hero-actions{width:100%}.metric-grid{grid-template-columns:1fr}.workspace-header,.table-footer{align-items:flex-start;flex-direction:column}.filter-bar{grid-template-columns:1fr}}
</style>
