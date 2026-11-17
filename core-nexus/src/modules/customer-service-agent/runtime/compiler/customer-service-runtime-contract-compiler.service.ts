import { Injectable } from "@nestjs/common";
import {
  buildImmediateCalibrationRuntimeInstructions,
  isImmediateCalibrationScopeType,
  projectImmediateCalibrationProfileDirectives,
} from "../../shared/calibration/customer-service-calibration-profile.util";
import { stableJsonHash } from "../../shared/utils/stable-json-hash.util";
import { CompileCustomerServiceSimulationDto } from "../simulation/dto/compile-simulation.dto";
import { CustomerServiceCalibrationProfileRepository } from "../../infrastructure/persistence/customer-service-calibration-profile.repository";
import { CustomerServiceRuntimeSourceRepository } from "../../infrastructure/persistence/customer-service-runtime-source.repository";
import { CustomerServiceIntentDefinitionRepository } from "../../infrastructure/persistence/customer-service-intent-definition.repository";
import { CustomerServiceDeterministicResponseCompiler } from "./customer-service-deterministic-response-compiler.service";
import { CustomerServiceResponseRuleSelector } from "./customer-service-response-rule-selector.service";
import { CustomerServiceRoleModuleSelector } from "./customer-service-role-module-selector.service";
import { CustomerServiceStrategyPolicyCompiler } from "./customer-service-strategy-policy.compiler";
import type { CustomerServiceResolvedStrategyPolicy } from "./types/customer-service-strategy-policy.type";
import {
  CustomerServiceRuntimeReplyContract,
  CustomerServiceSimulationCompileResult,
} from "./types/runtime-reply-contract.type";
import { CustomerServiceMessageUnderstanding } from "../understanding/types/customer-service-message-understanding.type";
import { CustomerServiceIntentGuidance, CustomerServiceReplyPlanner, CustomerServiceServiceCapabilities } from "../planning/customer-service-reply-planner.service";
import {
  readCustomerServiceConversationStateV2,
  reduceCustomerServiceConversationState,
  reconcileCustomerServiceCurrentFeedback,
  summarizeCustomerServiceConversationState,
} from "../state/customer-service-conversation-state.reducer";
import {
  buildLanguagePolicyConstraintInstructions,
  type CustomerServiceEffectiveLanguagePolicy,
} from '../../shared/context/customer-service-language-policy.util';
import type { CustomerServiceRuntimeKnowledgeSelectionResult, CustomerServiceSelectedKnowledgeEntry } from '../../shared/context/customer-service-knowledge.util';
import type { CustomerServiceEffectiveBusinessScopeV1 } from '../../shared/context/customer-service-business-scope.util';
import type { CustomerServiceRuntimeInputBudget } from '../../shared/context/customer-service-runtime-input-budget.util';
import type { CustomerServiceConversationStrategyPreferences } from '../../shared/context/customer-service-account-runtime-preferences.util';
import type { CustomerServiceFixedQaMatch } from '../../shared/context/customer-service-fixed-qa.util';
import { resolveCustomerServiceOpeningReception } from '../../shared/context/customer-service-opening-reception.util';
import { CustomerServiceInteractionPlanCompiler } from '../interaction/customer-service-interaction-plan-compiler.service';
import { buildCustomerServiceInteractionExecutionEnvelope } from '../interaction/customer-service-interaction-execution.type';
import { CustomerServiceGuidelineResolver } from '../guideline/customer-service-guideline-resolver.service';
import { buildCustomerServiceGuidelineContextSnapshot } from '../guideline/customer-service-guideline-context';
import type { CustomerServicePublishedGuideline } from '../guideline/customer-service-guideline.type';
import { resolveCustomerServiceRoleInteractionPostureProjection, type CustomerServiceRoleInteractionPostureProjectionV1 } from '../role/customer-service-role-interaction-posture-projection';
import { resolveCustomerServiceRoleCapabilityContextProjection } from '../role/customer-service-role-capability-context-projection';
import { applyCustomerServiceRoleTurnPolicy } from '../interaction/customer-service-role-turn-policy';
import type { CustomerServiceRoleSpeakerProjectionV1 } from '../voice/customer-service-role-speaker-projection';
import { resolveCustomerServiceResolvedRoleIdentityContext, type CustomerServiceResolvedRoleIdentityContextV1 } from '../role/customer-service-resolved-role-identity-context';
import { resolveCustomerServiceConversationSummarySource, type CustomerServiceCanonicalTranscriptV1 } from '../interaction/customer-service-summary-source.contract';

type RoleSource = NonNullable<
  Awaited<
    ReturnType<CustomerServiceRuntimeSourceRepository["findMerchantRole"]>
  >
>;
type IndustrySource = Awaited<
  ReturnType<CustomerServiceRuntimeSourceRepository["findIndustryNode"]>
>;
type AssetSources = Awaited<
  ReturnType<CustomerServiceRuntimeSourceRepository["findPublishedAssets"]>
>;
type RuleSources = Awaited<
  ReturnType<CustomerServiceRuntimeSourceRepository["findEnabledResponseRules"]>
>;
type IntentDefinitions = Awaited<
  ReturnType<CustomerServiceIntentDefinitionRepository["findRuntimeMatches"]>
>;
type CalibrationProfiles = Awaited<
  ReturnType<CustomerServiceCalibrationProfileRepository["findActiveMatching"]>
>;
type StrategyGroups = Awaited<
  ReturnType<CustomerServiceRuntimeSourceRepository["findPublishedStrategyGroups"]>
>;
type BusinessContextSources = {
  storeProfile: {
    id: string; code: string; name: string; description: string | null;
    profile: unknown; revision: number;
  } | null;
  accountProfile: {
    id: string; code: string; name: string; channel: string | null; description: string | null;
    profile: unknown; revision: number;
  } | null;
  languagePolicies: CustomerServiceEffectiveLanguagePolicy[];
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
  knowledgeSelection: CustomerServiceRuntimeKnowledgeSelectionResult;
  businessScope: CustomerServiceEffectiveBusinessScopeV1;
  runtimeInputBudget: CustomerServiceRuntimeInputBudget;
  conversationStrategy: CustomerServiceConversationStrategyPreferences;
  fixedQaMatch?: CustomerServiceFixedQaMatch | null;
};

