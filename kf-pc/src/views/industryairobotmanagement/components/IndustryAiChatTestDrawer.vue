<template>
  <el-drawer v-model="visible" direction="rtl" size="760px" :with-header="false" destroy-on-close>
    <div class="flex h-full flex-col gap-4">
      <div class="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-base font-semibold text-slate-800 dark:text-slate-100">{{ robot?.name || '行业 AI 机器人' }} · DeepSeek 聊天测试</div>
            <div class="mt-1 text-xs leading-5 text-slate-500">仅用于后台测试。用户最后一条消息静默 15 秒后才处理；固定回复、非店铺消息策略和安全策略不会调用 DeepSeek，也不会发送真实消息或执行订单操作。</div>
          </div>
          <div class="flex gap-2">
            <el-button @click="startNewSession">新建会话</el-button>
            <el-button @click="clearMessages">清空本地显示</el-button>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div class="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"><span class="text-slate-400">渠道：</span>{{ channelLabel }}</div>
          <div class="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"><span class="text-slate-400">行业：</span>{{ robot?.industryName || robot?.capabilityPack?.industryName || '未填写' }}</div>
          <div class="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"><span class="text-slate-400">能力包：</span>{{ packText }}</div>
        </div>
        <div class="mt-3">
          <el-select v-model="accountProfileId" clearable filterable class="w-full" placeholder="选择测试账号身份（选择后先匹配其知识库固定问答）">
            <el-option v-for="item in accounts" :key="item.id" :label="`${item.name}${item.storeProfile?.name ? ` · ${item.storeProfile.name}` : ''}${item.merchantRole?.name ? ` · ${item.merchantRole.name}` : ''}`" :value="item.id" />
          </el-select>
          <div class="mt-1 text-xs text-slate-400">固定问答按该账号所属店铺 / 客服身份 / 账号 Knowledge Applicability 生效；命中后随机 Loading 几秒并直接回复，DeepSeek 不调用。</div>
        </div>
        <el-collapse class="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 dark:border-slate-800 dark:bg-slate-950/20">
          <el-collapse-item name="orderContext">
            <template #title>
              <span class="text-xs font-medium text-slate-600 dark:text-slate-300">模拟订单上下文（仅测试，不写真实订单）</span>
            </template>
            <div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <el-input v-model="orderContext.platformOrderNo" size="small" placeholder="模拟订单号，如 KH202607080001" />
              <el-input v-model="orderContext.orderStatus" size="small" placeholder="订单状态，如 已发货 / 待发货" />
              <el-input v-model="orderContext.fulfillmentStatus" size="small" placeholder="发货/仓库状态，如 已出库待揽收" />
              <el-input v-model="orderContext.logisticsStatus" size="small" placeholder="物流状态，如 停留中转站 3 天未更新" />
              <el-input v-model="orderContext.afterSalesStatus" size="small" placeholder="售后状态，如 无售后 / 待核实" />
              <el-input v-model="orderContext.refundStatus" size="small" placeholder="退款状态，如 未退款 / 退款中" />
            </div>
            <el-input
              v-model="orderContext.orderNotes"
              class="mt-3"
              type="textarea"
              :rows="3"
              maxlength="8000"
              show-word-limit
              placeholder="订单历史备注，每行一条。建议格式：2026-07-08 10:30 AI客服：客户反馈物流多日未更新，已催件等待反馈。（客户情绪：不满）"
            />
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs text-slate-400">用于验证未来读取订单、物流和备注后的回复效果；当前不会写入真实订单。</div>
              <div class="flex gap-2">
                <el-button size="small" @click="fillLogisticsExample">填入物流示例</el-button>
                <el-button size="small" @click="clearOrderContext">清空</el-button>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div ref="messageContainer" class="app-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/20">
        <div v-if="!messages.length" class="flex h-full min-h-[300px] items-center justify-center">
          <div class="max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm leading-6 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
            可连续发送多条模拟用户消息。最后一条消息静默 15 秒后，系统会把这一段连续消息合并理解，再生成一段日常客服式测试回复。
          </div>
        </div>
        <div v-for="item in messages" :key="item.id" class="flex" :class="item.role === 'user' ? 'justify-end' : 'justify-start'">
          <div class="max-w-[86%]">
            <div class="mb-1 px-1 text-xs text-slate-400" :class="item.role === 'user' ? 'text-right' : 'text-left'">
              {{ item.role === 'user' ? '测试用户' : item.trace?.replySuppressed ? '测试策略结果' : robot?.name || '行业 AI 机器人' }}
            </div>
            <div
              class="whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm"
              :class="item.role === 'user'
                ? 'rounded-br-md bg-emerald-500 text-white'
                : item.trace?.replySuppressed
                  ? 'rounded-bl-md border border-dashed border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200'
                  : 'rounded-bl-md border border-slate-100 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'"
            >
              {{ item.content }}
            </div>
            <div v-if="item.trace" class="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
              <div class="flex flex-wrap gap-x-3 gap-y-1">
                <span>回复来源：{{ replySourceLabel(item.trace) }}</span>
                <template v-if="item.trace.source === 'fixed_reply' && item.trace.fixedReplyRule">
                  <span>命中规则：{{ item.trace.fixedReplyRule.name || '--' }}</span>
                  <span>匹配：{{ fixedMatchTypeLabel(item.trace.fixedReplyRule.matchType) }}</span>
                  <span>DeepSeek：未调用</span>
                </template>
                <template v-else-if="item.trace.source === 'policy'">
                  <span>行业判断：{{ decisionCategoryLabel(item.trace.conversationDecision?.category) }}</span>
                  <span>处理：{{ decisionActionLabel(item.trace.conversationDecision?.action) }}</span>
                  <span>原因：{{ item.trace.conversationDecision?.reasonLabel || '--' }}</span>
                  <span>DeepSeek：未调用</span>
                </template>
                <template v-else-if="item.trace.replyGeneration">
                  <span>场景：{{ item.trace.scenarioName || '未命中行业场景' }}</span>
                  <span>回复方式：{{ generationModeLabel(item.trace) }}</span>
                  <span>DeepSeek：{{ item.trace.replyGeneration.modelCalled ? '已调用' : '未调用' }}</span>
                  <span v-if="item.trace.replyGeneration.modelCalled">模型：{{ item.trace.replyGeneration.modelName || item.trace.model || 'DeepSeek' }}</span>
                </template>
                <template v-else>
                  <span>场景：{{ item.trace.scenarioName || '未命中行业场景' }}</span>
                  <span>模型：{{ item.trace.model || 'DeepSeek' }}</span>
                </template>
                <span>风险：{{ riskLabel(item.trace.riskLevel) }}</span>
                <span v-if="item.trace.customerCarePlan?.focusLabel">处理重点：{{ item.trace.customerCarePlan.focusLabel }}</span>
                <span v-if="item.trace.elapsedMs">耗时：{{ item.trace.elapsedMs }}ms</span>
              </div>
              <div v-if="item.trace.fixedReplyRule?.matchedPhrases?.length" class="mt-1 text-slate-400">命中词：{{ item.trace.fixedReplyRule.matchedPhrases.join('、') }}</div>
              <div v-if="item.trace.conversationDecision?.scopeSignals?.length" class="mt-1 text-slate-400">范围依据：{{ item.trace.conversationDecision.scopeSignals.join('、') }}</div>
              <div v-if="item.trace.customerCarePlan?.actionFirstGuidance" class="mt-1 text-slate-400">处理动作：{{ item.trace.customerCarePlan.actionFirstGuidance }}</div>
              <div v-if="item.trace.replyGeneration" class="mt-1 rounded-md border border-amber-100 bg-amber-50/70 px-2 py-1 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                <div class="font-medium">最终回复策略：{{ item.trace.replyGeneration.strategyLabel || '--' }}</div>
                <div>升级处理：{{ item.trace.replyGeneration.escalationTriggered ? '是' : '否' }}；重复话术抑制：{{ item.trace.replyGeneration.repetitionSuppressed ? '是' : '否' }}；动作优先：{{ item.trace.replyGeneration.actionFirst ? '是' : '否' }}</div>
                <div v-if="item.trace.replyGeneration.reason" class="text-amber-600/80 dark:text-amber-200/80">原因：{{ item.trace.replyGeneration.reason }}</div>
              </div>
              <div v-if="item.trace.businessContext" class="mt-1 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                <div class="font-medium">经营策略：{{ item.trace.businessContext.conversationTypeLabel || '--' }} · {{ item.trace.businessContext.customerStageLabel || '--' }} · {{ item.trace.businessContext.handoffDecisionLabel || '--' }}</div>
                <div v-if="item.trace.businessContext.customerIntent">客户真实意图：{{ item.trace.businessContext.customerIntent }}</div>
                <div v-if="item.trace.businessContext.businessGoal?.length">商家目标：{{ item.trace.businessContext.businessGoal.join(' + ') }}</div>
                <div v-if="item.trace.businessContext.conversationStrategy">沟通策略：{{ item.trace.businessContext.conversationStrategy }}</div>
                <div v-if="item.trace.businessContext.nextAction">下一步：{{ item.trace.businessContext.nextAction }}</div>
                <div>经营风险：{{ item.trace.businessContext.riskLevelLabel || '--' }}；挽留次数：{{ item.trace.businessContext.retentionCount ?? 0 }}；停止挽留：{{ item.trace.businessContext.shouldStopRetention ? '是' : '否' }}</div>
              </div>
              <div v-if="item.trace.orderServiceContext" class="mt-1 rounded-md bg-slate-50 px-2 py-1 text-slate-500 dark:bg-slate-800/60">
                <div>订单上下文：{{ item.trace.orderServiceContext.hasOrderContext ? '模拟数据' : '未提供' }}；客户情绪：{{ item.trace.orderServiceContext.customerEmotion?.label || '--' }}；客服动作：{{ item.trace.orderServiceContext.serviceAction?.label || '--' }}</div>
                <div v-if="item.trace.orderServiceContext.previousEmotion?.label">历史情绪：{{ item.trace.orderServiceContext.previousEmotion.label }}</div>
                <div v-if="item.trace.orderServiceContext.recentOrderNotes?.length">已读取备注：{{ item.trace.orderServiceContext.orderNoteCount || item.trace.orderServiceContext.recentOrderNotes.length }} 条</div>
                <div v-if="item.trace.orderServiceContext.replyContextSummary" class="mt-1 text-slate-400">备注转述：{{ item.trace.orderServiceContext.replyContextSummary }}</div>
                <div v-if="item.trace.orderServiceContext.actionExecutionNote" class="mt-1 text-slate-400">动作边界：{{ item.trace.orderServiceContext.actionExecutionNote }}</div>
                <div v-if="item.trace.orderServiceContext.suggestedOrderNote" class="mt-1 text-slate-400">拟追加备注：{{ item.trace.orderServiceContext.suggestedOrderNote }}</div>
              </div>
              <div v-if="item.trace.replyQuality?.status === 'RETRIED'" class="mt-1 text-amber-600 dark:text-amber-300">回复校验：首次模型输出不完整，已自动重试后返回完整回复。</div>
              <div v-else-if="item.trace.replyQuality?.status === 'FALLBACK'" class="mt-1 text-amber-600 dark:text-amber-300">回复校验：模型两次输出都不完整，已改用当前场景的安全兜底回复。</div>
              <div v-if="item.trace.replySuppressed" class="mt-1 text-amber-600 dark:text-amber-300">真实接入后，本条不会向客户发送任何回复。</div>
              <div v-else-if="item.trace.shouldHandoff" class="mt-1 text-amber-600 dark:text-amber-300">本条建议由售后或人工客服继续核实。</div>
            </div>
          </div>
        </div>
        <div v-if="waitingForQuietPeriod" class="flex justify-start">
          <div class="rounded-2xl rounded-bl-md border border-dashed border-emerald-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500 shadow-sm dark:border-emerald-900/70 dark:bg-slate-800">
            已收到 {{ pendingMessages.length }} 条连续消息，正在等用户发送完。{{ quietPeriodSecondsLeft }} 秒内没有新消息才会回复。
          </div>
        </div>
        <div v-if="generating" class="flex justify-start">
          <div class="rounded-2xl rounded-bl-md border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800">正在整理连续消息、读取模拟订单上下文、分析客户阶段并生成回复…</div>
        </div>
      </div>

      <div class="shrink-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="3"
          resize="none"
          maxlength="3000"
          show-word-limit
          :disabled="!robot"
          placeholder="输入模拟用户消息，例如：快递已经发了还能改地址吗？"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="text-xs text-slate-500">Enter 发送一条消息，Shift + Enter 换行。15 秒内继续发送会重新计时。</div>
          <div class="flex gap-2">
            <SampleFillButton label="填入测试样例" :has-content="Boolean(inputText.trim())" @fill="fillChatSample" />
            <el-button type="primary" :disabled="!robot || !inputText.trim()" @click="sendMessage">发送测试消息</el-button>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { listCustomerServiceAccountProfiles } from '@/modules/customer-service/api/context-profiles.api';
