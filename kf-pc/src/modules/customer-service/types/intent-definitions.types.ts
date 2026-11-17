export type CustomerServiceIntentStatus = 'DRAFT' | 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export interface CustomerServiceIntentDefinition {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  scenario: string;
  primaryIntent: string;
  defaultRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  supportedIndustryCodes: string[];
  recognitionConfig: Record<string, unknown>;
  strategyConfig: Record<string, unknown>;
  flowConfig: Record<string, unknown>;
  replyConfig: Record<string, unknown>;
  examples: Record<string, unknown> | null;
  priority: number;
  sort: number;
  status: CustomerServiceIntentStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerServiceIntentQuery {
  keyword: string;
  category: string;
  scenario: string;
  status: string;
  page: number;
  pageSize: number;
}

export interface CustomerServiceIntentPayload {
  key: string;
  name: string;
  category: string;
  description?: string;
  scenario: string;
  primaryIntent: string;
  defaultRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  supportedIndustryCodes?: string[];
  recognitionConfig: Record<string, unknown>;
  strategyConfig: Record<string, unknown>;
  flowConfig: Record<string, unknown>;
  replyConfig: Record<string, unknown>;
  examples?: Record<string, unknown>;
  priority?: number;
  sort?: number;
  status?: CustomerServiceIntentStatus;
}

export type UpdateCustomerServiceIntentPayload = Omit<CustomerServiceIntentPayload, 'key'> & { revision: number };


export interface CreateIntentFromRecognitionPayload {
  recognizedItem: Record<string, unknown>;
  message: string;
  conversationHistory?: Array<{ role: 'CUSTOMER' | 'ASSISTANT'; content: string }>;
  merchantRoleId?: string;
  industryNodeId?: string;
  industryCode?: string;
  industryCodes?: string[];
  understanding?: Record<string, unknown>;
  status?: 'DRAFT' | 'DISABLED';
}

export type CustomerServiceIntentCandidateStatus = 'PENDING' | 'CONVERTED' | 'IGNORED';

export interface CustomerServiceIntentCandidate {
  id: string;
  tenantId: string;
  fingerprint: string;
  recognitionKey: string;
  name: string;
  description: string | null;
  suggestedCategory: string;
  suggestedScenario: string;
  suggestedPrimaryIntent: string;
  suggestedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  observedIndustryCodes: string[];
  status: CustomerServiceIntentCandidateStatus;
  occurrenceCount: number;
  confidenceSum: number;
  maxConfidence: number;
  latestConfidence: number;
  averageConfidence: number;
  evidence: string[];
  samples: Array<Record<string, unknown>>;
  sourceContext: Record<string, unknown> | null;
  relatedDefinitionId: string | null;
  convertedDefinitionId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CustomerServiceIntentCandidateQuery {
  keyword: string;
  category: string;
  status: string;
  page: number;
  pageSize: number;
}
