<template>
  <el-dialog
    :model-value="modelValue"
    title="回复校准"
    width="800px"
    :fullscreen="mobile"
    :close-on-click-modal="false"
    destroy-on-close
    class="calibration-feedback-dialog"
    @close="close"
  >
    <template v-if="!result">
      <el-alert
        :title="sourceAlertTitle"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert v-if="replySource?.weakEvidence" class="mt-3" title="该回复只有弱生成证据" description="仍可保存反馈和校准记录，但无法精准还原完整运行时配置，扩大作用域前应补充核对并完成完整回归。" type="warning" :closable="false" show-icon />
      <el-alert v-if="analysisError" class="mt-3" :title="analysisError" type="warning" :closable="false" show-icon />
      <el-form ref="formRef" class="mt-4" :model="form" :rules="rules" label-position="top">
        <el-form-item label="问题类型" prop="problemTypes">
          <el-checkbox-group v-model="form.problemTypes" class="grid gap-x-4 gap-y-2 md:grid-cols-4">
            <el-checkbox v-for="item in problemTypeOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-alert
          v-if="hasDeliveryProblem"
          class="mb-4"
:title="deliveryAlertTitle"
          :description="deliveryAlertDescription"
          type="success"
          :closable="false"
          show-icon
        />
        <el-form-item label="问题补充">
          <el-input v-model="form.problemDescription" type="textarea" :rows="3" maxlength="3000" show-word-limit placeholder="例如：开头太模板化，同一个意思重复说了三遍。" />
        </el-form-item>
        <el-alert class="mb-4" :title="optimizationRouteTitle" :description="optimizationRouteDescription" :type="optimizationRouteType" :closable="false" show-icon />
        <el-form-item label="改善方式">
          <el-radio-group v-model="form.improvementMode">
            <el-radio value="AI_AUTO">让 AI 自主诊断改善</el-radio>
            <el-radio value="GUIDED">按照我的方向改善</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.improvementMode === 'GUIDED'" label="我的改进建议" prop="userSuggestion">
          <el-input v-model="form.userSuggestion" type="textarea" :rows="4" maxlength="5000" show-word-limit placeholder="描述希望靠近的方向即可；示例回复不会被当成固定开头、结尾或固定句数。" />
          <div class="mt-1 text-xs leading-5 text-slate-500">系统会从建议中提炼可复用原则。除非你明确配置固定全文，否则满意示例只作效果参考，不会逐字复刻。</div>
        </el-form-item>
        <el-checkbox v-model="form.analyzeImmediately" :disabled="!canAnalyze">保存后立即由 AI 生成诊断、结构化配置调整建议和参考回复</el-checkbox>
        <div v-if="!canAnalyze" class="mt-2 text-xs text-amber-600">当前账号没有“执行 AI 校准分析”权限，只保存校准记录。</div>
      </el-form>
    </template>

    <template v-else>
      <el-result
        icon="success"
        title="校准记录已保存"
        :sub-title="resultSubtitle"
      />
      <el-alert
        v-if="analysisError"
        class="mb-4"
        :title="analysisError"
        description="记录和失败诊断均已保存。首次分析失败可直接重试；继续校准失败时保留当前调整意见，再次点击“继续校准”即可承接上一版继续迭代。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="result.problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION')"
        class="mb-4"
        title="已作为意图理解机制问题保存"
        description="这类证据不会自动转成语气或表达规则，避免把底层误判扩散到后续回复。"
        type="warning"
        :closable="false"
        show-icon
      />
      <div v-if="result.aiDiagnosis" class="space-y-4">
        <el-alert
          v-if="calibrationIteration > 1"
          :title="`已保留 ${calibrationIteration} 轮校准结果`"
          description="每一轮校准都会保留，而且每一轮都可以单独应用。你认为哪一轮最合适，就直接在该轮结果里点击应用，不需要以最后一轮为准。"
          type="info"
          :closable="false"
          show-icon
        />
        <el-card shadow="never">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <span class="font-semibold">校准迭代记录</span>
              <span class="text-xs text-slate-500">最新第 {{ calibrationIteration }} 轮</span>
            </div>
          </template>
          <el-collapse v-model="expandedCalibrationVersions" class="calibration-version-collapse">
            <el-collapse-item v-for="version in calibrationVersions" :key="version.key" :name="version.key">
              <template #title>
                <div class="flex min-w-0 flex-1 items-center gap-2 pr-3">
                  <span class="font-medium">第 {{ version.iteration }} 轮校准</span>
                  <el-tag v-if="version.latest" size="small" type="success">最新</el-tag>
                  <el-tag v-if="appliedAnalysisIteration === version.iteration" size="small" type="success">当前已生效</el-tag>
                  <span v-if="!version.latest" class="truncate text-xs text-slate-400">{{ version.diagnosis?.summary || '历史校准结果' }}</span>
                </div>
              </template>
              <div class="space-y-4 pb-2">
                <el-alert
                  v-if="version.iteration > 1 || version.instruction"
                  :title="version.iteration === 1 ? '首次校准时管理员建议' : `第 ${version.iteration} 轮继续调整意见`"
                  :description="version.instruction || '本轮未补充文字意见，由系统基于上一版继续复审。'"
                  type="info"
                  :closable="false"
                />
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="mb-3 font-semibold">AI 诊断</div>
                  <div class="text-sm leading-7"><b>结论：</b>{{ version.diagnosis?.summary || '—' }}</div>
                  <div class="mt-2 text-sm leading-7"><b>根因：</b>{{ version.diagnosis?.rootCause || '—' }}</div>
                  <div v-if="version.diagnosis?.targetScopes?.length" class="mt-3 flex flex-wrap gap-2">
                    <el-tag v-for="scope in version.diagnosis.targetScopes" :key="scope">{{ configScopeLabel(scope) }}</el-tag>
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="mb-3 font-semibold">配置调整建议</div>
                  <div v-for="(item, index) in version.recommendations || []" :key="`${version.key}-${item.scope}-${index}`" class="mb-3 rounded-lg bg-slate-50 p-3 last:mb-0">
                    <div class="flex items-center gap-2"><el-tag size="small" :type="priorityTag(item.priority)">{{ item.priority }}</el-tag><b>{{ item.title }}</b><span class="text-xs text-slate-500">{{ configScopeLabel(item.scope) }}</span></div>
                    <div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ item.change }}</div>
                  </div>
                </div>
                <div v-if="version.tuningDirectives" class="rounded-lg border border-slate-200 bg-white p-4">
                  <div class="mb-3 font-semibold">校准提炼出的结构化方向</div>
                  <div class="space-y-3 text-sm">
                    <div v-if="version.tuningDirectives.behaviorRules.length"><b>行为规则：</b>{{ version.tuningDirectives.behaviorRules.join('；') }}</div>
                    <div v-if="version.tuningDirectives.avoidExpressions.length"><b>避免表达：</b>{{ version.tuningDirectives.avoidExpressions.join('、') }}</div>
                    <div v-if="version.tuningDirectives.preferredPatterns.length"><b>抽象表达方向：</b>{{ version.tuningDirectives.preferredPatterns.join('；') }}</div>
                    <div><b>长度：</b>句数上限 {{ version.tuningDirectives.maxSentences ?? '按场景预算' }}，问题上限 {{ version.tuningDirectives.maxQuestions ?? '按场景预算' }}；表情策略 {{ version.tuningDirectives.emojiPolicy }}。上限不代表每次都要达到。</div>
                    <div v-if="version.tuningDirectives.delivery?.mode"><b>投递：</b>{{ deliveryDirectiveLabel(version.tuningDirectives.delivery) }}</div>
                  </div>
                </div>
                <div v-if="version.suggestedReply" class="rounded-lg border border-emerald-100 bg-white p-4">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <span class="font-semibold">建议回复（效果参考，不是固定话术）</span>
                    <el-button size="small" @click.stop="copyCalibrationReply(version.suggestedReply)">复制</el-button>
                  </div>
                  <div class="whitespace-pre-wrap rounded-lg bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">{{ version.suggestedReply }}</div>
                  <div v-if="canApplyCalibrationVersion || canCreateKnowledge" class="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-emerald-100 pt-4">
                    <span class="mr-auto text-xs text-slate-500">可将本轮建议沉淀为知识；长期校准应用仍使用本轮真实历史快照，不会偷偷切回最新一轮。</span>
                    <el-button v-if="canCreateKnowledge" type="primary" plain @click.stop="openKnowledgeCapture(version)">转为知识库知识</el-button>
                    <el-button
                      v-if="canApplyCalibrationVersion"
                      type="success"
                      :disabled="appliedAnalysisIteration === version.iteration || applyingCalibrationIteration !== null"
                      :loading="applyingCalibrationIteration === version.iteration"
                      @click.stop="applyCalibrationVersion(version)"
                    >{{ calibrationVersionApplyLabel(version) }}</el-button>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>
        <el-card v-if="canRefineAnalysis" shadow="never">
          <template #header><span class="font-semibold">继续校准这一次结果</span></template>
          <div class="mb-3 text-sm leading-6 text-slate-600">
            不满意时可以继续迭代。本轮填写的调整意见优先级最高；如果它与首次校准建议或上一版规则冲突，以本轮意见为准。其他校准批次的已生效规则不会作为本轮继续校准要求带入。
          </div>
          <el-input
            v-model="refinementInstruction"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="例如：第一段内容保留不变，只把最后一句提问拆成第二段。"
          />
        </el-card>
        <el-card v-if="canApplyCalibrationVersion" shadow="never">
          <template #header><span class="font-semibold">应用范围</span></template>
          <el-select v-model="applyScopeType" class="w-full" :disabled="result.status === 'APPLIED_TUNING'">
            <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value">
              <div><div>{{ item.label }}</div><div class="text-xs text-slate-400">{{ item.description }}</div></div>
            </el-option>
          </el-select>
          <el-alert class="mt-3" :title="applicationScopeAlert.title" :description="applicationScopeAlert.description" :type="applicationScopeAlert.type" :closable="false" show-icon />
        </el-card>
        <el-alert
          v-if="!canApplyResult"
          title="当前属于理解机制问题，不自动写入长期表达校准"
          description="这只限制长期规则发布，不限制管理员对当前测试结果的最终决定。只要建议回复符合预期，仍可直接使用下方按钮替换当前测试消息。"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert v-else-if="result.status === 'APPLIED_TUNING'" :title="appliedResultAlert.title" :description="appliedResultAlert.description" :type="appliedResultAlert.type" :closable="false" show-icon />
      </div>
    </template>

    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button v-if="result && replySource" @click="goToTuning">在回复调优中查看完整分析与回归</el-button>
      <el-button v-if="result && analysisError && canAnalyze && !result.aiDiagnosis" type="primary" :loading="retrying" @click="retryAnalysis">重新分析</el-button>
      <el-button v-if="!result" type="primary" :loading="submitting" @click="submit">保存校准记录</el-button>
      <el-button v-if="canRefineAnalysis" type="primary" plain :loading="refining" @click="continueCalibration">继续校准</el-button>
      <el-button v-if="canApplyCurrentReply" :loading="applyingCurrentReply" @click="applyCurrentReply">{{ currentReplyApplyLabel }}</el-button>
      <el-button v-if="result?.suggestedReply && result.status !== 'APPLIED_TUNING' && canUpdate && canApplyResult" type="success" :loading="applying" @click="applyToTuning">{{ applyButtonLabel }}</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="knowledgeCaptureDialog" title="将当前校准轮次转为知识" width="min(860px, 96vw)" :close-on-click-modal="false" destroy-on-close>
    <el-alert type="info" :closable="false" show-icon class="mb-4" :title="knowledgeCaptureVersion ? `来源：第 ${knowledgeCaptureVersion.iteration} 轮校准` : '选择校准轮次'" description="只使用你点击的这一轮建议回复，不会自动改用最新轮。目标知识库需要人工确认；保存后原校准记录和历史轮次不会被修改。" />
    <el-form label-position="top">
      <el-form-item label="目标知识库"><el-select v-model="knowledgeCaptureForm.collectionId" filterable class="w-full" placeholder="请选择知识库"><el-option v-for="item in knowledgeCollections" :key="item.id" :label="`${item.name} · ${item._count?.entries || 0} 条`" :value="item.id" /></el-select></el-form-item>
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="转化方式">
          <el-radio-group v-model="knowledgeCaptureForm.mode"><el-radio value="REGULAR">常规知识</el-radio><el-radio value="FIXED_QA">固定答案直出</el-radio></el-radio-group>
        </el-form-item>
        <el-form-item label="状态"><el-select v-model="knowledgeCaptureForm.status" class="w-full"><el-option label="草稿（先检查）" value="DRAFT" /><el-option label="已启用" value="ENABLED" /></el-select></el-form-item>
      </div>
      <el-alert v-if="knowledgeCaptureForm.mode === 'FIXED_QA'" class="mb-4" type="warning" :closable="false" show-icon title="固定答案直出会跳过模型" description="命中后使用 FUZZY 模糊匹配，随机 Loading 后原文回复这里的固定答案，不再调用 AI。只有你确认这段话确实应该固定直出时才选择。" />
      <el-alert v-else class="mb-4" type="success" :closable="false" show-icon title="常规知识不会变成固定话术" description="以 REFERENCE_ONLY 方式保存校准样本，供正常知识检索使用；不会因为这次校准自动获得业务事实最高权威。" />
      <el-form-item label="标题"><el-input v-model="knowledgeCaptureForm.title" maxlength="200" /></el-form-item>
      <el-form-item label="客户问题 / 触发问法"><el-input v-model="knowledgeCaptureForm.question" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
      <el-form-item :label="knowledgeCaptureForm.mode === 'FIXED_QA' ? '固定答案' : '知识内容'"><el-input v-model="knowledgeCaptureForm.answer" type="textarea" :rows="6" maxlength="12000" show-word-limit /></el-form-item>
      <template v-if="knowledgeCaptureForm.mode === 'REGULAR'">
        <el-form-item label="常规知识分类"><el-select v-model="knowledgeCaptureForm.category" class="w-full"><el-option label="常见问答" value="FAQ" /><el-option label="服务/功能" value="SERVICE" /><el-option label="服务政策" value="SERVICE_POLICY" /><el-option label="品牌事实" value="BRAND_FACT" /><el-option label="其他" value="OTHER" /></el-select></el-form-item>
      </template>
      <template v-else>
        <div class="grid gap-4 md:grid-cols-3">
          <el-form-item label="优先级"><el-input-number v-model="knowledgeCaptureForm.priority" :min="0" :max="1000" class="w-full" /></el-form-item>
          <el-form-item label="Loading 最短（秒）"><el-input-number v-model="knowledgeCaptureForm.minDelaySec" :min="0.5" :max="8" :step="0.1" :precision="1" class="w-full" /></el-form-item>
          <el-form-item label="Loading 最长（秒）"><el-input-number v-model="knowledgeCaptureForm.maxDelaySec" :min="0.5" :max="8" :step="0.1" :precision="1" class="w-full" /></el-form-item>
        </div>
      </template>
    </el-form>
    <template #footer><el-button @click="knowledgeCaptureDialog=false">取消</el-button><el-button type="primary" :loading="knowledgeCaptureSaving" @click="saveKnowledgeCapture">保存为知识</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { createCustomerServiceKnowledgeEntry, listCustomerServiceKnowledgeCollections } from '@/modules/customer-service/api/knowledge-entries.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import type { CustomerServiceContextStatus, CustomerServiceKnowledgeCategory, CustomerServiceKnowledgeCollection } from '@/modules/customer-service/types/context-profiles.types';
