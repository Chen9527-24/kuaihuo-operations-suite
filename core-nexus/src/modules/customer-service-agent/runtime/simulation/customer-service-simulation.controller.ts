import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceSimulationService } from './customer-service-simulation.service';
import { CompileCustomerServiceSimulationDto } from './dto/compile-simulation.dto';
import { ExecuteCustomerServiceSimulationDto } from './dto/execute-simulation.dto';

@ApiTags('智能客服-回复调优执行器')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/simulations', version: '5' })
export class CustomerServiceSimulationController {
  constructor(private readonly service: CustomerServiceSimulationService) {}

  @Post('compile')
  @Permissions('customer-service:simulation:compile')
  compile(@Body() dto: CompileCustomerServiceSimulationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.compile(dto, user);
  }

  @Post('execute')
  @Permissions('customer-service:simulation:execute')
  @ApiOperation({ summary: '执行回复理解、规划、候选生成和质量门；仅用于调优，不会发送或写业务' })
  execute(@Body() dto: ExecuteCustomerServiceSimulationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.executeWithTrace(dto, user);
  }
}
