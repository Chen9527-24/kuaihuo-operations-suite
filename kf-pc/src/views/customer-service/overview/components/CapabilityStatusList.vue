<template>
  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    <div v-for="item in items" :key="item.key" class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between gap-3">
        <span class="font-medium text-slate-800">{{ item.name }}</span>
        <el-tag :type="item.status === 'READY' ? 'success' : 'info'" effect="light">
          {{ item.status === 'READY' ? '已就绪' : '待建设' }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomerServiceCapabilityItem } from '@/modules/customer-service/types/overview.types';

defineProps<{ items: CustomerServiceCapabilityItem[] }>();
</script>
