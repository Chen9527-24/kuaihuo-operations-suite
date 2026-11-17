import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerServiceGuidelineRepository } from '../../infrastructure/persistence/customer-service-guideline.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import type { CustomerServiceGuidelineVersionDraftContent } from '../../runtime/guideline/customer-service-guideline.type';
import { CustomerServiceGuidelineValidator } from '../../runtime/guideline/customer-service-guideline-validator';
import {
  CreateCustomerServiceGuidelineDto,
  CreateCustomerServiceGuidelineVersionDto,
  CustomerServiceGuidelineQueryDto,
  PublishCustomerServiceGuidelineVersionDto,
  RollbackCustomerServiceGuidelineVersionDto,
  UpdateCustomerServiceGuidelineDto,
} from './dto/customer-service-guideline.dto';

@Injectable()
export class CustomerServiceGuidelinesService {
  constructor(
    private readonly repository: CustomerServiceGuidelineRepository,
    private readonly validator: CustomerServiceGuidelineValidator,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: CustomerServiceGuidelineQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceGuidelineWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.originType ? { originType: query.originType } : {}),
      ...(query.keyword ? { OR: [
        { code: { contains: query.keyword, mode: 'insensitive' } },
        { name: { contains: query.keyword, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('Guideline 不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceGuidelineDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    try {
      return await this.repository.create({
        tenantId,
        code: normalizeCustomerServiceKey(dto.code),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        originType: dto.originType?.trim() || 'TENANT_CUSTOM',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('当前租户已存在相同 Guideline 编码');
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerServiceGuidelineDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('Guideline 已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async listVersions(id: string, user: CurrentUserPayload) {
    const guideline = await this.get(id, user);
    return this.repository.listVersions(guideline.id);
  }

  async createVersion(id: string, dto: CreateCustomerServiceGuidelineVersionDto, user: CurrentUserPayload) {
    const guideline = await this.get(id, user);
    const content = normalizeVersionContent(dto);
    this.validator.validate(content);
    const versionNo = await this.repository.nextVersionNo(guideline.id);
    return this.repository.createVersion({
      guidelineId: guideline.id,
      versionNo,
      schemaVersion: content.schemaVersion,
      binding: content.binding as Prisma.InputJsonValue,
      condition: content.condition as Prisma.InputJsonValue,
      actions: content.actions as unknown as Prisma.InputJsonValue,
      priority: content.priority,
      criticality: content.criticality,
      tags: content.tags,
      relationships: content.relationships as Prisma.InputJsonValue,
      evidenceRefs: content.evidenceRefs,
      contentHash: stableJsonHash(content),
      status: dto.status || 'DRAFT',
      regressionResult: dto.regressionResult as Prisma.InputJsonValue | undefined,
      createdById: user.id,
    });
  }

  async validateVersion(id: string, versionId: string, user: CurrentUserPayload) {
    const guideline = await this.get(id, user);
    const version = await this.repository.findVersion(guideline.id, versionId);
    if (!version) throw new NotFoundException('Guideline 版本不存在');
    const content = versionContent(version);
    this.validator.validate(content);
    await this.validatePinnedResponseAssets(guideline.tenantId, content);
    return { valid: true, contentHash: stableJsonHash(content) };
  }

  async publishVersion(id: string, versionId: string, dto: PublishCustomerServiceGuidelineVersionDto, user: CurrentUserPayload) {
    const guideline = await this.get(id, user);
    const version = await this.repository.findVersion(guideline.id, versionId);
    if (!version) throw new NotFoundException('Guideline 版本不存在');
    const content = versionContent(version);
    this.validator.validate(content);
    await this.validatePinnedResponseAssets(guideline.tenantId, content);
    const expectedHash = stableJsonHash(content);
    if (expectedHash !== version.contentHash) throw new UnprocessableEntityException('Guideline 版本内容哈希不一致，禁止发布。');
    const result = await this.repository.publishVersion({
      guidelineId: guideline.id,
      tenantId: guideline.tenantId,
      versionId,
      guidelineRevision: dto.revision,
      userId: user.id,
    });
    if (result.kind === 'NOT_FOUND') throw new NotFoundException('Guideline 或版本不存在');
    if (result.kind === 'INVALID_STATUS') throw new UnprocessableEntityException('只有 DRAFT / CANDIDATE 版本可以发布');
    if (result.kind === 'REVISION_CONFLICT') throw new ConflictException('Guideline 已被其他操作更新，请刷新后重试');
    return result.version;
  }

  async rollbackVersion(id: string, versionId: string, dto: RollbackCustomerServiceGuidelineVersionDto, user: CurrentUserPayload) {
    if (!dto.confirmRollback) throw new UnprocessableEntityException('必须明确确认回滚');
    const guideline = await this.get(id, user);
    const target = await this.repository.findVersion(guideline.id, versionId);
    if (!target) throw new NotFoundException('历史 Guideline 版本不存在');
    const content = versionContent(target);
    this.validator.validate(content);
    await this.validatePinnedResponseAssets(guideline.tenantId, content, true);
    const result = await this.repository.rollbackToHistoricalVersion({
      guidelineId: guideline.id,
      tenantId: guideline.tenantId,
      targetVersionId: versionId,
      guidelineRevision: dto.guidelineRevision,
      userId: user.id,
      reason: dto.reason.trim(),
    });
    if (result.kind === 'NOT_FOUND') throw new NotFoundException('Guideline 或历史版本不存在');
    if (result.kind === 'INVALID_TARGET') throw new UnprocessableEntityException('目标版本不是可回滚历史版本');
    if (result.kind === 'REVISION_CONFLICT') throw new ConflictException('Guideline 已被其他操作更新，请刷新后重试');
    return result;
  }

  private async validatePinnedResponseAssets(tenantId: string, content: CustomerServiceGuidelineVersionDraftContent, allowHistorical = false) {
    for (const action of content.actions.filter((item) => item.op === 'USE_RESPONSE_ASSET')) {
      const row = await this.prisma.customerServiceAssetVersion.findFirst({
        where: {
          id: action.versionId,
          assetId: action.assetId,
          ...(allowHistorical ? {} : { status: 'PUBLISHED' }),
          asset: {
            tenantId,
            deletedAt: null,
            ...(allowHistorical ? {} : { currentVersionId: action.versionId }),
          },
        } as any,
        include: { asset: true },
      });
      if (!row) throw new UnprocessableEntityException(`Response Asset 版本不存在或不是当前已发布版本：${action.assetId}/${action.versionId}`);
    }
  }
}

function normalizeVersionContent(dto: CreateCustomerServiceGuidelineVersionDto): CustomerServiceGuidelineVersionDraftContent {
  return {
    schemaVersion: 1,
    binding: dto.binding as any,
    condition: dto.condition as any,
    actions: dto.actions as any,
    priority: dto.priority ?? 100,
    criticality: (dto.criticality || 'STANDARD') as any,
    tags: uniqueStrings(dto.tags || []),
    relationships: (dto.relationships || {}) as any,
    evidenceRefs: uniqueStrings(dto.evidenceRefs || []),
  };
}
function versionContent(version: any): CustomerServiceGuidelineVersionDraftContent {
  return {
    schemaVersion: Number(version.schemaVersion || 1),
    binding: version.binding as any,
    condition: version.condition as any,
    actions: Array.isArray(version.actions) ? version.actions as any : [],
    priority: Number(version.priority || 0),
    criticality: String(version.criticality || 'STANDARD') as any,
    tags: uniqueStrings(version.tags || []),
    relationships: (version.relationships || {}) as any,
    evidenceRefs: uniqueStrings(version.evidenceRefs || []),
  };
}
function uniqueStrings(values: unknown[]) { return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))]; }
