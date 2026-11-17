<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? `新增${meta.title}` : `编辑${meta.title}`" width="min(1320px, calc(100vw - 32px))" top="4vh" class="robot-form-dialog" :close-on-click-modal="false" destroy-on-close>
    <div v-if="mode === 'create'" class="sample-fill-bar">
      <div><strong>快速建立一份测试配置</strong><span>自动使用当前可用的第一份账号资料和提示词配置；没有真实资源时会保持留空，不会伪造 ID。样例不会自动保存。</span></div>
      <SampleFillButton label="填入机器人测试样例" :has-content="hasUserContent" @fill="fillRobotSample" />
    </div>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="132px" class="robot-form">
      <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
        <el-form-item label="机器人名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入机器人名称" />
        </el-form-item>
        <el-form-item label="平台" prop="platform">
          <el-select v-model="form.platform" class="w-full" placeholder="请选择平台">
            <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="过期时间" prop="expiredAt">
          <el-date-picker
            v-model="form.expiredAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="请选择过期时间"
            class="w-full"
          />
        </el-form-item>
      </div>

      <template v-if="isAutoReplyCategory">
        <el-divider content-position="left">自动回复配置</el-divider>
        <div class="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">AI 回复与账号知识 <HelpTip title="账号知识如何使用" content="机器人只需选择一份账号资料，系统会自动带上其中的店铺事实、账号人设、阿梨角色、行业和渠道，不需要再分别选择店铺背景。" /></div>
              <div class="mt-1 text-xs leading-5 text-slate-500">DeepSeek 会自动加载“账号配置”中的身份和“知识与流程”中的适用内容。</div>
            </div>
            <div class="flex items-center gap-2">
              <el-button link type="primary" @click="router.push('/customer-service/customer-profiles')">维护账号配置</el-button>
              <el-button v-if="form.aiBinding.provider === 'DEEPSEEK'" text type="primary" @click="advancedConfigOpen = !advancedConfigOpen">{{ showAdvancedAutoReply ? '收起兼容设置' : '高级兼容设置' }}</el-button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
            <el-form-item v-if="showAdvancedAutoReply" label="AI 回复引擎">
              <el-select v-model="form.aiBinding.provider" class="w-full">
                <el-option label="DeepSeek 真人感客服（推荐）" value="DEEPSEEK" />
                <el-option label="扣子工作流（兼容模式）" value="COZE" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="form.aiBinding.provider === 'DEEPSEEK'" label="账号资料">
              <el-select
                v-model="form.aiBinding.accountProfileId"
                class="w-full"
                filterable
                :loading="accountProfilesLoading"
                placeholder="请选择当前机器人代表的账号"
              >
                <el-option v-for="item in accountProfiles" :key="item.id" :label="item.name" :value="item.id">
                  <div class="flex items-center justify-between gap-3">
                    <span>{{ item.name }}</span>
                    <span class="text-xs text-slate-400">{{ item.storeProfile?.name || item.channel || '通用账号' }}</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </div>
          <el-alert
            v-if="form.aiBinding.provider === 'DEEPSEEK' && selectedAccountProfile"
            type="success"
            :closable="false"
            show-icon
            :title="`已绑定 ${selectedAccountProfile.name}`"
            :description="accountProfileDescription"
            class="mb-3"
          />
          <el-alert
            v-else-if="form.aiBinding.provider === 'DEEPSEEK' && !accountProfilesLoading && !accountProfiles.length"
            type="warning"
            :closable="false"
            show-icon
            title="当前没有可用的账号资料"
            description="请先到“账号配置”新增并启用一份完整账号资料。"
            class="mb-3"
          />
          <div v-if="form.aiBinding.provider === 'DEEPSEEK' && showAdvancedAutoReply" class="flex items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 dark:bg-slate-900/50">
            <div>
              <div class="text-sm text-slate-700 dark:text-slate-200">DeepSeek 异常时回退扣子</div>
              <div class="text-xs text-slate-500">迁移期间建议开启；稳定后可关闭，避免故障时回复风格变化。</div>
            </div>
            <el-switch v-model="form.aiBinding.fallbackToCoze" />
          </div>
        </div>
        <el-alert
          v-if="form.aiBinding.provider === 'COZE'"
          type="warning"
          :closable="false"
          show-icon
          title="这是旧版扣子兼容配置"
          description="系统会保留并继续使用现有提示词配置；新建机器人建议选择 DeepSeek 并绑定账号配置。"
          class="mb-4"
        />
        <template v-if="showAdvancedAutoReply">
        <el-form-item :label="form.aiBinding.provider === 'DEEPSEEK' ? '扣子兼容/回退配置' : '提示词配置'" prop="promptConfigId">
          <div class="w-full">
            <div class="flex w-full gap-2">
              <el-select v-model="form.promptConfigId" class="min-w-0 flex-1" filterable :placeholder="form.aiBinding.provider === 'DEEPSEEK' ? '仅在开启回退时选择扣子配置' : '请选择提示词配置'">
              <el-option v-for="item in promptOptions" :key="item.id" :label="item.name" :value="item.id">
                <div class="flex items-center justify-between gap-3">
                  <span>{{ item.name }}</span>
                  <span class="text-xs text-slate-400">{{ item.platformLabel || defaultPlatformLabel }}</span>
                </div>
              </el-option>
              </el-select>
              <el-button :disabled="form.aiBinding.provider === 'COZE' && !form.promptConfigId" @click="openTestDrawer">测试</el-button>
            </div>
            <div v-if="form.aiBinding.provider === 'DEEPSEEK'" class="mt-1 text-xs leading-5 text-slate-500">
              DeepSeek 正常回复只使用账号知识、意图流程、表达规则和正式策略；这里的旧提示词仅在 DeepSeek 异常且开启回退时交给扣子使用。
            </div>
          </div>
        </el-form-item>
        </template>

        <el-form-item v-if="category === 'COMMENT'" label="回复范围" prop="commentReplyMode">
          <el-radio-group v-model="form.commentReplyMode">
            <el-radio value="ALL_UNREPLIED">全部未回复评论</el-radio>
            <el-radio value="PUBLISHER_REPLY_THREAD_ONLY">只针对账号评论的回复</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="category === 'COMMENT'" label="导入回复数据">
          <div class="flex w-full flex-col gap-2">
            <el-select v-model="form.replyDatasetId" class="w-full" clearable filterable placeholder="可选，选择评论-回复映射数据集">
              <el-option v-for="item in datasetOptions" :key="item.id" :label="`${item.name}（${item.entriesCount || 0}条）`" :value="item.id" />
            </el-select>
            <div class="text-xs leading-5 text-slate-500">如需新增或编辑导入表格，请在列表页顶部“导入回复数据”模块中维护。</div>
          </div>
        </el-form-item>

        <template v-if="showAdvancedAutoReply && category === 'PRIVATE_MESSAGE'">
          <el-form-item label="首次回复">
            <el-switch v-model="form.enableFirstReply" active-text="需要首次回复" inactive-text="不需要" />
          </el-form-item>
          <el-form-item v-if="form.enableFirstReply" label="首次回复内容">
            <div class="w-full space-y-2">
              <div v-for="(_, index) in form.firstReplyContents" :key="index" class="flex gap-2">
                <el-input v-model="form.firstReplyContents[index]" placeholder="请输入一条首次回复内容" />
                <el-button type="danger" plain @click="removeFirstReply(index)">删除</el-button>
              </div>
              <el-button @click="addFirstReply">新增一条</el-button>
            </div>
          </el-form-item>
          <el-form-item label="上下文默认值">
            <el-switch v-model="form.useConversationContext" active-text="测试和运行默认基于上下文" inactive-text="默认不带上下文" />
          </el-form-item>
        </template>

        <el-collapse v-if="showAdvancedAutoReply" class="mb-5">
          <el-collapse-item :title="form.aiBinding.provider === 'DEEPSEEK' ? '扣子兼容/回退参数（不参与正常 DeepSeek 回复）' : '提示词参数（选中配置后可在当前机器人中临时调整）'" name="prompt">
            <div class="mb-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
              <span>保存机器人时会把这里的参数保存为机器人提示词快照；点击同步会覆盖原提示词配置项。</span>
              <el-button size="small" :disabled="!form.promptConfigId" :loading="syncingPrompt" @click="syncPromptConfig">同步到配置项</el-button>
            </div>
            <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
              <el-form-item label="平台名称" prop="promptSnapshot.platformLabel">
                <el-input v-model="form.promptSnapshot.platformLabel" :placeholder="defaultPlatformLabel" />
              </el-form-item>
              <el-form-item label="回复条数" prop="promptSnapshot.replyLength">
                <el-input-number v-model="form.promptSnapshot.replyLength" :min="1" :max="10" class="w-full" />
              </el-form-item>
              <el-form-item v-if="category === 'PRIVATE_MESSAGE'" label="最大消息数" prop="promptSnapshot.maxMsgCount">
                <el-input-number v-model="form.promptSnapshot.maxMsgCount" :min="1" :max="10" class="w-full" />
              </el-form-item>
            </div>
            <el-form-item label="系统提示词">
              <el-input v-model="form.promptSnapshot.customSystemPrompt" type="textarea" :rows="4" />
            </el-form-item>
            <el-form-item label="补充提示词">
              <el-input v-model="form.promptSnapshot.customUserPrompt" type="textarea" :rows="3" />
            </el-form-item>
            <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
              <el-form-item label="禁用词">
                <el-input v-model="form.promptSnapshot.forbiddenWords" type="textarea" :rows="3" />
              </el-form-item>
              <el-form-item label="要求词">
                <el-input v-model="form.promptSnapshot.requiredWords" type="textarea" :rows="3" />
              </el-form-item>
            </div>
            <el-form-item label="回复风格">
              <el-input v-model="form.promptSnapshot.replyStyle" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="账号定位">
              <el-input v-model="form.promptSnapshot.accountPositioning" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="业务简介">
              <el-input v-model="form.promptSnapshot.businessProfile" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item :label="category === 'COMMENT' ? '评论目标' : '转化目标'">
              <el-input v-model="form.promptSnapshot.goal" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item :label="category === 'COMMENT' ? '评论规则' : '联系规则'">
              <el-input v-model="form.promptSnapshot.policy" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="安全约束">
              <el-input v-model="form.promptSnapshot.safetyPolicy" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item v-if="category === 'COMMENT'" label="作品上下文">
              <el-input v-model="postContext" type="textarea" :rows="3" />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </template>



      <template v-if="category === 'INTERCEPT'">
        <el-divider content-position="left">截流配置</el-divider>
        <div class="intercept-config-summary rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <div class="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div class="text-base font-semibold text-slate-900 dark:text-slate-100">当前截流配置</div>
              <div class="mt-1 text-xs leading-5 text-slate-500">基础信息外的截流规则统一进入抽屉配置；保存后下方卡片展示当前核心配置。</div>
            </div>
            <el-button type="primary" @click="openInterceptConfigDrawer">截流配置</el-button>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div v-for="item in interceptSummaryItems" :key="item.label" class="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
              <div class="text-xs text-slate-400">{{ item.label }}</div>
              <div class="mt-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200" :title="item.value">{{ item.value }}</div>
            </div>
          </div>
        </div>

        <el-drawer
          v-model="interceptConfigDrawerVisible"
          title="截流配置"
          size="min(960px, calc(100vw - 24px))"
          append-to-body
          destroy-on-close
          class="intercept-config-drawer"
        >
          <div class="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 dark:bg-slate-900/50 dark:text-slate-300">
            图中的“意向分析提示词、作品判定、目标列表、高级采集、运行周期”都会保存到 <span class="font-mono">Robot.config.intercept</span>。客户端截流机器人启动时会读取这些配置执行。
          </div>

          <el-collapse v-model="interceptConfigPanels" class="intercept-config-collapse">
            <el-collapse-item title="基础配置" name="base">
              <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
                <el-form-item label="AI 分析引擎">
                  <el-select v-model="form.interceptConfig.aiBinding.provider" class="w-full">
                    <el-option label="DeepSeek 直连（推荐）" value="DEEPSEEK" />
                    <el-option label="扣子工作流（兼容模式）" value="COZE" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="form.interceptConfig.aiBinding.provider === 'DEEPSEEK'" label="账号资料">
                  <el-select v-model="form.interceptConfig.aiBinding.accountProfileId" class="w-full" clearable filterable :loading="accountProfilesLoading" placeholder="建议绑定主动私信所代表的账号">
                    <el-option v-for="item in accountProfiles" :key="item.id" :label="item.name" :value="item.id" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="form.interceptConfig.aiBinding.provider === 'DEEPSEEK'" label="异常回退">
                  <el-switch v-model="form.interceptConfig.aiBinding.fallbackToCoze" active-text="回退扣子" inactive-text="不回退" />
                </el-form-item>
                <el-form-item label="提示词配置">
                  <div class="flex w-full flex-col gap-2">
                    <el-select
                      v-model="form.interceptConfig.intentAnalysis.promptConfigId"
                      class="w-full"
                      filterable
                      placeholder="请选择意向分析提示词配置"
                      @change="handleInterceptPromptConfigChange"
                    >
                      <el-option v-for="item in promptOptions" :key="item.id" :label="item.name" :value="item.id">
                        <div class="flex items-center justify-between gap-3">
                          <span>{{ item.name }}</span>
                          <span class="text-xs text-slate-400">{{ promptOptionMeta(item) }}</span>
                        </div>
                      </el-option>
                    </el-select>
                    <div class="text-xs leading-5 text-slate-500">正式捕获后的评论意向分析会使用这里绑定的提示词配置。</div>
                  </div>
                </el-form-item>
                <el-form-item label="关联状态">
                  <el-tag :type="form.interceptConfig.intentAnalysis.promptConfigId ? 'success' : 'info'">
                    {{ form.interceptConfig.intentAnalysis.promptConfigId ? `已绑定：${form.interceptConfig.intentAnalysis.promptConfigName || '未命名配置'}` : '未绑定，请先选择提示词配置' }}
                  </el-tag>
                </el-form-item>
                <el-form-item label="目标模式">
                  <el-radio-group v-model="form.interceptConfig.targetMode">
                    <el-radio value="homepage">主页链接</el-radio>
                    <el-radio value="content">作品链接</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="访问顺序">
                  <el-switch v-model="form.interceptConfig.collect.randomizeTargets" active-text="随机访问，本轮不重复" inactive-text="按后台列表顺序" />
                </el-form-item>
              </div>
            </el-collapse-item>

            <el-collapse-item title="口播与作品判定" name="speech-decision">
              <div class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                口播获取成功后才会调用作品判定工作流；判定返回 shouldRun=false 时跳过评论采集，不同步捕获评论。
              </div>
              <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
                <el-form-item label="启用口播获取">
                  <el-switch v-model="form.interceptConfig.speech.enabled" active-text="启用" inactive-text="停用" />
                </el-form-item>
                <el-form-item label="口播失败策略">
                  <el-radio-group v-model="form.interceptConfig.speech.failStrategy">
                    <el-radio value="SKIP">失败时跳过</el-radio>
                    <el-radio value="RUN">失败时继续</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="口播为空策略">
                  <el-radio-group v-model="form.interceptConfig.speech.emptyTranscriptStrategy">
                    <el-radio value="SKIP">为空时跳过</el-radio>
                    <el-radio value="RUN">为空时继续</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="启用作品判定">
                  <el-switch v-model="form.interceptConfig.workDecision.enabled" active-text="启用" inactive-text="停用" />
                </el-form-item>
                <el-form-item label="判定工作流ID">
                  <el-input v-model="form.interceptConfig.workDecision.workflowId" placeholder="填写自己的判定工作流 ID" />
                </el-form-item>
                <el-form-item label="判定失败策略">
                  <el-radio-group v-model="form.interceptConfig.workDecision.failStrategy">
                    <el-radio value="SKIP">失败时跳过</el-radio>
                    <el-radio value="RUN">失败时继续</el-radio>
                  </el-radio-group>
                </el-form-item>
              </div>
            </el-collapse-item>

            <el-collapse-item title="监听目标列表" name="targets">
              <div class="intercept-target-manager rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div class="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ activeTargetModeLabel }}监听列表</div>
                    <div class="text-xs leading-5 text-slate-500">{{ activeTargetModeHelp }}。保存时会以对象数组写入后端。</div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <el-button type="primary" @click="openCreateInterceptTargetDialog">新增链接</el-button>
                    <el-button @click="downloadTargetTemplate">下载模板</el-button>
                    <el-button :disabled="!activeTargets.length" @click="exportCurrentTargets">导出当前</el-button>
                    <el-upload :show-file-list="false" accept=".xlsx" :before-upload="handleTargetImport">
                      <el-button>表格导入</el-button>
                    </el-upload>
                  </div>
                </div>
                <div v-if="activeTargets.length" class="intercept-target-tags">
                  <el-tag
                    v-for="(target, index) in activeTargets"
                    :key="`${activeTargetType}-${index}-${target.url}`"
                    class="intercept-target-tag"
                    :type="target.enabled === false ? 'info' : 'success'"
                    effect="light"
                    closable
                    @click="openEditInterceptTargetDialog(index)"
                    @close.stop="confirmRemoveInterceptTarget(index)"
                  >
                    <span class="font-medium">{{ targetTagText(target, index) }}</span>
                    <span class="ml-2 text-xs opacity-70">{{ target.enabled === false ? '停用' : '启用' }}</span>
                  </el-tag>
                </div>
                <el-empty v-else :description="`暂无${activeTargetModeLabel}监听，请点击新增链接或表格导入`" :image-size="72" />
              </div>
            </el-collapse-item>

            <el-collapse-item title="采集筛选" name="filter">
              <div class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                最近作品天数和单作品最长时长是并行候选条件：任一条件不满足就不会进入口播和评论采集。
              </div>
              <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-3">
                <el-form-item v-if="form.interceptConfig.targetMode === 'homepage'" label="最近作品天数">
                  <el-input-number v-model="form.interceptConfig.homepageLookbackDays" :min="1" :max="365" :step="1" class="w-full" />
                </el-form-item>
                <el-form-item label="单作品最长秒">
                  <el-input-number v-model="form.interceptConfig.collect.maxPostDurationSeconds" :min="0" :max="7200" :step="10" class="w-full" />
                  <div class="mt-1 text-xs text-slate-400">0 表示不限制；有作品时长且超过该值时直接过滤。</div>
                </el-form-item>
                <el-form-item v-if="form.interceptConfig.targetMode === 'homepage'" label="最大作品数">
                  <el-input-number v-model="form.interceptConfig.collect.maxPosts" :min="0" :step="1" class="w-full" />
                </el-form-item>
                <el-form-item label="单作品评论上限">
                  <el-input-number v-model="form.interceptConfig.collect.maxCommentsPerPost" :min="0" :step="1" class="w-full" />
                </el-form-item>
                <el-form-item label="单目标最长分钟">
                  <el-input-number v-model="form.interceptConfig.collect.maxTargetMinutes" :min="1" :max="1440" :step="1" class="w-full" />
                </el-form-item>
                <el-form-item label="评论最长秒">
                  <el-input-number v-model="form.interceptConfig.collect.commentFetchMaxSeconds" :min="0" :max="3600" :step="1" class="w-full" />
                </el-form-item>
              </div>
            </el-collapse-item>

            <el-collapse-item title="节奏与调试" name="pacing">
              <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-3">
                <el-form-item label="接口捕获秒数">
                  <el-input-number v-model="form.interceptConfig.collect.captureSeconds" :min="3" :max="120" :step="1" class="w-full" />
                </el-form-item>
                <el-form-item label="触发滚动轮数">
                  <el-input-number v-model="form.interceptConfig.collect.triggerScrollRounds" :min="0" :max="50" :step="1" class="w-full" />
                </el-form-item>
                <el-form-item label="触发停顿秒">
                  <el-input-number v-model="form.interceptConfig.collect.triggerPauseSec" :min="0.5" :max="30" :step="0.1" :precision="1" class="w-full" />
                </el-form-item>
                <el-form-item label="节奏档位">
                  <el-select v-model="form.interceptConfig.collect.pacingProfile" class="w-full">
                    <el-option label="稳妥" value="conservative" />
                    <el-option label="均衡" value="balanced" />
                    <el-option label="高效" value="efficient" />
                  </el-select>
                </el-form-item>
                <el-form-item label="评论分页间隔秒">
                  <div class="responsive-number-pair">
                    <el-input-number v-model="form.interceptConfig.collect.commentPagePauseMinSec" :min="0" :step="0.1" :precision="1" class="w-full" />
                    <el-input-number v-model="form.interceptConfig.collect.commentPagePauseMaxSec" :min="0" :step="0.1" :precision="1" class="w-full" />
                  </div>
                </el-form-item>
                <el-form-item label="作品后休息秒">
                  <div class="responsive-number-pair">
                    <el-input-number v-model="form.interceptConfig.collect.postCooldownMinSec" :min="0" :step="1" class="w-full" />
                    <el-input-number v-model="form.interceptConfig.collect.postCooldownMaxSec" :min="0" :step="1" class="w-full" />
                  </div>
                </el-form-item>
                <el-form-item label="账号后休息秒">
                  <div class="responsive-number-pair">
                    <el-input-number v-model="form.interceptConfig.collect.accountCooldownMinSec" :min="0" :step="1" class="w-full" />
                    <el-input-number v-model="form.interceptConfig.collect.accountCooldownMaxSec" :min="0" :step="1" class="w-full" />
                  </div>
                </el-form-item>
                <el-form-item label="调试文件">
                  <el-switch v-model="form.interceptConfig.collect.saveDebugFiles" active-text="保存" inactive-text="不保存" />
                </el-form-item>
              </div>
            </el-collapse-item>

            <el-collapse-item title="运行周期与时间段" name="schedule">
              <div class="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 dark:bg-slate-900/40">
                机器人可以提前启动，但只有到达“每 N 天一次”的运行日，且处于启用时间段内才正式采集。
              </div>
              <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-3">
                <el-form-item label="运行间隔天数">
                  <el-input-number v-model="form.interceptConfig.schedule.runEveryDays" :min="1" :max="365" :step="1" class="w-full" />
                </el-form-item>
              </div>
              <div class="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
                <div class="text-xs leading-5 text-slate-500">默认运行时间为 19:00 - 00:00，支持新增多个时间段。跨天时间段会自动识别。</div>
                <el-button @click="addInterceptRunWindow">新增时间段</el-button>
              </div>
              <div v-for="(window, index) in form.interceptConfig.schedule.runWindows" :key="`intercept-window-${index}`" class="runtime-window-grid grid grid-cols-1 gap-x-4 xl:grid-cols-4">
                <el-form-item label="窗口名"><el-input v-model="window.name" placeholder="如：晚间" /></el-form-item>
                <el-form-item label="开始"><el-time-picker v-model="window.start" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
                <el-form-item label="结束"><el-time-picker v-model="window.end" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
                <el-form-item label="启用 / 删除">
                  <div class="flex items-center gap-2">
                    <el-switch v-model="window.enabled" />
                    <el-button type="danger" plain :disabled="form.interceptConfig.schedule.runWindows.length <= 1" @click="removeInterceptRunWindow(index)">删除</el-button>
                  </div>
                </el-form-item>
              </div>
            </el-collapse-item>
          </el-collapse>

          <template #footer>
            <el-button @click="interceptConfigDrawerVisible = false">关闭</el-button>
            <el-button type="primary" @click="interceptConfigDrawerVisible = false">完成</el-button>
          </template>
        </el-drawer>
      </template>

      <el-collapse v-if="category !== 'INTERCEPT'" class="runtime-policy-collapse mb-5">
        <el-collapse-item title="运行时间策略（UCP 执行）" name="runtime-policy">
          <div class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
            策略保存到机器人 config.runtimePolicy。日志、接口详情等通用控制仍由客户端读取；截流目标、运行间隔和时间段保存在 config.intercept。
          </div>
          <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
            <el-form-item label="启用策略">
              <el-switch v-model="form.runtimePolicy.enabled" active-text="启用" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="时区">
              <el-select v-model="form.runtimePolicy.timezone" class="w-full">
                <el-option label="Asia/Shanghai" value="Asia/Shanghai" />
              </el-select>
            </el-form-item>
            <el-form-item label="GUI 运行日志">
              <el-switch v-model="form.runtimePolicy.diagnostics.guiLogEnabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="接口可视化">
              <el-switch v-model="form.runtimePolicy.diagnostics.interfaceTraceEnabled" active-text="开启" inactive-text="关闭" />
              <div class="mt-1 text-xs text-slate-400">开启时每个机器人最多保留最近 50 条接口记录。</div>
            </el-form-item>
            <el-form-item v-if="category !== 'INTERCEPT'" label="夜间休眠">
              <el-switch v-model="form.runtimePolicy.hardSleep.enabled" active-text="启用" inactive-text="关闭" />
            </el-form-item>
            <el-form-item v-if="category !== 'INTERCEPT'" label="休眠开始">
              <el-time-picker v-model="form.runtimePolicy.hardSleep.sleepStart" value-format="HH:mm" format="HH:mm" placeholder="01:00" class="w-full" />
            </el-form-item>
            <el-form-item v-if="category !== 'INTERCEPT'" label="恢复开始">
              <el-time-picker v-model="form.runtimePolicy.hardSleep.wakeStart" value-format="HH:mm" format="HH:mm" placeholder="08:30" class="w-full" />
            </el-form-item>
            <el-form-item v-if="category !== 'INTERCEPT'" label="恢复结束">
              <el-time-picker v-model="form.runtimePolicy.hardSleep.wakeEnd" value-format="HH:mm" format="HH:mm" placeholder="09:00" class="w-full" />
            </el-form-item>
          </div>

          <template v-if="category === 'PRIVATE_MESSAGE'">
            <el-divider content-position="left">私信密集窗口</el-divider>
            <div v-for="window in form.runtimePolicy.dmPolicy.denseWindows" :key="window.name" class="runtime-window-grid grid grid-cols-1 gap-x-4 xl:grid-cols-4">
              <el-form-item label="窗口名"><el-input v-model="window.name" /></el-form-item>
              <el-form-item label="开始"><el-time-picker v-model="window.start" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
              <el-form-item label="结束"><el-time-picker v-model="window.end" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
              <el-form-item label="间隔分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="window.intervalMinSec" :min="1" :step="1" class="w-full" />
                  <el-input-number v-model="window.intervalMaxSec" :min="1" :step="1" class="w-full" />
                </div>
              </el-form-item>
            </div>
            <el-divider content-position="left">私信普通/低频窗口</el-divider>
            <div v-for="window in form.runtimePolicy.dmPolicy.normalWindows" :key="window.name" class="runtime-window-grid grid grid-cols-1 gap-x-4 xl:grid-cols-4">
              <el-form-item label="窗口名"><el-input v-model="window.name" /></el-form-item>
              <el-form-item label="开始"><el-time-picker v-model="window.start" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
              <el-form-item label="结束"><el-time-picker v-model="window.end" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
              <el-form-item label="间隔分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="window.intervalMinSec" :min="1" :step="1" class="w-full" />
                  <el-input-number v-model="window.intervalMaxSec" :min="1" :step="1" class="w-full" />
                </div>
              </el-form-item>
            </div>
            <el-divider content-position="left">私信其他时间</el-divider>
            <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
              <el-form-item label="聚合等待分钟">
                <el-input-number v-model="form.runtimePolicy.dmPolicy.messageAggregateWaitSec" :min="0" :step="0.1" :precision="2" class="w-full" />
              </el-form-item>
              <el-form-item label="空轮阈值">
                <el-input-number v-model="form.runtimePolicy.dmPolicy.emptyRoundThreshold" :min="1" :step="1" class="w-full" />
              </el-form-item>
              <el-form-item label="非窗口轮询分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.pollIntervalMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.pollIntervalMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="短空闲分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.shortIdleMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.shortIdleMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="长空闲分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.longIdleMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.longIdleMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="回复后冷却分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.afterReplyCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.afterReplyCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="异常冷却分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.errorCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.dmPolicy.errorCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
            </div>
          </template>

          <template v-if="category === 'COMMENT'">
            <el-divider content-position="left">评论处理窗口（早/中/晚）</el-divider>
            <div v-for="window in form.runtimePolicy.commentPolicy.workWindows" :key="window.name" class="runtime-window-grid grid grid-cols-1 gap-x-4 xl:grid-cols-4">
              <el-form-item label="窗口名"><el-input v-model="window.name" /></el-form-item>
              <el-form-item label="开始"><el-time-picker v-model="window.start" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
              <el-form-item label="结束"><el-time-picker v-model="window.end" value-format="HH:mm" format="HH:mm" class="w-full" /></el-form-item>
              <el-form-item label="间隔分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="window.intervalMinSec" :min="1" :step="1" class="w-full" />
                  <el-input-number v-model="window.intervalMaxSec" :min="1" :step="1" class="w-full" />
                </div>
              </el-form-item>
            </div>
            <el-divider content-position="left">评论冷却时间</el-divider>
            <div class="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
              <el-form-item label="回复成功后分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.afterReplyCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.afterReplyCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="当前作品完成分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.workCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.workCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="无候选冷却分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.noCandidateCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.noCandidateCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="整轮完成分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.roundCompletedCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.roundCompletedCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="连续空轮阈值">
                <el-input-number v-model="form.runtimePolicy.commentPolicy.multiEmptyRoundThreshold" :min="1" :step="1" class="w-full" />
              </el-form-item>
              <el-form-item label="连续空轮冷却分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.multiEmptyRoundCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.multiEmptyRoundCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
              <el-form-item label="异常重试冷却分钟">
                <div class="responsive-number-pair">
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.errorCooldownMinSec" :min="0" :step="1" class="w-full" />
                  <el-input-number v-model="form.runtimePolicy.commentPolicy.errorCooldownMaxSec" :min="0" :step="1" class="w-full" />
                </div>
              </el-form-item>
            </div>
          </template>
        </el-collapse-item>
      </el-collapse>

      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="可选，记录机器人用途、账号说明、风控备注等" />
      </el-form-item>
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
        新建时仅保存基础信息，授权状态默认为“未授权”；待 PC 端完成关联授权和绑定后，再由后端回传“已授权”及实际运行状态。
      </div>
    </el-form>

    <el-dialog
      v-model="targetDialogVisible"
      :title="targetDialogTitle"
      width="min(680px, calc(100vw - 32px))"
      append-to-body
      destroy-on-close
      class="intercept-target-edit-dialog"
    >
      <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-900/50">
        <span>每条监听由账号名称和链接组成。账号名称仅用于运营识别，保存后在列表中作为标签展示。</span>
        <el-button v-if="targetDialogMode === 'create'" size="small" type="primary" plain @click="addTargetDraft">新增监听</el-button>
      </div>
      <div class="space-y-3">
        <div v-for="(draft, index) in targetDrafts" :key="index" class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <div class="mb-3 flex items-center justify-between">
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ targetDialogMode === 'create' ? `监听 ${index + 1}` : '编辑监听' }}</div>
            <el-button v-if="targetDialogMode === 'create' && targetDrafts.length > 1" link type="danger" @click="removeTargetDraft(index)">删除本条</el-button>
          </div>
          <el-form label-position="top">
            <el-form-item label="账号名称">
              <el-input v-model="draft.accountName" maxlength="60" show-word-limit placeholder="请输入账号名称，例如：竞品账号A" />
            </el-form-item>
            <el-form-item :label="`${activeTargetModeLabel}链接`">
              <el-input v-model="draft.url" type="textarea" :rows="2" placeholder="请输入可直接访问的主页或作品链接" />
            </el-form-item>
            <el-form-item label="状态" class="!mb-0">
              <el-switch v-model="draft.enabled" active-text="启用" inactive-text="停用" />
            </el-form-item>
          </el-form>
        </div>
      </div>
      <template #footer>
        <el-button @click="targetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmTargetDialog">确定</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadRawFile } from 'element-plus';
