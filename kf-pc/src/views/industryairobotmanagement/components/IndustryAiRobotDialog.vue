<template>
  <el-dialog v-model="visible" :title="robot ? '编辑行业 AI 机器人' : '新建行业 AI 机器人'" width="920px" top="5vh" destroy-on-close>
    <el-alert
      type="info"
      :closable="false"
      class="!mb-4"
      title="这是独立的 DeepSeek 聊天测试机器人。当前阶段只支持后台聊天测试，不会触发已有评论/私信机器人的实际自动回复；测试聊天会在最后一条用户消息静默 15 秒后再生成回复。"
    />
    <div v-if="!robot" class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div><div class="text-sm font-semibold text-slate-700">快速生成行业机器人测试资料</div><div class="mt-1 text-xs text-slate-500">自动选择当前兼容的真实能力包；没有可用能力包时保持留空并提示，状态固定为草稿。</div></div>
      <SampleFillButton label="填入行业机器人样例" :has-content="hasUserContent" @fill="fillRobotSample" />
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="app-scrollbar max-h-[70vh] overflow-y-auto pr-2">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <el-form-item label="机器人名称" prop="name">
          <el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：某某店日常客服" />
        </el-form-item>
        <el-form-item label="测试渠道" prop="channel">
          <el-select v-model="form.channel" class="w-full" :disabled="Boolean(robot)">
            <el-option v-for="item in channelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="绑定已发布行业能力包" prop="capabilityPackVersionId">
        <el-select v-model="form.capabilityPackVersionId" filterable class="w-full" placeholder="请选择已发布的行业能力包版本">
          <el-option v-for="item in compatibleOptions" :key="optionVersionId(item)" :label="item.label" :value="optionVersionId(item)">
            <div class="flex items-center justify-between gap-3">
              <span>{{ item.label }}</span>
              <span class="text-xs text-slate-400">{{ item.channel === 'BOTH' ? '评论和私信' : item.channel === 'DM' ? '私信' : '评论' }}</span>
            </div>
          </el-option>
        </el-select>
        <div v-if="!compatibleOptions.length" class="mt-2 text-xs text-amber-600">暂无可绑定的已发布能力包。请先导入或创建并发布行业能力包。</div>
      </el-form-item>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <el-form-item label="品牌 / 店铺名称">
          <el-input v-model="form.brandName" maxlength="100" placeholder="例如：某某生活馆" />
        </el-form-item>
        <el-form-item label="机器人状态">
          <el-select v-model="form.status" class="w-full">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="启用测试" value="ENABLED" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
      </div>

      <el-form-item label="业务简介">
        <el-input
          v-model="form.businessProfile"
          type="textarea"
          :rows="3"
          maxlength="1500"
          show-word-limit
          placeholder="填写主营商品、适用人群、商品特点和常见咨询内容。不要填写会频繁变化的价格、库存或物流节点。"
        />
      </el-form-item>
      <el-form-item label="店铺客服处理说明">
        <el-input
          v-model="form.businessRules"
          type="textarea"
          :rows="5"
          maxlength="1500"
          show-word-limit
          placeholder="把客服平时怎么处理写清楚。例如：订单未出库可帮仓库备注改地址；已发货可尝试联系快递但不能保证成功；未发货可询问仓库进度；退款、售后由售后专员核实；人工客服在线时间等。AI 会优先按这里的实际做法，用正常客服口吻回复。"
        />
        <div class="mt-2 text-xs leading-5 text-slate-500">这里写“店铺客服平时能做什么、遇到什么情况怎么跟进”即可，不需要再逐项配置处理权限。店铺规则会优先于行业模板。</div>
      </el-form-item>

      <el-divider content-position="left">店铺常用处理规则</el-divider>
      <el-alert
        type="info"
        :closable="false"
        class="!mb-4"
        title="这里写店铺平时真实会怎么处理，AI 会优先按这些做法组织回复。不是客服权限表，也不会自动执行操作；例如物流慢时，只要店铺确实会协助催件，就写清楚“收集订单号后可帮客户催快递”。"
      />
      <div class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
        <span class="text-xs leading-5 text-slate-500">每项留空则沿用行业模板和补充说明；已有内容不会被自动改写。</span>
        <el-button size="small" plain type="primary" @click="fillEcommerceReferenceRules">填入电商参考</el-button>
      </div>
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <el-form-item label="发货与仓库">
          <el-input v-model="form.storeServiceRules.shippingRule" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="例如：常规订单按承诺时效发货；急用或预售订单先收集款式和地区，再问仓库安排。" />
        </el-form-item>
        <el-form-item label="物流慢 / 长时间未更新">
          <el-input v-model="form.storeServiceRules.logisticsRule" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="例如：先收集订单号；店铺可协助向快递催件，但不能承诺具体到货时间。" />
        </el-form-item>
        <el-form-item label="改地址 / 取消订单">
          <el-input v-model="form.storeServiceRules.orderChangeRule" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="例如：未打包可备注仓库；已打包或发出可尝试联系仓库/快递，但不保证成功。" />
        </el-form-item>
        <el-form-item label="售后 / 退换货">
          <el-input v-model="form.storeServiceRules.afterSalesRule" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="例如：质量、破损、漏发先收集订单号和照片/视频，再由售后核实。" />
        </el-form-item>
        <el-form-item label="退款 / 补偿">
          <el-input v-model="form.storeServiceRules.refundRule" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="例如：先核实订单与退款状态；到账时间、补偿金额以售后确认结果为准。" />
        </el-form-item>
        <el-form-item label="投诉跟进">
          <el-input v-model="form.storeServiceRules.complaintRule" type="textarea" :rows="3" maxlength="1200" show-word-limit placeholder="例如：先收集订单号和具体问题，不争辩、不推责；必要时转售后继续跟进。" />
        </el-form-item>
      </div>
      <el-form-item label="服务体验补充（可选）">
        <el-input v-model="form.storeServiceRules.experienceRule" type="textarea" :rows="2" maxlength="1200" show-word-limit placeholder="例如：客户着急或不满时，先处理重点；只有必要时用一句贴着事情的承接，不说空泛安慰。" />
      </el-form-item>

      <el-divider content-position="left">非店铺消息处理</el-divider>
      <el-alert
        type="warning"
        :closable="false"
        class="!mb-4"
        title="天气、写代码、唱歌等与当前店铺无关的内容，以及验证码、密码、银行卡等敏感内容，不会再交给 DeepSeek 自由回复。下面只决定它们是礼貌引导、不回复还是建议人工处理。"
      />
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <el-form-item label="非本行业消息">
          <el-radio-group v-model="form.outOfScopePolicy" class="flex flex-col items-start gap-2">
            <el-radio value="GUIDE_BACK">礼貌引导回店铺服务</el-radio>
            <el-radio value="NO_REPLY">不回复</el-radio>
            <el-radio value="HANDOFF">建议人工客服处理</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="账号 / 支付敏感消息">
          <el-radio-group v-model="form.sensitiveMessagePolicy" class="flex flex-col items-start gap-2">
            <el-radio value="HANDOFF">安全提醒并建议人工处理</el-radio>
            <el-radio value="NO_REPLY">不回复</el-radio>
          </el-radio-group>
        </el-form-item>
      </div>
      <el-form-item v-if="form.outOfScopePolicy !== 'NO_REPLY'" label="非本行业回复（可选）">
        <el-input
          v-model="form.outOfScopeReply"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="留空使用默认引导语，例如：亲，这边主要帮您处理商品、订单、物流和售后问题哈，您是想咨询哪一项呢？"
        />
      </el-form-item>
      <el-form-item v-if="form.sensitiveMessagePolicy === 'HANDOFF'" label="敏感消息安全提醒（可选）">
        <el-input
          v-model="form.sensitiveReply"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="留空使用默认安全提醒。不要要求客户提供验证码、密码或银行卡完整信息。"
        />
      </el-form-item>

      <el-form-item label="回复口吻补充">
        <el-input
          v-model="form.customPrompt"
          type="textarea"
          :rows="3"
          maxlength="800"
          show-word-limit
          placeholder="例如：日常用“亲”称呼客户，投诉或支付问题用“您”；每次先回答重点，尽量 1—2 句；不要使用“亲亲、宝宝、请耐心等待”等话术。"
        />
      </el-form-item>
      <el-form-item label="机器人说明">
        <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="300" show-word-limit placeholder="可选：仅用于后台内部识别。" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type {
  IndustryAiCapabilityPackOption,
  IndustryAiChannel,
  IndustryAiOutOfScopePolicy,
  IndustryAiRobot,
  IndustryAiStoreServiceRules,
  IndustryAiRobotPayload,
  IndustryAiSensitiveMessagePolicy
} from '@/api/modules/industryAi';

