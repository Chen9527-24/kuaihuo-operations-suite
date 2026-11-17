#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}
function syntax(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: rel,
  });
  return !(out.diagnostics || []).some((d) => d.category === ts.DiagnosticCategory.Error);
}
function loadTsModule(rel) {
  const js = ts.transpileModule(read(rel), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: rel,
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
  };
  vm.runInNewContext(js, sandbox, { filename: rel });
  return module.exports;
}

const rels = {
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  authority: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  resolved: 'src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts',
  contract: 'src/modules/customer-service-agent/runtime/compiler/types/runtime-reply-contract.type.ts',
  compiler: 'src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts',
  languagePolicy: 'src/modules/customer-service-agent/shared/context/customer-service-language-policy.util.ts',
  kernel: 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
  languagePolicyDto: 'src/modules/customer-service-agent/admin/context-profiles/dto/customer-service-context-profile.dto.ts',
};
const s = Object.fromEntries(Object.entries(rels).map(([k, v]) => [k, read(v)]));

check('current kernel preserves P0-2 Authority convergence',
  s.kernel.includes('V1.51 P0-2 Expression Authority Convergence'));
check('Role -> Identity generationGuidance remains persisted configuration while the typed Persona surface is the sole ordinary model-facing HOW projection',
  s.authority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'")
    && s.authority.includes("authority: 'STRUCTURED_PERSONA_SURFACE_ONLY_V1'")
    && s.prompt.includes('PERSONA_SURFACE_PROFILE='));
check('ordinary model-facing PC policy is renamed to constraint-only languagePolicyConstraints',
  s.prompt.includes('languagePolicyConstraints: [...contract.businessContext.languagePolicyConstraints]')
    && s.contract.includes('languagePolicyConstraints: string[];')
    && !s.prompt.includes('promptInstructions: [...contract.businessContext.promptInstructions]'));
check('Language Policy compiler is constraint-only and no longer compiles free-form styleGuidance',
  s.compiler.includes('buildLanguagePolicyConstraintInstructions(businessContext.languagePolicies)')
    && s.languagePolicy.includes('export function buildLanguagePolicyConstraintInstructions')
    && s.languagePolicy.includes('does not translate free-form style guidance into prompt text'));
check('styleGuidance remains persisted/readable for compatibility instead of destructive schema removal',
  s.languagePolicy.includes('styleGuidance: Record<string, unknown>')
    && s.languagePolicy.includes('styleGuidance: asRecord(policy.styleGuidance)'));
check('API documents styleGuidance as compatibility/admin-only for ordinary HVE Persona HOW',
  s.languagePolicyDto.includes('普通 HVE Generation 不再将其作为 Persona HOW')
    && s.languagePolicyDto.includes('Role / Identity generationPrompt'));
check('Runtime strategy policy no longer projects Language Policy preferredExpressions from styleGuidance',
  !s.compiler.includes('languagePolicy.styleGuidance.preferredExpressions'));
check('ordinary prompt explicitly prevents styleGuidance from becoming a second Persona HOW',
  s.prompt.includes('`styleGuidance` 不再进入普通 Generation，不能成为第二套 Persona HOW'));
check('model-facing frame does not expose raw languagePolicies or styleGuidance',
  !/languagePolicies\s*:/.test(s.prompt.slice(s.prompt.indexOf('function buildHveModelFacingGenerationFrame'), s.prompt.indexOf('function normalizeContinuityEvidenceText')))
    && !/styleGuidance\s*:/.test(s.prompt.slice(s.prompt.indexOf('function buildHveModelFacingGenerationFrame'), s.prompt.indexOf('function normalizeContinuityEvidenceText'))));
check('source-bound summary reuses the same final HumanTurn surface instead of creating a second style authority',
  s.prompt.includes('const humanPresence = compileCustomerServiceFinalModelFacingHumanTurn(contract, frame)')
    && s.prompt.includes('buildRoleIdentityPersonaSystemSection(generationGuidance)')
    && s.prompt.includes('surface: { ...modelFacingSurface }'));
check('Role and Identity persisted prompts remain independently configurable inside one ordered chain',
  s.resolved.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'")
    && s.resolved.includes('role: roleGenerationPrompt')
    && s.resolved.includes('identity: identityGenerationPrompt'));
check('no role/domain/test-sentence branch was added by P0-2',
  !/(女装客服|宠物顾问|SaaS客服|外卖员|碎花裙|牛仔裤|大黄|雪球|团子|roleCode\s*===|industryCode\s*===)/i.test(s.prompt + '\n' + s.authority + '\n' + s.languagePolicy));
check('no new Planner/Gate/Judge/Repair/Retry/Fallback authority was added by P0-2',
  !/(ExpressionPlanner|ExpressionGate|ExpressionJudge|PersonaRepair|StyleRewrite|ExpressionRetry|ExpressionFallback|secondModelCall)/i.test(s.prompt + '\n' + s.authority + '\n' + s.languagePolicy));
check('P0-2 does not introduce fixed chars/sentences/bubbles into final Persona HOW',
  !/(softMaxChars|maxValueUnits|maxPreQuestionClauses|maxPresentedOptions|maxSentences|maxQuestions|fixed.{0,8}(chars|sentences|bubbles)|固定.{0,8}(字数|句数|气泡数))/i.test(s.authority));

const policyModule = loadTsModule(rels.languagePolicy);
const buildConstraints = policyModule.buildLanguagePolicyConstraintInstructions;
check('constraint compiler function is executable', typeof buildConstraints === 'function');
if (typeof buildConstraints === 'function') {
  const styleOnly = buildConstraints([{
    id: 'p1', code: 'STYLE_ONLY', name: 'Style only', scopeType: 'ROLE', scopeKey: 'r1', priority: 1, revision: 1,
    styleGuidance: { tone: 'warm', preferredExpressions: ['hello'] },
    rules: [],
  }]);
  check('styleGuidance-only policy produces zero model-facing constraints', Array.isArray(styleOnly) && styleOnly.length === 0, JSON.stringify(styleOnly));

  const withRules = buildConstraints([{
    id: 'p2', code: 'RULES', name: 'Rules', scopeType: 'ROLE', scopeKey: 'r1', priority: 1, revision: 1,
    styleGuidance: { tone: 'warm' },
    rules: [
      { key: 'r1', type: 'FORBIDDEN_PHRASE', pattern: '内部口径', replacement: null, position: 'ANYWHERE', action: 'BLOCK', severity: 'ERROR', enabled: true, exceptions: [], limit: null },
      { key: 'r2', type: 'FORBIDDEN_PHRASE', pattern: '仅诊断', replacement: null, position: 'ANYWHERE', action: 'WARN', severity: 'WARNING', enabled: true, exceptions: [], limit: null },
    ],
  }]);
  check('typed explicit policy rule remains model-facing as a constraint', Array.isArray(withRules) && withRules.some((x) => String(x).includes('内部口径')), JSON.stringify(withRules));
  check('WARN-only language rule remains non-directive', !withRules.some((x) => String(x).includes('仅诊断')), JSON.stringify(withRules));
}

for (const rel of Object.values(rels)) check(`${path.basename(rel)} TypeScript syntax`, syntax(rel));

console.log(`\nP0-2 Expression Authority Convergence: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
