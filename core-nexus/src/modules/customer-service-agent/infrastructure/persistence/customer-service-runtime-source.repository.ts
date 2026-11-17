import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CUSTOMER_SERVICE_DETERMINISTIC_ASSET_TYPES } from '../../shared/constants/customer-service-foundation.constant';

@Injectable()
export class CustomerServiceRuntimeSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMerchantRole(id: string, tenantId?: string) {
    return this.prisma.customerServiceMerchantRole.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: {
        prototype: true,
        industryNode: true,
        modules: {
          where: { deletedAt: null, status: 'ENABLED', definition: { status: 'ENABLED' } },
          orderBy: [{ priority: 'desc' }, { sort: 'asc' }, { createdAt: 'asc' }],
          include: { definition: true },
        },
      },
    });
  }

  findIndustryNode(id: string, tenantId: string) {
    return this.prisma.customerServiceIndustryNode.findFirst({
      where: { id, tenantId, deletedAt: null, status: { not: 'ARCHIVED' } },
    });
  }

  async findPublishedAssets(ids: string[], tenantId: string) {
    if (!ids.length) return [];
    const assets = await this.prisma.customerServiceAsset.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null, currentVersionId: { not: null } },
    });
    const versionIds = assets.map((item) => item.currentVersionId).filter((id): id is string => Boolean(id));
    const versions = await this.prisma.customerServiceAssetVersion.findMany({
      where: { id: { in: versionIds }, status: 'PUBLISHED' },
    });
    const versionMap = new Map(versions.map((version) => [version.id, version]));
    return assets
      .map((asset) => ({ asset, version: asset.currentVersionId ? versionMap.get(asset.currentVersionId) : undefined }))
      .filter((item): item is { asset: (typeof assets)[number]; version: (typeof versions)[number] } => Boolean(item.version))
      .sort((left, right) => left.asset.key.localeCompare(right.asset.key));
  }
  async findEnabledResponseRules(tenantId: string) {
    const rules = await this.prisma.customerServiceResponseRule.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'ENABLED',
        responseAsset: {
          deletedAt: null,
          status: 'PUBLISHED',
          currentVersionId: { not: null },
          assetType: { in: [...CUSTOMER_SERVICE_DETERMINISTIC_ASSET_TYPES] },
        },
      },
      orderBy: [{ priority: 'desc' }, { sort: 'asc' }, { createdAt: 'asc' }],
      include: { responseAsset: true },
    });
    const versionIds = rules
      .map((rule) => rule.responseAsset.currentVersionId)
      .filter((id): id is string => Boolean(id));
    const versions = await this.prisma.customerServiceAssetVersion.findMany({
      where: { id: { in: versionIds }, status: 'PUBLISHED' },
    });
    const versionMap = new Map(versions.map((version) => [version.id, version]));
    return rules
      .map((rule) => ({
        rule,
        version: rule.responseAsset.currentVersionId
          ? versionMap.get(rule.responseAsset.currentVersionId)
          : undefined,
      }))
      .filter((item): item is { rule: (typeof rules)[number]; version: (typeof versions)[number] } => Boolean(item.version));
  }

  async findPublishedStrategyGroups(tenantId: string) {
    const assets = await this.prisma.customerServiceAsset.findMany({
      where: {
        tenantId,
        deletedAt: null,
        assetType: 'STRATEGY_GROUP',
        status: 'PUBLISHED',
        currentVersionId: { not: null },
      },
      orderBy: [{ key: 'asc' }],
    });
    const versionIds = assets.map((item) => item.currentVersionId).filter((id): id is string => Boolean(id));
    const versions = await this.prisma.customerServiceAssetVersion.findMany({
      where: { id: { in: versionIds }, status: 'PUBLISHED' },
    });
    const versionMap = new Map(versions.map((version) => [version.id, version]));
    return assets
      .map((asset) => ({ asset, version: asset.currentVersionId ? versionMap.get(asset.currentVersionId) : undefined }))
      .filter((item): item is { asset: (typeof assets)[number]; version: (typeof versions)[number] } => Boolean(item.version));
  }

  async findStrategyGroupVersions(versionIds: string[], tenantId: string) {
    if (!versionIds.length) return [];
    const versions = await this.prisma.customerServiceAssetVersion.findMany({
      where: {
        id: { in: versionIds },
        status: { in: ['DRAFT', 'PUBLISHED'] },
        asset: {
          tenantId,
          deletedAt: null,
          assetType: 'STRATEGY_GROUP',
        },
      },
      include: { asset: true },
    });
    return versions.map((version) => ({ asset: version.asset, version }));
  }


}
