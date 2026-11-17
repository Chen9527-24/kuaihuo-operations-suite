import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceRoleModulesService } from './customer-service-role-modules.service';
import { CreateCustomerServiceRoleModuleDto } from './dto/create-role-module.dto';
import { UpdateCustomerServiceRoleModuleDto } from './dto/update-role-module.dto';

@ApiTags('智能客服-角色模块')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin', version: '5' })
export class CustomerServiceRoleModulesController {
  constructor(private readonly service: CustomerServiceRoleModulesService) {}

  @Get('role-module-definitions')
  @Permissions('customer-service:role-module:read')
  definitions() {
    return this.service.definitions();
  }

  @Get('merchant-roles/:merchantRoleId/modules')
  @Permissions('customer-service:role-module:read')
  list(@Param('merchantRoleId') merchantRoleId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(merchantRoleId, user);
  }

  @Post('merchant-roles/:merchantRoleId/modules')
  @Permissions('customer-service:role-module:create')
  create(
    @Param('merchantRoleId') merchantRoleId: string,
    @Body() dto: CreateCustomerServiceRoleModuleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(merchantRoleId, dto, user);
  }

  @Patch('merchant-roles/:merchantRoleId/modules/:moduleId')
  @Permissions('customer-service:role-module:update')
  update(
    @Param('merchantRoleId') merchantRoleId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateCustomerServiceRoleModuleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(merchantRoleId, moduleId, dto, user);
  }
}
