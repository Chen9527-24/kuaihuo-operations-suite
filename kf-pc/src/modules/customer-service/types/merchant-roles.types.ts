import type { CustomerServiceIndustryNode } from './industries.types';
import type { CustomerServiceRolePrototype, CustomerServiceRoleStatus } from './roles.types';

export type CustomerServiceRoleModuleMergeMode = 'OVERRIDE' | 'APPEND' | 'STRICTER';
export type CustomerServiceRoleModuleStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export type CustomerServiceRoleInitiativeLevel = 'RESTRAINED' | 'BALANCED' | 'PROACTIVE';
export type CustomerServiceRoleOpeningParticipation = 'ACK_ONLY' | 'CONTEXTUAL_ENTRY' | 'ACTIVE_ENTRY';
export type CustomerServiceRoleFollowUpOffering = 'ANSWER_ONLY' | 'CONTEXTUAL_OFFER' | 'ACTIVE_OFFER';
export type CustomerServiceRoleClarificationInitiative = 'REQUIRED_ONLY' | 'DECISION_RELEVANT' | 'EXPLORATORY';
export type CustomerServiceRoleGuidanceInitiative = 'REQUESTED_ONLY' | 'CONTEXTUAL' | 'PROACTIVE_WHEN_USEFUL';
export type CustomerServiceRoleResolutionFollowThrough = 'MINIMAL' | 'NEXT_STEP' | 'UNTIL_RESOLVED';
export type CustomerServiceRoleSalesPressure = 'NONE' | 'LOW' | 'NORMAL';

export interface CustomerServiceRoleInteractionPostureV1 {
  schemaVersion: 1;
  initiativeLevel: CustomerServiceRoleInitiativeLevel;
  openingParticipation: CustomerServiceRoleOpeningParticipation;
  followUpOffering: CustomerServiceRoleFollowUpOffering;
  clarificationInitiative: CustomerServiceRoleClarificationInitiative;
  guidanceInitiative: CustomerServiceRoleGuidanceInitiative;
  resolutionFollowThrough: CustomerServiceRoleResolutionFollowThrough;
  salesPressure: CustomerServiceRoleSalesPressure;
}


export interface CustomerServiceMerchantRole {
  id: string;
  tenantId: string;
  prototypeId: string;
  industryNodeId: string | null;
  code: string;
  name: string;
  description: string | null;
  publicIdentity: string | null;
  publicRelation: string | null;
  generationPrompt: string | null;
  status: CustomerServiceRoleStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  prototype: Pick<CustomerServiceRolePrototype, 'id' | 'code' | 'name' | 'status' | 'revision'>;
  industryNode: Pick<CustomerServiceIndustryNode, 'id' | 'code' | 'name' | 'nodeType' | 'path' | 'status' | 'revision'> | null;
  _count?: { modules: number };
}

export interface CustomerServiceMerchantRoleQuery {
  keyword?: string;
  status?: string;
  prototypeId?: string;
  industryNodeId?: string;
  page: number;
  pageSize: number;
}

export interface CustomerServiceMerchantRolePayload {
  code?: string;
  name: string;
  prototypeId: string;
  industryNodeId?: string | null;
  description?: string;
  publicIdentity?: string;
  publicRelation?: string;
  generationPrompt?: string;
  status: CustomerServiceRoleStatus;
  revision?: number;
}

export interface CustomerServiceRoleModuleDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultMergeMode: CustomerServiceRoleModuleMergeMode;
  defaultPriority: number;
  status: CustomerServiceRoleModuleStatus;
  sort: number;
}

export interface CustomerServiceRoleModuleInstance {
  id: string;
  tenantId: string;
  merchantRoleId: string;
  definitionId: string;
  key: string;
  name: string;
  content: Record<string, unknown>;
  conditions: Record<string, unknown> | null;
  mergeMode: CustomerServiceRoleModuleMergeMode;
  priority: number;
  sort: number;
  status: CustomerServiceRoleModuleStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  definition: CustomerServiceRoleModuleDefinition;
}

export interface CustomerServiceRoleModulePayload {
  definitionId?: string;
  key?: string;
  name: string;
  content: Record<string, unknown>;
  conditions?: Record<string, unknown> | null;
  mergeMode: CustomerServiceRoleModuleMergeMode;
  priority: number;
  sort: number;
  status: CustomerServiceRoleModuleStatus;
  revision?: number;
}
