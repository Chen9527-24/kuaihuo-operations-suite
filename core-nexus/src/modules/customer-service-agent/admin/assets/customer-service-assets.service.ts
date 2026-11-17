import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceAssetRepository } from '../../infrastructure/persistence/customer-service-asset.repository';
import { CustomerServiceAssetType } from '../../shared/constants/customer-service-foundation.constant';
import { CustomerServiceResponseAssetValidator } from './validators/customer-service-response-asset.validator';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import { CustomerServiceAssetQueryDto } from './dto/asset-query.dto';
import { CreateCustomerServiceAssetVersionDto } from './dto/create-asset-version.dto';
import { CreateCustomerServiceAssetDto } from './dto/create-asset.dto';
import { PublishCustomerServiceAssetVersionDto } from './dto/publish-asset-version.dto';
import { UpdateCustomerServiceAssetDto } from './dto/update-asset.dto';
import { RollbackCustomerServiceAssetVersionDto } from './dto/rollback-asset-version.dto';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceAssetsService {
  constructor(
    private readonly repository: CustomerServiceAssetRepository,
    private readonly responseAssetValidator: CustomerServiceResponseAssetValidator,
    private readonly prisma: PrismaService,
  ) {}

  async createCalibrationStrategyDraft(
    input: {
      tenantId: string;
      assetKey: string;
      assetName: string;
      description: string;
      versionTitle: string;
      versionSummary: string;
      content: Record<string, unknown>;
    },
    user: CurrentUserPayload,
  ) {
    this.responseAssetValidator.validate('STRATEGY_GROUP', input.content);
    const key = normalizeCustomerServiceKey(input.assetKey);
    let asset = await this.repository.findByKey(input.tenantId, key);
    if (asset && asset.assetType !== 'STRATEGY_GROUP') {
      throw new ConflictException('校准策略草稿编码已被其他类型资产占用。');
    }
    if (!asset) {
      try {
        asset = await this.repository.create({
          tenantId: input.tenantId,
          key,
          name: input.assetName.trim(),
          assetType: 'STRATEGY_GROUP',
          description: input.description.trim(),
          createdById: user.id,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        asset = await this.repository.findByKey(input.tenantId, key);
        if (!asset || asset.assetType !== 'STRATEGY_GROUP') {
          throw new ConflictException('校准策略草稿资产发生并发冲突，请刷新后重试。');
        }
      }
    }
    const versionNo = await this.repository.nextVersionNo(asset.id);
    const version = await this.repository.createVersion({
      assetId: asset.id,
      versionNo,
      title: input.versionTitle.trim(),
      summary: input.versionSummary.trim(),
      content: input.content as Prisma.InputJsonValue,
      contentHash: stableJsonHash(input.content),
      createdById: user.id,
    });
    return { asset, version };
  }

  async list(query: CustomerServiceAssetQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceAssetWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.assetType ? { assetType: query.assetType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? { OR: [{ key: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload, tenantId?: string) {
    const item = await this.repository.findScoped(id, resolveTenantId(user, tenantId));
    if (!item) throw new NotFoundException('智能客服配置资产不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceAssetDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    try {
      return await this.repository.create({
        tenantId,
        key: normalizeCustomerServiceKey(dto.key),
        name: dto.name.trim(),
        assetType: dto.assetType,
        description: dto.description?.trim() || null,
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同资产编码');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerServiceAssetDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('资产已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async listVersions(id: string, user: CurrentUserPayload) {
    const asset = await this.get(id, user);
    return this.repository.listVersions(asset.id);
  }

  async createVersion(id: string, dto: CreateCustomerServiceAssetVersionDto, user: CurrentUserPayload) {
    const asset = await this.get(id, user);
    this.responseAssetValidator.validate(asset.assetType as CustomerServiceAssetType, dto.content);
    const versionNo = await this.repository.nextVersionNo(asset.id);
    return this.repository.createVersion({
      assetId: asset.id,
      versionNo,
      title: dto.title.trim(),
      summary: dto.summary?.trim() || null,
      content: dto.content as Prisma.InputJsonValue,
      contentHash: stableJsonHash(dto.content),
      createdById: user.id,
    });
  }

  async publishVersion(id: string, versionId: string, dto: PublishCustomerServiceAssetVersionDto, user: CurrentUserPayload) {
    const asset = await this.get(id, user);
    const version = await this.repository.findVersion(asset.id, versionId);
    if (!version) throw new NotFoundException('资产版本不存在');
    const calibrationDraft = await this.prisma.customerServiceCalibrationRecord.findFirst({
      where: { strategyDraftVersionId: versionId, tenantId: asset.tenantId, deletedAt: null },
    } as any) as any;
    if (calibrationDraft && calibrationDraft.strategyDraftStatus !== 'REGRESSION_PASSED') {
      throw new UnprocessableEntityException('校准生成的策略草稿必须先使用该草稿版本完成回归并通过，才能发布。');
    }
    this.responseAssetValidator.validate(asset.assetType as CustomerServiceAssetType, version.content as Record<string, unknown>);
    const result = await this.repository.publishVersion(
      asset.id,
      versionId,
      asset.tenantId,
      dto.revision,
      user.id,
      calibrationDraft ? { id: calibrationDraft.id, tenantId: calibrationDraft.tenantId } : undefined,
    );
    if (result.kind === 'NOT_FOUND') throw new NotFoundException('资产版本不存在');
    if (result.kind === 'INVALID_STATUS') throw new UnprocessableEntityException('只有草稿版本可以发布');
    if (result.kind === 'REVISION_CONFLICT') throw new ConflictException('版本已被其他操作更新，请刷新后重试');
    return result.version;
  }
  async rollbackVersion(
    id: string,
    versionId: string,
    dto: RollbackCustomerServiceAssetVersionDto,
    user: CurrentUserPayload,
  ) {
    if (!dto.confirmRollback) throw new UnprocessableEntityException('必须明确确认回滚后才能继续。');
    const asset = await this.get(id, user);
    if (asset.currentVersionId === versionId) throw new UnprocessableEntityException('目标版本已经是当前正式版本，无需回滚。');
    const target = await this.repository.findVersion(asset.id, versionId);
    if (!target) throw new NotFoundException('历史资产版本不存在');
    if (target.status !== 'ARCHIVED') throw new UnprocessableEntityException('只能回滚到曾经发布并已归档的历史版本。');
    this.responseAssetValidator.validate(asset.assetType as CustomerServiceAssetType, target.content as Record<string, unknown>);
    try {
      const result = await this.repository.rollbackToHistoricalVersion({
        assetId: asset.id,
        tenantId: asset.tenantId,
        targetVersionId: target.id,
        assetRevision: dto.assetRevision,
        userId: user.id,
        reason: dto.reason.trim(),
      });
      if (result.kind === 'NOT_FOUND') throw new NotFoundException('资产或历史版本不存在');
      if (result.kind === 'INVALID_TARGET') throw new UnprocessableEntityException('目标版本不是可回滚的历史发布版本');
      if (result.kind === 'REVISION_CONFLICT') throw new ConflictException('资产已被其他操作更新，请刷新后重试');
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('回滚期间产生版本并发冲突，请刷新后重试。');
      }
      throw error;
    }
  }

}
