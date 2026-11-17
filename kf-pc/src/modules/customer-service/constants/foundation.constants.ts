export const customerServiceAssetTypeOptions = [
  { label: '角色模块', value: 'ROLE_MODULE' },
  { label: '策略配置组', value: 'STRATEGY_GROUP' },
  { label: '回复策略', value: 'RESPONSE_POLICY' },
  { label: '质量规则', value: 'QUALITY_RULE' },
  { label: '业务流程', value: 'WORKFLOW' },
  { label: '案例参考', value: 'CASE_REFERENCE' },
  { label: '固定全文', value: 'EXACT_REPLY' },
  { label: '固定模板', value: 'TEMPLATE_REPLY' },
  { label: '必含要点', value: 'REQUIRED_POINTS' },
  { label: '必走流程', value: 'REQUIRED_WORKFLOW' }
] as const;

export const customerServiceAssetStatusOptions = [
  { label: '草稿', value: 'DRAFT' },
  { label: '已发布', value: 'PUBLISHED' },
  { label: '已归档', value: 'ARCHIVED' }
] as const;

export const customerServiceRoleStatusOptions = [
  { label: '草稿', value: 'DRAFT' },
  { label: '启用', value: 'ENABLED' },
  { label: '已归档', value: 'ARCHIVED' }
] as const;

export const customerServiceIndustryStatusOptions = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
  { label: '已归档', value: 'ARCHIVED' }
] as const;

export const customerServiceIndustryTypeOptions = [
  { label: '行业', value: 'INDUSTRY' },
  { label: '品类', value: 'CATEGORY' },
  { label: '子品类', value: 'SUBCATEGORY' }
] as const;

export const customerServiceRoleModuleMergeModeOptions = [
  { label: '覆盖', value: 'OVERRIDE' },
  { label: '追加', value: 'APPEND' },
  { label: '取更严格值', value: 'STRICTER' }
] as const;

export const customerServiceRoleModuleStatusOptions = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
  { label: '已归档', value: 'ARCHIVED' }
] as const;

export const customerServiceRiskLevelOptions = [
  { label: '低风险', value: 'LOW' },
  { label: '中风险', value: 'MEDIUM' },
  { label: '高风险', value: 'HIGH' },
  { label: '严重风险', value: 'CRITICAL' }
] as const;

export const customerServiceResponseRuleStatusOptions = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
  { label: '已归档', value: 'ARCHIVED' }
] as const;

export const customerServiceDeterministicAssetTypes = ['EXACT_REPLY', 'TEMPLATE_REPLY', 'REQUIRED_POINTS', 'REQUIRED_WORKFLOW'] as const;

export const customerServiceScenarioOptions = [
  { label: '商品咨询', value: 'PRODUCT_CONSULT' },
  { label: '商品比较', value: 'PRODUCT_COMPARE' },
  { label: '订单状态', value: 'ORDER_STATUS' },
  { label: '物流停滞', value: 'LOGISTICS_DELAY' },
  { label: '基础售后', value: 'AFTER_SALE' },
  { label: '明确退款', value: 'REFUND_REQUEST' },
  { label: '投诉升级', value: 'COMPLAINT_ESCALATION' },
  { label: '账户安全', value: 'SECURITY_SENSITIVE' }
] as const;

export const customerServiceIntentOptions = [
  { label: '询问信息', value: 'ASK_INFORMATION' },
  { label: '请求执行', value: 'REQUEST_ACTION' },
  { label: '表达不满', value: 'EXPRESS_DISSATISFACTION' },
  { label: '拒绝方案', value: 'REJECT_SOLUTION' },
  { label: '确认结果', value: 'CONFIRM_RESULT' },
  { label: '购买兴趣', value: 'PURCHASE_INTEREST' },
  { label: '结束沟通', value: 'END_CONVERSATION' }
] as const;
