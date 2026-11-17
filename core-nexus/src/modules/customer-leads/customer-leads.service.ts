import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CUSTOMER_LEAD_TERMINAL_STATUSES,
  CUSTOMER_LEAD_TERMINAL_VALUES,
  DEFAULT_CUSTOMER_LEAD_FOLLOW_UP_STATUS,
  DEFAULT_CUSTOMER_LEAD_FOLLOW_UP_VALUE,
  DEFAULT_CUSTOMER_LEAD_SOURCE,
} from './customer-leads.constants';
import { CreateCustomerLeadFollowUpDto, CustomerLeadFollowUpQueryDto } from './dto/customer-lead-follow-up.dto';
import { CreateCustomerLeadDto, UpdateCustomerLeadDto } from './dto/customer-lead.dto';
import { CustomerLeadQueryDto } from './dto/customer-lead-query.dto';

type CurrentPlan = {
  nextFollowUpAt: Date | null;
  nextFollowUpPlan: string | null;
};

type InitialFollowUp = {
  followedUpAt: Date;
  followUpMethod: string | null;
  summary: string;
};

@Injectable()
export class CustomerLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerLeadQueryDto) {
    return this.listByDeletedState(query, false);
  }

  private async listByDeletedState(query: CustomerLeadQueryDto, deletedOnly: boolean) {
    const { skip, take, page, pageSize } = getPagination(query);
    const keyword = query.keyword?.trim();
    const followUpOwner = query.followUpOwner?.trim();
    const where: Prisma.CustomerLeadWhereInput = {
      deletedAt: deletedOnly ? { not: null } : null,
      ...(query.followUpStatus ? { followUpStatus: query.followUpStatus } : {}),
      ...(query.followUpValue ? { followUpValue: query.followUpValue } : {}),
      ...(query.leadSource ? { leadSource: query.leadSource } : {}),
      ...(followUpOwner ? { followUpOwner: { contains: followUpOwner, mode: 'insensitive' } } : {}),
      ...(query.websiteInquiry === 'ONLY'
        ? { websiteSubmission: { isNot: null } }
        : query.websiteInquiry === 'UNREAD'
          ? { websiteSubmission: { is: { viewedAt: null } } }
          : {}),
      ...(keyword
        ? {
            OR: [
              { companyName: { contains: keyword, mode: 'insensitive' } },
              { contactName: { contains: keyword, mode: 'insensitive' } },
              { contactPosition: { contains: keyword, mode: 'insensitive' } },
              { contactInfo: { contains: keyword, mode: 'insensitive' } },
              { primaryCategories: { has: keyword } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customerLead.findMany({
        where,
        skip,
        take,
        include: {
          websiteSubmission: {
            select: { id: true, viewedAt: true, viewedById: true, createdAt: true },
          },
        },
        // 回收站按删除时间倒序；正常工作台优先展示有明确下一步安排的客户。
        orderBy: deletedOnly
          ? [{ deletedAt: 'desc' }, { updatedAt: 'desc' }]
          : [{ nextFollowUpAt: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.customerLead.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async listWebsiteInquiries(query: CustomerLeadQueryDto) {
    return this.listByDeletedState({ ...query, websiteInquiry: query.websiteInquiry === 'UNREAD' ? 'UNREAD' : 'ONLY' }, false);
  }

  async listDeletedWebsiteInquiries(query: CustomerLeadQueryDto) {
    return this.listByDeletedState({ ...query, websiteInquiry: 'ONLY' }, true);
  }

  async websiteInquirySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const websiteLead: Prisma.CustomerLeadWhereInput = {
      deletedAt: null,
      websiteSubmission: { isNot: null },
    };

    const [total, unread, todayCount, pendingContact, highValue, lastSevenDays] = await Promise.all([
      this.prisma.customerLead.count({ where: websiteLead }),
      this.prisma.customerLead.count({ where: { ...websiteLead, websiteSubmission: { is: { viewedAt: null } } } }),
      this.prisma.customerLead.count({ where: { ...websiteLead, websiteSubmission: { is: { createdAt: { gte: today } } } } }),
      this.prisma.customerLead.count({ where: { ...websiteLead, followUpStatus: 'PENDING_CONTACT' } }),
      this.prisma.customerLead.count({ where: { ...websiteLead, followUpValue: 'HIGH' } }),
      this.prisma.customerLead.count({ where: { ...websiteLead, websiteSubmission: { is: { createdAt: { gte: sevenDaysAgo } } } } }),
    ]);

    return { total, unread, today: todayCount, pendingContact, highValue, lastSevenDays };
  }

  async websiteInquiryDetail(id: string) {
    const customerLead = await this.prisma.customerLead.findFirst({
      where: { id, deletedAt: null, websiteSubmission: { isNot: null } },
      include: { websiteSubmission: true },
    });
    if (!customerLead) throw new NotFoundException('Website inquiry not found');
    return customerLead;
  }

  async detail(id: string) {
    const customerLead = await this.prisma.customerLead.findFirst({
      where: { id, deletedAt: null },
      include: { websiteSubmission: true },
    });
    if (!customerLead) throw new NotFoundException('Customer lead not found');
    return customerLead;
  }

  async markWebsiteSubmissionViewed(id: string, userId: string) {
    await this.findActiveLead(id);
    const submission = await this.prisma.websiteContactSubmission.findUnique({ where: { customerLeadId: id } });
    if (!submission) throw new NotFoundException('Website submission not found');
    if (submission.viewedAt) return submission;
    return this.prisma.websiteContactSubmission.update({
      where: { customerLeadId: id },
      data: { viewedAt: new Date(), viewedById: userId },
    });
  }

  async listFollowUps(id: string, query: CustomerLeadFollowUpQueryDto) {
    await this.findActiveLead(id);
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.CustomerLeadFollowUpWhereInput = { customerLeadId: id };
    const [items, total] = await Promise.all([
      this.prisma.customerLeadFollowUp.findMany({
        where,
        skip,
        take,
        orderBy: [{ followedUpAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.customerLeadFollowUp.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async listWebsiteInquiryFollowUps(id: string, query: CustomerLeadFollowUpQueryDto) {
    await this.websiteInquiryDetail(id);
    return this.listFollowUps(id, query);
  }

  /**
   * 新增客户时可选地补录一次已发生的首次沟通。
   * 首次沟通不是单独的孤立日期：填写后会在同一事务中写入 CustomerLeadFollowUp。
   */
  async create(dto: CreateCustomerLeadDto) {
    const followUpStatus = dto.followUpStatus ?? DEFAULT_CUSTOMER_LEAD_FOLLOW_UP_STATUS;
    const followUpValue = dto.followUpValue ?? DEFAULT_CUSTOMER_LEAD_FOLLOW_UP_VALUE;
    const plan = this.resolveCurrentPlan(followUpStatus, followUpValue, dto.nextFollowUpAt, dto.nextFollowUpPlan);
    const initialFollowUp = this.resolveInitialFollowUp(dto);

    if (initialFollowUp && plan.nextFollowUpAt && plan.nextFollowUpAt.getTime() <= initialFollowUp.followedUpAt.getTime()) {
      throw new BadRequestException('下次计划跟进时间必须晚于首次实际跟进时间');
    }

    return this.prisma.$transaction(async (tx) => {
      const customerLead = await tx.customerLead.create({
        data: this.toCreateData(dto, followUpStatus, followUpValue, plan, initialFollowUp),
      });

      if (initialFollowUp) {
        await tx.customerLeadFollowUp.create({
          data: {
            customerLeadId: customerLead.id,
            followedUpAt: initialFollowUp.followedUpAt,
            followUpMethod: initialFollowUp.followUpMethod,
            followUpOwner: this.normalizeNullableText(dto.followUpOwner),
            summary: initialFollowUp.summary,
            followUpStatus,
            followUpValue,
            nextFollowUpAt: plan.nextFollowUpAt,
            nextFollowUpPlan: plan.nextFollowUpPlan,
          },
        });
      }

      return customerLead;
    });
  }

  async update(id: string, dto: UpdateCustomerLeadDto) {
    const existing = await this.findActiveLead(id);
    const followUpStatus = dto.followUpStatus ?? existing.followUpStatus;
    const followUpValue = dto.followUpValue ?? existing.followUpValue;
    const plan = this.resolveCurrentPlan(
      followUpStatus,
      followUpValue,
      dto.nextFollowUpAt !== undefined ? dto.nextFollowUpAt : existing.nextFollowUpAt?.toISOString() ?? null,
      dto.nextFollowUpPlan !== undefined ? dto.nextFollowUpPlan : existing.nextFollowUpPlan,
    );

    return this.prisma.customerLead.update({
      where: { id },
      data: this.toUpdateData(dto, plan),
    });
  }

  /**
   * 登记一次实际沟通。历史表只追加，不会被编辑客户或后续跟进覆盖。
   * 若补录的是一条更早的历史，系统只补齐首次跟进投影和历史次数，
   * 不会反向覆盖当前阶段、最近跟进和下一步计划。
   */
  async recordFollowUp(id: string, dto: CreateCustomerLeadFollowUpDto) {
    const followedUpAt = this.requireDate(dto.followedUpAt, '本次实际跟进时间不正确');
    const plan = this.resolveCurrentPlan(dto.followUpStatus, dto.followUpValue, dto.nextFollowUpAt, dto.nextFollowUpPlan);
    if (plan.nextFollowUpAt && plan.nextFollowUpAt.getTime() <= followedUpAt.getTime()) {
      throw new BadRequestException('下次计划跟进时间必须晚于本次实际跟进时间');
    }

    const summary = this.normalizeRequiredText(dto.summary, '请填写本次沟通内容与结论');
    const recordOwner = this.normalizeNullableText(dto.followUpOwner);
    const method = this.normalizeNullableText(dto.followUpMethod);

    return this.prisma.$transaction(async (tx) => {
      const customerLead = await tx.customerLead.findFirst({ where: { id, deletedAt: null } });
      if (!customerLead) {
        throw new NotFoundException('Customer lead not found');
      }

      await tx.customerLeadFollowUp.create({
        data: {
          customerLeadId: id,
          followedUpAt,
          followUpMethod: method,
          followUpOwner: recordOwner,
          summary,
          followUpStatus: dto.followUpStatus,
          followUpValue: dto.followUpValue,
          nextFollowUpAt: plan.nextFollowUpAt,
          nextFollowUpPlan: plan.nextFollowUpPlan,
        },
      });

      const shouldUpdateFirst = !customerLead.firstFollowUpAt || followedUpAt.getTime() < customerLead.firstFollowUpAt.getTime();
      const shouldSyncCurrent = !customerLead.lastFollowUpAt || followedUpAt.getTime() >= customerLead.lastFollowUpAt.getTime();
      const data: Prisma.CustomerLeadUpdateInput = {
        followUpCount: { increment: 1 },
      };

      if (shouldUpdateFirst) {
        data.firstFollowUpAt = followedUpAt;
      }

      if (shouldSyncCurrent) {
        data.followUpStatus = dto.followUpStatus;
        data.followUpValue = dto.followUpValue;
        data.lastFollowUpAt = followedUpAt;
        data.lastFollowUpNote = summary;
        data.nextFollowUpAt = plan.nextFollowUpAt;
        data.nextFollowUpPlan = plan.nextFollowUpPlan;
        if (recordOwner) data.followUpOwner = recordOwner;
      }

      return tx.customerLead.update({ where: { id }, data });
    });
  }

  async recordWebsiteInquiryFollowUp(id: string, dto: CreateCustomerLeadFollowUpDto) {
    await this.websiteInquiryDetail(id);
    return this.recordFollowUp(id, dto);
  }

  async removeWebsiteInquiry(id: string) {
    await this.findWebsiteInquiry(id, false);
    const result = await this.prisma.customerLead.updateMany({
      where: { id, deletedAt: null, websiteSubmission: { isNot: null } },
      data: { deletedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Website inquiry not found');
    return { success: true };
  }

  async restoreWebsiteInquiry(id: string) {
    await this.findWebsiteInquiry(id, true);
    const result = await this.prisma.customerLead.updateMany({
      where: { id, deletedAt: { not: null }, websiteSubmission: { isNot: null } },
      data: { deletedAt: null },
    });
    if (!result.count) throw new NotFoundException('Deleted website inquiry not found');
    return { success: true };
  }

  async purgeWebsiteInquiry(id: string) {
    await this.findWebsiteInquiry(id, true);
    await this.prisma.customerLead.delete({ where: { id } });
    return { success: true };
  }

  async remove(id: string) {
    await this.findActiveLead(id);
    await this.prisma.customerLead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  private async findActiveLead(id: string) {
    const customerLead = await this.prisma.customerLead.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customerLead) {
      throw new NotFoundException('Customer lead not found');
    }
    return customerLead;
  }

  private async findWebsiteInquiry(id: string, deleted: boolean) {
    const customerLead = await this.prisma.customerLead.findFirst({
      where: {
        id,
        deletedAt: deleted ? { not: null } : null,
        websiteSubmission: { isNot: null },
      },
    });
    if (!customerLead) {
      throw new NotFoundException(deleted ? 'Deleted website inquiry not found' : 'Website inquiry not found');
    }
    return customerLead;
  }

  private toCreateData(
    dto: CreateCustomerLeadDto,
    followUpStatus: string,
    followUpValue: string,
    plan: CurrentPlan,
    initialFollowUp: InitialFollowUp | null,
  ): Prisma.CustomerLeadCreateInput {
    return {
      companyName: dto.companyName.trim(),
      contactName: this.normalizeNullableText(dto.contactName),
      contactPosition: this.normalizeNullableText(dto.contactPosition),
      contactInfo: this.normalizeNullableText(dto.contactInfo),
      leadSource: dto.leadSource ?? DEFAULT_CUSTOMER_LEAD_SOURCE,
      leadSourceDetail: this.normalizeNullableText(dto.leadSourceDetail),
      companyAddress: this.normalizeNullableText(dto.companyAddress),
      primaryCategories: this.normalizeCategories(dto.primaryCategories),
      requestedFeatures: this.normalizeNullableText(dto.requestedFeatures),
      currentSolution: this.normalizeNullableText(dto.currentSolution),
      notWonReason: this.normalizeNullableText(dto.notWonReason),
      followUpStatus,
      followUpValue,
      followUpOwner: this.normalizeNullableText(dto.followUpOwner),
      nextFollowUpAt: plan.nextFollowUpAt,
      nextFollowUpPlan: plan.nextFollowUpPlan,
      firstFollowUpAt: initialFollowUp?.followedUpAt ?? null,
      lastFollowUpAt: initialFollowUp?.followedUpAt ?? null,
      // 仅保留当前最新摘要作列表速览；完整历史仍以 CustomerLeadFollowUp 为准。
      lastFollowUpNote: initialFollowUp?.summary ?? null,
      followUpCount: initialFollowUp ? 1 : 0,
      remark: this.normalizeNullableText(dto.remark),
    };
  }

  private toUpdateData(dto: UpdateCustomerLeadDto, plan: CurrentPlan): Prisma.CustomerLeadUpdateInput {
    const data: Prisma.CustomerLeadUpdateInput = {};

    if (dto.companyName !== undefined) data.companyName = dto.companyName.trim();
    if (dto.contactName !== undefined) data.contactName = this.normalizeNullableText(dto.contactName);
    if (dto.contactPosition !== undefined) data.contactPosition = this.normalizeNullableText(dto.contactPosition);
    if (dto.contactInfo !== undefined) data.contactInfo = this.normalizeNullableText(dto.contactInfo);
    if (dto.leadSource !== undefined) data.leadSource = dto.leadSource;
    if (dto.leadSourceDetail !== undefined) data.leadSourceDetail = this.normalizeNullableText(dto.leadSourceDetail);
    if (dto.companyAddress !== undefined) data.companyAddress = this.normalizeNullableText(dto.companyAddress);
    if (dto.primaryCategories !== undefined) data.primaryCategories = this.normalizeCategories(dto.primaryCategories);
    if (dto.requestedFeatures !== undefined) data.requestedFeatures = this.normalizeNullableText(dto.requestedFeatures);
    if (dto.currentSolution !== undefined) data.currentSolution = this.normalizeNullableText(dto.currentSolution);
    if (dto.notWonReason !== undefined) data.notWonReason = this.normalizeNullableText(dto.notWonReason);
    if (dto.followUpStatus !== undefined) data.followUpStatus = dto.followUpStatus;
    if (dto.followUpValue !== undefined) data.followUpValue = dto.followUpValue;
    if (dto.followUpOwner !== undefined) data.followUpOwner = this.normalizeNullableText(dto.followUpOwner);
    if (dto.nextFollowUpAt !== undefined || dto.nextFollowUpPlan !== undefined || this.isTerminal(dto.followUpStatus, dto.followUpValue)) {
      data.nextFollowUpAt = plan.nextFollowUpAt;
      data.nextFollowUpPlan = plan.nextFollowUpPlan;
    }
    if (dto.remark !== undefined) data.remark = this.normalizeNullableText(dto.remark);

    return data;
  }

  private resolveInitialFollowUp(dto: CreateCustomerLeadDto): InitialFollowUp | null {
    const followedUpAt = this.normalizeOptionalDate(dto.firstFollowUpAt);
    const method = this.normalizeNullableText(dto.firstFollowUpMethod);
    const summary = this.normalizeNullableText(dto.firstFollowUpSummary);
    const hasAnyInitialValue = Boolean(followedUpAt || method || summary);

    if (!hasAnyInitialValue) return null;
    if (!followedUpAt) {
      throw new BadRequestException('填写首次沟通方式或结论时，必须同时填写首次实际跟进时间');
    }
    if (!summary) {
      throw new BadRequestException('填写首次实际跟进时间时，必须同时填写首次沟通内容与结论');
    }

    return { followedUpAt, followUpMethod: method, summary };
  }

  private resolveCurrentPlan(
    followUpStatus: string | undefined,
    followUpValue: string | undefined,
    nextFollowUpAt?: string | Date | null,
    nextFollowUpPlan?: string | null,
  ): CurrentPlan {
    if (this.isTerminal(followUpStatus, followUpValue)) {
      return { nextFollowUpAt: null, nextFollowUpPlan: null };
    }

    return {
      nextFollowUpAt: this.normalizeOptionalDate(nextFollowUpAt),
      nextFollowUpPlan: this.normalizeNullableText(nextFollowUpPlan),
    };
  }

  private isTerminal(followUpStatus?: string, followUpValue?: string) {
    return (
      CUSTOMER_LEAD_TERMINAL_STATUSES.includes(followUpStatus as (typeof CUSTOMER_LEAD_TERMINAL_STATUSES)[number]) ||
      CUSTOMER_LEAD_TERMINAL_VALUES.includes(followUpValue as (typeof CUSTOMER_LEAD_TERMINAL_VALUES)[number])
    );
  }

  private normalizeCategories(value?: string[]) {
    if (!value?.length) return [];
    return [...new Set(value.map((item) => item.trim()).filter(Boolean))].slice(0, 20);
  }

  private normalizeRequiredText(value: string, message: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private normalizeNullableText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private normalizeOptionalDate(value?: string | Date | null) {
    if (!value) return null;
    return this.requireDate(value, '日期时间格式不正确');
  }

  private requireDate(value: string | Date, message: string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(message);
    }
    return date;
  }
}
