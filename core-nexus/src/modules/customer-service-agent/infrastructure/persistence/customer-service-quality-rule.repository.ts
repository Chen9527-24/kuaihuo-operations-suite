import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceQualityRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceQualityRuleWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceQualityRule.findMany({
      where,
      skip,
      take,
      orderBy: [{ sort: 'asc' }, { severity: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  count(where: Prisma.CustomerServiceQualityRuleWhereInput) {
    return this.prisma.customerServiceQualityRule.count({ where });
  }

  findEnabled(tenantId: string) {
    return this.prisma.customerServiceQualityRule.findMany({
      where: { tenantId, status: 'ENABLED', deletedAt: null },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