import {
  analyzeCustomerServiceCalibration,
  applyCustomerServiceCalibrationCurrentTestReply,
  applyCustomerServiceCalibrationToTuning,
  createCustomerServiceCalibration,
  createCustomerServiceCalibrationFromReply,
  getCustomerServiceCalibration,
  refineCustomerServiceCalibrationAnalysis
} from '@/modules/customer-service/api/calibrations.api';
import type {
  CustomerServiceCalibrationCreatePayload,
  CustomerServiceCalibrationCurrentReplyApplication,
  CustomerServiceCalibrationFromReplyPayload,
  CustomerServiceCalibrationImprovementMode,
  CustomerServiceCalibrationProblemType,
  CustomerServiceCalibrationRecord,
  CustomerServiceCalibrationScopeType,
  CustomerServiceTuningDirectives
} from '@/modules/customer-service/types/calibrations.types';

type CalibrationBasePayload = Omit<CustomerServiceCalibrationCreatePayload, 'problemTypes' | 'improvementMode' | 'problemDescription' | 'userSuggestion'>;
type CalibrationReplySource = Omit<CustomerServiceCalibrationFromReplyPayload, 'problemTypes' | 'improvementMode' | 'problemDescription' | 'userSuggestion'> & {
  accountProfileId?: string | null;
  robotId?: string | null;
  weakEvidence?: boolean;
  existingRecordId?: string | null;
  decisionOnly?: boolean;
  scopeImpact?: {
    accountScope: { accountCount: number; robotCount: number };
    roleScope: { accountCount: number; robotCount: number };
  };
};

