import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceIndustryNodeRepository } from '../../infrastructure/persistence/customer-service-industry-node.repository';
import { CustomerServiceMerchantRoleRepository } from '../../infrastructure/persistence/customer-service-merchant-role.repository';
import { CustomerServiceRolePrototypeRepository } from '../../infrastructure/persistence/customer-service-role-prototype.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { normalizeCustomerServicePublicRelation } from '../../shared/role/customer-service-public-relation';
import { CreateCustomerServiceMerchantRoleDto } from './dto/create-merchant-role.dto';
import { DeleteCustomerServiceMerchantRoleDto } from './dto/delete-merchant-role.dto';
import { CustomerServiceMerchantRoleQueryDto } from './dto/merchant-role-query.dto';
import { UpdateCustomerServiceMerchantRoleDto } from './dto/update-merchant-role.dto';
import { DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT } from '../foundation/templates/customer-service-generation-prompt.template';

@Injectable()
export class CustomerServiceMerchantRolesService {
  constructor(
    private readonly repository: CustomerServiceMerchantRoleRepository,
    private readonly prototypeRepository: CustomerServiceRolePrototypeRepository,
    private readonly industryRepository: CustomerServiceIndustryNodeRepository,
  ) {}

  async list(query: CustomerServiceMerchantRoleQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceMerchantRoleWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.prototypeId ? { prototypeId: query.prototypeId } : {}),
      ...(query.industryNodeId ? { industryNodeId: query.industryNodeId } : {}),
      ...(query.keyword
        ? { OR: [{ code: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('业务角色不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceMerchantRoleDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    await this.assertReferences(tenantId, dto.prototypeId, dto.industryNodeId);
    try {
      return await this.repository.create({
        tenantId,
        prototypeId: dto.prototypeId,
        industryNodeId: dto.industryNodeId || null,
        code: normalizeCustomerServiceKey(dto.code),
        name: dto.name.trim(),
        description: normalizeText(dto.description),
        publicIdentity: normalizeText(dto.publicIdentity),
        publicRelation: normalizePublicRelation(dto.publicRelation),
        generationPrompt: normalizePromptText(dto.generationPrompt) || DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT,
        status: dto.status ?? 'DRAFT',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同业务角色编码');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerServiceMerchantRoleDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    await this.assertReferences(
      existing.tenantId,
      dto.prototypeId ?? existing.prototypeId,
      dto.industryNodeId === undefined ? existing.industryNodeId : dto.industryNodeId,
    );
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.prototypeId !== undefined ? { prototypeId: dto.prototypeId } : {}),
      ...(dto.industryNodeId !== undefined ? { industryNodeId: dto.industryNodeId || null } : {}),
      ...(dto.description !== undefined ? { description: normalizeText(dto.description) } : {}),
      ...(dto.publicIdentity !== undefined ? { publicIdentity: normalizeText(dto.publicIdentity) } : {}),
      ...(dto.publicRelation !== undefined ? { publicRelation: normalizePublicRelation(dto.publicRelation) } : {}),
      ...(dto.generationPrompt !== undefined ? { generationPrompt: normalizePromptText(dto.generationPrompt) || DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('业务角色已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async remove(id: string, dto: DeleteCustomerServiceMerchantRoleDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    if (existing.code === 'ali') {
      throw new BadRequestException('系统推荐默认角色不能删除');
    }
    if (existing.revision !== dto.revision) {
      throw new ConflictException('业务角色已被其他操作更新，请刷新后重试');
    }

    const bindings = await this.repository.countActiveBindings(existing.id, existing.tenantId);
    if (bindings.accountProfiles) {
      throw new ConflictException(`该业务角色仍被 ${bindings.accountProfiles} 个账号使用，请先为这些账号更换角色`);
    }
    if (bindings.activeTuningSessions) {
      throw new ConflictException(`该业务角色仍被 ${bindings.activeTuningSessions} 个进行中的调优会话使用，请先结束这些会话`);
    }

    const result = await this.repository.softDeleteWithRevision(existing.id, existing.tenantId, dto.revision, user.id);
    if (!result.count) throw new ConflictException('业务角色已被其他操作更新，请刷新后重试');
    return { success: true };
  }

  private async assertReferences(tenantId: string, prototypeId: string, industryNodeId?: string | null) {
    const prototype = await this.prototypeRepository.findScoped(prototypeId, tenantId);
    if (!prototype) throw new BadRequestException('所选角色原型不存在或不属于当前租户');
    if (prototype.status === 'ARCHIVED') throw new BadRequestException('不能使用已归档的角色原型');
    if (!industryNodeId) return;
    const industry = await this.industryRepository.findScoped(industryNodeId, tenantId);
    if (!industry) throw new BadRequestException('所选行业节点不存在或不属于当前租户');
    if (industry.status === 'ARCHIVED') throw new BadRequestException('不能使用已归档的行业节点');
  }
}

function normalizeText(value?: string) {
  return value?.trim() || null;
}

function normalizePromptText(value?: string) {
  // Prompt is authored configuration and may intentionally depend on its exact
  // Unicode punctuation/spacing. Trim the transport boundary only; compatibility
  // normalization would silently mutate both system defaults and user-authored text.
  return value?.trim() || null;
}

function normalizePublicRelation(value?: string) {
  const normalized = normalizeCustomerServicePublicRelation(value, { mode: 'STRICT_WRITE' });
  if (normalized.status === 'EMPTY') return null;
  if (normalized.status === 'INVALID') throw new BadRequestException(normalized.issues[0] || '对外关系称谓无效');
  return normalized.value;
}
