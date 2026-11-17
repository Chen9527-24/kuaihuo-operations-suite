import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CustomerServiceAssetsController } from './admin/assets/customer-service-assets.controller';
import { CustomerServiceCalibrationsController } from './admin/calibrations/customer-service-calibrations.controller';
import { CustomerServiceCalibrationsService } from './admin/calibrations/customer-service-calibrations.service';
import { CustomerServiceCurrentTestReplyService } from './admin/calibrations/customer-service-current-test-reply.service';
import { CustomerServiceCalibrationProfilesController } from './admin/calibration-profiles/customer-service-calibration-profiles.controller';
import { CustomerServiceCalibrationProfilesService } from './admin/calibration-profiles/customer-service-calibration-profiles.service';
import { CustomerServiceCalibrationProfileRepository } from './infrastructure/persistence/customer-service-calibration-profile.repository';
import { CustomerServiceCalibrationRecordRepository } from './infrastructure/persistence/customer-service-calibration-record.repository';
import { CustomerServiceAssetsService } from './admin/assets/customer-service-assets.service';
import { CustomerServiceIndustryNodesController } from './admin/industry-nodes/customer-service-industry-nodes.controller';
import { CustomerServiceIndustryNodesService } from './admin/industry-nodes/customer-service-industry-nodes.service';
import { CustomerServiceMerchantRolesController } from './admin/merchant-roles/customer-service-merchant-roles.controller';
import { CustomerServiceMerchantRolesService } from './admin/merchant-roles/customer-service-merchant-roles.service';
import { CustomerServiceOverviewController } from './admin/overview/customer-service-overview.controller';
import { CustomerServiceOverviewService } from './admin/overview/customer-service-overview.service';
import { CustomerServiceRoleModulesController } from './admin/role-modules/customer-service-role-modules.controller';
import { CustomerServiceRoleModulesService } from './admin/role-modules/customer-service-role-modules.service';
import { CustomerServiceRolePrototypesController } from './admin/role-prototypes/customer-service-role-prototypes.controller';
import { CustomerServiceRolePrototypesService } from './admin/role-prototypes/customer-service-role-prototypes.service';
import { CustomerServiceAssetRepository } from './infrastructure/persistence/customer-service-asset.repository';
import { CustomerServiceIndustryNodeRepository } from './infrastructure/persistence/customer-service-industry-node.repository';
import { CustomerServiceMerchantRoleRepository } from './infrastructure/persistence/customer-service-merchant-role.repository';
import { CustomerServiceRoleModuleRepository } from './infrastructure/persistence/customer-service-role-module.repository';
import { CustomerServiceRolePrototypeRepository } from './infrastructure/persistence/customer-service-role-prototype.repository';
import { CustomerServiceRuntimeSourceRepository } from './infrastructure/persistence/customer-service-runtime-source.repository';
import { CustomerServiceRoleModuleSelector } from './runtime/compiler/customer-service-role-module-selector.service';
import { CustomerServiceRuntimeContractCompiler } from './runtime/compiler/customer-service-runtime-contract-compiler.service';
import { CustomerServiceStrategyPolicyCompiler } from './runtime/compiler/customer-service-strategy-policy.compiler';
import { CustomerServiceSimulationController } from './runtime/simulation/customer-service-simulation.controller';
import { CustomerServiceSimulationService } from './runtime/simulation/customer-service-simulation.service';
import { CustomerServiceFoundationController } from './admin/foundation/customer-service-foundation.controller';
import { CustomerServiceFoundationService } from './admin/foundation/customer-service-foundation.service';
import { CustomerServiceResponseRulesController } from './admin/response-rules/customer-service-response-rules.controller';
import { CustomerServiceResponseRulesService } from './admin/response-rules/customer-service-response-rules.service';
import { CustomerServiceResponseAssetValidator } from './admin/assets/validators/customer-service-response-asset.validator';
import { CustomerServiceResponseRuleRepository } from './infrastructure/persistence/customer-service-response-rule.repository';
import { CustomerServiceConditionMatcher } from './shared/conditions/customer-service-condition-matcher.service';
import { CustomerServiceDeterministicResponseCompiler } from './runtime/compiler/customer-service-deterministic-response-compiler.service';
import { CustomerServiceResponseRuleSelector } from './runtime/compiler/customer-service-response-rule-selector.service';
import { CustomerServiceQualityRulesController } from './admin/quality-rules/customer-service-quality-rules.controller';
import { CustomerServiceQualityRulesService } from './admin/quality-rules/customer-service-quality-rules.service';
import { CustomerServiceEvaluationCasesController } from './admin/evaluation-cases/customer-service-evaluation-cases.controller';
import { CustomerServiceEvaluationCasesService } from './admin/evaluation-cases/customer-service-evaluation-cases.service';
import { CustomerServiceQualityRuleRepository } from './infrastructure/persistence/customer-service-quality-rule.repository';
import { CustomerServiceEvaluationCaseRepository } from './infrastructure/persistence/customer-service-evaluation-case.repository';
import { CustomerServiceMessageUnderstandingService } from './runtime/understanding/customer-service-message-understanding.service';
import { CustomerServiceDeepRecognitionService } from './runtime/understanding/customer-service-deep-recognition.service';
import { CustomerServiceReplyPlanner } from './runtime/planning/customer-service-reply-planner.service';
import { CustomerServiceInteractionTypeResolver } from './runtime/interaction/customer-service-interaction-type.resolver';
import { CustomerServiceInteractionPlanCompiler } from './runtime/interaction/customer-service-interaction-plan-compiler.service';
import { CustomerServiceModelGateway } from './infrastructure/model-gateway/customer-service-model-gateway.service';
import { CustomerServiceGenerationPromptBuilder } from './runtime/generation/customer-service-generation-prompt.builder';
import { CustomerServiceReplyGenerator } from './runtime/generation/customer-service-reply-generator.service';
import { CustomerServiceHve3ExecutionService } from './runtime/generation/customer-service-hve3-execution.service';
import { CustomerServiceSemanticConformanceService } from './runtime/generation/customer-service-semantic-conformance.service';
import { CustomerServiceOutputActRecognizer } from './runtime/compliance/customer-service-output-act-recognizer';
import { CustomerServiceHumanityPreferenceEvaluator } from './runtime/compliance/customer-service-humanity-preference-evaluator';
import { CustomerServiceRoleFoundationSeeder } from './admin/foundation/seeders/customer-service-role-foundation.seeder';
import { CustomerServiceResponseFoundationSeeder } from './admin/foundation/seeders/customer-service-response-foundation.seeder';
import { CustomerServiceEvaluationFoundationSeeder } from './admin/foundation/seeders/customer-service-evaluation-foundation.seeder';
import { CustomerServiceIntentFoundationSeeder } from './admin/foundation/seeders/customer-service-intent-foundation.seeder';
import { CustomerServiceIntentDefinitionRepository } from './infrastructure/persistence/customer-service-intent-definition.repository';
import { CustomerServiceIntentCandidateRepository } from './infrastructure/persistence/customer-service-intent-candidate.repository';
import { CustomerServiceIntentDefinitionsService } from './admin/intent-definitions/customer-service-intent-definitions.service';
import { CustomerServiceIntentDefinitionsController } from './admin/intent-definitions/customer-service-intent-definitions.controller';
import { CustomerServiceIntentCandidatesController } from './admin/intent-candidates/customer-service-intent-candidates.controller';
import { CustomerServiceIntentCandidatesService } from './admin/intent-candidates/customer-service-intent-candidates.service';
import { CustomerServiceTuningSessionsController } from './admin/tuning-sessions/customer-service-tuning-sessions.controller';
import { CustomerServiceTuningSessionsService } from './admin/tuning-sessions/customer-service-tuning-sessions.service';
import { CustomerServiceTuningSessionRepository } from './infrastructure/persistence/customer-service-tuning-session.repository';
import { CustomerServiceCanonicalConversationStateRepository } from './infrastructure/persistence/customer-service-canonical-conversation-state.repository';
import { CustomerServiceCanonicalConversationStateService } from './runtime/state/customer-service-canonical-conversation-state.service';
import { CustomerServiceEvaluationBenchmarksController } from './admin/evaluation-benchmarks/customer-service-evaluation-benchmarks.controller';
import { CustomerServiceEvaluationBenchmarksService } from './admin/evaluation-benchmarks/customer-service-evaluation-benchmarks.service';
import { CustomerServiceDataGovernanceController } from './admin/data-governance/customer-service-data-governance.controller';
import { CustomerServiceDataGovernanceService } from './admin/data-governance/customer-service-data-governance.service';
import { CustomerServiceDataGovernanceRepository } from './infrastructure/persistence/customer-service-data-governance.repository';
import { CustomerServiceRuntimeReplyController } from './runtime/reply/customer-service-runtime-reply.controller';
import { CustomerServiceRuntimeReplyService } from './runtime/reply/customer-service-runtime-reply.service';
import { CustomerServiceRuntimeReplyRequestRepository } from './infrastructure/persistence/customer-service-runtime-reply-request.repository';
import { CustomerServiceContextProfilesController } from './admin/context-profiles/customer-service-context-profiles.controller';
import { CustomerServiceContextProfilesService } from './admin/context-profiles/customer-service-context-profiles.service';
import { CustomerServiceContextProfileRepository } from './infrastructure/persistence/customer-service-context-profile.repository';
import { CustomerServiceChannelReplyService } from './runtime/channel/customer-service-channel-reply.service';
import { CustomerServiceReplyTracesController } from './admin/reply-traces/customer-service-reply-traces.controller';
import { CustomerServiceReplyTracesService } from './admin/reply-traces/customer-service-reply-traces.service';
import { CustomerServiceKnowledgeEntriesController } from './admin/knowledge-entries/customer-service-knowledge-entries.controller';
import { CustomerServiceKnowledgeEntriesService } from './admin/knowledge-entries/customer-service-knowledge-entries.service';
import { CustomerServiceKnowledgeEntryRepository } from './infrastructure/persistence/customer-service-knowledge-entry.repository';
import { CustomerServiceKnowledgeRevisionDraftRepository } from './infrastructure/persistence/customer-service-knowledge-revision-draft.repository';
import { CustomerServiceEffectObservationController } from './admin/effect-observation/customer-service-effect-observation.controller';
import { CustomerServiceEffectObservationService } from './admin/effect-observation/customer-service-effect-observation.service';
import { CustomerServiceRobotTestDmSessionService } from './runtime/testing/customer-service-robot-test-dm-session.service';

