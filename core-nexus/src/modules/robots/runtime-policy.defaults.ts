export const DEFAULT_INTERCEPT_CONFIG = {
  targetMode: 'homepage',
  homepageTargets: [] as Array<{ url: string; label?: string; accountName?: string; enabled?: boolean }>,
  contentTargets: [] as Array<{ url: string; label?: string; accountName?: string; enabled?: boolean }>,
  homepageLookbackDays: 10,
  schedule: {
    timezone: 'Asia/Shanghai',
    runEveryDays: 3,
    anchorDate: '',
    runWindows: [{ name: 'default', start: '19:00', end: '00:00', enabled: true }],
    outsideWindowAction: 'sleep',
  },
  collect: {
    maxPosts: 0,
    maxCommentsPerPost: 0,
    captureSeconds: 8,
    triggerScrollRounds: 0,
    triggerPauseSec: 1.2,
    browserName: 'chrome',
    pacingProfile: 'conservative',
    saveDebugFiles: false,
    headless: false,
    maxTargetMinutes: 30,
    randomizeTargets: true,
    commentFetchMaxSeconds: 0,
    postCooldownMinSec: 6,
    postCooldownMaxSec: 20,
    accountCooldownMinSec: 12,
    accountCooldownMaxSec: 35,
    commentPagePauseMinSec: 1,
    commentPagePauseMaxSec: 2.2,
    maxPostDurationSeconds: 0,
  },
  intentAnalysis: {
    promptConfigId: '',
    promptConfigName: '',
    workflowId: '',
    batchSize: undefined,
    useTenantDefault: false,
  },
  workDecision: {
    enabled: true,
    workflowId: '',
    failStrategy: 'SKIP',
  },
  speech: {
    enabled: true,
    failStrategy: 'SKIP',
    emptyTranscriptStrategy: 'SKIP',
  },
} as const;

export const DEFAULT_RUNTIME_POLICY = {
  enabled: true,
  scheduleMode: 'windowed',
  timezone: 'Asia/Shanghai',
  hardSleep: {
    enabled: true,
    sleepStart: '01:00',
    wakeStart: '08:30',
    wakeEnd: '09:00',
  },
  workSchedule: {
    enabled: true,
    sleepStart: '01:00',
    wakeStart: '08:30',
    wakeEnd: '09:00',
    timezone: 'Asia/Shanghai',
  },
  diagnostics: {
    guiLogEnabled: true,
    interfaceTraceEnabled: true,
    interfaceTraceMaxRows: 50,
  },
  dmPolicy: {
    mode: 'windowed',
    denseWindows: [
      { name: 'noon', start: '12:00', end: '14:00', intervalMinSec: 300, intervalMaxSec: 420 },
      { name: 'evening', start: '19:00', end: '23:30', intervalMinSec: 300, intervalMaxSec: 420 },
    ],
    normalWindows: [
      { name: 'morning', start: '09:00', end: '12:00', intervalMinSec: 300, intervalMaxSec: 600 },
      { name: 'afternoon', start: '14:00', end: '19:00', intervalMinSec: 300, intervalMaxSec: 600 },
      { name: 'late_evening', start: '23:30', end: '01:00', intervalMinSec: 480, intervalMaxSec: 720 },
    ],
    outsideWindowAction: 'sleep',
    emptyRoundThreshold: 3,
    pollIntervalMinSec: 900,
    pollIntervalMaxSec: 1800,
    shortIdleMinSec: 900,
    shortIdleMaxSec: 1800,
    longIdleMinSec: 1200,
    longIdleMaxSec: 2400,
    messageAggregateWaitSec: 12,
    afterReplyCooldownMinSec: 300,
    afterReplyCooldownMaxSec: 600,
    errorCooldownMinSec: 600,
    errorCooldownMaxSec: 1200,
  },
  commentPolicy: {
    mode: 'windowed',
    workWindows: [
      { name: 'morning', start: '09:30', end: '11:30', intervalMinSec: 300, intervalMaxSec: 360 },
      { name: 'noon', start: '12:30', end: '14:00', intervalMinSec: 300, intervalMaxSec: 360 },
      { name: 'evening', start: '18:30', end: '21:30', intervalMinSec: 300, intervalMaxSec: 360 },
    ],
    outsideWindowAction: 'sleep',
    workCooldownMinSec: 300,
    workCooldownMaxSec: 360,
    afterReplyCooldownMinSec: 60,
    afterReplyCooldownMaxSec: 120,
    noCandidateCooldownMinSec: 300,
    noCandidateCooldownMaxSec: 360,
    roundCompletedCooldownMinSec: 300,
    roundCompletedCooldownMaxSec: 360,
    multiEmptyRoundThreshold: 3,
    multiEmptyRoundCooldownMinSec: 300,
    multiEmptyRoundCooldownMaxSec: 360,
    errorCooldownMinSec: 300,
    errorCooldownMaxSec: 600,
  },
} as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: JsonRecord, override: JsonRecord): JsonRecord {
  const result: JsonRecord = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

function normalizeNumber(value: unknown, fallback: number, minimum = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.floor(numeric));
}

