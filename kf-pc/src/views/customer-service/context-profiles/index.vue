<template>
  <div class="space-y-4 context-page">
    <PageToolbar
      v-if="!props.embedded"
      :title="pageTitle"
      :description="pageDescription"
    >
      <template #actions>
        <el-button v-if="canCreate && activeTab === 'profiles'" @click="openProfileImport">导入账号背景</el-button>
        <el-button v-if="canCreate && activeTab === 'profiles'" type="primary" @click="openProfile()">新增账号资料</el-button>
        <el-button v-if="canCreate && activeTab === 'policies'" type="primary" @click="openPolicy()">新增表达限制</el-button>
      </template>
    </PageToolbar>
    <div v-else-if="props.viewMode === 'policies'" class="embedded-policy-actions">
      <div><strong>表达限制</strong><span>只处理明确不能出现、必须替换或需要固定处理的表达。</span></div>
      <el-button v-if="canCreate" type="primary" @click="openPolicy()">新增表达限制</el-button>
    </div>

    <section v-if="!props.embedded && props.viewMode === 'all'" class="usage-guide">
      <div class="guide-heading">
        <div><strong>使用方法很简单</strong><p>先维护账号资料，再按需补充业务知识；表达限制属于可选的高级功能。</p></div>
        <HelpTip title="一份账号资料包含什么" content="包含店铺/品牌事实、账号身份与人设、绑定角色、行业和渠道。机器人只需选择一次，不需要再分别选择店铺背景和账号人设。" />
      </div>
      <div class="guide-steps">
        <div><span>1</span><p><b>新增账号资料</b><small>一次填完店铺事实和账号人设</small></p></div>
        <div><span>2</span><p><b>机器人选择资料</b><small>自动带上整份背景，不用重复选择</small></p></div>
        <div><span>3</span><p><b>补充业务知识</b><small>FAQ、商品、政策和活动说明</small></p></div>
        <div><span>4</span><p><b>按需添加表达限制</b><small>例如禁用词、结尾不用句号</small></p></div>
      </div>
    </section>

    <section v-else-if="!props.embedded && props.viewMode === 'profiles'" class="usage-guide simple-guide">
      <div class="guide-heading">
        <div><strong>一份配置，决定客服是谁、服务什么业务</strong><p>普通运营只需要维护名称、渠道、主营业务、品牌介绍和对外身份；其余设置沿用安全默认值。</p></div>
        <el-button text type="primary" @click="showAdvancedEditor = !showAdvancedEditor">{{ showAdvancedEditor ? '收起高级设置' : '需要更细设置？' }}</el-button>
      </div>
    </section>
    <section v-else-if="!props.embedded && props.viewMode === 'knowledge'" class="usage-guide simple-guide">
      <div class="guide-heading">
        <div><strong>这里只维护可以被回复引用的事实</strong><p>商品、活动、售后政策和常见问答放在这里；客服身份和说话风格请到“账号配置”。</p></div>
      </div>
    </section>

    <el-tabs v-model="activeTab" :class="['friendly-tabs', { 'single-mode-tabs': props.viewMode !== 'all' }]" @tab-change="loadActive">
      <el-tab-pane v-if="props.viewMode === 'all' || props.viewMode === 'profiles'" label="账号资料" name="profiles">
        <div class="tab-description">
          <div><strong>每一条就是机器人可直接选择的一份完整资料</strong><p>“已启用”才会出现在机器人选择框中；草稿可继续修改，但不会进入实际回复。</p></div>
          <HelpTip title="为什么现在只有一个列表" content="底层仍会分别保存稳定的店铺事实和账号人设，保证数据边界清晰；页面已把它们组合成一次操作，使用者不需要理解或分别维护这两层。" />
        </div>
        <div class="panel-toolbar" :class="{ 'profile-import-toolbar': canCreate && props.embedded }">
          <el-input v-model="keyword" clearable placeholder="搜索账号资料名称" @keyup.enter="loadProfiles" />
          <el-select v-model="status" clearable placeholder="全部状态"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select>
          <el-button @click="loadProfiles">查询</el-button>
          <el-button v-if="canCreate && props.embedded" type="primary" plain @click="openProfileImport">导入账号背景</el-button>
        </div>

        <el-skeleton v-if="loading" :rows="5" animated />
        <el-empty v-else-if="!accounts.length" description="还没有账号资料。新增后，机器人就可以直接选择使用。">
          <el-button v-if="canCreate" type="primary" @click="openProfile()">新增第一份账号资料</el-button>
        </el-empty>
        <div v-else class="profile-grid">
          <article v-for="row in accounts" :key="row.id" class="profile-card">
            <header>
              <div class="profile-title"><strong>{{ row.name }}</strong><el-tag :type="statusType(row.status)" size="small">{{ statusName(row.status) }}</el-tag></div>
              <el-button link type="primary" @click="openProfile(row)">编辑</el-button>
            </header>
            <div class="profile-meta">
              <span>{{ channelName(row.channel) }}</span>
              <span>{{ row.merchantRole?.name || '未绑定角色' }}</span>
              <span>{{ row.industryNode?.name || '全行业' }}</span>
            </div>
            <div class="profile-section">
              <label>店铺与业务</label>
              <p>{{ storeSummary(row.storeProfileId) }}</p>
            </div>
            <div class="profile-section">
              <label>账号身份与说话方式</label>
              <p>{{ profileSummary(row.profile) }}</p>
            </div>
            <footer><span>机器人选择项：{{ row.name }}</span><HelpTip title="机器人如何使用" content="机器人只选择当前账号资料。运行时会自动加载这里关联的店铺事实、账号身份、所选角色、行业和渠道，不需要再选择一次店铺背景。" /></footer>
          </article>
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="props.viewMode === 'all' || props.viewMode === 'knowledge'" label="业务知识" name="knowledge">
        <BusinessKnowledgePanel :accounts="accounts" :stores="stores" :roles="roles" :can-create="canCreate" :can-update="canUpdate" />
      </el-tab-pane>

      <el-tab-pane v-if="props.viewMode === 'all'" label="校准沉淀" name="calibrations">
        <CalibrationKnowledgePanel
          :accounts="accounts"
          :stores="stores"
          :can-read="canCalibrationRead"
          :can-update="canCalibrationUpdate"
          :can-publish="canKnowledgePublish"
        />
      </el-tab-pane>

      <el-tab-pane v-if="props.viewMode === 'all'" label="效果观察" name="effects">
        <EffectObservationPanel
          :accounts="accounts"
          :can-read="canCalibrationRead"
          :can-rollback="canAssetPublish"
          :can-update-knowledge="canUpdate"
          @open-knowledge="activeTab = 'knowledge'"
        />
      </el-tab-pane>

      <el-tab-pane v-if="props.viewMode === 'all' || props.viewMode === 'policies'" label="表达限制（高级）" name="policies">
        <div class="tab-description">
          <div><strong>用于处理明确不能出现的词、符号或固定表达</strong><p>普通语气、自然长短、回复节奏和参与方式优先由“角色配置 → 角色生成 Prompt”决定；只有确定性限制才放在这里。</p></div>
          <HelpTip title="表达限制和生成 Prompt 有什么区别" content="表达限制是确定性边界，例如禁用某个明确词或固定替换；普通语气、自然长短、提问方式和销售姿态由角色/身份 Prompt 交给成熟模型生成。" />
        </div>
        <div class="panel-toolbar policy-toolbar">
          <el-input v-model="keyword" clearable placeholder="搜索限制名称" @keyup.enter="loadPolicies" />
          <el-select v-model="status" clearable placeholder="全部状态"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select>
          <el-button @click="loadPolicies">查询</el-button>
          <el-button v-if="canCreate" @click="openPeriodTemplate">一键添加“结尾不用句号”</el-button>
        </div>
        <el-table v-loading="loading" :data="policies" row-key="id">
          <el-table-column prop="name" label="限制名称" min-width="190" />
          <el-table-column label="对谁生效" min-width="190"><template #default="{ row }">{{ scopeName(row.scopeType) }} · {{ scopeDisplay(row) }}</template></el-table-column>
          <el-table-column label="限制内容" min-width="320"><template #default="{ row }"><el-tag v-for="rule in row.rules.slice(0, 4)" :key="rule.id" class="mr-1 mb-1" effect="plain">{{ ruleName(rule.type) }}：{{ rule.pattern }}</el-tag><span v-if="row.rules.length > 4">+{{ row.rules.length - 4 }}</span></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusName(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openPolicy(row)">编辑</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="profileDialog" :title="profileForm.id ? '编辑账号资料' : '新增账号资料'" width="min(940px, 96vw)" destroy-on-close>
      <el-alert title="在这里一次填完整份资料。带“选填”的内容可以以后补充；保存为“已启用”后，机器人才能选择使用。" type="success" :closable="false" show-icon class="mb-4" />
      <div class="sample-fill-bar">
        <div><strong>{{ profileForm.id ? '重填当前账号身份？' : '不知道怎么填？' }}</strong><span>具体专业身份和当前账号使用的角色都在这里设置。新账号默认使用系统推荐角色；选择样例只填充身份/店铺示例和自然默认偏好，不改业务知识、权限、意图流程和显式语言限制，也不会自动保存。</span></div>
        <el-dropdown trigger="click" @command="fillProfileSample">
          <el-button type="primary" plain>{{ profileForm.id ? '重填账号身份样例' : '选择账号身份样例' }}<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="preset in profileSamplePresets" :key="preset.key" :command="preset.key">
                <div class="profile-sample-option"><strong>{{ preset.label }}</strong><span>{{ preset.summary }}</span></div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <el-form label-position="top">
        <section class="form-section">
          <div class="form-section-title"><span>1</span><div><strong>这份资料给谁用</strong><p>先确定账号名称、渠道和使用角色。新账号默认使用系统推荐角色，也可以按账号选择其他已启用角色。</p></div><HelpTip title="账号资料名称" content="这是机器人配置时看到的选择项，建议使用“平台 + 账号/店铺”的方式命名。" example="抖音 · 阿梨女装旗舰店" /></div>
          <div class="form-grid">
            <el-form-item label="资料名称（必填）"><el-input v-model="profileForm.name" placeholder="例如：抖音 · 阿梨女装旗舰店" /></el-form-item>
            <el-form-item label="使用渠道（必填）"><el-select v-model="profileForm.channel" class="w-full"><el-option v-for="item in channelOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="使用角色（必填）"><el-select v-model="profileForm.merchantRoleId" filterable class="w-full" placeholder="选择当前账号使用的角色"><el-option v-for="item in enabledRoles" :key="item.id" :label="`${item.name}${item.code === 'ali' ? '（系统推荐）' : ''}`" :value="item.id" /></el-select><div class="form-help">角色提供默认生成 Prompt 和稳定共性；下方账号身份只补充这个账号自己的差异。普通情况直接使用系统推荐角色即可。</div></el-form-item>
            <el-form-item label="所属店铺 / 业务主体"><el-select v-model="profileForm.storeId" clearable filterable class="w-full" placeholder="不选则新建店铺 / 业务主体" @change="onProfileStoreChange"><el-option v-for="item in enabledStores" :key="item.id" :label="item.name" :value="item.id" /></el-select><div class="form-help">同一家店的抖音、微信、小红书等账号请选择同一个店铺。保存后会自动继承该店铺知识，不需要再去知识库重复关联。</div></el-form-item>
            <el-form-item v-if="showAdvancedEditor" label="所属行业（选填）"><el-select v-model="profileForm.industryNodeId" clearable filterable class="w-full"><el-option v-for="item in enabledIndustries" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
            <el-form-item v-if="showAdvancedEditor" label="状态"><el-select v-model="profileForm.status" class="w-full"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select><div class="form-help">想让机器人立即可选，请选择“已启用”。</div></el-form-item>
          </div>
          <el-alert v-if="!enabledRoles.length" type="error" :closable="false" show-icon title="暂无可用角色" description="请先到“角色配置”创建或启用一个角色。系统初始化后会自动提供推荐默认角色。" />
          <el-alert v-else type="info" :closable="false" show-icon title="关系保存后自动生效" description="当前账号会自动继承：所属店铺知识 + 使用角色知识 + 当前账号专属知识。正常使用不需要额外执行“绑定/修复”步骤。" />
        </section>

        <section class="form-section">
          <div class="form-section-title"><span>2</span><div><strong>店铺与业务事实</strong><p>告诉系统这家店做什么、服务谁，以及哪些承诺不能随便做。</p></div><HelpTip title="业务事实为什么重要" content="这些内容是回复时可引用的事实依据。没有写明的价格、活动、库存或承诺，模型不应该自行编造。" /></div>
          <div class="form-grid">
            <el-form-item label="主营业务（必填）"><el-input v-model="storeProfile.mainBusiness" placeholder="例如：通勤女装与基础配饰" /></el-form-item>
            <el-form-item v-if="showAdvancedEditor" label="目标客户（选填）"><el-input v-model="storeProfile.targetCustomers" placeholder="例如：20～35 岁上班族女性" /></el-form-item>
          </div>
          <el-form-item label="店铺/品牌介绍（必填）"><el-input v-model="storeProfile.brandIntro" type="textarea" :rows="3" placeholder="用几句话说明店铺定位、优势和主要商品" /></el-form-item>
          <div v-if="showAdvancedEditor" class="form-grid">
            <el-form-item label="业务规则（选填）"><el-input v-model="storeProfile.businessRules" type="textarea" :rows="3" placeholder="例如：优惠以页面实时活动为准" /></el-form-item>
            <el-form-item label="不能承诺的事情（选填）"><el-input v-model="storeProfile.permissionBoundaries" type="textarea" :rows="3" placeholder="例如：不能承诺指定日期一定到货" /></el-form-item>
            <el-form-item label="时效说明（选填）"><el-input v-model="storeProfile.validityNotes" type="textarea" :rows="3" placeholder="例如：活动信息需以当天页面为准" /></el-form-item>
            <el-form-item label="品牌整体感觉（选填）"><el-input v-model="storeProfile.brandTone" type="textarea" :rows="3" placeholder="例如：自然、真诚，不夸张营销" /></el-form-item>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-title"><span>3</span><div><strong>账号身份与人设</strong><p>决定这个具体账号以什么专业身份、关系和口吻与客户说话；默认继承所选角色的生成 Prompt。</p></div><HelpTip title="账号身份与角色 Prompt 的分工" content="所选角色提供稳定共性和默认生成 Prompt；这里负责当前账号的专业身份、关系和表达差异。大多数账号不需要单独写 Prompt，只有确实要覆盖角色默认时才开启身份 Prompt。" /></div>
          <div class="form-grid">
            <el-form-item label="对外身份（必填）"><el-input v-model="accountProfile.publicIdentity" placeholder="例如：店铺穿搭顾问" /></el-form-item>
            <template v-if="showAdvancedEditor">
              <el-form-item label="与客户的关系（选填）"><el-input v-model="accountProfile.relationship" placeholder="例如：熟悉但不过度亲昵的长期顾问" /></el-form-item>
              <el-form-item label="说话方式（选填）"><el-input v-model="accountProfile.voice" type="textarea" :rows="3" placeholder="例如：先直接回答，再补充一个实用建议" /></el-form-item>
              <el-form-item label="亲近度与语气（选填）"><el-input v-model="accountProfile.tone" type="textarea" :rows="3" placeholder="例如：自然温和，不使用“亲亲”等套话" /></el-form-item>
              <el-form-item label="账号补充背景（选填）"><el-input v-model="accountProfile.background" type="textarea" :rows="3" placeholder="这个账号特有的定位、内容方向或关系背景" /></el-form-item>
              <el-form-item label="这个账号能做和不能做什么（选填）"><el-input v-model="accountProfile.permissions" type="textarea" :rows="3" placeholder="例如：可推荐尺码方向，但不能保证绝对合身" /></el-form-item>
            </template>
            <el-form-item label="当前角色默认 Prompt">
              <el-input :model-value="selectedRole?.generationPrompt || '使用系统推荐默认生成方式'" type="textarea" :rows="5" disabled />
              <div class="form-help">这是当前账号自动继承的角色级生成方式。普通账号直接使用即可；需要调整角色共性时统一到“角色配置 → 角色生成 Prompt”修改，不要在每个账号重复复制。</div>
            </el-form-item>
            <el-form-item label="身份 Prompt 覆盖（可选）">
              <div class="w-full space-y-2">
                <el-switch v-model="identityPromptOverrideEnabled" active-text="当前账号使用额外 Prompt" inactive-text="继承角色默认（推荐）" @change="onIdentityPromptOverrideChange" />
                <el-input v-if="identityPromptOverrideEnabled" v-model="accountProfile.generationPrompt" type="textarea" :rows="7" maxlength="12000" show-word-limit placeholder="只写当前身份相对角色默认值真正不同的生成/参与方式。不要复制整份角色 Prompt，不写价格、库存、权限、真实执行结果，也不定义输出协议。" />
                <div class="form-help">默认关闭。只有当前身份确实需要不同的参与方式或表达习惯时才开启；为空时完全继承角色默认。</div>
              </div>
            </el-form-item>
          </div>
        </section>

        <template v-if="showAdvancedEditor">
        <section class="form-section">
          <div class="form-section-title"><span>4</span><div><strong>首次接待方式</strong><p>控制新会话只发“你好、在吗、hello”等问候时，账号怎样自然回应并体现自身身份。</p></div><HelpTip title="为什么单独配置首次接待" content="账号资料决定“我是谁”，首次接待决定“客户刚进来只打招呼时怎么回应”。商业账号默认不会进入“今天过得怎么样”等泛陪聊。" /></div>
          <div class="form-grid">
            <el-form-item label="接待类型"><el-select v-model="accountProfile.receptionType" class="w-full"><el-option v-for="item in receptionTypeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="问候处理方式"><el-select v-model="accountProfile.greetingMode" class="w-full"><el-option v-for="item in greetingModeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="业务身份显露程度"><el-select v-model="accountProfile.businessVisibility" class="w-full"><el-option v-for="item in businessVisibilityOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            <el-form-item label="最多提问数"><el-input-number v-model="accountProfile.openingMaxQuestions" :min="0" :max="1" class="w-full" /></el-form-item>
            <el-form-item label="首次回复建议字数"><el-input-number v-model="accountProfile.openingMaxChars" :min="12" :max="120" class="w-full" /></el-form-item>
            <el-form-item label="允许首轮进入泛闲聊"><div class="switch-field"><el-switch v-model="accountProfile.allowCasualChatOnOpening" /><span>商业店铺通常关闭；内容或陪伴账号可开启。</span></div></el-form-item>
          </div>
          <el-form-item label="可轻量说明的服务范围"><el-input v-model="accountProfile.greetingServiceScope" type="textarea" :rows="2" placeholder="例如：可帮助查看通勤款式、搭配和尺码方向。不要填写实时库存、价格或无法保证的承诺。" /></el-form-item>
          <el-form-item label="补充接待要求（选填）"><el-input v-model="accountProfile.customGreetingGuidance" type="textarea" :rows="2" placeholder="例如：先回应“在的”，再自然问客户想看款式还是搭配；不要一上来推具体商品。" /></el-form-item>
          <el-alert type="info" :closable="false" show-icon title="首次接待不是固定话术" description="系统先识别首轮纯问候，再结合当前账号身份和服务范围生成自然回复；不会要求客户文字与某条知识 100% 一致。" />
        </section>

        <section class="form-section">
          <div class="form-section-title"><span>5</span><div><strong>客户意图与流程应用</strong><p>店铺可维护默认流程，账号可以继承或覆盖；具体识别条件和处理步骤仍在“客户意图与流程”中编辑。</p></div><HelpTip title="如何匹配客户意图" content="不是要求客户文字 100% 一致。系统会结合当前消息、多轮上下文、识别样本、场景和正式意图定义进行判断，再加载当前店铺/账号允许使用的流程。" /></div>
          <div class="sub-config-card">
            <div class="config-heading"><div><strong>店铺默认</strong><p>同一家店铺下的账号默认继承这里的流程范围。</p></div><el-button link type="primary" @click="openIntentFlowManagement">维护详细意图流程</el-button></div>
            <div class="form-grid">
              <el-form-item label="流程应用方式"><el-select v-model="storeProfile.intentFlowMode" class="w-full"><el-option v-for="item in intentFlowModeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
              <el-form-item v-if="storeProfile.intentFlowMode !== 'AUTO'" :label="intentSelectionLabel(storeProfile.intentFlowMode)"><el-select v-model="storeProfile.intentFlowKeys" multiple filterable collapse-tags collapse-tags-tooltip class="w-full"><el-option v-for="item in intentOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            </div>
          </div>
          <div class="sub-config-card">
            <div class="config-heading"><div><strong>当前账号</strong><p>默认继承店铺；只有平台或账号规则不同时才单独覆盖。</p></div><el-switch v-model="accountProfile.inheritStoreIntentFlow" active-text="继承店铺默认" /></div>
            <div v-if="!accountProfile.inheritStoreIntentFlow" class="form-grid">
              <el-form-item label="流程应用方式"><el-select v-model="accountProfile.intentFlowMode" class="w-full"><el-option v-for="item in intentFlowModeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
              <el-form-item v-if="accountProfile.intentFlowMode !== 'AUTO'" :label="intentSelectionLabel(accountProfile.intentFlowMode)"><el-select v-model="accountProfile.intentFlowKeys" multiple filterable collapse-tags collapse-tags-tooltip class="w-full"><el-option v-for="item in intentOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
            </div>
          </div>
          <el-alert type="info" :closable="false" show-icon title="流程负责决定怎么处理，业务知识负责提供真实事实" description="例如“物流慢先安抚并催物流”属于流程；实际物流节点、发货时效属于业务知识或订单数据。" />
        </section>

        <section class="form-section">
          <div class="form-section-title"><span>6</span><div><strong>回复长度与发送方式</strong><p>这里配置的是表达与展示偏好，不是普通回复的发送资格；没有明确限制时，允许模型按当前身份和本轮内容自然决定长短与分段。</p></div><HelpTip title="配置优先级" content="店铺默认适用于同店铺账号；账号关闭继承后使用自己的设置。回复长度、分段和人感设置只表达运营偏好，不作为普通回复能否发送的硬门。" /></div>
          <div class="sub-config-card">
            <div class="config-heading"><div><strong>店铺默认</strong><p>默认使用“适中 + 自动判断 + 最多 4 条”，让模型按当前内容自然决定一条或少量分段。</p></div></div>
            <div class="form-grid">
              <el-form-item label="回复长度"><el-select v-model="storeProfile.replyLengthPreset" class="w-full"><el-option v-for="item in replyLengthPresetOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
              <el-form-item v-if="storeProfile.replyLengthPreset === 'CUSTOM'" label="最多句子数"><el-input-number v-model="storeProfile.replyMaxSentences" :min="1" :max="10" class="w-full" /></el-form-item>
              <el-form-item label="消息发送方式"><el-select v-model="storeProfile.deliveryMode" class="w-full"><el-option v-for="item in deliveryModeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
              <el-form-item label="最多消息数"><el-input-number v-model="storeProfile.maxSegments" :min="1" :max="6" class="w-full" /></el-form-item>
              <el-form-item v-if="storeProfile.replyLengthPreset === 'CUSTOM'" label="超过多少字尝试拆分"><el-input-number v-model="storeProfile.splitThresholdChars" :min="20" :max="500" class="w-full" /></el-form-item>
              <el-form-item label="段间延迟范围（毫秒）"><div class="delay-range"><el-input-number v-model="storeProfile.minDelayMs" :min="0" :max="10000" :step="100" /><span>至</span><el-input-number v-model="storeProfile.maxDelayMs" :min="0" :max="10000" :step="100" /></div></el-form-item>
              <el-form-item label="客户插话时取消后续消息"><div class="switch-field"><el-switch v-model="storeProfile.cancelRemainingOnCustomerMessage" /><span>建议开启，避免继续发送上一轮剩余内容。</span></div></el-form-item>
            </div>
          </div>
          <div class="sub-config-card">
            <div class="config-heading"><div><strong>当前账号</strong><p>例如某个平台更适合短回复时，可关闭继承并单独设置。</p></div><el-switch v-model="accountProfile.inheritStoreReplyExperience" active-text="继承店铺默认" /></div>
            <div v-if="!accountProfile.inheritStoreReplyExperience" class="form-grid">
              <el-form-item label="回复长度"><el-select v-model="accountProfile.replyLengthPreset" class="w-full"><el-option v-for="item in replyLengthPresetOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
              <el-form-item v-if="accountProfile.replyLengthPreset === 'CUSTOM'" label="最多句子数"><el-input-number v-model="accountProfile.replyMaxSentences" :min="1" :max="10" class="w-full" /></el-form-item>
              <el-form-item label="消息发送方式"><el-select v-model="accountProfile.deliveryMode" class="w-full"><el-option v-for="item in deliveryModeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
              <el-form-item label="最多消息数"><el-input-number v-model="accountProfile.maxSegments" :min="1" :max="6" class="w-full" /></el-form-item>
              <el-form-item v-if="accountProfile.replyLengthPreset === 'CUSTOM'" label="超过多少字尝试拆分"><el-input-number v-model="accountProfile.splitThresholdChars" :min="20" :max="500" class="w-full" /></el-form-item>
              <el-form-item label="段间延迟范围（毫秒）"><div class="delay-range"><el-input-number v-model="accountProfile.minDelayMs" :min="0" :max="10000" :step="100" /><span>至</span><el-input-number v-model="accountProfile.maxDelayMs" :min="0" :max="10000" :step="100" /></div></el-form-item>
              <el-form-item label="客户插话时取消后续消息"><div class="switch-field"><el-switch v-model="accountProfile.cancelRemainingOnCustomerMessage" /><span>建议开启。</span></div></el-form-item>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-title"><span>7</span><div><strong>多轮上下文与长期状态</strong><p>配置老客户承接、身份稳定、偏好复用和输入预算；这些配置用于帮助模型保持同一角色与真实上下文，不作为普通语言发送门。</p></div><HelpTip title="这些设置控制什么" content="这里控制运营层会话与人感偏好，例如短指代承接、老客户连续性和已确认偏好复用；业务权限、限制词和业务知识仍以 PC 的显式配置为准。" /></div>
          <div class="sub-config-card">
            <div class="config-heading"><div><strong>店铺默认</strong><p>同店铺账号默认继承这套多轮会话策略。</p></div></div>
            <ConversationStrategyConfig v-model="storeProfile.conversationStrategy" />
          </div>
          <div class="sub-config-card">
            <div class="config-heading"><div><strong>当前账号</strong><p>只有该平台/账号确实需要不同承接策略时再关闭继承。</p></div><el-switch v-model="accountProfile.inheritStoreConversationStrategy" active-text="继承店铺默认" /></div>
            <ConversationStrategyConfig v-if="!accountProfile.inheritStoreConversationStrategy" v-model="accountProfile.conversationStrategy" />
          </div>
          <el-alert type="info" :closable="false" show-icon title="安全边界不会被配置绕过" description="售后/投诉/安全类未完成事项、身份冲突、无依据推断、STALE/CONFLICTED State、canonical 幂等与权限检查仍由系统硬约束。" />
        </section>

        <el-collapse class="advanced-fields">
          <el-collapse-item title="高级信息（普通使用者不用填写）" name="advanced">
            <div class="form-grid">
              <el-form-item label="系统编码"><el-input v-model="profileForm.code" :disabled="Boolean(profileForm.id)" /><div class="form-help">系统自动生成，用于接口识别。</div></el-form-item>
              <el-form-item label="补充说明"><el-input v-model="profileForm.description" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="正反例"><el-input v-model="storeProfile.examples" type="textarea" :rows="3" placeholder="可以怎么说 / 不应该怎么说" /></el-form-item>
            </div>
          </el-collapse-item>
        </el-collapse>
        </template>
      </el-form>
      <template #footer><el-button @click="profileDialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveProfile">保存整份账号资料</el-button></template>
    </el-dialog>

    <el-dialog v-model="profileImportDialog" title="导入账号背景 / 身份资料" width="min(1080px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon class="mb-4" title="关联项在弹窗手动选择，背景内容从 Excel 导入" description="角色、行业、所属店铺属于关系配置，不写内部 ID 到模板。一次导入共用同一组关系；如果不同账号需要不同角色/行业，请按关系分批导入。" />
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="使用角色（必选）"><el-select v-model="profileImportForm.merchantRoleId" filterable class="w-full" placeholder="选择导入账号统一使用的角色"><el-option v-for="item in enabledRoles" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="所属行业（选填）"><el-select v-model="profileImportForm.industryNodeId" clearable filterable class="w-full" placeholder="可不选"><el-option v-for="item in enabledIndustries" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="店铺 / 业务主体处理">
            <el-radio-group v-model="profileImportForm.storeMode"><el-radio value="CREATE_PER_ROW">按 Excel 每行新建店铺背景</el-radio><el-radio value="LINK_EXISTING">统一关联已有店铺</el-radio></el-radio-group>
          </el-form-item>
          <el-form-item v-if="profileImportForm.storeMode === 'LINK_EXISTING'" label="关联已有店铺（必选）"><el-select v-model="profileImportForm.storeProfileId" filterable class="w-full" placeholder="选择已有店铺"><el-option v-for="item in enabledStores" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        </div>
        <el-alert v-if="profileImportForm.storeMode === 'LINK_EXISTING'" type="warning" :closable="false" class="mb-4" title="关联已有店铺时，不覆盖店铺事实" description="Excel 中的主营业务、品牌介绍等店铺字段将被忽略，只导入账号身份/背景；这样不会因为批量导入账号而意外覆盖现有店铺配置。" />
        <el-form-item label="Excel 文件">
          <div class="import-file-actions"><el-button @click="chooseProfileImportFile">选择 Excel</el-button><el-button link type="primary" @click="downloadProfileImportTemplate">下载导入模板</el-button><span>{{ profileImportFileName || '支持 .xlsx；一行创建一份账号资料' }}</span></div>
          <input ref="profileImportFileInput" class="hidden-file" type="file" accept=".xlsx" @change="handleProfileImportFile" />
        </el-form-item>
      </el-form>
      <el-alert v-if="profileImportRows.length" class="mb-3" type="success" :closable="false" :title="`已识别 ${profileImportRows.length} 份账号资料`" description="确认后逐条创建。PC 会沿用手工新建账号的安全默认运行时配置；模板只导入业务背景与身份差异，不批量覆盖高级 Runtime 开关。" />
      <el-table v-if="profileImportRows.length" :data="profileImportRows.slice(0,100)" max-height="380" border stripe>
        <el-table-column prop="rowNumber" label="Excel 行" width="90" /><el-table-column prop="name" label="资料名称" min-width="220" /><el-table-column prop="channel" label="渠道" width="120" /><el-table-column prop="mainBusiness" label="主营业务" min-width="220" show-overflow-tooltip /><el-table-column prop="publicIdentity" label="对外身份" min-width="180" show-overflow-tooltip /><el-table-column prop="status" label="状态" width="110" />
      </el-table>
      <template #footer><el-button @click="profileImportDialog=false">取消</el-button><el-button type="primary" :loading="profileImporting" :disabled="!profileImportRows.length" @click="confirmProfileImport">确认导入 {{ profileImportRows.length || '' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="policyDialog" :title="policyForm.id ? '编辑表达限制' : '新增表达限制'" width="min(1040px, 96vw)" destroy-on-close>
      <el-alert title="表达限制只用于明确禁止、替换或其他确定性边界。普通语气、长短、自然节奏和销售方式请在“角色配置 → 角色生成 Prompt”维护。" type="info" :closable="false" show-icon class="mb-4" />
      <div v-if="!policyForm.id" class="sample-fill-bar">
        <div><strong>先看一个可用例子</strong><span>回填“避免客服套话”样例，帮助理解限制类型和处理动作。</span></div>
        <SampleFillButton label="填入表达限制样例" :has-content="policyHasContent" @fill="fillPolicySample" />
      </div>
      <el-form label-position="top">
        <div class="policy-grid">
          <el-form-item label="限制名称"><el-input v-model="policyForm.name" placeholder="例如：聊天结尾不用句号" /></el-form-item>
          <el-form-item><template #label><span class="field-label">对谁生效 <HelpTip title="生效对象" content="“全部账号”适用于所有回复；也可以只限制某份账号资料、角色或渠道。范围越具体，影响越小。" /></span></template><el-select v-model="policyForm.scopeType" @change="policyForm.scopeKey = policyForm.scopeType === 'GLOBAL' ? '*' : ''"><el-option v-for="item in scopeOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
          <el-form-item label="具体对象"><el-select v-if="scopeCandidates.length" v-model="policyForm.scopeKey" filterable><el-option v-for="item in scopeCandidates" :key="item.value" v-bind="item" /></el-select><el-input v-else v-model="policyForm.scopeKey" :disabled="policyForm.scopeType === 'GLOBAL'" placeholder="输入对应场景或意图编码" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="policyForm.status"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        </div>
        <el-form-item label="希望保持的表达方向"><el-input v-model="policyStyle.guidance" type="textarea" :rows="2" placeholder="例如：像真实聊天一样自然收尾" /></el-form-item>
        <div class="flex items-center justify-between mb-2"><strong>具体限制</strong><el-button @click="addRule">添加一条</el-button></div>
        <div v-for="(rule, index) in policyRules" :key="rule.id" class="rule-row">
          <el-select v-model="rule.type"><el-option v-for="item in ruleTypeOptions" :key="item.value" v-bind="item" /></el-select>
          <el-input v-model="rule.pattern" placeholder="要限制的词、符号或表达" />
          <el-select v-model="rule.position"><el-option label="任何位置" value="ANYWHERE" /><el-option label="只在开头" value="START" /><el-option label="只在结尾" value="END" /></el-select>
          <el-select v-model="rule.action"><el-option v-for="item in actionOptions" :key="item.value" v-bind="item" /></el-select>
          <el-input v-if="rule.action === 'REPLACE'" v-model="rule.replacement" placeholder="替换为" />
          <el-switch v-model="rule.enabled" />
          <el-button link type="danger" @click="policyRules.splice(index, 1)">删除</el-button>
        </div>

        <el-collapse class="advanced-fields">
          <el-collapse-item title="高级信息（系统编码与覆盖顺序）" name="advanced">
            <div class="policy-grid">
              <el-form-item label="系统编码"><el-input v-model="policyForm.code" :disabled="Boolean(policyForm.id)" /></el-form-item>
              <el-form-item label="覆盖顺序"><el-input-number v-model="policyForm.priority" :min="0" :max="10000" /></el-form-item>
              <el-form-item label="说明"><el-input v-model="policyForm.description" /></el-form-item>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer><el-button @click="policyDialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="savePolicy">保存表达限制</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageToolbar from '@/components/common/PageToolbar.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { downloadCustomerServiceXlsxTemplate, parseCustomerServiceXlsx } from '@/modules/customer-service/utils/xlsx-import';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import BusinessKnowledgePanel from './components/BusinessKnowledgePanel.vue';
