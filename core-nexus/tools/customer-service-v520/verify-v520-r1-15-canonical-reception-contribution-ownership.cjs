#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const rel = 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts';
const kernelRel = 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts';
const source = fs.readFileSync(path.join(root, rel), 'utf8');
const kernel = fs.readFileSync(path.join(root, kernelRel), 'utf8');

// Read the active GENERATION descriptor, not an exact version string anywhere
// in the registry. This gate protects retained R1 semantics across later kernels.
const kernelModule = { exports: {} };
const kernelCode = ts.transpileModule(kernel, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: kernelRel,
}).outputText;
Function('exports', 'module', 'require', kernelCode)(kernelModule.exports, kernelModule, request => {
  if (request === 'crypto') return require('node:crypto');
  throw new Error(`Unexpected kernel dependency: ${request}`);
});
const generationKernel = kernelModule.exports.getCustomerServicePromptKernel('GENERATION');
const generationVersion = /^hve-3-v1\.(\d+)$/.exec(generationKernel?.version || '');
const retainsRequiredKernelLineage = generationKernel?.id === 'customer-service-generation-kernel'
  && generationKernel.family === 'GENERATION'
  && generationVersion !== null && Number(generationVersion[1]) >= 93;

let pass = 0, fail = 0;
function check(name, ok, detail='') { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); } }
function loadPromptBuilder() {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
    fileName: rel,
  });
  const loaded = { exports: {} };
  const localRequire = request => {
    if (request === '@nestjs/common') return { Injectable: () => target => target };
    if (request === './customer-service-nlg-execution-brief') return { compileCustomerServiceNlgSemanticFrameV1: () => ({}) };
    if (request === './customer-service-final-realization-authority') return { compileCustomerServiceFinalModelFacingHumanTurn: () => ({}) };
    throw new Error(`Unexpected verifier dependency: ${request}`);
  };
  Function('exports','module','require',compiled.outputText)(loaded.exports, loaded, localRequire);
  return loaded.exports;
}
function probe(requiredActs=[], preferredActs=[], optionalActs=[]) {
  return loadPromptBuilder().buildCurrentCanonicalExecutionSystemSection({
    canonicalPlan: { requiredActs, preferredActs, optionalActs, forbiddenActs: [], completion: 'ALLOW_CONTINUATION' },
    selectedComponents: { customerInput: { selected:false, disposition:'NONE', completionDependency:'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN' } },
  });
}
const valueOnly = probe([{ type:'DIRECT_ANSWER', necessity:'REQUIRED', parameters:{} }]);
const emotional = probe([{ type:'DIRECT_ANSWER', necessity:'REQUIRED', parameters:{} }], [{ type:'EMOTIONAL_ACK', necessity:'PREFERRED', parameters:{} }]);
const maintenance = probe([{ type:'PROVIDE_GENERAL_GUIDANCE', necessity:'REQUIRED', parameters:{} }], [], [{ type:'RELATIONSHIP_MAINTENANCE', necessity:'OPTIONAL', parameters:{} }]);
check('value-only Canonical Plan explicitly denies independent relational reception contribution',
  valueOnly.includes('CURRENT_SEMANTIC_PERMIT=')
    && valueOnly.includes('\"receptionContribution\":\"NOT_SELECTED\"')
    && valueOnly.includes('本轮没有独立 relation/reception semantic owner'));
check('value-only boundary preserves legitimate answer-owned judgment by selected-act function',
  valueOnly.includes('删除后不损失这些 Acts 实际判断、信息、风险、选择、行动或已选关系任务'));
check('selected emotional acknowledgement remains authorized by existing Canonical Act',
  emotional.includes('receptionContribution=SELECTED(EMOTIONAL_ACK)')
    && !emotional.includes('本轮没有独立 relation/reception semantic owner'));
check('selected relationship maintenance remains authorized without making it required',
  maintenance.includes('receptionContribution=SELECTED(RELATIONSHIP_MAINTENANCE)')
    && maintenance.includes('只允许实现这些已选 reception Acts 自己的语义'));
check('R1.15 derives reception authority from selected Canonical Acts, not RoleBehavior diagnostics',
  source.includes('realization.canonicalPlan.receptionContribution')
    && source.includes('selectedRelationalReceptionActs')
    && !source.includes('roleBehavior.reassurance'));
check('R1.15 does not add observed phrase/token/frequency special casing',
  !/(词频阈值|phraseFrequency|tokenBlacklist|utteranceFixture|domainFixture)/.test(source));
check('R1.15 does not add generation post-processing or another model call',
  !/(replaceGenerated|rewriteCandidate|receptionJudge|normalizationJudge)/i.test(source)
    && (source.match(/modelGateway\.generate\(/g) || []).length === 0);
check(`active generation kernel ${generationKernel?.version || 'MISSING'} retains v1.88 R1.15 and v1.93 ownership history`,
  retainsRequiredKernelLineage
    && kernel.includes('V1.88 P0-5 R1.15 Canonical Reception Contribution Ownership plus R2.1 Natural Constraint Producer Robustness')
    && kernel.includes('Canonical WHAT authorization')
    && kernel.includes('V1.93 P0-5 R1 Regression-only Canonical Speech-Act Permit Convergence'));
console.log(`\nR1.15 Canonical Reception Contribution Ownership: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
