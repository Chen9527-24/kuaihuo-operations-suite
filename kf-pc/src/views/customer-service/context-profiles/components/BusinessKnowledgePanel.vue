<template>
  <div>
    <div class="tab-description">
      <div>
        <strong>业务知识 V2：知识在创建时就确定适用对象，运行时自动继承</strong>
        <p>商品、服务、FAQ、文档和链接统一放进知识库。创建或编辑知识库时直接选择“适用于哪些店铺 / 客服身份 / 特定账号”，保存即完成关联；机器人按当前账号的店铺、角色和账号关系自动合并有效知识，不需要再做第二次绑定。</p>
      </div>
      <HelpTip title="知识如何进入回复" content="当前账号保存时已经确定所属店铺和使用角色；知识库保存时确定适用对象。运行时只根据这些既有关系计算有效知识集合，再结合当前问题检索实体、别名、FAQ、结构化字段与正文。" />
    </div>

    <section class="knowledge-v2-hero">
      <div>
        <strong>正常流程只有两步：建知识库并选择适用对象 → 维护或导入知识</strong>
        <p>STORE / ROLE / ACCOUNT 是底层实现，不要求普通使用者理解。店铺商品、品牌、售后优先选择“整家店铺”；跨店铺复用的专业知识选择“客服身份”；只有渠道账号独有事实才选择“特定账号”。</p>
      </div>
      <div class="hero-actions">
        <el-dropdown v-if="canCreate" trigger="click" @command="importIndustrySample">
          <el-button type="primary" plain>导入默认行业知识<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in industrySamples" :key="item.key" :command="item.key">
                <div class="sample-menu-item"><strong>{{ item.label }}</strong><span>{{ item.summary }}</span></div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-if="canCreate" @click="openCollection()">新建知识库</el-button>
        <el-button v-if="canCreate" @click="openCollectionImport">导入知识库</el-button>
        <el-button :disabled="!accounts.length" @click="openPreview">检索测试</el-button>
      </div>
    </section>

    <el-alert
      v-if="legacyReconcileSummary.repaired > 0 || legacyReconcileSummary.industryCanonicalized > 0"
      class="mb-3"
      type="success"
      :closable="false"
      show-icon
      :title="`已自动迁移 ${legacyReconcileSummary.repaired} 个旧适用关系，并规范化 ${legacyReconcileSummary.industryCanonicalized} 个历史行业编码`"
      description="这是版本升级兼容处理，不是新的日常操作。以后知识库行业归类由系统根据适用对象统一维护，普通用户不再手填行业编码。"
    />
    <el-alert
      v-else-if="legacyReconcileSummary.unresolved > 0 || legacyReconcileSummary.industryConflicts > 0"
      class="mb-3"
      type="warning"
      :closable="false"
      show-icon
      :title="`有 ${legacyReconcileSummary.unresolved} 个旧知识库适用对象待确认，${legacyReconcileSummary.industryConflicts} 个行业归类存在冲突`"
      description="系统不会猜测有歧义的关系。正常新建/编辑流程只需选择“适用于谁”；行业归类由后端从账号/店铺/身份关系统一解析。"
    />

    <div class="collection-bar">
      <el-select v-model="activeCollectionId" clearable filterable placeholder="选择知识库（不选则查看全部直接知识）" @change="load">
        <el-option v-for="item in collections" :key="item.id" :value="item.id" :label="`${item.name} · ${item._count?.entries || 0} 条`" />
      </el-select>
      <template v-if="activeCollection">
        <el-tag :type="statusType(activeCollection.status)">{{ statusName(activeCollection.status) }}</el-tag>
        <span class="collection-meta">系统行业：{{ activeCollection.industryCode || '通用 / 自动' }}</span>
        <el-button v-if="canUpdate" link type="primary" @click="openCollection(activeCollection)">编辑知识库与适用对象</el-button>
      </template>
    </div>

    <div v-if="activeCollection" class="applicability-strip" :class="{ unbound: !activeBindings.length }">
      <template v-if="activeBindings.length">
        <span class="muted">自动适用于：</span>
        <el-tag v-for="binding in activeBindings" :key="binding.id" effect="plain">{{ bindingTargetName(binding) }}</el-tag>
        <small>当前账号只要属于这些店铺、身份或账号范围，Runtime 就会自动继承；不用再次关联。</small>
      </template>
      <template v-else>
        <strong>当前知识库还没有适用对象，因此不会进入正式回复。</strong>
        <span>这是历史兼容状态；编辑知识库并选择“适用于谁”即可。新建已启用知识库时系统会阻止漏配。</span>
      </template>
    </div>

    <div class="knowledge-toolbar">
      <el-input v-model="query.keyword" clearable placeholder="搜索标题、实体、别名、问题或内容" @keyup.enter="load" />
      <el-select v-if="!activeCollectionId" v-model="query.scopeKey" clearable filterable placeholder="全部账号/店铺"><el-option v-for="item in scopeCandidates" :key="item.value" :label="item.label" :value="item.value" /></el-select>
      <el-select v-model="query.category" clearable placeholder="全部分类"><el-option v-for="item in categoryOptions" :key="item.value" v-bind="item" /></el-select>
      <el-select v-model="query.status" clearable placeholder="全部状态"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select>
      <el-button @click="load">查询</el-button>
      <el-button v-if="canCreate" type="primary" @click="open()">新增常规知识</el-button>
      <el-button v-if="canCreate" type="primary" plain @click="openRegularKnowledgeImport">导入常规知识</el-button>
      <el-button v-if="canCreate" type="success" plain @click="openFixedQa()">新增固定问答</el-button>
      <el-button v-if="canCreate" type="success" @click="openFixedQaImport">导入固定问答</el-button>
    </div>

    <el-table v-loading="loading" :data="entries" row-key="id">
      <el-table-column prop="title" label="标题 / 实体" min-width="220">
        <template #default="{ row }"><div class="flex items-center gap-2"><strong>{{ row.title }}</strong><el-tag v-if="isFixedQa(row)" size="small" type="success" effect="plain">固定问答</el-tag></div><div class="muted">{{ row.entityKey || row.question || '未设置实体键/常见问法' }}</div></template>
      </el-table-column>
      <el-table-column label="知识库 / 范围" min-width="190"><template #default="{ row }">{{ scopeName(row) }}</template></el-table-column>
      <el-table-column label="分类" width="120"><template #default="{ row }">{{ categoryName(row.category) }}</template></el-table-column>
      <el-table-column label="内容" min-width="300" show-overflow-tooltip><template #default="{ row }">{{ row.content }}</template></el-table-column>
      <el-table-column label="引用" width="90"><template #default="{ row }"><el-tag v-if="row.references?.length" effect="plain">{{ row.references.length }} 个</el-tag><span v-else>-</span></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusName(row.status) }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="130" fixed="right"><template #default="{ row }"><el-button v-if="canUpdate" link type="primary" @click="open(row)">编辑</el-button><el-button v-if="canUpdate" link type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>

    <el-dialog v-model="collectionDialog" :title="collectionForm.id ? '编辑知识库' : '新建知识库'" width="min(820px, 96vw)" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon title="保存知识库时同时保存适用对象" description="以后新增账号时，只要它选择了同一个店铺或客服身份，就会自动继承这里的知识；行业归类也由系统根据这些关系统一计算，不需要手填行业编码。" class="mb-4" />
      <el-form label-position="top">
        <el-form-item label="知识库名称"><el-input v-model="collectionForm.name" placeholder="例如：青禾 · 商品与客服知识" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="编码（选填）"><el-input v-model="collectionForm.code" placeholder="例如：qinghe-product-service" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="collectionForm.status" class="w-full"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        </div>
        <el-form-item label="说明"><el-input v-model="collectionForm.description" type="textarea" :rows="3" placeholder="说明该知识库包含哪些产品、服务或政策。" /></el-form-item>

        <div class="applicability-editor">
          <div class="applicability-heading">
            <div><strong>适用于谁</strong><p>可以同时选择多项。系统内部自动保存为多范围关系，不是一对一。</p></div>
            <HelpTip title="怎么选最合适" content="店铺自己的商品、售后、品牌事实选“整家店铺”；同一客服身份跨店铺都能复用的专业知识选“客服身份”；只有某个渠道账号特有的事实才选“特定账号”。" />
          </div>
          <el-form-item label="整家店铺（商品 / 售后 / 品牌优先选这里）">
            <el-select v-model="collectionForm.storeIds" multiple filterable collapse-tags collapse-tags-tooltip class="w-full" placeholder="选择一个或多个店铺/业务主体">
              <el-option v-for="item in enabledStores" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="客服身份（跨店铺复用的专业知识）">
            <el-select v-model="collectionForm.roleIds" multiple filterable collapse-tags collapse-tags-tooltip class="w-full" placeholder="可选：选择一个或多个客服身份">
              <el-option v-for="item in enabledRoles" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="特定账号（只在确实是账号独有事实时使用）">
            <el-select v-model="collectionForm.accountIds" multiple filterable collapse-tags collapse-tags-tooltip class="w-full" placeholder="可选：选择一个或多个账号">
              <el-option v-for="item in enabledAccounts" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <div class="inheritance-preview">
            <strong>保存后的继承关系</strong>
            <span v-if="applicabilityCount">{{ applicabilityCount }} 个适用范围会和知识库一起保存；以后账号换店铺/角色时，Runtime 会按最新关系重新计算有效知识。</span>
            <span v-else>尚未选择适用对象。草稿可以暂不选择；“已启用”知识库必须至少选择一个适用对象。</span>
          </div>
        </div>
      </el-form>
      <template #footer><el-button @click="collectionDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveCollection">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="previewDialog" title="知识检索测试" width="min(860px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon title="这里测试的是知识命中，不会调用 DeepSeek" description="选择真实账号资料后，系统会同时按该账号、所属店铺和所选客服身份计算有效知识，与正式 Runtime 使用同一知识选择器。" />
      <el-form label-position="top" class="mt-4">
        <el-form-item label="账号资料"><el-select v-model="previewForm.accountId" filterable class="w-full"><el-option v-for="item in accounts" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="客户问题"><el-input v-model="previewForm.message" type="textarea" :rows="3" placeholder="输入一条真实客户问题" /></el-form-item>
        <el-button type="primary" :loading="previewLoading" @click="runPreview">检索</el-button>
      </el-form>
      <el-alert
        v-if="previewFixedQa?.matched"
        class="mt-4"
        type="success"
        :closable="false"
        show-icon
        :title="`固定问答命中：${previewFixedQa.title || '-'} · ${fixedQaMatchTypeName(previewFixedQa.matchType)}${typeof previewFixedQa.matchScore === 'number' ? ` · 相似度 ${(previewFixedQa.matchScore * 100).toFixed(0)}%` : ''}`"
        :description="`将直接回复配置答案，不调用 AI；本次随机等待约 ${((previewFixedQa.delayMs || 0) / 1000).toFixed(1)} 秒。答案：${previewFixedQa.answer || ''}`"
      />
      <div v-if="previewResults.length" class="preview-results">
        <article v-for="item in previewResults" :key="item.id">
          <header><strong>{{ item.title }}</strong><el-tag effect="plain">{{ item.entityKey || item.category }}</el-tag></header>
          <p>{{ item.content }}</p>
          <small>{{ item.selectionReason || '知识命中' }} · relevance {{ item.relevanceScore ?? '-' }}</small>
          <div v-if="item.references?.length" class="reference-list"><span v-for="refItem in item.references" :key="refItem.url">{{ refItem.title }} · {{ refItem.url }}</span></div>
        </article>
      </div>
      <div v-else-if="previewRan && !previewFixedQa?.matched" class="preview-diagnostics">
        <el-alert type="warning" :closable="false" show-icon title="本轮没有最终命中" :description="previewDiagnosticMessage" />
        <div v-if="previewDiagnostics" class="preview-diagnostic-meta">
          <span>关系候选：{{ previewDiagnostics.candidateCount }}</span>
          <span>行业：{{ previewDiagnostics.effectiveBusinessScope?.industryCode || '未解析' }}</span>
          <span>范围过滤：{{ previewDiagnostics.scopeRejected?.length || 0 }}</span>
          <span>预算淘汰：{{ previewDiagnostics.budgetEvicted?.length || 0 }}</span>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="collectionImportDialog" title="导入知识库" width="min(980px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon class="mb-4" title="文件只负责知识库本身；适用关系在这里手动选择" description="模板中不填写内部 ID。导入弹窗统一选择整家店铺 / 客服身份 / 特定账号，确认后每个导入的知识库都会保存同一组明确 Applicability。" />
      <el-form label-position="top">
        <div class="applicability-editor">
          <div class="applicability-heading"><div><strong>导入后适用于谁</strong><p>如果当前已经筛选一个知识库，会默认继承它的适用范围作为起点；仍可手动增删。</p></div></div>
          <el-form-item label="整家店铺"><el-select v-model="collectionImportForm.storeIds" multiple filterable collapse-tags collapse-tags-tooltip class="w-full"><el-option v-for="item in enabledStores" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="客服身份"><el-select v-model="collectionImportForm.roleIds" multiple filterable collapse-tags collapse-tags-tooltip class="w-full"><el-option v-for="item in enabledRoles" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="特定账号"><el-select v-model="collectionImportForm.accountIds" multiple filterable collapse-tags collapse-tags-tooltip class="w-full"><el-option v-for="item in enabledAccounts" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        </div>
        <el-form-item label="Excel 文件" class="mt-4">
          <div class="import-file-actions"><el-button @click="chooseCollectionImportFile">选择 Excel</el-button><el-button link type="primary" @click="downloadCollectionImportTemplate">下载导入模板</el-button><span>{{ collectionImportFileName || '支持 .xlsx；一行创建一个知识库' }}</span></div>
          <input ref="collectionImportFileInput" class="hidden-file" type="file" accept=".xlsx" @change="handleCollectionImportFile" />
        </el-form-item>
      </el-form>
      <el-alert v-if="collectionImportRows.length" class="mb-3" type="success" :closable="false" :title="`已识别 ${collectionImportRows.length} 个知识库`" description="确认后逐个创建；如果存在重复编码或后端校验失败，会明确提示失败行，不会把关系写进 Excel。" />
      <el-table v-if="collectionImportRows.length" :data="collectionImportRows" max-height="360" border stripe>
        <el-table-column prop="rowNumber" label="Excel 行" width="90" /><el-table-column prop="name" label="知识库名称" min-width="220" /><el-table-column prop="code" label="编码" min-width="180" /><el-table-column prop="description" label="说明" min-width="280" show-overflow-tooltip /><el-table-column prop="status" label="状态" width="110" />
      </el-table>
      <template #footer><el-button @click="collectionImportDialog=false">取消</el-button><el-button type="primary" :loading="collectionImporting" :disabled="!collectionImportRows.length" @click="confirmCollectionImport">确认导入 {{ collectionImportRows.length || '' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="regularImportDialog" title="导入常规知识" width="min(1040px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon class="mb-4" title="常规知识和固定答案直出严格分开" description="这里导入的是给正常 Knowledge Retrieval / Grounding 使用的常规知识。FIXED_QA、fixedQa 结构或“输入→输出”固定答案请使用旁边的“导入固定问答”，本入口会主动拒绝混入。" />
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="关联知识库"><el-select v-model="regularImportForm.collectionId" filterable class="w-full" placeholder="请选择知识库"><el-option v-for="item in collections" :key="item.id" :label="`${item.name} · ${item._count?.entries || 0} 条`" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="导入状态"><el-select v-model="regularImportForm.status" class="w-full"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        </div>
        <div class="fixed-qa-import-scope">
          <strong>当前关联</strong><template v-if="regularImportCollection"><span>{{ regularImportCollection.name }}</span><div v-if="regularImportBindings.length" class="fixed-qa-import-bindings"><el-tag v-for="binding in regularImportBindings" :key="binding.id" effect="plain">{{ bindingTargetName(binding) }}</el-tag></div><small v-else>这个知识库当前没有启用适用对象；导入可以完成，但正式 Runtime 不会消费，直到配置好“适用于谁”。</small></template><span v-else class="muted">如果页面当前已经筛选某个知识库，这里会自动选中；仍可手动更换。</span>
        </div>
        <el-form-item label="知识文件" class="mt-4">
          <div class="import-file-actions"><el-button @click="chooseRegularImportFile">选择文件</el-button><el-button link type="primary" @click="downloadRegularKnowledgeTemplate">下载 Excel 模板</el-button><span>{{ regularImportFileName || '支持 .xlsx / .csv / .json / .md；Excel 模板最直观' }}</span></div>
          <input ref="regularImportFileInput" class="hidden-file" type="file" accept=".json,.csv,.xlsx,.md,.markdown" @change="handleRegularImportFile" />
        </el-form-item>
      </el-form>
      <el-alert v-if="regularImportRows.length" class="mb-3" type="success" :closable="false" :title="`已识别 ${regularImportRows.length} 条常规知识`" description="预览只显示前 100 条；确认后使用当前所选知识库和状态批量导入。" />
      <el-table v-if="regularImportRows.length" :data="regularImportRows.slice(0,100)" max-height="380" border stripe>
        <el-table-column prop="rowNumber" label="来源行" width="90" /><el-table-column prop="title" label="标题" min-width="220" /><el-table-column prop="category" label="分类" width="120" /><el-table-column prop="question" label="常见问法" min-width="220" show-overflow-tooltip /><el-table-column prop="content" label="知识内容" min-width="360" show-overflow-tooltip />
      </el-table>
      <template #footer><el-button @click="regularImportDialog=false">取消</el-button><el-button type="primary" :loading="regularImporting" :disabled="!regularImportForm.collectionId || !regularImportRows.length" @click="confirmRegularImport">确认导入 {{ regularImportRows.length || '' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="fixedQaDialog" :title="fixedQaForm.id ? '编辑固定问答' : '新增固定问答'" width="min(820px, 96vw)" destroy-on-close>
      <el-alert type="success" :closable="false" show-icon class="mb-4" title="命中后直接回复这里配置的答案，不调用 AI" description="生效范围仍由知识库 / 账号 / 店铺关系决定。使用知识库时，“适用于谁”的店铺、客服身份、特定账号绑定就是唯一范围 Authority。" />
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="作用范围"><el-select v-model="fixedQaForm.scopeType" class="w-full" @change="onFixedQaScopeChange"><el-option label="当前知识库（推荐）" value="COLLECTION" /><el-option label="当前账号（高级）" value="ACCOUNT" /><el-option label="整家店铺（高级）" value="STORE" /></el-select></el-form-item>
          <el-form-item label="生效对象"><el-select v-model="fixedQaForm.scopeKey" filterable class="w-full"><el-option v-for="item in fixedQaScopeCandidates" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="匹配方式"><el-input model-value="模糊匹配（固定直出统一规则）" disabled /></el-form-item>
          <el-form-item label="优先级"><el-input-number v-model="fixedQaForm.priority" :min="0" :max="1000" class="w-full" /></el-form-item>
          <el-form-item label="随机 Loading 最短（秒）"><el-input-number v-model="fixedQaForm.minDelaySec" :min="0.5" :max="8" :step="0.1" :precision="1" class="w-full" /></el-form-item>
          <el-form-item label="随机 Loading 最长（秒）"><el-input-number v-model="fixedQaForm.maxDelaySec" :min="0.5" :max="8" :step="0.1" :precision="1" class="w-full" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="fixedQaForm.status" class="w-full"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        </div>
        <el-form-item label="规则名称"><el-input v-model="fixedQaForm.title" placeholder="例如：修改收货地址" /></el-form-item>
        <el-form-item label="可命中的提问"><el-input v-model="fixedQaForm.triggerPhrasesText" type="textarea" :rows="4" placeholder="每行一个问法，也支持用 | 分隔。例如：
