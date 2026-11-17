-- Stage 2 correction: generic guidance without merchant Knowledge is discretionary.
-- The final Canonical Plan now lets Role configuration + dialogue state decide whether
-- a PREFERRED guidance Act and OPTIONAL question should participate in the turn.

WITH target AS (
  SELECT
    g."id" AS "guidelineId",
    g."currentVersionId",
    v."schemaVersion",
    v."binding",
    v."condition",
    v."priority",
    v."criticality",
    v."tags",
    v."relationships",
    v."evidenceRefs",
    COALESCE((
      SELECT MAX(all_versions."versionNo")
      FROM "CustomerServiceGuidelineVersion" all_versions
      WHERE all_versions."guidelineId" = g."id"
    ), 0) + 1 AS "nextVersionNo"
  FROM "CustomerServiceGuideline" g
  JOIN "CustomerServiceGuidelineVersion" v ON v."id" = g."currentVersionId"
  WHERE g."code" = 'hve.product.no-grounding-general-guidance'
    AND g."originType" = 'SYSTEM_TEMPLATE'
), retired AS (
  UPDATE "CustomerServiceGuidelineVersion" current_version
  SET "status" = 'RETIRED', "updatedAt" = CURRENT_TIMESTAMP
  FROM target
  WHERE current_version."id" = target."currentVersionId"
    AND current_version."status" = 'PUBLISHED'
  RETURNING current_version."id"
), inserted AS (
  INSERT INTO "CustomerServiceGuidelineVersion"
  ("id","guidelineId","versionNo","schemaVersion","binding","condition","actions","priority","criticality","tags","relationships","evidenceRefs","contentHash","status","regressionResult","publishedAt","publishedById","createdById","createdAt","updatedAt")
  SELECT
    'hve3r5d_' || md5(target."guidelineId" || ':' || target."nextVersionNo"::text),
    target."guidelineId",
    target."nextVersionNo",
    target."schemaVersion",
    target."binding",
    target."condition",
    '[{"op":"REQUIRE_ACT","act":"ACKNOWLEDGE_PREFERENCE","necessity":"PREFERRED","enforcement":"SOFT","priority":720,"trackingKey":"product.preference.ack"},{"op":"REQUIRE_ACT","act":"PROVIDE_GENERAL_GUIDANCE","necessity":"PREFERRED","enforcement":"SOFT","priority":650,"trackingKey":"product.general-guidance","parameters":{"target":"客户当前需求对应的一般性选择原则或方向","decisionPurpose":"在不声称商家具体商品事实的前提下，仅在当前 Role 与对话状态适合时提供能推进选择的有用方向","expectedInformationGain":"ADD_GENERAL_GUIDANCE"}},{"op":"REQUIRE_ACT","act":"REQUEST_OPTIONAL_PREFERENCE","necessity":"OPTIONAL","enforcement":"SOFT","priority":520,"trackingKey":"product.preference.optional-question"}]'::jsonb,
    target."priority",
    target."criticality",
    target."tags",
    target."relationships",
    target."evidenceRefs" || ARRAY['SYSTEM:HVE-3:STAGE2:ROLE_TURN_POLICY']::TEXT[],
    md5(target."guidelineId" || ':stage2-role-turn-policy:' || target."nextVersionNo"::text)
      || md5('preferred-guidance-role-dialogue-state'),
    'PUBLISHED',
    '{"source":"SYSTEM_TEMPLATE","verifier":"HVE-3-STAGE2-ROLE-TURN-POLICY","reason":"role-and-dialogue-state-decide-discretionary-moves"}'::jsonb,
    CURRENT_TIMESTAMP,
    'system:hve3-stage2',
    'system:hve3-stage2',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM target
  RETURNING "id", "guidelineId"
)
UPDATE "CustomerServiceGuideline" guideline
SET "currentVersionId" = inserted."id",
    "status" = 'ENABLED',
    "revision" = guideline."revision" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM inserted
WHERE guideline."id" = inserted."guidelineId";
