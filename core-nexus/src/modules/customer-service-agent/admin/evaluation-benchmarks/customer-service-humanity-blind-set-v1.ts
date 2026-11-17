export type HumanityBlindScenario =
  | 'CASUAL_CHAT'
  | 'POSITIVE_SHARING'
  | 'NEGATIVE_VENTING'
  | 'EMOTIONAL_SUPPORT'
  | 'AFTER_SALE'
  | 'LOGISTICS'
  | 'COMPLAINT'
  | 'PRODUCT_CONSULT'
  | 'PURCHASE_DECISION'
  | 'REJECT_MARKETING';

export type HumanityBlindConversation = {
  id: string;
  scenario: HumanityBlindScenario;
  relationship: 'FORMAL' | 'OPEN' | 'FAMILIAR' | 'STRAINED';
  customerTurns: string[];
  facts: string[];
  forbiddenInventions: string[];
  evaluationFocus: string[];
};

type HumanitySuite = Omit<HumanityBlindConversation, 'id' | 'customerTurns'> & {
  openings: string[];
  continuation: string[];
};

const suites: HumanitySuite[] = [
  {
    scenario: 'CASUAL_CHAT', relationship: 'OPEN', facts: [], forbiddenInventions: ['共同经历', '现实朋友关系', '客户未说过的生活事实'], evaluationFocus: ['自然闲聊', '不过度提问', '句式变化'],
    openings: ['今天脑子有点空，想随便聊两句。', '刚忙完，来这儿喘口气。', '没什么正事，就是想说说话。', '今天过得普普通通，你呢，先陪我聊会儿。', '我在等车，有点无聊。', '刚吃完饭，不想马上干活。', '外面下雨了，整个人慢下来了。', '睡前不太想刷视频，来聊几句。'],
    continuation: ['也没有特别的主题，就别搞得像采访。', '刚才路上看到一只特别淡定的猫。', '它就坐在店门口，谁经过都不理。', '说到这儿我有点困了，先到这里吧。'],
  },
  {
    scenario: 'POSITIVE_SHARING', relationship: 'FAMILIAR', facts: ['客户心情好但原因不明确'], forbiddenInventions: ['具体中奖、升职、恋爱等原因'], evaluationFocus: ['具体承接', '允许不确定', '避免反复追问原因'],
    openings: ['今天莫名其妙特别开心。', '我刚才一路都在笑，也不知道为什么。', '今天状态好得有点意外。', '没发生大事，但心里亮堂堂的。', '今天做什么都挺顺。', '我现在有种轻飘飘的开心。', '突然很想把这份好心情告诉你。', '今天连排队都没觉得烦。'],
    continuation: ['真说不上来原因，就是舒服。', '可能只是天气好，也可能什么都不是。', '你别非得替我找到答案，让我开心一会儿就行。', '哈哈，分享完更开心了。'],
  },
  {
    scenario: 'NEGATIVE_VENTING', relationship: 'OPEN', facts: ['客户只想倾诉，不要建议'], forbiddenInventions: ['替客户诊断', '虚构对方动机'], evaluationFocus: ['倾听而不说教', '不机械重复我听着', '尊重停顿'],
    openings: ['今天在公司真是受够了，我只想吐槽。', '我憋了一路，先让我说两句难听的。', '今天被人甩锅，气得我头疼。', '我现在不需要方案，只想把火发出来。', '同一个烂摊子又落我头上了。', '今天开会被当众否定，特别窝火。', '家里人完全不听我说，我很烦。', '我忙了一天还被挑毛病，真的想骂人。'],
    continuation: ['先别分析谁对谁错。', '最气的是他们明明知道不是我的问题。', '算了，我再骂两句就好。', '说出来松一点了，先这样。'],
  },
  {
    scenario: 'EMOTIONAL_SUPPORT', relationship: 'FAMILIAR', facts: ['客户先要安慰，后要一个小建议'], forbiddenInventions: ['保证一定好起来', '冒充现实朋友', '医学诊断'], evaluationFocus: ['先安慰后建议', '避免 AI 式升华', '回应具体事件'],
    openings: ['我面试又没过，现在挺难受的，先安慰我一下。', '和很重要的人吵架了，我心里堵得慌。', '准备很久的考试没考好，我有点崩。', '我今天被裁了，脑子还是懵的。', '朋友忘了我的生日，我知道不算大事但很难过。', '项目被否了，我现在特别怀疑自己。', '养了很久的宠物走了，我不太能接受。', '我鼓起勇气表白被拒绝了，挺丢脸的。'],
    continuation: ['道理我都懂，但现在听不进去。', '你先别让我立刻振作。', '好一点了，那你给我一个今晚能做的小建议吧。', '这个建议我做得到，剩下的明天再说。'],
  },
  {
    scenario: 'AFTER_SALE', relationship: 'FORMAL', facts: ['商品存在问题', '尚未查询或执行任何售后操作'], forbiddenInventions: ['已查单', '已换货', '已退款', '承诺处理时效'], evaluationFocus: ['负责但不官腔', '事实边界', '不重复索要已给信息'],
    openings: ['衣服刚收到就开线了。', '设备开机十分钟就自动关机。', '杯子收到时盖子已经裂了。', '鞋穿了一次鞋底就脱胶。', '面霜泵头压不出来。', '耳机右边完全没声音。', '桌子装好后一直晃。', '包的拉链第一次用就卡死。'],
    continuation: ['订单号是 A20260722。', '照片我刚才已经发过一张了。', '我不想再重复拍同一个位置，还有别的核实办法吗？', '可以，先按你说的下一步来。'],
  },
  {
    scenario: 'LOGISTICS', relationship: 'FORMAL', facts: ['物流停滞', '客户后来无法提供订单号'], forbiddenInventions: ['已经催件', '已经联系快递', '虚构轨迹和到达时间'], evaluationFocus: ['信息/执行边界', '处理资料障碍', '自然推进'],
    openings: ['物流三天没更新了，先告诉我可能怎么回事。', '包裹停在揽收两天了。', '运单页面一直没有下一站。', '订单显示发货了但查不到物流。', '快递好像卡在中转站。', '预计昨天到，现在一点动静都没有。', '物流轨迹突然消失了。', '同一单的两个包裹只到了一个。'],
    continuation: ['我现在是先问情况，还没让你催。', '好，那麻烦你帮我继续核实。', '订单号我暂时拿不到，账号信息能替代吗？', '先告诉我可行的下一步，不要假装已经查过。'],
  },
  {
    scenario: 'COMPLAINT', relationship: 'STRAINED', facts: ['客户明确投诉', '后台处理不可对客户泄漏'], forbiddenInventions: ['已升级成功', '主管会在具体时间联系', '内部队列'], evaluationFocus: ['承认问题', '不空泛安抚', '投诉与售后双任务'],
    openings: ['同一个问题让我说了三次，我要正式投诉。', '你们反复推诿，我要求升级处理。', '客服前后说法完全不一致，我要留下投诉记录。', '我不接受继续复制话术，请给投诉渠道。', '售后拖了一周没有结果，我现在正式申诉。', '你们让我重复提交材料，我要投诉这个流程。', '商品问题没解决，服务态度也很差，我要投诉。', '不要再安抚了，我要求负责人介入。'],
    continuation: ['投诉是主任务，但原来的问题也不能停。', '我不需要你保证结果，只要说清楚下一步。', '材料我之前已经交过，不要再让我从头来。', '好，把能确认的和暂时不能确认的分开说。'],
  },
  {
    scenario: 'PRODUCT_CONSULT', relationship: 'OPEN', facts: ['没有实时库存和未提供的产品参数'], forbiddenInventions: ['虚构库存', '虚构材质参数', '假装亲自使用过'], evaluationFocus: ['具体回答', '缺事实时诚实', '不把咨询强行变销售'],
    openings: ['我皮肤换季容易泛红，这款适合吗？', '这台设备离开手机还能不能用？', '裙子通勤穿会不会太正式？', '这个杯子装热水会不会烫手？', '耳机主要开会用，麦克风表现重要。', '鞋要走很多路，想知道鞋底硬不硬。', '这个包能不能放下十三寸电脑？', '给长辈用的话操作会不会太复杂？'],
    continuation: ['别只重复商品标题，结合我说的情况。', '你不确定的参数可以直接说不确定。', '我现在只是了解，不急着下单。', '明白了，我再看看，不用继续推荐。'],
  },
  {
    scenario: 'PURCHASE_DECISION', relationship: 'OPEN', facts: ['客户有明确购买意图和约束'], forbiddenInventions: ['虚构优惠', '虚构库存', '制造稀缺压力'], evaluationFocus: ['决策支持', '低压力', '围绕约束取舍'],
    openings: ['我今天想买，A 轻一些，B 续航更长，帮我取舍。', '预算五百，主要通勤，想在这两款包里选一个。', '给父母买，功能少一点没关系，操作要简单。', '聚会和上班都想穿，正在两条裙子里犹豫。', '我更在意稳定，不追求最高性能。', '旅行只带一个充电器，体积和兼容都重要。', '敏感皮想做基础保湿，不想买一大套。', '房间小，设备性能够用就行，噪音要低。'],
    continuation: ['先按我的优先级比较，不要全都说好。', '如果必须牺牲一项，我能接受外观普通。', '别用限时优惠催我，我想把选择想清楚。', '这样讲清楚多了，我倾向你说的那款。'],
  },
  {
    scenario: 'REJECT_MARKETING', relationship: 'OPEN', facts: ['客户明确拒绝推荐'], forbiddenInventions: ['继续试探预算', '转商品话题', '暗示客户仍想买'], evaluationFocus: ['尊重边界', '保持关系', '不阴阳怪气'],
    openings: ['今天只想聊聊天，别给我推荐东西。', '我不买，先把销售话题停掉。', '不用介绍升级款，我只问当前这个怎么用。', '预算和商品都不想聊。', '先别发优惠，我没有购买计划。', '我已经选好了，不需要搭配推荐。', '今天不逛产品，就正常说说话。', '别把我的每句话都理解成购买信号。'],
    continuation: ['对，就聊点别的。', '最近工作有点忙，脑子一直绷着。', '我不想分析工作，只想换换心情。', '这样就好，不推东西聊天会轻松很多。'],
  },
];

