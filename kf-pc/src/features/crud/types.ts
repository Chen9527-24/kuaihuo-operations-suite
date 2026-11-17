export interface SummaryCardItem {
  label: string;
  value: string;
  tip?: string;
}

export interface CrudUsePageOptions<TItem, TFilters extends Record<string, unknown>> {
  items: TItem[];
  initialFilters: TFilters;
  filterFn: (item: TItem, filters: TFilters) => boolean;
  pageSize?: number;
}