@Injectable()
export class CustomerServiceRuntimeContractCompiler {
  constructor(
    private readonly moduleSelector: CustomerServiceRoleModuleSelector,
    private readonly ruleSelector: CustomerServiceResponseRuleSelector,
    private readonly deterministicCompiler: CustomerServiceDeterministicResponseCompiler,
    private readonly replyPlanner: CustomerServiceReplyPlanner,
    private readonly interactionPlanCompiler: CustomerServiceInteractionPlanCompiler,
    private readonly guidelineResolver: CustomerServiceGuidelineResolver,
    private readonly strategyPolicyCompiler: CustomerServiceStrategyPolicyCompiler,
  ) {}

  compile(
    role: RoleSource,
    industry: IndustrySource,
    businessContext: BusinessContextSources,
    assets: AssetSources,
    rules: RuleSources,
    intentDefinitions: IntentDefinitions,
    calibrationProfiles: CalibrationProfiles,
    strategyGroups: StrategyGroups,
    guidelines: CustomerServicePublishedGuideline[],
    dto: CompileCustomerServiceSimulationDto,
    understanding: CustomerServiceMessageUnderstanding,
    modelGeneration = false,
    authorityContext: { canonicalTranscript?: CustomerServiceCanonicalTranscriptV1 | null } = {},
  ): CustomerServiceSimulationCompileResult {
    const conditionContext = {
      scenario: understanding.primaryScenario,
      intent: understanding.primaryIntent,
      riskLevel: understanding.riskLevel,
      industryNodeId: industry?.id,
      industryCode: industry?.code,
    };
    const moduleSelection = this.moduleSelector.select(
      role.modules,
      conditionContext,
    );
    const resolvedRoleIdentity = resolveCustomerServiceResolvedRoleIdentityContext({
      merchantRole: {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        publicIdentity: role.publicIdentity,
        publicRelation: role.publicRelation,
        generationPrompt: role.generationPrompt,
        revision: role.revision,
      },
      prototype: {
        id: role.prototype.id,
        code: role.prototype.code,
        identity: role.prototype.identity,
        personality: role.prototype.personality,
        languageStyle: role.prototype.languageStyle,
        servicePosture: role.prototype.servicePosture,
        speakerProfile: role.prototype.speakerProfile,
        revision: role.prototype.revision,
      },
      accountProfile: businessContext.accountProfile,
      storeProfile: businessContext.storeProfile,
    });
    const roleSpeakerProjection = resolvedRoleIdentity.speakerProjection;
    const roleInteractionPosture = resolveCustomerServiceRoleInteractionPostureProjection(moduleSelection.selected);
    const roleCapabilityContext = resolveCustomerServiceRoleCapabilityContextProjection({
      merchantRole: {
        publicIdentity: role.publicIdentity,
        publicRelation: role.publicRelation,
        description: role.description,
      },
      prototype: {
        identity: role.prototype.identity,
        personality: role.prototype.personality,
        languageStyle: role.prototype.languageStyle,
        servicePosture: role.prototype.servicePosture,
      },
      industry: industry ? { name: industry.name, path: industry.path } : null,
      accountProfile: businessContext.accountProfile,
      storeProfile: businessContext.storeProfile,
      resolvedRoleIdentity,
    });
    const ruleSelection = this.ruleSelector.select<RuleSources[number]>(
      rules,
      conditionContext,
    );
    const deterministicPlan = businessContext.fixedQaMatch
      ? this.deterministicCompiler.compileFixedQa(businessContext.fixedQaMatch)
      : this.deterministicCompiler.compile(
          ruleSelection.selected,
          dto.variables ?? {},
        );
    const intentGuidance = intentDefinitions.map(normalizeIntentGuidance);
    const compiledStrategyPolicy = this.strategyPolicyCompiler.compile({
      roleCode: role.code,
      accountProfileId: businessContext.accountProfile?.id || null,
      storeProfile: businessContext.storeProfile,
      accountProfile: businessContext.accountProfile,
      industryCode: industry?.code || null,
      understanding,
      intentGuidance,
      groups: strategyGroups,
    });
    // C5-C: Planner and Generator must consume the same canonical State snapshot.
    // Build it once here so the plan cannot reason about a different State revision
    // from the prompt that will eventually be generated.
    const generationContext = buildGenerationContext(dto, understanding);
    const orchestrationPlan = applyStrategyPolicyToPlan(this.replyPlanner.plan(
      understanding,
      deterministicPlan,
      dto.serviceGoal,
      intentGuidance,
      {
        conversationState: generationContext.conversationState,
        latestMessage: dto.message,
        conversationStrategy: businessContext.conversationStrategy,
        identity: {
          merchantRoleName: role.name,
          publicIdentity: role.publicIdentity,
          publicRelation: role.publicRelation,
          prototypeIdentity: role.prototype.identity,
          accountName: businessContext.accountProfile?.name || null,
          storeName: businessContext.storeProfile?.name || null,
          storeBrandName: readProfileText(businessContext.storeProfile?.profile, 'brandName'),
          accountPublicIdentity: readProfileText(businessContext.accountProfile?.profile, 'publicIdentity'),
        },
      },
    ), compiledStrategyPolicy);
    orchestrationPlan.serviceCapabilities = resolveRuntimeServiceCapabilities(dto);
    const effectiveUnderstanding = alignUnderstandingWithEffectivePlan(understanding, orchestrationPlan);
    const openingReception = resolveCustomerServiceOpeningReception({
      accountProfile: businessContext.accountProfile,
      storeProfile: businessContext.storeProfile,
      latestMessage: dto.message,
      conversationHistory: generationContext.conversationHistory,
      understanding: effectiveUnderstanding,
    });
    // HumanBehaviorResolver retired from production Runtime. Canonical Plan / RoleTurnPolicy /
    // HumanTurn own current-turn behavior; historical ExpressionPlan remains readable only
    // from old traces/state for diagnostics and migration compatibility.
    const strategyPolicy = applyBusinessLanguagePolicy(
      finalizeEffectiveStrategyPolicy(compiledStrategyPolicy, orchestrationPlan, understanding),
      businessContext.languagePolicies,
    );
    // HVE-2 remains shadow-only: build the HVE-1 legacy baseline first, then resolve
    // published Guideline versions into a separate deterministic ResolutionSet and
    // compile the canonical shadow plan. Generator/Quality/Delivery still ignore v2.
    const interactionPlanV2Legacy = this.interactionPlanCompiler.compileShadow({
      understanding: effectiveUnderstanding,
      plan: orchestrationPlan,
      deterministic: deterministicPlan,
      conversationState: generationContext.conversationState,
      knowledgeEntries: businessContext.knowledgeEntries,
      variables: dto.variables ?? {},
      latestCustomerMessage: dto.message,
      openingReception,
      conversationHistory: generationContext.conversationHistory,
    });
    if (interactionPlanV2Legacy) {
      orchestrationPlan.interactionPlanV2Legacy = interactionPlanV2Legacy;
      const variables = asRecord(dto.variables);
      const guidelineContext = buildCustomerServiceGuidelineContextSnapshot({
        tenantId: role.tenantId,
        roleId: role.id,
        roleCode: role.code,
        storeProfileId: businessContext.storeProfile?.id || null,
        accountProfileId: businessContext.accountProfile?.id || null,
        industryCode: industry?.code || null,
        channel: businessContext.accountProfile?.channel || String(variables.channel || '') || null,
        platform: String(variables.platform || variables.platformType || '') || null,
        interactionType: interactionPlanV2Legacy.interactionType,
        understanding: effectiveUnderstanding,
        plan: orchestrationPlan,
        state: generationContext.conversationState,
        knowledgeEntries: businessContext.knowledgeEntries,
        roleInteractionPosture,
        openingReception,
      });
      const guidelineResolutionSet = this.guidelineResolver.resolveShadow({ guidelines, context: guidelineContext });
      orchestrationPlan.guidelineResolutionSet = guidelineResolutionSet;
      const guidelinePlan = this.interactionPlanCompiler.applyGuidelineResolutionShadow(interactionPlanV2Legacy, guidelineResolutionSet);
      const interactionPlanV2 = applyCustomerServiceRoleTurnPolicy({
        plan: guidelinePlan,
        speaker: roleSpeakerProjection,
        posture: roleInteractionPosture,
        capabilityContext: roleCapabilityContext,
        recentConversation: generationContext.conversationHistory,
      });
      orchestrationPlan.interactionPlanV2 = interactionPlanV2;
      orchestrationPlan.interactionPlanV2Comparison = compareInteractionPlans(interactionPlanV2Legacy, interactionPlanV2);
    }
    orchestrationPlan.interactionExecution = buildCustomerServiceInteractionExecutionEnvelope({
      requestedLane: (dto as unknown as { hveExecutionLane?: unknown }).hveExecutionLane,
      plan: orchestrationPlan.interactionPlanV2 || null,
    });
    // Summary Source is produced exactly once from the server-owned Canonical
    // Transcript after the Canonical Interaction Plan exists. Ordinary
    // conversationHistory remains the context-window input for non-Summary turns
    // and is never reinterpreted as Summary history authority downstream.
    const canonicalTranscript = authorityContext.canonicalTranscript || null;
    const summarySource = resolveCustomerServiceConversationSummarySource({
      plan: orchestrationPlan.interactionPlanV2 || null,
      canonicalTranscript,
      latestCustomerMessage: dto.message,
    });
    const authoritativeGenerationContext: CustomerServiceRuntimeReplyContract['generationContext'] = {
      ...generationContext,
      canonicalTranscript,
      summarySource,
    };
    const sourceRevisions = this.buildSourceRevisions(
      role,
      industry,
      businessContext,
      assets,
      moduleSelection.selected,
      ruleSelection.selected,
      intentDefinitions,
      calibrationProfiles,
      strategyGroups,
      guidelines,
    );
    const contract = this.buildContract(
      role,
      industry,
      businessContext,
      assets,
      moduleSelection.selected,
      intentGuidance,
      calibrationProfiles,
      strategyPolicy,
      dto,
      effectiveUnderstanding,
      sourceRevisions,
      deterministicPlan,
      orchestrationPlan,
      authoritativeGenerationContext,
      roleSpeakerProjection,
      roleInteractionPosture,
      roleCapabilityContext,
      resolvedRoleIdentity,
      modelGeneration,
    );
    const contractHash = stableJsonHash(contract);
    contract.provenance.configurationHash = contractHash;
    return {
      compiledAt: new Date().toISOString(),
      contractHash,
      warnings: this.buildWarnings(
        role,
        industry,
        assets,
        moduleSelection.selected.length,
        rules.length,
        ruleSelection.selected.length,
        [...moduleSelection.warnings, ...ruleSelection.warnings],
        deterministicPlan.templateReply?.missingVariables ?? [],
        orchestrationPlan.route,
        calibrationProfiles.length,
        calibrationProfiles.filter((item) => isImmediateCalibrationScopeType(item.scopeType)).length,
        intentGuidance.length,
        strategyPolicy.sources.length,
        strategyPolicy.conflicts.filter((item) => item.kind === 'MISSING_BINDING' || item.kind === 'NOT_APPLICABLE').length,
      ),
      understanding: effectiveUnderstanding,
      summary: {
        primaryScenario: effectiveUnderstanding.primaryScenario,
        primaryIntent: effectiveUnderstanding.primaryIntent,
        dominantTurnGoal: effectiveUnderstanding.humanContext.dominantTurnGoal.key,
        requiredTurnGoals: effectiveUnderstanding.humanContext.requiredTurnGoals.map((item) => item.key),
        requiredResponseActs: effectiveUnderstanding.humanContext.requiredResponseActs,
        conversationPhase: effectiveUnderstanding.humanContext.interactionStrategy.phase,
        recognitionPath: effectiveUnderstanding.recognitionModel.status,
        userFeedback: effectiveUnderstanding.humanContext.dialogueObligation.userFeedback,
        requestedDeltas: effectiveUnderstanding.humanContext.dialogueObligation.requestedDeltas,
        feedbackHandlingMode: effectiveUnderstanding.humanContext.dialogueObligation.feedbackHandlingMode,
        acknowledgementRequired: effectiveUnderstanding.humanContext.dialogueObligation.acknowledgementRequired,
        strategyChangeRequired: effectiveUnderstanding.humanContext.dialogueObligation.strategyChangeRequired,
        correctionTarget: effectiveUnderstanding.humanContext.dialogueObligation.correctionTarget,
        repairObligation: effectiveUnderstanding.humanContext.dialogueObligation.repairObligation,
        currentResponseObligation: effectiveUnderstanding.humanContext.dialogueObligation.currentResponseObligation,
        recognizedItems: effectiveUnderstanding.recognizedItems.slice(0, 12).map((item) => ({
          type: item.type,
          name: item.name,
          matchStatus: item.matchStatus,
          isPrimary: item.isPrimary,
        })),
        moduleCount: moduleSelection.selected.length,
        availableModuleCount: role.modules.length,
        assetCount: assets.length,
        calibrationProfileCount: calibrationProfiles.length,
        strategyPolicySourceCount: strategyPolicy.sources.length,
        strategyPolicyConflictCount: strategyPolicy.conflicts.length,
        intentDefinitionCount: intentGuidance.length,
        matchedRuleCount: ruleSelection.selected.length,
        availableRuleCount: rules.length,
        replyRoute: orchestrationPlan.route,
        hasIndustry: Boolean(industry),
        runtimeMode: "SIMULATION",
      },
      contract,
    };
  }

