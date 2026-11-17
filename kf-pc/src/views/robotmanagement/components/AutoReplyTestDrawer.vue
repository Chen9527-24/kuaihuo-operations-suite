<template>
  <el-drawer v-model="visible" :title="module === 'dm' ? '私信对话流测试' : '评论自动回复测试'" :size="isMobile ? '100%' : 'min(1120px, 96vw)'" :close-on-click-modal="false" destroy-on-close>
    <div class="robot-test-layout" :class="{ 'robot-test-layout--with-diagnostics': showHveDiagnostics }">
      <div class="robot-test-chat">
      <div class="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <el-form label-position="top">
          <el-form-item :label="module === 'dm' ? '输入私信内容' : '输入评论内容'" class="!mb-3">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="4"
              resize="none"
              :placeholder="module === 'dm' ? '例如：你好，我想了解一下你们这个怎么做？' : '例如：我账号发了很多，但一直没什么咨询。'"
              @keydown.ctrl.enter.prevent="sendMessage"
              @keydown.meta.enter.prevent="sendMessage"
            />
          </el-form-item>
          <div class="space-y-3">
            <div v-if="module === 'dm'" class="flex items-center justify-between gap-3">
              <div class="text-xs text-slate-500">是否基于上下文</div>
              <el-switch v-model="useConversationContext" :disabled="isPlainChatWorkflow || (isDeepSeek && hveExecutionLane === 'HVE3_CANDIDATE')" active-text="开启" inactive-text="关闭" />
            </div>
            <div v-if="module === 'dm' && isDeepSeek" class="rounded-lg border border-slate-200 px-3 py-3 text-[11px] leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-300">
              <div>当前 DeepSeek Robot Test 统一进入 HVE-3 Candidate 隔离会话；角色、账号资料、业务知识和人感表达配置直接来自 PC 当前绑定。每次重新打开本测试都会从全新 Server Test Session 开始，只有本次抽屉内连续发送会保留上下文。</div>
              <div class="mt-2 flex items-center gap-2">
                <el-button size="small" plain :loading="repairingHveFixture" @click="repairStandardHveKnowledge">修复标准 HVE 测试知识</el-button>
                <span>仅维护内置测试 Fixture 的显式 knowledgeKind / taxonomyKeys / Target Taxonomy，不参与正式 Runtime 判定。</span>
              </div>
            </div>
            <div v-if="module === 'dm' && isPlainChatWorkflow" class="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              当前为纯聊天工作流，只传本轮消息，不使用 Coze conversation_id 上下文。
            </div>
            <div v-else-if="module !== 'dm'" class="text-xs text-slate-500">评论测试会先匹配导入数据，未命中再调用工作流。</div>
            <div class="flex items-center gap-2">
              <SampleFillButton label="填入测试样例" :has-content="Boolean(inputText.trim())" @fill="fillTestSample" />
              <el-button @click="clearMessages">清空</el-button>
              <el-button type="primary" :loading="sending" @click="sendMessage">发送</el-button>
            </div>
          </div>
          <div v-if="conversationId && module === 'dm'" class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
            当前 Coze conversation_id：{{ conversationId }}
          </div>
        </el-form>
      </div>

      <div class="app-scrollbar min-h-0 flex-1 overflow-y-auto py-4">
        <div v-if="!messages.length && !commentItems.length" class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          输入测试内容后，会在这里展示回复效果。
        </div>

        <div v-if="module === 'dm'" class="space-y-3">
          <div v-for="message in messages" :key="message.id" class="flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
            <div v-if="message.role === 'user'" class="max-w-[82%] rounded-2xl rounded-br-md bg-emerald-500 px-4 py-3 text-sm leading-6 text-white shadow-sm">
              {{ message.content }}
            </div>
            <div v-else class="reply-feedback-host max-w-[88%]" tabindex="0">
              <div class="assistant-bubble-stack">
                <div
                  v-for="segment in visibleAssistantSegments(message)"
                  :key="`${message.id}-${segment.index}`"
                  class="assistant-message-bubble whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {{ segment.content }}
                </div>
                <div v-if="isAttemptRevealing(message)" class="assistant-typing-indicator" aria-live="polite">
                  <span></span><span></span><span></span><em>正在按真实发送节奏展示下一条</em>
                </div>
              </div>
              <ReplyFeedbackActions
                v-if="!isAttemptRevealing(message)"
                :feedback="message.feedback"
                :calibration-status="message.calibrationStatus"
                :strategy-draft-status="message.strategyDraftStatus"
                :has-trace="Boolean(message.replyTraceId)"
                :can-feedback="canCreateCalibration && Boolean(message.replyTraceId)"
                :can-calibrate="canCreateCalibration && canReadCalibration && Boolean(message.replyTraceId) && message.source !== 'imported_dataset'"
                :can-view-details="canReadCalibration && Boolean(message.replyTraceId)"
                can-regenerate
                :busy="message.busy"
                @satisfied="markSatisfied(message)"
                @calibrate="openCalibration(message)"
                @regenerate="regenerateDm(message)"
                @copy="copyReply(message)"
                @details="openDetails(message)"
              />
            </div>
          </div>
        </div>

        <div v-else class="space-y-3">
          <div v-for="item in commentItems" :key="item.id" class="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div class="flex items-center justify-between gap-3 text-xs text-slate-500">
              <span class="font-medium text-slate-700 dark:text-slate-200">{{ item.userNickname }}</span>
              <span>{{ item.time }}</span>
            </div>
            <div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-100">{{ item.content }}</div>
            <div v-if="item.meta" class="mt-2 text-xs text-slate-500">{{ item.meta }}</div>
            <div v-if="item.children?.length" class="mt-3 space-y-3 border-l-2 border-emerald-100 pl-4 dark:border-emerald-900/60">
              <div v-for="child in item.children" :key="child.id" class="reply-feedback-host rounded-lg bg-emerald-50/70 p-3 dark:bg-emerald-950/30" tabindex="0">
                <div class="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span class="font-medium text-emerald-700 dark:text-emerald-300">{{ child.userNickname }}</span>
                  <span>{{ child.time }}</span>
                </div>
                <div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-100">{{ child.content }}</div>
                <div v-if="child.meta" class="mt-2 text-xs text-slate-500">{{ child.meta }}</div>
                <ReplyFeedbackActions
                  :feedback="child.feedback"
                  :calibration-status="child.calibrationStatus"
                  :strategy-draft-status="child.strategyDraftStatus"
                  :has-trace="Boolean(child.replyTraceId)"
                  :can-feedback="canCreateCalibration && Boolean(child.replyTraceId)"
                  :can-calibrate="canCreateCalibration && canReadCalibration && Boolean(child.replyTraceId) && child.source !== 'imported_dataset'"
                  :can-view-details="canReadCalibration && Boolean(child.replyTraceId)"
                  can-regenerate
                  :busy="child.busy"
                  @satisfied="markSatisfied(child)"
                  @calibrate="openCalibration(child)"
                  @regenerate="regenerateComment(item, child)"
                  @copy="copyReply(child)"
                  @details="openDetails(child)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <HveDiagnosticsHistoryPanel
        v-if="showHveDiagnostics"
        :snapshots="hveDiagnosticHistory"
        :test-session-id="testSessionId"
        :test-state-revision="testStateRevision"
      />
    </div>

    <CalibrationFeedbackDialog
      v-model="calibrationDialogVisible"
      :base-payload="null"
      :reply-source="calibrationReplySource"
      :can-analyze="canAnalyzeCalibration"
      :can-update="canUpdateCalibration"
      :can-expand-scope="canExpandCalibrationScope"
      :mobile="isMobile"
      @changed="handleCalibrationChanged"
      @reply-applied="handleCurrentReplyApplied"
    />
    <ReplyGenerationDetailsDialog v-model="detailsVisible" :trace="detailTrace" :loading="detailsLoading" :mobile="isMobile" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElLoading, ElMessage } from 'element-plus';
