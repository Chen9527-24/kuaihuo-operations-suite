import type { CustomerServicePublishedGuideline } from './customer-service-guideline.type';

export function normalizeCustomerServicePublishedGuidelines(items: Array<{ guideline: any; version: any }>): CustomerServicePublishedGuideline[] {
  return items.map(({ guideline, version }) => ({
    guidelineId: String(guideline.id),
    code: String(guideline.code),
    name: String(guideline.name),
    originType: String(guideline.originType || 'TENANT_CUSTOM'),
    versionId: String(version.id),
    versionNo: Number(version.versionNo || 0),
    schemaVersion: Number(version.schemaVersion || 1),
    binding: asRecord(version.binding) as any,
    condition: asRecord(version.condition) as any,
    actions: Array.isArray(version.actions) ? version.actions as any : [],
    priority: Number(version.priority || 0),
    criticality: String(version.criticality || 'STANDARD') as any,
    tags: stringArray(version.tags),
    relationships: asRecord(version.relationships) as any,
    evidenceRefs: stringArray(version.evidenceRefs),
    contentHash: String(version.contentHash || ''),
  }));
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []; }