import CalibrationKnowledgePanel from './components/CalibrationKnowledgePanel.vue';
import ConversationStrategyConfig from './components/ConversationStrategyConfig.vue';
import EffectObservationPanel from './components/EffectObservationPanel.vue';
import { listCustomerServiceIndustryNodes } from '@/modules/customer-service/api/industries.api';
import { listCustomerServiceMerchantRoles } from '@/modules/customer-service/api/merchant-roles.api';
import { listCustomerServiceIntentDefinitions } from '@/modules/customer-service/api/intent-definitions.api';
import {
  createCustomerServiceAccountProfile, createCustomerServiceLanguagePolicy, createCustomerServiceStoreProfile,
  getCustomerServiceStoreProfile,
  listCustomerServiceAccountProfiles, listCustomerServiceLanguagePolicies, listCustomerServiceStoreProfiles,
  updateCustomerServiceAccountProfile, updateCustomerServiceLanguagePolicy, updateCustomerServiceStoreProfile,
} from '@/modules/customer-service/api/context-profiles.api';
import { useCustomerServicePermission } from '@/modules/customer-service/composables/useCustomerServicePermission';
import { customerServiceDefaultAccountIdentityPresets, type CustomerServiceDefaultAccountIdentityPreset } from '@/modules/customer-service/constants/default-account-identity-presets';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type { CustomerServiceIntentDefinition } from '@/modules/customer-service/types/intent-definitions.types';
import type {
  CustomerServiceAccountProfile, CustomerServiceAccountChannel, CustomerServiceContextStatus,
  CustomerServiceLanguagePolicy, CustomerServiceLanguageRule, CustomerServiceLanguageScopeType, CustomerServiceStoreProfile,
  CustomerServiceConversationStrategyConfig,
} from '@/modules/customer-service/types/context-profiles.types';

