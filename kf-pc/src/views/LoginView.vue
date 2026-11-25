<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
    <div class="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1.15fr_0.85fr]">
      <section
        class="hidden min-h-[620px] flex-col justify-between p-10 text-white lg:flex"
        :style="{ background: `linear-gradient(135deg, ${settings.themeColor}, #1e293b)` }"
      >
        <div>
          <div class="inline-flex items-center gap-3 rounded-full bg-white/12 px-4 py-2 text-sm backdrop-blur">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 font-semibold">
              M
            </span>
            Mini Admin
          </div>
          <h1 class="mt-8 text-4xl font-semibold leading-tight">全链互动增长平台</h1>
          <p class="mt-4 max-w-md text-sm leading-7 text-white/80">
            以 AI 为内核，将内容、线索和客户承接，连接成一套系统，构建短视频业务业务增长新范式
          </p>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div
            v-for="item in highlights"
            :key="item.label"
            class="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
          >
            <div class="text-2xl font-semibold">{{ item.value }}</div>
            <div class="mt-2 text-sm text-white/75">{{ item.label }}</div>
          </div>
        </div>
      </section>

      <section class="flex min-h-[620px] items-center justify-center p-6 sm:p-10">
        <div class="w-full max-w-md">
          <div class="mb-8">
            <div class="text-3xl font-semibold text-slate-900 dark:text-slate-50">欢迎回来</div>
            <div class="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {{ isAddingAccount ? '添加一个已授权的后台账号，当前账号会保留在快速切换列表中。' : '请使用快火科技运营人员提供的账号密码进行登录' }}
            </div>
          </div>

          <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="handleSubmit">
            <el-form-item prop="account">
              <el-input v-model="form.account" placeholder="请输入账号" clearable>
                <template #prefix>
                  <el-icon><User /></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item prop="password">
              <el-input v-model="form.password" type="password" show-password placeholder="请输入密码">
                <template #prefix>
                  <el-icon><Lock /></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <div class="mb-5 flex items-center justify-between text-sm">
              <el-checkbox v-model="form.remember">记住登录状态</el-checkbox>
              <button class="text-[var(--el-color-primary)]" type="button">忘记密码</button>
            </div>

            <el-button :loading="submitting" type="primary" class="w-full" size="large" @click="handleSubmit">
              {{ isAddingAccount ? '添加并登录账号' : '登录系统' }}
            </el-button>
          </el-form>

          <div v-if="auth.savedAccounts.length" class="mt-6 rounded-3xl border border-slate-200 p-4 dark:border-slate-700">
            <div class="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">本设备已保存账号</div>
            <div class="space-y-2">
              <button
                v-for="account in auth.savedAccounts"
                :key="account.key"
                type="button"
                class="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-[var(--el-color-primary)] dark:border-slate-700"
                :disabled="quickSwitching"
                @click="handleQuickSwitchAccount(account.key)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ account.name }}</span>
                  <span class="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{{ account.account }} · {{ account.tenantName || '上次租户不可用' }}</span>
                </span>
                <span class="ml-3 shrink-0 text-xs text-[var(--el-color-primary)]">快速登录</span>
              </button>
            </div>
          </div>

          <div class="mt-6 rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            开发环境下请求会通过 Vite 代理转发到 `http://localhost:3000`，避免浏览器跨域限制。
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Lock, User } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const settings = useSettingsStore();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const quickSwitching = ref(false);
const isAddingAccount = computed(() => route.query.mode === 'add');

const form = reactive({
  account: '',
  password: '',
  remember: true
});

const rules: FormRules<typeof form> = {
  account: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

onMounted(() => {
  if (isAddingAccount.value) {
    form.account = '';
    form.password = '';
  }
});

const highlights = [
  { label: '动 AI助手', value: '短视频热点' },
  { label: '字分身', value: '智能人感数' },
  { label: '能获客', value: '全自动AI智' }
];

async function handleQuickSwitchAccount(key: string) {
  quickSwitching.value = true;
  try {
    const result = await auth.switchSavedAccount(key);
    if (result.requiresTenantSelection) {
      ElMessage.info('上次使用的租户已不可用，请重新选择租户');
      return;
    }
    ElMessage.success('账号已切换');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.replace(redirect);
  } catch (error) {
    const message = error instanceof Error ? error.message : '快速登录失败，请重新输入账号密码';
    ElMessage.error(message);
  } finally {
    quickSwitching.value = false;
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    await auth.login(form);
    if (auth.isLoggedIn) {
      ElMessage.success('登录成功');
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : auth.consumePostLoginRedirect();
      await router.push(redirect);
    } else if (auth.requiresTenantSelection) {
      ElMessage.success('账号验证成功，请选择租户后继续');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败，请检查账号密码或后端服务';
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
}
</script>