  private buildContract(
    role: RoleSource,
    industry: IndustrySource,
    businessContext: BusinessContextSources,
    assets: AssetSources,
    modules: RoleSource["modules"],
    intentGuidance: CustomerServiceIntentGuidance[],
    calibrationProfiles: CalibrationProfiles,
    strategyPolicy: CustomerServiceResolvedStrategyPolicy,
    dto: CompileCustomerServiceSimulationDto,
    understanding: CustomerServiceMessageUnderstanding,
    sourceRevisions: Record<string, number>,
    replyPlan: CustomerServiceRuntimeReplyContract["replyPlan"],
    orchestrationPlan: CustomerServiceRuntimeReplyContract["orchestrationPlan"],
    generationContext: CustomerServiceRuntimeReplyContract["generationContext"],
    speakerProjection: CustomerServiceRoleSpeakerProjectionV1,
    roleInteractionPosture: CustomerServiceRoleInteractionPostureProjectionV1,
    roleCapabilityContext: CustomerServiceRuntimeReplyContract['persona']['roleCapabilityContextProjection'],
    resolvedRoleIdentity: CustomerServiceResolvedRoleIdentityContextV1,
    modelGeneration: boolean,
  ): CustomerServiceRuntimeReplyContract {
    const immediateCalibrationProfiles = calibrationProfiles.filter((item) => isImmediateCalibrationScopeType(item.scopeType));
    const immediateCalibrationDirectives = projectImmediateCalibrationProfileDirectives(immediateCalibrationProfiles);
    const immediateCalibrationInstructions = buildImmediateCalibrationRuntimeInstructions(immediateCalibrationDirectives);
    return {
      runtimeMode: "SIMULATION",
      identity: {
        merchantRole: {
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          publicIdentity: role.publicIdentity,
          publicRelation: role.publicRelation,
          revision: role.revision,
        },
        prototype: {
          id: role.prototype.id,
          code: role.prototype.code,
          name: role.prototype.name,
          identity: role.prototype.identity,
          personality: role.prototype.personality,
          languageStyle: role.prototype.languageStyle,
          servicePosture: role.prototype.servicePosture,
          speakerProfile: speakerProjection.source === 'EXPLICIT_ROLE_PROFILE' ? speakerProjection.stableCore : null,
          revision: role.prototype.revision,
        },
      },
      understanding,
      businessContext: {
        storeProfile: businessContext.storeProfile
          ? {
              id: businessContext.storeProfile.id,
              code: businessContext.storeProfile.code,
              name: businessContext.storeProfile.name,
              description: businessContext.storeProfile.description,
              profile: asRecord(businessContext.storeProfile.profile),
              revision: businessContext.storeProfile.revision,
            }
          : null,
        accountProfile: businessContext.accountProfile
          ? {
              id: businessContext.accountProfile.id,
              code: businessContext.accountProfile.code,
              name: businessContext.accountProfile.name,
              channel: businessContext.accountProfile.channel,
              description: businessContext.accountProfile.description,
              profile: asRecord(businessContext.accountProfile.profile),
              revision: businessContext.accountProfile.revision,
            }
          : null,
        languagePolicies: businessContext.languagePolicies,
        knowledgeEntries: businessContext.knowledgeEntries,
        knowledgeSelection: businessContext.knowledgeSelection,
        businessScope: businessContext.businessScope,
        runtimeInputBudget: businessContext.runtimeInputBudget,
        conversationStrategy: businessContext.conversationStrategy,
        languagePolicyConstraints: [
          ...buildLanguagePolicyConstraintInstructions(businessContext.languagePolicies),
          ...immediateCalibrationInstructions,
        ],
      },
      classification: {
        source: understanding.source,
        industry: industry
          ? {
              id: industry.id,
              code: industry.code,
              name: industry.name,
              nodeType: industry.nodeType,
              path: industry.path,
              revision: industry.revision,
            }
          : null,
        scenario: understanding.primaryScenario,
        intent: understanding.primaryIntent,
        riskLevel: understanding.riskLevel,
        emotion: understanding.emotion,
        confidence: understanding.confidence,
        topics: understanding.topics,
        intentRanking: understanding.intentRanking,
        recognizedItems: understanding.recognizedItems,
        recognitionModel: understanding.recognitionModel,
        humanContext: understanding.humanContext,
      },
      persona: {
        resolvedRoleIdentity,
        speakerProjection,
        interactionPostureProjection: roleInteractionPosture,
        roleCapabilityContextProjection: roleCapabilityContext,
        modules: modules.map((item) => ({
          id: item.id,
          key: item.key,
          name: item.name,
          moduleType: item.definition.code,
          mergeMode: item.mergeMode,
          priority: item.priority,
          sort: item.sort,
          content: item.content,
          conditions: item.conditions,
          revision: item.revision,
        })),
      },
      intentGuidance,
      strategyPolicy,
      calibration: {
        profiles: calibrationProfiles.map((item) => ({
          id: item.id,
          scopeType: item.scopeType,
          scopeKey: item.scopeKey,
          title: item.title,
          scenario: item.scenario,
          intent: item.intent,
          riskLevel: item.riskLevel,
          directives: item.directives,
          examples: item.examples,
          revision: item.revision,
        })),
        // 角色级校准仍只作为证据/策略草稿来源；只有管理员明确应用且命中
        // 当前机器人/账号身份的 ACTIVE 精确作用域才会投影为 ordinary Generation 约束。
        // 投影只保留抽象 goals / behaviorRules，不携带固定句式、句数、问题数或投递配额。
        directives: immediateCalibrationDirectives,
      },
      generationContext,
      customerState: dto.customerState ?? {},
      groundedContext: {
        latestCustomerMessage: dto.message.trim(),
        facts: dto.facts ?? [],
        factPolicy: "VERIFIED_ONLY",
        assistantHistoryPolicy: "CONTEXT_ONLY_NOT_EXECUTION_EVIDENCE",
        variables: dto.variables ?? {},
      },
      policy: {
        serviceGoal: orchestrationPlan.serviceGoal,
        assets: assets.map(({ asset, version }) => ({
          assetId: asset.id,
          key: asset.key,
          name: asset.name,
          assetType: asset.assetType,
          versionId: version.id,
          versionNo: version.versionNo,
          content: version.content,
          contentHash: version.contentHash,
        })),
      },
      replyPlan,
      orchestrationPlan,
      responseControl: {
        customerVisibleSend: false,
        businessWrite: false,
        modelGeneration,
        salesVisibility: orchestrationPlan.salesVisibility,
        qualityGate: "NOT_RUN",
      },
      provenance: {
        tenantId: role.tenantId,
        sourceRevisions,
        configurationHash: "",
      },
    };
  }

