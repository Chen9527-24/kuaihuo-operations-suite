import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceRolePrototypeRepository } from '../../infrastructure/persistence/customer-service-role-prototype.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { parseCustomerServiceRoleSpeakerProfile } from '../../shared/role/customer-service-role-speaker-profile';
import { CreateCustomerServiceRolePrototypeDto } from './dto/create-role-prototype.dto';
import { DeleteCustomerServiceRolePrototypeDto } from './dto/delete-role-prototype.dto';
import { CustomerServiceRolePrototypeQueryDto } from './dto/role-prototype-query.dto';
import { UpdateCustomerServiceRolePrototypeDto } from './dto/update-role-prototype.dto';

@Injectable()
export class CustomerServiceRolePrototypesService {
  constructor(private readonly repository: CustomerServiceRolePrototypeRepository) {}

  async list(query: CustomerServiceRolePrototypeQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceRolePrototypeWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? { OR: [{ code: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('角色原型不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceRolePrototypeDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const speakerProfile = normalizeSpeakerProfile(dto.speakerProfile);
    try {
      return await this.repository.create({
        tenantId,
        code: normalizeCustomerServiceKey(dto.code),
        name: dto.name.trim(),
        description: normalizeText(dto.description),
        identity: normalizeText(dto.identity),
        personality: normalizeText(dto.personality),
        languageStyle: normalizeText(dto.languageStyle),
        servicePosture: normalizeText(dto.servicePosture),
        ...(speakerProfile ? { speakerProfile: speakerProfile as Prisma.InputJsonValue } : {}),
        status: dto.status ?? 'DRAFT',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同角色编码');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerServiceRolePrototypeDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    const speakerProfile = dto.speakerProfile === undefined ? undefined : normalizeSpeakerProfile(dto.speakerProfile);
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: normalizeText(dto.description) } : {}),
      ...(dto.identity !== undefined ? { identity: normalizeText(dto.identity) } : {}),
      ...(dto.personality !== undefined ? { personality: normalizeText(dto.personality) } : {}),
      ...(dto.languageStyle !== undefined ? { languageStyle: normalizeText(dto.languageStyle) } : {}),
      ...(dto.servicePosture !== undefined ? { servicePosture: normalizeText(dto.servicePosture) } : {}),
      ...(dto.speakerProfile !== undefined ? { speakerProfile: speakerProfile ? speakerProfile as Prisma.InputJsonValue : Prisma.DbNull } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('角色原型已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async remove(id: string, dto: DeleteCustomerServiceRolePrototypeDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    if (existing.revision !== dto.revision) {
      throw new ConflictException('角色原型已被其他操作更新，请刷新后重试');
    }

    const activeMerchantRoles = await this.repository.countActiveMerchantRoles(existing.id, existing.tenantId);
    if (activeMerchantRoles) {
      throw new ConflictException(`该角色模板仍被 ${activeMerchantRoles} 个使用角色引用，请先删除或更换这些使用角色`);
    }

    const result = await this.repository.softDeleteWithRevision(existing.id, existing.tenantId, dto.revision, user.id);
    if (!result.count) throw new ConflictException('角色原型已被其他操作更新，请刷新后重试');
    return { success: true };
  }
}

function normalizeText(value?: string) {
  return value?.trim() || null;
}

function normalizeSpeakerProfile(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = parseCustomerServiceRoleSpeakerProfile(value);
  if (!parsed.profile || parsed.issues.length) {
    throw new BadRequestException(`角色表达画像无效：${parsed.issues.join('；') || '无法解析 speakerProfile'}`);
  }
  return parsed.profile;
}
