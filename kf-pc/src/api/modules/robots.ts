import { request } from '@/api/core/http';
import { normalizeOptions, normalizePageResult, pickArray, pickString, type PageResult, type SelectOption, unwrapData, isRecord } from '@/utils/apiData';

export interface RobotQuery {
  keyword?: string;
  platform?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface RobotPayload {
  tenantId?: string;
  name: string;
  type: string;
  platform: string;
  authId?: string;
  deviceId?: string;
  expireAt?: string;
  config?: Record<string, unknown>;
  remark?: string;
}

export interface RobotStopPayload {
  stopReason: 'MANUAL' | 'EXPIRED' | 'AUTH_LOST' | 'DEVICE_OFFLINE' | 'PLATFORM_LIMIT' | 'SYSTEM_ERROR';
}

export interface RobotAuthSessionPayload {
  tenantId?: string;
  authId: string;
  deviceId: string;
  ttlSeconds?: number;
}

export interface RobotItem {
  id: string;
  name: string;
  code?: string;
  type: string;
  platform: string;
  status: string;
  authId?: string;
  deviceId?: string;
  expireAt?: string;
  config?: Record<string, unknown>;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
  lastHeartbeatAt?: string;
  lastActiveAt?: string;
  leadPrivateMessageConfig?: Record<string, unknown>;
  privateMessageConfig?: Record<string, unknown>;
  executionStatus?: string;
  todaySentCount?: number;
  dailySendLimit?: number;
  hourlySendLimit?: number;
  pendingTaskCount?: number;
  lastClaimedAt?: string;
  lastSentAt?: string;
  auth?: Record<string, unknown> | null;
  device?: Record<string, unknown> | null;
}

export interface RobotAuthSessionResult {
  sessionId: string;
  qrCodeUrl: string;
  qrCodeContent: string;
  deviceCode: string;
  deviceSecret: string;
  status: string;
  raw: unknown;
}

export async function listRobots(query: RobotQuery): Promise<PageResult<RobotItem>> {
  const payload = await request<unknown>({
    path: '/robots',
    query
  });

  const page = normalizePageResult<unknown>(payload);
  return {
    ...page,
    items: page.items.map((item) => normalizeRobotItem(item))
  };
}

export async function createRobot(payload: RobotPayload): Promise<RobotItem> {
  const response = await request<unknown>({
    path: '/robots',
    method: 'POST',
    body: payload
  });
  return normalizeRobotItem(response);
}

export async function updateRobot(id: string, payload: Partial<RobotPayload>): Promise<RobotItem> {
  const response = await request<unknown>({
    path: `/robots/${id}`,
    method: 'PATCH',
    body: payload
  });
  return normalizeRobotItem(response);
}

export async function removeRobot(id: string) {
  return request<unknown>({
    path: `/robots/${id}`,
    method: 'DELETE'
  });
}

export async function startRobot(id: string) {
  return request<unknown>({
    path: `/robots/${id}/start`,
    method: 'POST'
  });
}

export async function stopRobot(id: string, payload: RobotStopPayload = { stopReason: 'MANUAL' }) {
  return request<unknown>({
    path: `/robots/${id}/stop`,
    method: 'POST',
    body: payload
  });
}

export async function refreshExpiredRobots() {
  return request<unknown>({
    path: '/robots/refresh-expired',
    method: 'POST'
  });
}

export async function getRobotAuthOptions(query?: { tenantId?: string; platform?: string }): Promise<SelectOption[]> {
  const payload = await request<unknown>({
    path: '/robots/auths/options',
    query
  });
  return normalizeOptions(payload);
}

export async function getRobotDeviceOptions(query?: { tenantId?: string; platform?: string }): Promise<SelectOption[]> {
  const payload = await request<unknown>({
    path: '/robots/devices/options',
    query
  });
  return normalizeOptions(payload);
}

export async function createRobotAuthSession(payload: RobotAuthSessionPayload): Promise<RobotAuthSessionResult> {
  const response = await request<unknown>({
    path: '/robots/auth-sessions',
    method: 'POST',
    body: payload
  });

  return normalizeRobotAuthSession(response);
}

export async function getRobotAuthSession(sessionId: string): Promise<RobotAuthSessionResult> {
  const response = await request<unknown>({
    path: `/robots/auth-sessions/${sessionId}`
  });

  return normalizeRobotAuthSession(response);
}

function normalizeRobotItem(payload: unknown): RobotItem {
  const source = isRecord(unwrapData(payload)) ? unwrapData(payload) : payload;
  const record = isRecord(source) ? source : {};
  const auth = firstRecord(record, ['auth', 'robotAuth', 'authorization']);
  const device = firstRecord(record, ['device', 'robotDevice']);

  return {
    id: pickString(record, ['id', '_id']),
    name: pickString(record, ['name']),
    code: pickString(record, ['code', 'robotCode', 'deviceCode']),
    type: pickString(record, ['type', 'robotType']),
    platform: pickString(record, ['platform']),
    status: pickString(record, ['status', 'runStatus']),
    authId: pickString(record, ['authId']) || pickString(auth, ['id', 'authId']),
    deviceId: pickString(record, ['deviceId']) || pickString(device, ['id', 'deviceId']),
    expireAt: pickString(record, ['expireAt', 'expiredAt']),
    config: firstRecord(record, ['config']),
    remark: pickString(record, ['remark']),
    createdAt: pickString(record, ['createdAt']),
    updatedAt: pickString(record, ['updatedAt']),
    lastHeartbeatAt: pickString(record, ['lastHeartbeatAt']),
    lastActiveAt: pickString(record, ['lastActiveAt', 'lastHeartbeatAt']),
    leadPrivateMessageConfig: firstRecord(record, ['leadPrivateMessageConfig']),
    privateMessageConfig: firstRecord(record, ['leadPrivateMessageConfig']) || firstRecord(record, ['privateMessageConfig']),
    executionStatus: pickString(record, ['executionStatus']),
    todaySentCount: pickNumber(record, ['todaySentCount']),
    dailySendLimit: pickNumber(record, ['dailySendLimit']),
    hourlySendLimit: pickNumber(record, ['hourlySendLimit']),
    pendingTaskCount: pickNumber(record, ['pendingTaskCount']),
    lastClaimedAt: pickString(record, ['lastClaimedAt']),
    lastSentAt: pickString(record, ['lastSentAt']),
    auth,
    device
  };
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function normalizeRobotAuthSession(payload: unknown): RobotAuthSessionResult {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};

  return {
    sessionId: pickString(record, ['sessionId', 'id']),
    qrCodeUrl: pickString(record, ['qrCodeUrl']),
    qrCodeContent: pickString(record, ['qrCodeContent']),
    deviceCode: pickString(record, ['deviceCode']),
    deviceSecret: pickString(record, ['deviceSecret']),
    status: pickString(record, ['status']),
    raw: source
  };
}

function firstRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }

  const arrays = pickArray(record, keys);
  if (arrays.length && isRecord(arrays[0])) {
    return arrays[0];
  }

  return null;
}

