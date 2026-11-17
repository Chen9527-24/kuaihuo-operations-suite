<template>
  <div class="space-y-4 pt-2">
    <el-alert
      v-if="strategyVersionIds.length"
      :title="`正在回归未发布策略草稿：${strategyVersionIds.join(', ')}`"
      type="warning"
      :closable="false"
      show-icon
    />
    <el-alert
      title="固定回归测试直接调用现有智能客服模拟接口，不发送真实客户消息、不执行业务写操作，也不创建调优会话。每次修改策略配置组、意图关联或局部覆盖后，可在发布前重复运行。"
      type="info"
      :closable="false"
      show-icon
    />

    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-semibold">冻结测试集</div>
            <div class="mt-1 text-xs text-slate-500">覆盖正负向情绪分享、安慰/倾听/建议/情绪空间、多轮问题生命周期、资料责任、投诉、物流和预约。</div>
          </div>
          <div class="flex items-center gap-2">
            <el-button :disabled="!results.length" @click="exportResults">导出测试 JSON</el-button>
            <el-button type="primary" :loading="running" :disabled="!canRun" @click="runSelected">运行已选测试</el-button>
          </div>
        </div>
      </template>

      <el-table v-if="!mobile" :data="cases" row-key="key" stripe>
        <el-table-column width="54">
          <template #header><el-checkbox :model-value="allSelected" :indeterminate="partSelected" @change="toggleAll(Boolean($event))" /></template>
          <template #default="{ row }"><el-checkbox :model-value="selectedKeys.includes(row.key)" @change="toggleCase(row.key, Boolean($event))" /></template>
        </el-table-column>
        <el-table-column prop="name" label="测试场景" min-width="180" />
        <el-table-column prop="message" label="本轮客户消息" min-width="300" show-overflow-tooltip />
        <el-table-column label="重点检查" min-width="280"><template #default="{ row }">{{ row.expectation }}</template></el-table-column>
        <el-table-column label="结果" width="115">
          <template #default="{ row }">
            <el-tag v-if="resultMap[row.key]" :type="resultTag(resultMap[row.key].status)">{{ resultLabel(resultMap[row.key].status) }}</el-tag>
            <span v-else class="text-xs text-slate-400">未运行</span>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="space-y-3">
        <div class="flex items-center justify-between rounded-xl bg-slate-50 p-3">
          <el-checkbox :model-value="allSelected" :indeterminate="partSelected" @change="toggleAll(Boolean($event))">选择全部</el-checkbox>
          <span class="text-xs text-slate-500">已选 {{ selectedKeys.length }} / {{ cases.length }}</span>
        </div>
        <article v-for="item in cases" :key="item.key" class="rounded-xl border border-slate-200 bg-white p-3">
          <div class="flex items-start gap-3">
            <el-checkbox :model-value="selectedKeys.includes(item.key)" class="!mr-0" @change="toggleCase(item.key, Boolean($event))" />
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <b class="text-sm">{{ item.name }}</b>
                <el-tag v-if="resultMap[item.key]" :type="resultTag(resultMap[item.key].status)" size="small">{{ resultLabel(resultMap[item.key].status) }}</el-tag>
              </div>
              <div class="mt-2 text-sm leading-6 text-slate-700">{{ item.message }}</div>
              <div class="mt-2 text-xs leading-5 text-slate-500">{{ item.expectation }}</div>
            </div>
          </div>
        </article>
      </div>
    </el-card>

    <el-card v-if="results.length" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold">本次测试结果</span>
          <div class="flex gap-2">
            <el-tag type="success">通过 {{ passCount }}</el-tag>
            <el-tag type="warning">受限 {{ limitedCount }}</el-tag>
            <el-tag type="danger">失败 {{ failCount }}</el-tag>
          </div>
        </div>
      </template>

      <div class="space-y-3">
        <el-collapse>
          <el-collapse-item v-for="item in results" :key="item.key" :name="item.key">
            <template #title>
              <div class="flex min-w-0 flex-1 items-center gap-3 pr-4">
                <el-tag :type="resultTag(item.status)" size="small">{{ resultLabel(item.status) }}</el-tag>
                <span class="font-medium">{{ item.name }}</span>
                <span class="truncate text-xs text-slate-400">{{ item.summary }}</span>
              </div>
            </template>
            <div class="grid gap-4 xl:grid-cols-2">
              <div class="space-y-3 text-sm leading-6">
                <div class="rounded-lg bg-slate-50 p-3">
                  <div><b>识别：</b>{{ item.actualScenario }} / {{ item.actualIntent }}</div>
                  <div><b>经营阶段：</b>{{ item.commercialStage }}</div>
                  <div><b>最终策略：</b>俏皮 {{ valueLabel(item.playfulness) }}；波浪号 {{ item.tildePolicy }}；表情 {{ item.emojiPolicy }}；商品 {{ item.productMentionPolicy }}</div>
                  <div><b>质量门：</b>{{ item.qualityStatus }}；生成状态 {{ item.generationStatus }}</div>
                </div>
                <div><b>检查结论：</b>{{ item.checks.join('；') }}</div>
                <div v-if="item.failedIssues.length"><b>失败规则：</b>{{ item.failedIssues.join('、') }}</div>
                <div v-if="item.error" class="text-red-600"><b>错误：</b>{{ item.error }}</div>
              </div>
              <div>
                <div class="mb-2 text-sm font-medium">最终候选回复</div>
                <div class="min-h-[96px] whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-7">{{ item.draft || '本次没有生成候选回复' }}</div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { executeCustomerServiceSimulation } from '@/modules/customer-service/api/simulation.api';
