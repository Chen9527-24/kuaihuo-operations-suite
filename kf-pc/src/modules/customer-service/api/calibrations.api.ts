import { request } from '@/api/core/http';
import { normalizePageResult, unwrapData } from '@/utils/apiData';
import type {
  CustomerServiceCalibrationApplyResult,
  CustomerServiceCalibrationCurrentReplyApplication,
  CustomerServiceCalibrationProfile,
  CustomerServiceCalibrationProfileListResult,
  CustomerServiceCalibrationProfileStatus,
  CustomerServiceCalibrationCreatePayload,
  CustomerServiceCalibrationRefinePayload,
  CustomerServiceCalibrationFromReplyPayload,
  CustomerServiceCalibrationListResult,
  CustomerServiceKnowledgeRevisionDraftCreatePayload,
  CustomerServiceCalibrationRecord,
  CustomerServiceCalibrationScopeType,
  CustomerServiceCalibrationStatus,
  CustomerServiceCalibrationStrategyDraftResult,
  CustomerServiceCalibrationStrategyPublishResult,
  CustomerServiceCalibrationStrategyRegressionResult,
  CustomerServiceStrategyDraftRegressionEvidence
} from '../types/calibrations.types';

export async function listCustomerServiceCalibrations(params: Record<string, unknown>): Promise<CustomerServiceCalibrationListResult> {
  return normalizePageResult<CustomerServiceCalibrationRecord>(await request({ path: '/customer-service/admin/calibrations', method: 'GET', query: params, apiVersion: 5 }));
}

export async function getCustomerServiceCalibration(id: string): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({ path: `/customer-service/admin/calibrations/${id}`, method: 'GET', apiVersion: 5 }));
}

export async function createCustomerServiceCalibration(payload: CustomerServiceCalibrationCreatePayload): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({ path: '/customer-service/admin/calibrations', method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}

export async function createCustomerServiceCalibrationFromReply(payload: CustomerServiceCalibrationFromReplyPayload): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({ path: '/customer-service/admin/calibrations/from-reply', method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 }));
}

export async function analyzeCustomerServiceCalibration(id: string): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({ path: `/customer-service/admin/calibrations/${id}/analyze`, method: 'POST', apiVersion: 5 }));
}

export async function refineCustomerServiceCalibrationAnalysis(
  id: string,
  payload: CustomerServiceCalibrationRefinePayload = {}
): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${id}/refine-analysis`,
    method: 'POST',
    body: payload as unknown as Record<string, unknown>,
    apiVersion: 5
  }));
}

export async function updateCustomerServiceCalibrationStatus(id: string, status: CustomerServiceCalibrationStatus): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({ path: `/customer-service/admin/calibrations/${id}/status`, method: 'PATCH', body: { status }, apiVersion: 5 }));
}

export async function applyCustomerServiceCalibrationToTuning(
  id: string,
  scopeType: CustomerServiceCalibrationScopeType = 'ROLE_CONTEXT',
  confirmExpandedScope = false,
  analysisIteration?: number
): Promise<CustomerServiceCalibrationApplyResult> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${id}/apply-to-tuning`,
    method: 'POST',
    body: {
      scopeType,
      ...(confirmExpandedScope ? { confirmExpandedScope: true } : {}),
      ...(analysisIteration ? { analysisIteration } : {})
    },
    apiVersion: 5
  }));
}

export async function applyCustomerServiceCalibrationCurrentTestReply(
  id: string
): Promise<CustomerServiceCalibrationCurrentReplyApplication> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${id}/apply-current-test-reply`,
    method: 'POST',
    apiVersion: 5
  }));
}

export async function createCustomerServiceCalibrationStrategyDraft(id: string): Promise<CustomerServiceCalibrationStrategyDraftResult> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${id}/strategy-draft`,
    method: 'POST',
    apiVersion: 5
  }));
}

export async function recordCustomerServiceCalibrationStrategyRegression(
  id: string,
  evidence: CustomerServiceStrategyDraftRegressionEvidence
): Promise<CustomerServiceCalibrationStrategyRegressionResult> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${id}/strategy-draft/regression`,
    method: 'POST',
    body: evidence as unknown as Record<string, unknown>,
    apiVersion: 5
  }));
}

export async function publishCustomerServiceCalibrationStrategyDraft(
  id: string
): Promise<CustomerServiceCalibrationStrategyPublishResult> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${id}/strategy-draft/publish`,
    method: 'POST',
    apiVersion: 5
  }));
}


export async function listCustomerServiceCalibrationProfiles(params: Record<string, unknown>): Promise<CustomerServiceCalibrationProfileListResult> {
  return normalizePageResult<CustomerServiceCalibrationProfile>(await request({ path: '/customer-service/admin/calibration-profiles', method: 'GET', query: params, apiVersion: 5 }));
}

export async function getCustomerServiceCalibrationProfile(id: string): Promise<CustomerServiceCalibrationProfile> {
  return unwrapData(await request({ path: `/customer-service/admin/calibration-profiles/${id}`, method: 'GET', apiVersion: 5 }));
}

export async function updateCustomerServiceCalibrationProfileStatus(id: string, status: CustomerServiceCalibrationProfileStatus): Promise<CustomerServiceCalibrationProfile> {
  return unwrapData(await request({ path: `/customer-service/admin/calibration-profiles/${id}/status`, method: 'PATCH', body: { status }, apiVersion: 5 }));
}

export async function createCustomerServiceKnowledgeRevisionDraft(
  calibrationId: string,
  payload: CustomerServiceKnowledgeRevisionDraftCreatePayload
): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${calibrationId}/knowledge-revision-draft`,
    method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5
  }));
}

export async function verifyCustomerServiceKnowledgeRevisionDraft(
  calibrationId: string, revision: number, verificationNote: string
): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${calibrationId}/knowledge-revision-draft/verify`,
    method: 'POST', body: { revision, confirmedFact: true, verificationNote }, apiVersion: 5
  }));
}

export async function publishCustomerServiceKnowledgeRevisionDraft(
  calibrationId: string, revision: number
): Promise<CustomerServiceCalibrationRecord> {
  return unwrapData(await request({
    path: `/customer-service/admin/calibrations/${calibrationId}/knowledge-revision-draft/publish`,
    method: 'POST', body: { revision, confirmPublish: true }, apiVersion: 5
  }));
}
