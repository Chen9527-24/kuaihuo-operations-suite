import { computed, ref } from 'vue';
import { listCustomerServiceIndustryNodes } from '../api/industries.api';
import type { CustomerServiceIndustryNode } from '../types/industries.types';

export function useCustomerServiceIndustries() {
  const loading = ref(false);
  const items = ref<CustomerServiceIndustryNode[]>([]);
  const tree = computed(() => buildTree(items.value));

  async function fetchItems() {
    loading.value = true;
    try {
      items.value = await listCustomerServiceIndustryNodes();
    } finally {
      loading.value = false;
    }
  }

  return { loading, items, tree, fetchItems };
}

function buildTree(items: CustomerServiceIndustryNode[]) {
  const map = new Map(items.map((item) => [item.id, { ...item, children: [] as CustomerServiceIndustryNode[] }]));
  const roots: CustomerServiceIndustryNode[] = [];
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.children!.push(item);
    else roots.push(item);
  }
  return roots;
}
