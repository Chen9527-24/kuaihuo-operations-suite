import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CustomerServiceCalibrationProfilesService } from './customer-service-calibration-profiles.service';
import { CustomerServiceCalibrationProfileQueryDto } from './dto/calibration-profile-query.dto';
import { UpdateCustomerServiceCalibrationProfileStatusDto } from './dto/update-calibration-profile-status.dto';

@ApiTags('智能客服-调优档案')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-service/admin/calibration-profiles', version: '5' })
export class CustomerServiceCalibrationProfilesController {
  constructor(private readonly service: CustomerServiceCalibrationProfilesService) {}

  @Get()
  @Permissions('customer-service:calibration:read')
  @ApiOperation({ summary: '查询按角色和场景聚合的调优档案' })
  list(@Query() query: CustomerServiceCalibrationProfileQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('customer-service:calibration:read')
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Patch(':id/status')
  @Permissions('customer-service:calibration:update')
  @ApiOperation({ summary: '启用、停用或归档校准证据；停用后不再参与诊断和配置建议聚合' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerServiceCalibrationProfileStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStatus(id, dto, user);
  }
}
