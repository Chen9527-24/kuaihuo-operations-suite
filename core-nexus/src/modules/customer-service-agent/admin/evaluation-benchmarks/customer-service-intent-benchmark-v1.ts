export type BenchmarkRole = 'CUSTOMER' | 'ASSISTANT';

export type BenchmarkHistoryMessage = {
  role: BenchmarkRole;
  content: string;
};

export type BenchmarkIntent = {
  scenario: string;
  intent: string;
  role: 'SECONDARY' | 'LATENT';
};

export type CustomerServiceIntentBenchmarkCase = {
  id: string;
  suite: string;
  message: string;
  conversationHistory: BenchmarkHistoryMessage[];
  expectedScenario: string;
  expectedIntent: string;
  expectedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedTurnRelation: 'NEW_REQUEST' | 'ANSWER_TO_ASSISTANT_REQUEST' | 'INFORMATION_BARRIER' | 'CONTINUATION' | 'TOPIC_SHIFT' | 'RESOLUTION';
  expectedDominantGoal?: string;
  expectedSecondary: BenchmarkIntent[];
  coveredScenario: boolean;
  novelExpression: boolean;
  tags: string[];
};

type BenchmarkSuite = Omit<CustomerServiceIntentBenchmarkCase, 'id' | 'message' | 'novelExpression'> & {
  utterances: string[];
  novelFrom?: number;
};

const emptyHistory: BenchmarkHistoryMessage[] = [];