import { resolveCustomerServiceFixedQa } from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceAccountProfile } from '@/modules/customer-service/types/context-profiles.types';
import { ElMessage } from 'element-plus';
import { testIndustryAiRobot, type IndustryAiRobot, type IndustryAiTestOrderContext, type IndustryAiTestTrace } from '@/api/modules/industryAi';
import SampleFillButton from '@/components/common/SampleFillButton.vue';

interface TestChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace?: IndustryAiTestTrace;
}

interface PendingUserMessage {
  id: string;
  content: string;
  createdAtMs: number;
}

const QUIET_PERIOD_SECONDS = 15;
const QUIET_PERIOD_MS = QUIET_PERIOD_SECONDS * 1000;
const MAX_COMBINED_MESSAGE_LENGTH = 12000;

const props = defineProps<{ modelValue: boolean; robot?: IndustryAiRobot | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });
const inputText = ref('');
const generating = ref(false);
const sessionId = ref('');
const messages = ref<TestChatMessage[]>([]);
const pendingMessages = ref<PendingUserMessage[]>([]);
const quietPeriodSecondsLeft = ref(QUIET_PERIOD_SECONDS);
const messageContainer = ref<HTMLElement>();
const orderContext = ref<IndustryAiTestOrderContext>({});
const accounts = ref<CustomerServiceAccountProfile[]>([]);
const accountProfileId = ref('');

