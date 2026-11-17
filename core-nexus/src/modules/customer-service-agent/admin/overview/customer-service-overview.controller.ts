import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceOverviewService } from './customer-service-overview.service';

@ApiTags('智能客服')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin', version: '5' })
export class CustomerServiceOverviewController {
  constructor(private readonly overviewService: CustomerServiceOverviewService) {}

  @Get('overview')
  @Permissions('customer-service:read')
  @ApiOperation({ summary: '智能客服 V5 模块概览' })
  @ApiOkResponse({ description: '返回当前阶段、运行边界和模块建设状态。' })
  getOverview(@CurrentUser() user: CurrentUserPayload) {
    return this.overviewService.getOverview(user);
  }
}