import HelpTip from '@/components/common/HelpTip.vue';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import type { SelectOption } from '@/utils/apiData';
import { DEFAULT_INTERCEPT_CONFIG, ROBOT_DEFAULT_FORM, ROBOT_CATEGORY_META } from '../constants';
import { cloneRuntimePolicy, type RuntimePolicy, type RuntimeWindow } from '../runtimePolicy';
import type { InterceptTargetEntry, RobotCategory, RobotManagementFormModel } from '../types';
import type { AutoReplyPromptConfig, AutoReplyPromptSnapshot, CommentReplyDatasetItem } from '@/api/modules/autoReplies';
import type { InterceptIntentPromptConfigItem } from '@/api/modules/robots';
import { downloadInterceptTargetTemplate, exportInterceptTargets, parseInterceptTargetExcel } from '../interceptTargetTable';
import { listCustomerServiceAccountProfiles } from '@/modules/customer-service/api/context-profiles.api';
import type { CustomerServiceAccountProfile } from '@/modules/customer-service/types/context-profiles.types';

type PromptOptionLike = AutoReplyPromptConfig | InterceptIntentPromptConfigItem;

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  category: RobotCategory;
  initialData?: Partial<RobotManagementFormModel>;
  platformOptions: SelectOption[];
  promptOptions?: PromptOptionLike[];
  datasetOptions?: CommentReplyDatasetItem[];
  submitting?: boolean;
  syncingPrompt?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: RobotManagementFormModel];
  test: [payload: RobotManagementFormModel];
  'sync-prompt-config': [payload: RobotManagementFormModel];
}>();

