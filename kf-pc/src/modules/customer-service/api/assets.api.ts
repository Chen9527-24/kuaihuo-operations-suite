import { request } from '@/api/core/http';
import { normalizeList, normalizePageResult, unwrapData, type PageResult } from '@/utils/apiData';
import type {
  CreateCustomerServiceAssetPayload,
  CreateCustomerServiceAssetVersionPayload,
  CustomerServiceAsset,
  CustomerServiceAssetQuery,
  CustomerServiceAssetVersion,
  UpdateCustomerServiceAssetPayload
} from '../types/assets.types';

const path = '/customer-service/admin/assets';

export async function listCustomerServiceAssets(query: CustomerServiceAssetQuery): Promise<PageResult<CustomerServiceAsset>> {
  return normalizePageResult<CustomerServiceAsset>(await request({ path, query, apiVersion: 5, skipGlobalLoading: true }));
}

export async function createCustomerServiceAsset(payload: CreateCustomerServiceAssetPayload): Promise<CustomerServiceAsset> {
  return unwrapData(await request({ path, method: 'POST', body: payload, apiVersion: 5 }));
}

export async function updateCustomerServiceAsset(id: string, payload: UpdateCustomerServiceAssetPayload): Promise<CustomerServiceAsset> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'PATCH', body: payload, apiVersion: 5 }));
}

export async function listCustomerServiceAssetVersions(id: string): Promise<CustomerServiceAssetVersion[]> {
  return normalizeList<CustomerServiceAssetVersion>(await request({ path: `${path}/${id}/versions`, apiVersion: 5, skipGlobalLoading: true }));
}

export async function createCustomerServiceAssetVersion(
  id: string,
  payload: CreateCustomerServiceAssetVersionPayload
): Promise<CustomerServiceAssetVersion> {
  return unwrapData(await request({ path: `${path}/${id}/versions`, method: 'POST', body: payload, apiVersion: 5 }));
}

export async function publishCustomerServiceAssetVersion(
  assetId: string,
  versionId: string,
  revision: number
): Promise<CustomerServiceAssetVersion> {
  return unwrapData(
    await request({ path: `${path}/${assetId}/versions/${versionId}/publish`, method: 'POST', body: { revision }, apiVersion: 5 })
  );
}


export async function rollbackCustomerServiceAssetVersion(
  assetId: string,
  targetVersionId: string,
  assetRevision: number,
  reason: string
): Promise<{ kind: 'ROLLED_BACK'; version: CustomerServiceAssetVersion; targetVersionId: string; replacedVersionId: string | null }> {
  return unwrapData(await request({
    path: `${path}/${assetId}/versions/${targetVersionId}/rollback`,
    method: 'POST',
    body: { assetRevision, confirmRollback: true, reason: reason.trim() },
    apiVersion: 5
  }));
}
