<template>
  <el-drawer v-model="visible" title="截流提示词效果测试" size="680px" :close-on-click-modal="false" destroy-on-close>
    <div class="flex h-full flex-col gap-4">
      <div class="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <el-form label-position="top">
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <el-form-item label="测试机器人（可选）" class="!mb-3">
              <el-select v-model="robotId" clearable filterable placeholder="不选则只按提示词配置测试">
                <el-option v-for="item in robots" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="平台参数" class="!mb-3">
              <el-input v-model="platform" placeholder="douyin" />
            </el-form-item>
          </div>
          <el-form-item label="作品标题 / 文案上下文" class="!mb-3">
            <el-input v-model="videoTitle" type="textarea" :rows="2" resize="none" placeholder="例如：评论太多怎么用工具筛出精准线索？" />
          </el-form-item>
          <el-form-item label="测试评论" class="!mb-3">
            <el-input
              v-model="commentText"
              type="textarea"
              :rows="6"
              resize="none"
              placeholder="每行一条评论，例如：\n这个工具怎么试用？\n多少钱一个月？\n哈哈哈学到了"
            />
          </el-form-item>
          <div class="flex flex-wrap items-center gap-2">
            <el-button @click="fillSampleComments">填入样例</el-button>
            <el-button @click="clearResult">清空结果</el-button>
            <el-button type="primary" :loading="testing" @click="submitTest">开始测试</el-button>
          </div>
          <div class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
            测试只会调用 Coze 工作流，不写入捕获数据、分析批次或主动私信任务。后端会按每批最多 5 条串行处理，单次最多 25 条；全部批次完成后统一返回结果。
          </div>
        </el-form>
      </div>

      <div class="app-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
        <div v-if="!result && !testing" class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          输入测试评论后，会在这里展示意向等级、建议私信、切入策略和私信开场白。
        </div>

        <div v-if="result" class="space-y-3">
          <div class="rounded-xl border p-3 text-sm" :class="resultPanelClass">
            <div class="font-semibold">{{ resultPanelTitle }}</div>
            <div class="mt-1 text-xs opacity-80">
              共 {{ result.totalCount ?? result.results.length }} 条；成功 {{ result.successCount ?? successfulResultCount }} 条；失败 {{ result.failedCount ?? failedResultCount }} 条；
              每批 {{ result.batchSize ?? 5 }} 条，已处理 {{ result.completedBatchCount ?? result.batchCount ?? 0 }}/{{ result.batchCount ?? 0 }} 批。
            </div>
            <div v-if="result.errMsg" class="mt-1 whitespace-pre-wrap text-xs">{{ result.errMsg }}</div>
            <div class="mt-1 text-xs opacity-80">workflowId：{{ result.workflowId || '--' }}；最后 executeId：{{ result.executeId || '--' }}</div>
          </div>

          <div v-if="!result.results.length" class="rounded-xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700">
            未返回可展示的评论分析结果。
          </div>

          <div v-for="item in result.results" :key="item.cid" class="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs text-slate-500">{{ item.cid }}</div>
              <div class="flex flex-wrap items-center gap-2">
                <el-tag v-if="item.success === false" type="danger" effect="light">本条失败</el-tag>
                <el-tag :type="levelTagType(item.level)" effect="light">{{ item.level || 'C' }}</el-tag>
                <el-tag :type="item.should ? 'success' : 'info'" effect="light">{{ item.should ? '建议私信' : '不建议私信' }}</el-tag>
                <el-tag :type="riskTagType(item.risk)" effect="light">{{ item.risk || 'low' }}</el-tag>
                <el-tag v-if="item.batchIndex" type="info" effect="plain">第 {{ item.batchIndex }} 批</el-tag>
              </div>
            </div>
            <div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-100">{{ item.text }}</div>
            <div class="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500 md:grid-cols-2">
              <div><span class="font-medium text-slate-600 dark:text-slate-300">原因：</span>{{ item.reason || '--' }}</div>
              <div><span class="font-medium text-slate-600 dark:text-slate-300">需求：</span>{{ item.need || '--' }}</div>
            </div>
            <div v-if="item.tags.length" class="mt-2 flex flex-wrap gap-1">
              <el-tag v-for="tag in item.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
            </div>
            <div class="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
              <template v-if="item.success === false">
                <div class="font-medium text-red-600 dark:text-red-300">本条未得到有效 Coze 分析结果</div>
                <div class="mt-1 whitespace-pre-wrap">{{ item.errorMessage || '请根据失败原因减少评论数量或在 Coze 执行记录中继续排查。' }}</div>
              </template>
              <template v-else>
                <div><span class="font-medium">切入策略：</span>{{ item.entry || '--' }}</div>
                <div class="mt-2"><span class="font-medium">私信开场：</span>{{ item.reply || '--' }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as robotsApi from '@/api/modules/robots';

const props = defineProps<{
  modelValue: boolean;
  promptConfig?: (Partial<robotsApi.InterceptIntentPromptConfigPayload> & { promptConfigId?: string }) | null;
  robots?: robotsApi.RobotItem[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const robotId = ref('');
const platform = ref('douyin');
const videoTitle = ref('');
const commentText = ref('');
const testing = ref(false);
const result = ref<robotsApi.InterceptIntentPromptTestResult | null>(null);
const robots = computed(() => props.robots || []);
const successfulResultCount = computed(() => result.value?.results.filter((item) => item.success !== false).length || 0);
const failedResultCount = computed(() => result.value?.results.filter((item) => item.success === false).length || 0);
const resultPanelTitle = computed(() => {
  if (!result.value) return '';
  if (result.value.ok) return '测试完成';
  return result.value.partial ? '测试完成（部分失败）' : '测试失败';
});
const resultPanelClass = computed(() => {
  if (!result.value) return '';
  if (result.value.ok) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  return result.value.partial ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-red-100 bg-red-50 text-red-700';
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      platform.value = props.promptConfig?.platform || 'douyin';
      videoTitle.value = props.promptConfig?.videoTitle || '';
      if (!commentText.value.trim()) fillSampleComments();
      result.value = null;
    }
  }
);

function parseComments() {
  return commentText.value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text, index) => ({ cid: `TEST_${String(index + 1).padStart(3, '0')}`, text }));
}

