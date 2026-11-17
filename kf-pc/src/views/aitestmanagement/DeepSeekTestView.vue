<template>
  <div class="space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-base font-semibold">DeepSeek API 测试</div>
            <div class="mt-1 text-sm text-slate-500">通过后端环境变量中的 API Key 发起请求，前端不会保存或暴露密钥。</div>
          </div>
          <el-tag type="success" effect="plain">后端转发</el-tag>
        </div>
      </template>

      <el-alert
        title="请确认后端 .env 已配置 DEEPSEEK_API_KEY；本页面只用于验证 DeepSeek 对话接口是否能正常返回。"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      />

      <el-form :model="form" label-width="120px" class="max-w-5xl">
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="模型">
              <el-input v-model="form.model" placeholder="deepseek-v4-flash" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="6">
            <el-form-item label="Temperature">
              <el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" :precision="1" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="6">
            <el-form-item label="Max Tokens">
              <el-input-number v-model="form.maxTokens" :min="1" :max="4000" :step="100" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="JSON 模式">
          <el-switch v-model="form.jsonMode" active-text="开启" inactive-text="关闭" />
        </el-form-item>

        <el-form-item label="测试账号身份">
          <el-select v-model="form.accountProfileId" clearable filterable class="w-full" placeholder="可选；选择后会先匹配该账号/店铺/客服身份绑定的固定问答">
            <el-option v-for="item in accounts" :key="item.id" :label="`${item.name}${item.storeProfile?.name ? ` · ${item.storeProfile.name}` : ''}${item.merchantRole?.name ? ` · ${item.merchantRole.name}` : ''}`" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="System Prompt">
          <el-input
            v-model="form.systemPrompt"
            type="textarea"
            :rows="4"
            maxlength="5000"
            show-word-limit
            placeholder="可选，例如：你是一个专业、简洁的中文助手。"
          />
        </el-form-item>

        <el-form-item label="用户输入" required>
          <el-input
            v-model="form.userPrompt"
            type="textarea"
            :rows="7"
            maxlength="10000"
            show-word-limit
            placeholder="请输入要测试的内容"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSubmit">发送测试</el-button>
          <el-button :disabled="loading" @click="fillExample">填入示例</el-button>
          <el-button :disabled="loading" @click="clearResult">清空结果</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="result || errorMessage" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-base font-semibold">返回结果</div>
          <div v-if="result" class="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <el-tag v-if="resultSource === 'FIXED_QA'" type="success" effect="plain">账号知识固定问答</el-tag>
            <span>模型：{{ result.model || form.model }}</span>
            <span>耗时：{{ result.elapsedMs }}ms</span>
            <span>finish：{{ result.finishReason || '-' }}</span>
          </div>
        </div>
      </template>

      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="mb-4" />

      <template v-if="result">
        <el-alert v-if="fixedQaMeta" class="mb-4" type="success" :closable="false" show-icon :title="`命中固定问答：${fixedQaMeta.title || '-'}`" :description="`匹配：${fixedQaMatchTypeName(fixedQaMeta.matchType)}${typeof fixedQaMeta.matchScore === 'number' ? `（${(fixedQaMeta.matchScore * 100).toFixed(0)}%）` : ''}；DeepSeek 未调用；随机 Loading ${(Number(fixedQaMeta.delayMs || 0) / 1000).toFixed(1)} 秒。`" />
        <el-descriptions :column="4" border class="mb-4">
          <el-descriptions-item label="Prompt Tokens">{{ result.usage.promptTokens }}</el-descriptions-item>
          <el-descriptions-item label="Completion Tokens">{{ result.usage.completionTokens }}</el-descriptions-item>
          <el-descriptions-item label="Total Tokens">{{ result.usage.totalTokens }}</el-descriptions-item>
          <el-descriptions-item label="Request ID">{{ result.requestId || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="mb-2 text-sm font-medium text-slate-600">回复内容</div>
        <el-input :model-value="result.content" type="textarea" :rows="12" readonly />

        <el-collapse v-if="result.reasoningContent" class="mt-4">
          <el-collapse-item title="Reasoning Content" name="reasoning">
            <el-input :model-value="result.reasoningContent" type="textarea" :rows="8" readonly />
          </el-collapse-item>
        </el-collapse>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getRequestErrorMessage } from '@/api/core/http';
import { testDeepSeekChat, type DeepSeekChatTestResult } from '@/api/modules/ai';
import { listCustomerServiceAccountProfiles } from '@/modules/customer-service/api/context-profiles.api';
import { resolveCustomerServiceFixedQa } from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceAccountProfile, CustomerServiceFixedQaResolveResult } from '@/modules/customer-service/types/context-profiles.types';

