import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutoRepliesService } from './auto-replies.service';
import {
  ApplyPromptToRobotDto,
  AutoReplyPromptConfigQueryDto,
  CommentRecordQueryDto,
  CommentReplyDatasetQueryDto,
  CommentTestReplyDto,
  DmConversationQueryDto,
  DmTestReplyDto,
  ImportCommentReplyDatasetDto,
  LookupCommentRecordsDto,
  MatchCommentReplyDatasetDto,
  SyncCommentRecordsDto,
  SyncDmConversationsDto,
  SyncRobotPromptConfigDto,
  UpdateAutoReplyPromptConfigDto,
  UpdateCommentReplyDatasetDto,
  UpdateRobotAutoReplySettingDto,
  UpsertAutoReplyPromptConfigDto,
} from './dto/auto-reply.dto';

@ApiTags('评论/私信自动回复')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'auto-replies', version: '1' })
export class AutoRepliesController {
  constructor(private readonly service: AutoRepliesService) {}

  @Get('prompt-configs')
  @Permissions('robot:read')
  @ApiOperation({ summary: '提示词配置列表' })
  listPromptConfigs(@Query() query: AutoReplyPromptConfigQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listPromptConfigs(query, user);
  }

  @Get('prompt-configs/:id')
  @Permissions('robot:read')
  @ApiOperation({ summary: '提示词配置详情' })
  detailPromptConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailPromptConfig(id, user);
  }

  @Post('prompt-configs')
  @Permissions('robot:create')
  @ApiOperation({ summary: '新增提示词配置' })
  createPromptConfig(@Body() dto: UpsertAutoReplyPromptConfigDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createPromptConfig(dto, user);
  }

  @Patch('prompt-configs/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '编辑提示词配置' })
  updatePromptConfig(@Param('id') id: string, @Body() dto: UpdateAutoReplyPromptConfigDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updatePromptConfig(id, dto, user);
  }

  @Delete('prompt-configs/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '删除提示词配置（软删除）' })
  removePromptConfig(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removePromptConfig(id, user);
  }

  @Get('robots/:robotId/settings/:module')
  @Permissions('robot:read')
  @ApiOperation({ summary: '机器人自动回复配置详情' })
  getRobotSetting(
    @Param('robotId') robotId: string,
    @Param('module') module: string,
    @Query('tenantId') tenantId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getRobotSetting(robotId, module, user, tenantId);
  }

  @Patch('robots/:robotId/settings')
  @Permissions('robot:update')
  @ApiOperation({ summary: '保存机器人自动回复配置' })
  updateRobotSetting(@Param('robotId') robotId: string, @Body() dto: UpdateRobotAutoReplySettingDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateRobotSetting(robotId, dto, user);
  }

  @Post('robots/:robotId/prompt-configs/:promptConfigId/apply')
  @Permissions('robot:update')
  @ApiOperation({ summary: '将提示词配置应用到机器人' })
  applyPromptToRobot(
    @Param('robotId') robotId: string,
    @Param('promptConfigId') promptConfigId: string,
    @Body() dto: ApplyPromptToRobotDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.applyPromptToRobot(robotId, promptConfigId, dto, user);
  }

  @Post('robots/:robotId/prompt-config-sync')
  @Permissions('robot:update')
  @ApiOperation({ summary: '将机器人当前提示词快照同步回配置项' })
  syncRobotPromptConfig(@Param('robotId') robotId: string, @Body() dto: SyncRobotPromptConfigDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.syncRobotPromptConfig(robotId, dto, user);
  }

  @Get('comment/reply-datasets')
  @Permissions('robot:read')
  @ApiOperation({ summary: '评论导入回复数据集列表' })
  listCommentReplyDatasets(@Query() query: CommentReplyDatasetQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listCommentReplyDatasets(query, user);
  }

  @Get('comment/reply-datasets/:id')
  @Permissions('robot:read')
  @ApiOperation({ summary: '评论导入回复数据集详情' })
  detailCommentReplyDataset(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detailCommentReplyDataset(id, user);
  }

  @Post('comment/reply-datasets/import')
  @Permissions('robot:update')
  @ApiOperation({ summary: '导入评论-回复映射数据' })
  importCommentReplyDataset(@Body() dto: ImportCommentReplyDatasetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.importCommentReplyDataset(dto, user);
  }

  @Patch('comment/reply-datasets/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '编辑评论导入回复数据集' })
  updateCommentReplyDataset(@Param('id') id: string, @Body() dto: UpdateCommentReplyDatasetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateCommentReplyDataset(id, dto, user);
  }

  @Post('comment/reply-datasets/:id/match')
  @Permissions('robot:read')
  @ApiOperation({ summary: '测试导入评论-回复映射匹配' })
  matchCommentReplyDataset(@Param('id') id: string, @Body() dto: MatchCommentReplyDatasetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.matchCommentReplyDataset(id, dto, user);
  }

  @Delete('comment/reply-datasets/:id')
  @Permissions('robot:update')
  @ApiOperation({ summary: '删除评论导入回复数据集（软删除）' })
  removeCommentReplyDataset(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeCommentReplyDataset(id, user);
  }

  @Post('comment/test-reply')
  @Permissions('robot:read')
  @ApiOperation({ summary: '测试评论自动回复工作流' })
  testCommentReply(@Body() dto: CommentTestReplyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.testCommentReply(dto, user);
  }

  @Post('comment/runtime-reply')
  @Permissions('robot:read')
  @ApiOperation({ summary: 'Generate a production comment reply using the robot AI binding' })
  runtimeCommentReply(@Body() dto: CommentTestReplyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.runtimeCommentReply(dto, user);
  }

  @Post('dm/test-reply')
  @Permissions('robot:read')
  @ApiOperation({ summary: '测试私信自动回复对话流' })
  testDmReply(@Body() dto: DmTestReplyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.testDmReply(dto, user);
  }

  @Post('dm/runtime-reply')
  @Permissions('robot:read')
  @ApiOperation({ summary: 'Generate a production direct-message reply using the robot AI binding' })
  runtimeDmReply(@Body() dto: DmTestReplyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.runtimeDmReply(dto, user);
  }

  @Post('comment/records/sync')
  @Permissions('robot:update')
  @ApiOperation({ summary: 'GUI 同步评论自动回复操作数据' })
  syncCommentRecords(@Body() dto: SyncCommentRecordsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.syncCommentRecords(dto, user);
  }

  @Post('comment/records/lookup')
  @Permissions('robot:read')
  @ApiOperation({ summary: '按评论唯一标识批量查询已处理记录' })
  lookupCommentRecords(@Body() dto: LookupCommentRecordsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.lookupCommentRecords(dto, user);
  }

  @Get('comment/records')
  @Permissions('robot:read')
  @ApiOperation({ summary: '评论自动回复平铺数据列表' })
  listCommentRecords(@Query() query: CommentRecordQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listCommentRecords(query, user);
  }

  @Get('comment/records/tree')
  @Permissions('robot:read')
  @ApiOperation({ summary: '评论自动回复树状展示数据' })
  listCommentTree(@Query() query: CommentRecordQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listCommentTree(query, user);
  }

  @Get('comment/records/threads')
  @Permissions('robot:read')
  @ApiOperation({ summary: '按根评论线程分页展示评论记录' })
  listCommentThreads(@Query() query: CommentRecordQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listCommentThreads(query, user);
  }

  @Get('comment/records/summary')
  @Permissions('robot:read')
  @ApiOperation({ summary: '评论记录确定性统计摘要' })
  commentRecordSummary(@Query() query: CommentRecordQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.commentRecordSummary(query, user);
  }

  @Get('comment/records/thread/:rootRecordId')
  @Permissions('robot:read')
  @ApiOperation({ summary: '评论线程详情' })
  commentThreadDetail(
    @Param('rootRecordId') rootRecordId: string,
    @Query() query: CommentRecordQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.commentThreadDetail(rootRecordId, query, user);
  }

  @Delete('comment/records/thread/:rootRecordId')
  @Permissions('robot:update')
  @ApiOperation({ summary: '删除整合后的评论线程及其重复会话段' })
  deleteCommentThread(
    @Param('rootRecordId') rootRecordId: string,
    @Query() query: CommentRecordQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.deleteCommentThread(rootRecordId, query, user);
  }

  @Post('dm/conversations/sync')
  @Permissions('robot:update')
  @ApiOperation({ summary: 'GUI 同步私信自动回复操作数据' })
  syncDmConversations(@Body() dto: SyncDmConversationsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.syncDmConversations(dto, user);
  }

  @Get('dm/conversations')
  @Permissions('robot:read')
  @ApiOperation({ summary: '私信自动回复会话嵌套展示数据' })
  listDmConversations(@Query() query: DmConversationQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listDmConversations(query, user);
  }
}