import * as autoRepliesApi from '@/api/modules/autoReplies';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import ReplyFeedbackActions from '@/modules/customer-service/components/ReplyFeedbackActions.vue';
import ReplyGenerationDetailsDialog from '@/modules/customer-service/components/ReplyGenerationDetailsDialog.vue';
import CalibrationFeedbackDialog from '@/views/customer-service/simulation/components/CalibrationFeedbackDialog.vue';
import HveDiagnosticsHistoryPanel from './HveDiagnosticsHistoryPanel.vue';
import { repairHveStandardKnowledgeFixture } from '@/modules/customer-service/services/hve-standard-store-fixture';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import {
  getCustomerServiceReplyTrace,
  upsertCustomerServiceReplyFeedback,
  type CustomerServiceReplyFeedbackValue,
  type CustomerServiceReplyTraceDetail
} from '@/modules/customer-service/api/reply-traces.api';
import type { CustomerServiceCalibrationCurrentReplyApplication, CustomerServiceCalibrationRecord } from '@/modules/customer-service/types/calibrations.types';
import { normalizeHveActivation, type AutoReplyModule, type AutoReplyPromptSnapshot, type CommentTestReplyResult, type DmTestReplyResult } from '@/api/modules/autoReplies';
import type { HveTurnDiagnosticSnapshot } from './hve-diagnostics.types';
import type { RobotAiBinding } from '../types';

const props = defineProps<{
  modelValue: boolean;
  module: AutoReplyModule;
  robotId?: string;
  promptConfigId?: string;
  promptSnapshot?: AutoReplyPromptSnapshot;
  datasetId?: string;
  botNickname?: string;
  aiBinding?: RobotAiBinding;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

interface ReplyAttemptState {
  id: string;
  content: string;
  inputContent: string;
  testClientMessageId?: string;
  segments?: string[];
  deliverySegments?: Array<{ index: number; content: string; delayBeforeMs: number }>;
  visibleSegmentCount?: number;
  replyTraceId?: string;
  source?: string;
  feedback?: CustomerServiceReplyFeedbackValue | null;
  calibrationId?: string | null;
  calibrationStatus?: string | null;
  strategyDraftStatus?: string | null;
  trace?: CustomerServiceReplyTraceDetail | null;
  busy?: boolean;
}

interface ChatMessage extends ReplyAttemptState {
  role: 'user' | 'assistant';
}

interface CommentNode extends ReplyAttemptState {
  id: string;
  userNickname: string;
  time: string;
  content: string;
  meta?: string;
  children?: CommentNode[];
}

const { has } = useCustomerServicePermission();
const canCreateCalibration = computed(() => has('customer-service:calibration:create'));
const canReadCalibration = computed(() => has('customer-service:calibration:read'));
const canAnalyzeCalibration = computed(() => has('customer-service:calibration:analyze'));
const canUpdateCalibration = computed(() => has('customer-service:calibration:update'));
const canExpandCalibrationScope = computed(() => has('customer-service:asset:publish'));

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});
const module = computed(() => props.module);
const isDeepSeek = computed(() => props.aiBinding?.provider === 'DEEPSEEK');
const isPlainChatWorkflow = computed(() => !isDeepSeek.value && workflowModeOf(props.promptSnapshot) === 'PLAIN_CHAT');

