import { Injectable } from '@nestjs/common';
import { CustomerServiceRuntimeReplyContract } from '../compiler/types/runtime-reply-contract.type';
import {
  compileCustomerServiceNlgSemanticFrameV1,
  type CustomerServiceNlgSemanticFrameV1,
} from './customer-service-nlg-execution-brief';
import {
  compileCustomerServiceFinalModelFacingHumanTurn,
  type CustomerServiceFinalModelFacingHumanTurnV1,
} from './customer-service-final-realization-authority';

/**
 * Minimal HVE generation prompt.
 *
 * Runtime philosophy after Minimal Runtime Reduction:
 * - PC Role / Account / Store / Knowledge / Policy provide the current reality and identity.
 * - The model owns ordinary language understanding and answer generation.
 * - HumanTurn realization provides current-turn semantic scope and continuity facts.
 * - Role / Identity Prompt owns configurable natural expression; the mature model owns wording, length, rhythm and message count.
 * - No quality-rewrite / claim-rewrite prompt exists on the customer-visible HVE path.
 */
@Injectable()
export class CustomerServiceGenerationPromptBuilder {
  build(contract: CustomerServiceRuntimeReplyContract) {
    return buildHvePrompt(contract, 'PRIMARY');
  }

  buildCompact(contract: CustomerServiceRuntimeReplyContract) {
    return buildHvePrompt(contract, 'RECOVERY_RETRY');
  }

  buildAvailabilityRecovery(contract: CustomerServiceRuntimeReplyContract) {
    return buildHvePrompt(contract, 'AVAILABILITY_RECOVERY_TEXT');
  }

  buildProtocolRecovery(contract: CustomerServiceRuntimeReplyContract) {
    return buildHvePrompt(contract, 'PROTOCOL_RECOVERY_RETRY');
  }

  buildPlainAvailabilityRecovery(contract: CustomerServiceRuntimeReplyContract) {
    return buildPlainAvailabilityRecoveryPrompt(contract);
  }
}


function buildPlainAvailabilityRecoveryPrompt(contract: CustomerServiceRuntimeReplyContract) {
  const execution = contract.orchestrationPlan.interactionExecution;
  if (!execution) throw new Error('HVE plain availability recovery requires Interaction Execution Envelope');
  const frame = compileCustomerServiceNlgSemanticFrameV1({ contract, execution });
  const modelFrame = buildHveModelFacingGenerationFrame(contract, frame);
  const humanPresence = compileCustomerServiceFinalModelFacingHumanTurn(contract, frame);
  const recoveryContext = {
    schemaVersion: 1,
    authority: 'EXISTING_CANONICAL_AVAILABILITY_RECOVERY_ONLY',
    speaker: modelFrame.speaker,
    latestCustomerMessage: contract.groundedContext.latestCustomerMessage,
    recentConversation: modelFrame.conversation.recentConversation.slice(-6),
    activeTask: modelFrame.conversation.activeTask,
    primary: humanPresence.realization.primary,
    canonicalPlan: humanPresence.realization.canonicalPlan,
    selectedComponents: humanPresence.realization.selectedComponents,
    constraints: humanPresence.realization.constraints,
    answerAuthority: modelFrame.answerAuthority,
    knowledge: modelFrame.knowledge,
    pcPolicy: modelFrame.pcPolicy,
    personaSurfaceProfile: buildRoleIdentityPersonaSourceData(humanPresence.surface.generationGuidance),
  };
  return {
    system: [
      '你正在恢复同一轮已经完成理解、Canonical Plan 与 Grounding 选择的客户回复。这个调用只负责把既有语义范围实现成自然客户可见正文，不得重新规划任务、增加动作或改变权限。',
      '严格只实现 RECOVERY_CONTEXT.canonicalPlan 已选择的 Acts。未选择客户输入 Act 时不要追加问题；STOP/Completion 继续生效。',
      '具体商家、商品、订单、物流、政策、库存、价格、性能与效果事实只能来自 RECOVERY_CONTEXT.knowledge / pcPolicy 中当前可见且被既有 Grounding 允许的 server-owned evidence。一般领域建议只能在既有 Act 已允许时提供，不能借一般知识补成当前商品事实。',
      '这是 transport availability rescue，不是质量重写、第二 Planner、Judge 或事实补全器。不要提模型、系统、检索、Grounding、协议、恢复过程。',
      '只输出自然的客户可见回复正文，不要 JSON、Markdown 代码块、字段名、Act id、内部计划或诊断。',
    ].join('\n'),
    user: [
      'RECOVERY_CONTEXT:',
      JSON.stringify(recoveryContext),
      '',
      '请按上述既有 Canonical 语义和证据边界直接给客户正常回复。',
    ].join('\n'),
  };
}

function buildHvePrompt(
  contract: CustomerServiceRuntimeReplyContract,
  mode: 'PRIMARY' | 'RECOVERY_RETRY' | 'AVAILABILITY_RECOVERY_TEXT' | 'PROTOCOL_RECOVERY_RETRY',
) {
  const execution = contract.orchestrationPlan.interactionExecution;
  if (!execution) throw new Error('HVE generation requires Interaction Execution Envelope');
  const frame = compileCustomerServiceNlgSemanticFrameV1({ contract, execution });
  if (isCanonicalSourceBoundSummaryFrame(frame)) {
    return buildCanonicalSourceBoundSummaryPrompt(
      contract,
      frame,
      mode === 'PRIMARY' ? 'PRIMARY' : 'RECOVERY_RETRY',
    );
  }

  const modelFrame = buildHveModelFacingGenerationFrame(contract, frame);
  const protocolRequirements = buildHveReplyV2ProtocolRequirementProjection(modelFrame.humanPresence.realization);
  return {
    system: buildHumanConversationSystemPrompt(mode, modelFrame.humanPresence),
    user: [
      '【Current Conversation Context】',
      JSON.stringify(projectHveModelFacingContextTransport(modelFrame)),
      '',
      `HVE_REPLY_V2_PROTOCOL_REQUIREMENTS: ${JSON.stringify(protocolRequirements)}`,
      mode === 'PROTOCOL_RECOVERY_RETRY'
        ? '上一模型结果没有满足当前 HVE_REPLY_V2 机器结构。只恢复同一语义回答的机器结构：不得新增/删除 Canonical Acts，不做质量重写；返回前逐项确认 visibleRequiredBindings 均至少出现在一个 unit.bindings 中、controlOnlyRequiredActs 不作为客户可见 binding、每个 unit.bindings 非空、segment.text 严格等于 units[].text 拼接；若 primaryTaskSurface 非空，除最小 reception-only acknowledgement 外的首个实质 unit 必须绑定其中指定的 Required Act；并确认每个 unit.usedGroundingRefs 完整列出该 unit.text 实际消费的全部 Grounding refs，且与该 unit 全部 Grounded bindings 的 groundingRefs 并集严格一致；若同一可见消息同时消费多个不同 evidence，可保持同一 segment，但必须补全 refs 或拆成相邻 semantic units。'
        : '',
      '',
      '请直接基于上面的当前身份、关系、上下文、业务知识和用户最新消息进行自然对话。',
      '严格按 system 中 HVE_REPLY_V2 Act-bound 输出协议返回；具体回复、自然长短与 segments 划分仍在这一次生成中完成。',
      mode === 'PROTOCOL_RECOVERY_RETRY'
        ? '这是同一轮既有唯一 recovery call 的协议恢复用途，不新增调用：保持原回答目标，只重新生成合法 HVE_REPLY_V2。'
        : mode === 'RECOVERY_RETRY' || mode === 'AVAILABILITY_RECOVERY_TEXT'
          ? '这是模型可用性恢复，不是质量重写：保持同一身份、上下文和回答目标，重新正常回答。'
          : '',
    ].filter(Boolean).join('\n'),
  };
}

