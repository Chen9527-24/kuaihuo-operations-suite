import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const GOVERNED_TABLES = [
  'CustomerServiceTuningSession',
  'CustomerServiceTuningMessage',
  'CustomerServiceTuningAnalysis',
  'CustomerServiceCalibrationRecord',
  'CustomerServiceCalibrationProfile',
  'CustomerServiceIntentCandidate',
  'CustomerServiceEvaluationCase',
  'CustomerServiceRuntimeReplyRequest',
  'CustomerServiceReplyTrace',
  'CustomerServiceKnowledgeEntry',
  'CustomerServiceKnowledgeRevisionDraft',
] as const;

@Injectable()
export class CustomerServiceDataGovernanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const [
      sessions, messages, analyses, calibrationRecords, calibrationProfiles, intentCandidates, evaluationCases, knowledgeEntries, knowledgeRevisionDrafts,
      analysisBytes, calibrationBytes, analysisStates, calibrationStates, runtimeReplySummary,
      runtimeReplyStates, replyTraceSummary, replyTraceStates, tableSizes, dailyGrowth, payloadPercentiles,
    ] = await Promise.all([
      this.prisma.customerServiceTuningSession.count({ where: { tenantId } }),
      this.prisma.customerServiceTuningMessage.count({ where: { session: { tenantId } } }),
      this.prisma.customerServiceTuningAnalysis.count({ where: { session: { tenantId } } }),
      this.prisma.customerServiceCalibrationRecord.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.customerServiceCalibrationProfile.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.customerServiceIntentCandidate.count({ where: { tenantId } }),
      this.prisma.customerServiceEvaluationCase.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.customerServiceKnowledgeEntry.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.customerServiceKnowledgeRevisionDraft.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.customerServiceTuningAnalysis.aggregate({ where: { session: { tenantId } }, _sum: { payloadBytes: true }, _avg: { payloadBytes: true }, _max: { payloadBytes: true } }),
      this.prisma.customerServiceCalibrationRecord.aggregate({ where: { tenantId, deletedAt: null }, _sum: { payloadBytes: true }, _avg: { payloadBytes: true }, _max: { payloadBytes: true } }),
      this.prisma.customerServiceTuningAnalysis.groupBy({ by: ['payloadState'], where: { session: { tenantId } }, _count: { _all: true }, _sum: { payloadBytes: true } }),
      this.prisma.customerServiceCalibrationRecord.groupBy({ by: ['payloadState'], where: { tenantId, deletedAt: null }, _count: { _all: true }, _sum: { payloadBytes: true } }),
      this.runtimeReplySummary(tenantId),
      this.runtimeReplyStates(tenantId),
      this.replyTraceSummary(tenantId),
      (this.prisma as any).customerServiceReplyTrace.groupBy({ by: ['payloadState'], where: { tenantId }, _count: { _all: true }, _sum: { payloadBytes: true } }),
      this.tableSizes(),
      this.dailyGrowth(tenantId),
      this.payloadPercentiles(tenantId),
    ]);
    return {
      counts: {
        sessions,
        messages,
        analyses,
        calibrationRecords,
        calibrationProfiles,
        intentCandidates,
        evaluationCases,
        knowledgeEntries,
        knowledgeRevisionDrafts,
        runtimeReplyRequests: Number(runtimeReplySummary[0]?.recordCount || 0n),
        expiredRuntimeReplyRequests: Number(runtimeReplySummary[0]?.expiredTerminalCount || 0n),
        replyTraces: Number(replyTraceSummary[0]?.recordCount || 0n),
      },
      payload: {
        analyses: analysisBytes,
        calibrationRecords: calibrationBytes,
        runtimeReplyRequests: {
          _sum: { payloadBytes: runtimeReplySummary[0]?.payloadBytes || 0n },
          _avg: { payloadBytes: runtimeReplySummary[0]?.averagePayloadBytes || 0n },
          _max: { payloadBytes: runtimeReplySummary[0]?.maxPayloadBytes || 0n },
        },
        replyTraces: {
          _sum: { payloadBytes: replyTraceSummary[0]?.payloadBytes || 0n },
          _avg: { payloadBytes: replyTraceSummary[0]?.averagePayloadBytes || 0n },
          _max: { payloadBytes: replyTraceSummary[0]?.maxPayloadBytes || 0n },
        },
      },
      states: {
        analyses: analysisStates,
        calibrationRecords: calibrationStates,
        runtimeReplyRequests: runtimeReplyStates.map((item) => ({
          payloadState: item.status,
          _count: { _all: Number(item.recordCount || 0n) },
          _sum: { payloadBytes: item.payloadBytes || 0n },
        })),
        replyTraces: replyTraceStates,
      },
      tableSizes,
      dailyGrowth,
      payloadPercentiles,
    };
  }

  listRuns(tenantId: string, take = 20) {
    return this.prisma.customerServiceDataGovernanceRun.findMany({
      where: { tenantId }, orderBy: { createdAt: 'desc' }, take: Math.min(100, Math.max(1, take)),
    });
  }

  findRunning(tenantId: string) {
    return this.prisma.customerServiceDataGovernanceRun.findFirst({ where: { tenantId, status: 'RUNNING' } });
  }

  createRun(data: Prisma.CustomerServiceDataGovernanceRunUncheckedCreateInput) {
    return this.prisma.customerServiceDataGovernanceRun.create({ data });
  }

  updateRun(id: string, data: Prisma.CustomerServiceDataGovernanceRunUncheckedUpdateInput) {
    return this.prisma.customerServiceDataGovernanceRun.update({ where: { id }, data });
  }

  findAnalysisCandidates(tenantId: string, before: Date, states: string[], take: number) {
    return this.prisma.customerServiceTuningAnalysis.findMany({
      where: { session: { tenantId }, createdAt: { lt: before }, payloadState: { in: states } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
      select: { id: true, sessionId: true, summary: true, contentHash: true, configurationHash: true, payloadBytes: true, payloadState: true, createdAt: true, _count: { select: { calibrationRecords: true } } },
    });
  }

  archiveAnalyses(ids: string[]) {
    return this.prisma.customerServiceTuningAnalysis.updateMany({ where: { id: { in: ids }, payloadState: 'ACTIVE' }, data: { payloadState: 'ARCHIVED' } });
  }

  findCalibrationCandidates(tenantId: string, before: Date, states: string[], take: number) {
    return this.prisma.customerServiceCalibrationRecord.findMany({
      where: { tenantId, deletedAt: null, createdAt: { lt: before }, payloadState: { in: states } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take,
      select: {
        id: true, sourceAnalysisId: true, status: true, problemTypes: true, contentHash: true,
        configurationHash: true, payloadBytes: true, payloadState: true, createdAt: true,
      },
    });
  }

  findReplyTraceCandidates(tenantId: string, before: Date, states: string[], take: number) {
    return (this.prisma as any).customerServiceReplyTrace.findMany({
      where: { tenantId, createdAt: { lt: before }, payloadState: { in: states } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        payloadBytes: true,
        payloadState: true,
        contentHash: true,
        configurationHash: true,
        _count: { select: { calibrationRecords: true, feedbacks: true } },
      },
    });
  }

  archiveReplyTraces(ids: string[]) {
    return (this.prisma as any).customerServiceReplyTrace.updateMany({
      where: { id: { in: ids }, payloadState: 'ACTIVE' },
      data: { payloadState: 'ARCHIVED' },
    });
  }

  compactReplyTraces(ids: string[]) {
    return (this.prisma as any).customerServiceReplyTrace.updateMany({
      where: { id: { in: ids }, payloadState: { in: ['ACTIVE', 'ARCHIVED'] } },
      data: {
        customerMessage: '[内容已按保留策略压缩]',
        replySegments: [],
        finalReply: '',
        conversationSnapshot: Prisma.JsonNull,
        runtimeContract: Prisma.JsonNull,
        generationDetails: Prisma.JsonNull,
        postContext: null,
        understandingSummary: Prisma.JsonNull,
        qualityReport: Prisma.JsonNull,
        payloadState: 'COMPACTED',
        payloadBytes: 0,
        compactedAt: new Date(),
      },
    });
  }

  purgeReplyTraces(tenantId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve({ count: 0 });
    return (this.prisma as any).customerServiceReplyTrace.deleteMany({
      where: {
        tenantId,
        id: { in: ids },
        payloadState: 'COMPACTED',
        calibrationRecords: { none: {} },
        feedbacks: { none: {} },
      },
    });
  }

  findExpiredRuntimeReplyCandidates(tenantId: string, before: Date, take: number) {
    return this.prisma.$queryRaw<Array<{ id: string; payloadBytes: number }>>(Prisma.sql`
      SELECT "id",
             octet_length(COALESCE("response"::text, ''))::integer AS "payloadBytes"
      FROM "CustomerServiceRuntimeReplyRequest"
      WHERE "tenantId" = ${tenantId}
        AND "expiresAt" < ${before}
        AND "status" IN ('SUCCEEDED', 'FAILED')
      ORDER BY "expiresAt" ASC, "id" ASC
      LIMIT ${take}
    `);
  }

  archiveCalibrationRecords(ids: string[]) {
    return this.prisma.customerServiceCalibrationRecord.updateMany({
      where: { id: { in: ids }, payloadState: 'ACTIVE', deletedAt: null },
      data: { payloadState: 'ARCHIVED' },
    });
  }

  compactCalibrationRecords(ids: string[]) {
    return this.prisma.customerServiceCalibrationRecord.updateMany({
      where: { id: { in: ids }, payloadState: { in: ['ACTIVE', 'ARCHIVED'] }, deletedAt: null },
      data: {
        understanding: Prisma.JsonNull,
        runtimeContract: Prisma.JsonNull,
        qualityReport: Prisma.JsonNull,
        sourceSnapshot: Prisma.JsonNull,
        payloadState: 'COMPACTED',
        payloadBytes: 0,
        compactedAt: new Date(),
      },
    });
  }

  async compactAnalyses(items: Array<{ id: string; summary: unknown; contentHash: string | null; configurationHash: string | null }>) {
    let count = 0;
    for (const item of items) {
      const marker = {
        _compacted: true,
        summary: item.summary,
        contentHash: item.contentHash,
        configurationHash: item.configurationHash,
      } as Prisma.InputJsonValue;
      const result = await this.prisma.customerServiceTuningAnalysis.updateMany({
        where: { id: item.id, payloadState: { in: ['ACTIVE', 'ARCHIVED'] } },
        data: {
          understanding: marker,
          runtimeContract: marker,
          generation: Prisma.JsonNull,
          quality: Prisma.JsonNull,
          warnings: Prisma.JsonNull,
          payloadState: 'COMPACTED',
          payloadBytes: Buffer.byteLength(JSON.stringify(marker), 'utf8') * 2,
          compactedAt: new Date(),
        },
      });
      count += result.count;
    }
    return count;
  }

  purgeAnalyses(ids: string[]) {
    return this.prisma.customerServiceTuningAnalysis.deleteMany({
      where: { id: { in: ids }, payloadState: 'COMPACTED', calibrationRecords: { none: {} } },
    });
  }

  purgeExpiredRuntimeReplyRequests(tenantId: string, ids: string[], before: Date) {
    if (!ids.length) return Promise.resolve(0);
    return this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "CustomerServiceRuntimeReplyRequest"
      WHERE "tenantId" = ${tenantId}
        AND "id" IN (${Prisma.join(ids)})
        AND "expiresAt" < ${before}
        AND "status" IN ('SUCCEEDED', 'FAILED')
    `);
  }

  async verifyIntegrity(tenantId: string) {
    const [
      analysisMissingHash,
      calibrationMissingHash,
      calibrationSourceCount,
      duplicateCalibrationHashes,
      runtimeReplyIntegrity,
      replyTraceMissingHash,
    ] = await Promise.all([
      this.prisma.customerServiceTuningAnalysis.count({ where: { session: { tenantId }, payloadState: { not: 'PURGED' }, contentHash: null } }),
      this.prisma.customerServiceCalibrationRecord.count({ where: { tenantId, deletedAt: null, payloadState: { not: 'PURGED' }, contentHash: null } }),
      this.prisma.customerServiceCalibrationRecord.count({ where: { tenantId, deletedAt: null, sourceAnalysisId: { not: null } } }),
      this.prisma.$queryRaw<Array<{ duplicateGroups: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS "duplicateGroups" FROM (
          SELECT "contentHash" FROM "CustomerServiceCalibrationRecord"
          WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND "contentHash" IS NOT NULL
          GROUP BY "contentHash" HAVING count(*) > 1
        ) duplicates
      `),
      this.prisma.$queryRaw<Array<{ staleProcessingCount: bigint; expiredTerminalCount: bigint }>>(Prisma.sql`
        SELECT
          count(*) FILTER (
            WHERE "status" = 'PROCESSING'
              AND "updatedAt" < now() - interval '10 minutes'
          )::bigint AS "staleProcessingCount",
          count(*) FILTER (
            WHERE "status" IN ('SUCCEEDED', 'FAILED')
              AND "expiresAt" < now()
          )::bigint AS "expiredTerminalCount"
        FROM "CustomerServiceRuntimeReplyRequest"
        WHERE "tenantId" = ${tenantId}
      `),
      (this.prisma as any).customerServiceReplyTrace.count({ where: { tenantId, payloadState: { not: 'PURGED' }, contentHash: '' } }),
    ]);
    return {
      analysisMissingHash,
      calibrationMissingHash,
      calibrationSourceCount,
      duplicateCalibrationHashGroups: Number(duplicateCalibrationHashes[0]?.duplicateGroups || 0n),
      staleRuntimeReplyProcessingCount: Number(runtimeReplyIntegrity[0]?.staleProcessingCount || 0n),
      expiredRuntimeReplyTerminalCount: Number(runtimeReplyIntegrity[0]?.expiredTerminalCount || 0n),
      replyTraceMissingHash,
    };
  }

  private runtimeReplySummary(tenantId: string) {
    return this.prisma.$queryRaw<Array<{
      recordCount: bigint;
      payloadBytes: bigint;
      averagePayloadBytes: bigint;
      maxPayloadBytes: bigint;
      expiredTerminalCount: bigint;
    }>>(Prisma.sql`
      SELECT
        count(*)::bigint AS "recordCount",
        COALESCE(sum(octet_length(COALESCE("response"::text, ''))), 0)::bigint AS "payloadBytes",
        COALESCE(avg(octet_length(COALESCE("response"::text, ''))), 0)::bigint AS "averagePayloadBytes",
        COALESCE(max(octet_length(COALESCE("response"::text, ''))), 0)::bigint AS "maxPayloadBytes",
        count(*) FILTER (
          WHERE "status" IN ('SUCCEEDED', 'FAILED') AND "expiresAt" < now()
        )::bigint AS "expiredTerminalCount"
      FROM "CustomerServiceRuntimeReplyRequest"
      WHERE "tenantId" = ${tenantId}
    `);
  }

  private replyTraceSummary(tenantId: string) {
    return this.prisma.$queryRaw<Array<{
      recordCount: bigint;
      payloadBytes: bigint;
      averagePayloadBytes: bigint;
      maxPayloadBytes: bigint;
    }>>(Prisma.sql`
      SELECT count(*)::bigint AS "recordCount",
             COALESCE(sum("payloadBytes"), 0)::bigint AS "payloadBytes",
             COALESCE(avg("payloadBytes"), 0)::bigint AS "averagePayloadBytes",
             COALESCE(max("payloadBytes"), 0)::bigint AS "maxPayloadBytes"
      FROM "CustomerServiceReplyTrace"
      WHERE "tenantId" = ${tenantId}
    `);
  }

  private runtimeReplyStates(tenantId: string) {
    return this.prisma.$queryRaw<Array<{
      status: string;
      recordCount: bigint;
      payloadBytes: bigint;
    }>>(Prisma.sql`
      SELECT "status",
             count(*)::bigint AS "recordCount",
             COALESCE(sum(octet_length(COALESCE("response"::text, ''))), 0)::bigint AS "payloadBytes"
      FROM "CustomerServiceRuntimeReplyRequest"
      WHERE "tenantId" = ${tenantId}
      GROUP BY "status"
      ORDER BY "status"
    `);
  }

  private tableSizes() {
    const names = GOVERNED_TABLES.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');
    return this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT c.relname AS "tableName",
             pg_total_relation_size(c.oid)::bigint AS "totalBytes",
             pg_relation_size(c.oid)::bigint AS "tableBytes",
             pg_indexes_size(c.oid)::bigint AS "indexBytes",
             COALESCE(pg_total_relation_size(c.reltoastrelid), 0)::bigint AS "toastBytes"
      FROM pg_class c
      WHERE c.relname IN (${names})
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);
  }

  private dailyGrowth(tenantId: string) {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH growth AS (
        SELECT date_trunc('day', a."createdAt") AS day,
               count(*)::bigint AS "analysisCount",
               COALESCE(sum(a."payloadBytes"), 0)::bigint AS "analysisBytes",
               0::bigint AS "calibrationCount", 0::bigint AS "calibrationBytes",
               0::bigint AS "runtimeReplyCount", 0::bigint AS "runtimeReplyBytes",
               0::bigint AS "replyTraceCount", 0::bigint AS "replyTraceBytes"
        FROM "CustomerServiceTuningAnalysis" a
        JOIN "CustomerServiceTuningSession" s ON s.id = a."sessionId"
        WHERE s."tenantId" = ${tenantId} AND a."createdAt" >= now() - interval '30 days'
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', c."createdAt") AS day,
               0::bigint, 0::bigint, count(*)::bigint,
               COALESCE(sum(c."payloadBytes"), 0)::bigint,
               0::bigint, 0::bigint, 0::bigint, 0::bigint
        FROM "CustomerServiceCalibrationRecord" c
        WHERE c."tenantId" = ${tenantId} AND c."deletedAt" IS NULL AND c."createdAt" >= now() - interval '30 days'
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', r."createdAt") AS day,
               0::bigint, 0::bigint, 0::bigint, 0::bigint,
               count(*)::bigint,
               COALESCE(sum(octet_length(COALESCE(r."response"::text, ''))), 0)::bigint,
               0::bigint, 0::bigint
        FROM "CustomerServiceRuntimeReplyRequest" r
        WHERE r."tenantId" = ${tenantId} AND r."createdAt" >= now() - interval '30 days'
        GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', t."createdAt") AS day,
               0::bigint, 0::bigint, 0::bigint, 0::bigint,
               0::bigint, 0::bigint, count(*)::bigint,
               COALESCE(sum(t."payloadBytes"), 0)::bigint
        FROM "CustomerServiceReplyTrace" t
        WHERE t."tenantId" = ${tenantId} AND t."createdAt" >= now() - interval '30 days'
        GROUP BY 1
      )
      SELECT day AS "day", sum("analysisCount")::bigint AS "analysisCount",
             sum("analysisBytes")::bigint AS "analysisBytes",
             sum("calibrationCount")::bigint AS "calibrationCount",
             sum("calibrationBytes")::bigint AS "calibrationBytes",
             sum("runtimeReplyCount")::bigint AS "runtimeReplyCount",
             sum("runtimeReplyBytes")::bigint AS "runtimeReplyBytes",
             sum("replyTraceCount")::bigint AS "replyTraceCount",
             sum("replyTraceBytes")::bigint AS "replyTraceBytes"
      FROM growth GROUP BY day ORDER BY day
    `);
  }

  private payloadPercentiles(tenantId: string) {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE((SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY a."payloadBytes")
          FROM "CustomerServiceTuningAnalysis" a JOIN "CustomerServiceTuningSession" s ON s.id = a."sessionId"
          WHERE s."tenantId" = ${tenantId}), 0)::bigint AS "analysisP95Bytes",
        COALESCE((SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY c."payloadBytes")
          FROM "CustomerServiceCalibrationRecord" c
          WHERE c."tenantId" = ${tenantId} AND c."deletedAt" IS NULL), 0)::bigint AS "calibrationP95Bytes",
        COALESCE((SELECT percentile_cont(0.95) WITHIN GROUP (
          ORDER BY octet_length(COALESCE(r."response"::text, ''))
        ) FROM "CustomerServiceRuntimeReplyRequest" r
          WHERE r."tenantId" = ${tenantId}), 0)::bigint AS "runtimeReplyP95Bytes",
        COALESCE((SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY t."payloadBytes")
          FROM "CustomerServiceReplyTrace" t WHERE t."tenantId" = ${tenantId}), 0)::bigint AS "replyTraceP95Bytes"
    `);
  }
}
