import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceCalibrationsService } from './customer-service-calibrations.service';
import { CreateCustomerServiceCalibrationFromReplyDto } from './dto/create-calibration-from-reply.dto';
import { ApplyCustomerServiceCalibrationRecordDto } from './dto/apply-calibration-record.dto';
import { CustomerServiceCalibrationRecordQueryDto } from './dto/calibration-record-query.dto';
import { CreateCustomerServiceCalibrationRecordDto } from './dto/create-calibration-record.dto';
import { UpdateCustomerServiceCalibrationStatusDto } from './dto/update-calibration-status.dto';
import { RecordCustomerServiceStrategyDraftRegressionDto } from './dto/record-strategy-draft-regression.dto';
import { RefineCustomerServiceCalibrationAnalysisDto } from './dto/refine-calibration-analysis.dto';
import {
  CreateCustomerServiceKnowledgeRevisionDraftDto,
  PublishCustomerServiceKnowledgeRevisionDraftDto,
  VerifyCustomerServiceKnowledgeRevisionDraftDto,
} from './dto/knowledge-revision-draft.dto';

@ApiTags('智能客服-回复调优')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/calibrations', version: '5' })
export class CustomerServiceCalibrationsController {
  constructor(private readonly service: CustomerServiceCalibrationsService) {}

  @Get()
  @Permissions('customer-service:calibration:read')
  list(@Query() query: CustomerServiceCalibrationRecordQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:calibration:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:calibration:create')
  @ApiOperation({ summary: '将本次不满意回复连同角色、规则、契约和质检快照保存为校准记录' })
  create(@Body() dto: CreateCustomerServiceCalibrationRecordDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Post('from-reply')
  @Permissions('customer-service:calibration:create')
  @ApiOperation({ summary: '根据 Reply Trace 构造权威上下文并复用现有校准记录链路' })
  createFromReply(
    @Body() dto: CreateCustomerServiceCalibrationFromReplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createFromReply(dto, user);
  }

  @Post(':id/analyze')
  @Permissions('customer-service:calibration:analyze')
  @ApiOperation({ summary: '根据商家建议或由 AI 自主诊断，生成校准建议和建议回复；不自动修改生产配置' })
  analyze(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.analyze(id, user);
  }

  @Post(':id/refine-analysis')
  @Permissions('customer-service:calibration:analyze')
  @ApiOperation({ summary: '基于原回复和上一版校准诊断、指令、建议回复继续迭代；不会新建无关校准记录' })
  refineAnalysis(
    @Param('id') id: string,
    @Body() dto: RefineCustomerServiceCalibrationAnalysisDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.refineAnalysis(id, dto, user);
  }

  @Post(':id/apply-to-tuning')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '将已确认校准结果应用到当前回复调优环境；按角色和上下文自动匹配，不修改正式生产配置' })
  applyToTuning(
    @Param('id') id: string,
    @Body() dto: ApplyCustomerServiceCalibrationRecordDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.applyToTuning(id, dto, user);
  }

  @Post(':id/apply-current-test-reply')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '将已应用校准的建议回复同步替换当前测试会话最后一轮回复；仅 TUNING / ROBOT_TEST_DM 生效' })
  applyCurrentTestReply(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.applyCurrentTestReply(id, user);
  }

  @Post(':id/knowledge-revision-draft')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '将事实错误校准保存为账号/店铺级知识修订草稿；不会自动进入生产' })
  createKnowledgeRevisionDraft(
    @Param('id') id: string,
    @Body() dto: CreateCustomerServiceKnowledgeRevisionDraftDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createKnowledgeRevisionDraft(id, dto, user);
  }

  @Post(':id/knowledge-revision-draft/verify')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '人工核实知识草稿中的事实；核实后仍未发布' })
  verifyKnowledgeRevisionDraft(
    @Param('id') id: string,
    @Body() dto: VerifyCustomerServiceKnowledgeRevisionDraftDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.verifyKnowledgeRevisionDraft(id, dto, user);
  }

  @Post(':id/knowledge-revision-draft/publish')
  @Permissions('customer-service:calibration:update', 'customer-service:context-profile:update')
  @ApiOperation({ summary: '人工发布已核实知识草稿，并创建或更新正式启用业务知识' })
  publishKnowledgeRevisionDraft(
    @Param('id') id: string,
    @Body() dto: PublishCustomerServiceKnowledgeRevisionDraftDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.publishKnowledgeRevisionDraft(id, dto, user);
  }

  @Post(':id/strategy-draft')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '将已确认的校准证据转换为结构化策略草稿；发布前不会进入运行时' })
  createStrategyDraft(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createStrategyDraft(id, user);
  }

  @Post(':id/strategy-draft/regression')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '记录使用当前策略草稿版本执行的完整回归结果；仅全通过才允许发布' })
  recordStrategyDraftRegression(
    @Param('id') id: string,
    @Body() dto: RecordCustomerServiceStrategyDraftRegressionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.recordStrategyDraftRegression(id, dto, user);
  }

  @Post(':id/strategy-draft/publish')
  @Permissions('customer-service:calibration:update', 'customer-service:asset:publish')
  @ApiOperation({ summary: '人工确认并发布已完成全量回归的当前校准策略草稿' })
  publishStrategyDraft(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.publishStrategyDraft(id, user);
  }

  @Patch(':id/status')
  @Permissions('customer-service:calibration:update')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerServiceCalibrationStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, dto, user);
  }
}
