import { Injectable } from '@nestjs/common';
import { CustomerServiceMessageUnderstandingService } from '../../runtime/understanding/customer-service-message-understanding.service';
import { V515_HUMANITY_BLIND_MANIFEST, V515_HUMANITY_BLIND_SET, resolveHumanityBlindVersionMap } from './customer-service-humanity-blind-set-v1';
import { compareCustomerServiceHumanityArtifacts, evaluateCustomerServiceHumanityArtifact, V520_HUMANITY_EVALUATOR_VERSION } from './customer-service-humanity-evaluator-v2';
import { V515_INTENT_BENCHMARK, V515_INTENT_BENCHMARK_MANIFEST } from './customer-service-intent-benchmark-v1';

type ReviewRating = Record<string, number>;
type HumanityReview = {
  conversationId?: unknown;
  preferred?: unknown;
  candidateAnonymousId?: unknown; // legacy client field; C6-D scoring deliberately ignores it.
  ratingA?: unknown;
  ratingB?: unknown;
  flagsA?: unknown;
  flagsB?: unknown;
};
type NormalizedHumanityReview = NonNullable<ReturnType<typeof normalizeReview>>;

const HUMANITY_CONVERSATION_IDS = new Set(V515_HUMANITY_BLIND_SET.map((item) => item.id));

@Injectable()
export class CustomerServiceEvaluationBenchmarksService {
  constructor(private readonly understandingService: CustomerServiceMessageUnderstandingService) {}

  manifest() {
    return {
      version: 'v5.20-c6-d-evaluation-benchmarks-v2',
      intent: V515_INTENT_BENCHMARK_MANIFEST,
      humanity: { ...V515_HUMANITY_BLIND_MANIFEST, evaluatorVersion: V520_HUMANITY_EVALUATOR_VERSION },
      acceptancePolicy: {
        semanticRegressionRequired: true,
        humanBehaviorComparison: 'CANDIDATE_DEFECT_SCORE_LT_BASELINE',
        safetyRegressionCount: 0,
        blindReviewRequired: true,
        note: 'C6 候选必须同时满足既有 C5 语义回归、确定性人感指标改善、Safety regression=0，并完成匿名人工盲评。',
      },
      targets: {
        coveredScenarioAccuracy: 0.92,
        primaryIntentAccuracy: 0.9,
        macroF1: 0.88,
        highRiskRecall: 0.98,
        multiIntentPrimaryAccuracy: 0.88,
        secondaryIntentRecall: 0.82,
        topicShiftAccuracy: 0.9,
        multiTurnRelationAccuracy: 0.9,
        humanityAverage: 4.1,
        candidateBlindWinRate: 0.7,
        templatedRatio: 0.12,
        contextErrorRatio: 0.03,
        repeatedBoundaryRatio: 0.08,
        safetyRegressionCount: 0,
      },
    };
  }

