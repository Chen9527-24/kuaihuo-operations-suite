import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceKnowledgeEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceKnowledgeEntryWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceKnowledgeEntry.findMany({
      where, skip, take,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }
  count(where: Prisma.CustomerServiceKnowledgeEntryWhereInput) {
    return this.prisma.customerServiceKnowledgeEntry.count({ where });
  }
  find(id: string, tenantId?: string) {
    return this.prisma.customerServiceKnowledgeEntry.findFirst({ where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) } });
  }
  create(data: Prisma.CustomerServiceKnowledgeEntryUncheckedCreateInput) {
    return this.prisma.customerServiceKnowledgeEntry.create({ data });
  }
  update(id: string, tenantId: string, revision: number, data: Prisma.CustomerServiceKnowledgeEntryUncheckedUpdateManyInput) {
    return this.prisma.customerServiceKnowledgeEntry.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }
  async findRuntimeCandidates(input: {
    tenantId: string;
    accountProfileId?: string;
    storeProfileId?: string;
    merchantRoleId?: string;
    now: Date;
  }) {
    const directScopes: Prisma.CustomerServiceKnowledgeEntryWhereInput[] = [];
    if (input.accountProfileId) directScopes.push({ scopeType: 'ACCOUNT', scopeKey: input.accountProfileId });
    if (input.storeProfileId) directScopes.push({ scopeType: 'STORE', scopeKey: input.storeProfileId });

    const bindingTargets: Prisma.CustomerServiceKnowledgeBindingWhereInput[] = [];
    if (input.accountProfileId) bindingTargets.push({ targetType: 'ACCOUNT', targetKey: input.accountProfileId });
    if (input.storeProfileId) bindingTargets.push({ targetType: 'STORE', targetKey: input.storeProfileId });
    if (input.merchantRoleId) bindingTargets.push({ targetType: 'ROLE', targetKey: input.merchantRoleId });

    const bindings = bindingTargets.length
      ? await this.prisma.customerServiceKnowledgeBinding.findMany({
          where: {
            tenantId: input.tenantId,
            status: 'ENABLED',
            OR: bindingTargets,
            collection: { deletedAt: null, status: 'ENABLED' },
          },
          select: { collectionId: true, priority: true, targetType: true, targetKey: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: 100,
        })
      : [];

    const bindingPriority = new Map<string, number>();
    const bindingTarget = new Map<string, { targetType: string; targetKey: string; priority: number }>();
    for (const binding of bindings) {
      const previous = bindingPriority.get(binding.collectionId) || 0;
      if (!bindingTarget.has(binding.collectionId) || binding.priority > previous) {
        bindingTarget.set(binding.collectionId, {
          targetType: binding.targetType,
          targetKey: binding.targetKey,
          priority: binding.priority,
        });
      }
      bindingPriority.set(binding.collectionId, Math.max(previous, binding.priority));
    }
    const collectionIds = [...bindingPriority.keys()];
    const scopes: Prisma.CustomerServiceKnowledgeEntryWhereInput[] = [
      ...directScopes,
      ...(collectionIds.length ? [{ scopeType: 'COLLECTION', collectionId: { in: collectionIds } }] : []),
    ];
    if (!scopes.length) return [];

    const entries = await this.prisma.customerServiceKnowledgeEntry.findMany({
      where: {
        tenantId: input.tenantId,
        deletedAt: null,
        status: 'ENABLED',
        OR: scopes,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: input.now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.now } }] },
          { OR: [{ collectionId: null }, { collection: { deletedAt: null, status: 'ENABLED' } }] },
        ],
      },
      include: {
        collection: { select: { id: true, name: true, industryCode: true, revision: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
    });
    return entries.map((entry) => {
      const target = entry.collectionId ? bindingTarget.get(entry.collectionId) : null;
      return {
        ...entry,
        bindingPriority: entry.collectionId ? bindingPriority.get(entry.collectionId) || 0 : 0,
        bindingTargetType: target?.targetType || null,
        bindingTargetKey: target?.targetKey || null,
      };
    });
  }
}