export interface InterceptCaptureQuery {
  tenantId?: string;
  robotId?: string;
  platform?: string;
  keyword?: string;
  analysisStatus?: string;
  intentLevel?: string;
  page?: number;
  pageSize?: number;
}

export interface InterceptCaptureItem {
  id: string;
  tenantId?: string;
  robotId: string;
  runId?: string;
  platform: string;
  accountAlias?: string;
  targetType?: string;
  targetUrl?: string;
  homepageUrl?: string;
  contentUrl?: string;
  platformContentId?: string;
  contentTitle?: string;
  /** 系统已保存的同作品评论记录数量，不是平台公开评论总数。 */
  capturedCommentCount?: number;
  publishTimeIso?: string;
  commentId?: string;
  parentCommentId?: string;
  userId?: string;
  nickname?: string;
  commentText?: string;
  commentTimeIso?: string;
  visibleRegion?: string;
  capturedAt?: string;
  createdAt?: string;
  robot?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
}

export async function listInterceptCaptures(query: InterceptCaptureQuery): Promise<PageResult<InterceptCaptureItem>> {
  const payload = await request<unknown>({
    path: '/robots/intercept-captures',
    query
  });
  const page = normalizePageResult<unknown>(payload);
  return {
    ...page,
    items: page.items.map((item) => normalizeInterceptCaptureItem(item))
  };
}


export interface InterceptCaptureViewColumn {
  key: string;
  visible: boolean;
  order: number;
}

export interface InterceptCaptureViewPreset {
  id: string;
  tenantId?: string;
  userId?: string;
  name: string;
  isDefault: boolean;
  columns: InterceptCaptureViewColumn[];
  createdAt?: string;
  updatedAt?: string;
}

export interface InterceptCaptureViewPresetPayload {
  tenantId?: string;
  name: string;
  columns: InterceptCaptureViewColumn[];
  isDefault?: boolean;
}

export async function listInterceptCaptureViewPresets(query?: { tenantId?: string }): Promise<InterceptCaptureViewPreset[]> {
  const payload = await request<unknown>({ path: '/robots/intercept-capture-view-presets', query });
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return items.map((item) => normalizeInterceptCaptureViewPreset(item));
}

export async function createInterceptCaptureViewPreset(data: InterceptCaptureViewPresetPayload): Promise<InterceptCaptureViewPreset> {
  const payload = await request<unknown>({ path: '/robots/intercept-capture-view-presets', method: 'POST', body: data });
  return normalizeInterceptCaptureViewPreset(payload);
}

export async function updateInterceptCaptureViewPreset(id: string, data: Partial<Pick<InterceptCaptureViewPresetPayload, 'name' | 'columns'>>): Promise<InterceptCaptureViewPreset> {
  const payload = await request<unknown>({ path: `/robots/intercept-capture-view-presets/${id}`, method: 'PATCH', body: data });
  return normalizeInterceptCaptureViewPreset(payload);
}

