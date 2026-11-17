<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增回复规则' : '编辑回复规则'" width="min(1080px, 96vw)" destroy-on-close>
    <el-alert
      title="先选择这组规则什么时候使用，再设置回复方式。保存草稿不会影响当前回复；只有发布版本才可能生效。"
      type="info" :closable="false" show-icon class="mb-4"
    />
    <div v-if="mode === 'create'" class="sample-fill-bar">
      <div><strong>第一次配置可以先用样例</strong><span>回填一套“自然简短、不用客服套话”的完整规则，便于逐页查看字段作用。不会自动保存或发布。</span></div>
      <SampleFillButton label="填入自然回复样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="1. 使用范围" name="base">
          <div class="grid gap-4 md:grid-cols-2">
            <el-form-item prop="name">
              <template #label><span class="field-label">规则名称 <HelpTip title="规则名称" content="写一个让运营人员能看懂用途的名称，不要使用技术缩写。" example="所有对话保持自然简短" /></span></template>
              <el-input v-model="form.name" placeholder="例如：所有对话保持自然简短" />
            </el-form-item>
            <el-form-item prop="scopeType">
              <template #label><span class="field-label">什么时候使用 <HelpTip title="什么时候使用" content="“所有对话”会作为阿梨默认规则；“匹配场景”只在识别到指定场景时加载；“指定客户意图”不会自动加载，必须到客户意图与流程中选择。" /></span></template>
              <el-select v-model="form.scopeType" class="w-full">
                <el-option label="所有阿梨对话默认使用" value="ROLE_GLOBAL" />
                <el-option label="识别到指定场景时使用" value="SCENARIO" />
                <el-option label="由具体客户意图选择使用" value="INTENT" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="form.scopeType === 'SCENARIO'" class="md:col-span-2">
              <template #label><span class="field-label">适用场景 <HelpTip title="适用场景" content="只有系统识别出的当前场景包含这里选择的值时，这组规则才会加载。留空表示所有场景，通常不建议留空。" /></span></template>
              <el-select v-model="form.scenarios" multiple allow-create filterable class="w-full" placeholder="输入场景编码后按回车，例如 CASUAL_CHAT" />
            </el-form-item>
          </div>
          <el-form-item label="用途说明"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="说明这组规则解决什么问题，方便其他人理解" /></el-form-item>
          <div class="scope-result">
            <strong>{{ scopeResultTitle }}</strong>
            <p>{{ scopeResultDescription }}</p>
          </div>
          <el-collapse class="mt-4">
            <el-collapse-item name="advanced">
              <template #title><span>高级匹配条件（普通使用者不用修改）</span></template>
              <el-alert title="这里用于限制角色、行业或风险等级。普通情况下保持默认即可；错误填写可能导致规则无法加载。" type="warning" :closable="false" show-icon class="mb-4" />
              <div class="grid gap-4 md:grid-cols-2">
                <el-form-item label="系统编码" prop="key"><el-input v-model="form.key" :disabled="mode === 'edit'" placeholder="例如 ali-common-natural-steady" /></el-form-item>
                <el-form-item label="覆盖顺序"><el-input-number v-model="form.priority" :min="0" :max="10000" class="!w-full" /><div class="form-help">数值越大越晚应用，可覆盖前面的软规则。</div></el-form-item>
                <el-form-item label="适用角色"><el-select v-model="form.roleCodes" multiple allow-create filterable class="w-full" placeholder="默认 ali；留空表示全部角色" /></el-form-item>
                <el-form-item label="适用行业"><el-select v-model="form.industryCodes" multiple allow-create filterable class="w-full" placeholder="留空表示全部行业" /></el-form-item>
                <el-form-item label="适用风险等级"><el-select v-model="form.riskLevels" multiple class="w-full"><el-option label="低风险" value="LOW" /><el-option label="中风险" value="MEDIUM" /><el-option label="高风险" value="HIGH" /><el-option label="严重风险" value="CRITICAL" /></el-select></el-form-item>
                <el-form-item v-if="form.scopeType !== 'SCENARIO'" label="场景编码"><el-select v-model="form.scenarios" multiple allow-create filterable class="w-full" placeholder="留空表示不限制" /></el-form-item>
                <el-form-item label="意图定义编码"><el-select v-model="form.intentKeys" multiple allow-create filterable class="w-full" placeholder="通常留空" /></el-form-item>
                <el-form-item label="主要意图编码"><el-select v-model="form.intents" multiple allow-create filterable class="w-full" placeholder="通常留空" /></el-form-item>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>

        <el-tab-pane label="2. 语气与措辞" name="wording">
          <el-alert title="数值越高，特征越明显；留空表示沿用前一层规则。建议一次只调整少量项目，再到回复调优对比效果。" type="info" :closable="false" show-icon class="mb-4" />
          <div class="grid gap-4 md:grid-cols-5">
            <el-form-item label="亲和程度"><el-input-number v-model="form.warmth" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
            <el-form-item label="活泼程度"><el-input-number v-model="form.playfulness" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
            <el-form-item label="正式程度"><el-input-number v-model="form.formality" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
            <el-form-item label="直接程度"><el-input-number v-model="form.directness" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
            <el-form-item label="情绪表现强度"><el-input-number v-model="form.emotionalIntensity" :min="0" :max="100" clearable class="!w-full" /></el-form-item>
          </div>
          <div class="grid gap-4 md:grid-cols-4">
            <el-form-item label="波浪号"><el-select v-model="form.tildePolicy" clearable class="w-full"><el-option label="禁止" value="FORBIDDEN" /><el-option label="仅跟随客户" value="FOLLOW_CUSTOMER" /><el-option label="允许" value="ALLOWED" /></el-select></el-form-item>
            <el-form-item label="表情策略"><el-select v-model="form.emojiPolicy" clearable class="w-full"><el-option label="禁止" value="FORBIDDEN" /><el-option label="限制使用" value="LIMITED" /><el-option label="仅跟随客户" value="FOLLOW_CUSTOMER" /><el-option label="自动" value="AUTO" /></el-select></el-form-item>
            <el-form-item label="表情上限"><el-input-number v-model="form.emojiLimit" :min="0" :max="10" clearable class="!w-full" /></el-form-item>
            <el-form-item label="语气词频率"><el-select v-model="form.sentenceParticleFrequency" clearable class="w-full"><el-option label="不用" value="NONE" /><el-option label="低频" value="LOW" /><el-option label="中等" value="MEDIUM" /></el-select></el-form-item>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            <el-form-item label="禁止措辞（每行一条）"><el-input v-model="form.forbiddenExpressionsText" type="textarea" :rows="7" placeholder="亲亲&#10;心情好就该玩点乐子" /></el-form-item>
            <el-form-item label="谨慎措辞（每行一条）"><el-input v-model="form.cautiousExpressionsText" type="textarea" :rows="7" placeholder="可太&#10;就该&#10;嘛" /></el-form-item>
            <el-form-item label="推荐表达方向（每行一条）"><el-input v-model="form.preferredExpressionsText" type="textarea" :rows="5" /></el-form-item>
            <el-form-item label="禁止语气词（每行一条）"><el-input v-model="form.forbiddenSentenceParticlesText" type="textarea" :rows="5" placeholder="嘛&#10;啦" /></el-form-item>
          </div>
          <el-form-item>
            <template #label><span class="field-label">自动检查不自然表达 <HelpTip title="自动检查" content="勾选后，生成结果会经过对应质量检查；命中问题时系统会尝试重写。安全硬规则始终生效，不受这里控制。" /></span></template>
            <el-checkbox-group v-model="form.semanticChecks">
              <el-checkbox label="NO_PRESCRIPTIVE_CUSTOMER_DIRECTION">不替客户规定应该做什么</el-checkbox>
              <el-checkbox label="NO_OVERPLAYFUL_STACKING">避免轻浮元素叠加</el-checkbox>
              <el-checkbox label="NO_PSYCHOLOGICAL_INTERPRETATION">禁止无依据心理解释</el-checkbox>
              <el-checkbox label="NO_LITERARY_PADDING">禁止无来源文学包装</el-checkbox>
              <el-checkbox label="NO_RECEPTION_CLICHE">禁止客服接待套话</el-checkbox>
              <el-checkbox label="NO_SPECTATOR_ANALYSIS">禁止旁观式分析客户语气</el-checkbox>
              <el-checkbox label="NO_MARKETING_COPY_TONE">禁止宣传文案式情绪包装</el-checkbox>
              <el-checkbox label="NO_DIDACTIC_EXPLANATION">禁止解释、说教和情绪升华</el-checkbox>
              <el-checkbox label="REQUIRE_CONVERSATION_VALUE">分享阶段必须提供真实对话价值</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-tab-pane>

        <el-tab-pane label="3. 回复结构" name="structure">
          <el-alert title="控制一条回复有多长、最多做几件事，以及是否连续追问。留空表示沿用默认设置。" type="info" :closable="false" show-icon class="mb-4" />
          <div class="grid gap-4 md:grid-cols-4">
            <el-form-item label="最多问题数"><el-input-number v-model="form.maxQuestions" :min="0" :max="10" clearable class="!w-full" /></el-form-item>
            <el-form-item label="最多核心动作"><el-input-number v-model="form.maxCoreMoves" :min="1" :max="3" clearable class="!w-full" /></el-form-item>
            <el-form-item label="最多猜测数"><el-input-number v-model="form.maxGuesses" :min="0" :max="5" clearable class="!w-full" /></el-form-item>
            <el-form-item label="最多句数"><el-input-number v-model="form.maxSentences" :min="1" :max="20" clearable class="!w-full" /></el-form-item>
          </div>
          <el-form-item label="结构开关">
            <div class="grid w-full gap-4 md:grid-cols-2">
              <el-select v-model="form.allowChoiceQuestions" clearable placeholder="未设置（继承前层）">
                <el-option label="允许选择题式提问" :value="true" />
                <el-option label="禁止选择题式提问" :value="false" />
              </el-select>
              <el-select v-model="form.requireAcknowledgeBeforeQuestion" clearable placeholder="未设置（继承前层）">
                <el-option label="要求提问前先承接" :value="true" />
                <el-option label="不额外要求承接顺序" :value="false" />
              </el-select>
            </div>
          </el-form-item>
        </el-tab-pane>

        <el-tab-pane label="4. 服务与销售" name="service">
          <el-alert title="这里控制阿梨什么时候可以提商品，不代表强制销售。系统仍会根据客户需求和当前关系阶段判断。" type="info" :closable="false" show-icon class="mb-4" />
          <div class="grid gap-4 md:grid-cols-3">
            <el-form-item label="销售主动程度"><el-select v-model="form.salesVisibility" clearable class="w-full"><el-option label="S0 · 不主动销售" value="S0" /><el-option label="S1 · 有明确需求才轻度提及" value="S1" /><el-option label="S2 · 机会合适时主动建议" value="S2" /><el-option label="S3 · 明确以成交推进为主" value="S3" /></el-select></el-form-item>
            <el-form-item label="商品提及权限"><el-select v-model="form.productMentionPolicy" clearable class="w-full"><el-option label="禁止提商品" value="PROHIBITED" /><el-option label="只允许品类方向" value="CATEGORY_ONLY" /><el-option label="相关时可提具体商品" value="SPECIFIC_IF_RELEVANT" /><el-option label="允许具体商品" value="SPECIFIC_ALLOWED" /></el-select></el-form-item>
            <el-form-item><template #label><span class="field-label">第一步先做什么 <HelpTip title="第一步动作" content="用于要求阿梨优先完成一个动作，例如先回应客户情绪，再提问。普通情况可留空。" /></span></template><el-input v-model="form.firstMove" placeholder="可留空，例如 ACKNOWLEDGE_FIRST" /></el-form-item>
          </div>
          <el-form-item label="停止条件（每行一条）"><el-input v-model="form.stopConditionsText" type="textarea" :rows="6" /></el-form-item>
        </el-tab-pane>

        <el-tab-pane label="5. 发送方式" name="delivery">
          <el-alert title="先生成并质检完整回复，再按自然语义拆成少量独立消息。客户在段间回复时，未发送的后续段会取消。" type="info" :closable="false" show-icon class="mb-4" />
          <div class="grid gap-4 md:grid-cols-3">
            <el-form-item label="投递方式"><el-select v-model="form.deliveryMode" clearable class="w-full"><el-option label="自动判断" value="AUTO" /><el-option label="始终单条" value="SINGLE" /><el-option label="允许顺序分段" value="SEQUENTIAL" /></el-select></el-form-item>
            <el-form-item label="最多消息段数"><el-input-number v-model="form.maxSegments" :min="1" :max="6" clearable class="!w-full" /></el-form-item>
            <el-form-item label="超过多少字尝试拆分"><el-input-number v-model="form.splitThresholdChars" :min="20" :max="500" clearable class="!w-full" /></el-form-item>
            <el-form-item label="最小段间延迟（毫秒）"><el-input-number v-model="form.minDelayMs" :min="0" :max="10000" :step="100" clearable class="!w-full" /></el-form-item>
            <el-form-item label="最大段间延迟（毫秒）"><el-input-number v-model="form.maxDelayMs" :min="0" :max="10000" :step="100" clearable class="!w-full" /></el-form-item>
            <el-form-item label="客户插话时取消后续段"><el-select v-model="form.cancelRemainingOnCustomerMessage" clearable class="w-full"><el-option label="取消" :value="true" /><el-option label="继续发送" :value="false" /></el-select></el-form-item>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button :loading="submitting" @click="submit(false)">仅保存草稿</el-button>
      <el-button v-if="canPublish" type="primary" :loading="submitting" @click="submit(true)">保存并立即发布</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import HelpTip from '@/components/common/HelpTip.vue';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type { CustomerServiceAsset } from '@/modules/customer-service/types/assets.types';
