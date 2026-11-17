import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export class CustomerServiceIndustryNodeRevisionConflictError extends Error {
  constructor() {
    super('CUSTOMER_SERVICE_INDUSTRY_NODE_REVISION_CONFLICT');
  }
}

type IndustryTreeLayoutChange = {
  id: string;
  revision: number;
  parentId: string | null;
  sort: number;
  level: number;
  nodeType: string;
  path: string;
};

@Injectable()
export class CustomerServiceIndustryNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceIndustryNodeWhereInput) {
    return this.prisma.customerServiceIndustryNode.findMany({
      where,
      orderBy: [{ level: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceIndustryNode.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
  }

  findActiveByCode(tenantId: string, code: string) {
    return this.prisma.customerServiceIndustryNode.findFirst({
      where: { tenantId, code, deletedAt: null },
      select: { id: true, code: true },
    });
  }

  create(data: Prisma.CustomerServiceIndustryNodeUncheckedCreateInput) {
    return this.prisma.customerServiceIndustryNode.create({ data });
  }

  updateWithRevision(
    id: string,
    tenantId: string | undefined,
    revision: number,
    data: Prisma.CustomerServiceIndustryNodeUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceIndustryNode.updateMany({
      where: { id, revision, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  async applyTreeLayout(tenantId: string, changes: IndustryTreeLayoutChange[], updatedById: string) {
    if (!changes.length) return { updated: 0 };
    return this.prisma.$transaction(async (tx) => {
      let updated = 0;
      for (const change of changes) {
        const result = await tx.customerServiceIndustryNode.updateMany({
          where: { id: change.id, tenantId, revision: change.revision, deletedAt: null },
          data: {
            parentId: change.parentId,
            sort: change.sort,
            level: change.level,
            nodeType: change.nodeType,
            path: change.path,
            updatedById,
            revision: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new CustomerServiceIndustryNodeRevisionConflictError();
        updated += result.count;
      }
      return { updated };
    });
  }

  async softDeleteSubtree(input: {
    tenantId: string;
    rootId: string;
    rootRevision: number;
    nodeIds: string[];
    updatedById: string;
  }) {
    const { tenantId, rootId, rootRevision, nodeIds, updatedById } = input;
    const descendantIds = nodeIds.filter((id) => id !== rootId);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const root = await tx.customerServiceIndustryNode.updateMany({
        where: { id: rootId, tenantId, revision: rootRevision, deletedAt: null },
        data: {
          status: 'ARCHIVED',
          deletedAt: now,
          updatedById,
          revision: { increment: 1 },
        },
      });
      if (root.count !== 1) throw new CustomerServiceIndustryNodeRevisionConflictError();

      const descendants = descendantIds.length
        ? await tx.customerServiceIndustryNode.updateMany({
            where: { id: { in: descendantIds }, tenantId, deletedAt: null },
            data: {
              status: 'ARCHIVED',
              deletedAt: now,
              updatedById,
              revision: { increment: 1 },
            },
          })
        : { count: 0 };

      // 当前运行配置解除行业绑定；历史评测/校准/Trace 不删除，保留原始证据链。
      const merchantRoles = await tx.customerServiceMerchantRole.updateMany({
        where: { tenantId, deletedAt: null, industryNodeId: { in: nodeIds } },
        data: { industryNodeId: null, updatedById, revision: { increment: 1 } },
      });
      const accountProfiles = await tx.customerServiceAccountProfile.updateMany({
        where: { tenantId, deletedAt: null, industryNodeId: { in: nodeIds } },
        data: { industryNodeId: null, updatedById, revision: { increment: 1 } },
      });
      const tuningSessions = await tx.customerServiceTuningSession.updateMany({
        where: { tenantId, industryNodeId: { in: nodeIds }, status: 'ACTIVE' },
        data: {
          industryNodeId: null,
          stateRevision: { increment: 1 },
          stateUpdatedAt: now,
        },
      });

      return {
        deletedNodes: root.count + descendants.count,
        detachedMerchantRoles: merchantRoles.count,
        detachedAccountProfiles: accountProfiles.count,
        detachedActiveTuningSessions: tuningSessions.count,
      };
    });
  }
}