type RobotChannel = Exclude<IndustryAiChannel, 'BOTH'>;

interface RobotForm {
  name: string;
  remark: string;
  channel: RobotChannel;
  status: 'DRAFT' | 'ENABLED' | 'DISABLED';
  brandName: string;
  businessProfile: string;
  businessRules: string;
  storeServiceRules: Required<IndustryAiStoreServiceRules>;
  outOfScopePolicy: IndustryAiOutOfScopePolicy;
  outOfScopeReply: string;
  sensitiveMessagePolicy: IndustryAiSensitiveMessagePolicy;
  sensitiveReply: string;
  customPrompt: string;
  capabilityPackVersionId: string;
}

const props = defineProps<{
  modelValue: boolean;
  robot?: IndustryAiRobot | null;
  packOptions: IndustryAiCapabilityPackOption[];
  saving?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: IndustryAiRobotPayload];
}>();

const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const form = reactive<RobotForm>(createEmptyForm());
const hasUserContent = computed(() => Boolean(
  form.name.trim() || form.brandName.trim() || form.businessProfile.trim() || form.businessRules.trim()
  || form.customPrompt.trim() || Object.values(form.storeServiceRules).some((item) => item.trim()),
));
const channelOptions: Array<{ label: string; value: RobotChannel }> = [
  { label: '私信测试', value: 'DM' },
  { label: '评论测试', value: 'COMMENT' }
];
const rules: FormRules<RobotForm> = {
  name: [{ required: true, message: '请输入机器人名称', trigger: 'blur' }],
  channel: [{ required: true, message: '请选择测试渠道', trigger: 'change' }],
  capabilityPackVersionId: [{ required: true, message: '请选择已发布行业能力包', trigger: 'change' }]
};