const inputText = ref('');
const sending = ref(false);
const repairingHveFixture = ref(false);
const useConversationContext = ref(true);
const hveExecutionLane = ref<'HVE3_CANDIDATE'>('HVE3_CANDIDATE');
const showHveDiagnostics = computed(() => module.value === 'dm' && isDeepSeek.value && hveExecutionLane.value === 'HVE3_CANDIDATE');
const conversationId = ref('');
const testSessionId = ref('');
const testStateRevision = ref<number | null>(null);
const hveDiagnosticHistory = ref<HveTurnDiagnosticSnapshot[]>([]);
const messages = ref<ChatMessage[]>([]);
const commentItems = ref<CommentNode[]>([]);
const calibrationDialogVisible = ref(false);
const calibrationReplySource = ref<{
  replyTraceId: string;
  sourceRefId?: string;
  selectedSegmentIndexes?: number[];
  accountProfileId?: string | null;
  robotId?: string | null;
  weakEvidence?: boolean;
  decisionOnly?: boolean;
  existingRecordId?: string | null;
  scopeImpact?: CustomerServiceReplyTraceDetail['scopeImpact'];
} | null>(null);
const activeAttempt = ref<ReplyAttemptState | null>(null);
const detailsVisible = ref(false);
const detailsLoading = ref(false);
const detailTrace = ref<CustomerServiceReplyTraceDetail | null>(null);

async function repairStandardHveKnowledge() {
  const accountProfileId = props.aiBinding?.accountProfileId || undefined;
  if (!accountProfileId) return ElMessage.warning('当前 Robot Test 未绑定账号资料，无法修复标准 HVE 测试知识');
  repairingHveFixture.value = true;
  try {
    const result = await repairHveStandardKnowledgeFixture(accountProfileId);
    ElMessage.success(`标准 HVE 测试知识已同步：更新 ${result.updated} 条，新增 ${result.created} 条`);
    clearMessages();
  } catch (error: any) {
    ElMessage.error(error?.message || '标准 HVE 测试知识修复失败');
  } finally {
    repairingHveFixture.value = false;
  }
}

watch(hveExecutionLane, (lane) => {
  if (module.value === 'dm' && isDeepSeek.value) {
    if (lane === 'HVE3_CANDIDATE') useConversationContext.value = true;
    clearMessages();
  }
});
const isMobile = ref(false);
let mediaQuery: MediaQueryList | null = null;
const segmentRevealTimers = new Set<number>();

watch(() => props.modelValue, (open) => {
  if (!open) {
    finishPendingSegmentReveals();
    return;
  }
  // Opening the test drawer is a new operator test boundary. Keep context only
  // inside this drawer-open lifetime; never reuse a previous Server Test Session
  // merely because the same robot/account is opened again later.
  clearMessages();
  inputText.value = '';
  useConversationContext.value = !isPlainChatWorkflow.value;
  if (isDeepSeek.value && hveExecutionLane.value === 'HVE3_CANDIDATE') useConversationContext.value = true;
  if (isPlainChatWorkflow.value) conversationId.value = '';
});

watch(
  () => [props.robotId || '', props.aiBinding?.provider || '', props.aiBinding?.accountProfileId || ''],
  (current, previous) => {
    if (!previous || current.every((item, index) => item === previous[index])) return;
    if (props.aiBinding?.provider === 'DEEPSEEK' && hveExecutionLane.value === 'HVE3_CANDIDATE') {
      useConversationContext.value = true;
    }
    clearMessages();
  }
);

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 767px)');
  updateMobile(mediaQuery);
  mediaQuery.addEventListener?.('change', updateMobile);
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener?.('change', updateMobile);
  clearSegmentRevealTimers();
});

function updateMobile(event: MediaQueryList | MediaQueryListEvent) {
  isMobile.value = event.matches;
}

function clearMessages() {
  clearSegmentRevealTimers();
  messages.value = [];
  commentItems.value = [];
  conversationId.value = '';
  testSessionId.value = '';
  testStateRevision.value = null;
  hveDiagnosticHistory.value = [];
  activeAttempt.value = null;
  detailTrace.value = null;
}

function fillTestSample() {
  inputText.value = props.module === 'dm'
    ? '你好，我想看看适合上班穿的款式，平时喜欢简洁一点的'
    : '这件上班穿会不会太休闲？';
}

