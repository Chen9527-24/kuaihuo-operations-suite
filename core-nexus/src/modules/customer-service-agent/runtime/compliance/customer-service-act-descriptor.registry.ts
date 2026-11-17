import type { CustomerServiceActType } from '../interaction/customer-service-interaction-plan.type';

export type CustomerServiceActAuthorization = 'EXPLICIT_ONLY' | 'INCIDENTAL_ALLOWED';
export type CustomerServiceActAuthorityScope = 'PLAN_ONLY' | 'GENERAL_GUIDANCE' | 'GROUNDED_BUSINESS';

export type CustomerServiceActDescriptor = {
  type: CustomerServiceActType;
  semanticDefinition: string;
  recognition: 'STRUCTURAL' | 'IDENTITY' | 'QUESTION' | 'BUSINESS' | 'GROUNDING' | 'ACK' | 'BOUNDARY' | 'GENERIC';
  hardVerifiable: boolean;
  /**
   * True only when a false negative/positive can cross a customer-visible hard
   * boundary (identity, grounded fact, required execution input, tool/permission).
   * Conversational shape and ordinary dialogue Acts must stay soft diagnostics.
   */
  hardBoundary?: true;
  authorization: CustomerServiceActAuthorization;
  /** What factual authority this Act grants to NLG. It never overrides Hard/Plan constraints. */
  authorityScope?: CustomerServiceActAuthorityScope;
  /** Explicit act may be a legitimate surface realization of another planned act. */
  allowedWhenActs?: CustomerServiceActType[];
};