function buildHumanConversationSystemPrompt(
  mode: 'PRIMARY' | 'RECOVERY_RETRY' | 'AVAILABILITY_RECOVERY_TEXT' | 'PROTOCOL_RECOVERY_RETRY',
  humanPresence: CustomerServiceFinalModelFacingHumanTurnV1,
) {
  const generationGuidance = humanPresence.surface.generationGuidance;
  return [
    '你正在进行真实客户对话。Current Conversation Context 中的 Conversation Reality、Knowledge、Policy、Permission、Service Boundary 与真实执行状态属于 server-owned truth，不得虚构、篡改或越权。',
    '`humanPresence.realization` 是 Generation 唯一的当前轮行为/语义边界；其中 `canonicalPlan` 只是现有 Canonical InteractionPlan 的无损投影，不能被历史上下文或 Persona 新增、重开或替换。required Acts 是本轮必须完成的语义义务；preferred / optional Acts 只是已授权的非必做贡献，不能为了实现它们扩大 required 义务，也不能越过 completion；forbidden Acts 不得实现。控制类 Act 与 completion 是 Canonical WHAT 的执行边界：完成 required Acts 后必须服从已选 STOP / STOP_AFTER_REQUIRED，尚未实现的 preferred / optional 随之失效，不得继续创建任何未选贡献、追问或服务入口。若 HVE_REPLY_V2_PROTOCOL_REQUIREMENTS.primaryTaskSurface 非空，它只从现有 primary + Required Act 派生一个可执行主任务优先级：除最小 reception-only acknowledgement 外，首个实质 customer-visible unit 必须绑定指定 Required Act；这不创建新 Act，也不规定固定措辞、长度、候选数或消息数量。`primary.coverageObligation` 仍只定义当前重点的语义覆盖责任：SUFFICIENT_CURRENT_FOCUS 不得被 requestedSpecificity、历史反馈或 Persona 擅自升级为 COMPLETE_CURRENT_FOCUS；只有现有 Authority 明确给出 COMPLETE_CURRENT_FOCUS 时才承担完整覆盖。除此之外不规定客户可见措辞、字数、句数、顺序、节奏或消息数量。',
    '`humanPresence.realization.primary.requiredDelta / mustAddBeyondKnown / avoidReframeOnly` 是现有当前轮信息增量的完成条件。requiredDelta 不是 NONE 或 mustAddBeyondKnown=true 时，核心贡献必须加入 recentConversation 与既往贡献尚未提供、且属于当前 focus 的新判断、新信息、新选择或新动作；换一种说法、重新分组或重新列出既有内容不能完成该增量。avoidReframeOnly=true 时，只有框架变化而没有实质新增仍视为未完成。requiredDelta=NONE 且 mustAddBeyondKnown=false 时不得反向强求新内容。这只约束 WHAT 的语义兑现，不规定措辞、长度、列表、顺序或消息数量。',
    '`canonicalPlan.requiredActs[].parameters.target / decisionPurpose / expectedInformationGain` 是现有 Required Act 的当前轮语义完成条件。已选中的 Required value Act 必须在本轮真正完成；没有实现其 target / decisionPurpose 的背景铺垫、关系承接、复述、服务邀请或追问不能替代该核心贡献，也不能把已经授权的核心贡献留给客户下一轮再次索取。这只约束 WHAT 是否完成，不规定措辞、顺序、长度、步骤数或消息数。',
    '【Given-New Realization Economy】latestCustomerMessage、recentConversation、activeTask 与 memories 中已经由客户提供或已经建立的事实默认是证据输入（GIVEN），不是需要再次对客户朗读的 NEW_VALUE。只有当显式提到/解释某个 GIVEN 本身会实质改变当前已选 Act 的判断、风险、选择、动作、纠正、约束适配，或者它就是当前已选 reception/history/restatement Act 的必要实现时，才把它写成客户可见贡献；否则保持 implicit，直接给本轮新增价值。若删掉一段“你现在是X/这说明Y/也就是说Z”的分析后，后续同一判断与动作完全不变，则该分析没有 decision delta，不应作为独立可见铺垫。允许为消歧或连接新判断做最小必要引用，但不能靠反复复述来证明你记得上下文或理解了客户。该规则只控制既有 GIVEN 是否需要显式实现，不新增/删除 Canonical Acts，不规定固定句式、开头、长度、句数、领域或词表。',
    '对 GROUNDED_BUSINESS Act，`canonicalPlan.*Acts[].id / necessity / allowedGroundingRefs` 是同一 Canonical Act 的执行绑定，不是额外 Planner。`allowedGroundingRefs` 指向 Current Conversation Context.knowledge.selectedEntries 中该 Act 可实际使用的 server-owned evidence；Required Grounded Act 只有在客户可见贡献实际消费至少一个自身绑定且当前允许公开的 Grounding entry 时才完成。泛化类别/材质/方向可以完成一般 guidance，但不能替代一个仍未兑现的 Required Grounded Act；不要求固定候选数、固定推荐措辞或固定结构。',
    '【Business Fact Closed World】对具体商家、商品、服务、订单及其他业务对象的属性、规格、材质、性能/效果、价格、库存、优惠、物流、政策、状态、能力、保证或因果结论，只有当前可见的 server-owned Knowledge / Policy / Permission / Capability / execution truth 明确支持的命题才能作为该对象事实输出。不得把一般常识、经验、相邻属性或模型推测补成该业务对象未配置的新属性、性能结果、保证、因果或状态。客户本轮提出的需求、偏好、担忧、目标属性和期望结果只是选择条件，不是该业务对象事实的证据；不能因为客户要求某个属性或结果，就把被推荐对象写成已经具有该属性或结果。“适合某场景”或一个已支持的相邻属性只证明其自身，不自动蕴含该场景下客户期望的每个性能、体感、结果或保证。你仍可基于已支持的业务事实与客户条件做自然的推荐、比较和选择判断，也可提供不依赖未知业务事实的一般领域建议；但不得把这些一般判断改写成该具体业务对象已经具备的事实。证据不足只约束对应结论的强度，不强制使用边界报告格式；按照下述判断与估计规则完成仍有依据的帮助，不要机械输出检索失败话术，也不要为了保持流畅而虚构缺失事实。',
    '`humanPresence.realization.canonicalPlan.semanticPermit` 是本轮客户可见语义贡献的穷尽许可；它与 Current Canonical Execution 中的 CURRENT_SEMANTIC_PERMIT 是同一份既有 Canonical Act selection 的结构化投影，不是第二 Planner/Selector。Role / Identity Persona 只有 EXPRESSION_ONLY_NO_SEMANTIC_DELTA 权限。',
    '`pcPolicy` 只承载 PC 明确配置且当前可见的 Language Policy、权限、服务边界和能力事实；它们约束如何安全实现已选 Acts，不能自行创建、扩大或延长当前行为。`styleGuidance` 不再进入普通 Generation，不能成为第二套 Persona HOW。`relationshipContext` 只提供真实关系上下文。历史 rolePresence / texture / antiAiCadence / surfaceBudget / turnShape / roleBehavior / expressionPlan 只保留在服务器诊断或兼容层，不参与普通 Generation。',
    'conversation.reality、priorSpeakerTurns、recentConversation、activeTask 和 memories 仅是只读连续事实；conversation.reality.exchangeStateBeforeCurrentReply 只描述本轮回复生成之前已存在的交换状态，不是当前回复的 completion 或继续权限。任何关于既往交互已经发生过什么的断言，都必须有这些 server-owned continuity evidence 支撑，缺少证据时不得自行补成历史事实。不得从这些事实额外创建当前轮 Acts、事实、权限或表达规则。recentConversation 中 speaker=ASSISTANT 的 verbatimEvidence 只证明先前实际说过什么，其 currentSurfaceAuthority=NONE：既往回复的开头、措辞、顺序、篇幅和组织方式都不是本轮表达示例，不能覆盖或稀释当前 Role / Identity Persona HOW。当前轮语义责任仍只由 humanPresence.realization 提供。',
    '【有依据的判断与有条件的估计】在本轮已选 Acts 内，具体事实、基于事实的选择判断、一般条件推断有不同的证据责任。可以用已知事实说明值得优先考虑或比较的方向；也可以给出一般领域中有依据的趋势、可能原因和有用的条件判断。条件推断必须把决定结论的未知前提保持为假设，说明它如何影响判断，不得暗示当前对象已经满足该前提；如果结论仍是在声称某个具体对象已具备未知属性、性能或确定结果，即使加上“通常/估计/大概/可能”也仍需该对象的证据。不要把缺少确定保证误解为不能提供任何判断，不要把“不能保证”单独当作帮助。判断应实际回应当前目标，给出能改变选择或行动的依据、关键条件或核对方法，不能只说“综合考虑实际情况”。',
    '【自然实现而非边界模板】普通咨询先完成当前可回答的判断、事实或行动，必要的不确定性紧随对应结论；不要默认逐轮输出“能确认/不能确认/判断因素”的固定报告，也不要为自然化删除客户明确要求的事实与推断区分。客户明确问证据能否证明某个结论时，应正面回答并保留该区分；客户只是要大致方向时，可以自然说明有依据的倾向及最关键的条件，无需罗列所有理论风险。不要从客户的一项条件岔开到无关健康劝告、销售或服务承诺。表面组织属于 HOW：当同一实际消息里已经存在明显不同的已授权贡献层（例如已知事实 → 判断/不确定性 → 可操作核对方法），优先用自然短段落把层次分开，通常两到三段即可；这只是可读性偏好，不是固定段数、句数或消息气泡配额。短回答或语义连续时保持一段更自然。段落换行不得新增/删除 Act、改变 Grounding、补写事实或把一个条件与其结论拆成不同含义。',
    '一般知识和普通话题默认可以正常回答；缺少本店具体数据不妨碍在已选 Acts 内提供直接相关、可操作的一般知识、条件判断或核对步骤。缺失或只部分命中的业务知识只限制依赖该缺口的具体结论强度，不应把整轮问题变成拒答，也不应把已被 Knowledge 支持的相邻事实一并判废。公共知识可解释一般机制、趋势、可能性和核对方法，不能证明本店商品参数、尺码、价格、库存、实际订单原因、物流状态、售后期限或已经执行的操作；客户表达的经历可按客户陈述承接，不能据此编造后台事实。模型已有的一般知识不等于本轮联网检索；只有 Runtime 实际提供了外部检索结果/来源证据时才能把它当作当前网络信息并说明来源，没有这种 evidence 时不得声称上网查到、实时搜索或已经核实。PC 明确配置的语言政策、权限、服务边界和能力继续生效。',
    'URL 只在当前知识明确提供且标记为可分享时才对客户输出；不得从名称、描述或常识自行拼接链接。',
    '角色服务范围只说明可以围绕哪些事情提供帮助，不自动证明某个产品能力；产品能力仍必须来自当前可见的 server-owned Knowledge、Policy、Permission 或 Capability truth。',
    buildRoleIdentityPersonaSystemSection(generationGuidance),
    buildCurrentCanonicalExecutionSystemSection(humanPresence.realization),
    buildResponseEffortDepthSystemSection(humanPresence.realization),
    buildGivenNewRealizationEconomySystemSection(humanPresence.realization),
    '普通 HVE 的机器输出协议固定为 HVE_REPLY_V2：{"version":"HVE_REPLY_V2","segments":[{"text":"整条实际发送消息","units":[{"text":"这段客户可见语义文本","usedGroundingRefs":[],"bindings":[{"actId":"当前 canonicalPlan 已选 Act 的真实 id","actType":"对应真实 Act type","groundingRefs":[]}]}]}]}。segments 中每个元素仍是一条实际发送消息，由你按自然交流节奏直接决定 1/N 条，不存在固定配额。',
    'HVE_REPLY_V2 的 units 是同一实际消息的 semantic binding，不是额外展示层：每个 segment.text 必须严格等于该 segment.units[].text 按原顺序直接拼接；客户可见文本不能出现在 units 之外。每个 unit.bindings 只能引用 humanPresence.realization.canonicalPlan 当前已选 Act 的真实 id/type，并列出该 unit 实际共同完成的全部 selected Acts。Required 的客户可见 Act（STOP 这种纯控制 Act 除外）必须至少出现在一个 unit binding 中；preferred/optional 只在实际实现时绑定。unit.usedGroundingRefs 是该 unit.text 实际消费的全部 server-owned Grounding evidence refs 的完整集合，不是候选池：没有消费 Grounding 时必须为 []；同一 unit 同时使用多个 evidence 时必须全部列出，不能只声明最后一个商品/事实。',
    'Current Conversation Context 旁边的 HVE_REPLY_V2_PROTOCOL_REQUIREMENTS 是上述同一 Canonical Plan 的机器校验投影，不是第二 Planner：visibleRequiredBindings 中每个 id/type 都必须至少被一个实际实现它的 unit 绑定；controlOnlyRequiredActs 只执行控制语义，不创建客户可见 binding。不要因为两个 Required Acts 语义接近就漏掉其中一个，也不要为了覆盖清单虚构一个没有客户可见实现的 binding。',
    '若 binding 对应 GROUNDED_BUSINESS Act，则 groundingRefs 必须至少包含一个该 Act 自身 allowedGroundingRefs 中的真实 ref，且 unit.text 必须实际使用该 evidence 所支持的具体事实/候选；非 Grounded Act 的 groundingRefs 必须为空。每个 unit 全部 Grounded bindings 的 groundingRefs 并集必须与 unit.usedGroundingRefs 严格相等：任何实际使用但未绑定的 ref 都是 under-binding，任何绑定但未实际使用的 ref 都是 over-binding。若一段自然回复先引用商品 A 的事实、再给商品 B 的替代方向，可以保持同一 customer-visible segment，但必须让 semantic units / bindings 完整表达 A、B 的 Grounding ownership；不能给 generic 类别/材质/方向随便挂一个 Grounding ref 来冒充 Required Grounded completion。',
    '只返回这个 JSON object，不要返回 Markdown 代码块、解释、内部计划、评分、诊断名称或 conformance 说明。返回值必须能被标准 JSON.parse 直接解析；segment.text/unit.text 中的换行、制表符必须作为合法 JSON 字符串转义。只有 segments 数组元素边界才是实际发送消息边界；units 只做语义绑定，不改变消息边界。',
    mode === 'PROTOCOL_RECOVERY_RETRY'
      ? '这是同一轮既有唯一 recovery call 的协议恢复分支，不是新增重试：保持相同 server-owned truth、humanPresence 和回答目标，只重新生成满足 HVE_REPLY_V2_PROTOCOL_REQUIREMENTS 的合法结构；不要做质量重写或额外扩展。'
      : mode === 'RECOVERY_RETRY' || mode === 'AVAILABILITY_RECOVERY_TEXT'
        ? '这是同一轮唯一一次模型可用性恢复。保持相同 server-owned truth、humanPresence 和回答目标，正常重新生成 HVE_REPLY_V2；不要做质量重写或额外扩展。'
        : '',
  ].filter(Boolean).join('\n\n');
}

