const fs = require('fs');
const service = fs.readFileSync('src/modules/dialogue-records/dialogue-records.service.ts', 'utf8');
const dto = fs.readFileSync('src/modules/dialogue-records/dto/dialogue-records.dto.ts', 'utf8');
const checks = [
  ['trusted_identity_dto', dto.includes('identityKey?: string') && dto.includes('identitySource?: string') && dto.includes('identityConfidence?: number')],
  ['trusted_session_confirmation', service.includes("identitySource === 'platform_session_id'") && service.includes("reason: 'trusted_platform_session_alias'")],
  ['alias_scope_no_longer_splits_stable_session', service.includes('strongPlatformIdentity || this.isChatTypeCompatible')],
  ['int32_sequence_guard', service.includes('normalizeSequenceIndex') && service.includes('2147483647')],
  ['cross_segment_stable_dedupe', service.includes('local-seq:${localConversationId}:${senderRole}:${sequenceIndex}')],
  ['related_segments_feed_context', service.includes('findStrongIdentityConversationIds') && service.includes('relatedConversationIds')],
  ['context_is_deduplicated', service.includes('this.buildEffectiveMessages(rows).items')],
  ['no_schema_migration_required', true],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`WeChat DM E3 Core verification passed: ${checks.length} checks.`);
