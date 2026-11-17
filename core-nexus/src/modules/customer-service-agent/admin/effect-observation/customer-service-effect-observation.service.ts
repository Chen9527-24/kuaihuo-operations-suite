import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { resolveRequiredTenantId } from '../../../../common/utils/tenant-scope';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerServiceEffectObservationQueryDto } from './dto/effect-observation-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const TRACE_SAMPLE_LIMIT = 5000;
const TARGET_SAMPLE_LIMIT = 2500;

type TraceFeedback = { feedback: string };
export type EffectTraceRow = {
  id: string;
  createdAt: Date;
  qualityStatus: string;
  safetyStatus: string;
  fallbackUsed: boolean;
  strategyVersionIds: string[];
  knowledgeEntryIds: string[];
  sourceRevisions: unknown;
  feedbacks: TraceFeedback[];
};


type StrategyVersionMetadata = {
  id: string;
  versionNo: number;
  title: string;
  status: string;
  publishedAt: Date | null;
  asset: {
    id: string;
    name: string;
    currentVersionId: string | null;
    revision: number;
  };
};

type KnowledgeEntryMetadata = {
  id: string;
  title: string;
  status: string;
  revision: number;
  scopeType: string;
  scopeKey: string;
  sourceType: string;
  updatedAt: Date;
};

export type EffectMetrics = {
  totalReplies: number;
  feedbackReplies: number;
  satisfiedReplies: number;
  unsatisfiedReplies: number;
  satisfactionRate: number | null;
  feedbackCoverageRate: number;
  qualityEvaluatedReplies: number;
  qualityPassedReplies: number;
  qualityPassRate: number;
  safetyEvaluatedReplies: number;
  safetyPassedReplies: number;
  safetyPassRate: number;
  fallbackReplies: number;
  fallbackRate: number;
};

export function summarizeEffectTraces(rows: EffectTraceRow[]): EffectMetrics {
  let feedbackReplies = 0;
  let satisfiedReplies = 0;
  let unsatisfiedReplies = 0;
  let qualityEvaluatedReplies = 0;
  let qualityPassedReplies = 0;
  let safetyEvaluatedReplies = 0;
  let safetyPassedReplies = 0;
  let fallbackReplies = 0;
  for (const row of rows) {
    const feedback = resolveTraceFeedback(row.feedbacks);
    if (feedback) {
      feedbackReplies += 1;
      if (feedback === 'UNSATISFIED') unsatisfiedReplies += 1;
      else satisfiedReplies += 1;
    }
    if (row.qualityStatus !== 'NOT_RUN') qualityEvaluatedReplies += 1;
    if (row.qualityStatus === 'PASSED') qualityPassedReplies += 1;
    if (row.safetyStatus !== 'NOT_RUN') safetyEvaluatedReplies += 1;
    if (row.safetyStatus === 'PASSED') safetyPassedReplies += 1;
    if (row.fallbackUsed) fallbackReplies += 1;
  }
  const totalReplies = rows.length;
  return {
    totalReplies,
    feedbackReplies,
    satisfiedReplies,
    unsatisfiedReplies,
    satisfactionRate: feedbackReplies ? roundRate(satisfiedReplies, feedbackReplies) : null,
    feedbackCoverageRate: roundRate(feedbackReplies, totalReplies),
    qualityEvaluatedReplies,
    qualityPassedReplies,
    qualityPassRate: roundRate(qualityPassedReplies, qualityEvaluatedReplies),
    safetyEvaluatedReplies,
    safetyPassedReplies,
    safetyPassRate: roundRate(safetyPassedReplies, safetyEvaluatedReplies),
    fallbackReplies,
    fallbackRate: roundRate(fallbackReplies, totalReplies),
  };
}

export function buildEffectObservation(before: EffectMetrics, after: EffectMetrics) {
  const satisfactionDelta = nullableDelta(after.satisfactionRate, before.satisfactionRate);
  const qualityPassDelta = roundNumber(after.qualityPassRate - before.qualityPassRate);
  const fallbackDelta = roundNumber(after.fallbackRate - before.fallbackRate);
  let status: 'INSUFFICIENT' | 'WARNING' | 'POSITIVE' | 'STABLE' = 'STABLE';
  let message = '当前窗口未发现明显退化；仍需结合投诉、事实错误和人工抽查判断。';
  if (after.feedbackReplies < 5) {
    status = 'INSUFFICIENT';
    message = '发布后有效反馈少于 5 条，证据不足，暂不建议据此扩大范围或回滚。';
  } else if ((satisfactionDelta !== null && satisfactionDelta <= -10) || qualityPassDelta <= -10 || fallbackDelta >= 10) {
    status = 'WARNING';
    message = '发布后窗口出现明显退化信号，建议先检查命中范围和失败样本，再决定是否回滚。';
  } else if (satisfactionDelta !== null && satisfactionDelta >= 10 && qualityPassDelta >= 0 && fallbackDelta <= 0) {
    status = 'POSITIVE';
    message = '发布后窗口出现改善信号；该统计仅用于观察，不代表单一配置与效果之间存在确定因果。';
  }
  return { status, message, satisfactionDelta, qualityPassDelta, fallbackDelta, causalDisclaimer: '相邻窗口对比只用于运营观察，不构成因果证明。' };
}

