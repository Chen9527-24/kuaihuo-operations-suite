import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceCalibrationProfileRepository } from '../../infrastructure/persistence/customer-service-calibration-profile.repository';
import { isImmediateCalibrationScopeType, sanitizeTuningDirectives } from '../../shared/calibration/customer-service-calibration-profile.util';
import { CustomerServiceCalibrationProfileQueryDto } from './dto/calibration-profile-query.dto';
import { UpdateCustomerServiceCalibrationProfileStatusDto } from './dto/update-calibration-profile-status.dto';

@Injectable()
export class CustomerServiceCalibrationProfilesService {
  constructor(private readonly repository: CustomerServiceCalibrationProfileRepository) {}

  async list(query: CustomerServiceCalibrationProfileQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query, { maxPageSize: 100 });
    const tenantId = resolveTenantId(user, query.tenantId);
    const where: Prisma.CustomerServiceCalibrationProfileWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.merchantRoleId ? { merchantRoleId: query.merchantRoleId } : {}),
      ...(query.scenario ? { scenario: query.scenario } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: 'insensitive' } },
              { scopeKey: { contains: query.keyword, mode: 'insensitive' } },
              { merchantRole: { name: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.repository.list(where, skip, take),
      this.repository.count(where),
    ]);
    return { items: items.map(withEffectiveDirectives), total, page, pageSize };
  }

  async get(id: string, user: CurrentUserPayload) {
    const item = await this.repository.findScoped(id, resolveTenantId(user));
    if (!item) throw new NotFoundException('调优档案不存在');
    return withEffectiveDirectives(item);
  }

  async updateStatus(
    id: string,
    dto: UpdateCustomerServiceCalibrationProfileStatusDto,
    user: CurrentUserPayload,
  ) {
    const item = await this.get(id, user);
    if (item.status === dto.status) return item;
    if (item.status === 'ARCHIVED') throw new BadRequestException('已归档调优档案不能重新启用或停用');
    if (dto.status === 'ACTIVE') {
      const sourceRecordIds = Array.isArray(item.sourceRecordIds) ? [...new Set(item.sourceRecordIds)] : [];
      if (!isImmediateCalibrationScopeType(item.scopeType) && sourceRecordIds.length < 3) {
        throw new BadRequestException('角色级共享档案至少需要 3 条独立校准记录；请聚合证据、完成回归后再进入共享策略发布流程。');
      }
      const directives = sanitizeTuningDirectives(item.directives);
      if (directives.avoidExpressions.length || directives.preferredPatterns.length) {
        throw new BadRequestException('调优档案仍包含按句式生效的表达规则，不能启用；请改为通用目标/行为约束并重新完成回归。');
      }
    }
    const result = await this.repository.updateStatus(
      item.id,
      item.tenantId,
      item.revision,
      dto.status,
      user.id,
    );
    if (result.count !== 1) throw new ConflictException('调优档案已被其他操作更新，请刷新后重试');
    return this.get(id, user);
  }
}


function withEffectiveDirectives<T extends { directives: unknown }>(item: T) {
  return { ...item, directives: sanitizeTuningDirectives(item.directives) };
}
