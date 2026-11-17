import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceAssetsService } from './customer-service-assets.service';
import { CustomerServiceAssetQueryDto } from './dto/asset-query.dto';
import { CreateCustomerServiceAssetVersionDto } from './dto/create-asset-version.dto';
import { CreateCustomerServiceAssetDto } from './dto/create-asset.dto';
import { PublishCustomerServiceAssetVersionDto } from './dto/publish-asset-version.dto';
import { RollbackCustomerServiceAssetVersionDto } from './dto/rollback-asset-version.dto';
import { UpdateCustomerServiceAssetDto } from './dto/update-asset.dto';

@ApiTags('智能客服-配置资产')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/assets', version: '5' })
export class CustomerServiceAssetsController {
  constructor(private readonly service: CustomerServiceAssetsService) {}

  @Get()
  @Permissions('customer-service:asset:read')
  list(@Query() query: CustomerServiceAssetQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:asset:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:asset:create')
  @ApiOperation({ summary: '创建配置资产' })
  create(@Body() dto: CreateCustomerServiceAssetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Permissions('customer-service:asset:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceAssetDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Get(':id/versions')
  @Permissions('customer-service:asset:read')
  listVersions(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listVersions(id, user);
  }

  @Post(':id/versions')
  @Permissions('customer-service:asset:version:create')
  createVersion(@Param('id') id: string, @Body() dto: CreateCustomerServiceAssetVersionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createVersion(id, dto, user);
  }

  @Post(':id/versions/:versionId/publish')
  @Permissions('customer-service:asset:publish')
  publishVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: PublishCustomerServiceAssetVersionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.publishVersion(id, versionId, dto, user);
  }

  @Post(':id/versions/:versionId/rollback')
  @Permissions('customer-service:asset:publish')
  @ApiOperation({ summary: '将历史已发布版本复制为新的当前版本，保留完整版本历史' })
  rollbackVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: RollbackCustomerServiceAssetVersionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.rollbackVersion(id, versionId, dto, user);
  }
}
