<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增角色原型' : '编辑角色原型'" width="980px" top="4vh" destroy-on-close>
    <div class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div class="text-sm font-semibold text-slate-700">角色原型只定义稳定人格与表达基线</div>
        <div class="mt-1 text-xs leading-5 text-slate-500">不要在这里建立某个具体账号、行业或岗位身份；具体岗位身份放到“账号配置”，业务事实放到“知识与流程”。</div>
      </div>
      <SampleFillButton v-if="mode === 'create'" label="填入通用角色样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="角色编码" prop="code"><el-input v-model="form.code" :disabled="mode === 'edit'" placeholder="例如 calm-advisor" /></el-form-item>
        <el-form-item label="角色名称" prop="name"><el-input v-model="form.name" maxlength="120" show-word-limit /></el-form-item>
        <el-form-item label="状态" prop="status"><el-select v-model="form.status" class="w-full"><el-option v-for="item in customerServiceRoleStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
      </div>

      <el-form-item label="角色说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="2000" show-word-limit /></el-form-item>
      <el-form-item label="内部角色定位">
        <el-input v-model="form.identity" type="textarea" :rows="2" placeholder="描述内部职责、边界和角色定位；这不是客户可见的自我介绍" />
      </el-form-item>
      <el-form-item label="人格摘要"><el-input v-model="form.personality" type="textarea" :rows="2" placeholder="给运营人员阅读的人格摘要；真正运行时以结构化表达画像为稳定基线" /></el-form-item>
      <el-form-item label="语言摘要"><el-input v-model="form.languageStyle" type="textarea" :rows="2" placeholder="人类可读的语言风格摘要，不作为唯一生成合同" /></el-form-item>
      <el-form-item label="互动姿态摘要"><el-input v-model="form.servicePosture" type="textarea" :rows="2" placeholder="人类可读的互动姿态摘要，不授予业务行为权限" /></el-form-item>

      <div class="mb-3 mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div class="font-semibold text-slate-800">角色表达画像（HVE Speaker Persona）</div>
            <div class="mt-1 text-xs leading-5 text-slate-500">这是当前角色跨轮稳定的“怎么说”。它不决定角色能做什么，也不会被模型用来猜身份。</div>
          </div>
          <el-tag :type="form.speakerProfile.preset === 'CUSTOM' ? 'warning' : 'success'">{{ presetLabel(form.speakerProfile.preset) }}</el-tag>
        </div>
      </div>

      <el-form-item label="表达基线">
        <el-select v-model="form.speakerProfile.preset" class="w-full" @change="applyPreset(form.speakerProfile.preset)">
          <el-option v-for="item in speakerPresetOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <div class="mt-1 text-xs text-slate-500">先选最接近的基线；只有需要时再展开高级微调。不同 Role 可以使用完全不同的表达画像。</div>
      </el-form-item>

      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <div class="rounded border border-slate-200 px-3 py-2 text-sm"><span class="text-slate-400">温度</span><strong class="ml-2">{{ form.speakerProfile.corePresence.warmth }}</strong></div>
        <div class="rounded border border-slate-200 px-3 py-2 text-sm"><span class="text-slate-400">直接度</span><strong class="ml-2">{{ form.speakerProfile.corePresence.directness }}</strong></div>
        <div class="rounded border border-slate-200 px-3 py-2 text-sm"><span class="text-slate-400">正式度</span><strong class="ml-2">{{ form.speakerProfile.corePresence.formality }}</strong></div>
      </div>

      <el-collapse>
        <el-collapse-item title="高级微调：稳定人格、对话质感与互动习惯" name="speaker-advanced">
          <div class="grid gap-x-6 md:grid-cols-2">
            <el-form-item label="温度"><el-slider v-model="form.speakerProfile.corePresence.warmth" :min="0" :max="100" @change="markCustom" /></el-form-item>
            <el-form-item label="直接度"><el-slider v-model="form.speakerProfile.corePresence.directness" :min="0" :max="100" @change="markCustom" /></el-form-item>
            <el-form-item label="正式度"><el-slider v-model="form.speakerProfile.corePresence.formality" :min="0" :max="100" @change="markCustom" /></el-form-item>
            <el-form-item label="表达能量"><el-slider v-model="form.speakerProfile.corePresence.energy" :min="0" :max="100" @change="markCustom" /></el-form-item>
            <el-form-item label="活泼度"><el-slider v-model="form.speakerProfile.corePresence.playfulness" :min="0" :max="100" @change="markCustom" /></el-form-item>
            <el-form-item label="情绪外显"><el-slider v-model="form.speakerProfile.corePresence.emotionalExpressiveness" :min="0" :max="100" @change="markCustom" /></el-form-item>

            <el-form-item label="口语程度"><el-select v-model="form.speakerProfile.conversationalTexture.colloquiality" class="w-full" @change="markCustom"><el-option v-for="item in levelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="回复密度"><el-select v-model="form.speakerProfile.conversationalTexture.brevity" class="w-full" @change="markCustom"><el-option label="紧凑" value="COMPACT" /><el-option label="平衡" value="BALANCED" /><el-option label="展开" value="EXPANSIVE" /></el-select></el-form-item>
            <el-form-item label="句型质感"><el-select v-model="form.speakerProfile.conversationalTexture.sentenceShape" class="w-full" @change="markCustom"><el-option label="利落" value="CRISP" /><el-option label="长短混合" value="MIXED" /><el-option label="连贯舒展" value="FLOWING" /></el-select></el-form-item>
            <el-form-item label="碎句容忍"><el-select v-model="form.speakerProfile.conversationalTexture.fragmentTolerance" class="w-full" @change="markCustom"><el-option v-for="item in levelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="省略容忍"><el-select v-model="form.speakerProfile.conversationalTexture.ellipsisTolerance" class="w-full" @change="markCustom"><el-option v-for="item in levelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="完整答案感"><el-select v-model="form.speakerProfile.conversationalTexture.completionCadence" class="w-full" @change="markCustom"><el-option v-for="item in levelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="节奏变化"><el-select v-model="form.speakerProfile.conversationalTexture.rhythmVariation" class="w-full" @change="markCustom"><el-option v-for="item in levelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>

            <el-form-item label="表达主动感">
              <el-select v-model="form.speakerProfile.interactionStyle.proactivity" class="w-full" @change="markCustom"><el-option label="克制" value="RESTRAINED" /><el-option label="平衡" value="BALANCED" /><el-option label="主动" value="PROACTIVE" /></el-select>
              <div class="mt-1 text-xs leading-5 text-slate-500">仅影响已授权内容的表达感，不授予主动接待、追问或业务推进权限；行为倾向请在业务角色的 SERVICE_POSTURE 中配置。</div>
            </el-form-item>
            <el-form-item label="提问方式"><el-select v-model="form.speakerProfile.interactionStyle.questionStyle" class="w-full" @change="markCustom"><el-option label="尽量少问" value="MINIMAL" /><el-option label="决策导向" value="DECISION_FOCUSED" /><el-option label="探索式" value="EXPLORATORY" /></el-select></el-form-item>
            <el-form-item label="建议方式"><el-select v-model="form.speakerProfile.interactionStyle.adviceStyle" class="w-full" @change="markCustom"><el-option label="克制" value="RESTRAINED" /><el-option label="平衡" value="BALANCED" /><el-option label="有判断" value="ASSERTIVE" /></el-select></el-form-item>
            <el-form-item label="共情方式"><el-select v-model="form.speakerProfile.interactionStyle.empathyStyle" class="w-full" @change="markCustom"><el-option label="轻量" value="LIGHT" /><el-option label="平衡" value="BALANCED" /><el-option label="外显" value="EXPRESSIVE" /></el-select></el-form-item>
            <el-form-item label="玩笑容忍"><el-select v-model="form.speakerProfile.interactionStyle.humorTolerance" class="w-full" @change="markCustom"><el-option label="不使用" value="NONE" /><el-option label="低" value="LOW" /><el-option label="中" value="MEDIUM" /><el-option label="高" value="HIGH" /></el-select></el-form-item>

            <el-form-item label="基础关系距离"><el-select v-model="form.speakerProfile.relationshipStyle.baselineDistance" class="w-full" @change="markCustom"><el-option label="专业" value="PROFESSIONAL" /><el-option label="专业且亲和" value="PROFESSIONAL_FRIENDLY" /><el-option label="熟悉" value="FAMILIAR" /></el-select></el-form-item>
            <el-form-item label="熟悉度适配"><el-select v-model="form.speakerProfile.relationshipStyle.familiarityAdaptation" class="w-full" @change="markCustom"><el-option label="固定" value="FIXED" /><el-option label="逐步" value="GRADUAL" /><el-option label="随关系响应" value="RESPONSIVE" /></el-select></el-form-item>
            <el-form-item label="消息分段"><el-select v-model="form.speakerProfile.deliveryStyle.segmentation" class="w-full" @change="markCustom"><el-option label="紧凑" value="COMPACT" /><el-option label="自然" value="NATURAL" /><el-option label="多气泡" value="SEQUENTIAL" /></el-select></el-form-item>
            <el-form-item label="Emoji"><el-select v-model="form.speakerProfile.deliveryStyle.emoji" class="w-full" @change="markCustom"><el-option label="不用" value="NONE" /><el-option label="少量" value="LIGHT" /><el-option label="自然使用" value="NATURAL" /></el-select></el-form-item>
            <el-form-item label="语气词程度"><el-select v-model="form.speakerProfile.deliveryStyle.sentenceParticleLevel" class="w-full" @change="markCustom"><el-option v-for="item in levelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="submit">保存</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { customerServiceRoleStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type {
  CustomerServiceRolePrototype,
  CustomerServiceRoleSpeakerPreset,
  CustomerServiceRoleSpeakerProfileV1,
  CustomerServiceRoleStatus,
} from '@/modules/customer-service/types/roles.types';

