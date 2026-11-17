import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InitializeCustomerServiceFoundationDto } from './dto/initialize-foundation.dto';
import { CustomerServiceEvaluationFoundationSeeder } from './seeders/customer-service-evaluation-foundation.seeder';
import { CustomerServiceIntentFoundationSeeder } from './seeders/customer-service-intent-foundation.seeder';
import { CustomerServiceGuidelineFoundationSeeder } from './seeders/customer-service-guideline-foundation.seeder';
import { CustomerServiceResponseFoundationSeeder } from './seeders/customer-service-response-foundation.seeder';
import { CustomerServiceRoleFoundationSeeder } from './seeders/customer-service-role-foundation.seeder';
import { FOUNDATION_EVALUATION_CASES } from './templates/customer-service-evaluation-case.template';
import {
  FOUNDATION_INDUSTRY_NODES,
  FOUNDATION_MERCHANT_ROLES,
  FOUNDATION_RESPONSE_ASSETS,
  FOUNDATION_RESPONSE_RULES,
  FOUNDATION_ROLE_MODULES,
  FOUNDATION_ROLE_PROTOTYPES,
} from './templates/customer-service-foundation.template';
import { FOUNDATION_QUALITY_RULES } from './templates/customer-service-quality-rule.template';
import { FOUNDATION_INTENT_DEFINITIONS } from './templates/customer-service-intent-definition.template';
import {
  ALI_FLAGSHIP_EVALUATION_CASES,
  ALI_FLAGSHIP_MODULES,
  ALI_FLAGSHIP_PROTOTYPE,
  ALI_FLAGSHIP_ROLE,
  ALI_LEGACY_MODULE_KEYS,
} from './templates/customer-service-ali-flagship.template';
import { sanitizeAliFlagshipDirectives } from '../../shared/calibration/customer-service-calibration-profile.util';
import { stableJsonHash } from '../../shared/utils/stable-json-hash.util';
import { CustomerServiceEntitySeedMap, CustomerServiceFoundationTx } from './types/foundation-seed.type';
import { CustomerServiceFoundationResource, CustomerServiceFoundationResult } from './types/foundation-result.type';