import type { CustomerServiceStrategyGroupContent, CustomerServiceStrategyScopeType } from '@/modules/customer-service/types/strategy-policy.types';

const props = defineProps<{ modelValue: boolean; mode: 'create' | 'edit'; asset?: CustomerServiceAsset | null; content?: CustomerServiceStrategyGroupContent | null; submitting?: boolean; canPublish?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [value: { key: string; name: string; description: string; content: CustomerServiceStrategyGroupContent; publish: boolean }] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const activeTab = ref('base');
const form = reactive(defaultForm());
const hasUserContent = computed(() => Boolean(
  form.name.trim() || form.description.trim() || form.forbiddenExpressionsText.trim()
  || form.preferredExpressionsText.trim() || form.semanticChecks.length || form.warmth !== null,
));
const scopeResultTitle = computed(() => ({
  ROLE_GLOBAL: '发布后：所有符合条件的阿梨对话自动使用',
  SCENARIO: '发布后：识别到指定场景时自动使用',
  INTENT: '发布后：仍需到“客户意图与流程”中选择',
}[form.scopeType]));
const scopeResultDescription = computed(() => ({
  ROLE_GLOBAL: '这不是“加载所有策略”，只加载当前这组已发布且适用于阿梨的规则。',
  SCENARIO: '没有命中所填场景时不会加载，不会影响其他对话。',
  INTENT: '仅发布不会自动生效；绑定到一个或多个客户意图后才会使用。',
}[form.scopeType]));
const rules: FormRules = {
  key: [{ required: true, message: '请输入配置组编码', trigger: 'blur' }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '编码格式不正确', trigger: 'blur' }],
  name: [{ required: true, message: '请输入配置组名称', trigger: 'blur' }],
  scopeType: [{ required: true, message: '请选择作用层级', trigger: 'change' }],
};