const props = defineProps<{ modelValue: boolean; mode: 'create' | 'edit'; initialData?: CustomerServiceRolePrototype | null; submitting?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [value: typeof form] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();

const speakerPresetOptions = [
  { label: '自然平衡', value: 'BALANCED_HUMAN' },
  { label: '温暖松弛', value: 'WARM_RELAXED' },
  { label: '沉稳专业', value: 'CALM_PROFESSIONAL' },
  { label: '直接高效', value: 'DIRECT_EFFICIENT' },
  { label: '自定义', value: 'CUSTOM' },
] as const;
const levelOptions = [{ label: '低', value: 'LOW' }, { label: '中', value: 'MEDIUM' }, { label: '高', value: 'HIGH' }];

const form = reactive({
  code: '', name: '', description: '', identity: '', personality: '', languageStyle: '', servicePosture: '',
  speakerProfile: createSpeakerPreset('BALANCED_HUMAN'),
  status: 'DRAFT' as CustomerServiceRoleStatus, revision: 1,
});
const hasUserContent = computed(() => Boolean(form.code.trim() || form.name.trim() || form.description.trim() || form.identity.trim() || form.personality.trim() || form.languageStyle.trim() || form.servicePosture.trim()));
const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '仅支持字母、数字、点、下划线和短横线', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
};

