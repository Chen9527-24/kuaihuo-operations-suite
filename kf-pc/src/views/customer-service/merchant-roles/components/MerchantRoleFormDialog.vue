<template>
  <el-dialog
    v-model="visible"
    :title="isAliContext ? '编辑系统推荐角色' : mode === 'create' ? '新增业务角色' : '编辑业务角色'"
    width="860px"
    top="6vh"
    destroy-on-close
  >
    <div class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div v-if="isAliContext">
        <div class="text-sm font-semibold text-slate-700">这是系统推荐的通用默认角色</div>
        <div class="mt-1 text-xs leading-5 text-slate-500">这里只维护默认角色长期稳定的角色关系；具体岗位身份请到“账号配置”，店铺事实和业务内容请到“知识与流程”。行业范围固定为全行业，角色模板不在这里切换。</div>
      </div>
      <div v-else>
        <div class="text-sm font-semibold text-slate-700">把通用角色原型绑定成业务角色</div>
        <div class="mt-1 text-xs text-slate-500">这里不提供行业身份测试预设；账号具体身份请在“账号配置”维护。</div>
      </div>
      <SampleFillButton v-if="mode === 'create' && !isAliContext" label="填入业务角色样例" :has-content="hasUserContent" @fill="fillSample" />
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="角色编码" prop="code"><el-input v-model="form.code" :disabled="mode === 'edit' || isAliContext" placeholder="例如 tech-support" /></el-form-item>
        <el-form-item label="角色名称" prop="name"><el-input v-model="form.name" maxlength="120" show-word-limit /></el-form-item>
        <el-form-item label="角色原型" prop="prototypeId">
          <el-select v-model="form.prototypeId" class="w-full" filterable :disabled="isAliContext" placeholder="选择角色原型"><el-option v-for="item in prototypes" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" /></el-select>
          <div v-if="isAliContext" class="mt-1 text-xs text-slate-500">系统推荐角色使用内置通用角色原型；系统基线维护已收进“角色配置 → 高级维护”；普通使用不需要操作。</div>
        </el-form-item>
        <el-form-item label="行业范围">
          <el-input v-if="isAliContext" model-value="全行业（固定）" disabled />
          <el-select v-else v-model="form.industryNodeId" class="w-full" clearable filterable placeholder="可不绑定"><el-option v-for="item in industryOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
          <div v-if="isAliContext" class="mt-1 text-xs text-slate-500">具体账号所属行业由“账号配置”决定。</div>
        </el-form-item>
        <el-form-item label="对外关系称谓" prop="publicRelation">
          <el-input v-model="form.publicRelation" maxlength="16" show-word-limit :placeholder="isAliContext ? '例如：服务顾问' : '例如：售后客服 / 技术支持 / 搭配师'" />
          <div class="mt-1 text-xs text-slate-500">这是客户能自然理解的人际/服务关系短称谓；平台、品牌、店铺名称和内部岗位说明请放到其他字段，具体岗位身份请放到“账号配置”。</div>
        </el-form-item>
        <el-form-item label="状态" prop="status"><el-select v-model="form.status" class="w-full"><el-option v-for="item in customerServiceRoleStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
      </div>
      <el-form-item :label="isAliContext ? '通用身份备注' : '业务身份备注'">
        <el-input v-model="form.publicIdentity" type="textarea" :rows="2" maxlength="1000" show-word-limit :placeholder="isAliContext ? '描述默认角色跨行业稳定的公开服务身份；不要写具体行业身份' : '角色业务身份/品牌关系备注；不会直接作为客户可见自我介绍'" />
      </el-form-item>
      <el-form-item :label="isAliContext ? '通用角色说明' : '角色说明'"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="2000" show-word-limit /></el-form-item>
      <el-form-item v-if="!isAliContext" label="角色默认生成 Prompt">
        <el-input v-model="form.generationPrompt" type="textarea" :rows="7" maxlength="12000" show-word-limit placeholder="描述这个角色在真实对话中应怎样自然参与、判断和表达。留空保存会使用系统推荐默认值。不要写价格、库存、权限、真实执行结果，也不要定义输出协议。" />
        <div class="mt-1 text-xs leading-5 text-slate-500">这是当前角色的默认生成指导，账号会自动继承；具体身份只在确实需要差异时做覆盖。事实、权限、业务知识、对话现实和输出协议仍由各自 Authority 管理。</div>
      </el-form-item>
    </el-form>

    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="submit">保存</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import { customerServiceRoleStatusOptions } from '@/modules/customer-service/constants/foundation.constants';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type { CustomerServiceRolePrototype, CustomerServiceRoleStatus } from '@/modules/customer-service/types/roles.types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  context?: 'ali' | 'generic';
  initialData?: CustomerServiceMerchantRole | null;
  prototypes: CustomerServiceRolePrototype[];
  industryOptions: Array<{ label: string; value: string }>;
  submitting?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [value: typeof form] }>();
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) });
const isAliContext = computed(() => props.context === 'ali' || props.initialData?.code === 'ali');
const formRef = ref<FormInstance>();
const form = reactive({ code: '', name: '', prototypeId: '', industryNodeId: '', publicRelation: '', publicIdentity: '', description: '', generationPrompt: '', status: 'DRAFT' as CustomerServiceRoleStatus, revision: 1 });
const hasUserContent = computed(() => Boolean(form.code.trim() || form.name.trim() || form.publicRelation.trim() || form.publicIdentity.trim() || form.description.trim() || form.generationPrompt.trim()));
const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }, { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: '仅支持字母、数字、点、下划线和短横线', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  prototypeId: [{ required: true, message: '请选择角色原型', trigger: 'change' }],
  publicRelation: [
    { required: true, message: '请填写客户可见的对外关系称谓', trigger: 'blur' },
    { validator: (_rule, value, callback) => validatePublicRelation(value, callback), trigger: 'blur' },
  ],
};

