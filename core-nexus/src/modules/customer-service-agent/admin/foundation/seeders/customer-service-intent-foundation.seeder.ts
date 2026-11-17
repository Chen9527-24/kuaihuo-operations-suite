import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FOUNDATION_INTENT_DEFINITIONS } from '../templates/customer-service-intent-definition.template';
import { CustomerServiceFoundationResult } from '../types/foundation-result.type';
import { CustomerServiceFoundationTx } from '../types/foundation-seed.type';

@Injectable()
export class CustomerServiceIntentFoundationSeeder {
  async seed(
    tx: CustomerServiceFoundationTx,
    tenantId: string,
    userId: string,
    result: CustomerServiceFoundationResult,
  ) {
    for (const item of FOUNDATION_INTENT_DEFINITIONS) {
      const existing = await tx.customerServiceIntentDefinition.findUnique({
        where: { tenantId_key: { tenantId, key: item.key } },
      });
      if (existing) {
        result.existing.intentDefinitions += 1;
        const existingStrategy = asRecord(existing.strategyConfig);
        const templateStrategy = asRecord(item.strategyConfig);
        if (!existingStrategy.strategyPolicy && templateStrategy.strategyPolicy) {
          await tx.customerServiceIntentDefinition.update({
            where: { id: existing.id },
            data: {
              strategyConfig: { ...existingStrategy, strategyPolicy: templateStrategy.strategyPolicy } as Prisma.InputJsonValue,
              updatedById: userId,
              revision: { increment: 1 },
            },
          });
        }
        continue;
      }
      await tx.customerServiceIntentDefinition.create({
        data: {
          tenantId,
          key: item.key,
          name: item.name,
          category: item.category,
          description: item.description,
          scenario: item.scenario,
          primaryIntent: item.primaryIntent,
          defaultRiskLevel: item.defaultRiskLevel,
          supportedIndustryCodes: [...item.supportedIndustryCodes],
          recognitionConfig: item.recognitionConfig as Prisma.InputJsonValue,
          strategyConfig: item.strategyConfig as Prisma.InputJsonValue,
          flowConfig: item.flowConfig as Prisma.InputJsonValue,
          replyConfig: item.replyConfig as Prisma.InputJsonValue,
          examples: item.examples as Prisma.InputJsonValue,
          priority: item.priority,
          sort: item.sort,
          status: 'ENABLED',
          createdById: userId,
        },
      });
      result.created.intentDefinitions += 1;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
