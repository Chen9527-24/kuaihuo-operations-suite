-- Ensure the built-in super administrator can always enter at least one tenant workspace.
-- This is a data-only migration. It creates/repairs the default admin tenant and binds username `admin` to it.

INSERT INTO "Tenant" (
  "id",
  "name",
  "code",
  "status",
  "industry",
  "productIntro",
  "coreSellingPoint",
  "startedAt",
  "expiredAt",
  "remark",
  "createdAt",
  "updatedAt"
)
VALUES (
  'demo-admin-tenant',
  '管理员租户',
  'ADMIN-TENANT-DEFAULT',
  'ACTIVE',
  '系统管理',
  '默认超级管理员工作空间，用于系统初始化、租户管理和机器人全局配置。',
  '超级管理员默认租户，保证 admin 账号在任意环境首次登录时都有可用工作空间。',
  TIMESTAMPTZ '2026-01-01 00:00:00+00',
  TIMESTAMPTZ '9999-12-31 23:59:59.999+00',
  '系统初始化自动创建，请勿删除；如需替换，请先为 admin 账号绑定其他可用租户。',
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = 'ACTIVE',
  "industry" = EXCLUDED."industry",
  "productIntro" = EXCLUDED."productIntro",
  "coreSellingPoint" = EXCLUDED."coreSellingPoint",
  "expiredAt" = EXCLUDED."expiredAt",
  "remark" = EXCLUDED."remark",
  "deletedAt" = NULL,
  "updatedAt" = NOW();

DO $$
DECLARE
  v_admin_user_id TEXT;
  v_admin_tenant_id TEXT;
BEGIN
  SELECT "id" INTO v_admin_user_id
  FROM "User"
  WHERE "username" = 'admin' AND "deletedAt" IS NULL
  LIMIT 1;

  SELECT "id" INTO v_admin_tenant_id
  FROM "Tenant"
  WHERE "code" = 'ADMIN-TENANT-DEFAULT' AND "deletedAt" IS NULL
  LIMIT 1;

  IF v_admin_user_id IS NOT NULL AND v_admin_tenant_id IS NOT NULL THEN
    UPDATE "UserTenantMembership"
    SET "isDefault" = FALSE, "updatedAt" = NOW()
    WHERE "userId" = v_admin_user_id AND "tenantId" <> v_admin_tenant_id;

    INSERT INTO "UserTenantMembership" (
      "id",
      "userId",
      "tenantId",
      "status",
      "isDefault",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      'admin-default-tenant-membership',
      v_admin_user_id,
      v_admin_tenant_id,
      'ENABLED',
      TRUE,
      NOW(),
      NOW()
    )
    ON CONFLICT ("userId", "tenantId") DO UPDATE SET
      "status" = 'ENABLED',
      "isDefault" = TRUE,
      "updatedAt" = NOW();

    UPDATE "User"
    SET "tenantId" = v_admin_tenant_id,
        "status" = 'ENABLED',
        "updatedAt" = NOW()
    WHERE "id" = v_admin_user_id;
  END IF;
END $$;
