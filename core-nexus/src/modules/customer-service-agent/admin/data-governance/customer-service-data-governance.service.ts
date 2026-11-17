import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { CustomerServiceDataGovernanceRepository } from '../../infrastructure/persistence/customer-service-data-governance.repository';
import { RunCustomerServiceDataGovernanceDto } from './dto/run-data-governance.dto';

@Injectable()
export class CustomerServiceDataGovernanceService {
  constructor(private readonly repository: CustomerServiceDataGovernanceRepository) {}

  async overview(user: CurrentUserPayload) {
    const raw = serializeBigInts(await this.repository.overview(resolveRequiredTenantId(user))) as Record<string, any>;
    const growth = Array.isArray(raw.dailyGrowth) ? raw.dailyGrowth : [];
    const observedDays = Math.max(1, growth.length);
    const recentBytes = growth.reduce(
      (sum: number, item: Record<string, unknown>) => sum
        + Number(item.analysisBytes || 0)
        + Number(item.calibrationBytes || 0)
        + Number(item.runtimeReplyBytes || 0)
        + Number(item.replyTraceBytes || 0),
      0,
    );
    const averageDailyBytes = Math.round(recentBytes / observedDays);
    const totalTableBytes = (Array.isArray(raw.tableSizes) ? raw.tableSizes : []).reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.totalBytes || 0), 0);
    const tableCountMap: Record<string, number> = {
      CustomerServiceTuningSession: Number(raw.counts?.sessions || 0),
      CustomerServiceTuningMessage: Number(raw.counts?.messages || 0),
      CustomerServiceTuningAnalysis: Number(raw.counts?.analyses || 0),
      CustomerServiceCalibrationRecord: Number(raw.counts?.calibrationRecords || 0),
      CustomerServiceCalibrationProfile: Number(raw.counts?.calibrationProfiles || 0),
      CustomerServiceIntentCandidate: Number(raw.counts?.intentCandidates || 0),
      CustomerServiceEvaluationCase: Number(raw.counts?.evaluationCases || 0),
      CustomerServiceRuntimeReplyRequest: Number(raw.counts?.runtimeReplyRequests || 0),
      CustomerServiceReplyTrace: Number(raw.counts?.replyTraces || 0),
      CustomerServiceKnowledgeEntry: Number(raw.counts?.knowledgeEntries || 0),
      CustomerServiceKnowledgeRevisionDraft: Number(raw.counts?.knowledgeRevisionDrafts || 0),
    };
    const tableSizes = (Array.isArray(raw.tableSizes) ? raw.tableSizes : []).map((item: Record<string, unknown>) => {
      const recordCount = tableCountMap[String(item.tableName)] || 0;
      return { ...item, recordCount, averagePhysicalRowBytes: recordCount ? Math.round(Number(item.tableBytes || 0) / recordCount) : 0 };
    });
    const warningThresholdBytes = Math.max(64 * 1024 * 1024, Number(process.env.CUSTOMER_SERVICE_GOVERNANCE_WARNING_BYTES || 1_073_741_824));
    return {
      ...raw,
      tableSizes,
      projection: { observedDays, averageDailyBytes, projected30DayBytes: averageDailyBytes * 30, projected90DayBytes: averageDailyBytes * 90 },
      capacity: {
        totalTableBytes,
        warningThresholdBytes,
        status: totalTableBytes >= warningThresholdBytes ? 'WARNING' : 'OK',
        notes: ['逻辑压缩不会立即缩小 PostgreSQL 物理文件；空间复用由 autovacuum/VACUUM 管理。', 'PURGE 默认关闭，校准结论不会被自动硬删除。'],
      },
    };
  }

  async listRuns(user: CurrentUserPayload) {
    return serializeBigInts(await this.repository.listRuns(resolveRequiredTenantId(user)));
  }

  async run(dto: RunCustomerServiceDataGovernanceDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user);
    const running = await this.repository.findRunning(tenantId);
    if (running) throw new ConflictException('已有数据治理任务正在运行，请等待完成或检查失败状态');

    const retentionDays = dto.retentionDays ?? Number(process.env.CUSTOMER_SERVICE_TUNING_RETENTION_DAYS || 180);
    const batchSize = Math.min(1000, Math.max(10, dto.batchSize ?? Number(process.env.CUSTOMER_SERVICE_GOVERNANCE_BATCH_SIZE || 100)));
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    const states = dto.mode === 'COMPACT' ? ['ACTIVE', 'ARCHIVED'] : dto.mode === 'PURGE' ? ['COMPACTED'] : ['ACTIVE'];
    const [candidates, rawCalibrationCandidates, runtimeReplyCandidates, replyTraceCandidates] = await Promise.all([
      this.repository.findAnalysisCandidates(tenantId, before, states, batchSize),
      dto.mode === 'PURGE' ? Promise.resolve([]) : this.repository.findCalibrationCandidates(tenantId, before, states, batchSize),
      ['DRY_RUN', 'PURGE'].includes(dto.mode)
        ? this.repository.findExpiredRuntimeReplyCandidates(tenantId, new Date(), batchSize)
        : Promise.resolve([]),
      this.repository.findReplyTraceCandidates(tenantId, before, states, batchSize),
    ]);
    // 未审核的 OPEN / AI_ANALYZED 记录只能先归档，不能直接压缩其诊断上下文。
    const calibrationCandidates = dto.mode === 'COMPACT'
      ? rawCalibrationCandidates.filter((item) => ['ACCEPTED', 'APPLIED_TUNING', 'ARCHIVED'].includes(item.status))
      : rawCalibrationCandidates;
    const estimatedBytes = [...candidates, ...calibrationCandidates, ...runtimeReplyCandidates, ...replyTraceCandidates]
      .reduce((total, item) => total + Math.max(0, item.payloadBytes), 0);
    const config = {
      retentionDays,
      runtimeIdempotencyRetentionDays: runtimeIdempotencyRetentionDays(),
      batchSize,
      before: before.toISOString(),
      purgeEnabled: purgeEnabled(),
    };
    const run = await this.repository.createRun({
      tenantId,
      mode: dto.mode,
      status: dto.mode === 'DRY_RUN' ? 'SUCCEEDED' : 'RUNNING',
      configurationSnapshot: config as unknown as Prisma.InputJsonValue,
      batchSize,
      candidateCount: candidates.length + calibrationCandidates.length + runtimeReplyCandidates.length + replyTraceCandidates.length,
      estimatedBytes: BigInt(estimatedBytes),
      createdById: user.id,
      startedAt: new Date(),
      ...(dto.mode === 'DRY_RUN' ? {
        finishedAt: new Date(),
        result: {
          analysisCount: candidates.length,
          calibrationCount: calibrationCandidates.length,
          expiredRuntimeReplyCount: runtimeReplyCandidates.length,
          replyTraceCount: replyTraceCandidates.length,
          estimatedBytes,
        },
      } : {}),
    });
    if (dto.mode === 'DRY_RUN') return serializeBigInts(run);

    try {
      let processedCount = 0;
      let releasedBytes = 0;
      if (dto.mode === 'ARCHIVE') {
        const [analysisResult, calibrationResult, replyTraceResult] = await Promise.all([
          this.repository.archiveAnalyses(candidates.map((item) => item.id)),
          this.repository.archiveCalibrationRecords(calibrationCandidates.map((item) => item.id)),
          this.repository.archiveReplyTraces(replyTraceCandidates.map((item: any) => item.id)),
        ]);
        processedCount = analysisResult.count + calibrationResult.count + replyTraceResult.count;
      } else if (dto.mode === 'COMPACT') {
        const safeCalibrationIds = calibrationCandidates.map((item) => item.id);
        const [analysisCount, calibrationResult, replyTraceResult] = await Promise.all([
          this.repository.compactAnalyses(candidates),
          this.repository.compactCalibrationRecords(safeCalibrationIds),
          this.repository.compactReplyTraces(replyTraceCandidates.map((item: any) => item.id)),
        ]);
        processedCount = analysisCount + calibrationResult.count + replyTraceResult.count;
        releasedBytes = estimatedBytes;
      } else if (dto.mode === 'PURGE') {
        if (!purgeEnabled()) throw new ForbiddenException('生产数据 PURGE 默认关闭，必须单独设置 CUSTOMER_SERVICE_GOVERNANCE_PURGE_ENABLED=true');
        if (dto.confirmation !== 'PURGE_COMPACTED_DATA') throw new BadRequestException('PURGE 缺少精确确认文本 PURGE_COMPACTED_DATA');
        const safeIds = candidates.filter((item) => item._count.calibrationRecords === 0).map((item) => item.id);
        const safeReplyTraceIds = replyTraceCandidates
          .filter((item: any) => item._count.calibrationRecords === 0 && item._count.feedbacks === 0)
          .map((item: any) => item.id);
        const [analysisResult, runtimeReplyCount, replyTraceResult] = await Promise.all([
          this.repository.purgeAnalyses(safeIds),
          this.repository.purgeExpiredRuntimeReplyRequests(
            tenantId,
            runtimeReplyCandidates.map((item) => item.id),
            new Date(),
          ),
          this.repository.purgeReplyTraces(tenantId, safeReplyTraceIds),
        ]);
        processedCount = analysisResult.count + runtimeReplyCount + replyTraceResult.count;
        releasedBytes = candidates
          .filter((item) => safeIds.includes(item.id))
          .reduce((total, item) => total + item.payloadBytes, 0)
          + runtimeReplyCandidates.reduce((total, item) => total + item.payloadBytes, 0)
          + replyTraceCandidates
            .filter((item: any) => safeReplyTraceIds.includes(item.id))
            .reduce((total: number, item: any) => total + item.payloadBytes, 0);
      } else if (dto.mode === 'VERIFY') {
        const integrity = await this.repository.verifyIntegrity(tenantId);
        processedCount = candidates.length + calibrationCandidates.length + runtimeReplyCandidates.length + replyTraceCandidates.length;
        const completed = await this.repository.updateRun(run.id, {
          status: 'SUCCEEDED', processedCount, skippedCount: 0, finishedAt: new Date(),
          result: integrity as unknown as Prisma.InputJsonValue,
        });
        return serializeBigInts(completed);
      } else {
        throw new BadRequestException('不支持的数据治理模式');
      }
      const completed = await this.repository.updateRun(run.id, {
        status: 'SUCCEEDED',
        processedCount,
        skippedCount: candidates.length + calibrationCandidates.length + runtimeReplyCandidates.length + replyTraceCandidates.length - processedCount,
        releasedBytes: BigInt(releasedBytes), finishedAt: new Date(),
        result: {
          analysisCandidates: candidates.length,
          calibrationCandidates: calibrationCandidates.length,
          runtimeReplyCandidates: runtimeReplyCandidates.length,
          replyTraceCandidates: replyTraceCandidates.length,
          hasMore: candidates.length === batchSize
            || calibrationCandidates.length === batchSize
            || runtimeReplyCandidates.length === batchSize
            || replyTraceCandidates.length === batchSize,
        } as Prisma.InputJsonValue,
      });
      return serializeBigInts(completed);
    } catch (error) {
      await this.repository.updateRun(run.id, {
        status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error), finishedAt: new Date(),
      });
      throw error;
    }
  }
}

function purgeEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.CUSTOMER_SERVICE_GOVERNANCE_PURGE_ENABLED || '').trim().toLowerCase());
}

function runtimeIdempotencyRetentionDays() {
  const configured = Number(process.env.CUSTOMER_SERVICE_RUNTIME_IDEMPOTENCY_RETENTION_DAYS || 30);
  if (!Number.isFinite(configured)) return 30;
  return Math.min(365, Math.max(7, Math.trunc(configured)));
}

function serializeBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;
}
