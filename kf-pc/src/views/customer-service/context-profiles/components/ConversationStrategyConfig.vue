<template>
  <div class="strategy-grid">
    <el-form-item label="上下文承接">
      <el-select v-model="model.contextCarryoverMode" class="w-full">
        <el-option label="自动判断（推荐）" value="AUTO" />
        <el-option label="保守承接" value="CONSERVATIVE" />
        <el-option label="优先保持连续性" value="CONTINUITY_FIRST" />
      </el-select>
      <div class="form-help">直接说“继续刚才那个”仍会承接；这里控制短指代和轻量延续的积极程度。</div>
    </el-form-item>
    <el-form-item label="老客户重新开场">
      <el-select v-model="model.returningGreetingMode" class="w-full">
        <el-option label="只回应当前问候" value="CURRENT_ONLY" />
        <el-option label="可轻量承接历史（推荐）" value="SOFT_CONTINUITY" />
        <el-option label="优先承接未完成事项" value="CONTINUE_PENDING" />
      </el-select>
      <div class="form-help">售后、投诉、安全类未完成事项属于安全连续性，不会被普通运营配置关闭。</div>
    </el-form-item>
    <el-form-item label="业务身份强度">
      <el-select v-model="model.businessIdentityStrength" class="w-full">
        <el-option label="轻量保持" value="LIGHT" />
        <el-option label="自然平衡（推荐）" value="BALANCED" />
        <el-option label="清晰稳定" value="STRONG" />
      </el-select>
    </el-form-item>
    <el-form-item label="非业务闲聊边界">
      <el-select v-model="model.casualChatBoundary" class="w-full">
        <el-option label="业务身份锚定" value="BUSINESS_ANCHORED" />
        <el-option label="可灵活闲聊" value="FLEXIBLE" />
        <el-option label="开放闲聊（推荐）" value="OPEN" />
      </el-select>
      <div class="form-help">即使选择开放闲聊，也不能否认账号身份、虚构现实朋友关系或共同经历。</div>
    </el-form-item>
    <el-form-item label="复用已确认客户偏好">
      <div class="switch-line"><el-switch v-model="model.reuseConfirmedPreferences" /><span>例如已明确喜欢黑色、偏通勤风时，后续短指代可以继续利用。</span></div>
    </el-form-item>
    <el-form-item label="承接普通未完成事项">
      <div class="switch-line"><el-switch v-model="model.continueUnfinishedItems" /><span>关闭后减少普通 pending 的主动承接；高风险售后连续性仍保留。</span></div>
    </el-form-item>
    <el-form-item label="State 推断策略">
      <el-select v-model="model.stateInferenceMode" class="w-full">
        <el-option label="只使用客户明确事实" value="EXPLICIT_ONLY" />
        <el-option label="保守使用高置信推断（推荐）" value="CONSERVATIVE" />
        <el-option label="平衡使用推断" value="BALANCED" />
      </el-select>
      <div class="form-help">UNKNOWN、CONFLICTED、STALE 永远不能被当成确定事实。</div>
    </el-form-item>
    <el-form-item label="Context Budget">
      <el-select v-model="model.contextBudgetMode" class="w-full">
        <el-option label="系统自动（推荐）" value="AUTO" />
        <el-option label="高级自定义" value="CUSTOM" />
      </el-select>
    </el-form-item>
  </div>

  <div class="human-card">
    <div class="human-card-title">
      <strong>人感表达偏好</strong>
      <span>这里调整的是角色表达倾向，不是普通回复发送资格；默认身份预设采用低限制自然交流，具体业务限制由 PC 显式配置。</span>
    </div>
    <div class="strategy-grid">
      <el-form-item label="自然度">
        <el-select v-model="model.humanNaturalness" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="稳重克制" value="RESERVED" />
          <el-option label="自然平衡" value="BALANCED" />
          <el-option label="更松弛自然" value="RELAXED" />
        </el-select>
      </el-form-item>
      <el-form-item label="回复密度倾向">
        <el-select v-model="model.humanResponseDensity" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="偏精简" value="COMPACT" />
          <el-option label="平衡" value="BALANCED" />
          <el-option label="偏丰富" value="RICH" />
        </el-select>
        <div class="form-help">这是表达倾向；没有明确选择“偏精简”时，不默认把回复压短。</div>
      </el-form-item>
      <el-form-item label="口语化程度">
        <el-select v-model="model.humanColloquiality" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="偏正式" value="LOW" />
          <el-option label="自然口语" value="MEDIUM" />
          <el-option label="高口语化" value="HIGH" />
        </el-select>
      </el-form-item>
      <el-form-item label="提问频率">
        <el-select v-model="model.humanQuestionFrequency" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="少问" value="LOW" />
          <el-option label="平衡" value="BALANCED" />
          <el-option label="更积极追问" value="HIGH" />
        </el-select>
        <div class="form-help">不会压掉退款、售后等必须补充的信息；客户明确“别老问”时仍优先尊重客户反馈。</div>
      </el-form-item>
      <el-form-item label="业务推进强度">
        <el-select v-model="model.humanBusinessAdvance" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="低推进" value="LOW" />
          <el-option label="平衡" value="BALANCED" />
          <el-option label="较积极" value="HIGH" />
        </el-select>
        <div class="form-help">只会在 Planner 已识别真实商业机会时生效；售后 pending、安全等场景不会被强行拉回成交。</div>
      </el-form-item>
      <el-form-item label="熟客承接">
        <el-select v-model="model.humanReturningContinuity" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="轻量" value="LIGHT" />
          <el-option label="平衡" value="BALANCED" />
          <el-option label="更强连续性" value="STRONG" />
        </el-select>
        <div class="form-help">只在 State/Planner 已确认可安全承接历史时使用，不会凭空编造“上次聊过”。</div>
      </el-form-item>
      <el-form-item label="Emoji 倾向">
        <el-select v-model="model.humanEmoji" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="不用" value="NONE" />
          <el-option label="轻量" value="LIGHT" />
          <el-option label="自然使用" value="NATURAL" />
        </el-select>
      </el-form-item>
      <el-form-item label="首次身份显现">
        <el-select v-model="model.humanIdentityExposure" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="环境式，不主动说明" value="AMBIENT" />
          <el-option label="自然显现" value="NATURAL" />
          <el-option label="直接接待" value="DIRECT" />
        </el-select>
        <div class="form-help">客户明确问“你是谁/你是客服吗”时仍按身份问句规则直接回答，不受这里隐藏。</div>
      </el-form-item>
      <el-form-item label="气泡分段倾向">
        <el-select v-model="model.humanSegmentation" class="w-full">
          <el-option label="系统自动（推荐）" value="AUTO" />
          <el-option label="尽量一条" value="COMPACT" />
          <el-option label="平衡" value="BALANCED" />
          <el-option label="允许自然多段" value="SEQUENTIAL" />
        </el-select>
        <div class="form-help">只影响自然气泡倾向；最终最多消息数和客户插话取消仍由发送配置控制，不改变回复正文。</div>
      </el-form-item>
    </div>
  </div>

  <div v-if="model.contextBudgetMode === 'CUSTOM'" class="budget-card">
    <el-alert type="warning" :closable="false" show-icon title="高级预算只控制输入取舍，不会绕过安全、权限、canonical 幂等或质量门。" />
    <div class="strategy-grid mt-3">
      <el-form-item label="会话 Active Context Token 预算">
        <el-input-number v-model="model.activeContextTokenBudget" :min="800" :max="12000" :step="200" class="w-full" />
      </el-form-item>
      <el-form-item label="运行时总输入预算（估算）">
        <el-input-number v-model="model.totalInputTokenBudget" :min="4096" :max="24000" :step="500" class="w-full" />
      </el-form-item>
      <el-form-item label="预留系统指令预算">
        <el-input-number v-model="model.reservedInstructionTokens" :min="800" :max="5000" :step="100" class="w-full" />
      </el-form-item>
      <el-form-item label="业务知识最大预算">
        <el-input-number v-model="model.maxKnowledgeTokens" :min="256" :max="6000" :step="100" class="w-full" />
      </el-form-item>
    </div>
    <div class="text-xs text-slate-500">这是 tokenizer 无关的保守估算，用于稳定裁剪；真实 provider 计费 Token 在最终验收中核对。</div>
  </div>
</template>

<script setup lang="ts">
import type { CustomerServiceConversationStrategyConfig } from '@/modules/customer-service/types/context-profiles.types';

const model = defineModel<CustomerServiceConversationStrategyConfig>({ required: true });
</script>

<style scoped>
.strategy-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.switch-line { display: flex; align-items: flex-start; gap: 10px; width: 100%; }
.switch-line span, .form-help { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.human-card { margin-top: 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-fill-color-lighter); padding: 12px; }
.human-card-title { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.human-card-title span { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.budget-card { border: 1px dashed var(--el-color-warning-light-5); border-radius: 10px; background: var(--el-color-warning-light-9); padding: 12px; }
@media (max-width: 900px) { .strategy-grid { grid-template-columns: 1fr; } }
</style>