let latestPendingMessageAt = 0;
let replyTimer: number | undefined;
let countdownTimer: number | undefined;

const waitingForQuietPeriod = computed(() => pendingMessages.value.length > 0 && !generating.value);
const channelLabel = computed(() => {
  const channel = props.robot?.channel;
  return channel === 'COMMENT' ? '评论' : channel === 'BOTH' ? '评论和私信' : '私信';
});
const packText = computed(() => {
  const pack = props.robot?.capabilityPack;
  const version = props.robot?.capabilityPackVersion;
  return pack ? `${pack.name}${version?.versionNo ? ` v${version.versionNo}` : ''}` : '未加载';
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      startNewSession();
      void loadAccounts();
      return;
    }
    cancelPendingReply();
  }
);

async function loadAccounts() {
  try {
    const result = await listCustomerServiceAccountProfiles({ status: 'ENABLED', page: 1, pageSize: 500 });
    accounts.value = result.items || [];
    if (accountProfileId.value && !accounts.value.some((item) => item.id === accountProfileId.value)) accountProfileId.value = '';
  } catch {
    accounts.value = [];
    accountProfileId.value = '';
  }
}

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms))); }

function startNewSession() {
  cancelPendingReply();
  sessionId.value = '';
  messages.value = [];
  inputText.value = '';
  pendingMessages.value = [];
  latestPendingMessageAt = 0;
  quietPeriodSecondsLeft.value = QUIET_PERIOD_SECONDS;
}

