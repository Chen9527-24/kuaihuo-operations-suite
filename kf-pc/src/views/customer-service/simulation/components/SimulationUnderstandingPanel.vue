<template>
  <el-card shadow="never">
    <template #header><span class="font-semibold">客户动机、心境与回复规划</span></template>

    <div class="grid gap-3 md:grid-cols-4">
      <InfoCell label="分类来源" :value="understanding.source" />
      <InfoCell label="主场景" :value="understanding.primaryScenario" />
      <InfoCell label="主意图" :value="understanding.primaryIntent" />
      <InfoCell label="情绪 / 风险" :value="`${understanding.emotion} / ${understanding.riskLevel}`" />
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span class="font-medium">深度识别</span>
      <el-tag :type="recognitionStatusType(understanding.recognitionModel.status)">{{ recognitionStatusLabel(understanding.recognitionModel.status) }}</el-tag>
      <span v-if="understanding.recognitionModel.model" class="text-slate-500">{{ understanding.recognitionModel.model }} · {{ understanding.recognitionModel.elapsedMs }}ms</span>
      <span v-if="understanding.recognitionModel.fastPathReason" class="text-emerald-700">{{ understanding.recognitionModel.fastPathReason }}</span>
      <span v-if="understanding.recognitionModel.finishReason" class="text-slate-500">结束：{{ understanding.recognitionModel.finishReason }}</span>
      <span v-if="understanding.recognitionModel.responseLength != null" class="text-slate-500">{{ understanding.recognitionModel.responseLength }} 字符</span>
      <span v-if="understanding.recognitionModel.recoveryMode" class="text-slate-500">恢复：{{ recognitionRecoveryLabel(understanding.recognitionModel.recoveryMode) }}</span>
      <span v-if="understanding.recognitionModel.repairAttempted" class="text-slate-500">紧凑再生成：{{ understanding.recognitionModel.repairSucceeded ? '成功' : '失败' }}</span>
      <el-tooltip v-if="understanding.recognitionModel.parseError" :content="understanding.recognitionModel.parseError" placement="top"><el-tag size="small" type="warning">查看首次解析错误</el-tag></el-tooltip>
      <el-tooltip v-if="understanding.recognitionModel.repairParseError" :content="understanding.recognitionModel.repairParseError" placement="top"><el-tag size="small" type="danger">查看再生成错误</el-tag></el-tooltip>
      <span v-if="understanding.recognitionModel.errorMessage" class="text-amber-700">{{ understanding.recognitionModel.errorMessage }}</span>
      <span class="text-slate-500">识别结果会随多轮上下文重新判断，不会因为上一轮标签而锁死。</span>
    </div>

    <div class="mt-4 grid gap-3 xl:grid-cols-2">
      <div class="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-cyan-950">上下文多意图排序</span>
          <el-tag v-if="intentRanking.length" type="primary">{{ intentRanking.length }} 个</el-tag>
        </div>
        <div class="mt-3 space-y-2">
          <div v-for="item in intentRanking" :key="`${item.role}-${item.key}`" class="rounded border border-cyan-100 bg-white/80 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <el-tag size="small" :type="intentRoleTag(item.role)">{{ intentRoleLabel(item.role) }}</el-tag>
              <b class="text-sm">{{ item.name }}</b>
              <span class="text-xs text-slate-500">{{ Math.round(item.confidence * 100) }}%</span>
              <el-tag v-if="!item.actionable" size="small" type="info">观察 / 延后</el-tag>
            </div>
            <div class="mt-1 text-xs leading-5 text-slate-600">{{ item.reason }}</div>
            <div v-if="item.evidence.length" class="mt-1 text-xs leading-5 text-slate-500">依据：{{ item.evidence.join('；') }}</div>
          </div>
          <div v-if="!intentRanking.length" class="text-sm text-slate-400">历史记录未保存多意图排序；重新分析后会生成。</div>
        </div>
      </div>

      <div class="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-fuchsia-950">本轮目标优先级</span>
          <el-tag v-if="dominantTurnGoal" type="danger">主导：{{ dominantTurnGoal.name }}</el-tag>
        </div>
        <div v-if="dominantTurnGoal" class="mt-3 rounded border border-fuchsia-100 bg-white/80 p-3">
          <div class="text-sm font-medium text-fuchsia-950">{{ dominantTurnGoal.responseRequirement }}</div>
          <div class="mt-1 text-xs leading-5 text-slate-600">{{ dominantTurnGoal.reason }}</div>
        </div>
        <div v-if="requiredTurnGoals.length || requiredResponseActs.length" class="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3">
          <div class="text-xs font-medium text-emerald-900">本轮必须共同完成</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <el-tag v-for="goal in requiredTurnGoals" :key="goal.key" type="success" size="small">{{ goal.name }}</el-tag>
            <span v-if="!requiredTurnGoals.length" class="text-xs text-slate-400">历史记录未保存复合目标</span>
          </div>
          <div v-if="requiredResponseActs.length" class="mt-2 text-xs leading-5 text-emerald-800">
            真人回应动作：{{ requiredResponseActs.join('、') }}
          </div>
        </div>
        <div class="mt-3 space-y-2">
          <div v-for="(goal, index) in rankedTurnGoals" :key="goal.key" class="flex items-start gap-2 rounded border border-fuchsia-100 bg-white/70 p-2 text-sm">
            <el-tag size="small" :type="index === 0 ? 'danger' : goal.deferred ? 'info' : 'warning'">{{ index + 1 }}</el-tag>
            <div class="min-w-0">
              <div class="font-medium">{{ goal.name }} <span v-if="goal.deferred" class="text-xs font-normal text-slate-500">（延后）</span></div>
              <div class="mt-1 text-xs leading-5 text-slate-500">{{ goal.responseRequirement }}</div>
            </div>
          </div>
          <div v-if="!rankedTurnGoals.length" class="text-sm text-slate-400">历史记录未保存本轮目标排序；重新分析后会生成。</div>
        </div>
      </div>
    </div>

    <div v-if="conversationTaskState" class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-blue-950">多轮任务与待补信息</span>
        <el-tag type="primary">{{ taskStatusLabel(conversationTaskState.status) }}</el-tag>
        <el-tag type="info">{{ turnRelationLabel(conversationTaskState.currentTurnRelation) }}</el-tag>
        <el-tag v-if="conversationTaskState.requestResponseType && conversationTaskState.requestResponseType !== 'NONE'" type="warning">{{ requestResponseTypeLabel(conversationTaskState.requestResponseType) }}</el-tag>
      </div>
      <div class="mt-2 text-sm text-blue-950">当前任务：{{ conversationTaskState.activeScenario }} / {{ conversationTaskState.activeIntent }}</div>
      <div v-if="conversationTaskState.lastAssistantRequest" class="mt-1 text-sm text-blue-900">上一轮客服请求：{{ conversationTaskState.lastAssistantRequest }}</div>
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        <DetailList title="仍待客户补充" :items="conversationTaskState.status === 'WAITING_FOR_CUSTOMER' ? conversationTaskState.pendingSlots.map((item) => `${item.name}（${item.status}）`) : []" />
        <DetailList title="当前责任" :items="[responsibilityLabel(conversationTaskState.responsibility)]" />
        <DetailList title="已关闭语义问题" :items="conversationTaskState.semanticQuestions.filter((item) => item.status.startsWith('CLOSED')).map((item) => `${item.name}：${item.answer || item.status}（不可重复追问）`)" />
        <DetailList title="本轮已经补充" :items="conversationTaskState.providedSlots.map((item) => `${item.name}（已识别，${Math.round(item.confidence * 100)}%）`)" />
        <DetailList title="尚未完成的任务" :items="conversationTaskState.unresolvedGoals" />
        <DetailList title="后台保留的旧任务" :items="conversationTaskState.suspendedTasks?.map((item) => `${item.scenario} / ${item.intent} · ${item.status}`) || []" />
        <DetailList title="请求—回答判断依据" :items="conversationTaskState.evidence" />
      </div>
      <el-alert
        v-if="conversationTaskState.internalHandling?.required"
        class="mt-3"
        type="warning"
        :closable="false"
        show-icon
        :title="`内部处理标记：${conversationTaskState.internalHandling.scenario || '当前任务'} · ${conversationTaskState.internalHandling.status}`"
        :description="`${conversationTaskState.internalHandling.reason || '已进入后台处理队列'}。该状态只在管理端显示，不得写入客户回复。`"
      />
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-5">
      <InfoCell label="主要动机" :value="motiveLabel(understanding.humanContext.primaryMotive)" />
      <InfoCell label="当前心境" :value="mindsetLabel(understanding.humanContext.mindset)" />
      <InfoCell label="真实关系状态" :value="relationshipLabel(understanding.humanContext.relationshipState)" />
      <InfoCell label="朋友式服务姿态" :value="conversationStanceLabel(understanding.humanContext.conversationStance)" />
      <div class="rounded-lg bg-emerald-50 p-3">
        <div class="text-xs text-slate-500">商业开放度</div>
        <div class="mt-1 flex items-center gap-2 font-medium">
          <el-tag :type="opennessTagType(understanding.humanContext.commercialOpenness)">
            {{ opennessLabel(understanding.humanContext.commercialOpenness) }}
          </el-tag>
          <span>{{ understanding.humanContext.commercialOpennessScore }}/100</span>
        </div>
      </div>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-4">
      <InfoCell label="对话阶段" :value="phaseLabel(understanding.humanContext.interactionStrategy.phase)" />
      <InfoCell label="本轮第一动作" :value="firstMoveLabel(understanding.humanContext.interactionStrategy.firstMove)" />
      <InfoCell label="经营时机" :value="commercialTimingLabel(understanding.humanContext.interactionStrategy.commercialTiming)" />
      <InfoCell label="阶段判断" :value="understanding.humanContext.interactionStrategy.reason" />
    </div>

    <div class="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-indigo-950">潜在经营推进</span>
        <el-tag type="primary">{{ commercialStageLabel(commercialStrategy.stage) }}</el-tag>
        <el-tag :type="productPolicyTagType(commercialStrategy.productMentionPolicy)">
          {{ productPolicyLabel(commercialStrategy.productMentionPolicy) }}
        </el-tag>
      </div>
      <div class="mt-2 text-sm leading-6 text-indigo-950">本轮目标：{{ commercialStrategy.objective }}</div>
      <div class="mt-1 text-sm leading-6 text-indigo-900">探索维度：{{ commercialStrategy.discoveryTarget }}</div>
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        <DetailList title="进入下一阶段需要的信号" :items="commercialStrategy.transitionSignals" />
        <DetailList title="阶段判断依据" :items="commercialStrategy.evidence" />
      </div>
      <div class="mt-2 text-xs leading-5 text-indigo-800">{{ commercialStrategy.reason }}</div>
    </div>


    <div class="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-violet-900">本轮情绪姿态</span>
        <el-tag type="warning">{{ understanding.humanContext.emotionStrategy.posture }}</el-tag>
        <span class="text-xs text-violet-700">温度 {{ understanding.humanContext.emotionStrategy.warmth }} · 俏皮 {{ understanding.humanContext.emotionStrategy.playfulness }} · 解决优先 {{ understanding.humanContext.emotionStrategy.solutionPriority }}</span>
      </div>
      <div class="mt-2 text-sm leading-6 text-violet-900">{{ understanding.humanContext.emotionStrategy.reason }}</div>
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        <DetailList title="情绪表达要求" :items="understanding.humanContext.emotionStrategy.guidance" />
        <DetailList title="禁止情绪语气" :items="understanding.humanContext.emotionStrategy.forbiddenTone" tone="warning" />
      </div>
    </div>

    <div class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-emerald-900">本轮具体聊天策略</span>
        <el-tag type="success">{{ understanding.humanContext.replyStrategy.mode }}</el-tag>
        <el-tag type="info">{{ understanding.humanContext.replyStrategy.continuation }}</el-tag>
      </div>
      <div class="mt-2 text-sm font-medium leading-6 text-emerald-950">{{ understanding.humanContext.replyStrategy.primaryMove }}</div>
      <div class="mt-1 text-sm leading-6 text-emerald-900">价值目标：{{ understanding.humanContext.replyStrategy.valueGoal }}</div>
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        <DetailList title="可选后续动作" :items="understanding.humanContext.replyStrategy.secondaryMoves" />
        <DetailList title="禁止表达模式" :items="understanding.humanContext.replyStrategy.avoid" tone="warning" />
      </div>
      <div class="mt-2 text-xs leading-5 text-emerald-800">策略依据：{{ understanding.humanContext.replyStrategy.reason }}</div>
    </div>

    <div class="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-sky-900">语义动作预算</span>
        <el-tag type="primary">最多 {{ semanticMoveBudget.maxCoreMoves }} 个核心动作</el-tag>
      </div>
      <div class="mt-2 text-sm leading-6 text-sky-900">{{ semanticMoveBudget.reason }}</div>
      <div class="mt-3 grid gap-2 md:grid-cols-2">
        <DetailList title="本轮允许动作" :items="semanticMoveBudget.allowedMoves" />
        <DetailList title="禁止动作组合" :items="semanticMoveBudget.forbiddenCombinations" tone="warning" />
      </div>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <DetailList title="客户明确表达" :items="understanding.humanContext.statedNeeds" />
      <DetailList title="可能的隐含需要" :items="understanding.humanContext.inferredNeeds" />
      <DetailList title="本轮可提供的价值" :items="understanding.humanContext.valueOpportunities" />
      <DetailList title="动机与开放度依据" :items="understanding.humanContext.evidence" />
      <DetailList title="必须保留的不确定性" :items="understanding.humanContext.uncertainties" tone="warning" />
    </div>

    <div class="mt-4">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-sm font-medium">整段对话意图与本轮变化</div>
          <div class="mt-1 text-xs text-slate-500">稳定的整段对话意图与本轮事件、状态、弱信号分开显示。只有可沉淀的整段对话意图才提供“作为意图加入”。</div>
        </div>
      </div>
      <div v-if="understanding.recognizedItems.length" class="grid gap-3 xl:grid-cols-2">
        <div v-for="item in understanding.recognizedItems" :key="item.recognitionId" class="rounded-lg border p-3" :class="item.isPrimary ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <el-tag :type="recognitionTypeTag(item.type)" effect="plain">{{ recognitionTypeLabel(item.type) }}</el-tag>
                <span class="font-medium text-slate-800">{{ item.name }}</span>
                <el-tag v-if="item.isPrimary" size="small" type="success">主要</el-tag>
                <el-tag size="small" type="info">{{ item.scope === 'CONVERSATION' ? '整段对话' : '本轮' }}</el-tag>
                <el-tag size="small" effect="plain">{{ continuityLabel(item.continuity) }}</el-tag>
                <el-tag size="small" :type="matchStatusTag(item.matchStatus)">{{ matchStatusLabel(item.matchStatus) }}</el-tag>
                <span class="text-xs text-slate-500">{{ Math.round(item.confidence * 100) }}%</span>
              </div>
              <div class="mt-2 text-sm leading-6 text-slate-700">{{ item.description }}</div>
            </div>
            <el-button
              v-if="item.type === 'INTENT' && item.eligibleForIntentLibrary"
              size="small"
              type="primary"
              plain
              :disabled="!canCreateIntent || item.matchStatus === 'EXACT' || item.candidate?.status === 'CONVERTED' || addedIntentKeys.includes(item.recognitionId)"
              :loading="addingIntentKey === item.recognitionId"
              @click="emit('add-intent', item)"
            >
              {{ item.matchStatus === 'EXACT' ? '已关联正式意图' : item.candidate?.status === 'CONVERTED' || addedIntentKeys.includes(item.recognitionId) ? '已加入意图草稿' : '作为意图加入' }}
            </el-button>
            <el-tag v-else-if="item.type === 'INTENT'" size="small" type="info">本轮细节，不沉淀为正式意图</el-tag>
          </div>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>建议：{{ item.suggestedScenario }} / {{ item.suggestedPrimaryIntent }}</span>
            <span v-if="item.matchedDefinition">关联：{{ item.matchedDefinition.name }}（{{ item.matchScore }}）</span>
            <span v-if="item.candidate">已收集 {{ item.candidate.occurrenceCount }} 次 · 平均 {{ Math.round(item.candidate.averageConfidence * 100) }}%</span>
          </div>
          <div class="mt-2 text-xs leading-5 text-slate-500">关联判断：{{ item.matchReason }}</div>
          <div v-if="item.evidence.length" class="mt-1 text-xs leading-5 text-slate-500">识别依据：{{ item.evidence.join('；') }}</div>
        </div>
      </div>
      <el-empty v-else description="本轮没有形成可展示的识别结果" :image-size="72" />
    </div>

    <div class="mt-4">
      <div class="mb-2 text-sm font-medium">主题排序</div>
      <div class="space-y-2">
        <div v-for="topic in understanding.topics" :key="`${topic.scenario}-${topic.intent}`" class="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <el-tag>{{ topic.scenario }}</el-tag>
          <el-tag type="info">{{ topic.intent }}</el-tag>
          <el-tag :type="riskTagType(topic.riskLevel)">{{ topic.riskLevel }}</el-tag>
          <span class="text-slate-500">置信度 {{ Math.round(topic.confidence * 100) }}%</span>
          <span v-if="topic.evidence.length" class="text-slate-500">依据：{{ topic.evidence.join('、') }}</span>
        </div>
      </div>
    </div>

    <el-divider />

    <div class="grid gap-3 md:grid-cols-2">
      <div>
        <div class="text-sm font-medium">主要服务目标</div>
        <div class="mt-2 text-sm text-slate-700">{{ plan.serviceGoal }}</div>
      </div>
      <div>
        <div class="text-sm font-medium">真人感目标</div>
        <div class="mt-2 text-sm text-slate-700">{{ plan.humanityGoal }}</div>
      </div>
      <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div class="flex items-center gap-2 text-sm font-medium">
          经营机会
          <el-tag :type="opportunityTagType(plan.businessOpportunity.mode)">{{ plan.businessOpportunity.mode }}</el-tag>
        </div>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <el-tag v-if="plan.businessOpportunity.stage" type="primary" effect="plain">{{ commercialStageLabel(plan.businessOpportunity.stage) }}</el-tag>
          <el-tag v-if="plan.businessOpportunity.productMentionPolicy" :type="productPolicyTagType(plan.businessOpportunity.productMentionPolicy)" effect="plain">
            {{ productPolicyLabel(plan.businessOpportunity.productMentionPolicy) }}
          </el-tag>
        </div>
        <div class="mt-2 text-sm text-slate-700">{{ plan.businessOpportunity.reason }}</div>
        <div v-if="plan.businessOpportunity.discoveryTarget" class="mt-2 text-sm text-slate-600">本轮探索：{{ plan.businessOpportunity.discoveryTarget }}</div>
        <div v-if="plan.businessGoal" class="mt-2 text-sm text-slate-600">可选目标：{{ plan.businessGoal }}</div>
        <div v-else class="mt-2 text-sm text-slate-500">本轮不设置成交目标，但可按当前阶段主动创造或确认真实上下文。</div>
        <div v-if="plan.businessOpportunity.transitionSignals?.length" class="mt-2 text-xs leading-5 text-slate-500">推进条件：{{ plan.businessOpportunity.transitionSignals.join('；') }}</div>
      </div>
      <div>
        <div class="text-sm font-medium">路线原因</div>
        <div class="mt-2 text-sm text-slate-700">{{ plan.routeReason }}</div>
      </div>
      <div>
        <div class="text-sm font-medium">允许微动作</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <el-tag v-for="item in plan.microActions" :key="item" type="success" effect="plain">{{ item }}</el-tag>
        </div>
      </div>
      <div>
        <div class="text-sm font-medium">禁止微动作</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <el-tag v-for="item in plan.prohibitedMicroActions" :key="item" type="danger" effect="plain">{{ item }}</el-tag>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, type PropType } from 'vue';
