export type CustomerServiceIndustryNodeType = 'INDUSTRY' | 'CATEGORY' | 'SUBCATEGORY';
export type CustomerServiceIndustryStatus = 'ENABLED' | 'DISABLED' | 'ARCHIVED';

export interface CustomerServiceIndustryNode {
  id: string;
  tenantId: string;
  parentId: string | null;
  code: string;
  name: string;
  nodeType: CustomerServiceIndustryNodeType;
  level: number;
  path: string;
  description: string | null;
  status: CustomerServiceIndustryStatus;
  sort: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  children?: CustomerServiceIndustryNode[];
}

export interface CustomerServiceIndustryPayload {
  parentId?: string;
  code?: string;
  name: string;
  nodeType?: CustomerServiceIndustryNodeType;
  description?: string;
  status: CustomerServiceIndustryStatus;
  sort: number;
  revision?: number;
}