watch(() => [props.modelValue, props.asset, props.content] as const, ([open]) => {
  if (!open) return;
  activeTab.value = 'base';
  Object.assign(form, defaultForm(), fromContent(props.asset ?? null, props.content ?? null));
}, { immediate: true });

watch(() => form.scopeType, (value) => {
  form.enabledByDefault = value !== 'INTENT';
});

function fillSample() {
  Object.assign(form, {
    name: '所有对话保持自然简短',
    description: '参考样例：优先回应客户当前表达，减少客服套话、连续追问和过度销售。',
    scopeType: 'ROLE_GLOBAL', enabledByDefault: true, priority: 100, roleCodes: ['ali'],
    scenarios: [], intentKeys: [], intents: [], industryCodes: [], riskLevels: [],
    warmth: 65, playfulness: 15, formality: 25, directness: 70, emotionalIntensity: 30,
    tildePolicy: 'FORBIDDEN', emojiPolicy: 'LIMITED', emojiLimit: 1, sentenceParticleFrequency: 'LOW',
    forbiddenExpressionsText: '亲亲\n这边呢\n您好，很高兴为您服务',
    cautiousExpressionsText: '建议您\n您可以',
    preferredExpressionsText: '先直接回应客户当前问题\n不重复客户已经说过的内容\n没有明确需求时不主动推销',
    forbiddenSentenceParticlesText: '嘛',
    semanticChecks: ['NO_RECEPTION_CLICHE', 'NO_MARKETING_COPY_TONE', 'NO_DIDACTIC_EXPLANATION'],
    maxQuestions: 1, maxCoreMoves: 2, maxGuesses: 1, maxSentences: 4,
    allowChoiceQuestions: false, requireAcknowledgeBeforeQuestion: true,
    salesVisibility: 'S1', productMentionPolicy: 'SPECIFIC_IF_RELEVANT', firstMove: 'ACKNOWLEDGE_FIRST',
    stopConditionsText: '客户明确表示不需要推荐\n客户准备结束沟通',
    deliveryMode: 'AUTO', maxSegments: 2, minDelayMs: 500, maxDelayMs: 1600,
    splitThresholdChars: 80, cancelRemainingOnCustomerMessage: true,
  });
  activeTab.value = 'base';
  ElMessage.success('完整回复规则样例已填入，可逐页查看并按需修改');
}

