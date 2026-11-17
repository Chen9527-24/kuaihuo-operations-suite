-- HVE-2 Unified Guideline Policy Engine
-- Header 仅保存稳定身份；所有 Runtime 行为字段由不可变 Version 承载。
CREATE TABLE "CustomerServiceGuideline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "originType" VARCHAR(40) NOT NULL DEFAULT 'TENANT_CUSTOM',
    "currentVersionId" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerServiceGuideline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceGuidelineVersion" (
    "id" TEXT NOT NULL,
    "guidelineId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "binding" JSONB NOT NULL,
    "condition" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "criticality" VARCHAR(24) NOT NULL DEFAULT 'STANDARD',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relationships" JSONB,
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "regressionResult" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerServiceGuidelineVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsGuideline_tenant_code" ON "CustomerServiceGuideline"("tenantId", "code");
CREATE INDEX "CsGuideline_tenant_status_updated" ON "CustomerServiceGuideline"("tenantId", "status", "updatedAt");
CREATE INDEX "CsGuideline_tenant_origin_status" ON "CustomerServiceGuideline"("tenantId", "originType", "status");
CREATE INDEX "CsGuideline_current_version" ON "CustomerServiceGuideline"("currentVersionId");
CREATE INDEX "CsGuideline_deleted" ON "CustomerServiceGuideline"("deletedAt");
CREATE UNIQUE INDEX "CsGuidelineVersion_guideline_version" ON "CustomerServiceGuidelineVersion"("guidelineId", "versionNo");
CREATE INDEX "CsGuidelineVersion_guideline_status" ON "CustomerServiceGuidelineVersion"("guidelineId", "status");
CREATE INDEX "CsGuidelineVersion_status_criticality_priority" ON "CustomerServiceGuidelineVersion"("status", "criticality", "priority");
CREATE INDEX "CsGuidelineVersion_published" ON "CustomerServiceGuidelineVersion"("publishedAt");

