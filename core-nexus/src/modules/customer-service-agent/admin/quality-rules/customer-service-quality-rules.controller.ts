import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceQualityRulesService } from './customer-service-quality-rules.service';
import { CustomerServiceQualityRuleQueryDto } from './dto/quality-rule-query.dto';

@ApiTags('智能客服-质量规则')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/quality-rules', version: '5' })
export class CustomerServiceQualityRulesController {
  constructor(private readonly service: CustomerServiceQualityRulesService) {}

  @Get()
  @Permissions('customer-service:quality-rule:read')
  list(@Query() query: CustomerServiceQualityRuleQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }
}