import type {
  CustomerServiceCommercialOpenness,
  CustomerServiceConversationTaskState,
  CustomerServiceCommercialStage,
  CustomerServiceCommercialStrategy,
  CustomerServiceProductMentionPolicy,
  CustomerServiceCommercialTiming,
  CustomerServiceConversationPhase,
  CustomerServiceConversationStance,
  CustomerServiceFirstMove,
  CustomerServiceMessageUnderstanding,
  CustomerServiceMindset,
  CustomerServiceIntentHypothesis,
  CustomerServiceIntentRole,
  CustomerServiceTurnGoal,
  CustomerServicePrimaryMotive,
  CustomerServiceRelationshipState,
  CustomerServiceOrchestrationPlan,
  CustomerServiceRecognizedItem,
  CustomerServiceRecognitionItemType,
  CustomerServiceRecognitionMatchStatus,
  CustomerServiceRecognitionContinuity,
  CustomerServiceSimulationRiskLevel,
  CustomerServiceSemanticMoveBudget,
} from '@/modules/customer-service/types/simulation.types';

const props = withDefaults(defineProps<{
  understanding: CustomerServiceMessageUnderstanding;
  plan: CustomerServiceOrchestrationPlan;
  canCreateIntent?: boolean;
  addingIntentKey?: string;
  addedIntentKeys?: string[];
}>(), { canCreateIntent: false, addingIntentKey: '', addedIntentKeys: () => [] });
const emit = defineEmits<{ 'add-intent': [item: CustomerServiceRecognizedItem] }>();

