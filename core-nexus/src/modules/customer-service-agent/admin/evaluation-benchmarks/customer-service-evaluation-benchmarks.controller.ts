import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceEvaluationBenchmarksService } from './customer-service-evaluation-benchmarks.service';

@ApiTags('智能客服-V5.15评测基准')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/evaluation-benchmarks', version: '5' })
export class CustomerServiceEvaluationBenchmarksController {
  constructor(private readonly service: CustomerServiceEvaluationBenchmarksService) {}

  @Get('manifest')
  @Permissions('customer-service:evaluation-case:read')
  manifest() { return this.service.manifest(); }

  @Post('intent/run')
  @Permissions('customer-service:evaluation-case:read')
  runIntent(@Query('failureLimit') failureLimit?: string) { return this.service.runIntentBenchmark(Number(failureLimit || 100)); }

  @Get('humanity/conversations')
  @Permissions('customer-service:evaluation-case:read')
  listHumanity(@Query('offset') offset?: string, @Query('limit') limit?: string) { return this.service.listHumanityConversations(Number(offset || 0), Number(limit || 20)); }

  @Post('humanity/evaluate')
  @Permissions('customer-service:evaluation-case:read')
  evaluateHumanity(@Body() body: unknown) { return this.service.evaluateHumanityArtifact(body); }

  @Post('humanity/compare')
  @Permissions('customer-service:evaluation-case:read')
  compareHumanity(@Body() body: unknown) { return this.service.compareHumanityArtifacts(body); }

  @Post('humanity/score')
  @Permissions('customer-service:evaluation-case:read')
  scoreHumanity(@Body() body: unknown) { return this.service.scoreHumanityReviews(body); }
}