export async function setDefaultInterceptCaptureViewPreset(id: string): Promise<InterceptCaptureViewPreset> {
  const payload = await request<unknown>({ path: `/robots/intercept-capture-view-presets/${id}/default`, method: 'POST' });
  return normalizeInterceptCaptureViewPreset(payload);
}

export async function removeInterceptCaptureViewPreset(id: string): Promise<void> {
  await request<unknown>({ path: `/robots/intercept-capture-view-presets/${id}`, method: 'DELETE' });
}


export interface InterceptCaptureDeleteResult {
  deleted: number;
}

export async function deleteInterceptCapture(id: string): Promise<InterceptCaptureDeleteResult> {
  const payload = await request<unknown>({
    path: `/robots/intercept-captures/${id}`,
    method: 'DELETE'
  });
  return normalizeInterceptCaptureDeleteResult(payload);
}

export async function deleteInterceptCaptureBatch(ids: string[]): Promise<InterceptCaptureDeleteResult> {
  const payload = await request<unknown>({
    path: '/robots/intercept-captures/batch',
    method: 'DELETE',
    body: { ids }
  });
  return normalizeInterceptCaptureDeleteResult(payload);
}

export async function clearInterceptCaptures(query: InterceptCaptureQuery): Promise<InterceptCaptureDeleteResult> {
  const payload = await request<unknown>({
    path: '/robots/intercept-captures',
    method: 'DELETE',
    query
  });
  return normalizeInterceptCaptureDeleteResult(payload);
}


export interface RetryFailedInterceptCaptureAnalysisResult {
  queued: boolean;
  staged?: boolean;
  async?: boolean;
  captureCount: number;
  robotCount: number;
  batchCount?: number;
  batchSize?: number;
  message?: string;
}

export async function retryFailedInterceptCaptureAnalysis(query: InterceptCaptureQuery & { limit?: number }): Promise<RetryFailedInterceptCaptureAnalysisResult> {
  const payload = await request<unknown>({
    path: '/robots/intercept-captures/intent-analysis-failed/retry',
    method: 'POST',
    body: query
  });
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  return {
    queued: record.queued === true,
    staged: record.staged === true,
    async: record.async === true,
    captureCount: pickNumber(record, ['captureCount']),
    robotCount: pickNumber(record, ['robotCount']),
    batchCount: pickNumber(record, ['batchCount']),
    batchSize: pickNumber(record, ['batchSize']),
    message: pickString(record, ['message'])
  };
}


export interface InterceptIntentPromptConfigQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  isDefault?: string;
}

export interface InterceptIntentPromptConfigPayload {
  tenantId?: string;
  name: string;
  description?: string;
  workflowId?: string;
  batchSize?: number;
  biz?: string;
  cust?: string;
  acctType?: string;
  acctPos?: string;
  tone?: string;
  sellPts?: string;
  banRules?: string;
  nonCust?: string;
  dmRule?: string;
  entryRules?: string;
  videoTitle?: string;
  platform?: string;
  clientName?: string;
  mainBusiness?: string;
  mainProducts?: string;
  targetScenarios?: string;
  customerPainPoints?: string;
  positiveKeywords?: string;
  negativeKeywords?: string;
  highIntentKeywords?: string;
  nonLeadSignals?: string;
  allowedOffers?: string;
  accountPersona?: string;
  forbiddenClaims?: string;
  ctaPolicy?: string;
  workflowMode?: string;
  videoDesc?: string;
  videoRelevanceRules?: string;
  commentScoringRules?: string;
  riskRoutingRules?: string;
  scriptGenerationRules?: string;
  businessProfile?: unknown;
  extraParams?: Record<string, unknown>;
  isDefault?: boolean;
  status?: string;
}

