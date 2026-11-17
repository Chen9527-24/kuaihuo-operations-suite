<template>
  <el-dialog v-model="visible" title="店铺固定回复" width="1180px" top="4vh" destroy-on-close>
    <el-alert
      type="info"
      :closable="false"
      title="固定回复适合店铺口径稳定、无需实时查单的问题。规则命中后会直接返回配置内容，不调用 DeepSeek，也不会被 AI 改写；订单状态、物流节点、退款到账等必须查实时信息的问题，请保留给 AI 兜底或后续业务系统查询。"
    />

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div class="text-sm text-slate-600 dark:text-slate-300">
        当前机器人：<span class="font-medium text-slate-800 dark:text-slate-100">{{ robot?.name || '--' }}</span>
        <span class="mx-2 text-slate-300">|</span>
        已配置 {{ rules.length }} 条
      </div>
      <div class="flex flex-wrap gap-2">
        <input ref="fileInputRef" type="file" accept=".xlsx,.xls" class="hidden" @change="handleImportFile" />
        <el-button @click="downloadImportTemplate">下载导入模板</el-button>
        <el-button :disabled="!rules.length" @click="exportRules">导出当前规则</el-button>
        <el-button :loading="ruleTestLoading" @click="openRuleTest">规则命中测试</el-button>
        <el-button :loading="parsingImport" @click="fileInputRef?.click()">导入 Excel</el-button>
        <el-button v-if="canEdit" type="primary" @click="openCreate">新增固定回复</el-button>
      </div>
    </div>

    <div class="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
      优先级数字越大越先命中；同优先级时，精确匹配优先于包含匹配，包含匹配优先于关键词组合。导入时会做重复条件校验，任一条异常都不会写入任何数据。
    </div>

    <el-table v-loading="loading" :data="rules" row-key="id" stripe class="mt-4" max-height="520">
      <el-table-column type="index" label="#" width="56" />
      <el-table-column label="规则" min-width="170">
        <template #default="{ row }">
          <div class="font-medium text-slate-800 dark:text-slate-100">{{ row.name }}</div>
          <div class="mt-1 text-xs text-slate-500">{{ channelLabel(row.channel) }} · {{ matchTypeLabel(row.matchType) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="命中条件" min-width="260">
        <template #default="{ row }">
          <div v-if="row.triggerPhrases.length" class="line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">触发：{{ row.triggerPhrases.join('、') }}</div>
          <div v-if="row.requiredKeywords.length" class="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">必须同时有：{{ row.requiredKeywords.join('、') }}</div>
          <div v-if="row.excludedKeywords.length" class="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">排除：{{ row.excludedKeywords.join('、') }}</div>
        </template>
      </el-table-column>
      <el-table-column label="固定回复" min-width="360">
        <template #default="{ row }"><div class="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{{ row.replyContent }}</div></template>
      </el-table-column>
      <el-table-column label="类型 / 优先级" width="150">
        <template #default="{ row }">
          <div>{{ replyTypeLabel(row.replyType) }}</div>
          <div class="mt-1 text-xs text-slate-500">优先级 {{ row.priority }}</div>
        </template>
      </el-table-column>
      <el-table-column label="命中（测试）" width="142">
        <template #default="{ row }">
          <div class="text-sm text-slate-700 dark:text-slate-200">{{ row.matchCount || 0 }} 次</div>
          <div class="mt-1 text-xs text-slate-400">{{ row.lastMatchedAt ? formatDateTime(row.lastMatchedAt) : '暂未命中' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="94"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="128" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canEdit" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canEdit" link type="danger" @click="removeRule(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!loading && !rules.length" class="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm leading-6 text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
      暂无固定回复。可以先下载模板，按店铺真实做法修改后导入；也可以手动新增一条，例如“修改收货地址”。
    </div>

    <el-dialog v-model="formVisible" append-to-body :title="editingRule ? '编辑固定回复' : '新增固定回复'" width="760px" destroy-on-close>
      <div v-if="!editingRule" class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div><div class="text-sm font-semibold text-slate-700">先看一条固定回复参考</div><div class="mt-1 text-xs text-slate-500">样例默认停用，只写入当前表单；请按店铺真实处理方式修改后再决定是否启用。</div></div>
        <SampleFillButton label="填入固定回复样例" :has-content="hasRuleContent" @fill="fillRuleSample" />
      </div>
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" class="app-scrollbar max-h-[70vh] overflow-y-auto pr-2">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <el-form-item label="规则名称" prop="name">
            <el-input v-model="form.name" maxlength="100" show-word-limit placeholder="例如：修改收货地址" />
          </el-form-item>
          <el-form-item label="适用渠道" prop="channel">
            <el-select v-model="form.channel" class="w-full">
              <el-option label="当前机器人渠道" :value="robotChannel" />
              <el-option label="通用" value="BOTH" />
            </el-select>
          </el-form-item>
        </div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <el-form-item label="匹配方式" prop="matchType">
            <el-select v-model="form.matchType" class="w-full">
              <el-option label="精确匹配：整条消息完全一致" value="EXACT" />
              <el-option label="包含匹配：含任一触发问法" value="CONTAINS" />
              <el-option label="关键词组合：必须同时出现多个词" value="KEYWORD_COMBINATION" />
            </el-select>
          </el-form-item>
          <el-form-item label="回复类型" prop="replyType">
            <el-select v-model="form.replyType" class="w-full">
              <el-option label="直接回复" value="DIRECT_REPLY" />
              <el-option label="固定模板 + 收集信息" value="COLLECT_INFO" />
              <el-option label="固定模板 + 建议人工跟进" value="HANDOFF" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item v-if="form.matchType !== 'KEYWORD_COMBINATION'" label="触发问法" prop="triggerPhrasesText">
          <el-input v-model="form.triggerPhrasesText" placeholder="多个问法用 ｜ 或逗号分隔，例如：改地址｜地址填错｜修改收货地址" />
          <div class="mt-1 text-xs leading-5 text-slate-500">只要客户消息包含其中任意一个问法就会命中；每个问法建议至少 2 个字。</div>
        </el-form-item>
        <el-form-item v-else label="必须包含词" prop="requiredKeywordsText">
          <el-input v-model="form.requiredKeywordsText" placeholder="多个词用 ｜ 或逗号分隔，例如：地址｜修改" />
          <div class="mt-1 text-xs leading-5 text-slate-500">关键词组合要求客户消息同时包含全部词，至少填 2 个，适合避免“地址”单词误命中。</div>
        </el-form-item>
        <el-form-item label="排除词（可选）">
          <el-input v-model="form.excludedKeywordsText" placeholder="多个词用 ｜ 或逗号分隔，例如：退货地址｜售后地址" />
          <div class="mt-1 text-xs leading-5 text-slate-500">客户消息含任一排除词时，当前规则不会命中。</div>
        </el-form-item>

        <el-form-item label="固定回复内容" prop="replyContent">
          <el-input v-model="form.replyContent" type="textarea" :rows="5" maxlength="3000" show-word-limit placeholder="命中后将原样发送，不会调用 DeepSeek 改写。请按店铺真实处理方式写，不要承诺无法保证的结果。" />
        </el-form-item>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <el-form-item label="优先级" prop="priority"><el-input-number v-model="form.priority" :min="0" :max="100000" class="w-full" /></el-form-item>
          <el-form-item label="启用"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
          <el-form-item label="说明（可选）"><el-input v-model="form.remark" maxlength="1000" placeholder="例如：订单地址变更" /></el-form-item>
        </div>
        <el-alert
          v-if="precheckResult?.exactConflict"
          class="mt-1"
          type="error"
          :closable="false"
          :title="`存在完全相同的命中条件：${precheckResult.exactConflict.name}，不能保存为两条重复规则。`"
        />
        <el-alert
          v-else-if="precheckResult?.potentialConflicts?.length"
          class="mt-1"
          type="warning"
          :closable="false"
          :title="`检测到 ${precheckResult.potentialConflicts.length} 条可能同时命中的规则；系统会按优先级和匹配方式选择一条。`"
          :description="precheckResult.potentialConflicts.map((item) => `${item.name}（优先级 ${item.priority}）：${item.reason}`).join('；')"
        />
        <el-alert
          v-else-if="precheckResult?.valid"
          class="mt-1"
          type="success"
          :closable="false"
          title="未发现完全重复或可能覆盖当前规则的命中条件。"
        />
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button :loading="prechecking" @click="checkRuleConflicts">检查冲突</el-button>
        <el-button type="primary" :loading="saving" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ruleTestVisible" append-to-body title="固定回复命中测试" width="780px" destroy-on-close>
      <el-alert type="info" :closable="false" title="这里只测试固定回复规则是否命中，不会调用 DeepSeek、不会写入测试聊天记录，也不会增加规则命中次数。" />
      <el-input v-model="ruleTestMessage" class="mt-4" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="输入一条模拟客户消息，例如：快递几天没更新了，怎么回事？" />
      <div class="mt-3 flex justify-end gap-2">
        <SampleFillButton label="填入测试消息" :has-content="Boolean(ruleTestMessage.trim())" @fill="fillRuleTestSample" />
        <el-button type="primary" :loading="ruleTestLoading" @click="runRuleTest">开始匹配</el-button>
      </div>
      <div v-if="ruleTestResult" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/50">
        <template v-if="ruleTestResult.selected">
          <div class="font-medium text-emerald-700 dark:text-emerald-300">将命中：{{ ruleTestResult.selected.name }}</div>
          <div class="mt-2 text-slate-600 dark:text-slate-300">匹配方式：{{ matchTypeLabel(ruleTestResult.selected.matchType) }} · 优先级 {{ ruleTestResult.selected.priority }}</div>
          <div v-if="ruleTestResult.selected.matchedPhrases.length" class="mt-1 text-xs text-slate-500">命中词：{{ ruleTestResult.selected.matchedPhrases.join('、') }}</div>
          <div class="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 leading-6 text-slate-700 dark:bg-slate-800 dark:text-slate-100">{{ ruleTestResult.selected.replyContent }}</div>
        </template>
        <template v-else>
          <div class="font-medium text-slate-700 dark:text-slate-200">未命中固定回复</div>
          <div class="mt-1 text-slate-500">正式聊天时将继续按行业范围、场景与 DeepSeek 兜底规则处理。</div>
        </template>
        <div v-if="ruleTestResult.candidates.length > 1" class="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
          其他候选：{{ ruleTestResult.candidates.slice(1).map((item) => `${item.name}（优先级 ${item.priority}）`).join('、') }}
        </div>
      </div>
      <template #footer><el-button @click="ruleTestVisible = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="importPreviewVisible" append-to-body title="确认导入固定回复" width="1060px" destroy-on-close>
      <el-alert type="warning" :closable="false" title="确认导入前会再次由后端校验：若存在重复条件、必填项缺失或不符合当前机器人渠道的规则，整批不会写入。" />
      <div class="mt-3 text-sm text-slate-600">已从 Excel 识别 {{ importPreviewRules.length }} 条规则。</div>
      <el-table :data="importPreviewRules" class="mt-3" max-height="420" stripe>
        <el-table-column type="index" label="#" width="56" />
        <el-table-column prop="name" label="规则名称" min-width="160" />
        <el-table-column label="匹配条件" min-width="260"><template #default="{ row }">{{ importConditionText(row) }}</template></el-table-column>
        <el-table-column prop="replyContent" label="固定回复" min-width="360"><template #default="{ row }"><div class="line-clamp-2 whitespace-pre-wrap">{{ row.replyContent }}</div></template></el-table-column>
        <el-table-column label="优先级" width="100"><template #default="{ row }">{{ row.priority }}</template></el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="importPreviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="confirmImport">确认导入</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import ExcelJS from 'exceljs';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { getRequestErrorMessage } from '@/api/core/http';
import * as industryAiApi from '@/api/modules/industryAi';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type {
  IndustryAiChannel,
  IndustryAiFixedReplyMatchType,
  IndustryAiFixedReplyRule,
  IndustryAiFixedReplyRulePayload,
  IndustryAiFixedReplyRulePrecheckResult,
  IndustryAiFixedReplyRulePreviewResult,
  IndustryAiFixedReplyType,
  IndustryAiRobot
} from '@/api/modules/industryAi';

type RuleForm = {
  name: string;
  channel: IndustryAiChannel;
  matchType: IndustryAiFixedReplyMatchType;
  triggerPhrasesText: string;
  requiredKeywordsText: string;
  excludedKeywordsText: string;
  replyType: IndustryAiFixedReplyType;
  replyContent: string;
  priority: number;
  enabled: boolean;
  remark: string;
};

const props = defineProps<{ modelValue: boolean; robot?: IndustryAiRobot | null; canEdit?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>();

const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });
const robotChannel = computed<IndustryAiChannel>(() => props.robot?.channel || 'DM');
const rules = ref<IndustryAiFixedReplyRule[]>([]);
const loading = ref(false);
const saving = ref(false);
const parsingImport = ref(false);
const importing = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const formVisible = ref(false);
const formRef = ref<FormInstance>();
const editingRule = ref<IndustryAiFixedReplyRule | null>(null);
const form = reactive<RuleForm>(createEmptyForm());
const hasRuleContent = computed(() => Boolean(
  form.name.trim() || form.triggerPhrasesText.trim() || form.requiredKeywordsText.trim()
  || form.excludedKeywordsText.trim() || form.replyContent.trim() || form.remark.trim()
));
const importPreviewVisible = ref(false);
const importPreviewRules = ref<IndustryAiFixedReplyRulePayload[]>([]);
const prechecking = ref(false);
const precheckResult = ref<IndustryAiFixedReplyRulePrecheckResult | null>(null);
const ruleTestVisible = ref(false);
const ruleTestLoading = ref(false);
const ruleTestMessage = ref('');
const ruleTestResult = ref<IndustryAiFixedReplyRulePreviewResult | null>(null);

const formRules: FormRules<RuleForm> = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  matchType: [{ required: true, message: '请选择匹配方式', trigger: 'change' }],
  replyType: [{ required: true, message: '请选择回复类型', trigger: 'change' }],
  replyContent: [{ required: true, message: '请输入固定回复内容', trigger: 'blur' }]
};

watch(
  () => [props.modelValue, props.robot?.id] as const,
  ([open]) => {
    if (open) void fetchRules();
  },
  { immediate: true }
);

async function fetchRules(options: { silent?: boolean } = {}) {
  const robotId = props.robot?.id;
  if (!robotId) {
    rules.value = [];
    return false;
  }
  loading.value = true;
  try {
    const loadedRules = await industryAiApi.listIndustryAiFixedReplyRules(robotId);
    // 防止切换机器人或关闭弹窗后，前一个异步请求覆盖当前机器人列表。
    if (props.robot?.id !== robotId) return false;
    rules.value = sortRules(loadedRules);
    return true;
  } catch (error) {
    if (!options.silent) {
      ElMessage.error(getRequestErrorMessage(error) || '加载店铺固定回复失败，请刷新后重试');
    }
    return false;
  } finally {
    loading.value = false;
  }
}

function sortRules(items: IndustryAiFixedReplyRule[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = Number(right.priority || 0) - Number(left.priority || 0);
    if (priorityDelta !== 0) return priorityDelta;
    return String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''));
  });
}

