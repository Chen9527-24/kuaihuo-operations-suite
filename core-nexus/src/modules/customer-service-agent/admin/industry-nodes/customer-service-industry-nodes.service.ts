import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId, resolveTenantId } from '../../../../common/utils/tenant-scope';
import {
  CustomerServiceIndustryNodeRepository,
  CustomerServiceIndustryNodeRevisionConflictError,
} from '../../infrastructure/persistence/customer-service-industry-node.repository';
import { normalizeCustomerServiceKey } from '../../shared/utils/customer-service-key.util';
import { CreateCustomerServiceIndustryNodeDto } from './dto/create-industry-node.dto';
import { DeleteCustomerServiceIndustryNodeDto } from './dto/delete-industry-node.dto';
import { CustomerServiceIndustryNodeQueryDto } from './dto/industry-node-query.dto';
import { ReorderCustomerServiceIndustryNodesDto } from './dto/reorder-industry-nodes.dto';
import { UpdateCustomerServiceIndustryNodeDto } from './dto/update-industry-node.dto';

const NODE_TYPE_BY_LEVEL = ['INDUSTRY', 'CATEGORY', 'SUBCATEGORY'] as const;
const MAX_TREE_LEVEL = NODE_TYPE_BY_LEVEL.length - 1;

@Injectable()
export class CustomerServiceIndustryNodesService {
  constructor(private readonly repository: CustomerServiceIndustryNodeRepository) {}

  list(query: CustomerServiceIndustryNodeQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveTenantId(user, query.tenantId);
    return this.repository.list({
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('行业节点不存在');
    return item;
  }

  async create(dto: CreateCustomerServiceIndustryNodeDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const parent = dto.parentId ? await this.repository.findScoped(dto.parentId, tenantId) : null;
    this.assertHierarchy(dto.nodeType, parent?.nodeType);

    const code = normalizeCustomerServiceKey(dto.code);
    const existingActiveCode = await this.repository.findActiveByCode(tenantId, code);
    if (existingActiveCode) {
      throw new ConflictException('当前租户下已存在相同行业节点编码');
    }
    const level = parent ? parent.level + 1 : 0;
    const path = parent ? `${parent.path}/${code}` : `/${code}`;
    try {
      return await this.repository.create({
        tenantId,
        parentId: parent?.id ?? null,
        code,
        name: dto.name.trim(),
        nodeType: dto.nodeType,
        level,
        path,
        description: dto.description?.trim() || null,
        status: dto.status ?? 'ENABLED',
        sort: dto.sort ?? 0,
        createdById: user.id,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('当前租户下已存在相同行业节点编码');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerServiceIndustryNodeDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    const result = await this.repository.updateWithRevision(id, existing.tenantId, dto.revision, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      updatedById: user.id,
    });
    if (!result.count) throw new ConflictException('行业节点已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }

  async reorder(dto: ReorderCustomerServiceIndustryNodesDto, user: CurrentUserPayload) {
    const firstRequested = dto.nodes[0];
    const first = await this.repository.findScoped(firstRequested.id, resolveTenantId(user));
    if (!first) throw new NotFoundException('行业节点不存在，请刷新后重试');
    const tenantId = first.tenantId;
    const current = await this.repository.list({ tenantId, deletedAt: null });
    const currentById = new Map(current.map((item) => [item.id, item]));
    const requestedById = new Map<string, (typeof dto.nodes)[number]>();

    for (const item of dto.nodes) {
      if (requestedById.has(item.id)) throw new BadRequestException('拖拽布局包含重复节点');
      requestedById.set(item.id, item);
    }
    if (requestedById.size !== current.length) {
      throw new ConflictException('行业树已发生变化，请刷新后重新拖拽');
    }
    for (const item of current) {
      const requested = requestedById.get(item.id);
      if (!requested) throw new ConflictException('行业树已发生变化，请刷新后重新拖拽');
      if (requested.revision !== item.revision) {
        throw new ConflictException('行业树有节点已被其他操作更新，请刷新后重试');
      }
    }

    const childrenByParent = new Map<string | null, string[]>();
    const siblingSorts = new Map<string | null, Set<number>>();
    for (const requested of dto.nodes) {
      const currentItem = currentById.get(requested.id);
      if (!currentItem || currentItem.tenantId !== tenantId) {
        throw new BadRequestException('拖拽布局包含不属于当前租户的节点');
      }
      const parentId = requested.parentId || null;
      if (parentId === requested.id) throw new BadRequestException('节点不能移动到自己下面');
      if (parentId) {
        const parent = currentById.get(parentId);
        if (!parent) throw new BadRequestException('拖拽目标节点不存在');
        if (parent.status === 'ARCHIVED') throw new BadRequestException('不能移动到已归档节点下面');
      }
      const sortSet = siblingSorts.get(parentId) ?? new Set<number>();
      if (sortSet.has(requested.sort)) throw new BadRequestException('同级节点排序值不能重复');
      sortSet.add(requested.sort);
      siblingSorts.set(parentId, sortSet);
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(requested.id);
      childrenByParent.set(parentId, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => {
        const left = requestedById.get(a)!;
        const right = requestedById.get(b)!;
        return left.sort - right.sort || a.localeCompare(b);
      });
    }

    const layoutById = new Map<string, { parentId: string | null; sort: number; level: number; nodeType: string; path: string }>();
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string, parentId: string | null, level: number, parentPath: string | null) => {
      if (visiting.has(id)) throw new BadRequestException('拖拽结果存在循环父子关系');
      if (visited.has(id)) throw new BadRequestException('拖拽结果存在重复挂载节点');
      if (level > MAX_TREE_LEVEL) throw new BadRequestException('行业树最多支持三级，当前拖拽会超过层级限制');
      const currentItem = currentById.get(id);
      const requested = requestedById.get(id);
      if (!currentItem || !requested) throw new BadRequestException('拖拽布局包含无效节点');

      visiting.add(id);
      const path = parentPath ? `${parentPath}/${currentItem.code}` : `/${currentItem.code}`;
      layoutById.set(id, {
        parentId,
        sort: requested.sort,
        level,
        nodeType: NODE_TYPE_BY_LEVEL[level],
        path,
      });
      for (const childId of childrenByParent.get(id) ?? []) visit(childId, id, level + 1, path);
      visiting.delete(id);
      visited.add(id);
    };

    for (const rootId of childrenByParent.get(null) ?? []) visit(rootId, null, 0, null);
    if (visited.size !== current.length) throw new BadRequestException('拖拽结果必须形成完整且无循环的行业树');

    const changes = current.flatMap((item) => {
      const next = layoutById.get(item.id)!;
      if (
        item.parentId === next.parentId &&
        item.sort === next.sort &&
        item.level === next.level &&
        item.nodeType === next.nodeType &&
        item.path === next.path
      ) return [];
      return [{ id: item.id, revision: item.revision, ...next }];
    });

    try {
      const result = await this.repository.applyTreeLayout(tenantId, changes, user.id);
      return { tenantId, updated: result.updated, total: current.length };
    } catch (error) {
      if (error instanceof CustomerServiceIndustryNodeRevisionConflictError) {
        throw new ConflictException('行业树有节点已被其他操作更新，请刷新后重试');
      }
      throw error;
    }
  }

  async remove(id: string, dto: DeleteCustomerServiceIndustryNodeDto, user: CurrentUserPayload) {
    const existing = await this.get(id, user);
    if (existing.revision !== dto.revision) {
      throw new ConflictException('行业节点已被其他操作更新，请刷新后重试');
    }
    const current = await this.repository.list({ tenantId: existing.tenantId, deletedAt: null });
    const childrenByParent = new Map<string, string[]>();
    for (const item of current) {
      if (!item.parentId) continue;
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item.id);
      childrenByParent.set(item.parentId, children);
    }
    const nodeIds: string[] = [];
    const stack = [existing.id];
    while (stack.length) {
      const currentId = stack.pop()!;
      nodeIds.push(currentId);
      stack.push(...(childrenByParent.get(currentId) ?? []));
    }

    try {
      return await this.repository.softDeleteSubtree({
        tenantId: existing.tenantId,
        rootId: existing.id,
        rootRevision: dto.revision,
        nodeIds,
        updatedById: user.id,
      });
    } catch (error) {
      if (error instanceof CustomerServiceIndustryNodeRevisionConflictError) {
        throw new ConflictException('行业节点已被其他操作更新，请刷新后重试');
      }
      throw error;
    }
  }

  private assertHierarchy(nodeType: string, parentType?: string) {
    if (!parentType && nodeType !== 'INDUSTRY') {
      throw new BadRequestException('根节点必须是行业类型');
    }
    if (parentType === 'INDUSTRY' && nodeType !== 'CATEGORY') {
      throw new BadRequestException('行业节点下只能新增品类节点');
    }
    if (parentType === 'CATEGORY' && nodeType !== 'SUBCATEGORY') {
      throw new BadRequestException('品类节点下只能新增子品类节点');
    }
    if (parentType === 'SUBCATEGORY') {
      throw new BadRequestException('子品类节点下暂不允许继续新增层级');
    }
  }
}
