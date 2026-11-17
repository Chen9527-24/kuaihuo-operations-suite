import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceRuntimeSourceRepository } from '../../infrastructure/persistence/customer-service-runtime-source.repository';
import { CustomerServiceTuningSessionRepository } from '../../infrastructure/persistence/customer-service-tuning-session.repository';
import { CustomerServiceContextProfileRepository } from '../../infrastructure/persistence/customer-service-context-profile.repository';
import { CreateCustomerServiceTuningSessionDto } from './dto/create-tuning-session.dto';
import { CustomerServiceTuningAnalysisQueryDto } from './dto/tuning-analysis-query.dto';
import { CustomerServiceTuningSessionQueryDto } from './dto/tuning-session-query.dto';
import { UpdateCustomerServiceTuningSessionDto } from './dto/update-tuning-session.dto';
import { AppendCustomerServiceAssistantSegmentDto } from './dto/append-assistant-segment.dto';
import { AcceptCustomerServiceTuningAnalysisDto } from './dto/accept-tuning-analysis.dto';

@Injectable()
export class CustomerServiceTuningSessionsService {
  constructor(
    private readonly repository: CustomerServiceTuningSessionRepository,
    private readonly runtimeRepository: CustomerServiceRuntimeSourceRepository,
    private readonly contextProfileRepository: CustomerServiceContextProfileRepository,
  ) {}

  async list(query: CustomerServiceTuningSessionQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceTuningSessionWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      purpose: 'TUNING',
      ...(query.status ? { status: query.status } : { status: 'ACTIVE' }),
      ...(query.keyword ? { title: { contains: query.keyword, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.list(where, skip, take),
      this.repository.count(where),
    ]);
    return { items, total, page, pageSize };
  }

  async listAnalyses(query: CustomerServiceTuningAnalysisQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const keyword = query.keyword?.trim();
    const where: Prisma.CustomerServiceTuningAnalysisWhereInput = {
      session: { ...(tenantId ? { tenantId } : {}), purpose: 'TUNING' },
      ...(query.runType ? { runType: query.runType } : {}),
      ...(keyword ? {
        OR: [
          { latestMessage: { contains: keyword, mode: 'insensitive' } },
          { session: { title: { contains: keyword, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.listAnalyses(where, skip, take),
      this.repository.countAnalyses(where),
    ]);
    return { items, total, page, pageSize };
  }

  async create(dto: CreateCustomerServiceTuningSessionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const role = await this.runtimeRepository.findMerchantRole(dto.merchantRoleId, tenantId);
    if (!role) throw new BadRequestException('客服角色不存在或不属于当前租户');
    const account = dto.accountProfileId
      ? await this.contextProfileRepository.findAccount(dto.accountProfileId, tenantId)
      : null;
    if (dto.accountProfileId && (!account || account.status !== 'ENABLED')) {
      throw new BadRequestException('账号背景不存在、未启用或不属于当前租户');
    }
    if (account?.merchantRoleId && account.merchantRoleId !== role.id) {
      throw new BadRequestException('账号背景绑定的客服角色与当前角色不一致');
    }
    if (dto.storeProfileId && account?.storeProfileId && dto.storeProfileId !== account.storeProfileId) {
      throw new BadRequestException('店铺背景与账号绑定的店铺不一致');
    }
    const storeProfileId = dto.storeProfileId || account?.storeProfileId || null;
    const store = storeProfileId
      ? await this.contextProfileRepository.findStore(storeProfileId, tenantId)
      : null;
    if (storeProfileId && (!store || store.status !== 'ENABLED')) {
      throw new BadRequestException('店铺背景不存在、未启用或不属于当前租户');
    }
    if (dto.industryNodeId && account?.industryNodeId && dto.industryNodeId !== account.industryNodeId) {
      throw new BadRequestException('行业能力与账号绑定的行业不一致');
    }
    const industryNodeId = dto.industryNodeId || account?.industryNodeId || null;
    const industry = industryNodeId
      ? await this.runtimeRepository.findIndustryNode(industryNodeId, tenantId)
      : null;
    if (industryNodeId && !industry) throw new BadRequestException('行业能力不存在或不属于当前租户');
    return this.repository.create({
      tenantId,
      merchantRoleId: role.id,
      accountProfileId: account?.id || null,
      industryNodeId: industry?.id || null,
      title: dto.title?.trim() || '新调优对话',
      purpose: 'TUNING',
      createdById: user.id,
      contextSnapshot: {
        merchantRoleId: role.id,
        accountProfileId: account?.id || null,
        storeProfileId: store?.id || null,
        industryNodeId: industry?.id || null,
        classificationMode: 'AUTO',
      } as Prisma.InputJsonValue,
    });
  }

  async get(id: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const item = await this.repository.getDetails(id, tenantId);
    if (!item || item.purpose !== 'TUNING') throw new NotFoundException('调优对话不存在');
    return item;
  }

  async getAnalysis(id: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const item = await this.repository.getAnalysisDetails(id, tenantId);
    if (!item || item.session.purpose !== 'TUNING') throw new NotFoundException('调优分析不存在');
    return item;
  }

  async acceptAnalysis(
    analysisId: string,
    dto: AcceptCustomerServiceTuningAnalysisDto,
    user: CurrentUserPayload,
  ) {
    const tenantId = resolveRequiredTenantId(user);
    const analysis = await this.repository.getAnalysisDetails(analysisId, tenantId);
    if (!analysis || analysis.session.purpose !== 'TUNING') throw new NotFoundException('调优分析不存在');
    if (analysis.session.status !== 'ACTIVE') throw new BadRequestException('当前调优对话已归档，不能发送候选回复');
    if (dto.expectedContentHash && analysis.contentHash && dto.expectedContentHash !== analysis.contentHash) {
      throw new BadRequestException('候选回复已经更新，请刷新后再接受');
    }
    const generation = asRecord(analysis.generation);
    if (String(generation.candidateSafetyStatus || '') === 'BLOCKED') {
      throw new BadRequestException('该候选未通过绝对安全门，不能接受发送');
    }
    const deliveryPlan = asRecord(generation.deliveryPlan);
    const plannedSegments = Array.isArray(deliveryPlan.segments)
      ? deliveryPlan.segments.map(asRecord).map((item) => String(item.content || '').trim()).filter(Boolean)
      : [];
    const draft = String(generation.draft || '').trim();
    const segments = plannedSegments.length ? plannedSegments : (draft ? [draft] : []);
    if (!segments.length) throw new BadRequestException('该分析没有可发送的候选回复');

    const messages = [];
    for (let index = 0; index < segments.length; index += 1) {
      const message = await this.repository.appendMessage({
        sessionId: analysis.sessionId,
        tenantId,
        role: 'ASSISTANT',
        content: segments[index],
        clientMessageId: `analysis:${analysis.id}:assistant:${index}`,
      });
      if (message) messages.push(message);
    }
    return {
      accepted: true,
      idempotencyKey: `analysis:${analysis.id}`,
      analysisId: analysis.id,
      sessionId: analysis.sessionId,
      messages,
    };
  }


  async appendAssistantSegment(id: string, dto: AppendCustomerServiceAssistantSegmentDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const session = await this.repository.findScoped(id, tenantId);
    if (!session || session.purpose !== 'TUNING') throw new NotFoundException('调优对话不存在');
    if (session.status !== 'ACTIVE') throw new BadRequestException('当前调优对话已归档，不能继续投递回复');
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('消息分段内容不能为空');
    if (dto.anchorClientMessageId?.trim()) {
      const messages = await this.repository.listMessages(id, tenantId, 20);
      const latestCustomer = [...messages].reverse().find((item) => item.role === 'CUSTOMER');
      if (!latestCustomer || latestCustomer.clientMessageId !== dto.anchorClientMessageId.trim()) {
        throw new BadRequestException('客户已发送新消息，未投递的后续回复段已取消');
      }
    }
    const clientMessageId = dto.clientMessageId?.trim() || `${dto.replyGroupId.trim()}:assistant:${dto.segmentIndex}`;
    const message = await this.repository.appendMessage({
      sessionId: id,
      tenantId,
      role: 'ASSISTANT',
      content,
      clientMessageId,
    });
    if (!message) throw new NotFoundException('调优对话不存在');
    return message;
  }

  async remove(id: string, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const result = await this.repository.deleteScoped(id, tenantId);
    if (!result) throw new NotFoundException('调优对话不存在');
    return result;
  }

  async removeMany(ids: string[], user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const normalizedIds = Array.from(new Set(
      (ids || []).map((item) => String(item || '').trim()).filter(Boolean),
    )).slice(0, 100);
    if (!normalizedIds.length) throw new BadRequestException('请选择至少一个要删除的调优对话');
    return this.repository.deleteManyScoped(normalizedIds, tenantId);
  }

  async update(id: string, dto: UpdateCustomerServiceTuningSessionDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const current = await this.repository.findScoped(id, tenantId);
    if (!current || current.purpose !== 'TUNING') throw new NotFoundException('调优对话不存在');
    if (dto.merchantRoleId) {
      const role = await this.runtimeRepository.findMerchantRole(dto.merchantRoleId, tenantId);
      if (!role) throw new BadRequestException('客服角色不存在或不属于当前租户');
    }
    if (dto.accountProfileId) {
      const account = await this.contextProfileRepository.findAccount(dto.accountProfileId, tenantId);
      if (!account || account.status !== 'ENABLED') {
        throw new BadRequestException('账号背景不存在、未启用或不属于当前租户');
      }
      const effectiveRoleId = dto.merchantRoleId || current.merchantRoleId;
      if (account.merchantRoleId && account.merchantRoleId !== effectiveRoleId) {
        throw new BadRequestException('账号背景绑定的客服角色与当前角色不一致');
      }
    }
    if (dto.industryNodeId) {
      const industry = await this.runtimeRepository.findIndustryNode(dto.industryNodeId, tenantId);
      if (!industry) throw new BadRequestException('行业能力不存在或不属于当前租户');
    }
    await this.repository.updateScoped(id, tenantId, {
      ...(dto.merchantRoleId ? { merchantRoleId: dto.merchantRoleId } : {}),
      ...(dto.accountProfileId !== undefined ? { accountProfileId: dto.accountProfileId || null } : {}),
      ...(dto.industryNodeId !== undefined ? { industryNodeId: dto.industryNodeId || null } : {}),
      ...(dto.title ? { title: dto.title.trim() } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.contextSnapshot ? { contextSnapshot: dto.contextSnapshot as Prisma.InputJsonValue } : {}),
    });
    return this.get(id, user);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
