import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceFoundationService } from './customer-service-foundation.service';
import { InitializeCustomerServiceFoundationDto } from './dto/initialize-foundation.dto';

@ApiTags('智能客服-正式初始化')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/foundation', version: '5' })
export class CustomerServiceFoundationController {
  constructor(private readonly service: CustomerServiceFoundationService) {}

  @Get('status')
  @Permissions('customer-service:foundation:read')
  getStatus(@Query() dto: InitializeCustomerServiceFoundationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getStatus(dto, user);
  }

  @Post('initialize')
  @Permissions('customer-service:foundation:initialize')
  @ApiOperation({ summary: '按正式标准幂等初始化当前租户的智能客服基础数据' })
  initialize(@Body() dto: InitializeCustomerServiceFoundationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.initialize(dto, user);
  }

  @Post('sync-ali-flagship')
  @Permissions('customer-service:foundation:initialize')
  @ApiOperation({ summary: '同步阿梨全行业旗舰真人感母版，并清理旧调优冲突' })
  syncAliFlagship(@Body() dto: InitializeCustomerServiceFoundationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.syncAliFlagship(dto, user);
  }
}
