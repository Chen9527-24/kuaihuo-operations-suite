import { request } from '@/api/core/http';
import { normalizePageResult, type PageResult, unwrapData } from '@/utils/apiData';

export interface CustomerLeadItem {
  id: string;
  companyName: string;
  contactName?: string | null;
  contactPosition?: string | null;
  contactInfo?: string | null;
  leadSource: string;
  leadSourceDetail?: string | null;
  companyAddress?: string | null;
  primaryCategories: string[];
  requestedFeatures?: string | null;
  currentSolution?: string | null;
  notWonReason?: string | null;
  followUpStatus: string;
  followUpValue: string;
  followUpOwner?: string | null;
  /** 当前待办的下次计划跟进时间，不是历史跟进时间。 */
  nextFollowUpAt?: string | null;
  nextFollowUpPlan?: string | null;
  /** 第一条实际沟通发生时间；完整历史请调 follow-ups 接口。 */
  firstFollowUpAt?: string | null;
  /** 最近一条实际沟通发生时间。 */
  lastFollowUpAt?: string | null;
  /** 与 lastFollowUpAt 对应的最新摘要；完整历史请调 follow-ups 接口。 */
  lastFollowUpNote?: string | null;
  followUpCount?: number;
  remark?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  websiteSubmission?: WebsiteContactSubmission | null;
}

export interface WebsiteContactSubmission {
  id: string;
  requestId?: string;
  submittedCompanyName?: string;
  submittedContactName?: string | null;
  submittedContactInfo?: string;
  businessOverview?: string;
  operatingAccounts?: string | null;
  challenge?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  userAgent?: string | null;
  privacyConsentAt?: string;
  viewedAt?: string | null;
  viewedById?: string | null;
  createdAt?: string;
}