watch(() => props.modelValue, (open) => {
  if (!open) return;
  Object.assign(form, {
    code: props.initialData?.code ?? '', name: props.initialData?.name ?? '', description: props.initialData?.description ?? '',
    identity: props.initialData?.identity ?? '', personality: props.initialData?.personality ?? '', languageStyle: props.initialData?.languageStyle ?? '',
    servicePosture: props.initialData?.servicePosture ?? '', speakerProfile: cloneSpeakerProfile(props.initialData?.speakerProfile || createSpeakerPreset('BALANCED_HUMAN')),
    status: props.initialData?.status ?? 'DRAFT', revision: props.initialData?.revision ?? 1,
  });
});

function presetLabel(value: CustomerServiceRoleSpeakerPreset) { return speakerPresetOptions.find((item) => item.value === value)?.label || '自定义'; }
function markCustom() { form.speakerProfile.preset = 'CUSTOM'; }
function applyPreset(value: CustomerServiceRoleSpeakerPreset) { if (value !== 'CUSTOM') form.speakerProfile = createSpeakerPreset(value); }

function fillSample() {
  Object.assign(form, {
    code: `calm-advisor-${Date.now().toString(36)}`,
    name: '沉稳服务顾问（参考）',
    description: '通用虚构参考角色，用于说明角色原型和表达画像如何分开配置。',
    identity: '按产品明确绑定的业务身份提供服务；职责和业务权限由 Planner / Guideline 决定。',
    personality: '沉稳、有判断、不过度表演情绪，遇到不确定信息会克制。',
    languageStyle: '即时聊天感，短句和完整句自然混合，不把每轮写成标准答案。',
    servicePosture: '先回应当前需求，再决定是否需要继续推进；不因为角色身份自动加问句。',
    speakerProfile: createSpeakerPreset('CALM_PROFESSIONAL'),
    status: 'DRAFT',
  });
}

