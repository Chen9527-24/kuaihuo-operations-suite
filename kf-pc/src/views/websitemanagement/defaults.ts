import type { WebsiteContent } from '@/api/modules/website';
export type { WebsiteContent } from '@/api/modules/website';

// Empty authoring defaults. No customer list, claims, contact details or third-party assets are bundled.
export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  schemaVersion: 1,
  site: { title: '企业站点示例', description: '请填写自己的站点介绍', faviconUrl: '', siteUrl: '', brandName: '', qrCodeUrl: '' },
  navigation: { system: '介绍', products: '产品', cooperation: '合作', contact: '联系' },
  hero: { eyebrow: '', titleLines: ['请配置站点内容'], emphasis: '', summary: '', partnersTitle: '', partnersNote: '', partners: [] },
  system: { enabled: false, kicker: '', titleLines: [], emphasis: '', summary: '', proofTitle: '', proofSummary: '', loginImageUrl: '', dashboardImageUrl: '' },
  products: { enabled: false, kicker: '', titleLines: [], emphasis: '', summary: '', guideText: '', guideRecommendation: '', items: [] },
  workflow: { enabled: false, kicker: '', titleLines: [], emphasis: '', steps: [] },
  cooperation: { enabled: false, kicker: '', titleLines: [], emphasis: '', summary: '', modes: [] },
  cta: { enabled: false, kicker: '', titleLines: [], emphasis: '', buttonText: '联系' },
  footer: { connectionTitle: '', connectionSummary: '', contactTitle: '', contactSummary: '', contactLinkText: '联系', slogan: '' },
  contact: { pageTitle: '联系', pageDescription: '', formKicker: '', formTitle: '咨询', submitText: '提交', privacyNote: '提交前请确认站点隐私说明。', successMessage: '已提交。', qrTitleLines: [], qrNote: '', challengeOptions: [], nextSteps: [] }
};

export function cloneDefaultWebsiteContent(): WebsiteContent {
  return JSON.parse(JSON.stringify(DEFAULT_WEBSITE_CONTENT)) as WebsiteContent;
}

export function mergeWebsiteContent(value?: Partial<WebsiteContent> | null): WebsiteContent {
  const defaults = cloneDefaultWebsiteContent();
  if (!value) return defaults;
  return deepMerge(defaults, value) as WebsiteContent;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (Array.isArray(source)) return JSON.parse(JSON.stringify(source));
  if (!source || typeof source !== 'object') return source === undefined ? target : source;
  const base = target && typeof target === 'object' && !Array.isArray(target) ? { ...(target as Record<string, unknown>) } : {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    base[key] = deepMerge(base[key], value);
  }
  return base;
}