async function sendMessage() {
  const content = inputText.value.trim();
  if (!content) {
    ElMessage.warning(props.module === 'dm' ? '请输入私信测试内容' : '请输入评论测试内容');
    return;
  }
  const missing = props.aiBinding?.provider === 'DEEPSEEK' ? [] : validatePromptSnapshot(props.module, props.promptSnapshot);
  if (missing.length) {
    ElMessage.warning(`提示词配置不完整：${missing.join('、')}`);
    return;
  }

  sending.value = true;
  const loading = ElLoading.service({ fullscreen: true, text: '正在调用自动回复接口...' });
  let pendingDmMessageId = '';
  try {
    if (props.module === 'dm') {
      const testClientMessageId = createId();
      pendingDmMessageId = testClientMessageId;
      messages.value.push({ id: testClientMessageId, role: 'user', content, inputContent: content, testClientMessageId });
      const result = await requestDmReply(content, testClientMessageId);
      syncConversationState(result);
      if (result.replyStatus === 'failed' && result.runtimeError) {
        const runtimeErrorMessage = formatDmRuntimeError(result);
        recordHveDiagnosticSnapshot({
          inputContent: content,
          assistantContent: '',
          testClientMessageId,
          requestKind: 'INITIAL',
          requestStatus: 'ERROR',
          errorMessage: runtimeErrorMessage
        });
        ElMessage.error(runtimeErrorMessage);
        inputText.value = '';
        return;
      }
      const attempt = await appendAssistantAttempt(content, result, testClientMessageId);
      recordHveDiagnosticSnapshot({
        inputContent: content,
        assistantContent: attempt.content,
        testClientMessageId,
        requestKind: 'INITIAL',
        requestStatus: 'SUCCESS',
        result
      });
    } else {
      const root = createCommentRoot(content);
      commentItems.value = [root, ...commentItems.value];
      const result = await requestCommentReply(content);
      await appendCommentReply(root.id, content, result);
    }
    inputText.value = '';
  } catch (error) {
    const errorMessage = readRequestErrorMessage(error);
    const blockedActivation = readRequestErrorActivation(error);
    if (pendingDmMessageId && showHveDiagnostics.value) {
      recordHveDiagnosticSnapshot({
        inputContent: content,
        assistantContent: '',
        testClientMessageId: pendingDmMessageId,
        requestKind: 'INITIAL',
        requestStatus: blockedActivation ? 'BLOCKED' : 'ERROR',
        errorMessage,
        activation: blockedActivation
      });
    }
    if (pendingDmMessageId) messages.value = messages.value.filter((item) => item.id !== pendingDmMessageId);
    ElMessage.error(errorMessage);
  } finally {
    loading.close();
    sending.value = false;
  }
}

function readRequestErrorMessage(error: unknown) {
  const value = error as { message?: unknown; response?: { data?: { message?: unknown } } };
  const responseMessage = value?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.map((item) => String(item)).join('；');
  if (responseMessage && typeof responseMessage === 'object') {
    const nestedMessage = (responseMessage as { message?: unknown }).message;
    if (nestedMessage) return String(nestedMessage);
  }
  return String(responseMessage || value?.message || '自动回复测试失败，请检查当前 Role / V1.9 Activation 配置后重试');
}

function readRequestErrorActivation(error: unknown) {
  const value = error as { response?: { data?: { activation?: unknown; message?: unknown } } };
  const data = value?.response?.data;
  const nested = data?.message && typeof data.message === 'object'
    ? (data.message as { activation?: unknown }).activation
    : undefined;
  return normalizeHveActivation(data?.activation ?? nested);
}

interface RecordHveDiagnosticInput {
  inputContent: string;
  assistantContent: string;
  testClientMessageId?: string;
  requestKind: HveTurnDiagnosticSnapshot['requestKind'];
  requestStatus: HveTurnDiagnosticSnapshot['requestStatus'];
  result?: DmTestReplyResult;
  errorMessage?: string;
  activation?: HveTurnDiagnosticSnapshot['activation'];
}

function recordHveDiagnosticSnapshot(input: RecordHveDiagnosticInput) {
  if (!showHveDiagnostics.value) return;
  const result = input.result;
  const turnNumber = resolveHveTurnNumber(input.testClientMessageId);
  const attemptNumber = hveDiagnosticHistory.value.filter((item) => item.testClientMessageId === input.testClientMessageId).length + 1;
  hveDiagnosticHistory.value.push({
    id: createId(),
    turnNumber,
    attemptNumber,
    requestKind: input.requestKind,
    requestStatus: input.requestStatus,
    capturedAt: formatNow(),
    lane: hveExecutionLane.value,
    testClientMessageId: input.testClientMessageId || null,
    inputContent: input.inputContent,
    assistantContent: input.assistantContent,
    errorMessage: input.errorMessage || null,
    replyTraceId: result?.replyTraceId || null,
    testSessionId: result?.testSessionId || testSessionId.value || null,
    stateRevision: result ? (result.testStateRevisionAtGeneration ?? null) : null,
    contextMessageCount: result?.contextMessageCount ?? null,
    activeContextWindow: result?.activeContextWindow ?? null,
    deliveryPlan: result?.hveDeliveryPlan ?? null,
    activation: result?.hveActivation ?? input.activation ?? null,
    generationKernel: result?.hveGenerationKernel ?? null,
    deepRecognition: result?.hveDeepRecognition ?? null,
    semanticStateAudit: result?.hveSemanticStateAudit ?? null,
    robotTestSessionDiagnostic: result?.robotTestSessionDiagnostic ?? null,
    runtimeOutcomeDiagnostic: result?.runtimeOutcomeDiagnostic ?? null,
    plan: result?.hvePlan ?? null,
    participation: result?.hveParticipation ?? null,
    turnComposition: result?.hveTurnComposition ?? null,
    humanTurnObservability: result?.hveHumanTurnObservability ?? null,
    finalModelFacingHumanTurn: result?.hveFinalModelFacingHumanTurn ?? null,
    humanityMetrics: result?.hveHumanityMetrics ?? null,
    decisionIntegrity: result?.hveDecisionIntegrity ?? null,
    roleContext: result?.hveRoleContext ?? null,
    resolvedRole: result?.hveResolvedRole ?? null,
    candidateSelection: result?.hveCandidateSelection ?? null,
    groundingAudit: result?.hveGroundingAudit ?? null,
    runtimeAudit: result?.hveRuntimeAudit ?? null
  });
}

function resolveHveTurnNumber(testClientMessageId?: string) {
  let turn = 0;
  for (const message of messages.value) {
    if (message.role !== 'user') continue;
    turn += 1;
    if (testClientMessageId && (message.id === testClientMessageId || message.testClientMessageId === testClientMessageId)) return turn;
  }
  return Math.max(1, turn);
}

