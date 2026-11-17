<template>
  <el-button :type="type" plain @click="fillSample">{{ label }}</el-button>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';

const props = withDefaults(defineProps<{
  label?: string;
  hasContent?: boolean;
  type?: 'primary' | 'success' | 'warning' | 'info' | 'danger';
}>(), {
  label: '填入参考样例',
  hasContent: false,
  type: 'primary',
});

const emit = defineEmits<{ fill: [] }>();

async function fillSample() {
  if (props.hasContent) {
    try {
      await ElMessageBox.confirm(
        '当前表单已经填写了内容。继续会用参考样例覆盖当前输入，但不会自动保存。',
        '覆盖并填入样例？',
        { confirmButtonText: '覆盖并填入', cancelButtonText: '保留当前内容', type: 'warning' },
      );
    } catch {
      return;
    }
  }
  emit('fill');
}
</script>
