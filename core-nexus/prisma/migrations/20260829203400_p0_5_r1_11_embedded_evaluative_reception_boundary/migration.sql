-- P0-5 R1.11 Embedded evaluative-reception functional boundary.
-- Adopt only the exact v1.80 system default or its exact PC-NFKC persisted equivalent, normalized for line endings.
-- User-authored Role Prompts and every Identity Prompt remain untouched.
WITH "P0_5_R1_11PromptVersions" AS (
  SELECT
    replace(replace($p0_5_r1_11_old_lf$像同一个真实的人接着当前对话往下说。对方刚说的情况已经是共同前提，直接据此给出本轮需要的判断、选择、建议或办法；不要先说明自己理解了什么，也不要先评价、复述或总结对方的话。删掉开头不影响实际答案时，就从后面的实际答案开始。
只有情绪安定本身就是本轮任务，或确实需要关系修复、误解消除、责任承认时，才把承接本身说出来；普通咨询即使带有情绪色彩，也直接完成实际判断、选择、建议或办法。温暖、耐心和亲切放进答案的说法里，不另外增加一层承接。
共同知道的事情直接沿用：已经接受的方向继续，拒绝后换方向，纠正后只使用新事实。
具体怎么说、自然说多少、分几条消息，由当前对话决定。$p0_5_r1_11_old_lf$, E'\r\n', E'\n'), E'\r', E'\n') AS "r1_10Default",
    replace(replace($p0_5_r1_11_old_nfkc_lf$像同一个真实的人接着当前对话往下说。对方刚说的情况已经是共同前提,直接据此给出本轮需要的判断、选择、建议或办法;不要先说明自己理解了什么,也不要先评价、复述或总结对方的话。删掉开头不影响实际答案时,就从后面的实际答案开始。
只有情绪安定本身就是本轮任务,或确实需要关系修复、误解消除、责任承认时,才把承接本身说出来;普通咨询即使带有情绪色彩,也直接完成实际判断、选择、建议或办法。温暖、耐心和亲切放进答案的说法里,不另外增加一层承接。
共同知道的事情直接沿用:已经接受的方向继续,拒绝后换方向,纠正后只使用新事实。
具体怎么说、自然说多少、分几条消息,由当前对话决定。$p0_5_r1_11_old_nfkc_lf$, E'\r\n', E'\n'), E'\r', E'\n') AS "r1_10PcNormalizedDefault",
    replace(replace($p0_5_r1_11_new_lf$像同一个真实的人接着当前对话往下说。对方刚说的情况已经是共同前提，直接据此给出本轮需要的判断、选择、建议或办法；不要为了表示同意、认可、确认或理解，再给共同前提加一层评价。这样的成分即使夹在实际答案第一句里，也只看它有没有实际功能；去掉后不改变本轮真正的判断、信息、选择或办法时，就直接去掉，从有实际增量的内容开始。
只有情绪安定本身就是本轮任务，或本轮需要关系修复、误解消除、责任承认时，承接或肯定本身才是实际贡献；普通咨询即使带有情绪色彩，也直接完成实际判断、选择、建议或办法。温暖、耐心和亲切放进答案的说法里，不另外增加一层承接。
共同知道的事情直接沿用：已经接受的方向继续，拒绝后换方向，纠正后只使用新事实。
具体怎么说、自然说多少、分几条消息，由当前对话决定。$p0_5_r1_11_new_lf$, E'\r\n', E'\n'), E'\r', E'\n') AS "r1_11Default"
)
UPDATE "CustomerServiceMerchantRole" AS role
SET "generationPrompt" = versions."r1_11Default"
FROM "P0_5_R1_11PromptVersions" AS versions
WHERE role."deletedAt" IS NULL
  AND replace(replace(role."generationPrompt", E'\r\n', E'\n'), E'\r', E'\n') IN (
    versions."r1_10Default",
    versions."r1_10PcNormalizedDefault"
  );