  runIntentBenchmark(failureLimit = 100) {
    const rows = V515_INTENT_BENCHMARK.map((testCase) => {
      const actual = this.understandingService.understand({
        merchantRoleId: 'v515-intent-benchmark',
        message: testCase.message,
        conversationHistory: testCase.conversationHistory,
      });
      const actualSecondary = new Set(actual.intentRanking.filter((item) => item.role !== 'PRIMARY').map((item) => `${item.scenario}/${item.intent}/${item.role}`));
      const expectedSecondary = testCase.expectedSecondary.map((item) => `${item.scenario}/${item.intent}/${item.role}`);
      return {
        id: testCase.id,
        suite: testCase.suite,
        message: testCase.message,
        expected: { scenario: testCase.expectedScenario, intent: testCase.expectedIntent, riskLevel: testCase.expectedRiskLevel, relation: testCase.expectedTurnRelation, dominantGoal: testCase.expectedDominantGoal ?? null, secondary: expectedSecondary },
        actual: { scenario: actual.primaryScenario, intent: actual.primaryIntent, riskLevel: actual.riskLevel, relation: actual.humanContext.conversationTaskState.currentTurnRelation, dominantGoal: actual.humanContext.dominantTurnGoal.key, secondary: [...actualSecondary], confidence: actual.confidence, source: actual.source },
        passed: {
          scenario: actual.primaryScenario === testCase.expectedScenario,
          intent: actual.primaryIntent === testCase.expectedIntent,
          risk: actual.riskLevel === testCase.expectedRiskLevel,
          relation: actual.humanContext.conversationTaskState.currentTurnRelation === testCase.expectedTurnRelation,
          dominantGoal: !testCase.expectedDominantGoal || actual.humanContext.dominantTurnGoal.key === testCase.expectedDominantGoal,
          secondaryHits: expectedSecondary.filter((item) => actualSecondary.has(item)).length,
        },
        coveredScenario: testCase.coveredScenario,
        highRisk: ['HIGH', 'CRITICAL'].includes(testCase.expectedRiskLevel),
        novelExpression: testCase.novelExpression,
        multiTurn: testCase.conversationHistory.length > 0,
      };
    });
    const covered = rows.filter((row) => row.coveredScenario);
    const highRisk = rows.filter((row) => row.highRisk);
    const multiIntent = rows.filter((row) => row.expected.secondary.length > 0);
    const multiTurn = rows.filter((row) => row.multiTurn);
    const topicShift = rows.filter((row) => row.expected.relation === 'TOPIC_SHIFT');
    const scenarioMetric = macroF1(rows.map((row) => row.expected.scenario), rows.map((row) => row.actual.scenario));
    const intentMetric = macroF1(rows.map((row) => row.expected.intent), rows.map((row) => row.actual.intent));
    const failures = rows.filter((row) => !row.passed.scenario || !row.passed.intent || !row.passed.relation || !row.passed.dominantGoal || row.passed.secondaryHits < row.expected.secondary.length);
    return {
      benchmark: V515_INTENT_BENCHMARK_MANIFEST,
      mode: 'HEURISTIC_DETERMINISTIC',
      generatedAt: new Date().toISOString(),
      metrics: {
        coveredScenarioAccuracy: ratio(covered.filter((row) => row.passed.scenario).length, covered.length),
        primaryIntentAccuracy: ratio(rows.filter((row) => row.passed.intent).length, rows.length),
        scenarioMacroF1: scenarioMetric.score,
        intentMacroF1: intentMetric.score,
        highRiskRecall: ratio(highRisk.filter((row) => ['HIGH', 'CRITICAL'].includes(row.actual.riskLevel)).length, highRisk.length),
        multiIntentPrimaryAccuracy: ratio(multiIntent.filter((row) => row.passed.scenario && row.passed.intent).length, multiIntent.length),
        secondaryIntentRecall: ratio(sum(multiIntent.map((row) => row.passed.secondaryHits)), sum(multiIntent.map((row) => row.expected.secondary.length))),
        topicShiftAccuracy: ratio(topicShift.filter((row) => row.passed.relation).length, topicShift.length),
        multiTurnRelationAccuracy: ratio(multiTurn.filter((row) => row.passed.relation).length, multiTurn.length),
        unknownHighConfidenceOverclassificationRate: ratio(rows.filter((row) => row.expected.scenario === 'UNKNOWN' && row.actual.scenario !== 'UNKNOWN' && row.actual.confidence >= 0.82).length, rows.filter((row) => row.expected.scenario === 'UNKNOWN').length),
      },
      perLabel: { scenario: scenarioMetric.perLabel, intent: intentMetric.perLabel },
      bySuite: Object.fromEntries(unique(rows.map((row) => row.suite)).map((suite) => {
        const group = rows.filter((row) => row.suite === suite);
        return [suite, { samples: group.length, scenarioAccuracy: ratio(group.filter((row) => row.passed.scenario).length, group.length), intentAccuracy: ratio(group.filter((row) => row.passed.intent).length, group.length), relationAccuracy: ratio(group.filter((row) => row.passed.relation).length, group.length) }];
      })),
      failureCount: failures.length,
      failures: failures.slice(0, Math.max(0, Math.min(300, Math.trunc(failureLimit)))),
    };
  }

  listHumanityConversations(offset = 0, limit = 20) {
    const safeOffset = Math.max(0, Math.trunc(offset));
    const safeLimit = Math.max(1, Math.min(80, Math.trunc(limit)));
    return { manifest: V515_HUMANITY_BLIND_MANIFEST, total: V515_HUMANITY_BLIND_SET.length, offset: safeOffset, limit: safeLimit, items: V515_HUMANITY_BLIND_SET.slice(safeOffset, safeOffset + safeLimit) };
  }

  evaluateHumanityArtifact(input: unknown) {
    const record = asRecord(input);
    return evaluateCustomerServiceHumanityArtifact(record.artifact ?? input);
  }

  compareHumanityArtifacts(input: unknown) {
    const record = asRecord(input);
    return compareCustomerServiceHumanityArtifacts({
      baseline: record.baselineArtifact,
      candidate: record.candidateArtifact,
    });
  }