  private buildSourceRevisions(
    role: RoleSource,
    industry: IndustrySource,
    businessContext: BusinessContextSources,
    assets: AssetSources,
    modules: RoleSource["modules"],
    rules: RuleSources,
    intentDefinitions: IntentDefinitions,
    calibrationProfiles: CalibrationProfiles,
    strategyGroups: StrategyGroups,
    guidelines: CustomerServicePublishedGuideline[],
  ) {
    const revisions: Record<string, number> = {
      [`merchantRole:${role.id}`]: role.revision,
      [`rolePrototype:${role.prototype.id}`]: role.prototype.revision,
    };
    if (industry) revisions[`industryNode:${industry.id}`] = industry.revision;
    if (businessContext.storeProfile)
      revisions[`storeProfile:${businessContext.storeProfile.id}`] = businessContext.storeProfile.revision;
    if (businessContext.accountProfile)
      revisions[`accountProfile:${businessContext.accountProfile.id}`] = businessContext.accountProfile.revision;
    for (const policy of businessContext.languagePolicies)
      revisions[`languagePolicy:${policy.id}`] = policy.revision;
    for (const entry of businessContext.knowledgeEntries) {
      revisions[`knowledgeEntry:${entry.id}`] = entry.revision;
      if (entry.collectionId && entry.collectionRevision)
        revisions[`knowledgeCollection:${entry.collectionId}`] = entry.collectionRevision;
    }
    for (const module of modules)
      revisions[`roleModule:${module.id}`] = module.revision;
    for (const { asset, version } of assets) {
      revisions[`asset:${asset.id}`] = asset.revision;
      revisions[`assetVersion:${version.id}`] = version.revision;
    }
    for (const { rule, version } of rules) {
      revisions[`responseRule:${rule.id}`] = rule.revision;
      revisions[`asset:${rule.responseAsset.id}`] = rule.responseAsset.revision;
      revisions[`assetVersion:${version.id}`] = version.revision;
    }
    for (const intentDefinition of intentDefinitions)
      revisions[`intentDefinition:${intentDefinition.id}`] = intentDefinition.revision;
    for (const profile of calibrationProfiles)
      revisions[`calibrationProfile:${profile.id}`] = profile.revision;
    for (const { asset, version } of strategyGroups) {
      revisions[`strategyGroup:${asset.id}`] = asset.revision;
      revisions[`strategyGroupVersion:${version.id}`] = version.revision;
    }
    for (const guideline of guidelines) {
      revisions[`guidelineVersion:${guideline.versionId}`] = guideline.versionNo;
    }
    return revisions;
  }

