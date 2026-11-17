import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type { CustomerServiceRolePayload, CustomerServiceRolePrototype, CustomerServiceRoleQuery } from '../types/roles.types';

const path = '/customer-service/admin/role-prototypes';

export async function listCustomerServiceRolePrototypes(query: CustomerServiceRoleQuery): Promise<PageResult<CustomerServiceRolePrototype>> {
  return normalizePageResult<CustomerServiceRolePrototype>(await request({ path, query, apiVersion: 5, skipGlobalLoading: true }));
}

export async function createCustomerServiceRolePrototype(payload: CustomerServiceRolePayload): Promise<CustomerServiceRolePrototype> {
  return unwrapData(await request({ path, method: 'POST', body: payload, apiVersion: 5 }));
}

export async function updateCustomerServiceRolePrototype(
  id: string,
  payload: CustomerServiceRolePayload
): Promise<CustomerServiceRolePrototype> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'PATCH', body: payload, apiVersion: 5 }));
}

export async function deleteCustomerServiceRolePrototype(id: string, revision: number): Promise<void> {
  await request({ path: `${path}/${id}`, method: 'DELETE', query: { revision }, apiVersion: 5 });
}
