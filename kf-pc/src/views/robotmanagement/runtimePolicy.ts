export type RuntimeWindow = {
  name: string;
  start: string;
  end: string;
  intervalMinSec: number;
  intervalMaxSec: number;
};

export type RuntimePolicy = {
  enabled: boolean;
  scheduleMode: 'windowed';
  timezone: string;
  hardSleep: {
    enabled: boolean;
    sleepStart: string;
    wakeStart: string;
    wakeEnd: string;
  };
  diagnostics: {
    guiLogEnabled: boolean;
    interfaceTraceEnabled: boolean;
    interfaceTraceMaxRows: number;
  };
  dmPolicy: {
    mode: 'windowed';
    denseWindows: RuntimeWindow[];
    normalWindows: RuntimeWindow[];
    outsideWindowAction: 'sleep';
    emptyRoundThreshold: number;
    pollIntervalMinSec: number;
    pollIntervalMaxSec: number;
    shortIdleMinSec: number;
    shortIdleMaxSec: number;
    longIdleMinSec: number;
    longIdleMaxSec: number;
    messageAggregateWaitSec: number;
    afterReplyCooldownMinSec: number;
    afterReplyCooldownMaxSec: number;
    errorCooldownMinSec: number;
    errorCooldownMaxSec: number;
  };
  commentPolicy: {
    mode: 'windowed';
    workWindows: RuntimeWindow[];
    outsideWindowAction: 'sleep';
    workCooldownMinSec: number;
    workCooldownMaxSec: number;
    afterReplyCooldownMinSec: number;
    afterReplyCooldownMaxSec: number;
    noCandidateCooldownMinSec: number;
    noCandidateCooldownMaxSec: number;
    roundCompletedCooldownMinSec: number;
    roundCompletedCooldownMaxSec: number;
    multiEmptyRoundThreshold: number;
    multiEmptyRoundCooldownMinSec: number;
    multiEmptyRoundCooldownMaxSec: number;
    errorCooldownMinSec: number;
    errorCooldownMaxSec: number;
  };
};

