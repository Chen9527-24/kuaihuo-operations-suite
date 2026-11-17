import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

export function useCustomerServicePermission() {
  const auth = useAuthStore();
  const has = (code: string) => auth.isPlatformAdmin || auth.user.permissions.includes(code);
  return { has, permissions: computed(() => auth.user.permissions) };
}