function upsertRules(nextRules: IndustryAiFixedReplyRule[]) {
  const byId = new Map(rules.value.map((item) => [item.id, item]));
  nextRules.forEach((item) => {
    if (item.id) byId.set(item.id, item);
  });
  rules.value = sortRules([...byId.values()]);
}

function openCreate() {
  editingRule.value = null;
  Object.assign(form, createEmptyForm());
  resetPrecheck();
  formVisible.value = true;
}

function fillRuleSample() {
  Object.assign(form, {
    ...createEmptyForm(),
    name: '修改收货地址（参考）',
    matchType: 'CONTAINS',
    triggerPhrasesText: '改地址｜修改收货地址｜地址填错了',
    excludedKeywordsText: '退货地址｜售后地址',
    replyType: 'COLLECT_INFO',
    replyContent: '可以，把订单号和新的收货地址发我，我先帮你核对订单进度。已经打包或发出的订单可能无法修改，最终以仓库处理结果为准。',
    priority: 200,
    enabled: false,
    remark: '虚构参考样例；请按店铺真实的地址修改流程调整。'
  });
  resetPrecheck();
  formRef.value?.clearValidate();
  ElMessage.success('固定回复样例已填入，当前默认停用');
}

function openEdit(rule: IndustryAiFixedReplyRule) {
  editingRule.value = rule;
  Object.assign(form, {
    name: rule.name,
    channel: rule.channel,
    matchType: rule.matchType,
    triggerPhrasesText: rule.triggerPhrases.join('｜'),
    requiredKeywordsText: rule.requiredKeywords.join('｜'),
    excludedKeywordsText: rule.excludedKeywords.join('｜'),
    replyType: rule.replyType,
    replyContent: rule.replyContent,
    priority: rule.priority,
    enabled: rule.enabled,
    remark: rule.remark || ''
  });
  resetPrecheck();
  formVisible.value = true;
}

