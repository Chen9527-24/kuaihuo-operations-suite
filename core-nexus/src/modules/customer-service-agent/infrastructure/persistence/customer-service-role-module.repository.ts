import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const moduleInclude = {
  definition: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      defaultMergeMode: true,
      defaultPriority: true,
      status: true,
      sort: true,
    },
  },
} satisfies Prisma.CustomerServiceRoleModuleInstanceInclude;

@Injectable()
export class CustomerServiceRoleModuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  listDefinitions() {
    return this.prisma.customerServiceRoleModuleDefinition.findMany({
      where: { status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
    });
  }

  findDefinition(id: string) {
    return this.prisma.customerServiceRoleModuleDefinition.findFirst({ where: { id, status: 'ENABLED' } });
  }

  listInstances(merchantRoleId: string, tenantId?: string) {
    return this.prisma.customerServiceRoleModuleInstance.findMany({
      where: { merchantRoleId, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      orderBy: [{ priority: 'desc' }, { sort: 'asc' }, { createdAt: 'asc' }],
      include: moduleInclude,
    });
  }

  findInstance(id: string, merchantRoleId: string, tenantId?: string) {
    return this.prisma.customerServiceRoleModuleInstance.findFirst({
      where: { id, merchantRoleId, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: moduleInclude,
    });
  }

  create(data: Prisma.CustomerServiceRoleModuleInstanceUncheckedCreateInput) {
    return this.prisma.customerServiceRoleModuleInstance.create({ data, include: moduleInclude });
  }

  updateWithRevision(
    id: string,
    merchantRoleId: string,
    tenantId: string | undefined,
    revision: number,
    data: Prisma.CustomerServiceRoleModuleInstanceUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceRoleModuleInstance.updateMany({
      where: { id, merchantRoleId, revision, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      data: { ...data, revision: { increment: 1 } },
    });
  }
}
