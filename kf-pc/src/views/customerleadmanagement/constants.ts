import type { CustomerLeadFormModel } from './types';

export const CUSTOMER_LEAD_DEFAULT_FORM = {
  companyName: '',
  contactName: '',
  contactPosition: '',
  contactInfo: '',
  leadSource: 'UNKNOWN',
  leadSourceDetail: '',
  companyAddress: '',
  primaryCategoriesInput: '',
  followUpStatus: 'PENDING_CONTACT',
  followUpValue: 'NURTURE',
  followUpOwner: '',
  firstFollowUpAt: '',
  firstFollowUpMethod: '',
  firstFollowUpSummary: '',
  nextFollowUpAt: '',
  nextFollowUpPlan: '',
  requestedFeatures: '',
  currentSolution: '',
  notWonReason: '',
  remark: ''
};


/**
 * 仅供 PC 表单“回填默认示例”使用。
 * 不会直接写入数据库；时间以用户点击时的本地时间动态生成，便于直观看到首次跟进与下一次计划的区别。
 */
export function createCustomerLeadDemoForm(now = new Date()): CustomerLeadFormModel {
  const firstFollowUpAt = new Date(now);
  firstFollowUpAt.setDate(firstFollowUpAt.getDate() - 1);
  firstFollowUpAt.setHours(15, 0, 0, 0);

  const nextFollowUpAt = new Date(now);
  nextFollowUpAt.setDate(nextFollowUpAt.getDate() + 2);
  nextFollowUpAt.setHours(10, 30, 0, 0);

  return {
    ...CUSTOMER_LEAD_DEFAULT_FORM,
    companyName: '【演示数据】森屿美妆私域运营有限公司',
    contactName: '陈女士（示例）',
    contactPosition: '私域运营负责人',
    contactInfo: '微信：demo-meizhuang-01',
    leadSource: 'INBOUND',
    leadSourceDetail: '官网产品咨询表单（示例）',
    companyAddress: '广州市天河区（示例）',
    primaryCategoriesInput: '美妆护肤, 私域运营, 电商零售',
    followUpStatus: 'REQUIREMENT_DISCOVERY',
    followUpValue: 'HIGH',
    followUpOwner: '演示跟进人',
    firstFollowUpAt: formatDemoDateTime(firstFollowUpAt),
    firstFollowUpMethod: 'WECHAT',
    firstFollowUpSummary:
      '已完成首次沟通。客户希望自动客服能按售前、售后、投诉进行角色分流，并在复杂问题时无缝转人工；已约定提供场景化演示方案。',
    nextFollowUpAt: formatDemoDateTime(nextFollowUpAt),
    nextFollowUpPlan: '发送“售前 / 售后 / 投诉分流 + 人工接管”演示方案，并在约定时间回访试用反馈。',
    requestedFeatures:
      '自动客服需要更拟人化，能够区分售前、售后、投诉等意图；支持知识库引用、人工无缝接管和跟进结果沉淀。',
    currentSolution: '当前使用人工客服 + 通用客服 SaaS，正在比较现有方案、竞品和内部自建方案的投入产出。',
    notWonReason: '尚未进入最终采购决策；客户需要先确认场景分流准确率、人工接管体验以及与现有客服流程的衔接成本。',
    remark: '【演示数据】仅用于查看字段排版与跟进闭环，保存前请替换为真实客户信息。'
  };
}

function formatDemoDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export const CUSTOMER_LEAD_FOLLOW_UP_DEFAULT_FORM = {
  followedUpAt: '',
  followUpMethod: 'WECHAT',
  followUpOwner: '',
  summary: '',
  followUpStatus: 'PENDING_CONTACT',
  followUpValue: 'NURTURE',
  nextFollowUpAt: '',
  nextFollowUpPlan: ''
};

export const FOLLOW_UP_STATUS_OPTIONS = [
  { label: '待首次联系', value: 'PENDING_CONTACT', color: 'gray' },
  { label: '已建立联系', value: 'CONTACTED', color: 'blue' },
  { label: '需求调研中', value: 'REQUIREMENT_DISCOVERY', color: 'orange' },
  { label: '方案匹配中', value: 'SOLUTION_MATCHING', color: 'orange' },
  { label: '演示 / 试用中', value: 'DEMO_OR_TRIAL', color: 'blue' },
  { label: '商务洽谈中', value: 'BUSINESS_NEGOTIATION', color: 'green' },
  { label: '暂缓 / 等待条件', value: 'ON_HOLD', color: 'gray' },
  { label: '已成交 / 转正式客户', value: 'WON', color: 'green' },
  { label: '已流失', value: 'LOST', color: 'red' }
];

/** 是否还值得继续投入跟进资源，与“当前处于哪个阶段”分开表达。 */
export const FOLLOW_UP_VALUE_OPTIONS = [
  { label: '高优先级推进', value: 'HIGH', color: 'green' },
  { label: '有意向 · 持续培育', value: 'NURTURE', color: 'blue' },
  { label: '产品能力待匹配', value: 'PRODUCT_GAP', color: 'orange' },
  { label: '时机未成熟', value: 'TIMING', color: 'orange' },
  { label: '低优先级观察', value: 'LOW', color: 'gray' },
  { label: '暂不建议继续跟进', value: 'NO_FOLLOW_UP', color: 'red' },
  { label: '已转正式客户', value: 'CONVERTED', color: 'green' }
];

export const LEAD_SOURCE_OPTIONS = [
  { label: '官网咨询', value: 'OFFICIAL_WEBSITE' },
  { label: '来源待补充', value: 'UNKNOWN' },
  { label: '主动咨询 / 产品访问', value: 'INBOUND' },
  { label: '客户 / 朋友转介绍', value: 'REFERRAL' },
  { label: '内容 / 广告获客', value: 'CONTENT_OR_AD' },
  { label: '主动拓客', value: 'OUTBOUND' },
  { label: '活动 / 线下获取', value: 'EVENT_OR_OFFLINE' },
  { label: '渠道 / 合作伙伴', value: 'PARTNER' },
  { label: '其他来源', value: 'OTHER' }
];

export const FOLLOW_UP_METHOD_OPTIONS = [
  { label: '电话', value: 'PHONE' },
  { label: '微信 / IM', value: 'WECHAT' },
  { label: '线上会议', value: 'ONLINE_MEETING' },
  { label: '线下面谈', value: 'ON_SITE_MEETING' },
  { label: '演示 / 试用沟通', value: 'DEMO' },
  { label: '邮件', value: 'EMAIL' },
  { label: '其他', value: 'OTHER' }
];

export const TERMINAL_FOLLOW_UP_STATUSES = ['WON', 'LOST'];
export const TERMINAL_FOLLOW_UP_VALUES = ['NO_FOLLOW_UP', 'CONVERTED'];
