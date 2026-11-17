import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceKnowledgeEntriesService } from './customer-service-knowledge-entries.service';
import {
  BatchImportCustomerServiceKnowledgeDto,
  CreateCustomerServiceKnowledgeCollectionDto,
  CreateCustomerServiceKnowledgeEntryDto,
  CustomerServiceKnowledgeEntryQueryDto,
  DeleteCustomerServiceKnowledgeEntryDto,
  PreviewCustomerServiceKnowledgeDto,
  ResolveCustomerServiceFixedQaDto,
  UpdateCustomerServiceKnowledgeCollectionDto,
  UpdateCustomerServiceKnowledgeEntryDto,
  UpsertCustomerServiceKnowledgeBindingDto,
} from './dto/customer-service-knowledge-entry.dto';

@ApiTags('智能客服-业务知识')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/knowledge-entries', version: '5' })
export class CustomerServiceKnowledgeEntriesController {
  constructor(private readonly service: CustomerServiceKnowledgeEntriesService) {}

  @Get('collections') @Permissions('customer-service:context-profile:read')
  listCollections(@Query('tenantId') tenantId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listCollections(user, tenantId);
  }

  @Post('collections') @Permissions('customer-service:context-profile:create')
  createCollection(@Body() dto: CreateCustomerServiceKnowledgeCollectionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createCollection(dto, user);
  }

  @Post('collections/reconcile-legacy-applicability') @Permissions('customer-service:context-profile:update')
  reconcileLegacyApplicability(@CurrentUser() user: CurrentUserPayload) {
    return this.service.reconcileLegacyApplicability(user);
  }

  @Patch('collections/:id') @Permissions('customer-service:context-profile:update')
  updateCollection(@Param('id') id: string, @Body() dto: UpdateCustomerServiceKnowledgeCollectionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateCollection(id, dto, user);
  }

  @Get('collections/:id/bindings') @Permissions('customer-service:context-profile:read')
  listBindings(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listBindings(id, user);
  }

  @Post('collections/:id/bindings') @Permissions('customer-service:context-profile:update')
  upsertBinding(
    @Param('id') id: string,
    @Body() dto: UpsertCustomerServiceKnowledgeBindingDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.upsertBinding(id, dto, user);
  }

  @Delete('bindings/:id') @Permissions('customer-service:context-profile:update')
  removeBinding(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeBinding(id, user);
  }

  @Post('batch-import') @Permissions('customer-service:context-profile:create')
  batchImport(@Body() dto: BatchImportCustomerServiceKnowledgeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.batchImport(dto, user);
  }

  @Post('preview') @Permissions('customer-service:context-profile:read')
  preview(@Body() dto: PreviewCustomerServiceKnowledgeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.preview(dto, user);
  }

  @Post('fixed-qa/resolve') @Permissions('customer-service:context-profile:read')
  resolveFixedQa(@Body() dto: ResolveCustomerServiceFixedQaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resolveFixedQa(dto, user);
  }

  @Get() @Permissions('customer-service:context-profile:read')
  list(@Query() query: CustomerServiceKnowledgeEntryQueryDto, @CurrentUser() user: CurrentUserPayload) { return this.service.list(query, user); }
  @Get(':id') @Permissions('customer-service:context-profile:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.get(id, user); }
  @Post() @Permissions('customer-service:context-profile:create')
  create(@Body() dto: CreateCustomerServiceKnowledgeEntryDto, @CurrentUser() user: CurrentUserPayload) { return this.service.create(dto, user); }
  @Patch(':id') @Permissions('customer-service:context-profile:update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerServiceKnowledgeEntryDto, @CurrentUser() user: CurrentUserPayload) { return this.service.update(id, dto, user); }
  @Delete(':id') @Permissions('customer-service:context-profile:update')
  remove(@Param('id') id: string, @Query() query: DeleteCustomerServiceKnowledgeEntryDto, @CurrentUser() user: CurrentUserPayload) { return this.service.remove(id, query.revision, user); }
}
