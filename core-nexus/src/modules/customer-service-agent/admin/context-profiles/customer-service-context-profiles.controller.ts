import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceContextProfilesService } from './customer-service-context-profiles.service';
import {
  CreateCustomerServiceAccountProfileDto,
  CreateCustomerServiceLanguagePolicyDto,
  CreateCustomerServiceStoreProfileDto,
  CustomerServiceAccountProfileQueryDto,
  CustomerServiceContextProfileQueryDto,
  CustomerServiceLanguagePolicyQueryDto,
  UpdateCustomerServiceAccountProfileDto,
  UpdateCustomerServiceLanguagePolicyDto,
  UpdateCustomerServiceStoreProfileDto,
} from './dto/customer-service-context-profile.dto';

@ApiTags('智能客服-背景与语言规则')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/context-profiles', version: '5' })
export class CustomerServiceContextProfilesController {
  constructor(private readonly service: CustomerServiceContextProfilesService) {}

  @Get('stores')
  @Permissions('customer-service:context-profile:read')
  listStores(@Query() query: CustomerServiceContextProfileQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listStores(query, user);
  }

  @Get('stores/:id')
  @Permissions('customer-service:context-profile:read')
  getStore(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getStore(id, user);
  }

  @Post('stores')
  @Permissions('customer-service:context-profile:create')
  createStore(@Body() dto: CreateCustomerServiceStoreProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createStore(dto, user);
  }

  @Patch('stores/:id')
  @Permissions('customer-service:context-profile:update')
  updateStore(@Param('id') id: string, @Body() dto: UpdateCustomerServiceStoreProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateStore(id, dto, user);
  }

  @Get('accounts')
  @Permissions('customer-service:context-profile:read')
  listAccounts(@Query() query: CustomerServiceAccountProfileQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listAccounts(query, user);
  }

  @Get('accounts/:id')
  @Permissions('customer-service:context-profile:read')
  getAccount(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getAccount(id, user);
  }

  @Post('accounts')
  @Permissions('customer-service:context-profile:create')
  createAccount(@Body() dto: CreateCustomerServiceAccountProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createAccount(dto, user);
  }

  @Patch('accounts/:id')
  @Permissions('customer-service:context-profile:update')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateCustomerServiceAccountProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateAccount(id, dto, user);
  }

  @Get('language-policies')
  @Permissions('customer-service:context-profile:read')
  listPolicies(@Query() query: CustomerServiceLanguagePolicyQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listPolicies(query, user);
  }

  @Get('language-policies/:id')
  @Permissions('customer-service:context-profile:read')
  getPolicy(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getPolicy(id, user);
  }

  @Post('language-policies')
  @Permissions('customer-service:context-profile:create')
  createPolicy(@Body() dto: CreateCustomerServiceLanguagePolicyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createPolicy(dto, user);
  }

  @Patch('language-policies/:id')
  @Permissions('customer-service:context-profile:update')
  updatePolicy(@Param('id') id: string, @Body() dto: UpdateCustomerServiceLanguagePolicyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updatePolicy(id, dto, user);
  }
}