type ViewMode = 'all' | 'profiles' | 'knowledge' | 'policies';
type ProfileImportRow = { rowNumber:number; name:string; code:string; channel:CustomerServiceAccountChannel; description:string; mainBusiness:string; brandIntro:string; targetCustomers:string; brandTone:string; businessRules:string; permissionBoundaries:string; validityNotes:string; publicIdentity:string; relationship:string; voice:string; tone:string; background:string; permissions:string; generationPrompt:string; status:CustomerServiceContextStatus };

const props = withDefaults(defineProps<{ viewMode?: ViewMode; embedded?: boolean }>(), { viewMode: 'all', embedded: false });

const { has } = useCustomerServicePermission();
const router = useRouter();
const canCreate = computed(() => has('customer-service:context-profile:create'));
const canUpdate = computed(() => has('customer-service:context-profile:update'));
const canCalibrationRead = computed(() => has('customer-service:calibration:read'));
const canCalibrationUpdate = computed(() => has('customer-service:calibration:update'));
const canKnowledgePublish = computed(() => canCalibrationUpdate.value && canUpdate.value);
const canAssetPublish = computed(() => has('customer-service:asset:publish'));
const activeTab = ref(props.viewMode === 'knowledge' ? 'knowledge' : props.viewMode === 'policies' ? 'policies' : 'profiles');
const showAdvancedEditor = ref(props.viewMode === 'all');
const pageTitle = computed(() => props.viewMode === 'profiles' ? '账号配置' : props.viewMode === 'knowledge' ? '业务知识' : props.viewMode === 'policies' ? '表达限制' : '账号知识与表达');
const pageDescription = computed(() => props.viewMode === 'profiles'
  ? '维护客服的业务身份、服务范围和说话方式。机器人会自动继承这份配置。'
  : props.viewMode === 'knowledge'
    ? '维护商品、活动、政策和常见问答等可核实事实，供自动回复安全引用。'
    : props.viewMode === 'policies'
      ? '维护禁用词、固定替换和确定性表达边界；普通语气与风格仍由角色配置负责。'
    : '统一维护账号资料、可检索业务知识、确定性表达规则和账号校准沉淀。机器人仍只需选择一份账号资料，运行时会自动继承已发布内容。');
