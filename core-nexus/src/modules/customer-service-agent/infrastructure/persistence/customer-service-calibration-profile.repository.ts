import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { compareCalibrationProfilePriority } from '../../shared/calibration/customer-service-calibration-profile.util';

const profileInclude = {
  merchantRole: { select: { id: true, code: true, name: true } },
  industryNode: { select: { id: true, code: true, name: true, path: true } },
  accountProfile: { select: { id: true, code: true, name: true, channel: true, revision: true } },
  createdBy: { select: { id: true, displayName: true, username: true } },
  updatedBy: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.CustomerServiceCalibrationProfileInclude;

@Injectable()
export class CustomerServiceCalibrationProfileRepository {
  constructor(private readonly prisma: PrismaService) {}


  list(where: Prisma.CustomerServiceCalibrationProfileWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceCalibrationProfile.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }],
      include: profileInclude,
    });
  }

  count(where: Prisma.CustomerServiceCalibrationProfileWhereInput) {
    return this.prisma.customerServiceCalibrationProfile.count({ where });
  }

  findByScopeKey(tenantId: string, scopeKey: string) {
    return this.prisma.customerServiceCalibrationProfile.findFirst({
      where: { tenantId, scopeKey, deletedAt: null },
      include: profileInclude,
    });
  }

  create(data: Prisma.CustomerServiceCalibrationProfileUncheckedCreateInput) {
    return this.prisma.customerServiceCalibrationProfile.create({ data, include: profileInclude });
  }

  update(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceCalibrationProfileUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceCalibrationProfile.updateMany({
      where: { id, tenantId, deletedAt: null, revision },
      data,
    });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceCalibrationProfile.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: profileInclude,
    });
  }


  updateStatus(id: string, tenantId: string, revision: number, status: string, userId: string) {
    return this.prisma.customerServiceCalibrationProfile.updateMany({
      where: { id, tenantId, deletedAt: null, revision },
      data: { status, updatedById: userId, revision: { increment: 1 } },
    });
  }

  async findActiveMatching(input: {
    tenantId: string;
    merchantRoleId: string;
    accountProfileId?: string | null;
    robotId?: string | null;
    industryNodeId?: string | null;
    scenario: string;
    intent: string;
    riskLevel: string;
  }) {
    const industryScope: Prisma.CustomerServiceCalibrationProfileWhereInput[] = input.industryNodeId
      ? [{ industryNodeId: input.industryNodeId }, { industryNodeId: null }]
      : [{ industryNodeId: null }];
    const scenarioScope: Prisma.CustomerServiceCalibrationProfileWhereInput[] = [
      { scenario: input.scenario },
      { scenario: null },
    ];
    const intentScope: Prisma.CustomerServiceCalibrationProfileWhereInput[] = [
      { intent: input.intent },
      { intent: null },
    ];
    const riskScope: Prisma.CustomerServiceCalibrationProfileWhereInput[] = [
      { riskLevel: input.riskLevel },
      { riskLevel: null },
    ];
    const scenarioMatch = (): Prisma.CustomerServiceCalibrationProfileWhereInput => ({
      AND: [{ OR: industryScope }, { OR: scenarioScope }],
    });
    const contextMatch = (): Prisma.CustomerServiceCalibrationProfileWhereInput => ({
      AND: [
        { OR: industryScope },
        { OR: scenarioScope },
        { OR: intentScope },
        { OR: riskScope },
      ],
    });

    const items = await this.prisma.customerServiceCalibrationProfile.findMany({
      where: {
        tenantId: input.tenantId,
        merchantRoleId: input.merchantRoleId,
        deletedAt: null,
        status: 'ACTIVE',
        OR: [
          { scopeType: 'ROLE_GLOBAL', accountProfileId: null },
          {
            scopeType: 'ROLE_SCENARIO',
            accountProfileId: null,
            ...scenarioMatch(),
          },
          {
            scopeType: 'ROLE_CONTEXT',
            accountProfileId: null,
            ...contextMatch(),
          },
          ...(input.accountProfileId && input.robotId ? [
            {
              scopeType: 'ROBOT_GLOBAL',
              accountProfileId: input.accountProfileId,
              scopeKey: { startsWith: `robot:${input.robotId}|role:${input.merchantRoleId}|account:${input.accountProfileId}|` },
            },
            {
              scopeType: 'ROBOT_SCENARIO',
              accountProfileId: input.accountProfileId,
              scopeKey: { startsWith: `robot:${input.robotId}|role:${input.merchantRoleId}|account:${input.accountProfileId}|` },
              ...scenarioMatch(),
            },
            {
              scopeType: 'ROBOT_CONTEXT',
              accountProfileId: input.accountProfileId,
              scopeKey: { startsWith: `robot:${input.robotId}|role:${input.merchantRoleId}|account:${input.accountProfileId}|` },
              ...contextMatch(),
            },
          ] : []),
          ...(input.accountProfileId ? [
            { scopeType: 'ACCOUNT_GLOBAL', accountProfileId: input.accountProfileId },
            {
              scopeType: 'ACCOUNT_SCENARIO',
              accountProfileId: input.accountProfileId,
              ...scenarioMatch(),
            },
            {
              scopeType: 'ACCOUNT_CONTEXT',
              accountProfileId: input.accountProfileId,
              ...contextMatch(),
            },
          ] : []),
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    // Query order is not runtime authority. Re-sort deterministically by scope hierarchy,
    // exact-vs-wildcard specificity, recency, then id so the same context always projects
    // the same calibration precedence even after restarts or across database plans.
    return items.sort(compareCalibrationProfilePriority);
  }
}