import type { CustomerServiceSimulationExecutionResult } from '@/modules/customer-service/types/simulation.types';
import type { CustomerServiceStrategyDraftRegressionEvidence } from '@/modules/customer-service/types/calibrations.types';

type RegressionCase = {
  key: string;
  name: string;
  message: string;
  expectation: string;
  conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  customerState?: Record<string, unknown>;
  validate: (result: CustomerServiceSimulationExecutionResult) => string[];
};

type RegressionStatus = 'PASS' | 'LIMITED' | 'FAIL';
type RegressionResult = {
  key: string;
  name: string;
  status: RegressionStatus;
  summary: string;
  actualScenario: string;
  actualIntent: string;
  commercialStage: string;
  playfulness: number | null;
  tildePolicy: string;
  emojiPolicy: string;
  productMentionPolicy: string;
  qualityStatus: string;
  generationStatus: string;
  draft: string | null;
  checks: string[];
  failedIssues: string[];
  error: string | null;
  raw?: CustomerServiceSimulationExecutionResult;
};

const props = withDefaults(defineProps<{
  merchantRoleId: string;
  industryNodeId?: string;
  canExecute: boolean;
  mobile?: boolean;
  strategyVersionIds?: string[];
}>(), { mobile: false, strategyVersionIds: () => [] });
const emit = defineEmits<{ completed: [evidence: CustomerServiceStrategyDraftRegressionEvidence] }>();
const running = ref(false);
const selectedKeys = ref<string[]>([]);
const results = ref<RegressionResult[]>([]);