const formRef = ref<FormInstance>();
const router = useRouter();
const form = reactive<RobotManagementFormModel>(cloneForm(ROBOT_DEFAULT_FORM));

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const mode = computed(() => props.mode);
const category = computed(() => props.category);
const submitting = computed(() => props.submitting);
const syncingPrompt = computed(() => props.syncingPrompt);
const platformOptions = computed(() => props.platformOptions);
const meta = computed(() => ROBOT_CATEGORY_META[props.category]);
const isAutoReplyCategory = computed(() => props.category === 'PRIVATE_MESSAGE' || props.category === 'COMMENT');
const defaultPlatformLabel = computed(() => (props.category === 'COMMENT' ? '抖音评论区' : '抖音私信'));
const promptOptions = computed(() => props.promptOptions ?? []);
const datasetOptions = computed(() => props.datasetOptions ?? []);
const accountProfiles = ref<CustomerServiceAccountProfile[]>([]);
const accountProfilesLoading = ref(false);
const advancedConfigOpen = ref(false);
const showAdvancedAutoReply = computed(() => advancedConfigOpen.value || form.aiBinding.provider === 'COZE');
const selectedAccountProfile = computed(() => accountProfiles.value.find((item) => item.id === form.aiBinding.accountProfileId));
const hasUserContent = computed(() => Boolean(
  form.name.trim() || form.expiredAt || form.promptConfigId || form.aiBinding.accountProfileId || form.remark.trim(),
));
const accountProfileDescription = computed(() => {
  const item = selectedAccountProfile.value;
  if (!item) return '';
  return [item.storeProfile?.name, item.merchantRole?.name, item.industryNode?.name, item.channel].filter(Boolean).join(' · ') || '已使用该账号的结构化身份与表达配置';
});