type CalibrationVersionView = {
  key: string;
  iteration: number;
  latest: boolean;
  instruction: string | null;
  analyzedAt: string | null;
  aiModel: string | null;
  diagnosis: CustomerServiceCalibrationRecord['aiDiagnosis'];
  recommendations: CustomerServiceCalibrationRecord['aiRecommendations'];
  tuningDirectives: CustomerServiceTuningDirectives | null;
  suggestedReply: string;
};

const props = withDefaults(defineProps<{
  modelValue: boolean;
  basePayload: CalibrationBasePayload | null;
  replySource?: CalibrationReplySource | null;
  canAnalyze: boolean;
  canUpdate: boolean;
  canExpandScope?: boolean;
  mobile?: boolean;
}>(), { replySource: null, canExpandScope: false, mobile: false });
const router = useRouter();
const { has } = useCustomerServicePermission();
const canCreateKnowledge = computed(() => has('customer-service:context-profile:create'));
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [record: CustomerServiceCalibrationRecord];
  'reply-applied': [application: CustomerServiceCalibrationCurrentReplyApplication];
}>();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const applying = ref(false);
const applyingCalibrationIteration = ref<number | null>(null);
const applyingCurrentReply = ref(false);
const currentReplyApplication = ref<CustomerServiceCalibrationCurrentReplyApplication | null>(null);
const retrying = ref(false);
const refining = ref(false);
const refinementInstruction = ref('');
const expandedCalibrationVersions = ref<string[]>([]);
const analysisError = ref('');
const result = ref<CustomerServiceCalibrationRecord | null>(null);
const knowledgeCaptureDialog = ref(false);
const knowledgeCaptureSaving = ref(false);
const knowledgeCaptureVersion = ref<CalibrationVersionView | null>(null);
const knowledgeCollections = ref<CustomerServiceKnowledgeCollection[]>([]);
const knowledgeCaptureForm = reactive({ collectionId:'', mode:'REGULAR' as 'REGULAR'|'FIXED_QA', title:'', question:'', answer:'', category:'FAQ' as CustomerServiceKnowledgeCategory, status:'DRAFT' as CustomerServiceContextStatus, priority:200, minDelaySec:1.8, maxDelaySec:4.2 });
const applyScopeType = ref<CustomerServiceCalibrationScopeType>('ROLE_CONTEXT');
const effectiveAccountProfileId = computed(() => result.value?.accountProfileId || props.replySource?.accountProfileId || null);
const effectiveRobotId = computed(() => result.value?.robotId || props.replySource?.robotId || null);
const resultTargetsCurrentTestReply = computed(() => Boolean(
  result.value?.sourceAnalysisId || result.value?.sourceType === 'ROBOT_TEST_DM'
));
const canRefineAnalysis = computed(() => Boolean(
  props.canAnalyze
  && result.value?.aiDiagnosis
  && result.value?.suggestedReply
  && result.value?.status !== 'APPLIED_TUNING'
  && result.value?.status !== 'ARCHIVED'
));
const calibrationVersions = computed<CalibrationVersionView[]>(() => buildCalibrationVersions(result.value));
const calibrationIteration = computed(() => Math.max(1, calibrationVersions.value.length));
const appliedAnalysisIteration = computed<number | null>(() => {
  if (result.value?.status !== 'APPLIED_TUNING') return null;
  const diagnostics = asPlainRecord(result.value.aiAnalysisDiagnostics);
  const explicit = Number(diagnostics.appliedAnalysisIteration || 0);
  return Number.isInteger(explicit) && explicit >= 1 ? explicit : calibrationIteration.value;
});
const canApplyCalibrationVersion = computed(() => Boolean(
  result.value?.aiDiagnosis
  && result.value?.suggestedReply
  && result.value?.status !== 'ARCHIVED'
  && props.canUpdate
  && canApplyResult.value
));

