import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceContextProfileRepository } from '../../infrastructure/persistence/customer-service-context-profile.repository';
import { CustomerServiceIndustryNodeRepository } from '../../infrastructure/persistence/customer-service-industry-node.repository';
import { CustomerServiceMerchantRoleRepository } from '../../infrastructure/persistence/customer-service-merchant-role.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import {
  CreateCustomerServiceAccountProfileDto,
  CreateCustomerServiceLanguagePolicyDto,
  CreateCustomerServiceStoreProfileDto,
  CustomerServiceAccountProfileQueryDto,
  CustomerServiceContextProfileQueryDto,
  CustomerServiceLanguagePolicyQueryDto,
  UpdateCustomerServiceAccountProfileDto,
  UpdateCustomerServiceLanguagePolicyDto,
  UpdateCustomerServiceStoreProfileDto,
} from './dto/customer-service-context-profile.dto';

const MAX_CONTEXT_JSON_BYTES = 128_000;
const LANGUAGE_RULE_TYPES = new Set([
  'FORBIDDEN_WORD', 'FORBIDDEN_PHRASE', 'FORBIDDEN_SYMBOL', 'ENDING_SYMBOL',
  'STARTING_TEXT', 'REGEX', 'AUTO_REPLACE', 'MAX_SENTENCES', 'MAX_CHARACTERS',
  'MAX_PARAGRAPHS', 'MAX_QUESTIONS', 'EMOJI_POLICY', 'STYLE_GUIDANCE',
]);
const LANGUAGE_RULE_ACTIONS = new Set(['PROMPT_ONLY', 'REMOVE', 'REPLACE', 'MODEL_REWRITE', 'BLOCK', 'WARN']);
const LANGUAGE_RULE_POSITIONS = new Set(['ANYWHERE', 'START', 'END']);

@Injectable()
export class CustomerServiceContextProfilesService {
  constructor(
    private readonly repository: CustomerServiceContextProfileRepository,
    private readonly roleRepository: CustomerServiceMerchantRoleRepository,
    private readonly industryRepository: CustomerServiceIndustryNodeRepository,
  ) {}

  async listStores(query: CustomerServiceContextProfileQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 200 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceStoreProfileWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? {
        OR: [
          { code: { contains: query.keyword, mode: 'insensitive' } },
          { name: { contains: query.keyword, mode: 'insensitive' } },
          { description: { contains: query.keyword, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.listStores(where, skip, take),
      this.repository.countStores(where),
    ]);
    return { items, total, page, pageSize };
  }

  async getStore(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findStore(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('店铺背景不存在');
    return item;
  }

  async createStore(dto: CreateCustomerServiceStoreProfileDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    assertJsonBudget(dto.profile, '店铺背景');
    try {
      return await this.repository.createStore({
        tenantId,
        code: normalizeCustomerServiceKey(dto.code),
        name: dto.name.trim(),
        description: normalizeText(dto.description),
        profile: dto.profile as Prisma.InputJsonValue,
        status: dto.status ?? 'DRAFT',
        createdById: user.id,
      });
    } catch (error) {
      throwFriendlyUnique(error, '当前租户下已存在相同店铺背景编码');
    }
  }

  async updateStore(id: string, dto: UpdateCustomerServiceStoreProfileDto, user: CurrentUserPayload) {
    const existing = await this.getStore(id, user);
    if (dto.profile) assertJsonBudget(dto.profile, '店铺背景');
    const result = await this.repository.updateStore(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: normalizeText(dto.description) } : {}),
      ...(dto.profile !== undefined ? { profile: dto.profile as Prisma.InputJsonValue } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('店铺背景已被其他操作更新，请刷新后重试');
    return this.getStore(id, user);
  }

  async listAccounts(query: CustomerServiceAccountProfileQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 200 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceAccountProfileWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.storeProfileId ? { storeProfileId: query.storeProfileId } : {}),
      ...(query.merchantRoleId ? { merchantRoleId: query.merchantRoleId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.keyword ? {
        OR: [
          { code: { contains: query.keyword, mode: 'insensitive' } },
          { name: { contains: query.keyword, mode: 'insensitive' } },
          { description: { contains: query.keyword, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.listAccounts(where, skip, take),
      this.repository.countAccounts(where),
    ]);
    return { items, total, page, pageSize };
  }

  async getAccount(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findAccount(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('账号背景不存在');
    return item;
  }

  async createAccount(dto: CreateCustomerServiceAccountProfileDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    assertJsonBudget(dto.profile, '账号背景');
    await this.assertAccountReferences(tenantId, dto);
    try {
      return await this.repository.createAccount({
        tenantId,
        code: normalizeCustomerServiceKey(dto.code),
        name: dto.name.trim(),
        storeProfileId: dto.storeProfileId || null,
        merchantRoleId: dto.merchantRoleId || null,
        industryNodeId: dto.industryNodeId || null,
        channel: dto.channel ?? 'OTHER',
        description: normalizeText(dto.description),
        profile: dto.profile as Prisma.InputJsonValue,
        status: dto.status ?? 'DRAFT',
        createdById: user.id,
      });
    } catch (error) {
      throwFriendlyUnique(error, '当前租户下已存在相同账号背景编码');
    }
  }

  async updateAccount(id: string, dto: UpdateCustomerServiceAccountProfileDto, user: CurrentUserPayload) {
    const existing = await this.getAccount(id, user);
    if (dto.profile) assertJsonBudget(dto.profile, '账号背景');
    await this.assertAccountReferences(existing.tenantId, {
      storeProfileId: dto.storeProfileId === undefined ? existing.storeProfileId || undefined : dto.storeProfileId,
      merchantRoleId: dto.merchantRoleId === undefined ? existing.merchantRoleId || undefined : dto.merchantRoleId,
      industryNodeId: dto.industryNodeId === undefined ? existing.industryNodeId || undefined : dto.industryNodeId,
    });
    const result = await this.repository.updateAccount(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.storeProfileId !== undefined ? { storeProfileId: dto.storeProfileId || null } : {}),
      ...(dto.merchantRoleId !== undefined ? { merchantRoleId: dto.merchantRoleId || null } : {}),
      ...(dto.industryNodeId !== undefined ? { industryNodeId: dto.industryNodeId || null } : {}),
      ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
      ...(dto.description !== undefined ? { description: normalizeText(dto.description) } : {}),
      ...(dto.profile !== undefined ? { profile: dto.profile as Prisma.InputJsonValue } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('账号背景已被其他操作更新，请刷新后重试');
    return this.getAccount(id, user);
  }

  async listPolicies(query: CustomerServiceLanguagePolicyQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 200 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceLanguagePolicyWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.scopeKey ? { scopeKey: query.scopeKey } : {}),
      ...(query.keyword ? {
        OR: [
          { code: { contains: query.keyword, mode: 'insensitive' } },
          { name: { contains: query.keyword, mode: 'insensitive' } },
          { description: { contains: query.keyword, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.listPolicies(where, skip, take),
      this.repository.countPolicies(where),
    ]);
    return { items, total, page, pageSize };
  }

  async getPolicy(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findPolicy(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('语言规则集不存在');
    return item;
  }

  async createPolicy(dto: CreateCustomerServiceLanguagePolicyDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const rules = normalizeLanguageRules(dto.rules);
    assertJsonBudget({ rules, styleGuidance: dto.styleGuidance }, '语言规则');
    await this.assertPolicyScope(tenantId, dto.scopeType, dto.scopeKey);
    try {
      return await this.repository.createPolicy({
        tenantId,
        code: normalizeCustomerServiceKey(dto.code),
        name: dto.name.trim(),
        description: normalizeText(dto.description),
        scopeType: dto.scopeType,
        scopeKey: normalizeScopeKey(dto.scopeType, dto.scopeKey),
        priority: dto.priority ?? 100,
        rules: rules as unknown as Prisma.InputJsonValue,
        styleGuidance: dto.styleGuidance ? dto.styleGuidance as Prisma.InputJsonValue : Prisma.JsonNull,
        status: dto.status ?? 'DRAFT',
        createdById: user.id,
      });
    } catch (error) {
      throwFriendlyUnique(error, '当前租户下已存在相同语言规则编码');
    }
  }

  async updatePolicy(id: string, dto: UpdateCustomerServiceLanguagePolicyDto, user: CurrentUserPayload) {
    const existing = await this.getPolicy(id, user);
    const scopeType = dto.scopeType ?? existing.scopeType;
    const scopeKey = dto.scopeKey ?? existing.scopeKey;
    await this.assertPolicyScope(existing.tenantId, scopeType, scopeKey);
    const rules = dto.rules ? normalizeLanguageRules(dto.rules) : undefined;
    if (rules || dto.styleGuidance) assertJsonBudget({ rules, styleGuidance: dto.styleGuidance }, '语言规则');
    const result = await this.repository.updatePolicy(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: normalizeText(dto.description) } : {}),
      ...(dto.scopeType !== undefined || dto.scopeKey !== undefined
        ? { scopeType, scopeKey: normalizeScopeKey(scopeType, scopeKey) } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(rules !== undefined ? { rules: rules as unknown as Prisma.InputJsonValue } : {}),
      ...(dto.styleGuidance !== undefined
        ? { styleGuidance: dto.styleGuidance as Prisma.InputJsonValue } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('语言规则集已被其他操作更新，请刷新后重试');
    return this.getPolicy(id, user);
  }

  private async assertAccountReferences(tenantId: string, refs: {
    storeProfileId?: string; merchantRoleId?: string; industryNodeId?: string;
  }) {
    if (refs.storeProfileId) {
      const store = await this.repository.findStore(refs.storeProfileId, tenantId);
      if (!store || store.status === 'ARCHIVED') throw new BadRequestException('所选店铺背景不存在或已归档');
    }
    if (refs.merchantRoleId) {
      const role = await this.roleRepository.findScoped(refs.merchantRoleId, tenantId);
      if (!role || role.status === 'ARCHIVED') throw new BadRequestException('所选客服角色不存在或已归档');
    }
    if (refs.industryNodeId) {
      const industry = await this.industryRepository.findScoped(refs.industryNodeId, tenantId);
      if (!industry || industry.status === 'ARCHIVED') throw new BadRequestException('所选行业节点不存在或已归档');
    }
  }

  private async assertPolicyScope(tenantId: string, scopeType: string, scopeKey: string) {
    if (scopeType === 'GLOBAL') return;
    const key = scopeKey.trim();
    if (!key) throw new BadRequestException('非全局语言规则必须指定作用对象');
    if (scopeType === 'STORE' && !(await this.repository.findStore(key, tenantId))) {
      throw new BadRequestException('语言规则绑定的店铺背景不存在');
    }
    if (scopeType === 'ACCOUNT' && !(await this.repository.findAccount(key, tenantId))) {
      throw new BadRequestException('语言规则绑定的账号背景不存在');
    }
    if (scopeType === 'ROLE' && !(await this.roleRepository.findScoped(key, tenantId))) {
      throw new BadRequestException('语言规则绑定的客服角色不存在');
    }
  }
}

function normalizeLanguageRules(input: Record<string, unknown>[]) {
  if (input.length > 500) throw new BadRequestException('单个语言规则集最多包含 500 条规则');
  return input.map((source, index) => {
    const type = String(source.type || '').trim().toUpperCase();
    const action = String(source.action || 'PROMPT_ONLY').trim().toUpperCase();
    const position = String(source.position || 'ANYWHERE').trim().toUpperCase();
    if (!LANGUAGE_RULE_TYPES.has(type)) throw new BadRequestException(`第 ${index + 1} 条语言规则类型无效`);
    if (!LANGUAGE_RULE_ACTIONS.has(action)) throw new BadRequestException(`第 ${index + 1} 条语言规则处理方式无效`);
    if (!LANGUAGE_RULE_POSITIONS.has(position)) throw new BadRequestException(`第 ${index + 1} 条语言规则生效位置无效`);
    const pattern = String(source.pattern ?? source.value ?? '').trim();
    if (!pattern && !type.startsWith('MAX_') && type !== 'EMOJI_POLICY' && type !== 'STYLE_GUIDANCE') {
      throw new BadRequestException(`第 ${index + 1} 条语言规则缺少匹配内容`);
    }
    return {
      id: String(source.id || `rule-${index + 1}`).slice(0, 120),
      name: String(source.name || pattern || type).trim().slice(0, 160),
      type,
      pattern,
      position,
      action,
      severity: String(source.severity || 'HARD').trim().toUpperCase() === 'SOFT' ? 'SOFT' : 'HARD',
      replacement: source.replacement === undefined ? null : String(source.replacement),
      enabled: source.enabled !== false,
      exceptions: Array.isArray(source.exceptions)
        ? source.exceptions.map((item) => String(item).trim()).filter(Boolean).slice(0, 50)
        : [],
      limit: Number.isFinite(Number(source.limit)) ? Math.max(0, Math.trunc(Number(source.limit))) : null,
      description: String(source.description || '').trim().slice(0, 1000) || null,
    };
  });
}

function normalizeScopeKey(scopeType: string, value: string) {
  return scopeType === 'GLOBAL' ? '*' : value.trim();
}

function assertJsonBudget(value: unknown, label: string) {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  if (bytes > MAX_CONTEXT_JSON_BYTES) {
    throw new BadRequestException(`${label}内容不能超过 ${MAX_CONTEXT_JSON_BYTES} 字节`);
  }
}

function normalizeText(value?: string) {
  return value?.trim() || null;
}

function throwFriendlyUnique(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(message);
  }
  throw error;
}
