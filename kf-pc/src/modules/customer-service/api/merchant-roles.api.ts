import { request } from '@/api/core/http';
import { normalizeList, normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type {
  CustomerServiceMerchantRole,
  CustomerServiceMerchantRolePayload,
  CustomerServiceMerchantRoleQuery,
  CustomerServiceRoleModuleDefinition,
  CustomerServiceRoleModuleInstance,
  CustomerServiceRoleModulePayload
} from '../types/merchant-roles.types';

const rolePath = '/customer-service/admin/merchant-roles';

export async function listCustomerServiceMerchantRoles(
  query: CustomerServiceMerchantRoleQuery
): Promise<PageResult<CustomerServiceMerchantRole>> {
  return normalizePageResult<CustomerServiceMerchantRole>(
    await request({ path: rolePath, query: query as unknown as Record<string, unknown>, apiVersion: 5, skipGlobalLoading: true })
  );
}

export async function createCustomerServiceMerchantRole(
  payload: CustomerServiceMerchantRolePayload
): Promise<CustomerServiceMerchantRole> {
  return unwrapData(await request({ path: rolePath, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}

export async function updateCustomerServiceMerchantRole(
  id: string,
  payload: CustomerServiceMerchantRolePayload
): Promise<CustomerServiceMerchantRole> {
  return unwrapData(await request({ path: `${rolePath}/${id}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}

export async function deleteCustomerServiceMerchantRole(id: string, revision: number): Promise<void> {
  await request({ path: `${rolePath}/${id}`, method: 'DELETE', query: { revision }, apiVersion: 5 });
}

export async function listCustomerServiceRoleModuleDefinitions(): Promise<CustomerServiceRoleModuleDefinition[]> {
  return normalizeList<CustomerServiceRoleModuleDefinition>(
    await request({ path: '/customer-service/admin/role-module-definitions', apiVersion: 5, skipGlobalLoading: true })
  );
}

export async function listCustomerServiceRoleModules(merchantRoleId: string): Promise<CustomerServiceRoleModuleInstance[]> {
  return normalizeList<CustomerServiceRoleModuleInstance>(
    await request({ path: `${rolePath}/${merchantRoleId}/modules`, apiVersion: 5, skipGlobalLoading: true })
  );
}

export async function createCustomerServiceRoleModule(
  merchantRoleId: string,
  payload: CustomerServiceRoleModulePayload
): Promise<CustomerServiceRoleModuleInstance> {
  return unwrapData(await request({ path: `${rolePath}/${merchantRoleId}/modules`, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}

export async function updateCustomerServiceRoleModule(
  merchantRoleId: string,
  moduleId: string,
  payload: CustomerServiceRoleModulePayload
): Promise<CustomerServiceRoleModuleInstance> {
  return unwrapData(
    await request({ path: `${rolePath}/${merchantRoleId}/modules/${moduleId}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 })
  );
}
