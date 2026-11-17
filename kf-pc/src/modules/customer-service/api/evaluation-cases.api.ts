import { request } from '@/api/core/http';
import { normalizePageResult, type PageResult } from '@/utils/apiData';
import type { CustomerServiceEvaluationCase } from '../types/evaluation-cases.types';

export async function listCustomerServiceEvaluationCases(
  params: Record<string, unknown> = {}
): Promise<PageResult<CustomerServiceEvaluationCase>> {
  return normalizePageResult<CustomerServiceEvaluationCase>(
    await request({ path: '/customer-service/admin/evaluation-cases', method: 'GET', query: params, apiVersion: 5 })
  );
}
