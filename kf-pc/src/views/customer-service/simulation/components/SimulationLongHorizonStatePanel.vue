<template>
  <el-card v-if="state" shadow="never">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <span class="font-semibold">长对话状态 V{{ state.schemaVersion }}</span>
        <el-tag type="info">修订 #{{ state.revision }} · 第 {{ state.currentTurn }} 轮</el-tag>
      </div>
    </template>
    <div class="space-y-3 text-sm leading-6">
      <div class="grid gap-2 sm:grid-cols-2">
        <LabelValue label="近期原文" :value="`${contextWindow?.recentMessageCount || 0} 条`" />
        <LabelValue label="召回记忆" :value="`${contextWindow?.retrievedMemoryCount || 0} 条`" />
        <LabelValue label="活跃任务" :value="taskLabel(state.activeTask)" />
        <LabelValue label="暂停任务" :value="`${state.suspendedTasks.length} 个`" />
      </div>
      <div v-if="state.relationshipDynamics" class="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3">
        <div class="mb-2 font-medium text-fuchsia-900">长期关系与本轮人际姿态</div>
        <div class="grid gap-2 sm:grid-cols-3">
          <LabelValue label="关系距离" :value="state.relationshipDynamics.relationshipDistance" />
          <LabelValue label="支持方式" :value="state.relationshipDynamics.supportMode" />
          <LabelValue label="建议姿态" :value="state.relationshipDynamics.recommendedStance" />
          <LabelValue label="上轮接受度" :value="state.relationshipDynamics.previousReplyReception" />
          <LabelValue label="情绪强度" :value="state.relationshipDynamics.emotionalIntensity" />
          <LabelValue label="对话节奏" :value="state.relationshipDynamics.conversationTempo" />
        </div>
        <div class="mt-2 text-xs text-fuchsia-800">
          近期人际动作：{{ actionList(state.relationshipDynamics.recentInterpersonalActions) }}
        </div>
        <div class="mt-1 text-xs text-fuchsia-800">
          近期实用动作：{{ actionList(state.relationshipDynamics.recentPracticalActions) }}
        </div>
      </div>
      <div v-if="state.behaviorHistory" class="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
        <div class="mb-2 font-medium text-cyan-900">Behavior History · 最近互动节奏</div>
        <div class="grid gap-2 sm:grid-cols-3">
          <LabelValue label="行为窗口" :value="`${state.behaviorHistory.windowSize || 0} 轮`" />
          <LabelValue label="连续问句结尾" :value="`${state.behaviorHistory.consecutiveQuestionEndingTurns || 0} 轮`" />
          <LabelValue label="可选 / 必要问题" :value="`${state.behaviorHistory.recentOptionalQuestionCount || 0} / ${state.behaviorHistory.recentRequiredQuestionCount || 0}`" />
          <LabelValue label="近期 CTA" :value="String(state.behaviorHistory.recentCtaCount || 0)" />
          <LabelValue label="身份 / 服务说明" :value="`${state.behaviorHistory.recentSelfIntroCount || 0} / ${state.behaviorHistory.recentServiceScopeCount || 0}`" />
          <LabelValue label="近期复述" :value="String(state.behaviorHistory.recentRestatementCount || 0)" />
        </div>
        <div class="mt-2 text-xs text-cyan-800">近期结构：{{ listLabel(state.behaviorHistory.recentStructureKeys) }}</div>
        <div class="mt-1 text-xs text-cyan-800">客户持续偏好：{{ listLabel(state.behaviorHistory.recentRequestedDeltas) }}</div>
      </div>
      <div v-if="state.relevantMemories.length">
        <div class="mb-1 text-slate-500">本轮召回的重要信息</div>
        <div v-for="memory in state.relevantMemories" :key="memory.id" class="mb-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
          <el-tag class="mr-1" size="small">{{ memory.kind }}</el-tag>
          {{ memory.value }} <span class="text-xs text-slate-400">#{{ memory.sourceTurn }}</span>
        </div>
      </div>
      <div v-if="state.recentAssistantMoves.length">
        <div class="mb-1 text-slate-500">最近回复策略与语义动作族</div>
        <div class="flex flex-wrap gap-1">
          <el-tag v-for="move in state.recentAssistantMoves.slice(-8)" :key="`${move.turn}-${move.strategyKey}`" size="small" :type="move.rejected ? 'danger' : move.accepted ? 'success' : 'info'">
            #{{ move.turn }} {{ move.move }}
            <span v-if="move.actionFamilies?.length"> · {{ move.actionFamilies.join('/') }}</span>
            {{ move.rejected ? '（已拒绝）' : '' }}
          </el-tag>
        </div>
      </div>
      <div v-if="state.closedSemanticQuestions.length" class="text-xs text-slate-500">
        已关闭问题：{{ state.closedSemanticQuestions.join('、') }}
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { CustomerServiceConversationStateSummary } from '@/modules/customer-service/types/simulation.types';
import LabelValue from './SimulationLabelValue.vue';

defineProps<{
  state?: CustomerServiceConversationStateSummary | null;
  contextWindow?: { recentMessageCount: number; retrievedMemoryCount: number; estimatedCharacters: number } | null;
}>();

function taskLabel(task: Record<string, unknown> | null) {
  if (!task) return '无';
  return `${String(task.scenario || 'UNKNOWN')} / ${String(task.intent || 'UNKNOWN')} · ${String(task.status || 'UNKNOWN')}`;
}
function actionList(actions?: string[]) {
  return actions?.length ? actions.join('、') : '无';
}
function listLabel(values?: string[]) {
  return values?.length ? values.slice(-8).join('、') : '无';
}
</script>