function resetPrecheck() {
  precheckResult.value = null;
}

async function getRulePrecheck(showFeedback = false): Promise<IndustryAiFixedReplyRulePrecheckResult | null> {
  if (!props.robot?.id) return null;
  const payload = formToPayload();
  const localError = validatePayload(payload);
  if (localError) {
    ElMessage.warning(localError);
    return null;
  }
  prechecking.value = true;
  try {
    const result = await industryAiApi.precheckIndustryAiFixedReplyRule(props.robot.id, payload, editingRule.value?.id);
    precheckResult.value = result;
    if (showFeedback) {
      if (result.exactConflict) ElMessage.error(`存在完全重复的规则：${result.exactConflict.name}`);
      else if (result.potentialConflicts.length) ElMessage.warning(`发现 ${result.potentialConflicts.length} 条可能同时命中的规则，请确认优先级。`);
      else ElMessage.success('未发现规则冲突');
    }
    return result;
  } catch (error) {
    ElMessage.error(getRequestErrorMessage(error) || '检查规则冲突失败，请稍后重试');
    return null;
  } finally {
    prechecking.value = false;
  }
}

async function checkRuleConflicts() {
  await getRulePrecheck(true);
}

function openRuleTest() {
  ruleTestMessage.value = '';
  ruleTestResult.value = null;
  ruleTestVisible.value = true;
}

