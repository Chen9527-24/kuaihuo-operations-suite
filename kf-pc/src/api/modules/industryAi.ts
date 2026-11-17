import { request } from '@/api/core/http';
import {
  isRecord,
  normalizeOptions,
  normalizePageResult,
  pickArray,
  pickNumber,
  pickString,
  unwrapData,
  type PageResult,
  type SelectOption
} from '@/utils/apiData';

export type IndustryAiChannel = 'DM' | 'COMMENT' | 'BOTH';
export type IndustryAiPackStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type IndustryAiRobotStatus = 'DRAFT' | 'ENABLED' | 'DISABLED';
export type IndustryAiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type IndustryAiReplyMode = 'AI_REPLY' | 'SUGGEST_ONLY' | 'HANDOFF';
export type IndustryAiFixedReplyMatchType = 'EXACT' | 'CONTAINS' | 'KEYWORD_COMBINATION';
export type IndustryAiFixedReplyType = 'DIRECT_REPLY' | 'COLLECT_INFO' | 'HANDOFF';
export type IndustryAiGuardrailType = 'FORBIDDEN' | 'REQUIRED' | 'HANDOFF';
export type IndustryAiServiceCapabilityKey =
  | 'PRODUCT_INFO'
  | 'SIZE_SELECTION'
  | 'PRICE_PROMOTION'
  | 'SHIPPING_LOGISTICS'
  | 'ORDER_CHANGE'
  | 'AFTER_SALES'
  | 'REFUND_COMPENSATION'
  | 'COMPLAINT'
  | 'PAYMENT_SECURITY'
  | 'MANUAL_SERVICE'
  | 'GENERAL_CONSULTATION';
export type IndustryAiServiceCapabilityMode = 'DIRECT_REPLY' | 'COLLECT_INFO' | 'HANDOFF_ONLY';
export type IndustryAiOutOfScopePolicy = 'GUIDE_BACK' | 'NO_REPLY' | 'HANDOFF';
export type IndustryAiSensitiveMessagePolicy = 'HANDOFF' | 'NO_REPLY';
export type IndustryAiConversationDecisionCategory = 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'SENSITIVE';
export type IndustryAiConversationDecisionAction = 'CONTINUE' | 'GUIDE_BACK' | 'HANDOFF' | 'NO_REPLY';
export type IndustryAiConversationBusinessType = 'PRE_SALE' | 'IN_SALE' | 'AFTER_SALE' | 'MIXED' | 'NON_BUSINESS' | 'SENSITIVE';
export type IndustryAiCustomerBusinessStage =
  | 'NORMAL_INQUIRY'
  | 'DECISION_HESITATION'
  | 'PRICE_OBJECTION'
  | 'WAITING_PROCESS'
  | 'REPEATED_FOLLOWUP'
  | 'LIGHT_DISSATISFIED'
  | 'STRONG_DISSATISFIED'
  | 'CANCEL_REFUND_TENDENCY'
  | 'COMPLAINT_TENDENCY'
  | 'HIGH_RISK_HUMAN';
export type IndustryAiBusinessRiskLevel = 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';
export type IndustryAiBusinessHandoffDecision = 'NO_NEED' | 'SUGGEST_HUMAN' | 'REQUIRE_HUMAN';

export interface IndustryAiServiceCapability {
  key: IndustryAiServiceCapabilityKey;
  mode: IndustryAiServiceCapabilityMode;
  note?: string;
}

export const INDUSTRY_AI_SERVICE_CAPABILITY_OPTIONS: Array<{ label: string; value: IndustryAiServiceCapabilityKey }> = [
  { label: '商品信息与规格说明', value: 'PRODUCT_INFO' },
  { label: '尺码 / 适配建议', value: 'SIZE_SELECTION' },
  { label: '价格、库存与优惠', value: 'PRICE_PROMOTION' },
  { label: '发货、物流与订单状态', value: 'SHIPPING_LOGISTICS' },
  { label: '改地址、取消与订单变更', value: 'ORDER_CHANGE' },
  { label: '售后、退换与问题收集', value: 'AFTER_SALES' },
  { label: '退款、补偿与资金争议', value: 'REFUND_COMPENSATION' },
  { label: '投诉与责任争议', value: 'COMPLAINT' },
  { label: '支付、账号与隐私安全', value: 'PAYMENT_SECURITY' },
  { label: '人工客服接入', value: 'MANUAL_SERVICE' },
  { label: '一般咨询', value: 'GENERAL_CONSULTATION' }
];

export const INDUSTRY_AI_SERVICE_CAPABILITY_MODE_OPTIONS: Array<{ label: string; value: IndustryAiServiceCapabilityMode; description: string }> = [
  { label: '可直接说明', value: 'DIRECT_REPLY', description: '仅依据已配置的店铺信息说明，不代表已查询订单或执行操作。' },
  { label: '收集信息后核实', value: 'COLLECT_INFO', description: '先说明需要的最少信息，再由人工或业务系统确认。' },
  { label: '仅人工 / 业务系统处理', value: 'HANDOFF_ONLY', description: '不承诺结果、时效或已经完成处理。' }
];

