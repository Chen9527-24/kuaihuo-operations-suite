import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceIntentDefinitionsService } from './customer-service-intent-definitions.service';
import { CreateCustomerServiceIntentDefinitionDto } from './dto/create-intent-definition.dto';
import { CustomerServiceIntentDefinitionQueryDto } from './dto/intent-definition-query.dto';
import { UpdateCustomerServiceIntentDefinitionDto } from './dto/update-intent-definition.dto';
import { CreateIntentFromRecognitionDto } from './dto/create-intent-from-recognition.dto';

@ApiTags('智能客服-客户意图与流程')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/intent-definitions', version: '5' })
export class CustomerServiceIntentDefinitionsController {
  constructor(private readonly service: CustomerServiceIntentDefinitionsService) {}

  @Get()
  @Permissions('customer-service:response-rule:read')
  list(@Query() query: CustomerServiceIntentDefinitionQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:response-rule:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Post()
  @Permissions('customer-service:response-rule:create')
  create(@Body() dto: CreateCustomerServiceIntentDefinitionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }


  @Post('from-recognition')
  @Permissions('customer-service:response-rule:create')
  createFromRecognition(@Body() dto: CreateIntentFromRecognitionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createFromRecognition(dto, user);
  }

  @Patch(':id')
  @Permissions('customer-service:response-rule:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerServiceIntentDefinitionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }
}
