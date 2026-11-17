<template>
  <el-dialog v-model="visible" :title="`${moduleTitle}提示词配置`" width="1120px" destroy-on-close>
    <div class="space-y-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <el-input v-model="keyword" class="md:max-w-xs" placeholder="搜索配置名称 / 说明" clearable @keyup.enter="fetchList(true)">
          <template #append>
            <el-button @click="fetchList(true)">搜索</el-button>
          </template>
        </el-input>
        <el-button type="primary" @click="openCreate">新增提示词</el-button>
      </div>

      <el-table v-loading="loading" :data="items" stripe row-key="id" height="420">
        <el-table-column prop="name" label="配置名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '--' }}</template>
        </el-table-column>
        <el-table-column label="工作流模式" min-width="150">
          <template #default="{ row }">
            <el-tag :type="workflowTagType(row.workflowMode)">{{ workflowModeLabel(row.workflowMode) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="工作流 ID" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ row.workflowMode === 'DEFAULT' ? '使用系统默认配置' : row.workflowId || '--' }}</template>
        </el-table-column>
        <el-table-column label="平台参数" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.platformLabel || defaultPlatformLabel }}</template>
        </el-table-column>
        <el-table-column label="回复条数" width="100" align="center">
          <template #default="{ row }">{{ row.replyLength || '--' }}</template>
        </el-table-column>
        <el-table-column v-if="module === 'dm'" label="最大消息数" width="110" align="center">
          <template #default="{ row }">{{ row.maxMsgCount || '--' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'DISABLED' ? 'info' : 'success'" effect="light">{{ row.status === 'DISABLED' ? '已禁用' : '启用中' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt || row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <CrudPaginationBar
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @update:current-page="page = $event; fetchList()"
        @update:page-size="pageSize = $event; fetchList(true)"
      />
    </div>

    <el-dialog v-model="formVisible" :title="formMode === 'create' ? '新增提示词配置' : '编辑提示词配置'" width="920px" append-to-body destroy-on-close>
      <div class="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
        工作流跟随提示词配置保存。机器人选择这条配置后，会同时切换对应工作流。纯聊天模式只传用户当前消息，不会附带账号定位、业务简介、转化目标、要求词等商业参数。
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="132px">
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="工作流模式" prop="workflowMode">
            <el-select v-model="form.workflowMode" class="w-full">
              <el-option label="现有业务工作流（系统默认）" value="DEFAULT" />
              <el-option label="自定义结构化工作流" value="STRUCTURED" />
              <el-option label="纯聊天工作流" value="PLAIN_CHAT" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="form.workflowMode !== 'DEFAULT'" label="工作流 ID" prop="workflowId">
            <el-input v-model="form.workflowId" placeholder="填写自己的工作流 ID" />
          </el-form-item>
          <el-form-item v-if="module === 'dm' && form.workflowMode === 'STRUCTURED'" label="智能体 ID" prop="workflowBotId">
            <el-input v-model="form.workflowBotId" placeholder="留空则继续使用系统默认私信智能体 ID" />
          </el-form-item>
          <el-form-item v-if="form.workflowMode === 'PLAIN_CHAT'" label="输入变量名" prop="workflowInputKey">
            <el-input v-model="form.workflowInputKey" placeholder="input" />
          </el-form-item>
        </div>
        <el-alert
          v-if="form.workflowMode === 'PLAIN_CHAT'"
          class="mb-4"
          type="success"
          :closable="false"
          show-icon
          title="纯聊天模式不会调用现有商业化提示词协议；私信的 Coze conversation_id 上下文也不会沿用。"
        />
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="配置名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入配置名称" />
          </el-form-item>
          <el-form-item label="平台名称" prop="platformLabel">
            <el-input v-model="form.platformLabel" :placeholder="defaultPlatformLabel" />
          </el-form-item>
          <el-form-item label="回复条数" prop="replyLength">
            <el-input-number v-model="form.replyLength" :min="1" :max="10" class="w-full" />
          </el-form-item>
          <el-form-item v-if="module === 'dm'" label="最大消息数" prop="maxMsgCount">
            <el-input-number v-model="form.maxMsgCount" :min="1" :max="10" class="w-full" />
          </el-form-item>
        </div>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选，说明这个配置适用的账号、人设或场景" />
        </el-form-item>
        <el-form-item label="系统提示词" prop="customSystemPrompt">
          <el-input v-model="form.customSystemPrompt" type="textarea" :rows="4" placeholder="对应 CUSTOM_SYSTEM_PROMPT" />
        </el-form-item>
        <el-form-item label="补充提示词" prop="customUserPrompt">
          <el-input v-model="form.customUserPrompt" type="textarea" :rows="3" placeholder="对应 CUSTOM_USER_PROMPT" />
        </el-form-item>
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="禁用词" prop="forbiddenWords">
            <el-input v-model="form.forbiddenWords" type="textarea" :rows="3" placeholder="对应 FORBIDDEN_WORDS，逗号分隔" />
          </el-form-item>
          <el-form-item label="要求词" prop="requiredWords">
            <el-input v-model="form.requiredWords" type="textarea" :rows="3" placeholder="对应 REQUIRED_WORDS，逗号分隔" />
          </el-form-item>
        </div>
        <el-form-item label="回复风格" prop="replyStyle">
          <el-input v-model="form.replyStyle" type="textarea" :rows="2" placeholder="对应 REPLY_STYLE" />
        </el-form-item>
        <el-form-item label="账号定位" prop="accountPositioning">
          <el-input v-model="form.accountPositioning" type="textarea" :rows="2" placeholder="对应 ACCOUNT_POSITIONING" />
        </el-form-item>
        <el-form-item label="业务简介" prop="businessProfile">
          <el-input v-model="form.businessProfile" type="textarea" :rows="3" placeholder="对应 BUSINESS_PROFILE" />
        </el-form-item>
        <el-form-item :label="module === 'comment' ? '评论目标' : '转化目标'" prop="goal">
          <el-input v-model="form.goal" type="textarea" :rows="2" :placeholder="module === 'comment' ? '对应 COMMENT_GOAL' : '对应 CONVERSION_GOAL'" />
        </el-form-item>
        <el-form-item :label="module === 'comment' ? '评论规则' : '联系规则'" prop="policy">
          <el-input v-model="form.policy" type="textarea" :rows="3" :placeholder="module === 'comment' ? '对应 COMMENT_POLICY' : '对应 CONTACT_POLICY'" />
        </el-form-item>
        <el-form-item label="安全约束" prop="safetyPolicy">
          <el-input v-model="form.safetyPolicy" type="textarea" :rows="3" placeholder="对应 SAFETY_POLICY" />
        </el-form-item>
        <el-form-item v-if="module === 'comment'" label="作品上下文" prop="postContext">
          <el-input v-model="form.postContext" type="textarea" :rows="3" placeholder="对应 POST_CONTEXT" />
        </el-form-item>
      </el-form>
      <template #footer>
        <SampleFillButton v-if="formMode === 'create'" label="填入提示词参考样例" :has-content="hasPromptContent" @fill="fillDefaultData" />
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import * as autoRepliesApi from '@/api/modules/autoReplies';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import { formatDateTime } from '@/utils/format';
import type { AutoReplyModule, AutoReplyPromptConfig, AutoReplyPromptConfigPayload, AutoReplyWorkflowMode } from '@/api/modules/autoReplies';
import { getPromptConfigDefaults } from '../autoReplyDefaults';

