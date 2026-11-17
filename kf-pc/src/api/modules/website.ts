import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';

export interface WebsiteProductContent {
  key: 'acquisition' | 'assistant' | 'hotstart' | 'director' | 'avatar';
  no: string;
  type: string;
  title: string;
  tabSummary: string;
  summary: string;
  output: string;
  boundary: string;
}

export interface WebsiteWorkflowStep {
  no: string;
  kicker: string;
  title: string;
  tabSummary: string;
  summary: string;
  outputs: string[];
}

export interface WebsiteCooperationMode {
  no: string;
  code: string;
  name: string;
  titleLines: string[];
  audience: string;
  deliverables: string[];
}

export interface WebsiteContent {
  schemaVersion: 1;
  site: { title: string; description: string; faviconUrl: string; siteUrl: string; brandName: string; qrCodeUrl: string };
  navigation: { system: string; products: string; cooperation: string; contact: string };
  hero: { eyebrow: string; titleLines: string[]; emphasis: string; summary: string; partnersTitle: string; partnersNote: string; partners: Array<{ name: string; imageUrl: string }> };
  system: { enabled: boolean; kicker: string; titleLines: string[]; emphasis: string; summary: string; proofTitle: string; proofSummary: string; loginImageUrl: string; dashboardImageUrl: string };
  products: { enabled: boolean; kicker: string; titleLines: string[]; emphasis: string; summary: string; guideText: string; guideRecommendation: string; items: WebsiteProductContent[] };
  workflow: { enabled: boolean; kicker: string; titleLines: string[]; emphasis: string; steps: WebsiteWorkflowStep[] };
  cooperation: { enabled: boolean; kicker: string; titleLines: string[]; emphasis: string; summary: string; modes: WebsiteCooperationMode[] };
  cta: { enabled: boolean; kicker: string; titleLines: string[]; emphasis: string; buttonText: string };
  footer: { connectionTitle: string; connectionSummary: string; contactTitle: string; contactSummary: string; contactLinkText: string; slogan: string };
  contact: { pageTitle: string; pageDescription: string; formKicker: string; formTitle: string; submitText: string; privacyNote: string; successMessage: string; qrTitleLines: string[]; qrNote: string; challengeOptions: string[]; nextSteps: string[] };
}

export interface WebsiteConfigurationRecord {
  id: string;
  draftContent: WebsiteContent | null;
  publishedContent: WebsiteContent | null;
  draftRevision: number;
  publishedRevision: number;
  updatedById?: string | null;
  publishedById?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface WebsiteAssetUploadResult {
  id: string;
  url: string;
  fullUrl?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
}

export async function getWebsiteConfiguration() {
  const payload = await request<unknown>({ path: '/website-management/configuration' });
  return unwrapData<WebsiteConfigurationRecord>(payload);
}

export async function saveWebsiteDraft(content: WebsiteContent, expectedRevision: number) {
  const payload = await request<unknown>({
    path: '/website-management/configuration/draft',
    method: 'PATCH',
    body: { content, expectedRevision }
  });
  return unwrapData<WebsiteConfigurationRecord>(payload);
}

export async function publishWebsiteDraft(expectedDraftRevision: number) {
  const payload = await request<unknown>({
    path: '/website-management/configuration/publish',
    method: 'POST',
    body: { expectedDraftRevision }
  });
  return unwrapData<WebsiteConfigurationRecord>(payload);
}

export async function restorePublishedWebsite(expectedDraftRevision: number) {
  const payload = await request<unknown>({
    path: '/website-management/configuration/restore-published',
    method: 'POST',
    body: { expectedDraftRevision }
  });
  return unwrapData<WebsiteConfigurationRecord>(payload);
}

export async function uploadWebsiteAsset(file: File) {
  const body = new FormData();
  body.append('file', file);
  const payload = await request<unknown>({ path: '/website-management/assets', method: 'POST', body });
  return unwrapData<WebsiteAssetUploadResult>(payload);
}