@Injectable()
export class CustomerServiceFoundationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleSeeder: CustomerServiceRoleFoundationSeeder,
    private readonly responseSeeder: CustomerServiceResponseFoundationSeeder,
    private readonly evaluationSeeder: CustomerServiceEvaluationFoundationSeeder,
    private readonly intentSeeder: CustomerServiceIntentFoundationSeeder,
    private readonly guidelineSeeder: CustomerServiceGuidelineFoundationSeeder,
  ) {}

  async getStatus(dto: InitializeCustomerServiceFoundationDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const actual = await this.countFoundationResources(tenantId);
    const expected = expectedCounts();
    return {
      tenantId,
      initialized: foundationResources.every((key) => actual[key] >= expected[key]),
      expected,
      actual,
    };
  }

  async initialize(
    dto: InitializeCustomerServiceFoundationDto,
    user: CurrentUserPayload,
  ): Promise<CustomerServiceFoundationResult> {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const result = emptyResult(tenantId);
    await this.prisma.$transaction(async (tx: CustomerServiceFoundationTx) => {
      const definitions = await tx.customerServiceRoleModuleDefinition.findMany({ where: { status: 'ENABLED' } });
      const definitionMap: CustomerServiceEntitySeedMap = new Map(definitions.map((item: { id: string; code: string }) => [item.code, item]));
      const missingDefinitions = [...new Set(FOUNDATION_ROLE_MODULES.map((item) => item.definitionCode))]
        .filter((code) => !definitionMap.has(code));
      if (missingDefinitions.length) {
        throw new UnprocessableEntityException(
          `缺少角色模块定义：${missingDefinitions.join('、')}，请先执行 pnpm run prisma:sync-system。`,
        );
      }

      const { industries, roles } = await this.roleSeeder.seed(
        tx,
        tenantId,
        user.id,
        result,
        definitionMap,
      );
      await this.responseSeeder.seed(tx, tenantId, user.id, result);
      await this.evaluationSeeder.seed(tx, tenantId, user.id, result, roles, industries);
      await this.intentSeeder.seed(tx, tenantId, user.id, result);
      await this.guidelineSeeder.seed(tx, tenantId, user.id);
    });
    result.initialized = true;
    return result;
  }

  /**
   * 显式同步阿梨旗舰母版。与普通 initialize 不同，这个操作会更新系统维护的
   * 阿梨角色、模块和统一策略配置组，并清理历史校准证据中的旧固定句式/情绪营销冲突。
   * 历史校准记录和案例不会删除；旧系统自动创建的全局/闲聊调优母版会归档，避免继续形成第二套生产规则。
   */
  async syncAliFlagship(dto: InitializeCustomerServiceFoundationDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    return this.prisma.$transaction(async (tx: CustomerServiceFoundationTx) => {
      const definitions = await tx.customerServiceRoleModuleDefinition.findMany({ where: { status: 'ENABLED' } });
      const definitionMap: CustomerServiceEntitySeedMap = new Map(definitions.map((item: { id: string; code: string }) => [item.code, item]));
      const missingDefinitions = [...new Set(ALI_FLAGSHIP_MODULES.map((item) => item.definitionCode))]
        .filter((code) => !definitionMap.has(code));
      if (missingDefinitions.length) {
        throw new UnprocessableEntityException(
          `缺少角色模块定义：${missingDefinitions.join('、')}，请先执行 pnpm run prisma:sync-system。`,
        );
      }

      let prototype = await tx.customerServiceRolePrototype.findUnique({
        where: { tenantId_code: { tenantId, code: ALI_FLAGSHIP_PROTOTYPE.code } },
      });
      if (!prototype) {
        prototype = await tx.customerServiceRolePrototype.create({
          data: {
            tenantId,
            ...ALI_FLAGSHIP_PROTOTYPE,
            status: 'ENABLED',
            createdById: user.id,
          },
        });
      } else {
        prototype = await tx.customerServiceRolePrototype.update({
          where: { id: prototype.id },
          data: {
            name: ALI_FLAGSHIP_PROTOTYPE.name,
            description: ALI_FLAGSHIP_PROTOTYPE.description,
            identity: ALI_FLAGSHIP_PROTOTYPE.identity,
            personality: ALI_FLAGSHIP_PROTOTYPE.personality,
            languageStyle: ALI_FLAGSHIP_PROTOTYPE.languageStyle,
            servicePosture: ALI_FLAGSHIP_PROTOTYPE.servicePosture,
            speakerProfile: ALI_FLAGSHIP_PROTOTYPE.speakerProfile,
            status: 'ENABLED',
            updatedById: user.id,
            revision: { increment: 1 },
          },
        });
      }

      let role = await tx.customerServiceMerchantRole.findUnique({
        where: { tenantId_code: { tenantId, code: ALI_FLAGSHIP_ROLE.code } },
      });
      if (!role) {
        role = await tx.customerServiceMerchantRole.create({
          data: {
            tenantId,
            prototypeId: prototype.id,
            industryNodeId: null,
            code: ALI_FLAGSHIP_ROLE.code,
            name: ALI_FLAGSHIP_ROLE.name,
            publicIdentity: ALI_FLAGSHIP_ROLE.publicIdentity,
            publicRelation: ALI_FLAGSHIP_ROLE.publicRelation,
            description: ALI_FLAGSHIP_ROLE.description,
            generationPrompt: ALI_FLAGSHIP_ROLE.generationPrompt,
            status: 'ENABLED',
            createdById: user.id,
          },
        });
      } else {
        role = await tx.customerServiceMerchantRole.update({
          where: { id: role.id },
          data: {
            prototypeId: prototype.id,
            industryNodeId: null,
            name: ALI_FLAGSHIP_ROLE.name,
            publicIdentity: ALI_FLAGSHIP_ROLE.publicIdentity,
            publicRelation: ALI_FLAGSHIP_ROLE.publicRelation,
            description: ALI_FLAGSHIP_ROLE.description,
            ...(role.generationPrompt ? {} : { generationPrompt: ALI_FLAGSHIP_ROLE.generationPrompt }),
            status: 'ENABLED',
            updatedById: user.id,
            revision: { increment: 1 },
          },
        });
      }

      let createdModules = 0;
      let updatedModules = 0;
      for (const item of ALI_FLAGSHIP_MODULES) {
        const definition = definitionMap.get(item.definitionCode)!;
        const existing = await tx.customerServiceRoleModuleInstance.findUnique({
          where: { merchantRoleId_key: { merchantRoleId: role.id, key: item.key } },
        });
        const data = {
          definitionId: definition.id,
          name: item.name,
          content: item.content as Prisma.InputJsonValue,
          conditions: item.conditions === null ? Prisma.JsonNull : item.conditions as Prisma.InputJsonValue,
          mergeMode: item.mergeMode,
          priority: item.priority,
          status: 'ENABLED',
          updatedById: user.id,
        };
        if (existing) {
          await tx.customerServiceRoleModuleInstance.update({
            where: { id: existing.id },
            data: { ...data, revision: { increment: 1 } },
          });
          updatedModules += 1;
        } else {
          await tx.customerServiceRoleModuleInstance.create({
            data: {
              tenantId,
              merchantRoleId: role.id,
              definitionId: definition.id,
              key: item.key,
              name: item.name,
              content: item.content as Prisma.InputJsonValue,
              conditions: item.conditions === null ? undefined : item.conditions as Prisma.InputJsonValue,
              mergeMode: item.mergeMode,
              priority: item.priority,
              status: 'ENABLED',
              createdById: user.id,
            },
          });
          createdModules += 1;
        }
      }

      const legacyModules = await tx.customerServiceRoleModuleInstance.findMany({
        where: {
          tenantId,
          merchantRoleId: role.id,
          key: { in: [...ALI_LEGACY_MODULE_KEYS] },
          deletedAt: null,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true, status: true },
      });
      let disabledLegacyModules = 0;
      for (const legacyModule of legacyModules) {
        if (legacyModule.status === 'DISABLED') continue;
        await tx.customerServiceRoleModuleInstance.update({
          where: { id: legacyModule.id },
          data: { status: 'DISABLED', updatedById: user.id, revision: { increment: 1 } },
        });
        disabledLegacyModules += 1;
      }

      // 护肤安全边界仍属于阿梨，但只在美妆/护肤行业命中；若旧环境缺失则补齐。
      const prohibitionDefinition = definitionMap.get('PROHIBITION')!;
      const beautyBoundaryData = {
        definitionId: prohibitionDefinition.id,
        name: '美妆安全边界',
        content: {
          forbidden: ['承诺治疗效果', '忽略过敏和明显不适', '索取无关健康隐私'],
        } as Prisma.InputJsonValue,
        conditions: { industryCodes: ['beauty', 'skincare'] } as Prisma.InputJsonValue,
        mergeMode: 'STRICTER',
        priority: 1000,
        status: 'ENABLED',
      };
      const beautyBoundary = await tx.customerServiceRoleModuleInstance.findUnique({
        where: { merchantRoleId_key: { merchantRoleId: role.id, key: 'beauty-safety-boundaries' } },
      });
      if (beautyBoundary) {
        await tx.customerServiceRoleModuleInstance.update({
          where: { id: beautyBoundary.id },
          data: { ...beautyBoundaryData, updatedById: user.id, revision: { increment: 1 } },
        });
        updatedModules += 1;
      } else {
        await tx.customerServiceRoleModuleInstance.create({
          data: {
            tenantId,
            merchantRoleId: role.id,
            key: 'beauty-safety-boundaries',
            ...beautyBoundaryData,
            createdById: user.id,
          },
        });
        createdModules += 1;
      }

      const profiles = await tx.customerServiceCalibrationProfile.findMany({
        where: { tenantId, merchantRoleId: role.id, deletedAt: null, status: 'ACTIVE' },
      });
      let sanitizedProfiles = 0;
      for (const profile of profiles) {
        await tx.customerServiceCalibrationProfile.update({
          where: { id: profile.id },
          data: {
            directives: sanitizeAliFlagshipDirectives(profile.directives) as Prisma.InputJsonValue,
            updatedById: user.id,
            revision: { increment: 1 },
          },
        });
        sanitizedProfiles += 1;
      }

      const globalScopeKey = `role:${role.id}|global`;
      const casualScopeKey = `role:${role.id}|industry:*|scenario:CASUAL_CHAT`;
      const legacyBaselineProfiles = await tx.customerServiceCalibrationProfile.findMany({
        where: {
          tenantId,
          merchantRoleId: role.id,
          scopeKey: { in: [globalScopeKey, casualScopeKey] },
          deletedAt: null,
          status: { not: 'ARCHIVED' },
        },
        select: { id: true },
      });
      for (const profile of legacyBaselineProfiles) {
        await tx.customerServiceCalibrationProfile.update({
          where: { id: profile.id },
          data: {
            status: 'ARCHIVED',
            updatedById: user.id,
            revision: { increment: 1 },
          },
        });
      }

      // 同步阿梨母版时同时补齐客户意图与流程。已有同编码数据只计为 existing，
      // 不覆盖商家已经编辑过的内容；这样老环境不必重新执行整套基础数据初始化。
      const intentSeedResult = emptyResult(tenantId);
      await this.intentSeeder.seed(tx, tenantId, user.id, intentSeedResult);
      const strategySeedResult = emptyResult(tenantId);
      await this.responseSeeder.seed(tx, tenantId, user.id, strategySeedResult);
      await this.guidelineSeeder.seed(tx, tenantId, user.id);
      const strategyUpgrade = await this.syncAliStrategyGroups(tx, tenantId, user.id);

      let evaluationCases = 0;
      const industryCodes = [...new Set(ALI_FLAGSHIP_EVALUATION_CASES.map((item) => item.industryCode))];
      const industries = await tx.customerServiceIndustryNode.findMany({
        where: { tenantId, code: { in: industryCodes }, deletedAt: null },
      });
      const industryMap: CustomerServiceEntitySeedMap = new Map(
        industries.map((item: { id: string; code: string }) => [item.code, item]),
      );
      for (const item of ALI_FLAGSHIP_EVALUATION_CASES) {
        const industry = industryMap.get(item.industryCode);
        if (!industry) continue;
        await tx.customerServiceEvaluationCase.upsert({
          where: { tenantId_key: { tenantId, key: item.key } },
          create: {
            tenantId,
            merchantRoleId: role.id,
            industryNodeId: industry.id,
            key: item.key,
            name: item.name,
            message: item.message,
            expectedScenario: item.expectedScenario,
            expectedIntent: item.expectedIntent,
            expectedRiskLevel: item.expectedRiskLevel,
            expectedRoute: item.expectedRoute,
            serviceGoal: item.serviceGoal,
            customerState: item.customerState as Prisma.InputJsonValue,
            tags: [...item.tags],
            sort: item.sort,
            status: 'ENABLED',
            createdById: user.id,
          },
          update: {
            merchantRoleId: role.id,
            industryNodeId: industry.id,
            name: item.name,
            message: item.message,
            expectedScenario: item.expectedScenario,
            expectedIntent: item.expectedIntent,
            expectedRiskLevel: item.expectedRiskLevel,
            expectedRoute: item.expectedRoute,
            serviceGoal: item.serviceGoal,
            customerState: item.customerState as Prisma.InputJsonValue,
            tags: [...item.tags],
            sort: item.sort,
            status: 'ENABLED',
            updatedById: user.id,
            revision: { increment: 1 },
          },
        });
        evaluationCases += 1;
      }

      return {
        tenantId,
        prototypeId: prototype.id,
        roleId: role.id,
        roleCode: role.code,
        createdModules,
        updatedModules,
        disabledLegacyModules,
        sanitizedProfiles,
        baselineProfiles: 0,
        archivedLegacyCalibrationProfiles: legacyBaselineProfiles.length,
        upgradedStrategyGroups: strategyUpgrade.published,
        strategyUpgradeDrafts: strategyUpgrade.drafts,
        strategyGroupsUnchanged: strategyUpgrade.unchanged,
        evaluationCases,
        intentDefinitionsCreated: intentSeedResult.created.intentDefinitions,
        intentDefinitionsExisting: intentSeedResult.existing.intentDefinitions,
        historyPreserved: true,
      };
    });
  }

  /**
   * 系统维护的阿梨策略组采用版本化升级：
   * - 当前仍是正式初始化/系统同步版本时，直接发布新的系统版本；
   * - 用户已经通过 PC 发布过自定义版本时，只创建升级草稿，绝不静默覆盖；
   * - 相同内容的草稿或已发布版本不会重复创建。
   */
  private async syncAliStrategyGroups(tx: CustomerServiceFoundationTx, tenantId: string, userId: string) {
    let published = 0;
    let drafts = 0;
    let unchanged = 0;
    const items = FOUNDATION_RESPONSE_ASSETS.filter((item) => item.assetType === 'STRATEGY_GROUP' && item.key.startsWith('ali-'));
    for (const item of items) {
      const asset = await tx.customerServiceAsset.findUnique({
        where: { tenantId_key: { tenantId, key: item.key } },
      });
      if (!asset) continue;
      const contentHash = stableJsonHash(item.content);
      const current = asset.currentVersionId
        ? await tx.customerServiceAssetVersion.findUnique({ where: { id: asset.currentVersionId } })
        : null;
      if (current?.contentHash === contentHash) {
        unchanged += 1;
        continue;
      }
      const sameVersion = await tx.customerServiceAssetVersion.findFirst({
        where: { assetId: asset.id, contentHash },
        orderBy: { versionNo: 'desc' },
      });
      if (sameVersion) {
        if (sameVersion.status === 'PUBLISHED') unchanged += 1;
        else drafts += 1;
        continue;
      }
      const aggregate = await tx.customerServiceAssetVersion.aggregate({
        where: { assetId: asset.id },
        _max: { versionNo: true },
      });
      const systemManagedCurrent = Boolean(current && current.status === 'PUBLISHED' && (
        current.title === '正式初始化版本'
        || current.title.startsWith('V5.') && current.title.includes('系统策略升级')
        || current.summary?.includes('智能客服正式初始化向导')
        || current.summary?.includes('系统维护的阿梨策略')
      ));
      const nextVersionNo = (aggregate._max.versionNo ?? 0) + 1;
      if (systemManagedCurrent) {
        await tx.customerServiceAssetVersion.updateMany({
          where: { assetId: asset.id, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });
        const version = await tx.customerServiceAssetVersion.create({
          data: {
            assetId: asset.id,
            versionNo: nextVersionNo,
            title: 'V5.3 系统策略升级',
            summary: '系统维护的阿梨策略配置升级；生成与质量门共同读取本版本。',
            content: item.content as Prisma.InputJsonValue,
            contentHash,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            publishedById: userId,
            createdById: userId,
          },
        });
        await tx.customerServiceAsset.update({
          where: { id: asset.id },
          data: {
            name: item.name,
            description: item.description,
            status: 'PUBLISHED',
            currentVersionId: version.id,
            updatedById: userId,
            revision: { increment: 1 },
          },
        });
        published += 1;
      } else {
        await tx.customerServiceAssetVersion.create({
          data: {
            assetId: asset.id,
            versionNo: nextVersionNo,
            title: 'V5.3 系统策略升级建议',
            summary: '检测到当前已发布版本可能包含人工配置，本次只创建草稿，需在 PC 审核、回归并手动发布。',
            content: item.content as Prisma.InputJsonValue,
            contentHash,
            status: 'DRAFT',
            createdById: userId,
          },
        });
        drafts += 1;
      }
    }
    return { published, drafts, unchanged };
  }

  private async countFoundationResources(tenantId: string) {
    const counts = await Promise.all([
      this.prisma.customerServiceIndustryNode.count({ where: { tenantId, code: { in: FOUNDATION_INDUSTRY_NODES.map((item) => item.code) }, deletedAt: null } }),
      this.prisma.customerServiceRolePrototype.count({ where: { tenantId, code: { in: FOUNDATION_ROLE_PROTOTYPES.map((item) => item.code) }, deletedAt: null } }),
      this.prisma.customerServiceMerchantRole.count({ where: { tenantId, code: { in: FOUNDATION_MERCHANT_ROLES.map((item) => item.code) }, deletedAt: null } }),
      this.prisma.customerServiceRoleModuleInstance.count({ where: { tenantId, key: { in: FOUNDATION_ROLE_MODULES.map((item) => item.key) }, deletedAt: null } }),
      this.prisma.customerServiceAsset.count({ where: { tenantId, key: { in: FOUNDATION_RESPONSE_ASSETS.map((item) => item.key) }, deletedAt: null } }),
      this.prisma.customerServiceResponseRule.count({ where: { tenantId, key: { in: FOUNDATION_RESPONSE_RULES.map((item) => item.key) }, deletedAt: null } }),
      this.prisma.customerServiceQualityRule.count({ where: { tenantId, key: { in: FOUNDATION_QUALITY_RULES.map((item) => item.key) }, deletedAt: null } }),
      this.prisma.customerServiceEvaluationCase.count({ where: { tenantId, key: { in: FOUNDATION_EVALUATION_CASES.map((item) => item.key) }, deletedAt: null } }),
      this.prisma.customerServiceIntentDefinition.count({ where: { tenantId, key: { in: FOUNDATION_INTENT_DEFINITIONS.map((item) => item.key) }, deletedAt: null } }),
    ]);
    return Object.fromEntries(foundationResources.map((key, index) => [key, counts[index]])) as Record<CustomerServiceFoundationResource, number>;
  }
}