@Injectable()
export class CustomerServiceEffectObservationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: CustomerServiceEffectObservationQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, query.tenantId);
    const days = query.days ?? 30;
    const compareDays = query.compareDays ?? 7;
    const account = await this.prisma.customerServiceAccountProfile.findFirst({
      where: { id: query.accountProfileId, tenantId, deletedAt: null },
      select: { id: true, name: true, storeProfileId: true, status: true },
    });
    if (!account) throw new NotFoundException('账号资料不存在或不属于当前租户');

    const now = new Date();
    const currentStart = new Date(now.getTime() - days * DAY_MS);
    const previousStart = new Date(currentStart.getTime() - days * DAY_MS);
    const [currentLoaded, previousLoaded] = await Promise.all([
      this.loadTraces(tenantId, account.id, currentStart, now, TRACE_SAMPLE_LIMIT),
      this.loadTraces(tenantId, account.id, previousStart, currentStart, TRACE_SAMPLE_LIMIT),
    ]);
    const currentMetrics = summarizeEffectTraces(currentLoaded.rows);
    const previousMetrics = summarizeEffectTraces(previousLoaded.rows);
    const strategyGroups = groupStrategyVersions(currentLoaded.rows);
    const knowledgeGroups = groupKnowledgeRevisions(currentLoaded.rows);
    const [strategyVersions, knowledgeEntries] = await Promise.all([
      this.loadStrategyMetadata(tenantId, [...strategyGroups.keys()]),
      this.loadKnowledgeMetadata(tenantId, [...new Set([...knowledgeGroups.values()].map((item) => item.entryId))]),
    ]);

    return {
      account,
      window: {
        days,
        currentStart: currentStart.toISOString(),
        currentEnd: now.toISOString(),
        previousStart: previousStart.toISOString(),
        previousEnd: currentStart.toISOString(),
        sampleLimit: TRACE_SAMPLE_LIMIT,
        currentTotal: currentLoaded.total,
        previousTotal: previousLoaded.total,
        currentSampled: currentLoaded.total > currentLoaded.rows.length,
        previousSampled: previousLoaded.total > previousLoaded.rows.length,
      },
      current: currentMetrics,
      previous: previousMetrics,
      periodObservation: buildEffectObservation(previousMetrics, currentMetrics),
      dailyTrend: buildDailyTrend(currentLoaded.rows),
      strategyVersionHits: buildStrategyHitRows(strategyGroups, strategyVersions),
      knowledgeVersionHits: buildKnowledgeHitRows(knowledgeGroups, knowledgeEntries),
      targetObservation: await this.buildTargetObservation({
        tenantId,
        accountId: account.id,
        compareDays,
        now,
        strategyVersionId: query.strategyVersionId,
        knowledgeEntryId: query.knowledgeEntryId,
      }),
    };
  }

  private async buildTargetObservation(input: {
    tenantId: string;
    accountId: string;
    compareDays: number;
    now: Date;
    strategyVersionId?: string;
    knowledgeEntryId?: string;
  }) {
    if (input.strategyVersionId) {
      const version = await (this.prisma.customerServiceAssetVersion as any).findFirst({
        where: { id: input.strategyVersionId, asset: { tenantId: input.tenantId, deletedAt: null } },
        include: { asset: { select: { id: true, name: true, currentVersionId: true, revision: true } } },
      });
      if (!version) throw new NotFoundException('策略版本不存在或不属于当前租户');
      const anchor = version.publishedAt || version.createdAt;
      const beforeStart = new Date(anchor.getTime() - input.compareDays * DAY_MS);
      const afterEnd = new Date(Math.min(input.now.getTime(), anchor.getTime() + input.compareDays * DAY_MS));
      const [before, after] = await Promise.all([
        this.loadTraces(input.tenantId, input.accountId, beforeStart, anchor, TARGET_SAMPLE_LIMIT),
        this.loadTraces(input.tenantId, input.accountId, anchor, afterEnd, TARGET_SAMPLE_LIMIT, { strategyVersionId: version.id }),
      ]);
      const beforeMetrics = summarizeEffectTraces(before.rows);
      const afterMetrics = summarizeEffectTraces(after.rows);
      const rollbackCandidates = await (this.prisma.customerServiceAssetVersion as any).findMany({
        where: { assetId: version.assetId, id: { not: version.id }, status: 'ARCHIVED' },
        select: { id: true, versionNo: true, title: true, publishedAt: true },
        orderBy: { versionNo: 'desc' },
        take: 10,
      });
      return {
        type: 'STRATEGY_VERSION',
        target: {
          id: version.id,
          assetId: version.assetId,
          assetName: version.asset.name,
          assetRevision: version.asset.revision,
          versionNo: version.versionNo,
          title: version.title,
          status: version.status,
          publishedAt: version.publishedAt,
          isCurrent: version.asset.currentVersionId === version.id,
        },
        window: targetWindow(anchor, afterEnd, beforeStart, input.compareDays, input.now),
        before: beforeMetrics,
        after: afterMetrics,
        observation: buildEffectObservation(beforeMetrics, afterMetrics),
        rollbackCandidates,
      };
    }
    if (input.knowledgeEntryId) {
      const entry = await this.prisma.customerServiceKnowledgeEntry.findFirst({
        where: { id: input.knowledgeEntryId, tenantId: input.tenantId, deletedAt: null },
        select: { id: true, title: true, revision: true, status: true, scopeType: true, scopeKey: true, updatedAt: true, sourceType: true },
      });
      if (!entry) throw new NotFoundException('知识条目不存在或不属于当前租户');
      const anchor = entry.updatedAt;
      const beforeStart = new Date(anchor.getTime() - input.compareDays * DAY_MS);
      const afterEnd = new Date(Math.min(input.now.getTime(), anchor.getTime() + input.compareDays * DAY_MS));
      const [before, afterLoaded] = await Promise.all([
        this.loadTraces(input.tenantId, input.accountId, beforeStart, anchor, TARGET_SAMPLE_LIMIT),
        this.loadTraces(input.tenantId, input.accountId, anchor, afterEnd, TARGET_SAMPLE_LIMIT, { knowledgeEntryId: entry.id }),
      ]);
      const afterRows = afterLoaded.rows.filter((row) => readKnowledgeRevision(row.sourceRevisions, entry.id) === entry.revision);
      const beforeMetrics = summarizeEffectTraces(before.rows);
      const afterMetrics = summarizeEffectTraces(afterRows);
      return {
        type: 'KNOWLEDGE_REVISION',
        target: entry,
        window: targetWindow(anchor, afterEnd, beforeStart, input.compareDays, input.now),
        before: beforeMetrics,
        after: afterMetrics,
        observation: buildEffectObservation(beforeMetrics, afterMetrics),
        rollbackCandidates: [],
      };
    }
    return null;
  }

  private async loadTraces(
    tenantId: string,
    accountProfileId: string,
    start: Date,
    end: Date,
    limit: number,
    target?: { strategyVersionId?: string; knowledgeEntryId?: string },
  ): Promise<{ rows: EffectTraceRow[]; total: number }> {
    const where: any = {
      tenantId,
      accountProfileId,
      createdAt: { gte: start, lt: end },
      purgedAt: null,
      ...(target?.strategyVersionId ? { strategyVersionIds: { has: target.strategyVersionId } } : {}),
      ...(target?.knowledgeEntryId ? { knowledgeEntryIds: { has: target.knowledgeEntryId } } : {}),
    };
    const [rows, total] = await Promise.all([
      (this.prisma.customerServiceReplyTrace as any).findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          qualityStatus: true,
          safetyStatus: true,
          fallbackUsed: true,
          strategyVersionIds: true,
          knowledgeEntryIds: true,
          sourceRevisions: true,
          feedbacks: { select: { feedback: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      (this.prisma.customerServiceReplyTrace as any).count({ where }),
    ]);
    return { rows, total };
  }

  private async loadStrategyMetadata(tenantId: string, ids: string[]): Promise<Map<string, StrategyVersionMetadata>> {
    if (!ids.length) return new Map<string, StrategyVersionMetadata>();
    const rows: StrategyVersionMetadata[] = await (this.prisma.customerServiceAssetVersion as any).findMany({
      where: { id: { in: ids }, asset: { tenantId, deletedAt: null } },
      select: {
        id: true, versionNo: true, title: true, status: true, publishedAt: true,
        asset: { select: { id: true, name: true, currentVersionId: true, revision: true } },
      },
    });
    return new Map<string, StrategyVersionMetadata>(rows.map((row) => [row.id, row]));
  }

  private async loadKnowledgeMetadata(tenantId: string, ids: string[]): Promise<Map<string, KnowledgeEntryMetadata>> {
    if (!ids.length) return new Map<string, KnowledgeEntryMetadata>();
    const rows = await this.prisma.customerServiceKnowledgeEntry.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: { id: true, title: true, status: true, revision: true, scopeType: true, scopeKey: true, sourceType: true, updatedAt: true },
    });
    return new Map<string, KnowledgeEntryMetadata>(rows.map((row) => [row.id, row]));
  }
}

