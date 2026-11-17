-- Existing Ali roles predate the explicit V1.9 activation contract. Keep their legacy
-- behavior module intact, add the typed posture alongside it, and fill only a missing
-- customer-visible relation label.
UPDATE "CustomerServiceMerchantRole"
SET
  "publicRelation" = '服务顾问',
  "revision" = "revision" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ali'
  AND "deletedAt" IS NULL
  AND ("publicRelation" IS NULL OR BTRIM("publicRelation") = '');

WITH ali_roles AS (
  SELECT
    role."id" AS "merchantRoleId",
    role."tenantId",
    role."createdById",
    definition."id" AS "definitionId"
  FROM "CustomerServiceMerchantRole" role
  JOIN "CustomerServiceRoleModuleDefinition" definition
    ON definition."code" = 'SERVICE_POSTURE'
  WHERE role."code" = 'ali'
    AND role."deletedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "CustomerServiceRoleModuleInstance" existing
      WHERE existing."merchantRoleId" = role."id"
        AND existing."definitionId" = definition."id"
        AND existing."deletedAt" IS NULL
        AND existing."status" = 'ENABLED'
        AND existing."content"->>'schemaVersion' = '1'
    )
)
INSERT INTO "CustomerServiceRoleModuleInstance" (
  "id", "tenantId", "merchantRoleId", "definitionId", "key", "name", "content",
  "conditions", "mergeMode", "priority", "sort", "status", "revision",
  "createdById", "createdAt", "updatedAt"
)
SELECT
  'ali-v19-' || MD5(ali_roles."merchantRoleId"),
  ali_roles."tenantId",
  ali_roles."merchantRoleId",
  ali_roles."definitionId",
  'ali-role-interaction-posture-v1',
  '阿梨 V1.9 互动姿态',
  '{"schemaVersion":1,"initiativeLevel":"BALANCED","openingParticipation":"CONTEXTUAL_ENTRY","followUpOffering":"CONTEXTUAL_OFFER","clarificationInitiative":"DECISION_RELEVANT","guidanceInitiative":"CONTEXTUAL","resolutionFollowThrough":"NEXT_STEP","salesPressure":"LOW"}'::JSONB,
  NULL,
  'STRICTER',
  970,
  0,
  'ENABLED',
  1,
  ali_roles."createdById",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM ali_roles
ON CONFLICT ("merchantRoleId", "key") DO UPDATE SET
  "definitionId" = EXCLUDED."definitionId",
  "name" = EXCLUDED."name",
  "content" = EXCLUDED."content",
  "conditions" = EXCLUDED."conditions",
  "mergeMode" = EXCLUDED."mergeMode",
  "priority" = EXCLUDED."priority",
  "status" = 'ENABLED',
  "deletedAt" = NULL,
  "revision" = "CustomerServiceRoleModuleInstance"."revision" + 1,
  "updatedAt" = CURRENT_TIMESTAMP;
