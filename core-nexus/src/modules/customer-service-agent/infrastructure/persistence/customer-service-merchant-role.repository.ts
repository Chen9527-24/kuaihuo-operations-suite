import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const merchantRoleInclude = {
  prototype: { select: { id: true, code: true, name: true, status: true, revision: true } },
  industryNode: { select: { id: true, code: true, name: true, nodeType: true, path: true, status: true, revision: true } },
  _count: { select: { modules: { where: { deletedAt: null } } } },
} satisfies Prisma.CustomerServiceMerchantRoleInclude;

@Injectable()
export class CustomerServiceMerchantRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceMerchantRoleWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceMerchantRole.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      include: merchantRoleInclude,
    });
  }

  count(where: Prisma.CustomerServiceMerchantRoleWhereInput) {
    return this.prisma.customerServiceMerchantRole.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceMerchantRole.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: merchantRoleInclude,
    });
  }

  create(data: Prisma.CustomerServiceMerchantRoleUncheckedCreateInput) {
    return this.prisma.customerServiceMerchantRole.create({ data, include: merchantRoleInclude });
  }

  updateWithRevision(
    id: string,
    tenantId: string | undefined,
    revision: number,
    data: Prisma.CustomerServiceMerchantRoleUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceMerchantRole.updateMany({
      where: { id, revision, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  async countActiveBindings(id: string, tenantId: string) {
    const [accountProfiles, activeTuningSessions] = await Promise.all([
      this.prisma.customerServiceAccountProfile.count({
        where: { tenantId, merchantRoleId: id, deletedAt: null },
      }),
      this.prisma.customerServiceTuningSession.count({
        where: { tenantId, merchantRoleId: id, status: 'ACTIVE' },
      }),
    ]);
    return { accountProfiles, activeTuningSessions };
  }

  softDeleteWithRevision(id: string, tenantId: string, revision: number, updatedById: string) {
    return this.prisma.customerServiceMerchantRole.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
        updatedById,
        revision: { increment: 1 },
      },
    });
  }
}