function fillRuleTestSample() {
  ruleTestMessage.value = '订单地址填错了，现在还能修改收货地址吗？';
  ruleTestResult.value = null;
}

async function runRuleTest() {
  if (!props.robot?.id) return;
  const messageContent = ruleTestMessage.value.trim();
  if (!messageContent) {
    ElMessage.warning('请输入一条模拟客户消息');
    return;
  }
  ruleTestLoading.value = true;
  try {
    ruleTestResult.value = await industryAiApi.previewIndustryAiFixedReplyRules(props.robot.id, messageContent);
  } catch (error) {
    ElMessage.error(getRequestErrorMessage(error) || '规则命中测试失败，请稍后重试');
  } finally {
    ruleTestLoading.value = false;
  }
}

async function saveRule() {
  if (!props.robot?.id) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const payload = formToPayload();
  const localError = validatePayload(payload);
  if (localError) {
    ElMessage.warning(localError);
    return;
  }
  const precheck = await getRulePrecheck(false);
  if (!precheck) return;
  if (precheck.exactConflict) {
    ElMessage.error(`存在完全重复的规则：${precheck.exactConflict.name}`);
    return;
  }
  if (precheck.potentialConflicts.length) {
    try {
      await ElMessageBox.confirm(
        `当前规则可能与 ${precheck.potentialConflicts.map((item) => `“${item.name}”`).join('、')} 同时命中。系统会按优先级和匹配方式选一条，仍要保存吗？`,
        '确认可能覆盖关系',
        { type: 'warning', confirmButtonText: '仍然保存', cancelButtonText: '返回调整' }
      );
    } catch {
      return;
    }
  }
  saving.value = true;
  try {
    const saved = editingRule.value?.id
      ? await industryAiApi.updateIndustryAiFixedReplyRule(props.robot.id, editingRule.value.id, payload)
      : await industryAiApi.createIndustryAiFixedReplyRule(props.robot.id, payload);

    // 先使用保存接口返回的实体更新本地列表，再静默回源校准；不会出现“保存成功但页面仍是空白”。
    upsertRules([saved]);
    formVisible.value = false;
    ElMessage.success(editingRule.value?.id ? '固定回复已保存' : '固定回复已新增');
    emit('changed');
    void fetchRules({ silent: true });
  } catch (error) {
    ElMessage.error(getRequestErrorMessage(error) || '保存固定回复失败，请稍后重试');
  } finally {
    saving.value = false;
  }
}