/**
 * Salient, current-only projection of execution truth already selected by the
 * Canonical Plan. This does not select or forbid an Act. It prevents a static
 * explanation of mutually exclusive branches from competing with the actual
 * branch hidden inside the context transport.
 */
export function buildHveReplyV2ProtocolRequirementProjection(
  realization: CustomerServiceFinalModelFacingHumanTurnV1['realization'],
) {
  const requiredActs = realization.canonicalPlan.requiredActs || [];
  const selectedActs = [
    ...requiredActs,
    ...(realization.canonicalPlan.preferredActs || []),
    ...(realization.canonicalPlan.optionalActs || []),
  ];
  return {
    authority: 'LOSSLESS_CANONICAL_PROTOCOL_PROJECTION' as const,
    visibleRequiredBindings: requiredActs
      .filter((act) => String(act.type) !== 'STOP')
      .map((act) => ({ actId: String(act.id), actType: String(act.type) })),
    primaryTaskSurface: (() => {
      if (realization.primary.contribution !== 'RECOMMEND') return null;
      const groundedRecommendation = requiredActs.find((act) => String(act.type) === 'RECOMMEND_GROUNDED_ITEM'
        && (act.allowedGroundingRefs || []).length > 0);
      return groundedRecommendation ? {
        authority: 'DERIVED_FROM_EXISTING_PRIMARY_AND_REQUIRED_ACT' as const,
        contribution: 'RECOMMEND' as const,
        requiredActId: String(groundedRecommendation.id),
        requiredActType: 'RECOMMEND_GROUNDED_ITEM' as const,
        firstSubstantiveUnitMustBindRequiredAct: true as const,
      } : null;
    })(),
    controlOnlyRequiredActs: requiredActs
      .filter((act) => String(act.type) === 'STOP')
      .map((act) => ({ actId: String(act.id), actType: String(act.type) })),
    selectedBindingUniverse: selectedActs
      .filter((act) => String(act.type) !== 'STOP')
      .map((act) => ({
        actId: String(act.id),
        actType: String(act.type),
        necessity: act.necessity,
        allowedGroundingRefs: [...(act.allowedGroundingRefs || [])],
      })),
    invariant: 'EVERY_REQUIRED_VISIBLE_ACT_MUST_HAVE_REAL_CUSTOMER_VISIBLE_REALIZATION' as const,
    groundingUsageInvariant: 'UNIT_USED_GROUNDING_REFS_MUST_EQUAL_GROUNDED_BINDING_REF_UNION' as const,
  };
}

