export type CustomerServiceGovernanceMode = 'DRY_RUN' | 'ARCHIVE' | 'COMPACT' | 'PURGE' | 'VERIFY';

export interface CustomerServiceGovernanceOverview {
  counts: Record<string, number>;
  payload: Record<string, { _sum?: { payloadBytes?: number | null }; _avg?: { payloadBytes?: number | null }; _max?: { payloadBytes?: number | null } }>;
  states: Record<string, Array<{ payloadState: string; _count: { _all: number }; _sum: { payloadBytes: number | null } }>>;
  tableSizes: Array<{ tableName: string; totalBytes: string | number; tableBytes: string | number; indexBytes: string | number; toastBytes: string | number; recordCount: number; averagePhysicalRowBytes: number }>;
  dailyGrowth: Array<{
    day: string;
    analysisCount: string | number;
    analysisBytes: string | number;
    calibrationCount: string | number;
    calibrationBytes: string | number;
    runtimeReplyCount: string | number;
    runtimeReplyBytes: string | number;
  }>;
  payloadPercentiles: Array<{
    analysisP95Bytes: string | number;
    calibrationP95Bytes: string | number;
    runtimeReplyP95Bytes: string | number;
  }>;
  projection: { observedDays: number; averageDailyBytes: number; projected30DayBytes: number; projected90DayBytes: number };
  capacity: { totalTableBytes: number; warningThresholdBytes: number; status: 'OK' | 'WARNING'; notes: string[] };
}

export interface CustomerServiceGovernanceRun {
  id: string;
  mode: CustomerServiceGovernanceMode;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  candidateCount: number;
  processedCount: number;
  skippedCount: number;
  estimatedBytes: string | number;
  releasedBytes: string | number;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}
