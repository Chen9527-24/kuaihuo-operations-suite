import { request } from '@/api/core/http';

export async function getHealthStatus() {
  return request<unknown>({
    path: '/health'
  });
}