function clearMessages() {
  cancelPendingReply();
  messages.value = [];
  inputText.value = '';
  pendingMessages.value = [];
  latestPendingMessageAt = 0;
  quietPeriodSecondsLeft.value = QUIET_PERIOD_SECONDS;
}

function fillChatSample() {
  inputText.value = '快递已经三天没更新了，能帮我看看是什么情况吗？';
}

function sendMessage() {
  const content = inputText.value.trim();
  if (!content) {
    ElMessage.warning('请输入测试消息');
    return;
  }
  if (!props.robot?.id) {
    ElMessage.warning('机器人信息不完整，无法发起测试');
    return;
  }

  const item: PendingUserMessage = { id: createId(), content, createdAtMs: Date.now() };
  messages.value.push({ id: item.id, role: 'user', content });
  pendingMessages.value.push(item);
  latestPendingMessageAt = item.createdAtMs;
  inputText.value = '';
  schedulePendingReply();
  void scrollToBottom();
}

function schedulePendingReply() {
  clearReplyTimer();
  if (!pendingMessages.value.length) return;

  refreshQuietPeriodCountdown();
  startCountdownTicker();
  if (generating.value) return;

  const remainingMs = Math.max(0, latestPendingMessageAt + QUIET_PERIOD_MS - Date.now());
  replyTimer = window.setTimeout(() => {
    replyTimer = undefined;
    void flushPendingMessages();
  }, remainingMs);
}

