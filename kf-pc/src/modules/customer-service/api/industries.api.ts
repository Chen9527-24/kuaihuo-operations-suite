import { request } from '@/api/core/http';
import { normalizeList, unwrapData } from '@/utils/apiData';
import type { CustomerServiceIndustryNode, CustomerServiceIndustryPayload } from '../types/industries.types';

const path = '/customer-service/admin/industry-nodes';

export interface CustomerServiceIndustryTreeLayoutItem {
  id: string;
  parentId: string | null;
  sort: number;
  revision: number;
}

export interface CustomerServiceIndustryDeleteResult {
  deletedNodes: number;
  detachedMerchantRoles: number;
  detachedAccountProfiles: number;
  detachedActiveTuningSessions: number;
}

export async function listCustomerServiceIndustryNodes(): Promise<CustomerServiceIndustryNode[]> {
  return normalizeList<CustomerServiceIndustryNode>(await request({ path, apiVersion: 5, skipGlobalLoading: true }));
}

export async function createCustomerServiceIndustryNode(payload: CustomerServiceIndustryPayload): Promise<CustomerServiceIndustryNode> {
  return unwrapData(await request({ path, method: 'POST', body: payload, apiVersion: 5 }));
}

export async function updateCustomerServiceIndustryNode(
  id: string,
  payload: CustomerServiceIndustryPayload
): Promise<CustomerServiceIndustryNode> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'PATCH', body: payload, apiVersion: 5 }));
}

export async function saveCustomerServiceIndustryTreeLayout(nodes: CustomerServiceIndustryTreeLayoutItem[]) {
  return unwrapData<{ tenantId: string; updated: number; total: number }>(
    await request({ path: `${path}/tree-layout`, method: 'PATCH', body: { nodes }, apiVersion: 5 })
  );
}

export async function deleteCustomerServiceIndustryNode(id: string, revision: number): Promise<CustomerServiceIndustryDeleteResult> {
  return unwrapData<CustomerServiceIndustryDeleteResult>(
    await request({ path: `${path}/${id}`, method: 'DELETE', query: { revision }, apiVersion: 5 })
  );
}
