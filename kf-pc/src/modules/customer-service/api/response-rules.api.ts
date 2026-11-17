import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type {
  CreateCustomerServiceResponseRulePayload,
  CustomerServiceResponseRule,
  CustomerServiceResponseRuleQuery,
  UpdateCustomerServiceResponseRulePayload
} from '../types/response-rules.types';

const path = '/customer-service/admin/response-rules';

export async function listCustomerServiceResponseRules(
  query: CustomerServiceResponseRuleQuery
): Promise<PageResult<CustomerServiceResponseRule>> {
  return normalizePageResult<CustomerServiceResponseRule>(await request({ path, query, apiVersion: 5, skipGlobalLoading: true }));
}

export async function createCustomerServiceResponseRule(
  payload: CreateCustomerServiceResponseRulePayload
): Promise<CustomerServiceResponseRule> {
  return unwrapData(await request({ path, method: 'POST', body: payload, apiVersion: 5 }));
}

export async function updateCustomerServiceResponseRule(
  id: string,
  payload: UpdateCustomerServiceResponseRulePayload
): Promise<CustomerServiceResponseRule> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'PATCH', body: payload, apiVersion: 5 }));
}
