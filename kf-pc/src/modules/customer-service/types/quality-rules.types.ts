export interface CustomerServiceQualityRule {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category: 'PROGRAM' | 'FACT' | 'POLICY' | 'SAFETY' | 'STYLE';
  severity: 'BLOCKER' | 'ERROR' | 'WARNING';
  ruleType: string;
  config: Record<string, unknown>;
  status: string;
  sort: number;
}

export interface CustomerServiceQualityRuleListResult {
  items: CustomerServiceQualityRule[];
  total: number;
  page: number;
  pageSize: number;
}
