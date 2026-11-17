<template>
  <el-popover
    placement="top"
    :width="width"
    trigger="click"
    popper-class="app-help-popper"
  >
    <template #reference>
      <button
        class="help-tip"
        type="button"
        :aria-label="`查看${title || '说明'}`"
        @click.stop
      >
        ?
      </button>
    </template>
    <div v-if="title" class="help-tip__title">{{ title }}</div>
    <div class="help-tip__content">{{ content }}</div>
    <div v-if="example" class="help-tip__example">例如：{{ example }}</div>
  </el-popover>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  content: string;
  example?: string;
  width?: number;
}>(), {
  title: '',
  example: '',
  width: 320,
});
</script>

<style scoped>
.help-tip {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: .16s ease;
}

.help-tip:hover,
.help-tip:focus-visible {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
  outline: none;
  transform: translateY(-1px);
}

.help-tip__title {
  margin-bottom: 6px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.help-tip__content,
.help-tip__example {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}

.help-tip__example {
  margin-top: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  padding: 6px 8px;
}
</style>
