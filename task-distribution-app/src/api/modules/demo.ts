import http from '@/services/http'

export async function getSamplePost(tenantsId: string | number) {
  return http.get(`/posts/tenant`, { params: { tenantsId } })
}
