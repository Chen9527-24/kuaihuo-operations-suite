import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CompleteRobotAuthSessionDto,
  ConsumeRobotPairSessionDto,
  CreateRobotAuthDto,
  CreateInterceptCaptureBatchDto,
  CreateInterceptCaptureViewPresetDto,
  UpdateInterceptCaptureViewPresetDto,
  DeleteInterceptCaptureBatchDto,
  DeletePrivateMessageTaskBatchDto,
  RetryInterceptIntentAnalysisBatchDto,
  RetryFailedInterceptCaptureAnalysisDto,
  RunInterceptWorkDecisionDto,
  TestInterceptIntentPromptConfigDto,
  TestInterceptWorkDecisionDto,
  UpsertInterceptIntentPromptConfigDto,
  UpdateInterceptIntentPromptConfigDto,
  UpdatePrivateMessageTaskMessageDto,
  CreatePrivateMessageRobotDto,
  CreatePrivateMessageTasksDto,
  ClaimPrivateMessageTaskDto,
  ReportPrivateMessageTaskDto,
  CreateRobotAuthSessionDto,
  CreateRobotDeviceDto,
  CreateRobotDto,
  CreateRobotPairSessionDto,
  ReportRobotAuthQrDto,
  RobotDeviceHeartbeatDto,
  StopRobotDto,
  SyncRobotAuthStatusDto,
  UpdatePrivateMessageRobotDto,
  UpdateRobotAuthDto,
  UpdateRobotAuthStatusDto,
  UpdateRobotDeviceDto,
  UpdateRobotDeviceStatusDto,
  UpdateRobotDto,
  UpdateRobotRuntimeStatusDto,
} from './dto/robot.dto';
import { InterceptCaptureQueryDto, InterceptCaptureViewPresetQueryDto, InterceptIntentAnalysisBatchQueryDto, InterceptIntentPromptConfigQueryDto, PrivateMessageRobotQueryDto, PrivateMessageTaskQueryDto, RobotAuthQueryDto, RobotDeviceQueryDto, RobotOptionsQueryDto, RobotQueryDto } from './dto/robot-query.dto';
import { RobotsService } from './robots.service';

