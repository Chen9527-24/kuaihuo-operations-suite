<template>
  <div class="space-y-4">
    <div class="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5">
      <div class="text-xl font-semibold text-slate-900">自动回复</div>
      <div class="mt-2 text-sm text-slate-500">在一个入口管理私信和评论机器人。机器人只需选择账号配置，身份、知识和回复风格会自动加载。</div>
    </div>
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="私信自动回复" name="private">
        <RobotManagementPage v-if="activeTab === 'private'" category="PRIVATE_MESSAGE" />
      </el-tab-pane>
      <el-tab-pane label="评论自动回复" name="comment">
        <RobotManagementPage v-if="activeTab === 'comment'" category="COMMENT" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RobotManagementPage from '@/views/robotmanagement/RobotManagementPage.vue';

defineOptions({ name: 'CustomerServiceAutoReplyView' });
const activeTab = ref('private');
</script>
