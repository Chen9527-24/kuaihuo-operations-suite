#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),ts=require('typescript');
const {loadFinalHumanTurnCompiler,normalizeFrame}=require('./_final-human-turn-test-helper.cjs');
const root=path.resolve(__dirname,'../..'); const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts', authorityRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const prompt=read(promptRel),authority=read(authorityRel),system=prompt.slice(prompt.indexOf('function buildHumanConversationSystemPrompt'),prompt.indexOf('function buildHveModelFacingGenerationFrame'));
let pass=0,fail=0;const check=(n,o)=>{if(o){pass++;console.log(`PASS ${n}`)}else{fail++;console.error(`FAIL ${n}`)}};
function syntax(r){const o=ts.transpileModule(read(r),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},reportDiagnostics:true,fileName:r});return !(o.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error)}
check('Final realization still derives current-turn WHAT from existing HumanTurn/Plan', /contribution:\s*human\.needAlignment\.primaryContribution/.test(authority)&&/target:\s*frame\.serviceRealization\.contribution\.target/.test(authority));
check('Question/identity authority remains upstream Canonical-owned', /requiredCustomerInputSelected[\s\S]*requiredActTypes\.has/.test(authority)&&/disposition:\s*customerInputDisposition/.test(authority)&&/selected:\s*canonicalIdentityMode !== 'NONE'/.test(authority));
check('Role/Identity Prompt replaces legacy high-fidelity surface micro-control', /generationGuidance:/.test(authority)&&/ROLE_IDENTITY_PROMPT_CHAIN_V1/.test(authority)&&!/(rolePresence\s*:|texture\s*:|conversationForm\s*:|explicitPcSurface\s*:)/.test(authority));
check('Relationship truth remains model-facing without message-shape mirroring controls', /relationshipContext:/.test(authority)&&!/customerMessageShape|mirrorIntensity|varyFromRecentStructure/.test(authority));
check('Contribution economy exposes no numeric length/sentence quotas', !/softMaxChars|maxValueUnits|maxPreQuestionClauses|maxSentences|maxQuestions/.test(authority));
check('General-domain content stays open under existing business boundary', system.includes('一般知识和普通话题默认可以正常回答'));
check('Generation hierarchy separates current-turn semantics from typed natural-expression surface projection', system.includes('唯一的当前轮行为/语义边界')&&system.includes('PERSONA_SURFACE_PROFILE=')&&system.includes('ordinary Generation 不接收持久化 Role / Identity 的 free-form Prompt 原文'));
check('Model owns wording length rhythm and message count', system.includes('它们不规定客户可见措辞、字数、句数、顺序、节奏或消息数量')&&system.includes('不存在固定配额'));
check('No role/industry/test-sentence generation branch', !/(宠物|柯基|女装|SaaS|外卖员|碎花裙)/i.test(authority+system));
check('No new gate/judge/repair/fallback/model call', !/(Humanizer|PersonaRepair|SurfaceRewrite|HumanizationRetry|secondModelCall)/.test(authority+prompt));
check('Final authority TypeScript transpiles', syntax(authorityRel)&&syntax(promptRel));
const {compile}=loadFinalHumanTurnCompiler(root); const c=(role=null)=>({persona:{resolvedRoleIdentity:{generationPrompt:{role,identity:null}}},businessContext:{conversationStrategy:{policy:{humanBehavior:{}}}}});
const direct=compile(c('ROLE_X'),normalizeFrame({})); const detail=compile(c('ROLE_X'),normalizeFrame({humanTurnRealization:{turnComposition:{semanticDelta:{responseTarget:{requestedSpecificity:'DETAIL',requiredDelta:'NEW_FACET'}}}}})); const disclosed=compile(c(),normalizeFrame({serviceRealization:{identity:{mode:'SERVICE_SCOPE',stopAfterAnswer:true}}}));
check('Runtime projection produces direct-answer scope without old surface controls', direct.realization.primary.contribution==='ANSWER'&&!Object.prototype.hasOwnProperty.call(direct.surface,'texture')&&!Object.prototype.hasOwnProperty.call(direct.surface,'rolePresence'));
check('Runtime Role Prompt is preserved as sole configurable HOW guidance', direct.surface.generationGuidance.role==='ROLE_X');
check('Runtime projection keeps identity latent by default', direct.realization.selectedComponents.identity.selected===false);
check('Runtime projection allows identity/service disclosure when selected upstream', disclosed.realization.selectedComponents.identity.selected===true&&disclosed.realization.selectedComponents.identity.mode==='SERVICE_SCOPE');
check('Runtime projection preserves DETAIL rather than globally shortening', detail.realization.primary.requestedSpecificity==='DETAIL');
console.log(`\nHuman Realization Phase A: ${pass}/${pass+fail} PASS`); if(fail)process.exit(1);