const loading = ref(false);
const saving = ref(false);
const keyword = ref('');
const status = ref('');
const stores = ref<CustomerServiceStoreProfile[]>([]);
const accounts = ref<CustomerServiceAccountProfile[]>([]);
const policies = ref<CustomerServiceLanguagePolicy[]>([]);
const roles = ref<CustomerServiceMerchantRole[]>([]);
const industries = ref<CustomerServiceIndustryNode[]>([]);
const profileDialog = ref(false);
const profileImportDialog = ref(false);
const profileImporting = ref(false);
const profileImportFileInput = ref<HTMLInputElement>();
const profileImportRows = ref<ProfileImportRow[]>([]);
const profileImportFileName = ref('');
const policyDialog = ref(false);

const statusOptions = [
  { label: '草稿（暂不使用）', value: 'DRAFT' }, { label: '已启用', value: 'ENABLED' },
  { label: '已停用', value: 'DISABLED' }, { label: '已归档', value: 'ARCHIVED' },
];
const channelOptions = [
  ['微信', 'WECHAT'], ['淘宝', 'TAOBAO'], ['抖音', 'DOUYIN'], ['小红书', 'XIAOHONGSHU'],
  ['网页', 'WEB'], ['售后', 'AFTER_SALES'], ['私域', 'PRIVATE_DOMAIN'], ['其他', 'OTHER'],
].map(([label, value]) => ({ label, value }));
const scopeOptions = [
  ['全部账号', 'GLOBAL'], ['某一份账号资料', 'ACCOUNT'], ['某个业务角色', 'ROLE'],
  ['某个平台渠道', 'CHANNEL'], ['某家店铺（历史/高级）', 'STORE'], ['某个场景（高级）', 'SCENARIO'], ['某个客户意图（高级）', 'INTENT'],
].map(([label, value]) => ({ label, value }));
const receptionTypeOptions = [
  ['自动判断（推荐）', 'AUTO'], ['业务客服', 'BUSINESS_SERVICE'], ['内容互动', 'CONTENT_INTERACTION'],
  ['社群/陪伴', 'COMMUNITY_COMPANION'], ['售后客服', 'AFTER_SALES'], ['咨询顾问', 'CONSULTANT'],
].map(([label, value]) => ({ label, value }));
const greetingModeOptions = [
  ['自然回应并轻量说明可帮助范围', 'SERVICE_SCOPE'], ['自然回应并问一个必要问题', 'LIGHT_QUESTION'],
  ['只自然回应，不主动提问', 'ACK_ONLY'], ['按补充接待要求执行', 'CUSTOM'],
].map(([label, value]) => ({ label, value }));
const businessVisibilityOptions = [
  ['不主动提业务', 'NONE'], ['轻量带出服务范围', 'LIGHT'], ['明确说明服务范围', 'EXPLICIT'],
].map(([label, value]) => ({ label, value }));
const intentFlowModeOptions = [
  ['自动使用适用流程（推荐）', 'AUTO'], ['只使用选中的流程', 'SELECTED_ONLY'], ['自动使用，但排除选中的流程', 'AUTO_EXCEPT_DISABLED'],
].map(([label, value]) => ({ label, value }));
const replyLengthPresetOptions = [
  ['自动 / 自然（推荐）', 'AUTO'], ['精简', 'CONCISE'], ['适中', 'BALANCED'], ['详细', 'DETAILED'], ['自定义', 'CUSTOM'],
].map(([label, value]) => ({ label, value }));
const deliveryModeOptions = [
  ['自动判断（推荐）', 'AUTO'], ['尽量合并为一条', 'SINGLE'], ['允许顺序分段', 'SEQUENTIAL'],
].map(([label, value]) => ({ label, value }));

