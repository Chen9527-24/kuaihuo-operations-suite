import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceReplyTracesService } from './customer-service-reply-traces.service';
import { UpsertCustomerServiceReplyFeedbackDto } from './dto/upsert-reply-feedback.dto';

@ApiTags('智能客服-回复追踪与反馈')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/reply-traces', version: '5' })
export class CustomerServiceReplyTracesController {
  constructor(private readonly service: CustomerServiceReplyTracesService) {}

  @Get(':id')
  @Permissions('customer-service:calibration:read')
  @ApiOperation({ summary: '查看脱敏后的回复生成证据，不返回完整系统提示词或密钥' })
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getSafeDetail(id, user);
  }

  @Post(':id/feedback')
  @Permissions('customer-service:calibration:create')
  @ApiOperation({ summary: '保存或更新当前用户对一条回复追踪的满意/不满意反馈' })
  feedback(
    @Param('id') id: string,
    @Body() dto: UpsertCustomerServiceReplyFeedbackDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.upsertFeedback(id, dto, user);
  }
}
