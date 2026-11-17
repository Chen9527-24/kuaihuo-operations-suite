<template>
  <div class="space-y-4 knowledge-center-page">
    <PageToolbar title="知识与流程" description="在一个入口维护回复所需的事实、问题识别、处理步骤和确定性表达，不再在多个技术菜单之间来回切换。" />

    <section class="ownership-grid">
      <button v-if="canReadContext" type="button" :class="{ active: activeTab === 'knowledge' }" @click="activeTab = 'knowledge'"><strong>业务知识</strong><span>商品、活动、物流、售后政策和 FAQ</span></button>
      <button v-if="canReadIntents" type="button" :class="{ active: activeTab === 'intents' }" @click="activeTab = 'intents'"><strong>客户意图与流程</strong><span>识别客户要办什么，以及需要经过哪些步骤</span></button>
      <button v-if="canReadDeterministic" type="button" :class="{ active: activeTab === 'deterministic' }" @click="activeTab = 'deterministic'"><strong>固定回复与必走流程</strong><span>先维护响应内容，再设置什么条件下触发</span></button>
      <button v-if="canReadPolicies" type="button" :class="{ active: activeTab === 'policies' }" @click="activeTab = 'policies'"><strong>表达限制</strong><span>禁用词、固定替换和绝对不能出现的表达</span></button>
    </section>

    <el-tabs v-model="activeTab" type="card" class="knowledge-tabs">
      <el-tab-pane v-if="canReadContext" label="业务知识" name="knowledge">
        <ContextProfiles v-if="activeTab === 'knowledge'" view-mode="knowledge" embedded />
      </el-tab-pane>
      <el-tab-pane v-if="canReadIntents" label="客户意图与流程" name="intents">
        <IntentCenter v-if="activeTab === 'intents'" />
      </el-tab-pane>
      <el-tab-pane v-if="canReadDeterministic" label="固定回复与必走流程" name="deterministic">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="这项能力仍被运行时使用，但不再拆成两个菜单"
          description="“响应内容”保存固定全文、模板、必含要点或步骤；“触发条件”决定在什么账号、场景、意图或风险下使用。它与普通知识不同，因为命中后属于必须执行的确定性要求。"
          class="mb-4"
        />
        <el-tabs v-model="deterministicTab" class="inner-tabs">
          <el-tab-pane v-if="canReadAssets" label="1. 响应内容" name="assets"><AssetCenter v-if="deterministicTab === 'assets'" mode="deterministic" /></el-tab-pane>
          <el-tab-pane v-if="canReadRules" label="2. 触发条件" name="rules"><ResponseRules v-if="deterministicTab === 'rules'" /></el-tab-pane>
        </el-tabs>
      </el-tab-pane>
      <el-tab-pane v-if="canReadPolicies" label="表达限制" name="policies">
        <ContextProfiles v-if="activeTab === 'policies'" view-mode="policies" embedded />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import ContextProfiles from '@/views/customer-service/context-profiles/index.vue';
import IntentCenter from '@/views/customer-service/intents/index.vue';
import AssetCenter from '@/views/customer-service/assets/index.vue';
import ResponseRules from '@/views/customer-service/response-rules/index.vue';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';

defineOptions({ name: 'CustomerServiceKnowledgeView' });
const { has } = useCustomerServicePermission();
const canReadContext = computed(() => has('customer-service:context-profile:read'));
const canReadIntents = computed(() => has('customer-service:response-rule:read'));
const canReadAssets = computed(() => has('customer-service:asset:read'));
const canReadRules = computed(() => has('customer-service:response-rule:read'));
const canReadDeterministic = computed(() => canReadAssets.value || canReadRules.value);
const canReadPolicies = canReadContext;
const activeTab = ref(canReadContext.value ? 'knowledge' : canReadIntents.value ? 'intents' : canReadDeterministic.value ? 'deterministic' : 'policies');
const deterministicTab = ref(canReadAssets.value ? 'assets' : 'rules');
</script>

<style scoped>
.ownership-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ownership-grid button { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: var(--el-bg-color); padding: 14px; text-align: left; cursor: pointer; transition: .16s ease; }
.ownership-grid button:hover, .ownership-grid button.active { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.ownership-grid strong, .ownership-grid span { display: block; }.ownership-grid span { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.55; }
.knowledge-tabs { border-radius: 14px; background: var(--el-bg-color); padding: 14px 16px 18px; }
.inner-tabs { border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 0 14px 16px; }
@media (max-width: 1100px) { .ownership-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) { .ownership-grid { grid-template-columns: 1fr; } }
</style>