const postContext = computed({
  get: () => String(form.promptSnapshot.extraParams?.POST_CONTEXT ?? ''),
  set: (value: string) => {
    form.promptSnapshot.extraParams = { ...(form.promptSnapshot.extraParams ?? {}), POST_CONTEXT: value };
  }
});


const interceptConfigDrawerVisible = ref(false);
const interceptConfigPanels = ref<string[]>(['base']);
const targetDialogVisible = ref(false);
const targetDialogMode = ref<'create' | 'edit'>('create');
const editingTargetIndex = ref(-1);
const targetDrafts = ref<Array<{ url: string; accountName: string; enabled: boolean }>>([]);

const activeTargetType = computed<'homepage' | 'content'>(() => (form.interceptConfig.targetMode === 'content' ? 'content' : 'homepage'));
const activeTargetModeLabel = computed(() => (activeTargetType.value === 'homepage' ? '主页' : '作品'));
const activeTargetModeHelp = computed(() =>
  activeTargetType.value === 'homepage'
    ? '请输入可以直接访问的主页路径，支持多个主页顺序监听'
    : '请输入可以直接访问的作品路径，支持多个作品顺序监听'
);
const activeTargets = computed(() => getInterceptTargetList(activeTargetType.value));
const interceptSummaryItems = computed(() => {
  const cfg = form.interceptConfig;
  const targetCount = getInterceptTargetList(cfg.targetMode).filter((item) => item.enabled !== false && item.url.trim()).length;
  const maxDuration = Number(cfg.collect.maxPostDurationSeconds || 0);
  const runWindows = cfg.schedule.runWindows.filter((item) => item.enabled).map((item) => `${item.start}-${item.end}`);
  return [
    { label: 'AI 引擎', value: cfg.aiBinding.provider === 'DEEPSEEK' ? `DeepSeek${cfg.aiBinding.accountProfileId ? '（已绑定账号知识）' : ''}` : '扣子兼容模式' },
    { label: '目标模式', value: cfg.targetMode === 'homepage' ? `主页链接（${targetCount} 个）` : `作品链接（${targetCount} 个）` },
    { label: '前置判定', value: `${cfg.speech.enabled ? '口播开启' : '口播关闭'} / ${cfg.workDecision.enabled ? '作品判定开启' : '作品判定关闭'}` },
    { label: '候选筛选', value: `近 ${cfg.homepageLookbackDays} 天；单作品${maxDuration > 0 ? `≤${maxDuration}秒` : '不限时长'}；最多 ${cfg.collect.maxPosts || '不限'} 个` },
    { label: '运行周期', value: `每 ${cfg.schedule.runEveryDays || 1} 天；${runWindows.length ? runWindows.join('、') : '未启用时间段'}` },
    { label: '评论采集', value: `单作品评论${cfg.collect.maxCommentsPerPost || '不限'}；评论最长${cfg.collect.commentFetchMaxSeconds || '不限'}秒` },
    { label: '失败策略', value: `口播失败${cfg.speech.failStrategy === 'RUN' ? '继续' : '跳过'}；口播为空${cfg.speech.emptyTranscriptStrategy === 'RUN' ? '继续' : '跳过'}；判定失败${cfg.workDecision.failStrategy === 'RUN' ? '继续' : '跳过'}` },
    { label: '节奏', value: `${pacingProfileLabel(cfg.collect.pacingProfile)}；作品后 ${cfg.collect.postCooldownMinSec}-${cfg.collect.postCooldownMaxSec} 秒` },
    { label: '访问顺序', value: cfg.collect.randomizeTargets ? '随机访问，本轮不重复' : '按列表顺序访问' }
  ];
});
const targetDialogTitle = computed(() => `${targetDialogMode.value === 'create' ? '新增' : '编辑'}${activeTargetModeLabel.value}监听`);

const rules = computed<FormRules<RobotManagementFormModel>>(() => {
  const base: FormRules<RobotManagementFormModel> = {
    name: [{ required: true, message: '请输入机器人名称', trigger: 'blur' }],
    platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
    expiredAt: [{ required: true, message: '请选择过期时间', trigger: 'change' }]
  };
  if (isAutoReplyCategory.value) {
    if (form.aiBinding.provider === 'COZE') {
      base.promptConfigId = [{ required: true, message: '请选择提示词配置', trigger: 'change' }];
    }
  }
  if (props.category === 'COMMENT') {
    base.commentReplyMode = [{ required: true, message: '请选择评论回复范围', trigger: 'change' }];
  }
  return base;
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    advancedConfigOpen.value = false;
    const nextForm = cloneForm({ ...ROBOT_DEFAULT_FORM, ...props.initialData });
    nextForm.runtimePolicy = runtimePolicySecondsToMinutes(nextForm.runtimePolicy);
    Object.assign(form, nextForm);
    ensurePromptSnapshotShape();
    applyDefaultInterceptPromptIfNeeded();
    void loadAccountProfiles();
    if (form.promptConfigId && !Object.keys(form.promptSnapshot).length) {
      applySelectedPrompt(form.promptConfigId);
    }
  }
);

