import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  DeleteDialogueConversationsDto,
  DialogueConversationQueryDto,
  DialogueExportQueryDto,
  DialogueMessageQueryDto,
  InvalidateCanonicalConversationStateDto,
  PurgeDialogueRecordsDto,
  ResolveSyncDialogueDto,
  UpdateWorkflowConversationDto,
} from './dto/dialogue-records.dto';
import { DialogueRecordsService } from './dialogue-records.service';

@ApiTags('对话记录')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dialogue-records', version: '1' })
export class DialogueRecordsController {
  constructor(private readonly service: DialogueRecordsService) {}

  @Post('dm/resolve-sync')
  @Permissions('robot:update')
  @ApiOperation({ summary: '解析会话身份、幂等同步消息并返回安全上下文' })
  resolveSync(@Body() dto: ResolveSyncDialogueDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resolveAndSync(dto, user);
  }

  @Get('conversations')
  @Permissions('robot:read')
  @ApiOperation({ summary: '按联系人聚合的对话记录列表' })
  listConversations(@Query() query: DialogueConversationQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listConversations(query, user);
  }

  @Get('conversations/:id/messages')
  @Permissions('robot:read')
  @ApiOperation({ summary: '指定联系人下全部 canonical 会话段的消息列表' })
  listMessages(@Param('id') id: string, @Query() query: DialogueMessageQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listMessages(id, query, user);
  }

  @Get('conversations/:id/context')
  @Permissions('robot:read')
  @ApiOperation({ summary: '读取指定会话最近上下文' })
  getContext(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getContextForReply(id, user, [], Number(limit || 10));
  }

  @Get('conversations/:id/canonical-state')
  @Permissions('robot:read')
  @ApiOperation({ summary: '读取 canonical Conversation State、证据与重建状态' })
  getCanonicalState(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getCanonicalConversationState(id, user);
  }

  @Post('conversations/:id/canonical-state/invalidate')
  @Permissions('robot:update')
  @ApiOperation({ summary: '安全失效指定 State 字段或记忆；不改写原始对话证据' })
  invalidateCanonicalState(
    @Param('id') id: string,
    @Body() dto: InvalidateCanonicalConversationStateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.invalidateCanonicalConversationState(id, dto, user);
  }

  @Post('conversations/:id/canonical-state/rebuild')
  @Permissions('robot:update')
  @ApiOperation({ summary: '从 canonical 有效对话事件安全重建 Conversation State' })
  rebuildCanonicalState(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rebuildCanonicalConversationState(id, user);
  }

  @Patch('conversations/:id/workflow-conversation')
  @Permissions('robot:update')
  @ApiOperation({ summary: '更新结构化工作流 conversationId 映射' })
  updateWorkflowConversation(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowConversationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateWorkflowConversation(id, dto.workflowConversationId, user);
  }

  @Get('export')
  @Permissions('robot:read')
  @ApiOperation({ summary: '按联系人整合导出对话记录（CSV/JSON）' })
  exportRecords(@Query() query: DialogueExportQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.exportRecords(query, user);
  }

  @Post('delete')
  @Permissions('robot:update')
  @ApiOperation({ summary: '批量删除选中联系人及其全部会话段' })
  deleteConversations(@Body() dto: DeleteDialogueConversationsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteConversations(dto, user);
  }

  @Post('purge')
  @Permissions('robot:update')
  @ApiOperation({ summary: '按筛选条件清理测试/脏对话记录' })
  purge(@Body() dto: PurgeDialogueRecordsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.purge(dto, user);
  }
}