const compatibleOptions = computed(() => props.packOptions.filter((item) => item.channel === 'BOTH' || item.channel === form.channel));

watch(
  () => [props.modelValue, props.robot] as const,
  ([open]) => {
    if (!open) return;
    resetForm(props.robot || null);
  },
  { immediate: true }
);

watch(
  () => form.channel,
  () => {
    if (!form.capabilityPackVersionId) return;
    if (!compatibleOptions.value.some((item) => optionVersionId(item) === form.capabilityPackVersionId)) {
      form.capabilityPackVersionId = '';
    }
  }
);

function createEmptyForm(): RobotForm {
  return {
    name: '',
    remark: '',
    channel: 'DM',
    status: 'DRAFT',
    brandName: '',
    businessProfile: '',
    businessRules: '',
    storeServiceRules: createEmptyStoreServiceRules(),
    outOfScopePolicy: 'GUIDE_BACK',
    outOfScopeReply: '',
    sensitiveMessagePolicy: 'HANDOFF',
    sensitiveReply: '',
    customPrompt: '',
    capabilityPackVersionId: ''
  };
}

function resetForm(robot: IndustryAiRobot | null) {
  const next = createEmptyForm();
  if (robot) {
    next.name = robot.name;
    next.remark = robot.remark || '';
    next.channel = robot.channel || 'DM';
    next.status = robot.status || 'DRAFT';
    next.brandName = robot.brandName || '';
    next.businessProfile = robot.businessProfile || '';
    next.businessRules = robot.businessRules || '';
    next.storeServiceRules = { ...createEmptyStoreServiceRules(), ...(robot.storeServiceRules || {}) };
    next.outOfScopePolicy = robot.outOfScopePolicy || robot.conversationPolicy?.outOfScopePolicy || 'GUIDE_BACK';
    next.outOfScopeReply = robot.outOfScopeReply || robot.conversationPolicy?.outOfScopeReply || '';
    next.sensitiveMessagePolicy = robot.sensitiveMessagePolicy || robot.conversationPolicy?.sensitiveMessagePolicy || 'HANDOFF';
    next.sensitiveReply = robot.sensitiveReply || robot.conversationPolicy?.sensitiveReply || '';
    next.customPrompt = robot.customPrompt || '';
    next.capabilityPackVersionId = robot.capabilityPackVersionId || '';
  }
  Object.assign(form, next);
  formRef.value?.clearValidate();
}

function optionVersionId(item: IndustryAiCapabilityPackOption) {
  return item.versionId || item.value;
}

function createEmptyStoreServiceRules(): Required<IndustryAiStoreServiceRules> {
  return {
    shippingRule: '',
    logisticsRule: '',
    orderChangeRule: '',
    afterSalesRule: '',
    refundRule: '',
    complaintRule: '',
    experienceRule: ''
  };
}

