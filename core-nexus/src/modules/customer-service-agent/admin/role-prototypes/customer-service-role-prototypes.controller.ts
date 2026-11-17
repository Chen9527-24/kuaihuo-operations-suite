import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceRolePrototypesService } from './customer-service-role-prototypes.service';
import { CreateCustomerServiceRolePrototypeDto } from './dto/create-role-prototype.dto';
import { DeleteCustomerServiceRolePrototypeDto } from './dto/delete-role-prototype.dto';
import { CustomerServiceRolePrototypeQueryDto } from './dto/role-prototype-query.dto';
import { UpdateCustomerServiceRolePrototypeDto } from './dto/update-role-prototype.dto';

@ApiTags('智能客服-角色原型')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/role-prototypes', version: '5' })
export class CustomerServiceRolePrototypesController {
  constructor(private readonly service: CustomerServiceRolePrototypesService) {}

  @Get()
  @Permissions('customer-service:role-prototype:read')
  list(@Query() query: CustomerServiceRolePrototypeQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:role-prototype:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:role-prototype:create')
  create(@Body() dto: CreateCustomerServiceRolePrototypeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Permissions('customer-service:role-prototype:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceRolePrototypeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('customer-service:role-prototype:delete')
  remove(
    @Param('id') id: string,
    @Query() dto: DeleteCustomerServiceRolePrototypeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, dto, user);
  }
}