watch(calibrationVersions, (versions) => {
  const latest = versions[versions.length - 1];
  expandedCalibrationVersions.value = latest ? [latest.key] : [];
}, { immediate: true });
const canApplyCurrentReply = computed(() => Boolean(
  result.value?.suggestedReply
  && result.value?.status !== 'ARCHIVED'
  && props.canUpdate
  && resultTargetsCurrentTestReply.value
  && currentReplyApplication.value?.reason !== 'ALREADY_APPLIED'
  && currentReplyApplication.value?.reason !== 'APPLIED'
));
const selectedScopeIsImmediate = computed(() => isImmediateScopeType(applyScopeType.value));
const resultSubtitle = computed(() => {
  if (result.value?.problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION') && result.value?.status !== 'APPLIED_TUNING') {
    return 'AI 已完成诊断。理解机制问题不会自动沉淀成长期表达规则；管理员仍可直接采用建议回复替换当前测试消息。';
  }
  if (result.value?.status === 'APPLIED_TUNING') {
    if (isImmediateScopeType(result.value.appliedScopeType) && result.value.appliedProfile?.status === 'ACTIVE') {
      return `第 ${appliedAnalysisIteration.value || calibrationIteration.value} 轮校准已在当前精确账号作用域立即生效；你仍可改选其他历史轮次重新应用。`;
    }
    if (isImmediateScopeType(result.value.appliedScopeType)) {
      return '该精确作用域校准已保存，但当前档案未启用；可在“校准档案”中重新启用。';
    }
    return '已保存为角色级共享策略候选；扩大到其他账号仍需回归并人工发布。';
  }
  return result.value?.status === 'AI_ANALYZED'
    ? 'AI 已完成诊断。管理员确认精确账号作用域后可立即生效；角色级扩大仍走回归发布。'
    : '可以在“校准记录”中继续分析和处理。';
});
const applicationScopeAlert = computed<{ title: string; description: string; type: 'success' | 'warning' }>(() => {
  if (result.value?.status === 'APPLIED_TUNING') {
    return {
      title: '切换校准轮次时保持当前已生效作用域',
      description: '你可以改用任意历史轮次，但不会同时改动作用范围，避免旧作用域残留后出现两套规则同时生效。',
      type: 'success',
    };
  }
  return selectedScopeIsImmediate.value
    ? {
        title: '确认后立即生效，并跨新对话持续继承',
        description: '只在当前选择的机器人/账号身份作用域内使用抽象校准原则；不会照抄建议回复原句，也不会自动扩大到整个角色。同一作用域继续校准时，非冲突原则会累积，近似重复或反向修正会以最近一次管理员校准为准。',
        type: 'success',
      }
    : {
        title: '这是角色级共享范围，不会在本次确认后直接扩大生效',
        description: '本次只保存为共享策略候选；仍需生成策略草稿、完成全量回归并由管理员发布。',
        type: 'warning',
      };
});
const appliedResultAlert = computed<{ title: string; description: string; type: 'success' | 'warning' }>(() => {
  const title = result.value?.appliedProfile?.title || result.value?.appliedScopeKey || '当前校准档案';
  if (isImmediateScopeType(result.value?.appliedScopeType) && result.value?.appliedProfile?.status === 'ACTIVE') {
    return {
      title: `第 ${appliedAnalysisIteration.value || calibrationIteration.value} 轮已立即生效：${title}`,
      description: currentReplyApplication.value?.applied
        ? '长期校准已生效，当前测试回复也已替换为建议版本；后续新会话会继续自动继承抽象校准原则。'
        : '后续当前作用域的新会话会自动加载这份校准；如果这是当前测试最后一轮，可在下方把建议回复同步应用到当前消息。',
      type: 'success',
    };
  }
  if (isImmediateScopeType(result.value?.appliedScopeType)) {
    return { title: `第 ${appliedAnalysisIteration.value || calibrationIteration.value} 轮已保存但未启用：${title}`, description: '这是历史精确校准档案，可到“校准档案”启用后进入后续生成。', type: 'warning' };
  }
  return { title: `第 ${appliedAnalysisIteration.value || calibrationIteration.value} 轮已保存共享策略候选：${title}`, description: '角色级扩大仍需完整回归并人工发布后才进入正式共享策略。', type: 'warning' };
});
const applyButtonLabel = computed(() => selectedScopeIsImmediate.value ? '应用校准并立即生效' : '保存为角色级共享策略候选');
const currentReplyApplyLabel = computed(() => result.value?.status === 'APPLIED_TUNING' && appliedAnalysisIteration.value
  ? `使用第 ${appliedAnalysisIteration.value} 轮建议回复替换当前测试消息`
  : '使用建议回复替换当前测试消息');
const sourceAlertTitle = computed(() => props.replySource
  ? '本次校准会由后端根据 Reply Trace 获取客户消息、完整回复、账号、模型、配置版本、运行约束和质检证据，前端不会自行拼装权威快照。'
  : '本次会保存客户消息、候选回复，以及当前角色原型、客服角色、角色模块、行业、命中规则、资产、运行约束和质检结果。');
const form = reactive({
  problemTypes: [] as CustomerServiceCalibrationProblemType[],
  problemDescription: '',
  improvementMode: 'AI_AUTO' as CustomerServiceCalibrationImprovementMode,
  userSuggestion: '',
  analyzeImmediately: true
});
const deliveryProblemTypes = new Set<CustomerServiceCalibrationProblemType>(['DELIVERY_SHOULD_SPLIT', 'DELIVERY_SHOULD_MERGE', 'DELIVERY_PACING']);
const mechanismProblemTypes = new Set<CustomerServiceCalibrationProblemType>(['CONTEXT_LOSS', 'FACT_ERROR', 'WORKFLOW_ERROR', 'CAPABILITY_OVERREACH', 'QUALITY_GATE_MISJUDGMENT', 'UNDERSTANDING_MISCLASSIFICATION']);
const hasDeliveryProblem = computed(() => form.problemTypes.some((item) => deliveryProblemTypes.has(item)));
const hasOnlyDeliveryProblem = computed(() => form.problemTypes.length > 0 && form.problemTypes.every((item) => deliveryProblemTypes.has(item)));
const deliveryAlertTitle = computed(() => hasOnlyDeliveryProblem.value
  ? '内容可以保留，本次只校准消息拆分和发送节奏'
  : '本次同时包含内容问题和投递方式问题');
const deliveryAlertDescription = computed(() => hasOnlyDeliveryProblem.value
  ? '“应分开发送”会生成顺序投递策略；“应合并一条”会强制单条；“发送节奏不自然”只调整段间延迟和自动拆分边界。评论仍保持单条。'
  : '系统会分别沉淀内容策略和投递策略，不会把满意内容误判为必须改写。评论仍保持单条。');
const hasMechanismSignal = computed(() => form.problemTypes.some((item) => mechanismProblemTypes.has(item)));
const canApplyResult = computed(() => !result.value?.problemTypes.includes('UNDERSTANDING_MISCLASSIFICATION'));
const optimizationRouteTitle = computed(() => hasMechanismSignal.value ? '可能包含通用机制问题' : '优先通过 PC 配置与校准优化');
const optimizationRouteDescription = computed(() => hasMechanismSignal.value
  ? '系统会保存证据并区分：配置未完善、权限尚未绑定，或代码机制错误。不会因为一次不满意回复就直接写死代码规则。'
  : '语气、自然度、回复长短、朋友感、是否追问等问题应优先沉淀到通用策略、场景策略或正式意图配置，不需要逐句修改代码。');
