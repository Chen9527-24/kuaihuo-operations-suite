<template>
  <el-menu-item v-if="!item.children?.length" :index="item.path">
    <el-icon>
      <component :is="menuIconMap[item.icon] ?? Grid" />
    </el-icon>
    <template #title>{{ item.title }}</template>
  </el-menu-item>

  <el-sub-menu v-else :index="item.path" popper-class="app-menu-popper">
    <template #title>
      <el-icon>
        <component :is="menuIconMap[item.icon] ?? Grid" />
      </el-icon>
      <span>{{ item.title }}</span>
    </template>

    <SidebarMenuNode
      v-for="child in item.children"
      :key="child.path"
      :item="child"
    />
  </el-sub-menu>
</template>

<script setup lang="ts">
import { Grid } from '@element-plus/icons-vue';
import type { MenuItem } from '@/types';
import { menuIconMap } from './menuIcons';

defineProps<{
  item: MenuItem;
}>();
</script>
