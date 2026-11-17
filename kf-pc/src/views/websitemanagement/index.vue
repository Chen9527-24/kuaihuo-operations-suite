<template>
  <div class="website-page">
    <section class="editor-commandbar">
      <div class="commandbar-copy">
        <div class="commandbar-path">官网管理 <span>/</span> 官网内容</div>
        <div class="commandbar-title-row">
          <h1>官网内容编辑器</h1>
          <span class="commandbar-badge">编辑当前内容</span>
        </div>
        <p>集中维护官网文案、素材和展示内容；保存只更新草稿，发布后才会同步到公开官网。</p>
      </div>
      <div class="hero-actions">
        <el-button v-if="websiteUrl" tag="a" :href="websiteUrl" target="_blank" rel="noopener noreferrer">打开官网</el-button>
        <el-dropdown v-if="canUpdate" trigger="click">
          <el-button>更多操作</el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item :disabled="!record?.publishedContent || loading" @click="restorePublished">恢复线上版本为草稿</el-dropdown-item>
            <el-dropdown-item :disabled="loading" @click="resetToDefaults">载入代码默认内容</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <el-button type="primary" :loading="saving" :disabled="!canUpdate || loading || !dirty" @click="saveDraft">保存草稿</el-button>
        <el-button type="success" :loading="publishing" :disabled="!canPublish || loading" @click="publishDraft">发布上线</el-button>
      </div>
    </section>

    <section class="version-grid">
      <article class="version-card">
        <span>当前状态</span><strong :class="`state-${publicationState.type}`">{{ publicationState.label }}</strong>
        <small>{{ dirty ? '页面中有修改尚未写入草稿' : '当前页面内容已安全保存' }}</small>
      </article>
      <article class="version-card">
        <span>草稿版本</span><strong>V{{ record?.draftRevision ?? 0 }}</strong>
        <small>保存草稿不会改变线上官网</small>
      </article>
      <article class="version-card">
        <span>线上版本</span><strong>V{{ record?.publishedRevision ?? 0 }}</strong>
        <small>{{ record?.publishedAt ? `发布于 ${formatDateTime(record.publishedAt)}` : '尚未从后台发布' }}</small>
      </article>
      <article class="version-card current-section-card">
        <span>正在编辑</span><strong>{{ activeTabLabel }}</strong>
        <small>内容按官网真实模块分区管理</small>
      </article>
    </section>

    <el-alert
      v-if="!record?.publishedContent"
      type="warning"
      :closable="false"
      show-icon
      title="当前没有已发布的后台配置"
      description="公开官网会继续显示项目内置内容。完成编辑后请先保存草稿，再点击“发布到官网”。"
    />
    <el-alert
      v-else
      type="info"
      :closable="false"
      show-icon
      :title="`线上版本 ${record.publishedRevision} · 草稿版本 ${record.draftRevision}${dirty ? ' · 有未保存修改' : ''}`"
      :description="record.publishedAt ? `最近发布时间：${formatDateTime(record.publishedAt)}` : '已有线上配置'"
    />

    <el-card v-loading="loading" shadow="never" class="website-editor-card">
      <el-form label-position="top" class="website-form">
      <el-tabs v-model="activeTab" tab-position="left" class="website-tabs">
        <el-tab-pane label="基础与素材" name="site">
          <EditorSection title="网站基础信息" description="标题和描述用于浏览器、搜索结果及分享；站点地址用于 canonical，正式上线前应填写完整 https 地址。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetSiteBasics">恢复本模块默认</el-button></template>
            <div class="form-grid">
              <el-form-item label="网站标题"><el-input v-model="content.site.title" :disabled="!canUpdate" maxlength="160" show-word-limit /></el-form-item>
              <el-form-item label="品牌名称"><el-input v-model="content.site.brandName" :disabled="!canUpdate" maxlength="60" /></el-form-item>
              <el-form-item label="站点地址"><el-input v-model="content.site.siteUrl" :disabled="!canUpdate" placeholder="https://www.example.com" /></el-form-item>
              <el-form-item label="网站描述" class="span-2"><el-input v-model="content.site.description" :disabled="!canUpdate" type="textarea" :rows="3" maxlength="300" show-word-limit /></el-form-item>
            </div>
          </EditorSection>
          <EditorSection title="全站素材" description="上传完成后仍需保存并发布；恢复默认只切换素材路径，不会删除服务器上已上传文件。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetSiteAssets">恢复默认素材</el-button></template>
            <div class="asset-grid">
              <el-form-item label="网站图标 / ICO"><WebsiteAssetField v-model="content.site.faviconUrl" :default-value="defaultContent.site.faviconUrl" :can-edit="canUpdate" :can-upload="canUpload" /></el-form-item>
              <el-form-item label="企业微信二维码"><WebsiteAssetField v-model="content.site.qrCodeUrl" :default-value="defaultContent.site.qrCodeUrl" :can-edit="canUpdate" :can-upload="canUpload" /></el-form-item>
            </div>
          </EditorSection>
          <EditorSection title="导航名称" description="只修改名称，不改变导航目标和页面布局。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetNavigation">恢复本模块默认</el-button></template>
            <div class="form-grid cols-4">
              <el-form-item label="解决什么"><el-input v-model="content.navigation.system" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="产品能力"><el-input v-model="content.navigation.products" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="合作方式"><el-input v-model="content.navigation.cooperation" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="联系我们"><el-input v-model="content.navigation.contact" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
        </el-tab-pane>

        <el-tab-pane label="首页首屏" name="hero">
          <EditorSection title="首屏文案" description="标题保持两行正文加一行强调语，避免破坏现有视觉比例。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetHeroCopy">恢复本模块默认</el-button></template>
            <div class="form-grid">
              <el-form-item label="眉题"><el-input v-model="content.hero.eyebrow" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="强调语"><el-input v-model="content.hero.emphasis" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题第一行"><el-input v-model="content.hero.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题第二行"><el-input v-model="content.hero.titleLines[1]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="首屏说明" class="span-2"><el-input v-model="content.hero.summary" :disabled="!canUpdate" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
              <el-form-item label="合作企业标题"><el-input v-model="content.hero.partnersTitle" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="合作企业注释"><el-input v-model="content.hero.partnersNote" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
          <EditorSection title="合作企业" description="可调整名称、图片和顺序；建议控制在 4–20 项并使用经过压缩的透明 PNG/WebP。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetPartners">恢复默认企业列表</el-button></template>
            <div class="partner-list">
              <article v-for="(partner, index) in content.hero.partners" :key="index" class="partner-card">
                <div class="partner-card-head">
                  <div class="partner-card-title"><span>{{ String(index + 1).padStart(2, '0') }}</span><b>合作企业</b></div>
                  <el-button v-if="canUpdate" link type="danger" @click="content.hero.partners.splice(index, 1)">删除</el-button>
                </div>
                <label class="compact-field-label">企业名称</label>
                <el-input v-model="partner.name" :disabled="!canUpdate" placeholder="请输入企业名称" />
                <WebsiteAssetField v-model="partner.imageUrl" :default-value="defaultPartnerImage(partner.name)" :can-edit="canUpdate" :can-upload="canUpload" />
              </article>
            </div>
            <el-button v-if="canUpdate && content.hero.partners.length < 20" class="mt-3" @click="content.hero.partners.push({ name: '', imageUrl: '' })">新增合作企业</el-button>
          </EditorSection>
        </el-tab-pane>

        <el-tab-pane label="系统介绍" name="system">
          <EditorSection title="解决什么模块" description="关闭后公开页面隐藏整个模块，导航仍会自动隐藏对应入口。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetSystemCopy">恢复本模块默认</el-button></template>
            <el-switch v-model="content.system.enabled" :disabled="!canUpdate" active-text="显示模块" inactive-text="隐藏模块" />
            <div class="form-grid mt-4">
              <el-form-item label="模块编号"><el-input v-model="content.system.kicker" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="强调标题"><el-input v-model="content.system.emphasis" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题正文"><el-input v-model="content.system.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="证据区标题"><el-input v-model="content.system.proofTitle" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="模块说明" class="span-2"><el-input v-model="content.system.summary" :disabled="!canUpdate" type="textarea" :rows="3" /></el-form-item>
              <el-form-item label="证据区说明" class="span-2"><el-input v-model="content.system.proofSummary" :disabled="!canUpdate" type="textarea" :rows="3" /></el-form-item>
            </div>
          </EditorSection>
          <EditorSection title="系统截图" description="建议上传 WebP/JPEG 并保持和现有截图相近的宽高比。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetSystemAssets">恢复默认截图</el-button></template>
            <el-form-item label="系统入口截图"><WebsiteAssetField v-model="content.system.loginImageUrl" :default-value="defaultContent.system.loginImageUrl" :can-edit="canUpdate" :can-upload="canUpload" /></el-form-item>
            <el-form-item label="后台工作台截图"><WebsiteAssetField v-model="content.system.dashboardImageUrl" :default-value="defaultContent.system.dashboardImageUrl" :can-edit="canUpdate" :can-upload="canUpload" /></el-form-item>
          </EditorSection>
        </el-tab-pane>

        <el-tab-pane label="产品能力" name="products">
          <EditorSection title="产品能力模块" description="五个入口与演示布局固定，只编辑入口名称和详情文案。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetProducts">恢复产品能力默认</el-button></template>
            <el-switch v-model="content.products.enabled" :disabled="!canUpdate" active-text="显示模块" inactive-text="隐藏模块" />
            <div class="form-grid mt-4">
              <el-form-item label="模块编号"><el-input v-model="content.products.kicker" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="强调标题"><el-input v-model="content.products.emphasis" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题正文"><el-input v-model="content.products.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="引导建议"><el-input v-model="content.products.guideRecommendation" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="模块说明" class="span-2"><el-input v-model="content.products.summary" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="入口引导" class="span-2"><el-input v-model="content.products.guideText" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
          <el-collapse class="content-collapse">
            <el-collapse-item v-for="item in content.products.items" :key="item.key" :title="`${item.no} / ${item.title}`" :name="item.key">
              <div class="form-grid">
                <el-form-item label="编号"><el-input v-model="item.no" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="能力类型"><el-input v-model="item.type" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="入口名称"><el-input v-model="item.title" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="入口摘要"><el-input v-model="item.tabSummary" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="详情说明" class="span-2"><el-input v-model="item.summary" :disabled="!canUpdate" type="textarea" :rows="3" /></el-form-item>
                <el-form-item label="最终输出" class="span-2"><el-input v-model="item.output" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
                <el-form-item label="使用边界" class="span-2"><el-input v-model="item.boundary" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>

        <el-tab-pane label="运行流程" name="workflow">
          <EditorSection title="运行流程模块" description="四个步骤及路线布局固定。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetWorkflow">恢复运行流程默认</el-button></template>
            <el-switch v-model="content.workflow.enabled" :disabled="!canUpdate" active-text="显示模块" inactive-text="隐藏模块" />
            <div class="form-grid mt-4">
              <el-form-item label="模块编号"><el-input v-model="content.workflow.kicker" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="强调标题"><el-input v-model="content.workflow.emphasis" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题正文"><el-input v-model="content.workflow.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
          <el-collapse class="content-collapse">
            <el-collapse-item v-for="(step, index) in content.workflow.steps" :key="index" :title="`${step.no} / ${step.title}`" :name="`workflow-${index}`">
              <div class="form-grid">
                <el-form-item label="编号"><el-input v-model="step.no" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="英文眉题"><el-input v-model="step.kicker" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="步骤名称"><el-input v-model="step.title" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="步骤摘要"><el-input v-model="step.tabSummary" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="详细说明" class="span-2"><el-input v-model="step.summary" :disabled="!canUpdate" type="textarea" :rows="3" /></el-form-item>
                <el-form-item v-for="(_, outputIndex) in step.outputs" :key="outputIndex" :label="`输出 ${outputIndex + 1}`"><el-input v-model="step.outputs[outputIndex]" :disabled="!canUpdate" /></el-form-item>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>

        <el-tab-pane label="合作方案" name="cooperation">
          <EditorSection title="合作方式模块" description="三栏布局固定，建议每种方案保留四项交付内容。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetCooperation">恢复合作方案默认</el-button></template>
            <el-switch v-model="content.cooperation.enabled" :disabled="!canUpdate" active-text="显示模块" inactive-text="隐藏模块" />
            <div class="form-grid mt-4">
              <el-form-item label="模块编号"><el-input v-model="content.cooperation.kicker" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="强调标题"><el-input v-model="content.cooperation.emphasis" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题正文"><el-input v-model="content.cooperation.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="模块说明"><el-input v-model="content.cooperation.summary" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
          <el-collapse class="content-collapse">
            <el-collapse-item v-for="(mode, index) in content.cooperation.modes" :key="index" :title="`${mode.no} / ${mode.name}`" :name="`mode-${index}`">
              <div class="form-grid">
                <el-form-item label="编号"><el-input v-model="mode.no" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="英文代码"><el-input v-model="mode.code" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="方案名称"><el-input v-model="mode.name" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="标题第一行"><el-input v-model="mode.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="标题第二行"><el-input v-model="mode.titleLines[1]" :disabled="!canUpdate" /></el-form-item>
                <el-form-item label="适合对象" class="span-2"><el-input v-model="mode.audience" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
                <el-form-item v-for="(_, itemIndex) in mode.deliverables" :key="itemIndex" :label="`交付 ${itemIndex + 1}`"><el-input v-model="mode.deliverables[itemIndex]" :disabled="!canUpdate" /></el-form-item>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>

        <el-tab-pane label="行动与页脚" name="footer">
          <EditorSection title="行动模块">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetCta">恢复本模块默认</el-button></template>
            <el-switch v-model="content.cta.enabled" :disabled="!canUpdate" active-text="显示模块" inactive-text="隐藏模块" />
            <div class="form-grid mt-4">
              <el-form-item label="眉题"><el-input v-model="content.cta.kicker" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="按钮"><el-input v-model="content.cta.buttonText" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="标题正文"><el-input v-model="content.cta.titleLines[0]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="强调标题"><el-input v-model="content.cta.emphasis" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
          <EditorSection title="页脚内容">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetFooter">恢复本模块默认</el-button></template>
            <div class="form-grid">
              <el-form-item label="连接能力标题"><el-input v-model="content.footer.connectionTitle" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="联系标题"><el-input v-model="content.footer.contactTitle" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="连接能力说明" class="span-2"><el-input v-model="content.footer.connectionSummary" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="联系说明" class="span-2"><el-input v-model="content.footer.contactSummary" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="联系入口文字"><el-input v-model="content.footer.contactLinkText" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="滚动口号"><el-input v-model="content.footer.slogan" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
        </el-tab-pane>

        <el-tab-pane label="联系页面" name="contact">
          <EditorSection title="页面与表单文案" description="字段结构由代码控制，后台可配置页面文案、问题选项和提交反馈。">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetContactCopy">恢复本模块默认</el-button></template>
            <div class="form-grid">
              <el-form-item label="页面标题"><el-input v-model="content.contact.pageTitle" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="表单标题"><el-input v-model="content.contact.formTitle" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="页面描述" class="span-2"><el-input v-model="content.contact.pageDescription" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="表单眉题"><el-input v-model="content.contact.formKicker" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="提交按钮"><el-input v-model="content.contact.submitText" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="隐私提示" class="span-2"><el-input v-model="content.contact.privacyNote" :disabled="!canUpdate" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="成功提示" class="span-2"><el-input v-model="content.contact.successMessage" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="扫码标题第一行"><el-input v-model="content.contact.qrTitleLines[0]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="扫码标题第二行"><el-input v-model="content.contact.qrTitleLines[1]" :disabled="!canUpdate" /></el-form-item>
              <el-form-item label="扫码说明" class="span-2"><el-input v-model="content.contact.qrNote" :disabled="!canUpdate" /></el-form-item>
            </div>
          </EditorSection>
          <EditorSection title="问题选项">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetContactOptions">恢复默认选项</el-button></template>
            <div class="option-list"><el-input v-for="(_, index) in content.contact.challengeOptions" :key="index" v-model="content.contact.challengeOptions[index]" :disabled="!canUpdate"><template #append><el-button :disabled="!canUpdate || content.contact.challengeOptions.length <= 1" @click="content.contact.challengeOptions.splice(index, 1)">删除</el-button></template></el-input></div>
            <el-button v-if="canUpdate && content.contact.challengeOptions.length < 20" class="mt-3" @click="content.contact.challengeOptions.push('')">新增选项</el-button>
          </EditorSection>
          <EditorSection title="提交后流程">
            <template #actions><el-button v-if="canUpdate" :disabled="loading || saving || publishing" class="section-reset-button" text @click="resetContactNextSteps">恢复默认流程</el-button></template>
            <div class="option-list"><el-input v-for="(_, index) in content.contact.nextSteps" :key="index" v-model="content.contact.nextSteps[index]" :disabled="!canUpdate" /></div>
          </EditorSection>
        </el-tab-pane>
      </el-tabs>
      </el-form>
    </el-card>

    <transition name="save-bar">
      <div v-if="dirty" class="sticky-save-bar">
        <div><span class="dirty-indicator"></span><strong>有未保存修改</strong><small>离开页面前请保存草稿；只有发布后线上官网才会更新。</small></div>
        <div class="sticky-actions"><el-button :loading="saving" @click="saveDraft">保存草稿</el-button><el-button type="success" :loading="publishing" @click="publishDraft">保存并发布</el-button></div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onBeforeRouteLeave } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';
