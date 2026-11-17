export interface CustomerLeadFormModel {
  companyName: string;
  contactName: string;
  contactPosition: string;
  contactInfo: string;
  leadSource: string;
  leadSourceDetail: string;
  companyAddress: string;
  primaryCategoriesInput: string;
  followUpStatus: string;
  followUpValue: string;
  followUpOwner: string;
  /** 仅在新增时用于生成第一条实际沟通历史。 */
  firstFollowUpAt: string;
  firstFollowUpMethod: string;
  firstFollowUpSummary: string;
  /** 当前待办的下次计划跟进时间。 */
  nextFollowUpAt: string;
  nextFollowUpPlan: string;
  requestedFeatures: string;
  currentSolution: string;
  notWonReason: string;
  remark: string;
}

export interface CustomerLeadFollowUpFormModel {
  /** 本次实际跟进发生时间。 */
  followedUpAt: string;
  followUpMethod: string;
  followUpOwner: string;
  summary: string;
  followUpStatus: string;
  followUpValue: string;
  /** 本次沟通完成后形成的下一次计划。 */
  nextFollowUpAt: string;
  nextFollowUpPlan: string;
}

export interface CustomerLeadFilters {
  keyword: string;
  followUpStatus: string;
  followUpValue: string;
  leadSource: string;
  followUpOwner: string;
  websiteInquiry: '' | 'ONLY' | 'UNREAD';
}
