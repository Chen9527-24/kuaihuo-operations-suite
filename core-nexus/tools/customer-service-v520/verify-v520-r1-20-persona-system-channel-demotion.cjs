#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const authorityRel='src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts';
const kernelRel='src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const prompt=fs.readFileSync(path.join(root,promptRel),'utf8');
const authority=fs.readFileSync(path.join(root,authorityRel),'utf8');
const kernel=fs.readFileSync(path.join(root,kernelRel),'utf8');
let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function loadPromptBuilder(deps={}){
  const compiled=ts.transpileModule(prompt,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},fileName:promptRel});
  const loaded={exports:{}};
  const localRequire=req=>{
    if(req==='@nestjs/common')return{Injectable:()=>t=>t};
    if(req==='./customer-service-nlg-execution-brief')return{compileCustomerServiceNlgSemanticFrameV1:deps.compileFrame||(()=>({}))};
    if(req==='./customer-service-final-realization-authority')return{compileCustomerServiceFinalModelFacingHumanTurn:deps.compileHumanTurn||(()=>({}))};
    throw new Error(`Unexpected verifier dependency: ${req}`);
  };
  Function('exports','module','require',compiled.outputText)(loaded.exports,loaded,localRequire);
  return loaded.exports;
}
const guidance={
  authority:'ROLE_IDENTITY_PROMPT_CHAIN_V1',
  semanticAuthority:'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
  semanticProjection:{
    authority:'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY',
    selectedActTypes:['DIRECT_ANSWER'],
    selectedReceptionActTypes:[],
    unselectedSemanticInstructions:'INERT_THIS_TURN',
    sourceTextRole:'EXPRESSION_SOURCE_DATA_ONLY',
  },
  surfaceProfile:{authority:'STRUCTURED_PERSONA_SURFACE_ONLY_V1',source:'ROLE_SPEAKER_PROJECTION',directness:60,formality:45,energy:50,colloquiality:'MEDIUM',sentenceShape:'MIXED',fragmentTolerance:'MEDIUM',ellipsisTolerance:'LOW',rhythmVariation:'MEDIUM',emoji:'LIGHT',sentenceParticleLevel:'LOW'},
  role:'ROLE_RAW_SEMANTIC_ACTION_SOURCE',
  identity:'IDENTITY_RAW_SEMANTIC_ACTION_SOURCE',
};
const builder=loadPromptBuilder();
const systemSection=builder.buildRoleIdentityPersonaSystemSection(guidance);
const sourceData=builder.buildRoleIdentityPersonaSourceData(guidance);
check('system channel contains one Canonical-derived Persona capability',
  systemSection.includes('PERSONA_SEMANTIC_CAPABILITY=')
  && systemSection.includes('"selectedActTypes":["DIRECT_ANSWER"]')
  && systemSection.includes('"selectedReceptionActTypes":[]'));
check('raw persisted Role/Identity Prompt text is absent from the system Persona section',
  !systemSection.includes('ROLE_RAW_SEMANTIC_ACTION_SOURCE')
  && !systemSection.includes('IDENTITY_RAW_SEMANTIC_ACTION_SOURCE')
  && !systemSection.includes('【Role Prompt】')
  && !systemSection.includes('【Identity Prompt】'));
check('persisted Role/Identity text stays server-side while ordinary Persona source projection is typed surface-only',
  guidance.role==='ROLE_RAW_SEMANTIC_ACTION_SOURCE'
  && guidance.identity==='IDENTITY_RAW_SEMANTIC_ACTION_SOURCE'
  && sourceData.authority==='STRUCTURED_PERSONA_SURFACE_ONLY_V1'
  && sourceData.source==='ROLE_SPEAKER_PROJECTION'
  && sourceData.semanticAuthority==='EXPRESSION_ONLY_NO_SEMANTIC_DELTA'
  && !Object.prototype.hasOwnProperty.call(sourceData,'role')
  && !Object.prototype.hasOwnProperty.call(sourceData,'identity'));
