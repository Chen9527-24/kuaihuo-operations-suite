import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceGuidelinesService } from './customer-service-guidelines.service';
import {
  CreateCustomerServiceGuidelineDto,
  CreateCustomerServiceGuidelineVersionDto,
  CustomerServiceGuidelineQueryDto,
  PublishCustomerServiceGuidelineVersionDto,
  RollbackCustomerServiceGuidelineVersionDto,
  UpdateCustomerServiceGuidelineDto,
} from './dto/customer-service-guideline.dto';

@ApiTags('智能客服-HVE Guideline')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/guidelines', version: '5' })
export class CustomerServiceGuidelinesController {
  constructor(private readonly service: CustomerServiceGuidelinesService) {}

  @Get() @Permissions('customer-service:asset:read')
  list(@Query() query: CustomerServiceGuidelineQueryDto, @CurrentUser() user: CurrentUserPayload) { return this.service.list(query, user); }

  @Get(':id') @Permissions('customer-service:asset:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.get(id, user); }

  @Post() @Permissions('customer-service:asset:create')
  @ApiOperation({ summary: '创建 HVE Guideline Header；Runtime 行为必须通过版本发布生效' })
  create(@Body() dto: CreateCustomerServiceGuidelineDto, @CurrentUser() user: CurrentUserPayload) { return this.service.create(dto, user); }

  @Patch(':id') @Permissions('customer-service:asset:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceGuidelineDto, @CurrentUser() user: CurrentUserPayload) { return this.service.update(id, dto, user); }

  @Get(':id/versions') @Permissions('customer-service:asset:read')
  listVersions(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.listVersions(id, user); }

  @Post(':id/versions') @Permissions('customer-service:asset:version:create')
  createVersion(@Param('id') id: string, @Body() dto: CreateCustomerServiceGuidelineVersionDto, @CurrentUser() user: CurrentUserPayload) { return this.service.createVersion(id, dto, user); }

  @Post(':id/versions/:versionId/validate') @Permissions('customer-service:asset:read')
  validateVersion(@Param('id') id: string, @Param('versionId') versionId: string, @CurrentUser() user: CurrentUserPayload) { return this.service.validateVersion(id, versionId, user); }

  @Post(':id/versions/:versionId/publish') @Permissions('customer-service:asset:publish')
  publishVersion(@Param('id') id: string, @Param('versionId') versionId: string, @Body() dto: PublishCustomerServiceGuidelineVersionDto, @CurrentUser() user: CurrentUserPayload) { return this.service.publishVersion(id, versionId, dto, user); }

  @Post(':id/versions/:versionId/rollback') @Permissions('customer-service:asset:publish')
  rollbackVersion(@Param('id') id: string, @Param('versionId') versionId: string, @Body() dto: RollbackCustomerServiceGuidelineVersionDto, @CurrentUser() user: CurrentUserPayload) { return this.service.rollbackVersion(id, versionId, dto, user); }
}
