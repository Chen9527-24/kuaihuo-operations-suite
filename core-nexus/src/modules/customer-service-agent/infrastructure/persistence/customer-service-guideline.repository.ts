import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceGuidelineRepository {
  private readonly logger = new Logger(CustomerServiceGuidelineRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceGuidelineWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceGuideline.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
      include: { _count: { select: { versions: true } } },
    });
  }

  count(where: Prisma.CustomerServiceGuidelineWhereInput) {
    return this.prisma.customerServiceGuideline.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceGuideline.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: { _count: { select: { versions: true } } },
    });
  }

  findByCode(tenantId: string, code: string) {
    return this.prisma.customerServiceGuideline.findFirst({ where: { tenantId, code, deletedAt: null } });
  }

  create(data: Prisma.CustomerServiceGuidelineUncheckedCreateInput) {
    return this.prisma.customerServiceGuideline.create({ data });
  }

  updateWithRevision(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceGuidelineUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceGuideline.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  listVersions(guidelineId: string) {
    return this.prisma.customerServiceGuidelineVersion.findMany({
      where: { guidelineId },
      orderBy: { versionNo: 'desc' },
    });
  }

  async nextVersionNo(guidelineId: string) {
    const latest = await this.prisma.customerServiceGuidelineVersion.findFirst({
      where: { guidelineId },
      select: { versionNo: true },
      orderBy: { versionNo: 'desc' },
    });
    return (latest?.versionNo ?? 0) + 1;
  }

  createVersion(data: Prisma.CustomerServiceGuidelineVersionUncheckedCreateInput) {
    return this.prisma.customerServiceGuidelineVersion.create({ data });
  }

  findVersion(guidelineId: string, versionId: string) {
    return this.prisma.customerServiceGuidelineVersion.findFirst({ where: { id: versionId, guidelineId } });
  }

  async findPublishedForRuntime(tenantId: string) {
    try {
      const guidelines = await this.prisma.customerServiceGuideline.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: 'ENABLED',
          currentVersionId: { not: null },
        },
        orderBy: [{ updatedAt: 'asc' }, { code: 'asc' }],
      });
      const versionIds = guidelines.map((item) => item.currentVersionId).filter((id): id is string => Boolean(id));
      if (!versionIds.length) return [];
      const versions = await this.prisma.customerServiceGuidelineVersion.findMany({
        where: { id: { in: versionIds }, status: 'PUBLISHED' },
      });
      const map = new Map(versions.map((item) => [item.id, item]));
      return guidelines
        .map((guideline) => ({ guideline, version: guideline.currentVersionId ? map.get(guideline.currentVersionId) : undefined }))
        .filter((item): item is { guideline: (typeof guidelines)[number]; version: (typeof versions)[number] } => Boolean(item.version));
    } catch (error) {
      // HVE-2 is shadow-only. A not-yet-deployed migration must never break the current customer-visible C6 runtime.
      this.logger.warn(`HVE-2 Guideline runtime source unavailable; falling back to HVE-1 legacy shadow: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async publishVersion(input: {
    guidelineId: string;
    tenantId: string;
    versionId: string;
    guidelineRevision: number;
    userId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const guideline = await tx.customerServiceGuideline.findFirst({
        where: { id: input.guidelineId, tenantId: input.tenantId, deletedAt: null },
      });
      if (!guideline) return { kind: 'NOT_FOUND' as const };
      if (guideline.revision !== input.guidelineRevision) return { kind: 'REVISION_CONFLICT' as const };
      const version = await tx.customerServiceGuidelineVersion.findFirst({
        where: { id: input.versionId, guidelineId: guideline.id },
      });
      if (!version) return { kind: 'NOT_FOUND' as const };
      if (!['DRAFT', 'CANDIDATE'].includes(version.status)) return { kind: 'INVALID_STATUS' as const };
      if (guideline.currentVersionId) {
        await tx.customerServiceGuidelineVersion.updateMany({
          where: { id: guideline.currentVersionId, guidelineId: guideline.id, status: 'PUBLISHED' },
          data: { status: 'RETIRED' },
        });
      }
      const published = await tx.customerServiceGuidelineVersion.update({
        where: { id: version.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: input.userId,
        },
      });
      const updated = await tx.customerServiceGuideline.updateMany({
        where: { id: guideline.id, tenantId: input.tenantId, revision: input.guidelineRevision, deletedAt: null },
        data: {
          status: 'ENABLED',
          currentVersionId: published.id,
          updatedById: input.userId,
          revision: { increment: 1 },
        },
      });
      if (!updated.count) throw new Error('Guideline 发布并发状态变化，事务已回滚。');
      return { kind: 'PUBLISHED' as const, version: published };
    });
  }

  async rollbackToHistoricalVersion(input: {
    guidelineId: string;
    tenantId: string;
    targetVersionId: string;
    guidelineRevision: number;
    userId: string;
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const guideline = await tx.customerServiceGuideline.findFirst({
        where: { id: input.guidelineId, tenantId: input.tenantId, deletedAt: null },
      });
      if (!guideline) return { kind: 'NOT_FOUND' as const };
      if (guideline.revision !== input.guidelineRevision) return { kind: 'REVISION_CONFLICT' as const };
      const target = await tx.customerServiceGuidelineVersion.findFirst({
        where: { id: input.targetVersionId, guidelineId: guideline.id },
      });
      if (!target || !['RETIRED', 'PUBLISHED'].includes(target.status) || guideline.currentVersionId === target.id) {
        return { kind: 'INVALID_TARGET' as const };
      }
      const latest = await tx.customerServiceGuidelineVersion.findFirst({
        where: { guidelineId: guideline.id },
        select: { versionNo: true },
        orderBy: { versionNo: 'desc' },
      });
      const created = await tx.customerServiceGuidelineVersion.create({
        data: {
          guidelineId: guideline.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          schemaVersion: target.schemaVersion,
          binding: target.binding as Prisma.InputJsonValue,
          condition: target.condition as Prisma.InputJsonValue,
          actions: target.actions as Prisma.InputJsonValue,
          priority: target.priority,
          criticality: target.criticality,
          tags: target.tags,
          relationships: (target.relationships ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          evidenceRefs: [...target.evidenceRefs, `ROLLBACK:${target.id}`, `REASON:${input.reason}`].slice(-100),
          contentHash: target.contentHash,
          status: 'PUBLISHED',
          regressionResult: target.regressionResult as Prisma.InputJsonValue | undefined,
          publishedAt: new Date(),
          publishedById: input.userId,
          createdById: input.userId,
        },
      });
      if (guideline.currentVersionId) {
        await tx.customerServiceGuidelineVersion.updateMany({
          where: { id: guideline.currentVersionId, guidelineId: guideline.id, status: 'PUBLISHED' },
          data: { status: 'RETIRED' },
        });
      }
      const updated = await tx.customerServiceGuideline.updateMany({
        where: { id: guideline.id, tenantId: input.tenantId, revision: input.guidelineRevision, deletedAt: null },
        data: { currentVersionId: created.id, status: 'ENABLED', updatedById: input.userId, revision: { increment: 1 } },
      });
      if (!updated.count) throw new Error('Guideline 回滚并发状态变化，事务已回滚。');
      return { kind: 'ROLLED_BACK' as const, version: created };
    });
  }
}
