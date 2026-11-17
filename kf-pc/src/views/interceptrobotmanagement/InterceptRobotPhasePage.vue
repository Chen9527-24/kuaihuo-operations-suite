<template>
  <div class="space-y-4">
    <PageToolbar title="截流机器人" description="统一管理截流机器人、主动私信机器人、捕获数据和主动私信任务队列。">
      <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-5">
        <el-form-item label="关键词" class="!mb-0">
          <el-input v-model="filters.keyword" placeholder="机器人名称 / 编号 / 账号" clearable @keyup.enter="applyCurrentFilters" />
        </el-form-item>
        <el-form-item label="平台" class="!mb-0">
          <el-select v-model="filters.platform" placeholder="全部平台" clearable>
            <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="授权状态" class="!mb-0">
          <el-select v-model="filters.authStatus" placeholder="全部状态" clearable>
            <el-option v-for="item in authStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="运行状态" class="!mb-0">
          <el-select v-model="filters.runStatus" placeholder="全部状态" clearable>
            <el-option v-for="item in runStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作" class="!mb-0">
          <div class="flex gap-2">
            <el-button type="primary" @click="applyCurrentFilters">查询</el-button>
            <el-button @click="resetCurrentFilters">重置</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #actions>
        <el-button type="primary" @click="openCreateInterceptRobot">新增截流机器人</el-button>
        <el-button type="success" @click="openCreatePrivateRobot">新增主动私信机器人</el-button>
      </template>
    </PageToolbar>

    <el-tabs v-model="activeTab" class="robot-page-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="截流机器人" name="intercept" />
      <el-tab-pane label="主动私信机器人" name="private" />
      <el-tab-pane label="捕获数据" name="captures" />
      <el-tab-pane label="提示词配置" name="prompts" />
      <el-tab-pane label="主动私信任务队列" name="tasks" />
    </el-tabs>

    <CrudTablePanel v-show="activeTab === 'intercept'" title="截流机器人" description="保留原截流机器人创建、编辑、启动、停止、扫码和删除能力。">
      <el-table v-loading="interceptLoading" :data="interceptItems" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" align="center" header-align="center" />
        <el-table-column prop="name" label="机器人名称" min-width="200" />
        <el-table-column prop="code" label="编号" min-width="120" show-overflow-tooltip />
        <el-table-column label="平台" width="120">
          <template #default="{ row }"><DictTag :value="row.platform" :options="platformOptions" /></template>
        </el-table-column>
        <el-table-column prop="accountName" label="授权账号" min-width="160" />
        <el-table-column prop="deviceName" label="执行设备" min-width="160" show-overflow-tooltip />
        <el-table-column prop="authStatus" label="授权状态" width="120">
          <template #default="{ row }"><DictTag :value="row.authStatus" :options="authStatusOptions" /></template>
        </el-table-column>
        <el-table-column prop="runStatus" label="运行状态" width="120">
          <template #default="{ row }"><DictTag :value="row.runStatus" :options="runStatusOptions" /></template>
        </el-table-column>
        <el-table-column label="过期时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.expiredAt) }}</template>
        </el-table-column>
        <el-table-column label="最近活跃" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastActiveAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditInterceptRobot(row)">编辑</el-button>
            <el-button link type="success" :disabled="!canStart(row)" @click="startRobot(row, 'intercept')">启动</el-button>
            <el-button link type="warning" :disabled="!canStop(row)" @click="stopRobot(row, 'intercept')">停止</el-button>
            <el-button link @click="refreshQr(row, 'intercept')">扫码</el-button>
            <el-button link type="danger" @click="removeInterceptRobot(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="interceptPagination.page"
          :page-size="interceptPagination.pageSize"
          :total="interceptPagination.total"
          @update:current-page="interceptPagination.page = $event; fetchInterceptRobots()"
          @update:page-size="interceptPagination.pageSize = $event; fetchInterceptRobots(true)"
        />
      </template>
    </CrudTablePanel>

    <CrudTablePanel v-show="activeTab === 'private'" title="主动私信机器人" description="管理截流线索主动私信执行配置，可暂停/恢复主动私信任务领取。">
      <el-table v-loading="privateLoading" :data="privateItems" row-key="id" stripe>
        <el-table-column type="index" label="#" width="60" align="center" header-align="center" />
        <el-table-column prop="name" label="机器人名称" min-width="180" />
        <el-table-column prop="code" label="编号" min-width="120" show-overflow-tooltip />
        <el-table-column label="平台" width="110"><template #default="{ row }"><DictTag :value="row.platform" :options="platformOptions" /></template></el-table-column>
        <el-table-column label="启用状态" width="110"><template #default="{ row }"><el-tag :type="isPrivateEnabled(row) ? 'success' : 'info'">{{ isPrivateEnabled(row) ? '已启用' : '已停用' }}</el-tag></template></el-table-column>
        <el-table-column label="执行状态" width="120"><template #default="{ row }"><DictTag :value="row.executionStatus" :options="executionStatusOptions" /></template></el-table-column>
        <el-table-column prop="todaySentCount" label="今日已发送" width="110" align="center" />
        <el-table-column prop="dailySendLimit" label="每日上限" width="100" align="center" />
        <el-table-column prop="pendingTaskCount" label="待执行任务" width="110" align="center" />
        <el-table-column label="最近领取" min-width="170"><template #default="{ row }">{{ formatDateTime(row.lastClaimedAt) }}</template></el-table-column>
        <el-table-column label="最近发送" min-width="170"><template #default="{ row }">{{ formatDateTime(row.lastSentAt) }}</template></el-table-column>
        <el-table-column label="最近活跃" min-width="170"><template #default="{ row }">{{ formatDateTime(row.lastActiveAt) }}</template></el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditPrivateRobot(row)">编辑</el-button>
            <el-button link :disabled="row.executionStatus === 'PAUSED'" @click="pausePrivateRobot(row)">暂停主动私信</el-button>
            <el-button link :disabled="row.executionStatus !== 'PAUSED'" @click="resumePrivateRobot(row)">恢复主动私信</el-button>
            <el-button link type="danger" @click="removePrivateRobot(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="privatePagination.page"
          :page-size="privatePagination.pageSize"
          :total="privatePagination.total"
          @update:current-page="privatePagination.page = $event; fetchPrivateRobots()"
          @update:page-size="privatePagination.pageSize = $event; fetchPrivateRobots(true)"
        />
      </template>
    </CrudTablePanel>

    <CrudTablePanel v-show="activeTab === 'captures'" title="捕获数据" description="展示截流机器人回传的评论/线索数据，支持勾选后创建主动私信任务。">
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-5">
        <el-input v-model="captureFilters.keyword" placeholder="评论内容 / 昵称 / 作品标题 / ID" clearable @keyup.enter="fetchCaptureList(true)" />
        <el-select v-model="captureFilters.robotId" placeholder="全部截流机器人" clearable>
          <el-option v-for="item in interceptItems" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="captureFilters.platform" placeholder="全部平台" clearable>
          <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="captureFilters.intentLevel" placeholder="全部意向等级" clearable>
          <el-option v-for="item in intentLevelOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <div class="flex gap-2">
          <el-button type="primary" @click="fetchCaptureList(true)">查询</el-button>
          <el-button @click="resetCaptureFilters">重置</el-button>
        </div>
      </div>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>已选 {{ captureSelection.length }} 条</span>
          <el-divider direction="vertical" />
          <span>字段预设</span>
          <el-select v-model="activeCaptureViewPresetId" class="!w-40" size="small" :loading="captureViewPresetLoading" @change="handleCaptureViewPresetChange">
            <el-option v-for="preset in captureViewPresets" :key="preset.id" :label="preset.name" :value="preset.id">
              <div class="flex items-center justify-between gap-3">
                <span>{{ preset.name }}</span>
                <el-tag v-if="preset.isDefault" size="small" type="success">默认</el-tag>
              </div>
            </el-option>
          </el-select>
          <el-button size="small" @click="openCaptureViewPresetDrawer">字段管理</el-button>
        </div>
        <div class="flex flex-wrap gap-2">
          <el-button @click="openAnalysisBatchDialog">意向分析批次</el-button>
          <el-button type="success" plain :disabled="capturePagination.total <= 0 || captureExportingAll" :loading="captureExportingAll" @click="exportAllCaptures">导出全部</el-button>
          <el-button type="success" plain :disabled="!captureSelection.length || captureExportingSelected" :loading="captureExportingSelected" @click="exportSelectedCaptures">导出选中</el-button>
          <el-button type="warning" plain :loading="captureReanalyzing" @click="reanalyzeFailedCaptures">提取失败数据</el-button>
          <el-button v-if="captureSelection.length" type="primary" @click="openCreateTaskDialog">创建主动私信任务</el-button>
          <el-button type="danger" plain :disabled="!captureSelection.length || captureDeleting" :loading="captureDeleting" @click="deleteSelectedCaptures">删除选中</el-button>
          <el-button type="danger" :disabled="capturePagination.total <= 0 || captureDeleting" :loading="captureDeleting" @click="clearCaptureList">一键删除</el-button>
        </div>
      </div>
      <el-table ref="captureTableRef" v-loading="captureLoading" :data="captureItems" row-key="id" stripe @selection-change="handleCaptureSelectionChange">
        <el-table-column type="selection" width="48" align="center" reserve-selection fixed="left" />
        <el-table-column type="index" label="#" width="60" align="center" header-align="center" fixed="left" />
        <template v-for="column in visibleCaptureColumns" :key="column.key">
          <el-table-column v-if="column.key === 'capturedAt'" label="捕获时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.capturedAt || row.createdAt) }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'robot'" label="机器人" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ captureRobotName(row) }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'platform'" label="平台" width="110">
            <template #default="{ row }"><DictTag :value="row.platform" :options="platformOptions" /></template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'targetType'" label="来源" width="100">
            <template #default="{ row }">{{ row.targetType || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'contentTitle'" label="作品标题" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ row.contentTitle || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'capturedCommentCount'" label="已捕获评论" width="120" align="center">
            <template #default="{ row }">
              <el-tooltip content="同一作品在系统内已保存的评论记录数，不是平台公开评论总数。" placement="top">
                <el-tag type="info">{{ row.capturedCommentCount || 1 }} 条</el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'contentUrl'" label="主页 / 作品链接" min-width="140">
            <template #default="{ row }">
              <el-link v-if="captureSourceLink(row)" :href="captureSourceLink(row)" target="_blank" rel="noreferrer" type="primary" :underline="false">查看链接</el-link>
              <span v-else>--</span>
            </template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'platformContentId'" label="作品 ID" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.platformContentId || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'commentId'" label="评论 ID" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.commentId || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'nickname'" label="评论用户" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.nickname || row.userId || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'userId'" label="评论用户 ID" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.userId || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'commentText'" label="评论内容" min-width="280" show-overflow-tooltip>
            <template #default="{ row }">{{ row.commentText || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'analysisStatus'" label="分析状态" width="120">
            <template #default="{ row }"><DictTag :value="readCaptureRaw(row, 'intentAnalysisStatus') || 'PENDING'" :options="analysisStatusOptions" /></template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'intentLevel'" label="意向等级" width="120">
            <template #default="{ row }"><DictTag :value="captureIntentLevel(row)" :options="intentLevelOptions" /></template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'intentScore'" label="意向分" width="100" align="center">
            <template #default="{ row }">{{ readCaptureRaw(row, 'intentScore') || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'shouldPrivateMessage'" label="建议私信" width="100">
            <template #default="{ row }"><el-tag :type="readCaptureRaw(row, 'shouldPrivateMessage') === 'true' ? 'success' : 'info'">{{ readCaptureRaw(row, 'shouldPrivateMessage') === 'true' ? '是' : '否' }}</el-tag></template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'entryPoint'" label="切入点" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ captureEntryPoint(row) }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'privateMessageDraft'" label="切入回复" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">{{ readCaptureRaw(row, 'privateMessageDraft') || readCaptureRaw(row, 'messageDraft') || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'visibleRegion'" label="地区" width="110">
            <template #default="{ row }">{{ row.visibleRegion || '--' }}</template>
          </el-table-column>
          <el-table-column v-else-if="column.key === 'commentTime'" label="评论时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.commentTimeIso) }}</template>
          </el-table-column>
        </template>
        <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button link type="danger" :disabled="captureDeleting" @click="deleteSingleCapture(row)">删除</el-button></template></el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="capturePagination.page"
          :page-size="capturePagination.pageSize"
          :total="capturePagination.total"
          :page-sizes="capturePageSizes"
          @update:current-page="capturePagination.page = $event; fetchCaptureList()"
          @update:page-size="capturePagination.pageSize = $event; fetchCaptureList(true)"
        />
      </template>
    </CrudTablePanel>


    <CrudTablePanel v-show="activeTab === 'prompts'" title="提示词配置" description="维护截流评论意向分析工作流参数；默认配置会在机器人下次同步捕获数据时生效。">
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-input v-model="promptFilters.keyword" placeholder="配置名称 / 业务 / 客户画像" clearable @keyup.enter="fetchPromptConfigList(true)" />
        <el-select v-model="promptFilters.status" placeholder="全部状态" clearable>
          <el-option label="启用" value="ENABLED" />
          <el-option label="禁用" value="DISABLED" />
        </el-select>
        <div class="flex gap-2">
          <el-button type="primary" @click="fetchPromptConfigList(true)">查询</el-button>
          <el-button @click="resetPromptFilters">重置</el-button>
        </div>
        <div class="flex justify-end">
          <el-button type="primary" @click="openCreatePromptConfig">新增提示词配置</el-button>
        </div>
      </div>
      <el-table v-loading="promptLoading" :data="promptItems" row-key="id" stripe>
        <el-table-column prop="name" label="配置名称" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.isDefault" type="success" size="small">默认</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="workflowId" label="工作流 ID" min-width="170" show-overflow-tooltip />
        <el-table-column prop="batchSize" label="每批条数" width="90" align="center" />
        <el-table-column prop="biz" label="业务说明" min-width="240" show-overflow-tooltip />
        <el-table-column prop="tone" label="私信语气" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">{{ row.status === 'ENABLED' ? '启用' : '禁用' }}</el-tag></template></el-table-column>
        <el-table-column label="更新时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.updatedAt || row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="success" :disabled="row.isDefault || row.status !== 'ENABLED'" @click="setDefaultPromptConfig(row)">设为默认</el-button>
            <el-button link type="primary" @click="openTestPromptConfig(row)">测试</el-button>
            <el-button link type="primary" @click="openEditPromptConfig(row)">编辑</el-button>
            <el-button link type="danger" :disabled="row.isDefault" @click="removePromptConfig(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="promptPagination.page"
          :page-size="promptPagination.pageSize"
          :total="promptPagination.total"
          @update:current-page="promptPagination.page = $event; fetchPromptConfigList()"
          @update:page-size="promptPagination.pageSize = $event; fetchPromptConfigList(true)"
        />
      </template>
    </CrudTablePanel>

    <CrudTablePanel v-show="activeTab === 'tasks'" title="主动私信任务队列" description="展示由捕获数据创建的主动私信任务，支持编辑文案、取消、重试和删除。">
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-6">
        <el-input v-model="taskFilters.keyword" placeholder="昵称 / 评论 / 作品 / 任务编号" clearable @keyup.enter="fetchTaskList(true)" />
        <el-select v-model="taskFilters.platform" placeholder="全部平台" clearable><el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-select v-model="taskFilters.robotId" placeholder="全部主动私信机器人" clearable><el-option v-for="item in privateItems" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-select v-model="taskFilters.status" placeholder="全部状态" clearable><el-option v-for="item in taskStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-select v-model="taskFilters.intentLevel" placeholder="全部意向等级" clearable><el-option v-for="item in intentLevelOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <div class="flex gap-2"><el-button type="primary" @click="fetchTaskList(true)">查询</el-button><el-button @click="resetTaskFilters">重置</el-button></div>
      </div>
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <el-date-picker v-model="taskCreatedRange" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="创建开始" end-placeholder="创建结束" class="w-full" @change="fetchTaskList(true)" />
      </div>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm text-slate-500">已选 {{ taskSelection.length }} 条</div>
        <div class="flex flex-wrap gap-2">
          <el-button type="danger" plain :disabled="!taskSelection.length || taskDeleting" :loading="taskDeleting" @click="deleteSelectedTasks">删除选中</el-button>
          <el-button type="danger" :disabled="taskPagination.total <= 0 || taskDeleting" :loading="taskDeleting" @click="clearTaskList">一键删除</el-button>
        </div>
      </div>
      <el-table ref="taskTableRef" v-loading="taskLoading" :data="taskItems" row-key="id" stripe @selection-change="handleTaskSelectionChange">
        <el-table-column type="selection" width="48" align="center" reserve-selection />
        <el-table-column prop="taskNo" label="任务编号" min-width="150" show-overflow-tooltip />
        <el-table-column prop="targetNickname" label="用户昵称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="sourceCommentText" label="用户评论" min-width="220" show-overflow-tooltip />
        <el-table-column label="意向等级" width="110"><template #default="{ row }"><DictTag :value="row.intentLevel" :options="intentLevelOptions" /></template></el-table-column>
        <el-table-column label="主动私信内容" min-width="260" show-overflow-tooltip><template #default="{ row }">{{ row.messageFinal || row.messageDraft || '--' }}</template></el-table-column>
        <el-table-column prop="robotName" label="执行机器人" min-width="150" show-overflow-tooltip />
        <el-table-column label="计划执行时间" min-width="220"><template #default="{ row }">{{ formatDateTime(row.plannedStartAt) }} - {{ formatDateTime(row.plannedEndAt) }}</template></el-table-column>
        <el-table-column label="任务状态" width="120"><template #default="{ row }"><DictTag :value="row.status" :options="taskStatusOptions" /></template></el-table-column>
        <el-table-column prop="sendAttemptCount" label="发送次数" width="100" align="center" />
        <el-table-column label="最近执行" min-width="170"><template #default="{ row }">{{ formatDateTime(row.lastSendAt || row.sentAt) }}</template></el-table-column>
        <el-table-column prop="sendError" label="失败原因" min-width="180" show-overflow-tooltip />
        <el-table-column label="创建时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewTaskDetail(row)">详情</el-button>
            <el-button link type="primary" :disabled="!canEditTaskMessage(row.status)" @click="openEditTaskMessageDialog(row)">编辑文案</el-button>
            <el-button link type="warning" :disabled="isTaskTerminal(row.status)" @click="cancelTask(row)">取消</el-button>
            <el-button link type="success" :disabled="!canRetryTask(row.status)" @click="retryTask(row)">重试</el-button>
            <el-button link type="danger" :disabled="taskDeleting" @click="deleteTask(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="taskPagination.page"
          :page-size="taskPagination.pageSize"
          :total="taskPagination.total"
          @update:current-page="taskPagination.page = $event; fetchTaskList()"
          @update:page-size="taskPagination.pageSize = $event; fetchTaskList(true)"
        />
      </template>
    </CrudTablePanel>

    <RobotFormDialog
      v-model="interceptDialogVisible"
      :mode="interceptDialogMode"
      category="INTERCEPT"
      :initial-data="currentInterceptFormData"
      :platform-options="platformOptions"
      :prompt-options="promptItems"
      :dataset-options="[]"
      :submitting="interceptSubmitting"
      :syncing-prompt="false"
      @submit="handleSubmitInterceptRobot"
    />

    <el-dialog v-model="privateDialogVisible" :title="privateDialogMode === 'create' ? '新增主动私信机器人' : '编辑主动私信机器人'" width="860px" destroy-on-close>
      <div v-if="privateDialogMode === 'create'" class="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div><div class="text-sm font-semibold text-slate-700">填入一套稳妥的主动私信测试参数</div><div class="mt-1 text-xs text-slate-500">样例默认停用并暂停领取任务，不会自动保存或发送私信。</div></div>
        <SampleFillButton label="填入主动私信样例" :has-content="privateHasUserContent" @fill="fillPrivateRobotSample" />
      </div>
      <el-form :model="privateForm" label-width="138px">
        <el-divider content-position="left">基础信息</el-divider>
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="机器人名称" required><el-input v-model="privateForm.name" placeholder="请输入机器人名称" /></el-form-item>
          <el-form-item label="平台" required><el-select v-model="privateForm.platform" class="w-full"><el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="是否启用"><el-switch v-model="privateForm.enabled" /></el-form-item>
          <el-form-item label="备注"><el-input v-model="privateForm.remark" placeholder="可选" /></el-form-item>
        </div>
        <el-collapse class="mt-2">
          <el-collapse-item title="执行配置（默认收起）" name="config">
            <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
              <el-form-item label="发送间隔最小秒"><el-input-number v-model="privateForm.minSendIntervalSeconds" :min="1" class="w-full" /></el-form-item>
              <el-form-item label="发送间隔最大秒"><el-input-number v-model="privateForm.maxSendIntervalSeconds" :min="1" class="w-full" /></el-form-item>
              <el-form-item label="允许开始时间"><el-time-picker v-model="privateForm.workStartTime" value-format="HH:mm" format="HH:mm" placeholder="09:00" class="w-full" /></el-form-item>
              <el-form-item label="允许结束时间"><el-time-picker v-model="privateForm.workEndTime" value-format="HH:mm" format="HH:mm" placeholder="22:00" class="w-full" /></el-form-item>
              <el-form-item label="休眠开始时间"><el-time-picker v-model="privateForm.sleepStartTime" value-format="HH:mm" format="HH:mm" placeholder="可选" class="w-full" /></el-form-item>
              <el-form-item label="休眠结束时间"><el-time-picker v-model="privateForm.sleepEndTime" value-format="HH:mm" format="HH:mm" placeholder="可选" class="w-full" /></el-form-item>
              <el-form-item label="每日发送上限"><el-input-number v-model="privateForm.dailySendLimit" :min="1" class="w-full" /></el-form-item>
              <el-form-item label="每小时发送上限"><el-input-number v-model="privateForm.hourlySendLimit" :min="1" class="w-full" /></el-form-item>
              <el-form-item label="同用户触达间隔天"><el-input-number v-model="privateForm.userTouchIntervalDays" :min="0" class="w-full" /></el-form-item>
              <el-form-item label="连续失败暂停阈值"><el-input-number v-model="privateForm.maxConsecutiveFailures" :min="1" class="w-full" /></el-form-item>
              <el-form-item label="每轮领取数量"><el-input-number v-model="privateForm.claimBatchSize" :min="1" :max="20" class="w-full" /></el-form-item>
            </div>
            <el-form-item label="默认主动私信文案"><el-input v-model="privateForm.defaultMessageTemplate" type="textarea" :rows="3" placeholder="捕获数据没有 AI 主动私信文案时使用" /></el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="privateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="privateSubmitting" @click="submitPrivateRobot">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskDialogVisible" title="创建主动私信任务" width="980px" destroy-on-close>
      <div class="space-y-5">
        <section>
          <div class="mb-2 text-sm font-semibold">已选主动私信任务数据</div>
          <div class="flex flex-wrap gap-2">
            <el-tag v-for="item in captureSelection" :key="item.id" type="success" effect="light" @click="selectedCaptureDetail = item">{{ item.nickname || item.userId || item.id }}</el-tag>
          </div>
          <el-card v-if="selectedCaptureDetail" class="mt-3" shadow="never">
            <div class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <div>用户昵称：{{ selectedCaptureDetail.nickname || '--' }}</div>
              <div>用户主页链接：{{ selectedCaptureDetail.homepageUrl || selectedCaptureDetail.targetUrl || '--' }}</div>
              <div>用户评论：{{ selectedCaptureDetail.commentText || '--' }}</div>
              <div>评论时间：{{ formatDateTime(selectedCaptureDetail.commentTimeIso) }}</div>
              <div>评论地区：{{ selectedCaptureDetail.visibleRegion || '--' }}</div>
              <div>作品名称：{{ selectedCaptureDetail.contentTitle || selectedCaptureDetail.platformContentId || '--' }}</div>
              <div>作品链接：{{ selectedCaptureDetail.contentUrl || '--' }}</div>
              <div>意向等级：{{ readCaptureRaw(selectedCaptureDetail, 'intentLevel') || '--' }}</div>
              <div>意向分：{{ readCaptureRaw(selectedCaptureDetail, 'intentScore') || '--' }}</div>
              <div class="md:col-span-2">切入点 / 不建议切入原因：{{ readCaptureRaw(selectedCaptureDetail, 'entryPointSummary') || readCaptureRaw(selectedCaptureDetail, 'intentReason') || '--' }}</div>
              <div>AI 风险等级：{{ readCaptureRaw(selectedCaptureDetail, 'aiRiskLevel') || readCaptureRaw(selectedCaptureDetail, 'riskLevel') || '--' }}</div>
              <div class="md:col-span-2">
                <div class="mb-1">主动私信内容（可编辑）：</div>
                <el-input v-model="selectedTaskMessage" type="textarea" :rows="3" maxlength="1000" show-word-limit />
              </div>
            </div>
          </el-card>
        </section>
        <section>
          <div class="mb-2 text-sm font-semibold">主动私信执行时间范围</div>
          <el-date-picker v-model="taskPlannedRange" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="计划开始" end-placeholder="计划结束" class="w-full" />
        </section>
        <section>
          <div class="mb-2 text-sm font-semibold">选择主动私信机器人</div>
          <el-select v-model="taskRobotId" class="w-full" filterable placeholder="请选择一个主动私信机器人">
            <el-option v-for="item in privateItems" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </section>
      </div>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="taskCreating" @click="submitCreateTasks">创建任务</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskMessageDialogVisible" title="编辑主动私信文案" width="620px" destroy-on-close>
      <el-input v-model="taskMessageForm" type="textarea" :rows="6" maxlength="1000" show-word-limit placeholder="请输入要发送给用户的主动私信内容" />
      <template #footer>
        <el-button @click="taskMessageDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="taskMessageSubmitting" @click="submitTaskMessageEdit">保存</el-button>
      </template>
    </el-dialog>


    <el-dialog v-model="promptDialogVisible" :title="promptDialogMode === 'create' ? '新增提示词配置' : '编辑提示词配置'" width="980px" :close-on-click-modal="false" destroy-on-close>
      <div class="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
        这里的字段会作为变量传给 Coze 工作流，适合按账号、行业、客户画像分别配置。保存前可以先测试当前填写内容，不会写入捕获数据；Coze 只做通用托底，行业判断以这里的配置为准。
      </div>
      <div class="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center">
        <span class="text-sm font-medium text-slate-700">默认场景回填</span>
        <el-select v-model="selectedPromptPresetKey" class="md:w-80" placeholder="选择默认提示词场景">
          <el-option v-for="item in interceptPromptPresets" :key="item.key" :label="item.label" :value="item.key" />
        </el-select>
        <el-button @click="applySelectedPromptPreset">回填当前表单</el-button>
        <span class="text-xs text-slate-500">回填后可继续手动修改，保存后才生效。</span>
      </div>
      <el-form :model="promptForm" label-width="132px">
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="配置名称" required><el-input v-model="promptForm.name" placeholder="请输入配置名称" /></el-form-item>
          <el-form-item label="工作流 ID"><el-input v-model="promptForm.workflowId" placeholder="填写自己的工作流 ID" /></el-form-item>
          <el-alert v-if="!promptForm.workflowId?.trim()" class="md:col-span-2" type="warning" :closable="false" show-icon title="请填写自己的工作流 ID；留空将使用后端默认工作流，请先在后端完成对应配置。" />
          <el-form-item label="每批条数"><el-input-number v-model="promptForm.batchSize" :min="1" :max="20" class="w-full" /></el-form-item>
          <el-form-item label="平台参数"><el-input v-model="promptForm.platform" placeholder="douyin" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="promptForm.status" class="w-full"><el-option label="启用" value="ENABLED" /><el-option label="禁用" value="DISABLED" /></el-select></el-form-item>
          <el-form-item label="设为默认"><el-switch v-model="promptForm.isDefault" /></el-form-item>
        </div>
        <el-form-item label="描述"><el-input v-model="promptForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="业务说明"><el-input v-model="promptForm.biz" type="textarea" :rows="3" maxlength="2000" show-word-limit /></el-form-item>
        <el-form-item label="目标客户"><el-input v-model="promptForm.cust" type="textarea" :rows="3" maxlength="2000" show-word-limit /></el-form-item>
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="账号类型"><el-input v-model="promptForm.acctType" /></el-form-item>
          <el-form-item label="视频标题"><el-input v-model="promptForm.videoTitle" /></el-form-item>
        </div>
        <el-form-item label="账号定位"><el-input v-model="promptForm.acctPos" type="textarea" :rows="3" maxlength="2000" show-word-limit /></el-form-item>
        <el-form-item label="私信语气"><el-input v-model="promptForm.tone" type="textarea" :rows="3" maxlength="2000" show-word-limit /></el-form-item>
        <el-form-item label="卖点"><el-input v-model="promptForm.sellPts" type="textarea" :rows="2" maxlength="2000" show-word-limit /></el-form-item>
        <el-form-item label="禁用规则"><el-input v-model="promptForm.banRules" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
        <el-form-item label="非客户定义"><el-input v-model="promptForm.nonCust" type="textarea" :rows="2" maxlength="2000" show-word-limit /></el-form-item>
        <el-form-item label="私信规则"><el-input v-model="promptForm.dmRule" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
        <el-form-item label="切入规则"><el-input v-model="promptForm.entryRules" type="textarea" :rows="2" maxlength="2000" show-word-limit /></el-form-item>

        <el-collapse v-model="promptAdvancedPanels" class="mb-2">
          <el-collapse-item name="fourNode" title="业务档案高级配置（用于动态提示词）">
            <div class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              这里维护业务档案、关键词、非线索和安全约束，用于旧评论意向分析工作流动态判断；作品是否继续执行已由独立工作流处理。
            </div>
            <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
              <el-form-item label="客户名称"><el-input v-model="promptForm.clientName" placeholder="例如：老粥工业降温 / 默认截流工具" /></el-form-item>
              <el-form-item label="主营业务"><el-input v-model="promptForm.mainBusiness" placeholder="例如：工业车间降温设备" /></el-form-item>
              <el-form-item label="主营产品"><el-input v-model="promptForm.mainProducts" type="textarea" :rows="2" placeholder="多个用逗号分隔" /></el-form-item>
              <el-form-item label="目标场景"><el-input v-model="promptForm.targetScenarios" type="textarea" :rows="2" placeholder="多个用逗号分隔" /></el-form-item>
              <el-form-item label="客户痛点"><el-input v-model="promptForm.customerPainPoints" type="textarea" :rows="2" placeholder="多个用逗号分隔" /></el-form-item>
              <el-form-item label="高意向词"><el-input v-model="promptForm.highIntentKeywords" type="textarea" :rows="2" placeholder="多少钱,报价,怎么联系" /></el-form-item>
              <el-form-item label="正向关键词"><el-input v-model="promptForm.positiveKeywords" type="textarea" :rows="2" placeholder="多个用逗号分隔" /></el-form-item>
              <el-form-item label="排除关键词"><el-input v-model="promptForm.negativeKeywords" type="textarea" :rows="2" placeholder="多个用逗号分隔" /></el-form-item>
              <el-form-item label="非线索信号"><el-input v-model="promptForm.nonLeadSignals" type="textarea" :rows="2" placeholder="同行打卡,互粉,招聘,求职" /></el-form-item>
              <el-form-item label="允许资料"><el-input v-model="promptForm.allowedOffers" type="textarea" :rows="2" placeholder="报价单,实拍视频,配置方案" /></el-form-item>
              <el-form-item label="账号人设"><el-input v-model="promptForm.accountPersona" type="textarea" :rows="2" placeholder="例如：源头工厂技术员" /></el-form-item>
              <el-form-item label="禁止承诺"><el-input v-model="promptForm.forbiddenClaims" type="textarea" :rows="2" placeholder="绝对最低价,保证效果,百分百有效" /></el-form-item>
            </div>
            <el-form-item label="CTA 策略"><el-input v-model="promptForm.ctaPolicy" type="textarea" :rows="2" placeholder='例如：{"allow_wechat":false,"default_cta":"先在私信里发参考资料"}' /></el-form-item>
            <el-form-item label="视频文案"><el-input v-model="promptForm.videoDesc" type="textarea" :rows="2" maxlength="2000" show-word-limit /></el-form-item>
            <el-form-item label="作品上下文规则"><el-input v-model="promptForm.videoRelevanceRules" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
            <el-form-item label="评论分析规则"><el-input v-model="promptForm.commentScoringRules" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
            <el-form-item label="安全规避规则"><el-input v-model="promptForm.riskRoutingRules" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
            <el-form-item label="私信生成规则"><el-input v-model="promptForm.scriptGenerationRules" type="textarea" :rows="3" maxlength="3000" show-word-limit /></el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="promptDialogVisible = false">取消</el-button>
        <el-button @click="openTestPromptConfigFromForm">测试当前填写效果</el-button>
        <el-button type="primary" :loading="promptSubmitting" @click="submitPromptConfig">保存</el-button>
      </template>
    </el-dialog>

    <InterceptIntentPromptTestDrawer
      v-model="promptTestDrawerVisible"
      :prompt-config="promptTestConfig"
      :robots="interceptItems"
    />

    <el-dialog v-model="analysisBatchDialogVisible" title="失败数据重析批次" width="1100px" destroy-on-close>
      <div class="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">这里只展示通过“提取失败数据”生成的待重试批次；提取动作只建批次，不会自动分析，必须点击单行重试或全部重试后才会发起分析。</div>
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <el-select v-model="analysisBatchFilters.robotId" placeholder="全部截流机器人" clearable>
          <el-option v-for="item in interceptItems" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="analysisBatchFilters.status" placeholder="全部状态" clearable>
          <el-option v-for="item in retryBatchStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <div class="flex gap-2">
          <el-button type="primary" @click="fetchAnalysisBatchList(true)">查询</el-button>
          <el-button @click="resetAnalysisBatchFilters">重置</el-button>
        </div>
        <div class="flex justify-end">
          <el-button type="warning" plain :disabled="!analysisBatchItems.some(canRetryAnalysisBatch)" :loading="analysisBatchRetryingAll" @click="retryAllAnalysisBatches">全部重试</el-button>
        </div>
      </div>
      <el-table v-loading="analysisBatchLoading" :data="analysisBatchItems" row-key="id" stripe>
        <el-table-column prop="batchNo" label="批次号" min-width="170" show-overflow-tooltip />
        <el-table-column label="机器人" min-width="150" show-overflow-tooltip><template #default="{ row }">{{ interceptItems.find((item) => item.id === row.robotId)?.name || row.robotId || '--' }}</template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><DictTag :value="row.status" :options="retryBatchStatusOptions" /></template></el-table-column>
        <el-table-column prop="totalCount" label="总数" width="80" align="center" />
        <el-table-column prop="successCount" label="成功" width="80" align="center" />
        <el-table-column prop="failedCount" label="待/失败" width="90" align="center" />
        <el-table-column prop="batchSize" label="子批大小" width="100" align="center" />
        <el-table-column label="提示词配置" min-width="150" show-overflow-tooltip><template #default="{ row }">{{ row.promptConfigName || row.promptConfigId || '--' }}</template></el-table-column>
        <el-table-column label="失败原因" min-width="220" show-overflow-tooltip><template #default="{ row }">{{ firstAnalysisError(row) || row.errorMessage || '--' }}</template></el-table-column>
        <el-table-column label="创建时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button link type="primary" :loading="analysisBatchRetryingId === row.id" :disabled="!canRetryAnalysisBatch(row) || analysisBatchRetryingAll" @click="retryAnalysisBatch(row)">重试</el-button></template></el-table-column>
      </el-table>
      <template #footer>
        <CrudPaginationBar
          :current-page="analysisBatchPagination.page"
          :page-size="analysisBatchPagination.pageSize"
          :total="analysisBatchPagination.total"
          @update:current-page="analysisBatchPagination.page = $event; fetchAnalysisBatchList()"
          @update:page-size="analysisBatchPagination.pageSize = $event; fetchAnalysisBatchList(true)"
        />
      </template>
    </el-dialog>
    <el-drawer v-model="captureViewPresetDrawerVisible" title="捕获数据字段管理" direction="rtl" size="min(480px, 94vw)" destroy-on-close>
      <div class="space-y-4">
        <el-alert title="字段显示、顺序和预设只作用于当前登录账号与当前租户；导出始终保留完整字段。" type="info" :closable="false" show-icon />
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-slate-600">当前预设</span>
          <el-select v-model="activeCaptureViewPresetId" class="flex-1 min-w-48" :loading="captureViewPresetLoading" @change="handleCaptureViewPresetChange">
            <el-option v-for="preset in captureViewPresets" :key="preset.id" :label="preset.name" :value="preset.id">
              <div class="flex items-center justify-between gap-3">
                <span>{{ preset.name }}</span>
                <el-tag v-if="preset.isDefault" size="small" type="success">默认</el-tag>
              </div>
            </el-option>
          </el-select>
          <el-button plain @click="saveCaptureViewAsPreset">另存为</el-button>
        </div>
        <div class="flex flex-wrap gap-2">
          <el-button :disabled="!activeCaptureViewPresetId || captureViewPresetSaving" :loading="captureViewPresetSaving" type="primary" @click="saveCurrentCaptureViewPreset">保存当前预设</el-button>
          <el-button :disabled="!activeCaptureViewPresetId || currentCaptureViewPreset?.isDefault" @click="setCurrentCaptureViewPresetAsDefault">设为默认</el-button>
          <el-button @click="restoreDefaultCaptureColumns">恢复默认字段</el-button>
          <el-button type="danger" plain :disabled="captureViewPresets.length <= 1 || !activeCaptureViewPresetId" @click="removeCurrentCaptureViewPreset">删除预设</el-button>
        </div>
        <div class="rounded-md border border-slate-200">
          <div class="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm text-slate-500">
            <span>显示字段与排列顺序</span>
            <span>共 {{ captureViewColumnDraft.filter((item) => item.visible).length }} 个显示字段</span>
          </div>
          <div v-for="(column, index) in captureViewColumnDraft" :key="column.key" class="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
            <span class="w-6 text-center text-xs text-slate-400">{{ index + 1 }}</span>
            <el-checkbox v-model="column.visible" class="flex-1">{{ captureColumnLabel(column.key) }}</el-checkbox>
            <el-button text size="small" :disabled="index === 0" @click="moveCaptureViewColumn(index, -1)">上移</el-button>
            <el-button text size="small" :disabled="index === captureViewColumnDraft.length - 1" @click="moveCaptureViewColumn(index, 1)">下移</el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import ExcelJS from 'exceljs';
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus';
import * as robotsApi from '@/api/modules/robots';
import DictTag from '@/components/common/DictTag.vue';
import PageToolbar from '@/components/common/PageToolbar.vue';
import SampleFillButton from '@/components/common/SampleFillButton.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import { formatDateTime } from '@/utils/format';
import RobotFormDialog from '../robotmanagement/components/RobotFormDialog.vue';
import InterceptIntentPromptTestDrawer from './components/InterceptIntentPromptTestDrawer.vue';
import { DEFAULT_INTERCEPT_CONFIG, ROBOT_AUTH_STATUS_OPTIONS, ROBOT_DEFAULT_FORM, ROBOT_PLATFORM_OPTIONS, ROBOT_RUN_STATUS_OPTIONS } from '../robotmanagement/constants';
import { normalizeRuntimePolicy } from '../robotmanagement/runtimePolicy';
import type { RobotManagementFormModel } from '../robotmanagement/types';