const suites: BenchmarkSuite[] = [
  {
    suite: 'product-information', expectedScenario: 'PRODUCT_CONSULT', expectedIntent: 'ASK_INFORMATION', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'ANSWER_INFORMATION', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'information'], novelFrom: 10,
    utterances: ['这件外套是什么面料的？', '这款充一次电大概能用多久？', '精华早晚都能用吗？', '这个杯子可以装开水吗？', '衣服洗完容易缩水吗？', '这双鞋鞋底是软的还是硬的？', '这台机器支持中文菜单吗？', '面霜开封后多久用完比较好？', '能介绍一下这个型号的主要功能吗？', '裙子的腰围有弹性吗？', '我皮肤一到换季就闹脾气，这瓶扛得住不', '这个东西离了手机还能自己干活吗', '夏天穿会不会像裹了层塑料', '它对电脑系统挑食不挑食', '想知道它到底是干啥用的，别给我讲广告词'],
  },
  {
    suite: 'product-comparison', expectedScenario: 'PRODUCT_COMPARE', expectedIntent: 'ASK_INFORMATION', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'ANSWER_INFORMATION', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'comparison'], novelFrom: 10,
    utterances: ['标准版和 Pro 版主要差在哪里？', '这两条裙子哪个更适合上班穿？', 'A 款和 B 款哪个续航更长？', '两种面霜分别适合什么肤质？', '黑色和米色哪个更不容易透？', '新款比上一代多了哪些功能？', '这两个套餐除了价格还有什么不同？', '轻薄版和性能版应该怎么选？', '同价位这两款哪个更耐用？', '两种尺寸实际使用差别大吗？', '一个看着能打一个看着省心，到底偏哪边', '别念参数表，告诉我日常用起来差在哪', '如果只带一个出门，你会留哪款，理由呢', '我看半天像双胞胎，它俩各自脾气是什么', '这俩谁是花钱买性能，谁是花钱买舒服'],
  },
  {
    suite: 'logistics-information', expectedScenario: 'LOGISTICS_DELAY', expectedIntent: 'ASK_INFORMATION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'ANSWER_INFORMATION', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'information', 'canonical-boundary'], novelFrom: 10,
    utterances: ['物流为什么两天没有更新？', '我想知道包裹现在是什么状态。', '快递页面一直停在揽收是什么意思？', '一般发出后多久能看到下一条物流？', '这个订单现在到哪一站了？', '物流显示异常通常是什么原因？', '为什么运单号查不到记录？', '页面写着运输中，具体代表什么？', '包裹是不是还没有真正发出？', '今天还能看到新的物流信息吗？', '它在揽收那里住下了吗，怎么没下文了', '这个包裹现在是迷路还是还没出门', '轨迹像按了暂停，想先弄明白怎么回事', '我不是催，单纯想知道它卡在哪个环节', '先解释一下这个状态，暂时不用替我操作'],
  },
  {
    suite: 'logistics-action', expectedScenario: 'LOGISTICS_DELAY', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'EXECUTE_REQUEST', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'action'], novelFrom: 10,
    utterances: ['物流三天没动了，麻烦帮我催一下。', '请帮我查一下这个包裹到哪里了。', '能不能联系快递核实一下？', '帮我处理一下运单查不到的问题。', '请尽快确认包裹是不是丢了。', '麻烦替我提交一下催件。', '请帮我看看为什么还没有发出。', '可以帮忙推进一下配送吗？', '帮我核实并告诉我后续怎么处理。', '麻烦查清楚现在卡在哪个环节。', '别只解释了，麻烦你这边动手跟一下', '这单帮我往前拱一拱，等太久了', '能找负责运输的人问个准信吗', '我需要你们介入，不是再教我看物流页', '劳烦把这件事真正推进一下，有结果告诉我'],
  },
  {
    suite: 'refund-information', expectedScenario: 'REFUND_REQUEST', expectedIntent: 'ASK_INFORMATION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'ANSWER_INFORMATION', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'information', 'canonical-boundary'], novelFrom: 10,
    utterances: ['我想了解一下退款需要什么条件。', '超过七天还可以申请退款吗？', '退款一般会退回到哪里？', '还没发货的话退款流程是什么？', '拆封后能不能退款？', '退款需要我承担运费吗？', '申请退款后通常多久原路返回？', '赠品已经用了会影响退款吗？', '只退其中一件应该怎么操作？', '退款和退货退款有什么区别？', '我先问规则，还没决定要不要退', '钱要怎么走回来，先给我讲明白', '这个状态下有没有退出交易的门', '先别替我申请，我只是打听一下退钱条件', '如果不合适，最晚什么时候还能反悔'],
  },
  {
    suite: 'refund-action', expectedScenario: 'REFUND_REQUEST', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'EXECUTE_REQUEST', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'action'], novelFrom: 10,
    utterances: ['这个订单我不要了，请帮我退款。', '不用再解释了，直接给我退掉。', '麻烦现在发起退款申请。', '货还没发，请取消订单并退款。', '我决定退货退款，请告诉我下一步。', '这件有问题，我要求退款处理。', '请把未使用的部分退回。', '我确认不再等了，帮我退钱。', '请按原支付方式办理退款。', '这个服务无法使用，我要终止并退款。', '我不是来问规则的，这单现在就退', '到这里吧，把钱给我原路退回来', '不折腾了，帮我结束这笔交易', '这单我撤了，按退款往下办', '结论就是不要了，请进入退款流程'],
  },
  {
    suite: 'dissatisfaction-without-complaint', expectedScenario: 'AFTER_SALE', expectedIntent: 'EXPRESS_DISSATISFACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'RESOLVE_CURRENT_PROBLEM', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'dissatisfaction', 'boundary'], novelFrom: 10,
    utterances: ['刚收到就开线，真的挺失望的。', '等了这么久结果还是不能用。', '你们这个处理速度让我很不满意。', '同一个问题我已经说过两遍了。', '收到的颜色和页面差很多，体验不好。', '客服前后说法不一样，我有点生气。', '机器第二天就坏了，太影响使用了。', '包装破成这样，看着就来气。', '承诺的东西没有做到，我很失望。', '这次购买体验确实不怎么样。', '花钱买了个添堵，先把问题说清楚吧', '我耐心快磨完了，但先看你们怎么解决', '东西没多贵，折腾人的劲儿倒不小', '这结果挺寒心的，我还没说要投诉', '我现在是不爽，不代表你可以直接替我升级投诉'],
  },
  {
    suite: 'explicit-complaint', expectedScenario: 'COMPLAINT_ESCALATION', expectedIntent: 'EXPRESS_DISSATISFACTION', expectedRiskLevel: 'HIGH', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'REPAIR_TRUST', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['single', 'complaint', 'high-risk'], novelFrom: 10,
    utterances: ['这个问题一直不处理，我要正式投诉。', '请把投诉渠道发给我。', '我要升级给你们负责人处理。', '请记录我的投诉并给出编号。', '再没有结果我会向平台投诉。', '我要对这次服务提出正式申诉。', '请转交主管，我不接受当前处理。', '我要投诉你们反复推诿。', '这件事需要升级，不要再让我重复说明。', '请告诉我如何提交书面投诉。', '这不是抱怨两句，我现在正式提出投诉', '请把这件事往更高一级报', '普通售后到此为止，我要求进入申诉流程', '我要留下正式记录，不接受口头安抚', '找能负责的人接手，这件事我要追责'],
  },
  {
    suite: 'emotional-venting', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'EMOTIONAL_DISCLOSURE', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'LISTEN_TO_VENTING', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['emotion', 'venting'], novelFrom: 10,
    utterances: ['今天在公司受了一肚子气，我就想吐槽。', '别给我分析，我现在只想骂两句。', '我憋了一整天，想找个地方说出来。', '今天真的太烦了，让我发泄一下。', '你先听我说完，暂时不用给建议。', '我就是想把这些破事倒出来。', '先别解决，我现在满肚子火。', '我想抱怨一会儿，你听着就行。', '今天被同事气到了，我需要吐槽。', '让我说一会儿，讲完可能就好了。', '我脑子里全是脏话，你先当个树洞', '这口气堵着难受，容我先倒倒垃圾', '不用端药方，给我留个麦克风就好', '现在不需要道理，只需要有人接住这顿牢骚', '我先把情绪卸下来，其他晚点再谈'],
  },
  {
    suite: 'emotional-comfort', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'EMOTIONAL_DISCLOSURE', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'PROVIDE_EMOTIONAL_COMFORT', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['emotion', 'comfort'], novelFrom: 10,
    utterances: ['我失恋了，你能安慰安慰我吗？', '今天心里很难受，陪我缓一会儿。', '我现在特别低落，想听点安慰的话。', '能不能哄哄我，我真的很委屈。', '这会儿别讲道理，先安慰我一下。', '我有点撑不住了，想被安慰一下。', '你可以陪我说几句让我好受点吗？', '今天被否定得很难受，给我一点安慰吧。', '我知道事情会过去，但现在需要有人安慰。', '先接住我的情绪，方案等会儿再说。', '我现在像漏了气，借我一点温度行吗', '不用修好我，先让我觉得不是一个人扛', '这一下挺疼的，能温柔地接我一句吗', '理性我都懂，眼下想先被抱住一下，语言上的', '我需要的是安慰，不是人生课堂'],
  },
  {
    suite: 'emotional-listening', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'EMOTIONAL_DISCLOSURE', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'INVITE_EMOTIONAL_SHARING', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['emotion', 'listening'], novelFrom: 10,
    utterances: ['我有些话想说，你愿意听吗？', '能听我慢慢讲一下今天发生的事吗？', '我不知道从哪说起，但想找人听听。', '你先听我讲，讲完再回应也行。', '我想说说最近的状态。', '有件事压在心里，我想讲出来。', '可以陪我聊聊这几天的感受吗？', '我想把事情从头说一遍。', '你有空听我说几分钟吗？', '我需要一个不会打断我的听众。', '借我一双耳朵，我想把这一团线捋出来', '先给我一点安静的空间让我往下讲', '故事有点长，你别急着下结论', '我想开口，但还没组织好，你先在就行', '能不能先当个认真听故事的人'],
  },
  {
    suite: 'emotional-advice', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'EMOTIONAL_DISCLOSURE', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'PROVIDE_REQUESTED_ADVICE', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['emotion', 'advice'], novelFrom: 10,
    utterances: ['失恋后一直缓不过来，你觉得我该怎么办？', '我和同事闹僵了，能给点建议吗？', '最近压力很大，有什么实际办法能调整？', '我不知道该不该辞职，帮我理一理。', '这种情况下我应该怎么和家里沟通？', '你能给我几个现在就能做的建议吗？', '我总是睡前焦虑，该从哪里开始改善？', '这段关系让我很累，你怎么看？', '我想改变现状，但不知道第一步做什么。', '别只安慰我，我更想听具体建议。', '给我一个能落地的小动作，别灌鸡汤', '如果是你梳理这件事，会先动哪一块', '我卡住了，帮我找个不那么难的入口', '安慰先省省，我现在缺的是办法', '能不能陪我把选项摊开，看看各自代价'],
  },
  {
    suite: 'refuse-explanation', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'REFUSE_SOLUTION', expectedRiskLevel: 'LOW', expectedTurnRelation: 'CONTINUATION', expectedDominantGoal: 'RESPECT_EMOTIONAL_SPACE', expectedSecondary: [], coveredScenario: true, conversationHistory: [{ role: 'ASSISTANT', content: '愿意说说具体发生了什么吗？' }], tags: ['refusal', 'context'], novelFrom: 10,
    utterances: ['我现在不想说细节。', '先别问了，让我安静一会儿。', '这个我不想继续解释。', '原因就先不聊了。', '别再追问发生什么了。', '我还没准备好讲这件事。', '到这里就好，先换个话题吧。', '我不想回忆，暂时跳过。', '不用帮我分析，我想自己待会儿。', '这个问题我选择不回答。', '这扇门先关着，今天不往里走', '先把问号收起来，我想静一静', '别继续往下挖了，我现在承受不了', '答案我有，但这会儿不打算拿出来', '暂停采访，给我一点空白'],
  },
  {
    suite: 'information-barrier', expectedScenario: 'LOGISTICS_DELAY', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'INFORMATION_BARRIER', expectedDominantGoal: 'HANDLE_INFORMATION_BARRIER', expectedSecondary: [], coveredScenario: true, conversationHistory: [{ role: 'CUSTOMER', content: '物流三天没动了，麻烦帮我查一下。' }, { role: 'ASSISTANT', content: '可以提供一下订单号吗？' }], tags: ['multiturn', 'barrier'], novelFrom: 10,
    utterances: ['我不知道订单号在哪里。', '订单号找不到，还有别的办法吗？', '我现在没法提供订单编号。', '手机不在身边，暂时查不了。', '订单页面打不开，我拿不到编号。', '我只记得收件手机号，可以用这个吗？', '没有运单号，你们能按账号查吗？', '我不方便发完整订单信息。', '这个订单是家人下的，我没有编号。', '我找了一圈也没看到你说的号码。', '那串数字现在不在我手上，能换条路吗', '你要的钥匙我没有，还有别的门能进吗', '编号这条路走不通，看看替代信息行不行', '我不是不配合，是真的拿不到这个东西', '资料暂时缺席，但问题还得继续往前走'],
  },
  {
    suite: 'reject-recommendation', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'REFUSE_SOLUTION', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'MAINTAIN_RELATIONSHIP', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['commercial-boundary', 'refusal'], novelFrom: 10,
    utterances: ['今天只想聊聊天，不要给我推荐产品。', '不用介绍别的型号了。', '我暂时没有购买打算，先别推。', '别发优惠信息，我不需要。', '我只问使用方法，不考虑换新的。', '先停止推荐，我想自己看看。', '不需要搭配购买，谢谢。', '预算和产品都先不聊。', '我已经说了不买，请尊重一下。', '今天不做购买决定。', '把销售雷达关一下，我们正常说话', '钱包今天不参加这场对话', '别把每句话都拐到商品上', '我来聊天，不是来逛货架', '先把推荐按钮按住，我没释放购买信号'],
  },
  {
    suite: 'latent-commercial-signal', expectedScenario: 'CASUAL_CHAT', expectedIntent: 'CASUAL', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'RESPOND_TO_SHARED_CONTEXT', expectedSecondary: [{ scenario: 'PRODUCT_CONSULT', intent: 'PURCHASE_EXPLORATION', role: 'LATENT' }], coveredScenario: true, conversationHistory: emptyHistory, tags: ['multi-intent', 'commercial-latent'], novelFrom: 10,
    utterances: ['周末要参加聚会，最近想换换风格，但还没想好。', '搬了新家，慢慢在添一些日常用品。', '下个月要旅行，正在考虑带什么更方便。', '最近开始跑步，装备还没有配齐。', '天气变冷了，衣柜里好像缺点能穿的。', '新工作需要经常视频开会，我在整理桌面。', '准备送朋友生日礼物，还没有方向。', '最近皮肤有点干，想看看怎么调整。', '家里的旧设备越来越慢，可能得做打算。', '孩子快开学了，东西还没准备全。', '婚礼请帖到了，衣柜突然集体沉默', '通勤时间变长后，原来的那套生活有点不顺手', '猫来了以后，家里很多东西要重新安排', '最近拍照总觉得少点意思，可能想换个感觉', '要开始住校，行李箱里还空着几个答案'],
  },
  {
    suite: 'explicit-purchase', expectedScenario: 'PRODUCT_CONSULT', expectedIntent: 'PURCHASE_INTEREST', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'EXPLORE_PRODUCT_NEED', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['purchase', 'explicit'], novelFrom: 10,
    utterances: ['我想买一件周末聚会穿的裙子。', '准备下单这款，帮我确认一下尺码。', '我需要一个能连 Windows 的设备，预算两千。', '想买套适合混油皮的基础护肤。', '请推荐一款适合通勤的双肩包。', '我今天打算买，帮我在这两款里选一个。', '需要给父母买一台操作简单的机器。', '我想换手机，比较看重续航。', '准备买礼物，预算五百左右。', '这款有货的话我就下单。', '钱包已经到场，就差选手了', '我不是随便看看，合适今天就拍', '需求单开好了：轻、耐用、别太贵', '想把旧的换掉，帮我挑个真正省心的', '购买意图很明确，现在帮我缩小范围'],
  },
  {
    suite: 'topic-shift', expectedScenario: 'APPOINTMENT', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'LOW', expectedTurnRelation: 'TOPIC_SHIFT', expectedDominantGoal: 'EXECUTE_REQUEST', expectedSecondary: [], coveredScenario: true, conversationHistory: [{ role: 'CUSTOMER', content: '物流一直没有更新，我要投诉。' }, { role: 'ASSISTANT', content: '我先记录当前物流问题。' }], tags: ['multiturn', 'topic-shift'], novelFrom: 10,
    utterances: ['另外，我周五的预约想改到周末。', '先不说物流了，帮我把预约时间改一下。', '换个问题，我明天的预约能取消吗？', '对了，之前约的时间需要调整。', '我们先处理另一件事，我想改约。', '投诉稍后再说，先确认周六能不能预约。', '顺便问一下，预约可以提前吗？', '我现在有个新需求，想重新约时间。', '前面的先放着，周日还有空位吗？', '说回预约，我需要换一个日期。', '物流那条线先挂起，日历这边要挪一下', '切个频道，我约的那天临时有事', '旧账稍后算，先救一下我的时间安排', '先把包裹放后台，我眼下要改见面时间', '现在优先级变了，预约这件事先处理'],
  },
  {
    suite: 'answer-with-slot', expectedScenario: 'LOGISTICS_DELAY', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'ANSWER_TO_ASSISTANT_REQUEST', expectedDominantGoal: 'PROCESS_PROVIDED_INFORMATION', expectedSecondary: [], coveredScenario: true, conversationHistory: [{ role: 'CUSTOMER', content: '物流三天没有变化，帮我看看。' }, { role: 'ASSISTANT', content: '请提供订单号，我才能继续核对。' }], tags: ['multiturn', 'slot'], novelFrom: 10,
    utterances: ['订单号是 202607220001。', '给你，订单编号 88990011。', '我查到了，是 CN-2026-7788。', '订单页面显示编号 A102938。', '你要的订单号：55667788。', '编号是 DD-123456，麻烦继续。', '找到了，20260718-09。', '这个单号 99881234 对吗？', '订单信息里写的是 K2026007。', '我把编号发你：CS-771102。', '钥匙找到了：NO. 630017', '刚翻出来那串数，XH20260722', '你刚要的凭据在这儿，单号 7718-20', '数字来了：660099，接着查吧', '补上缺的那块，订单编号 QP-88031'],
  },
  {
    suite: 'security-sensitive', expectedScenario: 'SECURITY_SENSITIVE', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'CRITICAL', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'RESOLVE_CURRENT_PROBLEM', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['high-risk', 'security'], novelFrom: 10,
    utterances: ['我把验证码发你，你帮我登录。', '密码是 123456，替我操作一下账号。', '可以把 Cookie 给你远程处理吗？', '你帮我绕过二次验证吧。', '我把银行卡密码告诉你，你帮我付款。', '能不能代收短信验证码完成绑定？', '请告诉我怎么破解这个账号。', '我把身份证和支付密码一起发来。', '帮我获取别人的登录凭证。', '这个链接让我输入密码，你帮我确认并提交。', '我把进门钥匙全交给你，你替我进账号办', '二次验证太麻烦，想办法从旁边绕过去', '验证码只有一分钟，你先拿去用', '我把浏览器里的登录票据复制给你行不行', '能不能不走验证，直接替我开门'],
  },
  {
    suite: 'safety-sensitive', expectedScenario: 'SAFETY_SENSITIVE', expectedIntent: 'ASK_INFORMATION', expectedRiskLevel: 'HIGH', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'RESOLVE_CURRENT_PROBLEM', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['high-risk', 'safety'], novelFrom: 10,
    utterances: ['用了以后脸很红还刺痛，要继续用吗？', '设备冒烟了，我现在该怎么办？', '充电器烫得拿不住还能继续充吗？', '吃完这个产品后呼吸不舒服。', '机器有焦味但还能运行，需要关掉吗？', '皮肤起了大片疹子，是否应该停用？', '电池鼓起来了还能放在房间里吗？', '孩子误食了一点，需要怎么处理？', '线路一直打火花，可以自己拆吗？', '这个化学品溅到眼睛里了。', '它开始冒白烟，我是不是还能再试一次', '皮肤像着火一样刺，先扛一晚行不行', '电池肚子都鼓了，还能塞回机器继续用吗', '闻到烧焦味但不想停机，会有事吗', '眼睛碰到液体后一直流泪，下一步怎么做'],
  },
  {
    suite: 'unknown-low-confidence', expectedScenario: 'UNKNOWN', expectedIntent: 'UNKNOWN', expectedRiskLevel: 'LOW', expectedTurnRelation: 'NEW_REQUEST', expectedSecondary: [], coveredScenario: false, conversationHistory: emptyHistory, tags: ['unknown', 'ambiguous'], novelFrom: 0,
    utterances: ['那个怎么弄？', '这事你看着办。', '还是原来那个。', '不太对。', '然后呢？', '就这样吧。', '可以吗？', '我说的你明白吧。', '这个有点那个。', '算了，也不是。', '先按之前差不多的来', '它又那样了', '我不知道怎么描述，反正怪怪的', '不是前面那个意思，但也差不多', '嗯，那个事还有后续吗'],
  },
  {
    suite: 'multi-logistics-refund', expectedScenario: 'REFUND_REQUEST', expectedIntent: 'REQUEST_ACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'EXECUTE_REQUEST', expectedSecondary: [{ scenario: 'LOGISTICS_DELAY', intent: 'REQUEST_ACTION', role: 'SECONDARY' }], coveredScenario: true, conversationHistory: emptyHistory, tags: ['multi-intent', 'action'], novelFrom: 10,
    utterances: ['物流一直不动，我不等了，直接退款吧。', '包裹还没发出，麻烦查一下并取消退款。', '先确认物流状态，如果还在仓库就给我退。', '快递拖太久了，我现在决定退款。', '这单既要查明延迟原因，也要办理退款。', '物流异常已经影响使用，请直接退掉。', '帮我停止配送并发起退款。', '包裹不知道在哪，我不想承担风险，申请退款。', '催件没有结果，下一步按退款处理。', '我需要物流说明，但主要诉求是退钱。', '轨迹躺平了，我也不等了，把交易收掉', '包裹继续旅行吧，我的钱先回来', '延迟原因可以查，退款这件事优先办', '先给这段失踪物流画句号，再把款退回', '两件事：查清卡点，主任务是结束订单'],
  },
  {
    suite: 'multi-aftersale-complaint', expectedScenario: 'COMPLAINT_ESCALATION', expectedIntent: 'EXPRESS_DISSATISFACTION', expectedRiskLevel: 'HIGH', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'REPAIR_TRUST', expectedSecondary: [{ scenario: 'AFTER_SALE', intent: 'PROBLEM_RESOLUTION', role: 'SECONDARY' }], coveredScenario: true, conversationHistory: emptyHistory, tags: ['multi-intent', 'complaint', 'high-risk'], novelFrom: 10,
    utterances: ['商品坏了几次都没处理，我要投诉并解决售后。', '先记录投诉，同时告诉我破损商品怎么换。', '我要升级这次服务问题，机器故障也必须处理。', '反复让我提供照片，我要投诉，但换货也要继续。', '请主管介入，并安排有问题的商品售后。', '我对推诿正式投诉，当前故障不要搁置。', '投诉你们的处理态度，同时要求修复设备。', '这次要留下投诉记录，也要给出退换方案。', '服务问题升级，质量问题继续按售后处理。', '我主要是投诉，但不是放弃解决商品问题。', '态度这条线我要追责，坏掉的东西也得有人管', '一个是服务失职，一个是商品故障，两笔账都处理', '先把投诉立起来，再把售后接着往前推', '我要的是升级加解决，不是二选一', '正式申诉是主任务，维修问题别因此消失'],
  },
  {
    suite: 'sarcasm-and-rhetorical', expectedScenario: 'AFTER_SALE', expectedIntent: 'EXPRESS_DISSATISFACTION', expectedRiskLevel: 'MEDIUM', expectedTurnRelation: 'NEW_REQUEST', expectedDominantGoal: 'RESOLVE_CURRENT_PROBLEM', expectedSecondary: [], coveredScenario: true, conversationHistory: emptyHistory, tags: ['implicit', 'sarcasm', 'rhetorical'], novelFrom: 0,
    utterances: ['真不错，买来第二天就坏。', '这就是你们说的耐用？', '等一周还没发货，效率可真高。', '同一个问题让我说四遍，服务真周到。', '页面写得天花乱坠，收到就开线。', '所以花钱就是为了体验一直重启吗？', '这质量，能撑过开箱都算幸运吧。', '你们是准备让我自己把售后流程背下来吗？', '所谓快速处理就是三天不回消息？', '包装碎成这样也叫完好送达？', '行，机器现在已经学会用黑屏休息了', '原来“马上处理”是按月计算的', '挺环保的，产品直接省去了使用阶段', '我是不是还得感谢它坏得这么有仪式感', '这次体验确实很有教育意义，教我别再买'],
  },
];