  private buildWarnings(
    role: RoleSource,
    industry: IndustrySource,
    assets: AssetSources,
    selectedModuleCount: number,
    availableRuleCount: number,
    selectedRuleCount: number,
    selectionWarnings: string[],
    missingVariables: string[],
    route: string,
    calibrationProfileCount: number,
    immediateCalibrationProfileCount: number,
    intentDefinitionCount: number,
    strategyPolicySourceCount: number,
    strategyPolicyAttentionCount: number,
  ) {
    const warnings: string[] = [...selectionWarnings];
    if (role.status !== "ENABLED")
      warnings.push("当前客服角色未启用，本次仅允许模拟编译。");
    if (role.prototype.status !== "ENABLED")
      warnings.push("角色原型未启用，请在正式发布前完成启用。");
    if (!industry) warnings.push("未绑定行业节点，行业能力不会进入运行契约。");
    if (!role.modules.length)
      warnings.push("当前客服角色没有已启用的角色模块。");
    else if (!selectedModuleCount)
      warnings.push("当前模拟条件没有命中任何已启用角色模块。");
    if (!assets.length) warnings.push("本次未选择额外配置资产。");
    if (intentDefinitionCount) warnings.push(`本次已匹配 ${intentDefinitionCount} 个客户意图与流程定义。`);
    else warnings.push('当前没有匹配的客户意图与流程定义，将使用通用理解和安全规划。');
    if (immediateCalibrationProfileCount)
      warnings.push(`本次加载 ${immediateCalibrationProfileCount} 份管理员已应用的机器人/账号精确校准档案，其抽象目标与行为原则会进入本次普通生成。`);
    const advisoryCalibrationProfileCount = calibrationProfileCount - immediateCalibrationProfileCount;
    if (advisoryCalibrationProfileCount > 0)
      warnings.push(`另加载 ${advisoryCalibrationProfileCount} 份角色级/历史校准档案，仅作为共享策略证据，不会绕过回归与发布门禁。`);
    if (strategyPolicySourceCount) warnings.push(`本次最终策略由 ${strategyPolicySourceCount} 个配置来源编译。`);
    else warnings.push("本次未命中已发布策略配置组，使用兼容基础策略。 ");
    if (strategyPolicyAttentionCount) warnings.push(`检测到 ${strategyPolicyAttentionCount} 项策略关联未加载，请检查配置组是否已发布且适用当前角色、行业和风险。`);
    if (!availableRuleCount) warnings.push("当前租户没有已启用的回复规则。");
    else if (!selectedRuleCount && route === "CONTROLLED_GENERATION")
      warnings.push("当前未命中确定性回复规则。");
    if (missingVariables.length)
      warnings.push(
        `固定模板缺少变量：${missingVariables.join("、")}，系统不会猜测或补值。`,
      );
    if (route === "HUMAN_REVIEW")
      warnings.push("当前场景已在后台标记人工处理；客户侧仍生成自然承接回复，且不得暴露内部路由。");
    return warnings;
  }
}


