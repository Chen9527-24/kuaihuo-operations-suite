import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';

export interface CustomerServiceEffectMetrics {
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
}

export interface CustomerServiceEffectObservationSignal {
  status: 'INSUFFICIENT' | 'WARNING' | 'POSITIVE' | 'STABLE';
  message: string;
  satisfactionDelta: number | null;
  qualityPassDelta: number;
  fallbackDelta: number;
  causalDisclaimer: string;
}

export interface CustomerServiceStrategyVersionHit extends CustomerServiceEffectMetrics {
  versionId: string;
  assetId: string | null;
  assetName: string;
  assetRevision: number | null;
  versionNo: number | null;
  title: string;
  status: string;
  publishedAt: string | null;
  isCurrent: boolean;
}

export interface CustomerServiceKnowledgeVersionHit extends CustomerServiceEffectMetrics {
  entryId: string;
  title: string;
  revision: number | null;
  currentRevision: number | null;
  status: string;
  scopeType: string | null;
  scopeKey: string | null;
  sourceType: string | null;
  updatedAt: string | null;
  isCurrentRevision: boolean;
}

export interface CustomerServiceTargetObservation {
  type: 'STRATEGY_VERSION' | 'KNOWLEDGE_REVISION';
  target: Record<string, unknown> & {
    id: string;
    title?: string;
    status?: string;
    isCurrent?: boolean;
    assetId?: string;
    assetName?: string;
    assetRevision?: number;
    versionNo?: number;
    revision?: number;
  };
  window: {
    compareDays: number;
    anchor: string;
    beforeStart: string;
    beforeEnd: string;
    afterStart: string;
    afterEnd: string;
    afterWindowComplete: boolean;
    afterFilter: string;
  };
  before: CustomerServiceEffectMetrics;
  after: CustomerServiceEffectMetrics;
  observation: CustomerServiceEffectObservationSignal;
  rollbackCandidates: Array<{ id: string; versionNo: number; title: string; publishedAt: string | null }>;
}

export interface CustomerServiceEffectObservationResult {
  account: { id: string; name: string; storeProfileId: string | null; status: string };
  window: {
    days: number;
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
    sampleLimit: number;
    currentTotal: number;
    previousTotal: number;
    currentSampled: boolean;
    previousSampled: boolean;
  };
  current: CustomerServiceEffectMetrics;
  previous: CustomerServiceEffectMetrics;
  periodObservation: CustomerServiceEffectObservationSignal;
  dailyTrend: Array<{ date: string } & CustomerServiceEffectMetrics>;
  strategyVersionHits: CustomerServiceStrategyVersionHit[];
  knowledgeVersionHits: CustomerServiceKnowledgeVersionHit[];
  targetObservation: CustomerServiceTargetObservation | null;
}

export async function getCustomerServiceEffectObservation(query: {
  accountProfileId: string;
  days?: number;
  compareDays?: number;
  strategyVersionId?: string;
  knowledgeEntryId?: string;
}): Promise<CustomerServiceEffectObservationResult> {
  return unwrapData(await request({
    path: '/customer-service/admin/effect-observation',
    method: 'GET',
    query,
    apiVersion: 5,
    skipGlobalLoading: true,
  }));
}