async function requestDmReply(content: string, testClientMessageId?: string) {
  // DeepSeek HVE is driven by structured runtime assets. Do not send the old
  // Coze/workflow prompt payload unless compatibility fallback is explicitly
  // enabled. If fallback is enabled the payload remains available only for that
  // fallback path; it never becomes HVE behavioral authority.
  const needsLegacyPromptPayload = !isDeepSeek.value || props.aiBinding?.fallbackToCoze === true;
  const promptPayload = needsLegacyPromptPayload ? buildPromptPayload(props.promptSnapshot) : {};
  // DeepSeek Robot Test always uses the isolated HVE Candidate lane and server-side conversation context.
  const candidateLane = isDeepSeek.value && hveExecutionLane.value === 'HVE3_CANDIDATE';
  const effectiveUseConversationContext = candidateLane ? true : useConversationContext.value;
  if (candidateLane && !useConversationContext.value) useConversationContext.value = true;
  return autoRepliesApi.testDmReply({
    ...promptPayload,
    robotId: props.robotId || undefined,
    aiProvider: props.aiBinding?.provider,
    accountProfileId: props.aiBinding?.accountProfileId || undefined,
    fallbackToCoze: props.aiBinding?.fallbackToCoze,
    assetIds: props.aiBinding?.assetIds,
    promptConfigId: needsLegacyPromptPayload ? props.promptConfigId || undefined : undefined,
    messageContent: content,
    useConversationContext: effectiveUseConversationContext,
    conversationId: effectiveUseConversationContext ? conversationId.value || undefined : undefined,
    testSessionId: effectiveUseConversationContext && isDeepSeek.value ? testSessionId.value || undefined : undefined,
    testClientMessageId: effectiveUseConversationContext && isDeepSeek.value ? testClientMessageId : undefined,
    hveExecutionLane: effectiveUseConversationContext && isDeepSeek.value ? hveExecutionLane.value : undefined
  });
}

function formatDmRuntimeError(result: DmTestReplyResult) {
  const runtimeError = result.runtimeError;
  if (!runtimeError) return result.failReason || 'HVE Robot Test 执行失败';
  const phase = runtimeError.phase || 'UNKNOWN_PHASE';
  const code = runtimeError.errorCode || 'CUSTOMER_SERVICE_ROBOT_TEST_HVE_RUNTIME_FAILED';
  const detail = runtimeError.errorMessage || result.failReason || '未知内部错误';
  return `${code} · ${phase}：${detail}`;
}

async function requestCommentReply(content: string) {
  const promptPayload = buildPromptPayload(props.promptSnapshot);
  return autoRepliesApi.testCommentReply({
    ...promptPayload,
    robotId: props.robotId || undefined,
    aiProvider: props.aiBinding?.provider,
    accountProfileId: props.aiBinding?.accountProfileId || undefined,
    fallbackToCoze: props.aiBinding?.fallbackToCoze,
    assetIds: props.aiBinding?.assetIds,
    promptConfigId: props.promptConfigId || undefined,
    datasetId: props.datasetId || undefined,
    userInput: content
  });
}

function syncConversationState(result: DmTestReplyResult) {
  if (result.supportsConversationContext === false) {
    conversationId.value = '';
    testSessionId.value = '';
    testStateRevision.value = null;
    useConversationContext.value = false;
    return;
  }
  if (!useConversationContext.value) return;
  if (result.testSessionId) {
    testSessionId.value = result.testSessionId;
    testStateRevision.value = result.testStateRevisionAtGeneration ?? null;
  }
  if (result.conversationId) conversationId.value = result.conversationId;
}

function createCommentRoot(content: string): CommentNode {
  return { id: createId(), userNickname: '测试用户', time: formatNow(), content, inputContent: content, children: [] };
}

async function appendCommentReply(rootId: string, inputContent: string, result: CommentTestReplyResult) {
  const child: CommentNode = {
    id: createId(),
    userNickname: props.botNickname || '机器人',
    time: formatNow(),
    content: formatCommentReplyContent(result),
    inputContent,
    meta: formatCommentReplyMeta(result),
    segments: commentReplySegments(result),
    replyTraceId: result.replyTraceId,
    source: result.source
  };
  await sleep(Math.max(260, extractCommentFirstDelay(result)));
  commentItems.value = commentItems.value.map((item) => item.id === rootId
    ? { ...item, children: [...(item.children || []), child] }
    : item);
}

function extractCommentFirstDelay(result: CommentTestReplyResult) {
  const raw = result.raw && typeof result.raw === 'object' ? result.raw as Record<string, unknown> : {};
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const first = segments[0] && typeof segments[0] === 'object' ? segments[0] as Record<string, unknown> : {};
  return Math.max(0, Math.min(8000, Math.trunc(Number(first.delayBeforeMs) || 0)));
}

function formatCommentReplyContent(result: CommentTestReplyResult) {
  if (result.shouldReply === false || result.skipReply === true || result.replyStatus === 'not_required') {
    const base = result.skipReason || result.judgeReason || '当前评论无需回复';
    return /无需回复$/.test(base) ? base : `${base}，无需回复`;
  }
  return result.reply || result.skipReason || result.judgeReason || '未获取到回复内容';
}

function formatCommentReplyMeta(result: CommentTestReplyResult) {
  if (result.source === 'imported_dataset') return '命中导入数据，未调用模型工作流。';
  return result.judgeReason || result.skipReason || '';
}

function commentReplySegments(result: CommentTestReplyResult) {
  if (result.shouldReply === false || result.skipReply === true || result.replyStatus === 'not_required') return [];
  const reply = String(result.reply || '').trim();
  return reply ? [reply] : [];
}

