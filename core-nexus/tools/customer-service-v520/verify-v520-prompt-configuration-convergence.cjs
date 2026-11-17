#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let pass=0, fail=0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}`); } }
function syntax(rel) { const out = ts.transpileModule(read(rel), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true }, reportDiagnostics: true, fileName: rel }); return !(out.diagnostics || []).some(d => d.category === ts.DiagnosticCategory.Error); }
function loadStandaloneTsExports(rel) {
  const compiled = ts.transpileModule(read(rel), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: rel });
  const loaded = { exports: {} };
  Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
  return loaded.exports;
}
function loadPromptBuilderExports(rel, dependencies = {}) {
  const compiled = ts.transpileModule(read(rel), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
    fileName: rel,
  });
  const loaded = { exports: {} };
  const localRequire = request => {
    if (request === '@nestjs/common') return { Injectable: () => target => target };
    if (request === './customer-service-nlg-execution-brief') {
      return { compileCustomerServiceNlgSemanticFrameV1: dependencies.compileFrame || (() => ({})) };
    }
    if (request === './customer-service-final-realization-authority') {
      return { compileCustomerServiceFinalModelFacingHumanTurn: dependencies.compileHumanTurn || (() => ({})) };
    }
    throw new Error(`Unexpected verifier dependency: ${request}`);
  };
  Function('exports', 'module', 'require', compiled.outputText)(loaded.exports, loaded, localRequire);
  return loaded.exports;
}
function normalizeNewlines(value) { return String(value || '').replace(/\r\n?/g, '\n'); }
function dollarQuotedBody(sql, tag) {
  const marker = `$${tag}$`;
  const start = sql.indexOf(marker);
  const end = start < 0 ? -1 : sql.indexOf(marker, start + marker.length);
  return start < 0 || end < 0 ? null : sql.slice(start + marker.length, end);
}
const promptTemplate = read('src/modules/customer-service-agent/admin/foundation/templates/customer-service-generation-prompt.template.ts');
const aliTemplate = read('src/modules/customer-service-agent/admin/foundation/templates/customer-service-ali-flagship.template.ts');
const foundation = read('src/modules/customer-service-agent/admin/foundation/customer-service-foundation.service.ts');
const roleService = read('src/modules/customer-service-agent/admin/merchant-roles/customer-service-merchant-roles.service.ts');
const resolved = read('src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts');
const promptBuilder = read('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const migration = read('prisma/migrations/20260819185500_seed_default_role_generation_prompt/migration.sql');
const r1Migration = read('prisma/migrations/20260826143000_p0_5_r1_default_role_prompt_calibration/migration.sql');
const r1NormalizedAdoptionMigration = read('prisma/migrations/20260826203000_p0_5_r1_normalized_default_prompt_adoption/migration.sql');
const r1FunctionalAcknowledgementMigration = read('prisma/migrations/20260826223000_p0_5_r1_2_functional_acknowledgement_calibration/migration.sql');
const r1FinalImplicitUnderstandingMigration = read('prisma/migrations/20260826233000_p0_5_r1_final_implicit_understanding_calibration/migration.sql');
const r1SealAcknowledgementBoundaryMigration = read('prisma/migrations/20260827113000_p0_5_r1_seal_candidate_acknowledgement_boundary/migration.sql');
const r1AcknowledgementAuthorityExecutionMigration = read('prisma/migrations/20260828113000_p0_5_r1_3_acknowledgement_authority_execution/migration.sql');
const r1LineEndingSafeAdoptionMigration = read('prisma/migrations/20260828163000_p0_5_r1_3_line_ending_safe_adoption/migration.sql');
const r1SemanticSurfaceBoundaryMigration = read('prisma/migrations/20260828193000_p0_5_r1_4_acknowledgement_semantic_surface_boundary/migration.sql');
const r1PersonaCarrierMigration = read('prisma/migrations/20260828234500_p0_5_r1_5_persona_prompt_carrier_calibration/migration.sql');
const r1DecisionDeltaMigration = read('prisma/migrations/20260829013000_p0_5_r1_6_decision_delta_and_customer_input_execution/migration.sql');
const r1PromptConsolidationMigration = read('prisma/migrations/20260829143000_p0_5_r1_8_prompt_principle_consolidation/migration.sql');
const r1PersonaHowReductionMigration = read('prisma/migrations/20260829181500_p0_5_r1_9_persona_how_signal_reduction/migration.sql');
const r1FunctionalEmotionalBoundaryMigration = read('prisma/migrations/20260829203000_p0_5_r1_10_functional_emotional_boundary/migration.sql');
const r1EmbeddedEvaluativeReceptionMigration = read('prisma/migrations/20260829203400_p0_5_r1_11_embedded_evaluative_reception_boundary/migration.sql');
const r1GivenPremiseOwnershipMigration = read('prisma/migrations/20260829213000_p0_5_r1_12_given_premise_new_contribution_ownership_boundary/migration.sql');
const r1SocialNormalizationOwnershipMigration = read('prisma/migrations/20260830013000_p0_5_r1_13_social_normalization_ownership_boundary/migration.sql');
const r1FunctionalPrefaceDeletionMigration = read('prisma/migrations/20260830014000_p0_5_r1_14_functional_preface_deletion_boundary/migration.sql');
const kernel = read('src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts');
const currentDefaultPrompt = loadStandaloneTsExports('src/modules/customer-service-agent/admin/foundation/templates/customer-service-generation-prompt.template.ts').DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT;
const promptBuilderExports = loadPromptBuilderExports('src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts');
const ordinaryFrameProbe = {
  humanTurnRealization: {
    conversationReality: {
      authority: 'CONVERSATION_REALITY_V1',
      currentTurn: 2,
      priorConversationMessages: 2,
      exchange: { state: 'ONGOING', priorAssistantTurns: 1 },
      recentAssistantMoves: [{
        turn: 1,
        excerpt: '先复述客户，再给当前答案…',
        accepted: false,
        rejected: false,
      }],
      relevantMemories: [],
    },
    turnComposition: {
      semanticDelta: {
        responseTarget: {
          focus: 'CURRENT_REQUEST',
          requestedSpecificity: 'DIRECTION',
          requiredDelta: 'NEW_DIRECTION',
          evidence: [],
        },
      },
    },
  },
  context: {
    activeTask: null,
    summarySource: { mode: 'NONE', transformMode: 'NONE', messages: [] },
  },
  grounding: { facts: [], knowledge: [] },
  hardBoundaries: { capabilityLimits: {} },
  responseAssets: [],
  answerAuthority: { authority: 'PROJECTION_ONLY', mode: 'NO_BUSINESS_GROUNDING_REQUIRED', allowedGroundingRefs: [], currentScopeBusinessFactAllowed: false },
  serviceRealization: {
    identity: { mode: 'NONE' },
    contribution: { target: 'DIRECT_ANSWER' },
  },
  interaction: { completion: 'ALLOW_CONTINUATION' },
  identity: {
    aiIdentity: null,
    businessLabel: null,
    relationLabel: null,
    publicName: null,
    surfaceLabel: null,
    allowedSurfaceLabels: [],
    serviceScope: null,
  },
};

const personaSurfaceProfileProbe = {
  authority: 'STRUCTURED_PERSONA_SURFACE_ONLY_V1',
  source: 'ROLE_SPEAKER_PROJECTION',
  directness: 60,
  formality: 45,
  energy: 50,
  colloquiality: 'MEDIUM',
  sentenceShape: 'MIXED',
  fragmentTolerance: 'MEDIUM',
  ellipsisTolerance: 'LOW',
  rhythmVariation: 'MEDIUM',
  emoji: 'LIGHT',
  sentenceParticleLevel: 'LOW',
};

const ordinaryHumanTurnProbe = {
  schemaVersion: 1,
  authority: 'FINAL_MODEL_FACING_HUMAN_TURN_V1',
  realization: {
    authority: 'EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY',
    canonicalPlan: {
      source: 'EXISTING_CANONICAL_INTERACTION_PLAN',
      requiredActs: [{ type: 'DIRECT_ANSWER', semantic: 'Answer the current request.', authorityScope: 'PLAN_ONLY' }],
      preferredActs: [],
      optionalActs: [],
      forbiddenActs: [],
      completion: 'ALLOW_CONTINUATION',
    },
    selectedComponents: {
      identity: { selected: false, mode: 'NONE' },
      customerInput: {
        selected: false,
        disposition: 'NONE',
        completionDependency: 'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN',
      },
    },
  },
  surface: {
    authority: 'FINAL_HUMAN_TURN_SURFACE_V1',
    relationshipContext: { distance: 'WARM' },
    generationGuidance: {
      authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1',
      role: 'ROLE_PROMPT_MAIN_PATH_PROBE',
      identity: 'IDENTITY_PROMPT_MAIN_PATH_PROBE',
      surfaceProfile: personaSurfaceProfileProbe,
      semanticAuthority: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
    },
  },
};
const promptBuilderMainPathExports = loadPromptBuilderExports(
  'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  {
    compileFrame: () => ordinaryFrameProbe,
    compileHumanTurn: () => ordinaryHumanTurnProbe,
  },
);
const legacyDefaultPrompt = migration.match(/SET "generationPrompt" = '([\s\S]*?)'\r?\nWHERE/)?.[1]?.replace(/''/g, "'");
const r1OldDefaultPrompt = dollarQuotedBody(r1Migration, 'p0_5_r1_old');
const r1NewDefaultPrompt = dollarQuotedBody(r1Migration, 'p0_5_r1_new');
const r1NormalizedOldDefaultPrompt = dollarQuotedBody(r1NormalizedAdoptionMigration, 'p0_5_r1_nfkc_old');
const r1NormalizedNewDefaultPrompt = dollarQuotedBody(r1NormalizedAdoptionMigration, 'p0_5_r1_nfkc_new');
const r1FunctionalOldDefaultPrompt = dollarQuotedBody(r1FunctionalAcknowledgementMigration, 'p0_5_r1_2_old');
const r1FunctionalNewDefaultPrompt = dollarQuotedBody(r1FunctionalAcknowledgementMigration, 'p0_5_r1_2_new');
const r1FunctionalNfkcOldDefaultPrompt = dollarQuotedBody(r1FunctionalAcknowledgementMigration, 'p0_5_r1_2_nfkc_old');
const r1FunctionalNfkcNewDefaultPrompt = dollarQuotedBody(r1FunctionalAcknowledgementMigration, 'p0_5_r1_2_nfkc_new');
const r1FinalOldDefaultPrompt = dollarQuotedBody(r1FinalImplicitUnderstandingMigration, 'p0_5_r1_final_old');
const r1FinalNewDefaultPrompt = dollarQuotedBody(r1FinalImplicitUnderstandingMigration, 'p0_5_r1_final_new');
const r1FinalNfkcOldDefaultPrompt = dollarQuotedBody(r1FinalImplicitUnderstandingMigration, 'p0_5_r1_final_nfkc_old');
const r1FinalNfkcNewDefaultPrompt = dollarQuotedBody(r1FinalImplicitUnderstandingMigration, 'p0_5_r1_final_nfkc_new');
const r1SealOldDefaultPrompt = dollarQuotedBody(r1SealAcknowledgementBoundaryMigration, 'p0_5_r1_seal_old');
const r1SealNewDefaultPrompt = dollarQuotedBody(r1SealAcknowledgementBoundaryMigration, 'p0_5_r1_seal_new');
const r1SealNfkcOldDefaultPrompt = dollarQuotedBody(r1SealAcknowledgementBoundaryMigration, 'p0_5_r1_seal_nfkc_old');
const r1SealNfkcNewDefaultPrompt = dollarQuotedBody(r1SealAcknowledgementBoundaryMigration, 'p0_5_r1_seal_nfkc_new');
const r1AuthorityOldDefaultPrompt = dollarQuotedBody(r1AcknowledgementAuthorityExecutionMigration, 'p0_5_r1_3_old');
const r1AuthorityNewDefaultPrompt = dollarQuotedBody(r1AcknowledgementAuthorityExecutionMigration, 'p0_5_r1_3_new');
const r1AuthorityNfkcOldDefaultPrompt = dollarQuotedBody(r1AcknowledgementAuthorityExecutionMigration, 'p0_5_r1_3_nfkc_old');
const r1AuthorityNfkcNewDefaultPrompt = dollarQuotedBody(r1AcknowledgementAuthorityExecutionMigration, 'p0_5_r1_3_nfkc_new');
const r1LineSafeFinalDefaultPrompt = dollarQuotedBody(r1LineEndingSafeAdoptionMigration, 'p0_5_r1_final_lf');
const r1LineSafeFinalNfkcDefaultPrompt = dollarQuotedBody(r1LineEndingSafeAdoptionMigration, 'p0_5_r1_final_nfkc_lf');
const r1LineSafeSealDefaultPrompt = dollarQuotedBody(r1LineEndingSafeAdoptionMigration, 'p0_5_r1_seal_lf');
const r1LineSafeSealNfkcDefaultPrompt = dollarQuotedBody(r1LineEndingSafeAdoptionMigration, 'p0_5_r1_seal_nfkc_lf');
const r1LineSafeCurrentDefaultPrompt = dollarQuotedBody(r1LineEndingSafeAdoptionMigration, 'p0_5_r1_3_lf');
const r1SemanticSurfaceOldDefaultPrompt = dollarQuotedBody(r1SemanticSurfaceBoundaryMigration, 'p0_5_r1_4_old_lf');
const r1SemanticSurfaceNewDefaultPrompt = dollarQuotedBody(r1SemanticSurfaceBoundaryMigration, 'p0_5_r1_4_new_lf');
const r1PersonaCarrierOldDefaultPrompt = dollarQuotedBody(r1PersonaCarrierMigration, 'p0_5_r1_5_old_lf');
const r1PersonaCarrierNewDefaultPrompt = dollarQuotedBody(r1PersonaCarrierMigration, 'p0_5_r1_5_new_lf');
const r1DecisionDeltaOldDefaultPrompt = dollarQuotedBody(r1DecisionDeltaMigration, 'p0_5_r1_6_old_lf');
const r1DecisionDeltaNewDefaultPrompt = dollarQuotedBody(r1DecisionDeltaMigration, 'p0_5_r1_6_new_lf');
const r1PromptConsolidationOldDefaultPrompt = dollarQuotedBody(r1PromptConsolidationMigration, 'p0_5_r1_8_old_lf');
const r1PromptConsolidationNewDefaultPrompt = dollarQuotedBody(r1PromptConsolidationMigration, 'p0_5_r1_8_new_lf');
const r1PersonaHowReductionOldDefaultPrompt = dollarQuotedBody(r1PersonaHowReductionMigration, 'p0_5_r1_9_old_lf');
const r1PersonaHowReductionOldNfkcDefaultPrompt = dollarQuotedBody(r1PersonaHowReductionMigration, 'p0_5_r1_9_old_nfkc_lf');
const r1PersonaHowReductionNewDefaultPrompt = dollarQuotedBody(r1PersonaHowReductionMigration, 'p0_5_r1_9_new_lf');
const r1FunctionalEmotionalBoundaryOldDefaultPrompt = dollarQuotedBody(r1FunctionalEmotionalBoundaryMigration, 'p0_5_r1_10_old_lf');
const r1FunctionalEmotionalBoundaryNewDefaultPrompt = dollarQuotedBody(r1FunctionalEmotionalBoundaryMigration, 'p0_5_r1_10_new_lf');
const r1EmbeddedEvaluativeReceptionOldDefaultPrompt = dollarQuotedBody(r1EmbeddedEvaluativeReceptionMigration, 'p0_5_r1_11_old_lf');
const r1EmbeddedEvaluativeReceptionOldNfkcDefaultPrompt = dollarQuotedBody(r1EmbeddedEvaluativeReceptionMigration, 'p0_5_r1_11_old_nfkc_lf');
const r1EmbeddedEvaluativeReceptionNewDefaultPrompt = dollarQuotedBody(r1EmbeddedEvaluativeReceptionMigration, 'p0_5_r1_11_new_lf');
const r1GivenPremiseOwnershipOldDefaultPrompt = dollarQuotedBody(r1GivenPremiseOwnershipMigration, 'p0_5_r1_12_old_lf');
const r1GivenPremiseOwnershipOldNfkcDefaultPrompt = dollarQuotedBody(r1GivenPremiseOwnershipMigration, 'p0_5_r1_12_old_nfkc_lf');
const r1GivenPremiseOwnershipNewDefaultPrompt = dollarQuotedBody(r1GivenPremiseOwnershipMigration, 'p0_5_r1_12_new_lf');
const r1SocialNormalizationOwnershipOldDefaultPrompt = dollarQuotedBody(r1SocialNormalizationOwnershipMigration, 'p0_5_r1_13_old_lf');
const r1SocialNormalizationOwnershipOldNfkcDefaultPrompt = dollarQuotedBody(r1SocialNormalizationOwnershipMigration, 'p0_5_r1_13_old_nfkc_lf');
const r1SocialNormalizationOwnershipNewDefaultPrompt = dollarQuotedBody(r1SocialNormalizationOwnershipMigration, 'p0_5_r1_13_new_lf');
const r1FunctionalPrefaceDeletionOldDefaultPrompt = dollarQuotedBody(r1FunctionalPrefaceDeletionMigration, 'p0_5_r1_14_old_lf');
const r1FunctionalPrefaceDeletionOldNfkcDefaultPrompt = dollarQuotedBody(r1FunctionalPrefaceDeletionMigration, 'p0_5_r1_14_old_nfkc_lf');
const r1FunctionalPrefaceDeletionNewDefaultPrompt = dollarQuotedBody(r1FunctionalPrefaceDeletionMigration, 'p0_5_r1_14_new_lf');
check('System-recommended default Role Prompt is explicit seed/configuration data', promptTemplate.includes('System-recommended editable generation guidance') && promptTemplate.includes('seed/configuration data only'));
check('P0-5 R1.12 Role Prompt separates customer-owned premises from new contribution before realization', promptTemplate.includes('先分清什么是共同前提，什么是本轮新增贡献') && promptTemplate.includes('本轮或前文已经给出的事实、限制、观察、偏好、决定和已接受方向') && promptTemplate.includes('只作为推理前提使用'));
check('P0-5 R1.12 makes customer-owned premises implicit by default', promptTemplate.includes('默认不重新声明') && promptTemplate.includes('不要因为同意、认可、确认、理解或加强语气') && promptTemplate.includes('把它包装成自己的判断'));
check('P0-5 R1.12 allows only semantically necessary premise restatement', promptTemplate.includes('省略会造成指代不清、条件范围错误') && promptTemplate.includes('本轮需要确认、纠正、质疑的对象') && promptTemplate.includes('最小必要表达'));
check('P0-5 R1.12 preserves confidence and degree for genuinely new model-owned judgments', promptTemplate.includes('真正由你本轮新增的判断、信息、选择、风险或办法') && promptTemplate.includes('自然表达确定程度') && promptTemplate.includes('直接从实际增量开始'));
check('P0-5 R1.12 preserves genuine emotional and relational contribution', promptTemplate.includes('只有情绪安定本身就是本轮任务') && promptTemplate.includes('关系修复、误解消除、责任承认时') && promptTemplate.includes('承接或肯定本身才是实际贡献'));
check('P0-5 R1.12 does not equate emotional wording with an emotional-support task', promptTemplate.includes('普通咨询即使带有情绪色彩，也直接完成实际判断、选择、建议或办法'));
check('P0-5 R1.12 keeps Persona warmth inside the answer instead of creating a reception layer', promptTemplate.includes('温暖、耐心和亲切放进答案的说法里') && promptTemplate.includes('不另外增加一层承接'));
check('P0-5 R1.12 keeps shared reality and correction continuity concise', promptTemplate.includes('共同知道的事情直接沿用') && promptTemplate.includes('拒绝后换方向') && promptTemplate.includes('纠正后只使用新事实'));
check('P0-5 R1.13 prevents social normalization from becoming fake new contribution', promptTemplate.includes('安抚、拉近关系或完成社交性承接') && promptTemplate.includes('普遍性、正常性或合理性判断'));
check('P0-5 R1.13 preserves prevalence or normality judgment when it is itself needed information', promptTemplate.includes('这类普遍性/正常性判断本身就是当前问题所需的新信息'));
check('P0-5 R1.14 restores a position-independent functional deletion test', promptTemplate.includes('任何成分都只看它在本轮的实际功能') && promptTemplate.includes('如果去掉后不改变本轮真正的判断、信息、选择、风险或办法'));
check('P0-5 R1.14 keeps authorized emotional/relationship work as the only non-answer exception', promptTemplate.includes('也不承担下一条明确允许的情绪或关系任务') && promptTemplate.includes('直接从实际增量开始')); 
check('Default Prompt delegates wording, natural amount and message count to the model', promptTemplate.includes('具体怎么说、自然说多少、分几条消息，由当前对话决定'));
check('Default Role Prompt contains Persona HOW only, not duplicated system WHAT/protocol prose', !/(Policy|Service Boundary|HumanTurn|server-owned truth|输出协议|权限|业务流程|真实执行)/.test(promptTemplate));
check('Default Prompt contains no role/domain/test-sentence branch', !/(碎花裙|咬沙发|柯基|女装客服|SaaS客服|外卖员|护肤|美妆)/.test(promptTemplate));
check('System recommended Role receives the same default Prompt through persisted configuration', aliTemplate.includes('generationPrompt: DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT'));
check('Creating any Role without a custom Prompt receives the recommended default', roleService.includes('normalizePromptText(dto.generationPrompt) || DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT'));
check('Explicitly clearing a Role Prompt resets to recommended default instead of hidden Runtime fallback', roleService.includes("dto.generationPrompt !== undefined") && roleService.includes('DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT'));
check('Foundation sync fills only a missing Prompt and preserves user-authored Prompt', foundation.includes("...(role.generationPrompt ? {} : { generationPrompt: ALI_FLAGSHIP_ROLE.generationPrompt })"));
check('Migration seeds only missing/blank Prompt values and does not overwrite authored values', migration.includes('generationPrompt" IS NULL') && migration.includes('btrim("generationPrompt") =') && !/SET "generationPrompt"[\s\S]+WHERE "deletedAt" IS NULL\s*;/.test(migration));
check('P0-5 R1 migration upgrades only blank or exact legacy system-default Role Prompts', r1Migration.includes('"generationPrompt" IS NULL') && r1Migration.includes('btrim("generationPrompt") =') && r1Migration.includes('OR "generationPrompt" = $p0_5_r1_old$') && !/WHERE "deletedAt" IS NULL\s*;/.test(r1Migration));
check('P0-5 R1 migration preserves Identity Prompt and user-authored Role Prompt scope', !r1Migration.includes('CustomerServiceAccountProfile') && !r1Migration.includes('AccountProfile') && r1Migration.includes('Only blank values or the exact previous system default are eligible'));
check('P0-5 R1 migration and source publish the same calibrated principles', r1Migration.includes('先交付本轮最有用的新贡献') && r1Migration.includes('当作安静背景使用') && r1Migration.includes('不对用户本人、担心或判断做例行评价'));
check('P0-5 R1 migration exact-match guard equals the previously persisted system default', normalizeNewlines(r1OldDefaultPrompt) === normalizeNewlines(legacyDefaultPrompt));
check('P0-5 R1 original and NFKC-adoption migrations publish the same R1 default', normalizeNewlines(r1NewDefaultPrompt) === normalizeNewlines(r1NormalizedNewDefaultPrompt));
check('P0-5 R1 follow-up guard exactly equals the system-normalized legacy default', normalizeNewlines(r1NormalizedOldDefaultPrompt) === normalizeNewlines(legacyDefaultPrompt).normalize('NFKC'));
check('P0-5 R1 follow-up touches only exact normalized Role default and never Identity/custom text', r1NormalizedAdoptionMigration.includes('AND "generationPrompt" = $p0_5_r1_nfkc_old$') && !r1NormalizedAdoptionMigration.includes('generationPrompt" IS NULL') && !r1NormalizedAdoptionMigration.includes('btrim("generationPrompt")') && !r1NormalizedAdoptionMigration.includes('AccountProfile'));
check('P0-5 R1.2 exact guard equals the previously published R1 default', normalizeNewlines(r1FunctionalOldDefaultPrompt) === normalizeNewlines(r1NewDefaultPrompt));
check('P0-5 R1.2 NFKC guard equals the normalized R1 default', normalizeNewlines(r1FunctionalNfkcOldDefaultPrompt) === normalizeNewlines(r1NewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.2 fullwidth and NFKC paths publish the same prior default', normalizeNewlines(r1FunctionalNewDefaultPrompt) === normalizeNewlines(r1FunctionalNfkcNewDefaultPrompt));
check('P0-5 R1.2 touches only exact Role defaults and never Identity/custom text', r1FunctionalAcknowledgementMigration.includes('AND "generationPrompt" = $p0_5_r1_2_old$') && r1FunctionalAcknowledgementMigration.includes('AND "generationPrompt" = $p0_5_r1_2_nfkc_old$') && !r1FunctionalAcknowledgementMigration.includes('generationPrompt" IS NULL') && !r1FunctionalAcknowledgementMigration.includes('btrim("generationPrompt")') && !r1FunctionalAcknowledgementMigration.includes('AccountProfile'));
check('P0-5 R1 Final exact guard equals the previously published R1.2 default', normalizeNewlines(r1FinalOldDefaultPrompt) === normalizeNewlines(r1FunctionalNewDefaultPrompt));
check('P0-5 R1 Final NFKC guard equals the normalized R1.2 default', normalizeNewlines(r1FinalNfkcOldDefaultPrompt) === normalizeNewlines(r1FunctionalNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1 Final fullwidth and NFKC paths publish the same prior default', normalizeNewlines(r1FinalNewDefaultPrompt) === normalizeNewlines(r1FinalNfkcNewDefaultPrompt));
check('P0-5 R1 Final touches only exact Role defaults and never Identity/custom text', r1FinalImplicitUnderstandingMigration.includes('AND "generationPrompt" = $p0_5_r1_final_old$') && r1FinalImplicitUnderstandingMigration.includes('AND "generationPrompt" = $p0_5_r1_final_nfkc_old$') && !r1FinalImplicitUnderstandingMigration.includes('generationPrompt" IS NULL') && !r1FinalImplicitUnderstandingMigration.includes('btrim("generationPrompt")') && !r1FinalImplicitUnderstandingMigration.includes('AccountProfile'));
check('P0-5 R1 Seal Candidate exact guard equals the previously published R1 Final default', normalizeNewlines(r1SealOldDefaultPrompt) === normalizeNewlines(r1FinalNewDefaultPrompt));
check('P0-5 R1 Seal Candidate NFKC guard equals the normalized R1 Final default', normalizeNewlines(r1SealNfkcOldDefaultPrompt) === normalizeNewlines(r1FinalNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1 Seal Candidate fullwidth and NFKC paths publish the same prior default', normalizeNewlines(r1SealNewDefaultPrompt) === normalizeNewlines(r1SealNfkcNewDefaultPrompt));
check('P0-5 R1 Seal Candidate write value becomes the exact R1.3 migration guard', normalizeNewlines(r1SealNewDefaultPrompt) === normalizeNewlines(r1AuthorityOldDefaultPrompt));
check('P0-5 R1 Seal Candidate touches only exact Role defaults and never Identity/custom text', r1SealAcknowledgementBoundaryMigration.includes('AND "generationPrompt" = $p0_5_r1_seal_old$') && r1SealAcknowledgementBoundaryMigration.includes('AND "generationPrompt" = $p0_5_r1_seal_nfkc_old$') && !r1SealAcknowledgementBoundaryMigration.includes('generationPrompt" IS NULL') && !r1SealAcknowledgementBoundaryMigration.includes('btrim("generationPrompt")') && !r1SealAcknowledgementBoundaryMigration.includes('AccountProfile'));
check('P0-5 R1.3 exact guard equals the previously published Seal Candidate default', normalizeNewlines(r1AuthorityOldDefaultPrompt) === normalizeNewlines(r1SealNewDefaultPrompt));
check('P0-5 R1.3 NFKC guard equals the normalized Seal Candidate default', normalizeNewlines(r1AuthorityNfkcOldDefaultPrompt) === normalizeNewlines(r1SealNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.3 fullwidth write value becomes the exact R1.4 migration guard', normalizeNewlines(r1AuthorityNewDefaultPrompt) === normalizeNewlines(r1SemanticSurfaceOldDefaultPrompt));
check('P0-5 R1.3 NFKC adoption becomes the exact R1.4 migration guard', normalizeNewlines(r1AuthorityNfkcNewDefaultPrompt) === normalizeNewlines(r1SemanticSurfaceOldDefaultPrompt));
check('P0-5 R1.3 touches only exact Role defaults and never Identity/custom text', r1AcknowledgementAuthorityExecutionMigration.includes('AND "generationPrompt" = $p0_5_r1_3_old$') && r1AcknowledgementAuthorityExecutionMigration.includes('AND "generationPrompt" = $p0_5_r1_3_nfkc_old$') && !r1AcknowledgementAuthorityExecutionMigration.includes('generationPrompt" IS NULL') && !r1AcknowledgementAuthorityExecutionMigration.includes('btrim("generationPrompt")') && !r1AcknowledgementAuthorityExecutionMigration.includes('AccountProfile'));
check('P0-5 R1.3 line-safe adoption recognizes the exact R1 Final default after newline normalization', normalizeNewlines(r1LineSafeFinalDefaultPrompt) === normalizeNewlines(r1SealOldDefaultPrompt));
check('P0-5 R1.3 line-safe adoption recognizes the exact NFKC R1 Final default after newline normalization', normalizeNewlines(r1LineSafeFinalNfkcDefaultPrompt) === normalizeNewlines(r1SealOldDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.3 line-safe adoption recognizes the exact Seal Candidate default after newline normalization', normalizeNewlines(r1LineSafeSealDefaultPrompt) === normalizeNewlines(r1AuthorityOldDefaultPrompt));
check('P0-5 R1.3 line-safe adoption recognizes the exact NFKC Seal Candidate default after newline normalization', normalizeNewlines(r1LineSafeSealNfkcDefaultPrompt) === normalizeNewlines(r1AuthorityOldDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.3 line-safe adoption writes the exact R1.4 migration guard', normalizeNewlines(r1LineSafeCurrentDefaultPrompt) === normalizeNewlines(r1SemanticSurfaceOldDefaultPrompt));
check('P0-5 R1.3 line-safe adoption normalizes both stored value and exact migration constants', r1LineEndingSafeAdoptionMigration.includes('replace(replace(role."generationPrompt", E\'\\r\\n\', E\'\\n\'), E\'\\r\', E\'\\n\') IN') && (r1LineEndingSafeAdoptionMigration.match(/replace\(replace\(\$p0_5_/g) || []).length === 5);
check('P0-5 R1.3 line-safe adoption is full-value equality only and never broad/custom/Identity adoption', r1LineEndingSafeAdoptionMigration.includes(' IN (') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1LineEndingSafeAdoptionMigration) && !r1LineEndingSafeAdoptionMigration.includes('generationPrompt" IS NULL') && !r1LineEndingSafeAdoptionMigration.includes('AccountProfile'));
check('P0-5 R1.3 line-safe matcher accepts an LF-persisted system default', normalizeNewlines(normalizeNewlines(r1SealOldDefaultPrompt)) === normalizeNewlines(r1LineSafeFinalDefaultPrompt));
check('P0-5 R1.3 line-safe matcher rejects user-authored Prompt text', ![
  r1LineSafeFinalDefaultPrompt,
  r1LineSafeFinalNfkcDefaultPrompt,
  r1LineSafeSealDefaultPrompt,
  r1LineSafeSealNfkcDefaultPrompt,
].map(normalizeNewlines).includes(normalizeNewlines('这是商家自己编写的角色表达配置。')));
check('P0-5 R1.4 migration write value becomes the exact R1.5 migration guard', normalizeNewlines(r1SemanticSurfaceNewDefaultPrompt) === normalizeNewlines(r1PersonaCarrierOldDefaultPrompt));
check('P0-5 R1.4 migration upgrades only the exact newline-normalized R1.3 default', r1SemanticSurfaceBoundaryMigration.includes('= versions."r1_3Default"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1SemanticSurfaceBoundaryMigration));
check('P0-5 R1.4 migration preserves user Role text and every Identity Prompt', !r1SemanticSurfaceBoundaryMigration.includes('generationPrompt" IS NULL') && !r1SemanticSurfaceBoundaryMigration.includes('AccountProfile'));
check('P0-5 R1.5 exact guard equals the previously published R1.4 default', normalizeNewlines(r1PersonaCarrierOldDefaultPrompt) === normalizeNewlines(r1SemanticSurfaceNewDefaultPrompt));
check('P0-5 R1.5 write value becomes the exact R1.6 migration guard', normalizeNewlines(r1PersonaCarrierNewDefaultPrompt) === normalizeNewlines(r1DecisionDeltaOldDefaultPrompt));
check('P0-5 R1.5 migration upgrades only the exact newline-normalized R1.4 default', r1PersonaCarrierMigration.includes('= versions."r1_4Default"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1PersonaCarrierMigration));
check('P0-5 R1.5 migration preserves user Role text and every Identity Prompt', !r1PersonaCarrierMigration.includes('generationPrompt" IS NULL') && !r1PersonaCarrierMigration.includes('AccountProfile'));
check('P0-5 R1.6 exact guard equals the previously published R1.5 default', normalizeNewlines(r1DecisionDeltaOldDefaultPrompt) === normalizeNewlines(r1PersonaCarrierNewDefaultPrompt));
check('P0-5 R1.6 write value becomes the exact R1.8 migration guard', normalizeNewlines(r1DecisionDeltaNewDefaultPrompt) === normalizeNewlines(r1PromptConsolidationOldDefaultPrompt));
check('P0-5 R1.6 migration upgrades only the exact newline-normalized R1.5 default', r1DecisionDeltaMigration.includes('= versions."r1_5Default"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1DecisionDeltaMigration));
check('P0-5 R1.6 migration preserves user Role text and every Identity Prompt', !r1DecisionDeltaMigration.includes('generationPrompt" IS NULL') && !r1DecisionDeltaMigration.includes('AccountProfile'));
check('P0-5 R1.8 migration write value becomes the exact R1.9 migration guard', normalizeNewlines(r1PromptConsolidationNewDefaultPrompt) === normalizeNewlines(r1PersonaHowReductionOldDefaultPrompt));
check('P0-5 R1.8 reduces rather than expands its prior system-default Prompt', r1PromptConsolidationNewDefaultPrompt.length < r1PromptConsolidationOldDefaultPrompt.length);
check('P0-5 R1.8 migration upgrades only the exact newline-normalized R1.6 default', r1PromptConsolidationMigration.includes('= versions."r1_6Default"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1PromptConsolidationMigration));
check('P0-5 R1.8 migration preserves user Role text and every Identity Prompt', !r1PromptConsolidationMigration.includes('generationPrompt" IS NULL') && !r1PromptConsolidationMigration.includes('AccountProfile'));
check('P0-5 R1.9 NFKC guard equals the exact PC-normalized v1.78 default', normalizeNewlines(r1PersonaHowReductionOldNfkcDefaultPrompt) === normalizeNewlines(r1PromptConsolidationNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.9 migration write becomes the exact R1.10 migration guard', normalizeNewlines(r1PersonaHowReductionNewDefaultPrompt) === normalizeNewlines(r1FunctionalEmotionalBoundaryOldDefaultPrompt));
check('P0-5 R1.9 reduces the Persona Prompt signal instead of expanding rules', r1PersonaHowReductionNewDefaultPrompt.length < r1PersonaHowReductionOldDefaultPrompt.length);
check('P0-5 R1.9 adopts only exact newline-normalized v1.78 defaults', r1PersonaHowReductionMigration.includes(' IN (') && r1PersonaHowReductionMigration.includes('versions."r1_8Default"') && r1PersonaHowReductionMigration.includes('versions."r1_8PcNormalizedDefault"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1PersonaHowReductionMigration));
check('P0-5 R1.9 migration preserves user Role text and every Identity Prompt', !r1PersonaHowReductionMigration.includes('generationPrompt" IS NULL') && !r1PersonaHowReductionMigration.includes('AccountProfile'));
check('P0-5 R1.10 migration write becomes the exact R1.11 migration guard', normalizeNewlines(r1FunctionalEmotionalBoundaryNewDefaultPrompt) === normalizeNewlines(r1EmbeddedEvaluativeReceptionOldDefaultPrompt));
check('P0-5 R1.10 replaces the broad emotional-response exception inside the same Prompt owner', r1FunctionalEmotionalBoundaryOldDefaultPrompt.includes('确实需要情绪回应') && r1FunctionalEmotionalBoundaryNewDefaultPrompt.includes('只有情绪安定本身就是本轮任务') && !r1FunctionalEmotionalBoundaryNewDefaultPrompt.includes('确实需要情绪回应'));
check('P0-5 R1.10 adoption is exact newline-normalized v1.79 default only', r1FunctionalEmotionalBoundaryMigration.includes('= versions."r1_9Default"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1FunctionalEmotionalBoundaryMigration));
check('P0-5 R1.10 migration preserves user Role text and every Identity Prompt', !r1FunctionalEmotionalBoundaryMigration.includes('generationPrompt" IS NULL') && !r1FunctionalEmotionalBoundaryMigration.includes('AccountProfile'));
check('P0-5 R1.11 exact guard equals the published v1.80 default', normalizeNewlines(r1EmbeddedEvaluativeReceptionOldDefaultPrompt) === normalizeNewlines(r1FunctionalEmotionalBoundaryNewDefaultPrompt));
check('P0-5 R1.11 NFKC guard equals the exact PC-normalized v1.80 default', normalizeNewlines(r1EmbeddedEvaluativeReceptionOldNfkcDefaultPrompt) === normalizeNewlines(r1FunctionalEmotionalBoundaryNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.11 migration write becomes the exact R1.12 migration guard', normalizeNewlines(r1EmbeddedEvaluativeReceptionNewDefaultPrompt) === normalizeNewlines(r1GivenPremiseOwnershipOldDefaultPrompt));
check('P0-5 R1.11 adoption is exact full-value Role default only', r1EmbeddedEvaluativeReceptionMigration.includes(' IN (') && r1EmbeddedEvaluativeReceptionMigration.includes('versions."r1_10Default"') && r1EmbeddedEvaluativeReceptionMigration.includes('versions."r1_10PcNormalizedDefault"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1EmbeddedEvaluativeReceptionMigration));
check('P0-5 R1.11 migration preserves user Role text and every Identity Prompt', !r1EmbeddedEvaluativeReceptionMigration.includes('generationPrompt" IS NULL') && !r1EmbeddedEvaluativeReceptionMigration.includes('AccountProfile'));
check('P0-5 R1.12 exact guard equals the published v1.83 default', normalizeNewlines(r1GivenPremiseOwnershipOldDefaultPrompt) === normalizeNewlines(r1EmbeddedEvaluativeReceptionNewDefaultPrompt));
check('P0-5 R1.12 NFKC guard equals the exact PC-normalized v1.83 default', normalizeNewlines(r1GivenPremiseOwnershipOldNfkcDefaultPrompt) === normalizeNewlines(r1EmbeddedEvaluativeReceptionNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.12 migration write becomes the exact R1.13 migration guard', normalizeNewlines(r1GivenPremiseOwnershipNewDefaultPrompt) === normalizeNewlines(r1SocialNormalizationOwnershipOldDefaultPrompt));
check('P0-5 R1.13 NFKC guard equals the exact PC-normalized v1.84/v1.85 default', normalizeNewlines(r1SocialNormalizationOwnershipOldNfkcDefaultPrompt) === normalizeNewlines(r1GivenPremiseOwnershipNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.13 migration write becomes the exact R1.14 migration guard', normalizeNewlines(r1SocialNormalizationOwnershipNewDefaultPrompt) === normalizeNewlines(r1FunctionalPrefaceDeletionOldDefaultPrompt));
check('P0-5 R1.14 NFKC guard equals the exact PC-normalized R1.13 default', normalizeNewlines(r1FunctionalPrefaceDeletionOldNfkcDefaultPrompt) === normalizeNewlines(r1SocialNormalizationOwnershipNewDefaultPrompt).normalize('NFKC'));
check('P0-5 R1.14 migration writes the exact current source default', normalizeNewlines(r1FunctionalPrefaceDeletionNewDefaultPrompt) === normalizeNewlines(currentDefaultPrompt));
check('P0-5 R1.14 adoption is exact full-value Role default only', r1FunctionalPrefaceDeletionMigration.includes(' IN (') && r1FunctionalPrefaceDeletionMigration.includes('versions."r1_13Default"') && r1FunctionalPrefaceDeletionMigration.includes('versions."r1_13PcNormalizedDefault"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1FunctionalPrefaceDeletionMigration));
check('P0-5 R1.14 migration preserves user Role text and every Identity Prompt', !r1FunctionalPrefaceDeletionMigration.includes('generationPrompt" IS NULL') && !r1FunctionalPrefaceDeletionMigration.includes('AccountProfile')); 
check('P0-5 R1.13 adoption is exact full-value Role default only', r1SocialNormalizationOwnershipMigration.includes(' IN (') && r1SocialNormalizationOwnershipMigration.includes('versions."r1_12Default"') && r1SocialNormalizationOwnershipMigration.includes('versions."r1_12PcNormalizedDefault"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1SocialNormalizationOwnershipMigration));
check('P0-5 R1.13 migration preserves user Role text and every Identity Prompt', !r1SocialNormalizationOwnershipMigration.includes('generationPrompt" IS NULL') && !r1SocialNormalizationOwnershipMigration.includes('AccountProfile'));
check('P0-5 R1.12 adoption is exact full-value Role default only', r1GivenPremiseOwnershipMigration.includes(' IN (') && r1GivenPremiseOwnershipMigration.includes('versions."r1_11Default"') && r1GivenPremiseOwnershipMigration.includes('versions."r1_11PcNormalizedDefault"') && !/\bLIKE\b|~\*?|btrim\s*\(/i.test(r1GivenPremiseOwnershipMigration));
check('P0-5 R1.12 migration preserves user Role text and every Identity Prompt', !r1GivenPremiseOwnershipMigration.includes('generationPrompt" IS NULL') && !r1GivenPremiseOwnershipMigration.includes('AccountProfile'));
check('P0-5 R1.12 remains semantic rather than lexical or observed-sample policy', !/(确实该|完全理解|广州热的话确实|肩膀宽的话|伸缩绳确实|关键词|黑名单)/.test(promptTemplate));
check('P0-5 R1.13 remains semantic rather than phrase-list policy', !/(这种情况确实很常见|这个担心很常见|广州夏天穿长裤|米白色确实|塞衣角确实|词表|短语表)/.test(promptTemplate));
check('P0-5 R1.14 remains functional rather than observed-word/frequency policy', !/(词频|频率|黑名单|关键词|词表|短语表|固定措辞)/.test(promptTemplate));
check('Role Prompt persistence preserves authored Unicode instead of silently applying NFKC', roleService.includes('return value?.trim() || null;') && !roleService.includes("value?.normalize('NFKC')"));
check('Runtime consumes persisted Role/Identity Prompt chain rather than seed constant', resolved.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && !promptBuilder.includes('DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT'));
check('Runtime no longer authors an acknowledgement true/false execution branch', !promptBuilder.includes('compileCustomerServiceAcknowledgementExecutionContract') && !promptBuilder.includes('【本轮承接执行】') && !promptBuilder.includes('acknowledgementSelection'));
check('Runtime system prompt contains no phrase-level acknowledgement prohibition', !/(同一句、同一段|最小必要事实|只用于表示收到或理解)/.test(promptBuilder));
check('Acknowledgement calibration remains generic and contains no observed role/domain/test wording', !/(柯基|沙发|客厅|围栏|女装|护肤|SaaS|这个担心很实际|理解你的顾虑)/.test(promptTemplate + promptBuilder));
check('System Prompt carries only the current Persona capability while raw persisted HOW stays outside the system channel', promptBuilder.includes('【Current Role / Identity Persona HOW】') && promptBuilder.includes('PERSONA_SEMANTIC_CAPABILITY=') && promptBuilder.includes('buildRoleIdentityPersonaSourceData') && !promptBuilder.includes('【Role Prompt】') && !promptBuilder.includes('【Identity Prompt】'));
check('Ordinary context transport removes raw persisted Prompt and carries one typed Persona surface while stripping generationGuidance from HumanTurn surface', promptBuilder.includes('JSON.stringify(projectHveModelFacingContextTransport(modelFrame))') && promptBuilder.includes('const { generationGuidance: _generationGuidance, ...surface }') && promptBuilder.includes('personaSurfaceProfile = buildRoleIdentityPersonaSourceData(_generationGuidance)') && !promptBuilder.includes('personaExpressionSourceData ='));
check('Source-bound summary shares the same capability gate and typed Persona surface outside raw persisted Prompt transport', promptBuilder.includes('buildRoleIdentityPersonaSystemSection(generationGuidance)') && promptBuilder.includes('PERSONA_SURFACE_PROFILE:') && promptBuilder.includes('surface: { ...modelFacingSurface }'));
const carrierProbe = promptBuilderExports.buildRoleIdentityPersonaSystemSection({
  authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1',
  role: 'ROLE_PROMPT_PROBE',
  identity: 'IDENTITY_PROMPT_PROBE',
  surfaceProfile: personaSurfaceProfileProbe,
  semanticAuthority: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
});
const transportProbe = promptBuilderExports.projectHveModelFacingContextTransport({
  schemaVersion: 2,
  speaker: { authority: 'PC_RESOLVED_ROLE_IDENTITY_CONTEXT' },
  conversation: { recentConversation: [], priorSpeakerTurns: [] },
  humanPresence: {
    schemaVersion: 1,
    authority: 'FINAL_MODEL_FACING_HUMAN_TURN_V1',
    realization: { authority: 'EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY' },
    surface: {
      authority: 'FINAL_HUMAN_TURN_SURFACE_V1',
      relationshipContext: { distance: 'WARM' },
      generationGuidance: {
        authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1',
        role: 'ROLE_PROMPT_PROBE',
        identity: 'IDENTITY_PROMPT_PROBE',
        surfaceProfile: personaSurfaceProfileProbe,
        semanticAuthority: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
      },
    },
  },
  knowledge: {},
  pcPolicy: {},
  responseAssets: [],
});
check('Executable Persona system carrier contains capability only and no raw Role/Identity source',
  carrierProbe.includes('PERSONA_SEMANTIC_CAPABILITY=')
    && !carrierProbe.includes('ROLE_PROMPT_PROBE')
    && !carrierProbe.includes('IDENTITY_PROMPT_PROBE'));
check('Executable user-context transport removes raw Prompt source and preserves one typed Persona surface plus relationship truth',
  !JSON.stringify(transportProbe).includes('ROLE_PROMPT_PROBE')
    && !JSON.stringify(transportProbe).includes('IDENTITY_PROMPT_PROBE')
    && transportProbe.personaSurfaceProfile.authority === 'STRUCTURED_PERSONA_SURFACE_ONLY_V1'
    && transportProbe.personaSurfaceProfile.source === 'ROLE_SPEAKER_PROJECTION'
    && transportProbe.humanPresence.surface.relationshipContext.distance === 'WARM'
    && !Object.prototype.hasOwnProperty.call(transportProbe.humanPresence.surface, 'generationGuidance'));
const ordinaryPromptProbe = new promptBuilderMainPathExports.CustomerServiceGenerationPromptBuilder().build({
  orchestrationPlan: { interactionExecution: { authority: 'INTERACTION_EXECUTION_ENVELOPE_V1' } },
  persona: {
    resolvedRoleIdentity: {
      generationPrompt: { role: 'ROLE_PROMPT_MAIN_PATH_PROBE', identity: 'IDENTITY_PROMPT_MAIN_PATH_PROBE' },
      speakerProjection: null,
      channel: 'TEST_CHANNEL',
      provenance: { configurationFingerprint: 'TEST_FINGERPRINT' },
      serviceContext: { permissions: null, serviceBoundary: null },
    },
    speakerProjection: null,
  },
  businessContext: { accountProfile: { channel: 'TEST_CHANNEL' }, languagePolicyConstraints: [] },
  generationContext: { conversationHistory: [
    { role: 'CUSTOMER', content: '前一轮问题。' },
    { role: 'ASSISTANT', content: '先复述客户，再给当前答案，而且这一段还有更长的历史内容。' },
    { role: 'CUSTOMER', content: '先给我当前问题的直接判断。' },
  ] },
  groundedContext: { latestCustomerMessage: '先给我当前问题的直接判断。' },
  provenance: { configurationHash: 'TEST_HASH' },
});
check('Executable ordinary Generation main path keeps raw Role/Identity Prompt out of system instructions',
  !ordinaryPromptProbe.system.includes('ROLE_PROMPT_MAIN_PATH_PROBE')
    && !ordinaryPromptProbe.system.includes('IDENTITY_PROMPT_MAIN_PATH_PROBE')
    && ordinaryPromptProbe.system.includes('PERSONA_SEMANTIC_CAPABILITY='));
check('Executable ordinary Generation main path excludes raw Role/Identity Prompt and carries typed Persona surface in user context',
  !ordinaryPromptProbe.user.includes('ROLE_PROMPT_MAIN_PATH_PROBE')
    && !ordinaryPromptProbe.user.includes('IDENTITY_PROMPT_MAIN_PATH_PROBE')
    && ordinaryPromptProbe.user.includes('STRUCTURED_PERSONA_SURFACE_ONLY_V1')
    && ordinaryPromptProbe.user.includes('ROLE_SPEAKER_PROJECTION')
    && ordinaryPromptProbe.user.includes('先给我当前问题的直接判断。')
    && ordinaryPromptProbe.user.includes('HVE_REPLY_V2'));
const ordinaryContextStart = ordinaryPromptProbe.user.indexOf('\n') + 1;
const ordinaryContextEnd = ordinaryPromptProbe.user.indexOf('\n请直接', ordinaryContextStart);
const ordinaryContextProbe = ordinaryContextStart > 0 && ordinaryContextEnd > ordinaryContextStart
  ? JSON.parse(ordinaryPromptProbe.user.slice(ordinaryContextStart, ordinaryContextEnd))
  : null;
check('Executable ordinary Generation projects only the selected current customer-input branch into system',
  ordinaryPromptProbe.system.includes('【Current Canonical Execution — This Turn Only】')
    && ordinaryPromptProbe.system.includes('customerInput=NOT_SELECTED')
    && ordinaryPromptProbe.system.includes('NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN')
    && ordinaryPromptProbe.system.includes('当前生成没有新的客户输入权限')
    && ordinaryPromptProbe.system.includes('不得另开服务入口')
    && ordinaryPromptProbe.system.includes('只完成 canonicalPlan 已选贡献后结束本次生成')
    && !ordinaryPromptProbe.system.includes('customerInput=SELECTED')
    && ordinaryPromptProbe.user.includes('NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN')
    && ordinaryPromptProbe.user.includes('DIRECT_ANSWER'));
check('Executable ordinary Generation does not treat ALLOW_CONTINUATION as an Act grant',
  ordinaryPromptProbe.system.includes('completion=ALLOW_CONTINUATION 只是会话状态，不是当前回复的继续权限')
    && ordinaryPromptProbe.system.includes('不授予任何 Act')
    && ordinaryPromptProbe.system.includes('完成这些 Acts 后结束本次生成')
    && !ordinaryPromptProbe.system.includes('completion=ALLOW_CONTINUATION 只表示对话没有被系统终止'));
check('Executable history keeps semantic continuity while removing prior assistant surface authority',
  ordinaryContextProbe
    && ordinaryContextProbe.conversation.recentConversation[1].continuityAuthority === 'LIVED_CONVERSATION_EVIDENCE_ONLY'
    && ordinaryContextProbe.conversation.recentConversation[1].currentSurfaceAuthority === 'NONE'
    && ordinaryContextProbe.conversation.recentConversation[1].speaker === 'ASSISTANT'
    && ordinaryContextProbe.conversation.recentConversation[1].verbatimEvidence.includes('这一段还有更长的历史内容')
    && !Object.prototype.hasOwnProperty.call(ordinaryContextProbe.conversation.recentConversation[1], 'role')
    && !Object.prototype.hasOwnProperty.call(ordinaryContextProbe.conversation.recentConversation[1], 'content'));
check('Executable bounded assistant excerpt is structurally de-duplicated against its full raw history',
  ordinaryContextProbe && ordinaryContextProbe.conversation.priorSpeakerTurns.length === 0);
const selectedExecutionProbe = promptBuilderExports.buildCurrentCanonicalExecutionSystemSection({
  canonicalPlan: { completion: 'ALLOW_CONTINUATION' },
  selectedComponents: {
    customerInput: {
      selected: true,
      disposition: 'REQUIRED',
      completionDependency: 'CUSTOMER_INPUT_AUTHORIZED_BY_EXISTING_HUMAN_TURN',
    },
  },
});
check('Executable current execution projection selects exactly the authorized customer-input branch',
  selectedExecutionProbe.includes('customerInput=SELECTED')
    && selectedExecutionProbe.includes('disposition=REQUIRED')
    && !selectedExecutionProbe.includes('customerInput=NOT_SELECTED'));
const terminalExecutionProbe = promptBuilderExports.buildCurrentCanonicalExecutionSystemSection({
  canonicalPlan: { completion: 'STOP_AFTER_REQUIRED' },
  selectedComponents: {
    customerInput: {
      selected: false,
      disposition: 'NONE',
      completionDependency: 'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN',
    },
  },
});
check('Executable terminal current-execution projection prevents accepted continuity from becoming new work',
  terminalExecutionProbe.includes('completion=STOP_AFTER_REQUIRED 是当前轮终止边界')
    && terminalExecutionProbe.includes('required Acts 完成后立即结束本次生成')
    && terminalExecutionProbe.includes('已经接受的方向只保留为事实证据')
    && terminalExecutionProbe.includes('不得再把它们展开成新的判断、建议、复述、客户输入或服务入口'));
check('Persona HOW and current execution are placed immediately before machine protocol',
  ordinaryPromptProbe.system.indexOf('【Current Role / Identity Persona HOW】')
    < ordinaryPromptProbe.system.indexOf('【Current Canonical Execution — This Turn Only】')
    && ordinaryPromptProbe.system.indexOf('【Current Canonical Execution — This Turn Only】')
      < ordinaryPromptProbe.system.indexOf('普通 HVE 的机器输出协议固定为 HVE_REPLY_V2'));
check('System Prompt keeps one editable Persona HOW owner and no hidden default Prompt', !promptBuilder.includes('DEFAULT_CUSTOMER_SERVICE_ROLE_GENERATION_PROMPT') && !promptBuilder.includes('不要机械套客服模板'));
check('Kernel records Prompt Configuration Convergence', kernel.includes('V1.44 Prompt Configuration Convergence'));
for (const rel of [
  'src/modules/customer-service-agent/admin/foundation/templates/customer-service-generation-prompt.template.ts',
  'src/modules/customer-service-agent/admin/foundation/templates/customer-service-ali-flagship.template.ts',
  'src/modules/customer-service-agent/admin/foundation/customer-service-foundation.service.ts',
  'src/modules/customer-service-agent/admin/merchant-roles/customer-service-merchant-roles.service.ts',
  'src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
]) check(`${path.basename(rel)} TypeScript syntax`, syntax(rel));
console.log(`\nPrompt Configuration Convergence: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
