<template>
  <el-drawer v-model="visible" size="920px" direction="rtl" class="customer-lead-detail-drawer" destroy-on-close>
    <template #header>
      <div class="drawer-heading">
        <div class="min-w-0">
          <div class="drawer-title">{{ lead?.companyName || '商机客户详情' }}</div>
          <div class="drawer-subtitle">主档展示当前推进判断；每一条实际沟通都在时间线独立留痕，后续操作不会覆盖历史。</div>
        </div>
        <div v-if="lead" class="drawer-tags">
          <DictTag :value="lead.followUpStatus" :options="followUpStatusOptions" />
          <DictTag :value="lead.followUpValue" :options="followUpValueOptions" />
        </div>
      </div>
    </template>

    <div v-if="lead" class="customer-lead-detail">
      <div class="action-row">
        <el-button v-if="showFollowUpAction !== false" type="primary" @click="emit('register-follow-up')">
          {{ lead.firstFollowUpAt ? '登记跟进' : '登记首次跟进' }}
        </el-button>
        <el-button v-if="showEditAction !== false" @click="emit('edit')">编辑客户信息</el-button>
      </div>

      <section class="summary-panel">
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">当前跟进状态</div>
            <div class="summary-value"><DictTag :value="lead.followUpStatus" :options="followUpStatusOptions" /></div>
          </div>
          <div class="summary-item">
            <div class="summary-label">继续跟进价值</div>
            <div class="summary-value"><DictTag :value="lead.followUpValue" :options="followUpValueOptions" /></div>
          </div>
          <div class="summary-item">
            <div class="summary-label">当前跟进人</div>
            <div class="summary-value">{{ lead.followUpOwner || '未指定' }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">下次计划跟进</div>
            <div class="summary-value" :class="{ 'text-slate-400': !lead.nextFollowUpAt }">
              {{ lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : '暂未安排' }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">首次实际跟进</div>
            <div class="summary-value" :class="{ 'text-slate-400': !lead.firstFollowUpAt }">
              {{ lead.firstFollowUpAt ? formatDateTime(lead.firstFollowUpAt) : '尚未登记' }}
            </div>
          </div>
          <div class="summary-item">
            <div class="summary-label">最近实际跟进 / 历史数</div>
            <div class="summary-value">{{ lead.lastFollowUpAt ? formatDateTime(lead.lastFollowUpAt) : '暂无记录' }}<span class="history-count"> · {{ lead.followUpCount ?? historyTotal }} 条</span></div>
          </div>
        </div>
        <div class="plan-panel">
          <span class="plan-label">下一步行动</span>
          <span class="plan-value">{{ lead.nextFollowUpPlan || '暂未填写行动说明' }}</span>
        </div>
      </section>

      <section v-if="lead.websiteSubmission" class="detail-section website-inquiry-section">
        <div class="section-heading website-inquiry-heading">
          <div>
            <div class="section-title">官网提交原始信息</div>
            <div class="section-hint">这是访客提交时的不可变快照，编辑客户主档不会覆盖，便于还原真实需求与投放来源。</div>
          </div>
          <el-tag :type="lead.websiteSubmission.viewedAt ? 'info' : 'danger'" effect="light">
            {{ lead.websiteSubmission.viewedAt ? '已读' : '新咨询' }}
          </el-tag>
        </div>
        <el-descriptions :column="2" border class="lead-descriptions">
          <el-descriptions-item label="提交公司">{{ lead.websiteSubmission.submittedCompanyName || lead.companyName }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatDateTime(lead.websiteSubmission.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ lead.websiteSubmission.submittedContactName || '--' }}</el-descriptions-item>
          <el-descriptions-item label="联系方式">{{ lead.websiteSubmission.submittedContactInfo || '--' }}</el-descriptions-item>
          <el-descriptions-item label="业务概况" :span="2">
            <div class="pre-line-value">{{ lead.websiteSubmission.businessOverview || '--' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="运营账号 / 规模" :span="2">
            <div class="pre-line-value">{{ lead.websiteSubmission.operatingAccounts || '--' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="主要挑战" :span="2">{{ lead.websiteSubmission.challenge || '--' }}</el-descriptions-item>
          <el-descriptions-item label="访问页面" :span="2">{{ lead.websiteSubmission.pageUrl || '--' }}</el-descriptions-item>
          <el-descriptions-item label="访问来源" :span="2">{{ lead.websiteSubmission.referrer || '直接访问 / 未提供' }}</el-descriptions-item>
          <el-descriptions-item label="UTM 来源">{{ lead.websiteSubmission.utmSource || '--' }}</el-descriptions-item>
          <el-descriptions-item label="UTM 媒介">{{ lead.websiteSubmission.utmMedium || '--' }}</el-descriptions-item>
          <el-descriptions-item label="UTM 活动" :span="2">{{ lead.websiteSubmission.utmCampaign || '--' }}</el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="detail-section">
        <div class="section-heading">
          <div class="section-title">客户档案与业务判断</div>
          <div class="section-hint">这些是客户主档信息；编辑不会改写任何实际沟通的历史内容。</div>
        </div>
        <el-descriptions :column="2" border class="lead-descriptions">
          <el-descriptions-item label="关键联系人">{{ lead.contactName || '--' }}</el-descriptions-item>
          <el-descriptions-item label="职位 / 角色">{{ lead.contactPosition || '--' }}</el-descriptions-item>
          <el-descriptions-item label="联系方式">{{ lead.contactInfo || '--' }}</el-descriptions-item>
          <el-descriptions-item label="线索来源">{{ sourceLabel(lead.leadSource) }}</el-descriptions-item>
          <el-descriptions-item label="来源说明" :span="2">{{ lead.leadSourceDetail || '--' }}</el-descriptions-item>
          <el-descriptions-item label="主营类目" :span="2">
            <div v-if="lead.primaryCategories?.length" class="category-list">
              <el-tag v-for="category in lead.primaryCategories" :key="category" size="small" effect="plain">{{ category }}</el-tag>
            </div>
            <span v-else>--</span>
          </el-descriptions-item>
          <el-descriptions-item label="客户所需功能" :span="2">
            <div class="pre-line-value">{{ lead.requestedFeatures || '--' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="现有方案 / 竞品" :span="2">
            <div class="pre-line-value">{{ lead.currentSolution || '--' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="未打动 / 阻碍原因" :span="2">
            <div class="pre-line-value">{{ lead.notWonReason || '--' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="公司地址" :span="2">{{ lead.companyAddress || '--' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">
            <div class="pre-line-value">{{ lead.remark || '--' }}</div>
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <section class="detail-section history-section">
        <div class="section-heading history-heading">
          <div>
            <div class="section-title">跟进历史</div>
            <div class="section-hint">按实际跟进时间倒序展示。首次跟进和每次后续沟通均是独立记录，不会被覆盖。</div>
          </div>
          <span class="history-total">共 {{ historyTotal }} 条</span>
        </div>

        <div v-loading="historyLoading" class="history-content">
          <el-empty v-if="!historyLoading && historyItems.length === 0" description="暂未登记实际跟进记录">
            <el-button v-if="showFollowUpAction !== false" type="primary" @click="emit('register-follow-up')">登记首次跟进</el-button>
          </el-empty>

          <el-timeline v-else>
            <el-timeline-item
              v-for="item in historyItems"
              :key="item.id"
              :timestamp="formatDateTime(item.followedUpAt)"
              placement="top"
            >
              <article class="history-card">
                <div class="history-card-head">
                  <div class="history-meta">
                    <span>{{ methodLabel(item.followUpMethod) }}</span>
                    <span>{{ item.followUpOwner || '未填写跟进人' }}</span>
                  </div>
                  <div class="history-tags">
                    <DictTag :value="item.followUpStatus" :options="followUpStatusOptions" />
                    <DictTag :value="item.followUpValue" :options="followUpValueOptions" />
                  </div>
                </div>
                <div class="history-summary">{{ item.summary }}</div>
                <div v-if="item.nextFollowUpAt || item.nextFollowUpPlan" class="history-plan">
                  <span>本次后计划：</span>
                  <span>{{ item.nextFollowUpAt ? formatDateTime(item.nextFollowUpAt) : '未设时间' }}</span>
                  <span v-if="item.nextFollowUpPlan"> · {{ item.nextFollowUpPlan }}</span>
                </div>
              </article>
            </el-timeline-item>
          </el-timeline>
        </div>

        <div v-if="historyTotal > historyPageSize" class="history-pagination">
          <el-pagination
            v-model:current-page="historyPage"
            :page-size="historyPageSize"
            :total="historyTotal"
            layout="prev, pager, next"
            background
            @current-change="fetchHistory(false)"
          />
        </div>
      </section>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SelectOption } from '@/utils/apiData';
import * as customerLeadsApi from '@/api/modules/customerLeads';
import DictTag from '@/components/common/DictTag.vue';
import { formatDateTime } from '@/utils/format';
import { LEAD_SOURCE_OPTIONS } from '../constants';

const props = defineProps<{
  modelValue: boolean;
  lead: customerLeadsApi.CustomerLeadItem | null;
  followUpStatusOptions: SelectOption[];
  followUpValueOptions: SelectOption[];
  followUpMethodOptions: SelectOption[];
  refreshKey?: number;
  showEditAction?: boolean;
  showFollowUpAction?: boolean;
  historyLoader?: typeof customerLeadsApi.listCustomerLeadFollowUps;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'register-follow-up': [];
  edit: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const historyItems = ref<customerLeadsApi.CustomerLeadFollowUpItem[]>([]);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPageSize = 20;
const historyLoading = ref(false);

watch(
  () => [props.modelValue, props.lead?.id, props.refreshKey] as const,
  ([open, leadId], previous) => {
    if (!open || !leadId) return;
    const previousLeadId = previous?.[1];
    void fetchHistory(previousLeadId !== leadId);
  },
  { immediate: true }
);

async function fetchHistory(resetPage: boolean) {
  const leadId = props.lead?.id;
  if (!leadId) return;
  if (resetPage) historyPage.value = 1;

  historyLoading.value = true;
  try {
    const result = await (props.historyLoader ?? customerLeadsApi.listCustomerLeadFollowUps)(leadId, {
      page: historyPage.value,
      pageSize: historyPageSize
    });
    historyItems.value = result.items;
    historyTotal.value = result.total;
  } finally {
    historyLoading.value = false;
  }
}

function methodLabel(value?: string | null) {
  if (!value) return '未填写沟通方式';
  return props.followUpMethodOptions.find((item) => item.value === value)?.label || value;
}

function sourceLabel(value?: string | null) {
  if (!value) return '--';
  return LEAD_SOURCE_OPTIONS.find((item) => item.value === value)?.label || value;
}
</script>

<style scoped>
.drawer-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding-right: 22px;
}

.drawer-title {
  overflow: hidden;
  color: #182230;
  font-size: 20px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-subtitle,
.section-hint {
  margin-top: 6px;
  color: #7a8699;
  font-size: 13px;
  line-height: 1.6;
}

.drawer-tags,
.history-tags,
.category-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.drawer-tags {
  flex: 0 0 auto;
  justify-content: flex-end;
}

.customer-lead-detail {
  padding: 0 4px 28px;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.summary-panel {
  overflow: hidden;
  border: 1px solid #e4eaf2;
  border-radius: 10px;
  background: #fff;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-item {
  min-height: 76px;
  padding: 16px 18px;
  border-bottom: 1px solid #eef1f5;
}

.summary-item:nth-child(odd) {
  border-right: 1px solid #eef1f5;
}

.summary-label,
.plan-label {
  color: #8894a7;
  font-size: 12px;
}

.summary-value {
  margin-top: 8px;
  color: #26364a;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.history-count {
  color: #7a8699;
  font-size: 12px;
  font-weight: 500;
}

.plan-panel {
  display: flex;
  gap: 10px;
  padding: 14px 18px;
  background: #f8fafc;
}

.plan-value {
  color: #435268;
  font-size: 13px;
  line-height: 1.6;
}

.detail-section {
  margin-top: 24px;
}

.section-heading {
  margin-bottom: 14px;
}

.history-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.website-inquiry-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.website-inquiry-section {
  border: 1px solid #f2d6a2;
  border-radius: 10px;
  padding: 16px;
  background: #fffaf0;
}

.section-title {
  color: #26364a;
  font-size: 16px;
  font-weight: 650;
}

.history-total {
  flex: 0 0 auto;
  color: #7a8699;
  font-size: 13px;
}

.pre-line-value,
.history-summary {
  color: #435268;
  line-height: 1.7;
  white-space: pre-line;
  word-break: break-word;
}

.history-content {
  min-height: 120px;
}

.history-card {
  border: 1px solid #e7ecf3;
  border-radius: 9px;
  padding: 14px 16px;
  background: #fff;
}

.history-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #6d7b90;
  font-size: 12px;
}

.history-summary {
  margin-top: 12px;
}

.history-plan {
  margin-top: 12px;
  color: #617187;
  font-size: 12px;
  line-height: 1.6;
}

.history-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .summary-item:nth-child(odd) {
    border-right: 0;
  }
}
</style>