export function buildCurrentCanonicalExecutionSystemSection(
  realization: CustomerServiceFinalModelFacingHumanTurnV1['realization'],
) {
  const customerInput = realization.selectedComponents.customerInput;
  const completion = realization.canonicalPlan.completion;
  const selectedCanonicalActs = [
    ...(realization.canonicalPlan.requiredActs || []),
    ...(realization.canonicalPlan.preferredActs || []),
    ...(realization.canonicalPlan.optionalActs || []),
  ];
  const projectedReception = realization.canonicalPlan.receptionContribution;
  const semanticPermit = realization.canonicalPlan.semanticPermit;
  const selectedRelationalReceptionActs = Array.isArray(projectedReception?.actTypes)
    ? projectedReception.actTypes.map((type) => String(type)).filter(Boolean)
    : selectedCanonicalActs
      .filter((act) => [
        'PRESENCE_ACK', 'LIGHT_ACK', 'EMOTIONAL_ACK', 'REASSURE',
        'RELATIONSHIP_MAINTENANCE', 'ACKNOWLEDGE_PREFERENCE', 'ACKNOWLEDGE_PROBLEM',
      ].includes(String(act?.type || '')))
      .map((act) => String(act.type));
  const currentSemanticPermit = {
    authority: semanticPermit?.authority || 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY',
    selectedActTypes: Array.isArray(semanticPermit?.selectedActTypes)
      ? semanticPermit.selectedActTypes.map((type) => String(type)).filter(Boolean)
      : selectedCanonicalActs.map((act) => String(act?.type || '')).filter(Boolean),
    receptionContribution: projectedReception?.selected ? 'SELECTED' : 'NOT_SELECTED',
    customerVisibleContributionScope: semanticPermit?.customerVisibleContributionScope || realization.constraints?.semanticContributionScope || 'SELECTED_CANONICAL_ACTS_ONLY',
    personaSemanticDelta: semanticPermit?.personaSemanticDelta || 'EXPRESSION_ONLY_NO_SEMANTIC_DELTA',
  };
  const customerInputExecution = customerInput.selected
    ? `本轮 customerInput=SELECTED，disposition=${customerInput.disposition}，只实现 canonicalPlan 已经选择的对应客户输入 Act，不扩大提问范围。`
    : '本轮 canonicalPlan 未选择任何 customer-input Act（customerInput=NOT_SELECTED / NO_NEW_CUSTOMER_INPUT_DEPENDENCY_THIS_TURN）。当前生成没有新的客户输入权限：不得新增需要客户回答、补充、确认、取舍或继续互动才能完成的行为，也不得另开服务入口；只完成 canonicalPlan 已选贡献后结束本次生成。';
  const semanticPermitExecution = [
    `CURRENT_SEMANTIC_PERMIT=${JSON.stringify(currentSemanticPermit)}`,
    'CURRENT_SEMANTIC_PERMIT 是本轮客户可见 speech-act / proposition 的穷尽语义授权，不是候选建议。任何能够单独承担互动功能的客户可见成分都属于语义贡献，而不是 Persona 风格。Role / Identity 只能在 selectedActTypes 内改变措辞、语气、强调和自然组织，不能增加在中性实现同一组 selected Acts 时可完全删除、且删除后不损失这些 Acts 实际判断、信息、风险、选择、行动或已选关系任务的内容。',
    selectedRelationalReceptionActs.length
      ? `receptionContribution=SELECTED(${[...new Set(selectedRelationalReceptionActs)].join(' / ')})；只允许实现这些已选 reception Acts 自己的语义。`
      : 'receptionContribution=NOT_SELECTED；本轮没有独立 relation/reception semantic owner，Persona 不能产生额外社会互动贡献。',
  ].join('\n');
  const completionExecution = completion === 'ALLOW_CONTINUATION'
    ? '本轮 completion=ALLOW_CONTINUATION 只是会话状态，不是当前回复的继续权限，也不授予任何 Act。当前回复仍以 canonicalPlan 已选 Acts 为全部语义范围；完成这些 Acts 后结束本次生成。'
    : `本轮 completion=${completion} 是当前轮终止边界。只实现 canonicalPlan.requiredActs 已选择的终止所需语义；required Acts 完成后立即结束本次生成，preferred / optional 不再可实现。recentConversation、priorSpeakerTurns、continuity 与已经接受的方向只保留为事实证据；除非 required Act 本身需要，否则不得再把它们展开成新的判断、建议、复述、客户输入或服务入口。`;
  return [
    '【Current Canonical Execution — This Turn Only】',
    customerInputExecution,
    semanticPermitExecution,
    completionExecution,
  ].join('\n');
}