@ApiTags('机器人管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'robots', version: '1' })
export class RobotsController {
  constructor(private readonly service: RobotsService) {}


  @Get('lead-private-message')
  @Permissions('robot:read')
  @ApiOperation({ summary: '主动私信机器人分页列表' })
  listPrivateMessageRobots(@Query() query: PrivateMessageRobotQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listPrivateMessageRobots(query, user);
  }

  @Post('lead-private-message')
  @Permissions('robot:create')
  @ApiOperation({ summary: '新增主动私信机器人' })
  createPrivateMessageRobot(@Body() dto: CreatePrivateMessageRobotDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createPrivateMessageRobot(dto, user);
  }

  @Get('lead-private-message/:id/runtime-config')
  @Permissions('robot:read')
  @ApiOperation({ summary: 'bot 读取主动私信机器人运行配置' })
  getPrivateMessageRuntimeConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getPrivateMessageRuntimeConfig(id, user);
  }

  @Get('lead-private-message/:id')
  @Permissions('robot:read')
  @ApiOperation({ summary: '主动私信机器人详情' })
  detailPrivateMessageRobot(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailPrivateMessageRobot(id, user);
  }

  @Put('lead-private-message/:id')
  @Patch('lead-private-message/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '编辑主动私信机器人' })
  updatePrivateMessageRobot(@Param('id') id: string, @Body() dto: UpdatePrivateMessageRobotDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updatePrivateMessageRobot(id, dto, user);
  }

  @Post('lead-private-message/:id/pause')
  @Permissions('robot:update')
  @ApiOperation({ summary: '暂停主动私信机器人' })
  pausePrivateMessageRobot(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.pausePrivateMessageRobot(id, user);
  }

  @Post('lead-private-message/:id/resume')
  @Permissions('robot:update')
  @ApiOperation({ summary: '恢复主动私信机器人' })
  resumePrivateMessageRobot(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resumePrivateMessageRobot(id, user);
  }

  @Delete('lead-private-message/:id')
  @Permissions('robot:delete')
  @ApiOperation({ summary: '删除主动私信机器人' })
  removePrivateMessageRobot(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removePrivateMessageRobot(id, user);
  }

  @Get('lead-private-message-tasks')
  @Permissions('robot:read')
  @ApiOperation({ summary: '主动私信任务队列分页列表' })
  listPrivateMessageTasks(@Query() query: PrivateMessageTaskQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listPrivateMessageTasks(query, user);
  }

  @Post('lead-private-message-tasks')
  @Permissions('robot:update')
  @ApiOperation({ summary: '从截流捕获数据创建主动私信任务' })
  createPrivateMessageTasks(@Body() dto: CreatePrivateMessageTasksDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createPrivateMessageTasks(dto, user);
  }

  @Delete('lead-private-message-tasks/batch')
  @Permissions('robot:update')
  @ApiOperation({ summary: '批量删除主动私信任务' })
  deletePrivateMessageTaskBatch(@Body() dto: DeletePrivateMessageTaskBatchDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deletePrivateMessageTaskBatch(dto, user);
  }

  @Delete('lead-private-message-tasks')
  @Permissions('robot:update')
  @ApiOperation({ summary: '一键删除主动私信任务', description: '按当前租户和筛选条件删除主动私信任务。' })
  clearPrivateMessageTasks(@Query() query: PrivateMessageTaskQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.clearPrivateMessageTasks(query, user);
  }

  @Patch('lead-private-message-tasks/:id/message')
  @Permissions('robot:update')
  @ApiOperation({ summary: '编辑主动私信任务文案' })
  updatePrivateMessageTaskMessage(@Param('id') id: string, @Body() dto: UpdatePrivateMessageTaskMessageDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updatePrivateMessageTaskMessage(id, dto, user);
  }

  @Delete('lead-private-message-tasks/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '删除单条主动私信任务' })
  deletePrivateMessageTask(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deletePrivateMessageTask(id, user);
  }

  @Post('lead-private-message-tasks/claim')
  @Permissions('robot:update')
  @ApiOperation({ summary: 'bot 领取主动私信任务' })
  claimPrivateMessageTasks(@Body() dto: ClaimPrivateMessageTaskDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.claimPrivateMessageTasks(dto, user);
  }

  @Post('lead-private-message-tasks/report')
  @Permissions('robot:update')
  @ApiOperation({ summary: 'bot 回传主动私信任务结果' })
  reportPrivateMessageTask(@Body() dto: ReportPrivateMessageTaskDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.reportPrivateMessageTask(dto, user);
  }

  @Post('lead-private-message-tasks/:id/cancel')
  @Permissions('robot:update')
  @ApiOperation({ summary: '取消主动私信任务' })
  cancelPrivateMessageTask(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.cancelPrivateMessageTask(id, user);
  }

  @Post('lead-private-message-tasks/:id/retry')
  @Permissions('robot:update')
  @ApiOperation({ summary: '重试主动私信任务' })
  retryPrivateMessageTask(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.retryPrivateMessageTask(id, user);
  }



  @Get('intercept-intent-prompt-configs')
  @Permissions('robot:read')
  @ApiOperation({ summary: '截流意向分析提示词配置列表' })
  listInterceptIntentPromptConfigs(@Query() query: InterceptIntentPromptConfigQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listInterceptIntentPromptConfigs(query, user);
  }

  @Get('intercept-intent-prompt-configs/:id')
  @Permissions('robot:read')
  @ApiOperation({ summary: '截流意向分析提示词配置详情' })
  detailInterceptIntentPromptConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailInterceptIntentPromptConfig(id, user);
  }

  @Post('intercept-intent-prompt-configs')
  @Permissions('robot:create')
  @ApiOperation({ summary: '新增截流意向分析提示词配置' })
  createInterceptIntentPromptConfig(@Body() dto: UpsertInterceptIntentPromptConfigDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createInterceptIntentPromptConfig(dto, user);
  }

  @Patch('intercept-intent-prompt-configs/:id')
  @Put('intercept-intent-prompt-configs/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '编辑截流意向分析提示词配置' })
  updateInterceptIntentPromptConfig(@Param('id') id: string, @Body() dto: UpdateInterceptIntentPromptConfigDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateInterceptIntentPromptConfig(id, dto, user);
  }

  @Post('intercept-intent-prompt-configs/:id/default')
  @Permissions('robot:update')
  @ApiOperation({ summary: '设为截流意向分析默认提示词配置' })
  setDefaultInterceptIntentPromptConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setDefaultInterceptIntentPromptConfig(id, user);
  }

  @Delete('intercept-intent-prompt-configs/:id')
  @Permissions('robot:delete')
  @ApiOperation({ summary: '删除截流意向分析提示词配置（软删除）' })
  removeInterceptIntentPromptConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeInterceptIntentPromptConfig(id, user);
  }

  @Post('intercept-intent-prompt-configs/test')
  @Permissions('robot:read')
  @ApiOperation({ summary: '测试截流意向分析提示词配置效果', description: '只调用 Coze 工作流返回测试结果，不写入捕获数据和分析批次。' })
  testInterceptIntentPromptConfig(@Body() dto: TestInterceptIntentPromptConfigDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.testInterceptIntentPromptConfig(dto, user);
  }


  @Post('intercept-work-decision/test')
  @Permissions('robot:read')
  @ApiOperation({ summary: '测试截流作品是否需要机器人继续执行', description: '调用独立 Coze 工作流，仅返回 shouldRun/reason，不写入捕获数据。' })
  testInterceptWorkDecision(@Body() dto: TestInterceptWorkDecisionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.testInterceptWorkDecision(dto, user);
  }

  @Get('intercept-capture-view-presets')
  @Permissions('robot:read')
  @ApiOperation({ summary: '获取当前用户的截流捕获字段预设' })
  listInterceptCaptureViewPresets(@Query() query: InterceptCaptureViewPresetQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listInterceptCaptureViewPresets(query, user);
  }

  @Post('intercept-capture-view-presets')
  @Permissions('robot:update')
  @ApiOperation({ summary: '新增截流捕获字段预设' })
  createInterceptCaptureViewPreset(@Body() dto: CreateInterceptCaptureViewPresetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createInterceptCaptureViewPreset(dto, user);
  }

  @Patch('intercept-capture-view-presets/:id')
  @Put('intercept-capture-view-presets/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '更新截流捕获字段预设' })
  updateInterceptCaptureViewPreset(@Param('id') id: string, @Body() dto: UpdateInterceptCaptureViewPresetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateInterceptCaptureViewPreset(id, dto, user);
  }

  @Post('intercept-capture-view-presets/:id/default')
  @Permissions('robot:update')
  @ApiOperation({ summary: '设为默认截流捕获字段预设' })
  setDefaultInterceptCaptureViewPreset(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setDefaultInterceptCaptureViewPreset(id, user);
  }

  @Delete('intercept-capture-view-presets/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '删除截流捕获字段预设' })
  removeInterceptCaptureViewPreset(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeInterceptCaptureViewPreset(id, user);
  }

  @Get('intercept-captures')
  @Permissions('robot:read')
  @ApiOperation({ summary: '截流机器人捕获数据分页列表' })
  listInterceptCaptures(@Query() query: InterceptCaptureQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listInterceptCaptures(query, user);
  }

  @Get('intercept-captures/intent-analysis-batches')
  @Permissions('robot:read')
  @ApiOperation({ summary: '截流评论意向分析批次列表' })
  listInterceptIntentAnalysisBatches(@Query() query: InterceptIntentAnalysisBatchQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listInterceptIntentAnalysisBatches(query, user);
  }

  @Get('intercept-captures/intent-analysis-batches/:id')
  @Permissions('robot:read')
  @ApiOperation({ summary: '截流评论意向分析批次详情' })
  detailInterceptIntentAnalysisBatch(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailInterceptIntentAnalysisBatch(id, user);
  }

  @Post('intercept-captures/intent-analysis-batches/:id/retry')
  @Permissions('robot:update')
  @ApiOperation({ summary: '重试截流评论意向分析失败子批次' })
  retryInterceptIntentAnalysisBatch(@Param('id') id: string, @Body() dto: RetryInterceptIntentAnalysisBatchDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.retryInterceptIntentAnalysisBatch(id, dto, user);
  }

  @Post('intercept-captures/intent-analysis-failed/retry')
  @Permissions('robot:update')
  @ApiOperation({ summary: '提取当前筛选条件下分析失败的截流数据并生成待重试批次' })
  retryFailedInterceptCaptureAnalysis(@Body() dto: RetryFailedInterceptCaptureAnalysisDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.retryFailedInterceptCaptureAnalysis(dto, user);
  }

  @Delete('intercept-captures/batch')
  @Permissions('robot:update')
  @ApiOperation({ summary: '批量删除截流机器人捕获数据' })
  deleteInterceptCaptureBatch(@Body() dto: DeleteInterceptCaptureBatchDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteInterceptCaptureBatch(dto, user);
  }

  @Delete('intercept-captures/:captureId')
  @Permissions('robot:update')
  @ApiOperation({ summary: '删除单条截流机器人捕获数据' })
  deleteInterceptCapture(@Param('captureId') captureId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteInterceptCapture(captureId, user);
  }

  @Delete('intercept-captures')
  @Permissions('robot:update')
  @ApiOperation({ summary: '清空截流机器人捕获数据', description: '不勾选记录时可按当前租户/机器人/平台一键清空捕获数据。' })
  clearInterceptCaptures(@Query() query: InterceptCaptureQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.clearInterceptCaptures(query, user);
  }

  @Get()
  @Permissions('robot:read')
  @ApiOperation({ summary: '机器人列表' })
  list(@Query() query: RobotQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Post('refresh-expired')
  @Permissions('robot:update')
  @ApiOperation({ summary: '手动刷新已过期机器人' })
  refreshExpired(@Query('tenantId') tenantId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.refreshExpired(user, tenantId);
  }

  @Get('devices')
  @Permissions('robot:device:read')
  @ApiOperation({ summary: '机器人设备列表' })
  listDevices(@Query() query: RobotDeviceQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listDevices(query, user);
  }

  @Get('devices/options')
  @Permissions('robot:device:read')
  @ApiOperation({ summary: '机器人设备下拉选项' })
  deviceOptions(@Query() query: RobotOptionsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deviceOptions(query, user);
  }

  @Get('devices/:id')
  @Permissions('robot:device:read')
  @ApiOperation({ summary: '机器人设备详情' })
  detailDevice(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailDevice(id, user);
  }

  @Post('devices')
  @Permissions('robot:device:create')
  @ApiOperation({ summary: '新增机器人设备' })
  createDevice(@Body() dto: CreateRobotDeviceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createDevice(dto, user);
  }

  @Patch('devices/:id')
  @Permissions('robot:device:update')
  @ApiOperation({ summary: '编辑机器人设备' })
  updateDevice(@Param('id') id: string, @Body() dto: UpdateRobotDeviceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDevice(id, dto, user);
  }

  @Patch('devices/:id/status')
  @Permissions('robot:device:update')
  @ApiOperation({ summary: '更新机器人设备状态' })
  updateDeviceStatus(@Param('id') id: string, @Body() dto: UpdateRobotDeviceStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDeviceStatus(id, dto, user);
  }

  @Post('devices/:id/heartbeat')
  @Permissions('robot:device:update')
  @ApiOperation({ summary: '机器人设备心跳上报' })
  heartbeatDevice(@Param('id') id: string, @Body() dto: RobotDeviceHeartbeatDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.heartbeatDevice(id, dto, user);
  }

  @Delete('devices/:id')
  @Permissions('robot:device:delete')
  @ApiOperation({ summary: '删除机器人设备（软删除）' })
  removeDevice(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeDevice(id, user);
  }

  @Get('auths')
  @Permissions('robot:auth:read')
  @ApiOperation({ summary: '机器人授权列表' })
  listAuths(@Query() query: RobotAuthQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listAuths(query, user);
  }

  @Get('auths/options')
  @Permissions('robot:auth:read')
  @ApiOperation({ summary: '机器人授权下拉选项' })
  authOptions(@Query() query: RobotOptionsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.authOptions(query, user);
  }

  @Get('auths/:id')
  @Permissions('robot:auth:read')
  @ApiOperation({ summary: '机器人授权详情' })
  detailAuth(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailAuth(id, user);
  }

  @Post('auths')
  @Permissions('robot:auth:create')
  @ApiOperation({ summary: '新增机器人授权' })
  createAuth(@Body() dto: CreateRobotAuthDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createAuth(dto, user);
  }

  @Patch('auths/:id')
  @Permissions('robot:auth:update')
  @ApiOperation({ summary: '编辑机器人授权' })
  updateAuth(@Param('id') id: string, @Body() dto: UpdateRobotAuthDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateAuth(id, dto, user);
  }

  @Patch('auths/:id/status')
  @Permissions('robot:auth:update')
  @ApiOperation({ summary: '更新机器人授权状态' })
  updateAuthStatus(@Param('id') id: string, @Body() dto: UpdateRobotAuthStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateAuthStatus(id, dto, user);
  }

  @Delete('auths/:id')
  @Permissions('robot:auth:delete')
  @ApiOperation({ summary: '删除机器人授权（软删除）' })
  removeAuth(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeAuth(id, user);
  }

  @Post('pair-sessions')
  @Permissions('robot:device:update')
  @ApiOperation({ summary: '创建设备配对会话' })
  createPairSession(@Body() dto: CreateRobotPairSessionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createPairSession(dto, user);
  }

  @Get('pair-sessions/:sessionId')
  @Permissions('robot:device:read')
  @ApiOperation({ summary: '查询设备配对会话' })
  getPairSession(@Param('sessionId') sessionId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getPairSession(sessionId, user);
  }

  @Public()
  @Post('pair-sessions/consume')
  @ApiOperation({ summary: 'GUI 消费设备配对会话' })
  consumePairSession(@Body() dto: ConsumeRobotPairSessionDto) {
    return this.service.consumePairSession(dto);
  }

  @Post('auth-sessions')
  @Permissions('robot:auth:update')
  @ApiOperation({ summary: '创建扫码授权会话' })
  createAuthSession(@Body() dto: CreateRobotAuthSessionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createAuthSession(dto, user);
  }

  @Get('auth-sessions/:sessionId')
  @Permissions('robot:auth:read')
  @ApiOperation({ summary: '查询扫码授权会话' })
  getAuthSession(@Param('sessionId') sessionId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getAuthSession(sessionId, user);
  }

  @Public()
  @Post('auth-sessions/report-qr')
  @ApiOperation({ summary: 'GUI 上报码内容' })
  reportAuthQr(@Body() dto: ReportRobotAuthQrDto) {
    return this.service.reportAuthQr(dto);
  }

  @Public()
  @Post('auth-sessions/complete')
  @ApiOperation({ summary: 'GUI 完成扫码授权' })
  completeAuthSession(@Body() dto: CompleteRobotAuthSessionDto) {
    return this.service.completeAuthSession(dto);
  }



  @Patch(':id/auth-sync')
  @Permissions('robot:update')
  @ApiOperation({ summary: 'GUI 同步扫码授权状态', description: '按机器人 ID 同步扫码授权状态；如果机器人尚未绑定授权记录，后端会自动创建授权记录并绑定。' })
  syncRobotAuthStatus(@Param('id') id: string, @Body() dto: SyncRobotAuthStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.syncRobotAuthStatus(id, dto, user);
  }

  @Patch(':id/runtime-status')
  @Permissions('robot:update')
  @ApiOperation({ summary: '同步 PC/GUI 机器人运行状态', description: '仅同步展示状态，不触发后端远程启动或停止流程。' })
  updateRuntimeStatus(@Param('id') id: string, @Body() dto: UpdateRobotRuntimeStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateRuntimeStatus(id, dto, user);
  }



  @Post(':id/intercept-work-decision')
  @Permissions('robot:update')
  @ApiOperation({ summary: '截流机器人作品执行前置判定', description: '按机器人 AI 绑定加载账号资料与业务知识，调用 DeepSeek 或显式 Coze 兼容链路，返回 shouldRun/reason 及决策追踪 ID。' })
  runInterceptWorkDecision(@Param('id') id: string, @Body() dto: RunInterceptWorkDecisionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.runInterceptWorkDecision(id, dto, user);
  }

  @Post(':id/intercept-captures')
  @Permissions('robot:update')
  @ApiOperation({ summary: '截流机器人捕获数据上报', description: '由截流 GUI / 客户端在每轮捕获完成后批量同步到后端。' })
  createInterceptCaptures(@Param('id') id: string, @Body() dto: CreateInterceptCaptureBatchDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createInterceptCaptures(id, dto, user);
  }

  @Get(':id')
  @Permissions('robot:read')
  @ApiOperation({ summary: '机器人详情' })
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detail(id, user);
  }

  @Post()
  @Permissions('robot:create')
  @ApiOperation({ summary: '新增机器人' })
  create(@Body() dto: CreateRobotDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '编辑机器人' })
  update(@Param('id') id: string, @Body() dto: UpdateRobotDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/start')
  @Permissions('robot:start')
  @ApiOperation({ summary: '启动机器人' })
  start(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.start(id, user);
  }

  @Post(':id/stop')
  @Permissions('robot:stop')
  @ApiOperation({ summary: '停止机器人' })
  stop(@Param('id') id: string, @Body() dto: StopRobotDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.stop(id, dto, user);
  }

  @Post(':id/disable')
  @Permissions('robot:update')
  @ApiOperation({ summary: '禁用机器人', description: '远程禁用机器人；本地 UCP 轮询到 DISABLED 后会停止本地会话并回传停止结果。' })
  disable(@Param('id') id: string, @Body() dto: StopRobotDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.disable(id, dto, user);
  }

  @Post(':id/enable')
  @Permissions('robot:update')
  @ApiOperation({ summary: '启用机器人', description: '解除 DISABLED 状态；不会直接启动本地自动化。' })
  enable(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.enable(id, user);
  }

  @Delete(':id')
  @Permissions('robot:delete')
  @ApiOperation({ summary: '删除机器人（软删除）' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
