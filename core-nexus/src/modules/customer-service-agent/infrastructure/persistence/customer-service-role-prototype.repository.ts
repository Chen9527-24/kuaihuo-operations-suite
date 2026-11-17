import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceRolePrototypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceRolePrototypeWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceRolePrototype.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } });
  }

  count(where: Prisma.CustomerServiceRolePrototypeWhereInput) {
    return this.prisma.customerServiceRolePrototype.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceRolePrototype.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
  }

  create(data: Prisma.CustomerServiceRolePrototypeUncheckedCreateInput) {
    return this.prisma.customerServiceRolePrototype.create({ data });
  }

  updateWithRevision(
    id: string,
    tenantId: string | undefined,
    revision: number,
    data: Prisma.CustomerServiceRolePrototypeUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceRolePrototype.updateMany({
      where: { id, revision, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  countActiveMerchantRoles(id: string, tenantId: string) {
    return this.prisma.customerServiceMerchantRole.count({
      where: { tenantId, prototypeId: id, deletedAt: null },
    });
  }

  softDeleteWithRevision(id: string, tenantId: string, revision: number, updatedById: string) {
    return this.prisma.customerServiceRolePrototype.updateMany({
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