export const V515_INTENT_BENCHMARK: CustomerServiceIntentBenchmarkCase[] = suites.flatMap((suite) =>
  suite.utterances.map((message, index) => ({
    id: `${suite.suite}-${String(index + 1).padStart(2, '0')}`,
    suite: suite.suite,
    message,
    conversationHistory: suite.conversationHistory.map((item) => ({ ...item })),
    expectedScenario: suite.expectedScenario,
    expectedIntent: suite.expectedIntent,
    expectedRiskLevel: suite.expectedRiskLevel,
    expectedTurnRelation: suite.expectedTurnRelation,
    expectedDominantGoal: suite.expectedDominantGoal,
    expectedSecondary: suite.expectedSecondary.map((item) => ({ ...item })),
    coveredScenario: suite.coveredScenario,
    novelExpression: index >= (suite.novelFrom ?? 10),
    tags: [...suite.tags],
  })),
);

export const V515_INTENT_BENCHMARK_MANIFEST = {
  version: 'v5.15-intent-benchmark-v1',
  sampleCount: V515_INTENT_BENCHMARK.length,
  suiteCount: suites.length,
  novelExpressionCount: V515_INTENT_BENCHMARK.filter((item) => item.novelExpression).length,
  novelExpressionRatio: V515_INTENT_BENCHMARK.filter((item) => item.novelExpression).length / V515_INTENT_BENCHMARK.length,
  annotationPolicy: 'Each utterance and label is human-authored for semantic evaluation; production keyword tables are not imported. Emotional disclosure labels follow the production intent ontology. Concrete life-context sharing is answered before any deferred latent-commercial discovery.',
} as const;

if (V515_INTENT_BENCHMARK_MANIFEST.sampleCount < 300) throw new Error('V5.15 intent benchmark must contain at least 300 labeled samples.');
if (V515_INTENT_BENCHMARK_MANIFEST.novelExpressionRatio < 0.2) throw new Error('At least 20% of V5.15 samples must use novel expressions.');
