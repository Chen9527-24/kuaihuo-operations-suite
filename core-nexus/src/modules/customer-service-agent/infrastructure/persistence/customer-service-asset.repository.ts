import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceAssetWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceAsset.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { versions: true } } },
    });
  }

  count(where: Prisma.CustomerServiceAssetWhereInput) {
    return this.prisma.customerServiceAsset.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceAsset.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: { _count: { select: { versions: true } } },
    });
  }

  findByKey(tenantId: string, key: string) {
    return this.prisma.customerServiceAsset.findFirst({
      where: { tenantId, key, deletedAt: null },
    });
  }

  create(data: Prisma.CustomerServiceAssetUncheckedCreateInput) {
    return this.prisma.customerServiceAsset.create({ data });
  }

  async updateWithRevision(id: string, tenantId: string | undefined, revision: number, data: Prisma.CustomerServiceAssetUncheckedUpdateManyInput) {
    return this.prisma.customerServiceAsset.updateMany({
      where: { id, revision, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  listVersions(assetId: string) {
    return this.prisma.customerServiceAssetVersion.findMany({ where: { assetId }, orderBy: { versionNo: 'desc' } });
  }

  async nextVersionNo(assetId: string) {
    const latest = await this.prisma.customerServiceAssetVersion.findFirst({
      where: { assetId },
      select: { versionNo: true },
      orderBy: { versionNo: 'desc' },
    });
    return (latest?.versionNo ?? 0) + 1;
  }

  createVersion(data: Prisma.CustomerServiceAssetVersionUncheckedCreateInput) {
    return this.prisma.customerServiceAssetVersion.create({ data });
  }

  findVersion(assetId: string, versionId: string) {
    return this.prisma.customerServiceAssetVersion.findFirst({ where: { id: versionId, assetId } });
  }

  async publishVersion(
    assetId: string,
    versionId: string,
    tenantId: string | undefined,
    revision: number,
    userId: string,
    calibrationDraft?: { id: string; tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.customerServiceAssetVersion.findFirst({
        where: { id: versionId, assetId, asset: { deletedAt: null, ...(tenantId ? { tenantId } : {}) } },
      });
      if (!version) return { kind: 'NOT_FOUND' as const };
      if (version.status !== 'DRAFT') return { kind: 'INVALID_STATUS' as const, version };

      const updated = await tx.customerServiceAssetVersion.updateMany({
        where: { id: versionId, assetId, revision, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: userId, revision: { increment: 1 } },
      });
      if (!updated.count) return { kind: 'REVISION_CONFLICT' as const };

      await tx.customerServiceAssetVersion.updateMany({
        where: { assetId, id: { not: versionId }, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED', revision: { increment: 1 } },
      });
      await tx.customerServiceAsset.update({
        where: { id: assetId },
        data: { status: 'PUBLISHED', currentVersionId: versionId, updatedById: userId, revision: { increment: 1 } },
      });
      await (tx.customerServiceCalibrationRecord as any).updateMany({
        where: {
          tenantId,
          strategyDraftAssetId: assetId,
          strategyDraftVersionId: { not: versionId },
          strategyDraftStatus: 'PUBLISHED',
          deletedAt: null,
        },
        data: {
          strategyDraftStatus: 'SUPERSEDED',
          updatedById: userId,
          revision: { increment: 1 },
        },
      });
      if (calibrationDraft) {
        const calibrationUpdated = await (tx.customerServiceCalibrationRecord as any).updateMany({
          where: {
            id: calibrationDraft.id,
            tenantId: calibrationDraft.tenantId,
            strategyDraftVersionId: versionId,
            strategyDraftStatus: 'REGRESSION_PASSED',
            deletedAt: null,
          },
          data: {
            strategyDraftStatus: 'PUBLISHED',
            strategyDraftPublishedAt: new Date(),
            updatedById: userId,
            revision: { increment: 1 },
          },
        });
        if (calibrationUpdated.count !== 1) {
          throw new Error('校准策略发布状态并发变化，已回滚资产版本发布');
        }
      }
      const result = await tx.customerServiceAssetVersion.findUnique({ where: { id: versionId } });
      return { kind: 'PUBLISHED' as const, version: result };
    });
  }

  async rollbackToHistoricalVersion(input: {
    assetId: string;
    tenantId: string;
    targetVersionId: string;
    assetRevision: number;
    userId: string;
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.customerServiceAsset.findFirst({
        where: { id: input.assetId, tenantId: input.tenantId, deletedAt: null },
      });
      if (!asset) return { kind: 'NOT_FOUND' as const };
      if (asset.revision !== input.assetRevision) return { kind: 'REVISION_CONFLICT' as const };
      const target = await tx.customerServiceAssetVersion.findFirst({
        where: { id: input.targetVersionId, assetId: asset.id },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };
      if (target.status !== 'ARCHIVED' || asset.currentVersionId === target.id) {
        return { kind: 'INVALID_TARGET' as const };
      }
      const latest = await tx.customerServiceAssetVersion.findFirst({
        where: { assetId: asset.id },
        select: { versionNo: true },
        orderBy: { versionNo: 'desc' },
      });
      const created = await tx.customerServiceAssetVersion.create({
        data: {
          assetId: asset.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          title: `回滚至 v${target.versionNo} · ${target.title}`.slice(0, 160),
          summary: [
            `由历史版本 ${target.id} 复制生成，原历史内容保持不变。`,
            `回滚原因：${input.reason}`,
          ].filter(Boolean).join('\n'),
          content: target.content as Prisma.InputJsonValue,
          contentHash: target.contentHash,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: input.userId,
          createdById: input.userId,
        },
      });
      if (asset.currentVersionId) {
        await tx.customerServiceAssetVersion.updateMany({
          where: { id: asset.currentVersionId, assetId: asset.id, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED', revision: { increment: 1 } },
        });
      }
      const updated = await tx.customerServiceAsset.updateMany({
        where: { id: asset.id, tenantId: input.tenantId, revision: input.assetRevision, deletedAt: null },
        data: {
          status: 'PUBLISHED',
          currentVersionId: created.id,
          updatedById: input.userId,
          revision: { increment: 1 },
        },
      });
      if (!updated.count) throw new Error('资产回滚并发状态变化，事务已自动撤销。');
      await (tx.customerServiceCalibrationRecord as any).updateMany({
        where: {
          tenantId: input.tenantId,
          strategyDraftAssetId: asset.id,
          strategyDraftStatus: 'PUBLISHED',
          deletedAt: null,
        },
        data: {
          strategyDraftStatus: 'SUPERSEDED',
          updatedById: input.userId,
          revision: { increment: 1 },
        },
      });
      return {
        kind: 'ROLLED_BACK' as const,
        version: created,
        targetVersionId: target.id,
        replacedVersionId: asset.currentVersionId,
      };
    });
  }

}
