import { reactive, ref } from 'vue';
import { listCustomerServiceRolePrototypes } from '../api/roles.api';
import type { CustomerServiceRolePrototype, CustomerServiceRoleQuery } from '../types/roles.types';

export function useCustomerServiceRoles() {
  const loading = ref(false);
  const items = ref<CustomerServiceRolePrototype[]>([]);
  const filters = reactive<CustomerServiceRoleQuery>({ keyword: '', status: '', page: 1, pageSize: 20 });
  const total = ref(0);

  async function fetchItems(resetPage = false) {
    if (resetPage) filters.page = 1;
    loading.value = true;
    try {
      const result = await listCustomerServiceRolePrototypes({ ...filters });
      items.value = result.items;
      total.value = result.total;
    } finally {
      loading.value = false;
    }
  }

  function resetFilters() {
    Object.assign(filters, { keyword: '', status: '', page: 1 });
    return fetchItems();
  }

  return { loading, items, filters, total, fetchItems, resetFilters };
}
