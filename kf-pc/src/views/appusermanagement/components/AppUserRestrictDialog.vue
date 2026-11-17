<template>
  <el-dialog v-model="visible" title="限制 H5 用户接单" width="520px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
      <el-form-item label="限制天数" prop="days">
        <el-input-number v-model="form.days" :min="1" :max="365" class="!w-full" />
      </el-form-item>
      <el-form-item label="限制原因" prop="reason">
        <el-input v-model="form.reason" type="textarea" :rows="4" maxlength="255" show-word-limit placeholder="请输入限制原因，例如完成任务后删除评论" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确认限制</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'submit', value: { days: number; reason: string }): void;
}>();

const visible = ref(props.modelValue);
const formRef = ref<FormInstance>();
const form = reactive({ days: 7, reason: '' });
const rules: FormRules = {
  days: [{ required: true, message: '请输入限制天数', trigger: 'change' }],
  reason: [{ required: true, message: '请输入限制原因', trigger: 'blur' }]
};

watch(() => props.modelValue, (value) => {
  visible.value = value;
  if (value) {
    form.days = 7;
    form.reason = '';
  }
});
watch(visible, (value) => emit('update:modelValue', value));

async function handleSubmit() {
  await formRef.value?.validate();
  emit('submit', { days: Number(form.days), reason: form.reason.trim() });
}
</script>