const descriptors: CustomerServiceActDescriptor[] = [
  { type: 'PRESENCE_ACK', semanticDefinition: '自然回应客户问候或在场确认，不主动新增业务动作。', recognition: 'ACK', hardVerifiable: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'LIGHT_ACK', semanticDefinition: '轻量承接客户当前表达。', recognition: 'ACK', hardVerifiable: false, authorization: 'EXPLICIT_ONLY' },
  { type: 'EMOTIONAL_ACK', semanticDefinition: '回应客户明确表达的情绪或处境。', recognition: 'ACK', hardVerifiable: false, authorization: 'EXPLICIT_ONLY' },
  { type: 'REASSURE', semanticDefinition: '在不虚构事实的情况下提供安定感。', recognition: 'GENERIC', hardVerifiable: false, authorization: 'EXPLICIT_ONLY' },
  { type: 'LIGHT_HUMOR', semanticDefinition: '轻度玩笑或轻松互动。', recognition: 'GENERIC', hardVerifiable: false, authorization: 'INCIDENTAL_ALLOWED' },
  { type: 'HISTORY_REFERENCE', semanticDefinition: '自然引用仍有效的历史上下文。', recognition: 'GENERIC', hardVerifiable: false, authorization: 'INCIDENTAL_ALLOWED' },
  { type: 'RELATIONSHIP_MAINTENANCE', semanticDefinition: '维护关系但不制造现实关系。', recognition: 'GENERIC', hardVerifiable: false, authorization: 'EXPLICIT_ONLY', allowedWhenActs: ['NATURAL_CLOSE'] },
  { type: 'NATURAL_CLOSE', semanticDefinition: '自然结束当前轮次。', recognition: 'STRUCTURAL', hardVerifiable: false, authorization: 'INCIDENTAL_ALLOWED' },
  { type: 'STOP', semanticDefinition: '完成计划后停止，不继续创建新行为。', recognition: 'STRUCTURAL', hardVerifiable: false, authorization: 'INCIDENTAL_ALLOWED' },
  { type: 'CONFIRM_ROLE', semanticDefinition: '直接确认当前已绑定且允许公开的业务关系或服务角色。', recognition: 'IDENTITY', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY', allowedWhenActs: ['DISCLOSE_AI_IDENTITY', 'DISCLOSE_PUBLIC_IDENTITY'] },
  { type: 'DISCLOSE_PUBLIC_IDENTITY', semanticDefinition: '根据已绑定事实说明公开业务身份。', recognition: 'IDENTITY', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY', allowedWhenActs: ['CONFIRM_ROLE', 'DISCLOSE_AI_IDENTITY'] },
  { type: 'DISCLOSE_AI_IDENTITY', semanticDefinition: '如实说明智能客服/AI 身份。', recognition: 'IDENTITY', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'DISCLOSE_NAME', semanticDefinition: '仅在有可靠公开称呼且计划明确授权时给出称呼。', recognition: 'IDENTITY', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'EXPLAIN_SERVICE_SCOPE', semanticDefinition: '说明当前已配置的服务范围。', recognition: 'BUSINESS', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'OPEN_SERVICE_INVITATION', semanticDefinition: '在没有具体业务动作时开放当前 Role 可承接的服务/协助入口，让客户继续提出需要了解、选择或处理的事项；它不是邀请客户泛聊或闲聊。', recognition: 'BUSINESS', hardVerifiable: true, authorization: 'EXPLICIT_ONLY', allowedWhenActs: ['EXPLAIN_SERVICE_SCOPE'] },
  { type: 'DIRECT_ANSWER', semanticDefinition: '直接回答客户当前明确问题。', recognition: 'STRUCTURAL', hardVerifiable: false, authorization: 'INCIDENTAL_ALLOWED' },
  { type: 'REQUEST_REQUIRED_SLOT', semanticDefinition: '索取完成当前业务所必须的信息。', recognition: 'QUESTION', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'REQUEST_OPTIONAL_PREFERENCE', semanticDefinition: '询问可选偏好，用于缩小方向但不是业务必需。', recognition: 'QUESTION', hardVerifiable: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'CLARIFY_AMBIGUITY', semanticDefinition: '仅在当前语义存在真实指代、状态或选项歧义时提出澄清；不得把服务邀请、偏好询问或一般追问归入该 Act。', recognition: 'QUESTION', hardVerifiable: false, authorization: 'EXPLICIT_ONLY' },
  { type: 'RESTATEMENT', semanticDefinition: '复述客户需求或事实。', recognition: 'GENERIC', hardVerifiable: false, authorization: 'INCIDENTAL_ALLOWED' },
  { type: 'ACKNOWLEDGE_PREFERENCE', semanticDefinition: '承接客户明确偏好。', recognition: 'ACK', hardVerifiable: false, authorization: 'EXPLICIT_ONLY' },
  { type: 'PROVIDE_GENERAL_GUIDANCE', semanticDefinition: '基于客户当前需求提供不声称商家具体商品、库存、价格、活动、政策或执行结果的一般性专业方向。', recognition: 'GENERIC', hardVerifiable: true, authorization: 'EXPLICIT_ONLY', authorityScope: 'GENERAL_GUIDANCE' },
  { type: 'RECOMMEND_GROUNDED_ITEM', semanticDefinition: '只基于已命中业务知识推荐具体商品/方案。', recognition: 'GROUNDING', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY', authorityScope: 'GROUNDED_BUSINESS' },
  { type: 'EXPLAIN_GROUNDED_FACT', semanticDefinition: '只基于已验证事实说明商品/业务事实。', recognition: 'GROUNDING', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY', authorityScope: 'GROUNDED_BUSINESS' },
  { type: 'BUSINESS_ADVANCE', semanticDefinition: '推进到新的业务阶段。', recognition: 'BUSINESS', hardVerifiable: true, authorization: 'EXPLICIT_ONLY', allowedWhenActs: ['REQUEST_REQUIRED_SLOT', 'REQUEST_OPTIONAL_PREFERENCE', 'RECOMMEND_GROUNDED_ITEM', 'EXECUTE_SERVICE_STEP', 'REPORT_STATUS'] },
  { type: 'SALES_CTA', semanticDefinition: '明确引导购买、下单、查看商品或成交。', recognition: 'BUSINESS', hardVerifiable: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'ACKNOWLEDGE_PROBLEM', semanticDefinition: '承接客户明确问题或投诉。', recognition: 'ACK', hardVerifiable: false, authorization: 'EXPLICIT_ONLY' },
  { type: 'REPORT_STATUS', semanticDefinition: '报告可验证的订单/物流/执行状态。', recognition: 'GROUNDING', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'EXECUTE_SERVICE_STEP', semanticDefinition: '说明或执行已允许的服务步骤。', recognition: 'BUSINESS', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'REQUEST_HANDOFF', semanticDefinition: '请求或说明需要人工/专门处理。', recognition: 'BUSINESS', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
  { type: 'EXPLAIN_BOUNDARY', semanticDefinition: '解释事实、能力或权限边界。', recognition: 'BOUNDARY', hardVerifiable: true, hardBoundary: true, authorization: 'EXPLICIT_ONLY' },
];

const descriptorMap = new Map(descriptors.map((item) => [item.type, item]));

export function getCustomerServiceActDescriptor(type: CustomerServiceActType): CustomerServiceActDescriptor {
  const descriptor = descriptorMap.get(type);
  if (!descriptor) throw new Error(`CustomerService Act descriptor missing: ${type}`);
  return descriptor;
}

export function listCustomerServiceActDescriptors() {
  return descriptors.map((item) => ({ ...item, allowedWhenActs: item.allowedWhenActs ? [...item.allowedWhenActs] : undefined }));
}

export function isCustomerServiceHardBoundaryAct(type: CustomerServiceActType) {
  return getCustomerServiceActDescriptor(type).hardBoundary === true;
}