怎么修改收货地址
地址填错了怎么办" /></el-form-item>
        <el-form-item label="排除词（选填）"><el-input v-model="fixedQaForm.excludedKeywordsText" placeholder="例如：退货地址,售后地址" /></el-form-item>
        <el-form-item label="固定答案"><el-input v-model="fixedQaForm.answer" type="textarea" :rows="7" placeholder="命中后将原样回复，不经过 DeepSeek/HVE 改写" /></el-form-item>
        <div class="fixed-qa-help">
          <strong>生效逻辑：</strong>所有固定直出统一使用模糊匹配，不再区分精确/包含/关键词模式。先按当前账号 / 店铺 / 客服身份解析可用知识，再在其中做确定性模糊匹配；高置信命中后使用 {{ fixedQaForm.minDelaySec.toFixed(1) }}～{{ fixedQaForm.maxDelaySec.toFixed(1) }} 秒随机等待并原文直出，模型不调用。
        </div>
      </el-form>
      <template #footer><el-button @click="fixedQaDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveFixedQa">保存</el-button></template>
    </el-dialog>


    <el-dialog v-model="fixedQaImportDialog" title="导入固定问答（输入 → 输出）" width="min(980px, 96vw)" :close-on-click-modal="false" destroy-on-close>
      <el-alert
        type="success"
        :closable="false"
        show-icon
        class="mb-4"
        title="Excel 每一行创建一条固定问答知识；“输入”用于匹配，“输出”就是最终直出答案"
        description="兼容你提供的“轮次 / 输入 / 输出”格式，其中“轮次”仅作表格说明，不会写入规则。所有导入的固定直出统一使用模糊匹配；命中后按配置随机 Loading，并跳过模型调用。"
      />
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="关联知识库">
            <el-select v-model="fixedQaImportForm.collectionId" filterable class="w-full" placeholder="请选择导入到哪个知识库">
              <el-option v-for="item in collections" :key="item.id" :label="`${item.name} · ${item._count?.entries || 0} 条`" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="输入匹配方式"><el-input model-value="模糊匹配（固定直出统一规则）" disabled /></el-form-item>
          <el-form-item label="优先级"><el-input-number v-model="fixedQaImportForm.priority" :min="0" :max="1000" class="w-full" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="fixedQaImportForm.status" class="w-full"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
          <el-form-item label="随机 Loading 最短（秒）"><el-input-number v-model="fixedQaImportForm.minDelaySec" :min="0.5" :max="8" :step="0.1" :precision="1" class="w-full" /></el-form-item>
          <el-form-item label="随机 Loading 最长（秒）"><el-input-number v-model="fixedQaImportForm.maxDelaySec" :min="0.5" :max="8" :step="0.1" :precision="1" class="w-full" /></el-form-item>
        </div>

        <div class="fixed-qa-import-scope">
          <strong>当前关联</strong>
          <template v-if="fixedQaImportCollection">
            <span>{{ fixedQaImportCollection.name }}</span>
            <div v-if="fixedQaImportBindings.length" class="fixed-qa-import-bindings">
              <el-tag v-for="binding in fixedQaImportBindings" :key="binding.id" effect="plain">{{ bindingTargetName(binding) }}</el-tag>
            </div>
            <small v-else>这个知识库当前没有启用的适用对象；导入可以完成，但正式 Runtime 不会消费，直到知识库配置好“适用于谁”。</small>
          </template>
          <span v-else class="muted">如果页面当前已经筛选某个知识库，这里会自动选中；仍然可以手动更改。</span>
        </div>

        <el-form-item label="Excel 文件" class="mt-4">
          <div class="fixed-qa-import-file">
            <el-button @click="chooseFixedQaImportFile">选择 Excel</el-button>
            <el-button link type="primary" @click="downloadFixedQaImportTemplate">下载导入模板</el-button>
            <span>{{ fixedQaImportFileName || '支持 .xlsx；表头至少包含“输入”和“输出”' }}</span>
          </div>
          <input ref="fixedQaImportFileInput" class="hidden-file" type="file" accept=".xlsx" @change="handleFixedQaImportFile" />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="fixedQaImportRows.length"
        class="mb-3"
        type="info"
        :closable="false"
        :title="`已识别 ${fixedQaImportRows.length} 条固定问答；确认后将创建 ${fixedQaImportRows.length} 条知识`"
        description="不会把多行合并成一条知识。每一行都是独立 FIXED_QA，答案保持 Excel“输出”原文。"
      />
      <el-table v-if="fixedQaImportRows.length" :data="fixedQaImportRows" max-height="420" border stripe>
        <el-table-column prop="rowNumber" label="Excel 行" width="90" />
        <el-table-column prop="input" label="输入 / 匹配问题" min-width="320" show-overflow-tooltip />
        <el-table-column prop="output" label="输出 / 固定答案" min-width="420" show-overflow-tooltip />
      </el-table>

      <template #footer>
        <el-button @click="fixedQaImportDialog=false">取消</el-button>
        <el-button type="primary" :loading="fixedQaImporting" :disabled="!fixedQaImportForm.collectionId || !fixedQaImportRows.length" @click="confirmFixedQaImport">确认导入 {{ fixedQaImportRows.length || '' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dialog" :title="form.id ? '编辑业务知识' : '新增业务知识'" width="min(900px, 96vw)" destroy-on-close>
      <el-alert title="商品参数、政策、链接等只能填写已核实事实。实时价格、库存、订单、物流仍以实时接口为准。" type="warning" :closable="false" show-icon class="mb-4" />
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="作用范围"><el-select v-model="form.scopeType" class="w-full" @change="onFormScopeChange"><el-option label="当前知识库" value="COLLECTION" /><el-option label="当前账号（历史/高级）" value="ACCOUNT" /><el-option label="整家店铺（历史/高级）" value="STORE" /></el-select></el-form-item>
          <el-form-item label="生效对象"><el-select v-model="form.scopeKey" filterable class="w-full"><el-option v-for="item in formScopeCandidates" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="分类"><el-select v-model="form.category" class="w-full"><el-option v-for="item in categoryOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
          <el-form-item label="知识类型"><el-select v-model="form.knowledgeKind" clearable class="w-full" placeholder="显式选择，不按标题自动推断"><el-option v-for="item in knowledgeKindOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
          <el-form-item label="状态"><el-select v-model="form.status" class="w-full"><el-option v-for="item in statusOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
          <el-form-item label="实体类型"><el-input v-model="form.entityType" placeholder="PRODUCT / MODULE / POLICY / REFERENCE / TARGET_TAXONOMY" /></el-form-item>
          <el-form-item label="实体键 / SKU"><el-input v-model="form.entityKey" placeholder="例如：SKU-001；Target Taxonomy 时填写 canonical key" /></el-form-item>
        </div>
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="常见问法（选填）"><el-input v-model="form.question" /></el-form-item>
        <el-form-item label="知识内容"><el-input v-model="form.content" type="textarea" :rows="6" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="标签"><el-input v-model="form.tagsText" placeholder="逗号分隔" /></el-form-item>
          <el-form-item label="实体别名"><el-input v-model="form.aliasesText" placeholder="逗号分隔，例如：开放接口,API" /></el-form-item>
          <el-form-item label="候选分类键"><el-input v-model="form.taxonomyKeysText" placeholder="逗号分隔；ENTITY 候选填写已定义的 canonical key" /></el-form-item>
          <el-form-item label="权威类型"><el-input v-model="form.authorityLevel" placeholder="BUSINESS_FACT / REFERENCE_ONLY" /></el-form-item>
          <el-form-item label="来源"><el-select v-model="form.sourceType" class="w-full"><el-option label="人工维护" value="MANUAL" /><el-option label="文档" value="DOCUMENT" /><el-option label="导入" value="IMPORT" /><el-option label="校准修订草稿" value="CALIBRATION_DRAFT" /></el-select></el-form-item>
        </div>
        <el-alert type="info" :closable="false" show-icon class="mb-3" title="候选分类只接受显式结构化配置" description="参与候选推荐的商品/服务请将知识类型设为 ENTITY，并填写候选分类键。Target Taxonomy 定义使用 分类=REFERENCE、知识类型=REFERENCE、实体类型=TARGET_TAXONOMY，canonical key 放在实体键，标题/别名作为可识别标签。PC 不会按标题、标签或正文自动推导分类。" />
        <el-form-item label="结构化字段 JSON（选填）"><el-input v-model="form.structuredDataText" type="textarea" :rows="3" placeholder='例如：{"colors":["黑色"],"sizes":["M","L"]}' /></el-form-item>
        <el-form-item label="可分享引用 JSON（选填）"><el-input v-model="form.referencesText" type="textarea" :rows="3" placeholder='例如：[{"type":"PRODUCT_PAGE","title":"商品详情","url":"https://...","shareable":true}]' /></el-form-item>
        <div class="form-grid">
          <el-form-item label="生效时间（选填）"><el-date-picker v-model="form.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" class="w-full" /></el-form-item>
          <el-form-item label="失效时间（选填）"><el-date-picker v-model="form.effectiveTo" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" class="w-full" /></el-form-item>
        </div>
        <el-form-item label="来源说明（选填）"><el-input v-model="form.sourceReference" /></el-form-item>
        <el-form-item label="时效规则（选填）"><el-input v-model="form.freshnessPolicy" placeholder="例如：商品资料变更后重新导入；实时库存以接口为准" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import HelpTip from '@/components/common/HelpTip.vue';
import { downloadCustomerServiceXlsxTemplate, parseCustomerServiceXlsx } from '@/modules/customer-service/utils/xlsx-import';
import {
  batchImportCustomerServiceKnowledge,
  createCustomerServiceKnowledgeCollection,
  createCustomerServiceKnowledgeEntry,
  deleteCustomerServiceKnowledgeEntry,
  listCustomerServiceKnowledgeCollections,
  listCustomerServiceKnowledgeEntries,
  previewCustomerServiceKnowledge,
  resolveCustomerServiceFixedQa,
  reconcileCustomerServiceKnowledgeLegacyApplicability,
  updateCustomerServiceKnowledgeCollection,
  updateCustomerServiceKnowledgeEntry,
} from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type {
  CustomerServiceAccountProfile,
  CustomerServiceContextStatus,
  CustomerServiceKnowledgeApplicabilityTarget,
  CustomerServiceKnowledgeBinding,
  CustomerServiceKnowledgeCategory,
  CustomerServiceKnowledgeCollection,
  CustomerServiceKnowledgeEntry,
  CustomerServiceKnowledgeKind,
  CustomerServiceKnowledgePreviewItem,
  CustomerServiceKnowledgePreviewDiagnostics,
  CustomerServiceFixedQaMatchType,
  CustomerServiceFixedQaResolveResult,
  CustomerServiceKnowledgeScopeType,
  CustomerServiceKnowledgeSourceType,
  CustomerServiceStoreProfile,
} from '@/modules/customer-service/types/context-profiles.types';

const props = defineProps<{
  accounts: CustomerServiceAccountProfile[];
  stores: CustomerServiceStoreProfile[];
  roles: CustomerServiceMerchantRole[];
  canCreate: boolean;
  canUpdate: boolean;
}>();
const loading=ref(false); const saving=ref(false); const dialog=ref(false); const fixedQaDialog=ref(false); const fixedQaImportDialog=ref(false); const fixedQaImporting=ref(false); const collectionDialog=ref(false); const collectionImportDialog=ref(false); const collectionImporting=ref(false); const regularImportDialog=ref(false); const regularImporting=ref(false); const previewDialog=ref(false); const previewLoading=ref(false); const previewRan=ref(false);
type FixedQaImportRow={rowNumber:number;input:string;output:string};
type CollectionImportRow={rowNumber:number;name:string;code:string;description:string;status:CustomerServiceContextStatus};
type RegularImportPreviewRow={rowNumber:number;title:string;category:string;question:string;content:string;raw:Record<string,unknown>};
const entries=ref<CustomerServiceKnowledgeEntry[]>([]); const collections=ref<CustomerServiceKnowledgeCollection[]>([]); const previewResults=ref<CustomerServiceKnowledgePreviewItem[]>([]); const previewDiagnostics=ref<CustomerServiceKnowledgePreviewDiagnostics|null>(null); const previewFixedQa=ref<CustomerServiceFixedQaResolveResult|null>(null); const fixedQaImportFileInput=ref<HTMLInputElement>(); const collectionImportFileInput=ref<HTMLInputElement>(); const regularImportFileInput=ref<HTMLInputElement>();
const fixedQaImportRows=ref<FixedQaImportRow[]>([]); const fixedQaImportFileName=ref('');
const collectionImportRows=ref<CollectionImportRow[]>([]); const collectionImportFileName=ref('');
const regularImportRows=ref<RegularImportPreviewRow[]>([]); const regularImportFileName=ref('');
const activeCollectionId=ref('');
const query=reactive({ keyword:'',scopeKey:'',category:'' as CustomerServiceKnowledgeCategory|'',status:'' });
const collectionForm=reactive({ id:'',revision:1,name:'',code:'',description:'',status:'ENABLED' as CustomerServiceContextStatus,storeIds:[] as string[],roleIds:[] as string[],accountIds:[] as string[] });
const legacyReconcileSummary=reactive({ repaired:0, unresolved:0, industryCanonicalized:0, industryConflicts:0 });
const previewForm=reactive({ accountId:'',message:'' });
const form=reactive({ id:'',revision:1,scopeType:'COLLECTION' as CustomerServiceKnowledgeScopeType,scopeKey:'',collectionId:'',category:'FAQ' as CustomerServiceKnowledgeCategory,knowledgeKind:'' as CustomerServiceKnowledgeKind|'',title:'',question:'',content:'',tagsText:'',entityType:'GENERIC',entityKey:'',aliasesText:'',taxonomyKeysText:'',structuredDataText:'',referencesText:'',authorityLevel:'BUSINESS_FACT',sourceType:'MANUAL' as CustomerServiceKnowledgeSourceType,sourceReference:'',effectiveFrom:'',effectiveTo:'',freshnessPolicy:'',status:'ENABLED' as CustomerServiceContextStatus });
const fixedQaForm=reactive({ id:'',revision:1,scopeType:'COLLECTION' as CustomerServiceKnowledgeScopeType,scopeKey:'',collectionId:'',title:'',matchType:'FUZZY' as CustomerServiceFixedQaMatchType,triggerPhrasesText:'',excludedKeywordsText:'',answer:'',priority:200,minDelaySec:1.8,maxDelaySec:4.2,status:'ENABLED' as CustomerServiceContextStatus });
const fixedQaImportForm=reactive({ collectionId:'',priority:200,minDelaySec:1.8,maxDelaySec:4.2,status:'ENABLED' as CustomerServiceContextStatus });
const collectionImportForm=reactive({ storeIds:[] as string[],roleIds:[] as string[],accountIds:[] as string[] });
const regularImportForm=reactive({ collectionId:'',status:'ENABLED' as CustomerServiceContextStatus });

const categoryOptions=[['常见问答','FAQ'],['商品知识','PRODUCT'],['服务/功能','SERVICE'],['服务政策','SERVICE_POLICY'],['品牌事实','BRAND_FACT'],['活动说明','ACTIVITY'],['文档知识','DOCUMENT'],['链接/资源','REFERENCE'],['其他','OTHER']].map(([label,value])=>({label,value}));
const knowledgeKindOptions=[['实体事实 / 候选','ENTITY'],['政策','POLICY'],['业务规则','BUSINESS_RULE'],['一般指导','GUIDE'],['FAQ','FAQ'],['参考定义','REFERENCE']].map(([label,value])=>({label,value:value as CustomerServiceKnowledgeKind}));
const statusOptions=[{label:'草稿（不进入回复）',value:'DRAFT'},{label:'已启用',value:'ENABLED'},{label:'已停用',value:'DISABLED'},{label:'已归档',value:'ARCHIVED'}];
const industrySamples=[
  {key:'FASHION_WARM_ADVISOR',label:'通勤女装专业知识',summary:'商品、尺码、搭配、售后与选款链接',file:'fashion-commute-professional.json',accountKeywords:['青禾','女装']},
  {key:'BEAUTY_CONSULTANT',label:'美妆护肤专业知识',summary:'清洁、保湿、防晒、风险边界与商品链接',file:'beauty-skincare-professional.json',accountKeywords:['木棉','护肤']},
  {key:'DIGITAL_AFTER_SALES',label:'数码售后专业知识',summary:'产品目录、设备排障、保修与帮助中心',file:'digital-after-sales-professional.json',accountKeywords:['星环','数码']},
  {key:'SAAS_TECH_SUPPORT',label:'SaaS 专业知识',summary:'产品模块、应用场景、权限、API 与文档',file:'saas-business-management-professional.json',accountKeywords:['云栈','SaaS']},
  {key:'COMMUNITY_HOST',label:'私域社群专业知识',summary:'会员规则、内容栏目、活动边界与资源入口',file:'private-community-operations-professional.json',accountKeywords:['拾光','私域','社群']},
];
const activeCollection=computed(()=>collections.value.find((item)=>item.id===activeCollectionId.value)||null);
const activeBindings=computed(()=>activeCollection.value?.bindings?.filter((item)=>item.status==='ENABLED')||[]);
const enabledStores=computed(()=>props.stores.filter((item)=>item.status==='ENABLED'));
const enabledAccounts=computed(()=>props.accounts.filter((item)=>item.status==='ENABLED'));
const enabledRoles=computed(()=>props.roles.filter((item)=>item.status==='ENABLED'));
const scopeCandidates=computed(()=>[...props.accounts.map((item)=>({label:`账号 · ${item.name}`,value:item.id})),...props.stores.map((item)=>({label:`店铺 · ${item.name}`,value:item.id}))]);
const formScopeCandidates=computed(()=>form.scopeType==='COLLECTION'?collections.value.map((item)=>({label:item.name,value:item.id})):form.scopeType==='ACCOUNT'?props.accounts.map((item)=>({label:item.name,value:item.id})):props.stores.map((item)=>({label:item.name,value:item.id})));
const fixedQaScopeCandidates=computed(()=>fixedQaForm.scopeType==='COLLECTION'?collections.value.map((item)=>({label:item.name,value:item.id})):fixedQaForm.scopeType==='ACCOUNT'?props.accounts.map((item)=>({label:item.name,value:item.id})):props.stores.map((item)=>({label:item.name,value:item.id})));
const fixedQaImportCollection=computed(()=>collections.value.find((item)=>item.id===fixedQaImportForm.collectionId)||null);
const fixedQaImportBindings=computed(()=>fixedQaImportCollection.value?.bindings?.filter((item)=>item.status==='ENABLED')||[]);
const regularImportCollection=computed(()=>collections.value.find((item)=>item.id===regularImportForm.collectionId)||null);
const regularImportBindings=computed(()=>regularImportCollection.value?.bindings?.filter((item)=>item.status==='ENABLED')||[]);
const applicabilityCount=computed(()=>collectionForm.storeIds.length+collectionForm.roleIds.length+collectionForm.accountIds.length);
const previewDiagnosticMessage=computed(()=>{
  const diagnostics=previewDiagnostics.value;
  if(!diagnostics)return '没有命中当前账号通过店铺 / 身份 / 账号关系继承到的有效知识';
  if(diagnostics.candidateCount===0)return '当前账号的店铺 / 身份 / 账号关系没有产生任何知识候选，请检查适用对象与账号关系是否一致。';
  const reasons=new Set((diagnostics.scopeRejected||[]).map((item)=>item.reason));
  if(reasons.has('INDUSTRY_SCOPE_UNRESOLVED'))return `关系已经命中 ${diagnostics.candidateCount} 条知识，但当前账号的行业范围没有解析完成，因此行业知识被安全过滤。`;
  if(reasons.has('FOREIGN_COLLECTION_INDUSTRY'))return `关系已经命中 ${diagnostics.candidateCount} 条知识，但知识库行业与当前账号行业不一致，因此被安全过滤。`;
  return `关系已经命中 ${diagnostics.candidateCount} 条可用知识，但当前问题没有达到内容检索相关性；这属于检索匹配问题，不是绑定问题。`;
});

onMounted(async()=>{
  if(props.canUpdate){
    try{
      const result=await reconcileCustomerServiceKnowledgeLegacyApplicability();
      legacyReconcileSummary.repaired=Number(result.repaired||0);
      legacyReconcileSummary.unresolved=Array.isArray(result.unresolved)?result.unresolved.length:0;
      legacyReconcileSummary.industryCanonicalized=Number(result.industryCanonicalized||0);
      legacyReconcileSummary.industryConflicts=Array.isArray(result.industryConflicts)?result.industryConflicts.length:0;
    }catch{/* 兼容旧后端：正常列表仍可使用，升级后端后会自动完成一次历史迁移。 */}
  }
  await loadCollections();
  await load();
});
async function loadCollections(){ collections.value=await listCustomerServiceKnowledgeCollections(); if(activeCollectionId.value&&!collections.value.some((item)=>item.id===activeCollectionId.value))activeCollectionId.value=''; }
async function load(){ loading.value=true;try{const result=await listCustomerServiceKnowledgeEntries({keyword:query.keyword||undefined,scopeKey:activeCollectionId.value?undefined:query.scopeKey||undefined,category:query.category||undefined,status:query.status||undefined,page:1,pageSize:200});entries.value=activeCollectionId.value?result.items.filter((item)=>item.collectionId===activeCollectionId.value||item.scopeKey===activeCollectionId.value):result.items;}finally{loading.value=false;} }
function openCollection(row?:CustomerServiceKnowledgeCollection){
  const bindings=(row?.bindings||[]).filter((item)=>item.status==='ENABLED');
  Object.assign(collectionForm,row?{
    id:row.id,revision:row.revision,name:row.name,code:row.code||'',description:row.description||'',status:row.status,
    storeIds:bindings.filter((item)=>item.targetType==='STORE').map((item)=>item.targetKey),
    roleIds:bindings.filter((item)=>item.targetType==='ROLE').map((item)=>item.targetKey),
    accountIds:bindings.filter((item)=>item.targetType==='ACCOUNT').map((item)=>item.targetKey),
  }:{id:'',revision:1,name:'',code:'',description:'',status:'ENABLED',storeIds:[],roleIds:[],accountIds:[]});
  collectionDialog.value=true;
}
function buildApplicability():CustomerServiceKnowledgeApplicabilityTarget[]{
  return [
    ...collectionForm.storeIds.map((targetKey)=>({targetType:'STORE' as const,targetKey,priority:120,status:'ENABLED' as const})),
    ...collectionForm.roleIds.map((targetKey)=>({targetType:'ROLE' as const,targetKey,priority:110,status:'ENABLED' as const})),
    ...collectionForm.accountIds.map((targetKey)=>({targetType:'ACCOUNT' as const,targetKey,priority:130,status:'ENABLED' as const})),
  ];
}
async function saveCollection(){
  if(!collectionForm.name.trim())return ElMessage.warning('请填写知识库名称');
  const applicability=buildApplicability();
  if(collectionForm.status==='ENABLED'&&!applicability.length)return ElMessage.warning('已启用知识库必须选择至少一个“适用于谁”；草稿可以暂不选择');
  saving.value=true;
  try{
    const payload={name:collectionForm.name.trim(),code:collectionForm.code.trim()||null,description:collectionForm.description.trim()||null,status:collectionForm.status,applicability};
    const saved=collectionForm.id?await updateCustomerServiceKnowledgeCollection(collectionForm.id,{...payload,revision:collectionForm.revision}):await createCustomerServiceKnowledgeCollection(payload);
    collectionDialog.value=false;await loadCollections();activeCollectionId.value=saved.id;await load();ElMessage.success('知识库与适用对象已一次保存，相关账号会自动继承');
  }finally{saving.value=false;}
}
function bindingTargetName(binding:CustomerServiceKnowledgeBinding){
  if(binding.targetType==='STORE')return `整家店铺 · ${props.stores.find((item)=>item.id===binding.targetKey)?.name||binding.targetKey}`;
  if(binding.targetType==='ROLE')return `客服身份 · ${props.roles.find((item)=>item.id===binding.targetKey)?.name||binding.targetKey}`;
  return `特定账号 · ${props.accounts.find((item)=>item.id===binding.targetKey)?.name||binding.targetKey}`;
}
function buildCollectionImportApplicability():CustomerServiceKnowledgeApplicabilityTarget[]{
  return [
    ...collectionImportForm.storeIds.map((targetKey)=>({targetType:'STORE' as const,targetKey,priority:120,status:'ENABLED' as const})),
    ...collectionImportForm.roleIds.map((targetKey)=>({targetType:'ROLE' as const,targetKey,priority:110,status:'ENABLED' as const})),
    ...collectionImportForm.accountIds.map((targetKey)=>({targetType:'ACCOUNT' as const,targetKey,priority:130,status:'ENABLED' as const})),
  ];
}
function openCollectionImport(){
  const bindings=activeBindings.value;
  Object.assign(collectionImportForm,{
    storeIds:bindings.filter((item)=>item.targetType==='STORE').map((item)=>item.targetKey),
    roleIds:bindings.filter((item)=>item.targetType==='ROLE').map((item)=>item.targetKey),
    accountIds:bindings.filter((item)=>item.targetType==='ACCOUNT').map((item)=>item.targetKey),
  });
  collectionImportRows.value=[];collectionImportFileName.value='';collectionImportDialog.value=true;
}
function chooseCollectionImportFile(){collectionImportFileInput.value?.click();}
async function handleCollectionImportFile(event:Event){
  const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  try{
    const parsed=await parseCustomerServiceXlsx(file);
    const rows=parsed.map(({rowNumber,values})=>({
      rowNumber,
      name:valueOf(values,'知识库名称','名称','name'),
      code:valueOf(values,'编码','code'),
      description:valueOf(values,'说明','description'),
      status:normalizeImportStatus(valueOf(values,'状态','status')||'ENABLED'),
    })).filter((item)=>item.name||item.code||item.description);
    const invalid=rows.filter((item)=>!item.name).map((item)=>item.rowNumber);
    if(invalid.length)throw new Error(`第 ${invalid.slice(0,8).join('、')}${invalid.length>8?' 等':''} 行缺少“知识库名称”`);
    if(!rows.length)throw new Error('Excel 中没有可导入知识库');
    if(rows.length>200)throw new Error(`当前文件有 ${rows.length} 个知识库；单次最多导入 200 个，请拆分文件`);
    const codes=rows.map((item)=>item.code.trim().toLowerCase()).filter(Boolean);const duplicateCodes=codes.filter((code,index)=>codes.indexOf(code)!==index);
    if(duplicateCodes.length)throw new Error(`文件内存在重复知识库编码：${[...new Set(duplicateCodes)].slice(0,5).join('、')}`);
    collectionImportRows.value=rows;collectionImportFileName.value=file.name;ElMessage.success(`已识别 ${rows.length} 个知识库`);
  }catch(error:any){collectionImportRows.value=[];collectionImportFileName.value='';ElMessage.error(error?.message||'知识库 Excel 解析失败');}finally{input.value='';}
}
async function confirmCollectionImport(){
  if(!collectionImportRows.value.length)return ElMessage.warning('请先选择并解析 Excel 文件');
  const applicability=buildCollectionImportApplicability();
  if(collectionImportRows.value.some((item)=>item.status==='ENABLED')&&!applicability.length)return ElMessage.warning('文件中包含“已启用”知识库，请至少选择一个适用店铺、客服身份或特定账号');
  const existingCodes=new Set(collections.value.map((item)=>String(item.code||'').trim().toLowerCase()).filter(Boolean));
  const conflict=collectionImportRows.value.find((item)=>item.code&&existingCodes.has(item.code.trim().toLowerCase()));
  if(conflict)return ElMessage.warning(`第 ${conflict.rowNumber} 行知识库编码“${conflict.code}”已存在，请修改模板后再导入`);
  collectionImporting.value=true;let created=0;
  try{
    for(const [index,item] of collectionImportRows.value.entries()){
      const code=item.code.trim()||`knowledge-import-${Date.now().toString(36)}-${index+1}`;
      try{await createCustomerServiceKnowledgeCollection({name:item.name.trim(),code,description:item.description.trim()||null,status:item.status,applicability});created++;}
      catch(error:any){throw new Error(`第 ${item.rowNumber} 行“${item.name}”创建失败：${error?.message||'未知错误'}。本次此前已创建 ${created} 个知识库。`);}
    }
    collectionImportDialog.value=false;await loadCollections();ElMessage.success(`知识库导入完成：已创建 ${created} 个`);
  }catch(error:any){ElMessage.error(error?.message||'知识库导入失败');await loadCollections();}finally{collectionImporting.value=false;}
}
async function downloadCollectionImportTemplate(){
  await downloadCustomerServiceXlsxTemplate({fileName:'智能客服-知识库导入模板.xlsx',sheetName:'知识库',columns:[{key:'name',label:'知识库名称',width:28},{key:'code',label:'编码',width:24},{key:'description',label:'说明',width:46},{key:'status',label:'状态',width:14}],sampleRows:[{name:'青禾售前知识库',code:'qinghe-presale',description:'商品、尺码、搭配与常见售前问题',status:'ENABLED'}],note:'关系字段不要写进 Excel。导入时在弹窗统一选择“整家店铺 / 客服身份 / 特定账号”。状态支持 ENABLED / DRAFT / DISABLED / ARCHIVED，也支持中文“已启用 / 草稿 / 已停用 / 已归档”。'});
}
function openRegularKnowledgeImport(){
  if(!collections.value.length)return ElMessage.warning('请先创建知识库，再导入常规知识');
  Object.assign(regularImportForm,{collectionId:activeCollectionId.value||collections.value[0]?.id||'',status:'ENABLED'});regularImportRows.value=[];regularImportFileName.value='';regularImportDialog.value=true;
}
function chooseRegularImportFile(){regularImportFileInput.value?.click();}
async function handleRegularImportFile(event:Event){
  const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  try{
    const rows=await parseKnowledgeFile(file);const normalized=normalizeImportedEntries(rows,true);
    regularImportRows.value=normalized.map((raw,index)=>({rowNumber:Number((raw as any).__rowNumber||index+2),title:String(raw.title||''),category:String(raw.category||'FAQ'),question:String(raw.question||''),content:String(raw.content||''),raw}));
    regularImportFileName.value=file.name;ElMessage.success(`已识别 ${regularImportRows.value.length} 条常规知识`);
  }catch(error:any){regularImportRows.value=[];regularImportFileName.value='';ElMessage.error(error?.message||'常规知识文件解析失败');}finally{input.value='';}
}
async function confirmRegularImport(){
  const collectionId=regularImportForm.collectionId;if(!collectionId)return ElMessage.warning('请选择关联知识库');if(!regularImportRows.value.length)return ElMessage.warning('请先选择并解析知识文件');
  regularImporting.value=true;try{const entriesToImport=regularImportRows.value.map((item)=>{const out={...item.raw};delete (out as any).__rowNumber;return out;});const result=await batchImportCustomerServiceKnowledge({collectionId,sourceFileName:regularImportFileName.value||'regular-knowledge-import.xlsx',status:regularImportForm.status,entries:entriesToImport});activeCollectionId.value=collectionId;regularImportDialog.value=false;ElMessage.success(`常规知识导入完成：已创建 ${result.imported} 条`);await loadCollections();await load();}catch(error:any){ElMessage.error(error?.message||'常规知识导入失败');}finally{regularImporting.value=false;}
}
async function downloadRegularKnowledgeTemplate(){
  await downloadCustomerServiceXlsxTemplate({fileName:'智能客服-常规知识导入模板.xlsx',sheetName:'常规知识',columns:[{key:'category',label:'分类',width:18},{key:'title',label:'标题',width:28},{key:'question',label:'常见问法',width:34},{key:'content',label:'知识内容',width:60},{key:'knowledgeKind',label:'知识类型',width:18},{key:'entityType',label:'实体类型',width:18},{key:'entityKey',label:'实体键/SKU',width:22},{key:'taxonomyKeys',label:'候选分类键',width:28},{key:'tags',label:'标签',width:24},{key:'aliases',label:'实体别名',width:24},{key:'authorityLevel',label:'权威类型',width:20},{key:'sourceReference',label:'来源说明',width:28},{key:'freshnessPolicy',label:'时效规则',width:30},{key:'effectiveFrom',label:'生效时间',width:24},{key:'effectiveTo',label:'失效时间',width:24},{key:'structuredData',label:'结构化字段JSON',width:42},{key:'references',label:'可分享引用JSON',width:46}],sampleRows:[{category:'FAQ',title:'售后地址修改',question:'下单后怎么修改收货地址',content:'订单未进入发货流程时，可按当前店铺已确认流程处理；实时状态仍以订单接口为准。',knowledgeKind:'FAQ',entityType:'GENERIC',entityKey:'',taxonomyKeys:'',tags:'售后,地址',aliases:'',authorityLevel:'BUSINESS_FACT',sourceReference:'人工整理',freshnessPolicy:'流程变更后重新核对',effectiveFrom:'',effectiveTo:'',structuredData:'',references:''}],note:'这是“常规知识”模板，供正常 Knowledge Retrieval / Grounding 使用。禁止填写 entityType=FIXED_QA 或 structuredData.fixedQa；需要固定答案原文直出时，请使用独立的“导入固定问答”模板。分类可用 FAQ / PRODUCT / SERVICE / SERVICE_POLICY / BRAND_FACT / ACTIVITY / DOCUMENT / REFERENCE / OTHER；知识类型可用 ENTITY / POLICY / BUSINESS_RULE / GUIDE / FAQ / REFERENCE。候选分类键用逗号分隔，必须来自显式 Target Taxonomy 定义。'});
}
async function importIndustrySample(key:string){
  const preset=industrySamples.find((item)=>item.key===key);if(!preset)return;
  try{
    const data=await loadSampleFile(preset.file);
    const matchingAccounts=findMatchingSampleAccounts(preset.accountKeywords);
    const applicability=inferSampleApplicability(matchingAccounts);
    if(!applicability.length)return ElMessage.warning('没有唯一可安全确定的适用对象。请先让目标账号明确属于一个店铺/身份，或使用“新建知识库”在创建时直接选择“适用于谁”；系统不会猜测多目标绑定');
    await ElMessageBox.confirm(`将创建并启用“${preset.label}”虚构专业知识库，并在同一次创建中保存适用对象。样例事实与链接仅用于测试，正式使用前必须替换为真实店铺数据。`,'导入默认行业知识',{type:'warning',confirmButtonText:'确认导入'});
    const sampleCollection={...(data.collection||{})};delete sampleCollection.industryCode;
    const created=await createCustomerServiceKnowledgeCollection({...sampleCollection,code:uniqueSampleCode(String(data.collection?.code||key)),applicability});
    await batchImportCustomerServiceKnowledge({collectionId:created.id,sourceFileName:preset.file,status:'ENABLED',entries:normalizeImportedEntries(data.entries||[],true)});
    await loadCollections();activeCollectionId.value=created.id;await load();ElMessage.success(`已导入 ${preset.label}，适用关系已随知识库保存`);
  }catch(error:any){ElMessage.error(error?.message||'默认行业知识导入失败');}
}
function findMatchingSampleAccounts(keywords:string[]){return props.accounts.filter((account)=>{const haystack=[account.name,account.description,account.storeProfile?.name,account.merchantRole?.name].filter(Boolean).join(' ').toLowerCase();return keywords.some((keyword)=>haystack.includes(keyword.toLowerCase()));});}
function inferSampleApplicability(accounts:CustomerServiceAccountProfile[]):CustomerServiceKnowledgeApplicabilityTarget[]{
  const storeIds=[...new Set(accounts.map((item)=>item.storeProfileId).filter(Boolean) as string[])];
  if(storeIds.length===1)return [{targetType:'STORE',targetKey:storeIds[0],priority:120,status:'ENABLED'}];
  const roleIds=[...new Set(accounts.map((item)=>item.merchantRoleId).filter(Boolean) as string[])];
  if(storeIds.length===0&&roleIds.length===1)return [{targetType:'ROLE',targetKey:roleIds[0],priority:110,status:'ENABLED'}];
  if(accounts.length===1)return [{targetType:'ACCOUNT',targetKey:accounts[0].id,priority:130,status:'ENABLED'}];
  return [];
}
function uniqueSampleCode(base:string){const existing=new Set(collections.value.map((item)=>item.code).filter(Boolean));if(!existing.has(base))return base;let index=2;while(existing.has(`${base}-${index}`))index++;return `${base}-${index}`;}
async function loadSampleFile(file:string){const base=String(import.meta.env.BASE_URL||'/').replace(/\/?$/,'/');const response=await fetch(`${base}customer-service/knowledge-samples/${file}`,{cache:'no-store'});if(!response.ok)throw new Error(`样例文件加载失败：${file}`);return response.json();}
async function parseKnowledgeFile(file:File){
  const name=file.name.toLowerCase();
  if(name.endsWith('.json')){const parsed=JSON.parse(await file.text());return Array.isArray(parsed)?parsed:Array.isArray(parsed.entries)?parsed.entries:[];}
  if(name.endsWith('.csv'))return parseCsv(await file.text());
  if(name.endsWith('.md')||name.endsWith('.markdown'))return parseMarkdown(await file.text());
  if(name.endsWith('.xlsx'))return (await parseCustomerServiceXlsx(file)).map(({rowNumber,values})=>({...values,__rowNumber:rowNumber}));
  throw new Error('当前支持 JSON、CSV、Excel、Markdown 文件');
}
function parseCsv(text:string){const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some((item)=>item.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}row.push(cell);if(row.some((item)=>item.trim()))rows.push(row);const headers=(rows.shift()||[]).map((item)=>item.replace(/^\uFEFF/,'').trim());return rows.map((values,index)=>({...Object.fromEntries(headers.map((key,column)=>[key,values[column]||''])),__rowNumber:index+2}));}
function parseMarkdown(text:string){const blocks=text.split(/^##\s+/m).map((item)=>item.trim()).filter(Boolean);return blocks.map((block,index)=>{const [heading,...rest]=block.split(/\r?\n/);return{category:'DOCUMENT',title:heading||`文档片段 ${index+1}`,content:rest.join('\n').trim(),entityType:'DOCUMENT_CHUNK',chunkIndex:index,tags:['文档导入'],__rowNumber:index+1};}).filter((item)=>item.content);}
function normalizeImportedEntries(rows:Array<Record<string,unknown>>,rejectFixedQa=false){
  const normalized=rows.map((raw,index)=>{
    const out=normalizeKnowledgeHeaderAliases(raw);
    for(const key of ['tags','aliases','taxonomyKeys']){const value=out[key];if(typeof value==='string')out[key]=value.split(/[|,，]/).map((item)=>item.trim()).filter(Boolean);}
    for(const key of ['structuredData','references']){const value=out[key];if(typeof value==='string'&&value.trim()){try{out[key]=JSON.parse(value);}catch{if(key==='structuredData')out[key]={raw:value};else out[key]=[];}}}
    if(!out.title&&out.name)out.title=out.name;if(!out.content&&(out.description||out.summary))out.content=out.description||out.summary;if(!out.category)out.category='FAQ';if(!out.entityType)out.entityType='GENERIC';if(!out.authorityLevel)out.authorityLevel='BUSINESS_FACT';if(out.chunkIndex===undefined)out.chunkIndex=index;
    return out;
  });
  if(rejectFixedQa){
    const fixed=normalized.find((out)=>String(out.entityType||'').toUpperCase()==='FIXED_QA'||Boolean(asRecord(out.structuredData).fixedQa));
    if(fixed)throw new Error(`常规知识导入检测到 FIXED_QA / fixedQa 配置（来源行 ${(fixed as any).__rowNumber||'-'}）。固定答案直出必须使用独立的“导入固定问答”入口。`);
  }
  const invalid=normalized.filter((out)=>!String(out.title||'').trim()||!String(out.content||'').trim());
  if(invalid.length)throw new Error(`常规知识存在标题或知识内容为空的记录（来源行 ${(invalid[0] as any).__rowNumber||'-'}）`);
  return normalized;
}
function normalizeKnowledgeHeaderAliases(raw:Record<string,unknown>){
  const aliases:Record<string,string>={'分类':'category','标题':'title','名称':'title','常见问法':'question','问题':'question','知识内容':'content','内容':'content','知识类型':'knowledgeKind','实体类型':'entityType','实体键/SKU':'entityKey','实体键 / SKU':'entityKey','候选分类键':'taxonomyKeys','Taxonomy Keys':'taxonomyKeys','标签':'tags','实体别名':'aliases','权威类型':'authorityLevel','来源说明':'sourceReference','时效规则':'freshnessPolicy','生效时间':'effectiveFrom','失效时间':'effectiveTo','结构化字段JSON':'structuredData','结构化字段 JSON':'structuredData','可分享引用JSON':'references','可分享引用 JSON':'references'};const out:Record<string,unknown>={};for(const [key,value] of Object.entries(raw)){out[aliases[key.trim()]||key]=value;}return out;
}
function valueOf(values:Record<string,string>,...keys:string[]){for(const key of keys){const value=String(values[key]||'').trim();if(value)return value;}return '';}
function normalizeImportStatus(value:string):CustomerServiceContextStatus{const normalized=String(value||'').trim().toUpperCase();const map:Record<string,CustomerServiceContextStatus>={'ENABLED':'ENABLED','已启用':'ENABLED','启用':'ENABLED','DRAFT':'DRAFT','草稿':'DRAFT','DISABLED':'DISABLED','已停用':'DISABLED','停用':'DISABLED','ARCHIVED':'ARCHIVED','已归档':'ARCHIVED','归档':'ARCHIVED'};return map[normalized]||map[String(value||'').trim()]||'ENABLED';}
function asRecord(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};}

function openFixedQaImport(){
  if(!collections.value.length)return ElMessage.warning('请先创建知识库，再导入固定问答');
  Object.assign(fixedQaImportForm,{collectionId:activeCollectionId.value||'',priority:200,minDelaySec:1.8,maxDelaySec:4.2,status:'ENABLED'});
  fixedQaImportRows.value=[];fixedQaImportFileName.value='';fixedQaImportDialog.value=true;
}
function chooseFixedQaImportFile(){fixedQaImportFileInput.value?.click();}
async function handleFixedQaImportFile(event:Event){
  const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  try{fixedQaImportRows.value=await parseFixedQaImportWorkbook(file);fixedQaImportFileName.value=file.name;ElMessage.success(`已识别 ${fixedQaImportRows.value.length} 条固定问答`);}catch(error:any){fixedQaImportRows.value=[];fixedQaImportFileName.value='';ElMessage.error(error?.message||'固定问答 Excel 解析失败');}finally{input.value='';}
}
async function parseFixedQaImportWorkbook(file:File):Promise<FixedQaImportRow[]>{
  const parsed=await parseCustomerServiceXlsx(file);
  const rows:FixedQaImportRow[]=[];const invalid:number[]=[];const answerByInput=new Map<string,string>();const conflicts:number[]=[];
  for(const {rowNumber,values} of parsed){
    const normalizedValues=Object.fromEntries(Object.entries(values).map(([key,value])=>[normalizeFixedQaImportHeader(key),value]));
    const inputText=valueOf(normalizedValues,'输入','input','question','问题','提问','客户问题','问法');
    const outputText=valueOf(normalizedValues,'输出','output','answer','答案','回复','固定回复','固定答案');
    if(!inputText&&!outputText)continue;
    if(!inputText||!outputText){invalid.push(rowNumber);continue;}
    const key=normalizeFixedQaImportKey(inputText);const previous=answerByInput.get(key);
    if(previous!==undefined&&previous!==outputText)conflicts.push(rowNumber);else if(previous===undefined)answerByInput.set(key,outputText);
    rows.push({rowNumber,input:inputText,output:outputText});
  }
  if(invalid.length)throw new Error(`第 ${invalid.slice(0,8).join('、')}${invalid.length>8?' 等':''} 行存在“输入/输出”缺失，请补全后再导入`);
  if(conflicts.length)throw new Error(`存在相同输入但不同输出（例如第 ${conflicts.slice(0,8).join('、')} 行）。固定直出必须确定，请先统一这些答案`);
  if(!rows.length)throw new Error('Excel 中没有可导入的“输入 → 输出”数据');
  if(rows.length>1000)throw new Error(`当前文件有 ${rows.length} 条；单次最多导入 1000 条，请拆分文件`);
  return rows;
}
async function downloadFixedQaImportTemplate(){
  await downloadCustomerServiceXlsxTemplate({
    fileName:'智能客服-固定答案直出导入模板.xlsx',sheetName:'固定问答',
    columns:[{key:'turn',label:'轮次',width:10},{key:'input',label:'输入',width:42},{key:'output',label:'输出',width:68}],
    sampleRows:[{turn:1,input:'你家有没有狗粮',output:'有的，家里一直备着狗粮，平时也会拿一点当奖励零食'}],
    note:'这是“固定答案直出”专用模板。一行创建一条 FIXED_QA；输入用于统一 FUZZY 模糊匹配，输出会在命中后原文直出并跳过模型。知识库关联、优先级、随机 Loading 和状态在导入弹窗统一选择。不要把这类记录导入“常规知识”。'
  });
}
function normalizeFixedQaImportHeader(value:unknown){return String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'');}
function normalizeFixedQaImportKey(value:unknown){return String(value??'').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu,'').trim();}
async function confirmFixedQaImport(){
  const collectionId=fixedQaImportForm.collectionId;if(!collectionId)return ElMessage.warning('请选择关联知识库');if(!fixedQaImportRows.value.length)return ElMessage.warning('请先选择并解析 Excel 文件');
  const minMs=Math.round(Math.max(.5,Math.min(8,Number(fixedQaImportForm.minDelaySec)||1.8))*1000);const maxMs=Math.round(Math.max(.5,Math.min(8,Number(fixedQaImportForm.maxDelaySec)||4.2))*1000);const loadingDelay={minMs:Math.min(minMs,maxMs),maxMs:Math.max(minMs,maxMs)};const priority=Math.max(0,Math.min(1000,Math.trunc(Number(fixedQaImportForm.priority)||0)));
  const entriesToImport=fixedQaImportRows.value.map((item,index)=>({category:'FAQ',title:item.input.slice(0,200),question:item.input,content:item.output,tags:['固定问答','批量导入'],entityType:'FIXED_QA',entityKey:null,aliases:[],structuredData:{fixedQa:{schemaVersion:2,matchType:'FUZZY',triggerPhrases:[item.input],requiredKeywords:[],excludedKeywords:[],priority,loadingDelay}},references:[],authorityLevel:'BUSINESS_FACT',sourceType:'IMPORT',sourceReference:null,freshnessPolicy:null,chunkIndex:index}));
  fixedQaImporting.value=true;try{const result=await batchImportCustomerServiceKnowledge({collectionId,sourceFileName:fixedQaImportFileName.value||'fixed-qa-import.xlsx',status:fixedQaImportForm.status,entries:entriesToImport});activeCollectionId.value=collectionId;fixedQaImportDialog.value=false;ElMessage.success(`固定问答导入完成：已创建 ${result.imported} 条知识`);await loadCollections();await load();}catch(error:any){ElMessage.error(error?.message||'固定问答导入失败');}finally{fixedQaImporting.value=false;}
}

function openPreview(){previewForm.accountId=previewForm.accountId||props.accounts[0]?.id||'';previewForm.message='';previewResults.value=[];previewDiagnostics.value=null;previewFixedQa.value=null;previewRan.value=false;previewDialog.value=true;}
async function runPreview(){const account=props.accounts.find((item)=>item.id===previewForm.accountId);if(!account||!previewForm.message.trim())return ElMessage.warning('请选择账号并输入客户问题');previewLoading.value=true;try{const payload={accountProfileId:account.id,storeProfileId:account.storeProfileId||undefined,merchantRoleId:account.merchantRoleId||undefined,message:previewForm.message.trim()};const [result,fixedQa]=await Promise.all([previewCustomerServiceKnowledge(payload),resolveCustomerServiceFixedQa(payload)]);previewResults.value=result.selected||[];previewDiagnostics.value=result.diagnostics||null;previewFixedQa.value=fixedQa;previewRan.value=true;}finally{previewLoading.value=false;}}

function onFormScopeChange(){if(form.scopeType==='COLLECTION'){form.scopeKey=activeCollectionId.value||collections.value[0]?.id||'';form.collectionId=form.scopeKey;}else{form.scopeKey=formScopeCandidates.value[0]?.value||'';form.collectionId='';}}
function open(row?:CustomerServiceKnowledgeEntry){if(row&&isFixedQa(row)){openFixedQa(row);return;}if(row){Object.assign(form,{id:row.id,revision:row.revision,scopeType:row.scopeType,scopeKey:row.scopeKey,collectionId:row.collectionId||'',category:row.category,knowledgeKind:row.knowledgeKind||'',title:row.title,question:row.question||'',content:row.content,tagsText:(row.tags||[]).join(','),entityType:row.entityType||'GENERIC',entityKey:row.entityKey||'',aliasesText:(row.aliases||[]).join(','),taxonomyKeysText:(row.taxonomyKeys||[]).join(','),structuredDataText:row.structuredData?JSON.stringify(row.structuredData,null,2):'',referencesText:row.references?.length?JSON.stringify(row.references,null,2):'',authorityLevel:row.authorityLevel||'BUSINESS_FACT',sourceType:row.sourceType,sourceReference:row.sourceReference||'',effectiveFrom:row.effectiveFrom||'',effectiveTo:row.effectiveTo||'',freshnessPolicy:row.freshnessPolicy||'',status:row.status});}else{const scopeType=activeCollectionId.value?'COLLECTION':'ACCOUNT';Object.assign(form,{id:'',revision:1,scopeType,scopeKey:activeCollectionId.value||props.accounts[0]?.id||'',collectionId:activeCollectionId.value||'',category:'FAQ',knowledgeKind:'',title:'',question:'',content:'',tagsText:'',entityType:'GENERIC',entityKey:'',aliasesText:'',taxonomyKeysText:'',structuredDataText:'',referencesText:'',authorityLevel:'BUSINESS_FACT',sourceType:'MANUAL',sourceReference:'',effectiveFrom:'',effectiveTo:'',freshnessPolicy:'',status:'ENABLED'});}dialog.value=true;}
function isFixedQa(row:CustomerServiceKnowledgeEntry){return String(row.entityType||'').toUpperCase()==='FIXED_QA';}
function fixedQaMatchTypeName(_value?:CustomerServiceFixedQaMatchType){return '模糊匹配';}
function splitFixedQaValues(value:string){return [...new Set(String(value||'').split(/[\n|｜,，]+/).map((item)=>item.trim()).filter(Boolean))];}
function fixedQaConfigOf(row:CustomerServiceKnowledgeEntry){const structured=row.structuredData&&typeof row.structuredData==='object'?row.structuredData:{};const fixedQa=(structured as any).fixedQa;return fixedQa&&typeof fixedQa==='object'?fixedQa as Record<string,any>:{};}
function openFixedQa(row?:CustomerServiceKnowledgeEntry){
  if(row){const config=fixedQaConfigOf(row);const delay=config.loadingDelay&&typeof config.loadingDelay==='object'?config.loadingDelay:{};const configuredPhrases=Array.isArray(config.triggerPhrases)?config.triggerPhrases:[];const legacyKeywords=Array.isArray(config.requiredKeywords)&&config.requiredKeywords.length?[config.requiredKeywords.join('')]:[];const triggerPhrases=[...new Set([...configuredPhrases,...legacyKeywords,row.question||''].map((item)=>String(item||'').trim()).filter(Boolean))];Object.assign(fixedQaForm,{id:row.id,revision:row.revision,scopeType:row.scopeType,scopeKey:row.scopeKey,collectionId:row.collectionId||'',title:row.title,matchType:'FUZZY' as CustomerServiceFixedQaMatchType,triggerPhrasesText:triggerPhrases.join('\n'),excludedKeywordsText:Array.isArray(config.excludedKeywords)?config.excludedKeywords.join(','):'',answer:row.content,priority:Number(config.priority??200),minDelaySec:Number(delay.minMs??1800)/1000,maxDelaySec:Number(delay.maxMs??4200)/1000,status:row.status});}
  else{const scopeType=activeCollectionId.value?'COLLECTION':'ACCOUNT';Object.assign(fixedQaForm,{id:'',revision:1,scopeType,scopeKey:activeCollectionId.value||props.accounts[0]?.id||'',collectionId:activeCollectionId.value||'',title:'',matchType:'FUZZY',triggerPhrasesText:'',excludedKeywordsText:'',answer:'',priority:200,minDelaySec:1.8,maxDelaySec:4.2,status:'ENABLED'});}
  fixedQaDialog.value=true;
}
function onFixedQaScopeChange(){if(fixedQaForm.scopeType==='COLLECTION'){fixedQaForm.scopeKey=activeCollectionId.value||collections.value[0]?.id||'';fixedQaForm.collectionId=fixedQaForm.scopeKey;}else{fixedQaForm.scopeKey=fixedQaScopeCandidates.value[0]?.value||'';fixedQaForm.collectionId='';}}
async function saveFixedQa(){
  const triggers=splitFixedQaValues(fixedQaForm.triggerPhrasesText);const excluded=splitFixedQaValues(fixedQaForm.excludedKeywordsText);
  if(!fixedQaForm.scopeKey||!fixedQaForm.title.trim()||!fixedQaForm.answer.trim())return ElMessage.warning('请填写生效对象、规则名称和固定答案');
  if(!triggers.length)return ElMessage.warning('请至少填写一个可命中的提问');
  const minMs=Math.round(Math.max(.5,Math.min(8,Number(fixedQaForm.minDelaySec)||1.8))*1000);const maxMs=Math.round(Math.max(.5,Math.min(8,Number(fixedQaForm.maxDelaySec)||4.2))*1000);const loadingDelay={minMs:Math.min(minMs,maxMs),maxMs:Math.max(minMs,maxMs)};
  const structuredData={fixedQa:{schemaVersion:2,matchType:'FUZZY',triggerPhrases:triggers,requiredKeywords:[],excludedKeywords:excluded,priority:Math.max(0,Math.min(1000,Math.trunc(Number(fixedQaForm.priority)||0))),loadingDelay}};
  const payload:any={scopeType:fixedQaForm.scopeType,scopeKey:fixedQaForm.scopeKey,collectionId:fixedQaForm.scopeType==='COLLECTION'?fixedQaForm.scopeKey:fixedQaForm.collectionId||undefined,category:'FAQ',title:fixedQaForm.title.trim(),question:triggers[0]||null,content:fixedQaForm.answer.trim(),tags:['固定问答'],entityType:'FIXED_QA',entityKey:null,aliases:[],structuredData,references:[],authorityLevel:'BUSINESS_FACT',sourceType:'MANUAL',sourceReference:null,effectiveFrom:null,effectiveTo:null,freshnessPolicy:null,status:fixedQaForm.status};
  saving.value=true;try{if(fixedQaForm.id)await updateCustomerServiceKnowledgeEntry(fixedQaForm.id,{...payload,revision:fixedQaForm.revision});else await createCustomerServiceKnowledgeEntry(payload);fixedQaDialog.value=false;ElMessage.success('固定问答已保存；相关账号/店铺/客服身份会按知识关系自动继承');await loadCollections();await load();}finally{saving.value=false;}
}

async function save(){if(!form.scopeKey||!form.title.trim()||!form.content.trim())return ElMessage.warning('请填写生效对象、标题和知识内容');let structuredData:Record<string,unknown>|undefined;let references:Array<Record<string,unknown>>|undefined;try{structuredData=form.structuredDataText.trim()?JSON.parse(form.structuredDataText):undefined;references=form.referencesText.trim()?JSON.parse(form.referencesText):undefined;}catch{return ElMessage.warning('结构化字段或引用必须是合法 JSON');}saving.value=true;try{const payload:any={scopeType:form.scopeType,scopeKey:form.scopeKey,collectionId:form.scopeType==='COLLECTION'?form.scopeKey:form.collectionId||undefined,category:form.category,knowledgeKind:form.knowledgeKind||undefined,title:form.title.trim(),question:form.question.trim()||null,content:form.content.trim(),tags:form.tagsText.split(/[,，]/).map((item)=>item.trim()).filter(Boolean),entityType:form.entityType||'GENERIC',entityKey:form.entityKey.trim()||null,aliases:form.aliasesText.split(/[,，]/).map((item)=>item.trim()).filter(Boolean),taxonomyKeys:form.taxonomyKeysText.split(/[,，]/).map((item)=>item.trim()).filter(Boolean),structuredData,references,authorityLevel:form.authorityLevel||'BUSINESS_FACT',sourceType:form.sourceType,sourceReference:form.sourceReference.trim()||null,effectiveFrom:form.effectiveFrom||null,effectiveTo:form.effectiveTo||null,freshnessPolicy:form.freshnessPolicy.trim()||null,status:form.status};if(form.id)await updateCustomerServiceKnowledgeEntry(form.id,{...payload,revision:form.revision});else await createCustomerServiceKnowledgeEntry(payload);dialog.value=false;ElMessage.success('业务知识已保存');await loadCollections();await load();}finally{saving.value=false;}}
async function remove(row:CustomerServiceKnowledgeEntry){await ElMessageBox.confirm(`确认删除“${row.title}”？删除后不会进入运行时。`,'删除业务知识',{type:'warning'});await deleteCustomerServiceKnowledgeEntry(row.id,row.revision);ElMessage.success('业务知识已删除');await loadCollections();await load();}
function scopeName(row:CustomerServiceKnowledgeEntry){if(row.scopeType==='COLLECTION')return `知识库 · ${collections.value.find((item)=>item.id===(row.collectionId||row.scopeKey))?.name||row.scopeKey}`;if(row.scopeType==='ACCOUNT')return `账号 · ${props.accounts.find((item)=>item.id===row.scopeKey)?.name||row.scopeKey}`;return `店铺 · ${props.stores.find((item)=>item.id===row.scopeKey)?.name||row.scopeKey}`;}
function categoryName(value:string){return categoryOptions.find((item)=>item.value===value)?.label||value;}
function statusName(value:string){return statusOptions.find((item)=>item.value===value)?.label||value;}
function statusType(value:string){return value==='ENABLED'?'success':value==='DRAFT'?'warning':'info';}
</script>

<style scoped>
.tab-description{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:15px;border-radius:10px;background:var(--el-fill-color-lighter);padding:12px 14px}.tab-description p,.muted,.knowledge-v2-hero p,.applicability-heading p{margin:4px 0 0;color:var(--el-text-color-secondary);font-size:12px;line-height:1.6}.knowledge-v2-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;margin-bottom:14px;border:1px solid var(--el-border-color-lighter);border-radius:12px;background:var(--el-bg-color)}.hero-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.hidden-file{display:none}.collection-bar{display:flex;align-items:center;gap:10px;margin-bottom:10px}.collection-bar>.el-select{width:min(430px,100%)}.collection-meta{font-size:12px;color:var(--el-text-color-secondary)}.applicability-strip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;border:1px solid var(--el-border-color-lighter);border-radius:10px;padding:10px 12px;background:var(--el-fill-color-extra-light)}.applicability-strip small{width:100%;color:var(--el-text-color-secondary);line-height:1.5}.applicability-strip.unbound{display:grid;border-color:var(--el-color-warning-light-5);background:var(--el-color-warning-light-9)}.applicability-strip.unbound span{color:var(--el-text-color-secondary);font-size:12px}.knowledge-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) minmax(180px,.7fr) 130px 130px auto auto auto auto;gap:10px;margin-bottom:16px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.sample-menu-item{display:flex;flex-direction:column;gap:2px;min-width:260px}.sample-menu-item span{font-size:12px;color:var(--el-text-color-secondary)}.preview-results{display:grid;gap:10px;margin-top:16px;max-height:430px;overflow:auto}.preview-results article{border:1px solid var(--el-border-color-lighter);border-radius:10px;padding:12px}.preview-results header{display:flex;align-items:center;justify-content:space-between;gap:8px}.preview-results p{margin:8px 0;font-size:13px;line-height:1.65}.preview-results small{color:var(--el-text-color-secondary)}.reference-list{display:grid;gap:3px;margin-top:8px;font-size:12px;color:var(--el-color-primary);word-break:break-all}.preview-diagnostics{display:grid;gap:10px;margin-top:16px}.preview-diagnostic-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--el-text-color-secondary);font-size:12px}.preview-diagnostic-meta span{padding:4px 8px;border-radius:6px;background:var(--el-fill-color-lighter)}.applicability-editor{margin-top:8px;border:1px solid var(--el-border-color-lighter);border-radius:12px;background:var(--el-fill-color-extra-light);padding:14px}.applicability-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.inheritance-preview{display:grid;gap:4px;border-radius:9px;background:var(--el-bg-color);padding:10px 12px}.inheritance-preview span{color:var(--el-text-color-secondary);font-size:12px;line-height:1.55}.fixed-qa-help{border-radius:9px;background:var(--el-fill-color-extra-light);padding:10px 12px;color:var(--el-text-color-secondary);font-size:12px;line-height:1.65}.fixed-qa-import-scope{display:grid;gap:7px;border:1px solid var(--el-border-color-lighter);border-radius:10px;padding:11px 12px;background:var(--el-fill-color-extra-light)}.fixed-qa-import-scope>span,.fixed-qa-import-scope>small{color:var(--el-text-color-secondary);font-size:12px;line-height:1.5}.fixed-qa-import-bindings{display:flex;gap:6px;flex-wrap:wrap}.fixed-qa-import-file,.import-file-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fixed-qa-import-file span,.import-file-actions span{color:var(--el-text-color-secondary);font-size:12px}@media(max-width:900px){.knowledge-v2-hero{align-items:flex-start;flex-direction:column}.hero-actions{justify-content:flex-start}.knowledge-toolbar,.form-grid{grid-template-columns:1fr}.collection-bar{align-items:flex-start;flex-wrap:wrap}}
</style>