const ruleTypeOptions = [
  ['禁用词', 'FORBIDDEN_WORD'], ['禁用短语', 'FORBIDDEN_PHRASE'], ['禁用符号', 'FORBIDDEN_SYMBOL'],
  ['结尾符号', 'ENDING_SYMBOL'], ['开头话术', 'STARTING_TEXT'], ['正则表达式（高级）', 'REGEX'],
].map(([label, value]) => ({ label, value }));
const actionOptions = [
  ['让模型重新表达', 'MODEL_REWRITE'], ['直接移除', 'REMOVE'], ['替换成指定内容', 'REPLACE'],
  ['阻止并重新生成', 'BLOCK'], ['生成前提醒模型', 'PROMPT_ONLY'], ['只记录警告', 'WARN'],
].map(([label, value]) => ({ label, value }));

const profileForm = reactive({ id: '', storeId: '', storeRevision: 1, code: '', name: '', merchantRoleId: '', industryNodeId: '', channel: 'DOUYIN' as CustomerServiceAccountChannel, description: '', status: 'DRAFT' as CustomerServiceContextStatus, revision: 1 });
const profileImportForm = reactive({ merchantRoleId:'', industryNodeId:'', storeMode:'CREATE_PER_ROW' as 'CREATE_PER_ROW'|'LINK_EXISTING', storeProfileId:'' });
const defaultConversationStrategy = (): CustomerServiceConversationStrategyConfig => ({
  contextCarryoverMode: 'AUTO', returningGreetingMode: 'SOFT_CONTINUITY',
  businessIdentityStrength: 'BALANCED', casualChatBoundary: 'OPEN',
  reuseConfirmedPreferences: true, continueUnfinishedItems: true, stateInferenceMode: 'CONSERVATIVE',
  humanNaturalness: 'AUTO', humanResponseDensity: 'AUTO', humanColloquiality: 'AUTO',
  humanQuestionFrequency: 'AUTO', humanBusinessAdvance: 'AUTO', humanReturningContinuity: 'AUTO',
  humanEmoji: 'AUTO', humanIdentityExposure: 'AUTO', humanSegmentation: 'AUTO',
  contextBudgetMode: 'AUTO', activeContextTokenBudget: 3200, totalInputTokenBudget: 8000,
  reservedInstructionTokens: 1800, maxKnowledgeTokens: 2200,
});
const defaultStoreProfile = () => ({
  brandIntro: '', mainBusiness: '', targetCustomers: '', brandTone: '', businessRules: '', permissionBoundaries: '', validityNotes: '', examples: '',
  intentFlowMode: 'AUTO', intentFlowKeys: [] as string[],
  replyLengthPreset: 'AUTO', replyMaxSentences: 6, deliveryMode: 'AUTO', maxSegments: 4,
  splitThresholdChars: 64, minDelayMs: 700, maxDelayMs: 1400, cancelRemainingOnCustomerMessage: true,
  conversationStrategy: defaultConversationStrategy(),
});
const storeProfile = reactive(defaultStoreProfile());
const defaultAccountProfile = () => ({
  publicIdentity: '', relationship: '', voice: '', tone: '', background: '', permissions: '', generationPrompt: '',
  receptionType: 'AUTO', greetingMode: 'SERVICE_SCOPE', businessVisibility: 'LIGHT',
  greetingServiceScope: '', openingMaxChars: 120, openingMaxQuestions: 2,
  allowCasualChatOnOpening: true, customGreetingGuidance: '',
  inheritStoreIntentFlow: true, intentFlowMode: 'AUTO', intentFlowKeys: [] as string[],
  inheritStoreReplyExperience: true, replyLengthPreset: 'AUTO', replyMaxSentences: 6,
  deliveryMode: 'AUTO', maxSegments: 4, splitThresholdChars: 64,
  minDelayMs: 700, maxDelayMs: 1400, cancelRemainingOnCustomerMessage: true,
  inheritStoreConversationStrategy: true, conversationStrategy: defaultConversationStrategy(),
});
const accountProfile = reactive(defaultAccountProfile());

function applyNaturalIdentityRuntimePreferences() {
  // Identity presets reset only role-expression/runtime presentation preferences.
  // Business knowledge, intent flows, permissions and explicit language policies remain separate operator-owned configuration.
  Object.assign(storeProfile, {
    replyLengthPreset: 'AUTO',
    replyMaxSentences: 6,
    deliveryMode: 'AUTO',
    maxSegments: 4,
    splitThresholdChars: 64,
    minDelayMs: 500,
    maxDelayMs: 1200,
    cancelRemainingOnCustomerMessage: true,
  });
  storeProfile.conversationStrategy = {
    ...storeProfile.conversationStrategy,
    casualChatBoundary: 'OPEN',
    humanNaturalness: 'AUTO',
    humanResponseDensity: 'AUTO',
    humanColloquiality: 'AUTO',
    humanQuestionFrequency: 'AUTO',
    humanBusinessAdvance: 'AUTO',
    humanReturningContinuity: 'AUTO',
    humanEmoji: 'AUTO',
    humanIdentityExposure: 'AUTO',
    humanSegmentation: 'AUTO',
  };
  Object.assign(accountProfile, {
    openingMaxChars: 120,
    openingMaxQuestions: 2,
    allowCasualChatOnOpening: true,
    inheritStoreReplyExperience: true,
    inheritStoreConversationStrategy: true,
    replyLengthPreset: 'AUTO',
    replyMaxSentences: 6,
    deliveryMode: 'AUTO',
    maxSegments: 4,
    splitThresholdChars: 64,
    minDelayMs: 500,
    maxDelayMs: 1200,
    cancelRemainingOnCustomerMessage: true,
  });
  accountProfile.conversationStrategy = {
    ...accountProfile.conversationStrategy,
    casualChatBoundary: 'OPEN',
    humanNaturalness: 'AUTO',
    humanResponseDensity: 'AUTO',
    humanColloquiality: 'AUTO',
    humanQuestionFrequency: 'AUTO',
    humanBusinessAdvance: 'AUTO',
    humanReturningContinuity: 'AUTO',
    humanEmoji: 'AUTO',
    humanIdentityExposure: 'AUTO',
    humanSegmentation: 'AUTO',
  };
}
const policyForm = reactive({ id: '', code: '', name: '', description: '', scopeType: 'GLOBAL' as CustomerServiceLanguageScopeType, scopeKey: '*', priority: 100, status: 'DRAFT' as CustomerServiceContextStatus, revision: 1 });
const policyStyle = reactive({ guidance: '' });
const policyRules = ref<CustomerServiceLanguageRule[]>([]);
const intentDefinitions = ref<CustomerServiceIntentDefinition[]>([]);
const enabledStores = computed(() => stores.value.filter((item) => item.status === 'ENABLED'));
const enabledRoles = computed(() => roles.value.filter((item) => item.status === 'ENABLED'));
const aliRole = computed(() => enabledRoles.value.find((item) => item.code === 'ali') ?? null);
const selectedRole = computed(() => enabledRoles.value.find((item) => item.id === profileForm.merchantRoleId) ?? null);
const identityPromptOverrideEnabled = ref(false);
const enabledIndustries = computed(() => industries.value.filter((item) => item.status === 'ENABLED'));
const intentOptions = computed(() => intentDefinitions.value.map((item) => ({ label: `${item.name} · ${item.scenario}`, value: item.key })));
const profileHasContent = computed(() => [
  profileForm.name, profileForm.description,
  storeProfile.brandIntro, storeProfile.mainBusiness, storeProfile.targetCustomers, storeProfile.brandTone,
  storeProfile.businessRules, storeProfile.permissionBoundaries, storeProfile.validityNotes, storeProfile.examples,
  accountProfile.publicIdentity, accountProfile.relationship, accountProfile.voice, accountProfile.tone,
  accountProfile.background, accountProfile.permissions, accountProfile.generationPrompt, accountProfile.greetingServiceScope, accountProfile.customGreetingGuidance,
].some((item) => String(item || '').trim()));
const policyHasContent = computed(() => Boolean(
  policyForm.name.trim() || policyForm.description.trim() || policyStyle.guidance.trim()
  || policyRules.value.some((item) => item.pattern.trim()),
));
const scopeCandidates = computed(() => {
  if (policyForm.scopeType === 'ACCOUNT') return accounts.value.map((item) => ({ label: item.name, value: item.id }));
  if (policyForm.scopeType === 'STORE') return stores.value.map((item) => ({ label: item.name, value: item.id }));
  if (policyForm.scopeType === 'ROLE') return roles.value.map((item) => ({ label: item.name, value: item.id }));
  if (policyForm.scopeType === 'CHANNEL') return channelOptions;
  return [];
});