import * as websiteApi from '@/api/modules/website';
import { cloneDefaultWebsiteContent, mergeWebsiteContent, type WebsiteContent } from './defaults';
import WebsiteAssetField from './WebsiteAssetField.vue';

const EditorSection = defineComponent({
  name: 'EditorSection',
  props: { title: { type: String, required: true }, description: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('section', { class: 'editor-section' }, [
      h('header', [
        h('div', { class: 'editor-section-heading' }, [
          h('strong', props.title),
          props.description ? h('p', props.description) : null
        ]),
        slots.actions ? h('div', { class: 'editor-section-actions' }, slots.actions()) : null
      ]),
      h('div', { class: 'editor-section-body' }, slots.default?.())
    ]);
  }
});

const auth = useAuthStore();
const activeTab = ref('site');
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const dirty = ref(false);
const suppressDirty = ref(true);
const record = ref<websiteApi.WebsiteConfigurationRecord | null>(null);
const defaultContent = cloneDefaultWebsiteContent();
const content = ref<WebsiteContent>(cloneDefaultWebsiteContent());

const permissions = computed(() => auth.user?.permissions || []);
const canUpdate = computed(() => auth.isPlatformAdmin || permissions.value.includes('website:config:update'));
const canPublish = computed(() => auth.isPlatformAdmin || permissions.value.includes('website:config:publish'));
const canUpload = computed(() => auth.isPlatformAdmin || permissions.value.includes('website:asset:upload'));
const websiteUrl = computed(() => /^https:\/\//i.test(content.value.site.siteUrl.trim()) ? content.value.site.siteUrl.trim() : '');
const tabLabels: Record<string, string> = { site: '基础与素材', hero: '首页首屏', system: '系统介绍', products: '产品能力', workflow: '运行流程', cooperation: '合作方案', footer: '行动与页脚', contact: '联系页面' };
const activeTabLabel = computed(() => tabLabels[activeTab.value] || '官网内容');
const publicationState = computed(() => {
  if (dirty.value) return { label: '待保存', type: 'warning' };
  if (!record.value?.publishedContent) return { label: '未发布', type: 'muted' };
  if (record.value.draftRevision > record.value.publishedRevision) return { label: '草稿待发布', type: 'primary' };
  return { label: '线上已同步', type: 'success' };
});

watch(content, () => { if (!suppressDirty.value) dirty.value = true; }, { deep: true });

onMounted(() => {
  void loadConfiguration();
  window.addEventListener('beforeunload', warnBeforeUnload);
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('当前有未保存的官网内容，确定离开并放弃这些修改吗？', '未保存修改', { type: 'warning', confirmButtonText: '放弃修改并离开', cancelButtonText: '继续编辑' });
    return true;
  } catch { return false; }
});

