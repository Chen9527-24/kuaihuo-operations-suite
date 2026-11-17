<template>
  <div class="space-y-4 role-center-page">
    <PageToolbar title="角色配置" description="角色决定共性和默认生成 Prompt；账号配置选择角色并只在需要时覆盖身份差异。普通使用只需要这两个入口。" />

    <section class="ownership-note">
      <div><strong>角色默认 Prompt</strong><span>本页维护；所有选择该角色的账号自动继承</span></div>
      <div><strong>账号身份 / Prompt 差异</strong><span>去“账号配置”；默认不覆盖角色 Prompt</span></div>
      <div><strong>事实 / 权限 / 业务流程</strong><span>去“知识与流程”；不要写进 Prompt</span></div>
    </section>

    <el-tabs v-model="activeTab" type="card" class="role-tabs">
      <el-tab-pane v-if="canReadAli" label="默认角色 / Prompt" name="ali">
        <AliSettings embedded />
      </el-tab-pane>
      <el-tab-pane v-if="canReadRoleStructure" label="其他角色" name="structure">
        <el-alert type="info" :closable="false" show-icon title="只有确实需要不同角色共性时才新增角色" description="普通账号直接选择系统推荐默认角色即可；不同专业身份通常先用账号身份配置，不必为了每个账号再建一套角色。" class="mb-4" />
        <el-tabs v-model="structureTab" class="inner-tabs">
          <el-tab-pane v-if="canReadMerchantRoles" label="使用角色" name="merchant"><MerchantRoles embedded /></el-tab-pane>
          <el-tab-pane v-if="canReadRolePrototypes" label="角色模板（高级）" name="prototype"><RolePrototypes embedded /></el-tab-pane>
        </el-tabs>
      </el-tab-pane>
      <el-tab-pane v-if="canReadIndustries" label="行业能力（高级）" name="industries">
        <el-alert type="info" :closable="false" show-icon title="行业能力只放通用专业能力" description="某家店铺的商品、价格、活动和售后政策属于知识库，不要写在行业节点或生成 Prompt 里。" class="mb-4" />
        <Industries embedded />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import AliSettings from '@/views/customer-service/ali-settings/index.vue';
import MerchantRoles from '@/views/customer-service/merchant-roles/index.vue';
import RolePrototypes from '@/views/customer-service/roles/index.vue';
import Industries from '@/views/customer-service/industries/index.vue';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';

defineOptions({ name: 'CustomerServiceRoleCenterView' });
const { has } = useCustomerServicePermission();
const canReadAli = computed(() => has('customer-service:merchant-role:read') || has('customer-service:role-module:read'));
const canReadMerchantRoles = computed(() => has('customer-service:merchant-role:read'));
const canReadRolePrototypes = computed(() => has('customer-service:role-prototype:read'));
const canReadRoleStructure = computed(() => canReadMerchantRoles.value || canReadRolePrototypes.value);
const canReadIndustries = computed(() => has('customer-service:industry-node:read'));
const activeTab = ref(canReadAli.value ? 'ali' : canReadRoleStructure.value ? 'structure' : 'industries');
const structureTab = ref(canReadMerchantRoles.value ? 'merchant' : 'prototype');
</script>

<style scoped>
.ownership-note { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ownership-note > div { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: var(--el-bg-color); padding: 14px; }
.ownership-note strong, .ownership-note span { display: block; }
.ownership-note span { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.role-tabs { border-radius: 14px; background: var(--el-bg-color); padding: 14px 16px 18px; }
.inner-tabs { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 0 14px 16px; }
@media (max-width: 900px) { .ownership-note { grid-template-columns: 1fr; } }
</style>
