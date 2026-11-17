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
function check(name, ok, detail='') {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`); }
}
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
const builder = loadPromptBuilder();
const valueOnly = builder.buildCurrentCanonicalExecutionSystemSection({
  canonicalPlan: {
    requiredActs: [{ type:'DIRECT_ANSWER', necessity:'REQUIRED', parameters:{} }],
    preferredActs: [],
    optionalActs: [],
    forbiddenActs: [],
    completion: 'ALLOW_CONTINUATION',
  },
  selectedComponents: {
    customerInput: { selected:false, disposition:'NONE', completionDependency:'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN' },
  },
});
const withReception = builder.buildCurrentCanonicalExecutionSystemSection({
  canonicalPlan: {
    requiredActs: [{ type:'DIRECT_ANSWER', necessity:'REQUIRED', parameters:{} }],
    preferredActs: [{ type:'EMOTIONAL_ACK', necessity:'PREFERRED', parameters:{} }],
    optionalActs: [],
    forbiddenActs: [],
    completion: 'ALLOW_CONTINUATION',
  },
  selectedComponents: {
    customerInput: { selected:false, disposition:'NONE', completionDependency:'NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN' },
  },
});
const persona = builder.buildRoleIdentityPersonaSystemSection({
  authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1',
  semanticAuthority: 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
  role: 'generic role how',
  identity: null,
});

check('value-only plan denies any independently functioning social contribution rather than only a prefacing position',
  valueOnly.includes('CURRENT_SEMANTIC_PERMIT=')
    && valueOnly.includes('本轮没有独立 relation/reception semantic owner'));
check('functional deletion test is position-independent through neutral realization of the same selected Acts',
  valueOnly.includes('中性实现同一组 selected Acts')
    && valueOnly.includes('可完全删除'));
check('unauthorized reception fails when deletion leaves selected answer value unchanged',
  valueOnly.includes('删除后不损失这些 Acts 实际判断、信息、风险、选择、行动或已选关系任务'));
check('Role/Identity HOW is expression-only beneath the selected Canonical permit',
  persona.includes('PERSONA_SEMANTIC_CAPABILITY=')
    && persona.includes('\"semanticAuthority\":\"EXPRESSION_ONLY_NO_SEMANTIC_DELTA\"'));
check('legitimate answer-owned judgment remains allowed by selected value function',
  valueOnly.includes('实际判断、信息、风险、选择、行动'));
check('selected reception Act remains authorized and does not trigger value-only denial branch',
  withReception.includes('receptionContribution=SELECTED(EMOTIONAL_ACK)')
    && !withReception.includes('本轮没有独立 relation/reception semantic owner'));
check('Persona carrier exposes no independent relation/reception authority without a selected reception Act',
  persona.includes('Selected reception Acts: none.')
    && persona.includes('no independent relation/reception speech-act authority'));
check('R1 regression patch is semantic and contains no observed Live sentence fixture',
  !/(这个担心很常见|你担心得也对|发声玩具|广州夏天确实闷热)/u.test(source));
check('R1 regression patch adds no lexical blacklist, frequency detector, rewrite, or second model/judge path',
  !/(tokenBlacklist|phraseBlacklist|phraseFrequency|receptionJudge|normalizationJudge|rewriteCandidate|replaceGenerated)/i.test(source));
check(`active generation kernel ${generationKernel?.version || 'MISSING'} retains v1.91 and v1.93 R1 regression history`,
  retainsRequiredKernelLineage
    && kernel.includes('V1.91 P0-5 R1 Regression-only Cross-layer Reception Authority Seal')
    && kernel.includes('V1.93 P0-5 R1 Regression-only Canonical Speech-Act Permit Convergence'));
console.log(`\nR1.16 Cross-layer Reception Authority Seal: ${pass}/${pass+fail} PASS`);
if (fail) process.exit(1);