const props = defineProps<{
  modelValue: boolean;
  module: AutoReplyModule;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const module = computed(() => props.module);
const moduleTitle = computed(() => (props.module === 'comment' ? '评论机器人' : '私信机器人'));
const defaultPlatformLabel = computed(() => (props.module === 'comment' ? '抖音评论区' : '抖音私信'));

const keyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const items = ref<AutoReplyPromptConfig[]>([]);
const formVisible = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const currentId = ref('');
const formRef = ref<FormInstance>();

const form = reactive(createEmptyForm('comment'));
const hasPromptContent = computed(() => Boolean(
  form.name.trim() || form.description.trim() || form.customSystemPrompt.trim() || form.customUserPrompt.trim()
  || form.accountPositioning.trim() || form.businessProfile.trim() || form.goal.trim() || form.policy.trim(),
));

const rules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  platformLabel: [{ required: true, message: '请输入平台名称', trigger: 'blur' }],
  workflowMode: [{ required: true, message: '请选择工作流模式', trigger: 'change' }],
  replyLength: [{ required: true, message: '请输入回复条数', trigger: 'change' }],
  maxMsgCount: [{ required: true, message: '请输入最大消息数', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) fetchList(true);
  }
);

watch(
  () => props.module,
  () => {
    Object.assign(form, createEmptyForm(props.module));
    if (visible.value) fetchList(true);
  }
);

