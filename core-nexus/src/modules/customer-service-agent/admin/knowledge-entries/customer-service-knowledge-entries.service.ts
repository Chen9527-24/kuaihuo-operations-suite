import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerServiceContextProfileRepository } from '../../infrastructure/persistence/customer-service-context-profile.repository';
import { CustomerServiceKnowledgeEntryRepository } from '../../infrastructure/persistence/customer-service-knowledge-entry.repository';
import {
  selectCustomerServiceRuntimeKnowledge,
  selectCustomerServiceRuntimeKnowledgeDetailed,
  type CustomerServiceRuntimeKnowledgeSelectionInput,
} from '../../shared/context/customer-service-knowledge.util';
import { resolveCustomerServiceEffectiveBusinessScope } from '../../shared/context/customer-service-business-scope.util';
import {
  isCustomerServiceFixedQaEntry,
  resolveCustomerServiceFixedQa,
  type CustomerServiceFixedQaMatch,
} from '../../shared/context/customer-service-fixed-qa.util';
import {
  areCustomerServiceIndustryCodesCompatible,
  canonicalizeCustomerServiceIndustryCode,
  customerServiceIndustryFamilyCode,
} from '../../shared/context/customer-service-industry-code.util';
import {
  BatchImportCustomerServiceKnowledgeDto,
  CreateCustomerServiceKnowledgeCollectionDto,
  CreateCustomerServiceKnowledgeEntryDto,
  CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES,
  CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES,
  CUSTOMER_SERVICE_KNOWLEDGE_STATUSES,
  CustomerServiceKnowledgeEntryQueryDto,
  PreviewCustomerServiceKnowledgeDto,
  ResolveCustomerServiceFixedQaDto,
  UpdateCustomerServiceKnowledgeCollectionDto,
  UpdateCustomerServiceKnowledgeEntryDto,
  UpsertCustomerServiceKnowledgeBindingDto,
} from './dto/customer-service-knowledge-entry.dto';

