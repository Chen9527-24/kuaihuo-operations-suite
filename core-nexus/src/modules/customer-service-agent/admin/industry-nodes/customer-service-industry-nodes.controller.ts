import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceIndustryNodesService } from './customer-service-industry-nodes.service';
import { CreateCustomerServiceIndustryNodeDto } from './dto/create-industry-node.dto';
import { DeleteCustomerServiceIndustryNodeDto } from './dto/delete-industry-node.dto';
import { CustomerServiceIndustryNodeQueryDto } from './dto/industry-node-query.dto';
import { ReorderCustomerServiceIndustryNodesDto } from './dto/reorder-industry-nodes.dto';
import { UpdateCustomerServiceIndustryNodeDto } from './dto/update-industry-node.dto';

@ApiTags('智能客服-行业能力')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/industry-nodes', version: '5' })
export class CustomerServiceIndustryNodesController {
  constructor(private readonly service: CustomerServiceIndustryNodesService) {}

  @Get()
  @Permissions('customer-service:industry-node:read')
  list(@Query() query: CustomerServiceIndustryNodeQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:industry-node:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:industry-node:create')
  create(@Body() dto: CreateCustomerServiceIndustryNodeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch('tree-layout')
  @Permissions('customer-service:industry-node:update')
  reorder(@Body() dto: ReorderCustomerServiceIndustryNodesDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.reorder(dto, user);
  }

  @Patch(':id')
  @Permissions('customer-service:industry-node:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceIndustryNodeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('customer-service:industry-node:delete')
  remove(
    @Param('id') id: string,
    @Query() dto: DeleteCustomerServiceIndustryNodeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(id, dto, user);
  }
}