async function submit(publish: boolean) {
  await formRef.value?.validate();
  const policy = compactPolicy({
    tone: { warmth: form.warmth, playfulness: form.playfulness, formality: form.formality, directness: form.directness, emotionalIntensity: form.emotionalIntensity },
    wording: {
      tildePolicy: form.tildePolicy || undefined, emojiPolicy: form.emojiPolicy || undefined, emojiLimit: form.emojiLimit,
      sentenceParticleFrequency: form.sentenceParticleFrequency || undefined,
      forbiddenExpressions: lines(form.forbiddenExpressionsText), cautiousExpressions: lines(form.cautiousExpressionsText),
      preferredExpressions: lines(form.preferredExpressionsText), forbiddenSentenceParticles: lines(form.forbiddenSentenceParticlesText), semanticChecks: clean(form.semanticChecks),
    },
    structure: { maxQuestions: form.maxQuestions, maxCoreMoves: form.maxCoreMoves, maxGuesses: form.maxGuesses, maxSentences: form.maxSentences, allowChoiceQuestions: form.allowChoiceQuestions, requireAcknowledgeBeforeQuestion: form.requireAcknowledgeBeforeQuestion },
    service: { salesVisibility: form.salesVisibility || undefined, productMentionPolicy: form.productMentionPolicy || undefined, firstMove: form.firstMove.trim() || undefined, stopConditions: lines(form.stopConditionsText) },
    delivery: { mode: form.deliveryMode || undefined, maxSegments: form.maxSegments, minDelayMs: form.minDelayMs, maxDelayMs: form.maxDelayMs, splitThresholdChars: form.splitThresholdChars, cancelRemainingOnCustomerMessage: form.cancelRemainingOnCustomerMessage },
  }) as CustomerServiceStrategyGroupContent['policy'];
  if (!policy || !Object.keys(policy).length) {
    ElMessage.warning('请至少配置一项语气、措辞、结构、服务或质量规则');
    return;
  }
  emit('submit', {
    key: form.key.trim(), name: form.name.trim(), description: form.description.trim(),
    content: {
      schemaVersion: 1,
      scopeType: form.scopeType,
      enabledByDefault: form.scopeType === 'INTENT' ? false : form.enabledByDefault,
      priority: form.priority,
      appliesTo: {
        roleCodes: clean(form.roleCodes), scenarios: clean(form.scenarios), intentKeys: clean(form.intentKeys), intents: clean(form.intents),
        industryCodes: clean(form.industryCodes), riskLevels: clean(form.riskLevels),
      },
      policy,
    },
    publish,
  });
}