function alignUnderstandingWithEffectivePlan(
  understanding: CustomerServiceMessageUnderstanding,
  plan: CustomerServiceRuntimeReplyContract['orchestrationPlan'],
): CustomerServiceMessageUnderstanding {
  return {
    ...understanding,
    humanContext: {
      ...understanding.humanContext,
      semanticMoveBudget: { ...plan.semanticMoveBudget },
      commercialStrategy: {
        ...understanding.humanContext.commercialStrategy,
        stage: plan.businessOpportunity.stage,
        productMentionPolicy: plan.businessOpportunity.productMentionPolicy,
        discoveryTarget: plan.businessOpportunity.discoveryTarget,
        transitionSignals: [...plan.businessOpportunity.transitionSignals],
      },
    },
  };
}

function finalizeEffectiveStrategyPolicy(
  policy: CustomerServiceResolvedStrategyPolicy,
  plan: CustomerServiceRuntimeReplyContract['orchestrationPlan'],
  understanding: CustomerServiceMessageUnderstanding,
): CustomerServiceResolvedStrategyPolicy {
  const maxQuestions = policy.resolved.structure.maxQuestions === null
    ? plan.questionBudget
    : Math.min(policy.resolved.structure.maxQuestions, plan.questionBudget);
  const maxCoreMoves = policy.resolved.structure.maxCoreMoves === null
    ? plan.semanticMoveBudget.maxCoreMoves
    : Math.min(policy.resolved.structure.maxCoreMoves, plan.semanticMoveBudget.maxCoreMoves);
  return {
    ...policy,
    resolved: {
      ...policy.resolved,
      structure: {
        ...policy.resolved.structure,
        maxQuestions,
        maxCoreMoves,
      },
      service: {
        ...policy.resolved.service,
        salesVisibility: plan.salesVisibility === 'S4' ? policy.resolved.service.salesVisibility : plan.salesVisibility,
        productMentionPolicy: plan.businessOpportunity.productMentionPolicy,
        firstMove: understanding.humanContext.interactionStrategy.firstMove,
      },
    },
  };
}

function resolveRuntimeServiceCapabilities(dto: CompileCustomerServiceSimulationDto): CustomerServiceServiceCapabilities {
  const variableRoot = asRecord(dto.variables);
  const stateRoot = asRecord(dto.customerState);
  const configured = asRecord(variableRoot.serviceCapabilities);
  const fallbackConfigured = asRecord(stateRoot.serviceCapabilities);
  const raw = Object.keys(configured).length ? configured : fallbackConfigured;
  const configuredMode = Object.keys(raw).length > 0;
  const evidence: string[] = [];
  const read = (key: string) => {
    const value = raw[key];
    const normalized = String(value ?? '').toUpperCase();
    if (value === true || normalized === 'AVAILABLE') {
      evidence.push(`${key}=AVAILABLE`);
      return 'AVAILABLE' as const;
    }
    if (value === false || normalized === 'UNAVAILABLE') {
      evidence.push(`${key}=UNAVAILABLE`);
      return 'UNAVAILABLE' as const;
    }
    if (normalized === 'REQUIRES_APPROVAL') {
      evidence.push(`${key}=REQUIRES_APPROVAL`);
      return 'REQUIRES_APPROVAL' as const;
    }
    return 'UNKNOWN' as const;
  };
  const receiptCandidates = [
    ...(Array.isArray(variableRoot.actionReceipts) ? variableRoot.actionReceipts : []),
    ...(Array.isArray(stateRoot.actionReceipts) ? stateRoot.actionReceipts : []),
    ...(Array.isArray(dto.facts) ? dto.facts : []),
  ];
  const executionReceipts = receiptCandidates.flatMap((item) => {
    const record = asRecord(item);
    const action = String(record.action || record.actionCode || '').trim().toUpperCase();
    const status = String(record.status || '').trim().toUpperCase();
    const source = String(record.source || '').trim().toUpperCase();
    const verified = record.verified === true || ['TOOL_RESULT', 'BUSINESS_STATE', 'RUNTIME'].includes(source);
    if (!verified || !action || !['COMPLETED', 'IN_PROGRESS', 'ACCEPTED', 'REJECTED'].includes(status)) return [];
    return [{
      action,
      status: status as CustomerServiceServiceCapabilities['executionReceipts'][number]['status'],
      source: (['TOOL_RESULT', 'BUSINESS_STATE', 'RUNTIME'].includes(source) ? source : 'RUNTIME') as CustomerServiceServiceCapabilities['executionReceipts'][number]['source'],
      evidence: Array.isArray(record.evidence) ? record.evidence.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 8) : [],
      occurredAt: typeof record.occurredAt === 'string' ? record.occurredAt : null,
    }];
  });
  if (!configuredMode) {
    evidence.push('尚未绑定具体行业动作权限：本轮采用沟通能力验证模式，不把未配置等同于明确可用或明确不可用。');
  }
  if (executionReceipts.length) evidence.push(`已加载 ${executionReceipts.length} 条可信动作凭证。`);
  return {
    accountOrderVisibility: read('accountOrderVisibility'),
    orderLookupById: read('orderLookupById'),
    orderLookupByPhone: read('orderLookupByPhone'),
    trackingLookup: read('trackingLookup'),
    logisticsUrge: read('logisticsUrge'),
    source: configuredMode ? 'RUNTIME_CONFIG' : 'NOT_CONFIGURED',
    configurationStatus: configuredMode ? 'CONFIGURED' : 'NOT_CONFIGURED',
    enforcementMode: configuredMode ? 'STRICT_EXECUTION' : 'COMMUNICATION_ONLY',
    actionLimits: asRecord(raw.actionLimits || raw.limits),
    executionReceipts,
    evidence,
  };
}

