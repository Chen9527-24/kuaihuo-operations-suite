-- HVE-3 R4-A: Semantic Authority Boundary as versioned system Guideline DATA.
-- General guidance is explicitly allowed without Knowledge, but merchant-specific recommendation remains Grounding-gated.

INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT
  'hve3r4a_' || md5(g."tenantId" || ':hve.product.no-grounding-no-recommendation:v3'),
  g."id", 3, 1,
  '{"type":"SYSTEM","key":"*"}'::jsonb,
  '{"fact":"interaction.type","op":"EQ","value":"PRODUCT_DISCOVERY_NO_GROUNDING"}'::jsonb,
  '[{"op":"SUPPRESS_ACT","act":"RECOMMEND_GROUNDED_ITEM","enforcement":"HARD","priority":980},{"op":"REQUIRE_ACT","act":"ACKNOWLEDGE_PREFERENCE","necessity":"PREFERRED","enforcement":"SOFT","priority":720,"trackingKey":"product.preference.ack"},{"op":"REQUIRE_ACT","act":"PROVIDE_GENERAL_GUIDANCE","necessity":"PREFERRED","enforcement":"SOFT","priority":650,"trackingKey":"product.general-guidance","parameters":{"target":"客户当前需求对应的一般性选择原则或方向","decisionPurpose":"在不声称商家具体商品事实的前提下提供有用方向","expectedInformationGain":"ADD_GENERAL_GUIDANCE"}},{"op":"REQUIRE_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","necessity":"OPTIONAL","enforcement":"SOFT","priority":520,"trackingKey":"product.preference.optional-question"}]'::jsonb,
  980, 'MANDATORY', ARRAY['grounding:knowledge','system:hve']::TEXT[], '{}'::jsonb,
  ARRAY['SYSTEM:HVE-2','SYSTEM:HVE-3:R4-A:SEMANTIC_AUTHORITY']::TEXT[],
  md5('hve.product.no-grounding-no-recommendation:v3:r4a-semantic-authority') || md5(g."tenantId" || ':hve3:r4a'),
  'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-3-R4-A","reason":"general-guidance-without-merchant-claim"}'::jsonb,
  CURRENT_TIMESTAMP, 'system:hve3-r4a', 'system:hve3-r4a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.product.no-grounding-no-recommendation'
  AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "revision" = g."revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id"
  AND g."code" = 'hve.product.no-grounding-no-recommendation'
  AND g."originType" = 'SYSTEM_TEMPLATE'
  AND v."versionNo" = 3
  AND (g."currentVersionId" IS DISTINCT FROM v."id");

-- Explicit customer NO_ADVICE outranks the newly introduced general-guidance Act.
INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT
  'hve3r4a_' || md5(g."tenantId" || ':hve.boundary.no-advice:v2'),
  g."id", 2, 1,
  '{"type":"SYSTEM","key":"*"}'::jsonb,
  '{"fact":"behavior.requestedDeltas","op":"CONTAINS","value":"NO_ADVICE"}'::jsonb,
  '[{"op":"SUPPRESS_ACT","act":"PROVIDE_GENERAL_GUIDANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":1000}]'::jsonb,
  1000, 'IMPORTANT', ARRAY['behavior:boundary','system:hve']::TEXT[], '{}'::jsonb,
  ARRAY['SYSTEM:HVE-2','SYSTEM:HVE-3:R4-A:SEMANTIC_AUTHORITY']::TEXT[],
  md5('hve.boundary.no-advice:v2:r4a-semantic-authority') || md5(g."tenantId" || ':hve3:r4a'),
  'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-3-R4-A","reason":"no-advice-suppresses-general-guidance"}'::jsonb,
  CURRENT_TIMESTAMP, 'system:hve3-r4a', 'system:hve3-r4a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.boundary.no-advice'
  AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "revision" = g."revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id"
  AND g."code" = 'hve.boundary.no-advice'
  AND g."originType" = 'SYSTEM_TEMPLATE'
  AND v."versionNo" = 2
  AND (g."currentVersionId" IS DISTINCT FROM v."id");

-- LISTEN_ONLY also forbids unsolicited general guidance.
INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT
  'hve3r4a_' || md5(g."tenantId" || ':hve.boundary.listen-only:v2'),
  g."id", 2, 1,
  '{"type":"SYSTEM","key":"*"}'::jsonb,
  '{"fact":"behavior.requestedDeltas","op":"CONTAINS","value":"LISTEN_ONLY"}'::jsonb,
  '[{"op":"SUPPRESS_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"PROVIDE_GENERAL_GUIDANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"BUSINESS_ADVANCE","enforcement":"HARD","priority":1000},{"op":"SUPPRESS_ACT","act":"SALES_CTA","enforcement":"HARD","priority":1000}]'::jsonb,
  1000, 'IMPORTANT', ARRAY['behavior:boundary','system:hve']::TEXT[], '{}'::jsonb,
  ARRAY['SYSTEM:HVE-2','SYSTEM:HVE-3:R4-A:SEMANTIC_AUTHORITY']::TEXT[],
  md5('hve.boundary.listen-only:v2:r4a-semantic-authority') || md5(g."tenantId" || ':hve3:r4a'),
  'PUBLISHED', '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-3-R4-A","reason":"listen-only-suppresses-general-guidance"}'::jsonb,
  CURRENT_TIMESTAMP, 'system:hve3-r4a', 'system:hve3-r4a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.boundary.listen-only'
  AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id", "status" = 'ENABLED', "revision" = g."revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id"
  AND g."code" = 'hve.boundary.listen-only'
  AND g."originType" = 'SYSTEM_TEMPLATE'
  AND v."versionNo" = 2
  AND (g."currentVersionId" IS DISTINCT FROM v."id");