const optimizationRouteType = computed<'warning' | 'success'>(() => hasMechanismSignal.value ? 'warning' : 'success');
const rules: FormRules = {
  problemTypes: [{ type: 'array', required: true, min: 1, message: '至少选择一个问题类型', trigger: 'change' }],
  userSuggestion: [{ validator: (_rule, value, callback) => form.improvementMode === 'GUIDED' && !String(value || '').trim() ? callback(new Error('请填写希望 AI 按照什么方向改善')) : callback(), trigger: 'blur' }]
};
const allProblemTypeOptions = computed<Array<{ value: CustomerServiceCalibrationProblemType; label: string; disabled?: boolean }>>(() => [
  { value: 'AI_TONE', label: 'AI 感强' }, { value: 'REDUNDANT', label: '废话过多' }, { value: 'REPETITIVE', label: '重复表达' },
  { value: 'UNNATURAL', label: '语气不自然' }, { value: 'ROLE_INCONSISTENT', label: '角色不一致' }, { value: 'EMOTION_MISMATCH', label: '共情不准确' },
  { value: 'TOO_MANY_QUESTIONS', label: '提问过多' }, { value: 'FACT_ERROR', label: '事实问题' }, { value: 'WORKFLOW_ERROR', label: '流程问题' },
  { value: 'SALES_OVERREACH', label: '销售过度' }, { value: 'TOO_FORMAL', label: '过度正式' }, { value: 'CONTEXT_LOSS', label: '上下文丢失' },
  { value: 'CAPABILITY_OVERREACH', label: '能力越权' }, { value: 'NO_CONVERSATION_VALUE', label: '缺少真实对话动作' }, { value: 'TOO_LONG', label: '回复过长' },
  { value: 'TOO_PLAYFUL', label: '过度俏皮' }, { value: 'QUALITY_GATE_MISJUDGMENT', label: '质量门误判' },
  { value: 'UNDERSTANDING_MISCLASSIFICATION', label: '意图识别误判' },
  { value: 'DELIVERY_SHOULD_SPLIT', label: '应分开发送', disabled: form.problemTypes.includes('DELIVERY_SHOULD_MERGE') },
  { value: 'DELIVERY_SHOULD_MERGE', label: '应合并一条', disabled: form.problemTypes.includes('DELIVERY_SHOULD_SPLIT') },
  { value: 'DELIVERY_PACING', label: '发送节奏不自然' },
  { value: 'OTHER', label: '其他' }
]);
const decisionProblemTypes = new Set<CustomerServiceCalibrationProblemType>([
  'WORKFLOW_ERROR', 'QUALITY_GATE_MISJUDGMENT', 'UNDERSTANDING_MISCLASSIFICATION', 'OTHER'
]);
const problemTypeOptions = computed(() => props.replySource?.decisionOnly
  ? allProblemTypeOptions.value.filter((item) => decisionProblemTypes.has(item.value))
  : allProblemTypeOptions.value);
const scopeOptions = computed<Array<{ value: CustomerServiceCalibrationScopeType; label: string; description: string }>>(() => {
  const robotId = effectiveRobotId.value;
  const accountProfileId = effectiveAccountProfileId.value;
  if (robotId && accountProfileId) {
    const robotOptions: Array<{ value: CustomerServiceCalibrationScopeType; label: string; description: string }> = [
      { value: 'ROBOT_CONTEXT', label: '当前角色 + 身份/背景 + 当前机器人 + 完整上下文（推荐）', description: '立即生效。新开对话后只要仍是同一角色、身份/背景和机器人账号，并命中相同场景/意图/风险，就会自动继承。' },
      { value: 'ROBOT_SCENARIO', label: '当前角色 + 身份/背景 + 当前机器人 + 当前场景', description: '立即生效。该机器人在当前场景的后续新会话都会继承，不限制具体意图和风险。' },
      { value: 'ROBOT_GLOBAL', label: '当前角色 + 身份/背景 + 当前机器人全局', description: '立即生效。该角色、身份/背景和机器人账号下的所有场景都会继承，适合稳定的人设/表达原则。' },
    ];
    if (!props.canExpandScope) return robotOptions;
    return [
      ...robotOptions,
      { value: 'ROLE_SCENARIO', label: '扩大为当前角色 + 当前场景共享策略', description: `不会立即扩大生效；会影响同角色账号 ${props.replySource?.scopeImpact?.roleScope.accountCount ?? 0} 个、机器人 ${props.replySource?.scopeImpact?.roleScope.robotCount ?? 0} 个，需回归和发布。` },
      { value: 'ROLE_GLOBAL', label: '扩大为当前角色全局共享策略', description: `不会立即扩大生效；影响同角色账号 ${props.replySource?.scopeImpact?.roleScope.accountCount ?? 0} 个、机器人 ${props.replySource?.scopeImpact?.roleScope.robotCount ?? 0} 个，需回归和发布。` },
    ];
  }
  if (accountProfileId) {
    const accountOptions: Array<{ value: CustomerServiceCalibrationScopeType; label: string; description: string }> = [
      { value: 'ACCOUNT_CONTEXT', label: '当前角色 + 当前身份/背景 + 完整上下文（推荐）', description: '立即生效，并在同一角色与账号身份/背景的新会话中按相同场景、意图和风险自动继承。' },
      { value: 'ACCOUNT_SCENARIO', label: '当前角色 + 当前身份/背景 + 当前场景', description: '立即生效，并在该身份/背景的当前场景跨新会话继承。' },
      { value: 'ACCOUNT_GLOBAL', label: '当前角色 + 当前身份/背景全局', description: '立即生效，并在该角色与身份/背景下所有新会话继承。' },
    ];
    if (!props.canExpandScope) return accountOptions;
    return [
      ...accountOptions,
      { value: 'ROLE_SCENARIO', label: '扩大为当前角色 + 当前场景共享策略', description: `不会立即扩大生效；可能影响同角色账号 ${props.replySource?.scopeImpact?.roleScope.accountCount ?? 0} 个、机器人 ${props.replySource?.scopeImpact?.roleScope.robotCount ?? 0} 个，需回归和发布。` },
      { value: 'ROLE_GLOBAL', label: '扩大为当前角色全局共享策略', description: `不会立即扩大生效；可能影响同角色账号 ${props.replySource?.scopeImpact?.roleScope.accountCount ?? 0} 个、机器人 ${props.replySource?.scopeImpact?.roleScope.robotCount ?? 0} 个，需回归和发布。` },
    ];
  }
  return [
    { value: 'ROLE_CONTEXT', label: '当前角色 + 完整场景上下文', description: '角色级共享策略候选，不会在本次确认后直接进入生成；需聚合证据、回归并发布。' },
    { value: 'ROLE_SCENARIO', label: '当前角色 + 当前场景', description: '角色级共享策略候选，不会在本次确认后直接进入生成；需回归并发布。' },
    { value: 'ROLE_GLOBAL', label: '当前角色全局', description: '角色级共享策略候选，影响范围最大；需回归并发布。' },
  ];
});

function isImmediateScopeType(value: string | null | undefined) {
  return Boolean(value && (value.startsWith('ROBOT_') || value.startsWith('ACCOUNT_')));
}

function defaultApplyScope(record?: Pick<CustomerServiceCalibrationRecord, 'robotId' | 'accountProfileId'> | null): CustomerServiceCalibrationScopeType {
  const robotId = record?.robotId || props.replySource?.robotId || null;
  const accountProfileId = record?.accountProfileId || props.replySource?.accountProfileId || null;
  if (robotId && accountProfileId) return 'ROBOT_CONTEXT';
  if (accountProfileId) return 'ACCOUNT_CONTEXT';
  return 'ROLE_CONTEXT';
}


