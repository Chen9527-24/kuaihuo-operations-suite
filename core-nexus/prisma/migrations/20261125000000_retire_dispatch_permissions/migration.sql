-- Keep existing assignments and business history. Only retire the removed module's
-- menu entries and stock dictionary values. Shared file upload stays on Profile.
BEGIN;

UPDATE "Permission" AS upload
SET "parentId" = profile.id, "name" = '上传文件', "sort" = 35, "updatedAt" = CURRENT_TIMESTAMP
FROM "Permission" AS profile
WHERE upload.code = 'file:upload' AND profile.code = 'menu:profile';

UPDATE "Permission"
SET status = 'DISABLED', "parentId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE code IN ('menu:daily-tasks', 'menu:distribution-groups', 'menu:app-users', 'menu:withdrawals')
   OR code LIKE 'daily-task:%'
   OR code LIKE 'distribution-group:%'
   OR code LIKE 'app-user:%'
   OR code LIKE 'withdrawal:%'
   OR code LIKE 'test-data-batch:%';

UPDATE "DictType"
SET status = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP
WHERE code IN ('daily_task_status', 'task_comment_status', 'comment_source', 'task_participant_status', 'task_settlement_status', 'dispatch_status');

UPDATE "DictItem"
SET status = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "typeCode" IN ('daily_task_status', 'task_comment_status', 'comment_source', 'task_participant_status', 'task_settlement_status', 'dispatch_status')
   OR ("typeCode" = 'file_scene' AND value IN ('TASK_COVER', 'TASK_CLAIM_PROOF', 'TASK_SETTLEMENT_PROOF'));

COMMIT;
