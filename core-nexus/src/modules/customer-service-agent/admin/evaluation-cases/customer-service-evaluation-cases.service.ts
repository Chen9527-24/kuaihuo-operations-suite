import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceEvaluationCaseRepository } from '../../infrastructure/persistence/customer-service-evaluation-case.repository';
import { CustomerServiceEvaluationCaseQueryDto } from './dto/evaluation-case-query.dto';

@Injectable()
export class CustomerServiceEvaluationCasesService {
  constructor(private readonly repository: CustomerServiceEvaluationCaseRepository) {}

  async list(query: CustomerServiceEvaluationCaseQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceEvaluationCaseWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scenario ? { expectedScenario: query.scenario } : {}),
      ...(query.merchantRoleId ? { merchantRoleId: query.merchantRoleId } : {}),
      ...(query.keyword
        ? { OR: [{ key: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }, { message: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('测试案例不存在');
    return item;
  }
}
