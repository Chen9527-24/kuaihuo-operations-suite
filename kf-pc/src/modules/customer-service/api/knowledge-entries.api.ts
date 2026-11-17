import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type {
  CustomerServiceKnowledgeBinding,
  CustomerServiceKnowledgeBindingTargetType,
  CustomerServiceKnowledgeApplicabilityTarget,
  CustomerServiceKnowledgeCollection,
  CustomerServiceKnowledgeEntry,
  CustomerServiceKnowledgeEntryPayload,
  CustomerServiceKnowledgeEntryQuery,
  CustomerServiceKnowledgePreviewItem,
  CustomerServiceKnowledgePreviewDiagnostics,
  CustomerServiceFixedQaResolveResult,
} from '../types/context-profiles.types';

const basePath = '/customer-service/admin/knowledge-entries';
export async function listCustomerServiceKnowledgeEntries(query: CustomerServiceKnowledgeEntryQuery = {}): Promise<PageResult<CustomerServiceKnowledgeEntry>> {
  return normalizePageResult<CustomerServiceKnowledgeEntry>(await request({ path: basePath, query: query as Record<string, unknown>, apiVersion: 5, skipGlobalLoading: true }));
}
export async function createCustomerServiceKnowledgeEntry(payload: CustomerServiceKnowledgeEntryPayload) {
  return unwrapData<CustomerServiceKnowledgeEntry>(await request({ path: basePath, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function updateCustomerServiceKnowledgeEntry(id: string, payload: Partial<CustomerServiceKnowledgeEntryPayload> & { revision: number }) {
  return unwrapData<CustomerServiceKnowledgeEntry>(await request({ path: `${basePath}/${id}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}
export async function deleteCustomerServiceKnowledgeEntry(id: string, revision: number) {
  return unwrapData<{ id: string; deleted: boolean }>(await request({ path: `${basePath}/${id}`, method: 'DELETE', query: { revision }, apiVersion: 5 }));
}

export async function listCustomerServiceKnowledgeCollections() {
  return unwrapData<CustomerServiceKnowledgeCollection[]>(await request({ path: `${basePath}/collections`, apiVersion: 5, skipGlobalLoading: true }));
}
export async function createCustomerServiceKnowledgeCollection(payload: { name: string; code?: string | null; description?: string | null; industryCode?: string | null; status?: string; applicability?: CustomerServiceKnowledgeApplicabilityTarget[] }) {
  return unwrapData<CustomerServiceKnowledgeCollection>(await request({ path: `${basePath}/collections`, method: 'POST', body: payload, apiVersion: 5 }));
}
export async function updateCustomerServiceKnowledgeCollection(id: string, payload: { revision: number; name?: string; code?: string | null; description?: string | null; industryCode?: string | null; status?: string; applicability?: CustomerServiceKnowledgeApplicabilityTarget[] }) {
  return unwrapData<CustomerServiceKnowledgeCollection>(await request({ path: `${basePath}/collections/${id}`, method: 'PATCH', body: payload, apiVersion: 5 }));
}
export async function reconcileCustomerServiceKnowledgeLegacyApplicability() {
  return unwrapData<{ scanned: number; repaired: number; unresolved: string[]; industryCanonicalized?: number; industryConflicts?: string[] }>(await request({ path: `${basePath}/collections/reconcile-legacy-applicability`, method: 'POST', apiVersion: 5, skipGlobalLoading: true }));
}
export async function listCustomerServiceKnowledgeBindings(collectionId: string) {
  return unwrapData<CustomerServiceKnowledgeBinding[]>(await request({ path: `${basePath}/collections/${collectionId}/bindings`, apiVersion: 5, skipGlobalLoading: true }));
}
export async function upsertCustomerServiceKnowledgeBinding(collectionId: string, payload: { targetType: CustomerServiceKnowledgeBindingTargetType; targetKey: string; priority?: number; status?: 'ENABLED' | 'DISABLED' }) {
  return unwrapData<CustomerServiceKnowledgeBinding>(await request({ path: `${basePath}/collections/${collectionId}/bindings`, method: 'POST', body: payload, apiVersion: 5 }));
}
export async function deleteCustomerServiceKnowledgeBinding(id: string) {
  return unwrapData<{ id: string; deleted: boolean }>(await request({ path: `${basePath}/bindings/${id}`, method: 'DELETE', apiVersion: 5 }));
}
export async function batchImportCustomerServiceKnowledge(payload: { collectionId: string; sourceFileName?: string; status?: string; entries: Array<Record<string, unknown>> }) {
  return unwrapData<{ collectionId: string; imported: number; ids: string[] }>(await request({ path: `${basePath}/batch-import`, method: 'POST', body: payload, apiVersion: 5 }));
}
export async function previewCustomerServiceKnowledge(payload: { accountProfileId?: string; storeProfileId?: string; merchantRoleId?: string; message: string; scenario?: string; intent?: string }) {
  return unwrapData<{ query: string; selected: CustomerServiceKnowledgePreviewItem[]; total: number; evidence: Array<Record<string, unknown>>; diagnostics?: CustomerServiceKnowledgePreviewDiagnostics }>(await request({ path: `${basePath}/preview`, method: 'POST', body: payload, apiVersion: 5, skipGlobalLoading: true }));
}
export async function resolveCustomerServiceFixedQa(payload: { accountProfileId?: string; storeProfileId?: string; merchantRoleId?: string; message: string }) {
  return unwrapData<CustomerServiceFixedQaResolveResult>(await request({ path: `${basePath}/fixed-qa/resolve`, method: 'POST', body: payload, apiVersion: 5, skipGlobalLoading: true }));
}
