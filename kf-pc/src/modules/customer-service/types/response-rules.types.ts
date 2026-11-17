import type { CustomerServiceAsset } from './assets.types';

export type CustomerServiceResponseRuleStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export interface CustomerServiceResponseRule {
  id: string;
  tenantId: string;
  responseAssetId: string;
  key: string;
  name: string;
  description: string | null;
  conditions: Record<string, unknown>;
  exclusions: Record<string, unknown> | null;
  priority: number;
  sort: number;
  exclusive: boolean;
  status: CustomerServiceResponseRuleStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  responseAsset: CustomerServiceAsset;
}

export interface CustomerServiceResponseRuleQuery {
  keyword: string;
  status: string;
  page: number;
  pageSize: number;
}

export interface CreateCustomerServiceResponseRulePayload {
  key: string;
  name: string;
  description?: string;
  responseAssetId: string;
  conditions: Record<string, unknown>;
  exclusions?: Record<string, unknown>;
  priority?: number;
  sort?: number;
  exclusive?: boolean;
  status?: CustomerServiceResponseRuleStatus;
}

export interface UpdateCustomerServiceResponseRulePayload {
  revision: number;
  name?: string;
  description?: string;
  responseAssetId?: string;
  conditions?: Record<string, unknown>;
  exclusions?: Record<string, unknown>;
  priority?: number;
  sort?: number;
  exclusive?: boolean;
  status?: CustomerServiceResponseRuleStatus;
}