async function loadConfiguration() {
  loading.value = true;
  try {
    const next = await websiteApi.getWebsiteConfiguration();
    applyRecord(next);
  } finally {
    loading.value = false;
  }
}

function applyRecord(next: websiteApi.WebsiteConfigurationRecord) {
  suppressDirty.value = true;
  record.value = next;
  content.value = mergeWebsiteContent(next.draftContent || next.publishedContent);
  dirty.value = false;
  void nextTick(() => { suppressDirty.value = false; });
}

async function saveDraft() {
  if (!canUpdate.value || !record.value) return null;
  if (!validateContent()) return null;
  saving.value = true;
  try {
    const next = await websiteApi.saveWebsiteDraft(content.value, record.value.draftRevision);
    applyRecord(next);
    ElMessage.success('官网草稿已保存，线上内容尚未改变');
    return next;
  } finally {
    saving.value = false;
  }
}

async function publishDraft() {
  if (!canPublish.value || !record.value) return;
  if (!validateContent()) return;
  await ElMessageBox.confirm('发布后公开官网将在下一次加载配置时使用这些内容，确认发布？', '发布官网配置', { type: 'warning' });
  publishing.value = true;
  try {
    const saved = dirty.value ? await saveDraft() : record.value;
    if (!saved) return;
    const next = await websiteApi.publishWebsiteDraft(saved.draftRevision);
    applyRecord(next);
    ElMessage.success('官网配置已发布');
  } finally {
    publishing.value = false;
  }
}