const cases: RegressionCase[] = [
  {
    key: 'casual-companionship', name: '普通陪聊·不得误判安慰', message: '好无聊啊，陪我聊聊天吧',
    expectation: '识别普通关系互动而非负面情绪安慰；自然给出一个聊天入口，不凭“陪我”二字升级情绪。',
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'RELATIONSHIP_CONTACT'),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'MAINTAIN_RELATIONSHIP'),
      expectNotEqual('不得误判负面情绪', result.understanding.emotion, 'DISAPPOINTED'),
      expectNotMatch('禁止虚构难受处境', result.generation.draft || '', /难受|不好过|委屈|心疼|失落|缓一缓/i),
    ],
  },
  {
    key: 'casual-opening', name: '普通闲聊开场', message: '今天心情不错，随便聊聊？',
    expectation: '识别轻松交流；标准标点；不轻浮；最多一个问题；禁止提前提商品。',
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['CASUAL_CHAT']),
      expectEqual('波浪号策略', result.contract.strategyPolicy.resolved.wording.tildePolicy, 'FORBIDDEN'),
      expectAtMost('问题上限', result.contract.strategyPolicy.resolved.structure.maxQuestions, 1),
      expectEqual('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy, 'PROHIBITED'),
    ],
  },
  {
    key: 'negative-emotional-disclosure', name: '负面情绪倾诉·失恋', message: '我失恋了，今天心情非常不好!',
    expectation: '识别通用负面情绪倾诉与寻求倾听；不得匹配积极分享；回复情绪极性必须一致；禁止商业探索和正向固定话术。',
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'EMOTIONAL_DISCLOSURE'),
      expectOneOf('情绪', result.understanding.emotion, ['DISAPPOINTED', 'FRUSTRATED', 'ANXIOUS']),
      expectEqual('情绪倾诉极性', result.understanding.humanContext.emotionalDisclosure.polarity, 'NEGATIVE'),
      expectEqual('商业开放度', result.understanding.humanContext.commercialOpenness, 'CLOSED'),
      expectEqual('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy, 'PROHIBITED'),
      expectOneOf('生成状态', result.generation.status, ['GENERATED', 'DETERMINISTIC']),
      expectNotMatch('禁止相反情绪', result.generation.draft || '', /这么开心|好开心|顺心事|什么好事|太棒了|值得开心|开心就好|😄|😁|😊|🥳|🎉/i),
      expectMatch('负面倾诉承接', result.generation.draft || '', /失恋|分手|难受|不好过|心情不好|难过|伤心|失落|堵得慌|想聊聊|慢慢说|听着/i),
    ],
  },
  {
    key: 'emotional-comfort-continuation', name: '情绪延续·明确请求安慰', message: '真的吗，要不你安慰一下我',
    expectation: '继承负面情绪并走快速路径；主导目标必须是直接安慰；质量救援最多两次且模型累计预算不超过 18 秒。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '我失恋了，今天心情非常不好！' },
      { role: 'ASSISTANT', content: '失恋确实很难受，今天肯定不好过。想聊聊的话，我听着。' },
    ],
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'EMOTIONAL_DISCLOSURE'),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'PROVIDE_EMOTIONAL_COMFORT'),
      expectEqual('识别路径', result.understanding.recognitionModel.status, 'FAST_PATH'),
      expectOneOf('情绪继承', result.understanding.emotion, ['DISAPPOINTED', 'FRUSTRATED', 'ANXIOUS']),
      expectAtMost('识别耗时', result.performance.recognitionElapsedMs, 1000),
      expectAtMost('模型调用次数', result.performance.modelCallCount, 2),
      expectAtMost('模型累计耗时', result.performance.recognitionElapsedMs + result.performance.generationModelElapsedMs, 14000),
      expectMatch('实际给予安慰', result.generation.draft || '', /难受|不好过|委屈|心疼|抱抱|陪着|缓一缓|不用急|慢慢来|不是你的错/i),
      expectNotMatch('禁止只重复倾听邀请', result.generation.draft || '', /^(?:想说什么|你说吧|我听着|慢慢说)[。！!]*$/i),
    ],
  },
  {
    key: 'listen-to-venting', name: '情绪诉求·只想吐槽', message: '今天在公司受了一肚子气，我就想吐槽一下，你听着就好。',
    expectation: '主导目标为倾听吐槽；接住当前情绪，不分析、不说教、不强行给建议。',
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'EMOTIONAL_DISCLOSURE'),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'LISTEN_TO_VENTING'),
      expectEqual('第一动作', result.understanding.humanContext.interactionStrategy.firstMove, 'RESPOND_TO_SHARED_CONTEXT'),
      expectNotMatch('禁止强行建议', result.generation.draft || '', /你应该|你可以试试|建议你|不如你|首先.*其次/i),
      expectNotMatch('禁止追问原因', result.generation.draft || '', /为什么|什么原因|怎么回事|发生了什么/i),
    ],
  },
  {
    key: 'requested-advice', name: '情绪诉求·明确请求建议', message: '失恋后我一直缓不过来，你觉得我该怎么办，给我点建议。',
    expectation: '主导目标为回应建议请求；先承接处境，再给一到两个低压力可执行方向。',
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'EMOTIONAL_DISCLOSURE'),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'PROVIDE_REQUESTED_ADVICE'),
      expectMatch('包含可执行建议', result.generation.draft || '', /先|可以|试着|给自己|暂时|今天|这几天|找|写下来|减少|保持/i),
      expectNotMatch('禁止心理诊断', result.generation.draft || '', /抑郁症|焦虑症|创伤后|人格障碍|心理疾病/i),
    ],
  },
  {
    key: 'respect-emotional-space', name: '情绪诉求·尊重暂不展开', message: '我现在不想说细节，先让我安静一会儿，别再问了。',
    expectation: '主导目标为尊重情绪空间；停止追问，简短确认边界并自然停住。',
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'RESPECT_EMOTIONAL_SPACE'),
      expectEqual('第一动作', result.understanding.humanContext.interactionStrategy.firstMove, 'RESPOND_TO_SHARED_CONTEXT'),
      expectNotMatch('禁止任何追问', result.generation.draft || '', /[？?]|为什么|怎么了|愿意说说|能告诉我|发生了什么/i),
    ],
  },
  {
    key: 'repair-reject-analysis', name: '多轮纠偏·拒绝分析并要求安慰', message: '我让你安慰我，不是让你分析。',
    expectation: '不得走 FAST_PATH；形成修复义务并切换到 REPAIR_TRUST；承认上一轮说偏、直接安慰，不再分析或追问。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '我失恋了，今天特别难受。' },
      { role: 'ASSISTANT', content: '从心理上看，这说明你还没有走出依赖。' },
    ],
    validate: (result) => [
      expectEqual('用户反馈', result.understanding.humanContext.dialogueObligation.userFeedback, 'CORRECTED'),
      expectEqual('纠正目标', result.understanding.humanContext.dialogueObligation.correctionTarget, 'INTERACTION'),
      expectEqual('修复义务', result.understanding.humanContext.dialogueObligation.repairObligation, true),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'REPAIR_TRUST'),
      expectIncludes('禁止重复动作', result.understanding.humanContext.dialogueObligation.forbiddenRepeatedMoves, 'ANALYZE'),
      expectNotEqual('识别路径不得为快速路径', result.understanding.recognitionModel.status, 'FAST_PATH'),
      expectMatch('承认上一轮偏差', result.generation.draft || '', /刚才|前面|上一轮|是我|说偏|没接住|没理解/),
      expectNotMatch('禁止继续分析或追问', result.generation.draft || '', /本质上|心理上|这说明|可能是因为|[？?]/),
    ],
  },
  {
    key: 'repair-listen-not-advise', name: '多轮纠偏·只倾听不建议', message: '我不是要建议，我只想让你听着。',
    expectation: '识别客户拒绝建议；先修复，再按客户节奏倾听，不重复建议和服务菜单。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '今天在公司受了一肚子气。' },
      { role: 'ASSISTANT', content: '你可以先找领导沟通，再列一个问题清单。' },
    ],
    validate: (result) => [
      expectEqual('修复义务', result.understanding.humanContext.dialogueObligation.repairObligation, true),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal?.key, 'REPAIR_TRUST'),
      expectIncludes('禁止重复建议', result.understanding.humanContext.dialogueObligation.forbiddenRepeatedMoves, 'ADVISE'),
      expectNotMatch('禁止继续建议', result.generation.draft || '', /你应该|你可以|建议你|不妨|第一步/),
      expectNotMatch('禁止继续追问', result.generation.draft || '', /[？?]|为什么|怎么了|发生了什么/),
    ],
  },
  {
    key: 'repair-no-more-questions', name: '多轮纠偏·拒绝继续追问', message: '别再问了，让我安静一会儿。',
    expectation: '识别被拒绝动作 ASK_QUESTION；修复后停止追问并尊重空间。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '我现在脑子很乱。' },
      { role: 'ASSISTANT', content: '为什么会这样？你愿意说说发生了什么吗？' },
    ],
    validate: (result) => [
      expectEqual('修复义务', result.understanding.humanContext.dialogueObligation.repairObligation, true),
      expectIncludes('禁止重复追问', result.understanding.humanContext.dialogueObligation.forbiddenRepeatedMoves, 'ASK_QUESTION'),
      expectNotEqual('识别路径不得为快速路径', result.understanding.recognitionModel.status, 'FAST_PATH'),
      expectNotMatch('回复不得追问', result.generation.draft || '', /[？?]|为什么|能说说|愿意说说/),
    ],
  },
  {
    key: 'positive-sharing', name: '多轮积极情绪分享', message: '就是莫名开心，也不知道为什么。',
    expectation: '稳定意图不漂移；必须锚定“莫名开心”继续回应；禁止泛化为“随便聊点什么”或另起话题。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '今天心情不错，随便聊聊？' },
      { role: 'ASSISTANT', content: '那挺好，今天准备怎么安排？' },
    ],
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['CASUAL_CHAT']),
      expectIncludes('语义检查', result.contract.strategyPolicy.resolved.wording.semanticChecks, 'NO_PSYCHOLOGICAL_INTERPRETATION'),
      expectIncludes('语义检查', result.contract.strategyPolicy.resolved.wording.semanticChecks, 'NO_LITERARY_PADDING'),
      expectEqual('第一动作', result.understanding.humanContext.interactionStrategy.firstMove, 'RESPOND_TO_SHARED_CONTEXT'),
      expectEqual('识别路径', result.understanding.recognitionModel.status, 'FAST_PATH'),
      expectMatch('上下文承接', result.generation.draft || '', /开心|心情好|好心情|轻快|松快|笑|顺眼/i),
      expectNotMatch('禁止泛化转场', result.generation.draft || '', /随便聊点(?:轻松的|别的)|你(?:这会儿)?最想聊什么|有什么想聊的/i),
      expectNotMatch('禁止情绪定义', result.generation.draft || '', /才是.{0,8}(?:最舒服|最轻松|最真实)|不用.{0,8}(?:理由|原因)/i),
    ],
  },
  {
    key: 'closed-emotion-cause', name: '多轮闲聊·已回答原因不再追问', message: '对对对，就是你说的这种，做啥都顺的感觉',
    expectation: '保持闲聊确认延续快速路径；“没有具体原因”已关闭原因问题；不得换词继续追问哪件事、什么原因。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '今天心情不错，随便聊聊？' },
      { role: 'ASSISTANT', content: '是碰上什么顺心事了吗？' },
      { role: 'CUSTOMER', content: '没有具体原因，就是莫名开心。' },
      { role: 'ASSISTANT', content: '你现在是不是做什么都觉得挺顺的？' },
    ],
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'CASUAL_CHAT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'CASUAL'),
      expectEqual('识别路径', result.understanding.recognitionModel.status, 'FAST_PATH'),
      expectMatch('已关闭语义问题', JSON.stringify(result.understanding.humanContext.conversationTaskState.semanticQuestions || []), /EMOTION_CAUSE.*CLOSED/),
      expectNotMatch('禁止重复追问原因', result.generation.draft || '', /为什么|什么原因|哪件事|什么事|发生了什么|怎么会|什么让你|是.{0,8}让你/i),
    ],
  },
  {
    key: 'latent-commercial', name: '闲聊自然出现真实场景', message: '周末准备和朋友出去玩，最近想换换风格，但还没想好。',
    expectation: '从场景探索进入需求探索或价值连接；先了解场景和偏好，不直接逼单。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '今天心情不错，随便聊聊？' },
      { role: 'ASSISTANT', content: '那挺好，最近有什么期待的安排？' },
    ],
    validate: (result) => [
      expectOneOf('经营阶段', result.understanding.humanContext.commercialStrategy.stage, ['NEED_EXPLORATION', 'VALUE_BRIDGING']),
      expectOneOf('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy || result.understanding.humanContext.commercialStrategy.productMentionPolicy, ['CATEGORY_ONLY', 'SPECIFIC_IF_RELEVANT']),
    ],
  },
  {
    key: 'product-consult', name: '明确商品咨询', message: '我想买一件周末聚会穿的裙子，温柔一点但不要太正式。',
    expectation: '识别商品咨询和明确需求；允许专业需求确认，不再停留在纯闲聊。',
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['PRODUCT_CONSULT', 'PURCHASE_DECISION']),
      expectOneOf('商业开放度', result.understanding.humanContext.commercialOpenness, ['ACTIVE', 'EXPLICIT']),
    ],
  },
  {
    key: 'damaged-product', name: '收到商品破损', message: '衣服刚收到就开线了，你们先给我处理。',
    expectation: '切换售后严肃姿态；俏皮度为 0；禁用表情和商品推进；先解决问题。',
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['AFTER_SALE', 'COMPLAINT_ESCALATION']),
      expectEqual('俏皮度', result.contract.strategyPolicy.resolved.tone.playfulness, 0),
      expectEqual('表情策略', result.contract.strategyPolicy.resolved.wording.emojiPolicy, 'FORBIDDEN'),
      expectEqual('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy, 'PROHIBITED'),
    ],
  },
  {
    key: 'logistics-first-pending-slot', name: '物流·首轮待补责任', message: '物流怎么一直没更新',
    expectation: '生成前形成订单号待补字段；状态等待客户；当前责任为客户；回复只索取一个必要字段。',
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'LOGISTICS_DELAY'),
      expectEqual('任务状态', result.understanding.humanContext.conversationTaskState.status, 'WAITING_FOR_CUSTOMER'),
      expectEqual('当前责任', result.understanding.humanContext.conversationTaskState.responsibility, 'CUSTOMER'),
      expectMatch('待补订单号', JSON.stringify(result.understanding.humanContext.conversationTaskState.pendingSlots || []), /ORDER_ID/),
      expectAtMost('问题上限', result.contract.strategyPolicy.resolved.structure.maxQuestions, 1),
    ],
  },
  {
    key: 'logistics-delay', name: '物流停滞与退款倾向', message: '物流四天没更新了，再不到我就退了。',
    expectation: '物流事件与潜在退款分层；先处理物流；不俏皮、不销售、不直接主动退款。',
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['LOGISTICS_DELAY', 'AFTER_SALE']),
      expectEqual('俏皮度', result.contract.strategyPolicy.resolved.tone.playfulness, 0),
      expectEqual('销售显露度', result.contract.strategyPolicy.resolved.service.salesVisibility, 'S0'),
    ],
  },
  {
    key: 'logistics-continuation-grounding', name: '物流·连续轮真实推进', message: '你帮我查查吧',
    expectation: '保持物流意图；回复必须回应本轮查询请求并推进一步；不得完整重复上一轮阿梨回复。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '物流怎么一直没更新' },
      { role: 'ASSISTANT', content: '物流一直没有更新确实让人不放心。先把具体订单定位清楚，再继续核实物流状态。' },
    ],
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'LOGISTICS_DELAY'),
      expectEqual('主意图', result.understanding.primaryIntent, 'REQUEST_ACTION'),
      expectNotMatch('禁止重复上一轮', result.generation.draft || '', /^物流一直没有更新确实让人不放心。先把具体订单定位清楚，再继续核实物流状态。$/),
      expectMatch('当前轮推进', result.generation.draft || '', /订单号|订单|包裹|定位|核实|查询/i),
    ],
  },
  {
    key: 'logistics-information-barrier', name: '物流·客户无法提供订单号', message: '订单号你可以看到的，我不知道是啥，你直接看订单吧',
    expectation: '识别资料障碍而非已提供信息；承接客户操作负担；不得机械重复索取订单号。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '物流怎么一直没更新' },
      { role: 'ASSISTANT', content: '好，我来查。先告诉我订单号，我用订单号去定位具体物流状态。' },
    ],
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectEqual('当前轮关系', result.understanding.humanContext.conversationTaskState.currentTurnRelation, 'INFORMATION_BARRIER'),
      expectEqual('请求回应类型', result.understanding.humanContext.conversationTaskState.requestResponseType, 'ALTERNATIVE_REQUEST'),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal.key, 'HANDLE_INFORMATION_BARRIER'),
      expectEqual('第一动作', result.understanding.humanContext.interactionStrategy.firstMove, 'HANDLE_INFORMATION_BARRIER'),
      expectOneOf('情绪', result.understanding.emotion, ['FRUSTRATED', 'DISAPPOINTED']),
      expectEqual('任务状态', result.understanding.humanContext.conversationTaskState.status, 'INTERNAL_PROCESSING'),
      expectEqual('当前责任', result.understanding.humanContext.conversationTaskState.responsibility, 'INTERNAL'),
      expectEqual('内部处理标记', result.understanding.humanContext.conversationTaskState.internalHandling.required, true),
      expectNotMatch('最终回复', result.generation.draft || '', /(?:提供|发|给).{0,8}(?:订单号|订单编号)/i),
    ],
  },
  {
    key: 'reject-recommendation', name: '客户明确拒绝推荐', message: '今天就是想聊聊天，先别给我推荐产品。',
    expectation: '商业开放度关闭；停止经营探索；不提商品，尊重客户选择。',
    validate: (result) => [
      expectEqual('商业开放度', result.understanding.humanContext.commercialOpenness, 'CLOSED'),
      expectEqual('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy, 'PROHIBITED'),
    ],
  },
  {
    key: 'restaurant-missing-item', name: '餐饮·漏餐不满', message: '外卖少了一份主食，你们让我再拍一遍，我都已经拍过了。',
    expectation: '识别售后与重复举证不满；先承接负担感；不得重复索取同一凭证；不销售。',
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['AFTER_SALE', 'COMPLAINT_ESCALATION']),
      expectEqual('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy, 'PROHIBITED'),
    ],
  },
  {
    key: 'beauty-reschedule', name: '美业·临时改约', message: '我今天临时加班，预约能不能改到周末？',
    expectation: '识别 APPOINTMENT / REQUEST_ACTION；语气自然；只补问一个必要信息；未核验前不确认改期结果。',
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'APPOINTMENT'),
      expectEqual('主意图', result.understanding.primaryIntent, 'REQUEST_ACTION'),
      expectEqual('任务状态', result.understanding.humanContext.conversationTaskState.status, 'WAITING_FOR_CUSTOMER'),
      expectEqual('当前责任', result.understanding.humanContext.conversationTaskState.responsibility, 'CUSTOMER'),
      expectMatch('待补原预约时间', JSON.stringify(result.understanding.humanContext.conversationTaskState.pendingSlots || []), /ORIGINAL_APPOINTMENT_TIME/),
      expectAtMost('问题上限', result.contract.strategyPolicy.resolved.structure.maxQuestions, 1),
      expectNotMatch('未配置执行结果', result.generation.draft || '', /可以改的|改期没问题|改到周末没问题|一定可以改|周末有空位|可以直接安排/i),
    ],
  },
  {
    key: 'education-missed-class', name: '教育·请假补课', message: '孩子发烧今天上不了课，这节后面怎么补？',
    expectation: '识别请假背景与补课咨询；先回应实际处境，再说明流程方向；不做医疗判断。',
    validate: (result) => [
      expectOneOf('主意图', result.understanding.primaryIntent, ['ASK_INFORMATION', 'REQUEST_ACTION']),
      expectAtMost('问题上限', result.contract.strategyPolicy.resolved.structure.maxQuestions, 1),
    ],
  },
  {
    key: 'saas-billing-question', name: 'SaaS·账单异常', message: '这个月怎么多扣了一笔，我只想先知道原因。',
    expectation: '识别账单问题和信息诉求；先解释核实方向；不得强推套餐或声称已退款。',
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectOneOf('主意图', result.understanding.primaryIntent, ['ASK_INFORMATION', 'REQUEST_ACTION', 'PROBLEM_RESOLUTION']),
      expectEqual('销售显露度', result.contract.strategyPolicy.resolved.service.salesVisibility, 'S0'),
    ],
  },
  {
    key: 'repair-time-pressure', name: '维修·上门时间压力', message: '冰箱还在漏水，今天必须有人给我一个明确说法。',
    expectation: '识别故障、时间压力和信任修复；不得在没有动作凭证时承诺具体上门时间。',
    customerState: { unresolvedService: true },
    validate: (result) => [
      expectEqual('主场景', result.understanding.primaryScenario, 'COMPLAINT_ESCALATION'),
      expectOneOf('情绪', result.understanding.emotion, ['ANXIOUS', 'FRUSTRATED', 'ANGRY']),
      expectEqual('主导目标', result.understanding.humanContext.dominantTurnGoal.key, 'REPAIR_TRUST'),
      expectEqual('第一动作', result.understanding.humanContext.interactionStrategy.firstMove, 'REPAIR_RELATIONSHIP'),
      expectEqual('生成来源', result.generation.source, 'HUMAN_REVIEW_ACK'),
      expectEqual('生成状态', result.generation.status, 'HUMAN_REVIEW_REQUIRED'),
      expectEqual('内部处理标记', result.understanding.humanContext.conversationTaskState.internalHandling.required, true),
      expectNotMatch('客户侧隐藏内部路由', result.generation.draft || '', /转人工|人工接手|人工审核|找专员|真人客服|只能人工/i),
    ],
  },
  {
    key: 'topic-shift-after-complaint', name: '投诉后明确切换预约话题', message: '我今天临时加班，预约能不能改到周末？',
    expectation: '本轮明确预约请求成为当前主任务；旧漏水投诉保留后台处理，不得继续回复投诉或暴露人工路由。',
    conversationHistory: [
      { role: 'CUSTOMER', content: '冰箱还在漏水，今天必须有人给我一个明确说法' },
      { role: 'ASSISTANT', content: '冰箱还在漏水，这次不再让你重复说明。我把情况记下，接下来继续推进。' },
    ],
    customerState: { unresolvedService: true, complaintActive: true },
    validate: (result) => [
      expectEqual('当前主场景', result.understanding.primaryScenario, 'APPOINTMENT'),
      expectEqual('当前主意图', result.understanding.primaryIntent, 'REQUEST_ACTION'),
      expectEqual('当前轮关系', result.understanding.humanContext.conversationTaskState.currentTurnRelation, 'TOPIC_SHIFT'),
      expectEqual('当前任务', result.understanding.humanContext.conversationTaskState.activeScenario, 'APPOINTMENT'),
      expectMatch('回复预约新话题', result.generation.draft || '', /预约|改期|周末|时间|预约编号/i),
      expectNotMatch('不得继续旧投诉', result.generation.draft || '', /漏水|明确说法|投诉/i),
      expectNotMatch('客户侧隐藏内部路由', result.generation.draft || '', /转人工|人工接手|人工审核|找专员|真人客服/i),
    ],
  },
  {
    key: 'fresh-conversation', name: '新对话上下文隔离', message: '我想问一下退款要怎么处理。',
    expectation: '无历史闲聊上下文时直接识别退款/售后，不受其他测试对话影响。',
    conversationHistory: [],
    validate: (result) => [
      expectOneOf('主场景', result.understanding.primaryScenario, ['REFUND_REQUEST', 'AFTER_SALE']),
      expectEqual('商品权限', result.contract.strategyPolicy.resolved.service.productMentionPolicy, 'PROHIBITED'),
    ],
  },
];

