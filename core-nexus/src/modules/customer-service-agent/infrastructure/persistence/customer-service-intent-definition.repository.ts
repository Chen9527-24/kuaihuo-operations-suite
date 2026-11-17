import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class CustomerServiceIntentDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceIntentDefinitionWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceIntentDefinition.findMany({
      where,
      skip,
      take,
      orderBy: [{ category: 'asc' }, { sort: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  count(where: Prisma.CustomerServiceIntentDefinitionWhereInput) {
    return this.prisma.customerServiceIntentDefinition.count({ where });
  }

  findByKey(tenantId: string, key: string) {
    return this.prisma.customerServiceIntentDefinition.findFirst({
      where: { tenantId, key, deletedAt: null },
    });
  }

  findScoped(id: string, tenantId?: string) {
    return this.prisma.customerServiceIntentDefinition.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
  }

  create(data: Prisma.CustomerServiceIntentDefinitionUncheckedCreateInput) {
    return this.prisma.customerServiceIntentDefinition.create({ data });
  }

  updateWithRevision(
    id: string,
    tenantId: string,
    revision: number,
    data: Prisma.CustomerServiceIntentDefinitionUncheckedUpdateManyInput,
  ) {
    return this.prisma.customerServiceIntentDefinition.updateMany({
      where: { id, tenantId, revision, deletedAt: null },
      data: { ...data, revision: { increment: 1 } },
    });
  }


  findRecognitionCatalog(tenantId: string, industryCode?: string | null) {
    return this.prisma.customerServiceIntentDefinition.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'ENABLED',
        ...(industryCode
          ? {
              OR: [
                { supportedIndustryCodes: { isEmpty: true } },
                { supportedIndustryCodes: { has: industryCode } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        key: true,
        name: true,
        category: true,
        description: true,
        scenario: true,
        primaryIntent: true,
        defaultRiskLevel: true,
        recognitionConfig: true,
        examples: true,
        priority: true,
      },
      orderBy: [{ priority: 'desc' }, { sort: 'asc' }, { updatedAt: 'desc' }],
      take: 120,
    });
  }

  async findRuntimeMatches(
    tenantId: string,
    scenario: string,
    intent: string,
    industryCode?: string | null,
    recognizedDefinitionIds: string[] = [],
  ) {
    const items = await this.prisma.customerServiceIntentDefinition.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'ENABLED',
        AND: [
          {
            OR: [
              ...(recognizedDefinitionIds.length ? [{ id: { in: recognizedDefinitionIds } }] : []),
              { scenario },
              { scenario: '*', primaryIntent: intent },
              { scenario: '*', primaryIntent: '*' },
            ],
          },
          ...(industryCode
            ? [{
                OR: [
                  { supportedIndustryCodes: { isEmpty: true } },
                  { supportedIndustryCodes: { has: industryCode } },
                ],
              }]
            : []),
        ],
      },
      orderBy: [{ priority: 'desc' }, { sort: 'asc' }, { updatedAt: 'desc' }],
      take: 20,
    });

    return items
      .map((item) => ({
        item,
        matchScore: recognizedDefinitionIds.includes(item.id)
          ? 1000
          : runtimeMatchScore(item.scenario, item.primaryIntent, scenario, intent),
      }))
      .filter((entry) => entry.matchScore > 0)
      .sort((left, right) =>
        right.matchScore - left.matchScore ||
        right.item.priority - left.item.priority ||
        left.item.sort - right.item.sort,
      )
      .slice(0, 5)
      .map((entry) => entry.item);
  }
}

function runtimeMatchScore(
  configuredScenario: string,
  configuredIntent: string,
  actualScenario: string,
  actualIntent: string,
) {
  const scenarioExact = configuredScenario === actualScenario;
  const scenarioWildcard = configuredScenario === '*';
  const intentExact = configuredIntent === actualIntent;
  const intentWildcard = configuredIntent === '*';

  if (scenarioExact && intentExact) return 400;
  if (scenarioExact && intentWildcard) return 300;
  // 意图专属配置不能仅凭场景相同跨意图加载。
  // 场景通用约束应由 SCENARIO_COMMON 策略组承担；否则“积极分享”会污染“负面倾诉”等同场景不同目标。
  if (scenarioExact) return 0;
  if (scenarioWildcard && intentExact) return 180;
  if (scenarioWildcard && intentWildcard) return 100;
  return 0;
}
