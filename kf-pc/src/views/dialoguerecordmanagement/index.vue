<template>
  <div class="space-y-4">
    <PageToolbar title="对话记录" description="服务端集中保存私信文字记录；PC 默认按联系人整合展示，底层回复上下文仍按 canonical conversation ID 安全隔离。">
      <el-form :inline="true" :model="filters" class="flex flex-wrap gap-y-2">
        <el-form-item label="机器人">
          <el-select v-model="filters.robotId" clearable filterable placeholder="全部机器人" style="width: 220px">
            <el-option v-for="robot in robots" :key="robot.id" :label="robot.name" :value="robot.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="filters.platform" clearable placeholder="全部平台" style="width: 140px">
            <el-option label="抖音" value="DOUYIN" />
            <el-option label="微信视频号" value="WECHAT_VIDEO" />
          </el-select>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="filters.nickname" clearable placeholder="聊天对象昵称" style="width: 180px" @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="filters.keyword" clearable placeholder="搜索消息内容" style="width: 220px" @keyup.enter="fetchList(true)" />
        </el-form-item>
        <el-form-item label="身份状态">
          <el-select v-model="filters.identityStatus" clearable placeholder="全部状态" style="width: 140px">
            <el-option label="已确认" value="CONFIRMED" />
            <el-option label="临时隔离" value="PROVISIONAL" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList(true)">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-dropdown :disabled="!selectedIds.length" @command="handleExport">
          <el-button :disabled="!selectedIds.length">导出选中<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="csv">导出 CSV</el-dropdown-item>
              <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="danger" plain :disabled="!selectedIds.length" @click="deleteSelected">删除选中</el-button>
        <el-button type="danger" @click="purgeFiltered">清理当前筛选</el-button>
      </template>
    </PageToolbar>

    <CrudTablePanel title="服务端对话列表" description="同一机器人、平台、私信范围和昵称下的多个 canonical 会话段会整合为一个联系人；跨会话段的历史重复副本不会进入展示、导出和统计。">
      <el-table v-loading="loading" :data="items" row-key="id" stripe @selection-change="onSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column label="聊天对象" min-width="170" fixed="left">
          <template #default="{ row }">
            <el-button link type="primary" @click="openMessages(row)">{{ row.displayName || '未知用户' }}</el-button>
            <div class="mt-1 text-xs text-slate-400">
              {{ row.conversationCount > 1 ? `已整合 ${row.conversationCount} 个会话段` : row.id }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="机器人" min-width="160">
          <template #default="{ row }">{{ robotName(row.robotId) }}</template>
        </el-table-column>
        <el-table-column label="平台" width="120">
          <template #default="{ row }">{{ platformLabel(row.platform) }}</template>
        </el-table-column>
        <el-table-column label="身份状态" width="150">
          <template #default="{ row }">
            <el-tag :type="row.identityStatus === 'CONFIRMED' ? 'success' : 'warning'" effect="plain">
              {{ row.identityStatus === 'CONFIRMED' ? '已确认' : '临时隔离' }} · {{ row.identityConfidence }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="消息数" width="110">
          <template #default="{ row }">
            <div>{{ row.messageCount }}</div>
            <div v-if="row.deduplicatedMessageCount" class="mt-1 text-xs text-slate-400">
              已过滤 {{ row.deduplicatedMessageCount }} 条重复
            </div>
          </template>
        </el-table-column>
        <el-table-column label="数据整合" min-width="230" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.conversationCount > 1">同一联系人 · {{ row.conversationCount }} 个会话段</span>
            <span v-else>{{ row.lastMatchReason || '-' }}</span>
            <span v-if="row.deduplicatedMessageCount"> · 原始 {{ row.rawMessageCount }} 条</span>
          </template>
        </el-table-column>
        <el-table-column label="最后消息" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastMessageAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openMessages(row)">查看</el-button>
            <el-button link type="danger" @click="deleteOne(row)">删除</el-button>
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

    <el-drawer v-model="drawerVisible" :title="`联系人详情 · ${activeConversation?.displayName || ''}`" size="720px">
      <div v-loading="messageLoading" class="dialogue-timeline">
        <el-alert
          v-if="activeConversation && (activeConversation.conversationCount > 1 || messageDeduplicatedCount > 0)"
          :title="contactSummary"
          type="info"
          :closable="false"
          show-icon
        />

        <template v-for="entry in timelineItems" :key="entry.key">
          <div
            v-if="entry.type === 'separator'"
            class="timeline-separator"
            :class="{ 'timeline-separator--first': entry.isFirst }"
          >
            <span class="timeline-separator__line" />
            <span class="timeline-separator__label">{{ entry.label }}</span>
            <span class="timeline-separator__line" />
          </div>

          <div
            v-else-if="entry.message"
            class="timeline-message"
            :class="[
              entry.message.senderRole === 'account' ? 'timeline-message--account' : 'timeline-message--user',
              { 'reply-feedback-host': isAccountReplyMessage(entry.message) }
            ]"
            :tabindex="isAccountReplyMessage(entry.message) ? 0 : undefined"
          >
            <div class="timeline-message__meta">
              <span>{{ entry.message.senderRole === 'account' ? '账号侧' : '用户侧' }}</span>
              <span>·</span>
              <span>{{ formatMessageTime(entry.message.observedAt) }}</span>
              <el-popover placement="left" :width="330" trigger="click">
                <template #reference>
                  <el-button link size="small" class="timeline-message__detail-button">数据详情</el-button>
                </template>
                <div class="space-y-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  <div><span class="text-slate-400">会话段：</span>{{ entry.message.conversationId || '-' }}</div>
                  <div><span class="text-slate-400">本地会话：</span>{{ entry.message.localConversationId || '-' }}</div>
                  <div><span class="text-slate-400">客户端消息：</span>{{ entry.message.clientMessageId || '-' }}</div>
                  <div><span class="text-slate-400">顺序值：</span>{{ entry.message.sequenceIndex || '-' }}</div>
                  <div><span class="text-slate-400">消息类型：</span>{{ entry.message.messageType || '-' }}</div>
                  <div><span class="text-slate-400">历史口径：</span>{{ entry.message.historyKind || '-' }}</div>
                  <div><span class="text-slate-400">时间精度：</span>{{ entry.message.timeAccuracy || '-' }}</div>
                  <div><span class="text-slate-400">来源：</span>{{ entry.message.actorSource || '-' }}</div>
                  <div><span class="text-slate-400">来源说明：</span>{{ entry.message.sourceLabel || '-' }}</div>
                  <div><span class="text-slate-400">归因：</span>{{ entry.message.attributionConfidence || '-' }}</div>
                  <div><span class="text-slate-400">证据等级：</span>{{ evidenceLevelLabel(entry.message.evidenceLevel) }}</div>
                  <div><span class="text-slate-400">操作范围：</span>{{ feedbackModeLabel(entry.message.feedbackMode) }}</div>
                  <div v-if="entry.message.replyAttemptId"><span class="text-slate-400">回复尝试：</span>{{ entry.message.replyAttemptId }}</div>
                  <div v-if="entry.message.replyTraceId"><span class="text-slate-400">回复追踪：</span>{{ entry.message.replyTraceId }}</div>
                  <div v-if="entry.message.generationSource"><span class="text-slate-400">生成来源：</span>{{ entry.message.generationSource }}</div>
                </div>
              </el-popover>
            </div>
            <div class="timeline-message__bubble">
              {{ entry.message.textContent || entry.message.typePlaceholder || `[${entry.message.messageType}]` }}
            </div>
            <div v-if="entry.message.mediaLabel" class="timeline-message__media-hint">{{ entry.message.mediaLabel }}</div>
            <ReplyFeedbackActions
              v-if="isAccountReplyMessage(entry.message)"
              positive-label="有效"
              positive-done-label="已标记有效"
              calibrate-label="需校准"
              :feedback="stateFor(entry.message).feedback"
              :calibration-status="stateFor(entry.message).calibrationStatus"
              :strategy-draft-status="stateFor(entry.message).strategyDraftStatus"
              :has-trace="Boolean(entry.message.replyTraceId)"
              :can-feedback="canCreateCalibration && canUsePreciseFeedback(entry.message)"
              :can-calibrate="canCreateCalibration && canReadCalibration && canUsePreciseFeedback(entry.message) && entry.message.generationSource !== 'imported_dataset'"
              :can-view-details="canReadCalibration && canUsePreciseFeedback(entry.message)"
              :busy="isBusy(entry.message)"
              @satisfied="markEffective(entry.message)"
              @calibrate="openCalibration(entry.message, false)"
              @copy="copyText(entry.message.textContent || entry.message.typePlaceholder)"
              @details="openDetails(entry.message)"
            />
            <div v-if="isAccountReplyMessage(entry.message) && entry.message.feedbackMode !== 'PRECISE'" class="timeline-message__weak-evidence" :class="{ 'is-neutral': entry.message.evidenceLevel === 'UNATTRIBUTED_ACCOUNT' }">
              {{ entry.message.feedbackReason || '当前账号回复仅可复制，不能进行精确校准。' }}
            </div>
          </div>
        </template>

        <el-empty v-if="!messageLoading && !messages.length" description="暂无消息" />
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
import { ArrowDown } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { useRemoteTable } from '@/composables/useRemoteTable';
import { formatDateTime } from '@/utils/format';
import * as dialogueApi from '@/api/modules/dialogueRecords';
import { listRobots, type RobotItem } from '@/api/modules/robots';
import ReplyFeedbackActions from '@/modules/customer-service/components/ReplyFeedbackActions.vue';
import ReplyGenerationDetailsDialog from '@/modules/customer-service/components/ReplyGenerationDetailsDialog.vue';
import CalibrationFeedbackDialog from '@/views/customer-service/simulation/components/CalibrationFeedbackDialog.vue';
import { useReplyRecordFeedback } from '@/modules/customer-service/composables/useReplyRecordFeedback';

interface TimelineEntry {
  key: string;
  type: 'separator' | 'message';
  label?: string;
  isFirst?: boolean;
  message?: dialogueApi.DialogueMessageItem;
}

const CONVERSATION_GAP_MS = 30 * 60 * 1000;
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
const selectedIds = ref<string[]>([]);
const drawerVisible = ref(false);
const messageLoading = ref(false);
const messages = ref<dialogueApi.DialogueMessageItem[]>([]);
const messageRawTotal = ref(0);
const messageDeduplicatedCount = ref(0);
const activeConversation = ref<dialogueApi.DialogueConversationItem | null>(null);

const timelineItems = computed<TimelineEntry[]>(() => {
  const result: TimelineEntry[] = [];
  let previousTime = 0;
  let previousDateKey = '';
  messages.value.forEach((message, index) => {
    const currentTime = message.observedAt ? new Date(message.observedAt).getTime() : 0;
    const currentDateKey = currentTime ? localDateKey(new Date(currentTime)) : '';
    const needsSeparator = index === 0
      || (currentDateKey && currentDateKey !== previousDateKey)
      || (currentTime && previousTime && currentTime - previousTime >= CONVERSATION_GAP_MS);
    if (needsSeparator) {
      result.push({
        key: `separator-${message.id}`,
        type: 'separator',
        label: formatConversationStart(message.observedAt),
        isFirst: index === 0
      });
    }
    result.push({ key: `message-${message.id}`, type: 'message', message });
    if (currentTime) previousTime = currentTime;
    if (currentDateKey) previousDateKey = currentDateKey;
  });
  return result;
});

const contactSummary = computed(() => {
  const segmentCount = activeConversation.value?.conversationCount || 1;
  const effectiveCount = messages.value.length;
  const segmentText = segmentCount > 1 ? `已整合 ${segmentCount} 个历史会话段` : '当前联系人记录';
  if (messageDeduplicatedCount.value > 0) {
    return `${segmentText}，原始 ${messageRawTotal.value} 条，已过滤 ${messageDeduplicatedCount.value} 条跨会话重复记录，当前显示 ${effectiveCount} 条有效消息`;
  }
  return `${segmentText}，共 ${effectiveCount} 条有效消息`;
});

const { items, filters, pagination, loading, fetchList, resetFilters: resetRemoteFilters } = useRemoteTable<
  dialogueApi.DialogueConversationItem,
  dialogueApi.DialogueConversationQuery
>(
  { robotId: '', platform: 'DOUYIN', nickname: '', keyword: '', identityStatus: '' },
  dialogueApi.listDialogueConversations,
  20
);

onMounted(async () => {
  const result = await listRobots({ type: 'PRIVATE_MESSAGE', page: 1, pageSize: 100 });
  robots.value = result.items;
  await fetchList();
});

function resetFilters() {
  resetRemoteFilters();
  filters.platform = 'DOUYIN';
}

function robotName(id: string) {
  return robots.value.find((item) => item.id === id)?.name || id || '-';
}

function platformLabel(platform: string) {
  const value = String(platform || '').toUpperCase();
  if (value === 'DOUYIN') return '抖音';
  if (value === 'WECHAT_VIDEO') return '微信视频号';
  return platform || '-';
}

function onSelectionChange(rows: dialogueApi.DialogueConversationItem[]) {
  selectedIds.value = rows.map((item) => item.id);
}

async function openMessages(row: dialogueApi.DialogueConversationItem) {
  activeConversation.value = row;
  drawerVisible.value = true;
  messageLoading.value = true;
  messages.value = [];
  messageRawTotal.value = 0;
  messageDeduplicatedCount.value = 0;
  try {
    const result = await loadAllDialogueMessages(row.id);
    const guarded = deduplicateStrongMessageCopies(result.items);
    messages.value = guarded.items;
    messageRawTotal.value = Math.max(result.rawTotal, result.items.length);
    messageDeduplicatedCount.value = result.deduplicatedCount + guarded.duplicateCount;
  } finally {
    messageLoading.value = false;
  }
}

async function loadAllDialogueMessages(conversationId: string) {
  const pageSize = 500;
  const items: dialogueApi.DialogueMessageItem[] = [];
  let page = 1;
  let total = 0;
  let rawTotal = 0;
  let deduplicatedCount = 0;
  do {
    const result = await dialogueApi.listDialogueMessages(conversationId, { page, pageSize });
    items.push(...result.items);
    total = result.total;
    rawTotal = result.rawTotal;
    deduplicatedCount = result.deduplicatedCount;
    if (!result.items.length) break;
    page += 1;
  } while (items.length < total);
  return { items, total, rawTotal, deduplicatedCount };
}

function deduplicateStrongMessageCopies(items: dialogueApi.DialogueMessageItem[]) {
  const result: dialogueApi.DialogueMessageItem[] = [];
  const seenClientIds = new Set<string>();
  const seenSequenceCopies = new Map<string, dialogueApi.DialogueMessageItem>();
  const accountEchoCandidates = new Map<string, number[]>();
  let duplicateCount = 0;
  for (const item of items) {
    const content = normalizedMessageContent(item);
    const localConversationId = String(item.localConversationId || '');
    const sequenceIndex = Number(item.sequenceIndex || 0);
    const clientMessageId = String(item.clientMessageId || '');
    const clientKey = clientMessageId ? `client|${item.sourceClientId || ''}|${clientMessageId}` : '';
    const sequenceKey = localConversationId && sequenceIndex
      ? `seq|${localConversationId}|${item.senderRole}|${sequenceIndex}|${item.messageType}|${content}`
      : '';

    // Exact client ID is an absolute duplicate. Sequence/content evidence is only used
    // across different historical conversation segments; within one segment, two genuine
    // same-second repeated texts must remain visible.
    if (clientKey && seenClientIds.has(clientKey)) {
      duplicateCount += 1;
      continue;
    }
    const previousSequenceCopy = sequenceKey ? seenSequenceCopies.get(sequenceKey) : undefined;
    if (previousSequenceCopy && previousSequenceCopy.conversationId !== item.conversationId) {
      duplicateCount += 1;
      continue;
    }

    // 微信视频号会从发送接口、xhr 和两个 Tab 多次回传同一账号回复。
    // 仅折叠“已验证机器人回复 + 无回复事务的平台账号回显”这一强证据组合，
    // 两条真正独立的机器人回复（各自有 replyAttemptId）仍完整保留。
    const echoKey = item.senderRole === 'account' && localConversationId
      ? `echo|${localConversationId}|${item.messageType}|${content}`
      : '';
    if (echoKey) {
      const candidateIndexes = accountEchoCandidates.get(echoKey) || [];
      let collapsed = false;
      for (let index = candidateIndexes.length - 1; index >= 0; index -= 1) {
        const resultIndex = candidateIndexes[index];
        const previous = result[resultIndex];
        if (!previous || !isLikelyAccountEchoCopy(previous, item)) continue;
        if (messageEvidenceScore(item) > messageEvidenceScore(previous)) result[resultIndex] = item;
        duplicateCount += 1;
        collapsed = true;
        break;
      }
      if (collapsed) continue;
      candidateIndexes.push(result.length);
      accountEchoCandidates.set(echoKey, candidateIndexes.slice(-8));
    }

    if (clientKey) seenClientIds.add(clientKey);
    if (sequenceKey && !previousSequenceCopy) seenSequenceCopies.set(sequenceKey, item);
    result.push(item);
  }
  return { items: result, duplicateCount };
}

function normalizedMessageContent(item: dialogueApi.DialogueMessageItem) {
  return String(item.textContent || item.typePlaceholder || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function isAccountReplyMessage(item: dialogueApi.DialogueMessageItem) {
  return item.senderRole === 'account';
}

function canUsePreciseFeedback(item: dialogueApi.DialogueMessageItem) {
  return item.feedbackMode === 'PRECISE' && Boolean(item.replyTraceId);
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

function isWeakPlatformAccountEcho(item: dialogueApi.DialogueMessageItem) {
  return item.senderRole === 'account'
    && !item.replyAttemptId
    && (!item.actorSource || item.actorSource === 'account_manual' || item.actorSource === 'platform_self_echo');
}

function messageObservedMs(item: dialogueApi.DialogueMessageItem) {
  const observed = item.observedAt ? new Date(item.observedAt).getTime() : 0;
  if (Number.isFinite(observed) && observed > 0) return observed;
  const sequence = Number(item.sequenceIndex || 0);
  return sequence ? sequence * 1000 : 0;
}

function isLikelyAccountEchoCopy(left: dialogueApi.DialogueMessageItem, right: dialogueApi.DialogueMessageItem) {
  if (left.localConversationId !== right.localConversationId) return false;
  if (left.messageType !== right.messageType) return false;
  if (normalizedMessageContent(left) !== normalizedMessageContent(right)) return false;
  const strongWeakPair = (isVerifiedRobotMessage(left) && isWeakPlatformAccountEcho(right))
    || (isVerifiedRobotMessage(right) && isWeakPlatformAccountEcho(left));
  if (!strongWeakPair) return false;
  const leftTime = messageObservedMs(left);
  const rightTime = messageObservedMs(right);
  return Boolean(leftTime && rightTime && Math.abs(leftTime - rightTime) <= 45_000);
}

function messageEvidenceScore(item: dialogueApi.DialogueMessageItem) {
  let score = 0;
  if (item.historyKind === 'live_observed') score += 20;
  if (item.attributionConfidence === 'verified') score += 20;
  if (item.actorSource === 'ucp_robot') score += 10;
  if (item.replyAttemptId) score += 30;
  return score;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatConversationStart(value?: string) {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hour}:${minute}`;
}

function formatMessageTime(value?: string) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function deleteOne(row: dialogueApi.DialogueConversationItem) {
  await ElMessageBox.confirm(
    `确定永久删除联系人“${row.displayName}”及其 ${row.conversationCount || 1} 个会话段的全部消息吗？`,
    '删除联系人记录',
    { type: 'warning' }
  );
  const result = await dialogueApi.deleteDialogueConversations([row.id]);
  ElMessage.success(`已删除 ${result.contactCount || 1} 个联系人、${result.deletedCount} 个会话段，并建立 ${result.watermarkCount || 0} 条防回灌水位`);
  await fetchList();
}

async function deleteSelected() {
  await ElMessageBox.confirm(`确定永久删除选中的 ${selectedIds.value.length} 个联系人及其全部会话段吗？`, '批量删除', { type: 'warning' });
  const result = await dialogueApi.deleteDialogueConversations(selectedIds.value);
  selectedIds.value = [];
  ElMessage.success(`已删除 ${result.contactCount || 0} 个联系人、${result.deletedCount} 个会话段，并建立 ${result.watermarkCount || 0} 条防回灌水位`);
  await fetchList();
}

async function purgeFiltered() {
  const value = await ElMessageBox.prompt('该操作会永久删除当前筛选条件命中的全部对话。请输入 DELETE 确认。', '清理测试脏数据', {
    inputPattern: /^DELETE$/,
    inputErrorMessage: '必须输入 DELETE',
    type: 'warning'
  });
  if (value.value !== 'DELETE') return;
  const result = await dialogueApi.purgeDialogueRecords({
    confirm: 'DELETE',
    robotId: filters.robotId || undefined,
    platform: filters.platform || undefined,
    nickname: filters.nickname || undefined,
    keyword: filters.keyword || undefined,
    identityStatus: filters.identityStatus || undefined
  });
  ElMessage.success(`已清理 ${result.contactCount || 0} 个联系人、${result.deletedCount} 个会话段，并建立 ${result.watermarkCount || 0} 条防回灌水位`);
  await fetchList(true);
}

async function handleExport(format: 'csv' | 'json') {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选要导出的联系人记录');
    return;
  }
  const result = await dialogueApi.exportDialogueRecords({
    conversationIds: selectedIds.value.join(','),
    robotId: filters.robotId || undefined,
    platform: filters.platform || undefined,
    nickname: filters.nickname || undefined,
    keyword: filters.keyword || undefined,
    identityStatus: filters.identityStatus || undefined,
    format
  });
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  ElMessage.success(`已导出 ${result.conversationCount} 个联系人、${result.canonicalConversationCount || result.conversationCount} 个会话段、${result.messageCount} 条有效消息`);
}
</script>

<style scoped>
.dialogue-timeline {
  min-height: 160px;
  padding: 0 10px 28px;
}

.timeline-separator {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 36px;
  margin-bottom: 15px;
}

.timeline-separator--first {
  margin-top: 14px;
}

.timeline-separator__line {
  height: 1px;
  flex: 1;
  background: var(--el-border-color-lighter);
}

.timeline-separator__label {
  flex: none;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  padding: 5px 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

.timeline-message {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.timeline-message--account {
  align-items: flex-end;
}

.timeline-message--user {
  align-items: flex-start;
}

.timeline-message__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  line-height: 18px;
}

.timeline-message__detail-button {
  margin-left: 2px;
  padding: 0;
  min-height: auto;
  font-size: 12px;
}

.timeline-message__bubble {
  max-width: 88%;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  padding: 9px 12px;
  color: var(--el-text-color-primary);
  line-height: 1.65;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.timeline-message__media-hint,
.timeline-message__weak-evidence {
  margin-top: 4px;
  font-size: 12px;
}

.timeline-message__media-hint {
  color: var(--el-text-color-secondary);
}

.timeline-message__weak-evidence {
  color: var(--el-color-warning);
}

.timeline-message__weak-evidence.is-neutral {
  color: var(--el-text-color-secondary);
}

.timeline-message--account .timeline-message__weak-evidence {
  text-align: right;
}

.timeline-message--account .timeline-message__bubble {
  background: var(--el-color-primary-light-9);
}

.reply-feedback-host:hover :deep(.reply-feedback-actions__desktop),
.reply-feedback-host:focus-within :deep(.reply-feedback-actions__desktop) {
  opacity: 1;
  pointer-events: auto;
}

</style>
