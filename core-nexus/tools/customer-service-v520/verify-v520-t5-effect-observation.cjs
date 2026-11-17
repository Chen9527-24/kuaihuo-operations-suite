const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
function check(name, condition) { checks.push([name, Boolean(condition)]); }

const controller = read('src/modules/customer-service-agent/admin/effect-observation/customer-service-effect-observation.controller.ts');
const service = read('src/modules/customer-service-agent/admin/effect-observation/customer-service-effect-observation.service.ts');
const dto = read('src/modules/customer-service-agent/admin/effect-observation/dto/effect-observation-query.dto.ts');
const assetsController = read('src/modules/customer-service-agent/admin/assets/customer-service-assets.controller.ts');
const assetsService = read('src/modules/customer-service-agent/admin/assets/customer-service-assets.service.ts');
const rollbackDto = read('src/modules/customer-service-agent/admin/assets/dto/rollback-asset-version.dto.ts');
const assetRepo = read('src/modules/customer-service-agent/infrastructure/persistence/customer-service-asset.repository.ts');
const moduleFile = read('src/modules/customer-service-agent/customer-service-agent.module.ts');

check('effect endpoint exists', controller.includes("@Controller({ path: 'customer-service/admin/effect-observation', version: '5' })"));
check('effect endpoint uses calibration read permission', controller.includes("@Permissions('customer-service:calibration:read')"));
check('query requires account profile', dto.includes('accountProfileId!: string'));
check('query window is bounded to 90 days', dto.includes('@Max(90)'));
check('comparison window is bounded to 30 days', dto.includes('@Max(30)'));
check('account is tenant scoped', service.includes("where: { id: query.accountProfileId, tenantId, deletedAt: null }"));
check('trace query is account scoped', service.includes('accountProfileId,') && service.includes('purgedAt: null'));
check('trace sampling is bounded', service.includes('TRACE_SAMPLE_LIMIT = 5000') && service.includes('TARGET_SAMPLE_LIMIT = 2500'));
check('sampling disclosure is returned', service.includes('currentSampled: currentLoaded.total > currentLoaded.rows.length'));
check('satisfaction uses trace level feedback', service.includes('resolveTraceFeedback(row.feedbacks)'));
check('unsatisfied wins conflicting feedback', service.includes("items.some((item) => item.feedback === 'UNSATISFIED')"));
check('quality rate only uses evaluated traces', service.includes("row.qualityStatus !== 'NOT_RUN'") && service.includes('qualityEvaluatedReplies'));
check('strategy version hits come from reply trace', service.includes('groupStrategyVersions(currentLoaded.rows)'));
check('knowledge revision reads source revision evidence', service.includes('readKnowledgeRevision(row.sourceRevisions, entryId)'));
check('target after window filters actual strategy hit', service.includes("{ strategyVersionId: version.id }"));
check('target after window filters actual knowledge revision', service.includes('readKnowledgeRevision(row.sourceRevisions, entry.id) === entry.revision'));
check('observation declares no causal proof', service.includes('不构成因果证明'));
check('low feedback does not claim success', service.includes('after.feedbackReplies < 5'));
check('effect service registered', moduleFile.includes('CustomerServiceEffectObservationController') && moduleFile.includes('CustomerServiceEffectObservationService'));
check('rollback endpoint exists', assetsController.includes("@Post(':id/versions/:versionId/rollback')"));
check('rollback keeps publish permission', assetsController.includes("@Permissions('customer-service:asset:publish')"));
check('rollback requires explicit confirmation', assetsService.includes('if (!dto.confirmRollback)') && rollbackDto.includes('confirmRollback!: boolean'));
check('rollback requires audit reason', rollbackDto.includes('@Length(3, 500)') && rollbackDto.includes('reason!: string'));
check('rollback only accepts archived target', assetsService.includes("target.status !== 'ARCHIVED'"));
check('rollback validates historical content', assetsService.includes('this.responseAssetValidator.validate'));
check('rollback uses asset optimistic lock', assetRepo.includes('asset.revision !== input.assetRevision'));
check('rollback creates a new published version', assetRepo.includes("title: `回滚至 v${target.versionNo}") && assetRepo.includes("status: 'PUBLISHED'"));
check('rollback preserves historical target', !assetRepo.includes('where: { id: target.id') && assetRepo.includes('content: target.content as Prisma.InputJsonValue'));
check('rollback archives replaced current version', assetRepo.includes("where: { id: asset.currentVersionId, assetId: asset.id, status: 'PUBLISHED' }"));
check('rollback marks prior calibration strategy superseded', assetRepo.includes("strategyDraftStatus: 'SUPERSEDED'"));
check('rollback does not add destructive schema migration', !service.includes('DROP TABLE') && !assetRepo.includes('deleteMany'));

// Execute the two exported pure functions with stubbed Nest imports.
const compiled = ts.transpileModule(service, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
const sandbox = {
  exports: {}, module: { exports: {} }, console,
  require(name) {
    if (name === '@nestjs/common') return { Injectable: () => (value) => value, NotFoundException: class extends Error {} };
    if (name.includes('tenant-scope')) return { resolveRequiredTenantId: () => 'tenant' };
    if (name.includes('prisma.service')) return { PrismaService: class {} };
    if (name.includes('effect-observation-query.dto')) return { CustomerServiceEffectObservationQueryDto: class {} };
    return {};
  },
};
sandbox.module.exports = sandbox.exports;
vm.runInNewContext(compiled, sandbox);
const { summarizeEffectTraces, buildEffectObservation } = sandbox.module.exports;
const rows = [
  { qualityStatus: 'PASSED', safetyStatus: 'PASSED', fallbackUsed: false, feedbacks: [{ feedback: 'SATISFIED' }], strategyVersionIds: [], knowledgeEntryIds: [], sourceRevisions: {}, createdAt: new Date(), id: '1' },
  { qualityStatus: 'FAILED', safetyStatus: 'PASSED', fallbackUsed: true, feedbacks: [{ feedback: 'SATISFIED' }, { feedback: 'UNSATISFIED' }], strategyVersionIds: [], knowledgeEntryIds: [], sourceRevisions: {}, createdAt: new Date(), id: '2' },
  { qualityStatus: 'NOT_RUN', safetyStatus: 'NOT_RUN', fallbackUsed: false, feedbacks: [], strategyVersionIds: [], knowledgeEntryIds: [], sourceRevisions: {}, createdAt: new Date(), id: '3' },
];
const metrics = summarizeEffectTraces(rows);
check('runtime metrics count one feedback per trace', metrics.feedbackReplies === 2);
check('runtime metrics prioritize unsatisfied feedback', metrics.satisfiedReplies === 1 && metrics.unsatisfiedReplies === 1);
check('runtime quality denominator excludes not-run', metrics.qualityEvaluatedReplies === 2 && metrics.qualityPassRate === 50);
check('runtime fallback rate is calculated', Math.abs(metrics.fallbackRate - 33.3) < 0.01);
const insufficient = buildEffectObservation(metrics, { ...metrics, feedbackReplies: 2 });
check('runtime observation blocks conclusion with low feedback', insufficient.status === 'INSUFFICIENT');

let passed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) passed++; }
console.log(`\n${passed}/${checks.length} passed`);
if (passed !== checks.length) process.exit(1);
