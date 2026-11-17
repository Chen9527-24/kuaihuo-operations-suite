import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceIntentCandidatesService } from './customer-service-intent-candidates.service';
import { CustomerServiceIntentCandidateQueryDto } from './dto/intent-candidate-query.dto';
import { UpdateIntentCandidateStatusDto } from './dto/update-intent-candidate-status.dto';

@ApiTags('智能客服-已识别意图')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/intent-candidates', version: '5' })
export class CustomerServiceIntentCandidatesController {
  constructor(private readonly service: CustomerServiceIntentCandidatesService) {}

  @Get()
  @Permissions('customer-service:response-rule:read')
  list(@Query() query: CustomerServiceIntentCandidateQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Post(':id/as-intent')
  @Permissions('customer-service:response-rule:create')
  convert(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.convert(id, user);
  }

  @Patch(':id/status')
  @Permissions('customer-service:response-rule:update')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIntentCandidateStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, dto, user);
  }
}