async function appendAssistantAttempt(inputContent: string, result: DmTestReplyResult, testClientMessageId?: string): Promise<ChatMessage> {
  const replies = result.replies.map((item) => String(item).trim()).filter(Boolean);
  const fallbackContent = result.manualTakeover
    ? (result.skipReason || '当前消息需要人工接管')
    : (result.skipReason || result.failReason || '当前消息无需自动回复');
  const deliverySegments = extractDmDeliverySegments(result, replies.length ? replies : [fallbackContent]);
  const attempt: ChatMessage = {
    id: createId(),
    role: 'assistant',
    inputContent,
    testClientMessageId,
    content: deliverySegments.map((item) => item.content).join('\n') || fallbackContent,
    segments: deliverySegments.map((item) => item.content),
    deliverySegments,
    visibleSegmentCount: deliverySegments.length > 1 ? 1 : deliverySegments.length,
    replyTraceId: result.replyTraceId,
    source: result.source
  };
  await sleep(Math.max(420, deliverySegments[0]?.delayBeforeMs || 0));
  messages.value.push(attempt);
  scheduleAssistantSegmentReveal(attempt);
  return attempt;
}

function extractDmDeliverySegments(result: DmTestReplyResult, fallback: string[]) {
  const raw = result.raw && typeof result.raw === 'object' ? result.raw as Record<string, unknown> : {};
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const normalized = rawSegments
    .map((item, index) => {
      const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const content = String(source.content || '').trim();
      const delayBeforeMs = Math.max(0, Math.min(8000, Math.trunc(Number(source.delayBeforeMs) || (index ? 900 : 0))));
      return content ? { index, content, delayBeforeMs } : null;
    })
    .filter((item): item is { index: number; content: string; delayBeforeMs: number } => Boolean(item));
  if (normalized.length) return normalized;
  return fallback.filter(Boolean).map((content, index) => ({ index, content, delayBeforeMs: index ? 900 : 0 }));
}

function visibleAssistantSegments(attempt: ReplyAttemptState) {
  const segments = attempt.deliverySegments?.length
    ? attempt.deliverySegments
    : (attempt.segments?.length ? attempt.segments.map((content, index) => ({ index, content, delayBeforeMs: index ? 900 : 0 })) : [{ index: 0, content: attempt.content, delayBeforeMs: 0 }]);
  const visibleCount = Math.max(1, Math.min(segments.length, attempt.visibleSegmentCount ?? segments.length));
  return segments.slice(0, visibleCount);
}

function isAttemptRevealing(attempt: ReplyAttemptState) {
  const total = attempt.deliverySegments?.length || attempt.segments?.length || 1;
  return (attempt.visibleSegmentCount ?? total) < total;
}

function scheduleAssistantSegmentReveal(attempt: ReplyAttemptState) {
  const segments = attempt.deliverySegments || [];
  if (segments.length <= 1) return;
  const attemptId = attempt.id;
  let elapsed = 0;
  segments.slice(1).forEach((segment, offset) => {
    elapsed += Math.max(350, segment.delayBeforeMs || 900);
    const timer = window.setTimeout(() => {
      segmentRevealTimers.delete(timer);
      revealAssistantSegments(attemptId, Math.min(segments.length, offset + 2));
    }, elapsed);
    segmentRevealTimers.add(timer);
  });
}

function revealAssistantSegments(attemptId: string, visibleCount: number) {
  const reactiveAttempt = messages.value.find((message) => message.id === attemptId && message.role === 'assistant');
  if (!reactiveAttempt) return;
  const total = reactiveAttempt.deliverySegments?.length || reactiveAttempt.segments?.length || 1;
  reactiveAttempt.visibleSegmentCount = Math.max(1, Math.min(total, visibleCount));
}

function finishPendingSegmentReveals() {
  clearSegmentRevealTimers();
  messages.value.forEach((message) => {
    if (message.role !== 'assistant') return;
    const total = message.deliverySegments?.length || message.segments?.length || 1;
    if ((message.visibleSegmentCount ?? total) < total) message.visibleSegmentCount = total;
  });
}

function clearSegmentRevealTimers() {
  segmentRevealTimers.forEach((timer) => window.clearTimeout(timer));
  segmentRevealTimers.clear();
}

async function markSatisfied(attempt: ReplyAttemptState) {
  if (!attempt.replyTraceId) {
    ElMessage.warning('该回复没有生成追踪证据，暂时无法保存满意反馈');
    return;
  }
  attempt.busy = true;
  try {
    const feedback = await upsertCustomerServiceReplyFeedback(attempt.replyTraceId, 'SATISFIED');
    attempt.feedback = feedback.feedback;
    if (attempt.trace) attempt.trace.feedback = { id: feedback.id, feedback: feedback.feedback, note: feedback.note, updatedAt: feedback.updatedAt };
    ElMessage.success('已记录为满意回复');
  } finally {
    attempt.busy = false;
  }
}

async function openCalibration(attempt: ReplyAttemptState) {
  if (!attempt.replyTraceId) {
    ElMessage.warning('该回复没有生成追踪证据，不能进行精确校准');
    return;
  }
  if (!canCreateCalibration.value || !canReadCalibration.value) {
    ElMessage.warning('当前账号没有创建或读取校准证据的权限');
    return;
  }
  attempt.busy = true;
  try {
    const trace = await loadTrace(attempt, true);
    if (!trace.merchantRoleId) {
      ElMessage.warning('该回复缺少客服角色生成证据，只能记录满意度，不能进行精确校准');
      return;
    }
    await upsertCustomerServiceReplyFeedback(attempt.replyTraceId, 'UNSATISFIED');
    attempt.feedback = 'UNSATISFIED';
    activeAttempt.value = attempt;
    calibrationReplySource.value = {
      replyTraceId: trace.id,
      sourceRefId: trace.sourceRefId || undefined,
      accountProfileId: trace.accountProfileId,
      robotId: trace.robotId,
      weakEvidence: !trace.configurationHash,
      decisionOnly: !attempt.segments?.length,
      existingRecordId: trace.calibration?.id || null,
      scopeImpact: trace.scopeImpact
    };
    calibrationDialogVisible.value = true;
  } finally {
    attempt.busy = false;
  }
}