function resolveTraceFeedback(items: TraceFeedback[]): 'SATISFIED' | 'UNSATISFIED' | null {
  if (items.some((item) => item.feedback === 'UNSATISFIED')) return 'UNSATISFIED';
  if (items.some((item) => item.feedback === 'SATISFIED')) return 'SATISFIED';
  return null;
}

function roundRate(value: number, total: number) {
  return total ? roundNumber((value / total) * 100) : 0;
}

function roundNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function nullableDelta(after: number | null, before: number | null) {
  return after === null || before === null ? null : roundNumber(after - before);
}

function buildDailyTrend(rows: EffectTraceRow[]) {
  const grouped = new Map<string, EffectTraceRow[]>();
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const values = grouped.get(key) || [];
    values.push(row);
    grouped.set(key, values);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...summarizeEffectTraces(values) }));
}

function groupStrategyVersions(rows: EffectTraceRow[]) {
  const grouped = new Map<string, EffectTraceRow[]>();
  for (const row of rows) for (const id of new Set(row.strategyVersionIds || [])) {
    const values = grouped.get(id) || [];
    values.push(row);
    grouped.set(id, values);
  }
  return grouped;
}

function groupKnowledgeRevisions(rows: EffectTraceRow[]) {
  const grouped = new Map<string, { entryId: string; revision: number | null; rows: EffectTraceRow[] }>();
  for (const row of rows) for (const entryId of new Set(row.knowledgeEntryIds || [])) {
    const revision = readKnowledgeRevision(row.sourceRevisions, entryId);
    const key = `${entryId}@${revision ?? 'unknown'}`;
    const current = grouped.get(key) || { entryId, revision, rows: [] };
    current.rows.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function buildStrategyHitRows(grouped: Map<string, EffectTraceRow[]>, metadata: Map<string, StrategyVersionMetadata>) {
  return [...grouped.entries()].map(([versionId, rows]) => {
    const version = metadata.get(versionId);
    return {
      versionId,
      assetId: version?.asset?.id || null,
      assetName: version?.asset?.name || '历史或已删除策略资产',
      assetRevision: version?.asset?.revision || null,
      versionNo: version?.versionNo || null,
      title: version?.title || versionId,
      status: version?.status || 'UNKNOWN',
      publishedAt: version?.publishedAt || null,
      isCurrent: Boolean(version?.asset?.currentVersionId === versionId),
      ...summarizeEffectTraces(rows),
    };
  }).sort((a, b) => b.totalReplies - a.totalReplies).slice(0, 20);
}

function buildKnowledgeHitRows(grouped: Map<string, { entryId: string; revision: number | null; rows: EffectTraceRow[] }>, metadata: Map<string, KnowledgeEntryMetadata>) {
  return [...grouped.values()].map((group) => {
    const entry = metadata.get(group.entryId);
    return {
      entryId: group.entryId,
      title: entry?.title || '历史或已删除知识',
      revision: group.revision,
      currentRevision: entry?.revision || null,
      status: entry?.status || 'UNKNOWN',
      scopeType: entry?.scopeType || null,
      scopeKey: entry?.scopeKey || null,
      sourceType: entry?.sourceType || null,
      updatedAt: entry?.updatedAt || null,
      isCurrentRevision: Boolean(entry && group.revision === entry.revision),
      ...summarizeEffectTraces(group.rows),
    };
  }).sort((a, b) => b.totalReplies - a.totalReplies).slice(0, 20);
}

function readKnowledgeRevision(sourceRevisions: unknown, entryId: string): number | null {
  if (!sourceRevisions || typeof sourceRevisions !== 'object' || Array.isArray(sourceRevisions)) return null;
  const value = (sourceRevisions as Record<string, unknown>)[`knowledgeEntry:${entryId}`];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function targetWindow(anchor: Date, afterEnd: Date, beforeStart: Date, compareDays: number, now: Date) {
  return {
    compareDays,
    anchor: anchor.toISOString(),
    beforeStart: beforeStart.toISOString(),
    beforeEnd: anchor.toISOString(),
    afterStart: anchor.toISOString(),
    afterEnd: afterEnd.toISOString(),
    afterWindowComplete: anchor.getTime() + compareDays * DAY_MS <= now.getTime(),
    afterFilter: '仅统计实际命中目标策略版本或知识 revision 的 Reply Trace',
  };
}
