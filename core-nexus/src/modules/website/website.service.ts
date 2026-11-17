import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SubmitWebsiteInquiryDto } from './dto/website.dto';
import { validateWebsiteContent } from './website-content.validator';

const WEBSITE_CONFIG_ID = 'official-website';

@Injectable()
export class WebsiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async getManagementConfiguration() {
    const record = await this.prisma.websiteConfiguration.findUnique({ where: { id: WEBSITE_CONFIG_ID } });
    return {
      id: WEBSITE_CONFIG_ID,
      draftContent: record?.draftContent ?? null,
      publishedContent: record?.publishedContent ?? null,
      draftRevision: record?.draftRevision ?? 0,
      publishedRevision: record?.publishedRevision ?? 0,
      updatedById: record?.updatedById ?? null,
      publishedById: record?.publishedById ?? null,
      publishedAt: record?.publishedAt ?? null,
      updatedAt: record?.updatedAt ?? null,
    };
  }

  async getPublicConfiguration() {
    const record = await this.prisma.websiteConfiguration.findUnique({ where: { id: WEBSITE_CONFIG_ID } });
    if (!record?.publishedContent) {
      return { configured: false, schemaVersion: 1, revision: 0, publishedAt: null, content: null };
    }
    return {
      configured: true,
      schemaVersion: 1,
      revision: record.publishedRevision,
      publishedAt: record.publishedAt,
      content: record.publishedContent,
    };
  }

  async saveDraft(content: Record<string, unknown>, expectedRevision: number | undefined, userId: string) {
    const normalized = validateWebsiteContent(content, this.getConfigMaxBytes());
    await this.prisma.websiteConfiguration.upsert({
      where: { id: WEBSITE_CONFIG_ID },
      update: {},
      create: { id: WEBSITE_CONFIG_ID },
    });
    const current = await this.prisma.websiteConfiguration.findUniqueOrThrow({ where: { id: WEBSITE_CONFIG_ID } });
    const expected = expectedRevision ?? current.draftRevision;
    if (expected !== current.draftRevision) throw new ConflictException('官网草稿已被其他人更新，请重新加载后再保存');

    const result = await this.prisma.websiteConfiguration.updateMany({
      where: { id: WEBSITE_CONFIG_ID, draftRevision: expected },
      data: { draftContent: normalized, draftRevision: { increment: 1 }, updatedById: userId },
    });
    if (result.count !== 1) throw new ConflictException('官网草稿版本已变化，请重新加载后再保存');
    return this.getManagementConfiguration();
  }

  async publish(expectedDraftRevision: number, userId: string) {
    const current = await this.prisma.websiteConfiguration.findUnique({ where: { id: WEBSITE_CONFIG_ID } });
    if (!current?.draftContent) throw new BadRequestException('请先保存官网草稿再发布');
    if (current.draftRevision !== expectedDraftRevision) throw new ConflictException('官网草稿已变化，请重新加载确认后再发布');
    const publishedAt = new Date();
    const result = await this.prisma.websiteConfiguration.updateMany({
      where: { id: WEBSITE_CONFIG_ID, draftRevision: expectedDraftRevision },
      data: {
        publishedContent: current.draftContent,
        publishedRevision: { increment: 1 },
        publishedById: userId,
        publishedAt,
      },
    });
    if (result.count !== 1) throw new ConflictException('官网草稿已变化，请重新加载确认后再发布');
    return this.getManagementConfiguration();
  }

  async restorePublishedToDraft(expectedDraftRevision: number, userId: string) {
    const current = await this.prisma.websiteConfiguration.findUnique({ where: { id: WEBSITE_CONFIG_ID } });
    if (!current?.publishedContent) throw new BadRequestException('当前没有可恢复的已发布配置');
    if (current.draftRevision !== expectedDraftRevision) throw new ConflictException('官网草稿已变化，请重新加载后再恢复');
    const result = await this.prisma.websiteConfiguration.updateMany({
      where: { id: WEBSITE_CONFIG_ID, draftRevision: expectedDraftRevision },
      data: { draftContent: current.publishedContent, draftRevision: { increment: 1 }, updatedById: userId },
    });
    if (result.count !== 1) throw new ConflictException('官网草稿版本已变化，请重新加载后再恢复');
    return this.getManagementConfiguration();
  }

  async submitInquiry(dto: SubmitWebsiteInquiryDto, request: Request) {
    const existing = await this.prisma.websiteContactSubmission.findUnique({ where: { requestId: dto.requestId } });
    if (existing) return { accepted: true, referenceId: existing.id, duplicate: true };

    // 蜜罐命中时不暴露识别结果，避免机器人据此调整提交策略。
    if (this.clean(dto.companyWebsite)) return { accepted: true, referenceId: dto.requestId };
    if (dto.formStartedAt) {
      const elapsed = Date.now() - new Date(dto.formStartedAt).getTime();
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 800) {
        return { accepted: true, referenceId: dto.requestId };
      }
    }

    const ipHash = this.hashSensitive(this.normalizeIp(request.ip));
    const contactInfo = this.required(dto.contactInfo, '请填写联系方式');
    const contactHash = this.hashSensitive(contactInfo.toLowerCase());
    if (ipHash) await this.assertLimit(`website:inquiry:ip:${ipHash}`, this.getIpHourlyLimit(), 3600, '提交过于频繁，请稍后再试');
    if (contactHash) await this.assertLimit(`website:inquiry:contact:${contactHash}`, this.getContactDailyLimit(), 86400, '该联系方式今日提交次数已达上限');

    const companyName = this.required(dto.companyName, '请填写公司或品牌名称');
    const contactName = this.clean(dto.contactName);
    const businessOverview = this.required(dto.businessOverview, '请填写主要业务和目标客户');
    const operatingAccounts = this.clean(dto.operatingAccounts);
    const challenge = this.required(dto.challenge, '请选择当前最希望解决的问题');
    const privacyConsentAt = new Date();

    try {
      const submission = await this.prisma.$transaction(async (tx) => {
        const customerLead = await tx.customerLead.create({
          data: {
            companyName,
            contactName,
            contactInfo,
            leadSource: 'OFFICIAL_WEBSITE',
            leadSourceDetail: this.buildSourceDetail(dto),
            requestedFeatures: challenge,
            currentSolution: operatingAccounts,
            followUpStatus: 'PENDING_CONTACT',
            followUpValue: 'NURTURE',
            remark: businessOverview,
          },
        });
        return tx.websiteContactSubmission.create({
          data: {
            customerLeadId: customerLead.id,
            requestId: dto.requestId,
            submittedCompanyName: companyName,
            submittedContactName: contactName,
            submittedContactInfo: contactInfo,
            businessOverview,
            operatingAccounts,
            challenge,
            pageUrl: this.clean(dto.pageUrl),
            referrer: this.clean(dto.referrer),
            utmSource: this.clean(dto.utmSource),
            utmMedium: this.clean(dto.utmMedium),
            utmCampaign: this.clean(dto.utmCampaign),
            utmTerm: this.clean(dto.utmTerm),
            utmContent: this.clean(dto.utmContent),
            ipHash,
            userAgent: this.clean(request.get('user-agent'))?.slice(0, 500) ?? null,
            privacyConsentAt,
          },
        });
      });
      return { accepted: true, referenceId: submission.id, duplicate: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.websiteContactSubmission.findUnique({ where: { requestId: dto.requestId } });
        if (duplicate) return { accepted: true, referenceId: duplicate.id, duplicate: true };
      }
      throw error;
    }
  }

  private buildSourceDetail(dto: SubmitWebsiteInquiryDto) {
    const details = ['官网联系表单'];
    if (dto.utmSource) details.push(`utm_source=${dto.utmSource.trim()}`);
    if (dto.utmCampaign) details.push(`utm_campaign=${dto.utmCampaign.trim()}`);
    return details.join(' / ').slice(0, 300);
  }

  private async assertLimit(key: string, limit: number, ttlSeconds: number, message: string) {
    if (!Number.isFinite(limit) || limit <= 0) return;
    const count = await this.redis.raw.incr(key);
    if (count === 1) await this.redis.raw.expire(key, ttlSeconds);
    if (count > limit) throw new BadRequestException(message);
  }

  private getConfigMaxBytes() {
    return this.config.get<number>('WEBSITE_CONFIG_MAX_BYTES', 262_144);
  }

  private getIpHourlyLimit() {
    return this.config.get<number>('WEBSITE_CONTACT_IP_HOURLY_LIMIT', 10);
  }

  private getContactDailyLimit() {
    return this.config.get<number>('WEBSITE_CONTACT_DAILY_LIMIT', 5);
  }

  private hashSensitive(value?: string | null) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    const secret = this.config.get<string>('WEBSITE_IP_HASH_SALT') || this.config.get<string>('JWT_ACCESS_SECRET') || 'website-inquiry';
    return createHmac('sha256', secret).update(normalized).digest('hex');
  }

  private normalizeIp(value?: string | null) {
    return String(value ?? '').split(',')[0].trim().slice(0, 100);
  }

  private required(value: string | undefined, message: string) {
    const normalized = this.clean(value);
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private clean(value?: string | null) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }
}
