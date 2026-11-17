<template>
  <div class="space-y-4">
    <PageToolbar title="评论记录" description="按作品和根评论线程保存抖音、微信视频号的一级评论、后续追问、账号侧回复及回复状态；采集不完整时会明确标记。">
      <el-form :inline="true" label-position="top" class="w-full">
        <el-form-item label="机器人">
          <el-select v-model="filters.robotId" clearable filterable placeholder="全部机器人" style="width: 190px">
            <el-option v-for="item in robots" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="filters.platform" clearable placeholder="全部平台" style="width: 130px">
            <el-option label="抖音" value="DOUYIN" />
            <el-option label="微信视频号" value="WECHAT_VIDEO" />
          </el-select>
        </el-form-item>
        <el-form-item label="作品/评论">
          <el-input v-model="filters.keyword" clearable placeholder="作品、昵称或评论内容" style="width: 230px" @keyup.enter="reload(true)" />
        </el-form-item>
        <el-form-item label="回复状态">
          <el-select v-model="filters.replyStatus" clearable placeholder="全部状态" style="width: 150px">
            <el-option label="待处理" value="pending" />
            <el-option label="已生成" value="generated" />
            <el-option label="已发送" value="sent" />
            <el-option label="接口成功待回显" value="sent_unconfirmed" />
            <el-option label="人工/既有回复" value="manual" />
            <el-option label="无需回复" value="not_required" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="采集完整度">
          <el-select v-model="filters.collectionStatus" clearable placeholder="全部" style="width: 150px">
            <el-option label="可见线程完整" value="complete_visible_thread" />
            <el-option label="存在折叠回复" value="partial_thread" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="reload(true)">查询</el-button>
          <el-button @click="resetAndReload">重置</el-button>
        </el-form-item>
      </el-form>
    </PageToolbar>

    <el-row :gutter="12">
      <el-col v-for="card in summaryCards" :key="card.label" :xs="12" :sm="8" :lg="4">
        <el-card shadow="never" class="summary-card">
          <div class="text-xs text-slate-400">{{ card.label }}</div>
          <div class="mt-2 text-2xl font-semibold text-slate-800 dark:text-slate-100">{{ card.value }}</div>
          <div class="mt-1 text-xs text-slate-400">{{ card.hint }}</div>
        </el-card>
      </el-col>
    </el-row>

    <CrudTablePanel title="评论线程" description="默认一行代表一个根评论线程；点击查看可按一级评论、账号回复、用户追问的顺序查看完整可见记录。">
      <el-table v-loading="loading" :data="items" row-key="rootRecordId" stripe>
        <el-table-column label="作品" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="font-medium">{{ row.videoTitle || '未识别作品' }}</div>
            <div class="mt-1 text-xs text-slate-400">{{ platformLabel(row.platform) }} · {{ robotName(row.robotId) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="一级评论" min-width="280">
          <template #default="{ row }">
            <el-button link type="primary" @click="openThread(row)">{{ row.rootAuthor || '未知用户' }}</el-button>
            <div class="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{{ row.rootContent || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="线程消息" width="145">
          <template #default="{ row }">
            <div>{{ row.messageCount }} 条</div>
            <div class="mt-1 text-xs text-slate-400">追问 {{ row.followUpCount }} · 账号回复 {{ row.accountReplyCount }}</div>
            <div v-if="row.mergedSegmentCount > 1 || row.duplicateCount > 0" class="mt-1 text-xs text-amber-500">
              已整合 {{ row.mergedSegmentCount }} 段<span v-if="row.duplicateCount"> · 去重 {{ row.duplicateCount }} 条</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="回复状态" width="135">
          <template #default="{ row }"><el-tag :type="replyTagType(row.replyStatus)" effect="plain">{{ replyStatusLabel(row.replyStatus) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="采集完整度" width="145">
          <template #default="{ row }">
            <el-tag :type="row.repliesCollapsed ? 'warning' : 'success'" effect="plain">
              {{ row.repliesCollapsed ? '存在折叠回复' : '可见线程完整' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后更新" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastActivityAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openThread(row)">查看</el-button>
            <el-button link type="danger" @click="removeThread(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          @update:current-page="pagination.page = $event; reload()"
          @update:page-size="pagination.pageSize = $event; reload(true)"
        />
      </template>
    </CrudTablePanel>

    <el-drawer v-model="drawerVisible" :title="`评论线程 · ${activeThread?.rootAuthor || ''}`" size="760px">
      <div v-loading="detailLoading">
        <el-descriptions v-if="activeThread" :column="1" border size="small" class="mb-4">
          <el-descriptions-item label="作品">{{ activeThread.videoTitle || '未识别作品' }}</el-descriptions-item>
          <el-descriptions-item label="采集范围">{{ activeThread.currentFilter || '未记录筛选条件' }}</el-descriptions-item>
          <el-descriptions-item label="完整度">{{ activeThread.repliesCollapsed ? '存在未展开的折叠回复，当前记录可能不完整' : '当前可见线程已完整采集' }}</el-descriptions-item>
          <el-descriptions-item v-if="activeThread.mergedSegmentCount > 1" label="数据整合">已整合 {{ activeThread.mergedSegmentCount }} 个采集段，过滤 {{ activeThread.duplicateCount }} 条重复记录</el-descriptions-item>
        </el-descriptions>

        <div class="comment-thread-timeline">
          <template v-for="(message, index) in messages" :key="message.recordId">
            <div v-if="shouldShowTimeDivider(index)" class="comment-time-divider">
              <span>{{ formatTimelineDivider(messageTime(message)) }}</span>
            </div>
            <div
              class="comment-message"
              :class="[`comment-message--${message.senderRole}`, { 'comment-message--nested': message.depth > 0, 'reply-feedback-host': hasFeedbackEntry(message) }]"
              :tabindex="hasFeedbackEntry(message) ? 0 : undefined"
            >
            <div class="comment-message__header">
              <span class="font-medium">{{ message.senderRole === 'account' ? '账号侧' : message.userNickname || '用户' }}</span>
              <span class="text-slate-400">{{ message.depth > 0 ? `${message.depth + 1}级回复` : '一级评论' }}</span>
              <span class="text-slate-400">{{ formatMessageClock(messageTime(message)) }}</span>
              <el-popover placement="left" :width="350" trigger="click">
                <template #reference><el-button link size="small">数据详情</el-button></template>
                <div class="space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  <div>记录ID：{{ message.recordId }}</div>
                  <div>父记录：{{ message.parentRecordId || '-' }}</div>
                  <div>消息类型：{{ message.messageType }}</div>
                  <div>来源：{{ message.actorSource || '-' }}</div>
                  <div>来源说明：{{ message.sourceLabel || '-' }}</div>
                  <div>归因：{{ message.attributionConfidence || '-' }}</div>
                  <div>证据等级：{{ evidenceLevelLabel(message.evidenceLevel) }}</div>
                  <div>操作范围：{{ feedbackModeLabel(message.feedbackMode) }}</div>
                  <div v-if="message.replyAttemptId">回复尝试：{{ message.replyAttemptId }}</div>
                  <div v-if="message.replyTraceId">回复追踪：{{ message.replyTraceId }}</div>
                  <div v-if="message.generationSource">生成来源：{{ message.generationSource }}</div>
                  <div>时间原文：{{ message.sourceTimeRaw || '-' }}</div>
                  <div>时间精度：{{ message.timeAccuracy || '-' }}</div>
                  <div>回复状态：{{ replyStatusLabel(message.replyStatus) }}</div>
                  <div v-if="message.skipReason">跳过原因：{{ message.skipReason }}</div>
                  <div v-if="message.failReason">失败原因：{{ message.failReason }}</div>
                </div>
              </el-popover>
            </div>
            <div class="comment-message__bubble">{{ message.commentContent || message.typePlaceholder || `[${message.messageType}]` }}</div>
            <div v-if="message.mediaLabel" class="comment-message__media-hint">{{ message.mediaLabel }}</div>
            <template v-if="shouldShowReplyResult(message)">
              <div class="comment-message__reply-result">本次自动回复：{{ message.replyContent }}</div>
              <ReplyFeedbackActions
                positive-label="有效"
                positive-done-label="已标记有效"
                calibrate-label="需校准"
                :feedback="stateFor(message).feedback"
                :calibration-status="stateFor(message).calibrationStatus"
                :strategy-draft-status="stateFor(message).strategyDraftStatus"
                :has-trace="Boolean(message.replyTraceId)"
                :can-feedback="canCreateCalibration && canUseTraceFeedback(message)"
                :can-calibrate="canCreateCalibration && canReadCalibration && canUseTraceFeedback(message) && message.generationSource !== 'imported_dataset'"
                :can-view-details="canReadCalibration && canUseTraceFeedback(message)"
                :busy="isBusy(message)"
                @satisfied="markEffective(message)"
                @calibrate="openCalibration(message, false)"
                @copy="copyText(message.replyContent)"
                @details="openDetails(message)"
              />
            </template>
            <template v-else-if="isDecisionOutcome(message)">
              <div class="comment-message__decision-result">
                自动判断：{{ message.skipReason || message.judgeReason || (message.replyStatus === 'failed' ? message.failReason : '无需回复') }}
              </div>
              <ReplyFeedbackActions
                positive-label="有效"
                positive-done-label="已标记有效"
                calibrate-label="需校准"
                :feedback="stateFor(message).feedback"
                :calibration-status="stateFor(message).calibrationStatus"
                :strategy-draft-status="stateFor(message).strategyDraftStatus"
                :has-trace="Boolean(message.replyTraceId)"
                :can-feedback="canCreateCalibration && canUseTraceFeedback(message)"
                :can-calibrate="canCreateCalibration && canReadCalibration && canUseTraceFeedback(message)"
                :can-view-details="canReadCalibration && canUseTraceFeedback(message)"
                :busy="isBusy(message)"
                @satisfied="markEffective(message)"
                @calibrate="openCalibration(message, true)"
                @copy="copyText(message.skipReason || message.judgeReason || message.failReason)"
                @details="openDetails(message)"
              />
            </template>
            <ReplyFeedbackActions
              v-else-if="isAccountReplyMessage(message)"
              positive-label="有效"
              positive-done-label="已标记有效"
              calibrate-label="需校准"
              :feedback="stateFor(message).feedback"
              :calibration-status="stateFor(message).calibrationStatus"
              :strategy-draft-status="stateFor(message).strategyDraftStatus"
              :has-trace="Boolean(message.replyTraceId)"
              :can-feedback="canCreateCalibration && canUseTraceFeedback(message)"
              :can-calibrate="canCreateCalibration && canReadCalibration && canUseTraceFeedback(message) && message.generationSource !== 'imported_dataset'"
              :can-view-details="canReadCalibration && canUseTraceFeedback(message)"
              :busy="isBusy(message)"
              @satisfied="markEffective(message)"
              @calibrate="openCalibration(message, false)"
              @copy="copyText(message.commentContent || message.typePlaceholder)"
              @details="openDetails(message)"
            />
            <div v-if="shouldShowEvidenceHint(message)" class="comment-message__weak-evidence" :class="{ 'is-neutral': message.evidenceLevel === 'UNATTRIBUTED_ACCOUNT' }">
              {{ message.feedbackReason || '当前账号回复仅可复制，不能进行精确校准。' }}
            </div>
            </div>
          </template>
          <el-empty v-if="!detailLoading && !messages.length" description="暂无评论消息" />
        </div>
      </div>
    </el-drawer>

    <CalibrationFeedbackDialog
      v-model="calibrationDialogVisible"
      :base-payload="null"
      :reply-source="calibrationReplySource"
      :can-analyze="canAnalyzeCalibration"
      :can-update="canUpdateCalibration"
      :can-expand-scope="canExpandCalibrationScope"
      @changed="handleCalibrationChanged"
    />
    <ReplyGenerationDetailsDialog v-model="detailsVisible" :trace="detailTrace" :loading="detailsLoading" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { formatDateTime } from '@/utils/format';
import * as commentApi from '@/api/modules/commentRecords';
import { listRobots, type RobotItem } from '@/api/modules/robots';
import ReplyFeedbackActions from '@/modules/customer-service/components/ReplyFeedbackActions.vue';
import ReplyGenerationDetailsDialog from '@/modules/customer-service/components/ReplyGenerationDetailsDialog.vue';
import CalibrationFeedbackDialog from '@/views/customer-service/simulation/components/CalibrationFeedbackDialog.vue';
import { useReplyRecordFeedback } from '@/modules/customer-service/composables/useReplyRecordFeedback';

const {
  canReadCalibration,
  canCreateCalibration,
  canAnalyzeCalibration,
  canUpdateCalibration,
  canExpandCalibrationScope,
  detailsVisible,
  detailsLoading,
  detailTrace,
  calibrationDialogVisible,
  calibrationReplySource,
  stateFor,
  isBusy,
  markEffective,
  openCalibration,
  openDetails,
  copyText,
  handleCalibrationChanged
} = useReplyRecordFeedback();
const robots = ref<RobotItem[]>([]);
const summary = ref<commentApi.CommentSummary>({
  threadCount: 0, messageCount: 0, rawMessageCount: 0, duplicateCount: 0, userCommentCount: 0, accountReplyCount: 0,
  topLevelCount: 0, followUpCount: 0, repliedThreadCount: 0, unrepliedThreadCount: 0,
  failedCount: 0, notRequiredCount: 0, incompleteThreadCount: 0, videoCount: 0, commenterCount: 0
});
const drawerVisible = ref(false);
const detailLoading = ref(false);
const activeThread = ref<commentApi.CommentThreadItem | null>(null);
const messages = ref<commentApi.CommentMessageItem[]>([]);

const { items, filters, pagination, loading, fetchList, resetFilters } = useRemoteTable<commentApi.CommentThreadItem, commentApi.CommentRecordQuery>(
  { robotId: '', platform: '', keyword: '', replyStatus: '', collectionStatus: '' },
  commentApi.listCommentThreads,
  20
);

const summaryCards = computed(() => [
  { label: '评论线程', value: summary.value.threadCount, hint: `${summary.value.videoCount} 个作品 · 去重 ${summary.value.duplicateCount}` },
  { label: '用户评论', value: summary.value.userCommentCount, hint: `${summary.value.commenterCount} 位评论人` },
  { label: '二级追问', value: summary.value.followUpCount, hint: '用户后续追问' },
  { label: '账号侧回复', value: summary.value.accountReplyCount, hint: '机器人/人工可见回复' },
  { label: '未回复线程', value: summary.value.unrepliedThreadCount, hint: `已回复 ${summary.value.repliedThreadCount}` },
  { label: '部分采集', value: summary.value.incompleteThreadCount, hint: `失败记录 ${summary.value.failedCount}` }
]);

async function reload(resetPage = false) {
  await Promise.all([fetchList(resetPage), loadSummary()]);
}

async function loadSummary() {
  summary.value = await commentApi.getCommentSummary({ ...filters });
}

async function resetAndReload() {
  await resetFilters();
  await loadSummary();
}

async function openThread(row: commentApi.CommentThreadItem) {
  activeThread.value = row;
  messages.value = [];
  drawerVisible.value = true;
  detailLoading.value = true;
  try {
    const result = await commentApi.getCommentThread(row.rootRecordId, { robotId: row.robotId, platform: row.platform });
    activeThread.value = result.thread || row;
    messages.value = result.messages;
  } finally {
    detailLoading.value = false;
  }
}


async function removeThread(row: commentApi.CommentThreadItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.rootAuthor || '未知用户'}」的这条评论线程吗？整合的 ${row.mergedSegmentCount || 1} 个采集段会一起删除。`,
      '删除评论线程',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
    await commentApi.deleteCommentThread(row.rootRecordId, { robotId: row.robotId, platform: row.platform });
    if (drawerVisible.value && activeThread.value?.rootRecordId === row.rootRecordId) drawerVisible.value = false;
    ElMessage.success('评论线程已删除');
    await reload(true);
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') throw error;
  }
}

function messageTime(message: commentApi.CommentMessageItem) {
  return message.commentTime || message.observedAt || message.createdAt || '';
}

function shouldShowTimeDivider(index: number) {
  if (index === 0) return true;
  const current = new Date(messageTime(messages.value[index])).getTime();
  const previous = new Date(messageTime(messages.value[index - 1])).getTime();
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return false;
  const currentDate = new Date(current);
  const previousDate = new Date(previous);
  if (currentDate.toDateString() !== previousDate.toDateString()) return true;
  return current - previous >= 30 * 60 * 1000;
}


function formatMessageClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimelineDivider(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isAccountReplyMessage(message: commentApi.CommentMessageItem) {
  return message.senderRole === 'account';
}

function canUseTraceFeedback(message: commentApi.CommentMessageItem) {
  return message.feedbackMode === 'PRECISE' && Boolean(message.replyTraceId);
}

function shouldShowEvidenceHint(message: commentApi.CommentMessageItem) {
  return isAccountReplyMessage(message) && message.feedbackMode !== 'PRECISE';
}

function evidenceLevelLabel(value: string) {
  return ({
    PRECISE_TRACE: '完整生成追踪',
    VERIFIED_ROBOT_HISTORY: '已确认历史机器人回复',
    UNATTRIBUTED_ACCOUNT: '账号侧来源未确认',
    USER_MESSAGE: '用户消息'
  } as Record<string, string>)[value] || value || '-';
}

function feedbackModeLabel(value: string) {
  return ({ PRECISE: '完整反馈与校准', COPY_ONLY: '仅复制', NONE: '不提供账号回复操作' } as Record<string, string>)[value] || value || '-';
}

function isDecisionOutcome(message: commentApi.CommentMessageItem) {
  return message.senderRole !== 'account'
    && Boolean(message.replyAttemptId)
    && !message.replyContent
    && (message.skipReply || message.replyStatus === 'not_required' || message.replyStatus === 'failed');
}

function hasFeedbackEntry(message: commentApi.CommentMessageItem) {
  return isAccountReplyMessage(message) || shouldShowReplyResult(message) || isDecisionOutcome(message);
}

function shouldShowReplyResult(message: commentApi.CommentMessageItem) {
  if (!message.replyContent) return false;
  if (message.replyStatus !== 'sent') return true;
  const normalized = message.replyContent.replace(/\s+/g, ' ').trim();
  return !messages.value.some((item) => item.senderRole === 'account' && item.commentContent.replace(/\s+/g, ' ').trim() === normalized);
}

function robotName(id: string) {
  return robots.value.find((item) => item.id === id)?.name || id || '-';
}

function platformLabel(value: string) {
  return ({ DOUYIN: '抖音', WECHAT_VIDEO: '微信视频号' } as Record<string, string>)[String(value || '').toUpperCase()] || value || '-';
}

function replyStatusLabel(status: string) {
  return ({ pending: '待处理', generated: '已生成', sent_unconfirmed: '接口成功待回显', sent: '已发送', manual: '人工/既有回复', not_required: '无需回复', failed: '失败' } as Record<string, string>)[status] || status || '未知';
}

function replyTagType(status: string): 'success' | 'warning' | 'danger' | 'info' | '' {
  if (status === 'sent' || status === 'manual') return 'success';
  if (status === 'sent_unconfirmed') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'not_required') return 'info';
  return 'warning';
}

onMounted(async () => {
  const robotPage = await listRobots({ type: 'COMMENT', page: 1, pageSize: 200 });
  robots.value = robotPage.items;
  await reload(true);
});
</script>

<style scoped>
.summary-card { min-height: 108px; }
.comment-thread-timeline { padding: 4px 4px 32px; }
.comment-time-divider { display: flex; align-items: center; justify-content: center; margin: 36px 0 15px; color: var(--el-text-color-secondary); font-size: 12px; }
.comment-time-divider:first-child { margin-top: 8px; }
.comment-time-divider::before, .comment-time-divider::after { content: ''; width: 54px; height: 1px; background: var(--el-border-color-lighter); }
.comment-time-divider span { margin: 0 12px; padding: 3px 10px; border-radius: 999px; background: var(--el-fill-color-lighter); }
.comment-message { margin-top: 12px; }
.comment-message--nested { margin-left: 38px; padding-left: 16px; border-left: 2px solid var(--el-border-color-lighter); }
.comment-message__header { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; font-size: 12px; }
.comment-message__bubble { width: fit-content; max-width: 88%; padding: 10px 14px; border-radius: 10px; line-height: 1.65; background: var(--el-fill-color-light); color: var(--el-text-color-primary); white-space: pre-wrap; word-break: break-word; }
.comment-message--account .comment-message__bubble { margin-left: auto; background: var(--el-color-primary-light-8); }
.comment-message--account .comment-message__header { justify-content: flex-end; }
.comment-message__reply-result { margin-top: 7px; padding: 8px 12px; border-left: 3px solid var(--el-color-success); color: var(--el-text-color-regular); font-size: 12px; }
.comment-message__decision-result { margin-top: 7px; padding: 8px 12px; border-left: 3px solid var(--el-color-warning); color: var(--el-text-color-regular); font-size: 12px; }
.comment-message__media-hint, .comment-message__weak-evidence { margin-top: 4px; font-size: 12px; }
.comment-message__media-hint { color: var(--el-text-color-secondary); }
.comment-message__weak-evidence { color: var(--el-color-warning); }
.comment-message__weak-evidence.is-neutral { color: var(--el-text-color-secondary); }
.comment-message--account .reply-feedback-actions, .comment-message--account .comment-message__weak-evidence { text-align: right; }

.reply-feedback-host:hover :deep(.reply-feedback-actions__desktop),
.reply-feedback-host:focus-within :deep(.reply-feedback-actions__desktop) {
  opacity: 1;
  pointer-events: auto;
}

</style>