interface UiRobotItem extends robotsApi.RobotItem {
  accountName: string;
  deviceName: string;
  authStatus: string;
  runStatus: string;
  expiredAt: string;
  lastActiveAt: string;
  executionStatus?: string;
}

type TabName = 'intercept' | 'private' | 'captures' | 'prompts' | 'tasks';

const platformOptions = ROBOT_PLATFORM_OPTIONS;
const authStatusOptions = ROBOT_AUTH_STATUS_OPTIONS;
const runStatusOptions = ROBOT_RUN_STATUS_OPTIONS;
const executionStatusOptions = [
  { label: '空闲', value: 'IDLE', color: 'gray' },
  { label: '领取任务中', value: 'CLAIMING', color: 'blue' },
  { label: '发送中', value: 'SENDING', color: 'green' },
  { label: '休眠中', value: 'SLEEPING', color: 'orange' },
  { label: '已暂停', value: 'PAUSED', color: 'orange' },
  { label: '异常', value: 'ERROR', color: 'red' }
];
const taskStatusOptions = [
  { label: '待执行', value: 'PENDING', color: 'gray' },
  { label: '等待执行时间', value: 'WAITING_WINDOW', color: 'blue' },
  { label: '已领取', value: 'CLAIMED', color: 'blue' },
  { label: '执行中', value: 'RUNNING', color: 'blue' },
  { label: '已发送', value: 'SENT', color: 'green' },
  { label: '发送失败', value: 'FAILED', color: 'red' },
  { label: '已跳过', value: 'SKIPPED', color: 'gray' },
  { label: '已拦截', value: 'BLOCKED', color: 'red' },
  { label: '已取消', value: 'CANCELED', color: 'gray' },
  { label: '已过期', value: 'EXPIRED', color: 'orange' }
];
const analysisStatusOptions = [
  { label: '待分析', value: 'PENDING', color: 'gray' },
  { label: '分析中', value: 'RUNNING', color: 'blue' },
  { label: '已完成', value: 'SUCCEEDED', color: 'green' },
  { label: '部分失败', value: 'PARTIAL_FAILED', color: 'orange' },
  { label: '失败', value: 'FAILED', color: 'red' },
  { label: '已跳过', value: 'SKIPPED', color: 'gray' }
];