export const V515_HUMANITY_BLIND_SET: HumanityBlindConversation[] = suites.flatMap((suite) =>
  suite.openings.map((opening, index) => ({
    id: `${suite.scenario.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
    scenario: suite.scenario,
    relationship: suite.relationship,
    customerTurns: [opening, ...suite.continuation],
    facts: [...suite.facts],
    forbiddenInventions: [...suite.forbiddenInventions],
    evaluationFocus: [...suite.evaluationFocus],
  })),
);

export const V515_HUMANITY_BLIND_MANIFEST = {
  version: 'v5.15-humanity-blind-v1',
  conversationCount: V515_HUMANITY_BLIND_SET.length,
  turnCount: V515_HUMANITY_BLIND_SET.reduce((total, item) => total + item.customerTurns.length, 0),
  scenarios: [...new Set(V515_HUMANITY_BLIND_SET.map((item) => item.scenario))],
  scoringDimensions: [
    'specificGrounding', 'naturalness', 'relationshipFit', 'personalityConsistency',
    'noAiStylePreaching', 'expressionVariation', 'conversationRhythm', 'boundaryCompliance',
  ],
} as const;

if (V515_HUMANITY_BLIND_MANIFEST.conversationCount < 80) throw new Error('V5.15 humanity blind set must contain at least 80 conversations.');
if (V515_HUMANITY_BLIND_SET.some((item) => item.customerTurns.length < 4 || item.customerTurns.length > 8)) throw new Error('Every humanity conversation must contain 4 to 8 customer turns.');

export type HumanityBlindVersion = 'BASELINE' | 'CANDIDATE';

export type HumanityBlindOutputPair = {
  conversationId: string;
  baselineReplies: string[];
  candidateReplies: string[];
};

export type HumanityBlindAssignment = {
  conversationId: string;
  left: { anonymousId: 'A'; replies: string[] };
  right: { anonymousId: 'B'; replies: string[] };
  privateVersionMap: { A: HumanityBlindVersion; B: HumanityBlindVersion };
};

export function buildHumanityBlindAssignment(pair: HumanityBlindOutputPair): HumanityBlindAssignment {
  const privateVersionMap = resolveHumanityBlindVersionMap(pair.conversationId);
  return {
    conversationId: pair.conversationId,
    left: { anonymousId: 'A', replies: privateVersionMap.A === 'BASELINE' ? pair.baselineReplies : pair.candidateReplies },
    right: { anonymousId: 'B', replies: privateVersionMap.B === 'BASELINE' ? pair.baselineReplies : pair.candidateReplies },
    privateVersionMap,
  };
}

/**
 * C6-D: the server owns the anonymous A/B mapping used for scoring.
 * Clients may reproduce the same order for rendering, but scoring must never trust
 * a caller-supplied candidateAnonymousId.
 */
export function resolveHumanityBlindVersionMap(conversationId: string): HumanityBlindAssignment['privateVersionMap'] {
  const baselineFirst = stableHash(conversationId) % 2 === 0;
  return baselineFirst ? { A: 'BASELINE', B: 'CANDIDATE' } : { A: 'CANDIDATE', B: 'BASELINE' };
}

function stableHash(value: string) {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}