const normalizeArray = <T>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];

const normalizeConversationTaskState = (
  state: CustomerServiceConversationTaskState | null | undefined,
): CustomerServiceConversationTaskState | null => {
  if (!state) return null;

  return {
    ...state,
    currentTurnRelation: state.currentTurnRelation || 'NEW_REQUEST',
    activeScenario: state.activeScenario || 'UNKNOWN',
    activeIntent: state.activeIntent || 'UNKNOWN',
    status: state.status || 'NONE',
    lastAssistantRequest: state.lastAssistantRequest ?? null,
    pendingSlots: normalizeArray(state.pendingSlots),
    providedSlots: normalizeArray(state.providedSlots),
    unresolvedGoals: normalizeArray(state.unresolvedGoals),
    suspendedTasks: normalizeArray(state.suspendedTasks),
    evidence: normalizeArray(state.evidence),
    responsibility: state.responsibility || 'NONE',
    semanticQuestions: normalizeArray(state.semanticQuestions),
    requestResponseType: state.requestResponseType || 'NONE',
    internalHandling: state.internalHandling || {
      required: false,
      status: 'NONE',
      scenario: null,
      reason: null,
      customerVisibleDisclosure: 'HIDDEN',
    },
  };
};

const intentRanking = computed<CustomerServiceIntentHypothesis[]>(() => props.understanding.intentRanking || props.plan.intentRanking || []);
const rankedTurnGoals = computed<CustomerServiceTurnGoal[]>(() => props.understanding.humanContext.rankedTurnGoals || props.plan.rankedTurnGoals || []);
const dominantTurnGoal = computed<CustomerServiceTurnGoal | null>(() => props.understanding.humanContext.dominantTurnGoal || props.plan.dominantTurnGoal || rankedTurnGoals.value[0] || null);
const requiredTurnGoals = computed<CustomerServiceTurnGoal[]>(() => props.understanding.humanContext.requiredTurnGoals || props.plan.requiredTurnGoals || (dominantTurnGoal.value ? [dominantTurnGoal.value] : []));
const requiredResponseActs = computed<string[]>(() => props.understanding.humanContext.requiredResponseActs || props.plan.requiredResponseActs || []);
const conversationTaskState = computed<CustomerServiceConversationTaskState | null>(() => normalizeConversationTaskState(props.understanding.humanContext.conversationTaskState));

