import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceDataGovernanceService } from './customer-service-data-governance.service';
import { RunCustomerServiceDataGovernanceDto } from './dto/run-data-governance.dto';

@ApiTags('智能客服-校准数据治理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/data-governance', version: '5' })
export class CustomerServiceDataGovernanceController {
  constructor(private readonly service: CustomerServiceDataGovernanceService) {}

  @Get('overview')
  @Permissions('customer-service:calibration:read')
  @ApiOperation({ summary: '只读查看相关表容量、增长和生命周期状态' })
  overview(@CurrentUser() user: CurrentUserPayload) { return this.service.overview(user); }

  @Get('runs')
  @Permissions('customer-service:calibration:read')
  listRuns(@CurrentUser() user: CurrentUserPayload) { return this.service.listRuns(user); }

  @Post('runs')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '运行分批、幂等的数据治理；PURGE 默认关闭' })
  run(@Body() dto: RunCustomerServiceDataGovernanceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.run(dto, user);
  }
}
