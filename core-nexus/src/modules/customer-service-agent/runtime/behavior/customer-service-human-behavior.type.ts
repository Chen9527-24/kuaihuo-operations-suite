export type CustomerServiceHumanBehaviorInteractionMode =
  | 'ACKNOWLEDGE'
  | 'ANSWER'
  | 'GUIDE'
  | 'CLARIFY'
  | 'LISTEN'
  | 'REASSURE'
  | 'REPAIR'
  | 'CLOSE';

export type CustomerServiceHumanBehaviorResponseDensity =
  | 'MINIMAL'
  | 'LIGHT'
  | 'NORMAL'
  | 'DETAILED';

export type CustomerServiceHumanBehaviorAct =
  | 'LIGHT_ACK'
  | 'SPECIFIC_ACK'
  | 'SELF_INTRODUCTION'
  | 'IDENTITY_RESPONSE'
  | 'NAME_RESPONSE'
  | 'SERVICE_SCOPE_EXPOSITION'
  | 'NEED_RESTATEMENT'
  | 'DIRECT_ANSWER'
  | 'LIGHT_SUGGESTION'
  | 'DETAILED_EXPLANATION'
  | 'CLARIFYING_QUESTION'
  | 'OPTIONAL_QUESTION'
  | 'REQUIRED_QUESTION'
  | 'BUSINESS_BRIDGE'
  | 'PRODUCT_SUGGESTION'
  | 'SALES_CTA'
  | 'HISTORY_REFERENCE'
  | 'EMOTIONAL_ACK'
  | 'REASSURANCE'
  | 'NATURAL_STOP'
  | 'NATURAL_CLOSE';

export type CustomerServiceHumanBehaviorDecisionReason = {
  ruleId: string;
  priority: number;
  reason: string;
};

/**
 * C6-A: Policy -> NLG 之间的结构化表达合同。
 * 它不保存业务事实，不取代 Planner / Conversation State，只描述“这一轮怎么互动”。
 */
export type CustomerServiceExpressionPlan = {
  version: 1;
  interactionMode: CustomerServiceHumanBehaviorInteractionMode;
  responseDensity: CustomerServiceHumanBehaviorResponseDensity;
  sentenceTarget: { min: number; max: number };
  segmentTarget: { min: number; max: number };
  maxCharacters: number;
  acknowledgement: 'NONE' | 'LIGHT' | 'SPECIFIC';
  selfIntroduction: 'FORBIDDEN' | 'ONLY_IF_NEEDED' | 'REQUIRED';
  identityResponse: 'NONE' | 'ROLE_NATURAL' | 'NAME_NATURAL' | 'ROLE_CONFIRMATION' | 'SERVICE_SCOPE_NATURAL' | 'AI_IDENTITY_TRUTHFUL';
  openingStyle: 'NONE' | 'ROLE_AMBIENT' | 'DIRECT_RECEPTION';
  serviceScopeExposure: 'NONE' | 'IMPLICIT' | 'LIGHT' | 'EXPLICIT';
  needRestatement: 'AVOID' | 'LIGHT' | 'ALLOW';
  questionPolicy: 'NONE' | 'OPTIONAL_ONE' | 'REQUIRED_ONE';
  questionStyle: 'DIRECT' | 'CASUAL' | 'CHOICE' | 'OPEN';
  businessAdvance: 'NONE' | 'SOFT' | 'NORMAL';
  historyReference: 'NONE' | 'SOFT' | 'DIRECT';
  colloquiality: 'LOW' | 'MEDIUM' | 'HIGH';
  completionStyle: 'STOP' | 'OPEN_STATEMENT' | 'QUESTION' | 'NATURAL_CLOSE';
  emojiPolicy: 'NONE' | 'LIGHT' | 'NATURAL';
  requiredActs: CustomerServiceHumanBehaviorAct[];
  optionalActs: CustomerServiceHumanBehaviorAct[];
  forbiddenActs: CustomerServiceHumanBehaviorAct[];
  avoidStructureKeys: string[];
  matchedRuleIds: string[];
  suppressedRuleIds: string[];
  decisionReasons: CustomerServiceHumanBehaviorDecisionReason[];
  context: {
    pureGreeting: boolean;
    openingTurn: boolean;
    returningGreeting: boolean;
    recentAssistantQuestionTurns: number;
    consecutiveQuestionEndingTurns: number;
    recentOptionalQuestionCount: number;
    recentCtaCount: number;
    recentSelfIntroCount: number;
    recentServiceScopeCount: number;
    recentRestatementCount: number;
    recentStructureKeys: string[];
    recentRequestedDeltas: string[];
    customerJustAnsweredPreviousQuestion: boolean;
    shortLowInformationTurn: boolean;
    requiredBusinessQuestion: boolean;
  };
};
