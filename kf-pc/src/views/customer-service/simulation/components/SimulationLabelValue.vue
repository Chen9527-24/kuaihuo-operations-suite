<template>
  <div class="rounded-lg bg-slate-50 px-3 py-2">
    <div class="text-xs text-slate-500">{{ label }}</div>
    <div class="mt-1 font-medium">{{ value }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string }>();
</script>