const semanticMoveBudget = computed<CustomerServiceSemanticMoveBudget>(() => props.understanding.humanContext.semanticMoveBudget || {
  maxCoreMoves: props.understanding.humanContext.interactionStrategy.phase === 'OPENING' ? 1 : 2,
  allowedMoves: ['历史分析记录未保存显式预算，按当前阶段采用兼容预算'],
  forbiddenCombinations: [],
  reason: '该记录生成于语义动作预算字段上线前；新分析会保存完整预算。',
});

const commercialStrategy = computed<CustomerServiceCommercialStrategy>(() => {
  const saved = props.understanding.humanContext.commercialStrategy;
  if (saved) return saved;

  const opportunity = props.plan.businessOpportunity;
  return {
    stage: opportunity.stage || (opportunity.openness === 'CLOSED' ? 'NO_COMMERCIAL_MOVE' : opportunity.openness === 'LATENT' ? 'CONTEXT_DISCOVERY' : 'RELATIONSHIP_BUILDING'),
    objective: opportunity.reason || '历史记录未保存显式经营阶段，按商业开放度兼容展示。',
    discoveryTarget: opportunity.discoveryTarget || '等待新分析生成明确探索维度',
    productMentionPolicy: opportunity.productMentionPolicy || 'PROHIBITED',
    transitionSignals: opportunity.transitionSignals || [],
    evidence: props.understanding.humanContext.evidence || [],
    reason: '该记录生成于潜在经营阶段字段上线前；重新分析后会保存完整阶段。',
  };
});

