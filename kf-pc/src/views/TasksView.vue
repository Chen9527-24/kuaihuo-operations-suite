<template>
  <div class="space-y-4">
    <div class="panel-surface p-5 shadow-panel">
      <div class="mb-4 flex items-center justify-between">
        <div class="text-base font-semibold">任务队列</div>
        <el-button type="primary">新建任务</el-button>
      </div>

      <el-timeline>
        <el-timeline-item
          v-for="item in taskTimeline"
          :key="item.title"
          :timestamp="item.time"
          :type="item.type"
        >
          <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-slate-800">
            <div class="font-medium">{{ item.title }}</div>
            <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {{ item.desc }}
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'TasksView'
});

const taskTimeline = [
  {
    title: '同步用户中心权限配置',
    desc: '发布前校验菜单和按钮级权限。',
    time: '2025-04-03 11:10',
    type: 'primary'
  },
  {
    title: '跑批生成评论线索任务',
    desc: '任务队列已创建 18 条记录。',
    time: '2025-04-03 09:30',
    type: 'success'
  },
  {
    title: '重试失败订单补偿',
    desc: '存在 2 个任务重试失败，需要人工介入。',
    time: '2025-04-03 08:45',
    type: 'danger'
  }
];
</script>