async function removeRule(rule: IndustryAiFixedReplyRule) {
  if (!props.robot?.id) return;
  try {
    await ElMessageBox.confirm(`删除“${rule.name}”后，后续消息将不再直接使用该固定回复。`, '确认删除', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await industryAiApi.removeIndustryAiFixedReplyRule(props.robot.id, rule.id);
    rules.value = rules.value.filter((item) => item.id !== rule.id);
    ElMessage.success('固定回复已删除');
    emit('changed');
    void fetchRules({ silent: true });
  } catch (error) {
    ElMessage.error(getRequestErrorMessage(error) || '删除固定回复失败，请稍后重试');
  }
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || parsingImport.value) return;
  parsingImport.value = true;
  try {
    const parsed = await parseRulesFromExcel(file);
    if (!parsed.length) {
      ElMessage.warning('表格中没有识别到有效的固定回复规则');
      return;
    }
    const invalidIndex = parsed.findIndex((item) => Boolean(validatePayload(item)));
    if (invalidIndex >= 0) {
      ElMessage.warning(`第 ${invalidIndex + 1} 条规则不完整：${validatePayload(parsed[invalidIndex])}`);
      return;
    }
    importPreviewRules.value = parsed;
    importPreviewVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '读取 Excel 失败');
  } finally {
    parsingImport.value = false;
  }
}

