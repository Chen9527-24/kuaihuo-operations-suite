import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type {
  CustomerServiceAccountProfile,
  CustomerServiceAccountProfilePayload,
  CustomerServiceContextQuery,
  CustomerServiceLanguagePolicy,
  CustomerServiceLanguagePolicyPayload,
  CustomerServiceStoreProfile,
  CustomerServiceStoreProfilePayload,
} from '../types/context-profiles.types';

const basePath = '/customer-service/admin/context-profiles';

export async function listCustomerServiceStoreProfiles(query: CustomerServiceContextQuery = {}): Promise<PageResult<CustomerServiceStoreProfile>> {
  return normalizePageResult<CustomerServiceStoreProfile>(await request({ path: `${basePath}/stores`, query: query as Record<string, unknown>, apiVersion: 5, skipGlobalLoading: true }));
}
export async function getCustomerServiceStoreProfile(id: string) {
  return unwrapData<CustomerServiceStoreProfile>(await request({ path: `${basePath}/stores/${id}`, apiVersion: 5, skipGlobalLoading: true }));
}
export async function createCustomerServiceStoreProfile(payload: Omit<CustomerServiceStoreProfilePayload, 'revision'>) {
  return unwrapData<CustomerServiceStoreProfile>(await request({ path: `${basePath}/stores`, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function updateCustomerServiceStoreProfile(id: string, payload: Partial<CustomerServiceStoreProfilePayload> & { revision: number }) {
  return unwrapData<CustomerServiceStoreProfile>(await request({ path: `${basePath}/stores/${id}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function listCustomerServiceAccountProfiles(query: CustomerServiceContextQuery & { storeProfileId?: string; merchantRoleId?: string; channel?: string } = {}): Promise<PageResult<CustomerServiceAccountProfile>> {
  return normalizePageResult<CustomerServiceAccountProfile>(await request({ path: `${basePath}/accounts`, query: query as Record<string, unknown>, apiVersion: 5, skipGlobalLoading: true }));
}
export async function createCustomerServiceAccountProfile(payload: Omit<CustomerServiceAccountProfilePayload, 'revision'>) {
  return unwrapData<CustomerServiceAccountProfile>(await request({ path: `${basePath}/accounts`, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function updateCustomerServiceAccountProfile(id: string, payload: Partial<CustomerServiceAccountProfilePayload> & { revision: number }) {
  return unwrapData<CustomerServiceAccountProfile>(await request({ path: `${basePath}/accounts/${id}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function listCustomerServiceLanguagePolicies(query: CustomerServiceContextQuery & { scopeType?: string; scopeKey?: string } = {}): Promise<PageResult<CustomerServiceLanguagePolicy>> {
  return normalizePageResult<CustomerServiceLanguagePolicy>(await request({ path: `${basePath}/language-policies`, query: query as Record<string, unknown>, apiVersion: 5, skipGlobalLoading: true }));
}
export async function createCustomerServiceLanguagePolicy(payload: Omit<CustomerServiceLanguagePolicyPayload, 'revision'>) {
  return unwrapData<CustomerServiceLanguagePolicy>(await request({ path: `${basePath}/language-policies`, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function updateCustomerServiceLanguagePolicy(id: string, payload: Partial<CustomerServiceLanguagePolicyPayload> & { revision: number }) {
  return unwrapData<CustomerServiceLanguagePolicy>(await request({ path: `${basePath}/language-policies/${id}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
