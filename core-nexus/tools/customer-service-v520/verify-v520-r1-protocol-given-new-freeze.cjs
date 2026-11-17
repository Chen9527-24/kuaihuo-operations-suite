#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=path.resolve(__dirname,'../..');let pass=0,fail=0;
function check(name,ok,detail=''){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}${detail?` :: ${detail}`:''}`)}}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function syntax(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true},reportDiagnostics:true,fileName:rel});check(`${path.basename(rel)} TypeScript syntax`,!(out.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error));return{src,out}}

const promptRel='src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const generatorRel='src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts';
const prompt=syntax(promptRel);const generator=syntax(generatorRel);

const box={exports:{},module:{exports:{}},require:id=>{
  if(id==='@nestjs/common')return{Injectable:()=>t=>t};
  if(id.includes('customer-service-nlg-execution-brief'))return{compileCustomerServiceNlgSemanticFrameV1:()=>({})};
  if(id.includes('customer-service-final-realization-authority'))return{compileCustomerServiceFinalModelFacingHumanTurn:()=>({})};
  return{};
},console,process};box.module.exports=box.exports;
vm.runInNewContext(prompt.out.outputText,box,{filename:promptRel});
const project=box.exports.buildHveReplyV2ProtocolRequirementProjection;
const projection=project({canonicalPlan:{requiredActs:[{id:'A1',type:'DIRECT_ANSWER',necessity:'REQUIRED'},{id:'S1',type:'STOP',necessity:'REQUIRED'}],preferredActs:[{id:'P1',type:'PROVIDE_GENERAL_GUIDANCE',necessity:'PREFERRED'}],optionalActs:[]}});
check('protocol requirement projection preserves Required visible Act ids/types',projection.visibleRequiredBindings.length===1&&projection.visibleRequiredBindings[0].actId==='A1'&&projection.visibleRequiredBindings[0].actType==='DIRECT_ANSWER');
check('STOP remains control-only in protocol requirement projection',projection.controlOnlyRequiredActs.length===1&&projection.controlOnlyRequiredActs[0].actId==='S1'&&!projection.selectedBindingUniverse.some(x=>x.actId==='S1'));
check('selected binding universe is a lossless projection, not a second planner',projection.selectedBindingUniverse.some(x=>x.actId==='A1')&&projection.selectedBindingUniverse.some(x=>x.actId==='P1')&&projection.authority==='LOSSLESS_CANONICAL_PROTOCOL_PROJECTION');

check('generator owns only initial call plus the existing single recovery call',(generator.src.match(/modelGateway\.generate\(/g)||[]).length===2);
check('protocol-invalid initial result reuses the existing recovery slot',generator.src.includes("initialProtocolFailure\n          ? this.promptBuilder.buildProtocolRecovery(contract)\n          : this.promptBuilder.buildAvailabilityRecovery(contract)"));
check('protocol recovery uses deterministic temperature without adding a retry',generator.src.includes('temperature: initialProtocolFailure ? 0 : 0.3'));
check('protocol failure still preserves recoverable provider-visible content under non-veto seal',generator.src.includes('NON_EMPTY_PROVIDER_CONTENT_CANNOT_BECOME_MODEL_AVAILABILITY')&&generator.src.includes('extractRecoverableProviderVisibleSegments'));

check('protocol recovery prompt carries explicit Required-visible binding checklist',prompt.src.includes('HVE_REPLY_V2_PROTOCOL_REQUIREMENTS')&&prompt.src.includes('visibleRequiredBindings')&&prompt.src.includes('controlOnlyRequiredActs'));
check('protocol recovery does not relax Required Acts',prompt.src.includes('EVERY_REQUIRED_VISIBLE_ACT_MUST_HAVE_REAL_CUSTOMER_VISIBLE_REALIZATION')&&prompt.src.includes('不要因为两个 Required Acts 语义接近就漏掉其中一个'));
check('Given-New economy treats customer-provided facts as evidence rather than default visible value',prompt.src.includes('【Given-New Realization Economy】')&&prompt.src.includes('默认是证据输入（GIVEN）')&&prompt.src.includes('否则保持 implicit，直接给本轮新增价值'));
check('Given-New economy uses decision delta rather than banning analysis/restatement',prompt.src.includes('没有 decision delta')&&prompt.src.includes('只有当显式提到/解释某个 GIVEN 本身会实质改变')&&prompt.src.includes('允许为消歧或连接新判断做最小必要引用'));
check('new closure contains no domain/test/word blacklist examples',!/(柯基|胯宽|广州|真丝|确实|特别对|customerMessage\.includes|industryCode\s*===|roleCode\s*===)/.test(prompt.src));
const economyLine=prompt.src.split('\n').find(line=>line.includes('【Given-New Realization Economy】'))||'';
check('new closure introduces no fixed response length/sentence/message quota',!/(softMaxChars|maxValueUnits|maxPresentedOptions|\d+\s*(?:字|句|条|消息))/.test(economyLine));

console.log(`\nR1 Protocol + Given-New Freeze Readiness: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
