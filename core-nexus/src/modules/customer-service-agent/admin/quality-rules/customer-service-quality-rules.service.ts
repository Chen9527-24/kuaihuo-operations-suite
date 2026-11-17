import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceQualityRuleRepository } from '../../infrastructure/persistence/customer-service-quality-rule.repository';
import { CustomerServiceQualityRuleQueryDto } from './dto/quality-rule-query.dto';

@Injectable()
export class CustomerServiceQualityRulesService {
  constructor(private readonly repository: CustomerServiceQualityRuleRepository) {}

  async list(query: CustomerServiceQualityRuleQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceQualityRuleWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.keyword
        ? { OR: [{ key: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }
}