async function confirmImport() {
  if (!props.robot?.id || !importPreviewRules.value.length) return;
  importing.value = true;
  try {
    const result = await industryAiApi.importIndustryAiFixedReplyRules(props.robot.id, importPreviewRules.value);
    importPreviewVisible.value = false;
    importPreviewRules.value = [];

    // 导入接口返回的新建规则立即进入列表；即使网络瞬断导致后续刷新失败，也不会造成“导入成功却看不到数据”。
    upsertRules(result.rules);
    const refreshed = await fetchRules({ silent: true });
    const summary = result.skippedCount > 0
      ? `导入完成：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条完全相同的规则`
      : `已导入 ${result.createdCount} 条固定回复`;
    if (!refreshed && result.createdCount > 0) {
      ElMessage.warning(`${summary}；列表已使用本次返回数据展示，刷新页面后会再次同步`);
    } else {
      ElMessage.success(summary);
    }
    emit('changed');
  } catch (error) {
    ElMessage.error(getRequestErrorMessage(error) || '导入固定回复失败，请检查 Excel 内容后重试');
  } finally {
    importing.value = false;
  }
}

async function downloadImportTemplate() {
  const templateRows = getTemplateRows();
  await writeRulesWorkbook(templateRows, '店铺固定回复导入模板.xlsx');
}

async function exportRules() {
  if (!rules.value.length) return;
  const rows = rules.value.map((item) => ({
    name: item.name,
    channel: item.channel,
    matchType: item.matchType,
    triggerPhrases: item.triggerPhrases,
    requiredKeywords: item.requiredKeywords,
    excludedKeywords: item.excludedKeywords,
    replyContent: item.replyContent,
    replyType: item.replyType,
    priority: item.priority,
    enabled: item.enabled,
    remark: item.remark || ''
  }));
  await writeRulesWorkbook(rows, `店铺固定回复_${formatDate()}.xlsx`);
}

function createEmptyForm(): RuleForm {
  return {
    name: '',
    channel: robotChannel.value,
    matchType: 'CONTAINS',
    triggerPhrasesText: '',
    requiredKeywordsText: '',
    excludedKeywordsText: '',
    replyType: 'COLLECT_INFO',
    replyContent: '',
    priority: 100,
    enabled: true,
    remark: ''
  };
}

function formToPayload(): IndustryAiFixedReplyRulePayload {
  return {
    name: form.name.trim(),
    channel: form.channel,
    matchType: form.matchType,
    triggerPhrases: splitTerms(form.triggerPhrasesText),
    requiredKeywords: splitTerms(form.requiredKeywordsText),
    excludedKeywords: splitTerms(form.excludedKeywordsText),
    replyType: form.replyType,
    replyContent: form.replyContent.trim(),
    priority: Number(form.priority || 0),
    enabled: form.enabled,
    remark: form.remark.trim() || undefined
  };
}

function validatePayload(payload: IndustryAiFixedReplyRulePayload) {
  if (!payload.name) return '规则名称不能为空';
  if (!payload.replyContent) return '固定回复内容不能为空';
  if (payload.matchType === 'KEYWORD_COMBINATION' && payload.requiredKeywords.length < 2) return '关键词组合至少需要 2 个必须包含词';
  if (payload.matchType !== 'KEYWORD_COMBINATION' && !payload.triggerPhrases.length) return '精确/包含匹配至少需要 1 个触发问法';
  if (payload.triggerPhrases.some((item) => item.length < 2)) return '触发问法至少 2 个字，避免误命中';
  if (payload.channel !== 'BOTH' && payload.channel !== robotChannel.value) return '适用渠道必须与当前机器人一致或设置为通用';
  return '';
}

function splitTerms(value: string) {
  return Array.from(new Set(value.split(/[｜|，,;；\n]/).map((item) => item.trim()).filter(Boolean)));
}

function channelLabel(value?: string) {
  return value === 'COMMENT' ? '评论' : value === 'DM' ? '私信' : '通用';
}

function matchTypeLabel(value?: string) {
  if (value === 'EXACT') return '精确匹配';
  if (value === 'KEYWORD_COMBINATION') return '关键词组合';
  return '包含匹配';
}

function replyTypeLabel(value?: string) {
  if (value === 'HANDOFF') return '建议人工跟进';
  if (value === 'COLLECT_INFO') return '收集信息后核实';
  return '直接回复';
}