function defaultForm() { return {
  key: `ali-rule-${Date.now().toString(36)}`, name: '', description: '', scopeType: 'ROLE_GLOBAL' as CustomerServiceStrategyScopeType, enabledByDefault: true, priority: 100,
  roleCodes: ['ali'] as string[], scenarios: [] as string[], intentKeys: [] as string[], intents: [] as string[], industryCodes: [] as string[], riskLevels: [] as string[],
  warmth: null as number | null, playfulness: null as number | null, formality: null as number | null, directness: null as number | null, emotionalIntensity: null as number | null,
  tildePolicy: '', emojiPolicy: '', emojiLimit: null as number | null, sentenceParticleFrequency: '',
  forbiddenExpressionsText: '', cautiousExpressionsText: '', preferredExpressionsText: '', forbiddenSentenceParticlesText: '',
  semanticChecks: [] as string[],
  maxQuestions: null as number | null, maxCoreMoves: null as number | null, maxGuesses: null as number | null, maxSentences: null as number | null,
  allowChoiceQuestions: null as boolean | null, requireAcknowledgeBeforeQuestion: null as boolean | null,
  salesVisibility: '', productMentionPolicy: '', firstMove: '', stopConditionsText: '',
  deliveryMode: '', maxSegments: null as number | null, minDelayMs: null as number | null, maxDelayMs: null as number | null, splitThresholdChars: null as number | null, cancelRemainingOnCustomerMessage: null as boolean | null,
}; }
function fromContent(asset: CustomerServiceAsset | null, content: CustomerServiceStrategyGroupContent | null) {
  if (!content) return { key: asset?.key ?? '', name: asset?.name ?? '', description: asset?.description ?? '' };
  const tone = content.policy.tone || {}; const wording = content.policy.wording || {}; const structure = content.policy.structure || {}; const service = content.policy.service || {}; const delivery = content.policy.delivery || {};
  return {
    key: asset?.key ?? '', name: asset?.name ?? '', description: asset?.description ?? '', scopeType: content.scopeType, enabledByDefault: content.enabledByDefault !== false, priority: content.priority ?? 100,
    roleCodes: [...(content.appliesTo?.roleCodes || [])], scenarios: [...(content.appliesTo?.scenarios || [])], intentKeys: [...(content.appliesTo?.intentKeys || [])], intents: [...(content.appliesTo?.intents || [])], industryCodes: [...(content.appliesTo?.industryCodes || [])], riskLevels: [...(content.appliesTo?.riskLevels || [])],
    warmth: tone.warmth ?? null, playfulness: tone.playfulness ?? null, formality: tone.formality ?? null, directness: tone.directness ?? null, emotionalIntensity: tone.emotionalIntensity ?? null,
    tildePolicy: wording.tildePolicy || '', emojiPolicy: wording.emojiPolicy || '', emojiLimit: wording.emojiLimit ?? null, sentenceParticleFrequency: wording.sentenceParticleFrequency || '',
    forbiddenExpressionsText: (wording.forbiddenExpressions || []).join('\n'), cautiousExpressionsText: (wording.cautiousExpressions || []).join('\n'), preferredExpressionsText: (wording.preferredExpressions || []).join('\n'), forbiddenSentenceParticlesText: (wording.forbiddenSentenceParticles || []).join('\n'), semanticChecks: [...(wording.semanticChecks || [])],
    maxQuestions: structure.maxQuestions ?? null, maxCoreMoves: structure.maxCoreMoves ?? null, maxGuesses: structure.maxGuesses ?? null, maxSentences: structure.maxSentences ?? null,
    allowChoiceQuestions: structure.allowChoiceQuestions ?? null, requireAcknowledgeBeforeQuestion: structure.requireAcknowledgeBeforeQuestion ?? null,
    salesVisibility: service.salesVisibility || '', productMentionPolicy: service.productMentionPolicy || '', firstMove: service.firstMove || '', stopConditionsText: (service.stopConditions || []).join('\n'),
    deliveryMode: delivery.mode || '', maxSegments: delivery.maxSegments ?? null, minDelayMs: delivery.minDelayMs ?? null, maxDelayMs: delivery.maxDelayMs ?? null, splitThresholdChars: delivery.splitThresholdChars ?? null, cancelRemainingOnCustomerMessage: delivery.cancelRemainingOnCustomerMessage ?? null,
  };
}
function lines(value: string) { return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]; }
function clean(value: string[]) { return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]; }
function compactPolicy(value: Record<string, unknown>) { return stripEmpty(value) as Record<string, unknown>; }
function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEmpty).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value === null || value === '' ? undefined : value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) { const normalized = stripEmpty(item); if (normalized !== undefined && (!Array.isArray(normalized) || normalized.length)) result[key] = normalized; }
  return Object.keys(result).length ? result : undefined;
}
</script>

<style scoped>
.field-label { display: inline-flex; align-items: center; gap: 6px; }
.sample-fill-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; border: 1px dashed var(--el-color-primary-light-5); border-radius: 10px; background: var(--el-color-primary-light-9); padding: 12px 14px; }.sample-fill-bar strong, .sample-fill-bar span { display: block; }.sample-fill-bar span { margin-top: 3px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .sample-fill-bar { align-items: flex-start; flex-direction: column; } }
.scope-result { border: 1px solid #cfe8d8; border-radius: 10px; background: #f3fbf6; padding: 12px 14px; }
.scope-result strong { color: #1d5936; font-size: 14px; }
.scope-result p { margin: 5px 0 0; color: #5b7565; font-size: 12px; line-height: 1.6; }
.form-help { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
</style>