function applyStrategyPolicyToPlan(
  plan: CustomerServiceRuntimeReplyContract["orchestrationPlan"],
  strategyPolicy: CustomerServiceResolvedStrategyPolicy,
) {
  const resolved = strategyPolicy.resolved;
  if (resolved.structure.maxQuestions !== null) plan.questionBudget = Math.min(plan.questionBudget, resolved.structure.maxQuestions);
  if (resolved.structure.maxCoreMoves !== null) {
    plan.semanticMoveBudget = { ...plan.semanticMoveBudget, maxCoreMoves: Math.max(1, Math.min(3, plan.semanticMoveBudget.maxCoreMoves, resolved.structure.maxCoreMoves)) as 1 | 2 | 3 };
  }
  if (resolved.service.salesVisibility) plan.salesVisibility = moreRestrictiveSalesVisibility(plan.salesVisibility, resolved.service.salesVisibility);
  if (resolved.service.productMentionPolicy) {
    plan.businessOpportunity.productMentionPolicy = moreRestrictiveProductMentionPolicy(
      plan.businessOpportunity.productMentionPolicy,
      resolved.service.productMentionPolicy,
    );
  }
  if (resolved.service.firstMove) plan.microActions = [...new Set([resolved.service.firstMove, ...plan.microActions])];
  plan.stateGuidance.shouldAdvanceSales = plan.businessOpportunity.mode === 'ADVANCE'
    && plan.salesVisibility !== 'S0'
    && !plan.stateGuidance.commercialAdvanceBlocked;
  return plan;
}

function moreRestrictiveSalesVisibility(current: CustomerServiceRuntimeReplyContract["orchestrationPlan"]["salesVisibility"], next: 'S0' | 'S1' | 'S2' | 'S3') {
  return Number(current.slice(1)) <= Number(next.slice(1)) ? current : next;
}

function moreRestrictiveProductMentionPolicy(current: CustomerServiceRuntimeReplyContract["orchestrationPlan"]["businessOpportunity"]["productMentionPolicy"], next: CustomerServiceRuntimeReplyContract['orchestrationPlan']['businessOpportunity']['productMentionPolicy']) {
  const rank: Record<string, number> = { PROHIBITED: 0, CATEGORY_ONLY: 1, SPECIFIC_IF_RELEVANT: 2, SPECIFIC_ALLOWED: 3 };
  return rank[current] <= rank[next] ? current : next;
}

function extractPreviousDrafts(
  customerState?: Record<string, unknown>,
  conversationHistory?: CompileCustomerServiceSimulationDto['conversationHistory'],
): string[] {
  const state = customerState ?? {};
  const candidates = [
    state.previousDrafts,
    state.recentAssistantReplies,
    state.recentReplies,
  ];
  const raw = candidates.find(Array.isArray);
  const assistantHistory = (conversationHistory ?? [])
    .filter((item) => item.role === 'ASSISTANT' && Boolean(item.content?.trim()))
    .map((item) => item.content.trim());
  const combined = [...(Array.isArray(raw) ? raw : []), ...assistantHistory];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of combined) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value.slice(0, 4000));
  }
  return result.slice(-5);
}


function compareInteractionPlans(legacyPlan: any, guidelinePlan: any) {
  const legacyRequiredActs = legacyPlan.acts.filter((item: any) => item.necessity === 'REQUIRED').map((item: any) => item.type).sort();
  const guidelineRequiredActs = guidelinePlan.acts.filter((item: any) => item.necessity === 'REQUIRED').map((item: any) => item.type).sort();
  const legacySuppressedActs = legacyPlan.suppressedActs.map((item: any) => `${item.enforcement}:${item.type}`).sort();
  const guidelineSuppressedActs = guidelinePlan.suppressedActs.map((item: any) => `${item.enforcement}:${item.type}`).sort();
  const completionChanged = stableJsonHash(legacyPlan.completion) !== stableJsonHash(guidelinePlan.completion);
  return {
    legacyRequiredActs, guidelineRequiredActs, legacySuppressedActs, guidelineSuppressedActs, completionChanged,
    changed: completionChanged
      || legacyRequiredActs.join('|') !== guidelineRequiredActs.join('|')
      || legacySuppressedActs.join('|') !== guidelineSuppressedActs.join('|'),
  };
}
function normalizeIntentGuidance(item: IntentDefinitions[number]): CustomerServiceIntentGuidance {
  return {
    id: item.id, key: item.key, name: item.name, category: item.category, scenario: item.scenario,
    primaryIntent: item.primaryIntent, defaultRiskLevel: item.defaultRiskLevel,
    recognitionConfig: asRecord(item.recognitionConfig), strategyConfig: asRecord(item.strategyConfig),
    flowConfig: asRecord(item.flowConfig), replyConfig: asRecord(item.replyConfig), examples: item.examples,
    priority: item.priority, revision: item.revision,
  };
}

function normalizeConversationHistory(
  value: CompileCustomerServiceSimulationDto['conversationHistory'],
  preserveBudgetSelection = false,
) {
  const normalized = (value ?? [])
    .filter((item) => item && (item.role === 'CUSTOMER' || item.role === 'ASSISTANT') && Boolean(item.content?.trim()))
    .map((item) => ({ role: item.role, content: item.content.trim() }));
  return preserveBudgetSelection ? normalized : normalized.slice(-20);
}