const retryBatchStatusOptions = [
  { label: '待重试', value: 'PENDING', color: 'gray' },
  { label: '重析中', value: 'RUNNING', color: 'blue' },
  { label: '重析完成', value: 'SUCCEEDED', color: 'green' },
  { label: '仍有失败', value: 'PARTIAL_FAILED', color: 'orange' },
  { label: '重析失败', value: 'FAILED', color: 'red' },
  { label: '已跳过', value: 'SKIPPED', color: 'gray' }
];

const intentLevelOptions = [
  { label: 'S 强意向', value: 'S', color: 'danger' },
  { label: 'A 中强意向', value: 'A', color: 'warning' },
  { label: 'B 中等意向', value: 'B', color: 'primary' },
  { label: 'C 低意向', value: 'C', color: 'info' },
  { label: 'D 无意向', value: 'D', color: 'gray' }
];
const capturePageSizes = [10, 20, 50, 100, 200, 500, 1000];
const CAPTURE_EXPORT_PAGE_SIZE = 1000;

const BUILTIN_CAPTURE_VIEW_PRESET_ID = '__builtin_default__';

const CAPTURE_COLUMN_DEFINITIONS: Array<{ key: string; label: string; visible: boolean }> = [
  { key: 'capturedAt', label: '捕获时间', visible: true },
  { key: 'platform', label: '平台', visible: true },
  { key: 'contentTitle', label: '作品标题', visible: true },
  { key: 'capturedCommentCount', label: '已捕获评论数', visible: true },
  { key: 'nickname', label: '评论用户', visible: true },
  { key: 'commentText', label: '评论内容', visible: true },
  { key: 'analysisStatus', label: '分析状态', visible: true },
  { key: 'intentLevel', label: '意向等级', visible: true },
  { key: 'shouldPrivateMessage', label: '建议私信', visible: true },
  { key: 'robot', label: '机器人', visible: false },
  { key: 'targetType', label: '来源', visible: false },
  { key: 'contentUrl', label: '主页 / 作品链接', visible: false },
  { key: 'platformContentId', label: '作品 ID', visible: false },
  { key: 'commentId', label: '评论 ID', visible: false },
  { key: 'userId', label: '评论用户 ID', visible: false },
  { key: 'intentScore', label: '意向分', visible: false },
  { key: 'entryPoint', label: '切入点', visible: false },
  { key: 'privateMessageDraft', label: '切入回复', visible: false },
  { key: 'visibleRegion', label: '地区', visible: false },
  { key: 'commentTime', label: '评论时间', visible: false },
];


