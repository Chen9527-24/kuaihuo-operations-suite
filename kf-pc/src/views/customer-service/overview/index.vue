<template><div /></template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

defineOptions({ name: 'CustomerServiceOverviewView' });
const router = useRouter();
onMounted(() => router.replace('/customer-service/auto-reply'));
</script>
