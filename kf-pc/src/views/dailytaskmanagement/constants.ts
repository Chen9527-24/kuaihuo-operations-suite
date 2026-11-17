export const DAILY_TASK_DEFAULT_FORM = {
  tenantId: '',
  mediaAccountId: '',
  platform: '',
  title: '',
  videoUrl: '',
  backupVideoUrls: [],
  coverFileId: '',
  coverUrl: '',
  copywriting: '',
  commentRequirement: '',
  commentExample: '',
  targetCommentCount: 10,
  rewardAmount: 100,
  taskBudgetAmount: 100,
  status: 'DRAFT',
  distributionScope: 'TENANT',
  distributionGroupId: '',
  allowGroupCollaboration: false,
  commissionEnabled: false,
  commissionRuleId: '',
  commissionRuleType: 'PERCENT',
  commissionRuleValue: 0,
  commissionRuleDisplayValue: 0,
  commissionMode: 'EXTRA',
  testBatchId: '',
  remark: '',
  commentItems: []
};

export const AI_COMMENT_CONFIG_DEFAULT_FORM = {
  messageContent: '请基于当前配置生成评论运营数据，主题必须紧贴当前视频，语气像评论区真实留言，严格返回 rows JSON。',
  useConversationContext: true,
  count: 5,
  videoTitle: '',
  videoUrl: '',
  videoContent: '',
  accountPositioning: '',
  videoStyle: '',
  videoScript: '',
  targetAudience: '',
  audiencePainPoint: '',
  operationGoal: '提升视频曝光，带动评论区互动，营造讨论氛围',
  platform: '',
  customSystemPrompt: '',
  customUserPrompt: ''
};

export const AI_COMMENT_CONFIG_PRESET_FORM = {
  ...AI_COMMENT_CONFIG_DEFAULT_FORM,
  count: 10,
  videoTitle: '别再死磕追投了，很多账户就是这么跑废的',
  videoUrl: '',
  videoContent:
    '这是一个抖音投流口播视频。核心内容是：很多老板全域投放跑不动，不是因为选品差，也不是出价错，而是因为过度追投。追投前期投产看起来很好，但高意向流量池很快会被消耗完，后续进入任务流量阶段，账户标签也会逐渐跑偏，最终导致主计划休眠、整体投放效果下滑。视频的目的，是帮助有投流需求的老板理解“不能只靠追投”的底层逻辑，并引导潜在客户私信咨询。',
  accountPositioning:
    '8年一线投放经验，消耗过亿，一代老投手持续实操，虚心交流，共同进步。主营业务：千川、本地推线索/团购、小红书；业务服务：广告账户运营、投放成本优化、账户起量与稳定、来客运营。',
  videoStyle: '博主口播',
  videoScript:
    '别再死磕当大冤种了，全域跑不动，你放量了就亏到哭。不是选品拉胯，也不是你的出价不对。90%的人呢，都栽在同一个坑里，就是过度追投。我干投放干了10年，烧了上亿。今天呢，给你发透底层逻辑，再给你三套营收方案，你直接抄就行了。追投前期投产确实炸，但是你知道那些流量从哪里来的吗？比如说，短剧小说差评里的高意向人群，这批的话，他们转化强，所以说投产很好看，但是池子就那么大，割完就没了。后面呢，全都是你的任务流量了。所以说，光看不买，投产断崖式下跌是很正常，更惨的是长期依赖追投啊，你的账户人群标签就全偏了。主计划彻底休眠，不要再瞎加价换素材，纯纯浪费钱。',
  targetAudience: '有投流需求的老板、中小商家负责人、本地生活商家、想通过千川或本地推获客的人群',
  audiencePainPoint: '想投流但怕没效果，不知道怎么投，担心成本高、留资少、账户跑不稳，不清楚追投和放量的正确方式。',
  operationGoal: '提升视频曝光，带动评论区互动，营造讨论氛围，并引导潜在客户私信作者咨询投流问题。',
  platform: '抖音',
  customSystemPrompt:
    '必须贴合投流/追投/放量/账户标签/主计划/千川/本地推等主题，不要写泛化评论；禁止出现XX、某某、某个环节这类占位词。',
  customUserPrompt:
    '多一些老板视角、小白提问型和轻微质疑型评论，问题和质疑都要具体，能直接点到追投、放量、主计划、人群标签、线索成本这些点。再口语化一点，少一点完整提问句和完整分析句，多一点像评论区随手发出来的短句和半句。整体更像普通商家和小白用户在评论区发言，不要太像业内交流群讨论。回复尽量更短、更口语，少一点“解释感”和“标准答案感”。'
};

export const DAILY_TASK_STATUS_FALLBACKS = [
  { label: '草稿', value: 'DRAFT', color: 'gray' },
  { label: '待发布', value: 'READY', color: 'blue' },
  { label: '已发推流', value: 'DISPATCHED', color: 'purple' },
  { label: '执行中', value: 'RUNNING', color: 'orange' },
  { label: '已暂停', value: 'PAUSED', color: 'orange' },
  { label: '已关闭', value: 'CLOSED', color: 'gray' },
  { label: '已归档', value: 'ARCHIVED', color: 'gray' },
  { label: '已完成', value: 'COMPLETED', color: 'green' },
  { label: '已取消', value: 'CANCELLED', color: 'red' },
  { label: '已停用', value: 'DISABLED', color: 'red' }
];

export const TASK_COMMENT_STATUS_FALLBACKS = [
  { label: '可领取', value: 'AVAILABLE', color: 'blue' },
  { label: '已领取', value: 'CLAIMED', color: 'orange' },
  { label: '已完成', value: 'COMPLETED', color: 'green' },
  { label: '已作废', value: 'INVALID', color: 'red' }
];

export const COMMENT_SOURCE_FALLBACKS = [
  { label: '手动', value: 'MANUAL' },
  { label: 'AI', value: 'AI' },
  { label: '导入', value: 'IMPORT' }
];

export const MEDIA_PLATFORM_FALLBACKS = [
  { label: '抖音', value: 'DOUYIN' },
  { label: '微信视频号', value: 'WECHAT_VIDEO' },
  { label: '小红书', value: 'XIAOHONGSHU' }
];
