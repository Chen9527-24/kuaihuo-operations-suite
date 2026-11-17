import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceEvaluationCasesService } from './customer-service-evaluation-cases.service';
import { CustomerServiceEvaluationCaseQueryDto } from './dto/evaluation-case-query.dto';

@ApiTags('智能客服-测试案例')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/evaluation-cases', version: '5' })
export class CustomerServiceEvaluationCasesController {
  constructor(private readonly service: CustomerServiceEvaluationCasesService) {}

  @Get()
  @Permissions('customer-service:evaluation-case:read')
  list(@Query() query: CustomerServiceEvaluationCaseQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:evaluation-case:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }
}
