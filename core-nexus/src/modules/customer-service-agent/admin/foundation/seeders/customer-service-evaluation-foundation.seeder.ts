import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FOUNDATION_EVALUATION_CASES } from '../templates/customer-service-evaluation-case.template';
import { FOUNDATION_QUALITY_RULES } from '../templates/customer-service-quality-rule.template';
import {
  CustomerServiceEntitySeedMap,
  CustomerServiceFoundationTx,
  CustomerServiceIndustrySeedMap,
} from '../types/foundation-seed.type';
import { CustomerServiceFoundationResult } from '../types/foundation-result.type';

@Injectable()
export class CustomerServiceEvaluationFoundationSeeder {
  async seed(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
    roles: CustomerServiceEntitySeedMap,
    industries: CustomerServiceIndustrySeedMap,
  ) {
    await this.ensureQualityRules(tx, tenantId, userId, result);
    await this.ensureEvaluationCases(tx, tenantId, userId, result, roles, industries);
  }

  private async ensureQualityRules(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
  ) {
    for (const item of FOUNDATION_QUALITY_RULES) {
      const existing = await tx.customerServiceQualityRule.findUnique({
        where: { tenantId_key: { tenantId, key: item.key } },
      });
      if (existing) {
        result.existing.qualityRules += 1;
        continue;
      }
      await tx.customerServiceQualityRule.create({
        data: {
          tenantId,
          key: item.key,
          name: item.name,
          description: item.description,
          category: item.category,
          severity: item.severity,
          ruleType: item.ruleType,
          config: item.config as Prisma.InputJsonValue,
          sort: item.sort,
          status: 'ENABLED',
          createdById: userId,
        },
      });
      result.created.qualityRules += 1;
    }
  }

  private async ensureEvaluationCases(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
    roles: CustomerServiceEntitySeedMap,
    industries: CustomerServiceIndustrySeedMap,
  ) {
    for (const item of FOUNDATION_EVALUATION_CASES) {
      const existing = await tx.customerServiceEvaluationCase.findUnique({
        where: { tenantId_key: { tenantId, key: item.key } },
      });
      if (existing) {
        result.existing.evaluationCases += 1;
        continue;
      }
      const role = roles.get(item.roleCode);
      const industry = industries.get(item.industryCode);
      if (!role || !industry) {
        result.warnings.push(`测试案例“${item.name}”缺少角色或行业节点，未创建。`);
        continue;
      }
      await tx.customerServiceEvaluationCase.create({
        data: {
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
          customerState: 'customerState' in item ? item.customerState as Prisma.InputJsonValue : undefined,
          variables: 'variables' in item ? item.variables as Prisma.InputJsonValue : undefined,
          expectedRequiredPoints: 'expectedRequiredPoints' in item ? item.expectedRequiredPoints as Prisma.InputJsonValue : undefined,
          expectedWorkflowSteps: 'expectedWorkflowSteps' in item ? item.expectedWorkflowSteps as Prisma.InputJsonValue : undefined,
          tags: [...item.tags],
          sort: item.sort,
          status: 'ENABLED',
          createdById: userId,
        },
      });
      result.created.evaluationCases += 1;
    }
  }
}
