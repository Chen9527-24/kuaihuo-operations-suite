export type CustomerServiceQualityIssue = {
  ruleId: string;
  key: string;
  name: string;
  category: string;
  severity: 'BLOCKER' | 'ERROR' | 'WARNING';
  passed: boolean;
  message: string;
  evidence: string[];
  disposition?: 'BLOCK' | 'REWRITE' | 'SCORE_ONLY';
};

export type CustomerServiceQualityReport = {
  status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_RUN';
  checkedRuleCount: number;
  blockerCount: number;
  errorCount: number;
  warningCount: number;
  blockingIssueCount: number;
  rewriteIssueCount: number;
  scoreOnlyIssueCount: number;
  naturalnessScore: number;
  issues: CustomerServiceQualityIssue[];
};
