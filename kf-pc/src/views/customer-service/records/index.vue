<template>
  <div class="space-y-4">
    <div class="rounded-2xl border border-slate-200 bg-white p-5">
      <div class="text-xl font-semibold text-slate-900">回复记录</div>
      <div class="mt-2 text-sm text-slate-500">集中查看客户私信与评论线程，便于复盘回复效果、提交反馈和处理异常。</div>
    </div>
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="私信对话" name="dialogue">
        <DialogueRecords v-if="activeTab === 'dialogue'" />
      </el-tab-pane>
      <el-tab-pane label="评论线程" name="comment">
        <CommentRecords v-if="activeTab === 'comment'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DialogueRecords from '@/views/dialoguerecordmanagement/index.vue';
import CommentRecords from '@/views/commentrecordmanagement/index.vue';

defineOptions({ name: 'CustomerServiceRecordsView' });
const activeTab = ref('dialogue');
</script>