function normalizeFloat(value: unknown, fallback: number, minimum = 0) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, numeric);
}

function clampNumberPair(policy: JsonRecord, minKey: string, maxKey: string, minimum = 0) {
  const minValue = normalizeNumber(policy[minKey], 0, minimum);
  const maxValue = normalizeNumber(policy[maxKey], minValue, minimum);
  policy[minKey] = minValue;
  policy[maxKey] = Math.max(minValue, maxValue);
}

function normalizeRuntimePolicyPairs(runtimePolicy: JsonRecord): JsonRecord {
  const dmPolicy = isRecord(runtimePolicy.dmPolicy) ? runtimePolicy.dmPolicy : {};
  clampNumberPair(dmPolicy, 'pollIntervalMinSec', 'pollIntervalMaxSec', 0);
  clampNumberPair(dmPolicy, 'shortIdleMinSec', 'shortIdleMaxSec', 0);
  clampNumberPair(dmPolicy, 'longIdleMinSec', 'longIdleMaxSec', 0);
  clampNumberPair(dmPolicy, 'afterReplyCooldownMinSec', 'afterReplyCooldownMaxSec', 0);
  clampNumberPair(dmPolicy, 'errorCooldownMinSec', 'errorCooldownMaxSec', 0);
  dmPolicy.emptyRoundThreshold = normalizeNumber(dmPolicy.emptyRoundThreshold, 3, 1);

  const commentPolicy = isRecord(runtimePolicy.commentPolicy) ? runtimePolicy.commentPolicy : {};
  clampNumberPair(commentPolicy, 'workCooldownMinSec', 'workCooldownMaxSec', 0);
  clampNumberPair(commentPolicy, 'afterReplyCooldownMinSec', 'afterReplyCooldownMaxSec', 0);
  clampNumberPair(commentPolicy, 'noCandidateCooldownMinSec', 'noCandidateCooldownMaxSec', 0);
  clampNumberPair(commentPolicy, 'roundCompletedCooldownMinSec', 'roundCompletedCooldownMaxSec', 0);
  clampNumberPair(commentPolicy, 'multiEmptyRoundCooldownMinSec', 'multiEmptyRoundCooldownMaxSec', 0);
  clampNumberPair(commentPolicy, 'errorCooldownMinSec', 'errorCooldownMaxSec', 0);
  commentPolicy.multiEmptyRoundThreshold = normalizeNumber(commentPolicy.multiEmptyRoundThreshold, 3, 1);

  return runtimePolicy;
}

function normalizeTargets(value: unknown) {
  const rawItems = Array.isArray(value) ? value : value ? [value] : [];
  return rawItems
    .map((item) => {
      if (typeof item === 'string') {
        const url = item.trim();
        return url ? { url, enabled: true } : null;
      }
      if (!isRecord(item)) return null;
      const url = String(item.url ?? item.homepageUrl ?? item.contentUrl ?? item.link ?? '').trim();
      if (!url) return null;
      return {
        url,
        ...(item.accountName || item.label || item.name ? { accountName: String(item.accountName ?? item.label ?? item.name), label: String(item.accountName ?? item.label ?? item.name) } : {}),
        enabled: item.enabled !== false,
      };
    })
    .filter(Boolean);
}