async function openDetails(attempt: ReplyAttemptState) {
  if (!attempt.replyTraceId) {
    ElMessage.warning('该回复没有可查看的生成详情');
    return;
  }
  if (!canReadCalibration.value) {
    ElMessage.warning('当前账号没有查看回复生成详情的权限');
    return;
  }
  detailsVisible.value = true;
  detailsLoading.value = true;
  detailTrace.value = null;
  try {
    detailTrace.value = await loadTrace(attempt, true);
  } finally {
    detailsLoading.value = false;
  }
}

async function loadTrace(attempt: ReplyAttemptState, refresh = false) {
  if (!attempt.replyTraceId) throw new Error('回复追踪 ID 不存在');
  if (!refresh && attempt.trace) return attempt.trace;
  const trace = await getCustomerServiceReplyTrace(attempt.replyTraceId);
  attempt.trace = trace;
  attempt.feedback = trace.feedback?.feedback || attempt.feedback || null;
  attempt.calibrationId = trace.calibration?.id || null;
  attempt.calibrationStatus = trace.calibration?.status || null;
  attempt.strategyDraftStatus = trace.calibration?.strategyDraftStatus || null;
  return trace;
}

async function regenerateDm(attempt: ReplyAttemptState) {
  if (!attempt.inputContent) return;
  attempt.busy = true;
  try {
    const result = await requestDmReply(attempt.inputContent, attempt.testClientMessageId);
    syncConversationState(result);
    if (result.replyStatus === 'failed' && result.runtimeError) {
      const runtimeErrorMessage = formatDmRuntimeError(result);
      recordHveDiagnosticSnapshot({
        inputContent: attempt.inputContent,
        assistantContent: '',
        testClientMessageId: attempt.testClientMessageId,
        requestKind: 'REGENERATE',
        requestStatus: 'ERROR',
        errorMessage: runtimeErrorMessage
      });
      ElMessage.error(runtimeErrorMessage);
      return;
    }
    const regenerated = await appendAssistantAttempt(attempt.inputContent, result, attempt.testClientMessageId);
    recordHveDiagnosticSnapshot({
      inputContent: attempt.inputContent,
      assistantContent: regenerated.content,
      testClientMessageId: attempt.testClientMessageId,
      requestKind: 'REGENERATE',
      requestStatus: 'SUCCESS',
      result
    });
    ElMessage.success('已生成新的测试候选，旧回复、原反馈和历史解析数据均已保留');
  } catch (error) {
    const errorMessage = readRequestErrorMessage(error);
    const blockedActivation = readRequestErrorActivation(error);
    recordHveDiagnosticSnapshot({
      inputContent: attempt.inputContent,
      assistantContent: '',
      testClientMessageId: attempt.testClientMessageId,
      requestKind: 'REGENERATE',
      requestStatus: blockedActivation ? 'BLOCKED' : 'ERROR',
      errorMessage,
      activation: blockedActivation
    });
    ElMessage.error(errorMessage);
  } finally {
    attempt.busy = false;
  }
}

async function regenerateComment(root: CommentNode, attempt: ReplyAttemptState) {
  const inputContent = attempt.inputContent || root.content;
  attempt.busy = true;
  try {
    const result = await requestCommentReply(inputContent);
    await appendCommentReply(root.id, inputContent, result);
    ElMessage.success('已生成新的评论测试候选，不会真实发送；旧候选和原反馈已保留');
  } finally {
    attempt.busy = false;
  }
}

async function copyReply(attempt: ReplyAttemptState) {
  const content = attempt.segments?.length ? attempt.segments.join('\n') : attempt.content;
  if (!content.trim()) return;
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  ElMessage.success('回复已复制');
}

function handleCalibrationChanged(record: CustomerServiceCalibrationRecord) {
  const attempt = activeAttempt.value;
  if (!attempt) return;
  attempt.feedback = 'UNSATISFIED';
  attempt.calibrationId = record.id;
  attempt.calibrationStatus = record.status;
  attempt.strategyDraftStatus = record.strategyDraftStatus;
  if (attempt.trace) {
    attempt.trace.calibration = {
      id: record.id,
      status: record.status,
      strategyDraftStatus: record.strategyDraftStatus,
      updatedAt: record.updatedAt
    };
  }
}

function handleCurrentReplyApplied(application: CustomerServiceCalibrationCurrentReplyApplication) {
  if (!application.applied || application.source !== 'ROBOT_TEST_DM' || !application.content) return;
  const attempt = application.replyTraceId
    ? messages.value.find((message) => message.role === 'assistant' && message.replyTraceId === application.replyTraceId)
    : activeAttempt.value;
  if (!attempt || attempt.role !== 'assistant') return;
  clearSegmentRevealTimers();
  attempt.content = application.content;
  attempt.segments = [application.content];
  attempt.deliverySegments = [{ index: 0, content: application.content, delayBeforeMs: 0 }];
  attempt.visibleSegmentCount = 1;
  if (application.sessionId && application.sessionId === testSessionId.value && application.stateRevision !== null) {
    testStateRevision.value = application.stateRevision;
  }
}

