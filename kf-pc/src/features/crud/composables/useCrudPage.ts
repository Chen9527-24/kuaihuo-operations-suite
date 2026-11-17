import { computed, reactive, watch } from 'vue';
import type { CrudUsePageOptions } from '../types';

interface PaginationState {
  currentPage: number;
  pageSize: number;
}

function cloneFilters<T extends Record<string, unknown>>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useCrudPage<TItem, TFilters extends Record<string, unknown>>(
  options: CrudUsePageOptions<TItem, TFilters>
) {
  const filters = reactive(cloneFilters(options.initialFilters)) as TFilters;

  const pagination = reactive<PaginationState>({
    currentPage: 1,
    pageSize: options.pageSize ?? 5
  });

  const filteredItems = computed(() => options.items.filter((item) => options.filterFn(item, filters)));

  const pagedItems = computed(() => {
    const start = (pagination.currentPage - 1) * pagination.pageSize;
    return filteredItems.value.slice(start, start + pagination.pageSize);
  });

  watch(
    filters,
    () => {
      pagination.currentPage = 1;
    },
    { deep: true }
  );

  watch(
    () => pagination.pageSize,
    () => {
      pagination.currentPage = 1;
    }
  );

  function resetFilters() {
    Object.assign(filters, cloneFilters(options.initialFilters));
  }

  return {
    filters,
    pagination,
    filteredItems,
    pagedItems,
    resetFilters
  };
}