defineOptions({
  name: 'DeepSeekTestView'
});

const loading = ref(false);
const errorMessage = ref('');
const result = ref<DeepSeekChatTestResult | null>(null);
const resultSource = ref<'DEEPSEEK' | 'FIXED_QA'>('DEEPSEEK');
const fixedQaMeta = ref<CustomerServiceFixedQaResolveResult | null>(null);
const accounts = ref<CustomerServiceAccountProfile[]>([]);

const form = reactive({
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: 1000,
  jsonMode: false,
  systemPrompt: '你是一个专业、简洁的中文助手。',
  userPrompt: '',
  accountProfileId: ''
});

onMounted(async () => {
  try {
    const response = await listCustomerServiceAccountProfiles({ status: 'ENABLED', page: 1, pageSize: 500 });
    accounts.value = response.items || [];
  } catch {
    accounts.value = [];
  }
});

function fixedQaMatchTypeName(value?: string) {
  return value === 'FUZZY' ? '模糊匹配' : '模糊匹配（兼容旧配置）';
}

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms))); }

function fillExample() {
  form.userPrompt = '请用一句话说明 DeepSeek API 已接入成功。';
}

function clearResult() {
  result.value = null;
  fixedQaMeta.value = null;
  resultSource.value = 'DEEPSEEK';
  errorMessage.value = '';
}

async function handleSubmit() {
  const userPrompt = form.userPrompt.trim();
  if (!userPrompt) {
    ElMessage.warning('请先输入用户内容');
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  result.value = null;
  try {
    const account = accounts.value.find((item) => item.id === form.accountProfileId);
    if (account) {
      const fixedQa = await resolveCustomerServiceFixedQa({
        accountProfileId: account.id,
        storeProfileId: account.storeProfileId || undefined,
        merchantRoleId: account.merchantRoleId || undefined,
        message: userPrompt
      });
      if (fixedQa.matched && fixedQa.answer) {
        await sleep(Number(fixedQa.delayMs || 0));
        fixedQaMeta.value = fixedQa;
        resultSource.value = 'FIXED_QA';
        result.value = {
          ok: true,
          model: '固定问答',
          content: fixedQa.answer,
          reasoningContent: '',
          finishReason: 'fixed_qa',
          requestId: '',
          elapsedMs: Number(fixedQa.delayMs || 0),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, promptCacheHitTokens: 0, promptCacheMissTokens: 0 }
        };
        ElMessage.success('命中账号知识固定问答，DeepSeek 未调用');
        return;
      }
    }
    resultSource.value = 'DEEPSEEK';
    fixedQaMeta.value = null;
    result.value = await testDeepSeekChat({
      model: form.model.trim() || undefined,
      temperature: form.temperature,
      maxTokens: form.maxTokens,
      jsonMode: form.jsonMode,
      systemPrompt: form.systemPrompt.trim() || undefined,
      userPrompt
    });
    ElMessage.success('DeepSeek 返回成功');
  } catch (error) {
    errorMessage.value = getRequestErrorMessage(error) || 'DeepSeek 测试失败';
  } finally {
    loading.value = false;
  }
}
</script>
