CREATE TABLE "InterceptIntentPromptConfig" (
  "id" TEXT NOT NULL,
  "tenantId" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "workflowId" VARCHAR(128) NOT NULL DEFAULT '',
  "batchSize" INTEGER NOT NULL DEFAULT 30,
  "biz" TEXT,
  "cust" TEXT,
  "acctType" VARCHAR(64),
  "acctPos" TEXT,
  "tone" TEXT,
  "sellPts" TEXT,
  "banRules" TEXT,
  "nonCust" TEXT,
  "dmRule" TEXT,
  "entryRules" TEXT,
  "videoTitle" TEXT,
  "platform" VARCHAR(32),
  "extraParams" JSONB,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "createdById" VARCHAR(64),
  "deletedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterceptIntentPromptConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterceptIntentPromptConfig_tenantId_status_idx" ON "InterceptIntentPromptConfig"("tenantId", "status");
CREATE INDEX "InterceptIntentPromptConfig_tenantId_isDefault_idx" ON "InterceptIntentPromptConfig"("tenantId", "isDefault");
CREATE INDEX "InterceptIntentPromptConfig_deletedAt_idx" ON "InterceptIntentPromptConfig"("deletedAt");


INSERT INTO "InterceptIntentPromptConfig" (
  "id", "tenantId", "name", "description", "workflowId", "batchSize", "biz", "cust", "acctType", "acctPos", "tone", "sellPts", "banRules", "nonCust", "dmRule", "entryRules", "videoTitle", "platform", "isDefault", "status", "createdAt", "updatedAt"
)
SELECT
  'iipc_' || substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 20),
  "id",
  '默认评论意向分析提示词',
  '系统内置默认配置，来源于“评论意向分析 - 扣子请求方式.md”的工作流参数。',
  '',
  30,
  '我们提供抖音竞品截流工具，支持监听指定账号、采集作品评论、识别潜在线索，并辅助生成自然切入回复，帮助运营人员从竞品或行业账号评论区发现潜在客户。',
  '有抖音获客需求的商家、私域运营团队、本地生活商家、教育培训机构、招商加盟团队、短视频运营团队、销售获客团队。',
  '竞品账号',
  '该账号主要发布抖音获客、评论截流、私域转化、短视频运营相关内容，评论区可能出现想找工具、想学方法、想提升获客效率、想解决线索筛选问题的用户。',
  '主动、自然、像陌生人冷启动私信，有一点销售感但不油腻；先用真实样例和效果吸引，不急着问价格，不冒充作者，不夸大承诺。',
  '监听指定账号,采集作品评论,识别潜在线索,生成自然切入回复,辅助运营跟进,减少人工筛选成本',
  '不能说看到你提到价格和试用,不能说你是想先了解价格还是看试用效果,不能一上来报价,不能冒充视频作者,不能冒充账号客服,不能说是在竞品下面看到的,不能承诺百分百转化,不能保证成交,不能说全网最低价,不能夸大收益,不能诱导违规操作',
  '纯围观用户、玩梗用户、无业务需求用户、广告引流号、辱骂攻击用户、违规内容发布者、和抖音获客完全无关的评论用户。',
  '这是主动私信触达场景。S/A 级优先引导看真实线索样例或实际筛选效果；不要一上来聊价格、报价、套餐；少问问题，先给用户一个愿意回复的理由；C/D 不主动触达。',
  '工具方案切入,样例效果切入,问题诊断切入,成本效率切入,行业样例切入,不建议切入',
  '如何通过竞品评论区找到精准客户，并用工具提升线索筛选效率',
  'douyin',
  true,
  'ENABLED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant"
WHERE "deletedAt" IS NULL;

ALTER TABLE "InterceptIntentAnalysisBatch"
  ADD COLUMN "promptConfigId" VARCHAR(64),
  ADD COLUMN "promptConfigName" VARCHAR(100),
  ADD COLUMN "promptConfigSnapshot" JSONB;
