import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stableJsonHash } from '../../../shared/utils/stable-json-hash.util';
import {
  FOUNDATION_RESPONSE_ASSETS,
  FOUNDATION_RESPONSE_RULES,
} from '../templates/customer-service-foundation.template';
import {
  CustomerServiceFoundationTx,
  CustomerServiceResponseAssetSeedMap,
} from '../types/foundation-seed.type';
import { CustomerServiceFoundationResult } from '../types/foundation-result.type';

@Injectable()
export class CustomerServiceResponseFoundationSeeder {
  async seed(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
  ) {
    const assets = await this.ensureResponseAssets(tx, tenantId, userId, result);
    await this.ensureResponseRules(tx, tenantId, userId, result, assets);
  }

  private async ensureResponseAssets(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
  ): Promise<CustomerServiceResponseAssetSeedMap> {
    const map: CustomerServiceResponseAssetSeedMap = new Map();
    for (const item of FOUNDATION_RESPONSE_ASSETS) {
      let asset = await tx.customerServiceAsset.findUnique({ where: { tenantId_key: { tenantId, key: item.key } } });
      if (asset) {
        result.existing.responseAssets += 1;
        if (!asset.currentVersionId) result.warnings.push(`资产“${item.name}”已存在但没有已发布版本，初始化程序未覆盖其现有内容。`);
        map.set(item.key, { id: asset.id, ready: Boolean(asset.currentVersionId) && asset.status === 'PUBLISHED' });
        continue;
      }
      asset = await tx.customerServiceAsset.create({
        data: {
          tenantId,
          key: item.key,
          name: item.name,
          assetType: item.assetType,
          description: item.description,
          status: 'DRAFT',
          createdById: userId,
        },
      });
      const version = await tx.customerServiceAssetVersion.create({
        data: {
          assetId: asset.id,
          versionNo: 1,
          title: '正式初始化版本',
          summary: '由智能客服正式初始化向导创建；后续变更请创建新版本发布。',
          content: item.content as Prisma.InputJsonValue,
          contentHash: stableJsonHash(item.content),
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: userId,
          createdById: userId,
        },
      });
      asset = await tx.customerServiceAsset.update({
        where: { id: asset.id },
        data: { status: 'PUBLISHED', currentVersionId: version.id, updatedById: userId, revision: { increment: 1 } },
      });
      result.created.responseAssets += 1;
      map.set(item.key, { id: asset.id, ready: true });
    }
    return map;
  }

  private async ensureResponseRules(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
    assets: CustomerServiceResponseAssetSeedMap,
  ) {
    for (const item of FOUNDATION_RESPONSE_RULES) {
      const existing = await tx.customerServiceResponseRule.findUnique({
        where: { tenantId_key: { tenantId, key: item.key } },
      });
      if (existing) {
        result.existing.responseRules += 1;
        continue;
      }
      const asset = assets.get(item.assetKey);
      if (!asset) {
        result.warnings.push(`回复规则“${item.name}”缺少响应资产，未创建。`);
        continue;
      }
      if (!asset.ready) {
        result.warnings.push(`回复规则“${item.name}”对应资产尚未发布，未创建。请先发布现有资产版本后再次补齐初始化。`);
        continue;
      }
      await tx.customerServiceResponseRule.create({
        data: {
          tenantId,
          responseAssetId: asset.id,
          key: item.key,
          name: item.name,
          conditions: item.conditions as Prisma.InputJsonValue,
          priority: item.priority,
          exclusive: 'exclusive' in item ? item.exclusive : false,
          status: 'status' in item ? item.status : 'ENABLED',
          createdById: userId,
        },
      });
      result.created.responseRules += 1;
    }
  }
}
