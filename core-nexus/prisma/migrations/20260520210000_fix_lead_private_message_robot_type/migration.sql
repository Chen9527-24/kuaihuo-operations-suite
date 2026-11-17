-- 上一版把“截流评论后的主动私信机器人”误用了 PRIVATE_MESSAGE，
-- 会和已有“私信自动回复机器人”混在一起。
-- 这里仅迁移带有 config.privateMessage 的上一版主动私信机器人，
-- 原本的私信自动回复机器人通常不会有这个配置键，因此不会被改动。
UPDATE "Robot"
SET
  "type" = 'LEAD_PRIVATE_MESSAGE',
  "config" = jsonb_set(("config"::jsonb - 'privateMessage'), '{leadPrivateMessage}', "config"::jsonb -> 'privateMessage', true)
WHERE "type" = 'PRIVATE_MESSAGE'
  AND "config" IS NOT NULL
  AND "config"::jsonb ? 'privateMessage';
