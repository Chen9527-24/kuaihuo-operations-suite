<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增配置资产' : '编辑配置资产'" width="680px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="资产编码" prop="key">
        <el-input v-model="form.key" :disabled="mode === 'edit'" placeholder="例如 after-sale-basic-policy" />
      </el-form-item>
      <el-form-item label="资产名称" prop="name">
        <el-input v-model="form.name" maxlength="120" show-word-limit />
      </el-form-item>
      <el-form-item label="资产类型" prop="assetType">
        <el-select v-model="form.assetType" :disabled="mode === 'edit'" class="w-full">
          <el-option v-for="item in assetTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="mode === 'edit'" label="状态" prop="status">
        <el-select v-model="form.status" class="w-full">
          <el-option v-for="item in customerServiceAssetStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="说明">
        <el-input v-model="form.description" type="textarea" :rows="4" maxlength="2000" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { customerServiceAssetStatusOptions, customerServiceAssetTypeOptions } from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceAsset, CustomerServiceAssetStatus, CustomerServiceAssetType } from '@/modules/customer-service/types/assets.types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: CustomerServiceAsset | null;
  submitting?: boolean;
  allowedTypes?: readonly CustomerServiceAssetType[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [value: typeof form] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const assetTypeOptions = computed(() => props.allowedTypes?.length
  ? customerServiceAssetTypeOptions.filter((item) => props.allowedTypes!.includes(item.value))
  : customerServiceAssetTypeOptions);
const form = reactive({
  key: '',
  name: '',
  assetType: 'RESPONSE_POLICY' as CustomerServiceAssetType,
  description: '',
  status: 'DRAFT' as CustomerServiceAssetStatus,
  revision: 1
});
const rules: FormRules = {
  key: [
    { required: true, message: '请输入资产编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '仅支持字母、数字、点、下划线和短横线', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入资产名称', trigger: 'blur' }],
  assetType: [{ required: true, message: '请选择资产类型', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, {
      key: props.initialData?.key ?? '',
      name: props.initialData?.name ?? '',
      assetType: props.initialData?.assetType ?? props.allowedTypes?.[0] ?? 'RESPONSE_POLICY',
      description: props.initialData?.description ?? '',
      status: props.initialData?.status ?? 'DRAFT',
      revision: props.initialData?.revision ?? 1
    });
  }
);

async function submit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
