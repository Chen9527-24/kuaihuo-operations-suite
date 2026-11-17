import type {
  CustomerServiceGenerationResult,
  CustomerServiceMessageUnderstanding,
  CustomerServiceQualityReport,
  CustomerServiceRuntimeContract,
} from './simulation.types';

export type CustomerServiceTuningSessionStatus = 'ACTIVE' | 'ARCHIVED';
export type CustomerServiceTuningMessageRole = 'CUSTOMER' | 'ASSISTANT';
export type CustomerServiceTuningAnalysisRunType = 'COMPILE' | 'EXECUTE';

export interface CustomerServiceTuningSessionSummary {
  id: string;
  title: string;
  status: CustomerServiceTuningSessionStatus;
  merchantRoleId: string;
  accountProfileId: string | null;
  industryNodeId: string | null;
  contextSnapshot: Record<string, unknown> | null;
  messageCount: number;
  analysisCount: number;
  stateSchemaVersion?: number;
  stateRevision?: number;
  contextPayloadBytes?: number;
  stateUpdatedAt?: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  merchantRole: { id: string; code: string; name: string; publicIdentity: string | null };
  industryNode: { id: string; code: string; name: string; path: string } | null;
  accountProfile: { id: string; code: string; name: string; channel: string | null; storeProfileId: string | null } | null;
}

export interface CustomerServiceTuningMessage {
  id: string;
  sessionId: string;
  clientMessageId: string | null;
  role: CustomerServiceTuningMessageRole;
  content: string;
  turnNo: number;
  createdAt: string;
}

export interface CustomerServiceTuningAnalysis {
  id: string;
  sessionId: string;
  customerMessageId: string | null;
  runType: CustomerServiceTuningAnalysisRunType;
  sequenceNo: number;
  latestMessage: string;
  understanding: CustomerServiceMessageUnderstanding;
  runtimeContract: CustomerServiceRuntimeContract;
  generation: CustomerServiceGenerationResult | null;
  quality: CustomerServiceQualityReport | null;
  warnings: string[] | null;
  summary: Record<string, unknown> | null;
  createdById: string;
  createdAt: string;
  primaryScenario?: string | null;
  primaryIntent?: string | null;
  dominantTurnGoal?: string | null;
  recognitionPath?: string | null;
  generationModel?: string | null;
  qualityStatus?: string | null;
  feedbackType?: string | null;
  requestedDeltas?: string[];
  stateRevision?: number | null;
  configurationHash?: string | null;
  contentHash?: string | null;
  payloadBytes?: number;
  payloadState?: 'ACTIVE' | 'ARCHIVED' | 'COMPACTED' | 'PURGED';
  retentionClass?: string;
  compactedAt?: string | null;
}

export interface CustomerServiceRecognitionRecord extends CustomerServiceTuningAnalysis {
  session: Pick<CustomerServiceTuningSessionSummary, 'id' | 'title' | 'status' | 'merchantRoleId' | 'industryNodeId' | 'messageCount' | 'analysisCount' | 'updatedAt' | 'merchantRole' | 'industryNode'>;
}

export interface CustomerServiceRecognitionRecordListResult {
  items: CustomerServiceRecognitionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerServiceTuningSessionDetails extends CustomerServiceTuningSessionSummary {
  messages: CustomerServiceTuningMessage[];
  analyses: CustomerServiceTuningAnalysis[];
}

export interface CustomerServiceTuningSessionListResult {
  items: CustomerServiceTuningSessionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerServiceTuningSessionDeleteResult {
  deletedIds: string[];
  deletedCount: number;
  deletedMessageCount: number;
  deletedAnalysisCount: number;
  deletedReplyTraceCount: number;
}

export interface CreateCustomerServiceTuningSessionPayload {
  merchantRoleId: string;
  accountProfileId?: string;
  storeProfileId?: string;
  industryNodeId?: string;
  title?: string;
}

export interface UpdateCustomerServiceTuningSessionPayload {
  merchantRoleId?: string;
  accountProfileId?: string | null;
  industryNodeId?: string | null;
  title?: string;
  status?: CustomerServiceTuningSessionStatus;
  contextSnapshot?: Record<string, unknown>;
}
