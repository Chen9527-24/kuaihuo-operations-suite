import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type {
  CustomerServiceIntentDefinition,
  CustomerServiceIntentPayload,
  CustomerServiceIntentQuery,
  UpdateCustomerServiceIntentPayload,
  CreateIntentFromRecognitionPayload
} from '../types/intent-definitions.types';

const path = '/customer-service/admin/intent-definitions';

export async function listCustomerServiceIntentDefinitions(query: CustomerServiceIntentQuery): Promise<PageResult<CustomerServiceIntentDefinition>> {
  return normalizePageResult<CustomerServiceIntentDefinition>(await request({ path, query, apiVersion: 5, skipGlobalLoading: true }));
}

export async function createCustomerServiceIntentDefinition(payload: CustomerServiceIntentPayload): Promise<CustomerServiceIntentDefinition> {
  return unwrapData(await request({ path, method: 'POST', body: payload, apiVersion: 5 }));
}

export async function updateCustomerServiceIntentDefinition(id: string, payload: UpdateCustomerServiceIntentPayload): Promise<CustomerServiceIntentDefinition> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'PATCH', body: payload, apiVersion: 5 }));
}


export async function createCustomerServiceIntentFromRecognition(payload: CreateIntentFromRecognitionPayload): Promise<CustomerServiceIntentDefinition> {
  return unwrapData(await request({ path: `${path}/from-recognition`, method: 'POST', body: payload, apiVersion: 5 }));
}

const candidatePath = '/customer-service/admin/intent-candidates';

export async function listCustomerServiceIntentCandidates(query: import('../types/intent-definitions.types').CustomerServiceIntentCandidateQuery): Promise<PageResult<import('../types/intent-definitions.types').CustomerServiceIntentCandidate>> {
  return normalizePageResult<import('../types/intent-definitions.types').CustomerServiceIntentCandidate>(await request({ path: candidatePath, query, apiVersion: 5, skipGlobalLoading: true }));
}

export async function convertCustomerServiceIntentCandidate(id: string): Promise<{ definition: CustomerServiceIntentDefinition; candidateId: string }> {
  return unwrapData(await request({ path: `${candidatePath}/${id}/as-intent`, method: 'POST', apiVersion: 5 }));
}

export async function updateCustomerServiceIntentCandidateStatus(id: string, status: 'PENDING' | 'IGNORED'): Promise<import('../types/intent-definitions.types').CustomerServiceIntentCandidate> {
  return unwrapData(await request({ path: `${candidatePath}/${id}/status`, method: 'PATCH', body: { status }, apiVersion: 5 }));
}
