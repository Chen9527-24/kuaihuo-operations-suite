import { reactive, ref } from 'vue';
import { listCustomerServiceAssets } from '../api/assets.api';
import type { CustomerServiceAsset, CustomerServiceAssetQuery } from '../types/assets.types';

export function useCustomerServiceAssets() {
  const loading = ref(false);
  const items = ref<CustomerServiceAsset[]>([]);
  const filters = reactive<CustomerServiceAssetQuery>({ keyword: '', assetType: '', status: '', page: 1, pageSize: 20 });
  const total = ref(0);

  async function fetchItems(resetPage = false) {
    if (resetPage) filters.page = 1;
    loading.value = true;
    try {
      const result = await listCustomerServiceAssets({ ...filters });
      items.value = result.items;
      total.value = result.total;
    } finally {
      loading.value = false;
    }
  }

  function resetFilters() {
    Object.assign(filters, { keyword: '', assetType: '', status: '', page: 1 });
    return fetchItems();
  }

  return { loading, items, filters, total, fetchItems, resetFilters };
}
