#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.error(`FAIL ${name}`); } }
function syntax(rel) {
  const out = ts.transpileModule(read(rel), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true }, reportDiagnostics: true, fileName: rel });
  return !(out.diagnostics || []).some(d => d.category === ts.DiagnosticCategory.Error);
}

const files = {
  schema: 'prisma/schema.prisma',
  createDto: 'src/modules/customer-service-agent/admin/merchant-roles/dto/create-merchant-role.dto.ts',
  updateDto: 'src/modules/customer-service-agent/admin/merchant-roles/dto/update-merchant-role.dto.ts',
  roleService: 'src/modules/customer-service-agent/admin/merchant-roles/customer-service-merchant-roles.service.ts',
  resolvedRole: 'src/modules/customer-service-agent/runtime/role/customer-service-resolved-role-identity-context.ts',
  compiler: 'src/modules/customer-service-agent/runtime/compiler/customer-service-runtime-contract-compiler.service.ts',
  finalAuthority: 'src/modules/customer-service-agent/runtime/generation/customer-service-final-realization-authority.ts',
  prompt: 'src/modules/customer-service-agent/runtime/generation/customer-service-generation-prompt.builder.ts',
  generator: 'src/modules/customer-service-agent/runtime/generation/customer-service-reply-generator.service.ts',
  delivery: 'src/modules/customer-service-agent/runtime/generation/customer-service-message-delivery-planner.ts',
  hve3: 'src/modules/customer-service-agent/runtime/generation/customer-service-hve3-execution.service.ts',
  kernel: 'src/modules/customer-service-agent/runtime/generation/customer-service-prompt-kernel.registry.ts',
  defaultPrompt: 'src/modules/customer-service-agent/admin/foundation/templates/customer-service-generation-prompt.template.ts',
  roleTemplate: 'src/modules/customer-service-agent/admin/foundation/templates/customer-service-ali-flagship.template.ts',
};
const s = Object.fromEntries(Object.entries(files).map(([k,v]) => [k, read(v)]));

check('Merchant Role owns a persistent role-level generationPrompt field', s.schema.includes('generationPrompt String?'));
check('Merchant Role create/update API exposes generationPrompt without embedding business facts', s.createDto.includes('generationPrompt?: string') && s.updateDto.includes('generationPrompt?: string'));
check('Merchant Role service persists normalized generationPrompt', s.roleService.includes('generationPrompt: normalizePromptText') && s.roleService.includes('normalizePromptText'));
check('Resolved Role compiles role + identity prompt chain from MerchantRole and AccountProfile', s.resolvedRole.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && s.resolvedRole.includes("generationPrompt.role") && s.resolvedRole.includes("generationPrompt.identity") && s.resolvedRole.includes('account.generationPrompt'));
check('Runtime compiler consumes the actual MerchantRole generationPrompt', s.compiler.includes('generationPrompt: role.generationPrompt'));
check('Role/identity generation prompts are merged into the one final surface authority', s.finalAuthority.includes("generationGuidance: {") && s.finalAuthority.includes("authority: 'ROLE_IDENTITY_PROMPT_CHAIN_V1'") && s.finalAuthority.includes('contract.persona?.resolvedRoleIdentity?.generationPrompt.role') && s.finalAuthority.includes('contract.persona?.resolvedRoleIdentity?.generationPrompt.identity'));
check('Prompt Builder compiles one Role/Identity system carrier rather than parallel prompt authorities', !s.prompt.includes('【角色级生成 Prompt】') && !s.prompt.includes('【身份级生成 Prompt】') && s.prompt.includes('【Current Role / Identity Persona HOW】') && s.prompt.includes('projectHveModelFacingContextTransport'));
check('Prompt separates current-turn semantic authority from persisted configuration and the one typed runtime HOW surface', s.prompt.includes('`humanPresence.realization` 是 Generation 唯一的当前轮行为/语义边界') && s.prompt.includes('PERSONA_SURFACE_PROFILE=') && s.prompt.includes('ordinary Generation 不接收持久化 Role / Identity 的 free-form Prompt 原文'));
check('Editable default Role Prompt delegates wording/length/rhythm/message count to the mature model instead of hidden Runtime prose', s.defaultPrompt.includes('具体怎么说、自然说多少、分几条消息，由当前对话决定') && !s.prompt.includes('成熟模型在这一次生成中完成客户可见回复的具体措辞、自然长短、聊天节奏和实际发送消息划分'));
check('Ordinary output contract is canonical HVE_REPLY_V2 Act-bound segments', s.prompt.includes('HVE_REPLY_V2') && s.prompt.includes('segments 中每个元素仍是一条实际发送消息') && s.prompt.includes('units 是同一实际消息的 semantic binding'));
check('Newline/paragraph text is not a Runtime message-boundary authority', s.prompt.includes('只有 segments 数组元素边界才是实际发送消息边界') && s.prompt.includes('units 只做语义绑定，不改变消息边界') && !s.generator.includes('splitExplicitChatPresentationBoundaries'));
check('Ordinary HVE uses provider JSON-object mode while Runtime keeps exact HVE_REPLY schema authority', s.generator.includes("['HVE3_CANDIDATE', 'HVE_ACTIVE'].includes(String(lane))") && s.generator.includes('jsonMode: usesStructuredHveJsonProtocol(contract)'));
check('Protocol normalizer parses V2 + legacy compatibility while current HVE cannot bypass V2 authorization', s.generator.includes("protocol: 'HVE_REPLY_V2' | 'HVE_REPLY_V1' | 'LEGACY_PRESENTATION_V1' | 'NONE'") && s.generator.includes('root.presentationSegments') && s.generator.includes('requiresActBoundHveReplyV2') && s.generator.includes('HVE_REPLY_V2_REQUIRED'));
check('Delivery consumes model segments exactly and does not cap/merge/re-split them', s.delivery.includes('GENERATION_PRESENTATION_INTENT') && !/limitSegments|policy\.maxSegments|splitThresholdChars|typedSegmentation|humanSegmentation|HUMAN_TURN_SEQUENTIAL/.test(s.delivery));
check('Delivery has no punctuation/paragraph/length/domain segmentation logic', !/splitNaturalPresentationParagraphs|splitIndependentPresentationUnits|splitFinalFollowUpQuestion|splitDraft|roleCode|industryCode/.test(s.delivery));
check('Explicit PC SINGLE remains the only operator-owned display collapse', s.delivery.includes("policy.mode === 'SINGLE'") && s.delivery.includes('PC_EXPLICIT'));
check('HVE diagnostics expose prompt configuration only as booleans, not private prompt text', s.hve3.includes('roleConfigured: Boolean') && s.hve3.includes('identityConfigured: Boolean') && !/generationPrompt:\s*resolved\.generationPrompt\s*[,}]/.test(s.hve3));
check('Generation kernel records responsibility-boundary and prompt-config convergence', s.kernel.includes('V1.43 Generation Responsibility Boundary Correction') && s.kernel.includes('V1.44 Prompt Configuration Convergence'));
check('No role/domain/test-sentence Runtime branch is introduced by this correction', !/(碎花裙|咬沙发|柯基|女装客服|SaaS客服|外卖员|牛仔裤|亚麻)/.test(s.prompt + s.generator + s.delivery + s.finalAuthority));

for (const rel of [files.createDto, files.updateDto, files.roleService, files.resolvedRole, files.compiler, files.finalAuthority, files.prompt, files.generator, files.delivery, files.hve3, files.kernel]) {
  check(`${path.basename(rel)} TypeScript syntax`, syntax(rel));
}

console.log(`\nGeneration Responsibility Boundary: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