onMounted(async () => {
  const [roleResult, industryResult, intentResult] = await Promise.all([
    listCustomerServiceMerchantRoles({ keyword: '', status: '', page: 1, pageSize: 500 }),
    listCustomerServiceIndustryNodes(),
    listCustomerServiceIntentDefinitions({ keyword: '', category: '', scenario: '', status: 'ENABLED', page: 1, pageSize: 500 }),
  ]);
  roles.value = roleResult.items;
  industries.value = industryResult;
  intentDefinitions.value = intentResult.items;
  if (props.viewMode === 'policies') await Promise.all([loadProfiles(), loadPolicies()]);
  else await loadProfiles();
});
async function loadActive() { if (activeTab.value === 'profiles') await loadProfiles(); else if (activeTab.value === 'policies') await loadPolicies(); }
async function loadProfiles() {
  loading.value = true;
  try {
    const [storeResult, accountResult] = await Promise.all([
      listCustomerServiceStoreProfiles({ page: 1, pageSize: 500 }),
      listCustomerServiceAccountProfiles({ keyword: keyword.value, status: status.value, page: 1, pageSize: 500 }),
    ]);
    stores.value = storeResult.items;
    accounts.value = accountResult.items;
  } finally { loading.value = false; }
}
async function loadPolicies() { loading.value = true; try { policies.value = (await listCustomerServiceLanguagePolicies({ keyword: keyword.value, status: status.value, page: 1, pageSize: 500 })).items; } finally { loading.value = false; } }
function resetRecord(target: Record<string, unknown>, source: Record<string, unknown>) { Object.keys(target).forEach((key) => { target[key] = source[key] ?? ''; }); }
async function onProfileStoreChange(value: string | number | boolean | undefined) {
  const storeId = String(value || '').trim();
  if (!storeId) {
    profileForm.storeRevision = 1;
    Object.assign(storeProfile, defaultStoreProfile());
    storeProfile.conversationStrategy = { ...defaultConversationStrategy(), ...(storeProfile.conversationStrategy || {}) };
    return;
  }
  let store = stores.value.find((item) => item.id === storeId);
  if (!store) {
    store = await getCustomerServiceStoreProfile(storeId);
    stores.value = [...stores.value, store];
  }
  profileForm.storeRevision = store.revision;
  Object.assign(storeProfile, defaultStoreProfile(), store.profile || {});
  storeProfile.conversationStrategy = { ...defaultConversationStrategy(), ...(storeProfile.conversationStrategy || {}) };
}

function openProfileImport() {
  const defaultRole = aliRole.value || enabledRoles.value[0] || null;
  Object.assign(profileImportForm, { merchantRoleId: defaultRole?.id || '', industryNodeId: '', storeMode: 'CREATE_PER_ROW', storeProfileId: '' });
  profileImportRows.value = [];
  profileImportFileName.value = '';
  profileImportDialog.value = true;
}
function chooseProfileImportFile() { profileImportFileInput.value?.click(); }
async function handleProfileImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const parsed = await parseCustomerServiceXlsx(file);
    const rows = parsed.map(({ rowNumber, values }) => ({
      rowNumber,
      name: importValue(values, '资料名称', '账号资料名称', '名称', 'name'),
      code: importValue(values, '编码', 'code'),
      channel: normalizeImportedChannel(importValue(values, '渠道', '使用渠道', 'channel')),
      description: importValue(values, '说明', '补充说明', 'description'),
      mainBusiness: importValue(values, '主营业务', 'mainBusiness'),
      brandIntro: importValue(values, '店铺/品牌介绍', '品牌介绍', 'brandIntro'),
      targetCustomers: importValue(values, '目标客户', 'targetCustomers'),
      brandTone: importValue(values, '品牌整体感觉', '品牌语气', 'brandTone'),
      businessRules: importValue(values, '业务规则', 'businessRules'),
      permissionBoundaries: importValue(values, '不能承诺', '不能承诺的事情', 'permissionBoundaries'),
      validityNotes: importValue(values, '时效说明', 'validityNotes'),
      publicIdentity: importValue(values, '对外身份', 'publicIdentity'),
      relationship: importValue(values, '与客户关系', 'relationship'),
      voice: importValue(values, '说话方式', 'voice'),
      tone: importValue(values, '亲近度与语气', '语气', 'tone'),
      background: importValue(values, '账号补充背景', '背景', 'background'),
      permissions: importValue(values, '账号权限', '能做和不能做什么', 'permissions'),
      generationPrompt: importValue(values, '身份Prompt覆盖', '身份 Prompt 覆盖', 'generationPrompt'),
      status: normalizeImportedProfileStatus(importValue(values, '状态', 'status') || 'ENABLED'),
    })).filter((row) => row.name || row.mainBusiness || row.brandIntro || row.publicIdentity);
    if (!rows.length) throw new Error('Excel 中没有可导入的账号背景');
    if (rows.length > 300) throw new Error(`当前文件有 ${rows.length} 行；单次最多导入 300 份账号资料，请拆分文件`);
    const requiredMissing = rows.filter((row) => !row.name || !row.publicIdentity || (profileImportForm.storeMode === 'CREATE_PER_ROW' && (!row.mainBusiness || !row.brandIntro)));
    if (requiredMissing.length) throw new Error(`第 ${requiredMissing.slice(0,8).map((row) => row.rowNumber).join('、')}${requiredMissing.length>8?' 等':''} 行缺少必填字段：资料名称、对外身份；按行新建店铺时还必须有主营业务和店铺/品牌介绍`);
    const codes = rows.map((row) => row.code.trim().toLowerCase()).filter(Boolean);
    const duplicated = codes.find((code, index) => codes.indexOf(code) !== index);
    if (duplicated) throw new Error(`Excel 内存在重复账号编码：${duplicated}`);
    profileImportRows.value = rows;
    profileImportFileName.value = file.name;
    ElMessage.success(`已识别 ${rows.length} 份账号资料`);
  } catch (error:any) {
    profileImportRows.value = [];
    profileImportFileName.value = '';
    ElMessage.error(error?.message || '账号背景 Excel 解析失败');
  } finally { input.value = ''; }
}
async function downloadProfileImportTemplate() {
  await downloadCustomerServiceXlsxTemplate({
    fileName:'智能客服-账号背景导入模板.xlsx',sheetName:'账号背景',
    columns:[
      {key:'name',label:'资料名称',width:28},{key:'code',label:'编码',width:22},{key:'channel',label:'渠道',width:14},{key:'description',label:'说明',width:30},
      {key:'mainBusiness',label:'主营业务',width:32},{key:'brandIntro',label:'店铺/品牌介绍',width:50},{key:'targetCustomers',label:'目标客户',width:30},{key:'brandTone',label:'品牌整体感觉',width:32},
      {key:'businessRules',label:'业务规则',width:40},{key:'permissionBoundaries',label:'不能承诺',width:40},{key:'validityNotes',label:'时效说明',width:34},
      {key:'publicIdentity',label:'对外身份',width:28},{key:'relationship',label:'与客户关系',width:30},{key:'voice',label:'说话方式',width:42},{key:'tone',label:'亲近度与语气',width:36},
      {key:'background',label:'账号补充背景',width:42},{key:'permissions',label:'账号权限',width:42},{key:'generationPrompt',label:'身份Prompt覆盖',width:52},{key:'status',label:'状态',width:14}
    ],
    sampleRows:[{name:'抖音 · 阿梨女装旗舰店',code:'ali-douyin',channel:'DOUYIN',description:'通勤女装主账号',mainBusiness:'通勤女装与基础配饰',brandIntro:'面向上班族提供简洁通勤款与日常搭配建议',targetCustomers:'20～35 岁上班族女性',brandTone:'自然、真诚，不夸张营销',businessRules:'优惠以页面实时活动为准',permissionBoundaries:'不能承诺指定日期一定到货',validityNotes:'活动和库存以实时页面/接口为准',publicIdentity:'店铺穿搭顾问',relationship:'熟悉但不过度亲昵的长期顾问',voice:'先直接回答，再补一个当前最有帮助的建议',tone:'自然温和',background:'主要服务通勤穿搭咨询',permissions:'可给尺码方向，但不能保证绝对合身',generationPrompt:'',status:'ENABLED'}],
    note:'角色、行业、所属店铺是关系配置，不填写内部 ID：导入时在弹窗手动选择。渠道支持 WECHAT / TAOBAO / DOUYIN / XIAOHONGSHU / WEB / AFTER_SALES / PRIVATE_DOMAIN / OTHER，也支持常见中文名称。若弹窗选择“统一关联已有店铺”，模板里的店铺事实字段不会覆盖已有店铺，只导入账号身份/背景。'
  });
}
async function confirmProfileImport() {
  if (!profileImportRows.value.length) return ElMessage.warning('请先选择并解析 Excel 文件');
  if (!profileImportForm.merchantRoleId) return ElMessage.warning('请选择导入账号统一使用的角色');
  if (profileImportForm.storeMode === 'LINK_EXISTING' && !profileImportForm.storeProfileId) return ElMessage.warning('请选择要关联的已有店铺');
  if (profileImportForm.storeMode === 'CREATE_PER_ROW') {
    const missing = profileImportRows.value.find((row) => !row.mainBusiness || !row.brandIntro);
    if (missing) return ElMessage.warning(`第 ${missing.rowNumber} 行缺少主营业务或店铺/品牌介绍，无法按行新建店铺`);
  }
  const existingAccountCodes = new Set(accounts.value.map((item) => item.code.trim().toLowerCase()).filter(Boolean));
  const conflict = profileImportRows.value.find((row) => row.code && existingAccountCodes.has(row.code.trim().toLowerCase()));
  if (conflict) return ElMessage.warning(`第 ${conflict.rowNumber} 行账号编码“${conflict.code}”已存在，请修改模板后再导入`);
  profileImporting.value = true;
  let created = 0;
  try {
    for (const [index, row] of profileImportRows.value.entries()) {
      const baseCode = row.code.trim() || `account-import-${Date.now().toString(36)}-${index + 1}`;
      let storeId = profileImportForm.storeProfileId;
      if (profileImportForm.storeMode === 'CREATE_PER_ROW') {
        const importedStoreProfile = { ...defaultStoreProfile(), brandIntro:row.brandIntro, mainBusiness:row.mainBusiness, targetCustomers:row.targetCustomers, brandTone:row.brandTone, businessRules:row.businessRules, permissionBoundaries:row.permissionBoundaries, validityNotes:row.validityNotes };
        const createdStore = await createCustomerServiceStoreProfile({ code:`${baseCode}-store`, name:`${row.name} · 店铺业务`, description:row.description || null, profile:importedStoreProfile, status:row.status });
        storeId = createdStore.id;
      }
      const importedAccountProfile = { ...defaultAccountProfile(), publicIdentity:row.publicIdentity, relationship:row.relationship, voice:row.voice, tone:row.tone, background:row.background, permissions:row.permissions, generationPrompt:row.generationPrompt };
      try {
        await createCustomerServiceAccountProfile({ code:baseCode, name:row.name, storeProfileId:storeId || null, merchantRoleId:profileImportForm.merchantRoleId, industryNodeId:profileImportForm.industryNodeId || null, channel:row.channel, description:row.description || null, profile:importedAccountProfile, status:row.status });
        created++;
      } catch (error:any) {
        throw new Error(`第 ${row.rowNumber} 行“${row.name}”账号创建失败：${error?.message || '未知错误'}。本次此前已创建 ${created} 份账号资料${profileImportForm.storeMode === 'CREATE_PER_ROW' ? '；该行店铺可能已创建，请在账号资料列表核对后再重试' : ''}。`);
      }
    }
    profileImportDialog.value = false;
    await loadProfiles();
    ElMessage.success(`账号背景导入完成：已创建 ${created} 份账号资料`);
  } catch (error:any) {
    ElMessage.error(error?.message || '账号背景导入失败');
    await loadProfiles();
  } finally { profileImporting.value = false; }
}
function importValue(values:Record<string,string>, ...keys:string[]) { for (const key of keys) { const value=String(values[key] || '').trim(); if (value) return value; } return ''; }
function normalizeImportedProfileStatus(value:string):CustomerServiceContextStatus { const normalized=String(value||'').trim().toUpperCase(); const map:Record<string,CustomerServiceContextStatus>={ENABLED:'ENABLED','已启用':'ENABLED','启用':'ENABLED',DRAFT:'DRAFT','草稿':'DRAFT',DISABLED:'DISABLED','已停用':'DISABLED','停用':'DISABLED',ARCHIVED:'ARCHIVED','已归档':'ARCHIVED','归档':'ARCHIVED'}; return map[normalized] || map[String(value||'').trim()] || 'ENABLED'; }
function normalizeImportedChannel(value:string):CustomerServiceAccountChannel { const normalized=String(value||'').normalize('NFKC').trim().toUpperCase(); const map:Record<string,CustomerServiceAccountChannel>={WECHAT:'WECHAT','微信':'WECHAT',TAOBAO:'TAOBAO','淘宝':'TAOBAO',DOUYIN:'DOUYIN','抖音':'DOUYIN',XIAOHONGSHU:'XIAOHONGSHU','小红书':'XIAOHONGSHU',WEB:'WEB','网页':'WEB','网站':'WEB',AFTER_SALES:'AFTER_SALES','售后':'AFTER_SALES',PRIVATE_DOMAIN:'PRIVATE_DOMAIN','私域':'PRIVATE_DOMAIN',OTHER:'OTHER','其他':'OTHER'}; return map[normalized] || map[String(value||'').trim()] || 'OTHER'; }

