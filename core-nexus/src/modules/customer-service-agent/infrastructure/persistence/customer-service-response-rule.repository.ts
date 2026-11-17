import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CUSTOMER_SERVICE_DETERMINISTIC_ASSET_TYPES } from '../../shared/constants/customer-service-foundation.constant';

@Injectable()
export class CustomerServiceResponseRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceResponseRuleWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceResponseRule.findMany({
      where,
      skip,
      take,
      orderBy: [{ priority: 'desc' }, { sort: 'asc' }, { updatedAt: 'desc' }],
      include: { responseAsset: true },
    });
  }

  count(where: Prisma.CustomerServiceResponseRuleWhereInput) {
    return this.prisma.customerServiceResponseRule.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceResponseRule.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: { responseAsset: true },
    });
  }

  findPublishedDeterministicAsset(id: string, tenantId: string) {
    return this.prisma.customerServiceAsset.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        status: 'PUBLISHED',
        currentVersionId: { not: null },
        assetType: { in: [...CUSTOMER_SERVICE_DETERMINISTIC_ASSET_TYPES] },
      },
    });
  }

  create(data: Prisma.CustomerServiceResponseRuleUncheckedCreateInput) {
    return this.prisma.customerServiceResponseRule.create({ data, include: { responseAsset: true } });
  }

  updateWithRevision(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceResponseRuleUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceResponseRule.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }
}
