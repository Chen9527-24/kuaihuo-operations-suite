import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceIntentCandidateRepository } from '../../infrastructure/persistence/customer-service-intent-candidate.repository';
import { CustomerServiceIntentDefinitionsService } from '../intent-definitions/customer-service-intent-definitions.service';
import { CustomerServiceIntentCandidateQueryDto } from './dto/intent-candidate-query.dto';
import { UpdateIntentCandidateStatusDto } from './dto/update-intent-candidate-status.dto';

@Injectable()
export class CustomerServiceIntentCandidatesService {
  constructor(
    private readonly repository: CustomerServiceIntentCandidateRepository,
    private readonly intentDefinitionsService: CustomerServiceIntentDefinitionsService,
  ) {}

  async list(query: CustomerServiceIntentCandidateQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceIntentCandidateWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { suggestedCategory: query.category } : {}),
      ...(query.keyword ? {
        OR: [
          { recognitionKey: { contains: query.keyword, mode: 'insensitive' } },
          { name: { contains: query.keyword, mode: 'insensitive' } },
          { description: { contains: query.keyword, mode: 'insensitive' } },
          { suggestedScenario: { contains: query.keyword, mode: 'insensitive' } },
          { suggestedPrimaryIntent: { contains: query.keyword, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.list(where, skip, take),
      this.repository.count(where),
    ]);
    return {
      items: items.map((item: any) => ({
        ...item,
        averageConfidence: item.occurrenceCount > 0
          ? Number((item.confidenceSum / item.occurrenceCount).toFixed(4))
          : item.latestConfidence,
      })),
      total,
      page,
      pageSize,
    };
  }

  async convert(id: string, user: CurrentUserPayload) {
    return this.intentDefinitionsService.createFromCandidate(id, user);
  }

  async updateStatus(id: string, dto: UpdateIntentCandidateStatusDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const item = await this.repository.findScoped(id, tenantId);
    if (!item) throw new NotFoundException('已识别意图不存在');
    await this.repository.setStatus(id, tenantId, dto.status);
    return this.repository.findScoped(id, tenantId);
  }
}
