import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData } from '@/utils/apiData';
import type {
  CreateCustomerServiceTuningSessionPayload,
  CustomerServiceRecognitionRecord,
  CustomerServiceTuningAnalysis,
  CustomerServiceRecognitionRecordListResult,
  CustomerServiceTuningSessionDeleteResult,
  CustomerServiceTuningSessionDetails,
  CustomerServiceTuningSessionListResult,
  CustomerServiceTuningSessionSummary,
  UpdateCustomerServiceTuningSessionPayload,
} from '../types/tuning-sessions.types';

const path = '/customer-service/admin/tuning-sessions';

export async function listCustomerServiceTuningSessions(params: Record<string, unknown>): Promise<CustomerServiceTuningSessionListResult> {
  return normalizePageResult<CustomerServiceTuningSessionSummary>(
    await request({ path, method: 'GET', query: params, apiVersion: 5, skipGlobalLoading: true }),
  );
}

export async function listCustomerServiceTuningAnalyses(params: Record<string, unknown>): Promise<CustomerServiceRecognitionRecordListResult> {
  return normalizePageResult<CustomerServiceRecognitionRecord>(
    await request({ path: `${path}/analyses`, method: 'GET', query: params, apiVersion: 5, skipGlobalLoading: true }),
  );
}

export async function getCustomerServiceTuningAnalysis(id: string): Promise<CustomerServiceTuningAnalysis> {
  return unwrapData(await request({ path: `${path}/analyses/${id}`, method: 'GET', apiVersion: 5, skipGlobalLoading: true }));
}

export async function acceptCustomerServiceTuningAnalysis(
  id: string,
  expectedContentHash?: string | null,
): Promise<{ accepted: true; analysisId: string; sessionId: string; messages: Array<{ id: string; role: 'ASSISTANT'; content: string }> }> {
  return unwrapData(await request({
    path: `${path}/analyses/${id}/accept`,
    method: 'POST',
    body: expectedContentHash ? { expectedContentHash } : {},
    apiVersion: 5,
    skipGlobalLoading: true,
  }));
}

export async function createCustomerServiceTuningSession(
  payload: CreateCustomerServiceTuningSessionPayload,
): Promise<CustomerServiceTuningSessionSummary> {
  return unwrapData(await request({ path, method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}

export async function getCustomerServiceTuningSession(id: string): Promise<CustomerServiceTuningSessionDetails> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'GET', apiVersion: 5, skipGlobalLoading: true }));
}

export async function updateCustomerServiceTuningSession(
  id: string,
  payload: UpdateCustomerServiceTuningSessionPayload,
): Promise<CustomerServiceTuningSessionDetails> {
  return unwrapData(await request({ path: `${path}/${id}`, method: 'PATCH', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}


export async function deleteCustomerServiceTuningSession(
  id: string,
): Promise<CustomerServiceTuningSessionDeleteResult> {
  return unwrapData(await request({
    path: `${path}/${id}`,
    method: 'DELETE',
    apiVersion: 5,
  }));
}

export async function deleteCustomerServiceTuningSessions(
  ids: string[],
): Promise<CustomerServiceTuningSessionDeleteResult> {
  return unwrapData(await request({
    path: `${path}/batch-delete`,
    method: 'POST',
    body: { ids },
    apiVersion: 5,
  }));
}

export async function appendCustomerServiceAssistantSegment(
  id: string,
  payload: { replyGroupId: string; segmentIndex: number; content: string; anchorClientMessageId?: string; clientMessageId?: string },
): Promise<{ id: string; role: 'ASSISTANT'; content: string; createdAt?: string }> {
  return unwrapData(await request({
    path: `${path}/${id}/assistant-segments`,
    method: 'POST',
    body: payload as unknown as Record<string, unknown>,
    apiVersion: 5,
    skipGlobalLoading: true,
  }));
}
