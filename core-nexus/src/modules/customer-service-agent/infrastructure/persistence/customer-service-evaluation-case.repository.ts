import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceEvaluationCaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceEvaluationCaseWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceEvaluationCase.findMany({
      where,
      skip,
      take,
      orderBy: [{ sort: 'asc' }, { updatedAt: 'desc' }],
      include: {
        merchantRole: { select: { id: true, code: true, name: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true } },
      },
    });
  }

  count(where: Prisma.CustomerServiceEvaluationCaseWhereInput) {
    return this.prisma.customerServiceEvaluationCase.count({ where });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceEvaluationCase.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: {
        merchantRole: { select: { id: true, code: true, name: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true } },
      },
    });
  }
}
