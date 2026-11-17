-- HVE-3: upgrade the existing system Guideline as DATA, not Prompt/code behavior.
-- No-Knowledge product discovery now has a positive plan posture while keeping grounded recommendation forbidden.
INSERT INTO "CustomerServiceGuidelineVersion"
("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
SELECT
  'hve3v_' || md5(g."tenantId" || ':hve.product.no-grounding-no-recommendation:v2'),
  g."id",
  2,
  1,
  '{"type":"SYSTEM","key":"*"}'::jsonb,
  '{"fact":"interaction.type","op":"EQ","value":"PRODUCT_DISCOVERY_NO_GROUNDING"}'::jsonb,
  '[{"op":"SUPPRESS_ACT","act":"RECOMMEND_GROUNDED_ITEM","enforcement":"HARD","priority":980},{"op":"REQUIRE_ACT","act":"ACKNOWLEDGE_PREFERENCE","necessity":"PREFERRED","enforcement":"SOFT","priority":720,"trackingKey":"product.preference.ack"},{"op":"REQUIRE_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","necessity":"OPTIONAL","enforcement":"SOFT","priority":520,"trackingKey":"product.preference.optional-question"}]'::jsonb,
  980,
  'MANDATORY',
  ARRAY['grounding:knowledge','system:hve']::TEXT[],
  '{}'::jsonb,
  ARRAY['SYSTEM:HVE-2','SYSTEM:HVE-3:POSITIVE_NO_GROUNDING_POSTURE']::TEXT[],
  md5('hve.product.no-grounding-no-recommendation:v2:hve3-positive-plan') || md5(g."tenantId" || ':hve3'),
  'PUBLISHED',
  '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-3","reason":"positive-no-grounding-plan"}'::jsonb,
  CURRENT_TIMESTAMP,
  'system:hve3',
  'system:hve3',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CustomerServiceGuideline" g
WHERE g."code" = 'hve.product.no-grounding-no-recommendation'
  AND g."originType" = 'SYSTEM_TEMPLATE'
ON CONFLICT ("guidelineId","versionNo") DO NOTHING;

UPDATE "CustomerServiceGuideline" g
SET "currentVersionId" = v."id",
    "status" = 'ENABLED',
    "revision" = g."revision" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "CustomerServiceGuidelineVersion" v
WHERE v."guidelineId" = g."id"
  AND g."code" = 'hve.product.no-grounding-no-recommendation'
  AND g."originType" = 'SYSTEM_TEMPLATE'
  AND v."versionNo" = 2
  AND (g."currentVersionId" IS DISTINCT FROM v."id");