const DEFAULT_INTERCEPT_INTENT_PROMPT_FORM: robotsApi.InterceptIntentPromptConfigPayload = {
  name: '默认评论意向分析提示词',
  description: '系统内置默认配置，来源于“评论意向分析 - 扣子请求方式.md”的工作流参数。',
  workflowId: '',
  batchSize: 20,
  biz: '我们提供抖音竞品截流工具，支持监听指定账号、采集作品评论、识别潜在线索，并辅助生成自然切入回复，帮助运营人员从竞品或行业账号评论区发现潜在客户。',
  cust: '有抖音获客需求的商家、私域运营团队、本地生活商家、教育培训机构、招商加盟团队、短视频运营团队、销售获客团队。',
  acctType: '竞品账号',
  acctPos: '该账号主要发布抖音获客、评论截流、私域转化、短视频运营相关内容，评论区可能出现想找工具、想学方法、想提升获客效率、想解决线索筛选问题的用户。',
  tone: '主动、自然、像陌生人冷启动私信，有一点销售感但不油腻；先用真实样例和效果吸引，不急着问价格，不冒充作者，不夸大承诺。',
  sellPts: '监听指定账号,采集作品评论,识别潜在线索,生成自然切入回复,辅助运营跟进,减少人工筛选成本',
  banRules: '不能说看到你提到价格和试用,不能说你是想先了解价格还是看试用效果,不能一上来报价,不能冒充视频作者,不能冒充账号客服,不能说是在竞品下面看到的,不能承诺百分百转化,不能保证成交,不能说全网最低价,不能夸大收益,不能诱导违规操作',
  nonCust: '纯围观用户、玩梗用户、无业务需求用户、广告引流号、辱骂攻击用户、违规内容发布者、和抖音获客完全无关的评论用户。',
  dmRule: '这是主动私信触达场景。S/A 级优先引导看真实线索样例或实际筛选效果；不要一上来聊价格、报价、套餐；少问问题，先给用户一个愿意回复的理由；C/D 不主动触达。',
  entryRules: '工具方案切入,样例效果切入,问题诊断切入,成本效率切入,行业样例切入,不建议切入',
  videoTitle: '如何通过竞品评论区找到精准客户，并用工具提升线索筛选效率',
  platform: 'douyin',
  clientName: '默认抖音截流工具',
  mainBusiness: '抖音竞品评论截流与潜在线索筛选工具',
  mainProducts: '竞品账号监听,作品评论采集,评论线索识别,自然切入私信开场,线索样例展示',
  targetScenarios: '竞品评论区获客,行业账号评论区找客户,运营人员批量筛线索,销售团队主动私信触达',
  customerPainPoints: '评论太多人工筛选慢,不知道哪些评论值得跟进,主动私信开场容易突兀,竞品评论区潜在线索容易漏掉',
  positiveKeywords: '竞品截流,评论截流,获客,线索,私域,工具,试用,怎么做,多少钱,合作,评论太多',
  negativeKeywords: '无关广告,辱骂,违规,纯玩梗,刷屏,招聘求职,同行打卡,互粉',
  highIntentKeywords: '多少钱,报价,怎么联系,怎么合作,能试用吗,有工具吗,有链接吗,可以发我吗,怎么做',
  nonLeadSignals: '同行打卡,互粉,招聘,求职,学习围观,吃瓜,哈哈哈,666,路过,广告引流,辱骂攻击',
  allowedOffers: '真实线索样例,实际筛选效果,工具演示,试用说明,配置建议',
  accountPersona: '看到对方评论后，手上刚好有相关工具、样例、演示或经验的人；不冒充作者或官方客服。',
  forbiddenClaims: '不能承诺保证成交,不能承诺保证转化,不能说百分百有效,不能说全网最低价,不能冒充作者,不能说在竞品评论区看到你',
  ctaPolicy: '{"allow_wechat":false,"default_cta":"先给对方看真实样例或实际筛选效果"}',
  workflowMode: 'dynamic_pc_config',
  videoDesc: '',
  videoRelevanceRules: '作品已由独立工作流做是否继续执行判定；评论分析时仍需结合 videoTitle/videoDesc，不能脱离作品上下文。',
  commentScoringRules: '评论意向必须绑定作品上下文和目标业务；不能只因“多少钱/怎么联系”等泛词直接判高意向。',
  riskRoutingRules: '风险与禁止承诺直接合并到评论分析提示词中处理；命中高风险、非客户或禁用规则时 should=false。',
  scriptGenerationRules: '只对 should=true 的评论生成陌生人冷启动私信；should=false 时 reply 必须为空。',
  isDefault: true,
  status: 'ENABLED'
};


const interceptPromptPresets: Array<{ key: string; label: string; payload: robotsApi.InterceptIntentPromptConfigPayload }> = [
  { key: 'douyin_intercept_tool', label: '抖音竞品截流工具（当前默认）', payload: JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)) },
  {
    key: 'b2b_industrial_cooling',
    label: 'B2B 工业降温设备（Word 示例）',
    payload: {
      ...JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)),
      name: '工业降温设备评论分析提示词',
      description: '适用于工厂车间降温设备、厂房降温方案等 B 端获客场景。',
      biz: '提供工业车间降温设备和厂房降温方案，面向工厂车间、仓库、生产线等高温场景。',
      cust: '工厂老板、车间负责人、设备采购、厂房管理人员、需要解决夏季车间闷热和电费高问题的 B 端客户。',
      acctType: '竞品账号/行业账号',
      acctPos: '发布工业降温、厂房设备、车间环境改善、工厂节能相关内容，评论区可能出现询价、方案、效果、适配场景等需求。',
      tone: '朴实、直接、像行业内的人，不油腻、不客服化，不直接推销，先给参考方案或对比资料。',
      sellPts: '蒸发冷省电空调,厂房降温方案,大面积车间降温,节能,配置建议,实拍案例',
      banRules: '不能承诺保证效果,不能说全网最低价,不能说行业第一,不能夸大收益,不能编造价格参数,不能冒充原视频作者',
      nonCust: '同行打卡,互粉,招聘,求职,学习教程,吃瓜围观,家用空调需求,装修美食宠物等无关需求。',
      dmRule: '先提供方案参考、案例对比或配置建议；价格要结合面积、层高、工况和配置，不直接编造报价。',
      entryRules: '配置方案切入,案例对比切入,避坑建议切入,痛点诊断切入,no_script',
      videoTitle: '夏天车间太热怎么办？',
      clientName: '老粥工业降温',
      mainBusiness: '工业车间降温设备',
      mainProducts: '蒸发冷省电空调,厂房降温方案',
      targetScenarios: '夏季高温车间降温,大面积厂房降温,仓库降温,生产线降温',
      customerPainPoints: '车间闷热,电费高,普通冷风机潮湿,员工工作环境差,设备散热压力大',
      positiveKeywords: '车间降温,厂房降温,工业空调,蒸发冷空调,工厂太热,电费高,大面积降温',
      negativeKeywords: '家用空调,蛋糕,美食,装修,宠物,招聘,求职,学习教程',
      highIntentKeywords: '多少钱,报价,怎么联系,有方案吗,能降下来吗,适合我厂吗,配置怎么选',
      nonLeadSignals: '同行打卡,互粉,招聘,求职,学习,吃瓜,纯表情,广告引流',
      allowedOffers: '报价单,车间实拍视频,配置方案,案例参考,选型建议',
      accountPersona: '源头工厂技术员',
      forbiddenClaims: '绝对最低价,保证效果,行业第一,全网最低,百分百有效',
      ctaPolicy: '{"allow_wechat":false,"default_cta":"先在私信里发参考资料"}',
      videoRelevanceRules: '作品是否继续执行由独立工作流判断；评论分析时结合工业降温、厂房车间、设备选型和高温痛点上下文。',
      commentScoringRules: '只把绑定车间降温、厂房设备、配置方案、询价、效果和场景适配的评论判为线索。',
      riskRoutingRules: '过滤同行、招聘、求职、学习教程、家用空调和无关消费需求；不允许直接承诺效果和最低价。',
      scriptGenerationRules: 'should=true 时优先用方案参考、配置建议、案例对比切入；需要编造价格或效果时 reply 为空。'
    }
  },
  {
    key: 'b2b_food_packaging',
    label: 'B2B 食品包装设备',
    payload: {
      ...JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)),
      name: '食品包装设备评论分析提示词',
      description: '适用于食品包装机、封口机、包装产线等 B 端获客场景。',
      biz: '提供食品包装设备、封口机、包装产线方案，帮助食品厂、中央厨房、小型加工厂提高包装效率。',
      cust: '食品厂老板、中央厨房负责人、小型加工厂、包装线负责人、设备采购。',
      acctType: '竞品账号/行业账号',
      acctPos: '发布食品加工、包装设备、封口效率、产线升级相关内容。',
      tone: '专业但不生硬，先围绕产能、适配物料、样品效果和方案参考沟通。',
      sellPts: '自动包装,真空封口,产能提升,定制尺寸,样品测试,方案配置',
      mainBusiness: '食品包装设备与包装产线方案',
      mainProducts: '食品包装机,真空封口机,自动包装线,定制包装方案',
      targetScenarios: '食品厂扩产,中央厨房包装,小加工厂包装效率提升,人工包装替代',
      customerPainPoints: '人工包装慢,漏气,封口不稳,产能不足,规格不统一',
      positiveKeywords: '食品包装,封口机,真空包装,包装效率,产能,漏气,定制尺寸',
      negativeKeywords: '美食探店,蛋糕门店,宠物,装修,招聘,求职,学习教程',
      highIntentKeywords: '多少钱,产能多少,能定制吗,怎么联系,能寄样吗,适合食品厂吗',
      nonLeadSignals: '同行打卡,互粉,招聘,求职,学习,吃瓜,纯表情,广告引流',
      allowedOffers: '设备参数表,包装样品效果,方案配置,产能参考,视频演示',
      accountPersona: '做包装设备方案的人',
      forbiddenClaims: '保证不漏气,绝对最低价,百分百有效,行业第一,全网最低',
      ctaPolicy: '{"allow_wechat":false,"default_cta":"先发一组包装样品效果或参数表"}'
    }

  },
  {
    key: 'local_life_merchant',
    label: '本地生活商家获客',
    payload: {
      ...JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)),
      name: '本地生活商家截流提示词',
      description: '适用于餐饮、美业、到店服务等本地生活客户获取咨询线索。',
      biz: '为本地生活商家提供短视频获客、评论线索筛选、私域承接和到店转化辅助服务。',
      cust: '餐饮店老板、美业门店、同城服务商家、到店团购运营、本地生活代运营团队。',
      acctType: '竞品账号/同城行业账号/教程账号',
      acctPos: '发布同城获客、门店引流、团购运营、私域转化、本地生活运营相关内容。',
      tone: '自然、同城服务视角，不夸大收益，先给门店案例或引流思路。',
      sellPts: '同城线索筛选,评论区获客,私域承接,到店转化,案例参考,运营建议',
      banRules: '不能承诺爆单,不能承诺日赚金额,不能说保证到店,不能冒充平台官方,不能诱导违规刷单',
      nonCust: '纯吃瓜,普通消费者闲聊,薅羊毛用户,招聘求职,无关探店评论,广告引流。',
      dmRule: '先给同类门店的引流样例或评论筛选效果，确认有兴趣后再聊具体门店情况。',
      entryRules: '同城案例切入,评论线索切入,门店引流问题切入,私域承接切入,不建议切入',
      clientName: '本地生活商家获客',
      mainBusiness: '本地生活短视频获客与私域承接服务',
      mainProducts: '评论线索筛选,同城获客方案,私域承接建议,门店案例参考',
      targetScenarios: '同城门店获客,团购转化,评论区筛客户,私域承接',
      customerPainPoints: '曝光有但咨询少,评论多但不会筛,到店转化不稳定,私域承接弱',
      positiveKeywords: '同城获客,门店引流,团购,私域,到店,评论区客户,怎么引流',
      negativeKeywords: '纯探店,美食评价,薅羊毛,招聘,求职,宠物,旅游,家庭日常',
      highIntentKeywords: '怎么引流,怎么获客,能代运营吗,多少钱,有案例吗,怎么合作',
      nonLeadSignals: '普通消费者评价,薅羊毛,同行打卡,招聘求职,广告引流,哈哈哈,路过',
      allowedOffers: '同城案例,评论线索样例,私域承接方案,门店诊断建议',
      accountPersona: '懂本地生活获客和评论线索筛选的人',
      forbiddenClaims: '保证爆单,保证到店,日赚多少,全网最低价,平台内部资源',
      ctaPolicy: '{"allow_wechat":false,"default_cta":"先看同类门店评论线索样例"}'
    }
  },
  {
    key: 'education_training_leads',
    label: '教育培训招生线索',
    payload: {
      ...JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)),
      name: '教育培训招生截流提示词',
      description: '适用于课程咨询、招生获客、教培机构私域承接。',
      biz: '为教育培训机构提供短视频评论线索筛选、招生咨询识别和私域转化辅助服务。',
      cust: '教育培训机构、职业培训团队、兴趣课机构、招生运营团队、课程顾问。',
      acctType: '竞品机构账号/教育行业账号/课程种草账号',
      acctPos: '发布课程介绍、学习方法、考证培训、招生案例、职业提升相关内容。',
      tone: '专业、克制、像课程顾问但不强推，先看课程样例或咨询场景。',
      sellPts: '招生线索筛选,评论咨询识别,私域承接,课程样例,转化话术辅助',
      banRules: '不能承诺包过,不能承诺保分,不能夸大就业结果,不能制造焦虑,不能违规承诺证书',
      nonCust: '纯学习打卡,免费党,同行老师,招聘求职,无关考试吐槽,广告引流。',
      dmRule: '先围绕课程方向或咨询问题给样例/资料，不要一上来问预算或催报名。',
      entryRules: '课程资料切入,学习痛点切入,咨询场景切入,案例效果切入,不建议切入',
      clientName: '教育培训招生',
      mainBusiness: '教育培训招生与评论线索筛选',
      mainProducts: '招生线索筛选,课程咨询识别,私域承接建议,课程样例资料',
      targetScenarios: '课程咨询,考证培训,职业提升,兴趣课招生,评论区筛学员',
      customerPainPoints: '评论咨询难筛,线索质量不稳定,招生私域承接弱,课程顾问开场难',
      positiveKeywords: '课程,报名,学费,怎么学,适合我吗,考证,培训,资料',
      negativeKeywords: '招聘,求职,纯吐槽,免费资源党,娱乐,美食,宠物,旅游',
      highIntentKeywords: '多少钱,怎么报名,有课程吗,能试听吗,发资料,怎么联系,适合我吗',
      nonLeadSignals: '纯打卡,求免费,同行交流,招聘求职,吃瓜围观,广告引流',
      allowedOffers: '课程资料,试听说明,学习路径,案例参考,咨询样例',
      accountPersona: '手上有课程资料和招生咨询经验的人',
      forbiddenClaims: '包过,保分,保证就业,稳赚,唯一官方,名额套路',
      ctaPolicy: '{"allow_wechat":false,"default_cta":"先发课程资料或试听说明"}'
    }
  },
  {
    key: 'franchise招商加盟',
    label: '招商加盟项目',
    payload: {
      ...JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)),
      name: '招商加盟截流提示词',
      description: '适用于招商加盟、连锁项目咨询、创业人群线索筛选。',
      biz: '提供招商加盟项目咨询、加盟线索识别、项目资料承接和创业客户跟进服务。',
      cust: '招商团队、加盟品牌、连锁门店总部、创业项目运营团队、招商顾问。',
      acctType: '竞品加盟账号/创业项目账号/招商行业账号',
      acctPos: '发布加盟项目、创业经验、门店模型、投资回报、招商政策相关内容。',
      tone: '稳重、像项目顾问，不夸大收益，先给项目资料或门店模型参考。',
      sellPts: '加盟线索筛选,项目资料承接,评论意向识别,招商私信开场,案例参考',
      banRules: '不能承诺稳赚,不能承诺回本周期,不能夸大收益,不能虚假招商,不能诱导投资',
      nonCust: '纯看热闹,负面攻击,招聘求职,同行打探,无创业意向,广告引流。',
      dmRule: '先给项目资料或门店模型参考，确认对方向后再聊区域和预算。',
      entryRules: '项目资料切入,门店模型切入,投资问题切入,区域合作切入,不建议切入',
      clientName: '招商加盟项目',
      mainBusiness: '招商加盟线索筛选与项目咨询承接',
      mainProducts: '加盟项目资料,门店模型,区域合作说明,评论线索筛选',
      targetScenarios: '加盟咨询,创业项目筛选,区域代理,门店开店,招商评论区获客',
      customerPainPoints: '咨询真假难分,评论线索多但质量低,招商开场难,项目资料承接慢',
      positiveKeywords: '加盟,代理,开店,投资,项目,区域,合作,多少钱',
      negativeKeywords: '招聘,求职,纯吐槽,割韭菜骂战,娱乐,生活日常',
      highIntentKeywords: '加盟费多少,怎么合作,能发资料吗,区域还有吗,怎么联系,要投资多少',
      nonLeadSignals: '吃瓜围观,同行打探,辱骂攻击,招聘求职,广告引流,纯表情',
      allowedOffers: '项目资料,门店模型,区域政策,案例参考,合作流程',
      accountPersona: '了解项目资料和招商流程的人',
      forbiddenClaims: '稳赚,保本,保证回本,躺赚,零风险,全网最低加盟费',
      ctaPolicy: '{"allow_wechat":false,"default_cta":"先发项目资料或门店模型参考"}'
    }
  },
  {
    key: 'saas_b2b_sales',
    label: '企业软件 / SaaS 销售',
    payload: {
      ...JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM)),
      name: '企业软件 SaaS 截流提示词',
      description: '适用于企业软件、SaaS 工具、B 端服务销售线索筛选。',
      biz: '提供企业软件或 SaaS 工具，帮助企业提升业务效率、自动化流程、数据管理和客户转化。',
      cust: '企业老板、运营负责人、销售负责人、信息化负责人、B 端服务团队。',
      acctType: '竞品软件账号/行业解决方案账号/教程账号',
      acctPos: '发布企业效率工具、客户管理、销售自动化、数据分析、SaaS 解决方案相关内容。',
      tone: '专业、简洁，先给功能演示或案例，不一上来报价。',
      sellPts: '流程自动化,数据管理,客户管理,效率提升,演示案例,试用说明',
      banRules: '不能承诺百分百降本,不能保证成交,不能夸大 ROI,不能冒充官方,不能虚构客户案例',
      nonCust: '个人用户,学生学习,招聘求职,无业务需求,同行打探,广告引流。',
      dmRule: '优先引导看功能演示或同行案例，确认场景后再聊试用和价格。',
      entryRules: '功能演示切入,效率痛点切入,同行案例切入,试用说明切入,不建议切入',
      clientName: '企业软件 SaaS',
      mainBusiness: '企业软件与 SaaS 工具销售',
      mainProducts: 'CRM,销售自动化,客户管理系统,数据分析工具,流程自动化工具',
      targetScenarios: '销售管理,客户跟进,团队协作,数据看板,流程自动化',
      customerPainPoints: '客户跟进混乱,人工统计慢,销售转化低,数据分散,流程重复劳动',
      positiveKeywords: 'CRM,SaaS,客户管理,销售自动化,效率,系统,试用,演示',
      negativeKeywords: '个人学习,求职,招聘,代码教程,娱乐,生活日常,破解软件',
      highIntentKeywords: '多少钱,能试用吗,有演示吗,怎么部署,怎么联系,适合我们吗',
      nonLeadSignals: '学生学习,个人爱好,同行打探,招聘求职,广告引流,纯围观',
      allowedOffers: '功能演示,试用说明,同行案例,方案咨询,配置建议',
      accountPersona: '懂企业软件方案和场景匹配的人',
      forbiddenClaims: '百分百成交,保证降本,稳赚,全网最低,虚构客户案例',
      ctaPolicy: '{"allow_wechat":false,"default_cta":"先看功能演示或同行案例"}'
    }
  }
];