/**
 * R2.3 derived response-effort execution. This consumes only the already-owned
 * Response Target / Canonical completion projection. It cannot select content,
 * create an Act, or impose a character/sentence/message/option quota.
 */
export function buildResponseEffortDepthSystemSection(
  realization: CustomerServiceFinalModelFacingHumanTurnV1['realization'],
) {
  const effort = realization.effortDepth;
  const modeExecution = (() => {
    switch (effort.mode) {
      case 'MINIMAL_DIRECT':
        return 'MINIMAL_DIRECT：只承载完成当前 selected Acts 所必需的客户可见价值；不要自行追加相邻知识、教程式解释或额外服务入口。';
      case 'SUMMARY_CURRENT_FOCUS':
        return 'SUMMARY_CURRENT_FOCUS：覆盖当前 focus 的必要全貌，但保持在总结抽象层；完整覆盖不等于逐点深挖，局部细节只在缺少它会失真时展开。';
      case 'CONCRETE_CURRENT_FOCUS':
        return 'CONCRETE_CURRENT_FOCUS：把已选贡献做到具体、可判断或可行动，提供使结论真正可用的必要事实、条件或区别；不要因为“简短”而退化成泛泛方向。';
      case 'DETAILED_CURRENT_FOCUS':
        return 'DETAILED_CURRENT_FOCUS：在当前 focus 内充分展开必要原因、条件、步骤、权衡或风险；不得用通用短答偏好压掉用户已要求的细节。';
      case 'EXHAUSTIVE_CURRENT_FOCUS':
        return 'EXHAUSTIVE_CURRENT_FOCUS：在 Canonical 已授权范围内完整展开当前 focus 的相关维度、权衡、条件、限制与必要说明；不存在固定候选数、固定篇幅或固定结构上限。';
      case 'DIRECTIONAL_CURRENT_FOCUS':
      default:
        return 'DIRECTIONAL_CURRENT_FOCUS：直接给当前问题可用的方向或结论，并补足使其成立/可执行所必需的支持；不要自动升级成全面教程或穷尽相邻主题。';
    }
  })();
  const coverageExecution = effort.coverageObligation === 'COMPLETE_CURRENT_FOCUS'
    ? 'coverage=COMPLETE_CURRENT_FOCUS：当前 focus 内所有由现有 Authority 要求覆盖的部分都要完成；不能因一般性的简洁倾向提前停止。'
    : 'coverage=SUFFICIENT_CURRENT_FOCUS：达到当前 selected Acts、requiredDelta 与决策需要所要求的充分程度即可；不得自行升级为全面覆盖。';
  return [
    '【Response Effort / Depth — Derived This Turn Only】',
    `RESPONSE_EFFORT_DEPTH=${JSON.stringify(effort)}`,
    '该 contract 只把既有 CANONICAL_RESPONSE_TARGET 的 requestedSpecificity 与 coverageObligation 转成 Generation 可执行的投入/深度语义；semanticAuthority=NO_INDEPENDENT_SEMANTIC_AUTHORITY，不能新增、删除或替换 Canonical Acts，也不拥有 Act 排序 Authority，不能改变事实、Grounding、权限或 completion。',
    modeExecution,
    coverageExecution,
    '停止依据只有 CANONICAL completion 与当前 required Acts / requiredDelta / coverageObligation 是否已经满足：满足后自然结束；preferred / optional 不会因本 contract 变成必做项，未满足的 Required 也不能为了更短而漏掉。fixedQuotaAuthority=NONE：不得把历史 surfaceBudget / turnShape / Humanity 指标、字符数、句数、segments 数或候选数当作输出上限。',
  ].join('\n');
}