function fillRobotSample() {
  const categoryName = props.category === 'PRIVATE_MESSAGE' ? '私信' : props.category === 'COMMENT' ? '评论' : '竞品截流';
  const accountId = accountProfiles.value[0]?.id ?? '';
  const promptId = promptOptions.value[0]?.id ?? '';
  Object.assign(form, {
    name: `抖音${categoryName}测试机器人`, platform: 'DOUYIN', expiredAt: futureLocalDateTime(30),
    remark: '由参考样例回填的本地测试配置，请核对账号、提示词和运行范围后再保存。',
    promptConfigId: promptId, commentReplyMode: 'ALL_UNREPLIED', replyDatasetId: '',
    enableFirstReply: false, firstReplyContents: [], useConversationContext: true,
    aiBinding: { provider: 'DEEPSEEK', accountProfileId: accountId, fallbackToCoze: true, assetIds: [] },
  });
  form.interceptConfig.aiBinding = { provider: 'DEEPSEEK', accountProfileId: accountId, fallbackToCoze: true, assetIds: [] };
  if (promptId) applySelectedPrompt(promptId);
  if (!accountId) ElMessage.warning('基础测试样例已填入；当前没有可用账号资料，请先新增并启用一份账号资料');
  else ElMessage.success('机器人测试样例已填入，请核对真实账号与提示词后再保存');
}

function futureLocalDateTime(days: number) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

watch(
  () => form.promptConfigId,
  (id, oldId) => {
    if (!visible.value || !id || id === oldId) return;
    applySelectedPrompt(id);
  }
);

watch(
  () => props.promptOptions,
  () => {
    if (visible.value) {
      applyDefaultInterceptPromptIfNeeded();
    }
    if (visible.value && form.promptConfigId && !form.promptSnapshot.name) {
      applySelectedPrompt(form.promptConfigId);
    }
  },
  { deep: true }
);


function openInterceptConfigDrawer() {
  if (!interceptConfigPanels.value.length) interceptConfigPanels.value = ['base'];
  interceptConfigDrawerVisible.value = true;
}

function pacingProfileLabel(value: string) {
  if (value === 'conservative') return '稳妥';
  if (value === 'efficient') return '高效';
  return '均衡';
}

function getInterceptTargetList(type: 'homepage' | 'content') {
  return type === 'homepage' ? form.interceptConfig.homepageTargets : form.interceptConfig.contentTargets;
}

function createEmptyTargetDraft() {
  return { url: '', accountName: '', enabled: true };
}

function normalizeTargetDraft(draft: { url?: string; accountName?: string; enabled?: boolean }): InterceptTargetEntry | null {
  const url = String(draft.url ?? '').trim();
  if (!url) return null;
  const accountName = String(draft.accountName ?? '').trim();
  return {
    url,
    accountName,
    label: accountName || undefined,
    enabled: draft.enabled !== false
  };
}

function targetTagText(target: InterceptTargetEntry, index: number) {
  return target.accountName || target.label || `${activeTargetModeLabel.value}${index + 1}`;
}

function promptOptionMeta(item: PromptOptionLike) {
  const record = item as Partial<InterceptIntentPromptConfigItem> & Partial<AutoReplyPromptConfig>;
  if ((record as InterceptIntentPromptConfigItem).isDefault) return '默认';
  return String((record as InterceptIntentPromptConfigItem).status || (record as AutoReplyPromptConfig).platformLabel || '');
}

function handleInterceptPromptConfigChange(id: string | number | boolean | undefined) {
  const value = String(id || '');
  const selected = promptOptions.value.find((item) => item.id === value) as InterceptIntentPromptConfigItem | undefined;
  form.interceptConfig.intentAnalysis = {
    promptConfigId: value,
    promptConfigName: selected?.name || '',
    workflowId: selected?.workflowId || '',
    batchSize: selected?.batchSize,
    useTenantDefault: false
  };
}

function applyDefaultInterceptPromptIfNeeded() {
  if (props.category !== 'INTERCEPT' || form.interceptConfig.intentAnalysis.promptConfigId) return;
  const selected = (promptOptions.value.find((item) => (item as InterceptIntentPromptConfigItem).isDefault) || promptOptions.value[0]) as InterceptIntentPromptConfigItem | undefined;
  if (selected?.id) handleInterceptPromptConfigChange(selected.id);
}

function openCreateInterceptTargetDialog() {
  targetDialogMode.value = 'create';
  editingTargetIndex.value = -1;
  targetDrafts.value = [createEmptyTargetDraft()];
  targetDialogVisible.value = true;
}

function openEditInterceptTargetDialog(index: number) {
  const target = activeTargets.value[index];
  if (!target) return;
  targetDialogMode.value = 'edit';
  editingTargetIndex.value = index;
  targetDrafts.value = [{ url: target.url, accountName: target.accountName || target.label || '', enabled: target.enabled !== false }];
  targetDialogVisible.value = true;
}

function addTargetDraft() {
  targetDrafts.value.unshift(createEmptyTargetDraft());
}

function removeTargetDraft(index: number) {
  if (targetDrafts.value.length <= 1) return;
  targetDrafts.value.splice(index, 1);
}

function confirmTargetDialog() {
  const normalized = targetDrafts.value.map((item) => normalizeTargetDraft(item)).filter((item): item is InterceptTargetEntry => Boolean(item));
  if (!normalized.length) {
    ElMessage.warning(`请至少填写一个${activeTargetModeLabel.value}链接`);
    return;
  }
  const list = getInterceptTargetList(activeTargetType.value);
  if (targetDialogMode.value === 'edit') {
    const index = editingTargetIndex.value;
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1, normalized[0]);
  } else {
    prependTargets(normalized);
  }
  targetDialogVisible.value = false;
}

