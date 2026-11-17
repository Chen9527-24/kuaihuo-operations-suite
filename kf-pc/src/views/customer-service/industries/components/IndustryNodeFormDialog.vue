<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增行业节点' : '编辑行业节点'" width="700px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item v-if="mode === 'create'" label="上级节点">
        <el-select v-model="form.parentId" class="w-full" clearable placeholder="不选择则创建根行业" @change="syncNodeType">
          <el-option v-for="item in parentOptions" :key="item.id" :label="`${'　'.repeat(item.level)}${item.name}`" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="mode === 'create'" label="节点类型" prop="nodeType">
        <el-select v-model="form.nodeType" class="w-full" disabled>
          <el-option v-for="item in customerServiceIndustryTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="mode === 'create'" label="节点编码" prop="code">
        <el-input v-model="form.code" placeholder="例如 ecommerce / womens-fashion" />
      </el-form-item>
      <el-form-item label="节点名称" prop="name">
        <el-input v-model="form.name" maxlength="120" show-word-limit />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="form.status" class="w-full">
          <el-option v-for="item in customerServiceIndustryStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="form.sort" :min="0" :max="9999" />
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
import {
  customerServiceIndustryStatusOptions,
  customerServiceIndustryTypeOptions
} from '@/modules/customer-service/constants/foundation.constants';
import type {
  CustomerServiceIndustryNode,
  CustomerServiceIndustryNodeType,
  CustomerServiceIndustryStatus
} from '@/modules/customer-service/types/industries.types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: CustomerServiceIndustryNode | null;
  defaultParentId?: string;
  nodes: CustomerServiceIndustryNode[];
  submitting?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [value: typeof form] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const parentOptions = computed(() => props.nodes.filter((item) => item.nodeType !== 'SUBCATEGORY' && item.status !== 'ARCHIVED'));
const formRef = ref<FormInstance>();
const form = reactive({
  parentId: '',
  code: '',
  name: '',
  nodeType: 'INDUSTRY' as CustomerServiceIndustryNodeType,
  description: '',
  status: 'ENABLED' as CustomerServiceIndustryStatus,
  sort: 0,
  revision: 1
});
const rules: FormRules = {
  code: [
    { required: true, message: '请输入节点编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '仅支持字母、数字、点、下划线和短横线', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入节点名称', trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, {
      parentId: props.mode === 'create' ? props.defaultParentId ?? '' : props.initialData?.parentId ?? '',
      code: props.initialData?.code ?? '',
      name: props.initialData?.name ?? '',
      nodeType: props.initialData?.nodeType ?? 'INDUSTRY',
      description: props.initialData?.description ?? '',
      status: props.initialData?.status ?? 'ENABLED',
      sort: props.initialData?.sort ?? 0,
      revision: props.initialData?.revision ?? 1
    });
    if (props.mode === 'create') syncNodeType();
  }
);

function syncNodeType() {
  const parent = props.nodes.find((item) => item.id === form.parentId);
  form.nodeType = !parent ? 'INDUSTRY' : parent.nodeType === 'INDUSTRY' ? 'CATEGORY' : 'SUBCATEGORY';
}

async function submit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