const activeTab = ref<TabName>('intercept');
const filters = ref({ keyword: '', platform: '', authStatus: '', runStatus: '' });
const interceptItems = ref<UiRobotItem[]>([]);
const interceptLoading = ref(false);
const interceptPagination = ref({ page: 1, pageSize: 10, total: 0 });
const privateItems = ref<UiRobotItem[]>([]);
const privateLoading = ref(false);
const privatePagination = ref({ page: 1, pageSize: 10, total: 0 });

const interceptDialogVisible = ref(false);
const interceptDialogMode = ref<'create' | 'edit'>('create');
const interceptSubmitting = ref(false);
const currentInterceptRecord = ref<UiRobotItem | null>(null);

const privateDialogVisible = ref(false);
const privateDialogMode = ref<'create' | 'edit'>('create');
const privateSubmitting = ref(false);
const currentPrivateRecord = ref<UiRobotItem | null>(null);
const privateForm = ref(defaultPrivateForm());
const privateHasUserContent = computed(() => Boolean(privateForm.value.name.trim() || privateForm.value.remark?.trim()));

const captureItems = ref<robotsApi.InterceptCaptureItem[]>([]);
const captureLoading = ref(false);
const captureDeleting = ref(false);
const captureReanalyzing = ref(false);
const captureExportingAll = ref(false);
const captureExportingSelected = ref(false);
const captureTableRef = ref<TableInstance>();
const captureSelection = ref<robotsApi.InterceptCaptureItem[]>([]);
const captureFilters = ref({ keyword: '', robotId: '', platform: '', intentLevel: '' });
const capturePagination = ref({ page: 1, pageSize: 10, total: 0 });

const captureViewPresets = ref<robotsApi.InterceptCaptureViewPreset[]>([]);
const activeCaptureViewPresetId = ref('');
const captureViewPresetLoading = ref(false);
const captureViewPresetSaving = ref(false);
const captureViewPresetDrawerVisible = ref(false);
const captureViewColumns = ref<robotsApi.InterceptCaptureViewColumn[]>(defaultCaptureViewColumns());
const captureViewColumnDraft = ref<robotsApi.InterceptCaptureViewColumn[]>(defaultCaptureViewColumns());
const currentCaptureViewPreset = computed(() => captureViewPresets.value.find((item) => item.id === activeCaptureViewPresetId.value) || null);
const visibleCaptureColumns = computed(() => captureViewColumns.value.filter((item) => item.visible));

const taskDialogVisible = ref(false);
const taskCreating = ref(false);
const taskPlannedRange = ref<[string, string] | []>([]);
const taskRobotId = ref('');
const selectedCaptureDetail = ref<robotsApi.InterceptCaptureItem | null>(null);
const taskMessageOverrides = ref<Record<string, string>>({});

const taskItems = ref<robotsApi.PrivateMessageTaskItem[]>([]);
const taskLoading = ref(false);
const taskDeleting = ref(false);
const taskTableRef = ref<TableInstance>();
const taskSelection = ref<robotsApi.PrivateMessageTaskItem[]>([]);
const taskFilters = ref({ keyword: '', platform: '', robotId: '', status: '', intentLevel: '' });
const taskCreatedRange = ref<[string, string] | []>([]);
const taskPagination = ref({ page: 1, pageSize: 10, total: 0 });
const taskMessageDialogVisible = ref(false);
const taskMessageSubmitting = ref(false);
const editingTask = ref<robotsApi.PrivateMessageTaskItem | null>(null);
const taskMessageForm = ref('');


const promptItems = ref<robotsApi.InterceptIntentPromptConfigItem[]>([]);
const promptLoading = ref(false);
const promptSubmitting = ref(false);
const promptDialogVisible = ref(false);
const promptDialogMode = ref<'create' | 'edit'>('create');
const editingPromptConfig = ref<robotsApi.InterceptIntentPromptConfigItem | null>(null);
const promptFilters = ref({ keyword: '', status: '' });
const promptPagination = ref({ page: 1, pageSize: 10, total: 0 });
const promptForm = ref<robotsApi.InterceptIntentPromptConfigPayload>(defaultPromptForm());
const promptAdvancedPanels = ref<string[]>(['fourNode']);
const selectedPromptPresetKey = ref('douyin_intercept_tool');
const promptTestDrawerVisible = ref(false);
const promptTestConfig = ref<(Partial<robotsApi.InterceptIntentPromptConfigPayload> & { promptConfigId?: string }) | null>(null);

const analysisBatchDialogVisible = ref(false);
const analysisBatchLoading = ref(false);
const analysisBatchItems = ref<robotsApi.InterceptIntentAnalysisBatchItem[]>([]);
const analysisBatchRetryingAll = ref(false);
const analysisBatchRetryingId = ref('');
const analysisBatchFilters = ref({ robotId: '', status: '' });
const analysisBatchPagination = ref({ page: 1, pageSize: 10, total: 0 });

const currentInterceptFormData = computed<RobotManagementFormModel | undefined>(() => {
  const row = currentInterceptRecord.value;
  if (!row) return undefined;
  const config = normalizeConfig(row.config);
  return {
    ...JSON.parse(JSON.stringify(ROBOT_DEFAULT_FORM)),
    name: row.name || '',
    platform: (row.platform as RobotManagementFormModel['platform']) || 'DOUYIN',
    expiredAt: toLocalDateTimeValue(row.expiredAt),
    remark: row.remark || '',
    runtimePolicy: normalizeRuntimePolicy(readObject(config, 'runtimePolicy')),
    interceptConfig: mergeInterceptConfig(readObject(config, 'intercept'))
  };
});

const selectedTaskMessage = computed({
  get() {
    const capture = selectedCaptureDetail.value;
    if (!capture) return '';
    return taskMessageOverrides.value[capture.id] || getDefaultTaskMessage(capture);
  },
  set(value: string) {
    const capture = selectedCaptureDetail.value;
    if (!capture) return;
    taskMessageOverrides.value = { ...taskMessageOverrides.value, [capture.id]: value };
  }
});


function mergeInterceptConfig(source: Record<string, any>) {
  const base = JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_CONFIG));
  const raw = source && typeof source === 'object' ? source : {};
  return {
    ...base,
    ...raw,
    schedule: { ...base.schedule, ...(raw.schedule || {}) },
    intentAnalysis: { ...base.intentAnalysis, ...(raw.intentAnalysis || {}) },
    workDecision: { ...base.workDecision, ...(raw.workDecision || {}) },
    speech: { ...base.speech, ...(raw.speech || {}) },
    collect: { ...base.collect, ...(raw.collect || {}) }
  };
}

onMounted(async () => {
  await Promise.all([fetchInterceptRobots(true), fetchPrivateRobots(true), fetchPromptConfigList(true), fetchCaptureViewPresets()]);
});

function applyCurrentFilters() {
  if (activeTab.value === 'private') fetchPrivateRobots(true);
  else if (activeTab.value === 'intercept') fetchInterceptRobots(true);
  else if (activeTab.value === 'captures') fetchCaptureList(true);
  else if (activeTab.value === 'prompts') fetchPromptConfigList(true);
  else fetchTaskList(true);
}

function resetCurrentFilters() {
  filters.value = { keyword: '', platform: '', authStatus: '', runStatus: '' };
  applyCurrentFilters();
}

function handleTabChange() {
  if (activeTab.value === 'intercept') fetchInterceptRobots();
  if (activeTab.value === 'private') fetchPrivateRobots();
  if (activeTab.value === 'captures') {
    fetchCaptureList(true);
    if (!captureViewPresets.value.length) fetchCaptureViewPresets();
  }
  if (activeTab.value === 'prompts') fetchPromptConfigList(true);
  if (activeTab.value === 'tasks') fetchTaskList(true);
}

async function fetchInterceptRobots(resetPage = false) {
  if (resetPage) interceptPagination.value.page = 1;
  interceptLoading.value = true;
  try {
    const result = await robotsApi.listRobots({
      page: interceptPagination.value.page,
      pageSize: interceptPagination.value.pageSize,
      keyword: filters.value.keyword,
      platform: filters.value.platform,
      type: 'INTERCEPT',
      status: filters.value.runStatus
    });
    interceptItems.value = result.items.map(normalizeUiRobot).filter((item) => matchAuthFilter(item));
    interceptPagination.value = { page: result.page, pageSize: interceptPagination.value.pageSize, total: result.total };
  } finally {
    interceptLoading.value = false;
  }
}

async function fetchPrivateRobots(resetPage = false) {
  if (resetPage) privatePagination.value.page = 1;
  privateLoading.value = true;
  try {
    const result = await robotsApi.listPrivateMessageRobots({
      page: privatePagination.value.page,
      pageSize: privatePagination.value.pageSize,
      keyword: filters.value.keyword,
      platform: filters.value.platform,
      status: filters.value.runStatus,
      authStatus: filters.value.authStatus
    });
    privateItems.value = result.items.map(normalizeUiRobot).filter((item) => matchAuthFilter(item));
    privatePagination.value = { page: result.page, pageSize: privatePagination.value.pageSize, total: result.total };
  } finally {
    privateLoading.value = false;
  }
}

function matchAuthFilter(item: UiRobotItem) {
  return !filters.value.authStatus || item.authStatus === filters.value.authStatus;
}

function openCreateInterceptRobot() {
  currentInterceptRecord.value = null;
  interceptDialogMode.value = 'create';
  interceptDialogVisible.value = true;
}

function openEditInterceptRobot(row: UiRobotItem) {
  currentInterceptRecord.value = row;
  interceptDialogMode.value = 'edit';
  interceptDialogVisible.value = true;
}