async function confirmRemoveInterceptTarget(index: number) {
  const target = activeTargets.value[index];
  if (!target) return;
  try {
    await ElMessageBox.confirm(`确认删除“${targetTagText(target, index)}”吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
    getInterceptTargetList(activeTargetType.value).splice(index, 1);
  } catch {
    // 用户取消。
  }
}

function prependTargets(targets: InterceptTargetEntry[]) {
  const list = getInterceptTargetList(activeTargetType.value);
  const urls = new Set(targets.map((item) => item.url.trim()).filter(Boolean));
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (urls.has(list[index].url.trim())) {
      list.splice(index, 1);
    }
  }
  list.unshift(...targets);
}

async function handleTargetImport(file: UploadRawFile) {
  try {
    const rows = await parseInterceptTargetExcel(file as File);
    const targets = rows.map((item) => normalizeTargetDraft(item)).filter((item): item is InterceptTargetEntry => Boolean(item));
    if (!targets.length) {
      ElMessage.warning('表格内没有可导入的有效链接，请确认表头包含“账号名称、链接、是否启用”。');
      return false;
    }
    prependTargets(targets);
    ElMessage.success(`已导入 ${targets.length} 条${activeTargetModeLabel.value}监听`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '表格导入失败');
  }
  return false;
}

async function downloadTargetTemplate() {
  await downloadInterceptTargetTemplate(activeTargetModeLabel.value);
}

async function exportCurrentTargets() {
  await exportInterceptTargets(activeTargets.value, activeTargetModeLabel.value);
}

function addInterceptRunWindow() {
  form.interceptConfig.schedule.runWindows.push({ name: `时间段 ${form.interceptConfig.schedule.runWindows.length + 1}`, start: '19:00', end: '00:00', enabled: true });
}

function removeInterceptRunWindow(index: number) {
  if (form.interceptConfig.schedule.runWindows.length <= 1) return;
  form.interceptConfig.schedule.runWindows.splice(index, 1);
}

function validateInterceptConfig() {
  if (props.category !== 'INTERCEPT') return true;
  const config = form.interceptConfig;
  const activeList = getInterceptTargetList(config.targetMode).filter((item) => item.enabled && item.url.trim());
  if (!activeList.length) {
    ElMessage.warning(`请至少配置一个启用的${config.targetMode === 'homepage' ? '主页' : '作品'}链接`);
    return false;
  }
  const enabledWindows = config.schedule.runWindows.filter((item) => item.enabled);
  if (!enabledWindows.length) {
    ElMessage.warning('请至少启用一个运行时间段');
    return false;
  }
  if (enabledWindows.some((item) => !item.start || !item.end)) {
    ElMessage.warning('请补全运行时间段的开始和结束时间');
    return false;
  }
  if (!Number.isFinite(Number(config.schedule.runEveryDays)) || Number(config.schedule.runEveryDays) < 1) {
    ElMessage.warning('运行间隔天数必须大于等于 1');
    return false;
  }
  if (!Number.isFinite(Number(config.collect.maxTargetMinutes)) || Number(config.collect.maxTargetMinutes) < 1) {
    ElMessage.warning('单目标最长分钟必须大于等于 1');
    return false;
  }
  if (Number(config.collect.postCooldownMaxSec) < Number(config.collect.postCooldownMinSec)) {
    ElMessage.warning('作品后休息秒的最大值不能小于最小值');
    return false;
  }
  if (Number(config.collect.accountCooldownMaxSec) < Number(config.collect.accountCooldownMinSec)) {
    ElMessage.warning('账号后休息秒的最大值不能小于最小值');
    return false;
  }
  return true;
}


async function handleSubmit() {
  await formRef.value?.validate();
  if (isAutoReplyCategory.value && form.aiBinding.provider === 'DEEPSEEK' && !form.aiBinding.accountProfileId) {
    ElMessage.warning('请选择账号配置');
    return;
  }
  if (props.category === 'INTERCEPT' && !form.interceptConfig.intentAnalysis.promptConfigId) {
    ElMessage.warning('请先关联一个启用的意向分析提示词配置');
    return;
  }
  if (!validateInterceptConfig()) return;
  if (isAutoReplyCategory.value && form.aiBinding.provider === 'COZE') {
    const missing = validatePromptSnapshot(props.category, form.promptSnapshot);
    if (missing.length) {
      ElMessage.warning(`提示词配置不完整：${missing.join('、')}`);
      return;
    }
  }
  emit('submit', buildSubmitPayload());
}

function openTestDrawer() {
  if (form.aiBinding.provider === 'DEEPSEEK' && !form.aiBinding.accountProfileId) {
    ElMessage.warning('请先选择账号配置');
    return;
  }
  if (form.aiBinding.provider === 'COZE' && !form.promptConfigId) {
    ElMessage.warning('请先选择提示词配置');
    return;
  }
  const missing = form.aiBinding.provider === 'COZE' ? validatePromptSnapshot(props.category, form.promptSnapshot) : [];
  if (missing.length) {
    ElMessage.warning(`提示词配置不完整：${missing.join('、')}`);
    return;
  }
  emit('test', buildSubmitPayload());
}

function syncPromptConfig() {
  if (!form.promptConfigId) {
    ElMessage.warning('请先选择提示词配置');
    return;
  }
  const missing = validatePromptSnapshot(props.category, form.promptSnapshot);
  if (missing.length) {
    ElMessage.warning(`提示词配置不完整：${missing.join('、')}`);
    return;
  }
  emit('sync-prompt-config', buildSubmitPayload());
}

function addFirstReply() {
  form.firstReplyContents.push('');
}

function removeFirstReply(index: number) {
  form.firstReplyContents.splice(index, 1);
}

function applySelectedPrompt(id: string) {
  const selected = promptOptions.value.find((item) => item.id === id);
  if (!selected) return;
  form.promptSnapshot = promptConfigToSnapshot(selected as AutoReplyPromptConfig);
}

function ensurePromptSnapshotShape() {
  form.runtimePolicy = cloneRuntimePolicyPlain(form.runtimePolicy);
  form.interceptConfig = cloneInterceptConfig(form.interceptConfig);
  form.promptSnapshot = { ...(form.promptSnapshot ?? {}) };
  form.promptSnapshot.extraParams = { ...(form.promptSnapshot.extraParams ?? {}) };
  if (!form.promptSnapshot.platformLabel) form.promptSnapshot.platformLabel = defaultPlatformLabel.value;
  if (!form.promptSnapshot.replyLength) form.promptSnapshot.replyLength = 2;
  if (props.category === 'PRIVATE_MESSAGE' && !form.promptSnapshot.maxMsgCount) form.promptSnapshot.maxMsgCount = 3;
}

function promptConfigToSnapshot(config: AutoReplyPromptConfig): AutoReplyPromptSnapshot {
  return {
    id: config.id,
    module: config.module,
    name: config.name,
    customSystemPrompt: config.customSystemPrompt || '',
    customUserPrompt: config.customUserPrompt || '',
    forbiddenWords: config.forbiddenWords || '',
    requiredWords: config.requiredWords || '',
    replyStyle: config.replyStyle || '',
    platformLabel: config.platformLabel || defaultPlatformLabel.value,
    accountPositioning: config.accountPositioning || '',
    businessProfile: config.businessProfile || '',
    goal: config.goal || '',
    policy: config.policy || '',
    safetyPolicy: config.safetyPolicy || '',
    replyLength: config.replyLength || 2,
    maxMsgCount: props.category === 'PRIVATE_MESSAGE' ? config.maxMsgCount || 3 : undefined,
    workflowMode: config.workflowMode || workflowModeOf(config),
    workflowId: config.workflowId || String(config.extraParams?.WORKFLOW_ID ?? ''),
    workflowBotId: config.workflowBotId || String(config.extraParams?.WORKFLOW_BOT_ID ?? ''),
    workflowInputKey: config.workflowInputKey || String(config.extraParams?.WORKFLOW_INPUT_KEY ?? 'input'),
    extraParams: { ...(config.extraParams ?? {}) }
  };
}

function validatePromptSnapshot(category: RobotCategory, snapshot?: AutoReplyPromptSnapshot) {
  if (category !== 'COMMENT' && category !== 'PRIVATE_MESSAGE') return [];
  const prompt = snapshot || {};
  const mode = workflowModeOf(prompt);
  const missing: string[] = [];
  if (mode !== 'DEFAULT' && !workflowIdOf(prompt)) missing.push('工作流 ID');
  if (mode === 'PLAIN_CHAT') {
    if (!workflowInputKeyOf(prompt)) missing.push('输入变量名');
    return missing;
  }

  const required: Array<[keyof AutoReplyPromptSnapshot | 'POST_CONTEXT', string]> = [
    ['customSystemPrompt', '系统提示词'],
    ['customUserPrompt', '补充提示词'],
    ['forbiddenWords', '禁用词'],
    ['requiredWords', '要求词'],
    ['replyStyle', '回复风格'],
    ['platformLabel', '平台名称'],
    ['accountPositioning', '账号定位'],
    ['businessProfile', '业务简介'],
    ['goal', category === 'COMMENT' ? '评论目标' : '转化目标'],
    ['policy', category === 'COMMENT' ? '评论规则' : '联系规则'],
    ['safetyPolicy', '安全约束'],
    ['replyLength', '回复条数']
  ];
  if (category === 'PRIVATE_MESSAGE') required.push(['maxMsgCount', '最大消息数']);
  if (category === 'COMMENT') required.push(['POST_CONTEXT', '作品上下文']);
  return [
    ...missing,
    ...required
      .filter(([key]) => {
        if (key === 'POST_CONTEXT') return !String(prompt.extraParams?.POST_CONTEXT ?? '').trim();
        const value = prompt[key as keyof AutoReplyPromptSnapshot];
        if (typeof value === 'number') return !Number.isFinite(value) || value <= 0;
        return !String(value ?? '').trim();
      })
      .map(([, label]) => label)
  ];
}

function workflowModeOf(prompt?: AutoReplyPromptSnapshot) {
  const value = String(prompt?.workflowMode ?? prompt?.extraParams?.WORKFLOW_MODE ?? 'DEFAULT').trim().toUpperCase();
  if (value === 'PLAIN_CHAT') return 'PLAIN_CHAT' as const;
  if (value === 'STRUCTURED') return 'STRUCTURED' as const;
  return 'DEFAULT' as const;
}

function workflowIdOf(prompt?: AutoReplyPromptSnapshot) {
  return String(prompt?.workflowId ?? prompt?.extraParams?.WORKFLOW_ID ?? '').trim();
}

function workflowInputKeyOf(prompt?: AutoReplyPromptSnapshot) {
  return String(prompt?.workflowInputKey ?? prompt?.extraParams?.WORKFLOW_INPUT_KEY ?? 'input').trim() || 'input';
}

function buildSubmitPayload() {
  const payload = cloneForm(form, false);
  payload.runtimePolicy = runtimePolicyMinutesToSeconds(payload.runtimePolicy);
  payload.interceptConfig = buildSubmitInterceptConfig(payload.interceptConfig);
  return payload;
}

function buildSubmitInterceptConfig(config: RobotManagementFormModel['interceptConfig']): RobotManagementFormModel['interceptConfig'] {
  const normalized = cloneInterceptConfig(config);
  const activeType = normalized.targetMode === 'content' ? 'content' : 'homepage';
  normalized.homepageTargets = activeType === 'homepage' ? normalizeTargetsForSubmit(normalized.homepageTargets) : [];
  normalized.contentTargets = activeType === 'content' ? normalizeTargetsForSubmit(normalized.contentTargets) : [];
  normalized.schedule.runEveryDays = Math.max(1, Number(normalized.schedule.runEveryDays || 3));
  normalized.collect.maxTargetMinutes = Math.max(1, Number(normalized.collect.maxTargetMinutes || 30));
  normalized.collect.commentFetchMaxSeconds = Math.max(0, Number(normalized.collect.commentFetchMaxSeconds || 0));
  normalized.collect.maxPostDurationSeconds = Math.max(0, Number(normalized.collect.maxPostDurationSeconds || 0));
  normalized.collect.postCooldownMinSec = Math.max(0, Number(normalized.collect.postCooldownMinSec || 0));
  normalized.collect.postCooldownMaxSec = Math.max(normalized.collect.postCooldownMinSec, Number(normalized.collect.postCooldownMaxSec || 0));
  normalized.collect.accountCooldownMinSec = Math.max(0, Number(normalized.collect.accountCooldownMinSec || 0));
  normalized.collect.accountCooldownMaxSec = Math.max(normalized.collect.accountCooldownMinSec, Number(normalized.collect.accountCooldownMaxSec || 0));
  normalized.collect.commentPagePauseMinSec = Math.max(0, Number(normalized.collect.commentPagePauseMinSec || 0));
  normalized.collect.commentPagePauseMaxSec = Math.max(normalized.collect.commentPagePauseMinSec, Number(normalized.collect.commentPagePauseMaxSec || 0));
  const selected = promptOptions.value.find((item) => item.id === normalized.intentAnalysis.promptConfigId) as InterceptIntentPromptConfigItem | undefined;
  normalized.intentAnalysis = {
    promptConfigId: normalized.intentAnalysis.promptConfigId || '',
    promptConfigName: normalized.intentAnalysis.promptConfigId ? normalized.intentAnalysis.promptConfigName || selected?.name || '' : '',
    workflowId: normalized.intentAnalysis.promptConfigId ? normalized.intentAnalysis.workflowId || selected?.workflowId || '' : '',
    batchSize: normalized.intentAnalysis.promptConfigId ? normalized.intentAnalysis.batchSize || selected?.batchSize : undefined,
    useTenantDefault: false
  };
  normalized.workDecision = {
    enabled: normalized.workDecision?.enabled !== false,
    workflowId: String(normalized.workDecision?.workflowId || '').trim(),
    failStrategy: normalized.workDecision?.failStrategy === 'RUN' ? 'RUN' : 'SKIP'
  };
  normalized.speech = {
    enabled: normalized.speech?.enabled !== false,
    failStrategy: normalized.speech?.failStrategy === 'RUN' ? 'RUN' : 'SKIP',
    emptyTranscriptStrategy: normalized.speech?.emptyTranscriptStrategy === 'RUN' ? 'RUN' : 'SKIP'
  };
  return normalized;
}

function normalizeTargetsForSubmit(items: InterceptTargetEntry[]) {
  return items
    .map((item) => normalizeTargetDraft({ url: item.url, accountName: item.accountName || item.label || '', enabled: item.enabled !== false }))
    .filter((item): item is InterceptTargetEntry => Boolean(item));
}

function cloneForm(source: Partial<RobotManagementFormModel>, normalizePolicy = true): RobotManagementFormModel {
  return {
    ...ROBOT_DEFAULT_FORM,
    ...source,
    promptSnapshot: { ...(source.promptSnapshot ?? {}) },
    runtimePolicy: normalizePolicy ? cloneRuntimePolicy(source.runtimePolicy) : cloneRuntimePolicyPlain(source.runtimePolicy),
    interceptConfig: cloneInterceptConfig(source.interceptConfig),
    firstReplyContents: [...(source.firstReplyContents ?? [])],
    aiBinding: {
      provider: source.aiBinding?.provider === 'DEEPSEEK' ? 'DEEPSEEK' : 'COZE',
      accountProfileId: String(source.aiBinding?.accountProfileId || ''),
      fallbackToCoze: source.aiBinding?.fallbackToCoze !== false,
      assetIds: [...(source.aiBinding?.assetIds ?? [])]
    },
    autoReplySettingConfig: { ...(source.autoReplySettingConfig ?? {}) }
  };
}

async function loadAccountProfiles() {
  if (accountProfilesLoading.value) return;
  accountProfilesLoading.value = true;
  try {
    const result = await listCustomerServiceAccountProfiles({ status: 'ENABLED', page: 1, pageSize: 100 });
    accountProfiles.value = result.items.filter((item) => item.status === 'ENABLED');
  } catch {
    accountProfiles.value = [];
  } finally {
    accountProfilesLoading.value = false;
  }
}


function cloneInterceptConfig(source?: Partial<RobotManagementFormModel['interceptConfig']>): RobotManagementFormModel['interceptConfig'] {
  const base = JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_CONFIG)) as RobotManagementFormModel['interceptConfig'];
  const raw = (source && typeof source === 'object' ? source : {}) as Partial<RobotManagementFormModel['interceptConfig']>;
  const targetMode = raw.targetMode === 'content' ? 'content' : 'homepage';
  const homepageTargets = normalizeInterceptTargets(raw.homepageTargets, '主页');
  const contentTargets = normalizeInterceptTargets(raw.contentTargets, '作品');
  const rawSchedule = (raw.schedule && typeof raw.schedule === 'object' ? raw.schedule : {}) as Partial<RobotManagementFormModel['interceptConfig']['schedule']>;
  const rawCollect = (raw.collect && typeof raw.collect === 'object' ? raw.collect : {}) as Partial<RobotManagementFormModel['interceptConfig']['collect']>;
  const rawIntentAnalysis = (raw.intentAnalysis && typeof raw.intentAnalysis === 'object' ? raw.intentAnalysis : {}) as Partial<RobotManagementFormModel['interceptConfig']['intentAnalysis']>;
  const rawSpeech = (raw.speech && typeof raw.speech === 'object' ? raw.speech : {}) as Partial<RobotManagementFormModel['interceptConfig']['speech']>;
  return {
    aiBinding: {
      provider: raw.aiBinding?.provider === 'COZE' ? 'COZE' : 'DEEPSEEK',
      accountProfileId: String(raw.aiBinding?.accountProfileId || ''),
      fallbackToCoze: raw.aiBinding?.fallbackToCoze !== false,
      assetIds: [...(raw.aiBinding?.assetIds ?? [])]
    },
    targetMode,
    homepageTargets,
    contentTargets,
    homepageLookbackDays: Math.max(1, Number(raw.homepageLookbackDays || base.homepageLookbackDays)),
    intentAnalysis: {
      promptConfigId: String(rawIntentAnalysis.promptConfigId || ''),
      promptConfigName: String(rawIntentAnalysis.promptConfigName || ''),
      workflowId: String(rawIntentAnalysis.workflowId || ''),
      batchSize: rawIntentAnalysis.batchSize ? Number(rawIntentAnalysis.batchSize) : undefined,
      useTenantDefault: false
    },
    workDecision: {
      enabled: (raw.workDecision as any)?.enabled !== false,
      workflowId: String((raw.workDecision as any)?.workflowId || base.workDecision.workflowId || ''),
      failStrategy: (raw.workDecision as any)?.failStrategy === 'RUN' ? 'RUN' : 'SKIP'
    },
    speech: {
      enabled: rawSpeech.enabled !== false,
      failStrategy: rawSpeech.failStrategy === 'RUN' ? 'RUN' : 'SKIP',
      emptyTranscriptStrategy: rawSpeech.emptyTranscriptStrategy === 'RUN' ? 'RUN' : 'SKIP'
    },
    schedule: {
      timezone: String(rawSchedule.timezone || base.schedule.timezone),
      anchorDate: rawSchedule.anchorDate ? String(rawSchedule.anchorDate) : undefined,
      runEveryDays: Math.max(1, Number(rawSchedule.runEveryDays || base.schedule.runEveryDays || 3)),
      runWindows: Array.isArray(rawSchedule.runWindows) && rawSchedule.runWindows.length
        ? rawSchedule.runWindows.map((item, index) => ({
            name: item?.name || `时间段 ${index + 1}`,
            start: String(item?.start || '19:00'),
            end: String(item?.end || '00:00'),
            enabled: item?.enabled !== false
          }))
        : base.schedule.runWindows
    },
    collect: {
      maxPosts: Math.max(0, Number(rawCollect.maxPosts ?? base.collect.maxPosts)),
      maxCommentsPerPost: Math.max(0, Number(rawCollect.maxCommentsPerPost ?? base.collect.maxCommentsPerPost)),
      captureSeconds: Math.max(3, Number(rawCollect.captureSeconds ?? base.collect.captureSeconds)),
      triggerScrollRounds: Math.max(0, Number(rawCollect.triggerScrollRounds ?? base.collect.triggerScrollRounds)),
      triggerPauseSec: Math.max(0.5, Number(rawCollect.triggerPauseSec ?? base.collect.triggerPauseSec)),
      pacingProfile: rawCollect.pacingProfile === 'conservative' || rawCollect.pacingProfile === 'efficient' ? rawCollect.pacingProfile : 'balanced',
      saveDebugFiles: rawCollect.saveDebugFiles === true,
      headless: rawCollect.headless === true,
      maxTargetMinutes: Math.max(1, Number(rawCollect.maxTargetMinutes ?? base.collect.maxTargetMinutes ?? 30)),
      randomizeTargets: rawCollect.randomizeTargets !== false,
      commentFetchMaxSeconds: Math.max(0, Number(rawCollect.commentFetchMaxSeconds ?? base.collect.commentFetchMaxSeconds ?? 0)),
      postCooldownMinSec: Math.max(0, Number(rawCollect.postCooldownMinSec ?? base.collect.postCooldownMinSec ?? 0)),
      postCooldownMaxSec: Math.max(
        Math.max(0, Number(rawCollect.postCooldownMinSec ?? base.collect.postCooldownMinSec ?? 0)),
        Number(rawCollect.postCooldownMaxSec ?? base.collect.postCooldownMaxSec ?? 0)
      ),
      accountCooldownMinSec: Math.max(0, Number(rawCollect.accountCooldownMinSec ?? base.collect.accountCooldownMinSec ?? 0)),
      accountCooldownMaxSec: Math.max(
        Math.max(0, Number(rawCollect.accountCooldownMinSec ?? base.collect.accountCooldownMinSec ?? 0)),
        Number(rawCollect.accountCooldownMaxSec ?? base.collect.accountCooldownMaxSec ?? 0)
      ),
      commentPagePauseMinSec: Math.max(0, Number((rawCollect as any).commentPagePauseMinSec ?? (rawCollect as any).commentPageIntervalMinSec ?? base.collect.commentPagePauseMinSec ?? 1)),
      commentPagePauseMaxSec: Math.max(
        Math.max(0, Number((rawCollect as any).commentPagePauseMinSec ?? (rawCollect as any).commentPageIntervalMinSec ?? base.collect.commentPagePauseMinSec ?? 1)),
        Number((rawCollect as any).commentPagePauseMaxSec ?? (rawCollect as any).commentPageIntervalMaxSec ?? base.collect.commentPagePauseMaxSec ?? 2.2)
      ),
      maxPostDurationSeconds: Math.max(0, Number((rawCollect as any).maxPostDurationSeconds ?? (rawCollect as any).maxPostDurationSec ?? base.collect.maxPostDurationSeconds ?? 0))
    }
  };
}


function normalizeInterceptTargets(value: unknown, labelPrefix: string): InterceptTargetEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const url = item.trim();
        return url ? { url, accountName: `${labelPrefix}${index + 1}`, label: `${labelPrefix}${index + 1}`, enabled: true } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const rawItem = item as Partial<InterceptTargetEntry> & { name?: string; link?: string; homepageUrl?: string; contentUrl?: string };
      const url = String(rawItem.url ?? rawItem.link ?? rawItem.homepageUrl ?? rawItem.contentUrl ?? '').trim();
      if (!url) return null;
      const accountName = String(rawItem.accountName ?? rawItem.label ?? rawItem.name ?? '').trim();
      return {
        url,
        accountName,
        label: accountName || `${labelPrefix}${index + 1}`,
        enabled: rawItem.enabled !== false
      };
    })
    .filter((item): item is InterceptTargetEntry => Boolean(item));
}

function cloneRuntimePolicyPlain(source?: RuntimePolicy): RuntimePolicy {
  return JSON.parse(JSON.stringify(source ?? ROBOT_DEFAULT_FORM.runtimePolicy)) as RuntimePolicy;
}

function runtimePolicySecondsToMinutes(policy: RuntimePolicy): RuntimePolicy {
  const next = cloneRuntimePolicyPlain(policy);
  next.dmPolicy.denseWindows = next.dmPolicy.denseWindows.map(windowSecondsToMinutes);
  next.dmPolicy.normalWindows = next.dmPolicy.normalWindows.map(windowSecondsToMinutes);
  next.dmPolicy.pollIntervalMinSec = secondsToMinutes(next.dmPolicy.pollIntervalMinSec);
  next.dmPolicy.pollIntervalMaxSec = secondsToMinutes(next.dmPolicy.pollIntervalMaxSec);
  next.dmPolicy.shortIdleMinSec = secondsToMinutes(next.dmPolicy.shortIdleMinSec);
  next.dmPolicy.shortIdleMaxSec = secondsToMinutes(next.dmPolicy.shortIdleMaxSec);
  next.dmPolicy.longIdleMinSec = secondsToMinutes(next.dmPolicy.longIdleMinSec);
  next.dmPolicy.longIdleMaxSec = secondsToMinutes(next.dmPolicy.longIdleMaxSec);
  next.dmPolicy.messageAggregateWaitSec = secondsToMinutes(next.dmPolicy.messageAggregateWaitSec);
  next.dmPolicy.afterReplyCooldownMinSec = secondsToMinutes(next.dmPolicy.afterReplyCooldownMinSec);
  next.dmPolicy.afterReplyCooldownMaxSec = secondsToMinutes(next.dmPolicy.afterReplyCooldownMaxSec);
  next.dmPolicy.errorCooldownMinSec = secondsToMinutes(next.dmPolicy.errorCooldownMinSec);
  next.dmPolicy.errorCooldownMaxSec = secondsToMinutes(next.dmPolicy.errorCooldownMaxSec);
  next.commentPolicy.workWindows = next.commentPolicy.workWindows.map(windowSecondsToMinutes);
  next.commentPolicy.workCooldownMinSec = secondsToMinutes(next.commentPolicy.workCooldownMinSec);
  next.commentPolicy.workCooldownMaxSec = secondsToMinutes(next.commentPolicy.workCooldownMaxSec);
  next.commentPolicy.afterReplyCooldownMinSec = secondsToMinutes(next.commentPolicy.afterReplyCooldownMinSec);
  next.commentPolicy.afterReplyCooldownMaxSec = secondsToMinutes(next.commentPolicy.afterReplyCooldownMaxSec);
  next.commentPolicy.noCandidateCooldownMinSec = secondsToMinutes(next.commentPolicy.noCandidateCooldownMinSec);
  next.commentPolicy.noCandidateCooldownMaxSec = secondsToMinutes(next.commentPolicy.noCandidateCooldownMaxSec);
  next.commentPolicy.roundCompletedCooldownMinSec = secondsToMinutes(next.commentPolicy.roundCompletedCooldownMinSec);
  next.commentPolicy.roundCompletedCooldownMaxSec = secondsToMinutes(next.commentPolicy.roundCompletedCooldownMaxSec);
  next.commentPolicy.multiEmptyRoundCooldownMinSec = secondsToMinutes(next.commentPolicy.multiEmptyRoundCooldownMinSec);
  next.commentPolicy.multiEmptyRoundCooldownMaxSec = secondsToMinutes(next.commentPolicy.multiEmptyRoundCooldownMaxSec);
  next.commentPolicy.errorCooldownMinSec = secondsToMinutes(next.commentPolicy.errorCooldownMinSec);
  next.commentPolicy.errorCooldownMaxSec = secondsToMinutes(next.commentPolicy.errorCooldownMaxSec);
  return next;
}

function runtimePolicyMinutesToSeconds(policy: RuntimePolicy): RuntimePolicy {
  const next = cloneRuntimePolicyPlain(policy);
  next.dmPolicy.denseWindows = next.dmPolicy.denseWindows.map(windowMinutesToSeconds);
  next.dmPolicy.normalWindows = next.dmPolicy.normalWindows.map(windowMinutesToSeconds);
  next.dmPolicy.pollIntervalMinSec = minutesToSeconds(next.dmPolicy.pollIntervalMinSec);
  next.dmPolicy.pollIntervalMaxSec = minutesToSeconds(next.dmPolicy.pollIntervalMaxSec);
  next.dmPolicy.shortIdleMinSec = minutesToSeconds(next.dmPolicy.shortIdleMinSec);
  next.dmPolicy.shortIdleMaxSec = minutesToSeconds(next.dmPolicy.shortIdleMaxSec);
  next.dmPolicy.longIdleMinSec = minutesToSeconds(next.dmPolicy.longIdleMinSec);
  next.dmPolicy.longIdleMaxSec = minutesToSeconds(next.dmPolicy.longIdleMaxSec);
  next.dmPolicy.messageAggregateWaitSec = minutesToSeconds(next.dmPolicy.messageAggregateWaitSec);
  next.dmPolicy.afterReplyCooldownMinSec = minutesToSeconds(next.dmPolicy.afterReplyCooldownMinSec);
  next.dmPolicy.afterReplyCooldownMaxSec = minutesToSeconds(next.dmPolicy.afterReplyCooldownMaxSec);
  next.dmPolicy.errorCooldownMinSec = minutesToSeconds(next.dmPolicy.errorCooldownMinSec);
  next.dmPolicy.errorCooldownMaxSec = minutesToSeconds(next.dmPolicy.errorCooldownMaxSec);
  next.commentPolicy.workWindows = next.commentPolicy.workWindows.map(windowMinutesToSeconds);
  next.commentPolicy.workCooldownMinSec = minutesToSeconds(next.commentPolicy.workCooldownMinSec);
  next.commentPolicy.workCooldownMaxSec = minutesToSeconds(next.commentPolicy.workCooldownMaxSec);
  next.commentPolicy.afterReplyCooldownMinSec = minutesToSeconds(next.commentPolicy.afterReplyCooldownMinSec);
  next.commentPolicy.afterReplyCooldownMaxSec = minutesToSeconds(next.commentPolicy.afterReplyCooldownMaxSec);
  next.commentPolicy.noCandidateCooldownMinSec = minutesToSeconds(next.commentPolicy.noCandidateCooldownMinSec);
  next.commentPolicy.noCandidateCooldownMaxSec = minutesToSeconds(next.commentPolicy.noCandidateCooldownMaxSec);
  next.commentPolicy.roundCompletedCooldownMinSec = minutesToSeconds(next.commentPolicy.roundCompletedCooldownMinSec);
  next.commentPolicy.roundCompletedCooldownMaxSec = minutesToSeconds(next.commentPolicy.roundCompletedCooldownMaxSec);
  next.commentPolicy.multiEmptyRoundCooldownMinSec = minutesToSeconds(next.commentPolicy.multiEmptyRoundCooldownMinSec);
  next.commentPolicy.multiEmptyRoundCooldownMaxSec = minutesToSeconds(next.commentPolicy.multiEmptyRoundCooldownMaxSec);
  next.commentPolicy.errorCooldownMinSec = minutesToSeconds(next.commentPolicy.errorCooldownMinSec);
  next.commentPolicy.errorCooldownMaxSec = minutesToSeconds(next.commentPolicy.errorCooldownMaxSec);
  return cloneRuntimePolicy(next);
}

function windowSecondsToMinutes(window: RuntimeWindow): RuntimeWindow {
  return {
    ...window,
    intervalMinSec: secondsToMinutes(window.intervalMinSec),
    intervalMaxSec: secondsToMinutes(window.intervalMaxSec)
  };
}

function windowMinutesToSeconds(window: RuntimeWindow): RuntimeWindow {
  return {
    ...window,
    intervalMinSec: minutesToSeconds(window.intervalMinSec),
    intervalMaxSec: minutesToSeconds(window.intervalMaxSec)
  };
}

function secondsToMinutes(value: number) {
  const minutes = Number(value || 0) / 60;
  return Number.isInteger(minutes) ? minutes : Number(minutes.toFixed(2));
}

function minutesToSeconds(value: number) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 60)) : 0;
}
</script>


<style>
.robot-form-dialog .sample-fill-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  border: 1px dashed var(--el-color-primary-light-5);
  border-radius: 10px;
  background: var(--el-color-primary-light-9);
  padding: 12px 14px;
}

.robot-form-dialog .sample-fill-bar strong,
.robot-form-dialog .sample-fill-bar span { display: block; }

.robot-form-dialog .sample-fill-bar span {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.robot-form-dialog .el-dialog__body {
  max-height: calc(100vh - 132px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 18px;
}

.robot-form-dialog .robot-form,
.robot-form-dialog .el-form-item,
.robot-form-dialog .el-form-item__content {
  min-width: 0;
}

.robot-form-dialog .el-form-item {
  align-items: flex-start;
}

.robot-form-dialog .el-input-number,
.robot-form-dialog .el-date-editor,
.robot-form-dialog .el-select {
  min-width: 0;
  width: 100%;
}

.robot-form-dialog .runtime-policy-collapse .el-collapse-item__content {
  overflow: hidden;
}

.robot-form-dialog .runtime-policy-collapse .el-form-item {
  display: block;
}

.robot-form-dialog .runtime-policy-collapse .el-form-item__label {
  justify-content: flex-start;
  width: auto !important;
  height: auto;
  margin-bottom: 6px;
  line-height: 20px;
  text-align: left;
}

.robot-form-dialog .runtime-policy-collapse .el-form-item__content {
  display: block;
  width: 100%;
}

.robot-form-dialog .runtime-window-grid {
  align-items: flex-start;
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(280px, 1.45fr) !important;
  column-gap: 16px;
}

.robot-form-dialog .responsive-number-pair {
  display: flex;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.robot-form-dialog .responsive-number-pair .el-input-number {
  flex: 1 1 0;
  min-width: 112px;
}

.robot-form-dialog .responsive-number-pair .el-input-number .el-input__wrapper {
  padding-inline: 26px;
}

@media (max-width: 1439px) {
  .robot-form-dialog .runtime-window-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 1023px) {
  .robot-form-dialog {
    width: calc(100vw - 20px) !important;
  }

  .robot-form-dialog .el-dialog__body {
    max-height: calc(100vh - 118px);
    padding: 12px 16px 16px;
  }

  .robot-form-dialog .el-form-item {
    display: block;
  }

  .robot-form-dialog .el-form-item__label {
    justify-content: flex-start;
    width: auto !important;
    height: auto;
    margin-bottom: 6px;
    line-height: 20px;
  }

  .robot-form-dialog .runtime-window-grid {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}

@media (max-width: 767px) {
  .robot-form-dialog .sample-fill-bar { align-items: flex-start; flex-direction: column; }
  .robot-form-dialog .responsive-number-pair {
    flex-direction: column;
  }
}
.robot-form-dialog .intercept-target-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.robot-form-dialog .intercept-target-tag {
  max-width: 100%;
  cursor: pointer;
  border-radius: 999px;
  padding-inline: 12px;
}

.robot-form-dialog .intercept-target-tag .el-tag__content {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.intercept-target-edit-dialog .el-dialog__body {
  max-height: min(70vh, 720px);
  overflow-y: auto;
}

.intercept-config-drawer .el-drawer__body {
  padding-bottom: 24px;
}

.intercept-config-drawer .el-form-item,
.intercept-config-drawer .el-form-item__content {
  min-width: 0;
}

.intercept-config-drawer .el-form-item {
  display: block;
}

.intercept-config-drawer .el-form-item__label {
  justify-content: flex-start;
  width: auto !important;
  height: auto;
  margin-bottom: 6px;
  line-height: 20px;
  text-align: left;
}

.intercept-config-drawer .el-form-item__content {
  display: block;
  width: 100%;
}

.intercept-config-drawer .el-input-number,
.intercept-config-drawer .el-date-editor,
.intercept-config-drawer .el-select {
  min-width: 0;
  width: 100%;
}

.intercept-config-drawer .intercept-config-collapse .el-collapse-item__content {
  overflow: hidden;
}

</style>
