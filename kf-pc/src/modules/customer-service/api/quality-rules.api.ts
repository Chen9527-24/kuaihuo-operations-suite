import { request } from '@/api/core/http';
import { normalizePageResult, type PageResult } from '@/utils/apiData';
import type { CustomerServiceQualityRule } from '../types/quality-rules.types';

export async function listCustomerServiceQualityRules(
  params: Record<string, unknown> = {}
): Promise<PageResult<CustomerServiceQualityRule>> {
  return normalizePageResult<CustomerServiceQualityRule>(
    await request({ path: '/customer-service/admin/quality-rules', method: 'GET', query: params, apiVersion: 5 })
  );
}
