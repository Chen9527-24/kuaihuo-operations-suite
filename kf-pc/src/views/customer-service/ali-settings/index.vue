<template>
  <div class="space-y-4 ali-settings-page">
    <PageToolbar
      v-if="!props.embedded"
      title="默认角色设置"
      description="系统已内置可直接使用的默认角色与生成 Prompt。普通账号直接继承；只有要调整所有使用该角色的账号共性时才修改这里。"
    />

    <el-skeleton v-if="loading" :rows="8" animated />
    <div v-else-if="!ali" class="empty-default-role">
      <el-empty description="系统默认角色尚未初始化">
        <el-button v-if="canSyncAli" type="primary" :loading="syncing" @click="syncFlagship">初始化系统默认角色</el-button>
      </el-empty>
    </div>
    <template v-else>
      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="默认配置已经可以直接使用"
        description="新账号默认使用系统推荐角色并继承这里的生成 Prompt；当前账号只有确实需要不同表达/参与方式时，才在“账号配置”开启身份 Prompt 覆盖。"
      />

      <div class="grid gap-3 md:grid-cols-3">
        <div class="summary-card"><span>默认角色</span><strong>{{ ali.name }}</strong></div>
        <div class="summary-card"><span>角色生成 Prompt</span><strong>{{ ali.generationPrompt ? '已配置 · 自动继承' : '等待系统默认值' }}</strong></div>
        <div class="summary-card"><span>当前基础能力</span><strong>{{ enabledModules.length }} 项已启用</strong></div>
      </div>

      <el-tabs v-model="activeSettingsTab" class="friendly-tabs">
        <el-tab-pane label="角色生成 Prompt" name="prompt">
          <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <el-card shadow="never">
              <template #header>
                <div class="section-heading">
                  <div>
                    <strong>默认生成 Prompt</strong>
                    <p>所有选择当前角色且没有身份覆盖的账号都会自动继承这里。</p>
                  </div>
                  <el-button v-if="canUpdate" type="primary" :loading="savingPrompt" @click="saveGenerationPrompt">保存 Prompt</el-button>
                </div>
              </template>
              <el-input
                v-model="promptDraft"
                type="textarea"
                :rows="14"
                maxlength="12000"
                show-word-limit
                placeholder="描述这个角色在真实对话中应怎样自然参与、判断和表达。留空保存时会恢复系统推荐默认值。"
              />
              <div class="prompt-note">
                <strong>这里应该写什么？</strong>
                <p>只写角色稳定的生成/参与方式，例如直接程度、专业判断习惯、关系感、解释方式。回复具体措辞、自然长短和 1/N 条消息由成熟模型结合当前对话自行生成。</p>
                <p>不要写价格、库存、权限、真实执行结果、单句测试规则，也不要在这里定义 HVE_REPLY_V1 等机器输出协议。</p>
              </div>
            </el-card>

            <el-card shadow="never" class="h-fit">
              <template #header><div class="section-heading"><div><strong>继承关系</strong><p>一个入口看清 Prompt 从哪里来</p></div></div></template>
              <div class="inheritance-list">
                <div><span>角色默认</span><b>本页配置</b></div>
                <div><span>账号身份差异</span><b>账号配置 · 可选覆盖</b></div>
                <div><span>事实 / 权限 / 执行</span><b>知识与系统真值</b></div>
                <div><span>输出格式</span><b>系统协议</b></div>
              </div>
              <p class="inheritance-tip">最终只编译成一份 Model-Facing Prompt，不让多个平级配置争夺同一生成决策。</p>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane label="默认身份" name="identity">
          <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <el-card shadow="never">
              <template #header>
                <div class="section-heading">
                  <div><strong>默认角色是谁</strong><p>这是系统推荐角色的稳定身份；具体账号岗位身份仍由账号配置决定。</p></div>
                  <div class="flex items-center gap-2">
                    <HelpTip title="默认身份" content="这里维护角色共性，不写某个具体店铺、行业、商品或账号岗位身份。账号可以选择其他已启用角色。" />
                    <el-button v-if="canUpdate" type="primary" plain @click="openEdit">修改角色资料</el-button>
                  </div>
                </div>
              </template>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="公开身份">{{ ali.publicIdentity || '店铺专属服务顾问' }}</el-descriptions-item>
                <el-descriptions-item label="对外关系">{{ ali.publicRelation || '服务顾问' }}</el-descriptions-item>
                <el-descriptions-item label="角色定位">{{ ali.prototype.identity || '未填写' }}</el-descriptions-item>
                <el-descriptions-item label="性格">{{ ali.prototype.personality || '未填写' }}</el-descriptions-item>
                <el-descriptions-item label="说话方向">{{ ali.prototype.languageStyle || '未填写' }}</el-descriptions-item>
                <el-descriptions-item label="服务姿态">{{ ali.prototype.servicePosture || '未填写' }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <el-card shadow="never" class="h-fit">
              <template #header><div class="section-heading"><div><strong>普通使用只看两处</strong><p>避免配置分散</p></div></div></template>
              <div class="inheritance-list">
                <div><span>改角色共性 / 默认 Prompt</span><b>角色配置</b></div>
                <div><span>改具体账号身份 / Prompt 差异</span><b>账号配置</b></div>
                <div><span>商品 / 价格 / 售后事实</span><b>知识与流程</b></div>
              </div>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane label="高级维护" name="advanced">
          <el-alert title="这里仅用于首次初始化、升级兼容或管理员排障。普通使用者不需要操作。" type="warning" :closable="false" show-icon class="mb-4" />
          <el-card v-if="maintenanceIssues.length" shadow="never" class="mb-4">
            <template #header><div class="section-heading"><div><strong>系统基线诊断</strong><p>只在高级维护显示，不影响日常配置入口</p></div></div></template>
            <ul class="maintenance-list"><li v-for="item in maintenanceIssues" :key="item">{{ item }}</li></ul>
            <el-button v-if="canSyncAli" type="warning" plain :loading="syncing" @click="syncFlagship">补齐系统推荐基线</el-button>
          </el-card>
          <el-card shadow="never" class="mb-4">
            <template #header><div class="section-heading"><div><strong>确定性策略配置</strong><p>仅在确实需要机器可审计的确定性策略时维护</p></div></div></template>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              title="自然表达不在这里调教"
              description="普通语气、自然长短、提问方式、断句和 1/N 条消息由角色/身份 Prompt 与成熟模型在一次生成中完成；这里不再承担第二套生成规则。"
              class="mb-4"
            />
            <StrategyGroupsPanel title="高级确定性策略" />
          </el-card>
          <div class="grid gap-4 xl:grid-cols-2">
            <el-card shadow="never">
              <template #header>
                <div class="section-heading">
                  <div><strong>基础能力模块</strong><p>系统级构件；普通使用保持推荐状态</p></div>
                  <div class="flex items-center gap-2"><HelpTip title="能力模块" content="能力模块只负责确定性基础能力与边界，不应该重复承担模型生成风格。" /><el-button v-if="canReadModules" link type="primary" @click="modulesOpen = true">管理模块</el-button></div>
                </div>
              </template>
              <div class="module-list">
                <div v-for="item in modules" :key="item.id" class="module-row">
                  <div><strong>{{ item.name }}</strong><p>{{ moduleSummary(item.content) }}</p></div>
                  <el-tag :type="item.status === 'ENABLED' ? 'success' : 'info'">{{ item.status === 'ENABLED' ? '已启用' : '已停用' }}</el-tag>
                </div>
              </div>
            </el-card>
            <el-card shadow="never">
              <template #header><div class="section-heading"><div><strong>初始化 / 升级维护</strong><p>不作为日常工作流</p></div></div></template>
              <p class="advanced-copy">只有首次安装、旧版本升级后确实缺少系统基线时才需要补齐。系统不会因为普通角色 Prompt 被你修改，就要求恢复旧版默认角色或重置你的配置。</p>
              <el-button v-if="canSyncAli" :loading="syncing" @click="syncFlagship">补齐系统推荐基线</el-button>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <MerchantRoleFormDialog v-if="ali" v-model="formOpen" mode="edit" context="ali" :initial-data="ali" :prototypes="prototypes" :industry-options="industryOptions" :submitting="submitting" @submit="saveRole" />
    <RoleModulesDrawer v-model="modulesOpen" :role="ali" @changed="load" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { listCustomerServiceIndustryNodes } from '@/modules/customer-service/api/industries.api';
import { syncCustomerServiceAliFlagship } from '@/modules/customer-service/api/foundation.api';
import { listCustomerServiceMerchantRoles, listCustomerServiceRoleModules, updateCustomerServiceMerchantRole } from '@/modules/customer-service/api/merchant-roles.api';
import { listCustomerServiceRolePrototypes } from '@/modules/customer-service/api/roles.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceMerchantRole, CustomerServiceRoleModuleInstance } from '@/modules/customer-service/types/merchant-roles.types';
import type { CustomerServiceRolePrototype, CustomerServiceRoleStatus } from '@/modules/customer-service/types/roles.types';
import MerchantRoleFormDialog from '../merchant-roles/components/MerchantRoleFormDialog.vue';
import RoleModulesDrawer from '../merchant-roles/components/RoleModulesDrawer.vue';
import StrategyGroupsPanel from './components/StrategyGroupsPanel.vue';

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const { has } = useCustomerServicePermission();
const activeSettingsTab = ref('prompt');
const loading = ref(false);
const submitting = ref(false);
const syncing = ref(false);
const savingPrompt = ref(false);
const promptDraft = ref('');
const ali = ref<CustomerServiceMerchantRole | null>(null);
const modules = ref<CustomerServiceRoleModuleInstance[]>([]);
const prototypes = ref<CustomerServiceRolePrototype[]>([]);
const industries = ref<CustomerServiceIndustryNode[]>([]);
const formOpen = ref(false);
const modulesOpen = ref(false);
const canUpdate = computed(() => has('customer-service:merchant-role:update'));
const canSyncAli = computed(() => has('customer-service:foundation:initialize'));
const canReadModules = computed(() => has('customer-service:role-module:read'));
const enabledModules = computed(() => modules.value.filter((item) => item.status === 'ENABLED'));
const requiredSystemModuleKeys = ['ali-flagship-identity', 'ali-role-interaction-posture-v1', 'ali-motive-relationship-first', 'ali-natural-value-business', 'ali-flagship-boundaries'];
const maintenanceIssues = computed(() => {
  if (!ali.value) return [];
  const issues: string[] = [];
  const enabledKeys = new Set(enabledModules.value.map((item) => item.key));
  if (ali.value.industryNodeId) issues.push('系统推荐默认角色仍绑定了具体行业；建议补齐系统推荐基线。');
  if (!ali.value.publicRelation) issues.push('系统推荐默认角色缺少对外关系。');
  if (requiredSystemModuleKeys.some((key) => !enabledKeys.has(key))) issues.push('系统推荐基础能力模块存在缺失。');
  if (!ali.value.prototype.identity || !ali.value.prototype.personality || !ali.value.prototype.languageStyle || !ali.value.prototype.servicePosture) issues.push('系统推荐角色模板字段存在缺失。');
  return issues;
});
const industryOptions = computed(() => buildIndustryOptions(industries.value));

onMounted(load);
async function load() {
  loading.value = true;
  try {
    const [roleResult, prototypeResult, industryResult] = await Promise.all([
      listCustomerServiceMerchantRoles({ keyword: 'ali', status: '', page: 1, pageSize: 50 }),
      listCustomerServiceRolePrototypes({ keyword: '', status: '', page: 1, pageSize: 500 }),
      listCustomerServiceIndustryNodes()
    ]);
    ali.value = roleResult.items.find((item) => item.code === 'ali') ?? null;
    promptDraft.value = ali.value?.generationPrompt || '';
    prototypes.value = prototypeResult.items.filter((item) => item.status !== 'ARCHIVED');
    industries.value = industryResult.filter((item) => item.status !== 'ARCHIVED');
    modules.value = ali.value ? await listCustomerServiceRoleModules(ali.value.id) : [];
  } finally { loading.value = false; }
}
async function syncFlagship() {
  syncing.value = true;
  try {
    await syncCustomerServiceAliFlagship();
    ElMessage.success('系统推荐角色基线已补齐；你已经修改过的角色生成 Prompt 不会被覆盖');
    await load();
  } finally { syncing.value = false; }
}
async function saveGenerationPrompt() {
  if (!ali.value) return;
  savingPrompt.value = true;
  try {
    const updated = await updateCustomerServiceMerchantRole(ali.value.id, {
      name: ali.value.name,
      prototypeId: ali.value.prototypeId,
      industryNodeId: ali.value.industryNodeId,
      publicRelation: ali.value.publicRelation || '',
      publicIdentity: ali.value.publicIdentity || '',
      description: ali.value.description || '',
      generationPrompt: promptDraft.value,
      status: ali.value.status,
      revision: ali.value.revision,
    });
    ali.value = updated;
    promptDraft.value = updated.generationPrompt || '';
    ElMessage.success('角色生成 Prompt 已保存；未开启身份覆盖的账号会自动继承');
  } finally { savingPrompt.value = false; }
}
function openEdit() { formOpen.value = true; }
async function saveRole(form: { name: string; prototypeId: string; industryNodeId: string; publicRelation: string; publicIdentity: string; description: string; generationPrompt: string; status: CustomerServiceRoleStatus; revision: number }) {
  if (!ali.value) return;
  submitting.value = true;
  try {
    await updateCustomerServiceMerchantRole(ali.value.id, {
      name: form.name, prototypeId: form.prototypeId, industryNodeId: form.industryNodeId || null,
      publicRelation: form.publicRelation, publicIdentity: form.publicIdentity, description: form.description,
      generationPrompt: promptDraft.value, status: form.status, revision: form.revision
    });
    formOpen.value = false;
    ElMessage.success('默认角色资料已保存');
    await load();
  } finally { submitting.value = false; }
}
function moduleSummary(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rules = Array.isArray(record.rules) ? record.rules.filter((item): item is string => typeof item === 'string') : [];
  const forbidden = Array.isArray(record.forbidden) ? record.forbidden.filter((item): item is string => typeof item === 'string') : [];
  return [...rules, ...forbidden.map((item) => `禁止：${item}`)].slice(0, 4).join('；') || compactJson(value);
}
function compactJson(value: unknown) { const text = JSON.stringify(value); return text.length > 150 ? `${text.slice(0, 150)}…` : text; }
function buildIndustryOptions(nodes: CustomerServiceIndustryNode[]) {
  const map = new Map(nodes.map((item) => [item.id, item]));
  return nodes.map((item) => { const names = [item.name]; let parentId = item.parentId; while (parentId && map.has(parentId)) { const parent = map.get(parentId)!; names.unshift(parent.name); parentId = parent.parentId; } return { value: item.id, label: names.join(' / ') }; });
}
</script>

<style scoped>
.empty-default-role { border: 1px solid var(--el-border-color-lighter); border-radius: 14px; background: var(--el-bg-color); padding: 24px; }
.summary-card { min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: #fff; padding: 15px 16px; }
.summary-card span,
.summary-card strong { display: block; }
.summary-card span { color: var(--el-text-color-secondary); font-size: 12px; }
.summary-card strong { margin-top: 6px; overflow: hidden; color: var(--el-text-color-primary); font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.friendly-tabs { border: 1px solid var(--el-border-color-lighter); border-radius: 14px; background: #fff; padding: 0 16px 16px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.section-heading strong { color: var(--el-text-color-primary); }
.section-heading p { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
.prompt-note { margin-top: 14px; border-radius: 10px; background: var(--el-fill-color-lighter); padding: 13px 14px; }
.prompt-note strong { font-size: 13px; }
.prompt-note p { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.7; }
.inheritance-list { display: grid; gap: 10px; }
.inheritance-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-radius: 9px; background: var(--el-fill-color-lighter); padding: 11px 12px; font-size: 13px; }
.inheritance-list span { color: var(--el-text-color-secondary); }
.inheritance-list b { color: var(--el-color-primary); font-weight: 600; text-align: right; }
.inheritance-tip, .advanced-copy { margin: 12px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.7; }
.maintenance-list { margin: 0 0 14px; padding-left: 20px; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.8; }
.module-list { display: grid; gap: 10px; max-height: 520px; overflow: auto; }
.module-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 12px; }
.module-row p { margin: 5px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
</style>
