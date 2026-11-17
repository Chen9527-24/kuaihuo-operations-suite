<template>
  <div class="space-y-4">
    <section class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="panel-surface card-surface p-5 shadow-panel"
      >
        <div class="text-sm text-slate-500 dark:text-slate-400">{{ stat.label }}</div>
        <div class="mt-3 text-3xl font-semibold">{{ stat.value }}</div>
        <div class="mt-2 text-sm text-emerald-600">{{ stat.delta }}</div>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
      <div class="panel-surface p-5 shadow-panel">
        <div class="mb-4 flex items-center justify-between">
          <div class="text-base font-semibold">系统健康</div>
          <el-tag :type="healthItems.length ? 'success' : 'warning'">{{ healthItems.length ? '接口已连接' : '等待数据' }}</el-tag>
        </div>
        <el-alert v-if="dashboardError" :title="dashboardError" type="error" :closable="false" class="mb-4" />
        <el-table :data="healthItems" stripe v-loading="loading">
          <el-table-column prop="label" label="检查项" min-width="180" />
          <el-table-column prop="value" label="结果" min-width="220" />
        </el-table>
      </div>

      <div class="panel-surface p-5 shadow-panel">
        <div class="mb-4 flex items-center justify-between">
          <div class="text-base font-semibold">最近文件</div>
          <el-upload :show-file-list="false" :http-request="handleUploadRequest" accept="*/*">
            <el-button type="primary" plain>上传文件</el-button>
          </el-upload>
        </div>
        <div v-if="!files.length && !loading" class="rounded-2xl border border-dashed border-slate-200/80 p-4 text-sm text-slate-500 dark:border-slate-800">
          暂无文件记录
        </div>
        <div class="space-y-3" v-loading="loading">
          <div
            v-for="item in files"
            :key="item.id"
            class="rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate font-medium">{{ item.name }}</div>
                <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ item.type }} · {{ item.size }}</div>
                <div class="mt-1 text-xs text-slate-400">{{ item.createdAt }}</div>
              </div>
              <el-link v-if="item.url" :href="item.url" target="_blank" type="primary">查看</el-link>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, type UploadRequestOptions } from 'element-plus';
import { getMyFiles, uploadFile } from '@/api/modules/files';
import { getHealthStatus } from '@/api/modules/health';
import { normalizeFileItems, normalizeHealthOverview } from '@/api/normalizers';
import { useAsyncState } from '@/composables/useAsyncState';
import { useAuthStore } from '@/stores/auth';

defineOptions({
  name: 'DashboardView'
});

const auth = useAuthStore();
const { loading, errorMessage: dashboardError, run } = useAsyncState();
const healthItems = ref<{ key: string; label: string; value: string }[]>([]);
const files = ref<{ id: string; name: string; url: string; type: string; size: string; createdAt: string }[]>([]);

const stats = computed(() => [
  { label: '角色数量', value: `${auth.user.roles.length}`, delta: '来自权限接口' },
  { label: '权限数量', value: `${auth.user.permissions.length}`, delta: '当前登录账号' },
  { label: '文件数量', value: `${files.value.length}`, delta: '我的文件列表' },
  { label: '健康检查项', value: `${healthItems.value.length}`, delta: '服务状态总览' }
]);

onMounted(() => {
  loadDashboardData();
});

async function loadDashboardData() {
  await run(async () => {
    const [healthPayload, filePayload] = await Promise.all([getHealthStatus(), getMyFiles()]);

    healthItems.value = normalizeHealthOverview(healthPayload);
    files.value = normalizeFileItems(filePayload);
    if (!auth.user.permissions.length && !auth.user.roles.length) {
      await auth.fetchCurrentUserProfile();
    }
  }).catch(() => undefined);
}

async function handleUploadRequest(options: UploadRequestOptions) {
  try {
    await uploadFile(options.file);
    ElMessage.success('上传成功');
    await loadDashboardData();
    options.onSuccess?.({}, options.file);
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败';
    ElMessage.error(message);
    options.onError?.(error as Error);
  }
}
</script>