function normalizeRunWindows(value: unknown) {
  const rawItems = Array.isArray(value) ? value : value ? [value] : [];
  const windows = rawItems
    .map((item) => {
      if (typeof item === 'string') {
        const [start, end] = item.replace('-', '~').split('~').map((part) => part.trim());
        return start && end ? { start, end, enabled: true } : null;
      }
      if (!isRecord(item)) return null;
      return {
        ...(item.name || item.label ? { name: String(item.name ?? item.label) } : {}),
        start: String(item.start ?? '19:00'),
        end: String(item.end ?? '00:00'),
        enabled: item.enabled !== false,
      };
    })
    .filter(Boolean);
  return windows.length ? windows : [...DEFAULT_INTERCEPT_CONFIG.schedule.runWindows];
}

function normalizeInterceptConfig(intercept: JsonRecord): JsonRecord {
  const targetMode = String(intercept.targetMode ?? DEFAULT_INTERCEPT_CONFIG.targetMode).toLowerCase();
  const safeTargetMode = targetMode === 'content' ? 'content' : DEFAULT_INTERCEPT_CONFIG.targetMode;
  const collect = isRecord(intercept.collect) ? intercept.collect : {};
  const schedule = isRecord(intercept.schedule) ? intercept.schedule : {};

  return {
    ...intercept,
    targetMode: safeTargetMode,
    homepageTargets: normalizeTargets(intercept.homepageTargets),
    contentTargets: normalizeTargets(intercept.contentTargets),
    homepageLookbackDays: normalizeNumber(intercept.homepageLookbackDays, DEFAULT_INTERCEPT_CONFIG.homepageLookbackDays, 1),
    schedule: {
      ...schedule,
      timezone: String(schedule.timezone ?? DEFAULT_INTERCEPT_CONFIG.schedule.timezone),
      runEveryDays: normalizeNumber(schedule.runEveryDays ?? intercept.runEveryDays, DEFAULT_INTERCEPT_CONFIG.schedule.runEveryDays, 1),
      anchorDate: String(schedule.anchorDate ?? DEFAULT_INTERCEPT_CONFIG.schedule.anchorDate),
      outsideWindowAction: String(schedule.outsideWindowAction ?? DEFAULT_INTERCEPT_CONFIG.schedule.outsideWindowAction),
      runWindows: normalizeRunWindows(schedule.runWindows),
    },
    intentAnalysis: isRecord(intercept.intentAnalysis) ? intercept.intentAnalysis : { ...DEFAULT_INTERCEPT_CONFIG.intentAnalysis },
    workDecision: {
      ...(isRecord(intercept.workDecision) ? intercept.workDecision : {}),
      enabled: !isRecord(intercept.workDecision) || intercept.workDecision.enabled !== false,
      workflowId: String((isRecord(intercept.workDecision) ? intercept.workDecision.workflowId : undefined) ?? DEFAULT_INTERCEPT_CONFIG.workDecision.workflowId),
      failStrategy: String((isRecord(intercept.workDecision) ? intercept.workDecision.failStrategy : undefined) ?? DEFAULT_INTERCEPT_CONFIG.workDecision.failStrategy) === 'RUN' ? 'RUN' : 'SKIP',
    },
    speech: {
      ...(isRecord(intercept.speech) ? intercept.speech : {}),
      enabled: !isRecord(intercept.speech) || intercept.speech.enabled !== false,
      failStrategy: String((isRecord(intercept.speech) ? intercept.speech.failStrategy : undefined) ?? DEFAULT_INTERCEPT_CONFIG.speech.failStrategy) === 'RUN' ? 'RUN' : 'SKIP',
      emptyTranscriptStrategy: String((isRecord(intercept.speech) ? intercept.speech.emptyTranscriptStrategy : undefined) ?? DEFAULT_INTERCEPT_CONFIG.speech.emptyTranscriptStrategy) === 'RUN' ? 'RUN' : 'SKIP',
    },
    collect: {
      ...collect,
      maxPosts: normalizeNumber(collect.maxPosts, DEFAULT_INTERCEPT_CONFIG.collect.maxPosts, 0),
      maxCommentsPerPost: normalizeNumber(collect.maxCommentsPerPost, DEFAULT_INTERCEPT_CONFIG.collect.maxCommentsPerPost, 0),
      captureSeconds: normalizeNumber(collect.captureSeconds, DEFAULT_INTERCEPT_CONFIG.collect.captureSeconds, 3),
      triggerScrollRounds: normalizeNumber(collect.triggerScrollRounds, DEFAULT_INTERCEPT_CONFIG.collect.triggerScrollRounds, 0),
      triggerPauseSec: normalizeFloat(collect.triggerPauseSec, DEFAULT_INTERCEPT_CONFIG.collect.triggerPauseSec, 0.5),
      browserName: String(collect.browserName ?? DEFAULT_INTERCEPT_CONFIG.collect.browserName),
      pacingProfile: String(collect.pacingProfile ?? DEFAULT_INTERCEPT_CONFIG.collect.pacingProfile),
      saveDebugFiles: collect.saveDebugFiles === true,
      headless: collect.headless === true,
      maxTargetMinutes: normalizeNumber(collect.maxTargetMinutes ?? intercept.maxTargetMinutes, DEFAULT_INTERCEPT_CONFIG.collect.maxTargetMinutes, 1),
      randomizeTargets: collect.randomizeTargets !== false,
      commentFetchMaxSeconds: normalizeNumber(collect.commentFetchMaxSeconds, DEFAULT_INTERCEPT_CONFIG.collect.commentFetchMaxSeconds, 0),
      postCooldownMinSec: normalizeNumber(collect.postCooldownMinSec, DEFAULT_INTERCEPT_CONFIG.collect.postCooldownMinSec, 0),
      postCooldownMaxSec: Math.max(
        normalizeNumber(collect.postCooldownMinSec, DEFAULT_INTERCEPT_CONFIG.collect.postCooldownMinSec, 0),
        normalizeNumber(collect.postCooldownMaxSec, DEFAULT_INTERCEPT_CONFIG.collect.postCooldownMaxSec, 0),
      ),
      accountCooldownMinSec: normalizeNumber(collect.accountCooldownMinSec, DEFAULT_INTERCEPT_CONFIG.collect.accountCooldownMinSec, 0),
      accountCooldownMaxSec: Math.max(
        normalizeNumber(collect.accountCooldownMinSec, DEFAULT_INTERCEPT_CONFIG.collect.accountCooldownMinSec, 0),
        normalizeNumber(collect.accountCooldownMaxSec, DEFAULT_INTERCEPT_CONFIG.collect.accountCooldownMaxSec, 0),
      ),
      commentPagePauseMinSec: normalizeFloat(
        collect.commentPagePauseMinSec ?? collect.commentPageIntervalMinSec,
        DEFAULT_INTERCEPT_CONFIG.collect.commentPagePauseMinSec,
        0,
      ),
      commentPagePauseMaxSec: Math.max(
        normalizeFloat(collect.commentPagePauseMinSec ?? collect.commentPageIntervalMinSec, DEFAULT_INTERCEPT_CONFIG.collect.commentPagePauseMinSec, 0),
        normalizeFloat(collect.commentPagePauseMaxSec ?? collect.commentPageIntervalMaxSec, DEFAULT_INTERCEPT_CONFIG.collect.commentPagePauseMaxSec, 0),
      ),
      maxPostDurationSeconds: normalizeNumber(collect.maxPostDurationSeconds ?? collect.maxPostDurationSec, DEFAULT_INTERCEPT_CONFIG.collect.maxPostDurationSeconds, 0),
    },
  };
}

export function withDefaultRuntimePolicy(config?: JsonRecord | null): JsonRecord {
  const safeConfig = isRecord(config) ? config : {};
  const runtimePolicy = deepMerge(
    DEFAULT_RUNTIME_POLICY as unknown as JsonRecord,
    isRecord(safeConfig.runtimePolicy) ? safeConfig.runtimePolicy : {},
  );
  const intercept = deepMerge(
    DEFAULT_INTERCEPT_CONFIG as unknown as JsonRecord,
    isRecord(safeConfig.intercept) ? safeConfig.intercept : {},
  );
  return {
    ...safeConfig,
    intercept: normalizeInterceptConfig(intercept),
    runtimePolicy: normalizeRuntimePolicyPairs(runtimePolicy),
  };
}