const transport=builder.projectHveModelFacingContextTransport({
  schemaVersion:2,
  speaker:{authority:'PC_RESOLVED_ROLE_IDENTITY_CONTEXT'},
  conversation:{recentConversation:[],priorSpeakerTurns:[]},
  humanPresence:{
    schemaVersion:1,
    authority:'FINAL_MODEL_FACING_HUMAN_TURN_V1',
    realization:{authority:'EXISTING_HUMAN_TURN_AND_CANONICAL_PLAN_ONLY'},
    surface:{authority:'FINAL_HUMAN_TURN_SURFACE_V1',relationshipContext:{distance:'WARM'},generationGuidance:guidance},
  },
  knowledge:{verifiedFacts:[],selectedEntries:[]},
  pcPolicy:{},
  responseAssets:[],
});
const transportJson=JSON.stringify(transport);
check('ordinary context excludes raw Role/Identity source and carries one typed Persona surface outside HumanTurn surface',
  !transportJson.includes('ROLE_RAW_SEMANTIC_ACTION_SOURCE')
  && !transportJson.includes('IDENTITY_RAW_SEMANTIC_ACTION_SOURCE')
  && transport.personaSurfaceProfile.authority==='STRUCTURED_PERSONA_SURFACE_ONLY_V1'
  && transport.personaSurfaceProfile.source==='ROLE_SPEAKER_PROJECTION'
  && !Object.prototype.hasOwnProperty.call(transport.humanPresence.surface,'generationGuidance'));
check('relationship distance remains factual context and does not become a second Persona source',
  transport.humanPresence.surface.relationshipContext.distance==='WARM'
  && !Object.prototype.hasOwnProperty.call(transport.humanPresence.surface,'rolePrompt')
  && !Object.prototype.hasOwnProperty.call(transport.humanPresence.surface,'accountVoice'));
const modelFacingStart=prompt.indexOf('export function buildHveModelFacingGenerationFrame(');
const modelFacingEnd=prompt.indexOf('/** Descriptive verification alias',modelFacingStart);
const modelFacingBody=prompt.slice(modelFacingStart,modelFacingEnd);
check('ordinary model-facing frame does not expose diagnostic Role Behavior or raw HumanTurn controls',
  !/(roleBehavior|expressionDynamics|surfaceBudget|turnShape|unresolvedNeed)/.test(modelFacingBody));
check('ordinary model-facing frame does not expose resolved Account Voice / Role capability prose as parallel Persona authority',
  !/(resolvedRoleExpression|accountCommunicationStyle|customerRelationship|roleCapabilityContext|accountExpression)/.test(modelFacingBody));
check('FinalHumanTurn keeps Canonical selected Acts as the exhaustive semantic permit',
  authority.includes("customerVisibleContributionScope: 'SELECTED_CANONICAL_ACTS_ONLY'")
  && authority.includes("personaSemanticDelta: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA'")
  && authority.includes('selectedReceptionActTypes: [...canonicalReceptionActTypes]'));
check('v1.96 transport change does not sanitize, classify or rewrite persisted Persona text',
  !/(sanitizePersona|filterPersona|stripPersona|classifyPersona|personaKeyword|tokenBlacklist|phraseBlacklist|rewritePersonaSource)/i.test(prompt+'\n'+authority));
check('v1.96 adds no second Persona, judge, repair, retry, fallback or post-generation rewrite',
  !/(SecondaryPersona|PersonaSelector|PersonaJudge|PersonaRepair|PersonaRetry|PersonaFallback|postGenerationPersona|rewriteGenerated)/i.test(prompt+'\n'+authority));
check('v1.96 source contains no observed role/domain/utterance fixture',
  !/(柯基|广州|胯宽|直筒裤|A字半身裙|恭喜你换了新工作|不用太担心)/u.test(prompt+'\n'+authority));
check('kernel advances to v1.96 and records system-channel demotion without opening R2.3',
  kernel.includes("version: 'hve-3-v1.99'")
  && kernel.includes('Persona System-Channel Demotion')
  && kernel.includes('R2.3 remains NOT STARTED'));
check('kernel records established-premise repetition only as future R2.4/R2.5 acceptance, not this closure implementation',
  kernel.includes('future R2.4 Contextual Extension and R2.5 Incremental Value acceptance case')
  && kernel.includes('it is not pulled into this R1 closure or R2.3 implementation'));
console.log(`\nR1.20 Persona System-Channel Demotion: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
