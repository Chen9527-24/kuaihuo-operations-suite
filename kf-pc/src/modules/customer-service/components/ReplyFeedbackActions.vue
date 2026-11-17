<template>
  <div class="reply-feedback-actions" :class="{ 'is-busy': busy }" @click.stop>
    <div class="reply-feedback-actions__desktop" role="toolbar" aria-label="回复操作">
      <el-button link size="small" class="reply-feedback-actions__button is-positive" :disabled="disabled || busy || !canFeedback" @click="$emit('satisfied')">
        {{ feedback === 'SATISFIED' ? positiveDoneLabel : positiveLabel }}
      </el-button>
      <el-button link size="small" class="reply-feedback-actions__button is-calibrate" :disabled="disabled || busy || !canCalibrate" @click="$emit('calibrate')">
        {{ calibrationStatus ? calibrationLabel : calibrateLabel }}
      </el-button>
      <el-button v-if="canRegenerate" link size="small" class="reply-feedback-actions__button is-regenerate" :disabled="disabled || busy" @click="$emit('regenerate')">重新生成</el-button>
      <el-button link size="small" class="reply-feedback-actions__button is-neutral" :disabled="disabled || busy" @click="$emit('copy')">复制</el-button>
      <el-button link size="small" class="reply-feedback-actions__button is-neutral" :disabled="disabled || busy || !hasTrace || !canViewDetails" @click="$emit('details')">生成详情</el-button>
    </div>

    <div class="reply-feedback-actions__mobile">
      <span v-if="statusText" class="reply-feedback-actions__status">{{ statusText }}</span>
      <el-dropdown trigger="click" :disabled="disabled || busy" @command="handleCommand">
        <el-button text size="small" aria-label="打开回复操作菜单">更多</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="satisfied" :disabled="!canFeedback">{{ feedback === 'SATISFIED' ? positiveDoneLabel : positiveLabel }}</el-dropdown-item>
            <el-dropdown-item command="calibrate" :disabled="!canCalibrate">{{ calibrationStatus ? calibrationLabel : calibrateLabel }}</el-dropdown-item>
            <el-dropdown-item v-if="canRegenerate" command="regenerate">重新生成</el-dropdown-item>
            <el-dropdown-item command="copy">复制</el-dropdown-item>
            <el-dropdown-item command="details" :disabled="!hasTrace || !canViewDetails">生成详情</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div v-if="statusText" class="reply-feedback-actions__status reply-feedback-actions__status--desktop">{{ statusText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CustomerServiceReplyFeedbackValue } from '@/modules/customer-service/api/reply-traces.api';

const props = withDefaults(defineProps<{
  feedback?: CustomerServiceReplyFeedbackValue | null;
  calibrationStatus?: string | null;
  strategyDraftStatus?: string | null;
  hasTrace?: boolean;
  canFeedback?: boolean;
  canCalibrate?: boolean;
  canViewDetails?: boolean;
  canRegenerate?: boolean;
  busy?: boolean;
  disabled?: boolean;
  positiveLabel?: string;
  positiveDoneLabel?: string;
  calibrateLabel?: string;
}>(), {
  feedback: null,
  calibrationStatus: null,
  strategyDraftStatus: null,
  hasTrace: false,
  canFeedback: true,
  canCalibrate: true,
  canViewDetails: true,
  canRegenerate: false,
  busy: false,
  disabled: false,
  positiveLabel: '满意',
  positiveDoneLabel: '已满意',
  calibrateLabel: '不满意·校准'
});

const emit = defineEmits<{
  satisfied: [];
  calibrate: [];
  regenerate: [];
  copy: [];
  details: [];
}>();

const calibrationLabel = computed(() => props.calibrationStatus === 'APPLIED_TUNING' ? '已形成校准证据' : '查看校准');
const statusText = computed(() => {
  if (props.strategyDraftStatus === 'PUBLISHED') return '策略已发布';
  if (props.strategyDraftStatus === 'REGRESSION_FAILED') return '回归失败';
  if (props.strategyDraftStatus === 'REGRESSION_PASSED') return '待发布';
  if (props.strategyDraftStatus === 'DRAFT') return '策略草稿待回归';
  if (props.calibrationStatus === 'APPLIED_TUNING') return '已形成校准证据';
  if (props.calibrationStatus === 'AI_ANALYZED') return 'AI 已分析';
  if (props.calibrationStatus) return '已保存反馈';
  if (props.feedback === 'SATISFIED') return '已满意';
  if (props.feedback === 'UNSATISFIED') return '已标记不满意';
  return '';
});

function handleCommand(command: string) {
  if (command === 'satisfied' && props.canFeedback) emit('satisfied');
  if (command === 'calibrate' && props.canCalibrate) emit('calibrate');
  if (command === 'regenerate' && props.canRegenerate) emit('regenerate');
  if (command === 'copy') emit('copy');
  if (command === 'details' && props.hasTrace && props.canViewDetails) emit('details');
}
</script>

<style scoped>
.reply-feedback-actions {
  min-height: 30px;
  padding-top: 4px;
  color: var(--el-text-color-secondary);
}

.reply-feedback-actions__desktop {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-bg-color) 92%, var(--el-color-success-light-9));
  box-shadow: 0 5px 18px rgb(15 23 42 / 6%);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.reply-feedback-actions__button {
  min-height: 26px;
  padding: 0 8px !important;
  border-radius: 999px !important;
  font-weight: 500;
}

.reply-feedback-actions__button.is-positive { color: var(--el-color-success); }
.reply-feedback-actions__button.is-positive:hover { background: var(--el-color-success-light-9); }
.reply-feedback-actions__button.is-calibrate {
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
}
.reply-feedback-actions__button.is-calibrate:hover { background: var(--el-color-warning-light-8); }
.reply-feedback-actions__button.is-regenerate { color: var(--el-color-primary); }
.reply-feedback-actions__button.is-regenerate:hover { background: var(--el-color-primary-light-9); }
.reply-feedback-actions__button.is-neutral { color: var(--el-text-color-regular); }
.reply-feedback-actions__button.is-neutral:hover { background: var(--el-fill-color-light); }

/*
 * Desktop reveal is owned by each host page. The host element belongs to the
 * parent component, so relying on a child scoped selector to match that
 * ancestor is not stable across the actual Vue build pipeline.
 */

.reply-feedback-actions__desktop :deep(.el-button + .el-button) {
  margin-left: 0;
}

.reply-feedback-actions__mobile {
  display: none;
}

.reply-feedback-actions__status {
  font-size: 12px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--el-color-success-dark-2);
  background: var(--el-color-success-light-9);
}

.reply-feedback-actions__status--desktop {
  margin-top: 4px;
}

.is-busy {
  opacity: 0.7;
}

@media (max-width: 767px) {
  .reply-feedback-actions {
    min-height: 28px;
  }

  .reply-feedback-actions__desktop,
  .reply-feedback-actions__status--desktop {
    display: none;
  }

  .reply-feedback-actions__mobile {
    display: flex;
    min-height: 28px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
}
</style>
