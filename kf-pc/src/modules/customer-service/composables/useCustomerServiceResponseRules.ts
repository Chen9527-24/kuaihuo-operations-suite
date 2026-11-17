import { reactive, ref } from 'vue';
import { listCustomerServiceResponseRules } from '../api/response-rules.api';
import type { CustomerServiceResponseRule, CustomerServiceResponseRuleQuery } from '../types/response-rules.types';

export function useCustomerServiceResponseRules() {
  const loading = ref(false);
  const items = ref<CustomerServiceResponseRule[]>([]);
  const filters = reactive<CustomerServiceResponseRuleQuery>({ keyword: '', status: '', page: 1, pageSize: 20 });
  const total = ref(0);

  async function fetchItems(resetPage = false) {
    if (resetPage) filters.page = 1;
    loading.value = true;
    try {
      const result = await listCustomerServiceResponseRules({ ...filters });
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