async function handleSubmitInterceptRobot(payload: RobotManagementFormModel) {
  interceptSubmitting.value = true;
  try {
    const body: robotsApi.RobotPayload = {
      name: payload.name.trim(),
      type: 'INTERCEPT',
      platform: payload.platform || 'DOUYIN',
      expireAt: payload.expiredAt ? normalizeDateTime(payload.expiredAt) : undefined,
      config: { runtimePolicy: normalizeRuntimePolicy(payload.runtimePolicy), intercept: payload.interceptConfig },
      remark: payload.remark?.trim() || undefined
    };
    if (interceptDialogMode.value === 'create') {
      await robotsApi.createRobot(body);
      ElMessage.success('截流机器人已新增');
    } else if (currentInterceptRecord.value) {
      await robotsApi.updateRobot(currentInterceptRecord.value.id, body);
      ElMessage.success('截流机器人已更新');
    }
    interceptDialogVisible.value = false;
    await fetchInterceptRobots(true);
  } finally {
    interceptSubmitting.value = false;
  }
}

function openCreatePrivateRobot() {
  currentPrivateRecord.value = null;
  privateDialogMode.value = 'create';
  privateForm.value = defaultPrivateForm();
  privateDialogVisible.value = true;
}

function fillPrivateRobotSample() {
  privateForm.value = {
    ...defaultPrivateForm(),
    name: '抖音主动私信测试机器人（参考）',
    platform: 'DOUYIN', enabled: false, paused: true,
    minSendIntervalSeconds: 60, maxSendIntervalSeconds: 120,
    workStartTime: '10:00', workEndTime: '20:00',
    dailySendLimit: 20, hourlySendLimit: 5, userTouchIntervalDays: 14,
    maxConsecutiveFailures: 3, claimBatchSize: 1,
    defaultMessageTemplate: '看到你刚才在评论里提到这个问题，我这边有一份相关的实际样例。需要的话我可以先发你看看。',
    remark: '虚构参考样例；保存前请核对触达范围、发送节奏和默认文案。',
  };
  ElMessage.success('主动私信样例已填入，当前默认停用并暂停');
}

function openEditPrivateRobot(row: UiRobotItem) {
  currentPrivateRecord.value = row;
  privateDialogMode.value = 'edit';
  privateForm.value = privateFormFromRow(row);
  privateDialogVisible.value = true;
}


async function submitPrivateRobot() {
  if (!privateForm.value.name.trim()) {
    ElMessage.warning('请输入机器人名称');
    return;
  }
  if (!privateForm.value.platform) {
    ElMessage.warning('请选择平台');
    return;
  }
  privateSubmitting.value = true;
  try {
    const body = { ...privateForm.value, name: privateForm.value.name.trim() };
    if (privateDialogMode.value === 'create') {
      await robotsApi.createPrivateMessageRobot(body);
      ElMessage.success('主动私信机器人已新增');
    } else if (currentPrivateRecord.value) {
      await robotsApi.updatePrivateMessageRobot(currentPrivateRecord.value.id, body);
      ElMessage.success('主动私信机器人已更新');
    }
    privateDialogVisible.value = false;
    await fetchPrivateRobots(true);
  } finally {
    privateSubmitting.value = false;
  }
}

async function startRobot(row: UiRobotItem, listType: 'intercept' | 'private') {
  if (!canStart(row)) {
    ElMessage.warning('请先完成授权且确保未过期后再启动机器人');
    return;
  }
  await robotsApi.startRobot(row.id);
  ElMessage.success('机器人已启动');
  await (listType === 'private' ? fetchPrivateRobots() : fetchInterceptRobots());
}

async function stopRobot(row: UiRobotItem, listType: 'intercept' | 'private') {
  if (!canStop(row)) return;
  await robotsApi.stopRobot(row.id, { stopReason: 'MANUAL' });
  ElMessage.success('机器人已停止');
  await (listType === 'private' ? fetchPrivateRobots() : fetchInterceptRobots());
}

async function refreshQr(row: UiRobotItem, listType: 'intercept' | 'private') {
  if (!row.authId || !row.deviceId) {
    ElMessage.warning('当前机器人缺少授权或设备绑定，无法发起扫码');
    return;
  }
  const created = await robotsApi.createRobotAuthSession({ authId: row.authId, deviceId: row.deviceId });
  const session = created.qrCodeUrl || created.qrCodeContent ? created : await robotsApi.getRobotAuthSession(created.sessionId);
  ElMessage.success(session.qrCodeUrl ? `扫码会话已创建，二维码地址：${session.qrCodeUrl}` : `扫码会话已创建，会话ID：${session.sessionId}`);
  await (listType === 'private' ? fetchPrivateRobots() : fetchInterceptRobots());
}

async function removeInterceptRobot(row: UiRobotItem) {
  await ElMessageBox.confirm(`确认删除截流机器人「${row.name}」？`, '删除确认', { type: 'warning' });
  await robotsApi.removeRobot(row.id);
  ElMessage.success('截流机器人已删除');
  await fetchInterceptRobots(true);
}

async function removePrivateRobot(row: UiRobotItem) {
  await ElMessageBox.confirm(`确认删除主动私信机器人「${row.name}」？`, '删除确认', { type: 'warning' });
  await robotsApi.removePrivateMessageRobot(row.id);
  ElMessage.success('主动私信机器人已删除');
  await fetchPrivateRobots(true);
}

async function pausePrivateRobot(row: UiRobotItem) {
  await robotsApi.pausePrivateMessageRobot(row.id);
  ElMessage.success('已暂停主动私信领取');
  await fetchPrivateRobots();
}

async function resumePrivateRobot(row: UiRobotItem) {
  await robotsApi.resumePrivateMessageRobot(row.id);
  ElMessage.success('已恢复主动私信领取');
  await fetchPrivateRobots();
}

function canStart(row: UiRobotItem) {
  return row.authStatus === 'AUTHORIZED' && row.runStatus !== 'RUNNING' && row.runStatus !== 'DISABLED' && !isExpired(row.expiredAt);
}

function canStop(row: UiRobotItem) {
  return row.runStatus === 'RUNNING';
}

async function fetchCaptureViewPresets(preferredPresetId?: string) {
  captureViewPresetLoading.value = true;
  try {
    const remotePresets = await robotsApi.listInterceptCaptureViewPresets();
    const presets = remotePresets.length ? remotePresets : [createBuiltInCaptureViewPreset()];
    captureViewPresets.value = presets;
    const next = presets.find((item) => item.id === preferredPresetId)
      || presets.find((item) => item.id === activeCaptureViewPresetId.value)
      || presets.find((item) => item.isDefault)
      || presets[0];
    if (next) {
      activeCaptureViewPresetId.value = next.id;
      applyCaptureViewPreset(next);
    }
  } finally {
    captureViewPresetLoading.value = false;
  }
}

function openCaptureViewPresetDrawer() {
  captureViewColumnDraft.value = cloneCaptureViewColumns(captureViewColumns.value);
  captureViewPresetDrawerVisible.value = true;
}

function handleCaptureViewPresetChange(id: string) {
  const preset = captureViewPresets.value.find((item) => item.id === id);
  if (!preset) return;
  applyCaptureViewPreset(preset);
  captureViewColumnDraft.value = cloneCaptureViewColumns(preset.columns);
}

function applyCaptureViewPreset(preset: robotsApi.InterceptCaptureViewPreset) {
  captureViewColumns.value = normalizeCaptureViewColumns(preset.columns);
}

function restoreDefaultCaptureColumns() {
  captureViewColumnDraft.value = defaultCaptureViewColumns();
}

function moveCaptureViewColumn(index: number, offset: number) {
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= captureViewColumnDraft.value.length) return;
  const next = cloneCaptureViewColumns(captureViewColumnDraft.value);
  const [column] = next.splice(index, 1);
  next.splice(targetIndex, 0, column);
  captureViewColumnDraft.value = next.map((item, order) => ({ ...item, order }));
}

async function saveCurrentCaptureViewPreset() {
  const preset = currentCaptureViewPreset.value;
  const columns = normalizeCaptureViewColumns(captureViewColumnDraft.value);
  if (!preset) {
    ElMessage.warning('请先选择字段预设');
    return;
  }
  if (!columns.some((item) => item.visible)) {
    ElMessage.warning('至少保留一个显示字段');
    return;
  }
  captureViewPresetSaving.value = true;
  try {
    const updated = preset.id === BUILTIN_CAPTURE_VIEW_PRESET_ID
      ? await robotsApi.createInterceptCaptureViewPreset({ name: preset.name, columns, isDefault: true })
      : await robotsApi.updateInterceptCaptureViewPreset(preset.id, { columns });
    captureViewPresets.value = preset.id === BUILTIN_CAPTURE_VIEW_PRESET_ID
      ? [updated]
      : captureViewPresets.value.map((item) => item.id === updated.id ? updated : item);
    activeCaptureViewPresetId.value = updated.id;
    captureViewColumns.value = cloneCaptureViewColumns(updated.columns);
    captureViewColumnDraft.value = cloneCaptureViewColumns(updated.columns);
    ElMessage.success('字段预设已保存');
  } finally {
    captureViewPresetSaving.value = false;
  }
}

async function saveCaptureViewAsPreset() {
  const columns = normalizeCaptureViewColumns(captureViewColumnDraft.value);
  if (!columns.some((item) => item.visible)) {
    ElMessage.warning('至少保留一个显示字段');
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入新预设名称', '另存为字段预设', {
      inputPlaceholder: '例如：复盘查看',
      inputValidator: (input) => String(input || '').trim() ? true : '预设名称不能为空',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    });
    const created = await robotsApi.createInterceptCaptureViewPreset({ name: String(value || '').trim(), columns });
    captureViewPresets.value = [created, ...captureViewPresets.value];
    activeCaptureViewPresetId.value = created.id;
    captureViewColumns.value = cloneCaptureViewColumns(created.columns);
    captureViewColumnDraft.value = cloneCaptureViewColumns(created.columns);
    ElMessage.success('字段预设已保存');
  } catch {
    // The user cancelled the prompt; keep the current draft unchanged.
  }
}

async function setCurrentCaptureViewPresetAsDefault() {
  const preset = currentCaptureViewPreset.value;
  if (!preset || preset.isDefault) return;
  const updated = await robotsApi.setDefaultInterceptCaptureViewPreset(preset.id);
  captureViewPresets.value = captureViewPresets.value.map((item) => ({ ...item, isDefault: item.id === updated.id }));
  ElMessage.success('已设为默认字段预设');
}

async function removeCurrentCaptureViewPreset() {
  const preset = currentCaptureViewPreset.value;
  if (!preset || captureViewPresets.value.length <= 1) return;
  await ElMessageBox.confirm(`确认删除字段预设「${preset.name}」？`, '删除字段预设', { type: 'warning' });
  await robotsApi.removeInterceptCaptureViewPreset(preset.id);
  await fetchCaptureViewPresets();
  captureViewColumnDraft.value = cloneCaptureViewColumns(captureViewColumns.value);
  ElMessage.success('字段预设已删除');
}

function createBuiltInCaptureViewPreset(): robotsApi.InterceptCaptureViewPreset {
  return {
    id: BUILTIN_CAPTURE_VIEW_PRESET_ID,
    name: '线索处理',
    isDefault: true,
    columns: defaultCaptureViewColumns(),
  };
}

function defaultCaptureViewColumns(): robotsApi.InterceptCaptureViewColumn[] {
  return CAPTURE_COLUMN_DEFINITIONS.map((item, order) => ({ key: item.key, visible: item.visible, order }));
}

function normalizeCaptureViewColumns(columns?: robotsApi.InterceptCaptureViewColumn[]) {
  const configured = new Map((columns || []).map((item) => [item.key, item]));
  return CAPTURE_COLUMN_DEFINITIONS
    .map((item, index) => {
      const current = configured.get(item.key);
      return { key: item.key, visible: current?.visible ?? item.visible, order: Number.isFinite(Number(current?.order)) ? Number(current?.order) : index };
    })
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((item, order) => ({ ...item, order }));
}

function cloneCaptureViewColumns(columns: robotsApi.InterceptCaptureViewColumn[]) {
  return normalizeCaptureViewColumns(columns).map((item) => ({ ...item }));
}

function captureColumnLabel(key: string) {
  return CAPTURE_COLUMN_DEFINITIONS.find((item) => item.key === key)?.label || key;
}

function captureSourceLink(row: robotsApi.InterceptCaptureItem) {
  return row.contentUrl || row.homepageUrl || row.targetUrl || '';
}

async function fetchCaptureList(resetPage = false) {
  if (resetPage) capturePagination.value.page = 1;
  captureLoading.value = true;
  try {
    const result = await robotsApi.listInterceptCaptures({
      page: capturePagination.value.page,
      pageSize: capturePagination.value.pageSize,
      keyword: captureFilters.value.keyword,
      robotId: captureFilters.value.robotId,
      platform: captureFilters.value.platform,
      intentLevel: captureFilters.value.intentLevel
    });
    captureItems.value = result.items;
    capturePagination.value = { page: result.page, pageSize: capturePagination.value.pageSize, total: result.total };
    clearCaptureSelection();
  } finally {
    captureLoading.value = false;
  }
}

function resetCaptureFilters() {
  captureFilters.value = { keyword: '', robotId: '', platform: '', intentLevel: '' };
  fetchCaptureList(true);
}

async function exportSelectedCaptures() {
  const rows = captureSelection.value.filter((item) => item.id);
  if (!rows.length) {
    ElMessage.warning('请先勾选需要导出的捕获数据');
    return;
  }
  captureExportingSelected.value = true;
  try {
    await writeCaptureExportWorkbook(rows, `截流捕获数据_选中_${formatExportDate()}.xlsx`);
    ElMessage.success(`已导出 ${rows.length} 条捕获数据`);
  } finally {
    captureExportingSelected.value = false;
  }
}

async function exportAllCaptures() {
  if (capturePagination.value.total <= 0) {
    ElMessage.warning('当前没有可导出的捕获数据');
    return;
  }
  await ElMessageBox.confirm(
    `确认导出当前筛选条件下全部 ${capturePagination.value.total} 条捕获数据？数据量较大时可能需要等待。`,
    '导出全部捕获数据',
    { type: 'info', confirmButtonText: '开始导出' }
  );
  captureExportingAll.value = true;
  try {
    const rows = await fetchAllCaptureRowsForExport();
    if (!rows.length) {
      ElMessage.warning('当前筛选条件下没有可导出的捕获数据');
      return;
    }
    await writeCaptureExportWorkbook(rows, `截流捕获数据_全部_${formatExportDate()}.xlsx`);
    ElMessage.success(`已导出 ${rows.length} 条捕获数据`);
  } finally {
    captureExportingAll.value = false;
  }
}

async function fetchAllCaptureRowsForExport() {
  const rows: robotsApi.InterceptCaptureItem[] = [];
  let page = 1;
  let total = 0;
  while (true) {
    const result = await robotsApi.listInterceptCaptures({
      page,
      pageSize: CAPTURE_EXPORT_PAGE_SIZE,
      keyword: captureFilters.value.keyword,
      robotId: captureFilters.value.robotId,
      platform: captureFilters.value.platform,
      intentLevel: captureFilters.value.intentLevel
    });
    rows.push(...result.items);
    total = result.total || rows.length;
    const expectedPages = Math.max(1, Math.ceil(total / CAPTURE_EXPORT_PAGE_SIZE));
    if (!result.items.length || rows.length >= total || page >= expectedPages) break;
    page += 1;
  }
  return rows;
}