const InfoCell = defineComponent({
  props: { label: { type: String, required: true }, value: { type: String, required: true } },
  setup(props) {
    return () => h('div', { class: 'rounded-lg bg-slate-50 p-3' }, [
      h('div', { class: 'text-xs text-slate-500' }, props.label),
      h('div', { class: 'mt-1 font-medium' }, props.value),
    ]);
  },
});

const DetailList = defineComponent({
  props: {
    title: { type: String, required: true },
    items: { type: Array as PropType<string[]>, required: true },
    tone: { type: String as PropType<'default' | 'warning'>, default: 'default' },
  },
  setup(props) {
    return () => h('div', {
      class: props.tone === 'warning' ? 'rounded-lg border border-amber-200 bg-amber-50 p-3' : 'rounded-lg border p-3',
    }, [
      h('div', { class: 'text-sm font-medium' }, props.title),
      h('ul', { class: 'mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700' },
        props.items.length ? props.items.map((item) => h('li', item)) : [h('li', { class: 'list-none text-slate-400' }, '暂无')]),
    ]);
  },
});

function intentRoleLabel(value: CustomerServiceIntentRole) { return ({ PRIMARY: '主意图', SECONDARY: '次级意图', LATENT: '潜在意图' } as Record<string, string>)[value] || value; }
function intentRoleTag(value: CustomerServiceIntentRole): 'success' | 'warning' | 'info' { return value === 'PRIMARY' ? 'success' : value === 'SECONDARY' ? 'warning' : 'info'; }