export interface IndustryAiScenarioExample {
  id?: string;
  userInput: string;
  recommendedReply: string;
  notes?: string;
  qualityScore?: number;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiScenario {
  id?: string;
  code: string;
  name: string;
  channel?: IndustryAiChannel;
  triggerPhrases?: string[];
  serviceKey?: IndustryAiServiceCapabilityKey;
  intentDescription?: string;
  replyGoal?: string;
  replyFramework?: string;
  riskLevel?: IndustryAiRiskLevel;
  replyMode?: IndustryAiReplyMode;
  priority?: number;
  enabled?: boolean;
  examples?: IndustryAiScenarioExample[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiGuardrail {
  id?: string;
  type: IndustryAiGuardrailType;
  ruleContent: string;
  priority?: number;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiCapabilityPackVersion {
  id: string;
  packId?: string;
  versionNo: number;
  status: IndustryAiPackStatus;
  tone?: string;
  replyPrinciples?: string;
  riskPolicy?: string;
  handoffPolicy?: string;
  scenarios?: IndustryAiScenario[];
  guardrails?: IndustryAiGuardrail[];
  scenarioCount?: number;
  guardrailCount?: number;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiCapabilityPack {
  id: string;
  tenantId?: string | null;
  scope?: 'PLATFORM' | 'TENANT';
  industryCode: string;
  industryName: string;
  channel: IndustryAiChannel;
  name: string;
  description?: string;
  status: IndustryAiPackStatus;
  latestVersion?: IndustryAiCapabilityPackVersion;
  publishedVersion?: IndustryAiCapabilityPackVersion;
  versions?: IndustryAiCapabilityPackVersion[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiCapabilityPackPayload {
  industryCode: string;
  industryName: string;
  channel: IndustryAiChannel;
  name: string;
  description?: string;
  version: {
    tone?: string;
    replyPrinciples?: string;
    riskPolicy?: string;
    handoffPolicy?: string;
    scenarios?: IndustryAiScenario[];
    guardrails?: IndustryAiGuardrail[];
  };
}

export interface IndustryAiCapabilityPackQuery {
  keyword?: string;
  industryCode?: string;
  channel?: IndustryAiChannel;
  status?: IndustryAiPackStatus;
  page?: number;
  pageSize?: number;
}

export interface IndustryAiCapabilityTemplate {
  code: string;
  name: string;
  industryCode: string;
  industryName: string;
  channel: IndustryAiChannel;
  description?: string;
  scenarioCount?: number;
  exampleCount?: number;
  guardrailCount?: number;
  defaultServiceCapabilities?: IndustryAiServiceCapability[];
}

export interface IndustryAiCapabilityPackOption extends SelectOption {
  industryCode?: string;
  industryName?: string;
  channel?: IndustryAiChannel;
  versionId?: string;
  versionNo?: number;
}

export interface IndustryAiFixedReplyRule {
  id: string;
  robotId?: string;
  tenantId?: string;
  name: string;
  channel: IndustryAiChannel;
  matchType: IndustryAiFixedReplyMatchType;
  triggerPhrases: string[];
  requiredKeywords: string[];
  excludedKeywords: string[];
  replyType: IndustryAiFixedReplyType;
  replyContent: string;
  priority: number;
  enabled: boolean;
  remark?: string;
  /** 命中统计仅用于行业 AI 测试与后续正式接入追踪，不参与规则保存。 */
  matchCount?: number;
  lastMatchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type IndustryAiFixedReplyRulePayload = Omit<
  IndustryAiFixedReplyRule,
  'id' | 'robotId' | 'tenantId' | 'matchCount' | 'lastMatchedAt' | 'createdAt' | 'updatedAt'
>;

export interface IndustryAiFixedReplyMatchPreviewItem {
  id: string;
  name: string;
  matchType: IndustryAiFixedReplyMatchType;
  replyType: IndustryAiFixedReplyType;
  priority: number;
  replyContent: string;
  matchedPhrases: string[];
  requiredKeywords: string[];
  selected: boolean;
}

export interface IndustryAiFixedReplyRulePreviewResult {
  messageContent: string;
  matched: boolean;
  selected: IndustryAiFixedReplyMatchPreviewItem | null;
  candidates: IndustryAiFixedReplyMatchPreviewItem[];
}

export interface IndustryAiFixedReplyRulePotentialConflict {
  id: string;
  name: string;
  reason: string;
  priority: number;
}

export interface IndustryAiFixedReplyRulePrecheckResult {
  valid: boolean;
  exactConflict: { id: string; name: string } | null;
  potentialConflicts: IndustryAiFixedReplyRulePotentialConflict[];
}

export interface IndustryAiStoreServiceRules {
  shippingRule?: string;
  logisticsRule?: string;
  orderChangeRule?: string;
  afterSalesRule?: string;
  refundRule?: string;
  complaintRule?: string;
  experienceRule?: string;
}

export interface IndustryAiTestOrderContext {
  platformOrderNo?: string;
  orderStatus?: string;
  fulfillmentStatus?: string;
  logisticsStatus?: string;
  afterSalesStatus?: string;
  refundStatus?: string;
  orderNotes?: string;
}

export interface IndustryAiOrderServiceContextTrace {
  source?: 'MOCK' | 'NONE';
  hasOrderContext?: boolean;
  platformOrderNo?: string | null;
  orderStatus?: string | null;
  fulfillmentStatus?: string | null;
  logisticsStatus?: string | null;
  afterSalesStatus?: string | null;
  refundStatus?: string | null;
  orderNoteCount?: number;
  recentOrderNotes?: string[];
  customerEmotion?: { code?: string; label?: string; reason?: string };
  previousEmotion?: { code?: string; label?: string } | null;
  serviceAction?: { code?: string; label?: string; requiresOrder?: boolean; canUseOrderContext?: boolean; nextStep?: string };
  suggestedOrderNote?: string;
  replyContextSummary?: string;
  actionExecutionState?: 'SIMULATED_NOT_EXECUTED' | 'REAL_ACTION_REQUIRED';
  actionExecutionNote?: string;
  noteWriteMode?: 'SIMULATED_APPEND_ONLY';
}

export interface IndustryAiCustomerCarePlan {
  focusCode?: 'LOGISTICS_URGE' | 'ORDER_CHANGE' | 'AFTER_SALES' | 'REFUND' | 'COMPLAINT' | 'GENERAL';
  focusLabel?: string;
  customerConcern?: string;
  actionFirstGuidance?: string;
  careGuidance?: string;
}

export interface IndustryAiConversationBusinessContext {
  conversationType?: IndustryAiConversationBusinessType;
  conversationTypeLabel?: string;
  customerIntent?: string;
  customerStage?: IndustryAiCustomerBusinessStage;
  customerStageLabel?: string;
  emotionLevel?: string;
  emotionLabel?: string;
  businessGoal?: string[];
  conversationStrategy?: string;
  riskLevel?: IndustryAiBusinessRiskLevel;
  riskLevelLabel?: string;
  handoffDecision?: IndustryAiBusinessHandoffDecision;
  handoffDecisionLabel?: string;
  nextAction?: string;
  retentionCount?: number;
  shouldStopRetention?: boolean;
}

export interface IndustryAiReplyGenerationTrace {
  mode?: 'RULE' | 'LLM' | 'FIXED_REPLY' | 'POLICY' | 'FALLBACK';
  provider?: 'LOCAL_RULE' | 'DEEPSEEK' | 'FIXED_REPLY' | 'CONVERSATION_POLICY' | 'SAFETY_FALLBACK';
  modelCalled?: boolean;
  modelName?: string | null;
  strategyCode?: string;
  strategyLabel?: string;
  escalationTriggered?: boolean;
  repetitionSuppressed?: boolean;
  actionFirst?: boolean;
  reason?: string;
}

export interface IndustryAiConversationPolicy {
  outOfScopePolicy: IndustryAiOutOfScopePolicy;
  outOfScopeReply?: string;
  sensitiveMessagePolicy: IndustryAiSensitiveMessagePolicy;
  sensitiveReply?: string;
}

export interface IndustryAiRobotPackSnapshot {
  packId?: string;
  packName?: string;
  industryCode?: string;
  industryName?: string;
  channel?: IndustryAiChannel;
  versionId?: string;
  versionNo?: number;
  tone?: string;
  replyPrinciples?: string;
  riskPolicy?: string;
  handoffPolicy?: string;
}

export interface IndustryAiRobot {
  id: string;
  tenantId?: string;
  name: string;
  channel: Exclude<IndustryAiChannel, 'BOTH'>;
  status: IndustryAiRobotStatus;
  industryCode?: string;
  industryName?: string;
  brandName?: string;
  businessProfile?: string;
  businessRules?: string;
  storeServiceRules?: IndustryAiStoreServiceRules;
  outOfScopePolicy?: IndustryAiOutOfScopePolicy;
  outOfScopeReply?: string;
  sensitiveMessagePolicy?: IndustryAiSensitiveMessagePolicy;
  sensitiveReply?: string;
  conversationPolicy?: IndustryAiConversationPolicy;
  serviceCapabilities?: IndustryAiServiceCapability[];
  fixedReplyRuleCount?: number;
  customPrompt?: string;
  remark?: string;
  capabilityPackId: string;
  capabilityPackVersionId: string;
  capabilityPackSnapshot?: IndustryAiRobotPackSnapshot;
  capabilityPack?: Pick<IndustryAiCapabilityPack, 'id' | 'name' | 'industryCode' | 'industryName' | 'channel'>;
  capabilityPackVersion?: Pick<IndustryAiCapabilityPackVersion, 'id' | 'packId' | 'versionNo'>;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiRobotPayload {
  name: string;
  channel: Exclude<IndustryAiChannel, 'BOTH'>;
  status?: IndustryAiRobotStatus;
  brandName?: string;
  businessProfile?: string;
  businessRules?: string;
  storeServiceRules?: IndustryAiStoreServiceRules;
  outOfScopePolicy?: IndustryAiOutOfScopePolicy;
  outOfScopeReply?: string;
  sensitiveMessagePolicy?: IndustryAiSensitiveMessagePolicy;
  sensitiveReply?: string;
  serviceCapabilities?: IndustryAiServiceCapability[];
  customPrompt?: string;
  remark?: string;
  capabilityPackVersionId: string;
}

export interface IndustryAiRobotQuery {
  keyword?: string;
  channel?: Exclude<IndustryAiChannel, 'BOTH'>;
  status?: IndustryAiRobotStatus;
  page?: number;
  pageSize?: number;
}

export interface IndustryAiTestMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

export interface IndustryAiTestTrace {
  packName?: string;
  packVersion?: number;
  source?: 'deepseek' | 'fixed_reply' | 'safe_fallback' | 'policy' | 'order_context';
  replySuppressed?: boolean;
  conversationDecision?: {
    category?: IndustryAiConversationDecisionCategory;
    action?: IndustryAiConversationDecisionAction;
    reasonCode?: string;
    reasonLabel?: string;
    scopeSignals?: string[];
    replySuppressed?: boolean;
  };
  customerCarePlan?: IndustryAiCustomerCarePlan;
  orderServiceContext?: IndustryAiOrderServiceContextTrace;
  businessContext?: IndustryAiConversationBusinessContext;
  replyGeneration?: IndustryAiReplyGenerationTrace;
  fixedReplyRule?: {
    id?: string;
    name?: string;
    matchType?: IndustryAiFixedReplyMatchType;
    replyType?: IndustryAiFixedReplyType;
    priority?: number;
    matchCount?: number;
    lastMatchedAt?: string | null;
    matchedPhrases?: string[];
    requiredKeywords?: string[];
  };
  scenarioId?: string;
  scenarioName?: string;
  scenarioCode?: string;
  riskLevel?: IndustryAiRiskLevel;
  shouldHandoff?: boolean;
  replyMode?: IndustryAiReplyMode;
  model?: string;
  elapsedMs?: number;
  requestId?: string;
  replyQuality?: {
    status?: 'PASSED' | 'RETRIED' | 'FALLBACK';
    initialIssue?: string;
    initialFinishReason?: string;
    retryFinishReason?: string;
  };
  serviceCapability?: {
    key?: IndustryAiServiceCapabilityKey;
    label?: string;
    mode?: IndustryAiServiceCapabilityMode;
    note?: string;
    source?: 'ROBOT_CONFIG' | 'SAFE_DEFAULT';
  };
}

export interface IndustryAiTestSession {
  id: string;
  robotId: string;
  title?: string;
  messages?: IndustryAiTestMessage[];
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryAiTestChatResult {
  sessionId: string;
  message: IndustryAiTestMessage;
  trace: IndustryAiTestTrace;
}

export async function listIndustryAiCapabilityPacks(query: IndustryAiCapabilityPackQuery): Promise<PageResult<IndustryAiCapabilityPack>> {
  const payload = await request<unknown>({ path: '/industry-ai/capability-packs', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map((item) => normalizePack(item)) };
}

export async function listIndustryAiCapabilityTemplates(): Promise<IndustryAiCapabilityTemplate[]> {
  const payload = await request<unknown>({ path: '/industry-ai/capability-packs/templates' });
  const source = unwrapData(payload);
  return pickArray(source).map((item) => normalizeCapabilityTemplate(item));
}

export async function importIndustryAiCapabilityTemplate(payload: { templateCode: string; name?: string }): Promise<IndustryAiCapabilityPack> {
  const response = await request<unknown>({ path: '/industry-ai/capability-packs/import-template', method: 'POST', body: payload });
  return normalizePack(unwrapData(response));
}

export async function listIndustryAiCapabilityPackOptions(channel?: IndustryAiChannel): Promise<IndustryAiCapabilityPackOption[]> {
  const payload = await request<unknown>({ path: '/industry-ai/capability-packs/options', query: channel ? { channel } : undefined });
  return normalizeOptions(payload).map((item) => {
    const source = isRecord(item) ? item : {};
    // 后端升级前只返回了通用 SelectOption.value；这里同时兼容 value / versionId，避免 el-select 看似选中但实际绑定 undefined。
    const versionId = pickString(source, ['versionId', 'value', 'id']) || item.value;
    return {
      ...item,
      value: versionId,
      industryCode: pickString(source, ['industryCode']),
      industryName: pickString(source, ['industryName']),
      channel: pickString(source, ['channel']) as IndustryAiChannel,
      versionId,
      versionNo: pickNumber(source, ['versionNo'])
    };
  });
}

export async function getIndustryAiCapabilityPack(id: string): Promise<IndustryAiCapabilityPack> {
  const payload = await request<unknown>({ path: `/industry-ai/capability-packs/${id}` });
  return normalizePack(unwrapData(payload));
}

export async function createIndustryAiCapabilityPack(payload: IndustryAiCapabilityPackPayload): Promise<IndustryAiCapabilityPack> {
  const response = await request<unknown>({ path: '/industry-ai/capability-packs', method: 'POST', body: payload });
  return normalizePack(unwrapData(response));
}

export async function updateIndustryAiCapabilityPack(
  id: string,
  payload: Partial<IndustryAiCapabilityPackPayload> & { versionId?: string }
): Promise<IndustryAiCapabilityPack> {
  const response = await request<unknown>({ path: `/industry-ai/capability-packs/${id}`, method: 'PATCH', body: payload });
  return normalizePack(unwrapData(response));
}

export async function publishIndustryAiCapabilityPack(id: string, versionId?: string): Promise<IndustryAiCapabilityPack> {
  const response = await request<unknown>({ path: `/industry-ai/capability-packs/${id}/publish`, method: 'POST', body: { versionId } });
  return normalizePack(unwrapData(response));
}

export async function removeIndustryAiCapabilityPack(id: string) {
  return request<unknown>({ path: `/industry-ai/capability-packs/${id}`, method: 'DELETE' });
}

export async function listIndustryAiRobots(query: IndustryAiRobotQuery): Promise<PageResult<IndustryAiRobot>> {
  const payload = await request<unknown>({ path: '/industry-ai/robots', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map((item) => normalizeRobot(item)) };
}

export async function getIndustryAiRobot(id: string): Promise<IndustryAiRobot> {
  const payload = await request<unknown>({ path: `/industry-ai/robots/${id}` });
  return normalizeRobot(unwrapData(payload));
}

export async function createIndustryAiRobot(payload: IndustryAiRobotPayload): Promise<IndustryAiRobot> {
  const response = await request<unknown>({ path: '/industry-ai/robots', method: 'POST', body: payload });
  return normalizeRobot(unwrapData(response));
}

export async function updateIndustryAiRobot(id: string, payload: Partial<IndustryAiRobotPayload>): Promise<IndustryAiRobot> {
  const response = await request<unknown>({ path: `/industry-ai/robots/${id}`, method: 'PATCH', body: payload });
  return normalizeRobot(unwrapData(response));
}

export async function removeIndustryAiRobot(id: string) {
  return request<unknown>({ path: `/industry-ai/robots/${id}`, method: 'DELETE' });
}

export async function listIndustryAiFixedReplyRules(robotId: string): Promise<IndustryAiFixedReplyRule[]> {
  const payload = await request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules`,
    skipGlobalError: true
  });
  const source = unwrapData(payload);
  const list = Array.isArray(source)
    ? source
    : isRecord(source)
      ? pickArray(source, ['items', 'records', 'list', 'rows', 'rules', 'data'])
      : [];
  return list.map((item) => normalizeFixedReplyRule(item));
}

export async function createIndustryAiFixedReplyRule(robotId: string, payload: IndustryAiFixedReplyRulePayload): Promise<IndustryAiFixedReplyRule> {
  const response = await request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules`,
    method: 'POST',
    body: payload,
    skipGlobalError: true
  });
  return normalizeFixedReplyRule(unwrapData(response));
}

export async function updateIndustryAiFixedReplyRule(robotId: string, ruleId: string, payload: IndustryAiFixedReplyRulePayload): Promise<IndustryAiFixedReplyRule> {
  const response = await request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules/${ruleId}`,
    method: 'PATCH',
    body: payload,
    skipGlobalError: true
  });
  return normalizeFixedReplyRule(unwrapData(response));
}

export async function removeIndustryAiFixedReplyRule(robotId: string, ruleId: string) {
  return request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules/${ruleId}`,
    method: 'DELETE',
    skipGlobalError: true
  });
}

export interface IndustryAiFixedReplyImportResult {
  createdCount: number;
  skippedCount: number;
  skippedRuleNames: string[];
  rules: IndustryAiFixedReplyRule[];
}

export async function previewIndustryAiFixedReplyRules(robotId: string, messageContent: string): Promise<IndustryAiFixedReplyRulePreviewResult> {
  const response = await request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules/preview`,
    method: 'POST',
    body: { messageContent },
    skipGlobalError: true
  });
  const unwrapped = unwrapData(response);
  const source = isRecord(unwrapped) ? unwrapped : {};
  return {
    messageContent: pickString(source, ['messageContent']),
    matched: source.matched === true,
    selected: normalizeFixedReplyMatchPreviewItem(source.selected),
    candidates: pickArray(source, ['candidates', 'items', 'rules'])
      .map((item) => normalizeFixedReplyMatchPreviewItem(item))
      .filter((item): item is IndustryAiFixedReplyMatchPreviewItem => Boolean(item))
  };
}

export async function precheckIndustryAiFixedReplyRule(
  robotId: string,
  candidate: IndustryAiFixedReplyRulePayload,
  excludeRuleId?: string
): Promise<IndustryAiFixedReplyRulePrecheckResult> {
  const response = await request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules/precheck`,
    method: 'POST',
    body: { candidate, excludeRuleId },
    skipGlobalError: true
  });
  const unwrapped = unwrapData(response);
  const source = isRecord(unwrapped) ? unwrapped : {};
  const exact = isRecord(source.exactConflict) ? source.exactConflict : null;
  return {
    valid: source.valid === true,
    exactConflict: exact ? { id: pickString(exact, ['id']), name: pickString(exact, ['name']) } : null,
    potentialConflicts: pickArray(source, ['potentialConflicts', 'conflicts']).map((item) => {
      const raw = isRecord(item) ? item : {};
      return {
        id: pickString(raw, ['id']),
        name: pickString(raw, ['name']),
        reason: pickString(raw, ['reason']),
        priority: pickNumber(raw, ['priority'], 0)
      };
    })
  };
}

export async function importIndustryAiFixedReplyRules(robotId: string, rules: IndustryAiFixedReplyRulePayload[]): Promise<IndustryAiFixedReplyImportResult> {
  const response = await request<unknown>({
    path: `/industry-ai/robots/${robotId}/fixed-reply-rules/import`,
    method: 'POST',
    body: { rules },
    skipGlobalError: true
  });
  const unwrapped = unwrapData(response);
  const source = isRecord(unwrapped) ? unwrapped : {};
  return {
    createdCount: pickNumber(source, ['createdCount']),
    skippedCount: pickNumber(source, ['skippedCount']),
    skippedRuleNames: pickArray<string>(source, ['skippedRuleNames']),
    rules: pickArray(source, ['rules', 'items', 'records']).map((item) => normalizeFixedReplyRule(item))
  };
}

export async function testIndustryAiRobot(
  robotId: string,
  payload: { messageContent: string; sessionId?: string; model?: string; temperature?: number; maxTokens?: number; orderContext?: IndustryAiTestOrderContext }
): Promise<IndustryAiTestChatResult> {
  const response = await request<unknown>({ path: `/industry-ai/robots/${robotId}/test-chat`, method: 'POST', body: payload, skipGlobalLoading: true });
  return normalizeTestChatResult(unwrapData(response));
}

export async function listIndustryAiTestSessions(robotId: string, page = 1, pageSize = 20): Promise<PageResult<IndustryAiTestSession>> {
  const payload = await request<unknown>({ path: `/industry-ai/robots/${robotId}/test-sessions`, query: { page, pageSize } });
  const result = normalizePageResult<unknown>(payload);
  return { ...result, items: result.items.map((item) => normalizeTestSession(item)) };
}

export async function getIndustryAiTestSession(id: string): Promise<IndustryAiTestSession> {
  const payload = await request<unknown>({ path: `/industry-ai/test-sessions/${id}` });
  return normalizeTestSession(unwrapData(payload));
}

function normalizePack(payload: unknown): IndustryAiCapabilityPack {
  const source = isRecord(payload) ? payload : {};
  const versions = pickArray(source, ['versions']).map((item) => normalizePackVersion(item));
  const latestRaw = source.latestVersion;
  const publishedRaw = source.publishedVersion;
  return {
    id: pickString(source, ['id']),
    tenantId: pickString(source, ['tenantId']) || null,
    scope: pickString(source, ['scope']) as 'PLATFORM' | 'TENANT',
    industryCode: pickString(source, ['industryCode']),
    industryName: pickString(source, ['industryName']),
    channel: pickString(source, ['channel']) as IndustryAiChannel,
    name: pickString(source, ['name']),
    description: pickString(source, ['description']),
    status: pickString(source, ['status']) as IndustryAiPackStatus,
    latestVersion: isRecord(latestRaw) ? normalizePackVersion(latestRaw) : versions[0],
    publishedVersion: isRecord(publishedRaw) ? normalizePackVersion(publishedRaw) : versions.find((item) => item.status === 'PUBLISHED'),
    versions,
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizePackVersion(payload: unknown): IndustryAiCapabilityPackVersion {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    packId: pickString(source, ['packId']),
    versionNo: pickNumber(source, ['versionNo']),
    status: pickString(source, ['status']) as IndustryAiPackStatus,
    tone: pickString(source, ['tone']),
    replyPrinciples: pickString(source, ['replyPrinciples']),
    riskPolicy: pickString(source, ['riskPolicy']),
    handoffPolicy: pickString(source, ['handoffPolicy']),
    scenarios: pickArray(source, ['scenarios']).map((item) => normalizeScenario(item)),
    guardrails: pickArray(source, ['guardrails']).map((item) => normalizeGuardrail(item)),
    scenarioCount: pickNumber(source, ['scenarioCount']),
    guardrailCount: pickNumber(source, ['guardrailCount']),
    publishedAt: pickString(source, ['publishedAt']),
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizeScenario(payload: unknown): IndustryAiScenario {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    code: pickString(source, ['code']),
    name: pickString(source, ['name']),
    channel: pickString(source, ['channel']) as IndustryAiChannel,
    triggerPhrases: pickArray<string>(source, ['triggerPhrases']),
    serviceKey: pickString(source, ['serviceKey']) as IndustryAiServiceCapabilityKey,
    intentDescription: pickString(source, ['intentDescription']),
    replyGoal: pickString(source, ['replyGoal']),
    replyFramework: pickString(source, ['replyFramework']),
    riskLevel: pickString(source, ['riskLevel']) as IndustryAiRiskLevel,
    replyMode: pickString(source, ['replyMode']) as IndustryAiReplyMode,
    priority: pickNumber(source, ['priority'], 100),
    enabled: source.enabled !== false,
    examples: pickArray(source, ['examples']).map((item) => normalizeScenarioExample(item)),
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizeCapabilityTemplate(payload: unknown): IndustryAiCapabilityTemplate {
  const source = isRecord(payload) ? payload : {};
  return {
    code: pickString(source, ['code']),
    name: pickString(source, ['name']),
    industryCode: pickString(source, ['industryCode']),
    industryName: pickString(source, ['industryName']),
    channel: pickString(source, ['channel']) as IndustryAiChannel,
    description: pickString(source, ['description']),
    scenarioCount: pickNumber(source, ['scenarioCount']),
    exampleCount: pickNumber(source, ['exampleCount']),
    guardrailCount: pickNumber(source, ['guardrailCount']),
    defaultServiceCapabilities: pickArray(source, ['defaultServiceCapabilities']).map((item) => normalizeServiceCapability(item))
  };
}

function normalizeServiceCapability(payload: unknown): IndustryAiServiceCapability {
  const source = isRecord(payload) ? payload : {};
  return {
    key: pickString(source, ['key']) as IndustryAiServiceCapabilityKey,
    mode: pickString(source, ['mode']) as IndustryAiServiceCapabilityMode,
    note: pickString(source, ['note']) || undefined
  };
}

function normalizeScenarioExample(payload: unknown): IndustryAiScenarioExample {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    userInput: pickString(source, ['userInput']),
    recommendedReply: pickString(source, ['recommendedReply']),
    notes: pickString(source, ['notes']),
    qualityScore: pickNumber(source, ['qualityScore'], 100),
    enabled: source.enabled !== false,
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizeGuardrail(payload: unknown): IndustryAiGuardrail {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    type: pickString(source, ['type']) as IndustryAiGuardrailType,
    ruleContent: pickString(source, ['ruleContent']),
    priority: pickNumber(source, ['priority'], 100),
    enabled: source.enabled !== false,
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizeFixedReplyMatchPreviewItem(payload: unknown): IndustryAiFixedReplyMatchPreviewItem | null {
  if (!isRecord(payload)) return null;
  const id = pickString(payload, ['id']);
  const name = pickString(payload, ['name']);
  if (!id && !name) return null;
  return {
    id,
    name,
    matchType: (pickString(payload, ['matchType', 'mode']) as IndustryAiFixedReplyMatchType) || 'CONTAINS',
    replyType: (pickString(payload, ['replyType']) as IndustryAiFixedReplyType) || 'DIRECT_REPLY',
    priority: pickNumber(payload, ['priority'], 0),
    replyContent: pickString(payload, ['replyContent']),
    matchedPhrases: pickArray<string>(payload, ['matchedPhrases', 'triggerPhrases']),
    requiredKeywords: pickArray<string>(payload, ['requiredKeywords']),
    selected: payload.selected === true
  };
}

function normalizeFixedReplyRule(payload: unknown): IndustryAiFixedReplyRule {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    robotId: pickString(source, ['robotId']) || undefined,
    tenantId: pickString(source, ['tenantId']) || undefined,
    name: pickString(source, ['name']),
    channel: pickString(source, ['channel']) as IndustryAiChannel || 'BOTH',
    matchType: pickString(source, ['matchType']) as IndustryAiFixedReplyMatchType,
    triggerPhrases: pickArray<string>(source, ['triggerPhrases']),
    requiredKeywords: pickArray<string>(source, ['requiredKeywords']),
    excludedKeywords: pickArray<string>(source, ['excludedKeywords']),
    replyType: pickString(source, ['replyType']) as IndustryAiFixedReplyType || 'DIRECT_REPLY',
    replyContent: pickString(source, ['replyContent']),
    priority: pickNumber(source, ['priority'], 100),
    enabled: source.enabled !== false,
    remark: pickString(source, ['remark']) || undefined,
    matchCount: pickNumber(source, ['matchCount'], 0),
    lastMatchedAt: pickString(source, ['lastMatchedAt']) || null,
    createdAt: pickString(source, ['createdAt']) || undefined,
    updatedAt: pickString(source, ['updatedAt']) || undefined
  };
}

function normalizeStoreServiceRules(payload: unknown): IndustryAiStoreServiceRules | undefined {
  const source = isRecord(payload) ? payload : {};
  const rules: IndustryAiStoreServiceRules = {
    shippingRule: pickString(source, ['shippingRule']) || undefined,
    logisticsRule: pickString(source, ['logisticsRule']) || undefined,
    orderChangeRule: pickString(source, ['orderChangeRule']) || undefined,
    afterSalesRule: pickString(source, ['afterSalesRule']) || undefined,
    refundRule: pickString(source, ['refundRule']) || undefined,
    complaintRule: pickString(source, ['complaintRule']) || undefined,
    experienceRule: pickString(source, ['experienceRule']) || undefined
  };
  return Object.values(rules).some(Boolean) ? rules : undefined;
}

function normalizeConversationPolicy(payload: Record<string, unknown>): IndustryAiConversationPolicy {
  const rawPolicy = isRecord(payload.conversationPolicy) ? payload.conversationPolicy : {};
  const source = Object.keys(rawPolicy).length ? rawPolicy : payload;
  return {
    outOfScopePolicy: (pickString(source, ['outOfScopePolicy']) || 'GUIDE_BACK') as IndustryAiOutOfScopePolicy,
    outOfScopeReply: pickString(source, ['outOfScopeReply']) || undefined,
    sensitiveMessagePolicy: (pickString(source, ['sensitiveMessagePolicy']) || 'HANDOFF') as IndustryAiSensitiveMessagePolicy,
    sensitiveReply: pickString(source, ['sensitiveReply']) || undefined
  };
}

function normalizeRobot(payload: unknown): IndustryAiRobot {
  const source = isRecord(payload) ? payload : {};
  const pack = isRecord(source.capabilityPack) ? source.capabilityPack : {};
  const version = isRecord(source.capabilityPackVersion) ? source.capabilityPackVersion : {};
  const snapshot = isRecord(source.capabilityPackSnapshot) ? source.capabilityPackSnapshot : {};
  return {
    id: pickString(source, ['id']),
    tenantId: pickString(source, ['tenantId']),
    name: pickString(source, ['name']),
    channel: pickString(source, ['channel']) as Exclude<IndustryAiChannel, 'BOTH'>,
    status: pickString(source, ['status']) as IndustryAiRobotStatus,
    industryCode: pickString(source, ['industryCode']),
    industryName: pickString(source, ['industryName']),
    brandName: pickString(source, ['brandName']),
    businessProfile: pickString(source, ['businessProfile']),
    businessRules: pickString(source, ['businessRules']),
    storeServiceRules: normalizeStoreServiceRules(source.storeServiceRules),
    outOfScopePolicy: (pickString(source, ['outOfScopePolicy']) || 'GUIDE_BACK') as IndustryAiOutOfScopePolicy,
    outOfScopeReply: pickString(source, ['outOfScopeReply']) || undefined,
    sensitiveMessagePolicy: (pickString(source, ['sensitiveMessagePolicy']) || 'HANDOFF') as IndustryAiSensitiveMessagePolicy,
    sensitiveReply: pickString(source, ['sensitiveReply']) || undefined,
    conversationPolicy: normalizeConversationPolicy(source),
    serviceCapabilities: pickArray(source, ['serviceCapabilities']).map((item) => normalizeServiceCapability(item)),
    fixedReplyRuleCount: pickNumber(source, ['fixedReplyRuleCount']),
    customPrompt: pickString(source, ['customPrompt']),
    remark: pickString(source, ['remark']),
    capabilityPackId: pickString(source, ['capabilityPackId']),
    capabilityPackVersionId: pickString(source, ['capabilityPackVersionId']),
    capabilityPackSnapshot: {
      packId: pickString(snapshot, ['packId']),
      packName: pickString(snapshot, ['packName']),
      industryCode: pickString(snapshot, ['industryCode']),
      industryName: pickString(snapshot, ['industryName']),
      channel: pickString(snapshot, ['channel']) as IndustryAiChannel,
      versionId: pickString(snapshot, ['versionId']),
      versionNo: pickNumber(snapshot, ['versionNo']),
      tone: pickString(snapshot, ['tone']),
      replyPrinciples: pickString(snapshot, ['replyPrinciples']),
      riskPolicy: pickString(snapshot, ['riskPolicy']),
      handoffPolicy: pickString(snapshot, ['handoffPolicy'])
    },
    capabilityPack: pickString(pack, ['id'])
      ? {
          id: pickString(pack, ['id']),
          name: pickString(pack, ['name']),
          industryCode: pickString(pack, ['industryCode']),
          industryName: pickString(pack, ['industryName']),
          channel: pickString(pack, ['channel']) as IndustryAiChannel
        }
      : undefined,
    capabilityPackVersion: pickString(version, ['id'])
      ? {
          id: pickString(version, ['id']),
          packId: pickString(version, ['packId']),
          versionNo: pickNumber(version, ['versionNo'])
        }
      : undefined,
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizeBusinessContext(payload: unknown): IndustryAiConversationBusinessContext | undefined {
  if (!isRecord(payload)) return undefined;
  return {
    conversationType: pickString(payload, ['conversationType']) as IndustryAiConversationBusinessType,
    conversationTypeLabel: pickString(payload, ['conversationTypeLabel']),
    customerIntent: pickString(payload, ['customerIntent']),
    customerStage: pickString(payload, ['customerStage']) as IndustryAiCustomerBusinessStage,
    customerStageLabel: pickString(payload, ['customerStageLabel']),
    emotionLevel: pickString(payload, ['emotionLevel']),
    emotionLabel: pickString(payload, ['emotionLabel']),
    businessGoal: pickArray<string>(payload, ['businessGoal']),
    conversationStrategy: pickString(payload, ['conversationStrategy']),
    riskLevel: pickString(payload, ['riskLevel']) as IndustryAiBusinessRiskLevel,
    riskLevelLabel: pickString(payload, ['riskLevelLabel']),
    handoffDecision: pickString(payload, ['handoffDecision']) as IndustryAiBusinessHandoffDecision,
    handoffDecisionLabel: pickString(payload, ['handoffDecisionLabel']),
    nextAction: pickString(payload, ['nextAction']),
    retentionCount: pickNumber(payload, ['retentionCount']),
    shouldStopRetention: payload.shouldStopRetention === true
  };
}

function normalizeOrderServiceContext(payload: unknown): IndustryAiOrderServiceContextTrace | undefined {
  if (!isRecord(payload)) return undefined;
  const customerEmotion = isRecord(payload.customerEmotion) ? payload.customerEmotion : {};
  const previousEmotion = isRecord(payload.previousEmotion) ? payload.previousEmotion : null;
  const serviceAction = isRecord(payload.serviceAction) ? payload.serviceAction : {};
  return {
    source: pickString(payload, ['source']) as 'MOCK' | 'NONE',
    hasOrderContext: payload.hasOrderContext === true,
    platformOrderNo: pickString(payload, ['platformOrderNo']) || null,
    orderStatus: pickString(payload, ['orderStatus']) || null,
    fulfillmentStatus: pickString(payload, ['fulfillmentStatus']) || null,
    logisticsStatus: pickString(payload, ['logisticsStatus']) || null,
    afterSalesStatus: pickString(payload, ['afterSalesStatus']) || null,
    refundStatus: pickString(payload, ['refundStatus']) || null,
    orderNoteCount: pickNumber(payload, ['orderNoteCount']),
    recentOrderNotes: pickArray<string>(payload, ['recentOrderNotes']),
    customerEmotion: {
      code: pickString(customerEmotion, ['code']),
      label: pickString(customerEmotion, ['label']),
      reason: pickString(customerEmotion, ['reason'])
    },
    previousEmotion: previousEmotion
      ? { code: pickString(previousEmotion, ['code']), label: pickString(previousEmotion, ['label']) }
      : null,
    serviceAction: {
      code: pickString(serviceAction, ['code']),
      label: pickString(serviceAction, ['label']),
      requiresOrder: serviceAction.requiresOrder === true,
      canUseOrderContext: serviceAction.canUseOrderContext === true,
      nextStep: pickString(serviceAction, ['nextStep'])
    },
    suggestedOrderNote: pickString(payload, ['suggestedOrderNote']),
    replyContextSummary: pickString(payload, ['replyContextSummary']),
    actionExecutionState: pickString(payload, ['actionExecutionState']) as 'SIMULATED_NOT_EXECUTED' | 'REAL_ACTION_REQUIRED',
    actionExecutionNote: pickString(payload, ['actionExecutionNote']),
    noteWriteMode: pickString(payload, ['noteWriteMode']) as 'SIMULATED_APPEND_ONLY'
  };
}

function normalizeTestSession(payload: unknown): IndustryAiTestSession {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    robotId: pickString(source, ['robotId']),
    title: pickString(source, ['title']),
    messages: pickArray(source, ['messages']).map((item) => normalizeTestMessage(item)),
    createdAt: pickString(source, ['createdAt']),
    updatedAt: pickString(source, ['updatedAt'])
  };
}

function normalizeTestMessage(payload: unknown): IndustryAiTestMessage {
  const source = isRecord(payload) ? payload : {};
  return {
    id: pickString(source, ['id']),
    role: normalizeTestRole(pickString(source, ['role'])),
    content: pickString(source, ['content']),
    createdAt: pickString(source, ['createdAt'])
  };
}

function normalizeTestRole(value: string): IndustryAiTestMessage['role'] {
  const normalized = value.toLowerCase();
  if (normalized === 'assistant') return 'assistant';
  if (normalized === 'system') return 'system';
  return 'user';
}

function normalizeTestChatResult(payload: unknown): IndustryAiTestChatResult {
  const source = isRecord(payload) ? payload : {};
  const session = isRecord(source.session) ? source.session : {};
  const assistantMessage = isRecord(source.assistantMessage) ? source.assistantMessage : {};
  const rawTrace = isRecord(source.trace) ? source.trace : {};
  const scenario = isRecord(rawTrace.scenario) ? rawTrace.scenario : {};
  const packVersion = isRecord(rawTrace.packVersion) ? rawTrace.packVersion : {};
  const serviceCapability = isRecord(rawTrace.serviceCapability) ? rawTrace.serviceCapability : {};
  return {
    sessionId: pickString(session, ['id']),
    message: normalizeTestMessage(assistantMessage),
    trace: {
      packName: pickString(packVersion, ['packName']),
      packVersion: pickNumber(packVersion, ['versionNo']),
      source: pickString(rawTrace, ['source']) as 'deepseek' | 'fixed_reply' | 'safe_fallback' | 'policy' | 'order_context',
      replySuppressed: rawTrace.replySuppressed === true,
      conversationDecision: isRecord(rawTrace.conversationDecision)
        ? {
            category: pickString(rawTrace.conversationDecision, ['category']) as IndustryAiConversationDecisionCategory,
            action: pickString(rawTrace.conversationDecision, ['action']) as IndustryAiConversationDecisionAction,
            reasonCode: pickString(rawTrace.conversationDecision, ['reasonCode']),
            reasonLabel: pickString(rawTrace.conversationDecision, ['reasonLabel']),
            scopeSignals: pickArray<string>(rawTrace.conversationDecision, ['scopeSignals']),
            replySuppressed: rawTrace.conversationDecision.replySuppressed === true
          }
        : undefined,
      customerCarePlan: isRecord(rawTrace.customerCarePlan)
        ? {
            focusCode: pickString(rawTrace.customerCarePlan, ['focusCode']) as IndustryAiCustomerCarePlan['focusCode'],
            focusLabel: pickString(rawTrace.customerCarePlan, ['focusLabel']),
            customerConcern: pickString(rawTrace.customerCarePlan, ['customerConcern']),
            actionFirstGuidance: pickString(rawTrace.customerCarePlan, ['actionFirstGuidance']),
            careGuidance: pickString(rawTrace.customerCarePlan, ['careGuidance'])
          }
        : undefined,
      orderServiceContext: normalizeOrderServiceContext(rawTrace.orderServiceContext),
      businessContext: normalizeBusinessContext(rawTrace.businessContext),
      fixedReplyRule: isRecord(rawTrace.fixedReplyRule)
        ? {
            id: pickString(rawTrace.fixedReplyRule, ['id']),
            name: pickString(rawTrace.fixedReplyRule, ['name']),
            matchType: pickString(rawTrace.fixedReplyRule, ['matchType']) as IndustryAiFixedReplyMatchType,
            replyType: pickString(rawTrace.fixedReplyRule, ['replyType']) as IndustryAiFixedReplyType,
            priority: pickNumber(rawTrace.fixedReplyRule, ['priority']),
            matchCount: pickNumber(rawTrace.fixedReplyRule, ['matchCount'], 0),
            lastMatchedAt: pickString(rawTrace.fixedReplyRule, ['lastMatchedAt']) || null,
            matchedPhrases: pickArray<string>(rawTrace.fixedReplyRule, ['matchedPhrases']),
            requiredKeywords: pickArray<string>(rawTrace.fixedReplyRule, ['requiredKeywords'])
          }
        : undefined,
      scenarioId: pickString(scenario, ['id']),
      scenarioName: pickString(scenario, ['name']),
      scenarioCode: pickString(scenario, ['code']),
      riskLevel: (pickString(rawTrace, ['riskLevel']) || pickString(scenario, ['riskLevel'])) as IndustryAiRiskLevel,
      shouldHandoff: rawTrace.shouldHandoff === true,
      replyMode: pickString(scenario, ['replyMode']) as IndustryAiReplyMode,
      model: pickString(rawTrace, ['model']),
      elapsedMs: pickNumber(rawTrace, ['elapsedMs']),
      requestId: pickString(rawTrace, ['requestId']),
      replyQuality: isRecord(rawTrace.replyQuality)
        ? {
            status: pickString(rawTrace.replyQuality, ['status']) as 'PASSED' | 'RETRIED' | 'FALLBACK',
            initialIssue: pickString(rawTrace.replyQuality, ['initialIssue']) || undefined,
            initialFinishReason: pickString(rawTrace.replyQuality, ['initialFinishReason']) || undefined,
            retryFinishReason: pickString(rawTrace.replyQuality, ['retryFinishReason']) || undefined
          }
        : undefined,
      serviceCapability: pickString(serviceCapability, ['key'])
        ? {
            key: pickString(serviceCapability, ['key']) as IndustryAiServiceCapabilityKey,
            label: pickString(serviceCapability, ['label']),
            mode: pickString(serviceCapability, ['mode']) as IndustryAiServiceCapabilityMode,
            note: pickString(serviceCapability, ['note']) || undefined,
            source: pickString(serviceCapability, ['source']) as 'ROBOT_CONFIG' | 'SAFE_DEFAULT'
          }
        : undefined
    }
  };
}