type CaptureExportColumn = {
  header: string;
  key: string;
  width: number;
  value: (row: robotsApi.InterceptCaptureItem) => unknown;
};

const captureExportColumns: CaptureExportColumn[] = [
  { header: '捕获时间', key: 'capturedAt', width: 22, value: (row) => formatDateTime(row.capturedAt || row.createdAt) },
  { header: '机器人', key: 'robotName', width: 22, value: captureRobotName },
  { header: '平台', key: 'platform', width: 12, value: (row) => dictLabel(platformOptions, row.platform) },
  { header: '来源', key: 'targetType', width: 14, value: (row) => row.targetType || '' },
  { header: '用户主页链接', key: 'homepageUrl', width: 46, value: (row) => row.homepageUrl || row.targetUrl || '' },
  { header: '作品链接', key: 'contentUrl', width: 46, value: (row) => row.contentUrl || '' },
  { header: '作品ID', key: 'platformContentId', width: 24, value: (row) => row.platformContentId || '' },
  { header: '作品标题', key: 'contentTitle', width: 28, value: (row) => row.contentTitle || '' },
  { header: '已捕获评论数', key: 'capturedCommentCount', width: 16, value: (row) => row.capturedCommentCount || 1 },
  { header: '评论用户', key: 'nickname', width: 18, value: (row) => row.nickname || '' },
  { header: '评论用户ID', key: 'userId', width: 24, value: (row) => row.userId || '' },
  { header: '评论内容', key: 'commentText', width: 46, value: (row) => row.commentText || '' },
  { header: '评论地区', key: 'visibleRegion', width: 14, value: (row) => row.visibleRegion || '' },
  { header: '评论时间', key: 'commentTimeIso', width: 22, value: (row) => formatDateTime(row.commentTimeIso) },
  { header: '分析状态', key: 'intentAnalysisStatus', width: 14, value: (row) => dictLabel(analysisStatusOptions, readCaptureRaw(row, 'intentAnalysisStatus') || 'PENDING') },
  { header: '意向等级', key: 'intentLevel', width: 16, value: (row) => dictLabel(intentLevelOptions, captureIntentLevel(row) || '') },
  { header: '意向分', key: 'intentScore', width: 12, value: (row) => readCaptureRaw(row, 'intentScore') },
  { header: '建议私信', key: 'shouldPrivateMessage', width: 12, value: (row) => readCaptureRaw(row, 'shouldPrivateMessage') === 'true' ? '是' : '否' },
  { header: '切入点/原因', key: 'entryPoint', width: 42, value: captureEntryPoint },
  { header: '切入回复', key: 'privateMessageDraft', width: 52, value: (row) => readCaptureRaw(row, 'privateMessageDraft') || readCaptureRaw(row, 'messageDraft') || readCaptureRaw(row, 'messageFinal') },
  { header: 'AI风险等级', key: 'aiRiskLevel', width: 14, value: (row) => readCaptureRaw(row, 'aiRiskLevel') || readCaptureRaw(row, 'riskLevel') },
  { header: '评论ID', key: 'commentId', width: 26, value: (row) => row.commentId || '' },
  { header: '记录ID', key: 'id', width: 30, value: (row) => row.id || '' }
];

async function writeCaptureExportWorkbook(rows: robotsApi.InterceptCaptureItem[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('捕获数据');
  sheet.columns = captureExportColumns.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  rows.forEach((row) => {
    const data = captureExportColumns.reduce<Record<string, string>>((acc, column) => {
      acc[column.key] = sanitizeExcelCell(column.value(row));
      return acc;
    }, {});
    sheet.addRow(data);
  });
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: captureExportColumns.length }
  };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: rowNumber > 1 };
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadExcelBlob(buffer as BlobPart, filename);
}

