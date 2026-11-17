import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import {
  getCustomerServiceReplyTrace,
  upsertCustomerServiceReplyFeedback,
  type CustomerServiceReplyFeedbackValue,
  type CustomerServiceReplyTraceDetail
} from '@/modules/customer-service/api/reply-traces.api';
import type { CustomerServiceCalibrationRecord } from '@/modules/customer-service/types/calibrations.types';

export interface ReplyRecordTraceSource {
  replyTraceId: string;
  generationSource?: string;
}

interface ReplyRecordState {
  feedback: CustomerServiceReplyFeedbackValue | null;
  calibrationStatus: string | null;
  strategyDraftStatus: string | null;
  trace: CustomerServiceReplyTraceDetail | null;
}

export function useReplyRecordFeedback() {
  const { has } = useCustomerServicePermission();
  const canReadCalibration = computed(() => has('customer-service:calibration:read'));
  const canCreateCalibration = computed(() => has('customer-service:calibration:create'));
  const canAnalyzeCalibration = computed(() => has('customer-service:calibration:analyze'));
  const canUpdateCalibration = computed(() => has('customer-service:calibration:update'));
  const canExpandCalibrationScope = computed(() => has('customer-service:asset:publish'));
  const states = reactive<Record<string, ReplyRecordState>>({});
  const busyIds = reactive(new Set<string>());
  const detailsVisible = ref(false);
  const detailsLoading = ref(false);
  const detailTrace = ref<CustomerServiceReplyTraceDetail | null>(null);
  const calibrationDialogVisible = ref(false);
  const activeTraceId = ref('');
  const calibrationReplySource = ref<{
    replyTraceId: string;
    sourceRefId?: string;
    accountProfileId?: string | null;
    weakEvidence?: boolean;
    decisionOnly?: boolean;
    existingRecordId?: string | null;
    scopeImpact?: CustomerServiceReplyTraceDetail['scopeImpact'];
  } | null>(null);

  function stateFor(source: ReplyRecordTraceSource) {
    const id = source.replyTraceId || '';
    if (!id) return { feedback: null, calibrationStatus: null, strategyDraftStatus: null, trace: null } as ReplyRecordState;
    if (!states[id]) states[id] = { feedback: null, calibrationStatus: null, strategyDraftStatus: null, trace: null };
    return states[id];
  }

  function isBusy(source: ReplyRecordTraceSource) {
    return Boolean(source.replyTraceId && busyIds.has(source.replyTraceId));
  }

  async function loadTrace(source: ReplyRecordTraceSource, refresh = false) {
    if (!source.replyTraceId) throw new Error('回复追踪 ID 不存在');
    const state = stateFor(source);
    if (!refresh && state.trace) return state.trace;
    const trace = await getCustomerServiceReplyTrace(source.replyTraceId);
    state.trace = trace;
    state.feedback = trace.feedback?.feedback || state.feedback;
    state.calibrationStatus = trace.calibration?.status || null;
    state.strategyDraftStatus = trace.calibration?.strategyDraftStatus || null;
    return trace;
  }

  async function markEffective(source: ReplyRecordTraceSource) {
    if (!source.replyTraceId) {
      ElMessage.warning('历史自动回复缺少生成追踪证据，无法保存有效反馈');
      return;
    }
    busyIds.add(source.replyTraceId);
    try {
      const feedback = await upsertCustomerServiceReplyFeedback(source.replyTraceId, 'SATISFIED');
      const state = stateFor(source);
      state.feedback = feedback.feedback;
      if (state.trace) state.trace.feedback = { id: feedback.id, feedback: feedback.feedback, note: feedback.note, updatedAt: feedback.updatedAt };
      ElMessage.success('已记录为有效回复');
    } finally {
      busyIds.delete(source.replyTraceId);
    }
  }

  async function openCalibration(source: ReplyRecordTraceSource, decisionOnly = false) {
    if (!source.replyTraceId) {
      ElMessage.warning('历史自动回复缺少生成快照，只能复制，不能进行精确校准');
      return;
    }
    if (!canCreateCalibration.value || !canReadCalibration.value) {
      ElMessage.warning('当前账号没有创建或读取校准证据的权限');
      return;
    }
    if (String(source.generationSource || '').toLowerCase() === 'imported_dataset') {
      ElMessage.warning('该回复来自导入数据集，请修改数据集内容，不能作为模型回复进行校准');
      return;
    }
    busyIds.add(source.replyTraceId);
    try {
      const trace = await loadTrace(source, true);
      if (!trace.merchantRoleId) {
        ElMessage.warning('该回复缺少客服角色生成证据，只能记录有效性，不能进行精确校准');
        return;
      }
      await upsertCustomerServiceReplyFeedback(source.replyTraceId, 'UNSATISFIED');
      stateFor(source).feedback = 'UNSATISFIED';
      activeTraceId.value = source.replyTraceId;
      calibrationReplySource.value = {
        replyTraceId: trace.id,
        sourceRefId: trace.sourceRefId || undefined,
        accountProfileId: trace.accountProfileId,
        weakEvidence: !trace.configurationHash,
        decisionOnly,
        existingRecordId: trace.calibration?.id || null,
        scopeImpact: trace.scopeImpact
      };
      calibrationDialogVisible.value = true;
    } finally {
      busyIds.delete(source.replyTraceId);
    }
  }

  async function openDetails(source: ReplyRecordTraceSource) {
    if (!source.replyTraceId) {
      ElMessage.warning('历史自动回复缺少可查看的生成详情');
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
      detailTrace.value = await loadTrace(source, true);
    } finally {
      detailsLoading.value = false;
    }
  }

  async function copyText(content: string) {
    const text = String(content || '').trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制回复内容');
  }

  function handleCalibrationChanged(record: CustomerServiceCalibrationRecord) {
    const traceId = activeTraceId.value;
    if (!traceId) return;
    const state = states[traceId] || (states[traceId] = { feedback: 'UNSATISFIED', calibrationStatus: null, strategyDraftStatus: null, trace: null });
    state.calibrationStatus = record.status;
    state.strategyDraftStatus = record.strategyDraftStatus || null;
    if (state.trace) {
      state.trace.calibration = {
        id: record.id,
        status: record.status,
        strategyDraftStatus: record.strategyDraftStatus || null,
        updatedAt: record.updatedAt
      };
    }
  }

  return {
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
  };
}
