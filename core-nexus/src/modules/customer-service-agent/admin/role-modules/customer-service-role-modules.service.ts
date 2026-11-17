import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceMerchantRoleRepository } from '../../infrastructure/persistence/customer-service-merchant-role.repository';
import { CustomerServiceRoleModuleRepository } from '../../infrastructure/persistence/customer-service-role-module.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { parseCustomerServiceRoleInteractionPosture } from '../../shared/role/customer-service-role-interaction-posture';
import { CreateCustomerServiceRoleModuleDto } from './dto/create-role-module.dto';
import { UpdateCustomerServiceRoleModuleDto } from './dto/update-role-module.dto';

@Injectable()
export class CustomerServiceRoleModulesService {
  constructor(
    private readonly repository: CustomerServiceRoleModuleRepository,
    private readonly merchantRoleRepository: CustomerServiceMerchantRoleRepository,
  ) {}

  definitions() {
    return this.repository.listDefinitions();
  }

  async list(merchantRoleId: string, user: CurrentUserPayload) {
    const role = await this.getRole(merchantRoleId, user);
    return this.repository.listInstances(role.id, role.tenantId);
  }

  async create(merchantRoleId: string, dto: CreateCustomerServiceRoleModuleDto, user: CurrentUserPayload) {
    const role = await this.getRole(merchantRoleId, user);
    const definition = await this.repository.findDefinition(dto.definitionId);
    if (!definition) throw new BadRequestException('所选模块定义不存在或已停用');
    this.assertTypedServicePosture(definition.code, dto.content, dto.mergeMode ?? definition.defaultMergeMode);
    try {
      return await this.repository.create({
        tenantId: role.tenantId,
        merchantRoleId: role.id,
        definitionId: definition.id,
        key: normalizeCustomerServiceKey(dto.key),
        name: dto.name.trim(),
        content: dto.content as Prisma.InputJsonValue,
        ...(dto.conditions !== undefined
          ? { conditions: dto.conditions === null ? Prisma.DbNull : (dto.conditions as Prisma.InputJsonValue) }
          : {}),
        mergeMode: dto.mergeMode ?? definition.defaultMergeMode,
        priority: dto.priority ?? definition.defaultPriority,
        sort: dto.sort ?? 0,
        status: dto.status ?? 'ENABLED',
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该客服角色下已存在相同模块标识');
      }
      throw error;
    }
  }

  async update(
    merchantRoleId: string,
    moduleId: string,
    dto: UpdateCustomerServiceRoleModuleDto,
    user: CurrentUserPayload,
  ) {
    const role = await this.getRole(merchantRoleId, user);
    const existing = await this.repository.findInstance(moduleId, role.id, role.tenantId);
    if (!existing) throw new NotFoundException('角色模块不存在');
    this.assertTypedServicePosture(existing.definition.code, dto.content ?? existing.content, dto.mergeMode ?? existing.mergeMode);
    const result = await this.repository.updateWithRevision(moduleId, role.id, role.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.content !== undefined ? { content: dto.content as Prisma.InputJsonValue } : {}),
      ...(dto.conditions !== undefined
        ? { conditions: dto.conditions === null ? Prisma.DbNull : (dto.conditions as Prisma.InputJsonValue) }
        : {}),
      ...(dto.mergeMode !== undefined ? { mergeMode: dto.mergeMode } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('角色模块已被其他操作更新，请刷新后重试');
    const updated = await this.repository.findInstance(moduleId, role.id, role.tenantId);
    if (!updated) throw new NotFoundException('角色模块不存在');
    return updated;
  }

  private assertTypedServicePosture(definitionCode: string, content: unknown, mergeMode: string) {
    if (definitionCode !== 'SERVICE_POSTURE') return;
    if (!content || typeof content !== 'object' || Array.isArray(content)) return;
    if ((content as Record<string, unknown>).schemaVersion !== 1) return;
    const parsed = parseCustomerServiceRoleInteractionPosture(content);
    if (!parsed.posture) {
      throw new BadRequestException(`V1.9 互动姿态配置无效：${parsed.issues.join('；') || 'typed posture 无法解析'}`);
    }
    if (mergeMode === 'APPEND') {
      throw new BadRequestException('V1.9 结构化互动姿态不支持 APPEND；请使用 STRICTER 或 OVERRIDE');
    }
  }

  private async getRole(id: string, user: CurrentUserPayload) {
    const role = await this.merchantRoleRepository.findScoped(id, resolveTenantId(user));
    if (!role) throw new NotFoundException('客服角色不存在');
    return role;
  }
}