/**
 * Compile only the current Persona semantic capability into the system channel.
 * Persisted Role → Identity Prompt text is intentionally kept out of this section
 * and travels once as expression source data inside Current Conversation Context.
 */

/**
 * Current-turn semantic economy over already-owned Canonical WHAT. This is not a length, sentence,
 * option-count or style controller. Customer-owned givens remain reasoning premises by default;
 * they become customer-visible only when their explicit realization is itself necessary to execute
 * a selected Act or materially changes its downstream judgment/risk/choice/action.
 */
export function buildGivenNewRealizationEconomySystemSection(
  realization: CustomerServiceFinalModelFacingHumanTurnV1['realization'],
) {
  const receptionSelected = Boolean(realization.canonicalPlan.receptionContribution?.selected);
  const mustAdd = realization.primary.requiredDelta !== 'NONE' || realization.primary.mustAddBeyondKnown;
  return [
    '【Given-New Realization Economy — This Turn Only】',
    'GIVEN_INFORMATION=客户本轮已经提供、recentConversation 已建立、continuity/memories 已证明的事实、约束、观察、偏好、决定与已接受方向。它们默认作为 reasoning premise 保持 implicit，不能仅为了表示理解、显得完整、铺垫自然或重复证明记忆而重新变成 customer-visible contribution。',
    '只有以下语义必要性成立时才显式承载一个 GIVEN premise：它本身就是当前 selected Act 要确认/纠正/挑战的目标；省略会破坏必要指代或条件作用域；或者对该 premise 的新解释会实际改变本轮 selected Act 的判断、风险、选择、动作或结论。否则直接从 NEW_VALUE 开始。',
    '对任何显式 restatement / interpretation / acknowledgement 做功能删除测试：如果拿掉它以后，本轮 selected Acts 的实际判断、信息、风险、选择、动作、必要条件与已授权关系任务完全不变，则它不是本轮需要的新贡献，应保持 implicit。这个测试按语义功能执行，不按词、句首、领域或固定模板执行。',
    receptionSelected
      ? '当前 Canonical 已选择 reception contribution；只允许该已选 Act 自己需要的 reception 语义，不能借此重复全部 customer-owned premises。'
      : '当前 Canonical 未选择 reception contribution；温度、耐心和自然感只能体现在 selected value Acts 的 HOW 中，不能额外生成独立 acknowledgement / reassurance / normalization / relationship proposition。',
    mustAdd
      ? '本轮存在真实 requiredDelta / mustAddBeyondKnown：新增必须落在 NEW_VALUE；复述、重命名、重新解释但不改变 downstream decision 的内容不能冒充该增量。'
      : '本轮没有强制新增量：不需要为了制造“新内容感”扩展无关相邻建议；只完成现有 selected Acts 的当前需要。',
  ].join('\n');
}

export function buildRoleIdentityPersonaSystemSection(
  guidance: CustomerServiceFinalModelFacingHumanTurnV1['surface']['generationGuidance'],
) {
  const projection = guidance.semanticProjection || {
    authority: 'DERIVED_FROM_SELECTED_CANONICAL_ACTS_ONLY' as const,
    selectedActTypes: [] as string[],
    selectedReceptionActTypes: [] as string[],
    unselectedSemanticInstructions: 'INERT_THIS_TURN' as const,
    sourceTextRole: 'EXPRESSION_SOURCE_DATA_ONLY' as const,
  };
  const personaCapability = {
    authority: projection.authority,
    selectedActTypes: [...projection.selectedActTypes],
    selectedReceptionActTypes: [...projection.selectedReceptionActTypes],
    semanticAuthority: guidance.semanticAuthority,
    unselectedSemanticInstructions: projection.unselectedSemanticInstructions,
  };
  return [
    '【Current Role / Identity Persona HOW】',
    `PERSONA_SEMANTIC_CAPABILITY=${JSON.stringify(personaCapability)}`,
    `PERSONA_SURFACE_PROFILE=${JSON.stringify(guidance.surfaceProfile)}`,
    'ordinary Generation 不接收持久化 Role / Identity 的 free-form Prompt 原文。Persona 运行时只获得上面的结构化 surface profile，用于已选 Acts 内的措辞、语体、句式和节奏表达；它不拥有 acknowledgement、reassurance、relationship、humor、question、advice 或其它新增 WHAT。',
    projection.selectedReceptionActTypes.length
      ? `Selected reception Acts: ${projection.selectedReceptionActTypes.join(' / ')}. Persona may realize only those selected reception semantics.`
      : 'Selected reception Acts: none. Persona has no independent relation/reception speech-act authority this turn.',
  ].join('\n');
}

/**
 * Runtime Persona transport is a typed surface-only projection. Persisted free-form
 * Role / Identity Prompt text remains server-side configuration/audit data and is
 * deliberately absent from ordinary Generation transport.
 */
export function buildRoleIdentityPersonaSourceData(
  guidance: CustomerServiceFinalModelFacingHumanTurnV1['surface']['generationGuidance'],
) {
  return {
    authority: guidance.surfaceProfile.authority,
    semanticAuthority: guidance.semanticAuthority,
    source: guidance.surfaceProfile.source,
    profile: { ...guidance.surfaceProfile },
  };
}

/**
 * Pure final payload projection shared by ordinary primary and availability
 * recovery prompts. Exported for architecture verification; it does not add an
 * execution path or a second Authority.
 */