@Injectable()
export class CustomerServiceKnowledgeEntriesService {
  constructor(
    private readonly repository: CustomerServiceKnowledgeEntryRepository,
    private readonly contextProfiles: CustomerServiceContextProfileRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: CustomerServiceKnowledgeEntryQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 200 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const keyword = query.keyword?.trim();
    const where: Prisma.CustomerServiceKnowledgeEntryWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.scopeKey ? { scopeKey: query.scopeKey } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(keyword ? { OR: [
        { title: { contains: keyword, mode: 'insensitive' } },
        { question: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
        { entityKey: { contains: keyword, mode: 'insensitive' } },
        { aliases: { has: keyword } },
        { tags: { has: keyword } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([this.repository.list(where, skip, take), this.repository.count(where)]);
    return { items, total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.find(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('业务知识不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceKnowledgeEntryDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const scope = await this.normalizeAndAssertScope(tenantId, dto.scopeType, dto.scopeKey, dto.collectionId);
    const window = parseWindow(dto.effectiveFrom, dto.effectiveTo);
    return this.repository.create({
      tenantId,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      collectionId: scope.collectionId,
      entityType: normalizeEntityType(dto.entityType),
      entityKey: clean(dto.entityKey),
      aliases: normalizeStringList(dto.aliases, 50),
      structuredData: toJsonInput(dto.structuredData),
      references: toJsonInput(normalizeReferences(dto.references)),
      authorityLevel: normalizeAuthorityLevel(dto.authorityLevel),
      chunkIndex: dto.chunkIndex ?? null,
      sourceFileName: clean(dto.sourceFileName),
      category: dto.category,
      title: dto.title.trim(),
      question: clean(dto.question),
      content: dto.content.trim(),
      tags: normalizeTags(dto.tags),
      sourceType: dto.sourceType || 'MANUAL',
      sourceReference: clean(dto.sourceReference),
      effectiveFrom: window.effectiveFrom,
      effectiveTo: window.effectiveTo,
      freshnessPolicy: clean(dto.freshnessPolicy),
      status: dto.status || 'DRAFT',
      createdById: user.id,
    });
  }

  async update(id: string, dto: UpdateCustomerServiceKnowledgeEntryDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    const scope = await this.normalizeAndAssertScope(
      existing.tenantId,
      dto.scopeType ?? existing.scopeType,
      dto.scopeKey?.trim() ?? existing.scopeKey,
      dto.collectionId === undefined ? existing.collectionId || undefined : dto.collectionId,
    );
    const window = parseWindow(
      dto.effectiveFrom === undefined ? existing.effectiveFrom : dto.effectiveFrom,
      dto.effectiveTo === undefined ? existing.effectiveTo : dto.effectiveTo,
    );
    const result = await this.repository.update(id, existing.tenantId, dto.revision, {
      ...(dto.scopeType !== undefined || dto.scopeKey !== undefined || dto.collectionId !== undefined
        ? { scopeType: scope.scopeType, scopeKey: scope.scopeKey, collectionId: scope.collectionId }
        : {}),
      ...(dto.entityType !== undefined ? { entityType: normalizeEntityType(dto.entityType) } : {}),
      ...(dto.entityKey !== undefined ? { entityKey: clean(dto.entityKey) } : {}),
      ...(dto.aliases !== undefined ? { aliases: normalizeStringList(dto.aliases, 50) } : {}),
      ...(dto.structuredData !== undefined ? { structuredData: toJsonInput(dto.structuredData) } : {}),
      ...(dto.references !== undefined ? { references: toJsonInput(normalizeReferences(dto.references)) } : {}),
      ...(dto.authorityLevel !== undefined ? { authorityLevel: normalizeAuthorityLevel(dto.authorityLevel) } : {}),
      ...(dto.chunkIndex !== undefined ? { chunkIndex: dto.chunkIndex } : {}),
      ...(dto.sourceFileName !== undefined ? { sourceFileName: clean(dto.sourceFileName) } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.question !== undefined ? { question: clean(dto.question) } : {}),
      ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
      ...(dto.tags !== undefined ? { tags: normalizeTags(dto.tags) } : {}),
      ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
      ...(dto.sourceReference !== undefined ? { sourceReference: clean(dto.sourceReference) } : {}),
      ...(dto.effectiveFrom !== undefined ? { effectiveFrom: window.effectiveFrom } : {}),
      ...(dto.effectiveTo !== undefined ? { effectiveTo: window.effectiveTo } : {}),
      ...(dto.freshnessPolicy !== undefined ? { freshnessPolicy: clean(dto.freshnessPolicy) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('业务知识已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async remove(id: string, revision: number, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    const result = await this.repository.update(id, existing.tenantId, revision, {
      status: 'ARCHIVED', deletedAt: new Date(), updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('业务知识已被其他操作更新，请刷新后重试');
    return { id, deleted: true };
  }

  async listCollections(user: CurrentUserPayload, tenantIdInput?: string) {
    const tenantId = resolveRequiredTenantId(user, tenantIdInput);
    return this.prisma.customerServiceKnowledgeCollection.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: { select: { entries: true, bindings: true } },
        bindings: { where: { status: 'ENABLED' }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], take: 20 },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  }

  async createCollection(dto: CreateCustomerServiceKnowledgeCollectionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const code = clean(dto.code);
    if (code) {
      const duplicated = await this.prisma.customerServiceKnowledgeCollection.findFirst({
        where: { tenantId, code, deletedAt: null }, select: { id: true },
      });
      if (duplicated) throw new ConflictException('知识库编码已存在');
    }
    const applicability = await this.normalizeAndAssertApplicability(tenantId, dto.applicability || []);
    const industryCode = await this.resolveCollectionIndustryCode(tenantId, applicability, dto.industryCode);
    const status = dto.status || 'DRAFT';
    this.assertEnabledCollectionHasApplicability(status, applicability);
    return this.prisma.$transaction(async (tx) => {
      const collection = await tx.customerServiceKnowledgeCollection.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          code,
          description: clean(dto.description),
          industryCode,
          status,
          createdById: user.id,
        },
      });
      await this.replaceCollectionApplicability(tx, tenantId, collection.id, applicability, user.id);
      return collection;
    });
  }

  async updateCollection(id: string, dto: UpdateCustomerServiceKnowledgeCollectionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const existing = await this.findCollection(id, tenantId);
    if (!existing) throw new NotFoundException('知识库不存在');
    if (dto.code !== undefined && clean(dto.code) !== existing.code) {
      const code = clean(dto.code);
      if (code) {
        const duplicated = await this.prisma.customerServiceKnowledgeCollection.findFirst({
          where: { tenantId, code, deletedAt: null, NOT: { id } }, select: { id: true },
        });
        if (duplicated) throw new ConflictException('知识库编码已存在');
      }
    }
    const applicability = dto.applicability === undefined
      ? null
      : await this.normalizeAndAssertApplicability(tenantId, dto.applicability);
    const finalStatus = dto.status ?? existing.status;
    if (finalStatus === 'ENABLED') {
      const effectiveCount = applicability
        ? applicability.filter((item) => item.status !== 'DISABLED').length
        : await this.prisma.customerServiceKnowledgeBinding.count({
            where: { tenantId, collectionId: id, status: 'ENABLED' },
          });
      if (!effectiveCount) throw new BadRequestException('已启用知识库必须至少选择一个适用对象');
    }
    const effectiveApplicability = applicability || await this.currentCollectionApplicability(tenantId, id);
    const industryCode = await this.resolveCollectionIndustryCode(
      tenantId,
      effectiveApplicability,
      dto.industryCode === undefined ? existing.industryCode : dto.industryCode,
    );
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerServiceKnowledgeCollection.updateMany({
        where: { id, tenantId, revision: dto.revision, deletedAt: null },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined ? { code: clean(dto.code) } : {}),
          ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
          ...(industryCode !== existing.industryCode ? { industryCode } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedById: user.id,
          revision: { increment: 1 },
        },
      });
      if (!updated.count) throw new ConflictException('知识库已被其他操作更新，请刷新后重试');
      if (applicability) await this.replaceCollectionApplicability(tx, tenantId, id, applicability, user.id);
    });
    return this.findCollection(id, tenantId);
  }

  async reconcileLegacyApplicability(user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const [unboundCollections, accounts] = await Promise.all([
      this.prisma.customerServiceKnowledgeCollection.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: 'ENABLED',
          bindings: { none: { status: 'ENABLED' } },
        },
        select: { id: true, industryCode: true },
        take: 200,
      }),
      this.prisma.customerServiceAccountProfile.findMany({
        where: { tenantId, deletedAt: null, status: 'ENABLED' },
        include: {
          industryNode: { select: { id: true, code: true } },
          merchantRole: { select: { id: true, industryNode: { select: { id: true, code: true } } } },
        },
        take: 1000,
      }),
    ]);
    let repaired = 0;
    const unresolved: string[] = [];
    for (const collection of unboundCollections) {
      const collectionIndustry = canonicalizeCustomerServiceIndustryCode(collection.industryCode);
      const candidates = collectionIndustry
        ? accounts.filter((account) => {
            const accountIndustry = account.industryNode?.code || account.merchantRole?.industryNode?.code || null;
            return Boolean(accountIndustry) && areCustomerServiceIndustryCodesCompatible(collectionIndustry, accountIndustry);
          })
        : accounts;
      const storeIds = uniqueStrings(candidates.map((item) => item.storeProfileId));
      const roleIds = uniqueStrings(candidates.map((item) => item.merchantRoleId));
      let target: { targetType: 'STORE' | 'ROLE' | 'ACCOUNT'; targetKey: string } | null = null;
      if (storeIds.length === 1) target = { targetType: 'STORE', targetKey: storeIds[0] };
      else if (!storeIds.length && roleIds.length === 1) target = { targetType: 'ROLE', targetKey: roleIds[0] };
      else if (!storeIds.length && roleIds.length !== 1 && candidates.length === 1) target = { targetType: 'ACCOUNT', targetKey: candidates[0].id };
      if (!target) {
        unresolved.push(collection.id);
        continue;
      }
      await this.prisma.customerServiceKnowledgeBinding.create({
        data: {
          tenantId,
          collectionId: collection.id,
          targetType: target.targetType,
          targetKey: target.targetKey,
          priority: 100,
          status: 'ENABLED',
          createdById: user.id,
        },
      });
      repaired += 1;
    }

    const collections = await this.prisma.customerServiceKnowledgeCollection.findMany({
      where: { tenantId, deletedAt: null, status: 'ENABLED' },
      include: { bindings: { where: { status: 'ENABLED' }, select: { targetType: true, targetKey: true, priority: true, status: true } } },
      take: 200,
    });
    let industryCanonicalized = 0;
    const industryConflicts: string[] = [];
    for (const collection of collections) {
      const applicability = collection.bindings.map((item) => ({
        targetType: item.targetType,
        targetKey: item.targetKey,
        priority: item.priority,
        status: item.status,
      }));
      const derived = await this.deriveApplicabilityIndustryCode(tenantId, applicability);
      const storedCanonical = canonicalizeCustomerServiceIndustryCode(collection.industryCode);
      if (derived.authoritative && derived.code && storedCanonical && !areCustomerServiceIndustryCodesCompatible(derived.code, storedCanonical)) {
        industryConflicts.push(collection.id);
        continue;
      }
      const resolvedIndustryCode = derived.authoritative ? derived.code : storedCanonical;
      if ((collection.industryCode || null) === resolvedIndustryCode) continue;
      await this.prisma.customerServiceKnowledgeCollection.update({
        where: { id: collection.id },
        data: { industryCode: resolvedIndustryCode, updatedById: user.id, revision: { increment: 1 } },
      });
      industryCanonicalized += 1;
    }
    return { scanned: unboundCollections.length, repaired, unresolved, industryCanonicalized, industryConflicts };
  }

  async listBindings(collectionId: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    await this.requireCollection(collectionId, tenantId);
    return this.prisma.customerServiceKnowledgeBinding.findMany({
      where: { tenantId, collectionId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async upsertBinding(collectionId: string, dto: UpsertCustomerServiceKnowledgeBindingDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    await this.requireCollection(collectionId, tenantId);
    const targetKey = dto.targetKey.trim();
    await this.assertBindingTarget(tenantId, dto.targetType, targetKey);
    const existing = await this.prisma.customerServiceKnowledgeBinding.findFirst({
      where: { tenantId, collectionId, targetType: dto.targetType, targetKey },
    });
    const binding = existing
      ? await this.prisma.customerServiceKnowledgeBinding.update({
          where: { id: existing.id },
          data: { priority: dto.priority ?? existing.priority, status: dto.status || existing.status },
        })
      : await this.prisma.customerServiceKnowledgeBinding.create({
          data: {
            tenantId,
            collectionId,
            targetType: dto.targetType,
            targetKey,
            priority: dto.priority ?? 100,
            status: dto.status || 'ENABLED',
            createdById: user.id,
          },
        });
    await this.syncCollectionIndustryFromCurrentBindings(tenantId, collectionId, user.id);
    return binding;
  }

  async removeBinding(bindingId: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const existing = await this.prisma.customerServiceKnowledgeBinding.findFirst({
      where: { id: bindingId, tenantId }, select: { collectionId: true },
    });
    if (!existing) throw new NotFoundException('知识绑定不存在');
    const result = await this.prisma.customerServiceKnowledgeBinding.deleteMany({ where: { id: bindingId, tenantId } });
    if (!result.count) throw new NotFoundException('知识绑定不存在');
    await this.syncCollectionIndustryFromCurrentBindings(tenantId, existing.collectionId, user.id);
    return { id: bindingId, deleted: true };
  }

  async batchImport(dto: BatchImportCustomerServiceKnowledgeDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const collection = await this.requireCollection(dto.collectionId, tenantId);
    const normalized = (dto.entries || []).slice(0, 1000).map((raw, index) => normalizeImportEntry(raw, index, dto.sourceFileName));
    if (!normalized.length) throw new BadRequestException('导入数据不能为空');
    const status = dto.status || 'ENABLED';
    const created = await this.prisma.$transaction(
      normalized.map((entry) => this.prisma.customerServiceKnowledgeEntry.create({
        data: {
          tenantId,
          collectionId: collection.id,
          scopeType: 'COLLECTION',
          scopeKey: collection.id,
          entityType: entry.entityType,
          entityKey: entry.entityKey,
          aliases: entry.aliases,
          structuredData: toJsonInput(entry.structuredData),
          references: toJsonInput(entry.references),
          authorityLevel: entry.authorityLevel,
          chunkIndex: entry.chunkIndex,
          sourceFileName: entry.sourceFileName,
          category: entry.category,
          title: entry.title,
          question: entry.question,
          content: entry.content,
          tags: entry.tags,
          sourceType: entry.sourceType,
          sourceReference: entry.sourceReference,
          freshnessPolicy: entry.freshnessPolicy,
          status,
          createdById: user.id,
        },
      })),
    );
    return { collectionId: collection.id, imported: created.length, ids: created.map((item) => item.id) };
  }

  async preview(dto: PreviewCustomerServiceKnowledgeDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const identity = await this.resolvePreviewIdentity(tenantId, dto);
    const input = {
      tenantId,
      accountProfileId: identity.accountProfileId || undefined,
      storeProfileId: identity.storeProfileId || undefined,
      merchantRoleId: identity.merchantRoleId || undefined,
      message: dto.message,
      scenario: clean(dto.scenario) || undefined,
      intent: clean(dto.intent) || undefined,
      topics: [],
      conversationState: null,
      conversationStrategy: null,
      businessScope: identity.businessScope,
    };
    const entries = await this.repository.findRuntimeCandidates({
      tenantId,
      accountProfileId: input.accountProfileId,
      storeProfileId: input.storeProfileId,
      merchantRoleId: input.merchantRoleId,
      now: new Date(),
    });
    const fixedQa = resolveCustomerServiceFixedQa(entries, dto.message);
    const result = selectCustomerServiceRuntimeKnowledgeDetailed(
      entries.filter((entry) => !isCustomerServiceFixedQaEntry(entry)),
      input,
    );
    const selected = result.selected;
    return {
      query: dto.message,
      fixedQa: fixedQa ? { matched: true, ...fixedQa } : { matched: false },
      selected,
      total: selected.length,
      evidence: selected.map((item) => ({
        id: item.id,
        title: item.title,
        entityType: item.entityType,
        entityKey: item.entityKey,
        authorityLevel: item.authorityLevel,
        selectionReason: item.selectionReason,
        relevanceScore: item.relevanceScore,
        matchEvidence: item.matchEvidence,
        references: item.references,
      })),
      diagnostics: {
        candidateCount: entries.length,
        scopeRejected: result.scopeRejected,
        budgetEvicted: result.budgetEvicted,
        effectiveBusinessScope: identity.businessScope,
      },
    };
  }

  async selectForRuntime(input: CustomerServiceRuntimeKnowledgeSelectionInput & {
    tenantId: string; accountProfileId?: string; storeProfileId?: string; merchantRoleId?: string;
  }) {
    const result = await this.selectForRuntimeDetailed(input);
    return result.selected;
  }

  async selectForRuntimeDetailed(input: CustomerServiceRuntimeKnowledgeSelectionInput & {
    tenantId: string; accountProfileId?: string; storeProfileId?: string; merchantRoleId?: string;
  }) {
    const entries = await this.repository.findRuntimeCandidates({
      tenantId: input.tenantId,
      accountProfileId: input.accountProfileId,
      storeProfileId: input.storeProfileId,
      merchantRoleId: input.merchantRoleId,
      now: new Date(),
    });
    // FIXED_QA is a deterministic direct-reply asset. A miss must continue through the
    // ordinary HVE path without leaking the configured exact answer into retrieval context.
    return selectCustomerServiceRuntimeKnowledgeDetailed(
      entries.filter((entry) => !isCustomerServiceFixedQaEntry(entry)),
      input,
    );
  }

  async resolveFixedQa(dto: ResolveCustomerServiceFixedQaDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const identity = await this.resolvePreviewIdentity(tenantId, dto);
    const match = await this.resolveFixedQaForRuntime({
      tenantId,
      accountProfileId: identity.accountProfileId || undefined,
      storeProfileId: identity.storeProfileId || undefined,
      merchantRoleId: identity.merchantRoleId || undefined,
      message: dto.message,
    });
    return match
      ? { matched: true as const, ...match }
      : { matched: false as const };
  }

  async resolveFixedQaForRuntime(input: {
    tenantId: string;
    accountProfileId?: string;
    storeProfileId?: string;
    merchantRoleId?: string;
    message: string;
  }): Promise<CustomerServiceFixedQaMatch | null> {
    const entries = await this.repository.findRuntimeCandidates({
      tenantId: input.tenantId,
      accountProfileId: input.accountProfileId,
      storeProfileId: input.storeProfileId,
      merchantRoleId: input.merchantRoleId,
      now: new Date(),
    });
    return resolveCustomerServiceFixedQa(entries, input.message);
  }

  private async normalizeAndAssertApplicability(
    tenantId: string,
    values: Array<{ targetType: string; targetKey: string; priority?: number; status?: string }>,
  ) {
    const deduped = new Map<string, { targetType: string; targetKey: string; priority: number; status: string }>();
    for (const raw of (values || []).slice(0, 300)) {
      const targetType = String(raw?.targetType || '').trim().toUpperCase();
      const targetKey = String(raw?.targetKey || '').trim();
      if (!targetKey) continue;
      if (!['ACCOUNT', 'STORE', 'ROLE'].includes(targetType)) throw new BadRequestException('不支持的知识适用对象类型');
      const priority = Math.max(0, Math.min(1000, Math.trunc(Number(raw?.priority ?? 100)) || 0));
      const status = raw?.status === 'DISABLED' ? 'DISABLED' : 'ENABLED';
      deduped.set(`${targetType}:${targetKey}`, { targetType, targetKey, priority, status });
    }
    const normalized = [...deduped.values()];
    await Promise.all(normalized.map((item) => this.assertBindingTarget(tenantId, item.targetType, item.targetKey)));
    return normalized;
  }

  private assertEnabledCollectionHasApplicability(
    status: string,
    applicability: Array<{ status: string }>,
  ) {
    if (status === 'ENABLED' && !applicability.some((item) => item.status !== 'DISABLED')) {
      throw new BadRequestException('已启用知识库必须至少选择一个适用对象');
    }
  }

  private async replaceCollectionApplicability(
    tx: Prisma.TransactionClient,
    tenantId: string,
    collectionId: string,
    applicability: Array<{ targetType: string; targetKey: string; priority: number; status: string }>,
    userId: string,
  ) {
    await tx.customerServiceKnowledgeBinding.deleteMany({ where: { tenantId, collectionId } });
    if (!applicability.length) return;
    await tx.customerServiceKnowledgeBinding.createMany({
      data: applicability.map((item) => ({
        tenantId,
        collectionId,
        targetType: item.targetType,
        targetKey: item.targetKey,
        priority: item.priority,
        status: item.status,
        createdById: userId,
      })),
    });
  }

  private async resolvePreviewIdentity(tenantId: string, dto: PreviewCustomerServiceKnowledgeDto | ResolveCustomerServiceFixedQaDto) {
    const accountProfileId = clean(dto.accountProfileId);
    const account = accountProfileId ? await this.contextProfiles.findAccount(accountProfileId, tenantId) : null;
    if (accountProfileId && (!account || account.status !== 'ENABLED')) {
      throw new BadRequestException('所选账号资料不存在、未启用或不属于当前租户');
    }
    const requestedRoleId = clean(dto.merchantRoleId);
    if (requestedRoleId && account?.merchantRoleId && requestedRoleId !== account.merchantRoleId) {
      throw new BadRequestException('所选账号资料绑定的客服身份与检索请求不一致');
    }
    const merchantRoleId = requestedRoleId || account?.merchantRoleId || null;
    if (!merchantRoleId) throw new BadRequestException('当前账号未配置客服身份，无法按正式 Runtime 口径检索知识');
    const role = await this.prisma.customerServiceMerchantRole.findFirst({
      where: { id: merchantRoleId, tenantId, deletedAt: null, status: 'ENABLED' },
      include: { industryNode: true },
    });
    if (!role) throw new BadRequestException('客服身份不存在、未启用或不属于当前租户');

    const requestedStoreId = clean(dto.storeProfileId);
    if (requestedStoreId && account?.storeProfileId && requestedStoreId !== account.storeProfileId) {
      throw new BadRequestException('所选账号资料绑定的店铺与检索请求不一致');
    }
    const storeProfileId = requestedStoreId || account?.storeProfileId || null;
    const store = storeProfileId
      ? (account?.storeProfile?.id === storeProfileId ? account.storeProfile : await this.contextProfiles.findStore(storeProfileId, tenantId))
      : null;
    if (storeProfileId && (!store || store.status !== 'ENABLED')) {
      throw new BadRequestException('店铺资料不存在、未启用或不属于当前租户');
    }

    const accountIndustry = account?.industryNode || null;
    const roleIndustry = role.industryNode || null;
    const industry = accountIndustry || roleIndustry;
    const scopeResolution = resolveCustomerServiceEffectiveBusinessScope({
      tenantId,
      merchantRoleId,
      roleIndustryNodeId: role.industryNodeId || null,
      accountProfileId: account?.id || null,
      accountMerchantRoleId: account?.merchantRoleId || null,
      accountStoreProfileId: account?.storeProfileId || null,
      accountIndustryNodeId: account?.industryNodeId || null,
      storeProfileId: store?.id || null,
      industryNodeId: industry?.id || null,
      industryCode: industry?.code || null,
    });
    if (scopeResolution.issueKeys.length) {
      throw new BadRequestException({
        code: 'BUSINESS_SCOPE_INVARIANT_FAILED',
        message: '当前账号、店铺、客服身份或行业关系不一致，请修正配置后重试',
        issueKeys: scopeResolution.issueKeys,
      });
    }
    return {
      accountProfileId: account?.id || null,
      storeProfileId: store?.id || null,
      merchantRoleId,
      businessScope: scopeResolution.scope,
    };
  }

  private async currentCollectionApplicability(tenantId: string, collectionId: string) {
    return this.prisma.customerServiceKnowledgeBinding.findMany({
      where: { tenantId, collectionId, status: 'ENABLED' },
      select: { targetType: true, targetKey: true, priority: true, status: true },
      take: 300,
    });
  }

  private async resolveCollectionIndustryCode(
    tenantId: string,
    applicability: Array<{ targetType: string; targetKey: string; priority?: number; status?: string }>,
    requestedIndustryCode: unknown,
  ) {
    const requested = canonicalizeCustomerServiceIndustryCode(requestedIndustryCode);
    const derived = await this.deriveApplicabilityIndustryCode(tenantId, applicability);
    if (derived.authoritative && derived.code && requested && !areCustomerServiceIndustryCodesCompatible(derived.code, requested)) {
      throw new BadRequestException({
        code: 'KNOWLEDGE_INDUSTRY_APPLICABILITY_CONFLICT',
        message: '知识库行业与“适用于谁”所解析的业务行业不一致，请修正适用对象；行业编码由系统统一维护，不应手工制造第二套分类。',
        requestedIndustryCode: requested,
        derivedIndustryCode: derived.code,
        evidenceIndustryCodes: derived.evidenceCodes,
      });
    }
    return derived.authoritative ? derived.code : requested;
  }

  private async deriveApplicabilityIndustryCode(
    tenantId: string,
    applicability: Array<{ targetType: string; targetKey: string; status?: string }>,
  ): Promise<{ authoritative: boolean; code: string | null; evidenceCodes: string[] }> {
    const enabled = applicability.filter((item) => item.status !== 'DISABLED');
    if (!enabled.length) return { authoritative: false, code: null, evidenceCodes: [] };
    const evidenceCodes: string[] = [];
    for (const item of enabled) {
      if (item.targetType === 'ACCOUNT') {
        const account = await this.prisma.customerServiceAccountProfile.findFirst({
          where: { id: item.targetKey, tenantId, deletedAt: null, status: 'ENABLED' },
          include: { industryNode: { select: { code: true } }, merchantRole: { select: { industryNode: { select: { code: true } } } } },
        });
        const code = canonicalizeCustomerServiceIndustryCode(account?.industryNode?.code || account?.merchantRole?.industryNode?.code);
        if (code) evidenceCodes.push(code);
        continue;
      }
      if (item.targetType === 'ROLE') {
        const role = await this.prisma.customerServiceMerchantRole.findFirst({
          where: { id: item.targetKey, tenantId, deletedAt: null, status: 'ENABLED' },
          include: { industryNode: { select: { code: true } } },
        });
        const code = canonicalizeCustomerServiceIndustryCode(role?.industryNode?.code);
        if (code) evidenceCodes.push(code);
        continue;
      }
      if (item.targetType === 'STORE') {
        const accounts = await this.prisma.customerServiceAccountProfile.findMany({
          where: { tenantId, storeProfileId: item.targetKey, deletedAt: null, status: 'ENABLED' },
          include: { industryNode: { select: { code: true } }, merchantRole: { select: { industryNode: { select: { code: true } } } } },
          take: 500,
        });
        for (const account of accounts) {
          const code = canonicalizeCustomerServiceIndustryCode(account.industryNode?.code || account.merchantRole?.industryNode?.code);
          if (code) evidenceCodes.push(code);
        }
      }
    }
    const families = uniqueStrings(evidenceCodes.map((code) => customerServiceIndustryFamilyCode(code)));
    if (!families.length) return { authoritative: false, code: null, evidenceCodes: uniqueStrings(evidenceCodes) };
    if (families.length === 1) return { authoritative: true, code: families[0], evidenceCodes: uniqueStrings(evidenceCodes) };
    // Deliberately mixed applicability is generic at industry level; explicit STORE/ROLE/ACCOUNT bindings remain authoritative.
    return { authoritative: true, code: null, evidenceCodes: uniqueStrings(evidenceCodes) };
  }

  private async syncCollectionIndustryFromCurrentBindings(tenantId: string, collectionId: string, userId: string) {
    const collection = await this.requireCollection(collectionId, tenantId);
    const applicability = await this.currentCollectionApplicability(tenantId, collectionId);
    const industryCode = await this.resolveCollectionIndustryCode(tenantId, applicability, collection.industryCode);
    if ((collection.industryCode || null) === industryCode) return;
    await this.prisma.customerServiceKnowledgeCollection.update({
      where: { id: collectionId },
      data: { industryCode, updatedById: userId, revision: { increment: 1 } },
    });
  }

  private async normalizeAndAssertScope(tenantId: string, scopeType: string, scopeKey: string, collectionId?: string) {
    const key = scopeKey.trim();
    if (scopeType === 'COLLECTION') {
      const resolvedCollectionId = (collectionId || key).trim();
      await this.requireCollection(resolvedCollectionId, tenantId);
      return { scopeType: 'COLLECTION', scopeKey: resolvedCollectionId, collectionId: resolvedCollectionId };
    }
    await this.assertScope(tenantId, scopeType, key);
    if (collectionId) await this.requireCollection(collectionId, tenantId);
    return { scopeType, scopeKey: key, collectionId: clean(collectionId) };
  }

  private async assertScope(tenantId: string, scopeType: string, scopeKey: string) {
    const key = scopeKey.trim();
    if (scopeType === 'ACCOUNT') {
      const account = await this.contextProfiles.findAccount(key, tenantId);
      if (!account) throw new BadRequestException('账号作用域不存在或不属于当前租户');
      return;
    }
    if (scopeType === 'STORE') {
      const store = await this.contextProfiles.findStore(key, tenantId);
      if (!store) throw new BadRequestException('店铺作用域不存在或不属于当前租户');
      return;
    }
    throw new BadRequestException('业务知识仅支持账号、店铺或知识库作用域');
  }

  private async assertBindingTarget(tenantId: string, targetType: string, targetKey: string) {
    if (targetType === 'ACCOUNT') {
      const account = await this.contextProfiles.findAccount(targetKey, tenantId);
      if (!account) throw new BadRequestException('绑定账号不存在或不属于当前租户');
      return;
    }
    if (targetType === 'STORE') {
      const store = await this.contextProfiles.findStore(targetKey, tenantId);
      if (!store) throw new BadRequestException('绑定店铺不存在或不属于当前租户');
      return;
    }
    if (targetType === 'ROLE') {
      const role = await this.prisma.customerServiceMerchantRole.findFirst({
        where: { id: targetKey, tenantId, deletedAt: null }, select: { id: true },
      });
      if (!role) throw new BadRequestException('绑定身份/角色不存在或不属于当前租户');
      return;
    }
    throw new BadRequestException('不支持的知识绑定目标');
  }

  private findCollection(id: string, tenantId: string) {
    return this.prisma.customerServiceKnowledgeCollection.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  private async requireCollection(id: string, tenantId: string) {
    const collection = await this.findCollection(id, tenantId);
    if (!collection) throw new NotFoundException('知识库不存在或不属于当前租户');
    return collection;
  }
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function clean(value: unknown) { const text = String(value ?? '').trim(); return text || null; }
function normalizeTags(tags?: string[]) { return normalizeStringList(tags, 30); }
function normalizeStringList(values: unknown, limit: number) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))].slice(0, limit);
}
function normalizeEntityType(value: unknown) {
  const normalized = String(value || 'GENERIC').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return (normalized || 'GENERIC').slice(0, 40);
}
function normalizeAuthorityLevel(value: unknown) {
  const normalized = String(value || 'BUSINESS_FACT').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return (normalized || 'BUSINESS_FACT').slice(0, 40);
}
function normalizeReferences(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const type = String(item.type || 'REFERENCE').trim().toUpperCase().slice(0, 40);
    const title = String(item.title || '').trim().slice(0, 200);
    const url = String(item.url || '').trim().slice(0, 2000);
    return { type, title, url, shareable: item.shareable !== false };
  }).filter((item) => Boolean(item.title || item.url));
}
function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}
function parseWindow(from: string | Date | null | undefined, to: string | Date | null | undefined) {
  const effectiveFrom = from ? new Date(from) : null;
  const effectiveTo = to ? new Date(to) : null;
  if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) throw new BadRequestException('生效时间格式不正确');
  if (effectiveTo && Number.isNaN(effectiveTo.getTime())) throw new BadRequestException('失效时间格式不正确');
  if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('失效时间必须晚于生效时间');
  return { effectiveFrom, effectiveTo };
}

function normalizeImportEntry(raw: Record<string, unknown>, index: number, fallbackFileName?: string) {
  const title = String(raw.title || raw.name || '').trim();
  const content = String(raw.content || raw.description || raw.summary || '').trim();
  if (!title) throw new BadRequestException(`导入第 ${index + 1} 条缺少 title/name`);
  if (!content) throw new BadRequestException(`导入第 ${index + 1} 条缺少 content/description/summary`);
  const rawCategory = String(raw.category || 'OTHER').trim().toUpperCase();
  const category = (CUSTOMER_SERVICE_KNOWLEDGE_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : 'OTHER';
  const rawSourceType = String(raw.sourceType || 'IMPORT').trim().toUpperCase();
  const sourceType = (CUSTOMER_SERVICE_KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(rawSourceType) ? rawSourceType : 'IMPORT';
  const rawStatus = String(raw.status || 'ENABLED').trim().toUpperCase();
  const status = (CUSTOMER_SERVICE_KNOWLEDGE_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : 'ENABLED';
  return {
    entityType: normalizeEntityType(raw.entityType),
    entityKey: clean(raw.entityKey || raw.sku || raw.productId),
    aliases: normalizeStringList(raw.aliases, 50),
    structuredData: raw.structuredData && typeof raw.structuredData === 'object' ? raw.structuredData : {},
    references: normalizeReferences(raw.references),
    authorityLevel: normalizeAuthorityLevel(raw.authorityLevel),
    chunkIndex: raw.chunkIndex === undefined || raw.chunkIndex === null || raw.chunkIndex === '' ? null : Math.max(0, Number(raw.chunkIndex) || 0),
    sourceFileName: clean(raw.sourceFileName || fallbackFileName),
    category,
    title: title.slice(0, 200),
    question: clean(raw.question),
    content: content.slice(0, 20000),
    tags: normalizeStringList(raw.tags, 30),
    sourceType,
    sourceReference: clean(raw.sourceReference),
    freshnessPolicy: clean(raw.freshnessPolicy),
    status,
  };
}
