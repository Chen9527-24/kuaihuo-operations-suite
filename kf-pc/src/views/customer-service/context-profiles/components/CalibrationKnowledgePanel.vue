<template>
  <div>
    <div class="tab-description">
      <div>
        <strong>按账号查看校准证据、策略状态和事实知识修订</strong>
        <p>反馈、AI 分析和草稿都不等于生产生效。只有事实问题可以形成知识修订草稿，并且必须人工核实、再次确认发布后才进入正式业务知识。</p>
      </div>
      <HelpTip title="校准如何真正生效" content="普通表达问题仍走策略草稿、全量回归和人工发布；事实问题走知识修订草稿、人工核实和发布。两条链路都不会因为一次负反馈自动改生产。" />
    </div>

    <el-alert v-if="!canRead" title="当前账号没有查看校准沉淀的权限" type="warning" :closable="false" show-icon class="mb-4" />
    <div v-else class="toolbar">
      <el-select v-model="accountProfileId" filterable placeholder="选择账号资料" @change="load">
        <el-option v-for="item in accounts" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="status" clearable placeholder="全部校准状态" @change="load">
        <el-option v-for="item in calibrationStatusOptions" :key="item.value" v-bind="item" />
      </el-select>
      <el-select v-model="problemType" clearable placeholder="全部问题类型" @change="load">
        <el-option label="事实问题" value="FACT_ERROR" />
        <el-option label="表达/策略问题" value="OTHER_BEHAVIOR" disabled />
      </el-select>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-empty v-if="canRead && !accountProfileId" description="请先选择一份账号资料" />
    <el-table v-else-if="canRead" v-loading="loading" :data="items" row-key="id">
      <el-table-column label="校准证据" min-width="300">
        <template #default="{ row }">
          <strong>{{ row.customerMessage }}</strong>
          <div class="muted">原回复：{{ row.originalReply }}</div>
          <div class="tags"><el-tag v-for="type in row.problemTypes" :key="type" size="small" type="warning">{{ problemLabel(type) }}</el-tag></div>
        </template>
      </el-table-column>
      <el-table-column label="校准状态" width="135">
        <template #default="{ row }"><el-tag :type="calibrationStatusType(row.status)">{{ calibrationStatusLabel(row.status) }}</el-tag></template>
      </el-table-column>
      <el-table-column label="正式策略" min-width="170">
        <template #default="{ row }">
          <span v-if="row.strategyDraftStatus">{{ strategyStatusLabel(row.strategyDraftStatus) }}</span>
          <span v-else class="muted">尚未形成策略草稿</span>
        </template>
      </el-table-column>
      <el-table-column label="知识修订" min-width="190">
        <template #default="{ row }">
          <template v-if="row.knowledgeRevisionDraft">
            <el-tag :type="draftStatusType(row.knowledgeRevisionDraft.status)">{{ draftStatusLabel(row.knowledgeRevisionDraft.status) }}</el-tag>
            <div class="muted">{{ row.knowledgeRevisionDraft.action === 'UPDATE' ? '修订' : '新增' }}：{{ row.knowledgeRevisionDraft.title }}</div>
          </template>
          <span v-else class="muted">{{ row.problemTypes.includes('FACT_ERROR') ? '尚未生成知识草稿' : '不适用' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canUpdate && row.problemTypes.includes('FACT_ERROR') && !row.knowledgeRevisionDraft" link type="primary" @click="openDraft(row)">生成知识草稿</el-button>
          <el-button v-if="canUpdate && row.knowledgeRevisionDraft?.status === 'DRAFT'" link type="success" @click="verifyDraft(row)">人工核实</el-button>
          <el-button v-if="canPublish && row.knowledgeRevisionDraft?.status === 'VERIFIED'" link type="danger" @click="publishDraft(row)">发布正式知识</el-button>
          <el-button link @click="openDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="draftDialog" title="生成事实知识修订草稿" width="min(820px, 96vw)" destroy-on-close>
      <el-alert title="这里保存的是待核实草稿，不会立即进入正式回复。请只填写已经有可靠来源、可由人工确认的业务事实。" type="warning" :closable="false" show-icon class="mb-4" />
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="作用范围"><el-select v-model="draftForm.scopeType" class="w-full" @change="scopeChanged"><el-option label="当前账号" value="ACCOUNT" /><el-option label="整家店铺" value="STORE" :disabled="!selectedAccount?.storeProfileId" /></el-select></el-form-item>
          <el-form-item label="分类"><el-select v-model="draftForm.category" class="w-full"><el-option v-for="item in categoryOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        </div>
        <el-form-item label="修订已有知识（选填）">
          <el-select v-model="draftForm.targetEntryId" clearable filterable class="w-full" placeholder="不选择则新增一条知识" @change="fillFromTarget">
            <el-option v-for="item in knowledgeCandidates" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="draftForm.title" /></el-form-item>
        <el-form-item label="常见问法"><el-input v-model="draftForm.question" /></el-form-item>
        <el-form-item label="已核实的知识内容"><el-input v-model="draftForm.content" type="textarea" :rows="6" placeholder="不要直接复制模型猜测；请填写可由订单、商品、制度或业务负责人证明的事实。" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="标签"><el-input v-model="draftForm.tagsText" placeholder="逗号分隔" /></el-form-item>
          <el-form-item label="事实来源"><el-input v-model="draftForm.sourceReference" placeholder="例如：售后政策 2026-08 版、商品后台" /></el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="生效时间"><el-date-picker v-model="draftForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" class="w-full" clearable /></el-form-item>
          <el-form-item label="失效时间"><el-date-picker v-model="draftForm.effectiveTo" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" class="w-full" clearable /></el-form-item>
        </div>
        <el-form-item label="时效说明"><el-input v-model="draftForm.freshnessPolicy" placeholder="例如：活动结束后必须停用；库存和价格以实时接口为准" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="draftDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDraft">保存待核实草稿</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailDrawer" title="校准沉淀详情" size="min(720px, 96vw)">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="客户消息">{{ detail.customerMessage }}</el-descriptions-item>
          <el-descriptions-item label="原回复">{{ detail.originalReply }}</el-descriptions-item>
          <el-descriptions-item label="问题说明">{{ detail.problemDescription || '—' }}</el-descriptions-item>
          <el-descriptions-item label="人工建议">{{ detail.userSuggestion || '—' }}</el-descriptions-item>
          <el-descriptions-item label="校准状态">{{ calibrationStatusLabel(detail.status) }}</el-descriptions-item>
          <el-descriptions-item label="策略状态">{{ detail.strategyDraftStatus ? strategyStatusLabel(detail.strategyDraftStatus) : '尚未形成' }}</el-descriptions-item>
          <el-descriptions-item label="知识草稿状态">{{ detail.knowledgeRevisionDraft ? draftStatusLabel(detail.knowledgeRevisionDraft.status) : '尚未形成' }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.knowledgeRevisionDraft?.verificationNote" label="人工核实说明">{{ detail.knowledgeRevisionDraft.verificationNote }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.knowledgeRevisionDraft?.publishedAt" label="正式发布时间">{{ new Date(detail.knowledgeRevisionDraft.publishedAt).toLocaleString() }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import HelpTip from '@/components/common/HelpTip.vue';
import {
  createCustomerServiceKnowledgeRevisionDraft,
  listCustomerServiceCalibrations,
  publishCustomerServiceKnowledgeRevisionDraft,
  verifyCustomerServiceKnowledgeRevisionDraft,
} from '@/modules/customer-service/api/calibrations.api';
import { listCustomerServiceKnowledgeEntries } from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceCalibrationRecord } from '@/modules/customer-service/types/calibrations.types';
import type { CustomerServiceAccountProfile, CustomerServiceKnowledgeEntry, CustomerServiceStoreProfile } from '@/modules/customer-service/types/context-profiles.types';

const props = defineProps<{ accounts: CustomerServiceAccountProfile[]; stores: CustomerServiceStoreProfile[]; canRead: boolean; canUpdate: boolean; canPublish: boolean }>();
const accountProfileId = ref('');
const status = ref('');
const problemType = ref('');
const loading = ref(false);
const saving = ref(false);
const items = ref<CustomerServiceCalibrationRecord[]>([]);
const draftDialog = ref(false);
const detailDrawer = ref(false);
const detail = ref<CustomerServiceCalibrationRecord | null>(null);
const currentRecord = ref<CustomerServiceCalibrationRecord | null>(null);
const knowledgeCandidates = ref<CustomerServiceKnowledgeEntry[]>([]);
const selectedAccount = computed(() => props.accounts.find((item) => item.id === accountProfileId.value));
const draftForm = reactive({ scopeType: 'ACCOUNT' as 'ACCOUNT'|'STORE', category: 'BRAND_FACT' as 'FAQ'|'PRODUCT'|'SERVICE_POLICY'|'BRAND_FACT'|'ACTIVITY'|'OTHER', targetEntryId: '', title: '', question: '', content: '', tagsText: '', sourceReference: '', effectiveFrom: '', effectiveTo: '', freshnessPolicy: '' });
const categoryOptions = [
  {label:'常见问题',value:'FAQ'},{label:'商品知识',value:'PRODUCT'},{label:'服务政策',value:'SERVICE_POLICY'},
  {label:'品牌事实',value:'BRAND_FACT'},{label:'活动说明',value:'ACTIVITY'},{label:'其他',value:'OTHER'},
];
const calibrationStatusOptions = [
  {label:'反馈已保存',value:'OPEN'},{label:'AI 已分析',value:'AI_ANALYZED'},{label:'已确认方向',value:'ACCEPTED'},
  {label:'已保存调优证据',value:'APPLIED_TUNING'},{label:'已归档',value:'ARCHIVED'},
];

onMounted(() => { if (props.accounts[0]) accountProfileId.value = props.accounts[0].id; if (props.canRead) load(); });
watch(() => props.accounts, (value) => { if (!accountProfileId.value && value[0]) { accountProfileId.value=value[0].id; load(); } }, { deep:true });
async function load() {
  if (!props.canRead) { items.value=[]; return; }
  if (!accountProfileId.value) { items.value=[]; return; }
  loading.value=true;
  try {
    const result=await listCustomerServiceCalibrations({ accountProfileId:accountProfileId.value, status:status.value||undefined, problemType:problemType.value==='FACT_ERROR'?'FACT_ERROR':undefined, page:1, pageSize:100 });
    items.value=result.items;
  } finally { loading.value=false; }
}
async function loadKnowledgeCandidates() {
  const account=selectedAccount.value;
  const scopeKey=draftForm.scopeType==='ACCOUNT'?account?.id:account?.storeProfileId;
  if (!scopeKey) { knowledgeCandidates.value=[]; return; }
  const result=await listCustomerServiceKnowledgeEntries({ scopeType:draftForm.scopeType, scopeKey, page:1, pageSize:100 });
  knowledgeCandidates.value=result.items;
}
async function openDraft(row:CustomerServiceCalibrationRecord) {
  currentRecord.value=row;
  Object.assign(draftForm,{scopeType:'ACCOUNT',category:'BRAND_FACT',targetEntryId:'',title:(row.problemDescription||row.customerMessage).slice(0,200),question:row.customerMessage,content:row.userSuggestion||'',tagsText:'',sourceReference:`校准记录 ${row.id}`,effectiveFrom:'',effectiveTo:'',freshnessPolicy:''});
  await loadKnowledgeCandidates(); draftDialog.value=true;
}
async function scopeChanged() { draftForm.targetEntryId=''; await loadKnowledgeCandidates(); }
function fillFromTarget(id:string) { const item=knowledgeCandidates.value.find((entry)=>entry.id===id); if (!item) return; Object.assign(draftForm,{category:item.category,title:item.title,question:item.question||'',content:item.content,tagsText:(item.tags||[]).join(','),sourceReference:item.sourceReference||'',effectiveFrom:item.effectiveFrom||'',effectiveTo:item.effectiveTo||'',freshnessPolicy:item.freshnessPolicy||''}); }
async function saveDraft() {
  const row=currentRecord.value;
  if (!row || !draftForm.title.trim() || !draftForm.content.trim() || !draftForm.sourceReference.trim()) return ElMessage.warning('请填写标题、已核实知识内容和事实来源');
  saving.value=true;
  try {
    const updated=await createCustomerServiceKnowledgeRevisionDraft(row.id,{ targetEntryId:draftForm.targetEntryId||undefined,scopeType:draftForm.scopeType,category:draftForm.category,title:draftForm.title.trim(),question:draftForm.question.trim()||undefined,content:draftForm.content.trim(),tags:draftForm.tagsText.split(/[,，]/).map((item)=>item.trim()).filter(Boolean),sourceReference:draftForm.sourceReference.trim(),effectiveFrom:draftForm.effectiveFrom||undefined,effectiveTo:draftForm.effectiveTo||undefined,freshnessPolicy:draftForm.freshnessPolicy.trim()||undefined });
    replaceItem(updated); draftDialog.value=false; ElMessage.success('知识修订草稿已保存，尚未进入生产');
  } finally { saving.value=false; }
}
async function verifyDraft(row:CustomerServiceCalibrationRecord) {
  const draft=row.knowledgeRevisionDraft; if (!draft) return;
  const { value }=await ElMessageBox.prompt('请写明核实依据，例如政策文档、商品后台或业务负责人确认。','人工核实事实',{confirmButtonText:'确认已核实',cancelButtonText:'取消',inputType:'textarea',inputValidator:(value)=>String(value||'').trim().length>=2||'请填写核实依据'});
  const updated=await verifyCustomerServiceKnowledgeRevisionDraft(row.id,draft.revision,String(value).trim()); replaceItem(updated); ElMessage.success('事实已人工核实，仍需单独发布才会进入正式知识');
}
async function publishDraft(row:CustomerServiceCalibrationRecord) {
  const draft=row.knowledgeRevisionDraft; if (!draft) return;
  await ElMessageBox.confirm(`确认将“${draft.title}”发布为正式启用知识？发布后新回复可能命中该事实。`,'发布正式知识',{type:'warning',confirmButtonText:'确认发布'});
  const updated=await publishCustomerServiceKnowledgeRevisionDraft(row.id,draft.revision); replaceItem(updated); ElMessage.success('已发布正式知识；后续新 Reply Trace 可证明是否命中');
}
function replaceItem(updated:CustomerServiceCalibrationRecord) { const index=items.value.findIndex((item)=>item.id===updated.id); if (index>=0) items.value.splice(index,1,updated); detail.value=updated; }
function openDetail(row:CustomerServiceCalibrationRecord) { detail.value=row; detailDrawer.value=true; }
function problemLabel(value:string) { return ({FACT_ERROR:'事实问题',AI_TONE:'AI 感强',REDUNDANT:'废话过多',REPETITIVE:'重复表达',UNNATURAL:'语气不自然',ROLE_INCONSISTENT:'角色不一致',WORKFLOW_ERROR:'流程问题',UNDERSTANDING_MISCLASSIFICATION:'意图识别误判',OTHER:'其他'} as Record<string,string>)[value]||value; }
function calibrationStatusLabel(value:string) { return calibrationStatusOptions.find((item)=>item.value===value)?.label||value; }
function calibrationStatusType(value:string):'success'|'warning'|'info'|'danger' { return value==='APPLIED_TUNING'?'success':value==='ARCHIVED'?'info':value==='OPEN'?'warning':'info'; }
function strategyStatusLabel(value:string) { return ({DRAFT:'策略草稿待回归',REGRESSION_PASSED:'回归通过，待发布',REGRESSION_FAILED:'回归失败',PUBLISHED:'策略已发布',SUPERSEDED:'已被新版本替代'} as Record<string,string>)[value]||value; }
function draftStatusLabel(value:string) { return ({DRAFT:'待人工核实',VERIFIED:'已核实，待发布',PUBLISHED:'已发布正式知识',REJECTED:'已驳回'} as Record<string,string>)[value]||value; }
function draftStatusType(value:string):'success'|'warning'|'info'|'danger' { return value==='PUBLISHED'?'success':value==='VERIFIED'?'warning':value==='REJECTED'?'info':'warning'; }
</script>

<style scoped>
.tab-description{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:15px;border-radius:10px;background:var(--el-fill-color-lighter);padding:12px 14px}.tab-description p,.muted{margin:4px 0 0;color:var(--el-text-color-secondary);font-size:12px;line-height:1.6}.toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 160px 160px auto;gap:10px;margin-bottom:16px}.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}@media(max-width:900px){.toolbar,.form-grid{grid-template-columns:1fr}}
</style>
