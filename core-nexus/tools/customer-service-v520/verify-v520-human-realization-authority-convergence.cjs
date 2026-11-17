#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { loadFinalHumanTurnCompiler, normalizeFrame } = require('./_final-human-turn-test-helper.cjs');
const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
let pass=0, fail=0;
function check(name, ok){ if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}`)} }
function syntax(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});return !(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error)}
const f={
 module:'src/modules/customer-service-agent/customer-service-agent.module.ts',
 compiler:'src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts',
 interaction:'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-type.resolver.ts',
 plan:'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan-compiler.service.ts',
 authority:'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
 prompt:'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
 kernel:'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
 human:'src/modules/customer-service-agent/runtime/generation/customer-service-human-turn-realization.ts',
 resolved:'src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts',
 behaviorType:'src/modules/customer-service-agent/runtime/behavior/customer-service-human-behavior.type.ts',
 behaviorMemory:'src/modules/customer-service-agent/runtime/behavior/customer-service-behavior-memory.util.ts',
 legacyAdapter:'src/modules/customer-service-agent/runtime/interaction/customer-service-legacy-act-adapter.ts',
 interactionPlanType:'src/modules/customer-service-agent/runtime/interaction/customer-service-interaction-plan.type.ts',
};
const s=Object.fromEntries(Object.entries(f).map(([k,v])=>[k,read(v)]));
const retired='src/modules/customer-service-agent/runtime/behavior/customer-service-human-behavior-resolver.service.ts';
const retiredSrc = read(retired);
check('legacy HumanBehaviorResolver implementation is retired to an overlay-safe tombstone', exists(retired) && /RETIRED FROM PRODUCTION RUNTIME/.test(retiredSrc) && !/(class CustomerServiceHumanBehaviorResolver|resolveCustomerServiceCriticalIntent|expressionPlan|@Injectable)/.test(retiredSrc));
check('Nest module no longer registers legacy HumanBehaviorResolver', !/CustomerServiceHumanBehaviorResolver|customer-service-human-behavior-resolver/.test(s.module));
check('Runtime contract compiler no longer invokes legacy HumanBehaviorResolver', !/humanBehaviorResolver|\.expressionPlan\s*=/.test(s.compiler));
check('InteractionType no longer reads legacy expressionPlan/identityResponse', !/expressionPlan|identityResponse/.test(s.interaction));
check('Shadow interaction compiler no longer maps HUMAN_BEHAVIOR_ACT into current canonical acts', !/HUMAN_BEHAVIOR_ACT/.test(s.plan));
check('Dead HUMAN_BEHAVIOR_ACT legacy adapter mapping is removed', !/HUMAN_BEHAVIOR_ACT/.test(s.legacyAdapter) && !/HUMAN_BEHAVIOR_ACT/.test(s.interactionPlanType));
check('Historical ExpressionPlan types remain readable for trace/migration compatibility only', /CustomerServiceExpressionPlan/.test(s.behaviorType) && /normalizeCustomerServiceAssistantBehaviorPlan/.test(s.behaviorMemory));
check('Final model-facing surface exposes one configurable HOW chain', /generationGuidance:\s*\{/.test(s.authority) && /ROLE_IDENTITY_PROMPT_CHAIN_V1/.test(s.authority));
check('Final model-facing surface keeps factual relationship context', /relationshipContext:\s*\{[\s\S]*distance:\s*human\.adaptation\.relationshipDistance/.test(s.authority));
check('Legacy rolePresence is no longer model-facing beside Role/Identity Prompt', !/rolePresence\s*:/.test(s.authority));
check('Legacy texture/cadence/message-shape controls are not model-facing', !/(texture\s*:|conversationForm\s*:|explicitPcSurface\s*:|customerMessageShape\s*:|mirrorIntensity\s*:|varyFromRecentStructure\s*:|completionCadence\s*:|stopBias\s*:)/.test(s.authority));
check('No numeric surface budgets are model-facing', !/(softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|maxSentences|maxQuestions)/.test(s.authority));
check('Surface-budget-derived completion HOW is no longer model-facing', !/(surfaceBudget\.completionPolicy|surfaceBudget\.stopAfterQuestion|realization:\s*\{[\s\S]*completion:\s*\{)/.test(s.authority));
check('Legacy identity stop flag is no longer a second model-facing completion authority', !/stopAfterAnswer/.test(s.authority) && !/stopAfterAnswer/.test(s.prompt));
check('Support amount and opening/order HOW are no longer model-facing', !/(support:\s*\{|ordering:\s*\{|openingBias:|contributeBeforeOptionalAsk:)/.test(s.authority));
check('Derived prior reuse / evaluative-order HOW is no longer model-facing', !/(priorContributionReuse:|avoidEvaluativeReceptionBeforeValue:|mustAdvanceBeyondGiven:)/.test(s.authority));
check('Canonical Plan is the sole model-facing owner of explicit acknowledgement Acts', /canonicalPlan:\s*\{/.test(s.authority) && !/selectedComponents:\s*\{[\s\S]*?acknowledgement:\s*\{/.test(s.authority));
check('Prompt keeps one typed Persona HOW projection while raw persisted Role/Identity text stays outside ordinary model transport', s.prompt.includes('PERSONA_SEMANTIC_CAPABILITY=') && s.prompt.includes('PERSONA_SURFACE_PROFILE=') && s.prompt.includes('personaSurfaceProfile') && s.prompt.includes('const { generationGuidance: _generationGuidance, ...surface }') && !s.prompt.includes('personaExpressionSourceData') && !s.prompt.includes('【Role Prompt】') && !s.prompt.includes('【Identity Prompt】'));
check('Prompt demotes legacy humanization micro-controls to diagnostics/compatibility', s.prompt.includes('历史 rolePresence / texture / antiAiCadence / surfaceBudget / turnShape / roleBehavior / expressionPlan 只保留在服务器诊断或兼容层'));
check('Prompt does not install Runtime HOW/HOW-MUCH planning beside Role/Identity Prompt', s.prompt.includes('它们不规定客户可见措辞、字数、句数、顺序、节奏或消息数量') && s.prompt.includes('具体回复、自然长短与 segments 划分仍在这一次生成中完成') && !s.prompt.includes('对话是逐轮参与，不是一次性报告') && !s.prompt.includes('不要机械逐项扫描、逐项给方案'));
check('Role/Identity persisted prompt chain still exists', s.resolved.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && s.resolved.includes('generationPrompt'));
check('Upstream HumanTurn rich surface fields remain server-side for diagnostics compatibility', /texture:/.test(s.human) && /antiAiCadence:/.test(s.human) && /surfaceBudget:/.test(s.human) && /adaptation:/.test(s.human));
check('Kernel records Human Realization HOW Authority Final Clearance v1.46', s.kernel.includes('V1.46 Human Realization HOW Authority Final Clearance'));
check('No role/domain/test sentence/keyword/fixed quota branch added', !/(碎花裙|咬沙发|柯基|女装客服|SaaS客服|外卖员|牛仔裤|亚麻|fixed.{0,12}(chars|sentences|bubbles)|固定.{0,8}(字数|句数|气泡数))/i.test(s.authority+'\n'+s.prompt+'\n'+s.compiler+'\n'+s.interaction));
check('No new planner/gate/judge/repair/retry/model call authority added', !/(HumanizationPlanner|HumanizationGate|HumanizationJudge|PersonaRepair|SurfaceRewrite|HumanizationRetry|secondModelCall)/i.test(s.authority+'\n'+s.prompt));

const {compile}=loadFinalHumanTurnCompiler(root);
const contract={persona:{resolvedRoleIdentity:{generationPrompt:{role:'ROLE_PROMPT_X',identity:'IDENTITY_PROMPT_Y'}}},businessContext:{conversationStrategy:{policy:{humanBehavior:{}}}}};
const frame=normalizeFrame({humanTurnRealization:{needAlignment:{acknowledgementRealization:'EXPLICIT_REQUIRED'},sharedContext:{priorContributionStatus:'ACCEPTED',priorContributionReuse:'ADVANCE_FROM_ACCEPTED'},conversationReality:{continuity:{lastAssistantMoveAccepted:true,lastAssistantMoveRejected:false,recentRequestedDeltas:['MORE_SPECIFIC']},currentFeedback:{reception:'ACCEPTED',correctionTarget:null,requestedDeltas:[]}},surfaceBudget:{completionPolicy:'ALLOW_BRIEF_WRAP',stopAfterQuestion:true},adaptation:{relationshipDistance:'WARM'}}});
const out=compile(contract,frame);
check('Final compiler keeps Role then Identity prompt chain', out.surface.generationGuidance.role==='ROLE_PROMPT_X' && out.surface.generationGuidance.identity==='IDENTITY_PROMPT_Y');
check('Final compiler keeps relationship truth but drops rolePresence micro guidance', out.surface.relationshipContext.distance==='WARM' && !Object.prototype.hasOwnProperty.call(out.surface,'rolePresence'));
check('Final compiler drops texture/conversationForm/explicitPcSurface/adaptation micro-control objects', !['texture','conversationForm','explicitPcSurface','adaptation'].some(k=>Object.prototype.hasOwnProperty.call(out.surface,k)));
check('Final realization preserves current-turn contribution and question authority', out.realization.primary.contribution==='ANSWER' && out.realization.selectedComponents.customerInput.disposition==='NONE');
check('Historical requested delta remains continuity evidence and cannot leak into current feedback authority', out.realization.continuity.priorContributionStatus==='ACCEPTED' && out.realization.continuity.currentFeedback.requestedDeltas.length===0 && !Object.prototype.hasOwnProperty.call(out.realization.continuity,'priorContributionReuse'));
const sameTurnDelta=compile(contract,normalizeFrame({humanTurnRealization:{conversationReality:{continuity:{recentRequestedDeltas:[]},currentFeedback:{reception:'PARTIALLY_ACCEPTED',correctionTarget:null,requestedDeltas:['MORE_SPECIFIC']}}}}));
check('Genuine current-turn requested delta remains model-facing', sameTurnDelta.realization.continuity.currentFeedback.requestedDeltas.length===1 && sameTurnDelta.realization.continuity.currentFeedback.requestedDeltas[0]==='MORE_SPECIFIC');
check('Final realization preserves required acknowledgement through Canonical Plan without a duplicate false flag', out.realization.canonicalPlan.requiredActs.some(item=>item.type==='PRESENCE_ACK') && !Object.prototype.hasOwnProperty.call(out.realization.selectedComponents,'acknowledgement'));
check('Final realization no longer contains support/order/completion HOW objects', !['support','ordering','completion'].some(k=>Object.prototype.hasOwnProperty.call(out.realization,k)));

for(const rel of [f.module,f.compiler,f.interaction,f.plan,f.authority,f.prompt,f.kernel,f.legacyAdapter,f.interactionPlanType,retired]) check(`${path.basename(rel)} TypeScript syntax`, syntax(rel));
console.log(`\nHuman Realization Authority Convergence: ${pass}/${pass+fail} PASS`);
if(fail) process.exit(1);