function buildGenerationContext(
  dto: CompileCustomerServiceSimulationDto,
  understanding: CustomerServiceMessageUnderstanding,
) {
  const canonicalStateRuntime = asRecord(asRecord(dto.variables).canonicalStateRuntime);
  const stateAlreadyIncludesCurrentCustomer = canonicalStateRuntime.currentCustomerApplied === true;
  const prospectiveState = stateAlreadyIncludesCurrentCustomer
    ? reconcileCustomerServiceCurrentFeedback(dto.conversationState, understanding.humanContext.dialogueObligation)
    : reduceCustomerServiceConversationState({
        previous: dto.conversationState,
        dto,
        understanding,
        assistantDraft: null,
      });
  const conversationState = summarizeCustomerServiceConversationState(prospectiveState, dto.message);
  const activeContextWindow = readActiveContextWindow(dto.variables);
  const conversationHistory = activeContextWindow
    ? normalizeConversationHistory(dto.conversationHistory, true)
    : normalizeConversationHistoryAdaptive(dto.conversationHistory, {
        hasFeedback: Boolean(conversationState.latestFeedback?.strategyChangeRequired),
        hasSuspendedTasks: conversationState.suspendedTasks.length > 0,
        hasDistantReference: understanding.humanContext.stateTruthSignal.task.relation === 'RESUME_EXISTING'
          || understanding.humanContext.dialogueObligation.requestedDeltas.includes('RETURN_TO_PREVIOUS_TOPIC'),
      });
  return {
    feedbackAuthority: 'FINAL_UNDERSTANDING_CURRENT_EVENT' as const,
    customerEvidenceMessageId: typeof canonicalStateRuntime.customerEvidenceMessageId === 'string' ? canonicalStateRuntime.customerEvidenceMessageId : null,
    previousDrafts: extractPreviousDrafts(dto.customerState, dto.conversationHistory),
    conversationHistory,
    conversationState,
    contextWindow: {
      recentMessageCount: conversationHistory.length,
      retrievedMemoryCount: conversationState.relevantMemories.length,
      estimatedCharacters: conversationHistory.reduce((total, item) => total + item.content.length, 0)
        + JSON.stringify(conversationState.relevantMemories).length,
      ...(activeContextWindow ? {
        budgetApplied: true as const,
        selectionMode: String(activeContextWindow.selectionMode || ''),
        tokenBudget: finiteNumber(activeContextWindow.tokenBudget),
        estimatedTokens: finiteNumber(activeContextWindow.estimatedTokens),
        estimatedCurrentMessageTokens: finiteNumber(activeContextWindow.estimatedCurrentMessageTokens),
        estimatedStateTokens: finiteNumber(activeContextWindow.estimatedStateTokens),
        estimatedHistoryTokens: finiteNumber(activeContextWindow.estimatedHistoryTokens),
        historyTokenBudget: finiteNumber(activeContextWindow.historyTokenBudget),
        allHistoryIncluded: activeContextWindow.allHistoryIncluded === true,
        selectedMessageCount: finiteNumber(activeContextWindow.selectedMessageCount),
        candidateMessageCount: finiteNumber(activeContextWindow.candidateMessageCount),
        physicalMessageCount: finiteNumber(activeContextWindow.physicalMessageCount),
        estimatedInternalStateTokens: finiteNumber(activeContextWindow.estimatedInternalStateTokens),
        stateProjection: String(activeContextWindow.stateProjection || ''),
        evidenceRecallCount: finiteNumber(activeContextWindow.evidenceRecallCount),
        sourceConversationCount: finiteNumber(activeContextWindow.sourceConversationCount),
      } : {}),
    },
  };
}

function normalizeConversationHistoryAdaptive(
  value: CompileCustomerServiceSimulationDto['conversationHistory'],
  signals: { hasFeedback: boolean; hasSuspendedTasks: boolean; hasDistantReference: boolean },
) {
  const all = (value ?? [])
    .filter((item) => item && (item.role === 'CUSTOMER' || item.role === 'ASSISTANT') && Boolean(item.content?.trim()))
    .map((item) => ({ role: item.role, content: item.content.trim() }));
  const limit = signals.hasFeedback || signals.hasSuspendedTasks || signals.hasDistantReference ? 20 : 12;
  return all.slice(-limit);
}


function readActiveContextWindow(value: unknown): Record<string, unknown> | null {
  const variables = asRecord(value);
  const window = asRecord(variables.activeContextWindow);
  return window.budgetApplied === true ? window : null;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function readProfileText(value: unknown, key: string) {
  const current = asRecord(value)[key];
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function applyBusinessLanguagePolicy(
  source: CustomerServiceResolvedStrategyPolicy,
  policies: CustomerServiceEffectiveLanguagePolicy[],
) {
  const policy: CustomerServiceResolvedStrategyPolicy = JSON.parse(JSON.stringify(source));
  for (const languagePolicy of policies) {
    const sourceKey = `language-policy:${languagePolicy.code}`;
    policy.sources.push({
      sourceType: 'DYNAMIC_SAFETY',
      key: sourceKey,
      name: languagePolicy.name,
      priority: languagePolicy.priority,
    });
    for (const rule of languagePolicy.rules.filter((item) => item.enabled)) {
      if (
        ['FORBIDDEN_WORD', 'FORBIDDEN_PHRASE', 'FORBIDDEN_SYMBOL', 'STARTING_TEXT', 'REGEX'].includes(rule.type)
        && ['MODEL_REWRITE', 'BLOCK'].includes(rule.action)
      ) {
        policy.resolved.wording.forbiddenExpressions = [
          ...new Set([...policy.resolved.wording.forbiddenExpressions, rule.pattern]),
        ];
      }
      if (rule.type === 'MAX_SENTENCES' && rule.limit) {
        const current = policy.resolved.structure.maxSentences;
        policy.resolved.structure.maxSentences = current === null ? rule.limit : Math.min(current, rule.limit);
      }
      if (rule.type === 'MAX_QUESTIONS' && rule.limit) {
        const current = policy.resolved.structure.maxQuestions;
        policy.resolved.structure.maxQuestions = current === null ? rule.limit : Math.min(current, rule.limit);
      }
      if (rule.type === 'EMOJI_POLICY' && ['FORBIDDEN', 'LIMITED', 'FOLLOW_CUSTOMER', 'AUTO'].includes(rule.pattern)) {
        policy.resolved.wording.emojiPolicy = rule.pattern as typeof policy.resolved.wording.emojiPolicy;
      }
    }
  }
  return policy;
}