export interface InterceptIntentPromptConfigItem extends InterceptIntentPromptConfigPayload {
  id: string;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

export async function listInterceptIntentPromptConfigs(query: InterceptIntentPromptConfigQuery): Promise<PageResult<InterceptIntentPromptConfigItem>> {
  const payload = await request<unknown>({ path: '/robots/intercept-intent-prompt-configs', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map((item) => normalizeInterceptIntentPromptConfigItem(item)) };
}

export async function createInterceptIntentPromptConfig(payload: InterceptIntentPromptConfigPayload): Promise<InterceptIntentPromptConfigItem> {
  const response = await request<unknown>({ path: '/robots/intercept-intent-prompt-configs', method: 'POST', body: payload });
  return normalizeInterceptIntentPromptConfigItem(response);
}

export async function updateInterceptIntentPromptConfig(id: string, payload: Partial<InterceptIntentPromptConfigPayload>): Promise<InterceptIntentPromptConfigItem> {
  const response = await request<unknown>({ path: `/robots/intercept-intent-prompt-configs/${id}`, method: 'PATCH', body: payload });
  return normalizeInterceptIntentPromptConfigItem(response);
}

export async function setDefaultInterceptIntentPromptConfig(id: string): Promise<InterceptIntentPromptConfigItem> {
  const response = await request<unknown>({ path: `/robots/intercept-intent-prompt-configs/${id}/default`, method: 'POST' });
  return normalizeInterceptIntentPromptConfigItem(response);
}

export async function removeInterceptIntentPromptConfig(id: string) {
  return request<unknown>({ path: `/robots/intercept-intent-prompt-configs/${id}`, method: 'DELETE' });
}


export interface InterceptIntentTestComment {
  cid?: string;
  text: string;
}

export interface InterceptIntentPromptTestPayload extends Partial<InterceptIntentPromptConfigPayload> {
  promptConfigId?: string;
  robotId?: string;
  comments?: InterceptIntentTestComment[];
  commentsText?: string;
  testComments?: string;
}

export interface InterceptIntentPromptTestResultItem {
  cid: string;
  text: string;
  level: string;
  reason?: string;
  need?: string;
  entry?: string;
  reply?: string;
  risk?: string;
  should: boolean;
  tags: string[];
  /** 仅提示词测试结果使用：false 表示该条所在批次没有得到有效 Coze 返回。 */
  success?: boolean;
  errorMessage?: string;
  batchIndex?: number;
  raw?: Record<string, unknown>;
}

export interface InterceptIntentPromptTestResult {
  ok: boolean;
  /** 有成功结果也有失败结果时为 true；results 始终保留全部输入评论。 */
  partial?: boolean;
  errMsg?: string;
  workflowId?: string;
  executeId?: string;
  logId?: string;
  executeIds?: string[];
  logIds?: string[];
  resultCount?: number;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
  batchSize?: number;
  batchCount?: number;
  completedBatchCount?: number;
  results: InterceptIntentPromptTestResultItem[];
  requestPayload?: Record<string, unknown>;
  responseRaw?: unknown;
}

export async function testInterceptIntentPromptConfig(payload: InterceptIntentPromptTestPayload): Promise<InterceptIntentPromptTestResult> {
  const response = await request<unknown>({
    path: '/robots/intercept-intent-prompt-configs/test',
    method: 'POST',
    body: payload
  });
  const source = unwrapData(response);
  const record = isRecord(source) ? source : {};
  return {
    ok: record.ok === true,
    partial: record.partial === true,
    errMsg: pickString(record, ['errMsg', 'message', 'errorMessage']),
    workflowId: pickString(record, ['workflowId']),
    executeId: pickString(record, ['executeId']),
    logId: pickString(record, ['logId']),
    executeIds: pickArray(record, ['executeIds']).map((item) => String(item || '').trim()).filter(Boolean),
    logIds: pickArray(record, ['logIds']).map((item) => String(item || '').trim()).filter(Boolean),
    resultCount: pickNumber(record, ['resultCount']),
    totalCount: pickNumber(record, ['totalCount']),
    successCount: pickNumber(record, ['successCount']),
    failedCount: pickNumber(record, ['failedCount']),
    batchSize: pickNumber(record, ['batchSize']),
    batchCount: pickNumber(record, ['batchCount']),
    completedBatchCount: pickNumber(record, ['completedBatchCount']),
    results: pickArray(record, ['results']).map(normalizeInterceptIntentPromptTestResultItem),
    requestPayload: firstRecord(record, ['requestPayload']) || undefined,
    responseRaw: record.responseRaw
  };
}


export interface InterceptWorkDecisionPayload {
  workflowId?: string;
  promptConfigId?: string;
  bp?: Record<string, unknown>;
  acct?: Record<string, unknown>;
  video: Record<string, unknown>;
}

export interface InterceptWorkDecisionResult {
  ok: boolean;
  errMsg?: string;
  workflowId?: string;
  shouldRun: boolean;
  reason: string;
  requestPayload?: Record<string, unknown>;
  responseRaw?: unknown;
}

function normalizeInterceptWorkDecisionResult(payload: unknown): InterceptWorkDecisionResult {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  return {
    ok: record.ok === true,
    errMsg: pickString(record, ['errMsg', 'message', 'errorMessage']),
    workflowId: pickString(record, ['workflowId']),
    shouldRun: record.shouldRun === true || String(record.shouldRun || '').toLowerCase() === 'true',
    reason: pickString(record, ['reason']) || '',
    requestPayload: firstRecord(record, ['requestPayload']) || undefined,
    responseRaw: record.responseRaw
  };
}

export async function testInterceptWorkDecision(payload: InterceptWorkDecisionPayload): Promise<InterceptWorkDecisionResult> {
  const response = await request<unknown>({
    path: '/robots/intercept-work-decision/test',
    method: 'POST',
    body: payload
  });
  return normalizeInterceptWorkDecisionResult(response);
}

export async function runInterceptWorkDecision(robotId: string, payload: InterceptWorkDecisionPayload): Promise<InterceptWorkDecisionResult> {
  const response = await request<unknown>({
    path: `/robots/${robotId}/intercept-work-decision`,
    method: 'POST',
    body: payload
  });
  return normalizeInterceptWorkDecisionResult(response);
}

export interface InterceptIntentAnalysisBatchQuery {
  page?: number;
  pageSize?: number;
  robotId?: string;
  status?: string;
  failedRetryOnly?: boolean | string;
}

export interface InterceptIntentAnalysisChunkItem {
  id: string;
  chunkIndex: number;
  status: string;
  captureIds: string[];
  successCount: number;
  failedCount: number;
  retryCount: number;
  executeId?: string;
  errorMessage?: string;
  completedAt?: string;
}

export interface InterceptIntentAnalysisBatchItem {
  id: string;
  batchNo: string;
  robotId: string;
  runId?: string;
  workflowId?: string;
  promptConfigId?: string;
  promptConfigName?: string;
  status: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  batchSize: number;
  errorMessage?: string;
  createdAt?: string;
  completedAt?: string;
  chunks: InterceptIntentAnalysisChunkItem[];
  queued?: boolean;
  async?: boolean;
  message?: string;
}

export async function listInterceptIntentAnalysisBatches(query: InterceptIntentAnalysisBatchQuery): Promise<PageResult<InterceptIntentAnalysisBatchItem>> {
  const payload = await request<unknown>({ path: '/robots/intercept-captures/intent-analysis-batches', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map((item) => normalizeInterceptIntentAnalysisBatchItem(item)) };
}

export async function detailInterceptIntentAnalysisBatch(id: string): Promise<InterceptIntentAnalysisBatchItem> {
  const payload = await request<unknown>({ path: `/robots/intercept-captures/intent-analysis-batches/${id}` });
  return normalizeInterceptIntentAnalysisBatchItem(payload);
}

export async function retryInterceptIntentAnalysisBatch(id: string, chunkIndexes?: number[]): Promise<InterceptIntentAnalysisBatchItem & { retriedChunkCount?: number; queued?: boolean; async?: boolean; message?: string }> {
  const payload = await request<unknown>({
    path: `/robots/intercept-captures/intent-analysis-batches/${id}/retry`,
    method: 'POST',
    body: chunkIndexes?.length ? { chunkIndexes } : {}
  });
  const normalized = normalizeInterceptIntentAnalysisBatchItem(payload) as InterceptIntentAnalysisBatchItem & { retriedChunkCount?: number; queued?: boolean; async?: boolean; message?: string };
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  normalized.queued = record.queued === true;
  normalized.async = record.async === true;
  normalized.message = pickString(record, ['message']);
  normalized.retriedChunkCount = pickNumber(record, ['retriedChunkCount']);
  return normalized;
}



function normalizeInterceptIntentPromptConfigItem(payload: unknown): InterceptIntentPromptConfigItem {
  const source = isRecord(unwrapData(payload)) ? unwrapData(payload) : payload;
  const record = isRecord(source) ? source : {};
  const extraParams = firstRecord(record, ['extraParams']) || {};
  return {
    id: pickString(record, ['id']),
    tenantId: pickString(record, ['tenantId']),
    name: pickString(record, ['name']),
    description: pickString(record, ['description']),
    workflowId: pickString(record, ['workflowId']),
    batchSize: pickNumber(record, ['batchSize']),
    biz: pickString(record, ['biz']),
    cust: pickString(record, ['cust']),
    acctType: pickString(record, ['acctType']),
    acctPos: pickString(record, ['acctPos']),
    tone: pickString(record, ['tone']),
    sellPts: pickString(record, ['sellPts']),
    banRules: pickString(record, ['banRules']),
    nonCust: pickString(record, ['nonCust']),
    dmRule: pickString(record, ['dmRule']),
    entryRules: pickString(record, ['entryRules']),
    videoTitle: pickString(record, ['videoTitle']),
    platform: pickString(record, ['platform']),
    clientName: pickString(record, ['clientName']) || pickString(extraParams, ['clientName']),
    mainBusiness: pickString(record, ['mainBusiness']) || pickString(extraParams, ['mainBusiness']),
    mainProducts: pickString(record, ['mainProducts']) || pickString(extraParams, ['mainProducts']),
    targetScenarios: pickString(record, ['targetScenarios']) || pickString(extraParams, ['targetScenarios']),
    customerPainPoints: pickString(record, ['customerPainPoints']) || pickString(extraParams, ['customerPainPoints']),
    positiveKeywords: pickString(record, ['positiveKeywords']) || pickString(extraParams, ['positiveKeywords']),
    negativeKeywords: pickString(record, ['negativeKeywords']) || pickString(extraParams, ['negativeKeywords']),
    highIntentKeywords: pickString(record, ['highIntentKeywords']) || pickString(extraParams, ['highIntentKeywords']),
    nonLeadSignals: pickString(record, ['nonLeadSignals']) || pickString(extraParams, ['nonLeadSignals']),
    allowedOffers: pickString(record, ['allowedOffers']) || pickString(extraParams, ['allowedOffers']),
    accountPersona: pickString(record, ['accountPersona']) || pickString(extraParams, ['accountPersona']),
    forbiddenClaims: pickString(record, ['forbiddenClaims']) || pickString(extraParams, ['forbiddenClaims']),
    ctaPolicy: pickString(record, ['ctaPolicy']) || pickString(extraParams, ['ctaPolicy']),
    workflowMode: pickString(record, ['workflowMode']) || pickString(extraParams, ['workflowMode']),
    videoDesc: pickString(record, ['videoDesc']) || pickString(extraParams, ['videoDesc']),
    videoRelevanceRules: pickString(record, ['videoRelevanceRules']) || pickString(extraParams, ['videoRelevanceRules']),
    commentScoringRules: pickString(record, ['commentScoringRules']) || pickString(extraParams, ['commentScoringRules']),
    riskRoutingRules: pickString(record, ['riskRoutingRules']) || pickString(extraParams, ['riskRoutingRules']),
    scriptGenerationRules: pickString(record, ['scriptGenerationRules']) || pickString(extraParams, ['scriptGenerationRules']),
    businessProfile: record.businessProfile ?? extraParams.businessProfile,
    extraParams,
    isDefault: record.isDefault === true || String(record.isDefault || '').toLowerCase() === 'true',
    status: pickString(record, ['status']) || 'ENABLED',
    createdAt: pickString(record, ['createdAt']),
    updatedAt: pickString(record, ['updatedAt']),
    deletedAt: pickString(record, ['deletedAt'])
  };
}

function normalizeInterceptCaptureViewPreset(payload: unknown): InterceptCaptureViewPreset {
  const source = isRecord(unwrapData(payload)) ? unwrapData(payload) : payload;
  const record = isRecord(source) ? source : {};
  const columns = Array.isArray(record.columns) ? record.columns : [];
  return {
    id: pickString(record, ['id']),
    tenantId: pickString(record, ['tenantId']),
    userId: pickString(record, ['userId']),
    name: pickString(record, ['name']),
    isDefault: record.isDefault === true || String(record.isDefault || '').toLowerCase() === 'true',
    columns: columns
      .map((item, index) => {
        const column = isRecord(item) ? item : {};
        const key = pickString(column, ['key']);
        if (!key) return null;
        return {
          key,
          visible: column.visible !== false && String(column.visible || '').toLowerCase() !== 'false',
          order: Number.isFinite(Number(column.order)) ? Number(column.order) : index,
        };
      })
      .filter((item): item is InterceptCaptureViewColumn => Boolean(item))
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
    createdAt: pickString(record, ['createdAt']),
    updatedAt: pickString(record, ['updatedAt']),
  };
}

function normalizeInterceptCaptureDeleteResult(payload: unknown): InterceptCaptureDeleteResult {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  const deleted = Number(record.deleted ?? record.count ?? record.total ?? 0);
  return { deleted: Number.isFinite(deleted) ? deleted : 0 };
}

function normalizeInterceptCaptureItem(payload: unknown): InterceptCaptureItem {
  const source = isRecord(unwrapData(payload)) ? unwrapData(payload) : payload;
  const record = isRecord(source) ? source : {};
  const robot = firstRecord(record, ['robot']);
  return {
    id: pickString(record, ['id', '_id']),
    tenantId: pickString(record, ['tenantId']),
    robotId: pickString(record, ['robotId']) || pickString(robot, ['id']),
    runId: pickString(record, ['runId']),
    platform: pickString(record, ['platform']),
    accountAlias: pickString(record, ['accountAlias']),
    targetType: pickString(record, ['targetType']),
    targetUrl: pickString(record, ['targetUrl']),
    homepageUrl: pickString(record, ['homepageUrl']),
    contentUrl: pickString(record, ['contentUrl']),
    platformContentId: pickString(record, ['platformContentId']),
    contentTitle: pickString(record, ['contentTitle']),
    capturedCommentCount: pickNumber(record, ['capturedCommentCount']) || undefined,
    publishTimeIso: pickString(record, ['publishTimeIso']),
    commentId: pickString(record, ['commentId']),
    parentCommentId: pickString(record, ['parentCommentId']),
    userId: pickString(record, ['userId']),
    nickname: pickString(record, ['nickname']),
    commentText: pickString(record, ['commentText']),
    commentTimeIso: pickString(record, ['commentTimeIso']),
    visibleRegion: pickString(record, ['visibleRegion']),
    capturedAt: pickString(record, ['capturedAt']),
    createdAt: pickString(record, ['createdAt']),
    robot,
    raw: firstRecord(record, ['raw'])
  };
}


export interface PrivateMessageRobotPayload {
  tenantId?: string;
  name: string;
  platform: string;
  expireAt?: string;
  remark?: string;
  enabled?: boolean;
  paused?: boolean;
  minSendIntervalSeconds?: number;
  maxSendIntervalSeconds?: number;
  workStartTime?: string;
  workEndTime?: string;
  sleepStartTime?: string;
  sleepEndTime?: string;
  dailySendLimit?: number;
  hourlySendLimit?: number;
  userTouchIntervalDays?: number;
  maxConsecutiveFailures?: number;
  claimBatchSize?: number;
  defaultMessageTemplate?: string;
}

export interface PrivateMessageRobotQuery extends RobotQuery {
  authStatus?: string;
  executionStatus?: string;
}

export async function listPrivateMessageRobots(query: PrivateMessageRobotQuery): Promise<PageResult<RobotItem>> {
  const payload = await request<unknown>({
    path: '/robots/lead-private-message',
    query
  });
  const page = normalizePageResult<unknown>(payload);
  return {
    ...page,
    items: page.items.map((item) => normalizeRobotItem(item))
  };
}

export async function createPrivateMessageRobot(payload: PrivateMessageRobotPayload): Promise<RobotItem> {
  const response = await request<unknown>({
    path: '/robots/lead-private-message',
    method: 'POST',
    body: payload
  });
  return normalizeRobotItem(response);
}

export async function updatePrivateMessageRobot(id: string, payload: Partial<PrivateMessageRobotPayload>): Promise<RobotItem> {
  const response = await request<unknown>({
    path: `/robots/lead-private-message/${id}`,
    method: 'PUT',
    body: payload
  });
  return normalizeRobotItem(response);
}

export async function removePrivateMessageRobot(id: string) {
  return request<unknown>({ path: `/robots/lead-private-message/${id}`, method: 'DELETE' });
}

export async function pausePrivateMessageRobot(id: string) {
  return request<unknown>({ path: `/robots/lead-private-message/${id}/pause`, method: 'POST' });
}

export async function resumePrivateMessageRobot(id: string) {
  return request<unknown>({ path: `/robots/lead-private-message/${id}/resume`, method: 'POST' });
}

export interface CreatePrivateMessageTasksPayload {
  captureIds: string[];
  robotIds: string[];
  plannedStartAt: string;
  plannedEndAt: string;
  sendMode?: string;
  remark?: string;
  messageOverrides?: Array<{ captureId: string; messageFinal: string }>;
}

export interface PrivateMessageTaskCreateItemResult {
  captureId: string;
  created: boolean;
  taskId?: string;
  reason?: string;
}

export interface PrivateMessageTaskCreateResult {
  batchId: string;
  batchNo?: string;
  selectedCount: number;
  createdCount: number;
  skippedCount: number;
  items: PrivateMessageTaskCreateItemResult[];
}

export async function createPrivateMessageTasks(payload: CreatePrivateMessageTasksPayload): Promise<PrivateMessageTaskCreateResult> {
  const response = await request<unknown>({
    path: '/robots/lead-private-message-tasks',
    method: 'POST',
    body: payload
  });
  const source = unwrapData(response);
  const record = isRecord(source) ? source : {};
  return {
    batchId: pickString(record, ['batchId']),
    batchNo: pickString(record, ['batchNo']),
    selectedCount: pickNumber(record, ['selectedCount']),
    createdCount: pickNumber(record, ['createdCount']),
    skippedCount: pickNumber(record, ['skippedCount']),
    items: pickArray(record, ['items']).map((item) => {
      const row = isRecord(item) ? item : {};
      return {
        captureId: pickString(row, ['captureId']),
        created: row.created === true,
        taskId: pickString(row, ['taskId']),
        reason: pickString(row, ['reason'])
      };
    })
  };
}

export interface PrivateMessageTaskQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  platform?: string;
  robotId?: string;
  status?: string;
  intentLevel?: string;
  riskLevel?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  createdStartAt?: string;
  createdEndAt?: string;
}

export interface PrivateMessageTaskItem {
  id: string;
  taskNo: string;
  batchId?: string;
  batchNo?: string;
  robotId?: string;
  robotName?: string;
  platform?: string;
  targetNickname?: string;
  sourceCommentText?: string;
  sourceContentTitle?: string;
  sourceContentUrl?: string;
  intentLevel?: string;
  messageDraft?: string;
  messageFinal?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  status?: string;
  sendAttemptCount?: number;
  lastSendAt?: string;
  sentAt?: string;
  sendError?: string;
  createdAt?: string;
  riskLevel?: string;
}

export async function listPrivateMessageTasks(query: PrivateMessageTaskQuery): Promise<PageResult<PrivateMessageTaskItem>> {
  const payload = await request<unknown>({ path: '/robots/lead-private-message-tasks', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map((item) => normalizePrivateMessageTaskItem(item)) };
}

export async function cancelPrivateMessageTask(id: string) {
  return request<unknown>({ path: `/robots/lead-private-message-tasks/${id}/cancel`, method: 'POST' });
}

export async function retryPrivateMessageTask(id: string) {
  return request<unknown>({ path: `/robots/lead-private-message-tasks/${id}/retry`, method: 'POST' });
}

export async function updatePrivateMessageTaskMessage(id: string, messageFinal: string): Promise<PrivateMessageTaskItem> {
  const payload = await request<unknown>({
    path: `/robots/lead-private-message-tasks/${id}/message`,
    method: 'PATCH',
    body: { messageFinal }
  });
  return normalizePrivateMessageTaskItem(payload);
}

export async function deletePrivateMessageTask(id: string): Promise<InterceptCaptureDeleteResult> {
  const payload = await request<unknown>({ path: `/robots/lead-private-message-tasks/${id}`, method: 'DELETE' });
  return normalizeInterceptCaptureDeleteResult(payload);
}

export async function deletePrivateMessageTaskBatch(ids: string[]): Promise<InterceptCaptureDeleteResult> {
  const payload = await request<unknown>({ path: '/robots/lead-private-message-tasks/batch', method: 'DELETE', body: { ids } });
  return normalizeInterceptCaptureDeleteResult(payload);
}

export async function clearPrivateMessageTasks(query: PrivateMessageTaskQuery): Promise<InterceptCaptureDeleteResult> {
  const payload = await request<unknown>({ path: '/robots/lead-private-message-tasks', method: 'DELETE', query });
  return normalizeInterceptCaptureDeleteResult(payload);
}

function normalizeInterceptIntentPromptTestResultItem(payload: unknown): InterceptIntentPromptTestResultItem {
  const record = isRecord(payload) ? payload : {};
  return {
    cid: pickString(record, ['cid', 'id']),
    text: pickString(record, ['text', 'commentText']),
    level: pickString(record, ['level', 'intentLevel']).toUpperCase() || 'C',
    reason: pickString(record, ['reason', 'judgeReason', 'intentReason']),
    need: pickString(record, ['need']),
    entry: pickString(record, ['entry', 'entryPointSummary', 'entryDecision']),
    reply: pickString(record, ['reply', 'messageDraft', 'privateMessageDraft']),
    risk: pickString(record, ['risk', 'riskLevel']) || 'low',
    should: record.should === true || String(record.should || '').toLowerCase() === 'true',
    tags: pickArray(record, ['tags']).map((item) => String(item)).filter(Boolean),
    success: record.success !== false,
    errorMessage: pickString(record, ['errorMessage']),
    batchIndex: pickNumber(record, ['batchIndex']),
    raw: firstRecord(record, ['raw']) || undefined
  };
}

function normalizeInterceptIntentAnalysisBatchItem(payload: unknown): InterceptIntentAnalysisBatchItem {
  const source = isRecord(unwrapData(payload)) ? unwrapData(payload) : payload;
  const record = isRecord(source) ? source : {};
  return {
    id: pickString(record, ['id']),
    batchNo: pickString(record, ['batchNo']),
    robotId: pickString(record, ['robotId']),
    runId: pickString(record, ['runId']),
    workflowId: pickString(record, ['workflowId']),
    promptConfigId: pickString(record, ['promptConfigId']),
    promptConfigName: pickString(record, ['promptConfigName']),
    status: pickString(record, ['status']),
    totalCount: pickNumber(record, ['totalCount']),
    successCount: pickNumber(record, ['successCount']),
    failedCount: pickNumber(record, ['failedCount']),
    batchSize: pickNumber(record, ['batchSize']),
    errorMessage: pickString(record, ['errorMessage']),
    createdAt: pickString(record, ['createdAt']),
    completedAt: pickString(record, ['completedAt']),
    chunks: pickArray(record, ['chunks']).map((item) => {
      const row = isRecord(item) ? item : {};
      return {
        id: pickString(row, ['id']),
        chunkIndex: pickNumber(row, ['chunkIndex']),
        status: pickString(row, ['status']),
        captureIds: pickArray(row, ['captureIds']).map((value) => String(value)).filter(Boolean),
        successCount: pickNumber(row, ['successCount']),
        failedCount: pickNumber(row, ['failedCount']),
        retryCount: pickNumber(row, ['retryCount']),
        executeId: pickString(row, ['executeId']),
        errorMessage: pickString(row, ['errorMessage']),
        completedAt: pickString(row, ['completedAt'])
      };
    })
  };
}

function normalizePrivateMessageTaskItem(payload: unknown): PrivateMessageTaskItem {
  const source = isRecord(unwrapData(payload)) ? unwrapData(payload) : payload;
  const record = isRecord(source) ? source : {};
  return {
    id: pickString(record, ['id']),
    taskNo: pickString(record, ['taskNo']),
    batchId: pickString(record, ['batchId']),
    batchNo: pickString(record, ['batchNo']),
    robotId: pickString(record, ['robotId']),
    robotName: pickString(record, ['robotName']),
    platform: pickString(record, ['platform']),
    targetNickname: pickString(record, ['targetNickname']),
    sourceCommentText: pickString(record, ['sourceCommentText']),
    sourceContentTitle: pickString(record, ['sourceContentTitle']),
    sourceContentUrl: pickString(record, ['sourceContentUrl']),
    intentLevel: pickString(record, ['intentLevel']),
    messageDraft: pickString(record, ['messageDraft']),
    messageFinal: pickString(record, ['messageFinal']),
    plannedStartAt: pickString(record, ['plannedStartAt']),
    plannedEndAt: pickString(record, ['plannedEndAt']),
    status: pickString(record, ['status']),
    sendAttemptCount: pickNumber(record, ['sendAttemptCount']),
    lastSendAt: pickString(record, ['lastSendAt']),
    sentAt: pickString(record, ['sentAt']),
    sendError: pickString(record, ['sendError']),
    createdAt: pickString(record, ['createdAt']),
    riskLevel: pickString(record, ['riskLevel'])
  };
}
