export type CustomerServiceAssetType =
  | 'ROLE_MODULE'
  | 'STRATEGY_GROUP'
  | 'RESPONSE_POLICY'
  | 'QUALITY_RULE'
  | 'WORKFLOW'
  | 'CASE_REFERENCE'
  | 'EXACT_REPLY'
  | 'TEMPLATE_REPLY'
  | 'REQUIRED_POINTS'
  | 'REQUIRED_WORKFLOW';
export type CustomerServiceAssetStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type CustomerServiceAssetVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface CustomerServiceAsset {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  assetType: CustomerServiceAssetType;
  description: string | null;
  status: CustomerServiceAssetStatus;
  currentVersionId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  _count?: { versions: number };
}

export interface CustomerServiceAssetVersion {
  id: string;
  assetId: string;
  versionNo: number;
  title: string;
  summary: string | null;
  content: Record<string, unknown>;
  contentHash: string;
  status: CustomerServiceAssetVersionStatus;
  revision: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerServiceAssetQuery {
  keyword?: string;
  assetType?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface CreateCustomerServiceAssetPayload {
  key: string;
  name: string;
  assetType: CustomerServiceAssetType;
  description?: string;
}

export interface UpdateCustomerServiceAssetPayload {
  revision: number;
  name?: string;
  description?: string;
  status?: CustomerServiceAssetStatus;
}

export interface CreateCustomerServiceAssetVersionPayload {
  title: string;
  summary?: string;
  content: Record<string, unknown>;
}
