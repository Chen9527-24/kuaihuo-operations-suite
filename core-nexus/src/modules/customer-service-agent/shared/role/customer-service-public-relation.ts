export type CustomerServicePublicRelationNormalization = {
  status: 'VALID' | 'EMPTY' | 'INVALID';
  value: string | null;
  normalizedFromLegacy: boolean;
  issues: string[];
};

const INVALID_RELATION = /(?:店铺业务|账号业务|平台业务|业务角色|内部角色|角色定位|岗位说明|业务)$/u;
const CHANNEL_PREFIX = /^(?:抖音|快手|小红书|微信视频号|视频号|微信|淘宝|天猫|京东|拼多多|平台)(?:的)?/u;
const GENERIC_PREFIX = /^(?:当前账号|本账号|账号|商家|店铺|品牌|官方|业务)(?:的)?/u;
const DESCRIPTOR_SEPARATOR = /[·•|｜/\\＞>:：→—–]/u;

/**
 * Public relation is a short customer-visible relationship label, not an internal role card.
 * Runtime compatibility may safely reduce old descriptor stacks to their final human-facing label,
 * while admin writes use STRICT_WRITE so new bad data cannot enter again.
 *
 * This intentionally does not maintain a closed vocabulary: labels such as “搭配师 / 主播 / 教练”
 * remain legal as long as they are concise and do not encode platform/brand/internal descriptor stacks.
 */
export function normalizeCustomerServicePublicRelation(
  value: unknown,
  options: {
    businessLabels?: Array<string | null | undefined>;
    mode?: 'RUNTIME_COMPAT' | 'STRICT_WRITE';
  } = {},
): CustomerServicePublicRelationNormalization {
  const raw = cleanRaw(value);
  if (!raw) return { status: 'EMPTY', value: null, normalizedFromLegacy: false, issues: [] };

  const strictWrite = options.mode === 'STRICT_WRITE';
  const issues: string[] = [];
  const rawToken = cleanToken(raw);
  const segments = raw
    .split(/[·•|｜/\\＞>:：→—–]+/u)
    .map(cleanToken)
    .filter(Boolean);
  let candidate = segments.length > 1 ? segments[segments.length - 1] : rawToken;

  for (const businessLabel of options.businessLabels || []) {
    const normalizedBusiness = cleanToken(businessLabel);
    if (!normalizedBusiness) continue;
    candidate = candidate.replace(new RegExp(`^${escapeRegExp(normalizedBusiness)}(?:店铺|商店|官方)?(?:的)?`, 'u'), '');
  }

  candidate = candidate.replace(CHANNEL_PREFIX, '').replace(GENERIC_PREFIX, '').trim();
  const normalizedFromLegacy = Boolean(candidate && candidate !== rawToken);

  if (!candidate) issues.push('对外关系称谓不能为空');
  if (candidate && [...candidate].length < 2) issues.push('对外关系称谓过短，请填写客户能自然理解的关系称谓');
  if (candidate && [...candidate].length > 16) issues.push('对外关系称谓最多 16 个字，只保留客户能自然理解的短称谓');
  if (candidate && INVALID_RELATION.test(candidate)) issues.push('对外关系称谓不能使用“店铺业务/账号业务/业务角色”等内部字段式描述');
  if (strictWrite && (DESCRIPTOR_SEPARATOR.test(raw) || normalizedFromLegacy)) {
    issues.push('对外关系称谓不要包含平台、品牌、店铺或内部岗位描述，只填写例如“售后客服 / 技术支持 / 搭配师”这样的短称谓');
  }

  if (issues.length) return { status: 'INVALID', value: null, normalizedFromLegacy, issues: unique(issues) };
  return { status: 'VALID', value: candidate, normalizedFromLegacy, issues: [] };
}

export function assertCustomerServicePublicRelation(value: unknown) {
  const normalized = normalizeCustomerServicePublicRelation(value, { mode: 'STRICT_WRITE' });
  if (normalized.status !== 'VALID') {
    throw new Error(normalized.issues[0] || '对外关系称谓无效');
  }
  return normalized.value!;
}

function cleanRaw(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function cleanToken(value: unknown) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, '').replace(/[，。！？!?；;、,.()（）【】\[\]“”"']/g, '')
    : '';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values: string[]) {
  return [...new Set(values)];
}
