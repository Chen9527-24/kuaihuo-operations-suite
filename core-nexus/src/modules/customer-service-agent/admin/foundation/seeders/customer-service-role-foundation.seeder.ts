import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FOUNDATION_INDUSTRY_NODES,
  FOUNDATION_MERCHANT_ROLES,
  FOUNDATION_ROLE_MODULES,
  FOUNDATION_ROLE_PROTOTYPES,
} from '../templates/customer-service-foundation.template';
import {
  CustomerServiceEntitySeedMap,
  CustomerServiceFoundationTx,
  CustomerServiceIndustrySeedMap,
} from '../types/foundation-seed.type';
import { CustomerServiceFoundationResult } from '../types/foundation-result.type';

@Injectable()
export class CustomerServiceRoleFoundationSeeder {
  async seed(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
    definitions: Map<string, { id: string }>,
  ) {
    const industries = await this.ensureIndustries(tx, tenantId, userId, result);
    const prototypes = await this.ensurePrototypes(tx, tenantId, userId, result);
    const roles = await this.ensureMerchantRoles(tx, tenantId, userId, result, industries, prototypes);
    await this.ensureRoleModules(tx, tenantId, userId, result, roles, definitions);
    return { industries, roles };
  }

  private async ensureIndustries(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
  ): Promise<CustomerServiceIndustrySeedMap> {
    const map: CustomerServiceIndustrySeedMap = new Map();
    for (const item of FOUNDATION_INDUSTRY_NODES) {
      const existing = await tx.customerServiceIndustryNode.findFirst({
        where: { tenantId, code: item.code, deletedAt: null },
      });
      if (existing) {
        result.existing.industryNodes += 1;
        map.set(item.code, existing);
        continue;
      }
      const parent = item.parentCode ? map.get(item.parentCode) : undefined;
      const created = await tx.customerServiceIndustryNode.create({
        data: {
          tenantId,
          parentId: parent?.id,
          code: item.code,
          name: item.name,
          nodeType: item.nodeType,
          level: parent ? parent.level + 1 : 1,
          path: parent ? `${parent.path} / ${item.name}` : item.name,
          description: item.description,
          sort: item.sort,
          status: 'ENABLED',
          createdById: userId,
        },
      });
      result.created.industryNodes += 1;
      map.set(item.code, created);
    }
    return map;
  }

  private async ensurePrototypes(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
  ): Promise<CustomerServiceEntitySeedMap> {
    const map: CustomerServiceEntitySeedMap = new Map();
    for (const item of FOUNDATION_ROLE_PROTOTYPES) {
      const existing = await tx.customerServiceRolePrototype.findUnique({
        where: { tenantId_code: { tenantId, code: item.code } },
      });
      if (existing) {
        result.existing.rolePrototypes += 1;
        map.set(item.code, existing);
        continue;
      }
      const created = await tx.customerServiceRolePrototype.create({
        data: { tenantId, ...item, status: 'ENABLED', createdById: userId },
      });
      result.created.rolePrototypes += 1;
      map.set(item.code, created);
    }
    return map;
  }

  private async ensureMerchantRoles(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
    industries: CustomerServiceIndustrySeedMap,
    prototypes: CustomerServiceEntitySeedMap,
  ): Promise<CustomerServiceEntitySeedMap> {
    const map: CustomerServiceEntitySeedMap = new Map();
    for (const item of FOUNDATION_MERCHANT_ROLES) {
      const existing = await tx.customerServiceMerchantRole.findUnique({
        where: { tenantId_code: { tenantId, code: item.code } },
      });
      if (existing) {
        result.existing.merchantRoles += 1;
        map.set(item.code, existing);
        continue;
      }
      const prototype = prototypes.get(item.prototypeCode);
      if (!prototype) throw new UnprocessableEntityException(`初始化角色 ${item.name} 时找不到角色原型。`);
      const created = await tx.customerServiceMerchantRole.create({
        data: {
          tenantId,
          prototypeId: prototype.id,
          industryNodeId: item.industryCode ? industries.get(item.industryCode)?.id : null,
          code: item.code,
          name: item.name,
          publicIdentity: item.publicIdentity,
          publicRelation: item.publicRelation,
          description: item.description,
          status: 'ENABLED',
          createdById: userId,
        },
      });
      result.created.merchantRoles += 1;
      map.set(item.code, created);
    }
    return map;
  }

  private async ensureRoleModules(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
    roles: CustomerServiceEntitySeedMap,
    definitions: CustomerServiceEntitySeedMap,
  ) {
    for (const item of FOUNDATION_ROLE_MODULES) {
      const role = roles.get(item.roleCode);
      const definition = definitions.get(item.definitionCode);
      if (!role || !definition) continue;
      const existing = await tx.customerServiceRoleModuleInstance.findUnique({
        where: { merchantRoleId_key: { merchantRoleId: role.id, key: item.key } },
      });
      if (existing) {
        result.existing.roleModules += 1;
        continue;
      }
      await tx.customerServiceRoleModuleInstance.create({
        data: {
          tenantId,
          merchantRoleId: role.id,
          definitionId: definition.id,
          key: item.key,
          name: item.name,
          content: item.content as Prisma.InputJsonValue,
          conditions: 'conditions' in item && item.conditions ? item.conditions as Prisma.InputJsonValue : undefined,
          mergeMode: 'mergeMode' in item ? item.mergeMode : 'APPEND',
          priority: item.priority,
          status: 'ENABLED',
          createdById: userId,
        },
      });
      result.created.roleModules += 1;
    }
  }
}
