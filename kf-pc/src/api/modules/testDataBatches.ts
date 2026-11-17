import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';

export type TestDataBatchStatus = 'ACTIVE' | 'ARCHIVED' | 'PURGED';

export interface TestDataBatchItem {
  id: string;
  tenantId: string;
  name: string;
  purpose?: string | null;
  status: TestDataBatchStatus | string;
  createdById?: string | null;
  archivedAt?: string | null;
  archivedById?: string | null;
  purgedAt?: string | null;
  purgedById?: string | null;
  tenant?: { id: string; name: string; code?: string } | null;
  _count?: { tasks?: number; users?: number; groups?: number; participants?: number; withdrawals?: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface TestDataBatchUser {
  id: string;
  appUserId: string;
  role: 'MEMBER' | 'LEADER' | 'OPERATOR' | string;
  createdAt?: string;
  appUser?: { id: string; nickname?: string | null; phone?: string | null; isTestData?: boolean; deletedAt?: string | null } | null;
}

export interface TestDataBatchGroup {
  id: string;
  groupId: string;
  createdAt?: string;
  group?: { id: string; name: string; leaderName?: string | null; leaderPhone?: string | null; leaderUserId?: string | null; status?: string; deletedAt?: string | null } | null;
}

export interface TestDataBatchPreview {
  batchId: string;
  batchName: string;
  status: string;
  taskIds: string[];
  participantIds: string[];
  settlementIds: string[];
  ledgerIds: string[];
  withdrawalIds: string[];
  affectedUserIds: string[];
  taskCount: number;
  participantCount: number;
  commissionSettlementCount: number;
  walletLedgerCount: number;
  withdrawalCount: number;
  groupCount: number;
  accountCount: number;
  externalWithdrawalCount: number;
  tasks: Array<{ id: string; title: string; status: string; distributionScope?: string | null; distributionGroupId?: string | null }>;
  confirmText: string;
  blockers: string[];
  canPurge: boolean;
}

export interface TestDataBatchDetail extends TestDataBatchItem {
  users: TestDataBatchUser[];
  groups: TestDataBatchGroup[];
  preview: TestDataBatchPreview;
}

export async function listTestDataBatches(params: Record<string, unknown> = {}): Promise<PageResult<TestDataBatchItem>> {
  const payload = await request<unknown>({ path: '/test-data-batches', query: params });
  return normalizePageResult<TestDataBatchItem>(payload);
}

export async function getTestDataBatch(id: string): Promise<TestDataBatchDetail> {
  return unwrapData<TestDataBatchDetail>(await request<unknown>({ path: `/test-data-batches/${id}` }));
}

export async function createTestDataBatch(data: { tenantId: string; name: string; purpose?: string }) {
  return unwrapData<TestDataBatchItem>(await request<unknown>({ path: '/test-data-batches', method: 'POST', body: data }));
}

export async function updateTestDataBatch(id: string, data: { purpose?: string; status?: 'ACTIVE' | 'ARCHIVED' }) {
  return unwrapData<TestDataBatchItem>(await request<unknown>({ path: `/test-data-batches/${id}`, method: 'PATCH', body: data }));
}

export async function bindTestDataBatchUsers(id: string, appUserIds: string[], role: 'MEMBER' | 'LEADER' | 'OPERATOR' = 'MEMBER') {
  return unwrapData<TestDataBatchDetail>(await request<unknown>({ path: `/test-data-batches/${id}/users`, method: 'POST', body: { appUserIds, role } }));
}

export async function unbindTestDataBatchUser(id: string, appUserId: string) {
  return unwrapData<{ success: boolean }>(await request<unknown>({ path: `/test-data-batches/${id}/users/${appUserId}`, method: 'DELETE' }));
}

export async function bindTestDataBatchGroups(id: string, groupIds: string[]) {
  return unwrapData<TestDataBatchDetail>(await request<unknown>({ path: `/test-data-batches/${id}/groups`, method: 'POST', body: { groupIds } }));
}

export async function unbindTestDataBatchGroup(id: string, groupId: string) {
  return unwrapData<{ success: boolean }>(await request<unknown>({ path: `/test-data-batches/${id}/groups/${groupId}`, method: 'DELETE' }));
}

export async function getTestDataBatchPurgePreview(id: string): Promise<TestDataBatchPreview> {
  return unwrapData<TestDataBatchPreview>(await request<unknown>({ path: `/test-data-batches/${id}/purge-preview` }));
}

export async function forcePurgeTestDataBatch(id: string, confirmText: string) {
  return unwrapData<{ success: boolean; batchId: string }>(await request<unknown>({ path: `/test-data-batches/${id}/force-purge`, method: 'POST', body: { confirmText } }));
}
