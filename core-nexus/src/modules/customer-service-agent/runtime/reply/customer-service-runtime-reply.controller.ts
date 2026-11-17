import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceRuntimeReplyService } from './customer-service-runtime-reply.service';
import { ExecuteCustomerServiceRuntimeReplyDto } from './dto/execute-runtime-reply.dto';

@ApiTags('智能客服-正式运行回复契约')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/runtime/replies', version: '5' })
export class CustomerServiceRuntimeReplyController {
  constructor(private readonly service: CustomerServiceRuntimeReplyService) {}

  @Post()
  @Permissions('customer-service:simulation:execute')
  @ApiOperation({
    summary: '生成唯一、幂等、已通过最终仲裁的可发送回复段；当前不直接调用外部客户渠道',
  })
  execute(
    @Body() dto: ExecuteCustomerServiceRuntimeReplyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.execute(dto, user);
  }
}
