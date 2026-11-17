import { normalizeCustomerServicePublicRelation } from '../../shared/role/customer-service-public-relation';
export type CustomerServicePublicIdentitySource =
  | 'STORE_BRAND'
  | 'STORE_NAME'
  | 'ACCOUNT_PUBLIC_IDENTITY'
  | 'ACCOUNT_NAME'
  | 'NONE';

export type CustomerServicePublicIdentityProjection = {
  schemaVersion: 1;
  /** Customer-visible business/brand label only. Never an internal role descriptor. */
  businessLabel: string | null;
  /** V1.8 explicit customer-visible business relationship. Never inferred from the model or generic HVE fallback. */
  relationLabel: string | null;
  /** Preferred shortest public identity surface, composed only from explicitly safe public sources. */
  preferredSurfaceLabel: string | null;
  /** Optional person-like public name. Only usable when the Plan authorizes name disclosure. */
  publicName: string | null;
  source: CustomerServicePublicIdentitySource;
  allowedSurfaceLabels: string[];
  /** Internal role/persona labels intentionally withheld from customer-visible NLG. */
  withheldInternalLabels: string[];
};

export function resolveCustomerServicePublicIdentityProjection(input: {
  merchantRoleName?: string | null;
  merchantRolePublicIdentity?: string | null;
  /** Explicitly configured customer-visible relationship, e.g. 售后客服 / 技术支持 / 销售顾问. */
  merchantRolePublicRelation?: string | null;
  prototypeIdentity?: string | null;
  accountName?: string | null;
  accountPublicIdentity?: string | null;
  storeName?: string | null;
  storeBrandName?: string | null;
  businessAnchored: boolean;
}): CustomerServicePublicIdentityProjection {
  const businessCandidates: Array<{ value: string | null; source: CustomerServicePublicIdentitySource }> = [
    { value: cleanBusinessLabel(input.storeBrandName), source: 'STORE_BRAND' },
    { value: cleanBusinessLabel(input.storeName), source: 'STORE_NAME' },
    { value: cleanBusinessLabel(input.accountPublicIdentity), source: 'ACCOUNT_PUBLIC_IDENTITY' },
    { value: cleanBusinessLabel(input.accountName), source: 'ACCOUNT_NAME' },
  ];
  const selected = businessCandidates.find((item) => Boolean(item.value)) || { value: null, source: 'NONE' as const };
  const businessLabel = selected.value;
  // MerchantRole.name is an internal Role Library identifier (for example a persona name),
  // not an explicit customer-visible naming grant. Keep publicName closed until a dedicated
  // public-agent-name field is introduced by product configuration.
  const publicName = null;
  // V1.8: never default every role to 客服. Relation is explicit configuration authority.
  const relationLabel = normalizeCustomerServicePublicRelation(input.merchantRolePublicRelation, {
    businessLabels: [businessLabel, input.storeBrandName, input.storeName, input.accountPublicIdentity, input.accountName],
  }).value;
  const preferredSurfaceLabel = composePreferredSurfaceLabel(businessLabel, relationLabel);
  const allowedSurfaceLabels = uniqueStrings([preferredSurfaceLabel, businessLabel, relationLabel, publicName]);
  const rawInternalLabels = uniqueStrings([
    input.merchantRolePublicIdentity,
    input.prototypeIdentity,
    input.merchantRoleName,
  ]);
  const descriptorFragments = rawInternalLabels.flatMap((value) => deriveInternalDescriptorFragments(value, businessLabel));
  const withheldInternalLabels = uniqueStrings([...rawInternalLabels, ...descriptorFragments])
    .filter((value) => !allowedSurfaceLabels.some((allowed) => compact(allowed) === compact(value)));

  return {
    schemaVersion: 1,
    businessLabel,
    relationLabel,
    preferredSurfaceLabel,
    publicName,
    source: selected.source,
    allowedSurfaceLabels,
    withheldInternalLabels,
  };
}

function composePreferredSurfaceLabel(businessLabel: string | null, relationLabel: string | null) {
  if (businessLabel && relationLabel) {
    const combined = `${businessLabel}${relationLabel}`;
    if ([...combined].length <= 32) return combined;
  }
  return relationLabel || businessLabel || null;
}

function cleanBusinessLabel(value: unknown) {
  let text = clean(value);
  if (!text) return null;
  text = text.replace(/(?:的)?(?:智能客服|AI客服|客服顾问|售前售后客服|售后客服|客服|服务顾问|业务顾问|导购顾问|顾问|导购|店员|技术支持|销售顾问|课程顾问|运营专员|品牌运营)$/iu, '');
  text = text.replace(/(?:的)?(?:官方账号|官方店铺|旗舰店|专卖店|专营店|店铺|商店|账号|官方)$/iu, '');
  text = text.replace(/的$/u, '').trim();
  if (!text || isGenericIdentityLabel(text) || looksLikeInternalRoleDescriptor(text)) return null;
  return text.slice(0, 48);
}

function deriveInternalDescriptorFragments(value: string, businessLabel: string | null) {
  const fragments = new Set<string>();
  const raw = clean(value);
  if (!raw) return [];
  let stripped = raw;
  if (businessLabel) stripped = stripped.replace(new RegExp(`^${escapeRegExp(businessLabel)}(?:店铺|商店|官方)?的?`, 'u'), '');
  stripped = stripped.replace(/^(?:我们|本店|店里|商家|店铺|品牌|官方账号|官方|账号)的?/u, '');
  stripped = stripped.replace(/^.*?(?=(?:全能|资深|专业|高级|金牌|专属|首席|售前|售后|客服|服务|业务|导购|技术|课程|销售|品牌).{0,16}(?:客服|顾问|导购|店员|专员|专家|支持|运营))/u, '');
  if (looksLikeInternalRoleDescriptor(stripped) && [...stripped].length >= 3) fragments.add(stripped);
  const tail = raw.match(/((?:全能|资深|专业|高级|金牌|专属|首席)?(?:售前售后|售前|售后|客服|服务|业务|导购|技术|课程|销售|品牌)?(?:客服|服务)?(?:顾问|客服|导购|店员|专员|专家|支持|运营))$/u)?.[1];
  if (tail && [...tail].length >= 3) fragments.add(tail);
  return [...fragments];
}

function looksLikeInternalRoleDescriptor(value: string) {
  return /(?:客服|售后|顾问|导购|店员|服务|专员|专家|经理|运营|全能|技术支持|课程顾问|销售顾问)/iu.test(value);
}

function isGenericIdentityLabel(value: string) {
  return /^(?:客服|售后|顾问|导购|店员|商家|店铺|品牌|官方|官方账号|账号|服务|全能|技术支持|销售顾问|课程顾问|品牌运营)$/iu.test(value);
}

function clean(value: unknown) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').replace(/[，。！？!?；;、,.()（）【】\[\]“”"']/g, '').trim()
    : '';
}

function compact(value: unknown) {
  return clean(value).toLowerCase();
}

function uniqueStrings(values: Array<unknown>) {
  return [...new Set(values.map((item) => clean(item)).filter(Boolean))];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
