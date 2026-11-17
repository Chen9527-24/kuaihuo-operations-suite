export type CustomerServiceRuntimeMode = 'SIMULATION' | 'SHADOW' | 'HUMAN_REVIEW' | 'LIVE';
export type CustomerServiceCapabilityStatus = 'READY' | 'PLANNED';

export interface CustomerServiceCapabilityItem {
  key: string;
  name: string;
  status: CustomerServiceCapabilityStatus;
}

export interface CustomerServiceOverview {
  product: {
    key: 'customer-service-agent';
    name: '智能客服经营 Agent';
    menuName: '智能客服';
    version: 'V5';
  };
  stage: 'V5_3_STRATEGY_CONFIGURATION';
  tenantScoped: boolean;
  legacyIndustryAiDetached: boolean;
  customerVisibleSendingEnabled: boolean;
  businessWriteActionsEnabled: boolean;
  enabledRuntimeModes: CustomerServiceRuntimeMode[];
  plannedRuntimeModes: CustomerServiceRuntimeMode[];
  capabilities: CustomerServiceCapabilityItem[];
}