watch(() => props.modelValue, async (open) => {
  if (!open) return;
  result.value = null;
  currentReplyApplication.value = null;
  analysisError.value = '';
  refinementInstruction.value = '';
  applyScopeType.value = defaultApplyScope();
  form.problemTypes = [];
  form.problemDescription = '';
  form.improvementMode = 'AI_AUTO';
  form.userSuggestion = '';
  form.analyzeImmediately = props.canAnalyze;
  if (props.replySource?.existingRecordId) {
    try {
      result.value = await getCustomerServiceCalibration(props.replySource.existingRecordId);
      applyScopeType.value = result.value.appliedScopeType || defaultApplyScope(result.value);
    } catch (error: any) {
      analysisError.value = String(error?.message || '已有校准记录加载失败，请关闭后重试');
    }
  }
});

async function submit() {
  if (!props.basePayload && !props.replySource) return;
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const feedbackPayload = {
      problemTypes: [...form.problemTypes],
      problemDescription: form.problemDescription.trim() || undefined,
      improvementMode: form.improvementMode,
      userSuggestion: form.improvementMode === 'GUIDED' ? form.userSuggestion.trim() : undefined
    };
    let record: CustomerServiceCalibrationRecord;
    if (props.replySource) {
      record = await createCustomerServiceCalibrationFromReply({
        replyTraceId: props.replySource.replyTraceId,
        sourceRefId: props.replySource.sourceRefId,
        selectedSegmentIndexes: props.replySource.selectedSegmentIndexes,
        ...feedbackPayload
      });
    } else {
      if (!props.basePayload) return;
      record = await createCustomerServiceCalibration({ ...props.basePayload, ...feedbackPayload });
    }
    if (form.analyzeImmediately && props.canAnalyze) {
      try { record = await analyzeCustomerServiceCalibration(record.id); }
      catch (error: any) {
        analysisError.value = String(error?.message || 'AI 分析未完成，请重试');
        record = await getCustomerServiceCalibration(record.id);
        ElMessage.warning('校准记录已保存，AI 分析未完成，可在当前窗口直接重试');
      }
    }
    result.value = record;
    applyScopeType.value = record.appliedScopeType || defaultApplyScope(record);
    emit('changed', record);
    ElMessage.success(record.status === 'AI_ANALYZED' ? '校准记录、结构化配置建议和参考回复已生成' : '校准记录已保存');
  } finally { submitting.value = false; }
}

async function continueCalibration() {
  if (!result.value) return;
  refining.value = true;
  try {
    result.value = await refineCustomerServiceCalibrationAnalysis(result.value.id, {
      refinementInstruction: refinementInstruction.value.trim() || undefined
    });
    const refinementStatus = String(asPlainRecord(result.value.aiAnalysisDiagnostics).finalStatus || '');
    analysisError.value = '';
    applyScopeType.value = result.value.appliedScopeType || defaultApplyScope(result.value);
    emit('changed', result.value);
    if (refinementStatus === 'REFINEMENT_NO_MEANINGFUL_CHANGE_PRESERVED') {
      ElMessage.warning('本轮自动复审没有找到可靠的新改法，上一版结果已保留。可以补充“这版哪里还不满意”后继续校准，不会再把它当成失败或丢失上一版。');
    } else {
      refinementInstruction.value = '';
      ElMessage.success(`已生成第 ${calibrationIteration.value} 轮校准结果；请确认最新版后再应用`);
    }
  } catch (error: any) {
    analysisError.value = String(error?.message || '继续校准未完成，请稍后重试');
    result.value = await getCustomerServiceCalibration(result.value.id);
  } finally {
    refining.value = false;
  }
}

async function retryAnalysis() {
  if (!result.value) return;
  retrying.value = true;
  try {
    result.value = await analyzeCustomerServiceCalibration(result.value.id);
    applyScopeType.value = result.value.appliedScopeType || defaultApplyScope(result.value);
    analysisError.value = '';
    emit('changed', result.value);
    ElMessage.success('AI 校准分析已完成');
  } catch (error: any) {
    analysisError.value = String(error?.message || 'AI 分析仍未完成，请稍后重试');
    result.value = await getCustomerServiceCalibration(result.value.id);
  } finally {
    retrying.value = false;
  }
}

async function openKnowledgeCapture(version: CalibrationVersionView) {
  if (!result.value || !canCreateKnowledge.value) return;
  try {
    if (!knowledgeCollections.value.length) knowledgeCollections.value = await listCustomerServiceKnowledgeCollections();
    if (!knowledgeCollections.value.length) return ElMessage.warning('当前还没有知识库，请先在“业务知识”创建知识库后再沉淀');
    knowledgeCaptureVersion.value = version;
    Object.assign(knowledgeCaptureForm, {
      collectionId: defaultKnowledgeCaptureCollectionId(),
      mode: 'REGULAR',
      title: buildKnowledgeCaptureTitle(result.value.customerMessage, version.iteration),
      question: result.value.customerMessage || '',
      answer: version.suggestedReply || '',
      category: 'FAQ', status: 'DRAFT', priority: 200, minDelaySec: 1.8, maxDelaySec: 4.2,
    });
    knowledgeCaptureDialog.value = true;
  } catch (error:any) {
    ElMessage.error(error?.message || '知识库加载失败');
  }
}
function defaultKnowledgeCaptureCollectionId() {
  const record = result.value;
  if (!record) return knowledgeCollections.value[0]?.id || '';
  const accountMatch = knowledgeCollections.value.find((collection) => collection.bindings?.some((binding) => binding.status === 'ENABLED' && binding.targetType === 'ACCOUNT' && binding.targetKey === record.accountProfileId));
  if (accountMatch) return accountMatch.id;
  const roleMatch = knowledgeCollections.value.find((collection) => collection.bindings?.some((binding) => binding.status === 'ENABLED' && binding.targetType === 'ROLE' && binding.targetKey === record.merchantRoleId));
  return roleMatch?.id || knowledgeCollections.value[0]?.id || '';
}
function buildKnowledgeCaptureTitle(message:string, iteration:number) {
  const compact = String(message || '').replace(/\s+/g, ' ').trim();
  return `校准知识 · ${compact.slice(0, 60) || `第 ${iteration} 轮`}`;
}
async function saveKnowledgeCapture() {
  if (!result.value || !knowledgeCaptureVersion.value) return;
  const collectionId = knowledgeCaptureForm.collectionId;
  if (!collectionId) return ElMessage.warning('请选择目标知识库');
  const title = knowledgeCaptureForm.title.trim();
  const question = knowledgeCaptureForm.question.trim();
  const answer = knowledgeCaptureForm.answer.trim();
  if (!title || !question || !answer) return ElMessage.warning('请填写标题、客户问题和知识内容/固定答案');
  const version = knowledgeCaptureVersion.value;
  const calibrationSource = {
    recordId: result.value.id,
    analysisIteration: version.iteration,
    sourceType: result.value.sourceType,
    conversationId: result.value.conversationId,
    messageId: result.value.messageId,
    replyAttemptId: result.value.replyAttemptId,
    replyTraceId: result.value.replyTraceId,
    accountProfileId: result.value.accountProfileId,
    merchantRoleId: result.value.merchantRoleId,
    scenario: result.value.scenario,
    intent: result.value.intent,
    customerMessage: result.value.customerMessage,
    originalReply: result.value.originalReply,
    instruction: version.instruction,
    diagnosis: version.diagnosis,
    recommendations: version.recommendations,
    tuningDirectives: version.tuningDirectives,
    problemTypes: result.value.problemTypes,
    problemDescription: result.value.problemDescription,
    userSuggestion: result.value.userSuggestion,
    analyzedAt: version.analyzedAt,
    aiModel: version.aiModel,
  };
  const base = {
    scopeType: 'COLLECTION' as const, scopeKey: collectionId, collectionId,
    title, question, content: answer,
    entityKey: null, aliases: [] as string[], references: [] as never[],
    sourceType: 'CALIBRATION_DRAFT' as const,
    sourceReference: `calibration:${result.value.id}:iteration:${version.iteration}`,
    effectiveFrom: null, effectiveTo: null, freshnessPolicy: null,
    status: knowledgeCaptureForm.status,
  };
  knowledgeCaptureSaving.value = true;
  try {
    if (knowledgeCaptureForm.mode === 'FIXED_QA') {
      const minMs = Math.round(Math.max(.5, Math.min(8, Number(knowledgeCaptureForm.minDelaySec) || 1.8)) * 1000);
      const maxMs = Math.round(Math.max(.5, Math.min(8, Number(knowledgeCaptureForm.maxDelaySec) || 4.2)) * 1000);
      await createCustomerServiceKnowledgeEntry({
        ...base, category:'FAQ', tags:['固定问答','校准沉淀'], entityType:'FIXED_QA', authorityLevel:'BUSINESS_FACT',
        structuredData:{ calibrationSource, fixedQa:{ schemaVersion:2, matchType:'FUZZY', triggerPhrases:[question], requiredKeywords:[], excludedKeywords:[], priority:Math.max(0,Math.min(1000,Math.trunc(Number(knowledgeCaptureForm.priority)||0))), loadingDelay:{minMs:Math.min(minMs,maxMs),maxMs:Math.max(minMs,maxMs)} } }
      });
      ElMessage.success(`第 ${version.iteration} 轮已保存为固定答案直出知识；命中后将跳过模型`);
    } else {
      await createCustomerServiceKnowledgeEntry({
        ...base, category:knowledgeCaptureForm.category, tags:['校准沉淀'], entityType:'GENERIC', authorityLevel:'REFERENCE_ONLY', structuredData:{ calibrationSource }
      });
      ElMessage.success(`第 ${version.iteration} 轮已保存为常规知识草稿/条目；不会自动变成固定话术`);
    }
    knowledgeCaptureDialog.value = false;
  } catch (error:any) {
    ElMessage.error(error?.message || '校准内容转知识失败');
  } finally { knowledgeCaptureSaving.value = false; }
}

