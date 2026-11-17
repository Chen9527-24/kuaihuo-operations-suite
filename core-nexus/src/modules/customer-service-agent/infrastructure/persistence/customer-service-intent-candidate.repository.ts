import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerServiceRecognizedItem } from '../../runtime/understanding/types/customer-service-message-understanding.type';

export type CollectIntentCandidateContext = {
  tenantId: string;
  merchantRoleId: string;
  industryNodeId: string | null;
  industryCode: string | null;
  latestMessage: string;
  recognitionSessionId: string | null;
  conversationHistory: Array<{ role: string; content: string }>;
  recognizedItems: CustomerServiceRecognizedItem[];
  understandingSnapshot: unknown;
};

@Injectable()
export class CustomerServiceIntentCandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.CustomerServiceIntentCandidateWhereInput, skip: number, take: number) {
    return this.prisma.customerServiceIntentCandidate.findMany({
      where,
      skip,
      take,
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }, { occurrenceCount: 'desc' }],
    });
  }

  count(where: Prisma.CustomerServiceIntentCandidateWhereInput) {
    return this.prisma.customerServiceIntentCandidate.count({ where });
  }

  findScoped(id: string, tenantId: string) {
    return this.prisma.customerServiceIntentCandidate.findFirst({ where: { id, tenantId } });
  }

  async collect(context: CollectIntentCandidateContext) {
    const collectable = context.recognizedItems.filter(
      (item) => item.type === 'INTENT'
        && item.scope === 'CONVERSATION'
        && item.eligibleForIntentLibrary
        && item.matchStatus !== 'EXACT'
        && item.evidence.length > 0
        && item.confidence >= (item.isPrimary ? 0.58 : 0.72),
    );
    const result = new Map<string, Awaited<ReturnType<CustomerServiceIntentCandidateRepository['collectOne']>>>();
    for (const item of collectable) {
      const candidate = await this.collectOne(context, item);
      result.set(item.recognitionId, candidate);
    }
    return context.recognizedItems.map((item) => {
      const candidate = result.get(item.recognitionId);
      return candidate
        ? {
            ...item,
            candidate: {
              id: candidate.id,
              status: candidate.status as 'PENDING' | 'CONVERTED' | 'IGNORED',
              occurrenceCount: candidate.occurrenceCount,
              averageConfidence: candidate.occurrenceCount > 0
                ? Number((candidate.confidenceSum / candidate.occurrenceCount).toFixed(4))
                : candidate.latestConfidence,
              convertedDefinitionId: candidate.convertedDefinitionId,
            },
          }
        : item;
    });
  }

  private async collectOne(context: CollectIntentCandidateContext, item: CustomerServiceRecognizedItem) {
    const fingerprint = buildCandidateFingerprint(item);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.customerServiceIntentCandidate.findUnique({
        where: { tenantId_fingerprint: { tenantId: context.tenantId, fingerprint } },
      });
      const sampleFingerprint = buildSampleFingerprint(context);
      const sample = {
        fingerprint: sampleFingerprint,
        message: context.latestMessage,
        conversationHistory: context.conversationHistory.slice(-12),
        confidence: item.confidence,
        evidence: item.evidence,
        observedAt: new Date().toISOString(),
      };
      const sourceContext = {
        merchantRoleId: context.merchantRoleId,
        industryNodeId: context.industryNodeId,
        industryCode: context.industryCode,
        recognitionSessionId: context.recognitionSessionId,
        latestUnderstanding: context.understandingSnapshot,
      } as Prisma.InputJsonValue;

      if (!existing) {
        return tx.customerServiceIntentCandidate.create({
          data: {
            tenantId: context.tenantId,
            fingerprint,
            recognitionKey: item.key,
            name: item.name,
            description: item.description,
            suggestedCategory: item.suggestedCategory,
            suggestedScenario: item.suggestedScenario,
            suggestedPrimaryIntent: item.suggestedPrimaryIntent,
            suggestedRiskLevel: item.suggestedRiskLevel,
            observedIndustryCodes: context.industryCode ? [context.industryCode] : [],
            status: 'PENDING',
            occurrenceCount: 1,
            confidenceSum: item.confidence,
            maxConfidence: item.confidence,
            latestConfidence: item.confidence,
            evidence: item.evidence as Prisma.InputJsonValue,
            samples: [sample] as Prisma.InputJsonValue,
            sourceContext,
            relatedDefinitionId: item.matchStatus === 'RELATED' ? item.matchedDefinition?.id || null : null,
          },
        });
      }

      const evidence = uniqueStrings([...jsonStringArray(existing.evidence), ...item.evidence]).slice(0, 30);
      const previousSamples = jsonObjectArray(existing.samples);
      const duplicateSample = previousSamples.some((entry) => String(entry.fingerprint || '') === sampleFingerprint);
      const samples = duplicateSample ? previousSamples : [...previousSamples, sample].slice(-12);
      return tx.customerServiceIntentCandidate.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          description: item.description,
          suggestedCategory: item.suggestedCategory,
          suggestedScenario: item.suggestedScenario,
          suggestedPrimaryIntent: item.suggestedPrimaryIntent,
          suggestedRiskLevel: item.suggestedRiskLevel,
          observedIndustryCodes: context.industryCode ? uniqueStrings([...existing.observedIndustryCodes, context.industryCode]) : existing.observedIndustryCodes,
          ...(duplicateSample ? {} : {
            occurrenceCount: { increment: 1 },
            confidenceSum: { increment: item.confidence },
          }),
          maxConfidence: Math.max(existing.maxConfidence, item.confidence),
          latestConfidence: item.confidence,
          evidence: evidence as Prisma.InputJsonValue,
          samples: samples as Prisma.InputJsonValue,
          sourceContext,
          relatedDefinitionId: item.matchStatus === 'RELATED' ? item.matchedDefinition?.id || existing.relatedDefinitionId : existing.relatedDefinitionId,
          lastSeenAt: new Date(),
        },
      });
    });
  }

  markConverted(id: string, tenantId: string, convertedDefinitionId: string) {
    return this.prisma.customerServiceIntentCandidate.updateMany({
      where: { id, tenantId },
      data: { status: 'CONVERTED', convertedDefinitionId },
    });
  }

  setStatus(id: string, tenantId: string, status: 'PENDING' | 'IGNORED') {
    return this.prisma.customerServiceIntentCandidate.updateMany({
      where: { id, tenantId },
      data: { status },
    });
  }
}

export function buildCandidateFingerprint(item: CustomerServiceRecognizedItem) {
  return [item.key, item.scope, item.suggestedScenario, item.suggestedPrimaryIntent]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|')
    .slice(0, 160);
}

function buildSampleFingerprint(context: CollectIntentCandidateContext) {
  const source = `${context.recognitionSessionId || 'no-session'}|${context.conversationHistory.length}|${context.latestMessage.trim()}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
function jsonObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}
function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