function compactStoreServiceRules(value: Required<IndustryAiStoreServiceRules>): IndustryAiStoreServiceRules {
  return {
    shippingRule: value.shippingRule.trim(),
    logisticsRule: value.logisticsRule.trim(),
    orderChangeRule: value.orderChangeRule.trim(),
    afterSalesRule: value.afterSalesRule.trim(),
    refundRule: value.refundRule.trim(),
    complaintRule: value.complaintRule.trim(),
    experienceRule: value.experienceRule.trim()
  };
}

function fillEcommerceReferenceRules() {
  const next = {
    shippingRule: '常规订单按店铺承诺时效安排发货；客户急用或商品为预售时，先收集商品款式和收货地区，再核实仓库安排，不保证具体到货时间。',
    logisticsRule: '客户反馈物流慢、几天未更新或一直未到时，先收集订单号；店铺可协助向快递催件或跟进物流，但不承诺具体到货时间。',
    orderChangeRule: '订单还没打包时可帮客户备注仓库修改地址；已经打包或发出时可尝试联系仓库或快递，但不能保证一定修改成功。',
    afterSalesRule: '质量、破损、漏发、错发或退换问题，先收集订单号和照片/视频或必要说明，再由售后核实处理方式。',
    refundRule: '退款到账、补偿金额和处理时效需要以订单与售后核实结果为准；先收集订单号，不先承诺金额或到账时间。',
    complaintRule: '客户投诉时先收集订单号和具体问题，不争辩、不推责；明确需要时转售后继续跟进，避免让客户重复说明。',
    experienceRule: '明确事务先处理重点；客户焦虑或不满时，只用一句贴着事情的承接，再马上给下一步，不说空泛安慰。'
  };
  for (const [key, text] of Object.entries(next) as Array<[keyof IndustryAiStoreServiceRules, string]>) {
    if (!form.storeServiceRules[key]) form.storeServiceRules[key] = text;
  }
}

function fillRobotSample() {
  const pack = props.packOptions.find((item) => item.channel === 'BOTH' || item.channel === 'DM');
  Object.assign(form, {
    name: '通勤女装私信测试机器人（参考）', channel: 'DM', status: 'DRAFT',
    brandName: '青禾通勤女装（虚构）',
    businessProfile: '面向上班族女性的通勤女装店，主营简洁、好搭配的日常上班服饰。',
    businessRules: '商品价格、库存、活动和发货时效以客户当前页面及订单信息为准；无法核实时不编造。',
    storeServiceRules: createEmptyStoreServiceRules(),
    outOfScopePolicy: 'GUIDE_BACK',
    outOfScopeReply: '这边主要帮你处理商品、订单、物流和售后问题。你现在想先问哪一项？',
    sensitiveMessagePolicy: 'HANDOFF',
    sensitiveReply: '为保护账号安全，请不要发送验证码、密码或银行卡完整信息；这类问题建议联系人工客服处理。',
    customPrompt: '先直接回答重点，尽量一到两句；不使用“亲亲、宝宝、请耐心等待”等套话；没有明确需求时不主动推销。',
    remark: '虚构参考样例，仅用于后台聊天测试，保存前请替换成真实店铺信息。',
    capabilityPackVersionId: pack ? optionVersionId(pack) : '',
  });
  fillEcommerceReferenceRules();
  if (!pack) ElMessage.warning('行业机器人样例已填入；当前没有兼容的已发布能力包，请先创建并发布能力包');
  else ElMessage.success('行业机器人样例已填入，当前状态为草稿');
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const selected = props.packOptions.find((item) => optionVersionId(item) === form.capabilityPackVersionId);
  if (!selected) {
    form.capabilityPackVersionId = '';
    await formRef.value?.validateField('capabilityPackVersionId').catch(() => undefined);
    return;
  }
  emit('submit', {
    name: form.name.trim(),
    channel: form.channel,
    status: form.status,
    brandName: form.brandName.trim() || undefined,
    businessProfile: form.businessProfile.trim() || undefined,
    businessRules: form.businessRules.trim() || undefined,
    storeServiceRules: compactStoreServiceRules(form.storeServiceRules),
    outOfScopePolicy: form.outOfScopePolicy,
    outOfScopeReply: form.outOfScopeReply.trim() || undefined,
    sensitiveMessagePolicy: form.sensitiveMessagePolicy,
    sensitiveReply: form.sensitiveReply.trim() || undefined,
    customPrompt: form.customPrompt.trim() || undefined,
    remark: form.remark.trim() || undefined,
    capabilityPackVersionId: form.capabilityPackVersionId
  });
}
</script>