function importConditionText(row: IndustryAiFixedReplyRulePayload) {
  if (row.matchType === 'KEYWORD_COMBINATION') return `必须同时有：${row.requiredKeywords.join('、')}`;
  return `触发：${row.triggerPhrases.join('、')}`;
}

async function parseRulesFromExcel(file: File): Promise<IndustryAiFixedReplyRulePayload[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const headerRow = findHeaderRow(worksheet);
  const columns = buildHeaderMap(worksheet.getRow(headerRow));
  const nameCol = findColumn(columns, '规则名称', '名称');
  const matchCol = findColumn(columns, '匹配方式');
  const replyCol = findColumn(columns, '固定回复', '回复内容', '回复');
  if (!nameCol || !matchCol || !replyCol) throw new Error('Excel 缺少“规则名称、匹配方式、固定回复”列，请先下载导入模板');
  const channelCol = findColumn(columns, '适用渠道', '渠道');
  const triggerCol = findColumn(columns, '触发问法', '触发词');
  const requiredCol = findColumn(columns, '必须包含词', '关键词组合');
  const excludedCol = findColumn(columns, '排除词');
  const typeCol = findColumn(columns, '回复类型');
  const priorityCol = findColumn(columns, '优先级');
  const enabledCol = findColumn(columns, '是否启用', '启用');
  const remarkCol = findColumn(columns, '适用备注', '备注', '说明');
  const rows: IndustryAiFixedReplyRulePayload[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const name = cellText(row.getCell(nameCol));
    const replyContent = cellText(row.getCell(replyCol));
    if (!name && !replyContent) continue;
    rows.push({
      name,
      channel: normalizeChannel(channelCol ? cellText(row.getCell(channelCol)) : '') || robotChannel.value,
      matchType: normalizeMatchType(cellText(row.getCell(matchCol))),
      triggerPhrases: splitTerms(triggerCol ? cellText(row.getCell(triggerCol)) : ''),
      requiredKeywords: splitTerms(requiredCol ? cellText(row.getCell(requiredCol)) : ''),
      excludedKeywords: splitTerms(excludedCol ? cellText(row.getCell(excludedCol)) : ''),
      replyContent,
      replyType: normalizeReplyType(typeCol ? cellText(row.getCell(typeCol)) : ''),
      priority: priorityCol ? Math.max(0, Number.parseInt(cellText(row.getCell(priorityCol)), 10) || 100) : 100,
      enabled: enabledCol ? normalizeEnabled(cellText(row.getCell(enabledCol))) : true,
      remark: remarkCol ? cellText(row.getCell(remarkCol)) || undefined : undefined
    });
  }
  return rows;
}