ALTER TABLE "CustomerServiceGuidelineVersion"
  ADD CONSTRAINT "CustomerServiceGuidelineVersion_guidelineId_fkey"
  FOREIGN KEY ("guidelineId") REFERENCES "CustomerServiceGuideline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 为现有租户发布 HVE-2 第一批系统 Guideline。新租户由 Foundation Seeder 补齐。

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.social-greeting.presence-only'), t."id", 'hve.social-greeting.presence-only', '普通问候只保持在场感', '普通问候不自动启动销售或采访式追问', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.social-greeting.presence-only:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"interaction.type","op":"EQ","value":"SOCIAL_GREETING"}'::jsonb, '[{"op":"REQUIRE_ACT","act":"PRESENCE_ACK","necessity":"REQUIRED","enforcement":"HARD","priority":900,"trackingKey":"social.greeting.ack"},{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":900},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":900},{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"HARD","priority":900},{"op":"SET_COMPLETION","mode":"STOP_AFTER_REQUIRED","enforcement":"HARD","allowOptionalContinuation":false}]'::jsonb, 900, 'IMPORTANT', ARRAY['interaction:social','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.social-greeting.presence-only' || ':v1') || md5('hve2:' || 'hve.social-greeting.presence-only'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.social-greeting.presence-only' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.social-greeting.presence-only' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.identity.role-confirmation-stop'), t."id", 'hve.identity.role-confirmation-stop', '角色确认后自然停止', '客户仅确认是否为客服时，只完成角色确认，不自动展开服务', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.identity.role-confirmation-stop:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"interaction.type","op":"EQ","value":"ROLE_CONFIRMATION"}'::jsonb, '[{"op":"REQUIRE_ACT","act":"CONFIRM_ROLE","necessity":"REQUIRED","enforcement":"HARD","priority":950,"trackingKey":"identity.role.confirmed"},{"op":"SUPPRESS_ACT","act":"EXPLAIN_SERVICE_SCOPE","enforcement":"HARD","priority":950},{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"HARD","priority":950},{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":950},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":950},{"op":"SET_COMPLETION","mode":"STOP_AFTER_REQUIRED","enforcement":"HARD","allowOptionalContinuation":false}]'::jsonb, 950, 'IMPORTANT', ARRAY['interaction:identity','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.identity.role-confirmation-stop' || ':v1') || md5('hve2:' || 'hve.identity.role-confirmation-stop'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.identity.role-confirmation-stop' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.identity.role-confirmation-stop' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.identity.ai-truthful-stop'), t."id", 'hve.identity.ai-truthful-stop', 'AI 身份如实且不展开服务', '显式询问 AI/真人身份时如实回答，回答后不自动扩展服务范围', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.identity.ai-truthful-stop:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"interaction.type","op":"EQ","value":"AI_IDENTITY_QUERY"}'::jsonb, '[{"op":"REQUIRE_ACT","act":"DISCLOSE_AI_IDENTITY","necessity":"REQUIRED","enforcement":"HARD","priority":1000,"trackingKey":"identity.ai.disclosed"},{"op":"SUPPRESS_ACT","act":"EXPLAIN_SERVICE_SCOPE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":1000},{"op":"SET_COMPLETION","mode":"STOP_AFTER_REQUIRED","enforcement":"HARD","allowOptionalContinuation":false}]'::jsonb, 1000, 'MANDATORY', ARRAY['interaction:identity','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.identity.ai-truthful-stop' || ':v1') || md5('hve2:' || 'hve.identity.ai-truthful-stop'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.identity.ai-truthful-stop' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.identity.ai-truthful-stop' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.boundary.no-questions'), t."id", 'hve.boundary.no-questions', '客户要求不再追问', '客户明确要求别再问时，持续禁止可选追问；必要业务槽位仍由 Planner 保留', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.boundary.no-questions:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"behavior.requestedDeltas","op":"CONTAINS","value":"NO_QUESTIONS"}'::jsonb, '[{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"HARD","priority":1000}]'::jsonb, 1000, 'IMPORTANT', ARRAY['behavior:boundary','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.boundary.no-questions' || ':v1') || md5('hve2:' || 'hve.boundary.no-questions'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.boundary.no-questions' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.boundary.no-questions' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.boundary.listen-only'), t."id", 'hve.boundary.listen-only', '客户要求只听不推进', 'LISTEN_ONLY 时禁止可选追问、销售推进和 CTA', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.boundary.listen-only:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"behavior.requestedDeltas","op":"CONTAINS","value":"LISTEN_ONLY"}'::jsonb, '[{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":1000}]'::jsonb, 1000, 'IMPORTANT', ARRAY['behavior:boundary','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.boundary.listen-only' || ':v1') || md5('hve2:' || 'hve.boundary.listen-only'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.boundary.listen-only' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.boundary.listen-only' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.boundary.no-advice'), t."id", 'hve.boundary.no-advice', '客户拒绝建议或营销', '客户明确拒绝建议时停止业务推进和 CTA', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.boundary.no-advice:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"behavior.requestedDeltas","op":"CONTAINS","value":"NO_ADVICE"}'::jsonb, '[{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":1000}]'::jsonb, 1000, 'IMPORTANT', ARRAY['behavior:boundary','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.boundary.no-advice' || ':v1') || md5('hve2:' || 'hve.boundary.no-advice'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.boundary.no-advice' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.boundary.no-advice' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.behavior.question-fatigue'), t."id", 'hve.behavior.question-fatigue', '连续追问疲劳', '最近连续问句较多且没有必要业务问题时，软抑制新的可选问题', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.behavior.question-fatigue:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"behavior.consecutiveQuestionTurns","op":"GTE","value":2}'::jsonb, '[{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"SOFT","priority":650}]'::jsonb, 650, 'STANDARD', ARRAY['behavior:memory','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.behavior.question-fatigue' || ':v1') || md5('hve2:' || 'hve.behavior.question-fatigue'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.behavior.question-fatigue' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.behavior.question-fatigue' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;

INSERT INTO "CustomerServiceGuideline"
("id","tenantId","code","name","description","originType","status","revision","createdById","createdAt","updatedAt")
SELECT 'hve2g_' || md5(t."id" || ':hve.product.no-grounding-no-recommendation'), t."id", 'hve.product.no-grounding-no-recommendation', '无商品知识时禁止伪装推荐', '商品探索未命中真实 Knowledge 时禁止生成“店内商品推荐”行为', 'SYSTEM_TEMPLATE', 'ENABLED', 2, 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT 'hve2v_' || md5(g."tenantId" || ':hve.product.no-grounding-no-recommendation:v1'), g."id", 1, 1, '{"type":"SYSTEM","key":"*"}'::jsonb, '{"fact":"interaction.type","op":"EQ","value":"PRODUCT_DISCOVERY_NO_GROUNDING"}'::jsonb, '[{"op":"SUPPRESS_ACT","act":"RECOMMEND_GROUNDED_ITEM","enforcement":"HARD","priority":980}]'::jsonb, 980, 'MANDATORY', ARRAY['grounding:knowledge','system:hve']::TEXT[], '{}'::jsonb, ARRAY['SYSTEM:HVE-2']::TEXT[],
       md5('hve.product.no-grounding-no-recommendation' || ':v1') || md5('hve2:' || 'hve.product.no-grounding-no-recommendation'), 'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-2"}'::jsonb, CURRENT_TIMESTAMP, 'system:hve2', 'system:hve2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.product.no-grounding-no-recommendation' AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id" AND g."code" = 'hve.product.no-grounding-no-recommendation' AND v."versionNo" = 1 AND g."currentVersionId" IS NULL;