function sanitizeExcelCell(value: unknown) {
  const text = value === undefined || value === null ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function dictLabel(options: Array<{ label: string; value: string }>, value?: string) {
  if (!value) return '';
  const normalized = String(value).toLowerCase();
  return options.find((item) => item.value === value || String(item.value).toLowerCase() === normalized)?.label || value;
}

function downloadExcelBlob(buffer: BlobPart, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatExportDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function handleCaptureSelectionChange(selection: robotsApi.InterceptCaptureItem[]) {
  captureSelection.value = selection;
  if (!selectedCaptureDetail.value && selection.length) selectedCaptureDetail.value = selection[0];
}

function clearCaptureSelection() {
  captureSelection.value = [];
  selectedCaptureDetail.value = null;
  captureTableRef.value?.clearSelection();
}

async function deleteSingleCapture(row: robotsApi.InterceptCaptureItem) {
  await ElMessageBox.confirm(`确认删除评论用户「${row.nickname || row.userId || '--'}」的这条捕获数据？`, '删除确认', { type: 'warning' });
  captureDeleting.value = true;
  try {
    const result = await robotsApi.deleteInterceptCapture(row.id);
    ElMessage.success(`已删除 ${result.deleted || 0} 条捕获数据`);
    await fetchCaptureList();
  } finally {
    captureDeleting.value = false;
  }
}

async function deleteSelectedCaptures() {
  const ids = Array.from(new Set(captureSelection.value.map((item) => item.id).filter(Boolean)));
  if (!ids.length) return;
  await ElMessageBox.confirm(`确认删除已选的 ${ids.length} 条捕获数据？`, '批量删除确认', { type: 'warning' });
  captureDeleting.value = true;
  try {
    const result = await robotsApi.deleteInterceptCaptureBatch(ids);
    ElMessage.success(`已删除 ${result.deleted || 0} 条捕获数据`);
    await fetchCaptureList();
  } finally {
    captureDeleting.value = false;
  }
}

async function clearCaptureList() {
  if (capturePagination.value.total <= 0) return;
  await ElMessageBox.confirm('确认一键删除当前筛选条件下的捕获数据？该操作不可恢复。', '一键删除确认', { type: 'warning', confirmButtonText: '确认删除' });
  captureDeleting.value = true;
  try {
    const result = await robotsApi.clearInterceptCaptures(captureFilters.value);
    ElMessage.success(`已删除 ${result.deleted || 0} 条捕获数据`);
    await fetchCaptureList(true);
  } finally {
    captureDeleting.value = false;
  }
}


async function reanalyzeFailedCaptures() {
  await ElMessageBox.confirm('确认提取当前筛选条件下“分析失败”的捕获数据？系统会按每 20 条生成一个待重试批次，不会自动发起分析，需要你在批次列表里手动重试。', '提取失败数据', { type: 'warning', confirmButtonText: '提取失败数据' });
  captureReanalyzing.value = true;
  try {
    const result = await robotsApi.retryFailedInterceptCaptureAnalysis({ ...captureFilters.value, limit: 500 });
    if (!result.captureCount) {
      ElMessage.info(result.message || '当前筛选条件下没有分析失败的数据');
      return;
    }
    ElMessage.success(result.message || `已提取 ${result.captureCount} 条失败数据，生成 ${result.batchCount || 0} 个待重试批次`);
    analysisBatchDialogVisible.value = true;
    await fetchAnalysisBatchList(true);
  } finally {
    captureReanalyzing.value = false;
  }
}


async function fetchPromptConfigList(resetPage = false) {
  if (resetPage) promptPagination.value.page = 1;
  promptLoading.value = true;
  try {
    const result = await robotsApi.listInterceptIntentPromptConfigs({
      page: promptPagination.value.page,
      pageSize: promptPagination.value.pageSize,
      keyword: promptFilters.value.keyword,
      status: promptFilters.value.status
    });
    promptItems.value = result.items;
    promptPagination.value = { page: result.page, pageSize: promptPagination.value.pageSize, total: result.total };
  } finally {
    promptLoading.value = false;
  }
}

function resetPromptFilters() {
  promptFilters.value = { keyword: '', status: '' };
  fetchPromptConfigList(true);
}

function defaultPromptForm(): robotsApi.InterceptIntentPromptConfigPayload {
  return JSON.parse(JSON.stringify(DEFAULT_INTERCEPT_INTENT_PROMPT_FORM));
}

function applySelectedPromptPreset() {
  const preset = interceptPromptPresets.find((item) => item.key === selectedPromptPresetKey.value);
  if (!preset) return;
  const keepIsDefault = promptForm.value.isDefault === true;
  promptForm.value = { ...defaultPromptForm(), ...JSON.parse(JSON.stringify(preset.payload)), isDefault: keepIsDefault };
  ElMessage.success('已回填默认场景配置，可继续调整后保存');
}

function openCreatePromptConfig() {
  editingPromptConfig.value = null;
  promptDialogMode.value = 'create';
  selectedPromptPresetKey.value = 'douyin_intercept_tool';
  promptForm.value = defaultPromptForm();
  promptForm.value.isDefault = promptItems.value.length === 0;
  promptDialogVisible.value = true;
}

function openEditPromptConfig(row: robotsApi.InterceptIntentPromptConfigItem) {
  editingPromptConfig.value = row;
  promptDialogMode.value = 'edit';
  selectedPromptPresetKey.value = 'douyin_intercept_tool';
  promptForm.value = { ...defaultPromptForm(), ...(row.extraParams || {}), ...row, batchSize: row.batchSize || 20 };
  promptDialogVisible.value = true;
}

function openTestPromptConfig(row: robotsApi.InterceptIntentPromptConfigItem) {
  promptTestConfig.value = { ...defaultPromptForm(), ...row, promptConfigId: row.id };
  promptTestDrawerVisible.value = true;
}

function openTestPromptConfigFromForm() {
  const payload = buildPromptPayload();
  if (!payload.name) {
    ElMessage.warning('请先填写配置名称');
    return;
  }
  promptTestConfig.value = {
    ...payload,
    promptConfigId: editingPromptConfig.value?.id
  };
  promptTestDrawerVisible.value = true;
}

function buildPromptPayload(): robotsApi.InterceptIntentPromptConfigPayload {
  const extraKeys = [
    'clientName', 'mainBusiness', 'mainProducts', 'targetScenarios', 'customerPainPoints', 'positiveKeywords', 'negativeKeywords',
    'highIntentKeywords', 'nonLeadSignals', 'allowedOffers', 'accountPersona', 'forbiddenClaims', 'ctaPolicy', 'workflowMode',
    'videoDesc', 'videoRelevanceRules', 'commentScoringRules', 'riskRoutingRules', 'scriptGenerationRules', 'businessProfile'
  ] as const;
  const extraParams: Record<string, unknown> = { ...(promptForm.value.extraParams || {}) };
  extraKeys.forEach((key) => {
    const value = promptForm.value[key];
    if (value !== undefined && value !== null && String(value).trim()) extraParams[key] = value;
  });
  return {
    ...promptForm.value,
    name: (promptForm.value.name || '').trim(),
    workflowId: (promptForm.value.workflowId || '').trim() || DEFAULT_INTERCEPT_INTENT_PROMPT_FORM.workflowId,
    batchSize: Math.max(1, Math.min(20, Number(promptForm.value.batchSize || 20))),
    platform: (promptForm.value.platform || 'douyin').trim() || 'douyin',
    extraParams,
    status: promptForm.value.status || 'ENABLED',
    isDefault: promptForm.value.isDefault === true
  };
}

async function submitPromptConfig() {
  const payload = buildPromptPayload();
  if (!payload.name) {
    ElMessage.warning('请输入配置名称');
    return;
  }
  promptSubmitting.value = true;
  try {
    if (promptDialogMode.value === 'create') {
      await robotsApi.createInterceptIntentPromptConfig(payload);
      ElMessage.success('提示词配置已新增');
    } else if (editingPromptConfig.value) {
      await robotsApi.updateInterceptIntentPromptConfig(editingPromptConfig.value.id, payload);
      ElMessage.success('提示词配置已更新');
    }
    promptDialogVisible.value = false;
    await fetchPromptConfigList(true);
  } finally {
    promptSubmitting.value = false;
  }
}

async function setDefaultPromptConfig(row: robotsApi.InterceptIntentPromptConfigItem) {
  await robotsApi.setDefaultInterceptIntentPromptConfig(row.id);
  ElMessage.success('已设为默认提示词配置');
  await fetchPromptConfigList();
}

async function removePromptConfig(row: robotsApi.InterceptIntentPromptConfigItem) {
  await ElMessageBox.confirm(`确认删除提示词配置「${row.name}」？`, '删除确认', { type: 'warning' });
  await robotsApi.removeInterceptIntentPromptConfig(row.id);
  ElMessage.success('提示词配置已删除');
  await fetchPromptConfigList(true);
}

function openCreateTaskDialog() {
  if (!captureSelection.value.length) return;
  if (!privateItems.value.length) fetchPrivateRobots(true);
  selectedCaptureDetail.value = captureSelection.value[0];
  const now = new Date();
  const end = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  taskPlannedRange.value = [toLocalDateTimeValue(now.toISOString()), toLocalDateTimeValue(end.toISOString())];
  taskRobotId.value = privateItems.value[0]?.id || '';
  taskMessageOverrides.value = captureSelection.value.reduce<Record<string, string>>((acc, item) => {
    acc[item.id] = getDefaultTaskMessage(item);
    return acc;
  }, {});
  taskDialogVisible.value = true;
}

async function submitCreateTasks() {
  if (!taskRobotId.value) {
    ElMessage.warning('请选择主动私信机器人');
    return;
  }
  if (!Array.isArray(taskPlannedRange.value) || taskPlannedRange.value.length !== 2) {
    ElMessage.warning('请选择任务执行时间范围');
    return;
  }
  taskCreating.value = true;
  try {
    const result = await robotsApi.createPrivateMessageTasks({
      captureIds: captureSelection.value.map((item) => item.id),
      robotIds: [taskRobotId.value],
      plannedStartAt: normalizeDateTime(taskPlannedRange.value[0]),
      plannedEndAt: normalizeDateTime(taskPlannedRange.value[1]),
      sendMode: 'MANUAL_CREATE',
      messageOverrides: captureSelection.value.map((item) => ({ captureId: item.id, messageFinal: taskMessageOverrides.value[item.id] || getDefaultTaskMessage(item) }))
    });
    ElMessage.success(`已创建 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`);
    taskDialogVisible.value = false;
    activeTab.value = 'tasks';
    await Promise.all([fetchCaptureList(), fetchTaskList(true), fetchPrivateRobots()]);
  } finally {
    taskCreating.value = false;
  }
}

async function fetchTaskList(resetPage = false) {
  if (resetPage) taskPagination.value.page = 1;
  taskLoading.value = true;
  try {
    const result = await robotsApi.listPrivateMessageTasks({
      page: taskPagination.value.page,
      pageSize: taskPagination.value.pageSize,
      keyword: taskFilters.value.keyword,
      platform: taskFilters.value.platform,
      robotId: taskFilters.value.robotId,
      status: taskFilters.value.status,
      intentLevel: taskFilters.value.intentLevel,
      createdStartAt: taskCreatedRange.value?.[0] ? normalizeDateTime(taskCreatedRange.value[0]) : undefined,
      createdEndAt: taskCreatedRange.value?.[1] ? normalizeDateTime(taskCreatedRange.value[1]) : undefined
    });
    taskItems.value = result.items;
    taskPagination.value = { page: result.page, pageSize: taskPagination.value.pageSize, total: result.total };
    taskSelection.value = [];
    taskTableRef.value?.clearSelection();
  } finally {
    taskLoading.value = false;
  }
}

function resetTaskFilters() {
  taskFilters.value = { keyword: '', platform: '', robotId: '', status: '', intentLevel: '' };
  taskCreatedRange.value = [];
  fetchTaskList(true);
}

function handleTaskSelectionChange(selection: robotsApi.PrivateMessageTaskItem[]) {
  taskSelection.value = selection;
}

function getTaskQueryForDelete(): robotsApi.PrivateMessageTaskQuery {
  return {
    keyword: taskFilters.value.keyword,
    platform: taskFilters.value.platform,
    robotId: taskFilters.value.robotId,
    status: taskFilters.value.status,
    intentLevel: taskFilters.value.intentLevel,
    createdStartAt: taskCreatedRange.value?.[0] ? normalizeDateTime(taskCreatedRange.value[0]) : undefined,
    createdEndAt: taskCreatedRange.value?.[1] ? normalizeDateTime(taskCreatedRange.value[1]) : undefined
  };
}

async function deleteTask(row: robotsApi.PrivateMessageTaskItem) {
  await ElMessageBox.confirm(`确认删除任务「${row.taskNo || row.id}」？该操作不可恢复。`, '删除确认', { type: 'warning' });
  taskDeleting.value = true;
  try {
    const result = await robotsApi.deletePrivateMessageTask(row.id);
    ElMessage.success(`已删除 ${result.deleted || 0} 条任务`);
    await fetchTaskList();
  } finally {
    taskDeleting.value = false;
  }
}

async function deleteSelectedTasks() {
  const ids = Array.from(new Set(taskSelection.value.map((item) => item.id).filter(Boolean)));
  if (!ids.length) return;
  await ElMessageBox.confirm(`确认删除已选的 ${ids.length} 条主动私信任务？该操作不可恢复。`, '批量删除确认', { type: 'warning' });
  taskDeleting.value = true;
  try {
    const result = await robotsApi.deletePrivateMessageTaskBatch(ids);
    ElMessage.success(`已删除 ${result.deleted || 0} 条任务`);
    await fetchTaskList();
  } finally {
    taskDeleting.value = false;
  }
}

async function clearTaskList() {
  if (taskPagination.value.total <= 0) return;
  await ElMessageBox.confirm('确认一键删除当前筛选条件下的主动私信任务？该操作不可恢复。', '一键删除确认', { type: 'warning', confirmButtonText: '确认删除' });
  taskDeleting.value = true;
  try {
    const result = await robotsApi.clearPrivateMessageTasks(getTaskQueryForDelete());
    ElMessage.success(`已删除 ${result.deleted || 0} 条任务`);
    await fetchTaskList(true);
  } finally {
    taskDeleting.value = false;
  }
}

function openEditTaskMessageDialog(row: robotsApi.PrivateMessageTaskItem) {
  editingTask.value = row;
  taskMessageForm.value = row.messageFinal || row.messageDraft || '';
  taskMessageDialogVisible.value = true;
}

async function submitTaskMessageEdit() {
  if (!editingTask.value) return;
  if (!taskMessageForm.value.trim()) {
    ElMessage.warning('请输入主动私信内容');
    return;
  }
  taskMessageSubmitting.value = true;
  try {
    await robotsApi.updatePrivateMessageTaskMessage(editingTask.value.id, taskMessageForm.value.trim());
    ElMessage.success('主动私信文案已更新');
    taskMessageDialogVisible.value = false;
    await fetchTaskList();
  } finally {
    taskMessageSubmitting.value = false;
  }
}

async function openAnalysisBatchDialog() {
  analysisBatchDialogVisible.value = true;
  await fetchAnalysisBatchList(true);
}

async function fetchAnalysisBatchList(resetPage = false) {
  if (resetPage) analysisBatchPagination.value.page = 1;
  analysisBatchLoading.value = true;
  try {
    const result = await robotsApi.listInterceptIntentAnalysisBatches({
      page: analysisBatchPagination.value.page,
      pageSize: analysisBatchPagination.value.pageSize,
      robotId: analysisBatchFilters.value.robotId,
      status: analysisBatchFilters.value.status,
      failedRetryOnly: true
    });
    analysisBatchItems.value = result.items;
    analysisBatchPagination.value = { page: result.page, pageSize: analysisBatchPagination.value.pageSize, total: result.total };
  } finally {
    analysisBatchLoading.value = false;
  }
}

function resetAnalysisBatchFilters() {
  analysisBatchFilters.value = { robotId: '', status: '' };
  fetchAnalysisBatchList(true);
}

function canRetryAnalysisBatch(row: robotsApi.InterceptIntentAnalysisBatchItem) {
  return ['PENDING', 'FAILED', 'PARTIAL_FAILED'].includes(row.status);
}

function firstAnalysisError(row: robotsApi.InterceptIntentAnalysisBatchItem) {
  return row.chunks.find((item) => item.errorMessage)?.errorMessage || '';
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isAnalysisBatchFinished(status: string) {
  return ['SUCCEEDED', 'FAILED', 'PARTIAL_FAILED', 'SKIPPED'].includes(String(status || ''));
}

async function waitAnalysisBatchFinished(id: string, maxWaitMs = 30 * 60 * 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(3000);
    const latest = await robotsApi.detailInterceptIntentAnalysisBatch(id);
    await fetchAnalysisBatchList();
    if (isAnalysisBatchFinished(latest.status)) return latest;
  }
  throw new Error('等待批次分析完成超时，后台仍会继续执行，请稍后刷新查看结果');
}

async function retryAnalysisBatch(row: robotsApi.InterceptIntentAnalysisBatchItem) {
  analysisBatchRetryingId.value = row.id;
  try {
    await robotsApi.retryInterceptIntentAnalysisBatch(row.id);
    ElMessage.success('已提交后台重析，正在等待该批次完成');
    const latest = await waitAnalysisBatchFinished(row.id);
    await fetchCaptureList();
    ElMessage.success(latest.status === 'SUCCEEDED' ? '该批次重析完成' : '该批次重析结束，请查看结果');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批次重析失败，请稍后刷新查看结果');
  } finally {
    analysisBatchRetryingId.value = '';
  }
}

async function retryAllAnalysisBatches() {
  const rows = analysisBatchItems.value.filter(canRetryAnalysisBatch);
  if (!rows.length) return;
  await ElMessageBox.confirm(`确认按当前列表顺序重试 ${rows.length} 个失败数据批次？每个批次最多 20 条，会逐批提交到后端后台分析；前端只轮询状态，不会再等待单个接口长时间返回。`, '全部重试确认', { type: 'warning', confirmButtonText: '全部重试' });
  analysisBatchRetryingAll.value = true;
  try {
    let finished = 0;
    for (const row of rows) {
      analysisBatchRetryingId.value = row.id;
      await robotsApi.retryInterceptIntentAnalysisBatch(row.id);
      await waitAnalysisBatchFinished(row.id);
      finished += 1;
      await fetchCaptureList();
    }
    ElMessage.success(`已完成 ${finished} 个批次重析`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '全部重析执行中断，请稍后刷新查看结果');
  } finally {
    analysisBatchRetryingId.value = '';
    analysisBatchRetryingAll.value = false;
  }
}

function isPrivateEnabled(row: UiRobotItem) {
  const config = row.leadPrivateMessageConfig || row.privateMessageConfig || readObject(row.config, 'leadPrivateMessage') || readObject(row.config, 'privateMessage');
  return config.enabled !== false;
}

function viewTaskDetail(row: robotsApi.PrivateMessageTaskItem) {
  ElMessageBox.alert(
    `任务编号：${row.taskNo || '--'}\n用户昵称：${row.targetNickname || '--'}\n用户评论：${row.sourceCommentText || '--'}\n主动私信内容：${row.messageFinal || row.messageDraft || '--'}\n失败原因：${row.sendError || '--'}`,
    '主动私信任务详情',
    { confirmButtonText: '知道了' }
  );
}

async function cancelTask(row: robotsApi.PrivateMessageTaskItem) {
  await ElMessageBox.confirm(`确认取消任务「${row.taskNo || row.id}」？`, '取消确认', { type: 'warning' });
  await robotsApi.cancelPrivateMessageTask(row.id);
  ElMessage.success('任务已取消');
  await fetchTaskList();
}

async function retryTask(row: robotsApi.PrivateMessageTaskItem) {
  await robotsApi.retryPrivateMessageTask(row.id);
  ElMessage.success('任务已重试');
  await fetchTaskList();
}

function isTaskTerminal(status?: string) {
  return ['SENT', 'FAILED', 'SKIPPED', 'BLOCKED', 'CANCELED', 'EXPIRED'].includes(status || '');
}

function canRetryTask(status?: string) {
  return ['FAILED', 'BLOCKED', 'EXPIRED', 'SKIPPED', 'CANCELED'].includes(status || '');
}

function canEditTaskMessage(status?: string) {
  return !['CLAIMED', 'RUNNING', 'SENT'].includes(status || '');
}

function captureEntryPoint(row: robotsApi.InterceptCaptureItem) {
  return readCaptureRaw(row, 'entryPointSummary') || readCaptureRaw(row, 'entryPoint') || readCaptureRaw(row, 'entryDec') || readCaptureRaw(row, 'intentReason') || '--';
}

function getDefaultTaskMessage(capture: robotsApi.InterceptCaptureItem) {
  return readCaptureRaw(capture, 'privateMessageDraft') || readCaptureRaw(capture, 'messageDraft') || readCaptureRaw(capture, 'messageFinal') || privateForm.value.defaultMessageTemplate || '';
}

function captureRobotName(row: robotsApi.InterceptCaptureItem) {
  const robot = row.robot && typeof row.robot === 'object' ? row.robot : null;
  return (robot && String((robot as any).name || '')) || interceptItems.value.find((item) => item.id === row.robotId)?.name || row.robotId || '--';
}

function captureIntentLevel(row: robotsApi.InterceptCaptureItem) {
  return (readCaptureRaw(row, 'intentLevel') || '').toUpperCase() || undefined;
}

function readCaptureRaw(row: robotsApi.InterceptCaptureItem, key: string) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const value = (raw as Record<string, unknown>)[key];
  return value === undefined || value === null ? '' : String(value);
}

function normalizeUiRobot(item: robotsApi.RobotItem): UiRobotItem {
  const auth = item.auth ?? {};
  const device = item.device ?? {};
  const authStatus = mapAuthStatus(readString(auth, ['status']));
  const runStatus = mapRunStatus(item.status, item.expireAt, authStatus, readString(device, ['status']));
  return {
    ...item,
    code: item.code || item.id.slice(0, 8),
    platform: mapPlatform(item.platform),
    accountName: readString(auth, ['accountName', 'name', 'displayName']) || '--',
    deviceName: readString(device, ['name', 'deviceCode']) || '--',
    authStatus,
    runStatus,
    expiredAt: item.expireAt || '',
    lastActiveAt: item.lastActiveAt || item.lastHeartbeatAt || item.updatedAt || '',
    executionStatus: item.executionStatus || ((readObject(item.config, 'leadPrivateMessage').paused || readObject(item.config, 'privateMessage').paused) ? 'PAUSED' : 'IDLE'),
    todaySentCount: item.todaySentCount || 0,
    dailySendLimit: item.dailySendLimit || Number(readObject(item.leadPrivateMessageConfig || item.privateMessageConfig, '').dailySendLimit || 0),
    pendingTaskCount: item.pendingTaskCount || 0
  };
}

function defaultPrivateForm(): robotsApi.PrivateMessageRobotPayload {
  return {
    name: '',
    platform: 'DOUYIN',
    enabled: true,
    paused: false,
    minSendIntervalSeconds: 30,
    maxSendIntervalSeconds: 90,
    workStartTime: '09:00',
    workEndTime: '22:00',
    sleepStartTime: '',
    sleepEndTime: '',
    dailySendLimit: 50,
    hourlySendLimit: 10,
    userTouchIntervalDays: 7,
    maxConsecutiveFailures: 5,
    claimBatchSize: 1,
    defaultMessageTemplate: '您好，看到您刚才的评论，想和您进一步沟通一下，方便的话可以回复我了解详情。',
    remark: ''
  };
}

function privateFormFromRow(row: UiRobotItem): robotsApi.PrivateMessageRobotPayload {
  const leadConfig = row.leadPrivateMessageConfig || readObject(row.config, 'leadPrivateMessage');
  const legacyConfig = row.privateMessageConfig || readObject(row.config, 'privateMessage');
  const config = Object.keys(leadConfig).length ? leadConfig : legacyConfig;
  return { ...defaultPrivateForm(), ...config, name: row.name, platform: row.platform, remark: row.remark || '' } as robotsApi.PrivateMessageRobotPayload;
}

function normalizeConfig(config: Record<string, unknown> | undefined) {
  if (!config) return {};
  const raw = (config as { value?: unknown }).value;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  return config;
}

function readObject(record: Record<string, unknown> | null | undefined, key: string) {
  if (!record) return {} as Record<string, unknown>;
  const normalized = normalizeConfig(record);
  if (!key) return normalized;
  const value = normalized[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function normalizeDateTime(value: string) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toLocalDateTimeValue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isExpired(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function mapAuthStatus(status: string) {
  if (status === 'AUTHORIZED') return 'AUTHORIZED';
  if (status === 'WAIT_QR' || status === 'SCANNING') return 'PENDING_QR';
  if (status === 'AUTH_EXPIRED') return 'AUTH_EXPIRED';
  return 'UNAUTHORIZED';
}

function mapRunStatus(status: string, expiredAt?: string, authStatus?: string, deviceStatus?: string) {
  if (isExpired(expiredAt || '') || status === 'DISABLED' || status === 'EXPIRED' || deviceStatus === 'DISABLED') return 'DISABLED';
  if (status === 'RUNNING' || deviceStatus === 'BUSY') return 'RUNNING';
  if (status === 'STOPPED' || status === 'READY' || status === 'DRAFT' || deviceStatus === 'ONLINE' || deviceStatus === 'OFFLINE' || authStatus === 'AUTHORIZED') return 'STOPPED';
  return 'STOPPED';
}

function mapPlatform(platform: string) {
  return ['DOUYIN', 'KUAISHOU', 'XIAOHONGSHU', 'WECHAT', 'WECHAT_VIDEO'].includes(platform) ? platform : 'DOUYIN';
}
</script>