import { CustomerServiceGuidelinesController } from './admin/guidelines/customer-service-guidelines.controller';
import { CustomerServiceGuidelinesService } from './admin/guidelines/customer-service-guidelines.service';
import { CustomerServiceGuidelineRepository } from './infrastructure/persistence/customer-service-guideline.repository';
import { CustomerServiceGuidelineConditionEvaluator } from './runtime/guideline/customer-service-guideline-condition-evaluator';
import { CustomerServiceGuidelineValidator } from './runtime/guideline/customer-service-guideline-validator';
import { CustomerServiceGuidelineResolver } from './runtime/guideline/customer-service-guideline-resolver.service';
import { CustomerServiceLegacyGuidelineMigrationAdapter } from './runtime/guideline/customer-service-legacy-guideline-migration.adapter';
import { CustomerServiceGuidelineFoundationSeeder } from './admin/foundation/seeders/customer-service-guideline-foundation.seeder';


@Module({
  imports: [AiModule],
  controllers: [
    CustomerServiceOverviewController,
    CustomerServiceFoundationController,
    CustomerServiceIntentDefinitionsController,
    CustomerServiceIntentCandidatesController,
    CustomerServiceResponseRulesController,
    CustomerServiceQualityRulesController,
    CustomerServiceEvaluationCasesController,
    CustomerServiceEvaluationBenchmarksController,
    CustomerServiceCalibrationProfilesController,
    CustomerServiceCalibrationsController,
    CustomerServiceAssetsController,
    CustomerServiceRolePrototypesController,
    CustomerServiceMerchantRolesController,
    CustomerServiceRoleModulesController,
    CustomerServiceIndustryNodesController,
    CustomerServiceSimulationController,
    CustomerServiceTuningSessionsController,
    CustomerServiceDataGovernanceController,
    CustomerServiceRuntimeReplyController,
    CustomerServiceContextProfilesController,
    CustomerServiceReplyTracesController,
    CustomerServiceKnowledgeEntriesController,
    CustomerServiceEffectObservationController,
    CustomerServiceGuidelinesController,
  ],
  providers: [
    CustomerServiceOverviewService,
    CustomerServiceFoundationService,
    CustomerServiceRoleFoundationSeeder,
    CustomerServiceResponseFoundationSeeder,
    CustomerServiceEvaluationFoundationSeeder,
    CustomerServiceIntentFoundationSeeder,
    CustomerServiceGuidelineFoundationSeeder,
    CustomerServiceIntentDefinitionsService,
    CustomerServiceIntentCandidatesService,
    CustomerServiceResponseRulesService,
    CustomerServiceQualityRulesService,
    CustomerServiceEvaluationCasesService,
    CustomerServiceEvaluationBenchmarksService,
    CustomerServiceCalibrationProfilesService,
    CustomerServiceCalibrationsService,
    CustomerServiceCurrentTestReplyService,
    CustomerServiceGuidelinesService,
    CustomerServiceResponseAssetValidator,
    CustomerServiceAssetsService,
    CustomerServiceRolePrototypesService,
    CustomerServiceMerchantRolesService,
    CustomerServiceRoleModulesService,
    CustomerServiceIndustryNodesService,
    CustomerServiceSimulationService,
    CustomerServiceTuningSessionsService,
    CustomerServiceDataGovernanceService,
    CustomerServiceRuntimeReplyService,
    CustomerServiceContextProfilesService,
    CustomerServiceChannelReplyService,
    CustomerServiceReplyTracesService,
    CustomerServiceKnowledgeEntriesService,
    CustomerServiceEffectObservationService,
    CustomerServiceRobotTestDmSessionService,
    CustomerServiceRuntimeContractCompiler,
    CustomerServiceStrategyPolicyCompiler,
    CustomerServiceMessageUnderstandingService,
    CustomerServiceDeepRecognitionService,
    CustomerServiceReplyPlanner,
    CustomerServiceInteractionTypeResolver,
    CustomerServiceInteractionPlanCompiler,
    CustomerServiceGuidelineConditionEvaluator,
    CustomerServiceGuidelineValidator,
    CustomerServiceGuidelineResolver,
    CustomerServiceLegacyGuidelineMigrationAdapter,
    CustomerServiceModelGateway,
    CustomerServiceGenerationPromptBuilder,
    CustomerServiceReplyGenerator,
    CustomerServiceHve3ExecutionService,
    CustomerServiceSemanticConformanceService,
    CustomerServiceOutputActRecognizer,
    CustomerServiceHumanityPreferenceEvaluator,
    CustomerServiceDeterministicResponseCompiler,
    CustomerServiceResponseRuleSelector,
    CustomerServiceConditionMatcher,
    CustomerServiceRoleModuleSelector,
    CustomerServiceAssetRepository,
    CustomerServiceRolePrototypeRepository,
    CustomerServiceMerchantRoleRepository,
    CustomerServiceRoleModuleRepository,
    CustomerServiceIndustryNodeRepository,
    CustomerServiceRuntimeSourceRepository,
    CustomerServiceGuidelineRepository,
    CustomerServiceIntentDefinitionRepository,
    CustomerServiceIntentCandidateRepository,
    CustomerServiceTuningSessionRepository,
    CustomerServiceCanonicalConversationStateRepository,
    CustomerServiceCanonicalConversationStateService,
    CustomerServiceResponseRuleRepository,
    CustomerServiceQualityRuleRepository,
    CustomerServiceEvaluationCaseRepository,
    CustomerServiceCalibrationRecordRepository,
    CustomerServiceCalibrationProfileRepository,
    CustomerServiceDataGovernanceRepository,
    CustomerServiceRuntimeReplyRequestRepository,
    CustomerServiceContextProfileRepository,
    CustomerServiceKnowledgeEntryRepository,
    CustomerServiceKnowledgeRevisionDraftRepository,
  ],
  exports: [
    CustomerServiceChannelReplyService,
    CustomerServiceReplyTracesService,
    CustomerServiceKnowledgeEntriesService,
    CustomerServiceCanonicalConversationStateService,
    CustomerServiceRobotTestDmSessionService,
  ],
})
export class CustomerServiceAgentModule {}
