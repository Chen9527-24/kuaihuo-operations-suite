import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceResponseRulesService } from './customer-service-response-rules.service';
import { CreateCustomerServiceResponseRuleDto } from './dto/create-response-rule.dto';
import { CustomerServiceResponseRuleQueryDto } from './dto/response-rule-query.dto';
import { UpdateCustomerServiceResponseRuleDto } from './dto/update-response-rule.dto';

@ApiTags('智能客服-回复规则')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/response-rules', version: '5' })
export class CustomerServiceResponseRulesController {
  constructor(private readonly service: CustomerServiceResponseRulesService) {}

  @Get()
  @Permissions('customer-service:response-rule:read')
  list(@Query() query: CustomerServiceResponseRuleQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:response-rule:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:response-rule:create')
  @ApiOperation({ summary: '创建回复规则' })
  create(@Body() dto: CreateCustomerServiceResponseRuleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Permissions('customer-service:response-rule:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceResponseRuleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }
}