async function openProfile(row?: CustomerServiceAccountProfile) {
  let store = row?.storeProfileId ? stores.value.find((item) => item.id === row.storeProfileId) : undefined;
  if (!store && row?.storeProfileId) {
    store = await getCustomerServiceStoreProfile(row.storeProfileId);
    stores.value = [...stores.value, store];
  }
  const defaultRole = aliRole.value || enabledRoles.value[0] || null;
  Object.assign(profileForm, row ? {
    id: row.id, storeId: store?.id || '', storeRevision: store?.revision || 1, code: row.code, name: row.name,
    merchantRoleId: row.merchantRoleId || defaultRole?.id || '', industryNodeId: row.industryNodeId || '', channel: row.channel || 'OTHER',
    description: row.description || '', status: row.status, revision: row.revision,
  } : {
    id: '', storeId: '', storeRevision: 1, code: `account-${Date.now().toString(36)}`, name: '', merchantRoleId: defaultRole?.id || '',
    industryNodeId: '', channel: 'DOUYIN', description: '', status: 'ENABLED', revision: 1,
  });
  Object.assign(storeProfile, defaultStoreProfile(), store?.profile || {});
  storeProfile.conversationStrategy = { ...defaultConversationStrategy(), ...(storeProfile.conversationStrategy || {}) };
  Object.assign(accountProfile, defaultAccountProfile(), row?.profile || {});
  identityPromptOverrideEnabled.value = Boolean(String(accountProfile.generationPrompt || '').trim());
  accountProfile.conversationStrategy = { ...defaultConversationStrategy(), ...(accountProfile.conversationStrategy || {}) };
  profileDialog.value = true;
}
const profileSamplePresets: CustomerServiceDefaultAccountIdentityPreset[] = customerServiceDefaultAccountIdentityPresets;

