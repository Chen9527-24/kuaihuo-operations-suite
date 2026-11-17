import { request } from '@/api/core/http';

export async function getRbacOverview() {
  return request<unknown>({
    path: '/rbac/overview'
  });
}

export async function getMyAccess() {
  return request<unknown>({
    path: '/rbac/me/access'
  });
}
