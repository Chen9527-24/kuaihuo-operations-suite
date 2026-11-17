<template>
  <el-card shadow="never" class="mb-4">
    <template #header><span class="text-sm font-medium">{{ title }}</span></template>
    <div class="grid gap-4 md:grid-cols-2">
      <el-form-item label="业务场景" :label-width="compact ? '90px' : '100px'">
        <el-select v-model="model.scenarios" class="w-full" multiple filterable allow-create default-first-option collapse-tags collapse-tags-tooltip placeholder="选择或输入场景编码">
          <el-option v-for="item in customerServiceScenarioOptions" :key="item.value" :label="`${item.label}（${item.value}）`" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="客户意图" :label-width="compact ? '90px' : '100px'">
        <el-select v-model="model.intents" class="w-full" multiple filterable allow-create default-first-option collapse-tags collapse-tags-tooltip placeholder="选择或输入意图编码">
          <el-option v-for="item in customerServiceIntentOptions" :key="item.value" :label="`${item.label}（${item.value}）`" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="风险等级" :label-width="compact ? '90px' : '100px'">
        <el-select v-model="model.riskLevels" class="w-full" multiple collapse-tags placeholder="不限风险">
          <el-option v-for="item in customerServiceRiskLevelOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="行业节点" :label-width="compact ? '90px' : '100px'">
        <el-select v-model="model.industryNodeIds" class="w-full" multiple filterable collapse-tags collapse-tags-tooltip placeholder="不限行业节点">
          <el-option v-for="item in industryOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="行业编码" :label-width="compact ? '90px' : '100px'" class="md:col-span-2">
        <el-select v-model="model.industryCodes" class="w-full" multiple filterable allow-create default-first-option collapse-tags collapse-tags-tooltip placeholder="可选；用于跨环境稳定匹配行业编码" />
      </el-form-item>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { customerServiceIntentOptions, customerServiceRiskLevelOptions, customerServiceScenarioOptions } from '@/modules/customer-service/constants/foundation.constants';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceRuleConditionForm } from '@/modules/customer-service/types/rule-conditions.types';
const props = defineProps<{ modelValue: CustomerServiceRuleConditionForm; title: string; industries: CustomerServiceIndustryNode[]; compact?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: CustomerServiceRuleConditionForm] }>();
const model = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const industryOptions = computed(() => props.industries.map((item) => ({ value: item.id, label: item.path || item.name })));
</script>