function fillSampleComments() {
  commentText.value = ['这个工具怎么试用？', '多少钱一个月？', '评论太多了，手动筛太麻烦', '哈哈哈学到了'].join('\n');
}

function clearResult() {
  result.value = null;
}

async function submitTest() {
  const comments = parseComments();
  if (!comments.length) {
    ElMessage.warning('请输入至少一条测试评论');
    return;
  }
  if (comments.length > 25) {
    ElMessage.warning('单次测试最多支持 25 条评论，请分多次测试');
    return;
  }
  testing.value = true;
  try {
    const payload: robotsApi.InterceptIntentPromptTestPayload = {
      ...(props.promptConfig || {}),
      robotId: robotId.value || undefined,
      platform: platform.value.trim() || props.promptConfig?.platform || 'douyin',
      videoTitle: videoTitle.value.trim() || props.promptConfig?.videoTitle,
      commentsText: commentText.value,
      testComments: commentText.value,
      comments
    };
    const response = await robotsApi.testInterceptIntentPromptConfig(payload);
    result.value = response;
    if (response.ok) ElMessage.success(`测试完成：${response.successCount ?? response.results.length} 条评论已分析`);
    else if (response.partial) ElMessage.warning(response.errMsg || '测试已完成，但部分评论未得到有效结果');
    else ElMessage.error(response.errMsg || '测试失败');
  } finally {
    testing.value = false;
  }
}

function levelTagType(level?: string) {
  const normalized = String(level || '').toUpperCase();
  if (normalized === 'S') return 'danger';
  if (normalized === 'A') return 'warning';
  if (normalized === 'B') return 'primary';
  return 'info';
}

function riskTagType(risk?: string) {
  const normalized = String(risk || '').toLowerCase();
  if (normalized === 'high') return 'danger';
  if (normalized === 'medium') return 'warning';
  return 'info';
}
</script>
