import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerLeadsService } from './customer-leads.service';
import { CreateCustomerLeadFollowUpDto, CustomerLeadFollowUpQueryDto } from './dto/customer-lead-follow-up.dto';
import { CreateCustomerLeadDto, UpdateCustomerLeadDto } from './dto/customer-lead.dto';
import { CustomerLeadQueryDto } from './dto/customer-lead-query.dto';

@ApiTags('商机客户管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customer-leads', version: '1' })
export class CustomerLeadsController {
  constructor(private readonly service: CustomerLeadsService) {}

  @Get()
  @Permissions('customer-lead:read')
  @ApiOperation({ summary: '商机客户列表', description: '列表优先呈现当前推进、下次行动与首次/最近实际跟进摘要。' })
  list(@Query() query: CustomerLeadQueryDto) {
    return this.service.list(query);
  }

  @Get('website-inquiries/summary')
  @Permissions('website-inquiry:read')
  @ApiOperation({ summary: '官网意向客户工作台统计' })
  websiteInquirySummary() {
    return this.service.websiteInquirySummary();
  }

  @Get('website-inquiries')
  @Permissions('website-inquiry:read')
  @ApiOperation({ summary: '官网意向客户列表', description: '服务端强制仅返回官网表单提交形成的客户，不能通过查询参数扩大范围。' })
  listWebsiteInquiries(@Query() query: CustomerLeadQueryDto) {
    return this.service.listWebsiteInquiries(query);
  }

  @Get('website-inquiries/trash')
  @Permissions('website-inquiry:read')
  @ApiOperation({ summary: '官网意向客户回收站', description: '仅返回已经软删除的官网表单客户。' })
  listDeletedWebsiteInquiries(@Query() query: CustomerLeadQueryDto) {
    return this.service.listDeletedWebsiteInquiries(query);
  }

  @Get('website-inquiries/:id')
  @Permissions('website-inquiry:read')
  @ApiOperation({ summary: '官网意向客户详情' })
  websiteInquiryDetail(@Param('id') id: string) {
    return this.service.websiteInquiryDetail(id);
  }

  @Patch('website-inquiries/:id/viewed')
  @Permissions('website-inquiry:viewed:update')
  @ApiOperation({ summary: '将官网意向客户标记为已查看' })
  markWebsiteInquiryViewed(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markWebsiteSubmissionViewed(id, userId);
  }

  @Post('website-inquiries/:id/follow-ups')
  @Permissions('website-inquiry:follow-up:create')
  @ApiOperation({ summary: '登记官网意向客户跟进' })
  recordWebsiteInquiryFollowUp(@Param('id') id: string, @Body() dto: CreateCustomerLeadFollowUpDto) {
    return this.service.recordWebsiteInquiryFollowUp(id, dto);
  }

  @Get('website-inquiries/:id/follow-ups')
  @Permissions('website-inquiry:read')
  @ApiOperation({ summary: '官网意向客户跟进历史' })
  listWebsiteInquiryFollowUps(@Param('id') id: string, @Query() query: CustomerLeadFollowUpQueryDto) {
    return this.service.listWebsiteInquiryFollowUps(id, query);
  }

  @Patch('website-inquiries/:id/restore')
  @Permissions('website-inquiry:restore')
  @ApiOperation({ summary: '从回收站恢复官网意向客户' })
  restoreWebsiteInquiry(@Param('id') id: string) {
    return this.service.restoreWebsiteInquiry(id);
  }

  @Delete('website-inquiries/:id/permanent')
  @Permissions('website-inquiry:purge')
  @ApiOperation({ summary: '彻底删除官网意向客户', description: '仅允许删除已经进入回收站的记录；会同时删除原始官网快照和跟进历史。' })
  purgeWebsiteInquiry(@Param('id') id: string) {
    return this.service.purgeWebsiteInquiry(id);
  }

  @Delete('website-inquiries/:id')
  @Permissions('website-inquiry:delete')
  @ApiOperation({ summary: '删除官网意向客户', description: '软删除并移入官网意向客户回收站。' })
  removeWebsiteInquiry(@Param('id') id: string) {
    return this.service.removeWebsiteInquiry(id);
  }

  @Get(':id/follow-ups')
  @Permissions('customer-lead:read')
  @ApiOperation({ summary: '商机客户跟进历史', description: '按实际跟进时间倒序返回；历史记录为追加式，不会被后续跟进覆盖。' })
  listFollowUps(@Param('id') id: string, @Query() query: CustomerLeadFollowUpQueryDto) {
    return this.service.listFollowUps(id, query);
  }

  @Post(':id/follow-ups')
  @Permissions('customer-lead:follow-up:create')
  @ApiOperation({ summary: '登记一次商机客户跟进', description: '新增一条历史记录，并事务性同步客户当前状态、跟进价值、最近实际跟进和下一次计划。' })
  recordFollowUp(@Param('id') id: string, @Body() dto: CreateCustomerLeadFollowUpDto) {
    return this.service.recordFollowUp(id, dto);
  }

  @Get(':id')
  @Permissions('customer-lead:read')
  @ApiOperation({ summary: '商机客户详情' })
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Patch(':id/website-submission/viewed')
  @Permissions('customer-lead:website-submission:update')
  @ApiOperation({ summary: '将官网原始咨询标记为已查看' })
  markWebsiteSubmissionViewed(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markWebsiteSubmissionViewed(id, userId);
  }

  @Post()
  @Permissions('customer-lead:create')
  @ApiOperation({ summary: '新增商机客户', description: '可选补录首次实际跟进；填写首次沟通信息后会在同一事务内自动创建第一条跟进历史。' })
  create(@Body() dto: CreateCustomerLeadDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permissions('customer-lead:update')
  @ApiOperation({ summary: '编辑商机客户基础信息与当前推进安排', description: '不会覆盖跟进历史；实际沟通请使用“登记跟进”接口。' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerLeadDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('customer-lead:delete')
  @ApiOperation({ summary: '删除商机客户（软删除）' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