watch(() => props.modelValue, (open) => {
  if (!open) return;
  Object.assign(form, {
    code: props.initialData?.code ?? '', name: props.initialData?.name ?? '', prototypeId: props.initialData?.prototypeId ?? '',
    industryNodeId: isAliContext.value ? '' : props.initialData?.industryNodeId ?? '', publicRelation: props.initialData?.publicRelation ?? '', publicIdentity: props.initialData?.publicIdentity ?? '',
    description: props.initialData?.description ?? '', generationPrompt: props.initialData?.generationPrompt ?? '', status: props.initialData?.status ?? 'DRAFT', revision: props.initialData?.revision ?? 1,
  });
});

function validatePublicRelation(value: unknown, callback: (error?: Error) => void) {
  const text = String(value || '').trim().replace(/\s+/g, '');
  if (!text) return callback();
  if ([...text].length < 2) return callback(new Error('对外关系称谓过短，请填写客户能自然理解的称谓'));
  if ([...text].length > 16) return callback(new Error('对外关系称谓最多 16 个字，只保留客户能自然理解的短称谓'));
  if (/[·•|｜/\\＞>:：→—–]/u.test(text) || /(?:店铺业务|账号业务|平台业务|业务角色|内部角色|角色定位|岗位说明|业务)$/u.test(text)) {
    return callback(new Error('不要填写平台·品牌·岗位描述串；这里只写“售后客服 / 技术支持 / 销售顾问”这类关系称谓'));
  }
  callback();
}

function fillSample() {
  Object.assign(form, {
    code: `sample-role-${Date.now().toString(36)}`,
    name: '技术支持（参考）',
    prototypeId: props.prototypes[0]?.id ?? '', industryNodeId: '',
    publicRelation: '技术支持',
    publicIdentity: '通用业务技术支持角色；具体品牌、账号和专业资料由账号资料提供。',
    description: '虚构参考角色，用于说明角色层与账号身份/知识层分开维护。',
    generationPrompt: '以技术支持身份自然直接地解决当前问题。优先给可执行结论；只有缺少决定答案的关键信息时才追问。不要把每轮写成教程，也不要为了显得专业重复用户已知信息。',
    status: 'DRAFT',
  });
}

async function submit() {
  await formRef.value?.validate();
  emit('submit', { ...form, industryNodeId: isAliContext.value ? '' : form.industryNodeId });
}
</script>