async function writeRulesWorkbook(rows: Array<IndustryAiFixedReplyRulePayload>, filename: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('固定回复规则');
  const headers = ['规则名称', '适用渠道', '匹配方式', '触发问法（用｜分隔）', '必须包含词（用｜分隔）', '排除词（用｜分隔）', '固定回复', '回复类型', '优先级', '是否启用', '适用备注'];
  sheet.addRow(headers);
  rows.forEach((item) => {
    sheet.addRow([
      item.name,
      channelLabel(item.channel),
      matchTypeLabel(item.matchType),
      item.triggerPhrases.join('｜'),
      item.requiredKeywords.join('｜'),
      item.excludedKeywords.join('｜'),
      item.replyContent,
      replyTypeLabel(item.replyType),
      item.priority,
      item.enabled === false ? '否' : '是',
      item.remark || ''
    ]);
  });
  sheet.columns = [
    { width: 20 }, { width: 12 }, { width: 18 }, { width: 34 }, { width: 28 }, { width: 28 }, { width: 64 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 30 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, filename);
}

function getTemplateRows(): IndustryAiFixedReplyRulePayload[] {
  return [
    {
      name: '修改收货地址', channel: robotChannel.value, matchType: 'CONTAINS', triggerPhrases: ['改地址', '修改地址', '地址填错', '地址写错', '地址错了'], requiredKeywords: [], excludedKeywords: ['退货地址', '售后地址'], replyType: 'COLLECT_INFO', priority: 200, enabled: true,
      replyContent: '亲，麻烦把订单号和新的收货地址发我一下，我这边先帮您备注给仓库。要是订单已经在打包或发出了，可能会来不及改，具体以仓库处理结果为准哈。', remark: '按店铺实际是否可备注仓库调整。'
    },
    {
      name: '物流催件', channel: robotChannel.value, matchType: 'CONTAINS', triggerPhrases: ['物流没动', '快递没到', '催快递', '物流几天没动', '快递怎么还没到'], requiredKeywords: [], excludedKeywords: [], replyType: 'COLLECT_INFO', priority: 190, enabled: true,
      replyContent: '亲，麻烦把订单号发我一下，我这边先帮您催一下快递跟进；有消息会及时跟您说哈。', remark: '不承诺具体到货时间，按店铺实际可催件方式调整。'
    },
    {
      name: '商品破损', channel: robotChannel.value, matchType: 'CONTAINS', triggerPhrases: ['破损', '刚收到就是坏的', '商品坏了', '损坏了'], requiredKeywords: [], excludedKeywords: [], replyType: 'COLLECT_INFO', priority: 195, enabled: true,
      replyContent: '亲，麻烦把订单号和破损位置的照片或视频发我一下，商品和外包装先留着，我这边给您转售后核实处理哈。', remark: '不预设赔偿或换货结果。'
    },
    {
      name: '投诉未说明事项', channel: robotChannel.value, matchType: 'CONTAINS', triggerPhrases: ['我要投诉', '服务太差', '投诉你们', '太差了'], requiredKeywords: [], excludedKeywords: [], replyType: 'HANDOFF', priority: 260, enabled: true,
      replyContent: '亲，不好意思给您添麻烦了，麻烦把订单号发我一下；方便的话也说下是商品、物流还是售后哪边的问题，我马上帮您反馈核实。', remark: '不反问客户为什么生气。'
    },
    {
      name: '客户要求人工', channel: robotChannel.value, matchType: 'CONTAINS', triggerPhrases: ['人工客服', '转人工', '真人客服', '我要人工', '不要机器人'], requiredKeywords: [], excludedKeywords: [], replyType: 'HANDOFF', priority: 300, enabled: true,
      replyContent: '亲，可以的，麻烦把订单号和要处理的问题一并发我，我帮您转人工客服跟进哈。', remark: '尊重客户要求，不劝阻。'
    }
  ];
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount || 10); rowNumber += 1) {
    const map = buildHeaderMap(worksheet.getRow(rowNumber));
    if (findColumn(map, '规则名称', '名称') && findColumn(map, '匹配方式') && findColumn(map, '固定回复', '回复内容', '回复')) return rowNumber;
  }
  return 1;
}

function buildHeaderMap(row: ExcelJS.Row) {
  const map = new Map<string, number>();
  row.eachCell((cell, colNumber) => {
    const text = cellText(cell).replace(/\s+/g, '');
    if (text) map.set(text, colNumber);
  });
  return map;
}

function findColumn(map: Map<string, number>, ...names: string[]) {
  for (const name of names) {
    const value = map.get(name.replace(/\s+/g, ''));
    if (value) return value;
  }
  const lowerNames = names.map((item) => item.toLowerCase());
  for (const [key, value] of map.entries()) {
    const lower = key.toLowerCase();
    if (lowerNames.some((name) => lower.includes(name))) return value;
  }
  return 0;
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) return value.richText.map((item) => String(item.text ?? '')).join('').trim();
  if (typeof value === 'object' && 'result' in value && value.result != null) return String(value.result).trim();
  return String(value).trim();
}

function normalizeChannel(value: string): IndustryAiChannel | '' {
  const normalized = value.trim().toUpperCase();
  if (['DM', '私信'].includes(normalized)) return 'DM';
  if (['COMMENT', '评论'].includes(normalized)) return 'COMMENT';
  if (['BOTH', '通用', '全部'].includes(normalized)) return 'BOTH';
  return '';
}

function normalizeMatchType(value: string): IndustryAiFixedReplyMatchType {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'EXACT' || value.includes('精确')) return 'EXACT';
  if (normalized === 'KEYWORD_COMBINATION' || value.includes('组合')) return 'KEYWORD_COMBINATION';
  return 'CONTAINS';
}

function normalizeReplyType(value: string): IndustryAiFixedReplyType {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'HANDOFF' || value.includes('人工')) return 'HANDOFF';
  if (normalized === 'COLLECT_INFO' || value.includes('收集')) return 'COLLECT_INFO';
  return 'DIRECT_REPLY';
}

function normalizeEnabled(value: string) {
  return !['否', '不启用', '停用', '禁用', 'false', '0', 'no'].includes(value.trim().toLowerCase());
}

function downloadBlob(buffer: ArrayBuffer | BlobPart, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const pad = (item: number) => String(item).padStart(2, '0');
  return `${date.getMonth() + 1}-${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}
</script>
