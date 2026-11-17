import { request } from '@/api/core/http';
import { isRecord, unwrapData } from '@/utils/apiData';
import type { CustomerServiceOverview } from '../types/overview.types';

export async function getCustomerServiceOverview(): Promise<CustomerServiceOverview> {
  const response = await request<unknown>({
    path: '/customer-service/admin/overview',
    apiVersion: 5,
    skipGlobalLoading: true
  });
  const data = unwrapData(response);
  if (!isRecord(data)) {
    throw new Error('智能客服概览接口返回格式不正确');
  }
  return data as unknown as CustomerServiceOverview;
}