selectedKeys.value = cases.map((item) => item.key);
const canRun = computed(() => props.canExecute && Boolean(props.merchantRoleId) && selectedKeys.value.length > 0 && !running.value);
const resultMap = computed(() => Object.fromEntries(results.value.map((item) => [item.key, item])) as Record<string, RegressionResult>);
const allSelected = computed(() => selectedKeys.value.length === cases.length);
const partSelected = computed(() => selectedKeys.value.length > 0 && selectedKeys.value.length < cases.length);
const passCount = computed(() => results.value.filter((item) => item.status === 'PASS').length);
const limitedCount = computed(() => results.value.filter((item) => item.status === 'LIMITED').length);
const failCount = computed(() => results.value.filter((item) => item.status === 'FAIL').length);

function toggleAll(checked: boolean) { selectedKeys.value = checked ? cases.map((item) => item.key) : []; }
function toggleCase(key: string, checked: boolean) { selectedKeys.value = checked ? [...new Set([...selectedKeys.value, key])] : selectedKeys.value.filter((item) => item !== key); }

async function runSelected() {
  if (!canRun.value) return;
  running.value = true;
  const next: RegressionResult[] = [];
  try {
    for (const item of cases.filter((entry) => selectedKeys.value.includes(entry.key))) {
      try {
        const raw = await executeCustomerServiceSimulation({
          merchantRoleId: props.merchantRoleId,
          industryNodeId: props.industryNodeId || undefined,
          message: item.message,
          conversationHistory: item.conversationHistory || [],
          customerState: item.customerState || {},
          strategyVersionIds: props.strategyVersionIds,
          variables: {}, facts: [], generateReply: true, allowRewrite: true,
        });
        const checks = item.validate(raw);
        const failedChecks = checks.filter((check) => check.startsWith('失败：'));
        const failedIssues = raw.quality.issues.filter((issue) => !issue.passed && ['BLOCKER', 'ERROR'].includes(issue.severity)).map((issue) => issue.key);
        const modelLimited = ['MODEL_NOT_CONFIGURED', 'MODEL_ERROR', 'GENERATION_EMPTY', 'GENERATION_TRUNCATED', 'GENERATION_TIMEOUT', 'INVALID_RESPONSE', 'GENERATION_FAILED_NOTICE'].includes(raw.generation.status);
        const status: RegressionStatus = failedChecks.length || raw.quality.status === 'FAIL' ? 'FAIL' : modelLimited ? 'LIMITED' : 'PASS';
        next.push({
          key: item.key, name: item.name, status,
          summary: failedChecks[0] || (modelLimited ? '模型环境受限，策略与识别仍已完成' : '识别、策略和质量检查符合预期'),
          actualScenario: raw.understanding.primaryScenario, actualIntent: raw.understanding.primaryIntent,
          commercialStage: raw.understanding.humanContext.commercialStrategy.stage,
          playfulness: raw.contract.strategyPolicy.resolved.tone.playfulness,
          tildePolicy: raw.contract.strategyPolicy.resolved.wording.tildePolicy,
          emojiPolicy: raw.contract.strategyPolicy.resolved.wording.emojiPolicy,
          productMentionPolicy: raw.contract.strategyPolicy.resolved.service.productMentionPolicy || '未设置',
          qualityStatus: raw.quality.status, generationStatus: raw.generation.status, draft: raw.generation.draft,
          checks, failedIssues, error: raw.generation.errorMessage, raw,
        });
      } catch (error) {
        next.push({
          key: item.key, name: item.name, status: 'FAIL', summary: '接口执行失败', actualScenario: '-', actualIntent: '-', commercialStage: '-',
          playfulness: null, tildePolicy: '-', emojiPolicy: '-', productMentionPolicy: '-', qualityStatus: '-', generationStatus: '-', draft: null,
          checks: [], failedIssues: [], error: error instanceof Error ? error.message : String(error),
        });
      }
      results.value = [...next];
    }
    ElMessage.success(`回归测试完成：通过 ${passCount.value}，受限 ${limitedCount.value}，失败 ${failCount.value}`);
    if (props.strategyVersionIds.length === 1) {
      emit('completed', {
        status: failCount.value === 0 && limitedCount.value === 0 ? 'PASSED' : 'FAILED',
        strategyVersionId: props.strategyVersionIds[0],
        totalCases: results.value.length,
        passedCases: passCount.value,
        limitedCases: limitedCount.value,
        failedCases: failCount.value,
        failedCaseKeys: results.value.filter((item) => item.status === 'FAIL').map((item) => item.key),
        details: {
          executedAt: new Date().toISOString(),
          caseKeys: results.value.map((item) => item.key),
          generationSources: results.value.map((item) => item.raw?.generation.replySource || null),
        },
      });
    }
  } finally { running.value = false; }
}