export interface CustomerLeadFollowUpItem {
  id: string;
  customerLeadId: string;
  followedUpAt: string;
  followUpMethod?: string | null;
  followUpOwner?: string | null;
  summary: string;
  followUpStatus: string;
  followUpValue: string;
  nextFollowUpAt?: string | null;
  nextFollowUpPlan?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerLeadQuery {
  keyword?: string;
  followUpStatus?: string;
  followUpValue?: string;
  leadSource?: string;
  followUpOwner?: string;
  websiteInquiry?: 'ONLY' | 'UNREAD' | '';
  page?: number;
  pageSize?: number;
}

export interface WebsiteInquirySummary {
  total: number;
  unread: number;
  today: number;
  pendingContact: number;
  highValue: number;
  lastSevenDays: number;
}

export async function getWebsiteInquirySummary(): Promise<WebsiteInquirySummary> {
  const payload = await request<unknown>({ path: '/customer-leads/website-inquiries/summary' });
  return unwrapData<WebsiteInquirySummary>(payload);
}

export async function listWebsiteInquiries(query: CustomerLeadQuery): Promise<PageResult<CustomerLeadItem>> {
  const payload = await request<unknown>({ path: '/customer-leads/website-inquiries', query });
  return normalizePageResult<CustomerLeadItem>(payload);
}

export async function listDeletedWebsiteInquiries(query: CustomerLeadQuery): Promise<PageResult<CustomerLeadItem>> {
  const payload = await request<unknown>({ path: '/customer-leads/website-inquiries/trash', query });
  return normalizePageResult<CustomerLeadItem>(payload);
}

export async function getWebsiteInquiryDetail(id: string): Promise<CustomerLeadItem> {
  const payload = await request<unknown>({ path: `/customer-leads/website-inquiries/${id}` });
  return unwrapData<CustomerLeadItem>(payload);
}

export async function markWebsiteInquiryViewed(id: string): Promise<void> {
  await request<unknown>({ path: `/customer-leads/website-inquiries/${id}/viewed`, method: 'PATCH' });
}

export async function listWebsiteInquiryFollowUps(
  id: string,
  query: { page?: number; pageSize?: number } = {}
): Promise<PageResult<CustomerLeadFollowUpItem>> {
  const payload = await request<unknown>({ path: `/customer-leads/website-inquiries/${id}/follow-ups`, query });
  return normalizePageResult<CustomerLeadFollowUpItem>(payload);
}

export async function recordWebsiteInquiryFollowUp(id: string, payload: CustomerLeadFollowUpPayload) {
  return request<unknown>({ path: `/customer-leads/website-inquiries/${id}/follow-ups`, method: 'POST', body: payload });
}

export async function removeWebsiteInquiry(id: string): Promise<void> {
  await request<unknown>({ path: `/customer-leads/website-inquiries/${id}`, method: 'DELETE' });
}

export async function restoreWebsiteInquiry(id: string): Promise<void> {
  await request<unknown>({ path: `/customer-leads/website-inquiries/${id}/restore`, method: 'PATCH' });
}

export async function purgeWebsiteInquiry(id: string): Promise<void> {
  await request<unknown>({ path: `/customer-leads/website-inquiries/${id}/permanent`, method: 'DELETE' });
}

export async function markWebsiteSubmissionViewed(id: string): Promise<void> {
  await request<unknown>({
    path: `/customer-leads/${id}/website-submission/viewed`,
    method: 'PATCH'
  });
}

export interface CustomerLeadPayload {
  companyName: string;
  contactName?: string | null;
  contactPosition?: string | null;
  contactInfo?: string | null;
  leadSource?: string;
  leadSourceDetail?: string | null;
  companyAddress?: string | null;
  primaryCategories?: string[];
  requestedFeatures?: string | null;
  currentSolution?: string | null;
  notWonReason?: string | null;
  followUpStatus: string;
  followUpValue: string;
  followUpOwner?: string | null;
  /** 新建时的可选首次实际沟通；填写后后端会追加第一条历史。 */
  firstFollowUpAt?: string | null;
  firstFollowUpMethod?: string | null;
  firstFollowUpSummary?: string | null;
  nextFollowUpAt?: string | null;
  nextFollowUpPlan?: string | null;
  remark?: string | null;
}

export interface CustomerLeadFollowUpPayload {
  followedUpAt: string;
  followUpMethod?: string | null;
  followUpOwner?: string | null;
  summary: string;
  followUpStatus: string;
  followUpValue: string;
  nextFollowUpAt?: string | null;
  nextFollowUpPlan?: string | null;
}

export async function listCustomerLeads(query: CustomerLeadQuery): Promise<PageResult<CustomerLeadItem>> {
  const payload = await request<unknown>({
    path: '/customer-leads',
    query
  });
  return normalizePageResult<CustomerLeadItem>(payload);
}

export async function getCustomerLeadDetail(id: string): Promise<CustomerLeadItem> {
  const payload = await request<unknown>({ path: `/customer-leads/${id}` });
  return unwrapData<CustomerLeadItem>(payload);
}

export async function listCustomerLeadFollowUps(
  id: string,
  query: { page?: number; pageSize?: number } = {}
): Promise<PageResult<CustomerLeadFollowUpItem>> {
  const payload = await request<unknown>({
    path: `/customer-leads/${id}/follow-ups`,
    query
  });
  return normalizePageResult<CustomerLeadFollowUpItem>(payload);
}

export async function createCustomerLead(payload: CustomerLeadPayload) {
  return request<unknown>({
    path: '/customer-leads',
    method: 'POST',
    body: payload
  });
}

export async function updateCustomerLead(id: string, payload: Partial<CustomerLeadPayload>) {
  return request<unknown>({
    path: `/customer-leads/${id}`,
    method: 'PATCH',
    body: payload
  });
}

export async function recordCustomerLeadFollowUp(id: string, payload: CustomerLeadFollowUpPayload) {
  return request<unknown>({
    path: `/customer-leads/${id}/follow-ups`,
    method: 'POST',
    body: payload
  });
}

export async function removeCustomerLead(id: string) {
  return request<unknown>({
    path: `/customer-leads/${id}`,
    method: 'DELETE'
  });
}