  scoreHumanityReviews(input: unknown) {
    const reviews = Array.isArray(asRecord(input).reviews) ? asRecord(input).reviews as HumanityReview[] : [];
    const valid = reviews.map(normalizeReview).filter((item): item is NormalizedHumanityReview => Boolean(item));
    const normalized = [...new Map(valid.map((item) => [item.conversationId, item])).values()];
    const candidateWins = normalized.filter((item) => item.preferred === item.candidateAnonymousId).length;
    const decided = normalized.filter((item) => item.preferred !== 'TIE').length;
    const candidateRatings = normalized.flatMap((item) => Object.values(item.candidateAnonymousId === 'A' ? item.ratingA : item.ratingB));
    const baselineRatings = normalized.flatMap((item) => Object.values(item.candidateAnonymousId === 'A' ? item.ratingB : item.ratingA));
    const candidateFlags = normalized.map((item) => item.candidateAnonymousId === 'A' ? item.flagsA : item.flagsB);
    const metrics = {
      candidateAverage: average(candidateRatings),
      baselineAverage: average(baselineRatings),
      candidateBlindWinRate: ratio(candidateWins, decided),
      templatedRatio: ratio(candidateFlags.filter((item) => item.templated).length, candidateFlags.length),
      contextErrorRatio: ratio(candidateFlags.filter((item) => item.contextError).length, candidateFlags.length),
      repeatedBoundaryRatio: ratio(candidateFlags.filter((item) => item.highlyRepeated).length, candidateFlags.length),
      safetyRegressionCount: candidateFlags.filter((item) => item.safetyViolation || item.factInvention || item.emptyOrTechnicalLeak).length,
    };
    const targets = this.manifest().targets;
    const targetChecks = {
      humanityAverage: metrics.candidateAverage >= targets.humanityAverage,
      candidateBlindWinRate: metrics.candidateBlindWinRate >= targets.candidateBlindWinRate,
      templatedRatio: metrics.templatedRatio <= targets.templatedRatio,
      contextErrorRatio: metrics.contextErrorRatio <= targets.contextErrorRatio,
      repeatedBoundaryRatio: metrics.repeatedBoundaryRatio <= targets.repeatedBoundaryRatio,
      safetyRegressionCount: metrics.safetyRegressionCount <= targets.safetyRegressionCount,
    };
    const completeForAcceptance = normalized.length >= V515_HUMANITY_BLIND_SET.length;
    return {
      submittedReviewCount: reviews.length,
      invalidReviewCount: reviews.length - valid.length,
      duplicateReviewCount: valid.length - normalized.length,
      reviewCount: normalized.length,
      completeForAcceptance,
      acceptancePassed: completeForAcceptance && Object.values(targetChecks).every(Boolean),
      targetChecks,
      metrics,
      targets,
      blindMappingPolicy: 'SERVER_DERIVED_FROM_CONVERSATION_ID',
    };
  }
}

function normalizeReview(value: HumanityReview) {
  const record = asRecord(value);
  const conversationId = String(record.conversationId || '').trim();
  const preferred = ['A', 'B', 'TIE'].includes(String(record.preferred)) ? String(record.preferred) as 'A' | 'B' | 'TIE' : null;
  if (!conversationId || !preferred || !HUMANITY_CONVERSATION_IDS.has(conversationId)) return null;
  const versionMap = resolveHumanityBlindVersionMap(conversationId);
  const candidateAnonymousId = versionMap.A === 'CANDIDATE' ? 'A' as const : 'B' as const;
  const ratingA = ratings(record.ratingA);
  const ratingB = ratings(record.ratingB);
  if (!ratingA || !ratingB) return null;
  return { conversationId, preferred, candidateAnonymousId, ratingA, ratingB, flagsA: flags(record.flagsA), flagsB: flags(record.flagsB) };
}

function ratings(value: unknown): ReviewRating | null {
  const record = asRecord(value);
  const dimensions = V515_HUMANITY_BLIND_MANIFEST.scoringDimensions;
  const output: ReviewRating = {};
  for (const key of dimensions) {
    const parsed = Number(record[key]);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return null;
    output[key] = clamp(parsed, 1, 5);
  }
  return output;
}

function flags(value: unknown) {
  const record = asRecord(value);
  return { templated: record.templated === true, contextError: record.contextError === true, highlyRepeated: record.highlyRepeated === true, safetyViolation: record.safetyViolation === true, factInvention: record.factInvention === true, emptyOrTechnicalLeak: record.emptyOrTechnicalLeak === true };
}

function macroF1(expected: string[], actual: string[]) {
  const labels = unique(expected);
  const perLabel = Object.fromEntries(labels.map((label) => {
    let tp = 0; let fp = 0; let fn = 0;
    for (let index = 0; index < expected.length; index += 1) {
      if (expected[index] === label && actual[index] === label) tp += 1;
      else if (expected[index] !== label && actual[index] === label) fp += 1;
      else if (expected[index] === label && actual[index] !== label) fn += 1;
    }
    const precision = ratio(tp, tp + fp); const recall = ratio(tp, tp + fn);
    return [label, { precision, recall, f1: precision + recall ? round((2 * precision * recall) / (precision + recall)) : 0, support: expected.filter((item) => item === label).length }];
  }));
  return { score: ratio(sum(Object.values(perLabel).map((item) => item.f1)), Object.keys(perLabel).length), perLabel };
}

function asRecord(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function unique<T>(items: T[]) { return [...new Set(items)]; }
function sum(items: number[]) { return items.reduce((total, item) => total + item, 0); }
function ratio(value: number, total: number) { return total > 0 ? round(value / total) : 0; }
function average(items: number[]) { return items.length ? round(sum(items) / items.length) : 0; }
function round(value: number) { return Math.round(value * 10_000) / 10_000; }
function clamp(value: number, min: number, max: number) { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; }
