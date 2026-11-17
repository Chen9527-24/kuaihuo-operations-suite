-- Complete the existing admin lifecycles without widening data ownership:
-- customer-service Role deletes stay tenant-scoped, while website inquiry trash stays platform-scoped.

INSERT INTO "Permission" ("id", "parentId", "code", "name", "group", "type", "status", "sort", "createdAt", "updatedAt")
SELECT 'perm-cs-role-prototype-delete', parent."id", 'customer-service:role-prototype:delete', '删除角色原型', 'customer-service', 'BUTTON', 'ENABLED', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Permission" parent WHERE parent."code" = 'menu:customer-service-roles'
ON CONFLICT ("code") DO UPDATE SET "parentId" = EXCLUDED."parentId", "name" = EXCLUDED."name", "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Permission" ("id", "parentId", "code", "name", "group", "type", "status", "sort", "createdAt", "updatedAt")
SELECT 'perm-cs-merchant-role-delete', parent."id", 'customer-service:merchant-role:delete', '删除客服角色', 'customer-service', 'BUTTON', 'ENABLED', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Permission" parent WHERE parent."code" = 'menu:customer-service-merchant-roles'
ON CONFLICT ("code") DO UPDATE SET "parentId" = EXCLUDED."parentId", "name" = EXCLUDED."name", "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Permission" ("id", "parentId", "code", "name", "group", "type", "status", "sort", "createdAt", "updatedAt")
SELECT 'perm-website-inquiry-delete', parent."id", 'website-inquiry:delete', '移入官网客户回收站', 'website-inquiry', 'BUTTON', 'ENABLED', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Permission" parent WHERE parent."code" = 'menu:website-inquiries'
ON CONFLICT ("code") DO UPDATE SET "parentId" = EXCLUDED."parentId", "name" = EXCLUDED."name", "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Permission" ("id", "parentId", "code", "name", "group", "type", "status", "sort", "createdAt", "updatedAt")
SELECT 'perm-website-inquiry-restore', parent."id", 'website-inquiry:restore', '恢复官网意向客户', 'website-inquiry', 'BUTTON', 'ENABLED', 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Permission" parent WHERE parent."code" = 'menu:website-inquiries'
ON CONFLICT ("code") DO UPDATE SET "parentId" = EXCLUDED."parentId", "name" = EXCLUDED."name", "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Permission" ("id", "parentId", "code", "name", "group", "type", "status", "sort", "createdAt", "updatedAt")
SELECT 'perm-website-inquiry-purge', parent."id", 'website-inquiry:purge', '彻底删除官网意向客户', 'website-inquiry', 'BUTTON', 'ENABLED', 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Permission" parent WHERE parent."code" = 'menu:website-inquiries'
ON CONFLICT ("code") DO UPDATE SET "parentId" = EXCLUDED."parentId", "name" = EXCLUDED."name", "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "assignedAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'admin'
  AND permission."code" IN (
    'customer-service:role-prototype:delete',
    'customer-service:merchant-role:delete',
    'website-inquiry:delete',
    'website-inquiry:restore',
    'website-inquiry:purge'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "assignedAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'tenant_admin'
  AND permission."code" IN (
    'customer-service:role-prototype:delete',
    'customer-service:merchant-role:delete'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
