import { request } from '@/api/core/http';
import { isRecord, unwrapData } from '@/utils/apiData';
import type { CustomerServiceEvaluationBenchmarkManifest, CustomerServiceHumanityComparisonResult, CustomerServiceHumanityConversationList, CustomerServiceHumanityEvaluationReport, CustomerServiceHumanityOutputArtifact, CustomerServiceHumanityReview, CustomerServiceHumanityScoreResult, CustomerServiceIntentBenchmarkResult } from '../types/evaluation-benchmarks.types';

const path = '/customer-service/admin/evaluation-benchmarks';

export async function getCustomerServiceEvaluationBenchmarkManifest() {
  const data = unwrapData(await request<unknown>({ path: `${path}/manifest`, method: 'GET', apiVersion: 5 }));
  if (!isRecord(data) || !isRecord(data.intent) || !isRecord(data.humanity) || !isRecord(data.targets)) {
    throw new Error('评测基准清单接口返回格式不正确');
  }
  return data as unknown as CustomerServiceEvaluationBenchmarkManifest;
}

export async function runCustomerServiceIntentBenchmark(failureLimit = 100) {
  const data = unwrapData(await request<unknown>({ path: `${path}/intent/run`, method: 'POST', query: { failureLimit }, apiVersion: 5 }));
  if (!isRecord(data) || !isRecord(data.benchmark) || !isRecord(data.metrics) || !Array.isArray(data.failures)) {
    throw new Error('意图识别基准接口返回格式不正确');
  }
  return data as unknown as CustomerServiceIntentBenchmarkResult;
}

export async function listCustomerServiceHumanityConversations(offset = 0, limit = 80) {
  const data = unwrapData(await request<unknown>({ path: `${path}/humanity/conversations`, method: 'GET', query: { offset, limit }, apiVersion: 5 }));
  if (!isRecord(data) || !isRecord(data.manifest) || !Array.isArray(data.items)) {
    throw new Error('真人感评测对话接口返回格式不正确');
  }
  return data as unknown as CustomerServiceHumanityConversationList;
}


export async function evaluateCustomerServiceHumanityArtifact(artifact: CustomerServiceHumanityOutputArtifact) {
  const data = unwrapData(await request<unknown>({ path: `${path}/humanity/evaluate`, method: 'POST', body: { artifact }, apiVersion: 5 }));
  if (!isRecord(data) || !isRecord(data.metrics) || !isRecord(data.counts)) {
    throw new Error('真人感自动评估接口返回格式不正确');
  }
  return data as unknown as CustomerServiceHumanityEvaluationReport;
}

export async function compareCustomerServiceHumanityArtifacts(baselineArtifact: CustomerServiceHumanityOutputArtifact, candidateArtifact: CustomerServiceHumanityOutputArtifact) {
  const data = unwrapData(await request<unknown>({ path: `${path}/humanity/compare`, method: 'POST', body: { baselineArtifact, candidateArtifact }, apiVersion: 5 }));
  if (!isRecord(data) || !isRecord(data.baseline) || !isRecord(data.candidate) || !isRecord(data.comparison)) {
    throw new Error('真人感候选对比接口返回格式不正确');
  }
  return data as unknown as CustomerServiceHumanityComparisonResult;
}

export async function scoreCustomerServiceHumanityReviews(reviews: CustomerServiceHumanityReview[]) {
  const data = unwrapData(await request<unknown>({ path: `${path}/humanity/score`, method: 'POST', body: { reviews }, apiVersion: 5 }));
  if (!isRecord(data) || !isRecord(data.metrics) || !isRecord(data.targets)) {
    throw new Error('真人感评测汇总接口返回格式不正确');
  }
  return data as unknown as CustomerServiceHumanityScoreResult;
}