async function restorePublished() {
  if (!record.value?.publishedContent) return;
  await ElMessageBox.confirm('将线上已发布内容复制为新的草稿？当前未保存修改会被覆盖，但线上版本不会改变。', '恢复线上版本', { type: 'warning' });
  const next = await websiteApi.restorePublishedWebsite(record.value.draftRevision);
  applyRecord(next);
  ElMessage.success('已恢复为新草稿，请确认后再发布');
}

async function resetToDefaults() {
  await ElMessageBox.confirm('载入项目当前内置内容？这只替换页面中的未保存草稿，仍需手动保存和发布。', '载入代码默认内容', { type: 'warning' });
  content.value = cloneDefaultWebsiteContent();
  dirty.value = true;
}

async function resetSection(label: string, apply: (defaults: WebsiteContent) => void) {
  if (!canUpdate.value) return;
  try {
    await ElMessageBox.confirm(
      `恢复“${label}”为代码默认内容？当前模块尚未保存的修改会被替换；不会立即保存或发布，也不会删除服务器上已上传的文件。`,
      '恢复默认内容',
      { type: 'warning', confirmButtonText: '恢复默认', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  apply(cloneDefaultWebsiteContent());
  dirty.value = true;
  ElMessage.success(`“${label}”已恢复默认，请检查后保存草稿`);
}

function resetSiteBasics() {
  return resetSection('网站基础信息', (defaults) => {
    const { faviconUrl, qrCodeUrl } = content.value.site;
    content.value.site = { ...defaults.site, faviconUrl, qrCodeUrl };
  });
}

function resetSiteAssets() {
  return resetSection('全站素材', (defaults) => {
    content.value.site.faviconUrl = defaults.site.faviconUrl;
    content.value.site.qrCodeUrl = defaults.site.qrCodeUrl;
  });
}

function resetNavigation() {
  return resetSection('导航名称', (defaults) => { content.value.navigation = defaults.navigation; });
}

function resetHeroCopy() {
  return resetSection('首屏文案', (defaults) => {
    const partners = content.value.hero.partners;
    content.value.hero = { ...defaults.hero, partners };
  });
}

function resetPartners() {
  return resetSection('合作企业', (defaults) => { content.value.hero.partners = defaults.hero.partners; });
}

function resetSystemCopy() {
  return resetSection('系统介绍', (defaults) => {
    const { loginImageUrl, dashboardImageUrl } = content.value.system;
    content.value.system = { ...defaults.system, loginImageUrl, dashboardImageUrl };
  });
}

function resetSystemAssets() {
  return resetSection('系统截图', (defaults) => {
    content.value.system.loginImageUrl = defaults.system.loginImageUrl;
    content.value.system.dashboardImageUrl = defaults.system.dashboardImageUrl;
  });
}

function resetProducts() {
  return resetSection('产品能力', (defaults) => { content.value.products = defaults.products; });
}

function resetWorkflow() {
  return resetSection('运行流程', (defaults) => { content.value.workflow = defaults.workflow; });
}

function resetCooperation() {
  return resetSection('合作方案', (defaults) => { content.value.cooperation = defaults.cooperation; });
}

function resetCta() {
  return resetSection('行动模块', (defaults) => { content.value.cta = defaults.cta; });
}

function resetFooter() {
  return resetSection('页脚内容', (defaults) => { content.value.footer = defaults.footer; });
}

function resetContactCopy() {
  return resetSection('联系页面文案', (defaults) => {
    const { challengeOptions, nextSteps } = content.value.contact;
    content.value.contact = { ...defaults.contact, challengeOptions, nextSteps };
  });
}

function resetContactOptions() {
  return resetSection('问题选项', (defaults) => { content.value.contact.challengeOptions = defaults.contact.challengeOptions; });
}

function resetContactNextSteps() {
  return resetSection('提交后流程', (defaults) => { content.value.contact.nextSteps = defaults.contact.nextSteps; });
}

function defaultPartnerImage(name: string) {
  return defaultContent.hero.partners.find((partner) => partner.name === name)?.imageUrl;
}

function validateContent() {
  const checks = [
    { value: content.value.site.title, tab: 'site', message: '请填写网站标题' },
    { value: content.value.site.brandName, tab: 'site', message: '请填写品牌名称' },
    { value: content.value.hero.titleLines.join(''), tab: 'hero', message: '请完整填写首页首屏标题' },
    { value: content.value.contact.pageTitle, tab: 'contact', message: '请填写联系页面标题' },
    { value: content.value.contact.submitText, tab: 'contact', message: '请填写联系表单提交按钮文案' }
  ];
  const invalid = checks.find((item) => !item.value.trim());
  if (!invalid) return true;
  activeTab.value = invalid.tab;
  ElMessage.warning(invalid.message);
  return false;
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
</script>

<style scoped>
.website-page {
  --website-accent: #10a65a;
  --website-accent-strong: #0d8f4d;
  --website-accent-soft: #eaf8f0;
  --website-bg: #f4f7fa;
  --website-card: #ffffff;
  --website-border: #e2e8ef;
  --website-border-strong: #d6dee8;
  --website-text: #1f2937;
  --website-text-2: #667085;
  --website-text-3: #98a2b3;
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  min-height: 100%;
  margin: 0;
  padding: 0 0 32px;
  background: var(--website-bg);
}

.editor-commandbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 20px 24px;
  border: 1px solid var(--website-border);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(16, 24, 40, .035);
}
.commandbar-copy { min-width: 0; }
.commandbar-path { color: #8a96a6; font-size: 12px; font-weight: 650; }
.commandbar-path span { padding: 0 6px; color: #c0c7d1; }
.commandbar-title-row { display: flex; align-items: center; gap: 10px; margin-top: 5px; }
.commandbar-title-row h1 { margin: 0; color: var(--website-text); font-size: 22px; font-weight: 740; line-height: 1.3; letter-spacing: -.02em; }
.commandbar-badge { padding: 4px 9px; border: 1px solid #dbe4ee; border-radius: 999px; background: #f8fafc; color: #748093; font-size: 11px; font-weight: 650; }
.commandbar-copy p { max-width: 820px; margin: 6px 0 0; color: var(--website-text-2); font-size: 13px; line-height: 1.6; }
.hero-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; }
.hero-actions :deep(.el-button) { min-width: 88px; height: 38px; border-radius: 10px; }

.version-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 16px 0;
}
.version-card {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 96px;
  align-content: center;
  gap: 6px;
  padding: 16px 18px 16px 21px;
  overflow: hidden;
  border: 1px solid var(--website-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 7px rgba(16, 24, 40, .028);
}
.version-card::before { position: absolute; top: 0; bottom: 0; left: 0; width: 4px; background: #d7dee8; content: ''; }
.version-card:first-child::before { background: var(--website-accent); }
.version-card span { color: #8793a4; font-size: 11.5px; font-weight: 650; }
.version-card strong { overflow: hidden; color: #263346; font-size: 19px; font-weight: 740; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.version-card small { overflow: hidden; color: #919cac; font-size: 11.5px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.state-warning { color: #c97c18 !important; }
.state-success { color: #15924f !important; }
.state-primary { color: #2f6db6 !important; }
.state-muted { color: #778497 !important; }

.website-page :deep(.el-alert) { margin-bottom: 16px; padding: 12px 16px; border: 1px solid #e4e9ef; border-radius: 14px; background: #f9fafb; }
.website-page :deep(.el-alert__title) { color: #596579; font-size: 13px; font-weight: 650; }
.website-page :deep(.el-alert__description) { color: #8590a0; font-size: 12px; line-height: 1.55; }

.website-editor-card {
  width: 100%;
  min-height: 720px;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.website-editor-card :deep(.el-card__body) { padding: 0; overflow: visible; }
.website-form { width: 100%; }
.website-tabs {
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr);
  width: 100%;
  min-height: 720px;
  align-items: start;
  gap: 20px;
}

.website-tabs :deep(.el-tabs__header) {
  position: sticky;
  top: 18px;
  z-index: 6;
  width: 216px;
  max-height: calc(100vh - 36px);
  margin: 0;
  padding: 17px 13px 15px;
  overflow: auto;
  border: 1px solid var(--website-border);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(16, 24, 40, .045);
}
.website-tabs :deep(.el-tabs__header)::before {
  display: block;
  margin: 0 9px 12px;
  color: #344054;
  content: '页面分区导航';
  font-size: 13px;
  font-weight: 740;
}
.website-tabs :deep(.el-tabs__header)::after {
  display: block;
  margin: 16px 5px 0;
  padding: 12px 13px;
  border: 1px solid #d9ede2;
  border-radius: 11px;
  background: #f4fbf7;
  color: #6f7e75;
  content: '编辑提示\A切换分区不会自动保存；完成修改后请保存草稿，再按需发布。';
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-line;
}
.website-tabs :deep(.el-tabs__nav-wrap::after),
.website-tabs :deep(.el-tabs__active-bar) { display: none; }
.website-tabs :deep(.el-tabs__nav-scroll),
.website-tabs :deep(.el-tabs__nav) { width: 100%; }
.website-tabs :deep(.el-tabs__nav) { float: none; }
.website-tabs :deep(.el-tabs__item) {
  position: relative;
  display: flex;
  width: 100%;
  height: 42px;
  align-items: center;
  margin: 2px 0;
  padding: 0 12px 0 31px !important;
  border-radius: 10px;
  color: #687587;
  font-size: 13px;
  font-weight: 560;
  text-align: left;
  transition: background-color .16s ease, color .16s ease, transform .16s ease;
}
.website-tabs :deep(.el-tabs__item)::before {
  position: absolute;
  left: 13px;
  width: 6px;
  height: 6px;
  border: 1px solid #b6c0cc;
  border-radius: 50%;
  background: #fff;
  content: '';
}
.website-tabs :deep(.el-tabs__item:hover) { transform: translateX(1px); background: #f6f8fa; color: #344054; }
.website-tabs :deep(.el-tabs__item.is-active) { background: var(--website-accent-soft); color: var(--website-accent-strong); font-weight: 720; }
.website-tabs :deep(.el-tabs__item.is-active)::before { border-color: var(--website-accent); background: var(--website-accent); box-shadow: 0 0 0 4px rgba(16, 166, 90, .10); }
.website-tabs :deep(.el-tabs__content) { flex: 1 1 0; width: 100%; min-width: 0; padding: 0; overflow: visible; }
.website-tabs :deep(.el-tab-pane) { width: 100%; min-width: 0; padding: 0; }

.website-form :deep(.el-form-item) { min-width: 0; margin-bottom: 0; }
.website-form :deep(.el-form-item__label) { height: auto; padding: 0 0 8px; color: #455367; font-size: 13px; font-weight: 680; line-height: 1.35; }
.website-form :deep(.el-input), .website-form :deep(.el-textarea) { width: 100%; }
.website-form :deep(.el-input__wrapper) { min-height: 44px; padding: 1px 13px; border-radius: 10px; background: #fff; box-shadow: 0 0 0 1px #d8e0e8 inset; transition: box-shadow .16s ease, background-color .16s ease; }
.website-form :deep(.el-input__inner) { color: #334155; font-size: 13px; }
.website-form :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #b8c5d2 inset; }
.website-form :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--website-accent) inset, 0 0 0 3px rgba(16, 166, 90, .085); }
.website-form :deep(.el-textarea__inner) { min-height: 104px !important; padding: 12px 13px; border-radius: 10px; background: #fff; color: #334155; font-size: 13px; line-height: 1.65; box-shadow: 0 0 0 1px #d8e0e8 inset; transition: box-shadow .16s ease; }
.website-form :deep(.el-textarea__inner:hover) { box-shadow: 0 0 0 1px #b8c5d2 inset; }
.website-form :deep(.el-textarea__inner:focus) { box-shadow: 0 0 0 1px var(--website-accent) inset, 0 0 0 3px rgba(16, 166, 90, .085); }
.website-form :deep(.el-input__count), .website-form :deep(.el-input__count-inner) { color: #99a3b0; font-size: 11px; }

/* EditorSection is a runtime child component. Use :deep() so its internal
   header/body actually receive spacing under this SFC's scoped styles. */
.website-tabs :deep(.editor-section) {
  width: 100%;
  margin: 0 0 18px;
  overflow: hidden;
  border: 1px solid var(--website-border);
  border-radius: 16px;
  background: var(--website-card);
  box-shadow: 0 3px 12px rgba(16, 24, 40, .035);
}
.website-tabs :deep(.editor-section > header) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 28px 16px;
  border-bottom: 1px solid #edf1f5;
  background: #fff;
}
.website-tabs :deep(.editor-section-heading) { min-width: 0; flex: 1 1 auto; }
.website-tabs :deep(.editor-section-heading > strong) {
  display: block;
  color: var(--website-text);
  font-size: 17px;
  font-weight: 740;
  line-height: 1.35;
  letter-spacing: -.015em;
}
.website-tabs :deep(.editor-section-heading > p) {
  max-width: 960px;
  margin: 6px 0 0;
  color: var(--website-text-2);
  font-size: 13px;
  line-height: 1.65;
}
.website-tabs :deep(.editor-section-actions) { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.section-reset-button {
  min-height: 32px;
  padding: 0 9px !important;
  border-radius: 8px;
  color: #5e6d80;
  font-size: 12px;
  font-weight: 650;
}
.section-reset-button:hover { background: #f2f7f4 !important; color: var(--website-accent-strong) !important; }
.website-tabs :deep(.editor-section-body) {
  width: 100%;
  padding: 22px 28px 28px !important;
}
.website-tabs :deep(.editor-section-body > :first-child) { margin-top: 0; }
.website-tabs :deep(.editor-section-body > :last-child) { margin-bottom: 0; }
.form-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 20px 22px; }
.form-grid > :deep(.el-form-item) { grid-column: span 6; }
.form-grid.cols-4 > :deep(.el-form-item) { grid-column: span 3; }
.span-2 { grid-column: 1 / -1 !important; }
.asset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.asset-grid :deep(.el-form-item) { min-width: 0; }
.mt-3 { margin-top: 14px; }
.mt-4 { margin-top: 18px; }

.partner-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.partner-card { display: grid; min-width: 0; gap: 12px; padding: 18px; border: 1px solid #e1e7ee; border-radius: 14px; background: #fafbfc; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.partner-card:hover { transform: translateY(-1px); border-color: #ccd7e2; box-shadow: 0 6px 16px rgba(16, 24, 40, .055); }
.partner-card-head { display: flex; min-height: 30px; align-items: center; justify-content: space-between; gap: 12px; }
.partner-card-title { display: flex; align-items: center; gap: 9px; }
.partner-card-title span { display: inline-grid; width: 31px; height: 26px; place-items: center; border-radius: 8px; background: #edf2f6; color: #748093; font-size: 11px; font-weight: 720; }
.partner-card-title b { color: #344054; font-size: 13px; font-weight: 720; }
.compact-field-label { margin-bottom: -2px; color: #556376; font-size: 12px; font-weight: 680; }

.content-collapse { margin-bottom: 18px; overflow: hidden; border: 1px solid var(--website-border); border-radius: 16px; background: #fff; box-shadow: 0 2px 8px rgba(16,24,40,.025); }
.content-collapse :deep(.el-collapse-item__header) { min-height: 52px; padding: 0 22px; border-bottom-color: #edf0f4; color: #3f4d60; font-size: 13px; font-weight: 700; }
.content-collapse :deep(.el-collapse-item__header:hover) { background: #fafbfc; }
.content-collapse :deep(.el-collapse-item__wrap) { border-bottom: 0; }
.content-collapse :deep(.el-collapse-item__content) { padding: 20px 22px 22px; background: #fbfcfd; }
.option-list { display: grid; gap: 11px; }

.sticky-save-bar {
  position: sticky;
  z-index: 30;
  bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  width: min(820px, calc(100% - 250px));
  margin: 20px 18px 0 auto;
  padding: 13px 15px 13px 17px;
  border: 1px solid #d6e0e8;
  border-radius: 14px;
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 14px 38px rgba(27, 41, 58, .15);
  backdrop-filter: blur(14px);
}
.sticky-save-bar > div:first-child { display: grid; grid-template-columns: auto auto; align-items: center; column-gap: 10px; }
.dirty-indicator { width: 8px; height: 8px; border-radius: 50%; background: #e59b32; box-shadow: 0 0 0 4px rgba(229, 155, 50, .12); }
.sticky-save-bar strong { color: #344054; font-size: 13px; }
.sticky-save-bar small { grid-column: 2; margin-top: 2px; color: #8c97a6; font-size: 11px; }
.sticky-actions { display: flex; flex: 0 0 auto; }
.save-bar-enter-active, .save-bar-leave-active { transition: all .2s ease; }
.save-bar-enter-from, .save-bar-leave-to { transform: translateY(12px); opacity: 0; }

@media (min-width: 1800px) {
  .website-tabs { grid-template-columns: 224px minmax(0, 1fr); gap: 22px; }
  .website-tabs :deep(.el-tabs__header) { width: 224px; }
  .website-tabs :deep(.editor-section > header) { padding-right: 30px; padding-left: 30px; }
  .website-tabs :deep(.editor-section-body) { padding-right: 30px !important; padding-left: 30px !important; }
}

@media (max-width: 1360px) {
  .website-page { max-width: none; padding: 0 0 28px; }
  .version-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .asset-grid, .partner-list { grid-template-columns: 1fr; }
  .form-grid.cols-4 > :deep(.el-form-item) { grid-column: span 6; }
  .editor-commandbar { align-items: flex-start; }
  .hero-actions { flex-wrap: wrap; justify-content: flex-end; }
}

@media (max-width: 1040px) {
  .website-page { padding: 0 0 24px; }
  .editor-commandbar { flex-direction: column; }
  .hero-actions { width: 100%; justify-content: flex-start; }
  .website-tabs { display: block; }
  .website-tabs :deep(.el-tabs__header) { position: static; width: 100%; max-height: none; margin: 0 0 16px; padding: 10px; }
  .website-tabs :deep(.el-tabs__header)::before, .website-tabs :deep(.el-tabs__header)::after { display: none; }
  .website-tabs :deep(.el-tabs__nav) { display: flex; width: max-content; }
  .website-tabs :deep(.el-tabs__nav-scroll) { overflow-x: auto; }
  .website-tabs :deep(.el-tabs__item) { width: auto; flex: 0 0 auto; padding: 0 14px !important; }
  .website-tabs :deep(.el-tabs__item)::before { display: none; }
  .sticky-save-bar { width: 100%; margin-right: 0; }
}

@media (max-width: 760px) {
  .version-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .form-grid > :deep(.el-form-item), .form-grid.cols-4 > :deep(.el-form-item), .span-2 { grid-column: auto !important; }
  .website-tabs :deep(.editor-section > header) { flex-direction: column; gap: 10px; padding: 18px 18px 14px; }
  .website-tabs :deep(.editor-section-actions) { width: 100%; justify-content: flex-end; }
  .website-tabs :deep(.editor-section-body) { padding: 18px !important; }
  .hero-actions :deep(.el-button) { min-width: 0; }
  .sticky-save-bar { position: relative; bottom: auto; flex-direction: column; align-items: stretch; }
  .sticky-actions { justify-content: flex-end; }
}
</style>