async function flushPendingMessages() {
  if (generating.value || !pendingMessages.value.length || !props.robot?.id) return;

  const batch = pendingMessages.value.splice(0, pendingMessages.value.length);
  clearReplyTimer();
  clearCountdownTicker();
  generating.value = true;
  await scrollToBottom();

  try {
    const contentGroups = splitPendingContents(batch.map((item) => item.content));
    for (const messageContent of contentGroups) {
      const account = accounts.value.find((item) => item.id === accountProfileId.value);
      if (account) {
        const fixedQa = await resolveCustomerServiceFixedQa({
          accountProfileId: account.id,
          storeProfileId: account.storeProfileId || undefined,
          merchantRoleId: account.merchantRoleId || undefined,
          message: messageContent
        });
        if (fixedQa.matched && fixedQa.answer) {
          await sleep(Number(fixedQa.delayMs || 0));
          messages.value.push({
            id: createId(),
            role: 'assistant',
            content: fixedQa.answer,
            trace: {
              source: 'fixed_reply',
              riskLevel: 'LOW',
              elapsedMs: Number(fixedQa.delayMs || 0),
              fixedReplyRule: {
                id: `knowledge:${fixedQa.entryId || ''}`,
                name: fixedQa.title || '账号知识固定问答',
                matchType: fixedQa.matchType,
                priority: fixedQa.priority,
                matchedPhrases: fixedQa.matchedPhrases || [],
                requiredKeywords: fixedQa.matchedKeywords || []
              },
              replyGeneration: {
                mode: 'FIXED_REPLY',
                provider: 'FIXED_REPLY',
                modelCalled: false,
                modelName: null,
                strategyCode: 'ACCOUNT_BOUND_KNOWLEDGE_FIXED_QA',
                strategyLabel: '账号知识固定问答',
                escalationTriggered: false,
                repetitionSuppressed: false,
                actionFirst: false,
                reason: '命中当前测试账号可用的 Knowledge FIXED_QA，直接返回配置答案。'
              }
            }
          });
          await scrollToBottom();
          continue;
        }
      }
      const result = await testIndustryAiRobot(props.robot.id, {
        messageContent,
        sessionId: sessionId.value || undefined,
        orderContext: buildOrderContextPayload()
      });
      sessionId.value = result.sessionId;
      messages.value.push({
        id: result.message.id || createId(),
        role: 'assistant',
        content: result.message.content || '未获取到测试回复',
        trace: result.trace
      });
      await scrollToBottom();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DeepSeek 测试调用失败';
    messages.value.push({ id: createId(), role: 'assistant', content: `本次测试未成功：${message}` });
  } finally {
    generating.value = false;
    if (pendingMessages.value.length) {
      schedulePendingReply();
    } else {
      quietPeriodSecondsLeft.value = QUIET_PERIOD_SECONDS;
    }
    await scrollToBottom();
  }
}

function splitPendingContents(contents: string[]) {
  const groups: string[] = [];
  let current = '';
  for (const rawContent of contents) {
    const content = rawContent.trim();
    if (!content) continue;
    const next = current ? `${current}\n${content}` : content;
    if (next.length <= MAX_COMBINED_MESSAGE_LENGTH) {
      current = next;
      continue;
    }
    if (current) groups.push(current);
    current = content;
  }
  if (current) groups.push(current);
  return groups;
}

function refreshQuietPeriodCountdown() {
  if (!pendingMessages.value.length) {
    quietPeriodSecondsLeft.value = QUIET_PERIOD_SECONDS;
    return;
  }
  const remaining = Math.max(0, latestPendingMessageAt + QUIET_PERIOD_MS - Date.now());
  quietPeriodSecondsLeft.value = Math.max(0, Math.ceil(remaining / 1000));
}

function startCountdownTicker() {
  clearCountdownTicker();
  countdownTimer = window.setInterval(() => {
    refreshQuietPeriodCountdown();
    if (!pendingMessages.value.length || (quietPeriodSecondsLeft.value <= 0 && !generating.value)) clearCountdownTicker();
  }, 250);
}

function cancelPendingReply() {
  clearReplyTimer();
  clearCountdownTicker();
}

function clearReplyTimer() {
  if (replyTimer !== undefined) {
    window.clearTimeout(replyTimer);
    replyTimer = undefined;
  }
}

function clearCountdownTicker() {
  if (countdownTimer !== undefined) {
    window.clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
}

function buildOrderContextPayload(): IndustryAiTestOrderContext | undefined {
  const source = orderContext.value;
  const payload: IndustryAiTestOrderContext = {
    platformOrderNo: (source.platformOrderNo || '').trim(),
    orderStatus: (source.orderStatus || '').trim(),
    fulfillmentStatus: (source.fulfillmentStatus || '').trim(),
    logisticsStatus: (source.logisticsStatus || '').trim(),
    afterSalesStatus: (source.afterSalesStatus || '').trim(),
    refundStatus: (source.refundStatus || '').trim(),
    orderNotes: (source.orderNotes || '').trim()
  };
  const cleaned = Object.fromEntries(Object.entries(payload).filter(([, value]) => Boolean(value))) as IndustryAiTestOrderContext;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function fillLogisticsExample() {
  orderContext.value = {
    platformOrderNo: 'KH202607080001',
    orderStatus: '已发货',
    fulfillmentStatus: '已出库',
    logisticsStatus: '物流停留中转站 3 天未更新',
    afterSalesStatus: '无售后申请',
    refundStatus: '未退款',
    orderNotes: '2026-07-08 10:30 AI客服：客户反馈物流多日未更新，已标记催件等待快递反馈。（客户情绪：不满）\n2026-07-08 10:45 人工客服：已联系快递催件，快递反馈预计今晚更新轨迹。（客户情绪：不满）'
  };
}

function clearOrderContext() {
  orderContext.value = {};
}

function replySourceLabel(trace: IndustryAiTestTrace) {
  if (trace.source === 'fixed_reply' && trace.fixedReplyRule?.id?.startsWith('knowledge:')) return '账号知识固定问答';
  if (trace.source === 'fixed_reply') return '店铺固定回复';
  if (trace.source === 'policy') return '行业范围 / 安全策略';
  if (trace.source === 'order_context') return '订单上下文规则';
  if (trace.source === 'safe_fallback') return '完整性安全兜底';
  return 'DeepSeek 生成';
}

function generationModeLabel(trace: IndustryAiTestTrace) {
  const generation = trace.replyGeneration;
  if (!generation) return trace.model || 'DeepSeek';
  if (generation.provider === 'LOCAL_RULE') return '本地规则生成';
  if (generation.provider === 'FIXED_REPLY') return '固定回复';
  if (generation.provider === 'CONVERSATION_POLICY') return '策略回复';
  if (generation.provider === 'SAFETY_FALLBACK') return '安全兜底';
  if (generation.provider === 'DEEPSEEK') return 'DeepSeek 生成';
  return generation.modelCalled ? '模型生成' : '规则生成';
}

function decisionCategoryLabel(value?: string) {
  if (value === 'SENSITIVE') return '敏感安全消息';
  if (value === 'OUT_OF_SCOPE') return '非店铺服务消息';
  return '店铺服务范围内';
}

function decisionActionLabel(value?: string) {
  if (value === 'GUIDE_BACK') return '礼貌引导';
  if (value === 'HANDOFF') return '建议人工处理';
  if (value === 'NO_REPLY') return '不回复';
  return '继续处理';
}

function fixedMatchTypeLabel(value?: string) {
  if (value === 'EXACT') return '精确';
  if (value === 'KEYWORD_COMBINATION') return '关键词组合';
  return '包含';
}

function riskLabel(value?: string) {
  if (value === 'HIGH') return '高';
  if (value === 'MEDIUM') return '中';
  return '低';
}

async function scrollToBottom() {
  await nextTick();
  if (messageContainer.value) messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
}

function createId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
</script>
