import { request } from '@/api/core/http';
import { normalizePageResult, type PageResult } from '@/utils/apiData';

export interface OperationLogItem {
  id: string;
  module: string;
  action: string;
  tenantId?: string | null;
  operatorId?: string | null;
  targetId?: string | null;
  content?: string | null;
  createdAt?: string;
}

export interface OperationLogQuery {
  module?: string;
  action?: string;
  tenantId?: string;
  page?: number;
  pageSize?: number;
}

export async function listOperationLogs(query: OperationLogQuery): Promise<PageResult<OperationLogItem>> {
  const payload = await request<unknown>({
    path: '/operation-logs',
    query
  });
  return normalizePageResult<OperationLogItem>(payload);
}
