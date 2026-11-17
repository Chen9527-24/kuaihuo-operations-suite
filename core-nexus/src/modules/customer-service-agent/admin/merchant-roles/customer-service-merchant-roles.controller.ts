import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceMerchantRolesService } from './customer-service-merchant-roles.service';
import { CreateCustomerServiceMerchantRoleDto } from './dto/create-merchant-role.dto';
import { DeleteCustomerServiceMerchantRoleDto } from './dto/delete-merchant-role.dto';
import { CustomerServiceMerchantRoleQueryDto } from './dto/merchant-role-query.dto';
import { UpdateCustomerServiceMerchantRoleDto } from './dto/update-merchant-role.dto';

@ApiTags('智能客服-客服角色')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/merchant-roles', version: '5' })
export class CustomerServiceMerchantRolesController {
  constructor(private readonly service: CustomerServiceMerchantRolesService) {}

  @Get()
  @Permissions('customer-service:merchant-role:read')
  list(@Query() query: CustomerServiceMerchantRoleQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:merchant-role:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:merchant-role:create')
  create(@Body() dto: CreateCustomerServiceMerchantRoleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Permissions('customer-service:merchant-role:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceMerchantRoleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('customer-service:merchant-role:delete')
  remove(
    @Param('id') id: string,
    @Query() dto: DeleteCustomerServiceMerchantRoleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, dto, user);
  }
}
