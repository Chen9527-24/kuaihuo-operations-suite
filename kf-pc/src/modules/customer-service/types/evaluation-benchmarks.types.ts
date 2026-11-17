export interface CustomerServiceEvaluationBenchmarkManifest {
  version: string;
  intent: { version: string; sampleCount: number; suiteCount: number; novelExpressionCount: number; novelExpressionRatio: number; annotationPolicy: string };
  humanity: { version: string; conversationCount: number; turnCount: number; scenarios: string[]; scoringDimensions: string[]; evaluatorVersion?: string };
  acceptancePolicy?: { semanticRegressionRequired: boolean; humanBehaviorComparison: string; safetyRegressionCount: number; blindReviewRequired: boolean; note?: string };
  targets: Record<string, number>;
}

export interface CustomerServiceIntentBenchmarkResult {
  benchmark: CustomerServiceEvaluationBenchmarkManifest['intent'];
  mode: string;
  generatedAt: string;
  metrics: Record<string, number>;
  perLabel: { scenario: Record<string, { precision: number; recall: number; f1: number; support: number }>; intent: Record<string, { precision: number; recall: number; f1: number; support: number }> };
  bySuite: Record<string, { samples: number; scenarioAccuracy: number; intentAccuracy: number; relationAccuracy: number }>;
  failureCount: number;
  failures: Array<{
    id: string;
    suite: string;
    message: string;
    expected: { scenario: string; intent: string; riskLevel: string; relation: string; dominantGoal: string | null; secondary: string[] };
    actual: { scenario: string; intent: string; riskLevel: string; relation: string; dominantGoal: string; secondary: string[]; confidence: number; source: string };
    passed: { scenario: boolean; intent: boolean; risk: boolean; relation: boolean; dominantGoal: boolean; secondaryHits: number };
  }>;
}

export interface CustomerServiceHumanityBlindConversation {
  id: string;
  scenario: string;
  relationship: string;
  customerTurns: string[];
  facts: string[];
  forbiddenInventions: string[];
  evaluationFocus: string[];
}

export interface CustomerServiceHumanityConversationList {
  manifest: CustomerServiceEvaluationBenchmarkManifest['humanity'];
  total: number;
  offset: number;
  limit: number;
  items: CustomerServiceHumanityBlindConversation[];
}

export interface CustomerServiceHumanityOutputArtifact {
  version: string;
  conversations: Array<{ id: string; replies: Array<{ draft: string | null }> }>;
}

export interface CustomerServiceHumanityReview {
  conversationId: string;
  preferred: 'A' | 'B' | 'TIE';
  /** @deprecated C6-D scoring derives the anonymous candidate side on the server. */
  candidateAnonymousId?: 'A' | 'B';
  ratingA: Record<string, number>;
  ratingB: Record<string, number>;
  flagsA: Record<string, boolean>;
  flagsB: Record<string, boolean>;
}

export interface CustomerServiceHumanityScoreResult {
  submittedReviewCount?: number;
  invalidReviewCount?: number;
  duplicateReviewCount?: number;
  reviewCount: number;
  completeForAcceptance: boolean;
  acceptancePassed?: boolean;
  targetChecks?: Record<string, boolean>;
  blindMappingPolicy?: string;
  metrics: Record<string, number>;
  acceptancePolicy?: { semanticRegressionRequired: boolean; humanBehaviorComparison: string; safetyRegressionCount: number; blindReviewRequired: boolean; note?: string };
  targets: Record<string, number>;
}

export interface CustomerServiceHumanityEvaluationReport {
  version: string;
  evaluationKind: string;
  limitation: string;
  counts: { conversations: number; turns: number; nonEmptyTurns: number; expressionPlanTurns: number };
  metrics: Record<string, number>;
  behaviorDefectScore: number;
  failureCount: number;
}

export interface CustomerServiceHumanityComparisonResult {
  version: string;
  baseline: CustomerServiceHumanityEvaluationReport;
  candidate: CustomerServiceHumanityEvaluationReport;
  deltas: Record<string, number>;
  comparison: {
    sameConversationCoverage: boolean;
    comparableConversationCount: number;
    behaviorDefectDelta: number;
    humanBehaviorImproved: boolean;
    humanBehaviorNotRegressed: boolean;
    improvedMetricCount: number;
    regressedMetricCount: number;
    improvedMetrics: string[];
    regressedMetrics: string[];
    candidateSafetyClear: boolean;
    candidateContextWithinExistingTarget: boolean;
  };
}