export const DEFAULT_RUNTIME_POLICY: RuntimePolicy = {
  enabled: true,
  scheduleMode: 'windowed',
  timezone: 'Asia/Shanghai',
  hardSleep: {
    enabled: true,
    sleepStart: '01:00',
    wakeStart: '08:30',
    wakeEnd: '09:00'
  },
  diagnostics: {
    guiLogEnabled: true,
    interfaceTraceEnabled: true,
    interfaceTraceMaxRows: 50
  },
  dmPolicy: {
    mode: 'windowed',
    denseWindows: [
      { name: 'noon', start: '12:00', end: '14:00', intervalMinSec: 300, intervalMaxSec: 420 },
      { name: 'evening', start: '19:00', end: '23:30', intervalMinSec: 300, intervalMaxSec: 420 }
    ],
    normalWindows: [
      { name: 'morning', start: '09:00', end: '12:00', intervalMinSec: 300, intervalMaxSec: 600 },
      { name: 'afternoon', start: '14:00', end: '19:00', intervalMinSec: 300, intervalMaxSec: 600 },
      { name: 'late_evening', start: '23:30', end: '01:00', intervalMinSec: 480, intervalMaxSec: 720 }
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
    errorCooldownMaxSec: 1200
  },
  commentPolicy: {
    mode: 'windowed',
    workWindows: [
      { name: 'morning', start: '09:30', end: '11:30', intervalMinSec: 300, intervalMaxSec: 360 },
      { name: 'noon', start: '12:30', end: '14:00', intervalMinSec: 300, intervalMaxSec: 360 },
      { name: 'evening', start: '18:30', end: '21:30', intervalMinSec: 300, intervalMaxSec: 360 }
    ],
    outsideWindowAction: 'sleep',
    workCooldownMinSec: 300,
    workCooldownMaxSec: 360,
    afterReplyCooldownMinSec: 300,
    afterReplyCooldownMaxSec: 360,
    noCandidateCooldownMinSec: 300,
    noCandidateCooldownMaxSec: 360,
    roundCompletedCooldownMinSec: 300,
    roundCompletedCooldownMaxSec: 360,
    multiEmptyRoundThreshold: 3,
    multiEmptyRoundCooldownMinSec: 300,
    multiEmptyRoundCooldownMaxSec: 360,
    errorCooldownMinSec: 300,
    errorCooldownMaxSec: 600
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readTime(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function readNumber(value: unknown, fallback: number, min = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.floor(number)) : fallback;
}

function readPair(source: Record<string, unknown>, minKey: string, maxKey: string, fallbackMin: number, fallbackMax: number, min = 0) {
  const low = readNumber(source[minKey], fallbackMin, min);
  const high = Math.max(low, readNumber(source[maxKey], fallbackMax, min));
  return [low, high] as const;
}

function normalizeWindow(raw: unknown, fallback: RuntimeWindow): RuntimeWindow {
  const source = isRecord(raw) ? raw : {};
  const min = readNumber(source.intervalMinSec, fallback.intervalMinSec, 60);
  const max = Math.max(min, readNumber(source.intervalMaxSec, fallback.intervalMaxSec, 60));
  return {
    name: String(source.name || fallback.name),
    start: readTime(source.start, fallback.start),
    end: readTime(source.end, fallback.end),
    intervalMinSec: min,
    intervalMaxSec: max
  };
}

function normalizeWindows(raw: unknown, fallback: RuntimeWindow[]): RuntimeWindow[] {
  const values = Array.isArray(raw) ? raw : [];
  return fallback.map((item, index) => normalizeWindow(values[index], item));
}

export function normalizeRuntimePolicy(raw?: unknown): RuntimePolicy {
  const source = isRecord(raw) ? raw : {};
  const defaults = clone(DEFAULT_RUNTIME_POLICY);
  const hardSleep = isRecord(source.hardSleep) ? source.hardSleep : {};
  const diagnostics = isRecord(source.diagnostics) ? source.diagnostics : {};
  const dmPolicy = isRecord(source.dmPolicy) ? source.dmPolicy : {};
  const commentPolicy = isRecord(source.commentPolicy) ? source.commentPolicy : {};
  const [dmPollMin, dmPollMax] = readPair(dmPolicy, 'pollIntervalMinSec', 'pollIntervalMaxSec', defaults.dmPolicy.pollIntervalMinSec, defaults.dmPolicy.pollIntervalMaxSec, 0);
  const [dmShortIdleMin, dmShortIdleMax] = readPair(dmPolicy, 'shortIdleMinSec', 'shortIdleMaxSec', defaults.dmPolicy.shortIdleMinSec, defaults.dmPolicy.shortIdleMaxSec, 0);
  const [dmLongIdleMin, dmLongIdleMax] = readPair(dmPolicy, 'longIdleMinSec', 'longIdleMaxSec', defaults.dmPolicy.longIdleMinSec, defaults.dmPolicy.longIdleMaxSec, 0);
  const [dmAfterReplyMin, dmAfterReplyMax] = readPair(dmPolicy, 'afterReplyCooldownMinSec', 'afterReplyCooldownMaxSec', defaults.dmPolicy.afterReplyCooldownMinSec, defaults.dmPolicy.afterReplyCooldownMaxSec, 0);
  const [dmErrorMin, dmErrorMax] = readPair(dmPolicy, 'errorCooldownMinSec', 'errorCooldownMaxSec', defaults.dmPolicy.errorCooldownMinSec, defaults.dmPolicy.errorCooldownMaxSec, 0);
  const [commentWorkMin, commentWorkMax] = readPair(commentPolicy, 'workCooldownMinSec', 'workCooldownMaxSec', defaults.commentPolicy.workCooldownMinSec, defaults.commentPolicy.workCooldownMaxSec, 0);
  const [commentAfterReplyMin, commentAfterReplyMax] = readPair(commentPolicy, 'afterReplyCooldownMinSec', 'afterReplyCooldownMaxSec', defaults.commentPolicy.afterReplyCooldownMinSec, defaults.commentPolicy.afterReplyCooldownMaxSec, 0);
  const [commentNoCandidateMin, commentNoCandidateMax] = readPair(commentPolicy, 'noCandidateCooldownMinSec', 'noCandidateCooldownMaxSec', defaults.commentPolicy.noCandidateCooldownMinSec, defaults.commentPolicy.noCandidateCooldownMaxSec, 0);
  const [commentRoundMin, commentRoundMax] = readPair(commentPolicy, 'roundCompletedCooldownMinSec', 'roundCompletedCooldownMaxSec', defaults.commentPolicy.roundCompletedCooldownMinSec, defaults.commentPolicy.roundCompletedCooldownMaxSec, 0);
  const [commentMultiEmptyMin, commentMultiEmptyMax] = readPair(commentPolicy, 'multiEmptyRoundCooldownMinSec', 'multiEmptyRoundCooldownMaxSec', defaults.commentPolicy.multiEmptyRoundCooldownMinSec, defaults.commentPolicy.multiEmptyRoundCooldownMaxSec, 0);
  const [commentErrorMin, commentErrorMax] = readPair(commentPolicy, 'errorCooldownMinSec', 'errorCooldownMaxSec', defaults.commentPolicy.errorCooldownMinSec, defaults.commentPolicy.errorCooldownMaxSec, 0);

  return {
    ...defaults,
    enabled: source.enabled !== false,
    scheduleMode: 'windowed',
    timezone: String(source.timezone || defaults.timezone),
    hardSleep: {
      ...defaults.hardSleep,
      enabled: hardSleep.enabled !== false,
      sleepStart: readTime(hardSleep.sleepStart, defaults.hardSleep.sleepStart),
      wakeStart: readTime(hardSleep.wakeStart, defaults.hardSleep.wakeStart),
      wakeEnd: readTime(hardSleep.wakeEnd, defaults.hardSleep.wakeEnd)
    },
    diagnostics: {
      ...defaults.diagnostics,
      guiLogEnabled: diagnostics.guiLogEnabled !== false,
      interfaceTraceEnabled: diagnostics.interfaceTraceEnabled !== false,
      interfaceTraceMaxRows: Math.max(1, Math.min(50, readNumber(diagnostics.interfaceTraceMaxRows, defaults.diagnostics.interfaceTraceMaxRows, 1)))
    },
    dmPolicy: {
      ...defaults.dmPolicy,
      denseWindows: normalizeWindows(dmPolicy.denseWindows, defaults.dmPolicy.denseWindows),
      normalWindows: normalizeWindows(dmPolicy.normalWindows, defaults.dmPolicy.normalWindows),
      emptyRoundThreshold: readNumber(dmPolicy.emptyRoundThreshold, defaults.dmPolicy.emptyRoundThreshold, 1),
      pollIntervalMinSec: dmPollMin,
      pollIntervalMaxSec: dmPollMax,
      shortIdleMinSec: dmShortIdleMin,
      shortIdleMaxSec: dmShortIdleMax,
      longIdleMinSec: dmLongIdleMin,
      longIdleMaxSec: dmLongIdleMax,
      messageAggregateWaitSec: readNumber(dmPolicy.messageAggregateWaitSec, defaults.dmPolicy.messageAggregateWaitSec, 0),
      afterReplyCooldownMinSec: dmAfterReplyMin,
      afterReplyCooldownMaxSec: dmAfterReplyMax,
      errorCooldownMinSec: dmErrorMin,
      errorCooldownMaxSec: dmErrorMax
    },
    commentPolicy: {
      ...defaults.commentPolicy,
      workWindows: normalizeWindows(commentPolicy.workWindows, defaults.commentPolicy.workWindows),
      workCooldownMinSec: commentWorkMin,
      workCooldownMaxSec: commentWorkMax,
      afterReplyCooldownMinSec: commentAfterReplyMin,
      afterReplyCooldownMaxSec: commentAfterReplyMax,
      noCandidateCooldownMinSec: commentNoCandidateMin,
      noCandidateCooldownMaxSec: commentNoCandidateMax,
      roundCompletedCooldownMinSec: commentRoundMin,
      roundCompletedCooldownMaxSec: commentRoundMax,
      multiEmptyRoundThreshold: readNumber(commentPolicy.multiEmptyRoundThreshold, defaults.commentPolicy.multiEmptyRoundThreshold, 1),
      multiEmptyRoundCooldownMinSec: commentMultiEmptyMin,
      multiEmptyRoundCooldownMaxSec: commentMultiEmptyMax,
      errorCooldownMinSec: commentErrorMin,
      errorCooldownMaxSec: commentErrorMax
    }
  };
}

export function cloneRuntimePolicy(raw?: unknown): RuntimePolicy {
  return normalizeRuntimePolicy(raw);
}