async function fetchList(reset = false) {
  if (reset) page.value = 1;
  loading.value = true;
  try {
    const result = await autoRepliesApi.listPromptConfigs({
      module: props.module,
      keyword: keyword.value,
      page: page.value,
      pageSize: pageSize.value,
      status: 'ENABLED'
    });
    items.value = result.items;
    total.value = result.total;
    page.value = result.page;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  formMode.value = 'create';
  currentId.value = '';
  Object.assign(form, createEmptyForm(props.module));
  formVisible.value = true;
}

function openEdit(row: AutoReplyPromptConfig) {
  formMode.value = 'edit';
  currentId.value = row.id;
  Object.assign(form, configToForm(row));
  formVisible.value = true;
}

function fillDefaultData() {
  Object.assign(form, { ...createEmptyForm(props.module), ...getPromptConfigDefaults(props.module), name: form.name || getPromptConfigDefaults(props.module).name });
  ElMessage.success('提示词参考样例已填入，保存前请按真实账号和业务修改');
}

async function submitForm() {
  await formRef.value?.validate();
  const missing = validateWorkflowForm(props.module);
  if (missing.length) {
    ElMessage.warning(`配置不完整：${missing.join('、')}`);
    return;
  }
  saving.value = true;
  try {
    const payload = formToPayload(props.module);
    if (formMode.value === 'create') {
      await autoRepliesApi.createPromptConfig(payload);
      ElMessage.success('提示词配置已新增');
    } else {
      await autoRepliesApi.updatePromptConfig(currentId.value, payload);
      ElMessage.success('提示词配置已更新');
    }
    formVisible.value = false;
    await fetchList();
    emit('changed');
  } finally {
    saving.value = false;
  }
}

async function remove(row: AutoReplyPromptConfig) {
  await ElMessageBox.confirm(`确认删除提示词配置「${row.name}」？`, '删除确认', { type: 'warning' });
  await autoRepliesApi.removePromptConfig(row.id);
  ElMessage.success('提示词配置已删除');
  await fetchList(true);
  emit('changed');
}

function createEmptyForm(module: AutoReplyModule) {
  return {
    workflowMode: 'DEFAULT' as AutoReplyWorkflowMode,
    workflowId: '',
    workflowBotId: '',
    workflowInputKey: 'input',
    name: '',
    description: '',
    customSystemPrompt: '',
    customUserPrompt: '',
    forbiddenWords: '',
    requiredWords: '',
    replyStyle: '',
    platformLabel: module === 'comment' ? '抖音评论区' : '抖音私信',
    accountPositioning: '',
    businessProfile: '',
    goal: '',
    policy: '',
    safetyPolicy: '',
    replyLength: 2,
    maxMsgCount: module === 'dm' ? 3 : undefined,
    postContext: ''
  };
}

function configToForm(config: AutoReplyPromptConfig) {
  return {
    ...createEmptyForm(config.module),
    workflowMode: config.workflowMode || workflowModeFromExtra(config.extraParams),
    workflowId: config.workflowId || String(config.extraParams?.WORKFLOW_ID ?? ''),
    workflowBotId: config.workflowBotId || String(config.extraParams?.WORKFLOW_BOT_ID ?? ''),
    workflowInputKey: config.workflowInputKey || String(config.extraParams?.WORKFLOW_INPUT_KEY ?? 'input'),
    name: config.name || '',
    description: config.description || '',
    customSystemPrompt: config.customSystemPrompt || '',
    customUserPrompt: config.customUserPrompt || '',
    forbiddenWords: config.forbiddenWords || '',
    requiredWords: config.requiredWords || '',
    replyStyle: config.replyStyle || '',
    platformLabel: config.platformLabel || defaultPlatformLabel.value,
    accountPositioning: config.accountPositioning || '',
    businessProfile: config.businessProfile || '',
    goal: config.goal || '',
    policy: config.policy || '',
    safetyPolicy: config.safetyPolicy || '',
    replyLength: config.replyLength || 2,
    maxMsgCount: config.module === 'dm' ? config.maxMsgCount || 3 : undefined,
    postContext: String(config.extraParams?.POST_CONTEXT ?? '')
  };
}

function formToPayload(module: AutoReplyModule): AutoReplyPromptConfigPayload {
  return {
    module,
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    customSystemPrompt: form.customSystemPrompt.trim(),
    customUserPrompt: form.customUserPrompt.trim(),
    forbiddenWords: form.forbiddenWords.trim(),
    requiredWords: form.requiredWords.trim(),
    replyStyle: form.replyStyle.trim(),
    platformLabel: form.platformLabel.trim(),
    accountPositioning: form.accountPositioning.trim(),
    businessProfile: form.businessProfile.trim(),
    goal: form.goal.trim(),
    policy: form.policy.trim(),
    safetyPolicy: form.safetyPolicy.trim(),
    replyLength: Number(form.replyLength) || 2,
    maxMsgCount: module === 'dm' ? Number(form.maxMsgCount) || 3 : undefined,
    extraParams: {
      ...(module === 'comment' ? { POST_CONTEXT: form.postContext.trim() } : {}),
      WORKFLOW_MODE: form.workflowMode,
      WORKFLOW_ID: form.workflowMode === 'DEFAULT' ? '' : form.workflowId.trim(),
      WORKFLOW_BOT_ID: module === 'dm' && form.workflowMode === 'STRUCTURED' ? form.workflowBotId.trim() : '',
      WORKFLOW_INPUT_KEY: form.workflowMode === 'PLAIN_CHAT' ? form.workflowInputKey.trim() || 'input' : 'input'
    }
  };
}

function validateWorkflowForm(module: AutoReplyModule) {
  const missing: string[] = [];
  if (form.workflowMode !== 'DEFAULT' && !form.workflowId.trim()) missing.push('工作流 ID');
  if (form.workflowMode === 'PLAIN_CHAT' && !form.workflowInputKey.trim()) missing.push('输入变量名');
  if (form.workflowMode !== 'PLAIN_CHAT') {
    const required: Array<[string, string]> = [
      [form.customSystemPrompt, '系统提示词'],
      [form.customUserPrompt, '补充提示词'],
      [form.forbiddenWords, '禁用词'],
      [form.requiredWords, '要求词'],
      [form.replyStyle, '回复风格'],
      [form.accountPositioning, '账号定位'],
      [form.businessProfile, '业务简介'],
      [form.goal, module === 'comment' ? '评论目标' : '转化目标'],
      [form.policy, module === 'comment' ? '评论规则' : '联系规则'],
      [form.safetyPolicy, '安全约束']
    ];
    if (module === 'comment') required.push([form.postContext, '作品上下文']);
    required.forEach(([value, label]) => {
      if (!String(value || '').trim()) missing.push(label);
    });
  }
  return missing;
}

function workflowModeFromExtra(extraParams?: Record<string, unknown>): AutoReplyWorkflowMode {
  const value = String(extraParams?.WORKFLOW_MODE ?? '').trim().toUpperCase();
  if (value === 'PLAIN_CHAT') return 'PLAIN_CHAT';
  if (value === 'STRUCTURED') return 'STRUCTURED';
  return 'DEFAULT';
}

function workflowModeLabel(mode?: AutoReplyWorkflowMode) {
  if (mode === 'PLAIN_CHAT') return '纯聊天';
  if (mode === 'STRUCTURED') return '自定义结构化';
  return '系统默认';
}

function workflowTagType(mode?: AutoReplyWorkflowMode) {
  if (mode === 'PLAIN_CHAT') return 'success';
  if (mode === 'STRUCTURED') return 'warning';
  return 'info';
}
</script>
