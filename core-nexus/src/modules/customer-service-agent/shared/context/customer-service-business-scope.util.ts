import { stableJsonHash } from '../utils/stable-json-hash.util';
import {
  areCustomerServiceIndustryCodesCompatible,
  canonicalizeCustomerServiceIndustryCode,
} from './customer-service-industry-code.util';

/**
 * Stage 2E Runtime Integrity: a server-owned projection of identity scope.
 *
 * This does not decide business behavior. It only makes the already-resolved
 * tenant/role/account/store/industry relationship explicit so downstream State,
 * Knowledge and Claim provenance can prove they belong to the same runtime scope.
 */
export type CustomerServiceEffectiveBusinessScopeV1 = {
  schemaVersion: 1;
  contract: 'EFFECTIVE_BUSINESS_SCOPE';
  tenantId: string;
  merchantRoleId: string;
  accountProfileId: string | null;
  storeProfileId: string | null;
  industryNodeId: string | null;
  industryCode: string | null;
  fingerprint: string;
  evidence: string[];
};

export type CustomerServiceBusinessScopeResolution = {
  scope: CustomerServiceEffectiveBusinessScopeV1;
  issueKeys: string[];
};

export function resolveCustomerServiceEffectiveBusinessScope(input: {
  tenantId: string;
  merchantRoleId: string;
  roleIndustryNodeId?: string | null;
  accountProfileId?: string | null;
  accountMerchantRoleId?: string | null;
  accountStoreProfileId?: string | null;
  accountIndustryNodeId?: string | null;
  storeProfileId?: string | null;
  industryNodeId?: string | null;
  industryCode?: string | null;
}): CustomerServiceBusinessScopeResolution {
  const tenantId = clean(input.tenantId);
  const merchantRoleId = clean(input.merchantRoleId);
  const accountProfileId = nullable(input.accountProfileId);
  const storeProfileId = nullable(input.storeProfileId);
  const industryNodeId = nullable(input.industryNodeId);
  const industryCode = canonicalizeCustomerServiceIndustryCode(input.industryCode);
  const roleIndustryNodeId = nullable(input.roleIndustryNodeId);
  const accountMerchantRoleId = nullable(input.accountMerchantRoleId);
  const accountStoreProfileId = nullable(input.accountStoreProfileId);
  const accountIndustryNodeId = nullable(input.accountIndustryNodeId);

  const issueKeys: string[] = [];
  const evidence: string[] = [];
  if (!tenantId || !merchantRoleId) issueKeys.push('BUSINESS_SCOPE_IDENTITY_MISSING');
  if (accountMerchantRoleId && accountMerchantRoleId !== merchantRoleId) {
    issueKeys.push('BUSINESS_SCOPE_ACCOUNT_ROLE_MISMATCH');
  }
  if (accountStoreProfileId && storeProfileId && accountStoreProfileId !== storeProfileId) {
    issueKeys.push('BUSINESS_SCOPE_ACCOUNT_STORE_MISMATCH');
  }
  if (accountIndustryNodeId && industryNodeId && accountIndustryNodeId !== industryNodeId) {
    issueKeys.push('BUSINESS_SCOPE_ACCOUNT_INDUSTRY_MISMATCH');
  }
  // A role with an explicit industry is a bounded role. A generic role may leave
  // this null and let its bound account select the concrete industry.
  if (roleIndustryNodeId && industryNodeId && roleIndustryNodeId !== industryNodeId) {
    issueKeys.push('BUSINESS_SCOPE_ROLE_INDUSTRY_MISMATCH');
  }

  evidence.push(`ROLE:${merchantRoleId || '-'}`);
  if (accountProfileId) evidence.push(`ACCOUNT:${accountProfileId}`);
  if (storeProfileId) evidence.push(`STORE:${storeProfileId}`);
  if (industryNodeId) evidence.push(`INDUSTRY_NODE:${industryNodeId}`);
  if (industryCode) evidence.push(`INDUSTRY_CODE:${industryCode}`);

  const fingerprint = stableJsonHash({
    schemaVersion: 1,
    tenantId,
    merchantRoleId,
    accountProfileId,
    storeProfileId,
    industryNodeId,
    industryCode,
  });
  return {
    scope: {
      schemaVersion: 1,
      contract: 'EFFECTIVE_BUSINESS_SCOPE',
      tenantId,
      merchantRoleId,
      accountProfileId,
      storeProfileId,
      industryNodeId,
      industryCode,
      fingerprint,
      evidence,
    },
    issueKeys: [...new Set(issueKeys)],
  };
}

export function isCustomerServiceKnowledgeIndustryCoherent(
  collectionIndustryCode: unknown,
  scope: CustomerServiceEffectiveBusinessScopeV1 | null | undefined,
):
  | { coherent: true; reason: 'GENERIC_COLLECTION' | 'INDUSTRY_MATCH' }
  | { coherent: false; reason: 'INDUSTRY_SCOPE_UNRESOLVED' | 'FOREIGN_COLLECTION_INDUSTRY' } {
  const collectionCode = canonicalizeCustomerServiceIndustryCode(collectionIndustryCode);
  if (!collectionCode) return { coherent: true, reason: 'GENERIC_COLLECTION' as const };
  const scopeCode = canonicalizeCustomerServiceIndustryCode(scope?.industryCode);
  if (!scopeCode) return { coherent: false, reason: 'INDUSTRY_SCOPE_UNRESOLVED' as const };
  if (!areCustomerServiceIndustryCodesCompatible(collectionCode, scopeCode)) {
    return { coherent: false, reason: 'FOREIGN_COLLECTION_INDUSTRY' as const };
  }
  return { coherent: true, reason: 'INDUSTRY_MATCH' as const };
}

function clean(value: unknown) { return String(value || '').trim(); }
function nullable(value: unknown) { const text = clean(value); return text || null; }
