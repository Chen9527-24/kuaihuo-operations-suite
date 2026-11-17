export const FOUNDATION_QUALITY_RULES = [
  {
    key: 'reply-non-empty', name: '回复不能为空', category: 'PROGRAM', severity: 'BLOCKER', ruleType: 'NON_EMPTY', sort: 10,
    description: '任何进入质检的候选回复都必须包含有效文本。', config: {},
  },
  {
    key: 'single-question-budget', name: '必要问题预算', category: 'STYLE', severity: 'ERROR', ruleType: 'QUESTION_BUDGET', sort: 30,
    description: '一轮原则上最多提出一个必要问题。', config: { maxQuestions: 1 },
  },
  {
    key: 'mechanical-empathy-guard', name: '机械共情禁用', category: 'STYLE', severity: 'ERROR', ruleType: 'PROHIBITED_PHRASES', sort: 40,
    description: '禁止使用模板化、夸张或低质量的假人感表达。',
    config: { phrases: ['亲亲', '换谁都会烦', '够闹心的', '我不绕了', '真的太让人生气了'] },
  },
  {
    key: 'ai-service-cliche-warning', name: '模板化客服承接提醒', category: 'STYLE', severity: 'WARNING', ruleType: 'PROHIBITED_PHRASES', sort: 45,
    description: '识别常见 AI 客服套话，提示通过角色模块和回复调优进一步校准。',
    config: { phrases: ['为了给您更准确的建议', '我马上帮您核实', '我需要先查一下', '您方便发个'] },
  },
  {
    key: 'internal-term-guard', name: '内部术语不可外显', category: 'POLICY', severity: 'BLOCKER', ruleType: 'PROHIBITED_PHRASES', sort: 50,
    description: '禁止向客户输出运行模式、规则命中和经营策略等内部专有词。',
    config: { phrases: ['RuntimeReplyContract', '系统提示词', '命中规则', '销售显露度', '内部策略', '模型判断'] },
  },
  {
    key: 'action-claim-evidence', name: '动作结果必须有证据', category: 'FACT', severity: 'BLOCKER', ruleType: 'ACTION_CLAIM_GUARD', sort: 60,
    description: '没有动作执行结果时，不得声称已经催件、退款、补偿、备注或提交成功。',
    config: { phrases: ['已经为您催件', '已为您催件', '已经提交退款', '退款已经提交', '已经备注', '补偿已经发放', '已经处理好了'] },
  },
  {
    key: 'unsupported-time-promise', name: '无依据时间承诺禁用', category: 'FACT', severity: 'BLOCKER', ruleType: 'PROHIBITED_PATTERNS', sort: 70,
    description: '没有真实业务节点和承诺任务时，不承诺到账、发货或物流更新时间。',
    config: { patterns: ['今晚一定', '明天一定', '24小时内一定', '保证.*到账', '保证.*更新', '肯定.*送到'] },
  },
  {
    key: 'unsolicited-refund-guard', name: '不得主动引入退款', category: 'POLICY', severity: 'ERROR', ruleType: 'UNSOLICITED_REFUND_GUARD', sort: 80,
    description: '客户未表达退款、退货或取消意向时，不主动把退款作为首要方案。', config: {},
  },
  {
    key: 'sales-after-service-guard', name: '服务未解决时禁止销售', category: 'POLICY', severity: 'BLOCKER', ruleType: 'SALES_VISIBILITY_GUARD', sort: 90,
    description: '投诉、退款、售后、物流异常和高风险场景中禁止追加推荐。',
    config: { salesPhrases: ['推荐您', '可以再看看', '顺便带一件', '加购', '升级款', '搭配购买'] },
  },
  {
    key: 'sensitive-credential-guard', name: '敏感凭证索取禁用', category: 'SAFETY', severity: 'BLOCKER', ruleType: 'PROHIBITED_PATTERNS', sort: 100,
    description: '客服不得索取验证码、密码、Cookie、Token 或登录令牌。',
    config: { patterns: ['请发送.*验证码', '请提供.*密码', '把.*Cookie.*发给我', '把.*Token.*发给我', '请提供.*登录令牌'] },
  },
  {
    key: 'fake-personal-experience-guard', name: '虚构真人经历禁用', category: 'SAFETY', severity: 'ERROR', ruleType: 'PROHIBITED_PHRASES', sort: 110,
    description: '角色可以稳定有人格，但不得虚构自己的购买、使用或生活经历。',
    config: { phrases: ['我自己也买过', '我之前也用过', '我家里也有一台', '我本人使用下来'] },
  },
  {
    key: 'high-risk-human-review', name: '高风险后台处理', category: 'SAFETY', severity: 'BLOCKER', ruleType: 'HIGH_RISK_HANDOFF', sort: 120,
    description: '高风险或严重投诉必须进入后台处理队列；客户可见回复不得暴露人工路由。', config: {},
  },
] as const;