function textIncludesAny(source: string, keywords: string[]) {
  const normalized = source.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function resolveSampleIndustryId(preset: CustomerServiceDefaultAccountIdentityPreset) {
  const matched = enabledIndustries.value.find((item) => textIncludesAny([
    item.code, item.name, item.description || '', item.path || '',
  ].join(' '), preset.industryKeywords));
  return matched?.id || '';
}

async function fillProfileSample(command: string | number | object) {
  const key = String(command || '');
  const preset = profileSamplePresets.find((item) => item.key === key);
  if (!preset) return;
  if (profileHasContent.value) {
    try {
      await ElMessageBox.confirm(
        `当前表单已经有内容。继续会用“${preset.label}”重置身份/店铺样例，并把回复与人感表达恢复为低限制自然默认；业务知识和意图流程不会被删除，也不会自动保存。`,
        '覆盖并填入身份样例？',
        { confirmButtonText: '覆盖并填入', cancelButtonText: '保留当前内容', type: 'warning' },
      );
    } catch {
      return;
    }
  }
  const industryNodeId = resolveSampleIndustryId(preset);
  const editing = Boolean(profileForm.id);
  const stableEditMetadata = editing ? { name: profileForm.name, channel: profileForm.channel, description: profileForm.description, status: profileForm.status } : null;
  Object.assign(profileForm, {
    name: editing ? profileForm.name : preset.profile.name,
    merchantRoleId: profileForm.merchantRoleId || aliRole.value?.id || enabledRoles.value[0]?.id || '',
    industryNodeId: industryNodeId || (editing ? profileForm.industryNodeId : ''),
    channel: editing ? profileForm.channel : preset.profile.channel,
    description: editing ? profileForm.description : `${preset.profile.description} 请按真实业务修改后再保存。`,
    status: editing ? profileForm.status : 'DRAFT',
  });
  if (editing) {
    // 身份重置覆盖角色/账号/店铺样例字段，并把回复/人感表达恢复为低限制自然默认；业务知识、意图流程和显式政策仍由各自模块管理。
    Object.assign(storeProfile, preset.store);
    Object.assign(accountProfile, preset.account);
  } else {
    Object.assign(storeProfile, defaultStoreProfile(), preset.store);
    Object.assign(accountProfile, defaultAccountProfile(), preset.account);
  }
  applyNaturalIdentityRuntimePreferences();
  if (!editing && props.viewMode === 'profiles') profileForm.status = 'ENABLED';
  if (stableEditMetadata) Object.assign(profileForm, stableEditMetadata);
  if (!profileForm.merchantRoleId) {
    ElMessage.warning('账号身份样例已填入，但当前没有可用角色；请先到“角色配置”创建或启用角色。');
    return;
  }
  if (!industryNodeId) ElMessage.warning(`“${preset.label}”已填入，但没有匹配到已启用行业节点；如需行业能力，请在“所属行业”手动选择。`);
  else ElMessage.success(`“${preset.label}”身份已重置，并恢复低限制自然对话/人感表达默认；确认后再保存`);
}
function intentSelectionLabel(mode: string) {
  return mode === 'SELECTED_ONLY' ? '只允许使用的意图流程' : '需要排除的意图流程';
}
function validateRuntimePreferences() {
  const intentSource = accountProfile.inheritStoreIntentFlow ? storeProfile : accountProfile;
  if (intentSource.intentFlowMode === 'SELECTED_ONLY' && !intentSource.intentFlowKeys.length) return '选择“只使用选中的流程”时，请至少选择一个客户意图流程';
  const deliverySource = accountProfile.inheritStoreReplyExperience ? storeProfile : accountProfile;
  if (deliverySource.maxDelayMs < deliverySource.minDelayMs) return '最大段间延迟不能小于最小段间延迟';
  const conversationSource = accountProfile.inheritStoreConversationStrategy ? storeProfile.conversationStrategy : accountProfile.conversationStrategy;
  if (conversationSource.contextBudgetMode === 'CUSTOM') {
    if (conversationSource.activeContextTokenBudget > conversationSource.totalInputTokenBudget) return '会话 Active Context Token 预算不能大于运行时总输入预算';
    if (conversationSource.reservedInstructionTokens + conversationSource.maxKnowledgeTokens + 256 > conversationSource.totalInputTokenBudget) return '系统指令预留 + 业务知识预算过高，请为当前消息、State 和历史上下文保留至少 256 Token';
  }
  return '';
}
function normalizeRuntimePreferences() {
  storeProfile.intentFlowKeys = [...new Set(storeProfile.intentFlowKeys.map((item) => String(item || '').trim()).filter(Boolean))];
  accountProfile.intentFlowKeys = [...new Set(accountProfile.intentFlowKeys.map((item) => String(item || '').trim()).filter(Boolean))];
}
function openIntentFlowManagement() { profileDialog.value = false; router.push('/customer-service/intents'); }
function onIdentityPromptOverrideChange(enabled: string | number | boolean) {
  if (!enabled) accountProfile.generationPrompt = '';
}

async function saveProfile() {
  if (!profileForm.merchantRoleId) return ElMessage.warning('请选择当前账号使用的角色');
  if (!profileForm.name.trim()) return ElMessage.warning('请填写资料名称');
  if (!profileForm.channel) return ElMessage.warning('请选择使用渠道');
  if (!storeProfile.mainBusiness.trim() || !storeProfile.brandIntro.trim()) return ElMessage.warning('请填写主营业务和店铺/品牌介绍');
  if (!accountProfile.publicIdentity.trim()) return ElMessage.warning('请填写账号对外身份');
  const preferenceError = validateRuntimePreferences();
  if (preferenceError) return ElMessage.warning(preferenceError);
  normalizeRuntimePreferences();
  saving.value = true;
  try {
    const baseCode = profileForm.code.trim() || `account-${Date.now().toString(36)}`;
    const storePayload = {
      name: `${profileForm.name.trim()} · 店铺业务`, description: profileForm.description, profile: { ...storeProfile }, status: profileForm.status,
    };
    let storeId = profileForm.storeId;
    if (storeId) {
      const updated = await updateCustomerServiceStoreProfile(storeId, { ...storePayload, revision: profileForm.storeRevision });
      profileForm.storeRevision = updated.revision;
    } else {
      const created = await createCustomerServiceStoreProfile({ ...storePayload, code: `${baseCode}-store` });
      storeId = created.id;
      profileForm.storeId = created.id;
      profileForm.storeRevision = created.revision;
    }
    const accountPayload = {
      name: profileForm.name.trim(), storeProfileId: storeId, merchantRoleId: profileForm.merchantRoleId,
      industryNodeId: profileForm.industryNodeId || null, channel: profileForm.channel, description: profileForm.description,
      profile: { ...accountProfile }, status: profileForm.status,
    };
    if (profileForm.id) await updateCustomerServiceAccountProfile(profileForm.id, { ...accountPayload, revision: profileForm.revision });
    else await createCustomerServiceAccountProfile({ ...accountPayload, code: baseCode });
    profileDialog.value = false;
    ElMessage.success('整份账号资料已保存；店铺/角色关系已生效，适用知识会自动继承');
    await loadProfiles();
  } finally { saving.value = false; }
}
function openPolicy(row?: CustomerServiceLanguagePolicy) {
  Object.assign(policyForm, row ? { ...row, description: row.description || '' } : { id: '', code: `language-${Date.now().toString(36)}`, name: '', description: '', scopeType: 'GLOBAL', scopeKey: '*', priority: 100, status: 'DRAFT', revision: 1 });
  policyStyle.guidance = String(row?.styleGuidance?.guidance || '');
  policyRules.value = (row?.rules || []).map((item, index) => ({ ...item, id: item.id || `rule_${Date.now()}_${index}`, severity: item.severity === 'SOFT' ? 'SOFT' : 'HARD', exceptions: [...(item.exceptions || [])] }));
  if (!policyRules.value.length) addRule();
  policyDialog.value = true;
}
function fillPolicySample() {
  Object.assign(policyForm, {
    name: '避免客服接待套话', description: '虚构参考样例：避免机械式接待词，保留自然、直接的聊天表达。',
    scopeType: 'GLOBAL', scopeKey: '*', priority: 500, status: 'DRAFT',
  });
  policyStyle.guidance = '直接承接客户当前表达，像真人聊天一样自然，不使用固定接待开场。';
  policyRules.value = [
    makeRule('FORBIDDEN_PHRASE', '亲亲', 'ANYWHERE', 'MODEL_REWRITE'),
    makeRule('FORBIDDEN_PHRASE', '这边呢', 'ANYWHERE', 'MODEL_REWRITE'),
    makeRule('STARTING_TEXT', '您好，很高兴为您服务', 'START', 'MODEL_REWRITE'),
  ];
  ElMessage.success('表达限制样例已填入，当前仍是草稿');
}
function openPeriodTemplate() {
  openPolicy();
  Object.assign(policyForm, { code: `chat-no-ending-period-${Date.now().toString(36)}`, name: '聊天回复结尾不用句号', scopeType: 'GLOBAL', scopeKey: '*', priority: 900, status: 'ENABLED' });
  policyStyle.guidance = '像真实聊天一样自然收尾，结尾不使用中文句号或英文句点';
  policyRules.value = [makeRule('ENDING_SYMBOL', '。', 'END', 'REMOVE'), makeRule('ENDING_SYMBOL', '.', 'END', 'REMOVE')];
}
function addRule() { policyRules.value.push(makeRule('FORBIDDEN_PHRASE', '', 'ANYWHERE', 'MODEL_REWRITE')); }
function makeRule(type: string, pattern: string, position: CustomerServiceLanguageRule['position'], action: CustomerServiceLanguageRule['action']): CustomerServiceLanguageRule {
  return { id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type, pattern, position, action, replacement: '', severity: 'HARD', enabled: true, exceptions: [] };
}
async function savePolicy() {
  const rules = policyRules.value.filter((item) => item.pattern.trim()).map((item) => ({
    id: item.id, name: item.name || item.pattern.trim(), type: item.type, pattern: item.pattern.trim(), position: item.position,
    action: item.action, replacement: item.replacement?.trim() || null, severity: item.severity === 'SOFT' ? 'SOFT' as const : 'HARD' as const,
    enabled: item.enabled !== false, exceptions: [...(item.exceptions || [])], limit: item.limit ?? null, description: item.description?.trim() || null,
  }));
  if (!policyForm.name.trim() || !policyForm.scopeKey || !rules.length) return ElMessage.warning('请填写限制名称、生效对象和至少一条具体限制');
  saving.value = true;
  try {
    const payload = { code: policyForm.code.trim(), name: policyForm.name.trim(), description: policyForm.description, scopeType: policyForm.scopeType, scopeKey: policyForm.scopeKey, priority: policyForm.priority, rules, styleGuidance: { guidance: policyStyle.guidance }, status: policyForm.status };
    if (policyForm.id) await updateCustomerServiceLanguagePolicy(policyForm.id, { ...payload, revision: policyForm.revision }); else await createCustomerServiceLanguagePolicy(payload);
    policyDialog.value = false; ElMessage.success('表达限制已保存'); await loadPolicies();
  } finally { saving.value = false; }
}
function storeSummary(storeId: string | null) { const store = stores.value.find((item) => item.id === storeId); return store ? profileSummary(store.profile) : '尚未填写店铺与业务事实'; }
function profileSummary(profile: Record<string, unknown>) { return Object.values(profile).map(String).filter(Boolean).slice(0, 2).join(' · ') || '尚未填写'; }
function channelName(value: string | null) { return channelOptions.find((item) => item.value === value)?.label || value || '未设置渠道'; }
function scopeName(value: string) { return scopeOptions.find((item) => item.value === value)?.label || value; }
function scopeDisplay(row: CustomerServiceLanguagePolicy) { if (row.scopeType === 'GLOBAL') return '全部'; return scopeCandidatesFor(row.scopeType).find((item) => item.value === row.scopeKey)?.label || row.scopeKey; }
function scopeCandidatesFor(type: string) { if (type === 'ACCOUNT') return accounts.value.map((item) => ({ label: item.name, value: item.id })); if (type === 'STORE') return stores.value.map((item) => ({ label: item.name, value: item.id })); if (type === 'ROLE') return roles.value.map((item) => ({ label: item.name, value: item.id })); if (type === 'CHANNEL') return channelOptions; return []; }
function ruleName(value: string) { return ruleTypeOptions.find((item) => item.value === value)?.label || value; }
function statusName(value: string) { return statusOptions.find((item) => item.value === value)?.label || value; }
function statusType(value: string) { return value === 'ENABLED' ? 'success' : value === 'DRAFT' ? 'warning' : 'info'; }
</script>

<style scoped>
.usage-guide { border: 1px solid #d8eee2; border-radius: 14px; background: linear-gradient(135deg, #f3fbf6, #fff); padding: 18px 20px; }
.guide-heading, .tab-description, .form-section-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.guide-heading p, .tab-description p, .form-section-title p { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.guide-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.guide-steps > div { display: flex; gap: 10px; border-radius: 10px; background: #fff; padding: 12px; }
.guide-steps span, .form-section-title > span { display: inline-flex; width: 28px; height: 28px; flex: 0 0 28px; align-items: center; justify-content: center; border-radius: 50%; background: var(--el-color-primary); color: #fff; font-weight: 700; }
.guide-steps p { margin: 0; }.guide-steps b, .guide-steps small { display: block; }.guide-steps small { margin-top: 4px; color: var(--el-text-color-secondary); line-height: 1.5; }
.friendly-tabs { border: 1px solid var(--el-border-color-lighter); border-radius: 14px; background: #fff; padding: 0 16px 18px; }
.single-mode-tabs :deep(.el-tabs__header) { display: none; }
.single-mode-tabs { padding-top: 18px; }
.simple-guide { padding: 14px 18px; }
.embedded-policy-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: var(--el-fill-color-extra-light); padding: 12px 14px; }
.embedded-policy-actions strong, .embedded-policy-actions span { display: block; }.embedded-policy-actions span { margin-top: 3px; color: var(--el-text-color-secondary); font-size: 12px; }
.tab-description { margin-bottom: 15px; border-radius: 10px; background: var(--el-fill-color-lighter); padding: 12px 14px; }
.panel-toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 170px auto; gap: 12px; align-items: center; margin-bottom: 16px; }
.profile-import-toolbar { grid-template-columns: minmax(220px, 1fr) 170px auto auto; }
.import-file-actions { display:flex;align-items:center;gap:10px;flex-wrap:wrap; }.import-file-actions span { color:var(--el-text-color-secondary);font-size:12px; }.hidden-file{display:none;}
.policy-toolbar { grid-template-columns: minmax(220px, 1fr) 170px auto auto; }
.profile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.profile-card { min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: #fff; padding: 16px; transition: .16s ease; }
.profile-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 6px 18px rgba(20, 80, 45, .07); }
.profile-card header, .profile-title, .profile-card footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.profile-title { justify-content: flex-start; }
.profile-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }.profile-meta span { border-radius: 999px; background: var(--el-fill-color-lighter); padding: 4px 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.profile-section { margin-top: 10px; }.profile-section label { color: var(--el-text-color-secondary); font-size: 12px; }.profile-section p { margin: 4px 0 0; overflow: hidden; color: var(--el-text-color-regular); font-size: 13px; line-height: 1.6; text-overflow: ellipsis; white-space: nowrap; }
.profile-card footer { margin-top: 14px; border-top: 1px solid var(--el-border-color-lighter); padding-top: 10px; color: var(--el-color-primary); font-size: 12px; }
.form-section { margin-bottom: 18px; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; padding: 16px; }.form-section-title { justify-content: flex-start; margin-bottom: 14px; }.form-section-title > div { flex: 1; }
.sub-config-card { margin-bottom: 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-fill-color-extra-light); padding: 14px; }
.config-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }.config-heading p { margin: 3px 0 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.delay-range { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; width: 100%; }.delay-range > span { color: var(--el-text-color-secondary); }
.sample-fill-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; border: 1px dashed var(--el-color-primary-light-5); border-radius: 10px; background: var(--el-color-primary-light-9); padding: 12px 14px; }.sample-fill-bar strong, .sample-fill-bar span { display: block; }.sample-fill-bar span { margin-top: 3px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }.form-help { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 12px; }.advanced-fields { margin-top: 12px; }.field-label { display: inline-flex; align-items: center; gap: 6px; }
.policy-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 16px; }.rule-row { display: grid; grid-template-columns: 150px minmax(180px, 1fr) 110px 150px minmax(100px, .7fr) 50px 50px; gap: 8px; align-items: center; margin-bottom: 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 10px; }
.profile-sample-option { min-width: 300px; padding: 2px 0; }
.profile-sample-option strong, .profile-sample-option span { display: block; }
.profile-sample-option span { margin-top: 2px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.4; white-space: normal; }
@media (max-width: 900px) { .guide-steps, .profile-grid, .form-grid, .policy-grid { grid-template-columns: 1fr; }.config-heading { flex-direction: column; }.delay-range { grid-template-columns: 1fr; }.delay-range > span { display: none; }.panel-toolbar, .policy-toolbar { grid-template-columns: 1fr; }.rule-row { grid-template-columns: 1fr 1fr; }.sample-fill-bar { align-items: flex-start; flex-direction: column; } }
</style>
