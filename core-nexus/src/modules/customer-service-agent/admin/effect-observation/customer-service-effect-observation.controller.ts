import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceEffectObservationService } from './customer-service-effect-observation.service';
import { CustomerServiceEffectObservationQueryDto } from './dto/effect-observation-query.dto';

@ApiTags('智能客服-效果观察')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/effect-observation', version: '5' })
export class CustomerServiceEffectObservationController {
  constructor(private readonly service: CustomerServiceEffectObservationService) {}

  @Get()
  @Permissions('customer-service:calibration:read')
  @ApiOperation({ summary: '按账号统计 Reply Trace 满意度、策略/知识版本命中和发布前后观察窗口' })
  get(@Query() query: CustomerServiceEffectObservationQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getOverview(query, user);
  }
}
