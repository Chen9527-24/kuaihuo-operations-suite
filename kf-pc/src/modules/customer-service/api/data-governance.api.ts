import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';
import type { CustomerServiceGovernanceMode, CustomerServiceGovernanceOverview, CustomerServiceGovernanceRun } from '../types/data-governance.types';

const path = '/customer-service/admin/data-governance';

export async function getCustomerServiceGovernanceOverview(): Promise<CustomerServiceGovernanceOverview> {
  return unwrapData(await request({ path: `${path}/overview`, method: 'GET', apiVersion: 5, skipGlobalLoading: true }));
}

export async function listCustomerServiceGovernanceRuns(): Promise<CustomerServiceGovernanceRun[]> {
  return unwrapData(await request({ path: `${path}/runs`, method: 'GET', apiVersion: 5, skipGlobalLoading: true }));
}

export async function runCustomerServiceGovernance(payload: { mode: CustomerServiceGovernanceMode; retentionDays?: number; batchSize?: number; confirmation?: string }): Promise<CustomerServiceGovernanceRun> {
  return unwrapData(await request({ path: `${path}/runs`, method: 'POST', body: payload, apiVersion: 5 }));
}