function riskTagType(risk: CustomerServiceSimulationRiskLevel) {
  if (risk === 'CRITICAL' || risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'success';
}

function opennessTagType(openness: CustomerServiceCommercialOpenness) {
  if (openness === 'CLOSED') return 'danger';
  if (openness === 'EXPLICIT' || openness === 'ACTIVE') return 'success';
  if (openness === 'LATENT') return 'warning';
  return 'info';
}

function opportunityTagType(mode: CustomerServiceOrchestrationPlan['businessOpportunity']['mode']) {
  if (mode === 'NONE') return 'info';
  if (mode === 'OBSERVE') return 'info';
  if (mode === 'DISCOVER') return 'warning';
  return 'success';
}


const commercialStageLabels: Record<CustomerServiceCommercialStage, string> = {
  NO_COMMERCIAL_MOVE: '暂停经营',
  RELATIONSHIP_BUILDING: '关系建立',
  CONTEXT_DISCOVERY: '场景探索',
  NEED_EXPLORATION: '需求探索',
  VALUE_BRIDGING: '价值连接',
  PRODUCT_RECOMMENDATION: '产品推荐',
  DECISION_SUPPORT: '决策支持',
  LOW_PRESSURE_CLOSE: '低压力成交',
};
const productPolicyLabels: Record<CustomerServiceProductMentionPolicy, string> = {
  PROHIBITED: '禁止提商品',
  CATEGORY_ONLY: '只可用品类方向',
  SPECIFIC_IF_RELEVANT: '相关时可提具体商品',
  SPECIFIC_ALLOWED: '允许具体商品',
};
function commercialStageLabel(value: CustomerServiceCommercialStage) { return commercialStageLabels[value] || value; }
function productPolicyLabel(value: CustomerServiceProductMentionPolicy) { return productPolicyLabels[value] || value; }
function productPolicyTagType(value: CustomerServiceProductMentionPolicy) {
  if (value === 'PROHIBITED') return 'danger';
  if (value === 'CATEGORY_ONLY') return 'warning';
  return 'success';
}


function recognitionRecoveryLabel(value: string) { return ({ LOCAL_REPAIR: '本地容错修复', MODEL_REGENERATION: '模型紧凑再生成' } as Record<string, string>)[value] || value; }
function recognitionStatusType(status: CustomerServiceMessageUnderstanding['recognitionModel']['status']) {
  if (status === 'SUCCESS' || status === 'FAST_PATH') return 'success';
  if (status === 'MODEL_ERROR' || status === 'INVALID_RESPONSE') return 'warning';
  return 'info';
}
function recognitionStatusLabel(status: CustomerServiceMessageUnderstanding['recognitionModel']['status']) {
  const labels = { NOT_REQUESTED: '未请求模型', FAST_PATH: '快速识别', SUCCESS: '模型深度识别', MODEL_NOT_CONFIGURED: '增强启发式', MODEL_ERROR: '模型失败，已回退', INVALID_RESPONSE: '结果异常，已回退' };
  return labels[status] || status;
}
function recognitionTypeLabel(type: CustomerServiceRecognitionItemType) {
  return ({ INTENT: '客户意图', EVENT: '业务事件', STATE: '当前状态', SIGNAL: '弱信号' } as Record<string, string>)[type] || type;
}
function recognitionTypeTag(type: CustomerServiceRecognitionItemType) {
  if (type === 'INTENT') return 'success';
  if (type === 'EVENT') return 'warning';
  if (type === 'STATE') return 'info';
  return undefined;
}
function matchStatusLabel(status: CustomerServiceRecognitionMatchStatus) {
  return ({ EXACT: '精确关联', RELATED: '存在相关意图', UNMATCHED: '未关联' } as Record<string, string>)[status] || status;
}
function matchStatusTag(status: CustomerServiceRecognitionMatchStatus) {
  if (status === 'EXACT') return 'success';
  if (status === 'RELATED') return 'warning';
  return 'info';
}
function continuityLabel(value: CustomerServiceRecognitionContinuity) {
  return ({ NEW: '新出现', CONTINUING: '持续中', SHIFTED: '已转向', RESOLVED: '已结束' } as Record<string, string>)[value] || value;
}

const phaseLabels: Record<CustomerServiceConversationPhase, string> = {
  OPENING: '交流开场',
  SHARING: '客户分享',
  SERVICE: '服务处理',
  DECISION: '需求判断与决策',
  REPAIR: '关系修复',
  CLOSING: '对话收束',
};
const firstMoveLabels: Record<CustomerServiceFirstMove, string> = {
  ACKNOWLEDGE_AND_INVITE_SHARING: '先承接并邀请分享',
  INVITE_SHARING: '自然邀请客户分享',
  DISCOVER_CONTEXT: '主动探索生活场景',
  RESPOND_TO_SHARED_CONTEXT: '先回应客户已分享内容',
  PROCESS_PROVIDED_INFORMATION: '处理客户已补充的信息',
  HANDLE_INFORMATION_BARRIER: '处理资料障碍并降低客户负担',
  CLARIFY_NEED: '确认真正需要',
  SOLVE_CURRENT_ISSUE: '先处理当前问题',
  SUPPORT_DECISION: '帮助客户做判断',
  REPAIR_RELATIONSHIP: '先修复关系与信任',
  CONFIRM_OR_CLOSE: '确认结果或自然收束',
};
const commercialTimingLabels: Record<CustomerServiceCommercialTiming, string> = {
  HOLD: '暂停经营内容',
  WAIT_FOR_CONTEXT: '等待客户提供真实上下文',
  EXPLORE_IF_RELEVANT: '有真实关联时再探索',
  ASSIST_NOW: '当前可提供需求帮助',
};
function phaseLabel(value: CustomerServiceConversationPhase) { return phaseLabels[value] || value; }
function firstMoveLabel(value: CustomerServiceFirstMove) { return firstMoveLabels[value] || value; }
function commercialTimingLabel(value: CustomerServiceCommercialTiming) { return commercialTimingLabels[value] || value; }


const taskStatusLabels: Record<CustomerServiceConversationTaskState['status'], string> = {
  NONE: '当前无持续任务', IN_PROGRESS: '任务处理中', WAITING_FOR_CUSTOMER: '等待客户补充', INTERNAL_PROCESSING: '后台处理中', READY_TO_ADVANCE: '资料已补，可继续推进', RESOLVED: '任务已解决',
};
const turnRelationLabels: Record<CustomerServiceConversationTaskState['currentTurnRelation'], string> = {
  NEW_REQUEST: '新请求', ANSWER_TO_ASSISTANT_REQUEST: '回答上一轮请求', INFORMATION_BARRIER: '资料障碍或拒绝', CONTINUATION: '延续当前任务', TOPIC_SHIFT: '切换话题', RESOLUTION: '确认解决',
};
function taskStatusLabel(value: CustomerServiceConversationTaskState['status']) { return taskStatusLabels[value] || value; }
function turnRelationLabel(value: CustomerServiceConversationTaskState['currentTurnRelation']) { return turnRelationLabels[value] || value; }
const responsibilityLabels: Record<CustomerServiceConversationTaskState['responsibility'], string> = { NONE: '无', CUSTOMER: '等待客户补充', INTERNAL: '后台处理', SHARED: '双方共同推进' };
function responsibilityLabel(value: CustomerServiceConversationTaskState['responsibility']) { return responsibilityLabels[value] || value; }
const requestResponseTypeLabels: Record<NonNullable<CustomerServiceConversationTaskState['requestResponseType']>, string> = { NONE: '无', PROVIDED: '已提供资料', UNAVAILABLE: '暂时无法提供', REFUSED: '拒绝提供', ALTERNATIVE_REQUEST: '要求替代处理方式' };
function requestResponseTypeLabel(value: NonNullable<CustomerServiceConversationTaskState['requestResponseType']>) { return requestResponseTypeLabels[value] || value; }

const motiveLabels: Record<CustomerServicePrimaryMotive, string> = {
  RELATIONSHIP_CONTACT: '主动建立或维持联系',
  EMOTIONAL_SHARING: '分享当前情绪',
  INFORMATION_SEEKING: '获取信息并判断',
  ACTION_REQUEST: '请求执行或推进事项',
  PURCHASE_EXPLORATION: '探索潜在购买方向',
  PURCHASE_DECISION: '明确购买决策',
  PROBLEM_RESOLUTION: '解决具体问题',
  RELATIONSHIP_REPAIR: '修复关系与信任',
};
const mindsetLabels: Record<CustomerServiceMindset, string> = {
  OPEN_AND_RELAXED: '开放、放松',
  TASK_FOCUSED: '目标明确、关注结果',
  CAUTIOUS: '谨慎评估',
  ANXIOUS: '焦虑、需要确定性',
  DISAPPOINTED: '失望、信任下降',
  ANGRY: '愤怒、需要先处理冲突',
  NEUTRAL: '中性',
};
const conversationStanceLabels: Record<CustomerServiceConversationStance, string> = {
  FORMAL_SERVICE: '正式克制服务',
  FRIENDLY_SERVICE: '自然友好服务',
  CLOSE_FRIEND_SERVICE: '关系较好的朋友式服务',
  REPAIR_SERVICE: '认真修复关系',
};
const relationshipLabels: Record<CustomerServiceRelationshipState, string> = {
  FORMAL: '正式接触',
  OPEN: '愿意交流',
  FAMILIAR: '已有熟悉度',
  STRAINED: '关系紧张',
};
const opennessLabels: Record<CustomerServiceCommercialOpenness, string> = {
  CLOSED: '关闭经营内容',
  UNKNOWN: '暂不明确',
  LATENT: '潜在开放',
  ACTIVE: '正在评估',
  EXPLICIT: '明确购买意愿',
};
function motiveLabel(value: CustomerServicePrimaryMotive) { return motiveLabels[value] || value; }
function mindsetLabel(value: CustomerServiceMindset) { return mindsetLabels[value] || value; }
function relationshipLabel(value: CustomerServiceRelationshipState) { return relationshipLabels[value] || value; }
function conversationStanceLabel(value?: CustomerServiceConversationStance) { return value ? conversationStanceLabels[value] || value : '历史记录未保存显式姿态'; }
function opennessLabel(value: CustomerServiceCommercialOpenness) { return opennessLabels[value] || value; }

</script>