async function submit() { await formRef.value?.validate(); emit('submit', { ...form, speakerProfile: cloneSpeakerProfile(form.speakerProfile) }); }

function createSpeakerPreset(preset: Exclude<CustomerServiceRoleSpeakerPreset, 'CUSTOM'>): CustomerServiceRoleSpeakerProfileV1 {
  const base: CustomerServiceRoleSpeakerProfileV1 = {
    schemaVersion: 1, preset,
    corePresence: { warmth: 60, directness: 60, formality: 45, energy: 50, playfulness: 20, emotionalExpressiveness: 45 },
    conversationalTexture: { colloquiality: 'MEDIUM', brevity: 'BALANCED', sentenceShape: 'MIXED', fragmentTolerance: 'MEDIUM', ellipsisTolerance: 'LOW', completionCadence: 'LOW', rhythmVariation: 'MEDIUM' },
    interactionStyle: { proactivity: 'BALANCED', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'BALANCED', empathyStyle: 'BALANCED', humorTolerance: 'LOW' },
    relationshipStyle: { baselineDistance: 'PROFESSIONAL_FRIENDLY', familiarityAdaptation: 'GRADUAL' },
    deliveryStyle: { segmentation: 'NATURAL', emoji: 'LIGHT', sentenceParticleLevel: 'LOW' },
  };
  if (preset === 'WARM_RELAXED') return { ...base, corePresence: { warmth: 78, directness: 52, formality: 25, energy: 62, playfulness: 42, emotionalExpressiveness: 65 }, conversationalTexture: { colloquiality: 'HIGH', brevity: 'BALANCED', sentenceShape: 'MIXED', fragmentTolerance: 'HIGH', ellipsisTolerance: 'MEDIUM', completionCadence: 'LOW', rhythmVariation: 'HIGH' }, interactionStyle: { proactivity: 'BALANCED', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'BALANCED', empathyStyle: 'EXPRESSIVE', humorTolerance: 'MEDIUM' }, relationshipStyle: { baselineDistance: 'PROFESSIONAL_FRIENDLY', familiarityAdaptation: 'RESPONSIVE' }, deliveryStyle: { segmentation: 'NATURAL', emoji: 'NATURAL', sentenceParticleLevel: 'MEDIUM' } };
  if (preset === 'CALM_PROFESSIONAL') return { ...base, corePresence: { warmth: 58, directness: 70, formality: 72, energy: 38, playfulness: 5, emotionalExpressiveness: 30 }, conversationalTexture: { colloquiality: 'LOW', brevity: 'BALANCED', sentenceShape: 'CRISP', fragmentTolerance: 'LOW', ellipsisTolerance: 'LOW', completionCadence: 'MEDIUM', rhythmVariation: 'MEDIUM' }, interactionStyle: { proactivity: 'BALANCED', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'BALANCED', empathyStyle: 'LIGHT', humorTolerance: 'LOW' }, relationshipStyle: { baselineDistance: 'PROFESSIONAL', familiarityAdaptation: 'GRADUAL' }, deliveryStyle: { segmentation: 'COMPACT', emoji: 'NONE', sentenceParticleLevel: 'LOW' } };
  if (preset === 'DIRECT_EFFICIENT') return { ...base, corePresence: { warmth: 45, directness: 86, formality: 58, energy: 56, playfulness: 3, emotionalExpressiveness: 22 }, conversationalTexture: { colloquiality: 'MEDIUM', brevity: 'COMPACT', sentenceShape: 'CRISP', fragmentTolerance: 'MEDIUM', ellipsisTolerance: 'LOW', completionCadence: 'LOW', rhythmVariation: 'MEDIUM' }, interactionStyle: { proactivity: 'PROACTIVE', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'ASSERTIVE', empathyStyle: 'LIGHT', humorTolerance: 'NONE' }, relationshipStyle: { baselineDistance: 'PROFESSIONAL', familiarityAdaptation: 'FIXED' }, deliveryStyle: { segmentation: 'COMPACT', emoji: 'NONE', sentenceParticleLevel: 'LOW' } };
  return base;
}
function cloneSpeakerProfile(value: CustomerServiceRoleSpeakerProfileV1) { return JSON.parse(JSON.stringify(value)) as CustomerServiceRoleSpeakerProfileV1; }
</script>
