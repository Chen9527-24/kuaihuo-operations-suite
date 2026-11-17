import type { CustomerServiceGuidelineVersionDraftContent } from '../../../runtime/guideline/customer-service-guideline.type';

export type CustomerServiceSystemGuidelineTemplate = {
  code: string;
  name: string;
  description: string;
  content: CustomerServiceGuidelineVersionDraftContent;
};

export const FOUNDATION_HVE_GUIDELINES: CustomerServiceSystemGuidelineTemplate[] = [
  guideline('hve.social-greeting.presence-only', '普通问候基础护栏', '普通问候先自然回应客户；是否继续开放服务入口由当前 Active Role 的 typed Interaction Posture 与 Opening Reception 共同决定。',
    { fact: 'interaction.type', op: 'EQ', value: 'SOCIAL_GREETING' }, [
      { op: 'REQUIRE_ACT', act: 'PRESENCE_ACK', necessity: 'REQUIRED', enforcement: 'HARD', priority: 900, trackingKey: 'social.greeting.ack' },
      { op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 900 },
      { op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 900 },
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 900 },
    ], 'IMPORTANT', 900, ['interaction:social', 'system:hve']),
  guideline('hve.social-greeting.compatibility-stop', '普通问候兼容性停止', '未配置 typed Role Interaction Posture、角色明确只回应问候、或 Opening Reception 不允许服务入口时，保持旧行为：回应后停止。',
    { all: [
      { fact: 'interaction.type', op: 'EQ', value: 'SOCIAL_GREETING' },
      { any: [
        { fact: 'role.posture.source', op: 'IN', value: ['NONE', 'LEGACY_UNTYPED'] },
        { fact: 'role.posture.openingParticipation', op: 'EQ', value: 'ACK_ONLY' },
        { fact: 'opening.active', op: 'EQ', value: false },
        { fact: 'opening.greetingMode', op: 'IN', value: ['ACK_ONLY', 'CUSTOM'] },
      ] },
    ] }, [
      { op: 'SUPPRESS_ACT', act: 'OPEN_SERVICE_INVITATION', enforcement: 'HARD', priority: 890 },
      { op: 'SET_COMPLETION', mode: 'STOP_AFTER_REQUIRED', enforcement: 'HARD', allowOptionalContinuation: false },
    ], 'IMPORTANT', 890, ['interaction:social', 'compatibility:hve', 'system:hve']),
  guideline('hve.social-greeting.role-service-entry', 'Role 驱动的情境式服务入口', '显式 Role 选择 CONTEXTUAL_ENTRY 时，在 Opening Reception 允许的情况下把低压力服务入口作为偏好加入同一 Canonical Plan；它仍可被更高优先边界抑制。',
    { all: [
      { fact: 'interaction.type', op: 'EQ', value: 'SOCIAL_GREETING' },
      { fact: 'role.posture.source', op: 'EQ', value: 'TYPED_V1' },
      { fact: 'role.posture.openingParticipation', op: 'EQ', value: 'CONTEXTUAL_ENTRY' },
      { fact: 'opening.active', op: 'EQ', value: true },
      { fact: 'opening.greetingMode', op: 'NOT_IN', value: ['ACK_ONLY', 'CUSTOM'] },
    ] }, [
      { op: 'REQUIRE_ACT', act: 'OPEN_SERVICE_INVITATION', necessity: 'PREFERRED', enforcement: 'SOFT', priority: 700, trackingKey: 'role.posture.opening.service-entry' },
      { op: 'SET_COMPLETION', mode: 'ALLOW_CONTINUATION', enforcement: 'SOFT', allowOptionalContinuation: true, conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }] },
    ], 'STANDARD', 700, ['interaction:social', 'role:posture', 'system:hve']),
  guideline('hve.social-greeting.role-active-service-entry', 'Role 驱动的主动服务入口', '显式 Role 选择 ACTIVE_ENTRY 时，在没有更高优先边界的前提下，本轮 Canonical Plan 必须实际包含低压力服务入口；REQUIRED 只在最终 Plan 内约束实现，不越过 Hard/Safety/Boundary。',
    { all: [
      { fact: 'interaction.type', op: 'EQ', value: 'SOCIAL_GREETING' },
      { fact: 'role.posture.source', op: 'EQ', value: 'TYPED_V1' },
      { fact: 'role.posture.openingParticipation', op: 'EQ', value: 'ACTIVE_ENTRY' },
      { fact: 'opening.active', op: 'EQ', value: true },
      { fact: 'opening.greetingMode', op: 'NOT_IN', value: ['ACK_ONLY', 'CUSTOM'] },
    ] }, [
      { op: 'REQUIRE_ACT', act: 'OPEN_SERVICE_INVITATION', necessity: 'REQUIRED', enforcement: 'SOFT', priority: 740, trackingKey: 'role.posture.opening.service-entry' },
      { op: 'SET_COMPLETION', mode: 'ALLOW_CONTINUATION', enforcement: 'SOFT', allowOptionalContinuation: true, conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }] },
    ], 'IMPORTANT', 740, ['interaction:social', 'role:posture', 'system:hve']),
  guideline('hve.identity.role-confirmation-stop', '角色确认基础护栏', '客户确认当前业务关系时先直接确认角色；是否在确认后轻量开放服务入口由 typed Role Interaction Posture 决定，不展开角色卡或服务清单。',
    { fact: 'interaction.type', op: 'EQ', value: 'ROLE_CONFIRMATION' }, [
      { op: 'REQUIRE_ACT', act: 'CONFIRM_ROLE', necessity: 'REQUIRED', enforcement: 'HARD', priority: 950, trackingKey: 'identity.role.confirmed' },
      { op: 'SUPPRESS_ACT', act: 'EXPLAIN_SERVICE_SCOPE', enforcement: 'HARD', priority: 950 },
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 950 },
      { op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 950 },
      { op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 950 },
    ], 'IMPORTANT', 950, ['interaction:identity', 'system:hve']),
  guideline('hve.identity.role-confirmation-compatibility-stop', '角色确认兼容性停止', '未配置 typed Interaction Posture 或 Role 明确选择只回答身份时，保持确认后停止。',
    { all: [
      { fact: 'interaction.type', op: 'EQ', value: 'ROLE_CONFIRMATION' },
      { any: [
        { fact: 'role.posture.source', op: 'IN', value: ['NONE', 'LEGACY_UNTYPED'] },
        { fact: 'role.posture.followUpOffering', op: 'EQ', value: 'ANSWER_ONLY' },
      ] },
    ] }, [
      { op: 'SET_COMPLETION', mode: 'STOP_AFTER_REQUIRED', enforcement: 'HARD', allowOptionalContinuation: false },
    ], 'IMPORTANT', 940, ['interaction:identity', 'compatibility:hve', 'system:hve']),
  guideline('hve.identity.role-confirmation-follow-up', 'Role 驱动的身份确认后情境承接', '显式 Role 选择 CONTEXTUAL_OFFER 时，在确认业务关系后偏好加入一个低压力服务入口；仍不展开服务清单、不创建销售推进。',
    { all: [
      { fact: 'interaction.type', op: 'EQ', value: 'ROLE_CONFIRMATION' },
      { fact: 'role.posture.source', op: 'EQ', value: 'TYPED_V1' },
      { fact: 'role.posture.followUpOffering', op: 'EQ', value: 'CONTEXTUAL_OFFER' },
    ] }, [
      { op: 'REQUIRE_ACT', act: 'OPEN_SERVICE_INVITATION', necessity: 'PREFERRED', enforcement: 'SOFT', priority: 720, trackingKey: 'role.posture.identity.follow-up', dependsOnTrackingKeys: ['identity.role.confirmed'] },
      { op: 'SET_COMPLETION', mode: 'ALLOW_CONTINUATION', enforcement: 'SOFT', allowOptionalContinuation: true, conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }] },
    ], 'STANDARD', 720, ['interaction:identity', 'role:posture', 'system:hve']),
  guideline('hve.identity.role-confirmation-active-follow-up', 'Role 驱动的身份确认后主动承接', '显式 Role 选择 ACTIVE_OFFER 时，在没有更高优先边界的前提下，确认关系后必须实际承接一个低压力服务入口；仍不能展开角色卡、服务清单或销售推进。',
    { all: [
      { fact: 'interaction.type', op: 'EQ', value: 'ROLE_CONFIRMATION' },
      { fact: 'role.posture.source', op: 'EQ', value: 'TYPED_V1' },
      { fact: 'role.posture.followUpOffering', op: 'EQ', value: 'ACTIVE_OFFER' },
    ] }, [
      { op: 'REQUIRE_ACT', act: 'OPEN_SERVICE_INVITATION', necessity: 'REQUIRED', enforcement: 'SOFT', priority: 760, trackingKey: 'role.posture.identity.follow-up', dependsOnTrackingKeys: ['identity.role.confirmed'] },
      { op: 'SET_COMPLETION', mode: 'ALLOW_CONTINUATION', enforcement: 'SOFT', allowOptionalContinuation: true, conditions: [{ type: 'REQUIRED_ACTS_SATISFIED' }] },
    ], 'IMPORTANT', 760, ['interaction:identity', 'role:posture', 'system:hve']),
  guideline('hve.identity.ai-truthful-stop', 'AI 身份如实且不展开服务', '显式询问 AI/真人身份时如实回答，回答后不自动扩展服务范围。',
    { fact: 'interaction.type', op: 'EQ', value: 'AI_IDENTITY_QUERY' }, [
      { op: 'REQUIRE_ACT', act: 'DISCLOSE_AI_IDENTITY', necessity: 'REQUIRED', enforcement: 'HARD', priority: 1000, trackingKey: 'identity.ai.disclosed' },
      { op: 'SUPPRESS_ACT', act: 'EXPLAIN_SERVICE_SCOPE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 1000 },
      { op: 'SET_COMPLETION', mode: 'STOP_AFTER_REQUIRED', enforcement: 'HARD', allowOptionalContinuation: false },
    ], 'MANDATORY', 1000, ['interaction:identity', 'system:hve']),
  guideline('hve.boundary.no-questions', '客户要求不再追问', '客户明确要求别再问时，持续禁止可选追问；必要业务槽位仍由 Planner 保留。',
    { fact: 'behavior.requestedDeltas', op: 'CONTAINS', value: 'NO_QUESTIONS' }, [
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'OPEN_SERVICE_INVITATION', enforcement: 'HARD', priority: 1000 },
    ], 'IMPORTANT', 1000, ['behavior:boundary', 'system:hve']),
  guideline('hve.boundary.listen-only', '客户要求只听不推进', 'LISTEN_ONLY 时禁止可选追问、销售推进和 CTA。',
    { fact: 'behavior.requestedDeltas', op: 'CONTAINS', value: 'LISTEN_ONLY' }, [
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'OPEN_SERVICE_INVITATION', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'PROVIDE_GENERAL_GUIDANCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 1000 },
    ], 'IMPORTANT', 1000, ['behavior:boundary', 'system:hve']),
  guideline('hve.boundary.no-advice', '客户拒绝建议或营销', '客户明确拒绝建议时停止业务推进和 CTA。',
    { fact: 'behavior.requestedDeltas', op: 'CONTAINS', value: 'NO_ADVICE' }, [
      { op: 'SUPPRESS_ACT', act: 'PROVIDE_GENERAL_GUIDANCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'BUSINESS_ADVANCE', enforcement: 'HARD', priority: 1000 },
      { op: 'SUPPRESS_ACT', act: 'SALES_CTA', enforcement: 'HARD', priority: 1000 },
    ], 'IMPORTANT', 1000, ['behavior:boundary', 'system:hve']),
  guideline('hve.behavior.question-fatigue', '连续追问疲劳', '最近连续问句较多且没有必要业务问题时，软抑制新的可选问题。',
    { fact: 'behavior.consecutiveQuestionTurns', op: 'GTE', value: 2 }, [
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'SOFT', priority: 650 },
    ], 'STANDARD', 650, ['behavior:memory', 'system:hve']),
  guideline('hve.product.no-grounding-no-recommendation', '无商品知识时禁止伪装推荐', '商品探索未命中真实 Knowledge 时只负责守住 Grounding：禁止生成“店内商品推荐”。是否提供一般指导仍受客户边界与同一 Guideline Policy 的低层行为规则决定。',
    { fact: 'interaction.type', op: 'EQ', value: 'PRODUCT_DISCOVERY_NO_GROUNDING' }, [
      { op: 'SUPPRESS_ACT', act: 'RECOMMEND_GROUNDED_ITEM', enforcement: 'HARD', priority: 980 },
    ], 'MANDATORY', 980, ['grounding:knowledge', 'system:hve']),
  guideline('hve.product.no-grounding-general-guidance', '无商品知识时先提供一般性有用方向', '客户已经明确请求商品选择方向但没有真实商品 Knowledge 时，优先提供不冒充店内事实的一般性指导；该行为低于 NO_ADVICE / LISTEN_ONLY 等客户边界。',
    { fact: 'interaction.type', op: 'EQ', value: 'PRODUCT_DISCOVERY_NO_GROUNDING' }, [
      { op: 'REQUIRE_ACT', act: 'ACKNOWLEDGE_PREFERENCE', necessity: 'PREFERRED', enforcement: 'SOFT', priority: 720, trackingKey: 'product.preference.ack' },
      { op: 'REQUIRE_ACT', act: 'PROVIDE_GENERAL_GUIDANCE', necessity: 'PREFERRED', enforcement: 'SOFT', priority: 650, trackingKey: 'product.general-guidance', parameters: { target: '客户当前需求对应的一般性选择原则或方向', decisionPurpose: '在不声称商家具体商品事实的前提下，仅在当前 Role 与对话状态适合时提供能推进选择的有用方向', expectedInformationGain: 'ADD_GENERAL_GUIDANCE' } },
      { op: 'REQUIRE_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', necessity: 'OPTIONAL', enforcement: 'SOFT', priority: 520, trackingKey: 'product.preference.optional-question' },
    ], 'IMPORTANT', 700, ['interaction:product', 'role:service', 'system:hve']),
  guideline('hve.product.clarification-required-only', 'Role 商品探索克制追问', '显式 Role 的 clarificationInitiative=REQUIRED_ONLY 时，不为了探索偏好继续添加可选问题；必要业务槽位不受影响。',
    { all: [
      { fact: 'interaction.type', op: 'IN', value: ['PRODUCT_DISCOVERY', 'PRODUCT_DISCOVERY_NO_GROUNDING'] },
      { fact: 'role.posture.source', op: 'EQ', value: 'TYPED_V1' },
      { fact: 'role.posture.clarificationInitiative', op: 'EQ', value: 'REQUIRED_ONLY' },
    ] }, [
      { op: 'SUPPRESS_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', enforcement: 'HARD', priority: 780 },
    ], 'STANDARD', 780, ['interaction:product', 'role:posture', 'system:hve']),
  guideline('hve.product.clarification-role-preference', 'Role 商品探索决策型追问', '显式 Role 允许决策型/探索型澄清时，把已有的可选偏好问题提升为偏好行为；它仍受连续追问、NO_QUESTIONS 与 LISTEN_ONLY 等更高边界约束。',
    { all: [
      { fact: 'interaction.type', op: 'IN', value: ['PRODUCT_DISCOVERY', 'PRODUCT_DISCOVERY_NO_GROUNDING'] },
      { fact: 'role.posture.source', op: 'EQ', value: 'TYPED_V1' },
      { fact: 'role.posture.clarificationInitiative', op: 'IN', value: ['DECISION_RELEVANT', 'EXPLORATORY'] },
    ] }, [
      { op: 'REQUIRE_ACT', act: 'REQUEST_OPTIONAL_PREFERENCE', necessity: 'PREFERRED', enforcement: 'SOFT', priority: 560, trackingKey: 'product.preference.optional-question', parameters: { target: '真正会改变下一步选择的一个偏好缺口', decisionPurpose: '减少当前选择不确定性，不重复客户已经说明的偏好', expectedInformationGain: 'REDUCE_UNCERTAINTY' } },
    ], 'STANDARD', 560, ['interaction:product', 'role:posture', 'system:hve']),
];

function guideline(
  code: string,
  name: string,
  description: string,
  condition: CustomerServiceGuidelineVersionDraftContent['condition'],
  actions: CustomerServiceGuidelineVersionDraftContent['actions'],
  criticality: CustomerServiceGuidelineVersionDraftContent['criticality'],
  priority: number,
  tags: string[],
): CustomerServiceSystemGuidelineTemplate {
  return {
    code,
    name,
    description,
    content: {
      schemaVersion: 1,
      binding: { type: 'SYSTEM', key: '*' },
      condition,
      actions,
      priority,
      criticality,
      tags,
      relationships: {},
      evidenceRefs: ['SYSTEM:HVE-2'],
    },
  };
}