export function buildHveModelFacingGenerationFrame(
  contract: CustomerServiceRuntimeReplyContract,
  frame: CustomerServiceNlgSemanticFrameV1,
) {
  const role = contract.persona.resolvedRoleIdentity;
  const conversationReality = frame.humanTurnRealization.conversationReality;
  const recentConversation = contract.generationContext.conversationHistory.map((item) => ({
    ...item,
    continuityAuthority: 'LIVED_CONVERSATION_EVIDENCE_ONLY' as const,
    ...(item.role === 'ASSISTANT'
      ? { currentSurfaceAuthority: 'NONE' as const }
      : {}),
  }));
  const recentConversationTexts = recentConversation
    .map((item) => normalizeContinuityEvidenceText(item.content))
    .filter(Boolean);
  const recentAssistantTexts = recentConversation
    .filter((item) => item.role === 'ASSISTANT')
    .map((item) => normalizeContinuityEvidenceText(item.content))
    .filter(Boolean);
  const priorSpeakerTurns = conversationReality.recentAssistantMoves
    .filter((item) => !isContinuityEvidenceAlreadyInRawConversation(item.excerpt, recentAssistantTexts))
    .map((item) => ({
      turn: item.turn,
      excerpt: item.excerpt,
      accepted: item.accepted,
      rejected: item.rejected,
      continuityAuthority: 'LIVED_CONVERSATION_EVIDENCE_ONLY' as const,
      currentSurfaceAuthority: 'NONE' as const,
    }));
  const relevantMemories = conversationReality.relevantMemories
    .filter((item) => !isContinuityEvidenceAlreadyInRawConversation(item.value, recentConversationTexts))
    .map((item) => ({ ...item }));
  return {
    schemaVersion: 2,
    speaker: projectModelFacingSpeaker(contract, frame),
    conversation: {
      latestCustomerMessage: contract.groundedContext.latestCustomerMessage,
      // Existing Conversation Reality is the sole server-owned continuity truth.
      // Generation previously received its evidence payloads but not the explicit
      // exchange-state facts, leaving an avoidable gap on genuinely fresh turns.
      // This is a projection only: no new planner, gate, judge or expression rule.
      reality: {
        authority: conversationReality.authority,
        currentTurn: conversationReality.currentTurn,
        priorConversationMessages: conversationReality.priorConversationMessages,
        exchangeStateBeforeCurrentReply: conversationReality.exchange.state,
        priorAssistantTurns: conversationReality.exchange.priorAssistantTurns,
      },
      recentConversation,
      priorSpeakerTurns,
      // The Semantic Frame already applies the Canonical Plan's least-privilege
      // active-task need. Do not re-expose a stale task from Conversation Reality
      // after the selected Acts have declared that this turn does not consume it.
      activeTask: frame.context.activeTask ? { ...frame.context.activeTask } : null,
      relevantMemories,
    },
    humanPresence: compileCustomerServiceFinalModelFacingHumanTurn(contract, frame),
    answerAuthority: projectModelFacingAnswerAuthority(frame),
    knowledge: {
      // Semantic Frame already applies the Canonical Plan's grounding need.
      // Do not bypass that least-privilege decision by re-exposing every retrieved
      // fact/entry from the Runtime contract on turns that selected no grounded Act.
      verifiedFacts: frame.grounding.facts.map((item) => item),
      selectedEntries: frame.grounding.knowledge.map((item) => ({ ...item })),
    },
    pcPolicy: {
      languagePolicyConstraints: [...contract.businessContext.languagePolicyConstraints],
      permissions: role?.serviceContext.permissions || null,
      serviceBoundary: role?.serviceContext.serviceBoundary || null,
      // Capability data is permission/execution truth, not an invitation to use
      // every configured capability. Consume the Semantic Frame's current-Plan
      // projection instead of reopening the full orchestration collection.
      capabilities: projectConfiguredCapabilities(frame.hardBoundaries.capabilityLimits),
    },
    // Response assets are model-facing only when the existing Canonical grounding
    // requirements selected them for this turn.
    responseAssets: frame.responseAssets.map((item) => ({ ...item })),
  };
}


function projectModelFacingAnswerAuthority(frame: CustomerServiceNlgSemanticFrameV1) {
  // Production Semantic Frames compiled by v1.98+ always carry answerAuthority.
  // Historical/synthetic verifier frames may predate that projection. Treat absence
  // as an inert, least-privilege compatibility state instead of dereferencing it.
  // This fallback cannot create Grounding permission or refs and is not a second
  // Answer Authority; current production semantics still come from frame.answerAuthority.
  if (!frame.answerAuthority) {
    return {
      schemaVersion: 2 as const,
      authority: 'PROJECTION_ONLY' as const,
      mode: 'NO_BUSINESS_GROUNDING_REQUIRED' as const,
      evidenceState: 'NOT_REQUIRED' as const,
      unknownStrategy: 'NOT_APPLICABLE' as const,
      knowledgeRequirement: 'NOT_REQUIRED' as const,
      customerContextAllowed: true as const,
      generalGuidanceAllowed: true as const,
      currentScopeBusinessFactAllowed: false,
      allowedGroundingRefs: [] as string[],
      evidenceBoundaryRequired: false,
      rewritePreservation: 'AUTHORIZED_CONTENT_ONLY' as const,
    };
  }
  return {
    ...frame.answerAuthority,
    allowedGroundingRefs: Array.isArray(frame.answerAuthority.allowedGroundingRefs)
      ? [...frame.answerAuthority.allowedGroundingRefs]
      : [],
  };
}

/** Descriptive verification alias; both names reference the same pure projection. */
export const projectCustomerServiceModelFacingGenerationFrame = buildHveModelFacingGenerationFrame;

/**
 * Transport projection only. The complete Final HumanTurn remains available to
 * server diagnostics. The raw persisted Persona source text is intentionally absent here. A typed
 * surface-only Persona projection is carried once as context data while generationGuidance
 * is removed from humanPresence.surface so no parallel Persona instruction channel exists.
 */
export function projectHveModelFacingContextTransport(
  modelFrame: ReturnType<typeof buildHveModelFacingGenerationFrame>,
) {
  const { generationGuidance: _generationGuidance, ...surface } = modelFrame.humanPresence.surface;
  const personaSurfaceProfile = buildRoleIdentityPersonaSourceData(_generationGuidance);
  const recentConversation = modelFrame.conversation.recentConversation.map((item) => {
    const { role, content, ...authority } = item;
    return {
      ...authority,
      speaker: role,
      verbatimEvidence: content,
    };
  });
  const priorSpeakerTurns = modelFrame.conversation.priorSpeakerTurns.map((item) => {
    const { excerpt, ...evidence } = item;
    return {
      ...evidence,
      speaker: 'ASSISTANT' as const,
      verbatimEvidence: excerpt,
    };
  });
  return {
    ...modelFrame,
    personaSurfaceProfile,
    conversation: {
      ...modelFrame.conversation,
      recentConversation,
      priorSpeakerTurns,
    },
    humanPresence: {
      ...modelFrame.humanPresence,
      surface,
    },
  };
}



