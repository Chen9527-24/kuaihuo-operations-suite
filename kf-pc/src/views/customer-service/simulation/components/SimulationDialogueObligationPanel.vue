<template>
  <el-card v-if="obligation" shadow="never">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <span class="font-semibold">对话义务与反馈执行</span>
        <el-tag :type="handlingTagType(obligation)">
          {{ handlingModeLabel(obligation.feedbackHandlingMode) }}
        </el-tag>
      </div>
    </template>
    <div class="space-y-3 text-sm leading-6">
      <div class="grid gap-2 sm:grid-cols-2">
        <LabelValue label="上一轮动作" :value="moveLabel(obligation.previousAssistantMove)" />
        <LabelValue label="客户反馈" :value="feedbackLabel(obligation.userFeedback)" />
        <LabelValue label="反馈处理层级" :value="handlingModeLabel(obligation.feedbackHandlingMode)" />
        <LabelValue label="需明确承担过失" :value="obligation.acknowledgementRequired ? '是' : '否'" />
        <LabelValue label="被拒绝动作" :value="obligation.rejectedMove ? moveLabel(obligation.rejectedMove) : '无'" />
        <LabelValue label="纠正目标" :value="obligation.correctionTarget || '无'" />
        <LabelValue label="反馈目标轮次" :value="obligation.feedbackTargetTurnNo ? `#${obligation.feedbackTargetTurnNo}` : '未定位'" />
        <LabelValue label="必须换策略" :value="obligation.strategyChangeRequired ? '是' : '否'" />
      </div>
      <div
        class="rounded-lg border p-3"
        :class="obligation.feedbackHandlingMode === 'TRUST_REPAIR'
          ? 'border-red-200 bg-red-50 text-red-950'
          : obligation.strategyChangeRequired
            ? 'border-amber-200 bg-amber-50 text-amber-950'
            : 'border-slate-200 bg-slate-50'"
      >
        <div class="text-xs opacity-70">当前必须履行</div>
        <div class="mt-1 font-medium">{{ obligation.currentResponseObligation }}</div>
      </div>
      <div><span class="text-slate-500">尚未满足：</span>{{ obligation.unresolvedNeed || '无' }}</div>
      <div><span class="text-slate-500">已接受沟通方式：</span>{{ obligation.acceptedConversationStyle || '未识别' }}</div>
      <div>
        <span class="text-slate-500">要求变化：</span>
        <span v-if="!obligation.requestedDeltas.length">无</span>
        <el-tag v-for="delta in obligation.requestedDeltas" :key="delta" class="mr-1" size="small" type="warning">{{ deltaLabel(delta) }}</el-tag>
      </div>
      <div>
        <span class="text-slate-500">禁止重复：</span>
        <span v-if="!obligation.forbiddenRepeatedMoves.length">无</span>
        <el-tag v-for="move in obligation.forbiddenRepeatedMoves" :key="move" class="mr-1" size="small" type="danger">{{ moveLabel(move) }}</el-tag>
      </div>
      <div v-if="obligation.evidence.length" class="text-xs text-slate-500">证据：{{ obligation.evidence.join('；') }} · 置信度 {{ Math.round(obligation.confidence * 100) }}%</div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { CustomerServiceAssistantMove, CustomerServiceDialogueObligation } from '@/modules/customer-service/types/simulation.types';
import LabelValue from './SimulationLabelValue.vue';

defineProps<{ obligation?: CustomerServiceDialogueObligation | null }>();

const MOVE_LABELS: Record<CustomerServiceAssistantMove, string> = {
  ACKNOWLEDGE: '承接确认', INVITE_SHARING: '邀请继续讲述', GENERIC_EMPATHY: '泛化共情', ANALYZE: '分析解释',
  ADVISE: '给建议', ASK_QUESTION: '继续追问', OFFER_OPTIONS: '提供选项', EXPLAIN: '说明', BUSINESS_ACTION: '业务动作', UNKNOWN: '未知',
};
function moveLabel(value: CustomerServiceAssistantMove) { return MOVE_LABELS[value] || value; }
function feedbackLabel(value: CustomerServiceDialogueObligation['userFeedback']) {
  return ({ UNCLEAR: '无明确反馈', ACCEPTED: '接受', PARTIALLY_ACCEPTED: '部分接受', INSUFFICIENT: '力度不足', REJECTED: '拒绝', CORRECTED: '纠正', ESCALATED: '升级不满', WITHDRAWN: '撤回' } as const)[value] || value;
}
function handlingModeLabel(value: CustomerServiceDialogueObligation['feedbackHandlingMode']) {
  return ({ NONE: '正常延续', REFINE: '静默深化', CORRECT: '理解纠正', BOUNDARY: '持续边界', WITHDRAW: '停止当前动作', TRUST_REPAIR: '信任修复' } as const)[value] || value;
}
function handlingTagType(obligation: CustomerServiceDialogueObligation) {
  if (obligation.feedbackHandlingMode === 'TRUST_REPAIR') return 'danger';
  if (obligation.feedbackHandlingMode === 'REFINE' || obligation.feedbackHandlingMode === 'CORRECT' || obligation.feedbackHandlingMode === 'BOUNDARY') return 'warning';
  if (obligation.userFeedback === 'ACCEPTED') return 'success';
  return 'info';
}
function deltaLabel(value: string) {
  return ({ DEEPER: '更深入', MORE_SPECIFIC: '更具体', MORE_DETAILED: '更详细', WARMER: '更温暖', LESS_FORMAL: '更自然', MORE_DIRECT: '更直接', SHORTER: '更简短', DIFFERENT_APPROACH: '换种方式', ANOTHER_OPTION: '另一个办法', NO_QUESTIONS: '不追问', NO_ADVICE: '不给建议', LISTEN_ONLY: '只倾听', ANSWER_PREVIOUS_QUESTION: '回答前问', RETURN_TO_PREVIOUS_TOPIC: '回到旧话题', STOP_CURRENT_TOPIC: '停止话题' } as Record<string, string>)[value] || value;
}
</script>