const foundationResources: CustomerServiceFoundationResource[] = [
  'industryNodes',
  'rolePrototypes',
  'merchantRoles',
  'roleModules',
  'responseAssets',
  'responseRules',
  'qualityRules',
  'evaluationCases',
  'intentDefinitions',
];

function expectedCounts(): Record<CustomerServiceFoundationResource, number> {
  return {
    industryNodes: FOUNDATION_INDUSTRY_NODES.length,
    rolePrototypes: FOUNDATION_ROLE_PROTOTYPES.length,
    merchantRoles: FOUNDATION_MERCHANT_ROLES.length,
    roleModules: FOUNDATION_ROLE_MODULES.length,
    responseAssets: FOUNDATION_RESPONSE_ASSETS.length,
    responseRules: FOUNDATION_RESPONSE_RULES.length,
    qualityRules: FOUNDATION_QUALITY_RULES.length,
    evaluationCases: FOUNDATION_EVALUATION_CASES.length,
    intentDefinitions: FOUNDATION_INTENT_DEFINITIONS.length,
  };
}

function emptyResult(tenantId: string): CustomerServiceFoundationResult {
  const counts = Object.fromEntries(foundationResources.map((key) => [key, 0])) as Record<CustomerServiceFoundationResource, number>;
  return { tenantId, initialized: false, created: { ...counts }, existing: { ...counts }, warnings: [] };
}