function normalizeContinuityEvidenceText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Structural de-duplication only: if the exact normalized evidence text is already
 * represented by the selected raw conversation, do not send a second dossier-like
 * copy through priorSpeakerTurns / memories. This does not perform semantic matching,
 * ranking, planning, or current-turn act selection.
 */
export function isContinuityEvidenceAlreadyInRawConversation(value: unknown, normalizedRawTexts: string[]) {
  const evidence = normalizeContinuityEvidenceText(value);
  if (!evidence) return false;
  const isBoundedExcerpt = /(?:\.{3}|…)$/.test(evidence);
  const comparableEvidence = isBoundedExcerpt
    ? evidence.replace(/(?:\.{3}|…)$/, '').trim()
    : evidence;
  if (!comparableEvidence) return false;
  return normalizedRawTexts.some((raw) => (
    raw === evidence
    || raw.includes(evidence)
    || (isBoundedExcerpt && raw.startsWith(comparableEvidence))
  ));
}

function projectModelFacingSpeaker(
  contract: CustomerServiceRuntimeReplyContract,
  frame: CustomerServiceNlgSemanticFrameV1,
) {
  const role = contract.persona.resolvedRoleIdentity;
  const projection = role?.speakerProjection || contract.persona.speakerProjection || null;
  const authorizedDisclosure = projectAuthorizedSpeakerDisclosure(frame);
  return {
    authority: 'PC_RESOLVED_ROLE_IDENTITY_CONTEXT' as const,
    speakerSource: projection?.source || null,
    authorizedDisclosure,
    channel: role?.channel || contract.businessContext.accountProfile?.channel || null,
    configurationFingerprint: role?.provenance.configurationFingerprint || contract.provenance.configurationHash,
  };
}

function projectAuthorizedSpeakerDisclosure(frame: CustomerServiceNlgSemanticFrameV1) {
  if (frame.serviceRealization.identity.mode === 'NONE') return null;
  return {
    authority: 'EXISTING_IDENTITY_REALIZATION' as const,
    mode: frame.serviceRealization.identity.mode,
    aiIdentity: frame.identity.aiIdentity,
    businessLabel: frame.identity.businessLabel,
    relationLabel: frame.identity.relationLabel,
    publicName: frame.identity.publicName,
    surfaceLabel: frame.identity.surfaceLabel,
    allowedSurfaceLabels: [...frame.identity.allowedSurfaceLabels],
    serviceScope: frame.identity.serviceScope,
  };
}


function projectConfiguredCapabilities(
  value: unknown,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const capabilities = value as CustomerServiceRuntimeReplyContract['orchestrationPlan']['serviceCapabilities'];
  const hasRuntimeConfiguration = capabilities.configurationStatus !== 'NOT_CONFIGURED'
    || capabilities.source !== 'NOT_CONFIGURED'
    || Object.keys(capabilities.actionLimits || {}).length > 0
    || capabilities.executionReceipts.length > 0;
  return hasRuntimeConfiguration ? capabilities : null;
}

function isCanonicalSourceBoundSummaryFrame(frame: CustomerServiceNlgSemanticFrameV1) {
  const target = frame.humanTurnRealization.turnComposition.semanticDelta.responseTarget;
  return frame.context.summarySource.mode === 'BOUNDED_CONVERSATION_HISTORY'
    && frame.context.summarySource.transformMode === 'SOURCE_BOUND_SUMMARY'
    && target.requestedSpecificity === 'SUMMARY'
    && target.requiredDelta === 'COMPLETE_CURRENT_FOCUS'
    && target.evidence.includes('UNDERSTANDING_GOAL:SUMMARIZE_CONVERSATION');
}

function buildCanonicalSourceBoundSummaryPrompt(
  contract: CustomerServiceRuntimeReplyContract,
  frame: CustomerServiceNlgSemanticFrameV1,
  mode: 'PRIMARY' | 'RECOVERY_RETRY',
) {
  const target = frame.humanTurnRealization.turnComposition.semanticDelta.responseTarget;
  const sourceUnits = frame.context.summarySource.messages.map((item) => ({
    sourceId: item.sourceId,
    turn: item.turn,
    role: item.role,
    content: item.content,
  }));
  const speaker = projectModelFacingSpeaker(contract, frame);
  const humanPresence = compileCustomerServiceFinalModelFacingHumanTurn(contract, frame);
  const generationGuidance = humanPresence.surface.generationGuidance;
  const { generationGuidance: _generationGuidance, ...modelFacingSurface } = humanPresence.surface;
  const style = {
    surface: { ...modelFacingSurface },
    authorizedDisclosure: speaker.authorizedDisclosure ? { ...speaker.authorizedDisclosure } : null,
    channel: speaker.channel,
  };
  return {
    system: [
      `HVE SOURCE_BOUND_SUMMARY / ${mode}.`,
      '本轮只总结 SOURCE_UNITS 中真实出现的内容，不从角色背景、常识或业务知识补历史事实。',
      buildRoleIdentityPersonaSystemSection(generationGuidance),
      '优先返回 JSON object，顶层只放 items。每项包含 sources 与 summaryText；summaryText 是给客户看的自然总结。',
      'sources 中每项包含 sourceRef 和 evidenceSpans，evidenceSpans 必须来自对应 sourceRef 原文。结构化来源绑定用于 provenance 观测，不得改变 SOURCE_UNITS 作为唯一历史事实来源，也不得成为客户回复发送资格。',
      mode === 'RECOVERY_RETRY' ? '这是模型可用性恢复调用；SOURCE_UNITS、总结目标和事实边界不变。' : '',
    ].filter(Boolean).join('\n'),
    user: [
      `CURRENT_REQUEST: ${frame.context.latestCustomerMessage}`,
      `RESPONSE_TARGET: ${JSON.stringify({ focus: target.focus, requestedSpecificity: target.requestedSpecificity, requiredDelta: target.requiredDelta })}`,
      `SOURCE_UNITS: ${JSON.stringify(sourceUnits)}`,
      `ROLE_EXPRESSION_STYLE: ${JSON.stringify(style)}`,
      `PERSONA_SURFACE_PROFILE: ${JSON.stringify(buildRoleIdentityPersonaSourceData(generationGuidance))}`,
      'OUTPUT_SCHEMA: {"items":[{"sources":[{"sourceRef":"S1","evidenceSpans":["原文片段"]}],"summaryText":"自然总结"}]}',
    ].join('\n'),
  };
}
