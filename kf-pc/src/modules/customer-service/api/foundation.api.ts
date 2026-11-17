import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';
import type { CustomerServiceAliFlagshipSyncResult, CustomerServiceFoundationResult, CustomerServiceFoundationStatus } from '../types/foundation.types';

const path = '/customer-service/admin/foundation';

export async function getCustomerServiceFoundationStatus(): Promise<CustomerServiceFoundationStatus> {
  return unwrapData(await request({ path: `${path}/status`, apiVersion: 5, skipGlobalLoading: true }));
}

export async function initializeCustomerServiceFoundation(): Promise<CustomerServiceFoundationResult> {
  return unwrapData(await request({ path: `${path}/initialize`, method: 'POST', body: {}, apiVersion: 5 }));
}


export async function syncCustomerServiceAliFlagship(): Promise<CustomerServiceAliFlagshipSyncResult> {
  return unwrapData(await request({ path: `${path}/sync-ali-flagship`, method: 'POST', body: {}, apiVersion: 5 }));
}