function validatePromptSnapshot(moduleName: AutoReplyModule, snapshot?: AutoReplyPromptSnapshot) {
  const prompt = snapshot || {};
  const mode = workflowModeOf(prompt);
  const missing: string[] = [];
  if (mode !== 'DEFAULT' && !workflowIdOf(prompt)) missing.push('工作流 ID');
  if (mode === 'PLAIN_CHAT') {
    if (!workflowInputKeyOf(prompt)) missing.push('输入变量名');
    return missing;
  }

  const required: Array<[keyof AutoReplyPromptSnapshot | 'POST_CONTEXT', string]> = [
    ['customSystemPrompt', '系统提示词'],
    ['customUserPrompt', '补充提示词'],
    ['forbiddenWords', '禁用词'],
    ['requiredWords', '要求词'],
    ['replyStyle', '回复风格'],
    ['platformLabel', '平台名称'],
    ['accountPositioning', '账号定位'],
    ['businessProfile', '业务简介'],
    ['goal', moduleName === 'comment' ? '评论目标' : '转化目标'],
    ['policy', moduleName === 'comment' ? '评论规则' : '联系规则'],
    ['safetyPolicy', '安全约束'],
    ['replyLength', '回复条数']
  ];
  if (moduleName === 'dm') required.push(['maxMsgCount', '最大消息数']);
  if (moduleName === 'comment') required.push(['POST_CONTEXT', '作品上下文']);
  return [
    ...missing,
    ...required
      .filter(([key]) => {
        if (key === 'POST_CONTEXT') return !String(prompt.extraParams?.POST_CONTEXT ?? '').trim();
        const value = prompt[key as keyof AutoReplyPromptSnapshot];
        if (typeof value === 'number') return !Number.isFinite(value) || value <= 0;
        return !String(value ?? '').trim();
      })
      .map(([, label]) => label)
  ];
}

function buildPromptPayload(snapshot?: AutoReplyPromptSnapshot) {
  const prompt = snapshot || {};
  return {
    workflowMode: workflowModeOf(prompt),
    workflowId: workflowIdOf(prompt),
    workflowBotId: workflowBotIdOf(prompt),
    workflowInputKey: workflowInputKeyOf(prompt),
    customSystemPrompt: prompt.customSystemPrompt,
    customUserPrompt: prompt.customUserPrompt,
    forbiddenWords: prompt.forbiddenWords,
    requiredWords: prompt.requiredWords,
    replyStyle: prompt.replyStyle,
    platform: prompt.platformLabel,
    accountPositioning: prompt.accountPositioning,
    businessProfile: prompt.businessProfile,
    postContext: String(prompt.extraParams?.POST_CONTEXT ?? ''),
    commentGoal: prompt.goal,
    commentPolicy: prompt.policy,
    conversionGoal: prompt.goal,
    contactPolicy: prompt.policy,
    replyLength: prompt.replyLength,
    maxMsgCount: prompt.maxMsgCount,
    safetyPolicy: prompt.safetyPolicy
  };
}

function workflowModeOf(prompt?: AutoReplyPromptSnapshot) {
  const value = String(prompt?.workflowMode ?? prompt?.extraParams?.WORKFLOW_MODE ?? 'DEFAULT').trim().toUpperCase();
  if (value === 'PLAIN_CHAT') return 'PLAIN_CHAT' as const;
  if (value === 'STRUCTURED') return 'STRUCTURED' as const;
  return 'DEFAULT' as const;
}

function workflowIdOf(prompt?: AutoReplyPromptSnapshot) {
  return String(prompt?.workflowId ?? prompt?.extraParams?.WORKFLOW_ID ?? '').trim();
}

function workflowBotIdOf(prompt?: AutoReplyPromptSnapshot) {
  return String(prompt?.workflowBotId ?? prompt?.extraParams?.WORKFLOW_BOT_ID ?? '').trim();
}

function workflowInputKeyOf(prompt?: AutoReplyPromptSnapshot) {
  return String(prompt?.workflowInputKey ?? prompt?.extraParams?.WORKFLOW_INPUT_KEY ?? 'input').trim() || 'input';
}

function createId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatNow() {
  const date = new Date();
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
</script>

<style scoped>
.robot-test-layout {
  display: grid;
  height: 100%;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.robot-test-layout--with-diagnostics {
  grid-template-columns: minmax(0, 1fr) minmax(360px, 430px);
}

.robot-test-chat {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
}

.reply-feedback-host {
  outline: none;
}

.reply-feedback-host:focus-visible {
  border-radius: 16px;
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}

.reply-feedback-host:hover :deep(.reply-feedback-actions__desktop),
.reply-feedback-host:focus-within :deep(.reply-feedback-actions__desktop) {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.assistant-bubble-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
}

.assistant-message-bubble {
  width: fit-content;
  max-width: 100%;
  animation: assistant-bubble-enter 0.2s ease-out;
}

.assistant-typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.assistant-typing-indicator span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-success);
  animation: assistant-dot 1s infinite ease-in-out;
}

.assistant-typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
.assistant-typing-indicator span:nth-child(3) { animation-delay: 0.3s; }
.assistant-typing-indicator em { margin-left: 3px; font-style: normal; }

@keyframes assistant-bubble-enter {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes assistant-dot {
  0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

@media (max-width: 900px) {
  .robot-test-layout--with-diagnostics {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(420px, 1fr) minmax(300px, 48vh);
  }
}

@media (max-width: 767px) {
  :deep(.el-drawer) {
    width: 100vw !important;
  }
}
</style>
