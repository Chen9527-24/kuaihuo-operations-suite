import { CUSTOMER_SERVICE_PRODUCT } from '../../../shared/constants/customer-service-product.constant';
import { CustomerServiceRuntimeMode } from '../../../shared/enums/customer-service-runtime-mode.enum';

export type CustomerServiceCapabilityStatus = 'READY' | 'PLANNED';

export type CustomerServiceCapabilityItem = {
  key: string;
  name: string;
  status: CustomerServiceCapabilityStatus;
};

export type CustomerServiceOverview = {
  product: typeof CUSTOMER_SERVICE_PRODUCT;
  stage: 'V5_3_STRATEGY_CONFIGURATION';
  tenantScoped: boolean;
  legacyIndustryAiDetached: boolean;
  customerVisibleSendingEnabled: boolean;
  businessWriteActionsEnabled: boolean;
  enabledRuntimeModes: CustomerServiceRuntimeMode[];
  plannedRuntimeModes: CustomerServiceRuntimeMode[];
  capabilities: CustomerServiceCapabilityItem[];
};
