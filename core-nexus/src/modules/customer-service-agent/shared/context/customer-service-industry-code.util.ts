/**
 * Canonical industry vocabulary for Customer Service knowledge/runtime scope.
 *
 * Design rules:
 * - Runtime never compares user-authored/free-form industry strings directly.
 * - New writes should persist canonical taxonomy codes.
 * - Historical aliases are normalized only here, as migration compatibility.
 * - Unknown custom codes remain isolated and require exact normalized equality.
 * - Channel/service-mode labels are not industries and normalize to generic scope.
 */

const LEGACY_ALIAS_TO_CANONICAL: Readonly<Record<string, string | null>> = Object.freeze({
  'fashion-apparel': 'apparel',
  'beauty-skincare': 'skincare',
  'digital-3c': 'digital-3c',
  'saas-b2b': 'saas-b2b',
  'private-community': null,
});

/**
 * Compatibility families follow the built-in industry taxonomy at category/subcategory level.
 * Top-level ecommerce is intentionally NOT a shared family root, otherwise unrelated verticals
 * such as apparel and digital would become mutually compatible.
 */
const FAMILY_BY_CANONICAL_CODE: Readonly<Record<string, string>> = Object.freeze({
  apparel: 'apparel',
  'women-clothing': 'apparel',
  beauty: 'beauty',
  skincare: 'beauty',
  'digital-3c': 'digital-3c',
  'smart-device': 'digital-3c',
  'saas-b2b': 'saas-b2b',
});

export function normalizeCustomerServiceIndustryCodeSyntax(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || null;
}

export function canonicalizeCustomerServiceIndustryCode(value: unknown): string | null {
  const normalized = normalizeCustomerServiceIndustryCodeSyntax(value);
  if (!normalized) return null;
  if (Object.prototype.hasOwnProperty.call(LEGACY_ALIAS_TO_CANONICAL, normalized)) {
    return LEGACY_ALIAS_TO_CANONICAL[normalized] ?? null;
  }
  return normalized;
}

export function customerServiceIndustryFamilyCode(value: unknown): string | null {
  const canonical = canonicalizeCustomerServiceIndustryCode(value);
  if (!canonical) return null;
  return FAMILY_BY_CANONICAL_CODE[canonical] || canonical;
}

export function areCustomerServiceIndustryCodesCompatible(left: unknown, right: unknown): boolean {
  const leftCanonical = canonicalizeCustomerServiceIndustryCode(left);
  const rightCanonical = canonicalizeCustomerServiceIndustryCode(right);
  if (!leftCanonical || !rightCanonical) return false;
  if (leftCanonical === rightCanonical) return true;
  return customerServiceIndustryFamilyCode(leftCanonical) === customerServiceIndustryFamilyCode(rightCanonical);
}

export function isLegacyCustomerServiceIndustryCode(value: unknown): boolean {
  const normalized = normalizeCustomerServiceIndustryCodeSyntax(value);
  if (!normalized) return false;
  const canonical = canonicalizeCustomerServiceIndustryCode(normalized);
  return canonical !== normalized;
}