function expectEqual(name: string, actual: unknown, expected: unknown) { return Object.is(actual, expected) ? `通过：${name}=${String(actual)}` : `失败：${name} 期望 ${String(expected)}，实际 ${String(actual)}`; }
function expectNotEqual(name: string, actual: unknown, forbidden: unknown) { return !Object.is(actual, forbidden) ? `通过：${name}=${String(actual)}` : `失败：${name} 不得为 ${String(forbidden)}`; }
function expectOneOf(name: string, actual: unknown, expected: unknown[]) { return expected.includes(actual) ? `通过：${name}=${String(actual)}` : `失败：${name} 期望 ${expected.join('/')}，实际 ${String(actual)}`; }
function expectAtMost(name: string, actual: number | null, expected: number) { return actual !== null && actual <= expected ? `通过：${name}=${actual}` : `失败：${name} 期望不超过 ${expected}，实际 ${String(actual)}`; }
function expectIncludes(name: string, actual: string[], expected: string) { return actual.includes(expected) ? `通过：${name}包含 ${expected}` : `失败：${name}缺少 ${expected}`; }
function expectMatch(name: string, actual: string, pattern: RegExp) { return pattern.test(actual) ? `通过：${name}命中 ${pattern.source}` : `失败：${name}未命中 ${pattern.source}`; }
function expectNotMatch(name: string, actual: string, pattern: RegExp) { return pattern.test(actual) ? `失败：${name}命中禁止模式 ${pattern.source}` : `通过：${name}未命中禁止模式`; }
function resultLabel(status: RegressionStatus) { return ({ PASS: '通过', LIMITED: '环境受限', FAIL: '失败' } as const)[status]; }
function resultTag(status: RegressionStatus) { return status === 'PASS' ? 'success' : status === 'LIMITED' ? 'warning' : 'danger'; }
function valueLabel(value: number | null) { return value === null ? '未设置' : String(value); }
function exportResults() {
  const payload = JSON.stringify({ exportVersion: 'customer-service-v5.14-regression', exportedAt: new Date().toISOString(), roleId: props.merchantRoleId, industryNodeId: props.industryNodeId || null, results: results.value }, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `customer-service-v5.14-regression-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  ElMessage.success('回归测试 JSON 已导出');
}
</script>
