import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceResponseRuleRepository } from '../../infrastructure/persistence/customer-service-response-rule.repository';
import { CustomerServiceConditionMatcher } from '../../shared/conditions/customer-service-condition-matcher.service';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { CreateCustomerServiceResponseRuleDto } from './dto/create-response-rule.dto';
import { CustomerServiceResponseRuleQueryDto } from './dto/response-rule-query.dto';
import { UpdateCustomerServiceResponseRuleDto } from './dto/update-response-rule.dto';

@Injectable()
export class CustomerServiceResponseRulesService {
  constructor(
    private readonly repository: CustomerServiceResponseRuleRepository,
    private readonly conditionMatcher: CustomerServiceConditionMatcher,
  ) {}

  async list(query: CustomerServiceResponseRuleQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceResponseRuleWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? { OR: [{ key: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('回复规则不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceResponseRuleDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    await this.assertAsset(dto.responseAssetId, tenantId);
    this.assertConditions(dto.conditions, '生效条件');
    if (dto.exclusions) this.assertConditions(dto.exclusions, '排除条件');
    try {
      return await this.repository.create({
        tenantId,
        responseAssetId: dto.responseAssetId,
        key: normalizeCustomerServiceKey(dto.key),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        conditions: dto.conditions as Prisma.InputJsonValue,
        ...(dto.exclusions ? { exclusions: dto.exclusions as Prisma.InputJsonValue } : {}),
        priority: dto.priority ?? 100,
        sort: dto.sort ?? 0,
        exclusive: dto.exclusive ?? false,
        status: dto.status ?? 'ENABLED',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同回复规则编码');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerServiceResponseRuleDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    if (dto.responseAssetId) await this.assertAsset(dto.responseAssetId, existing.tenantId);
    if (dto.conditions) this.assertConditions(dto.conditions, '生效条件');
    if (dto.exclusions) this.assertConditions(dto.exclusions, '排除条件');
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.responseAssetId !== undefined ? { responseAssetId: dto.responseAssetId } : {}),
      ...(dto.conditions !== undefined ? { conditions: dto.conditions as Prisma.InputJsonValue } : {}),
      ...(dto.exclusions !== undefined ? { exclusions: dto.exclusions as Prisma.InputJsonValue } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.exclusive !== undefined ? { exclusive: dto.exclusive } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('回复规则已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  private async assertAsset(assetId: string, tenantId: string) {
    if (!(await this.repository.findPublishedDeterministicAsset(assetId, tenantId))) {
      throw new UnprocessableEntityException('回复规则只能绑定当前租户已发布的确定性响应资产');
    }
  }

  private assertConditions(value: Record<string, unknown>, label: string) {
    const result = this.conditionMatcher.matches(value, { riskLevel: 'LOW' });
    if (result.invalidReason) throw new UnprocessableEntityException(`${label}${result.invalidReason}`);
  }
}
