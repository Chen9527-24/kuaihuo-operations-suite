import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceTuningSessionsService } from './customer-service-tuning-sessions.service';
import { CreateCustomerServiceTuningSessionDto } from './dto/create-tuning-session.dto';
import { CustomerServiceTuningAnalysisQueryDto } from './dto/tuning-analysis-query.dto';
import { CustomerServiceTuningSessionQueryDto } from './dto/tuning-session-query.dto';
import { UpdateCustomerServiceTuningSessionDto } from './dto/update-tuning-session.dto';
import { AppendCustomerServiceAssistantSegmentDto } from './dto/append-assistant-segment.dto';
import { AcceptCustomerServiceTuningAnalysisDto } from './dto/accept-tuning-analysis.dto';
import { DeleteCustomerServiceTuningSessionsDto } from './dto/delete-tuning-sessions.dto';

@ApiTags('智能客服-回复调优对话')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/tuning-sessions', version: '5' })
export class CustomerServiceTuningSessionsController {
  constructor(private readonly service: CustomerServiceTuningSessionsService) {}

  @Get()
  @Permissions('customer-service:simulation:compile')
  list(@Query() query: CustomerServiceTuningSessionQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get('analyses')
  @Permissions('customer-service:simulation:compile')
  @ApiOperation({ summary: '分页查看所有调优分析与识别记录；精确匹配也会保留记录' })
  listAnalyses(@Query() query: CustomerServiceTuningAnalysisQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listAnalyses(query, user);
  }

  @Get('analyses/:analysisId')
  @Permissions('customer-service:simulation:compile')
  @ApiOperation({ summary: '按需读取单条调优分析的完整 JSON 详情' })
  getAnalysis(@Param('analysisId') analysisId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getAnalysis(analysisId, user);
  }

  @Post('analyses/:analysisId/accept')
  @Permissions('customer-service:simulation:execute')
  @ApiOperation({ summary: '接受候选回复并按分析 ID 幂等写入调优对话；移动端重复点击不会重复发送' })
  acceptAnalysis(
    @Param('analysisId') analysisId: string,
    @Body() dto: AcceptCustomerServiceTuningAnalysisDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.acceptAnalysis(analysisId, dto, user);
  }

  @Post('batch-delete')
  @Permissions('customer-service:simulation:compile')
  @ApiOperation({ summary: '批量硬删除测试与优化会话及其测试消息、分析与测试 Reply Trace；已应用校准资产保留' })
  removeMany(
    @Body() dto: DeleteCustomerServiceTuningSessionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeMany(dto.ids, user);
  }

  @Post()
  @Permissions('customer-service:simulation:compile')
  @ApiOperation({ summary: '创建新的回复调优对话；新对话不会继承旧上下文' })
  create(@Body() dto: CreateCustomerServiceTuningSessionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  @Permissions('customer-service:simulation:compile')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }


  @Post(':id/assistant-segments')
  @Permissions('customer-service:simulation:execute')
  @ApiOperation({ summary: '按回复投递计划提交单个阿梨消息段；客户插话时未提交的后续段可直接取消' })
  appendAssistantSegment(
    @Param('id') id: string,
    @Body() dto: AppendCustomerServiceAssistantSegmentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.appendAssistantSegment(id, dto, user);
  }

  @Delete(':id')
  @Permissions('customer-service:simulation:compile')
  @ApiOperation({ summary: '硬删除单个测试与优化会话及其测试消息、分析与测试 Reply Trace；已应用校准资产保留' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }

  @Patch(':id')
  @Permissions('customer-service:simulation:compile')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerServiceTuningSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }
}
