import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceContextProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  listStores(where: Prisma.CustomerServiceStoreProfileWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceStoreProfile.findMany({
      where, skip, take,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { accounts: true } } },
    });
  }

  countStores(where: Prisma.CustomerServiceStoreProfileWhereInput) {
    return this.prisma.customerServiceStoreProfile.count({ where });
  }

  findStore(id: string, tenantId?: string) {
    return this.prisma.customerServiceStoreProfile.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: { _count: { select: { accounts: true } } },
    });
  }

  createStore(data: Prisma.CustomerServiceStoreProfileUncheckedCreateInput) {
    return this.prisma.customerServiceStoreProfile.create({ data });
  }

  updateStore(id: string, tenantId: string, revision: number, data: Prisma.CustomerServiceStoreProfileUncheckedUpdateManyInput) {
    return this.prisma.customerServiceStoreProfile.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  listAccounts(where: Prisma.CustomerServiceAccountProfileWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceAccountProfile.findMany({
      where, skip, take,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: {
        storeProfile: { select: { id: true, code: true, name: true, status: true, revision: true } },
        merchantRole: { select: { id: true, code: true, name: true, status: true, revision: true } },
        industryNode: { select: { id: true, code: true, name: true, path: true, status: true, revision: true } },
      },
    });
  }

  countAccounts(where: Prisma.CustomerServiceAccountProfileWhereInput) {
    return this.prisma.customerServiceAccountProfile.count({ where });
  }

  findAccount(id: string, tenantId?: string) {
    return this.prisma.customerServiceAccountProfile.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: {
        storeProfile: true,
        merchantRole: { include: { prototype: true } },
        industryNode: true,
      },
    });
  }

  createAccount(data: Prisma.CustomerServiceAccountProfileUncheckedCreateInput) {
    return this.prisma.customerServiceAccountProfile.create({ data });
  }

  updateAccount(id: string, tenantId: string, revision: number, data: Prisma.CustomerServiceAccountProfileUncheckedUpdateManyInput) {
    return this.prisma.customerServiceAccountProfile.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  listPolicies(where: Prisma.CustomerServiceLanguagePolicyWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceLanguagePolicy.findMany({
      where, skip, take,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  countPolicies(where: Prisma.CustomerServiceLanguagePolicyWhereInput) {
    return this.prisma.customerServiceLanguagePolicy.count({ where });
  }

  findPolicy(id: string, tenantId?: string) {
    return this.prisma.customerServiceLanguagePolicy.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
  }

  createPolicy(data: Prisma.CustomerServiceLanguagePolicyUncheckedCreateInput) {
    return this.prisma.customerServiceLanguagePolicy.create({ data });
  }

  updatePolicy(id: string, tenantId: string, revision: number, data: Prisma.CustomerServiceLanguagePolicyUncheckedUpdateManyInput) {
    return this.prisma.customerServiceLanguagePolicy.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }

  listEnabledPolicies(tenantId: string) {
    return this.prisma.customerServiceLanguagePolicy.findMany({
      where: { tenantId, status: 'ENABLED', deletedAt: null },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }
}
