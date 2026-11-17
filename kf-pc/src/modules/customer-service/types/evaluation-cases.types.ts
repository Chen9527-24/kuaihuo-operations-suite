export interface CustomerServiceEvaluationCase {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  merchantRoleId?: string | null;
  industryNodeId?: string | null;
  message: string;
  expectedScenario?: string | null;
  expectedIntent?: string | null;
  expectedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedRoute?: string | null;
  serviceGoal?: string | null;
  customerState?: Record<string, unknown> | null;
  variables?: Record<string, unknown> | null;
  tags: string[];
  status: string;
  merchantRole?: { id: string; code: string; name: string } | null;
  industryNode?: { id: string; code: string; name: string; path: string } | null;
}

export interface CustomerServiceEvaluationCaseListResult {
  items: CustomerServiceEvaluationCase[];
  total: number;
  page: number;
  pageSize: number;
}