async function applyToTuning() {
  const latest = calibrationVersions.value[calibrationVersions.value.length - 1];
  if (!latest) return;
  await applyCalibrationVersion(latest);
}

async function applyCalibrationVersion(version: CalibrationVersionView) {
  if (!result.value || !canApplyCalibrationVersion.value) return;
  const expandingToRole = Boolean(effectiveAccountProfileId.value) && applyScopeType.value.startsWith('ROLE_');
  if (expandingToRole) {
    const impact = props.replySource?.scopeImpact?.roleScope;
    try {
      await ElMessageBox.confirm(
        `第 ${version.iteration} 轮将按当前角色级范围保存为共享策略候选，可能影响同角色账号 ${impact?.accountCount ?? 0} 个、机器人 ${impact?.robotCount ?? 0} 个。本次不会直接扩大生效，后续仍需全量回归和人工发布。`,
        '确认扩大校准范围',
        { type: 'warning', confirmButtonText: `应用第 ${version.iteration} 轮`, cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
  }
  applying.value = true;
  applyingCalibrationIteration.value = version.iteration;
  try {
    const applied = await applyCustomerServiceCalibrationToTuning(
      result.value.id,
      applyScopeType.value,
      expandingToRole,
      version.iteration
    );
    result.value = applied.record;
    applyScopeType.value = applied.record.appliedScopeType || applyScopeType.value;
    currentReplyApplication.value = applied.currentReply;
    emit('changed', applied.record);
    if (applied.currentReply?.applied) emit('reply-applied', applied.currentReply);
    const appliedIteration = applied.appliedAnalysisIteration || version.iteration;
    const longTermMessage = isImmediateScopeType(applied.record.appliedScopeType) && applied.profile?.status === 'ACTIVE'
      ? `第 ${appliedIteration} 轮校准已立即生效；同一角色、身份/背景和账号的新会话会自动继承`
      : `第 ${appliedIteration} 轮已保存为角色级共享策略候选；扩大生效仍需回归并发布`;
    ElMessage.success(applied.currentReply?.applied
      ? `${longTermMessage}；当前测试回复已同步替换为第 ${appliedIteration} 轮建议回复`
      : longTermMessage);
    if (applied.currentReply?.applicable && !applied.currentReply.applied) {
      showCurrentReplyApplicationNotice(applied.currentReply);
    }
  } finally {
    applying.value = false;
    applyingCalibrationIteration.value = null;
  }
}

function calibrationVersionApplyLabel(version: CalibrationVersionView) {
  if (appliedAnalysisIteration.value === version.iteration) return `第 ${version.iteration} 轮已生效`;
  if (result.value?.status === 'APPLIED_TUNING') return `切换为第 ${version.iteration} 轮并生效`;
  return selectedScopeIsImmediate.value
    ? `应用第 ${version.iteration} 轮并立即生效`
    : `保存第 ${version.iteration} 轮为共享策略候选`;
}

async function applyCurrentReply() {
  if (!result.value) return;
  applyingCurrentReply.value = true;
  try {
    const application = await applyCustomerServiceCalibrationCurrentTestReply(result.value.id);
    currentReplyApplication.value = application;
    if (application.applied) {
      emit('reply-applied', application);
      const longTermApplied = result.value?.status === 'APPLIED_TUNING';
      ElMessage.success(application.reason === 'ALREADY_APPLIED'
        ? '当前测试回复已经是校准版本'
        : longTermApplied
          ? '建议回复已替换当前测试消息；后续对话将以该版本作为历史'
          : '建议回复已替换当前测试消息；这次人工替换不会自动发布长期校准规则');
    } else {
      showCurrentReplyApplicationNotice(application);
    }
  } finally {
    applyingCurrentReply.value = false;
  }
}

function showCurrentReplyApplicationNotice(application: CustomerServiceCalibrationCurrentReplyApplication) {
  const messages: Record<CustomerServiceCalibrationCurrentReplyApplication['reason'], string> = {
    APPLIED: '建议回复已应用到当前测试消息。',
    ALREADY_APPLIED: '当前测试回复已经是校准版本。',
    NOT_TEST_SOURCE: '该校准不是测试会话来源，只保留长期校准规则，不改写历史回复。',
    TARGET_NOT_CURRENT: '目标回复后已经出现新的对话内容。为避免把后续上下文变成与新历史不一致的状态，本次不直接倒改历史；当前最后一轮回复仍可由管理员直接替换。',
    TARGET_NOT_FOUND: '长期校准已经保存，但没有找到可安全替换的当前测试回复。',
    STATE_TARGET_NOT_FOUND: '长期校准已经保存，但当前会话状态无法与目标回复安全对齐，因此没有替换历史消息。',
    SESSION_NOT_FOUND: '长期校准已经保存，但对应测试会话已不存在或无法访问。',
    SESSION_ARCHIVED: '长期校准已经保存，但对应测试会话已归档，不能再改写其中的回复。',
    APPLY_FAILED: '长期校准已经保存，但当前回复同步失败；可刷新后在本窗口重试“应用建议回复到当前测试消息”。'
  };
  const message = messages[application.reason] || '长期校准已经保存，但当前测试回复未被替换。';
  if (application.reason === 'NOT_TEST_SOURCE') ElMessage.info(message);
  else ElMessage.warning(message);
}

function close() { emit('update:modelValue', false); }
async function goToTuning() {
  close();
  await router.push('/customer-service/simulation');
}
function deliveryDirectiveLabel(delivery: CustomerServiceTuningDirectives['delivery']) {
  const mode = delivery.mode === 'SEQUENTIAL' ? '分成多条顺序发送' : delivery.mode === 'SINGLE' ? '合并为一条发送' : '按内容自动判断';
  const delay = delivery.minDelayMs !== null || delivery.maxDelayMs !== null
    ? `，段间约 ${delivery.minDelayMs ?? 0}～${delivery.maxDelayMs ?? delivery.minDelayMs ?? 0}ms`
    : '';
  return `${mode}${delivery.maxSegments ? `，最多 ${delivery.maxSegments} 条` : ''}${delay}`;
}
function configScopeLabel(scope: string) { return ({ ROLE_PROTOTYPE: '角色原型', MERCHANT_ROLE: '客服角色', ROLE_MODULE: '角色模块', INDUSTRY_CAPABILITY: '行业能力', RESPONSE_RULE: '回复与流程', QUALITY_RULE: '质量规则', GENERATION_PROMPT: '生成约束', UNDERSTANDING_RULE: '意图理解机制' } as Record<string, string>)[scope] || scope; }
function priorityTag(priority: string): 'danger' | 'warning' | 'info' { return priority === 'HIGH' ? 'danger' : priority === 'MEDIUM' ? 'warning' : 'info'; }
function buildCalibrationVersions(record: CustomerServiceCalibrationRecord | null): CalibrationVersionView[] {
  if (!record?.aiDiagnosis || !record.suggestedReply) return [];
  const diagnostics = asPlainRecord(record.aiAnalysisDiagnostics);
  const rawHistory = Array.isArray(diagnostics.refinementHistory) ? diagnostics.refinementHistory : [];
  const historySchemaVersion = Number(diagnostics.refinementHistorySchemaVersion || 0);
  const versions: CalibrationVersionView[] = [];
  const seen = new Set<string>();

  for (const [historyIndex, raw] of rawHistory.entries()) {
    const entry = asPlainRecord(raw);
    const suggestedReply = String(entry.suggestedReply || '').trim();
    if (!suggestedReply) continue;
    const analyzedAt = stringValue(entry.analyzedAt);
    const fingerprint = calibrationVersionFingerprint(analyzedAt, suggestedReply);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    versions.push({
      key: `history-${versions.length + 1}-${fingerprint}`,
      iteration: versions.length + 1,
      latest: false,
      instruction: historySchemaVersion >= 2
        ? stringValue(entry.instruction)
        : historyIndex === 0
          ? (record.improvementMode === 'GUIDED' ? record.userSuggestion : null)
          : stringValue(asPlainRecord(rawHistory[historyIndex - 1]).instruction),
      analyzedAt,
      aiModel: stringValue(entry.aiModel),
      diagnosis: asPlainRecord(entry.diagnosis) as CustomerServiceCalibrationRecord['aiDiagnosis'],
      recommendations: Array.isArray(entry.recommendations)
        ? entry.recommendations as CustomerServiceCalibrationRecord['aiRecommendations']
        : [],
      tuningDirectives: Object.keys(asPlainRecord(entry.tuningDirectives)).length
        ? entry.tuningDirectives as CustomerServiceTuningDirectives
        : null,
      suggestedReply,
    });
  }

  const latestAnalyzedAt = record.analyzedAt || null;
  const latestFingerprint = calibrationVersionFingerprint(latestAnalyzedAt, record.suggestedReply);
  const latestInstruction = diagnostics.analysisMode === 'REFINEMENT' && diagnostics.finalStatus === 'SUCCESS'
    ? stringValue(diagnostics.refinementInstruction)
    : diagnostics.analysisMode === 'INITIAL' && record.improvementMode === 'GUIDED'
      ? record.userSuggestion
      : null;
  const existingLatest = versions.find((version) => calibrationVersionFingerprint(version.analyzedAt, version.suggestedReply) === latestFingerprint);
  if (existingLatest) {
    existingLatest.latest = true;
    existingLatest.instruction = latestInstruction || existingLatest.instruction;
    existingLatest.diagnosis = record.aiDiagnosis;
    existingLatest.recommendations = record.aiRecommendations || [];
    existingLatest.tuningDirectives = record.tuningDirectives;
    existingLatest.suggestedReply = record.suggestedReply;
    existingLatest.analyzedAt = latestAnalyzedAt;
    existingLatest.aiModel = record.aiModel;
  } else {
    versions.push({
      key: `latest-${record.revision}-${latestFingerprint}`,
      iteration: versions.length + 1,
      latest: true,
      instruction: latestInstruction,
      analyzedAt: latestAnalyzedAt,
      aiModel: record.aiModel,
      diagnosis: record.aiDiagnosis,
      recommendations: record.aiRecommendations || [],
      tuningDirectives: record.tuningDirectives,
      suggestedReply: record.suggestedReply,
    });
  }

  versions.forEach((version, index) => {
    version.iteration = index + 1;
    version.latest = index === versions.length - 1;
  });
  return versions;
}

function asPlainRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function calibrationVersionFingerprint(analyzedAt: string | null, reply: string) {
  const normalizedReply = String(reply || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  return `${analyzedAt || ''}|${normalizedReply.slice(0, 160)}`;
}

async function copyCalibrationReply(reply: string) {
  if (!reply) return;
  await navigator.clipboard.writeText(reply);
  ElMessage.success('建议回复已复制');
}

</script>

<style scoped>
@media (max-width: 767px) {
  :deep(.calibration-feedback-dialog .el-dialog__header) {
    margin: 0;
    padding: 18px 18px 14px;
    border-bottom: 1px solid #e8eef7;
    background: linear-gradient(135deg, #f6fffb 0%, #f4f8ff 100%);
  }

  :deep(.calibration-feedback-dialog .el-dialog__body) {
    padding: 16px;
    background: #f6f8fc;
  }

  :deep(.calibration-feedback-dialog .el-dialog__footer) {
    position: sticky;
    bottom: 0;
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid #e8eef7;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
  }

  :deep(.calibration-feedback-dialog .el-checkbox-group) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  :deep(.calibration-feedback-dialog .el-checkbox) {
    width: 100%;
    height: auto;
    min-height: 40px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #dfe7f1;
    border-radius: 10px;
    background: #fff;
  }
}
</style>
