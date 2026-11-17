<template>
  <section :class="gridClass">
    <article v-for="item in items" :key="item.label" class="panel-surface p-5 shadow-panel">
      <div class="text-sm text-slate-500 dark:text-slate-400">{{ item.label }}</div>
      <div class="mt-2 text-2xl font-semibold">{{ item.value }}</div>
      <div v-if="item.tip" class="mt-2 text-xs text-slate-400">{{ item.tip }}</div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SummaryCardItem } from '../types';

const props = withDefaults(
  defineProps<{
    items: SummaryCardItem[];
    columns?: 3 | 4;
  }>(),
  {
    columns: 4
  }
);

const gridClass = computed(() =>
  props.columns === 3
    ? 'grid grid-cols-1 gap-4 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-4 xl:grid-cols-4'
);
</script>
